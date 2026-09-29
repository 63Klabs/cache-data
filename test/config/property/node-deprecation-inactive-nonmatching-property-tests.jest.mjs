/**
 * Property-based test: inactive and non-matching deprecation-registry entries
 * never produce a warning attributable to them.
 *
 * `checkNodeDeprecationNotices()` and `NODE_DEPRECATION_NOTICES` are
 * module-INTERNAL to `src/lib/tools/index.js` and are intentionally NOT
 * exported (Property 7 / Req 8.1 forbid changing the package export surface).
 * This property requires driving the walker over many SYNTHETIC registries,
 * so the walker logic is mirrored here verbatim from the source rather than
 * imported. The mirror below is copied from the `checkNodeDeprecationNotices`
 * implementation in `src/lib/tools/index.js`:
 *
 *   function checkNodeDeprecationNotices(runningMajor = nodeVerMajor) {
 *       for (const notice of NODE_DEPRECATION_NOTICES) {
 *           if (!notice.active || notice.version !== runningMajor) {
 *               continue;
 *           }
 *           const guardKey = `node-major-${notice.version}`;
 *           if (_deprecationNoticed.has(guardKey)) {
 *               continue;
 *           }
 *           _deprecationNoticed.add(guardKey);
 *           DebugAndLog.warn(notice.message);
 *       }
 *   }
 *
 * If the source walker changes, THIS MIRROR MUST BE UPDATED to match.
 *
 * Feature: 1-3-17-node-26-support, Property 3: Inactive and non-matching entries never warn
 * Validates: Requirements 3.5, 4.4
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

/**
 * Faithful mirror of the source walker in `src/lib/tools/index.js`. Instead of
 * calling the real `DebugAndLog.warn`, it records each emitted warning (with
 * the originating entry) into `emissions` so the test can attribute warnings to
 * specific registry entries. The `_deprecationNoticed` guard Set is passed in
 * so callers control the once-per-process semantics.
 *
 * @param {Array.<{version: number, active: boolean, message: string}>} registry - Synthetic deprecation notice registry
 * @param {number} runningMajor - Simulated running Node.js major version
 * @param {Set.<string>} deprecationNoticed - Guard set mirroring the module's `_deprecationNoticed`
 * @param {Array.<{entry: Object, message: string}>} emissions - Accumulator receiving one record per emitted warning
 * @returns {void}
 * @private
 * @example
 * const emissions = [];
 * walk([{ version: 20, active: true, message: 'm' }], 20, new Set(), emissions);
 * // emissions => [{ entry: {...}, message: 'm' }]
 */
const walk = (registry, runningMajor, deprecationNoticed, emissions) => {
	for (const notice of registry) {
		// Mirror of source: skip inactive entries and entries whose version
		// does not equal the running major.
		if (!notice.active || notice.version !== runningMajor) {
			continue;
		}
		const guardKey = `node-major-${notice.version}`;
		if (deprecationNoticed.has(guardKey)) {
			continue;
		}
		deprecationNoticed.add(guardKey);
		emissions.push({ entry: notice, message: notice.message });
	}
};

/**
 * fast-check arbitrary for a single synthetic deprecation-notice entry.
 * @type {fc.Arbitrary<{version: number, active: boolean, message: string}>}
 */
const noticeArb = fc.record({
	version: fc.integer({ min: 0, max: 100 }),
	active: fc.boolean(),
	message: fc.string({ minLength: 1, maxLength: 40 })
});

describe('Property 3: Inactive and non-matching entries never warn', () => {
	// Feature: 1-3-17-node-26-support, Property 3: Inactive and non-matching entries never warn
	// Validates: Requirements 3.5, 4.4

	it('should never emit a warning attributable to an inactive or non-matching entry', () => {
		fc.assert(
			fc.property(
				fc.array(noticeArb, { maxLength: 8 }),
				fc.integer({ min: 0, max: 100 }),
				(registry, runningMajor) => {
					const emissions = [];
					walk(registry, runningMajor, new Set(), emissions);

					// The only entries permitted to produce a warning are those
					// that are BOTH active AND version-matching. Any emission
					// attributable to an inactive or non-matching entry violates
					// the property.
					for (const { entry } of emissions) {
						expect(entry.active).toBe(true);
						expect(entry.version).toBe(runningMajor);
					}
				}
			),
			{ numRuns: 200 }
		);
	});

	it('should emit nothing when every entry is inactive, regardless of version match', () => {
		fc.assert(
			fc.property(
				// Force every entry inactive; versions still span the range so
				// some will "match" the running major but must still be skipped.
				fc.array(
					fc.record({
						version: fc.integer({ min: 0, max: 100 }),
						active: fc.constant(false),
						message: fc.string({ minLength: 1, maxLength: 40 })
					}),
					{ maxLength: 8 }
				),
				fc.integer({ min: 0, max: 100 }),
				(registry, runningMajor) => {
					const emissions = [];
					walk(registry, runningMajor, new Set(), emissions);
					expect(emissions).toHaveLength(0);
				}
			),
			{ numRuns: 200 }
		);
	});

	it('should emit nothing when no active entry matches the running major', () => {
		fc.assert(
			fc.property(
				fc.array(noticeArb, { maxLength: 8 }),
				fc.integer({ min: 0, max: 100 }),
				(registry, runningMajor) => {
					// Remove any entry that would legitimately match, leaving only
					// non-matching entries (some active, some inactive).
					const nonMatching = registry.filter(
						(n) => !(n.active && n.version === runningMajor)
					);
					const emissions = [];
					walk(nonMatching, runningMajor, new Set(), emissions);
					expect(emissions).toHaveLength(0);
				}
			),
			{ numRuns: 200 }
		);
	});

	it('should skip an inactive entry even when its version equals the running major', () => {
		// Explicit boundary case: the exact version matches, but active:false
		// must still suppress the warning (Req 4.4 audit-history entries).
		const registry = [
			{ version: 20, active: false, message: 'inactive-20' },
			{ version: 20, active: true, message: 'active-20' }
		];
		const emissions = [];
		walk(registry, 20, new Set(), emissions);

		// Only the active matching entry emits; the inactive one never does.
		expect(emissions).toHaveLength(1);
		expect(emissions[0].entry.active).toBe(true);
		expect(emissions[0].message).toBe('active-20');
	});
});
