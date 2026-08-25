# Requirements Document

## Introduction

This feature makes the AWS SDK a first-class retrieval path for SSM Parameter Store and Secrets Manager, so engineers can drop the `AWS-Parameters-and-Secrets-Lambda-Extension` layer dependency without losing functionality. It adds Secrets Manager support to the configuration-driven loading path, introduces a `CachedParameterSecrets.init()` that accepts path and name groupings, and detects layer availability to select a transport automatically.

Bundled with the feature is remediation of five defects in `AppConfig._getParametersFromStore`, four of which are live in v1.3.16. Two are data-loss bugs discovered during planning: `GetParameters` rejects when given more than 10 names, and `GetParametersByPath` silently returns only the first 10 parameters because `NextToken` is never followed. The remediation is bundled rather than released separately because the new code paths reuse the same grouping and dynamic-key-assignment logic, and fixing it once in a shared utility prevents reintroducing the bug class for Secrets Manager data.

Both existing implementations are fully preserved. The Lambda layer remains supported and preferred when present, individual `CachedSsmParameter` / `CachedSecret` construction is unchanged, and no public signature changes. The one intentional behavior change is that consumers without the layer installed now receive working values instead of `null`, which introduces new IAM requirements.

The three-layer method seam `_initParameters()` → `_getParameters()` → `_getParametersFromStore()` is retained with identical signatures and return contracts, marked deprecated in favor of the new public API but plumbed through to the new implementation. This keeps the documented subclass pattern working unchanged and means consumers on that pattern receive the pagination, batching, and key-safety fixes without touching their code.

Consequently this work supersedes only clause 4 of Requirement 9 of [1-3-9-appconfig-async-init-optimization](../1-3-9-appconfig-async-init-optimization/requirements.md) — "THE SSM parameters initialization behavior SHALL be identical to the current implementation" — which no bug fix to that path can satisfy. Clauses 1 through 3 of that requirement remain satisfied.

## Glossary

- **Layer Implementation**: retrieval via the AWS-provided `AWS-Parameters-and-Secrets-Lambda-Extension` Lambda layer, reached over `http` on `localhost:2773`
- **SDK Implementation**: retrieval via AWS SDK v3 clients (`@aws-sdk/client-ssm`, `@aws-sdk/client-secrets-manager`) using the Lambda execution role
- **Config SSM Parameter Implementation**: the configuration-driven path entered through `AppConfig.init({ ssmParameters })`, defined in `src/lib/tools/index.js`
- **Transport**: the mechanism used for a single retrieval, either Layer or SDK
- **Availability State**: process-wide tri-state record of whether the Layer is reachable (`unknown`, `available`, `unavailable`)
- **Paramstore**: the `{ group: { name: value } }` object returned by `_getParametersFromStore`
- **Group**: the caller-supplied key under which a set of parameters or secrets is collected
- **Enumerated name**: a parameter or secret name explicitly listed in a `names` array by the caller
- **Path-discovered name**: a parameter name learned by querying a path, not listed by the caller
- **Dangerous key**: any of `__proto__`, `constructor`, `prototype`
- **Prototype-reachable key**: any member of `Object.getOwnPropertyNames(Object.prototype)`, which includes `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`
- **Wrapper shape**: the value envelope `sync_getValue()` inspects, either `{Parameter: {Value}}` for SSM or `{SecretString}` for Secrets Manager
- **Key-safety utility**: the internal module in `src/lib/utils/` centralizing key validation and grouped assignment
- **Registry**: the process-global array of `CachedParameterSecret` instances held by `CachedParameterSecrets`

## Requirements

### Requirement 1: Prototype-Reachable Key Safety

**User Story:** As a Lambda function developer, I want parameter and secret values stored only as own properties of plain objects, so that retrieved credentials never leak onto shared built-in objects and are never silently dropped.

#### Acceptance Criteria

1. THE grouped assignment logic SHALL test group presence using `Object.prototype.hasOwnProperty.call(store, group)` and SHALL NOT use the `in` operator
2. WHEN a group name is a prototype-reachable key, THE system SHALL create a new own property for that group rather than resolving to the inherited member
3. FOR ALL group names that are prototype-reachable keys, no property SHALL be written to any built-in object, including `Object.prototype` and any function reachable from it
4. WHEN a group name is a prototype-reachable key AND the parameter is otherwise valid, THE returned paramstore SHALL expose that group via `Object.keys()`
5. THE system SHALL reject any group or name matching a dangerous key
6. THE system SHALL reject any group or name that fails the allowlist pattern `/^[a-zA-Z0-9_.-]+$/`
7. THE dangerous key denylist SHALL be retained in addition to the allowlist, because `__proto__` satisfies the allowlist pattern
8. THE dangerous key list SHALL be declared once at module scope and SHALL NOT be allocated inside iteration

