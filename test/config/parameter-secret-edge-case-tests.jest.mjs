/**
 * Jest edge case tests for CachedParametersSecrets classes
 * Tests error conditions, boundary conditions, and edge cases
 * 
 * Tests cover:
 * - Error conditions (invalid inputs, null values, undefined values)
 * - Boundary conditions (empty strings, zero values)
 * - Edge cases that can be tested without AWS infrastructure
 */

import { describe, it, expect } from '@jest/globals';
import { CachedParameterSecrets, CachedSecret, CachedSsmParameter } from '../../src/lib/tools/index.js';

describe("CachedParametersSecrets Edge Case Tests", () => {

	describe("Error Conditions - Invalid Inputs", () => {
		
		it("should handle null name in CachedSecret constructor", () => {
			// Implementation accepts null and handles gracefully
			expect(() => new CachedSecret(null)).not.toThrow();
			const secret = new CachedSecret(null);
			expect(secret.getName()).toBe(null);
		});

		it("should handle undefined name in CachedSecret constructor", () => {
			// Implementation accepts undefined and handles gracefully
			expect(() => new CachedSecret(undefined)).not.toThrow();
			const secret = new CachedSecret(undefined);
			expect(secret.getName()).toBe(undefined);
		});

		it("should handle empty string name in CachedSecret constructor", () => {
			// Implementation accepts empty string and handles gracefully
			expect(() => new CachedSecret("")).not.toThrow();
			const secret = new CachedSecret("");
			expect(secret.getName()).toBe("");
		});

		it("should handle null name in CachedSsmParameter constructor", () => {
			// Implementation accepts null and handles gracefully
			expect(() => new CachedSsmParameter(null)).not.toThrow();
			const param = new CachedSsmParameter(null);
			expect(param.getName()).toBe(null);
		});

		it("should handle undefined name in CachedSsmParameter constructor", () => {
			// Implementation accepts undefined and handles gracefully
			expect(() => new CachedSsmParameter(undefined)).not.toThrow();
			const param = new CachedSsmParameter(undefined);
			expect(param.getName()).toBe(undefined);
		});


		it("should handle empty string name in CachedSsmParameter constructor", () => {
			// Implementation accepts empty string and handles gracefully
			expect(() => new CachedSsmParameter("")).not.toThrow();
			const param = new CachedSsmParameter("");
			expect(param.getName()).toBe("");
		});

		it("should handle invalid options type in constructor", () => {
			// Options should be an object, but implementation handles gracefully
			expect(() => new CachedSecret("test-secret", "invalid-options")).not.toThrow();
		});

		it("should handle null options in constructor", () => {
			expect(() => new CachedSecret("test-secret-null-opts", null)).not.toThrow();
		});

	});

	describe("Boundary Conditions", () => {

		it("should handle zero refreshAfter value", () => {
			const secret = new CachedSecret("test-zero-refresh", { refreshAfter: 0 });
			expect(secret.toObject().cache.refreshAfter).toBe(0);
		});

		it("should handle negative refreshAfter value", () => {
			const secret = new CachedSecret("test-negative-refresh", { refreshAfter: -100 });
			// Should accept negative value
			expect(secret.toObject().cache.refreshAfter).toBe(-100);
		});

		it("should handle very large refreshAfter value", () => {
			const secret = new CachedSecret("test-large-refresh", { refreshAfter: Number.MAX_SAFE_INTEGER });
			expect(secret.toObject().cache.refreshAfter).toBe(Number.MAX_SAFE_INTEGER);
		});

		it("should handle getting non-existent parameter", () => {
			const result = CachedParameterSecrets.get("non-existent-parameter-xyz");
			expect(result).toBeUndefined();
		});

		it("should handle empty parameter collection", () => {
			const names = CachedParameterSecrets.getNames();
			expect(Array.isArray(names)).toBe(true);
			expect(names.length).toBeGreaterThanOrEqual(0);
		});

	});

	describe("Type Validation", () => {

		it("should handle non-string name types gracefully", () => {
			// Numbers are converted to strings or handled gracefully
			expect(() => new CachedSecret(123)).not.toThrow();
			const secret = new CachedSecret(123);
			expect(secret.getName()).toBe(123);
		});

		it("should handle object as name", () => {
			// Objects are handled gracefully
			expect(() => new CachedSecret({ name: 'test' })).not.toThrow();
		});

		it("should handle array as name", () => {
			// Arrays are handled gracefully
			expect(() => new CachedSecret(['test'])).not.toThrow();
		});

	});

	describe("State and Method Behavior", () => {

		it("should handle sync_getValue() when value is not yet loaded", () => {
			const secret = new CachedSecret("test-sync-unloaded", { refreshAfter: 500 });
			
			// sync_getValue throws error if not loaded
			expect(() => secret.sync_getValue()).toThrow('CachedParameterSecret Error');
		});

		it("should handle toObject() method", () => {
			const secret = new CachedSecret("test-to-object", { refreshAfter: 300 });
			const obj = secret.toObject();
			
			expect(obj).toHaveProperty('name');
			expect(obj).toHaveProperty('cache');
			expect(obj.name).toBe("test-to-object");
			expect(obj.cache.refreshAfter).toBe(300);
		});

		it("should handle toJSON() method when value not loaded", () => {
			const secret = new CachedSecret("test-to-json", { refreshAfter: 400 });
			
			// toJSON() calls sync_getValue() which throws if not loaded
			expect(() => secret.toJSON()).toThrow('CachedParameterSecret Error');
		});

		it("should handle getNameTag() method", () => {
			const secret = new CachedSecret("test-name-tag", { refreshAfter: 500 });
			const nameTag = secret.getNameTag();
			
			expect(nameTag).toContain("test-name-tag");
			expect(nameTag).toContain("CachedSecret");
		});

		it("should handle isRefreshing() method", () => {
			const secret = new CachedSecret("test-is-refreshing", { refreshAfter: 500 });
			const isRefreshing = secret.isRefreshing();
			
			expect(typeof isRefreshing).toBe('boolean');
		});

		it("should handle needsRefresh() method", () => {
			const secret = new CachedSecret("test-needs-refresh", { refreshAfter: 500 });
			const needsRefresh = secret.needsRefresh();
			
			expect(typeof needsRefresh).toBe('boolean');
		});

		it("should handle isValid() method", () => {
			const secret = new CachedSecret("test-is-valid", { refreshAfter: 500 });
			const isValid = secret.isValid();
			
			expect(typeof isValid).toBe('boolean');
		});

	});

	describe("CachedParameterSecrets Container Methods", () => {

		it("should handle toArray() method", () => {
			const arr = CachedParameterSecrets.toArray();
			expect(Array.isArray(arr)).toBe(true);
		});

		it("should handle toObject() method", () => {
			const obj = CachedParameterSecrets.toObject();
			expect(obj).toHaveProperty('objects');
			expect(Array.isArray(obj.objects)).toBe(true);
		});

		it("should handle toJSON() method", () => {
			const json = CachedParameterSecrets.toJSON();
			expect(typeof json).toBe('string');
			const parsed = JSON.parse(json);
			expect(parsed).toHaveProperty('objects');
		});

		it("should handle getNameTags() method", () => {
			const nameTags = CachedParameterSecrets.getNameTags();
			expect(Array.isArray(nameTags)).toBe(true);
		});

		it("should handle getNames() method", () => {
			const names = CachedParameterSecrets.getNames();
			expect(Array.isArray(names)).toBe(true);
		});

	});

});
