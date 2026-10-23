# Design Document

## Overview

This design moves the package's time utilities into a new internal static class, `TimeUtils` (`src/lib/utils/TimeUtils.class.js`), and replaces the single `moment-timezone` call with an offset lookup through `Intl.DateTimeFormat`. The offset is looked up for each timestamp being rounded instead of once at init (Q1). `Cache.init()` initializes TimeUtils before anything else, so an invalid timezone fails init without leaving state behind and both cache modes honor the setting (Q2, Q4). `CacheData` stops handling the timezone. `moment-timezone` is removed only after a golden fixture, recorded from the pre-change code, pins today's results (Q10).

Production changes are confined to the new class and `src/lib/dao-cache.js`. The rest is:

- two fields in the type definitions
- two edits to existing tests
- new tests and test helpers
- the fixture and its generator
- documentation
- the dependency removal
- the CHANGELOG entry

Requirement numbers refer to [requirements.md](requirements.md). Q numbers and Rounds refer to the Decision Log in [PLAN.md](PLAN.md).

## Design goals

1. **Same results wherever today's are right.** The interval arithmetic is today's, operation for operation. Only the instant at which the offset is sampled changes (Req 6.2, 6.6).
2. **The public API doesn't move.** `Cache.*` signatures and return shapes stay the same, and `Cache.info()` gains one field (Req 8.6 to 8.8, 12).
3. **Configuration errors surface at init.** They're readable, and a corrected retry succeeds (Req 3).
4. **One code path on every runtime.** Production uses `Intl` only (Q13).
5. **A pure core.** Timezone resolution, offset lookup, and interval math take explicit inputs. Tests can cover every timezone in one process even though `init()` runs once (Req 4.5, 4.6).

## Pre-design measurements

These were measured on the development machine with Node.js 22.23.2, 24.15.0, and 26.10.0 (PLAN.md, Rounds 1 to 4).

| Finding | Consequence for the design |
|---|---|
| Today's stored offset is `-1 * moment.tz.zone(tz).utcOffset(ms)`, which gives `-300` for Chicago in CDT: local time minus UTC | TimeUtils keeps that sign convention |
| For zero-offset zones that expression is `-0` | TimeUtils returns `0`. The fixture normalizes `-0` to `0`, because Jest's `toEqual` tells them apart |
| Building an `Intl.DateTimeFormat` takes ~34 µs; a `formatToParts()` lookup takes ~2.3 µs | One formatter per timezone, built once and reused |
| `Intl` rejects an unknown name with `RangeError: Invalid time zone specified: <name>`, and canonicalizes names it accepts (`Etc/UTC` → `UTC`) | The `RangeError` becomes `cause`; the name is stored as given |
| Offsets parsed from `timeZoneName: 'longOffset'` output match the wall-clock method for all 418 zones from 2000 to 2100, on all three runtimes | An independent oracle for property tests on every runtime |
| On 26.10.0, Temporal offsets match `Intl` for all 418 zones from 2020 to 2027 | A second oracle on Node.js 26 (Q13) |
| Today's arithmetic passes the shifted timestamp, the interval, and the rounded value through the converters, where 0 means "now" | TimeUtils multiplies and divides directly, so a 0 in the middle of the arithmetic stays 0 after the Q7 fix |
| `new Date(x).getTime()` truncates fractional milliseconds and turns values beyond ±8.64e15 into `NaN`. Today's arithmetic round-trips through `Date` twice | TimeUtils keeps both round-trips, so fractional and out-of-range inputs give today's results |
| `formatToParts()` throws `RangeError` for `NaN` and out-of-range times | The offset lookup returns `NaN` for those, so a `NaN` timestamp gives `NaN` as it does today instead of a new throw |
| `Date.UTC()` maps years 0 to 99 to 1900 to 1999 | Wall-clock parts are assembled with `setUTCFullYear()` |
| `CacheData.getOffsetInMinutes` is a writable static, and `CacheData.nextIntervalInSeconds` calls it by class name | The fixture generator can stub the offset row by row |
| `moment.tz.zone(z).untils` lists a zone's transition instants | The generator finds the fixture's DST instants there |
| No test calls the moved `CacheData` methods, and none asserts an interval result | Removing them breaks nothing; interval coverage is new |
| The `test/documentation/` JSDoc tests scan `dao-cache.js`, `dao-endpoint.js`, and `src/lib/tools/`, but not `src/lib/utils/`. The link test skips `.kiro/specs` | TimeUtils' JSDoc follows the standard but isn't machine-checked. Edits in `dao-cache.js` must keep those tests passing |
| ESLint reports 21 errors in `dao-cache.js`, 14 in `cache-validation-tests.jest.mjs`, and 1 in `backwards-compatibility-tests.jest.mjs`; 1,012 across the repository. `Intl`, `typeof Temporal`, and `globalThis.Temporal` pass; a bare `URL` is `no-undef`; `throw new Error(msg, { cause })` satisfies `preserve-caught-error` | The baseline for Req 11.13. New files avoid a bare `URL` |

## Architecture

### Current

```
Cache.init(parameters)
  in-memory-only? → return                          timezone never read; info() reports "UTC", offset 0
  CacheData.init(parameters)
    DynamoDbCache.init(), S3Cache.init(), #secureDataKey = ...     state assigned first
    validate timeZoneForInterval → #timeZoneForInterval            "" or undefined throws
    _setOffsetInMinutes()
      #offsetInMinutes = -1 * moment.tz.zone(tz).utcOffset(Date.now())    once; an invalid zone throws TypeError

Cache.nextIntervalInSeconds(I, t) → CacheData.nextIntervalInSeconds(I, t)
  shift t by #offsetInMinutes (sampled at init), round up to a multiple of I, shift back
```

### New

```
Cache.init(parameters)
  parameters must be an object
  TimeUtils.init({ timezone: parameters.timeZoneForInterval })    first; on error: log, rethrow
  in-memory-only? → return                                         timezone honored
  CacheData.init(parameters)                                       no timezone handling

TimeUtils                                                          src/lib/utils/TimeUtils.class.js
  #initialized = false, #timezone = "Etc/UTC", #activeFormatter = null
  #formatters = Map<name, Intl.DateTimeFormat>
  nextIntervalInSeconds(I, t)
    offset = wall-clock time of t in #timezone, read as UTC, minus t
    shift t by offset, round up to a multiple of I, shift back      today's arithmetic
```

### Files

