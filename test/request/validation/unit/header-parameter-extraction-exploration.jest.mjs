import { describe, it, expect } from '@jest/globals';

// Import ClientRequest to test the full validation flow
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

/**
 * EXPLORATION TEST FOR DEFECT 3: Header Parameter Extraction Failure
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * 
 * GOAL: Surface counterexamples demonstrating that header parameters return {} instead of actual values.
 * 
 * EXPECTED OUTCOME: Test FAILS (this is correct - it proves the bug exists)
 * 
 * Bug Condition: When a validation rule exists for header parameters, getHeaderParameters() 
 * returns an empty object {} instead of the actual parameter values.
 * 
 * Expected Behavior: getHeaderParameters() should return actual header parameter values when 
 * validation rules exist and validation passes.
 */
describe('Defect 3: Header Parameter Extraction - Exploration Tests', () => {
	describe('Single Header Parameter Validation', () => {
		it('should extract header parameter when validation rule exists: content-type', () => {
			// Initialize ClientRequest with validation for header parameter
			ClientRequest.init({
				parameters: {
					headerParameters: {
						BY_ROUTE: [
							{
								route: 'api/data',
								validate: (contentType) => {
									// >! Single-parameter validation receives value directly (not as object)
									// Content-Type must be application/json
									return contentType === 'application/json';
								}
							}
						]
					}
				}
			});

			// Create mock API Gateway event with header parameter
			const event = {
				httpMethod: 'POST',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: {},
				queryStringParameters: {},
				headers: {
					'content-type': 'application/json'
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			// Create ClientRequest instance
			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true for valid request
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: getHeaderParameters() should return actual parameter values
			// ACTUAL (on unfixed code): getHeaderParameters() returns {}
			const headerParams = clientRequest.getHeaderParameters();
			expect(headerParams).toEqual({
				contentType: 'application/json'
			});
		});
	});

	describe('Multiple Header Parameter Validation', () => {
		it('should extract multiple header parameters: content-type and authorization', () => {
			ClientRequest.init({
				parameters: {
					headerParameters: {
						BY_ROUTE: [
							{
								route: 'api/secure?contentType,authorization',
								validate: ({ contentType, authorization }) => {
									// Both headers must be present and valid
									return contentType === 'application/json' && 
									       typeof authorization === 'string' && 
									       authorization.startsWith('Bearer ');
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/secure',
				path: '/api/secure',
				pathParameters: {},
				queryStringParameters: {},
				headers: {
					'content-type': 'application/json',
					'authorization': 'Bearer token123'
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: getHeaderParameters() should return actual parameter values
			// ACTUAL (on unfixed code): getHeaderParameters() returns {}
			const headerParams = clientRequest.getHeaderParameters();
			expect(headerParams).toEqual({
				contentType: 'application/json',
				authorization: 'Bearer token123'
			});
		});

		it('should extract multiple header parameters: content-type, accept, and user-agent', () => {
			ClientRequest.init({
				parameters: {
					headerParameters: {
						BY_ROUTE: [
							{
								route: 'api/content?contentType,accept,userAgent',
								validate: ({ contentType, accept, userAgent }) => {
									// All headers must be non-empty strings
									return typeof contentType === 'string' && 
									       typeof accept === 'string' && 
									       typeof userAgent === 'string';
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/content',
				path: '/api/content',
				pathParameters: {},
				queryStringParameters: {},
				headers: {
					'content-type': 'application/json',
					'accept': 'application/json',
					'user-agent': 'Mozilla/5.0'
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: getHeaderParameters() should return actual parameter values
			// ACTUAL (on unfixed code): getHeaderParameters() returns {}
			const headerParams = clientRequest.getHeaderParameters();
			expect(headerParams).toEqual({
				contentType: 'application/json',
				accept: 'application/json',
				userAgent: 'Mozilla/5.0'
			});
		});
	});

	describe('Header Parameters with Path Parameters', () => {
		it('should extract header parameters when both path and header parameters exist: product/{id} with content-type', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (id) => /^\d+$/.test(id)
							}
						]
					},
					headerParameters: {
						BY_ROUTE: [
							{
								route: 'product/{id}?contentType',  // >! Route with path param and header param
								validate: ({ id, contentType }) => {
									// >! Multi-parameter validation receives object with all parameters
									return /^\d+$/.test(id) && contentType === 'application/json';
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: {
					id: '123'
				},
				queryStringParameters: {},
				headers: {
					'content-type': 'application/json'
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Path parameters should be extracted
			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				id: '123'
			});

			// EXPECTED: Header parameters should be extracted
			// ACTUAL (on unfixed code): getHeaderParameters() returns {}
			const headerParams = clientRequest.getHeaderParameters();
			expect(headerParams).toEqual({
				contentType: 'application/json'
			});
		});
	});

	describe('Header Parameters with Global Validation', () => {
		it('should extract header parameters with global validation', () => {
			ClientRequest.init({
				parameters: {
					headerParameters: {
						contentType: (value) => {
							return value === 'application/json' || value === 'application/xml';
						}
					}
				}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: {},
				queryStringParameters: {},
				headers: {
					'content-type': 'application/json'
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Header parameters should be extracted
			// ACTUAL (on unfixed code): getHeaderParameters() returns {}
			const headerParams = clientRequest.getHeaderParameters();
			expect(headerParams).toEqual({
				contentType: 'application/json'
			});
		});
	});

	describe('Header Parameters with Method-Specific Validation', () => {
		it('should extract header parameters with BY_METHOD validation', () => {
			ClientRequest.init({
				parameters: {
					headerParameters: {
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => {
									// >! BY_METHOD validations receive single parameter value directly
									// >! Each parameter is validated separately
									return typeof value === 'string' && value.length > 0;
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/items',
				path: '/api/items',
				pathParameters: {},
				queryStringParameters: {},
				headers: {
					'content-type': 'application/json',
					'authorization': 'Bearer secret'
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Header parameters should be extracted
			// ACTUAL (on unfixed code): getHeaderParameters() returns {}
			const headerParams = clientRequest.getHeaderParameters();
			expect(headerParams).toEqual({
				contentType: 'application/json',
				authorization: 'Bearer secret'
			});
		});
	});

	describe('Header Parameters with Query Parameters', () => {
		it('should extract both header and query parameters when both have validation rules', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'api/search?query',
								validate: (query) => {
									// >! Single-parameter validation receives value directly (not as object)
									return typeof query === 'string' && query.length > 0;
								}
							}
						]
					},
					headerParameters: {
						BY_ROUTE: [
							{
								route: 'api/search',
								validate: (contentType) => {
									// >! Single-parameter validation receives value directly (not as object)
									return contentType === 'application/json';
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/search',
				path: '/api/search',
				pathParameters: {},
				queryStringParameters: {
					query: 'test'
				},
				headers: {
					'content-type': 'application/json'
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Query parameters should be extracted
			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({
				query: 'test'
			});

			// EXPECTED: Header parameters should be extracted
			// ACTUAL (on unfixed code): getHeaderParameters() returns {}
			const headerParams = clientRequest.getHeaderParameters();
			expect(headerParams).toEqual({
				contentType: 'application/json'
			});
		});
	});

	describe('Validation Failure Cases (Should Still Work)', () => {
		it('should return isValid()===false and empty params when validation fails', () => {
			ClientRequest.init({
				parameters: {
					headerParameters: {
						BY_ROUTE: [
							{
								route: 'api/secure',
								validate: ({ contentType, authorization }) => {
									// Require both headers
									return contentType === 'application/json' && 
									       typeof authorization === 'string' && 
									       authorization.startsWith('Bearer ');
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/secure',
				path: '/api/secure',
				pathParameters: {},
				queryStringParameters: {},
				headers: {
					'content-type': 'application/json'
					// Missing authorization header
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return false because validation fails
			expect(clientRequest.isValid()).toBe(false);

			// EXPECTED: Header parameters should be empty when validation fails
			const headerParams = clientRequest.getHeaderParameters();
			expect(headerParams).toEqual({});
		});
	});
});

/**
 * COUNTEREXAMPLES DOCUMENTATION
 * 
 * When this test is run on UNFIXED code, the following counterexamples are expected:
 * 
 * 1. Route pattern "api/data" with request header { 'content-type': 'application/json' }
 *    - Expected: getHeaderParameters() === { contentType: 'application/json' }
 *    - Actual: getHeaderParameters() === {}
 *    - Reason: Parameter extraction fails when validation rules exist
 * 
 * 2. Route pattern "api/secure" with request headers { 'content-type': 'application/json', 'authorization': 'Bearer token123' }
 *    - Expected: getHeaderParameters() === { contentType: 'application/json', authorization: 'Bearer token123' }
 *    - Actual: getHeaderParameters() === {}
 *    - Reason: Multiple parameter extraction fails when validation rules exist
 * 
 * 3. Route pattern "api/content" with 3 header parameters
 *    - Expected: getHeaderParameters() === { contentType: 'application/json', accept: 'application/json', userAgent: 'Mozilla/5.0' }
 *    - Actual: getHeaderParameters() === {}
 *    - Reason: Parameter extraction fails for any number of header parameters
 * 
 * 4. Combined path and header parameters "product/{id}" with content-type header
 *    - Expected: getHeaderParameters() === { contentType: 'application/json' }
 *    - Actual: getHeaderParameters() === {}
 *    - Reason: Header parameter extraction fails even when path parameters work correctly
 * 
 * 5. Global validation for header parameters
 *    - Expected: getHeaderParameters() === { contentType: 'application/json' }
 *    - Actual: getHeaderParameters() === {}
 *    - Reason: Parameter extraction fails regardless of validation type
 * 
 * 6. BY_METHOD validation for header parameters
 *    - Expected: getHeaderParameters() === { contentType: 'application/json', authorization: 'Bearer secret' }
 *    - Actual: getHeaderParameters() === {}
 *    - Reason: Parameter extraction fails for method-specific validations
 * 
 * 7. Combined query and header parameters with validation rules
 *    - Expected: getHeaderParameters() === { contentType: 'application/json' }
 *    - Actual: getHeaderParameters() === {}
 *    - Reason: Header parameter extraction fails even when query parameters work correctly
 * 
 * ROOT CAUSE HYPOTHESIS:
 * The #hasValidHeaderParameters() method in ClientRequest.class.js (lines 747-759) has a logic 
 * error in how it handles parameter extraction when validation rules exist. The method calls 
 * #hasValidParameters() which uses ValidationMatcher to find validation rules. When a rule is found, 
 * the validation may pass, but the parameter extraction logic fails to populate this.#props.headerParameters 
 * with the actual parameter values from the request.
 * 
 * The issue is likely in #hasValidParameters() (lines 698-728) where the parameter extraction logic 
 * needs to ensure that when ValidationExecutor.execute() returns true, the parameter values are added 
 * to rValue.params. The parameter key and value must be correctly extracted from clientParameters and 
 * the loop must not exit early when it should continue processing parameters.
 * 
 * PRESERVATION NOTE:
 * Header parameter extraction without validation rules should continue to work correctly.
 * This test focuses only on scenarios where validation rules exist for header parameters.
 */
