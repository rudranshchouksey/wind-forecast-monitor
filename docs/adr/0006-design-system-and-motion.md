# ADR 0006: Token-based design system, self-hosted Geist and a budgeted motion layer

- Status: accepted
- Date: 2026-10-27

## Context
The dashboard is a daily tool for a day-ahead trading desk: data-dense, read under time pressure,
on desktop and phone, in dark and light. The first version was correct but looked like a template.
The redesign had to change only the UI, with every number, endpoint and line of copy kept as it
was. It also had to stay fast, accessible and cheap to run on a free CDN. The approved brief is
[docs/design.md](../design.md).

## Decision
- **Tokens first.** Every colour is a CSS variable defined per theme. Dark is the default; light
  has its own validated steps rather than an inversion.
  - Tailwind v4 consumes the variables through `@theme inline`.
  - Recharts consumes them as `var()` references from `lib/theme.ts`, so a theme switch needs no
    re-render of chart data.
  - Series and text colours were checked by script (colour-blind separation, WCAG AA), not by eye.
- **Own primitives, no component library.** `components/ui/` wraps native elements: radios for
  segmented controls, `<select>`, `<input type="range">`, a checkbox with `role="switch"`. This
  gives keyboard and screen-reader behaviour for free, about 10 kB of our own code, and full
  control of the look. A headless library (Radix or similar) would add weight for behaviours the
  native elements already provide.
- **Geist and Geist Mono, self-hosted** via `@fontsource-variable`.
  - No third-party font request, which is better for privacy and for Lighthouse "best practices".
  - Variable weights in one file per script subset.
  - The browser fetches only the subsets a page uses.
- **`motion` (Framer Motion) for one job only:** the shared-layout slide of the segmented-control
  indicator. Everything else uses cheaper mechanisms:
  - **Number tweens:** a 20-line rAF loop that writes to the DOM node, so it never re-renders
    React.
  - **Card entry:** a CSS animation, so content is never stuck invisible if script is slow.
  - **Line draw-in:** Recharts' own animation, enabled for the first render only.
  - `LazyMotion` loads motion's features as a separate chunk after first paint, which keeps motion
    out of the initial bundle (it cost 47 kB gzip when imported directly).
- **One signature element with a CPU budget.** The wind-flow canvas runs at 20 fps and half
  resolution, with strokes batched into 8 paths per frame. A timer schedules each frame, not every
  vsync. It pauses when the tab is hidden or the canvas is off-screen, and draws one static frame
  under reduced motion.
- **Reduced motion is a first-class mode.** `MotionConfig reducedMotion="user"` plus one
  `usePrefersReducedMotion()` hook turn every animation off and show final values immediately.
  Tests cover it.
- **Budgets enforced in CI:**
  - initial JS ≤ 130 kB gzip, total JS ≤ 260 kB, CSS ≤ 15 kB (`scripts/check-bundle.mjs`);
  - Recharts and React live in their own chunks, so the charts load lazily without dragging React
    along.

## Measurements
- **Initial JS:** 91.7 kB gzip, down from 175.7 kB (one 607 kB chunk) before the redesign.
- **Total JS:** 234.2 kB gzip. Recharts (109.8 kB) and motion's features (28.4 kB) load after
  first paint.
- **Wind field CPU:** 1.6–1.8 % main-thread CPU at 1440×900 in Edge, measured as the change in
  DevTools `TaskDuration` over wall time against the reduced-motion baseline (0.01 %). That was
  after cutting it from 4.2 %: timer wake-ups, batched strokes and 20 fps.

## Alternatives
- **A component library (MUI, Chakra, shadcn/Radix):** faster to start, but heavier, and either
  opinionated in look or a copy-in codebase to maintain. Native elements cover every control here.
- **Inter / JetBrains Mono:** equally good; Geist was chosen for its tighter numerals and one
  family across UI and mono.
- **No signature motion:** the cheapest option, but the brief asked for one memorable element. The
  budget, the pause rules and the reduced-motion fallback keep its cost bounded.
- **WebGL or OffscreenCanvas for the wind field:** moves work off the main thread, but adds
  complexity for an effect that already fits its budget on the main thread.

## Consequences
- Any new colour must be added as a token in both themes and pass the validator.
- New interactive UI must use (or extend) a primitive, so focus and keyboard behaviour stay
  consistent.
- A dependency that pushes the initial bundle over budget fails CI and must be lazy-loaded or
  justified.
