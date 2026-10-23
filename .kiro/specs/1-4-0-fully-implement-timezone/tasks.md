# Implementation Plan

## Overview

Ordering follows [design.md](design.md).

- **Tasks 1 to 4 run before `src/lib/dao-cache.js` changes:**
  - task 1 records the suite baseline and the golden fixture, which can only be generated from the pre-change code
  - task 2 builds the test infrastructure
  - task 3 writes preservation tests, which pass on the current code
  - task 4 writes defect tests, which fail on the current code and so prove they detect each defect
- **Task 5 builds `TimeUtils` and its tests.** It's a new file, so it can proceed alongside tasks 3 and 4.
- **Tasks 6 to 8 integrate and verify.** Task 6 integrates `TimeUtils` into `dao-cache.js`, task 7 re-runs everything unmodified, and task 8 is the full-suite gate.
- **Tasks 9 to 12 close out the release work:** removing the dependency, then types, docs, and the CHANGELOG.
- **Task 13 is the final check.**

**Test execution:** use `node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` for one file, or `npm test` from the terminal for the suite. A bare `npx jest` fails on ESM. Never invoke `npm test` from inside a test file.

**Runtimes:** nvm has Node.js 22.23.2, 24.15.0 (the default), and 26.10.0 installed. To run a file on another version, call that version's binary directly: `"$HOME/.nvm/versions/node/v26.10.0/bin/node" --experimental-vm-modules node_modules/jest/bin/jest.js <path>`. Property 8 only runs on Node.js 26.

**Linting:** the repository isn't lint-clean (1,012 errors in 125 files), so `npm run lint:ci` fails for reasons outside this spec. Lint only the files this spec touches, with `npx eslint <files>`, and compare against the baselines in design.md "Lint".

**Commits:** don't commit, tag, or publish without explicit instruction. Task 1.3 asks whether to commit the fixture, because Requirement 9.5 removes the dependency only after the fixture is committed.

## Tasks

- [x] 1. Record the baseline and the golden fixture (BEFORE any source change)
  - **IMPORTANT:** finish this task before anything edits `src/lib/dao-cache.js`. The generator loads the pre-change code

  - [x] 1.1 Record the suite and lint baselines
    - Run `npm test` on the unchanged code. Record the pass and fail counts, and every failing test, in this task's completion notes. A failure here is pre-existing; leave it for the checkpoint in task 8
    - Run `npx eslint` on `src/lib/dao-cache.js`, `test/cache/cache-validation-tests.jest.mjs`, and `test/powertools/integration/backwards-compatibility-tests.jest.mjs`
    - **EXPECTED OUTCOME:** 21, 14, and 1 errors, matching design.md. Record any difference
    - _Requirements: 11.1, 11.13_

  - [x] 1.2 Write the fixture generator
    - **File:** `.kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs` (new)
    - Implement design.md "Golden fixture", steps 1 to 5:
      - options `--dao-cache <path>` (default `src/lib/dao-cache.js`) and `--out <path>` (default `test/cache/time-utils/fixtures/interval-fixture.json`)
      - set `AWS_REGION` to `us-east-1` if unset
      - get `CacheData` from `TestHarness.getInternals()`
      - stub `CacheData.getOffsetInMinutes` to return `-1 * zone.utcOffset(t * 1000)`, with `-0` normalized to `0`, and restore it in a `finally` block
    - Zones: Etc/UTC, America/Chicago, America/New_York, Europe/London, Asia/Kolkata, Asia/Kathmandu, America/St_Johns, Australia/Lord_Howe, Pacific/Chatham, Pacific/Kiritimati
    - Timestamps per zone, sorted with duplicates removed:
      - the 1st and 15th of each month from 2020 through 2025, at a time of day derived from the month
      - local midnight on the first day of each quarter
      - one second before, at, and one second after each `zone.untils` transition in the range
    - Use the 20 intervals in design.md order. Record each timestamp's offset and `nextIntervalInSeconds(I, t) - t` for every interval
    - Output must be deterministic, with no generation timestamp. Record `momentTimezoneVersion` and `tzdataVersion`. Indent objects. Write each numeric array on one line, and `boundaryDeltas` one line per timestamp
    - Header comment covers:
      - what the generator records, and why it must run before the refactor
      - usage
      - re-running after removal: a pre-change tree from `git archive`, `npm install --no-save moment-timezone@0.6.5`, and `--dao-cache`
    - CommonJS. No child processes, no shell. Lint-clean, because ESLint lints `.kiro/`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.8_

  - [x] 1.3 Generate the fixture
    - Run `node .kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs`
    - Check the output:
      - 10 zones
      - `timestamps`, `offsets`, and `boundaryDeltas` have equal lengths within each zone
      - every delta row has 20 values, each in `[0, I)`
      - the America/Chicago row for `1577836800` matches design.md's example
      - roughly 300 KB
    - Run it again and confirm the file is byte-identical (`cmp`)
    - Ask the maintainer whether to commit the fixture now. Task 9 can't start until it's committed. Don't commit without explicit instruction
    - _Requirements: 9.5, 10.4, 10.5, 10.7_

