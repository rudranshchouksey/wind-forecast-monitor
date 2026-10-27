import { useId, type CSSProperties, type ReactNode } from "react";

import { cx } from "./cx";
import { fieldLabelClass } from "./Select";

export interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** Shown under the slider while it is disabled, and linked as its description. */
  disabledHint?: ReactNode;
  valueText?: string;
  className?: string;
}

/** A labelled native range input with a filled track (keyboard: arrows, Page Up/Down, Home/End). */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  disabledHint,
  valueText,
  className,
}: SliderProps) {
  const id = useId();
  const fill = `${(((value - min) / (max - min)) * 100).toFixed(1)}%`;
  return (
    <div className={cx("flex min-w-0 flex-col", className)}>
      <label htmlFor={id} className={cx(fieldLabelClass, disabled && "opacity-60")}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={disabled && disabledHint ? `${id}-hint` : undefined}
        aria-valuetext={valueText}
        className="range w-full"
        style={{ "--fill": fill } as CSSProperties}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
      />
      {disabled && disabledHint && (
        <span id={`${id}-hint`} className="mt-0.5 text-micro text-muted">
          {disabledHint}
        </span>
      )}
    </div>
  );
}
