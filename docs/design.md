# Design brief: GB Wind Forecast Monitor

The aim is a calm, data-dense trading tool that a day-ahead desk opens every morning: Linear's
restraint, Vercel's precision, a little Bloomberg density. This brief covers only the UI. Every
number, API call, metric definition and sentence of copy stays as it is today.

## 1. Principles

1. **The decision comes first.** The first screen answers "how much wind do I count on?" with one
   number, one sentence and one caveat. Everything below it is evidence.
2. **Numbers are the interface.** Tabular figures everywhere, MW values in mono, units always
   visible, nothing rounded differently from today.
3. **Quiet chrome, loud data.** Surfaces are neutral and borders hairline. Colour is used only for
   data series, the accent and status. No gradients on panels, no glass, no illustrations.
4. **Motion explains a change.** Animation shows what changed (a value moving, a section opening),
   never decoration. The one exception is the slow wind-flow field in the hero, and it can be
   turned off.
5. **Every view is a link.** All control state lives in the URL, so a trader can paste the exact
   view into chat.
6. **Accessible by construction.** Keyboard first, AA contrast checked by a script (not by eye),
   a table behind every chart, and reduced motion respected.

## 2. Colour tokens

Dark is the default; light is a full equal, with its own steps rather than an inversion. Both are
CSS variables on `:root` / `[data-theme]`, exposed to Tailwind through `@theme inline`, and read by
Recharts through `src/lib/theme.ts` (`useChartColors()` resolves the variables, so charts follow the
theme with no hard-coded hex values in components).

| Token                      | Dark                      | Light                    | Use                                                           |
| -------------------------- | ------------------------- | ------------------------ | ------------------------------------------------------------- |
| `--bg`                     | `#0a0c10`                 | `#f6f6f3`                | page                                                          |
| `--panel`                  | `#12151b`                 | `#ffffff`                | cards, the control bar                                        |
| `--raised`                 | `#1a1e26`                 | `#f0f0ec`                | hover, popovers, active segment track                         |
| `--border`                 | `rgb(255 255 255 / 0.08)` | `rgb(12 14 18 / 0.10)`   | hairlines                                                     |
| `--border-strong`          | `rgb(255 255 255 / 0.14)` | `rgb(12 14 18 / 0.18)`   | inputs, focus-adjacent                                        |
| `--text`                   | `#e8eaee`                 | `#0c0e12`                | primary text, numbers                                         |
| `--text-2`                 | `#a8afbb`                 | `#474d57`                | labels, secondary text                                        |
| `--text-muted`             | `#8a919e`                 | `#636a75`                | notes, axis ticks                                             |
| `--accent`                 | `#8f97ff`                 | `#4a50d4`                | UI only: active control, focus ring, primary tile edge, links |
| `--actual`                 | `#3d8bf0`                 | `#2a78d6`                | actual outturn series                                         |
| `--forecast`               | `#e0662f`                 | `#e0602a`                | forecast series                                               |
| `--corrected`              | `#1ea674`                 | `#14946a`                | bias-corrected forecast                                       |
| `--shortfall`              | `#ea5f5f`                 | `#d93f3e`                | forecast above actual (wind came in short)                    |
| `--surplus`                | `#3d8bf0`                 | `#2a78d6`                | forecast below actual                                         |
| `--gap-fill`               | forecast at 16 % opacity  | forecast at 14 % opacity | shaded area between forecast and actual                       |
| `--warn-bg` / `--warn-ink` | `#2a2312` / `#f2cf7a`     | `#fff6e0` / `#6b4a00`    | caveat callout                                                |

The accent is a cool indigo, so it never collides with a data hue. A blue accent would read as
"actual".

**Checked, not eyeballed** (the dataviz palette validator plus a WCAG contrast script):

- **Series** (actual, forecast, corrected) pass every check in both themes: the lightness band,
  the chroma floor, colour-blind (CVD) separation (worst deutan ΔE 9.3 dark, 8.5 light), the
  normal-vision floor (ΔE ≥ 26) and ≥ 3:1 against the panel. Shortfall/surplus also pass
  (ΔE ≥ 21).
- **Text contrast** on panel, dark then light:
  - `--text`: 15.2 : 1 / 19.3 : 1
  - `--text-2`: 8.3 : 1 / 8.5 : 1
  - `--text-muted`: 5.8 : 1 / 5.5 : 1
  - `--accent`: 7.0 : 1 / 6.2 : 1
  - The worst text case is light `--text-muted` on `--raised`, at 4.8 : 1. That is still AA.
