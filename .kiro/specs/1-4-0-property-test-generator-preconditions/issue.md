# test: property-test generators can violate their own preconditions — intermittent release-blocking failures

## Metadata

- **GitHub Issue**: [#236](https://github.com/63Klabs/cache-data/issues/236)
- **Type**: bug, javascript, Approved for Development
- **Assigned**: chadkluck
- **Created from issue**: 2026-10-03

> **Note:** Since this issue was imported directly from GitHub it should be reviewed before a plan or requirements document is generated. Verify the behavior empirically rather than trusting the issue report. All recommendations should be reviewed and challenged to find the correct solution that fits within the project scope and parameters. While the goal may be good, there may be better paths to reaching it. Review every issue as a senior level architect, software engineer, and security analyst before providing recommendations for plan, specs, requirements, design, etc.

## Description

### Summary

A property-based test blocked the v1.3.17 release package build after passing on every commit run. The test was not detecting a defect in `src/` — its fast-check generator was emitting inputs that the property's own precondition excludes, so the assertion was being applied to values the implementation is specified to reject.

Because fast-check draws a fresh random seed per run, this class of bug is invisible on most runs and surfaces at random. It cost a release cycle. Two more confirmed instances of the same pattern remain in the suite, one of which is roughly **2.5x more likely to fire per run** than the one that broke the release.

### The pattern

A generator filters a string against a denylist as a *whole string*, but the implementation under test applies that denylist to each `/`-delimited *segment* as well. When the generator's charset includes `/`, it can produce a value the implementation correctly rejects.

The release failure (`seed: 1171791119`, counterexample `["0","/__proto__",{}]`):

```js
// generator: rejects only the whole string
fc.stringMatching(/^[a-zA-Z0-9_.+=@:/-]{1,20}$/).filter(
    s => !DANGEROUS.has(s) && !PROTO_KEYS.has(s)
),
...
expect(result.assigned).toBe(true);   // asserts acceptance
```

```js
// ParameterKeySafety.checkSecretName — also rejects per segment, by design
for (const seg of name.split('/')) {
    if (seg.length === 0) continue;
    if (ParameterKeySafety.DANGEROUS_KEYS.includes(seg)) {
        return { safe: false, reason: 'dangerous-segment' };
    }
    if (ParameterKeySafety.PROTOTYPE_KEYS.has(seg)) {
        return { safe: false, reason: 'prototype-segment' };
    }
}
```

`"/__proto__"` → segments `["", "__proto__"]` → `dangerous-segment`. The implementation is right; the generator's precondition was incomplete.

### Confirmed remaining instances

Both in `test/security/parameter-key-safety-tests.jest.mjs`. Rates measured over 100,000 generated draws each, checked against the implementation's own predicate.

| Location | Test | Measured rate | numRuns | Approx. per-suite-run risk |
|---|---|---|---|---|
| ~line 389 (`describe` at 325) | `Property: any safe group + secret name round-trips the value` | 1 in 20,000 draws | 200 | **~1 in 100** |
| ~line 300 (`describe` at 225) | `Property A5: generated Secrets Manager ARNs are accepted` | 1 in 100,000 draws | 100 | ~1 in 1,000 |

Observed counterexamples:

- `"/__proto__"`, `"prototype/.="`, `"0/prototype"` — the `setGroupedSecret` secret-name arbitrary, same whole-string-only filter as the one that broke the release
- `"arn:aws:secretsmanager:7at-vj-:254026987937:secret:/__proto__/_-allcal"` — the `Property A5` ARN arbitrary, which applies **no** filter to the secret-name portion while asserting `isSafeSecretName(arn) === true`

The suite runs on four Node matrix legs, so the per-CI-run probability that at least one leg fails is roughly four times the per-run figure. That is a low-but-real chance of another randomly-timed release block.

### Seed reproducibility gap

113 test files call `fc.assert`; only 12 pass a `seed` option. The convention already exists in `test/response/` and `test/powertools/`:

```js
seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
```

Without it, a counterexample reported in CI logs cannot be replayed locally — the seed is printed, but there is no way to feed it back in. `.kiro/steering/test-execution-monitoring.md` already calls for seed preservation under "Property-Based Testing Specific Guardrails"; the suite is largely not following it.

### Proposed work

1. Fix the two confirmed instances above by making each generator's filter mirror the implementation's segment rule (or by generating only from a known-safe alphabet).
2. Audit the remaining property tests for the same shape: a generator whose charset contains a separator (`/`, `:`, `.`) combined with a whole-string-only filter, or no filter at all, where the implementation validates per segment.
3. Add `seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined` to the property tests that lack it, so a CI counterexample is replayable.
4. Consider a scheduled multi-seed sweep (e.g. nightly, iterating `FC_SEED`) so precondition bugs surface on a cron rather than during release packaging. A 40-seed sweep over a single file completes in well under a minute locally.

Item 1 is the release-risk item. Items 2–4 are the systemic fix.

### Context

The equivalent defect in `setGroupedSecretMap`'s round-trip property was fixed while unblocking the v1.3.17 release: the generator filter was made segment-aware, `FC_SEED` support was added, and five deterministic `it.each` cases now cover the `dangerous-segment` / `prototype-segment` rejection path through `setGroupedSecretMap` — which previously was reached only by random draw, which is why it showed up as a failure rather than as passing coverage.

No `src/` changes were required then and none are expected here. `ParameterKeySafety` behaved correctly in every case; the defects are in the tests' preconditions.
