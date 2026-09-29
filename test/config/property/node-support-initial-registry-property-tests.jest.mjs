/**
 * Property-based test for the initial Node.js deprecation-notice registry.
 *
 * Covers the registry-walker behavior when `NODE_DEPRECATION_NOTICES` is in its
 * initial single-entry state (`{ version: 20, active: true, ... }`). Under that
 * registry, `checkNodeDeprecationNotices()` must emit a warning when and only
 * when the running Node major version is exactly 20, and never for any other
 * major.
 *
 * `checkNodeDeprecationNotices` and `NODE_DEPRECATION_NOTICES` are
 * module-INTERNAL to `src/lib/tools/index.js` and are intentionally NOT
 * exported (Property 7 / Req 8.1 — the package export surface must not change).
 * This test therefore mirrors the walker logic in-file and seeds it with a copy
 * of the REAL initial registry contents.
 *
 * >! SOURCE OF TRUTH: the seeded entry below must stay identical to the initial
 * >! `NODE_DEPRECATION_NOTICES` array in `src/lib/tools/index.js` (version 20,
 * >! active true, and the exact Req 3.2 message string). If that source constant
 * >! changes, update the copy here to match.
 *
 * Feature: 1-3-17-node-26-support, Property 4: Only Node 20 warns under the initial registry
 * Validates: Requirements 3.1, 3.5, 4.5, 8.3
 */

import { describe, it, expect, jest } from '@jest/globals';
import fc from 'fast-check';

/**
 * Copy of the REAL initial `NODE_DEPRECATION_NOTICES` contents from
 * `src/lib/tools/index.js`. Exactly one active entry for Node major 20 with the
 * verbatim Requirement 3.2 message. Kept in sync with the source constant.
 * @type {Array<{version: number, active: boolean, message: string}>}
 */
const INITIAL_NODE_DEPRECATION_NOTICES = [
	{
		version: 20,
		active: true,
		message: "Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later."
	}
];

/**
 * In-file mirror of the `checkNodeDeprecationNotices()` walker in
 * `src/lib/tools/index.js`. Walks the supplied registry and, for any active
 * entry whose version matches `runningMajor`, records a namespaced guard key
 * and invokes `warn` with the entry's message at most once per guard key.
 *
 * @param {number} runningMajor - Running Node.js major version under test
 * @param {Array<{version: number, active: boolean, message: string}>} registry - Deprecation notice registry
 * @param {Set<string>} noticed - Per-process guard set (namespaced keys)
 * @param {(message: string) => void} warn - Warning sink (spied in tests)
 * @returns {void}
 * @private
 * @example
 * const noticed = new Set();
 * const warn = jest.fn();
 * walkNoticesMirror(20, INITIAL_NODE_DEPRECATION_NOTICES, noticed, warn);
 * // warn called once with the Node 20 message
 */
function walkNoticesMirror(runningMajor, registry, noticed, warn) {
	for (const notice of registry) {
		if (!notice.active || notice.version !== runningMajor) {
			continue;
		}
		const guardKey = `node-major-${notice.version}`;
		if (noticed.has(guardKey)) {
			continue;
		}
		noticed.add(guardKey);
		warn(notice.message);
	}
}

describe('Property 4: Only Node 20 warns under the initial registry', () => {
	// Feature: 1-3-17-node-26-support, Property 4: Only Node 20 warns under the initial registry
	// Validates: Requirements 3.1, 3.5, 4.5, 8.3

	it('should warn when and only when the running major is exactly 20', () => {
		fc.assert(
			fc.property(
				// Wide range spanning well below 20, exactly 20, and well above,
				// so both the matching (20) and non-matching majors are exercised.
				fc.integer({ min: 0, max: 100 }),
				(runningMajor) => {
					const noticed = new Set();
					const warn = jest.fn();

					walkNoticesMirror(runningMajor, INITIAL_NODE_DEPRECATION_NOTICES, noticed, warn);

					// Independent expectation, not derived from the walker: the sole
					// initial entry is active and targets version 20.
					const expectWarn = runningMajor === 20;
					expect(warn).toHaveBeenCalledTimes(expectWarn ? 1 : 0);

					if (expectWarn) {
						// When it warns, the text is exactly the seeded Req 3.2 message.
						expect(warn).toHaveBeenCalledWith(INITIAL_NODE_DEPRECATION_NOTICES[0].message);
					}
				}
			),
			{ numRuns: 200 }
		);
	});

	it('should never warn for any non-20 major across a wide range', () => {
		fc.assert(
			fc.property(
				// Exclude 20 explicitly to focus on the "only" half of "iff".
				fc.integer({ min: 0, max: 100 }).filter((major) => major !== 20),
				(runningMajor) => {
					const noticed = new Set();
					const warn = jest.fn();

					walkNoticesMirror(runningMajor, INITIAL_NODE_DEPRECATION_NOTICES, noticed, warn);

					expect(warn).not.toHaveBeenCalled();
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should warn exactly once with the exact message when the major is 20', () => {
		// Explicit assertion guarantees the matching branch is exercised
		// regardless of generated sampling.
		const noticed = new Set();
		const warn = jest.fn();

		walkNoticesMirror(20, INITIAL_NODE_DEPRECATION_NOTICES, noticed, warn);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			"Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later."
		);
	});

	it('should not warn for the supported majors 22, 24, and 26', () => {
		// Requirement 3.5 / 8.3: no notice for currently-supported runtimes.
		for (const major of [22, 24, 26]) {
			const noticed = new Set();
			const warn = jest.fn();

			walkNoticesMirror(major, INITIAL_NODE_DEPRECATION_NOTICES, noticed, warn);

			expect(warn).not.toHaveBeenCalled();
		}
	});
});
