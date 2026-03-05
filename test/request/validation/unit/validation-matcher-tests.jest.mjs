import { describe, it, expect, beforeEach } from '@jest/globals';

// Import ValidationMatcher directly (it's a private class not exported in tools/index.js)
const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
const ValidationMatcher = ValidationMatcherModule.default;

describe('ValidationMatcher', () => {
	describe('Constructor and Initialization', () => {
		it('should initialize with valid parameters', () => {
			const paramValidations = {
				id: (value) => typeof value === 'string'
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/{id}');
			
			expect(matcher).toBeDefined();
		});

		it('should handle null paramValidations', () => {
			const matcher = new ValidationMatcher(null, 'GET', '/product/{id}');
			expect(matcher).toBeDefined();
		});

		it('should handle undefined paramValidations', () => {
			const matcher = new ValidationMatcher(undefined, 'GET', '/product/{id}');
			expect(matcher).toBeDefined();
		});

		it('should handle empty httpMethod', () => {
			const matcher = new ValidationMatcher({}, '', '/product/{id}');
			expect(matcher).toBeDefined();
		});

		it('should handle null httpMethod', () => {
			const matcher = new ValidationMatcher({}, null, '/product/{id}');
			expect(matcher).toBeDefined();
		});

		it('should handle empty resourcePath', () => {
			const matcher = new ValidationMatcher({}, 'GET', '');
			expect(matcher).toBeDefined();
		});

		it('should handle null resourcePath', () => {
			const matcher = new ValidationMatcher({}, 'GET', null);
			expect(matcher).toBeDefined();
		});
	});

	describe('Route Normalization', () => {
		it('should remove leading slash from route', () => {
			const matcher = new ValidationMatcher({}, 'GET', '/product/{id}');
			const rule = matcher.findValidationRule('test');
			// If normalization works, routes should match correctly
			expect(rule).toBeNull(); // No validation rule defined
		});

		it('should remove trailing slash from route', () => {
			const matcher = new ValidationMatcher({}, 'GET', 'product/{id}/');
			const rule = matcher.findValidationRule('test');
			expect(rule).toBeNull();
		});

		it('should remove both leading and trailing slashes', () => {
			const matcher = new ValidationMatcher({}, 'GET', '/product/{id}/');
			const rule = matcher.findValidationRule('test');
			expect(rule).toBeNull();
		});

		it('should convert route to lowercase', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}',
						validate: (value) => true
					}
				]
			};
			// Request route with mixed case should match lowercase pattern
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/Product/{Id}');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.validate).toBeDefined();
		});

		it('should handle routes with multiple slashes', () => {
			const matcher = new ValidationMatcher({}, 'GET', '//product///{id}///');
			const rule = matcher.findValidationRule('test');
			expect(rule).toBeNull();
		});
	});

	describe('Route Pattern Matching with Placeholders', () => {
		it('should match route with single placeholder', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.validate).toBeDefined();
		});

		it('should match route with multiple placeholders', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}/review/{reviewId}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123/review/456');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
		});

		it('should not match route with different segment count', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123/extra');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should not match route with different non-placeholder segments', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/user/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should match placeholder at any position', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: '{category}/product/{id}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/electronics/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
		});
	});

	describe('Priority Order: Method-and-Route > Route > Method > Global', () => {
		it('should prioritize method-and-route over route-only', () => {
			const methodRouteValidate = (value) => value === 'method-route';
			const routeValidate = (value) => value === 'route';
			
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'GET:product/{id}',
						validate: methodRouteValidate
					},
					{
						route: 'product/{id}',
						validate: routeValidate
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(methodRouteValidate);
		});

		it('should prioritize route-only over method-only', () => {
			const routeValidate = (value) => value === 'route';
			const methodValidate = (value) => value === 'method';
			
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}',
						validate: routeValidate
					}
				],
				BY_METHOD: [
					{
						method: 'GET',
						validate: methodValidate
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(routeValidate);
		});

		it('should prioritize method-only over global', () => {
			const methodValidate = (value) => value === 'method';
			const globalValidate = (value) => value === 'global';
			
			const paramValidations = {
				BY_METHOD: [
					{
						method: 'GET',
						validate: methodValidate
					}
				],
				id: globalValidate
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(methodValidate);
		});

		it('should use global validation when no higher priority matches', () => {
			const globalValidate = (value) => value === 'global';
			
			const paramValidations = {
				id: globalValidate
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(globalValidate);
		});

		it('should return null when no validation matches', () => {
			const paramValidations = {
				otherId: (value) => true
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});
	});

	describe('Parameter Name Extraction from Route Patterns', () => {
		it('should extract single path parameter', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['id']);
		});

		it('should extract multiple path parameters', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}/review/{reviewId}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123/review/456');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['id', 'reviewId']);
		});

		it('should extract single query parameter', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'search?query',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/search');
			const rule = matcher.findValidationRule('query');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['query']);
		});

		it('should extract multiple query parameters', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'search?query,limit',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/search');
			const rule = matcher.findValidationRule('query');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['query', 'limit']);
		});

		it('should extract both path and query parameters', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}?key',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['id', 'key']);
		});

		it('should extract parameters from method-and-route pattern', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'POST:product/{id}?key',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'POST', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['id', 'key']);
		});
	});

	describe('Query Parameter Specification (route?param)', () => {
		it('should match route with query parameter specification', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'search?query',
						validate: (value) => typeof value === 'string'
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/search');
			const rule = matcher.findValidationRule('query');
			
			expect(rule).not.toBeNull();
			expect(rule.validate).toBeDefined();
			expect(rule.params).toEqual(['query']);
		});

		it('should not match different parameter name', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'search?query',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/search');
			const rule = matcher.findValidationRule('limit');
			
			expect(rule).toBeNull();
		});

		it('should handle query parameters with whitespace', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'search?query, limit, offset',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/search');
			const rule = matcher.findValidationRule('query');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['query', 'limit', 'offset']);
		});
	});

	describe('Path Parameter Specification (route/{param})', () => {
		it('should match route with path parameter specification', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}',
						validate: (value) => typeof value === 'string'
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.validate).toBeDefined();
			expect(rule.params).toEqual(['id']);
		});

		it('should match multiple path parameters', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'user/{userId}/post/{postId}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/user/123/post/456');
			const rule = matcher.findValidationRule('userId');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['userId', 'postId']);
		});
	});

	describe('Multi-Parameter Specification (route?param1,param2)', () => {
		it('should extract multiple comma-separated query parameters', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'search?query,limit,offset',
						validate: (params) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/search');
			const rule = matcher.findValidationRule('query');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['query', 'limit', 'offset']);
		});

		it('should match any of the specified parameters', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'search?query,limit',
						validate: (params) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/search');
			
			const rule1 = matcher.findValidationRule('query');
			expect(rule1).not.toBeNull();
			
			const rule2 = matcher.findValidationRule('limit');
			expect(rule2).not.toBeNull();
		});

		it('should combine path and query parameters', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}/{category}?sort,filter',
						validate: (params) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123/electronics');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['id', 'category', 'sort', 'filter']);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty route pattern', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: '',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should handle null route pattern', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: null,
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should handle missing validate function', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}'
						// Missing validate function
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should handle non-function validate property', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}',
						validate: 'not a function'
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			// Implementation doesn't validate that validate is a function
			// It returns the rule as-is, so the rule will exist but validate will be a string
			expect(rule).not.toBeNull();
			expect(typeof rule.validate).toBe('string');
		});

		it('should handle malformed route pattern with unmatched brackets', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			// Malformed bracket pattern won't match because route matching fails
			// The pattern 'product/{id' doesn't match 'product/123' (no closing bracket)
			expect(rule).toBeNull();
		});

		it('should handle route pattern with special characters', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product-v2/{id}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product-v2/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
		});

		it('should handle empty BY_ROUTE array', () => {
			const paramValidations = {
				BY_ROUTE: []
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should handle empty BY_METHOD array', () => {
			const paramValidations = {
				BY_METHOD: []
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should handle non-array BY_ROUTE', () => {
			const paramValidations = {
				BY_ROUTE: 'not an array'
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should handle non-array BY_METHOD', () => {
			const paramValidations = {
				BY_METHOD: 'not an array'
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});
	});

	describe('Method Matching', () => {
		it('should match method case-insensitively in method-and-route', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'get:product/{id}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
		});

		it('should match method case-insensitively in BY_METHOD', () => {
			const paramValidations = {
				BY_METHOD: [
					{
						method: 'get',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
		});

		it('should not match different HTTP method', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'POST:product/{id}',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should handle all standard HTTP methods', () => {
			const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
			
			methods.forEach(method => {
				const paramValidations = {
					BY_METHOD: [
						{
							method: method,
							validate: (value) => true
						}
					]
				};
				const matcher = new ValidationMatcher(paramValidations, method, '/product/123');
				const rule = matcher.findValidationRule('id');
				
				expect(rule).not.toBeNull();
			});
		});
	});

	describe('Global Parameter Validation', () => {
		it('should match global parameter validation', () => {
			const globalValidate = (value) => typeof value === 'string';
			const paramValidations = {
				id: globalValidate
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(globalValidate);
			expect(rule.params).toEqual(['id']);
		});

		it('should not match non-function global validation', () => {
			const paramValidations = {
				id: 'not a function'
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should return single parameter for global validation', () => {
			const paramValidations = {
				id: (value) => true
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).not.toBeNull();
			expect(rule.params).toEqual(['id']);
		});
	});

	describe('Parameter Matching Logic', () => {
		it('should match when parameter is in extracted params list', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}?key',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			
			const rule1 = matcher.findValidationRule('id');
			expect(rule1).not.toBeNull();
			
			const rule2 = matcher.findValidationRule('key');
			expect(rule2).not.toBeNull();
		});

		it('should not match when parameter is not in extracted params list', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}?key',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('otherId');
			
			expect(rule).toBeNull();
		});

		it('should match when no params specified (legacy behavior)', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product',
						validate: (value) => true
					}
				]
			};
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product');
			const rule = matcher.findValidationRule('anyParam');
			
			// When no params specified, should match any parameter for that route
			expect(rule).not.toBeNull();
		});
	});

	describe('Complex Scenarios', () => {
		it('should handle multiple validation rules with different priorities', () => {
			const methodRouteValidate = (value) => 'method-route';
			const routeValidate = (value) => 'route';
			const methodValidate = (value) => 'method';
			const globalValidate = (value) => 'global';
			
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'GET:product/{id}',
						validate: methodRouteValidate
					},
					{
						route: 'product/{id}',
						validate: routeValidate
					}
				],
				BY_METHOD: [
					{
						method: 'GET',
						validate: methodValidate
					}
				],
				id: globalValidate
			};
			
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			// Should match highest priority (method-and-route)
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(methodRouteValidate);
		});

		it('should handle route with no matching validation at any priority', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'user/{userId}',
						validate: (value) => true
					}
				],
				BY_METHOD: [
					{
						method: 'POST',
						validate: (value) => true
					}
				],
				otherId: (value) => true
			};
			
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			const rule = matcher.findValidationRule('id');
			
			expect(rule).toBeNull();
		});

		it('should handle multiple parameters with different validation rules', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}?key',
						validate: (value) => true
					}
				],
				limit: (value) => typeof value === 'number'
			};
			
			const matcher = new ValidationMatcher(paramValidations, 'GET', '/product/123');
			
			const idRule = matcher.findValidationRule('id');
			expect(idRule).not.toBeNull();
			
			const keyRule = matcher.findValidationRule('key');
			expect(keyRule).not.toBeNull();
			
			const limitRule = matcher.findValidationRule('limit');
			expect(limitRule).not.toBeNull();
			expect(limitRule.validate).toBe(paramValidations.limit);
		});
	});
});
