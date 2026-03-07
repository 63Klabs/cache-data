/**
 * Property-Based Preservation Test: Single-Parameter Validation Interface
 * 
 * Property 2: Preservation - Single-Parameter Validation Interface Unchanged
 * 
 * METHODOLOGY: Observation-First
 * - Observe behavior on UNFIXED code for single-parameter validation functions
 * - Write tests that PASS on unfixed code
 * - These tests confirm baseline behavior to preserve during bug fixes
 * 
 * EXPECTED OUTCOME: All tests PASS on unfixed code
 * 
 * CRITICAL: This test MUST PASS on unfixed code - it confirms baseline behavior to preserve.
 * 
 * GOAL: Verify that for validation rules with a single parameter, the value is passed
 * directly to the validation function (not as an object). This is the current behavior
 * that must be preserved after fixing multi-parameter validation bugs.
 * 
 * OBSERVATION: On unfixed code, when a validation rule has a single parameter,
 * ValidationExecutor passes the value directly to the validation function:
 * - Single parameter: validateFn(value)
 * - Multiple parameters: validateFn({param1: value1, param2: value2})
 * 
 * This single-parameter interface must be preserved after bug fixes.
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

describe('Property 2: Single-Parameter Validation Interface Preservation', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Unit Tests - Single-Parameter Interface', () => {
		
		it('should pass value directly to validation function for single path parameter', () => {
			// Track what the validation function receives
			let receivedValue = null;
			let receivedType = null;
			
			// Initialize with single-parameter validation
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => {
									// Capture what we receive
									receivedValue = value;
									receivedType = typeof value;
									// Validate that it's a string (not an object)
									return typeof value === 'string' && /^[0-9]+$/.test(value);
								}
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
				queryStringParameters: {},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received value directly (not as object)
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe('123');
			expect(receivedType).toBe('string');
			// Verify it's NOT an object
			expect(receivedValue).not.toBeInstanceOf(Object);
			expect(Array.isArray(receivedValue)).toBe(false);
		});
		
		it('should pass value directly to validation function for single query parameter', () => {
			let receivedValue = null;
			let receivedType = null;
			
			// Initialize with single-parameter query validation
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'search?query',
								validate: (value) => {
									receivedValue = value;
									receivedType = typeof value;
									return typeof value === 'string' && value.length > 0;
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
					query: 'test'
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received value directly
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe('test');
			expect(receivedType).toBe('string');
		});
		
		it('should pass value directly for single header parameter', () => {
			let receivedValue = null;
			let receivedType = null;
			
			// Initialize with single-parameter header validation
			ClientRequest.init({
				parameters: {
					headerParameters: {
						contentType: (value) => {
							receivedValue = value;
							receivedType = typeof value;
							return value === 'application/json';
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: {},
				queryStringParameters: {},
				headers: {
					'Content-Type': 'application/json'
				},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received value directly
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe('application/json');
			expect(receivedType).toBe('string');
		});
		
		it('should pass value directly for global single-parameter validation', () => {
			let receivedValue = null;
			let receivedType = null;
			
			// Initialize with global single-parameter validation
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => {
							receivedValue = value;
							receivedType = typeof value;
							return /^[a-zA-Z0-9]+$/.test(value);
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/item/{id}',
				path: '/item/abc123',
				pathParameters: {
					id: 'abc123'
				},
				queryStringParameters: {},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received value directly
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe('abc123');
			expect(receivedType).toBe('string');
		});
		
		it('should pass numeric string value directly (not converted to number)', () => {
			let receivedValue = null;
			let receivedType = null;
			
			// Initialize with single-parameter validation
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						limit: (value) => {
							receivedValue = value;
							receivedType = typeof value;
							// Validate it's a numeric string
							return !isNaN(value) && parseInt(value) > 0;
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: {},
				queryStringParameters: {
					limit: '10'
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Value passed as string, not converted to number
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe('10');
			expect(receivedType).toBe('string');
		});
	});
	
	describe('Property-Based Tests - Single-Parameter Interface', () => {
		
		it('Property: Single path parameter receives value directly (not as object)', () => {
			fc.assert(
				fc.property(
					// Generate route prefix
					fc.constantFrom('product', 'user', 'item', 'order', 'post'),
					// Generate parameter value
					fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
					(routePrefix, paramValue) => {
						fc.pre(paramValue.length > 0);
						
						let receivedValue = null;
						let receivedIsObject = null;
						
						// Initialize with single-parameter validation
						ClientRequest.init({
							parameters: {
								pathParameters: {
									BY_ROUTE: [
										{
											route: `${routePrefix}/{id}`,
											validate: (value) => {
												receivedValue = value;
												// Check if it's an object (would be wrong)
												receivedIsObject = (typeof value === 'object' && value !== null);
												return typeof value === 'string' && value.length > 0;
											}
										}
									]
								}
							}
						});
						
						const event = {
							httpMethod: 'GET',
							resource: `/${routePrefix}/{id}`,
							path: `/${routePrefix}/${paramValue}`,
							pathParameters: {
								id: paramValue
							},
							queryStringParameters: {},
							headers: {},
							body: null
						};
						
						const request = new ClientRequest(event, mockContext);
						
						// Property: Value passed directly, not as object
						expect(request.isValid()).toBe(true);
						expect(receivedValue).toBe(paramValue);
						expect(receivedIsObject).toBe(false);
						
						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Single query parameter receives value directly (not as object)', () => {
			fc.assert(
				fc.property(
					// Generate parameter name
					fc.constantFrom('query', 'search', 'filter', 'term', 'keyword'),
					// Generate parameter value
					fc.string({ minLength: 1, maxLength: 50 }),
					(paramName, paramValue) => {
						let receivedValue = null;
						let receivedIsObject = null;
						
						// Initialize with single-parameter query validation
						ClientRequest.init({
							parameters: {
								queryStringParameters: {
									BY_ROUTE: [
										{
											route: `search?${paramName}`,
											validate: (value) => {
												receivedValue = value;
												receivedIsObject = (typeof value === 'object' && value !== null);
												return typeof value === 'string';
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
								[paramName]: paramValue
							},
							headers: {},
							body: null
						};
						
						const request = new ClientRequest(event, mockContext);
						
						// Property: Value passed directly, not as object
						expect(request.isValid()).toBe(true);
						expect(receivedValue).toBe(paramValue);
						expect(receivedIsObject).toBe(false);
						
						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Single parameter validation works with various data types', () => {
			fc.assert(
				fc.property(
					// Generate different types of string values
					fc.oneof(
						fc.stringMatching(/^[0-9]{1,10}$/),        // Numeric strings
						fc.stringMatching(/^[a-zA-Z]{1,20}$/),     // Alphabetic strings
						fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/),  // Alphanumeric strings
						fc.constant('true'),                        // Boolean-like strings
						fc.constant('false')
					),
					(paramValue) => {
						fc.pre(paramValue.length > 0);
						
						let receivedValue = null;
						let receivedType = null;
						
						// Initialize with single-parameter validation
						ClientRequest.init({
							parameters: {
								pathParameters: {
									BY_ROUTE: [
										{
											route: 'data/{value}',
											validate: (value) => {
												receivedValue = value;
												receivedType = typeof value;
												return typeof value === 'string';
											}
										}
									]
								}
							}
						});
						
						const event = {
							httpMethod: 'GET',
							resource: '/data/{value}',
							path: `/data/${paramValue}`,
							pathParameters: {
								value: paramValue
							},
							queryStringParameters: {},
							headers: {},
							body: null
						};
						
						const request = new ClientRequest(event, mockContext);
						
						// Property: All values passed as strings directly
						expect(request.isValid()).toBe(true);
						expect(receivedValue).toBe(paramValue);
						expect(receivedType).toBe('string');
						
						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Single parameter validation interface consistent across parameter types', () => {
			fc.assert(
				fc.property(
					// Generate parameter value
					fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/),
					// Generate parameter type
					fc.constantFrom('path', 'query', 'header'),
					(paramValue, paramType) => {
						fc.pre(paramValue.length > 0);
						
						let receivedValue = null;
						let receivedIsObject = null;
						
						// Configure validation based on parameter type
						const config = {
							parameters: {}
						};
						
						if (paramType === 'path') {
							config.parameters.pathParameters = {
								BY_ROUTE: [
									{
										route: 'test/{id}',
										validate: (value) => {
											receivedValue = value;
											receivedIsObject = (typeof value === 'object' && value !== null);
											return typeof value === 'string';
										}
									}
								]
							};
						} else if (paramType === 'query') {
							config.parameters.queryStringParameters = {
								BY_ROUTE: [
									{
										route: 'test?id',
										validate: (value) => {
											receivedValue = value;
											receivedIsObject = (typeof value === 'object' && value !== null);
											return typeof value === 'string';
										}
									}
								]
							};
						} else if (paramType === 'header') {
							config.parameters.headerParameters = {
								customHeader: (value) => {
									receivedValue = value;
									receivedIsObject = (typeof value === 'object' && value !== null);
									return typeof value === 'string';
								}
							};
						}
						
						ClientRequest.init(config);
						
						// Create event based on parameter type
						const event = {
							httpMethod: 'GET',
							resource: '/test',
							path: '/test',
							pathParameters: paramType === 'path' ? { id: paramValue } : {},
							queryStringParameters: paramType === 'query' ? { id: paramValue } : {},
							headers: paramType === 'header' ? { 'Custom-Header': paramValue } : {},
							body: null
						};
						
						if (paramType === 'path') {
							event.resource = '/test/{id}';
							event.path = `/test/${paramValue}`;
						}
						
						const request = new ClientRequest(event, mockContext);
						
						// Property: Single-parameter interface consistent across all parameter types
						expect(request.isValid()).toBe(true);
						expect(receivedValue).toBe(paramValue);
						expect(receivedIsObject).toBe(false);
						
						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
	});
	
	describe('Edge Cases - Single-Parameter Interface', () => {
		
		it('should pass empty string directly (not as object)', () => {
			let receivedValue = null;
			let receivedType = null;
			
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						search: (value) => {
							receivedValue = value;
							receivedType = typeof value;
							// Allow empty strings
							return typeof value === 'string';
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: {},
				queryStringParameters: {
					search: ''
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe('');
			expect(receivedType).toBe('string');
		});
		
		it('should pass special characters directly (not as object)', () => {
			let receivedValue = null;
			
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						data: (value) => {
							receivedValue = value;
							return typeof value === 'string';
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/api',
				path: '/api',
				pathParameters: {},
				queryStringParameters: {
					data: 'test@example.com'
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe('test@example.com');
		});
		
		it('should pass whitespace-containing values directly', () => {
			let receivedValue = null;
			
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						name: (value) => {
							receivedValue = value;
							return typeof value === 'string';
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'GET',
				resource: '/user',
				path: '/user',
				pathParameters: {},
				queryStringParameters: {
					name: 'John Doe'
				},
				headers: {},
				body: null
			};
			
			const request = new ClientRequest(event, mockContext);
			
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe('John Doe');
		});
	});
});

/**
 * PRESERVATION DOCUMENTATION
 * 
 * This test suite validates that single-parameter validation interface works correctly
 * on the UNFIXED code. This behavior MUST be preserved after implementing fixes for
 * multi-parameter validation bugs.
 * 
 * Preserved Behaviors:
 * 
 * 1. Single-parameter validation functions receive the value directly (not as object)
 * 2. The value is passed as-is without type conversion (strings remain strings)
 * 3. This interface works consistently across all parameter types (path, query, header)
 * 4. Empty strings and special characters are passed directly
 * 5. The validation function signature is: (value) => boolean
 * 
 * Property-Based Testing Coverage:
 * 
 * - Property 1: Single path parameter receives value directly (not as object)
 * - Property 2: Single query parameter receives value directly (not as object)
 * - Property 3: Single parameter validation works with various data types
 * - Property 4: Single parameter validation interface consistent across parameter types
 * 
 * These properties are tested across many generated inputs to ensure comprehensive coverage
 * of the single-parameter validation interface that must be preserved.
 * 
 * CRITICAL: This test MUST PASS on unfixed code. If it fails, the observation is incorrect
 * and the test needs to be updated to match actual unfixed behavior.
 */
