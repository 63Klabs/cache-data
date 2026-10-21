# Implementation Plan

## Overview

Ordering follows [design.md](design.md). Tasks 1 through 5 run before any source change: they unblock local full-suite runs (Q14), build the child-process test infrastructure, write preservation tests that pass on the current code, write lazy-behavior tests that fail on the current code (proving they detect eager loading), and validate the benchmark harness. Tasks 6 through 8 make the source change and verify it. Tasks 9 through 12 close out types, docs, benchmark results, and the changelog. Task 13 is the final gate.

**Test execution**: use `node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` for one file, or `npm test` from the terminal for the suite. A bare `npx jest` fails on ESM. Never invoke `npm test` from inside a test file.

**Uncommitted changes**: task 1 is done, so `test/migration/property/test-migration-completeness-property-tests.jest.mjs` no longer fails when `src/lib/tools/AWS.classes.js` has uncommitted changes (Q14). It still fails for uncommitted changes to `ApiRequest.class.js` or `dao-endpoint.js`, which this spec doesn't touch.

**Linting**: the repository isn't lint-clean (existing test files report `no-undef` for `expect`), so lint only the files this spec touches: `npx eslint <files>`. `npm run lint` fails for reasons outside this spec.

## Tasks

- [x] 1. Remove `AWS.classes.js` from the migration immutability guard (Q14)
  - **File**: `test/migration/property/test-migration-completeness-property-tests.jest.mjs`
  - In Property 7, remove `'src/lib/tools/AWS.classes.js'` from `sourceFiles` and leave the comment shown in design.md's "Migration test change (Q14)"
  - Change nothing else in the file. This is the only edit to an existing test file in this spec
  - Run the file directly
  - **EXPECTED OUTCOME**: PASS
  - _Requirements: 9.1_

- [x] 2. Build the child-process test infrastructure
  - See design.md "Testing strategy" for the full specification of each file

  - [x] 2.1 Add the shared package map
    - **File**: `test/tools/fixtures/service-packages.cjs` (new)
    - Export `SERVICE_PACKAGES` mapping `dynamo`, `s3`, `ssm`, and `secrets` to their packages, exactly as in the design
    - _Requirements: 9.3, 9.4_

  - [x] 2.2 Add the shared-config fixture
    - **File**: `test/tools/fixtures/aws-config-eu-west-3.ini` (new)
    - A `[default]` profile with `region = eu-west-3` and nothing else; no credentials
    - _Requirements: 9.6_

  - [x] 2.3 Write the child script
    - **File**: `test/tools/fixtures/aws-classes-child.cjs` (new)
    - Implement every scenario in the design's child-script table: `load-sequence`, `region-warning`, `region-source`, `provider-timing`, `xray-exports`, `xray-counts`, `v2-guard`, `v2-entry`, `missing-one`, `missing-all`
    - Read the scenario from `process.argv[2]` and its arguments from `process.argv[3]` as JSON. Never build code from inputs
    - Print exactly one `RESULT:` line carrying JSON
    - Every scenario except `v2-entry` catches errors thrown while loading the module and reports them, so on the current code the tests fail on assertions rather than on a crashed child. `v2-entry` deliberately doesn't catch, so its exit status and stderr are what a consumer would see
    - Detect loaded packages by scanning `require.cache` keys for `/node_modules/<package>/`, with paths normalized to `/`, using the shared map from 2.1
    - CommonJS with `require` only; lint-clean under `eslint.config.js`
    - Spot-check from the terminal on the current code: `load-sequence` with `{"reads":[]}` prints a `RESULT:` line whose `atLoad` lists the four eagerly loaded packages
    - _Requirements: 9.3, 9.5, 9.6, 9.7, 9.8_

  - [x] 2.4 Write the runner
    - **File**: `test/helpers/aws-classes-child-runner.mjs` (new)
    - `runChild(scenario, args, { env, timeout })` per the design: `execFileSync(process.execPath, [childPath, scenario, JSON.stringify(args)])`, `cwd` at the repository root, default timeout 20000 ms
    - Child environment: copy `process.env`, delete `CacheData_AWSXRayOn` and `CACHE_DATA_AWS_X_RAY_ON`, set `AWS_REGION=us-east-1`, then apply overrides, where `undefined` deletes the key
    - Catch a non-zero exit and return `{ status, stdout, stderr, result }`; rethrow a timeout or spawn failure, which has no numeric `status`
    - `result` is the JSON after the last `RESULT:` line, or `null`
    - Re-export `PROJECT_ROOT` and `SERVICE_PACKAGES`
    - Add `// >!` comments explaining that `execFileSync` with an argument array avoids shell interpretation, per `secure-coding-practices.md`
    - _Requirements: 9.9_

