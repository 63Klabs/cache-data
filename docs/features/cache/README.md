# Cache Feature Documentation

## Overview

The Cache module provides a multi-tier caching system for AWS Lambda functions, combining in-memory, DynamoDB, and S3 storage to optimize data access and reduce latency.

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

## Configuration

### Enabling the In-Memory Cache

You can enable the in-memory cache in two ways:

#### Option 1: Initialization Parameter

```javascript
const cache = require('@63klabs/cache-data');

cache.Cache.init({
  // ... other parameters ...
  useInMemoryCache: true,  // Enable in-memory cache
  
  // Optional: Override automatic capacity calculation
  inMemoryCacheMaxEntries: 5000,
  
  // Optional: Adjust entries-per-GB heuristic (default: 5000)
  inMemoryCacheEntriesPerGB: 5000,
  
  // Optional: Set fallback capacity (default: 1000)
  inMemoryCacheDefaultMaxEntries: 1000
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

**The in-memory cache is disabled by default** to maintain backward compatibility. You must explicitly enable it using one of the methods above.

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

## Usage

### Basic Usage

Once enabled, the in-memory cache works automatically with no code changes required:

```javascript
const cache = require('@63klabs/cache-data');

// Initialize with in-memory cache enabled
cache.Cache.init({
  dynamoDbTable: process.env.CACHE_DATA_DYNAMO_DB_TABLE,
  s3Bucket: process.env.CACHE_DATA_S3_BUCKET,
  secureDataKey: Buffer.from(params.app.crypt_secureDataKey, cache.Cache.CRYPT_ENCODING),
  useInMemoryCache: true  // Enable in-memory cache
});

// Use cache as normal - in-memory cache is transparent
const cacheObj = new cache.Cache(connection, cacheProfile);
const data = await cacheObj.read();

// Check if data came from in-memory cache
if (cacheObj.getStatus() === cache.Cache.STATUS_CACHE_IN_MEM) {
  console.log('Data served from in-memory cache!');
}
```

### Checking Cache Status

The cache introduces a new status code to identify in-memory cache hits:

```javascript
const status = cacheObj.getStatus();

switch (status) {
  case cache.Cache.STATUS_CACHE_IN_MEM:
    console.log('Data from in-memory cache (microseconds)');
    break;
  case cache.Cache.STATUS_CACHE:
    console.log('Data from DynamoDB/S3 (milliseconds)');
    break;
  case cache.Cache.STATUS_NO_CACHE:
    console.log('No cached data available');
    break;
  case cache.Cache.STATUS_CACHE_ERROR:
    console.log('Error occurred, stale data returned');
    break;
}
```

### Status Codes

- **`STATUS_CACHE_IN_MEM`** (`"cache:memory"`): Data served from in-memory cache
- **`STATUS_CACHE`** (`"cache"`): Data served from DynamoDB/S3
- **`STATUS_NO_CACHE`** (`"original"`): No cached data available
- **`STATUS_CACHE_ERROR`** (`"error:cache"`): Error occurred, stale data returned if available

### Response Headers

The cache status is also included in the response headers via `x-cprxy-data-source`:

```javascript
const response = cacheObj.getResponse();
console.log(response.headers['x-cprxy-data-source']); // "cache:memory"
```

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

## How It Works

### Cache Flow

When you call `cache.read()`:

1. **Check in-memory cache** (if enabled)
   - **Hit**: Return data immediately (microseconds)
   - **Miss**: Continue to step 2
   - **Expired**: Retain data for potential fallback, continue to step 2

2. **Fetch from DynamoDB/S3**
   - **Success**: Store in in-memory cache, return data
   - **Error**: Use expired in-memory data if available (with extended expiration)

### LRU Eviction

The in-memory cache uses a Least Recently Used (LRU) eviction policy:

- When the cache reaches maximum capacity, the least recently accessed entry is removed
- Accessing an entry (via `read()`) updates its position to "most recently used"
- This ensures frequently accessed data stays in cache

### Expiration Handling

- Expiration is checked on every cache read
- Expired entries are immediately deleted from the cache
- Expired data is retained temporarily for fallback if DynamoDB fails

### Error Handling

When DynamoDB is unavailable and expired cache data exists:

1. The expired data's expiration is extended
2. The data is stored back in the in-memory cache
3. The data is returned with `STATUS_CACHE_ERROR`
4. This provides graceful degradation during outages

## Performance Tuning

### Adjusting Cache Capacity

If you're experiencing high memory usage or want to optimize cache size:

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

## Examples

### Basic Configuration

```javascript
const cache = require('@63klabs/cache-data');

cache.Cache.init({
  dynamoDbTable: 'my-cache-table',
  s3Bucket: 'my-cache-bucket',
  secureDataKey: Buffer.from(mySecretKey, 'hex'),
  useInMemoryCache: true
});
```

### Advanced Configuration

```javascript
cache.Cache.init({
  dynamoDbTable: process.env.CACHE_DATA_DYNAMO_DB_TABLE,
  s3Bucket: process.env.CACHE_DATA_S3_BUCKET,
  secureDataKey: Buffer.from(params.app.crypt_secureDataKey, cache.Cache.CRYPT_ENCODING),
  
  // In-memory cache configuration
  useInMemoryCache: true,
  inMemoryCacheMaxEntries: 8000,  // Explicit capacity for 2GB Lambda
  inMemoryCacheEntriesPerGB: 4000,  // Conservative heuristic
  inMemoryCacheDefaultMaxEntries: 1500,  // Higher fallback
  
  // Other cache settings
  idHashAlgorithm: 'RSA-SHA256',
  DynamoDbMaxCacheSize_kb: 10,
  purgeExpiredCacheEntriesAfterXHours: 24,
  timeZoneForInterval: 'America/Chicago'
});
```

### Environment Variable Configuration

```bash
# Enable in-memory cache
CACHE_USE_IN_MEMORY=true