- [x] 2. Build the test infrastructure
  - See design.md "Testing strategy" for each file

  - [x] 2.1 Write the oracles module
    - **File:** `test/helpers/time-utils-oracles.mjs` (new)
    - Export `INTERVAL_TABLE`, `longOffsetMinutes()`, `nativeTemporal()`, and `temporalOffsetMinutes()` exactly as specified in the design
    - `nativeTemporal()` requires Node.js 26 or later and `typeof globalThis.Temporal?.ZonedDateTime?.prototype?.getTimeZoneTransition === "function"`. Never reference `Temporal` without `globalThis.`
    - JSDoc on every export. Lint-clean
    - _Requirements: 11.4, 11.5_

  - [x] 2.2 Write the child script
    - **File:** `test/cache/time-utils/fixtures/time-utils-child.cjs` (new)
    - Implement the `time-utils-init` and `cache-init` scenarios from the design's table, including:
      - `noArgument`
      - `nowAtInit`, which pins `Date.now` only for the duration of `Cache.init()`
      - recorders that replace `DebugAndLog.warn` and `DebugAndLog.error`
    - Read the scenario from `process.argv[2]` and its arguments from `process.argv[3]` as JSON. Never build code from inputs
    - Catch errors thrown while loading a module and report them in the result. Before task 5, `time-utils-init` can't load `TimeUtils.class.js`, and it must report that instead of crashing
    - Print exactly one `RESULT:` line carrying JSON
    - CommonJS with `require` only. Lint-clean
    - _Requirements: 11.6_

  - [x] 2.3 Write the runner
    - **File:** `test/helpers/time-utils-child-runner.mjs` (new)
    - `runTimeUtilsChild(scenario, args, { env, timeout })`, following `test/helpers/aws-classes-child-runner.mjs`: `execFileSync(process.execPath, [childPath, scenario, JSON.stringify(args)])`, `cwd` at the repository root, default timeout 20000 ms
    - Child environment: copy `process.env`; delete `CACHE_DATA_TIME_ZONE_FOR_INTERVAL`, `CACHE_USE_IN_MEMORY`, and `CACHE_IN_MEMORY_ONLY`; set `AWS_REGION=us-east-1`; then apply overrides, where `undefined` deletes a key
    - Return `{ status, stdout, stderr, result }` on a non-zero exit. Rethrow a timeout or spawn failure, which has no numeric `status`
    - Add `// >!` comments explaining that `execFileSync` with an argument array avoids shell interpretation
    - _Requirements: 11.6, 11.9_

