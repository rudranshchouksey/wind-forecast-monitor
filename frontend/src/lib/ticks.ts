const STEPS = [1, 2, 2.5, 5, 10];

/** Evenly spaced "round" ticks covering [min, max], about `target` intervals. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max < min) [min, max] = [max, min];
  if (max === min) max = min + (Math.abs(min) || 1);
  const span = max - min;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = (STEPS.find((s) => s * mag >= raw) ?? 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export const extent = (values: (number | null)[]): [number, number] => {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 0];
};
