/**
 * Unit Tests: Body Validation
 * 
 * Tests the body parameter validation functionality in ClientRequest class.
 * Validates JSON parsing, validation execution, and error handling.
 * 
 * Requirements tested:
 * - 1.1: Body parameter validation using ValidationMatcher and ValidationExecutor
 * - 1.2: Storing validated parameters in bodyParameters
 * - 1.3: Retrieving validated parameters via getBodyParameters()
 * - 1.4: Setting isValid to false when body validation fails
 * - 1.5: JSON parsing before validation
 * - 7.1: Null/undefined/empty body handling
 * - 7.2: Invalid JSON error handling
 * - 7.3: Validation exception handling
 */

import { describe, it, expect, afterEach } from '@jest/globals';

// Import ClientRequest class
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

// Mock Lambda context
const mockContext = {
	getRemainingTimeInMillis: () => 30000
};

describe('Body Validation - Unit Tests', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Valid JSON Body with Valid Parameters', () => {
		
		it('should validate and store body parameters when JSON is valid and passes validation', () => {
			// Arrange
			const bodyData = {
				userId: '12345',
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
						userId: (value) => typeof value === 'string' && value.length > 0,
						action: (value) => ['create', 'update', 'delete'].includes(value)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate body with single field', () => {
			// Arrange
			const bodyData = { message: 'Hello World' };
			
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
		
		it('should validate body with numeric fields', () => {
			// Arrange
			const bodyData = {
				quantity: 5,
				price: 29.99
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
						quantity: (value) => typeof value === 'number' && value > 0,
						price: (value) => typeof value === 'number' && value > 0
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate body with boolean fields', () => {
			// Arrange
			const bodyData = {
				active: true,
				verified: false
			};
			
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
						verified: (value) => typeof value === 'boolean'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Empty Body Treated as Empty Object', () => {
		
		it('should treat null body as empty object', () => {
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
					bodyParameters: {}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should treat undefined body as empty object', () => {
			// Arrange
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
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
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should treat empty string body as empty object', () => {
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
					bodyParameters: {}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should validate successfully with empty body when no required fields', () => {
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
						// Optional field validation
						optionalField: (value) => value === undefined || typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
	});
	
	describe('Body with Multiple Fields', () => {
		
		it('should validate body with multiple string fields', () => {
			// Arrange
			const bodyData = {
				firstName: 'John',
				lastName: 'Doe',
				email: 'john.doe@example.com'
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
						firstName: (value) => typeof value === 'string' && value.length > 0,
						lastName: (value) => typeof value === 'string' && value.length > 0,
						email: (value) => typeof value === 'string' && value.includes('@')
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate body with mixed types', () => {
			// Arrange
			const bodyData = {
				name: 'Product A',
				price: 99.99,
				inStock: true,
				quantity: 10
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/products',
				path: '/products',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						name: (value) => typeof value === 'string',
						price: (value) => typeof value === 'number' && value > 0,
						inStock: (value) => typeof value === 'boolean',
						quantity: (value) => typeof value === 'number' && value >= 0
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate body with nested objects', () => {
			// Arrange
			const bodyData = {
				user: {
					id: '123',
					name: 'John'
				},
				metadata: {
					timestamp: 1234567890
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
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate body with arrays', () => {
			// Arrange
			const bodyData = {
				items: ['item1', 'item2', 'item3'],
				tags: ['tag1', 'tag2']
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
						tags: (value) => Array.isArray(value)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Invalid JSON Body (Parsing Error)', () => {
		
		it('should set isValid to false when body is invalid JSON', () => {
			// Arrange
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: '{invalid json}'
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
			
			// Assert
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle malformed JSON with missing closing brace', () => {
			// Arrange
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: '{"field": "value"'
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle JSON with trailing comma', () => {
			// Arrange
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: '{"field": "value",}'
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle non-JSON string', () => {
			// Arrange
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: 'This is not JSON'
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle JSON with single quotes instead of double quotes', () => {
			// Arrange
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: "{'field': 'value'}"
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
	});
	
	describe('Valid JSON but Fails Validation Rules', () => {
		
		it('should set isValid to false when field fails validation', () => {
			// Arrange
			const bodyData = {
				userId: '123',
				action: 'invalid-action'  // Not in allowed list
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
			
			// Assert
			expect(request.isValid()).toBe(false);
		});
		
		it('should fail validation when type is incorrect', () => {
			// Arrange
			const bodyData = {
				quantity: 'five'  // Should be number
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
						quantity: (value) => typeof value === 'number' && value > 0
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(false);
		});
		
		it('should fail validation when value is out of range', () => {
			// Arrange
			const bodyData = {
				age: -5  // Negative age
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
						age: (value) => typeof value === 'number' && value >= 0 && value <= 150
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(false);
		});
		
		it('should fail validation when format is incorrect', () => {
			// Arrange
			const bodyData = {
				email: 'not-an-email'  // Missing @
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
						email: (value) => typeof value === 'string' && value.includes('@')
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(false);
		});
		
		it('should fail validation when multiple fields fail', () => {
			// Arrange
			const bodyData = {
				userId: '',  // Empty string
				action: 'invalid',  // Not in allowed list
				quantity: -1  // Negative
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
						userId: (value) => typeof value === 'string' && value.length > 0,
						action: (value) => ['create', 'update', 'delete'].includes(value),
						quantity: (value) => typeof value === 'number' && value > 0
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(false);
		});
	});
	
	describe('Missing Required Fields', () => {
		
		it('should pass validation when field is missing and no validation rule checks for it', () => {
			// Arrange: ValidationExecutor only validates fields that exist in the body
			// If a field is missing, its validation function is never called
			const bodyData = {
				// Missing userId field
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
			
			// Assert: Validation passes because only present fields are validated
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should fail validation using multi-parameter validation for required fields', () => {
			// Arrange: Use multi-parameter validation to check for required fields
			const bodyData = {
				// Missing userId field
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
						BY_ROUTE: [
							{
								route: 'users?userId,action',
								validate: ({ userId, action }) => {
									// Multi-parameter validation can check for required fields
									return userId !== undefined && 
									       action !== undefined &&
									       typeof userId === 'string' &&
									       ['create', 'update', 'delete'].includes(action);
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation fails because multi-parameter check detects missing field
			expect(request.isValid()).toBe(false);
		});
		
		it('should pass validation when optional field is missing', () => {
			// Arrange
			const bodyData = {
				userId: '123'
				// Missing optional description field
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
						description: (value) => value === undefined || typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should fail validation when field is null but required', () => {
			// Arrange
			const bodyData = {
				userId: null  // Null instead of string
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
						userId: (value) => value !== null && typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(false);
		});
	});
	
	describe('Edge Cases and Special Scenarios', () => {
		
		it('should handle empty JSON object', () => {
			// Arrange
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: '{}'
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle body with extra fields not in validation', () => {
			// Arrange: ValidationExecutor only returns validated fields
			const bodyData = {
				userId: '123',
				action: 'update',
				extraField: 'not validated'
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
			
			// Assert: Only validated fields are returned
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({
				userId: '123',
				action: 'update'
				// extraField is not included because it wasn't validated
			});
		});
		
		it('should handle body with special characters in values', () => {
			// Arrange
			const bodyData = {
				message: 'Hello "World" with <special> & characters!'
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
		
		it('should handle body with Unicode characters', () => {
			// Arrange
			const bodyData = {
				name: '日本語',
				emoji: '😀🎉'
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
						emoji: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should handle body with very long strings', () => {
			// Arrange
			const longString = 'a'.repeat(10000);
			const bodyData = {
				content: longString
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/content',
				path: '/content',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						content: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should handle body with zero values', () => {
			// Arrange
			const bodyData = {
				count: 0,
				price: 0.0
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
						count: (value) => typeof value === 'number',
						price: (value) => typeof value === 'number'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should handle body with false boolean value', () => {
			// Arrange
			const bodyData = {
				active: false
			};
			
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
						active: (value) => typeof value === 'boolean'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('No Body Validation Configuration', () => {
		
		it('should pass validation when no body validation is configured', () => {
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
				parameters: {}  // No bodyParameters configured
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should return empty object when no body validation configured and body is null', () => {
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
				parameters: {}  // No bodyParameters configured
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
	});
});