### Requirement 2: Rejected Key Reporting

**User Story:** As a Lambda function developer, I want a loud failure when a credential I explicitly asked for cannot be stored, so that a missing secret does not surface later as an undefined value deep in my application.

#### Acceptance Criteria

1. WHEN an enumerated name fails key validation, THE system SHALL throw an error identifying the rejected group and name
2. WHEN a group supplied by the caller fails key validation, THE system SHALL throw an error identifying the rejected group
3. WHEN a path-discovered name fails key validation, THE system SHALL log a warning via `DebugAndLog.warn()` identifying the rejected group and name, SHALL skip that parameter, and SHALL continue processing remaining parameters
4. THE warning and error messages SHALL NOT include the parameter or secret value
5. WHEN a path-discovered name is skipped, THE remaining parameters in the same response SHALL still be stored

### Requirement 3: Path Mismatch Resilience

**User Story:** As a Lambda function developer, I want a parameter whose group cannot be resolved to produce a diagnosable warning rather than taking down my entire configuration init.

#### Acceptance Criteria

1. WHEN the derived group path matches no configured entry, THE system SHALL NOT throw a `TypeError`
2. WHEN the derived group path matches no configured entry, THE system SHALL log a warning identifying the unmatched parameter name and derived path, and SHALL skip that parameter
3. THE system SHALL normalize every caller-supplied `path` to end with a single `/` before use
4. WHEN a caller supplies a path without a trailing slash, THE parameters under that path SHALL be retrieved and grouped correctly
5. FOR ALL responses containing a mix of matched and unmatched parameters, THE matched parameters SHALL be stored

### Requirement 4: Name Batching

**User Story:** As a Lambda function developer, I want to request any number of parameters by name, so that my configuration is not silently capped by an AWS API limit.

#### Acceptance Criteria

1. THE system SHALL partition enumerated names into chunks of at most 10 before calling `GetParameters`
2. WHEN more than 10 names are requested, THE system SHALL issue multiple `GetParameters` calls and SHALL combine all results
3. FOR ALL name counts N, THE system SHALL request and return all N parameters that exist
4. THE system SHALL issue chunked calls in parallel subject to a concurrency limit
5. WHEN a requested name does not exist, THE system SHALL treat the `InvalidParameters` entry in the response as a missing parameter and SHALL log a warning rather than throwing

### Requirement 5: Path Pagination

**User Story:** As a Lambda function developer, I want every parameter under a configured path to be retrieved, so that adding an eleventh parameter does not silently break my application.

#### Acceptance Criteria

1. THE system SHALL set `MaxResults` to 10 explicitly on every `GetParametersByPath` request
2. WHEN a `GetParametersByPath` response includes a `NextToken`, THE system SHALL issue a subsequent request with that token
3. THE system SHALL continue following `NextToken` until a response omits it
4. FOR ALL parameter counts N under a path, THE system SHALL return all N parameters
5. THE system SHALL combine parameters from all pages into a single result set before grouping

### Requirement 6: Recursive Path Retrieval

**User Story:** As a Lambda function developer, I want to retrieve parameters organized in a nested hierarchy under one configured path, so that I can group related configuration without flattening my parameter names.

#### Acceptance Criteria

1. THE system SHALL support `Recursive` as an opt-in per-entry option on path-based configuration
2. THE `Recursive` option SHALL default to false
3. WHEN `Recursive` is enabled, THE system SHALL set `Recursive: true` on the `GetParametersByPath` request
4. WHEN resolving a returned parameter to its group, THE system SHALL select the configured entry whose normalized path is the longest prefix of the parameter name
5. WHEN a returned parameter name is deeper than the configured path, THE system SHALL derive the name from the path segments below the matched prefix
6. THE derived name SHALL pass key validation per Requirement 1 for every path segment it contains
7. THE documentation SHALL state that AWS grants transitive read access under recursive path queries, so a principal permitted on a path can read parameters beneath it even when IAM explicitly denies the deeper parameter

