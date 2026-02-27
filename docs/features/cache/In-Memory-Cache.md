# In-Memory Cache

> **Note:** In-Memory Cache is DISABLED by default. You must use an environment variable or parameter when initializing Cache.init() to enable it.

## Cache Tiers

The caching system uses a three-tier architecture:

1. **L0 Cache (In-Memory)**: Ultra-fast microsecond-level access within the Lambda container
2. **L1 Cache (DynamoDB)**: Fast millisecond-level access for frequently accessed data
3. **L2 Cache (S3)**: Storage for larger cached objects

## In-Memory L0 Cache

### What is the In-Memory Cache?

The in-memory L0 cache is an optional feature that stores frequently accessed data directly in your Lambda function's memory. This provides microsecond-level access times compared to the millisecond-level latency of DynamoDB calls.

### Benefits

- **Ultra-fast access**: Microsecond-level response times for cache hits
- **Reduced costs**: Fewer DynamoDB read requests
- **Improved performance**: Lower request latency for frequently accessed data
- **Automatic memory management**: Adapts to your Lambda's memory allocation
- **Graceful degradation**: Falls back to DynamoDB/S3 when needed

### When to Use

The in-memory cache is most beneficial when:

- Your Lambda function handles repeated requests for the same data
- Your Lambda containers are warm (not frequently cold-starting)
- You have sufficient Lambda memory allocation (512 MB or more)
- Your cached data is relatively small (< 10 KB per entry)

### When NOT to Use

Consider disabling the in-memory cache when:

- Your Lambda function handles unique requests (low cache hit rate)
- Your Lambda containers cold-start frequently
- Your Lambda has minimal memory allocation (< 512 MB)
- Your cached data is very large (> 100 KB per entry)

### Inspecting Cache State

Use `Cache.info()` to inspect the cache configuration and state:

```javascript
const info = cache.Cache.info();

console.log('In-memory cache enabled:', info.useInMemoryCache);

if (info.useInMemoryCache && info.inMemoryCache) {
  console.log('Current entries:', info.inMemoryCache.size);
  console.log('Max entries:', info.inMemoryCache.maxEntries);
  console.log('Lambda memory (MB):', info.inMemoryCache.memoryMB);
}
```

### Enabling the In-Memory Cache

> In-memory cache is disabled by default.

You can enable the in-memory cache in two ways:

#### Option 1: Initialization Parameter

```javascript
const cache = require('@63klabs/cache-data');

cache.Cache.init({
  // ... other parameters ...
  useInMemoryCache: true,  // Enable in-memory cache
});
```

#### Option 2: Environment Variable

Set the `CACHE_USE_IN_MEMORY` environment variable:

```bash
CACHE_USE_IN_MEMORY=true
```

Or in your Lambda configuration:

```yaml
Environment:
  Variables:
    CACHE_USE_IN_MEMORY: "true"
```

### Default Behavior

> **The in-memory cache is disabled by default** to maintain backward compatibility. You must explicitly enable it using one of the methods above.

### Configuration Parameters

#### `useInMemoryCache` (boolean)

Enables or disables the in-memory cache.

- **Default**: `false`
- **Environment variable**: `CACHE_USE_IN_MEMORY`

```javascript
useInMemoryCache: true
```

#### `inMemoryCacheMaxEntries` (number, optional)

Explicitly sets the maximum number of entries in the cache. When set, this overrides the automatic calculation based on Lambda memory.

- **Default**: Calculated from Lambda memory allocation
- **Example**: `5000`

```javascript
inMemoryCacheMaxEntries: 5000
```

#### `inMemoryCacheEntriesPerGB` (number, optional)

Adjusts the heuristic used to calculate maximum entries from Lambda memory allocation.

- **Default**: `5000` entries per GB
- **Formula**: `maxEntries = (lambdaMemoryMB / 1024) * entriesPerGB`

```javascript
inMemoryCacheEntriesPerGB: 5000
```

**Example calculations**:
- 512 MB Lambda: `(512 / 1024) * 5000 = 2500 entries`
- 1024 MB Lambda: `(1024 / 1024) * 5000 = 5000 entries`
- 2048 MB Lambda: `(2048 / 1024) * 5000 = 10000 entries`

