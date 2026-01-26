# In-Memory L0 Cache Module

No existing classes, structure, or code should be modified until a final integration task.

This new function should be created as a separate, stand-alone function or class that is not tied to any existing codebase. This will allow it to be tested independently and implemented using a feature switch. This can be stored and imported from src/lib/utils

This new function should be implemented using a feature switch as a static value in the Cache class. It should be set according to a parameter during Cache init or via an environment variable CACHE_USE_IN_MEMORY. The init parameter property should be useInMemoryCache.
The feature switch should default to OFF (false).

The object returned by the new feature should match the interface of the existing object returned by Cache.read().

Upon completion, this function should be wired up to the feature switch and be implemented within the Cache.read() method.

If the feature is a class that requires initialization then when integrated, it should be added to the Cache init upon final integration. 

Tests should not require connection to DyanmoDb, they should be stand alone with mock data only, not mock connections.

User documentation for this feature should be placed in the docs/technical folder as a markdown file. It should be written for maintanence of the package, not for end-user implementation.

Tests should be in the form of unit tests which should match the format, style, and structure currently implemented in the test directory. For example, cache tests have groupings based on their function in the test/cache/ directory.

The output of Cache.read() should not change. The final implementation within Cache.read() should try the in-memory cache first and then CacheData.read()

It is up to Kiro to determine the best method for implementation of this feature. A suggestion is listed below, Kiro should ask clarifying questions and prompt the user to make implementation choices if necessary.

A new statusCode is available for the CacheDataFormat returned by Cache.read(): STATUS_CACHE_IN_MEM

Kiro should have a firm understanding of how the classes in src/lib/dao-cache.js work.

While the initial specifications recommend placing the call to the in memory cache within Cache.read(), if Kiro determines CacheData.read() is a better fit then it should be recommended. It is important that it gets implemented in the appropriate class.

The final integration code should be provided to the developer who will approve the final integration with the Cache class. The final integration should also use a check if the CacheData.read() fails. If it fails and there is in mem cache data but expired, it should be returned with an error status code STATUS_CACHE_ERROR and an updated expiration date based on initialized values of Cache.

Priorities: **microsecond-level access, minimal overhead, lots of memory available, and Lambda-specific behavior**

* **Fastest average latency**
* **No scans on hot path**
* **No background work**
* **No timers for clean-up tasks**
* **Predictable memory usage**
* Uses **extra Lambda memory** to reduce network calls (exactly what you want)

Sweeps, heaps, periodic cleanup adds branches, loops, or allocations that increase tail latency.

## 1. Overview

### 1.1 Problem Statement

AWS Lambda functions in this system rely on DynamoDB and S3 as authoritative data sources. While these services are performant, network access introduces millisecond-level latency. The Lambda functions are provisioned with **high memory allocations** (typically 512 MB to 1024 MB and above) to benefit from increased CPU and network throughput, leaving unused memory capacity available.

A lightweight, ultra-low-latency **in-memory cache** is required to:

* Reduce repeated DynamoDB reads
* Shave milliseconds off request latency
* Leverage unused Lambda memory
* Operate safely within the Lambda execution model

This cache must be **best-effort**, **non-authoritative**, and optimized for **microsecond-level access**.

## 2. Goals and Non-Goals

### 2.1 Goals

* Provide **microsecond-level cache reads**
* Reduce requests to DynamoDB and S3
* Enforce **strict expiration semantics**
* Support **long-lived entries** (24 hours or more)
* Scale to **thousands of cache entries**
* Operate safely in AWS Lambda
* Use **only in-memory storage**
* Be deployable as a **stand-alone module**
* Provide a fall-back if connection to DynamoDb fails
* Be easily toggled on/off via feature flag

### 2.2 Non-Goals

* This module **will not read from DynamoDB**
* This module **will not write to DynamoDB**
* This module **will not guarantee cache persistence**
* This module **will not synchronize across Lambda instances**
* This module **will not perform background cleanup or scheduling**

## 3. Architectural Decision

### 3.1 Recommended Approach

**Size-bounded, Map-based LRU cache with strict expiration enforcement**

This approach is beleived to provide:

* O(1) read and write operations
* Minimal branching on the hot path
* Deterministic memory growth
* Compatibility with Lambda freeze/thaw behavior

### 3.2 Why This Architecture Was Chosen

| Requirement          | Reason                                                    |
| -------------------- | --------------------------------------------------------- |
| Lowest latency       | `Map.get()` is the fastest structure available in Node.js |
| Long TTL support     | Expiration checked per entry                              |
| Thousands of entries | Size-bounded eviction prevents unbounded growth           |
| Lambda safety        | No timers or async cleanup                                |
| Memory utilization   | Uses available Lambda memory efficiently                  |

If there are better options, or efficent alternatives, please propose them.

## 4. Module Responsibilities

