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
- **`motion` (Framer Motion) for one job only:** the slide of the segmented-control indicator,
  using `motion/mini`'s `animate`. That is a small helper over the Web Animations API, so the slide
  runs off the main thread. The selected label is measured only when the value changes.
  Everything else uses cheaper mechanisms:
  - **Number tweens:** a 20-line rAF loop that writes to the DOM node, so it never re-renders
    React.
  - **Card entry:** a CSS animation, so content is never stuck invisible if script is slow.
  - **Line draw-in:** Recharts' own animation, enabled for the first render only.
- **Revised after measuring.** The first build used motion's React layout animations (`LazyMotion`
  with a `layoutId` indicator).
  - A load profile showed motion's `measureScroll` taking 762 ms under a 4× CPU slowdown: layout
    projection re-measures on every React commit, and each resolving query is a commit.
  - Imported directly, motion's React build added 47 kB gzip.
  - `motion/mini` keeps the slide with neither cost, and dropped the 28 kB features chunk.
- **One signature element with a CPU budget.** The wind-flow canvas runs at 15 fps and half
  resolution, with strokes batched into 8 paths per frame. A timer schedules each frame, not every
  vsync. It pauses when the tab is hidden or the canvas is off-screen, and draws one static frame
  under reduced motion.
- **Reduced motion is a first-class mode.** One `usePrefersReducedMotion()` hook (and the CSS
  `prefers-reduced-motion` rule) turns every animation off and shows final values immediately.
  Tests cover it.
- **Budgets enforced in CI:**
  - initial JS ≤ 130 kB gzip, total JS ≤ 260 kB, CSS ≤ 15 kB (`scripts/check-bundle.mjs`);
  - Recharts and React live in their own chunks, so the charts load lazily without dragging React
    along.

## Measurements
- **Initial JS:** 81.6 kB gzip, down from 175.7 kB (one 607 kB chunk) before the redesign.
- **Total JS:** 195.7 kB gzip. Recharts (109.8 kB) loads after first paint, with the charts.
- **Layout shift:** CLS 0 in every live Lighthouse run, after giving skeletons the loaded geometry.
- **Wind field CPU:** 1.6–1.8 % main-thread CPU on a local preview at 1440×900 in Edge, and
  1.9–2.2 % on the live site. Measured as the change in DevTools `TaskDuration` over wall time,
  against the reduced-motion baseline (0.01 %). It started at 4.2 % and came down through timer
  wake-ups, batched strokes, 15 fps and at most 48 particles. Off-screen chart placeholders are
  static: 62 pulsing skeleton nodes had cost another 3 %.
- **Lighthouse 13.5.0 on the live site.** Run locally in headless Edge, three runs per preset on
  the last two deploys:

  | Category | Desktop | Mobile |
  |---|---|---|
  | Performance | 79–93 | 59–72 |
  | Accessibility | 100 | 100 |
  | Best practices | 100 | 100 |
  | SEO | 100 | 100 (one run 92) |

  - CLS is 0 in every run.
  - Desktop FCP is 0.3–0.4 s and LCP 0.7–0.9 s.
  - Mobile LCP is 2.8–3.6 s, and Total Blocking Time 1.1–2.5 s under Lighthouse's 4× CPU slowdown.
  - The SEO 92 was "robots.txt is not valid" with no details; the file is served as valid
    `text/plain`.
  - **Caveat:** the measuring machine is slow, with a Lighthouse CPU benchmark index of 500–650
    against well over 1,000 on a typical laptop. Mobile throttling multiplies that, and scores moved
    about ±10 points between identical runs. Google's PageSpeed Insights (standard hardware) was
    unavailable: its keyless quota was used up.
  - **Result:** the Performance target (≥ 90) is met on desktop in the better runs and not met on
    mobile on this hardware. The other three targets (≥ 95) are met.

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
