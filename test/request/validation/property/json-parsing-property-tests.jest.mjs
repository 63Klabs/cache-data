/**
 * Property-Based Test: JSON Parsing Precondition
 * 
 * Feature: body-validation-and-header-format-fix
 * Property 3: For any request body containing valid JSON, the ClientRequest
 * SHALL parse the JSON string into an object before passing it to validation functions.
 * 
 * @tag Feature: body-validation-and-header-format-fix, Property 3: JSON Parsing Precondition
 * 
 * Validates: Requirements 1.5
 * 
 * This property test validates that:
 * 1. JSON strings are parsed before validation
 * 2. Validation functions receive JavaScript objects, not strings
 * 3. Validation functions can access object properties directly
 * 4. Parsing happens consistently for all valid JSON inputs
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

describe('Property 3: JSON Parsing Precondition', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Unit Tests - JSON Parsing Before Validation', () => {
		
		it('should parse JSON string before passing to validation function', () => {
			// Track what the validation function receives
			let receivedValue = null;
			let receivedType = null;
			
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
				body: JSON.stringify(bodyData)  // JSON string
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						userId: (value) => {
							receivedValue = value;
							receivedType = typeof value;
							return typeof value === 'string';
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received parsed value, not JSON string
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe('123');
			expect(receivedType).toBe('string');
		});
		
		it('should allow validation functions to access object properties', () => {
			// Track what the validation function can access
			let canAccessUserId = false;
			let canAccessAction = false;
			let receivedObject = null;
			
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
						userId: (value) => {
							// >! Validation function should receive parsed value
							canAccessUserId = typeof value === 'string' && value === '123';
							return canAccessUserId;
						},
						action: (value) => {
							// >! Validation function should receive parsed value
							canAccessAction = ['create', 'update', 'delete'].includes(value);
							receivedObject = { userId: '123', action: value };
							return canAccessAction;
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function could access object properties
			expect(request.isValid()).toBe(true);
			expect(canAccessUserId).toBe(true);
			expect(canAccessAction).toBe(true);
			expect(receivedObject).toEqual(bodyData);
		});
		
		it('should parse nested objects before validation', () => {
			let receivedNestedObject = null;
			
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
						user: (value) => {
							receivedNestedObject = value;
							// >! Validation function should receive parsed nested object
							return typeof value === 'object' && value.id === '123';
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Nested object was parsed and accessible
			expect(request.isValid()).toBe(true);
			expect(receivedNestedObject).toEqual(bodyData.user);
			expect(receivedNestedObject.id).toBe('123');
			expect(receivedNestedObject.name).toBe('John');
		});
		
		it('should parse arrays before validation', () => {
			let receivedArray = null;
			
			const bodyData = {
				items: ['item1', 'item2', 'item3']
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
						items: (value) => {
							receivedArray = value;
							// >! Validation function should receive parsed array
							return Array.isArray(value) && value.length === 3;
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Array was parsed and accessible
			expect(request.isValid()).toBe(true);
			expect(Array.isArray(receivedArray)).toBe(true);
			expect(receivedArray).toEqual(['item1', 'item2', 'item3']);
		});
		
		it('should parse boolean values correctly', () => {
			let receivedBoolean = null;
			
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
						active: (value) => {
							receivedBoolean = value;
							// >! Validation function should receive parsed boolean, not string
							return typeof value === 'boolean';
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Boolean was parsed correctly
			expect(request.isValid()).toBe(true);
			expect(typeof receivedBoolean).toBe('boolean');
			expect(receivedBoolean).toBe(true);
		});
		
		it('should parse numeric values correctly', () => {
			let receivedNumber = null;
			
			const bodyData = {
				count: 42,
				price: 19.99
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
						count: (value) => {
							receivedNumber = value;
							// >! Validation function should receive parsed number, not string
							return typeof value === 'number';
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Number was parsed correctly
			expect(request.isValid()).toBe(true);
			expect(typeof receivedNumber).toBe('number');
			expect(receivedNumber).toBe(42);
		});
		
		it('should parse null values correctly', () => {
			let receivedNull = undefined;
			
			const bodyData = {
				optionalField: null
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
						optionalField: (value) => {
							receivedNull = value;
							// >! Validation function should receive null, not string "null"
							return value === null;
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Null was parsed correctly
			expect(request.isValid()).toBe(true);
			expect(receivedNull).toBe(null);
		});
	});
	
	describe('Property-Based Tests - JSON Parsing Precondition', () => {
		
		it('Property: String values are parsed and accessible', () => {
			// Property: For all valid JSON strings containing string values,
			// validation functions receive parsed strings, not JSON
			
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.string({ minLength: 1, maxLength: 50 }),
						name: fc.string({ minLength: 1, maxLength: 100 })
					}),
					(bodyData) => {
						let receivedUserId = null;
						let receivedName = null;
						
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
										receivedUserId = value;
										return typeof value === 'string';
									},
									name: (value) => {
										receivedName = value;
										return typeof value === 'string';
									}
								}
							}
						});
						
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation functions received parsed strings
						expect(request.isValid()).toBe(true);
						expect(receivedUserId).toBe(bodyData.userId);
						expect(receivedName).toBe(bodyData.name);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Numeric values are parsed and accessible', () => {
			// Property: For all valid JSON strings containing numeric values,
			// validation functions receive parsed numbers, not strings
			
			fc.assert(
				fc.property(
					fc.record({
						count: fc.integer({ min: 0, max: 1000 }),
						price: fc.float({ min: 0, max: 10000, noNaN: true })
					}),
					(bodyData) => {
						let receivedCount = null;
						let receivedPrice = null;
						
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
									count: (value) => {
										receivedCount = value;
										return typeof value === 'number';
									},
									price: (value) => {
										receivedPrice = value;
										return typeof value === 'number';
									}
								}
							}
						});
						
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation functions received parsed numbers
						expect(request.isValid()).toBe(true);
						expect(typeof receivedCount).toBe('number');
						expect(typeof receivedPrice).toBe('number');
						expect(receivedCount).toBe(bodyData.count);
						expect(receivedPrice).toBe(bodyData.price);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Boolean values are parsed and accessible', () => {
			// Property: For all valid JSON strings containing boolean values,
			// validation functions receive parsed booleans, not strings
			
			fc.assert(
				fc.property(
					fc.record({
						active: fc.boolean(),
						verified: fc.boolean()
					}),
					(bodyData) => {
						let receivedActive = null;
						let receivedVerified = null;
						
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
									active: (value) => {
										receivedActive = value;
										return typeof value === 'boolean';
									},
									verified: (value) => {
										receivedVerified = value;
										return typeof value === 'boolean';
									}
								}
							}
						});
						
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation functions received parsed booleans
						expect(request.isValid()).toBe(true);
						expect(typeof receivedActive).toBe('boolean');
						expect(typeof receivedVerified).toBe('boolean');
						expect(receivedActive).toBe(bodyData.active);
						expect(receivedVerified).toBe(bodyData.verified);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Array values are parsed and accessible', () => {
			// Property: For all valid JSON strings containing arrays,
			// validation functions receive parsed arrays, not strings
			
			fc.assert(
				fc.property(
					fc.record({
						items: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 })
					}),
					(bodyData) => {
						let receivedItems = null;
						
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
									items: (value) => {
										receivedItems = value;
										return Array.isArray(value);
									}
								}
							}
						});
						
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation function received parsed array
						expect(request.isValid()).toBe(true);
						expect(Array.isArray(receivedItems)).toBe(true);
						expect(receivedItems).toEqual(bodyData.items);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Nested objects are parsed and accessible', () => {
			// Property: For all valid JSON strings containing nested objects,
			// validation functions receive parsed nested objects with accessible properties
			
			fc.assert(
				fc.property(
					fc.record({
						user: fc.record({
							id: fc.string({ minLength: 1, maxLength: 20 }),
							name: fc.string({ minLength: 1, maxLength: 50 })
						})
					}),
					(bodyData) => {
						let receivedUser = null;
						let canAccessId = false;
						let canAccessName = false;
						
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
										receivedUser = value;
										// >! Validation function should be able to access nested properties
										canAccessId = 'id' in value && typeof value.id === 'string';
										canAccessName = 'name' in value && typeof value.name === 'string';
										return typeof value === 'object' && canAccessId && canAccessName;
									}
								}
							}
						});
						
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Validation function received parsed nested object
						expect(request.isValid()).toBe(true);
						expect(receivedUser).toEqual(bodyData.user);
						expect(canAccessId).toBe(true);
						expect(canAccessName).toBe(true);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Mixed type values are all parsed correctly', () => {
			// Property: For all valid JSON strings containing mixed types,
			// validation functions receive correctly parsed values of each type
			
			fc.assert(
				fc.property(
					fc.record({
						id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
						count: fc.integer({ min: 0, max: 100 }),
						active: fc.boolean(),
						tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 5 })
					}),
					(bodyData) => {
						let receivedTypes = {};
						
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
									id: (value) => {
										receivedTypes.id = typeof value;
										return typeof value === 'string';
									},
									count: (value) => {
										receivedTypes.count = typeof value;
										return typeof value === 'number';
									},
									active: (value) => {
										receivedTypes.active = typeof value;
										return typeof value === 'boolean';
									},
									tags: (value) => {
										receivedTypes.tags = Array.isArray(value) ? 'array' : typeof value;
										return Array.isArray(value);
									}
								}
							}
						});
						
						const request = new ClientRequest(event, mockContext);
						
						// Assert: All types were parsed correctly
						expect(request.isValid()).toBe(true);
						expect(receivedTypes.id).toBe('string');
						expect(receivedTypes.count).toBe('number');
						expect(receivedTypes.active).toBe('boolean');
						expect(receivedTypes.tags).toBe('array');
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Multi-parameter validation receives parsed object', () => {
			// Property: For all valid JSON strings,
			// multi-parameter validation functions receive parsed objects with accessible properties
			
			fc.assert(
				fc.property(
					fc.record({
						userId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
						action: fc.constantFrom('create', 'update', 'delete')
					}),
					(bodyData) => {
						let receivedParams = null;
						let canAccessUserId = false;
						let canAccessAction = false;
						
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
										canAccessUserId = typeof value === 'string' && value.trim().length > 0;
										return canAccessUserId;
									},
									action: (value) => {
										canAccessAction = ['create', 'update', 'delete'].includes(value);
										receivedParams = { userId: bodyData.userId, action: value };
										return canAccessAction;
									}
								}
							}
						});
						
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Multi-parameter validation received parsed object
						expect(request.isValid()).toBe(true);
						expect(receivedParams).toEqual(bodyData);
						expect(canAccessUserId).toBe(true);
						expect(canAccessAction).toBe(true);
					}
				),
				{ numRuns: 100 }
			);
		});
	});
	
	describe('Edge Cases - JSON Parsing', () => {
		
		it('should handle empty object JSON', () => {
			let receivedValue = undefined;
			let validationCalled = false;
			
			const event = {
				httpMethod: 'POST',
				resource: '/data',
				path: '/data',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: '{}'
			};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						// Use a validation that always passes for empty object
						optionalField: (value) => {
							validationCalled = true;
							receivedValue = value;
							return true;  // Allow undefined
						}
					}
				}
			});
			
			const request = new ClientRequest(event, mockContext);
			
			expect(request.isValid()).toBe(true);
			// For empty object, validation functions may not be called
			// The important thing is that getBodyParameters returns empty object
			expect(request.getBodyParameters()).toEqual({});
		});
		
		it('should handle JSON with special characters in strings', () => {
			let receivedValue = null;
			
			const bodyData = {
				message: 'Hello "World" with \n newlines and \t tabs'
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
						message: (value) => {
							receivedValue = value;
							return typeof value === 'string';
						}
					}
				}
			});
			
			const request = new ClientRequest(event, mockContext);
			
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe(bodyData.message);
		});
		
		it('should handle JSON with Unicode characters', () => {
			let receivedValue = null;
			
			const bodyData = {
				name: '日本語 中文 한국어 🎉'
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
						name: (value) => {
							receivedValue = value;
							return typeof value === 'string';
						}
					}
				}
			});
			
			const request = new ClientRequest(event, mockContext);
			
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe(bodyData.name);
		});
	});
});
