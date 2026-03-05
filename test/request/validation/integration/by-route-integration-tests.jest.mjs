import { describe, it, expect, beforeAll } from '@jest/globals';

/**
 * Integration Tests: BY_ROUTE Validation Configurations
 * 
 * These tests verify that route-specific and method-and-route-specific validations
 * work correctly in ClientRequest. They test the priority system where route-specific
 * validations override global validations.
 * 
 * Test Coverage:
 * - Route-only patterns (Priority 2)
 * - Method-and-route patterns (Priority 1)
 * - Route-specific validations overriding global validations
 * - Route pattern matching with placeholders
 * - Parameter specification in route patterns (route?param, route/{param})
 * - Multi-parameter validation with route patterns
 * 
 * Requirements Validated: 2.1-2.5, 4.1-4.5, 13.1-13.6, 14.1-14.5
 */

// Helper function to create mock Lambda context
function createMockContext() {
	return {
		getRemainingTimeInMillis: () => 30000
	};
}

// Helper function to create mock Lambda event with required fields
function createMockEvent(overrides = {}) {
	return {
		httpMethod: 'GET',
		resource: '/test',
		path: '/test',
		pathParameters: {},
		queryStringParameters: {},
		headers: {
			'Referer': 'https://example.com'
		},
		...overrides
	};
}

