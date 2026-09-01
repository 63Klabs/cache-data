# Requirements Document

## Introduction

This bug fix closes two vulnerability classes reported against unreleased v1.3.16 in [REPORT.md](./REPORT.md), both introduced by [1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk](../1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/).

The first is a prototype-polluting assignment in `SecretsManagerLoader`. That spec established `ParameterKeySafety` as "the single chokepoint for externally-derived key assignment" and stated "no other code in this package may perform `obj[externalKey] = value`". `SecretsManagerLoader` violates its own contract in three places, because secret names may contain `/` and therefore fail `isSafeKey()`. Known Limitation 1 of that design documents the exemption but supplies no replacement guard, so secret names reach bracket assignment entirely unvalidated.

Three concrete defects follow from the gap, all reproduced against the current source:

- A secret named `__proto__` on the raw-string path is silently discarded. `store[group]["__proto__"] = "value"` invokes the `__proto__` setter, which ignores non-object values. The loader reports success, the credential is absent, and the consumer sees `undefined`.
- A secret named `__proto__` on the `parseJson` path replaces the prototype of the group object. `store[group]["__proto__"] = {}` reparents `store[group]`, then every parsed key is written onto that new prototype. The keys are readable by dotted access but invisible to `Object.keys()` and `JSON.stringify()`, and they leak onto the prototype chain of an object the caller believes is a plain map.
- A secret named after any `Object.prototype` member (`toString`, `valueOf`, `hasOwnProperty`) creates an own property that shadows the inherited method. `hasOwnProperty` returns false for these names, so the existing guard does not fire; `store[group].toString()` then throws `TypeError: not a function`.

Secret names originate from caller configuration rather than request input, so this is a defense-in-depth and data-integrity fix rather than a remotely reachable exploit. It still warrants correction: the failure modes are silent, they discard credentials, and `ParameterStoreLoader` already treats an equivalent unreachable-parameter condition as loud enough to throw.

The second finding is a polynomial-time regular expression in `ParameterKeySafety.normalizePath`. `path.replace(/\/*$/, '/')` is unanchored at the start, so the engine retries `\/*` at every position and backtracks through each run of slashes. Measured cost on the current source is quadratic: 48ms at 10,000 leading slashes, 167ms at 20,000, 632ms at 40,000. The method is called once per configured entry from `ParameterKeySafety.prepareEntries` and once per enumerated name from `ParameterStoreLoader.load`, on paths supplied by the caller at init time. Reachability by an untrusted party is therefore low, but the fix is a mechanical substitution with no behavioral change and removes the CodeQL finding.

Both fixes are internal to `src/lib/utils/`. No public API surface changes, no signature changes, and no observable behavior change for any input that is currently handled correctly. The version remains 1.3.16 because the introducing change is itself unreleased, so this is a correction to unreleased work rather than a patch over shipped behavior.

## Glossary

- **Key-safety chokepoint**: `ParameterKeySafety`, the module the introducing spec designated as the only permitted site of `obj[externalKey] = value`
- **Externally-derived key**: a property name sourced from AWS response data or caller configuration rather than from a literal in this package
- **Dangerous key**: any of `__proto__`, `constructor`, `prototype`
- **Prototype-reachable key**: any member of `Object.getOwnPropertyNames(Object.prototype)`, including `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`
- **Secret name**: the `SecretId` of a Secrets Manager secret, which may contain `/` and so cannot satisfy the single-segment `isSafeKey` allowlist
- **Segment**: one `/`-delimited component of a secret name or SSM parameter path
- **Raw path**: the `SecretsManagerLoader` branch taken when `parseJson` is absent or false, storing the `SecretString` verbatim
- **Parse path**: the `SecretsManagerLoader` branch taken when `parseJson` is true, nesting parsed JSON keys one level below the secret name
- **Store**: the `{ group: { secretName: value } }` object returned by `SecretsManagerLoader.load`
- **Polynomial regex**: a pattern whose match time grows as a polynomial of input length due to backtracking, per the CodeQL `js/polynomial-redos` rule

## Requirements

### Requirement 1: Secret Name Validation

**User Story:** As a Lambda function developer, I want a secret name that cannot be stored safely to fail loudly at init, so that a missing credential never surfaces as an `undefined` deep in my application.

Secret names and groups are always enumerated by the caller, never discovered from a path. A name that fails validation is therefore a configuration error the caller can fix, and it matches the condition `ParameterStoreLoader` already treats as fatal for enumerated SSM names (Req 2.1 of the introducing spec). Keys parsed out of a JSON `SecretString` are not caller-enumerated and retain warn-and-skip handling.

#### Acceptance Criteria

1. THE system SHALL validate every secret name before it is used as a property name
2. THE secret name validation SHALL reject a name that is a dangerous key
3. THE secret name validation SHALL reject a name that is a prototype-reachable key
4. THE secret name validation SHALL reject a name where any non-empty `/`-delimited segment is a dangerous key or a prototype-reachable key
5. THE secret name validation SHALL accept names containing `/`, and SHALL accept a full Secrets Manager ARN, because `SecretId` permits both
6. THE secret name validation SHALL apply an allowlist covering the Secrets Manager name character set and ARN punctuation, and SHALL reject any name containing a character outside it
7. THE secret name allowlist pattern SHALL be anchored at both ends and SHALL contain exactly one repetition, so that it cannot itself become a polynomial regex
8. THE secret name validation SHALL reject a value that is not a non-empty string
9. THE secret name validation SHALL reject a name longer than the maximum Secrets Manager `SecretId` length, so that the segment scan is bounded
7. WHEN a secret name fails validation, THE system SHALL throw an error identifying the secret name, the group, and the reason
8. WHEN a group fails validation, THE system SHALL throw an error identifying the group and the reason
9. THE thrown error SHALL state that the secret would otherwise be silently unreachable
10. THE error message SHALL NOT include the secret value
11. THE validation SHALL run before any AWS call is issued for that entry, so that a configuration error is reported without consuming a Secrets Manager request
12. THE thrown error SHALL propagate out of `load()` and SHALL NOT be captured by the per-secret retrieval error handler that populates the `failed` array
13. WHEN a key parsed from a JSON `SecretString` fails validation, THE system SHALL log a warning via `DebugAndLog.warn()`, SHALL record it in the `skipped` array with a machine-readable reason, and SHALL continue processing the remaining parsed keys

