# Test Coverage Analysis Report: Cache DAO Module

## Executive Summary

This document analyzes the test coverage of the cache-dao module (`src/lib/dao-cache.js`) and identifies untested scenarios. The analysis focuses on public methods and their integration points, providing a comprehensive assessment of what would be needed for complete test coverage.

**Current Status (Post-Fix):**
- **Tests Created for This Spec:** 15 tests (unit, integration, and property-based)
- **Focus:** Undefined header bug fix and validation
- **Coverage:** Targeted coverage of the specific bug and related scenarios

**Full Coverage Estimate:**
- **Unit Tests Needed:** 85-95 tests
- **Integration Tests Needed:** 25-30 tests
- **Property-Based Tests Needed:** 15-20 tests
- **Total Estimated:** 125-145 tests for comprehensive coverage

---

## Module Structure

The cache-dao module contains four main classes:

1. **S3Cache** - Low-level S3 storage operations
2. **DynamoDbCache** - Low-level DynamoDB storage operations
3. **CacheData** - Cache data management, encryption, expiration
4. **Cache** - Public API for cache operations
5. **CacheableDataAccess** - High-level data access orchestration

---

## 1. S3Cache Class

### Public Methods

| Method | Purpose | Current Test Coverage | Untested Scenarios |
|--------|---------|----------------------|-------------------|
| `init(bucket)` | Initialize S3 bucket | Partial | - Multiple init calls<br>- Invalid bucket names<br>- Missing env vars |
| `getBucket()` | Get bucket name | Minimal | - Before init<br>- After init |
| `getPath()` | Get object path prefix | Minimal | - Default value verification |
| `info()` | Get configuration | Minimal | - Complete info structure |
| `s3BodyToObject(s3Body)` | Convert S3 body to object | None | - Buffer input<br>- Stream input<br>- Invalid JSON<br>- Empty body |
| `read(idHash)` | Read from S3 | Partial | - Missing objects<br>- S3 errors<br>- Malformed data<br>- Large objects |
| `write(idHash, data)` | Write to S3 | Partial | - Write failures<br>- Large data<br>- Invalid data<br>- Concurrent writes |

### Unit Tests Needed: 15-18

**Scenarios to test:**
1. Initialization with explicit bucket name
2. Initialization with environment variable
3. Initialization without bucket (error case)
4. Multiple initialization attempts (should warn)
5. getBucket() before and after init
6. getPath() returns correct default
7. info() returns complete structure
8. s3BodyToObject() with Buffer
9. s3BodyToObject() with ReadableStream
10. s3BodyToObject() with invalid JSON (error)
11. read() with existing object
12. read() with missing object (returns null)
13. read() with S3 error (returns null)
14. write() successful
15. write() with S3 error (returns false)
16. write() with large data
17. write() with invalid data
18. Concurrent read/write operations

### Integration Tests Needed: 3-4

1. S3Cache → AWS S3 SDK integration
2. Read/write round-trip with real S3
3. Error handling with AWS SDK errors
4. Large object handling (>400KB)

---

## 2. DynamoDbCache Class

### Public Methods

| Method | Purpose | Current Test Coverage | Untested Scenarios |
|--------|---------|----------------------|-------------------|
| `init(table)` | Initialize DynamoDB table | Partial | - Multiple init calls<br>- Invalid table names<br>- Missing env vars |
| `info()` | Get table name | Minimal | - Before init<br>- After init |
| `read(idHash)` | Read from DynamoDB | Partial | - Missing items<br>- DynamoDB errors<br>- Malformed data<br>- Projection expression |
| `write(item)` | Write to DynamoDB | Partial | - Write failures<br>- Invalid items<br>- Missing required fields<br>- Concurrent writes |

### Unit Tests Needed: 12-15

**Scenarios to test:**
1. Initialization with explicit table name
2. Initialization with environment variable
3. Initialization without table (error case)
4. Multiple initialization attempts (should warn)
5. info() before and after init
6. read() with existing item
7. read() with missing item (returns empty object)
8. read() with DynamoDB error (returns empty object)
9. read() with projection expression
10. write() successful
11. write() with DynamoDB error (returns false)
12. write() with missing id_hash
13. write() with invalid item structure
14. write() with large item (near 400KB limit)
15. Concurrent read/write operations

### Integration Tests Needed: 3-4

1. DynamoDbCache → AWS DynamoDB SDK integration
2. Read/write round-trip with real DynamoDB
3. Error handling with AWS SDK errors
4. TTL and purge_ts handling

---

