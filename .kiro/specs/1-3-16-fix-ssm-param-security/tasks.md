# Implementation Plan

## Overview

Ordering follows the dependency graph in [design.md](design.md). Tasks 1 and 2 establish the test baseline before any source change, per the observation-first methodology used by the introducing spec. Tasks 3 through 5 change `ParameterKeySafety`. Task 6 rewrites `SecretsManagerLoader` onto the new entry points. Tasks 7 and 8 verify. Tasks 9 and 10 close out documentation.

`ParameterKeySafety` must be complete before `SecretsManagerLoader` is touched, because the loader's rewrite deletes its only assignment path and has nothing to call until the new entry points exist.

**Test execution**: use `node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` or `npm test`. A bare `npx jest` fails on ESM. Never invoke `npm test` from inside a test file.

**Mocking**: `SecretsManagerLoader` lazily requires `AWS` inside `load()`. Mock with the getter-spy pattern, not by assigning onto the returned object:

```js
jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
    client: {}, get: mockGet, available: true, sdk: {}
});
```

Use a named `mockGet` so Task 2 can assert a call count of zero. `jest.restoreAllMocks()` in `afterEach`.

**Object.prototype hygiene**: every test that could pollute snapshots `Object.getOwnPropertyNames(Object.prototype)` before and diffs after, matching the existing pattern in `test/security/parameter-key-safety-tests.jest.mjs`.

## Tasks

- [x] 1. Write preservation baseline tests (BEFORE any source change)
  - **IMPORTANT**: Follow observation-first methodology. Observe actual current behavior, then encode it.
  - **GOAL**: Lock the behavior that must survive the change so a regression fails loudly.
  - **Test file**: `test/security/secrets-manager-loader-key-safety-tests.jest.mjs` (new)
  - **Multi-segment names (Property A4, Req 5.7)**:
    - Observe on CURRENT code: `load([{group:'db', names:['myapp/db/credentials']}])` stores the value at `store.db['myapp/db/credentials']` as ONE key, not nested
    - Assert the key appears in `Object.keys(store.db)`
  - **ARN names (Property A5, Req 5.6)**:
    - Observe on CURRENT code: an ARN such as `arn:aws:secretsmanager:us-east-1:123456789012:secret:myapp/db-AbCdEf` is stored verbatim
  - **Parsed-key warn-and-skip (Property A8, Req 1.13)**:
    - Observe on CURRENT code: `parseJson: true` with a payload containing `__proto__` alongside safe keys stores the safe keys and reports the unsafe one in `skipped`
  - **Unchanged edge cases**:
    - Binary secret (no `SecretString`) is reported in `skipped` with reason `binary-secret`
    - `parseJson: true` on a non-JSON value stores the raw string
    - `parseJson: true` on scalar or array JSON stores the raw string
    - `AWS.secrets.get` rejection is reported in `failed`, and remaining names still process
  - **normalizePath baseline (Property A10, Req 4.4)**:
    - **Test file**: extend `test/security/parameter-key-safety-tests.jest.mjs`
    - Capture the current regex as a local reference implementation in the test: `const referenceNormalize = p => typeof p !== 'string' ? p : p.replace(/\/*$/, '/')`
    - This reference is retained permanently as the differential oracle for Task 5
  - **Existing fixture audit**: confirm the secret names already used by `test/config/cached-parameter-secrets-init-tests.jest.mjs` and `test/config/secrets-config-path-tests.jest.mjs` (`myapp/db/credentials`, `my-secret`, `my/secret`, `s1`, `restricted`) all pass the Task 3 validation, so no existing test begins throwing
  - Run on CURRENT code
  - **EXPECTED OUTCOME**: All PASS. This is the baseline to preserve.
  - _Requirements: 1.13, 3.1, 3.2, 3.3, 4.4, 5.4, 5.6, 5.7_

