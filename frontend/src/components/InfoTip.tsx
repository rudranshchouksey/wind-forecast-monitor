import { useId, useState } from "react";

/**
 * Small "i" button that reveals a definition on hover, focus or tap. The text is always in the
 * DOM and linked with aria-describedby, so screen readers get it without opening anything.
 * The popover is positioned against the nearest `relative` ancestor (the tile), so it never
 * extends past the tile, which keeps narrow screens free of horizontal scroll.
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="ml-0.5 inline-flex align-[-2px]">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => {
          // Open only: on touch a tap fires focus then click, so toggling would close it again.
          setOpen(true);
        }}
        onMouseEnter={() => {
          setOpen(true);
        }}
        onMouseLeave={() => {
          setOpen(false);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] leading-none font-semibold text-muted hover:text-ink"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute inset-x-2 top-9 z-20 rounded-lg border border-line bg-surface p-2.5 text-xs font-normal text-ink-2 shadow-lg ${
          open ? "block" : "sr-only"
        }`}
      >
        {text}
      </span>
    </span>
  );
}
