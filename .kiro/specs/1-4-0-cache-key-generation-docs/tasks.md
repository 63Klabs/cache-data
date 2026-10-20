# Implementation Plan: Cache Key Generation Documentation Correction

- **Spec**: `1-4-0-cache-key-generation-docs`
- **Basis**: `requirements.md` (Requirements 1-11), `design.md`
- **Governing safety property**: no task may change the `id_hash` for a caller passing a fresh
  `connection` object per request. Verify this with the Property 3 test before considering X2 done.

Tasks are ordered so that read-first and code changes land before the docs that describe them, and
the full suite gate runs last. Each task lists the requirements it satisfies.

## 1. Establish baseline and read existing coverage

- [x] 1.1 Read existing salt-resolution and shared-id tests before writing anything new, to avoid
  duplication: `test/cache/cache-shared-id-property-tests.jest.mjs` and
  `test/cache/cache-shared-id-validation-tests.jest.mjs`. Note the init/subprocess-isolation
  patterns they use.
  - _Requirements: 10.4_
- [x] 1.2 Run the full suite once to confirm a green baseline before changes: `npm test`. Record any
  pre-existing failures per the test-requirements steering so they are not attributed to this work.
  - _Requirements: 10.6_

## 2. Code change X2 — stop `getData` mutating the caller's `connection`

- [x] 2.1 In `src/lib/dao-cache.js`, `CacheableDataAccess.getData`, introduce an internal deep copy
  of `connection` via `tools.safeClone` and move all header preparation (the `headers` default, the
  invalid-value sanitation loop, and the `if-none-match` / `if-modified-since` assignments) onto the
  copy. Pass the copy to `apiCallFunction`. Leave the hash computation (L3266-3268) untouched so it
  still hashes the original object. Add the `// >!` security/rationale comment from the design.
  - _Requirements: 7.1, 7.3, 7.6, 7.7_
- [x] 2.2 Confirm the conditional-request markers are still excluded from the hash input (they are
  added only to the copy, after the hash is computed) and that revalidation requests to the origin
  are unchanged from `apiCallFunction`'s perspective.
  - _Requirements: 7.4, 7.6_

## 3. Code change X3 — expose salt provenance in `Cache.info()`

- [x] 3.1 In `src/lib/dao-cache.js`, `Cache.info()`, add an additive `saltSource` field resolving to
  `"sharedCacheId"`, `"AWS_LAMBDA_FUNCTION_NAME"`, or `"none"`, mirroring the two-tier salt logic in
  `generateIdHash`. Do not rename or remove any existing field.
  - _Requirements: 8.1, 8.2, 8.3_
- [x] 3.2 Update the `Cache.info()` JSDoc `@returns` block to document the new `saltSource` field.
  - _Requirements: 8.4_

## 4. Tests for X2 and X3

- [x] 4.1 Add X2 unit tests (drive the refresh branch with the getter-mock pattern for
  `tools.AWS.dynamo` per the test-harness steering):
  - caller `connection` is structurally unchanged after a refresh;
  - a `connection` passed with no `headers` still has no `headers` after the call;
  - two calls with a reused reference yield equal `id_hash`;
  - `apiCallFunction` receives the markers on its argument while the caller's object does not.
  - _Requirements: 7.1, 7.2, 7.3, 7.6, 10.2_
- [x] 4.2 Add the X2 property test over generated `connection` shapes asserting Property 1 (no
  mutation) and Property 3 (post-fix `id_hash` equals the pre-fix hash of the same input). Follow the
  property-test rules: global `FC_SEED` hook, no `seed` at the `fc.assert` call site, generator
  preconditions matched to the asserted rule.
  - _Requirements: 7.5, 10.3, 10.5_
- [x] 4.3 Add the X3 test asserting `Cache.info().saltSource` returns the correct label for each
  tier, using subprocess isolation for the `sharedCacheId`-set vs unset cases (Cache.init is
  once-only global state).
  - _Requirements: 8.1, 10.2_

## 5. Documentation validation test

- [x] 5.1 Extend `test/documentation/` with a check that computes the hash for two inputs differing
  only in one `cachePolicy` behavioral field (e.g. `defaultExpirationExtensionOnErrorInSeconds`) and
  asserts the hashes differ, keeping the README's stated inputs honest against the implementation.
  - _Requirements: 10.1_

