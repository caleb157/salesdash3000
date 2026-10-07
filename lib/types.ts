export type InvoiceStatus = "invoiced" | "to invoice" | "upselling" | "no";

export interface Order {
  id: number;
  ref: string; // SO number, e.g. S00042
  customerRef: string; // customer PO / reference
  customer: string;
  salesperson: string;
  date: string; // YYYY-MM-DD (local), confirmation date
  amount: number; // untaxed, converted to INR
  originalAmount: number; // untaxed, order currency
  currency: string; // order currency
  invoiceStatus: InvoiceStatus;
  remaining?: number; // open orders: untaxed value not yet invoiced, INR
}

/** Money already in: a posted customer invoice/credit note, or other income received through the bank. */
export interface RevenueItem {
  id: string;
  kind: "invoice" | "other";
  ref: string; // INV/2026/00012 or bank entry name
  label: string; // source order (invoices) or bank line label / income account (other income)
  partner: string;
  date: string; // YYYY-MM-DD
  amount: number; // untaxed INR; negative for credit notes
}

export interface RevenueYear {
  label: string; // "2026" / "FY2026–27"
  start: string;
  end: string;
}

export interface RevenueData {
  calendar: RevenueYear;
  fiscal: RevenueYear;
  items: RevenueItem[]; // covering both years
  error?: string;
}

export interface Goal {
  amount: number; // INR
  originalAmount: number;
  currency: string;
}

export interface FxInfo {
  inrPer: Record<string, number>; // INR for 1 unit of currency
  date: string;
  source: string;
  live: boolean;
}

export interface DashboardData {
  generatedAt: string;
  demo: boolean;
  stale?: string; // set when Odoo failed and we're showing the last good load
  company: string;
  yearStart: string; // inclusive YYYY-MM-DD
  yearEnd: string; // exclusive YYYY-MM-DD
  orders: Order[]; // booked (confirmed) within the year
  openOrders: Order[]; // confirmed, not fully invoiced (any date)
  revenue: RevenueData; // always the current calendar + financial year
  goals: Goal[];
  fx: FxInfo;
}
