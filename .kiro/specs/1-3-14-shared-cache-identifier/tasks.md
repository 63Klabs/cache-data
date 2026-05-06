# Implementation Plan: Shared Cache Identifier

## Overview

Add a `sharedCacheId` parameter to `Cache.init()` that allows multiple Lambda functions to share cached data by overriding the default per-function salt used in cache key hash generation. The implementation modifies the `Cache` class in `src/lib/dao-cache.js`, updates TypeScript definitions, and adds documentation.

## Tasks

- [x] 1. Add `sharedCacheId` private field and modify `Cache.init()` to accept and validate the parameter
  - [x] 1.1 Add `#sharedCacheId` private static field to the `Cache` class (initialized to `null`)
    - Add `static #sharedCacheId = null;` alongside existing private fields like `#idHashAlgorithm` and `#useToolsHash`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 1.2 Add validation and storage logic in `Cache.init()` for the `sharedCacheId` parameter
    - After existing parameter validation, check if `sharedCacheId` is in parameters
    - If present and not null/undefined, validate it is a string (throw Error if not)
    - If valid string, store in `#sharedCacheId`
    - If null/undefined, fall through to check `CACHE_SHARED_ID` environment variable
    - If env var is set, store its value in `#sharedCacheId`
    - Error message: `"Cache.init() sharedCacheId must be a string, null, or undefined"`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 6.1, 6.2, 6.3_
  - [x] 1.3 Write unit tests for `Cache.init()` sharedCacheId validation
    - Test file: `test/cache/cache-shared-id-validation-tests.jest.mjs`
    - Use subprocess isolation (execSync with direct Jest binary) since Cache.init() is singleton
    - Test: invalid types (number, object, array, boolean) throw Error
    - Test: null and undefined are treated as not provided
    - Test: valid strings (including empty string, whitespace, special chars) are accepted
    - Test: CACHE_SHARED_ID env var is used when parameter not provided
    - Test: parameter takes priority over CACHE_SHARED_ID env var
    - _Requirements: 6.1, 6.2, 6.3, 2.1, 2.2_

- [x] 2. Modify `Cache.generateIdHash()` to use the resolved salt
  - [x] 2.1 Replace the current salt resolution in `generateIdHash()` with priority chain logic
    - Current: `const salt = process.env?.AWS_LAMBDA_FUNCTION_NAME || "";`
    - New: `const salt = this.#sharedCacheId !== null ? this.#sharedCacheId : (process.env?.AWS_LAMBDA_FUNCTION_NAME || "");`
    - This applies to both the `tools.hashThisData` path and the `objHash` path
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 5.1_
  - [x] 2.2 Write property test: Same sharedCacheId produces identical hashes
    - Test file: `test/cache/cache-shared-id-property-tests.jest.mjs`
    - **Property 1: Same sharedCacheId produces identical hashes**
    - **Validates: Requirements 3.1**
    - Use fast-check to generate arbitrary connection objects and sharedCacheId strings
    - Verify that two calls with same sharedCacheId and same connection produce identical hashes
    - Minimum 100 iterations
    - _Requirements: 3.1_
  - [x] 2.3 Write property test: Different sharedCacheId produces different hashes
    - Test file: `test/cache/cache-shared-id-property-tests.jest.mjs`
    - **Property 2: Different sharedCacheId produces different hashes**
    - **Validates: Requirements 3.2**
    - Use fast-check to generate pairs of distinct sharedCacheId strings and connection objects
    - Verify that different sharedCacheId values produce different hashes for same connection
    - Minimum 100 iterations
    - _Requirements: 3.2_
  - [x] 2.4 Write property test: Parameter takes priority over environment variable
    - Test file: `test/cache/cache-shared-id-property-tests.jest.mjs`
    - **Property 3: Parameter takes priority over environment variable**
    - **Validates: Requirements 2.1, 2.2**
    - Use subprocess isolation to test with both parameter and env var set
    - Verify parameter value is used as salt, not env var value
    - _Requirements: 2.1, 2.2_
  - [x] 2.5 Write property test: Backwards compatibility — no sharedCacheId preserves existing behavior
    - Test file: `test/cache/cache-shared-id-property-tests.jest.mjs`
    - **Property 4: Backwards compatibility — no sharedCacheId preserves existing behavior**
    - **Validates: Requirements 5.1**
    - Use fast-check to generate arbitrary connection objects
    - Verify that without sharedCacheId configured, generateIdHash produces same result as current implementation (using AWS_LAMBDA_FUNCTION_NAME)
    - _Requirements: 5.1_
  - [x] 2.6 Write property test: Invalid types are rejected
    - Test file: `test/cache/cache-shared-id-property-tests.jest.mjs`
    - **Property 5: Invalid types are rejected**
    - **Validates: Requirements 6.1**
    - Use fast-check to generate non-string, non-null, non-undefined values
    - Verify that passing them as sharedCacheId throws an Error
    - Use subprocess isolation
    - _Requirements: 6.1_
  - [x] 2.7 Write property test: Null and undefined fall through to environment variable
    - Test file: `test/cache/cache-shared-id-property-tests.jest.mjs`
    - **Property 6: Null and undefined fall through to environment variable**
    - **Validates: Requirements 6.2**
    - Use subprocess isolation to test with CACHE_SHARED_ID env var set
    - Verify that null/undefined sharedCacheId causes env var to be used
    - _Requirements: 6.2_

