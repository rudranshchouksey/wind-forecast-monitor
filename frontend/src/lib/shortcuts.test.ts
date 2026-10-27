import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { meta } from "../test/fixtures";
import { isTypingTarget, shortcutList, useShortcuts } from "./shortcuts";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  document.body.append(e);
  return e;
}

describe("isTypingTarget", () => {
  it("treats text fields and selects as typing, radios and sliders as not", () => {
    expect(isTypingTarget(el("input", { type: "date" }))).toBe(true);
    expect(isTypingTarget(el("input", { type: "text" }))).toBe(true);
    expect(isTypingTarget(el("select"))).toBe(true);
    expect(isTypingTarget(el("textarea"))).toBe(true);
    expect(isTypingTarget(el("input", { type: "radio" }))).toBe(false);
    expect(isTypingTarget(el("input", { type: "range" }))).toBe(false);
    expect(isTypingTarget(el("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("useShortcuts", () => {
  it("fires on single keys, case-insensitively, and ignores typing and modifiers", () => {
    const m = vi.fn();
    const help = vi.fn();
    renderHook(() => {
      useShortcuts({ m, "?": help });
    });
    fireEvent.keyDown(document, { key: "M" });
    fireEvent.keyDown(document, { key: "?" });
    expect(m).toHaveBeenCalledTimes(1);
    expect(help).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "m", ctrlKey: true });
    fireEvent.keyDown(document, { key: "m", metaKey: true });
    fireEvent.keyDown(el("input", { type: "text" }), { key: "m" });
    expect(m).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled", () => {
    const m = vi.fn();
    renderHook(() => {
      useShortcuts({ m }, false);
    });
    fireEvent.keyDown(document, { key: "m" });
    expect(m).not.toHaveBeenCalled();
  });
});

describe("shortcutList", () => {
  it("numbers the cutoff presets and lists the other keys", () => {
    const list = shortcutList(meta.cutoff_presets);
    expect(list[0]).toEqual([["1"], "Cutoff: EPEX GB hourly (09:20)"]);
    expect(list.map(([k]) => k[0])).toEqual(["1", "2", "3", "M", "B", "T", "R", "?", "Esc"]);
  });
});
