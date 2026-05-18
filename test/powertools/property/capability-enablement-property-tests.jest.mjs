/**
 * Property 3: Capability Enablement Logic - Property-Based Tests
 * 
 * Tests the isCapabilityEnabled function which determines whether a specific
 * Powertools capability should be enabled based on the combination of:
 * - globalFlag (CACHE_DATA_POWERTOOLS parsed value)
 * - individualFlag (individual capability env var parsed value)
 * - isImportable (whether the package was successfully imported)
 * 
 * **Validates: Requirements 2.5, 2.6, 2.7**
 * 
 * Properties tested:
 * 1. globalFlag=false always disables regardless of other inputs
 * 2. individualFlag=false always disables regardless of isImportable
 * 3. When neither flag is false, result equals isImportable
 * 4. isCapabilityEnabled never throws for any combination of inputs
 * 
 * @module test/powertools/property/capability-enablement-property-tests
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";

// Import PowertoolsInit and use TestHarness to access isCapabilityEnabled directly
import { TestHarness } from "../../../src/lib/tools/PowertoolsInit.js";

const { isCapabilityEnabled } = TestHarness.getInternals();

/**
 * Arbitrary for flag values: true, false, or null (representing enabled, disabled, unset)
 */
const flagArbitrary = fc.oneof(
	fc.constant(true),
	fc.constant(false),
	fc.constant(null)
);

describe("Property 3: Capability Enablement Logic", () => {

	describe("Property 3.1: globalFlag=false always disables", () => {
		/**
		 * **Validates: Requirements 2.6**
		 * 
		 * For any (globalFlag=false, individualFlag, isImportable): result is always false.
		 * When the master switch is off, no capability can be enabled.
		 */
		it("should always return false when globalFlag is false, regardless of other inputs", () => {
			fc.assert(
				fc.property(
					flagArbitrary,
					fc.boolean(),
					(individualFlag, isImportable) => {
						const result = isCapabilityEnabled(false, individualFlag, isImportable);
						expect(result).toBe(false);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 3.2: individualFlag=false always disables", () => {
		/**
		 * **Validates: Requirements 2.7**
		 * 
		 * For any (globalFlag≠false, individualFlag=false, isImportable): result is always false.
		 * When an individual capability is explicitly disabled, it stays disabled.
		 */
		it("should always return false when individualFlag is false, regardless of isImportable", () => {
			fc.assert(
				fc.property(
					fc.oneof(fc.constant(true), fc.constant(null)),
					fc.boolean(),
					(globalFlag, isImportable) => {
						const result = isCapabilityEnabled(globalFlag, false, isImportable);
						expect(result).toBe(false);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 3.3: When neither flag is false, result equals isImportable", () => {
		/**
		 * **Validates: Requirements 2.5**
		 * 
		 * For any (globalFlag≠false, individualFlag≠false, isImportable): result equals isImportable.
		 * When no flag explicitly disables the capability, availability determines enablement.
		 */
		it("should return isImportable when neither globalFlag nor individualFlag is false", () => {
			fc.assert(
				fc.property(
					fc.oneof(fc.constant(true), fc.constant(null)),
					fc.oneof(fc.constant(true), fc.constant(null)),
					fc.boolean(),
					(globalFlag, individualFlag, isImportable) => {
						const result = isCapabilityEnabled(globalFlag, individualFlag, isImportable);
						expect(result).toBe(isImportable);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 3.4: isCapabilityEnabled never throws", () => {
		/**
		 * **Validates: Requirements 2.5, 2.6, 2.7**
		 * 
		 * isCapabilityEnabled never throws for any combination of inputs.
		 * The function must be total (defined for all valid input combinations).
		 */
		it("should never throw for any combination of (globalFlag, individualFlag, isImportable)", () => {
			fc.assert(
				fc.property(
					flagArbitrary,
					flagArbitrary,
					fc.boolean(),
					(globalFlag, individualFlag, isImportable) => {
						expect(() => {
							isCapabilityEnabled(globalFlag, individualFlag, isImportable);
						}).not.toThrow();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Exhaustive enumeration: all 18 combinations", () => {
		/**
		 * **Validates: Requirements 2.5, 2.6, 2.7**
		 * 
		 * There are exactly 18 combinations (3 globalFlag × 3 individualFlag × 2 isImportable).
		 * Test all of them exhaustively to ensure complete coverage.
		 */
		const flagValues = [true, false, null];
		const importableValues = [true, false];

		// Generate all 18 combinations
		const allCombinations = [];
		for (const globalFlag of flagValues) {
			for (const individualFlag of flagValues) {
				for (const isImportable of importableValues) {
					allCombinations.push({ globalFlag, individualFlag, isImportable });
				}
			}
		}

		it("should cover exactly 18 combinations", () => {
			expect(allCombinations.length).toBe(18);
		});

		it.each(allCombinations)(
			"isCapabilityEnabled($globalFlag, $individualFlag, $isImportable) follows precedence rules",
			({ globalFlag, individualFlag, isImportable }) => {
				const result = isCapabilityEnabled(globalFlag, individualFlag, isImportable);

				// Determine expected result based on precedence rules
				let expected;
				if (globalFlag === false) {
					expected = false;
				} else if (individualFlag === false) {
					expected = false;
				} else {
					expected = isImportable;
				}

				expect(result).toBe(expected);
			}
		);

		it("should return boolean for all combinations", () => {
			for (const { globalFlag, individualFlag, isImportable } of allCombinations) {
				const result = isCapabilityEnabled(globalFlag, individualFlag, isImportable);
				expect(typeof result).toBe("boolean");
			}
		});
	});
});
