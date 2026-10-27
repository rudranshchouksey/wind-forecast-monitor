import { useEffect, useRef, useState } from "react";

import { settingsSummary } from "../lib/labels";
import { Controls, type ControlsProps } from "./Controls";
import { Button, ButtonLink, cx, focusRing } from "./ui";

const wide = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

/**
 * Controls and the compact sticky bar.
 *
 * - From 1024 px the full controls sit in a panel at the top of the page. Once it scrolls out of
 *   view, a slim sticky bar with the settings summary slides in; its chip scrolls back to them.
 * - Below 1024 px the sticky bar is always there and its chip opens the controls in a bottom
 *   drawer.
 *
 * There is one <Controls> in the DOM either way: CSS moves it, so state, labels and focus order
 * never fork.
 */
export function ControlBar(props: ControlsProps) {
  const [open, setOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);
  const chipRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setPanelVisible(entry?.isIntersecting ?? true);
      },
      { rootMargin: "-52px 0px 0px 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    const chip = chipRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      chip?.focus();
    };
  }, [open]);

  const onChip = () => {
    if (wide()) {
      panelRef.current?.scrollIntoView({ block: "start" });
      panelRef.current?.querySelector<HTMLElement>("input, select, button")?.focus({
        preventScroll: true,
      });
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <div
        className={cx(
          "sticky top-13 z-30 border-b border-line bg-bg/85 backdrop-blur-md",
          "lg:fixed lg:inset-x-0 lg:transition-[transform,opacity] lg:duration-[220ms] lg:ease-[var(--ease-out-expo)]",
          panelVisible
            ? "lg:pointer-events-none lg:-translate-y-2 lg:opacity-0"
            : "lg:translate-y-0 lg:opacity-100",
        )}
      >
        <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-2 px-4 sm:px-6 lg:px-8">
          <button
            ref={chipRef}
            type="button"
            aria-expanded={wide() ? undefined : open}
            aria-controls="analysis-settings"
            tabIndex={panelVisible && wide() ? -1 : undefined}
            onClick={onChip}
            className={cx(
              "flex h-8 min-w-0 items-center gap-2 rounded-full border border-line-strong bg-panel px-3 text-body text-ink transition-colors hover:bg-raised",
              focusRing,
            )}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-ink-2">
              <path
                d="M2 4h7m3 0h2M2 12h2m3 0h7M9 2v4M5 10v4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <span className="sr-only">Analysis settings: </span>
            <span className="truncate font-mono text-label">{settingsSummary(props)}</span>
          </button>
          <ButtonLink
            variant="ghost"
            size="sm"
            href={props.csvHref}
            download
            tabIndex={panelVisible && wide() ? -1 : undefined}
            className="ml-auto max-sm:hidden"
            aria-label="Export CSV (sticky bar)"
          >
            Export CSV
          </ButtonLink>
        </div>
      </div>

      {open && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => {
            setOpen(false);
          }}
        />
      )}

      <div
        id="analysis-settings"
        ref={panelRef}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Analysis settings" : undefined}
        className={cx(
          "scroll-mt-16 lg:mx-auto lg:max-w-[1440px] lg:px-8 lg:pt-6",
          "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[85dvh] max-lg:overflow-y-auto",
          "max-lg:rounded-t-[14px] max-lg:border-t max-lg:border-line-strong max-lg:bg-panel max-lg:px-4 max-lg:pt-3 max-lg:pb-6 max-lg:shadow-pop",
          "max-lg:transition-[transform,visibility] max-lg:duration-[350ms] max-lg:ease-[var(--ease-out-expo)]",
          open ? "max-lg:translate-y-0" : "max-lg:invisible max-lg:translate-y-full",
        )}
      >
        <div aria-hidden="true" className="mb-4 flex justify-center lg:hidden">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>
        <div className="lg:rounded-card lg:border lg:border-line lg:bg-panel/80 lg:px-5 lg:py-4 lg:shadow-card">
          <Controls {...props} />
        </div>
        <div className="mt-5 lg:hidden">
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              setOpen(false);
            }}
          >
            Done
          </Button>
        </div>
      </div>
    </>
  );
}
