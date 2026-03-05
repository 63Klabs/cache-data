import { describe, it, expect, beforeAll } from '@jest/globals';

/**
 * Integration Tests: BY_METHOD Validation Configurations
 * 
 * These tests verify that method-specific validations work correctly in ClientRequest.
 * They test the priority system where method-specific validations (Priority 3) override
 * global validations but are overridden by route-specific validations.
 * 
 * Test Coverage:
 * - Method-only patterns (Priority 3)
 * - Method-specific validations overriding global validations
 * - Method-specific validations being overridden by route-specific validations
 * - Case-insensitive method matching
 * - All HTTP methods (GET, POST, PUT, DELETE, PATCH, OPTIONS)
 * 
 * Requirements Validated: 3.1-3.5, 4.5
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

describe('ClientRequest - BY_METHOD Integration Tests', () => {
	let ClientRequest;

	beforeAll(async () => {
		// Dynamic import to get fresh module
		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
		ClientRequest = module.default;
	});

	describe('Method-Only Patterns (Priority 3)', () => {
		it('should apply method-specific validation for matching HTTP method', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric only
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^[A-Z0-9-]+$/.test(value) // POST: alphanumeric with dash
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/users/{id}',
				path: '/users/ABC-123',
				pathParameters: { id: 'ABC-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'ABC-123' });
		});

		it('should reject value that fails method-specific validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric only
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^NEW-[0-9]+$/.test(value) // POST: must start with NEW-
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/users/{id}',
				path: '/users/123', // Missing NEW- prefix
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should fall back to global validation for non-matching method', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric only
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^NEW-[0-9]+$/.test(value) // POST: must start with NEW-
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
		});
	});

	describe('Method-Specific Validations Override Global', () => {
		it('should use method-specific validation instead of global', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) <= 100, // Global: max 100
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => !isNaN(value) && parseInt(value) <= 1000 // POST: max 1000
							}
						]
					}
				}
			});

			// POST allows up to 1000
			const postEvent = createMockEvent({
				httpMethod: 'POST',
				queryStringParameters: { limit: '500' }
			});
			const postRequest = new ClientRequest(postEvent, createMockContext());
			expect(postRequest.isValid()).toBe(true);
			expect(postRequest.getQueryStringParameters()).toEqual({ limit: '500' });

			// GET uses global validation (max 100)
			const getEvent = createMockEvent({
				httpMethod: 'GET',
				queryStringParameters: { limit: '500' }
			});
			const getRequest = new ClientRequest(getEvent, createMockContext());
			expect(getRequest.isValid()).toBe(false);
		});

		it('should apply different validations for different methods', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^NEW-[0-9]+$/.test(value) // POST: NEW- prefix
							},
							{
								method: 'PUT',
								validate: (value) => /^UPD-[0-9]+$/.test(value) // PUT: UPD- prefix
							},
							{
								method: 'DELETE',
								validate: (value) => /^DEL-[0-9]+$/.test(value) // DELETE: DEL- prefix
							}
						]
					}
				}
			});

			// POST requires NEW- prefix
			const postEvent = createMockEvent({
				httpMethod: 'POST',
				resource: '/items/{id}',
				pathParameters: { id: 'NEW-123' }
			});
			const postRequest = new ClientRequest(postEvent, createMockContext());
			expect(postRequest.isValid()).toBe(true);

			// PUT requires UPD- prefix
			const putEvent = createMockEvent({
				httpMethod: 'PUT',
				resource: '/items/{id}',
				pathParameters: { id: 'UPD-456' }
			});
			const putRequest = new ClientRequest(putEvent, createMockContext());
			expect(putRequest.isValid()).toBe(true);

			// DELETE requires DEL- prefix
			const deleteEvent = createMockEvent({
				httpMethod: 'DELETE',
				resource: '/items/{id}',
				pathParameters: { id: 'DEL-789' }
			});
			const deleteRequest = new ClientRequest(deleteEvent, createMockContext());
			expect(deleteRequest.isValid()).toBe(true);

			// GET uses global validation (numeric only)
			const getEvent = createMockEvent({
				httpMethod: 'GET',
				resource: '/items/{id}',
				pathParameters: { id: '999' }
			});
			const getRequest = new ClientRequest(getEvent, createMockContext());
			expect(getRequest.isValid()).toBe(true);
		});
	});

	describe('Route-Specific Validations Override Method-Specific', () => {
		it('should use route-specific validation instead of method-specific', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^NEW-[0-9]+$/.test(value) // POST: NEW- prefix
							}
						],
						BY_ROUTE: [
							{
								route: 'special/{id}',
								validate: (value) => /^SPECIAL-[0-9]+$/.test(value) // Route: SPECIAL- prefix
							}
						]
					}
				}
			});

			// Route-specific validation takes precedence over method-specific
			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/special/{id}',
				path: '/special/SPECIAL-123',
				pathParameters: { id: 'SPECIAL-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'SPECIAL-123' });
		});

		it('should reject value that passes method validation but fails route validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^NEW-[0-9]+$/.test(value) // POST: NEW- prefix
							}
						],
						BY_ROUTE: [
							{
								route: 'special/{id}',
								validate: (value) => /^SPECIAL-[0-9]+$/.test(value) // Route: SPECIAL- prefix
							}
						]
					}
				}
			});

			// NEW-123 passes method validation but fails route validation
			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/special/{id}',
				path: '/special/NEW-123',
				pathParameters: { id: 'NEW-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should use method-specific validation for non-matching routes', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^NEW-[0-9]+$/.test(value) // POST: NEW- prefix
							}
						],
						BY_ROUTE: [
							{
								route: 'special/{id}',
								validate: (value) => /^SPECIAL-[0-9]+$/.test(value) // Route: SPECIAL- prefix
							}
						]
					}
				}
			});

			// Different route, so method-specific validation applies
			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/regular/{id}',
				path: '/regular/NEW-123',
				pathParameters: { id: 'NEW-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'NEW-123' });
		});
	});

	describe('Case-Insensitive Method Matching', () => {
		it('should match method case-insensitively (lowercase in config)', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'post', // Lowercase
								validate: (value) => /^NEW-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST', // Uppercase
				resource: '/items/{id}',
				pathParameters: { id: 'NEW-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'NEW-123' });
		});

		it('should match method case-insensitively (uppercase in config)', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'POST', // Uppercase
								validate: (value) => /^NEW-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'post', // Lowercase
				resource: '/items/{id}',
				pathParameters: { id: 'NEW-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'NEW-123' });
		});

		it('should match method case-insensitively (mixed case)', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'PoSt', // Mixed case
								validate: (value) => /^NEW-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST', // Uppercase
				resource: '/items/{id}',
				pathParameters: { id: 'NEW-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'NEW-123' });
		});
	});

	describe('All HTTP Methods', () => {
		it('should support GET method validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => !isNaN(value),
						BY_METHOD: [
							{
								method: 'GET',
								validate: (value) => !isNaN(value) && parseInt(value) <= 100
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				queryStringParameters: { limit: '50' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ limit: '50' });
		});

		it('should support POST method validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^NEW-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/items/{id}',
				pathParameters: { id: 'NEW-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'NEW-123' });
		});

		it('should support PUT method validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'PUT',
								validate: (value) => /^UPD-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'PUT',
				resource: '/items/{id}',
				pathParameters: { id: 'UPD-456' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'UPD-456' });
		});

		it('should support DELETE method validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'DELETE',
								validate: (value) => /^DEL-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'DELETE',
				resource: '/items/{id}',
				pathParameters: { id: 'DEL-789' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'DEL-789' });
		});

		it('should support PATCH method validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'PATCH',
								validate: (value) => /^PATCH-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'PATCH',
				resource: '/items/{id}',
				pathParameters: { id: 'PATCH-111' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'PATCH-111' });
		});

		it('should support OPTIONS method validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					headerParameters: {
						'access-control-request-method': (value) => value.length > 0, // Global validation
						BY_METHOD: [
							{
								method: 'OPTIONS',
								validate: (value) => {
									// For OPTIONS method, validate that value is a valid HTTP method
									return ['GET', 'POST', 'PUT', 'DELETE'].includes(value);
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'OPTIONS',
				headers: {
					'Access-Control-Request-Method': 'POST'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getHeaderParameters()).toEqual({ 
				'accessControlRequestMethod': 'POST' // Header names are converted to camelCase
			});
		});
	});

	describe('Real-World Scenarios', () => {
		it('should handle RESTful API with different validation per method', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => value === 'new' || /^[0-9]+$/.test(value) // POST: 'new' or numeric
							},
							{
								method: 'PUT',
								validate: (value) => /^[0-9]+$/.test(value) && parseInt(value) > 0 // PUT: positive numeric
							},
							{
								method: 'DELETE',
								validate: (value) => /^[0-9]+$/.test(value) && parseInt(value) > 0 // DELETE: positive numeric
							}
						]
					}
				}
			});

			// POST allows 'new' for creating resources
			const postEvent = createMockEvent({
				httpMethod: 'POST',
				resource: '/items/{id}',
				pathParameters: { id: 'new' }
			});
			const postRequest = new ClientRequest(postEvent, createMockContext());
			expect(postRequest.isValid()).toBe(true);

			// PUT requires positive numeric ID
			const putEvent = createMockEvent({
				httpMethod: 'PUT',
				resource: '/items/{id}',
				pathParameters: { id: '123' }
			});
			const putRequest = new ClientRequest(putEvent, createMockContext());
			expect(putRequest.isValid()).toBe(true);

			// DELETE requires positive numeric ID
			const deleteEvent = createMockEvent({
				httpMethod: 'DELETE',
				resource: '/items/{id}',
				pathParameters: { id: '456' }
			});
			const deleteRequest = new ClientRequest(deleteEvent, createMockContext());
			expect(deleteRequest.isValid()).toBe(true);

			// GET uses global validation (any numeric)
			const getEvent = createMockEvent({
				httpMethod: 'GET',
				resource: '/items/{id}',
				pathParameters: { id: '789' }
			});
			const getRequest = new ClientRequest(getEvent, createMockContext());
			expect(getRequest.isValid()).toBe(true);
		});

		it('should handle pagination with method-specific limits', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0, // Global: positive number
						BY_METHOD: [
							{
								method: 'GET',
								validate: (value) => !isNaN(value) && parseInt(value) >= 1 && parseInt(value) <= 100
							},
							{
								method: 'POST',
								validate: (value) => !isNaN(value) && parseInt(value) >= 1 && parseInt(value) <= 1000
							}
						]
					}
				}
			});

			// GET has lower limit (100)
			const getEvent = createMockEvent({
				httpMethod: 'GET',
				queryStringParameters: { limit: '50' }
			});
			const getRequest = new ClientRequest(getEvent, createMockContext());
			expect(getRequest.isValid()).toBe(true);

			// POST has higher limit (1000)
			const postEvent = createMockEvent({
				httpMethod: 'POST',
				queryStringParameters: { limit: '500' }
			});
			const postRequest = new ClientRequest(postEvent, createMockContext());
			expect(postRequest.isValid()).toBe(true);

			// GET rejects values over 100
			const getHighEvent = createMockEvent({
				httpMethod: 'GET',
				queryStringParameters: { limit: '500' }
			});
			const getHighRequest = new ClientRequest(getHighEvent, createMockContext());
			expect(getHighRequest.isValid()).toBe(false);
		});

		it('should handle CORS preflight with OPTIONS method', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					headerParameters: {
						'access-control-request-method': (value) => value.length > 0,
						BY_METHOD: [
							{
								method: 'OPTIONS',
								validate: (value) => {
									// For OPTIONS method, validate that value is a valid HTTP method
									return ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(value);
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'OPTIONS',
				headers: {
					'Access-Control-Request-Method': 'POST'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getHeaderParameters()).toEqual({
				'accessControlRequestMethod': 'POST' // Header names are converted to camelCase
			});
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty BY_METHOD array', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: []
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/items/{id}',
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
		});

		it('should handle multiple BY_METHOD entries for same method (first match wins)', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^FIRST-[0-9]+$/.test(value) // First rule
							},
							{
								method: 'POST',
								validate: (value) => /^SECOND-[0-9]+$/.test(value) // Second rule (should not be used)
							}
						]
					}
				}
			});

			// Should use first matching rule
			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/items/{id}',
				pathParameters: { id: 'FIRST-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'FIRST-123' });
		});

		it('should handle validation function that returns truthy/falsy values', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => value // Returns the value itself (truthy)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/items/{id}',
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
		});

		it('should handle method validation with query parameters', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						action: (value) => value.length > 0,
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => ['create', 'update', 'delete'].includes(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				queryStringParameters: { action: 'create' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ action: 'create' });
		});

		it('should handle method validation with header parameters', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					headerParameters: {
						'content-type': (value) => value.length > 0,
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									// For POST method, validate that content-type starts with application/json
									return value.startsWith('application/json');
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				headers: {
					'Content-Type': 'application/json; charset=utf-8'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getHeaderParameters()).toEqual({ 
				'contentType': 'application/json; charset=utf-8' // Header names are converted to camelCase
			});
		});
	});
});
