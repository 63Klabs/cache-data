# Bugfix Requirements Document

## Introduction

The property-based test "should never access L0_Cache when environment variable is not set to true" in `test/cache/in-memory-cache/property/Cache-integration-property-tests.mjs` has an incorrect assertion. The test is designed to verify that the in-memory cache feature flag is disabled when the environment variable `CACHE_USE_IN_MEMORY` is NOT set to "true". However, the test's fast-check generator produces values that include "1", which `Cache.bool()` actually treats as true, causing the test assertion to fail incorrectly.

The root cause is a mismatch between the test's understanding of what values `Cache.bool()` treats as false and the actual implementation. The `Cache.bool()` method (located at `src/lib/dao-cache.js:1680`) converts strings to boolean with the following logic:
- TRUE values: "true" (case-insensitive), "1"
- FALSE values: "false", "0", "", any other string, null, undefined

The test needs to be corrected to only generate values that `Cache.bool()` actually treats as false.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the test generator produces the value "1" for `CACHE_USE_IN_MEMORY` THEN the test expects `useInMemoryCache` to be false but `Cache.bool("1")` returns true, causing the assertion to fail

1.2 WHEN the test generator produces "true" (case-insensitive variations) for `CACHE_USE_IN_MEMORY` THEN the test expects `useInMemoryCache` to be false but `Cache.bool()` returns true, causing the assertion to fail

1.3 WHEN the test uses `fc.string().filter(s => s !== 'true')` THEN it still allows "1" and case variations of "true" (like "TRUE", "True") to pass through, which are treated as true by `Cache.bool()`

### Expected Behavior (Correct)

2.1 WHEN the test generator produces values for `CACHE_USE_IN_MEMORY` THEN it SHALL only generate values that `Cache.bool()` treats as false: "false" (any case), "0", "", or any string that is NOT "true" (case-insensitive) or "1"

2.2 WHEN the test runs with generated false values THEN `Cache.init()` SHALL set `useInMemoryCache` to false and the test assertion SHALL pass

2.3 WHEN the test generator filters strings THEN it SHALL exclude both "1" and all case-insensitive variations of "true" (including "true", "TRUE", "True", "TrUe", etc.)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the test runs with the corrected generator THEN the test SHALL CONTINUE TO validate that `useInMemoryCache` is false when the environment variable is not set to a truthy value

3.2 WHEN the test runs with the corrected generator THEN it SHALL CONTINUE TO verify that `inMemoryCache` is undefined when the feature flag is disabled

3.3 WHEN `Cache.bool()` is called with "true" (case-insensitive) or "1" THEN it SHALL CONTINUE TO return true as per the existing implementation

3.4 WHEN `Cache.bool()` is called with "false", "0", "", or any other non-truthy string THEN it SHALL CONTINUE TO return false as per the existing implementation
