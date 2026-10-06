import type { DashboardData, Invoice, InvoiceStatus, Order } from "./types";

// Deterministic pseudo-random generator so demo data is stable between reloads.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const CUSTOMERS = [
  "Acme Outfitters", "Blue Mesa Home", "Canyon Supply Co.", "Driftwood Living", "Evergreen Goods",
  "Foxglove Studio", "Granite & Oak", "Harbor Lane", "Ironwood Retail", "Juniper Collective",
];
const REPS = ["Parker", "Sam", "Alex"];

export function demoData(yearStart: string, yearEnd: string): DashboardData {
  const r = rng(Number(yearStart.replace(/-/g, "")));
  const today = new Date().toISOString().slice(0, 10);
  const startMs = Date.parse(yearStart);
  const endMs = Math.min(Date.parse(yearEnd), Date.parse(today) + 86400000);
  const orders: Order[] = [];
  const invoices: Invoice[] = [];
  let n = 1;
  for (let t = startMs; t < endMs; t += 86400000 * (2 + Math.floor(r() * 6))) {
    const date = new Date(t).toISOString().slice(0, 10);
    const amount = Math.round(2000 + r() * 14000);
    const age = (Date.parse(today) - t) / 86400000;
    const status: InvoiceStatus = age > 45 ? (r() < 0.9 ? "invoiced" : "to invoice") : age > 10 ? (r() < 0.5 ? "to invoice" : "invoiced") : r() < 0.7 ? "no" : "to invoice";
    const ref = `S${String(1000 + n).padStart(5, "0")}`;
    const customer = CUSTOMERS[Math.floor(r() * CUSTOMERS.length)];
    orders.push({
      id: n, ref, customerRef: r() < 0.6 ? `PO-${Math.floor(r() * 90000 + 10000)}` : "",
      customer, salesperson: REPS[Math.floor(r() * REPS.length)], date, amount, currency: "USD", invoiceStatus: status,
    });
    if (status === "invoiced") {
      const invDate = new Date(Math.min(t + 86400000 * (3 + Math.floor(r() * 25)), Date.parse(today))).toISOString().slice(0, 10);
      if (invDate < yearEnd) {
        invoices.push({
          id: n, ref: `INV/${invDate.slice(0, 4)}/${String(n).padStart(5, "0")}`, origin: ref, customer, date: invDate,
          amount, isCreditNote: false, paymentState: r() < 0.7 ? "paid" : "not_paid",
        });
      }
    }
    n++;
  }
  if (invoices.length > 3) {
    const src = invoices[2];
    invoices.push({ ...src, id: 99999, ref: `RINV/${src.date.slice(0, 4)}/00001`, amount: -Math.round(src.amount * 0.2), isCreditNote: true, paymentState: "paid" });
  }
  orders.sort((a, b) => b.date.localeCompare(a.date));
  invoices.sort((a, b) => b.date.localeCompare(a.date));
  return {
    generatedAt: new Date().toISOString(),
    demo: true,
    currency: "USD",
    company: "Demo data",
    yearStart,
    yearEnd,
    orders,
    invoices,
    openOrders: orders.filter((o) => o.invoiceStatus !== "invoiced"),
  };
}
