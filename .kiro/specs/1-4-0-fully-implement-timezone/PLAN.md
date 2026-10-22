# Fully Implement Timezone

Fully implement a method that replaces the `moment-timezone` npm package.

The classes in dao-cache rely on time calculations which include a function in `moment-timezone` to determine the timezone offset used for interval-based cache expiration (to determine midnight, even hours, every 4 hours, etc). The offset applies to every interval. In whole-hour zones it only changes intervals longer than 60 minutes; in :30/:45 zones it also moves hourly and some sub-hourly boundaries (Round 1).

Since this is the only use of `moment-timezone` it would make sense to consolidate and make it internal to cache-data.

Cache Data currently uses few outside packages in a very limited capacity, it would make sense to move this functionality internally as it reduces the reliance on externally managed packages and will provide a leaner code-base since not all functionality from these packages are utilized. This would replace one of those packages `moment-timezone`.

Similar to the implementation of `src/lib/utils/InMemoryCache.js` (same folder, internal, configured through an options object), we will implement a new internal static class `TimeUtils` in `src/lib/utils/TimeUtils.class.js` (Q8). It is not exported from the package; consumers keep using the `Cache.*` statics.

The following move to `TimeUtils` and are removed from `CacheData`, and every call site in dao-cache references the new implementation (Q6):

- CacheData.generateInternetFormattedDate
- CacheData.convertTimestampFromSecondsToMilli
- CacheData.convertTimestampFromMilliToSeconds
- CacheData.nextIntervalInSeconds
- CacheData.getOffsetInMinutes
- CacheData.getTimeZoneForInterval, as `TimeUtils.getTimeZone()` (its state moves)
- The logic of `Cache.parseToSeconds`, which stays public and delegates

`CacheData._setOffsetInMinutes` is dropped rather than moved. The offset is looked up for the timestamp being rounded instead of once at init (Q1).

`TimeUtils` is static and requires an init. `TimeUtils.init(options = {})` takes one optional option, `timezone`. If it is blank it defaults to the environment variable, then `Etc/UTC` (Q3). The first successful init wins; later calls log a warning and are ignored. Before init, interval math uses `Etc/UTC` (Q5).

The current logic in CacheData.init for CACHE_DATA_TIME_ZONE_FOR_INTERVAL moves to `TimeUtils` for setting the timezone. `Cache.init()` calls it before the in-memory-only guard, so both cache modes honor the timezone (Q2).

```js
// Cache.init(): after the parameters-object check, before any Cache state is assigned

	// ...
	try {
		TimeUtils.init({ timezone: parameters.timeZoneForInterval });
	} catch (error) {
		tools.DebugAndLog.error(`Cache.init() failed: ${error.message}`, error?.stack);
		throw error;
	}
	// ...
```

CacheData no longer validates or stores the timezone; `CacheData.info()` reads it from `TimeUtils`. `Cache.init()` receives and handles an invalid timezone error thrown by `TimeUtils` by logging and re-throwing it, so init fails fast (Q4). `Intl` decides validity, as we will not validate all of the timezones ourselves. A failed `TimeUtils.init()` doesn't count as the first one, so a corrected retry works.

```js
// TimeUtils.init( options ):

	// ...
	// Resolve options.timezone, then process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL, then "Etc/UTC" (Q3)
	//   undefined, null, "", and whitespace-only mean "not provided" at both levels
	//   a provided value that isn't a string throws
	// Trim, then validate by constructing an Intl.DateTimeFormat; if Intl throws,
	//   throw our own Error (messages per Q4) with the RangeError as `cause`
	// Store the trimmed name as given, not Intl's canonical form
```

Once the above methods are public static methods on `TimeUtils`, tests call them directly and reuse the 20-interval table from `Cache.testInterval()`, which keeps its signature and delegates (Q9). A golden fixture recorded from the moment-based code before removal proves the results match (Q10).

Tests should still pass. Two existing tests change on purpose: the `''` validation test now expects the default (Q3), and the dependency allow-list test expects no runtime dependencies.

`moment-timezone` should be removed from the dependencies. After removal, DST rules come from the Node.js runtime's tz data, and `Cache.info()` reports its version as `tzDataVersion` (Q11).

## Locked design (from Decision Log)

All decisions (Q1 to Q13) are locked:

