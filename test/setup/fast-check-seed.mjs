/**
 * Suite-wide fast-check seeding from a single `FC_SEED` environment variable.
 *
 * ## Mechanism
 *
 * `fc.configureGlobal({ seed })` sets the seed for every `fc.assert` call that
 * does not pass its own `seed` option — 638 call sites across 113 files at the
 * time of writing — so a reported counterexample can be replayed without
 * touching any test file.
 *
 * Jest loads this module into every test file's context via `setupFilesAfterEnv`:
 *
 * ```javascript
 * // jest.config.mjs
 * setupFilesAfterEnv: ['<rootDir>/test/setup/fast-check-seed.mjs']
 * ```
 *
 * ## Why `setupFilesAfterEnv` and not `setupFiles`
 *
 * `setupFiles` runs in a module registry the test files do not share. A global
 * configured there mutates a *different* instance of fast-check than the one
 * the test file imports, so it never reaches `fc.assert`. This was measured, not
 * assumed: with the hook in `setupFiles`, a seed-less `fc.assert` still drew
 * different inputs on every run. `setupFilesAfterEnv` loads into the test
 * file's own registry, where the configuration does apply.
 *
 * ## Replaying a counterexample
 *
 * ```bash
 * FC_SEED=1171791119 npm test -- test/security/parameter-key-safety-tests.jest.mjs
 * ```
 *
 * ## Behavior
 *
 * - `FC_SEED` unset or empty — the normal CI path. `fc.configureGlobal` is never
 *   called, so fast-check's own per-run randomized seeding is untouched.
 * - `FC_SEED` set to an integer — that seed applies to every `fc.assert` that
 *   omits a `seed` option. Note that an explicit `seed: undefined` at a call
 *   site *overrides* the global and restores random seeding, which is why the
 *   `seed` option should simply be omitted.
 * - `FC_SEED` set to anything else — throws. Jest reports "Test suite failed to
 *   run" and the whole run fails. Falling back to random seeding would produce a
 *   run that reports a seed it did not use, which is worse than no seeding at
 *   all: a typo in a sweep configuration would silently yield unreproducible
 *   results that look reproducible.
 *
 * Not a test file: the name ends in `.mjs` rather than `.jest.mjs`, so Jest's
 * `testMatch` of `**\/test\/**\/*.jest.mjs` does not collect it as a suite.
 *
 * @module test/setup/fast-check-seed
 * @see .kiro/specs/1-4-0-property-test-generator-preconditions/design.md § F
 */

import fc from 'fast-check';

const raw = process.env.FC_SEED;

// An unset or empty FC_SEED is not an error; it is the normal path and leaves
// fast-check's default seeding alone.
if (raw !== undefined && raw !== '') {
	const seed = Number(raw);

	// Fail loudly rather than silently falling back to random seeding: a typo in
	// a sweep configuration must not produce a run that looks reproducible but
	// is not. Number.isInteger also rejects NaN, Infinity, and fractional values.
	//
	// Feature: 1-4-0-property-test-generator-preconditions, Property 8: An invalid seed fails the run
	//
	// This behavior is verified by observation rather than by a committed test:
	// the failure is a run-level event, so no test inside the run can observe it.
	// A test that spawned a second Jest process to watch the first fail would add
	// a child-process test for a one-line guard, which the test-execution-monitoring
	// steering exists to discourage. Observed on task 5.3:
	//
	//   $ FC_SEED=notanumber npm test
	//   Test Suites: 224 failed, 224 total
	//   Tests:       0 total
	//   exit code 1, 1.8s
	//
	// Every suite reported "Test suite failed to run" with the message below, and
	// zero tests executed — the failure is unambiguous, not a silent fallback. The
	// companion cases from the same task: `FC_SEED` unset gave 224 suites,
	// 3,107 passing / 2 skipped in 30.2s, and `FC_SEED=1171791119` gave the same
	// counts in 30.2s (Property 7 — an unset seed changes nothing).
	if (!Number.isInteger(seed)) {
		throw new Error(`FC_SEED must be an integer; received "${raw}"`);
	}

	fc.configureGlobal({ seed });
}