### Requirement 7: Shared Key-Safety Utility

**User Story:** As a maintainer, I want key validation and grouped assignment implemented once in a single internal module, so that new retrieval paths cannot reintroduce the same class of defect independently.

#### Acceptance Criteria

1. THE key-safety utility SHALL be located in `src/lib/utils/`
2. THE key-safety utility SHALL NOT be exported from `src/index.js` or `src/lib/tools/index.js`
3. THE key-safety utility SHALL be documented with the `@private` JSDoc tag
4. THE key-safety utility SHALL provide key validation, grouped assignment, path normalization, and group-and-name derivation
5. THE returned paramstore structure SHALL use plain object literals so that consumers may call inherited methods on it
6. THE internal accumulators used during retrieval SHALL use `Object.create(null)`
7. `AppConfig._getParametersFromStore` SHALL delegate to the key-safety utility rather than performing its own key assignment
8. ALL new retrieval paths introduced by this feature SHALL delegate to the key-safety utility

### Requirement 8: Secrets Manager SDK Accessor

**User Story:** As a Lambda function developer, I want the package to expose a Secrets Manager client through the same interface as its other AWS clients, so that secret retrieval is consistent with existing usage.

#### Acceptance Criteria

1. THE `AWS` class SHALL expose a `secrets` accessor returning an object with `client`, a retrieval verb, and `sdk` properties, matching the shape of the existing `ssm` accessor
2. THE `secrets` accessor SHALL retrieve a secret value using `GetSecretValueCommand`
3. THE Secrets Manager SDK package SHALL be required lazily on first access to the `secrets` accessor, not at module load
4. THE Secrets Manager `require` SHALL be wrapped so that an absent package does not throw at module load for consumers that never access the accessor
5. WHEN the Secrets Manager SDK package is absent, THE accessor SHALL report unavailability with a diagnosable reason rather than throwing an unhandled error
6. THE Secrets Manager client SHALL be constructed once and memoized
7. THE Secrets Manager client SHALL be constructed with the region from `AWS.REGION`
8. THE Secrets Manager client SHALL be passed through `instrumentClient()` so Powertools and X-Ray instrumentation are applied
9. `@aws-sdk/client-secrets-manager` SHALL be added to `devDependencies` only and SHALL NOT be added to runtime `dependencies`
10. THE existing `dynamo`, `s3`, and `ssm` accessors SHALL remain eagerly constructed and SHALL NOT change behavior

### Requirement 9: Layer Availability Detection

**User Story:** As a Lambda function developer, I want the package to determine on its own whether the Parameters and Secrets extension is available, so that I do not have to configure which transport to use.

#### Acceptance Criteria

1. THE system SHALL maintain a process-wide availability state with values `unknown`, `available`, and `unavailable`
2. THE system SHALL evaluate an explicit configuration override before any heuristic or probe
3. WHEN no override is supplied, THE system SHALL apply an environment heuristic before probing
4. WHEN `AWS_SESSION_TOKEN` is absent or empty, THE system SHALL set availability to `unavailable` without issuing a request
5. THE system SHALL read the extension port from `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT` when set, falling back to the existing `CachedParameterSecret.port` default of `"2773"`
6. THE public static `CachedParameterSecret.hostname` and `CachedParameterSecret.port` SHALL remain writable for backwards compatibility
7. WHEN the heuristic is inconclusive, THE system SHALL determine availability from the outcome of the first retrieval attempt
8. WHEN a connection is refused, THE system SHALL set availability to `unavailable`
9. THE availability state SHALL be evaluated at most once per process unless an explicit refresh is requested
10. FOR ALL subsequent retrievals after availability is determined, THE system SHALL NOT re-probe the extension

### Requirement 10: Layer Request Failure Diagnosis

**User Story:** As a maintainer, I want the extension request to distinguish between connection refusal, an HTTP error response, and a malformed body, so that transport selection is based on the actual failure and not a single ambiguous null.

#### Acceptance Criteria

1. THE extension request SHALL return a result that distinguishes success from failure and identifies the failure reason
2. THE extension request SHALL inspect the HTTP status code
3. WHEN the extension returns a non-2xx status, THE system SHALL treat the response as a failure even when the body parses as JSON
4. WHEN a connection error occurs, THE system SHALL preserve the error code so that connection refusal is distinguishable
5. WHEN the response body cannot be parsed, THE system SHALL report a parse failure distinct from a connection failure
6. THE extension request SHALL NOT throw; it SHALL resolve with a result in all cases
7. THE system SHALL configure an explicit request timeout so that the existing timeout handler is reachable

