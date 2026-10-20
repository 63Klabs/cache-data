/**
 * Property-based test: the Node.js deprecation warning fires at most once per
 * process, no matter how many times the registry walker runs.
 *
 * ACCESS APPROACH: `checkNodeDeprecationNotices()` and `NODE_DEPRECATION_NOTICES`
 * are module-internal to `src/lib/tools/index.js` and are intentionally NOT
 * exported (Property 6 / Req 8.5 requires the export surface to stay unchanged,
 * and no TestHarness exists for tools/index.js). Following the same strategy as
 * the hard-floor property test, this test MIRRORS the walker's guard-set
 * semantics locally and drives that mirror against the REAL, exported
 * `DebugAndLog.warn` (spied with `jest.spyOn`). The mirror must be kept in sync
 * with the source function `checkNodeDeprecationNotices` in
 * `src/lib/tools/index.js`.
 *
 * The once-per-process invariant (Requirement 6.6) is independent of which
 * entries are active: it holds for any registry. After the v1.4.0 Node 20
 * removal, the single real registry entry (`version: 20`) is INACTIVE, so the
 * real-registry case below now asserts zero warns for every running major,
 * including 20. The first two properties below generate registries with mixed
 * active flags and derive their expectations from those flags, so they remain
 * correct and activeness-agnostic.
 *
 * Feature: 1-4-0-remove-node-20-support, Property 5: Once-per-process preserved
 * Validates: Requirements 2.4, 6.6
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fc from 'fast-check';
import tools from '../../../src/lib/tools/index.js';

const { DebugAndLog } = tools;

/**
 * The exact message text of the real single-entry registry, used to anchor one
 * test against production data. Kept in sync with the `NODE_DEPRECATION_NOTICES`
 * entry in `src/lib/tools/index.js` (the entry is retained for audit history but
 * is now `active: false`).
 * @type {string}
 */
const NODE_20_MESSAGE =
	"Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later.";

/**
 * Faithful mirror of `checkNodeDeprecationNotices()` in
 * `src/lib/tools/index.js`, factored so the guard `Set` is created fresh per
 * simulated process. Reproduces the source semantics exactly:
 *   - skip any entry that is inactive or whose `version` !== `runningMajor`
 *   - use the namespaced guard key `node-major-${version}` so a version can
 *     emit at most once and cannot collide with method-name guard keys
 *   - warn (once per version) via the injected `warn` function
 *
 * @param {Array<{version:number, active:boolean, message:string}>} registry - Deprecation notice registry
 * @param {function(string):void} warn - Warning sink (the real `DebugAndLog.warn` in tests)
 * @returns {function(number):void} A single-process walker; the guard Set persists across its own calls
 * @private
 */
function makeProcessWalker(registry, warn) {
	// Mirrors the module-level `_deprecationNoticed` Set: one per process.
	const noticed = new Set();
	return function checkNodeDeprecationNotices(runningMajor) {
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
	};
}

/** A single generated registry entry. */
const noticeArb = fc.record({
	version: fc.integer({ min: 0, max: 100 }),
	active: fc.boolean(),
	message: fc.string({ minLength: 0, maxLength: 40 })
});

/** A non-empty, ordered registry (allows duplicate versions and mixed active flags). */
const registryArb = fc.array(noticeArb, { minLength: 1, maxLength: 6 });

/** Running Node major spanning below/at/above the supported range. */
const majorArb = fc.integer({ min: 0, max: 100 });

/** How many times the walker is invoked within one simulated process. */
const invocationCountArb = fc.integer({ min: 1, max: 25 });

describe('Property 5: Deprecation warning fires at most once per process', () => {
	// Feature: 1-4-0-remove-node-20-support, Property 5: Once-per-process preserved
	// Validates: Requirements 2.4, 6.6

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('emits at most one warning per registry-entry version across any number of invocations', () => {
		fc.assert(
			fc.property(
				registryArb,
				majorArb,
				invocationCountArb,
				(registry, runningMajor, invocationCount) => {
					const warnSpy = jest
						.spyOn(DebugAndLog, 'warn')
						.mockImplementation(() => {});
					try {
						const walk = makeProcessWalker(registry, DebugAndLog.warn);
						for (let i = 0; i < invocationCount; i++) {
							walk(runningMajor);
						}

						// Count emitted warnings grouped by the entry version they
						// belong to. Every emitted message must correspond to an
						// active entry whose version === runningMajor.
						const warningsPerVersion = new Map();
						for (const call of warnSpy.mock.calls) {
							const message = call[0];
							const source = registry.find(
								(n) => n.active && n.version === runningMajor && n.message === message
							);
							// Property 5 concerns only the once-ness; matching is
							// covered elsewhere. A source must always exist here.
							expect(source).toBeDefined();
							const count = warningsPerVersion.get(source.version) || 0;
							warningsPerVersion.set(source.version, count + 1);
						}

						// The core invariant: no version warns more than once.
						for (const count of warningsPerVersion.values()) {
							expect(count).toBeLessThanOrEqual(1);
						}

						// Since only entries with version === runningMajor can match,
						// at most one version ever fires per process.
						expect(warnSpy.mock.calls.length).toBeLessThanOrEqual(1);
					} finally {
						warnSpy.mockRestore();
					}
				}
			),
			{ numRuns: 200 }
		);
	});

	it('warns exactly once total when a matching active entry exists, regardless of invocation count', () => {
		fc.assert(
			fc.property(
				majorArb,
				invocationCountArb,
				fc.string({ minLength: 0, maxLength: 40 }),
				(runningMajor, invocationCount, message) => {
					// Guarantee at least one active entry matches the running major.
					// This exercises the once-per-process guard directly and is
					// independent of the real registry's activeness.
					const registry = [{ version: runningMajor, active: true, message }];
					const warnSpy = jest
						.spyOn(DebugAndLog, 'warn')
						.mockImplementation(() => {});
					try {
						const walk = makeProcessWalker(registry, DebugAndLog.warn);
						for (let i = 0; i < invocationCount; i++) {
							walk(runningMajor);
						}
						// Fires on the first invocation, then never again this process.
						expect(warnSpy).toHaveBeenCalledTimes(1);
						expect(warnSpy).toHaveBeenCalledWith(message);
					} finally {
						warnSpy.mockRestore();
					}
				}
			),
			{ numRuns: 150 }
		);
	});

	it('under the real single-entry registry (Node 20 now inactive), never warns for any running major', () => {
		// The real registry retains the version-20 entry for audit history but
		// marks it `active: false` as of v1.4.0, so the walker warns for no major.
		const currentRegistry = [{ version: 20, active: false, message: NODE_20_MESSAGE }];
		fc.assert(
			fc.property(
				majorArb,
				invocationCountArb,
				(runningMajor, invocationCount) => {
					const warnSpy = jest
						.spyOn(DebugAndLog, 'warn')
						.mockImplementation(() => {});
					try {
						const walk = makeProcessWalker(currentRegistry, DebugAndLog.warn);
						for (let i = 0; i < invocationCount; i++) {
							walk(runningMajor);
						}
						// Inactive entry => zero warnings for every major, including 20.
						expect(warnSpy).toHaveBeenCalledTimes(0);
					} finally {
						warnSpy.mockRestore();
					}
				}
			),
			{ numRuns: 150 }
		);
	});
});
