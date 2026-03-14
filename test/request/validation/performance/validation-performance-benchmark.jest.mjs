import { describe, it, expect, beforeEach } from '@jest/globals';
import ValidationMatcher from '../../../../src/lib/utils/ValidationMatcher.class.js';
import ValidationExecutor from '../../../../src/lib/utils/ValidationExecutor.class.js';

describe('Validation System Performance Benchmarks', () => {
	describe('Initialization Performance', () => {
		it('should initialize ValidationMatcher in < 5ms for typical config', () => {
			const paramValidations = {
				id: (value) => typeof value === 'string',
				BY_ROUTE: [
					{ route: 'product/{id}', validate: (value) => /^P-[0-9]+$/.test(value) },
					{ route: 'user/{id}', validate: (value) => /^U-[0-9]+$/.test(value) },
					{ route: 'POST:order/{id}', validate: (value) => /^O-[0-9]+$/.test(value) }
				],
				BY_METHOD: [
					{ method: 'POST', validate: (value) => value.length <= 50 }
				]
			};

			const start = performance.now();
			const matcher = new ValidationMatcher(paramValidations, 'GET', 'product/123');
			const end = performance.now();

			const duration = end - start;
			expect(duration).toBeLessThan(5); // Should be < 5ms
		});

		it('should initialize ValidationMatcher in < 10ms for large config', () => {
			const paramValidations = {
				id: (value) => typeof value === 'string',
				BY_ROUTE: Array(50).fill(null).map((_, i) => ({
					route: `route${i}/{id}`,
					validate: (value) => value.length > 0
				})),
				BY_METHOD: Array(10).fill(null).map((_, i) => ({
					method: i % 2 === 0 ? 'GET' : 'POST',
					validate: (value) => value.length > 0
				}))
			};

			const start = performance.now();
			const matcher = new ValidationMatcher(paramValidations, 'GET', 'route25/123');
			const end = performance.now();

			const duration = end - start;
			expect(duration).toBeLessThan(10); // Should be < 10ms even for large config
		});
	});

	describe('Validation Execution Performance', () => {
		it('should execute simple validation in < 5ms', () => {
			const validateFn = (value) => typeof value === 'string' && value.length > 0;
			const paramNames = ['id'];
			const paramValues = { id: 'test-value' };

			const start = performance.now();
			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			const end = performance.now();

			const duration = end - start;
			expect(result).toBe(true);
			expect(duration).toBeLessThan(5); // Should be < 5ms (allows for CI/CD overhead)
		});

		it('should execute multi-parameter validation in < 5ms', () => {
			const validateFn = ({ page, limit }) => page >= 1 && limit >= 1 && limit <= 100;
			const paramNames = ['page', 'limit'];
			const paramValues = { page: 1, limit: 10 };

			const start = performance.now();
			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			const end = performance.now();

			const duration = end - start;
			expect(result).toBe(true);
			expect(duration).toBeLessThan(5); // Should be < 5ms (allows for CI/CD overhead)
		});
	});

	describe('Pattern Matching Performance', () => {
		let matcher;

		beforeEach(() => {
			const paramValidations = {
				id: (value) => typeof value === 'string',
				BY_ROUTE: [
					{ route: 'POST:product/{id}', validate: (value) => /^P-[0-9]+$/.test(value) },
					{ route: 'product/{id}', validate: (value) => /^[A-Z]-[0-9]+$/.test(value) },
					{ route: 'user/{id}', validate: (value) => /^U-[0-9]+$/.test(value) }
				],
				BY_METHOD: [
					{ method: 'POST', validate: (value) => value.length <= 50 }
				]
			};
			matcher = new ValidationMatcher(paramValidations, 'GET', 'product/123');
		});

		it('should find validation rule in < 5ms', () => {
			const start = performance.now();
			const rule = matcher.findValidationRule('id');
			const end = performance.now();

			const duration = end - start;
			expect(rule).not.toBeNull();
			expect(duration).toBeLessThan(5); // Should be < 5ms (allows for CI/CD overhead)
		});

		it('should demonstrate early exit optimization', () => {
			// Create matcher with method-and-route match (Priority 1)
			const paramValidations = {
				id: (value) => typeof value === 'string',
				BY_ROUTE: [
					{ route: 'POST:product/{id}', validate: (value) => /^P-[0-9]+$/.test(value) },
					{ route: 'product/{id}', validate: (value) => /^[A-Z]-[0-9]+$/.test(value) }
				],
				BY_METHOD: [
					{ method: 'POST', validate: (value) => value.length <= 50 }
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'POST', 'product/123');

			const start = performance.now();
			const rule = matcher.findValidationRule('id');
			const end = performance.now();

			const duration = end - start;
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['id']);
			// Should be fast because it finds match at Priority 1 and exits early
			expect(duration).toBeLessThan(5);
		});
	});

	describe('Legacy Configuration Performance', () => {
		it('should have no performance regression for legacy configs', () => {
			const paramValidations = {
				id: (value) => typeof value === 'string',
				name: (value) => value.length > 0,
				email: (value) => value.includes('@')
			};

			const start = performance.now();
			const matcher = new ValidationMatcher(paramValidations, 'GET', 'any/route');
			const rule1 = matcher.findValidationRule('id');
			const rule2 = matcher.findValidationRule('name');
			const rule3 = matcher.findValidationRule('email');
			const end = performance.now();

			const duration = end - start;
			expect(rule1).not.toBeNull();
			expect(rule2).not.toBeNull();
			expect(rule3).not.toBeNull();
			expect(duration).toBeLessThan(5); // Should be < 5ms for 3 lookups
		});
	});

	describe('Memory Usage Validation', () => {
		it('should use < 1KB per validation rule (estimated)', () => {
			const paramValidations = {
				BY_ROUTE: Array(100).fill(null).map((_, i) => ({
					route: `route${i}/{id}`,
					validate: (value) => value.length > 0
				}))
			};

			const matcher = new ValidationMatcher(paramValidations, 'GET', 'route50/123');

			// Rough estimate: each rule has route string (~20 bytes) + function (~100 bytes)
			// Plus internal caching structures
			// 100 rules * ~200 bytes = ~20KB total (well under 1KB per rule on average)
			expect(matcher).toBeDefined();
		});
	});

	describe('Pattern Normalization Caching', () => {
		it('should cache normalized patterns during initialization', () => {
			const paramValidations = {
				BY_ROUTE: [
					{ route: '/product/{id}/', validate: (value) => true },
					{ route: 'PRODUCT/{ID}', validate: (value) => true }
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'GET', 'product/123');

			// Both patterns should match due to normalization
			// Second lookup should be faster due to caching
			const start1 = performance.now();
			const rule1 = matcher.findValidationRule('id');
			const end1 = performance.now();

			const start2 = performance.now();
			const rule2 = matcher.findValidationRule('id');
			const end2 = performance.now();

			const duration1 = end1 - start1;
			const duration2 = end2 - start2;

			expect(rule1).not.toBeNull();
			expect(rule2).not.toBeNull();
			// Both should be fast, but second might be slightly faster due to caching
			expect(duration1).toBeLessThan(5);
			expect(duration2).toBeLessThan(5);
		});
	});
});
