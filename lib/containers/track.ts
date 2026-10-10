import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { CARRIERS, parseNumber, type Carrier } from "./numbers";
import { fetchBol, fetchContainer, fetchVesselByImo, findPorts, findVessels, jsonCargoKey, type RawContainer, type RawVessel } from "./jsoncargo";
import { knownPort, splitPlace } from "./ports";
import type { ContainerTrack, CurrentLocation, LatLon, TrackResult, VesselPosition } from "./types";
import { demoTrack } from "./demo";

const DAY = 24 * 60 * 60;
// Carrier milestones change a few times a day at most; refetching more often just burns API requests.
const containerTtl = () => Math.max(5, Number(process.env.TRACK_CACHE_MINUTES) || 120) * 60;
// AIS positions move continuously; 15 minutes keeps the ship's pin fresh without a request per page view.
const vesselTtl = () => Math.max(1, Number(process.env.VESSEL_CACHE_MINUTES) || 15) * 60;

/**
 * live: JSONCargo key set. demo: CONTAINER_DEMO_MODE=true (made-up data, for trying the UI).
 * free: no key — numbers are checked and linked to the carriers' own free tracking pages, nothing is fetched.
 */
export type TrackerMode = "live" | "demo" | "free";
export const trackerMode = (): TrackerMode =>
  process.env.CONTAINER_DEMO_MODE === "true" ? "demo" : jsonCargoKey() ? "live" : "free";
export const isDemo = () => trackerMode() === "demo";

const cachedContainer = (number: string, carrier: Carrier, viaBl?: string) =>
  unstable_cache(() => fetchContainer(number, carrier), ["jc-container", number, carrier, viaBl ?? ""], {
    revalidate: containerTtl(), tags: viaBl ? [`ctr:${number}`, `bl-ctr:${viaBl}`] : [`ctr:${number}`],
  })();

const cachedBol = (bl: string, carrier: Carrier) =>
  unstable_cache(() => fetchBol(bl, carrier), ["jc-bol", bl, carrier], { revalidate: 12 * 60 * 60, tags: [`bl:${bl}`] })();

const cachedVesselImo = (name: string) =>
  unstable_cache(async () => {
    const list = await findVessels(name);
    const exact = list.filter((v) => (v.name ?? "").toUpperCase() === name.toUpperCase() && v.imo);
    const pool = exact.length ? exact : list.filter((v) => v.imo);
    // Prefer an actual container ship when several vessels share the name.
    const pick = pool.find((v) => /container/i.test(`${v.type_specific ?? ""} ${v.type ?? ""}`)) ?? pool[0];
    return pick?.imo ? String(pick.imo) : null;
  }, ["jc-vessel-imo", name.toUpperCase()], { revalidate: 30 * DAY })();

const cachedVesselPosition = (imo: string) =>
  unstable_cache(() => fetchVesselByImo(imo), ["jc-vessel-pos", imo], { revalidate: vesselTtl(), tags: ["vessel-pos"] })();

const cachedPortPoint = (place: string) =>
  unstable_cache(async (): Promise<LatLon | null> => {
    const { name, country } = splitPlace(place);
    if (!name) return null;
    const ports = await findPorts(name, country);
    const p = ports.find((x) => typeof x.lat === "number" && typeof x.lon === "number");
    return p ? { lat: p.lat!, lon: p.lon! } : null;
  }, ["jc-port", place.toUpperCase()], { revalidate: 30 * DAY })();

async function placePoint(place: string | null | undefined): Promise<LatLon | null> {
  if (!place) return null;
  const known = knownPort(place);
  if (known) return known;
  try {
    return await cachedPortPoint(place);
  } catch {
    return null; // a stop we can't pin just doesn't show on the map
  }
}

const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