- [x] 3. Write preservation tests (BEFORE the `dao-cache.js` change)
  - **IMPORTANT:** these encode today's public contract. They MUST PASS on the current code and keep passing after task 6
  - Import Jest globals from `@jest/globals`, and call `jest.restoreAllMocks()` in `afterEach`

  - [x] 3.1 Write the `Cache` API preservation tests
    - **File:** `test/cache/time-utils/integration/time-utils-cache-api-tests.jest.mjs` (new), in a `describe("preservation")` block
    - Call `Cache.init()` once at module scope with `timeZoneForInterval: "America/Chicago"`, as other cache tests do
    - Import only the public `Cache` API from `src/lib/dao-cache.js` and the oracles module. Don't import TimeUtils; it doesn't exist yet
    - `Cache.testInterval()`:
      - `tests` keys are exactly `start` followed by `sec_15` through `hrs_120`, all `Date`s
      - each boundary B satisfies `start` ≤ B < `start` + I, using `INTERVAL_TABLE`
      - `info.timeZoneForInterval` is a string and `info.offsetInMinutes` a number
    - `Cache.generateInternetFormattedDate(1700000000)` and `(1700000000000, true)` both return `"Tue, 14 Nov 2023 22:13:20 GMT"`
    - `Cache.parseToSeconds()` returns `1627475051` for `"Wed, 28 Jul 2021 12:24:11 GMT"` and for `"2021-07-28T12:24:11Z"`
    - `Cache.nextIntervalInSeconds(I, t)` for I of 15, 60, 900, and 3600 at a fixed t gives the UTC-aligned boundary. In a whole-hour zone these don't depend on the offset, so they're deterministic both before and after
    - `Cache.info()` still has every key the type declares today
    - _Requirements: 8.6, 8.7, 11.7, 12.3_

  - [x] 3.2 Run the preservation tests on the current code
    - **EXPECTED OUTCOME:** all PASS. A failure means the test misreads today's contract: fix the test, not `dao-cache.js`
    - _Requirements: 11.1_

- [x] 4. Write defect tests (BEFORE the `dao-cache.js` change)
  - **CRITICAL:** these encode the fixed behavior and MUST FAIL on the current code. The failures prove the tests detect each defect
  - **DO NOT change `dao-cache.js` in this task, and don't weaken a test to make it pass on the current code**
  - Child-process `it` blocks set a 60000 ms timeout

  - [x] 4.1 Add the in-process defect tests
    - Add a `describe("fixed behavior")` block to `test/cache/time-utils/integration/time-utils-cache-api-tests.jest.mjs`:
      - A new `Cache` with no stored data: `isExpired()` and `needsRefresh()` return `true` without throwing
      - With `Date.now()` mocked, `Cache.generateInternetFormattedDate(0)` returns `new Date(mockedNow).toUTCString()`
      - `Cache.parseToSeconds("not a date")` returns 0
      - `Cache.parseToSeconds("Thu, 01 Jan 1970 00:00:00 GMT")` returns 0, and `DebugAndLog.error` isn't called. Spy on the class from `src/lib/tools/DebugAndLog.class.js`
      - `Cache.info().tzDataVersion` equals `process.versions.tz`
      - With `Date.now()` mocked to 2026-01-15T18:00Z and then to 2026-07-01T12:00Z, `Cache.info().offsetInMinutes` is −360 and then −300
    - _Requirements: 5.4, 7.4, 7.5, 7.6, 7.8, 8.8, 11.8_

  - [x] 4.2 Write the `Cache.init()` child-process tests
    - **File:** `test/cache/time-utils/integration/time-utils-cache-init-tests.jest.mjs` (new), using the `cache-init` scenario
    - Write every case in design.md's list for this file:
      - the invalid option, then the corrected retry
      - in-memory-only mode with America/Chicago
      - in-memory-only mode with an invalid zone
      - `undefined` with the env var unset
      - `tzDataVersion`
      - the stale offset, with `nowAtInit`
    - Assert exact messages and values
    - _Requirements: 2.2, 3.5, 3.6, 5.3, 8.1, 8.3, 8.8, 11.6_

  - [x] 4.3 Replace the `''` validation test
    - **File:** `test/cache/cache-validation-tests.jest.mjs`, following design.md "Changes to existing tests"
    - Remove "Should throw error for invalid timeZoneForInterval parameter". Add the two replacement tests, which:
      - spawn `node --input-type=module -e <code>` through `execFileSync`
      - pass the module path in `TZ_TEST_MODULE`, built with `pathToFileURL`, with no bare `URL`
      - remove `CACHE_DATA_TIME_ZONE_FOR_INTERVAL` from the child environment
      - parse the child's JSON line and assert with `expect`
    - Leave the file's other five tests untouched. This and task 9.2 are the only edits to existing test files
    - _Requirements: 11.2_

  - [x] 4.4 Run the defect tests on the current code
    - **EXPECTED OUTCOME:** these FAIL. Record the observed failure for each in the completion notes:
      - `isExpired()` and `needsRefresh()`: `TypeError: Date.now(...).getTime is not a function`
      - `generateInternetFormattedDate(0)`: the same `TypeError`
      - `parseToSeconds("not a date")`: returns `NaN`
      - The epoch parse: `DebugAndLog.error` is called
      - `tzDataVersion`: `undefined`
      - `offsetInMinutes`: the same value for both mocked instants, because it was sampled at init
      - Invalid option: `TypeError: Cannot read properties of null (reading 'utcOffset')`, no error log, and `idHashAlgorithm` already set. The retry is ignored, and the first call's table name and the invalid zone stay
      - In-memory-only with America/Chicago: reports `UTC`, and the boundary is UTC midnight
      - In-memory-only with an invalid zone: doesn't throw
      - `undefined` timezone: throws `timeZoneForInterval must be a non-empty string`
      - Stale offset: returns 2026-01-16T05:00Z
      - The replaced validation tests: `''` throws, and the invalid-name message differs
    - **EXPECTED TO PASS:** the preservation tests from task 3, which share the `Cache` API file
    - Confirm each child-process file finishes in under 2 minutes and leaves no stray processes: `ps aux | grep -E "time-utils-child|jest" | grep -v grep`
    - _Requirements: 11.6_

