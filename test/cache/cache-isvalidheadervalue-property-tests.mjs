/**
 * Property-based tests for Cache._isValidHeaderValue() helper function
 * Uses fast-check to validate universal correctness properties
 * 
 * Property 2: Header Value Type Validation
 * Validates: Requirements 1.4, 1.5
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import { Cache } from '../../src/lib/dao-cache.js';

describe('Cache._isValidHeaderValue() - Property-Based Tests', () => {
	
	describe('Property 2: Header Value Type Validation', () => {
		// Feature: cache-dao-fix, Property 2: Header Value Type Validation
		// Validates: Requirements 1.4, 1.5
		
		it('should return true only for non-empty strings and valid numbers', () => {
			fc.assert(
				fc.property(
					// Generate random header values of various types
					fc.oneof(
						fc.string(),
						fc.integer(),
						fc.float(),
						fc.constant(null),
						fc.constant(undefined),
						fc.boolean(),
						fc.object(),
						fc.array(fc.anything()),
						fc.constant(NaN),
						fc.func(fc.anything())
					),
					(value) => {
						const result = Cache._isValidHeaderValue(value);
						
						// Determine expected result based on value type
						let expectedResult = false;
						
						if (typeof value === 'string' && value.length > 0 && value !== 'undefined') {
							// Non-empty strings are valid, except for the string "undefined"
							expectedResult = true;
						} else if (typeof value === 'number' && !isNaN(value)) {
							expectedResult = true;
						}
						
						// Verify the result matches expectations
						assert.strictEqual(
							result,
							expectedResult,
							`_isValidHeaderValue(${JSON.stringify(value)}) returned ${result}, expected ${expectedResult}`
						);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('should reject all invalid types (null, undefined, boolean, object, array, empty string, NaN)', () => {
			fc.assert(
				fc.property(
					// Generate only invalid types
					fc.oneof(
						fc.constant(null),
						fc.constant(undefined),
						fc.boolean(),
						fc.object(),
						fc.array(fc.anything()),
						fc.constant(NaN),
						fc.constant(''), // empty string
						fc.func(fc.anything())
					),
					(value) => {
						const result = Cache._isValidHeaderValue(value);
						
						// All these types should return false
						assert.strictEqual(
							result,
							false,
							`_isValidHeaderValue(${JSON.stringify(value)}) should return false for invalid type`
						);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('should accept all valid types (non-empty strings and valid numbers)', () => {
			fc.assert(
				fc.property(
					// Generate only valid types
					fc.oneof(
						fc.string({ minLength: 1 }).filter(s => s !== 'undefined'), // non-empty strings except "undefined"
						fc.integer(), // integers (not NaN)
						fc.float().filter(n => !isNaN(n)) // floats (not NaN)
					),
					(value) => {
						const result = Cache._isValidHeaderValue(value);
						
						// All these types should return true
						assert.strictEqual(
							result,
							true,
							`_isValidHeaderValue(${JSON.stringify(value)}) should return true for valid type`
						);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('should handle edge cases consistently', () => {
			fc.assert(
				fc.property(
					// Generate edge case values
					fc.oneof(
						fc.constant(0), // zero
						fc.constant(-0), // negative zero
						fc.constant(Infinity),
						fc.constant(-Infinity),
						fc.constant(' '), // single space
						fc.constant('0'), // string zero
						fc.constant('false'), // string false
						fc.constant('null'), // string null
						fc.constant('undefined') // string undefined - should be rejected
					),
					(value) => {
						const result = Cache._isValidHeaderValue(value);
						
						// Determine expected result
						let expectedResult = false;
						
						if (typeof value === 'string' && value.length > 0 && value !== 'undefined') {
							// Non-empty strings are valid, except for the string "undefined"
							expectedResult = true;
						} else if (typeof value === 'number' && !isNaN(value)) {
							expectedResult = true;
						}
						
						assert.strictEqual(
							result,
							expectedResult,
							`_isValidHeaderValue(${JSON.stringify(value)}) edge case handling failed`
						);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('should be consistent across multiple invocations with same value', () => {
			fc.assert(
				fc.property(
					fc.anything(),
					(value) => {
						// Call the function multiple times with the same value
						const result1 = Cache._isValidHeaderValue(value);
						const result2 = Cache._isValidHeaderValue(value);
						const result3 = Cache._isValidHeaderValue(value);
						
						// All results should be identical
						assert.strictEqual(
							result1,
							result2,
							`_isValidHeaderValue should return consistent results`
						);
						assert.strictEqual(
							result2,
							result3,
							`_isValidHeaderValue should return consistent results`
						);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
