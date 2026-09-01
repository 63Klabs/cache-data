# Design Document

## Overview

Two changes, both confined to `src/lib/utils/`. No public export changes, no signature changes.

1. `ParameterKeySafety` gains a secret-name validation predicate and two secret assignment entry points. `SecretsManagerLoader` is rewritten to call them, removing all three of its raw bracket assignments and restoring the chokepoint invariant the introducing spec declared.
2. `ParameterKeySafety.normalizePath` drops its regex for a bounded character scan, removing the quadratic backtracking path.

### The constraint that shapes the secret-name design

Secret names cannot use `isSafeKey`. Two independent reasons:

- Names may contain `/` (`myapp/db/credentials`), which the SSM segment allowlist rejects.
- `SecretId` also accepts a full ARN, which adds `:` and a wider punctuation set (`+`, `=`, `@`) than SSM path segments permit.

So the existing single-segment allowlist is the wrong shape for this input. But relaxing to a denylist-only check would violate the steering preference for allowlisting. The design therefore introduces a *second, wider* allowlist scoped to secret names, layered over the same two denylists already used by `isSafeKey`. The denylists are what actually close the vulnerability; the allowlist is the last-resort guard for characters nobody anticipated.

### Why the whole name and every segment are both checked

The key actually passed to bracket assignment is the whole verbatim name, so validating the whole name is the minimum correct check. Segments are validated additionally as defense in depth: if future code ever splits secret names into nested groups the way `setGroupedPath` splits SSM paths, the guard is already in place. The cost is rejecting a hypothetical secret named `__proto__/x`, which is acceptable.

## Design Goals

- Close both findings without changing any behavior that is currently correct
- Keep every externally-derived bracket assignment inside `ParameterKeySafety`
- Fail loudly on caller configuration errors, quietly on AWS-side data anomalies
- Detect configuration errors before spending an AWS request
- Leave `normalizePath` output bit-identical to the regex it replaces

## Glossary

Terms carry over from [requirements.md](./requirements.md). Additions:

- **Secret-name allowlist**: `SECRET_NAME_PATTERN`, the wider character class scoped to Secrets Manager names and ARNs
- **Pre-pass**: the validation loop that runs over all entries before any AWS call is issued
- **Container**: the `store[group][secretName]` object created on the parse path to hold parsed JSON keys

## Architecture

### Current call graph

```
AppConfig.init({ secrets })
  └─ SecretsManagerLoader.load(entries)
       └─ per name: AWS.secrets.get({ SecretId })
            └─ #resolveValue(...)                    ← writes store[group][secretName]        (unguarded)
                 └─ per parsed key: isSafeKey(key)   ← writes store[group][secretName][key]   (key guarded,
            └─ back in load(): checkKey(group)                                                 name not)
                 └─ writes store[group][secretName]  ← (unguarded)
```

Three defects visible in that graph:

- The secret name reaches three assignments with no validation at any of them.
- Group validation is duplicated and inconsistent: `load()` uses `checkKey`, `#resolveValue` uses `isSafeKey`, and on the parse path it runs only when the group does not yet exist.
- Group validation in `load()` runs *after* `#resolveValue` has already had the chance to write.

### New call graph

```
AppConfig.init({ secrets })
  └─ SecretsManagerLoader.load(entries)
       ├─ #validateEntries(entries)                  ← throws before any AWS call        (Req 1.11)
       └─ per name: AWS.secrets.get({ SecretId })
            └─ #resolveValue(...) → returns a value descriptor, writes nothing
            └─ ParameterKeySafety.setGroupedSecret(...)      ← raw path
               ParameterKeySafety.setGroupedSecretMap(...)   ← parse path
```

`#resolveValue` becomes pure with respect to the store: it decides *what* to store and returns a descriptor. All writing moves to `ParameterKeySafety`. This is what makes Req 2.2 checkable by grep rather than by inspection.

### Module layout

| File | Change |
|---|---|
| `src/lib/utils/ParameterKeySafety.class.js` | Add `SECRET_NAME_PATTERN`, `MAX_SECRET_NAME_LENGTH`, `isSafeSecretName`, `checkSecretName`, `setGroupedSecret`, `setGroupedSecretMap`. Rewrite `normalizePath` body. |
| `src/lib/utils/SecretsManagerLoader.class.js` | Add `#validateEntries` pre-pass. `#resolveValue` returns a descriptor instead of writing. Remove all three bracket assignments and both inline group checks. |
| `test/security/secrets-manager-loader-key-safety-tests.jest.mjs` | New |
| `test/security/parameter-key-safety-tests.jest.mjs` | Extend with secret-name and normalizePath cases |
| `.kiro/specs/1-3-16-fully-implement-.../design.md` | Amend Known Limitation 1 |
| `CHANGELOG.md` | Entry under 1.3.16 |