## 6. Technical documentation (new file)

- [x] 6.1 Create `docs/technical/cache-key-hashing.md` documenting the `DataHasher` mechanism: the
  `JSON.stringify` replacer mapping `undefined` to the literal string `"undefined"` and `bigint` to
  its decimal string, the `dataType`-tagged leaf serialization (value-type sensitivity), sorted-key
  and order-significant-array behavior, and the `undefined`-collides-with-literal-`"undefined"`
  corollary. Keep user-facing guidance out; this is the mechanism reference the README links to.
  - _Requirements: 2.7_

## 7. README corrections — `docs/features/cache/README.md`

- [x] 7.1 D1/D2: replace the "Cache Key Generation" section (L576-581) with the design's exact prose
  — three inputs, the `connection.options` exclusion and rationale, the full behavioral `cachePolicy`
  field list, the two-tier salt (fed by `CACHE_SHARED_ID` via `Cache.init()`), the shared-cache
  consequence, and the value-type / `undefined`-key warnings with a link to the technical doc.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.4, 2.5, 2.6, 2.7_
- [x] 7.2 D3: in the "Shared Cache" section, add the "Shared cache pitfalls" callout and revise the
  two-Lambda example so each function defines its own profile and obtains its connection per request
  via `connection.toObject()`. Remove any module-scope reused-`conn` shape. Keep examples executable
  and language-tagged.
  - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.4_
- [x] 7.3 D4: add the drift troubleshooting walkthrough (symptom, confirm via the `CACHE`-tagged
  `id_hash` log line, diagnose via the input-diff checklist including `saltSource`, cachePolicy
  fields/types, and the reused-reference hazard).
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
- [x] 7.4 D6: remove the duplicate `idHashAlgorithm` row from the `Cache.init()` options table,
  keeping the row with the `RSA-SHA256` default and the `CACHE_DATA_ID_HASH_ALGORITHM` override.
  - _Requirements: 6.1, 6.2_

## 8. Env-var consistency sweep (D5)

- [x] 8.1 Update `docs/00-example-implementation/README.md` so the
  `CACHE_DATA_USE_TOOLS_HASH_METHOD` reference matches the shipped 1.4.0 "deprecated, silently
  ignored" note. No code change.
  - _Requirements: 5.1, 5.3, 5.4_
- [x] 8.2 Update `docs/00-example-implementation/example-template-lambda-function.yml` to remove or
  reconcile the removed env-var entry consistently with 8.1. No code change.
  - _Requirements: 5.2, 5.3, 5.4_

## 9. JSDoc alignment (D7)

- [x] 9.1 In `src/lib/dao-cache.js`, fix the `Cache.generateIdHash` JSDoc example from
  `{ query, connection, cachePolicy }` to `{ data, connection, cachePolicy }`, and make the
  `generateIdHash` / `getIdHash` JSDoc describe hash inputs and the two-tier salt consistently with
  the corrected README. Parameter names must match signatures exactly.
  - _Requirements: 9.1, 9.2, 9.3_
- [x] 9.2 In `src/lib/tools/Connections.classes.js`, correct the `Connection` / `Connections` JSDoc
  `@example` blocks that call the nonexistent `.get()` plain-object accessor so they call
  `toObject()`. JSDoc-only; do not alter runtime code, and do not touch the real
  `Connections.get(name)` method (which returns a `Connection` instance).
  - _Requirements: 9.3_

## 10. Changelog

- [x] 10.1 Add the `1.4.0` `CHANGELOG.md` entry per the design: documentation corrections; the X2
  hardening/fix note (no more caller mutation, end of reused-reference drift, removed side effect,
  no key change for fresh connections); and the additive `Cache.info().saltSource`. Frame X2 as
  hardening for the documented path and a latent-bug fix for reused-reference callers.
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

## 11. Final verification

- [x] 11.1 Run `npm test` and confirm the entire suite passes, including the new X2/X3,
  documentation-validation, and property tests. Clean up any temporary files.
  - _Requirements: 10.6_
