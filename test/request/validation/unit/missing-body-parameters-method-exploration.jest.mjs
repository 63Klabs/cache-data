import { describe, it, expect } from '@jest/globals';

// Import ClientRequest to test the full validation flow
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

/**
 * EXPLORATION TEST FOR DEFECT 5: Missing getBodyParameters() Method
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * 
 * GOAL: Surface counterexamples demonstrating that getBodyParameters() throws TypeError.
 * 
 * EXPECTED OUTCOME: Test FAILS with TypeError (this is correct - it proves the bug exists)
 * 
 * Bug Condition: The getBodyParameters() method does not exist on ClientRequest class,
 * causing TypeError when tests attempt to call it.
 * 
 * Expected Behavior: getBodyParameters() method should exist and return the validated 
 * body parameters as an object, following the same pattern as other parameter getter methods.
 */
describe('Defect 5: Missing getBodyParameters() Method - Exploration Tests', () => {
	describe('Method Existence', () => {
		it('should have getBodyParameters() method defined', () => {
			// Initialize ClientRequest with minimal configuration
			ClientRequest.init({
				parameters: {}
			});

			// Create mock API Gateway event
			const event = {
				httpMethod: 'POST',
				resource: '/api/users',
				path: '/api/users',
				pathParameters: {},
				queryStringParameters: {},
				headers: {},
				body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			// Create ClientRequest instance
			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: getBodyParameters method should exist
			// ACTUAL (on unfixed code): TypeError - getBodyParameters is not a function
			expect(typeof clientRequest.getBodyParameters).toBe('function');
		});

		it('should return an object from getBodyParameters()', () => {
			ClientRequest.init({
				parameters: {}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/users',
				path: '/api/users',
				pathParameters: {},
				queryStringParameters: {},
				headers: {},
				body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: getBodyParameters() should return an object
			// ACTUAL (on unfixed code): TypeError - getBodyParameters is not a function
			const bodyParams = clientRequest.getBodyParameters();
			expect(typeof bodyParams).toBe('object');
			expect(bodyParams).not.toBeNull();
		});
	});

	describe('Method Signature Consistency', () => {
		it('should match signature of other parameter getter methods', () => {
			ClientRequest.init({
				parameters: {}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/users',
				path: '/api/users',
				pathParameters: {},
				queryStringParameters: {},
				headers: {},
				body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: All parameter getter methods should exist and have consistent signatures
			// ACTUAL (on unfixed code): getBodyParameters is not a function
			
			// Verify other parameter getters exist (these should work)
			expect(typeof clientRequest.getPathParameters).toBe('function');
			expect(typeof clientRequest.getQueryStringParameters).toBe('function');
			expect(typeof clientRequest.getHeaderParameters).toBe('function');
			expect(typeof clientRequest.getCookieParameters).toBe('function');
			
			// Verify getBodyParameters exists (this will fail on unfixed code)
			expect(typeof clientRequest.getBodyParameters).toBe('function');
			
			// Verify all return objects
			expect(typeof clientRequest.getPathParameters()).toBe('object');
			expect(typeof clientRequest.getQueryStringParameters()).toBe('object');
			expect(typeof clientRequest.getHeaderParameters()).toBe('object');
			expect(typeof clientRequest.getCookieParameters()).toBe('object');
			expect(typeof clientRequest.getBodyParameters()).toBe('object');
		});

		it('should return empty object when no body parameters exist', () => {
			ClientRequest.init({
				parameters: {}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/users',
				path: '/api/users',
				pathParameters: {},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: getBodyParameters() should return empty object when no body
			// ACTUAL (on unfixed code): TypeError - getBodyParameters is not a function
			const bodyParams = clientRequest.getBodyParameters();
			expect(bodyParams).toEqual({});
		});
	});

	describe('Body Parameter Extraction (Future Functionality)', () => {
		it('should extract body parameters when validation rules exist', () => {
			// This test documents expected behavior for when body parameter validation is implemented
			ClientRequest.init({
				parameters: {
					bodyParameters: {
						BY_ROUTE: [
							{
								route: 'api/users',
								validate: ({ name, email }) => {
									return typeof name === 'string' && 
									       typeof email === 'string' &&
									       email.includes('@');
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/users',
				path: '/api/users',
				pathParameters: {},
				queryStringParameters: {},
				headers: {},
				body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: getBodyParameters() should exist and return validated body parameters
			// ACTUAL (on unfixed code): TypeError - getBodyParameters is not a function
			const bodyParams = clientRequest.getBodyParameters();
			
			// Note: This test documents expected behavior. The actual implementation
			// of body parameter validation may differ, but the method must exist.
			expect(bodyParams).toBeDefined();
			expect(typeof bodyParams).toBe('object');
		});
	});

	describe('Comparison with Other Parameter Getters', () => {
		it('should follow same pattern as getPathParameters()', () => {
			ClientRequest.init({
				parameters: {}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/users/{id}',
				path: '/api/users/123',
				pathParameters: {
					id: '123'
				},
				queryStringParameters: {},
				headers: {},
				body: JSON.stringify({ name: 'John' }),
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: Both methods should exist and return objects
			// ACTUAL (on unfixed code): getBodyParameters is not a function
			
			const pathParams = clientRequest.getPathParameters();
			expect(typeof pathParams).toBe('object');
			
			const bodyParams = clientRequest.getBodyParameters();
			expect(typeof bodyParams).toBe('object');
		});

		it('should follow same pattern as getQueryStringParameters()', () => {
			ClientRequest.init({
				parameters: {}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/users',
				path: '/api/users',
				pathParameters: {},
				queryStringParameters: {
					filter: 'active'
				},
				headers: {},
				body: JSON.stringify({ name: 'John' }),
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: Both methods should exist and return objects
			// ACTUAL (on unfixed code): getBodyParameters is not a function
			
			const queryParams = clientRequest.getQueryStringParameters();
			expect(typeof queryParams).toBe('object');
			
			const bodyParams = clientRequest.getBodyParameters();
			expect(typeof bodyParams).toBe('object');
		});

		it('should follow same pattern as getHeaderParameters()', () => {
			ClientRequest.init({
				parameters: {}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/users',
				path: '/api/users',
				pathParameters: {},
				queryStringParameters: {},
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({ name: 'John' }),
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: Both methods should exist and return objects
			// ACTUAL (on unfixed code): getBodyParameters is not a function
			
			const headerParams = clientRequest.getHeaderParameters();
			expect(typeof headerParams).toBe('object');
			
			const bodyParams = clientRequest.getBodyParameters();
			expect(typeof bodyParams).toBe('object');
		});
	});
});

/**
 * COUNTEREXAMPLES DOCUMENTATION
 * 
 * When this test is run on UNFIXED code, the following counterexamples are expected:
 * 
 * 1. Method Existence Test
 *    - Expected: typeof clientRequest.getBodyParameters === 'function'
 *    - Actual: TypeError: clientRequest.getBodyParameters is not a function
 *    - Reason: The getBodyParameters() method is completely missing from ClientRequest class
 * 
 * 2. Method Return Type Test
 *    - Expected: getBodyParameters() returns an object
 *    - Actual: TypeError: clientRequest.getBodyParameters is not a function
 *    - Reason: Cannot call a method that doesn't exist
 * 
 * 3. Method Signature Consistency Test
 *    - Expected: All parameter getter methods (getPathParameters, getQueryStringParameters, 
 *                getHeaderParameters, getCookieParameters, getBodyParameters) exist
 *    - Actual: getBodyParameters is not a function while others exist
 *    - Reason: Inconsistent API - getBodyParameters was never implemented
 * 
 * 4. Empty Object Return Test
 *    - Expected: getBodyParameters() returns {} when no body parameters
 *    - Actual: TypeError: clientRequest.getBodyParameters is not a function
 *    - Reason: Method doesn't exist to return anything
 * 
 * 5. Pattern Consistency Tests
 *    - Expected: getBodyParameters() follows same pattern as other parameter getters
 *    - Actual: TypeError when attempting to call getBodyParameters()
 *    - Reason: Missing method breaks the consistent API pattern
 * 
 * ROOT CAUSE HYPOTHESIS:
 * The getBodyParameters() method was simply never implemented in the ClientRequest class.
 * All other parameter getter methods exist (getPathParameters, getQueryStringParameters,
 * getHeaderParameters, getCookieParameters) but getBodyParameters is missing.
 * 
 * The fix is straightforward: Add the getBodyParameters() method following the same pattern
 * as the other parameter getter methods. The method should:
 * 1. Return this.#props.bodyParameters (or empty object {} if not implemented)
 * 2. Have JSDoc documentation matching other parameter getter methods
 * 3. Be placed after line 847 in ClientRequest.class.js (after getCookieParameters)
 * 
 * Example implementation:
 * ```javascript
 * /**
 *  * Returns the body parameters received in the request.
 *  * Body parameters are validated in the applications validation functions.
 *  * @returns {object} body parameters
 *  *\/
 * getBodyParameters() {
 *     return this.#props.bodyParameters || {};
 * }
 * ```
 * 
 * PRESERVATION NOTE:
 * Adding this method should not affect any existing functionality. It simply fills a gap
 * in the API to provide consistency with other parameter getter methods.
 */
