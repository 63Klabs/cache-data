import { describe, it, expect, beforeAll } from '@jest/globals';

/**
 * Integration Tests: Backwards Compatibility with Legacy Validation Configurations
 * 
 * These tests verify that existing validation configurations without BY_ROUTE or BY_METHOD
 * continue to work exactly as before the enhancement. This ensures zero breaking changes
 * for existing users.
 * 
 * Test Coverage:
 * - Legacy global parameter validations
 * - pathParameters validation
 * - queryParameters validation
 * - headerParameters validation
 * - excludeParamsWithNoValidationMatch flag behavior
 * - Invalid parameters causing request to be marked invalid
 */

// Helper function to create mock Lambda context
function createMockContext() {
	return {
		getRemainingTimeInMillis: () => 30000
	};
}

// Helper function to create mock Lambda event with required fields
function createMockEvent(overrides = {}) {
	return {
		httpMethod: 'GET',
		resource: '/test',
		path: '/test',
		pathParameters: {},
		queryStringParameters: {},
		headers: {
			'Referer': 'https://example.com'
		},
		...overrides
	};
}

describe('ClientRequest - Backwards Compatibility Integration Tests', () => {
	let ClientRequest;

	beforeAll(async () => {
		// Dynamic import to get fresh module
		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
		ClientRequest = module.default;
	});

	describe('Legacy Global Parameter Validations', () => {
		it('should validate pathParameters with global validation functions', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{userId}',
				path: '/users/123',
				pathParameters: { userId: '123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ userId: '123' });
		});

		it('should validate queryParameters with global validation functions', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0 && parseInt(value) <= 100
					}
				}
			});

			const event = createMockEvent({
				queryStringParameters: { limit: '10' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ limit: '10' });
		});

		it('should validate headerParameters with global validation functions', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
					}
				}
			});

			const event = createMockEvent({
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer token123'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getHeaderParameters()).toEqual({ authorization: 'Bearer token123' });
		});
	});

	describe('Invalid Parameters Behavior', () => {
		it('should mark request as invalid when parameter validation fails', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{id}',
				path: '/users/abc',
				pathParameters: { id: 'abc' } // Invalid: not numeric
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should validate all parameters and collect failures', () => {
			let validationCallCount = 0;

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						param1: (value) => {
							validationCallCount++;
							return false; // Fail immediately
						},
						param2: (value) => {
							validationCallCount++;
							return true;
						}
					}
				}
			});

			const event = createMockEvent({
				queryStringParameters: {
					param1: 'value1',
					param2: 'value2'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(validationCallCount).toBe(2); // All parameters are now validated (no early exit)
		});
	});

	describe('excludeParamsWithNoValidationMatch Flag', () => {
		it('should exclude parameters without validation rules by default', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0
					}
				}
			});

			const event = createMockEvent({
				queryStringParameters: {
					limit: '10',
					page: '1', // No validation rule
					sort: 'name' // No validation rule
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			const queryParams = request.getQueryStringParameters();
			expect(queryParams).toEqual({ limit: '10' });
			expect(queryParams.page).toBeUndefined();
			expect(queryParams.sort).toBeUndefined();
		});

		it('should include parameters without validation rules when flag is false', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false,
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0
					}
				}
			});

			const event = createMockEvent({
				queryStringParameters: {
					limit: '10',
					page: '1',
					sort: 'name'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({
				limit: '10',
				page: '1',
				sort: 'name'
			});
		});
	});

	describe('Multiple Parameter Types', () => {
		it('should validate all parameter types independently', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				queryStringParameters: { limit: '10' },
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer token123'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
			expect(request.getQueryStringParameters()).toEqual({ limit: '10' });
			expect(request.getHeaderParameters()).toEqual({ authorization: 'Bearer token123' });
		});

		it('should mark request invalid if any parameter type fails validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				queryStringParameters: { limit: 'invalid' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty parameter objects', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createMockEvent({
				pathParameters: {}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should handle validation functions that return truthy/falsy values', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						param: (value) => value // Returns the value itself (truthy)
					}
				}
			});

			const event = createMockEvent({
				queryStringParameters: { param: 'truthy-value' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ param: 'truthy-value' });
		});
	});
});
