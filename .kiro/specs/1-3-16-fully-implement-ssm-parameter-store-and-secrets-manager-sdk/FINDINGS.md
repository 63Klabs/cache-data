# Findings: Evaluation of External Prototype Pollution Report

**Report evaluated**: [REPORT.md](REPORT.md)
**Package version evaluated**: `1.3.16` (from `package.json`)
**Code evaluated**: `src/lib/tools/index.js`, `AppConfig._getParametersFromStore` (lines 382-486)
**Date**: 2026-08-24

---

## Verdict Summary

| # | Claim from REPORT.md | Verdict |
|---|----------------------|---------|
| 1 | `paramstore[group][name] = param.Value` assigns unvalidated dynamic keys | **Valid as written, but already remediated** in v1.3.10 |
| 2 | `group = "__proto__"` pollutes `Object.prototype` | **Not reproducible** on v1.3.16 |
| 3 | The `!(group in paramstore)` guard is ineffective because `in` walks the prototype chain | **Valid — and still unfixed in v1.3.16** |
| 4 | Attacker controls `parameters` | **Not substantiated**; threat model is materially weaker than stated |
| 5 | PoC output shows `{}.toString` returning `"polluted"` | **Not reproducible**; guard logs a warning and skips |

**Bottom line**: the report describes a real bug that was fixed six releases ago, so its headline finding is stale. However, one of its supporting observations (claim 3) is still accurate, and following that thread uncovered a **live, previously unreported defect in v1.3.16 that leaks SSM parameter values onto a globally shared object**. The report is therefore worth acting on, but not for the reason the reporter gives.

---

## 1. The reported vulnerability is already remediated

The report quotes this code:

```js
const obj = parameters.find(o => o.path === groupPath);
const group = obj.group;
if ( !(group in paramstore)) {
    paramstore[group] = {};
}

// store key and value
paramstore[group][name] = param.Value;
```

The current code at `src/lib/tools/index.js:459-481` contains an additional guard that the report's excerpt omits:

```js
// >! Guard against prototype pollution (CWE-471)
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
if (DANGEROUS_KEYS.includes(group) || DANGEROUS_KEYS.includes(name)) {
    DebugAndLog.warn(`Skipping dangerous parameter key: group="${group}", name="${name}"`);
    return;
}
```

This guard was added by commit `fff33a1` and shipped in **v1.3.10 (2026-03-15)** under [Spec: 1-3-10-security-fixes-for-tests](../1-3-10-security-fixes-for-tests/), which explicitly documents this issue as CWE-471 and includes both unit and property-based regression tests.

### Reproduction attempt

The report's PoC was executed verbatim against the current source, plus four variants. Results:

| Input | `Object.prototype` modified | Behavior |
|---|---|---|
| `group: "__proto__"`, `names: ["toString"]` (report PoC) | No | Warned and skipped, returned `{}` |
| `group: "constructor"` | No | Warned and skipped |
| `group: "prototype"` | No | Warned and skipped |
| `group: "app"`, `names: ["__proto__"]` | No | Warned and skipped |
| `group: "app"`, `names: ["constructor"]` | No | Warned and skipped |
| `group: "app"`, `names: ["authUsername"]` (control) | No | Stored correctly as `{ app: { authUsername: ... } }` |

`Object.getOwnPropertyNames(Object.prototype)` was unchanged in every case. The existing regression suite (`test/security/`, 6 suites, 48 tests) also passes.

### Evidence the report targets an older release

- The report cites the `results.forEach` block "near line 228". That block sits at line **459** in v1.3.16 and at line **407** in v1.3.9. Line 228 corresponds to commits `34fb8c9` (v1.1.4, 2025-02-28) through `2e7bb50` (v1.2.3, 2025-05-29).
- The report cites the path `lib/tools/index.js`; the published path is `src/lib/tools/index.js`.
- The quoted snippet contains no guard, matching pre-v1.3.10 source.

**Conclusion**: the reporter almost certainly audited a v1.1.x-v1.2.x tarball. No action is required for the reported vector beyond a reply pointing to v1.3.10 and asking them to re-test on `>=1.3.10`.

---

## 2. Threat model correction

The report asserts "an attacker who controls the `parameters`". That framing overstates reachability and should be pushed back on.

`parameters` reaches `_getParametersFromStore` only via `AppConfig.init({ ssmParameters })` (`src/lib/tools/index.js:230`). That object is written by the consuming application's developer in boot code. It is not derived from an API Gateway event, request body, header, or any other remote input anywhere in this package. An actor who can set `group` can already execute arbitrary code in the Lambda, so prototype pollution adds nothing.

