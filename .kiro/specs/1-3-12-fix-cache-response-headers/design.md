# Fix Cache Response Headers Bugfix Design

## Overview

`Response.finalize()` unconditionally overwrites any `Cache-Control` and `Expires` headers that the application has previously set via `addHeader()`. The fix guards the `Cache-Control` and `Expires` writes in `finalize()` with an `in` check so they only apply when the application has not already set them. This is a minimal, targeted change to two conditional blocks in a single method, preserving all existing default behavior for applications that do not pre-set these headers.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `finalize()` is called after the application has explicitly set `Cache-Control` and/or `Expires` headers via `addHeader()`, and the status code / config values would cause `finalize()` to overwrite them.
- **Property (P)**: The desired behavior when the bug condition holds — application-set `Cache-Control` and `Expires` headers are preserved through `finalize()`.
- **Preservation**: Existing default cache-header behavior (config-driven `Cache-Control` and `Expires` applied when no application header is pre-set) and all other `finalize()` side-effects (CORS, `x-exec-ms`, body stringification, logging) must remain unchanged.
- **`finalize()`**: The instance method on `Response` in `src/lib/tools/Response.class.js` that stringifies the body, sets CORS headers, sets cache-control headers, adds execution time, and logs the response.
- **`addHeader(key, value)`**: The instance method on `Response` that performs a simple key assignment `this._headers[key] = value`.
- **`errorExpirationInSeconds`**: Static config setting controlling `Cache-Control` max-age for error responses (status >= 400).
- **`routeExpirationInSeconds`**: Static config setting controlling `Cache-Control` max-age for success responses (status < 400). When 0, no cache headers are applied for success responses.

## Bug Details

### Bug Condition

The bug manifests when an application calls `addHeader("Cache-Control", ...)` or `addHeader("Expires", ...)` before calling `finalize()`, and `finalize()` enters either the error path (status >= 400) or the success path (status < 400 with `routeExpirationInSeconds > 0`). In both paths, `finalize()` unconditionally calls `addHeader()` for `Cache-Control` and `Expires`, overwriting the application's values with config-derived defaults.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { headers: Object, statusCode: number, routeExpirationInSeconds: number }
  OUTPUT: boolean

  LET hasCacheControl = 'Cache-Control' IN input.headers
  LET hasExpires = 'Expires' IN input.headers
  LET hasPreSetHeader = hasCacheControl OR hasExpires

  LET isErrorPath = input.statusCode >= 400
  LET isSuccessPath = input.statusCode < 400 AND input.routeExpirationInSeconds > 0
  LET wouldOverwrite = isErrorPath OR isSuccessPath

  RETURN hasPreSetHeader AND wouldOverwrite
