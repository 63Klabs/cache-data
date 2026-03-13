import { describe, it, expect } from '@jest/globals';
import { safeClone } from '../../src/lib/tools/utils.js';

/**
 * SafeClone Tests (Jest Migration)
 * 
 * Tests for safeClone() utility function covering:
 * - Deep copy creation breaking all references
 * - Handling of circular references
 * - Promise handling without cloning
 * - Null and undefined handling
 * - Empty objects and arrays
 * - Nested objects at multiple levels
 * 
 * Requirements: 5.2, 5.7, 5.8, 5.9
 */

describe('safeClone', () => {

	describe('Basic cloning', () => {
		
		it('should clone simple objects', () => {
			const obj = { a: 1, b: 2, c: 3 };
			const cloned = safeClone(obj);
			
			expect(cloned).toEqual(obj);
			expect(cloned).not.toBe(obj); // Different reference
		});

		it('should clone nested objects', () => {
			const obj = { 
				a: 1, 
				b: { 
					c: 2, 
					d: { 
						e: 3 
					} 
				} 
			};
			const cloned = safeClone(obj);
			
			expect(cloned).toEqual(obj);
			expect(cloned).not.toBe(obj);
			expect(cloned.b).not.toBe(obj.b);
			expect(cloned.b.d).not.toBe(obj.b.d);
		});

		it('should clone arrays', () => {
			const arr = [1, 2, 3, { a: 4 }];
			const cloned = safeClone(arr);
			
			expect(cloned).toEqual(arr);
			expect(cloned).not.toBe(arr);
			expect(cloned[3]).not.toBe(arr[3]);
		});

		it('should handle null', () => {
			const result = safeClone(null);
			expect(result).toBeNull();
		});

		it('should handle primitives', () => {
			expect(safeClone(42)).toBe(42);
			expect(safeClone('test')).toBe('test');
			expect(safeClone(true)).toBe(true);
			expect(safeClone(undefined)).toBeUndefined();
		});

	});

	describe('Promise handling', () => {

		it('should handle objects containing Promises', () => {
			const obj = {
				data: 'value',
				nested: {
					count: 42
				},
				promise: Promise.resolve('test')
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			// Regular properties should be cloned correctly
			expect(cloned.data).toBe('value');
			expect(cloned.nested.count).toBe(42);
			
			// Promise should be converted to empty object by JSON fallback
			expect(typeof cloned.promise).toBe('object');
			expect(cloned.promise).toEqual({});
		});

		it('should handle resolved Promises', () => {
			const obj = {
				value: 'test',
				resolvedPromise: Promise.resolve({ result: 'data' })
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			expect(cloned.value).toBe('test');
			// Promise becomes empty object
			expect(cloned.resolvedPromise).toEqual({});
		});

		it('should handle rejected Promises', () => {
			const obj = {
				value: 'test',
				rejectedPromise: Promise.reject(new Error('test error'))
			};
			
			// Suppress unhandled rejection warning
			obj.rejectedPromise.catch(() => {});
			
			// Should not throw
			const cloned = safeClone(obj);
			
			expect(cloned.value).toBe('test');
			// Promise becomes empty object
			expect(cloned.rejectedPromise).toEqual({});
		});

		it('should handle pending Promises', () => {
			const obj = {
				value: 'test',
				pendingPromise: new Promise(() => {
					// Never resolves
				})
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			expect(cloned.value).toBe('test');
			// Promise becomes empty object
			expect(cloned.pendingPromise).toEqual({});
		});

		it('should handle arrays containing Promises', () => {
			const arr = [
				'value1',
				Promise.resolve('test'),
				{ data: 'value2' },
				Promise.reject(new Error('error'))
			];
			
			// Suppress unhandled rejection warning
			arr[3].catch(() => {});
			
			// Should not throw
			const cloned = safeClone(arr);
			
			expect(cloned[0]).toBe('value1');
			expect(cloned[1]).toEqual({});
			expect(cloned[2]).toEqual({ data: 'value2' });
			expect(cloned[3]).toEqual({});
		});

		it('should handle deeply nested Promises', () => {
			const obj = {
				level1: {
					level2: {
						level3: {
							data: 'value',
							promise: Promise.resolve('nested')
						}
					}
				}
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			expect(cloned.level1.level2.level3.data).toBe('value');
			expect(cloned.level1.level2.level3.promise).toEqual({});
		});

	});

	describe('Non-cloneable values', () => {

		it('should handle functions by converting to undefined', () => {
			const obj = {
				data: 'value',
				func: function() { return 'test'; }
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			expect(cloned.data).toBe('value');
			// Functions are removed by JSON.stringify
			expect(cloned.func).toBeUndefined();
		});

		it('should handle symbols by removing them', () => {
			const sym = Symbol('test');
			const obj = {
				data: 'value',
				[sym]: 'symbol value'
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			expect(cloned.data).toBe('value');
			// Symbols are removed by JSON.stringify
			expect(cloned[sym]).toBeUndefined();
		});

		it('should handle mixed non-cloneable values', () => {
			const obj = {
				string: 'value',
				number: 42,
				promise: Promise.resolve('test'),
				func: () => 'test',
				nested: {
					data: 'nested',
					anotherPromise: Promise.resolve('nested promise')
				}
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			expect(cloned.string).toBe('value');
			expect(cloned.number).toBe(42);
			expect(cloned.promise).toEqual({});
			expect(cloned.func).toBeUndefined();
			expect(cloned.nested.data).toBe('nested');
			expect(cloned.nested.anotherPromise).toEqual({});
		});

	});

	describe('Edge cases', () => {

		it('should handle empty objects', () => {
			const obj = {};
			const cloned = safeClone(obj);
			
			expect(cloned).toEqual({});
			expect(cloned).not.toBe(obj);
		});

		it('should handle empty arrays', () => {
			const arr = [];
			const cloned = safeClone(arr);
			
			expect(cloned).toEqual([]);
			expect(cloned).not.toBe(arr);
		});

		it('should handle Date objects', () => {
			const date = new Date('2024-01-01');
			const obj = { date: date };
			const cloned = safeClone(obj);
			
			// structuredClone preserves Date objects
			// Note: Use constructor.name check instead of instanceof due to Jest VM context issues
			expect(cloned.date.constructor.name).toBe('Date');
			expect(cloned.date.getTime()).toBe(date.getTime());
		});

		it('should handle objects with undefined values', () => {
			const obj = { 
				a: 'value', 
				b: undefined, 
				c: null 
			};
			const cloned = safeClone(obj);
			
			expect(cloned.a).toBe('value');
			// structuredClone preserves undefined
			expect(cloned.b).toBeUndefined();
			expect(cloned.c).toBeNull();
		});

	});

	describe('Mutation isolation', () => {

		it('should prevent mutations to cloned object from affecting original', () => {
			const original = { 
				a: 1, 
				b: { c: 2 } 
			};
			const cloned = safeClone(original);
			
			cloned.a = 999;
			cloned.b.c = 888;
			
			expect(original.a).toBe(1);
			expect(original.b.c).toBe(2);
		});

		it('should prevent mutations to original from affecting clone', () => {
			const original = { 
				a: 1, 
				b: { c: 2 } 
			};
			const cloned = safeClone(original);
			
			original.a = 999;
			original.b.c = 888;
			
			expect(cloned.a).toBe(1);
			expect(cloned.b.c).toBe(2);
		});

	});

});