- [x] 2. Write bug condition tests (BEFORE implementing fixes)
  - **CRITICAL**: These tests MUST FAIL on unfixed code. Failure confirms the defects exist.
  - **DO NOT attempt to fix the test or the code when it fails.**
  - **NOTE**: These tests encode expected behavior and will validate the fixes when they pass in Task 7.
  - **Test file**: `test/security/secrets-manager-loader-key-safety-tests.jest.mjs`
  - **Defect 1 — dangerous secret name, raw path (Property A1)**:
    - `load([{group:'app', names:['__proto__']}])` with a mocked string `SecretString`
    - Assert `load()` rejects
    - Assert on CURRENT code the value is silently discarded: `Object.getOwnPropertyNames(store.app)` is empty and the loader reports success
    - _Bug_Condition: secretName IN DANGEROUS_KEYS AND parseJson is falsy_
  - **Defect 2 — dangerous secret name, parse path (Property A1)**:
    - `load([{group:'app', names:['__proto__'], parseJson:true}])` with a JSON object `SecretString`
    - Assert `load()` rejects
    - Assert `Object.getPrototypeOf(store.app) === Object.prototype`, i.e. the group is not reparented
    - Assert parsed keys do not become non-enumerable inherited members
    - _Bug_Condition: secretName IN DANGEROUS_KEYS AND parseJson is true_
  - **Defect 3 — prototype-reachable secret name (Property A2)**:
    - fast-check over `fc.constantFrom(...Object.getOwnPropertyNames(Object.prototype))` as the secret name
    - Assert `load()` rejects
    - Assert `typeof store.app?.toString === 'function'` for the `toString` case, i.e. the native method is not shadowed
    - `{ numRuns: 20 }` is sufficient; the domain is small and fully enumerable
    - _Bug_Condition: secretName IN Object.getOwnPropertyNames(Object.prototype)_
  - **Defect 4 — dangerous segment (Property A3)**:
    - Names such as `myapp/__proto__/db` and `myapp/toString`
    - Assert `load()` rejects
    - _Bug_Condition: any segment of secretName IN DANGEROUS_KEYS OR PROTOTYPE_KEYS_
  - **Defect 5 — unsafe group throws (Req 1.8)**:
    - `load([{group:'__proto__', names:['ok']}])` and `load([{group:'toString', names:['ok']}])`
    - Assert `load()` rejects
    - Assert on CURRENT code the group is warned and skipped rather than throwing
  - **Defect 6 — AWS call issued on invalid config (Property A6)**:
    - Assert `mockGet` has zero calls after a rejected load
    - Assert on CURRENT code the call IS issued before validation runs
    - _Bug_Condition: validation runs after retrieval_
  - **Defect 7 — throw swallowed by retrieval handler (Property A7)**:
    - Assert `load()` rejects rather than resolving with the name present in `failed`
    - _Bug_Condition: validation throw occurs inside the per-secret try/catch_
  - **Defect 8 — normalizePath is quadratic (Property A11)**:
    - **Test file**: `test/security/parameter-key-safety-tests.jest.mjs`
    - Measure `normalizePath` on `'/'.repeat(n) + 'a'` for n in 10000, 20000, 40000
    - Assert each completes under 50ms
    - Include one warmup call before measuring
    - Observed on CURRENT code: 48ms, 167ms, 632ms — the 40000 case fails the bound
    - _Bug_Condition: input contains a long run of trailing slashes followed by a non-slash_
  - **Object.prototype guard**: every case above diffs `Object.getOwnPropertyNames(Object.prototype)` before and after and asserts no additions (Property A1, A2, Req 2.6)
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: All eight FAIL. Document the observed failure for each.
  - _Requirements: 1.2, 1.3, 1.4, 1.7, 1.8, 1.11, 1.12, 2.4, 2.5, 2.6, 4.1, 4.2, 4.3_

