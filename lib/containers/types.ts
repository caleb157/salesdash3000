import type { Carrier } from "./numbers";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface VesselPosition extends LatLon {
  name: string;
  imo: string | null;
  mmsi: string | null;
  speed: number | null;
  course: number | null;
  heading: number | null;
  navStatus: string | null;
  destination: string | null;
  /** When the ship's AIS transponder last reported this position (ISO). */
  positionAt: string | null;
  eta: string | null;
}

/** Where the container is right now, as precisely as the data allows. */
export type CurrentLocation =
  | { kind: "vessel"; label: string; vessel: VesselPosition }
  | { kind: "place"; label: string; terminal: string | null; point: LatLon | null; since: string | null }
  | { kind: "unknown"; label: string };

export interface ContainerTrack {
  number: string;
  carrier: Carrier;
  carrierName: string;
  type: string | null;
  status: string | null;
  billOfLading: string | null;
  origin: string | null;
  originTerminal: string | null;
  destination: string | null;
  destinationTerminal: string | null;
  loadingPort: string | null;
  dischargePort: string | null;
  departedOrigin: string | null;
  etaFinal: string | null;
  lastLocation: string | null;
  lastLocationTerminal: string | null;
  lastLocationAt: string | null;
  departedLastLocation: string | null;
  nextLocation: string | null;
  nextLocationTerminal: string | null;
  etaNext: string | null;
  vesselName: string | null;
  voyage: string | null;
  customsCleared: string | null;
  current: CurrentLocation;
  /** Map points for the voyage: origin, last, next, destination (whichever we could place). */
  stops: { role: "origin" | "last" | "next" | "destination"; label: string; point: LatLon }[];
  /** When the carrier data was last refreshed by the provider. */
  carrierUpdatedAt: string | null;
  /** When this app fetched it. */
  fetchedAt: string;
}

export type TrackResult =
  | { ok: true; kind: "container"; demo: boolean; containers: ContainerTrack[] }
  | { ok: true; kind: "bl"; demo: boolean; billOfLading: string; carrier: Carrier; containers: ContainerTrack[]; failed: { number: string; error: string }[] }
  | { ok: false; error: string; needsCarrier?: boolean };
