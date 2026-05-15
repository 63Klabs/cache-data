# Bugfix Requirements Document

## Introduction

The `Connection` class in `Connections.classes.js` silently drops `pagination` and `retry` properties passed in the connection configuration object. These properties are not recognized by `_init()` and are not included in the output of `toObject()`. As a result, when `ApiRequest` receives a connection object via `AppConfig.getConn()` or `AppConfig.getConnCacheProfile()`, it never sees the pagination and retry configuration, defaulting to `pagination: { enabled: false }` and `retry: { enabled: false }`. This causes applications relying on connection-level pagination/retry to only receive the first page of results and have no retry behavior.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a connection configuration object includes a `pagination` property THEN the system silently ignores it during `Connection._init()` and the property is not stored on the Connection instance

1.2 WHEN a connection configuration object includes a `retry` property THEN the system silently ignores it during `Connection._init()` and the property is not stored on the Connection instance

1.3 WHEN `connection.toObject()` is called on a Connection that was configured with `pagination` THEN the system returns an object that does not include the `pagination` property

1.4 WHEN `connection.toObject()` is called on a Connection that was configured with `retry` THEN the system returns an object that does not include the `retry` property

1.5 WHEN `AppConfig.getConn()` or `AppConfig.getConnCacheProfile()` is called for a connection configured with pagination THEN the returned connection object does not contain `pagination`, causing `ApiRequest` to use its internal default of `{ enabled: false }`

1.6 WHEN `AppConfig.getConn()` or `AppConfig.getConnCacheProfile()` is called for a connection configured with retry THEN the returned connection object does not contain `retry`, causing `ApiRequest` to use its internal default of `{ enabled: false }`

### Expected Behavior (Correct)

2.1 WHEN a connection configuration object includes a `pagination` property that is not null THEN the system SHALL store the `pagination` property on the Connection instance during `_init()`

2.2 WHEN a connection configuration object includes a `retry` property that is not null THEN the system SHALL store the `retry` property on the Connection instance during `_init()`

2.3 WHEN `connection.toObject()` is called on a Connection that has a stored `pagination` property THEN the system SHALL include the `pagination` property in the returned object

2.4 WHEN `connection.toObject()` is called on a Connection that has a stored `retry` property THEN the system SHALL include the `retry` property in the returned object

2.5 WHEN `AppConfig.getConn()` or `AppConfig.getConnCacheProfile()` is called for a connection configured with pagination THEN the returned connection object SHALL include the `pagination` property so it can be passed directly to `new ApiRequest(conn)`

2.6 WHEN `AppConfig.getConn()` or `AppConfig.getConnCacheProfile()` is called for a connection configured with retry THEN the returned connection object SHALL include the `retry` property so it can be passed directly to `new ApiRequest(conn)`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a connection configuration object does not include a `pagination` property THEN the system SHALL CONTINUE TO return a `toObject()` result without a `pagination` key (ApiRequest will use its own defaults)

3.2 WHEN a connection configuration object does not include a `retry` property THEN the system SHALL CONTINUE TO return a `toObject()` result without a `retry` key (ApiRequest will use its own defaults)

3.3 WHEN a connection configuration object includes `pagination` set to null THEN the system SHALL CONTINUE TO treat it as if pagination was not provided

3.4 WHEN a connection configuration object includes `retry` set to null THEN the system SHALL CONTINUE TO treat it as if retry was not provided

3.5 WHEN a connection is created with existing recognized properties (name, method, uri, protocol, host, path, body, parameters, headers, options, note, authentication, cache) THEN the system SHALL CONTINUE TO store and return those properties correctly via `toObject()`

3.6 WHEN `connection.toInfoObject()` is called THEN the system SHALL CONTINUE TO return the same information it currently returns (toInfoObject is for logging/debugging and does not need pagination/retry)

3.7 WHEN a `ConnectionRequest` extends `Connection` THEN the system SHALL CONTINUE TO support `addHeaders()`, `addParameters()`, and other mutation methods without interference from the new properties
