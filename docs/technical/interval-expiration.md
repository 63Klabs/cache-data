# Interval expiration - technical documentation

## Overview

Interval-based expiration rounds a cache entry's expiration up to the next interval boundary in a configured time zone, such as the next local midnight or the next 4-hour mark. The internal `TimeUtils` class does the time work: it looks up the UTC offset of the configured time zone, does the interval arithmetic, and converts, formats, and parses timestamps.

`TimeUtils` replaced the `moment-timezone` package in v1.4.0. It takes its offsets from the built-in `Intl.DateTimeFormat`, so the package has no runtime dependencies and time zone rules come from the Node.js runtime.

This document is the mechanism reference for maintainers. It explains how the offset is found, what the interval arithmetic does and why it was kept as it was, how DST is handled and where it falls short, where the time zone rules come from, how the golden fixture pins the old results, and how `Temporal` fits in. It is not a usage guide; for configuring a cache profile with `expirationIsOnInterval` and choosing a time zone, see the [Interval-Based Expiration section of the cache feature README](../features/cache/README.md#interval-based-expiration).

## Where this runs

`TimeUtils` lives at `src/lib/utils/TimeUtils.class.js`. It is internal and is not exported from the public API (`src/index.js` or `src/lib/tools/index.js`) or declared in `types/`. It is reached through `Cache`:

- `Cache.init(parameters)` calls `TimeUtils.init({ timezone: parameters.timeZoneForInterval })` first, before it assigns any other state. An invalid time zone throws from `Cache.init()` and leaves nothing behind, so a corrected retry works. This runs in both cache modes, including in-memory-only mode.
- `Cache.nextIntervalInSeconds()`, `Cache.parseToSeconds()`, and `Cache.generateInternetFormattedDate()` delegate to `TimeUtils` with the same arguments.
- `Cache.info()` reports `timeZoneForInterval`, `offsetInMinutes`, and `tzDataVersion` from `TimeUtils.getTimeZone()`, `TimeUtils.getOffsetInMinutes()`, and `TimeUtils.getTzDataVersion()`.
- `CacheData.write()` formats the `last-modified` and `expires` headers with `TimeUtils.generateInternetFormattedDate()`.

```javascript
// Internal use only - import the class directly (for example, in tests).
// Run from the repository root.
const TimeUtils = require("./src/lib/utils/TimeUtils.class.js");

TimeUtils.init({ timezone: "America/Chicago" });

// 2026-01-15T18:00:00Z is noon CST. The next local midnight is 6:00 AM UTC.
const boundary = TimeUtils.nextIntervalInSeconds(86400, 1768500000);
console.log(new Date(boundary * 1000).toISOString()); // "2026-01-16T06:00:00.000Z"
```

### Lifecycle

`TimeUtils.init()` resolves the time zone from the `timezone` option, then the `CACHE_DATA_TIME_ZONE_FOR_INTERVAL` environment variable, then `Etc/UTC`. `undefined`, `null`, `""`, and whitespace-only strings count as not provided and fall through to the next level. The environment variable is read only when the option isn't provided, so a broken variable can't fail a configuration that passes a valid option. Names are trimmed, and a name is valid if `Intl.DateTimeFormat` accepts it, which includes fixed offsets such as `+05:30`. `TimeUtils` keeps no list of names of its own.

The first successful `init()` fixes the time zone for the life of the module instance. A later call logs a warning and changes nothing, and there is no reset. A call that throws assigns nothing and leaves `TimeUtils` uninitialized. Until `init()` succeeds, the active time zone is `Etc/UTC` and the offset is 0.

The active time zone is stored as given, not in `Intl`'s canonical form. `Intl` canonicalizes names it accepts (`Etc/UTC` becomes `UTC`, `Asia/Kolkata` becomes `Asia/Calcutta`), but `Cache.info().timeZoneForInterval` reports the trimmed name that was configured, so its value doesn't change with the runtime.

### Testing seam

`TimeUtils.resolveTimezone(option, envValue)` and the optional `timezone` argument of `getOffsetInMinutes()` and `nextIntervalInSeconds()` work for any time zone without reading or changing the active one. Because `init()` runs once per process, this is how tests cover many time zones in one process. `Cache` never passes the argument.

## Offset lookup

The offset is the local time of an instant minus UTC, in minutes. It is positive east of UTC and negative west of it: America/Chicago is `-300` during CDT and `-360` during CST, Asia/Kathmandu is `345`, and `Etc/UTC` is `0`. This is the sign `CacheData` stored before v1.4.0 (`-1 * moment.tz.zone(zone).utcOffset(ms)`), and `TimeUtils` keeps it.

### The wall-clock method

`Intl.DateTimeFormat.formatToParts()` reports the local year, month, day, hour, minute, and second of an instant. `TimeUtils` reads those parts back as if they were UTC and subtracts the instant, floored to the second:

```javascript
// Simplified from TimeUtils.#offsetSecondsAt() in src/lib/utils/TimeUtils.class.js
const parts = {};
for (const { type, value } of formatter.formatToParts(epochMs)) {
	parts[type] = value;
}
const wall = new Date(0);
wall.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
wall.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0);
const offsetInSeconds = (wall.getTime() - Math.floor(epochMs / 1000) * 1000) / 1000;
```

A few details in this code are there for a reason:

- **`setUTCFullYear()` instead of `Date.UTC()`.** `Date.UTC()` maps the years 0 to 99 onto 1900 to 1999. `setUTCFullYear()` doesn't, so early dates assemble correctly.
- **`Math.trunc` before the lookup, `Math.floor` after.** `Intl` truncates a fractional time the same way, so flooring the instant to the second agrees with the second the formatter reported, including for instants before the epoch.
- **Whole seconds.** The offset is computed in integer seconds and divided by 60 only when `getOffsetInMinutes()` returns. Offsets before standard time was adopted have a seconds part: America/Chicago was `-350.6` minutes (`GMT-05:50:36`) before 1883. Working in seconds keeps `nextIntervalInSeconds()` exact for those.
- **`hourCycle: "h23"`.** This keeps midnight at hour `0`, so the formatter never reports an hour of `24`.
- **`numberingSystem: "latn"`.** This pins ASCII digits whatever the runtime's defaults are, so `Number()` parses every part.

### Computed on every call

The offset is computed on every call and never cached by instant. This is what lets boundaries follow a DST change in a process that stays up across it (see [DST behavior](#dst-behavior)). It costs little: during planning on the development machine, a `formatToParts()` lookup took about 2.3 µs.

### Formatter reuse

Building an `Intl.DateTimeFormat` took about 34 µs in the same measurements, roughly 15 times the cost of a lookup. `TimeUtils` therefore builds one formatter per time zone name and reuses it. Validation and lookup share the formatter: `resolveTimezone()` validates a name by building its formatter, and keeps the formatter in a private `Map` keyed by the name as given. `America/Chicago` and `america/chicago` get separate entries. Production only ever holds one or two.

If `Intl` rejects a name, `TimeUtils` throws an `Error` whose message quotes the name with `JSON.stringify` (which escapes control characters before they reach a log) and whose `cause` is the `RangeError` that `Intl` threw:

```javascript
const TimeUtils = require("./src/lib/utils/TimeUtils.class.js");

try {
	TimeUtils.resolveTimezone("America/Chicgo", undefined);
} catch (error) {
	console.log(error.message);
	// Invalid timezone "America/Chicgo". Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".
	console.log(error.cause instanceof RangeError); // true
}
```

### Inputs that aren't ordinary instants

- **`NaN` and out-of-range timestamps** (beyond ±8.64e15 ms) return a `NaN` offset. `formatToParts()` throws a `RangeError` for them, so the lookup checks first. A `NaN` timestamp gave `NaN` before v1.4.0, and still does, instead of a new throw.
- **A timestamp of 0, or an omitted one,** means the current time, as it did in the methods `TimeUtils` replaced.
- **Zero-offset zones** return `0`. The old expression `-1 * 0` gave `-0`, which Jest's `toEqual` tells apart from `0`, so the golden fixture normalizes `-0` to `0`.

## Interval arithmetic

`nextIntervalInSeconds(intervalInSeconds, timestampInSeconds, timezone)` shifts the timestamp into a local frame by the offset, rounds up to a multiple of the interval, and shifts back:

```javascript
// Simplified from TimeUtils.nextIntervalInSeconds() in src/lib/utils/TimeUtils.class.js
const offset = offsetInSecondsAt(timestampInSeconds);   // looked up at the timestamp
const shifted = new Date((timestampInSeconds + offset) * 1000);
const intervalMs = intervalInSeconds * 1000;
const rounded = new Date(Math.ceil(shifted.getTime() / intervalMs) * intervalMs);
return Math.ceil(rounded.getTime() / 1000) - offset;
```

For integer inputs the result B satisfies `t <= B < t + interval`, and `B + offset` is a multiple of the interval. A timestamp already on a boundary returns itself, so an entry whose expiration falls exactly on a boundary is expired immediately.

### Why it matches the old arithmetic

The operations are the ones `CacheData.nextIntervalInSeconds()` ran before v1.4.0: the same shift, the same two `Date` round-trips, and `Math.ceil` in the same places. Given the same offset, the result is identical for every input that didn't make the old converters throw. This is what the [golden fixture](#golden-fixture) checks. The round-trips through `Date` are kept on purpose: `new Date(x).getTime()` truncates fractional milliseconds and turns values beyond ±8.64e15 into `NaN`, so keeping them keeps those results unchanged too.

The only change to the arithmetic is the instant at which the offset is sampled (see [DST behavior](#dst-behavior)).

### The converters are not used inside it

Before v1.4.0 the arithmetic passed the shifted timestamp, the interval, and the rounded value through `convertTimestampFromSecondsToMilli()` and `convertTimestampFromMilliToSeconds()`, which treat a value of 0 as "now". They also threw when called with 0 (the bug was `Date.now().getTime()`, called on a number). With that bug fixed, a 0 in the middle of the arithmetic would silently become the current time. `TimeUtils` multiplies and divides directly, so a 0 stays 0.

The same reasoning applies to `parseToSeconds()`, which computes `Math.ceil(ms / 1000)` itself. The Unix epoch therefore parses to 0, where before it returned 0 only because the converter threw and the error was caught and logged.

### Alignment

Because the arithmetic rounds a local-frame timestamp to a multiple of the interval counted from 1970-01-01T00:00:00 local time, alignment depends on the interval:

- An interval that divides 24 hours (2, 3, 4, 6, 8, 12, and 24 hours) falls on multiples of the interval from local midnight.
- Any other interval counts from the epoch in the local frame. A 5-hour boundary moves by an hour each day, and 168 hours falls on Thursdays, because the epoch was a Thursday.
- The offset applies to every interval. In a zone whose offset isn't a whole number of hours, hourly boundaries sit off the UTC hour: at :30 past it in Asia/Kolkata and at :15 past it in Asia/Kathmandu, where half-hourly boundaries fall at :15 and :45.

### Invalid intervals

An interval of 0 gives `NaN`, where the old code threw a `TypeError` through the converter. Negative and non-numeric intervals give the same results as before. `Cache` passes `defaultExpirationInSeconds`, which it parses with `parseInt`.

## DST behavior

### The offset is looked up at the timestamp

Before v1.4.0 the offset was sampled once, at `Cache.init()`, and reused for the life of the process. An execution environment that stayed up across a DST change kept the old offset. For example, a function initialized during CDT computed a 24-hour boundary for a timestamp after 2026-11-01 at 11:00 PM CST instead of midnight.

`TimeUtils` looks up the offset for the timestamp being rounded, on every call. A process that stays up for months gets correct offsets on both sides of a change. This also means `Cache.info().offsetInMinutes` is the offset at the time `info()` is called rather than at init.

### The known gap

The offset is the one in effect at the input timestamp. If a transition falls between the timestamp and the boundary, the boundary is computed with the wrong offset and is off by the DST delta (one hour in most zones, 30 minutes in Australia/Lord_Howe).

Worked examples in America/Chicago, where clocks fall back from 2:00 AM CDT to 1:00 AM CST on 2026-11-01:

| Interval | Input timestamp | `TimeUtils` boundary | On the local clock | Wall-clock rounding (`Temporal` `round()`) |
|---|---|---|---|---|
| 4 hours | 1:30 AM CDT (06:30Z) | 09:00Z | 3:00 AM CST | 4:00 AM CST |
| 24 hours | 12:30 AM CDT (05:30Z) | 2026-11-02T05:00Z | 11:00 PM CST, Nov 1 | Midnight, Nov 2 |
| 1 hour | 1:30 AM CDT (06:30Z) | 07:00Z | 1:00 AM CST | 2:00 AM CST |

The first two rows are the gap. For intervals of a day or less it affects only boundaries computed within one interval before a transition, which is a few hours a year. The third row isn't a gap: the clock shows 1:00 AM a second time, and the next time it shows a :00 mark is the boundary. Wall-clock rounding skips the repeated hour, so it answers 2:00 AM there. The last column comes from the verification described under [Temporal](#temporal).

```javascript
const TimeUtils = require("./src/lib/utils/TimeUtils.class.js");

// 4 hours from 1:30 AM CDT on 2026-11-01
const start = Date.UTC(2026, 10, 1, 6, 30) / 1000;
console.log(TimeUtils.getOffsetInMinutes(start, "America/Chicago")); // -300
const boundary = TimeUtils.nextIntervalInSeconds(14400, start, "America/Chicago");
console.log(new Date(boundary * 1000).toISOString()); // "2026-11-01T09:00:00.000Z" (3:00 AM CST)
```

### What exact alignment would need

Exact wall-clock alignment would detect a transition between the timestamp and the candidate boundary and recompute with the new offset. That needs explicit rules for local times that don't exist (the spring-forward gap), and it must not skip the repeated hour at fall-back: a naive "check the offset again at the result" turns hourly intervals into a 2-hour gap that night. It was left out of v1.4.0 because it changes boundaries only within one interval of a transition, and it would be the most complex code in the change. It would be its own change, with an independent oracle for the rows that straddle a transition.

## Time zone data

`TimeUtils` has no time zone data of its own. Offsets come from the IANA time zone database (tzdata) inside the Node.js runtime's ICU data. `Cache.info().tzDataVersion` reports `process.versions.tz`, or `null` when the runtime doesn't report one, so a user who sees boundaries an hour off can say which rules their runtime has.

Rule freshness is therefore a runtime concern: the rules update when the Node.js runtime that runs the function updates. How quickly that happens on a given Lambda runtime, or in a container image that bundles its own Node.js, wasn't checked here. To see what a deployed function has, log `process.versions.tz`.

### Differences found during planning

Before the removal, the rules came from the copy bundled with `moment-timezone`. The two sources disagree for some zones after September 2026, and which zones depends on the Node.js version. This table was measured on the development machine, comparing `moment-timezone` 0.6.5 (tzdata 2026e) with each runtime from 2020 to 2027 in 3-hour steps:

| Node.js | ICU | tzdata | Zones that differ from `moment-timezone` 0.6.5 |
|---|---|---|---|
| 22.23.2 | 78.2 | 2026a | 11 |
| 24.15.0 | 78.2 | 2026a | 11 |
| 26.10.0 | 78.3 | 2026c | 4 |

On Node.js 22 and 24 the 11 zones are:

- Africa/Casablanca and Africa/El_Aaiun, from 2026-09-20.
- Nine Canadian zones, from 2026-11-01. They include America/Vancouver, America/Edmonton, and America/Winnipeg, and their related zones and aliases. For example, tzdata 2026e keeps America/Vancouver at UTC-7 after November 1, while 2026a returns it to UTC-8.

On Node.js 26.10.0 the four zones are America/Winnipeg, America/Rainy_River, Canada/Central, and America/Inuvik, from 2026-11-01. Morocco, Vancouver, and Edmonton already agree with `moment-timezone` there.

For the fixture zones and the 2020 to 2025 range, all three runtimes agree with `moment-timezone` (0 mismatches in 2,104,320 checks per runtime). That is why the fixture replay can't depend on which Node.js runs it.

> **Note**: These differences are a snapshot. A later Node.js release changes them, and no document here should be read as a list of the current ones. Tests with fixed expected values avoid the zones above for dates after September 2026. To see the rules a runtime has, read `Cache.info().tzDataVersion` or `process.versions.tz`.

### Name handling

All 597 names `moment-timezone` knows are accepted by `Intl` on all three runtimes, with the same canonical forms and the same `RangeError` for an invalid name. `Intl` is case-insensitive, like `moment`, and neither trims whitespace; `TimeUtils` trims the configured name itself. `Intl` also accepts fixed offsets such as `+05:30`, which `moment-timezone` rejects.

## Golden fixture

Before `moment-timezone` was removed, a fixture recorded what the old code returned, so the replacement could be checked against it exactly.

| Item | Location |
|---|---|
| Generator | `.kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs` |
| Fixture | `test/cache/time-utils/fixtures/interval-fixture.json` |
| Replay test | `test/cache/time-utils/unit/time-utils-golden-fixture-tests.jest.mjs` |

### What it records

The fixture covers 10 time zones: Etc/UTC, America/Chicago, America/New_York, Europe/London, Asia/Kolkata (UTC+5:30), Asia/Kathmandu (UTC+5:45), America/St_Johns (UTC-3:30), Australia/Lord_Howe (30-minute DST), Pacific/Chatham (UTC+12:45), and Pacific/Kiritimati (UTC+14). For each zone it holds timestamps from 2020 through 2025:

- the 1st and 15th of each month, at a time of day derived from the month
- local midnight on the first day of each quarter
- one second before, at, and one second after each transition in that range, taken from the zone's `untils` list in `moment-timezone`

For each timestamp it records the offset in minutes, and for each of the 20 intervals of `Cache.testInterval()` the boundary minus the timestamp, in seconds. In all, it holds 1,894 timestamps. It also records the `moment-timezone` version (0.6.5) and its tzdata version (2026e). The output has no generation time, so it is deterministic.

### How the expected values were produced

The boundaries did not come from a re-implementation. The generator loads the pre-change `dao-cache.js`, gets the old `CacheData` class through `TestHarness.getInternals()`, and calls the real `CacheData.nextIntervalInSeconds()`. It stubs `CacheData.getOffsetInMinutes` for each row to return `moment-timezone`'s offset at that row's timestamp, and restores it afterwards. The arithmetic is therefore the old arithmetic, and only the instant at which the offset is sampled follows the new behavior.

The replay test calls `TimeUtils.getOffsetInMinutes(t, zone)` and `TimeUtils.nextIntervalInSeconds(I, t, zone) - t` for every row and compares the arrays with `toEqual`. It passes on Node.js 22, 24, and 26.

### Regenerating

The generator can only run against code that still has `moment-timezone` and `CacheData.getOffsetInMinutes`. After the removal, that means a pre-change copy of `src/`. The header comment of the generator has the full procedure; in outline:

1. Find the commit that removed the `moment-timezone` require from `src/lib/dao-cache.js` (`git log -S`), and extract its parent's `src/` into a git-ignored directory inside the repository with `git archive`.
2. Make `moment-timezone` available without recording it in `package.json`: `npm install --no-save moment-timezone@0.6.5`.
3. Run the generator with `--dao-cache` pointing at the extracted copy.
4. Remove the extracted directory and run `npm prune`.

Regenerating is rarely needed. The fixture exists to pin the v1.3 results, and its 2020 to 2025 range doesn't depend on later tzdata releases.

## Temporal

`Temporal` is the standard replacement for `Date`. During planning it was considered as a way to look up offsets, and it was not used in production code.

### What was verified on Node.js 26

| Check | Result |
|---|---|
| Availability | Enabled by default on Node.js 26 (V8 14.6). On 26.10.0 it is a global and using it prints no warning |
| Node.js 22 and 24 | Not available by default. `--harmony-temporal` exposes an older, pre-standard implementation that still has `Temporal.TimeZone`, lacks `getTimeZoneTransition()`, and cost about 30 µs per offset lookup |
| Offsets against `Intl`, 26.10.0, all 418 zones, 2020 to 2027, every 6 hours | Identical in 4.9 million checks. Both read the same ICU tzdata (2026c), so `Temporal` brings no data advantage |
| Cost per offset lookup, 26.10.0 | `Temporal` 0.78 µs, `Intl` 2.2 µs. Negligible either way on a path that runs once or twice per cache update |
| Next transition | `getTimeZoneTransition('next')` gives the next transition directly. `Intl` has no equivalent and would need a bisection search |

`ZonedDateTime.round({ roundingMode: 'ceil' })` at DST transitions in America/Chicago, compared with the arithmetic above:

| Case | `TimeUtils` | `Temporal` `round()` |
|---|---|---|
| 4 hours from 1:30 AM CDT on Nov 1 (fall back) | 3:00 AM CST | 4:00 AM CST, on the wall clock |
| 24 hours from 12:30 AM CDT on Nov 1 | 11:00 PM CST, Nov 1 | Midnight, Nov 2 |
| 1 hour from 1:30 AM CDT on Nov 1 | 1:00 AM CST, the next :00 mark on the clock | 2:00 AM CST, skipping the repeated 1:00 AM hour |
| 1 or 2 hours from 1:30 AM CST on Mar 8 (spring forward) | 3:00 AM CDT | 3:00 AM CDT |
| 5 hours | Aligned to the epoch | Throws `RangeError`: the increment must divide a day |
| 48 hours and longer | Aligned to the epoch | Throws `RangeError`: a day increment above 1 isn't allowed |

`Temporal` rounds multi-hour intervals correctly across a transition, but it can't express 5 of the 20 intervals in `Cache.testInterval()` (5, 48, 72, 96, and 120 hours), or common `defaultExpirationInSeconds` values such as 45 or 90 minutes, and it skips the repeated hour at fall-back. A `Temporal` path would still need the arithmetic above for everything `round()` can't do, plus its own rule for the repeated hour.

### Why production uses `Intl` only

- **One code path.** `Intl` gives the same results on Node.js 22, 24, and 26, and the package supports all three (`engines.node` is `>=22.0.0`).
- **Shared caches.** Functions on different Node.js versions can share cache entries through `sharedCacheId`. A path gated on the runtime would give the same profile different expirations depending on which function refreshed the entry.
- **No release safety net on 26.** The Node.js 26 CI leg is `continue-on-error`, and `nodejs26.x` was a Lambda preview when this was decided, so a path that only runs there could break without blocking a release.

`TimeUtils.class.js` contains no reference to `Temporal`, and a source test asserts it.

### Temporal as a test oracle

Where native `Temporal` exists, the tests use it as an independent check. It is a separate implementation reading the same tz data, so it checks `TimeUtils`' derivation of the offset rather than the data. Two files hold the pieces:

- `test/helpers/time-utils-oracles.mjs` exports `nativeTemporal()` and `temporalOffsetMinutes()`, along with `longOffsetMinutes()`, which parses the offset ICU formats itself with `timeZoneName: 'longOffset'` and runs on every runtime.
- `test/cache/time-utils/property/time-utils-temporal-oracle-property-tests.jest.mjs` holds Property 8: for any zone, instant, and interval, `getOffsetInMinutes()` equals `Temporal`'s offset in minutes, and the boundary aligns to `Temporal`'s offset at the timestamp.

**Detection.** `nativeTemporal()` returns `globalThis.Temporal` only when both checks pass:

1. The Node.js major version (`process.versions.node`) is 26 or later.
2. `typeof globalThis.Temporal?.ZonedDateTime?.prototype?.getTimeZoneTransition === "function"`.

`typeof Temporal` alone isn't a safe check. On Node.js 22 and 24, `--harmony-temporal` defines the older implementation, and any process can define a global polyfill with a different API and very different performance. The oracle module reads `Temporal` only through `globalThis`, so a runtime without it gets `undefined` instead of a `ReferenceError`.

Where `nativeTemporal()` returns `null`, the Property 8 block is `describe.skip`, and Jest reports its tests as skipped rather than passed. On the Node.js 26 CI leg it runs as a cross-check that never gates a release. The `longOffset` oracle gives the same coverage on every runtime: `test/cache/time-utils/property/time-utils-property-tests.jest.mjs` checks the offset and the boundary alignment against it.

### Moving onto Temporal later

A single `Temporal`-based implementation of `TimeUtils` is a follow-up for when the minimum supported Node.js version reaches 26, so every supported runtime has it. The package's floor is Node.js 22 today (Node.js 22 reaches end-of-life on 2027-04-30, and Node.js 24 on 2028-04-30). At that point:

- The offset lookup becomes `Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone).offsetNanoseconds`, and `getTimeZoneTransition()` replaces any search for the next transition.
- The wall-clock alignment described in [What exact alignment would need](#what-exact-alignment-would-need) becomes easier to build, but `round()` doesn't cover every interval, so the epoch arithmetic stays for the rest, and the rule for the repeated hour still has to be decided.
- The golden fixture and the `longOffset` oracle still apply, so the move can be checked against the recorded results.
- Whether the move changes boundaries at transitions is a behavior change for consumers and needs its own changelog entry.

## Related documentation

- [Cache feature README](../features/cache/README.md) - configuring `timeZoneForInterval` and `expirationIsOnInterval`, and how interval boundaries behave for users
- [Cache key hashing technical documentation](./cache-key-hashing.md) - the other internal class in `src/lib/utils/` with a mechanism reference
- [In-memory cache technical documentation](./in-memory-cache.md) - the L0 cache that sits in front of DynamoDB and S3
