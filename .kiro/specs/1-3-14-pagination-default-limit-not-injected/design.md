# Pagination Default Limit Not Injected Bugfix Design

## Overview

The `ApiRequest` constructor does not inject `pagination.defaultLimit` as a query parameter (`parameters[limitLabel]`) before constructing the request URI. This causes a mismatch: the remote API receives no limit parameter (and uses its own small default page size), while `_handlePagination()` assumes the first page contained `defaultLimit` items for offset math. The fix injects `defaultLimit` into `parameters` when pagination is enabled and no explicit limit is provided, ensuring the HTTP request and pagination math use the same limit value.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — pagination is enabled with a `defaultLimit` configured, but `parameters` does not contain the `limitLabel` key
- **Property (P)**: The desired behavior — the initial request URI includes `limitLabel=defaultLimit` as a query parameter so the remote API returns the expected page size
- **Preservation**: Existing behavior that must remain unchanged — explicit user-provided limit values are not overwritten, non-paginated requests are unaffected, and other query parameters are preserved
- **ApiRequest**: The class in `src/lib/tools/ApiRequest.class.js` that constructs HTTP requests with optional pagination and retry support
- **defaultLimit**: The configured maximum number of items to request per page (default: 200)
- **limitLabel**: The query parameter name used for the limit (default: `"limit"`, configurable per endpoint, e.g., `"take"`, `"pageSize"`)
- **parameters**: The object of query string key-value pairs appended to the request URI
- **_handlePagination()**: The private method that calculates offsets and fetches additional pages based on `totalItems` and the resolved limit value

## Bug Details

### Bug Condition

The bug manifests when pagination is enabled with a `defaultLimit` value and the caller does not provide an explicit limit in `parameters`. The constructor builds the URI without the limit query parameter, so the remote API applies its own (typically smaller) page size. Then `_handlePagination()` resolves the limit as `this.#request.parameters[limitLabel] || defaultLimit`, computing offsets based on `defaultLimit` rather than the actual page size returned by the API.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ApiRequestConfig
  OUTPUT: boolean

  RETURN input.pagination IS NOT NULL
         AND input.pagination.enabled = true
         AND (input.parameters IS NULL
              OR input.parameters IS UNDEFINED
              OR input.parameters[input.pagination.limitLabel] IS UNDEFINED
              OR input.parameters[input.pagination.limitLabel] IS NULL)
END FUNCTION
```

### Examples

- **Example 1**: `{ host: "api.example.com", path: "/items", pagination: { enabled: true, defaultLimit: 1000, limitLabel: "take" } }` — Expected URI contains `?take=1000`, actual URI contains no `take` parameter. API returns 20 items (its default), pagination math uses 1000, concludes no more pages needed.
- **Example 2**: `{ host: "api.example.com", path: "/items", parameters: {}, pagination: { enabled: true, defaultLimit: 200, limitLabel: "limit" } }` — Expected URI contains `?limit=200`, actual URI has no query string at all. Same mismatch occurs.
- **Example 3**: `{ host: "api.example.com", path: "/items", parameters: null, pagination: { enabled: true, defaultLimit: 500, limitLabel: "pageSize" } }` — Expected URI contains `?pageSize=500`, actual URI has no query string. Parameters object is null so no injection occurs.
- **Example 4 (not a bug)**: `{ host: "api.example.com", path: "/items", parameters: { take: 50 }, pagination: { enabled: true, defaultLimit: 1000, limitLabel: "take" } }` — User explicitly provides `take=50`, which should be preserved. URI correctly contains `?take=50`.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When `parameters` already contains an explicit value for `limitLabel` (e.g., `{ take: 500 }`), the system continues to use the user-provided value and does not overwrite it with `defaultLimit`
- When pagination is disabled (absent, null, or `enabled: false`), the system constructs the URI using only the provided `parameters` without injecting any limit
- When `parameters` contains other query parameters (filters, sort, etc.), all existing parameters continue to appear in the query string alongside the injected limit
- When a request does not use pagination at all, the URI is constructed as `{protocol}://{host}{path}?{query string from parameters}` with no modifications
- The `_handlePagination()` offset math continues to use `this.#request.parameters[limitLabel] || defaultLimit` — after the fix, `parameters[limitLabel]` will always be populated when pagination is enabled, making the fallback to `defaultLimit` a safety net rather than the primary path

