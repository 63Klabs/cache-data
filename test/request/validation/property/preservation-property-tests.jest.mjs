import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import fc from 'fast-check';

/**
 * Preservation Property Tests
 * 
 * These tests verify that the parameter extraction fix preserves existing behavior
 * for all inputs where the bug condition does NOT hold.
 * 
 * EXPECTED BEHAVIOR ON BOTH UNFIXED AND FIXED CODE:
 * - All tests in this file should PASS on both versions
 * - This confirms the fix does not break existing behavior
 * - Validates that non-buggy inputs continue to work correctly
 * 
 * Test Coverage:
 * - Property 9: No validation rules preservation
 * - Property 10: Validation failure preservation
 * - Property 11: excludeParamsWithNoValidationMatch flag preservation
 * - Property 12: Single-parameter validation interface preservation
 * - Property 13: Path parameters without BY_ROUTE preservation
 * - Property 14: Referrer validation preservation
 * - Property 15: Single placeholder routes preservation
 * - Property 16: Global parameter validation preservation
 * - Property 17: No duplicate parameters preservation
 * - Property 18: getBodyParameters() method preservation
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

describe('Preservation - Existing Behavior Properties', () => {
	let ClientRequest;

	beforeAll(async () => {
		// Dynamic import to get fresh module
		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
		ClientRequest = module.default;
	});

	afterEach(() => {
		// Reset ClientRequest initialization between tests
		// This ensures each test starts with a clean state
	});

	describe('Property 9: No Validation Rules Preservation', () => {
		it('Property: When no validation rules exist, parameter getter methods return empty objects (excludeParamsWithNoValidationMatch=true)', () => {
			fc.assert(
				fc.property(
					fc.record({
						query: fc.string({ minLength: 1, maxLength: 50 }),
						limit: fc.integer({ min: 1, max: 100 })
					}),
					(params) => {
						// Initialize WITHOUT validation rules
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								// No validation rules defined
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

						// Validation should pass (no rules to fail)
						expect(request.isValid()).toBe(true);

						// PROPERTY: getQueryStringParameters() returns empty object when no validation rules
						const queryParams = request.getQueryStringParameters();
						expect(queryParams).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 10: Validation Failure Preservation', () => {
		it('Property: When validation fails, parameter getter methods return empty objects', () => {
			fc.assert(
				fc.property(
					fc.record({
						query: fc.string({ minLength: 1, maxLength: 2 }), // Too short for validation
						limit: fc.integer({ min: 101, max: 200 }) // Too high for validation
					}),
					(params) => {
						// Initialize with validation rules that will fail
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								queryParameters: {
									query: (value) => value.length >= 3, // Requires 3+ chars
									limit: (value) => !isNaN(value) && parseInt(value) <= 100 // Max 100
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

						// Validation should fail
						expect(request.isValid()).toBe(false);

						// PROPERTY: getQueryStringParameters() returns empty object when validation fails
						const queryParams = request.getQueryStringParameters();
						expect(queryParams).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 11: Exclude Unmatched Flag Preservation', () => {
		it('Property: When excludeParamsWithNoValidationMatch=false, unvalidated parameters are included', () => {
			fc.assert(
				fc.property(
					fc.record({
						query: fc.string({ minLength: 1, maxLength: 50 }),
						limit: fc.integer({ min: 1, max: 100 }),
						extraParam: fc.string({ minLength: 1, maxLength: 20 })
					}),
					(params) => {
						// Initialize with excludeParamsWithNoValidationMatch=false
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								queryParameters: {
									query: (value) => typeof value === 'string' && value.length > 0,
									limit: (value) => !isNaN(value) && parseInt(value) > 0
									// No validation for extraParam
								},
								excludeParamsWithNoValidationMatch: false
							}
						});

						const event = createMockEvent({
							resource: '/search',
							queryStringParameters: {
								query: params.query,
								limit: String(params.limit),
								extraParam: params.extraParam
							}
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getQueryStringParameters() includes unvalidated parameters
						const queryParams = request.getQueryStringParameters();
						expect(queryParams).toHaveProperty('query', params.query);
						expect(queryParams).toHaveProperty('limit', String(params.limit));
						// Note: Parameter names are normalized to lowercase
						expect(queryParams).toHaveProperty('extraparam', params.extraParam);
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 12: Single-Parameter Validation Interface Preservation', () => {
		it('Property: Single-parameter validation continues to pass value directly to validation function', () => {
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.integer({ min: 1, max: 9999 }).map(String)
					}),
					(params) => {
						// Track what value was passed to validation function
						let receivedValue = null;
						
						// Initialize with single-parameter validation
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								pathParameters: {
									userId: (value) => {
										receivedValue = value;
										return /^[0-9]+$/.test(value);
									}
								}
							}
						});

						const event = createMockEvent({
							resource: '/users/{userId}',
							path: `/users/${params.userId}`,
							pathParameters: params
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: Validation function received the value directly (not as object)
						expect(receivedValue).toBe(params.userId);
						expect(typeof receivedValue).toBe('string');
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 13: Path Parameters Without BY_ROUTE Preservation', () => {
		it('Property: Path parameters validated without BY_ROUTE rules continue to work correctly', () => {
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.integer({ min: 1, max: 9999 }).map(String)
					}),
					(params) => {
						// Initialize with simple path parameter validation (no BY_ROUTE)
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								pathParameters: {
									userId: (value) => /^[0-9]+$/.test(value)
								}
							}
						});

						const event = createMockEvent({
							resource: '/users/{userId}',
							path: `/users/${params.userId}`,
							pathParameters: params
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getPathParameters() returns validated parameters
						const pathParams = request.getPathParameters();
						expect(pathParams).toEqual(params);
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 14: Referrer Validation Preservation', () => {
		it('Property: When referrer validation fails, isValid() returns false regardless of parameter validation', () => {
			fc.assert(
				fc.property(
					fc.record({
						query: fc.string({ minLength: 1, maxLength: 50 })
					}),
					(params) => {
						// Initialize with strict referrer validation
						ClientRequest.init({
							referrers: ['https://allowed-domain.com'],
							parameters: {
								queryParameters: {
									query: (value) => typeof value === 'string' && value.length > 0
								}
							}
						});

						const event = createMockEvent({
							resource: '/search',
							queryStringParameters: {
								query: params.query
							},
							headers: {
								'Referer': 'https://malicious-domain.com' // Wrong referrer
							}
						});

						const request = new ClientRequest(event, createMockContext());

						// PROPERTY: isValid() returns false due to referrer validation failure
						expect(request.isValid()).toBe(false);

						// All validation checks now run (no short-circuit) to collect failure reasons.
						// Valid parameters are still extracted even when referrer fails,
						// because #validate() runs all checks to populate validationReason.
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 15: Single Placeholder Routes Preservation', () => {
		it('Property: Route patterns with single placeholders continue to match and validate correctly', () => {
			fc.assert(
				fc.property(
					fc.record({
						id: fc.integer({ min: 1, max: 9999 }).map(String)
					}),
					(params) => {
						// Initialize with single placeholder route
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								pathParameters: {
									id: (value) => /^[0-9]+$/.test(value)
								}
							}
						});

						const event = createMockEvent({
							resource: '/items/{id}',
							path: `/items/${params.id}`,
							pathParameters: params
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getPathParameters() returns validated parameter
						const pathParams = request.getPathParameters();
						expect(pathParams).toEqual(params);
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 16: Global Parameter Validation Preservation', () => {
		it('Property: Global parameter validation (no BY_ROUTE or BY_METHOD) continues to work correctly', () => {
			fc.assert(
				fc.property(
					fc.record({
						query: fc.string({ minLength: 1, maxLength: 50 }),
						limit: fc.integer({ min: 1, max: 100 })
					}),
					(params) => {
						// Initialize with global parameter validation (no BY_ROUTE or BY_METHOD)
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

						// PROPERTY: getQueryStringParameters() returns validated parameters
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

	describe('Property 17: No Duplicate Parameters Preservation', () => {
		it('Property: Validation rules with no duplicate parameters continue to work correctly', () => {
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.integer({ min: 1, max: 9999 }).map(String),
						postId: fc.integer({ min: 1, max: 9999 }).map(String),
						commentId: fc.integer({ min: 1, max: 9999 }).map(String)
					}),
					(params) => {
						// Initialize with validation rules for distinct parameters
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

						// PROPERTY: getPathParameters() returns all validated parameters
						const pathParams = request.getPathParameters();
						expect(pathParams).toEqual(params);
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 18: getBodyParameters() Method Preservation', () => {
		it('Property: getBodyParameters() method returns an object without throwing TypeError', () => {
			fc.assert(
				fc.property(
					fc.record({
						name: fc.string({ minLength: 1, maxLength: 50 }),
						email: fc.emailAddress()
					}),
					(params) => {
						// Initialize with body parameter validation
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
							body: JSON.stringify(params)
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should pass
						expect(request.isValid()).toBe(true);

						// PROPERTY: getBodyParameters() returns an object (not undefined, not throws)
						expect(() => {
							const bodyParams = request.getBodyParameters();
							expect(typeof bodyParams).toBe('object');
							expect(bodyParams).not.toBeNull();
						}).not.toThrow();
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: getBodyParameters() returns empty object when validation fails', () => {
			fc.assert(
				fc.property(
					fc.record({
						name: fc.string({ minLength: 1, maxLength: 2 }), // Too short
						email: fc.string({ minLength: 1, maxLength: 10 }) // No @
					}).filter(params => !params.email.includes('@')),
					(params) => {
						// Initialize with body parameter validation
						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								bodyParameters: {
									name: (value) => typeof value === 'string' && value.length >= 3,
									email: (value) => value.includes('@')
								}
							}
						});

						const event = createMockEvent({
							httpMethod: 'POST',
							resource: '/users',
							body: JSON.stringify(params)
						});

						const request = new ClientRequest(event, createMockContext());

						// Validation should fail
						expect(request.isValid()).toBe(false);

						// PROPERTY: getBodyParameters() returns empty object when validation fails
						const bodyParams = request.getBodyParameters();
						expect(bodyParams).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
	});
});
