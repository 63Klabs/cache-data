# Connections.info() CachedSsmParameter Unresolved Error Bugfix Design

## Overview

When `AppConfig.init()` is called with `debug: true` and connections use `CachedParameterSecret` instances (either `CachedSsmParameter` or `CachedSecret`) for authentication credentials, the debug logging path triggers a synchronous call chain that ends in `CachedParameterSecret.toString()` → `sync_getValue()`, which throws because the cached value has not yet been asynchronously resolved. The fix targets `CachedParameterSecret.toString()` and `CachedParameterSecret.toJSON()` to return a safe placeholder string when the value is unresolved, rather than delegating to `sync_getValue()` which throws. This is a minimal, targeted fix that preserves the `sync_getValue()` throw contract and all existing behavior for resolved values.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — when `CachedParameterSecret.toString()` or `CachedParameterSecret.toJSON()` is called on an instance whose value has not yet been resolved (i.e., `isValid()` returns `false`)
- **Property (P)**: The desired behavior when the bug condition holds — `toString()` and `toJSON()` return a safe placeholder string instead of throwing
- **Preservation**: Existing behavior that must remain unchanged — `sync_getValue()` throw contract, resolved `toString()`/`toJSON()` behavior, plain-string authentication, connections without authentication
- **CachedParameterSecret**: Base class in `src/lib/tools/CachedParametersSecrets.classes.js` for cached SSM parameters and Secrets Manager secrets. Extended by `CachedSsmParameter` and `CachedSecret`
- **CachedSsmParameter**: Subclass of `CachedParameterSecret` for AWS SSM Parameter Store values
- **CachedSecret**: Subclass of `CachedParameterSecret` for AWS Secrets Manager values
- **ConnectionAuthentication**: Class in `src/lib/tools/Connections.classes.js` that stores authentication credentials (headers, parameters, basic auth) for a connection
- **sync_getValue()**: Synchronous method on `CachedParameterSecret` that returns the cached value or throws if the value is `null`/unresolved
- **isValid()**: Method on `CachedParameterSecret` that returns `true` if the value has been fetched and is not `null`

## Bug Details

### Bug Condition

The bug manifests when `CachedParameterSecret.toString()` or `CachedParameterSecret.toJSON()` is called before the instance's value has been asynchronously resolved via `.get()`, `.getValue()`, `.refresh()`, or `.prime()`. Both methods unconditionally delegate to `sync_getValue()`, which throws when `isValid()` returns `false`. This occurs in the debug logging path of `AppConfig.init()` because `Connections.info()` → `Connection.toObject()` → `ConnectionAuthentication._getHeaders()` / `_getBasicAuthHeader()` triggers string coercion on `CachedParameterSecret` instances used as authentication credentials.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { cachedParam: CachedParameterSecret, method: 'toString' | 'toJSON' }
  OUTPUT: boolean

  RETURN input.cachedParam.isValid() === false
         AND input.method IN ['toString', 'toJSON']