- **DST (Q1):** the offset is sampled at the timestamp being rounded, on every call. `getOffsetInMinutes(timestampInSeconds = 0)` returns the offset at that timestamp (now by default), and `Cache.info().offsetInMinutes` is the offset when `info()` runs. A boundary that straddles a transition keeps today's error; exact wall-clock alignment is out of scope.
- **Init location (Q2):** `Cache.init()` calls `TimeUtils.init()` after the parameters-object check, before any state is assigned and before the in-memory-only guard. `CacheData.init()` no longer touches the timezone.
- **Input rules (Q3):** not-provided values (`undefined`, `null`, `""`, whitespace-only) fall through at both levels; a non-string option throws; the value is trimmed, validated by `Intl` (fixed offsets such as `+05:30` included), and stored as given.
- **Invalid timezone (Q4):** TimeUtils throws `Invalid timezone "<name>". Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".`, adding `from CACHE_DATA_TIME_ZONE_FOR_INTERVAL` after the name when the env var supplied it, with the `RangeError` as `cause`. `Cache.init()` logs and re-throws.
- **Lifecycle (Q5):** first successful init wins; a failed init doesn't count. Converters, the formatter, and `parseToSeconds` never need init. Offset and interval math also accept an explicit timezone, so tests can cover many zones in one process. No reset member.
- **Methods (Q6):** as listed above; `Cache.generateInternetFormattedDate`, `Cache.nextIntervalInSeconds`, and `Cache.parseToSeconds` delegate.
- **Defects (Q7):** the converters treat 0 or no argument as now instead of throwing; the `getOffsetInMinutes` JSDoc sign is fixed; `parseToSeconds` returns 0 for unparsable input. A timestamp exactly on a boundary still returns itself, now documented.
- **Exposure (Q8):** internal, `@private`, no type declarations.
- **`Cache.testInterval()` (Q9):** unchanged signature and shape; tests reuse its 20 intervals with fixed timestamps, plus invariant checks on live output.
- **Equivalence (Q10):** a generator in this spec's `fixture/` folder records boundaries from the pre-change `CacheData.nextIntervalInSeconds`, with its offset stubbed to `moment-timezone`'s value at each timestamp, into a JSON fixture under `test/cache/time-utils/fixtures/`. A test asserts TimeUtils reproduces it exactly. The dependency is removed afterwards.
- **tz data (Q11):** accepted and documented; `Cache.info()` gains `tzDataVersion` (`process.versions.tz`, or `null`). Checked on Node.js 22, 24, and 26 (Round 2).
- **Docs (Q12):** JSDoc, an "Interval-based expiration" subsection in the cache feature README, `docs/technical/interval-expiration.md`, and CHANGELOG.
- **Types (Round 3):** the `Cache.info()` return type gains `tzDataVersion` and `saltSource`. The runtime already returns `saltSource`.
- **Temporal (Q13):** production uses `Intl` only. On Node.js 26 or later with the standard API, property tests also check TimeUtils against Temporal; elsewhere those tests are skipped. Moving TimeUtils onto Temporal is a follow-up for when the floor reaches Node.js 26.

Requirements are in [requirements.md](requirements.md).

---

# Decision Log & Clarifying Questions

> This section is an audit trail of design decisions. Each question has options, a recommendation, and a status. Answer inline under **Answer:** (a letter is enough; add notes where you want changes). Once every question is 🟢 LOCKED, the plan body above is revised to match and `requirements.md` is written.

**Legend:** 🟡 OPEN (awaiting answer) · 🟢 LOCKED (decided) · 🔵 REVISED (plan body updated to match)

## Round 1 — Grounding verified against source

I read `src/lib/dao-cache.js`, `src/lib/utils/`, `types/lib/dao-cache.d.ts`, and every test that touches these methods, then ran the current code in isolated Node.js processes. Local environment: Node.js v24.15.0, ICU 78.2, tzdata 2026a. Installed `moment-timezone`: 0.6.5, tzdata 2026e.

### Where the code lives today

- `moment-timezone` is required once (`dao-cache.js` line 45) and called once, in `CacheData._setOffsetInMinutes()`: `-1 * moment.tz.zone(tz).utcOffset(Date.now())`. The plan's "only use" claim holds.
- `_setOffsetInMinutes()` runs once, inside `CacheData.init()`. `nextIntervalInSeconds()` applies that single cached offset to every timestamp it receives.
- `CacheData.getTimeZoneForInterval()` isn't in the move list, but the state it reads moves.
- Call sites to re-point: `CacheData.write`, `CacheData.info`, the `Cache` constructor, `Cache.testInterval`, `Cache.generateInternetFormattedDate`, `Cache.parseToSeconds`, `Cache.nextIntervalInSeconds`, `calculateSecondsLeftUntilExpires()`, and `isExpired()`.
- No test calls the six methods on `CacheData`, and no test asserts an interval result for any timezone.
- How I read the plan: `InMemoryCache` is instance-based (`new InMemoryCache(options)`), so "similar to InMemoryCache" means the same folder, internal status, and an options object. `TimeUtils` itself stays static, with `init(options = {})` and `options.timezone` as in the plan's snippet.

### Verified behavior (ran the code)

| Check | Result today |
|-------|--------------|
| `Intl` accepts every zone name `moment-timezone` knows | Yes, all 597 |
| `moment` vs `Intl` offsets, all 597 zones, 2020–2027 every 3 h (~14M checks) | Identical, except 11 zones where the two tz databases differ (Q11) |
| Invalid zone at `Cache.init()` | `TypeError: Cannot read properties of null (reading 'utcOffset')` |
| Corrected retry of `Cache.init()` after that throw | Ignored ("already initialized"). The cache keeps `"Invalid/Zone"` with offset 0 |
| `timeZoneForInterval: process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL` with the variable unset (the pattern in the `Cache.init` JSDoc example) | Throws `timeZoneForInterval must be a non-empty string` |
| `inMemoryOnly: true` with `timeZoneForInterval: "America/Chicago"` | Ignored. `Cache.info()` reports `"UTC"` / `0`, and 24 h boundaries land on UTC midnight |
| Init during CDT, intervals for timestamps after DST ends (2026-11-01) | 24 h lands at 11:00 PM CST; 4 h lands at 3:00 PM instead of 4:00 PM |
| Init during CDT, 4 h interval from 1:30 AM CDT on 2026-11-01 | Lands at 3:00 AM CST instead of 4:00 AM |
| Both converters called with no argument (documented as "use current time") | `TypeError: Date.now(...).getTime is not a function` |
| Where that TypeError surfaces in public API | `Cache.generateInternetFormattedDate(0)`, and `isExpired()` / `needsRefresh()` on a `Cache` instance with no stored data |
| `Cache.parseToSeconds("not a date")` | `NaN` (JSDoc says 0). Both JSDoc example outputs are also wrong: `1627476251` documented, `1627475051` actual |
| `getOffsetInMinutes()` for America/Chicago | `-300` in CDT. JSDoc says positive means west of UTC; it's the reverse |
| 5 h interval on three consecutive days (UTC) | 02:00, 03:00, 04:00. Epoch-aligned, not midnight-aligned |
| 168 h interval | Thursday midnight (the epoch was a Thursday) |
| Timestamp exactly on a boundary | Returns itself, so the entry expires immediately |
| 30 min interval in Asia/Kathmandu (+5:45) from 10:10Z | 10:15Z (local :00/:30) |
| Cost of `require('moment-timezone')`, local | ~12 ms per fresh process. `moment` + `moment-timezone` take 8.4 MB in `node_modules` |
| Cost of a native offset lookup, local | ~34 µs to build an `Intl.DateTimeFormat` once, then ~2.3 µs per lookup |

