# Issue #223: Response.finalize() unconditionally overwrites Cache-Control and Expires headers

> Source: https://github.com/63Klabs/cache-data/issues/223

## Package

@63klabs/cache-data v1.3.11

## Summary

`Response.finalize()` unconditionally overwrites any `Cache-Control` header previously set via `addHeader()`. This prevents applications from setting dynamic, per-route `Cache-Control` values because `finalize()` always replaces them with the static `routeExpirationInSeconds` config value.

The same block also adds an `Expires` header that the application has no way to control or suppress.

## Steps to reproduce

1. Configure responses with `routeExpirationInSeconds: 3600`
2. Before calling `finalize()`, set a dynamic `Cache-Control` header on the Response:
   ```javascript
   RESP.addHeader("Cache-Control", "max-age=5");
   ```
3. Call `RESP.finalize()`
4. Inspect the returned headers

## Expected behavior

The response should contain `Cache-Control: max-age=5` (the value the application explicitly set).

## Actual behavior

The response contains `Cache-Control: max-age=3600` and `Expires: <now + 3600s>`. The application's header is silently overwritten.

## Root cause

In `Response.class.js` (line ~670 in `finalize()`), the cache headers are applied unconditionally using `addHeader()`, which is a simple key assignment (`this._headers[key] = value`):

```javascript
if (this._statusCode >= 400) {
    this.addHeader("Expires", (new Date(Date.now() + ( Response.#settings.errorExpirationInSeconds * 1000))).toUTCString());
    this.addHeader("Cache-Control", "max-age="+Response.#settings.errorExpirationInSeconds);
} else if (Response.#settings.routeExpirationInSeconds > 0 ) {
    this.addHeader("Expires", (new Date(Date.now() + ( Response.#settings.routeExpirationInSeconds * 1000))).toUTCString());
    this.addHeader("Cache-Control", "max-age="+Response.#settings.routeExpirationInSeconds);
}
```

There is no check for whether `Cache-Control` or `Expires` have already been set by the application. Since `addHeader` is a plain property assignment, the config-level values always win.

## Suggested fix

Guard the `Cache-Control` and `Expires` writes so they only apply when the application has not already set them:

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

This preserves the current default behavior (config values apply when no header is set) while allowing applications to override cache headers on a per-response basis.

## Use case

A proxy endpoint needs dynamic `Cache-Control` values based on response content. When a sequence is actively playing, the response should cache for 5 seconds. When idle, it should cache until the next 5-minute interval boundary (1 to 300 seconds). The static `routeExpirationInSeconds: 3600` default is appropriate for other routes but not for this endpoint.

## Workaround

Currently there is no clean workaround within the `@63klabs/cache-data` API. Setting `routeExpirationInSeconds: 0` disables the default for all routes, not just the one that needs dynamic values.
