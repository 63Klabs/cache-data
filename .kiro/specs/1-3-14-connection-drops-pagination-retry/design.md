# Connection Drops Pagination and Retry Bugfix Design

## Overview

The `Connection` class in `Connections.classes.js` silently drops `pagination` and `retry` properties from the connection configuration object. The `_init()` method does not recognize these properties, and `toObject()` does not include them in its output. This causes `ApiRequest` to never receive pagination/retry configuration from connection objects, defaulting to `{ enabled: false }` for both. The fix adds `_pagination` and `_retry` instance fields, handles them in `_init()`, and includes them in `toObject()` output, following the same pattern used by all other connection properties.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — when a connection configuration object includes `pagination` and/or `retry` properties that are not null, and those properties are lost during `_init()` / `toObject()`
- **Property (P)**: The desired behavior — `pagination` and `retry` properties are stored on the Connection instance and included in `toObject()` output
- **Preservation**: Existing behavior for all other connection properties (name, method, uri, protocol, host, path, body, parameters, headers, options, note, authentication, cache) must remain unchanged
- **Connection**: The class in `src/lib/tools/Connections.classes.js` that models an API connection configuration
- **_init()**: The method on Connection that accepts a configuration object and stores recognized properties as instance fields
- **toObject()**: The method on Connection that serializes the instance back to a plain object for consumption by `ApiRequest`
- **ApiRequest**: The class in `src/lib/tools/ApiRequest.class.js` that consumes connection objects and merges pagination/retry config with its own defaults

## Bug Details

### Bug Condition

The bug manifests when a connection configuration object includes `pagination` and/or `retry` properties. The `Connection._init()` method does not have handling for these properties, so they are silently ignored. Subsequently, `toObject()` cannot include them in its output because they were never stored.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ConnectionConfigObject
  OUTPUT: boolean
  
  RETURN ("pagination" IN input AND input.pagination !== null)
         OR ("retry" IN input AND input.retry !== null)
END FUNCTION
```

### Examples

- **Pagination provided**: `new Connection({ host: "api.example.com", path: "/items", pagination: { enabled: true, defaultLimit: 1000 } })` → `toObject()` returns object WITHOUT `pagination` (bug). Expected: object includes `pagination`.
- **Retry provided**: `new Connection({ host: "api.example.com", path: "/items", retry: { enabled: true, maxRetries: 2 } })` → `toObject()` returns object WITHOUT `retry` (bug). Expected: object includes `retry`.
- **Both provided**: `new Connection({ host: "api.example.com", pagination: { enabled: true }, retry: { enabled: true } })` → `toObject()` returns object WITHOUT either property (bug). Expected: object includes both.
- **Neither provided (no bug)**: `new Connection({ host: "api.example.com", path: "/items" })` → `toObject()` returns object without `pagination` or `retry` keys. This is correct and must remain unchanged.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- All existing properties handled by `_init()` (name, method, uri, protocol, host, path, body, parameters, headers, options, note, authentication, cache) must continue to be stored and returned correctly
- `toObject()` must continue to return headers, parameters, body, authentication, and cache as it does today
- `toInfoObject()` must continue to return the same information (it is for logging/debugging and does not need pagination/retry)
- `ConnectionRequest` subclass methods (`addHeaders()`, `addParameters()`, etc.) must continue to work without interference
- Mouse/keyboard/other interaction patterns with the Connection class remain unchanged
- When `pagination` is not provided or is null, `toObject()` must NOT include a `pagination` key
- When `retry` is not provided or is null, `toObject()` must NOT include a `retry` key

**Scope:**
All inputs that do NOT include non-null `pagination` or `retry` properties should be completely unaffected by this fix. This includes:
- Connection objects with only the currently-recognized properties
- Connection objects with `pagination: null` or `retry: null`
- Connection objects with no pagination/retry keys at all
- All `toInfoObject()` calls regardless of configuration

## Hypothesized Root Cause

Based on the bug description, the root cause is straightforward:

1. **Missing Instance Fields**: The `Connection` class does not declare `_pagination` or `_retry` instance fields, so there is nowhere to store these values.

2. **Missing `_init()` Handling**: The `_init()` method has explicit handling for each recognized property (name, method, uri, protocol, host, path, body, parameters, headers, options, note, authentication, cache) but does not include handling for `pagination` or `retry`. Properties not explicitly handled are silently ignored.

3. **Missing `toObject()` Output**: The `toObject()` method explicitly includes each stored property in its output but cannot include `pagination` or `retry` because they were never stored.

This is not a logic error — it is simply an omission. The `pagination` and `retry` properties were likely added to `ApiRequest` after the `Connection` class was written, and the Connection class was never updated to pass them through.

## Correctness Properties

Property 1: Bug Condition - Pagination and Retry Pass-Through

_For any_ connection configuration object where `pagination` is a non-null object and/or `retry` is a non-null object, the fixed `Connection` class SHALL store these properties during `_init()` and include them in the object returned by `toObject()`, such that `ApiRequest` can merge them with its defaults.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

Property 2: Preservation - Existing Property Behavior Unchanged

_For any_ connection configuration object where the bug condition does NOT hold (no non-null `pagination` or `retry` provided), the fixed `Connection` class SHALL produce exactly the same `toObject()` output as the original class, preserving all existing property handling for name, method, uri, protocol, host, path, body, parameters, headers, options, note, authentication, and cache.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/lib/tools/Connections.classes.js`

