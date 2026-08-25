# Implementation Plan

## Overview

Ordering follows the dependency graph in [design.md](design.md). Tasks 1 and 2 establish the test baseline before any source change. Tasks 3 through 6 remediate the live defects. Tasks 7 through 13 build the feature. Tasks 14 through 16 close out types, docs, and release.

**Test execution**: use `node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` or `npm test`. A bare `npx jest` fails on ESM. Never invoke `npm test` from inside a test file.

## Tasks

- [x] 1. Write preservation baseline tests (BEFORE any source change)
  - **IMPORTANT**: Follow observation-first methodology. Observe actual current behavior, then encode it.
  - **GOAL**: Lock the contracts that must survive the refactor so a violation fails loudly.
  - **Test file**: `test/config/property/legacy-seam-preservation-property-tests.jest.mjs`
  - **Legacy seam contract (Property 18)**:
    - Observe on CURRENT code: `AppConfig._initParameters([{group,path,names}])` resolves to a paramstore object, not a boolean
    - Observe on CURRENT code: `await AppConfig._ssmParameters` equals that same paramstore
    - Observe on CURRENT code: mocking via `AppConfig._initParameters = jest.fn().mockResolvedValue({...})` intercepts the `init()` path
    - Write property test: for all valid entry arrays, `_initParameters()` resolves to an object shaped `{group: {name: value}}`
    - Assert `_getParameters()` and `_getParametersFromStore()` resolve to the same shape
  - **Unresolved-value contract (Properties 14, 15)**:
    - Confirm the existing `test/config/cached-param-tostring-preservation-property-tests.jest.mjs` passes as-is; do not duplicate it
  - Run on CURRENT code
  - **EXPECTED OUTCOME**: Tests PASS (this is the baseline to preserve)
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 18.1, 18.2, 18.8, 18.11_

- [x] 2. Write bug condition exploration tests (BEFORE implementing fixes)
  - **CRITICAL**: These tests MUST FAIL on unfixed code. Failure confirms the defects exist.
  - **DO NOT attempt to fix the test or the code when it fails.**
  - **NOTE**: These tests encode expected behavior and will validate the fixes when they pass later.
  - **Test files**:
    - `test/security/property/prototype-reachable-key-property-tests.jest.mjs`
    - `test/utils/property/batching-pagination-property-tests.jest.mjs`
  - **Defect 1 - prototype-reachable group keys (Property 4)**:
    - Mock the `AWS.ssm` getter to return a parameter whose resolved group is `toString`
    - Assert the returned paramstore exposes that group via `Object.keys()`
    - Assert `Object.prototype.toString` gains NO own property
    - Use fast-check over `fc.constantFrom(...Object.getOwnPropertyNames(Object.prototype))`
    - _Bug_Condition: group IN Object.getOwnPropertyNames(Object.prototype) AND group NOT IN DANGEROUS_KEYS_
  - **Defect 2 - path pagination truncation (Property 7)**:
    - Mock `AWS.ssm.getByPath` to return 10 parameters plus a `NextToken`, then 5 more with no token
    - Assert all 15 parameters appear in the paramstore
    - _Bug_Condition: parameter count under a path exceeds 10_
  - **Defect 3 - name batching limit (Property 6)**:
    - Configure 15 enumerated names; mock `getByName` to reject with a ValidationException when `Names.length > 10`
    - Assert loading succeeds and all 15 are returned
    - _Bug_Condition: enumerated name count exceeds 10_
  - **Defect 4 - path mismatch TypeError (Property 10)**:
    - Configure `{group: "app", path: "/myapp/prod"}` with no trailing slash
    - Assert no `TypeError` is thrown and parameters are grouped correctly
    - _Bug_Condition: derived group path matches no configured entry_
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: All four FAIL. Document the observed failure for each.
  - _Requirements: 1.2, 1.3, 1.4, 3.1, 3.2, 3.4, 4.1, 4.2, 4.3, 5.2, 5.3, 5.4_

