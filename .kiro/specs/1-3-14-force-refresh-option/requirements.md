# Requirements Document

## Introduction

This feature adds a `forceRefresh` option to `CacheableDataAccess.getData()` that allows callers to bypass the cache expiration check and always fetch fresh data from the original source. The option is placed in the existing `connection.options` object, which is already excluded from cache hash generation. This enables use cases such as admin-triggered cache invalidation, scheduled pre-warming, data correction after origin fixes, and development debugging — all without breaking backwards compatibility.

## Glossary

- **CacheableDataAccess**: The public static class in the Cache_Module that provides the `getData()` method for fetching data with caching support.
- **Cache_Module**: The `cache` export of the @63klabs/cache-data NPM package, providing distributed caching using DynamoDB and S3.
- **Connection_Object**: An object passed to `getData()` that specifies the host, path, headers, and options for the data request.
- **Options_Object**: The `connection.options` property containing behavioral flags (timeout, maxRetries, retry, pagination) that are excluded from cache hash generation.
- **Force_Refresh**: A boolean flag in the Options_Object that, when true, causes `getData()` to skip the cache read and always fetch from the original source.
- **Cache_Hash**: The deterministic hash generated from the connection and cache policy, used as the cache key in DynamoDB/S3.
- **Origin**: The original data source (API endpoint, file, etc.) accessed via the `apiCallFunction`.
- **Cache_Status**: A string logged by `getData()` indicating the source of the returned data (e.g., "cache", "original", "original:cache-update-forced").

## Requirements

### Requirement 1: Force Refresh Option in Connection Options

**User Story:** As a developer, I want to set `forceRefresh: true` in `connection.options`, so that I can bypass the cache and fetch fresh data from the origin on demand.

#### Acceptance Criteria

1. WHEN `connection.options.forceRefresh` is `true`, THE CacheableDataAccess SHALL skip the cache read operation and fetch data directly from the Origin.
2. WHEN `connection.options.forceRefresh` is `false` or absent, THE CacheableDataAccess SHALL perform the existing cache-first behavior (read cache, fetch from Origin only if expired or empty).
3. THE CacheableDataAccess SHALL treat `undefined`, `null`, `0`, and missing `options` or `forceRefresh` properties as equivalent to `false`.

### Requirement 2: Cache Write After Forced Refresh

**User Story:** As a developer, I want forced refresh results written back to cache, so that subsequent non-forced requests benefit from the fresh data.

#### Acceptance Criteria

1. WHEN `forceRefresh` is `true` and the Origin returns a successful response, THE CacheableDataAccess SHALL write the fresh data to the cache.
2. WHEN `forceRefresh` is `true` and the Origin returns a successful response, THE Cache SHALL update the expiration timestamp using the same calculation as a normal cache miss.
3. WHEN `forceRefresh` is `true`, THE Cache SHALL set the status to `Cache.STATUS_FORCED` ("original:cache-update-forced") after a successful update.

### Requirement 3: Error Handling During Forced Refresh

**User Story:** As a developer, I want the system to fall back to stale cached data if the origin fails during a forced refresh, so that my application remains resilient.

#### Acceptance Criteria

1. IF the Origin request fails during a forced refresh, THEN THE CacheableDataAccess SHALL read the existing cache entry as a fallback.
2. IF the Origin request fails during a forced refresh and the cache contains stale data, THEN THE CacheableDataAccess SHALL return the stale cached data and extend the cache expiration.
3. IF the Origin request fails during a forced refresh and the cache is empty, THEN THE CacheableDataAccess SHALL return an empty Cache object with error status.

### Requirement 4: Cache Hash Stability

**User Story:** As a developer, I want `forceRefresh` to have no effect on the cache hash, so that forced and non-forced requests share the same cache entry.

#### Acceptance Criteria

1. THE Cache_Hash generated for a Connection_Object with `options.forceRefresh: true` SHALL be identical to the Cache_Hash generated for the same Connection_Object with `options.forceRefresh: false`.
2. THE Cache_Hash generated for a Connection_Object with `options.forceRefresh: true` SHALL be identical to the Cache_Hash generated for the same Connection_Object without an `options` property.
3. FOR ALL valid Connection_Objects, adding, removing, or changing `options.forceRefresh` SHALL NOT alter the Cache_Hash (round-trip property).

### Requirement 5: Conditional Headers with Force Refresh

**User Story:** As a developer, I want conditional headers (ETag, If-Modified-Since) sent to the origin even during a forced refresh, so that the origin can return 304 if data hasn't changed, saving bandwidth.

#### Acceptance Criteria

1. WHEN `forceRefresh` is `true` and the cache contains a previous ETag value, THE CacheableDataAccess SHALL include the `if-none-match` header in the request to the Origin.
2. WHEN `forceRefresh` is `true` and the cache contains a previous Last-Modified value, THE CacheableDataAccess SHALL include the `if-modified-since` header in the request to the Origin.
3. WHEN `forceRefresh` is `true` and the Origin returns a 304 Not Modified response, THE CacheableDataAccess SHALL extend the cache expiration without overwriting the cached body.

### Requirement 6: Logging for Force Refresh

**User Story:** As a developer, I want the cache status log to indicate when a force refresh was used, so that I can distinguish forced refreshes from normal cache misses in my logs.

#### Acceptance Criteria

1. WHEN `forceRefresh` is `true` and the Origin returns fresh data, THE Cache_Status logged SHALL be "original:cache-update-forced".
2. WHEN `forceRefresh` is `true` and the Origin returns 304 Not Modified, THE Cache_Status logged SHALL reflect the not-modified extension behavior.
3. WHEN `forceRefresh` is `false` or absent, THE Cache_Status logged SHALL remain unchanged from current behavior.

### Requirement 7: Backwards Compatibility

**User Story:** As an existing user of the package, I want my current code to work without modification after this update, so that I can upgrade without breaking changes.

#### Acceptance Criteria

1. THE CacheableDataAccess.getData() method signature SHALL remain unchanged.
2. WHEN `connection.options` is absent or does not contain `forceRefresh`, THE CacheableDataAccess SHALL behave identically to the current implementation.
3. WHEN `connection.options` contains other existing flags (timeout, maxRetries, retry, pagination) alongside `forceRefresh`, THE CacheableDataAccess SHALL process all flags independently without interference.
4. THE `forceRefresh` option SHALL NOT require any changes to the `Cache.init()` configuration.

### Requirement 8: TypeScript Type Definition Update

**User Story:** As a TypeScript consumer, I want the `forceRefresh` option reflected in the type definitions, so that I get IntelliSense support for the new option.

#### Acceptance Criteria

1. THE Declaration_File SHALL include `forceRefresh?: boolean` in the `ConnectionObject.options` interface.
2. WHEN a Consumer constructs a Connection_Object with `options`, THE IntelliSense SHALL display `forceRefresh` as an available optional property with a description.