## Components and Interfaces

### ParameterKeySafety additions

```js
/** Maximum SecretId length accepted by Secrets Manager. Bounds the segment scan. */
static MAX_SECRET_NAME_LENGTH = 2048;

// >! Wider allowlist scoped to Secrets Manager names and ARNs. Covers the AWS
// >! secret name charset (alphanumeric plus /_+=.@-) and the ":" that appears in
// >! ARNs. Anchored at both ends with a single repetition over a character class,
// >! so it cannot backtrack (js/polynomial-redos safe).
static SECRET_NAME_PATTERN = /^[a-zA-Z0-9_.+=@:/-]+$/;
```

```js
/**
 * Returns a {safe, reason} descriptor for a Secrets Manager secret name.
 * Unlike checkKey, "/" and ARN punctuation are permitted, because SecretId
 * accepts both "myapp/db/credentials" and a full ARN.
 *
 * @param {*} name
 * @returns {{safe: boolean, reason: string|null}}
 */
static checkSecretName(name)

/**
 * Boolean form of checkSecretName.
 *
 * @param {*} name
 * @returns {boolean}
 */
static isSafeSecretName(name)
```

Order of checks inside `checkSecretName`, and why:

| # | Check | Reason string | Why here |
|---|---|---|---|
| 1 | non-empty string | `not-a-non-empty-string` | Everything downstream assumes a string |
| 2 | length ≤ `MAX_SECRET_NAME_LENGTH` | `too-long` | Bounds the segment split before it runs (Req 1.9) |
| 3 | not in `DANGEROUS_KEYS` | `dangerous-key` | `__proto__` satisfies the allowlist, so the denylist must precede it |
| 4 | not in `PROTOTYPE_KEYS` | `prototype-key` | `toString` also satisfies the allowlist |
| 5 | matches `SECRET_NAME_PATTERN` | `invalid-characters` | Last-resort character guard |
| 6 | every non-empty segment clears 3 and 4 | `dangerous-segment` / `prototype-segment` | Defense in depth |

Empty segments are skipped rather than rejected in check 6. An empty segment cannot be a dangerous or prototype-reachable name, and rejecting `a//b` would be a behavior change with no security benefit.

```js
/**
 * Writes a scalar secret value at store[group][secretName].
 *
 * @param {object} store
 * @param {string} group
 * @param {string} secretName
 * @param {string} value
 * @returns {{assigned: boolean, reason: string|null}}
 */
static setGroupedSecret(store, group, secretName, value)

/**
 * Writes each own enumerable key of parsed at store[group][secretName][key].
 * Group and secretName are validated once. Every key is validated individually;
 * unsafe keys are reported in skipped and the remaining keys are still written.
 *
 * @param {object} store
 * @param {string} group
 * @param {string} secretName
 * @param {Object.<string, *>} parsed
 * @returns {{assigned: boolean, reason: string|null, skipped: Array.<{key: string, reason: string}>}}
 */
static setGroupedSecretMap(store, group, secretName, parsed)
```

Both validate `group` with the existing `isSafeKey` and `secretName` with `checkSecretName`, satisfying Req 2.7's "validated exactly once, by the `ParameterKeySafety` entry point". Both use `Object.prototype.hasOwnProperty.call()` at every level.

`setGroupedSecretMap` writes string values via `String(value)`, preserving the current coercion.

### normalizePath rewrite

```js
static normalizePath(path) {
    if (typeof path !== 'string') return path;

    // >! Manual trailing-slash scan replaces /\/*$/. That pattern is unanchored at
    // >! the start, so the engine retries \/* at every position and backtracks through
    // >! each run of slashes, giving quadratic time (js/polynomial-redos). Measured on
    // >! the regex: 48ms at 10k leading slashes, 167ms at 20k, 632ms at 40k.
    let end = path.length;
    while (end > 0 && path.charCodeAt(end - 1) === 0x2F) {
        end--;
    }
    return path.slice(0, end) + '/';
}
```

Equivalence argument. `String.prototype.replace` with the non-global `/\/*$/` replaces the first match. Scanning left to right, the first position where `\/*$` can match is the start of the maximal trailing run of slashes, because `$` forces the match to consume to end of string. So the regex removes exactly the maximal trailing slash run and appends one `/`. The scan computes the same boundary directly. Checked against the four shapes that matter:

| Input | Regex | Scan |
|---|---|---|
| `""` | `"/"` | `"/"` |
| `"/myapp/prod"` | `"/myapp/prod/"` | `"/myapp/prod/"` |
| `"/myapp/prod/"` | `"/myapp/prod/"` | `"/myapp/prod/"` |
| `"/////"` | `"/"` | `"/"` |

A property test asserts equality against the retained regex across generated inputs rather than relying on this argument alone.

`0x2F` is `/`. Using `charCodeAt` avoids allocating a single-character string per iteration.

### SecretsManagerLoader rewrite

`load()` gains a pre-pass and loses its inline group check:

```js
static async load(entries) {
    const store = {};
    const skipped = [];
    const failed = [];

    if (!entries || entries.length === 0) return { store, skipped, failed };

    // >! Validate all groups and names before issuing any AWS call, so a configuration
    // >! error is reported without consuming a Secrets Manager request (Req 1.11) and the
    // >! throw cannot be swallowed by the per-secret catch below (Req 1.12).
    SecretsManagerLoader.#validateEntries(entries);

    const { AWS } = require('../tools/AWS.classes.js');

    for (const entry of entries) {
        for (const secretName of (Array.isArray(entry.names) ? entry.names : [])) {
            try {
                const response = await AWS.secrets.get({ SecretId: secretName });
                const descriptor = SecretsManagerLoader.#resolveValue(entry, response, secretName);
                // ... dispatch on descriptor.kind, delegate the write
            } catch (error) {
                // retrieval failures only — validation already ran
                failed.push({ name: secretName, group: entry.group, reason: error.message });
            }
        }
    }

    return { store, skipped, failed };
}
```

`#validateEntries` throws on the first offending group or name:

```
SecretsManagerLoader: Secret "<name>" in group "<group>" has an unsafe name (<reason>).
Storing it would leave the secret silently unreachable.
```

No value is interpolated, satisfying Req 1.10.

`#resolveValue` returns one of three descriptors and touches nothing:

| `kind` | When | Carries |
|---|---|---|
| `raw` | `parseJson` false, or true with invalid JSON, or true with non-object JSON | `value` (string) |
| `map` | `parseJson` true with an object payload | `parsed` (object) |
| `none` | no `SecretString` (binary secret) | `reason: 'binary-secret'` |

The `skipped` push for binary secrets moves out of `#resolveValue` into `load()`, so `#resolveValue` mutates no caller state at all. That makes it directly unit-testable.

### Throw containment at the AppConfig boundary

`AppConfig.init` already wraps this loader:

```js
SecretsManagerLoader.load(options.secrets)
    .then((result) => { AppConfig._secretsResolved = result.store; resolve(true); })
    .catch((error) => { DebugAndLog.error(`Secrets initialization failed: ${error.message}`, error.stack); resolve(false); });
```

So a throw surfaces as a logged error and `AppConfig.promise()` resolving `false`, with `_secretsResolved` left unset. The process does not crash and no unhandled rejection is emitted. "Loud" here means a logged error and a false init result, which is the same containment `ParameterStoreLoader` throws into. No change is needed at the boundary.

## Data Models

Store shape is unchanged.

```js
// raw path
{ myGroup: { "myapp/db/credentials": "{\"user\":\"alice\"}" } }

// parse path
{ myGroup: { "myapp/db/credentials": { user: "alice", pass: "s3cr3t" } } }
```

`store[group]` remains a plain `{}` so consumers keep inherited methods (Req 3.5, 3.6, carried from Req 7.5 of the introducing spec).

## Algorithms

### Secret name validation

```
checkSecretName(name):
    if not non-empty string           → not-a-non-empty-string
    if length > MAX_SECRET_NAME_LENGTH → too-long
    if name in DANGEROUS_KEYS          → dangerous-key
    if name in PROTOTYPE_KEYS          → prototype-key
    if not SECRET_NAME_PATTERN.test(name) → invalid-characters
    for seg in name.split('/'):
        if seg is empty: continue
        if seg in DANGEROUS_KEYS       → dangerous-segment
        if seg in PROTOTYPE_KEYS       → prototype-segment
    → safe
```

Linear in name length, with the split bounded by check 2.

### Trailing slash scan

```
normalizePath(path):
    if path is not a string → return path unchanged
    end ← path.length
    while end > 0 and path[end-1] == '/': end ← end - 1
    return path[0..end) + '/'
```

Linear, single pass, no allocation inside the loop.

## Correctness Properties

