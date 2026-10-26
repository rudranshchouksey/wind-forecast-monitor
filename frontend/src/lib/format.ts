export const TZ = "Europe/London";

const mwFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });

export const dash = "–";

export function formatMw(v: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return dash;
  const s = mwFmt.format(Math.abs(v));
  const sign = opts.signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "";
  return `${sign}${s} MW`;
}

/** Axis ticks: compact GW, e.g. 0, 5, 10 GW. */
export function formatGwTick(v: number): string {
  const gw = v / 1000;
  return Number.isInteger(gw) ? gw.toFixed(0) : gw.toFixed(1);
}

export function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return dash;
  return pctFmt.format(v);
}

export function formatHours(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return dash;
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)} h`;
}

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const dayLongFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Fri 2 Jan, 09:30" in Europe/London. */
export const formatLondon = (iso: string | number): string => dateTimeFmt.format(new Date(iso));
export const formatDay = (iso: string | number): string => dayFmt.format(new Date(iso));

/** A delivery day key ("2026-01-02") as "Fri 2 Jan"; noon UTC avoids any date shift. */
export const formatDeliveryDay = (key: string): string =>
  dayLongFmt.format(new Date(`${key}T12:00:00Z`));

export const formatHourOfDay = (h: string | number): string => `${String(h).padStart(2, "0")}:00`;