| File | Change | Requirements |
|---|---|---|
| `src/lib/utils/TimeUtils.class.js` (new) | The class | 1 to 7 |
| `src/lib/dao-cache.js` | Replace the `moment-timezone` require with TimeUtils. `Cache.init()` calls `TimeUtils.init()` first. Remove the timezone fields, the init block, and seven methods from `CacheData`. Re-point every call site. `isExpired()` handles a `Cache` with no stored data. JSDoc | 3.5, 3.6, 7.8, 8, 9.1, 13.2 to 13.4 |
| `types/lib/dao-cache.d.ts` | `tzDataVersion` and `saltSource` on `Cache.info()`; doc comments | 12.4, 13 |
| `package.json`, `package-lock.json` | Remove `moment-timezone`, and `moment` with it | 9.2, 9.3 |
| `test/cache/cache-validation-tests.jest.mjs` | Replace one test with two | 11.2 |
| `test/powertools/integration/backwards-compatibility-tests.jest.mjs` | The dependency test expects none | 9.4 |
| `.kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs` (new) | Fixture generator | 10.1 to 10.4, 10.8 |
| `test/cache/time-utils/fixtures/interval-fixture.json` (new) | Golden fixture | 10.4, 10.5 |
| `test/cache/time-utils/fixtures/time-utils-child.cjs` (new) | Child-process scenarios | 11.6 |
| `test/helpers/time-utils-child-runner.mjs` (new) | Runs the child without a shell | 11.6, 11.9 |
| `test/helpers/time-utils-oracles.mjs` (new) | The interval table, the `longOffset` oracle, and Temporal detection and oracle | 11.4, 11.5 |
| `test/cache/time-utils/unit/` (3 new files) | Unit tests, fixture replay, source and dependency checks | 8.4, 9, 10.6, 11.3 |
| `test/cache/time-utils/property/` (2 new files) | Properties 1 to 8 | 11.4, 11.5 |
| `test/cache/time-utils/integration/` (3 new files) | TimeUtils lifecycle, `Cache.init()`, and the `Cache` API | 11.6 to 11.8 |
| `test/types/consumer-cache-info.ts` (new) | Type consumer for the two new fields | 11.14 |
| `docs/features/cache/README.md` | New subsection; configuration table row | 13.5, 13.6 |
| `docs/technical/interval-expiration.md` (new) | TimeUtils internals | 13.7 |
| `CHANGELOG.md` | Entries under v1.4.0 | 14 |

## Components and interfaces

### TimeUtils

Module-level constants:

```js
const DEFAULT_TIMEZONE = "Etc/UTC";
const TIMEZONE_ENV_VAR = "CACHE_DATA_TIME_ZONE_FOR_INTERVAL";
const TIMEZONE_HINT = 'Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".';
const FORMAT_OPTIONS = {
	hourCycle: "h23", numberingSystem: "latn",
	year: "numeric", month: "numeric", day: "numeric",
	hour: "numeric", minute: "numeric", second: "numeric"
};
```

Private static state:

| Field | Initial value | Set by |
|---|---|---|
| `#initialized` | `false` | The first successful `init()` |
| `#timezone` | `"Etc/UTC"` | The first successful `init()` |
| `#activeFormatter` | `null`, meaning offset 0 | The first successful `init()` |
| `#formatters` | An empty `Map` | Every name that passes validation, from any caller |

Public static methods:

| Method | Returns | Notes | Req |
|---|---|---|---|
| `init(options = {})` | `undefined` | Resolves, validates, and stores the timezone. A repeat call warns and returns | 2, 3.1 to 3.4, 4.1, 4.2 |
| `resolveTimezone(option, envValue)` | Trimmed name | Pure apart from the formatter cache. Throws the errors in Req 2.4, 3.2, and 3.3 | 2, 3.1 to 3.3, 4.5 |
| `getTimeZone()` | string | The active name | 2.7, 4.3, 8.8 |
| `getTzDataVersion()` | string or `null` | `process.versions.tz` when it's a non-empty string | 8.8 |
| `getOffsetInMinutes(timestampInSeconds = 0, timezone)` | number | Uses the active timezone when `timezone` is omitted | 4.3, 4.5, 5 |
| `nextIntervalInSeconds(intervalInSeconds, timestampInSeconds = 0, timezone)` | number | Uses the active timezone when `timezone` is omitted | 4.5, 6 |
| `generateInternetFormattedDate(timestamp, inMilliseconds = false)` | string | | 7.4 |
| `convertTimestampFromMilliToSeconds(timestampInMilliseconds = 0)` | number | | 7.1, 7.3 |
| `convertTimestampFromSecondsToMilli(timestampInSeconds = 0)` | number | | 7.2, 7.3 |
| `parseToSeconds(date)` | number | | 7.5 to 7.7 |

`resolveTimezone()` and the optional `timezone` arguments are the testing seam for Req 4.5. `Cache` never passes `timezone`, and its wrappers keep their two-argument signatures (Req 8.6).

### Timezone resolution

```js
static resolveTimezone(option, envValue) {
	if (TimeUtils.#isProvided(option)) {
		if (typeof option !== "string") {
			throw new Error(`Invalid timezone of type ${typeof option}. ${TIMEZONE_HINT}`);
		}
		return TimeUtils.#validate(option.trim(), "");
	}
	if (TimeUtils.#isProvided(envValue)) {
		return TimeUtils.#validate(String(envValue).trim(), ` from ${TIMEZONE_ENV_VAR}`);
	}
	return TimeUtils.#validate(DEFAULT_TIMEZONE, "");
}

// Not provided (Req 2.2): undefined, null, "", or whitespace only
static #isProvided(value) {
	return value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "");
}

static #validate(name, sourceSuffix) {
	if (!TimeUtils.#formatters.has(name)) {
		try {
			TimeUtils.#formatters.set(name, new Intl.DateTimeFormat("en-US", { ...FORMAT_OPTIONS, timeZone: name }));
		} catch (error) {
			// >! JSON.stringify quotes the name and escapes control characters before it reaches a log
			throw new Error(`Invalid timezone ${JSON.stringify(name)}${sourceSuffix}. ${TIMEZONE_HINT}`, { cause: error });
		}
	}
	return name;
}
```

Decision table (Req 2.1, 2.2, 2.4, 3.2, 3.3):

| Option | Env var | Result |
|---|---|---|
| A valid string, with or without surrounding whitespace | Anything | The trimmed option |
| A provided value that isn't a string | Anything | Throws `Invalid timezone of type <type>. ...` |
| A string `Intl` rejects | Anything | Throws `Invalid timezone "<name>". ...` |
| Not provided | A valid string, with or without surrounding whitespace | The trimmed env value |
| Not provided | A string `Intl` rejects | Throws `Invalid timezone "<name>" from CACHE_DATA_TIME_ZONE_FOR_INTERVAL. ...` |
| Not provided | Not provided | `"Etc/UTC"` |

The env value is read only when the option isn't provided, so a broken env var can't fail a configuration that passes a valid option. The cache map is keyed by the name as given, so `America/Chicago` and `america/chicago` get separate formatters. Production only ever holds one or two.

### `init(options)`

```js
static init(options = {}) {
	if (TimeUtils.#initialized) {
		DebugAndLog.warn("TimeUtils already initialized. Ignoring call to TimeUtils.init()");
		return;
	}
	const option = (options === undefined || options === null) ? undefined : options.timezone;
	const name = TimeUtils.resolveTimezone(option, process.env[TIMEZONE_ENV_VAR]); // may throw
	TimeUtils.#activeFormatter = TimeUtils.#formatters.get(name);
	TimeUtils.#timezone = name;
	TimeUtils.#initialized = true;
}
```

Nothing is assigned until `resolveTimezone()` returns. A throw leaves TimeUtils uninitialized, so a later call can still succeed (Req 3.4). A repeat call reads neither the option nor the env var (Req 4.2). There's no reset member (Req 4.6); tests that need a fresh state use a child process.

### Offset lookup