- [x] 3. Write preservation tests (BEFORE the source change)
  - **IMPORTANT**: Observation-first. These encode today's contract and MUST PASS on the current code. They must keep passing after the conversion
  - Every new test file imports `describe`, `it`, `expect`, `jest`, and hooks from `@jest/globals` and calls `jest.restoreAllMocks()` in `afterEach`

  - [x] 3.1 Write in-process accessor contract tests
    - **File**: `test/tools/aws-lazy-accessor-tests.jest.mjs` (new)
    - For each of `dynamo`, `s3`, and `ssm`:
      - The property descriptor is an accessor with a `get` function and no `value`, before and after the first read
      - Two reads return different outer objects but the same `client` and the same `sdk`
      - `Object.keys()` of the accessor and of its `sdk` equal the exact lists in Requirement 3
      - Each verb sends a command with the expected `constructor.name` and `input === params`, and returns the promise `send()` returned. Spy with `jest.spyOn(AWS.<svc>.client, 'send').mockReturnValue(promise)`
      - A verb destructured from one read still works when called later
      - `jest.spyOn(AWS, '<svc>', 'get').mockReturnValue(mock)` makes `AWS.<svc>` return `mock`, and after `jest.restoreAllMocks()` the real accessor returns again
    - `await AWS.dynamo.client.config.region()` and `await AWS.ssm.client.config.region()` equal `AWS.REGION`
    - `AWS.s3.client` is an instance of `AWS.s3.sdk.S3` and has a `getObject` function
    - `AWS.dynamo.client.config.translateConfig` is `undefined`
    - `Object.getOwnPropertyNames(AWS).sort()` equals the snapshot in design.md "Pre-design measurements"
    - Don't add the S3 region assertion here; it's new behavior and belongs to task 4.1
    - _Requirements: 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.3, 8.3_

  - [x] 3.2 Write X-Ray export preservation tests
    - **File**: `test/tools/aws-xray-load-tests.jest.mjs` (new)
    - `xray-exports` with `CACHE_DATA_AWS_X_RAY_ON=true`, and again with `CacheData_AWSXRayOn=true`: `AWSXRay` is non-null with a `captureAWSv3Client` function; `tools.AwsXRay`, `tools.AWS.XRay`, and the `AWS.classes.js` `AWSXRay` and `AwsXRay` exports are all identical to `tools.AWSXRay`; `aws-xray-sdk-core` is loaded
    - `xray-exports` with both unset: every binding is `null`, and `aws-xray-sdk-core` is not loaded
    - `xray-exports` with `blockXray` and `CACHE_DATA_AWS_X_RAY_ON=true`: the entry loads and `AWSXRay` is `null`
    - In every case, the export names of `AWS.classes.js` are exactly `AWS`, `Aws`, `AWSXRay`, `AwsXRay`
    - Don't assert anything about service-client packages here; that's task 4.3
    - Each child-process `it` sets a 60000 ms timeout
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.7, 8.1_

  - [x] 3.3 Run the preservation baseline on the current code
    - Run both new files, plus the existing `test/tools/aws-classes-tests.jest.mjs`, which must not be modified
    - **EXPECTED OUTCOME**: All PASS. A failure means a test misreads today's contract; fix the test, not `AWS.classes.js`
    - _Requirements: 9.1, 9.2_

