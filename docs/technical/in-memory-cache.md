# In-Memory L0 Cache - Technical Documentation

## Overview

The In-Memory L0 Cache is an ultra-fast caching layer that provides microsecond-level access to frequently accessed data in AWS Lambda functions. It sits in front of the existing DynamoDB and S3 cache layers, reducing network latency and improving request performance.

This document provides technical details for maintainers and developers working with the in-memory cache implementation.

## Architecture

### System Design

The in-memory cache operates as a standalone module (`InMemoryCache`) that integrates into the existing `Cache` class through a feature flag. The architecture follows these principles:

1. **Non-authoritative**: The in-memory cache is best-effort and does not replace DynamoDB/S3 as the source of truth
2. **Lambda-optimized**: Designed specifically for AWS Lambda's execution model with synchronous operations
3. **Feature-flagged**: Can be enabled/disabled without code changes
4. **Standalone**: Independently testable without external dependencies

### Data Flow

```
Client Request
    ↓
Cache.read()
    ↓
Feature Flag Enabled? ──No──→ DynamoDB/S3
    ↓ Yes
L0_Cache.get()
    ↓
Cache Status?
    ├─ 1 (Hit) ──→ Return immediately
    ├─ 0 (Miss) ──→ Fetch from DynamoDB → Store in L0_Cache → Return
    └─ -1 (Expired) ──→ Retain stale data → Fetch from DynamoDB
                        ├─ Success → Store fresh data → Return
                        └─ Error → Update stale expiration → Store → Return with error status
```

### Integration Points

The in-memory cache integrates with the existing cache system at three key points:

1. **Cache.init()**: Initializes the InMemoryCache instance based on feature flag
2. **Cache.read()**: Checks L0_Cache before calling DynamoDB
3. **Error handling**: Uses expired L0_Cache data as fallback when DynamoDB fails

## Implementation Details

### InMemoryCache Class

**Location**: `src/lib/utils/InMemoryCache.js`

The `InMemoryCache` class provides the core caching functionality using JavaScript's native `Map` data structure.

#### Storage Structure

Each cache entry is stored as:

```javascript
{
  value: CacheDataFormat,  // The cached data
  expiresAt: number        // Expiration timestamp in milliseconds
}
```

The `Map` key is the `idHash` (a hash of the request parameters), and the value is the entry object above.

#### Key Methods

**constructor(options)**

Initializes the cache with memory-based capacity calculation:

- Reads `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` environment variable
- Calculates `maxEntries = (memoryMB / 1024) * entriesPerGB`
- Falls back to `defaultMaxEntries` if Lambda memory unavailable
- Supports explicit `maxEntries` override

**get(key)**

Retrieves a cache entry with three possible outcomes:

- **Status 1 (Hit)**: Entry exists and is not expired
  - Updates LRU position by deleting and re-setting
  - Returns cached data
- **Status 0 (Miss)**: Entry does not exist
  - Returns null data
- **Status -1 (Expired)**: Entry exists but is expired
  - Deletes entry from cache
  - Returns expired data (for potential fallback use)

**set(key, value, expiresAt)**

Stores a cache entry with LRU eviction:

1. If key exists, delete it first (for LRU repositioning)
2. Check if at capacity (`size >= maxEntries`)
3. If at capacity, evict oldest entry (first in Map)
4. Store new entry at end of Map

### LRU Eviction Strategy

The LRU (Least Recently Used) eviction policy is implemented using JavaScript Map's insertion order guarantee:

- **Insertion order**: Map maintains the order in which keys were inserted
- **Oldest entry**: The first entry in the Map is the least recently used
- **LRU update**: When an entry is accessed, it's deleted and re-inserted to move it to the end
- **Eviction**: When at capacity, the first entry (oldest) is deleted

This approach provides O(1) time complexity for all operations:
- Get: O(1) - Map lookup + delete + set
- Set: O(1) - Map set + potential delete of oldest
- Eviction: O(1) - Delete first entry using `map.keys().next().value`

### Expiration Semantics

The cache enforces strict expiration checking:

1. **Check on every read**: Expiration is checked on every `get()` call
2. **Immediate deletion**: Expired entries are deleted immediately upon detection
3. **Return expired data**: Expired data is returned with status -1 to allow fallback handling
4. **No background cleanup**: No timers or periodic sweeps (Lambda-safe)

Expiration timestamps are stored in milliseconds (`Date.now()` format) for consistency with JavaScript's native time handling.

### Memory Management

#### MAX_ENTRIES Calculation

The cache automatically adapts to Lambda memory allocation:

```javascript
maxEntries = (memoryMB / 1024) * entriesPerGB
```

**Default heuristic**: 5000 entries per GB of Lambda memory

**Example calculations**:
- 512 MB Lambda: `(512 / 1024) * 5000 = 2500 entries`
- 1024 MB Lambda: `(1024 / 1024) * 5000 = 5000 entries`
- 2048 MB Lambda: `(2048 / 1024) * 5000 = 10000 entries`