The one genuinely interesting sub-path — which the report does not identify — is the **path-query form**. When a caller supplies `{ group, path }` with no `names` array, `name` is derived from whatever parameter names actually exist under that path in SSM. A principal holding `ssm:PutParameter` on the application's parameter path, but no Lambda deploy rights, could create a parameter literally named `__proto__` and influence `name`. That is a real privilege-boundary crossing, and it is exactly what the v1.3.10 guard blocks. Worth stating explicitly in any reply, because it justifies keeping the guard rather than removing it as unreachable.

---

## 3. Valid residual finding: parameter values leak onto shared built-in function objects

This is new, live in v1.3.16, and traces directly to claim 3 of the report.

The guard added in v1.3.10 uses an exact-match denylist of three keys. The surrounding membership test was left unchanged:

```js
if ( !(group in paramstore)) {   // line 475 — `in` walks the prototype chain
    paramstore[group] = {};
}
paramstore[group][name] = param.Value;   // line 480
```

The report is correct that `in` is the wrong operator here. With `__proto__`, `constructor`, and `prototype` now blocked, the remaining consequence is different from prototype pollution but still a defect. For any `group` matching an inherited `Object.prototype` member — `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString` — the test `"toString" in {}` is `true`, so the initializer is skipped, `paramstore[group]` resolves to the inherited native function, and the parameter value is written as a property **on that shared function object**.

Verified against current source:

```
before: ({}).toString.authPassword = undefined
after : ({}).toString.authPassword = LEAKED_SECRET
```

Two distinct problems result:

**3a. Information exposure (CWE-200).** `Object.prototype.toString` is a process-wide singleton. A decrypted SSM `SecureString` value written to it is readable from any object in the Lambda container (`({}).toString.authPassword`), across invocations, by any other module in the process including third-party dependencies. This is not prototype pollution, but it is unintended global exposure of exactly the data this code path exists to protect.

**3b. Silent data loss.** `Object.keys(paramstore)` is empty in this case. The caller receives what looks like an empty result and gets no error:

```
group="toString"       -> typeof result[group]=function, ownKeys=[]
group="valueOf"        -> typeof result[group]=function, ownKeys=[]
group="hasOwnProperty" -> typeof result[group]=function, ownKeys=[]
group="app"            -> typeof result[group]=object,   ownKeys=["app"]
```

An application using `group: "valueOf"` would fail at runtime with confusing downstream errors rather than a clear configuration error.

**Severity**: Low. Requires a developer to choose one of six specific group names. No remote trigger. But the fix is three lines, and the existing test suite does not cover it — the v1.3.10 property tests generate dangerous keys only from `fc.constantFrom('__proto__', 'constructor', 'prototype')`.

---

## 4. Valid residual finding: unhandled `TypeError` on path mismatch

Line 466 dereferences the result of `Array.prototype.find` without a null check:

```js
const obj = parameters.find(o => o.path === groupPath);
const group = obj.group;   // throws if no match
```

`groupPath` is reconstructed by splitting the returned parameter name on `/`, dropping the last segment, rejoining, and appending a trailing `/`. It therefore fails to match whenever:

- The caller supplies `path` without a trailing slash. Verified: `{ group: "app", path: "/myapp/prod", names: ["/authUsername"] }` throws `TypeError: Cannot read properties of undefined (reading 'group')`.
- `getByPath` returns a nested parameter. `GetParametersByPath` with `Recursive: true` returns `/myapp/prod/db/host` for a query on `/myapp/prod/`, reconstructing to `/myapp/prod/db/` which matches nothing. The current code does not set `Recursive`, so this is latent rather than active — but the 1.3.16 spec adds new path-consumption entry points where it could surface.

The throw propagates out of the `results.forEach` callback and rejects the promise held in `AppConfig._promises`, so `AppConfig.promise()` rejects and the whole config init fails with an opaque message. This is unrelated to the report but sits in the same eight lines and should be fixed in the same pass.

**Severity**: Low-Medium (availability / developer experience).

---

## 5. Not a finding: `paramstore` is a plain object literal

`let paramstore = {};` at line 384 inherits from `Object.prototype`. `Object.create(null)` would be more robust in principle. It is worth doing as defense in depth, but it is **not** currently exploitable for prototype pollution: two-level bracket assignment can only reach `Object.prototype` via the literal `__proto__` key, and `constructor`/`prototype` chaining is not expressible in this code shape. The denylist is over-inclusive and sufficient for the pollution vector specifically.

Note one behavioral consequence if this change is made: `Object.create(null)` objects have no `toString`, so `JSON.stringify` still works but string coercion and `DebugAndLog.debug` output of the object may change. Needs a preservation test.

---

## 6. Relevance to SPEC.md

This matters for the 1.3.16 work rather than as a standalone security patch.

