"""Print every number quoted in docs/analysis.md, computed by the same services the API uses.

cd backend && uv run python scripts/analysis_report.py
"""

from __future__ import annotations

import sys
from datetime import date, time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.repositories.sqlite import WindRepository
from app.services.analysis import AnalysisQuery, AnalysisService
from app.services.insight import buffer_recommendation


def mw(v: float | None) -> str:
    return "n/a" if v is None else f"{v:,.0f}"


def main() -> None:
    s = get_settings()
    svc = AnalysisService(WindRepository(s.database_path, read_only=True), s)
    first, last = s.delivery_from, s.delivery_to
    q = AnalysisQuery(first, last, "cutoff", time(9, 20))

    res = svc.metrics(q, 90)
    m = res.metrics
    print("## Headline (cutoff 09:20)")
    print(f"hours {m.n}/{res.coverage.expected_hours}, mean horizon {res.mean_horizon_h:.1f} h")
    print(
        f"MAE {mw(m.mae_mw)}  RMSE {mw(m.rmse_mw)}  bias {mw(m.bias_mw)}  "
        f"MAPE {m.mape_pct:.1f}% (n={m.mape_n}, actual>={m.mape_min_actual_mw:g})"
    )
    print(f"|e| P50 {mw(m.abs_p50_mw)} P90 {mw(m.abs_p90_mw)} P99 {mw(m.abs_p99_mw)}")
    for name, d in (("shortfall", m.shortfall), ("surplus", m.surplus)):
        print(
            f"{name}: n {d.n} share {d.share:.1%} mean {mw(d.mean_mw)} P50 {mw(d.p50_mw)} "
            f"P90 {mw(d.p90_mw)} P99 {mw(d.p99_mw)} max {mw(d.max_mw)}"
        )

    errors = svc.evaluate(q).frame["error_mw"].to_numpy()
    print("\n## Buffers")
    for p in (80, 90, 95, 99):
        b = buffer_recommendation(errors, p)
        print(
            f"P{p}: buffer {mw(b.buffer_mw)} = offset {mw(b.offset_mw)} + random "
            f"{mw(b.random_component_mw)}; coverage {b.achieved_coverage:.1%}"
        )

    print("\n## Out-of-sample: size on 2-16 Jan, test on 17 Jan-1 Feb")
    train = svc.evaluate(AnalysisQuery(first, date(2026, 1, 16), "cutoff", time(9, 20)))
    test = svc.evaluate(AnalysisQuery(date(2026, 1, 17), last, "cutoff", time(9, 20)))
    for p in (90, 95):
        b = buffer_recommendation(train.frame["error_mw"].to_numpy(), p)
        assert b.buffer_mw is not None
        cov = float(np.mean(test.frame["error_mw"].to_numpy() <= b.buffer_mw))
        print(f"P{p}: train buffer {mw(b.buffer_mw)} -> test coverage {cov:.1%}")

    print("\n## Cutoff sensitivity")
    for t in (time(9, 20), time(9, 50), time(11, 0)):
        r = svc.metrics(AnalysisQuery(first, last, "cutoff", t), 90)
        print(
            f"{t:%H:%M}: MAE {mw(r.metrics.mae_mw)} bias {mw(r.metrics.bias_mw)} "
            f"P90 shortfall {mw(r.metrics.shortfall.p90_mw)} buffer {mw(r.insight.buffer_mw)} "
            f"mean horizon {r.mean_horizon_h:.1f} h"
        )

    print("\n## By horizon")
    for row in svc.by_horizon(q, (0, 1, 2, 4, 8, 12, 16, 24, 36, 48, 60)):
        mm = row.metrics
        print(
            f"{row.horizon_h:>4g} h: n {mm.n:>3} ({row.coverage.ratio:.0%})  "
            f"MAE {mw(mm.mae_mw)}  RMSE {mw(mm.rmse_mw)}  bias {mw(mm.bias_mw)}  "
            f"P90 shortfall {mw(mm.shortfall.p90_mw)}"
        )

    print("\n## By hour (London)")
    hours = svc.by_hour(q)
    for g in (
        sorted(hours, key=lambda g: g.metrics.mae_mw or 0)[:3]
        + sorted(hours, key=lambda g: -(g.metrics.mae_mw or 0))[:3]
    ):
        print(f"{int(g.key):02d}:00 MAE {mw(g.metrics.mae_mw)} bias {mw(g.metrics.bias_mw)}")

    print("\n## By day")
    days = svc.by_day(q)
    neg = [g.key for g in days if (g.metrics.bias_mw or 0) < 0]
    print(f"days with negative bias: {len(neg)} {neg}")
    for g in sorted(days, key=lambda g: -(g.metrics.bias_mw or 0))[:4]:
        print(f"{g.key}: bias {mw(g.metrics.bias_mw)} MAE {mw(g.metrics.mae_mw)}")

    print("\n## Bias diagnostics")
    diag = svc.bias_diagnostics(q)
    print(f"overall {mw(diag.overall_bias_mw)}  at 0 h horizon {mw(diag.bias_at_zero_horizon_mw)}")
    print(
        f"hindcast: n {diag.hindcast.n} bias {mw(diag.hindcast.bias_mw)} mean ratio "
        f"{diag.hindcast.mean_ratio:.3f}"
    )
    for bucket in diag.by_forecast_level:
        print(
            f"forecast {bucket.label}: n {bucket.n} bias {mw(bucket.bias_mw)} mean actual/forecast "
            f"{bucket.mean_ratio:.3f}"
        )
    frame = svc.evaluate(q).frame
    slope, intercept = np.polyfit(frame["forecast_mw"], frame["actual_mw"], 1)
    corr = np.corrcoef(frame["forecast_mw"], frame["actual_mw"])[0, 1]
    print(f"OLS actual = {intercept:,.0f} + {slope:.3f} * forecast; corr {corr:.3f}")
    debiased = frame["error_mw"] - frame["error_mw"].mean()
    print(f"MAE after removing mean offset: {mw(float(np.abs(debiased).mean()))}")


if __name__ == "__main__":
    main()
