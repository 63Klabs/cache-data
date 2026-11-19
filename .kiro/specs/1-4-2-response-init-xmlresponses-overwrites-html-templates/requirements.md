# Requirements Document

## Introduction

`Response.init()` merges each `*Responses` option into a private static template slot. The `xmlResponses` branch assigns its result to `Response.#htmlResponses` instead of `Response.#xmlResponses` (`src/lib/tools/Response.class.js`, `init`). An application that passes `xmlResponses` loses its XML customization, and its HTML slot becomes the built-in XML templates plus its XML overrides. Any `htmlResponses` passed in the same call are discarded, because the XML branch runs after the HTML branch. Applications that do not pass `xmlResponses` are not affected. The defect has been present since commit `1beabd6` (2024-11-18) and is in every published version from 1.2.2 through 1.4.1 (PLAN.md C1 to C6, Section 3).

This feature (1) makes the `xmlResponses` branch write to the XML slot, with the same merge as the other four formats, (2) adds tests that exercise all five template slots, (3) adds an `xmlResponses` example to the user documentation, and (4) records the fix in `CHANGELOG.md`. It does not change any exported name, signature, type declaration or default.

The change ships in v1.4.2, which is unreleased, as a PATCH (Decision 1). Decisions are recorded in [PLAN.md](PLAN.md); references such as (Decision 2) or (C5) point there. All decisions are locked. The `Content-Type` behavior of template-built responses is a separate spin-off, [1-4-2-response-generic-template-content-type-header-is-ignored](../1-4-2-response-generic-template-content-type-header-is-ignored/ISSUE.md), and is out of scope here (Decision 5).

## Glossary

- **Template slot**: one of the five private static fields of `Response` that hold generic response templates: `#jsonResponses`, `#htmlResponses`, `#rssResponses`, `#xmlResponses` and `#textResponses`. `Response.getGenericResponses(format)` reads them.
- **Built-in templates**: the module objects exported by `generic.response.json.js`, `generic.response.html.js`, `generic.response.rss.js`, `generic.response.xml.js` and `generic.response.text.js`. Each slot holds its module object until `init()` replaces it.
- **Merge**: `{ ...Response.#<format>Responses, ...options.<format>Responses }`. Keys the application supplies (such as `response200`) replace the built-in keys of the same name. Keys it does not supply stay. The built-in module object is not modified.
- **Format option**: one of the properties `jsonResponses`, `htmlResponses`, `xmlResponses`, `rssResponses` and `textResponses` of the `Response.init()` options.
- **Class fallback**: the rule in `response(n)` that a status code with no template uses the template of its class (`response200` for 2xx, `response400` for 4xx, and so on). It reads the templates of the merged object, so a custom `response200` serves unlisted 2xx statuses (verified for the RSS slot on 2026-11-18).
- **Once-per-process rule**: `Response.init()` takes effect on the first call only (`Response.class.js`, `if (!Response.#isInitialized)`). Each Jest test file has its own module registry, so a test file calls `init()` once at module level.
- **Affected application**: an application that passes `xmlResponses` to `Response.init()`, directly or through `AppConfig.init({ responses })`.

## Requirements

### Requirement 1: `xmlResponses` merges into the XML slot (C1, C3)

**User Story:** As a developer who customizes XML responses, I want my `xmlResponses` templates to apply to XML responses, so that `Response.getGenericResponses("XML")` and a `Response` built for XML use my templates.

#### Acceptance Criteria

1. WHEN `Response.init()` is called with `xmlResponses`, THE `Response` class SHALL assign `{ ...Response.#xmlResponses, ...options.xmlResponses }` to `Response.#xmlResponses` and to no other slot.
   1.1. SEC-REQ-1.1-SEM-532-1 [SECURITY: no-template-content-in-logs] THE Response SHALL NOT write the contents of `options.xmlResponses` to any log when merging that option.
   1.2. SEC-REQ-1.1-SEM-1321-1 [SECURITY: prototype-integrity] THE Response SHALL NOT modify `Object.prototype` or the prototype of any template slot when merging `options.xmlResponses`.
2. AFTER that call, `Response.getGenericResponses("XML")` and `Response.getGenericResponses(Response.CONTENT_TYPE.XML)` SHALL return the merged object. Its `response(n)` SHALL return the application's template for every status code the application supplied, and the built-in template for every status code it did not supply.
3. AFTER that call, a custom `response200` in `xmlResponses` SHALL serve unlisted 2xx statuses through the class fallback, as it does for the other four formats.
4. AFTER that call, `new Response(clientRequest, { statusCode: 200 }, Response.CONTENT_TYPE.XML)` SHALL carry the body of the application's `response200` template, and a `Response` created for a status code the application did not supply SHALL carry the built-in XML body for that status code.
5. THE built-in module object `xmlGenericResponse` SHALL NOT be modified by the merge.
6. WHEN `Response.init()` is called without `xmlResponses`, or with a falsy `xmlResponses`, THE XML slot SHALL remain the built-in `xmlGenericResponse`.