#### `inMemoryCacheDefaultMaxEntries` (number, optional)

Sets the fallback capacity when Lambda memory allocation cannot be determined.

- **Default**: `1000` entries
- **Used when**: `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` environment variable is unavailable

```javascript
inMemoryCacheDefaultMaxEntries: 1000
```


### LRU Eviction

The in-memory cache uses a Least Recently Used (LRU) eviction policy:

- When the cache reaches maximum capacity, the least recently accessed entry is removed
- Accessing an entry (via `CacheableDataAccess.getData()`) updates its position to "most recently used"
- This ensures frequently accessed data stays in cache

### Expiration Handling

- Expiration is checked on every cache read
- Expired entries are deleted from the cache
- Expired data is retained temporarily for fallback on upstream failures

### Error Handling

When DynamoDB is unavailable and expired cache data exists:

1. The expired data's expiration is extended
2. The data is stored back in the in-memory cache
3. The data is returned with `STATUS_CACHE_ERROR`
4. This provides graceful degradation during outages

## Performance Tuning

### Adjusting Cache Capacity

If you're experiencing high memory usage or want to optimize in-memory cache size:

**For smaller entries** (< 1 KB average):
```javascript
inMemoryCacheEntriesPerGB: 10000  // Increase capacity
```

**For larger entries** (> 10 KB average):
```javascript
inMemoryCacheEntriesPerGB: 2000  // Decrease capacity
```

**Explicit capacity**:
```javascript
inMemoryCacheMaxEntries: 3000  // Set exact capacity
```

### Monitoring

Monitor your Lambda function's memory usage in CloudWatch:

1. Check the "Max Memory Used" metric
2. Ensure it stays below your Lambda's memory allocation
3. Adjust `entriesPerGB` or `maxEntries` if needed


### Best Practices

1. **Start with defaults**: The default settings work well for most use cases
2. **Monitor memory**: Watch CloudWatch metrics for memory usage
3. **Tune gradually**: Adjust `entriesPerGB` in small increments (±1000)
4. **Test thoroughly**: Verify cache behavior under load
5. **Use provisioned concurrency**: Maximize cache effectiveness by keeping containers warm

## Lambda Execution Model

### Cold Starts

- The in-memory cache is empty on cold start
- First requests will miss the cache and fetch from DynamoDB
- Subsequent requests in the same container will hit the cache

### Warm Invocations

- The cache persists across invocations within the same container
- Frequently accessed data remains cached
- Cache effectiveness increases with container reuse

### Container Isolation

- Each Lambda container has its own independent cache
- No data sharing between concurrent containers
- Cache is cleared when the container is terminated

## Troubleshooting

### Cache Not Being Used

**Symptom**: All requests show `STATUS_CACHE` instead of `STATUS_CACHE_IN_MEM`

**Solutions**:
1. Verify feature flag is enabled: `useInMemoryCache: true` or `CACHE_USE_IN_MEMORY=true`
2. Ensure `Cache.init()` is called before creating Cache instances
3. Check that your Lambda containers are being reused (not cold-starting every request)

### High Memory Usage

**Symptom**: Lambda function approaching memory limit

**Solutions**:
1. Reduce cache capacity: Lower `entriesPerGB` or set explicit `maxEntries`
2. Increase Lambda memory allocation
3. Disable in-memory cache if not beneficial: `useInMemoryCache: false`

### Low Cache Hit Rate

**Symptom**: Most requests still hitting DynamoDB

**Possible causes**:
1. Lambda containers cold-starting frequently (cache is empty)
2. Request patterns are not repetitive (unique requests)
3. Cache entries expiring too quickly

**Solutions**:
1. Use Lambda provisioned concurrency to keep containers warm
2. Increase cache expiration times if appropriate
3. Consider if in-memory cache is beneficial for your use case

## Additional Resources

- [Technical Documentation](../../technical/in-memory-cache.md) - Detailed implementation details for maintainers
- [AWS Lambda Execution Context](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-context.html) - Understanding Lambda container reuse
- [Cache Replacement Policies](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_recently_used_(LRU)) - LRU algorithm details

## Support

For issues, questions, or feature requests related to the in-memory cache, please refer to the project's issue tracker or documentation.
