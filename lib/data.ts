import "server-only";
import { unstable_cache } from "next/cache";
import { getConfig, type Config } from "./config";
import { getFx } from "./fx";
import { Odoo } from "./odoo";
import { utcToLocalDate } from "./periods";
import type { DashboardData, FxInfo, Goal, InvoiceStatus, Order } from "./types";
import { demoData } from "./demo";

type M2O = [number, string] | false;
const m2o = (v: M2O) => (v ? v[1] : "");

interface RawOrder {
  id: number;
  name: string;
  client_order_ref: string | false;
  partner_id: M2O;
  user_id: M2O;
  date_order: string;
  amount_untaxed: number;
  currency_id: M2O;
  invoice_status: InvoiceStatus;
  currency_rate?: number;
  invoice_ids?: number[];
}

const ORDER_FIELDS = [
  "name", "client_order_ref", "partner_id", "user_id", "date_order",
  "amount_untaxed", "currency_id", "currency_rate", "invoice_status",
];

// Company name + currency per Odoo user, kept on a warm instance to save round trips.
const companyCache = new Map<number, { name: string; currency: string }>();

export function toInr(amount: number, currency: string, fx: FxInfo) {
  const rate = fx.inrPer[currency];
  if (!rate) throw new Error(`No exchange rate for ${currency} → INR`);
  return amount * rate;
}

export function convertGoals(cfg: Config, fx: FxInfo): Goal[] {
  return cfg.goals
    .map((g) => ({ amount: toInr(g.amount, g.currency, fx), originalAmount: g.amount, currency: g.currency }))
    .sort((a, b) => a.amount - b.amount);
}

async function loadFromOdoo(cfg: Config, yearStart: string, yearEnd: string) {
  const odoo = new Odoo(cfg.odoo);
  const uid = await odoo.authenticate();
  let company = companyCache.get(uid);
  if (!company) {
    const [user] = await odoo.searchRead<{ company_id: M2O }>("res.users", [["id", "=", uid]], ["company_id"]);
    const [c] = await odoo.searchRead<{ currency_id: M2O }>(
      "res.company", [["id", "=", user.company_id ? user.company_id[0] : 0]], ["currency_id"],
    );
    company = { name: m2o(user.company_id), currency: m2o(c?.currency_id ?? false) || "INR" };
    companyCache.set(uid, company);
  }
  const companyCurrency = company.currency;
  const fields = ORDER_FIELDS;

  // sale.order.currency_rate is Odoo's company-currency → order-currency rate on the order date.
  /** Amount in company currency at Odoo's order-date rate (falls back to the order currency if no rate). */
  const companyAmount = (o: RawOrder, currency: string) =>
    currency === companyCurrency ? { value: o.amount_untaxed, currency }
      : o.currency_rate ? { value: o.amount_untaxed / o.currency_rate, currency: companyCurrency }
      : { value: o.amount_untaxed, currency };

  const toOrder = (o: RawOrder) => {
    const currency = m2o(o.currency_id) || companyCurrency;
    return {
    id: o.id,
    ref: o.name,
    customerRef: o.client_order_ref || "",
    customer: m2o(o.partner_id),
    salesperson: m2o(o.user_id),
    date: utcToLocalDate(o.date_order, cfg.timeZone),
    originalAmount: o.amount_untaxed,
    currency,
    base: companyAmount(o, currency),
    invoiceStatus: o.invoice_status,
    };
  };

  // Widen the UTC query window by a day each side, then trim on local dates.
  const shift = (d: string, days: number) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const confirmed = ["state", "in", ["sale", "done"]];

  // One request at a time: Odoo Online rate-limits parallel bursts.
  const rawBooked = await odoo.searchRead<RawOrder>("sale.order",
    [confirmed, ["date_order", ">=", shift(yearStart, -1)], ["date_order", "<", shift(yearEnd, 1)]],
    fields, "date_order desc");
  const rawOpen = await odoo.searchRead<RawOrder>("sale.order",
    [confirmed, ["invoice_status", "!=", "invoiced"]],
    fields, "date_order desc");
  // Fully invoiced orders that have at least one invoice dated on/after the year start.
  const rawInvoiced = await odoo.searchRead<RawOrder>("sale.order",
    [confirmed, ["invoice_status", "=", "invoiced"], ["order_line.invoice_lines.move_id.invoice_date", ">=", yearStart]],
    [...fields, "invoice_ids"], "date_order desc");

  // An order counts as invoiced on the date of its last posted customer invoice.
  const invoiceIds = [...new Set(rawInvoiced.flatMap((o) => o.invoice_ids ?? []))];
  const invoices = invoiceIds.length
    ? await odoo.searchRead<{ id: number; name: string; invoice_date: string | false }>("account.move",
        [["id", "in", invoiceIds], ["state", "=", "posted"], ["move_type", "=", "out_invoice"]],
        ["name", "invoice_date"])
    : [];
  const invById = new Map(invoices.map((i) => [i.id, i]));

  const invoiced = rawInvoiced.flatMap((o) => {
    const invs = (o.invoice_ids ?? []).map((id) => invById.get(id)).filter((i) => i?.invoice_date);
    if (!invs.length) return [];
    const last = invs.map((i) => i!.invoice_date as string).sort().at(-1)!;
    return [{ ...toOrder(o), invoicedDate: last, invoiceRefs: invs.map((i) => i!.name) }];
  });

  return {
    company: company.name,
    booked: rawBooked.map(toOrder).filter((o) => o.date >= yearStart && o.date < yearEnd),
    invoiced: invoiced.filter((o) => o.invoicedDate >= yearStart && o.invoicedDate < yearEnd),
    open: rawOpen.map(toOrder),
  };
}