END FUNCTION
```

### Examples

- **Basic Auth with unresolved CachedSsmParameter**: A connection uses `new CachedSsmParameter('/path/to/username')` and `new CachedSsmParameter('/path/to/password')` as basic auth credentials. Calling `Connection.toObject()` triggers `_getBasicAuthHeader()` which does `Buffer.from(username + ":" + password)`, coercing `toString()` on both instances. Since they are unresolved, `sync_getValue()` throws.
- **Header Auth with unresolved CachedSsmParameter**: A connection uses `{ 'x-api-key': new CachedSsmParameter('/path/to/key') }` as authentication headers. Calling `Connection.toObject()` triggers `_getHeaders()` which returns the headers object. When this object is later serialized (e.g., by `DebugAndLog.debug()` calling `JSON.stringify()`), `toJSON()` is invoked on the `CachedSsmParameter` instance, which calls `sync_getValue()` and throws.
- **CachedSecret for basic auth**: Same as the first example but using `new CachedSecret('my-secret-id')` instead of `CachedSsmParameter`. The behavior is identical since both extend `CachedParameterSecret`.
- **Resolved parameters (no bug)**: After `await param.prime()` or `await param.getValue()`, calling `toString()` or `toJSON()` correctly returns the resolved value string — this is the non-buggy path.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `sync_getValue()` MUST continue to throw `CachedParameterSecret Error` when the value is `null`/unresolved (requirement 3.6)
- `toString()` and `toJSON()` MUST continue to return the resolved value string after the value has been fetched (requirement 3.7)
- `ConnectionAuthentication._getBasicAuthHeader()` with plain string username/password MUST continue to produce a valid Base64-encoded `Authorization` header (requirement 3.4)
- `ConnectionAuthentication._getHeaders()` with plain object headers (no `CachedParameterSecret` instances) MUST continue to return headers unchanged (requirement 3.5)
- `Connection.toObject()` for connections without authentication MUST continue to return the connection object without authentication fields (requirement 3.8)
- `Connections.info()` after all secrets are resolved MUST continue to return fully resolved connection information (requirement 3.2)
- `AppConfig.init()` with `debug: false` MUST continue to work without error (requirement 3.1)

**Scope:**
All inputs that do NOT involve unresolved `CachedParameterSecret` instances in `toString()` or `toJSON()` calls should be completely unaffected by this fix. This includes:
- Plain string authentication credentials
- Resolved `CachedParameterSecret` instances
- Connections without authentication
- All non-debug code paths
- Direct calls to `sync_getValue()` (throw contract preserved)

## Hypothesized Root Cause

Based on the bug description and source code analysis, the root cause is:

1. **Unconditional delegation to sync_getValue() in toString() and toJSON()**: Both `CachedParameterSecret.toString()` (line 245) and `CachedParameterSecret.toJSON()` (line 236) directly call `this.sync_getValue()` without checking `this.isValid()` first. When the value is unresolved, `sync_getValue()` throws.

2. **String coercion in _getBasicAuthHeader()**: `ConnectionAuthentication._getBasicAuthHeader()` (line 487) does `Buffer.from(this.#basic.username + ":" + this.#basic.password)`. The `+` operator triggers `toString()` on `CachedParameterSecret` instances, which throws via `sync_getValue()`.

3. **JSON serialization in debug logging**: `DebugAndLog.debug()` serializes objects using `JSON.stringify()`, which calls `toJSON()` on any object that defines it. When `CachedParameterSecret` instances are present in header values, `toJSON()` is called, which throws via `sync_getValue()`.

4. **Synchronous debug logging during async initialization**: `AppConfig.init()` creates a `Promise` for connections initialization but calls `Connections.info()` synchronously within that promise's executor, before any async resolution of `CachedParameterSecret` values has occurred.

The root cause is specifically in `CachedParameterSecret.toString()` and `CachedParameterSecret.toJSON()` — they should gracefully handle the unresolved state rather than unconditionally throwing.

## Correctness Properties

Property 1: Bug Condition - Unresolved CachedParameterSecret toString/toJSON Safety

_For any_ `CachedParameterSecret` instance (including `CachedSsmParameter` and `CachedSecret` subclasses) where the value has not been resolved (`isValid()` returns `false`), calling `toString()` SHALL return a non-empty placeholder string without throwing, and calling `toJSON()` SHALL return a non-empty placeholder string without throwing.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Resolved CachedParameterSecret and Plain String Behavior

_For any_ `CachedParameterSecret` instance where the value has been resolved (`isValid()` returns `true`), calling `toString()` and `toJSON()` SHALL return the same value as `sync_getValue()`. For any `ConnectionAuthentication` constructed with plain string credentials (not `CachedParameterSecret` instances), `_getBasicAuthHeader()` and `_getHeaders()` SHALL produce the same results as the original unfixed code. The `sync_getValue()` method SHALL continue to throw when the value is unresolved.

**Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/lib/tools/CachedParametersSecrets.classes.js`

**Methods**: `CachedParameterSecret.toString()` and `CachedParameterSecret.toJSON()`

**Specific Changes**:

1. **Guard `toString()` with `isValid()` check**: Before calling `sync_getValue()`, check `this.isValid()`. If the value is not valid (unresolved), return a placeholder string such as `"[Pending: <name>]"` that includes the parameter name for debuggability. If valid, delegate to `sync_getValue()` as before.

2. **Guard `toJSON()` with `isValid()` check**: Same pattern as `toString()`. If unresolved, return the placeholder string. If resolved, delegate to `sync_getValue()` as before.

3. **Placeholder string format**: Use a format like `"[Pending: <name>]"` where `<name>` is `this.name`. This provides useful debug information without exposing sensitive values, and clearly indicates the value has not yet been resolved.

4. **No changes to `sync_getValue()`**: The throw contract of `sync_getValue()` remains unchanged. Code that explicitly calls `sync_getValue()` will still get the error if the value is unresolved. The fix is only in the implicit coercion paths (`toString()` and `toJSON()`).

5. **No changes to `Connections.classes.js`**: The fix in `CachedParameterSecret` is sufficient. `ConnectionAuthentication._getBasicAuthHeader()` and `_getHeaders()` will naturally work because string coercion and JSON serialization will use the fixed `toString()` and `toJSON()` methods.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Create `CachedParameterSecret` instances without resolving them, then call `toString()` and `toJSON()` directly. Also create `ConnectionAuthentication` objects with unresolved instances and call `toObject()`. Run these tests on the UNFIXED code to observe the throws.

**Test Cases**:
1. **Unresolved CachedSsmParameter toString()**: Create `new CachedSsmParameter('/test/param')`, call `.toString()` — expect throw on unfixed code
2. **Unresolved CachedSsmParameter toJSON()**: Create `new CachedSsmParameter('/test/param')`, call `.toJSON()` — expect throw on unfixed code
3. **Unresolved CachedSecret toString()**: Create `new CachedSecret('test-secret')`, call `.toString()` — expect throw on unfixed code
4. **Basic Auth with unresolved params**: Create `ConnectionAuthentication` with `basic: { username: new CachedSsmParameter(...), password: new CachedSsmParameter(...) }`, call `.toObject()` — expect throw on unfixed code
5. **Header Auth with unresolved params**: Create `ConnectionAuthentication` with `headers: { 'x-api-key': new CachedSsmParameter(...) }`, call `.toObject()` then `JSON.stringify()` — expect throw on unfixed code

**Expected Counterexamples**:
- `toString()` and `toJSON()` throw `CachedParameterSecret Error: Secret is null...` on unresolved instances
- `ConnectionAuthentication.toObject()` throws when basic auth credentials are unresolved `CachedParameterSecret` instances
- Possible causes confirmed: unconditional delegation to `sync_getValue()` in `toString()` and `toJSON()`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL cachedParam WHERE isBugCondition(cachedParam) DO
  result_toString := cachedParam.toString()
  ASSERT result_toString is a non-empty string
  ASSERT result_toString contains cachedParam.name or a placeholder indicator
  ASSERT no exception thrown

  result_toJSON := cachedParam.toJSON()
  ASSERT result_toJSON is a non-empty string
  ASSERT no exception thrown
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL cachedParam WHERE NOT isBugCondition(cachedParam) DO
  ASSERT cachedParam.toString() === cachedParam.sync_getValue()
  ASSERT cachedParam.toJSON() === cachedParam.sync_getValue()
END FOR

FOR ALL auth WHERE auth uses plain strings (not CachedParameterSecret) DO
  ASSERT auth._getBasicAuthHeader_fixed() === auth._getBasicAuthHeader_original()
  ASSERT auth._getHeaders_fixed() === auth._getHeaders_original()
END FOR

FOR ALL cachedParam WHERE cachedParam.isValid() === false DO
  ASSERT cachedParam.sync_getValue() throws CachedParameterSecret Error
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for resolved parameters and plain-string authentication, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Resolved toString() Preservation**: Create `CachedParameterSecret` instances, manually set their value to simulate resolution, verify `toString()` returns the resolved value
2. **Plain String Basic Auth Preservation**: Create `ConnectionAuthentication` with plain string username/password, verify `_getBasicAuthHeader()` produces valid Base64 Authorization header
3. **Plain String Header Preservation**: Create `ConnectionAuthentication` with plain object headers, verify `_getHeaders()` returns headers unchanged
4. **sync_getValue() Throw Preservation**: Create unresolved `CachedParameterSecret`, verify `sync_getValue()` still throws
5. **Connection Without Auth Preservation**: Create `Connection` without authentication, verify `toObject()` returns object without auth fields

### Unit Tests

- Test `CachedParameterSecret.toString()` returns placeholder when unresolved
- Test `CachedParameterSecret.toJSON()` returns placeholder when unresolved
- Test `CachedSsmParameter.toString()` returns placeholder when unresolved
- Test `CachedSecret.toString()` returns placeholder when unresolved
- Test `CachedParameterSecret.toString()` returns resolved value when resolved
- Test `CachedParameterSecret.toJSON()` returns resolved value when resolved
- Test `sync_getValue()` still throws when unresolved (preservation)
- Test `ConnectionAuthentication.toObject()` does not throw with unresolved basic auth
- Test `ConnectionAuthentication.toObject()` does not throw with unresolved header auth
- Test `Connection.toObject()` does not throw with unresolved auth
- Test `Connections.info()` does not throw with unresolved auth

### Property-Based Tests

- Generate random parameter names and verify unresolved `toString()` returns a non-empty placeholder string containing the name
- Generate random plain-string username/password pairs and verify `_getBasicAuthHeader()` produces valid Base64 Authorization headers (preservation)
- Generate random plain-string header key/value pairs and verify `_getHeaders()` returns them unchanged (preservation)
- Generate random connection configurations (with and without auth) and verify `Connection.toObject()` does not throw

### Integration Tests

- Test full `AppConfig.init()` flow with `debug: true` and unresolved `CachedSsmParameter` basic auth — should complete without error
- Test full `AppConfig.init()` flow with `debug: true` and unresolved `CachedSsmParameter` header auth — should complete without error
- Test full `AppConfig.init()` flow with `debug: true` and unresolved `CachedSecret` auth — should complete without error
- Test that after resolving parameters, `Connection.toObject()` returns fully resolved authentication values
