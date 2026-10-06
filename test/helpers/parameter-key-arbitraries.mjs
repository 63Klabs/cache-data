/**
 * Shared fast-check arbitraries for the ParameterKeySafety property tests.
 *
 * This module is the single source of truth for every safety-critical arbitrary
 * used against `ParameterKeySafety`. The property tests and the precondition
 * audit test MUST import the same arbitrary objects from here. If the audit held
 * its own copy, it would verify the copy while the real generator drifted — which
 * is exactly the defect class that spec 1-4-0-property-test-generator-preconditions
 * exists to close.
 *
 * Not a test file: the name ends in `.mjs` rather than `.jest.mjs`, so Jest's
 * `testMatch` of `**\/test\/**\/*.jest.mjs` does not collect it as a suite.
 *
 * @module test/helpers/parameter-key-arbitraries
 * @see .kiro/specs/1-4-0-property-test-generator-preconditions/design.md § A, § B
 */

import fc from 'fast-check';

import ParameterKeySafety from '../../src/lib/utils/ParameterKeySafety.class.js';

/**
 * Secret names that `ParameterKeySafety.checkSecretName` accepts.
 *
 * Draws over the full Secrets Manager character set — `/`, `:`, `+`, `=`, `@`,
 * `.`, `_`, `-` plus alphanumerics — and then gates each draw on the
 * implementation's own acceptance predicate. Roughly 42% of draws contain `/`,
 * so multi-segment punctuation coverage is retained rather than narrowed away.
 *
 * Why filtering here is a precondition and NOT a tautology: the properties that
 * consume this arbitrary assert `setGroupedSecret` / `setGroupedSecretMap`
 * *assignment* behavior — `assigned: true`, group enumerability, and value
 * round-trip — not `checkSecretName`'s verdict. The predicate is the gate that
 * establishes the property's stated precondition; the behavior under test is
 * downstream of it, so the property can still fail. Contrast this with an
 * arbitrary feeding a property that asserts the predicate itself, which must be
 * made safe by construction instead (see Requirement 2).
 *
 * The filter calls `checkSecretName` rather than hand-mirroring its per-segment
 * denylist rule. A hand-mirror is correct only until the implementation grows a
 * rule the mirror does not know about; calling the implementation means this
 * precondition cannot drift when the rule changes.
 *
 * @type {import('fast-check').Arbitrary<string>}
 * @example
 * import fc from 'fast-check';
 * import { safeSecretName } from '../helpers/parameter-key-arbitraries.mjs';
 *
 * fc.assert(
 *     fc.property(safeSecretName, (secretName) => {
 *         const store = {};
 *         const result = ParameterKeySafety.setGroupedSecret(store, 'app', secretName, 'v');
 *         expect(result.assigned).toBe(true);
 *         expect(store.app[secretName]).toBe('v');
 *     }),
 *     { numRuns: 200 }
 * );
 */
export const safeSecretName = fc
	.stringMatching(/^[a-zA-Z0-9_.+=@:/-]{1,20}$/)
	.filter((value) => ParameterKeySafety.checkSecretName(value).safe);
/**
 * One `/`-delimited segment of a secret name, guaranteed to carry a digit.
 *
 * Shape: up to 8 secret-name characters, then exactly one digit, then up to 8
 * more. The digit is what makes the segment safe — see `safeSecretNameArn` for
 * the full argument.
 *
 * Exported so the precondition audit can sample segments directly and confirm
 * that no draw equals a reserved key.
 *
 * Safe by construction, NOT by filtering: this arbitrary feeds a property that
 * asserts `isSafeSecretName(...) === true`, so filtering on that predicate
 * would make the property vacuous — it would be unable to fail and would test
 * nothing. Instead every segment carries at least one digit, and no member of
 * `DANGEROUS_KEYS` or `PROTOTYPE_KEYS` contains a digit (asserted directly by
 * the digit-lemma guard in the audit test), so no segment can collide with a
 * reserved key.
 *
 * Do NOT "simplify" this into a `.filter()` on `isSafeSecretName` or
 * `checkSecretName`.
 *
 * @type {import('fast-check').Arbitrary<string>}
 * @example
 * import fc from 'fast-check';
 * import { secretNameSegment } from '../helpers/parameter-key-arbitraries.mjs';
 *
 * // Every draw contains a digit, so none can equal a reserved key
 * for (const segment of fc.sample(secretNameSegment, 10)) {
 *     expect(/[0-9]/.test(segment)).toBe(true);
 * }
 */
