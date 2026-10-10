// Container numbers (ISO 6346) and bill of lading numbers: parsing, validation, carrier detection.
// Pure functions — safe to import from client and server.

export type Carrier =
  | "MAERSK" | "MSC" | "CMA_CGM" | "COSCO" | "HAPAG_LLOYD" | "ONE"
  | "EVERGREEN" | "HMM" | "YANG_MING" | "ZIM" | "PIL";

/** Carriers the tracking API supports, with display names. */
export const CARRIERS: Record<Carrier, string> = {
  MAERSK: "Maersk",
  MSC: "MSC",
  CMA_CGM: "CMA CGM / APL / ANL",
  COSCO: "COSCO",
  HAPAG_LLOYD: "Hapag-Lloyd",
  ONE: "ONE (Ocean Network Express)",
  EVERGREEN: "Evergreen",
  HMM: "HMM",
  YANG_MING: "Yang Ming",
  ZIM: "ZIM",
  PIL: "PIL",
};

export const isCarrier = (v: unknown): v is Carrier => typeof v === "string" && v in CARRIERS;

// Container owner codes (first 4 letters) owned by each carrier. Leasing-company boxes
// (TCNU, TGHU, CAIU, SEGU, …) can sail with any line, so those need the carrier picked by hand.
const CONTAINER_PREFIXES: Record<Carrier, string[]> = {
  MAERSK: ["MAEU", "MSKU", "MRKU", "MRSU", "MCPU", "MNBU", "MWCU", "MIEU", "MCAU", "MCHU", "MMAU", "MSWU", "MVIU", "SEAU", "SUDU", "SEKU", "PONU", "TORU", "KNLU", "HASU"],
  MSC: ["MSCU", "MEDU", "MSDU", "MSMU", "MSNU", "MSBU", "MSZU", "MSPU", "MSYU", "MSTU", "MSHU"],
  CMA_CGM: ["CMAU", "CGMU", "ECMU", "CMNU", "APZU", "APHU", "APRU", "ANNU", "CNIU", "MCSU", "OPDU"],
  COSCO: ["CBHU", "CCLU", "CSNU", "CSLU", "CNSU", "OOLU", "OOCU"],
  HAPAG_LLOYD: ["HLCU", "HLXU", "HLBU", "HAMU", "UACU", "UASU", "UAEU", "CPSU", "CASU", "CSQU", "LNXU", "QIBU"],
  ONE: ["ONEU", "NYKU", "MOLU", "KKFU", "KKLU", "MOAU", "MOEU", "MOFU", "MORU", "MOTU", "AKLU"],
  EVERGREEN: ["EGHU", "EISU", "EMCU", "EGSU", "UGMU", "HMCU", "LTIU"],
  HMM: ["HMMU", "HDMU", "KOCU"],
  YANG_MING: ["YMLU", "YMMU", "YMSU", "YMPU"],
  ZIM: ["ZIMU", "ZCSU", "ZWFU", "ZCLU", "ZMOU", "JXLU"],
  PIL: ["PCIU", "PILU", "PDLU"],
};

// Prefixes printed at the start of carrier bill of lading / booking numbers (mostly the line's SCAC).
const BL_PREFIXES: Record<Carrier, string[]> = {
  MAERSK: ["MAEU", "MAEI", "SUDU", "SEAU", "MCPU"],
  MSC: ["MEDU", "MSCU"],
  CMA_CGM: ["CMDU", "CMAU", "APLU", "ANNU"],
  COSCO: ["COSU", "COAU", "OOLU"],
  HAPAG_LLOYD: ["HLCU"],
  ONE: ["ONEY", "ONEU"],
  EVERGREEN: ["EGLV"],
  HMM: ["HDMU", "HMMU", "SELM"],
  YANG_MING: ["YMLU", "YMJA", "YMMU"],
  ZIM: ["ZIMU"],
  PIL: ["PABV", "PCIU"],
};

