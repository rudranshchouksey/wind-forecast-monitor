"""Spot-check a few hours of the served data against the live Elexon API.

For each target hour, takes our row from GET /forecast-vs-actual (cutoff mode) and re-fetches:
- the actual: FUELHH WIND for the two half-hours starting at T and T+30 min, averaged;
- the forecast: the WINDFOR publish our row says was selected, value for target T;
- that Elexon has no WINDFOR publish after that one and at or before the D-1 09:20 cutoff.

    uv run python scripts/spot_check.py --api http://localhost:8000 \
        2026-01-08T06:00Z 2026-01-12T17:00Z 2026-01-27T03:00Z
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime, timedelta

import httpx

ELEXON = "https://data.elexon.co.uk/bmrs/api/v1/datasets"


def iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)


def our_row(client: httpx.Client, api: str, target: datetime) -> dict[str, object]:
    # London delivery day == UTC date in January (GMT), so a one-day query contains the hour.
    day = target.date().isoformat()
    r = client.get(
        f"{api}/api/v1/forecast-vs-actual",
        params={"from": day, "to": day, "mode": "cutoff", "cutoff_time": "09:20"},
    )
    r.raise_for_status()
    for p in r.json()["points"]:
        if parse(p["target_time"]) == target:
            return dict(p)
    raise SystemExit(f"{iso(target)} not in our response")


def elexon_actual(client: httpx.Client, target: datetime) -> tuple[float, list[float]]:
    day = target.date()
    r = client.get(
        f"{ELEXON}/FUELHH/stream",
        params={
            "settlementDateFrom": (day - timedelta(days=1)).isoformat(),
            "settlementDateTo": (day + timedelta(days=1)).isoformat(),
            "fuelType": "WIND",
        },
    )
    r.raise_for_status()
    wanted = {target, target + timedelta(minutes=30)}
    values: dict[datetime, float] = {}
    for row in r.json():
        start = parse(row["startTime"])
        if start in wanted:
            # Keep the latest revision, as ingestion does.
            values[start] = float(row["generation"])
    halves = [values[t] for t in sorted(values)]
    if len(halves) != 2:
        raise SystemExit(f"FUELHH half-hours missing for {iso(target)}: {values}")
    return sum(halves) / 2, halves


def elexon_forecast(client: httpx.Client, publish: datetime, target: datetime) -> float:
    r = client.get(
        f"{ELEXON}/WINDFOR/stream",
        params={"publishDateTimeFrom": iso(publish), "publishDateTimeTo": iso(publish)},
    )
    r.raise_for_status()
    for row in r.json():
        if parse(row["publishTime"]) == publish and parse(row["startTime"]) == target:
            return float(row["generation"])
    raise SystemExit(f"WINDFOR publish {iso(publish)} has no value for {iso(target)}")


def later_publishes_before_cutoff(client: httpx.Client, publish: datetime, target: datetime) -> int:
    # D-1 09:20 London; January is GMT, so London == UTC.
    cutoff = datetime.combine(target.date() - timedelta(days=1), datetime.min.time(), UTC)
    cutoff += timedelta(hours=9, minutes=20)
    r = client.get(
        f"{ELEXON}/WINDFOR/stream",
        params={
            "publishDateTimeFrom": iso(publish + timedelta(seconds=1)),
            "publishDateTimeTo": iso(cutoff),
        },
    )
    r.raise_for_status()
    return len({row["publishTime"] for row in r.json()})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("targets", nargs="+", type=parse)
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]  # Windows consoles default to cp1252
    print(
        "| Target hour (UTC) | Publish used | Our forecast | Elexon WINDFOR | "
        "Our actual | Elexon FUELHH (two half-hours → mean) | Later publishes ≤ cutoff | Match |"
    )
    print("|---|---|---|---|---|---|---|---|")
    ok = True
    with httpx.Client(timeout=60) as client:
        for target in args.targets:
            row = our_row(client, args.api, target)
            publish = parse(str(row["publish_time"]))
            f_ours, a_ours = float(str(row["forecast_mw"])), float(str(row["actual_mw"]))
            f_ext = elexon_forecast(client, publish, target)
            a_ext, halves = elexon_actual(client, target)
            later = later_publishes_before_cutoff(client, publish, target)
            match = abs(f_ours - f_ext) < 0.5 and abs(a_ours - a_ext) < 0.5 and later == 0
            ok &= match
            print(
                f"| {target:%d %b %H:%M} | {publish:%d %b %H:%M} | {f_ours:,.0f} | {f_ext:,.0f} | "
                f"{a_ours:,.1f} | {halves[0]:,.0f} + {halves[1]:,.0f} → {a_ext:,.1f} | {later} | "
                f"{'yes' if match else 'NO'} |"
            )
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
