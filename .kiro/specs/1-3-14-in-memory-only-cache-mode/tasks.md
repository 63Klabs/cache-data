# Implementation Plan: In-Memory Only Cache Mode

## Overview

Add an `inMemoryOnly` configuration option to the `Cache` class that allows the entire cache system to operate without DynamoDB, S3, or encryption infrastructure. When enabled, the existing `InMemoryCache` class (L0 layer) becomes the sole storage mechanism. The implementation uses guard clauses at key decision points in `Cache.init()`, `cache.read()`, and `cache.update()`, keeping changes localized to the public API layer.

## Tasks

- [ ] 1. Add `#inMemoryOnly` static field and modify `Cache.init()` to support the new mode
  - [x] 1.1 Add `static #inMemoryOnly = false;` private field to the `Cache` class
    - Add alongside existing private fields (`#idHashAlgorithm`, `#useInMemoryCache`, etc.)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 1.2 Add guard clause in `Cache.init()` to resolve `inMemoryOnly` and skip `CacheData.init()` when active
    - Resolve `inMemoryOnly` from `parameters.inMemoryOnly` (priority 1) or `process.env.CACHE_IN_MEMORY_ONLY` (priority 2) using `Cache.bool()`
    - When `inMemoryOnly` is true: set `#inMemoryOnly = true`, force `#useInMemoryCache = true`, instantiate `InMemoryCache` with optional sizing parameters, emit debug log, and **return early** before calling `CacheData.init()`
    - When `inMemoryOnly` is false/not set: proceed with existing initialization flow unchanged
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.2, 5.3, 9.1, 9.2, 9.3, 12.3_
  - [x] 1.3 Write unit tests for `Cache.init()` inMemoryOnly activation
    - Test file: `test/cache/in-memory-only/unit/in-memory-only-unit-tests.jest.mjs`
    - Use subprocess isolation (execSync with direct Jest binary) since `Cache.init()` is singleton
    - Test: `inMemoryOnly: true` activates mode without requiring `secureDataKey`
    - Test: `inMemoryOnly: "true"` and `"1"` activate mode via `Cache.bool()`
    - Test: `CACHE_IN_MEMORY_ONLY` env var activates mode when parameter not provided
    - Test: parameter takes precedence over env var
    - Test: `useInMemoryCache: false` is overridden by `inMemoryOnly: true`
    - Test: InMemoryCache configuration parameters (`inMemoryCacheMaxEntries`, etc.) are passed through
    - Test: debug log message emitted on activation
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 5.1, 5.2, 9.1, 9.2, 9.3_

- [ ] 2. Add guard clause in `cache.read()` for in-memory-only mode
  - [x] 2.1 Implement early-return path in `cache.read()` when `#inMemoryOnly` is true
    - Check `Cache.#inMemoryOnly` at the start of `read()`
    - If true: check `InMemoryCache.get(this.#idHash)`
    - On hit (cache === 1): set `#store` to the cached data, set `#status = STATUS_CACHE_IN_MEM`, resolve
    - On expired (cache === -1): treat as miss (no stale fallback)
    - On miss (cache === 0): set `#store = CacheData.format(this.#syncedLaterTimestampInSeconds)`, set `#status = STATUS_NO_CACHE`, resolve
    - Never call `CacheData.read()`, DynamoDB, or S3
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 2.2 Write property test: Read/Write round-trip via InMemoryCache
    - Test file: `test/cache/in-memory-only/property/in-memory-only-property-tests.jest.mjs`
    - **Property 2: Read/Write Round-Trip via InMemoryCache**
    - **Validates: Requirements 3.1, 3.2, 3.3, 4.1, 4.2, 4.3**
    - Use fast-check to generate arbitrary cache body strings, headers objects, status codes, and expiration timestamps
    - Write data via `cache.update()` then read back via `cache.read()` on same connection
    - Verify returned body, headers, and statusCode match what was written
    - Minimum 100 iterations
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_