```js
static getOffsetInMinutes(timestampInSeconds = 0, timezone = undefined) {
	return TimeUtils.#offsetSecondsAt(timestampInSeconds, timezone) / 60;
}

static #offsetSecondsAt(timestampInSeconds, timezone) {
	const formatter = (timezone === undefined)
		? TimeUtils.#activeFormatter
		: TimeUtils.#formatters.get(TimeUtils.resolveTimezone(timezone, undefined));
	if (formatter === null) {
		return 0; // uninitialized: Etc/UTC (Req 4.3)
	}
	const epochMs = Math.trunc((timestampInSeconds === 0) ? Date.now() : timestampInSeconds * 1000);
	if (!Number.isFinite(epochMs) || Math.abs(epochMs) > 8.64e15) {
		return NaN; // what today's arithmetic produces for these inputs
	}
	const parts = {};
	for (const { type, value } of formatter.formatToParts(epochMs)) {
		parts[type] = value;
	}
	const wall = new Date(0);
	wall.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
	wall.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0);
	return (wall.getTime() - Math.floor(epochMs / 1000) * 1000) / 1000;
}
```

- The offset is the wall-clock time read as if it were UTC, minus the instant floored to the second. That gives local time minus UTC, positive east of UTC (Req 5.1, 5.2). For example: America/Chicago is −300 in CDT and −360 in CST, Asia/Kathmandu is 345, and Etc/UTC is 0.
- `Math.trunc` runs first because `Intl` truncates a fractional time the same way. The floor below then agrees with the second `Intl` formatted, including for negative instants.
- Working in integer seconds keeps `nextIntervalInSeconds()` exact for offsets that have a seconds part, such as local mean time before 1900. `getOffsetInMinutes()` divides by 60 only when it returns.
- `hourCycle: "h23"` prevents an hour of `24` at midnight, and `numberingSystem: "latn"` pins ASCII digits.
- The offset is computed on every call and never cached by instant (Req 5.3). At ~2.3 µs it costs nothing measurable on a path that runs once or twice per cache update.
- An explicit `timezone` goes through `resolveTimezone(timezone, undefined)`, so it follows the option rules and throws the same errors (Req 4.5).

### Interval arithmetic

Today's `CacheData.nextIntervalInSeconds()`:

```js
if (timestampInSeconds === 0) { timestampInSeconds = CacheData.convertTimestampFromMilliToSeconds(Date.now()); }
let offset = (CacheData.getOffsetInMinutes() * 60);                  // sampled at init
timestampInSeconds += offset;
let date = new Date(CacheData.convertTimestampFromSecondsToMilli(timestampInSeconds));
let coeff = CacheData.convertTimestampFromSecondsToMilli(intervalInSeconds);
let rounded = new Date(Math.ceil(date.getTime() / coeff) * coeff);
let nextInSeconds = CacheData.convertTimestampFromMilliToSeconds(rounded.getTime());
nextInSeconds -= offset;
return nextInSeconds;
```

The TimeUtils version:

```js
static nextIntervalInSeconds(intervalInSeconds, timestampInSeconds = 0, timezone = undefined) {
	if (timestampInSeconds === 0) {
		timestampInSeconds = TimeUtils.convertTimestampFromMilliToSeconds(Date.now());
	}
	const offset = TimeUtils.#offsetSecondsAt(timestampInSeconds, timezone); // sampled at t (Q1)
	const shifted = new Date((timestampInSeconds + offset) * 1000);
	const intervalMs = intervalInSeconds * 1000;
	const rounded = new Date(Math.ceil(shifted.getTime() / intervalMs) * intervalMs);
	return Math.ceil(rounded.getTime() / 1000) - offset;
}
```

- The operations are today's: the same shift, the same two `Date` round-trips, and `Math.ceil` in the same places. Given the same offset, the result is identical for every input that didn't make today's converters throw (Req 6.2, 6.6).
- The converters are gone from the middle of the arithmetic. Today a shifted timestamp, interval, or rounded value of exactly 0 throws. After the Q7 fix that 0 would silently become "now", so the arithmetic multiplies and divides directly.
- A timestamp already on a boundary returns itself (Req 6.4).
- An interval of 0 gives `NaN`; today it throws a `TypeError` through the converter. Negative and non-numeric intervals give the same results as today. `Cache` passes `defaultExpirationInSeconds`, which it parses with `parseInt`.

### Converters, formatter, and parser

```js
static convertTimestampFromMilliToSeconds(timestampInMilliseconds = 0) {
	const ms = (timestampInMilliseconds === 0) ? Date.now() : timestampInMilliseconds;
	return Math.ceil(ms / 1000);
}

static convertTimestampFromSecondsToMilli(timestampInSeconds = 0) {
	return (timestampInSeconds === 0) ? Date.now() : timestampInSeconds * 1000;
}

static generateInternetFormattedDate(timestamp, inMilliseconds = false) {
	const ms = inMilliseconds ? timestamp : TimeUtils.convertTimestampFromSecondsToMilli(timestamp);
	return new Date(ms).toUTCString();
}

static parseToSeconds(date) {
	try {
		const ms = Date.parse(date);
		return Number.isFinite(ms) ? Math.ceil(ms / 1000) : 0;
	} catch (error) {
		DebugAndLog.error(`Cannot parse date/time: ${String(date)} ${error?.message || "Unknown error"}`, error?.stack);
		return 0;
	}
}
```

- The converters keep "0 or omitted means now", now implemented with `Date.now()` (Req 7.1 to 7.3). The old placeholder variable `timestampInMilli`, which accounts for one of `dao-cache.js`'s lint errors, isn't carried over, and the parameter typo `timestampInMillseconds` is fixed (Round 2).
- `generateInternetFormattedDate()` keeps today's truthiness test on `inMilliseconds`.
- `parseToSeconds()` divides directly, so the Unix epoch parses to 0 rather than "now" (Req 7.5). `Date.parse()` only throws for values such as a `Symbol`. `String()` keeps the log line itself from throwing in that case (Req 7.7).

### `getTzDataVersion()`

```js
static getTzDataVersion() {
	const version = process.versions?.tz;
	return (typeof version === "string" && version.length > 0) ? version : null;
}
```

### Changes in `src/lib/dao-cache.js`

**Imports.** `const moment = require('moment-timezone');` becomes `const TimeUtils = require("./utils/TimeUtils.class.js");`. TimeUtils requires only `../tools/DebugAndLog.class.js`, which doesn't require `dao-cache.js`, so there's no cycle.

**`Cache.init()`.** This block goes right after the parameters-object check (Req 3.5, 8.1):

```js
// Timezone first: an invalid value must fail init before any state is assigned (Q2, Q4)
try {
	TimeUtils.init({ timezone: parameters.timeZoneForInterval });
} catch (error) {
	tools.DebugAndLog.error(`Cache.init() failed: ${error?.message || "Unknown error"}`, error?.stack);
	throw error;
}
```

Rethrowing the same object keeps its message and `cause` (Req 3.5). The block runs before `#idHashAlgorithm` and everything after it, and before `CacheData.init()`. A failed call therefore leaves nothing behind to block a corrected retry (Req 3.6).

**`CacheData`.**

- Remove the `#timeZoneForInterval` and `#offsetInMinutes` fields (Req 8.2, 8.4).
- Remove the `CACHE_DATA_TIME_ZONE_FOR_INTERVAL` block and the `_setOffsetInMinutes()` call from `init()`.
- Remove seven methods: `_setOffsetInMinutes`, `getOffsetInMinutes`, `getTimeZoneForInterval`, `generateInternetFormattedDate`, `nextIntervalInSeconds`, `convertTimestampFromMilliToSeconds`, and `convertTimestampFromSecondsToMilli`.
- `info()` reports `timeZoneForInterval: TimeUtils.getTimeZone()`, `offsetInMinutes: TimeUtils.getOffsetInMinutes()`, and `tzDataVersion: TimeUtils.getTzDataVersion()`. `Cache.info()` merges `CacheData.info()`, so the new field reaches it in both cache modes (Req 8.8).
- `write()` calls `TimeUtils.generateInternetFormattedDate()` for `last-modified` and `expires`.

