# Response.init() writes `xmlResponses` into the HTML template slot

Found while planning [1-4-1-response-setbody-null-is-ignored-so-a-response](../1-4-1-response-setbody-null-is-ignored-so-a-response/PLAN.md) (finding S1, spun off in Q5). Re-checked by reading the code and running a read-only probe on 2026-11-09 against commit `045decb`. No files were changed and no AWS resource was touched.

## Summary

`Response.init()` merges each `*Responses` option into a private static template slot. The `xmlResponses` branch assigns its result to `Response.#htmlResponses` instead of `Response.#xmlResponses`. Two things follow:

- Custom XML templates are never used. `Response.getGenericResponses("XML")` keeps returning the built-in XML templates.
- The HTML slot is replaced by the XML defaults plus the custom XML templates, so generic HTML responses come back with an XML `Content-Type` and XML bodies. Any `htmlResponses` passed in the same `init()` call are lost, because the XML branch runs after the HTML branch and replaces the whole slot.

## How it happens

`src/lib/tools/Response.class.js:161-165`:

```javascript
if ( options?.xmlResponses ) {
	// merge settings using assign object
	//Response.#xmlResponses = Object.assign({}, Response.#xmlResponses, options.xmlResponses);
	Response.#htmlResponses = { ...Response.#xmlResponses, ...options.xmlResponses };
}
```

The HTML branch above it (`:155-158`) and the RSS and text branches below it assign to their own slots. The commented-out line shows the intended target. `Response.#xmlResponses` is declared at `:67` and read by `getGenericResponses()` at `:515`.

Local reproduction (read-only, run from the repository root):

```bash
node --input-type=module -e 'import { createRequire } from "module"; const require = createRequire(import.meta.url); const out = console.log.bind(console); const { Response } = require("./src/lib/tools/index.js"); Response.init({ xmlResponses: { response200: { statusCode: 200, headers: { "Content-Type": "application/xml" }, body: "<custom>xml</custom>" } } }); out(JSON.stringify({ html200: Response.getGenericResponses("HTML").response(200), xml200: Response.getGenericResponses("XML").response(200) }, null, 1));'
```

Observed on 2026-11-09:

| Slot | `response(200)` body |
|------|----------------------|
| HTML | `<custom>xml</custom>` with `Content-Type: application/xml` (should be the default HTML template) |
| XML | `<?xml version="1.0" encoding="UTF-8" ?><hello>Success</hello>` (the custom template is ignored) |

## Impact

Affects applications that pass `xmlResponses` to `Response.init()` (documented in the `Response.init` JSDoc and in `types/lib/tools/index.d.ts:33` as `xmlResponses?: object`). For them:

- Their XML customization has no effect.
- Every generic HTML response (for example a 404 built through `reset()` with an HTML body) is replaced by XML content.
- `htmlResponses` given in the same call are discarded.

Applications that do not pass `xmlResponses` are not affected. `Response.init()` only takes effect once per process, so nothing recovers the slot afterwards.

## Verified and unverified

- Verified by code reading and the probe above.
- No test passes `xmlResponses` to `Response.init()`. The only hit in `test/` is an empty object in the type test `test/types/consumer-appconfig-extend.ts:80`, which does not run `init()`. No user documentation under `docs/` mentions `xmlResponses`.
- Not verified: whether any downstream application (for example the Atlantis starters) passes `xmlResponses`. Check their `Response.init` calls before release.

## Expected behavior

`xmlResponses` merges into the XML slot, the same way the other formats do. The HTML slot is untouched by the XML option.

## Possible fix

Change line 163 to assign `Response.#xmlResponses = { ...Response.#xmlResponses, ...options.xmlResponses };`. Add a test that runs `Response.init()` in a subprocess (`init()` is once per process, see the isolation guidance in `test-requirements`) with both `htmlResponses` and `xmlResponses` and asserts each slot.

## Open points for planning

- Release type. This is a bug fix (PATCH), but it changes output for applications that pass `xmlResponses`: their XML templates start applying and their HTML templates stop being replaced. State that in the CHANGELOG under Fixed.
- Whether to add a `Response.init` documentation example for `xmlResponses`, since none exists.
- Whether the same review should cover `rssResponses` and `textResponses` branches (they read correct on inspection).
- The `Response.CONTENT_TYPE` constants (`:72-76`) are computed once at class load from the default modules, so custom templates with a different `contentType` do not change them. Out of scope unless the planning pass decides otherwise.

## Related documentation

- `src/lib/tools/Response.class.js:63-77` (template slots) and `:136-175` (`init`)
- `types/lib/tools/index.d.ts:33`
- `docs/01-advanced-implementation-for-web-service/response-management.md`