**Correction to the plan body:** the offset applies to every interval, not only those over 60 minutes. In whole-hour zones it only changes intervals longer than an hour. In :30/:45 zones (India, Nepal, Newfoundland, Chatham) it also moves hourly and some sub-hourly boundaries, as the Kathmandu row shows. That is correct local-time behavior, and it is preserved.

**`Intl` notes:** it is case-insensitive, like `moment`, and neither one trims whitespace. It accepts fixed offsets such as `+05:30`, which `moment` rejects. `resolvedOptions().timeZone` canonicalizes names: `Etc/UTC` → `UTC`, `Asia/Kolkata` → `Asia/Calcutta`, `US/Central` → `America/Chicago`, `EST` → `America/Panama`. An invalid name throws `RangeError: Invalid time zone specified: <name>`.

### Scope that doesn't depend on the answers

1. A new internal static class in `src/lib/utils/` (file name per Q8) owns the timezone state and the moved methods. One `Intl.DateTimeFormat`, built in `init()`, serves as both the validity check and the offset lookup.
2. Remove `require('moment-timezone')`, and remove the dependency from `package.json` and `package-lock.json`.
3. The public `Cache.*` statics keep their names, signatures, and return shapes, and delegate to the new class. `Cache.info()` keeps `timeZoneForInterval` and `offsetInMinutes`.
4. The interval math (round up to a multiple of the interval in local time, aligned to the epoch) is preserved, except for whatever Q1 decides about DST.
5. CHANGELOG under v1.4.0: `moment-timezone` goes under Removed, plus Changed/Fixed entries per the answers. No option below removes or renames public API, so this fits a minor release.
6. `test/powertools/integration/backwards-compatibility-tests.jest.mjs` ("should only have moment-timezone as a required dependency") changes to assert that there are no runtime dependencies.

### Test-impact inventory

- `test/cache/cache-validation-tests.jest.mjs`: "Should throw error for invalid timeZoneForInterval parameter" expects `''` to throw. It changes under Q3.
- `test/powertools/integration/backwards-compatibility-tests.jest.mjs`: the dependency allow-list (scope item 6).
- `test/cache/cache-tests.jest.mjs` and five other cache tests pass `"UTC"` or `"America/Chicago"`. The env-var tests in `cache-validation-tests.jest.mjs` expect `info().timeZoneForInterval` to echo `America/New_York` and `Europe/London`. All of these should pass unchanged.
- `test/documentation/property/feature-documentation-configuration-coverage-tests.jest.mjs` checks `@param` names in `dao-cache.js` against `docs/features/cache/README.md`. Any new or renamed `@param` there must also appear in the README.
- Interval correctness has no tests today, so most of the coverage is new.

---

## Q1 — DST: which instant's offset do interval calculations use?

Today the offset is sampled once at init and reused for the life of the process. An environment that stays up across a DST change keeps the old offset (see the rows above). Separately, even with a fresh offset, a boundary on the far side of a transition is off by the DST delta.

- **Option A — Preserve exactly.** Sample once in `init()` through the moved `_setOffsetInMinutes`. Results are bit-identical to today, including both errors.
- **Option B — Sample at the timestamp being rounded.** `nextIntervalInSeconds(interval, ts)` uses the offset in effect at `ts`. Results differ from today only when a DST change falls between init and `ts`, and in that case B is the correct one (unless a second change falls before the boundary, which takes months of uptime). The remaining error is a boundary that straddles a transition, such as a 24 h boundary computed between midnight and 2 AM on a transition day. `_setOffsetInMinutes` is dropped rather than moved, and `getOffsetInMinutes()` reports the offset now (or at an optional timestamp).
- **Option C — Exact wall-clock alignment.** B, plus detecting a transition between `ts` and the candidate boundary and recomputing with the new offset. This needs explicit rules for local times that don't exist (the spring-forward gap), and it must not skip the repeated hour at fall-back. A naive "re-check the offset at the result" turns hourly intervals into a 2-hour gap that night.

**Recommendation: Option B.** It removes the error that grows with uptime, at ~2.3 µs on a path that runs once or twice per cache update. C only changes boundaries computed within one interval before a transition, which for intervals of a day or less is a few hours a year. It would also be the most complex code in the change, so it fits better as a follow-up if you want strict wall-clock alignment.

**Answer:** B

**Decision:** The offset is sampled at the timestamp being rounded, on every call. `_setOffsetInMinutes` is dropped. `getOffsetInMinutes(timestampInSeconds = 0)` returns the offset at that timestamp (now by default), and `Cache.info().offsetInMinutes` is the offset when `info()` runs. A boundary that straddles a transition keeps today's error; option C is out of scope.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q2 — Where is `TimeUtils.init()` called?

The plan calls it from `CacheData.init()`. In in-memory-only mode, `Cache.init()` returns before it ever calls `CacheData.init()`. That's why the mode ignores `timeZoneForInterval` today (see the row above), even though `update()` still runs interval math there for `expirationIsOnInterval` profiles.

