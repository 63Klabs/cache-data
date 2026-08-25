# Implementation Plan: Fully Implement SSM Parameter Store and Secrets Manager SDK

**Version**: 1.3.16 (from `package.json`)
**Inputs**: [SPEC.md](SPEC.md) (feature intent), [FINDINGS.md](FINDINGS.md) (security evaluation)
**Status**: Draft for review. Questions at the end must be answered before `requirements.md` is generated.

---

## 1. Purpose

Two goals are merged here:

1. **Feature (from SPEC.md)**: let engineers retrieve SSM parameters and Secrets Manager secrets without the `AWS-Parameters-and-Secrets-Lambda-Extension` layer, by falling back to the AWS SDK. Add Secrets Manager to the config-driven path/names loading. Unify the two currently unrelated retrieval paths behind one `init()`-style API.
2. **Hardening (from FINDINGS.md)**: fix three live defects in `AppConfig._getParametersFromStore` before that code shape gets copied into the new Secrets Manager path, where it would handle strictly more sensitive data.

The hardening is not a side quest. The new code reuses the same `{ group, path, names }` grouping and the same dynamic-key assignment pattern, so fixing it first is what keeps the feature from shipping the bug twice.

---

## 2. Current state

Two fully independent retrieval paths exist today with no shared plumbing. `CachedParametersSecrets.classes.js` does not import `AWS.classes.js` at all.

| | Path A — Lambda extension | Path B — AWS SDK |
|---|---|---|
| Entry point | `new CachedSsmParameter(name)` / `new CachedSecret(id)` | `AppConfig.init({ ssmParameters })` |
| Transport | `http.request` to `localhost:2773` | `@aws-sdk/client-ssm` via `AWS.ssm` |
| Auth | `X-Aws-Parameters-Secrets-Token: process.env.AWS_SESSION_TOKEN` | Lambda execution role |
| Granularity | One name per instance | Batched by `names[]` or discovered by `path` |
| Secrets Manager | Supported (`CachedSecret`) | **Not supported** |
| Caching | Per-instance, `refreshAfter` default 300s, 3x retry | None; one-shot at init |
| Result shape | `{Parameter:{Value}}` or `{SecretString}` | `{ group: { name: value } }` |
| Failure mode | Never throws; resolves `null`, `cache.status = -1` | **Rejects**, taking down `AppConfig.promise()` |

Key facts that constrain the design:

- **No extension-availability detection exists anywhere.** `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT` appears nowhere in the codebase; the port is the hardcoded `static port = "2773"`. `AWS_SESSION_TOKEN` is read but never checked for presence.
- **`_requestSecretsFromLambdaExtension` collapses every failure to `null`.** ECONNREFUSED (layer absent), JSON parse failure, and HTTP 4xx/5xx with a JSON body are indistinguishable. HTTP status is never inspected. A fallback decision cannot currently be made from the return value.
- **`AWS.#SDK` is an eager IIFE**, evaluated at class-definition time, which happens on `require('@63klabs/cache-data')`. All three clients are constructed at module load. Adding a fourth eagerly-required package is a compatibility risk (see WS-2).
- **`AppConfig._ssmParameters` has no public accessor.** It holds the unresolved promise. Only tests read it.
- **`CachedParameterSecrets` has no `init()` and no reset/clear.** The registry is process-global and every constructor self-registers with no dedupe.
- **`sync_getValue()` sniffs the wrapper shape**: `("Parameter" in this.value) ? value.Parameter.Value : value.SecretString`. Property tests in `test/config/cached-param-tostring-preservation-property-tests.jest.mjs` hard-code both shapes.

### Latent bugs found while mapping this (not in FINDINGS.md)

- **`GetParameters` caps at 10 names.** `_getParametersFromStore` pushes every name from every group into a single `Names` array with no chunking. An 11th name produces a `ValidationException` that rejects `AppConfig.promise()`. Confirmed against the [GetParameters API reference](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParameters.html) ("Maximum number of 10 items").
- **`GetParametersByPath` silently truncates at 10.** Per the [API reference](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParametersByPath.html), `MaxResults` has a valid range of 1-10 and the response returns a `NextToken`. Because the ceiling is 10 *regardless of what you ask for*, no single call can ever return more than 10 parameters. The current code ignores `NextToken` entirely, so an application with more than 10 parameters under a path receives only the first 10, with no error and no warning. This is unconditional silent data loss for any such application, and I rate it the highest-severity defect in the file.

Both need to be fixed as part of this work since the new API surfaces path-based loading more prominently.

---

## 3. Goals and non-goals

### Goals

