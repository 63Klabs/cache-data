# Requirements Document

## Introduction

`src/lib/tools/AWS.classes.js` builds its DynamoDB, S3, and SSM clients in a static class field initializer, `static #SDK`, which runs when the module is evaluated. Every `require("@63klabs/cache-data")` evaluates the module: `src/index.js` loads `src/lib/tools/index.js`, which loads `vars.js`, which loads `AWS.classes.js`. Every consumer therefore loads four AWS SDK packages and constructs three clients at import, whether or not it uses those services, and a runtime missing any of the four packages cannot load the package at all.

This feature converts the `dynamo`, `s3`, and `ssm` accessors to the lazy, memoized pattern that `AWS.secrets` already uses ([1.3.16, Requirement 8](../1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/requirements.md)). Each accessor loads its SDK package and constructs its client on first access. Accessor shapes do not change, so consumer code and the getter-spy mocks used across the test suite keep working.

Client construction is currently the only thing that initializes X-Ray at module load. `tools.AWSXRay` and `tools.AwsXRay` are captured by value when the exports are assigned, and `src/lib/tools/ApiRequest.class.js` reads `AWSXRay` during its own load to decide whether to create X-Ray subsegments. The feature therefore initializes X-Ray explicitly at module load when it is enabled, so those bindings keep receiving the initialized SDK.

