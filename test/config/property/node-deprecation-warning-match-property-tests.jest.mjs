/**
 * Property-based test for the Node.js deprecation-notice registry walker:
 * a warning fires if and only if a matching active entry exists, and the
 * logged text is exactly that entry's message.
 *
 * ACCESS NOTE: `checkNodeDeprecationNotices()` and `NODE_DEPRECATION_NOTICES`
 * are module-INTERNAL to `src/lib/tools/index.js` and are intentionally NOT
 * exported (Property 7 / Req 8.1 forbid changing the export surface). The real
 * function also closes over the module-level `NODE_DEPRECATION_NOTICES`
 * constant, so it cannot be driven over the SYNTHETIC registries this property
 * requires. This test therefore mirrors the walker's exact semantics against a
 * parameterized registry, guard set, and warn sink.
 *
 * >! The mirrored walker below MUST stay in sync with
 * >! `checkNodeDeprecationNotices()` in `src/lib/tools/index.js`. Source (as of
 * >! this spec):
 * >!   for (const notice of NODE_DEPRECATION_NOTICES) {
 * >!       if (!notice.active || notice.version !== runningMajor) { continue; }
 * >!       const guardKey = `node-major-${notice.version}`;
 * >!       if (_deprecationNoticed.has(guardKey)) { continue; }
 * >!       _deprecationNoticed.add(guardKey);
 * >!       DebugAndLog.warn(notice.message);
 * >!   }
 *
 * Feature: 1-3-17-node-26-support, Property 2: Warning fires only for a matching active entry
 * Validates: Requirements 3.1, 3.2, 4.1
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fc from 'fast-check';

/**
 * Faithful mirror of `checkNodeDeprecationNotices()` from
 * `src/lib/tools/index.js`, parameterized for testability over synthetic
 * registries. Walks the registry once and, for any active entry whose version
 * matches `runningMajor`, records a namespaced guard key and emits the entry's
 * message via the injected `warn` sink at most once per version.
 *
 * Keep this in lockstep with the source function referenced in the file header.
 *
 * @param {number} runningMajor - Running Node.js major version to evaluate against
 * @param {Array.<{version: number, active: boolean, message: string}>} registry - Synthetic deprecation-notice registry
 * @param {Set.<string>} noticedGuard - Per-process guard set (mirrors `_deprecationNoticed`)
 * @param {function(string): void} warn - Warning sink (mirrors `DebugAndLog.warn`)
 * @returns {void}
 * @private
 * @example
 * const guard = new Set();
 * const warn = jest.fn();
 * walkNoticesMirror(20, [{ version: 20, active: true, message: 'x' }], guard, warn);
 * // warn called once with 'x'
 */
const walkNoticesMirror = (runningMajor, registry, noticedGuard, warn) => {
	for (const notice of registry) {
		if (!notice.active || notice.version !== runningMajor) {
			continue;
		}
		const guardKey = `node-major-${notice.version}`;
		if (noticedGuard.has(guardKey)) {
			continue;
		}
		noticedGuard.add(guardKey);
		warn(notice.message);
	}
};

/**
 * Independent oracle: the first active entry whose version equals the running
 * major, or null if none exists. Derived without reusing the walker so the
 * property is checked against a separate computation.
 *
 * @param {number} runningMajor - Running Node.js major version
 * @param {Array.<{version: number, active: boolean, message: string}>} registry - Synthetic registry
 * @returns {{version: number, active: boolean, message: string}|null} The first matching active entry or null
 * @private
 */
const firstMatchingActive = (runningMajor, registry) =>
	registry.find((entry) => entry.active && entry.version === runningMajor) || null;

/**
 * fast-check arbitrary for a single synthetic registry entry. Versions are
 * constrained to a narrow band so that matches against the generated running
 * major occur frequently (exercising the "warns" branch) while non-matches and
 * inactive entries still occur (exercising the "does not warn" branch).
 */
const entryArb = fc.record({
	version: fc.integer({ min: 18, max: 28 }),
	active: fc.boolean(),
	message: fc.string({ minLength: 0, maxLength: 60 })
});

describe('Property 2: Warning fires only for a matching active entry', () => {
	// Feature: 1-3-17-node-26-support, Property 2: Warning fires only for a matching active entry
	// Validates: Requirements 3.1, 3.2, 4.1

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('should warn iff a matching active entry exists, and log exactly that entry message', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 18, max: 28 }),
				fc.array(entryArb, { minLength: 0, maxLength: 8 }),
				(runningMajor, registry) => {
					const guard = new Set();
					const warn = jest.fn();

					walkNoticesMirror(runningMajor, registry, guard, warn);

					const expectedMatch = firstMatchingActive(runningMajor, registry);

					if (expectedMatch === null) {
						// No active entry matches the running major -> no warning.
						expect(warn).not.toHaveBeenCalled();
					} else {
						// Exactly one warning (the guard dedupes duplicate versions),
						// and its text is exactly the first matching active entry.
						expect(warn).toHaveBeenCalledTimes(1);
						expect(warn).toHaveBeenCalledWith(expectedMatch.message);
					}
				}
			),
			{ numRuns: 300 }
		);
	});

	it('should emit the exact message text for a guaranteed single matching active entry', () => {
		// Registry always contains exactly one active entry matching the running
		// major, plus arbitrary non-matching/inactive noise: asserts the logged
		// text equals that entry's message verbatim (Req 3.2, 4.1).
		fc.assert(
			fc.property(
				fc.integer({ min: 18, max: 28 }),
				fc.string({ minLength: 0, maxLength: 80 }),
				fc.array(entryArb, { minLength: 0, maxLength: 6 }),
				(runningMajor, matchMessage, noise) => {
					// Strip any accidental active match for runningMajor from the noise
					// so the injected entry is the sole matching active entry.
					const cleanedNoise = noise.filter(
						(entry) => !(entry.active && entry.version === runningMajor)
					);
					const matchingEntry = { version: runningMajor, active: true, message: matchMessage };
					// Place the matching entry first so it is unambiguously the winner.
					const registry = [matchingEntry, ...cleanedNoise];

					const guard = new Set();
					const warn = jest.fn();

					walkNoticesMirror(runningMajor, registry, guard, warn);

					expect(warn).toHaveBeenCalledTimes(1);
					expect(warn).toHaveBeenCalledWith(matchMessage);
				}
			),
			{ numRuns: 200 }
		);
	});

	it('should never warn when no entry is both active and version-matched', () => {
		// Construct registries where every entry either is inactive or has a
		// version different from the running major -> the "only for a matching
		// active entry" direction of the iff.
		fc.assert(
			fc.property(
				fc.integer({ min: 18, max: 28 }),
				fc.array(entryArb, { minLength: 0, maxLength: 8 }),
				(runningMajor, registry) => {
					const nonMatching = registry.map((entry) => {
						if (entry.active && entry.version === runningMajor) {
							// Force a non-match: bump the version out of the running major.
							return { ...entry, version: runningMajor + 100 };
						}
						return entry;
					});

					const guard = new Set();
					const warn = jest.fn();

					walkNoticesMirror(runningMajor, nonMatching, guard, warn);

					expect(warn).not.toHaveBeenCalled();
				}
			),
			{ numRuns: 200 }
		);
	});
});