- **Data colours** meet the WCAG 1.4.11 graphics threshold (≥ 3 : 1) on every surface. Text is
  never set in a series colour; legends and labels use text tokens next to a coloured swatch.
  That rule keeps light-mode orange (3.6 : 1) legal.
- **Two series share a hue.** Surplus reuses the actual blue, as it does today: surplus means
  "actual came in above the forecast". It never appears in the same chart as the actual series,
  and it always comes with a sign label.

## 3. Typography

- **UI:** Geist (variable), self-hosted through `@fontsource-variable/geist`. There are no
  third-party font requests, which keeps Lighthouse and privacy simple.
- **Numbers / MW values:** Geist Mono (variable) via `@fontsource-variable/geist-mono`.
- **Figures:** `font-variant-numeric: tabular-nums` globally on `body`, plus `slashed-zero` in mono.

| Step      | Size / line-height             | Weight                           | Use                          |
| --------- | ------------------------------ | -------------------------------- | ---------------------------- |
| `display` | 56 / 60 px (40 / 44 on mobile) | 600, tracking −0.02em, mono      | hero buffer number           |
| `title`   | 20 / 28                        | 600, tracking −0.01em            | page title                   |
| `heading` | 15 / 22                        | 600                              | card titles                  |
| `stat`    | 26 / 32                        | 550, mono                        | KPI values                   |
| `body`    | 14 / 22                        | 400                              | copy                         |
| `label`   | 12 / 16                        | 500, uppercase, tracking +0.04em | control labels, eyebrow text |
| `micro`   | 11 / 14                        | 400                              | axis ticks, footnotes        |

## 4. Spacing, radius, elevation

- **Spacing:** a 4 px base, using only these steps: 4, 8, 12, 16, 20, 24, 32, 48. Card padding is
  20 (16 on mobile), grid gaps 16, and gaps between sections 32.
- **Radius:** 6 for controls, 10 for cards, 999 for badges and the segmented indicator.
- **Elevation:** none in dark mode, which separates layers by surface step plus a hairline. Light
  mode gets one soft shadow on cards (`0 1px 2px rgb(12 14 18 / .05)`) and one on popovers.
- **Layout widths:**
  - Content max width 1440 px with fluid gutters of 16 / 24 / 32 px.
  - The chart grid is 1 column below 1024 px and 2 columns from 1024 px.
  - The KPI row is 2 columns, then 3, then 5.
  - Breakpoints checked: 375, 768, 1280 and 1600 px, with no horizontal scroll at any of them.

## 5. Layout

1. **Header** (sticky, 52 px, blurred `--bg` at 80 %):
   - left: the product mark (a small turbine glyph) and the title;
   - right: a freshness badge "Elexon snapshot · Jan 2026", an "API docs" link, a `?` shortcuts
     button and the theme toggle.
2. **Control bar** (sticky under the header, compact single row):
   - From 1024 px up it holds date range · mode · cutoff/lead time · buffer cover · buffer
     basis · Export CSV · Reset.
   - Below 1024 px it collapses to a summary chip ("09:20 D-1 · P90 · incl. offset") that opens
     a bottom drawer with the same controls.
3. **Hero "decision"** (the procurement takeaway):
   - The eyebrow "Day-ahead wind haircut", then the big buffer number in `display` mono, then
     today's headline sentence.
   - On the right, a mini distribution: the error histogram as a 64 px strip with the buffer line
     and the shaded "covered" share.
   - The caveat as a subtle callout under it.
   - The wind-flow field sits behind it.
4. **KPI row:**
   - The five existing tiles, each with label, ⓘ tooltip, value, unit, note and a 24 px sparkline.
   - The buffer tile is the primary one: an accent top edge and a "Primary" badge.
5. **Main chart** (full width):
   - actual and forecast lines, a shaded gap area, and the optional corrected line;
   - a crosshair tooltip with actual, forecast, error and corrected (when shown), plus the
     publish time and lead time;
   - the restyled zoom brush and a "Show table" toggle.
6. **Analysis grid** (2 columns): lead time · distribution · hour of day · bias by day, all on one
   `ChartCard` with the same header, legend row, axis styling and tooltip.
7. **Collapsible sections:** the bias-correction panel, "Is the bias forecast error?
   (diagnostics)" and "How to read this", each with a smooth height animation.
8. **Footer:** the existing data note.

**Sparklines** come from `/metrics/by-day`, one value per delivery day:

| Tile                | Sparkline statistic            |
| ------------------- | ------------------------------ |
| Suggested buffer    | daily P90 shortfall            |
| Mean absolute error | daily MAE                      |
| RMSE                | daily RMSE                     |
| Bias                | daily bias (forecast − actual) |
| Worst 1 % of hours  | daily max shortfall            |