- [x] 3. Implement secret name validation in `ParameterKeySafety`
  - **File**: `src/lib/utils/ParameterKeySafety.class.js`
  - Add module-scope constants beside the existing ones, NOT allocated inside iteration:
    - `MAX_SECRET_NAME_LENGTH = 2048`
    - `SECRET_NAME_PATTERN = /^[a-zA-Z0-9_.+=@:/-]+$/`
    - Place `-` last inside the character class so it is a literal, not a range
  - Implement `checkSecretName(name)` returning `{safe, reason}` in the design's documented order: non-empty string, length bound, `DANGEROUS_KEYS`, `PROTOTYPE_KEYS`, `SECRET_NAME_PATTERN`, then per-segment denylist checks
  - Skip empty segments in the segment loop rather than rejecting them; an empty segment cannot be a dangerous or prototype-reachable name, and rejecting `a//b` would be a behavior change with no security benefit
  - Reason strings: `not-a-non-empty-string`, `too-long`, `dangerous-key`, `prototype-key`, `invalid-characters`, `dangerous-segment`, `prototype-segment`
  - Implement `isSafeSecretName(name)` delegating to `checkSecretName`
  - Reuse the existing `DANGEROUS_KEYS` and `PROTOTYPE_KEYS`; do NOT duplicate them
  - Do NOT modify `isSafeKey`, `checkKey`, `VALID_KEY_PATTERN`, or `setGrouped`. SSM parameter names must stay single-segment
  - Add `// >!` comments explaining why the wider allowlist exists (`/` in names, `:` and `+=@` in ARNs) and why the denylists must precede it (`__proto__` and `toString` both satisfy the pattern)
  - JSDoc per the project standard: description, `@param`, `@returns`, `@example`
  - **Unit tests** in `test/security/parameter-key-safety-tests.jest.mjs`:
    - Accepts `myapp/db/credentials`, a full ARN, `my+secret`, `my=secret`, `my@secret`, `my-secret`, `my.secret`, `my_secret`
    - Rejects `__proto__`, `constructor`, `prototype`, every `PROTOTYPE_KEYS` member, `a b`, `a[b]`, `a{b}`, empty string, non-strings, and a 2049-character name
    - Rejects `myapp/__proto__/db` with reason `dangerous-segment` and `myapp/toString` with reason `prototype-segment`
    - Property A5: generated ARNs are accepted
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 5.6_

- [x] 4. Implement secret assignment entry points in `ParameterKeySafety`
  - **File**: `src/lib/utils/ParameterKeySafety.class.js`
  - `setGroupedSecret(store, group, secretName, value)` returning `{assigned, reason}`
    - Validate `group` with `isSafeKey`, `secretName` with `checkSecretName`
    - Create `store[group]` as a plain `{}` guarded by `Object.prototype.hasOwnProperty.call`
    - Reasons on rejection: `unsafe-group`, or the `checkSecretName` reason
  - `setGroupedSecretMap(store, group, secretName, parsed)` returning `{assigned, reason, skipped}`
    - Validate `group` and `secretName` once
    - Create `store[group]` and the `store[group][secretName]` container, both plain `{}`, both guarded by `Object.prototype.hasOwnProperty.call`
    - Validate every key of `parsed` with `isSafeKey`; push rejects to `skipped` as `{key, reason}` and continue with the remaining keys
    - Write values via `String(value)`, preserving the current coercion
  - Never use the `in` operator and never `obj.hasOwnProperty` (Req 2.3)
  - Add `// >!` comments noting these are the only permitted sites of secret-key bracket assignment
  - JSDoc per the project standard
  - **Unit tests** in `test/security/parameter-key-safety-tests.jest.mjs`:
    - Safe group and name round-trip on both methods, enumerable via `Object.keys`
    - `Object.getPrototypeOf(store[group]) === Object.prototype` (Property A9, Req 3.5)
    - `store[group].hasOwnProperty` is the native function (Req 3.6)
    - Unsafe group, unsafe name, and unsafe parsed keys each rejected with the right reason
    - `Object.prototype` gains no own property across all rejection cases
  - _Requirements: 1.13, 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.5, 3.6_

- [x] 5. Rewrite `normalizePath`
  - **File**: `src/lib/utils/ParameterKeySafety.class.js`
  - Replace the `path.replace(/\/*$/, '/')` body with the bounded `charCodeAt` scan from the design
  - Keep the signature, the non-string passthrough, and the exact return value for every input
  - Add the `// >!` comment recording why the regex was removed, naming `js/polynomial-redos` and the measured 48/167/632ms figures
  - **Tests** in `test/security/parameter-key-safety-tests.jest.mjs`:
    - Property A10: differential equality against the `referenceNormalize` oracle retained from Task 1, over `fc.string()` plus a generator biased toward slash runs such as `fc.stringMatching(/^[/a-z]{0,60}$/)`
    - Confirm the four table cases from the design explicitly: `''`, `'/myapp/prod'`, `'/myapp/prod/'`, `'/////'`
    - Confirm the existing idempotence and single-trailing-slash tests still pass unchanged
    - Property A11 now passes: the measured cost at 40000 slashes is microseconds
  - **Verify no other polynomial regex was missed**: `ParameterStoreLoader.class.js:73` uses `/\/$/` and `ValidationMatcher.class.js:91` uses `/^\/|\/$/g`. Both are anchored single-character patterns with no repetition and are NOT affected. Confirm and leave them alone
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.3, 5.5_

