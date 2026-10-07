import type { DashboardData, FxInfo, Goal, InvoiceStatus, Order, RevenueData, RevenueItem, RevenueYear } from "./types";

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

export function demoData(yearStart: string, yearEnd: string, fx: FxInfo, goals: Goal[]): Omit<DashboardData, "revenue"> {
  const r = rng(Number(yearStart.replace(/-/g, "")));
  const today = new Date().toISOString().slice(0, 10);
  const all: Order[] = [];
  let n = 1;
  for (let t = Date.parse(yearStart); t < Math.min(Date.parse(yearEnd), Date.parse(today) + DAY); t += DAY * (2 + Math.floor(r() * 6))) {
    const date = new Date(t).toISOString().slice(0, 10);
    const usd = r() < 0.3;
    const original = usd ? Math.round(2000 + r() * 14000) : Math.round((150000 + r() * 1200000) / 100) * 100;
    const age = (Date.parse(today) - t) / DAY;
    const status: InvoiceStatus = age > 45 ? (r() < 0.9 ? "invoiced" : "to invoice") : age > 10 ? (r() < 0.5 ? "to invoice" : "invoiced") : r() < 0.7 ? "no" : "to invoice";
    const ref = `S${String(1000 + n).padStart(5, "0")}`;
    const order: Order = {
      id: n, ref, customerRef: r() < 0.6 ? `PO-${Math.floor(r() * 90000 + 10000)}` : "",
      customer: CUSTOMERS[Math.floor(r() * CUSTOMERS.length)], salesperson: REPS[Math.floor(r() * REPS.length)],
      date, originalAmount: original, currency: usd ? "USD" : "INR", amount: usd ? Math.round(original * (84 + 4 * r())) : original, // stand-in for Odoo's order-date rate
      invoiceStatus: status,
    };
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
    // Some open orders are part-invoiced (e.g. a down payment), so only part of them is still to come.
    openOrders: all.filter((o) => o.invoiceStatus !== "invoiced").map((o) => ({ ...o, remaining: o.id % 3 ? o.amount : o.amount * 0.6 })),
    goals,
    fx,
  };
}

export function demoRevenue(years: { calendar: RevenueYear; fiscal: RevenueYear }): RevenueData {
  const start = [years.calendar.start, years.fiscal.start].sort()[0];
  const today = new Date().toISOString().slice(0, 10);
  const r = rng(Number(start.replace(/-/g, "")) + 7);
  const items: RevenueItem[] = [];
  let n = 1;
  for (let t = Date.parse(start); t < Date.parse(today); t += DAY * (3 + Math.floor(r() * 7)), n++) {
    const date = new Date(t).toISOString().slice(0, 10);
    const credit = r() < 0.04;
    items.push({
      id: `inv-${n}`, kind: "invoice", ref: `${credit ? "RINV" : "INV"}/${date.slice(0, 4)}/${String(n).padStart(5, "0")}`,
      label: `S${String(900 + n).padStart(5, "0")}`, partner: CUSTOMERS[Math.floor(r() * CUSTOMERS.length)], date,
      amount: Math.round((credit ? -0.2 : 1) * (150000 + r() * 1200000)),
    });
    if (r() < 0.12) {
      items.push({
        id: `aml-${n}`, kind: "other", ref: `BNK1/${date.slice(0, 4)}/${String(n).padStart(5, "0")}`,
        label: r() < 0.5 ? "Duty drawback" : "RoDTEP export incentive", partner: "Customs / DGFT", date,
        amount: Math.round(20000 + r() * 180000),
      });
    }
  }
  return { ...years, items: items.reverse() };
}