function toVessel(v: RawVessel, fallbackName: string): VesselPosition | null {
  if (typeof v.lat !== "number" || typeof v.lon !== "number") return null;
  const positionAt = v.last_position_epoch ? new Date(v.last_position_epoch * 1000).toISOString() : str(v.last_position_UTC);
  return {
    name: v.name || fallbackName, imo: str(v.imo), mmsi: str(v.mmsi), lat: v.lat, lon: v.lon,
    speed: v.speed ?? null, course: v.course ?? null, heading: v.heading ?? null,
    navStatus: str(v.navigation_status), destination: str(v.destination), positionAt, eta: str(v.eta_UTC),
  };
}

const ON_VESSEL = /on.?board|loaded|depart|sail|in.?transit|transship|vessel arriv|berth/i;
const ASHORE = /discharg|unload|gate.?(out|in)|deliver|empty|return|pick.?up|stripp|stuff|rail|truck|barge|customs|released|available/i;

/** Is the box on a ship right now? Uses the carrier's status first, then the dates. */
function onVessel(c: RawContainer): boolean {
  if (!c.current_vessel_name) return false;
  const status = c.container_status ?? "";
  if (ASHORE.test(status) && !/vessel/i.test(status)) return false;
  if (ON_VESSEL.test(status)) return true;
  const departed = Date.parse((c.atd_last_location ?? "").replace(" ", "T"));
  const eta = Date.parse((c.eta_next_destination ?? "").replace(" ", "T"));
  return Number.isFinite(departed) && departed <= Date.now() && (!Number.isFinite(eta) || eta > Date.now() - DAY * 1000);
}

async function currentLocation(c: RawContainer): Promise<CurrentLocation> {
  const vesselName = c.current_vessel_name?.trim();
  if (vesselName && onVessel(c)) {
    try {
      const imo = await cachedVesselImo(vesselName);
      if (imo) {
        const v = toVessel(await cachedVesselPosition(imo), vesselName);
        if (v) return { kind: "vessel", label: `On board ${v.name}${c.next_location ? ` → ${c.next_location}` : ""}`, vessel: v };
      }
    } catch {
      /* fall through to the last port the carrier reported */
    }
    const point = await placePoint(c.last_location);
    return {
      kind: "place", point, terminal: c.last_location_terminal ?? null, since: c.atd_last_location ?? null,
      label: `On board ${vesselName}${c.last_location ? `, departed ${c.last_location}` : ""} (live ship position unavailable)`,
    };
  }
  if (c.last_location) {
    return {
      kind: "place", label: c.last_location, terminal: c.last_location_terminal ?? null,
      point: await placePoint(c.last_location), since: c.timestamp_of_last_location ?? c.last_movement_timestamp ?? null,
    };
  }
  return { kind: "unknown", label: "No location reported yet" };
}

