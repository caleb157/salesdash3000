"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CARRIERS, CARRIER_NEEDS_PASTE, carrierTrackingUrl, isCarrier, parseMany, vesselLinks, type Carrier,
} from "@/lib/containers/numbers";
import type { ContainerTrack, TrackResult } from "@/lib/containers/types";
import type { MapEntry } from "./TrackMap";

const TrackMap = dynamic(() => import("./TrackMap"), { ssr: false, loading: () => <div className="track-map" /> });

interface Item {
  id: string;
  number: string;
  kind: "container" | "bl";
  carrier: Carrier | null;
  note: string;
  addedAt: string;
  result?: TrackResult;
  /** Error from the latest refresh, when an earlier good result is still shown. */
  lastError?: string;
  checkWarning?: string;
}

const STORE = "ctr-watchlist-v1";
const load = (): Item[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};
const save = (items: Item[]) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(items));
  } catch {
    /* private mode / quota — the list just won't persist */
  }
};

export default function Tracker({ demo }: { demo: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [carrier, setCarrier] = useState<Carrier | "">("");
  const [kind, setKind] = useState<"auto" | "container" | "bl">("auto");
  const [rejected, setRejected] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ plan?: string; left?: number; total?: number; error?: string } | null>(null);

  const update = useCallback((fn: (prev: Item[]) => Item[]) => setItems((prev) => {
    const next = fn(prev);
    save(next);
    return next;
  }), []);

  const run = useCallback(async (item: Item, refresh = false) => {
    setBusy((b) => ({ ...b, [item.id]: true }));
    let result: TrackResult;
    const post = (extra = {}) => fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number: item.number, kind: item.kind, carrier: item.carrier, ...extra }),
    });
    try {
      // Refresh = drop the server cache in one request, then fetch in the next.
      if (refresh) await post({ invalidate: true });
      const res = await post();
      if (res.status === 401) { window.location.href = "/login"; return; }
      result = await res.json();
    } catch (e) {
      result = { ok: false, error: `Network error: ${e instanceof Error ? e.message : e}` };
    }
    // Keep the last good result on screen if a refresh fails.
    update((prev) => prev.map((x) => (x.id === item.id ? { ...x, result: result.ok || !x.result?.ok ? result : x.result, lastError: result.ok ? undefined : result.error } : x)));
    setBusy((b) => ({ ...b, [item.id]: false }));
  }, [update]);

  // Load the saved list and refresh it (the server caches results, so this rarely spends API requests).
  useEffect(() => {
    const saved = load();
    setItems(saved);
    setReady(true);
    saved.forEach((it, i) => setTimeout(() => run(it), i * 150));
    if (!demo) fetch("/api/track/usage").then((r) => r.json()).then(setUsage).catch(() => {});
  }, [run, demo]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const { parsed, rejected } = parseMany(text);
    setRejected(rejected);
    if (!parsed.length) return;
    const existing = new Set(items.map((i) => i.number));
    const fresh: Item[] = parsed.filter((p) => !existing.has(p.number)).map((p) => ({
      id: `${p.number}-${Date.now().toString(36)}`,
      number: p.number,
      kind: kind === "auto" ? p.kind : kind,
      carrier: carrier || p.carrier,
      note: "",
      addedAt: new Date().toISOString(),
      checkWarning: p.kind === "container" && kind !== "bl" && p.checkDigitOk === false
        ? `Check digit doesn't match — the last digit should be ${p.expectedCheckDigit}. Possible typo.` : undefined,
    }));
    update((prev) => [...fresh, ...prev]);
    fresh.forEach((it, i) => setTimeout(() => run(it), i * 150));
    if (fresh[0]) setSelected(fresh[0].id + ":0");
    setText("");
  };

  const remove = (id: string) => {
    update((prev) => prev.filter((x) => x.id !== id));
    if (selected?.startsWith(id + ":")) setSelected(null);
  };
  const setItemCarrier = (item: Item, c: Carrier) => {
    const next = { ...item, carrier: c };
    update((prev) => prev.map((x) => (x.id === item.id ? next : x)));
    run(next);
  };
  const setNote = (id: string, note: string) => update((prev) => prev.map((x) => (x.id === id ? { ...x, note } : x)));

  const mapEntries: MapEntry[] = useMemo(() => items.flatMap((it) =>
    it.result?.ok ? it.result.containers.map((t, i) => ({ key: `${it.id}:${i}`, track: t })) : []), [items]);

  const counts = useMemo(() => {
    let sea = 0, port = 0;
    for (const e of mapEntries) e.track.current.kind === "vessel" ? sea++ : port++;
    return { total: mapEntries.length, sea, port };
  }, [mapEntries]);

  const refreshAll = () => items.forEach((it, i) => setTimeout(() => run(it, true), i * 250));

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Container Tracker</h1>
          <p className="muted small">
            {demo ? <span className="pill warn">Demo data</span> : "Live carrier + AIS data"}
            {usage && !usage.error && usage.left != null && <> · {usage.left.toLocaleString()} of {usage.total?.toLocaleString()} API requests left{usage.plan ? ` (${usage.plan})` : ""}</>}
            {usage?.error && <span className="warn-text"> · {usage.error}</span>}
          </p>
        </div>
        <div className="top-actions">
          <a className="ghost" href="/">Sales</a>
          {items.length > 0 && <button className="ghost" onClick={refreshAll}>Refresh all</button>}
          <form method="post" action="/api/logout"><button className="ghost" type="submit">Sign out</button></form>
        </div>
      </header>

      {demo && (
        <p className="stale small">
          No <code>JSONCARGO_API_KEY</code> is set, so every number shows made-up demo tracking. Add the key in your Vercel
          environment variables to see real locations.
        </p>
      )}

      <form className="card add-form" onSubmit={add}>
        <label htmlFor="numbers"><h3>Track containers or bills of lading</h3></label>
        <textarea id="numbers" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"Paste one or many — e.g.\nMSKU1234565\nMEDUAB123456"} spellCheck={false} autoCapitalize="characters" />
        <div className="add-row">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Number type">
            <option value="auto">Detect type</option>
            <option value="container">Container number</option>
            <option value="bl">Bill of lading / booking</option>
          </select>
          <select value={carrier} onChange={(e) => setCarrier(isCarrier(e.target.value) ? e.target.value : "")} aria-label="Shipping line">
            <option value="">Detect shipping line</option>
            {Object.entries(CARRIERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="submit" className="primary" disabled={!text.trim()}>Track</button>
        </div>
        {rejected.length > 0 && <p className="error small">Skipped (not a valid number): {rejected.join(", ")}</p>}
      </form>

      {ready && items.length === 0 && (
        <section className="card empty">
          <p>Paste a container number (4 letters + 7 digits, like <b>MSCU1234567</b>) or a bill of lading number above.</p>
          <p className="muted small">The shipping line is detected from the prefix. For leased boxes (TCNU, TGHU, CAIU, SEGU…) pick the line by hand.</p>
        </section>
      )}

      {mapEntries.length > 0 && (
        <section className="card map-card">
          <div className="card-head">
            <h3>Where they are now</h3>
            <span className="muted small">{counts.total} container{counts.total === 1 ? "" : "s"} · {counts.sea} at sea · {counts.port} on land / in port</span>
          </div>
          <TrackMap entries={mapEntries} selected={selected} onSelect={setSelected} />
          <p className="muted small note"><span className="ship-key" /> ship carrying the container (live AIS) <span className="port-key" /> last reported port / terminal</p>
        </section>
      )}

      <section className="ship-list">
        {items.map((it) => (
          <ItemCard key={it.id} item={it} busy={!!busy[it.id]} selected={selected}
            onSelect={setSelected} onRefresh={() => run(it, true)} onRemove={() => remove(it.id)}
            onCarrier={(c) => setItemCarrier(it, c)} onNote={(n) => setNote(it.id, n)} />
        ))}
      </section>

      <footer className="muted small foot">
        Containers don&apos;t carry GPS, so &ldquo;where is it&rdquo; comes from two sources: the shipping line&apos;s own milestones
        (port, terminal, gate-in/out, loaded, discharged) and, while the box is at sea, the live AIS position of the ship it&apos;s on.
        Carrier data is cached for 2 hours and ship positions for 15 minutes to save API requests — Refresh pulls fresh data.
        Your list is saved in this browser.
      </footer>
    </main>
  );
}

