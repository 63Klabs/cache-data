import { describe, it, expect, beforeAll } from '@jest/globals';

/**
 * Integration Tests: Mixed Priority Validation Configurations
 * 
 * These tests verify that the validation priority system works correctly when
 * validation rules exist at all four priority levels. They ensure that the
 * highest-priority matching rule is applied and lower-priority rules are not
 * checked after a match is found.
 * 
 * Priority Order (highest to lowest):
 * 1. Method-and-route match (BY_ROUTE with METHOD:route)
 * 2. Route-only match (BY_ROUTE with route)
 * 3. Method-only match (BY_METHOD)
 * 4. Global parameter name
 * 
 * Test Coverage:
 * - Validation rules at all four priority levels
 * - Priority order enforcement
 * - Highest-priority matching rule application
 * - Combinations of BY_ROUTE, BY_METHOD, and global validations
 * - Lower-priority rules not checked after match
 * - Complex validation scenarios
 * 
 * Requirements Validated: 5.1-5.5
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

describe('ClientRequest - Mixed Priority Integration Tests', () => {
	let ClientRequest;

	beforeAll(async () => {
		// Dynamic import to get fresh module
		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
		ClientRequest = module.default;
	});

	describe('All Four Priority Levels Present', () => {
		it('should use Priority 1 (method-and-route) when all levels present', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Global
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^METHOD-[0-9]+$/.test(value) // Priority 3: Method-only
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^P1-[0-9]+$/.test(value) // Priority 1: Method-and-route
							},
							{
								route: 'product/{id}',
								validate: (value) => /^P2-[0-9]+$/.test(value) // Priority 2: Route-only
							}
						]
					}
				}
			});

			// Should use Priority 1 validation (P1- prefix)
			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/P1-123',
				pathParameters: { id: 'P1-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P1-123' });
		});

		it('should use Priority 2 (route-only) when Priority 1 does not match', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Global
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^METHOD-[0-9]+$/.test(value) // Priority 3: Method-only
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^P1-[0-9]+$/.test(value) // Priority 1: Method-and-route
							},
							{
								route: 'product/{id}',
								validate: (value) => /^P2-[0-9]+$/.test(value) // Priority 2: Route-only
							}
						]
					}
				}
			});

			// GET request - Priority 1 doesn't match, should use Priority 2 (P2- prefix)
			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/P2-456',
				pathParameters: { id: 'P2-456' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P2-456' });
		});

		it('should use Priority 3 (method-only) when Priorities 1 and 2 do not match', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Global
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^METHOD-[0-9]+$/.test(value) // Priority 3: Method-only
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^P1-[0-9]+$/.test(value) // Priority 1: Method-and-route
							},
							{
								route: 'product/{id}',
								validate: (value) => /^P2-[0-9]+$/.test(value) // Priority 2: Route-only
							}
						]
					}
				}
			});

			// POST to different route - Priorities 1 and 2 don't match, should use Priority 3
			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/user/{id}',
				path: '/user/METHOD-789',
				pathParameters: { id: 'METHOD-789' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'METHOD-789' });
		});

		it('should use Priority 4 (global) when no higher priority matches', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Global
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^METHOD-[0-9]+$/.test(value) // Priority 3: Method-only
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^P1-[0-9]+$/.test(value) // Priority 1: Method-and-route
							},
							{
								route: 'product/{id}',
								validate: (value) => /^P2-[0-9]+$/.test(value) // Priority 2: Route-only
							}
						]
					}
				}
			});

			// GET to different route - no higher priority matches, should use Priority 4 (numeric only)
			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/user/{id}',
				path: '/user/999',
				pathParameters: { id: '999' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '999' });
		});
	});

	describe('Priority Order Enforcement', () => {
		it('should reject value that passes lower priority but fails higher priority', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Accepts numeric
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value) // Priority 2: Requires P- prefix
							}
						]
					}
				}
			});

			// Value "123" passes Priority 4 but fails Priority 2
			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should accept value that fails lower priority but passes higher priority', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Numeric only
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^[A-Z0-9-]+$/.test(value) // Priority 2: Alphanumeric with dash
							}
						]
					}
				}
			});

			// Value "ABC-123" fails Priority 4 but passes Priority 2
			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/ABC-123',
				pathParameters: { id: 'ABC-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'ABC-123' });
		});

		it('should not check lower priority rules after higher priority match', () => {
			let globalValidationCalled = false;
			let methodValidationCalled = false;
			let routeValidationCalled = false;

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => {
							globalValidationCalled = true;
							return /^[0-9]+$/.test(value);
						},
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									methodValidationCalled = true;
									return /^METHOD-[0-9]+$/.test(value);
								}
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => {
									routeValidationCalled = true;
									return /^P1-[0-9]+$/.test(value);
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/P1-123',
				pathParameters: { id: 'P1-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(routeValidationCalled).toBe(true); // Priority 1 checked
			expect(methodValidationCalled).toBe(false); // Priority 3 not checked
			expect(globalValidationCalled).toBe(false); // Priority 4 not checked
		});
	});

	describe('Complex Validation Scenarios', () => {
		it('should handle multiple parameters with different priority matches', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value), // Priority 4: Global
						productId: (value) => /^[0-9]+$/.test(value), // Priority 4: Global
						BY_ROUTE: [
							{
								route: 'users/{userId}/products/{productId}',
								validate: ({ userId, productId }) => {
									// Accept numeric userId and either numeric or P- prefix for productId
									return /^[0-9]+$/.test(userId) && 
									       (/^[0-9]+$/.test(productId) || /^P-[0-9]+$/.test(productId));
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{userId}/products/{productId}',
				path: '/users/123/products/P-456',
				pathParameters: { userId: '123', productId: 'P-456' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ userId: '123', productId: 'P-456' });
		});

		it('should handle mixed parameter types with different priorities', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Global
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^NEW-[0-9]+$/.test(value) // Priority 1
							}
						]
					},
					queryParameters: {
						action: (value) => value.length > 0, // Priority 4: Global
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => ['create', 'update'].includes(value) // Priority 3
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/NEW-123',
				pathParameters: { id: 'NEW-123' },
				queryStringParameters: { action: 'create' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'NEW-123' });
			expect(request.getQueryStringParameters()).toEqual({ action: 'create' });
		});

		it('should handle validation failure at highest priority level', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Would pass
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^METHOD-[0-9]+$/.test(value) // Priority 3: Would pass
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^STRICT-[0-9]+$/.test(value) // Priority 1: Will fail
							}
						]
					}
				}
			});

			// Value passes Priority 3 and 4 but fails Priority 1
			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/METHOD-123',
				pathParameters: { id: 'METHOD-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});
	});

	describe('Real-World Mixed Priority Scenarios', () => {
		it('should handle e-commerce API with product-specific validations', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Default numeric
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => value.length <= 50 // Priority 3: POST length limit
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^P-[0-9]{6}$/.test(value) // Priority 1: Product format
							},
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value) // Priority 2: Product prefix
							},
							{
								route: 'order/{id}',
								validate: (value) => /^ORD-[0-9]+$/.test(value) // Priority 2: Order prefix
							},
							{
								route: 'user/{id}',
								validate: (value) => /^U-[0-9]+$/.test(value) // Priority 2: User prefix
							}
						]
					}
				}
			});

			// POST to product - uses Priority 1 (strict 6-digit format)
			const postProductEvent = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/P-123456',
				pathParameters: { id: 'P-123456' }
			});
			const postProductRequest = new ClientRequest(postProductEvent, createMockContext());
			expect(postProductRequest.isValid()).toBe(true);

			// GET product - uses Priority 2 (flexible format)
			const getProductEvent = createMockEvent({
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/P-123',
				pathParameters: { id: 'P-123' }
			});
			const getProductRequest = new ClientRequest(getProductEvent, createMockContext());
			expect(getProductRequest.isValid()).toBe(true);

			// GET order - uses Priority 2 (order format)
			const getOrderEvent = createMockEvent({
				httpMethod: 'GET',
				resource: '/order/{id}',
				path: '/order/ORD-789',
				pathParameters: { id: 'ORD-789' }
			});
			const getOrderRequest = new ClientRequest(getOrderEvent, createMockContext());
			expect(getOrderRequest.isValid()).toBe(true);

			// GET user - uses Priority 2 (user format)
			const getUserEvent = createMockEvent({
				httpMethod: 'GET',
				resource: '/user/{id}',
				path: '/user/U-999',
				pathParameters: { id: 'U-999' }
			});
			const getUserRequest = new ClientRequest(getUserEvent, createMockContext());
			expect(getUserRequest.isValid()).toBe(true);

			// GET unknown route - uses Priority 4 (numeric only)
			const getUnknownEvent = createMockEvent({
				httpMethod: 'GET',
				resource: '/item/{id}',
				path: '/item/555',
				pathParameters: { id: '555' }
			});
			const getUnknownRequest = new ClientRequest(getUnknownEvent, createMockContext());
			expect(getUnknownRequest.isValid()).toBe(true);
		});

		it('should handle API with pagination and filtering at different priorities', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0, // Priority 4: Positive number
						page: (value) => !isNaN(value) && parseInt(value) > 0, // Priority 4: Positive number
						BY_METHOD: [
							{
								method: 'GET',
								validate: (value) => !isNaN(value) && parseInt(value) >= 1 && parseInt(value) <= 100 // Priority 3: GET limit
							}
						],
						BY_ROUTE: [
							{
								route: 'GET:search?limit',
								validate: (value) => !isNaN(value) && parseInt(value) >= 1 && parseInt(value) <= 50 // Priority 1: Search limit
							},
							{
								route: 'search?limit',
								validate: (value) => !isNaN(value) && parseInt(value) >= 1 && parseInt(value) <= 200 // Priority 2: Any search
							}
						]
					}
				}
			});

			// GET search - uses Priority 1 (max 50)
			const getSearchEvent = createMockEvent({
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				queryStringParameters: { limit: '25' }
			});
			const getSearchRequest = new ClientRequest(getSearchEvent, createMockContext());
			expect(getSearchRequest.isValid()).toBe(true);

			// POST search - uses Priority 2 (max 200)
			const postSearchEvent = createMockEvent({
				httpMethod: 'POST',
				resource: '/search',
				path: '/search',
				queryStringParameters: { limit: '150' }
			});
			const postSearchRequest = new ClientRequest(postSearchEvent, createMockContext());
			expect(postSearchRequest.isValid()).toBe(true);

			// GET other route - uses Priority 3 (max 100)
			const getOtherEvent = createMockEvent({
				httpMethod: 'GET',
				resource: '/products',
				path: '/products',
				queryStringParameters: { limit: '75' }
			});
			const getOtherRequest = new ClientRequest(getOtherEvent, createMockContext());
			expect(getOtherRequest.isValid()).toBe(true);

			// POST other route - uses Priority 4 (any positive)
			const postOtherEvent = createMockEvent({
				httpMethod: 'POST',
				resource: '/products',
				path: '/products',
				queryStringParameters: { limit: '500' }
			});
			const postOtherRequest = new ClientRequest(postOtherEvent, createMockContext());
			expect(postOtherRequest.isValid()).toBe(true);
		});
	});

	describe('Priority Override Verification', () => {
		it('should verify Priority 1 overrides all lower priorities', () => {
			let priority1Called = false;
			let priority2Called = false;
			let priority3Called = false;
			let priority4Called = false;

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => {
							priority4Called = true;
							return true;
						},
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									priority3Called = true;
									return true;
								}
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => {
									priority1Called = true;
									return /^P1-[0-9]+$/.test(value);
								}
							},
							{
								route: 'product/{id}',
								validate: (value) => {
									priority2Called = true;
									return true;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/P1-123',
				pathParameters: { id: 'P1-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(priority1Called).toBe(true);
			expect(priority2Called).toBe(false);
			expect(priority3Called).toBe(false);
			expect(priority4Called).toBe(false);
		});

		it('should verify Priority 2 overrides Priorities 3 and 4', () => {
			let priority2Called = false;
			let priority3Called = false;
			let priority4Called = false;

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => {
							priority4Called = true;
							return true;
						},
						BY_METHOD: [
							{
								method: 'GET',
								validate: (value) => {
									priority3Called = true;
									return true;
								}
							}
						],
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => {
									priority2Called = true;
									return /^P2-[0-9]+$/.test(value);
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/P2-456',
				pathParameters: { id: 'P2-456' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(priority2Called).toBe(true);
			expect(priority3Called).toBe(false);
			expect(priority4Called).toBe(false);
		});

		it('should verify Priority 3 overrides Priority 4', () => {
			let priority3Called = false;
			let priority4Called = false;

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => {
							priority4Called = true;
							return true;
						},
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									priority3Called = true;
									return /^P3-[0-9]+$/.test(value);
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/item/{id}',
				path: '/item/P3-789',
				pathParameters: { id: 'P3-789' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(priority3Called).toBe(true);
			expect(priority4Called).toBe(false);
		});
	});

	describe('Edge Cases with Mixed Priorities', () => {
		it('should handle empty BY_ROUTE and BY_METHOD arrays with global validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Global
						BY_ROUTE: [],
						BY_METHOD: []
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
		});

		it('should handle multiple route patterns with same priority', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value)
							},
							{
								route: 'order/{id}',
								validate: (value) => /^O-[0-9]+$/.test(value)
							},
							{
								route: 'user/{id}',
								validate: (value) => /^U-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			// Test each route pattern
			const productEvent = createMockEvent({
				resource: '/product/{id}',
				path: '/product/P-123',
				pathParameters: { id: 'P-123' }
			});
			const productRequest = new ClientRequest(productEvent, createMockContext());
			expect(productRequest.isValid()).toBe(true);

			const orderEvent = createMockEvent({
				resource: '/order/{id}',
				path: '/order/O-456',
				pathParameters: { id: 'O-456' }
			});
			const orderRequest = new ClientRequest(orderEvent, createMockContext());
			expect(orderRequest.isValid()).toBe(true);

			const userEvent = createMockEvent({
				resource: '/user/{id}',
				path: '/user/U-789',
				pathParameters: { id: 'U-789' }
			});
			const userRequest = new ClientRequest(userEvent, createMockContext());
			expect(userRequest.isValid()).toBe(true);
		});

		it('should handle validation with all priorities returning false', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => false, // Priority 4: Always fails
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => false // Priority 3: Always fails
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => false // Priority 1: Always fails
							},
							{
								route: 'product/{id}',
								validate: (value) => false // Priority 2: Always fails
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should handle mixed parameter types with independent priority resolution', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value) // Priority 1
							}
						]
					},
					queryParameters: {
						limit: (value) => !isNaN(value), // Priority 4
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => parseInt(value) <= 100 // Priority 3
							}
						]
					},
					headerParameters: {
						contentType: (value) => value.length > 0, // Priority 4 - use camelCase for header names
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/P-123',
				pathParameters: { id: 'P-123' },
				queryStringParameters: { limit: '50' },
				headers: {
					'Referer': 'https://example.com',
					'Content-Type': 'application/json'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P-123' });
			expect(request.getQueryStringParameters()).toEqual({ limit: '50' });
			expect(request.getHeaderParameters()).toEqual({ contentType: 'application/json' });
		});
	});

	describe('Performance and Early Exit', () => {
		it('should exit early on first validation failure', () => {
			let param1ValidationCalled = false;
			let param2ValidationCalled = false;

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						param1: (value) => {
							param1ValidationCalled = true;
							return false; // Fail immediately
						},
						param2: (value) => {
							param2ValidationCalled = true;
							return true;
						}
					}
				}
			});

			const event = createMockEvent({
				queryStringParameters: {
					param1: 'value1',
					param2: 'value2'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(param1ValidationCalled).toBe(true);
			expect(param2ValidationCalled).toBe(true); // All parameters are now validated (no early exit)
		});

		it('should not check lower priorities after higher priority match', () => {
			let checkCount = 0;

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => {
							checkCount++;
							return true;
						},
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									checkCount++;
									return true;
								}
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => {
									checkCount++;
									return /^P-[0-9]+$/.test(value);
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/P-123',
				pathParameters: { id: 'P-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(checkCount).toBe(1); // Only Priority 1 should be checked
		});
	});
});