## 3. CacheData Class

### Public Methods

| Method | Purpose | Current Test Coverage | Untested Scenarios |
|--------|---------|----------------------|-------------------|
| `init(parameters)` | Initialize cache system | Partial | - All parameter combinations<br>- Invalid parameters<br>- Missing required params<br>- Env var fallbacks |
| `prime()` | Refresh secrets | None | - With CachedParameterSecret<br>- With Buffer key<br>- With string key<br>- Prime failures |
| `info()` | Get configuration | Minimal | - Complete info structure<br>- Key masking |
| `format(...)` | Format cache data | Minimal | - All parameter combinations<br>- Null values |
| `read(idHash, syncedLater)` | Read from cache | Partial | - S3 pointer resolution<br>- Decryption<br>- Missing cache<br>- Errors |
| `write(...)` | Write to cache | Partial | - Encryption<br>- S3 routing<br>- Header generation<br>- Errors |
| `getSecureDataKeyType()` | Get key type | None | - Buffer type<br>- String type<br>- CachedParameterSecret type |
| `getSecureDataKey()` | Get key as Buffer | None | - All key types<br>- Null key<br>- Invalid key |
| `generateEtag(...)` | Generate ETag | None | - Various inputs<br>- Hash consistency |
| `generateInternetFormattedDate(...)` | Format date | None | - Seconds input<br>- Milliseconds input<br>- Edge cases |
| `lowerCaseKeys(obj)` | Lowercase object keys | None | - Various objects<br>- Null/undefined<br>- Key collisions |
| `calculateKBytes(...)` | Calculate string size | None | - Various strings<br>- Encodings<br>- Large strings |
| `nextIntervalInSeconds(...)` | Calculate next interval | None | - Various intervals<br>- Timezone handling<br>- DST transitions |
| `convertTimestampFromMilliToSeconds(...)` | Convert timestamp | None | - Various timestamps<br>- Edge cases |
| `convertTimestampFromSecondsToMilli(...)` | Convert timestamp | None | - Various timestamps<br>- Edge cases |

### Unit Tests Needed: 35-40

**Scenarios to test:**
1. init() with all parameters
2. init() with minimal parameters
3. init() with environment variables
4. init() with invalid parameters (errors)
5. init() multiple times (should warn)
6. prime() with Buffer key
7. prime() with string key
8. prime() with CachedParameterSecret
9. prime() failure handling
10. info() returns complete structure
11. info() masks secureDataKey
12. format() with all parameters
13. format() with null values
14. read() with DynamoDB-only cache
15. read() with S3 pointer
16. read() with encrypted data
17. read() with missing cache
18. read() with decryption failure
19. write() with small data (DynamoDB)
20. write() with large data (S3)
21. write() with encryption
22. write() without encryption
23. write() with header generation
24. write() with existing headers
25. getSecureDataKeyType() for Buffer
26. getSecureDataKeyType() for string
27. getSecureDataKeyType() for CachedParameterSecret
28. getSecureDataKey() for all types
29. getSecureDataKey() with null key
30. generateEtag() consistency
31. generateInternetFormattedDate() with seconds
32. generateInternetFormattedDate() with milliseconds
33. lowerCaseKeys() with various objects
34. lowerCaseKeys() with null/undefined
35. calculateKBytes() with various strings
36. calculateKBytes() with different encodings
37. nextIntervalInSeconds() for various intervals
38. nextIntervalInSeconds() with timezone
39. Timestamp conversion methods
40. Edge cases for all utility methods

### Integration Tests Needed: 8-10

1. CacheData → DynamoDbCache integration
2. CacheData → S3Cache integration
3. Read/write round-trip with encryption
4. Read/write round-trip without encryption
5. S3 pointer creation and resolution
6. Header generation and retention
7. Expiration calculation with intervals
8. Timezone handling for intervals
9. Error handling across storage layers
10. Concurrent operations

---

## 4. Cache Class

### Public Methods

