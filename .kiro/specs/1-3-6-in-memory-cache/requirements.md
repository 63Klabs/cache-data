# Requirements Document: In-Memory L0 Cache

## Introduction

This document specifies the requirements for an ultra-fast in-memory L0 cache layer for an AWS Lambda caching library. The library currently uses DynamoDB and S3 as authoritative data sources, which introduce millisecond-level network latency. Lambda functions are provisioned with high memory allocations (512 MB to 1024 MB and above), leaving unused memory capacity available. The in-memory cache will leverage this unused memory to provide microsecond-level cache reads, reducing repeated DynamoDB reads and improving request latency.

The cache must be best-effort, non-authoritative, and optimized for the Lambda execution model. It will operate as a standalone module that can be toggled on/off via feature flag and integrated into the existing Cache.read() flow.

## Glossary

- **L0_Cache**: The in-memory cache module that provides microsecond-level access to cached data
- **Cache**: The existing Cache class in src/lib/dao-cache.js that manages cache reads and writes
- **CacheData**: The existing CacheData class that handles DynamoDB and S3 operations
- **CacheDataFormat**: The data format returned by Cache.read() containing cache metadata and body
- **Lambda_Container**: An AWS Lambda execution environment that persists across invocations
- **LRU**: Least Recently Used eviction policy
- **Expiration_Timestamp**: Unix timestamp in seconds indicating when cached data expires
- **Feature_Flag**: A configuration parameter that enables or disables the in-memory cache

## Requirements

### Requirement 1: In-Memory Storage

**User Story:** As a Lambda function, I want to store cache entries in memory, so that I can access them with microsecond-level latency.

#### Acceptance Criteria

1. THE L0_Cache SHALL store cache entries using JavaScript Map data structure
2. WHEN a cache entry is stored, THE L0_Cache SHALL include the value and expiration timestamp
3. THE L0_Cache SHALL NOT persist data across Lambda container restarts
4. THE L0_Cache SHALL NOT synchronize data across concurrent Lambda instances
5. THE L0_Cache SHALL operate entirely in memory without external storage

### Requirement 2: Cache Lookup Operations

**User Story:** As a developer, I want to look up cache entries by key, so that I can retrieve cached data quickly.

#### Acceptance Criteria

1. WHEN a cache key exists and is not expired, THE L0_Cache SHALL return cache status 1 with the cached data
2. WHEN a cache key does not exist, THE L0_Cache SHALL return cache status 0 with null data
3. WHEN a cache key exists but is expired, THE L0_Cache SHALL delete the entry, return cache status -1 with the expired data
4. THE L0_Cache SHALL check expiration on every read operation
5. THE L0_Cache SHALL execute lookup operations in O(1) time complexity

### Requirement 3: Cache Storage Operations

**User Story:** As a developer, I want to store cache entries with expiration times, so that stale data is automatically removed.

#### Acceptance Criteria

1. WHEN storing a cache entry, THE L0_Cache SHALL accept a key, CacheDataFormat value, and expiration timestamp
2. THE L0_Cache SHALL derive the internal expiration timestamp from the cache.expires field in CacheDataFormat
3. WHEN storing a cache entry, THE L0_Cache SHALL update the entry if the key already exists
4. THE L0_Cache SHALL execute storage operations in O(1) time complexity
5. THE L0_Cache SHALL NOT modify expiration times provided by the caller

### Requirement 4: LRU Eviction Policy

**User Story:** As a Lambda function with limited memory, I want the cache to evict least recently used entries, so that memory usage remains bounded.

#### Acceptance Criteria

1. WHEN the cache exceeds MAX_ENTRIES, THE L0_Cache SHALL evict the least recently used entry
2. THE L0_Cache SHALL use Map insertion order to determine least recently used entries
3. WHEN a cache entry is accessed, THE L0_Cache SHALL update its position to most recently used
4. THE L0_Cache SHALL perform eviction synchronously during storage operations
5. THE L0_Cache SHALL NOT use background timers or async cleanup for eviction

### Requirement 5: Memory Management

**User Story:** As a Lambda function, I want the cache to adapt to available memory, so that I avoid out-of-memory errors.

#### Acceptance Criteria

1. THE L0_Cache SHALL read Lambda memory allocation from process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE
2. THE L0_Cache SHALL calculate MAX_ENTRIES based on Lambda memory allocation
3. THE L0_Cache SHALL use a configurable heuristic for MAX_ENTRIES calculation (default: 5000 entries per GB)
4. WHEN MAX_ENTRIES cannot be determined, THE L0_Cache SHALL use a safe default value
5. THE L0_Cache SHALL prefer eviction over allocation failure

### Requirement 6: Expiration Semantics

**User Story:** As a developer, I want strict expiration enforcement, so that expired data is never served as valid.

#### Acceptance Criteria

1. WHEN checking expiration, THE L0_Cache SHALL compare current time against the stored expiration timestamp
2. THE L0_Cache SHALL treat expiration as authoritative and non-approximate
3. WHEN an entry is expired, THE L0_Cache SHALL delete it from the cache immediately
4. THE L0_Cache SHALL return expired data with cache status -1 to allow fallback handling
5. THE L0_Cache SHALL NOT perform periodic expiration sweeps or background cleanup

### Requirement 7: CacheDataFormat Interface

**User Story:** As a developer, I want the cache to use the existing CacheDataFormat, so that integration is seamless.

#### Acceptance Criteria