**`Cache`.**

| Member | After the change |
|---|---|
| Constructor | `TimeUtils.convertTimestampFromMilliToSeconds(Date.now())` |
| `testInterval()` | TimeUtils converters for `ts` and `start`. The 20 entries keep calling `Cache.nextIntervalInSeconds()`. Keys and shape are unchanged (Req 8.7) |
| `generateInternetFormattedDate(timestamp, inMilliseconds = false)` | `return TimeUtils.generateInternetFormattedDate(timestamp, inMilliseconds);` |
| `parseToSeconds(date)` | `return TimeUtils.parseToSeconds(date);` |
| `nextIntervalInSeconds(intervalInSeconds, timestampInSeconds = 0)` | `return TimeUtils.nextIntervalInSeconds(intervalInSeconds, timestampInSeconds);` |
| `calculateSecondsLeftUntilExpires()` | `TimeUtils.convertTimestampFromMilliToSeconds(Date.now())` |
| `isExpired()` | `const expires = this.getExpires(); return expires === 0 \|\| TimeUtils.convertTimestampFromSecondsToMilli(expires) <= Date.now();` |

`getExpires()` returns 0 only when there's no stored data. Today that 0 reaches the converter and throws. The explicit check makes "a `Cache` with no stored data is expired" (Req 7.8) independent of two `Date.now()` readings. `needsRefresh()` follows, because it calls `isExpired()`.

`calculateDefaultExpires()` and `update()` already go through `Cache.nextIntervalInSeconds()` and `Cache.parseToSeconds()`, so they don't change (Req 8.5).

### Types

```ts
static info(): {
	// ...existing fields unchanged...
	tzDataVersion: string | null;
	saltSource: "sharedCacheId" | "AWS_LAMBDA_FUNCTION_NAME" | "none";
};
```

The doc comment on `timeZoneForInterval?` in `CacheInitParameters` gains the resolution rules. Values that aren't provided fall through to `CACHE_DATA_TIME_ZONE_FOR_INTERVAL`, then `'Etc/UTC'`, and an invalid name makes `Cache.init()` throw. No other declaration changes (Req 12.4).

## Execution flows

### Cold start

1. `Cache.init(parameters)` checks that `parameters` is an object.
2. `TimeUtils.init({ timezone: parameters.timeZoneForInterval })` resolves the name, builds and caches its formatter, and stores it. An error is logged and rethrown here, before anything else is assigned.
3. `Cache.init()` continues as it does today: the hash algorithm, the in-memory settings, the in-memory-only guard, `sharedCacheId`, then `CacheData.init()`.

### Interval expiration on update

1. `cache.update()` calls `calculateDefaultExpires()`. For profiles with `expirationIsOnInterval`, that calls `Cache.nextIntervalInSeconds(defaultExpirationInSeconds, syncedNow)`.
2. TimeUtils reads the offset at `syncedNow` from the active formatter (~2.3 µs) and runs the arithmetic.
3. `CacheData.write()` formats `last-modified` and `expires` with `TimeUtils.generateInternetFormattedDate()`.

## Error handling

| Condition | Behavior | Requirements |
|---|---|---|
| The option is provided and isn't a string | `init()` throws `Invalid timezone of type <type>. ...` and assigns nothing | 2.4, 3.4 |
| `Intl` rejects the option or env value | `init()` throws `Invalid timezone "<name>". ...`, with the `RangeError` as `cause`, and assigns nothing. When the env var supplied the name, the message adds ` from CACHE_DATA_TIME_ZONE_FOR_INTERVAL` after it | 3.1 to 3.4 |
| Either error inside `Cache.init()` | Logged with `DebugAndLog.error`, then the same object is rethrown before any `Cache` state is assigned | 3.5, 3.6 |
| `init()` after a successful init | Warns `TimeUtils already initialized. Ignoring call to TimeUtils.init()`, without reading the options or the env var | 4.2 |
| An explicit `timezone` that's invalid | The same errors as the option | 4.5 |
| A `NaN` or out-of-range timestamp | Offset and boundary are `NaN`; nothing throws | 5, 6 |
| An interval of 0 | Boundary is `NaN` (today it throws a `TypeError`). Other invalid intervals behave as they do today | 6 |
| `Date.parse()` returns `NaN` | `parseToSeconds()` returns 0 | 7.6 |
| `Date.parse()` throws | Logged with `DebugAndLog.error`; `parseToSeconds()` returns 0 | 7.7 |
| `process.versions.tz` is missing | `tzDataVersion` is `null` | 8.8 |

## Correctness properties

Properties 1 to 7 run on every runtime, in `test/cache/time-utils/property/time-utils-property-tests.jest.mjs`. Property 8 runs only where native Temporal exists, in `time-utils-temporal-oracle-property-tests.jest.mjs`. None of them spawns a child process, so each uses at least 100 runs: 1,000 for Properties 1, 3, and 8, and 200 for the rest (Req 11.9). None passes `seed` (Req 11.10).

The shared arbitraries are all valid by construction, so nothing is filtered on the predicate a property asserts:

- `zone`: `fc.constantFrom(...Intl.supportedValuesOf("timeZone"))`
- `instant`: an integer second from 2000-01-01 to 2099-12-31
- `interval`: `fc.oneof(fc.constantFrom(...INTERVAL_TABLE), fc.integer({ min: 1, max: 2592000 }))`, the interval table plus anything up to 30 days

`O(z, t)` below is the `longOffset` oracle from `test/helpers/time-utils-oracles.mjs`, in minutes.

**Property 1 — Bounds and local alignment.** *For any* zone z, instant t, and interval I, B = `nextIntervalInSeconds(I, t, z)` is an integer with t ≤ B < t + I, and B + 60 × O(z, t) is a multiple of I. The property uses the oracle's offset at t rather than TimeUtils' own, which is what makes it check that the offset is sampled at t. **Validates: Req 5.3, 6.2, 6.3, 6.5**

**Property 2 — Boundaries are fixed points.** *For any* z, t, and I where O(z, B) = O(z, t), `nextIntervalInSeconds(I, B, z)` = B. An `fc.pre` on equal offsets excludes the rare B on the far side of a transition. It's a precondition, not the predicate being asserted. **Validates: Req 6.4**

**Property 3 — The offset agrees with the oracle.** *For any* z and t, `getOffsetInMinutes(t, z)` = O(z, t). **Validates: Req 5.1, 5.2**

**Property 4 — An omitted timestamp means now.** Let m be a mocked `Date.now()` value from 2000 to 2099, including milliseconds. *For any* z, I, and m:

- `getOffsetInMinutes(0, z)` equals `getOffsetInMinutes(Math.floor(m / 1000), z)`
- `nextIntervalInSeconds(I, 0, z)` equals `nextIntervalInSeconds(I, Math.ceil(m / 1000), z)`

**Validates: Req 5.1, 6.1**

**Property 5 — Conversions and formatting.** *For any* non-zero integer s whose milliseconds fit the `Date` range, and any non-zero integer ms in that range:

- `convertTimestampFromSecondsToMilli(s)` = s × 1000
- `convertTimestampFromMilliToSeconds(ms)` = ⌈ms / 1000⌉
- `generateInternetFormattedDate(s)` = `new Date(s * 1000).toUTCString()`
- `generateInternetFormattedDate(ms, true)` = `new Date(ms).toUTCString()`

