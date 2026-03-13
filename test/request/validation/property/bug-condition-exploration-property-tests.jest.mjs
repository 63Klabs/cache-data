import { describe, it, expect, beforeAll } from '@jest/globals';

/**
 * Bug Condition Exploration Property Tests
 * 
 * These tests demonstrate the parameter extraction bug on UNFIXED code.
 * They show that when validation rules exist and validation passes,
 * parameter getter methods return empty objects instead of validated parameters.
 * 
 * EXPECTED BEHAVIOR ON UNFIXED CODE:
 * - All tests in this file should FAIL
 * - Parameter getter methods return {} when they should return validated values
 * - This confirms the bug exists and validates our root cause analysis
 * 
 * EXPECTED BEHAVIOR ON FIXED CODE:
 * - All tests in this file should PASS
 * - Parameter getter methods return actual validated parameter values
 * - This confirms the fix works correctly
 * 
 * Bug Condition: C(X) = hasValidationRules(X) AND validationPasses(X) AND extractedParameters(X) === {}
 * 
 * Test Coverage:
 * - Query string parameter extraction failure (Bug Condition 1.1)
 * - Header parameter extraction failure (Bug Condition 1.2)
 * - Body parameter extraction failure (Bug Condition 1.3)
 * - Path parameter extraction with multiple placeholders (Bug Condition 1.4)
 * - Multi-parameter validation extraction failure (Bug Condition 1.6)
 * - Method-and-route pattern extraction failure (Bug Condition 1.7)
 * - Validation priority order extraction failure (Bug Condition 1.8)
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
		body: null,
		...overrides
	};
}

describe('Bug Condition Exploration - Parameter Extraction Failures', () => {
	let ClientRequest;

	beforeAll(async () => {
		// Dynamic import to get fresh module
		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
		ClientRequest = module.default;
	});

	describe('Bug Condition 1.1: Query String Parameter Extraction Failure', () => {
		it('should demonstrate query parameter extraction bug', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => typeof value === 'string' && value.length > 0,
						limit: (value) => !isNaN(value) && parseInt(value) > 0
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/search',
				queryStringParameters: {
					query: 'test',
					limit: '10'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			// Validation should pass
			expect(request.isValid()).toBe(true);

			// BUG: getQueryStringParameters() returns {} instead of validated parameters
			// EXPECTED (correct behavior): { query: 'test', limit: '10' }
			// ACTUAL (buggy behavior): {}
			const queryParams = request.getQueryStringParameters();
			
			// This assertion will FAIL on unfixed code, demonstrating the bug
			expect(queryParams).toEqual({
				query: 'test',
				limit: '10'
			});
		});
	});

	describe('Bug Condition 1.2: Header Parameter Extraction Failure', () => {
		it('should demonstrate header parameter extraction bug', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer '),
						contentType: (value) => value === 'application/json'
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/api/data',
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer token123',
					'Content-Type': 'application/json'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			// Validation should pass
			expect(request.isValid()).toBe(true);

			// BUG: getHeaderParameters() returns {} instead of validated parameters
			// EXPECTED (correct behavior): { authorization: 'Bearer token123', contentType: 'application/json' }
			// ACTUAL (buggy behavior): {}
			const headerParams = request.getHeaderParameters();
			
			// This assertion will FAIL on unfixed code, demonstrating the bug
			expect(headerParams).toEqual({
				authorization: 'Bearer token123',
				contentType: 'application/json'
			});
		});
	});

	describe('Bug Condition 1.3: Body Parameter Extraction Failure', () => {
		it('should demonstrate body parameter extraction bug', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					bodyParameters: {
						name: (value) => typeof value === 'string' && value.length > 0,
						email: (value) => value.includes('@')
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/users',
				body: JSON.stringify({
					name: 'John Doe',
					email: 'john@example.com'
				})
			});

			const request = new ClientRequest(event, createMockContext());

			// Validation should pass
			expect(request.isValid()).toBe(true);

			// BUG: getBodyParameters() returns {} instead of validated parameters
			// EXPECTED (correct behavior): { name: 'John Doe', email: 'john@example.com' }
			// ACTUAL (buggy behavior): {}
			const bodyParams = request.getBodyParameters();
			
			// This assertion will FAIL on unfixed code, demonstrating the bug
			expect(bodyParams).toEqual({
				name: 'John Doe',
				email: 'john@example.com'
			});
		});
	});

	describe('Bug Condition 1.4: Path Parameter Extraction with Multiple Placeholders', () => {
		it('should demonstrate path parameter extraction bug with 2 placeholders', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value),
						postId: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/users/{userId}/posts/{postId}',
				path: '/users/123/posts/456',
				pathParameters: {
					userId: '123',
					postId: '456'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			// Validation should pass
			expect(request.isValid()).toBe(true);

			// BUG: getPathParameters() returns {} instead of validated parameters
			// EXPECTED (correct behavior): { userId: '123', postId: '456' }
			// ACTUAL (buggy behavior): {}
			const pathParams = request.getPathParameters();
			
			// This assertion will FAIL on unfixed code, demonstrating the bug
			expect(pathParams).toEqual({
				userId: '123',
				postId: '456'
			});
		});

		it('should demonstrate path parameter extraction bug with 3 placeholders', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						version: (value) => /^v[0-9]+$/.test(value),
						resourceId: (value) => /^[0-9]+$/.test(value),
						itemId: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createMockEvent({
				resource: '/api/{version}/resources/{resourceId}/items/{itemId}',
				path: '/api/v1/resources/100/items/200',
				pathParameters: {
					version: 'v1',
					resourceId: '100',
					itemId: '200'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			// Validation should pass
			expect(request.isValid()).toBe(true);

			// BUG: getPathParameters() returns {} instead of validated parameters
			const pathParams = request.getPathParameters();
			
			// This assertion will FAIL on unfixed code, demonstrating the bug
			expect(pathParams).toEqual({
				version: 'v1',
				resourceId: '100',
				itemId: '200'
			});
		});
	});

	describe('Bug Condition 1.6: Multi-Parameter Validation Extraction Failure', () => {
		it('should demonstrate multi-parameter validation extraction bug', () => {
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
									if (!query || query.length < 3) return false;
									const limitNum = parseInt(limit || '10');
									return limitNum >= 1 && limitNum <= 100;
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
					query: 'javascript',
					limit: '25'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			// Validation should pass
			expect(request.isValid()).toBe(true);

			// BUG: getQueryStringParameters() returns {} instead of validated parameters
			// EXPECTED (correct behavior): { query: 'javascript', limit: '25' }
			// ACTUAL (buggy behavior): {}
			const queryParams = request.getQueryStringParameters();
			
			// This assertion will FAIL on unfixed code, demonstrating the bug
			expect(queryParams).toEqual({
				query: 'javascript',
				limit: '25'
			});
		});
	});

	describe('Bug Condition 1.7: Method-and-Route Pattern Extraction Failure', () => {
		it('should demonstrate method-and-route pattern extraction bug', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value),
						postId: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/users/{userId}/posts/{postId}',
				path: '/users/123/posts/456',
				pathParameters: {
					userId: '123',
					postId: '456'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			// Validation should pass
			expect(request.isValid()).toBe(true);

			// BUG: getPathParameters() returns {} instead of validated parameters
			// EXPECTED (correct behavior): { userId: '123', postId: '456' }
			// ACTUAL (buggy behavior): {}
			const pathParams = request.getPathParameters();
			
			// This assertion will FAIL on unfixed code, demonstrating the bug
			expect(pathParams).toEqual({
				userId: '123',
				postId: '456'
			});
		});
	});

	describe('Bug Condition 1.8: Validation Priority Order Extraction Failure', () => {
		it('should demonstrate priority order extraction bug (Priority 1: method-and-route)', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Global
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^METHOD-[0-9]+$/.test(value) // Priority 3
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^P1-[0-9]+$/.test(value) // Priority 1
							},
							{
								route: 'product/{id}',
								validate: (value) => /^P2-[0-9]+$/.test(value) // Priority 2
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

			// Validation should pass
			expect(request.isValid()).toBe(true);

			// BUG: getPathParameters() returns {} instead of validated parameters
			// EXPECTED (correct behavior): { id: 'P1-123' }
			// ACTUAL (buggy behavior): {}
			const pathParams = request.getPathParameters();
			
			// This assertion will FAIL on unfixed code, demonstrating the bug
			expect(pathParams).toEqual({ id: 'P1-123' });
		});

		it('should demonstrate priority order extraction bug (Priority 2: route-only)', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^METHOD-[0-9]+$/.test(value)
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^P1-[0-9]+$/.test(value)
							},
							{
								route: 'product/{id}',
								validate: (value) => /^P2-[0-9]+$/.test(value)
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

			// Validation should pass
			expect(request.isValid()).toBe(true);

			// BUG: getPathParameters() returns {} instead of validated parameters
			const pathParams = request.getPathParameters();
			
			// This assertion will FAIL on unfixed code, demonstrating the bug
			expect(pathParams).toEqual({ id: 'P2-456' });
		});
	});

	describe('Bug Condition Summary: All Parameter Types Together', () => {
		it('should demonstrate bug across all parameter types simultaneously', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value),
						postId: (value) => /^[0-9]+$/.test(value)
					},
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0,
						page: (value) => !isNaN(value) && parseInt(value) > 0
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
					},
					bodyParameters: {
						title: (value) => typeof value === 'string' && value.length > 0,
						content: (value) => typeof value === 'string'
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/users/{userId}/posts/{postId}',
				path: '/users/123/posts/456',
				pathParameters: {
					userId: '123',
					postId: '456'
				},
				queryStringParameters: {
					limit: '10',
					page: '1'
				},
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer token123'
				},
				body: JSON.stringify({
					title: 'Test Post',
					content: 'This is test content'
				})
			});

			const request = new ClientRequest(event, createMockContext());

			// Validation should pass
			expect(request.isValid()).toBe(true);

			// BUG: ALL parameter getter methods return {} instead of validated parameters
			const pathParams = request.getPathParameters();
			const queryParams = request.getQueryStringParameters();
			const headerParams = request.getHeaderParameters();
			const bodyParams = request.getBodyParameters();
			
			// All these assertions will FAIL on unfixed code, demonstrating the bug
			expect(pathParams).toEqual({
				userId: '123',
				postId: '456'
			});
			
			expect(queryParams).toEqual({
				limit: '10',
				page: '1'
			});
			
			expect(headerParams).toEqual({
				authorization: 'Bearer token123'
			});
			
			expect(bodyParams).toEqual({
				title: 'Test Post',
				content: 'This is test content'
			});
		});
	});
});
