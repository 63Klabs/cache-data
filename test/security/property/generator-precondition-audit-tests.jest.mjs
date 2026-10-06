/**
 * Precondition audit for the safety-critical `ParameterKeySafety` arbitraries.
 *
 * Spec: `.kiro/specs/1-4-0-property-test-generator-preconditions/` (v1.4.0),
 * design § E. This is the primary control that spec introduces, replacing the
 * one-time manual audit the original issue proposed.
 *
 * What it checks: every arbitrary registered in `AUDITED_ARBITRARIES` is sampled
 * directly and each draw is checked against the acceptance predicate the
 * consuming property relies on. A draw the implementation rejects is a
 * *precondition violation* — the generator emitted a value its own property
 * excludes, so the property would assert a guarantee the implementation never
 * made for that input. That is the defect class that blocked the v1.3.17 release
 * package build after passing on every prior commit run.
 *
 * Why direct sampling rather than a seed sweep: re-running the 3,096-test suite
 * to buy `numRuns` extra draws of the one generator that matters spends almost
 * the whole budget elsewhere. Measured during design — a 40-seed full-suite
 * sweep costs ~33 minutes of runner time for ~15% detection of a 1-in-49,383
 * defect, while direct sampling buys ~98% detection in seconds. Each registry
 * entry is sampled at a budget sized to its OWN measured violation rate; see
 * `AUDIT_DRAWS` for the per-entry figures and why one shared budget was not
 * enough.
 *
 * This test spawns no child processes and invokes no npm script; all sampling is
 * in-process, per `.kiro/steering/test-execution-monitoring.md`.
 *
 * @see .kiro/specs/1-4-0-property-test-generator-preconditions/design.md § A, § E
 * @see test/helpers/parameter-key-arbitraries.mjs
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

import { AUDITED_ARBITRARIES } from '../../helpers/parameter-key-arbitraries.mjs';

// Imported for the digit-lemma guard below. `DANGEROUS_KEYS` and
// `PROTOTYPE_KEYS` are already public static fields on the class, so reading
// them needs no new export from `src/` and no test harness.
const ParameterKeySafety = (await import('../../../src/lib/utils/ParameterKeySafety.class.js'))
	.default;

/**
 * Baseline draw budget, used by any registry entry that does not state its own.
 *
 * @type {number}
 */
const BASELINE_DRAW_COUNT = 200000;

/**
 * Effective baseline budget for this run.
 *
 * Sensitivity is per-generator, so the budget is too: an entry may carry a
 * `drawCount` sized to its own measured violation rate (see
 * `AuditedArbitrary.drawCount`), and only entries without one use this value.
 *
 * Measured violation rates of the PRE-FIX generators, each over 4,000,000 draws
 * (200,000 x 20 seeds), and the detection each gets from the 200,000 baseline:
 *
 * | Entry               | Measured rate   | Seeds detecting | Detection at 200,000 |
 * |---------------------|-----------------|-----------------|----------------------|
 * | `safeSecretName`    | ~1 in 49,383    | 20 / 20         | ~98.3%               |
 * | `safeSecretNameArn` | ~1 in 666,667   |  6 / 20         | ~26%                 |
 *
 * So the baseline is the correct budget for `safeSecretName` and badly
 * insufficient for `safeSecretNameArn`, which is ~13x rarer and was NOT detected
 * at this test's committed default seed. That entry therefore carries its own
 * 2,600,000-draw budget, derived as `-ln(0.02) x 666,667`. The earlier claim of
 * a single ~1-in-50,000 rate "for the two original instances" was wrong: it came
 * from a single-seed observation of instance 2 recorded in requirements.md.
 *
 * `FC_AUDIT_DRAWS` **scales** rather than replaces. Setting it moves this
 * baseline, and every per-entry budget moves by the same factor (see
 * `BUDGET_SCALE`). The sweep workflow's `audit_draws` input is therefore a
 * uniform "sample this much wider than normal" dial that preserves the relative
 * sensitivity the per-entry budgets exist to equalize — rather than flattening
 * them back to one number, which at any value below 2,600,000 would silently
 * *reduce* the ARN budget and re-weaken the control.
 *
 * @type {number}
 */
