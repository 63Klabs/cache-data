# Requirements Document

## Introduction

`src/lib/dao-cache.js` uses the external `moment-timezone` package in one place. `CacheData.init()` calls `CacheData._setOffsetInMinutes()` once to look up the UTC offset of the configured `timeZoneForInterval`. `CacheData.nextIntervalInSeconds()` then applies that single offset to every timestamp it rounds, so interval-based expiration lines up with local time: local midnight, every 4 hours, and so on.

This feature moves the package's time utilities into a new internal static class, `TimeUtils`, replaces `moment-timezone` with the built-in `Intl.DateTimeFormat`, and removes the dependency. After the change the package has no runtime dependencies, and its peer dependencies stay optional. The public `Cache` methods keep their names and signatures and delegate to `TimeUtils`.

A review of the code found defects that this change also fixes:

- The offset goes stale when an execution environment stays up across a DST change.
- In-memory-only mode ignores `timeZoneForInterval`.
- The documented pattern `timeZoneForInterval: process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL` throws when the variable is unset.
- An invalid timezone fails with an opaque `TypeError` and blocks a corrected retry.
- Both timestamp converters throw when called without an argument.

The results are listed under [Consumer-visible behavior changes](#consumer-visible-behavior-changes).

The change ships in v1.4.0 as a minor release. Decisions are recorded in the Decision Log in [PLAN.md](PLAN.md), and references such as (Q4) point there. All decisions are locked. The technical design is in [design.md](design.md).

## Glossary

- **TimeUtils**: the internal static class in `src/lib/utils/TimeUtils.class.js` that this feature introduces.
- **Timezone option**: `options.timezone` passed to `TimeUtils.init()`. `Cache.init()` fills it from `parameters.timeZoneForInterval`.
- **Timezone env var**: `CACHE_DATA_TIME_ZONE_FOR_INTERVAL`.
- **Not provided**: `undefined`, `null`, `""`, or a string containing only whitespace. (Q3)
- **Active timezone**: the timezone TimeUtils uses for offsets and intervals. It is `"Etc/UTC"` until the first successful `init()`, then the name that init resolved.
- **Offset**: local time minus UTC for a timezone at an instant, in minutes. Positive east of UTC, negative west: America/Chicago is -300 during CDT and -360 during CST.
- **Local frame**: a timestamp shifted by the offset, used only for rounding.
- **Interval boundary**: the value `nextIntervalInSeconds()` returns, the earliest timestamp at or after its input whose local-frame value is a multiple of the interval.
- **Interval table**: the 20 intervals `Cache.testInterval()` reports: 15, 30, and 60 seconds; 5, 10, 15, 30, and 60 minutes; and 2, 3, 4, 5, 6, 8, 12, 24, 48, 72, 96, and 120 hours.
- **tzdata**: the IANA time zone database. After this change, TimeUtils uses the copy in the Node.js runtime's ICU data, whose version `process.versions.tz` reports.
- **Golden fixture**: a committed JSON file of interval boundaries recorded from the pre-change code with `moment-timezone` installed. (Q10)
- **Module instance**: one evaluation of a module. Once per process in production; once per test file under Jest.

## Requirements

### Requirement 1: Internal TimeUtils class (Q8)

**User Story:** As a maintainer, I want the time utilities in one internal class under `src/lib/utils/`, so that they're organized like `DataHasher` and `InMemoryCache` and can be tested without growing the public API.

#### Acceptance Criteria

1. THE package SHALL contain a static class `TimeUtils` in `src/lib/utils/TimeUtils.class.js`, exported with `module.exports = TimeUtils`.
2. THE TimeUtils class SHALL provide at least these public static methods: `init(options)`, `getTimeZone()`, `getOffsetInMinutes(timestampInSeconds)`, `nextIntervalInSeconds(intervalInSeconds, timestampInSeconds)`, `generateInternetFormattedDate(timestamp, inMilliseconds)`, `convertTimestampFromMilliToSeconds(timestampInMilliseconds)`, `convertTimestampFromSecondsToMilli(timestampInSeconds)`, and `parseToSeconds(date)`.
3. THE TimeUtils class SHALL NOT be exported from `src/index.js` or `src/lib/tools/index.js`, and SHALL NOT be declared in `types/`.
4. THE class JSDoc SHALL include `@private`. EACH public static method SHALL have a description, an `@param` for every parameter with a name matching the signature, `@returns`, at least one `@example`, and `@throws` where the method can throw.
5. THE TimeUtils class SHALL compute offsets with the built-in `Intl.DateTimeFormat`, SHALL require only Node.js built-ins and modules in this package, and SHALL NOT reference `Temporal`. (Q13)

### Requirement 2: Timezone resolution (Q3)

**User Story:** As a Lambda function developer, I want to pass `timeZoneForInterval: process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL` whether or not the variable is set, so that the documented configuration pattern works and an unset value falls back to UTC.

#### Acceptance Criteria

1. WHEN `TimeUtils.init(options)` runs while TimeUtils is uninitialized, THE TimeUtils SHALL resolve the timezone from the first provided value among the timezone option, the timezone env var, and `"Etc/UTC"`, in that order.
2. THE TimeUtils SHALL treat a value that is not provided as absent at both levels, so that resolution falls through to the next level.
3. WHEN `options` is `undefined` or `null`, THE TimeUtils SHALL behave as if `options` were `{}`.
4. IF the timezone option is provided and is not a string, THEN `TimeUtils.init()` SHALL throw an `Error` with the message `Invalid timezone of type <type>. Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".`, where `<type>` is `typeof` the value.
5. THE TimeUtils SHALL trim surrounding whitespace from the resolved value before validating it.
6. THE TimeUtils SHALL accept every name for which constructing an `Intl.DateTimeFormat` with that `timeZone` succeeds, including fixed offsets such as `"+05:30"`, and SHALL NOT keep its own list of valid names.
7. WHEN init succeeds, `TimeUtils.getTimeZone()` SHALL return the trimmed value as given rather than `Intl`'s canonical form: `"Etc/UTC"`, not `"UTC"`, and `"Asia/Kolkata"`, not `"Asia/Calcutta"`.

### Requirement 3: Invalid timezone (Q4, Q2)

**User Story:** As a Lambda function developer, I want a misconfigured timezone to fail init with a message that names the bad value, and a corrected retry to work, so that I find the mistake at cold start instead of through expirations that are hours off.

#### Acceptance Criteria

1. IF `Intl.DateTimeFormat` rejects the trimmed value, THEN `TimeUtils.init()` SHALL throw an `Error` whose `cause` is the error `Intl` threw.
2. WHEN the rejected value came from the timezone option, THE message SHALL be `Invalid timezone <value>. Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".`, where `<value>` is `JSON.stringify` of the trimmed value.
3. WHEN the rejected value came from the timezone env var, THE message SHALL be `Invalid timezone <value> from CACHE_DATA_TIME_ZONE_FOR_INTERVAL. Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".`
4. IF `TimeUtils.init()` throws, THEN TimeUtils SHALL stay uninitialized, with its active timezone unchanged.
5. IF `TimeUtils.init()` throws inside `Cache.init()`, THEN `Cache.init()` SHALL log the message with `DebugAndLog.error` and re-throw the same error object, without assigning any `Cache` state and without calling `CacheData.init()`.
6. WHEN `Cache.init()` is called with a valid timezone after a call that failed this way, THE call SHALL initialize TimeUtils and CacheData as if the failed call had not happened.

### Requirement 4: TimeUtils lifecycle (Q5)

**User Story:** As a maintainer, I want TimeUtils to follow the same initialize-once pattern as CacheData, so that configuration is fixed after cold start and configuration errors surface at init.

#### Acceptance Criteria

1. THE first successful `TimeUtils.init()` SHALL set the active timezone for the life of the module instance.
2. WHEN `TimeUtils.init()` is called after a successful init, THE TimeUtils SHALL log a warning with `DebugAndLog.warn`, SHALL NOT read or validate the timezone option or env var, and SHALL NOT change the active timezone.
3. WHILE TimeUtils is uninitialized, `getTimeZone()` SHALL return `"Etc/UTC"`, `getOffsetInMinutes()` SHALL return 0, and `nextIntervalInSeconds()` SHALL use an offset of 0.
4. THE two converters, `generateInternetFormattedDate()`, and `parseToSeconds()` SHALL work without init, and their results SHALL NOT depend on the active timezone.
5. THE TimeUtils SHALL let a caller compute the offset and the interval boundary for an explicitly given timezone without reading or changing the active timezone, so that tests can cover many timezones in one module instance. IF Intl rejects an explicitly given timezone, THEN the method SHALL throw as in Requirements 3.1 and 3.2.
6. THE TimeUtils SHALL NOT expose a member that resets its initialized state.

### Requirement 5: Offset (Q1)

**User Story:** As a Lambda function developer whose execution environment can stay up across a DST change, I want each interval calculation to use the offset in effect at the timestamp being rounded, so that boundaries keep landing on local time after the clocks change.

#### Acceptance Criteria

1. `TimeUtils.getOffsetInMinutes(timestampInSeconds = 0)` SHALL return the active timezone's offset at `timestampInSeconds`, or at the current time WHEN `timestampInSeconds` is 0 or omitted.
2. THE offset SHALL be derived from the wall-clock time that `Intl.DateTimeFormat` reports for the instant in the timezone, so that it follows the runtime's tzdata.
3. THE offset used for a timestamp SHALL be the offset in effect at that timestamp. THE TimeUtils SHALL NOT sample a single offset at init.
4. `Cache.info().offsetInMinutes` SHALL be the active timezone's offset at the time `Cache.info()` is called.

### Requirement 6: Interval boundaries (Q1, Q7)

**User Story:** As a Lambda function developer using `expirationIsOnInterval`, I want boundaries computed exactly as today apart from the DST fix, so that upgrading doesn't move my expirations.

#### Acceptance Criteria

1. `TimeUtils.nextIntervalInSeconds(intervalInSeconds, timestampInSeconds = 0)` SHALL use the current time WHEN `timestampInSeconds` is 0 or omitted.
2. THE boundary SHALL be computed with the pre-change arithmetic, using the offset from Requirement 5 at the input timestamp: shift the timestamp by the offset, round up to a multiple of the interval in milliseconds, convert back to seconds rounding up, and remove the shift.
3. WHEN the timestamp T and the interval I are integers, both in seconds, THE result B SHALL satisfy T ≤ B < T + I, and B + 60 × O SHALL be a multiple of I, where O is the offset in minutes at T.
4. WHEN T is already a boundary, THE result SHALL be T. (Q7, preserved)
5. THE offset SHALL apply to every interval length, including intervals shorter than an hour.
6. WHERE the pre-change code and TimeUtils use the same offset, THE results SHALL be identical, as verified by the golden fixture (Requirement 10).

### Requirement 7: Conversion, formatting, and parsing (Q6, Q7)

**User Story:** As a developer calling the `Cache` time helpers, I want them to behave as documented, including when called without a timestamp.

#### Acceptance Criteria

1. `TimeUtils.convertTimestampFromMilliToSeconds(timestampInMilliseconds = 0)` SHALL return `Math.ceil(timestampInMilliseconds / 1000)`, using `Date.now()` as the input WHEN the argument is 0 or omitted.
2. `TimeUtils.convertTimestampFromSecondsToMilli(timestampInSeconds = 0)` SHALL return `timestampInSeconds * 1000`, or `Date.now()` WHEN the argument is 0 or omitted.
3. Neither converter SHALL throw when called with no argument.
4. `TimeUtils.generateInternetFormattedDate(timestamp, inMilliseconds = false)` SHALL return `new Date(ms).toUTCString()`. `ms` SHALL be `timestamp` WHEN `inMilliseconds` is true, and `convertTimestampFromSecondsToMilli(timestamp)` otherwise, so that a seconds value of 0 formats the current time.
5. WHEN `Date.parse(date)` returns a finite number, `TimeUtils.parseToSeconds(date)` SHALL return `Math.ceil` of that number divided by 1000, so that the Unix epoch parses to 0.
6. WHEN `Date.parse(date)` returns `NaN`, `parseToSeconds` SHALL return 0.
7. IF `Date.parse(date)` throws, THEN `parseToSeconds` SHALL log the error with `DebugAndLog.error` and return 0.
8. WHEN a `Cache` instance has no stored data, `isExpired()` and `needsRefresh()` SHALL return `true` without throwing.

### Requirement 8: Cache integration (Q2, Q6, Q9, Q11)

**User Story:** As an existing user of the `Cache` API, I want the same methods and signatures backed by TimeUtils, with the timezone honored in both cache modes.

#### Acceptance Criteria

1. `Cache.init()` SHALL call `TimeUtils.init({ timezone: parameters.timeZoneForInterval })` after it validates that `parameters` is an object, and before it assigns any `Cache` state or evaluates the in-memory-only guard.
2. `CacheData.init()` SHALL NOT read, validate, or store `timeZoneForInterval` or the timezone env var.
3. WHILE in-memory-only mode is active, interval boundaries SHALL use the active timezone, and `Cache.info().timeZoneForInterval` SHALL report it.
4. THE CacheData class SHALL NOT define `generateInternetFormattedDate`, `convertTimestampFromSecondsToMilli`, `convertTimestampFromMilliToSeconds`, `nextIntervalInSeconds`, `getOffsetInMinutes`, `_setOffsetInMinutes`, `getTimeZoneForInterval`, `#timeZoneForInterval`, or `#offsetInMinutes`.
5. EVERY time conversion, date formatting, offset lookup, and interval calculation in `src/lib/dao-cache.js` SHALL go through TimeUtils.
6. `Cache.generateInternetFormattedDate(timestamp, inMilliseconds)`, `Cache.nextIntervalInSeconds(intervalInSeconds, timestampInSeconds)`, and `Cache.parseToSeconds(date)` SHALL keep their signatures and SHALL return what the corresponding TimeUtils method returns for the same arguments.
7. `Cache.testInterval()` SHALL keep its signature and return shape, `{ info, tests }`, where `tests` holds `start` plus one `Date` per interval in the interval table under the existing keys (`sec_15` through `hrs_120`), computed through TimeUtils.
8. `Cache.info()` SHALL report `timeZoneForInterval` from `TimeUtils.getTimeZone()`, `offsetInMinutes` per Requirement 5.4, and a new field, `tzDataVersion`, equal to `process.versions.tz`, or `null` when the runtime doesn't report one. (Q11)

### Requirement 9: Remove the moment-timezone dependency

**User Story:** As a maintainer, I want `moment-timezone` removed, so that the package has no runtime dependencies to track.

#### Acceptance Criteria

1. No file in `src/` SHALL require or import `moment-timezone` or `moment`.
2. `package.json` SHALL declare no runtime `dependencies`.
3. `package-lock.json` SHALL contain no `moment` or `moment-timezone` entries.
4. `test/powertools/integration/backwards-compatibility-tests.jest.mjs` SHALL assert that `package.json` declares no runtime dependencies, replacing the test that allows only `moment-timezone`.
5. THE dependency SHALL be removed only after the golden fixture (Requirement 10) is committed.

### Requirement 10: Golden fixture (Q10)

**User Story:** As a maintainer, I want evidence that TimeUtils reproduces today's boundaries, so that removing `moment-timezone` can't silently move anyone's expirations.

#### Acceptance Criteria

1. A generator script SHALL be committed under `.kiro/specs/1-4-0-fully-implement-timezone/fixture/`.
2. THE generator SHALL compute each expected boundary by calling the pre-change `CacheData.nextIntervalInSeconds` through `TestHarness`, with `CacheData.getOffsetInMinutes` stubbed to return `-1 * moment.tz.zone(tz).utcOffset(ms)` for the row's timestamp. The arithmetic is then today's code, and only the instant at which the offset is sampled follows Q1.
3. THE generator SHALL accept the path of the `dao-cache.js` to load, so that it can be re-run against a pre-change checkout, and SHALL document how to re-run it after removal (`npm install --no-save moment-timezone@0.6.5`).
4. THE fixture SHALL cover:
   - the timezones Etc/UTC, America/Chicago, America/New_York, Europe/London, Asia/Kolkata, Asia/Kathmandu, America/St_Johns, Australia/Lord_Howe, Pacific/Chatham, and Pacific/Kiritimati
   - all 20 intervals in the interval table
   - timestamps from 2020-01-01 through 2025-12-31: ordinary instants spread across the range, instants exactly on boundaries, and, for each DST transition in the range, the instants one second before, at, and one second after it
5. THE fixture SHALL be committed as JSON under `test/cache/time-utils/fixtures/`. It SHALL record each row's offset, and the `moment-timezone` version and tzdata version used to generate it.
6. A test SHALL assert that TimeUtils reproduces every recorded offset and boundary exactly, using the explicit-timezone capability (Requirement 4.5).
7. THE fixture's timezones and date range SHALL be ones for which the tzdata in Node.js 22, 24, and 26 agrees with the generator's. During planning this held for 22.23.2, 24.15.0, and 26.10.0 at 15-minute resolution.
8. THE generator SHALL NOT match Jest's `testMatch`, SHALL NOT run in CI, and SHALL NOT spawn a shell.

### Requirement 11: Verification and tests

**User Story:** As a maintainer, I want the new behavior covered by tests, so that a later change can't bring back a stale offset or the init failures.

#### Acceptance Criteria

1. THE full suite (`npm test`) SHALL pass. Existing test files SHALL stay unmodified except for the changes in Requirements 9.4 and 11.2.
2. THE test "Should throw error for invalid timeZoneForInterval parameter" in `test/cache/cache-validation-tests.jest.mjs` SHALL be replaced by tests that `''` resolves to the default and that an invalid name throws the message in Requirement 3.2. (Q3)
3. Unit tests SHALL verify Requirements 2, 3.1 to 3.4, 4, 5.1, 6.1, 6.4, and 7. A criterion that depends on TimeUtils' initialized state or on the timezone env var SHALL be verified in a fresh Node.js process, because TimeUtils has no reset (Requirement 4.6).
4. Property-based tests SHALL verify Requirement 6.3, and SHALL verify the offset (Requirement 5) against an oracle that derives the offset by a different method than TimeUtils does. They SHALL draw timezones from `Intl.supportedValuesOf('timeZone')`, timestamps from a bounded range, and intervals from the interval table plus arbitrary positive integers.
5. WHERE native Temporal is available, meaning Node.js 26 or later with `Temporal.ZonedDateTime.prototype.getTimeZoneTransition` defined, property tests SHALL also compare TimeUtils' offsets with Temporal's, and SHALL check Requirement 6.3 using Temporal's offsets. On other runtimes these tests SHALL be reported as skipped, not as passed. (Q13)
6. Tests in a fresh Node.js process SHALL verify Requirements 3.5, 3.6, 8.1, and 8.3, and the env var fallbacks in Requirement 2.
7. A test SHALL verify, for every interval in live `Cache.testInterval()` output, that the boundary B satisfies `start` ≤ B < `start` + the interval. (Q9)
8. A test SHALL verify Requirement 7.8.
9. Tests that spawn child processes SHALL use `execFile` or `execFileSync` with an argument array, SHALL set a timeout of at most 120 seconds, and SHALL NOT invoke `npm test`. A property test that spawns child processes SHALL use at most 10 runs; other property tests SHALL use at least 100.
10. Property tests SHALL NOT pass a `seed` option to `fc.assert`. Generators SHALL be valid by construction, or gated on a predicate other than the one the property asserts.
11. New test files SHALL live under `test/cache/time-utils/` in `unit/`, `property/`, and `integration/` directories, and SHALL follow the `*-tests.jest.mjs` and `*-property-tests.jest.mjs` naming conventions.
12. Assertions with fixed expected values SHALL use only timezones and dates for which tzdata in Node.js 22, 24, and 26 agrees, so that results don't depend on the CI runtime.
13. Modified files SHALL NOT gain ESLint errors relative to the baseline recorded in design.md, new files SHALL report no ESLint errors, and `npm run test:types` SHALL pass. (`npm run lint:ci` already fails on the repository baseline, which is outside this spec; PLAN.md, Round 4.)
14. A new type-consumer file in `test/types/` SHALL read `saltSource` and `tzDataVersion` from `Cache.info()` and assign each to a variable of its declared type, so that `npm run test:types` checks both fields. (Round 3)

Criteria 9 and 10 apply `.kiro/steering/test-execution-monitoring.md`, `.kiro/steering/secure-coding-practices.md`, and `.kiro/steering/test-requirements.md`.

### Requirement 12: Backwards compatibility

**User Story:** As an existing user of @63klabs/cache-data, I want to upgrade to v1.4.0 without changing my code.

#### Acceptance Criteria

1. THE package exports SHALL keep their names and kinds, and no export SHALL be added for TimeUtils.
2. THE `timeZoneForInterval` parameter and the timezone env var SHALL keep their names and their precedence, parameter first.
3. THE `Cache.info()` result SHALL keep every existing field and its type. The only addition SHALL be `tzDataVersion`.
4. THE only changes in `types/` SHALL be two fields added to the `Cache.info()` return type, `tzDataVersion: string | null` and `saltSource: "sharedCacheId" | "AWS_LAMBDA_FUNCTION_NAME" | "none"`, plus updated doc comments. The runtime already returns `saltSource`; the type was missing it. (Round 3)
5. THE change SHALL ship in v1.4.0 as a minor release.

### Requirement 13: Documentation (Q12)

**User Story:** As a developer configuring interval-based expiration, I want the docs to say where boundaries fall and how the timezone is chosen and validated.

#### Acceptance Criteria

1. THE TimeUtils JSDoc SHALL meet Requirement 1.4. It SHALL document the offset sign, the DST behavior from Q1, the exact-boundary behavior, and that 0 or an omitted timestamp means the current time.
2. THE JSDoc for `Cache.generateInternetFormattedDate`, `Cache.nextIntervalInSeconds`, `Cache.parseToSeconds`, `Cache.testInterval`, and `Cache.info` SHALL describe their behavior after this change, and SHALL NOT refer to `CacheData` methods that no longer exist.
3. THE `Cache.init()` JSDoc SHALL document how `timeZoneForInterval` is resolved, the not-provided values, the `"Etc/UTC"` default, and `@throws` for a non-string or invalid timezone. THE `CacheData.init()` JSDoc SHALL NOT document `timeZoneForInterval`.
4. THE JSDoc SHALL correct three errors found during planning: the sign described for `getOffsetInMinutes`, the `parseToSeconds` example outputs (`1627475051`, not `1627476251`), and the claim that intervals of 2 hours or more always align to local midnight.
5. `docs/features/cache/README.md` SHALL gain an "Interval-based expiration" subsection covering:
   - local-midnight alignment for intervals that divide 24 hours
   - epoch alignment for other intervals, such as 5 hours and multi-day intervals
   - Thursday alignment for 168 hours
   - the effect of :30 and :45 offsets on hourly and shorter intervals
   - accepted timezone names, including fixed offsets
   - the not-provided values and the default
   - init failing on an invalid timezone
   - tz rules coming from the Node.js runtime, with `tzDataVersion` reporting their version
   - the DST behavior from Q1, including the remaining case of a boundary that straddles a transition
6. THE `timeZoneForInterval` row of the configuration table in `docs/features/cache/README.md` SHALL reflect Requirement 2 and link to the new subsection.
7. A new `docs/technical/interval-expiration.md` SHALL describe TimeUtils internals:
   - offset lookup and formatter reuse
   - the interval arithmetic
   - the DST behavior and its known gap
   - the tzdata source, with the per-Node.js-version differences found during planning
   - where the golden fixture comes from
   - `Temporal`: what planning verified on Node.js 26 (PLAN.md, Round 3), how the tests use it as an oracle and how they detect it, and moving TimeUtils onto it as a single code path once the version floor reaches Node.js 26 (Q13)
8. User documentation SHALL describe behavior rather than TimeUtils internals, and SHALL NOT mention `TestHarness`.
9. Modified JSDoc and documentation SHALL pass the validation tests in `test/documentation/`.

### Requirement 14: Changelog

**User Story:** As an existing user, I want the release notes to tell me what changes at runtime, so that I can check whether any of it affects my functions.

#### Acceptance Criteria

1. THE change SHALL be recorded under `## v1.4.0 (unreleased)` in `CHANGELOG.md` per `.kiro/steering/changelog-convention.md`, linking `[Spec: 1-4-0-fully-implement-timezone](.kiro/specs/1-4-0-fully-implement-timezone/)`, without modifying existing entries.
2. EACH row of [Consumer-visible behavior changes](#consumer-visible-behavior-changes) SHALL appear under the category that table assigns it.

## Consumer-visible behavior changes

| # | Change | Who is affected | Category | Decisions |
|---|--------|-----------------|----------|-----------|
| 1 | `moment-timezone` and `moment` are no longer installed | Everyone. Locally, loading them took ~12 ms per fresh process and 8.4 MB in `node_modules` | Removed | — |
| 2 | Timezone rules come from the Node.js runtime's tzdata instead of the copy bundled with `moment-timezone` | Users in zones where the two differ. During planning, Node.js 22.23.2 and 24.15.0 (tzdata 2026a) differed from `moment-timezone` 0.6.5 (2026e) for 11 zones from September or November 2026, and Node.js 26.10.0 (2026c) for 4 | Changed | Q11 |
| 3 | `Cache.info()` reports `tzDataVersion`, and its TypeScript type declares it | Additive | Added | Q11 |
| 4 | Interval calculations use the offset at the timestamp being rounded instead of an offset sampled once at init | Environments that stay up across a DST change, which got boundaries an hour off until restarted, and callers passing timestamps from a different DST period | Fixed | Q1 |
| 5 | `Cache.info().offsetInMinutes` is the offset when `info()` is called, not at init | Only differs after a DST change | Changed | Q1 |
| 6 | In-memory-only mode honors `timeZoneForInterval`, so an invalid timezone now fails `Cache.init()` in that mode too | In-memory-only users who set a timezone. Their boundaries move from UTC to local time | Fixed | Q2 |
| 7 | Not-provided `timeZoneForInterval` values (`undefined`, `null`, `""`, whitespace-only) and a whitespace-only env var fall through to the next level instead of throwing, and names are trimmed | Configurations that threw before, including `timeZoneForInterval: process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL` with the variable unset | Changed | Q3 |
| 8 | Fixed-offset names such as `+05:30` are accepted | Configurations that failed before | Changed | Q3 |
| 9 | An invalid name throws `Invalid timezone "<name>". ...` with a `cause`, instead of a `TypeError`. A non-string value throws `Invalid timezone of type <type>. ...` instead of `timeZoneForInterval must be a non-empty string` | Code that matches on the old messages | Changed | Q3, Q4 |
| 10 | A corrected `Cache.init()` retry after an invalid timezone succeeds | Previously the retry was ignored and the invalid name stuck, with an offset of 0 | Fixed | Q4 |
| 11 | Before `Cache.init()`, `Cache.info()` reports `Etc/UTC` instead of `UTC` | Only callers of `info()` before init | Changed | Q5 |
| 12 | `Cache.generateInternetFormattedDate(0)` formats the current time instead of throwing a `TypeError`, and `isExpired()` and `needsRefresh()` return `true` instead of throwing on a `Cache` instance with no stored data | Callers that hit these paths | Fixed | Q7 |
| 13 | `Cache.parseToSeconds()` returns 0 instead of `NaN` for unparsable input, and parses the Unix epoch to 0 without logging an error | Direct callers | Fixed | Q6, Q7 |
| 14 | The `Cache.info()` TypeScript type declares `saltSource`, which the runtime already returns | TypeScript users, who can now read the field without a type error | Fixed | Round 3 |

## Traceability

| Requirement | Decision Log |
|---|---|
| 1. Internal TimeUtils class | Q8, Q13 |
| 2. Timezone resolution | Q3 |
| 3. Invalid timezone | Q2, Q4 |
| 4. TimeUtils lifecycle | Q5 |
| 5. Offset | Q1 |
| 6. Interval boundaries | Q1, Q7 |
| 7. Conversion, formatting, and parsing | Q6, Q7 |
| 8. Cache integration | Q2, Q6, Q9, Q11 |
| 9. Remove the moment-timezone dependency | Plan body, Q10 |
| 10. Golden fixture | Q10, Round 2 |
| 11. Verification and tests | Q3, Q9, Q10, Q13, Rounds 2 to 4 |
| 12. Backwards compatibility | Q8, Q11, Round 3 |
| 13. Documentation | Q12, Q13 |
| 14. Changelog | Q12 |

## Out of scope

- Exact wall-clock alignment for a boundary that straddles a DST transition (Q1, option C).
- A production `Temporal` code path, gated on the runtime or not (Q13). Temporal is used only as a test oracle.
- The stuck-retry problem for other CacheData settings that are validated after `#secureDataKey` is assigned (Q4).
- Changing the exact-boundary behavior (Q7, item 4), the epoch alignment of intervals that don't divide 24 hours, or the Thursday alignment of 168-hour intervals.
- Exporting TimeUtils (Q8), or adding a timestamp parameter to `Cache.testInterval()` (Q9).
- Bundling tzdata (Q11).
