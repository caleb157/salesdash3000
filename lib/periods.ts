// Pure date helpers shared by server and client. Dates are YYYY-MM-DD strings.

export type Basis = "calendar" | "fiscal";

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d = 1) => {
  // normalise month overflow
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${yy}-${pad(mm)}-${pad(d)}`;
};

/** Year range [start, end) for the given basis. `year` is the year the period starts in. */
export function yearRange(basis: Basis, year: number, fyStartMonth: number) {
  const startMonth = basis === "fiscal" ? fyStartMonth : 1;
  return { start: ymd(year, startMonth), end: ymd(year, startMonth + 12) };
}

export function yearLabel(basis: Basis, year: number, fyStartMonth: number) {
  if (basis === "calendar" || fyStartMonth === 1) return basis === "fiscal" ? `FY${year}` : `${year}`;
  return `FY${year}–${String(year + 1).slice(2)}`;
}

/** Which year (by start) contains today's date. */
export function currentYear(basis: Basis, today: string, fyStartMonth: number) {
  const [y, m] = today.split("-").map(Number);
  if (basis === "calendar") return y;
  return m >= fyStartMonth ? y : y - 1;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface Slice {
  key: string;
  label: string;
  start: string;
  end: string;
  fraction: number; // share of the annual goal
}

export function monthsOf(yearStart: string): Slice[] {
  const [y, m] = yearStart.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const start = ymd(y, m + i);
    const end = ymd(y, m + i + 1);
    const mi = Number(start.slice(5, 7)) - 1;
    return { key: `m${i}`, label: `${MONTHS[mi]} ${start.slice(2, 4)}`, start, end, fraction: 1 / 12 };
  });
}

export function quartersOf(yearStart: string): Slice[] {
  const ms = monthsOf(yearStart);
  return [0, 1, 2, 3].map((q) => ({
    key: `q${q}`,
    label: `Q${q + 1} (${ms[q * 3].label.slice(0, 3)}–${ms[q * 3 + 2].label.slice(0, 3)})`,
    start: ms[q * 3].start,
    end: ms[q * 3 + 2].end,
    fraction: 1 / 4,
  }));
}

export const inRange = (d: string, start: string, end: string) => d >= start && d < end;

/** Convert an Odoo UTC datetime ("YYYY-MM-DD HH:MM:SS") to a local YYYY-MM-DD. */
export function utcToLocalDate(dt: string, timeZone: string) {
  const d = new Date(dt.replace(" ", "T") + "Z");
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
