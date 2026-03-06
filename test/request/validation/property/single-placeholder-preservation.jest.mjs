import { describe, it, expect, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import ClientRequest to test the full validation flow
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

/**
 * PRESERVATION TEST FOR SINGLE-PLACEHOLDER ROUTES
 * 
 * CRITICAL: This test MUST PASS on unfixed code - it confirms baseline behavior to preserve.
 * 
 * GOAL: Verify that single-placeholder routes work correctly on unfixed code.
 * This establishes the baseline behavior that must be preserved after bug fixes.
 * 
 * EXPECTED OUTCOME: Test PASSES (confirms baseline behavior to preserve)
 * 
 * Property 2: Preservation - Single Placeholder Route Matching Unchanged
 * 
 * For all single-placeholder routes (e.g., product/{id}), matching and validation
 * work correctly. This behavior must be preserved after fixing multi-placeholder bugs.
 */
describe('Preservation: Single Placeholder Route Matching', () => {
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});

	describe('Unit Tests: Known Single-Placeholder Patterns', () => {
		it('should match route pattern product/{id} with request path /product/123', () => {
			// Initialize ClientRequest with validation for single-placeholder route
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			// Create mock API Gateway event with matching path
			const event = {
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: {
					id: '123'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			// Create ClientRequest instance
			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true for valid single-placeholder route
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Path parameters should be extracted
			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				id: '123'
			});
		});

		it('should match route pattern users/{userId} with request path /users/abc123', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'users/{userId}',
								validate: (value) => /^[a-zA-Z0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/users/{userId}',
				path: '/users/abc123',
				pathParameters: {
					userId: 'abc123'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				userId: 'abc123'
			});
		});

		it('should match route pattern api/v1/{resource} with request path /api/v1/products', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'api/v1/{resource}',
								validate: (value) => typeof value === 'string' && value.length > 0
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/v1/{resource}',
				path: '/api/v1/products',
				pathParameters: {
					resource: 'products'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				resource: 'products'
			});
		});

		it('should return isValid()===false when validation fails for single placeholder', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/abc', // Non-numeric value
				pathParameters: {
					id: 'abc'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return false because validation fails
			expect(clientRequest.isValid()).toBe(false);

			// EXPECTED: Path parameters should be empty when validation fails
			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({});
		});
	});

	describe('Property-Based Tests: Single-Placeholder Routes', () => {
		it('Property: Single-placeholder routes with numeric IDs match correctly', () => {
			fc.assert(
				fc.property(
					// Generate route prefix (e.g., 'product', 'user', 'item')
					fc.constantFrom('product', 'user', 'item', 'order', 'post'),
					// Generate numeric ID
					fc.integer({ min: 1, max: 999999 }),
					(routePrefix, numericId) => {
						const idString = numericId.toString();
						
						// Initialize with single-placeholder route validation
						ClientRequest.init({
							parameters: {
								pathParameters: {
									BY_ROUTE: [
										{
											route: `${routePrefix}/{id}`,
											validate: (value) => /^[0-9]+$/.test(value)
										}
									]
								}
							}
						});

						const event = {
							httpMethod: 'GET',
							resource: `/${routePrefix}/{id}`,
							path: `/${routePrefix}/${idString}`,
							pathParameters: {
								id: idString
							},
							queryStringParameters: {},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Single-placeholder routes should match and validate correctly
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getPathParameters()).toEqual({
							id: idString
						});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Single-placeholder routes with alphanumeric IDs match correctly', () => {
			fc.assert(
				fc.property(
					// Generate route prefix
					fc.constantFrom('product', 'user', 'resource', 'entity'),
					// Generate alphanumeric ID
					fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
					(routePrefix, alphanumericId) => {
						// Skip empty strings (shouldn't happen with regex, but safety check)
						fc.pre(alphanumericId.length > 0);
						
						// Initialize with single-placeholder route validation
						ClientRequest.init({
							parameters: {
								pathParameters: {
									BY_ROUTE: [
										{
											route: `${routePrefix}/{id}`,
											validate: (value) => /^[a-zA-Z0-9]+$/.test(value)
										}
									]
								}
							}
						});

						const event = {
							httpMethod: 'GET',
							resource: `/${routePrefix}/{id}`,
							path: `/${routePrefix}/${alphanumericId}`,
							pathParameters: {
								id: alphanumericId
							},
							queryStringParameters: {},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Single-placeholder routes should match and validate correctly
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getPathParameters()).toEqual({
							id: alphanumericId
						});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Single-placeholder routes with nested paths match correctly', () => {
			fc.assert(
				fc.property(
					// Generate path segments
					fc.constantFrom('api', 'v1', 'v2', 'admin'),
					fc.constantFrom('users', 'products', 'orders', 'items'),
					// Generate ID
					fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/),
					(segment1, segment2, id) => {
						fc.pre(id.length > 0);
						
						// Initialize with nested single-placeholder route validation
						ClientRequest.init({
							parameters: {
								pathParameters: {
									BY_ROUTE: [
										{
											route: `${segment1}/${segment2}/{id}`,
											validate: (value) => /^[a-zA-Z0-9]+$/.test(value)
										}
									]
								}
							}
						});

						const event = {
							httpMethod: 'GET',
							resource: `/${segment1}/${segment2}/{id}`,
							path: `/${segment1}/${segment2}/${id}`,
							pathParameters: {
								id: id
							},
							queryStringParameters: {},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Nested single-placeholder routes should match correctly
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getPathParameters()).toEqual({
							id: id
						});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Single-placeholder routes reject invalid values correctly', () => {
			fc.assert(
				fc.property(
					// Generate route prefix
					fc.constantFrom('product', 'user', 'item'),
					// Generate invalid ID (contains special characters)
					fc.stringMatching(/^[^a-zA-Z0-9]{1,10}$/),
					(routePrefix, invalidId) => {
						fc.pre(invalidId.length > 0);
						
						// Initialize with single-placeholder route validation (alphanumeric only)
						ClientRequest.init({
							parameters: {
								pathParameters: {
									BY_ROUTE: [
										{
											route: `${routePrefix}/{id}`,
											validate: (value) => /^[a-zA-Z0-9]+$/.test(value)
										}
									]
								}
							}
						});

						const event = {
							httpMethod: 'GET',
							resource: `/${routePrefix}/{id}`,
							path: `/${routePrefix}/${invalidId}`,
							pathParameters: {
								id: invalidId
							},
							queryStringParameters: {},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Invalid values should be rejected
						expect(clientRequest.isValid()).toBe(false);
						expect(clientRequest.getPathParameters()).toEqual({});

						return true;
					}
				),
				{ numRuns: 30 }
			);
		});
	});

	describe('Edge Cases: Single-Placeholder Routes', () => {
		it('should handle single placeholder at the end of path', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'api/v1/resource/{id}',
								validate: (value) => typeof value === 'string' && value.length > 0
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/v1/resource/{id}',
				path: '/api/v1/resource/test123',
				pathParameters: {
					id: 'test123'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getPathParameters()).toEqual({
				id: 'test123'
			});
		});

		it('should handle single placeholder at the beginning of path', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: '{id}/details',
								validate: (value) => typeof value === 'string' && value.length > 0
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/{id}/details',
				path: '/user123/details',
				pathParameters: {
					id: 'user123'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getPathParameters()).toEqual({
				id: 'user123'
			});
		});

		it('should handle single placeholder with method-and-route pattern', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'GET:product/{id}',
								validate: (value) => /^[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/456',
				pathParameters: {
					id: '456'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getPathParameters()).toEqual({
				id: '456'
			});
		});
	});
});

/**
 * PRESERVATION DOCUMENTATION
 * 
 * This test suite validates that single-placeholder routes work correctly on the UNFIXED code.
 * These behaviors MUST be preserved after implementing fixes for multi-placeholder routes.
 * 
 * Preserved Behaviors:
 * 
 * 1. Single-placeholder routes (e.g., product/{id}) match correctly
 * 2. Path parameters are extracted correctly for single placeholders
 * 3. Validation functions are called correctly for single placeholders
 * 4. Invalid values are rejected correctly for single placeholders
 * 5. Single placeholders work at any position in the path (beginning, middle, end)
 * 6. Method-and-route patterns work correctly with single placeholders
 * 7. Nested paths with single placeholders work correctly
 * 
 * Property-Based Testing Coverage:
 * 
 * - Property 1: Single-placeholder routes with numeric IDs match correctly
 * - Property 2: Single-placeholder routes with alphanumeric IDs match correctly
 * - Property 3: Single-placeholder routes with nested paths match correctly
 * - Property 4: Single-placeholder routes reject invalid values correctly
 * 
 * These properties are tested across many generated inputs to ensure comprehensive coverage
 * of the single-placeholder route matching behavior that must be preserved.
 */
