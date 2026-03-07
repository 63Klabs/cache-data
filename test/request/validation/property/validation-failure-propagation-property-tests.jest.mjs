/**
 * Property-Based Test: Validation Failure Propagation
 * 
 * Feature: body-validation-and-header-format-fix
 * Property 2: For any request with invalid body parameters, when body validation
 * fails, the ClientRequest SHALL set `isValid` to false and prevent request processing.
 * 
 * @tag Feature: body-validation-and-header-format-fix, Property 2: Validation Failure Propagation
 * 
 * Validates: Requirements 1.4, 2.3
 * 
 * This property test validates that body validation failures are properly propagated
 * through the validation chain and affect the overall request validity, just like
 * failures in other parameter types (path, query, header, cookie).
 * 
 * The property ensures that:
 * 1. Body validation failures set isValid to false
 * 2. The validation chain stops on body validation failure
 * 3. Body validation is included in the overall validation process
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

describe('Property 2: Validation Failure Propagation', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Unit Tests - Body Validation Failure', () => {
		
		it('should set isValid to false when body validation fails', () => {
			// Arrange: Body validation that will fail
			const bodyData = {
				userId: '123',
				action: 'invalid-action'  // Will fail validation
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
						action: (value) => ['create', 'update', 'delete'].includes(value)  // 'invalid-action' will fail
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation should fail
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should set isValid to false when required body field is missing', () => {
			// Arrange: Missing required field with multi-parameter validation
			const bodyData = {
				userId: '123'
				// Missing 'action' field
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
						BY_ROUTE: [
							{
								route: 'users',
								validate: ({ userId, action }) => {
									// Both fields required
									return userId && action && ['create', 'update', 'delete'].includes(action);
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation should fail due to missing field
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should set isValid to false when body field has wrong type', () => {
			// Arrange: Wrong type for field
			const bodyData = {
				userId: 123,  // Should be string, not number
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
			
			// Assert: Validation should fail due to wrong type
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should set isValid to false when JSON parsing fails', () => {
			// Arrange: Invalid JSON
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: '{invalid json}'
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						userId: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation should fail due to JSON parsing error
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should set isValid to false when body validation fails with multi-parameter validation', () => {
			// Arrange: Multi-parameter validation that will fail
			const bodyData = {
				email: 'john@example.com',
				password: 'short'  // Too short
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
						BY_ROUTE: [
							{
								route: 'users',
								validate: ({ email, password }) => {
									return email && email.includes('@') && password && password.length >= 8;
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation should fail
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should set isValid to true when all validations pass including body', () => {
			// Arrange: All validations will pass
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
			
			// Assert: Validation should pass
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Property-Based Tests - Validation Failure Propagation', () => {
		
		it('Property: Invalid string values cause validation failure', () => {
			// Property: For all invalid string body parameters,
			// validation fails and isValid becomes false
			
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.string({ minLength: 1, maxLength: 50 }),
						action: fc.string().filter(s => !['create', 'update', 'delete'].includes(s))  // Invalid actions
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
									action: (value) => ['create', 'update', 'delete'].includes(value)
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation should fail for invalid action
						expect(request.isValid()).toBe(false);
						expect(request.getBodyParameters()).toEqual({});
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Invalid numeric values cause validation failure', () => {
			// Property: For all invalid numeric body parameters,
			// validation fails and isValid becomes false
			
			fc.assert(
				fc.property(
					fc.record({
						count: fc.integer({ min: -1000, max: -1 }),  // Negative numbers (invalid)
						price: fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true })  // Negative prices (invalid)
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
									count: (value) => typeof value === 'number' && value >= 0,
									price: (value) => typeof value === 'number' && value >= 0
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation should fail for negative values
						expect(request.isValid()).toBe(false);
						expect(request.getBodyParameters()).toEqual({});
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Wrong type values cause validation failure', () => {
			// Property: For all body parameters with wrong types,
			// validation fails and isValid becomes false
			
			fc.assert(
				fc.property(
					fc.oneof(
						fc.record({ userId: fc.integer() }),  // Should be string
						fc.record({ userId: fc.boolean() }),  // Should be string
						fc.record({ userId: fc.constant(null) })  // Should be string
					),
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
									userId: (value) => typeof value === 'string' && value.length > 0
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation should fail for wrong type
						expect(request.isValid()).toBe(false);
						expect(request.getBodyParameters()).toEqual({});
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Missing required fields cause validation failure', () => {
			// Property: For all body parameters missing required fields,
			// validation fails and isValid becomes false
			
			fc.assert(
				fc.property(
					fc.oneof(
						fc.record({ userId: fc.string({ minLength: 1 }) }),  // Missing action
						fc.record({ action: fc.constantFrom('create', 'update', 'delete') })  // Missing userId
					),
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
									BY_ROUTE: [
										{
											route: 'users',
											validate: ({ userId, action }) => {
												// Both fields required
												return userId && action && typeof userId === 'string' && ['create', 'update', 'delete'].includes(action);
											}
										}
									]
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation should fail for missing fields
						expect(request.isValid()).toBe(false);
						expect(request.getBodyParameters()).toEqual({});
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Invalid JSON strings cause validation failure', () => {
			// Property: For all invalid JSON strings,
			// validation fails and isValid becomes false
			
			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant('{invalid json}'),
						fc.constant('{"unclosed": '),
						fc.constant('not json at all'),
						fc.constant('{key: "no quotes"}'),
						fc.constant("{'single': 'quotes'}")
					),
					(invalidJson) => {
						// Arrange
						const event = {
							httpMethod: 'POST',
							resource: '/users',
							path: '/users',
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: invalidJson
						};
						
						ClientRequest.init({
							parameters: {
								bodyParameters: {
									userId: (value) => typeof value === 'string'
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation should fail for invalid JSON
						expect(request.isValid()).toBe(false);
						expect(request.getBodyParameters()).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
	});
	
	describe('Validation Chain Integration', () => {
		
		it('should fail overall validation when body validation fails even if other validations pass', () => {
			// Arrange: Path and query validations pass, but body fails
			const bodyData = {
				action: 'invalid-action'  // Will fail
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/users/{userId}',
				path: '/users/123',
				pathParameters: {
					userId: '123'
				},
				queryStringParameters: {
					format: 'json'
				},
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						userId: (value) => typeof value === 'string'  // Will pass
					},
					queryStringParameters: {
						format: (value) => ['json', 'xml'].includes(value)  // Will pass
					},
					bodyParameters: {
						action: (value) => ['create', 'update', 'delete'].includes(value)  // Will fail
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Overall validation should fail due to body validation failure
			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({ userId: '123' });  // Path params validated
			expect(request.getQueryStringParameters()).toEqual({ format: 'json' });  // Query params validated
			expect(request.getBodyParameters()).toEqual({});  // Body params failed
		});
		
		it('should fail overall validation when any parameter type fails', () => {
			// Arrange: Body validation passes, but query fails
			const bodyData = {
				action: 'update'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: {
					format: 'invalid-format'  // Will fail
				},
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						format: (value) => ['json', 'xml'].includes(value)  // Will fail
					},
					bodyParameters: {
						action: (value) => ['create', 'update', 'delete'].includes(value)  // Will pass
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Overall validation should fail due to query validation failure
			expect(request.isValid()).toBe(false);
		});
	});
});
