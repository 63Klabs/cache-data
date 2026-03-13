import { describe, it, expect, jest, afterEach } from '@jest/globals';
import ImmutableObject from '../../src/lib/tools/ImmutableObject.class.js';

/**
 * ImmutableObject Unit Tests - Jest Migration
 * 
 * Tests the ImmutableObject class which provides defensive copying
 * to prevent reference mutation.
 * 
 * Feature: 1-3-10-test-migration-phase-5
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7
 */
describe('ImmutableObject - Unit Tests', () => {
	afterEach(() => {
		// Clean up any mocks
		jest.restoreAllMocks();
	});

	describe('get() method', () => {
		it('should return a copy not a reference', () => {
			const obj = { a: 1, b: { c: 2 } };
			const immutable = new ImmutableObject(obj, true);
			const copy = immutable.get();
			
			// Modify the copy
			copy.a = 999;
			copy.b.c = 999;
			
			// Verify original is unchanged
			const unchanged = immutable.get();
			expect(unchanged.a).toBe(1);
			expect(unchanged.b.c).toBe(2);
		});

		it('should return a deep copy for nested objects', () => {
			const obj = { 
				level1: { 
					level2: { 
						level3: { 
							value: 'deep' 
						} 
					} 
				} 
			};
			const immutable = new ImmutableObject(obj, true);
			const copy = immutable.get();
			
			// Modify deep nested value
			copy.level1.level2.level3.value = 'modified';
			
			// Verify original is unchanged
			const unchanged = immutable.get();
			expect(unchanged.level1.level2.level3.value).toBe('deep');
		});

		it('should return different object instances on each call', () => {
			const obj = { a: 1, b: 2 };
			const immutable = new ImmutableObject(obj, true);
			
			const copy1 = immutable.get();
			const copy2 = immutable.get();
			
			// Should be equal in value but not the same reference
			expect(copy1).toEqual(copy2);
			expect(copy1).not.toBe(copy2);
		});
	});

	describe('get(key) method', () => {
		it('should return copy of nested value by key', () => {
			const obj = { 
				user: { name: 'John', age: 30 },
				settings: { theme: 'dark' }
			};
			const immutable = new ImmutableObject(obj, true);
			
			const userCopy = immutable.get('user');
			
			// Modify the copy
			userCopy.name = 'Jane';
			userCopy.age = 25;
			
			// Verify original is unchanged
			const unchanged = immutable.get('user');
			expect(unchanged.name).toBe('John');
			expect(unchanged.age).toBe(30);
		});

		it('should return copy of primitive value by key', () => {
			const obj = { count: 42, name: 'test' };
			const immutable = new ImmutableObject(obj, true);
			
			const count = immutable.get('count');
			const name = immutable.get('name');
			
			expect(count).toBe(42);
			expect(name).toBe('test');
		});

		it('should return copy of array by key', () => {
			const obj = { items: [1, 2, 3] };
			const immutable = new ImmutableObject(obj, true);
			
			const itemsCopy = immutable.get('items');
			
			// Modify the copy
			itemsCopy.push(4);
			itemsCopy[0] = 999;
			
			// Verify original is unchanged
			const unchanged = immutable.get('items');
			expect(unchanged).toEqual([1, 2, 3]);
		});

		it('should return whole object when key does not exist', () => {
			const obj = { a: 1, b: 2 };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get('nonExistent');
			
			// Should return the whole object when key doesn't exist
			expect(result).toEqual(obj);
		});
	});

	describe('finalize() method', () => {
		it('should lock the object preventing further changes', () => {
			const obj = { a: 1 };
			const immutable = new ImmutableObject(obj);
			
			// Not locked yet
			expect(immutable.locked).toBe(false);
			
			// Finalize
			immutable.finalize();
			
			// Now locked
			expect(immutable.locked).toBe(true);
		});

		it('should not allow finalize to change object after first finalize', () => {
			const obj = { a: 1 };
			const immutable = new ImmutableObject(obj);
			
			immutable.finalize();
			
			// Try to finalize again with different object
			immutable.finalize({ a: 999 });
			
			// Should still have original value
			const result = immutable.get();
			expect(result.a).toBe(1);
		});

		it('should accept object parameter on first finalize', () => {
			const immutable = new ImmutableObject();
			
			immutable.finalize({ a: 1, b: 2 });
			
			const result = immutable.get();
			expect(result).toEqual({ a: 1, b: 2 });
		});

		it('should break all references when finalizing', () => {
			const original = { a: { b: { c: 1 } } };
			const immutable = new ImmutableObject(original);
			
			immutable.finalize();
			
			// Modify original after finalize
			original.a.b.c = 999;
			
			// Immutable should be unchanged
			const result = immutable.get();
			expect(result.a.b.c).toBe(1);
		});
	});

	describe('lock() method', () => {
		it('should lock the object', () => {
			const obj = { a: 1 };
			const immutable = new ImmutableObject(obj);
			
			expect(immutable.locked).toBe(false);
			
			immutable.lock();
			
			expect(immutable.locked).toBe(true);
		});

		it('should not lock twice', () => {
			const obj = { a: 1 };
			const immutable = new ImmutableObject(obj);
			
			immutable.lock();
			const firstLockState = immutable.locked;
			
			immutable.lock();
			const secondLockState = immutable.locked;
			
			expect(firstLockState).toBe(true);
			expect(secondLockState).toBe(true);
		});
	});

	describe('toObject() method', () => {
		it('should return complete copy of internal data', () => {
			const obj = { a: 1, b: { c: 2 }, d: [3, 4, 5] };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.toObject();
			
			expect(result).toEqual(obj);
		});

		it('should return a copy not a reference', () => {
			const obj = { a: 1, b: 2 };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.toObject();
			
			// Modify result
			result.a = 999;
			
			// Verify original is unchanged
			const unchanged = immutable.toObject();
			expect(unchanged.a).toBe(1);
		});
	});

	describe('null and undefined handling', () => {
		it('should handle null values in objects', () => {
			const obj = { a: null, b: 'value' };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({ a: null, b: 'value' });
		});

		it('should handle objects with only null values', () => {
			const obj = { a: null, b: null, c: null };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({ a: null, b: null, c: null });
		});

		it('should handle nested null values', () => {
			const obj = { a: { b: null, c: { d: null } } };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({ a: { b: null, c: { d: null } } });
		});

		it('should handle undefined constructor parameter', () => {
			const immutable = new ImmutableObject();
			
			const result = immutable.get();
			
			expect(result).toBeNull();
		});

		it('should handle null constructor parameter', () => {
			const immutable = new ImmutableObject(null);
			
			const result = immutable.get();
			
			expect(result).toBeNull();
		});
	});

	describe('empty objects and arrays', () => {
		it('should handle empty objects', () => {
			const immutable = new ImmutableObject({}, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({});
		});

		it('should return empty object when getting non-existent key', () => {
			const immutable = new ImmutableObject({}, true);
			
			const result = immutable.get('nonExistent');
			
			expect(result).toEqual({});
		});

		it('should handle empty arrays', () => {
			const obj = { items: [], name: 'test' };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({ items: [], name: 'test' });
		});

		it('should handle arrays with mixed types', () => {
			const obj = { items: [1, 'two', { three: 3 }, [4, 5], null] };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({ items: [1, 'two', { three: 3 }, [4, 5], null] });
		});
	});

	describe('arrays within objects', () => {
		it('should handle arrays within objects', () => {
			const obj = { items: [1, 2, 3], name: 'test' };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({ items: [1, 2, 3], name: 'test' });
		});

		it('should deep clone arrays within objects', () => {
			const obj = { items: [{ id: 1 }, { id: 2 }] };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			// Modify the result
			result.items[0].id = 999;
			result.items.push({ id: 3 });
			
			// Verify original is unchanged
			const unchanged = immutable.get();
			expect(unchanged.items).toEqual([{ id: 1 }, { id: 2 }]);
		});

		it('should handle nested arrays', () => {
			const obj = { matrix: [[1, 2], [3, 4], [5, 6]] };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({ matrix: [[1, 2], [3, 4], [5, 6]] });
		});

		it('should break references in nested arrays', () => {
			const obj = { matrix: [[1, 2], [3, 4]] };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			// Modify nested array
			result.matrix[0][0] = 999;
			result.matrix.push([7, 8]);
			
			// Verify original is unchanged
			const unchanged = immutable.get();
			expect(unchanged.matrix).toEqual([[1, 2], [3, 4]]);
		});
	});

	describe('special cases', () => {
		it('should handle objects with numeric keys', () => {
			const obj = { 1: 'one', 2: 'two', 3: 'three' };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({ 1: 'one', 2: 'two', 3: 'three' });
		});

		it('should handle objects with special characters in keys', () => {
			const obj = { 'key-with-dash': 1, 'key.with.dot': 2, 'key with space': 3 };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({ 'key-with-dash': 1, 'key.with.dot': 2, 'key with space': 3 });
		});

		it('should handle deeply nested objects', () => {
			const obj = { a: { b: { c: { d: { e: { f: 'deep' } } } } } };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual({ a: { b: { c: { d: { e: { f: 'deep' } } } } } });
		});

		it('should handle circular references correctly', () => {
			const obj = { a: 1 };
			obj.self = obj;
			
			// structuredClone handles circular references correctly
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			// The result should have the circular reference preserved
			expect(result.a).toBe(1);
			expect(result.self).toBe(result);
		});

		it('should handle nested circular references correctly', () => {
			const obj = { a: { b: 1 } };
			obj.a.parent = obj;
			
			// structuredClone handles circular references correctly
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			// The result should have the circular reference preserved
			expect(result.a.b).toBe(1);
			expect(result.a.parent).toBe(result);
		});
	});

	describe('constructor behavior', () => {
		it('should not finalize by default', () => {
			const obj = { a: 1 };
			const immutable = new ImmutableObject(obj);
			
			expect(immutable.locked).toBe(false);
		});

		it('should finalize when second parameter is true', () => {
			const obj = { a: 1 };
			const immutable = new ImmutableObject(obj, true);
			
			expect(immutable.locked).toBe(true);
		});

		it('should store object correctly', () => {
			const obj = { a: 1, b: 2 };
			const immutable = new ImmutableObject(obj, true);
			
			const result = immutable.get();
			
			expect(result).toEqual(obj);
		});
	});
});