- [x] 4. Write lazy-behavior tests (BEFORE the source change)
  - **CRITICAL**: These encode the new behavior and MUST FAIL on the current code. The failures confirm the tests detect eager loading
  - **DO NOT change `AWS.classes.js` in this task, and don't weaken a test to make it pass on the current code**
  - Each child-process `it` sets a 60000 ms timeout; the property test sets 120000 ms

  - [x] 4.1 Write in-process region and SDK v2 guard tests
    - Add a separate `describe` block to `test/tools/aws-lazy-accessor-tests.jest.mjs`: `await AWS.s3.client.config.region()` equals `AWS.REGION`
    - **File**: `test/tools/aws-lazy-v2-guard-tests.jest.mjs` (new)
      - With `jest.spyOn(AWS, 'SDK_V3', 'get').mockReturnValue(false)` set in each test, reading `AWS.dynamo`, `AWS.s3`, or `AWS.ssm` throws an `Error` whose message equals the SDK v2 guard message exactly, on two consecutive reads
      - `AWS.secrets` does not throw under the same spy
    - _Requirements: 4.2, 6.1, 6.3_

  - [x] 4.2 Write child-process loading tests
    - **File**: `test/tools/aws-lazy-loading-tests.jest.mjs` (new)
    - `load-sequence` with an empty sequence, then `['dynamo']`, `['s3']`, `['ssm']`, and all four accessors: `atLoad` is empty, and `afterReads` equals the expected packages from `SERVICE_PACKAGES`
    - `load-sequence` with an empty sequence and `CACHE_DATA_AWS_X_RAY_ON=true`: `atLoad` is empty
    - `region-warning` with `AWS_REGION` set to `undefined`: message counts of 0 after load, 1 after reading `s3`, and 1 after reading `ssm`
    - `region-source` with `AWS_REGION`, `AWS_DEFAULT_REGION`, and `AWS_PROFILE` set to `undefined`, `AWS_CONFIG_FILE` set to the 2.2 fixture, and `AWS_SHARED_CREDENTIALS_FILE` set to a path that doesn't exist: `AWS.REGION` and all three clients resolve `us-east-1`
    - `provider-timing`: the fake provider received exactly `['S3', 'SSMClient']`
    - `v2-guard`: the module loads, `SDK_V3` is `false`, each converted accessor throws the exact SDK v2 guard message on both reads, no service-client package was loaded before `secrets` was read, and `secrets.available` is `true`
    - `v2-entry`: exit status 1, with stderr containing `Node.js version 22 or higher is required` and not `AWS SDK v2 is no longer supported`
    - `missing-one`: the entry loads; both blocked `s3` reads throw with code `MODULE_NOT_FOUND`; `ssm` works while `s3` is blocked; after resolution is restored, `s3` returns a client and its keys are exactly `client`, `put`, `get`, `sdk`
    - `missing-all`: the entry loads; each converted accessor throws with code `MODULE_NOT_FOUND`; `secrets.available` is `false`
    - _Requirements: 1.3, 1.4, 4.2, 4.4, 4.5, 4.6, 4.7, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.3 Write X-Ray load-time tests for lazy clients
    - Add to `test/tools/aws-xray-load-tests.jest.mjs`
    - `xray-exports` with `CACHE_DATA_AWS_X_RAY_ON=true`: no service-client package is loaded
    - `xray-counts` with `CACHE_DATA_AWS_X_RAY_ON=true`: 2 `captureHTTPsGlobal` calls in total; `captureAWSv3Client` calls equal 0 after load, 1 after reading `s3` twice, and 2 after reading `dynamo`; the `s3` and `dynamo` clients carry `XRaySDKInstrumentation` middleware
    - `xray-counts` with both X-Ray variables unset: no calls and no middleware
    - _Requirements: 1.3, 4.6, 5.1, 5.6_

  - [x] 4.4 Write the property test
    - **File**: `test/tools/property/aws-lazy-accessor-property-tests.jest.mjs` (new)
    - Properties 1 and 2 from the design, asserted together on each generated sequence through `load-sequence`
    - Generator: `fc.array(fc.constantFrom('dynamo', 's3', 'ssm', 'secrets'), { maxLength: 8 })`, with no filter
    - Options: `{ numRuns: 10, endOnFailure: true }`. **Do NOT pass a `seed` option**
    - Do not register the arbitrary in `AUDITED_ARBITRARIES`
    - _Requirements: 1.3, 1.4, 2.3, 3.2, 9.4, 9.9, 9.10_

  - [x] 4.5 Run the lazy-behavior tests on the current code
    - **EXPECTED OUTCOME**: The following FAIL. Record the observed failure for each in this task's completion notes:
      - In-process S3 region: rejects with a missing-region error where `AWS_REGION` is unset, as in CI. Where it's set, it passes, because the SDK reads the variable; this test can only discriminate without it
      - In-process v2 guard: the accessors return clients built at import and don't throw
      - `load-sequence`: `atLoad` lists the four eagerly loaded packages
      - `region-warning`: the count is already 1 at load
      - `region-source`: S3 resolves `eu-west-3` from the shared config
      - `provider-timing`: the fake provider receives nothing, because the clients were built at import
      - `v2-guard`: the module throws while loading
      - `v2-entry`: stderr carries the SDK v2 error instead of the Node.js 22 floor message
      - `missing-one` and `missing-all`: the entry fails to load
      - `xray-exports` with X-Ray enabled: four service-client packages are already loaded
      - `xray-counts` with X-Ray enabled: `captureAWSv3Client` was already called 3 times at load
      - Property test: Property 1 fails on the first run
    - **EXPECTED TO PASS** on the current code: `xray-counts` with X-Ray disabled
    - Confirm each child-process file finishes in under 2 minutes and leaves no stray processes: `ps aux | grep -E "aws-classes-child|jest" | grep -v grep`
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_
    - **Completion notes** (2026-10-21, `db7953c`, Node.js v24.13.0, linux arm64):
      - Ran each file separately with `timeout 120 node --experimental-vm-modules node_modules/jest/bin/jest.js <file>` in a CI-like environment: `AWS_REGION`, `AWS_DEFAULT_REGION`, and `AWS_PROFILE` unset, and `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` pointed at paths that don't exist. This machine's `~/.aws/config` names regions; a CI runner has no such file
      - Result: 20 failed and 33 passed across the five files. Every expected failure failed, for the expected reason:
        - In-process S3 region: rejected with `Region is missing`
        - In-process v2 guard: `dynamo`, `s3`, and `ssm` all returned without throwing, so `errorFromRead()` returned `null`
        - `load-sequence`, all six cases including X-Ray enabled: `atLoad` was `@aws-sdk/client-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/client-ssm`, `@aws-sdk/lib-dynamodb`
        - `region-warning`: counts of 1, 1, 1 instead of 0, 1, 1
        - `region-source`: S3 resolved `eu-west-3`; `dynamo` and `ssm` resolved `us-east-1`
        - `provider-timing`: the fake provider received `[]`
        - `v2-guard`: `moduleLoaded` was `false`, and `loadError` was the SDK v2 guard message
        - `v2-entry`: stderr carried the SDK v2 error thrown from `AWS.classes.js:373`, with no Node.js 22 floor message
        - `missing-one` and `missing-all`: `entryLoaded` was `false`, with `MODULE_NOT_FOUND` for `@aws-sdk/client-s3` and `@aws-sdk/client-dynamodb` respectively
        - `xray-exports` with X-Ray enabled: the same four packages were loaded at import
        - `xray-counts` with X-Ray enabled: `captureAWSv3Client` was already 3 at load; `captureHTTPsGlobal` was 2, as expected
        - Property test: failed on its first run with counterexample `[["secrets","dynamo"]]`, not shrunk (`endOnFailure`)
      - Passed: `xray-counts` with X-Ray disabled, as expected, plus the 27 accessor and 4 X-Ray preservation tests. `AWS.secrets does not throw while SDK_V3 is false` also passed. That's correct, because Req 6.3 is preserved behavior, but the pass list above omits it
      - Local environment: with this machine's own settings (`AWS_REGION` unset, `~/.aws/config` present), the in-process S3 region test passes on the current code, because the default profile's region matches the `us-east-1` fallback. `region-source` still covers Req 4.2 on any machine, since it supplies its own config file
      - Every file finished in under 1.5 s. A 0.5 s process sampler saw at most 3 Jest or child processes at once, and none were left after any run

