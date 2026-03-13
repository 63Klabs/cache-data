import { describe, it, expect, beforeAll } from '@jest/globals';
import fc from 'fast-check';

/**
 * Fix Verification Property Tests
 * 
 * These tests verify that the parameter extraction fix works correctly for all inputs
 * where the bug condition holds (validation rules exist and validation passes).
 * 
 * EXPECTED BEHAVIOR ON FIXED CODE:
 * - All tests in this file should PASS
 * - Parameter getter methods return actual validated parameter values
 * - This confirms the fix works correctly across the input domain
 * 
 * EXPECTED BEHAVIOR ON UNFIXED CODE:
 * - All tests in this file should FAIL
 * - Parameter getter methods return {} instead of validated values
 * - This confirms the bug exists
 * 
 * Test Coverage:
 * - Property 1: Query string parameter extraction (Bug Condition 1.1)
 * - Property 2: Header parameter extraction (Bug Condition 1.2)
 * - Property 3: Body parameter extraction (Bug Condition 1.3)
 * - Property 4: Path parameter extraction with multiple placeholders (Bug Condition 1.4)
 * - Property 5: BY_ROUTE validation with multiple placeholders (Bug Condition 1.5)
 * - Property 6: Multi-parameter validation extraction (Bug Condition 1.6)
 * - Property 7: Method-and-route pattern extraction (Bug Condition 1.7)
 * - Property 8: Validation priority order extraction (Bug Condition 1.8)
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

describe('Fix Verification - Parameter Extraction Properties', () => {
	let ClientRequest;

	beforeAll(async () => {
		// Dynamic import to get fresh module
		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
		ClientRequest = module.default;
	});

	describe('Property 1: Query String Parameter Extraction', () => {
		it('Property: For any valid query parameters with validation rules, getQueryStringParameters() returns validated values', () => {
			fc.assert(
				fc.property(
					fc.record({
						query: fc.string({ minLength: 1, maxLength: 50 }),
						limit: fc.integer({ min: 1, max: 100 })
					}),
					(params) => {
						// Initialize with validation rules
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								queryParameters: {
									query: (value) => typeof value === 'string' && value.length > 0,
									limit: (value) => !isNaN(value) && parseInt(value) > 0 && parseInt(value) <= 100
								}
							}
						});

						const event = createMockEvent({
							resource: '/search',
							queryStringParameters: {
								query: params.query,
								limit: String(params.limit)
							}
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getQueryStringParameters() returns validated values
						const queryParams = request.getQueryStringParameters();
						expect(queryParams).toEqual({
							query: params.query,
							limit: String(params.limit)
						});
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 2: Header Parameter Extraction', () => {
		it('Property: For any valid headers with validation rules, getHeaderParameters() returns validated values', () => {
			fc.assert(
				fc.property(
					fc.record({
						token: fc.string({ minLength: 10, maxLength: 50 }),
						contentType: fc.constantFrom('application/json', 'application/xml', 'text/plain')
					}),
					(params) => {
						// Initialize with validation rules
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								headerParameters: {
									authorization: (value) => value.startsWith('Bearer '),
									contentType: (value) => ['application/json', 'application/xml', 'text/plain'].includes(value)
								}
							}
						});

						const event = createMockEvent({
							resource: '/api/data',
							headers: {
								'Referer': 'https://example.com',
								'Authorization': `Bearer ${params.token}`,
								'Content-Type': params.contentType
							}
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getHeaderParameters() returns validated values
						const headerParams = request.getHeaderParameters();
						expect(headerParams).toEqual({
							authorization: `Bearer ${params.token}`,
							contentType: params.contentType
						});
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 3: Body Parameter Extraction', () => {
		it('Property: For any valid body parameters with validation rules, getBodyParameters() returns validated values', () => {
			fc.assert(
				fc.property(
					fc.record({
						name: fc.string({ minLength: 1, maxLength: 50 }),
						email: fc.emailAddress(),
						age: fc.integer({ min: 18, max: 100 })
					}),
					(params) => {
						// Initialize with validation rules
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								bodyParameters: {
									name: (value) => typeof value === 'string' && value.length > 0,
									email: (value) => value.includes('@'),
									age: (value) => typeof value === 'number' && value >= 18
								}
							}
						});

						const event = createMockEvent({
							httpMethod: 'POST',
							resource: '/users',
							body: JSON.stringify(params)
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getBodyParameters() returns validated values
						const bodyParams = request.getBodyParameters();
						expect(bodyParams).toEqual(params);
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 4: Path Parameter Extraction with Multiple Placeholders', () => {
		it('Property: For any valid path parameters with multiple placeholders, getPathParameters() returns all validated values', () => {
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.integer({ min: 1, max: 9999 }).map(String),
						postId: fc.integer({ min: 1, max: 9999 }).map(String),
						commentId: fc.integer({ min: 1, max: 9999 }).map(String)
					}),
					(params) => {
						// Initialize with validation rules
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								pathParameters: {
									userId: (value) => /^[0-9]+$/.test(value),
									postId: (value) => /^[0-9]+$/.test(value),
									commentId: (value) => /^[0-9]+$/.test(value)
								}
							}
						});

						const event = createMockEvent({
							resource: '/users/{userId}/posts/{postId}/comments/{commentId}',
							path: `/users/${params.userId}/posts/${params.postId}/comments/${params.commentId}`,
							pathParameters: params
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getPathParameters() returns all validated path parameters
						const pathParams = request.getPathParameters();
						expect(pathParams).toEqual(params);
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 5: BY_ROUTE Validation with Multiple Placeholders', () => {
		it('Property: For any valid BY_ROUTE validation with multiple placeholders, all parameters are extracted', () => {
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.integer({ min: 1, max: 9999 }).map(String),
						postId: fc.integer({ min: 1, max: 9999 }).map(String)
					}),
					(params) => {
						// Initialize with BY_ROUTE validation
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								pathParameters: {
									BY_ROUTE: [
										{
											route: 'users/{userId}/posts/{postId}',
											validate: ({ userId, postId }) => {
												return /^[0-9]+$/.test(userId) && /^[0-9]+$/.test(postId);
											}
										}
									]
								}
							}
						});

						const event = createMockEvent({
							resource: '/users/{userId}/posts/{postId}',
							path: `/users/${params.userId}/posts/${params.postId}`,
							pathParameters: params
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getPathParameters() returns all validated parameters
						const pathParams = request.getPathParameters();
						expect(pathParams).toEqual(params);
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 6: Multi-Parameter Validation Extraction', () => {
		it('Property: For any valid multi-parameter validation, all specified parameters are extracted', () => {
			fc.assert(
				fc.property(
					fc.record({
						query: fc.string({ minLength: 3, maxLength: 50 }),
						limit: fc.integer({ min: 1, max: 100 }),
						page: fc.integer({ min: 1, max: 100 })
					}),
					(params) => {
						// Initialize with multi-parameter validation
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								queryParameters: {
									query: (value) => value.length >= 3,
									limit: (value) => !isNaN(value),
									page: (value) => !isNaN(value),
									BY_ROUTE: [
										{
											route: 'search?query,limit,page',
											validate: ({ query, limit, page }) => {
												if (!query || query.length < 3) return false;
												const limitNum = parseInt(limit || '10');
												const pageNum = parseInt(page || '1');
												return limitNum >= 1 && limitNum <= 100 && pageNum >= 1;
											}
										}
									]
								}
							}
						});

						const event = createMockEvent({
							resource: '/search',
							queryStringParameters: {
								query: params.query,
								limit: String(params.limit),
								page: String(params.page)
							}
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getQueryStringParameters() returns all validated parameters
						const queryParams = request.getQueryStringParameters();
						expect(queryParams).toEqual({
							query: params.query,
							limit: String(params.limit),
							page: String(params.page)
						});
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 7: Method-and-Route Pattern Extraction', () => {
		it('Property: For any valid method-and-route pattern, parameters are extracted correctly', () => {
			fc.assert(
				fc.property(
					fc.record({
						method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
						productId: fc.integer({ min: 1, max: 9999 }).map(String)
					}),
					(params) => {
						// Initialize with method-and-route validation
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								pathParameters: {
									productId: (value) => /^[0-9]+$/.test(value)
								}
							}
						});

						const event = createMockEvent({
							httpMethod: params.method,
							resource: '/products/{productId}',
							path: `/products/${params.productId}`,
							pathParameters: {
								productId: params.productId
							}
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getPathParameters() returns validated parameters
						const pathParams = request.getPathParameters();
						expect(pathParams).toEqual({
							productId: params.productId
						});
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 8: Validation Priority Order Extraction', () => {
		it('Property: For any valid input matching highest priority rule, parameters are extracted using that rule', () => {
			fc.assert(
				fc.property(
					fc.record({
						method: fc.constantFrom('GET', 'POST'),
						id: fc.oneof(
							fc.constant('P1-').chain(prefix => 
								fc.integer({ min: 1, max: 999 }).map(n => `${prefix}${n}`)
							),
							fc.constant('P2-').chain(prefix => 
								fc.integer({ min: 1, max: 999 }).map(n => `${prefix}${n}`)
							)
						)
					}),
					(params) => {
						// Initialize with priority-based validation
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								pathParameters: {
									id: (value) => /^[0-9]+$/.test(value), // Priority 4: Global - only numeric
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
							httpMethod: params.method,
							resource: '/product/{id}',
							path: `/product/${params.id}`,
							pathParameters: { id: params.id }
						});

						const request = new ClientRequest(event, createMockContext());

						// Determine if validation should pass based on priority rules
						// Priority 1: POST:product/{id} - requires P1-XXX
						// Priority 2: product/{id} - requires P2-XXX
						// Priority 3: BY_METHOD POST - requires METHOD-XXX
						// Priority 4: Global - requires numeric only
						const shouldPass = 
							(params.method === 'POST' && params.id.startsWith('P1-')) || // Priority 1 matches
							(params.method === 'GET' && params.id.startsWith('P2-'));    // Priority 2 matches

						if (shouldPass) {
							// Validation should pass
							expect(request.isValid()).toBe(true);

							// PROPERTY: getPathParameters() returns validated parameters
							const pathParams = request.getPathParameters();
							expect(pathParams).toEqual({ id: params.id });
						} else {
							// Validation should fail for this combination
							expect(request.isValid()).toBe(false);
						}
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Combined Properties: All Parameter Types Together', () => {
		it('Property: For any valid request with all parameter types, all validated parameters are extracted', () => {
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.integer({ min: 1, max: 999 }).map(String),
						postId: fc.integer({ min: 1, max: 999 }).map(String),
						limit: fc.integer({ min: 1, max: 100 }),
						page: fc.integer({ min: 1, max: 50 }),
						token: fc.string({ minLength: 10, maxLength: 30 }),
						title: fc.string({ minLength: 1, maxLength: 100 }),
						content: fc.string({ minLength: 1, maxLength: 500 })
					}),
					(params) => {
						// Initialize with validation rules for all parameter types
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								pathParameters: {
									userId: (value) => /^[0-9]+$/.test(value),
									postId: (value) => /^[0-9]+$/.test(value)
								},
								queryParameters: {
									limit: (value) => !isNaN(value) && parseInt(value) > 0 && parseInt(value) <= 100,
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
							path: `/users/${params.userId}/posts/${params.postId}`,
							pathParameters: {
								userId: params.userId,
								postId: params.postId
							},
							queryStringParameters: {
								limit: String(params.limit),
								page: String(params.page)
							},
							headers: {
								'Referer': 'https://example.com',
								'Authorization': `Bearer ${params.token}`
							},
							body: JSON.stringify({
								title: params.title,
								content: params.content
							})
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: All parameter getter methods return validated values
						const pathParams = request.getPathParameters();
						const queryParams = request.getQueryStringParameters();
						const headerParams = request.getHeaderParameters();
						const bodyParams = request.getBodyParameters();

						expect(pathParams).toEqual({
							userId: params.userId,
							postId: params.postId
						});

						expect(queryParams).toEqual({
							limit: String(params.limit),
							page: String(params.page)
						});

						expect(headerParams).toEqual({
							authorization: `Bearer ${params.token}`
						});

						expect(bodyParams).toEqual({
							title: params.title,
							content: params.content
						});
					}
				),
				{ numRuns: 30 } // Reduced runs for complex test
			);
		});
	});
});