**Validates: Req 7.1, 7.2, 7.4**

**Property 6 — Parsing.** *For any* integer second s from 1900 to 2100, `parseToSeconds()` returns s for both `new Date(s * 1000).toUTCString()` and its `toISOString()` form. *For any* string x where `Date.parse(x)` is `NaN`, `parseToSeconds(x)` = 0. The `fc.pre` on `Date.parse` is a precondition; the assertion is about `parseToSeconds`. **Validates: Req 7.5, 7.6**

**Property 7 — Resolution follows the rules.** *For any* option and env value, `resolveTimezone(option, envValue)` returns or throws what a model of Requirements 2 and 3 predicts. Each generated value carries its kind, so the model never consults `Intl`:

| Kind | Arbitrary | Used for |
|---|---|---|
| Not provided | `undefined`, `null`, `""`, and strings of spaces and tabs | Option. Env too, minus `null`, since env values are strings or `undefined` |
| Valid | A `zone` with 0 to 3 spaces or tabs on each side | Option, env |
| Invalid | `"Invalid/"` plus 1 to 12 characters from `[A-Za-z0-9_]`, padded the same way | Option, env |
| Non-string | Integers, doubles, booleans, `{}`, and `[]` | Option |

The invalid kind rests on a premise: no name `Intl` accepts starts with `Invalid/`. A guard test asserts it for every supported zone and for a sample of 1,000 generated invalid names. If the runtime changes, the guard fails loudly instead of silently weakening the property. **Validates: Req 2.1, 2.2, 2.4 to 2.7, 3.1 to 3.3**

**Property 8 — Temporal agrees, on Node.js 26 or later.** *For any* z, t, and I, `getOffsetInMinutes(t, z)` equals Temporal's offset in minutes, and Property 1 holds with Temporal's offset in place of O. **Validates: Req 5.2, 6.3, 11.5 (Q13)**

The golden fixture replay (Req 10.6) is an example-based test over the recorded rows, not a property.

## Testing strategy

Every test file is `.jest.mjs` and imports its Jest globals from `@jest/globals`. Nothing invokes `npm test`. Child processes run through `execFileSync` with an argument array and an explicit timeout (Req 11.9). `jest.config.mjs` sets `restoreMocks: true`, and files that spy also call `jest.restoreAllMocks()` in `afterEach`.

### Oracles and shared data: `test/helpers/time-utils-oracles.mjs`

```js
export const INTERVAL_TABLE;                            // the 20 intervals of Cache.testInterval(), in seconds
export function longOffsetMinutes(timeZone, epochMs);   // Intl timeZoneName: 'longOffset', parsed
export function nativeTemporal();                       // globalThis.Temporal on Node.js >= 26 with the standard API, else null
export function temporalOffsetMinutes(temporal, timeZone, epochMs);
```

- `longOffsetMinutes()` formats with `timeZoneName: 'longOffset'` and parses `GMT`, `GMT±HH:MM`, or `GMT±HH:MM:SS` with `/^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/`. Round 4 verified it against the wall-clock method on all three runtimes.
- `nativeTemporal()` checks two things: the Node.js major from `process.versions.node`, and `typeof globalThis.Temporal?.ZonedDateTime?.prototype?.getTimeZoneTransition === "function"`. The major-version check excludes the older `--harmony-temporal` implementation on Node.js 22 and 24 (Round 3).
- `temporalOffsetMinutes()` returns `Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone).offsetNanoseconds / 6e10`.

### Child runner and child script

`test/helpers/time-utils-child-runner.mjs` follows `test/helpers/aws-classes-child-runner.mjs`. `runTimeUtilsChild(scenario, args, { env, timeout })` runs `process.execPath` with `[childScript, scenario, JSON.stringify(args)]`, returns `{ status, stdout, stderr, result }`, and parses the last `RESULT:` line.

The child environment starts from `process.env`, removes `CACHE_DATA_TIME_ZONE_FOR_INTERVAL`, `CACHE_USE_IN_MEMORY`, and `CACHE_IN_MEMORY_ONLY`, and sets `AWS_REGION=us-east-1`. Then it applies the overrides, where `undefined` deletes a key. Results don't depend on the developer's shell.

`test/cache/time-utils/fixtures/time-utils-child.cjs` replaces `DebugAndLog.warn` and `DebugAndLog.error` with recorders before running a scenario. TimeUtils and `dao-cache.js` (through `tools`) share that one module, so the recorders see every call.

| Scenario | Steps | Reports |
|---|---|---|
| `time-utils-init` | For each entry of `args.calls`, call `TimeUtils.init(entry.options)`, or call it with no argument when `entry.noArgument` is set. Record any error | Per call: `threw`, `message`, and `causeName`. Then `getTimeZone()` and the recorded warnings |
| `cache-init` | For each entry of `args.calls`, build parameters from `entry.params`, adding a random 32-byte `secureDataKey` unless `entry.params.inMemoryOnly` is set. When `entry.nowAtInit` is set, `Date.now` returns that value for the duration of the `Cache.init()` call only, which pins the instant today's code samples its offset at. Call `Cache.init()` and record any error | Per call: `threw` and `message`. Then these `Cache.info()` fields: `timeZoneForInterval`, `offsetInMinutes`, `tzDataVersion`, `idHashAlgorithm`, `dynamoDbTable`, `inMemoryOnly`. Also the child's `process.versions.tz`, `Cache.nextIntervalInSeconds(args.interval, args.timestamp)` when those are given, and the recorded warnings and errors |

JSON can't carry `undefined`, so an omitted `timezone` key stands for it, and `noArgument` covers calling with no argument.

### Golden fixture

**Generator.** `.kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs`, run with plain `node`:

```bash
node .kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs [--dao-cache <path>] [--out <path>]
```

1. It requires `moment-timezone` and the `dao-cache.js` named by `--dao-cache`. The default, `src/lib/dao-cache.js`, is only valid before the refactor. It sets `AWS_REGION` to `us-east-1` if that's unset.
2. It gets `CacheData` from `TestHarness.getInternals()`, saves `CacheData.getOffsetInMinutes`, and restores it in a `finally` block.
3. For each zone, it builds these timestamps:
   - Ordinary instants: the 1st and 15th of every month from 2020 through 2025, at a time of day derived from the month, so hours, minutes, and seconds vary (144 instants).
   - Boundary instants: local midnight on the first day of each quarter (24).
   - For each transition in `zone.untils` within the range: one second before it, the transition itself, and one second after.
4. For each timestamp t, it stubs the offset to return `-1 * zone.utcOffset(t * 1000)`, with `-0` normalized to `0`. Then it records `CacheData.nextIntervalInSeconds(I, t) − t` for each of the 20 intervals.
5. It writes the JSON without a generation timestamp, so a re-run on the same inputs produces an identical file. Objects are indented. Each numeric array goes on one line, and `boundaryDeltas` gets one line per timestamp.

The header comment explains how to re-run it after the refactor:

1. Extract a pre-change tree with `git archive`.
2. Make `moment-timezone` available, either installed in that tree or temporarily with `npm install --no-save moment-timezone@0.6.5`.
3. Pass that tree's `dao-cache.js` with `--dao-cache`.

The generator spawns no processes. It isn't a `*.jest.mjs` file, CI doesn't reference it, and `.npmignore` excludes `.kiro`. ESLint does lint it (Req 10.8).

**Layout.** `test/cache/time-utils/fixtures/interval-fixture.json`:

```json
{
	"generator": ".kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs",
	"source": "pre-change CacheData.nextIntervalInSeconds, offset sampled at each timestamp (Q1)",
	"momentTimezoneVersion": "0.6.5",
	"tzdataVersion": "2026e",
	"intervals": [15, 30, 60, 300, 600, 900, 1800, 3600, 7200, 10800, 14400, 18000, 21600, 28800, 43200, 86400, 172800, 259200, 345600, 432000],
	"zones": {
		"America/Chicago": {
			"timestamps": [1577836800],
			"offsets": [-360],
			"boundaryDeltas": [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7200, 10800, 0, 21600, 21600, 21600, 21600, 194400, 194400, 280800]]
		}
	}
}
```

The row shown is real, computed with the pre-change code: 2020-01-01T00:00:00Z is 6:00 PM CST on December 31. That's already a boundary for every interval up to 3 hours and for 6 hours, so those deltas are 0; the next 4-hour boundary is 8:00 PM, two hours away. Storing B − t keeps every value at six digits or fewer. With about 200 timestamps per zone, the file comes to roughly 300 KB.

**Replay test.** `unit/time-utils-golden-fixture-tests.jest.mjs` builds, for each zone, an array of `getOffsetInMinutes(t, zone)` and an array of `nextIntervalInSeconds(I, t, zone) − t`, and compares each with `toEqual`. A mismatch reports the zone and the first differing index. The ten zones agree across the tzdata in Node.js 22, 24, and 26 over 2020 to 2025 (Req 10.7, verified in Round 2).

### Test files

All paths are under `test/cache/time-utils/`.

| File | Kind | What it checks |
|---|---|---|
| `unit/time-utils-unit-tests.jest.mjs` | In-process; never calls `init()` | See below (Req 1.2, 2, 3.1 to 3.3, 4.3, 4.5, 4.6, 5.1, 6.4, 7) |
| `unit/time-utils-golden-fixture-tests.jest.mjs` | In-process | Fixture replay (10.6) |
| `unit/time-utils-source-and-dependency-tests.jest.mjs` | In-process; reads files | See below (Req 1.3, 1.5, 8.4, 9.1 to 9.3) |
| `property/time-utils-property-tests.jest.mjs` | In-process | Properties 1 to 7, and the Property 7 premise guard (11.4) |
| `property/time-utils-temporal-oracle-property-tests.jest.mjs` | In-process | Property 8, inside `(nativeTemporal() ? describe : describe.skip)(...)`, so Jest reports it as skipped on Node.js 22 and 24 (11.5) |
| `integration/time-utils-lifecycle-tests.jest.mjs` | Child, `time-utils-init` scenario | See below (Req 2.1 to 2.3, 2.5, 3.1, 3.3, 3.4, 4.1, 4.2) |
| `integration/time-utils-cache-init-tests.jest.mjs` | Child, `cache-init` scenario | See below (Req 2.2, 3.5, 3.6, 5.3, 8.1, 8.3, 8.8) |
| `integration/time-utils-cache-api-tests.jest.mjs` | In-process; one `Cache.init()` with America/Chicago | See below (Req 5.4, 7.8, 8.6 to 8.8, 11.7, 11.8) |

`unit/time-utils-unit-tests.jest.mjs` checks:

- The class's own property names are exactly the public static methods in the table above, plus `length`, `name`, and `prototype`. That confirms the method list and the absence of a reset member (1.2, 4.6).
- Pre-init values (4.3).
- `resolveTimezone()` examples for each row of the decision table, with exact messages and `cause instanceof RangeError` (2, 3.1 to 3.3).
- Explicit-timezone offsets on fixed dates (4.5, 5.1): Chicago −300 and −360, Kolkata 330, Kathmandu 345, Lord_Howe 630 and 660, Chatham 765 and 825, Etc/UTC 0.
- Boundaries on fixed dates:
  - the Round 1 Kathmandu case
  - a 24 h Chicago boundary after DST ends, which now falls at midnight CST where today's code gave 11:00 PM
  - the documented straddle case: 4 h from 1:30 AM CDT on 2026-11-01 gives 3:00 AM CST
  - an exact boundary returning itself (6.4)
- The converters with no argument under a mocked `Date.now()`.
- The formatter with seconds, milliseconds, and 0.
- `parseToSeconds()` with valid strings, the epoch, an unparsable string, and a `Symbol` (7).

`unit/time-utils-source-and-dependency-tests.jest.mjs` checks:

- No `src/` file requires `moment` or `moment-timezone` (9.1).
- `package.json` declares no runtime dependencies, and `package-lock.json` has no `moment` entries (9.2, 9.3).
- `dao-cache.js` no longer contains `#timeZoneForInterval`, `#offsetInMinutes`, or `_setOffsetInMinutes`, and `TestHarness.getInternals().CacheData` has none of the seven removed methods (8.4).
- `src/index.js`, `src/lib/tools/index.js`, and `types/` don't mention TimeUtils (1.3).
- `TimeUtils.class.js` doesn't contain `Temporal` (1.5).

`integration/time-utils-lifecycle-tests.jest.mjs` checks:

- Resolution with the real env var (2.1 to 2.3, 2.5):
  - the option over the env var
  - the env var alone
  - a whitespace-only env var
  - a padded env value
  - a `""` option with an env var
  - no argument
  - `null` options
- An env-sourced invalid name gives the exact message and a `causeName` of `RangeError` (3.1, 3.3).
- A failed init followed by a valid one (3.4).
- Two valid inits: the first wins, with one warning of the exact text, and a later invalid init doesn't throw (4.1, 4.2).

`integration/time-utils-cache-init-tests.jest.mjs` checks:

- An invalid option gives the exact message, one error log containing it, and `idHashAlgorithm` still `null`. A corrected call then succeeds with its own table name and no "already initialized" warning (3.5, 3.6).
- In-memory-only mode with America/Chicago: `info()` reports the zone, and a 24 h boundary from 2026-10-21T15:00Z is 2026-10-22T05:00Z (8.1, 8.3).
- In-memory-only mode with an invalid zone throws.
- `timeZoneForInterval: undefined` with the env var unset gives `Etc/UTC` (2.2).
- `tzDataVersion` equals the child's `process.versions.tz` (8.8).
- The stale offset: with America/Chicago and `nowAtInit` on 2026-07-01 (CDT), a 24 h boundary from 2026-01-15T18:00Z (noon CST) is 2026-01-16T06:00Z, midnight CST. Today's code returns 05:00Z, 11:00 PM CST (5.3).

`integration/time-utils-cache-api-tests.jest.mjs` checks:

- The three wrappers return what TimeUtils returns, for a sample of arguments (8.6).
- `testInterval()`'s keys are exactly `start` and `sec_15` through `hrs_120`, all `Date`s, and each boundary B satisfies `start` ≤ B < `start` + I (8.7, 11.7).
- A new `Cache` with no stored data reports `isExpired()` and `needsRefresh()` as `true` (7.8, 11.8).
- With `Date.now()` mocked to 2026-01-15T18:00Z and then 2026-07-01T12:00Z, `info().offsetInMinutes` is −360 and then −300 (5.4).
- The `info()` field types (8.8).

Child-process `it` blocks set a 60-second timeout, and each child a 20-second timeout. Fixed expected values use only zones and dates outside the Round 2 drift list (Req 11.12).

### Changes to existing tests

