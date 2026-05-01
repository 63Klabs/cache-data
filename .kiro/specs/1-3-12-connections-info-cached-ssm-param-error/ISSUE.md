# Connections.info() throws when CachedSsmParameter secrets are unresolved during AppConfig.init() with debug: true #225

[GitHub issue #225](https://github.com/63Klabs/cache-data/issues/225)

Bug: `Connections.info()` throws when `CachedSsmParameter` secrets are unresolved during `AppConfig.init()` with `debug: true`

## Description

When `AppConfig.init()` is called with `debug: true` and connections include `CachedSsmParameter` instances for authentication (basic auth or API key parameters), initialization fails with:

```
Connections initialization failed: CachedParameterSecret Error: Secret is null. Must call and await async function .get(), .getValue(), or .refresh() first
```

The error occurs because a debug/logging code path synchronously calls `Connections.info()` during initialization, which traverses `Connection.toObject()` → `ConnectionAuthentication._getHeaders()` → `CachedSsmParameter.toString()` → `CachedSsmParameter.sync_getValue()`. Since the SSM parameters have not yet been fetched asynchronously, `sync_getValue()` throws.

Setting `debug: false` in `AppConfig.init()` suppresses the error, confirming the issue is in the debug logging path.

## Steps to Reproduce

1. Define connections with `CachedSsmParameter` instances for authentication:

```js
const connections = [
    {
        name: "exampleService",
        host: "api.example.com",
        authentication: {
            basic: {
                username: new CachedSsmParameter('/path/to/username', { refreshAfter: 300 }),
                password: new CachedSsmParameter('/path/to/password', { refreshAfter: 300 }),
            }
        },
        cache: [/* ... */]
    }
];
```

2. Initialize AppConfig with `debug: true`:

```js
AppConfig.init({ settings, validations, connections, responses, debug: true });
```

3. Observe the error during initialization, before `AppConfig.promise()` or any async resolution has occurred.

## Expected Behavior

`AppConfig.init()` with `debug: true` should complete without error. Debug logging of connection info should either:

- Skip or mask unresolved `CachedSsmParameter` values (e.g., log `[pending]` or `[SSM: /path/to/param]`)
- Defer connection info logging until after async parameters have been resolved
- Catch and handle the "not yet resolved" error gracefully within `Connections.info()` / `Connection.toObject()`

## Actual Behavior

`AppConfig.init()` throws during the debug logging path. The error propagates as a connection initialization failure even though the connection definitions themselves are correct.

## Stack Trace

```
CachedParameterSecret Error: Secret is null. Must call and await async function .get(), .getValue(), or .refresh() first
    at CachedSsmParameter.sync_getValue (/.../CachedParametersSecrets.classes.js:382:10)
    at CachedSsmParameter.toString (/.../CachedParametersSecrets.classes.js:245:15)
    at ConnectionAuthentication._getBasicAuthHeader (/.../Connections.classes.js:487:68)
    at ConnectionAuthentication._getHeaders (/.../Connections.classes.js:512:70)
    at ConnectionAuthentication.toObject (/.../Connections.classes.js:542:22)
    at Connection._getAuthenticationObject (/.../Connections.classes.js:280:89)
    at Connection.getHeaders (/.../Connections.classes.js:256:25)
    at Connection.toObject (/.../Connections.classes.js:333:24)
    at Connections.info (/.../Connections.classes.js:111:38)
    at /.../tools/index.js:190:77
```

## Workaround

Set `debug: false` in `AppConfig.init()`:

```js
AppConfig.init({ settings, validations, connections, responses, debug: false });
```

## Environment

- Runtime: Node.js (AWS Lambda)
- Architecture: ARM64

## Suggested Fix

In `Connections.info()` or `Connection.toObject()`, when serializing authentication details, check whether `CachedSsmParameter` instances have been resolved before calling `sync_getValue()`. For example, `CachedSsmParameter.toString()` could return a placeholder string instead of throwing when the value has not yet been fetched.
