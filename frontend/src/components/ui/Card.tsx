import { useId, type HTMLAttributes, type ReactNode } from "react";

import { cx } from "./cx";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Card title; when given, the card is a labelled <section>. */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Controls on the right of the header (e.g. "Show table"). */
  actions?: ReactNode;
  /** Heading level for the title (default h2). */
  level?: 2 | 3;
  /** Visual weight: "primary" adds the accent top edge. */
  tone?: "default" | "primary";
  padded?: boolean;
  children?: ReactNode;
}

export const cardClass = "relative min-w-0 rounded-card border border-line bg-panel shadow-card";

export function Card({
  title,
  subtitle,
  actions,
  level = 2,
  tone = "default",
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  const headingId = useId();
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cx(
        cardClass,
        tone === "primary" &&
          "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:rounded-t-card before:bg-accent",
        padded && "p-4 sm:p-5",
        className,
      )}
      {...rest}
    >
      {(title ?? actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title && (
              <Heading id={headingId} className="text-heading font-semibold text-ink">
                {title}
              </Heading>
            )}
            {subtitle && <p className="mt-0.5 text-body text-ink-2">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
