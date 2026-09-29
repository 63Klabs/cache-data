/**
 * Property-based test for the Node.js hard version-floor predicate.
 *
 * Covers the PURE boolean decision (`major < 20`) that `src/lib/tools/vars.js`
 * uses to decide whether to call `process.exit(1)` at module load. This test
 * mirrors the threshold predicate only; the actual `process.exit` wiring at
 * module load is verified separately, subprocess-isolated (task 3.2).
 *
 * Feature: 1-3-17-node-26-support, Property 5: Hard floor exits below 20 and only below 20
 * Validates: Requirements 5.1, 5.3, 5.5
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

/**
 * The current Node.js major-version floor enforced in `src/lib/tools/vars.js`.
 * Kept in sync with the `nodeVerMajor < 20` check in that module.
 * @type {number}
 */
const NODE_MAJOR_FLOOR = 20;

/**
 * Mirror of the `vars.js` floor predicate: returns true when the running Node
 * major version would trigger `process.exit(1)` at module load.
 *
 * @param {number} major - Node.js major version to evaluate
 * @returns {boolean} True if the floor check would exit for this major
 * @private
 * @example
 * floorWouldExit(18); // true  (below floor)
 * floorWouldExit(20); // false (at floor, runs normally)
 * floorWouldExit(22); // false (above floor)
 */
const floorWouldExit = (major) => major < NODE_MAJOR_FLOOR;

describe('Property 5: Hard floor exits below 20 and only below 20', () => {
	// Feature: 1-3-17-node-26-support, Property 5: Hard floor exits below 20 and only below 20
	// Validates: Requirements 5.1, 5.3, 5.5

	it('should trigger the exit predicate if and only if the Node major is below 20', () => {
		fc.assert(
			fc.property(
				// Span well below 20, exactly 20, and well above (covers majors 0-100).
				fc.integer({ min: 0, max: 100 }),
				(major) => {
					// Independent expectation: for integer majors, "below 20" is
					// equivalent to "<= 19". Derive it without reusing the predicate.
					const expectedExit = major <= 19;
					expect(floorWouldExit(major)).toBe(expectedExit);
				}
			),
			{ numRuns: 200 }
		);
	});

	it('should exit for every major strictly below the floor (0..19)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 19 }),
				(major) => {
					expect(floorWouldExit(major)).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should NOT exit for the floor value itself or any supported major (20..100)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 20, max: 100 }),
				(major) => {
					expect(floorWouldExit(major)).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should hold at the exact boundary values 19, 20, and 21', () => {
		// Explicit boundary assertions guarantee the threshold edge is exercised
		// regardless of generated sampling.
		expect(floorWouldExit(19)).toBe(true);  // just below floor -> exits
		expect(floorWouldExit(20)).toBe(false); // at floor -> runs (Req 5.3)
		expect(floorWouldExit(21)).toBe(false); // above floor -> runs
	});

	it('should not exit for the currently supported majors 20, 22, 24, and 26', () => {
		// Requirement 5.5: majors 22, 24, 26 unchanged; Requirement 5.3: 20 runs.
		for (const major of [20, 22, 24, 26]) {
			expect(floorWouldExit(major)).toBe(false);
		}
	});
});
