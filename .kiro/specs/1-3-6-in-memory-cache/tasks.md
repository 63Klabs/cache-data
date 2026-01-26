# Implementation Plan: In-Memory L0 Cache

## Overview

This implementation plan breaks down the in-memory L0 cache feature into discrete coding tasks. The approach follows a standalone-first strategy: build and test the InMemoryCache module independently, then integrate it into the Cache class with feature flag control.

The implementation prioritizes correctness through property-based testing and maintains backward compatibility by keeping the feature disabled by default.

## Tasks

- [x] 1. Set up InMemoryCache module structure and basic implementation
  - Create `src/lib/utils/InMemoryCache.js` file
  - Implement constructor with memory-based MAX_ENTRIES calculation
  - Implement basic Map storage initialization
  - Add info() method for introspection
  - _Requirements: 1.1, 1.2, 5.1, 5.2, 5.4, 12.1, 12.4_

- [x] 2. Implement core cache operations
  - [x] 2.1 Implement get() method with expiration checking
    - Check if key exists in Map
    - Handle cache miss (return status 0)
    - Handle cache hit (return status 1, update LRU position)
    - Handle expired entry (return status -1, delete entry)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 6.2, 6.3_

  - [x] 2.2 Write property test for get() with valid entries
    - **Property 2: Valid Entry Returns Hit Status**
    - **Validates: Requirements 2.1**

  - [x] 2.3 Write property test for get() with missing keys
    - **Property 3: Missing Key Returns Miss Status**
    - **Validates: Requirements 2.2**

  - [x] 2.4 Write property test for get() with expired entries
    - **Property 4: Expired Entry Returns Expired Status and Deletes**
    - **Validates: Requirements 2.3, 6.3**

  - [x] 2.5 Implement set() method with LRU eviction
    - Delete existing key if present (for LRU repositioning)
    - Check capacity and evict oldest entry if at MAX_ENTRIES
    - Store new entry with value and expiresAt
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 4.4_

  - [x] 2.6 Write property test for set() updating existing keys
    - **Property 5: Storing Existing Key Updates Entry**
    - **Validates: Requirements 3.3**

  - [x] 2.7 Write property test for round-trip preservation
    - **Property 1: Cache Entry Round-Trip Preservation**
    - **Validates: Requirements 1.2, 3.5, 7.3**

- [x] 3. Implement LRU eviction logic
  - [x] 3.1 Implement capacity checking in set()
    - Check if Map.size >= maxEntries before adding
    - Get first (oldest) entry using Map.keys().next().value
    - Delete oldest entry
    - _Requirements: 4.1, 4.2, 5.5_

  - [x] 3.2 Write property test for LRU eviction at capacity
    - **Property 6: LRU Eviction When At Capacity**
    - **Validates: Requirements 4.1**

  - [x] 3.3 Implement LRU position update in get()
    - Delete entry from Map
    - Re-set entry to move to end (most recent)
    - _Requirements: 4.3_

  - [x] 3.4 Write property test for LRU position update on access
    - **Property 7: Access Updates LRU Position**
    - **Validates: Requirements 4.3**

- [x] 4. Implement memory management and configuration
  - [x] 4.1 Implement MAX_ENTRIES calculation in constructor
    - Read process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE
    - Calculate maxEntries = (memoryMB / 1024) * entriesPerGB
    - Use defaultMaxEntries if memory size unavailable
    - Support custom maxEntries parameter override
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.2 Write property test for MAX_ENTRIES calculation
    - **Property 8: MAX_ENTRIES Calculation From Memory**
    - **Validates: Requirements 5.2**

  - [x] 4.3 Write unit tests for memory configuration edge cases
    - Test with missing AWS_LAMBDA_FUNCTION_MEMORY_SIZE
    - Test with custom maxEntries parameter
    - Test with custom entriesPerGB heuristic
    - _Requirements: 5.3, 5.4_

  - [x] 4.4 Implement clear() method for testing
    - Clear all entries from Map
    - _Requirements: 12.5_

- [x] 5. Checkpoint - Ensure InMemoryCache tests pass
  - Ensure all InMemoryCache unit and property tests pass, ask the user if questions arise.