const AUDIT_DRAWS = Number(process.env.FC_AUDIT_DRAWS ?? BASELINE_DRAW_COUNT);

/**
 * Factor by which `FC_AUDIT_DRAWS` has moved the baseline, applied to every
 * per-entry budget.
 *
 * `1` on a normal run, so per-entry budgets are used exactly as registered.
 *
 * @type {number}
 */
const BUDGET_SCALE = AUDIT_DRAWS / BASELINE_DRAW_COUNT;

/**
 * Draws materialized per `fc.sample` call.
 *
 * A memory bound, not a sensitivity knob. Peak heap at 200,000 retained draws
 * measured ~104MB, so a 2,600,000-draw budget cannot be a single `fc.sample`
 * call; it is sampled, checked, and discarded one batch at a time. Each batch
 * draws from a distinct derived seed (see `deriveBatchSeed`), so batching widens
 * the explored draw sequence instead of repeating one batch 13 times.
 *
 * @type {number}
 */
const SAMPLE_BATCH_SIZE = 200000;

/**
 * Sampling seed.
 *
 * Fixed by default so this test is deterministic: it either always passes or
 * always fails, and can never become a randomly-timed release block of the kind
 * this spec exists to eliminate. A reintroduced precondition defect either
 * appears in this specific draw sequence or does not — and at each entry's
 * budget it appears with ~98% probability, after which it fails on every run
 * until fixed. `FC_SEED` varies it in a sweep.
 *
 * This is the BASE seed. Each sampling batch derives its own seed from it, so
 * the batches of one run explore different draws rather than the same ones
 * repeatedly.
 *
 * @type {number}
 */
const SAMPLING_SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : 1;

/**
 * Counterexamples retained per arbitrary before the audit stops recording.
 *
 * The first counterexample is enough to act on; the rest are kept only to show
 * whether a violation is a one-off draw or a broad hole, without producing an
 * unbounded failure message.
 *
 * @type {number}
 */
const MAX_REPORTED_COUNTEREXAMPLES = 5;

/**
 * Resolve the draw budget for one registry entry.
 *
 * An entry's own `drawCount` wins over the baseline, scaled by whatever factor
 * `FC_AUDIT_DRAWS` has moved the baseline so a sweep widens every entry
 * proportionally. Entries without a `drawCount` take the baseline directly.
 *
 * @param {import('../../helpers/parameter-key-arbitraries.mjs').AuditedArbitrary} entry
 *   The registry entry being audited.
 * @returns {number} Draw budget for this entry on this run, at least 1.
 * @example
 * // With FC_AUDIT_DRAWS unset: 200000 for an entry with no drawCount,
 * // 2600000 for the ARN entry. With FC_AUDIT_DRAWS=400000 (scale 2):
 * // 400000 and 5200000.
 * const budget = resolveDrawCount(AUDITED_ARBITRARIES[0]);
 */
function resolveDrawCount(entry) {
	if (entry.drawCount === undefined) {
		return Math.max(1, Math.round(AUDIT_DRAWS));
	}

	return Math.max(1, Math.round(entry.drawCount * BUDGET_SCALE));
}

/**
 * Per-test timeout, scaled to that test's own draw budget.
 *
 * Measured at the baseline budget: ~0.3s for `safeSecretName` and ~1.5s per
 * 200,000 ARN draws, so the ARN entry's 2,600,000 budget runs ~20s. The scaling
 * exists so neither a large per-entry budget nor a sweep that raises
 * `FC_AUDIT_DRAWS` by an order of magnitude can trip the timeout and report a
 * budget problem as a precondition failure.
 *
 * @param {number} drawCount Draw budget for the test being timed.
 * @returns {number} Timeout in milliseconds, never below Jest's 30s default.
 * @example
 * const timeout = auditTimeoutMs(2600000); // 390000
 */
