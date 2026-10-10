import "server-only";
import type { Carrier } from "./numbers";

// Thin client for the JSONCargo API (https://jsoncargo.com/documentation-api/).
// Every call counts against the plan's request allowance, so callers cache results.

export class JsonCargoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface RawContainer {
  container_id?: string;
  container_type?: string | null;
  container_status?: string | null;
  shipping_line_name?: string | null;
  shipped_from?: string | null;
  shipped_from_terminal?: string | null;
  shipped_to?: string | null;
  shipped_to_terminal?: string | null;
  atd_origin?: string | null;
  eta_final_destination?: string | null;
  last_location?: string | null;
  last_location_terminal?: string | null;
  next_location?: string | null;
  next_location_terminal?: string | null;
  atd_last_location?: string | null;
  eta_next_destination?: string | null;
  timestamp_of_last_location?: string | null;
  last_movement_timestamp?: string | null;
  loading_port?: string | null;
  discharging_port?: string | null;
  customs_clearance?: string | null;
  bill_of_lading?: string | null;
  last_vessel_name?: string | null;
  last_voyage_number?: string | null;
  current_vessel_name?: string | null;
  current_voyage_number?: string | null;
  last_updated?: string | null;
}

export interface RawBol {
  bill_of_lading?: string;
  shipping_line_name?: string | null;
  associated_containers?: number;
  associated_container_numbers?: string[];
}

export interface RawVessel {
  name?: string | null;
  mmsi?: string | number | null;
  imo?: string | number | null;
  type?: string | null;
  type_specific?: string | null;
  lat?: number | null;
  lon?: number | null;
  speed?: number | null;
  course?: number | null;
  heading?: number | null;
  navigation_status?: string | null;
  destination?: string | null;
  last_position_UTC?: string | null;
  last_position_epoch?: number | null;
  eta_UTC?: string | null;
  teu?: number | null;
}

export interface RawPort {
  port_name?: string;
  unlocode?: string;
  country_iso?: string;
  lat?: number;
  lon?: number;
  port_type?: string;
}

export function jsonCargoKey() {
  return process.env.JSONCARGO_API_KEY ?? "";
}

async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const base = (process.env.JSONCARGO_BASE_URL || "https://api.jsoncargo.com/api/v1").replace(/\/+$/, "");
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-api-key": jsonCargoKey(), accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new JsonCargoError(`Couldn't reach the tracking service (${e instanceof Error ? e.message : e})`, 0);
  }

  let body: { data?: T; error?: unknown; message?: unknown } | null = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const raw = body?.error ?? body?.message;
    const detail = typeof raw === "string" ? raw
      : raw && typeof raw === "object" ? String((raw as Record<string, unknown>).title ?? (raw as Record<string, unknown>).message ?? "")
      : "";
    const msg =
      res.status === 401 || res.status === 403 ? "The JSONCargo API key was rejected — check JSONCARGO_API_KEY."
      : res.status === 404 ? detail || "Not found at the carrier. Check the number and the shipping line."
      : res.status === 429 ? "Tracking request limit reached for now — try again shortly, or upgrade the JSONCargo plan."
      : detail || `Tracking service error (HTTP ${res.status})`;
    throw new JsonCargoError(msg, res.status);
  }
  if (!body || !("data" in body)) throw new JsonCargoError("Unexpected response from the tracking service", res.status);
  return body.data as T;
}

const safeSegment = (s: string) => encodeURIComponent(s);

export const fetchContainer = (number: string, carrier: Carrier) =>
  get<RawContainer>(`/containers/${safeSegment(number)}`, { shipping_line: carrier });

export const fetchBol = (bl: string, carrier: Carrier) =>
  get<RawBol>(`/containers/bol/${safeSegment(bl)}`, { shipping_line: carrier });

export const fetchVesselByImo = (imo: string) => get<RawVessel>("/vessel/basic", { imo });

export const findVessels = (name: string) => get<RawVessel[]>("/vessel/finder", { name });

export const findPorts = (name: string, countryIso?: string) =>
  get<RawPort[]>("/port/find", { name, country_iso: countryIso });

export const usageStats = () =>
  get<{ plan?: string; requests_total?: number; requests_made?: number; requests_available?: number }>("/api_key/stats");