async function buildTrack(number: string, carrier: Carrier, c: RawContainer): Promise<ContainerTrack> {
  const [current, origin, last, next, destination] = await Promise.all([
    currentLocation(c),
    placePoint(c.shipped_from),
    placePoint(c.last_location),
    placePoint(c.next_location),
    placePoint(c.shipped_to),
  ]);
  const stops: ContainerTrack["stops"] = [];
  const add = (role: ContainerTrack["stops"][number]["role"], label: string | null | undefined, point: LatLon | null) => {
    if (label && point && !stops.some((s) => s.label === label)) stops.push({ role, label, point });
  };
  add("origin", c.shipped_from, origin);
  add("last", c.last_location, last);
  add("next", c.next_location, next);
  add("destination", c.shipped_to, destination);

  return {
    number, carrier, carrierName: c.shipping_line_name || CARRIERS[carrier],
    type: str(c.container_type), status: str(c.container_status), billOfLading: str(c.bill_of_lading),
    origin: str(c.shipped_from), originTerminal: str(c.shipped_from_terminal),
    destination: str(c.shipped_to), destinationTerminal: str(c.shipped_to_terminal),
    loadingPort: str(c.loading_port), dischargePort: str(c.discharging_port),
    departedOrigin: str(c.atd_origin), etaFinal: str(c.eta_final_destination),
    lastLocation: str(c.last_location), lastLocationTerminal: str(c.last_location_terminal),
    lastLocationAt: str(c.timestamp_of_last_location ?? c.last_movement_timestamp),
    departedLastLocation: str(c.atd_last_location),
    nextLocation: str(c.next_location), nextLocationTerminal: str(c.next_location_terminal), etaNext: str(c.eta_next_destination),
    vesselName: str(c.current_vessel_name ?? c.last_vessel_name), voyage: str(c.current_voyage_number ?? c.last_voyage_number),
    customsCleared: str(c.customs_clearance),
    current, stops, carrierUpdatedAt: str(c.last_updated), fetchedAt: new Date().toISOString(),
  };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function trackContainer(number: string, carrier: Carrier, viaBl?: string) {
  return buildTrack(number, carrier, await cachedContainer(number, carrier, viaBl));
}

/** Runs `fn` over `items` a few at a time so a big bill of lading doesn't hammer the API. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = { status: "fulfilled", value: await fn(items[idx]) };
      } catch (reason) {
        out[idx] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export interface TrackRequest {
  number: string;
  /** Override the carrier detected from the number's prefix. */
  carrier?: Carrier | null;
  /** Treat the number as a bill of lading even if it looks like a container number. */
  kind?: "container" | "bl" | null;
}

/**
 * Drops cached data for a number (and cached ship positions) so the *next* track() call fetches fresh.
 * Next applies tag invalidation when the request ends, so this must be its own request.
 */
export function invalidate(req: TrackRequest) {
  const parsed = parseNumber(req.number);
  if (!parsed || trackerMode() !== "live") return;
  const kind = req.kind ?? parsed.kind;
  revalidateTag(kind === "bl" ? `bl:${parsed.number}` : `ctr:${parsed.number}`, { expire: 0 });
  // A bill of lading's containers are tagged by their own numbers, which we may not know here; tag them via the BL.
  if (kind === "bl") revalidateTag(`bl-ctr:${parsed.number}`, { expire: 0 });
  revalidateTag("vessel-pos", { expire: 0 });
}

export async function track(req: TrackRequest): Promise<TrackResult> {
  const parsed = parseNumber(req.number);
  if (!parsed) return { ok: false, error: "That doesn't look like a container or bill of lading number." };
  const kind = req.kind ?? parsed.kind;
  const number = parsed.number;
  const carrier = req.carrier ?? parsed.carrier;

  if (isDemo()) return demoTrack(number, kind, carrier);
  if (trackerMode() === "free") return { ok: false, error: "Live tracking is off (no JSONCARGO_API_KEY). Use the carrier's tracking page." };

  if (!carrier) {
    return {
      ok: false, needsCarrier: true,
      error: kind === "container"
        ? `${number.slice(0, 4)} is a leasing-company or unrecognised prefix — pick the shipping line.`
        : "Pick the shipping line for this bill of lading.",
    };
  }

  try {
    if (kind === "container") {
      const t = await trackContainer(number, carrier);
      return { ok: true, kind: "container", demo: false, containers: [t] };
    }
    const bol = await cachedBol(number, carrier);
    const list = [...new Set((bol.associated_container_numbers ?? []).map((n) => n.toUpperCase().replace(/\s+/g, "")))];
    if (!list.length) return { ok: false, error: `No containers found on bill of lading ${number} at ${CARRIERS[carrier]}.` };
    const results = await mapLimit(list, 3, (n) => trackContainer(n, carrier, number));
    const containers: ContainerTrack[] = [];
    const failed: { number: string; error: string }[] = [];
    results.forEach((r, idx) => (r.status === "fulfilled" ? containers.push(r.value) : failed.push({ number: list[idx], error: errMsg(r.reason) })));
    return { ok: true, kind: "bl", demo: false, billOfLading: number, carrier, containers, failed };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
