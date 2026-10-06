export interface GoalSpec {
  amount: number;
  currency: string;
}

/** "10000000 INR, 175000 USD" -> [{amount, currency}] (currency defaults to INR). */
function parseGoals(raw: string): GoalSpec[] {
  return raw
    .split(",")
    .map((g) => {
      const m = g.trim().match(/^([\d.]+)\s*([A-Za-z]{3})?$/);
      return m ? { amount: Number(m[1]), currency: (m[2] ?? "INR").toUpperCase() } : null;
    })
    .filter((g): g is GoalSpec => !!g && g.amount > 0);
}

export function getConfig() {
  const fy = Number(process.env.FY_START_MONTH);
  return {
    odoo: {
      url: (process.env.ODOO_URL ?? "").replace(/\/+$/, ""),
      db: process.env.ODOO_DB ?? "",
      login: process.env.ODOO_LOGIN ?? "",
      apiKey: process.env.ODOO_API_KEY ?? "",
    },
    demo: process.env.DEMO_MODE === "true" || !process.env.ODOO_API_KEY,
    goals: parseGoals(process.env.GOALS ?? "10000000 INR,175000 USD,240000 USD"),
    fyStartMonth: Number.isInteger(fy) && fy >= 1 && fy <= 12 ? fy : 4,
    timeZone: process.env.TIMEZONE || "Asia/Kolkata",
  };
}

export type Config = ReturnType<typeof getConfig>;
