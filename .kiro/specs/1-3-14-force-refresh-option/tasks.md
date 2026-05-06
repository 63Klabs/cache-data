# Implementation Plan: Force Refresh Option

## Overview

Add a `forceRefresh` boolean option to `connection.options` that bypasses the cache expiration check in `CacheableDataAccess.getData()` and always fetches fresh data from the original source. The implementation leverages the existing architecture where `connection.options` is already excluded from cache hash generation, ensuring forced and non-forced requests share the same cache entry.

## Tasks

- [x] 1. Implement core forceRefresh logic in CacheableDataAccess.getData()
  - [x] 1.1 Modify `src/lib/dao-cache.js` to extract `forceRefresh` from `connection.options`
    - Add `const forceRefresh = connection?.options?.forceRefresh === true;` before the cache read
    - Change the condition from `cache.needsRefresh()` to `forceRefresh || cache.needsRefresh()`
    - Pass `Cache.STATUS_FORCED` as status when `forceRefresh` is true and cache was not already expired
    - Ensure conditional headers (ETag, If-Modified-Since) are still sent during forced refresh
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_

  - [x] 1.2 Write property test: Force refresh always fetches from origin
    - **Property 1: Force refresh always fetches from origin**
    - Generate random connection objects with `forceRefresh: true` and random cache states
    - Assert that `apiCallFunction` is always invoked
    - Minimum 100 iterations
    - **Validates: Requirements 1.1**

  - [x] 1.3 Write property test: Absence of forceRefresh preserves cache-first behavior
    - **Property 2: Absence of forceRefresh preserves cache-first behavior**
    - Generate connection objects with `forceRefresh` as `false`, `undefined`, `null`, `0`, or absent
    - With valid (non-expired) cache, assert `apiCallFunction` is NOT invoked
    - Minimum 100 iterations
    - **Validates: Requirements 1.2, 1.3, 6.3, 7.2**

  - [x] 1.4 Write property test: Forced refresh writes to cache with STATUS_FORCED
    - **Property 4: Forced refresh writes to cache with STATUS_FORCED**
    - Generate connection objects with `forceRefresh: true` and valid (non-expired) cache
    - Mock origin to return successful non-304 response
    - Assert cache status is `"original:cache-update-forced"` after getData() completes
    - Minimum 100 iterations
    - **Validates: Requirements 2.1, 2.3, 6.1**

  - [x] 1.5 Write property test: Conditional headers sent during forced refresh
    - **Property 5: Conditional headers sent during forced refresh**
    - Generate connection objects with `forceRefresh: true` and cache containing ETag/Last-Modified
    - Assert `if-none-match` and/or `if-modified-since` headers are passed to `apiCallFunction`
    - Minimum 100 iterations
    - **Validates: Requirements 5.1, 5.2**

  - [x] 1.6 Write property test: 304 during forced refresh extends expiration without overwriting body
    - **Property 6: 304 during forced refresh extends expiration without overwriting body**
    - Generate connection objects with `forceRefresh: true`
    - Mock origin to return 304 Not Modified
    - Assert cached body remains unchanged and expiration is extended
    - Minimum 100 iterations
    - **Validates: Requirements 5.3**

  - [x] 1.7 Write property test: Error fallback returns stale cached data
    - **Property 7: Error fallback returns stale cached data**
    - Generate connection objects with `forceRefresh: true`
    - Mock origin to fail and cache to contain stale data
    - Assert stale cached data is returned and expiration is extended
    - Minimum 100 iterations
    - **Validates: Requirements 3.1, 3.2**

  - [x] 1.8 Write property test: Other connection options are not affected by forceRefresh
    - **Property 8: Other connection options are not affected by forceRefresh**
    - Generate connection objects with `forceRefresh: true` and other options (e.g., `timeout`)
    - Assert other options are preserved and passed through to `apiCallFunction` unchanged
    - Minimum 100 iterations
    - **Validates: Requirements 7.3**

- [x] 2. Checkpoint - Verify core implementation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Update TypeScript type definitions
  - [x] 3.1 Update `types/lib/tools/index.d.ts` to add `forceRefresh` to ConnectionObject options
    - Expand `options` type from `{ timeout?: number }` to include `forceRefresh?: boolean`
    - Add JSDoc description: "When true, bypasses cache expiration check and always fetches from origin"
    - _Requirements: 8.1, 8.2_

  - [x] 3.2 Add TypeScript compilation test for forceRefresh option
    - Create or update a type-level test in `test/types/` verifying `forceRefresh` compiles correctly
    - Verify connection object with `options: { timeout: 5000, forceRefresh: true }` compiles
    - Run `npm run test:types` to validate
    - _Requirements: 8.1, 8.2_

- [x] 4. Cache hash stability validation
  - [x] 4.1 Write property test: Cache hash stability under forceRefresh variation
    - **Property 3: Cache hash stability under forceRefresh variation**
    - Generate valid connection objects
    - Assert hash with `forceRefresh: true` equals hash with `forceRefresh: false`, `undefined`, or absent
    - Minimum 100 iterations
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 5. Unit and integration tests
  - [x] 5.1 Write unit tests for forceRefresh edge cases
    - Create `test/cache/force-refresh/unit/force-refresh-unit-tests.jest.mjs`
    - Test: forceRefresh with string "true" does NOT trigger forced refresh
    - Test: empty cache + origin failure returns empty Cache object with error status
    - Test: method signature unchanged (no new required parameters)
    - Test: status logging for 304 during forced refresh
    - Test: forceRefresh with `null`, `0`, `undefined` does NOT trigger
    - _Requirements: 1.3, 3.3, 6.2, 7.1_

  - [x] 5.2 Write integration tests for end-to-end forceRefresh flow
    - Create `test/cache/force-refresh/integration/force-refresh-integration-tests.jest.mjs`
    - Test end-to-end flow with mocked AWS services (DynamoDB, S3)
    - Test interaction between Cache, CacheData, and CacheableDataAccess
    - Test Cache.init() works without forceRefresh-related configuration
    - _Requirements: 7.2, 7.4_

- [x] 6. Checkpoint - Verify all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Documentation updates
  - [x] 7.1 Update user documentation in `docs/features/cache/README.md`
    - Add "Force Refresh Option" section under "Use `CacheableDataAccess.getData()` to send requests"
    - Include usage example with `connection.options.forceRefresh = true`
    - Document behavior table (forceRefresh + cache state combinations)
    - Document error resilience (falls back to stale cache on origin failure)
    - Document bandwidth efficiency (sends conditional headers)
    - Add security warning about rate limiting
    - Update Status Codes section to include `STATUS_FORCED` (`"original:cache-update-forced"`)
    - _Requirements: 1.1, 2.3, 3.1, 5.1, 6.1_

  - [x] 7.2 Update CHANGELOG.md with force refresh feature entry
    - Add entry under `[1.3.14]` in the "Added" section
    - Entry: `forceRefresh` option in `connection.options` to bypass cache expiration and always fetch from origin
    - _Requirements: 7.1_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation language is JavaScript (Node.js), matching the existing codebase
- Test files use `.jest.mjs` extension per project conventions
- Use tabs for indentation and double quotes for strings in all code
- Use `TestHarness.getInternals()` to access `CacheData` for mocking in tests
- Use `jest.spyOn(tools.default.AWS, 'dynamo', 'get')` pattern for getter mocking
- Minimum 100 iterations per property test using fast-check
