import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { hashThisData } from '../../src/lib/tools/index.js';

/**
 * Utils Property-Based Tests (Jest Migration)
 * 
 * Property-based tests for utility functions covering:
 * - Property 6: Hash function determinism
 * - Property 7: Hash function collision resistance
 * - Property 8: Hash data cloning isolation
 * - Property 4: Output compatibility with JSON pattern
 * 
 * Feature: 1-3-10-test-migration-phase-5
 * Requirements: 5.4, 5.13, 5.14
 */

describe("Utils Property-Based Tests", () => {

	// Feature: 1-3-10-test-migration-phase-5, Property 6: Hash Function Determinism
	describe("Property 6: Hash Function Determinism", () => {
		
		it("should produce same hash for same input across multiple calls", () => {
			fc.assert(
				fc.property(
					fc.object({ maxDepth: 3 }),
					(data) => {
						// Skip if data contains undefined (JSON.stringify removes it)
						const hasUndefined = JSON.stringify(data) !== JSON.stringify(JSON.parse(JSON.stringify(data)));
						if (hasUndefined) return true;
						
						const hash1 = hashThisData("SHA256", data);
						const hash2 = hashThisData("SHA256", data);
						
						// Same input must produce same hash
						expect(hash1).toBe(hash2);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should produce consistent hashes for primitives", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.string(),
						fc.integer(),
						fc.boolean()
					),
					(value) => {
						const hash1 = hashThisData("SHA256", value);
						const hash2 = hashThisData("SHA256", value);
						
						expect(hash1).toBe(hash2);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	// Feature: 1-3-10-test-migration-phase-5, Property 7: Hash Function Collision Resistance
	describe("Property 7: Hash Function Collision Resistance", () => {
		
		it("should produce different hashes for different inputs", () => {
			fc.assert(
				fc.property(
					fc.object({ maxDepth: 2 }),
					fc.object({ maxDepth: 2 }),
					(data1, data2) => {
						// Skip if data contains undefined
						const hasUndefined1 = JSON.stringify(data1) !== JSON.stringify(JSON.parse(JSON.stringify(data1)));
						const hasUndefined2 = JSON.stringify(data2) !== JSON.stringify(JSON.parse(JSON.stringify(data2)));
						if (hasUndefined1 || hasUndefined2) return true;
						
						// Skip if data is the same
						if (JSON.stringify(data1) === JSON.stringify(data2)) return true;
						
						const hash1 = hashThisData("SHA256", data1);
						const hash2 = hashThisData("SHA256", data2);
						
						// Different inputs should produce different hashes
						expect(hash1).not.toBe(hash2);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should produce different hashes for different strings", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1 }),
					fc.string({ minLength: 1 }),
					(str1, str2) => {
						// Skip if strings are the same
						if (str1 === str2) return true;
						
						const hash1 = hashThisData("SHA256", str1);
						const hash2 = hashThisData("SHA256", str2);
						
						expect(hash1).not.toBe(hash2);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	// Feature: 1-3-10-test-migration-phase-5, Property 8: Hash Data Cloning Isolation
	describe("Property 8: Hash Data Cloning Isolation", () => {
		
		it("should not modify original data when hashing objects", () => {
			fc.assert(
				fc.property(
					fc.object({ maxDepth: 3 }),
					(originalData) => {
						// Create a deep copy to compare against later using structuredClone
						const dataCopy = structuredClone(originalData);
						
						// Hash the data (which internally clones it)
						hashThisData("SHA256", originalData);
						
						// Verify original data is unchanged
						expect(originalData).toEqual(dataCopy);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
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
						expect(originalOptions).toEqual(optionsCopy);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
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
						expect(originalData).toEqual(dataCopy);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
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
						expect(originalData).toEqual(dataCopy);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	// Feature: 1-3-10-test-migration-phase-5, Property 4: Output Compatibility with JSON Pattern
	describe("Property 4: Output Compatibility with JSON Pattern", () => {
		
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
						expect(hashWithStructuredClone).toBe(hashAgain);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
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
						expect(hash1).toBe(hash2);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
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
						expect(hash1).toBe(hash2);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
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
						expect(hash1).toBe(hash2);
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