The change ships in v1.4.0 as a minor release. The resulting consumer-visible behavior changes, mostly about timing, are listed under [Consumer-visible behavior changes](#consumer-visible-behavior-changes).

Decisions are recorded in the Decision Log in [PLAN.md](PLAN.md), and references such as (Q4) point there. All decisions are locked. The technical design is in [design.md](design.md).

## Glossary

- **AWS class**: the `AWS` class exported by `src/lib/tools/AWS.classes.js`, also exported as `Aws` and reachable as `tools.AWS`.
- **Package entry**: `src/index.js`, the `main` entry in `package.json`.
- **Module load**: evaluation of `src/lib/tools/AWS.classes.js`.
- **Module instance**: one evaluation of `AWS.classes.js`. Once per process in production; once per test file under Jest, which gives each test file its own module registry.
- **Service accessor**: one of the static getters `AWS.dynamo`, `AWS.s3`, `AWS.ssm`, and `AWS.secrets`.
- **Converted accessor**: `AWS.dynamo`, `AWS.s3`, or `AWS.ssm`. `AWS.secrets` is already lazy and does not change.
- **Service-client packages**: the five packages the service accessors load: `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` (dynamo), `@aws-sdk/client-s3` (s3), `@aws-sdk/client-ssm` (ssm), and `@aws-sdk/client-secrets-manager` (secrets).
- **First access**: the first read of a service accessor in a module instance.
- **Memo field**: a private static field holding one service's constructed client, helper verbs, and SDK references. `null` until that service is first constructed successfully.
- **Fresh literal**: a new object returned on every read of an accessor.
- **Getter-spy pattern**: `jest.spyOn(AWS, '<accessor>', 'get').mockReturnValue({...})`, as required by `.kiro/steering/test-harness-for-private-classes-and-methods.md`.
- **USE_XRAY**: the constant in `AWS.classes.js`, computed once at module load, that is true when `CacheData_AWSXRayOn` or `CACHE_DATA_AWS_X_RAY_ON` is truthy.
- **initializeXRay()**: the module-private, idempotent function in `AWS.classes.js` that, when `USE_XRAY` is true, requires `aws-xray-sdk-core`, applies `captureHTTPsGlobal` to `http` and `https`, and assigns the module-level `AWSXRay` binding.
- **TracingProvider**: the object returned by `getActiveTracingProvider()` in `src/lib/tools/PowertoolsInit.js`. `null` until `initPowertools()` has run.
- **instrumentClient()**: the module-private function in `AWS.classes.js` that instruments a client through the active TracingProvider, else through `AWSXRay.captureAWSv3Client()` when X-Ray is initialized, else returns it unchanged.
- **SDK v2 guard message**: `"AWS SDK v2 is no longer supported. Please upgrade to Node.js 18 or higher to use AWS SDK v3."`

## Requirements

### Requirement 1: Service-client packages load only on first access

**User Story:** As a Lambda function developer who uses only some of the package's AWS services, I want the SDK packages for the services I don't use to stay unloaded, so that my function's cold start doesn't pay for them and a package missing for an unused service can't break it.

#### Acceptance Criteria

1. THE `AWS.classes.js` module SHALL NOT require any service-client package or construct any AWS SDK client during module load.
2. THE `static #SDK` class field initializer SHALL be removed. (Q1)
3. WHEN the package entry has loaded and no service accessor has been read, THE process SHALL have loaded none of the service-client packages, with X-Ray enabled or disabled.
4. WHEN any sequence of service accessor reads has completed, THE process SHALL have loaded exactly the service-client packages of the services that were read.

> **Note:** These criteria cover only the five service-client packages, not other `@aws-sdk/*` or `@smithy/*` packages that a dependency may load. This refines the PLAN success criterion "No `@aws-sdk/*` package is `require`d..." so it stays testable.

### Requirement 2: Construction on first access and memoization

**User Story:** As a Lambda function developer, I want each client created once and reused, so that lazy loading adds no cost to later requests.

#### Acceptance Criteria

1. WHEN a converted accessor is read while its memo field is `null`, THE AWS class SHALL load that service's packages, construct its client, and populate its memo field before returning.
2. THE AWS class SHALL keep each converted service in its own private static memo field, `#dynamoSdk`, `#s3Sdk`, and `#ssmSdk`, alongside the existing `#secretsSdk`. (Q1)
3. WHILE a converted service's memo field is populated, EACH read of that accessor SHALL return the same `client` instance and the same `sdk` object, and SHALL NOT construct a client.
4. THE memo fields SHALL last for the life of the module instance, and THE AWS class SHALL NOT expose any member that resets them. (Q6)

### Requirement 3: Accessor shape and getter contract

**User Story:** As a maintainer, I want the accessor contract unchanged, so that consumer code and the getter-spy mocks across the test suite keep working without edits.

#### Acceptance Criteria

1. EACH service accessor SHALL remain a static getter on the AWS class for the life of the process and SHALL NOT be redefined as a data property after first access.
2. EACH read of a converted accessor SHALL return a fresh literal, so `AWS.dynamo !== AWS.dynamo`.
3. THE `AWS.dynamo` accessor SHALL return exactly the properties `client`, `put`, `get`, `scan`, `delete`, `update`, and `sdk`, with `sdk` containing exactly `DynamoDBClient`, `DynamoDBDocumentClient`, `GetCommand`, and `PutCommand`.
4. THE `AWS.s3` accessor SHALL return exactly `client`, `put`, `get`, and `sdk`, with `sdk` containing exactly `S3`, `GetObjectCommand`, and `PutObjectCommand`.
5. THE `AWS.ssm` accessor SHALL return exactly `client`, `getByName`, `getByPath`, and `sdk`, with `sdk` containing exactly `SSMClient`, `GetParametersByPathCommand`, and `GetParametersCommand`.
6. WHEN a helper verb is called, THE AWS class SHALL send the command shown in the table below through the memoized client and return the promise from `client.send()`.
7. A helper verb taken from one read SHALL work when called later, including after destructuring (`const { get } = AWS.dynamo; await get(params);`).
8. WHEN the getter-spy pattern is applied to a converted accessor, code that reads the accessor SHALL receive the mocked value, and restoring the spy SHALL restore the real accessor.
9. THE `AWS.secrets` accessor SHALL NOT change in shape, laziness, or its non-throwing unavailability contract.

| Accessor | Verbs | Commands sent |
|---|---|---|
| `dynamo` | `put`, `get`, `scan`, `delete`, `update` | `PutCommand`, `GetCommand`, `ScanCommand`, `DeleteCommand`, `UpdateCommand` from `@aws-sdk/lib-dynamodb` |
| `s3` | `put`, `get` | `PutObjectCommand`, `GetObjectCommand` |
| `ssm` | `getByName`, `getByPath` | `GetParametersCommand`, `GetParametersByPathCommand` |

### Requirement 4: Client construction parity

**User Story:** As a Lambda function developer, I want lazily built clients configured the same way as before, with S3 taking its region from the same source as the other services, so that upgrading changes when clients are built and not how.

#### Acceptance Criteria

1. THE dynamo client SHALL be `DynamoDBDocumentClient.from(instrumentClient(new DynamoDBClient({ region: AWS.REGION })))` with no translate configuration, so marshalling behavior is unchanged.
2. THE s3 client SHALL be an instance of the aggregated `S3` class, constructed with `{ region: AWS.REGION }` and passed through `instrumentClient()`. It SHALL NOT change to `S3Client`, because `AWS.s3.client` is public and the aggregated class also supports method-style calls such as `client.getObject()`. (Q3)
3. THE ssm client SHALL be `instrumentClient(new SSMClient({ region: AWS.REGION }))`.
4. THE region passed to each client SHALL be the value of `AWS.REGION` when that client is constructed. Because `AWS.region` caches its value on first read, every client in a module instance receives the value from the first read of `AWS.region`, `AWS.REGION`, or `AWS.INFO`. (Q3)
5. WHEN the package entry loads, THE package SHALL NOT read `AWS.region`, so the missing-`AWS_REGION` warning is emitted on the first read rather than at load. (Q3)
6. EACH converted client SHALL pass through the unchanged `instrumentClient()` exactly once, at construction. (Q5)
7. THE instrumentation applied SHALL be determined by the TracingProvider and X-Ray state at the accessor's first access, not at module load. (Q5)

### Requirement 5: X-Ray initialization at module load

**User Story:** As a Lambda function developer with X-Ray enabled, I want `tools.AWSXRay` and request tracing to keep working as before, so that lazy clients don't silently turn off my traces.

#### Acceptance Criteria

1. WHERE `USE_XRAY` is true, THE module SHALL call `initializeXRay()` during module load, before `module.exports` is assigned, independent of client construction and of whether a TracingProvider is active. (Q2)
2. WHERE `USE_XRAY` is true and `aws-xray-sdk-core` loads, THE `AWSXRay` and `AwsXRay` exports of `AWS.classes.js`, and `tools.AWSXRay` and `tools.AwsXRay`, SHALL be the initialized `aws-xray-sdk-core` object before any service accessor is read.
3. THE `AWS.XRay` getter SHALL return the result of `initializeXRay()`, which SHALL be identical (`===`) to the `AWSXRay` export. (Q2)
4. WHERE `USE_XRAY` is false, THE `AWSXRay` and `AwsXRay` exports, `tools.AWSXRay`, `tools.AwsXRay`, and `AWS.XRay` SHALL be `null`, and `AWS.classes.js` SHALL NOT load `aws-xray-sdk-core`. (Q2a)
5. IF `aws-xray-sdk-core` cannot be loaded or initialized, THEN `AWSXRay` SHALL be `null` and module load SHALL NOT throw.
6. X-Ray initialization, including `captureHTTPsGlobal` on `http` and `https`, SHALL run at most once per module instance.
7. Modules that read `AWSXRay` during their own load, including `ApiRequest.class.js`, SHALL receive the same value as `tools.AWSXRay`.

### Requirement 6: SDK v2 guard

**User Story:** As a maintainer, I want the unsupported-SDK error raised when a converted accessor is used rather than at module load, so that laziness is consistent and the actionable message is kept.

#### Acceptance Criteria

1. WHEN a converted accessor is read while its memo field is `null` and `AWS.SDK_V3` is false, THE accessor SHALL throw an `Error` whose message is exactly the SDK v2 guard message, before loading any service-client package. (Q4)
2. THE module SHALL NOT throw during module load when `AWS.SDK_V3` is false. (Q4)
3. THE `AWS.secrets` accessor SHALL NOT gain the SDK v2 guard. (Q13)

> **Note:** Through the package entry, `src/lib/tools/vars.js` loads `AWS.classes.js` and then exits the process on Node.js < 22. On Node.js < 18 that floor check now runs before the guard can fire, so the guard is reachable only when `AWS.classes.js` is required directly. It is kept as a defensive check. (Q13)

### Requirement 7: Unavailable service-client package (Q10)

**User Story:** As a Lambda function developer, I want a missing SDK package to fail only the service that needs it, loudly and where it is used, so that unrelated features keep working and the cause is obvious.

#### Acceptance Criteria

1. WHEN any or all service-client packages cannot be resolved, THE package entry SHALL load without throwing.
2. IF a converted accessor's package cannot be loaded, THEN reading that accessor SHALL throw the error raised by `require()` unchanged, including its `code` (for example `MODULE_NOT_FOUND`).
3. IF constructing a converted service throws, THEN that service's memo field SHALL remain `null`, and the next read SHALL attempt construction again.
4. WHEN one converted service's package cannot be loaded, THE other service accessors SHALL be unaffected.
5. THE converted accessors SHALL NOT gain `available` or `reason` properties.

### Requirement 8: Backwards compatibility

**User Story:** As an existing user of @63klabs/cache-data, I want to upgrade to v1.4.0 without changing my code.

#### Acceptance Criteria

1. THE exports of `AWS.classes.js` (`AWS`, `Aws`, `AWSXRay`, `AwsXRay`) and of `tools` SHALL keep their names and kinds.
2. No declaration in `types/` SHALL change type, and `npm run test:types` SHALL pass.
3. THE AWS class SHALL gain no public member. IF the full-suite run (Requirement 9.1) shows that a test needs a real client rebuilt under a changed environment, THEN a reset MAY be added only through a `TestHarness` export per `.kiro/steering/test-harness-for-private-classes-and-methods.md`, and SHALL NOT appear in `tools`, the type definitions, or user documentation. (Q6)
4. THE change SHALL ship in v1.4.0 as a minor release. (Q8)

### Requirement 9: Verification and tests

**User Story:** As a maintainer, I want the lazy behavior and the X-Ray fix covered by tests, so that a later change can't reintroduce eager loading or silently disable tracing.

#### Acceptance Criteria

1. THE full suite (`npm test`) SHALL pass with existing test files unmodified, except the one edit approved under Q14. (Q6, Q14)
2. Unit tests SHALL verify Requirements 2.3 and 3.1 through 3.8 for each converted accessor.
3. Tests in a fresh Node.js process SHALL verify Requirements 1.3 and 1.4 by inspecting the loaded-module cache.
4. A property-based test SHALL verify Requirements 1.4 and 2.3 over arbitrary sequences of service accessor reads.
5. Tests in a fresh Node.js process SHALL verify Requirement 5 with `CACHE_DATA_AWS_X_RAY_ON=true`, with `CacheData_AWSXRayOn=true`, and with both unset, without reading any service accessor.
6. Tests SHALL verify Requirement 4.2 (the S3 client's resolved region equals `AWS.REGION`) and Requirement 4.5 (with `AWS_REGION` unset, no warning at load and one warning at first construction).
7. A test SHALL verify Requirement 6.1 with `AWS.SDK_V3` forced to false before any converted accessor is read.
8. A test in a fresh Node.js process SHALL verify Requirement 7 by making a service-client package unresolvable.
9. Tests that spawn child processes SHALL use `execFile` or `execFileSync` with an argument array, set a timeout of at most 120 seconds, and never invoke `npm test`. A property test that spawns child processes SHALL use at most 10 runs; one that does not SHALL use at least 100.
10. Property tests SHALL NOT pass a `seed` option to `fc.assert`.
11. New test files SHALL follow the `*-tests.jest.mjs` and `*-property-tests.jest.mjs` naming conventions, with property tests under a `property/` directory.
12. Modified source files SHALL introduce no new ESLint errors.

Criteria 9 and 10 apply `.kiro/steering/test-execution-monitoring.md`, `.kiro/steering/secure-coding-practices.md`, and `.kiro/steering/test-requirements.md`.

### Requirement 10: Cold-start benchmark (Q7)

**User Story:** As a maintainer, I want a measured before-and-after comparison, so that the change's regression risk is justified by evidence rather than assumed.

#### Acceptance Criteria

1. A benchmark script SHALL be committed under `.kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/`.
2. THE script SHALL time three scenarios, each in a fresh Node.js process: loading the package entry; loading it and reading one converted accessor; and loading it and reading all three converted accessors.
3. THE script SHALL accept the path of the code to measure, so the same script runs against a pre-change checkout and the post-change code.
4. THE script SHALL report, per scenario, the run count, mean, and median, along with the Node.js version. The run count SHALL be configurable, with a default of at least 20.
5. THE script SHALL spawn processes without a shell, SHALL NOT match Jest's `testMatch`, and SHALL NOT run in CI. It is not published, because `.npmignore` excludes `.kiro`.
6. THE results of one run SHALL be recorded in the spec directory and reported before release. They SHALL NOT gate CI.

### Requirement 11: Documentation

**User Story:** As a developer reading the JSDoc or user docs, I want them to say when clients are created and what each accessor actually returns.

#### Acceptance Criteria

1. THE JSDoc for `AWS.dynamo`, `AWS.s3`, and `AWS.ssm` SHALL state that the SDK package is loaded and the client constructed on first access and then reused, describe the shape in Requirement 3, include `@throws` for the SDK v2 guard and for a package that can't be loaded (Q10), and include at least one `@example`.
2. THE JSDoc for `AWS.XRay` SHALL declare `@returns {object|null}`.
3. THE doc comments for `dynamo`, `s3`, and `ssm` in `types/lib/tools/index.d.ts` SHALL note lazy construction, matching the existing `secrets` comment.
4. THE `tools.AWS` section of `docs/features/tools/README.md` SHALL state that each client is created on first use and reused, and SHALL show reading an accessor at module scope to build the client during the Lambda init phase. (Q11)
5. THE class-level JSDoc of the AWS class and the `tools.AWS` section of `docs/features/tools/README.md` SHALL correct the drift listed under Q15. (Q15)
6. Modified JSDoc and documentation examples SHALL pass the existing validation tests in `test/documentation/`.
7. User documentation SHALL NOT mention `TestHarness`.

### Requirement 12: Changelog

**User Story:** As an existing user, I want the release notes to tell me what changes at runtime, so that I can check whether any of it affects my functions.

#### Acceptance Criteria

1. THE change SHALL be recorded under `## v1.4.0 (unreleased)` in `CHANGELOG.md` per `.kiro/steering/changelog-convention.md`, linking `[Spec: 1-4-0-convert-aws-to-lazy-accessors](.kiro/specs/1-4-0-convert-aws-to-lazy-accessors/)`, without modifying existing entries.
2. THE entry SHALL be under **Changed** and SHALL list each row of [Consumer-visible behavior changes](#consumer-visible-behavior-changes) as a sub-bullet.

## Consumer-visible behavior changes

| # | Change | Who is affected | Decisions |
|---|---|---|---|
| 1 | Each service's SDK package is loaded, and its client constructed, on the accessor's first read instead of at `require()` | Consumers that use only some services load less at import. For services in use the work moves to the first read, which in Lambda can move it from the init phase into the first invocation | Q1, Q11 |
| 2 | A missing service-client package fails at the accessor's first read instead of at `require()` | Runtimes missing a package for a service they don't use can now load the package | Q10 |
| 3 | The S3 client is constructed with `{ region: AWS.REGION }` | Only where `AWS_REGION` is unset, which is never in Lambda. S3 previously resolved its region from the shared config file, if any, and now uses `us-east-1`, as DynamoDB and SSM already do | Q3, Q12 |
| 4 | The region is read at first client construction instead of at `require()`, and the missing-`AWS_REGION` warning moves with it | Setting `AWS_REGION` after `require()` but before the first AWS call now takes effect. Consumers that never read an accessor no longer see the warning | Q3 |
| 5 | Instrumentation follows the TracingProvider state at first read | Only when `initPowertools()` has run before the first read. Nothing in the package calls it | Q5 |
| 6 | X-Ray is initialized at load whenever it is enabled, even if a TracingProvider is already active | Only when `initPowertools()` ran before the package loaded | Q2 |
| 7 | The SDK v2 guard fires at first accessor read instead of at `require()` | On Node.js < 18 through the package entry, the existing Node.js 22 floor in `vars.js` now exits first | Q4, Q13 |

## Traceability

| Requirement | Decision Log |
|---|---|
| 1. Service-client packages load only on first access | Q1 |
| 2. Construction on first access and memoization | Q1, Q6 |
| 3. Accessor shape and getter contract | Non-goals, Q6 |
| 4. Client construction parity | Q3, Q5, Q12 |
| 5. X-Ray initialization at module load | Q2, Q2a |
| 6. SDK v2 guard | Q4, Q13 |
| 7. Unavailable service-client package | Q10 |
| 8. Backwards compatibility | Q6, Q8 |
| 9. Verification and tests | Q6, Q6a, Q14 |
| 10. Cold-start benchmark | Q7 |
| 11. Documentation | Q11, Q15 |
| 12. Changelog | Q8 |

## Out of scope

- Changing any accessor's shape or verb names, including adding `available` or `reason` to the converted accessors.
- Adding or removing services, and AWS SDK v2 support.
- Changing `AWS.secrets`, `instrumentClient()`, `initializeXRay()`, `getTracingProvider()`, or `PowertoolsInit.js`.
- Re-reading the X-Ray environment variables after load. `USE_XRAY` stays a load-time constant.
- Removing the unused private getter `#XRayOn` and the unused function `captureHttp()`.
- Powertools activation. No module in `src/` calls `initPowertools()`, and `docs/features/tools/powertools-integration.md` uses `tools.PowertoolsInit.getState()`, which `tools` does not export. This is a candidate for a separate spec.