**`test/cache/cache-validation-tests.jest.mjs`.** The `''` test is replaced by two tests. Each spawns `node --input-type=module -e <code>` through `execFileSync`, removes `CACHE_DATA_TIME_ZONE_FOR_INTERVAL` from the child's environment, and passes the module path in a `TZ_TEST_MODULE` env var, so nothing is interpolated into the child code. The child prints one JSON line.

```diff
-import { execSync } from 'child_process';
+import { execSync, execFileSync } from 'child_process';
+import { fileURLToPath, pathToFileURL } from 'node:url';
+import path from 'node:path';
 ...
-	it("Should throw error for invalid timeZoneForInterval parameter", () => {
-		// expected 'timeZoneForInterval must be a non-empty string'
-	});
+	it("Should default timeZoneForInterval to Etc/UTC when it is an empty string", () => {
+		// expect(result).toEqual({ timeZoneForInterval: "Etc/UTC" })
+	});
+
+	it("Should throw a readable error for an invalid timeZoneForInterval name", () => {
+		// expect(result).toEqual({ error: 'Invalid timezone "Invalid/Zone". Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".' })
+	});
```

The file's other five tests are untouched. The new tests avoid a bare `URL` and never rethrow without `cause`, and they use the imported `expect`, so the file's ESLint count drops from 14 to 11.

**`test/powertools/integration/backwards-compatibility-tests.jest.mjs`.**

```diff
-		it("should only have moment-timezone as a required dependency", () => {
+		it("should have no required dependencies", () => {
 			const deps = Object.keys(packageJson.dependencies || {});
-			// object-hash was removed in v1.4.0 (hashing now uses the built-in DataHasher)
-			const allowedDeps = ["moment-timezone"];
-			for (const dep of deps) {
-				expect(allowedDeps).toContain(dep);
-			}
+			// v1.4.0 removed object-hash (built-in DataHasher) and moment-timezone (built-in TimeUtils)
+			expect(deps).toEqual([]);
 		});
```

**`test/types/consumer-cache-info.ts` (new).** It imports the package the way `consumer-cache.ts` does, then assigns `info.tzDataVersion` to a `string | null` variable and `info.saltSource` to the three-value union (Req 11.14). `test/types/tsconfig.json` already includes `*.ts`, so the config doesn't change.

### Temporal oracle (Q13)

Property 8 is the only consumer of Temporal. `nativeTemporal()` returns `null` on Node.js 22 and 24, so the `describe.skip` branch runs there and Jest lists the tests as skipped. On Node.js 26 the property runs in the CI leg marked `continue-on-error`, which makes it a cross-check rather than a release gate. Properties 1 and 3 give the same coverage on every leg with the `longOffset` oracle. Test code only touches `globalThis.Temporal`, so nothing throws a `ReferenceError` where Temporal doesn't exist.

### Lint

| File | Errors before | Errors after |
|---|---|---|
| `src/lib/dao-cache.js` | 21 | 20 or fewer: the `no-useless-assignment` in `convertTimestampFromSecondsToMilli` leaves with the method |
| `test/cache/cache-validation-tests.jest.mjs` | 14 | 11 |
| `test/powertools/integration/backwards-compatibility-tests.jest.mjs` | 1 | 1 |
| Every new `.js`, `.cjs`, and `.mjs` file, including the generator | n/a | 0 |

`.ts` files aren't linted, because no ESLint configuration matches them. `npm run lint:ci` fails on the repository baseline both before and after the change, so Req 11.13 is checked per file with `npx eslint <files>`.

### Full-suite gate

After implementation, `npm test` must pass with only the two edits to existing tests described above. Two risks are anticipated:

- Tests that initialize `Cache` with `timeZoneForInterval: "UTC"` or `"America/Chicago"` now go through `TimeUtils.init()`. Both names are valid, and none of those tests asserts an offset value.
- A test that calls `Cache.init()` twice in one file now sees one extra warning, from TimeUtils. A search found no test that both spies on `DebugAndLog.warn` or `console.warn` and calls `Cache.init()`.

Any other failure is a design problem to bring back, not a test to edit.

## Documentation design

### JSDoc

- **TimeUtils:**
  - A class-level `@private` description with an `@example`: init, then an interval calculation.
  - Every public static method documented per Req 1.4 and 13.1, including the offset sign, "0 or omitted means now", and the exact-boundary rule.
  - The DST behavior: the offset in effect at the timestamp being rounded, so a boundary that straddles a transition is off by the DST delta.
  - Private members carry `@private` JSDoc.
- **`Cache.init()`:** the `timeZoneForInterval` `@param` documents resolution, the values treated as not provided, and the default, and two `@throws` lines cover a non-string and an invalid name (Req 13.3). `CacheData.init()` loses its `timeZoneForInterval` `@param` and `@throws`.
- **`Cache` wrappers:** `generateInternetFormattedDate`, `nextIntervalInSeconds`, and `parseToSeconds` describe their behavior and no longer call themselves wrappers around `CacheData` (Req 13.2).
  - `nextIntervalInSeconds` replaces "In some cases such as every 2 hours, the interval is calculated from midnight" with the actual rule (Req 13.4), and its two bare `@param` lines gain descriptions.
  - The `parseToSeconds` examples return `1627475051`, and the description says unparsable input returns 0.
  - `testInterval` and `info` mention `tzDataVersion`.
- Parameter names in every edited block match the signatures, which the `test/documentation/` tests check for `dao-cache.js`.

### `types/lib/dao-cache.d.ts`