- [x] 5. Implement TimeUtils and its tests
  - TimeUtils is a new file, so this task can run alongside tasks 3 and 4. Nothing here edits `dao-cache.js`

  - [x] 5.1 Write the class
    - **File:** `src/lib/utils/TimeUtils.class.js` (new)
    - Implement design.md "Components and interfaces" exactly:
      - the constants and private state
      - `resolveTimezone()`, `#isProvided()`, and `#validate()`
      - `init()`, `getTimeZone()`, and `getTzDataVersion()`
      - `getOffsetInMinutes()` and `#offsetSecondsAt()`
      - `nextIntervalInSeconds()`
      - the two converters, `generateInternetFormattedDate()`, and `parseToSeconds()`
    - Require only `../tools/DebugAndLog.class.js`. Don't reference `Temporal` anywhere in the file, including comments
    - JSDoc per Requirements 1.4 and 13.1. The class carries `@private`, and the offset sign, "0 or omitted means now", the exact-boundary rule, and the DST behavior are all stated. Add the `// >!` comment on `JSON.stringify`
    - End with `module.exports = TimeUtils;`
    - Confirm `node -e "require('./src/lib/utils/TimeUtils.class.js')"` loads cleanly and `npx eslint` reports 0 errors
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1 to 2.7, 3.1 to 3.4, 4.1 to 4.6, 5.1 to 5.3, 6.1 to 6.5, 7.1 to 7.7, 13.1_

  - [x] 5.2 Write the unit tests
    - **File:** `test/cache/time-utils/unit/time-utils-unit-tests.jest.mjs` (new)
    - Every item in design.md's list for this file. This file must never call `init()`
    - Use only zones and dates outside the Round 2 drift list for fixed expected values
    - _Requirements: 1.2, 2.1 to 2.7, 3.1 to 3.3, 4.3, 4.5, 4.6, 5.1, 6.1, 6.4, 7.1 to 7.7, 11.3, 11.12_

  - [x] 5.3 Write the fixture replay test
    - **File:** `test/cache/time-utils/unit/time-utils-golden-fixture-tests.jest.mjs` (new)
    - Load the JSON. For each zone, compare the array of `getOffsetInMinutes(t, zone)` and the array of `nextIntervalInSeconds(I, t, zone) - t` with the recorded arrays using `toEqual`
    - Run it on Node.js 22.23.2, 24.15.0, and 26.10.0
    - **EXPECTED OUTCOME:** PASS on all three
    - _Requirements: 6.6, 10.6, 10.7_

  - [x] 5.4 Write the property tests
    - **File:** `test/cache/time-utils/property/time-utils-property-tests.jest.mjs` (new)
    - Properties 1 to 7 and the Property 7 premise guard, exactly as in design.md "Correctness properties"
    - Generators are valid by construction. Use `fc.pre` only where the design does, in Properties 2 and 6
    - `numRuns`: 1000 for Properties 1 and 3, 200 for the others. **Do NOT pass a `seed` option**
    - Property 4 mocks `Date.now()` inside the predicate and restores it before returning
    - _Requirements: 11.4, 11.9, 11.10_

  - [x] 5.5 Write the Temporal oracle property test
    - **File:** `test/cache/time-utils/property/time-utils-temporal-oracle-property-tests.jest.mjs` (new)
    - Property 8 inside `(nativeTemporal() ? describe : describe.skip)(...)`, with `numRuns: 1000` and no `seed`
    - Run it on Node.js 24.15.0 and 26.10.0
    - **EXPECTED OUTCOME:** reported as skipped on 24 and PASS on 26
    - _Requirements: 11.5, 11.9, 11.10_

  - [x] 5.6 Write the lifecycle child-process tests
    - **File:** `test/cache/time-utils/integration/time-utils-lifecycle-tests.jest.mjs` (new), using the `time-utils-init` scenario
    - Every case in design.md's list for this file. Pass env var values through the runner's `env` overrides
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.3, 3.4, 4.1, 4.2, 11.6, 12.2_

  - [x] 5.7 Run the TimeUtils tests
    - Run every file from 5.2 to 5.6
    - **EXPECTED OUTCOME:** all PASS, with 5.5 skipped on Node.js 24
    - `npx eslint` on the class and the five new test files reports 0 errors
    - _Requirements: 11.3, 11.4, 11.5, 11.13_

