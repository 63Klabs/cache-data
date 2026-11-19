# A custom generic template's `Content-Type` header is not used, and a constructor `Content-Type` header must be one of five exact values

Found while planning [1-4-2-response-init-xmlresponses-overwrites-html-templates](../1-4-2-response-init-xmlresponses-overwrites-html-templates/PLAN.md) (finding S1, spun off in Q5). Checked by reading the code and running read-only probes on 2026-11-18 against commit `9a7f3a5`. No files were changed and no AWS resource was touched.

## Summary

`Response.init()` accepts a template per status code for each format, and each template carries a `headers` object with a `Content-Type`. When a `Response` is built from a template (by the constructor or `reset()`), the template's `Content-Type` is replaced by the value of `Response.CONTENT_TYPE` for the format. An application that customizes a template to send, for example, `application/atom+xml` from the RSS slot, or `application/problem+xml` from the XML slot, cannot do it through the template.

A related behavior makes this harder to work around. A `Content-Type` in the `headers` of the constructor or `reset()` object is looked up as a format name. Anything other than the five exact `CONTENT_TYPE` strings for JSON, HTML, XML, RSS and text throws.

## How it happens

`src/lib/tools/Response.class.js`:

- `reset()` (`:208-226`) works out a content type, loads `getGenericResponses(contentType).response(statusCode)`, copies the template's `headers` and `body` into a new object, and calls `this.set(newObj, contentType)`.
- `set()` (`:245-258`) ends with `this.addHeader('Content-Type', contentType)`. Because `reset()` passes a non-null `contentType`, the line runs and overwrites the template's header with the format's `Response.CONTENT_TYPE` value.
- `Response.CONTENT_TYPE` (`:71-77`) is computed once at class load from the default generic modules. A custom template's `contentType` property or header does not change it.
- When no content type argument is given, `reset()` calls `Response.inspectContentType(obj)`, which returns the `Content-Type` header of the object you pass, if it has one (`:344-348`). That string is passed to `getGenericResponses()`, which accepts only the five `CONTENT_TYPE` values and the codes `"JSON"`, `"HTML"`, `"XML"`, `"RSS"` and `"TEXT"`. Any other string throws `Content Type: ... is not implemented for getResponses`.

Local reproduction (read-only, run from the repository root, using the helpers in `test/helpers/`):

| Call | Observed `Content-Type` |
|------|-------------------------|
| `rssResponses.response200` with `Content-Type: application/atom+xml`, then `new Response(req, { statusCode: 200 }, Response.CONTENT_TYPE.RSS)` | `application/rss+xml` (the template header is replaced) |
| The same response, then `addHeader("Content-Type", "application/atom+xml")` | `application/atom+xml`, kept by `finalize()` |
| The same response, then `setHeaders({ "Content-Type": "application/atom+xml" })` | `application/atom+xml` |
| `new Response(req, { statusCode: 200, headers: { "Content-Type": "text/html" } })` | Throws: `Content Type: text/html is not implemented for getResponses` |
| `new Response(req, { statusCode: 200, headers: { "Content-Type": Response.CONTENT_TYPE.HTML } })` | `text/html; charset=utf-8` |
| `new Response(req, { statusCode: 200, headers: { "Content-Type": "application/javascript" } })` | Throws, although `Response.CONTENT_TYPE.JAVASCRIPT` is that string |
| `reset({ statusCode: 200, headers: { "Content-Type": "text/html" } })` | Throws |
| `setHeaders({ "Content-Type": "text/html" })` on an existing response | `text/html` (works, because `set()` does not look up a generic template) |

## Impact

- An application cannot make a template send a different `Content-Type` for its format, such as Atom from the RSS slot, or `application/problem+json` from the JSON slot. It has to call `addHeader()` or `setHeaders()` after building the response.
- A handler that passes `headers: { "Content-Type": "text/html" }` to the constructor or `reset()` gets an exception, not a response. `text/html` is the value the repository's own docs use in templates (`docs/01-advanced-implementation-for-web-service/configuration-options.md`, the `htmlResponses` example).
- `Response.CONTENT_TYPE.JAVASCRIPT`, `CSS` and `CSV` are public constants that the constructor cannot use as a header because no generic template exists for them.

Applications that build responses from a body and set headers afterwards are not affected. The default templates carry the same values as the constants, so applications that do not customize `Content-Type` see no difference.

## Verified and unverified

- Verified by code reading and the probes above.
- Not verified: how many applications set a template `Content-Type` and rely on the current result (for example, they set `application/json` in a template and get `application/json` back because it matches).
- Not verified: whether any code outside `Response.class.js` reads `Response.CONTENT_TYPE` as the source of truth for what a response sends. `Response.getContentType()` and `getContentTypeCode()` compare the header with the constants.

## Expected behavior

To be decided in planning. The candidates are:

1. A `Content-Type` in a template's `headers` is kept when a `Response` is built from it, and the format's `CONTENT_TYPE` value is used only when the template has none.
2. Leave the behavior and document it.

The constructor and `reset()` should not throw for a `Content-Type` header value that is not one of the five. Which behavior replaces the throw (use the default format, use the header as given, or keep throwing with a clearer message) is also open.

## Possible fix

In `reset()`, pass a null content type to `set()` when the template or the supplied `headers` already carry a `Content-Type`, so that `set()` does not overwrite it. In `reset()`, resolve the generic template from the header only when it is one of the known values, and otherwise use the configured default format. Add tests that run `Response.init()` once per test file (the pattern in `test/response/response-generic-templates-custom-unit-tests.jest.mjs`).

## Open points for planning

- Release type. Keeping a template's header changes the headers sent by any application whose template header differs from the `CONTENT_TYPE` value. That is a changed default for those applications, so PATCH, MINOR or a documented exception is a decision.
- What `getContentTypeCode()`, `inspectContentType()` and `finalize()` should do for a header that is not one of the five.
- Whether `Response.CONTENT_TYPE` should reflect a custom template's `contentType`. It is computed at class load and `init()` runs later.
- Whether `JAVASCRIPT`, `CSS` and `CSV` should get generic templates or be rejected with a clear message.
- The HTML constant is `text/html; charset=utf-8` while the repository docs use `text/html` in templates. Whether `text/html` should be accepted as HTML.
- Interaction with [1-4-2-response-set-status-code-resets-content-type-to-json](../1-4-2-response-set-status-code-resets-content-type-to-json/ISSUE.md), which also changes how `set()` picks a content type.

## Related documentation

- `src/lib/tools/Response.class.js:71-77` (`CONTENT_TYPE`), `:208-226` (`reset`), `:245-258` (`set`), `:344-348` (`inspectContentType`), and `getGenericResponses` (`:555-569`)
- `docs/01-advanced-implementation-for-web-service/response-management.md` ("Custom Response Templates" and "Content Types")
- `docs/01-advanced-implementation-for-web-service/configuration-options.md`