const prefixIndex = (table: Record<Carrier, string[]>) => {
  const m = new Map<string, Carrier>();
  for (const [carrier, list] of Object.entries(table) as [Carrier, string[]][]) for (const p of list) m.set(p, carrier);
  return m;
};
const CONTAINER_INDEX = prefixIndex(CONTAINER_PREFIXES);
const BL_INDEX = prefixIndex(BL_PREFIXES);

/** Uppercase, strip spaces/dashes/dots, e.g. "msku 123456-7" -> "MSKU1234567". */
export const normalize = (raw: string) => raw.toUpperCase().replace(/[\s\-./]+/g, "");

const LETTER_VALUES: Record<string, number> = (() => {
  // ISO 6346: A=10, skipping multiples of 11 (so B=12, …, K=21, L=23, …).
  const out: Record<string, number> = {};
  let v = 10;
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (v % 11 === 0) v++;
    out[ch] = v++;
  }
  return out;
})();

/** The ISO 6346 check digit for the first 10 characters of a container number. */
export function checkDigit(first10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = first10[i];
    const val = /\d/.test(ch) ? Number(ch) : LETTER_VALUES[ch];
    sum += val * 2 ** i;
  }
  return (sum % 11) % 10;
}

export const looksLikeContainer = (n: string) => /^[A-Z]{3}[UJZ]\d{7}$/.test(n);

export interface ParsedNumber {
  number: string;
  kind: "container" | "bl";
  /** Carrier detected from the prefix, if it's one we recognise. */
  carrier: Carrier | null;
  /** For containers: whether the ISO 6346 check digit matches. */
  checkDigitOk?: boolean;
  /** Check digit the number should end in, when it doesn't. */
  expectedCheckDigit?: number;
}

export function parseNumber(raw: string): ParsedNumber | null {
  const number = normalize(raw);
  if (number.length < 6 || number.length > 30 || !/^[A-Z0-9]+$/.test(number)) return null;
  if (looksLikeContainer(number)) {
    const expected = checkDigit(number.slice(0, 10));
    const ok = expected === Number(number[10]);
    return {
      number, kind: "container", carrier: CONTAINER_INDEX.get(number.slice(0, 4)) ?? null,
      checkDigitOk: ok, expectedCheckDigit: ok ? undefined : expected,
    };
  }
  return { number, kind: "bl", carrier: BL_INDEX.get(number.slice(0, 4)) ?? null };
}

export interface ParseOutcome {
  parsed: ParsedNumber[];
  rejected: string[];
  /** True when the input looked like document text rather than a list of numbers. */
  fromDocument: boolean;
  /** Shown when a document only has a forwarder's house bill (which carriers can't track). */
  hint?: string;
}

