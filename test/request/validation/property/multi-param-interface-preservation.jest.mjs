/**
 * Property-Based Preservation Test: Multi-Parameter Validation Interface
 * 
 * Property 2: Preservation - Multi-Parameter Validation Interface Unchanged
 * 
 * METHODOLOGY: Observation-First
 * - Observe behavior on UNFIXED code for multi-parameter validation functions
 * - Write tests that PASS on unfixed code
 * - These tests confirm baseline behavior to preserve during bug fixes
 * 
 * EXPECTED OUTCOME: All tests PASS on unfixed code
 * 
 * CRITICAL: This test MUST PASS on unfixed code - it confirms baseline behavior to preserve.
 * 
 * GOAL: Verify that for validation rules with multiple parameters (no duplicates),
 * an object with all parameter names as keys is passed to the validation function.
 * This is the current behavior that must be preserved after fixing bugs.
 * 
 * OBSERVATION: On unfixed code, when a validation rule has multiple parameters,
 * ValidationExecutor passes an object to the validation function:
 * - Single parameter: validateFn(value)
 * - Multiple parameters: validateFn({param1: value1, param2: value2})
 * 
 * This multi-parameter interface must be preserved after bug fixes.
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

describe('Property 2: Multi-Parameter Validation Interface Preservation', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Unit Tests - Multi-Parameter Interface', () => {
		
		it('should pass object to validation function for multiple path parameters', () => {
			// Track what the validation function receives
			let receivedValue = null;
			let receivedType = null;
			let receivedKeys = null;
			
			// Initialize with multi-parameter validation
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'users/{userId}/posts/{postId}',
								validate: (params) => {
									// Capture what we receive
									receivedValue = params;
									receivedType = typeof params;
									receivedKeys = Object.keys(params).sort();
									// Validate that it's an object with both parameters
									return typeof params === 'object' && 
										params.userId && 
										params.postId;
								}
							}
						]
					}
				}
			});
			
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
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received object (not individual values)
			expect(request.isValid()).toBe(true);
			expect(receivedType).toBe('object');
			expect(receivedValue).toBeInstanceOf(Object);
			expect(receivedKeys).toEqual(['postId', 'userId']);
			expect(receivedValue.userId).toBe('123');
			expect(receivedValue.postId).toBe('456');
		});
		
		it('should pass object to validation function for multiple query parameters', () => {
			let receivedValue = null;
			let receivedType = null;
			let receivedKeys = null;
			
			// Initialize with multi-parameter query validation
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'search?query,limit',
								validate: (params) => {
									receivedValue = params;
									receivedType = typeof params;
									receivedKeys = Object.keys(params).sort();
									return typeof params === 'object' && 
										params.query && 
										params.limit;
								}
							}
						]
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: {},
				queryStringParameters: {
					query: 'test',
					limit: '10'
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received object with all parameters
			expect(request.isValid()).toBe(true);
			expect(receivedType).toBe('object');
			expect(receivedKeys).toEqual(['limit', 'query']);
			expect(receivedValue.query).toBe('test');
			expect(receivedValue.limit).toBe('10');
		});
		
		it('should pass object to validation function for two query parameters', () => {
			let receivedValue = null;
			let receivedType = null;
			let receivedKeys = null;
			
			// Initialize with two-parameter query validation
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'items?page,limit',
								validate: (params) => {
									receivedValue = params;
									receivedType = typeof params;
									receivedKeys = Object.keys(params).sort();
									return typeof params === 'object' && 
										params.page && 
										params.limit;
								}
							}
						]
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: {},
				queryStringParameters: {
					page: '1',
					limit: '20'
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received object with both query parameters
			expect(request.isValid()).toBe(true);
			expect(receivedType).toBe('object');
			expect(receivedKeys).toEqual(['limit', 'page']);
			expect(receivedValue.page).toBe('1');
			expect(receivedValue.limit).toBe('20');
		});
		
		it('should pass object with three parameters', () => {
			let receivedValue = null;
			let receivedKeys = null;
			
			// Initialize with three-parameter validation
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'filter?status,category,page',
								validate: (params) => {
									receivedValue = params;
									receivedKeys = Object.keys(params).sort();
									return typeof params === 'object' && 
										params.status && 
										params.category && 
										params.page;
								}
							}
						]
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/filter',
				path: '/filter',
				pathParameters: {},
				queryStringParameters: {
					status: 'active',
					category: 'books',
					page: '1'
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received object with all three parameters
			expect(request.isValid()).toBe(true);
			expect(receivedKeys).toEqual(['category', 'page', 'status']);
			expect(receivedValue.status).toBe('active');
			expect(receivedValue.category).toBe('books');
			expect(receivedValue.page).toBe('1');
		});
		
		it('should pass object for global multi-parameter validation', () => {
			let receivedValue = null;
			let receivedType = null;
			
			// Initialize with global multi-parameter validation
			// Note: This tests the interface, not whether global multi-param works correctly
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'items/{itemId}/versions/{versionId}',
								validate: (params) => {
									receivedValue = params;
									receivedType = typeof params;
									return typeof params === 'object';
								}
							}
						]
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/items/{itemId}/versions/{versionId}',
				path: '/items/abc/versions/v1',
				pathParameters: {
					itemId: 'abc',
					versionId: 'v1'
				},
				queryStringParameters: {},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received object
			expect(request.isValid()).toBe(true);
			expect(receivedType).toBe('object');
			expect(receivedValue.itemId).toBe('abc');
			expect(receivedValue.versionId).toBe('v1');
		});
	});
	
	describe('Property-Based Tests - Multi-Parameter Interface', () => {
		
		it('Property: Multiple path parameters receive object (not individual values)', () => {
			fc.assert(
				fc.property(
					// Generate two parameter values
					fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
					fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
					(userId, postId) => {
						fc.pre(userId.length > 0 && postId.length > 0);
						
						let receivedValue = null;
						let receivedIsObject = null;
						let receivedKeys = null;
						
						// Initialize with multi-parameter validation
						ClientRequest.init({
							parameters: {
								pathParameters: {
									BY_ROUTE: [
										{
											route: 'users/{userId}/posts/{postId}',
											validate: (params) => {
												receivedValue = params;
												receivedIsObject = (typeof params === 'object' && params !== null);
												receivedKeys = receivedIsObject ? Object.keys(params).sort() : null;
												return receivedIsObject && params.userId && params.postId;
											}
										}
									]
								}
							}
						});
						
						const event = {
							httpMethod: 'GET',
							resource: '/users/{userId}/posts/{postId}',
							path: `/users/${userId}/posts/${postId}`,
							pathParameters: {
								userId,
								postId
							},
							queryStringParameters: {},
							headers: {},
							body: null
						};
						
						const request = new ClientRequest(event, mockContext);
						
						// Property: Object passed with both parameters as keys
						expect(request.isValid()).toBe(true);
						expect(receivedIsObject).toBe(true);
						expect(receivedKeys).toEqual(['postId', 'userId']);
						expect(receivedValue.userId).toBe(userId);
						expect(receivedValue.postId).toBe(postId);
						
						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Multiple query parameters receive object (not individual values)', () => {
			fc.assert(
				fc.property(
					// Generate query parameter values
					fc.string({ minLength: 1, maxLength: 50 }),
					fc.stringMatching(/^[0-9]{1,3}$/),
					(query, limit) => {
						let receivedValue = null;
						let receivedIsObject = null;
						let receivedKeys = null;
						
						// Initialize with multi-parameter query validation
						ClientRequest.init({
							parameters: {
								queryStringParameters: {
									BY_ROUTE: [
										{
											route: 'search?query,limit',
											validate: (params) => {
												receivedValue = params;
												receivedIsObject = (typeof params === 'object' && params !== null);
												receivedKeys = receivedIsObject ? Object.keys(params).sort() : null;
												return receivedIsObject && params.query && params.limit;
											}
										}
									]
								}
							}
						});
						
						const event = {
							httpMethod: 'GET',
							resource: '/search',
							path: '/search',
							pathParameters: {},
							queryStringParameters: {
								query,
								limit
							},
							headers: {},
							body: null
						};
						
						const request = new ClientRequest(event, mockContext);
						
						// Property: Object passed with both parameters as keys
						expect(request.isValid()).toBe(true);
						expect(receivedIsObject).toBe(true);
						expect(receivedKeys).toEqual(['limit', 'query']);
						expect(receivedValue.query).toBe(query);
						expect(receivedValue.limit).toBe(limit);
						
						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Multi-parameter validation works with various parameter counts', () => {
			fc.assert(
				fc.property(
					// Generate 2-4 parameters
					fc.integer({ min: 2, max: 4 }),
					fc.array(fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/), { minLength: 4, maxLength: 4 }),
					(paramCount, paramValues) => {
						fc.pre(paramValues.every(v => v.length > 0));
						
						// Use first N values based on paramCount
						const values = paramValues.slice(0, paramCount);
						const paramNames = values.map((_, i) => `param${i}`);
						
						let receivedValue = null;
						let receivedKeys = null;
						
						// Build route pattern
						const routePattern = `test?${paramNames.join(',')}`;
						
						// Initialize with multi-parameter validation
						ClientRequest.init({
							parameters: {
								queryStringParameters: {
									BY_ROUTE: [
										{
											route: routePattern,
											validate: (params) => {
												receivedValue = params;
												receivedKeys = Object.keys(params).sort();
												return typeof params === 'object';
											}
										}
									]
								}
							}
						});
						
						// Build query parameters
						const queryParams = {};
						paramNames.forEach((name, i) => {
							queryParams[name] = values[i];
						});
						
						const event = {
							httpMethod: 'GET',
							resource: '/test',
							path: '/test',
							pathParameters: {},
							queryStringParameters: queryParams,
							headers: {},
							body: null
						};
						
						const request = new ClientRequest(event, mockContext);
						
						// Property: Object passed with all parameters as keys
						expect(request.isValid()).toBe(true);
						expect(receivedKeys).toEqual(paramNames.sort());
						paramNames.forEach((name, i) => {
							expect(receivedValue[name]).toBe(values[i]);
						});
						
						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Multi-parameter interface consistent across parameter types', () => {
			fc.assert(
				fc.property(
					// Generate two parameter values
					fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/),
					fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/),
					(value1, value2) => {
						fc.pre(value1.length > 0 && value2.length > 0);
						
						let receivedValue = null;
						let receivedIsObject = null;
						let receivedKeys = null;
						
						// Test with path parameters
						ClientRequest.init({
							parameters: {
								pathParameters: {
									BY_ROUTE: [
										{
											route: 'test/{param1}/{param2}',
											validate: (params) => {
												receivedValue = params;
												receivedIsObject = (typeof params === 'object' && params !== null);
												receivedKeys = receivedIsObject ? Object.keys(params).sort() : null;
												return receivedIsObject;
											}
										}
									]
								}
							}
						});
						
						const event = {
							httpMethod: 'GET',
							resource: '/test/{param1}/{param2}',
							path: `/test/${value1}/${value2}`,
							pathParameters: {
								param1: value1,
								param2: value2
							},
							queryStringParameters: {},
							headers: {},
							body: null
						};
						
						const request = new ClientRequest(event, mockContext);
						
						// Property: Multi-parameter interface consistent for path parameters
						expect(request.isValid()).toBe(true);
						expect(receivedIsObject).toBe(true);
						expect(receivedKeys).toEqual(['param1', 'param2']);
						expect(receivedValue.param1).toBe(value1);
						expect(receivedValue.param2).toBe(value2);
						
						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
	});
	
	describe('Edge Cases - Multi-Parameter Interface', () => {
		
		it('should pass object with empty string values', () => {
			let receivedValue = null;
			let receivedKeys = null;
			
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'search?query,filter',
								validate: (params) => {
									receivedValue = params;
									receivedKeys = Object.keys(params).sort();
									return typeof params === 'object';
								}
							}
						]
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: {},
				queryStringParameters: {
					query: '',
					filter: ''
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			expect(request.isValid()).toBe(true);
			expect(receivedKeys).toEqual(['filter', 'query']);
			expect(receivedValue.query).toBe('');
			expect(receivedValue.filter).toBe('');
		});
		
		it('should pass object with special characters in values', () => {
			let receivedValue = null;
			
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'api?email,name',
								validate: (params) => {
									receivedValue = params;
									return typeof params === 'object';
								}
							}
						]
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/api',
				path: '/api',
				pathParameters: {},
				queryStringParameters: {
					email: 'test@example.com',
					name: 'John Doe'
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			expect(request.isValid()).toBe(true);
			expect(receivedValue.email).toBe('test@example.com');
			expect(receivedValue.name).toBe('John Doe');
		});
		
		it('should pass object with numeric string values', () => {
			let receivedValue = null;
			let receivedKeys = null;
			
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'items?page,limit',
								validate: (params) => {
									receivedValue = params;
									receivedKeys = Object.keys(params).sort();
									// Values should be strings, not numbers
									return typeof params.page === 'string' && 
										typeof params.limit === 'string';
								}
							}
						]
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: {},
				queryStringParameters: {
					page: '1',
					limit: '10'
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			expect(request.isValid()).toBe(true);
			expect(receivedKeys).toEqual(['limit', 'page']);
			expect(receivedValue.page).toBe('1');
			expect(receivedValue.limit).toBe('10');
			expect(typeof receivedValue.page).toBe('string');
			expect(typeof receivedValue.limit).toBe('string');
		});
	});
});

/**
 * PRESERVATION DOCUMENTATION
 * 
 * This test suite validates that multi-parameter validation interface works correctly
 * on the UNFIXED code. This behavior MUST be preserved after implementing fixes for
 * validation bugs.
 * 
 * Preserved Behaviors:
 * 
 * 1. Multi-parameter validation functions receive an object (not individual values)
 * 2. The object contains all parameter names as keys with their values
 * 3. Values are passed as-is without type conversion (strings remain strings)
 * 4. This interface works consistently across all parameter types (path, query)
 * 5. Empty strings and special characters are passed in the object
 * 6. The validation function signature is: (params) => boolean where params is an object
 * 
 * Property-Based Testing Coverage:
 * 
 * - Property 1: Multiple path parameters receive object (not individual values)
 * - Property 2: Multiple query parameters receive object (not individual values)
 * - Property 3: Multi-parameter validation works with various parameter counts (2-4)
 * - Property 4: Multi-parameter interface consistent across parameter types
 * 
 * These properties are tested across many generated inputs to ensure comprehensive coverage
 * of the multi-parameter validation interface that must be preserved.
 * 
 * CRITICAL: This test MUST PASS on unfixed code. If it fails, the observation is incorrect
 * and the test needs to be updated to match actual unfixed behavior.
 */
