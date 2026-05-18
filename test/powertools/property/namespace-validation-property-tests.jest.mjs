import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import { TestHarness } from "../../../src/lib/tools/PowertoolsInit.js";
import { TestHarness as MetricsTestHarness } from "../../../src/lib/utils/MetricsHelper.js";

/**
 * Property 14: Namespace Validation
 * 
 * For any string s used as a metrics namespace, the system SHALL accept s if and
 * only if 1 <= s.length <= 256 and s conforms to CloudWatch namespace character
 * rules (alphanumeric, hyphens, underscores, periods, forward slashes, @ symbol).
 * 
 * **Validates: Requirements 10.5**
 */
describe("Property 14: Namespace Validation", () => {

	const { isValidNamespace } = TestHarness.getInternals();
	const { isValidNamespace: metricsIsValidNamespace } = MetricsTestHarness.getInternals();

	/** Valid characters for CloudWatch namespaces */
	const VALID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./@";

	/** Arbitrary that generates valid namespace strings (1-256 chars, valid chars only) */
	const validNamespaceArb = fc.string({
		unit: fc.constantFrom(...VALID_CHARS.split("")),
		minLength: 1,
		maxLength: 256
	});

	describe("Valid namespaces are accepted", () => {
		/**
		 * For any string of 1-256 characters composed only of valid CloudWatch
		 * namespace characters, isValidNamespace returns true.
		 */
		it("should accept strings of 1-256 chars with only valid characters", () => {
			fc.assert(
				fc.property(
					validNamespaceArb,
					(namespace) => {
						expect(isValidNamespace(namespace)).toBe(true);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should accept common namespace patterns", () => {
			const commonNamespaces = fc.constantFrom(
				"CacheData",
				"my-app/cache",
				"@63klabs/cache-data",
				"MyService",
				"my_namespace",
				"app.metrics",
				"a",
				"A".repeat(256),
				"my-app/v2.0/metrics",
				"@scope/package-name"
			);

			fc.assert(
				fc.property(
					commonNamespaces,
					(namespace) => {
						expect(isValidNamespace(namespace)).toBe(true);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("Invalid namespaces are rejected", () => {
		/**
		 * Empty strings are rejected (length < 1).
		 */
		it("should reject empty strings", () => {
			expect(isValidNamespace("")).toBe(false);
		});

		/**
		 * Strings longer than 256 characters are rejected.
		 */
		it("should reject strings longer than 256 characters", () => {
			const tooLongNamespace = fc.string({
				unit: fc.constantFrom(...VALID_CHARS.split("")),
				minLength: 257,
				maxLength: 512
			});

			fc.assert(
				fc.property(
					tooLongNamespace,
					(namespace) => {
						expect(isValidNamespace(namespace)).toBe(false);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		/**
		 * Strings containing invalid characters (spaces, special chars) are rejected.
		 */
		it("should reject strings containing spaces", () => {
			const namespaceWithSpace = fc.tuple(
				fc.string({ unit: fc.constantFrom(...VALID_CHARS.split("")), minLength: 0, maxLength: 100 }),
				fc.string({ unit: fc.constantFrom(...VALID_CHARS.split("")), minLength: 0, maxLength: 100 })
			).map(([before, after]) => `${before} ${after}`);

			fc.assert(
				fc.property(
					namespaceWithSpace,
					(namespace) => {
						expect(isValidNamespace(namespace)).toBe(false);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should reject strings containing special characters like !, #, $, etc.", () => {
			const invalidChars = "!#$%^&*()+=[]{}|\\:;\"'<>,?`~ \t\n";
			const namespaceWithInvalidChar = fc.tuple(
				fc.string({ unit: fc.constantFrom(...VALID_CHARS.split("")), minLength: 0, maxLength: 50 }),
				fc.constantFrom(...invalidChars.split("")),
				fc.string({ unit: fc.constantFrom(...VALID_CHARS.split("")), minLength: 0, maxLength: 50 })
			).map(([before, invalidChar, after]) => `${before}${invalidChar}${after}`);

			fc.assert(
				fc.property(
					namespaceWithInvalidChar,
					(namespace) => {
						expect(isValidNamespace(namespace)).toBe(false);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		/**
		 * Non-string inputs are rejected.
		 */
		it("should reject non-string inputs", () => {
			const nonStringInputs = fc.oneof(
				fc.constant(undefined),
				fc.constant(null),
				fc.integer(),
				fc.boolean(),
				fc.constant({}),
				fc.constant([])
			);

			fc.assert(
				fc.property(
					nonStringInputs,
					(input) => {
						expect(isValidNamespace(input)).toBe(false);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("Both implementations agree", () => {
		/**
		 * The isValidNamespace function in PowertoolsInit and MetricsHelper
		 * produce the same result for any input.
		 */
		it("should produce identical results from PowertoolsInit and MetricsHelper", () => {
			const anyString = fc.oneof(
				fc.string({ minLength: 0, maxLength: 300 }),
				fc.string({ unit: fc.constantFrom(...VALID_CHARS.split("")), minLength: 0, maxLength: 300 })
			);

			fc.assert(
				fc.property(
					anyString,
					(input) => {
						expect(isValidNamespace(input)).toBe(metricsIsValidNamespace(input));
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("Boundary conditions", () => {
		/**
		 * Exactly 1 character (minimum valid length) is accepted if valid char.
		 */
		it("should accept single valid characters (length = 1)", () => {
			const singleValidChar = fc.constantFrom(...VALID_CHARS.split(""));

			fc.assert(
				fc.property(
					singleValidChar,
					(char) => {
						expect(isValidNamespace(char)).toBe(true);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		/**
		 * Exactly 256 characters (maximum valid length) is accepted if all valid chars.
		 */
		it("should accept strings of exactly 256 valid characters", () => {
			const exactMax = fc.string({
				unit: fc.constantFrom(...VALID_CHARS.split("")),
				minLength: 256,
				maxLength: 256
			});

			fc.assert(
				fc.property(
					exactMax,
					(namespace) => {
						expect(isValidNamespace(namespace)).toBe(true);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		/**
		 * Exactly 257 characters (one over max) is rejected even if all valid chars.
		 */
		it("should reject strings of exactly 257 valid characters", () => {
			const oneOverMax = fc.string({
				unit: fc.constantFrom(...VALID_CHARS.split("")),
				minLength: 257,
				maxLength: 257
			});

			fc.assert(
				fc.property(
					oneOverMax,
					(namespace) => {
						expect(isValidNamespace(namespace)).toBe(false);
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
