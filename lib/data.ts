import "server-only";
import { unstable_cache } from "next/cache";
import { getConfig, type Config } from "./config";
import { Odoo } from "./odoo";
import { utcToLocalDate } from "./periods";
import type { DashboardData, Invoice, InvoiceStatus, Order } from "./types";
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
  amount_total: number;
  currency_id: M2O;
  currency_rate?: number;
  invoice_status: InvoiceStatus;
}

interface RawInvoice {
  id: number;
  name: string;
  invoice_origin: string | false;
  partner_id: M2O;
  invoice_date: string;
  move_type: "out_invoice" | "out_refund";
  amount_untaxed_signed: number;
  amount_total_signed: number;
  payment_state: string;
}

const ORDER_FIELDS = [
  "name", "client_order_ref", "partner_id", "user_id", "date_order",
  "amount_untaxed", "amount_total", "currency_id", "invoice_status",
];

async function loadFromOdoo(cfg: Config, yearStart: string, yearEnd: string): Promise<DashboardData> {
  const odoo = new Odoo(cfg.odoo);
  const uid = await odoo.authenticate();

  const [user] = await odoo.searchRead<{ company_id: M2O }>("res.users", [["id", "=", uid]], ["company_id"]);
  const [company] = await odoo.searchRead<{ name: string; currency_id: M2O }>(
    "res.company", [["id", "=", user.company_id ? user.company_id[0] : 0]], ["name", "currency_id"],
  );
  const companyCurrency = m2o(company?.currency_id ?? false) || "USD";

  // currency_rate (order currency per company currency) lets us convert foreign-currency orders.
  const orderFields = (await odoo.hasField("sale.order", "currency_rate"))
    ? [...ORDER_FIELDS, "currency_rate"]
    : ORDER_FIELDS;

  const toOrder = (o: RawOrder): Order => {
    const raw = cfg.amountBasis === "total" ? o.amount_total : o.amount_untaxed;
    const cur = m2o(o.currency_id);
    const rate = cur !== companyCurrency && o.currency_rate ? o.currency_rate : 1;
    return {
      id: o.id,
      ref: o.name,
      customerRef: o.client_order_ref || "",
      customer: m2o(o.partner_id),
      salesperson: m2o(o.user_id),
      date: utcToLocalDate(o.date_order, cfg.timeZone),
      amount: raw / rate,
      currency: cur,
      invoiceStatus: o.invoice_status,
    };
  };

  // Widen the UTC query window by a day each side, then trim on local dates.
  const shift = (d: string, days: number) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const qStartWide = shift(yearStart, -1);
  const qEndWide = shift(yearEnd, 1);

  const confirmed = ["state", "in", ["sale", "done"]];

  const [rawOrders, rawOpen, rawInvoices] = await Promise.all([
    odoo.searchRead<RawOrder>("sale.order",
      [confirmed, ["date_order", ">=", qStartWide], ["date_order", "<", qEndWide]],
      orderFields, "date_order desc"),
    odoo.searchRead<RawOrder>("sale.order",
      [confirmed, ["invoice_status", "!=", "invoiced"]],
      orderFields, "date_order desc"),
    odoo.searchRead<RawInvoice>("account.move",
      [
        ["move_type", "in", cfg.includeCreditNotes ? ["out_invoice", "out_refund"] : ["out_invoice"]],
        ["state", "=", "posted"],
        ["invoice_date", ">=", yearStart],
        ["invoice_date", "<", yearEnd],
      ],
      ["name", "invoice_origin", "partner_id", "invoice_date", "move_type", "amount_untaxed_signed", "amount_total_signed", "payment_state"],
      "invoice_date desc"),
  ]);

  const orders = rawOrders.map(toOrder).filter((o) => o.date >= yearStart && o.date < yearEnd);
  const invoices: Invoice[] = rawInvoices.map((i) => ({
    id: i.id,
    ref: i.name,
    origin: i.invoice_origin || "",
    customer: m2o(i.partner_id),
    date: i.invoice_date,
    amount: cfg.amountBasis === "total" ? i.amount_total_signed : i.amount_untaxed_signed,
    isCreditNote: i.move_type === "out_refund",
    paymentState: i.payment_state,
  }));

  return {
    generatedAt: new Date().toISOString(),
    demo: false,
    currency: companyCurrency,
    company: company?.name ?? "",
    yearStart,
    yearEnd,
    orders,
    invoices,
    openOrders: rawOpen.map(toOrder),
  };
}

const cachedLoad = unstable_cache(
  async (yearStart: string, yearEnd: string) => loadFromOdoo(getConfig(), yearStart, yearEnd),
  ["odoo-dashboard"],
  { revalidate: 600, tags: ["odoo"] },
);

export async function getDashboardData(yearStart: string, yearEnd: string): Promise<DashboardData> {
  const cfg = getConfig();
  if (cfg.demo) return demoData(yearStart, yearEnd);
  return cachedLoad(yearStart, yearEnd);
}
