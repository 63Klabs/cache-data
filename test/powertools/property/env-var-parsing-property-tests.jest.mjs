import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import { TestHarness } from "../../../src/lib/tools/PowertoolsInit.js";

/**
 * Property 2: Environment Variable Parsing Correctness
 * 
 * For any string value assigned to a CACHE_DATA_POWERTOOLS* environment variable,
 * parseEnvFlag SHALL return false if and only if the lowercase value is one of
 * "0", "false", or "no"; SHALL return null if the value is undefined, null, or
 * empty string; and SHALL return true for all other non-empty string values.
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.8**
 */
describe("Property 2: Environment Variable Parsing Correctness", () => {

	const { parseEnvFlag } = TestHarness.getInternals();

	describe("Disabled values return false", () => {
		/**
		 * For any string in {"0", "false", "no"} (any case), parseEnvFlag returns false.
		 */
		it('should return false for disabled values in any case variation', () => {
			const disabledValues = fc.constantFrom(
				"0", "false", "no",
				"FALSE", "False", "NO", "No",
				"FaLsE", "nO", "fAlSe"
			);

			fc.assert(
				fc.property(
					disabledValues,
					(value) => {
						const result = parseEnvFlag(value);
						expect(result).toBe(false);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it('should return false for any case permutation of "false", "no", and "0"', () => {
			// Generate arbitrary case permutations of disabled words
			const casePermutation = (word) => fc.array(
				fc.boolean(),
				{ minLength: word.length, maxLength: word.length }
			).map(booleans =>
				word.split("").map((ch, i) => booleans[i] ? ch.toUpperCase() : ch.toLowerCase()).join("")
			);

			const arbitraryDisabled = fc.oneof(
				casePermutation("false"),
				casePermutation("no"),
				fc.constant("0")
			);

			fc.assert(
				fc.property(
					arbitraryDisabled,
					(value) => {
						const result = parseEnvFlag(value);
						expect(result).toBe(false);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("Unset values return null", () => {
		/**
		 * For undefined, null, or "", parseEnvFlag returns null.
		 */
		it('should return null for undefined, null, or empty string', () => {
			const unsetValues = fc.oneof(
				fc.constant(undefined),
				fc.constant(null),
				fc.constant("")
			);

			fc.assert(
				fc.property(
					unsetValues,
					(value) => {
						const result = parseEnvFlag(value);
						expect(result).toBe(null);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("All other non-empty strings return true", () => {
		/**
		 * For any other non-empty string, parseEnvFlag returns true.
		 */
		it('should return true for any non-empty string that is not a disabled value', () => {
			const disabledLowercase = ["0", "false", "no"];

			const nonDisabledString = fc.string({ minLength: 1 }).filter(
				(s) => !disabledLowercase.includes(s.toLowerCase())
			);

			fc.assert(
				fc.property(
					nonDisabledString,
					(value) => {
						const result = parseEnvFlag(value);
						expect(result).toBe(true);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it('should return true for common enabled values', () => {
			const enabledValues = fc.constantFrom(
				"1", "true", "yes", "TRUE", "True", "YES", "Yes",
				"on", "ON", "enabled", "anything", "random-value"
			);

			fc.assert(
				fc.property(
					enabledValues,
					(value) => {
						const result = parseEnvFlag(value);
						expect(result).toBe(true);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("parseEnvFlag never throws", () => {
		/**
		 * parseEnvFlag never throws for any input.
		 */
		it('should never throw for any arbitrary input', () => {
			const anyInput = fc.oneof(
				fc.string(),
				fc.constant(undefined),
				fc.constant(null),
				fc.constant("")
			);

			fc.assert(
				fc.property(
					anyInput,
					(value) => {
						expect(() => parseEnvFlag(value)).not.toThrow();
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});
});
