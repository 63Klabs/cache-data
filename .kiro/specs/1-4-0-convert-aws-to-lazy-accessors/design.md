# Design Document

## Overview

This design takes all AWS SDK work out of module load in `src/lib/tools/AWS.classes.js`. The eager `static #SDK` initializer is deleted. Each converted accessor (`dynamo`, `s3`, `ssm`) gets a private memo field and a private builder: the getter builds on first read, memoizes, and returns a fresh literal from the memo on every read. That is the pattern `AWS.secrets` already follows. Client construction was the only thing that initialized X-Ray at load, so the module now calls `initializeXRay()` explicitly before `module.exports` when X-Ray is enabled.

Production code changes are confined to `AWS.classes.js`. The rest is new tests, documentation, doc-comment-only edits to the type definitions, a one-line edit to an obsolete migration test (Q14), a benchmark script, and the CHANGELOG entry.

Requirement numbers refer to [requirements.md](requirements.md); Q numbers refer to the Decision Log in [PLAN.md](PLAN.md).

## Design goals

1. **The accessor contract doesn't move.** Each accessor stays a static getter that returns a fresh literal with the same properties, so every existing getter-spy test passes unmodified (Req 3, 9.1).
2. **Laziness and failure are per service.** Reading one accessor loads only that service's packages, and a failure in one service can't affect another (Req 1, 7).
3. **X-Ray at import is preserved.** `tools.AWSXRay` and the binding `ApiRequest.class.js` captures keep receiving the initialized SDK (Req 5).
4. **Clients are built exactly as today**, except that S3 gets a region (Req 4).
5. **No new public surface.** No new exports, members, or types (Req 8).

## Pre-design measurements

These were run on the development machine (Node.js 24.13.0) against the installed devDependencies to settle questions the test design depends on. The timings are indicative only; the Requirement 10 benchmark produces the real numbers.

| Finding | Consequence for the design |
|---|---|
| A cold `require()` of each package in a fresh process took 31 to 59 ms: `client-dynamodb` 59, `lib-dynamodb` 37, `client-s3` 43, `client-ssm` 42, `client-secrets-manager` 31 | The cost moved to first read is tens of milliseconds per service, which the benchmark quantifies for Q11 |
| `@aws-sdk/lib-dynamodb` loads `@aws-sdk/client-dynamodb`. `aws-xray-sdk-core` loads none of the five service-client packages | The dynamo service owns both packages, and Req 1.3 holds with X-Ray enabled |
| SDK command objects keep a reference to their input (`new GetObjectCommand(p).input === p`) | Tests verify the verb-to-command mapping by spying on `client.send` and checking `constructor.name` and `input` |
| The aggregated `S3` instance is `instanceof S3Client` and has method-style calls such as `getObject` | The reason Req 4.2 keeps `S3` is testable |
| `await client.config.region()` resolves on `S3`, `SSMClient`, and the DynamoDB document client | Region parity is testable in process |
| `DynamoDBDocumentClient.from(base).config.translateConfig` is `undefined` | Req 4.1's "no translate configuration" is testable |
| `captureAWSv3Client` adds an `XRaySDKInstrumentation` middleware, visible through the document client's `middlewareStack` too | X-Ray instrumentation is observable on all three clients |
| `captureHTTPsGlobal` keeps the original as `http.__request` and does not re-wrap on a second call | "At most once" (Req 5.6) has to be measured by counting calls, not by inspecting `http.request` |
| The `aws-xray-sdk-core` exports are reassignable, and `AWS.classes.js` gets the same cached module object | A child process can count `captureHTTPsGlobal` and `captureAWSv3Client` calls |
| Wrapping `Module._resolveFilename` makes a chosen package throw `MODULE_NOT_FOUND`, and restoring it makes the package load again | A child process can simulate a missing package and then its recovery |
| `process.versions.node` can be redefined in a child before the module loads | The real SDK v2 guard path is exercisable on Node.js 24 |
| With `AWS_REGION` unset and `AWS_CONFIG_FILE` naming a file with `region = eu-west-3`, an `S3` built without a region resolves `eu-west-3`, and one built with `{ region: "us-east-1" }` resolves `us-east-1` | Behavior change 3 (Q12) is testable directly with a static shared-config fixture |
| `npm pack --dry-run` lists no `.kiro/` or `test/` paths | The benchmark and the test fixtures aren't published (Req 10.5) |
| ESLint baseline: `AWS.classes.js` has 4 errors (two unused `catch` bindings, unused `captureHttp`, unused `#XRayOn`). Existing test files report `no-undef` for `expect` | Req 9.12 means `AWS.classes.js` stays at 4 or fewer, and new files are clean by importing from `@jest/globals` and `node:*` |
| The `AWS` class's own property names today: `INFO`, `NODE_VER`, `NODE_VER_ARRAY`, `NODE_VER_MAJOR`, `NODE_VER_MAJOR_MINOR`, `NODE_VER_MINOR`, `NODE_VER_PATCH`, `REGION`, `SDK_V2`, `SDK_V3`, `SDK_VER`, `XRay`, `dynamo`, `length`, `name`, `nodeVersionArray`, `prototype`, `region`, `s3`, `secrets`, `ssm` | The snapshot for the "no new public member" test (Req 2.4, 8.3) |