### Requirement 11: SDK Fallback for Cached Parameters and Secrets

**User Story:** As a Lambda function developer, I want `CachedSsmParameter` and `CachedSecret` to work without the Lambda layer installed, so that I can remove the layer from my template without changing my application code.

#### Acceptance Criteria

1. WHEN availability is `unavailable`, THE system SHALL retrieve values using the SDK Implementation
2. WHEN availability is `available`, THE system SHALL retrieve values using the Layer Implementation
3. `CachedSsmParameter` SHALL retrieve via `AWS.ssm.getByName()` with `WithDecryption` enabled when using the SDK Implementation
4. `CachedSecret` SHALL retrieve via `AWS.secrets` when using the SDK Implementation
5. THE SDK Implementation SHALL normalize its result to the wrapper shape `{Parameter: {Value}}` for SSM parameters
6. THE SDK Implementation SHALL produce a value satisfying `"SecretString" in value` for secrets
7. FOR ALL values retrievable by both transports, `getValue()` SHALL return an identical string regardless of transport
8. FOR ALL values retrieved by either transport, `isValid()` SHALL return true and `sync_getValue()` SHALL return the value
9. THE SDK Implementation SHALL attempt retrieval once and SHALL rely on the AWS SDK's own retry strategy
10. THE Layer Implementation SHALL retain its existing retry count of 3
11. WHEN a requested SSM parameter is returned in `InvalidParameters`, THE system SHALL treat the value as unresolved and SHALL set cache status to -1
12. `refresh()` SHALL continue to resolve rather than reject, SHALL resolve `1` on success and `-1` on failure, and SHALL continue to deduplicate concurrent calls through `cache.promise`
13. THE `Timer` instrumentation in `refresh()` SHALL be preserved

### Requirement 12: CachedParameterSecrets Initialization

**User Story:** As a Lambda function developer, I want to declare all my parameters and secrets in one configuration object, so that setup matches how I already configure connections and validations.

#### Acceptance Criteria

1. `CachedParameterSecrets` SHALL expose an `init()` method
2. `init()` SHALL accept an options object with separate `ssmParameters` and `secrets` keys
3. `init()` SHALL accept the same entry shape used by `AppConfig.init({ ssmParameters })` so that one configuration object can be supplied to both
4. `init()` SHALL accept entries specifying a path with a `names` array and entries specifying a path alone
5. `init()` SHALL return a promise so that the caller may register it via `AppConfig.add()`
6. `init()` SHALL construct and register a `CachedSsmParameter` for each resolved SSM parameter name
7. `init()` SHALL construct and register a `CachedSecret` for each resolved secret name
8. WHEN an entry specifies a path without names, `init()` SHALL discover the names by querying the path
9. WHEN `init()` is called with a name already present in the registry, THE system SHALL NOT create a duplicate registry entry
10. `init()` SHALL validate every resolved name per Requirement 1 and SHALL apply the reporting rules of Requirement 2

### Requirement 13: Registry Inspection and Reset

**User Story:** As a Lambda function developer, I want to inspect which transport is in use and what has been registered, so that I can diagnose configuration and permission problems without adding logging.

#### Acceptance Criteria

1. `CachedParameterSecrets` SHALL expose an `info()` method
2. `info()` SHALL report the current availability state
3. `info()` SHALL report the resolved extension hostname and port
4. `info()` SHALL report the transport selected for retrieval
5. `info()` SHALL report the registered names and their resolution status
6. `info()` SHALL NOT include any parameter or secret value
7. `CachedParameterSecrets` SHALL expose a method to clear the registry
8. THE clear method SHALL reset the registry to empty so that tests can establish a known state
9. `CachedParameterSecrets.prime()` SHALL continue to resolve a boolean, and its JSDoc `@returns` SHALL be corrected to match

### Requirement 14: Secrets Manager in the Configuration Path

**User Story:** As a Lambda function developer, I want to load Secrets Manager secrets through `AppConfig.init()` the same way I load SSM parameters, so that all my configuration arrives through one mechanism.

#### Acceptance Criteria

