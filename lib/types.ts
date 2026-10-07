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
  goals: Goal[];
  fx: FxInfo;
}
