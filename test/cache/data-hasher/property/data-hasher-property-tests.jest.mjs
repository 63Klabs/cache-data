/**
 * Property-based tests for the internal DataHasher class (release 1.4.0).
 *
 * DataHasher is an internal class (not part of the public API), so it is imported
 * directly by file path, matching the pattern used by the in-memory-cache and the
 * DataHasher unit tests. The public wrapper `tools.hashThisData` is imported from the
 * tools index to validate wrapper equivalence.
 *
 * These property tests lock in the hashing invariants across many generated inputs,
 * following the repository property-test guardrails:
 * - No per-call-site `seed` option: the global FC_SEED hook
 *   (test/setup/fast-check-seed.mjs, registered via setupFilesAfterEnv) supplies it.
 * - Non-vacuous generators: order-significance is established by constructing two arrays
 *   that are permutations of each other with >= 2 DISTINCT elements BY CONSTRUCTION
 *   (unique-tagged elements, then a non-identity permutation) rather than by filtering a
 *   generator on the predicate the property asserts.
 * - Generated strings/keys are restricted to JSON-serializable content as a PRECONDITION
 *   (this matches the implementation's acceptance rule; it is NOT a filter on the asserted
 *   predicate).
 * - Default numRuns (100). No child processes.
 *
 * Validates: Requirements 9.1, 9.3, 2.1, 2.2, 2.4, 3.1, 3.2, 4.1, 4.3, 4.4, 7.3
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import DataHasher from "../../../../src/lib/utils/DataHasher.class.js";
import tools from "../../../../src/lib/tools/index.js";

const ALGORITHM = "sha256";

// Algorithms used by the wrapper-equivalence property. A small constant set of valid
// Node crypto hash names; both entry points must agree for each.
const ALGORITHMS = ["sha256", "sha512", "RSA-SHA256"];

/**
 * JSON-safe scalar values. Restricting to these is a PRECONDITION: the implementation
 * accepts JSON-serializable input, so every generated value survives JSON.stringify.
 * This is not a filter on any asserted predicate.
 */
const jsonScalarArb = fc.oneof(
	fc.string(),
	fc.integer(),
	fc.double({ noNaN: true, noDefaultInfinity: true }),
	fc.boolean(),
	fc.constant(null)
);

/**
 * A small, JSON-serializable value: a scalar, or a shallow object/array of scalars.
 * Keeps inputs serializable (precondition) while exercising objects and arrays.
 */
const jsonValueArb = fc.oneof(
	jsonScalarArb,
	fc.array(jsonScalarArb, { maxLength: 5 }),
	fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), jsonScalarArb, { maxKeys: 5 })
);

