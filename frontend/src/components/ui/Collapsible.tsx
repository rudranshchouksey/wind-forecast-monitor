import { useId, useState, type ReactNode } from "react";

import { cx, focusRing } from "./cx";

export interface CollapsibleProps {
  title: ReactNode;
  /** A short line under the title, visible while collapsed. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * A card-styled disclosure. The content stays mounted (so find-in-page and tests still see it)
 * and the height animates with a grid-rows transition, which needs no measuring.
 */
export function Collapsible({
  title,
  summary,
  defaultOpen = false,
  children,
  className,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section
      className={cx("min-w-0 rounded-card border border-line bg-panel shadow-card", className)}
    >
      <h2 className="text-heading font-semibold text-ink">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setOpen((o) => !o);
          }}
          className={cx(
            "flex w-full items-center justify-between gap-4 rounded-card px-4 py-3.5 text-left sm:px-5",
            "transition-colors hover:bg-raised/50",
            focusRing,
          )}
        >
          <span className="min-w-0">
            <span className="block">{title}</span>
            {summary && (
              <span className="mt-0.5 block text-body font-normal text-ink-2">{summary}</span>
            )}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className={cx(
              "h-4 w-4 shrink-0 text-muted transition-transform duration-[350ms] ease-[var(--ease-out-expo)]",
              open && "rotate-180",
            )}
          >
            <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </h2>
      <div
        id={id}
        role="region"
        aria-label={typeof title === "string" ? title : undefined}
        // Closed content is inert: not focusable and hidden from assistive tech.
        {...(open ? {} : { inert: "" })}
        className={cx(
          "grid transition-[grid-template-rows,opacity] duration-[350ms] ease-[var(--ease-out-expo)]",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-5 sm:px-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