**Fallback**: If `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` is unavailable, defaults to 1000 entries

**Override**: Can be explicitly set via `maxEntries` parameter in constructor

#### Memory Safety

The cache prioritizes memory safety through:

1. **Bounded capacity**: Hard limit on number of entries
2. **Synchronous eviction**: Eviction happens immediately during `set()`
3. **No background processes**: No timers or async cleanup that could leak memory
4. **Prefer eviction over allocation failure**: Always evict before adding new entries

### Lambda Execution Model Considerations

The implementation is specifically designed for AWS Lambda's execution model:

#### Cold Starts

- Cache initializes with empty Map on cold start
- Initialization is synchronous (no async operations)
- No external dependencies required

#### Warm Invocations

- Cache persists across invocations within the same container
- Data remains available for subsequent requests
- No assumptions about container lifespan

#### Container Isolation

- Each Lambda container has its own cache instance
- No synchronization across concurrent containers
- Cache is local to the container's memory space

#### No Background Processes

- No timers, intervals, or background cleanup
- All operations are synchronous
- Safe for Lambda's freeze/thaw lifecycle

## Cache.read() Integration

The `Cache.read()` method integrates the L0_Cache into the existing cache flow:

### Flow Logic

```javascript
async read() {
  // 1. Check if already loaded
  if (this.#store !== null) return this.#store;
  
  let staleData = null;
  
  // 2. Check L0_Cache if enabled
  if (Cache.#useInMemoryCache && Cache.#inMemoryCache !== null) {
    const memResult = Cache.#inMemoryCache.get(this.#idHash);
    
    if (memResult.cache === 1) {
      // Hit - return immediately
      this.#store = memResult.data;
      this.#status = Cache.STATUS_CACHE_IN_MEM;
      return this.#store;
    } else if (memResult.cache === -1) {
      // Expired - retain for fallback
      staleData = memResult.data;
    }
  }
  
  // 3. Fetch from DynamoDB
  try {
    this.#store = await CacheData.read(this.#idHash, this.#syncedLaterTimestampInSeconds);
    this.#status = (this.#store.cache.statusCode === null) ? 
      Cache.STATUS_NO_CACHE : Cache.STATUS_CACHE;
    
    // 4. Store in L0_Cache if successful
    if (Cache.#useInMemoryCache && Cache.#inMemoryCache !== null && 
        this.#store.cache.statusCode !== null) {
      const expiresAt = this.#store.cache.expires * 1000;
      Cache.#inMemoryCache.set(this.#idHash, this.#store, expiresAt);
    }
    
    return this.#store;
  } catch (error) {
    // 5. Error handling with stale data fallback
    if (staleData !== null) {
      const newExpires = this.#syncedNowTimestampInSeconds + 
        this.#defaultExpirationExtensionOnErrorInSeconds;
      const newExpiresAt = newExpires * 1000;
      
      staleData.cache.expires = newExpires;
      
      if (Cache.#useInMemoryCache && Cache.#inMemoryCache !== null) {
        Cache.#inMemoryCache.set(this.#idHash, staleData, newExpiresAt);
      }
      
      this.#store = staleData;
      this.#status = Cache.STATUS_CACHE_ERROR;
      return this.#store;
    }
    
    // No stale data available
    this.#store = CacheData.format(this.#syncedLaterTimestampInSeconds);
    this.#status = Cache.STATUS_CACHE_ERROR;
    return this.#store;
  }
}
```

### Status Codes

The cache introduces a new status code:

- **`STATUS_CACHE_IN_MEM`** (`"cache:memory"`): Data served from in-memory cache

Existing status codes remain unchanged:
- `STATUS_NO_CACHE`: No cached data available
- `STATUS_CACHE`: Data served from DynamoDB/S3
- `STATUS_CACHE_ERROR`: Error occurred, stale data returned if available
- `STATUS_EXPIRED`: Cache expired (existing behavior)

### Error Handling with Stale Data

When DynamoDB fails and expired L0_Cache data exists:

1. Calculate new expiration: `syncedNow + defaultExpirationExtensionOnErrorInSeconds`
2. Update expired data's expiration field
3. Store updated data back in L0_Cache
4. Return data with `STATUS_CACHE_ERROR`

This provides graceful degradation when the authoritative cache is unavailable.

## Feature Flag Configuration

### Initialization

The feature flag is set during `Cache.init()`:

```javascript
Cache.init({
  // ... other parameters ...
  useInMemoryCache: true,  // Enable in-memory cache
  inMemoryCacheMaxEntries: 5000,  // Optional: override calculated max
  inMemoryCacheEntriesPerGB: 5000,  // Optional: override heuristic
  inMemoryCacheDefaultMaxEntries: 1000  // Optional: override fallback
});
```

### Environment Variable

Alternatively, use the `CACHE_USE_IN_MEMORY` environment variable:

```bash
CACHE_USE_IN_MEMORY=true
```

### Default Behavior