- [x] 3. Implement `ParameterKeySafety`
  - **File**: `src/lib/utils/ParameterKeySafety.class.js` (new, internal)

  - [x] 3.1 Implement key validation and path normalization
    - `DANGEROUS_KEYS` and `VALID_KEY_PATTERN` as module-scope constants, NOT allocated inside iteration
    - `isSafeKey(key)` and `checkKey(key)` returning `{safe, reason}`
    - `normalizePath(path)` producing exactly one trailing slash
    - `createAccumulator()` returning `Object.create(null)`
    - Add `// >!` security comments explaining why both denylist and allowlist are needed, since `__proto__` satisfies the allowlist pattern
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 3.3, 7.6_

  - [x] 3.2 Implement own-property-safe assignment
    - `setGrouped(store, group, name, value)` using `Object.prototype.hasOwnProperty.call`, never the `in` operator and never `obj.hasOwnProperty`
    - `setGroupedPath(store, group, segments, value)` per the design pseudocode, returning `{assigned, reason}`
    - Created nodes are plain `{}` so consumers keep inherited methods; only the accumulator is null-prototype
    - Detect shadow collisions on both the intermediate-node and leaf paths
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.6, 7.4, 7.5_

  - [x] 3.3 Implement prefix resolution and collision detection
    - `resolveGroupAndSegments(parameterName, normalizedEntries)` with entries pre-sorted by path length DESCENDING
    - Return null when no entry matches, and when segments exceed 1 for a non-recursive entry
    - `detectShadowCollisions(parameterNames)` as an order-independent pre-pass
    - _Requirements: 3.1, 6.4, 6.5, 6.6_

  - [x] 3.4 Add `@private` JSDoc and confirm no public export
    - Verify absent from `src/index.js`, `src/lib/tools/index.js`, and `types/`
    - _Requirements: 7.1, 7.2, 7.3, 19.7_

  - [x] 3.5 Write unit and property tests
    - **Test files**: `test/security/parameter-key-safety-tests.jest.mjs`, `test/utils/property/prefix-resolution-property-tests.jest.mjs`
    - Properties 1, 2, 3, 8, 9, 11
    - Include the design worked example: `/app/` recursive plus `/app/db/` non-recursive, asserting `/app/db/host` resolves to group `database`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 3.3, 6.4, 6.5, 6.6, 7.4, 7.5_

- [x] 4. Implement `ParameterStoreLoader`
  - **File**: `src/lib/utils/ParameterStoreLoader.class.js` (new, internal)

  - [x] 4.1 Implement name batching
    - Partition enumerated names into chunks of `MAX_NAMES_PER_CALL = 10`
    - Issue chunks in parallel bounded by `MAX_CONCURRENT_CALLS = 5`
    - Collect `InvalidParameters` per response, warn, omit from the store, do not throw
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Implement path discovery with pagination
    - Set `MaxResults: 10` explicitly on every request
    - Follow `NextToken` until absent, accumulating all pages
    - Set `Recursive: true` only when the entry opts in; default false
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3_

  - [x] 4.3 Implement grouping via `ParameterKeySafety`
    - Run `detectShadowCollisions` as a pre-pass before any assignment
    - Resolve each parameter with `resolveGroupAndSegments`; warn and skip on null
    - Throw for enumerated names failing validation; warn and skip for path-discovered names
    - Return `{store, skipped, invalid, collisions, pages}`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.5, 6.6, 7.7_

  - [x] 4.4 Write unit and property tests
    - **Test file**: `test/utils/parameter-store-loader-tests.jest.mjs`
    - Reuse the Property 6 and 7 tests from task 2; add unit coverage for `InvalidParameters` and collision reporting
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 5. Wire the legacy seam to the new loader and verify defects are fixed

  - [x] 5.1 Delegate `_getParametersFromStore` to `ParameterStoreLoader`
    - **File**: `src/lib/tools/index.js`
    - Replace inline retrieval and assignment with `ParameterStoreLoader.load(entries)`, returning `result.store`
    - Preserve the signature and the `{group: {name: value}}` return shape exactly
    - Keep `_getParameters` and `_initParameters` as pass-throughs with unchanged signatures
    - _Requirements: 7.7, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 5.2 Add `@deprecated` JSDoc and a once-per-process notice
    - Mark all three seam methods `@deprecated`, directing callers to `AppConfig.init({ssmParameters})` with `AppConfig.parameters()`
    - Log the notice at most once per process, keyed by method name in a module-level Set
    - _Requirements: 18.6, 18.7_

  - [x] 5.3 Verify bug condition tests now pass
    - **IMPORTANT**: Re-run the SAME tests from task 2. Do NOT write new tests.
    - **EXPECTED OUTCOME**: All four defect tests PASS
    - _Requirements: 1.2, 1.3, 1.4, 3.1, 3.2, 4.1, 5.2_

  - [x] 5.4 Verify preservation tests still pass unmodified
    - **IMPORTANT**: Re-run the SAME tests from task 1, plus the four existing `test/config/appconfig-async-init-*` files
    - **EXPECTED OUTCOME**: All PASS with zero modifications. If any file needs editing, the seam design has been violated. Stop and reassess.
    - _Requirements: 18.11, 21.10_

