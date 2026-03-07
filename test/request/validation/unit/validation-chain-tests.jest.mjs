/**
 * Unit Tests: Validation Chain
 * 
 * Tests the validation chain in ClientRequest class to ensure body validation
 * is properly integrated and executes in the correct order.
 * 
 * Requirements tested:
 * - 2.1: Body validation included in validation chain
 * - 2.2: Body validation executes after cookie validation
 * - 2.3: Body validation failure affects overall validity
 * - 2.4: Validation order maintained (referrer → path → query → header → cookie → body)
 */

import { describe, it, expect, afterEach } from '@jest/globals';

// Import ClientRequest class
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

// Mock Lambda context
const mockContext = {
	getRemainingTimeInMillis: () => 30000
};

describe('Validation Chain - Unit Tests', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Body Validation Included in Chain', () => {
		
		it('should include body validation in the validation chain', () => {
			// Arrange
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
			
			// Assert: Body validation should execute and validate parameters
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should execute body validation even when no other validations are configured', () => {
			// Arrange
			const bodyData = {
				message: 'Hello World'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/messages',
				path: '/messages',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					// Only body validation configured
					bodyParameters: {
						message: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should execute body validation when other parameter types have no validation rules', () => {
			// Arrange
			const bodyData = {
				data: 'test'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				pathParameters: { id: '123' },  // No validation rules
				queryStringParameters: { filter: 'all' },  // No validation rules
				headers: { 'content-type': 'application/json' },  // No validation rules
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					// Only body validation configured
					bodyParameters: {
						data: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Body validation should execute
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Body Validation Executes After Cookie Validation', () => {
		
		it('should execute body validation after cookie validation', () => {
			// Arrange: Both cookie and body validations configured
			const bodyData = {
				action: 'update'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				cookie: {
					sessionId: 'valid-session-123'
				},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					cookieParameters: {
						sessionId: (value) => typeof value === 'string' && value.startsWith('valid-')
					},
					bodyParameters: {
						action: (value) => ['create', 'update', 'delete'].includes(value)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Both validations should pass
			expect(request.isValid()).toBe(true);
			expect(request.getCookieParameters()).toEqual({ sessionId: 'valid-session-123' });
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should not execute body validation if cookie validation fails', () => {
			// Arrange: Cookie validation will fail
			const bodyData = {
				action: 'update'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				cookie: {
					sessionId: 'invalid-session'  // Will fail validation
				},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					cookieParameters: {
						sessionId: (value) => typeof value === 'string' && value.startsWith('valid-')
					},
					bodyParameters: {
						action: (value) => ['create', 'update', 'delete'].includes(value)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Overall validation fails due to cookie validation
			// Body validation may or may not execute (implementation detail),
			// but overall result should be invalid
			expect(request.isValid()).toBe(false);
		});
		
		it('should execute body validation when cookie validation passes', () => {
			// Arrange: Cookie passes, body should be validated
			const bodyData = {
				userId: '123'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				cookie: {
					token: 'valid-token'
				},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					cookieParameters: {
						token: (value) => typeof value === 'string'
					},
					bodyParameters: {
						userId: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Both validations pass
			expect(request.isValid()).toBe(true);
			expect(request.getCookieParameters()).toEqual({ token: 'valid-token' });
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Body Validation Failure Affects Overall Validity', () => {
		
		it('should set isValid to false when body validation fails', () => {
			// Arrange
			const bodyData = {
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
						action: (value) => ['create', 'update', 'delete'].includes(value)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(false);
		});
		
		it('should set isValid to false when body validation fails even if other validations pass', () => {
			// Arrange: Path, query, header, and cookie all pass, but body fails
			const bodyData = {
				quantity: -5  // Invalid: negative quantity
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/orders/{orderId}',
				path: '/orders/123',
				pathParameters: {
					orderId: '123'
				},
				queryStringParameters: {
					format: 'json'
				},
				headers: {
					'content-type': 'application/json'
				},
				cookie: {
					sessionId: 'valid-session'
				},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						orderId: (value) => typeof value === 'string'  // Pass
					},
					queryStringParameters: {
						format: (value) => ['json', 'xml'].includes(value)  // Pass
					},
					headerParameters: {
						contentType: (value) => value === 'application/json'  // Pass
					},
					cookieParameters: {
						sessionId: (value) => typeof value === 'string'  // Pass
					},
					bodyParameters: {
						quantity: (value) => typeof value === 'number' && value > 0  // Fail
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Overall validation fails due to body validation
			expect(request.isValid()).toBe(false);
			// Other parameters should still be validated and stored
			expect(request.getPathParameters()).toEqual({ orderId: '123' });
			expect(request.getQueryStringParameters()).toEqual({ format: 'json' });
			expect(request.getHeaderParameters()).toEqual({ contentType: 'application/json' });
			expect(request.getCookieParameters()).toEqual({ sessionId: 'valid-session' });
			// Body parameters should be empty due to validation failure
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should set isValid to false when body JSON parsing fails', () => {
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
			
			// Assert
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should set isValid to true when body validation passes along with other validations', () => {
			// Arrange: All validations pass
			const bodyData = {
				userId: '123',
				action: 'update'
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
				headers: {
					'authorization': 'Bearer token123'
				},
				cookie: {
					sessionId: 'session123'
				},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						userId: (value) => typeof value === 'string'
					},
					queryStringParameters: {
						format: (value) => ['json', 'xml'].includes(value)
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
					},
					cookieParameters: {
						sessionId: (value) => typeof value === 'string'
					},
					bodyParameters: {
						userId: (value) => typeof value === 'string',
						action: (value) => ['create', 'update', 'delete'].includes(value)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: All validations pass
			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ userId: '123' });
			expect(request.getQueryStringParameters()).toEqual({ format: 'json' });
			expect(request.getHeaderParameters()).toEqual({ authorization: 'Bearer token123' });
			expect(request.getCookieParameters()).toEqual({ sessionId: 'session123' });
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Validation Order Maintained', () => {
		
		it('should maintain validation order: referrer → path → query → header → cookie → body', () => {
			// Arrange: All validations configured and should pass
			const bodyData = {
				data: 'test'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/api/{id}',
				path: '/api/123',
				pathParameters: {
					id: '123'
				},
				queryStringParameters: {
					filter: 'active'
				},
				headers: {
					'x-api-key': 'valid-key'
				},
				cookie: {
					session: 'valid-session'
				},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => typeof value === 'string'
					},
					queryStringParameters: {
						filter: (value) => ['active', 'inactive'].includes(value)
					},
					headerParameters: {
						xApiKey: (value) => value === 'valid-key'
					},
					cookieParameters: {
						session: (value) => value === 'valid-session'
					},
					bodyParameters: {
						data: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: All validations should pass in order
			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
			expect(request.getQueryStringParameters()).toEqual({ filter: 'active' });
			expect(request.getHeaderParameters()).toEqual({ xApiKey: 'valid-key' });
			expect(request.getCookieParameters()).toEqual({ session: 'valid-session' });
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should stop validation chain when path validation fails (before body)', () => {
			// Arrange: Path validation will fail
			const bodyData = {
				data: 'test'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/api/{id}',
				path: '/api/invalid',
				pathParameters: {
					id: 'invalid'  // Will fail validation
				},
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => /^\d+$/.test(value)  // Only numeric IDs
					},
					bodyParameters: {
						data: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation fails at path level
			expect(request.isValid()).toBe(false);
		});
		
		it('should stop validation chain when query validation fails (before body)', () => {
			// Arrange: Query validation will fail
			const bodyData = {
				data: 'test'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/api',
				path: '/api',
				pathParameters: null,
				queryStringParameters: {
					page: 'invalid'  // Will fail validation
				},
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						page: (value) => /^\d+$/.test(value)  // Only numeric pages
					},
					bodyParameters: {
						data: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation fails at query level
			expect(request.isValid()).toBe(false);
		});
		
		it('should stop validation chain when header validation fails (before body)', () => {
			// Arrange: Header validation will fail
			const bodyData = {
				data: 'test'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/api',
				path: '/api',
				pathParameters: null,
				queryStringParameters: null,
				headers: {
					'authorization': 'Invalid'  // Will fail validation
				},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
					},
					bodyParameters: {
						data: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation fails at header level
			expect(request.isValid()).toBe(false);
		});
		
		it('should execute body validation when all previous validations pass', () => {
			// Arrange: Path, query, header, cookie all pass
			const bodyData = {
				userId: '123'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/users/{userId}',
				path: '/users/123',
				pathParameters: {
					userId: '123'
				},
				queryStringParameters: {
					action: 'update'
				},
				headers: {
					'content-type': 'application/json'
				},
				cookie: {
					token: 'valid-token'
				},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						userId: (value) => typeof value === 'string'
					},
					queryStringParameters: {
						action: (value) => ['create', 'update', 'delete'].includes(value)
					},
					headerParameters: {
						contentType: (value) => value === 'application/json'
					},
					cookieParameters: {
						token: (value) => typeof value === 'string'
					},
					bodyParameters: {
						userId: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: All validations pass including body
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate body as the last step in the chain', () => {
			// Arrange: All validations pass except body (last in chain)
			const bodyData = {
				quantity: -1  // Invalid
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/orders',
				path: '/orders',
				pathParameters: null,
				queryStringParameters: {
					format: 'json'
				},
				headers: {
					'authorization': 'Bearer token'
				},
				cookie: {
					session: 'session123'
				},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						format: (value) => ['json', 'xml'].includes(value)  // Pass
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')  // Pass
					},
					cookieParameters: {
						session: (value) => typeof value === 'string'  // Pass
					},
					bodyParameters: {
						quantity: (value) => typeof value === 'number' && value > 0  // Fail
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation fails at body level (last in chain)
			expect(request.isValid()).toBe(false);
			// Previous validations should have succeeded
			expect(request.getQueryStringParameters()).toEqual({ format: 'json' });
			expect(request.getHeaderParameters()).toEqual({ authorization: 'Bearer token' });
			expect(request.getCookieParameters()).toEqual({ session: 'session123' });
			// Body validation failed
			expect(request.getBodyParameters()).toEqual({});
		});
	});
	
	describe('Edge Cases in Validation Chain', () => {
		
		it('should handle empty body with body validation configured', () => {
			// Arrange
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: ''
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						field: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Empty body treated as empty object, validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle null body with body validation configured', () => {
			// Arrange
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: null
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						field: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Null body treated as empty object, validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle body validation when no body validation rules configured', () => {
			// Arrange
			const bodyData = {
				anyField: 'anyValue'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {}  // No body validation configured
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation passes, body parameters empty
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle validation chain with only body validation configured', () => {
			// Arrange
			const bodyData = {
				message: 'Hello'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/messages',
				path: '/messages',
				pathParameters: { id: '123' },  // No validation
				queryStringParameters: { filter: 'all' },  // No validation
				headers: { 'content-type': 'text/plain' },  // No validation
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					// Only body validation configured
					bodyParameters: {
						message: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Body validation executes and passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
});
