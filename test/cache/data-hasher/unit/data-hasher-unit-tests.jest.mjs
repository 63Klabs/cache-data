/**
 * Unit tests for the internal DataHasher class.
 *
 * DataHasher is an internal class (not part of the public API), so it is imported
 * directly by file path, matching the pattern used by the in-memory-cache tests.
 *
 * These tests lock in the hashing semantics introduced in release 1.4.0:
 * - determinism for a fixed (algorithm, data, options)
 * - array element order is significant (at every nesting depth)
 * - object key order is insignificant (at every nesting depth)
 * - salt and iterations change the result deterministically
 * - deep nesting hashes without error
 * - null/primitive inputs are distinguishable from each other
 * - an empty object and an empty array hash differently (container-type marker)
 *
 * Validates: Requirements 9.1, 9.2, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.3, 4.4
 */

import { describe, it, expect } from "@jest/globals";
import DataHasher from "../../../../src/lib/utils/DataHasher.class.js";

const ALGORITHM = "sha256";

describe("DataHasher.hash() - Unit Tests", () => {

	describe("Determinism", () => {

		it("should return identical hashes for the same algorithm, data, and options across calls", () => {
			const data = { host: "example.com", path: "/api", parameters: { page: 1 } };
			const hashOne = DataHasher.hash(ALGORITHM, data);
			const hashTwo = DataHasher.hash(ALGORITHM, data);
			expect(hashOne).toBe(hashTwo);
		});

		it("should return identical hashes when options are supplied identically", () => {
			const data = { a: 1, b: [2, 3] };
			const options = { salt: "pepper", iterations: 3 };
			const hashOne = DataHasher.hash(ALGORITHM, data, options);
			const hashTwo = DataHasher.hash(ALGORITHM, data, options);
			expect(hashOne).toBe(hashTwo);
		});

		it("should not mutate the caller's options object", () => {
			const options = { salt: "pepper" };
			DataHasher.hash(ALGORITHM, { a: 1 }, options);
			expect(options).toEqual({ salt: "pepper" });
		});
	});

	describe("Array order significance", () => {

		it("should produce different hashes for the same elements in a different order", () => {
			const forward = DataHasher.hash(ALGORITHM, ["apple", "orange"]);
			const reversed = DataHasher.hash(ALGORITHM, ["orange", "apple"]);
			expect(forward).not.toBe(reversed);
		});

		it("should produce identical hashes for the same elements in the same order", () => {
			const first = DataHasher.hash(ALGORITHM, ["apple", "orange"]);
			const second = DataHasher.hash(ALGORITHM, ["apple", "orange"]);
			expect(first).toBe(second);
		});
	});

	describe("Nested array order significance", () => {

		it("should treat array order as significant for arrays nested inside objects", () => {
			const forward = DataHasher.hash(ALGORITHM, { items: ["apple", "orange"] });
			const reversed = DataHasher.hash(ALGORITHM, { items: ["orange", "apple"] });
			expect(forward).not.toBe(reversed);
		});

		it("should treat array order as significant for arrays nested inside other arrays", () => {
			const forward = DataHasher.hash(ALGORITHM, [["apple", "orange"], ["pear", "plum"]]);
			const reorderedInner = DataHasher.hash(ALGORITHM, [["orange", "apple"], ["pear", "plum"]]);
			expect(forward).not.toBe(reorderedInner);
		});

		it("should treat the order of nested arrays themselves as significant", () => {
			const forward = DataHasher.hash(ALGORITHM, [["apple", "orange"], ["pear", "plum"]]);
			const swappedOuter = DataHasher.hash(ALGORITHM, [["pear", "plum"], ["apple", "orange"]]);
			expect(forward).not.toBe(swappedOuter);
		});
	});

	describe("Object key order independence", () => {

		it("should produce identical hashes when top-level keys are in a different order", () => {
			const first = DataHasher.hash(ALGORITHM, { headers: { a: 1 }, parameters: { b: 2 } });
			const second = DataHasher.hash(ALGORITHM, { parameters: { b: 2 }, headers: { a: 1 } });
			expect(first).toBe(second);
		});

		it("should produce identical hashes when nested object keys are in a different order", () => {
			const first = DataHasher.hash(ALGORITHM, { outer: { a: 1, b: 2, c: 3 } });
			const second = DataHasher.hash(ALGORITHM, { outer: { c: 3, a: 1, b: 2 } });
			expect(first).toBe(second);
		});
	});

	describe("Salt effect", () => {

		it("should produce different hashes for differing salts on otherwise identical input", () => {
			const data = { a: 1, b: 2 };
			const noSalt = DataHasher.hash(ALGORITHM, data);
			const salted = DataHasher.hash(ALGORITHM, data, { salt: "pepper" });
			expect(noSalt).not.toBe(salted);
		});

		it("should produce different hashes for two different salts", () => {
			const data = { a: 1, b: 2 };
			const saltOne = DataHasher.hash(ALGORITHM, data, { salt: "salt-one" });
			const saltTwo = DataHasher.hash(ALGORITHM, data, { salt: "salt-two" });
			expect(saltOne).not.toBe(saltTwo);
		});
	});

	describe("Iterations effect", () => {

		it("should produce different hashes for iterations: 2 vs iterations: 1", () => {
			const data = { a: 1, b: 2 };
			const onceIterated = DataHasher.hash(ALGORITHM, data, { iterations: 1 });
			const twiceIterated = DataHasher.hash(ALGORITHM, data, { iterations: 2 });
			expect(onceIterated).not.toBe(twiceIterated);
		});

		it("should clamp iterations below 1 to 1 (iterations: 0 equals iterations: 1)", () => {
			const data = { a: 1, b: 2 };
			const clamped = DataHasher.hash(ALGORITHM, data, { iterations: 0 });
			const explicitOne = DataHasher.hash(ALGORITHM, data, { iterations: 1 });
			expect(clamped).toBe(explicitOne);
		});

		it("should clamp negative iterations to 1 (iterations: -5 equals iterations: 1)", () => {
			const data = { a: 1, b: 2 };
			const clamped = DataHasher.hash(ALGORITHM, data, { iterations: -5 });
			const explicitOne = DataHasher.hash(ALGORITHM, data, { iterations: 1 });
			expect(clamped).toBe(explicitOne);
		});
	});

	describe("Deep nesting", () => {

		it("should hash an arbitrary-depth object/array mix without error and deterministically", () => {
			const deep = {
				level1: {
					items: [
						{ id: 1, tags: ["a", "b"] },
						{ id: 2, tags: ["c", { nested: ["d", "e"] }] }
					],
					meta: { flags: [true, false], counts: { x: 10, y: 20 } }
				}
			};
			let hashOne;
			expect(() => { hashOne = DataHasher.hash(ALGORITHM, deep); }).not.toThrow();
			const hashTwo = DataHasher.hash(ALGORITHM, deep);
			expect(hashOne).toBe(hashTwo);
			expect(typeof hashOne).toBe("string");
			expect(hashOne.length).toBeGreaterThan(0);
		});
	});

	describe("null and primitive inputs", () => {

		it("should distinguish null from the string \"null\"", () => {
			const nullHash = DataHasher.hash(ALGORITHM, null);
			const stringNullHash = DataHasher.hash(ALGORITHM, "null");
			expect(nullHash).not.toBe(stringNullHash);
		});

		it("should distinguish a number from its string form", () => {
			const numberHash = DataHasher.hash(ALGORITHM, 42);
			const stringHash = DataHasher.hash(ALGORITHM, "42");
			expect(numberHash).not.toBe(stringHash);
		});

		it("should distinguish a boolean from its string form", () => {
			const booleanHash = DataHasher.hash(ALGORITHM, true);
			const stringHash = DataHasher.hash(ALGORITHM, "true");
			expect(booleanHash).not.toBe(stringHash);
		});

		it("should distinguish a bigint from a number of the same magnitude", () => {
			const bigintHash = DataHasher.hash(ALGORITHM, 10n);
			const numberHash = DataHasher.hash(ALGORITHM, 10);
			expect(bigintHash).not.toBe(numberHash);
		});

		it("should distinguish a number from a boolean", () => {
			const numberHash = DataHasher.hash(ALGORITHM, 1);
			const booleanHash = DataHasher.hash(ALGORITHM, true);
			expect(numberHash).not.toBe(booleanHash);
		});

		it("should hash primitive inputs deterministically", () => {
			expect(DataHasher.hash(ALGORITHM, null)).toBe(DataHasher.hash(ALGORITHM, null));
			expect(DataHasher.hash(ALGORITHM, 42)).toBe(DataHasher.hash(ALGORITHM, 42));
			expect(DataHasher.hash(ALGORITHM, true)).toBe(DataHasher.hash(ALGORITHM, true));
			expect(DataHasher.hash(ALGORITHM, "text")).toBe(DataHasher.hash(ALGORITHM, "text"));
		});
	});

	describe("Empty container distinction", () => {

		it("should hash an empty object differently from an empty array", () => {
			const emptyObjectHash = DataHasher.hash(ALGORITHM, {});
			const emptyArrayHash = DataHasher.hash(ALGORITHM, []);
			expect(emptyObjectHash).not.toBe(emptyArrayHash);
		});

		it("should hash an empty object and an empty array each deterministically", () => {
			expect(DataHasher.hash(ALGORITHM, {})).toBe(DataHasher.hash(ALGORITHM, {}));
			expect(DataHasher.hash(ALGORITHM, [])).toBe(DataHasher.hash(ALGORITHM, []));
		});
	});
});