### Requirement 2: Chokepoint Compliance

**User Story:** As a maintainer, I want every externally-derived key assignment in this package to route through one audited function, so that a future loader cannot reintroduce this bug class.

#### Acceptance Criteria

1. THE assignment of a secret value into the store SHALL be performed by `ParameterKeySafety`
2. `SecretsManagerLoader` SHALL NOT contain any expression of the form `obj[externalKey] = value`
3. THE `ParameterKeySafety` assignment used for secrets SHALL test the presence of every level using `Object.prototype.hasOwnProperty.call()` and SHALL NOT use the `in` operator
4. WHEN a secret name is a prototype-reachable key, THE system SHALL NOT create an own property that shadows the inherited member
5. WHEN a secret name is a dangerous key, THE system SHALL NOT reparent the prototype of any object
6. FOR ALL secret names and all parsed JSON keys, no own property SHALL be added to `Object.prototype`
7. THE group key SHALL be validated exactly once per assignment attempt, by the `ParameterKeySafety` entry point rather than by `SecretsManagerLoader`

### Requirement 3: Stored Value Reachability

**User Story:** As a Lambda function developer, I want every secret the loader reports as stored to be reachable by ordinary enumeration, so that iterating the store and serializing it both produce the complete set.

#### Acceptance Criteria

1. WHEN the loader reports a secret as neither skipped nor failed, THE value SHALL be reachable at `store[group][secretName]`
2. FOR ALL successfully stored secrets, THE secret name SHALL appear in `Object.keys(store[group])`
3. FOR ALL successfully stored parsed keys, THE key SHALL appear in `Object.keys(store[group][secretName])`
4. FOR ALL successfully stored secrets, `JSON.parse(JSON.stringify(store))` SHALL contain the secret value
5. FOR ALL groups created by the loader, `Object.getPrototypeOf(store[group])` SHALL be `Object.prototype`
6. FOR ALL groups created by the loader, calling an inherited method such as `store[group].hasOwnProperty()` SHALL invoke the native implementation

### Requirement 4: Linear-Time Path Normalization

**User Story:** As a Lambda function developer, I want path normalization to cost time proportional to the input length, so that a pathological configuration value cannot consume the function timeout.

#### Acceptance Criteria

1. THE `normalizePath` implementation SHALL NOT use a regular expression containing an unanchored repetition
2. THE `normalizePath` execution time SHALL grow linearly with input length
3. WHEN given an input of 40,000 repeated `/` characters followed by a non-slash character, `normalizePath` SHALL complete in under 50 milliseconds
4. THE `normalizePath` return value SHALL be unchanged from the current implementation for every input
5. `normalizePath` SHALL return a value ending with exactly one `/`
6. `normalizePath` SHALL be idempotent
7. `normalizePath` SHALL return its argument unchanged when the argument is not a string

### Requirement 5: Backwards Compatibility

**User Story:** As a consumer of @63klabs/cache-data, I want this fix to change nothing I depend on, so that upgrading requires no action.

#### Acceptance Criteria

1. THE public API surface SHALL be unchanged
2. THE `SecretsManagerLoader.load` signature and return contract SHALL be unchanged
3. THE `ParameterKeySafety.normalizePath` signature SHALL be unchanged
4. FOR ALL secret names that are currently stored correctly, THE stored location and value SHALL be unchanged
5. FOR ALL configured paths currently normalized correctly, THE normalized result SHALL be unchanged
6. A secret configured by full ARN SHALL continue to be retrieved and stored verbatim under its ARN key
7. A secret configured by a multi-segment name SHALL continue to be stored verbatim as a single key, not split into nested objects
8. THE version in `package.json` SHALL remain 1.3.16

### Requirement 6: Regression Coverage

**User Story:** As a maintainer, I want each reproduced defect pinned by a test, so that a future refactor cannot reintroduce it unnoticed.

#### Acceptance Criteria

1. THE test suite SHALL assert that a secret named `__proto__` on the raw path throws rather than silently discarding the value
2. THE test suite SHALL assert that a secret named `__proto__` on the parse path throws and leaves the group prototype unchanged
3. THE test suite SHALL assert that a secret named `toString` throws and does not shadow the inherited method
4. THE test suite SHALL assert that an unsafe group name throws
5. THE test suite SHALL assert that no AWS call is issued when a name or group fails validation
6. THE test suite SHALL assert that a multi-segment secret name such as `myapp/db/credentials` is stored verbatim as a single key
7. THE test suite SHALL assert that a full Secrets Manager ARN is accepted and stored verbatim
8. THE test suite SHALL assert that an unsafe key parsed from a JSON `SecretString` is warned and skipped while sibling keys are stored
9. THE test suite SHALL include a property-based test asserting that no run of the loader adds an own property to `Object.prototype`
10. THE test suite SHALL include a property-based test asserting that every reported-stored secret is enumerable
11. THE test suite SHALL assert the `normalizePath` timing bound from Requirement 4.3
12. THE test suite SHALL assert `normalizePath` output equivalence against the previous regex implementation across generated inputs
13. THE new tests SHALL NOT invoke `npm test` or spawn a Jest process
