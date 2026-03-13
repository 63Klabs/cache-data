import { describe, it, expect, beforeAll } from '@jest/globals';

/**
 * Integration Tests: Real-World Scenarios
 * 
 * These tests validate the enhanced validation system with realistic API Gateway
 * event structures and common API patterns. They demonstrate how the validation
 * system handles real-world use cases including:
 * 
 * - Product API with different validation per route
 * - RESTful API with method-specific validation
 * - Search API with multi-parameter validation
 * - Game API with method-and-route validation
 * - Error handling scenarios
 * - excludeParamsWithNoValidationMatch flag behavior
 * 
 * Test Coverage:
 * - Realistic API Gateway event structures
 * - Complex validation scenarios
 * - Error handling and edge cases
 * - All validation priority levels
 * - Multi-parameter validation
 * 
 * Requirements Validated: All requirements (comprehensive integration)
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

describe('ClientRequest - Real-World Scenarios Integration Tests', () => {
	let ClientRequest;

	beforeAll(async () => {
		// Dynamic import to get fresh module
		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
		ClientRequest = module.default;
	});

	describe('Scenario 1: Product API with Different Validation per Route', () => {
		it('should validate product IDs with P- prefix', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric only
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

			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/P-12345',
				pathParameters: { id: 'P-12345' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P-12345' });
		});

		it('should validate employee IDs with E- prefix', () => {
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
								route: 'employee/{id}',
								validate: (value) => /^E-[0-9]+$/.test(value)
							},
							{
								route: 'order/{id}',
								validate: (value) => /^ORD-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/employee/{id}',
				path: '/employee/E-67890',
				pathParameters: { id: 'E-67890' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'E-67890' });
		});

		it('should validate order IDs with ORD- prefix', () => {
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
								route: 'employee/{id}',
								validate: (value) => /^E-[0-9]+$/.test(value)
							},
							{
								route: 'order/{id}',
								validate: (value) => /^ORD-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/order/{id}',
				path: '/order/ORD-99999',
				pathParameters: { id: 'ORD-99999' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'ORD-99999' });
		});

		it('should reject product ID without P- prefix', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/12345',
				pathParameters: { id: '12345' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should use global validation for unmatched routes', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^P-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/customer/{id}',
				path: '/customer/12345',
				pathParameters: { id: '12345' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '12345' });
		});
	});

	describe('Scenario 2: RESTful API with Method-Specific Validation', () => {
		it('should apply stricter validation for POST requests', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									// POST requires positive integer > 0
									return /^[0-9]+$/.test(value) && parseInt(value) > 0;
								}
							},
							{
								method: 'GET',
								validate: (value) => /^[0-9]+$/.test(value) // GET allows any numeric
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
		});

		it('should reject POST with id=0', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									return /^[0-9]+$/.test(value) && parseInt(value) > 0;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/users/{id}',
				path: '/users/0',
				pathParameters: { id: '0' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should allow GET with any numeric id', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									return /^[0-9]+$/.test(value) && parseInt(value) > 0;
								}
							},
							{
								method: 'GET',
								validate: (value) => /^[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/users/{id}',
				path: '/users/0',
				pathParameters: { id: '0' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '0' });
		});

		it('should validate body parameters differently for POST vs PUT', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					bodyParameters: {
						name: (value) => typeof value === 'string' && value.length > 0,
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									// POST requires name length >= 3
									return typeof value === 'string' && value.length >= 3;
								}
							},
							{
								method: 'PUT',
								validate: (value) => {
									// PUT allows any non-empty string
									return typeof value === 'string' && value.length > 0;
								}
							}
						]
					}
				}
			});

			// POST with short name should fail
			const postEvent = createMockEvent({
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				body: JSON.stringify({ name: 'AB' })
			});

			const postRequest = new ClientRequest(postEvent, createMockContext());
			expect(postRequest.isValid()).toBe(false);

			// PUT with short name should succeed
			const putEvent = createMockEvent({
				httpMethod: 'PUT',
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				body: JSON.stringify({ name: 'AB' })
			});

			const putRequest = new ClientRequest(putEvent, createMockContext());
			expect(putRequest.isValid()).toBe(true);
		});
	});

	describe('Scenario 3: Search API with Multi-Parameter Validation', () => {
		it('should validate search query and limit together', () => {
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
									// Query must be non-empty
									if (!query || query.length === 0) return false;
									// Limit must be between 1 and 100
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

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({
				query: 'javascript',
				limit: '25'
			});
		});

		it('should reject search with limit > 100', () => {
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
									if (!query || query.length === 0) return false;
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
					limit: '200'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
		});

		it('should reject search with empty query', () => {
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
									if (!query || query.length === 0) return false;
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
					query: '',
					limit: '10'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
		});

		it('should handle missing limit parameter with default', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.length > 0,
						BY_ROUTE: [
							{
								route: 'search?query,limit',
								validate: ({ query, limit }) => {
									if (!query || query.length === 0) return false;
									// Use default limit of 10 if not provided
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
					query: 'javascript'
					// limit is missing
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({
				query: 'javascript'
			});
		});

		it('should validate pagination parameters together', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						page: (value) => !isNaN(value),
						limit: (value) => !isNaN(value),
						BY_ROUTE: [
							{
								route: 'users?page,limit',
								validate: ({ page, limit }) => {
									const pageNum = parseInt(page || '1');
									const limitNum = parseInt(limit || '10');
									// Page must be >= 1, limit must be 1-100
									return pageNum >= 1 && limitNum >= 1 && limitNum <= 100;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/users',
				path: '/users',
				queryStringParameters: {
					page: '2',
					limit: '50'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({
				page: '2',
				limit: '50'
			});
		});
	});

	describe('Scenario 4: Game API with Method-And-Route Validation', () => {
		it('should validate POST:join/{id} with GAME- prefix', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Global: numeric
						BY_ROUTE: [
							{
								route: 'POST:game/join/{id}',
								validate: (value) => {
									// POST to join requires GAME- prefix and positive ID
									if (!/^GAME-[0-9]+$/.test(value)) return false;
									const idNum = parseInt(value.split('-')[1]);
									return idNum > 0;
								}
							},
							{
								route: 'GET:game/join/{id}',
								validate: (value) => /^[0-9]+$/.test(value) // GET allows plain numeric
							},
							{
								route: 'game/join/{id}',
								validate: (value) => /^G-[0-9]+$/.test(value) // Other methods require G- prefix
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/game/join/{id}',
				path: '/game/join/GAME-12345',
				pathParameters: { id: 'GAME-12345' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'GAME-12345' });
		});

		it('should validate GET:join/{id} with plain numeric', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'POST:game/join/{id}',
								validate: (value) => {
									if (!/^GAME-[0-9]+$/.test(value)) return false;
									const idNum = parseInt(value.split('-')[1]);
									return idNum > 0;
								}
							},
							{
								route: 'GET:game/join/{id}',
								validate: (value) => /^[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/game/join/{id}',
				path: '/game/join/12345',
				pathParameters: { id: '12345' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '12345' });
		});

		it('should reject POST:join/{id} without GAME- prefix', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'POST:game/join/{id}',
								validate: (value) => {
									if (!/^GAME-[0-9]+$/.test(value)) return false;
									const idNum = parseInt(value.split('-')[1]);
									return idNum > 0;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/game/join/{id}',
				path: '/game/join/12345',
				pathParameters: { id: '12345' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should validate DELETE:game/{id} with different rules', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'POST:game/join/{id}',
								validate: (value) => /^GAME-[0-9]+$/.test(value)
							},
							{
								route: 'DELETE:game/{id}',
								validate: (value) => {
									// DELETE requires GAME- prefix and admin permission check
									return /^GAME-[0-9]+$/.test(value);
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'DELETE',
				resource: '/game/{id}',
				path: '/game/GAME-99999',
				pathParameters: { id: 'GAME-99999' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'GAME-99999' });
		});
	});

	describe('Scenario 5: Error Handling Scenarios', () => {
		it('should handle validation function that throws error', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => {
							if (value === 'throw-error') {
								throw new Error('Validation error');
							}
							return /^[0-9]+$/.test(value);
						}
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{id}',
				path: '/users/throw-error',
				pathParameters: { id: 'throw-error' }
			});

			const request = new ClientRequest(event, createMockContext());

			// Should mark request as invalid when validation throws
			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should handle missing parameters gracefully', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' }
				// queryStringParameters is missing
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
			expect(request.getQueryStringParameters()).toEqual({});
		});

		it('should handle null parameter values', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						filter: (value) => value !== null && value.length > 0
					}
				}
			});

			const event = createMockEvent({
				resource: '/users',
				path: '/users',
				queryStringParameters: { filter: null }
			});

			const request = new ClientRequest(event, createMockContext());

			// Null value should fail validation
			expect(request.isValid()).toBe(false);
		});

		it('should handle undefined parameter values in multi-parameter validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value && value.length > 0,
						BY_ROUTE: [
							{
								route: 'search?query,limit',
								validate: ({ query, limit }) => {
									// Handle undefined limit gracefully
									if (!query || query.length === 0) return false;
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
					query: 'test'
					// limit is undefined
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ query: 'test' });
		});

		it('should handle validation function returning non-boolean', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => value // Returns the value itself (truthy/falsy)
					}
				}
			});

			// Truthy value should pass
			const validEvent = createMockEvent({
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' }
			});

			const validRequest = new ClientRequest(validEvent, createMockContext());
			expect(validRequest.isValid()).toBe(true);

			// Empty string (falsy) should fail
			const invalidEvent = createMockEvent({
				resource: '/users/{id}',
				path: '/users/',
				pathParameters: { id: '' }
			});

			const invalidRequest = new ClientRequest(invalidEvent, createMockContext());
			expect(invalidRequest.isValid()).toBe(false);
		});

		it('should stop validation on first failure', () => {
			let param1Validated = false;
			let param2Validated = false;

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						param1: (value) => {
							param1Validated = true;
							return false; // Fail immediately
						},
						param2: (value) => {
							param2Validated = true;
							return true;
						}
					}
				}
			});

			const event = createMockEvent({
				resource: '/test',
				path: '/test',
				queryStringParameters: {
					param1: 'value1',
					param2: 'value2'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(param1Validated).toBe(true);
			// param2 should not be validated due to early exit
			expect(param2Validated).toBe(false);
		});
	});

	describe('Scenario 6: excludeParamsWithNoValidationMatch Flag Behavior', () => {
		it('should exclude unvalidated parameters by default', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0
					}
				}
			});

			const event = createMockEvent({
				resource: '/users',
				path: '/users',
				queryStringParameters: {
					limit: '10',
					page: '1',      // No validation rule
					sort: 'name',   // No validation rule
					filter: 'active' // No validation rule
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			const queryParams = request.getQueryStringParameters();
			expect(queryParams).toEqual({ limit: '10' });
			expect(queryParams.page).toBeUndefined();
			expect(queryParams.sort).toBeUndefined();
			expect(queryParams.filter).toBeUndefined();
		});

		it('should include unvalidated parameters when flag is false', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false,
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0
					}
				}
			});

			const event = createMockEvent({
				resource: '/users',
				path: '/users',
				queryStringParameters: {
					limit: '10',
					page: '1',
					sort: 'name',
					filter: 'active'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({
				limit: '10',
				page: '1',
				sort: 'name',
				filter: 'active'
			});
		});

		it('should exclude unvalidated parameters with BY_ROUTE', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.length > 0,
						BY_ROUTE: [
							{
								route: 'search?query',
								validate: (value) => value.length >= 3
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
					limit: '10',    // No validation rule
					page: '1'       // No validation rule
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			const queryParams = request.getQueryStringParameters();
			expect(queryParams).toEqual({ query: 'test' });
			expect(queryParams.limit).toBeUndefined();
			expect(queryParams.page).toBeUndefined();
		});

		it('should include unvalidated parameters with flag false and BY_ROUTE', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false,
					queryParameters: {
						query: (value) => value.length > 0,
						BY_ROUTE: [
							{
								route: 'search?query',
								validate: (value) => value.length >= 3
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
					limit: '10',
					page: '1'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({
				query: 'test',
				limit: '10',
				page: '1'
			});
		});

		it('should handle mixed validated and unvalidated parameters', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					queryParameters: {
						limit: (value) => !isNaN(value)
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				queryStringParameters: {
					limit: '10',
					page: '1',      // No validation rule
					sort: 'name'    // No validation rule
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
			expect(request.getQueryStringParameters()).toEqual({ limit: '10' });
		});
	});

	describe('Scenario 7: Complex Real-World API Gateway Events', () => {
		it('should handle complete API Gateway event structure', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value),
						postId: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'users/{userId}/posts/{postId}',
								validate: ({ userId, postId }) => {
									return /^[0-9]+$/.test(userId) && parseInt(userId) > 0 &&
									       /^[0-9]+$/.test(postId) && parseInt(postId) > 0;
								}
							}
						]
					},
					queryParameters: {
						limit: (value) => !isNaN(value),
						BY_ROUTE: [
							{
								route: 'users/{userId}/posts/{postId}?limit',
								validate: ({ limit }) => {
									const num = parseInt(limit || '10');
									return num >= 1 && num <= 50;
								}
							}
						]
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
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
				},
				queryStringParameters: {
					limit: '20'
				},
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer token123',
					'Content-Type': 'application/json'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				userId: '123',
				postId: '456'
			});
			expect(request.getQueryStringParameters()).toEqual({ limit: '20' });
			expect(request.getHeaderParameters()).toEqual({ authorization: 'Bearer token123' });
		});

		it('should handle API Gateway event with body parameters', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					bodyParameters: {
						name: (value) => typeof value === 'string' && value.length > 0,
						email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				body: JSON.stringify({
					name: 'John Doe',
					email: 'john@example.com',
					age: 30
				})
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			const bodyParams = request.getBodyParameters();
			expect(bodyParams.name).toBe('John Doe');
			expect(bodyParams.email).toBe('john@example.com');
		});

		it('should handle API Gateway event with all parameter types', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					queryParameters: {
						limit: (value) => !isNaN(value)
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
					},
					bodyParameters: {
						name: (value) => typeof value === 'string' && value.length > 0
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'PUT',
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				queryStringParameters: { limit: '10' },
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer token123'
				},
				body: JSON.stringify({ name: 'Updated Name' })
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
			expect(request.getQueryStringParameters()).toEqual({ limit: '10' });
			expect(request.getHeaderParameters()).toEqual({ authorization: 'Bearer token123' });
			expect(request.getBodyParameters().name).toBe('Updated Name');
		});

		it('should handle API Gateway event with case-insensitive headers', () => {
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
				resource: '/users',
				path: '/users',
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer token123',
					'Content-Type': 'application/json'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			const headerParams = request.getHeaderParameters();
			expect(headerParams.authorization).toBe('Bearer token123');
			expect(headerParams.contentType).toBe('application/json');
		});
	});

	describe('Scenario 8: Edge Cases and Boundary Conditions', () => {
		it('should handle empty validation configuration', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {},
					queryParameters: {}
				}
			});

			const event = createMockEvent({
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				queryStringParameters: { limit: '10' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			// No validation rules, so parameters are excluded by default
			expect(request.getPathParameters()).toEqual({});
			expect(request.getQueryStringParameters()).toEqual({});
		});

		it('should handle very long parameter values', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.length > 0 && value.length <= 1000
					}
				}
			});

			const longQuery = 'a'.repeat(500);
			const event = createMockEvent({
				resource: '/search',
				path: '/search',
				queryStringParameters: { query: longQuery }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ query: longQuery });
		});

		it('should handle special characters in parameter values', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.length > 0
					}
				}
			});

			const specialQuery = 'test & query | special <> chars';
			const event = createMockEvent({
				resource: '/search',
				path: '/search',
				queryStringParameters: { query: specialQuery }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ query: specialQuery });
		});

		it('should handle numeric string vs number comparison', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => {
							// Ensure proper numeric comparison
							const num = parseInt(value);
							return !isNaN(num) && num > 0 && num <= 100;
						}
					}
				}
			});

			const event = createMockEvent({
				resource: '/users',
				path: '/users',
				queryStringParameters: { limit: '50' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ limit: '50' });
		});
	});
});