- [x] 6. Checkpoint - full suite after remediation
  - Run `npm test`
  - Confirm no regressions, and confirm via `git status` that the four `test/config/appconfig-async-init-*` files are unmodified
  - Ask the user if questions arise

- [x] 7. Add the lazy `AWS.secrets` accessor

  - [x] 7.1 Add `@aws-sdk/client-secrets-manager` to devDependencies
    - Pin to `^3.995.0`, matching the other AWS SDK entries
    - **DO NOT** add it to runtime `dependencies`
    - _Requirements: 8.9_

  - [x] 7.2 Implement the guarded lazy accessor
    - **File**: `src/lib/tools/AWS.classes.js`
    - Memoize in a private static `#secretsSdk`; `require` inside try/catch so an absent package does not throw at module load
    - Construct `SecretsManagerClient` with `{ region: AWS.REGION }` on first access, passed through `instrumentClient()`
    - Return a fresh object literal per access carrying `{client, get, sdk, available, reason}` so getter spying keeps working
    - **DO NOT** convert the getter to return a memoized singleton, and **DO NOT** add the require to the eager `#SDK` IIFE
    - Leave `dynamo`, `s3`, and `ssm` untouched
    - Update the class-level JSDoc `@property` list
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.10_

  - [x] 7.3 Write tests
    - **File**: `test/tools/aws-classes-tests.jest.mjs`, extending the existing `ssm` shape block
    - Assert shape parity with `ssm`, client memoization, and that `available` is false with a reason when the require fails
    - Assert no Secrets Manager require occurs until first access
    - _Requirements: 8.1, 8.3, 8.5, 8.6_

- [x] 8. Implement `ExtensionAvailability`
  - **File**: `src/lib/utils/ExtensionAvailability.class.js` (new, internal)

  - [x] 8.1 Implement the state machine and port resolution
    - Tri-state `unknown` / `available` / `unavailable` with a reason code
    - `setOverride()` evaluated before any heuristic
    - `evaluate()` applying the `AWS_SESSION_TOKEN` heuristic with no request issued
    - `port()` reading `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`, falling back to `CachedParameterSecret.port`
    - Keep the public statics `hostname` and `port` writable
    - `transportForRetrieval()`, `toObject()`, and a `reset()` test seam
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 8.2 Implement memoization
    - Resolve at most once per process; no re-probing after resolution
    - _Requirements: 9.9, 9.10_

  - [x] 8.3 Write tests
    - **Files**: `test/config/extension-availability-tests.jest.mjs`, `test/config/property/availability-determinism-property-tests.jest.mjs`
    - Properties 16 and 17
    - Call `ExtensionAvailability.reset()` in `beforeEach`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_

- [x] 9. Refactor the extension request for failure diagnosis
  - **File**: `src/lib/tools/CachedParametersSecrets.classes.js`

  - [x] 9.1 Return a discriminated result instead of collapsing to null
    - Result carries success plus a reason code distinguishing connection refusal, timeout, non-2xx, and parse failure
    - Inspect the HTTP status; a non-2xx is a failure even when the body parses as JSON
    - Preserve `error.code` from `req.on('error')` so ECONNREFUSED is distinguishable
    - Configure an explicit request timeout so the existing `req.on('timeout')` handler becomes reachable
    - Must never throw; always resolves
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 9.2 Classify outcomes into availability transitions
    - Connection errors and timeouts mark `unavailable` and permit fallback
    - **Non-2xx and unparseable 2xx mark `available` and do NOT fall back.** See the design decision: silent transport switching on auth failure would mask misconfiguration and double latency
    - _Requirements: 9.8, 10.2, 10.3_

  - [x] 9.3 Write the extension mock helper
    - **File**: `test/helpers/extension-mock.mjs`
    - Factories for 2xx SSM body, 2xx secret body, ECONNREFUSED, timeout, non-2xx with JSON body, and 2xx with malformed body
    - _Requirements: 21.1_

