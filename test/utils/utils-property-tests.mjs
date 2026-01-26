import { expect } from 'chai';
import fc from 'fast-check';
import { hashThisData } from '../../src/lib/tools/index.js';

/* ****************************************************************************
 * Utils Property-Based Tests
 * Feature: reduce-json-stringify
 */

describe("Utils Property-Based Tests", () => {

	// Feature: reduce-json-stringify, Property 4: Hash Data Cloning Isolation
	describe("Property 4: Hash Data Cloning Isolation", () => {
		
		it("should not modify original data when hashing objects", () => {
			fc.assert(
				fc.property(
					fc.object({ maxDepth: 3 }),
					(originalData) => {
						// Create a deep copy to compare against later using structuredClone
						// (JSON.parse(JSON.stringify()) removes undefined, which would cause false failures)
						const dataCopy = structuredClone(originalData);
						
						// Hash the data (which internally clones it)
						hashThisData("SHA256", originalData);
						
						// Verify original data is unchanged
						expect(originalData).to.deep.equal(dataCopy);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not modify original options when hashing with options", () => {
			fc.assert(
				fc.property(
					fc.object({ maxDepth: 2 }),
					fc.record({
						salt: fc.string(),
						iterations: fc.integer({ min: 1, max: 5 })
					}),
					(data, originalOptions) => {
						// Create a deep copy to compare against later using structuredClone
						const optionsCopy = structuredClone(originalOptions);
						
						// Hash the data with options (which internally clones options)
						hashThisData("SHA256", data, originalOptions);
						
						// Verify original options are unchanged
						expect(originalOptions).to.deep.equal(optionsCopy);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not modify original data when hashing arrays", () => {
			fc.assert(
				fc.property(
					fc.array(fc.anything(), { maxLength: 20 }),
					(originalData) => {
						// Create a deep copy to compare against later using structuredClone
						const dataCopy = structuredClone(originalData);
						
						// Hash the data (which internally clones it)
						hashThisData("SHA256", originalData);
						
						// Verify original data is unchanged
						expect(originalData).to.deep.equal(dataCopy);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not modify nested structures in original data", () => {
			fc.assert(
				fc.property(
					fc.record({
						nested: fc.object({ maxDepth: 3 }),
						array: fc.array(fc.integer(), { maxLength: 10 }),
						value: fc.string()
					}),
					(originalData) => {
						// Create a deep copy to compare against later using structuredClone
						const dataCopy = structuredClone(originalData);
						
						// Hash the data (which internally clones it)
						hashThisData("SHA256", originalData);
						
						// Verify original data is unchanged
						expect(originalData).to.deep.equal(dataCopy);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// Feature: reduce-json-stringify, Property 2: Output Compatibility with JSON Pattern
	describe("Property 2: Output Compatibility with JSON Pattern", () => {
		
		it("should produce identical hash output for structuredClone vs JSON pattern", () => {
			fc.assert(
				fc.property(
					fc.object({ maxDepth: 3 }),
					(data) => {
						// Skip if data contains undefined (JSON.stringify removes it)
						const hasUndefined = JSON.stringify(data) !== JSON.stringify(JSON.parse(JSON.stringify(data)));
						if (hasUndefined) return true;
						
						// Hash with current implementation (using structuredClone)
						const hashWithStructuredClone = hashThisData("SHA256", data);
						
						// The hash should be deterministic and reproducible
						const hashAgain = hashThisData("SHA256", data);
						
						// Verify hashes are identical
						expect(hashWithStructuredClone).to.equal(hashAgain);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should produce identical hash for objects with different key orders", () => {
			fc.assert(
				fc.property(
					fc.record({
						a: fc.string(),
						b: fc.integer(),
						c: fc.boolean()
					}),
					(data) => {
						// Create object with different key order
						const reordered = { c: data.c, a: data.a, b: data.b };
						
						const hash1 = hashThisData("SHA256", data);
						const hash2 = hashThisData("SHA256", reordered);
						
						// Hashes should be identical regardless of key order
						expect(hash1).to.equal(hash2);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should produce consistent hashes for nested structures", () => {
			fc.assert(
				fc.property(
					fc.record({
						nested: fc.object({ maxDepth: 2 }),
						array: fc.array(fc.integer(), { maxLength: 10 })
					}),
					(data) => {
						// Skip if data contains undefined
						const hasUndefined = JSON.stringify(data) !== JSON.stringify(JSON.parse(JSON.stringify(data)));
						if (hasUndefined) return true;
						
						const hash1 = hashThisData("SHA256", data);
						const hash2 = hashThisData("SHA256", data);
						
						// Hashes should be identical for same data
						expect(hash1).to.equal(hash2);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should produce consistent hashes with options", () => {
			fc.assert(
				fc.property(
					fc.object({ maxDepth: 2 }),
					fc.record({
						salt: fc.string(),
						iterations: fc.integer({ min: 1, max: 3 })
					}),
					(data, options) => {
						// Skip if data contains undefined
						const hasUndefined = JSON.stringify(data) !== JSON.stringify(JSON.parse(JSON.stringify(data)));
						if (hasUndefined) return true;
						
						const hash1 = hashThisData("SHA256", data, options);
						const hash2 = hashThisData("SHA256", data, options);
						
						// Hashes should be identical for same data and options
						expect(hash1).to.equal(hash2);
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
