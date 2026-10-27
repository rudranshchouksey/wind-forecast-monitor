import { useId } from "react";

import type { AnalysisParams } from "../api/client";
import type { BufferBasis, MetaResponse, Mode } from "../api/types";
import {
  Button,
  ButtonLink,
  SegmentedControl,
  Select,
  Slider,
  cx,
  fieldClass,
  fieldLabelClass,
  focusRing,
} from "./ui";

export const PERCENTILES = [80, 90, 95, 99] as const;
export const HORIZON_MIN = 1;
/** Every hour has a forecast up to ~46 h ahead; beyond that WINDFOR coverage thins out. */
export const HORIZON_MAX = 60;

const MODE_OPTIONS = [
  { value: "cutoff", label: "At decision cutoff", title: "Shortcut: M" },
  { value: "horizon", label: "At fixed lead time", title: "Shortcut: M" },
] as const;

const BASIS_OPTIONS = [
  { value: "total", label: "Include systematic offset", title: "Shortcut: B" },
  { value: "random", label: "Random error only", title: "Shortcut: B" },
] as const;

export interface ControlsProps {
  meta: MetaResponse;
  params: AnalysisParams;
  percentile: number;
  basis: BufferBasis;
  csvHref: string;
  onChange: (p: AnalysisParams) => void;
  onPercentile: (p: number) => void;
  onBasis: (b: BufferBasis) => void;
  onReset: () => void;
  className?: string;
}

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
  className,
}: ControlsProps) {
  const id = useId();
  const set = (patch: Partial<AnalysisParams>) => {
    onChange({ ...params, ...patch });
  };
  const horizonMode = params.mode === "horizon";
  const dateClass = cx(fieldClass, "w-[8.75rem] font-mono", focusRing);

  return (
    <form
      aria-label="Analysis settings"
      className={cx("flex flex-wrap items-end gap-x-6 gap-y-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <fieldset className="flex min-w-0 flex-col">
        <legend className={fieldLabelClass}>Delivery days</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="sr-only" htmlFor={`${id}-from`}>
            From
          </label>
          <input
            id={`${id}-from`}
            type="date"
            className={dateClass}
            min={meta.first_day}
            max={params.to}
            value={params.from}
            onChange={(e) => {
              if (e.target.value) set({ from: e.target.value });
            }}
          />
          <span className="text-body text-muted" aria-hidden="true">
            to
          </span>
          <label className="sr-only" htmlFor={`${id}-to`}>
            To
          </label>
          <input
            id={`${id}-to`}
            type="date"
            className={dateClass}
            min={params.from}
            max={meta.last_day}
            value={params.to}
            onChange={(e) => {
              if (e.target.value) set({ to: e.target.value });
            }}
          />
        </div>
      </fieldset>

      <SegmentedControl<Mode>
        name={`${id}-mode`}
        legend="Evaluate forecasts"
        value={params.mode}
        options={MODE_OPTIONS}
        onChange={(mode) => {
          set({ mode });
        }}
      />

      <Select
        label="Decision cutoff (D-1, London)"
        value={params.cutoffTime}
        disabled={params.mode !== "cutoff"}
        options={meta.cutoff_presets.map((p) => ({
          value: p.time,
          label: p.label,
          title: p.description,
        }))}
        onChange={(cutoffTime) => {
          set({ cutoffTime });
        }}
      />

      <Slider
        className="w-full sm:w-48"
        label={
          <>
            Lead time: <span className="font-mono text-ink normal-case">{params.horizonH} h</span>
          </>
        }
        min={HORIZON_MIN}
        max={HORIZON_MAX}
        value={params.horizonH}
        disabled={!horizonMode}
        disabledHint="Select “At fixed lead time” to use the slider"
        valueText={`${params.horizonH} hours before delivery`}
        onChange={(horizonH) => {
          set({ horizonH });
        }}
      />

      <Select
        label="Buffer covers"
        value={String(percentile)}
        options={PERCENTILES.map((p) => ({ value: String(p), label: `${p}% of hours` }))}
        onChange={(v) => {
          onPercentile(Number(v));
        }}
      />

      <SegmentedControl<BufferBasis>
        name={`${id}-basis`}
        legend="Buffer basis"
        value={basis}
        options={BASIS_OPTIONS}
        onChange={onBasis}
      />

      <div className="flex gap-2 sm:ml-auto">
        <Button onClick={onReset} title="Shortcut: R">
          Reset
        </Button>
        <ButtonLink variant="primary" href={csvHref} download>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
            <path
              d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Export CSV
        </ButtonLink>
      </div>
    </form>
  );
}