- **Option A — `CacheData.init()`, as written.** In-memory-only mode keeps ignoring the timezone and keeps reporting `"UTC"`.
- **Option B — `Cache.init()`, before the in-memory-only guard.** Both modes honor the timezone. `CacheData.init()` stops touching the timezone, except that `info()` reads it from TimeUtils, and the error handling in Q4 moves to `Cache.init()`. For in-memory-only users who set a timezone, boundaries move to local time, and an invalid zone now fails init in that mode too.

**Recommendation: Option B.** One call site covers both modes, and the documented setting starts working in in-memory-only mode. This departs from the plan's wording that CacheData handles the error, so it needs your OK. CHANGELOG: Fixed.

**Answer:** B

**Decision:** `Cache.init()` calls `TimeUtils.init({ timezone: parameters.timeZoneForInterval })` right after the parameters-object check, before any state is assigned and before the in-memory-only guard. `CacheData.init()` no longer reads, validates, or stores the timezone, and `CacheData.info()` reads it from TimeUtils. CHANGELOG: Fixed.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q3 — Timezone input rules

The plan's order is option (string), then env var (string), then `"Etc/UTC"` for null, empty, or undefined. Today, an empty or non-string option throws `timeZoneForInterval must be a non-empty string` (and that's tested), and a whitespace-only env var throws. So does `undefined` from an unset env var.

Proposed rules:

1. `undefined`, `null`, `""`, and whitespace-only all mean "not provided" at both levels: option, then env var, then `"Etc/UTC"`.
2. A provided value that isn't a string (number, boolean, object) throws. That points to a programming error, not a missing setting.
3. Trim before validating.
4. Validate by constructing an `Intl.DateTimeFormat` with the zone. Anything `Intl` accepts is valid, including fixed offsets such as `+05:30`, which fail today.
5. Store and report the trimmed name as given, not `Intl`'s canonical form. `Cache.info()` keeps showing `Etc/UTC` rather than `UTC`, and `Asia/Kolkata` rather than `Asia/Calcutta`.

- **Option A — All five rules.** The existing `''` test is rewritten to expect the default, and new tests cover an invalid name and a non-string value.
- **Option B — The plan read literally.** Rules 1, 3, 4, and 5, with non-string values silently falling through to the env var or the default.
- **Option C — Keep today's strictness.** Only `undefined`/`null` fall through; `''` and whitespace still throw today's messages. The existing test is untouched, but the documented `process.env` pattern keeps throwing when the variable is unset.

**Recommendation: Option A.** It follows the plan's intent and fixes the throw in the documented pattern, while still catching type mistakes. Inputs that used to throw now succeed, which is additive under semver.

**Answer:** A

**Decision:** All five rules. The `''` test in `cache-validation-tests.jest.mjs` is replaced by tests for the default and for an invalid name, and new tests cover a non-string value. Non-string message: see Round 2.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q4 — Invalid timezone: what does the init caller do with TimeUtils' error?

When `Intl` rejects the zone, TimeUtils throws its own `Error` and keeps the original `RangeError` as `cause`. Proposed messages:

- From the option: `Invalid timezone "Invalid/Zone". Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".`
- From the env var: `Invalid timezone "Invalid/Zone" from CACHE_DATA_TIME_ZONE_FOR_INTERVAL. Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".`

Options:

- **Option A — Log and re-throw.** The caller logs with `DebugAndLog.error` and re-throws, so `Cache.init()` fails fast as it does today, but with a readable message. `TimeUtils.init()` runs before any cache state is assigned, and a failed `init()` doesn't count as the first one, so a corrected retry works. Today the retry is ignored and the bad zone sticks.
- **Option B — Log a warning and fall back to `Etc/UTC`.** Init succeeds, and intervals quietly align to UTC.
- **Option C — Don't catch.** The same failure as A, without the cache-side log line.

**Recommendation: Option A.** An invalid zone already fails init today, and every other invalid setting throws. A failure at cold start is easier to diagnose than boundaries that are hours off. Other settings that are validated after `#secureDataKey` is assigned have the same stuck-retry problem. That's out of scope unless you want it included.

**Answer:** A

**Decision:** TimeUtils throws the two proposed messages, with the `RangeError` as `cause`. `Cache.init()` logs with `DebugAndLog.error` and re-throws the same error. A failed `TimeUtils.init()` leaves TimeUtils uninitialized, so a corrected retry works. The stuck-retry problem for other settings stays out of scope.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q5 — TimeUtils lifecycle: repeat init, use before init, and testing many zones

- **Option A — Mirror CacheData.** The first `init()` wins, and later calls log a warning and are ignored. Before `init()`, the interval math uses `Etc/UTC` (offset 0), the same math as today before init. The formatter and the converters never need init. Internally, the offset and interval math also accept an explicit timezone, so tests can cover many zones in one process without re-init or subprocesses.
- **Option B — The last `init()` wins.** Simplest for tests, but a second `Cache.init()` could change the timezone while CacheData ignores every other setting.
- **Option C — Lazy self-init from the env var on first use.** An invalid env var would then throw from the first interval calculation instead of from init.

**Recommendation: Option A.** It matches the existing static-class pattern and keeps configuration errors at init. One visible change: before init, `Cache.info()` reports `Etc/UTC` instead of `UTC`. Today the field initializer says `"UTC"` while `init()` defaults to `"Etc/UTC"`, and this settles on one default.

**Answer:** A

**Decision:** The first successful init wins. Later calls log a warning and are ignored without reading their options. Before init, the timezone is `Etc/UTC` with offset 0. The converters, the formatter, and `parseToSeconds` never need init. Offset and interval math also accept an explicit timezone for tests. No reset member.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q6 — Which methods move, and what stays on CacheData?