- G1. Retrieve SSM parameters and Secrets Manager secrets with no Lambda layer dependency.
- G2. Auto-detect layer availability and fall back to the SDK, with the layer preferred when present.
- G3. Preserve both existing implementations with zero behavior change for current consumers.
- G4. Add Secrets Manager to the config-driven path/names loading.
- G5. Add `CachedParameterSecrets.init()` accepting paths and individual names, mirroring `ClientRequest.init()` / `Connections`.
- G6. Extend `AWS` with the Secrets Manager operations needed.
- G7. Eliminate the three `_getParametersFromStore` defects and the two batching/pagination defects.

### Non-goals

- Writing parameters or secrets (`PutParameter`, `PutSecretValue`). Read-only.
- Secret rotation handling beyond honoring `refreshAfter`.
- Replacing or deprecating the Lambda layer path.
- Caching parameters in the DynamoDB/S3 cache. In-process only.
- AWS SDK v2. Already unsupported.

---

## 4. Constraints

- **C1. Backwards compatibility is the top priority** per `AGENTS.md`. `CachedParameterSecrets`, `CachedParameterSecret`, `CachedSsmParameter`, `CachedSecret`, and the `CachedSSMParameter` alias are all public. Nothing may change signature or default behavior.
- **C2. Wrapper shapes are pinned by tests.** Any SDK-sourced value must normalize to `{Parameter:{Value}}` or `{SecretString}` before it reaches `this.value`, or `sync_getValue()`, `toString()`, `toJSON()`, and connection basic-auth all break.
- **C3. Lenient constructor behavior is pinned.** `parameter-secret-edge-case-tests.jest.mjs` asserts `null`, `undefined`, `""`, `123`, `{}`, `[]` names construct without throwing. New validation must not be applied to the constructor.
- **C4. The `sync_getValue()` throw contract is pinned** by property tests. Must keep throwing when unresolved.
- **C5. No AWS SDK in runtime `dependencies`.** All `@aws-sdk/*` packages are devDependencies only; the package relies on the Lambda-provided SDK. `@aws-sdk/client-secrets-manager` must follow that pattern.
- **C6. Types ship with the package** and are gated by `npm run test:types`. Every new public member needs a `types/lib/tools/index.d.ts` declaration.
- **C7. Internal classes go in `src/lib/utils/`**, not `src/lib/tools/`, and are not exported publicly.
- **C8. Tests are Jest `.jest.mjs`** and must be run via `node --experimental-vm-modules node_modules/jest/bin/jest.js`. A bare `npx jest` fails on ESM.
- **C9. Getter mocking**: `AWS.ssm` / `AWS.secrets` return fresh objects per access, so tests must use `jest.spyOn(AWS, 'secrets', 'get')`.

---

## 5. Workstreams

Ordered by dependency. WS-0 and WS-1 are prerequisites for everything else.

### WS-0. Harden `_getParametersFromStore` (FINDINGS R1, R3, R5)

**File**: `src/lib/tools/index.js:382-488`

1. Replace `!(group in paramstore)` with `!Object.prototype.hasOwnProperty.call(paramstore, group)`. Fixes the live defect where a `group` of `toString`/`valueOf`/`hasOwnProperty` writes parameter values onto a process-wide shared function object and returns an empty paramstore.
2. Guard the `parameters.find(...)` dereference at line 465-466 so a path mismatch warns and skips instead of throwing `TypeError` and rejecting `AppConfig.promise()`.
3. Normalize supplied `path` values to a trailing `/` at intake so the mismatch cannot arise from caller formatting.
4. Hoist `DANGEROUS_KEYS` out of the `forEach` to module scope. Currently reallocated per iteration in a boot-path loop.
5. Keep the existing denylist. The character allowlist proposed in FINDINGS R2 does **not** subsume it, since `__proto__` matches `[a-zA-Z0-9_.-]+`.

**Regression risk**: none for valid input. Item 3 is the only behavior change and it turns a crash into success.

### WS-1. Shared key-safety and grouping utility

**New file**: `src/lib/utils/ParameterKeySafety.class.js` (internal, per C7)

Extracted so WS-4, WS-5, and WS-6 cannot reintroduce the bug class independently. Responsibilities:

- `isSafeKey(key)` — denylist plus `/^[a-zA-Z0-9_.-]+$/` allowlist.
- `createGroupStore()` — returns `Object.create(null)` or `{}` per Q4.
- `setGrouped(store, group, name, value)` — own-property check, key validation, single place where dynamic assignment happens.
- `normalizePath(path)` — trailing-slash normalization.
- `deriveGroupAndName(paramName, parameters)` — the split/pop/rejoin/find logic with the undefined guard, so path-prefix matching is fixed once (relevant to Q5).

