/**
 * Property-Based Test: Backwards Compatibility Preservation
 * 
 * Feature: body-validation-and-header-format-fix
 * Property 5: For any request without body validation configuration,
 * the ClientRequest SHALL behave identically to the previous version,
 * with getBodyParameters() returning an empty object and validation succeeding.
 * 
 * @tag Feature: body-validation-and-header-format-fix, Property 5: Backwards Compatibility Preservation
 * 
 * Validates: Requirements 6.2, 6.3
 * 
 * This property test validates that the body validation feature is opt-in and
 * maintains full backwards compatibility. When no body validation is configured,
 * the system should behave exactly as it did before the feature was added:
 * - getBodyParameters() returns empty object
 * - Validation succeeds (assuming other validations pass)
 * - No errors or warnings are generated
 * 
 * This ensures that existing code continues to work without modification when
 * upgrading to the new version.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import ClientRequest class
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

// Mock Lambda context
const mockContext = {
	getRemainingTimeInMillis: () => 30000
};

describe('Property 5: Backwards Compatibility Preservation', () => {
	
	beforeEach(() => {
		// Ensure clean ClientRequest state before each test
		ClientRequest.init({
			parameters: {}
		});
	});

	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Unit Tests - No Body Validation Configuration', () => {
		
		it('should return empty object when no body validation configured', () => {
			// Arrange: No body validation configuration
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
					// No bodyParameters configuration
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			const retrievedParams = request.getBodyParameters();
			
			// Assert: Empty object returned, validation succeeds
			expect(request.isValid()).toBe(true);
			expect(retrievedParams).toEqual({});
		});
		
		it('should succeed validation when no body validation configured', () => {
			// Arrange: Request with body but no validation
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify({ data: 'test' })
			};
			
			ClientRequest.init({
				parameters: {}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation succeeds
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle null body when no validation configured', () => {
			// Arrange: Null body, no validation
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
				parameters: {}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Empty object returned, validation succeeds
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle empty string body when no validation configured', () => {
			// Arrange: Empty string body, no validation
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
				parameters: {}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Empty object returned, validation succeeds
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle undefined body when no validation configured', () => {
			// Arrange: Undefined body, no validation
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
				parameters: {}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Empty object returned, validation succeeds
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should not affect other parameter validations when no body validation configured', () => {
			// Arrange: Path and query validations configured, but not body
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
				body: JSON.stringify({ data: 'test' })
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						userId: (value) => typeof value === 'string'
					},
					queryStringParameters: {
						format: (value) => ['json', 'xml'].includes(value)
					}
					// No bodyParameters configuration
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Other validations work, body returns empty object
			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ userId: '123' });
			expect(request.getQueryStringParameters()).toEqual({ format: 'json' });
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle invalid JSON body gracefully when no validation configured', () => {
			// Arrange: Invalid JSON, no validation
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
				parameters: {}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: JSON parsing still fails even without validation configured
			// This is expected behavior - JSON parsing happens before validation
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
	});
	
	describe('Property-Based Tests - Backwards Compatibility', () => {
		
		it('Property: Any request without body validation returns empty object', () => {
			// Property: For all requests without body validation configuration,
			// getBodyParameters() returns empty object
			
			fc.assert(
				fc.property(
					fc.record({
						httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
						resource: fc.constantFrom('/users', '/products', '/orders', '/data'),
						body: fc.oneof(
							fc.constant(null),
							fc.constant(undefined),
							fc.constant(''),
							fc.jsonValue().map(v => JSON.stringify(v))
						)
					}),
					(eventData) => {
						// Arrange
						const event = {
							httpMethod: eventData.httpMethod,
							resource: eventData.resource,
							path: eventData.resource,
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: eventData.body
						};
						
						ClientRequest.init({
							parameters: {}  // No body validation
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						const bodyParams = request.getBodyParameters();
						
						// Assert: Always returns empty object
						expect(bodyParams).toEqual({});
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Validation succeeds without body validation configuration', () => {
			// Property: For all requests without body validation configuration,
			// validation succeeds (assuming no other validations fail)
			
			fc.assert(
				fc.property(
					fc.record({
						httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
						resource: fc.constantFrom('/api', '/data', '/users'),
						body: fc.oneof(
							fc.constant(null),
							fc.jsonValue().map(v => JSON.stringify(v))
						)
					}),
					(eventData) => {
						// Arrange
						const event = {
							httpMethod: eventData.httpMethod,
							resource: eventData.resource,
							path: eventData.resource,
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: eventData.body
						};
						
						ClientRequest.init({
							parameters: {}  // No validations configured
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation succeeds
						expect(request.isValid()).toBe(true);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Body validation does not interfere with other parameter types', () => {
			// Property: For all requests with other parameter validations but no body validation,
			// other validations work correctly and body returns empty object
			
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.string({ minLength: 1, maxLength: 20 }),
						format: fc.constantFrom('json', 'xml'),
						body: fc.jsonValue().map(v => JSON.stringify(v))
					}),
					(testData) => {
						// Arrange
						const event = {
							httpMethod: 'GET',
							resource: '/users/{userId}',
							path: `/users/${testData.userId}`,
							pathParameters: {
								userId: testData.userId
							},
							queryStringParameters: {
								format: testData.format
							},
							headers: {},
							body: testData.body
						};
						
						ClientRequest.init({
							parameters: {
								pathParameters: {
									userId: (value) => typeof value === 'string'
								},
								queryStringParameters: {
									format: (value) => ['json', 'xml'].includes(value)
								}
								// No bodyParameters configuration
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Other validations work, body returns empty
						expect(request.isValid()).toBe(true);
						expect(request.getPathParameters()).toEqual({ userId: testData.userId });
						expect(request.getQueryStringParameters()).toEqual({ format: testData.format });
						expect(request.getBodyParameters()).toEqual({});
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Empty bodyParameters configuration behaves same as no configuration', () => {
			// Property: For all requests, empty bodyParameters object behaves
			// identically to no bodyParameters configuration
			
			// >! Use safe JSON generators that avoid prototype-polluting keys like toString, __proto__, constructor
			const safeJsonArbitrary = fc.oneof(
				fc.constant(null),
				fc.constant(''),
				fc.boolean().map(v => JSON.stringify(v)),
				fc.integer().map(v => JSON.stringify(v)),
				fc.string().map(v => JSON.stringify(v)),
				fc.dictionary(
					fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					fc.oneof(fc.string(), fc.integer().map(String), fc.boolean().map(String))
				).map(v => JSON.stringify(v)),
				fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean()), { maxLength: 5 }).map(v => JSON.stringify(v))
			);

			fc.assert(
				fc.property(
					fc.record({
						body: safeJsonArbitrary
					}),
					(testData) => {
						// Test with no configuration
						const event1 = {
							httpMethod: 'POST',
							resource: '/test',
							path: '/test',
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: testData.body
						};
						
						ClientRequest.init({
							parameters: {}  // No bodyParameters
						});
						
						const request1 = new ClientRequest(event1, mockContext);
						const result1 = {
							isValid: request1.isValid(),
							bodyParams: request1.getBodyParameters()
						};
						
						// Test with empty configuration
						const event2 = {
							httpMethod: 'POST',
							resource: '/test',
							path: '/test',
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: testData.body
						};
						
						ClientRequest.init({
							parameters: {
								bodyParameters: {}  // Empty bodyParameters
							}
						});
						
						const request2 = new ClientRequest(event2, mockContext);
						const result2 = {
							isValid: request2.isValid(),
							bodyParams: request2.getBodyParameters()
						};
						
						// Assert: Both behave identically
						expect(result1.isValid).toBe(result2.isValid);
						expect(result1.bodyParams).toEqual(result2.bodyParams);
						expect(result1.bodyParams).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
	});
	
	describe('Integration Tests - Backwards Compatibility', () => {
		
		it('should maintain backwards compatibility with existing code patterns', () => {
			// Arrange: Typical existing code pattern (no body validation)
			const event = {
				httpMethod: 'POST',
				resource: '/api/users',
				path: '/api/users',
				pathParameters: null,
				queryStringParameters: {
					page: '1',
					limit: '10'
				},
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					name: 'John Doe',
					email: 'john@example.com'
				})
			};
			
			// Existing initialization pattern
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						page: (value) => !isNaN(value) && value > 0,
						limit: (value) => !isNaN(value) && value > 0 && value <= 100
					}
				}
			});
			
			// Act: Existing code pattern
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Existing behavior maintained
			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ page: '1', limit: '10' });
			expect(request.getBodyParameters()).toEqual({});  // Always returned empty before
		});
		
		it('should not break when upgrading from version without body validation', () => {
			// Arrange: Simulate upgrade scenario
			const events = [
				{
					httpMethod: 'GET',
					resource: '/users',
					path: '/users',
					pathParameters: null,
					queryStringParameters: null,
					headers: {},
					body: null
				},
				{
					httpMethod: 'POST',
					resource: '/users',
					path: '/users',
					pathParameters: null,
					queryStringParameters: null,
					headers: {},
					body: JSON.stringify({ data: 'test' })
				},
				{
					httpMethod: 'PUT',
					resource: '/users/{id}',
					path: '/users/123',
					pathParameters: { id: '123' },
					queryStringParameters: null,
					headers: {},
					body: JSON.stringify({ update: 'value' })
				}
			];
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act: Process all events
			const results = events.map(event => {
				const request = new ClientRequest(event, mockContext);
				return {
					isValid: request.isValid(),
					bodyParams: request.getBodyParameters()
				};
			});
			
			// Assert: All succeed with empty body params
			results.forEach(result => {
				expect(result.isValid).toBe(true);
				expect(result.bodyParams).toEqual({});
			});
		});
	});
});