- [x] 6. Rewrite `SecretsManagerLoader`
  - **File**: `src/lib/utils/SecretsManagerLoader.class.js`
  - [x] 6.1 Add the validation pre-pass
    - `#validateEntries(entries)` iterating every entry's `group` and every name in `names`
    - Validate `group` with `isSafeKey`, each name with `checkSecretName`
    - Throw on the first failure with a message naming the secret, the group, and the reason, and stating the secret would otherwise be silently unreachable
    - Never interpolate a secret value into the message (Req 1.10)
    - Call it in `load()` after the empty-entries early return and BEFORE `require('../tools/AWS.classes.js')`, so no AWS call can be issued and the throw is outside the per-secret try/catch
    - _Requirements: 1.7, 1.8, 1.9, 1.10, 1.11, 1.12_
  - [x] 6.2 Make `#resolveValue` pure
    - Change the signature to `#resolveValue(entry, response, secretName)`; drop the `store`, `group`, and `skipped` parameters
    - Return one of three descriptors: `{kind:'raw', value}`, `{kind:'map', parsed}`, `{kind:'none', reason:'binary-secret'}`
    - Move the binary-secret `DebugAndLog.warn` and `skipped` push out to `load()`
    - Keep every existing classification decision unchanged: non-JSON falls back to raw, scalar and array JSON fall back to raw, missing `SecretString` yields `none`
    - _Requirements: 3.1, 5.2_
  - [x] 6.3 Delegate all writes
    - Dispatch on `descriptor.kind`: `raw` to `setGroupedSecret`, `map` to `setGroupedSecretMap`, `none` to a `skipped` push
    - Merge the `skipped` array returned by `setGroupedSecretMap`, prefixing keys as `${secretName}.${key}` to match the current reporting shape
    - Delete both inline group checks, the `checkKey` call in `load()` and the `isSafeKey` call in `#resolveValue`. Group validation now lives only in the pre-pass and the `ParameterKeySafety` entry points (Req 2.7)
    - Remove all three bracket assignments: `store[group][secretName] = rawValue`, `store[group][secretName] = {}`, `store[group][secretName][key] = String(value)`
    - Remove the `Object.prototype.hasOwnProperty.call(store, group)` guards; the entry points own that now
    - Keep the per-secret try/catch around the AWS call only, still populating `failed`
    - Update the class-level JSDoc: the Known Limitation 1 reference now points to this spec, and secret names ARE validated, just with a wider allowlist than `isSafeKey`
    - _Requirements: 2.1, 2.2, 2.7, 3.1, 5.2_
  - [x] 6.4 Add the chokepoint compliance test (Property A12)
    - **Test file**: `test/security/secrets-manager-loader-key-safety-tests.jest.mjs`
    - Read `src/lib/utils/SecretsManagerLoader.class.js` as text and assert no bracket-assignment expression matches
    - Document in a comment that this is a text scan, not a semantic proof, and would not catch `Reflect.set` or destructuring into a computed key
    - _Requirements: 2.1, 2.2_

- [x] 7. Verify the bug condition tests now pass
  - Re-run `test/security/secrets-manager-loader-key-safety-tests.jest.mjs` and `test/security/parameter-key-safety-tests.jest.mjs`
  - **EXPECTED OUTCOME**: all eight Task 2 defect cases now PASS, and every Task 1 baseline case still PASSES
  - If a Task 1 baseline case fails, the fix broke preservation. Fix the source, not the baseline test
  - Confirm Property A11 measures in microseconds rather than merely passing the 50ms ceiling
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13_

- [x] 8. Run the full preservation gate
  - `npm test`
  - The whole suite must pass. Pay particular attention to `test/config/parameter-secret-tests.jest.mjs`, `test/config/parameter-secret-edge-case-tests.jest.mjs`, `test/config/cached-parameter-secrets-init-tests.jest.mjs`, `test/config/secrets-config-path-tests.jest.mjs`, and `test/utils/parameter-store-loader-tests.jest.mjs`
  - Any NEW failure is a regression from this change and must be fixed before proceeding
  - If a failure is pre-existing, verify with `git stash && npm test && git stash pop` and record it rather than fixing it here
  - Monitor process count during the run; kill runaway Jest processes with `pkill -f jest`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 9. Amend the introducing spec's Known Limitation 1
  - **File**: `.kiro/specs/1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/design.md`
  - Known Limitation 1 currently documents secret names as exempt from `isSafeKey` with no replacement guard, which is the gap this spec closes
  - Amend it to record that the exemption from `isSafeKey` stands, that names are now validated by `checkSecretName` instead, and link to this spec
  - Do NOT rewrite the historical requirements or design beyond that note
  - Also correct the `SecretsManagerLoader` class-level JSDoc claim that names are "NOT validated through isSafeKey" so it no longer reads as unvalidated
  - _Requirements: 2.1, 2.2_