- [x] 3. Expose `sharedCacheId` in `Cache.info()`
  - [x] 3.1 Add `sharedCacheId` to the object returned by `Cache.info()`
    - Add `info.sharedCacheId = this.#sharedCacheId;` to the info() method
    - Returns `null` when not configured, the string value when configured
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 3.2 Write unit tests for `Cache.info()` sharedCacheId exposure
    - Test file: `test/cache/cache-shared-id-validation-tests.jest.mjs`
    - Test: info() returns null when sharedCacheId not configured
    - Test: info() returns the configured value when sharedCacheId is set
    - Test: info() returns env var value when only CACHE_SHARED_ID is set
    - Use subprocess isolation
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update TypeScript type definitions
  - [x] 5.1 Add `sharedCacheId` to `CacheInitParameters` interface in `types/lib/dao-cache.d.ts`
    - Add: `sharedCacheId?: string;` with JSDoc describing the parameter
    - Include note about `CACHE_SHARED_ID` env var fallback
    - _Requirements: 8.1, 8.2_
  - [x] 5.2 Add `sharedCacheId` to `Cache.info()` return type in `types/lib/dao-cache.d.ts`
    - Add: `sharedCacheId: string | null;` to the info() return type
    - _Requirements: 8.3_
  - [x] 5.3 Run TypeScript type checking to verify definitions compile
    - Run: `npm run test:types`
    - Verify no type errors
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 6. Update user documentation
  - [x] 6.1 Add `sharedCacheId` to the Configuration Options table in `docs/features/cache/README.md`
    - Add row: `sharedCacheId` | string | `CACHE_SHARED_ID` env var or `AWS_LAMBDA_FUNCTION_NAME` | No | Description of shared cache identifier
    - _Requirements: 7.1_
  - [x] 6.2 Add `CACHE_SHARED_ID` to the environment variables section in `docs/features/cache/README.md`
    - Add the env var with description in the environment variables code block
    - _Requirements: 7.4_
  - [x] 6.3 Add a "Shared Cache" usage section with examples in `docs/features/cache/README.md`
    - Show how to configure `sharedCacheId` in `Cache.init()` for cross-function sharing
    - Explain the priority resolution order: parameter → env var → Lambda function name → empty string
    - Include warning about shared expiration semantics
    - Include example showing two Lambda functions sharing cache
    - _Requirements: 7.2, 7.3, 7.5_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Subprocess isolation is required for validation tests because `Cache.init()` is a singleton (can only be called once per process)
- All code uses JavaScript (Node.js >= 20.0.0), tabs for indentation, double quotes for strings
- Test files use `.jest.mjs` extension and are located in `test/cache/`
