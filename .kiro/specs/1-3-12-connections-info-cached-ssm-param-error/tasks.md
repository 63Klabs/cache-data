# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Unresolved CachedParameterSecret toString/toJSON Throws
  - **IMPORTANT**: Write this property-based test BEFORE implementing the fix
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Test file**: `test/config/cached-param-tostring-bug-condition-property-tests.jest.mjs`
  - **Scoped PBT Approach**: Use fast-check to generate arbitrary parameter names (non-empty strings). For each generated name, create an unresolved `CachedParameterSecret` instance (do NOT call `.get()`, `.getValue()`, `.refresh()`, or `.prime()`) and assert:
    - `toString()` returns a non-empty placeholder string without throwing
    - `toJSON()` returns a non-empty placeholder string without throwing
    - The placeholder string contains the parameter name for debuggability
  - Also test with `CachedSsmParameter` and `CachedSecret` subclasses to confirm the bug exists across the class hierarchy
  - Test `ConnectionAuthentication.toObject()` with unresolved `CachedSsmParameter` basic auth credentials — assert it does not throw
  - Test `JSON.stringify()` on an object containing an unresolved `CachedSsmParameter` header value — assert it does not throw
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists because `toString()` and `toJSON()` currently throw via `sync_getValue()`)
  - Document counterexamples found (e.g., `new CachedSsmParameter('/test/param').toString()` throws `CachedParameterSecret Error: Secret is null...`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Resolved Values, Plain String Auth, and sync_getValue Throw Contract
  - **IMPORTANT**: Follow observation-first methodology
  - **Test file**: `test/config/cached-param-tostring-preservation-property-tests.jest.mjs`
  - **Observe on UNFIXED code first**, then write property-based tests capturing observed behavior:
  - **Preservation 2a — sync_getValue() throw contract**: For any unresolved `CachedParameterSecret` instance, `sync_getValue()` MUST throw `CachedParameterSecret Error`. Use fast-check to generate arbitrary parameter names and verify the throw. This contract must be preserved after the fix.
  - **Preservation 2b — Resolved toString()/toJSON() behavior**: Create `CachedParameterSecret` instances, manually set `this.value` to simulate resolution (e.g., `{ Parameter: { Value: generatedString } }` for SSM, `{ SecretString: generatedString }` for Secrets). Use fast-check to generate arbitrary resolved value strings. Assert `toString()` and `toJSON()` return the resolved value string (same as `sync_getValue()`).
  - **Preservation 2c — Plain string basic auth**: Use fast-check to generate arbitrary non-empty username/password string pairs. Create `ConnectionAuthentication` with `{ basic: { username, password } }` using plain strings. Assert `_getBasicAuthHeader()` returns `{ Authorization: "Basic <base64>" }` where base64 is `Buffer.from(username + ":" + password).toString("base64")`.
  - **Preservation 2d — Plain string header auth**: Use fast-check to generate arbitrary header key/value pairs (alphanumeric keys, string values). Create `ConnectionAuthentication` with `{ headers: generatedHeaders }`. Assert `_getHeaders()` returns the same headers object.
  - **Preservation 2e — Connection without auth**: Create `Connection` without authentication field. Assert `toObject()` returns object without `authentication` key and does not throw.
  - Verify all preservation tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix for CachedParameterSecret toString/toJSON throwing on unresolved values

  - [x] 3.1 Implement the fix in `src/lib/tools/CachedParametersSecrets.classes.js`
    - Guard `toString()` with `this.isValid()` check: if unresolved, return `"[Pending: <this.name>]"` placeholder string; if resolved, delegate to `this.sync_getValue()` as before
    - Guard `toJSON()` with `this.isValid()` check: if unresolved, return `"[Pending: <this.name>]"` placeholder string; if resolved, delegate to `this.sync_getValue()` as before
    - Do NOT modify `sync_getValue()` — its throw contract must be preserved
    - Do NOT modify `Connections.classes.js` or `src/lib/tools/index.js` — the fix in `CachedParameterSecret` is sufficient
    - _Bug_Condition: isBugCondition(input) where input.cachedParam.isValid() === false AND input.method IN ['toString', 'toJSON']_
    - _Expected_Behavior: toString() and toJSON() return "[Pending: <name>]" placeholder string when isValid() is false, return sync_getValue() when isValid() is true_
    - _Preservation: sync_getValue() throw contract unchanged; resolved toString()/toJSON() behavior unchanged; plain-string auth unchanged; connections without auth unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Unresolved CachedParameterSecret toString/toJSON Safety
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (non-throwing placeholder returns)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js test/config/cached-param-tostring-bug-condition-property-tests.jest.mjs`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Resolved Values, Plain String Auth, and sync_getValue Throw Contract
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js test/config/cached-param-tostring-preservation-property-tests.jest.mjs`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite: `npm test`
  - Ensure all existing tests continue to pass (no regressions)
  - Ensure both new property test files pass
  - Ask the user if questions arise
