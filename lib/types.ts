export type InvoiceStatus = "invoiced" | "to invoice" | "upselling" | "no";

export interface Order {
  id: number;
  ref: string; // SO number, e.g. S00042
  customerRef: string; // customer PO / reference
  customer: string;
  salesperson: string;
  date: string; // YYYY-MM-DD (local), confirmation date
  amount: number; // company currency
  currency: string; // original order currency
  invoiceStatus: InvoiceStatus;
}

export interface Invoice {
  id: number;
  ref: string; // INV/2026/00012
  origin: string; // source SO(s)
  customer: string;
  date: string; // invoice date YYYY-MM-DD
  amount: number; // company currency, negative for credit notes
  isCreditNote: boolean;
  paymentState: string;
}

export interface DashboardData {
  generatedAt: string;
  demo: boolean;
  currency: string;
  company: string;
  yearStart: string; // inclusive YYYY-MM-DD
  yearEnd: string; // exclusive YYYY-MM-DD
  orders: Order[]; // booked within the year
  invoices: Invoice[]; // posted within the year
  openOrders: Order[]; // all confirmed orders not fully invoiced (any date)
}