- [x] 5. Build and validate the benchmark harness (BEFORE the source change)
  - See design.md "Benchmark design (Requirement 10)"

  - [x] 5.1 Write the timed child
    - **File**: `.kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/child-timer.cjs` (new)
    - Arguments: the entry path and a JSON array of accessor names. Take `process.hrtime.bigint()`, require the entry, read each listed accessor through `tools.AWS`, print `RESULT:{"ms":...}`
    - _Requirements: 10.2_

  - [x] 5.2 Write the driver
    - **File**: `.kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/lazy-accessor-coldstart.mjs` (new)
    - Options `--baseline <git-ref>` (required), `--candidate <dir>` (default: the repository root), `--runs <n>` (default 20), `--one <dynamo|s3|ssm>` (default `ssm`)
    - Extract the baseline with `git archive --format=tar -o <tmp>/baseline.tar <ref> src package.json` and `tar -xf`, both via `execFileSync` with argument arrays, into a directory from `fs.mkdtempSync(os.tmpdir())`
    - Run every child with `NODE_PATH=<repo>/node_modules` and `AWS_REGION=us-east-1`, with both X-Ray variables removed
    - Scenarios: import only; import plus `--one`; import plus `dynamo`, `s3`, and `ssm`
    - One discarded warm-up per root and scenario, then interleave baseline and candidate runs
    - Print a markdown table per scenario: run count, mean, median, min, and max for both roots, and the difference; plus the Node.js version, platform, and the baseline ref with its resolved SHA
    - Remove the temp directory in a `finally` block
    - Import everything it uses from `node:*` modules; lint-clean, because ESLint lints `.kiro/`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 5.3 Run an A/A validation
    - Run with `--baseline HEAD` while `src/` is still unchanged, so both sides are the same code
    - **EXPECTED OUTCOME**: every difference is small relative to the means, which shows the noise floor. Keep the output for `RESULTS.md`
    - Confirm the temp directory was removed
    - _Requirements: 10.3, 10.4_

