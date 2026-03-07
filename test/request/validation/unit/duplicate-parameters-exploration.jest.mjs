import { describe, it, expect } from '@jest/globals';

// Import ValidationMatcher to test rule.params directly
const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
const ValidationMatcher = ValidationMatcherModule.default;

// Import ClientRequest to test the full validation flow
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

/**
 * EXPLORATION TEST FOR DEFECT 4: Duplicate Parameter Names in Validation Rules
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * 
 * GOAL: Surface counterexamples demonstrating that rule.params contains duplicate parameter names.
 * 
 * EXPECTED OUTCOME: Test FAILS (this is correct - it proves the bug exists)
 * 
 * Bug Condition: ValidationMatcher's #extractParamNames() method creates duplicate parameter names 
 * in rule.params arrays (e.g., ['id','key','key'] instead of ['id','key']).
 * 
 * Expected Behavior: rule.params should contain unique parameter names only, ensuring correct 
 * validation interface selection in ValidationExecutor.
 */
describe('Defect 4: Duplicate Parameters in Validation Rules - Exploration Tests', () => {
	describe('Path and Query Parameter Duplicates', () => {
		it('should have unique parameters in rule.params for route pattern product/{id}?key', () => {
			// Create validation configuration with path and query parameters
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'product/{id}?key',
						validate: ({ id, key }) => {
							return /^\d+$/.test(id) && typeof key === 'string';
						}
					}
				]
			};

			// Create ValidationMatcher instance
			const matcher = new ValidationMatcher(
				paramValidations,
				'GET',
				'/product/123'
			);

			// Find validation rule for 'id' parameter
			const rule = matcher.findValidationRule('id');

			// EXPECTED: rule.params should contain unique parameter names: ['id', 'key']
			// ACTUAL (on unfixed code): rule.params contains duplicates: ['id', 'key', 'key']
			expect(rule).not.toBeNull();
			expect(rule.params).toBeDefined();
			expect(Array.isArray(rule.params)).toBe(true);

			// Check for unique parameter names
			const uniqueParams = [...new Set(rule.params)];
			expect(rule.params).toEqual(uniqueParams);

			// Verify expected parameters are present
			expect(rule.params).toContain('id');
			expect(rule.params).toContain('key');

			// Verify no duplicates by checking length
			expect(rule.params.length).toBe(2);
		});

		it('should have unique parameters for route pattern search?query,limit,page', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'search?query,limit,page',
						validate: ({ query, limit, page }) => {
							return typeof query === 'string' && 
							       /^\d+$/.test(limit) && 
							       /^\d+$/.test(page);
						}
					}
				]
			};

			const matcher = new ValidationMatcher(
				paramValidations,
				'GET',
				'/search'
			);

			const rule = matcher.findValidationRule('query');

			// EXPECTED: rule.params should be ['query', 'limit', 'page'] with no duplicates
			expect(rule).not.toBeNull();
			expect(rule.params).toBeDefined();

			const uniqueParams = [...new Set(rule.params)];
			expect(rule.params).toEqual(uniqueParams);

			expect(rule.params).toContain('query');
			expect(rule.params).toContain('limit');
			expect(rule.params).toContain('page');
			expect(rule.params.length).toBe(3);
		});

		it('should have unique parameters for route pattern api/{version}?version,format (same name in path and query)', () => {
			// This is a critical test case: same parameter name in both path and query
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'api/{version}?version,format',
						validate: ({ version, format }) => {
							return /^v\d+$/.test(version) && typeof format === 'string';
						}
					}
				]
			};

			const matcher = new ValidationMatcher(
				paramValidations,
				'GET',
				'/api/v1'
			);

			const rule = matcher.findValidationRule('version');

			// EXPECTED: rule.params should be ['version', 'format'] - version appears only once
			// ACTUAL (on unfixed code): rule.params may be ['version', 'version', 'format']
			expect(rule).not.toBeNull();
			expect(rule.params).toBeDefined();

			const uniqueParams = [...new Set(rule.params)];
			expect(rule.params).toEqual(uniqueParams);

			// Count occurrences of 'version' - should be exactly 1
			const versionCount = rule.params.filter(p => p === 'version').length;
			expect(versionCount).toBe(1);

			expect(rule.params).toContain('version');
			expect(rule.params).toContain('format');
			expect(rule.params.length).toBe(2);
		});

		it('should have unique parameters for route pattern users/{userId}?userId,status (duplicate userId)', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'users/{userId}?userId,status',
						validate: ({ userId, status }) => {
							return /^\d+$/.test(userId) && typeof status === 'string';
						}
					}
				]
			};

			const matcher = new ValidationMatcher(
				paramValidations,
				'GET',
				'/users/123'
			);

			const rule = matcher.findValidationRule('userId');

			// EXPECTED: rule.params should be ['userId', 'status'] - userId appears only once
			// ACTUAL (on unfixed code): rule.params is ['userId', 'userId', 'status']
			expect(rule).not.toBeNull();
			expect(rule.params).toBeDefined();

			const uniqueParams = [...new Set(rule.params)];
			expect(rule.params).toEqual(uniqueParams);

			// Count occurrences of 'userId' - should be exactly 1
			const userIdCount = rule.params.filter(p => p === 'userId').length;
			expect(userIdCount).toBe(1);

			expect(rule.params).toContain('userId');
			expect(rule.params).toContain('status');
			expect(rule.params.length).toBe(2);
		});
	});

	describe('Multiple Path Parameters with Query Parameters', () => {
		it('should have unique parameters for route pattern users/{userId}/posts/{postId}?includeComments', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'users/{userId}/posts/{postId}?includeComments',
						validate: ({ userId, postId, includeComments }) => {
							return /^\d+$/.test(userId) && 
							       /^\d+$/.test(postId) && 
							       typeof includeComments === 'string';
						}
					}
				]
			};

			const matcher = new ValidationMatcher(
				paramValidations,
				'GET',
				'/users/123/posts/456'
			);

			const rule = matcher.findValidationRule('userId');

			// EXPECTED: rule.params should be ['userId', 'postId', 'includeComments']
			expect(rule).not.toBeNull();
			expect(rule.params).toBeDefined();

			const uniqueParams = [...new Set(rule.params)];
			expect(rule.params).toEqual(uniqueParams);

			expect(rule.params).toContain('userId');
			expect(rule.params).toContain('postId');
			expect(rule.params).toContain('includeComments');
			expect(rule.params.length).toBe(3);
		});

		it('should have unique parameters for route pattern org/{orgId}/projects/{projectId}?orgId,projectId (all duplicates)', () => {
			// Extreme case: all path parameters duplicated in query
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'org/{orgId}/projects/{projectId}?orgId,projectId',
						validate: ({ orgId, projectId }) => {
							return /^\d+$/.test(orgId) && /^\d+$/.test(projectId);
						}
					}
				]
			};

			const matcher = new ValidationMatcher(
				paramValidations,
				'GET',
				'/org/1/projects/2'
			);

			const rule = matcher.findValidationRule('orgId');

			// EXPECTED: rule.params should be ['orgId', 'projectId'] - each appears only once
			// ACTUAL (on unfixed code): rule.params is ['orgId', 'projectId', 'orgId', 'projectId']
			expect(rule).not.toBeNull();
			expect(rule.params).toBeDefined();

			const uniqueParams = [...new Set(rule.params)];
			expect(rule.params).toEqual(uniqueParams);

			// Count occurrences - each should appear exactly once
			const orgIdCount = rule.params.filter(p => p === 'orgId').length;
			const projectIdCount = rule.params.filter(p => p === 'projectId').length;
			expect(orgIdCount).toBe(1);
			expect(projectIdCount).toBe(1);

			expect(rule.params).toContain('orgId');
			expect(rule.params).toContain('projectId');
			expect(rule.params.length).toBe(2);
		});
	});

	describe('Method-and-Route Patterns with Duplicates', () => {
		it('should have unique parameters for method-and-route pattern POST:product/{id}?id,key', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'POST:product/{id}?id,key',
						validate: ({ id, key }) => {
							return /^\d+$/.test(id) && typeof key === 'string';
						}
					}
				]
			};

			const matcher = new ValidationMatcher(
				paramValidations,
				'POST',
				'/product/123'
			);

			const rule = matcher.findValidationRule('id');

			// EXPECTED: rule.params should be ['id', 'key'] with no duplicates
			// NOTE: Route explicitly lists both id and key after ?, so both are validated
			expect(rule).not.toBeNull();
			expect(rule.params).toBeDefined();

			const uniqueParams = [...new Set(rule.params)];
			expect(rule.params).toEqual(uniqueParams);

			expect(rule.params).toContain('id');
			expect(rule.params).toContain('key');
			expect(rule.params.length).toBe(2);
		});

		it('should have unique parameters for method-and-route pattern GET:users/{userId}?userId,includeProfile', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'GET:users/{userId}?userId,includeProfile',
						validate: ({ userId, includeProfile }) => {
							return /^\d+$/.test(userId) && typeof includeProfile === 'string';
						}
					}
				]
			};

			const matcher = new ValidationMatcher(
				paramValidations,
				'GET',
				'/users/123'
			);

			const rule = matcher.findValidationRule('userId');

			// EXPECTED: rule.params should be ['userId', 'includeProfile'] - userId appears only once
			expect(rule).not.toBeNull();
			expect(rule.params).toBeDefined();

			const uniqueParams = [...new Set(rule.params)];
			expect(rule.params).toEqual(uniqueParams);

			const userIdCount = rule.params.filter(p => p === 'userId').length;
			expect(userIdCount).toBe(1);

			expect(rule.params).toContain('userId');
			expect(rule.params).toContain('includeProfile');
			expect(rule.params.length).toBe(2);
		});
	});

	describe('Impact on Validation Interface Selection', () => {
		it('should correctly select multi-parameter validation interface when rule.params has no duplicates', () => {
			// Initialize ClientRequest with validation that expects object parameter
			// NOTE: Routes explicitly list both id and key after ? to validate both
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'product/{id}?id,key',
								validate: (params) => {
									// This validation function expects an object with id and key
									// If rule.params has duplicates, ValidationExecutor may pass
									// the value directly instead of an object
									expect(typeof params).toBe('object');
									expect(params).toHaveProperty('id');
									expect(params).toHaveProperty('key');
									return /^\d+$/.test(params.id) && typeof params.key === 'string';
								}
							}
						]
					},
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'product/{id}?key',
								validate: (params) => {
									expect(typeof params).toBe('object');
									expect(params).toHaveProperty('key');
									return typeof params.key === 'string';
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
					key: 'test-key'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: Validation should pass because rule.params has unique values
			// ACTUAL (on unfixed code): May fail if duplicates cause wrong interface selection
			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({ id: '123' });

			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({ key: 'test-key' });
		});

		it('should handle validation correctly when same parameter name appears in path and query', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'users/{userId}?userId,status',
								validate: (params) => {
									// Validation function expects object with userId and status
									expect(typeof params).toBe('object');
									expect(params).toHaveProperty('userId');
									expect(params).toHaveProperty('status');
									return /^\d+$/.test(params.userId) && typeof params.status === 'string';
								}
							}
						]
					},
					queryStringParameters: {
						BY_ROUTE: [
							{
								route: 'users/{userId}?userId,status',
								validate: (params) => {
									expect(typeof params).toBe('object');
									return true; // Accept any query params
								}
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/users/{userId}',
				path: '/users/123',
				pathParameters: {
					userId: '123'
				},
				queryStringParameters: {
					userId: '456', // Different value in query
					status: 'active'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: Validation should work correctly despite duplicate parameter name
			// ACTUAL (on unfixed code): May fail due to duplicate parameters in rule.params
			expect(clientRequest.isValid()).toBe(true);
		});
	});
});