The two fields shown under [Types](#types), plus doc comments for `timeZoneForInterval?`, `nextIntervalInSeconds`, and `parseToSeconds` that match the JSDoc.

### `docs/features/cache/README.md`

**Configuration table, `timeZoneForInterval` row (Req 13.6):**

- Accepted values: IANA names, case-insensitively, and fixed offsets such as `+05:30`.
- `undefined`, `null`, empty, and whitespace-only values fall through to `CACHE_DATA_TIME_ZONE_FOR_INTERVAL`, then `'Etc/UTC'`.
- An invalid name makes `Cache.init()` throw.
- A link to the new subsection.

**New `### Interval-Based Expiration` subsection,** after `### Expiration Handling`, in the file's Title Case heading style (Req 13.5):

- How boundaries are computed: the timestamp in local time, rounded up to the next multiple of the interval.
- Alignment: intervals that divide 24 hours (2, 3, 4, 6, 8, 12, and 24 hours) fall on local midnight. Others are aligned to the Unix epoch in local time: a 5-hour boundary moves by an hour each day, multi-day intervals count from 1970-01-01, and 168 hours falls on Thursdays.
- :30 and :45 offsets: boundaries stay on the local clock, so hourly boundaries fall at :30 past the UTC hour in India and Newfoundland, and at :15 past it in Nepal and Chatham, where half-hourly boundaries also fall at :15 and :45. In general, an interval's boundaries line up with the same interval in UTC only when the interval divides the offset evenly.
- A timestamp exactly on a boundary expires immediately.
- DST: each calculation uses the offset in effect at the moment it runs, so boundaries follow the clock change. A boundary calculated shortly before a change but falling after it is off by the DST delta. For a 24-hour interval, that's one calculated between midnight and 2 AM on the day of the change.
- Where the rules come from: the Node.js runtime's tz data, whose version `Cache.info().tzDataVersion` reports. Versions differ between runtime releases.
- A short example: a 4-hour profile with `timeZoneForInterval: 'America/Chicago'`, using `Cache.testInterval()` to inspect boundaries.

### `docs/technical/interval-expiration.md`

This follows `docs/technical/cache-key-hashing.md`:

- **Overview:** where TimeUtils sits, and why it replaced `moment-timezone`.
- **Offset lookup:**
  - the formatter options and the wall-clock method
  - integer seconds and the formatter cache
  - `NaN` handling, and why `setUTCFullYear()`
- **Interval arithmetic:** the operations, why they keep today's `Date` round-trips, and why the converters were taken out of the middle.
- **DST behavior:** the per-timestamp offset (Q1), the straddle gap with a worked Chicago example, and what exact alignment would need.
- **tz data:** the source on each runtime, the Round 2 table, and `tzDataVersion`.
- **The golden fixture:** what it records, how it was generated, and how to regenerate it.
- **Temporal:**
  - the Round 3 findings
  - its role as a test oracle, and the detection rule
  - moving TimeUtils onto it once the floor reaches Node.js 26
- **Related documentation.**

### CHANGELOG

These go under `## v1.4.0 (unreleased)`, appended to the existing `### Added`, `### Changed`, `### Fixed`, and `### Removed` sections without editing existing entries. Each entry ends with `[Spec: 1-4-0-fully-implement-timezone](.kiro/specs/1-4-0-fully-implement-timezone/)`, shortened to `[Spec]` below.

```markdown
### Added
- **`Cache.info()` reports `tzDataVersion`** — The version of the IANA time zone data in the Node.js runtime (`process.versions.tz`), or `null` if the runtime doesn't report one. Interval boundaries follow these rules now that `moment-timezone` is gone. The field is additive and declared in the TypeScript types. [Spec]

### Changed
- **Interval expiration uses the Node.js runtime's time zone support** — UTC offsets now come from the built-in `Intl.DateTimeFormat`, through an internal `TimeUtils` class (`src/lib/utils/TimeUtils.class.js`), instead of `moment-timezone`. Public `Cache` methods keep their names and signatures. [Spec]
  - DST rules come from the runtime's tz data instead of the copy bundled with `moment-timezone`, so they update with Node.js. When this was written, Node.js 22.23.2 and 24.15.0 (tzdata 2026a) differed from `moment-timezone` 0.6.5 (2026e) for 11 zones from September or November 2026, and Node.js 26.10.0 (2026c) for 4.
  - `timeZoneForInterval` values that are `undefined`, `null`, empty, or whitespace-only now fall through to `CACHE_DATA_TIME_ZONE_FOR_INTERVAL`, then `Etc/UTC`, instead of throwing. `timeZoneForInterval: process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL` now works when the variable is unset. Names are trimmed, and fixed offsets such as `+05:30` are accepted.
  - An invalid timezone makes `Cache.init()` throw `Invalid timezone "<name>". Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".` instead of a `TypeError`, adding `from CACHE_DATA_TIME_ZONE_FOR_INTERVAL` when the variable supplied the name. A non-string value throws `Invalid timezone of type <type>. ...` instead of `timeZoneForInterval must be a non-empty string`.
  - `Cache.info().offsetInMinutes` is the offset when `info()` is called rather than at init. Before `Cache.init()`, the timezone reports as `Etc/UTC` rather than `UTC`.

### Fixed
- **Interval boundaries after a DST change** — The UTC offset was sampled once at `Cache.init()`, so an execution environment that stayed up across a DST change put boundaries an hour off: a 24-hour interval expired at 11:00 PM instead of midnight. Each calculation now uses the offset at the timestamp being rounded. A boundary calculated shortly before a change but falling after it is still off by the DST delta. [Spec]
- **`timeZoneForInterval` in in-memory-only mode** — In-memory-only mode ignored the setting and aligned intervals to UTC. It now honors it, so an invalid timezone also fails `Cache.init()` in that mode. [Spec]
- **Retrying `Cache.init()` after an invalid timezone** — The failed call left the cache half-initialized, so a corrected retry was ignored and the invalid name stayed in effect. The timezone is now validated before anything else is set. [Spec]
- **Time helpers with no timestamp** — `Cache.generateInternetFormattedDate(0)` threw `TypeError: Date.now(...).getTime is not a function`, as did `isExpired()` and `needsRefresh()` on a `Cache` instance with no stored data. `generateInternetFormattedDate(0)` now formats the current time, and the other two return `true`. `Cache.parseToSeconds()` returns 0 for unparsable input, as documented, instead of `NaN`. [Spec]
- **TypeScript: `Cache.info()` declares `saltSource`** — The field was returned at runtime but missing from the type. [Spec]
- **Documentation: timezone and interval expiration** — Corrected the JSDoc for the offset sign, the `parseToSeconds` examples, and which intervals align to local midnight. Added an interval-expiration section to the cache feature README, and `docs/technical/interval-expiration.md`. [Spec]

### Removed
- **`moment-timezone` dependency** — `moment-timezone`, and `moment` with it, is no longer installed, and the package has no runtime dependencies. Measured locally, loading them took about 12 ms per cold process and 8.4 MB in `node_modules`. [Spec]
```

Test-only changes get no entry, per the changelog convention.

## Dependency removal

The order is fixed by Req 9.5 and 10:

1. Generate and commit the golden fixture against the pre-change code.
2. Implement TimeUtils and the `dao-cache.js` changes, and run the replay test.
3. Run `npm uninstall moment-timezone`. It updates `package.json` and `package-lock.json` and drops both packages. Confirm with `npm ls moment moment-timezone`, which should list nothing, and with the dependency tests.
4. Run the full suite.

The removal is a dependency change. Reinstalling the package reverses it.

## Backwards compatibility analysis

**Unchanged:**

- every export
- every public `Cache` method's name, signature, and return shape
- the `timeZoneForInterval` option, the env var, their names, and their precedence
- every existing `Cache.info()` field and its type
- the interval arithmetic and the internet-date format
- `CacheableDataAccess`

**Intentionally changed:** the 14 rows of [Consumer-visible behavior changes](requirements.md#consumer-visible-behavior-changes) in requirements.md, plus:

- `offsetInMinutes` for zero-offset zones is `0` instead of `-0`. Only `Object.is`, and therefore Jest's `toEqual`, distinguishes them.
- A repeated `Cache.init()` call logs one more warning, from TimeUtils.
- An interval of 0 gives `NaN` instead of throwing a `TypeError`.
- The private `CacheData` class loses seven methods. Nothing outside `dao-cache.js` called them, and no test did.

## Known limitations

1. A boundary calculated shortly before a DST transition but falling after it is off by the DST delta (Q1). Exact alignment is a follow-up.
2. Rule freshness depends on the runtime's tz data, which can lag a change in law by weeks or more. `tzDataVersion` makes that visible.
3. Offsets for instants before year 1 CE aren't meaningful, because the formatter doesn't report eras. That's far outside any cache timestamp.
4. The formatter cache grows by one entry per distinct name. Production holds one; only tests pass many.
5. Regenerating the golden fixture needs `moment-timezone` installed temporarily and a pre-change copy of `dao-cache.js`.

## Follow-ups (outside this spec)

- Move TimeUtils onto Temporal as a single code path once the floor reaches Node.js 26. Node.js 24 reaches end of life on 2028-04-30 (Q13).
- Exact wall-clock alignment across DST transitions (Q1 option C, or Q13 option D).
- The stuck-retry problem for the other `CacheData.init()` settings that are validated after `#secureDataKey` is assigned (Q4).
- The repository's ESLint baseline, which keeps `npm run lint:ci` failing (Round 4).
