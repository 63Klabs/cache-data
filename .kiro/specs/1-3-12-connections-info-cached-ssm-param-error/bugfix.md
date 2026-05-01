# Bugfix Requirements Document

## Introduction

`Connections.info()` throws an unhandled error when `CachedSsmParameter` instances used for connection authentication (basic auth username/password or API key headers) have not yet been asynchronously resolved. This occurs during `AppConfig.init()` when `debug: true` is set, because the debug logging path synchronously calls `Connections.info()` which traverses into `ConnectionAuthentication._getHeaders()` → `CachedSsmParameter.toString()` → `CachedSsmParameter.sync_getValue()`, and `sync_getValue()` throws when the cached value is still `null`. The result is that `AppConfig.init()` fails entirely during the connections initialization promise, even though the connection definitions themselves are valid. Setting `debug: false` is a workaround, confirming the bug is isolated to the debug/info code path.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `AppConfig.init()` is called with `debug: true` and connections include `CachedSsmParameter` instances for basic auth credentials (username and/or password), THEN the system throws `CachedParameterSecret Error: Secret is null. Must call and await async function .get(), .getValue(), or .refresh() first` during initialization

1.2 WHEN `AppConfig.init()` is called with `debug: true` and connections include `CachedSsmParameter` instances for authentication header values (e.g., API key headers), THEN the system throws the same `CachedParameterSecret Error` during initialization

1.3 WHEN `AppConfig.init()` is called with `debug: true` and connections include `CachedSecret` instances for authentication credentials, THEN the system throws the same `CachedParameterSecret Error` during initialization

1.4 WHEN `Connections.info()` is called before `CachedSsmParameter` or `CachedSecret` instances used in connection authentication have been resolved via `.get()`, `.getValue()`, or `.refresh()`, THEN the system throws instead of returning connection information

1.5 WHEN `Connection.toObject()` is called and the connection's authentication contains unresolved `CachedParameterSecret` instances, THEN the system throws instead of returning a connection object representation

### Expected Behavior (Correct)

2.1 WHEN `AppConfig.init()` is called with `debug: true` and connections include `CachedSsmParameter` instances for basic auth credentials, THEN the system SHALL complete initialization without throwing and SHALL log connection info with unresolved parameters represented gracefully (e.g., as a placeholder string)

2.2 WHEN `AppConfig.init()` is called with `debug: true` and connections include `CachedSsmParameter` instances for authentication header values, THEN the system SHALL complete initialization without throwing and SHALL log connection info with unresolved parameters represented gracefully

2.3 WHEN `AppConfig.init()` is called with `debug: true` and connections include `CachedSecret` instances for authentication credentials, THEN the system SHALL complete initialization without throwing and SHALL log connection info with unresolved secrets represented gracefully

2.4 WHEN `Connections.info()` is called before `CachedParameterSecret` instances used in connection authentication have been resolved, THEN the system SHALL return connection information without throwing, with unresolved values represented as safe placeholder strings

2.5 WHEN `Connection.toObject()` is called and the connection's authentication contains unresolved `CachedParameterSecret` instances, THEN the system SHALL return a connection object without throwing, with unresolved values represented as safe placeholder strings

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `AppConfig.init()` is called with `debug: false` and connections include `CachedSsmParameter` instances for authentication, THEN the system SHALL CONTINUE TO complete initialization without error (the non-debug path is unaffected)

3.2 WHEN `Connections.info()` is called after all `CachedParameterSecret` instances have been resolved, THEN the system SHALL CONTINUE TO return fully resolved connection information including resolved authentication headers and parameters

3.3 WHEN `Connection.toObject()` is called after all `CachedParameterSecret` instances have been resolved, THEN the system SHALL CONTINUE TO return a complete connection object with resolved authentication values

3.4 WHEN `ConnectionAuthentication._getBasicAuthHeader()` is called with plain string username and password (not `CachedParameterSecret` instances), THEN the system SHALL CONTINUE TO return a valid Base64-encoded Authorization header

3.5 WHEN `ConnectionAuthentication._getHeaders()` is called with plain object headers (not containing `CachedParameterSecret` instances), THEN the system SHALL CONTINUE TO return the headers object unchanged

3.6 WHEN `CachedSsmParameter.sync_getValue()` is called before the value has been resolved, THEN the system SHALL CONTINUE TO throw `CachedParameterSecret Error` (the sync_getValue contract is unchanged; the fix is in the callers, not in sync_getValue itself)

3.7 WHEN `CachedSsmParameter.toString()` is called after the value has been resolved, THEN the system SHALL CONTINUE TO return the resolved parameter value as a string

3.8 WHEN `Connection.toObject()` is called for connections without any authentication, THEN the system SHALL CONTINUE TO return the connection object without authentication fields
