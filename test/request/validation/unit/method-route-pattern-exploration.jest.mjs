import { describe, it, expect } from '@jest/globals';

// Import ClientRequest to test the full validation flow
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

/**
 * EXPLORATION TEST FOR DEFECT 6: Method-and-Route Pattern Matching Failure
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * 
 * GOAL: Surface counterexamples demonstrating that method-and-route patterns fail to match.
 * 
 * EXPECTED OUTCOME: Test FAILS (this is correct - it proves the bug exists)
 * 
 * Bug Condition: Route patterns with method prefix (e.g., POST:product/{id}) fail to match 
 * correctly when the HTTP method and path should match.
 * 
 * Expected Behavior: Method-and-route patterns should match correctly when both the HTTP method 
 * and path match the pattern.
 */
describe('Defect 6: Method-and-Route Pattern Matching - Exploration Tests', () => {
	describe('POST Method-and-Route Patterns', () => {
		it('should match route pattern POST:product/{id} with POST request to /product/123', () => {
			// Initialize ClientRequest with validation for method-and-route pattern
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (id) => {
									// ID must be numeric string
									// >! Single-parameter validation receives value directly, not as object
									return /^\d+$/.test(id);
								}
							}
						]
					}
				}
			});

			// Create mock API Gateway event with POST request
			const event = {
				httpMethod: 'POST',
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

			// EXPECTED: isValid() should return true for matching method and route
			// ACTUAL (on unfixed code): isValid() returns false
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Path parameters should be extracted
			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				id: '123'
			});
		});

		it('should NOT match POST:product/{id} with GET request to /product/123', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (id) => /^\d+$/.test(id)
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',  // Different method
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

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true because no validation rule matches
			// (no validation rule = nothing to fail)
			// But path parameters should be empty because excludeParamsWithNoValidationMatch is true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Path parameters should be empty when method doesn't match
			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({});
		});
	});

	describe('GET Method-and-Route Patterns', () => {
		it('should match route pattern GET:users/{userId} with GET request to /users/456', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'GET:users/{userId}',
								validate: (userId) => {
									// >! Single-parameter validation receives value directly, not as object
									return /^\d+$/.test(userId);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/users/{userId}',
				path: '/users/456',
				pathParameters: {
					userId: '456'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true for matching method and route
			// ACTUAL (on unfixed code): isValid() returns false
			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				userId: '456'
			});
		});

		it('should NOT match GET:users/{userId} with POST request to /users/456', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'GET:users/{userId}',
								validate: (userId) => /^\d+$/.test(userId)
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'POST',  // Different method
				resource: '/users/{userId}',
				path: '/users/456',
				pathParameters: {
					userId: '456'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true because no validation rule matches
			// (no validation rule = nothing to fail)
			// But path parameters should be empty because excludeParamsWithNoValidationMatch is true
			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({});
		});
	});

	describe('PUT Method-and-Route Patterns', () => {
		it('should match route pattern PUT:items/{itemId}/status with PUT request', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'PUT:items/{itemId}/status',
								validate: (itemId) => {
									// >! Single-parameter validation receives value directly, not as object
									return /^\d+$/.test(itemId);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'PUT',
				resource: '/items/{itemId}/status',
				path: '/items/789/status',
				pathParameters: {
					itemId: '789'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true for matching method and route
			// ACTUAL (on unfixed code): isValid() returns false
			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				itemId: '789'
			});
		});
	});

	describe('DELETE Method-and-Route Patterns', () => {
		it('should match route pattern DELETE:resources/{resourceId} with DELETE request', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'DELETE:resources/{resourceId}',
								validate: (resourceId) => {
									// >! Single-parameter validation receives value directly, not as object
									return /^[a-zA-Z0-9-]+$/.test(resourceId);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'DELETE',
				resource: '/resources/{resourceId}',
				path: '/resources/abc-123',
				pathParameters: {
					resourceId: 'abc-123'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true for matching method and route
			// ACTUAL (on unfixed code): isValid() returns false
			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				resourceId: 'abc-123'
			});
		});
	});

	describe('Method-and-Route with Multiple Placeholders', () => {
		it('should match POST:api/{version}/users/{userId} with POST request', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'POST:api/{version}/users/{userId}',
								validate: ({ version, userId }) => {
									return /^v\d+$/.test(version) && /^\d+$/.test(userId);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/{version}/users/{userId}',
				path: '/api/v1/users/123',
				pathParameters: {
					version: 'v1',
					userId: '123'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			// ACTUAL (on unfixed code): isValid() returns false
			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				version: 'v1',
				userId: '123'
			});
		});
	});

	describe('Method-and-Route Priority Over Route-Only', () => {
		it('should prioritize method-and-route pattern over route-only pattern', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								// Method-and-route pattern (higher priority)
								route: 'POST:product/{id}',
								validate: (id) => {
									// Strict validation for POST
									// >! Single-parameter validation receives value directly, not as object
									return /^\d{3,}$/.test(id);  // At least 3 digits
								}
							},
							{
								// Route-only pattern (lower priority)
								route: 'product/{id}',
								validate: (id) => {
									// Lenient validation for other methods
									// >! Single-parameter validation receives value directly, not as object
									return /^\d+$/.test(id);  // Any digits
								}
							}
						]
					}
				}
			});

			// POST request should use method-and-route pattern
			const postEvent = {
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/12',  // Only 2 digits - fails strict validation
				pathParameters: {
					id: '12'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const postContext = {
				getRemainingTimeInMillis: () => 30000
			};

			const postRequest = new ClientRequest(postEvent, postContext);

			// EXPECTED: isValid() should return false (fails strict POST validation)
			expect(postRequest.isValid()).toBe(false);

			// GET request should use route-only pattern
			const getEvent = {
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/12',  // Only 2 digits - passes lenient validation
				pathParameters: {
					id: '12'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const getContext = {
				getRemainingTimeInMillis: () => 30000
			};

			const getRequest = new ClientRequest(getEvent, getContext);

			// EXPECTED: isValid() should return true (passes lenient validation)
			expect(getRequest.isValid()).toBe(true);
		});
	});

	describe('Validation Failure Cases', () => {
		it('should return isValid()===false when validation fails for method-and-route pattern', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (id) => {
									// Require numeric values
									// >! Single-parameter validation receives value directly, not as object
									return /^\d+$/.test(id);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/abc',  // Non-numeric value
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
});

/**
 * COUNTEREXAMPLES DOCUMENTATION
 * 
 * When this test is run on UNFIXED code, the following counterexamples are expected:
 * 
 * 1. Route pattern "POST:product/{id}" with POST request to "/product/123"
 *    - Expected: isValid() === true
 *    - Actual: isValid() === false
 *    - Reason: Method-and-route pattern fails to match
 * 
 * 2. Route pattern "GET:users/{userId}" with GET request to "/users/456"
 *    - Expected: isValid() === true
 *    - Actual: isValid() === false
 *    - Reason: Method-and-route pattern fails to match
 * 
 * 3. Route pattern "PUT:items/{itemId}/status" with PUT request to "/items/789/status"
 *    - Expected: isValid() === true
 *    - Actual: isValid() === false
 *    - Reason: Method-and-route pattern fails to match
 * 
 * 4. Route pattern "DELETE:resources/{resourceId}" with DELETE request
 *    - Expected: isValid() === true
 *    - Actual: isValid() === false
 *    - Reason: Method-and-route pattern fails to match
 * 
 * 5. Route pattern "POST:api/{version}/users/{userId}" with multiple placeholders
 *    - Expected: isValid() === true
 *    - Actual: isValid() === false
 *    - Reason: Method-and-route pattern with multiple placeholders fails to match
 * 
 * 6. Method-and-route priority over route-only patterns
 *    - Expected: Method-and-route pattern takes priority
 *    - Actual: May not prioritize correctly or fail to match at all
 *    - Reason: Method-and-route matching logic has issues
 * 
 * ROOT CAUSE HYPOTHESIS:
 * The #findMethodRouteMatch() method in ValidationMatcher.class.js (lines 150-195) has issues 
 * with method prefix extraction and route matching for method-and-route patterns. The method 
 * splits on ':' to extract method and route parts (line 167), but the subsequent route matching 
 * logic may not correctly handle the extracted route part, or the normalization may be incorrect.
 * 
 * Possible issues:
 * 1. Method prefix extraction may not correctly split the pattern
 * 2. Route part after ':' may not be normalized correctly
 * 3. Route matching logic may not handle the extracted route part correctly
 * 4. Priority ordering between method-and-route and route-only patterns may be incorrect
 * 
 * PRESERVATION NOTE:
 * Route-only patterns (without method prefix) should continue to work correctly.
 * This test focuses only on patterns with method prefixes (e.g., "POST:product/{id}").
 */
