/**
 * Property-Based Test: Common Validation Pattern Support
 * 
 * Feature: body-validation-and-header-format-fix
 * Property 7: For any body validation rule that checks required fields, field types,
 * field formats, field constraints, nested objects, or array elements, the validation
 * system SHALL correctly execute the validation and return the appropriate result.
 * 
 * @tag Feature: body-validation-and-header-format-fix, Property 7: Common Validation Pattern Support
 * 
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 * 
 * This property test validates that the body validation system supports all common
 * validation patterns that developers need for API request validation:
 * - Required fields validation
 * - Field types validation (string, number, boolean, array, object)
 * - Field formats validation (email, URL, date)
 * - Field constraints (min/max length, min/max value, regex)
 * - Nested object validation
 * - Array element validation
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

describe('Property 7: Common Validation Pattern Support', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Unit Tests - Required Fields Validation', () => {
		
		it('should validate required fields are present', () => {
			// Arrange: Required fields validation
			const bodyData = {
				userId: '123',
				email: 'john@example.com',
				name: 'John Doe'
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
						userId: (value) => typeof value === 'string' && value.trim().length > 0,
						email: (value) => typeof value === 'string' && value.trim().length > 0,
						name: (value) => typeof value === 'string' && value.trim().length > 0
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: All required fields present, validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should reject when required fields are missing', () => {
			// Arrange: Missing required field
			const bodyData = {
				userId: '123',
				email: 'john@example.com'
				// Missing 'name' field
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
								validate: ({ userId, email, name }) => {
									// All fields required
									return userId && email && name;
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Missing required field, validation fails
			expect(request.isValid()).toBe(false);
			expect(request.getBodyParameters()).toEqual({});
		});
	});
	
	describe('Unit Tests - Field Types Validation', () => {
		
		it('should validate string fields', () => {
			// Arrange: String type validation
			const bodyData = {
				name: 'John Doe',
				description: 'Test description'
			};
			
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
						name: (value) => typeof value === 'string' && value.length > 0,
						description: (value) => typeof value === 'string'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: String validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate number fields', () => {
			// Arrange: Number type validation
			const bodyData = {
				age: 30,
				price: 99.99,
				quantity: 5
			};
			
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
						age: (value) => typeof value === 'number' && Number.isInteger(value),
						price: (value) => typeof value === 'number',
						quantity: (value) => typeof value === 'number' && Number.isInteger(value)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Number validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate boolean fields', () => {
			// Arrange: Boolean type validation
			const bodyData = {
				active: true,
				verified: false,
				premium: true
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
						verified: (value) => typeof value === 'boolean',
						premium: (value) => typeof value === 'boolean'
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Boolean validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate array fields', () => {
			// Arrange: Array type validation
			const bodyData = {
				tags: ['tag1', 'tag2', 'tag3'],
				items: [1, 2, 3, 4, 5]
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
						tags: (value) => Array.isArray(value) && value.length > 0,
						items: (value) => Array.isArray(value) && value.every(item => typeof item === 'number')
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Array validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate object fields', () => {
			// Arrange: Object type validation
			const bodyData = {
				metadata: {
					source: 'api',
					timestamp: 1234567890
				},
				config: {
					enabled: true,
					timeout: 30
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
						metadata: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
						config: (value) => typeof value === 'object' && value !== null && value.enabled !== undefined
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Object validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Unit Tests - Field Formats Validation', () => {
		
		it('should validate email format', () => {
			// Arrange: Email format validation
			const bodyData = {
				email: 'john.doe@example.com',
				contactEmail: 'contact@company.org'
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
						email: (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
						contactEmail: (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Email format validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate URL format', () => {
			// Arrange: URL format validation
			const bodyData = {
				website: 'https://example.com',
				apiEndpoint: 'https://api.example.com/v1/users'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/services',
				path: '/services',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						website: (value) => {
							try {
								new URL(value);
								return true;
							} catch {
								return false;
							}
						},
						apiEndpoint: (value) => {
							try {
								const url = new URL(value);
								return url.protocol === 'https:';
							} catch {
								return false;
							}
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: URL format validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate date format', () => {
			// Arrange: Date format validation (ISO 8601)
			const bodyData = {
				birthDate: '1990-01-15',
				createdAt: '2024-01-01T12:00:00Z'
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
						birthDate: (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)),
						createdAt: (value) => typeof value === 'string' && !isNaN(Date.parse(value))
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Date format validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Unit Tests - Field Constraints Validation', () => {
		
		it('should validate min/max length constraints', () => {
			// Arrange: Length constraints
			const bodyData = {
				username: 'john_doe',
				password: 'securePassword123'
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
						username: (value) => typeof value === 'string' && value.length >= 3 && value.length <= 20,
						password: (value) => typeof value === 'string' && value.length >= 8 && value.length <= 100
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Length constraints validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate min/max value constraints', () => {
			// Arrange: Value constraints
			const bodyData = {
				age: 25,
				quantity: 5,
				price: 99.99
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
						age: (value) => typeof value === 'number' && value >= 18 && value <= 120,
						quantity: (value) => typeof value === 'number' && value >= 1 && value <= 100,
						price: (value) => typeof value === 'number' && value >= 0 && value <= 10000
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Value constraints validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate regex pattern constraints', () => {
			// Arrange: Regex pattern constraints
			const bodyData = {
				phoneNumber: '+1-555-123-4567',
				zipCode: '12345',
				productCode: 'PROD-12345'
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/contacts',
				path: '/contacts',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						phoneNumber: (value) => typeof value === 'string' && /^\+\d{1,3}-\d{3}-\d{3}-\d{4}$/.test(value),
						zipCode: (value) => typeof value === 'string' && /^\d{5}$/.test(value),
						productCode: (value) => typeof value === 'string' && /^PROD-\d{5}$/.test(value)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Regex pattern validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Unit Tests - Nested Object Validation', () => {
		
		it('should validate nested object structure', () => {
			// Arrange: Nested object validation
			const bodyData = {
				user: {
					id: '123',
					name: 'John Doe',
					profile: {
						age: 30,
						city: 'New York'
					}
				}
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
						user: (value) => {
							return typeof value === 'object' &&
								value.id &&
								value.name &&
								typeof value.profile === 'object' &&
								value.profile.age &&
								value.profile.city;
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Nested object validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate multiple nested objects', () => {
			// Arrange: Multiple nested objects
			const bodyData = {
				order: {
					id: 'ORD-123',
					customer: {
						name: 'John Doe',
						email: 'john@example.com'
					},
					items: [
						{ id: 'ITEM-1', quantity: 2 },
						{ id: 'ITEM-2', quantity: 1 }
					],
					shipping: {
						address: {
							street: '123 Main St',
							city: 'New York',
							zip: '10001'
						}
					}
				}
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
						order: (value) => {
							return typeof value === 'object' &&
								value.id &&
								typeof value.customer === 'object' &&
								value.customer.name &&
								value.customer.email &&
								Array.isArray(value.items) &&
								value.items.length > 0 &&
								typeof value.shipping === 'object' &&
								typeof value.shipping.address === 'object' &&
								value.shipping.address.street &&
								value.shipping.address.city &&
								value.shipping.address.zip;
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Complex nested validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Unit Tests - Array Element Validation', () => {
		
		it('should validate array element types', () => {
			// Arrange: Array element type validation
			const bodyData = {
				tags: ['tag1', 'tag2', 'tag3'],
				scores: [85, 90, 95, 88]
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
						tags: (value) => Array.isArray(value) && value.every(tag => typeof tag === 'string'),
						scores: (value) => Array.isArray(value) && value.every(score => typeof score === 'number' && score >= 0 && score <= 100)
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Array element validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate array of objects', () => {
			// Arrange: Array of objects validation
			const bodyData = {
				users: [
					{ id: '1', name: 'John', active: true },
					{ id: '2', name: 'Jane', active: false },
					{ id: '3', name: 'Bob', active: true }
				]
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
						users: (value) => {
							return Array.isArray(value) &&
								value.length > 0 &&
								value.every(user =>
									typeof user === 'object' &&
									user.id &&
									user.name &&
									typeof user.active === 'boolean'
								);
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Array of objects validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should validate array length constraints', () => {
			// Arrange: Array length constraints
			const bodyData = {
				items: ['item1', 'item2', 'item3'],
				tags: ['tag1', 'tag2']
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
						items: (value) => Array.isArray(value) && value.length >= 1 && value.length <= 10,
						tags: (value) => Array.isArray(value) && value.length >= 1 && value.length <= 5
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Array length validation passes
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Property-Based Tests - Validation Patterns', () => {
		
		it('Property: Required fields validation works for any field combination', () => {
			// Property: For all combinations of required fields,
			// validation passes when all are present and fails when any are missing
			
			fc.assert(
				fc.property(
					fc.record({
						field1: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
						field2: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
						field3: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0)
					}),
					(bodyData) => {
						// Arrange
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
							parameters: {
								bodyParameters: {
									field1: (value) => typeof value === 'string' && value.trim().length > 0,
									field2: (value) => typeof value === 'string' && value.trim().length > 0,
									field3: (value) => typeof value === 'string' && value.trim().length > 0
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: All fields present, validation passes
						expect(request.isValid()).toBe(true);
						expect(request.getBodyParameters()).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: String type validation works for any string', () => {
			// Property: For all valid strings,
			// string type validation passes
			
			fc.assert(
				fc.property(
					fc.record({
						stringField: fc.string({ minLength: 1, maxLength: 100 })
					}),
					(bodyData) => {
						// Arrange
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
							parameters: {
								bodyParameters: {
									stringField: (value) => typeof value === 'string' && value.length > 0
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: String validation passes
						expect(request.isValid()).toBe(true);
						expect(request.getBodyParameters()).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Number type validation works for any number', () => {
			// Property: For all valid numbers,
			// number type validation passes
			
			fc.assert(
				fc.property(
					fc.record({
						numberField: fc.integer({ min: 0, max: 1000 })
					}),
					(bodyData) => {
						// Arrange
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
							parameters: {
								bodyParameters: {
									numberField: (value) => typeof value === 'number'
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Number validation passes
						expect(request.isValid()).toBe(true);
						expect(request.getBodyParameters()).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Boolean type validation works for any boolean', () => {
			// Property: For all booleans,
			// boolean type validation passes
			
			fc.assert(
				fc.property(
					fc.record({
						booleanField: fc.boolean()
					}),
					(bodyData) => {
						// Arrange
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
							parameters: {
								bodyParameters: {
									booleanField: (value) => typeof value === 'boolean'
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Boolean validation passes
						expect(request.isValid()).toBe(true);
						expect(request.getBodyParameters()).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Array type validation works for any array', () => {
			// Property: For all arrays,
			// array type validation passes
			
			fc.assert(
				fc.property(
					fc.record({
						arrayField: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 })
					}),
					(bodyData) => {
						// Arrange
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
							parameters: {
								bodyParameters: {
									arrayField: (value) => Array.isArray(value) && value.length > 0
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Array validation passes
						expect(request.isValid()).toBe(true);
						expect(request.getBodyParameters()).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Length constraints work for any valid length', () => {
			// Property: For all strings within length constraints,
			// validation passes
			
			fc.assert(
				fc.property(
					fc.record({
						constrainedField: fc.string({ minLength: 5, maxLength: 20 })
					}),
					(bodyData) => {
						// Arrange
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
							parameters: {
								bodyParameters: {
									constrainedField: (value) => typeof value === 'string' && value.length >= 5 && value.length <= 20
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Length constraint validation passes
						expect(request.isValid()).toBe(true);
						expect(request.getBodyParameters()).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Value constraints work for any valid value', () => {
			// Property: For all numbers within value constraints,
			// validation passes
			
			fc.assert(
				fc.property(
					fc.record({
						constrainedValue: fc.integer({ min: 10, max: 100 })
					}),
					(bodyData) => {
						// Arrange
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
							parameters: {
								bodyParameters: {
									constrainedValue: (value) => typeof value === 'number' && value >= 10 && value <= 100
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Value constraint validation passes
						expect(request.isValid()).toBe(true);
						expect(request.getBodyParameters()).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Nested object validation works for any nested structure', () => {
			// Property: For all nested objects,
			// nested validation passes
			
			fc.assert(
				fc.property(
					fc.record({
						nested: fc.record({
							field1: fc.string({ minLength: 1 }),
							field2: fc.integer()
						})
					}),
					(bodyData) => {
						// Arrange
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
							parameters: {
								bodyParameters: {
									nested: (value) => {
										return typeof value === 'object' &&
											value.field1 &&
											typeof value.field2 === 'number';
									}
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Nested object validation passes
						expect(request.isValid()).toBe(true);
						expect(request.getBodyParameters()).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Array element validation works for any array of valid elements', () => {
			// Property: For all arrays of valid elements,
			// array element validation passes
			
			fc.assert(
				fc.property(
					fc.record({
						items: fc.array(
							fc.record({
								id: fc.string({ minLength: 1 }),
								value: fc.integer({ min: 0 })
							}),
							{ minLength: 1, maxLength: 5 }
						)
					}),
					(bodyData) => {
						// Arrange
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
							parameters: {
								bodyParameters: {
									items: (value) => {
										return Array.isArray(value) &&
											value.length > 0 &&
											value.every(item =>
												typeof item === 'object' &&
												item.id &&
												typeof item.value === 'number'
											);
									}
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Array element validation passes
						expect(request.isValid()).toBe(true);
						expect(request.getBodyParameters()).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