1. `AppConfig.init()` SHALL accept a new `options.secrets` key
2. THE `options.secrets` entries SHALL accept a group with a list of secret names
3. WHEN `options.secrets` is provided, THE system SHALL retrieve each secret and store it under its group
4. THE system SHALL store each secret value as a raw string by default
5. THE system SHALL accept an opt-in per-entry option to parse a secret value as JSON
6. WHEN JSON parsing is enabled for an entry, THE parsed keys SHALL be nested under the secret name within the group, producing `store[group][secretName][key]`
7. WHEN JSON parsing is enabled, EVERY key produced by parsing SHALL be validated per Requirement 1 before assignment
8. WHEN JSON parsing is enabled AND the value is not valid JSON, THE system SHALL log a warning and SHALL store the raw string
9. THE secrets initialization SHALL execute in parallel with other `AppConfig.init()` operations
10. THE secrets initialization SHALL complete before `AppConfig.promise()` resolves

### Requirement 15: Resolved Value Accessors

**User Story:** As a Lambda function developer, I want to read the parameters and secrets that `AppConfig.init()` loaded, so that the configuration option is usable without reaching into internals.

#### Acceptance Criteria

1. `AppConfig` SHALL expose a `parameters()` method returning the resolved paramstore
2. `AppConfig` SHALL expose a `secrets()` method returning the resolved secrets store
3. `parameters()` and `secrets()` SHALL be synchronous
4. WHEN initialization has not completed, `parameters()` and `secrets()` SHALL return null
5. WHEN `AppConfig.promise()` has resolved, `parameters()` SHALL return the paramstore that `_initParameters()` produced
6. THE accessors SHALL follow the pattern established by `settings()` and `connections()`

### Requirement 16: Configuration Path Error Containment

**User Story:** As a Lambda function developer, I want a parameter store failure to be reported without aborting my entire configuration init, so that one bad path does not prevent unrelated configuration from loading.

#### Acceptance Criteria

1. WHEN `options.ssmParameters` initialization fails, THE system SHALL catch the error within the promise
2. WHEN `options.ssmParameters` initialization fails, THE system SHALL log the error via `DebugAndLog.error()`
3. THE promise registered for `options.ssmParameters` SHALL resolve rather than reject
4. THE promise registered for `options.secrets` SHALL resolve rather than reject
5. WHEN parameter initialization fails, `AppConfig.promise()` SHALL still resolve
6. THE error containment behavior SHALL match that of the `settings`, `connections`, `validations`, and `responses` options

### Requirement 17: Backwards Compatibility

**User Story:** As an existing user of @63klabs/cache-data, I want my current code to keep working after upgrading, so that adopting this version requires no changes on my part.

#### Acceptance Criteria

1. THE constructors of `CachedParameterSecret`, `CachedSsmParameter`, and `CachedSecret` SHALL continue to accept any name value without throwing, including null, undefined, empty string, number, object, and array
2. `getName()` SHALL continue to return the raw value supplied to the constructor
3. `sync_getValue()` SHALL continue to throw an error containing `"CachedParameterSecret Error"` when the value is unresolved
4. `toString()` and `toJSON()` SHALL continue to return `[Pending: <name>]` when unresolved and SHALL equal `sync_getValue()` when resolved
5. THE `CachedSSMParameter` deprecated alias SHALL continue to resolve to `CachedSsmParameter`
6. `AppConfig.init()` SHALL remain synchronous and SHALL continue to return a boolean
7. THE public signatures of all currently exported classes and methods SHALL remain unchanged
8. `ConnectionAuthentication` basic auth SHALL continue to produce a correct header when a cached parameter is supplied as a password and has been resolved
9. WHEN the Layer Implementation is available, retrieval behavior SHALL be identical to the previous version
10. THE `refreshAfter` option SHALL continue to accept and store any integer value, including zero and negative values

### Requirement 18: Legacy Method Seam Preservation

**User Story:** As an existing user who loads parameters via the documented subclass pattern, I want my `_initParameters()` call to keep working exactly as before while picking up the pagination and key-safety fixes, so that I get the benefit of this release without changing any code.

#### Acceptance Criteria