function auditTimeoutMs(drawCount) {
	return Math.max(30000, Math.ceil(drawCount / BASELINE_DRAW_COUNT) * 30000);
}

/**
 * Derive a distinct sampling seed for one batch.
 *
 * Batching exists to bound memory, and must not cost sensitivity: reusing the
 * base seed for every batch would re-draw the same `SAMPLE_BATCH_SIZE` values
 * N times and leave a 2,600,000-draw budget with the detection of 200,000.
 *
 * Batch 0 keeps the base seed unchanged, so an entry that fits in one batch is
 * sampled exactly as it was before batching was introduced. Later batches mix
 * the base seed with the batch index through an xorshift step rather than simply
 * adding the index — `base + index` would make seed 1's batch 1 identical to
 * seed 2's batch 0, so a 40-seed sweep would re-sample the same sequences
 * repeatedly instead of exploring 40x the space.
 *
 * @param {number} baseSeed The run's base sampling seed.
 * @param {number} batchIndex Zero-based batch number.
 * @returns {number} A 32-bit integer seed for this batch.
 * @example
 * deriveBatchSeed(1, 0) === 1; // batch 0 is the base seed
 * deriveBatchSeed(1, 1) !== deriveBatchSeed(2, 0); // sweeps do not overlap
 */
function deriveBatchSeed(baseSeed, batchIndex) {
	if (batchIndex === 0) {
		return baseSeed;
	}

	// Golden-ratio-scaled index, then an xorshift32 round, so consecutive base
	// seeds and consecutive batch indices land far apart.
	let mixed = (baseSeed ^ Math.imul(batchIndex + 1, 0x9e3779b1)) | 0;
	mixed ^= mixed << 13;
	mixed |= 0;
	mixed ^= mixed >>> 17;
	mixed ^= mixed << 5;
	return mixed | 0;
}

/**
 * Build the failure report for one audited arbitrary.
 *
 * The report names the generator, the counterexamples, the implementation's own
 * `{safe, reason}` descriptor for each, and which property relied on the broken
 * precondition — so a maintainer sees which test is affected rather than a bare
 * boolean. The audit is one test standing in for several properties, which is
 * exactly why the `assertedBy` attribution matters.
 *
 * @param {import('../../helpers/parameter-key-arbitraries.mjs').AuditedArbitrary} entry
 *   The registry entry whose precondition was violated.
 * @param {Array.<string>} counterexamples Retained violating draws.
 * @param {number} violationCount Total violating draws observed.
 * @param {number} drawCount Draw budget this entry was audited at.
 * @returns {string} Multi-line, human-readable failure report.
 */
function buildViolationReport(entry, counterexamples, violationCount, drawCount) {
	const lines = [
		`Precondition violation in arbitrary "${entry.name}".`,
		'',
		`${violationCount} of ${drawCount} draws (base seed ${SAMPLING_SEED}) were REJECTED by the`,
		'acceptance predicate the consuming property relies on, so that property can draw',
		'an input it is specified to exclude and then assert a guarantee the implementation',
		'never made for it.',
		'',
		`Relied on by: ${entry.assertedBy}`,
		'',
		'Counterexamples:'
	];

	for (const counterexample of counterexamples) {
		lines.push(
			`  ${JSON.stringify(counterexample)} -> ${JSON.stringify(entry.describe(counterexample))}`
		);
	}

	if (violationCount > counterexamples.length) {
		lines.push(`  ... and ${violationCount - counterexamples.length} more`);
	}

	lines.push(
		'',
		'Fix the generator, not this audit. Where the consuming property asserts a',
		'DOWNSTREAM behavior, gate the generator on the implementation predicate. Where it',
		'asserts the predicate ITSELF, narrow the generator so violating draws are',
		'unreachable — filtering on the asserted predicate would make the property vacuous.',
		'See .kiro/specs/1-4-0-property-test-generator-preconditions/design.md § B, § C.'
	);

	return lines.join('\n');
}