- [x] 10. Implement the SDK fallback transport
  - **File**: `src/lib/tools/CachedParametersSecrets.classes.js`

  - [x] 10.1 Verify no require cycle
    - This file will import `AWS.classes.js` for the first time
    - If a cycle appears, require `AWS` lazily inside the retrieval method
    - _Requirements: 11.3, 11.4_

  - [x] 10.2 Add `_requestFromSdk()` with wrapper normalization
    - `CachedSsmParameter`: `AWS.ssm.getByName({Names: [this.name], WithDecryption: true})`, normalized to `{Parameter: Parameters[0]}`
    - `CachedSecret`: `AWS.secrets.get({SecretId: this.name})`, passed through since the response already carries `SecretString`
    - Treat a name appearing in `InvalidParameters` as unresolved with status -1
    - _Requirements: 11.3, 11.4, 11.5, 11.6, 11.11_

  - [x] 10.3 Rework `refresh()` for transport selection
    - Select transport via `ExtensionAvailability.transportForRetrieval()`
    - Layer path keeps 3 retries; SDK path attempts once and relies on the SDK retry strategy
    - On connection refusal during the layer path, mark unavailable and fall through to SDK within the same call
    - Preserve: never rejects, resolves 1 or -1, dedupes via `cache.promise`, retains the `Timer`
    - _Requirements: 11.1, 11.2, 11.9, 11.10, 11.12, 11.13_

  - [x] 10.4 Write mocks and transport equivalence tests
    - **Files**: `test/helpers/aws-parameter-mocks.mjs`, `test/config/sdk-fallback-tests.jest.mjs`, `test/config/property/transport-equivalence-property-tests.jest.mjs`
    - Getter spies for `AWS.ssm` and `AWS.secrets` returning complete objects, with multi-page and `InvalidParameters` factories
    - Properties 12, 13, 14
    - _Requirements: 11.7, 11.8, 17.3, 17.4, 21.2, 21.3_

- [x] 11. Implement `SecretsManagerLoader` and the config secrets path

  - [x] 11.1 Implement the loader
    - **File**: `src/lib/utils/SecretsManagerLoader.class.js` (new, internal)
    - Retrieve each enumerated secret; store the raw string by default
    - When `parseJson` is set, parse and nest under the secret name as `store[group][secretName][key]`
    - Validate EVERY key produced by parsing through `ParameterKeySafety`
    - On invalid JSON, warn and store the raw string
    - Secret names are stored verbatim via `setGrouped` and are NOT split on `/` or segment-validated. See design Known Limitation 1
    - _Requirements: 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

  - [x] 11.2 Add the `options.secrets` init block
    - **File**: `src/lib/tools/index.js`
    - Wrap in the never-rejecting promise pattern used by `settings`, `connections`, `validations`, and `responses`
    - Register via `AppConfig.add()` so it runs in parallel and gates `AppConfig.promise()`
    - _Requirements: 14.1, 14.2, 14.9, 14.10, 16.4_

  - [x] 11.3 Write tests
    - **File**: `test/config/secrets-config-path-tests.jest.mjs`
    - Property 22 for JSON key safety, including payloads with `__proto__`, `constructor`, and `prototype` keys
    - Cover binary-only secrets reading as unresolved, per design Known Limitation 2
    - _Requirements: 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

- [x] 12. Add resolved-value accessors and error containment

  - [x] 12.1 Add `parameters()` and `secrets()`
    - **File**: `src/lib/tools/index.js`
    - Declare `_parametersResolved` and `_secretsResolved` beside `_settings` and `_connections`
    - Synchronous accessors returning null until initialization completes
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 18.12_

  - [x] 12.2 Rework the `ssmParameters` init block per the design flow
    - Assign `_ssmParameters = loadPromise` so it still resolves to the paramstore
    - Derive a separate registered promise that assigns `_parametersResolved` and contains errors, and pass THAT to `add()`
    - **DO NOT** let `_ssmParameters` resolve to a boolean
    - _Requirements: 15.5, 16.1, 16.2, 16.3, 16.5, 16.6, 18.8, 18.9_

  - [x] 12.3 Write error containment tests
    - **File**: extend `test/config/property/legacy-seam-preservation-property-tests.jest.mjs` from task 1
    - Property 19: on failure `promise()` resolves, the registered promise resolves false, `parameters()` returns null, and NO unhandled rejection is emitted
    - Register a `process.on('unhandledRejection')` listener to assert the absence
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 18.10, 21.11_