1. `AppConfig._initParameters(parameters)` SHALL retain its current signature, accepting an array of parameter location entries
2. `AppConfig._initParameters(parameters)` SHALL continue to return a promise resolving to the paramstore, and SHALL NOT resolve to a boolean or a wrapper object
3. `AppConfig._getParameters(parameters)` SHALL be retained with its current signature and return contract
4. `AppConfig._getParametersFromStore(parameters)` SHALL be retained with its current signature and SHALL continue to return the `{ group: { name: value } }` paramstore
5. THE three methods SHALL delegate to the new implementation so that callers receive the Requirement 1 through 6 fixes
6. THE three methods SHALL be marked `@deprecated` in JSDoc, directing callers to `AppConfig.init({ ssmParameters })` with `AppConfig.parameters()`
7. WHEN a deprecated method is called, THE system SHALL log a deprecation notice at most once per process to avoid log volume in high-traffic functions
8. `AppConfig._ssmParameters` SHALL continue to resolve to the paramstore, preserving the existing internal contract
9. THE promise registered via `AppConfig.add()` for `options.ssmParameters` SHALL be a derived promise that contains errors per Requirement 16, leaving `_ssmParameters` itself unwrapped
10. WHEN parameter retrieval fails, THE derived registered promise SHALL resolve while `_ssmParameters` retains its original rejection behavior, and no unhandled rejection SHALL be emitted
11. THE existing `test/config/appconfig-async-init-*` tests SHALL pass without modification, including the assertion that `await AppConfig._ssmParameters` equals the paramstore and the practice of mocking via direct assignment to `AppConfig._initParameters`
12. THE new resolved-value fields SHALL be declared alongside the existing `_settings` and `_connections` static fields

### Requirement 19: Type Definitions

**User Story:** As a TypeScript consumer, I want type definitions for every new public member, so that my build does not break and I get correct autocomplete.

#### Acceptance Criteria

1. THE type definitions SHALL declare the `AWS.secrets` accessor and its return shape
2. THE type definitions SHALL declare `CachedParameterSecrets.init()`, `info()`, and the registry clear method
3. THE type definitions SHALL declare `AppConfig.parameters()` and `AppConfig.secrets()`
4. THE type definitions SHALL declare the `options.secrets` key on `AppConfig.init()`
5. THE type definitions SHALL declare the `Recursive` and JSON-parsing entry options
6. `npm run test:types` SHALL pass
7. THE internal key-safety utility SHALL NOT appear in the public type definitions

### Requirement 20: Documentation

**User Story:** As a Lambda function developer, I want documentation covering both transports and the permissions each requires, so that I can decide whether to drop the layer and know what IAM changes that entails.

#### Acceptance Criteria

1. ALL new public methods and accessors SHALL have JSDoc including a description, `@param`, `@returns`, at least one `@example`, and `@throws` where applicable
2. THE JSDoc parameter names SHALL match the implementation signatures exactly
3. THE documentation SHALL compare the Layer and SDK Implementations, including their tradeoffs
4. THE documentation SHALL list the IAM actions the SDK Implementation requires, including `ssm:GetParameters`, `ssm:GetParametersByPath`, `secretsmanager:GetSecretValue`, and `kms:Decrypt`
5. THE documentation SHALL provide guidance for migrating away from the Lambda layer
6. THE changelog SHALL record the SDK fallback under Added with an explicit note that IAM permission changes are required
7. THE changelog SHALL record the pagination, batching, and key-safety fixes under Fixed
8. THE changelog SHALL record the `_initParameters()`, `_getParameters()`, and `_getParametersFromStore()` deprecations under Deprecated, noting they remain fully supported and now carry the fixes
9. THE changelog SHALL be added under an unreleased v1.3.16 section and SHALL reference this spec

### Requirement 21: Test Coverage

**User Story:** As a maintainer, I want the previously untested retrieval paths covered, so that the defects fixed here cannot silently return.

#### Acceptance Criteria

1. THE test suite SHALL provide a reusable mock for the extension HTTP request covering success, connection refusal, timeout, non-2xx with a JSON body, and malformed JSON
2. THE test suite SHALL provide reusable mocks for `AWS.ssm` and `AWS.secrets` using getter spies, returning complete objects
3. THE SSM mocks SHALL include paginated responses with `NextToken` and responses containing `InvalidParameters`
4. THE dangerous-key property test generators SHALL be extended to cover all of `Object.getOwnPropertyNames(Object.prototype)`
5. THE test suite SHALL verify that no built-in object gains a property during any retrieval
6. THE test suite SHALL verify transport equivalence for values retrievable by both Layer and SDK
7. THE test suite SHALL verify pagination for more than 10 parameters under a path
8. THE test suite SHALL verify batching for more than 10 enumerated names
9. THE tests SHALL establish a known registry state, either via the clear method or subprocess isolation
10. ALL existing tests SHALL pass without modification, in particular the four `test/config/appconfig-async-init-*` files and the cached parameter `toString` preservation property tests
11. THE test suite SHALL include a regression test asserting that a rejecting parameter load does not emit an unhandled rejection while `AppConfig.promise()` still resolves
12. THE tests SHALL NOT invoke `npm test` from within a test file
13. THE tests SHALL be Jest files using the `.jest.mjs` extension

