/**
 * Bar shape with a 4px rounded *data end* and a square baseline, for positive or negative values.
 */
interface DataEndBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  value?: number | [number, number];
}

const R = 4;

export function DataEndBar({ x = 0, y = 0, width = 0, height = 0, fill, value }: DataEndBarProps) {
  const top = Math.min(y, y + height);
  const h = Math.abs(height);
  if (h === 0 || width <= 0) return null;
  const v = Array.isArray(value) ? value[1] - value[0] : (value ?? 0);
  const r = Math.min(R, h, width / 2);
  const right = x + width;
  const bottom = top + h;
  const d =
    v >= 0
      ? `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${right - r} Q${right},${top} ${right},${top + r} V${bottom} Z`
      : `M${x},${top} H${right} V${bottom - r} Q${right},${bottom} ${right - r},${bottom} H${x + r} Q${x},${bottom} ${x},${bottom - r} Z`;
  return <path d={d} fill={fill} />;
}
