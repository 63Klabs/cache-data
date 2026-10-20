/**
 * Property-based test for the Node.js deprecation-notice registry after the
 * v1.4.0 Node 20 removal.
 *
 * Covers the registry-walker behavior when `NODE_DEPRECATION_NOTICES` holds its
 * single retained entry in the post-removal state (`{ version: 20,
 * active: false, ... }`). Under that registry, `checkNodeDeprecationNotices()`
 * must emit no warning for any running Node major version, including 20 — the
 * Node 20 notice is retired (Req 2.4), its entry kept inactive for audit
 * history (Req 2.1, 2.2).
 *
 * `checkNodeDeprecationNotices` and `NODE_DEPRECATION_NOTICES` are
 * module-INTERNAL to `src/lib/tools/index.js` and are intentionally NOT
 * exported (Property 7 / Req 8.5 — the package export surface must not change).
 * This test therefore mirrors the walker logic in-file and seeds it with a copy
 * of the REAL registry contents.
 *
 * >! SOURCE OF TRUTH: the seeded entry below must stay identical to the
 * >! `NODE_DEPRECATION_NOTICES` array in `src/lib/tools/index.js` (version 20,
 * >! active false, and the exact retained message string). If that source
 * >! constant changes, update the copy here to match.
 *
 * Feature: 1-4-0-remove-node-20-support, Property 3: No Node 20 warning
 * Validates: Requirements 2.4, 2.5
 */

import { describe, it, expect, jest } from '@jest/globals';
import fc from 'fast-check';

/**
 * Copy of the REAL `NODE_DEPRECATION_NOTICES` contents from
 * `src/lib/tools/index.js` after the v1.4.0 Node 20 removal. Exactly one
 * INACTIVE entry for Node major 20, retained for audit history with its
 * original message text verbatim. Kept in sync with the source constant.
 * @type {Array<{version: number, active: boolean, message: string}>}
 */
const INITIAL_NODE_DEPRECATION_NOTICES = [
	{
		version: 20,
		active: false,
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
 * // warn NOT called: the Node 20 entry is inactive after the v1.4.0 removal
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

describe('Node 20 no longer warns after v1.4.0 removal', () => {
	// Feature: 1-4-0-remove-node-20-support, Property 3: No Node 20 warning
	// Validates: Requirements 2.4, 2.5

	it('should never warn for any major, including 20, under the inactive registry', () => {
		fc.assert(
			fc.property(
				// Wide range spanning well below 20, exactly 20, and well above,
				// so the (now-retired) 20 case and every other major are exercised.
				fc.integer({ min: 0, max: 100 }),
				(runningMajor) => {
					const noticed = new Set();
					const warn = jest.fn();

					walkNoticesMirror(runningMajor, INITIAL_NODE_DEPRECATION_NOTICES, noticed, warn);

					// Independent expectation, not derived from the walker: the sole
					// retained entry is INACTIVE, so no major ever warns.
					expect(warn).not.toHaveBeenCalled();
				}
			),
			{ numRuns: 200 }
		);
	});

	it('should not warn for major 20 now that its entry is inactive', () => {
		// Explicit assertion guarantees the former matching branch (20) is
		// exercised regardless of generated sampling: it must now be silent.
		const noticed = new Set();
		const warn = jest.fn();

		walkNoticesMirror(20, INITIAL_NODE_DEPRECATION_NOTICES, noticed, warn);

		expect(warn).toHaveBeenCalledTimes(0);
	});

	it('should not warn for the supported majors 22, 24, and 26', () => {
		// Requirement 2.4: no notice for currently-supported runtimes.
		for (const major of [22, 24, 26]) {
			const noticed = new Set();
			const warn = jest.fn();

			walkNoticesMirror(major, INITIAL_NODE_DEPRECATION_NOTICES, noticed, warn);

			expect(warn).not.toHaveBeenCalled();
		}
	});
});