`_getParametersFromStore` is refactored to call this. Same for all new code paths.

### WS-2. Add Secrets Manager to `AWS`

**File**: `src/lib/tools/AWS.classes.js`

The eager `#SDK` IIFE is the problem. Adding `require("@aws-sdk/client-secrets-manager")` to it means that if the package is absent from the runtime, **every consumer of this library throws at module load**, whether or not they use secrets. That is an unacceptable blast radius for an optional feature.

I could not confirm from the AWS docs which specific `@aws-sdk/client-*` packages the managed Node.js runtime bundles. The docs state only that supported runtimes "include a specific minor version of the AWS SDK for JavaScript v3" without enumerating clients. **This must be verified empirically in the target runtime before relying on it** — see Q8. Regardless of the answer, the defensive design is the same:

1. Add `@aws-sdk/client-secrets-manager` at `^3.995.0` to **devDependencies only** (C5).
2. Add a `secrets` block to `#SDK` built through a **guarded lazy accessor**, not the eager IIFE:
   - `require` wrapped in try/catch; on failure record the reason and leave the client null.
   - Client constructed on first access to `AWS.secrets`, then memoized.
   - Route through `instrumentClient()` so Powertools/X-Ray tracing is preserved.
3. Public accessor `static get secrets()` mirroring the `ssm` shape: `{ client, get, sdk }` where `get: (params) => client.send(new GetSecretValueCommand(params))`.
4. Expose availability so callers can degrade rather than crash. Shape TBD per Q9.
5. Consider adding `GetParameterCommand` (singular) to the `ssm` sdk block. Currently only the plural commands are wired, so a single-name fallback must use `GetParametersCommand` with a one-element `Names` array. That works and supports `WithDecryption`, so this is optional.

**Deviation note**: making `secrets` lazy while `dynamo`/`s3`/`ssm` stay eager is an intentional inconsistency, accepted per Q10. The full conversion is deferred to [1-3-x-convert-aws-to-lazy-accessors](../1-3-x-convert-aws-to-lazy-accessors/SPEC.md). Implementers should write the `secrets` accessor as the reference pattern that spec will generalize.

### WS-3. Extension availability detection

**File**: `src/lib/tools/CachedParametersSecrets.classes.js`

Greenfield. Requirements:

1. **Plumb the error code out.** `req.on('error')` at line 490 currently discards `error.code`. Return a discriminated result (`{ ok, value, reason }`) internally so ECONNREFUSED is distinguishable from a parse failure or auth rejection. Keep the public `_requestSecretsFromLambdaExtension` contract resolving `null` if anything external depends on it, or treat it as internal — it is underscore-prefixed and untested, so I lean toward changing it.
2. **Inspect HTTP status.** A 4xx/5xx whose body happens to parse as JSON is currently treated as success, with the shape check deferred to `isValid()`. Non-2xx should be an explicit failure with the status recorded.
3. **Honor `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`** as the port source, falling back to the existing `static port = "2773"`. Keep the public statics writable for backwards compatibility.
4. **Memoize availability process-wide**, tri-state (unknown / available / unavailable), so the 3x retry cost is paid once rather than per parameter. Without this, a function with 10 parameters and no layer pays 30 refused connections on cold start.
5. **Detection signals**, in order: explicit config override, then absence of `AWS_SESSION_TOKEN` (the layer cannot work without it), then observed ECONNREFUSED on first probe.
6. Decide probe-on-demand vs explicit health check (Q11).

### WS-4. SDK fallback in `CachedParameterSecret`

**File**: `src/lib/tools/CachedParametersSecrets.classes.js`

1. Add an overridable `_requestFromSdk()` to the base class; `CachedSsmParameter` implements it via `AWS.ssm.getByName({ Names: [this.name], WithDecryption: true })`, `CachedSecret` via `AWS.secrets.get({ SecretId: this.name })`.
2. **Normalize to the existing wrapper shapes** (C2). `GetParameters` returns `{ Parameters: [...] }`, so wrap the single result as `{ Parameter: {...} }`. `GetSecretValue` already returns `SecretString` at the top level, so confirm the full response satisfies `"SecretString" in value`.
3. Rework `refresh()` (lines 314-352) to select transport from the WS-3 availability state, preserving: never throws, resolves `cache.status` of `1`/`-1`, `cache.promise` dedupe, `Timer` instrumentation. Retry count for the SDK path should differ from 3 — the SDK has its own retry strategy, so 3 library retries on top is 9 attempts (Q12).
4. `CachedSsmParameter` must handle `InvalidParameters` in the `GetParameters` response — a nonexistent name is returned in that array rather than throwing.
5. Introduce `CachedParameterSecrets.classes.js` requiring `AWS.classes.js`. Check for a require cycle: `AWS.classes.js` requires `./PowertoolsInit` inside a function, and `index.js` requires both. Needs verification during implementation.