- [x] 6. Integrate TimeUtils into `src/lib/dao-cache.js`
  - Follow design.md "Changes in `src/lib/dao-cache.js`" exactly. The subtasks edit the same file, so run them in order

  - [x] 6.1 Swap the require and wire `Cache.init()`
    - Replace `const moment = require('moment-timezone');` with `const TimeUtils = require("./utils/TimeUtils.class.js");`
    - Add the design's `try`/`catch` around `TimeUtils.init({ timezone: parameters.timeZoneForInterval })` directly after the parameters-object check, before `#idHashAlgorithm` is assigned
    - _Requirements: 3.5, 3.6, 8.1, 9.1_

  - [x] 6.2 Remove timezone handling from `CacheData`
    - Remove `#timeZoneForInterval`, `#offsetInMinutes`, the `CACHE_DATA_TIME_ZONE_FOR_INTERVAL` block, and the `_setOffsetInMinutes()` call in `init()`
    - Remove the seven methods listed in the design
    - `info()` reports `timeZoneForInterval`, `offsetInMinutes`, and `tzDataVersion` from TimeUtils
    - `write()` uses `TimeUtils.generateInternetFormattedDate()`
    - _Requirements: 8.2, 8.4, 8.8_

  - [x] 6.3 Re-point the `Cache` call sites
    - Make every change in the design's `Cache` table: the constructor, `testInterval()`, the three wrappers, `calculateSecondsLeftUntilExpires()`, and `isExpired()` with its `expires === 0` check
    - The wrappers pass exactly two arguments to TimeUtils
    - _Requirements: 7.8, 8.5, 8.6, 8.7_

  - [x] 6.4 Update the JSDoc
    - Follow design.md "Documentation design", JSDoc:
      - `Cache.init()`: the `timeZoneForInterval` `@param` and two `@throws` lines
      - `CacheData.init()`: remove its timezone `@param` and `@throws`
      - the three wrappers
      - `testInterval()` and `info()`, mentioning `tzDataVersion`
      - `CacheData.info()`
    - Correct three errors: the `nextIntervalInSeconds` alignment rule, the `parseToSeconds` examples (`1627475051`), and the claim that unparsable input returns 0 when it returned `NaN`
    - Parameter names match the signatures. Nothing refers to a removed `CacheData` method
    - _Requirements: 13.2, 13.3, 13.4_

  - [x] 6.5 Add the delegation checks
    - Add a `describe("delegation")` block to `test/cache/time-utils/integration/time-utils-cache-api-tests.jest.mjs`. It imports TimeUtils and checks that `Cache.generateInternetFormattedDate`, `Cache.nextIntervalInSeconds`, and `Cache.parseToSeconds` return what TimeUtils returns, over a sample of arguments that includes 0 and omitted timestamps under a mocked `Date.now()`
    - _Requirements: 8.6_

  - [x] 6.6 Lint `dao-cache.js`
    - `npx eslint src/lib/dao-cache.js`
    - **EXPECTED OUTCOME:** 20 or fewer errors, with no new rule or location. The baseline was 21
    - _Requirements: 11.13_