- [x] 10. Update CHANGELOG
  - **File**: `CHANGELOG.md`
  - Add entries under the existing 1.3.16 section; do NOT create a new version section and do NOT bump `package.json` (Req 5.8)
  - Under **Fixed**:
    - Secret names are validated before use as property names. A secret named `__proto__`, `constructor`, `prototype`, or after an `Object.prototype` member previously caused the value to be silently discarded, the group prototype to be reparented, or a native method to be shadowed. These now throw at init with a diagnosable message
    - An unsafe secret name or group is now detected before any Secrets Manager request is issued
    - `ParameterKeySafety.normalizePath` no longer uses a regular expression with polynomial worst-case matching time
  - Note that behavior is unchanged for every secret name that worked before, including multi-segment names and ARNs
  - Describe user-visible impact only; no internal class names beyond what a consumer would see in an error message
  - _Requirements: 5.1, 5.8_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4"] },
    { "id": 4, "tasks": ["5"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2"] },
    { "id": 7, "tasks": ["6.3"] },
    { "id": 8, "tasks": ["6.4"] },
    { "id": 9, "tasks": ["7"] },
    { "id": 10, "tasks": ["8"] },
    { "id": 11, "tasks": ["9", "10"] }
  ]
}
```

Rendered view of the same ordering:

```
1  preservation baseline tests
     └─> 2  bug condition tests
           └─> 3  ParameterKeySafety: secret name validation
                 └─> 4  ParameterKeySafety: secret assignment entry points
                       └─> 5  ParameterKeySafety: normalizePath rewrite
                             └─> 6.1 SecretsManagerLoader: validation pre-pass
                                   └─> 6.2 SecretsManagerLoader: pure #resolveValue
                                         └─> 6.3 SecretsManagerLoader: delegate writes
                                               └─> 6.4 chokepoint compliance test (Property A12)
                                                     └─> 7  verify bug condition tests pass
                                                           └─> 8  full preservation gate (npm test)
                                                                 ├─> 9  amend introducing spec's Known Limitation 1
                                                                 └─> 10 update CHANGELOG
```

Critical path: 1 → 2 → 3 → 4 → 5 → 6.1 → 6.2 → 6.3 → 6.4 → 7 → 8.

Tasks 9 and 10 have no dependency on each other and may proceed in parallel once Task 8 passes. Task 6's sub-tasks are strictly sequential because 6.2 depends on the pre-pass existing before it can be relied upon, and 6.3 depends on `#resolveValue` returning a descriptor before writes can be delegated.

## Notes

### Property to Task Map

| Property | Implemented in task | Verified in task |
|---|---|---|
| A1 - dangerous secret name throws | 3, 6.1 | 7 |
| A2 - prototype-reachable secret name throws | 3 | 7 |
| A3 - dangerous segment throws | 3 | 7 |
| A4 - safe names round-trip | 1 (baseline) | 7, 8 |
| A5 - ARN names round-trip | 1 (baseline), 3 | 7, 8 |
| A6 - no AWS call on invalid config | 6.1 | 7 |
| A7 - throw escapes retrieval handler | 6.1 | 7 |
| A8 - parsed key safety (re-asserts Property 22) | 4 | 7 |
| A9 - group prototype integrity | 4 | 7 |
| A10 - normalizePath equivalence | 1 (oracle), 5 | 7 |
| A11 - normalizePath linearity | 5 | 7 |
| A12 - chokepoint compliance (static scan) | 6.4 | 7 |

### Related Documentation

- [requirements.md](requirements.md) - The requirements these tasks satisfy
- [design.md](design.md) - Components, algorithms, and the correctness properties (A1-A12)
- [Introducing spec design](../1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/design.md) - Known Limitation 1, amended by Task 9
