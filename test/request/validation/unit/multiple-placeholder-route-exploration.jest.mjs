import { describe, it, expect } from '@jest/globals';

// Import ClientRequest to test the full validation flow
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

/**
 * EXPLORATION TEST FOR DEFECT 1: Multiple Placeholder Route Matching Failure
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * 
 * GOAL: Surface counterexamples demonstrating that routes with multiple placeholders fail to match.
 * 
 * EXPECTED OUTCOME: Test FAILS (this is correct - it proves the bug exists)
 * 
 * Bug Condition: Route patterns with multiple placeholders (e.g., users/{userId}/posts/{postId}) 
 * fail to match request paths, causing isValid() to return false instead of true.
 * 
 * Expected Behavior: Route matching should work correctly for any number of placeholders.
 */
describe('Defect 1: Multiple Placeholder Route Matching - Exploration Tests', () => {
	describe('Two Placeholder Routes', () => {
		it('should match route pattern users/{userId}/posts/{postId} with request path /users/123/posts/456', () => {
			// Initialize ClientRequest with validation for two-placeholder route
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'users/{userId}/posts/{postId}',
								validate: ({ userId, postId }) => {
									// Both parameters must be numeric strings
									return /^\d+$/.test(userId) && /^\d+$/.test(postId);
								}
							}
						]
					}
				}
			});

			// Create mock API Gateway event with matching path
			const event = {
				httpMethod: 'GET',
				resource: '/users/{userId}/posts/{postId}',
				path: '/users/123/posts/456',
				pathParameters: {
					userId: '123',
					postId: '456'
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

			// EXPECTED: isValid() should return true for valid request
			// ACTUAL (on unfixed code): isValid() returns false
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Path parameters should be extracted
			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				userId: '123',
				postId: '456'
			});
		});

		it('should match route pattern api/{version}/users/{userId} with request path /api/v1/users/789', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'api/{version}/users/{userId}',
								validate: ({ version, userId }) => {
									return /^v\d+$/.test(version) && /^\d+$/.test(userId);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/{version}/users/{userId}',
				path: '/api/v1/users/789',
				pathParameters: {
					version: 'v1',
					userId: '789'
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
				userId: '789'
			});
		});
	});

	describe('Three or More Placeholder Routes', () => {
		it('should match route pattern api/{version}/resources/{resourceId}/items/{itemId} with 3 placeholders', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'api/{version}/resources/{resourceId}/items/{itemId}',
								validate: ({ version, resourceId, itemId }) => {
									return /^v\d+$/.test(version) && 
									       /^\d+$/.test(resourceId) && 
									       /^\d+$/.test(itemId);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/{version}/resources/{resourceId}/items/{itemId}',
				path: '/api/v2/resources/100/items/200',
				pathParameters: {
					version: 'v2',
					resourceId: '100',
					itemId: '200'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true for valid request with 3 placeholders
			// ACTUAL (on unfixed code): isValid() returns false
			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				version: 'v2',
				resourceId: '100',
				itemId: '200'
			});
		});

		it('should match route pattern org/{orgId}/projects/{projectId}/tasks/{taskId}/comments/{commentId} with 4 placeholders', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'org/{orgId}/projects/{projectId}/tasks/{taskId}/comments/{commentId}',
								validate: ({ orgId, projectId, taskId, commentId }) => {
									return /^\d+$/.test(orgId) && 
									       /^\d+$/.test(projectId) && 
									       /^\d+$/.test(taskId) && 
									       /^\d+$/.test(commentId);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/org/{orgId}/projects/{projectId}/tasks/{taskId}/comments/{commentId}',
				path: '/org/1/projects/2/tasks/3/comments/4',
				pathParameters: {
					orgId: '1',
					projectId: '2',
					taskId: '3',
					commentId: '4'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true for valid request with 4 placeholders
			// ACTUAL (on unfixed code): isValid() returns false
			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				orgId: '1',
				projectId: '2',
				taskId: '3',
				commentId: '4'
			});
		});
	});

	describe('Edge Cases with Multiple Placeholders', () => {
		it('should match consecutive placeholders: data/{type}/{id}', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'data/{type}/{id}',
								validate: ({ type, id }) => {
									return typeof type === 'string' && typeof id === 'string';
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/data/{type}/{id}',
				path: '/data/user/abc123',
				pathParameters: {
					type: 'user',
					id: 'abc123'
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
				type: 'user',
				id: 'abc123'
			});
		});

		it('should match mixed static and placeholder segments: api/v1/{resource}/{id}/details', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'api/v1/{resource}/{id}/details',
								validate: ({ resource, id }) => {
									return typeof resource === 'string' && typeof id === 'string';
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/v1/{resource}/{id}/details',
				path: '/api/v1/products/xyz789/details',
				pathParameters: {
					resource: 'products',
					id: 'xyz789'
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
				resource: 'products',
				id: 'xyz789'
			});
		});
	});

	describe('Validation Failure Cases (Should Still Work)', () => {
		it('should return isValid()===false when validation fails for multiple placeholders', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'users/{userId}/posts/{postId}',
								validate: ({ userId, postId }) => {
									// Require numeric values
									return /^\d+$/.test(userId) && /^\d+$/.test(postId);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/users/{userId}/posts/{postId}',
				path: '/users/abc/posts/def', // Non-numeric values
				pathParameters: {
					userId: 'abc',
					postId: 'def'
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
 * 1. Route pattern "users/{userId}/posts/{postId}" with request path "/users/123/posts/456"
 *    - Expected: isValid() === true
 *    - Actual: isValid() === false
 *    - Reason: Route matching fails for routes with 2 placeholders
 * 
 * 2. Route pattern "api/{version}/resources/{resourceId}/items/{itemId}" with 3 placeholders
 *    - Expected: isValid() === true
 *    - Actual: isValid() === false
 *    - Reason: Route matching fails for routes with 3+ placeholders
 * 
 * 3. Route pattern "org/{orgId}/projects/{projectId}/tasks/{taskId}/comments/{commentId}" with 4 placeholders
 *    - Expected: isValid() === true
 *    - Actual: isValid() === false
 *    - Reason: Route matching fails for routes with 4+ placeholders
 * 
 * 4. Consecutive placeholders "data/{type}/{id}"
 *    - Expected: isValid() === true
 *    - Actual: isValid() === false
 *    - Reason: Route matching fails even for simple consecutive placeholders
 * 
 * ROOT CAUSE HYPOTHESIS:
 * The #routeMatches() method in ValidationMatcher.class.js (lines 119-148) has a logic error
 * in placeholder matching. The segment-by-segment comparison may not correctly handle multiple
 * placeholders in sequence, or there may be an issue with how normalized routes are compared.
 * 
 * PRESERVATION NOTE:
 * Single-placeholder routes (e.g., "product/{id}") should continue to work correctly.
 * This test focuses only on routes with 2 or more placeholders.
 */
