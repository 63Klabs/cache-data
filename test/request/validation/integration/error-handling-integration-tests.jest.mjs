/**
 * Integration Tests: Error Handling in Body Validation
 * 
 * Feature: body-validation-and-header-format-fix
 * 
 * Tests error handling throughout the validation chain:
 * - JSON parsing errors are logged and handled gracefully
 * - Validation exceptions are caught and logged
 * - Error states propagate correctly through validation chain
 * - DebugAndLog.error() is called with appropriate messages
 * 
 * Requirements: 1.6, 7.3, 7.5
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Import ClientRequest
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

// Import DebugAndLog for mocking
const DebugAndLogModule = await import('../../../../src/lib/tools/DebugAndLog.class.js');
const DebugAndLog = DebugAndLogModule.default;

describe('Error Handling Integration Tests', () => {
	let originalError;
	let originalWarn;
	
	beforeEach(() => {
		// Save original methods
		originalError = DebugAndLog.error;
		originalWarn = DebugAndLog.warn;
		
		// Initialize ClientRequest with body validation
		ClientRequest.init({
			referrers: ['*'],
			parameters: {
				bodyParameters: {
					email: (value) => typeof value === 'string' && value.includes('@'),
					age: (value) => typeof value === 'number' && value >= 0
				}
			}
		});
	});
	
	afterEach(() => {
		// Restore original methods
		DebugAndLog.error = originalError;
		DebugAndLog.warn = originalWarn;
		jest.restoreAllMocks();
	});
	
	describe('JSON Parsing Error Handling', () => {
		it('should log JSON parsing errors with DebugAndLog.error()', () => {
			// >! Mock DebugAndLog.error to capture error logging
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				headers: {},
				body: 'invalid json{' // Malformed JSON
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			// >! Create ClientRequest - should trigger JSON parsing error
			const clientRequest = new ClientRequest(event, context);
			
			// >! Verify DebugAndLog.error was called
			expect(errorSpy).toHaveBeenCalled();
			
			// >! Verify error message includes JSON parsing context
			const errorCall = errorSpy.mock.calls[0];
			expect(errorCall[0]).toContain('Failed to parse request body as JSON');
			expect(errorCall[0]).toContain('Unexpected');
			
			// >! Verify stack trace was passed
			expect(errorCall[1]).toBeDefined();
		});
		
		it('should set isValid to false when JSON parsing fails', () => {
			// Mock DebugAndLog.error to suppress output
			DebugAndLog.error = jest.fn();
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				headers: {},
				body: '{"email": "test@example.com", invalid}' // Malformed JSON
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Verify validation failed due to JSON parsing error
			expect(clientRequest.isValid()).toBe(false);
		});
		
		it('should return empty object from getBodyParameters() when JSON parsing fails', () => {
			// Mock DebugAndLog.error to suppress output
			DebugAndLog.error = jest.fn();
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				headers: {},
				body: 'not json at all'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Verify empty object returned on parsing error
			expect(clientRequest.getBodyParameters()).toEqual({});
		});
		
		it('should handle various JSON parsing errors', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			const malformedBodies = [
				'{invalid}',
				'{"key": undefined}',
				'{"key": }',
				'{key: "value"}', // Missing quotes
				'{"key": "value",}', // Trailing comma
				'[1, 2, 3,]', // Trailing comma in array
				'{"nested": {"key": }}'
			];
			
			malformedBodies.forEach((body, index) => {
				errorSpy.mockClear();
				
				const event = {
					httpMethod: 'POST',
					resource: '/test',
					path: '/test',
					headers: {},
					body
				};
				
				const context = {
					getRemainingTimeInMillis: () => 30000
				};
				
				const clientRequest = new ClientRequest(event, context);
				
				// >! Each malformed body should trigger error logging
				expect(errorSpy).toHaveBeenCalled();
				expect(clientRequest.isValid()).toBe(false);
				expect(clientRequest.getBodyParameters()).toEqual({});
			});
		});
	});
	
	describe('Validation Exception Handling', () => {
		it('should catch and log validation function exceptions', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			// >! Initialize with validation function that throws
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					bodyParameters: {
						email: (value) => {
							throw new Error('Validation function error');
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				headers: {},
				body: '{"email": "test@example.com"}'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Verify ValidationExecutor caught and logged the exception
			expect(errorSpy).toHaveBeenCalled();
			
			// >! Verify error message includes validation context
			const errorCall = errorSpy.mock.calls[0];
			expect(errorCall[0]).toContain('Validation function threw error');
			expect(errorCall[0]).toContain('email');
			expect(errorCall[0]).toContain('Validation function error');
		});
		
		it('should set isValid to false when validation throws exception', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			// >! Validation function that throws
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					bodyParameters: {
						data: () => {
							throw new Error('Unexpected error');
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				headers: {},
				body: '{"data": "value"}'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Validation exception should cause validation to fail
			expect(clientRequest.isValid()).toBe(false);
		});
		
		it('should handle exceptions in multi-parameter validation', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					bodyParameters: {
						BY_ROUTE: [
							{
								route: 'POST:users',
								validate: ({ email, password }) => {
									// >! Throw exception during multi-parameter validation
									throw new Error('Multi-param validation error');
								}
							}
						]
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				headers: {},
				body: '{"email": "test@example.com", "password": "secret"}'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Exception should be caught and logged
			expect(errorSpy).toHaveBeenCalled();
			expect(clientRequest.isValid()).toBe(false);
		});
	});
	
	describe('Error Propagation Through Validation Chain', () => {
		it('should propagate body validation errors through validation chain', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				headers: {},
				pathParameters: {},
				queryStringParameters: {},
				body: 'invalid json'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Body validation error should propagate to overall validity
			expect(clientRequest.isValid()).toBe(false);
			
			// >! Error should be logged
			expect(errorSpy).toHaveBeenCalled();
		});
		
		it('should stop validation chain on body validation failure', () => {
			const warnSpy = jest.fn();
			DebugAndLog.warn = warnSpy;
			DebugAndLog.error = jest.fn();
			
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					bodyParameters: {
						email: (value) => false // Always fails
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				headers: {},
				body: '{"email": "test@example.com"}'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Validation should fail
			expect(clientRequest.isValid()).toBe(false);
			
			// >! Warning should be logged for invalid parameter
			expect(warnSpy).toHaveBeenCalled();
			const warnCall = warnSpy.mock.calls[0];
			expect(warnCall[0]).toContain('Invalid parameter');
			expect(warnCall[0]).toContain('email');
		});
		
		it('should maintain validation order with body validation last', () => {
			const validationOrder = [];
			
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => {
							validationOrder.push('path');
							return true;
						}
					},
					queryStringParameters: {
						limit: (value) => {
							validationOrder.push('query');
							return true;
						}
					},
					headerParameters: {
						contentType: (value) => {
							validationOrder.push('header');
							return true;
						}
					},
					bodyParameters: {
						email: (value) => {
							validationOrder.push('body');
							return true;
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/users/{id}',
				path: '/users/123',
				headers: {
					'Content-Type': 'application/json'
				},
				pathParameters: {
					id: '123'
				},
				queryStringParameters: {
					limit: '10'
				},
				body: '{"email": "test@example.com"}'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Verify validation order: path → query → header → body
			expect(validationOrder).toEqual(['path', 'query', 'header', 'body']);
		});
	});
	
	describe('Error Message Quality', () => {
		it('should include error message in JSON parsing error log', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				headers: {},
				body: '{"key": invalid}'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			new ClientRequest(event, context);
			
			// >! Error message should include context
			const errorCall = errorSpy.mock.calls[0];
			expect(errorCall[0]).toContain('Failed to parse request body as JSON');
			
			// >! Should include actual error message
			expect(errorCall[0]).toMatch(/Unexpected|invalid/i);
		});
		
		it('should include stack trace in error logs', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				headers: {},
				body: 'not json'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			new ClientRequest(event, context);
			
			// >! Stack trace should be passed as second argument
			const errorCall = errorSpy.mock.calls[0];
			expect(errorCall[1]).toBeDefined();
			expect(typeof errorCall[1]).toBe('string');
		});
		
		it('should handle missing error message gracefully', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			// >! Create error without message
			const originalParse = JSON.parse;
			JSON.parse = () => {
				const error = new Error();
				error.message = undefined;
				throw error;
			};
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				headers: {},
				body: 'anything'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			new ClientRequest(event, context);
			
			// >! Should handle undefined error message
			const errorCall = errorSpy.mock.calls[0];
			expect(errorCall[0]).toContain('Unknown error');
			
			// Restore JSON.parse
			JSON.parse = originalParse;
		});
	});
	
	describe('Edge Cases in Error Handling', () => {
		it('should handle null body without error', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				headers: {},
				body: null
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Null body should not trigger error
			expect(errorSpy).not.toHaveBeenCalled();
			expect(clientRequest.getBodyParameters()).toEqual({});
		});
		
		it('should handle undefined body without error', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				headers: {}
				// body is undefined
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Undefined body should not trigger error
			expect(errorSpy).not.toHaveBeenCalled();
			expect(clientRequest.getBodyParameters()).toEqual({});
		});
		
		it('should handle empty string body without error', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				headers: {},
				body: ''
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Empty string body should not trigger error
			expect(errorSpy).not.toHaveBeenCalled();
			expect(clientRequest.getBodyParameters()).toEqual({});
		});
		
		it('should handle validation exception with missing stack trace', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					bodyParameters: {
						data: () => {
							const error = new Error('Test error');
							error.stack = undefined;
							throw error;
						}
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				headers: {},
				body: '{"data": "value"}'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			new ClientRequest(event, context);
			
			// >! Should handle missing stack trace gracefully
			expect(errorSpy).toHaveBeenCalled();
			const errorCall = errorSpy.mock.calls[0];
			expect(errorCall[0]).toContain('Validation function threw error');
		});
	});
	
	describe('Integration with Other Validation Types', () => {
		it('should handle body validation error alongside valid path parameters', () => {
			const errorSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					bodyParameters: {
						email: (value) => typeof value === 'string' && value.includes('@')
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/users/{id}',
				path: '/users/123',
				headers: {},
				pathParameters: {
					id: '123'
				},
				body: 'invalid json'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Path validation should succeed
			expect(clientRequest.getPathParameters()).toEqual({ id: '123' });
			
			// >! Body validation should fail
			expect(clientRequest.isValid()).toBe(false);
			expect(errorSpy).toHaveBeenCalled();
		});
		
		it('should handle multiple validation errors in sequence', () => {
			const errorSpy = jest.fn();
			const warnSpy = jest.fn();
			DebugAndLog.error = errorSpy;
			DebugAndLog.warn = warnSpy;
			
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryStringParameters: {
						limit: (value) => false // Fails
					},
					bodyParameters: {
						email: (value) => false // Fails
					}
				}
			});
			
			const event = {
				httpMethod: 'POST',
				resource: '/test',
				path: '/test',
				headers: {},
				queryStringParameters: {
					limit: '10'
				},
				body: '{"email": "test@example.com"}'
			};
			
			const context = {
				getRemainingTimeInMillis: () => 30000
			};
			
			const clientRequest = new ClientRequest(event, context);
			
			// >! Both validations should fail
			expect(clientRequest.isValid()).toBe(false);
			
			// >! Warnings should be logged for both failures
			expect(warnSpy.mock.calls.length).toBeGreaterThan(0);
		});
	});
});
