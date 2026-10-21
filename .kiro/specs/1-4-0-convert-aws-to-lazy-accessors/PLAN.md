# Convert AWS SDK Client Accessors to Lazy Initialization

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

**Resolved fix (Decision Log Q2 — LOCKED):** both of the candidate fixes are adopted. (1) A top-level `if (USE_XRAY) initializeXRay();` runs at module load *before* `module.exports`, so the exported `AWSXRay` / `AwsXRay` bindings capture the initialized object by value exactly as today. (2) The `AWS.XRay` getter is changed to `return initializeXRay();`, which keeps it correct even if the load-time call ever moves. (`USE_XRAY` is fixed at load, so there is no "opt in after load" case; see Round 2 grounding.) When `USE_XRAY` is false, `initializeXRay()` is a no-op leaving `AWSXRay === null` — today's behavior, preserved exactly.

## Locked design (from Decision Log)

All decisions (Q1 to Q15) are LOCKED. The concrete design is:

- **Memoization (Q1):** delete the `static #SDK` IIFE. Add one private memo field per service — `#dynamoSdk`, `#s3Sdk`, `#ssmSdk` — alongside the existing `#secretsSdk`. Each `static get` guards on its own field being `null`, then on first access `require`s its SDK package, constructs + `instrumentClient()`s its client, memoizes into the field, and returns a **fresh object literal** per call (preserving the getter-spy mocking contract).
- **X-Ray (Q2):** eager `initializeXRay()` at load when `USE_XRAY`, plus `AWS.XRay` → `initializeXRay()`. See the resolved fix above.
- **Region + S3 (Q3):** S3 is constructed with `{ region: AWS.REGION }` like the other two. Region is sampled at first use; a no-op in Lambda.
- **SDK v2 guard (Q4):** each accessor checks `AWS.SDK_V3` on first use and throws the existing v2 message if false. The throw moves from import to first service access.
- **Instrumentation (Q5):** `instrumentClient()` unchanged; every lazy accessor routes through it on first construction.
- **Memo lifetime (Q6):** per-process, no reset hook. A full-suite run is a required implementation task to confirm "no test changes beyond additions"; a `TestHarness` reset hook is the pre-approved fallback only if that run proves it necessary.
- **Benchmark (Q7):** a lightweight, committed, run-once micro-benchmark under this spec dir; not wired into CI.
- **Versioning (Q8):** 1.4.0, semver-minor; behavior-change nuances documented under "Changed" in `CHANGELOG.md`.
- **Missing package (Q10):** a converted accessor throws the original `require()` error on first read; the failure isn't memoized.
- **Init phase (Q11):** document reading accessors at module scope; revisit `Cache.init()` pre-warming only if the benchmark shows a material first-read cost.
- **S3 region outside Lambda (Q12):** accepted; with `AWS_REGION` unset, S3 now uses `us-east-1`.
- **SDK v2 guard scope (Q13):** `dynamo`, `s3`, and `ssm` only; a defensive check behind the `vars.js` Node 22 floor.
- **Migration test (Q14):** remove `AWS.classes.js` from Property 7's file list as the one logged exception; retiring Property 7 is a follow-up.
- **Doc drift (Q15):** fix every listed item.

## Also worth fixing while in here (all resolved — see Locked design)

- **S3 is constructed without a region.** `dynamo` and `ssm` both pass `{ region: AWS.REGION }`; `s3` is `instrumentClient(new S3())` with no options. **Resolved (Q3):** S3 gets `{ region: AWS.REGION }`.
- **Region is currently baked in at module load.** `AWS.REGION` is read during the IIFE. **Resolved (Q3):** region is now sampled at first use — a no-op in Lambda, recorded as an intentional "Changed" note.
- **`#SDK` throws for SDK v2.** The `else` branch throws at module load. **Resolved (Q4):** the v2 guard moves into each accessor and throws on first use, preserving the message.

## Success criteria