### Requirement 2: The other four slots are independent of `xmlResponses` (C4, C5, C6)

**User Story:** As a developer who customizes several formats in one `init()` call, I want each option to affect only its own format, so that a custom XML template never replaces my HTML templates.

#### Acceptance Criteria

1. WHEN `Response.init()` is called with `xmlResponses` and without `htmlResponses`, THE HTML slot SHALL remain the built-in `htmlGenericResponse`, and `Response.getGenericResponses("HTML").response(n).headers["Content-Type"]` SHALL NOT be the XML content type for any integer `n` from 100 to 599.
2. WHEN `Response.init()` is called with both `htmlResponses` and `xmlResponses`, THE HTML slot SHALL be the merge of `htmlResponses` over the built-in HTML templates, and the XML slot SHALL be the merge of `xmlResponses` over the built-in XML templates. Neither option SHALL change the other's slot.
3. WHEN `Response.init()` is called with `jsonResponses`, `htmlResponses`, `xmlResponses`, `rssResponses` and `textResponses` together, each slot SHALL return its own custom template, and no slot SHALL return a template from another format.
4. THE `settings` option SHALL continue to be merged into the `Response` settings only, and SHALL NOT change any template slot.

### Requirement 3: Everything else is unchanged (C2, C9)

**User Story:** As an existing user, I want every other call on `Response` to behave as before, so that upgrading to v1.4.2 changes only the output of applications that pass `xmlResponses`.

#### Acceptance Criteria

1. THE only change to `src/lib/tools/Response.class.js` SHALL be the assignment in the `xmlResponses` branch of `init()`. The `jsonResponses`, `htmlResponses`, `rssResponses`, `textResponses` and `settings` branches, `reset()`, `set()`, `getGenericResponses()` and `finalize()` SHALL NOT change.
2. THE `Response.init()` signature, its once-per-process behavior and its return value (`undefined`) SHALL NOT change. A second call SHALL continue to be ignored without an error.
3. THE values of `Response.CONTENT_TYPE` SHALL NOT change. A template's own `Content-Type` header SHALL continue to behave as it does today (see the spin-off issue named in the Introduction).
4. THE generic response modules (`generic.response*.js`), `types/lib/tools/index.d.ts` and `src/lib/tools/index.js` SHALL NOT change. THE JSDoc of `Response.init` SHALL NOT change, because it already lists `xmlResponses` (PLAN.md Section 4.2).
5. NO existing test file SHALL be modified. `test/response/response-generic-templates-custom-unit-tests.jest.mjs` and the other existing `Response` tests SHALL continue to pass unchanged.

### Requirement 4: Tests (I1, I3, Decision 1)

**User Story:** As a maintainer, I want tests that fail if any template option writes to the wrong slot, so that this defect, or one like it in another branch, cannot return.

#### Acceptance Criteria

1. A new file `test/response/response-init-all-slots-unit-tests.jest.mjs` (file A) SHALL call `Response.init()` once at module level with all five format options. Each option SHALL carry a distinct custom `response200` body, and `htmlResponses` SHALL also carry a custom `response404`. THE file SHALL assert Requirement 1 (criteria 2 to 4) and Requirement 2 (criteria 2 and 3), including that the custom HTML 404 survives the `xmlResponses` option.
2. A new file `test/response/response-init-xml-only-unit-tests.jest.mjs` (file B) SHALL call `Response.init()` once at module level with only `xmlResponses`. THE file SHALL assert that the XML slot returns the custom template, that the HTML, JSON, RSS and text slots return the built-in templates, and Requirement 1 criterion 5 (the built-in `xmlGenericResponse` is not modified). Requirement 1 criterion 6 is covered by the existing `Response` tests that call `init()` without `xmlResponses`, and is not repeated.
   2.1. SEC-REQ-4.2-SEM-1321-1 [SECURITY: prototype-integrity] THE `response-init-xml-only-unit-tests.jest.mjs` file SHALL assert that merging an `xmlResponses` object with an own `__proto__` key leaves `Object.prototype` and the prototype of the XML slot unchanged.
3. File A SHALL include a fast-check property over `fc.integer({ min: 100, max: 599 })`, with no filter on the generator, asserting that the HTML slot's `response(n).headers["Content-Type"]` is not the XML content type. THE property SHALL use `numRuns` of at least 100 and SHALL NOT pass a `seed` option.
4. Each test file SHALL contain a header comment in the format used by `response-generic-templates-custom-unit-tests.jest.mjs` (purpose, setup, teardown, related tests), and SHALL state that `Response.init()` is called once per file.
5. THE test files SHALL NOT start a child process, SHALL NOT call `npm test`, SHALL NOT call AWS, and SHALL call `jest.restoreAllMocks()` in `afterEach` if they use a spy. Test files, names and describe blocks SHALL follow `*-unit-tests.jest.mjs`.
6. BEFORE the code change, file A and file B SHALL fail for the reason given in PLAN.md (the XML slot is the built-in and the HTML slot is the XML templates). AFTER it, both SHALL pass.