- [x] 13. Implement `CachedParameterSecrets.init()`, `info()`, and `clear()`

  - [x] 13.1 Implement `clear()` and constructor dedupe
    - **File**: `src/lib/tools/CachedParametersSecrets.classes.js`
    - `clear()` resets the registry to empty
    - Guard `add()` so a name already present is not registered twice
    - _Requirements: 12.9, 13.7, 13.8_

  - [x] 13.2 Implement `init()`
    - Accept `{ssmParameters: [...], secrets: [...]}` with separate keys, also accepting the `AppConfig.init` entry shape
    - Return a promise so the caller can register it via `AppConfig.add()`
    - For path entries, discover names by reusing the `ParameterStoreLoader` pagination primitive. The extension has no list endpoint, so discovery is always SDK
    - Seed discovered values into the created instances to avoid a redundant retrieval per name
    - Validate every resolved name, throwing for enumerated and warning for discovered
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.10_

  - [x] 13.3 Implement `info()`
    - Report availability state, resolved hostname and port, selected transport, and registered names with resolution status
    - **MUST NOT** include any parameter or secret value
    - Return a copy of `cache`, not the live reference
    - Correct the `prime()` JSDoc `@returns` to match its boolean resolution, without changing behavior
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.9_

  - [x] 13.4 Write tests
    - **Files**: `test/config/cached-parameter-secrets-init-tests.jest.mjs`, `test/config/cached-parameter-secrets-info-tests.jest.mjs`
    - Properties 20 and 21
    - Call `CachedParameterSecrets.clear()` and `ExtensionAvailability.reset()` in `beforeEach`, and `jest.restoreAllMocks()` in `afterEach`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 21.9_

- [x] 14. Update type definitions

  - [x] 14.1 Add declarations
    - **File**: `types/lib/tools/index.d.ts`
    - `AWS.secrets` beside the `ssm` block; `AppConfig.parameters()` and `secrets()` beside `settings()` and `connections()`; `options.secrets` beside `options.ssmParameters`; `CachedParameterSecrets.init()`, `info()`, and `clear()`; the `recursive` and `parseJson` entry options
    - Verify the four `src/lib/utils/` classes are absent
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.7_

  - [x] 14.2 Correct the `ssmParameters` entry type and its fixture
    - `ssmParameters?: object` currently type-checks an object literal, but the implementation requires an array. Verified: passing `{"/myapp/api/key": {}}` throws `TypeError: parameters.forEach is not a function`
    - Type it as an array of entry objects and update `test/types/consumer-appconfig-extend.ts`, which encodes the wrong shape
    - _Requirements: 19.4, 19.6_

  - [x] 14.3 Run `npm run test:types`
    - _Requirements: 19.6_

- [x] 15. Documentation and changelog

  - [x] 15.1 Add JSDoc to all new public members
    - Description, `@param`, `@returns`, at least one `@example`, and `@throws` where applicable
    - Parameter names must match implementation signatures exactly
    - _Requirements: 20.1, 20.2_

  - [x] 15.2 Add `docs/` content for transport selection
    - Compare Layer and SDK implementations with their tradeoffs
    - State that `ssm:GetParametersByPath` is required for path-based configuration **even with the layer installed**, because the extension has no list endpoint
    - List SDK IAM actions: `ssm:GetParameters`, `ssm:GetParametersByPath`, `secretsmanager:GetSecretValue`, `kms:Decrypt`
    - Document that recursive queries grant transitive read access, so a principal permitted on a path can read beneath it even when IAM denies the deeper parameter
    - Document Known Limitations 1 and 2: secret names containing a slash are stored verbatim and exempt from segment validation, and binary-only secrets read as unresolved
    - Provide layer-removal migration guidance
    - _Requirements: 6.7, 20.3, 20.4, 20.5_

  - [x] 15.3 Update `CHANGELOG.md`
    - Unreleased v1.3.16 section referencing this spec
    - **Added**: SDK fallback, `AWS.secrets`, `CachedParameterSecrets.init()` and `info()`, `options.secrets`, `AppConfig.parameters()` and `secrets()`, with an explicit action-required note for IAM permissions
    - **Fixed**: path pagination truncation, name batching limit, prototype-reachable key handling, path mismatch TypeError
    - **Deprecated**: the three seam methods, noting they remain fully supported and now carry the fixes
    - Note that `AppConfig.promise()` no longer rejects on parameter failure
    - _Requirements: 20.6, 20.7, 20.8, 20.9_