- [x] 6. Add feature flag support to Cache class
  - [x] 6.1 Add static properties to Cache class
    - Add STATUS_CACHE_IN_MEM constant
    - Add #useInMemoryCache static property (default false)
    - Add #inMemoryCache static property (default null)
    - _Requirements: 8.3, 13.1_

  - [x] 6.2 Modify Cache.init() to support feature flag
    - Read useInMemoryCache parameter
    - Read CACHE_USE_IN_MEMORY environment variable as fallback
    - Initialize InMemoryCache instance if enabled
    - Pass configuration options (maxEntries, entriesPerGB, defaultMaxEntries)
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 6.3 Write unit tests for feature flag initialization
    - Test with useInMemoryCache parameter true
    - Test with useInMemoryCache parameter false
    - Test with CACHE_USE_IN_MEMORY environment variable
    - Test default behavior (false)
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 6.4 Modify Cache.info() to include L0_Cache information
    - Add useInMemoryCache flag to info object
    - Add inMemoryCache.info() if enabled
    - _Requirements: 8.1_

- [x] 7. Integrate L0_Cache into Cache.read()
  - [x] 7.1 Add L0_Cache lookup before DynamoDB read
    - Check if feature flag is enabled
    - Call L0_Cache.get(idHash)
    - Handle cache hit (status 1): return immediately with STATUS_CACHE_IN_MEM
    - Handle cache miss (status 0): continue to DynamoDB
    - Handle expired (status -1): retain stale data, continue to DynamoDB
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 7.2 Add L0_Cache storage after successful DynamoDB read
    - Check if feature flag is enabled
    - Convert expires from seconds to milliseconds
    - Call L0_Cache.set(idHash, store, expiresAt)
    - _Requirements: 9.5_

  - [x] 7.3 Add error fallback with stale data handling
    - In catch block, check if staleData exists
    - Calculate new expiration using defaultExpirationExtensionOnErrorInSeconds
    - Update stale data expiration field
    - Store updated stale data in L0_Cache
    - Return stale data with STATUS_CACHE_ERROR
    - _Requirements: 9.4, 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 7.4 Write integration tests for Cache.read() with L0_Cache
    - Test cache hit returns immediately
    - Test cache miss calls DynamoDB
    - Test expired entry with successful DynamoDB refresh
    - Test expired entry with DynamoDB error (stale data returned)
    - Test feature flag disabled (L0_Cache not used)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 8.4_

  - [x] 7.5 Write property test for feature flag disabled
    - **Property 9: Feature Flag Disabled Prevents L0_Cache Usage**
    - **Validates: Requirements 8.4**

  - [x] 7.6 Write property test for cache hit returns immediately
    - **Property 10: Cache Hit Returns Data Immediately**
    - **Validates: Requirements 9.1**

- [x] 8. Checkpoint - Ensure integration tests pass
  - Ensure all Cache integration tests pass, ask the user if questions arise.

- [x] 9. Create technical documentation
  - [x] 9.1 Create docs/technical/in-memory-cache.md
    - Document architecture and design decisions
    - Explain LRU eviction strategy
    - Explain expiration semantics
    - Document memory management approach
    - Include integration instructions for maintainers
    - Explain Lambda execution model considerations
    - _Requirements: 15.1, 15.3, 15.4_

  - [x] 9.2 Update docs/features/cache/README.md with end-user documentation
    - Document useInMemoryCache initialization parameter
    - Document CACHE_USE_IN_MEMORY environment variable
    - Explain feature flag default (false)
    - Provide configuration examples
    - Explain STATUS_CACHE_IN_MEM status code
    - _Requirements: 15.2, 15.5_

- [x] 10. Final integration and validation
  - [x] 10.1 Review and finalize Cache.read() integration
    - Verify L0_Cache is checked before DynamoDB
    - Verify feature flag controls L0_Cache usage
    - Verify stale data fallback works correctly
    - Verify status codes are set correctly
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 13.2, 13.3, 13.4, 13.5_

  - [x] 10.2 Run full test suite
    - Run all InMemoryCache unit tests
    - Run all InMemoryCache property tests
    - Run all Cache integration tests
    - Verify no regressions in existing Cache tests
    - _Requirements: 12.5_

  - [x] 10.3 Verify no modifications to existing code until this task
    - Confirm CacheData class unchanged
    - Confirm S3Cache class unchanged
    - Confirm DynamoDbCache class unchanged
    - Confirm only Cache class modified for integration
    - _Requirements: 12.2, 12.3_

## Notes

- Each task references specific requirements for traceability
- Property tests validate universal correctness properties with minimum 100 iterations
- Unit tests validate specific examples and edge cases
- Integration tests validate Cache.read() flow with L0_Cache
- Checkpoints ensure incremental validation
- No existing code is modified until final integration task (10.1)
- Feature flag defaults to false for backward compatibility
- InMemoryCache is standalone and testable without DynamoDB connections