const CONTAINER_IN_TEXT = /(?<![A-Z0-9])([A-Z]{3}[UJZ])[ \t-]?(\d{6})[ \t-]?(\d)(?![0-9])/g;
const MASTER_BL_LABEL = /(?:MBL|M\.?B\/L|MASTER\s*(?:B\/?L|BILL\s+OF\s+LADING)|OCEAN\s*B\/?L|CARRIER\s*B\/?L)\s*(?:NO\.?|NUMBER|NBR|#)?\s*[:.#-]?\s*([A-Z0-9]{8,20})\b/g;
const HOUSE_BL = /HOUSE\s*(?:B\/?L|BILL)|\bHBL\b|MULTI-?MODAL\s+TRANSPORT\s+DOCUMENT|\bMTD\s+(?:NO|NUMBER)/;

/**
 * Pull trackable numbers out of free text such as a bill of lading or invoice: container numbers
 * with a valid check digit, master B/L numbers next to a label, and B/L numbers with a known carrier prefix.
 */
export function extractFromDocument(text: string): ParseOutcome {
  const up = text.toUpperCase();
  const seen = new Set<string>();
  const parsed: ParsedNumber[] = [];
  const push = (p: ParsedNumber | null) => {
    if (p && !seen.has(p.number)) { seen.add(p.number); parsed.push(p); }
  };
  for (const m of up.matchAll(CONTAINER_IN_TEXT)) {
    const p = parseNumber(m[1] + m[2] + m[3]);
    if (p?.checkDigitOk) push(p); // in a document, a failed check digit almost always means "not a container number"
  }
  for (const m of up.matchAll(MASTER_BL_LABEL)) {
    const p = parseNumber(m[1]);
    if (p && /\d{4}/.test(p.number)) push({ ...p, kind: "bl" });
  }
  for (const tok of up.split(/[\s,;:()/]+/)) {
    const p = parseNumber(tok);
    // Skip a container number glued to something else (e.g. "CMAU4761912M8890178" from "container/seal").
    if (p?.kind === "bl" && p.carrier && !looksLikeContainer(p.number.slice(0, 11)) && (p.number.match(/\d/g)?.length ?? 0) >= 5) push(p);
  }
  const hasBl = parsed.some((p) => p.kind === "bl");
  const hint = !hasBl && HOUSE_BL.test(up)
    ? "This looks like a forwarder's house bill / MTD. Carriers can't track those numbers, so the container numbers on it are used instead."
    : undefined;
  return { parsed, rejected: [], fromDocument: true, hint };
}

/**
 * Split pasted input into numbers. A plain list (one per line, commas, spaces) is taken as typed;
 * anything with ordinary words in it is treated as document text and only real numbers are pulled out.
 */
export function parseMany(text: string): ParseOutcome {
  // Rejoin "MSKU 123456 7" style spacing before splitting on whitespace.
  const joined = text.toUpperCase().replace(/\b([A-Z]{3}[UJZ])[\s-]+(\d{6})[\s-]*(\d)\b/g, "$1$2$3");
  const tokens = joined.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length > 40 || tokens.some((t) => /^[A-Z&.'-]{2,}:?$/.test(t))) return extractFromDocument(text);

  const seen = new Set<string>();
  const parsed: ParsedNumber[] = [];
  const rejected: string[] = [];
  for (const tok of tokens) {
    const p = parseNumber(tok);
    // Every real B/L or booking number has digits in it.
    if (!p || (p.kind === "bl" && !/\d/.test(p.number))) { rejected.push(tok); continue; }
    if (seen.has(p.number)) continue;
    seen.add(p.number);
    parsed.push(p);
  }
  return { parsed, rejected, fromDocument: false };
}

/** Free official tracking page on the carrier's own website. */
export function carrierTrackingUrl(carrier: Carrier, number: string, kind: "container" | "bl"): string {
  const n = encodeURIComponent(number);
  switch (carrier) {
    case "MAERSK": return `https://www.maersk.com/tracking/${n}`;
    case "MSC": return `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`;
    case "CMA_CGM": return `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=${kind === "bl" ? "BL" : "Container"}&Reference=${n}`;
    case "COSCO": return `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=${kind === "bl" ? "BILLOFLADING" : "CONTAINER"}&number=${n}`;
    case "HAPAG_LLOYD": return kind === "bl"
      ? `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${n}`
      : `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${n}`;
    case "ONE": return `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=${n}`;
    case "EVERGREEN": return "https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do";
    case "HMM": return "https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do";
    case "YANG_MING": return "https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx";
    case "ZIM": return `https://www.zim.com/tools/track-a-shipment?consnumber=${n}`;
    case "PIL": return "https://www.pilship.com/digital-solutions/?tab=customer&id=track-trace";
  }
}

/** Pages on the carrier site that don't take the number in the URL (you paste it in). */
export const CARRIER_NEEDS_PASTE: Carrier[] = ["EVERGREEN", "HMM", "YANG_MING", "PIL"];

export const vesselLinks = (imo?: string | null, mmsi?: string | null) => {
  const links: { label: string; url: string }[] = [];
  if (imo) {
    links.push({ label: "MarineTraffic", url: `https://www.marinetraffic.com/en/ais/details/ships/imo:${imo}` });
    links.push({ label: "VesselFinder", url: `https://www.vesselfinder.com/vessels/details/${imo}` });
  } else if (mmsi) {
    links.push({ label: "MarineTraffic", url: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}` });
    links.push({ label: "VesselFinder", url: `https://www.vesselfinder.com/vessels/details/${mmsi}` });
  }
  return links;
};
