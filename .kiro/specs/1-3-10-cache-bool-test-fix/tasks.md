# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Test Generator Produces Truthy Values
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (generator produces "1" or case-insensitive "true")
  - **Scoped PBT Approach**: Scope the property to concrete failing cases: "1", "TRUE", "True", "TrUe"
  - Test that the current generator at line 71 produces values that `Cache.bool()` treats as true
  - The test assertions should verify that when generator produces "1" or case-insensitive "true", `Cache.bool()` returns true
  - Run test on UNFIXED code (current generator implementation)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: "1", "TRUE", "True", etc.
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Cache.bool() and Test Structure Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code: `Cache.bool()` correctly treats "true" (case-insensitive) and "1" as truthy
  - Observe behavior on UNFIXED code: Test assertion logic correctly validates `useInMemoryCache` is false
  - Write property-based tests capturing observed behavior patterns:
    - `Cache.bool("true")` returns true
    - `Cache.bool("1")` returns true
    - `Cache.bool("false")` returns false
    - `Cache.bool("0")` returns false
    - Other property tests in file continue to pass
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix test generator to exclude truthy values

  - [x] 3.1 Update the fast-check generator filter
    - Open file: `test/cache/in-memory-cache/property/Cache-integration-property-tests.mjs`
    - Locate line 71 (inside the second property test "should never access L0_Cache when environment variable is not set to true")
    - Replace `fc.string({ minLength: 1, maxLength: 20 }).filter(s => s !== 'true')` with:
      ```javascript
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => {
        const normalized = s.trim().toLowerCase();
        return normalized !== 'true' && normalized !== '1';
      })
      ```
    - Add comment above the filter explaining the fix:
      ```javascript
      // Generate values that Cache.bool() treats as false
      // Exclude "true" (case-insensitive) and "1" which are truthy
      ```
    - _Bug_Condition: isBugCondition(input) where input === '1' OR input.trim().toLowerCase() === 'true'_
    - _Expected_Behavior: Generator produces only values that Cache.bool() treats as false_
    - _Preservation: Cache.bool() implementation unchanged, test assertion logic unchanged, other tests unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Test Generator Produces Only Falsy Values
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed - generator no longer produces truthy values)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Cache.bool() and Test Structure Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Verify `Cache.bool()` still treats "true" (case-insensitive) and "1" as truthy
    - Verify `Cache.bool()` still treats "false", "0", "" as falsy
    - Verify other property tests in file still pass
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite: `npm test`
  - Verify the fixed property test passes consistently (run multiple times)
  - Verify no regressions in other cache tests
  - Verify no regressions in other property tests
  - Ask the user if questions arise