- No service-client package (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/client-ssm`, `@aws-sdk/client-secrets-manager`) is `require`d until the corresponding accessor is first used. (Scoped to these five in Round 2 so it stays testable.)
- `AWS.dynamo`, `AWS.s3`, `AWS.ssm`, `AWS.secrets` all follow one pattern.
- The existing getter-mocking pattern keeps working with no test changes beyond additions (verified by a required full-suite run, Q6).
- `tools.AWSXRay` behavior is unchanged for X-Ray consumers, via eager load-time `initializeXRay()` when opted in plus the `AWS.XRay` getter fix (Q2).
- Measurable cold-start improvement for consumers that use a subset of services, captured by a committed run-once micro-benchmark (Q7).

## Non-goals

- Changing any accessor's public shape or verb names.
- Adding or removing services.
- AWS SDK v2 support.

Design decisions and their rationale are recorded in the **Decision Log** at the end of this document. All fifteen questions are locked. Requirements are in [requirements.md](requirements.md) and the technical design in [design.md](design.md).

## Related documentation

- [1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk](../1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/PLAN.md) - WS-2 and Q10, where this was deferred
- [requirements.md](requirements.md) - requirements derived from the Decision Log
- [design.md](design.md) - technical design
- [tasks.md](tasks.md) - implementation plan
- `src/lib/tools/AWS.classes.js` - the file this spec targets
- `.kiro/steering/test-harness-for-private-classes-and-methods.md` - the getter-mocking pattern that constrains the design

---

# Decision Log & Clarifying Questions

> This section is an audit trail of design decisions. Each question has options, a recommendation, and a status. Answer inline under **Answer:**. Once every question reaches **LOCKED**, the plan body above is revised to match and `requirements.md` is written.

**Legend:** 🟡 OPEN (awaiting answer) · 🟢 LOCKED (decided) · 🔵 REVISED (plan body updated to match)

## Round 1 — Grounding verified against source

The following claims in the plan body were re-verified against `src/lib/tools/AWS.classes.js` and the test suite before these questions were written:

- The `secrets` accessor memoizes into `static #secretsSdk` and returns a **fresh object literal** per access (lines ~430–470). `dynamo`/`s3`/`ssm` read from the eager `static #SDK` IIFE and also return fresh literals. Confirmed.
- `AWSXRay` is a module-level `let`, assigned only in `initializeXRay()`, and `module.exports` captures it **by value**. `AWS.XRay` getter returns the variable without calling `initializeXRay()`. Confirmed — the backwards-compat hazard is real.
- `s3` is constructed as `instrumentClient(new S3())` with no region; `dynamo` and `ssm` pass `{ region: AWS.REGION }`. Confirmed.
- The `else` branch throws the v2 error at IIFE time (line 373). Confirmed.
- The getter-mocking pattern `jest.spyOn(tools.default.AWS, '<svc>', 'get').mockReturnValue({...})` is used across `test/cache/`, `test/config/`, `test/utils/`, and `test/helpers/`. **No test depends on the v2 throw firing at module load.** Confirmed via grep.

---

## Q1 — Memoization storage: one field or four?

The `secrets` accessor memoizes into its own `#secretsSdk` field. When `dynamo`/`s3`/`ssm` go lazy, where does each memoize?

- **Option A — One private field per service** (`#dynamoSdk`, `#s3Sdk`, `#ssmSdk`, keep `#secretsSdk`). Each accessor guards and builds independently. Maximum laziness: touching `AWS.s3` never constructs dynamo.
- **Option B — Keep a single `#SDK` object but populate it lazily**, one service key at a time. Less code churn in the shape of `#SDK`, but the guard logic is per-key anyway, so it saves little.
- **Option C — One field holding a per-service memo map.**

**Recommendation: Option A.** It mirrors the already-shipped `secrets` pattern exactly (the plan's stated goal is "all four follow one pattern"), gives true per-service laziness, and keeps each getter self-contained and independently testable. The `#SDK` IIFE is deleted entirely.

**Answer:** A
**Decision:** One private memo field per service — `#dynamoSdk`, `#s3Sdk`, `#ssmSdk`, plus the existing `#secretsSdk`. The `static #SDK` IIFE is deleted entirely. Each `static get` guards on its own field being `null`, builds + instruments + memoizes on first access, and returns a fresh object literal per call.
**Status:** REVISED (plan body "Locked design" + Constraints updated to match)

---

## Q2 — The `AWSXRay` module-load hazard: which fix?

Once clients are lazy, nothing calls `initializeXRay()` at load, so `tools.AWSXRay` / `tools.AwsXRay` (captured by value at export) and `AWS.XRay` return `null` until a service is first touched. This is the plan's headline backwards-compat risk.

- **Option A — Eagerly initialize X-Ray at module load when `USE_XRAY` is true.** Add a top-level `if (USE_XRAY) initializeXRay();` before `module.exports`, so the exported `AWSXRay` binding captures the initialized object exactly as today. X-Ray's own require (`aws-xray-sdk-core`) only loads when the consumer opted in via env var, so this does not re-introduce an unconditional eager require. Client construction stays lazy and independent.
- **Option B — Convert `AWS.XRay` getter to call `initializeXRay()` on access**, and also fix the exports. But `module.exports`'s `AWSXRay` / `AwsXRay` are captured by value and cannot be made lazy without converting them to getters on the exports object — a larger change to `index.js`-level shape.
- **Option C — Both A and B**: eager init when opted in (fixes the by-value exports) *and* make `AWS.XRay` call `initializeXRay()` (fixes the getter for the opt-in-after-load edge case).

**Recommendation: Option C.** Option A alone restores the exact observed behavior for the common case (env var set before import, which is how Lambda sets it) and is the minimal fix for the by-value export capture. Adding the `AWS.XRay` getter call (B) is cheap insurance for any consumer that sets the env var or accesses X-Ray lazily, and makes the getter self-consistent. Together they close both paths. If you want the smallest possible diff, A alone covers the documented hazard.

**Open sub-question Q2a:** Do we preserve `AWSXRay` returning `null` when `USE_XRAY` is false (current behavior), or is any change there in scope? Recommendation: preserve exactly — out of scope to change.

**Answer:** C - and for Q2a preserve exactly
**Decision:** Both fixes. (1) At module load, add a top-level `if (USE_XRAY) initializeXRay();` placed *before* `module.exports`, so the exported `AWSXRay` / `AwsXRay` bindings capture the initialized object by value exactly as today. (2) Convert the `AWS.XRay` getter to `return initializeXRay();` as defense-in-depth (rationale corrected in Round 2 grounding). Q2a: when `USE_XRAY` is false, `initializeXRay()` is a no-op that leaves `AWSXRay === null`, preserving today's behavior exactly — no change.
**Status:** REVISED (plan body X-Ray hazard section updated to match)

---

## Q3 — When is the region sampled, and does S3 get one?

Today `AWS.REGION` is read inside the IIFE at module load, so later `process.env.AWS_REGION` mutations don't affect clients. Lazy construction moves region sampling to first-use. Separately, S3 is built with no region.

- **Option A — Add `{ region: AWS.REGION }` to the S3 client and let all four sample region at first use.** Consistent across services; picks up `AWS.region`'s `us-east-1` fallback + `console.warn` for S3 too. Behavior change: region is read at first-use, not load.
- **Option B — Add region to S3 but document that region is now first-use-sampled, flagging it as an intentional, minor behavior change.** (Same code as A, differs only in how we record/communicate it.)
- **Option C — Leave S3 region-less** to minimize behavior change. Rejected by the plan's own "also worth fixing" note and breaks the "one pattern" goal.

**Recommendation: Option A/B (same code).** In Lambda, `AWS_REGION` is set by the runtime before import and never mutated, so first-use vs load-time sampling is a behavioral no-op in practice. Adding region to S3 is a consistency win and activates the fallback warning uniformly. Record it as an intentional change in `requirements.md` and `CHANGELOG.md`.

**Open sub-question Q3a:** Does any test assert S3 is constructed *without* a region, or assert on the absence of the region warning for S3? (Need to confirm before locking — I did not find one, but a targeted check should be part of the design-verification step.)

**Answer:** A/B. Sub Q3a i'm not sure. Only tests would be regionless as they are not running inside of lambda. Double check.
**Decision:** Add `{ region: AWS.REGION }` to the S3 client so all four services construct identically. Region is sampled at first use rather than load — a no-op in Lambda (runtime sets `AWS_REGION` before import and never mutates it). Recorded as an intentional "Changed" note in `requirements.md` and `CHANGELOG.md`.
**Q3a double-check (done):** Grepped `test/**` for `new S3(`, S3+region assertions, and the `AWS_REGION is NOT set` / `us-east-1` warning. **No test asserts S3 is region-less and no test asserts the absence of an S3 region warning.** The only region assertion is `test/tools/aws-classes-tests.jest.mjs` checking `AWS.REGION` ∈ `['us-west-2','us-east-1']`, which concerns the `REGION` getter, not S3 construction. Your reading holds: tests run outside Lambda. CI does not set `AWS_REGION` (`.github/workflows/test.yml`), so under test `AWS.REGION` falls back to `us-east-1`, and S3 will now be built with `us-east-1`. No test asserts on the S3 client's region, so nothing observable changes. Safe. The non-Lambda consumer case is Q12.
**Status:** REVISED (plan body "Also worth fixing" updated; Q3a verified)

---

## Q4 — SDK v2 error: move the throw to first-use, or throw at load?

The `else` throw (`"AWS SDK v2 is no longer supported..."`) runs at IIFE time today, so an unsupported Node (<18) fails fast on `require`. Under per-service lazy accessors, where does the v2 guard live?

- **Option A — Each lazy accessor checks `SDK_V3` and throws the v2 error on first use.** The throw moves from load to first service access. A consumer on Node <18 that only uses `DebugAndLog`/`Response` would now load successfully instead of throwing at import.
- **Option B — Keep a load-time guard**: a top-level `if (!AWS.SDK_V3) throw ...` preserving today's fail-fast-on-import behavior, plus the per-accessor safety.
- **Option C — Drop the v2 throw entirely** and let the underlying SDK require fail naturally. Rejected: loses the clear, actionable error message.

**Recommendation: Option A.** Node 18 is EOL and the package requires Node >=20 per `AGENTS.md`/`package.json`, so a v2 runtime is effectively impossible in practice; the guard is defensive. Keeping the throw per-accessor is consistent with laziness ("don't fail for a service you never touch") and preserves the message. Option B's only benefit is identical import-time failure timing, which matters only for a Node version the package already refuses to support. If you value preserving exact fail-fast timing over consistency, choose B — it's a one-liner.

**Answer:** A
**Decision:** Each lazy accessor checks `AWS.SDK_V3` on first use and throws the existing `"AWS SDK v2 is no longer supported..."` message if false. The throw moves from import time to first service access. Through the package entry, `vars.js` exits on Node.js < 22 before any accessor can be read, so the guard is defensive. Scope and reachability: Q13.
**Status:** REVISED (plan body "Also worth fixing" updated to match)

---

## Q5 — `instrumentClient()` timing and the TracingProvider precedence

`instrumentClient()` checks `getTracingProvider()` (Powertools) first, then falls back to `AWSXRay`. Today it runs during the IIFE, early in load. Lazily, it runs at first service access — which is *later*, so a Powertools `TracingProvider` initialized after import is now **more** likely to be present at construction time.

- **Option A — Keep `instrumentClient()` exactly as-is**; lazy construction routes through it unchanged. The later timing is arguably an improvement (Powertools more likely initialized), and matches the already-shipped `secrets` accessor which already instruments lazily.
- **Option B — Snapshot/freeze tracing at load** to preserve today's "instrument with whatever is available at import" timing. Adds complexity for no clear benefit.

**Recommendation: Option A.** `secrets` already instruments at first-use and that shipped without issue. Keeping one instrumentation path for all four is the whole point. Note the timing change in design docs as a deliberate, low-risk consequence.

**Answer:** A
**Decision:** `instrumentClient()` is unchanged; every lazy accessor routes its client through it on first construction, exactly as `secrets` already does. The later invocation timing (first-use instead of load) is a deliberate, low-risk consequence noted in the design doc.
**Status:** REVISED (plan body "Locked design" updated to match)

---

## Q6 — Memoization + mockability interaction (the core test-compat constraint)

The steering doc `test-harness-for-private-classes-and-methods.md` mandates `jest.spyOn(AWS, '<svc>', 'get').mockReturnValue({...})`. This spies on the **getter**, so as long as each accessor stays a `static get`, mocking is unaffected by how we memoize internally. But two subtleties:

1. Tests that *don't* mock and let the real getter run (e.g. an integration test with real-ish clients) will now trigger lazy construction + a real `require` on first access. Are there such tests, and do they have the `@aws-sdk/*` packages available?
2. The memoized singleton must still be rebuildable between test files if a test mutates env (region, X-Ray) and expects reconstruction — but today `#SDK` is built once per process and never rebuilt either, so this is not a regression.

- **Option A — Memoize per-process (never reset), matching today's `#SDK` lifetime.** Simplest, lowest regression surface. A test needing a fresh client uses the getter-spy, not real reconstruction.
- **Option B — Add a private test-only reset hook** (e.g. via `TestHarness`) to clear memo fields between tests. Only worth it if a real test needs real reconstruction with different env.

**Recommendation: Option A**, unless the design-verification step finds a test that relies on reconstructing a real client with mutated env. Today nothing can do that (clients are frozen at load), so Option A preserves semantics. Keep Option B in reserve.

**Open sub-question Q6a:** Should I run the full suite against a prototype of the lazy conversion as part of design verification, to empirically confirm "no test changes beyond additions"? Recommendation: yes — that empirical check is the cheapest way to de-risk the whole spec.

**Answer:** A - Q6a: yes
**Decision:** Memoize per-process with no reset hook, matching today's `#SDK` lifetime. Tests needing a fresh client use the getter-spy (the mandated pattern), not real reconstruction. Q6a: an implementation task runs the full `npm test` suite against the converted code and must pass with no changes to existing tests (additions only). If that run surfaces a test that genuinely needs real reconstruction with mutated env, Option B (a `TestHarness` reset hook) is the pre-approved fallback — but it is not expected, since clients are frozen at load today.
**Status:** REVISED (plan body "Locked design" updated to match)

---

## Q7 — Benchmark: is a before/after cold-start measurement a deliverable or optional?

The success criteria say the change should show "measurable cold-start improvement" and is "worth benchmarking before and after."

- **Option A — Make a benchmark a required task** with a documented methodology (e.g. time `require('@63klabs/cache-data')` and first-use of a single service, cold, averaged over N runs) and record numbers in the spec.
- **Option B — Treat the benchmark as optional/nice-to-have**; rely on the self-evident fact that deferring 3 client constructions + up to 4 SDK requires reduces load cost.
- **Option C — Required but lightweight**: a single reproducible micro-benchmark script committed under the spec dir, run once, numbers captured, not wired into CI.

**Recommendation: Option C.** A one-off committed script gives a defensible number to justify the regression risk (per the success criteria) without the maintenance burden of a CI perf gate. If you don't want the overhead at all, Option B is acceptable given the change is obviously load-reducing.

**Answer:** C
**Decision:** Required but lightweight. A reproducible micro-benchmark script is committed under this spec directory (e.g. `benchmark/lazy-accessor-coldstart.mjs`), measuring import cost and first-use-of-one-service cost before and after, averaged over N runs. Run once; numbers captured in the spec. Not wired into CI.
**Status:** REVISED (plan body "Locked design" updated to match)

---

## Q8 — Version & changelog framing

Per the workspace spec-naming rule this is `1-4-0-*`, implying a **minor** bump (1.3.x → 1.4.0).

- Is 1.4.0 the intended target version, and is this strictly backwards-compatible (minor), or do any of the decided behavior changes (region first-use sampling Q3, v2 throw timing Q4, X-Ray init timing Q2) count as breaking enough to reconsider?

**Recommendation:** Keep **1.4.0 / minor**. Every behavior change under discussion is either a no-op in the supported runtime (Lambda sets region at boot; Node >=20 only) or strictly more correct (X-Ray preserved, S3 gains a region). None removes or renames a public export or changes an accessor's shape, so semver-minor is appropriate. Document the timing nuances in `CHANGELOG.md` under "Changed" so consumers aren't surprised.

**Answer:** Keep 1.4.0 / minor
**Decision:** Target 1.4.0, semver-minor. No public export is removed/renamed and no accessor shape changes. The behavior changes (X-Ray init timing preserved via Q2, region first-use sampling via Q3, v2-throw timing via Q4) are either no-ops in the supported runtime or strictly more correct. `CHANGELOG.md` documents them under "Changed".
**Status:** REVISED (plan body "Locked design" updated to match)

---

## Q9 — Questions-file location

The plan body says "Ask clarifying questions in `SPEC-QUESTIONS.md`", but the working instruction for this iteration is to keep the Q&A log **appended to PLAN.md**. I've put the log here in PLAN.md.

- **Option A — Keep the decision log in PLAN.md** (current approach). One document to read; the plan and its rationale stay together.
- **Option B — Split the log into `SPEC-QUESTIONS.md`** per the original plan note, leaving PLAN.md as the clean plan.

**Recommendation: Option A** for the iteration phase (everything in one place while we decide), then fold the LOCKED decisions into the plan body and `requirements.md`, optionally archiving this log to `SPEC-QUESTIONS.md` at the end. I'll update the plan's "Ask clarifying questions in SPEC-QUESTIONS.md" line to match whichever you pick.

**Answer:** A
**Decision:** Keep the decision log in PLAN.md. The stale "Ask clarifying questions in SPEC-QUESTIONS.md" line in the plan body is updated to point here.
**Status:** REVISED (plan body questions-file line updated to match)

---

## Round 2 — Grounding verified while writing requirements.md

All six Round 2 answers (Q10 to Q15) matched the recommendations. [requirements.md](requirements.md) now cites them as locked decisions, with the provisional markers removed.

- **The Node floor is 22, not 20.** `package.json` sets `engines.node` to `>=22.0.0`, and `src/lib/tools/vars.js` calls `process.exit(1)` on Node.js < 22 right after loading `AWS.classes.js`. My Q4 text said the floor was 20 and that a Node.js < 18 consumer would "now load successfully". Both were wrong. The Q4 decision text is corrected, and Q13 covers the consequence.
- **`ApiRequest.class.js` depends on load-time X-Ray.** It destructures `AWSXRay` from `AWS.classes.js` at module scope and only creates X-Ray subsegments (`captureAsyncFunc`) when that value is non-null. Without Q2's load-time init, X-Ray users would silently lose request subsegments, so Q2 protects the package's own code as well as consumers.
- **Correction to the Q2 rationale.** `USE_XRAY` is a `const` computed once at module load, so setting an X-Ray env var after import has no effect. With the load-time `initializeXRay()` in place, changing `AWS.XRay` to `return initializeXRay();` adds no runtime behavior. It's harmless and keeps the getter correct if the load-time call ever moves, so it stays as decided. Say so if you'd rather drop it.
- **Nothing in `src/` calls `initPowertools()`.** `getActiveTracingProvider()` returns `null` until it runs, so for consumers no TracingProvider is active, and first-use instrumentation (Q5) matches today's load-time instrumentation. Only tests call it. Separately, `docs/features/tools/powertools-integration.md` uses `tools.PowertoolsInit.getState()`, but `tools` doesn't export `PowertoolsInit`. Both are listed as out of scope in requirements.md.
- **CI does not set `AWS_REGION`** (`.github/workflows/test.yml`). Under test, `AWS.REGION` falls back to `us-east-1`, and today the missing-region warning fires at import. Q3a's conclusion holds; its note is corrected.
- **No circular require.** Neither `PowertoolsInit.js` nor `src/lib/utils/TracingProvider.js` requires `AWS.classes.js`. Today `PowertoolsInit` is first loaded from inside the `#SDK` initializer via `getTracingProvider()`; afterward it is first loaded by `src/lib/tools/index.js` for `flushMetrics`. Benign.
- **Types need no change.** `types/lib/tools/index.d.ts` declares each `sdk` as `object`, and `XRay` and `AWSXRay` as `object | null`.
- **Documentation tests.** The link-validity test skips `.kiro/specs`, but the JSDoc tests scan `src/lib/tools/*.js` and the example tests scan `docs/` and `README.md`, so the JSDoc and doc edits must pass them (Requirement 11.6).
- **Refinement.** The success criterion "No `@aws-sdk/*` package is `require`d..." is scoped to the five service-client packages, so packages that other dependencies load can't make it untestable. The plan body is updated to match.

---

## Q10 — A converted accessor's SDK package can't be loaded: throw, or report unavailable?

Today a missing `@aws-sdk/client-dynamodb` makes `require("@63klabs/cache-data")` fail for everyone. After the change it can only fail at the first `AWS.dynamo` read. `AWS.secrets` handles this case by returning `available: false` and a `get` that rejects, but the Non-goals rule out adding properties to the converted accessors, so they can't copy that shape.

- **Option A — Throw the original `require()` error at first read, and don't memoize the failure.** Shape unchanged. Consumers get the same error as today (`MODULE_NOT_FOUND`), just later and only for the service that needs it. The next read retries.
- **Option B — Mirror `secrets`:** memoize `{ available: false, reason }` and make the verbs reject. Adds two properties to three accessors, which conflicts with the Non-goals, and turns a synchronous throw into rejected promises.
- **Option C — Throw, and memoize the failure**, so later reads rethrow the cached error without retrying.

**Recommendation: Option A.** It keeps the shape, keeps the three core services loud, and needs no extra state. A retry costs one module-resolution lookup, and only in an environment that's already broken. `secrets` keeps its non-throwing contract because it's optional; the other three back the cache itself.

**Answer:** A
**Decision:** Option A. When a converted accessor's package can't be loaded, the first read throws the original `require()` error. The failure isn't memoized, so the next read retries. The accessor shape is unchanged, and `secrets` keeps its non-throwing contract.
**Status:** REVISED (requirements.md Requirement 7 locked)

---

## Q11 — Client construction moves out of Lambda's init phase

Package code first reads `AWS.dynamo` and `AWS.s3` in the cache's storage reads and writes (`src/lib/dao-cache.js`), which normally run during an invocation. Today both SDK packages load, and both clients are built, at `require()`, which is in the init phase when the package is required at module scope. After the change that work happens at the first cache read, usually inside the first invocation. For an on-demand cold start both phases are on the first request's path anyway. Provisioned concurrency runs the init phase before traffic arrives, so those functions would pay this cost on their first request instead.

- **Option A — Document it.** The `tools.AWS` docs and the CHANGELOG show reading the accessors at module scope (`tools.AWS.dynamo; tools.AWS.s3;`) to build the clients during init. No code.
- **Option B — Add an opt-in environment variable** that builds all clients at load. New public surface.
- **Option C — Have `Cache.init()` read `AWS.dynamo` and `AWS.s3`** (skipped when `inMemoryOnly` is set), so cache users keep today's timing automatically and other consumers keep the savings. Touches `dao-cache.js` and widens the regression surface this spec was scoped to avoid.

**Recommendation: Option A**, and revisit C if the Q7 benchmark shows the first-read cost is material. A matches the "nothing constructed until first use" goal, and the consumers who care pay one documented line.

**Answer:** A and revisit C if benchmark warrants it
**Decision:** Option A. The `tools.AWS` docs and the CHANGELOG show reading the accessors at module scope to build the clients during the init phase. Option C (`Cache.init()` pre-warming `dynamo` and `s3`) is revisited only if the Q7 benchmark shows a material first-read cost; the benchmark results record that number.
**Status:** REVISED (requirements.md 11.4 locked)

---

## Q12 — S3 region outside Lambda when `AWS_REGION` is unset

The JS SDK v3 takes a client's region from the constructor first, then `AWS_REGION`, then the shared config file ([AWS SDK for JavaScript v3: Set the AWS Region](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-region.html)). Today S3 gets no constructor region, so with `AWS_REGION` unset it can use a region from `~/.aws/config`, while DynamoDB and SSM get `us-east-1` from the `AWS.region` fallback. After Q3, S3 also gets `us-east-1`. Lambda always sets `AWS_REGION`, so this only reaches local scripts and non-Lambda hosts.

- **Option A — Accept and document.** All three services resolve their region the same way.
- **Option B — Pass a region to S3 only when `AWS_REGION` is set**, and otherwise let the SDK resolve it. Preserves today's S3 behavior exactly, but keeps the inconsistency, and the fallback warning still won't cover S3.

**Recommendation: Option A.** It's the consistency Q3 asked for, and in the affected case DynamoDB and SSM already run against `us-east-1`.

**Answer:** A
**Decision:** Option A. Outside Lambda with `AWS_REGION` unset, S3 now uses `us-east-1` like DynamoDB and SSM. Documented in the CHANGELOG.
**Status:** REVISED (requirements.md behavior-change row 3 locked)

---

## Q13 — SDK v2 guard: scope, and the Node 22 floor

Two clarifications of Q4:

1. **Scope.** The guard goes in `dynamo`, `s3`, and `ssm` only. `secrets` was never under the `#SDK` throw and stays unchanged.
2. **Reachability.** Through the package entry, `vars.js` loads `AWS.classes.js` and then exits on Node.js < 22. Today, on Node.js < 18, the `#SDK` throw fires first. After the change, the floor's `console.error` and `process.exit(1)` fire first, and the guard is reachable only when `AWS.classes.js` is required directly.

- **Option A — Accept both.** Keep the guard as a defensive check per Q4, and note in the CHANGELOG which message Node.js < 18 now gets.
- **Option B — Drop the guard** as unreachable through the package entry. Reverses Q4.

**Recommendation: Option A.**

**Answer:** A
**Decision:** Option A. The guard is in `dynamo`, `s3`, and `ssm` only, kept as a defensive check. The CHANGELOG notes that on Node.js < 18 the package now stops at the `vars.js` Node 22 floor.
**Status:** REVISED (requirements.md 6.3 and its note locked)

---

## Q14 — A migration-era test fails whenever `AWS.classes.js` has uncommitted changes

Property 7 ("Source Code Immutability") in `test/migration/property/test-migration-completeness-property-tests.jest.mjs` runs `git status --porcelain` on `AWS.classes.js`, `ApiRequest.class.js`, or `dao-endpoint.js` and fails if the file shows a change, staged or not. It's in the default suite (`testMatch: **/test/**/*.jest.mjs`) and draws 10 times from the three files, so with only `AWS.classes.js` modified it fails about 98% of runs. CI passes because it runs on a clean checkout. The test guarded the completed Mocha-to-Jest migration. This comes from reading the test, not from running it against a modified file.

It conflicts with Q6a (full suite passes with existing tests unmodified) during local verification, and with `test-requirements.md` ("all tests must pass before commit").

- **Option A — Leave it.** Run the Q6a full-suite check after committing on the feature branch, and accept one known failure before commit.
- **Option B — Remove `src/lib/tools/AWS.classes.js` from that test's `sourceFiles` list.** A one-line change to an obsolete guard, logged as an explicit exception to Q6's "additions only" rule. No accessor or getter-spy test is touched, so Q6's intent holds.
- **Option C — Retire Property 7.** Removes the trap for all three files, but is broader than this spec.

**Recommendation: Option B**, with C as a follow-up.

**Answer:** Option B, with C as a follow-up.
**Decision:** Option B. Remove `src/lib/tools/AWS.classes.js` from Property 7's `sourceFiles` list. This is the one logged exception to Q6's "additions only" rule. Retiring Property 7 (Option C) is a follow-up outside this spec.
**Status:** REVISED (requirements.md 9.1 locked)

---

## Q15 — How much documentation drift to fix

This spec has to edit the accessor JSDoc and the `tools.AWS` docs anyway. These inaccuracies are in that same text, each verified against source:

- **`AWS.dynamo` getter JSDoc:** `@returns` lists `sdk.DynamoDB`, which isn't returned.
- **`AWS` class-level JSDoc:** says it "Uses AWS SDK v2 or v3 depending on the Node.js version". `dynamo.sdk` lists `DynamoDB`; `s3.sdk` lists `S3Client` (actual: `S3`); `ssm.sdk` lists `GetParameterCommand` (actual: `GetParametersCommand`). The dynamo example's `new AWS.dynamo.sdk.DynamoDB.DocumentClient(...)` is v2 code, and the SSM example comment lists `SSM` and `PutParameterCommand`. `@property {object} AWSXRay` names a class property that doesn't exist (the getter is `XRay`).
- **`AWS.XRay` getter JSDoc:** `@returns {object}`, but it can return `null`.
- **`tools.AWS` section of `docs/features/tools/README.md`:** `AWS.dynamodb.put` / `AWS.dynamodb.get` should be `AWS.dynamo`; `s3Body.transformToString()` uses an undefined variable (should be `result.Body`); "Node < 18 is unsupported ... Node 18+ environments will use AWS-SDK version 3" predates the Node 22 floor; "only those SDKs are included" omits Secrets Manager.

- **Option A — Fix all of the above.**
- **Option B — Fix the `AWS.classes.js` JSDoc only**, which the documentation standards require for modified code, and leave the README for later.
- **Option C — Only add the lazy-construction notes.**

**Recommendation: Option A.** Every item is in text this spec edits, none changes behavior, and the documentation standards require modified docs to be accurate.

**Answer:** A
**Decision:** Option A. Fix every item listed above.
**Status:** REVISED (requirements.md 11.5 locked)

---

## Next step

All fifteen questions are locked. [requirements.md](requirements.md), [design.md](design.md), and [tasks.md](tasks.md) are written. Implementation starts at task 1.