export const secretNameSegment = fc
	.tuple(
		fc.stringMatching(/^[a-zA-Z0-9_.+=@-]{0,8}$/),
		fc.stringMatching(/^[0-9]$/),
		fc.stringMatching(/^[a-zA-Z0-9_.+=@-]{0,8}$/)
	)
	.map(([before, digit, after]) => before + digit + after);

/**
 * Well-formed Secrets Manager ARNs that `ParameterKeySafety` accepts.
 *
 * Composed as `arn:aws:secretsmanager:<region>:<accountId>:secret:<name>-<suffix>`,
 * where `<name>` is 1-4 `secretNameSegment` draws joined with `/` and
 * optionally preceded by a leading `/`. The optional leading separator keeps
 * the implementation's empty-segment skip path (`if (seg.length === 0) continue`)
 * covered. The region, account-id, and suffix shapes are carried over unchanged
 * from the inline generator this replaces, so ARN coverage is preserved.
 *
 * Safe by construction, NOT by filtering: the consuming property asserts
 * `ParameterKeySafety.isSafeSecretName(arn) === true`, which is the predicate
 * under test. Establishing the precondition with a `.filter()` on that same
 * predicate would make the property vacuous — it could never fail, and the
 * acceptance behavior it exists to verify would go untested. Safety instead
 * comes from the digit lemma: every segment carries at least one digit, and no
 * member of `DANGEROUS_KEYS` or `PROTOTYPE_KEYS` contains a digit, so the
 * `dangerous-segment` and `prototype-segment` branches are unreachable without
 * ever consulting the predicate. The lemma's premise is runtime-dependent, so
 * the audit test asserts it directly rather than trusting it.
 *
 * Do NOT "simplify" this into a `.filter()` on `isSafeSecretName` or
 * `checkSecretName`. Doing so would still pass, silently and forever.
 *
 * Coverage measured over 500,000 draws: 0 violations; ~75% multi-segment; `/`
 * present in ~87%; each of `+ = @ . _` present in ~82%; `-` in 100%.
 *
 * @type {import('fast-check').Arbitrary<string>}
 * @example
 * import fc from 'fast-check';
 * import { safeSecretNameArn } from '../helpers/parameter-key-arbitraries.mjs';
 *
 * fc.assert(
 *     fc.property(safeSecretNameArn, (arn) => {
 *         expect(ParameterKeySafety.isSafeSecretName(arn)).toBe(true);
 *     }),
 *     { numRuns: 100 }
 * );
 */
export const safeSecretNameArn = fc
	.tuple(
		fc.stringMatching(/^[a-z0-9-]{2,20}$/), // region
		fc.stringMatching(/^[0-9]{12}$/), // account id
		fc.array(secretNameSegment, { minLength: 1, maxLength: 4 }), // secret name segments
		fc.boolean(), // leading "/" on the secret name portion
		fc.stringMatching(/^[a-zA-Z0-9]{6}$/) // AWS-appended suffix
	)
	.map(([region, accountId, segments, hasLeadingSlash, suffix]) => {
		const secretName = `${hasLeadingSlash ? '/' : ''}${segments.join('/')}`;
		return `arn:aws:secretsmanager:${region}:${accountId}:secret:${secretName}-${suffix}`;
	});
