import { getConfig } from "@/lib/config";
import { getDashboardData } from "@/lib/data";
import { currentYear, todayIn, yearLabel, yearRange, type Basis } from "@/lib/periods";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const cfg = getConfig();
  const today = todayIn(cfg.timeZone);
  const basis: Basis = sp.basis === "calendar" || sp.basis === "fiscal" ? sp.basis : cfg.fyStartMonth === 1 ? "calendar" : "fiscal";
  const thisYear = currentYear(basis, today, cfg.fyStartMonth);
  const year = Number(sp.year) || thisYear;
  const { start, end } = yearRange(basis, year, cfg.fyStartMonth);

  let data;
  let error: string | null = null;
  try {
    data = await getDashboardData(start, end);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!data) {
    return (
      <main className="wrap">
        <div className="card error-card">
          <h1>Couldn&apos;t load data from Odoo</h1>
          <p>{error}</p>
          <p className="muted">
            {error?.includes("429")
              ? "Odoo is temporarily limiting API requests. Wait a minute and reload — once a load succeeds it's cached for 10 minutes."
              : "Check ODOO_URL, ODOO_DB, ODOO_LOGIN and ODOO_API_KEY in your Vercel environment variables."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <Dashboard
      data={data}
      basis={basis}
      year={year}
      thisYear={thisYear}
      yearLabel={yearLabel(basis, year, cfg.fyStartMonth)}
      fyStartMonth={cfg.fyStartMonth}
      today={today}
      odooUrl={cfg.demo ? "" : cfg.odoo.url}
      initialView={sp.view}
      initialPeriod={sp.p}
    />
  );
}