- [ ] 6. Convert the accessors in `src/lib/tools/AWS.classes.js`
  - Follow design.md "Components and interfaces" exactly

  - [ ] 6.1 Add the memo fields, guard, and builders, and remove `#SDK`
    - Add `#dynamoSdk`, `#s3Sdk`, and `#ssmSdk` (each `null`, with `@private` JSDoc) beside `#secretsSdk` and before `#XRayOn`
    - Add `#assertSdkV3()` with the SDK v2 guard message, unchanged from today's text
    - Add `#buildDynamo()`, `#buildS3()`, and `#buildSsm()` as in the design. Each calls `#assertSdkV3()` first, then requires its packages, then constructs and instruments its client. S3 is `new S3({ region: AWS.REGION })`
    - Delete `static #SDK` and its JSDoc block
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 4.1, 4.2, 4.3, 4.4, 4.6, 6.1, 6.2, 7.2_

  - [ ] 6.2 Rewrite the `dynamo`, `s3`, and `ssm` getters
    - Build when the memo is `null`, then return a fresh literal that lists each property explicitly from the memo
    - Assign the memo only after the builder returns, so a throw leaves it `null`
    - Reference `AWS`, never `this`
    - Leave the `secrets` getter untouched
    - _Requirements: 2.1, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.9, 7.3, 7.4, 7.5_

  - [ ] 6.3 Initialize X-Ray at load
    - Change the `XRay` getter to `return initializeXRay();`
    - Between the end of the class and `module.exports`, add `if (USE_XRAY) { initializeXRay(); }` with the `//` line comment from the design. It must not be a JSDoc block
    - Leave `module.exports` unchanged
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ] 6.4 Update the JSDoc
    - `dynamo`, `s3`, `ssm` getters: a description of first-read construction and reuse; `@returns` with the exact shape (no `DynamoDB` in dynamo's `sdk`); `@throws {Error}` for the SDK v2 guard; `@throws {Error}` with code `MODULE_NOT_FOUND` when the package can't be loaded; an `@example`
    - `XRay` getter: `@returns {object|null}`, stating when each is returned; an `@example`
    - `@private` JSDoc on `#assertSdkV3()` and each builder
    - Class-level JSDoc: every Q15 correction listed in design.md "Documentation design"
    - Don't leave a JSDoc block directly before `constructor() {}`
    - _Requirements: 11.1, 11.2, 11.5_

  - [ ] 6.5 Lint the converted file
    - `npx eslint src/lib/tools/AWS.classes.js` reports no more than the 4 baseline errors (two unused `catch` bindings, unused `captureHttp`, unused `#XRayOn`), and none of a new kind
    - _Requirements: 9.12_

- [ ] 7. Verify the conversion

  - [ ] 7.1 Verify the lazy-behavior tests now pass
    - **IMPORTANT**: Re-run the SAME tests from task 4. Do NOT modify them
    - **EXPECTED OUTCOME**: All PASS, including `region-source` and the in-process S3 region test
    - _Requirements: 1.3, 1.4, 2.3, 3.2, 4.2, 4.4, 4.5, 4.6, 4.7, 5.1, 5.6, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 7.2 Verify the preservation tests still pass
    - **IMPORTANT**: Re-run the SAME tests from task 3, plus the unmodified `test/tools/aws-classes-tests.jest.mjs`
    - **EXPECTED OUTCOME**: All PASS with zero modifications. If any needs editing, the accessor contract has been broken. Stop and reassess
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 5.2, 5.3, 5.4, 5.5, 5.7, 8.1, 8.3_

  - [ ] 7.3 Run the documentation validation tests
    - `test/documentation/`
    - **EXPECTED OUTCOME**: All PASS with the new JSDoc
    - _Requirements: 11.6_

- [ ] 8. Checkpoint - full suite (Q6a gate)
  - Run `npm test`
  - Confirm with `git status` that the only modified existing files are `src/lib/tools/AWS.classes.js` and the task 1 migration test
  - If an existing test fails: the `TestHarness` reset in Requirement 8.3 is the approved fallback only for a test that needs a real client rebuilt under a changed environment. Any other failure is a design problem; stop and bring it to the user. Don't edit existing tests
  - Ask the user if questions arise
  - _Requirements: 8.3, 9.1_

- [ ] 9. Update the type definition comments
  - **File**: `types/lib/tools/index.d.ts`
  - Replace the `dynamo`, `s3`, and `ssm` doc comments with the wording in design.md, matching the existing `secrets` comment. No type changes
  - Run `npm run test:types`
  - **EXPECTED OUTCOME**: PASS
  - _Requirements: 8.2, 11.3_

- [ ] 10. Update the tools README
  - **File**: `docs/features/tools/README.md`, `tools.AWS` section, per design.md "Documentation design"
  - Replace the SDK-detection and Node.js version paragraph with: AWS SDK for JavaScript v3, Node.js 22 or later
  - Name Secrets Manager among the included SDKs
  - Add "When clients are created" with the module-scope example for the Lambda init phase (Q11)
  - In the S3 example, use `result.Body.transformToString()` and remove the commented-out v2 line beneath it
  - Change `AWS.dynamodb.put` and `AWS.dynamodb.get` to `AWS.dynamo.put` and `AWS.dynamo.get`
  - Don't mention `TestHarness`
  - Run `test/documentation/`
  - **EXPECTED OUTCOME**: PASS, including the example validation tests
  - _Requirements: 11.4, 11.5, 11.6, 11.7_

- [ ] 11. Run the benchmark and record the results
  - Run the driver from task 5 with `--baseline` set to the last commit before task 6 (`HEAD` if task 6 is still uncommitted)
  - **File**: `.kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/RESULTS.md`, created in task 5.3 with the A/A section: replace its "Before and after (task 11)" placeholder with the command, the environment, the before-and-after tables, and the first-read cost (the candidate's "all three" minus its "import only")
  - State plainly whether revisiting `Cache.init()` pre-warming (Q11 Option C) looks warranted. The decision belongs to the maintainer; don't implement it in this spec
  - Report the numbers to the user
  - Confirm the temp directory was removed
  - _Requirements: 10.6_

- [ ] 12. Update `CHANGELOG.md`
  - Under `## v1.4.0 (unreleased)`, `### Changed`: insert the entry from design.md before "**Documentation: cache-key generation corrected**"
  - Under `### Fixed`: append the documentation entry from design.md
  - Modify no existing text, and add no entry for the task 1 test edit
  - _Requirements: 12.1, 12.2_

- [ ] 13. Final checkpoint

  - [ ] 13.1 Run the full verification
    - `npm test` and `npm run test:types`
    - `npx eslint` on `src/lib/tools/AWS.classes.js` (4 or fewer errors, none new) and on every new JavaScript file: the two fixture scripts, the runner, the five test files, and both benchmark scripts (0 errors)
    - Confirm `package.json` still reads `1.4.0`
    - _Requirements: 8.4, 9.1, 9.12_

  - [ ] 13.2 Check the package contents
    - `npm pack --dry-run` lists no `.kiro/`, `test/`, or coverage paths and no dotfiles. `.npmignore` now mirrors `.gitignore`'s exclusions (changed outside this spec), so the new fixtures, benchmark scripts, and `RESULTS.md` must not appear
    - _Requirements: 10.5_

  - [ ] 13.3 Check hygiene
    - No stray node processes; no benchmark temp directories left in the system temp dir
    - `git status` shows only the files in design.md's file table, plus `.npmignore`, which was changed outside this spec. Report anything else to the user rather than reverting it
    - _Requirements: 9.9_

  - [ ] 13.4 Ask the user to confirm before any commit, tag, or publish
    - Do not commit, tag, or publish without explicit instruction

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1", "2.2", "5.1"] },
    { "id": 1, "tasks": ["2.3", "2.4", "5.2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "5.3"] },
    { "id": 3, "tasks": ["3.3"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["4.5"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2"] },
    { "id": 8, "tasks": ["6.3"] },
    { "id": 9, "tasks": ["6.4"] },
    { "id": 10, "tasks": ["6.5", "7.1", "7.2", "7.3"] },
    { "id": 11, "tasks": ["8"] },
    { "id": 12, "tasks": ["9", "10", "11", "12"] },
    { "id": 13, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 14, "tasks": ["13.4"] }
  ]
}
```

Rendered view of the same ordering:

```
1  migration guard edit (Q14) ──────────────────────────────┐
2  child-process infrastructure ─┬─> 3  preservation tests  │
                                 └─> 4  lazy-behavior tests ┤   (must FAIL on current code)
5  benchmark harness + A/A run ─────────────────────────────┤
                                                            v
                                     6  convert AWS.classes.js (6.1 → 6.2 → 6.3 → 6.4 → 6.5)
                                                            v
                                     7  re-run tasks 3 and 4 unmodified, plus docs tests
                                                            v
                                     8  CHECKPOINT: npm test
                                                            v
                         9 types ─ 10 README ─ 11 benchmark results ─ 12 CHANGELOG   (parallel)
                                                            v
                                     13 final checkpoint
```

Critical path: 2 → 4 → 6 → 7 → 8 → 13.

Tasks 1 and 5 have no dependency on tasks 2 through 4, but both must finish before task 6: task 1 so local full-suite runs work with uncommitted source changes, and task 5 so its A/A run measures the unchanged code.

Task 6's subtasks are sequential because they edit the same file.

Task 8 is a hard gate: the full suite must be green, with no existing test edited beyond task 1, before the docs and release work starts.

Tasks 9 through 12 are independent of each other. Task 11's numbers don't change the CHANGELOG text, which documents the module-scope approach (Q11 Option A) either way.

## Notes

### Property to task map

| Property | Written in | Fails on current code in | Verified in |
|---|---|---|---|
| P1 — Load isolation | 4.4 | 4.5 | 7.1 |
| P2 — Memo stability | 4.4 | Holds today; asserted with P1 in the same run | 7.1 |

### Requirement to task map

| Requirement | Tasks |
|---|---|
| 1. Service-client packages load only on first access | 4.2, 4.3, 4.4, 6.1, 7.1 |
| 2. Construction on first access and memoization | 3.1, 4.4, 6.1, 6.2, 7.1 |
| 3. Accessor shape and getter contract | 3.1, 6.2, 7.2 |
| 4. Client construction parity | 3.1, 4.1, 4.2, 4.3, 6.1, 7.1 |
| 5. X-Ray initialization at module load | 3.2, 4.3, 6.3, 7.1, 7.2 |
| 6. SDK v2 guard | 4.1, 4.2, 6.1, 7.1 |
| 7. Unavailable service-client package | 4.2, 6.1, 6.2, 7.1 |
| 8. Backwards compatibility | 3.1, 3.2, 8, 9, 13.1 |
| 9. Verification and tests | 1, 2, 3, 4, 6.5, 7, 8, 13 |
| 10. Cold-start benchmark | 5, 11, 13.2 |
| 11. Documentation | 6.4, 7.3, 9, 10 |
| 12. Changelog | 12 |

### Related documentation

- [requirements.md](requirements.md) - The 12 requirements these tasks satisfy
- [design.md](design.md) - Components, test design, and the two correctness properties
- [PLAN.md](PLAN.md) - The Decision Log (Q1 to Q15)