- [x] 7. Verify the integration

  - [x] 7.1 Re-run the defect tests
    - **IMPORTANT:** re-run the SAME tests from task 4. Do NOT modify them
    - **EXPECTED OUTCOME:** all PASS
    - _Requirements: 2.2, 3.5, 3.6, 5.3, 7.4 to 7.6, 7.8, 8.1, 8.3, 8.8, 11.2_

  - [x] 7.2 Re-run the preservation tests
    - **IMPORTANT:** re-run the SAME tests from task 3. Do NOT modify them
    - **EXPECTED OUTCOME:** all PASS. A test that needs editing means the public contract broke. Stop and reassess
    - _Requirements: 8.6, 8.7, 12.2, 12.3_

  - [x] 7.3 Re-run the TimeUtils tests
    - Every file from task 5, plus the delegation block from 6.5
    - **EXPECTED OUTCOME:** all PASS, including the fixture replay
    - _Requirements: 6.6, 8.6, 10.6_

  - [x] 7.4 Run the documentation validation tests
    - Run `test/documentation/`
    - **EXPECTED OUTCOME:** all PASS, including the JSDoc checks on `dao-cache.js` and the configuration-coverage test
    - _Requirements: 13.9_

- [x] 8. Checkpoint: full suite
  - Run `npm test`
  - **EXPECTED OUTCOME:** everything passes except failures recorded as pre-existing in 1.1
  - `git status`: the only modified existing files are `src/lib/dao-cache.js` and `test/cache/cache-validation-tests.jest.mjs`
  - If another existing test fails, treat it as a design problem: stop and bring it to the user. Don't edit existing tests
  - Ask the user if questions arise
  - _Requirements: 11.1_

- [x] 9. Remove the `moment-timezone` dependency
  - **Precondition:** the fixture from 1.3 is committed (Requirement 9.5). If it isn't, ask the maintainer before continuing

  - [x] 9.1 Uninstall the package
    - Run `npm uninstall moment-timezone`. This changes `package.json` and `package-lock.json`, and reinstalling reverses it
    - `package.json` declares no runtime dependencies. `npm ls moment moment-timezone` lists neither. `node -e "require('./src/index.js')"` loads cleanly
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 9.2 Update the dependency test
    - **File:** `test/powertools/integration/backwards-compatibility-tests.jest.mjs`, following the design's diff
    - Leave the `object-hash` and Powertools tests untouched
    - _Requirements: 9.4_

  - [x] 9.3 Write the source and dependency tests
    - **File:** `test/cache/time-utils/unit/time-utils-source-and-dependency-tests.jest.mjs` (new)
    - Every item in design.md's list for this file
    - _Requirements: 1.3, 1.5, 8.4, 9.1, 9.2, 9.3, 12.1_

  - [x] 9.4 Verify the removal
    - Run the files from 9.2 and 9.3, the fixture replay, and `test/cache/time-utils/`
    - **EXPECTED OUTCOME:** all PASS. Nothing needs `moment-timezone` anymore
    - _Requirements: 9.1 to 9.5, 10.6_

- [x] 10. Update the types
  - **File:** `types/lib/dao-cache.d.ts`: add `tzDataVersion: string | null` and `saltSource: "sharedCacheId" | "AWS_LAMBDA_FUNCTION_NAME" | "none"` to the `Cache.info()` return type. Update the doc comments for `timeZoneForInterval?`, `nextIntervalInSeconds`, and `parseToSeconds` to match the JSDoc. No other declaration changes
  - **File:** `test/types/consumer-cache-info.ts` (new), following design.md
  - Run `npm run test:types`
  - **EXPECTED OUTCOME:** PASS
  - _Requirements: 11.14, 12.4_

