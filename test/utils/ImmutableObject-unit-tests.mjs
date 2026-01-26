import { expect } from 'chai';
import ImmutableObject from '../../src/lib/tools/ImmutableObject.class.js';

/* ****************************************************************************
 * ImmutableObject Unit Tests - Edge Cases
 * Feature: reduce-json-stringify
 */
describe("ImmutableObject - Edge Cases", () => {

	describe("Empty objects", () => {
		it("should handle empty objects", () => {
			const immutable = new ImmutableObject({}, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({});
		});

		it("should return empty object when getting non-existent key", () => {
			const immutable = new ImmutableObject({}, true);
			const result = immutable.get("nonExistent");
			
			expect(result).to.deep.equal({});
		});
	});

	describe("Null values", () => {
		it("should handle null values in objects", () => {
			const obj = { a: null, b: "value" };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({ a: null, b: "value" });
		});

		it("should handle objects with only null values", () => {
			const obj = { a: null, b: null, c: null };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({ a: null, b: null, c: null });
		});

		it("should handle nested null values", () => {
			const obj = { a: { b: null, c: { d: null } } };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({ a: { b: null, c: { d: null } } });
		});
	});

	describe("Circular reference handling", () => {
		it("should handle circular references correctly (structuredClone preserves them)", () => {
			const obj = { a: 1 };
			obj.self = obj;
			
			// structuredClone handles circular references correctly
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			// The result should have the circular reference preserved
			expect(result.a).to.equal(1);
			expect(result.self).to.equal(result);
		});

		it("should handle nested circular references correctly", () => {
			const obj = { a: { b: 1 } };
			obj.a.parent = obj;
			
			// structuredClone handles circular references correctly
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			// The result should have the circular reference preserved
			expect(result.a.b).to.equal(1);
			expect(result.a.parent).to.equal(result);
		});
	});

	describe("Arrays within objects", () => {
		it("should handle arrays within objects", () => {
			const obj = { items: [1, 2, 3], name: "test" };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({ items: [1, 2, 3], name: "test" });
		});

		it("should deep clone arrays within objects", () => {
			const obj = { items: [{ id: 1 }, { id: 2 }] };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			// Modify the result
			result.items[0].id = 999;
			result.items.push({ id: 3 });
			
			// Verify original is unchanged
			const unchanged = immutable.get();
			expect(unchanged.items).to.deep.equal([{ id: 1 }, { id: 2 }]);
		});

		it("should handle nested arrays", () => {
			const obj = { matrix: [[1, 2], [3, 4], [5, 6]] };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({ matrix: [[1, 2], [3, 4], [5, 6]] });
		});

		it("should handle empty arrays", () => {
			const obj = { items: [], name: "test" };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({ items: [], name: "test" });
		});

		it("should handle arrays with mixed types", () => {
			const obj = { items: [1, "two", { three: 3 }, [4, 5], null] };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({ items: [1, "two", { three: 3 }, [4, 5], null] });
		});
	});

	describe("Special cases", () => {
		it("should handle objects with numeric keys", () => {
			const obj = { 1: "one", 2: "two", 3: "three" };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({ 1: "one", 2: "two", 3: "three" });
		});

		it("should handle objects with special characters in keys", () => {
			const obj = { "key-with-dash": 1, "key.with.dot": 2, "key with space": 3 };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({ "key-with-dash": 1, "key.with.dot": 2, "key with space": 3 });
		});

		it("should handle deeply nested objects", () => {
			const obj = { a: { b: { c: { d: { e: { f: "deep" } } } } } };
			const immutable = new ImmutableObject(obj, true);
			const result = immutable.get();
			
			expect(result).to.deep.equal({ a: { b: { c: { d: { e: { f: "deep" } } } } } });
		});
	});
});
