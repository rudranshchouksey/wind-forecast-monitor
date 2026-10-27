import { animate } from "motion/mini";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

import { duration, ease, prefersReducedMotion } from "../../lib/motion";
import { cx, focusRingPeer } from "./cx";

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
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Slides one indicator under the selected option. The selected label is measured only when the
 * value changes or the group resizes (never on unrelated renders), and the slide runs as a Web
 * Animation via motion/mini, so it costs no layout work per frame. Under reduced motion it jumps.
 */
function useIndicator(value: string) {
  const groupRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const last = useRef<Box | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const el = indicatorRef.current;
    if (!group || !el) return;
    const place = (animateIt: boolean) => {
      const target = group.querySelector<HTMLElement>(`label[data-value="${CSS.escape(value)}"]`);
      if (!target) return;
      const box = {
        x: target.offsetLeft,
        y: target.offsetTop,
        w: target.offsetWidth,
        h: target.offsetHeight,
      };
      const to = {
        transform: `translate(${box.x}px, ${box.y}px)`,
        width: `${box.w}px`,
        height: `${box.h}px`,
      };
      const from = last.current;
      last.current = box;
      Object.assign(el.style, to);
      // No Web Animations API (jsdom, very old browsers): the indicator just jumps.
      if (!animateIt || !from || prefersReducedMotion() || typeof el.animate !== "function") return;
      animate(
        el,
        {
          transform: [`translate(${from.x}px, ${from.y}px)`, to.transform],
          width: [`${from.w}px`, to.width],
          height: [`${from.h}px`, to.height],
        },
        { duration: duration.base, ease: ease.inOut },
      );
    };
    place(true);
    if (typeof ResizeObserver === "undefined") return;
    // The first callback fires right after observe(); the box was just measured, so skip it.
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      place(false);
    });
    ro.observe(group);
    return () => {
      ro.disconnect();
    };
  }, [value]);

  return { groupRef, indicatorRef };
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
}: SegmentedControlProps<T>) {
  const autoName = useId();
  const groupName = name ?? autoName;
  const { groupRef, indicatorRef } = useIndicator(value);
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className="mb-1.5 text-label font-medium tracking-[0.04em] text-ink-2 uppercase">
        {legend}
      </legend>
      <div
        ref={groupRef}
        className="relative inline-flex max-w-full flex-wrap rounded-control border border-line bg-bg p-0.5"
      >
        <span
          ref={indicatorRef}
          aria-hidden="true"
          data-segment-indicator=""
          className="pointer-events-none absolute top-0 left-0 rounded-[4px] border border-line-strong bg-raised"
        />
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <label
              key={o.value}
              data-value={o.value}
              title={o.title}
              className={cx(
                "relative cursor-pointer rounded-[4px] px-2.5 py-1 text-body leading-5 whitespace-nowrap transition-colors duration-150",
                selected ? "text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {/* The input comes first so the focus ring can follow it as a peer. */}
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
