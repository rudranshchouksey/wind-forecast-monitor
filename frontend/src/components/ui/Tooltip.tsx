import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { cx, focusRing } from "./cx";

interface TriggerProps {
  "aria-describedby"?: string;
  "aria-expanded"?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onClick?: () => void;
  onKeyDown?: (e: { key: string }) => void;
}

export interface TooltipProps {
  content: ReactNode;
  /** A single focusable element (button, link) that opens the tooltip on hover, focus or tap. */
  children: ReactElement<TriggerProps>;
  side?: "top" | "bottom";
  /**
   * "contained": span the nearest `relative` ancestor (e.g. a tile) so the popover never extends
   * past it, which keeps narrow screens free of horizontal scroll. "anchored": centre on the
   * trigger.
   */
  placement?: "contained" | "anchored";
  className?: string;
}

/**
 * Hover, focus or tap reveals the content; Escape and blur dismiss it. The text is always in the
 * DOM and linked with aria-describedby, so screen readers get it without opening anything.
 */
export function Tooltip({
  content,
  children,
  side = "bottom",
  placement = "contained",
  className,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!isValidElement(children)) return null;
  const show = () => {
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
  };
  const trigger = cloneElement(children, {
    "aria-describedby": id,
    "aria-expanded": open,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    // Open only: on touch a tap fires focus then click, so toggling would close it again.
    onClick: show,
    onKeyDown: (e: { key: string }) => {
      if (e.key === "Escape") hide();
    },
  });
  const popover = (
    <span
      id={id}
      role="tooltip"
      className={cx(
        "pointer-events-none absolute z-30 rounded-control bg-panel px-3 py-2 text-label leading-relaxed font-normal tracking-normal text-ink-2 normal-case shadow-pop",
        placement === "contained"
          ? "inset-x-2 top-10"
          : cx(
              "left-1/2 w-64 max-w-[80vw] -translate-x-1/2",
              side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
            ),
        open ? "block animate-[tip-in_150ms_var(--ease-out-expo)]" : "sr-only",
        className,
      )}
    >
      {content}
    </span>
  );
  if (placement === "contained") {
    return (
      <>
        {trigger}
        {popover}
      </>
    );
  }
  return (
    <span className="relative inline-flex">
      {trigger}
      {popover}
    </span>
  );
}

/** The ⓘ button that reveals a definition. */
export function InfoTip({
  label,
  text,
  side,
}: {
  label: string;
  text: ReactNode;
  side?: "top" | "bottom";
}) {
  return (
    <Tooltip content={text} side={side}>
      <button
        type="button"
        aria-label={`About ${label}`}
        className={cx(
          "ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-line-strong align-[-3px] text-[10px] leading-none font-semibold text-muted transition-colors hover:border-ink-2 hover:text-ink",
          focusRing,
        )}
      >
        i
      </button>
    </Tooltip>
  );
}
