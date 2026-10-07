"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inRange, monthsOf, quartersOf, yearLabel as fmtYearLabel, type Basis, type Slice } from "@/lib/periods";
import type { DashboardData, Order } from "@/lib/types";

type View = "year" | "quarter" | "month";
type Tab = "booked" | "invoiced" | "toinvoice" | "open";

interface Props {
  data: DashboardData;
  basis: Basis;
  year: number;
  thisYear: number;
  yearLabel: string;
  fyStartMonth: number;
  today: string;
  odooUrl: string;
  initialView?: string;
  initialPeriod?: string;
}

const STATUS_LABEL: Record<Order["invoiceStatus"], string> = {
  invoiced: "Fully invoiced",
  "to invoice": "To invoice",
  upselling: "Upsell",
  no: "Nothing to invoice",
};

export default function Dashboard(props: Props) {
  const { data, basis, year, thisYear, today, odooUrl } = props;
  const money = useMemo(() => ({ full: inr, compact: inrCompact }), []);
  const goals = data.goals.map((g) => g.amount);

  const months = useMemo(() => monthsOf(data.yearStart), [data.yearStart]);
  const quarters = useMemo(() => quartersOf(data.yearStart), [data.yearStart]);
  const isCurrentYear = year === thisYear;

  const defaultView: View = props.initialView === "year" || props.initialView === "quarter" || props.initialView === "month"
    ? props.initialView : isCurrentYear ? "quarter" : "year";
  const currentIdx = (list: Slice[]) => Math.max(0, list.findIndex((s) => inRange(today, s.start, s.end)));
  const [view, setView] = useState<View>(defaultView);
  const [qIdx, setQIdx] = useState(() => (props.initialPeriod?.startsWith("q") ? Number(props.initialPeriod.slice(1)) : isCurrentYear ? currentIdx(quarters) : 0));
  const [mIdx, setMIdx] = useState(() => (props.initialPeriod?.startsWith("m") ? Number(props.initialPeriod.slice(1)) : isCurrentYear ? currentIdx(months) : 0));
  const [tab, setTab] = useState<Tab>("booked");
  const [query, setQuery] = useState("");
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(".chip.on");
    if (el && chipsRef.current) chipsRef.current.scrollLeft = el.offsetLeft - chipsRef.current.clientWidth / 2 + el.clientWidth / 2;
  }, [view, qIdx, mIdx]);

  const period: Slice = view === "year"
    ? { key: "y", label: props.yearLabel, start: data.yearStart, end: data.yearEnd, fraction: 1 }
    : view === "quarter" ? quarters[qIdx] : months[mIdx];

  const syncUrl = (v: View, key: string) => {
    const u = new URL(window.location.href);
    u.searchParams.set("view", v);
    if (v === "year") u.searchParams.delete("p"); else u.searchParams.set("p", key);
    window.history.replaceState(null, "", u);
  };
  const pickView = (v: View) => { setView(v); syncUrl(v, v === "quarter" ? quarters[qIdx].key : months[mIdx].key); };
  const pickQuarter = (i: number) => { setQIdx(i); syncUrl("quarter", quarters[i].key); };
  const pickMonth = (i: number) => { setView("month"); setMIdx(i); syncUrl("month", months[i].key); };

  const snap = useMemo(() => {
    const booked = data.orders.filter((o) => inRange(o.date, period.start, period.end));
    // Both split the booked orders, so fully invoiced + to invoice = booked.
    const invoiced = booked.filter((o) => o.invoiceStatus === "invoiced");
    const toInvoice = booked.filter((o) => o.invoiceStatus !== "invoiced");
    const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
    return {
      booked, invoiced, toInvoice,
      bookedTotal: sum(booked),
      invoicedTotal: sum(invoiced),
      toInvoiceTotal: sum(toInvoice),
      openTotal: sum(data.openOrders),
    };
  }, [data, period.start, period.end]);

  const monthly = useMemo(() => months.map((m) => ({
    ...m,
    booked: data.orders.filter((o) => inRange(o.date, m.start, m.end)).reduce((s, o) => s + o.amount, 0),
    invoiced: data.orders.filter((o) => o.invoiceStatus === "invoiced" && inRange(o.date, m.start, m.end)).reduce((s, o) => s + o.amount, 0),
  })), [data, months]);

  const periodGoals = goals.map((g) => g * period.fraction);
  const base = new URLSearchParams();
  const yearHref = (b: Basis, y: number) => { base.set("basis", b); base.set("year", String(y)); return `?${base.toString()}`; };

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Sales Dashboard</h1>
          <p className="muted small">
            {data.demo ? <span className="pill warn">Demo data</span> : data.company} · <span suppressHydrationWarning>Updated {timeAgo(data.generatedAt)}</span>
          </p>
        </div>
        <div className="top-actions">
          <form method="post" action="/api/refresh"><button className="ghost" type="submit">Refresh</button></form>
          <form method="post" action="/api/logout"><button className="ghost" type="submit">Sign out</button></form>
        </div>
      </header>

      {data.stale && <p className="stale small">{data.stale}</p>}

      <nav className="controls" aria-label="Period">
        <div className="seg" role="group" aria-label="Year type">
          <a className={basis === "calendar" ? "on" : ""} href={yearHref("calendar", year)}>Calendar</a>
          <a className={basis === "fiscal" ? "on" : ""} href={yearHref("fiscal", year)}>Financial</a>
        </div>
        <div className="year-step">
          <a aria-label="Previous year" href={yearHref(basis, year - 1)}>‹</a>
          <strong>{props.yearLabel}</strong>
          <a aria-label="Next year" href={yearHref(basis, year + 1)}>›</a>
          {!isCurrentYear && <a className="small" href={yearHref(basis, thisYear)}>Today</a>}
        </div>
        <div className="seg" role="group" aria-label="Snapshot size">
          {(["year", "quarter", "month"] as View[]).map((v) => (
            <button key={v} className={view === v ? "on" : ""} onClick={() => pickView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
      </nav>

      {view !== "year" && (
        <div className="chips" ref={chipsRef} role="group" aria-label="Choose period">
          {(view === "quarter" ? quarters : months).map((s, i) => (
            <button key={s.key}
              className={(view === "quarter" ? qIdx : mIdx) === i ? "chip on" : "chip"}
              onClick={() => (view === "quarter" ? pickQuarter(i) : pickMonth(i))}>
              {s.label.split(" ")[0]}
              {inRange(today, s.start, s.end) && <span className="dot" aria-label="current" />}
            </button>
          ))}
        </div>
      )}

      <h2 className="period-title">
        {view === "month" ? longMonth(period.start) : period.label}
        {view === "quarter" ? ` · ${props.yearLabel}` : ""}
      </h2>

      <section className="tiles">
        <Tile label="Booked" value={money.full(snap.bookedTotal)} sub={plural(snap.booked.length, "order") + " confirmed"} swatch="booked" />
        <Tile label="Fully invoiced" value={money.full(snap.invoicedTotal)} sub={`${plural(snap.invoiced.length, "booked order")} · ${pct(snap.invoicedTotal, snap.bookedTotal)} of booked`} swatch="invoiced" />
        <Tile label="To invoice" value={money.full(snap.toInvoiceTotal)} sub={`${plural(snap.toInvoice.length, "booked order")} not fully invoiced`} />
        <Tile label="Open orders (all dates)" value={money.full(snap.openTotal)} sub={`${plural(data.openOrders.length, "order")} not fully invoiced`} />
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Goal progress</h3>
          <span className="muted small">
            {view === "year" ? "Annual goals" : `Annual goals ÷ ${view === "quarter" ? 4 : 12}`}
          </span>
        </div>
        <GoalTrack goals={periodGoals} rows={[
          { key: "booked", label: "Booked", value: snap.bookedTotal },
          { key: "invoiced", label: "Fully invoiced", value: snap.invoicedTotal },
        ]} money={money} notes={data.goals.map((g) => (g.currency === "INR" ? "" : `${g.currency} ${Math.round(g.originalAmount * period.fraction).toLocaleString("en-US")}`))} />
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Month by month</h3>
          <Legend />
        </div>
        <MonthChart rows={monthly} selected={view === "month" ? mIdx : view === "quarter" ? [qIdx * 3, qIdx * 3 + 1, qIdx * 3 + 2] : null}
          onPick={pickMonth} money={money} monthlyGoals={goals.map((g) => g / 12)} />
      </section>

      <section className="card">
        <div className="tabs" role="tablist">
          {([
            ["booked", `Booked (${snap.booked.length})`],
            ["invoiced", `Fully invoiced (${snap.invoiced.length})`],
            ["toinvoice", `To invoice (${snap.toInvoice.length})`],
            ["open", `Open orders (${data.openOrders.length})`],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
          ))}
          <input className="search" type="search" placeholder="Search customer or ref…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <OrderTable
          rows={filterRows(tab === "booked" ? snap.booked : tab === "invoiced" ? snap.invoiced : tab === "toinvoice" ? snap.toInvoice : data.openOrders, query)}
          money={money} odooUrl={odooUrl} />
        {tab === "open" && <p className="muted small note">All confirmed orders that aren&apos;t fully invoiced yet, regardless of the period selected.</p>}
      </section>

      <footer className="muted small foot">
        {fmtYearLabel(basis, year, props.fyStartMonth)} runs {data.yearStart} to {data.yearEnd} (exclusive). Booked = confirmed sales orders by confirmation date.
        Fully invoiced and To invoice split the orders booked in the period, so together they equal Booked. All amounts before tax, in INR.
        {" "}Foreign-currency orders use Odoo&apos;s exchange rate on the order date. USD goals use the live rate:{" "}
        {data.fx.live
          ? <>USD → INR {data.fx.inrPer.USD?.toFixed(2)} ({data.fx.date}, {data.fx.source}).</>
          : <span className="warn-text">USD → INR {data.fx.inrPer.USD?.toFixed(2)} — {data.fx.source}.</span>}
      </footer>
    </main>
  );
}

type Money = { full: (n: number) => string; compact: (n: number) => string };

/** Indian-grouped rupees, e.g. ₹1,00,00,000. Hand-rolled so server and browser render identically. */
function inr(n: number) {
  const digits = String(Math.round(Math.abs(n)));
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  return `${n < 0 ? "-" : ""}₹${head ? `${head},` : ""}${digits.slice(-3)}`;
}

function inrCompact(n: number) {
  const a = Math.abs(n);
  const [d, unit, dp] = a >= 1e7 ? [1e7, " Cr", 2] : a >= 1e5 ? [1e5, " L", 1] : a >= 1e3 ? [1e3, "K", 0] : [1, "", 0];
  return `${n < 0 ? "-" : ""}₹${String(Number((a / d).toFixed(dp)))}${unit}`;
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function filterRows<T extends { customer: string; ref: string }>(rows: T[], q: string) {
  if (!q.trim()) return rows;
  const s = q.toLowerCase();
  return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(s));
}

function longMonth(start: string) {
  return new Date(`${start}T12:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

function Tile({ label, value, sub, swatch }: { label: string; value: string; sub: string; swatch?: "booked" | "invoiced" }) {
  return (
    <div className="tile">
      <div className="tile-label">{swatch && <i className={`sw ${swatch}`} />}{label}</div>
      <div className="tile-value">{value}</div>
      <div className="muted small">{sub}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend small">
      <span><i className="sw booked" />Booked</span>
      <span><i className="sw invoiced" />Fully invoiced</span>
      <span><i className="sw goal-line" />Goal 1 / month</span>
    </div>
  );
}

function GoalTrack({ goals, rows, money, notes }: { goals: number[]; rows: { key: string; label: string; value: number }[]; money: Money; notes: string[] }) {
  const max = Math.max(goals[goals.length - 1] * 1.08, ...rows.map((r) => r.value * 1.02));
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="goal-track">
      {rows.map((r) => {
        const hit = goals.filter((g) => r.value >= g).length;
        const next = goals[hit];
        return (
          <div className="goal-row" key={r.key}>
            <div className="goal-row-head">
              <span className="goal-row-label"><i className={`sw ${r.key}`} />{r.label}</span>
              <strong>{money.full(r.value)}</strong>
            </div>
            <div className="bar-wrap">
              <div className="bar-bg">
                <div className={`bar ${r.key}`} style={{ width: pct(r.value) }} />
              </div>
              {goals.map((g, i) => (
                <div key={i} className={`tick ${r.value >= g ? "hit" : ""}`} style={{ left: pct(g) }} title={`Goal ${i + 1}: ${money.full(g)}`} />
              ))}
            </div>
            <div className="goal-status small">
              {hit > 0 && <span className="ok">✓ Goal {hit} reached</span>}
              {next !== undefined
                ? <span className="muted">{money.full(next - r.value)} to Goal {hit + 1} ({Math.round((r.value / next) * 100)}%)</span>
                : <span className="ok">All goals reached 🎉</span>}
            </div>
          </div>
        );
      })}
      <div className="goal-scale">
        {goals.map((g, i) => (
          <span key={i} style={{ left: pct(g) }}>G{i + 1}</span>
        ))}
      </div>
      <div className="goal-key small">
        {goals.map((g, i) => <span key={i}>Goal {i + 1} <b>{money.full(g)}</b>{notes[i] && <span className="muted"> ({notes[i]})</span>}</span>)}
      </div>
    </div>
  );
}

function MonthChart({ rows, selected, onPick, money, monthlyGoals }: {
  rows: (Slice & { booked: number; invoiced: number })[];
  selected: number | number[] | null;
  onPick: (i: number) => void;
  money: Money;
  monthlyGoals: number[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, monthlyGoals[0] * 1.15, ...rows.flatMap((r) => [r.booked, r.invoiced])) * 1.05;
  const W = 720, H = 220, padL = 44, padB = 24, padT = 8;
  const bw = (W - padL) / rows.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - Math.max(0, v) / max);
  const ticks = niceTicks(max);
  const isSel = (i: number) => selected === null ? false : Array.isArray(selected) ? selected.includes(i) : selected === i;
  const g1 = monthlyGoals[0];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Booked and invoiced by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 6} y={y(t) + 4} className="axis" textAnchor="end">{money.compact(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = padL + i * bw;
          const w = Math.min(18, (bw - 10) / 2);
          const cx = x + bw / 2;
          return (
            <g key={r.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onPick(i)} style={{ cursor: "pointer" }}>
              {isSel(i) && <rect x={x + 2} y={padT} width={bw - 4} height={H - padT - padB} className="sel" rx={6} />}
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              <Bar x={cx - w - 1} w={w} y0={y(0)} y1={y(r.booked)} cls="booked" />
              <Bar x={cx + 1} w={w} y0={y(0)} y1={y(r.invoiced)} cls="invoiced" />
              <text x={cx} y={H - 6} className={`axis ${isSel(i) ? "axis-on" : ""}`} textAnchor="middle">{r.label.slice(0, 3)}</text>
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={y(g1)} y2={y(g1)} className="goal-line" />
        <line x1={padL} x2={W} y1={y(0)} y2={y(0)} className="baseline" />
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%` }}>
          <strong>{rows[hover].label}</strong>
          <div><i className="sw booked" />Booked <b>{money.full(rows[hover].booked)}</b></div>
          <div><i className="sw invoiced" />Fully invoiced <b>{money.full(rows[hover].invoiced)}</b></div>
          <div className="muted">Click to open this month</div>
        </div>
      )}
    </div>
  );
}

