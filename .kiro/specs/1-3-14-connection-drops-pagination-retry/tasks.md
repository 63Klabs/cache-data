# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Pagination and Retry Properties Dropped by Connection
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete failing cases: connection configs with non-null `pagination` and/or `retry` objects
  - Test file: `test/endpoint/property/connection-pagination-retry-bug-condition-property-tests.jest.mjs`
  - Use fast-check to generate connection config objects with non-null `pagination` (e.g., `{ enabled: true, defaultLimit: fc.integer() }`) and/or `retry` (e.g., `{ enabled: true, maxRetries: fc.integer() }`)
  - For each generated config, create `new Connection(config)`, call `toObject()`, and assert:
    - If `pagination` was provided and non-null, then `result.pagination` deep equals `config.pagination`
    - If `retry` was provided and non-null, then `result.retry` deep equals `config.retry`
  - Import `Connection` from `src/lib/tools/Connections.classes.js`
  - Bug Condition from design: `isBugCondition(input)` returns true when `("pagination" IN input AND input.pagination !== null) OR ("retry" IN input AND input.retry !== null)`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists because `toObject()` does not include `pagination` or `retry`)
  - Document counterexamples found (e.g., `new Connection({ host: "api.example.com", pagination: { enabled: true } }).toObject()` returns object without `pagination` key)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Connection Property Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `test/endpoint/property/connection-preservation-property-tests.jest.mjs`
  - Observe behavior on UNFIXED code for non-buggy inputs (connections WITHOUT non-null `pagination` or `retry`)
  - Observe: `new Connection({ host: "api.example.com", path: "/items", method: "GET" }).toObject()` returns `{ host: "api.example.com", path: "/items", method: "GET" }`
  - Observe: `new Connection({ host: "api.example.com", pagination: null, retry: null }).toObject()` returns object without `pagination` or `retry` keys
  - Observe: `new Connection({ host: "h", path: "/p", headers: { "x-key": "val" }, parameters: { q: "1" }, cache: [{ profile: "default" }] }).toObject()` returns all those properties correctly
  - Write property-based tests using fast-check:
    - **Property 2a**: For all connection configs WITHOUT `pagination`/`retry` (or with them set to null), `toObject()` output must include all provided properties (method, uri, protocol, host, path, headers, parameters, body, options, note, authentication, cache) correctly
    - **Property 2b**: For all connection configs with `pagination: null` and/or `retry: null`, `toObject()` output must NOT contain `pagination` or `retry` keys
    - **Property 2c**: For all connection configs, `toInfoObject()` output must NOT contain `pagination` or `retry` keys (toInfoObject is for logging/debugging only)
    - **Property 2d**: For all connection configs, existing properties (host, path, method, protocol, headers, parameters, body, options, note, cache) must round-trip correctly through `new Connection(config).toObject()`
  - Generate random connection configs using fast-check arbitraries for host (fc.webUrl domain parts), path (fc.string with leading /), method (fc.constantFrom("GET","POST","PUT","DELETE")), headers (fc.dictionary), parameters (fc.dictionary), options (fc.object), note (fc.string)
  - Verify tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix for Connection dropping pagination and retry properties

  - [x] 3.1 Implement the fix in `src/lib/tools/Connections.classes.js`
    - Add `_pagination = null;` instance field declaration alongside existing fields (`_name`, `_method`, etc.)
    - Add `_retry = null;` instance field declaration alongside existing fields
    - Add `_init()` handling for `pagination`: `if ( "pagination" in obj && obj.pagination !== null ) { this._pagination = obj.pagination; }`
    - Add `_init()` handling for `retry`: `if ( "retry" in obj && obj.retry !== null ) { this._retry = obj.retry; }`
    - Add `toObject()` output for `pagination`: `if ( this._pagination !== null ) { obj.pagination = this._pagination; }`
    - Add `toObject()` output for `retry`: `if ( this._retry !== null ) { obj.retry = this._retry; }`
    - Update JSDoc `@param` on the constructor to include `pagination` and `retry` in the type definition
    - Follow the exact same pattern used by all other properties in `_init()` and `toObject()`
    - _Bug_Condition: isBugCondition(input) where ("pagination" IN input AND input.pagination !== null) OR ("retry" IN input AND input.retry !== null)_
    - _Expected_Behavior: For all inputs where isBugCondition holds, toObject() includes pagination and/or retry matching the input values_
    - _Preservation: All existing properties (name, method, uri, protocol, host, path, body, parameters, headers, options, note, authentication, cache) continue to be stored and returned correctly. toInfoObject() unchanged. ConnectionRequest subclass methods unaffected._
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Pagination and Retry Properties Pass-Through
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (pagination/retry survive Connection round-trip)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js test/endpoint/property/connection-pagination-retry-bug-condition-property-tests.jest.mjs`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed - pagination and retry now included in toObject() output)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Connection Property Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js test/endpoint/property/connection-preservation-property-tests.jest.mjs`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions - all existing properties still work correctly)
    - Confirm all preservation tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `npm test`
  - Ensure all existing tests pass (no regressions introduced)
  - Ensure both property tests (bug condition and preservation) pass
  - Verify no new test failures were introduced
  - Ask the user if questions arise

## Notes

- Task 1 and Task 2 can be executed in parallel since both run against unfixed code
- Task 1 is expected to FAIL on unfixed code (confirms bug exists)
- Task 2 is expected to PASS on unfixed code (captures baseline behavior)
- After Task 3 (fix), both property tests should PASS
- The fix follows the exact same pattern used by all other properties in the Connection class
