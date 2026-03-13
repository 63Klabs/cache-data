import { describe, it, expect } from '@jest/globals';
import { hashThisData } from '../../src/lib/tools/index.js';

/**
 * Hash Data Tests (Jest Migration)
 * 
 * Tests for hashThisData() utility function covering:
 * - Consistent hash generation for same input
 * - Different hashes for different inputs
 * - Handling of various data types
 * - Nested objects and arrays
 * - Edge cases for structuredClone optimization
 * 
 * Requirements: 5.1, 5.5, 5.6
 */

describe("Hash Data", () => {

	describe("General", () => {

		it("should return string", () => {
			const data = {
				key: "value"
			};

			const hash = hashThisData("SHA256", data);

			expect(typeof hash).toBe("string");
		});

		it("should return same hash for simple objects with re-arranged keys", () => {
			const data1 = {
				key: "value",
				key2: "value2"
			};

			const data2 = {
				key2: "value2",
				key: "value"
			};

			const hash1 = hashThisData("SHA256", data1);
			const hash2 = hashThisData("SHA256", data2);

			expect(hash1).toBe(hash2);
		});

		it("should hash a string", () => {
			const hash = hashThisData("SHA256", "Hello World");
			expect(hash).toBe("f6ab55d92d5fb24661a5cfa693907e41f3bb0b7e657394479d9968466706b166");
		});

		it("should hash a number", () => {
			const hash = hashThisData("SHA256", 1234);
			expect(hash).toBe("acfe2f30062203e6ee2c260cce422e36ed819662af9d06f32519310c5617c0c3");
		});

		it("should hash a boolean", () => {
			const hash = hashThisData("SHA256", true);
			expect(hash).toBe("74e32b84ec102b47c71797fd974fd87c9eee80bcca986bd766b1567da77b99d5");
		});

		it("should hash undefined", () => {
			const hash = hashThisData("SHA256", undefined);
			expect(hash).toBe("3b8c1b768a759eed9623446a15cf4ce2a7e70082aa87f3ab933c8f6f2f5aee0b");
		});

		it("should hash null", () => {
			const hash = hashThisData("SHA256", null);
			expect(hash).toBe("da92ecddbdeff7d55f7958f938ecdf7ca7c86afcabcb1f695cd7488560cb37df");
		});

		it("should hash a function", () => {
			const testFunc = function () { console.log("Hello World"); };
			const hash1 = hashThisData("SHA256", testFunc);
			const hash2 = hashThisData("SHA256", testFunc);
			// Verify function hashing is consistent (same function produces same hash)
			expect(hash1).toBe(hash2);
			expect(typeof hash1).toBe("string");
			expect(hash1.length).toBeGreaterThan(0);
		});

		it("should hash a BigInt", () => {
			const hash = hashThisData("SHA256", 1234n);
			expect(hash).toBe("1593e6a47279766ad87c57f9bdaf930c8d9d4bbf942cdae2566b2282208d1268");
		});

		it("should hash a Symbol", () => {
			const hash = hashThisData("SHA256", Symbol("foo"));
			expect(hash).toBe("7773248fce063d7a6d99620c93542e76647be06895a79b2ca9408490f044a376");
		});

		it("should hash a Date", () => {
			const hash = hashThisData("SHA256", new Date("2024-04-12T01:54:45.873Z"));
			expect(hash).toBe("9eed3c651638b063bb7b74cc92f445cbfe2f972245ce142eb2f6568157592544");
		});

		it("should hash an object", () => {
			const hash = hashThisData("SHA256", { statement: "Hello, World", id: "58768G", amount: 58.09 });
			expect(hash).toBe("00eaa3263b59036da553c0808c5baad8c2ab2ea9fa9992da8eb4b5c5ba60af09");
		});

		it("should hash an array", () => {
			const hash = hashThisData("SHA256", [1, 2, 3, 4]);
			expect(hash).toBe("056da7b24110d30c74b5c91e3c5007abd0bc6ce726fdc3f1e4447af946255910");
		});
	});

	describe("Simple Object", () => {
		const data1a = {
			greeting: "Hello",
			audience: "World"
		};

		const data1b = {
			audience: "World",
			greeting: "Hello"
		};

		const data2a = {
			greeting: "Goodbye",
			audience: "World"
		};

		const data2b = {
			greeting: "Hello",
			audience: "Pluto"
		};

		const hash1a = hashThisData("SHA256", data1a);
		const hash1b = hashThisData("SHA256", data1b);
		const hash2a = hashThisData("SHA256", data2a);
		const hash2b = hashThisData("SHA256", data2b);

		it("should produce equal hashes for equal objects", () => {
			expect(hash1a).toBe(hash1a);
		});

		it("should produce different hashes for different objects round 1", () => {
			expect(hash1a).not.toBe(hash2a);
		});

		it("should produce different hashes for different objects round 2", () => {
			expect(hash1a).not.toBe(hash2b);
		});

		it("should produce different hashes for different objects round 3", () => {
			expect(hash2a).not.toBe(hash2b);
		});
	});

	describe("Simple Array", () => {
		const data1a = [
			"Hello",
			"World",
			"Apples",
			"Bananas",
			"Oranges"
		];

		const data1b = [
			"World",
			"Hello",
			"Oranges",
			"Bananas",
			"Apples"
		];

		const data2a = [
			"Goodbye",
			"World",
			"Tangerines",
			"Apples"
		];

		const data2b = [
			"Hello",
			"Pluto",
			"Tangerines",
			"Bananas"
		];

		const hash1a = hashThisData("SHA256", data1a);
		const hash1b = hashThisData("SHA256", data1b);
		const hash2a = hashThisData("SHA256", data2a);
		const hash2b = hashThisData("SHA256", data2b);

		it("should produce equal hashes for equal arrays", () => {
			expect(hash1a).toBe(hash1b);
		});

		it("should produce different hashes for different arrays round 1", () => {
			expect(hash1a).not.toBe(hash2a);
		});

		it("should produce different hashes for different arrays round 2", () => {
			expect(hash1a).not.toBe(hash2b);
		});

		it("should produce different hashes for different arrays round 3", () => {
			expect(hash2a).not.toBe(hash2b);
		});
	});

	describe("Simple Nested Object", () => {
		const data1a = {
			greeting: "Hello",
			audience: {
				name: "World",
				food: "Apples"
			}
		};

		const data1b = {
			audience: {
				food: "Apples",
				name: "World"
			},
			greeting: "Hello"
		};

		const data2a = {
			greeting: "Goodbye",
			audience: {
				name: "World",
				food: "Apples"
			}
		};

		const data2b = {
			greeting: "Hello",
			audience: {
				name: "Pluto",
				food: "Bananas"
			}
		};

		const hash1a = hashThisData("SHA256", data1a);
		const hash1b = hashThisData("SHA256", data1b);
		const hash2a = hashThisData("SHA256", data2a);
		const hash2b = hashThisData("SHA256", data2b);

		it("should produce equal hashes for equal nested objects", () => {
			expect(hash1a).toBe(hash1b);
		});

		it("should produce different hashes for different nested objects round 1", () => {
			expect(hash1a).not.toBe(hash2a);
		});

		it("should produce different hashes for different nested objects round 2", () => {
			expect(hash1a).not.toBe(hash2b);
		});

		it("should produce different hashes for different nested objects round 3", () => {
			expect(hash2a).not.toBe(hash2b);
		});
	});

	describe("Edge Cases for structuredClone optimization", () => {

		describe("hashThisData with various data types", () => {
			it("should handle empty objects", () => {
				const hash = hashThisData("SHA256", {});
				expect(typeof hash).toBe("string");
				expect(hash.length).toBeGreaterThan(0);
			});

			it("should handle empty arrays", () => {
				const hash = hashThisData("SHA256", []);
				expect(typeof hash).toBe("string");
				expect(hash.length).toBeGreaterThan(0);
			});

			it("should handle objects with null values", () => {
				const data = { a: null, b: null };
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).toBe("string");
			});

			it("should handle arrays with null values", () => {
				const data = [null, null, null];
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).toBe("string");
			});

			it("should handle mixed types in objects", () => {
				const data = {
					string: "test",
					number: 123,
					boolean: true,
					null: null,
					array: [1, 2, 3],
					object: { nested: "value" }
				};
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).toBe("string");
			});

			it("should handle mixed types in arrays", () => {
				const data = ["string", 123, true, null, [1, 2], { key: "value" }];
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).toBe("string");
			});
		});

		describe("Options cloning with nested structures", () => {
			it("should handle options with salt", () => {
				const data = { test: "value" };
				const hash1 = hashThisData("SHA256", data, { salt: "salt1" });
				const hash2 = hashThisData("SHA256", data, { salt: "salt2" });
				expect(hash1).not.toBe(hash2);
			});

			it("should handle options with iterations", () => {
				const data = { test: "value" };
				const hash1 = hashThisData("SHA256", data, { iterations: 1 });
				const hash2 = hashThisData("SHA256", data, { iterations: 2 });
				expect(hash1).not.toBe(hash2);
			});

			it("should handle options with both salt and iterations", () => {
				const data = { test: "value" };
				const hash = hashThisData("SHA256", data, { salt: "test", iterations: 3 });
				expect(typeof hash).toBe("string");
			});

			it("should handle empty options object", () => {
				const data = { test: "value" };
				const hash = hashThisData("SHA256", data, {});
				expect(typeof hash).toBe("string");
			});
		});

		describe("Normalization behavior preservation", () => {
			it("should normalize BigInt values", () => {
				const data1 = { value: BigInt(123) };
				const data2 = { value: BigInt(123) };
				const hash1 = hashThisData("SHA256", data1);
				const hash2 = hashThisData("SHA256", data2);
				expect(hash1).toBe(hash2);
			});

			it("should normalize undefined values", () => {
				const data1 = { a: undefined, b: "test" };
				const data2 = { a: undefined, b: "test" };
				const hash1 = hashThisData("SHA256", data1);
				const hash2 = hashThisData("SHA256", data2);
				expect(hash1).toBe(hash2);
			});

			it("should produce consistent hashes for objects with same content but different key order", () => {
				const data1 = { a: 1, b: 2, c: 3 };
				const data2 = { c: 3, a: 1, b: 2 };
				const hash1 = hashThisData("SHA256", data1);
				const hash2 = hashThisData("SHA256", data2);
				expect(hash1).toBe(hash2);
			});

			it("should produce consistent hashes for arrays with same content but different order", () => {
				const data1 = [1, 2, 3];
				const data2 = [3, 2, 1];
				const hash1 = hashThisData("SHA256", data1);
				const hash2 = hashThisData("SHA256", data2);
				expect(hash1).toBe(hash2);
			});

			it("should handle deeply nested objects", () => {
				const data = {
					level1: {
						level2: {
							level3: {
								level4: {
									value: "deep"
								}
							}
						}
					}
				};
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).toBe("string");
			});

			it("should handle deeply nested arrays", () => {
				const data = [[[[[1, 2, 3]]]]];
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).toBe("string");
			});

			it("should handle mixed nested structures", () => {
				const data = {
					array: [
						{ nested: [1, 2, 3] },
						{ nested: [4, 5, 6] }
					],
					object: {
						array: [7, 8, 9]
					}
				};
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).toBe("string");
			});
		});
	});
});
