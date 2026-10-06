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
  invoice_ids?: number[];
}

const ORDER_FIELDS = [
  "name", "client_order_ref", "partner_id", "user_id", "date_order",
  "amount_untaxed", "currency_id", "invoice_status",
];

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
  const [user] = await odoo.searchRead<{ company_id: M2O }>("res.users", [["id", "=", uid]], ["company_id"]);

  const toOrder = (o: RawOrder) => ({
    id: o.id,
    ref: o.name,
    customerRef: o.client_order_ref || "",
    customer: m2o(o.partner_id),
    salesperson: m2o(o.user_id),
    date: utcToLocalDate(o.date_order, cfg.timeZone),
    originalAmount: o.amount_untaxed,
    currency: m2o(o.currency_id) || "INR",
    invoiceStatus: o.invoice_status,
  });

  // Widen the UTC query window by a day each side, then trim on local dates.
  const shift = (d: string, days: number) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const confirmed = ["state", "in", ["sale", "done"]];

  const [rawBooked, rawOpen, rawInvoiced] = await Promise.all([
    odoo.searchRead<RawOrder>("sale.order",
      [confirmed, ["date_order", ">=", shift(yearStart, -1)], ["date_order", "<", shift(yearEnd, 1)]],
      ORDER_FIELDS, "date_order desc"),
    odoo.searchRead<RawOrder>("sale.order",
      [confirmed, ["invoice_status", "!=", "invoiced"]],
      ORDER_FIELDS, "date_order desc"),
    // Fully invoiced orders that have at least one invoice dated on/after the year start.
    odoo.searchRead<RawOrder>("sale.order",
      [confirmed, ["invoice_status", "=", "invoiced"], ["order_line.invoice_lines.move_id.invoice_date", ">=", yearStart]],
      [...ORDER_FIELDS, "invoice_ids"], "date_order desc"),
  ]);

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
    company: m2o(user.company_id),
    booked: rawBooked.map(toOrder).filter((o) => o.date >= yearStart && o.date < yearEnd),
    invoiced: invoiced.filter((o) => o.invoicedDate >= yearStart && o.invoicedDate < yearEnd),
    open: rawOpen.map(toOrder),
  };
}

const cachedOdoo = unstable_cache(
  async (yearStart: string, yearEnd: string) => loadFromOdoo(getConfig(), yearStart, yearEnd),
  ["odoo-dashboard-v2"],
  { revalidate: 600, tags: ["odoo"] },
);

export async function getDashboardData(yearStart: string, yearEnd: string): Promise<DashboardData> {
  const cfg = getConfig();
  const fx = await getFx();
  const goals = convertGoals(cfg, fx);
  if (cfg.demo) return demoData(yearStart, yearEnd, fx, goals);

  const raw = await cachedOdoo(yearStart, yearEnd);
  const conv = (o: Omit<Order, "amount">): Order => ({ ...o, amount: toInr(o.originalAmount, o.currency, fx) });
  return {
    generatedAt: new Date().toISOString(),
    demo: false,
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