**Class**: `Connection`

**Specific Changes**:

1. **Add Instance Fields**: Add `_pagination = null;` and `_retry = null;` to the instance field declarations (alongside existing fields like `_name`, `_method`, etc.)

2. **Add `_init()` Handling for `pagination`**: Add the line:
   ```javascript
   if ( "pagination" in obj && obj.pagination !== null ) { this._pagination = obj.pagination; }
   ```
   This follows the exact same pattern as all other properties in `_init()`.

3. **Add `_init()` Handling for `retry`**: Add the line:
   ```javascript
   if ( "retry" in obj && obj.retry !== null ) { this._retry = obj.retry; }
   ```

4. **Add `toObject()` Output for `pagination`**: Add to the `toObject()` method:
   ```javascript
   if ( this._pagination !== null ) { obj.pagination = this._pagination; }
   ```

5. **Add `toObject()` Output for `retry`**: Add to the `toObject()` method:
   ```javascript
   if ( this._retry !== null ) { obj.retry = this._retry; }
   ```

6. **Update JSDoc**: Update the `@param` JSDoc on the constructor to include `pagination` and `retry` in the type definition.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that create Connection instances with `pagination` and `retry` properties, then call `toObject()` and assert those properties are present. Run these tests on the UNFIXED code to observe failures and confirm the bug.

**Test Cases**:
1. **Pagination Only Test**: Create Connection with `pagination: { enabled: true, defaultLimit: 1000 }`, call `toObject()`, assert `pagination` is in result (will fail on unfixed code)
2. **Retry Only Test**: Create Connection with `retry: { enabled: true, maxRetries: 2 }`, call `toObject()`, assert `retry` is in result (will fail on unfixed code)
3. **Both Properties Test**: Create Connection with both `pagination` and `retry`, call `toObject()`, assert both are in result (will fail on unfixed code)
4. **Null Values Test**: Create Connection with `pagination: null` and `retry: null`, call `toObject()`, assert neither key is present (may pass on unfixed code — confirms null handling)

**Expected Counterexamples**:
- `toObject()` output does not contain `pagination` or `retry` keys even when provided
- Possible causes: missing instance fields, missing `_init()` handling, missing `toObject()` output

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  conn := new Connection(input)
  result := conn.toObject()
  IF "pagination" IN input AND input.pagination !== null THEN
    ASSERT "pagination" IN result
    ASSERT result.pagination DEEP_EQUALS input.pagination
  END IF
  IF "retry" IN input AND input.retry !== null THEN
    ASSERT "retry" IN result
    ASSERT result.retry DEEP_EQUALS input.retry
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT Connection_original.toObject(input) DEEP_EQUALS Connection_fixed.toObject(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many connection configuration objects automatically across the input domain
- It catches edge cases that manual unit tests might miss (e.g., unusual property combinations)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for connections without pagination/retry, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Existing Properties Preservation**: Verify that connections with method, uri, protocol, host, path, headers, parameters, body, options, note, authentication, and cache continue to produce identical `toObject()` output after the fix
2. **Null Pagination/Retry Preservation**: Verify that `pagination: null` and `retry: null` do not appear in `toObject()` output
3. **Missing Pagination/Retry Preservation**: Verify that connections without pagination/retry keys produce identical output
4. **toInfoObject Preservation**: Verify that `toInfoObject()` output is unchanged regardless of pagination/retry configuration

### Unit Tests

- Test `_init()` stores pagination when provided as non-null object
- Test `_init()` stores retry when provided as non-null object
- Test `_init()` ignores pagination when null
- Test `_init()` ignores retry when null
- Test `toObject()` includes pagination when stored
- Test `toObject()` includes retry when stored
- Test `toObject()` excludes pagination when not stored (null)
- Test `toObject()` excludes retry when not stored (null)
- Test round-trip: config → Connection → toObject() → same config values

### Property-Based Tests

- Generate random valid pagination config objects and verify they survive the Connection round-trip
- Generate random valid retry config objects (including nested `retryOn`) and verify they survive the Connection round-trip
- Generate random connection configs WITHOUT pagination/retry and verify `toObject()` output matches original behavior exactly
- Generate connection configs with pagination/retry set to null and verify they are excluded from output

### Integration Tests

- Test full flow: connection config with pagination/retry → `Connection` → `toObject()` → `new ApiRequest(conn)` → verify ApiRequest has correct merged pagination/retry config
- Test that `AppConfig.getConn()` returns connection objects that include pagination/retry when configured
- Test that `AppConfig.getConnCacheProfile()` returns connection objects that include pagination/retry when configured