- **Default**: `false` (disabled)
- **Backward compatible**: Existing code continues to work without changes
- **Graceful degradation**: If initialization fails, cache falls back to DynamoDB/S3

### Runtime Behavior

When feature flag is `false`:
- L0_Cache is not initialized
- No memory allocated for cache
- All requests go directly to DynamoDB/S3
- Zero performance impact

When feature flag is `true`:
- L0_Cache is initialized on cold start
- Cache checks occur before DynamoDB calls
- Microsecond-level access for cache hits

## Performance Characteristics

### Time Complexity

All cache operations are O(1):

- **get()**: O(1) - Map lookup, delete, set
- **set()**: O(1) - Map set, potential delete
- **Eviction**: O(1) - Delete first entry

### Latency

- **Cache hit**: Microseconds (in-memory Map lookup)
- **Cache miss**: DynamoDB latency + microseconds (L0_Cache set)
- **Expired entry**: DynamoDB latency + microseconds (L0_Cache set)

### Memory Usage

Approximate memory per entry:
- Key (idHash): ~64 bytes (SHA-256 hash)
- Value (CacheDataFormat): Variable (typically 1-10 KB)
- Map overhead: ~100 bytes

**Example**: 5000 entries with 5 KB average value = ~25 MB

## Testing Strategy

### Unit Tests

Located in `test/cache/in-memory-cache/unit/`:

- Basic operations (get, set, clear)
- Constructor and memory configuration
- Edge cases (empty cache, single entry, at capacity)

### Property-Based Tests

Located in `test/cache/in-memory-cache/property/`:

- Round-trip preservation
- LRU eviction correctness
- Expiration handling
- Capacity management

Uses `fast-check` library with minimum 100 iterations per property.

### Integration Tests

Located in `test/cache/in-memory-cache/integration/`:

- Cache.read() with L0_Cache enabled
- Feature flag behavior
- Error handling with stale data
- DynamoDB integration

## Maintenance Guidelines

### Adding New Features

When extending the in-memory cache:

1. **Maintain O(1) complexity**: Avoid loops or scans in hot paths
2. **Keep synchronous**: No async operations in get/set
3. **Test independently**: Unit test InMemoryCache before integration
4. **Preserve backward compatibility**: Feature flag must default to false

### Debugging

Enable debug logging to trace cache behavior:

```javascript
// In Cache.read()
tools.DebugAndLog.debug(`In-memory cache hit: ${this.#idHash}`);
tools.DebugAndLog.debug(`In-memory cache expired, retaining stale data: ${this.#idHash}`);
tools.DebugAndLog.debug(`Stored in L0_Cache: ${this.#idHash}`);
```

Use `Cache.info()` to inspect cache state:

```javascript
const info = Cache.info();
console.log(info.useInMemoryCache);  // Feature flag status
console.log(info.inMemoryCache);     // Cache size, maxEntries, memoryMB
```

### Performance Tuning

Adjust the entries-per-GB heuristic based on your data:

- **Small entries** (< 1 KB): Increase `entriesPerGB` (e.g., 10000)
- **Large entries** (> 10 KB): Decrease `entriesPerGB` (e.g., 2000)
- **Monitor**: Use CloudWatch to track Lambda memory usage

### Common Issues

**Issue**: Cache not being used
- **Check**: Feature flag is enabled (`useInMemoryCache: true` or `CACHE_USE_IN_MEMORY=true`)
- **Check**: Cache.init() was called before creating Cache instances

**Issue**: High memory usage
- **Solution**: Reduce `entriesPerGB` or set explicit `maxEntries`
- **Solution**: Increase Lambda memory allocation

**Issue**: Low cache hit rate
- **Cause**: Lambda containers are being recycled frequently (cold starts)
- **Solution**: Use Lambda provisioned concurrency or reserved concurrency

## Security Considerations

### Data Classification

The in-memory cache respects the existing encryption policy:

- **Private data**: Stored encrypted in DynamoDB, cached encrypted in L0_Cache
- **Public data**: Stored unencrypted in DynamoDB, cached unencrypted in L0_Cache

The cache stores data in the same format as retrieved from DynamoDB.

### Container Isolation

- Each Lambda container has its own cache instance
- No data sharing between containers
- Cache is cleared when container is terminated

### Memory Safety

- Bounded capacity prevents memory exhaustion
- Synchronous eviction ensures predictable memory usage
- No memory leaks from background processes

## Future Enhancements

Potential improvements for future versions:

1. **Metrics**: Add cache hit/miss rate tracking
2. **TTL optimization**: Adaptive TTL based on access patterns
3. **Compression**: Compress large entries to increase capacity
4. **Selective caching**: Cache only frequently accessed entries
5. **Warming**: Pre-populate cache on cold start from DynamoDB

## References

- [JavaScript Map documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
- [AWS Lambda execution context](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-context.html)
- [LRU cache algorithms](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_recently_used_(LRU))

## Version History

- **v1.3.6**: Initial implementation of in-memory L0 cache