Each becomes a fast-check property test. Numbering is local to this spec and referenced by tasks.md. Properties from the introducing spec keep their original numbers where re-asserted.

**Property A1 — Bug condition: dangerous secret name throws.** *For any* secret name in `{__proto__, constructor, prototype}`, on either the raw or the parse path, `load()` rejects, `Object.prototype` gains no own property, and no group object is reparented. **Validates: Req 1.2, 1.7, 2.5, 2.6**

**Property A2 — Bug condition: prototype-reachable secret name throws.** *For any* secret name drawn from `Object.getOwnPropertyNames(Object.prototype)`, `load()` rejects and no own property is created that shadows the inherited member. **Validates: Req 1.3, 2.4**

**Property A3 — Bug condition: dangerous segment throws.** *For any* multi-segment name with one segment in `{__proto__, constructor, prototype}` or in `PROTOTYPE_KEYS`, `load()` rejects. **Validates: Req 1.4**

**Property A4 — Preservation: safe names round-trip.** *For any* group matching the SSM key allowlist and any name matching the secret-name allowlist with no unsafe segment, the value is stored at `store[group][name]`, appears in `Object.keys(store[group])`, and survives a `JSON.stringify` / `JSON.parse` round trip. **Validates: Req 3.1-3.4, 5.4, 5.7**

**Property A5 — Preservation: ARN names round-trip.** *For any* generated Secrets Manager ARN, validation accepts it and it is stored verbatim as a single key. **Validates: Req 1.5, 5.6**

**Property A6 — No AWS call on invalid configuration.** *For any* entry containing at least one unsafe group or name, the `AWS.secrets.get` mock records zero calls. **Validates: Req 1.11**

**Property A7 — Throw escapes the retrieval handler.** *For any* unsafe name, `load()` rejects rather than resolving with the name present in `failed`. **Validates: Req 1.12**

**Property A8 — Parsed key safety, re-asserting Property 22.** *For any* JSON payload whose keys include dangerous and prototype-reachable names alongside safe ones, the safe keys are stored, the unsafe keys appear in `skipped`, `Object.prototype` is unmodified, and `load()` resolves. **Validates: Req 1.13, 2.6, 3.3**

**Property A9 — Group prototype integrity.** *For any* successful load, every created group satisfies `Object.getPrototypeOf(store[group]) === Object.prototype` and `store[group].hasOwnProperty` is the native function. **Validates: Req 3.5, 3.6**

**Property A10 — normalizePath equivalence, re-asserting Property 9.** *For any* string, the scan implementation returns exactly what `path.replace(/\/*$/, '/')` returns, ends with exactly one `/`, and is idempotent. **Validates: Req 4.4-4.6**

**Property A11 — normalizePath linearity.** For inputs of 10k, 20k, and 40k repeated slashes followed by a non-slash, elapsed time stays under the Req 4.3 bound and does not grow superlinearly. **Validates: Req 4.1-4.3**

**Property A12 — Chokepoint compliance is statically checkable.** A source scan of `SecretsManagerLoader.class.js` finds no bracket-assignment expression. **Validates: Req 2.1, 2.2**

Property A12 is a lint-style assertion over source text rather than behavior. It is included because Req 2.2 is a structural guarantee and a behavioral test cannot detect a reintroduced raw assignment that happens to be correctly guarded today.

## Error Handling

| Condition | Handling | Rationale |
|---|---|---|
| Group fails `isSafeKey` | Throw from pre-pass, before any AWS call | Req 1.8, 1.11; groups are always caller-supplied |
| Secret name fails `checkSecretName` | Throw from pre-pass, before any AWS call | Req 1.7, 1.11; matches `ParameterStoreLoader` enumerated-name handling |
| Parsed JSON key fails `isSafeKey` | `DebugAndLog.warn`, push to `skipped`, continue | Req 1.13; the key is AWS-side data, not caller configuration |
| `parseJson` on non-JSON value | `DebugAndLog.warn`, store raw string | Unchanged from Req 14.8 of the introducing spec |
| Secret has no `SecretString` | `DebugAndLog.warn`, push to `skipped` with `binary-secret` | Unchanged |
| `AWS.secrets.get` rejects | Push to `failed`, continue to next name | Unchanged |
| Throw reaches `AppConfig.init` | Logged via `DebugAndLog.error`, `promise()` resolves `false` | Existing boundary, no change |

## Testing Strategy

### Layout

```
test/security/
├── parameter-key-safety-tests.jest.mjs                    (extend: A5, A10, A11 + unit cases)
└── secrets-manager-loader-key-safety-tests.jest.mjs       (new: A1-A4, A6-A9, A12)
```