/**
 * One entry in the precondition-audit registry.
 *
 * Pairs a generator with the acceptance predicate every one of its draws must
 * satisfy. This shape is the contract between this module and
 * `test/security/property/generator-precondition-audit-tests.jest.mjs`: the
 * audit iterates the registry rather than holding its own list, so the audit and
 * the properties always agree on what is under audit.
 *
 * Entries may also carry their own draw budget. Sensitivity is per-generator,
 * not per-registry: a budget that gives ~98% detection for one entry can give
 * ~26% for another whose violation rate is an order of magnitude rarer, so a
 * single shared budget silently under-audits the rarer entry. `drawCount` is how
 * an entry states the budget its own measured rate requires.
 *
 * @typedef {object} AuditedArbitrary
 * @property {string} name Stable identifier used in audit failure output.
 * @property {import('fast-check').Arbitrary<string>} arbitrary The exact
 *   arbitrary object the property under test uses — not a copy.
 * @property {function(string): boolean} predicate Must return `true` for every
 *   draw. A `false` return is a precondition violation.
 * @property {function(string): {safe: boolean, reason: string|null}} describe
 *   Full diagnostic descriptor for failure output, so a violation reports *why*
 *   the implementation rejected the draw rather than a bare boolean.
 * @property {string} assertedBy Which property relies on this precondition, so
 *   an audit failure names the affected test.
 * @property {number} [drawCount] Draws this entry needs for ~98% detection of a
 *   reintroduced defect at its own measured violation rate. **Optional**; when
 *   omitted the audit falls back to its baseline budget, which is
 *   `FC_AUDIT_DRAWS` when set and `200000` otherwise. When `FC_AUDIT_DRAWS` is
 *   set it scales this value by the same factor it moves the baseline, so a
 *   sweep widens every entry proportionally rather than flattening the per-entry
 *   budgets back to one number. Must be a positive integer.
 */

/**
 * The arbitraries under precondition audit, each paired with the predicate that
 * must accept every draw.
 *
 * Registering an arbitrary here is what brings it under audit. The Requirement 4
 * boundary is therefore maintained by **adding entries to this array**, never by
 * editing the audit test — the audit is a generic loop over this registry and
 * has no per-arbitrary knowledge. Adding a safety-critical arbitrary without
 * registering it leaves it unaudited, which is the one failure mode to watch for
 * in review.
 *
 * **The boundary is the predicate, not the character set.** A generator can only
 * violate a precondition when the acceptance predicate applies a rule the
 * generator does not mirror; which characters are involved is incidental. In
 * `src/`, only the `checkSecretName` / `isSafeSecretName` family applies rules to
 * *substructure* (its per-segment denylist scan), and `resolveGroupAndSegments`
 * gates success on segment depth in the same shape. `checkKey` / `isSafeKey` are
 * whole-value only and structurally cannot exhibit this defect. That is the whole
 * audited set.
 *
 * Consequently this audit does **NOT** require manual review of all 113 files
 * that call `fc.assert`. The charset grep used during verification — searching
 * for `fc.stringMatching` arbitraries whose character class contains `/` or `:` —
 * is retained only as a *discovery heuristic* for finding new candidates to
 * register. It does not define the boundary.
 *
 * @type {Array.<AuditedArbitrary>}
 * @example
 * import { AUDITED_ARBITRARIES } from '../../helpers/parameter-key-arbitraries.mjs';
 *
 * for (const entry of AUDITED_ARBITRARIES) {
 *     for (const draw of fc.sample(entry.arbitrary, entry.drawCount ?? 200000)) {
 *         if (!entry.predicate(draw)) {
 *             throw new Error(
 *                 `${entry.name} violated its precondition with ${JSON.stringify(draw)}: ` +
 *                 `${JSON.stringify(entry.describe(draw))} — relied on by ${entry.assertedBy}`
 *             );
 *         }
 *     }
 * }
 */