describe("DataHasher.hash() - Property Tests", () => {

	describe("Property 1: Array order significance", () => {

		/**
		 * Distinct-by-construction permutation generator.
		 *
		 * A base array of >= 2 elements that are DISTINCT BY CONSTRUCTION: each element is
		 * tagged with its index (`${index}:${value}`), so no two entries can be equal even
		 * if the underlying strings collide. A non-identity permutation (reverse) is then
		 * applied, producing an ordering that differs from the base BY CONSTRUCTION. The
		 * hash is never evaluated to decide what to emit, so the property is not vacuous.
		 */
		const distinctArrayArb = fc
			.array(fc.string(), { minLength: 2, maxLength: 8 })
			.map((items) => items.map((value, index) => `${index}:${value}`));

		it("should produce different hashes for a different array order (reverse permutation)", () => {
			fc.assert(
				fc.property(distinctArrayArb, (baseArray) => {
					// reverse() is a non-identity permutation for any array of >= 2 distinct
					// elements, so permuted differs from baseArray by construction.
					const permuted = [...baseArray].reverse();
					const baseHash = DataHasher.hash(ALGORITHM, baseArray);
					const permutedHash = DataHasher.hash(ALGORITHM, permuted);
					expect(baseHash).not.toBe(permutedHash);
				})
			);
		});

		it("should treat array order as significant at a nested depth (array inside object)", () => {
			fc.assert(
				fc.property(distinctArrayArb, (baseArray) => {
					const permuted = [...baseArray].reverse();
					const baseHash = DataHasher.hash(ALGORITHM, { items: baseArray });
					const permutedHash = DataHasher.hash(ALGORITHM, { items: permuted });
					expect(baseHash).not.toBe(permutedHash);
				})
			);
		});
	});

	describe("Property 2: Object key-order independence", () => {

		/**
		 * Generates a pair of objects with identical key/value entries but inserted in two
		 * different key orders. The shuffle is driven by a fast-check permutation arbitrary
		 * (NOT Math.random()), so the reordering is reproducible under FC_SEED.
		 *
		 * Keys are generated unique (so a key is not overwritten) and restricted to
		 * JSON-safe strings (precondition).
		 */
		const keyedEntriesArb = fc
			.uniqueArray(
				fc.tuple(fc.string({ minLength: 1, maxLength: 8 }), jsonScalarArb),
				{ minLength: 1, maxLength: 6, selector: (entry) => entry[0] }
			);

		it("should produce identical hashes regardless of key insertion order", () => {
			fc.assert(
				fc.property(
					keyedEntriesArb,
					// subarray of the same entries acts as a fast-check-driven permutation
					// source; we build a full permutation from it below.
					fc.infiniteStream(fc.nat()),
					(entries, randomStream) => {
						// Build the first object by inserting entries in generated order.
						const first = {};
						for (const [key, value] of entries) { first[key] = value; }

						// Build a shuffled key order using the fast-check stream (not Math.random).
						const shuffledEntries = shuffleWithStream(entries, randomStream);
						const second = {};
						for (const [key, value] of shuffledEntries) { second[key] = value; }

						const firstHash = DataHasher.hash(ALGORITHM, first);
						const secondHash = DataHasher.hash(ALGORITHM, second);
						expect(firstHash).toBe(secondHash);
					}
				)
			);
		});

		it("should produce identical hashes regardless of nested key insertion order", () => {
			fc.assert(
				fc.property(
					keyedEntriesArb,
					fc.infiniteStream(fc.nat()),
					(entries, randomStream) => {
						const first = { outer: {} };
						for (const [key, value] of entries) { first.outer[key] = value; }

						const shuffledEntries = shuffleWithStream(entries, randomStream);
						const second = { outer: {} };
						for (const [key, value] of shuffledEntries) { second.outer[key] = value; }

						expect(DataHasher.hash(ALGORITHM, first)).toBe(DataHasher.hash(ALGORITHM, second));
					}
				)
			);
		});
	});

	describe("Property 3: Determinism", () => {

		it("should return the same hash for repeated calls on the same value", () => {
			fc.assert(
				fc.property(jsonValueArb, (value) => {
					expect(DataHasher.hash(ALGORITHM, value)).toBe(DataHasher.hash(ALGORITHM, value));
				})
			);
		});

		it("should return the same hash for a structurally-cloned copy of the value", () => {
			fc.assert(
				fc.property(jsonValueArb, (value) => {
					const clone = structuredClone(value);
					expect(DataHasher.hash(ALGORITHM, value)).toBe(DataHasher.hash(ALGORITHM, clone));
				})
			);
		});
	});

	describe("Property 4: Salt sensitivity", () => {

		it("should produce different hashes for two distinct-by-construction salts", () => {
			fc.assert(
				fc.property(jsonValueArb, fc.string(), (value, saltBase) => {
					// Two salts that differ BY CONSTRUCTION (one is a strict suffix extension
					// of the other), so the hash is never consulted to pick them.
					const saltOne = `a:${saltBase}`;
					const saltTwo = `b:${saltBase}`;
					const hashOne = DataHasher.hash(ALGORITHM, value, { salt: saltOne });
					const hashTwo = DataHasher.hash(ALGORITHM, value, { salt: saltTwo });
					expect(hashOne).not.toBe(hashTwo);
				})
			);
		});
	});

	describe("Property 5: Iterations effect", () => {

		it("should produce different hashes for iterations: 1 vs iterations: 2", () => {
			fc.assert(
				fc.property(jsonValueArb, (value) => {
					const onceIterated = DataHasher.hash(ALGORITHM, value, { iterations: 1 });
					const twiceIterated = DataHasher.hash(ALGORITHM, value, { iterations: 2 });
					expect(onceIterated).not.toBe(twiceIterated);
				})
			);
		});
	});

	describe("Property 6: Wrapper equivalence", () => {

		it("should return the identical hash from tools.hashThisData and DataHasher.hash", () => {
			fc.assert(
				fc.property(
					fc.constantFrom(...ALGORITHMS),
					jsonValueArb,
					fc.record({
						salt: fc.string(),
						iterations: fc.integer({ min: 1, max: 4 })
					}),
					(algorithm, value, options) => {
						const viaWrapper = tools.hashThisData(algorithm, value, options);
						const viaClass = DataHasher.hash(algorithm, value, options);
						expect(viaWrapper).toBe(viaClass);
					}
				)
			);
		});
	});
});

/**
 * Deterministically shuffle an array using a fast-check number stream as the entropy
 * source (NOT Math.random()), so a reported counterexample is reproducible under FC_SEED.
 *
 * Fisher-Yates driven by successive values pulled from the infinite stream.
 *
 * @param {Array} items - Array to shuffle (not mutated)
 * @param {{next: function(): {value: number}}} randomStream - fast-check nat stream iterator
 * @returns {Array} A new array with the same elements in a stream-determined order
 */
function shuffleWithStream(items, randomStream) {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const draw = randomStream.next().value;
		const j = draw % (i + 1);
		const temp = result[i];
		result[i] = result[j];
		result[j] = temp;
	}
	return result;
}