## Architecture

### Current

```
require("@63klabs/cache-data")
  src/index.js → src/lib/tools/index.js → vars.js → AWS.classes.js
    class AWS
      static #SDK = (function () { ... })()         runs during class definition
        require client-dynamodb, lib-dynamodb, client-s3, client-ssm
        instrumentClient(new DynamoDBClient(...))    first call runs initializeXRay() when USE_XRAY
        instrumentClient(new S3())                   no region
        instrumentClient(new SSMClient(...))
    module.exports = { AWS, Aws, AWSXRay, AwsXRay }  AWSXRay copied here
  vars.js: Node.js < 22 → console.error and process.exit(1)
  tools/index.js:      const { AWS, AWSXRay } = require('./AWS.classes')
  ApiRequest.class.js: const { AWS, AWSXRay } = require('./AWS.classes.js')
```

### New

```
require("@63klabs/cache-data")
  ... → AWS.classes.js
    class AWS
      static #dynamoSdk = null, #s3Sdk = null, #ssmSdk = null
      static #secretsSdk = null                       unchanged
    if (USE_XRAY) initializeXRay()                    explicit (Req 5.1)
    module.exports = { AWS, Aws, AWSXRay, AwsXRay }   AWSXRay is initialized when enabled

first read of AWS.s3
  #s3Sdk === null → #s3Sdk = #buildS3()
    #assertSdkV3()                                    v2 guard (Req 6.1)
    require("@aws-sdk/client-s3")                     may throw MODULE_NOT_FOUND (Req 7.2)
    instrumentClient(new S3({ region: AWS.REGION }))  (Req 4.2, 4.4, 4.6)
  return { client, put, get, sdk }                    fresh literal from the memo (Req 3.2)

later reads of AWS.s3
  return { client, put, get, sdk }                    no require, no construction (Req 2.3)
```

`#s3Sdk` is assigned only after `#buildS3()` returns, so any throw leaves it `null` and the next read tries again (Req 7.3).

### Files

| File | Change | Requirements |
|---|---|---|
| `src/lib/tools/AWS.classes.js` | Remove `#SDK`; add memo fields, `#assertSdkV3()`, and three builders; rewrite three getters; `AWS.XRay` returns `initializeXRay()`; load-time X-Ray init; JSDoc | 1 to 7, 11.1, 11.2, 11.5 |
| `types/lib/tools/index.d.ts` | Doc comments for `dynamo`, `s3`, `ssm` only | 11.3 |
| `docs/features/tools/README.md` | Lazy-construction note, init-phase example, drift fixes | 11.4, 11.5 |
| `test/migration/property/test-migration-completeness-property-tests.jest.mjs` | Remove one entry from Property 7's `sourceFiles` | 9.1 (Q14) |
| `test/tools/fixtures/service-packages.cjs` (new) | Accessor-to-package map shared by the runner and the child | 9.3, 9.4 |
| `test/tools/fixtures/aws-classes-child.cjs` (new) | Child-process scenarios | 9.3 to 9.8 |
| `test/tools/fixtures/aws-config-eu-west-3.ini` (new) | Shared config fixture for the `region-source` scenario | 9.6 |
| `test/helpers/aws-classes-child-runner.mjs` (new) | Runs the child without a shell and parses its result | 9.9 |
| `test/tools/aws-lazy-accessor-tests.jest.mjs` (new) | In-process contract, region, and parity tests | 9.2, 9.6 |
| `test/tools/aws-lazy-v2-guard-tests.jest.mjs` (new) | In-process SDK v2 guard test | 9.7 |
| `test/tools/aws-lazy-loading-tests.jest.mjs` (new) | Child-process loading, warning, instrumentation, guard, and missing-package tests | 9.3, 9.6, 9.7, 9.8 |
| `test/tools/aws-xray-load-tests.jest.mjs` (new) | Child-process X-Ray tests | 9.5 |
| `test/tools/property/aws-lazy-accessor-property-tests.jest.mjs` (new) | Properties 1 and 2 | 9.4 |
| `.kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/lazy-accessor-coldstart.mjs` (new) | Benchmark driver | 10 |
| `.kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/child-timer.cjs` (new) | Timed child process | 10 |
| `.kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/RESULTS.md` (new) | Recorded results | 10.6 |
| `CHANGELOG.md` | Entries under v1.4.0 | 12 |

New tests go in new files because Requirement 9.1 keeps existing test files unmodified. `test/tools/aws-classes-tests.jest.mjs` is not touched.

## Components and interfaces

### Memo fields

```js
/** Memoized DynamoDB SDK. Null until the first successful construction. @private */
static #dynamoSdk = null;

/** Memoized S3 SDK. Null until the first successful construction. @private */
static #s3Sdk = null;

/** Memoized SSM SDK. Null until the first successful construction. @private */
static #ssmSdk = null;
```