### Requirement 22: Prior Version Deprecation

**User Story:** As a package maintainer, I want versions carrying the unremediated prototype pollution flagged on npm, so that consumers on those versions are directed to a fixed release.

#### Acceptance Criteria

1. THE v1.1.x and v1.2.x version ranges SHALL be marked deprecated on npm
2. THE deprecation message SHALL direct consumers to version 1.3.10 or later
3. THE deprecation SHALL NOT alter the availability of those versions for existing installations

## Requirement Traceability

| Requirement | Plan workstream | Decisions applied |
|---|---|---|
| 1. Prototype-reachable key safety | WS-0, WS-1 | Q2 keep both denylist and allowlist |
| 2. Rejected key reporting | WS-0, WS-1 | Q3 throw for enumerated, warn for discovered |
| 3. Path mismatch resilience | WS-0 | — |
| 4. Name batching | WS-7 | — |
| 5. Path pagination | WS-7 | Q19 explicit `MaxResults: 10` |
| 6. Recursive path retrieval | WS-7, WS-1 | Q5 recursive required |
| 7. Shared key-safety utility | WS-1 | Q4 `{}` returned, `Object.create(null)` internal |
| 8. Secrets Manager SDK accessor | WS-2 | Q8 present but guarded, Q10 only secrets lazy |
| 9. Layer availability detection | WS-3 | Q11 heuristic then probe with override |
| 10. Layer request failure diagnosis | WS-3 | — |
| 11. SDK fallback | WS-4 | Q12 SDK retry of 1 |
| 12. CachedParameterSecrets init | WS-5 | Q13 separate keys, Q14 returns promise |
| 13. Registry inspection and reset | WS-5 | Q9 public `info()` |
| 14. Secrets in configuration path | WS-6 | Q15 new key, Q6 nest, Q17 raw by default |
| 15. Resolved value accessors | WS-6 | Q18 sync getter populated on resolve |
| 16. Configuration path error containment | WS-6 | Q16 wrap to match siblings |
| 17. Backwards compatibility | All | C1 through C4 |
| 18. Legacy method seam preservation | WS-6 | Q18 via derived promise, keeps `_ssmParameters` unwrapped |
| 19. Type definitions | WS-8 | C6 |
| 20. Documentation | WS-8 | Q20 Added plus IAM note |
| 21. Test coverage | All | — |
| 22. Prior version deprecation | — | Q7 deprecate 1.1.x and 1.2.x |

## Out of Scope

- Writing parameters or secrets. This feature is read-only.
- Secret rotation handling beyond honoring `refreshAfter`.
- Deprecating or removing the Layer Implementation.
- Caching parameters or secrets in the DynamoDB or S3 cache.
- Converting the `dynamo`, `s3`, and `ssm` accessors to lazy initialization. Deferred to [1-3-x-convert-aws-to-lazy-accessors](../1-3-x-convert-aws-to-lazy-accessors/SPEC.md).
- AWS SDK v2 support.

## Related Documentation

- [SPEC.md](SPEC.md) - Original feature intent
- [PLAN.md](PLAN.md) - Workstreams, sequencing, and answered design questions
- [FINDINGS.md](FINDINGS.md) - Security evaluation that sourced Requirements 1 through 3
- [1-3-9-appconfig-async-init-optimization](../1-3-9-appconfig-async-init-optimization/requirements.md) - Requirement 9 clause 4 superseded here; clauses 1 through 3 remain satisfied per Requirement 18
- [1-3-10-security-fixes-for-tests](../1-3-10-security-fixes-for-tests/) - Original CWE-471 remediation extended by Requirement 1
- [1-3-12-connections-info-cached-ssm-param-error](../1-3-12-connections-info-cached-ssm-param-error/) - `toString` and `toJSON` contract preserved by Requirement 17