- [ ] 3. Add guard clause in `cache.update()` for in-memory-only mode
  - [x] 3.1 Implement early-return path in `cache.update()` when `#inMemoryOnly` is true
    - Check `Cache.#inMemoryOnly` at the start of `update()`
    - If true: format data into `CacheDataFormat` structure directly (no encryption)
    - Store in `InMemoryCache.set(this.#idHash, formattedData, expiresAtMs)` where `expiresAtMs` is the expiration in milliseconds
    - Set `#store` and appropriate `#status`
    - Never call `CacheData.write()`, DynamoDB, or S3
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 3.2 Write property test: Cache miss returns empty format
    - Test file: `test/cache/in-memory-only/property/in-memory-only-property-tests.jest.mjs`
    - **Property 3: Cache Miss Returns Empty Format**
    - **Validates: Requirements 3.4**
    - Use fast-check to generate arbitrary connection objects that have not been written to
    - Verify reading returns `CacheDataFormat` with `body === null`, `headers === null`, `statusCode === null`
    - Minimum 100 iterations
    - _Requirements: 3.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Add property tests for initialization and backwards compatibility
  - [x] 5.1 Write property test: Relaxed initialization in memory-only mode
    - Test file: `test/cache/in-memory-only/property/in-memory-only-property-tests.jest.mjs`
    - **Property 1: Relaxed Initialization in Memory-Only Mode**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
    - Use fast-check to generate arbitrary init parameter objects with `inMemoryOnly: true` and random presence/absence of `secureDataKey`, `dynamoDbTable`, `s3Bucket`
    - Verify `Cache.init()` succeeds without throwing regardless of missing infrastructure params
    - Use subprocess isolation
    - Minimum 100 iterations
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [x] 5.2 Write property test: Backwards compatibility — secureDataKey required without inMemoryOnly
    - Test file: `test/cache/in-memory-only/property/in-memory-only-property-tests.jest.mjs`
    - **Property 4: Backwards Compatibility — secureDataKey Required Without inMemoryOnly**
    - **Validates: Requirements 1.4, 7.1, 7.3, 7.4**
    - Use fast-check to generate init parameter objects without `inMemoryOnly` (or with it set to false) and without `secureDataKey`
    - Verify `Cache.init()` throws an error
    - Use subprocess isolation
    - Minimum 100 iterations
    - _Requirements: 1.4, 7.1, 7.3, 7.4_
  - [x] 5.3 Write property test: Expiration is respected in memory-only mode
    - Test file: `test/cache/in-memory-only/property/in-memory-only-property-tests.jest.mjs`
    - **Property 5: Expiration Is Respected in Memory-Only Mode**
    - **Validates: Requirements 4.4, 8.3**
    - Use fast-check to generate cache entries with short expiration timestamps
    - Write data, advance time past expiration (or use already-expired timestamps), then read
    - Verify read returns cache miss (empty format)
    - _Requirements: 4.4, 8.3_

- [ ] 6. Extend `Cache.info()` with `inMemoryOnly` property
  - [x] 6.1 Add `inMemoryOnly` boolean to the object returned by `Cache.info()`
    - Add `info.inMemoryOnly = Cache.#inMemoryOnly;` (or `this.#inMemoryOnly`) to the `info()` method
    - Returns `false` when not configured, `true` when in-memory-only mode is active
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 6.2 Write unit tests for `Cache.info()` inMemoryOnly exposure
    - Test file: `test/cache/in-memory-only/unit/in-memory-only-unit-tests.jest.mjs`
    - Test: `info()` returns `inMemoryOnly: false` when mode not activated
    - Test: `info()` returns `inMemoryOnly: true` when mode is activated
    - Test: `info()` includes `useInMemoryCache: true` and `inMemoryCache` object when mode is active
    - Use subprocess isolation
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Update TypeScript type definitions
  - [x] 8.1 Add `inMemoryOnly` to `CacheInitParameters` interface in `types/index.d.ts`
    - Add: `inMemoryOnly?: boolean;` with JSDoc describing the parameter
    - Include note about `CACHE_IN_MEMORY_ONLY` env var fallback
    - _Requirements: 11.1, 11.2_
  - [x] 8.2 Add `inMemoryOnly` to `Cache.info()` return type in `types/index.d.ts`
    - Add: `inMemoryOnly: boolean;` to the info() return type
    - _Requirements: 11.3_
  - [x] 8.3 Run TypeScript type checking to verify definitions compile
    - Run: `npm run test:types`
    - Verify no type errors
    - _Requirements: 11.1, 11.2, 11.3_

- [ ] 9. Update user documentation
  - [x] 9.1 Add `inMemoryOnly` to the Configuration Options table in `docs/features/cache/README.md`
    - Add row: `inMemoryOnly` | boolean | `false` | No | Enable in-memory-only mode (no DynamoDB/S3/encryption)
    - _Requirements: 10.1_
  - [x] 9.2 Add `CACHE_IN_MEMORY_ONLY` to the environment variables section in `docs/features/cache/README.md`
    - Add the env var with description in the environment variables code block
    - _Requirements: 10.4_
  - [x] 9.3 Add an "In-Memory Only Mode" usage section with examples in `docs/features/cache/README.md`
    - Show how to configure `inMemoryOnly: true` in `Cache.init()` for lightweight applications
    - Explain trade-offs: no persistence across Lambda invocations, no sharing between concurrent instances
    - Explain interaction between `inMemoryOnly` and `useInMemoryCache` parameters
    - Include usage example for heartbeat/health-check services and development environments
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 12.1, 12.2_

- [ ] 10. Write integration tests for CacheableDataAccess compatibility
  - [x] 10.1 Write integration tests for end-to-end flows in memory-only mode
    - Test file: `test/cache/in-memory-only/integration/in-memory-only-integration-tests.jest.mjs`
    - Test: `CacheableDataAccess.getData()` full flow (miss → fetch → store → hit)
    - Test: Cache expiration and refresh cycle in memory-only mode
    - Test: Multiple Cache instances sharing the same InMemoryCache in memory-only mode
    - Test: `extendExpires()` behavior in memory-only mode (if applicable)
    - Use subprocess isolation where needed for fresh `Cache.init()` calls
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Subprocess isolation is required for validation tests because `Cache.init()` is a singleton (can only be called once per process)
- All code uses JavaScript (Node.js >= 20.0.0), tabs for indentation, double quotes for strings
- Test files use `.jest.mjs` extension and are located in `test/cache/in-memory-only/`
- Property-based tests use fast-check (already in devDependencies)
- The `TestHarness.getInternals()` pattern can be used to spy on `CacheData.read`/`CacheData.write` to verify they are never called in memory-only mode