interface CardProps {
  item: Item;
  busy: boolean;
  selected: string | null;
  onSelect: (k: string) => void;
  onRefresh: () => void;
  onRemove: () => void;
  onCarrier: (c: Carrier) => void;
  onNote: (n: string) => void;
}

function ItemCard({ item, busy, selected, onSelect, onRefresh, onRemove, onCarrier, onNote }: CardProps) {
  const r = item.result;
  const lastError = item.lastError;
  const carrier = item.carrier ?? (r?.ok && r.kind === "bl" ? r.carrier : r?.ok ? r.containers[0]?.carrier : null);
  return (
    <article className="card ship">
      <div className="ship-head">
        <div>
          <div className="ship-num">
            <span className="pill">{item.kind === "bl" ? "B/L" : "Container"}</span>
            <strong>{item.number}</strong>
            {carrier && <span className="muted small">{CARRIERS[carrier]}</span>}
          </div>
          <input className="ship-note" placeholder="Add a note (customer, PO…)" defaultValue={item.note} onBlur={(e) => onNote(e.target.value)} />
        </div>
        <div className="ship-actions">
          {carrier && (
            <a className="ghost small" target="_blank" rel="noreferrer" href={carrierTrackingUrl(carrier, item.number, item.kind)}
              title={CARRIER_NEEDS_PASTE.includes(carrier) ? "Opens the carrier's tracking page — paste the number there" : "Free tracking on the carrier's website"}>
              {CARRIERS[carrier].split(" ")[0]} site ↗
            </a>
          )}
          <button className="ghost small" onClick={onRefresh} disabled={busy}>{busy ? "Updating…" : "Refresh"}</button>
          <button className="ghost small" onClick={onRemove} aria-label={`Remove ${item.number}`}>✕</button>
        </div>
      </div>

      {item.checkWarning && <p className="warn-text small">{item.checkWarning}</p>}

      {!r && busy && <p className="muted">Looking up…</p>}

      {r && !r.ok && (
        <div className="ship-error">
          <p className="error">{r.error}</p>
          {r.needsCarrier && (
            <select defaultValue="" onChange={(e) => isCarrier(e.target.value) && onCarrier(e.target.value)} aria-label="Pick shipping line">
              <option value="" disabled>Pick the shipping line…</option>
              {Object.entries(CARRIERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </div>
      )}
      {r?.ok && lastError && <p className="warn-text small">Refresh failed ({lastError}) — showing the last result.</p>}

      {r?.ok && r.kind === "bl" && (
        <p className="muted small">{r.containers.length + r.failed.length} container{r.containers.length + r.failed.length === 1 ? "" : "s"} on this bill of lading</p>
      )}
      {r?.ok && r.containers.map((t, i) => (
        <ContainerRow key={t.number} t={t} showNumber={r.kind === "bl"} on={selected === `${item.id}:${i}`} onSelect={() => onSelect(`${item.id}:${i}`)} />
      ))}
      {r?.ok && r.kind === "bl" && r.failed.map((f) => (
        <p key={f.number} className="error small">{f.number}: {f.error}</p>
      ))}
    </article>
  );
}

function ContainerRow({ t, showNumber, on, onSelect }: { t: ContainerTrack; showNumber: boolean; on: boolean; onSelect: () => void }) {
  const cur = t.current;
  const v = cur.kind === "vessel" ? cur.vessel : null;
  return (
    <div className={on ? "ctr on" : "ctr"}>
      <button className="ctr-main" onClick={onSelect} aria-pressed={on}>
        <span className={`ctr-dot ${cur.kind}`} aria-hidden />
        <span className="ctr-where">
          {showNumber && <b className="ctr-n">{t.number}</b>}
          <span className="ctr-label">{cur.label}</span>
          <span className="muted small">
            {t.status ?? "—"}
            {cur.kind === "place" && cur.terminal ? ` · ${cur.terminal}` : ""}
            {cur.kind === "place" && cur.since ? ` · since ${cur.since}` : ""}
            {v?.positionAt ? <> · ship position <span suppressHydrationWarning>{ago(v.positionAt)}</span></> : ""}
          </span>
        </span>
        <span className="ctr-eta">
          <span className="muted small">ETA {t.destination ? t.destination.split(",")[0] : "final"}</span>
          <b>{t.etaFinal ?? "—"}</b>
        </span>
      </button>
      {on && (
        <div className="ctr-detail">
          <dl>
            <Field k="Route" v={[t.origin, t.destination].filter(Boolean).join(" → ") || null} />
            <Field k="Type" v={t.type} />
            <Field k="Departed origin" v={t.departedOrigin} />
            <Field k="Last location" v={[t.lastLocation, t.lastLocationTerminal].filter(Boolean).join(" · ") || null} />
            <Field k="Last event time" v={t.lastLocationAt} />
            <Field k="Next stop" v={[t.nextLocation, t.etaNext && `ETA ${t.etaNext}`].filter(Boolean).join(" · ") || null} />
            <Field k="Vessel / voyage" v={[t.vesselName, t.voyage].filter(Boolean).join(" / ") || null} />
            {v && <Field k="Ship position" v={`${v.lat.toFixed(4)}, ${v.lon.toFixed(4)}`} />}
            {v && <Field k="Speed / course" v={`${v.speed ?? "?"} kn / ${v.course ?? "?"}°${v.navStatus ? ` · ${v.navStatus}` : ""}`} />}
            {v?.destination && <Field k="Ship reports heading to" v={v.destination} />}
            <Field k="Bill of lading" v={t.billOfLading} />
            <Field k="Customs cleared" v={t.customsCleared} />
            <Field k="Carrier data as of" v={t.carrierUpdatedAt} />
          </dl>
          {v && (
            <p className="small links">
              Watch the ship live:{" "}
              {vesselLinks(v.imo, v.mmsi).map((l, i) => (
                <span key={l.url}>{i > 0 && " · "}<a href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a></span>
              ))}
              {" · "}<a href={`https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lon}#map=8/${v.lat}/${v.lon}`} target="_blank" rel="noreferrer">Open in map ↗</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const Field = ({ k, v }: { k: string; v: string | null }) => (v ? <><dt>{k}</dt><dd>{v}</dd></> : null);

function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return iso;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
