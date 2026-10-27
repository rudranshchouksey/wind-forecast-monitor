import { useEffect, useId, useRef } from "react";

import type { CutoffPreset } from "../api/types";
import { shortcutList } from "../lib/shortcuts";
import { Button, Kbd } from "./ui";

/**
 * The "?" overlay. A modal dialog: focus moves to it, Tab stays inside, Escape or the backdrop
 * closes it, and focus returns to whatever opened it.
 */
export function ShortcutHelp({
  open,
  onClose,
  presets,
}: {
  open: boolean;
  onClose: () => void;
  presets: CutoffPreset[];
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          "button, [href], [tabindex]:not([tabindex='-1'])",
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div aria-hidden="true" className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="reveal relative w-full max-w-md rounded-card border border-line-strong bg-panel p-5 shadow-pop"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-heading font-semibold text-ink">
            Keyboard shortcuts
          </h2>
          <Button ref={closeRef} variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <dl className="space-y-2">
          {shortcutList(presets).map(([keys, label]) => (
            <div key={label} className="flex items-center justify-between gap-4 text-body">
              <dt className="text-ink-2">{label}</dt>
              <dd className="flex shrink-0 gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-label text-muted">
          Shortcuts are off while you type in a field. Every setting is also kept in the address
          bar, so you can share the exact view as a link.
        </p>
      </div>
    </div>
  );
}