export const AUDITED_ARBITRARIES = [
	{
		// No `drawCount`: this entry runs on the audit's baseline budget.
		//
		// Measured over 4,000,000 draws of the PRE-FIX whole-string-only filter
		// (200,000 draws x 20 seeds): 81 violations, ~1 in 49,383. At the baseline
		// 200,000 draws that rate gives 1 - exp(-200000 / 49383) = ~98.3% detection
		// of a reintroduced defect, and it was in fact detected on 20 of 20 seeds,
		// including the audit's committed default seed. The baseline is already the
		// right budget here, so stating one would add nothing.
		name: 'safeSecretName',
		arbitrary: safeSecretName,
		predicate: (value) => ParameterKeySafety.checkSecretName(value).safe,
		describe: (value) => ParameterKeySafety.checkSecretName(value),
		assertedBy: 'setGroupedSecret / setGroupedSecretMap round-trip properties'
	},
	{
		// Predicate choice, recorded because it is the one non-obvious entry:
		// `safeSecretNameArn` draws a FULL ARN, and the consuming property asserts
		// `ParameterKeySafety.isSafeSecretName(arn) === true`. `isSafeSecretName` is
		// a thin boolean wrapper — its entire body is
		// `return ParameterKeySafety.checkSecretName(name).safe` — so
		// `checkSecretName(arn).safe` is not an approximation of the asserted
		// predicate, it IS the asserted predicate, evaluated on the same value.
		//
		// That matters because the alternative framings are all weaker. Checking
		// only the extracted secret-name portion would skip the whole-ARN steps that
		// run before the segment scan (length bound, the DANGEROUS_KEYS and
		// PROTOTYPE_KEYS whole-value checks, and SECRET_NAME_PATTERN over the ARN's
		// `:` punctuation), and would also miss the `arn:aws:secretsmanager:<region>`
		// first segment that the implementation's `name.split('/')` scan actually
		// visits. Passing the full ARN keeps every step the property depends on
		// inside the check, so this is a true precondition rather than a partial one.
		//
		// This is a check performed by the audit, not a `.filter()` on the generator,
		// so it does not make the consuming property vacuous. The generator itself
		// remains safe by construction (see `secretNameSegment` and the digit lemma).
		name: 'safeSecretNameArn',
		arbitrary: safeSecretNameArn,
		predicate: (value) => ParameterKeySafety.checkSecretName(value).safe,
		describe: (value) => ParameterKeySafety.checkSecretName(value),
		assertedBy: 'Property A5: generated Secrets Manager ARNs are accepted',
		// Budget derivation, and why this entry does not use the baseline.
		//
		// Measured over 4,000,000 draws of the PRE-FIX generator — the unfiltered
		// `fc.stringMatching(/^[a-zA-Z0-9/_+=.@-]{1,100}$/)` secret-name portion, at
		// 200,000 draws x 20 seeds: 6 violations, ~1 in 666,667. That is roughly 13x
		// rarer than `safeSecretName`, and ~13x rarer than the "2 violations /
		// 100,000 draws" recorded in requirements.md, which came from one fixed
		// sampling seed and was a low-probability observation. This estimate rests
		// on 40x the data.
		//
		// At that rate the baseline 200,000 draws gives only
		// 1 - exp(-200000 / 666667) = ~26% detection — and it was observed on just
		// 6 of 20 seeds, NOT including the audit's committed default seed. The
		// primary control this spec introduces would therefore have been weak for
		// exactly the instance that blocked the v1.3.17 release.
		//
		// Budget for the same ~98% target the other entry already meets:
		//     n = -ln(0.02) x 666,667 = 3.912 x 666,667 = ~2,608,000
		// rounded to 2,600,000 (1 - exp(-2600000 / 666667) = ~98.0%).
		//
		// The audit samples this in batches rather than one `fc.sample` call: at
		// 200,000 draws peak heap measured ~104MB, so 2,600,000 strings held at once
		// would not fit comfortably.
		drawCount: 2600000
	}
];