**Scope:**
All inputs where pagination is NOT enabled or where an explicit limit IS provided should be completely unaffected by this fix. This includes:
- Requests with `pagination: null` or `pagination.enabled: false`
- Requests with an explicit `parameters[limitLabel]` value
- Requests that do not include a `pagination` key at all

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is:

1. **Missing Injection Step in Constructor**: The constructor (lines 563–667 of `ApiRequest.class.js`) merges pagination configuration with defaults and constructs the URI from `parameters`, but never injects `defaultLimit` into `parameters[limitLabel]`. The URI construction block (lines 656–666) only appends a query string if `request.parameters` is a non-empty object — it does not consider pagination configuration.

2. **Separation of Concerns Gap**: The pagination configuration (`defaultLimit`, `limitLabel`) is stored in `req.pagination` but never propagated to `req.parameters` before URI construction. The `_handlePagination()` method compensates with a fallback (`this.#request.parameters[limitLabel] || defaultLimit`), but this only affects offset math — not the actual HTTP request sent to the remote API.

3. **Implicit Assumption**: The original design assumed callers would always provide the limit parameter explicitly when using pagination. The `defaultLimit` was intended as a fallback for offset calculation, not as a value to inject into the request. This assumption breaks when callers rely on `defaultLimit` to control page size.

## Correctness Properties

Property 1: Bug Condition - Default Limit Injected as Query Parameter

_For any_ input where pagination is enabled and no explicit limit parameter is provided (isBugCondition returns true), the fixed `ApiRequest` constructor SHALL inject `pagination.defaultLimit` as `parameters[pagination.limitLabel]` before URI construction, so that `getURI()` contains the query parameter `limitLabel=defaultLimit`.

**Validates: Requirements 2.1, 2.3**

Property 2: Preservation - Explicit Limit Not Overridden

_For any_ input where pagination is enabled AND `parameters` already contains an explicit value for `limitLabel` (isBugCondition returns false due to explicit limit), the fixed constructor SHALL preserve the user-provided limit value unchanged and produce the same URI as the original constructor.

**Validates: Requirements 2.4, 3.1**

Property 3: Preservation - Non-Paginated Requests Unchanged

_For any_ input where pagination is disabled or absent (isBugCondition returns false due to no pagination), the fixed constructor SHALL produce exactly the same URI as the original constructor, with no additional parameters injected.

**Validates: Requirements 3.2, 3.5**

Property 4: Preservation - Other Parameters Retained

_For any_ input where pagination is enabled and `parameters` contains other query parameters alongside the (possibly missing) limit, the fixed constructor SHALL retain all existing parameters in the query string in addition to the injected limit.

**Validates: Requirements 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/lib/tools/ApiRequest.class.js`

**Function**: `constructor(request)`

**Specific Changes**:

1. **Inject defaultLimit into parameters when pagination is enabled and limit is missing**: After the pagination configuration is merged (around line 637) and before the URI construction block (line 649), add logic to inject `defaultLimit` as `parameters[limitLabel]`.

2. **Handle null/undefined/empty parameters**: If `request.parameters` is `null`, `undefined`, or an empty object, create or populate it with `{ [limitLabel]: defaultLimit }` before URI construction.

3. **Preserve explicit limit values**: Only inject when `parameters[limitLabel]` is `undefined` or `null`. If the caller provided an explicit limit (even `0`), do not overwrite it.

4. **Store injected parameters on req object**: Ensure the injected limit is stored in `this.#request.parameters` so that `_handlePagination()` can read it directly without needing the fallback.

5. **Placement**: The injection must occur after pagination config merge but before the URI construction `if` block that checks `request.parameters`.

