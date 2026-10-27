// Bundle-size budget (docs/design.md §9). Run after `vite build`:
//   node scripts/check-bundle.mjs            # fails if a budget is exceeded
//   node scripts/check-bundle.mjs --json     # machine-readable sizes
// "Initial" is what the browser must download before first paint: the entry chunk plus its
// static imports, and the CSS. Lazy chunks (charts, Recharts, motion features) are excluded.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = { initialJs: 130, totalJs: 260, css: 15 };

const dist = new URL("../dist/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const manifest = JSON.parse(readFileSync(join(dist, ".vite", "manifest.json"), "utf8"));
const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length / 1024;
const raw = (file) => readFileSync(join(dist, file)).length / 1024;

const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
const initial = new Set();
const css = new Set();
(function walk(key) {
  const chunk = manifest[key];
  if (!chunk || initial.has(chunk.file)) return;
  initial.add(chunk.file);
  for (const c of chunk.css ?? []) css.add(c);
  for (const imp of chunk.imports ?? []) walk(imp);
})(entryKey);

const allJs = [...new Set(Object.values(manifest).map((c) => c.file))].filter((f) =>
  f.endsWith(".js"),
);
const sum = (files, fn) => [...files].reduce((n, f) => n + fn(f), 0);
const result = {
  initialJs: { gzipKb: sum(initial, gz), rawKb: sum(initial, raw), files: [...initial] },
  totalJs: { gzipKb: sum(allJs, gz), rawKb: sum(allJs, raw), files: allJs.length },
  css: { gzipKb: sum(css, gz), rawKb: sum(css, raw) },
  chunks: Object.fromEntries(allJs.map((f) => [f, Number(gz(f).toFixed(1))])),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const row = (name, r, budget) =>
    `${name.padEnd(11)} ${r.gzipKb.toFixed(1).padStart(6)} kB gzip (${r.rawKb.toFixed(0)} kB raw)  budget ${budget} kB  ${r.gzipKb <= budget ? "ok" : "OVER"}`;
  console.log(row("initial JS", result.initialJs, BUDGET_KB.initialJs));
  console.log(row("total JS", result.totalJs, BUDGET_KB.totalJs));
  console.log(row("CSS", result.css, BUDGET_KB.css));
  for (const [f, kb] of Object.entries(result.chunks))
    console.log(`  ${kb.toFixed(1).padStart(6)} kB  ${f}`);
}

const over = Object.entries(BUDGET_KB).filter(([k, b]) => result[k].gzipKb > b);
if (over.length) {
  console.error(`Bundle budget exceeded: ${over.map(([k]) => k).join(", ")}`);
  process.exit(1);
}
