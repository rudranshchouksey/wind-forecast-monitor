import { useId } from "react";

import type { AnalysisParams } from "../api/client";
import type { BufferBasis, MetaResponse, Mode } from "../api/types";

export const PERCENTILES = [80, 90, 95, 99] as const;
export const HORIZON_MIN = 1;
/** Every hour has a forecast up to ~46 h ahead; beyond that WINDFOR coverage thins out. */
export const HORIZON_MAX = 60;

interface ControlsProps {
  meta: MetaResponse;
  params: AnalysisParams;
  percentile: number;
  basis: BufferBasis;
  csvHref: string;
  onChange: (p: AnalysisParams) => void;
  onPercentile: (p: number) => void;
  onBasis: (b: BufferBasis) => void;
  onReset: () => void;
}

/** Radio group styled as a segmented control (keyboard: arrow keys move between options). */
function Segmented<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-medium text-ink-2">{legend}</legend>
      <div className="inline-flex flex-wrap rounded-md border border-line p-0.5">
        {options.map(([v, label]) => (
          <label
            key={v}
            className={`cursor-pointer rounded px-2.5 py-1 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)] ${
              value === v ? "bg-accent text-white" : "text-ink-2 hover:bg-surface-2"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => {
                onChange(v);
              }}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const fieldClass =
  "min-w-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink shadow-xs";

export function Controls({
  meta,
  params,
  percentile,
  basis,
  csvHref,
  onChange,
  onPercentile,
  onBasis,
  onReset,
}: ControlsProps) {
  const id = useId();
  const set = (patch: Partial<AnalysisParams>) => {
    onChange({ ...params, ...patch });
  };
  const setMode = (mode: Mode) => {
    set({ mode });
  };
  const horizonMode = params.mode === "horizon";

  return (
    <form
      aria-label="Analysis settings"
      className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-xl border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <fieldset className="flex min-w-0 flex-wrap items-end gap-2">
        <legend className="mb-1 text-xs font-medium text-ink-2">Delivery days</legend>
        <label className="sr-only" htmlFor={`${id}-from`}>
          From
        </label>
        <input
          id={`${id}-from`}
          type="date"
          className={fieldClass}
          min={meta.first_day}
          max={params.to}
          value={params.from}
          onChange={(e) => {
            if (e.target.value) set({ from: e.target.value });
          }}
        />
        <span className="pb-1.5 text-sm text-muted" aria-hidden="true">
          to
        </span>
        <label className="sr-only" htmlFor={`${id}-to`}>
          To
        </label>
        <input
          id={`${id}-to`}
          type="date"
          className={fieldClass}
          min={params.from}
          max={meta.last_day}
          value={params.to}
          onChange={(e) => {
            if (e.target.value) set({ to: e.target.value });
          }}
        />
      </fieldset>

      <Segmented
        name={`${id}-mode`}
        legend="Evaluate forecasts"
        value={params.mode}
        options={
          [
            ["cutoff", "At decision cutoff"],
            ["horizon", "At fixed lead time"],
          ] as const
        }
        onChange={setMode}
      />

      <div className="flex flex-col">
        <label htmlFor={`${id}-cutoff`} className="mb-1 text-xs font-medium text-ink-2">
          Decision cutoff (D-1, London)
        </label>
        <select
          id={`${id}-cutoff`}
          className={fieldClass}
          value={params.cutoffTime}
          disabled={params.mode !== "cutoff"}
          onChange={(e) => {
            set({ cutoffTime: e.target.value });
          }}
        >
          {meta.cutoff_presets.map((p) => (
            <option key={p.time} value={p.time} title={p.description}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex w-full min-w-0 flex-col sm:w-52">
        <label
          htmlFor={`${id}-horizon`}
          className={`mb-1 text-xs font-medium text-ink-2 ${horizonMode ? "" : "opacity-60"}`}
        >
          Lead time: <span className="tabular text-ink">{params.horizonH} h</span>
        </label>
        <input
          id={`${id}-horizon`}
          type="range"
          min={HORIZON_MIN}
          max={HORIZON_MAX}
          step={1}
          value={params.horizonH}
          disabled={!horizonMode}
          aria-describedby={horizonMode ? undefined : `${id}-horizon-hint`}
          aria-valuetext={`${params.horizonH} hours before delivery`}
          className="accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(e) => {
            set({ horizonH: Number(e.target.value) });
          }}
        />
        {!horizonMode && (
          <span id={`${id}-horizon-hint`} className="mt-1 text-xs text-muted">
            Select “At fixed lead time” to use the slider
          </span>
        )}
      </div>

      <div className="flex flex-col">
        <label htmlFor={`${id}-pct`} className="mb-1 text-xs font-medium text-ink-2">
          Buffer covers
        </label>
        <select
          id={`${id}-pct`}
          className={fieldClass}
          value={percentile}
          onChange={(e) => {
            onPercentile(Number(e.target.value));
          }}
        >
          {PERCENTILES.map((p) => (
            <option key={p} value={p}>
              {p}% of hours
            </option>
          ))}
        </select>
      </div>

      <Segmented
        name={`${id}-basis`}
        legend="Buffer basis"
        value={basis}
        options={
          [
            ["total", "Include systematic offset"],
            ["random", "Random error only"],
          ] as const
        }
        onChange={onBasis}
      />

      <div className="flex gap-2 sm:ml-auto">
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2"
        >
          Reset
        </button>
        <a
          href={csvHref}
          download
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Export CSV
        </a>
      </div>
    </form>
  );
}
