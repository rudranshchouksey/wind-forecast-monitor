import { useId, type ReactNode } from "react";

import { cx, focusRingPeer } from "./cx";
import { SegmentIndicator } from "./SegmentIndicator";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional keyboard shortcut shown in the title attribute. */
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  legend: ReactNode;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (v: T) => void;
  name?: string;
  className?: string;
  /** Override the selected-segment background (default: the sliding SegmentIndicator). */
  indicator?: (props: { layoutId: string }) => ReactNode;
}

/**
 * A radio group styled as a segmented control. Native radios underneath, so arrow keys move
 * between options and screen readers announce "radio, 1 of 2".
 */
export function SegmentedControl<T extends string>({
  legend,
  value,
  options,
  onChange,
  name,
  className,
  indicator,
}: SegmentedControlProps<T>) {
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className="mb-1.5 text-label font-medium tracking-[0.04em] text-ink-2 uppercase">
        {legend}
      </legend>
      <div className="inline-flex max-w-full flex-wrap rounded-control border border-line bg-bg p-0.5">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <label
              key={o.value}
              title={o.title}
              className={cx(
                "relative cursor-pointer rounded-[4px] px-2.5 py-1 text-body leading-5 whitespace-nowrap transition-colors duration-150",
                selected ? "text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {/* The input comes first so the ring and indicator can follow it as peers. */}
              <input
                type="radio"
                name={groupName}
                value={o.value}
                checked={selected}
                onChange={() => {
                  onChange(o.value);
                }}
                className="peer sr-only"
              />
              {selected &&
                (indicator ? (
                  indicator({ layoutId: `${groupName}-indicator` })
                ) : (
                  <SegmentIndicator layoutId={`${groupName}-indicator`} />
                ))}
              <span className="relative">{o.label}</span>
              <span
                aria-hidden="true"
                className={cx("pointer-events-none absolute inset-0 rounded-[4px]", focusRingPeer)}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