function Bar({ x, w, y0, y1, cls }: { x: number; w: number; y0: number; y1: number; cls: string }) {
  const h = Math.max(0, y0 - y1);
  if (h < 0.5) return null;
  const r = Math.min(4, h, w / 2);
  // rounded top, square baseline
  const d = `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  return <path d={d} className={`bar-mark ${cls}`} />;
}

function niceTicks(max: number) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

function odooLink(odooUrl: string, model: string, id: number) {
  return odooUrl ? `${odooUrl}/web#id=${id}&model=${model}&view_type=form` : undefined;
}

function OrderTable({ rows, money, odooUrl }: { rows: Order[]; money: Money; odooUrl: string }) {
  if (!rows.length) return <p className="empty muted">No orders here.</p>;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th><th>Customer</th>
            <th className="hide-sm">Customer ref</th>
            <th>Booked on</th>
            <th className="hide-sm">Salesperson</th>
            <th className="hide-sm">Status</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td><RefLink href={odooLink(odooUrl, "sale.order", o.id)}>{o.ref}</RefLink></td>
              <td>{o.customer}</td>
              <td className="hide-sm muted">{o.customerRef || "—"}</td>
              <td className="nowrap">{o.date}</td>
              <td className="hide-sm">{o.salesperson || "—"}</td>
              <td className="hide-sm">
                <span className={`status s-${o.invoiceStatus.replace(" ", "-")}`}>{STATUS_LABEL[o.invoiceStatus]}</span>
              </td>
              <td className="num">
                {money.full(o.amount)}
                {o.currency !== "INR" && <div className="muted small">{o.currency} {o.originalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={6} className="hide-sm">Total</td><td colSpan={3} className="show-sm">Total</td><td className="num">{money.full(total)}</td></tr></tfoot>
      </table>
    </div>
  );
}

function RefLink({ href, children }: { href?: string; children: React.ReactNode }) {
  return href ? <a href={href} target="_blank" rel="noreferrer" className="ref">{children}</a> : <span className="ref">{children}</span>;
}