[SPEC.md](SPEC.md) proposes a new `CachedParameterSecrets.init()` that "consumes a list of parameter and secret paths and individual names" — the same `{ group, path, names }` shape, and adds Secrets Manager as a second source. The current `CachedParameterSecrets` container stores instances in an array (`static #cachedParameterSecrets = []`, line 43) and looks them up with `.find()`, so it has no dynamic-key surface today. Introducing group-keyed maps in the new SDK fallback path would reintroduce this entire bug class, and would do so for Secrets Manager values, which are strictly more sensitive than SSM `String` parameters.

The three defects above should become non-negotiable design constraints on the new code rather than a separate remediation effort.

---

## Recommended Remediations

Ordered by priority. All are backwards compatible for valid inputs, so they fit a PATCH or the in-flight MINOR.

### R1. Replace the `in` test with an own-property check (Required)

`src/lib/tools/index.js:475`

```js
// >! Use hasOwnProperty, not `in` — `in` walks the prototype chain and would
// >! cause paramstore[group] to resolve to an inherited built-in (e.g. toString),
// >! writing parameter values onto a process-wide shared function object.
if (!Object.prototype.hasOwnProperty.call(paramstore, group)) {
    paramstore[group] = Object.create(null);
}
```

Fixes both 3a and 3b. Behavior for all valid group names is unchanged.

### R2. Validate group and name against an allowlist instead of a denylist (Required)

Per `secure-coding-practices.md`, allowlisting beats denylisting. SSM parameter name segments are constrained by AWS to `[a-zA-Z0-9_.-]`, so an allowlist is both tighter and simpler than enumerating dangerous keys:

```js
// >! Allowlist valid SSM name segments rather than denylisting dangerous keys.
// >! AWS restricts parameter name characters to a-zA-Z0-9_.- which excludes
// >! every prototype-reachable key, so this subsumes the DANGEROUS_KEYS check.
const VALID_KEY_PATTERN = /^[a-zA-Z0-9_.-]+$/;
if (!VALID_KEY_PATTERN.test(group) || !VALID_KEY_PATTERN.test(name)) {
    DebugAndLog.warn(`Skipping invalid parameter key: group="${group}", name="${name}"`);
    return;
}
```

Note the tradeoff: `__proto__` and `constructor` both match `[a-zA-Z0-9_.-]+`, so **this does not replace the denylist** — it complements it by also catching `toString`, `valueOf`, and anything else unexpected. Recommend keeping `DANGEROUS_KEYS` and adding the pattern test, or hoisting `DANGEROUS_KEYS` to a module-level constant (it is currently re-allocated on every iteration inside the `forEach`, which is wasteful in a hot boot path).

### R3. Guard the `find()` dereference (Required)

`src/lib/tools/index.js:465-466`

```js
const obj = parameters.find(o => o.path === groupPath);
if (obj === undefined || typeof obj.group !== "string") {
    DebugAndLog.warn(`No parameter group matches path "${groupPath}" for parameter "${param.Name}"; skipping`);
    return;
}
const group = obj.group;
```

Fixes finding 4. Converts a config-init-killing `TypeError` into a skipped parameter plus an actionable warning. Consider also normalizing supplied `path` values to end in `/` at intake so the trailing-slash mismatch cannot occur.

### R4. Surface skipped parameters to the caller (Recommended)

`DebugAndLog.warn` is invisible at default log levels, so a dropped credential currently manifests as `undefined` deep in application code. Options, in order of preference:

1. Throw on a `names`-specified parameter that is skipped — the developer explicitly asked for it, so silently dropping it is wrong. Keep warn-and-skip for path-discovered parameters, which the developer did not enumerate.
2. Return skip metadata alongside `paramstore`. Changes the return shape, so MINOR at least, possibly MAJOR.
3. Leave as warn-only and document.

Option 1 is a behavior change for a currently-broken input, so it is arguably PATCH-safe, but it needs an explicit call. See open question Q3.

### R5. Add regression tests (Required)

Per `test-requirements.md`, in `test/security/`:

- Unit: each of `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString` as `group`, asserting the value is stored in the returned object and that `Object.prototype.toString` gains no own properties.
- Unit: `path` without trailing slash does not throw.
- Unit: `getByPath` returning a nested path does not throw.
- Property: extend the existing dangerous-key generator from `fc.constantFrom('__proto__', 'constructor', 'prototype')` to include all `Object.getOwnPropertyNames(Object.prototype)`.
- Preservation: existing 48 security tests plus the full suite must stay green. Note `npm test` requires `node --experimental-vm-modules`; a bare `npx jest` fails on ESM.

### R6. Apply the same constraints to the new 1.3.16 code (Required)

Add to the 1.3.16 design as explicit correctness properties:

- Any group-keyed accumulator in the new SDK fallback or `CachedParameterSecrets.init()` uses `Object.create(null)` and `hasOwnProperty`, never `in`.
- Secrets Manager `SecretString` values and parsed JSON secret keys pass through the same key validation as SSM names. JSON secrets are higher risk here: `JSON.parse` produces attacker-influenced key names directly from secret payloads, and `__proto__` in a JSON object literal is a well-known pollution vector.
- Retain the existing array-based registry in `CachedParameterSecrets` unless there is a measured performance reason to switch to a keyed map.

### R7. Respond to the reporter (Recommended)

Content for the reply, no CVE or advisory warranted for the reported vector:

- The reported issue was fixed in v1.3.10 (2026-03-15); please re-test on `>=1.3.10`.
- Their observation about `in` versus prototype-chain lookup was accurate and led to a distinct residual defect that is being fixed in v1.3.16. Credit them for that.
- The threat model in the report overstates reachability: `parameters` is developer boot config, not remote input. The credible variant is a principal with `ssm:PutParameter` influencing discovered names under a path query.
- Confirm whether they tested a published tarball and which version, so it can be determined whether any pre-1.3.10 version needs a deprecation notice on npm.

---

## Open Questions

**Q1. Version scope.** Do you want R1-R3 released as a standalone `1.3.16` patch ahead of the SSM/Secrets Manager feature work, or folded into the 1.3.16 feature release? Folding them in couples a small security fix to a larger feature; splitting means two releases.
**Answer** fold it into the 1.3.16 features

**Q2. Denylist versus allowlist.** Keep `DANGEROUS_KEYS` and add the character allowlist (belt and braces), or replace the denylist with allowlist plus own-property check only? I lean toward keeping both, since the allowlist does not actually catch `__proto__`.
**Answer** keep both

**Q3. Silent skip versus throw.** Should an explicitly enumerated parameter (present in a `names` array) that fails key validation throw and fail config init, or continue to warn and skip? Throwing is safer — a missing credential should be loud — but it is a behavior change for input that currently "succeeds" by returning nothing.
**Answer** Throw since it is up to developer to fix. It is okay that it change behavior

**Q4. `Object.create(null)` blast radius.** Switching the inner group objects to null-prototype means consumers can no longer call `.hasOwnProperty()` or rely on string coercion on them. `AppConfig.getSettings()` and any application code touching `_ssmParameters` results could be affected. Do you want me to trace all consumers of the `paramstore` return value before making this change, or keep the inner objects as `{}` and rely on R1 plus R2 alone?
**Answer** Trace all consumers of `paramstore` return value before making this change

**Q5. Recursive path queries.** Does the 1.3.16 spec intend to support `Recursive: true` on `GetParametersByPath`? If yes, the group-reconstruction logic needs to change from "strip last segment" to "match the longest configured path prefix," which is a larger change than R3 and should be designed rather than patched.
**Answer** Yes allow recursion

**Q6. Secrets Manager key handling.** For JSON secrets, should keys be flattened into the group (`paramstore[group][secretKey]`) or nested under the secret name (`paramstore[group][secretName][secretKey]`)? This determines how much attacker-influenced key material reaches dynamic property assignment and should be settled in the design phase.
**Answer** Nest under the secret name

**Q7. Old version deprecation.** Given the vulnerability was live in v1.1.x-v1.2.x, do you want `npm deprecate` notices on those version ranges pointing to `>=1.3.10`?
**Answer** Yes

---

## Verification Performed

- Read `src/lib/tools/index.js` lines 145-500, `src/lib/tools/AWS.classes.js` SSM accessor (lines 316-440), `src/lib/tools/CachedParametersSecrets.classes.js`.
- Executed the report's PoC verbatim plus five variants against the current working tree; captured `Object.prototype` before/after in each case.
- Executed the `toString`/`valueOf`/`hasOwnProperty` group cases and confirmed the value leak and the empty `Object.keys` result.
- Executed the trailing-slash path mismatch and captured the `TypeError`.
- Ran `test/security` (6 suites, 48 passed, 1 skipped) to confirm the existing guard's regression coverage is green.
- Traced line 228 to commits `34fb8c9` (v1.1.4) and `2e7bb50` (v1.2.3) via `git show`.
- Confirmed `_ConfigSuperClass` is still exported as a deprecated alias of `AppConfig` (`src/lib/tools/index.js:562`), so the report's entry point is reachable.
- All temporary PoC scripts were deleted; no repository files were modified.

**Not verified**: behavior against a real AWS SSM endpoint, and whether the reporter's tarball matches a specific published npm version.

---

## Related Documentation

- [REPORT.md](REPORT.md) - External report under evaluation
- [SPEC.md](SPEC.md) - 1.3.16 SSM Parameter Store and Secrets Manager feature spec
- [Spec: 1-3-10-security-fixes-for-tests](../1-3-10-security-fixes-for-tests/) - Original CWE-471 remediation
- [CHANGELOG.md](../../../CHANGELOG.md) - v1.3.10 release notes