const lastGood = new Map<string, { raw: Awaited<ReturnType<typeof loadFromOdoo>>; at: string }>();

const cachedOdoo = unstable_cache(
  async (yearStart: string, yearEnd: string) => loadFromOdoo(getConfig(), yearStart, yearEnd),
  ["odoo-dashboard-v3"],
  { revalidate: 600, tags: ["odoo"] },
);

export async function getDashboardData(yearStart: string, yearEnd: string): Promise<DashboardData> {
  const cfg = getConfig();
  const fx = await getFx();
  const goals = convertGoals(cfg, fx);
  if (cfg.demo) return demoData(yearStart, yearEnd, fx, goals);

  let raw: Awaited<ReturnType<typeof loadFromOdoo>>;
  let stale: string | undefined;
  const key = `${yearStart}|${yearEnd}`;
  try {
    raw = await cachedOdoo(yearStart, yearEnd);
    lastGood.set(key, { raw, at: new Date().toISOString() });
  } catch (e) {
    // Odoo hiccup (usually rate limiting): fall back to the last successful load on this instance.
    const prev = lastGood.get(key);
    if (!prev) throw e;
    raw = prev.raw;
    stale = `Odoo didn't respond (${e instanceof Error ? e.message : e}); showing data from ${prev.at.slice(0, 16).replace("T", " ")} UTC.`;
  }
  // Already INR for an INR company; only a non-INR company currency (or a missing Odoo rate) needs the live rate.
  const conv = ({ base, ...o }: Omit<Order, "amount"> & { base: { value: number; currency: string } }): Order => ({
    ...o,
    amount: base.currency === "INR" ? base.value : toInr(base.value, base.currency, fx),
  });
  return {
    generatedAt: new Date().toISOString(),
    demo: false,
    stale,
    company: raw.company,
    yearStart,
    yearEnd,
    orders: raw.booked.map(conv),
    invoicedOrders: raw.invoiced.map(conv).sort((a, b) => b.invoicedDate!.localeCompare(a.invoicedDate!)),
    openOrders: raw.open.map(conv),
    goals,
    fx,
  };
}