- [ ] 16. Final checkpoint and release steps

  - [x] 16.1 Run the full suite and lint
    - `npm test`, `npm run test:types`, `npm run lint:ci`
    - Confirm the four `test/config/appconfig-async-init-*` files and both cached-parameter `toString` property files pass unmodified
    - Confirm no scratch or temporary files remain
    - _Requirements: 21.10, 21.12, 21.13_

  - [x] 16.2 Verify security comment coverage
    - Run `grep -rn "// >!" src/` and confirm key-safety and transport-selection decisions are annotated
    - _Requirements: 1.1, 1.7_

  - [ ] 16.3 Deprecate prior versions on npm
    - **Release-time registry action, not a code change. Run only when the user confirms.**
    - `npm deprecate` on the v1.1.x and v1.2.x ranges, directing consumers to `>=1.3.10`
    - Does not affect availability for existing installations
    - _Requirements: 22.1, 22.2, 22.3_

  - [ ] 16.4 Ask the user to confirm before any commit or publish
    - Do not commit, tag, or publish without explicit instruction

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "7.1"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3", "3.4", "7.2"] },
    { "id": 2, "tasks": ["3.5", "4.1", "4.2", "7.3", "8.1", "8.2"] },
    { "id": 3, "tasks": ["4.3", "8.3"] },
    { "id": 4, "tasks": ["4.4", "5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4"] },
    { "id": 6, "tasks": ["6"] },
    { "id": 7, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 9, "tasks": ["10.4", "11.1", "12.1", "13.1"] },
    { "id": 10, "tasks": ["11.2", "12.2", "13.2", "13.3"] },
    { "id": 11, "tasks": ["11.3", "12.3", "13.4"] },
    { "id": 12, "tasks": ["14.1", "14.2"] },
    { "id": 13, "tasks": ["14.3", "15.1", "15.2", "15.3"] },
    { "id": 14, "tasks": ["16.1", "16.2"] },
    { "id": 15, "tasks": ["16.3", "16.4"] }
  ]
}
```

Rendered view of the same ordering:

```
1  preservation baseline tests  ─┐
2  bug condition tests  ────────┬┴─> 3  ParameterKeySafety
                               │        └─> 4  ParameterStoreLoader
                               │              └─> 5  wire legacy seam ─> 6  CHECKPOINT
                               │                                          │
7  AWS.secrets (independent) ──┘                                          │
        └─> 8  ExtensionAvailability                                      │
              └─> 9  request failure diagnosis                            │
                    └─> 10 SDK fallback transport                         │
                          ├─> 11 SecretsManagerLoader + options.secrets    │
                          ├─> 12 accessors + error containment  <──────────┘
                          └─> 13 CachedParameterSecrets init/info/clear
                                    └─> 14 types ─> 15 docs ─> 16 final checkpoint
```

Critical path: 2 → 3 → 4 → 5 → 6, then 8 → 9 → 10 → 13 → 14 → 15 → 16.

Task 7 has no dependency on tasks 1 through 6 and may be done in parallel with the remediation work. Tasks 11, 12, and 13 all depend on task 10 but not on each other, so they may proceed in parallel.

Task 6 is a hard gate: the remediation must be green and the four existing `test/config/appconfig-async-init-*` files must be unmodified before feature work begins.

## Notes

### Property to Task Map

| Property | Implemented in task | Verified in task |
|---|---|---|
| P1, P2, P3 - key safety | 3.5 | 6 |
| P4 - prototype-reachable group usable | 2 | 5.3 |
| P5 - enumerated throws, discovered warns | 4.4 | 6 |
| P6 - batching completeness | 2 | 5.3 |
| P7 - pagination completeness | 2 | 5.3 |
| P8, P9, P10, P11 - prefix and collisions | 3.5 | 6 |
| P12, P13 - transport equivalence | 10.4 | 16.1 |
| P14, P15 - unresolved and lenient contracts | 1 | 10.4 |
| P16, P17 - availability and classification | 8.3 | 16.1 |
| P18 - legacy seam contract | 1 | 5.4 |
| P19 - error containment | 12.3 | 16.1 |
| P20 - registry dedupe | 13.4 | 16.1 |
| P21 - no value leakage | 13.4 | 16.1 |
| P22 - JSON secret key safety | 11.3 | 16.1 |

### Related Documentation

- [requirements.md](requirements.md) - The 22 requirements these tasks satisfy
- [design.md](design.md) - Components, algorithms, and the 22 correctness properties
- [PLAN.md](PLAN.md) - Workstreams and answered design questions
- [FINDINGS.md](FINDINGS.md) - Source of the remediation tasks