# Other cache settings
CACHE_DATA_DYNAMO_DB_TABLE=my-cache-table
CACHE_DATA_S3_BUCKET=my-cache-bucket
CACHE_DATA_ID_HASH_ALGORITHM=RSA-SHA256
```

### Checking Cache Performance

```javascript
const cache = require('@63klabs/cache-data');

// Get cache info
const info = cache.Cache.info();
console.log('Cache configuration:', JSON.stringify(info, null, 2));

// Create cache instance
const cacheObj = new cache.Cache(connection, cacheProfile);
const data = await cacheObj.read();

// Log cache performance
const status = cacheObj.getStatus();
console.log('Cache status:', status);

if (status === cache.Cache.STATUS_CACHE_IN_MEM) {
  console.log('✓ In-memory cache hit (microseconds)');
} else if (status === cache.Cache.STATUS_CACHE) {
  console.log('○ DynamoDB cache hit (milliseconds)');
} else {
  console.log('✗ Cache miss');
}
```

## Migration Guide

### Enabling for Existing Applications

The in-memory cache is fully backward compatible. To enable it:

1. **Update initialization** (add one line):
   ```javascript
   cache.Cache.init({
     // ... existing parameters ...
     useInMemoryCache: true  // Add this line
   });
   ```

2. **Deploy**: No other code changes required

3. **Monitor**: Watch CloudWatch metrics for memory usage and performance

4. **Tune**: Adjust capacity if needed based on monitoring

### Disabling the Feature

To disable the in-memory cache:

```javascript
cache.Cache.init({
  // ... other parameters ...
  useInMemoryCache: false  // Explicitly disable
});
```

Or remove the parameter entirely (defaults to `false`).

## Additional Resources

- [Technical Documentation](../../technical/in-memory-cache.md) - Detailed implementation details for maintainers
- [AWS Lambda Execution Context](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-context.html) - Understanding Lambda container reuse
- [Cache Replacement Policies](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_recently_used_(LRU)) - LRU algorithm details

## Support

For issues, questions, or feature requests related to the in-memory cache, please refer to the project's issue tracker or documentation.


## API Reference

For detailed API documentation including all methods, parameters, and return types, refer to the JSDoc comments in the source code:

- **S3Cache class**: Low-level S3 storage operations - see `src/lib/dao-cache.js`
- **DynamoDbCache class**: Low-level DynamoDB storage operations - see `src/lib/dao-cache.js`
- **CacheData class**: Internal cache data management - see `src/lib/dao-cache.js`
- **Cache class**: Public cache interface - see `src/lib/dao-cache.js`
- **CacheableDataAccess**: High-level caching with automatic data fetching - see `src/lib/dao-cache.js`

### Key Methods

#### Cache.init(parameters)

Initialize the cache system with configuration. Must be called before using any cache functionality.

**Parameters:**
- `dynamoDbTable` (string): DynamoDB table name for cache storage
- `s3Bucket` (string): S3 bucket name for large cached objects
- `secureDataKey` (Buffer|string): Encryption key for private data
- `secureDataAlgorithm` (string, optional): Encryption algorithm (default: 'aes-256-cbc')
- `DynamoDbMaxCacheSize_kb` (number, optional): Max size for DynamoDB storage (default: 10)
- `purgeExpiredCacheEntriesAfterXHours` (number, optional): Hours to keep expired entries (default: 24)
- `timeZoneForInterval` (string, optional): Timezone for interval calculations (default: 'Etc/UTC')
- `useInMemoryCache` (boolean, optional): Enable in-memory L0 cache (default: false)
- `inMemoryCacheMaxEntries` (number, optional): Override automatic capacity calculation
- `inMemoryCacheEntriesPerGB` (number, optional): Entries per GB heuristic (default: 5000)
- `inMemoryCacheDefaultMaxEntries` (number, optional): Fallback capacity (default: 1000)

See JSDoc for complete parameter details and examples.

#### Cache.info()

Returns configuration information about the cache system.

**Returns:** Object containing all cache configuration settings

#### new Cache(connection, cacheProfile)

Create a new cache instance for a specific connection and cache profile.

**Parameters:**
- `connection` (Object): Connection details that uniquely identify the cached resource
- `cacheProfile` (Object): Cache behavior configuration including expiration, encryption, etc.

See JSDoc for complete parameter details and examples.

#### cache.read()

Read data from cache. Checks in-memory cache first (if enabled), then DynamoDB/S3.

**Returns:** Promise resolving to cached data or null if not found/expired

#### cache.write(body, headers, statusCode)

Write data to cache with automatic tier selection and encryption.

**Parameters:**
- `body` (string): Content to cache
- `headers` (Object): HTTP headers to cache
- `statusCode` (string|number): HTTP status code

**Returns:** Promise resolving to true if successful

#### cache.getStatus()

Get the cache status indicating where data came from.

**Returns:** One of:
- `Cache.STATUS_CACHE_IN_MEM`: Data from in-memory cache
- `Cache.STATUS_CACHE`: Data from DynamoDB/S3
- `Cache.STATUS_NO_CACHE`: No cached data
- `Cache.STATUS_CACHE_ERROR`: Error occurred, stale data returned

See JSDoc in source files for complete method signatures, parameters, return types, and usage examples.