| Method | Purpose | Current Test Coverage | Untested Scenarios |
|--------|---------|----------------------|-------------------|
| `init(parameters)` | Initialize cache | Partial | - All parameter combinations<br>- In-memory cache setup<br>- Hash algorithm selection |
| `constructor(connection, cacheProfile)` | Create cache instance | Partial | - All profile options<br>- Backward compatibility<br>- Invalid profiles |
| `profile()` | Get cache profile | Partial | - All profile properties |
| `read()` | Read from cache | Partial | - In-memory cache hit<br>- In-memory cache miss<br>- DynamoDB fallback<br>- Errors |
| `test()` | Get diagnostic data | None | - All test properties |
| `get()` | Get cache data | Minimal | - Various cache states |
| `getSourceStatus()` | Get data source | Minimal | - All status values |
| `getETag()` | Get ETag header | **Covered** | ✓ Tested in this spec |
| `getLastModified()` | Get Last-Modified | **Covered** | ✓ Tested in this spec |
| `getExpires()` | Get expiration | Minimal | - Various states |
| `getExpiresGMT()` | Get expiration GMT | None | - Format verification |
| `calculateSecondsLeftUntilExpires()` | Calculate TTL | None | - Various states<br>- Expired cache |
| `getCacheControlHeaderValue()` | Get Cache-Control | None | - Public/private<br>- Max-age calculation |
| `getHeaders()` | Get all headers | Minimal | - Various states |
| `getStatusCode()` | Get status code | Minimal | - Various codes |
| `getErrorCode()` | Get error code | None | - Error scenarios |
| `getClassification()` | Get public/private | None | - Both classifications |
| `getSyncedNowTimestampInSeconds()` | Get synced time | None | - Consistency verification |
| `getHeader(key)` | Get specific header | **Covered** | ✓ Tested in this spec |
| `getBody(parseBody)` | Get body content | Minimal | - With parsing<br>- Without parsing<br>- Parse errors |
| `getResponse(parseBody)` | Get response object | None | - With parsing<br>- Without parsing |
| `generateResponseForAPIGateway(...)` | Generate API response | None | - Conditional requests<br>- 304 responses<br>- CORS headers |
| `getIdHash()` | Get cache ID | Minimal | - Hash consistency |
| `needsRefresh()` | Check if refresh needed | Minimal | - Various states |
| `isExpired()` | Check if expired | Minimal | - Expired/not expired |
| `isEmpty()` | Check if empty | Minimal | - Empty/not empty |
| `isPrivate()` | Check if private | None | - Private/public |
| `isPublic()` | Check if public | None | - Public/private |
| `extendExpires(...)` | Extend expiration | None | - Error extension<br>- Not modified extension<br>- Custom extension |
| `calculateDefaultExpires()` | Calculate default expiration | None | - Interval mode<br>- Non-interval mode |
| `getStatus()` | Get status | Minimal | - All status values |
| `update(...)` | Update cache | Partial | - Header retention<br>- Expiration calculation<br>- Status updates |

### Static Methods

| Method | Purpose | Current Test Coverage | Untested Scenarios |
|--------|---------|----------------------|-------------------|
| `bool(value)` | Convert to boolean | None | - Various inputs |
| `lowerCaseKeys(obj)` | Lowercase keys | None | - Various objects |
| `generateIdHash(idObject)` | Generate ID hash | Minimal | - Various objects<br>- Function removal<br>- Salt handling |
| `multipartId(...)` | Join ID parts | None | - Arrays<br>- Strings<br>- Custom glue |
| `parseToSeconds(date)` | Parse date to seconds | None | - Various formats<br>- Invalid dates |
| `nextIntervalInSeconds(...)` | Calculate interval | None | - Various intervals |
| `calculateKBytes(...)` | Calculate size | None | - Various strings |
| `convertToLowerCaseArray(list)` | Convert to lowercase array | None | - Strings<br>- Arrays |

### Unit Tests Needed: 45-50

**Scenarios to test:**
1. init() with all parameters
2. init() with in-memory cache enabled
3. init() with various hash algorithms
4. constructor() with all profile options
5. constructor() with backward compatible options
6. profile() returns all properties
7. read() with in-memory cache hit
8. read() with in-memory cache miss
9. read() with DynamoDB fallback
10. read() with errors
11. test() returns all diagnostic data
12. get() in various states
13. getSourceStatus() for all status values
14. getExpires() in various states
15. getExpiresGMT() format verification
16. calculateSecondsLeftUntilExpires() with valid cache
17. calculateSecondsLeftUntilExpires() with expired cache
18. getCacheControlHeaderValue() for public
19. getCacheControlHeaderValue() for private
20. getHeaders() in various states
21. getStatusCode() for various codes
22. getErrorCode() in error scenarios
23. getClassification() for private
24. getClassification() for public
25. getSyncedNowTimestampInSeconds() consistency
26. getBody() without parsing
27. getBody() with parsing
28. getBody() with parse errors
29. getResponse() without parsing
30. getResponse() with parsing
31. generateResponseForAPIGateway() basic
32. generateResponseForAPIGateway() with If-None-Match
33. generateResponseForAPIGateway() with If-Modified-Since
34. generateResponseForAPIGateway() 304 response
35. getIdHash() consistency
36. needsRefresh() for expired cache
37. needsRefresh() for empty cache
38. needsRefresh() for valid cache
39. isExpired() for expired cache
40. isExpired() for valid cache
41. isEmpty() for empty cache
42. isEmpty() for populated cache
43. isPrivate() for private cache
44. isPublic() for public cache
45. extendExpires() for error
46. extendExpires() for not modified
47. extendExpires() with custom seconds
48. calculateDefaultExpires() with interval
49. calculateDefaultExpires() without interval
50. update() with all parameters
51. update() with header retention
52. update() with expiration from headers
53. update() with status updates
54. bool() with various inputs
55. generateIdHash() with various objects
56. generateIdHash() with functions (should remove)
57. generateIdHash() with salt
58. multipartId() with arrays
59. multipartId() with strings
60. parseToSeconds() with various formats
61. convertToLowerCaseArray() with strings
62. convertToLowerCaseArray() with arrays

