# Bugfix Requirements Document

## Introduction

`Response.finalize()` unconditionally overwrites any `Cache-Control` and `Expires` headers that the application has previously set via `addHeader()`. This prevents applications from setting dynamic, per-route cache values because `finalize()` always replaces them with the static `routeExpirationInSeconds` or `errorExpirationInSeconds` config values. The user documentation even shows `addHeader('Cache-Control', ...)` as a valid usage pattern, making this a contradiction between documented API behavior and actual runtime behavior. This is a PATCH-level fix with no impact on applications that do not pre-set these headers.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an application calls `addHeader("Cache-Control", <value>)` before `finalize()` and the response status code is >= 400 THEN the system overwrites the application-set `Cache-Control` header with `max-age=<errorExpirationInSeconds>` from config

1.2 WHEN an application calls `addHeader("Expires", <value>)` before `finalize()` and the response status code is >= 400 THEN the system overwrites the application-set `Expires` header with a date computed from `errorExpirationInSeconds`

1.3 WHEN an application calls `addHeader("Cache-Control", <value>)` before `finalize()` and the response status code is < 400 and `routeExpirationInSeconds > 0` THEN the system overwrites the application-set `Cache-Control` header with `max-age=<routeExpirationInSeconds>` from config

1.4 WHEN an application calls `addHeader("Expires", <value>)` before `finalize()` and the response status code is < 400 and `routeExpirationInSeconds > 0` THEN the system overwrites the application-set `Expires` header with a date computed from `routeExpirationInSeconds`

### Expected Behavior (Correct)

2.1 WHEN an application calls `addHeader("Cache-Control", <value>)` before `finalize()` and the response status code is >= 400 THEN the system SHALL preserve the application-set `Cache-Control` header value

2.2 WHEN an application calls `addHeader("Expires", <value>)` before `finalize()` and the response status code is >= 400 THEN the system SHALL preserve the application-set `Expires` header value

2.3 WHEN an application calls `addHeader("Cache-Control", <value>)` before `finalize()` and the response status code is < 400 and `routeExpirationInSeconds > 0` THEN the system SHALL preserve the application-set `Cache-Control` header value

2.4 WHEN an application calls `addHeader("Expires", <value>)` before `finalize()` and the response status code is < 400 and `routeExpirationInSeconds > 0` THEN the system SHALL preserve the application-set `Expires` header value

### Unchanged Behavior (Regression Prevention)

3.1 WHEN no `Cache-Control` header has been set by the application before `finalize()` and the response status code is >= 400 THEN the system SHALL CONTINUE TO set `Cache-Control` to `max-age=<errorExpirationInSeconds>`

3.2 WHEN no `Expires` header has been set by the application before `finalize()` and the response status code is >= 400 THEN the system SHALL CONTINUE TO set `Expires` to a date computed from `errorExpirationInSeconds`

3.3 WHEN no `Cache-Control` header has been set by the application before `finalize()` and the response status code is < 400 and `routeExpirationInSeconds > 0` THEN the system SHALL CONTINUE TO set `Cache-Control` to `max-age=<routeExpirationInSeconds>`

3.4 WHEN no `Expires` header has been set by the application before `finalize()` and the response status code is < 400 and `routeExpirationInSeconds > 0` THEN the system SHALL CONTINUE TO set `Expires` to a date computed from `routeExpirationInSeconds`

3.5 WHEN no `Cache-Control` or `Expires` header has been set by the application before `finalize()` and the response status code is < 400 and `routeExpirationInSeconds` is 0 THEN the system SHALL CONTINUE TO not set `Cache-Control` or `Expires` headers

3.6 WHEN the application sets headers other than `Cache-Control` and `Expires` before `finalize()` THEN the system SHALL CONTINUE TO preserve those headers in the finalized response

3.7 WHEN `finalize()` is called THEN the system SHALL CONTINUE TO set CORS headers, `x-exec-ms` header, stringify the body, and log the response as before