/**
 * COUNTEREXAMPLES DOCUMENTATION
 * 
 * When this test is run on UNFIXED code, the following counterexamples are expected:
 * 
 * 1. Route pattern "product/{id}?id,key"
 *    - Expected: rule.params === ['id', 'key']
 *    - Actual: rule.params === ['id', 'id', 'key']
 *    - Reason: Path parameter 'id' is extracted twice (once from {id}, once from ?id)
 * 
 * 2. Route pattern "users/{userId}?userId,status"
 *    - Expected: rule.params === ['userId', 'status']
 *    - Actual: rule.params === ['userId', 'userId', 'status']
 *    - Reason: 'userId' appears in both path and query, creating duplicate
 * 
 * 3. Route pattern "api/{version}?version,format"
 *    - Expected: rule.params === ['version', 'format']
 *    - Actual: rule.params === ['version', 'version', 'format']
 *    - Reason: 'version' appears in both path and query
 * 
 * 4. Route pattern "org/{orgId}/projects/{projectId}?orgId,projectId"
 *    - Expected: rule.params === ['orgId', 'projectId']
 *    - Actual: rule.params === ['orgId', 'projectId', 'orgId', 'projectId']
 *    - Reason: Both path parameters duplicated in query
 * 
 * 5. Validation interface selection breaks
 *    - Expected: Multi-parameter validation receives object with all parameters
 *    - Actual: May receive wrong interface due to duplicate parameter count
 *    - Reason: ValidationExecutor uses rule.params.length to determine interface
 * 
 * ROOT CAUSE HYPOTHESIS:
 * The #extractParamNames() method in ValidationMatcher.class.js (lines 308-345) extracts
 * parameters from both path and query parts of the route pattern, but doesn't deduplicate
 * the results. When a parameter name appears in both parts, it gets added to the array twice.
 * 
 * EXPECTED FIX:
 * After extracting path and query parameters, deduplicate the results using Set or filter:
 * return [...new Set(params)];
 * 
 * PRESERVATION NOTE:
 * Existing parameter extraction for non-duplicate cases should remain unchanged.
 * The fix should only affect cases where the same parameter name appears multiple times.
 */