- [x] 11. Update the documentation

  - [x] 11.1 Update the cache feature README
    - **File:** `docs/features/cache/README.md`
    - Rewrite the `timeZoneForInterval` row of the configuration table, and add `### Interval-Based Expiration` after `### Expiration Handling`, following design.md
    - The example includes its `require`
    - Describe behavior, not TimeUtils internals. Don't mention `TestHarness`
    - _Requirements: 13.5, 13.6, 13.8_

  - [x] 11.2 Write the technical doc
    - **File:** `docs/technical/interval-expiration.md` (new), following the design's outline and modeled on `docs/technical/cache-key-hashing.md`
    - Link it from the new README subsection and back to the README
    - _Requirements: 13.7_

  - [x] 11.3 Run the documentation validation tests
    - Run `test/documentation/`
    - **EXPECTED OUTCOME:** all PASS, including the example, link, and configuration-coverage tests
    - _Requirements: 13.9_

- [x] 12. Update `CHANGELOG.md`
  - Append the entries from design.md "CHANGELOG" to the existing `### Added`, `### Changed`, `### Fixed`, and `### Removed` sections under `## v1.4.0 (unreleased)`, each linking the spec
  - Modify no existing text. Add no entry for test-only changes
  - _Requirements: 14.1, 14.2_

