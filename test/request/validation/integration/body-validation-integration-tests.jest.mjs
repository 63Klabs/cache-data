/**
 * Integration Tests: Body Validation
 * 
 * Tests the end-to-end body validation workflow in ClientRequest class.
 * Validates the complete flow from JSON parsing through validation to parameter retrieval.
 * 
 * Requirements tested:
 * - 1.1: Body parameter validation using ValidationMatcher and ValidationExecutor
 * - 1.2: Storing validated parameters in bodyParameters
 * - 1.3: Retrieving validated parameters via getBodyParameters()
 * - 1.4: Setting isValid to false when body validation fails
 * - 1.5: JSON parsing before validation
 * 
 * Integration test scope:
 * - Complete workflow from event.body to getBodyParameters()
 * - Interaction between ClientRequest, ValidationMatcher, and ValidationExecutor
 * - JSON parsing, validation execution, and parameter storage
 * - Error handling and edge cases in the complete flow
 */

import { describe, it, expect, afterEach } from '@jest/globals';

// Import ClientRequest class
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

// Mock Lambda context
const mockContext = {
	getRemainingTimeInMillis: () => 30000
};

describe('Body Validation - Integration Tests', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('End-to-End Body Validation Workflow', () => {
		
		it('should complete full workflow: JSON parsing → validation → storage → retrieval', () => {
			// Arrange: Complete body validation configuration
			const bodyData = {
				userId: '12345',
				email: 'user@example.com',
				age: 25,
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
						userId: (value) => typeof value === 'string' && value.length > 0,
						email: (value) => typeof value === 'string' && value.includes('@'),
						age: (value) => typeof value === 'number' && value >= 0 && value <= 150,
						active: (value) => typeof value === 'boolean'
					}
				}
			});
			
			// Act: Create ClientRequest (triggers full workflow)
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Verify complete workflow
			expect(request.isValid()).toBe(true);
			
			const retrievedParams = request.getBodyParameters();
			expect(retrievedParams).toEqual(bodyData);
			expect(retrievedParams.userId).toBe('12345');
			expect(retrievedParams.email).toBe('user@example.com');
			expect(retrievedParams.age).toBe(25);
			expect(retrievedParams.active).toBe(true);
		});
		
		it('should handle workflow with valid body and multiple validation rules', () => {
			// Arrange: Complex validation rules
			const bodyData = {
				username: 'john_doe',
				password: 'SecurePass123!',
				confirmPassword: 'SecurePass123!',
				email: 'john@example.com',
				terms: true
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/register',
				path: '/register',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						username: (value) => /^[a-zA-Z0-9_-]{3,20}$/.test(value),
						password: (value) => value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value),
						confirmPassword: (value) => value.length >= 8,
						email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
						terms: (value) => value === true
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: All validations pass
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should handle workflow with invalid body (validation failure)', () => {
			// Arrange: Body that fails validation
			const bodyData = {
				userId: '',  // Empty string - fails validation
				email: 'invalid-email',  // Missing @ - fails validation
				age: -5  // Negative age - fails validation
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
						email: (value) => typeof value === 'string' && value.includes('@'),
						age: (value) => typeof value === 'number' && value >= 0
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation fails
			expect(request.isValid()).toBe(false);
		});
		
		it('should handle workflow with invalid JSON (parsing failure)', () => {
			// Arrange: Invalid JSON body
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
			
			// Assert: Parsing failure causes validation failure
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
	});
	
	describe('Integration with ValidationMatcher and ValidationExecutor', () => {
		
		it('should use ValidationMatcher to find global validation rules', () => {
			// Arrange: Global validation rules
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
						// Global validation rules
						productId: (value) => typeof value === 'string' && value.startsWith('P-'),
						quantity: (value) => typeof value === 'number' && value > 0
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: ValidationMatcher finds and applies global rules
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should use ValidationMatcher to find route-specific validation rules', () => {
			// Arrange: Route-specific validation
			const bodyData = {
				orderId: 'ORD-12345',
				status: 'shipped'
			};
			
			const event = {
				httpMethod: 'PUT',
				resource: '/orders/{id}',
				path: '/orders/123',
				pathParameters: { id: '123' },
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						orderId: (value) => typeof value === 'string',  // Global fallback
						BY_ROUTE: [
							{
								route: 'orders/{id}?orderId,status',
								validate: ({ orderId, status }) => {
									return orderId.startsWith('ORD-') && 
									       ['pending', 'shipped', 'delivered'].includes(status);
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: ValidationMatcher finds and applies route-specific rules
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should use ValidationMatcher to find method-specific validation rules', () => {
			// Arrange: Method-specific validation
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
			
			// Assert: ValidationMatcher finds and applies method-specific rules
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should use ValidationExecutor with single-parameter validation interface', () => {
			// Arrange: Single-parameter validation
			const bodyData = {
				username: 'john_doe',
				email: 'john@example.com'
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
						// Single-parameter validation functions
						username: (value) => /^[a-zA-Z0-9_-]+$/.test(value),
						email: (value) => value.includes('@')
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: ValidationExecutor executes single-parameter validations
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should use ValidationExecutor with multi-parameter validation interface', () => {
			// Arrange: Multi-parameter validation
			const bodyData = {
				password: 'SecurePass123',
				confirmPassword: 'SecurePass123'
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
								route: 'users?password,confirmPassword',
								validate: ({ password, confirmPassword }) => {
									// Multi-parameter validation
									return password === confirmPassword && password.length >= 8;
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: ValidationExecutor executes multi-parameter validation
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Complete Flow with Different Body Types', () => {
		
		it('should handle nested object validation', () => {
			// Arrange: Nested object in body
			const bodyData = {
				user: {
					id: '123',
					name: 'John Doe',
					email: 'john@example.com'
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
						user: (value) => {
							return value && 
							       typeof value === 'object' &&
							       value.id && 
							       value.name && 
							       value.email &&
							       value.email.includes('@');
						},
						metadata: (value) => {
							return value && 
							       typeof value === 'object' &&
							       typeof value.timestamp === 'number' &&
							       typeof value.source === 'string';
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Nested objects validated correctly
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
			expect(request.getBodyParameters().user.name).toBe('John Doe');
			expect(request.getBodyParameters().metadata.timestamp).toBe(1234567890);
		});
		
		it('should handle array validation', () => {
			// Arrange: Array in body
			const bodyData = {
				items: [
					{ id: 'item-1', quantity: 2 },
					{ id: 'item-2', quantity: 1 },
					{ id: 'item-3', quantity: 5 }
				],
				total: 8
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
						items: (value) => {
							return Array.isArray(value) &&
							       value.length > 0 &&
							       value.every(item => 
							         item.id && 
							         typeof item.quantity === 'number' &&
							         item.quantity > 0
							       );
						},
						total: (value) => typeof value === 'number' && value > 0
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Array validated correctly
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
			expect(request.getBodyParameters().items).toHaveLength(3);
			expect(request.getBodyParameters().items[0].id).toBe('item-1');
		});
		
		it('should handle empty body with no validation rules', () => {
			// Arrange: Empty body, no validation
			const event = {
				httpMethod: 'POST',
				resource: '/ping',
				path: '/ping',
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
			
			// Assert: Empty body passes validation
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle body with special characters', () => {
			// Arrange: Body with special characters
			const bodyData = {
				message: 'Hello "World" with <special> & characters!',
				description: 'Line 1\nLine 2\tTabbed',
				emoji: '😀🎉'
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
						message: (value) => typeof value === 'string',
						description: (value) => typeof value === 'string',
						emoji: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Special characters handled correctly
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
			expect(request.getBodyParameters().message).toContain('"World"');
			expect(request.getBodyParameters().emoji).toBe('😀🎉');
		});
	});
	
	describe('Error Handling in Complete Flow', () => {
		
		it('should handle JSON parsing error and return empty body parameters', () => {
			// Arrange: Malformed JSON
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: '{"userId": "123", invalid}'
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
			
			// Assert: Parsing error handled gracefully
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle validation exception and fail gracefully', () => {
			// Arrange: Validation function that throws
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
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						userId: (value) => {
							// Validation function that throws
							throw new Error('Validation error');
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Exception handled, validation fails
			expect(request.isValid()).toBe(false);
		});
		
		it('should handle null body with validation rules configured', () => {
			// Arrange: Null body with validation rules
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
					bodyParameters: {
						userId: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Null body treated as empty object, validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
	});
	
	describe('Integration with Other Parameter Types', () => {
		
		it('should validate body parameters alongside path parameters', () => {
			// Arrange: Both path and body parameters
			const bodyData = {
				name: 'Updated Name',
				email: 'updated@example.com'
			};
			
			const event = {
				httpMethod: 'PUT',
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					bodyParameters: {
						name: (value) => typeof value === 'string' && value.length > 0,
						email: (value) => typeof value === 'string' && value.includes('@')
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Both parameter types validated
			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate body parameters alongside query parameters', () => {
			// Arrange: Both query and body parameters
			const bodyData = {
				content: 'Post content'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/posts',
				path: '/posts',
				pathParameters: null,
				queryStringParameters: { draft: 'true' },
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						draft: (value) => value === 'true' || value === 'false'
					},
					bodyParameters: {
						content: (value) => typeof value === 'string' && value.length > 0
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Both parameter types validated
			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ draft: 'true' });
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should fail validation when body fails but other parameters pass', () => {
			// Arrange: Valid path, invalid body
			const bodyData = {
				email: 'invalid-email'  // Missing @
			};
			
			const event = {
				httpMethod: 'PUT',
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					bodyParameters: {
						email: (value) => typeof value === 'string' && value.includes('@')
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Overall validation fails due to body
			expect(request.isValid()).toBe(false);
		});
		
		it('should fail validation when path fails but body passes', () => {
			// Arrange: Invalid path, valid body
			const bodyData = {
				email: 'valid@example.com'
			};
			
			const event = {
				httpMethod: 'PUT',
				resource: '/users/{id}',
				path: '/users/abc',  // Invalid - not numeric
				pathParameters: { id: 'abc' },
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					bodyParameters: {
						email: (value) => typeof value === 'string' && value.includes('@')
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Overall validation fails due to path
			expect(request.isValid()).toBe(false);
		});
	});
	
	describe('Real-World Scenarios', () => {
		
		it('should handle user registration with password confirmation', () => {
			// Arrange: User registration payload
			const bodyData = {
				username: 'john_doe',
				email: 'john@example.com',
				password: 'SecurePass123',
				confirmPassword: 'SecurePass123',
				terms: true
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/register',
				path: '/register',
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
								route: 'register?username,email,password,confirmPassword,terms',
								validate: ({ username, email, password, confirmPassword, terms }) => {
									return username && 
									       email && 
									       email.includes('@') &&
									       password && 
									       password.length >= 8 &&
									       password === confirmPassword &&
									       terms === true;
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Registration validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should handle order creation with items and shipping', () => {
			// Arrange: Order creation payload
			const bodyData = {
				items: [
					{ productId: 'P-001', quantity: 2, price: 29.99 },
					{ productId: 'P-002', quantity: 1, price: 49.99 }
				],
				shipping: {
					address: '123 Main St',
					city: 'Boston',
					zipCode: '02101'
				},
				paymentMethod: 'credit_card'
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
						items: (value) => {
							return Array.isArray(value) &&
							       value.length > 0 &&
							       value.every(item => 
							         item.productId &&
							         typeof item.quantity === 'number' &&
							         item.quantity > 0 &&
							         typeof item.price === 'number' &&
							         item.price > 0
							       );
						},
						shipping: (value) => {
							return value &&
							       typeof value === 'object' &&
							       value.address &&
							       value.city &&
							       value.zipCode &&
							       /^\d{5}$/.test(value.zipCode);
						},
						paymentMethod: (value) => {
							return ['credit_card', 'paypal', 'bank_transfer'].includes(value);
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Order validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
			expect(request.getBodyParameters().items).toHaveLength(2);
			expect(request.getBodyParameters().shipping.zipCode).toBe('02101');
		});
		
		it('should handle profile update with partial fields', () => {
			// Arrange: Profile update with only some fields
			const bodyData = {
				bio: 'Updated bio text',
				website: 'https://example.com'
				// name and email not included - partial update
			};
			
			const event = {
				httpMethod: 'PATCH',
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					bodyParameters: {
						BY_ROUTE: [
							{
								route: 'PATCH:users/{id}',
								validate: (body) => {
									// At least one field must be provided
									const hasAtLeastOneField = body.bio || body.website || body.name || body.email;
									
									// Validate provided fields
									const bioValid = !body.bio || (typeof body.bio === 'string' && body.bio.length <= 500);
									const websiteValid = !body.website || (typeof body.website === 'string' && body.website.startsWith('http'));
									
									return hasAtLeastOneField && bioValid && websiteValid;
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Partial update validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
});