They're declared beside the existing `#secretsSdk` and before `#XRayOn`, which keeps the member layout around `constructor() {}` unchanged (see [JSDoc validation tests](#jsdoc-validation-tests)).

What each builder returns, and its memo field holds:

| Field | Shape |
|---|---|
| `#dynamoSdk` | `{ client, put, get, scan, delete, update, sdk: { DynamoDBClient, DynamoDBDocumentClient, GetCommand, PutCommand } }` |
| `#s3Sdk` | `{ client, put, get, sdk: { S3, GetObjectCommand, PutObjectCommand } }` |
| `#ssmSdk` | `{ client, getByName, getByPath, sdk: { SSMClient, GetParametersByPathCommand, GetParametersCommand } }` |

### `#assertSdkV3()`

```js
/**
 * Throw the SDK v2 guard error when the runtime would select AWS SDK v2.
 * Each converted builder calls this before requiring any SDK package.
 *
 * @private
 * @throws {Error} When AWS.SDK_V3 is false
 */
static #assertSdkV3() {
	if (!AWS.SDK_V3) {
		throw new Error("AWS SDK v2 is no longer supported. Please upgrade to Node.js 18 or higher to use AWS SDK v3.");
	}
}
```

The message is unchanged from today's `else` branch. `secrets` doesn't call it (Q13).

### Builders

```js
static #buildDynamo() {
	AWS.#assertSdkV3();
	const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
	const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
	const client = DynamoDBDocumentClient.from(
		instrumentClient(new DynamoDBClient({ region: AWS.REGION }))
	);
	return {
		client,
		put: (params) => client.send(new PutCommand(params)),
		get: (params) => client.send(new GetCommand(params)),
		scan: (params) => client.send(new ScanCommand(params)),
		delete: (params) => client.send(new DeleteCommand(params)),
		update: (params) => client.send(new UpdateCommand(params)),
		sdk: { DynamoDBClient, DynamoDBDocumentClient, GetCommand, PutCommand }
	};
}

static #buildS3() {
	AWS.#assertSdkV3();
	const { S3, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
	const client = instrumentClient(new S3({ region: AWS.REGION }));
	return {
		client,
		put: (params) => client.send(new PutObjectCommand(params)),
		get: (params) => client.send(new GetObjectCommand(params)),
		sdk: { S3, GetObjectCommand, PutObjectCommand }
	};
}

static #buildSsm() {
	AWS.#assertSdkV3();
	const { SSMClient, GetParametersByPathCommand, GetParametersCommand } = require("@aws-sdk/client-ssm");
	const client = instrumentClient(new SSMClient({ region: AWS.REGION }));
	return {
		client,
		getByName: (query) => client.send(new GetParametersCommand(query)),
		getByPath: (query) => client.send(new GetParametersByPathCommand(query)),
		sdk: { SSMClient, GetParametersByPathCommand, GetParametersCommand }
	};
}
```

Each builder is the matching branch of today's `#SDK` initializer, moved, with three differences: the v2 guard runs first, S3 gets `{ region: AWS.REGION }`, and the verbs close over the client instead of taking it as a parameter.

The verbs are created once per build and kept in the memo, where today five new closures are allocated on every `AWS.dynamo` read. As a result `AWS.dynamo.get === AWS.dynamo.get` becomes true where it used to be false; nothing in the package or its tests compares verbs by identity. Each verb looks up `client.send` when it's called, so `jest.spyOn(AWS.s3.client, 'send')` intercepts it.

### Getters

```js
static get dynamo() {
	if (AWS.#dynamoSdk === null) {
		AWS.#dynamoSdk = AWS.#buildDynamo();
	}
	const memo = AWS.#dynamoSdk;
	return {
		client: memo.client,
		put: memo.put,
		get: memo.get,
		scan: memo.scan,
		delete: memo.delete,
		update: memo.update,
		sdk: memo.sdk
	};
}
```

`s3` and `ssm` take the same form with their own properties. The return statement lists properties explicitly rather than spreading the memo, so the public shape is visible where it's returned, as in `secrets`.

The getters reference `AWS` rather than `this`, as `secrets` does. Today's getters use `this.#SDK`, which throws a `TypeError` whenever the receiver isn't `AWS` itself, for example `Reflect.get(AWS, 'dynamo', {})`. Referencing `AWS` removes that hazard. `jest.spyOn(AWS, 'dynamo', 'get')` replaces the accessor on `AWS` and works either way.

The getters are synchronous and run to completion, so two reads can't interleave and build a service twice.

### X-Ray at load and `AWS.XRay`

```js
	static get XRay() {
		return initializeXRay();
	}
};

// Initialize X-Ray at module load when it is enabled. tools.AWSXRay, tools.AwsXRay,
// and ApiRequest.class.js copy AWSXRay when they load, so it has to be initialized
// before module.exports is assigned. Building the clients used to do this as a side
// effect; the clients are now built on first use.
if (USE_XRAY) {
	initializeXRay();
}

module.exports = {
	AWS,
	Aws: AWS, // alias
	AWSXRay,
	AwsXRay: AWSXRay, // alias
};
```