describe('Generator precondition audit', () => {
	// Feature: 1-4-0-property-test-generator-preconditions, Property 1: Gate-filtered
	// secret names are always accepted
	// Feature: 1-4-0-property-test-generator-preconditions, Property 2: Constructed
	// ARNs are always accepted
	//
	// Deliberately a generic loop over AUDITED_ARBITRARIES with no per-arbitrary
	// knowledge: the Requirement 4 boundary is maintained by registering entries
	// in test/helpers/parameter-key-arbitraries.mjs, never by editing this file.
	// Sampling the registry's `arbitrary` field also means the audit checks the
	// exact object the property uses — if it held its own copy, it would verify
	// the copy while the real generator drifted, which is the defect class this
	// audit exists to close.
	describe.each(AUDITED_ARBITRARIES.map((entry) => [entry.name, entry]))(
		'%s',
		(name, entry) => {
			const drawCount = resolveDrawCount(entry);

			it(
				`accepts every one of ${drawCount} draws (base seed ${SAMPLING_SEED})`,
				() => {
					const counterexamples = [];
					let violationCount = 0;
					let drawnCount = 0;

					// Sampled in batches so peak heap stays at one batch regardless of
					// budget; each batch takes its own derived seed so the batches
					// explore different draws rather than repeating batch 0.
					for (
						let batchIndex = 0;
						drawnCount < drawCount;
						batchIndex += 1
					) {
						const batchSize = Math.min(SAMPLE_BATCH_SIZE, drawCount - drawnCount);
						const draws = fc.sample(entry.arbitrary, {
							numRuns: batchSize,
							seed: deriveBatchSeed(SAMPLING_SEED, batchIndex)
						});

						expect(draws).toHaveLength(batchSize);
						drawnCount += draws.length;

						for (const draw of draws) {
							if (entry.predicate(draw)) {
								continue;
							}

							violationCount += 1;
							if (counterexamples.length < MAX_REPORTED_COUNTEREXAMPLES) {
								counterexamples.push(draw);
							}
						}
					}

					expect(drawnCount).toBe(drawCount);

					if (violationCount > 0) {
						// Thrown rather than asserted so the whole report reaches the
						// console intact; a boolean matcher would report `false`.
						throw new Error(
							buildViolationReport(entry, counterexamples, violationCount, drawCount)
						);
					}

					expect(violationCount).toBe(0);
				},
				auditTimeoutMs(drawCount)
			);
		}
	);
});