describe('ClientRequest - BY_ROUTE Integration Tests', () => {
	let ClientRequest;

	beforeAll(async () => {
		// Dynamic import to get fresh module
		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
		ClientRequest = module.default;
	});

	describe('Route-Only Patterns (Priority 2)', () => {
		it('should apply route-specific validation for matching route', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric only
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value) // Route-specific: P- prefix
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/P-123',
				pathParameters: { id: 'P-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P-123' });
		});

		it('should reject value that fails route-specific validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric only
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value) // Route-specific: P- prefix
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/123', // Missing P- prefix
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should fall back to global validation for non-matching route', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric only
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value) // Route-specific: P- prefix
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/employee/{id}',
				path: '/employee/123',
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
		});

		it('should match route patterns with multiple placeholders', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'users/{userId}/posts/{id}',
								validate: (value) => /^POST-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{userId}/posts/{id}',
				path: '/users/123/posts/POST-456',
				pathParameters: { userId: '123', id: 'POST-456' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ userId: '123', id: 'POST-456' });
		});
	});

	describe('Method-And-Route Patterns (Priority 1)', () => {
		it('should apply method-and-route validation for matching method and route', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global
						BY_ROUTE: [
							{
								route: 'POST:game/join/{id}',
								validate: (value) => /^GAME-[0-9]+$/.test(value) // Method-and-route
							},
							{
								route: 'game/join/{id}',
								validate: (value) => /^G-[0-9]+$/.test(value) // Route-only
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/game/join/{id}',
				path: '/game/join/GAME-123',
				pathParameters: { id: 'GAME-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'GAME-123' });
		});

		it('should fall back to route-only validation for different method', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global
						BY_ROUTE: [
							{
								route: 'POST:game/join/{id}',
								validate: (value) => /^GAME-[0-9]+$/.test(value) // Method-and-route
							},
							{
								route: 'game/join/{id}',
								validate: (value) => /^G-[0-9]+$/.test(value) // Route-only
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/game/join/{id}',
				path: '/game/join/G-123',
				pathParameters: { id: 'G-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'G-123' });
		});

		it('should match method case-insensitively', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'post:product/{id}', // Lowercase method
								validate: (value) => /^P-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST', // Uppercase method
				resource: '/product/{id}',
				path: '/product/P-123',
				pathParameters: { id: 'P-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P-123' });
		});
	});

	describe('Route Pattern Matching with Placeholders', () => {
		it('should match route with single placeholder', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'users/{id}',
								validate: (value) => /^U-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{id}',
				path: '/users/U-123',
				pathParameters: { id: 'U-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'U-123' });
		});

		it('should match route with multiple placeholders', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						postId: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'users/{userId}/posts/{postId}',
								validate: (value) => /^POST-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{userId}/posts/{postId}',
				path: '/users/123/posts/POST-456',
				pathParameters: { userId: '123', postId: 'POST-456' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ userId: '123', postId: 'POST-456' });
		});

		it('should normalize routes with leading/trailing slashes', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: '/product/{id}/', // With slashes
								validate: (value) => /^P-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/product/{id}', // Without trailing slash
				path: '/product/P-123',
				pathParameters: { id: 'P-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P-123' });
		});

		it('should match routes case-insensitively', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'Product/{id}', // Mixed case
								validate: (value) => /^P-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/product/{id}', // Lowercase
				path: '/product/P-123',
				pathParameters: { id: 'P-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P-123' });
		});
	});

	describe('Parameter Specification in Route Patterns', () => {
		it('should validate single query parameter specified in route pattern', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						key: (value) => value.length > 0, // Global
						BY_ROUTE: [
							{
								route: 'search?key',
								validate: (value) => /^[A-Z0-9-]+$/.test(value) // Route-specific for 'key'
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/search',
				path: '/search',
				queryStringParameters: { key: 'ABC-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ key: 'ABC-123' });
		});

		it('should validate single path parameter specified in route pattern', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value) // Route-specific for 'id'
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/P-123',
				pathParameters: { id: 'P-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P-123' });
		});

		it('should validate multiple query parameters specified in route pattern', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.length > 0,
						limit: (value) => !isNaN(value),
						BY_ROUTE: [
							{
								route: 'search?query,limit',
								validate: ({ query, limit }) => {
									return query.length > 0 && 
									       !isNaN(limit) && 
									       parseInt(limit) >= 1 && 
									       parseInt(limit) <= 100;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/search',
				path: '/search',
				queryStringParameters: { query: 'test', limit: '10' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ query: 'test', limit: '10' });
		});

		it('should validate multiple path parameters specified in route pattern', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						page: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'users/{id}/{page}',
								validate: ({ id, page }) => {
									return /^[0-9]+$/.test(id) && 
									       /^[0-9]+$/.test(page) &&
									       parseInt(page) >= 1;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{id}/{page}',
				path: '/users/123/2',
				pathParameters: { id: '123', page: '2' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123', page: '2' });
		});
	});

	describe('Multi-Parameter Validation with Route Patterns', () => {
		it('should pass object with all parameters to validation function', () => {
			let receivedParams = null;

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.length > 0,
						limit: (value) => !isNaN(value),
						BY_ROUTE: [
							{
								route: 'search?query,limit',
								validate: (params) => {
									receivedParams = params;
									return params.query.length > 0 && !isNaN(params.limit);
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/search',
				path: '/search',
				queryStringParameters: { query: 'test', limit: '10' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(receivedParams).toEqual({ query: 'test', limit: '10' });
		});

		it('should reject when multi-parameter validation fails', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.length > 0,
						limit: (value) => !isNaN(value),
						BY_ROUTE: [
							{
								route: 'search?query,limit',
								validate: ({ query, limit }) => {
									return query.length > 0 && 
									       !isNaN(limit) && 
									       parseInt(limit) >= 1 && 
									       parseInt(limit) <= 100;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/search',
				path: '/search',
				queryStringParameters: { query: 'test', limit: '200' } // Exceeds max
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
		});

		it('should include undefined parameters in multi-parameter object', () => {
			let receivedParams = null;

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.length > 0,
						BY_ROUTE: [
							{
								route: 'search?query,limit',
								validate: (params) => {
									receivedParams = params;
									return params.query.length > 0;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/search',
				path: '/search',
				queryStringParameters: { query: 'test' } // limit is missing
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(receivedParams).toHaveProperty('query', 'test');
			expect(receivedParams).toHaveProperty('limit', undefined);
		});

		it('should validate mixed path and query parameters together', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'users/{id}?includeProfile',
								validate: ({ id }) => /^[0-9]+$/.test(id) && parseInt(id) > 0
							}
						]
					},
					queryParameters: {
						includeProfile: (value) => value === 'true' || value === 'false',
						BY_ROUTE: [
							{
								route: 'users/{id}?includeProfile',
								validate: (value) => value === 'true' || value === 'false'
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				queryStringParameters: { includeProfile: 'true' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
			expect(request.getQueryStringParameters()).toEqual({ includeProfile: 'true' });
		});
	});

	describe('Priority Override Behavior', () => {
		it('should use route-specific validation instead of global', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric only
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^[A-Z0-9-]+$/.test(value) // Route: alphanumeric with dash
							}
						]
					}
				}
			});

			// This would fail global validation but passes route-specific
			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/ABC-123',
				pathParameters: { id: 'ABC-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'ABC-123' });
		});

		it('should use method-and-route validation instead of route-only', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^NEW-[0-9]+$/.test(value) // Method-and-route
							},
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value) // Route-only
							}
						]
					}
				}
			});

			// Should use POST:product/{id} validation, not product/{id}
			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/NEW-123',
				pathParameters: { id: 'NEW-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'NEW-123' });
		});
	});

	describe('Real-World Scenarios', () => {
		it('should handle product API with different validation per route', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value) // Product IDs
							},
							{
								route: 'employee/{id}',
								validate: (value) => /^E-[0-9]+$/.test(value) // Employee IDs
							},
							{
								route: 'order/{id}',
								validate: (value) => /^ORD-[0-9]+$/.test(value) // Order IDs
							}
						]
					}
				}
			});

			// Test product route
			const productEvent = createMockEvent({
				resource: '/product/{id}',
				path: '/product/P-123',
				pathParameters: { id: 'P-123' }
			});
			const productRequest = new ClientRequest(productEvent, createMockContext());
			expect(productRequest.isValid()).toBe(true);

			// Test employee route
			const employeeEvent = createMockEvent({
				resource: '/employee/{id}',
				path: '/employee/E-456',
				pathParameters: { id: 'E-456' }
			});
			const employeeRequest = new ClientRequest(employeeEvent, createMockContext());
			expect(employeeRequest.isValid()).toBe(true);

			// Test order route
			const orderEvent = createMockEvent({
				resource: '/order/{id}',
				path: '/order/ORD-789',
				pathParameters: { id: 'ORD-789' }
			});
			const orderRequest = new ClientRequest(orderEvent, createMockContext());
			expect(orderRequest.isValid()).toBe(true);
		});

		it('should handle search API with pagination validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.length > 0,
						page: (value) => !isNaN(value),
						limit: (value) => !isNaN(value),
						BY_ROUTE: [
							{
								route: 'search?query,page,limit',
								validate: ({ query, page, limit }) => {
									if (!query || query.length === 0) return false;
									const pageNum = parseInt(page || '1');
									const limitNum = parseInt(limit || '10');
									return pageNum >= 1 && limitNum >= 1 && limitNum <= 100;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/search',
				path: '/search',
				queryStringParameters: { 
					query: 'test', 
					page: '2', 
					limit: '25' 
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ 
				query: 'test', 
				page: '2', 
				limit: '25' 
			});
		});

		it('should handle game API with method-specific validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'POST:game/join/{id}',
								validate: (value) => /^GAME-[0-9]+$/.test(value) && parseInt(value.split('-')[1]) > 0
							},
							{
								route: 'GET:game/join/{id}',
								validate: (value) => /^[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			// POST requires GAME- prefix
			const postEvent = createMockEvent({
				httpMethod: 'POST',
				resource: '/game/join/{id}',
				path: '/game/join/GAME-123',
				pathParameters: { id: 'GAME-123' }
			});
			const postRequest = new ClientRequest(postEvent, createMockContext());
			expect(postRequest.isValid()).toBe(true);

			// GET accepts plain numeric
			const getEvent = createMockEvent({
				httpMethod: 'GET',
				resource: '/game/join/{id}',
				path: '/game/join/123',
				pathParameters: { id: '123' }
			});
			const getRequest = new ClientRequest(getEvent, createMockContext());
			expect(getRequest.isValid()).toBe(true);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty BY_ROUTE array', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: []
					}
				}
			});

			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
		});

		it('should handle route pattern with no placeholders', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						key: (value) => value.length > 0,
						BY_ROUTE: [
							{
								route: 'api/status',
								validate: (value) => /^[A-Z0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/api/status',
				path: '/api/status',
				queryStringParameters: { key: 'ABC123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ key: 'ABC123' });
		});

		it('should handle validation function that returns truthy/falsy values', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => value // Returns the value itself (truthy)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
		});
	});
});