END FUNCTION
```

### Examples

- **Error path, Cache-Control overwritten**: Application sets `Cache-Control: no-store` then calls `finalize()` with status 500. Expected: `Cache-Control: no-store`. Actual: `Cache-Control: max-age=180`.
- **Error path, Expires overwritten**: Application sets `Expires: Thu, 01 Jan 1970 00:00:00 GMT` then calls `finalize()` with status 404. Expected: `Expires: Thu, 01 Jan 1970 00:00:00 GMT`. Actual: `Expires: <now + errorExpirationInSeconds>`.
- **Success path, Cache-Control overwritten**: Application sets `Cache-Control: max-age=5` then calls `finalize()` with status 200 and `routeExpirationInSeconds: 3600`. Expected: `Cache-Control: max-age=5`. Actual: `Cache-Control: max-age=3600`.
- **Success path, Expires overwritten**: Application sets `Expires: <now + 5s>` then calls `finalize()` with status 200 and `routeExpirationInSeconds: 3600`. Expected: `Expires: <now + 5s>`. Actual: `Expires: <now + 3600s>`.
- **Edge case — only one header pre-set**: Application sets `Cache-Control: max-age=5` but not `Expires`, then calls `finalize()` with status 200 and `routeExpirationInSeconds: 3600`. Expected: `Cache-Control: max-age=5` preserved, `Expires` set from config. Actual (unfixed): both overwritten.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When no `Cache-Control` header has been pre-set, `finalize()` must continue to set it from config (`errorExpirationInSeconds` for errors, `routeExpirationInSeconds` for success).
- When no `Expires` header has been pre-set, `finalize()` must continue to set it from config.
- When `routeExpirationInSeconds` is 0 and status < 400, `finalize()` must continue to not set `Cache-Control` or `Expires`.
- CORS headers (`Access-Control-Allow-Origin`, `Referrer-Policy`, `Vary`) must continue to be set.
- The `x-exec-ms` header must continue to be set.
- Body stringification must continue to work.
- Response logging to CloudWatch must continue to work.
- Headers other than `Cache-Control` and `Expires` set via `addHeader()` must continue to be preserved.

**Scope:**
All inputs where the application has NOT pre-set `Cache-Control` or `Expires` headers should be completely unaffected by this fix. This includes:
- Default responses with no custom cache headers
- Responses where only non-cache headers are set via `addHeader()`
- Responses where `routeExpirationInSeconds` is 0 and status < 400

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is straightforward:

1. **Unconditional `addHeader()` calls**: In `finalize()` (lines ~670-676 of `Response.class.js`), both the error path and the success path call `this.addHeader("Cache-Control", ...)` and `this.addHeader("Expires", ...)` without first checking whether those keys already exist in `this._headers`.

2. **`addHeader()` is a simple overwrite**: The `addHeader(key, value)` method performs `this._headers[key] = value` — a plain property assignment that always overwrites any existing value.

3. **No precedence logic**: There is no concept of "application-set headers take priority over config defaults" in the current implementation. The code assumes `finalize()` is the sole authority for cache headers.

This is a single-cause bug: the missing guard check before the `addHeader()` calls in `finalize()`.

## Correctness Properties

Property 1: Bug Condition — Application-Set Cache Headers Preserved

_For any_ input where the application has pre-set `Cache-Control` and/or `Expires` headers via `addHeader()` before calling `finalize()`, and `finalize()` would normally apply config-derived cache headers (status >= 400, or status < 400 with `routeExpirationInSeconds > 0`), the fixed `finalize()` SHALL preserve the application-set header values unchanged in the returned response.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation — Default Cache Headers Applied When Not Pre-Set

_For any_ input where the application has NOT pre-set `Cache-Control` or `Expires` headers before calling `finalize()`, the fixed `finalize()` SHALL produce the same `Cache-Control` and `Expires` header values as the original (unfixed) `finalize()`, preserving the config-driven default behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**


## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/lib/tools/Response.class.js`

**Function**: `finalize()`

**Specific Changes**:

1. **Guard `Expires` write in error path (status >= 400)**: Wrap the `this.addHeader("Expires", ...)` call inside `if (!('Expires' in this._headers))`.

2. **Guard `Cache-Control` write in error path (status >= 400)**: Wrap the `this.addHeader("Cache-Control", ...)` call inside `if (!('Cache-Control' in this._headers))`.

3. **Guard `Expires` write in success path (status < 400, routeExpirationInSeconds > 0)**: Wrap the `this.addHeader("Expires", ...)` call inside `if (!('Expires' in this._headers))`.

4. **Guard `Cache-Control` write in success path (status < 400, routeExpirationInSeconds > 0)**: Wrap the `this.addHeader("Cache-Control", ...)` call inside `if (!('Cache-Control' in this._headers))`.

5. **Update JSDoc on `finalize()`**: Add a note documenting that application-set `Cache-Control` and `Expires` headers take precedence over config defaults.

**Before (unfixed):**
```javascript
if (this._statusCode >= 400) {
    this.addHeader("Expires", (new Date(Date.now() + ( Response.#settings.errorExpirationInSeconds * 1000))).toUTCString());
    this.addHeader("Cache-Control", "max-age="+Response.#settings.errorExpirationInSeconds);
} else if (Response.#settings.routeExpirationInSeconds > 0 ) {
    this.addHeader("Expires", (new Date(Date.now() + ( Response.#settings.routeExpirationInSeconds * 1000))).toUTCString());
    this.addHeader("Cache-Control", "max-age="+Response.#settings.routeExpirationInSeconds);
}
```