**Pseudocode for the fix:**
```
// After pagination config merge, before URI construction:
IF req.pagination.enabled = true THEN
  limitLabel ← req.pagination.limitLabel
  defaultLimit ← req.pagination.defaultLimit

  // Ensure parameters object exists
  IF request.parameters IS NULL OR request.parameters IS UNDEFINED THEN
    request.parameters ← {}
  END IF

  // Inject defaultLimit if no explicit limit provided
  IF request.parameters[limitLabel] IS UNDEFINED OR request.parameters[limitLabel] IS NULL THEN
    request.parameters[limitLabel] ← defaultLimit
  END IF
END IF
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Create `ApiRequest` instances with pagination enabled and no explicit limit parameter. Inspect the URI returned by `getURI()` to confirm the limit parameter is missing. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **No parameters provided**: `{ host, path, pagination: { enabled: true, defaultLimit: 1000, limitLabel: "take" } }` — verify `getURI()` does NOT contain `take=1000` (will fail on unfixed code when we assert it SHOULD contain it)
2. **Empty parameters object**: `{ host, path, parameters: {}, pagination: { enabled: true, defaultLimit: 200, limitLabel: "limit" } }` — verify `getURI()` does NOT contain `limit=200`
3. **Null parameters**: `{ host, path, parameters: null, pagination: { enabled: true, defaultLimit: 500, limitLabel: "pageSize" } }` — verify `getURI()` does NOT contain `pageSize=500`
4. **Default limitLabel and defaultLimit**: `{ host, path, pagination: { enabled: true } }` — verify `getURI()` does NOT contain `limit=200` (using defaults)

**Expected Counterexamples**:
- `getURI()` returns a URI without the limit query parameter when pagination is enabled
- The `parameters` object on the internal `#request` does not contain `limitLabel` key after construction

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  request ← ApiRequest'(input)
  uri ← request.getURI()
  ASSERT uri CONTAINS (input.pagination.limitLabel + "=" + input.pagination.defaultLimit)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT ApiRequest(input).getURI() = ApiRequest'(input).getURI()
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss (e.g., special characters in parameter values, numeric edge cases for limit)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for requests with explicit limits and non-paginated requests, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Explicit limit preservation**: Generate random `parameters` objects that include `limitLabel` with various numeric values — verify URI is identical before and after fix
2. **Non-paginated request preservation**: Generate random requests with `pagination: null` or `pagination.enabled: false` — verify URI is identical
3. **Other parameters retained**: Generate random `parameters` objects with multiple keys (filters, sort, etc.) alongside pagination — verify all parameters appear in URI
4. **Disabled pagination with parameters**: Generate requests with `pagination.enabled: false` and various parameters — verify no limit injection occurs

### Unit Tests

- Test `ApiRequest` constructor with pagination enabled and no limit parameter — verify URI contains `limitLabel=defaultLimit`
- Test with `parameters: null` and pagination enabled — verify URI contains limit
- Test with `parameters: {}` and pagination enabled — verify URI contains limit
- Test with explicit limit already in parameters — verify it is NOT overwritten
- Test with pagination disabled — verify no limit injection
- Test with pagination absent — verify no limit injection
- Test with custom `limitLabel` (e.g., `"take"`, `"pageSize"`) — verify correct label used
- Test with `defaultLimit` at boundary values (0, 1, very large numbers)

### Property-Based Tests

- Generate random `ApiRequestConfig` objects with pagination enabled and no explicit limit — verify `getURI()` always contains `limitLabel=defaultLimit`
- Generate random `ApiRequestConfig` objects with explicit limit values — verify `getURI()` preserves the explicit value unchanged
- Generate random non-paginated `ApiRequestConfig` objects — verify `getURI()` matches original behavior exactly
- Generate random `parameters` objects with multiple keys — verify all keys appear in the query string after fix

### Integration Tests

- Test full pagination flow: create `ApiRequest` with pagination enabled, mock HTTP responses with `totalItems > defaultLimit`, verify multiple pages are fetched with correct offsets
- Test that `_handlePagination()` offset math aligns with the limit in the actual request URI
- Test end-to-end with `Endpoint` class to verify pagination works correctly through the full stack