- **Option A — The six listed, plus `getTimeZoneForInterval`.** All seven are removed from CacheData, which is private, and no test calls them there. Every internal call site uses TimeUtils directly.
- **Option B — A, plus the `Cache.parseToSeconds` logic.** `Cache.parseToSeconds` becomes a delegating wrapper like the others, so all time conversion lives in one class.
- **Option C — A, but keep thin delegating stubs on CacheData.** That leaves two paths to the same logic, with nothing calling the stubs.

**Recommendation: Option B.** It's a seven-line method built on one of the moved converters, and consolidation is the plan's stated goal.

**Answer:** B

**Decision:** Move the six listed methods, `getTimeZoneForInterval` (as `TimeUtils.getTimeZone()`), and the `Cache.parseToSeconds` logic. Remove them and the `#timeZoneForInterval` / `#offsetInMinutes` fields from CacheData. `Cache.generateInternetFormattedDate`, `Cache.nextIntervalInSeconds`, and `Cache.parseToSeconds` delegate to TimeUtils.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q7 — Pre-existing defects in the moved code

1. Both converters throw when called with no argument or 0, which they document as "use current time" (the bug is `Date.now().getTime()`). The throw reaches `Cache.generateInternetFormattedDate(0)`, and `isExpired()` / `needsRefresh()` on a `Cache` instance with no stored data.
2. The `getOffsetInMinutes()` JSDoc has the sign backwards. West of UTC is negative: Chicago is -300 or -360.
3. `parseToSeconds` returns `NaN` for unparsable input instead of the documented 0, and both JSDoc example outputs are wrong. This only matters if Q6 = B, and the one internal caller already treats `NaN` like 0.
4. A timestamp exactly on a boundary returns itself, so that entry expires immediately.

- **Option A — Fix 1–3; preserve and document 4.** For 1, use `Date.now()`. `generateInternetFormattedDate(0)` then formats the current time, consistent with the converters' contract, and an instance with no stored data reports itself as expired.
- **Option B — Preserve all behavior; fix documentation only.**
- **Option C — Fix all four.** Item 4 becomes "strictly after `ts`".

**Recommendation: Option A.** Items 1–3 are contract bugs, and no working caller can depend on them. Item 4 costs at most one extra origin fetch, and changing it would break exact equivalence with today's results (Q10).

**Answer:** A

**Decision:** Fix items 1–3; preserve item 4 and document it. `generateInternetFormattedDate(0)` formats the current time, and an instance with no stored data reports itself as expired. `parseToSeconds` returns 0 for unparsable input and for the Unix epoch (see Round 2).

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q8 — Exposure and file name

- **Option A — Internal, `src/lib/utils/TimeUtils.class.js`.** Not exported. Tests import it directly, as they do `DataHasher` and `InMemoryCache`. The `.class.js` suffix follows the majority in `src/lib/utils/` (7 of 11 files) and the sibling `DataHasher.class.js`. Consumers keep using `Cache.*`.
- **Option B — Internal, `src/lib/utils/TimeUtils.js`.** Matches `InMemoryCache.js`, which the plan references.
- **Option C — Public, exported as `tools.TimeUtils`** with TypeScript declarations. This is new public API to support under semver.

**Recommendation: Option A.** I read "publicly available through the TimeUtils API" as public static methods on an internal class, which tests can reach without TestHarness. Exporting later is additive; un-exporting would be breaking.

**Answer:** A

**Decision:** `src/lib/utils/TimeUtils.class.js`. Internal, marked `@private`, not exported, and not declared in `types/`.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q9 — How should `Cache.testInterval()` figure into testing?

`Cache.testInterval()` takes no arguments and reads the clock, so its output can't be compared with fixed expected values.

- **Option A — Keep it unchanged and reuse its interval table.** It delegates to TimeUtils. New tests run its 21 intervals (15 s to 120 h) through `TimeUtils.nextIntervalInSeconds` with fixed timestamps across a matrix of zones. They also run invariant checks on live `Cache.testInterval()` output that hold for any clock reading: each boundary is at or after `start`, and at most one interval later.
- **Option B — A, plus an optional `timestampInSeconds` argument on `Cache.testInterval()`.** The method itself becomes deterministic. This is an additive change to a public signature, with the types updated.
- **Option C — Move the table into `TimeUtils.testInterval(ts)`.** `Cache.testInterval()` then builds `{ info: Cache.info(), tests }` from it.

**Recommendation: Option A.** It gives full coverage without changing a public signature.

**Answer:** A

**Decision:** `Cache.testInterval()` keeps its signature and shape and delegates to TimeUtils. Tests run its 20 intervals through TimeUtils with fixed timestamps across a zone matrix, plus invariant checks on live output. (Round 1 said 21 intervals; that count included the `start` key.)

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q10 — How do we prove TimeUtils matches today before removing `moment-timezone`?

- **Option A — Golden fixture, then remove the dependency.** While `moment-timezone` is still installed, a committed script records the moment-based algorithm's output, with the offset sampled per Q1. The matrix covers:
  - Zones: Etc/UTC, America/Chicago, America/New_York, Europe/London, Asia/Kolkata (+5:30), Asia/Kathmandu (+5:45), America/St_Johns (−3:30), Australia/Lord_Howe (30-minute DST), Pacific/Chatham (+12:45), Pacific/Kiritimati (+14).
  - Timestamps from 2020–2025, including instants right before and after DST transitions.
  - The 21 intervals from `Cache.testInterval()`.

  The JSON fixture is committed, and a test asserts that TimeUtils reproduces it exactly. Then the dependency is removed. Property tests against an independent `Intl`-based oracle cover the rest.