**After (fixed):**
```javascript
if (this._statusCode >= 400) {
    if (!('Expires' in this._headers)) {
        this.addHeader("Expires", (new Date(Date.now() + ( Response.#settings.errorExpirationInSeconds * 1000))).toUTCString());
    }
    if (!('Cache-Control' in this._headers)) {
        this.addHeader("Cache-Control", "max-age="+Response.#settings.errorExpirationInSeconds);
    }
} else if (Response.#settings.routeExpirationInSeconds > 0 ) {
    if (!('Expires' in this._headers)) {
        this.addHeader("Expires", (new Date(Date.now() + ( Response.#settings.routeExpirationInSeconds * 1000))).toUTCString());
    }
    if (!('Cache-Control' in this._headers)) {
        this.addHeader("Cache-Control", "max-age="+Response.#settings.routeExpirationInSeconds);
    }
}
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that pre-set `Cache-Control` and/or `Expires` headers via `addHeader()`, then call `finalize()`, and assert that the application-set values are preserved. Run these tests on the UNFIXED code to observe failures and confirm the overwrite behavior.

**Test Cases**:
1. **Error Path Cache-Control Overwrite**: Set `Cache-Control: no-store`, call `finalize()` with status 500, assert `Cache-Control` is `no-store` (will fail on unfixed code)
2. **Error Path Expires Overwrite**: Set `Expires: Thu, 01 Jan 1970 00:00:00 GMT`, call `finalize()` with status 404, assert `Expires` is preserved (will fail on unfixed code)
3. **Success Path Cache-Control Overwrite**: Set `Cache-Control: max-age=5`, call `finalize()` with status 200 and `routeExpirationInSeconds: 3600`, assert `Cache-Control` is `max-age=5` (will fail on unfixed code)
4. **Success Path Expires Overwrite**: Set custom `Expires`, call `finalize()` with status 200 and `routeExpirationInSeconds: 3600`, assert `Expires` is preserved (will fail on unfixed code)
5. **Partial Pre-Set**: Set only `Cache-Control` (not `Expires`), call `finalize()`, assert `Cache-Control` preserved and `Expires` set from config (will partially fail on unfixed code)

**Expected Counterexamples**:
- Application-set `Cache-Control` values are replaced by config-derived `max-age=<configValue>`
- Application-set `Expires` values are replaced by config-derived date strings
- Root cause confirmed: unconditional `addHeader()` calls in `finalize()`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  response := new Response(clientRequest)
  response.setStatusCode(input.statusCode)
  response.addHeader("Cache-Control", input.cacheControlValue)
  response.addHeader("Expires", input.expiresValue)
  result := response.finalize()
  ASSERT result.headers["Cache-Control"] = input.cacheControlValue
  ASSERT result.headers["Expires"] = input.expiresValue
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT finalize_fixed(input).headers["Cache-Control"] = finalize_original(input).headers["Cache-Control"]
  ASSERT finalize_fixed(input).headers["Expires"] = finalize_original(input).headers["Expires"]
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (various status codes, config values)
- It catches edge cases that manual unit tests might miss (boundary status codes like 399/400)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for responses without pre-set cache headers, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Default Error Headers Preserved**: For any status >= 400 with no pre-set cache headers, verify `Cache-Control` and `Expires` are set from `errorExpirationInSeconds`
2. **Default Success Headers Preserved**: For any status < 400 with `routeExpirationInSeconds > 0` and no pre-set cache headers, verify `Cache-Control` and `Expires` are set from `routeExpirationInSeconds`
3. **No Cache Headers When routeExpirationInSeconds is 0**: For status < 400 with `routeExpirationInSeconds: 0` and no pre-set cache headers, verify no `Cache-Control` or `Expires` headers are set by `finalize()`
4. **Non-Cache Headers Preserved**: For any response with custom non-cache headers, verify those headers survive `finalize()` unchanged

### Unit Tests

- Test pre-set `Cache-Control` preserved in error path (status 400, 404, 500)
- Test pre-set `Expires` preserved in error path
- Test pre-set `Cache-Control` preserved in success path (status 200, 201, 301)
- Test pre-set `Expires` preserved in success path
- Test partial pre-set: only `Cache-Control` set, `Expires` gets default
- Test partial pre-set: only `Expires` set, `Cache-Control` gets default
- Test default behavior unchanged when no headers pre-set (error path)
- Test default behavior unchanged when no headers pre-set (success path)
- Test no cache headers when `routeExpirationInSeconds` is 0 and status < 400

### Property-Based Tests

- Generate random `Cache-Control` values and status codes >= 400, verify application-set values are preserved after `finalize()`
- Generate random `Cache-Control` values and status codes in [200, 399] with `routeExpirationInSeconds > 0`, verify application-set values are preserved
- Generate random status codes and verify default cache headers are applied when no headers are pre-set (preservation)
- Generate random non-cache header names/values and verify they survive `finalize()` unchanged

### Integration Tests

- Test full response lifecycle: create Response, set body, set custom cache headers, finalize, verify complete response object
- Test that CORS headers, `x-exec-ms`, body stringification, and logging all continue to work alongside the fix
- Test interaction between `reset()` and cache header preservation (reset clears headers, so subsequent `finalize()` should apply defaults)
