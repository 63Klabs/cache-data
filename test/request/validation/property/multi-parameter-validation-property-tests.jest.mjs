/**
 * Property-Based Test: Multi-Parameter Validation Interface
 * 
 * Feature: body-validation-and-header-format-fix
 * Property 8: For any body validation rule, whether it uses single-parameter
 * interface (receives one value) or multi-parameter interface (receives object
 * with multiple values), the ValidationExecutor SHALL correctly execute the
 * validation with the appropriate interface.
 * 
 * @tag Feature: body-validation-and-header-format-fix, Property 8: Multi-Parameter Validation Interface
 * 
 * Validates: Requirements 8.7
 * 
 * This property test validates that the ValidationExecutor correctly handles both
 * validation function interfaces for body parameters:
 * - Single-parameter interface: validation function receives a single value
 * - Multi-parameter interface: validation function receives an object with multiple values
 * 
 * The ValidationExecutor determines which interface to use based on the number of
 * parameter names provided. This test ensures that both interfaces work correctly
 * and that the correct interface is used in each case.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import ClientRequest class
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

// Import ValidationExecutor for direct testing
const ValidationExecutorModule = await import('../../../../src/lib/utils/ValidationExecutor.class.js');
const ValidationExecutor = ValidationExecutorModule.default;

// Mock Lambda context
const mockContext = {
	getRemainingTimeInMillis: () => 30000
};

describe('Property 8: Multi-Parameter Validation Interface', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Unit Tests - Single-Parameter Interface', () => {
		
		it('should pass single value to single-parameter validation function', () => {
			// Arrange: Single-parameter validation
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
			
			// Track what the validation function receives
			let receivedValue = null;
			let receivedType = null;
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						userId: (value) => {
							receivedValue = value;
							receivedType = typeof value;
							return typeof value === 'string' && value.length > 0;
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received single value, not object
			expect(request.isValid()).toBe(true);
			expect(receivedValue).toBe('123');
			expect(receivedType).toBe('string');
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should work with single-parameter validation for different types', () => {
			// Arrange: Single-parameter validation with different types
			const bodyData = {
				count: 42,
				active: true,
				name: 'test'
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
			
			// Track what each validation function receives
			const received = {};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						count: (value) => {
							received.count = { value, type: typeof value };
							return typeof value === 'number';
						},
						active: (value) => {
							received.active = { value, type: typeof value };
							return typeof value === 'boolean';
						},
						name: (value) => {
							received.name = { value, type: typeof value };
							return typeof value === 'string';
						}
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Each validation function received single value
			expect(request.isValid()).toBe(true);
			expect(received.count).toEqual({ value: 42, type: 'number' });
			expect(received.active).toEqual({ value: true, type: 'boolean' });
			expect(received.name).toEqual({ value: 'test', type: 'string' });
		});
	});
	
	describe('Unit Tests - Multi-Parameter Interface', () => {
		
		it('should pass object to multi-parameter validation function', () => {
			// Arrange: Multi-parameter validation
			const bodyData = {
				username: 'john_doe',
				email: 'john@example.com',
				age: 30
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
			
			// Track what the validation function receives
			let receivedValue = null;
			let receivedType = null;
			let receivedKeys = null;
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						BY_ROUTE: [
							{
								route: 'users?username,email,age',
								validate: (params) => {
									receivedValue = params;
									receivedType = typeof params;
									receivedKeys = Object.keys(params);
									
									// Multi-parameter validation: all fields required
									return params.username &&
										params.email &&
										params.age &&
										params.age >= 18;
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Validation function received object with all parameters
			expect(request.isValid()).toBe(true);
			expect(receivedType).toBe('object');
			expect(receivedKeys).toEqual(['username', 'email', 'age']);
			expect(receivedValue).toEqual(bodyData);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should support destructuring in multi-parameter validation', () => {
			// Arrange: Multi-parameter validation with destructuring
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
			
			// Track destructured values
			let destructuredValues = null;
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						BY_ROUTE: [
							{
								route: 'users?firstName,lastName,email',
								validate: ({ firstName, lastName, email }) => {
									destructuredValues = { firstName, lastName, email };
									
									// Validate using destructured parameters
									return firstName &&
										lastName &&
										email &&
										email.includes('@');
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Destructuring worked correctly
			expect(request.isValid()).toBe(true);
			expect(destructuredValues).toEqual(bodyData);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
		
		it('should handle multi-parameter validation with cross-field constraints', () => {
			// Arrange: Multi-parameter validation with cross-field logic
			const bodyData = {
				startDate: '2024-01-01',
				endDate: '2024-12-31',
				duration: 365
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/bookings',
				path: '/bookings',
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
								route: 'bookings?startDate,endDate,duration',
								validate: ({ startDate, endDate, duration }) => {
									// Cross-field validation: endDate must be after startDate
									const start = new Date(startDate);
									const end = new Date(endDate);
									const daysDiff = Math.floor((end - start) / (1000 * 60 * 60 * 24));
									
									return end > start && daysDiff === duration;
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Cross-field validation passed
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
	
	describe('Unit Tests - ValidationExecutor Direct Testing', () => {
		
		it('should use single-parameter interface when paramNames has one element', () => {
			// Arrange
			let receivedValue = null;
			const validateFn = (value) => {
				receivedValue = value;
				return typeof value === 'string';
			};
			
			const paramNames = ['userId'];
			const paramValues = { userId: '123', other: 'ignored' };
			
			// Act
			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			
			// Assert: Single value passed, not object
			expect(result).toBe(true);
			expect(receivedValue).toBe('123');
			expect(typeof receivedValue).toBe('string');
		});
		
		it('should use multi-parameter interface when paramNames has multiple elements', () => {
			// Arrange
			let receivedValue = null;
			const validateFn = (params) => {
				receivedValue = params;
				return !!(params.userId && params.email);
			};
			
			const paramNames = ['userId', 'email'];
			const paramValues = { userId: '123', email: 'test@example.com', other: 'ignored' };
			
			// Act
			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			
			// Assert: Object with specified parameters passed
			expect(result).toBe(true);
			expect(receivedValue).toEqual({ userId: '123', email: 'test@example.com' });
			expect(Object.keys(receivedValue)).toEqual(['userId', 'email']);
		});
		
		it('should handle validation function errors gracefully', () => {
			// Arrange: Validation function that throws
			const validateFn = () => {
				throw new Error('Validation error');
			};
			
			const paramNames = ['userId'];
			const paramValues = { userId: '123' };
			
			// Act
			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			
			// Assert: Error caught, returns false
			expect(result).toBe(false);
		});
	});
	
	describe('Property-Based Tests - Interface Selection', () => {
		
		it('Property: Single-parameter interface receives value directly for any single parameter', () => {
			// Property: For all single parameters,
			// validation function receives the value directly (not wrapped in object)
			
			fc.assert(
				fc.property(
					fc.oneof(
						fc.string({ minLength: 1, maxLength: 50 }),
						fc.integer({ min: 0, max: 1000 }),
						fc.boolean()
					),
					(value) => {
						// Arrange
						const bodyData = { testParam: value };
						
						const event = {
							httpMethod: 'POST',
							resource: '/test',
							path: '/test',
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: JSON.stringify(bodyData)
						};
						
						// Track what validation function receives
						let receivedValue = null;
						let receivedIsObject = null;
						
						ClientRequest.init({
							parameters: {
								bodyParameters: {
									testParam: (val) => {
										receivedValue = val;
										receivedIsObject = typeof val === 'object' && val !== null && !Array.isArray(val);
										return true; // Always pass
									}
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Received value directly, not as object
						expect(request.isValid()).toBe(true);
						expect(receivedValue).toBe(value);
						expect(receivedIsObject).toBe(false);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Multi-parameter interface receives object for any multiple parameters', () => {
			// Property: For all combinations of multiple parameters,
			// validation function receives an object with those parameters
			
			fc.assert(
				fc.property(
					fc.record({
						param1: fc.string({ minLength: 1, maxLength: 20 }),
						param2: fc.integer({ min: 0, max: 100 }),
						param3: fc.boolean()
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
						
						// Track what validation function receives
						let receivedValue = null;
						let receivedKeys = null;
						
						ClientRequest.init({
							parameters: {
								bodyParameters: {
									BY_ROUTE: [
										{
											route: 'test?param1,param2,param3',
											validate: (params) => {
												receivedValue = params;
												receivedKeys = Object.keys(params).sort();
												return true; // Always pass
											}
										}
									]
								}
							}
						});
						
						// Act
						const request = new ClientRequest(event, mockContext);
						
						// Assert: Received object with all parameters
						expect(request.isValid()).toBe(true);
						expect(typeof receivedValue).toBe('object');
						expect(receivedKeys).toEqual(['param1', 'param2', 'param3']);
						expect(receivedValue).toEqual(bodyData);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: ValidationExecutor uses correct interface for any parameter count', () => {
			// Property: For all parameter counts (1 or more),
			// ValidationExecutor uses the correct interface
			
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 5 }),
					fc.record({
						param1: fc.string(),
						param2: fc.integer(),
						param3: fc.boolean(),
						param4: fc.string(),
						param5: fc.integer()
					}),
					(paramCount, paramValues) => {
						// Arrange: Create paramNames array with specified count
						const allParamNames = ['param1', 'param2', 'param3', 'param4', 'param5'];
						const paramNames = allParamNames.slice(0, paramCount);
						
						let receivedValue = null;
						let receivedType = null;
						
						const validateFn = (value) => {
							receivedValue = value;
							receivedType = typeof value;
							return true;
						};
						
						// Act
						const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
						
						// Assert: Correct interface used based on parameter count
						expect(result).toBe(true);
						
						if (paramCount === 1) {
							// Single-parameter interface: received value directly
							expect(receivedValue).toBe(paramValues[paramNames[0]]);
							expect(receivedType).not.toBe('object');
						} else {
							// Multi-parameter interface: received object
							expect(receivedType).toBe('object');
							expect(Object.keys(receivedValue).length).toBe(paramCount);
							
							// Verify all specified parameters are in the object
							for (const paramName of paramNames) {
								expect(receivedValue[paramName]).toBe(paramValues[paramName]);
							}
						}
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Single-parameter validation works for any value type', () => {
			// Property: For all value types (string, number, boolean, array, object),
			// single-parameter interface passes the value correctly
			
			fc.assert(
				fc.property(
					fc.oneof(
						fc.string(),
						fc.integer(),
						fc.boolean(),
						fc.array(fc.string(), { maxLength: 5 }),
						fc.record({ id: fc.string(), value: fc.integer() })
					),
					(value) => {
						// Arrange
						let receivedValue = null;
						
						const validateFn = (val) => {
							receivedValue = val;
							return true;
						};
						
						const paramNames = ['testParam'];
						const paramValues = { testParam: value };
						
						// Act
						const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
						
						// Assert: Value passed correctly regardless of type
						expect(result).toBe(true);
						expect(receivedValue).toEqual(value);
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Multi-parameter validation works for any parameter combination', () => {
			// Property: For all combinations of parameters,
			// multi-parameter interface passes all parameters correctly
			
			fc.assert(
				fc.property(
					fc.record({
						stringParam: fc.string({ minLength: 1, maxLength: 20 }),
						numberParam: fc.integer({ min: 0, max: 100 }),
						booleanParam: fc.boolean(),
						arrayParam: fc.array(fc.string(), { minLength: 1, maxLength: 3 })
					}),
					(paramValues) => {
						// Arrange
						let receivedValue = null;
						
						const validateFn = (params) => {
							receivedValue = params;
							return true;
						};
						
						const paramNames = ['stringParam', 'numberParam', 'booleanParam', 'arrayParam'];
						
						// Act
						const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
						
						// Assert: All parameters passed correctly
						expect(result).toBe(true);
						expect(receivedValue).toEqual({
							stringParam: paramValues.stringParam,
							numberParam: paramValues.numberParam,
							booleanParam: paramValues.booleanParam,
							arrayParam: paramValues.arrayParam
						});
					}
				),
				{ numRuns: 100 }
			);
		});
		
		it('Property: Validation errors are caught for both interfaces', () => {
			// Property: For all parameter counts,
			// validation function errors are caught and return false
			
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 3 }),
					(paramCount) => {
						// Arrange: Validation function that always throws
						const validateFn = () => {
							throw new Error('Test error');
						};
						
						const paramNames = ['param1', 'param2', 'param3'].slice(0, paramCount);
						const paramValues = { param1: 'a', param2: 'b', param3: 'c' };
						
						// Act
						const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
						
						// Assert: Error caught, returns false
						expect(result).toBe(false);
					}
				),
				{ numRuns: 50 }
			);
		});
	});
	
	describe('Integration Tests - Mixed Validation Interfaces', () => {
		
		it('should support mixing single and multi-parameter validations', () => {
			// Arrange: Mix of single and multi-parameter validations
			const bodyData = {
				userId: '123',
				email: 'john@example.com',
				firstName: 'John',
				lastName: 'Doe',
				age: 30
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
			
			// Track what each validation receives
			const received = {};
			
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						// Single-parameter validations
						userId: (value) => {
							received.userId = { value, isSingle: true };
							return typeof value === 'string';
						},
						email: (value) => {
							received.email = { value, isSingle: true };
							return typeof value === 'string' && value.includes('@');
						},
						
						// Multi-parameter validation
						BY_ROUTE: [
							{
								route: 'users?firstName,lastName,age',
								validate: ({ firstName, lastName, age }) => {
									received.multiParam = { firstName, lastName, age, isSingle: false };
									return firstName && lastName && age >= 18;
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Both interfaces worked correctly
			expect(request.isValid()).toBe(true);
			expect(received.userId.isSingle).toBe(true);
			expect(received.userId.value).toBe('123');
			expect(received.email.isSingle).toBe(true);
			expect(received.email.value).toBe('john@example.com');
			expect(received.multiParam.isSingle).toBe(false);
			expect(received.multiParam).toEqual({
				firstName: 'John',
				lastName: 'Doe',
				age: 30,
				isSingle: false
			});
		});
		
		it('should handle complex multi-parameter validation with nested objects', () => {
			// Arrange: Multi-parameter validation with nested data
			const bodyData = {
				user: {
					id: '123',
					name: 'John Doe'
				},
				settings: {
					theme: 'dark',
					notifications: true
				},
				metadata: {
					source: 'api',
					timestamp: 1234567890
				}
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/config',
				path: '/config',
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
								route: 'config?user,settings,metadata',
								validate: ({ user, settings, metadata }) => {
									// Multi-parameter validation with nested objects
									return user &&
										user.id &&
										user.name &&
										settings &&
										typeof settings.notifications === 'boolean' &&
										metadata &&
										metadata.source;
								}
							}
						]
					}
				}
			});
			
			// Act
			const request = new ClientRequest(event, mockContext);
			
			// Assert: Complex multi-parameter validation passed
			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});
	});
});
