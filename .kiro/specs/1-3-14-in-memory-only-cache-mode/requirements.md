# Requirements Document

## Introduction

This feature adds an "In-Memory Only" cache mode to the @63klabs/cache-data package, allowing the cache system to operate without DynamoDB and S3 backing stores. When enabled, all cache reads and writes use only the existing InMemoryCache (L0 layer) as the sole storage mechanism. This supports lightweight applications, heartbeat-driven services, tutorial/development environments, and scenarios where external AWS infrastructure is not provisioned. The feature is fully backwards compatible — existing users who do not opt in will experience no behavioral changes.

## Glossary

- **Cache_Class**: The public `Cache` class in `dao-cache.js` that provides the high-level caching API including `init()`, `read()`, `write()`, and `info()`.
- **CacheData_Class**: The internal `CacheData` class responsible for encryption, storage routing, and DynamoDB/S3 interactions.
- **InMemoryCache**: The `InMemoryCache` class in `src/lib/utils/InMemoryCache.js` providing an LRU Map-based cache with expiration support.
- **In_Memory_Only_Mode**: A configuration mode where the cache system uses only the InMemoryCache for all storage operations, bypassing DynamoDB, S3, and encryption entirely.
- **L0_Cache**: The in-memory cache layer that currently sits in front of DynamoDB/S3 as an acceleration layer.
- **Init_Parameters**: The configuration object passed to `Cache.init()` containing settings such as `secureDataKey`, `dynamoDbTable`, `s3Bucket`, and the new `inMemoryOnly`.
- **CACHE_IN_MEMORY_ONLY**: An environment variable that enables In_Memory_Only_Mode when set to `"true"` or `"1"`.
- **Cache_Profile**: A per-request configuration object passed to the `Cache` constructor controlling expiration, encryption, and header retention.

## Requirements

### Requirement 1: In-Memory Only Mode Activation

**User Story:** As a developer, I want to enable an in-memory-only cache mode via `Cache.init()` or an environment variable, so that my application can cache data without requiring DynamoDB or S3 infrastructure.

#### Acceptance Criteria

1. WHEN `inMemoryOnly` is set to `true` in Init_Parameters, THE Cache_Class SHALL activate In_Memory_Only_Mode.
2. WHEN the CACHE_IN_MEMORY_ONLY environment variable is set to `"true"` or `"1"` and `inMemoryOnly` is not provided in Init_Parameters, THE Cache_Class SHALL activate In_Memory_Only_Mode.
3. WHEN `inMemoryOnly` is provided in Init_Parameters, THE Cache_Class SHALL use the parameter value regardless of the CACHE_IN_MEMORY_ONLY environment variable value.
4. WHEN In_Memory_Only_Mode is not activated (neither parameter nor environment variable), THE Cache_Class SHALL behave identically to the current implementation.

### Requirement 2: Relaxed Initialization Requirements

**User Story:** As a developer using in-memory-only mode, I want to initialize the cache without providing `secureDataKey`, `dynamoDbTable`, or `s3Bucket`, so that I can use caching without setting up AWS infrastructure or encryption keys.

#### Acceptance Criteria

1. WHILE In_Memory_Only_Mode is active, THE Cache_Class SHALL NOT require `secureDataKey` in Init_Parameters.
2. WHILE In_Memory_Only_Mode is active, THE Cache_Class SHALL NOT require `dynamoDbTable` in Init_Parameters or the CACHE_DATA_DYNAMO_DB_TABLE environment variable.
3. WHILE In_Memory_Only_Mode is active, THE Cache_Class SHALL NOT require `s3Bucket` in Init_Parameters or the CACHE_DATA_S3_BUCKET environment variable.
4. WHILE In_Memory_Only_Mode is active, THE CacheData_Class `init()` SHALL NOT throw an error when `secureDataKey` is absent.
5. WHILE In_Memory_Only_Mode is active, THE DynamoDbCache `init()` SHALL NOT throw an error when no table name is available.
6. WHILE In_Memory_Only_Mode is active, THE S3Cache `init()` SHALL NOT throw an error when no bucket name is available.