1. THE L0_Cache SHALL accept CacheDataFormat objects for storage
2. THE L0_Cache SHALL return CacheDataFormat objects for retrieval
3. THE L0_Cache SHALL preserve all fields in CacheDataFormat without modification
4. THE L0_Cache SHALL extract expiration from the cache.expires field in CacheDataFormat
5. THE L0_Cache SHALL return objects matching the format: {cache: number, data: CacheDataFormat|null}

### Requirement 8: Feature Flag Integration

**User Story:** As a developer, I want to toggle the in-memory cache on/off, so that I can control when it is used.

#### Acceptance Criteria

1. THE Cache SHALL accept a useInMemoryCache parameter during initialization
2. THE Cache SHALL read the CACHE_USE_IN_MEMORY environment variable if no parameter is provided
3. THE Cache SHALL default the feature flag to false (disabled)
4. WHEN the feature flag is false, THE Cache SHALL NOT use the L0_Cache
5. WHEN the feature flag is true, THE Cache SHALL check L0_Cache before calling CacheData.read()

### Requirement 9: Cache.read() Integration

**User Story:** As a developer, I want Cache.read() to check the in-memory cache first, so that I get the fastest possible response.

#### Acceptance Criteria

1. WHEN the feature flag is enabled and cache status is 1, THE Cache.read() SHALL return the in-memory cached data immediately
2. WHEN the feature flag is enabled and cache status is 0, THE Cache.read() SHALL call CacheData.read() to fetch from DynamoDB
3. WHEN the feature flag is enabled and cache status is -1, THE Cache.read() SHALL retain the expired data and call CacheData.read()
4. WHEN CacheData.read() returns an error and expired data exists, THE Cache.read() SHALL store the stale data in L0_Cache with expiration calculated from Cache.#defaultExpirationExtensionOnErrorInSeconds and return it with STATUS_CACHE_ERROR
5. WHEN CacheData.read() succeeds, THE Cache.read() SHALL store the fresh data in L0_Cache

### Requirement 10: Lambda Execution Model Safety

**User Story:** As a Lambda function, I want the cache to operate safely across cold starts and warm invocations, so that it doesn't cause errors.

#### Acceptance Criteria

1. WHEN a Lambda container cold starts, THE L0_Cache SHALL initialize with an empty cache
2. THE L0_Cache SHALL initialize synchronously without async operations
3. WHEN a Lambda container is reused, THE L0_Cache SHALL persist data across invocations
4. THE L0_Cache SHALL NOT make assumptions about container lifespan
5. THE L0_Cache SHALL NOT use timers, intervals, or background processes

### Requirement 11: Performance Requirements

**User Story:** As a developer, I want microsecond-level cache access, so that I minimize request latency.

#### Acceptance Criteria

1. THE L0_Cache SHALL execute cache hit operations in microseconds
2. THE L0_Cache SHALL NOT perform loops or scans on the hot path
3. THE L0_Cache SHALL use constant-time operations for lookup and storage
4. THE L0_Cache SHALL minimize branching in critical paths
5. THE L0_Cache SHALL NOT perform async operations during lookup

### Requirement 12: Standalone Module Structure

**User Story:** As a developer, I want the cache as a standalone module, so that I can test it independently.

#### Acceptance Criteria

1. THE L0_Cache SHALL be implemented in src/lib/utils directory
2. THE L0_Cache SHALL NOT depend on DynamoDB or S3 clients
3. THE L0_Cache SHALL NOT import Cache or CacheData classes
4. THE L0_Cache SHALL export a class or function that can be imported by Cache
5. THE L0_Cache SHALL be testable with mock data without external connections

### Requirement 13: Status Code Support

**User Story:** As a developer, I want a specific status code for in-memory cache hits, so that I can track cache performance.

#### Acceptance Criteria

1. THE Cache SHALL define STATUS_CACHE_IN_MEM constant with value "cache:memory"
2. WHEN data is served from L0_Cache, THE Cache SHALL set status to STATUS_CACHE_IN_MEM
3. THE Cache SHALL preserve existing status codes for DynamoDB and S3 cache hits
4. THE Cache SHALL use STATUS_CACHE_ERROR when returning stale data after DynamoDB errors
5. THE Cache SHALL include status information in response headers via x-cprxy-data-source

### Requirement 14: Error Handling and Fallback

**User Story:** As a developer, I want graceful fallback when DynamoDB fails, so that users still get data when possible.

#### Acceptance Criteria

1. WHEN CacheData.read() fails and expired cache data exists, THE Cache SHALL return the expired data
2. WHEN returning expired data due to errors, THE Cache SHALL update the expiration timestamp
3. WHEN returning expired data due to errors, THE Cache SHALL use the error expiration extension configured in Cache
4. WHEN returning expired data due to errors, THE Cache SHALL set status to STATUS_CACHE_ERROR
5. WHEN CacheData.read() succeeds after an error, THE Cache SHALL replace stale data with fresh data in L0_Cache

### Requirement 15: Documentation

**User Story:** As a maintainer and end user, I want documentation, so that I can understand, maintain, and configure the feature.

#### Acceptance Criteria

1. THE technical documentation SHALL be placed in docs/technical directory
2. THE end-user documentation SHALL be added to docs/features/cache/README.md
3. THE documentation SHALL be written in Markdown format
4. THE technical documentation SHALL explain the architecture and design decisions
5. THE end-user documentation SHALL explain how to enable the feature flag via Cache init parameter or CACHE_USE_IN_MEMORY environment variable
