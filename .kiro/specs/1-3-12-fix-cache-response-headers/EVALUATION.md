# Evaluation: Response.finalize() Cache-Control and Expires Header Overwriting

## Analysis

### Issue Summary

`Response.finalize()` unconditionally overwrites any `Cache-Control` and `Expires` headers previously set by the application via `addHeader()`. The `addHeader()` method is a simple key assignment (`this._headers[key] = value`), and `finalize()` calls it without checking whether those headers already exist.

### Code Under Investigation

In `Response.class.js`, the `finalize()` method contains:

```javascript
if (this._statusCode >= 400) {
    this.addHeader("Expires", (new Date(Date.now() + ( Response.#settings.errorExpirationInSeconds * 1000))).toUTCString());
    this.addHeader("Cache-Control", "max-age="+Response.#settings.errorExpirationInSeconds);
} else if (Response.#settings.routeExpirationInSeconds > 0 ) {
    this.addHeader("Expires", (new Date(Date.now() + ( Response.#settings.routeExpirationInSeconds * 1000))).toUTCString());
    this.addHeader("Cache-Control", "max-age="+Response.#settings.routeExpirationInSeconds);
}
```

And `addHeader()` is:

```javascript
addHeader = (key, value) => {
    this._headers[key] = value;
}
```

### Is This Documented as Expected Behavior?

**No.** After a thorough search of the entire codebase, no documentation, code comment, or test explicitly states that `finalize()` is intended to overwrite application-set `Cache-Control` or `Expires` headers.

Specifically:

1. **JSDoc on `finalize()`**: Describes the method's responsibilities (stringify body, set CORS headers, set cache control headers, add execution time, log response) but does not mention overwriting user-set headers.

2. **JSDoc on `addHeader()`**: Documented as "Adds or updates a header" with no caveat about `finalize()` overwriting values.

3. **User documentation** (`docs/01-advanced-implementation-for-web-service/response-management.md`): Actually shows `response.addHeader('Cache-Control', 'max-age=3600')` as a usage example in the "Basic Response Operations" section, implying the user can control this header. The documentation does not warn that `finalize()` will silently replace it.

4. **Configuration documentation** (`docs/01-advanced-implementation-for-web-service/configuration-options.md`): Documents `routeExpirationInSeconds` and `errorExpirationInSeconds` as cache expiration settings but does not state they unconditionally override application-set headers.

5. **Inline code comments**: No comments in the `finalize()` method explain or justify the unconditional overwrite.

6. **Tests**: No tests verify that overwriting is the intended behavior. Existing test specs describe verifying that `finalize()` "calculates correct Cache-Control and Expires headers" but do not test the overwrite-vs-preserve scenario.

7. **CHANGELOG.md**: No entry documents this as a deliberate design decision.

## Verdict

**This is a bug, not intended behavior.** The unconditional overwrite is an implementation oversight. The user documentation even implies that `addHeader('Cache-Control', ...)` should work, making this a contradiction between documented API usage and actual runtime behavior.

## Impact Assessment

- **Severity**: Medium — prevents legitimate per-response cache control, but has a partial workaround (setting `routeExpirationInSeconds: 0` globally).
- **Backwards compatibility**: The fix preserves existing default behavior. Applications that do not call `addHeader("Cache-Control", ...)` or `addHeader("Expires", ...)` before `finalize()` will see no change. Only applications that explicitly set these headers will see the new (correct) behavior.
- **Version impact**: This is a PATCH-level fix (bug fix, no API change, no breaking change).

## Recommendations

1. **Guard the header writes** in `finalize()` so they only apply when the application has not already set `Cache-Control` or `Expires`. The suggested approach from the issue is sound:

   ```javascript
   if (!('Cache-Control' in this._headers)) {
       this.addHeader("Cache-Control", "max-age=" + expirationValue);
   }
   if (!('Expires' in this._headers)) {
       this.addHeader("Expires", expirationDate);
   }
   ```

2. **Add tests** covering:
   - Default behavior (headers applied when not pre-set) — confirms no regression
   - Override behavior (application-set headers preserved when pre-set)
   - Both error (status >= 400) and success paths
   - Edge case: `routeExpirationInSeconds` is 0 (no default headers applied)

3. **Update JSDoc** on `finalize()` to document the header precedence: application-set headers take priority over config defaults.

4. **Update user documentation** to describe how to override cache headers per-response.

5. **Proceed with spec-driven bugfix process** to formalize the fix, define correctness properties, and implement with property-based tests.