### Requirement 3: In-Memory Only Read Behavior

**User Story:** As a developer using in-memory-only mode, I want cache reads to use only the InMemoryCache, so that no DynamoDB or S3 calls are made.

#### Acceptance Criteria

1. WHILE In_Memory_Only_Mode is active, THE Cache_Class `read()` method SHALL check only the InMemoryCache for cached data.
2. WHILE In_Memory_Only_Mode is active, THE Cache_Class `read()` method SHALL NOT call `CacheData.read()` or any DynamoDB/S3 operations.
3. WHEN a cache hit occurs in In_Memory_Only_Mode, THE Cache_Class SHALL return the cached data with a status indicating an in-memory cache hit.
4. WHEN a cache miss occurs in In_Memory_Only_Mode, THE Cache_Class SHALL return a formatted empty cache response (equivalent to `CacheData.format()` with the default expiration).

### Requirement 4: In-Memory Only Write Behavior

**User Story:** As a developer using in-memory-only mode, I want cache writes to store data only in the InMemoryCache, so that no DynamoDB or S3 calls are made.

#### Acceptance Criteria

1. WHILE In_Memory_Only_Mode is active, THE Cache_Class write operations SHALL store data only in the InMemoryCache.
2. WHILE In_Memory_Only_Mode is active, THE Cache_Class SHALL NOT call `CacheData.write()` or any DynamoDB/S3 operations.
3. WHILE In_Memory_Only_Mode is active, THE Cache_Class SHALL NOT encrypt data before storing it in the InMemoryCache.
4. WHILE In_Memory_Only_Mode is active, THE Cache_Class SHALL store data with the appropriate expiration timestamp in the InMemoryCache.

### Requirement 5: InMemoryCache Automatic Initialization

**User Story:** As a developer enabling in-memory-only mode, I want the InMemoryCache to be automatically initialized even if `useInMemoryCache` is not explicitly set, so that I do not need to configure both options.

#### Acceptance Criteria

1. WHEN In_Memory_Only_Mode is activated, THE Cache_Class SHALL initialize the InMemoryCache automatically regardless of the `useInMemoryCache` parameter value.
2. WHEN In_Memory_Only_Mode is activated and `useInMemoryCache` is explicitly set to `false`, THE Cache_Class SHALL still initialize the InMemoryCache (In_Memory_Only_Mode takes precedence).
3. WHEN In_Memory_Only_Mode is activated, THE Cache_Class SHALL accept optional InMemoryCache configuration parameters (`inMemoryCacheMaxEntries`, `inMemoryCacheEntriesPerGB`, `inMemoryCacheDefaultMaxEntries`).

### Requirement 6: Cache Info Exposure

**User Story:** As a developer, I want `Cache.info()` to indicate whether in-memory-only mode is active, so that I can verify the configuration and debug caching behavior.

#### Acceptance Criteria

1. THE Cache_Class `info()` method SHALL include an `inMemoryOnly` boolean property in the returned object.
2. WHEN In_Memory_Only_Mode is active, THE `info()` method SHALL return `true` for the `inMemoryOnly` property.
3. WHEN In_Memory_Only_Mode is not active, THE `info()` method SHALL return `false` for the `inMemoryOnly` property.

### Requirement 7: Backwards Compatibility

**User Story:** As an existing user of the package, I want my current code to work without modification after this update, so that I can upgrade without breaking changes.

#### Acceptance Criteria

1. WHEN `inMemoryOnly` is not provided in Init_Parameters and CACHE_IN_MEMORY_ONLY is not set, THE Cache_Class SHALL behave identically to the current implementation for all operations.
2. THE Cache.init() method signature SHALL remain backwards compatible — existing Init_Parameters objects without `inMemoryOnly` SHALL continue to work without modification.
3. THE `secureDataKey` requirement SHALL remain enforced when In_Memory_Only_Mode is not active.
4. THE DynamoDbCache and S3Cache initialization requirements SHALL remain enforced when In_Memory_Only_Mode is not active.
5. THE `inMemoryOnly` parameter SHALL NOT affect any other Cache_Module behavior when set to `false` or not provided.

