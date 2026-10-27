import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";

import { cx, focusRing } from "./cx";

export interface SelectOption {
  value: string;
  label: string;
  title?: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label: ReactNode;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

export const fieldLabelClass =
  "mb-1.5 text-label font-medium tracking-[0.04em] text-ink-2 uppercase";

export const fieldClass =
  "h-8 min-w-0 rounded-control border border-line-strong bg-panel px-2.5 text-body text-ink transition-colors hover:border-ink-2/40 disabled:cursor-not-allowed disabled:opacity-50";

/** A labelled native <select> with a custom chevron. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, value, onChange, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={cx("flex min-w-0 flex-col", className)}>
      <label htmlFor={selectId} className={fieldLabelClass}>
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className={cx(fieldClass, "w-full appearance-none pr-8", focusRing)}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} title={o.title}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted"
        >
          <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
});