### 4.1 Responsibilities

This module **only**:

* Stores cache entries in memory
* Retrieves cache entries
* Enforces expiration
* Evicts entries when memory limits are reached

### 4.2 Explicitly Out of Scope

* Fetching data from DynamoDB
* Refreshing expired entries
* Handling retries or fallbacks
* Distributed cache coordination

## 5. Data Model

### 5.1 Cache Data Format (Consumed and Stored)

```js
type CacheDataFormat = {
    cache: {
        body: string;
        headers: any;
        expires: number;
        statusCode: string;
    };
}
```

### 5.2 Internal Cache Entry Representation

```js
{
  value: CacheDataFormat,
  expiresAt: number // epoch milliseconds
}
```

* `expiresAt` is derived from `cache.expires`
* Expiration is **authoritative**
* Expired entries must be returned with an expired marker
* Expired entries are deleted from the cache (they will be re-stored with new expiration)

## 6. Public Interface Requirements

### 6.1 Cache Lookup

#### Input

* Cache key (string hash)

#### Output

```json
{
  "cache": 1,
  "data": CacheDataFormat
}
```

OR

```json
{
  "cache": 0,
  "data": null
}
```

OR

```json
{
  "cache": -1,
  "data": CacheDataFormat
}

Cache of 1 is good, not expired. A cache of 0 is a miss, and a cache of -1 is expired but data is returned anyway in case there is an issue contacting DynamoDb.
This will be used within the Cache.read() method to determine the next steps. If -1 then the Cache.read() will retain a scoped version of the data (since the in mem cache will have deleted it after read) which will be replaced once a new copy is available.

### 6.2 Behavior

* If key does not exist → return `{ cache: 0, data: null }`
* If key exists but is expired → delete entry and return `{cache: -1, data: {cachedData}}`
* If key exists and is valid → return `{cache: 1, data: {cachedData}}`
* Cache hit must not allocate new objects unnecessarily

## 7. Expiration Semantics

### 7.1 Rules

* Expiration is checked **on every read**
* Expired data is returned with a cache value of -1 and data value of the cached data
* Expiration is **not approximate**
* Cache does not modify expiration times
* Cache.read() will retain expired cache data until fresh data is retreived by CacheData.read()
* If CacheData.read() returns an error then Cache.read() will update the expiration date to the error timeframe (set in Cache init) and return stale data with the proper status code STATUS_CACHE_ERROR

### 7.2 Source of Truth

* `cache.expires` comes from DynamoDB
* DynamoDB expiration is authoritative
* Cache eviction does **not** imply expiration

## 8. Eviction Policy

### 8.1 Strategy

* **Least Recently Used (LRU)**
* Implemented using `Map` insertion order

### 8.2 Triggers

* Cache exceeds `MAX_ENTRIES`
* Memory pressure (optional extension)

### 8.3 Behavior

* Oldest entry is evicted first
* Eviction does not affect correctness
* Evicted entries may be reloaded from DynamoDB

## 9. Memory Management

### 9.1 Memory Awareness

* Module reads Lambda memory allocation from:

  ```js
  process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE
  ```

### 9.2 Sizing Strategy

* `MAX_ENTRIES` derived from allocated memory
* Example heuristic:

  * ~5,000 entries per GB of Lambda memory
* Heuristic must be configurable

### 9.3 Failure Mode

* Eviction is preferred over allocation failure
* Cache loss is acceptable
* OOM crashes must be avoided

## 10. Lambda Execution Model Considerations

### 10.1 Cold Start

* Cache starts empty
* Module initializes synchronously

### 10.2 Warm Invocation

* Cache persists across invocations
* No assumptions about lifespan

### 10.3 Concurrency

* Cache is per-container
* No shared state across concurrent Lambda instances

## 11. Performance Requirements

### 11.1 Latency

* Cache hit path must execute in **microseconds**
* No loops or scans on hot path
* No async operations

### 11.2 CPU Usage

* Minimal branching
* Constant-time operations
* Designed to leverage increased Lambda CPU allocation

## 12. Integration Pattern

### 12.1 Usage Flow

1. Upstream process calls local cache
2. If `{ cache: 1 }` → return immediately
3. If `{ cache: 0 }`:
   * Upstream process reads DynamoDB
   * Upstream process stores result in cache
4. If `{ cache: -1 }`:
   * Upstream process reads DynamoDB
   * If error from Upstream (DynamoDB read or other), then mem cached data is stored with error adjusted expiration

## 13. Summary

This module provides an **ultra-fast, memory-efficient L0 cache** designed specifically for AWS Lambda workloads with high memory allocations. It optimizes for the most common case—repeated reads of hot data—while preserving correctness, safety, and simplicity.

It intentionally trades completeness and durability for **speed**, making it an ideal front-line cache in front of DynamoDB and S3.