`test/security/` is the established home for this class of test, alongside the existing `parameter-key-safety-tests.jest.mjs`.

### Mocking

`SecretsManagerLoader` lazily requires `AWS` inside `load()`, so the getter-spy pattern from the test-harness steering applies:

```js
jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
    client: {}, get: mockGet, available: true, sdk: {}
});
```

A named `mockGet` is required by Property A6, which asserts the call count is zero. `jest.restoreAllMocks()` in `afterEach`.

### Isolation

Every test that could touch `Object.prototype` snapshots `Object.getOwnPropertyNames(Object.prototype)` before and diffs after, per the pattern already used in `parameter-key-safety-tests.jest.mjs`. No test spawns a process, satisfying Req 6.13.

### Timing test

Property A11 is timing-sensitive and therefore the one flake risk. Mitigations: the threshold is 50ms against a measured 632ms for the defective implementation, a >12x margin; the scan implementation measures in microseconds at 40k characters; and the assertion is a ceiling, not a ratio. A warmup call precedes measurement.

### Preservation gate

The full existing suite must pass unchanged. `test/config/parameter-secret-tests.jest.mjs`, `test/config/secrets-config-path-tests.jest.mjs`, and `test/utils/parameter-store-loader-tests.jest.mjs` exercise the touched paths and are the primary regression signal for Req 5.

## Backwards Compatibility Analysis

### Unchanged

- Every public export, signature, and return contract
- `normalizePath` output for every input
- Store shape and location for every currently-correct secret name, including multi-segment names and ARNs
- Parsed-key warn-and-skip behavior
- Binary secret and non-JSON `parseJson` handling
- `package.json` version stays 1.3.16

### Intentionally changed

| Before | After | Justification |
|---|---|---|
| Secret named `__proto__` on raw path: silently discarded, load reports success | Throws | Req 1.7; the value was never retrievable |
| Secret named `__proto__` on parse path: group prototype reparented, keys non-enumerable | Throws | Req 1.7, 2.5 |
| Secret named `toString`: own property shadows the native method | Throws | Req 1.7, 2.4 |
| Secret name containing a character outside the allowlist: stored | Throws | Req 1.6; such a name is not a valid `SecretId` and would have failed at AWS anyway |
| Unsafe group: warned and skipped, remaining names continue | Throws | Req 1.8; consistency with `ParameterStoreLoader` |

Every row is a case that is broken today. The last two are the only rows where a caller could observe a change without already being broken, and in both the previous behavior was a silent partial init.

### Not deprecating anything

No API is removed or renamed.

## Known Limitations

1. **Secret names are still not segment-split into nested groups.** Known Limitation 1 of the introducing spec stands as a design choice: `myapp/db/credentials` remains one key rather than three nested levels. What this spec removes is the *unvalidated* part of that limitation. That design document should be amended to point here so the exemption is not read as still open.
2. **`MAX_SECRET_NAME_LENGTH` is a constant, not derived from the SDK.** If AWS raises the `SecretId` limit, this constant needs a manual bump. A longer name would be rejected locally with `too-long` rather than attempted.
3. **Property A12 is a text scan.** It matches assignment syntax, not semantics, so a sufficiently indirect reintroduction (`Reflect.set`, destructuring assignment into a computed key) would evade it. It is a guardrail against the obvious regression, not a proof.

## Implementation Notes

- `SECRET_NAME_PATTERN` places `-` last inside the character class so it is a literal, not a range.
- `DANGEROUS_KEYS` stays an array with `includes` for three elements; `PROTOTYPE_KEYS` stays a `Set`. Both are already module-scope frozen constants (Req 1.8 of the introducing spec) and are reused rather than duplicated.
- The pre-pass iterates entries twice in total (validate, then retrieve). At configuration scale this is free and it buys the Req 1.11 guarantee.
- Keep `checkKey` and `isSafeKey` untouched. SSM parameter names must remain single-segment; widening them would loosen a guard that is currently correct.

## Summary

The secret-name fix restores an invariant the codebase already declared and documented, using the denylists that already exist, behind a wider allowlist scoped to the one input shape that needed it. The `normalizePath` fix is a mechanical substitution verified by differential property test. Neither touches the public API, and the only behavior changes are cases that are silently broken today.

## Related Documentation

- [requirements.md](./requirements.md)
- [REPORT.md](./REPORT.md)
- [Introducing spec design](../1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/design.md)
- [Introducing spec requirements](../1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/requirements.md)