### Requirement 5: Documentation (I2, Decision 2, Decision 5)

**User Story:** As a developer, I want a documented example of `xmlResponses`, so that I can customize XML responses without reading the source.

#### Acceptance Criteria

1. `docs/01-advanced-implementation-for-web-service/response-management.md`, in the "Custom Response Templates" section, SHALL show `xmlResponses` next to the existing `jsonResponses` example, with a `response404` template that has `statusCode`, `headers` and a `body` string.
2. `docs/01-advanced-implementation-for-web-service/configuration-options.md`, in the `Response.init` example, SHALL show `xmlResponses` next to the existing `htmlResponses` example.
3. THE documentation SHALL state that a `Response` built from a template carries the `Response.CONTENT_TYPE` value for the format, and that `addHeader("Content-Type", ...)` or `setHeaders({ "Content-Type": ... })` after construction sets another type such as `application/atom+xml`. IT SHALL NOT claim that the template's `Content-Type` header is applied.
4. THE examples SHALL use the documentation conventions in `documentation-standards-markdown.md` (language-tagged blocks, `const { tools } = require('@63klabs/cache-data')`, realistic values) and SHALL run as written.
   4.1. SEC-REQ-5.4-SEM-79-1 [SECURITY: static-template-bodies] THE examples SHALL define every template `body` as a static string.
   4.2. SEC-REQ-5.4-SEM-79-2 [SECURITY: static-template-bodies] THE examples SHALL NOT interpolate request-derived values into a template `body`.
   4.3. SEC-REQ-5.4-SEM-798-1 [SECURITY: no-sensitive-values-in-examples] THE examples SHALL NOT contain credentials, account identifiers or real host names.
5. THE documentation SHALL NOT mention `TestHarness` or any private field.
6. THE documentation tests under `test/documentation/` and `node scripts/audit-documentation.mjs` SHALL pass.

### Requirement 6: CHANGELOG (Decisions 1 and 4)

**User Story:** As a developer who upgrades, I want to know that `xmlResponses` now applies and that my HTML templates are no longer replaced, so that I can review any code that relied on the old output.

#### Acceptance Criteria

1. THE final task of `tasks.md` SHALL repeat the version lookup in `.kiro/steering/changelog-convention-package.md` (`package.json` is 1.4.2; `CHANGELOG.md` has `## v1.4.2 (unreleased)`).
2. `CHANGELOG.md` SHALL gain one entry under `### Fixed` in `## v1.4.2 (unreleased)`, in the format `- **Title** - Description. [Spec: ...](...)`, with no heading or dated section changed.
3. THE entry title SHALL name `Response.init()` and `xmlResponses`. THE description SHALL say that custom XML templates now apply, that the HTML slot is no longer replaced by the XML templates, and that `htmlResponses` passed in the same call are no longer lost. IT SHALL state "Affects v1.2.2 through v1.4.1" and SHALL tell applications that pass `xmlResponses` to review any code that expected the old HTML or XML output.
4. THE entry SHALL link `[Spec: 1-4-2-response-init-xmlresponses-overwrites-html-templates](.kiro/specs/1-4-2-response-init-xmlresponses-overwrites-html-templates/)` and SHALL NOT contain an `addresses [#N]` reference, because no GitHub issue exists (Decision 4).
5. THE entry SHALL NOT describe the `Content-Type` behavior as fixed. IT MAY link the spin-off spec as the place where it is tracked.

### Requirement 7: Validation

**User Story:** As a maintainer, I want the full suite to pass before this change is committed, so that the npm publish pipeline is not blocked.

#### Acceptance Criteria

1. `npm test` SHALL pass with exit code 0 after the change.
2. `npm run test:types` SHALL pass. No type declaration changes (Requirement 3.4).
3. THE new test files SHALL pass when run alone with `node --experimental-vm-modules ./node_modules/jest/bin/jest.js <file>`.
4. NO test process SHALL remain running after a run (`ps aux | grep jest`).
5. `git status` SHALL show changes only in `src/lib/tools/Response.class.js`, the two new test files, the two docs files, `CHANGELOG.md`, and this spec directory and the spin-off spec directory.
   5.1. SEC-REQ-7.5-SEM-1104-1 [SECURITY: no-dependency-change] THE implementation SHALL NOT add, remove or update any entry in `package.json` or `package-lock.json`.

<!-- spec-it-safe:reviewed v1
Requirements already hardened by Specification Hardening Engine, as hashes of their text.
A re-run hardens only requirements whose hash is missing here.
fff84fdae6ed 2a6a79ada02a bb8a6fab648f 57b979207751 549109535525 3fdeea58a67f 6a78fdcc7ad7 3a40b5fbeab9
d28b71d36ab2 49407f8b4f2e 0e1e990c0795 b2d153b3d85c 0a92a970a6dd bfcae9108c8b 9d6f7be744ee 0399a17aeb48
-->
