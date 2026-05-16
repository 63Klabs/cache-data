# Implementation Plan

## Overview

Fix the `ApiRequest` constructor in `ApiRequest.class.js` which does not inject `pagination.defaultLimit` as the `parameters[limitLabel]` query parameter on the initial HTTP request. The fix injects `defaultLimit` into `parameters` when pagination is enabled and no explicit limit is provided, ensuring the HTTP request and pagination math use the same limit value.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Default Limit Not Injected as Query Parameter
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete failing cases: pagination enabled with no explicit limit parameter provided
  - Test file: `test/endpoint/property/pagination-default-limit-bug-condition-property-tests.jest.mjs`
  - Use fast-check to generate ApiRequest config objects where pagination is enabled and no explicit limit is in `parameters`:
    - Generate `host` (fc.webDomain()), `path` (fc.constantFrom("/items", "/users", "/orders", "/data"))
    - Generate `pagination.defaultLimit` (fc.integer({ min: 1, max: 10000 }))
    - Generate `pagination.limitLabel` (fc.constantFrom("limit", "take", "pageSize", "per_page"))
    - Generate `parameters` as one of: undefined, null, empty object `{}`, or object with keys that do NOT include the `limitLabel`
  - For each generated config, create `new ApiRequest(config)`, call `getURI()`, and assert:
    - The URI contains the query parameter `limitLabel=defaultLimit` (e.g., `?take=1000` or `&take=1000`)
  - Import `ApiRequest` from `src/lib/tools/ApiRequest.class.js`
  - Bug Condition from design: `isBugCondition(input)` returns true when `input.pagination.enabled = true AND (input.parameters IS NULL OR UNDEFINED OR input.parameters[input.pagination.limitLabel] IS UNDEFINED)`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists because the URI does not contain the limit query parameter)
  - Document counterexamples found (e.g., `new ApiRequest({ host: "api.example.com", path: "/items", pagination: { enabled: true, defaultLimit: 1000, limitLabel: "take" } }).getURI()` returns URI without `take=1000`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.3, 2.1, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Explicit Limit and Non-Paginated Requests Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `test/endpoint/property/pagination-default-limit-preservation-property-tests.jest.mjs`
  - Observe behavior on UNFIXED code for non-buggy inputs (requests with explicit limit OR pagination disabled/absent)
  - Observe: `new ApiRequest({ host: "api.example.com", path: "/items", parameters: { take: 500 }, pagination: { enabled: true, defaultLimit: 1000, limitLabel: "take" } }).getURI()` returns URI with `take=500` (explicit limit preserved)
  - Observe: `new ApiRequest({ host: "api.example.com", path: "/items", parameters: { filter: "active" } }).getURI()` returns URI with `filter=active` and no injected limit (no pagination)
  - Observe: `new ApiRequest({ host: "api.example.com", path: "/items", parameters: { sort: "name", limit: 50 }, pagination: { enabled: true, defaultLimit: 200, limitLabel: "limit" } }).getURI()` returns URI with `limit=50` and `sort=name` (explicit limit not overwritten, other params retained)
  - Write property-based tests using fast-check:
    - **Property 2a**: For all configs with pagination enabled AND explicit `parameters[limitLabel]` provided (numeric > 0), `getURI()` must contain `limitLabel=explicitValue` (user-provided limit NOT overwritten by defaultLimit)
    - **Property 2b**: For all configs with pagination disabled or absent (`pagination: null`, `pagination.enabled: false`, or no `pagination` key), `getURI()` must NOT contain any injected limit parameter and must match the URI constructed from `parameters` alone
    - **Property 2c**: For all configs with pagination enabled AND `parameters` containing other keys (filters, sort, etc.) alongside an explicit limit, `getURI()` must contain ALL parameter keys in the query string
    - **Property 2d**: For all configs without pagination, existing parameters must round-trip correctly into the URI query string
  - Generate random configs using fast-check arbitraries:
    - For 2a: host, path, limitLabel from fc.constantFrom("limit","take","pageSize"), defaultLimit from fc.integer({min:1,max:5000}), explicit limit from fc.integer({min:1,max:5000}), plus random other parameters
    - For 2b: host, path, random parameters, pagination set to null or { enabled: false }
    - For 2c: host, path, multiple parameter keys (fc.dictionary of fc.string to fc.string), plus explicit limit
    - For 2d: host, path, random parameters without pagination
  - Verify tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 2.4, 3.1, 3.2, 3.3, 3.5_

- [x] 3. Fix for ApiRequest not injecting pagination defaultLimit into parameters

  - [x] 3.1 Implement the fix in `src/lib/tools/ApiRequest.class.js`
    - Locate the constructor after pagination config merge (around line 637) and before URI construction (around line 649)
    - Add injection logic: if `req.pagination.enabled === true`, ensure `request.parameters` object exists (create `{}` if null/undefined), then if `request.parameters[limitLabel]` is undefined or null, set `request.parameters[limitLabel] = defaultLimit`
    - Handle edge cases: `parameters` is null, undefined, or empty object
    - Preserve explicit limit values: only inject when `parameters[limitLabel]` is undefined or null
    - Ensure the injected limit is stored in `this.#request.parameters` so `_handlePagination()` reads it directly
    - Follow the pseudocode from design:
      ```
      IF req.pagination.enabled = true THEN
        limitLabel ← req.pagination.limitLabel
        defaultLimit ← req.pagination.defaultLimit
        IF request.parameters IS NULL OR UNDEFINED THEN
          request.parameters ← {}
        END IF
        IF request.parameters[limitLabel] IS UNDEFINED OR NULL THEN
          request.parameters[limitLabel] ← defaultLimit
        END IF
      END IF
      ```
    - _Bug_Condition: isBugCondition(input) where input.pagination.enabled = true AND (input.parameters IS NULL OR UNDEFINED OR input.parameters[input.pagination.limitLabel] IS UNDEFINED)_
    - _Expected_Behavior: getURI() contains limitLabel=defaultLimit as query parameter for all bug condition inputs_
    - _Preservation: Explicit user-provided limit values not overwritten. Non-paginated requests unaffected. Other query parameters retained alongside injected limit._
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Default Limit Injected as Query Parameter
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (URI contains limitLabel=defaultLimit)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js test/endpoint/property/pagination-default-limit-bug-condition-property-tests.jest.mjs`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed - defaultLimit now injected into URI)
    - _Requirements: 2.1, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Explicit Limit and Non-Paginated Requests Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js test/endpoint/property/pagination-default-limit-preservation-property-tests.jest.mjs`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions - explicit limits not overwritten, non-paginated requests unchanged)
    - Confirm all preservation tests still pass after fix (no regressions)
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `npm test`
  - Ensure all existing tests pass (no regressions introduced)
  - Ensure both property tests (bug condition and preservation) pass
  - Verify no new test failures were introduced
  - Ask the user if questions arise

## Notes

- Task 1 and Task 2 can be executed in parallel (Wave 1) since both run against unfixed code
- Task 3 depends on both Task 1 and Task 2 (Wave 2)
- Task 4 depends on Task 3 (Wave 3)
- Task 1 is expected to FAIL on unfixed code (confirms bug exists)
- Task 2 is expected to PASS on unfixed code (captures baseline behavior)
- After Task 3.1 (fix), both property tests should PASS
- The fix injects `defaultLimit` into `parameters[limitLabel]` ONLY when pagination is enabled and no explicit limit is provided
- The fix must occur after pagination config merge but before URI construction in the ApiRequest constructor
