import "server-only";
import { unstable_cache } from "next/cache";
import { getConfig, type Config } from "./config";
import { getFx } from "./fx";
import { Odoo } from "./odoo";
import { currentYear, todayIn, utcToLocalDate, yearLabel, yearRange } from "./periods";
import type { DashboardData, FxInfo, Goal, InvoiceStatus, Order, RevenueData, RevenueItem, RevenueYear } from "./types";
import { demoData, demoRevenue } from "./demo";

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

  // Uninvoiced remainder per open order = untaxed total − what's been invoiced (net of credit notes).
  // Summed per order, so down-payment invoices are netted off correctly.
  const lines = rawOpen.length
    ? await odoo.searchRead<{ order_id: M2O; untaxed_amount_invoiced: number }>("sale.order.line",
        [["order_id", "in", rawOpen.map((o) => o.id)]], ["order_id", "untaxed_amount_invoiced"])
    : [];
  const invoicedSoFar = new Map<number, number>();
  for (const l of lines) if (l.order_id) invoicedSoFar.set(l.order_id[0], (invoicedSoFar.get(l.order_id[0]) ?? 0) + l.untaxed_amount_invoiced);

  return {
    company: company.name,
    companyCurrency,
    booked: rawBooked.map(toOrder).filter((o) => o.date >= yearStart && o.date < yearEnd),
    open: rawOpen.map((o) => ({ ...toOrder(o), remainingOriginal: Math.max(0, o.amount_untaxed - (invoicedSoFar.get(o.id) ?? 0)) })),
  };
}

/** Invoices (net of credit notes) and other bank income, untaxed, in company currency. */
async function loadRevenue(cfg: Config, start: string, end: string): Promise<RevenueItem[]> {
  const odoo = new Odoo(cfg.odoo);
  await odoo.authenticate();

  const invoices = await odoo.searchRead<{
    id: number; name: string; invoice_origin: string | false; partner_id: M2O; invoice_date: string; amount_untaxed_signed: number;
  }>("account.move",
    [["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["invoice_date", ">=", start], ["invoice_date", "<", end]],
    ["name", "invoice_origin", "partner_id", "invoice_date", "amount_untaxed_signed"], "invoice_date desc");

  // Income booked straight from bank/cash (drawbacks, incentives, interest…): journal items on income
  // accounts in bank/cash journals that aren't part of an invoice.
  const other = await odoo.searchRead<{
    id: number; date: string; name: string | false; move_id: M2O; partner_id: M2O; account_id: M2O; balance: number;
  }>("account.move.line",
    [
      ["parent_state", "=", "posted"],
      ["move_id.move_type", "=", "entry"],
      ["journal_id.type", "in", ["bank", "cash"]],
      ["account_id.internal_group", "=", "income"],
      ["date", ">=", start], ["date", "<", end],
    ],
    ["date", "name", "move_id", "partner_id", "account_id", "balance"], "date desc");

  return [
    ...invoices.map((i): RevenueItem => ({
      id: `inv-${i.id}`, kind: "invoice", ref: i.name, label: i.invoice_origin || "", partner: m2o(i.partner_id),
      date: i.invoice_date, amount: i.amount_untaxed_signed,
    })),
    ...other.map((l): RevenueItem => ({
      id: `aml-${l.id}`, kind: "other", ref: m2o(l.move_id), label: l.name || m2o(l.account_id), partner: m2o(l.partner_id),
      date: l.date, amount: -l.balance, // income is a credit
    })),
  ];
}

/** The current calendar year and current financial year (revenue projection is always "this year"). */
export function revenueYears(cfg: Config): { calendar: RevenueYear; fiscal: RevenueYear } {
  const today = todayIn(cfg.timeZone);
  const cy = currentYear("calendar", today, cfg.fyStartMonth);
  const fy = currentYear("fiscal", today, cfg.fyStartMonth);
  return {
    calendar: { label: yearLabel("calendar", cy, cfg.fyStartMonth), ...yearRange("calendar", cy, cfg.fyStartMonth) },
    fiscal: { label: yearLabel("fiscal", fy, cfg.fyStartMonth), ...yearRange("fiscal", fy, cfg.fyStartMonth) },
  };
}

const cachedRevenue = unstable_cache(
  async (start: string, end: string) => loadRevenue(getConfig(), start, end),
  ["odoo-revenue-v1"],
  { revalidate: 600, tags: ["odoo"] },
);
const lastGoodRevenue = new Map<string, RevenueItem[]>();

async function getRevenue(cfg: Config, fx: FxInfo, companyCurrency: string): Promise<RevenueData> {
  const years = revenueYears(cfg);
  const start = [years.calendar.start, years.fiscal.start].sort()[0];
  const end = [years.calendar.end, years.fiscal.end].sort()[1];
  const key = `${start}|${end}`;
  try {
    const items = await cachedRevenue(start, end);
    lastGoodRevenue.set(key, items);
    return { ...years, items: companyToInr(items, companyCurrency, fx) };
  } catch (e) {
    const prev = lastGoodRevenue.get(key);
    const msg = e instanceof Error ? e.message : String(e);
    return { ...years, items: prev ? companyToInr(prev, companyCurrency, fx) : [], error: prev ? `Showing earlier data (${msg})` : msg };
  }
}

function companyToInr(items: RevenueItem[], companyCurrency: string, fx: FxInfo) {
  return companyCurrency === "INR" ? items : items.map((i) => ({ ...i, amount: toInr(i.amount, companyCurrency, fx) }));
}

const lastGood = new Map<string, { raw: Awaited<ReturnType<typeof loadFromOdoo>>; at: string }>();

const cachedOdoo = unstable_cache(
  async (yearStart: string, yearEnd: string) => loadFromOdoo(getConfig(), yearStart, yearEnd),
  ["odoo-dashboard-v5"],
  { revalidate: 600, tags: ["odoo"] },
);

export async function getDashboardData(yearStart: string, yearEnd: string): Promise<DashboardData> {
  const cfg = getConfig();
  const fx = await getFx();
  const goals = convertGoals(cfg, fx);
  if (cfg.demo) {
    const data = demoData(yearStart, yearEnd, fx, goals);
    return { ...data, revenue: demoRevenue(revenueYears(cfg)) };
  }

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
  type RawConv = Omit<Order, "amount" | "remaining"> & { base: { value: number; currency: string }; remainingOriginal?: number };
  const conv = ({ base, remainingOriginal, ...o }: RawConv): Order => {
    const amount = base.currency === "INR" ? base.value : toInr(base.value, base.currency, fx);
    // The remainder converts at the same (order-date) rate as the order itself.
    const remaining = remainingOriginal === undefined ? undefined
      : o.originalAmount ? (amount * remainingOriginal) / o.originalAmount : 0;
    return { ...o, amount, ...(remaining === undefined ? {} : { remaining }) };
  };
  const revenue = await getRevenue(cfg, fx, raw.companyCurrency);
  return {
    generatedAt: new Date().toISOString(),
    demo: false,
    stale,
    company: raw.company,
    yearStart,
    yearEnd,
    orders: raw.booked.map(conv),
    openOrders: raw.open.map(conv),
    revenue,
    goals,
    fx,
  };
}
