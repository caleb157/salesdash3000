export type AmountBasis = "untaxed" | "total";

function num(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? n : fallback;
}

export function getConfig() {
  const goals = (process.env.GOALS ?? "140000,175000,240000")
    .split(",")
    .map((g) => Number(g.trim()))
    .filter((g) => Number.isFinite(g) && g > 0)
    .sort((a, b) => a - b);

  const fyStart = Math.min(12, Math.max(1, Math.round(num(process.env.FY_START_MONTH, 1))));

  return {
    odoo: {
      url: (process.env.ODOO_URL ?? "").replace(/\/+$/, ""),
      db: process.env.ODOO_DB ?? "",
      login: process.env.ODOO_LOGIN ?? "",
      apiKey: process.env.ODOO_API_KEY ?? "",
    },
    demo: process.env.DEMO_MODE === "true" || !process.env.ODOO_API_KEY,
    goals,
    fyStartMonth: fyStart,
    timeZone: process.env.TIMEZONE || "UTC",
    amountBasis: (process.env.AMOUNT_BASIS === "total" ? "total" : "untaxed") as AmountBasis,
    includeCreditNotes: process.env.INCLUDE_CREDIT_NOTES !== "false",
  };
}

export type Config = ReturnType<typeof getConfig>;
