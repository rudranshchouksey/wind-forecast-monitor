import type { ReactNode } from "react";

import { cx, focusRingWithin } from "./cx";

export interface SwitchProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** A native checkbox with role="switch", drawn as a toggle. */
export function Switch({ label, checked, onChange, disabled = false, className }: SwitchProps) {
  return (
    <label
      className={cx(
        "inline-flex cursor-pointer items-center gap-2.5 rounded-control text-body text-ink select-none",
        disabled && "cursor-not-allowed opacity-50",
        focusRingWithin,
        className,
      )}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cx(
          "relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-150",
          checked ? "border-accent bg-accent" : "border-line-strong bg-raised",
        )}
      >
        <span
          className={cx(
            "absolute top-[2px] left-[2px] h-3 w-3 rounded-full transition-transform duration-[220ms] ease-[var(--ease-out-expo)]",
            checked ? "translate-x-[14px] bg-accent-ink" : "bg-ink-2",
          )}
        />
      </span>
      {label}
    </label>
  );
}