### Integration Tests Needed: 6-8

1. Cache → CacheData integration
2. Cache → In-memory cache integration
3. Read/write round-trip
4. Conditional request handling
5. Header retention and generation
6. Expiration calculation with origin headers
7. Error handling and cache extension
8. API Gateway response generation

---

## 5. CacheableDataAccess Class

### Public Methods

| Method | Purpose | Current Test Coverage | Untested Scenarios |
|--------|---------|----------------------|-------------------|
| `prime()` | Refresh secrets | None | - Prime before getData |
| `getData(...)` | Get cached or fresh data | **Partial** | - Cache hit<br>- Cache miss<br>- 304 Not Modified<br>- Origin errors<br>- Cache errors |

### Unit Tests Needed: 8-10

**Scenarios to test:**
1. getData() with cache hit
2. getData() with cache miss
3. getData() with expired cache
4. getData() with 304 Not Modified
5. getData() with origin error
6. getData() with cache error
7. getData() with conditional headers
8. getData() with tags for logging
9. prime() before getData()
10. Concurrent getData() calls

### Integration Tests Needed: 5-6

1. CacheableDataAccess → Cache integration
2. CacheableDataAccess → API function integration
3. End-to-end cache flow
4. Conditional request flow
5. Error handling flow
6. Header assignment validation (**Covered in this spec**)

---

## Tests Created in This Spec

### Unit Tests (8 tests)

1. **cache-getheader-unit-tests.mjs** (8 tests)
   - getHeader() with undefined value
   - getHeader() with null value
   - getHeader() with missing key
   - getHeader() with valid string value
   - getHeader() with valid number value
   - getHeader() with empty string
   - getHeader() with boolean value
   - getHeader() with object value

2. **cache-isvalidheadervalue-unit-tests.mjs** (9 tests)
   - _isValidHeaderValue() with null
   - _isValidHeaderValue() with undefined
   - _isValidHeaderValue() with empty string
   - _isValidHeaderValue() with non-empty string
   - _isValidHeaderValue() with number
   - _isValidHeaderValue() with NaN
   - _isValidHeaderValue() with boolean
   - _isValidHeaderValue() with object
   - _isValidHeaderValue() with array

### Integration Tests (6 tests)

1. **cache-header-assignment-integration-tests.mjs** (9 tests)
   - if-modified-since with undefined
   - if-modified-since with null
   - if-modified-since with valid value
   - if-none-match with undefined
   - if-none-match with null
   - if-none-match with valid value
   - Both headers with null
   - Both headers with undefined
   - Both headers with valid values

2. **cache-header-assignment.jest.mjs** (5 tests)
   - DynamoDbCache with undefined last-modified
   - DynamoDbCache with undefined etag
   - Both headers undefined
   - Both headers valid
   - Both headers null

### Property-Based Tests (5 tests)

1. **cache-getheader-property-tests.mjs** (1 test)
   - Property 1: getHeader Undefined Normalization

2. **cache-isvalidheadervalue-property-tests.mjs** (1 test)
   - Property 2: Header Value Type Validation

3. **cache-header-assignment-property-tests.mjs** (1 test)
   - Property 3: Conditional Header Assignment

4. **cache-getheader-passthrough-property-tests.mjs** (1 test)
   - Property 4: Valid Header Passthrough

5. **cache-backwards-compatibility-property-tests.mjs** (2 tests)
   - Property 5: Backwards Compatibility for Valid Values
   - Existing test suite verification