### WS-5. `CachedParameterSecrets.init()`

**File**: `src/lib/tools/CachedParametersSecrets.classes.js` (public API addition, MINOR)

1. Accept the `{ group, path, names }` grouping shape plus a secrets equivalent. Exact shape is Q13.
2. Construct and register `CachedSsmParameter` / `CachedSecret` instances for each resolved name.
3. For path-based entries, names are not known until queried, so `init()` must either be async-discovering or defer discovery to `prime()`. This is the main design fork (Q14).
4. Add a dedupe check so `init()` plus manual construction of the same name does not double-register. `add()` currently pushes unconditionally.
5. Add a reset/clear method. The registry is process-global with no teardown, which makes the new API untestable in isolation (C8 test isolation).
6. Preserve the existing `prime()` contract, which resolves a boolean despite its `@returns {Promise<Array>}` JSDoc. Fix the JSDoc, not the behavior.

### WS-6. Secrets Manager in the `AppConfig` config path

**File**: `src/lib/tools/index.js`

1. Add an `options.secrets` (or extend `options.ssmParameters` — Q15) init block.
2. **Wrap it in the never-rejecting promise pattern** used by `settings`/`connections`/`validations`/`responses`. The current `ssmParameters` block is the only one that lets a rejection escape into `AppConfig.promise()`. Changing that for `ssmParameters` itself is a behavior change (Q16); new code should adopt the safe pattern regardless.
3. **JSON secret keys are the highest-risk input in this whole plan.** `JSON.parse` on a `SecretString` produces key names directly from the secret payload, and `__proto__` in a JSON object literal is a well-known pollution vector. Every key must go through WS-1 validation. Nesting shape is Q17.
4. **Add sync accessors for resolved values** (Q18 = option a). `AppConfig.parameters()` and `AppConfig.secrets()` return `null` until `AppConfig.promise()` settles, then the resolved store. This matches `settings()` / `connections()` and the existing "null before init" convention. Combined with the Q16 wrap:

   ```js
   if (options.ssmParameters) {
       const parametersPromise = new Promise((resolve) => {
           AppConfig._initParameters(options.ssmParameters)
               .then((paramstore) => {
                   AppConfig._parametersResolved = paramstore;
                   resolve(true);
               })
               .catch((error) => {
                   DebugAndLog.error(`SSM parameter initialization failed: ${error.message}`, error.stack);
                   resolve(false);
               });
       });
       AppConfig._ssmParameters = parametersPromise;
       AppConfig.add(parametersPromise);
   }
   ```

   Same shape for the new `options.secrets` block, assigning `AppConfig._secretsResolved`.

5. **Internal contract change**: `_ssmParameters` now resolves to a boolean rather than the paramstore (see Q18 note). Update the four `test/config/appconfig-async-init-*` files that read it for data, and add a changelog line.

6. New fields `_parametersResolved` / `_secretsResolved` need declaring alongside `_settings` / `_connections` at `src/lib/tools/index.js:104-108`, and the two new accessors need `types/lib/tools/index.d.ts` entries (WS-8).

### WS-7. Batching and pagination

**File**: `src/lib/tools/index.js`, and WS-4/WS-5 where they batch

1. **Chunk `Names` into groups of 10** and issue parallel `GetParameters` calls. Fixes the `ValidationException` at 11+ names.
2. **Follow `NextToken` on `GetParametersByPath`** until exhausted (Q19). Fixes silent truncation past 10 parameters. This is the highest-severity fix in the plan.
3. Decide `Recursive` support (Q5). If added, WS-1's `deriveGroupAndName` must switch from "strip last segment" to "longest configured path prefix wins," because recursive results return names deeper than the configured path.

   **Security note worth surfacing in docs if `Recursive` is added**: AWS documents that path access is transitive under this operation. A principal with access to `/a` can read `/a/b` via a recursive call *even if IAM explicitly denies `/a/b`*. Enabling `Recursive` by default would therefore widen the effective read scope of consuming applications without them asking for it. My recommendation is that `Recursive` be opt-in per entry, never default.
4. Consider a concurrency cap. Parameter Store's default GetParameters quota is 10 TPS; unbounded parallel chunks could throttle.

### WS-8. Types, documentation, changelog