describe('Digit-lemma premise', () => {
	// Feature: 1-4-0-property-test-generator-preconditions, Property 3: No reserved
	// key contains a digit
	//
	// This is the premise that makes `safeSecretNameArn` safe BY CONSTRUCTION
	// rather than by filtering. That generator forces at least one digit into
	// every `/`-delimited segment of the secret-name portion. Because no reserved
	// key contains a digit, no segment can equal a member of `DANGEROUS_KEYS` or
	// `PROTOTYPE_KEYS`, so the `dangerous-segment` and `prototype-segment`
	// rejection paths are unreachable — established without ever consulting
	// `isSafeSecretName`, which is the predicate the consuming property asserts
	// and therefore must not filter on.
	//
	// The premise is runtime-dependent. `PROTOTYPE_KEYS` is built from
	// `Object.getOwnPropertyNames(Object.prototype)`, so a future JavaScript
	// runtime that adds an own property to `Object.prototype` whose name contains
	// a digit would invalidate the lemma. If that happens, the ARN generator would
	// quietly stop being safe by construction: it would start emitting draws the
	// implementation rejects, and the property would resume asserting acceptance
	// for inputs that were never specified as acceptable — the exact low-rate,
	// randomly-timed defect this spec exists to eliminate.
	//
	// So the premise is asserted directly, here, where it fails loudly and names
	// the offending key. A guard on the lemma is cheap; rediscovering its loss
	// from a one-in-tens-of-thousands CI failure during release packaging is not.
	//
	// @see .kiro/specs/1-4-0-property-test-generator-preconditions/design.md § C, § E

	/**
	 * Every reserved name the segment denylists reject, deduplicated.
	 *
	 * `DANGEROUS_KEYS` (an Array) and `PROTOTYPE_KEYS` (a Set) overlap on
	 * `constructor`, so the union is taken rather than the concatenation. Both are
	 * frozen public static fields, read directly — a copy here could drift from
	 * the implementation and certify a premise the implementation no longer holds.
	 *
	 * @type {Array.<string>}
	 */
	const RESERVED_KEYS = Array.from(
		new Set([...ParameterKeySafety.DANGEROUS_KEYS, ...ParameterKeySafety.PROTOTYPE_KEYS])
	);

	/**
	 * Reserved-key count measured when this spec was written.
	 *
	 * Node 22: 3 `DANGEROUS_KEYS` plus 11 `Object.prototype` own-property names,
	 * overlapping on `constructor`, for 13 distinct names. Used as a floor rather
	 * than an equality so a runtime that *adds* a digit-free prototype property
	 * does not fail a check it has not actually broken, while a denylist that has
	 * been emptied, truncated, or swapped for a narrower one does.
	 *
	 * @type {number}
	 */
	const MEASURED_RESERVED_KEY_COUNT = 13;

	// Guards against the whole block passing vacuously. Every assertion below
	// quantifies over RESERVED_KEYS, so an empty or gutted denylist would satisfy
	// all of them while proving nothing — and would simultaneously mean the
	// implementation had stopped rejecting reserved segments at all.
	it('enumerates at least the reserved keys measured for this spec', () => {
		expect(RESERVED_KEYS.length).toBeGreaterThan(0);
		expect(RESERVED_KEYS.length).toBeGreaterThanOrEqual(MEASURED_RESERVED_KEY_COUNT);
		expect(ParameterKeySafety.DANGEROUS_KEYS.length).toBeGreaterThan(0);
		expect(ParameterKeySafety.PROTOTYPE_KEYS.size).toBeGreaterThan(0);
	});

	it('contains no reserved key with a digit, so a digit-bearing segment cannot collide', () => {
		const offenders = RESERVED_KEYS.filter((key) => /[0-9]/.test(key));

		if (offenders.length > 0) {
			// Thrown rather than asserted so the explanation reaches the console
			// intact. A bare matcher would report the array and leave the next
			// maintainer to work out why it matters.
			throw new Error(
				[
					`The digit lemma no longer holds: ${JSON.stringify(offenders)} contain a digit.`,
					'',
					'test/helpers/parameter-key-arbitraries.mjs builds `safeSecretNameArn` so that',
					'every "/"-delimited segment carries at least one digit, relying on no reserved',
					'key containing one. That premise has broken, so the generator can now emit a',
					'segment equal to a reserved key — and `Property A5: generated Secrets Manager',
					'ARNs are accepted` would assert `isSafeSecretName(arn) === true` for an ARN the',
					'implementation is specified to reject.',
					'',
					'Re-narrow the generator on a character the reserved keys still cannot contain.',
					'Do NOT fix this by filtering on `isSafeSecretName` or `checkSecretName`: that',
					'property asserts the predicate itself, so filtering on it would make the',
					'property vacuous rather than correct.',
					'See .kiro/specs/1-4-0-property-test-generator-preconditions/design.md § C.'
				].join('\n')
			);
		}

		expect(offenders).toEqual([]);
	});

	// Stronger than the lemma strictly needs, and deliberately so. The design
	// measured all 13 names as matching /^[A-Za-z_]+$/ — no digit and none of
	// `. + = @ : - /`. Asserting the full shape means a reserved name gaining any
	// character the generator's alphabet can produce surfaces here, not only one
	// gaining a digit.
	it('contains only letters and underscores in every reserved key', () => {
		for (const key of RESERVED_KEYS) {
			expect(key).toMatch(/^[A-Za-z_]+$/);
		}
	});
});
