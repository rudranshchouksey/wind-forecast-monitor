# ADR 0002: Decision cutoff = D-1 09:20 Europe/London (configurable)

- Status: accepted (replaces the brief's original 11:00 default)
- Date: 2026-10-26

## Context
Trading decides how much to buy for delivery day D in the GB day-ahead market on D-1.
Any forecast used in the back-test must have been available **before** the order had to be
submitted, otherwise accuracy is overstated through look-ahead.

Since GB left the EU single day-ahead coupling (1 January 2021) there are separate GB day-ahead auctions:

| Auction | Gate closure (UK time, D-1) |
|---|---|
| EPEX SPOT GB day-ahead (hourly) | ~09:20 |
| Nord Pool N2EX GB day-ahead (hourly) | ~09:50 |
| GB half-hourly auctions | afternoon (later) |

Sources: Nord Pool's Brexit auction notice (gate closure moved from 11:00 to 09:50 GMT) and EPEX
SPOT's GB auction listings (10:20 CET = 09:20 UK). The older **11:00** time is the pre-2021
coupled-auction gate closure (12:00 CET).

WINDFOR is published at about 02:30, 04:30, 07:30, **09:30**, 11:30 … (UTC in winter). With an 11:00
cutoff the selected forecast would be the 09:30 publish, which comes **after** the EPEX gate. For an EPEX
participant that is look-ahead.

## Decision
- Default cutoff **D-1 09:20 Europe/London**, the earliest GB day-ahead gate closure, so the
  back-test is conservative for every auction.
- Presets in the UI and API: **09:20** (EPEX), **09:50** (N2EX), **11:00** (legacy). Any `HH:MM`
  is accepted (`cutoff_time` query parameter or `APP_CUTOFF_TIME`).
- The cutoff is computed in local time, then converted to UTC (`zoneinfo`), so DST days
  (23 h and 25 h) are handled exactly.
- Rule: for target T on delivery day D, use the forecast with the greatest `publish_time` such that
  `publish_time <= cutoff(D)` **and** `publish_time <= T`. The boundary is inclusive (a publish
  exactly at the cutoff counts).
- A forecast is assumed usable from its `publishTime`. We do not model any publication latency on top.

## Consequences
- January 2026: at 09:20 the forecast used is the 07:30 UTC publish (lead time 16.5–39.5 h, mean
  28 h). MAE is 2,039 MW, against 2,013 MW at 09:50/11:00. The conservative choice costs only about 26 MW of accuracy.
- Tests cover the exact boundary (included at the cutoff, excluded one second later), the first and last
  hour of a day, the switch at midnight, spring and autumn DST days, the irregular 12:25 publish,
  and a randomised comparison against a brute-force reference implementation.
- Gate-closure times change occasionally. Check them against the current exchange rulebooks
  before using results operationally; the cutoff is a single setting.

## Sources
- Nord Pool, GB auction changes for Brexit: https://nordpoolgroup.com/en/message-center-container/newsroom/exchange-message-list/2020/q4/nord-pool-announces-gb-auction-changes-for-brexit
- Nord Pool GB day-ahead market regulations: https://nordpoolgroup.com/49b336/globalassets/download-center/rules-and-regulations/day-ahead-market-regulations---gb-market.pdf
- EPEX SPOT market data (GB day-ahead auction closure 10:20 CET): https://www.epexspot.com/en