1. `types/lib/tools/index.d.ts`: `AWS.secrets`, `CachedParameterSecrets.init()`, `CachedParameterSecrets.info()` (Q9), the registry reset method, `options.secrets` on `AppConfig.init`, and the `AppConfig.parameters()` / `AppConfig.secrets()` accessors (Q18).
2. JSDoc on all new public members per `documentation-standards-jsdoc.md`: description, `@param`, `@returns`, `@example`, `@throws`.
3. `docs/`: layer vs SDK tradeoffs, IAM permissions for both modes, migration guidance for dropping the layer.
4. IAM documentation must be explicit. The SDK path needs `ssm:GetParameters`, `ssm:GetParametersByPath`, `secretsmanager:GetSecretValue`, and `kms:Decrypt`. Existing docs only cover the layer's requirements.
5. `CHANGELOG.md` under a v1.3.16 unreleased section, categorized Added / Fixed / Security, referencing this spec.

---

## 6. Sequencing

```
WS-0 (harden)  ──┐
                 ├──> WS-1 (shared utility) ──┬──> WS-6 (config secrets) ──┐
WS-7 (paging) ───┘                            │                            │
                                              └──> WS-5 (init) ────────────┤
WS-2 (AWS.secrets) ──> WS-3 (detection) ──> WS-4 (fallback) ───────────────┤
                                                                           └──> WS-8 (types/docs)
```

Suggested commit boundaries:

1. WS-0 + WS-7 + tests. Self-contained fixes, independently releasable.
2. WS-1 refactor, no behavior change, preservation tests only.
3. WS-2 + tests.
4. WS-3 + WS-4 + tests. The functional core.
5. WS-5 + WS-6 + tests.
6. WS-8.

---

## 7. Draft correctness properties

For `design.md`. Each becomes a fast-check property test.

**P1 (Bug condition — key safety)**: For any `group` or `name` in `Object.getOwnPropertyNames(Object.prototype)` or failing the allowlist, the parameter is skipped, a warning is logged, `Object.prototype` gains no own property, and no built-in function object is mutated.

**P2 (Preservation — storage)**: For any `group`/`name` passing validation, the value is stored at `store[group][name]` and readable via `Object.keys`, identically to current behavior.

**P3 (Bug condition — path mismatch)**: For any returned parameter name whose derived group path matches no configured entry, the operation completes without throwing and the unmatched parameter is reported.

**P4 (Completeness — pagination)**: For any path containing N parameters, all N are returned regardless of N. Specifically N > 10.

**P5 (Completeness — batching)**: For any list of N names, all N are requested and returned. Specifically N > 10.

**P6 (Equivalence — transport)**: For any parameter or secret retrievable by both transports, `getValue()` returns an identical string via layer and via SDK. Wrapper shape satisfies the same `isValid()`.

**P7 (Preservation — public contract)**: For any name, `sync_getValue()` throws while unresolved; `toString()`/`toJSON()` return `[Pending: <name>]` while unresolved and equal `sync_getValue()` once resolved. Holds for both transports.

**P8 (Preservation — lenient construction)**: For any name value including null/undefined/non-string, the constructor does not throw and `getName()` round-trips it.

**P9 (Fallback determinism)**: Given an unavailable layer, every retrieval resolves via SDK. Given an available layer, every retrieval uses it. No partial state.

**P10 (Isolation — no secret leakage)**: For any retrieved secret value, no property is written to any object reachable from `Object.prototype`, and the value does not appear in `toObject()` output.

---

## 8. Test strategy

Per `test-requirements.md` and `test-execution-monitoring.md`.

**New mocking infrastructure is required.** Nothing in the current suite mocks the extension HTTP call or executes `AWS.ssm.getByName`/`getByPath`. `refresh()`, the retry loop, `_requestSecretsFromLambdaExtension`, and the whole grouping/flattening path are effectively untested today.

- `test/helpers/` — a reusable extension mock (`jest.spyOn(http, 'request')`) covering success, ECONNREFUSED, timeout, non-2xx-with-JSON-body, and malformed JSON.
- `test/helpers/` — SSM and Secrets Manager mocks via `jest.spyOn(AWS, 'ssm', 'get')` / `jest.spyOn(AWS, 'secrets', 'get')` per C9, returning complete objects and including `InvalidParameters` and paginated `NextToken` responses.
- `test/security/` — extend the dangerous-key generator from `fc.constantFrom('__proto__','constructor','prototype')` to all of `Object.getOwnPropertyNames(Object.prototype)`. This is the gap that let the live defect through.
- `test/config/` — `init()`, dedupe, reset, fallback selection, pagination, batching.
- `test/types/` — declarations for every new public member.
- Registry isolation: `CachedParameterSecrets` is process-global with no teardown. Either add reset (WS-5.5) or use subprocess isolation per `test-requirements.md`.
- Property tests that spawn no child processes can use the standard 100 runs; none here should need subprocess execution.