- **Option B — Keep `moment-timezone` as a devDependency** for a permanent differential property test.
- **Option C — Invariant and property tests only.**

**Recommendation: Option A.** B compares against a second tz database that already disagrees with Node's for 11 zones (Q11), so it would fail whenever the two drift apart. That's the kind of randomly timed release block the steering docs warn about, and it also keeps the dependency around. Past timestamps keep the fixture independent of future rule changes: the two databases agree for every zone from 2020 until September 2026. C loses the anchor to today's behavior.

**Answer:** A

**Decision:** The golden fixture is committed first, then the dependency is removed. The matrix uses the 20 intervals. Round 2 covers how the generator gets its expected values, where the files live, and the check that the fixture zones agree on Node.js 22, 24, and 26.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q11 — Timezone rules will come from the Node.js runtime

After removal, DST rules come from the ICU tzdata in the Node.js runtime instead of the data bundled with `moment-timezone`, and the two already differ. `moment-timezone` 0.6.5 ships tzdata 2026e, while local Node.js v24.15.0 has 2026a. They disagree:

- For Africa/Casablanca and Africa/El_Aaiun from 2026-09-20.
- For nine Canadian zones (America/Vancouver, America/Edmonton, America/Winnipeg, and related zones and aliases) from 2026-11-01. For example, 2026e keeps America/Vancouver at UTC−7 after November 1, while 2026a returns it to UTC−8.

Users in those zones would get the runtime's answer until the runtime updates.