- [x] 13. Final checkpoint

  - [x] 13.1 Run the full verification
    - Run `npm test` and `npm run test:types` on Node.js 24.15.0
    - Run `npx eslint` on each file:
      - `dao-cache.js`: 20 or fewer errors
      - `cache-validation-tests.jest.mjs`: 11
      - `backwards-compatibility-tests.jest.mjs`: 1
      - every new `.js`, `.cjs`, and `.mjs` file: 0. That includes the generator, the child script, the runner, the oracles module, and the eight new test files
    - Confirm `package.json` still reads `1.4.0`, and that the export names of `src/index.js` and `src/lib/tools/index.js` are unchanged
    - _Requirements: 11.1, 11.13, 12.1, 12.5_

  - [x] 13.2 Run the cross-runtime check
    - Run `test/cache/time-utils/` and `test/cache/cache-validation-tests.jest.mjs` on Node.js 22.23.2 and 26.10.0
    - **EXPECTED OUTCOME:** all PASS. Property 8 runs on 26 and is skipped on 22
    - _Requirements: 10.7, 11.5, 11.12_

  - [x] 13.3 Check the package contents
    - `npm pack --dry-run` includes `src/lib/utils/TimeUtils.class.js`, and lists no `.kiro/` or `test/` paths
    - `package.json` has no `dependencies`
    - _Requirements: 1.1, 9.2, 10.8_

  - [x] 13.4 Check hygiene
    - No stray node processes: `ps aux | grep -E "time-utils-child|jest" | grep -v grep`. No temp files left behind
    - `git status` shows only the files in design.md's file table. Report anything else to the user rather than reverting it
    - Every new test file is under `test/cache/time-utils/` in `unit/`, `property/`, or `integration/`, and is named `*-tests.jest.mjs` or `*-property-tests.jest.mjs`
    - _Requirements: 11.9, 11.11_

  - [x] 13.5 Ask the user before any commit, tag, or publish
    - Don't commit, tag, publish, or push without explicit instruction

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.3", "2.3"] },
    { "id": 2, "tasks": ["3.1", "4.3", "5.1"] },
    { "id": 3, "tasks": ["3.2", "4.1", "4.2", "5.2", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 4, "tasks": ["4.4", "5.7"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2"] },
    { "id": 7, "tasks": ["6.3"] },
    { "id": 8, "tasks": ["6.4", "6.5"] },
    { "id": 9, "tasks": ["6.6", "7.1", "7.2", "7.3", "7.4"] },
    { "id": 10, "tasks": ["8"] },
    { "id": 11, "tasks": ["9.1"] },
    { "id": 12, "tasks": ["9.2", "9.3"] },
    { "id": 13, "tasks": ["9.4"] },
    { "id": 14, "tasks": ["10", "11.1", "11.2", "12"] },
    { "id": 15, "tasks": ["11.3"] },
    { "id": 16, "tasks": ["13.1", "13.2", "13.3", "13.4"] },
    { "id": 17, "tasks": ["13.5"] }
  ]
}
```

Rendered view of the same ordering:

```
1  baseline + golden fixture (pre-change code) ──────────────────────────┐
2  oracles, child script, runner ─┬─> 3  preservation tests (PASS now)    │
                                  ├─> 4  defect tests (FAIL now)          │
                                  └─> 5  TimeUtils + unit/property tests  │
                                                                          v
                                   6  integrate into dao-cache.js (6.1 → 6.2 → 6.3 → 6.4/6.5 → 6.6)
                                                                          v
                                   7  re-run 3, 4, 5 unmodified; documentation tests
                                                                          v
                                   8  CHECKPOINT: npm test
                                                                          v
                                   9  npm uninstall moment-timezone (fixture committed first)
                                                                          v
                        10 types ─ 11 docs ─ 12 CHANGELOG   (parallel)
                                                                          v
                                   13 final checkpoint
```

**Critical path:** 1 → 2 → 4 → 6 → 7 → 8 → 9 → 13.

**Ordering constraints:**

- Task 1 must finish before task 6, because the generator loads the pre-change `dao-cache.js`. Task 1.1 must also finish before task 4.3 edits an existing test file.
- Task 4.4 must run before task 6, so the defects are observed on the current code.
- Task 5 depends only on task 2, plus 1.3 for the fixture replay, so it can run alongside tasks 3 and 4.
- Tasks 3.1, 4.1, and 6.5 add blocks to the same test file, in that order.
- Task 8 is a hard gate: the full suite must be green, with existing tests edited only by 4.3, before the dependency is removed.
- Task 9 also waits for the fixture to be committed.
- Tasks 10, 11, and 12 are independent of each other.

## Notes

### Property to task map

| Property | Written in | Verified in |
|---|---|---|
| P1 — Bounds and local alignment | 5.4 | 5.7, 7.3, 13.2 |
| P2 — Boundaries are fixed points | 5.4 | 5.7, 7.3, 13.2 |
| P3 — The offset agrees with the oracle | 5.4 | 5.7, 7.3, 13.2 |
| P4 — An omitted timestamp means now | 5.4 | 5.7, 7.3, 13.2 |
| P5 — Conversions and formatting | 5.4 | 5.7, 7.3, 13.2 |
| P6 — Parsing | 5.4 | 5.7, 7.3, 13.2 |
| P7 — Resolution follows the rules | 5.4 | 5.7, 7.3, 13.2 |
| P8 — Temporal agrees (Node.js 26 or later) | 5.5 | 5.5 and 13.2 on Node.js 26; skipped on 22 and 24 |
| Golden fixture replay (example-based) | Data in 1.3, test in 5.3 | 5.3 on all three runtimes, 7.3, 9.4 |

### Requirement to task map

| Requirement | Tasks |
|---|---|
| 1. Internal TimeUtils class | 5.1, 5.2, 9.3, 13.3 |
| 2. Timezone resolution | 4.2, 4.3, 5.1, 5.2, 5.4, 5.6 |
| 3. Invalid timezone | 4.2, 4.3, 5.1, 5.2, 5.4, 5.6, 6.1 |
| 4. TimeUtils lifecycle | 5.1, 5.2, 5.6 |
| 5. Offset | 4.1, 4.2, 5.1, 5.2, 5.4, 5.5 |
| 6. Interval boundaries | 1.3, 5.1, 5.2, 5.3, 5.4 |
| 7. Conversion, formatting, and parsing | 4.1, 5.1, 5.2, 5.4, 6.3 |
| 8. Cache integration | 3.1, 4.1, 4.2, 6.1 to 6.5, 9.3 |
| 9. Remove the moment-timezone dependency | 1.3, 9 |
| 10. Golden fixture | 1.2, 1.3, 5.3, 13.2 |
| 11. Verification and tests | 1.1, 2, 3, 4, 5, 6.6, 7, 8, 13 |
| 12. Backwards compatibility | 3.1, 5.6, 7.2, 9.3, 10, 13.1 |
| 13. Documentation | 5.1, 6.4, 7.4, 10, 11 |
| 14. Changelog | 12 |

### Related documentation

- [requirements.md](requirements.md) - the 14 requirements these tasks satisfy
- [design.md](design.md) - components, the test design, and the eight correctness properties
- [PLAN.md](PLAN.md) - the Decision Log (Q1 to Q13, Rounds 1 to 4)