All existing tests must stay green, in particular the four `test/config/` cached-param files and `test/config/property/appconfig-async-init-property-tests.jest.mjs`.

---

## 9. Versioning

| Change | Classification |
|---|---|
| WS-0 hardening | PATCH (fixes broken behavior) |
| WS-7 pagination/batching | PATCH (fixes data loss) |
| WS-1 internal refactor | PATCH |
| WS-2 `AWS.secrets` | MINOR (new public accessor) |
| WS-3 detection | PATCH if internal |
| WS-4 SDK fallback | MINOR (new capability, new default when layer absent) |
| WS-5 `init()` + reset | MINOR |
| WS-6 config secrets + `parameters()` / `secrets()` accessors | MINOR |

Net: **MINOR**, consistent with 1.3.16. No breaking changes identified, contingent on WS-4 preserving the wrapper shapes (C2) and WS-5 not altering constructor leniency (C3).

One judgment call: WS-4 changes behavior for an existing consumer who has no layer installed. Today they get `null` and a `-1` status; afterward they get a working value. That is a fix, not a break, but it does mean the SDK path can now make AWS API calls where previously none were made — which surfaces as new IAM requirements and new latency for anyone who was relying on the failure. This needs a prominent changelog note (Q20).

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `@aws-sdk/client-secrets-manager` absent from runtime, eager require breaks all consumers | High | Guarded lazy require (WS-2); verify per Q8 |
| Wrapper-shape drift breaks `sync_getValue()` and connection basic auth | High | C2 normalization + P6/P7 property tests |
| Require cycle between `CachedParametersSecrets` and `AWS.classes.js` | Medium | Verify in WS-4; lazy require inside the method if needed |
| Silent truncation persists in new path code | Medium | WS-7 before WS-5/WS-6; P4/P5 |
| Cold-start latency regression from probing | Medium | Memoized tri-state (WS-3.4) |
| Global registry makes new tests order-dependent | Medium | Reset method (WS-5.5) |
| Parameter Store throttling from unbounded parallel chunks | Low | Concurrency cap (WS-7.4) |
| Secret values reaching logs via `DebugAndLog.debug` of param objects | Medium | Audit; `toObject()` already excludes value but returns `cache` by reference |

---

## 11. Open questions

Carried forward from FINDINGS.md (Q1-Q7 unanswered) plus new ones from this planning pass. Answer inline below each.

### Carried forward from FINDINGS.md

**Q1. Release split.** Ship WS-0 + WS-7 as a standalone hardening patch before the feature work, or fold everything into one 1.3.16 release? Folding couples a security fix to a larger feature; splitting means two releases.
*My recommendation: split. The pagination fix is silent data loss and shouldn't wait on feature work.*
**Answer:** Fold into one release

**Q2. Denylist vs allowlist.** Keep `DANGEROUS_KEYS` and add the character allowlist, or allowlist only? The allowlist does not catch `__proto__`, so allowlist-only is strictly weaker.
*My recommendation: keep both.*
**Answer:** keep both

**Q3. Silent skip vs throw.** Should an explicitly enumerated parameter (in a `names` array) that fails key validation throw and fail init, or continue to warn-and-skip? A missing credential silently becoming `undefined` is the worse failure mode.
*My recommendation: throw for enumerated names, warn-and-skip for path-discovered ones.*
**Answer:** throw for enumerated names, warn-and-skip for path-discovered ones

**Q4. `Object.create(null)` blast radius.** Null-prototype group objects mean consumers can't call `.hasOwnProperty()` on them and string coercion changes. Should I trace all consumers of the paramstore return value first, or keep `{}` and rely on the own-property check plus validation alone?
*My recommendation: keep `{}` for the returned structure (the own-property check is sufficient) and use `Object.create(null)` only for internal accumulators. Lower risk, same protection.*
**Answer:** keep `{}` for the returned structure (the own-property check is sufficient) and use `Object.create(null)` only for internal accumulators. Lower risk, same protection.

**Q5. Recursive path queries.** Does this spec need `Recursive: true` on `GetParametersByPath`? If yes, group derivation changes from "strip last segment" to "longest configured prefix," which is a design change rather than a patch.
**Answer:** yes, this spec needs `Recursive: true`

**Q6. Secrets Manager JSON key handling.** For JSON secrets, flatten keys into the group (`store[group][key]`) or nest under the secret name (`store[group][secretName][key]`)? Determines how much attacker-influenced key material reaches dynamic assignment.
*My recommendation: nest. Avoids collisions between two secrets sharing a key name, and keeps provenance clear.*
**Answer:** nest

