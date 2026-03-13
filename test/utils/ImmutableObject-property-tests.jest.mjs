import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import ImmutableObject from '../../src/lib/tools/ImmutableObject.class.js';

/**
 * ImmutableObject Property-Based Tests - Jest Migration
 * 
 * Tests universal properties of the ImmutableObject class using property-based testing
 * with fast-check to validate behavior across arbitrary inputs.
 * 
 * Feature: 1-3-10-test-migration-phase-5
 * Requirements: 2.2, 2.8, 2.9, 2.10
 * 
 * Properties Tested:
 * - Property 3: Defensive copy immutability
 * - Property 4: Output compatibility with JSON pattern
 * - Property 5: Deep clone reference breaking
 */
describe('ImmutableObject - Property-Based Tests', () => {

	describe('Property 3: Defensive Copy Immutability', () => {
		/**
		 * Property 3: Defensive Copy Immutability
		 * 
		 * For any object stored in ImmutableObject, modifying the returned value
		 * from get() should not affect the internal state of the container.
		 * 
		 * Requirements: 2.3, 2.4, 2.6, 2.7, 2.8
		 */

		it('Property 3: should not affect internal state when modifying returned values', () => {
			fc.assert(
				fc.property(
					fc.object(),
					(obj) => {
						// Create an ImmutableObject with the generated object
						const immutable = new ImmutableObject(obj, true);
						
						// Get a copy of the object
						const copy = immutable.get();
						
						// Store the original state
						const originalState = immutable.get();
						
						// Modify the copy
						if (typeof copy === 'object' && copy !== null) {
							copy.modifiedProperty = 'modified';
							if (Object.keys(copy).length > 0) {
								const firstKey = Object.keys(copy)[0];
								copy[firstKey] = 'modified';
							}
						}
						
						// Get the state after modification
						const stateAfterModification = immutable.get();
						
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

		it('Property 3: should not affect internal state when modifying nested values', () => {
			fc.assert(
				fc.property(
					fc.object({ maxDepth: 3 }),
					(obj) => {
						// Create an ImmutableObject with the generated object
						const immutable = new ImmutableObject(obj, true);
						
						// Get a copy of the object
						const copy = immutable.get();
						
						// Store the original state
						const originalState = immutable.get();
						
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
						const stateAfterModification = immutable.get();
						
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

		it('Property 3: should not affect internal state when getting by key', () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), fc.anything()),
					(obj) => {
						// Skip if object is empty
						if (Object.keys(obj).length === 0) return true;
						
						// Create an ImmutableObject with the generated object
						const immutable = new ImmutableObject(obj, true);
						
						// Get a key from the object
						const keys = Object.keys(obj);
						const testKey = keys[0];
						
						// Get a copy of the value at that key
						const copy = immutable.get(testKey);
						
						// Store the original state
						const originalState = immutable.get(testKey);
						
						// Modify the copy
						if (typeof copy === 'object' && copy !== null) {
							copy.modifiedProperty = 'modified';
						}
						
						// Get the state after modification
						const stateAfterModification = immutable.get(testKey);
						
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

	describe('Property 4: Output Compatibility with JSON Pattern', () => {
		/**
		 * Property 4: Output Compatibility with JSON Pattern
		 * 
		 * For any JSON-serializable data, the output from structuredClone (used by
		 * ImmutableObject) should be identical to the output from JSON.parse(JSON.stringify()).
		 * 
		 * This ensures backwards compatibility with the previous JSON-based cloning approach.
		 * 
		 * Requirements: 2.9
		 */

		// Helper to create JSON-compatible arbitrary values (no undefined)
		const jsonValue = () => fc.oneof(
			fc.string(),
			fc.integer(),
			fc.double(),
			fc.boolean(),
			fc.constant(null)
		);

		it('Property 4: should produce output identical to JSON pattern for plain objects', () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), jsonValue()),
					(obj) => {
						// Create an ImmutableObject with structuredClone
						const immutable = new ImmutableObject(obj, true);
						const structuredCloneOutput = immutable.get();
						
						// Create the same object using JSON pattern
						const jsonPatternOutput = JSON.parse(JSON.stringify(obj));
						
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

		it('Property 4: should produce identical output for nested objects', () => {
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
					(obj) => {
						// Create an ImmutableObject with structuredClone
						const immutable = new ImmutableObject(obj, true);
						const structuredCloneOutput = immutable.get();
						
						// Create the same object using JSON pattern
						const jsonPatternOutput = JSON.parse(JSON.stringify(obj));
						
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

		it('Property 4: should produce identical output when getting by key', () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), jsonValue()),
					(obj) => {
						// Skip if object is empty
						if (Object.keys(obj).length === 0) return true;
						
						// Create an ImmutableObject with structuredClone
						const immutable = new ImmutableObject(obj, true);
						
						// Get a key from the object
						const keys = Object.keys(obj);
						const testKey = keys[0];
						
						const structuredCloneOutput = immutable.get(testKey);
						
						// Create the same value using JSON pattern
						const jsonPatternOutput = JSON.parse(JSON.stringify(obj[testKey]));
						
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

	describe('Property 5: Deep Clone Reference Breaking', () => {
		/**
		 * Property 5: Deep Clone Reference Breaking
		 * 
		 * For any nested object structure, cloning should break references at all
		 * nesting levels, not just the top level.
		 * 
		 * Requirements: 2.10
		 */

		it('Property 5: should break all references at all nesting levels', () => {
			fc.assert(
				fc.property(
					fc.object({ maxDepth: 5 }),
					(obj) => {
						// Skip if object is not deeply nested
						if (typeof obj !== 'object' || obj === null) return true;
						
						// Create an ImmutableObject
						const immutable = new ImmutableObject(obj, true);
						
						// Get a clone
						const clone = immutable.get();
						
						// Store the original state
						const originalState = JSON.stringify(immutable.get());
						
						// Try to modify nested values in the clone
						function modifyNested(o, depth = 0) {
							if (depth > 10 || typeof o !== 'object' || o === null) return;
							
							for (const key in o) {
								if (typeof o[key] === 'object' && o[key] !== null) {
									o[key].deepModification = 'modified';
									modifyNested(o[key], depth + 1);
								} else {
									o[key] = 'modified';
								}
							}
						}
						
						modifyNested(clone);
						
						// Get the state after modification
						const stateAfterModification = JSON.stringify(immutable.get());
						
						// Verify the internal state hasn't changed
						expect(stateAfterModification).toBe(originalState);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it('Property 5: should break references in arrays within objects', () => {
			fc.assert(
				fc.property(
					fc.record({
						items: fc.array(fc.object())
					}),
					(obj) => {
						// Create an ImmutableObject
						const immutable = new ImmutableObject(obj, true);
						
						// Get a clone
						const clone = immutable.get();
						
						// Store the original state
						const originalState = JSON.stringify(immutable.get());
						
						// Modify array items in the clone
						if (clone.items && Array.isArray(clone.items)) {
							clone.items.forEach((item, index) => {
								if (typeof item === 'object' && item !== null) {
									item.modified = true;
									clone.items[index] = { replaced: true };
								}
							});
							clone.items.push({ added: true });
						}
						
						// Get the state after modification
						const stateAfterModification = JSON.stringify(immutable.get());
						
						// Verify the internal state hasn't changed
						expect(stateAfterModification).toBe(originalState);
					}
				),
				{ 
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it('Property 5: should break references when getting nested values by key', () => {
			fc.assert(
				fc.property(
					fc.record({
						nested: fc.object({ maxDepth: 3 })
					}),
					(obj) => {
						// Create an ImmutableObject
						const immutable = new ImmutableObject(obj, true);
						
						// Get the nested value by key
						const nestedClone = immutable.get('nested');
						
						// Store the original state
						const originalState = JSON.stringify(immutable.get('nested'));
						
						// Modify the nested clone
						if (typeof nestedClone === 'object' && nestedClone !== null) {
							nestedClone.topLevelModification = 'modified';
							
							for (const key in nestedClone) {
								if (typeof nestedClone[key] === 'object' && nestedClone[key] !== null) {
									nestedClone[key].deepModification = 'modified';
								}
							}
						}
						
						// Get the state after modification
						const stateAfterModification = JSON.stringify(immutable.get('nested'));
						
						// Verify the internal state hasn't changed
						expect(stateAfterModification).toBe(originalState);
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
