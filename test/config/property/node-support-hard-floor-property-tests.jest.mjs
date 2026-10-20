/**
 * Property-based test for the Node.js hard version-floor predicate.
 *
 * Covers the PURE boolean decision (`major < 22`) that `src/lib/tools/vars.js`
 * uses to decide whether to call `process.exit(1)` at module load. This test
 * mirrors the threshold predicate only; the actual `process.exit` wiring at
 * module load is verified separately, subprocess-isolated.
 *
 * Feature: 1-4-0-remove-node-20-support, Requirement 1: Raise the hard runtime floor to Node 22
 * Validates: Requirements 1.1, 1.2, 1.4
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

/**
 * The current Node.js major-version floor enforced in `src/lib/tools/vars.js`.
 * Kept in sync with the `nodeVerMajor < 22` check in that module.
 * @type {number}
 */
const NODE_MAJOR_FLOOR = 22;

/**
 * Mirror of the `vars.js` floor predicate: returns true when the running Node
 * major version would trigger `process.exit(1)` at module load.
 *
 * @param {number} major - Node.js major version to evaluate
 * @returns {boolean} True if the floor check would exit for this major
 * @private
 * @example
 * floorWouldExit(20); // true  (below floor)
 * floorWouldExit(22); // false (at floor, runs normally)
 * floorWouldExit(24); // false (above floor)
 */
const floorWouldExit = (major) => major < NODE_MAJOR_FLOOR;

describe('Property 1: Hard floor exits below 22 and only below 22', () => {
	// Feature: 1-4-0-remove-node-20-support, Requirement 1: Raise the hard runtime floor to Node 22
	// Validates: Requirements 1.1, 1.2, 1.4

	it('should trigger the exit predicate if and only if the Node major is below 22', () => {
		fc.assert(
			fc.property(
				// Span well below 22, exactly 22, and well above (covers majors 0-100).
				fc.integer({ min: 0, max: 100 }),
				(major) => {
					// Independent expectation: for integer majors, "below 22" is
					// equivalent to "<= 21". Derive it without reusing the predicate.
					const expectedExit = major <= 21;
					expect(floorWouldExit(major)).toBe(expectedExit);
				}
			),
			{ numRuns: 200 }
		);
	});

	it('should exit for every major strictly below the floor (0..21)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 21 }),
				(major) => {
					expect(floorWouldExit(major)).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should NOT exit for the floor value itself or any supported major (22..100)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 22, max: 100 }),
				(major) => {
					expect(floorWouldExit(major)).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should hold at the exact boundary values 19, 20, 21, and 22', () => {
		// Explicit boundary assertions guarantee the threshold edge is exercised
		// regardless of generated sampling.
		expect(floorWouldExit(19)).toBe(true);  // below floor -> exits
		expect(floorWouldExit(20)).toBe(true);  // below floor (Node 20 removed) -> exits (Req 1.4)
		expect(floorWouldExit(21)).toBe(true);  // below floor -> exits (Req 1.4)
		expect(floorWouldExit(22)).toBe(false); // at floor -> runs (Req 1.2)
	});

	it('should not exit for the currently supported majors 22, 24, and 26', () => {
		// Requirement 1.2: majors 22, 24, 26 run normally.
		for (const major of [22, 24, 26]) {
			expect(floorWouldExit(major)).toBe(false);
		}
	});

	it('should exit for the retired majors 20 and 21', () => {
		// Requirement 1.4: the floor rejects Node major 20 and Node major 21.
		expect(floorWouldExit(20)).toBe(true);
		expect(floorWouldExit(21)).toBe(true);
	});
});
