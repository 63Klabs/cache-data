/**
 * Property-Based Test: Body Validation Round-Trip
 * 
 * Feature: body-validation-and-header-format-fix
 * Property 1: For any valid body parameter configuration and request body,
 * if body parameters pass validation and are stored, then calling
 * getBodyParameters() SHALL return the same validated parameters.
 * 
 * @tag Feature: body-validation-and-header-format-fix, Property 1: Body Validation Round-Trip
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.8
 * 
 * This property test validates the complete body validation workflow:
 * 1. JSON parsing from event.body
 * 2. Validation using ValidationMatcher and ValidationExecutor
 * 3. Storage in this.#props.bodyParameters
 * 4. Retrieval via getBodyParameters()
 * 
 * The property ensures that the validation framework is properly integrated
 * for body parameters and that data round-trips correctly.
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

describe('Property 1: Body Validation Round-Trip', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Unit Tests - Basic Round-Trip', () => {
		
		it('should return validated body parameters after successful validation', () => {
			// Arrange: Simple body validation
			const bodyData = {
				userId: '123',
				action: 'update'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						userId: (value) => typeof value === 'string',
						action: (value) => ['create', 'update', 'delete'].includes(value)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const retrievedParams = request.getBodyParameters();
			
			// Assert: Round-trip returns same data
			expect(request.isValid()).toBe(true);
			expect(retrievedParams).toEqual(bodyData);
		});
		
		it('should return empty object when body is null', () => {
			// Arrange: Null body
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: null
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const retrievedParams = request.getBodyParameters();
			
			// Assert: Empty object returned
			expect(request.isValid()).toBe(true);
			expect(retrievedParams).toEqual({});
		});
		
		it('should return empty object when body is empty string', () => {
			// Arrange: Empty string body
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: ''
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const retrievedParams = request.getBodyParameters();
			
			// Assert: Empty object returned
			expect(request.isValid()).toBe(true);
			expect(retrievedParams).toEqual({});
		});
		
		it('should return empty object when body is undefined', () => {
			// Arrange: Undefined body
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: undefined
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const retrievedParams = request.getBodyParameters();
			
			// Assert: Empty object returned
			expect(request.isValid()).toBe(true);
			expect(retrievedParams).toEqual({});
		});
		
		it('should handle multi-field body validation', () => {
			// Arrange: Multiple fields
			const bodyData = {
				name: 'John Doe',
				email: 'john@example.com',
				age: 30,
				active: true
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						name: (value) => typeof value === 'string',
						email: (value) => typeof value === 'string' && value.includes('@'),
						age: (value) => typeof value === 'number',
						active: (value) => typeof value === 'boolean'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const retrievedParams = request.getBodyParameters();
			
			// Assert: All fields round-trip correctly
			expect(request.isValid()).toBe(true);
			expect(retrievedParams).toEqual(bodyData);
		});
		
		it('should handle nested object in body', () => {
			// Arrange: Nested object
			const bodyData = {
				user: {
					id: '123',
					name: 'John'
				},
				metadata: {
					timestamp: 1234567890,
					source: 'api'
				}
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/data',
				path: '/data',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						user: (value) => typeof value === 'object' && value.id && value.name,
						metadata: (value) => typeof value === 'object' && value.timestamp
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const retrievedParams = request.getBodyParameters();
			
			// Assert: Nested objects round-trip correctly
			expect(request.isValid()).toBe(true);
			expect(retrievedParams).toEqual(bodyData);
		});
		
		it('should handle array in body', () => {
			// Arrange: Array field
			const bodyData = {
				items: ['item1', 'item2', 'item3'],
				count: 3
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/batch',
				path: '/batch',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						items: (value) => Array.isArray(value) && value.length > 0,
						count: (value) => typeof value === 'number'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const retrievedParams = request.getBodyParameters();
			
			// Assert: Arrays round-trip correctly
			expect(request.isValid()).toBe(true);
			expect(retrievedParams).toEqual(bodyData);
		});
	});
	
	describe('Property-Based Tests - Round-Trip Validation', () => {
		
		it('Property: String fields round-trip correctly', () => {
			// Property: For all valid string body parameters,
			// validating and storing then retrieving returns the same data
			
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.string({ minLength: 1, maxLength: 50 }),
						action: fc.constantFrom('create', 'update', 'delete', 'read'),
						description: fc.string({ maxLength: 200 })
					}),
					(bodyData) => {
						// Arrange
						const event = {
							httpMethod: 'POST',
							resource: '/users',
							path: '/users',
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: JSON.stringify(bodyData)
						};
						
						ClientRequest.init({
							parameters: {
								bodyParameters: {
									userId: (value) => typeof value === 'string',
									action: (value) => ['create', 'update', 'delete', 'read'].includes(value),
									description: (value) => typeof value === 'string'
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						const retrievedParams = request.getBodyParameters();
						
						// Assert: Round-trip preserves data
						expect(request.isValid()).toBe(true);
						expect(retrievedParams).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Numeric fields round-trip correctly', () => {
			// Property: For all valid numeric body parameters,
			// validating and storing then retrieving returns the same data
			
			fc.assert(
				fc.property(
					fc.record({
						count: fc.integer({ min: 0, max: 1000 }),
						price: fc.float({ min: 0, max: 10000, noNaN: true }),
						quantity: fc.integer({ min: 1, max: 100 })
					}),
					(bodyData) => {
						// Arrange
						const event = {
							httpMethod: 'POST',
							resource: '/orders',
							path: '/orders',
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: JSON.stringify(bodyData)
						};
						
						ClientRequest.init({
							parameters: {
								bodyParameters: {
									count: (value) => typeof value === 'number',
									price: (value) => typeof value === 'number',
									quantity: (value) => typeof value === 'number'
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						const retrievedParams = request.getBodyParameters();
						
						// Assert: Round-trip preserves numeric data
						expect(request.isValid()).toBe(true);
						expect(retrievedParams).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Boolean fields round-trip correctly', () => {
			// Property: For all valid boolean body parameters,
			// validating and storing then retrieving returns the same data
			
			fc.assert(
				fc.property(
					fc.record({
						active: fc.boolean(),
						verified: fc.boolean(),
						premium: fc.boolean()
					}),
					(bodyData) => {
						// Arrange
						const event = {
							httpMethod: 'POST',
							resource: '/settings',
							path: '/settings',
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: JSON.stringify(bodyData)
						};
						
						ClientRequest.init({
							parameters: {
								bodyParameters: {
									active: (value) => typeof value === 'boolean',
									verified: (value) => typeof value === 'boolean',
									premium: (value) => typeof value === 'boolean'
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						const retrievedParams = request.getBodyParameters();
						
						// Assert: Round-trip preserves boolean data
						expect(request.isValid()).toBe(true);
						expect(retrievedParams).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Mixed type fields round-trip correctly', () => {
			// Property: For all valid mixed-type body parameters,
			// validating and storing then retrieving returns the same data
			
			fc.assert(
				fc.property(
					fc.record({
						id: fc.string({ minLength: 1, maxLength: 20 }),
						count: fc.integer({ min: 0, max: 100 }),
						enabled: fc.boolean(),
						tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 5 })
					}),
					(bodyData) => {
						// Arrange
						const event = {
							httpMethod: 'POST',
							resource: '/items',
							path: '/items',
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: JSON.stringify(bodyData)
						};
						
						ClientRequest.init({
							parameters: {
								bodyParameters: {
									id: (value) => typeof value === 'string',
									count: (value) => typeof value === 'number',
									enabled: (value) => typeof value === 'boolean',
									tags: (value) => Array.isArray(value)
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						const retrievedParams = request.getBodyParameters();
						
						// Assert: Round-trip preserves all data types
						expect(request.isValid()).toBe(true);
						expect(retrievedParams).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Empty body cases return empty object', () => {
			// Property: For all empty body cases (null, undefined, empty string),
			// getBodyParameters() returns empty object
			
			fc.assert(
				fc.property(
					fc.constantFrom(null, undefined, ''),
					(bodyValue) => {
						// Arrange
						const event = {
							httpMethod: 'POST',
							resource: '/test',
							path: '/test',
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: bodyValue
						};
						
						ClientRequest.init({
							parameters: {
								bodyParameters: {}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						const retrievedParams = request.getBodyParameters();
						
						// Assert: Empty object returned
						expect(request.isValid()).toBe(true);
						expect(retrievedParams).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
	});
	
	describe('Route-Specific Body Validation Round-Trip', () => {
		
		it('should round-trip with route-specific validation', () => {
			// Arrange: Route-specific body validation
			const bodyData = {
				productId: 'P-12345',
				quantity: 5
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/orders',
				path: '/orders',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						productId: (value) => typeof value === 'string',  // Global fallback
						BY_ROUTE: [
							{
								route: 'orders?productId,quantity',
								validate: ({ productId, quantity }) => {
									return productId.startsWith('P-') && quantity > 0;
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const retrievedParams = request.getBodyParameters();
			
			// Assert: Route-specific validation round-trips correctly
			expect(request.isValid()).toBe(true);
			expect(retrievedParams).toEqual(bodyData);
		});
		
		it('should round-trip with method-specific validation', () => {
			// Arrange: Method-specific body validation
			const bodyData = {
				data: 'test-data',
				timestamp: 1234567890
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/data',
				path: '/data',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						data: (value) => typeof value === 'string',  // Global fallback
						timestamp: (value) => typeof value === 'number',  // Global fallback
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									// Single parameter validation for method-specific
									return typeof value === 'string' || typeof value === 'number';
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const retrievedParams = request.getBodyParameters();
			
			// Assert: Method-specific validation round-trips correctly
			expect(request.isValid()).toBe(true);
			expect(retrievedParams).toEqual(bodyData);
		});
	});
});