The buffer and worst-1 % tiles have no exact daily equivalent. So each of those sparklines names
its statistic in its visible label, its hover tooltip and its aria label, and the ⓘ definition
adds that the headline number covers the whole period.

## 6. Motion

The `motion` package, pinned to an exact version, with tokens in `src/lib/motion.ts`:

| Token         | Value                            | Use                                    |
| ------------- | -------------------------------- | -------------------------------------- |
| `fast`        | 150 ms                           | hover, focus, tooltip in               |
| `base`        | 220 ms                           | segmented indicator, crossfade, drawer |
| `slow`        | 350 ms                           | section expand, card entry             |
| `draw`        | 400 ms                           | line draw-in                           |
| `ease-out`    | `cubic-bezier(0.22, 1, 0.36, 1)` | entries and expands                    |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | position changes                       |

**Rules:**

- **Number tweens:** values tween over 350 ms when they change; the first value appears instantly.
- **First load:** cards enter with a 12 px rise and a fade, 40 ms stagger, once per page load.
  Lines draw in on the first render only.
- **Filter changes:** the previous data stays visible (`placeholderData: keepPreviousData`), the
  card dims to 60 % with a 2 px progress hairline while it refetches, then crossfades. There is
  never a skeleton flash after the first load.
- **First-load skeletons** are shaped like the content they replace (tile, chart with axes,
  histogram bars), never spinners.
- **Wind-flow field:**
  - About 60 faint particles advected along a smooth noise field on a `<canvas>`, at 30 fps, with
    a DPR cap of 1.5. It pauses when the tab is hidden or the hero is off-screen
    (IntersectionObserver).
  - Budget: under 2 % CPU. I'll measure that in a Performance profile before shipping.
- **Reduced motion:** `prefers-reduced-motion: reduce` turns off every animation. Numbers show
  their final value, there's no draw-in, the wind field draws one static frame, and expands are
  instant. One `useReducedMotion()` hook feeds every component, and tests cover it.

## 7. State, keyboard and the URL

- **URL query keys:**
  - `from`, `to`, `mode`, `cutoff` (HH:MM), `h` (lead time), `p` (percentile), `basis`,
    `corrected`;
  - only values that differ from the defaults are written;
  - invalid values fall back to the defaults.
- **History:** a discrete change pushes a history entry. Slider drags and date typing replace the
  current entry, so Back steps through real changes. Back and Forward restore the controls.
- **Keyboard shortcuts:**
  - `1`–`n`: cutoff presets;
  - `m`: toggle mode;
  - `b`: toggle buffer basis;
  - `t`: theme;
  - `r`: reset;
  - `?`: help overlay; `Esc` closes overlays.
  - Shortcuts are ignored while typing in an input, and are listed in the overlay.

## 8. Primitives (`src/components/ui/`)

`Card`, `Stat`, `SegmentedControl`, `Select`, `Slider`, `Button`, `Tooltip`, `Badge` and
`Skeleton`. They share these rules:

- typed props, `forwardRef` where a DOM node is useful, and one `focusRing` class (2 px accent
  outline, 2 px offset);
- native elements underneath: radio inputs for the segmented control, `<select>`,
  `<input type="range">` and `<button>`;
- the Tooltip opens on hover and on focus, is dismissable with Esc, and is linked with
  `aria-describedby`.

Every existing component is rebuilt on these primitives.

## 9. Budgets and quality bars

- **JS today:** 621 kB raw, 180 kB gzip, in a single chunk.
- **Budgets:**
  - initial JS ≤ 130 kB gzip; Recharts and the chart sections are lazy chunks;
  - total JS ≤ 260 kB gzip.
  - The build fails if a budget is exceeded.
- **Lighthouse targets:** Performance ≥ 90; Accessibility, Best Practices and SEO ≥ 95. I'll run
  Lighthouse against the production build with headless Edge and report the scores.
- **Sharing:** favicon (SVG + 32 px PNG), title, meta description, and an Open Graph and Twitter
  card image (1200×630, generated from the hero).

## 10. Out of scope and deployment

- **No changes** to backend code, endpoints, metric values or copy. The only new copy is the hero
  eyebrow "Day-ahead wind haircut", the freshness badge, the sparkline labels and the shortcut
  help.
- **Deployment:** the app is live at <https://wind-forecast-monitor-wine.vercel.app>. The Vercel
  project is connected to the GitHub repo, so every push to `main` redeploys it, with no Vercel
  CLI step.
- **Approved decisions:** indigo accent; Geist and Geist Mono, self-hosted; sparklines on all
  five tiles as in §5.