**Total Tests in This Spec: ~27 tests**

---

## Summary of Untested Scenarios

### High Priority (Core Functionality)

1. **S3Cache**
   - S3 body conversion (Buffer vs Stream)
   - Error handling for S3 operations
   - Large object handling

2. **DynamoDbCache**
   - Error handling for DynamoDB operations
   - Item size limits
   - Projection expression handling

3. **CacheData**
   - Encryption/decryption flows
   - S3 pointer creation and resolution
   - Interval-based expiration with timezones
   - Prime() functionality with different key types

4. **Cache**
   - In-memory cache integration
   - API Gateway response generation
   - Conditional request handling (If-None-Match, If-Modified-Since)
   - Cache extension on errors
   - Header retention logic

5. **CacheableDataAccess**
   - End-to-end cache flow
   - 304 Not Modified handling
   - Error recovery with stale data

### Medium Priority (Edge Cases)

1. **Initialization**
   - Multiple init() calls
   - Invalid parameters
   - Environment variable fallbacks

2. **Error Handling**
   - AWS SDK errors
   - Decryption failures
   - Parse errors

3. **Utility Functions**
   - Timestamp conversions
   - Date formatting
   - Key normalization
   - Size calculations

### Low Priority (Nice to Have)

1. **Diagnostic Methods**
   - test() method
   - info() methods
   - Logging verification

2. **Static Utilities**
   - bool() conversion
   - multipartId() joining
   - parseToSeconds() parsing

---

## Estimated Test Count for Complete Coverage

### By Test Type

| Test Type | S3Cache | DynamoDbCache | CacheData | Cache | CacheableDataAccess | Total |
|-----------|---------|---------------|-----------|-------|---------------------|-------|
| **Unit Tests** | 15-18 | 12-15 | 35-40 | 45-50 | 8-10 | **115-133** |
| **Integration Tests** | 3-4 | 3-4 | 8-10 | 6-8 | 5-6 | **25-32** |
| **Property-Based Tests** | 2-3 | 2-3 | 4-5 | 5-6 | 2-3 | **15-20** |
| **Total** | 20-25 | 17-22 | 47-55 | 56-64 | 15-19 | **155-185** |

### Adjusted for Existing Tests

- **Existing Tests (Pre-Spec):** ~30 tests
- **Tests Added in This Spec:** ~27 tests
- **Current Total:** ~57 tests
- **Remaining for Full Coverage:** ~98-128 tests

### Realistic Full Coverage Estimate

Accounting for overlap and focusing on critical paths:

- **Unit Tests:** 85-95 tests
- **Integration Tests:** 25-30 tests
- **Property-Based Tests:** 15-20 tests
- **Total:** **125-145 tests**

---

## Recommendations

### Immediate Priorities (This Spec)

✅ **Completed:**
- getHeader() undefined normalization
- Header assignment validation
- Property-based tests for core properties
- Backwards compatibility verification

### Next Phase (Future Specs)

1. **CacheableDataAccess Integration** (High Priority)
   - End-to-end cache flow tests
   - 304 Not Modified handling
   - Error recovery scenarios

2. **Encryption/Decryption** (High Priority)
   - Encryption flow tests
   - Decryption flow tests
   - Key type handling

3. **S3 and DynamoDB Integration** (Medium Priority)
   - S3 pointer resolution
   - Large object handling
   - Error handling

4. **In-Memory Cache** (Medium Priority)
   - Cache hit/miss scenarios
   - Expiration handling
   - Stale data fallback

5. **API Gateway Response** (Medium Priority)
   - Conditional request handling
   - 304 response generation
   - CORS header handling

### Long-Term Goals

1. Achieve 80%+ code coverage for public APIs
2. Property-based tests for all core logic
3. Integration tests for all AWS interactions
4. Performance benchmarks for cache operations

---

## Conclusion

The cache-dao module is a complex system with multiple layers of abstraction. This spec has addressed the critical undefined header bug and added targeted test coverage for that specific issue. However, comprehensive testing of the entire module would require an additional **98-128 tests** to cover all public methods, edge cases, and integration points.

The estimated **125-145 total tests** for full coverage represents a realistic goal that balances thoroughness with practicality. This would provide confidence in the module's correctness across all scenarios while maintaining reasonable test suite execution time.

**Key Takeaway:** This spec has successfully addressed the immediate bug and added ~27 tests. Full coverage would require approximately 4-5x more tests, focusing on integration scenarios, encryption flows, and AWS service interactions.
