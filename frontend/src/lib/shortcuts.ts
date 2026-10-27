import { useEffect, useRef } from "react";

import type { CutoffPreset } from "../api/types";

export type ShortcutMap = Record<string, () => void>;

/** True when a key press belongs to a text field or a native control, not to a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    // Radios, checkboxes and buttons don't take text; range sliders use the arrow keys, not these.
    return !["radio", "checkbox", "button", "submit", "reset", "range"].includes(type);
  }
  return false;
}

/**
 * Single-key shortcuts on the document. Keys are matched on `event.key` ("1", "m", "?"); they are
 * ignored while typing and when Ctrl, Meta or Alt is held, so browser shortcuts keep working.
 */
export function useShortcuts(map: ShortcutMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      const action = ref.current[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [enabled]);
}

/** The shortcut list shown by the "?" overlay. */
export function shortcutList(presets: CutoffPreset[]): [string[], string][] {
  return [
    ...presets
      .slice(0, 9)
      .map((p, i): [string[], string] => [[String(i + 1)], `Cutoff: ${p.label}`]),
    [["M"], "Switch between “At decision cutoff” and “At fixed lead time”"],
    [["B"], "Switch the buffer basis"],
    [["T"], "Switch between dark and light mode"],
    [["R"], "Reset all settings"],
    [["?"], "Show this help"],
    [["Esc"], "Close this help or the settings drawer"],
  ];
}