**Q7. Deprecate old versions.** The prototype pollution was live in v1.1.x-v1.2.x. Do you want `npm deprecate` notices on those ranges pointing at `>=1.3.10`?
**Answer:** yes

### New questions from this planning pass

**Q8. Runtime SDK availability.** I could not confirm from AWS documentation which specific `@aws-sdk/client-*` packages the managed Node.js runtime bundles; the docs only say "a specific minor version of the AWS SDK for JavaScript v3." Can you confirm `@aws-sdk/client-secrets-manager` is present in your target runtimes (nodejs20.x / 22.x / 24.x), or should I treat it as possibly absent and require the guarded-lazy design plus a documented fallback error?
*I've designed defensively either way, but the answer determines how loudly we document it.*
**Answer:** it seems to be present since i've ran lambda accessing the client without installing it outside of devDependencies

**Q9. Availability API surface.** Should extension/SDK availability be publicly inspectable (e.g. `CachedParameterSecrets.info()` or an `AWS.secrets.isAvailable` flag), or stay internal? Public is useful for consumer diagnostics but is API surface we then have to keep.
**Answer:** Make it publicly inspectable with `CachedParameterSecrets.info()`

**Q10. Lazy vs eager SDK clients.** Make only `secrets` lazy (inconsistent with `dynamo`/`s3`/`ssm` but low risk), or convert all four to lazy accessors (consistent, better cold start, wider regression surface)?
*My recommendation: only `secrets` now; file the full conversion separately.*
**Answer:** only `secrets` now; file the full conversion separately (document this in a new future spec .kiro/specs/1-3-x-convert-aws-to-lazy-accessors/SPEC.md)
**Done**: [1-3-x-convert-aws-to-lazy-accessors/SPEC.md](../1-3-x-convert-aws-to-lazy-accessors/SPEC.md) created. It records a verified compatibility hazard the conversion must handle: `tools.AWSXRay` is currently non-null only because `instrumentClient()` runs during the eager IIFE before `module.exports` evaluates. Going lazy would regress that export to `null`.

