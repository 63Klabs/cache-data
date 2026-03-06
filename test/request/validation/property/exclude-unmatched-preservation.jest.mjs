/**
 * Property-Based Preservation Test: Exclude Unmatched Parameters Behavior
 * 
 * Property 2: Preservation - Exclude Unmatched Parameters Behavior Unchanged
 * 
 * METHODOLOGY: Observation-First
 * - Observe behavior on UNFIXED code when excludeParamsWithNoValidationMatch is true (default)
 * - Write tests that PASS on unfixed code
 * - These tests confirm baseline behavior to preserve during bug fixes
 * 
 * EXPECTED OUTCOME: All tests PASS on unfixed code
 * 
 * OBSERVATION: On unfixed code, when excludeParamsWithNoValidationMatch is true (default),
 * parameters without validation rules are excluded from getPathParameters(), 
 * getQueryStringParameters(), and getHeaderParameters() results. This is the baseline 
 * behavior to preserve.
 * 
 * NOTE: This test validates the excludeParamsWithNoValidationMatch flag behavior,
 * which is critical for backwards compatibility.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import ClientRequest class
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

// Mock Lambda context
const mockContext = {
	getRemainingTimeInMillis: () => 30000
};

describe('Property 2: Exclude Unmatched Parameters Preservation', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Unit Tests - Baseline Behavior (Default: excludeParamsWithNoValidationMatch=true)', () => {
		
		it('should exclude path parameters without validation rules (default behavior)', () => {
			// Arrange: No validation rules for path parameters
			const event = {
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: {
					id: '123'
				},
				queryStringParameters: null,
				headers: {},
				body: null
			};
			
			const validations = {};
			
			// Act
			const request = new ClientRequest(event, mockContext, validations);
			const pathParams = request.getPathParameters();
			
			// Assert: Parameters without validation rules are excluded (default behavior)
			expect(request.isValid()).toBe(true);
			expect(pathParams).toEqual({});
		});
		
		it('should exclude query parameters without validation rules (default behavior)', () => {
			// Arrange: No validation rules for query parameters
			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: null,
				queryStringParameters: {
					query: 'test',
					limit: '10',
					page: '1'
				},
				headers: {},
				body: null
			};
			
			const validations = {};
			
			// Act
			const request = new ClientRequest(event, mockContext, validations);
			const queryParams = request.getQueryStringParameters();
			
			// Assert: Parameters without validation rules are excluded
			expect(request.isValid()).toBe(true);
			expect(queryParams).toEqual({});
		});
		
		it('should exclude header parameters without validation rules (default behavior)', () => {
			// Arrange: No validation rules for header parameters
			const event = {
				httpMethod: 'GET',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: null,
				queryStringParameters: null,
				headers: {
					'content-type': 'application/json',
					'authorization': 'Bearer token123',
					'x-custom-header': 'value'
				},
				body: null
			};
			
			const validations = {};
			
			// Act
			const request = new ClientRequest(event, mockContext, validations);
			const headerParams = request.getHeaderParameters();
			
			// Assert: Parameters without validation rules are excluded
			expect(request.isValid()).toBe(true);
			expect(headerParams).toEqual({});
		});
		
		it('should include validated parameters and exclude unvalidated ones', () => {
			// Arrange: Validation rule for 'id' but not for 'category'
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/product/{id}/{category}',
				path: '/product/123/electronics',
				pathParameters: {
					id: '123',
					category: 'electronics'
				},
				queryStringParameters: null,
				headers: {},
				body: null
			};
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const pathParams = request.getPathParameters();
			
			// Assert: Only validated parameter is included
			expect(request.isValid()).toBe(true);
			expect(pathParams).toEqual({ id: '123' });
			expect(pathParams).not.toHaveProperty('category');
		});
		
		it('should include validated query params and exclude unvalidated ones', () => {
			// Arrange: Validation rule for 'limit' but not for 'page' or 'sort'
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						limit: (value) => {
							const num = parseInt(value, 10);
							return !isNaN(num) && num > 0 && num <= 100;
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: null,
				queryStringParameters: {
					limit: '50',
					page: '2',
					sort: 'name'
				},
				headers: {},
				body: null
			};
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const queryParams = request.getQueryStringParameters();
			
			// Assert: Only validated parameter is included
			expect(request.isValid()).toBe(true);
			expect(queryParams).toEqual({ limit: '50' });
			expect(queryParams).not.toHaveProperty('page');
			expect(queryParams).not.toHaveProperty('sort');
		});
		
		it('should include validated headers and exclude unvalidated ones', () => {
			// Arrange: Validation rule for 'contentType' but not for 'authorization'
			ClientRequest.init({
				parameters: {
					headerParameters: {
						contentType: (value) => value === 'application/json'
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: null,
				queryStringParameters: null,
				headers: {
					'content-type': 'application/json',
					'authorization': 'Bearer token123',
					'x-request-id': 'abc-123'
				},
				body: null
			};
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const headerParams = request.getHeaderParameters();
			
			// Assert: Only validated parameter is included
			expect(request.isValid()).toBe(true);
			expect(headerParams).toEqual({ contentType: 'application/json' });
			expect(headerParams).not.toHaveProperty('authorization');
			expect(headerParams).not.toHaveProperty('xRequestId');
		});
		
		it('should exclude all parameters when no validation rules exist', () => {
			// Arrange: No validation rules at all
			ClientRequest.init({
				parameters: {}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: {
					id: '123'
				},
				queryStringParameters: {
					search: 'test',
					limit: '10'
				},
				headers: {
					'content-type': 'application/json'
				},
				body: null
			};
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: All parameters are excluded when no validation rules
			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({});
			expect(request.getQueryStringParameters()).toEqual({});
			expect(request.getHeaderParameters()).toEqual({});
		});
		
		it('should handle route-specific validation with unmatched parameters', () => {
			// Arrange: Route-specific validation for 'id' on specific route
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
				path: '/product/123',
				pathParameters: {
					id: '123'
				},
				queryStringParameters: {
					includeDetails: 'true'  // No validation rule
				},
				headers: {},
				body: null
			};
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validated path param included, unvalidated query param excluded
			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
			expect(request.getQueryStringParameters()).toEqual({});
		});
		
		it('should handle method-specific validation with unmatched parameters', () => {
			// Arrange: Method-specific validation for POST requests
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^[0-9]+$/.test(value)
							}
						]
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/456',
				pathParameters: {
					id: '456'
				},
				queryStringParameters: {
					action: 'update'  // No validation rule
				},
				headers: {},
				body: null
			};
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validated path param included, unvalidated query param excluded
			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '456' });
			expect(request.getQueryStringParameters()).toEqual({});
		});
	});
	
	describe('Property-Based Tests - Baseline Behavior', () => {
		
		it('Property: Unvalidated path parameters are excluded', () => {
			// Property: For all path parameters without validation rules,
			// getPathParameters() returns empty object (default behavior)
			
			fc.assert(
				fc.property(
					fc.record({
						id: fc.integer({ min: 1, max: 999999 }).map(n => n.toString()),
						category: fc.constantFrom('electronics', 'books', 'clothing', 'food'),
						subcategory: fc.constantFrom('phones', 'laptops', 'tablets')
					}),
					(pathParams) => {
						// Arrange: No validation rules
						ClientRequest.init({
							parameters: {}
						});
						
						const event = {
							httpMethod: 'GET',
							resource: '/product/{id}/{category}/{subcategory}',
							path: `/product/${pathParams.id}/${pathParams.category}/${pathParams.subcategory}`,
							pathParameters: pathParams,
							queryStringParameters: null,
							headers: {},
							body: null
						};
						
						// Act
						const request = new ClientRequest(event, mockContext);
						const result = request.getPathParameters();
						
						// Assert: All parameters excluded when no validation rules
						expect(request.isValid()).toBe(true);
						expect(result).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Unvalidated query parameters are excluded', () => {
			// Property: For all query parameters without validation rules,
			// getQueryStringParameters() returns empty object
			
			fc.assert(
				fc.property(
					fc.record({
						search: fc.string({ minLength: 1, maxLength: 50 }),
						limit: fc.integer({ min: 1, max: 100 }).map(n => n.toString()),
						page: fc.integer({ min: 1, max: 10 }).map(n => n.toString()),
						sort: fc.constantFrom('name', 'date', 'price')
					}),
					(queryParams) => {
						// Arrange: No validation rules
						ClientRequest.init({
							parameters: {}
						});
						
						const event = {
							httpMethod: 'GET',
							resource: '/search',
							path: '/search',
							pathParameters: null,
							queryStringParameters: queryParams,
							headers: {},
							body: null
						};
						
						// Act
						const request = new ClientRequest(event, mockContext);
						const result = request.getQueryStringParameters();
						
						// Assert: All parameters excluded when no validation rules
						expect(request.isValid()).toBe(true);
						expect(result).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Only validated parameters are included, unvalidated excluded', () => {
			// Property: For all parameter sets with mixed validation,
			// only validated parameters appear in results
			
			fc.assert(
				fc.property(
					fc.record({
						validatedId: fc.integer({ min: 1, max: 999999 }).map(n => n.toString()),
						unvalidatedCategory: fc.constantFrom('electronics', 'books', 'clothing')
					}),
					(params) => {
						// Arrange: Validation rule only for 'id'
						ClientRequest.init({
							parameters: {
								pathParameters: {
									id: (value) => /^[0-9]+$/.test(value)
								}
							}
						});
						
						const event = {
							httpMethod: 'GET',
							resource: '/product/{id}/{category}',
							path: `/product/${params.validatedId}/${params.unvalidatedCategory}`,
							pathParameters: {
								id: params.validatedId,
								category: params.unvalidatedCategory
							},
							queryStringParameters: null,
							headers: {},
							body: null
						};
						
						// Act
						const request = new ClientRequest(event, mockContext);
						const result = request.getPathParameters();
						
						// Assert: Only validated parameter included
						expect(request.isValid()).toBe(true);
						expect(result).toEqual({ id: params.validatedId });
						expect(result).not.toHaveProperty('category');
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Multiple validated params included, unvalidated excluded', () => {
			// Property: For all parameter sets with multiple validations,
			// all validated parameters appear, unvalidated do not
			
			fc.assert(
				fc.property(
					fc.record({
						id: fc.integer({ min: 1, max: 999999 }).map(n => n.toString()),
						limit: fc.integer({ min: 1, max: 100 }).map(n => n.toString()),
						page: fc.integer({ min: 1, max: 10 }).map(n => n.toString()),
						sort: fc.constantFrom('name', 'date', 'price')
					}),
					(params) => {
						// Arrange: Validation rules for 'id' and 'limit', but not 'page' or 'sort'
						ClientRequest.init({
							parameters: {
								pathParameters: {
									id: (value) => /^[0-9]+$/.test(value)
								},
								queryStringParameters: {
									limit: (value) => {
										const num = parseInt(value, 10);
										return !isNaN(num) && num > 0 && num <= 100;
									}
								}
							}
						});
						
						const event = {
							httpMethod: 'GET',
							resource: '/items/{id}',
							path: `/items/${params.id}`,
							pathParameters: {
								id: params.id
							},
							queryStringParameters: {
								limit: params.limit,
								page: params.page,
								sort: params.sort
							},
							headers: {},
							body: null
						};
						
						// Act
						const request = new ClientRequest(event, mockContext);
						const pathResult = request.getPathParameters();
						const queryResult = request.getQueryStringParameters();
						
						// Assert: Only validated parameters included
						expect(request.isValid()).toBe(true);
						expect(pathResult).toEqual({ id: params.id });
						expect(queryResult).toEqual({ limit: params.limit });
						expect(queryResult).not.toHaveProperty('page');
						expect(queryResult).not.toHaveProperty('sort');
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Behavior consistent across different routes', () => {
			// Property: For all routes, unvalidated parameters are excluded consistently
			
			fc.assert(
				fc.property(
					fc.constantFrom('product', 'user', 'order', 'item', 'post'),
					fc.integer({ min: 1, max: 999999 }).map(n => n.toString()),
					fc.string({ minLength: 1, maxLength: 20 }),
					(routePrefix, id, extraParam) => {
						// Arrange: No validation rules
						ClientRequest.init({
							parameters: {}
						});
						
						const event = {
							httpMethod: 'GET',
							resource: `/${routePrefix}/{id}`,
							path: `/${routePrefix}/${id}`,
							pathParameters: {
								id: id
							},
							queryStringParameters: {
								extra: extraParam
							},
							headers: {},
							body: null
						};
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Behavior consistent across routes
						expect(request.isValid()).toBe(true);
						expect(request.getPathParameters()).toEqual({});
						expect(request.getQueryStringParameters()).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
	});
	
	describe('Edge Cases - Baseline Behavior', () => {
		
		it('should handle empty pathParameters object', () => {
			// Arrange: Empty pathParameters
			ClientRequest.init({
				parameters: {}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: {},
				queryStringParameters: null,
				headers: {},
				body: null
			};
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Empty object returned
			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({});
		});
		
		it('should handle null pathParameters', () => {
			// Arrange: Null pathParameters
			ClientRequest.init({
				parameters: {}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: null
			};
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Empty object returned
			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({});
		});
		
		it('should handle parameters with special characters (unvalidated)', () => {
			// Arrange: Parameters with special characters, no validation
			ClientRequest.init({
				parameters: {}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: null,
				queryStringParameters: {
					'query': 'test & special',
					'filter[status]': 'active',
					'sort.order': 'asc'
				},
				headers: {},
				body: null
			};
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: All excluded when no validation rules
			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({});
		});
		
		it('should handle case-insensitive header matching with exclusion', () => {
			// Arrange: Headers with various cases, no validation
			ClientRequest.init({
				parameters: {}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: null,
				queryStringParameters: null,
				headers: {
					'Content-Type': 'application/json',
					'X-Custom-Header': 'value',
					'authorization': 'Bearer token'
				},
				body: null
			};
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: All excluded when no validation rules
			expect(request.isValid()).toBe(true);
			expect(request.getHeaderParameters()).toEqual({});
		});
	});
});

/**
 * PRESERVATION DOCUMENTATION
 * 
 * This test suite validates the excludeParamsWithNoValidationMatch flag behavior on UNFIXED code.
 * This behavior MUST be preserved after implementing fixes for validation bugs.
 * 
 * Default Behavior (excludeParamsWithNoValidationMatch=true):
 * 
 * 1. Path parameters without validation rules are excluded from getPathParameters()
 * 2. Query parameters without validation rules are excluded from getQueryStringParameters()
 * 3. Header parameters without validation rules are excluded from getHeaderParameters()
 * 4. When validation rules exist for some parameters, only validated ones are included
 * 5. When no validation rules exist, all parameter getters return empty objects
 * 6. This behavior is consistent across all parameter types and routes
 * 
 * Property-Based Testing Coverage:
 * 
 * - Property 1: Unvalidated path parameters are excluded
 * - Property 2: Unvalidated query parameters are excluded
 * - Property 3: Only validated parameters are included, unvalidated excluded
 * - Property 4: Multiple validated params included, unvalidated excluded
 * - Property 5: Behavior consistent across different routes
 * 
 * These properties are tested across many generated inputs to ensure comprehensive coverage
 * of the excludeParamsWithNoValidationMatch flag behavior that must be preserved.
 * 
 * CRITICAL: This is the DEFAULT behavior and changing it would be a BREAKING CHANGE.
 * Any modifications to this behavior require a major version bump and migration guide.
 */