The [Node.js Intl docs](https://nodejs.org/api/intl.html) say official builds include the full ICU data set by default. Lambda's managed runtimes receive Node.js updates from AWS; one [runtime announcement](https://aws.amazon.com/blogs/compute/node-js-14-x-runtime-now-available-in-aws-lambda/) says zip deployments get them automatically and container images need a rebuild. I couldn't check the ICU build or tzdata version of the current Lambda runtimes from here. _Content from these sources was rephrased for compliance with licensing restrictions._

- **Option A — Accept and document, and add `process.versions.tz` to `Cache.info()`.** An additive diagnostic field (named `tzDataVersion`, for example), with the types updated.
- **Option B — Accept and document only.**
- **Option C — Bundle our own tzdata.** That rebuilds what this change removes.

**Recommendation: Option A.** Rule freshness becomes a runtime concern, and one field makes it diagnosable when a user in an affected zone reports boundaries an hour off. A one-time check in a deployed function would confirm what Lambda ships: log `process.versions.tz` and `Intl.supportedValuesOf('timeZone').length`.

**Answer:** A - also check against Node 26 which is available in this environment cli using nvm

**Decision:** Accept and document. `Cache.info()` gains `tzDataVersion` (`process.versions.tz`, or `null` when the runtime doesn't report one), and the type is updated. The Node.js 26 check (plus 22, also in the CI matrix) is in Round 2. Drift varies by runtime version, so the docs describe it per version.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q12 — Documentation scope

- **Option A — Full.**
  - JSDoc for TimeUtils and the updated `Cache.*` wrappers, correcting the inaccurate claims listed above.
  - An "Interval-based expiration" subsection in `docs/features/cache/README.md` covering:
    - local-midnight alignment for intervals that divide 24 h
    - epoch alignment for other intervals, such as 5 h and multi-day
    - Thursday alignment for 168 h
    - accepted timezone names
    - where tz rules come from
    - the DST behavior chosen in Q1
  - A new `docs/technical/interval-expiration.md` on TimeUtils internals, mirroring `docs/technical/cache-key-hashing.md` for DataHasher.
  - CHANGELOG.
- **Option B — JSDoc and CHANGELOG only.**

**Recommendation: Option A.** Today the user docs say nothing about where boundaries fall, several JSDoc claims are wrong, and the DataHasher change set the precedent.

**Answer:** A

**Decision:** The full scope as listed. The technical doc also records the per-Node.js-version tzdata differences and `Temporal` as a future option (Round 2).

**Status:** 🔵 REVISED (plan body updated to match)

---

## Round 2 — Answers reviewed; Q11 runtime check

All twelve answers match the recommendations and are locked as written. For the Q11 note, I reran the Round 1 comparison on every Node.js version installed through nvm. These are also the three versions in the CI matrix (`.github/workflows/test.yml`).

| Node.js | ICU | tzdata | `Temporal` | Accepts all 597 `moment` names | Zones that differ from `moment-timezone` 2026e (2020–2027, 3 h steps) | Fixture zones (2020–2025, 15 min steps) |
|---------|-----|--------|------------|-------------------------------|-------------------------------------------------------------------------|------------------------------------------|
| 22.23.2 | 78.2 | 2026a | no | yes | 11, the same as 24 | 0 mismatches in 2,104,320 checks |
| 24.15.0 | 78.2 | 2026a | no | yes | 11 (Round 1 list) | 0 mismatches |
| 26.10.0 | 78.3 | 2026c | yes | yes | 4, from 2026-11-01: America/Winnipeg, America/Rainy_River, Canada/Central, America/Inuvik | 0 mismatches |

What this means:

- Drift depends on the runtime version. Node.js 26.10.0 already agrees with `moment-timezone` for Morocco, Vancouver, and Edmonton, while the Manitoba-area zones and Inuvik still differ. The docs describe drift per runtime, and `tzDataVersion` tells a user which tzdata their runtime has.
- Name handling is identical on all three: the same accepted names, the same canonical forms (`Asia/Kolkata` → `Asia/Calcutta` even on 26), and the same `RangeError`. Storing the name as given (Q3, rule 5) keeps `Cache.info()` stable either way.
- The Q10 fixture zones and range agree on all three versions, so the fixture test can't depend on which Node.js CI runs.
- Tests with fixed expected values must avoid the zones that drift after September 2026. That is now a requirement.
- `Temporal` exists only on Node.js 26. TimeUtils can't use it while the floor is Node.js 22, but it's the natural route to Q1 option C later. Recorded in the technical doc and the out-of-scope list.

### Minor choices made while locking

Say so if you want any of these changed.

- The moved getter is `TimeUtils.getTimeZone()` rather than `getTimeZoneForInterval()`.
- Non-string option message: `Invalid timezone of type <type>. Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".` The name in the Q4 messages is rendered with `JSON.stringify`, which supplies the quotes and escapes control characters before they reach a log.
- The repeated-init warning mirrors CacheData's: `TimeUtils already initialized. Ignoring call to TimeUtils.init()`.
- `tzDataVersion` is `process.versions.tz`, or `null` if the runtime doesn't report one.
- `parseToSeconds` computes `Math.ceil(ms / 1000)` directly instead of going through the converter. Otherwise, after the Q7 fix, the Unix epoch would parse to the current time. Today the epoch returns 0 only because the converter throws and the error is caught and logged.
- The converter parameter typo `timestampInMillseconds` becomes `timestampInMilliseconds`.
- The fixture generator loads the pre-change `dao-cache.js` (path configurable, so it can be re-run against a pre-change checkout) and calls `CacheData.nextIntervalInSeconds` through `TestHarness`, with `CacheData.getOffsetInMinutes` stubbed to `moment-timezone`'s offset at each row's timestamp. The expected values therefore come from today's arithmetic rather than a re-implementation. The generator lives in this spec's `fixture/` folder, following the lazy-accessors `benchmark/` folder; the JSON goes under `test/cache/time-utils/fixtures/`.
- New tests go under `test/cache/time-utils/{unit,property,integration}/`, following `test/cache/data-hasher/`.
- TimeUtils requires `DebugAndLog` from `src/lib/tools/DebugAndLog.class.js`, as `ParameterStoreLoader` and `ValidationMatcher` do.

### Observed, out of scope

The `Cache.info()` return type in `types/lib/dao-cache.d.ts` has no `saltSource`, which the cache-key-generation-docs spec added at runtime. Since this spec edits that type for `tzDataVersion`, it could add `saltSource` in the same change if you want; otherwise it stays out. **Yes, please add**

No new questions came out of this round.

## Round 3 — `saltSource` and Temporal

### `saltSource` (locked)

Per your note in Round 2, the `Cache.info()` return type in `types/lib/dao-cache.d.ts` gains `saltSource` in the same change as `tzDataVersion`. I'm typing it as the three values the runtime produces, `"sharedCacheId" | "AWS_LAMBDA_FUNCTION_NAME" | "none"`, rather than `string`; say so if you'd rather keep it loose. `requirements.md` is updated to match: Requirement 12.4, a new type-consumer test (11.14), a consumer-visible change row, and the out-of-scope item is gone.

### What I verified about Temporal

| Check | Result |
|-------|--------|
| Node.js 26 | The [26.0.0 release notes](https://nodejs.org/en/blog/release/v26.0.0) (2026-05-05) say Temporal is enabled by default, with V8 14.6. On 26.10.0 it's a global, and using it prints no warning |
| Node.js 22 and 24 | Not available by default. `--harmony-temporal` exposes an older, pre-standard implementation: it still has the `Temporal.TimeZone` class, lacks `getTimeZoneTransition()`, and costs ~30 µs per offset lookup |
| Temporal vs `Intl` offsets on 26.10.0, all 418 zones, 2020–2027 every 6 h (4.9M checks) | Identical. Both read the same ICU tzdata (2026c), so Temporal brings no data advantage |
| Cost per offset lookup on 26.10.0 | Temporal 0.78 µs, `Intl` 2.2 µs. Negligible either way on a path that runs once or twice per cache update |
| Next-transition lookup | `getTimeZoneTransition('next')` from 2026-10-21 returns 2026-11-01T07:00Z for America/Chicago. `Intl` has no equivalent; it needs a bisection search |

_Content from the release notes was rephrased for compliance with licensing restrictions._

`ZonedDateTime.round({ roundingMode: 'ceil' })` around transitions in America/Chicago, compared with the planned Q1 B behavior:

| Case | Q1 B (planned) | Temporal `round()` |
|------|----------------|--------------------|
| 4 h from 1:30 AM CDT on Nov 1 (fall back) | 3:00 AM CST | 4:00 AM CST, on the wall clock |
| 24 h from 12:30 AM CDT on Nov 1 | 11:00 PM CST, Nov 1 | Midnight, Nov 2 |
| 1 h from 1:30 AM CDT on Nov 1 | 1:00 AM CST, the next time the clock shows :00 | 2:00 AM CST, skipping the repeated 1:00 AM hour |
| 1 h or 2 h from 1:30 AM CST on Mar 8 (spring forward) | 3:00 AM CDT | 3:00 AM CDT |
| 5 h | Epoch-aligned | Throws `RangeError`: the increment must divide a day |
| 48 h and longer | Epoch-aligned | Throws `RangeError`: a day increment above 1 isn't allowed |

So Temporal's rounding is right for multi-hour intervals at a transition, but it can't express 5 of the 20 intervals in `Cache.testInterval()` (5, 48, 72, 96, and 120 hours) or common `defaultExpirationInSeconds` values such as 45 or 90 minutes, and it skips the repeated hour at fall-back. A Temporal path would still need today's arithmetic for everything `round()` can't do, plus its own rule for the repeated hour.

On gating: yes, it can be done, but `typeof Temporal` alone isn't a safe check. Node.js 22 and 24 started with `--harmony-temporal`, and any process with a global polyfill, define `Temporal` with a different API and very different performance. A safe gate checks both the Node.js major (`process.versions.node` ≥ 26) and the API shape, for example `typeof Temporal?.ZonedDateTime?.prototype?.getTimeZoneTransition === 'function'`.

Two constraints come from this repo's own setup:

- Node.js 26 runs as `continue-on-error` in CI, and `nodejs26.x` is a Lambda preview (`.kiro/steering/cache-data-node-support.md`, last checked 2026-09-25). A path that only runs on Node.js 26 could break without blocking a release.
- With `sharedCacheId`, functions on different Node.js versions can share entries. A runtime-gated path would give the same profile different expirations depending on which function refreshed the entry.

On "fully Node 26 compatible": compatibility means correct on Node.js 26, and the `Intl` implementation already is. Round 2 found identical names and offsets on 26.10.0, and `Intl.DateTimeFormat` isn't deprecated there.

---

## Q13 — Use Temporal in 1.4.0?

- **Option A — `Intl` only (as planned).** One code path, with the same results on Node.js 22, 24, and 26. Temporal stays a documented future option.
- **Option B — Gated Temporal path for offset lookups only.** Node.js 26 or later with the full API uses Temporal; everything else uses `Intl`. Results are identical (verified), saving ~1.4 µs per call. Two code paths, and the Temporal one never gates a release.
- **Option C — Gated Temporal path with exact wall-clock alignment (Q1 option C) on Node.js 26, and Q1 B elsewhere.** Fixes the straddle case on Node.js 26 only. Boundaries then differ by runtime, the epoch arithmetic is still needed for intervals Temporal can't round, the repeated-hour rule still has to be decided, and the path never gates a release. Reopens Q1.
- **Option D — Exact wall-clock alignment on every runtime, built on `Intl`, with `getTimeZoneTransition()` as an optional shortcut on Node.js 26.** Same results everywhere, and the straddle case is fixed now. The most complex option: it needs explicit rules for the spring-forward gap and the repeated hour, an independent oracle for fixture rows that straddle a transition, and more property tests. Reopens Q1.
- **Option E — A in production, plus Temporal as an independent test oracle where it exists.** On Node.js 26, property tests check TimeUtils' offsets, and the boundaries built on them, against Temporal: a separate implementation reading the same data. On 22 and 24 that comparison is skipped. No production risk, Temporal is put to work now where it's safe, and the Node.js 26 CI leg gains a cross-check.

**Recommendation: Option E.** Production stays identical on every supported runtime, and Temporal adds no tz data. The one behavioral gain, the straddle fix, would be Node.js 26-only and never release-gating under C, and doesn't need Temporal under D. Moving TimeUtils onto Temporal as a single code path fits a follow-up once the floor reaches Node.js 26 (Node.js 24's EOL is 2028-04-30). If you want the straddle fix sooner, D works as its own spec, independent of Temporal.

**Answer:** E

**Decision:** Production code uses `Intl` only and never references `Temporal`. Where native Temporal is available (Node.js 26 or later, with `Temporal.ZonedDateTime.prototype.getTimeZoneTransition`), property tests also check TimeUtils' offsets, and the boundaries built on them, against Temporal. On other runtimes those tests are reported as skipped. Test code reaches it through `globalThis.Temporal`, so that on a runtime without it the lookup returns `undefined` instead of throwing a `ReferenceError`. A single Temporal-based implementation is a follow-up for when the floor reaches Node.js 26.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Round 4 — Grounding verified while writing design.md

None of these needed a decision from you, but two change the documents:

- **Lint baseline (changes Requirement 11.12).** `npm run lint:ci` already fails on the repository: 1,012 errors in 125 files. Requirement 11.12 said it SHALL pass, which this spec can't deliver without fixing unrelated files. It now follows the lazy-accessors precedent: modified files gain no ESLint errors, and new files have none. Baselines: `src/lib/dao-cache.js` 21, `test/cache/cache-validation-tests.jest.mjs` 14, `test/powertools/integration/backwards-compatibility-tests.jest.mjs` 1. One of the 21 is in `convertTimestampFromSecondsToMilli`, which moves out.
- **Interval arithmetic doesn't use the converters (design detail).** Today the arithmetic passes the shifted timestamp and the interval through the converters. After the Q7 fix, a value of exactly 0 there would mean "now". TimeUtils does that arithmetic with plain `* 1000` and `/ 1000`, and keeps today's two `Date` round-trips, so results match today's for every input the old code didn't throw on.
- **`-0` for UTC zones.** Today `offsetInMinutes` is `-0` for zero-offset zones (`-1 * 0`). TimeUtils returns `0`. Only `Object.is` can tell them apart, but Jest's `toEqual` is one of the things that does, so the golden fixture normalizes `-0` to `0`.
- **A second oracle that runs everywhere.** On Node.js 22, 24, and 26, offsets parsed from `Intl`'s `timeZoneName: 'longOffset'` output match the wall-clock method TimeUtils uses for all 418 zones, 2000–2100 (9.8M checks per version), including the seconds-level historical offset for America/Chicago in 1880 (-350.6 minutes). That's the independent oracle for Requirement 11.4 on every runtime, with Temporal added on 26.

No new questions.

## Next step

All thirteen questions are locked. Requirements are in [requirements.md](requirements.md), the technical design in [design.md](design.md), and the implementation plan in [tasks.md](tasks.md).
