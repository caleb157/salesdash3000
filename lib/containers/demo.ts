import type { Carrier } from "./numbers";
import { CARRIERS, checkDigit } from "./numbers";
import { knownPort } from "./ports";
import type { ContainerTrack, TrackResult } from "./types";

// Plausible fake tracking used when no JSONCARGO_API_KEY is set, so the app can be tried out.

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 864e5).toISOString().slice(0, 16).replace("T", " ");

interface Scenario {
  from: string; to: string; last: string; next: string | null; status: string;
  vessel?: { name: string; imo: string; mmsi: string; at: number /* 0..1 along last→next */ };
}

const SCENARIOS: Scenario[] = [
  { from: "NHAVA SHEVA, IN", to: "JEBEL ALI, AE", last: "NHAVA SHEVA, IN", next: "JEBEL ALI, AE", status: "Vessel departure",
    vessel: { name: "MAERSK DEMO STAR", imo: "9000001", mmsi: "219000001", at: 0.55 } },
  { from: "SHANGHAI, CN", to: "ROTTERDAM, NL", last: "SINGAPORE, SG", next: "PORT SAID, EG", status: "In transit",
    vessel: { name: "MSC DEMO AURORA", imo: "9000002", mmsi: "636000002", at: 0.35 } },
  { from: "MUNDRA, IN", to: "SAVANNAH, US", last: "SAVANNAH, US", next: null, status: "Discharged at port of destination" },
  { from: "CHENNAI, IN", to: "HAMBURG, DE", last: "HAMBURG, DE", next: null, status: "Gate out for delivery" },
];

function demoContainer(number: string, carrier: Carrier, seed: number): ContainerTrack {
  const s = SCENARIOS[seed % SCENARIOS.length];
  const a = knownPort(s.last), b = s.next ? knownPort(s.next) : null;
  const stops: ContainerTrack["stops"] = [];
  for (const [role, label] of [["origin", s.from], ["last", s.last], ["next", s.next], ["destination", s.to]] as const) {
    const p = label ? knownPort(label) : null;
    if (label && p && !stops.some((x) => x.label === label)) stops.push({ role, label, point: p });
  }
  let current: ContainerTrack["current"];
  if (s.vessel && a && b) {
    const t = s.vessel.at;
    current = {
      kind: "vessel", label: `On board ${s.vessel.name} → ${s.next}`,
      vessel: {
        name: s.vessel.name, imo: s.vessel.imo, mmsi: s.vessel.mmsi,
        lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t,
        speed: 15.2, course: 290, heading: 291, navStatus: "Under way using engine",
        destination: s.next, positionAt: new Date(Date.now() - 6 * 60_000).toISOString(), eta: iso(4),
      },
    };
  } else {
    current = { kind: "place", label: s.last, terminal: "Demo Container Terminal", point: a, since: iso(-1) };
  }
  return {
    number, carrier, carrierName: CARRIERS[carrier], type: seed % 2 ? "40' HIGH CUBE" : "20' DRY",
    status: s.status, billOfLading: null,
    origin: s.from, originTerminal: null, destination: s.to, destinationTerminal: null,
    loadingPort: s.from, dischargePort: s.to, departedOrigin: iso(-12), etaFinal: s.vessel ? iso(9) : iso(-1),
    lastLocation: s.last, lastLocationTerminal: null, lastLocationAt: iso(-2), departedLastLocation: s.vessel ? iso(-2) : null,
    nextLocation: s.next, nextLocationTerminal: null, etaNext: s.vessel ? iso(4) : null,
    vesselName: s.vessel?.name ?? null, voyage: s.vessel ? "DEMO01E" : null, customsCleared: null,
    current, stops, carrierUpdatedAt: iso(0), fetchedAt: new Date().toISOString(),
  };
}

const demoNumber = (seed: number, i: number) => {
  const first10 = `DEMU${String((seed + i * 7919) % 1_000_000).padStart(6, "0")}`;
  return first10 + checkDigit(first10);
};

export function demoTrack(number: string, kind: "container" | "bl", carrier: Carrier | null): TrackResult {
  const c = carrier ?? "MAERSK";
  const seed = hash(number);
  if (kind === "container") return { ok: true, kind, demo: true, containers: [demoContainer(number, c, seed)] };
  const n = 2 + (seed % 3);
  const containers = Array.from({ length: n }, (_, i) => ({ ...demoContainer(demoNumber(seed, i), c, seed + i), billOfLading: number }));
  return { ok: true, kind, demo: true, billOfLading: number, carrier: c, containers, failed: [] };
}
