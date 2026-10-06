import "server-only";
import type { FxInfo } from "./types";

// Live rates with INR as the base; cached for an hour by Next's fetch cache.
// Both providers are free and keyless. Rates come back as "units of X per 1 INR".
const SOURCES = [
  {
    name: "frankfurter.dev (ECB)",
    url: "https://api.frankfurter.dev/v1/latest?base=INR",
    parse: (j: { date: string; rates: Record<string, number> }) => ({ date: j.date, rates: j.rates }),
  },
  {
    name: "open.er-api.com",
    url: "https://open.er-api.com/v6/latest/INR",
    parse: (j: { time_last_update_utc: string; rates: Record<string, number> }) => ({
      date: new Date(j.time_last_update_utc).toISOString().slice(0, 10),
      rates: j.rates,
    }),
  },
];

export async function getFx(): Promise<FxInfo> {
  for (const s of SOURCES) {
    try {
      const res = await fetch(s.url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const { date, rates } = s.parse(await res.json());
      if (!rates?.USD) continue;
      const inrPer: Record<string, number> = { INR: 1 };
      for (const [cur, perInr] of Object.entries(rates)) if (perInr > 0) inrPer[cur] = 1 / perInr;
      return { inrPer, date, source: s.name, live: true };
    } catch {
      // try the next source
    }
  }
  const fallback = Number(process.env.USD_INR_RATE) || 88;
  return { inrPer: { INR: 1, USD: fallback }, date: "", source: "fallback rate (live rates unavailable)", live: false };
}