X-Ray initialization still happens before `module.exports` is assigned. What changes is that it no longer depends on `getTracingProvider()` returning `null` at load. A provider can only be active at load if `initPowertools()` ran before the package loaded, and nothing in the package calls it (behavior change 6).

`initializeXRay()` is idempotent through `xrayInitialized`, so `AWS.XRay` can call it on every read. With `USE_XRAY` false it returns `null` without requiring `aws-xray-sdk-core` (Req 5.4). The comment above the load-time call must stay a `//` line comment rather than a JSDoc block (see [JSDoc validation tests](#jsdoc-validation-tests)).

### Unchanged

`isTrue`, `USE_XRAY`, `initializeXRay()`, `getTracingProvider()`, `instrumentClient()`, the unused `captureHttp()` and `#XRayOn`, the `secrets` getter, and every `NODE_VER*`, `SDK_*`, `region`, `REGION`, and `INFO` getter.

## Execution flows

### First read of a converted accessor

```
AWS.ssm
  #ssmSdk !== null              → fresh literal from the memo; done
  #assertSdkV3()                SDK_V3 false → throw the v2 message; memo stays null
  require("@aws-sdk/client-ssm")   throws → propagates unchanged; memo stays null
  AWS.REGION                    the first read of AWS.region anywhere caches it, and warns if AWS_REGION is unset
  new SSMClient({ region })
  instrumentClient(client)      provider active now     → provider.instrumentClient(client)
                                else X-Ray initialized  → AWSXRay.captureAWSv3Client(client)
                                else                    → client unchanged
  #ssmSdk = memo
  fresh literal from the memo
```

### Module load

```
USE_XRAY computed once from CacheData_AWSXRayOn and CACHE_DATA_AWS_X_RAY_ON
class AWS { ... }                 no SDK require, no client, no region read
USE_XRAY → initializeXRay()       require aws-xray-sdk-core; capture http and https; AWSXRay = the SDK
                                  (a require failure leaves AWSXRay null and doesn't throw)
module.exports = { AWS, Aws, AWSXRay, AwsXRay }
```

## Error handling

| Condition | Behavior | Requirements |
|---|---|---|
| `AWS.SDK_V3` is false at a converted accessor's first read | Throws the v2 message before any `require()`. The memo stays `null`, so every later read throws again | 6.1 |
| `AWS.SDK_V3` is false at module load | No throw; the module loads | 6.2 |
| A service-client package can't be resolved | The `require()` error propagates unchanged, `code` included. The memo stays `null`, and the next read retries | 7.2, 7.3 |
| A client constructor or `provider.instrumentClient()` throws | Propagates; the memo stays `null`. The providers are written not to throw | 7.3 |
| `AWSXRay.captureAWSv3Client()` throws | The existing `try`/`catch` in `instrumentClient()` returns the uninstrumented client | 4.6 |
| `aws-xray-sdk-core` is missing and `USE_XRAY` is true | The existing `try`/`catch` in `initializeXRay()` leaves `AWSXRay` null, and load doesn't throw | 5.5 |
| `@aws-sdk/client-secrets-manager` is missing | Unchanged: `AWS.secrets.available` is `false` | 3.9 |

There's no retry backoff. A missing package costs one module-resolution lookup per read, and only in an environment that's already broken (Q10).

## Correctness properties

Both properties are checked with fast-check in `test/tools/property/aws-lazy-accessor-property-tests.jest.mjs`, asserted together on every generated sequence inside one `fc.assert`, with one child process per run.

**Property 1 — Load isolation.** *For any* sequence S of reads drawn from `dynamo`, `s3`, `ssm`, and `secrets`, performed in a fresh process after the package entry loads, no service-client package is loaded when the entry finishes loading, and after S the loaded packages are exactly the union of the packages of the services in S. **Validates: Req 1.3, 1.4**

**Property 2 — Memo stability.** *For any* such S, every read returns a new outer object, and every read of a service returns the same `client` and `sdk` objects as that service's first read. **Validates: Req 2.3, 3.2**

The generator is `fc.array(fc.constantFrom('dynamo', 's3', 'ssm', 'secrets'), { maxLength: 8 })`. These properties assert loading behavior, not acceptance by a predicate, so there's no precondition to mirror and nothing to filter, and the arbitrary isn't registered in `AUDITED_ARBITRARIES`. The options are `{ numRuns: 10, endOnFailure: true }`: 10 runs because each run spawns a child (Req 9.9), and no shrinking so a failure can't trigger an unbounded series of child processes. There's no `seed` option (Req 9.10). `FC_SEED` reaches the parent's `fc.assert`, which generates the sequences; the child only executes them.

The edge cases (an empty sequence, each single service, all four) are deterministic example tests in `aws-lazy-loading-tests.jest.mjs`, so they're covered on every run rather than by chance.

## Testing strategy

Per `test-requirements.md` and `test-execution-monitoring.md`: every test file is `.jest.mjs`, nothing invokes `npm test`, and every child-process test uses `execFileSync` with an argument array and an explicit timeout.

### Shared package map: `test/tools/fixtures/service-packages.cjs`

```js
module.exports = {
	SERVICE_PACKAGES: {
		dynamo: ["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb"],
		s3: ["@aws-sdk/client-s3"],
		ssm: ["@aws-sdk/client-ssm"],
		secrets: ["@aws-sdk/client-secrets-manager"]
	}
};
```

The child requires it and the ESM runner imports it, so the map lives in one place. It's test-owned data, not code under test.

### Child-process runner: `test/helpers/aws-classes-child-runner.mjs`

```js
export const PROJECT_ROOT;        // repository root
export const SERVICE_PACKAGES;    // re-exported from the shared map

/**
 * Run one child scenario. Returns rather than throws on a non-zero exit.
 * @returns {{status: number, stdout: string, stderr: string, result: Object|null}}
 */
export function runChild(scenario, args = {}, { env = {}, timeout = 20000 } = {});
```

- Runs `process.execPath`, the same Node binary as Jest, with `[childScriptPath, scenario, JSON.stringify(args)]`. Inputs travel as arguments and are never interpolated into code (`secure-coding-practices.md`).
- Builds the child environment from `process.env` with both X-Ray variables removed and `AWS_REGION=us-east-1`, then applies `env`, where an `undefined` value deletes the key. Results don't depend on the developer's shell.
- `execFileSync` throws on a non-zero exit. The runner catches that and returns `status`, `stdout`, and `stderr` from the error. A timeout or spawn failure, which has no numeric `status`, is rethrown.
- `result` is the JSON after the last `RESULT:` line of stdout, or `null`. The marker keeps scenario output apart from anything the SDKs log.

### Child script: `test/tools/fixtures/aws-classes-child.cjs`

A CommonJS script that dispatches on `process.argv[2]` and prints one `RESULT:` line. It reports which of the five packages are loaded by scanning `require.cache` keys for `/node_modules/<package>/`, with paths normalized to `/`. It's a real file rather than `node -e` code so it gets linted and avoids escaping problems with the `no-template-curly-in-string` rule. Jest doesn't collect it because it isn't a `*.jest.mjs` file.

| Scenario | Steps | Reports |
|---|---|---|
| `load-sequence` | Load the entry and record packages; perform `args.reads`, keeping the first `client`, `sdk`, and outer object per service | `atLoad`, `afterReads`, and per service `sameClient`, `sameSdk`, `freshLiteral` |
| `region-warning` | Wrap `console.warn`; load the entry; read `s3`; read `ssm` | The count of `AWS_REGION is NOT set` messages after each step |
| `region-source` | With `AWS_REGION`, `AWS_DEFAULT_REGION`, and `AWS_PROFILE` unset, `AWS_CONFIG_FILE` set to the fixture, and `AWS_SHARED_CREDENTIALS_FILE` set to a path that doesn't exist: load the entry; read `s3`, `dynamo`, and `ssm` | `AWS.REGION` and each client's resolved region |
| `provider-timing` | Load the entry; read `dynamo`; install a fake provider through `PowertoolsInit`'s `TestHarness.getInternals().powertoolsState.tracer.instance`; read `s3` twice and `ssm` once | The constructor names the fake provider received |
| `xray-exports` | Load the entry without reading any accessor. With `args.blockXray`, first make `aws-xray-sdk-core` unresolvable | Whether `AWSXRay` is null, alias and getter identity, identity with the `AWS.classes.js` exports, the export names of `AWS.classes.js`, whether `aws-xray-sdk-core` and any service package are loaded |
| `xray-counts` | Pre-load `aws-xray-sdk-core` and wrap `captureHTTPsGlobal` and `captureAWSv3Client` with counters; load the entry; read `AWS.XRay` three times, `s3` twice, and `dynamo` once | Call counts, and whether the `s3` and `dynamo` clients carry `XRaySDKInstrumentation` middleware |
| `v2-guard` | Redefine `process.versions.node` as `16.20.0`; require `AWS.classes.js` directly; read each converted accessor twice; then read `secrets` | Load success, `SDK_V3`, the thrown messages, packages loaded before `secrets`, `secrets.available` |
| `v2-entry` | Redefine `process.versions.node` as `16.20.0`; require the entry | Nothing; the parent checks for exit status 1 and the `vars.js` floor message on stderr |
| `missing-one` | Make `@aws-sdk/client-s3` unresolvable by wrapping `Module._resolveFilename`; load the entry; read `s3` twice; read `ssm`; restore resolution; read `s3` | The error `code` of each blocked read, whether `ssm` worked, and the recovered `s3` keys |
| `missing-all` | Make all five packages unresolvable; load the entry; read each converted accessor; read `secrets` | Entry load success, each error `code`, `secrets.available` |

`Module._resolveFilename` is internal to Node but is the standard hook for this, and it's only touched inside the child.

### Test files

| File | Kind | What it checks |
|---|---|---|
| `aws-lazy-accessor-tests.jest.mjs` | In-process | Getter descriptors before and after the first read (3.1). Fresh literal with the same `client` and `sdk` (2.3, 3.2). Exact property and `sdk` keys (3.3 to 3.5). Each verb sends a command with the expected `constructor.name` and `input === params`, and returns the promise `send()` returned (3.6). Destructured verbs (3.7). Getter spy and restore (3.8). `await client.config.region()` equals `AWS.REGION` for all three clients, the S3 client is an `S3` instance with `getObject`, and the document client has no `translateConfig` (4.1 to 4.3, 9.6). The class's own property names equal the snapshot above (2.4, 8.3) |
| `aws-lazy-v2-guard-tests.jest.mjs` | In-process | With `jest.spyOn(AWS, 'SDK_V3', 'get').mockReturnValue(false)`, each converted accessor throws the exact message on two reads, and `AWS.secrets` doesn't throw (6.1, 6.3). It never builds a converted service, so the memo fields stay `null` regardless of test order |
| `aws-lazy-loading-tests.jest.mjs` | Child | `load-sequence` for an empty sequence, each converted accessor alone, and all four, plus the empty sequence with X-Ray enabled (1.3, 1.4). `region-warning` with `AWS_REGION` unset expects counts of 0, 1, 1 (4.5). `region-source` expects every client to resolve `us-east-1`, equal to `AWS.REGION`, although the shared config says `eu-west-3` (4.2, 4.4, behavior change 3). `provider-timing` expects `['S3', 'SSMClient']` (4.6, 4.7). `v2-guard` and `v2-entry` (6.1 to 6.3 and the note). `missing-one` and `missing-all` (7.1 to 7.5) |
| `aws-xray-load-tests.jest.mjs` | Child | `xray-exports` with `CACHE_DATA_AWS_X_RAY_ON=true`, with `CacheData_AWSXRayOn=true`, and with both unset (5.1 to 5.4, 5.7). With `blockXray` and X-Ray enabled it expects a normal load and `AWSXRay` null (5.5), and in every case the export names are exactly `AWS`, `Aws`, `AWSXRay`, `AwsXRay` (8.1). `xray-counts` with X-Ray enabled expects two HTTP captures and one client capture per service (4.6, 5.6); disabled, it expects no calls and no middleware |
| `property/aws-lazy-accessor-property-tests.jest.mjs` | A child per run | Properties 1 and 2 (9.4) |

Child-process `it` blocks set a 60-second timeout, and the property test 120 seconds, the ceiling the steering allows. Each child has a 20-second timeout. `jest.config.mjs` sets `restoreMocks: true`, so `send` and getter spies are restored between tests; the in-process files also call `jest.restoreAllMocks()` in `afterEach`, as the steering asks.

Requirement 5.7 is checked through export identity. `ApiRequest.class.js` destructures `AWSXRay` from the same `module.exports` object after `AWS.classes.js` finishes loading, so `require("./src/lib/tools/AWS.classes.js").AWSXRay === tools.AWSXRay` is exactly the value it receives.

Child processes don't contribute to Jest coverage. The v2 guard is covered in process by the guard test. The missing-package path only runs in children, which is acceptable: its equivalent today, the eager `require` failing, was never covered either.

### Migration test change (Q14)

```diff
 		const sourceFiles = [
 			'src/lib/tools/ApiRequest.class.js',
-			'src/lib/dao-endpoint.js',
-			'src/lib/tools/AWS.classes.js'
+			'src/lib/dao-endpoint.js'
+			// src/lib/tools/AWS.classes.js removed by 1-4-0-convert-aws-to-lazy-accessors (Q14)
 		];
```

This is the only edit to an existing test file. Retiring Property 7 is a follow-up.

### Full-suite gate (Q6a)

After implementation, `npm test` must pass with no other edits to existing tests. One risk is anticipated. With `AWS_REGION` unset, as in CI, the missing-region warning now fires the first time a test reads a real accessor, `AWS.REGION`, or `AWS.INFO`, rather than at import. A search of existing `console.warn` spies found only suppression mocks and assertions local to `MetricsHelper` and the tracing providers, none of which read the region. If the run fails anyway, the `TestHarness` reset in Requirement 8.3 is the approved fallback only for a test that needs a real client rebuilt. Any other failure is a design problem to bring back, not a test to edit.

### Lint

New files import `describe`, `it`, `expect`, `jest`, `beforeEach`, and `afterEach` from `@jest/globals`, and `fileURLToPath` from `node:url`, because `eslint.config.js` doesn't declare those globals. `AWS.classes.js` must report no more than its baseline of 4 errors, so the new code has no unused `catch` bindings and no unused private members.

### JSDoc validation tests

The tests in `test/documentation/` scan `src/lib/tools/*.js` with regexes that match a JSDoc block followed directly by a `name(...) {` method or a `const name = (...)` function. They don't match `static get` accessors or `#private` methods, so the rewritten getters and new builders fall outside their checks; the JSDoc is written to the standard anyway (Req 11.1). Two layout constraints keep it that way:

- No JSDoc block may end directly before `constructor() {}`, or the patterns would start checking the constructor. Declaring the memo fields before `#XRayOn` preserves today's layout.
- The comment above `if (USE_XRAY)` must be `//` lines. A JSDoc block there would make the pattern read the `if (...)` as a function.

## Documentation design

### `AWS.classes.js`

Class-level JSDoc (Q15):

- **Description:** replace "Uses AWS SDK v2 or v3 depending on the Node.js version. It will perform this check for you and utilize the proper SDK." with a statement that the class uses AWS SDK v3, and that each service's SDK package is loaded and its client constructed the first time its accessor is read, then reused.
- **dynamo example:** the `sdk` comment lists `{ DynamoDBClient, DynamoDBDocumentClient, GetCommand, PutCommand }`, and `new AWS.dynamo.sdk.DynamoDB.DocumentClient(...)` becomes `await AWS.dynamo.client.send(new AWS.dynamo.sdk.GetCommand(params))`.
- **SSM example:** the `sdk` comment lists `{ SSMClient, GetParametersByPathCommand, GetParametersCommand }`.
- **`@property` lines:** drop "(either V2 or V3)" and the `V2:` alternatives. `dynamo.sdk` loses `DynamoDB`; `s3.sdk` is `{ S3, GetObjectCommand, PutObjectCommand }`; `ssm.sdk` lists `GetParametersCommand`; `@property {object} AWSXRay` becomes `@property {object|null} XRay`.

Getter JSDoc for `dynamo`, `s3`, and `ssm`: a description saying the first read requires the SDK package and constructs the client, and later reads reuse it; `@returns` with the exact shape (dynamo's `sdk` without `DynamoDB`); `@throws {Error}` for the v2 guard; `@throws {Error}` with code `MODULE_NOT_FOUND` when the package can't be loaded; an `@example`.

`XRay`: `@returns {object|null}`, naming when each is returned, plus an `@example`. The builders and `#assertSdkV3()` carry `@private` JSDoc.

### `types/lib/tools/index.d.ts`

Doc comments only, in the form of the existing `secrets` comment:

```ts
	/**
	 * DynamoDB client and helper functions.
	 * Loaded lazily on first access and reused for the life of the process.
	 */
```

The same wording applies to `s3` ("S3 client and helper functions.") and `ssm` ("SSM Parameter Store client and helper functions."). No type changes.

### `docs/features/tools/README.md`, `tools.AWS` section

- Replace "The @63klabs/cache-data package will automatically detect and use the correct AWS SDK ... Node 18+ environments will use AWS-SDK version 3." with: the package uses AWS SDK for JavaScript v3 and requires Node.js 22 or later.
- "only those SDKs are included" names DynamoDB, S3, SSM Parameter Store, and Secrets Manager.
- Add a "When clients are created" subsection: each accessor loads its SDK package and creates its client on first read, then reuses it. Functions that need that work in the Lambda init phase, such as those using provisioned concurrency, can read the accessors at module scope:

  ```javascript
  const { tools } = require("@63klabs/cache-data");

  // Build the DynamoDB and S3 clients during the Lambda init phase
  tools.AWS.dynamo;
  tools.AWS.s3;
  ```

- In the S3 example, `s3Body.transformToString()` becomes `result.Body.transformToString()`, and the commented-out v2 line beneath it, which references an undefined `data`, is removed.
- `AWS.dynamodb.put` and `AWS.dynamodb.get` become `AWS.dynamo.put` and `AWS.dynamo.get`.

The new snippet includes its `require`, so it passes the example tests (valid syntax, import present, no deprecated APIs).

### CHANGELOG

Under `## v1.4.0 (unreleased)`, in `### Changed`, inserted before "**Documentation: cache-key generation corrected**" so the runtime changes stay together:

```markdown
- **AWS SDK clients are created on first use** — `tools.AWS.dynamo`, `tools.AWS.s3`, and `tools.AWS.ssm` now load their AWS SDK package and construct their client the first time each accessor is read, as `tools.AWS.secrets` already did, instead of when the package is required. Accessor shapes are unchanged. [Spec: 1-4-0-convert-aws-to-lazy-accessors](.kiro/specs/1-4-0-convert-aws-to-lazy-accessors/)
  - Functions that use only some of these services, or none, load less at import. For services in use, the work moves to the first read, which in Lambda can move it from the init phase into the first invocation. To keep it in the init phase, for example with provisioned concurrency, read the accessor at module scope.
  - A missing AWS SDK package now fails only when its accessor is first read, with the original `require()` error, instead of failing `require("@63klabs/cache-data")`.
  - The S3 client is now constructed with `{ region: AWS.REGION }`, like DynamoDB and SSM. Where `AWS_REGION` is unset (never in Lambda), S3 now uses `us-east-1` instead of a region from the shared config file.
  - The region is read when the first client is constructed rather than at import, so the missing-`AWS_REGION` warning appears then, and only if an AWS accessor is used.
  - Each client is instrumented by the tracing provider that is active when it is first read.
  - With X-Ray enabled, `tools.AWSXRay` is still initialized at import, now even if a tracing provider is already active.
  - On Node.js < 18 the package now stops at the existing Node.js 22 version check instead of throwing "AWS SDK v2 is no longer supported"; the AWS accessors still throw that error if `AWS.classes.js` is loaded directly.
```

Appended to `### Fixed`:

```markdown
- **Documentation: `tools.AWS`** — Corrected the `tools.AWS` section of the tools README (`AWS.dynamodb` → `AWS.dynamo`, an undefined variable in the S3 example, the SDK and Node.js version notes) and the `AWS` class JSDoc (AWS SDK v2 references and `sdk` member lists). [Spec: 1-4-0-convert-aws-to-lazy-accessors](.kiro/specs/1-4-0-convert-aws-to-lazy-accessors/)
```

The Q14 test edit is test-only and gets no entry, per the changelog convention.

## Benchmark design (Requirement 10)

`lazy-accessor-coldstart.mjs` is an ES module run with plain `node`:

```bash
node .kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/lazy-accessor-coldstart.mjs --baseline <git-ref> [--candidate <dir>] [--runs 20] [--one ssm]
```

1. **Baseline.** `git archive --format=tar -o <tmp>/baseline.tar <ref> src package.json`, then `tar -xf <tmp>/baseline.tar -C <tmp>/baseline`, both through `execFileSync` with argument arrays. The working tree and git state are untouched. `--candidate` defaults to the repository root.
2. **Same dependencies.** Every child runs with `NODE_PATH=<repo>/node_modules`, so the baseline copy resolves the same installed SDK versions as the candidate. Node's CommonJS resolver consults `NODE_PATH` after the `node_modules` walk fails.
3. **Scenarios.** `child-timer.cjs <entry> <reads-json>` takes `process.hrtime.bigint()`, requires the entry, reads the listed accessors through `tools.AWS`, and prints `RESULT:{"ms":...}`. The scenarios are import only; import plus `--one` (default `ssm`, a parameters-only function); and import plus `dynamo`, `s3`, and `ssm`.
4. **Fairness.** One discarded warm-up run per root and scenario, then baseline and candidate runs interleaved, so drift such as thermal throttling or file cache state affects both equally. Children run with `AWS_REGION=us-east-1` and both X-Ray variables removed.
5. **Report.** A markdown table per scenario with the run count, mean, median, min, and max for both roots and the difference, plus the Node.js version, platform, and the baseline ref with its resolved SHA. The temp directory is removed in a `finally` block.

The candidate's "all three" time minus its "import only" time is the cost now paid at first read, which is the number Q11 needs. `RESULTS.md` records the command, the table, and that number, and says whether revisiting `Cache.init()` pre-warming (Q11 Option C) looks warranted. The decision stays with the maintainer.

The script isn't under `test/`, isn't a `*.jest.mjs` file, isn't referenced by CI, and is excluded from the package by the `.kiro` entry in `.npmignore`. ESLint does lint it, because `eslint.config.js` has no `.kiro` ignore, so it must be lint-clean.

## Backwards compatibility analysis

**Unchanged:** the exports of `AWS.classes.js` and `tools`; every accessor's shape, verb names, and `sdk` members; the static getter form; the type declarations; `AWS.secrets`; the X-Ray environment variables and `AWSXRay` at import; `instrumentClient()` precedence; the v2 message text.

**Intentionally changed:** the seven rows of the consumer-visible behavior changes table in requirements.md, plus verb identity (`AWS.dynamo.get === AWS.dynamo.get` is now true), which nothing depends on.

## Known limitations

1. A failed construction is retried on every read, without backoff (Q10).
2. `AWS.region` still caches the region process-wide on its first read, whether that comes from an accessor or anything else.
3. The SDK v2 guard is reachable only by requiring `AWS.classes.js` directly, because the package entry's Node.js 22 floor exits first (Q13).
4. The benchmark measures module loading and client construction in fresh local processes. It's a relative comparison on one machine, not a Lambda cold-start measurement: no init-phase CPU allocation, no network, no credential resolution.

## Follow-ups (outside this spec)

- Retire migration Property 7, which still blocks uncommitted edits to `ApiRequest.class.js` and `dao-endpoint.js` (Q14 Option C).
- Powertools activation: nothing in `src/` calls `initPowertools()`, and `docs/features/tools/powertools-integration.md` uses `tools.PowertoolsInit`, which isn't exported.
- `Cache.init()` pre-warming, if the benchmark warrants it (Q11 Option C).
- Remove the unused `captureHttp()` and `#XRayOn`, which account for two of the four existing lint errors in `AWS.classes.js`.
- Packaging: done outside this spec. `.npmignore` now lists `coverage-jest` and `.vscode`, which `npm pack --dry-run` had been including (77 files and 1 file), and mirrors every other `.gitignore` exclusion (dotfiles such as `.env`, logs, archives, coverage, Python artifacts). The package went from 125 files to 47.