### Requirement 8: CacheableDataAccess Compatibility

**User Story:** As a developer using `CacheableDataAccess.getData()`, I want it to work seamlessly in in-memory-only mode, so that I can use the same high-level API regardless of cache mode.

#### Acceptance Criteria

1. WHILE In_Memory_Only_Mode is active, THE `CacheableDataAccess.getData()` method SHALL continue to function correctly, using the InMemoryCache for cache reads and writes.
2. WHILE In_Memory_Only_Mode is active, THE `CacheableDataAccess.getData()` method SHALL still call the data access function on cache miss and store the result in the InMemoryCache.
3. WHILE In_Memory_Only_Mode is active, THE `CacheableDataAccess.getData()` method SHALL respect cache expiration settings from the Cache_Profile.

### Requirement 9: Input Validation

**User Story:** As a developer, I want clear feedback if I provide an invalid `inMemoryOnly` value, so that I can correct configuration errors quickly.

#### Acceptance Criteria

1. THE Cache_Class SHALL accept boolean values (`true`, `false`) for the `inMemoryOnly` parameter.
2. THE Cache_Class SHALL accept truthy string values (`"true"`, `"1"`) for the `inMemoryOnly` parameter, converting them to boolean using the existing `Cache.bool()` method.
3. WHEN `inMemoryOnly` is not provided or is falsy, THE Cache_Class SHALL treat it as `false` and proceed with normal initialization.

### Requirement 10: User Documentation Update

**User Story:** As a developer adopting in-memory-only mode, I want clear documentation explaining how to configure and use the feature, so that I can set up caching without reading source code.

#### Acceptance Criteria

1. THE `docs/features/cache/README.md` file SHALL include a section documenting the `inMemoryOnly` option in the Configuration Options table with its type, default, and description.
2. THE documentation SHALL include a usage example showing how to configure `inMemoryOnly: true` in `Cache.init()` for lightweight applications.
3. THE documentation SHALL explain the trade-offs of in-memory-only mode (no persistence across Lambda invocations, no sharing between concurrent Lambda instances).
4. THE documentation SHALL include the `CACHE_IN_MEMORY_ONLY` environment variable in the environment variables section.
5. THE documentation SHALL explain the interaction between `inMemoryOnly` and `useInMemoryCache` parameters.

### Requirement 11: TypeScript Type Definition Update

**User Story:** As a TypeScript consumer, I want the `inMemoryOnly` option reflected in the type definitions, so that I get IntelliSense support for the new parameter.

#### Acceptance Criteria

1. THE Declaration_File SHALL include `inMemoryOnly?: boolean` in the `CacheInitParameters` interface (or equivalent init parameter type).
2. WHEN a Consumer constructs Init_Parameters, THE IntelliSense SHALL display `inMemoryOnly` as an available optional property with a description.
3. THE `info()` return type SHALL include `inMemoryOnly: boolean`.

### Requirement 12: Concurrent Lambda Isolation Acknowledgment

**User Story:** As a developer, I want to understand that in-memory-only mode does not provide shared caching across concurrent Lambda instances, so that I set appropriate expectations for my application.

#### Acceptance Criteria

1. WHILE In_Memory_Only_Mode is active, THE Cache_Class SHALL operate independently per Lambda execution context (no cross-instance sharing).
2. THE Cache_Class SHALL NOT attempt any inter-process communication or shared memory mechanisms in In_Memory_Only_Mode.
3. WHILE In_Memory_Only_Mode is active, THE Cache_Class SHALL log a debug-level message during initialization indicating that caching is in-memory only and not shared across instances.
