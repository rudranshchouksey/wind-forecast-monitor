import type { BiasBucket } from "../api/types";

/** Signed GW with one decimal, e.g. "+0.5 GW". */
export function formatGwSigned(mw: number | null | undefined): string {
  if (mw === null || mw === undefined || !Number.isFinite(mw)) return "–";
  const gw = mw / 1000;
  const sign = gw > 0 ? "+" : gw < 0 ? "−" : "";
  return `${sign}${Math.abs(gw).toFixed(1)} GW`;
}

const levelText = (label: string) => label.replace("-", "–");

/**
 * "The bias grows with forecast level: +0.5 GW when the forecast is 0–5 GW, rising to +2.7 GW
 * at 15–30 GW." Returns null unless the first and last populated buckets show a rise.
 */
export function levelGrowthSentence(buckets: BiasBucket[]): string | null {
  const populated = buckets.filter((b) => b.n > 0 && b.bias_mw !== null);
  const first = populated[0];
  const last = populated[populated.length - 1];
  if (!first || !last || first === last || first.bias_mw === null || last.bias_mw === null) {
    return null;
  }
  if (last.bias_mw <= first.bias_mw) return null;
  return (
    `The bias grows with forecast level: ${formatGwSigned(first.bias_mw)} when the forecast is ` +
    `${levelText(first.label)}, rising to ${formatGwSigned(last.bias_mw)} at ${levelText(last.label)}.`
  );
}
