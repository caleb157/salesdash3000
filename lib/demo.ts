import type { DashboardData, FxInfo, Goal, InvoiceStatus, Order } from "./types";

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
const DAY = 86400000;

export function demoData(yearStart: string, yearEnd: string, fx: FxInfo, goals: Goal[]): DashboardData {
  const r = rng(Number(yearStart.replace(/-/g, "")));
  const today = new Date().toISOString().slice(0, 10);
  const usdInr = fx.inrPer.USD ?? 88;
  const all: Order[] = [];
  let n = 1;
  // Start a few months early so fully-invoiced orders can cross the year boundary.
  for (let t = Date.parse(yearStart) - 60 * DAY; t < Math.min(Date.parse(yearEnd), Date.parse(today) + DAY); t += DAY * (2 + Math.floor(r() * 6))) {
    const date = new Date(t).toISOString().slice(0, 10);
    const usd = r() < 0.3;
    const original = usd ? Math.round(2000 + r() * 14000) : Math.round((150000 + r() * 1200000) / 100) * 100;
    const age = (Date.parse(today) - t) / DAY;
    const status: InvoiceStatus = age > 45 ? (r() < 0.9 ? "invoiced" : "to invoice") : age > 10 ? (r() < 0.5 ? "to invoice" : "invoiced") : r() < 0.7 ? "no" : "to invoice";
    const ref = `S${String(1000 + n).padStart(5, "0")}`;
    const order: Order = {
      id: n, ref, customerRef: r() < 0.6 ? `PO-${Math.floor(r() * 90000 + 10000)}` : "",
      customer: CUSTOMERS[Math.floor(r() * CUSTOMERS.length)], salesperson: REPS[Math.floor(r() * REPS.length)],
      date, originalAmount: original, currency: usd ? "USD" : "INR", amount: usd ? original * usdInr : original,
      invoiceStatus: status,
    };
    if (status === "invoiced") {
      order.invoicedDate = new Date(Math.min(t + DAY * (3 + Math.floor(r() * 25)), Date.parse(today))).toISOString().slice(0, 10);
      order.invoiceRefs = [`INV/${order.invoicedDate.slice(0, 4)}/${String(n).padStart(5, "0")}`];
    }
    all.push(order);
    n++;
  }
  all.sort((a, b) => b.date.localeCompare(a.date));
  return {
    generatedAt: new Date().toISOString(),
    demo: true,
    company: "Demo data",
    yearStart,
    yearEnd,
    orders: all.filter((o) => o.date >= yearStart && o.date < yearEnd),
    invoicedOrders: all
      .filter((o) => o.invoicedDate && o.invoicedDate >= yearStart && o.invoicedDate < yearEnd)
      .sort((a, b) => b.invoicedDate!.localeCompare(a.invoicedDate!)),
    openOrders: all.filter((o) => o.invoiceStatus !== "invoiced"),
    goals,
    fx,
  };
}
