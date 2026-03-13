import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import ResponseDataModel from '../../src/lib/tools/ResponseDataModel.class.js';

/* ****************************************************************************
 * ResponseDataModel Property-Based Tests (Jest)
 * Feature: 1-3-10-test-migration-phase-5
 * 
 * This test suite validates the ResponseDataModel class using property-based
 * testing with fast-check. It ensures defensive copy immutability and output
 * compatibility with JSON serialization patterns.
 */

describe("ResponseDataModel - Property-Based Tests", () => {

	describe("Property 3: Defensive Copy Immutability", () => {
		// Feature: 1-3-10-test-migration-phase-5, Property 3: Defensive Copy Immutability

		it("should not affect internal state when modifying getResponseData() return value", () => {
			fc.assert(
				fc.property(
					fc.object(),
					(data) => {
						// Create a ResponseDataModel with the generated data
						const model = new ResponseDataModel(data);
						
						// Get a copy of the response data
						const copy = model.getResponseData();
						
						// Store the original state
						const originalState = model.getResponseData();
						
						// Modify the copy
						if (typeof copy === 'object' && copy !== null) {
							copy.modifiedProperty = 'modified';
							if (Object.keys(copy).length > 0) {
								const firstKey = Object.keys(copy)[0];
								copy[firstKey] = 'modified';
							}
						}
						
						// Get the state after modification
						const stateAfterModification = model.getResponseData();
						
						// Verify the internal state hasn't changed
						expect(JSON.stringify(stateAfterModification)).toBe(JSON.stringify(originalState));
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should not affect internal state when modifying nested values in getResponseData()", () => {
			fc.assert(
				fc.property(
					fc.object({ maxDepth: 3 }),
					(data) => {
						// Create a ResponseDataModel with the generated data
						const model = new ResponseDataModel(data);
						
						// Get a copy of the response data
						const copy = model.getResponseData();
						
						// Store the original state
						const originalState = model.getResponseData();
						
						// Try to modify nested values in the copy
						if (typeof copy === 'object' && copy !== null) {
							for (const key in copy) {
								if (typeof copy[key] === 'object' && copy[key] !== null) {
									copy[key].nestedModification = 'modified';
									break;
								}
							}
						}
						
						// Get the state after modification
						const stateAfterModification = model.getResponseData();
						
						// Verify the internal state hasn't changed
						expect(JSON.stringify(stateAfterModification)).toBe(JSON.stringify(originalState));
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should not affect internal state when modifying addItemByKey() cloned data", () => {
			fc.assert(
				fc.property(
					fc.object(),
					fc.string(),
					(item, key) => {
						// Skip empty keys
						if (key === "") return true;
						
						// Skip objects with functions (not cloneable by structuredClone)
						// This is acceptable because ResponseDataModel is used for JSON-serializable data
						if (typeof item === 'object' && item !== null) {
							for (const k in item) {
								if (typeof item[k] === 'function') {
									return true; // Skip this test case
								}
							}
						}
						
						// Create a ResponseDataModel
						const model = new ResponseDataModel({});
						
						// Add an item by key (this internally clones the data)
						model.addItemByKey(item, key);
						
						// Get the current state
						const stateBeforeModification = model.getResponseData();
						
						// Try to modify the original item
						if (typeof item === 'object' && item !== null) {
							item.modifiedProperty = 'modified';
							for (const k in item) {
								item[k] = 'modified';
							}
						}
						
						// Get the state after modifying the original
						const stateAfterModification = model.getResponseData();
						
						// Verify the internal state hasn't changed
						expect(JSON.stringify(stateAfterModification)).toBe(JSON.stringify(stateBeforeModification));
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should not affect internal state when modifying array items", () => {
			fc.assert(
				fc.property(
					fc.array(fc.object()),
					(items) => {
						// Skip empty arrays
						if (items.length === 0) return true;
						
						// Create a ResponseDataModel with array data
						const model = new ResponseDataModel(items);
						
						// Get a copy of the response data
						const copy = model.getResponseData();
						
						// Store the original state
						const originalState = model.getResponseData();
						
						// Modify array items in the copy
						if (Array.isArray(copy)) {
							copy.forEach((item, index) => {
								if (typeof item === 'object' && item !== null) {
									item.modified = true;
									copy[index] = { replaced: true };
								}
							});
							copy.push({ added: true });
						}
						
						// Get the state after modification
						const stateAfterModification = model.getResponseData();
						
						// Verify the internal state hasn't changed
						expect(JSON.stringify(stateAfterModification)).toBe(JSON.stringify(originalState));
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("Property 4: Output Compatibility with JSON Pattern", () => {
		// Feature: 1-3-10-test-migration-phase-5, Property 4: Output Compatibility with JSON Pattern

		// Helper to create JSON-compatible arbitrary values (no undefined)
		const jsonValue = () => fc.oneof(
			fc.string(),
			fc.integer(),
			fc.double(),
			fc.boolean(),
			fc.constant(null)
		);

		it("should produce output identical to JSON pattern for getResponseData()", () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), jsonValue()),
					(data) => {
						// Create a ResponseDataModel with structuredClone
						const model = new ResponseDataModel(data);
						const structuredCloneOutput = model.getResponseData();
						
						// Create the same data using JSON pattern
						const jsonPatternOutput = JSON.parse(JSON.stringify(data));
						
						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).toBe(JSON.stringify(jsonPatternOutput));
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should produce identical output for nested response data", () => {
			// Create nested JSON-compatible objects
			const nestedJsonObject = fc.letrec(tie => ({
				value: fc.oneof(
					fc.string(),
					fc.integer(),
					fc.double(),
					fc.boolean(),
					fc.constant(null),
					fc.array(tie('value'), { maxLength: 5 }),
					fc.dictionary(fc.string(), tie('value'), { maxKeys: 5 })
				)
			})).value;

			fc.assert(
				fc.property(
					nestedJsonObject,
					(data) => {
						// Create a ResponseDataModel with structuredClone
						const model = new ResponseDataModel(data);
						const structuredCloneOutput = model.getResponseData();
						
						// Create the same data using JSON pattern
						const jsonPatternOutput = JSON.parse(JSON.stringify(data));
						
						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).toBe(JSON.stringify(jsonPatternOutput));
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should produce identical output for array response data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.dictionary(fc.string(), jsonValue())),
					(data) => {
						// Create a ResponseDataModel with array data
						const model = new ResponseDataModel(data);
						const structuredCloneOutput = model.getResponseData();
						
						// Create the same data using JSON pattern
						const jsonPatternOutput = JSON.parse(JSON.stringify(data));
						
						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).toBe(JSON.stringify(jsonPatternOutput));
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should produce identical output for toObject() method", () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), jsonValue()),
					fc.string(),
					(data, label) => {
						// Skip empty labels
						if (label === "") return true;
						
						// Create a ResponseDataModel with label
						const model = new ResponseDataModel(data, label);
						const structuredCloneOutput = model.toObject();
						
						// Create the same object using JSON pattern
						let jsonPatternOutput = {};
						jsonPatternOutput[label] = JSON.parse(JSON.stringify(data));
						
						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).toBe(JSON.stringify(jsonPatternOutput));
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("Unit Tests: Edge Cases", () => {

		describe("Empty response data", () => {
			it("should handle empty object response data", () => {
				const model = new ResponseDataModel({});
				const data = model.getResponseData();
				
				expect(data).toEqual({});
				expect(JSON.stringify(data)).toBe(JSON.stringify({}));
			});

			it("should handle null response data", () => {
				const model = new ResponseDataModel(null);
				const data = model.getResponseData();
				
				expect(data).toBeNull();
			});

			it("should handle empty array response data", () => {
				const model = new ResponseDataModel([]);
				const data = model.getResponseData();
				
				expect(data).toEqual([]);
				expect(Array.isArray(data)).toBe(true);
			});
		});

		describe("Null items", () => {
			it("should handle null items in addItem()", () => {
				const model = new ResponseDataModel(null);
				model.addItem(null);
				
				const data = model.getResponseData();
				expect(Array.isArray(data)).toBe(true);
				expect(data).toEqual([null]);
			});

			it("should handle null items in addItemByKey()", () => {
				const model = new ResponseDataModel({});
				model.addItemByKey(null, "testKey");
				
				const data = model.getResponseData();
				expect(data.testKey).toBeNull();
			});

			it("should handle null values in nested structures", () => {
				const testData = {
					level1: {
						level2: null,
						level2b: {
							level3: null
						}
					}
				};
				
				const model = new ResponseDataModel(testData);
				const data = model.getResponseData();
				
				expect(data.level1.level2).toBeNull();
				expect(data.level1.level2b.level3).toBeNull();
			});
		});

		describe("Complex nested response structures", () => {
			it("should handle deeply nested objects", () => {
				const testData = {
					level1: {
						level2: {
							level3: {
								level4: {
									level5: {
										value: "deep"
									}
								}
							}
						}
					}
				};
				
				const model = new ResponseDataModel(testData);
				const data = model.getResponseData();
				
				expect(data.level1.level2.level3.level4.level5.value).toBe("deep");
			});

			it("should handle arrays within nested objects", () => {
				const testData = {
					users: [
						{ id: 1, name: "Alice", tags: ["admin", "user"] },
						{ id: 2, name: "Bob", tags: ["user"] }
					],
					metadata: {
						counts: [10, 20, 30],
						nested: {
							items: ["a", "b", "c"]
						}
					}
				};
				
				const model = new ResponseDataModel(testData);
				const data = model.getResponseData();
				
				expect(data.users).toHaveLength(2);
				expect(data.users[0].tags).toEqual(["admin", "user"]);
				expect(data.metadata.counts).toEqual([10, 20, 30]);
				expect(data.metadata.nested.items).toEqual(["a", "b", "c"]);
			});

			it("should handle mixed types in nested structures", () => {
				const testData = {
					string: "text",
					number: 42,
					boolean: true,
					null: null,
					array: [1, "two", true, null],
					object: {
						nested: {
							value: 123
						}
					}
				};
				
				const model = new ResponseDataModel(testData);
				const data = model.getResponseData();
				
				expect(data.string).toBe("text");
				expect(data.number).toBe(42);
				expect(data.boolean).toBe(true);
				expect(data.null).toBeNull();
				expect(data.array).toEqual([1, "two", true, null]);
				expect(data.object.nested.value).toBe(123);
			});

			it("should handle ResponseDataModel instances in addItem()", () => {
				const innerModel = new ResponseDataModel({ inner: "data" }, "innerLabel");
				const outerModel = new ResponseDataModel(null);
				
				outerModel.addItem(innerModel);
				
				const data = outerModel.getResponseData();
				// When adding an item with a label, it creates an object with that label as key
				expect(data).toEqual(expect.any(Object));
				expect(data.innerLabel).toEqual(expect.any(Array));
				expect(data.innerLabel[0]).toEqual({ inner: "data" });
			});

			it("should handle ResponseDataModel instances in addItemByKey()", () => {
				const innerModel = new ResponseDataModel({ inner: "data" });
				const outerModel = new ResponseDataModel({});
				
				outerModel.addItemByKey(innerModel, "nested");
				
				const data = outerModel.getResponseData();
				expect(data.nested).toEqual({ inner: "data" });
			});

			it("should handle converting single value to array when adding duplicate keys", () => {
				const model = new ResponseDataModel({});
				
				model.addItemByKey({ id: 1 }, "item");
				model.addItemByKey({ id: 2 }, "item");
				
				const data = model.getResponseData();
				expect(Array.isArray(data.item)).toBe(true);
				expect(data.item).toHaveLength(2);
				expect(data.item[0]).toEqual({ id: 1 });
				expect(data.item[1]).toEqual({ id: 2 });
			});
		});

		describe("addItem() behavior", () => {
			it("should add items to array structure correctly", () => {
				const model = new ResponseDataModel(null);
				model.addItem({ id: 1 });
				model.addItem({ id: 2 });
				
				const data = model.getResponseData();
				expect(Array.isArray(data)).toBe(true);
				expect(data).toHaveLength(2);
				expect(data[0]).toEqual({ id: 1 });
				expect(data[1]).toEqual({ id: 2 });
			});

			it("should add items to object with 'items' key when responseData is object", () => {
				const model = new ResponseDataModel({});
				model.addItem({ id: 1 });
				model.addItem({ id: 2 });
				
				const data = model.getResponseData();
				expect(data.items).toEqual(expect.any(Array));
				expect(data.items).toHaveLength(2);
			});
		});

		describe("toObject() and toString() methods", () => {
			it("should return data wrapped with label as key", () => {
				const model = new ResponseDataModel({ id: 1, name: "test" }, "user");
				const obj = model.toObject();
				
				expect(obj).toEqual({
					user: { id: 1, name: "test" }
				});
			});

			it("should return data directly when no label", () => {
				const model = new ResponseDataModel({ id: 1, name: "test" });
				const obj = model.toObject();
				
				expect(obj).toEqual({ id: 1, name: "test" });
			});

			it("should return valid JSON string", () => {
				const model = new ResponseDataModel({ id: 1, name: "test" }, "user");
				const jsonStr = model.toString();
				
				expect(() => JSON.parse(jsonStr)).not.toThrow();
				expect(JSON.parse(jsonStr)).toEqual({
					user: { id: 1, name: "test" }
				});
			});
		});

		describe("getLabel() method", () => {
			it("should return the label", () => {
				const model = new ResponseDataModel({ id: 1 }, "testLabel");
				expect(model.getLabel()).toBe("testLabel");
			});

			it("should return empty string when no label", () => {
				const model = new ResponseDataModel({ id: 1 });
				expect(model.getLabel()).toBe("");
			});
		});
	});
});
