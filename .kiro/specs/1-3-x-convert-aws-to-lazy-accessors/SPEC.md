# Convert AWS SDK Client Accessors to Lazy Initialization

> **Status**: Deferred / future release. The version prefix `1-3-x` is intentional; replace `x` with the actual `package.json` version when this spec is picked up.
>
> **Origin**: Deferred from [1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk](../1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/) (Q10). That spec made only the new Secrets Manager client lazy, deliberately leaving an inconsistency rather than widening its regression surface.

## Problem

`src/lib/tools/AWS.classes.js` builds its SDK clients in an eager IIFE:

```js
static #SDK = (
	function(){
		if (AWS.SDK_V3) {
			const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
			const { DynamoDBDocumentClient, ... } = require("@aws-sdk/lib-dynamodb");
			const { S3, ... } = require("@aws-sdk/client-s3");
			const { SSMClient, ... } = require("@aws-sdk/client-ssm");
			return { dynamo: { client: ... }, s3: { client: ... }, ssm: { client: ... } };
		}
		// ...
	}
)();
```

This is a static class field initializer, so it runs at **class-definition time**, which happens on `require('@63klabs/cache-data')` via `src/lib/tools/index.js`. Consequences:

- Every consumer constructs a DynamoDB client, an S3 client, and an SSM client on import, whether or not they use those services. A function that only uses `DebugAndLog` and `Response` still pays for three clients.
- Four `@aws-sdk/*` packages are `require`d unconditionally. If any is absent from the runtime, module load throws for every consumer regardless of which services they touch.
- Cold start cost is paid up front and cannot be deferred or avoided.

The 1.3.16 work added a fourth service (Secrets Manager) using a guarded lazy accessor instead, because the blast radius of an eager require for an optional feature was unacceptable. That leaves three eager services and one lazy one.

## Goal

Convert `dynamo`, `s3`, and `ssm` to the same lazy, guarded, memoized pattern the `secrets` accessor uses, so all four behave consistently and none is constructed until first use.

## Glossary

- **Eager IIFE**: the `static #SDK = (function(){...})()` block that runs at class-definition time.
- **Lazy accessor**: a `static get <service>()` that `require`s its SDK package and constructs its client on first access, memoizes the result, and returns the same public shape thereafter.
- **Public accessor shape**: the object literal each getter currently returns — `{ client, <verbs...>, sdk }`. This is the contract consumers and tests depend on.

## Constraints

**Preserve the accessor shape exactly.** `AWS.dynamo`, `AWS.s3`, and `AWS.ssm` each return a fresh object literal on every access:

```js
static get ssm() {
	return {
		client: this.#SDK.ssm.client,
		getByName: ( query ) => this.#SDK.ssm.getByName(this.#SDK.ssm.client, query),
		getByPath: ( query ) => this.#SDK.ssm.getByPath(this.#SDK.ssm.client, query),
		sdk: this.#SDK.ssm.sdk
	};
}
```

The whole test suite mocks these with `jest.spyOn(AWS, 'dynamo', 'get').mockReturnValue({...})` per `.kiro/steering/test-harness-for-private-classes-and-methods.md`. Changing the getter to return a memoized singleton instead of a fresh literal, or changing which properties it carries, breaks that mocking pattern across `test/cache/`, `test/config/`, and `test/tools/`.

**Preserve tracing instrumentation.** Every client currently passes through `instrumentClient()`, which applies the Powertools `TracingProvider` if present, then falls back to `AWSXRay.captureAWSv3Client()`. Lazy construction must still route through it.

**Verified backwards-compatibility hazard — the `AWSXRay` export.** `AWSXRay` is a module-level `let` initialized to `null`, assigned only inside `initializeXRay()`. Today `instrumentClient()` runs during the eager IIFE, which runs *before* `module.exports` evaluates, so the exported binding captures the initialized object. Verified empirically:

```
CACHE_DATA_AWS_X_RAY_ON=true
tools.AWSXRay is null?  false
tools.AWS.XRay is null? false
```

If client construction becomes lazy, nothing triggers `initializeXRay()` at load time. Both `tools.AWSXRay` / `tools.AwsXRay` (destructured, captured by value at export) and `AWS.XRay` (a getter that returns the variable without calling `initializeXRay()`) would return `null` until some service accessor is first touched. Consumers doing `const { AWSXRay } = tools;` at module scope would silently get `null` where they previously got a working SDK.

This needs an explicit fix as part of the conversion — likely calling `initializeXRay()` unconditionally at module load when `USE_XRAY` is true, decoupling it from client construction, and/or converting `AWS.XRay` to call `initializeXRay()` on access.

## Also worth fixing while in here

- **S3 is constructed without a region.** `dynamo` and `ssm` both pass `{ region: AWS.REGION }`; `s3` is `instrumentClient(new S3())` with no options, so it relies on ambient region resolution. Inconsistent, and it means `AWS.region`'s `us-east-1` fallback and its `console.warn` do not apply to S3 the way they do to the other two.
- **Region is currently baked in at module load.** `AWS.REGION` is read during the IIFE, so mutating `process.env.AWS_REGION` afterward has no effect on the clients. Lazy construction changes when the region is sampled, which is arguably a fix but is a behavior change worth deciding deliberately.
- **`#SDK` throws for SDK v2.** The `else` branch throws `"AWS SDK v2 is no longer supported..."` at module load. Under lazy accessors that throw moves to first use, which changes where and when consumers see it.

## Success criteria

- No `@aws-sdk/*` package is `require`d until the corresponding accessor is first used.
- `AWS.dynamo`, `AWS.s3`, `AWS.ssm`, `AWS.secrets` all follow one pattern.
- The existing getter-mocking pattern keeps working with no test changes beyond additions.
- `tools.AWSXRay` behavior is unchanged for X-Ray consumers.
- Measurable cold-start improvement for consumers that use a subset of services. Worth benchmarking before and after to confirm the change earns its regression risk.

## Non-goals

- Changing any accessor's public shape or verb names.
- Adding or removing services.
- AWS SDK v2 support.

Ask clarifying questions in `SPEC-QUESTIONS.md` in this directory and the user will respond with answers there.

## Related documentation

- [1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk](../1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/PLAN.md) - WS-2 and Q10, where this was deferred
- `src/lib/tools/AWS.classes.js` - the file this spec targets
- `.kiro/steering/test-harness-for-private-classes-and-methods.md` - the getter-mocking pattern that constrains the design