**Q11. Detection strategy.** Probe-on-first-use (zero config, costs one failed connection when absent), explicit opt-in via env var or init option (predictable, requires configuration), or env-var heuristic on `AWS_SESSION_TOKEN` plus `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT` (no probe, but the port var is only set when the layer is configured, not when it's healthy)?
*My recommendation: heuristic first, then probe-on-first-use as confirmation, with an explicit init override.*
**Answer:** heuristic first, then probe-on-first-use as confirmation, with an explicit init override

**Q12. SDK retry count.** The layer path retries 3x. The AWS SDK has its own retry strategy, so keeping 3 gives up to 9 attempts. Reduce to 1 for the SDK path and let the SDK handle it?
*My recommendation: yes, 1.*
**Answer:** yes, 1

**Q13. `init()` input shape.** Which of these?
- (a) Reuse `{ group, path, names }` verbatim and add `type: 'ssm' | 'secret'`.
- (b) Separate keys: `{ ssmParameters: [...], secrets: [...] }`.
- (c) Match `AppConfig.init` exactly so the same object can be passed to both.
*My recommendation: (b) for explicitness, with (c) compatibility as a goal.*
**Answer:** (b) for explicitness, with (c) compatibility as a goal.

**Q14. Path discovery timing in `init()`.** For path-based entries the names aren't known until SSM is queried. Should `init()` (a) be async and discover immediately, (b) stay sync and defer discovery to `prime()`, or (c) return a promise the caller can add to `AppConfig._promises`?
*(c) matches the existing `AppConfig.init` pattern most closely. This is the biggest single design fork in the plan.*
**Answer:** c

**Q15. Config option naming.** Add Secrets Manager as a new `options.secrets` on `AppConfig.init`, or extend `options.ssmParameters` entries with a type discriminator? New key is clearer; extending avoids a second option that behaves almost identically.
**Answer:** New key

**Q16. `ssmParameters` rejection behavior.** The existing `ssmParameters` block is the only `AppConfig.init` option that lets a rejection escape into `AppConfig.promise()`. Should I wrap it to match the other four (more consistent, but changes behavior for anyone currently catching that rejection), or leave it and only apply the safe pattern to new code?
**Answer:** wrap it to match the other four even if it changes behavior for anyone currently catching that rejection

**Q17. Secret parsing.** Should the config path `JSON.parse` a `SecretString` that looks like JSON, or always store the raw string and let the application parse? Auto-parsing is convenient but is exactly where attacker-influenced keys enter dynamic assignment.
*My recommendation: raw string by default, opt-in parsing per entry.*
**Answer:** raw string by default, opt-in parsing per entry

**Q18. Public accessor for resolved values.**

There are two ways to load parameters today and only one returns your data.

*Route 1 — subclass pattern* (what the `_initParameters` JSDoc `@example` documents): you call the protected method yourself and own the result in scope.

```js
class Config extends tools.AppConfig {
	static async init() {
		const params = await this._initParameters([
			{ group: "app", path: process.env.PARAM_STORE_PATH, names: ["authUsername"] }
		]);
		// params.app.authUsername is available here.
	}
}
```

*Route 2 — the `init()` option* (`src/lib/tools/index.js:234-236`): `_initParameters` is `async` and is **not** awaited, so `_ssmParameters` holds the unresolved promise, not the resolved paramstore. There is no getter. `_ssmParameters` appears only at lines 108, 235, 236 — nothing in `src/` or `types/` reads it. Its four siblings all have accessors (`settings()`, `connections()`, `getConnection()`, `getConn()`); `parameters()` does not exist.

So Route 2 fetches, decrypts, and groups the values, then drops them from the application's reach. The only ways in are the underscore internal (`await Config._ssmParameters`) or an accident of `Promise.all` ordering:

```js
const results = await Config.promise();
// -> [true, true, true, true, { app: { authUsername: "..." } }]
//                              ^ paramstore, at an index that shifts with which options were passed
```

This gets worse under the answers above: Q15 adds a second `options.secrets` key and Q14(c) pushes both promises into `_promises`, so there would be two unreachable datasets. Q6 (nest under secret name) and Q17 (raw string, opt-in parsing) give the secrets result real structure worth reading.

Options:
- (a) **Sync getter populated on resolve.** `AppConfig.parameters()` / `AppConfig.secrets()` return `null` until `promise()` settles, then the resolved data. Matches the four existing accessors and the existing "returns null before init" convention. Readable from synchronous code.
- (b) **Async getter.** `await Config.parameters()` — cannot be read too early, but it would be the only async accessor on the class and is awkward for the synchronous callers this package is built around.
- (c) **Do nothing.** Leave consumers on Route 1 and treat `options.ssmParameters` as fire-and-forget. Since Route 2 has no side effects, this leaves the option close to useless.

*My recommendation: (a). Matches the existing accessors, keeps values reachable from sync code, and costs one field assignment inside the promise already being wrapped for Q16.*

**Answer:** (a) sync getter populated on resolve

**Consequence to carry into `requirements.md`**: under (a) folded into the Q16 wrap, `_ssmParameters` resolves to a **boolean** like its four siblings rather than to the paramstore. That is an internal contract change on top of Q16's. Existing tests read it for data (`test/config/property/appconfig-async-init-property-tests.jest.mjs` asserts `await AppConfig._ssmParameters` equals the mocked paramstore; `appconfig-async-init-unit-tests.jest.mjs` and the integration/performance tests also touch it), so those need updating. It is underscore-prefixed and undocumented, so this is acceptable, but it warrants a changelog line in case a consumer reached in.

**Q19. Pagination `MaxResults`.** Set `MaxResults: 10` explicitly plus `NextToken` following, or rely on the default and just follow `NextToken`? Same result; explicit is clearer.
**Answer:** Set `MaxResults: 10` explicitly plus `NextToken` following

**Q20. Changelog framing for WS-4.** Consumers without the layer currently get `null`; afterward they get working values, new AWS API calls, and new IAM requirements. Frame this as Added, Fixed, or Changed with a prominent IAM note?
*My recommendation: Added for the capability plus an explicit "action required: IAM permissions" note.*
**Answer:** Added for the capability plus an explicit "action required: IAM permissions" note

---

## 12. Related documentation

- [SPEC.md](SPEC.md) - Original feature intent
- [FINDINGS.md](FINDINGS.md) - Security evaluation of the external report
- [REPORT.md](REPORT.md) - External report (stale; fixed in v1.3.10)
- [Spec: 1-3-10-security-fixes-for-tests](../1-3-10-security-fixes-for-tests/) - Original CWE-471 remediation
- [Spec: 1-3-12-connections-info-cached-ssm-param-error](../1-3-12-connections-info-cached-ssm-param-error/) - `toString`/`toJSON` placeholder contract this plan must preserve
- [AWS: Using the AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html)
- [AWS: SSM GetParameters API reference](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParameters.html) - 10-item maximum
- [AWS: Lambda Node.js runtime dependencies](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html) - runtime-included SDK

*Content from AWS documentation was rephrased for compliance with licensing restrictions.*
