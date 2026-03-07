import { describe, it, expect } from '@jest/globals';

// Import ClientRequest to test the full validation flow
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

/**
 * EXPLORATION TEST FOR DEFECT 2: Query String Parameter Extraction Failure
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * 
 * GOAL: Surface counterexamples demonstrating that query parameters return {} instead of actual values.
 * 
 * EXPECTED OUTCOME: Test FAILS (this is correct - it proves the bug exists)
 * 
 * Bug Condition: When a validation rule exists for query string parameters, getQueryStringParameters() 
 * returns an empty object {} instead of the actual parameter values.
 * 
 * Expected Behavior: getQueryStringParameters() should return actual query parameter values when 
 * validation rules exist and validation passes.
 */
describe('Defect 2: Query String Parameter Extraction - Exploration Tests', () => {
	describe('Single Query Parameter Validation', () => {
		it('should extract query parameter when validation rule exists: search?query', () => {
			// Initialize ClientRequest with validation for query parameter
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'search?query',
								validate: (query) => {
									// Query must be a non-empty string
									// >! Single-parameter validation receives value directly (not as object)
									return typeof query === 'string' && query.length > 0;
								}
							}
						]
					}
				}
			});

			// Create mock API Gateway event with query parameter
			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: {},
				queryStringParameters: {
					query: 'test'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			// Create ClientRequest instance
			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true for valid request
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: getQueryStringParameters() should return actual parameter values
			// ACTUAL (on unfixed code): getQueryStringParameters() returns {}
			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({
				query: 'test'
			});
		});
	});

	describe('Multiple Query Parameter Validation', () => {
		it('should extract multiple query parameters: search?query,limit', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'search?query,limit',
								validate: ({ query, limit }) => {
									// Query must be non-empty string, limit must be numeric string
									return typeof query === 'string' && 
									       query.length > 0 && 
									       /^\d+$/.test(limit);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: {},
				queryStringParameters: {
					query: 'test',
					limit: '10'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: getQueryStringParameters() should return actual parameter values
			// ACTUAL (on unfixed code): getQueryStringParameters() returns {}
			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({
				query: 'test',
				limit: '10'
			});
		});

		it('should extract multiple query parameters: filter?status,category,page', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'filter?status,category,page',
								validate: ({ status, category, page }) => {
									// All parameters must be non-empty strings
									return typeof status === 'string' && 
									       typeof category === 'string' && 
									       /^\d+$/.test(page);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/filter',
				path: '/filter',
				pathParameters: {},
				queryStringParameters: {
					status: 'active',
					category: 'electronics',
					page: '1'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: getQueryStringParameters() should return actual parameter values
			// ACTUAL (on unfixed code): getQueryStringParameters() returns {}
			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({
				status: 'active',
				category: 'electronics',
				page: '1'
			});
		});
	});

	describe('Query Parameters with Path Parameters', () => {
		it('should extract query parameters when both path and query parameters exist: product/{id}?includeProfile', () => {
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
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'product/{id}?includeprofile',  // >! Lowercase to match lowercased query parameter keys
								validate: ({ id, includeprofile }) => {
									// >! Multi-parameter validation (path + query) receives object with all parameters
									// >! Note: query parameter keys are lowercased by hasValidQueryStringParameters
									return /^\d+$/.test(id) && (includeprofile === 'true' || includeprofile === 'false');
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: {
					id: '123'
				},
				queryStringParameters: {
					includeProfile: 'true'
				},
				headers: {},
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

			// EXPECTED: Query parameters should be extracted
			// ACTUAL (on unfixed code): getQueryStringParameters() returns {}
			// NOTE: Query parameter keys are lowercased by hasValidQueryStringParameters
			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({
				includeprofile: 'true'
			});
		});
	});

	describe('Query Parameters with Global Validation', () => {
		it('should extract query parameters with global validation', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						search: (value) => {
							return typeof value === 'string' && value.length > 0;
						}
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/search',
				path: '/api/search',
				pathParameters: {},
				queryStringParameters: {
					search: 'test query'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Query parameters should be extracted
			// ACTUAL (on unfixed code): getQueryStringParameters() returns {}
			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({
				search: 'test query'
			});
		});
	});

	describe('Query Parameters with Method-Specific Validation', () => {
		it('should extract query parameters with BY_METHOD validation', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_METHOD: [
							{
								method: 'GET',
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
				httpMethod: 'GET',
				resource: '/api/items',
				path: '/api/items',
				pathParameters: {},
				queryStringParameters: {
					sort: 'name',
					order: 'asc'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Query parameters should be extracted
			// ACTUAL (on unfixed code): getQueryStringParameters() returns {}
			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({
				sort: 'name',
				order: 'asc'
			});
		});
	});

	describe('Validation Failure Cases (Should Still Work)', () => {
		it('should return isValid()===false and empty params when validation fails', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'search?query,limit',
								validate: ({ query, limit }) => {
									// Require numeric limit
									return typeof query === 'string' && /^\d+$/.test(limit);
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: {},
				queryStringParameters: {
					query: 'test',
					limit: 'invalid'  // Non-numeric value
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return false because validation fails
			expect(clientRequest.isValid()).toBe(false);

			// EXPECTED: Query parameters should be empty when validation fails
			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({});
		});
	});
});

/**
 * COUNTEREXAMPLES DOCUMENTATION
 * 
 * When this test is run on UNFIXED code, the following counterexamples are expected:
 * 
 * 1. Route pattern "search?query" with request query { query: 'test' }
 *    - Expected: getQueryStringParameters() === { query: 'test' }
 *    - Actual: getQueryStringParameters() === {}
 *    - Reason: Parameter extraction fails when validation rules exist
 * 
 * 2. Route pattern "search?query,limit" with request query { query: 'test', limit: '10' }
 *    - Expected: getQueryStringParameters() === { query: 'test', limit: '10' }
 *    - Actual: getQueryStringParameters() === {}
 *    - Reason: Multiple parameter extraction fails when validation rules exist
 * 
 * 3. Route pattern "filter?status,category,page" with 3 query parameters
 *    - Expected: getQueryStringParameters() === { status: 'active', category: 'electronics', page: '1' }
 *    - Actual: getQueryStringParameters() === {}
 *    - Reason: Parameter extraction fails for any number of query parameters
 * 
 * 4. Combined path and query parameters "product/{id}?includeProfile"
 *    - Expected: getQueryStringParameters() === { includeProfile: 'true' }
 *    - Actual: getQueryStringParameters() === {}
 *    - Reason: Query parameter extraction fails even when path parameters work correctly
 * 
 * 5. Global validation for query parameters
 *    - Expected: getQueryStringParameters() === { search: 'test query' }
 *    - Actual: getQueryStringParameters() === {}
 *    - Reason: Parameter extraction fails regardless of validation type
 * 
 * 6. BY_METHOD validation for query parameters
 *    - Expected: getQueryStringParameters() === { sort: 'name', order: 'asc' }
 *    - Actual: getQueryStringParameters() === {}
 *    - Reason: Parameter extraction fails for method-specific validations
 * 
 * ROOT CAUSE HYPOTHESIS:
 * The #hasValidQueryStringParameters() method in ClientRequest.class.js (lines 730-745) has a logic 
 * error in how it handles parameter extraction when validation rules exist. The method calls 
 * #hasValidParameters() which uses ValidationMatcher to find validation rules. When a rule is found, 
 * the validation may pass, but the parameter extraction logic fails to populate this.#props.queryStringParameters 
 * with the actual parameter values from the request.
 * 
 * The issue is likely in #hasValidParameters() (lines 698-728) where the parameter extraction logic 
 * needs to ensure that when ValidationExecutor.execute() returns true, the parameter values are added 
 * to rValue.params. The parameter key and value must be correctly extracted from clientParameters and 
 * the loop must not exit early when it should continue processing parameters.
 * 
 * PRESERVATION NOTE:
 * Query parameter extraction without validation rules should continue to work correctly.
 * This test focuses only on scenarios where validation rules exist for query parameters.
 */
