import { expect } from 'chai';
import fc from 'fast-check';
import ResponseDataModel from '../../src/lib/tools/ResponseDataModel.class.js';

/* ****************************************************************************
 * ResponseDataModel Property-Based Tests
 * Feature: reduce-json-stringify
 */
describe("ResponseDataModel - Property-Based Tests", () => {

	describe("Property 1: Defensive Copy Immutability", () => {
		// Feature: reduce-json-stringify, Property 1: Defensive Copy Immutability

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
						expect(JSON.stringify(stateAfterModification)).to.equal(JSON.stringify(originalState));
					}
				),
				{ numRuns: 100 }
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
						expect(JSON.stringify(stateAfterModification)).to.equal(JSON.stringify(originalState));
					}
				),
				{ numRuns: 100 }
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
						expect(JSON.stringify(stateAfterModification)).to.equal(JSON.stringify(stateBeforeModification));
					}
				),
				{ numRuns: 100 }
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
						expect(JSON.stringify(stateAfterModification)).to.equal(JSON.stringify(originalState));
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});

	describe("Property 2: Output Compatibility with JSON Pattern", () => {
		// Feature: reduce-json-stringify, Property 2: Output Compatibility with JSON Pattern

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
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
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
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
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
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
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
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Unit Tests: Edge Cases", () => {

		describe("Empty response data", () => {
			it("should handle empty object response data", () => {
				const model = new ResponseDataModel({});
				const data = model.getResponseData();
				
				expect(data).to.deep.equal({});
				expect(JSON.stringify(data)).to.equal(JSON.stringify({}));
			});

			it("should handle null response data", () => {
				const model = new ResponseDataModel(null);
				const data = model.getResponseData();
				
				expect(data).to.be.null;
			});

			it("should handle empty array response data", () => {
				const model = new ResponseDataModel([]);
				const data = model.getResponseData();
				
				expect(data).to.deep.equal([]);
				expect(Array.isArray(data)).to.be.true;
			});
		});

		describe("Null items", () => {
			it("should handle null items in addItem()", () => {
				const model = new ResponseDataModel(null);
				model.addItem(null);
				
				const data = model.getResponseData();
				expect(Array.isArray(data)).to.be.true;
				expect(data).to.deep.equal([null]);
			});

			it("should handle null items in addItemByKey()", () => {
				const model = new ResponseDataModel({});
				model.addItemByKey(null, "testKey");
				
				const data = model.getResponseData();
				expect(data.testKey).to.be.null;
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
				
				expect(data.level1.level2).to.be.null;
				expect(data.level1.level2b.level3).to.be.null;
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
				
				expect(data.level1.level2.level3.level4.level5.value).to.equal("deep");
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
				
				expect(data.users).to.have.lengthOf(2);
				expect(data.users[0].tags).to.deep.equal(["admin", "user"]);
				expect(data.metadata.counts).to.deep.equal([10, 20, 30]);
				expect(data.metadata.nested.items).to.deep.equal(["a", "b", "c"]);
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
				
				expect(data.string).to.equal("text");
				expect(data.number).to.equal(42);
				expect(data.boolean).to.be.true;
				expect(data.null).to.be.null;
				expect(data.array).to.deep.equal([1, "two", true, null]);
				expect(data.object.nested.value).to.equal(123);
			});

			it("should handle ResponseDataModel instances in addItem()", () => {
				const innerModel = new ResponseDataModel({ inner: "data" }, "innerLabel");
				const outerModel = new ResponseDataModel(null);
				
				outerModel.addItem(innerModel);
				
				const data = outerModel.getResponseData();
				// When adding an item with a label, it creates an object with that label as key
				expect(data).to.be.an('object');
				expect(data.innerLabel).to.be.an('array');
				expect(data.innerLabel[0]).to.deep.equal({ inner: "data" });
			});

			it("should handle ResponseDataModel instances in addItemByKey()", () => {
				const innerModel = new ResponseDataModel({ inner: "data" });
				const outerModel = new ResponseDataModel({});
				
				outerModel.addItemByKey(innerModel, "nested");
				
				const data = outerModel.getResponseData();
				expect(data.nested).to.deep.equal({ inner: "data" });
			});

			it("should handle converting single value to array when adding duplicate keys", () => {
				const model = new ResponseDataModel({});
				
				model.addItemByKey({ id: 1 }, "item");
				model.addItemByKey({ id: 2 }, "item");
				
				const data = model.getResponseData();
				expect(Array.isArray(data.item)).to.be.true;
				expect(data.item).to.have.lengthOf(2);
				expect(data.item[0]).to.deep.equal({ id: 1 });
				expect(data.item[1]).to.deep.equal({ id: 2 });
			});
		});
	});
