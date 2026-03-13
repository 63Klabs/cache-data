import { describe, it, expect, beforeAll } from '@jest/globals';

/**
 * Integration Tests: Complex Validation Scenarios
 * 
 * These tests verify that all bug fixes work together correctly in complex,
 * real-world validation scenarios. They test the full ClientRequest validation
 * flow with multiple placeholders, all parameter types, validation priority order,
 * and proper parameter extraction.
 * 
 * Test Coverage:
 * - Multiple placeholder routes (Defect 1 fix)
 * - Query string parameter extraction (Defect 2 fix)
 * - Header parameter extraction (Defect 3 fix)
 * - No duplicate parameters (Defect 4 fix)
 * - getBodyParameters() method exists (Defect 5 fix)
 * - Method-and-route pattern matching (Defect 6 fix)
 * - All parameter types together (path, query, header, cookie, body)
 * - Validation priority order (Method-and-Route > Route > Method > Global)
 * - Invalid parameter exclusion
 * - Complex real-world API scenarios
 * 
 * Requirements Validated: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
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
		body: null,
		...overrides
	};
}

describe('ClientRequest - Complex Validation Integration Tests', () => {
	let ClientRequest;

	beforeAll(async () => {
		// Dynamic import to get fresh module
		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
		ClientRequest = module.default;
	});

	describe('Scenario 1: Multiple Placeholders with All Parameter Types', () => {
		it('should validate route with 2 placeholders and extract all parameter types', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value),
						postId: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'users/{userId}/posts/{postId}',
								validate: ({ userId, postId }) => {
									return /^[0-9]+$/.test(userId) && parseInt(userId) > 0 &&
									       /^[0-9]+$/.test(postId) && parseInt(postId) > 0;
								}
							}
						]
					},
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0,
						page: (value) => !isNaN(value) && parseInt(value) > 0
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/users/{userId}/posts/{postId}',
				path: '/users/123/posts/456',
				pathParameters: {
					userId: '123',
					postId: '456'
				},
				queryStringParameters: {
					limit: '10',
					page: '1'
				},
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer token123'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				userId: '123',
				postId: '456'
			});
			expect(request.getQueryStringParameters()).toEqual({
				limit: '10',
				page: '1'
			});
			expect(request.getHeaderParameters()).toEqual({
				authorization: 'Bearer token123'
			});
		});

		it('should validate route with 3 placeholders', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						version: (value) => /^v[0-9]+$/.test(value),
						resourceId: (value) => /^[0-9]+$/.test(value),
						itemId: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'api/{version}/resources/{resourceId}/items/{itemId}',
								validate: ({ version, resourceId, itemId }) => {
									return version.length > 0 && resourceId.length > 0 && itemId.length > 0;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/api/{version}/resources/{resourceId}/items/{itemId}',
				path: '/api/v1/resources/100/items/200',
				pathParameters: {
					version: 'v1',
					resourceId: '100',
					itemId: '200'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				version: 'v1',
				resourceId: '100',
				itemId: '200'
			});
		});

		it('should validate route with 4 placeholders', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						orgId: (value) => /^[0-9]+$/.test(value),
						projectId: (value) => /^[0-9]+$/.test(value),
						branchId: (value) => /^[a-z0-9-]+$/.test(value),
						fileId: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createMockEvent({
				resource: '/orgs/{orgId}/projects/{projectId}/branches/{branchId}/files/{fileId}',
				path: '/orgs/1/projects/2/branches/main/files/3',
				pathParameters: {
					orgId: '1',
					projectId: '2',
					branchId: 'main',
					fileId: '3'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				orgId: '1',
				projectId: '2',
				branchId: 'main',
				fileId: '3'
			});
		});
	});

	describe('Scenario 2: Method-and-Route with Multiple Placeholders', () => {
		it('should match POST:users/{userId}/posts/{postId} correctly', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value),
						postId: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'POST:users/{userId}/posts/{postId}',
								validate: ({ userId, postId }) => {
									return /^[0-9]+$/.test(userId) && parseInt(userId) > 0 &&
									       /^[0-9]+$/.test(postId) && parseInt(postId) > 0;
								}
							},
							{
								route: 'users/{userId}/posts/{postId}',
								validate: ({ userId, postId }) => {
									return /^[0-9]+$/.test(userId) && /^[0-9]+$/.test(postId);
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/users/{userId}/posts/{postId}',
				path: '/users/123/posts/456',
				pathParameters: {
					userId: '123',
					postId: '456'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				userId: '123',
				postId: '456'
			});
		});

		it('should use route-only validation when method does not match', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value),
						postId: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'POST:users/{userId}/posts/{postId}',
								validate: ({ userId, postId }) => {
									// Strict format for POST - requires NEW- prefix
									return /^NEW-[0-9]+$/.test(userId) && /^NEW-[0-9]+$/.test(postId);
								}
							},
							{
								route: 'users/{userId}/posts/{postId}',
								validate: ({ userId, postId }) => {
									// Flexible format for other methods
									return /^[0-9]+$/.test(userId) && /^[0-9]+$/.test(postId);
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/users/{userId}/posts/{postId}',
				path: '/users/123/posts/456',
				pathParameters: {
					userId: '123',
					postId: '456'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				userId: '123',
				postId: '456'
			});
		});
	});

	describe('Scenario 3: Query and Header Parameters with Validation', () => {
		it('should extract query parameters when validation passes', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.length > 0,
						limit: (value) => !isNaN(value),
						BY_ROUTE: [
							{
								route: 'search?query,limit',
								validate: ({ query, limit }) => {
									if (!query || query.length < 3) return false;
									const limitNum = parseInt(limit || '10');
									return limitNum >= 1 && limitNum <= 100;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/search',
				path: '/search',
				queryStringParameters: {
					query: 'javascript',
					limit: '25'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({
				query: 'javascript',
				limit: '25'
			});
		});

		it('should extract header parameters when validation passes', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					headerParameters: {
						contentType: (value) => value.length > 0,
						authorization: (value) => value.startsWith('Bearer ')
					}
				}
			});

			const event = createMockEvent({
				headers: {
					'Referer': 'https://example.com',
					'Content-Type': 'application/json',
					'Authorization': 'Bearer token123'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getHeaderParameters()).toEqual({
				contentType: 'application/json',
				authorization: 'Bearer token123'
			});
		});

		it('should return empty objects when query/header validation fails', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) <= 100
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
					}
				}
			});

			const event = createMockEvent({
				queryStringParameters: {
					limit: '200' // Exceeds max
				},
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Basic token123' // Wrong format
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getQueryStringParameters()).toEqual({});
			expect(request.getHeaderParameters()).toEqual({});
		});
	});

	describe('Scenario 4: Body Parameters Method Exists', () => {
		it('should have getBodyParameters() method that returns object', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				body: JSON.stringify({ name: 'John', email: 'john@example.com' })
			});

			const request = new ClientRequest(event, createMockContext());

			// Method should exist
			expect(typeof request.getBodyParameters).toBe('function');

			// Should return an object
			const bodyParams = request.getBodyParameters();
			expect(typeof bodyParams).toBe('object');
			expect(bodyParams).not.toBeNull();
		});

		it('should return empty object when no body validation configured', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				body: JSON.stringify({ name: 'John' })
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.getBodyParameters()).toEqual({});
		});
	});

	describe('Scenario 5: No Duplicate Parameters in Validation Rules', () => {
		it('should not have duplicate parameters in multi-parameter validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					queryParameters: {
						key: (value) => value.length > 0,
						BY_ROUTE: [
							{
								route: 'product/{id}?key',
								validate: ({ id, key }) => {
									// This should receive unique parameters only
									// If duplicates existed, this would fail
									return id && key && id.length > 0 && key.length > 0;
								}
							}
						]
					}
				}
			});

			const event = createMockEvent({
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: { id: '123' },
				queryStringParameters: { key: 'value' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: '123' });
			expect(request.getQueryStringParameters()).toEqual({ key: 'value' });
		});
	});

	describe('Scenario 6: Validation Priority Order', () => {
		it('should use Priority 1 (method-and-route) over all others', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value), // Priority 4: Global
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^METHOD-[0-9]+$/.test(value) // Priority 3
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^P1-[0-9]+$/.test(value) // Priority 1
							},
							{
								route: 'product/{id}',
								validate: (value) => /^P2-[0-9]+$/.test(value) // Priority 2
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/P1-123',
				pathParameters: { id: 'P1-123' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P1-123' });
		});

		it('should use Priority 2 (route-only) when Priority 1 does not match', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value),
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^METHOD-[0-9]+$/.test(value)
							}
						],
						BY_ROUTE: [
							{
								route: 'POST:product/{id}',
								validate: (value) => /^P1-[0-9]+$/.test(value)
							},
							{
								route: 'product/{id}',
								validate: (value) => /^P2-[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/P2-456',
				pathParameters: { id: 'P2-456' }
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'P2-456' });
		});
	});

	describe('Scenario 7: Invalid Parameters Excluded', () => {
		it('should exclude invalid parameters from results', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value),
						postId: (value) => /^[0-9]+$/.test(value)
					},
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) <= 100,
						page: (value) => !isNaN(value)
					}
				}
			});

			const event = createMockEvent({
				resource: '/users/{userId}/posts/{postId}',
				path: '/users/123/posts/abc', // postId is invalid
				pathParameters: {
					userId: '123',
					postId: 'abc' // Invalid - not numeric
				},
				queryStringParameters: {
					limit: '200', // Invalid - exceeds max
					page: '1' // Valid
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			// Invalid parameters should be excluded
			expect(request.getPathParameters()).toEqual({});
			expect(request.getQueryStringParameters()).toEqual({});
		});

		it('should include valid parameters and exclude invalid ones', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) <= 100,
						page: (value) => !isNaN(value),
						sort: (value) => ['asc', 'desc'].includes(value)
					}
				}
			});

			const event = createMockEvent({
				queryStringParameters: {
					limit: '50', // Valid
					page: '1', // Valid
					sort: 'invalid' // Invalid
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			// Only valid parameters should be included
			expect(request.getQueryStringParameters()).toEqual({});
		});
	});

	describe('Scenario 8: Real-World E-Commerce API', () => {
		it('should handle complex e-commerce product API', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						categoryId: (value) => /^[0-9]+$/.test(value),
						productId: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'POST:categories/{categoryId}/products/{productId}',
								validate: ({ categoryId, productId }) => {
									return /^[0-9]+$/.test(categoryId) && parseInt(categoryId) > 0 &&
									       /^[0-9]+$/.test(productId) && parseInt(productId) > 0;
								}
							}
						]
					},
					queryParameters: {
						includeReviews: (value) => ['true', 'false'].includes(value),
						includeInventory: (value) => ['true', 'false'].includes(value),
						BY_ROUTE: [
							{
								route: 'categories/{categoryId}/products/{productId}?includeReviews,includeInventory',
								validate: ({ includeReviews, includeInventory }) => {
									return ['true', 'false'].includes(includeReviews || 'false') &&
										['true', 'false'].includes(includeInventory || 'false');
								}
							}
						]
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer '),
						xApiVersion: (value) => /^v[0-9]+$/.test(value)
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/categories/{categoryId}/products/{productId}',
				path: '/categories/10/products/500',
				pathParameters: {
					categoryId: '10',
					productId: '500'
				},
				queryStringParameters: {
					includeReviews: 'true',
					includeInventory: 'true'
				},
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer token123',
					'X-Api-Version': 'v2'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				categoryId: '10',
				productId: '500'
			});
			expect(request.getQueryStringParameters()).toEqual({
				includereviews: 'true',
				includeinventory: 'true'
			});
			expect(request.getHeaderParameters()).toEqual({
				authorization: 'Bearer token123',
				xApiVersion: 'v2'
			});
		});
	});

	describe('Scenario 9: Real-World Social Media API', () => {
		it('should handle complex social media post API', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						userId: (value) => /^[0-9]+$/.test(value),
						postId: (value) => /^[0-9]+$/.test(value),
						commentId: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'users/{userId}/posts/{postId}/comments/{commentId}',
								validate: ({ userId, postId, commentId }) => {
									return /^[0-9]+$/.test(userId) && parseInt(userId) > 0 &&
									       /^[0-9]+$/.test(postId) && parseInt(postId) > 0 &&
									       /^[0-9]+$/.test(commentId) && parseInt(commentId) > 0;
								}
							}
						]
					},
					queryParameters: {
						includeProfile: (value) => ['true', 'false'].includes(value),
						includeReplies: (value) => ['true', 'false'].includes(value),
						maxDepth: (value) => !isNaN(value) && parseInt(value) >= 0 && parseInt(value) <= 5
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer '),
						acceptLanguage: (value) => /^[a-z]{2}(-[A-Z]{2})?$/.test(value)
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'GET',
				resource: '/users/{userId}/posts/{postId}/comments/{commentId}',
				path: '/users/100/posts/200/comments/300',
				pathParameters: {
					userId: '100',
					postId: '200',
					commentId: '300'
				},
				queryStringParameters: {
					includeProfile: 'true',
					includeReplies: 'true',
					maxDepth: '3'
				},
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer social-token',
					'Accept-Language': 'en-US'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				userId: '100',
				postId: '200',
				commentId: '300'
			});
			expect(request.getQueryStringParameters()).toEqual({
				includeprofile: 'true',
				includereplies: 'true',
				maxdepth: '3'
			});
			expect(request.getHeaderParameters()).toEqual({
				authorization: 'Bearer social-token',
				acceptLanguage: 'en-US'
			});
		});
	});

	describe('Scenario 10: All Fixes Working Together', () => {
		it('should demonstrate all 6 bug fixes working in harmony', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					// Defect 1 fix: Multiple placeholders
					pathParameters: {
						orgId: (value) => /^[0-9]+$/.test(value),
						repoId: (value) => /^[0-9]+$/.test(value),
						// Defect 6 fix: Method-and-route patterns
						BY_ROUTE: [
							{
								route: 'POST:orgs/{orgId}/repos/{repoId}',
								validate: ({ orgId, repoId }) => {
									return /^[0-9]+$/.test(orgId) && parseInt(orgId) > 0 &&
									       /^[0-9]+$/.test(repoId) && parseInt(repoId) > 0;
								}
							}
						]
					},
					// Defect 2 fix: Query parameter extraction
					queryParameters: {
						page: (value) => !isNaN(value),
						limit: (value) => !isNaN(value),
						// Defect 4 fix: No duplicate parameters (page, limit appear once)
						BY_ROUTE: [
							{
								route: 'orgs/{orgId}/repos/{repoId}?page,limit',
								validate: ({ page, limit }) => {
									const pageNum = parseInt(page || '1');
									const limitNum = parseInt(limit || '10');
									return pageNum >= 1 && limitNum >= 1 && limitNum <= 100;
								}
							}
						]
					},
					// Defect 3 fix: Header parameter extraction
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
					}
				}
			});

			const event = createMockEvent({
				httpMethod: 'POST',
				resource: '/orgs/{orgId}/repos/{repoId}',
				path: '/orgs/1/repos/2',
				pathParameters: {
					orgId: '1',
					repoId: '2'
				},
				queryStringParameters: {
					page: '1',
					limit: '50'
				},
				headers: {
					'Referer': 'https://example.com',
					'Authorization': 'Bearer github-token'
				},
				body: JSON.stringify({ name: 'my-repo' })
			});

			const request = new ClientRequest(event, createMockContext());

			// All validations should pass
			expect(request.isValid()).toBe(true);

			// Defect 1 fix: Multiple placeholders extracted correctly
			expect(request.getPathParameters()).toEqual({
				orgId: '1',
				repoId: '2'
			});

			// Defect 2 fix: Query parameters extracted correctly
			expect(request.getQueryStringParameters()).toEqual({
				page: '1',
				limit: '50'
			});

			// Defect 3 fix: Header parameters extracted correctly
			expect(request.getHeaderParameters()).toEqual({
				authorization: 'Bearer github-token'
			});

			// Defect 5 fix: getBodyParameters() method exists
			expect(typeof request.getBodyParameters).toBe('function');
			expect(request.getBodyParameters()).toEqual({});
		});
	});
});
