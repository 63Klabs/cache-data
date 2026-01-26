import assert from 'assert';
import { safeClone } from '../../src/lib/tools/utils.js';

describe('safeClone', function() {

	describe('Basic cloning', function() {
		
		it('should clone simple objects', function() {
			const obj = { a: 1, b: 2, c: 3 };
			const cloned = safeClone(obj);
			
			assert.deepStrictEqual(cloned, obj);
			assert.notStrictEqual(cloned, obj); // Different reference
		});

		it('should clone nested objects', function() {
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
			
			assert.deepStrictEqual(cloned, obj);
			assert.notStrictEqual(cloned, obj);
			assert.notStrictEqual(cloned.b, obj.b);
			assert.notStrictEqual(cloned.b.d, obj.b.d);
		});

		it('should clone arrays', function() {
			const arr = [1, 2, 3, { a: 4 }];
			const cloned = safeClone(arr);
			
			assert.deepStrictEqual(cloned, arr);
			assert.notStrictEqual(cloned, arr);
			assert.notStrictEqual(cloned[3], arr[3]);
		});

		it('should handle null', function() {
			const result = safeClone(null);
			assert.strictEqual(result, null);
		});

		it('should handle primitives', function() {
			assert.strictEqual(safeClone(42), 42);
			assert.strictEqual(safeClone('test'), 'test');
			assert.strictEqual(safeClone(true), true);
			assert.strictEqual(safeClone(undefined), undefined);
		});

	});

	describe('Promise handling', function() {

		it('should handle objects containing Promises', function() {
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
			assert.strictEqual(cloned.data, 'value');
			assert.strictEqual(cloned.nested.count, 42);
			
			// Promise should be converted to empty object by JSON fallback
			assert.strictEqual(typeof cloned.promise, 'object');
			assert.deepStrictEqual(cloned.promise, {});
		});

		it('should handle resolved Promises', function() {
			const obj = {
				value: 'test',
				resolvedPromise: Promise.resolve({ result: 'data' })
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			assert.strictEqual(cloned.value, 'test');
			// Promise becomes empty object
			assert.deepStrictEqual(cloned.resolvedPromise, {});
		});

		it('should handle rejected Promises', function() {
			const obj = {
				value: 'test',
				rejectedPromise: Promise.reject(new Error('test error'))
			};
			
			// Suppress unhandled rejection warning
			obj.rejectedPromise.catch(() => {});
			
			// Should not throw
			const cloned = safeClone(obj);
			
			assert.strictEqual(cloned.value, 'test');
			// Promise becomes empty object
			assert.deepStrictEqual(cloned.rejectedPromise, {});
		});

		it('should handle pending Promises', function() {
			const obj = {
				value: 'test',
				pendingPromise: new Promise((resolve) => {
					// Never resolves
				})
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			assert.strictEqual(cloned.value, 'test');
			// Promise becomes empty object
			assert.deepStrictEqual(cloned.pendingPromise, {});
		});

		it('should handle arrays containing Promises', function() {
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
			
			assert.strictEqual(cloned[0], 'value1');
			assert.deepStrictEqual(cloned[1], {});
			assert.deepStrictEqual(cloned[2], { data: 'value2' });
			assert.deepStrictEqual(cloned[3], {});
		});

		it('should handle deeply nested Promises', function() {
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
			
			assert.strictEqual(cloned.level1.level2.level3.data, 'value');
			assert.deepStrictEqual(cloned.level1.level2.level3.promise, {});
		});

	});

	describe('Non-cloneable values', function() {

		it('should handle functions by converting to undefined', function() {
			const obj = {
				data: 'value',
				func: function() { return 'test'; }
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			assert.strictEqual(cloned.data, 'value');
			// Functions are removed by JSON.stringify
			assert.strictEqual(cloned.func, undefined);
		});

		it('should handle symbols by removing them', function() {
			const sym = Symbol('test');
			const obj = {
				data: 'value',
				[sym]: 'symbol value'
			};
			
			// Should not throw
			const cloned = safeClone(obj);
			
			assert.strictEqual(cloned.data, 'value');
			// Symbols are removed by JSON.stringify
			assert.strictEqual(cloned[sym], undefined);
		});

		it('should handle mixed non-cloneable values', function() {
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
			
			assert.strictEqual(cloned.string, 'value');
			assert.strictEqual(cloned.number, 42);
			assert.deepStrictEqual(cloned.promise, {});
			assert.strictEqual(cloned.func, undefined);
			assert.strictEqual(cloned.nested.data, 'nested');
			assert.deepStrictEqual(cloned.nested.anotherPromise, {});
		});

	});

	describe('Edge cases', function() {

		it('should handle empty objects', function() {
			const obj = {};
			const cloned = safeClone(obj);
			
			assert.deepStrictEqual(cloned, {});
			assert.notStrictEqual(cloned, obj);
		});

		it('should handle empty arrays', function() {
			const arr = [];
			const cloned = safeClone(arr);
			
			assert.deepStrictEqual(cloned, []);
			assert.notStrictEqual(cloned, arr);
		});

		it('should handle Date objects', function() {
			const date = new Date('2024-01-01');
			const obj = { date: date };
			const cloned = safeClone(obj);
			
			// structuredClone preserves Date objects
			assert.ok(cloned.date instanceof Date);
			assert.strictEqual(cloned.date.getTime(), date.getTime());
		});

		it('should handle objects with undefined values', function() {
			const obj = { 
				a: 'value', 
				b: undefined, 
				c: null 
			};
			const cloned = safeClone(obj);
			
			assert.strictEqual(cloned.a, 'value');
			// structuredClone preserves undefined
			assert.strictEqual(cloned.b, undefined);
			assert.strictEqual(cloned.c, null);
		});

	});

	describe('Mutation isolation', function() {

		it('should prevent mutations to cloned object from affecting original', function() {
			const original = { 
				a: 1, 
				b: { c: 2 } 
			};
			const cloned = safeClone(original);
			
			cloned.a = 999;
			cloned.b.c = 888;
			
			assert.strictEqual(original.a, 1);
			assert.strictEqual(original.b.c, 2);
		});

		it('should prevent mutations to original from affecting clone', function() {
			const original = { 
				a: 1, 
				b: { c: 2 } 
			};
			const cloned = safeClone(original);
			
			original.a = 999;
			original.b.c = 888;
			
			assert.strictEqual(cloned.a, 1);
			assert.strictEqual(cloned.b.c, 2);
		});

	});

});
