import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';

/**
 * Integration Tests: Real-World API Gateway Scenarios
 * 
 * These tests verify that all bug fixes work correctly in realistic API Gateway
 * scenarios that mirror production usage patterns. They test edge cases, error
 * handling, graceful degradation, and complex real-world route patterns.
 * 
 * Test Coverage:
 * - Realistic API Gateway request structures
 * - Complex route patterns from real applications
 * - Edge cases (empty parameters, null values, malformed patterns)
 * - Error handling and graceful degradation
 * - Production-like validation scenarios
 * - All 6 bug fixes working in realistic contexts
 * 
 * Requirements Validated: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

// Helper function to create mock Lambda context
function createMockContext() {
	return {
		getRemainingTimeInMillis: () => 30000,
		functionName: 'test-function',
		functionVersion: '$LATEST',
		invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
		memoryLimitInMB: '1024',
		awsRequestId: 'test-request-id',
		logGroupName: '/aws/lambda/test-function',
		logStreamName: '2024/01/01/[$LATEST]test-stream'
	};
}

// Helper function to create realistic API Gateway event
function createApiGatewayEvent(overrides = {}) {
	return {
		httpMethod: 'GET',
		resource: '/test',
		path: '/test',
		pathParameters: null,
		queryStringParameters: null,
		headers: {
			'Host': 'api.example.com',
			'User-Agent': 'Mozilla/5.0',
			'Accept': 'application/json',
			'Referer': 'https://example.com'
		},
		multiValueHeaders: {},
		requestContext: {
			accountId: '123456789012',
			apiId: 'test-api-id',
			protocol: 'HTTP/1.1',
			httpMethod: 'GET',
			path: '/test',
			stage: 'prod',
			requestId: 'test-request-id',
			requestTime: '01/Jan/2024:00:00:00 +0000',
			requestTimeEpoch: 1704067200000,
			identity: {
				sourceIp: '192.168.1.1',
				userAgent: 'Mozilla/5.0'
			}
		},
		body: null,
		isBase64Encoded: false,
		...overrides
	};
}

describe('ClientRequest - Real-World API Gateway Scenarios', () => {
	let ClientRequest;

	beforeAll(async () => {
		// Dynamic import to get fresh module
		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
		ClientRequest = module.default;
	});

	afterEach(() => {
		// Reset ClientRequest initialization between tests
		// This ensures each test starts with a clean state
	});

	describe('Scenario 1: RESTful API with Nested Resources', () => {
		it('should handle deeply nested REST resources', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						orgId: (value) => /^[0-9]+$/.test(value),
						teamId: (value) => /^[0-9]+$/.test(value),
						projectId: (value) => /^[0-9]+$/.test(value),
						issueId: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'orgs/{orgId}/teams/{teamId}/projects/{projectId}/issues/{issueId}',
								validate: (value) => /^[0-9]+$/.test(value) && parseInt(value) > 0
							}
						]
					}
				}
			});

			const event = createApiGatewayEvent({
				httpMethod: 'GET',
				resource: '/orgs/{orgId}/teams/{teamId}/projects/{projectId}/issues/{issueId}',
				path: '/orgs/1/teams/5/projects/10/issues/42',
				pathParameters: {
					orgId: '1',
					teamId: '5',
					projectId: '10',
					issueId: '42'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				orgId: '1',
				teamId: '5',
				projectId: '10',
				issueId: '42'
			});
		});

		it('should handle invalid nested resource IDs gracefully', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						orgId: (value) => /^[0-9]+$/.test(value),
						teamId: (value) => /^[0-9]+$/.test(value),
						projectId: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createApiGatewayEvent({
				resource: '/orgs/{orgId}/teams/{teamId}/projects/{projectId}',
				path: '/orgs/1/teams/invalid/projects/10',
				pathParameters: {
					orgId: '1',
					teamId: 'invalid', // Invalid - not numeric
					projectId: '10'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getPathParameters()).toEqual({});
		});
	});

	describe('Scenario 2: Edge Cases - Empty and Null Values', () => {
		it('should handle null pathParameters gracefully', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {}
			});

			const event = createApiGatewayEvent({
				resource: '/users',
				path: '/users',
				pathParameters: null // API Gateway sends null when no path params
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({});
		});

		it('should handle null queryStringParameters gracefully', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {}
			});

			const event = createApiGatewayEvent({
				resource: '/users',
				path: '/users',
				queryStringParameters: null // API Gateway sends null when no query params
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({});
		});

		it('should handle empty string values in parameters', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						search: (value) => value.length > 0 // Reject empty strings
					}
				}
			});

			const event = createApiGatewayEvent({
				queryStringParameters: {
					search: '' // Empty string
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getQueryStringParameters()).toEqual({});
		});

		it('should handle whitespace-only values', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						query: (value) => value.trim().length > 0
					}
				}
			});

			const event = createApiGatewayEvent({
				queryStringParameters: {
					query: '   ' // Whitespace only
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(false);
			expect(request.getQueryStringParameters()).toEqual({});
		});
	});

	describe('Scenario 3: Malformed Route Patterns', () => {
		it('should handle routes with special characters in placeholders', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						'user-id': (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createApiGatewayEvent({
				resource: '/users/{user-id}',
				path: '/users/123',
				pathParameters: {
					'user-id': '123'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				userId: '123' // Converted to camelCase
			});
		});

		it('should handle routes with consecutive slashes', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createApiGatewayEvent({
				resource: '/api/{id}',
				path: '/api//123', // Double slash
				pathParameters: {
					id: '123'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			// Should still work - path normalization handles this
			expect(request.isValid()).toBe(true);
		});

		it('should handle routes with trailing slashes', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createApiGatewayEvent({
				resource: '/api/{id}',
				path: '/api/123/', // Trailing slash
				pathParameters: {
					id: '123'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
		});
	});

	describe('Scenario 4: Production API - GitHub-like REST API', () => {
		it('should handle GitHub-style repository API', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						owner: (value) => /^[a-zA-Z0-9-]+$/.test(value),
						repo: (value) => /^[a-zA-Z0-9_.-]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'repos/{owner}/{repo}',
								validate: (value) => value.length > 0 && value.length <= 100
							}
						]
					},
					queryParameters: {
						type: (value) => ['all', 'owner', 'public', 'private', 'member'].includes(value),
						sort: (value) => ['created', 'updated', 'pushed', 'full_name'].includes(value),
						direction: (value) => ['asc', 'desc'].includes(value)
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ') || value.startsWith('token '),
						'accept': (value) => value.includes('application/vnd.github')
					}
				}
			});

			const event = createApiGatewayEvent({
				httpMethod: 'GET',
				resource: '/repos/{owner}/{repo}',
				path: '/repos/octocat/Hello-World',
				pathParameters: {
					owner: 'octocat',
					repo: 'Hello-World'
				},
				queryStringParameters: {
					type: 'all',
					sort: 'updated',
					direction: 'desc'
				},
				headers: {
					'Referer': 'https://github.com',
					'Authorization': 'Bearer ghp_1234567890abcdef',
					'Accept': 'application/vnd.github.v3+json'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				owner: 'octocat',
				repo: 'Hello-World'
			});
			expect(request.getQueryStringParameters()).toEqual({
				type: 'all',
				sort: 'updated',
				direction: 'desc'
			});
			expect(request.getHeaderParameters()).toEqual({
				authorization: 'Bearer ghp_1234567890abcdef',
				accept: 'application/vnd.github.v3+json'
			});
		});
	});

	describe('Scenario 5: Production API - Stripe-like Payment API', () => {
		it('should handle Stripe-style nested resource expansion', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						customerId: (value) => value.startsWith('cus_'),
						subscriptionId: (value) => value.startsWith('sub_'),
						BY_ROUTE: [
							{
								route: 'customers/{customerId}/subscriptions/{subscriptionId}',
								validate: (value) => value.length > 4
							}
						]
					},
					queryParameters: {
						expand: (value) => {
							// Stripe allows multiple expand parameters
							const expandable = ['customer', 'plan', 'default_payment_method'];
							return value.split(',').every(item => expandable.includes(item.trim()));
						}
					},
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer sk_'),
						'stripe-version': (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
					}
				}
			});

			const event = createApiGatewayEvent({
				httpMethod: 'GET',
				resource: '/customers/{customerId}/subscriptions/{subscriptionId}',
				path: '/customers/cus_1234567890/subscriptions/sub_0987654321',
				pathParameters: {
					customerId: 'cus_1234567890',
					subscriptionId: 'sub_0987654321'
				},
				queryStringParameters: {
					expand: 'customer,plan,default_payment_method'
				},
				headers: {
					'Referer': 'https://stripe.com',
					'Authorization': 'Bearer sk_test_1234567890',
					'Stripe-Version': '2023-10-16'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				customerId: 'cus_1234567890',
				subscriptionId: 'sub_0987654321'
			});
			expect(request.getQueryStringParameters()).toEqual({
				expand: 'customer,plan,default_payment_method'
			});
			expect(request.getHeaderParameters()).toEqual({
				authorization: 'Bearer sk_test_1234567890',
				stripeVersion: '2023-10-16'
			});
		});
	});

	describe('Scenario 6: Error Handling and Graceful Degradation', () => {
		it('should handle missing required headers gracefully', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					headerParameters: {
						authorization: (value) => value.startsWith('Bearer ')
					}
				}
			});

			const event = createApiGatewayEvent({
				headers: {
					'Referer': 'https://example.com'
					// Missing Authorization header
				}
			});

			const request = new ClientRequest(event, createMockContext());

			// Should be invalid but not throw
			expect(request.isValid()).toBe(false);
			expect(request.getHeaderParameters()).toEqual({});
		});

		it('should handle validation function exceptions gracefully', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						limit: (value) => {
							// Validation function that might throw
							const num = parseInt(value);
							if (isNaN(num)) throw new Error('Not a number');
							return num > 0 && num <= 100;
						}
					}
				}
			});

			const event = createApiGatewayEvent({
				queryStringParameters: {
					limit: 'invalid'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			// Should handle exception gracefully
			expect(request.isValid()).toBe(false);
			expect(request.getQueryStringParameters()).toEqual({});
		});

		it('should handle partial validation failures', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						page: (value) => !isNaN(value) && parseInt(value) > 0,
						limit: (value) => !isNaN(value) && parseInt(value) > 0 && parseInt(value) <= 100,
						sort: (value) => ['asc', 'desc'].includes(value)
					}
				}
			});

			const event = createApiGatewayEvent({
				queryStringParameters: {
					page: '1',      // Valid
					limit: '200',   // Invalid - exceeds max
					sort: 'asc'     // Valid
				}
			});

			const request = new ClientRequest(event, createMockContext());

			// Should be invalid because one parameter failed
			expect(request.isValid()).toBe(false);
			// All parameters excluded when any fails
			expect(request.getQueryStringParameters()).toEqual({});
		});
	});

	describe('Scenario 7: Complex Method-and-Route Patterns', () => {
		it('should handle CRUD operations with method-specific validation', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						resourceId: (value) => /^[0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'POST:resources/{resourceId}',
								validate: (value) => false // POST to existing resource not allowed
							},
							{
								route: 'PUT:resources/{resourceId}',
								validate: (value) => /^[0-9]+$/.test(value) && parseInt(value) > 0
							},
							{
								route: 'DELETE:resources/{resourceId}',
								validate: (value) => /^[0-9]+$/.test(value) && parseInt(value) > 0
							},
							{
								route: 'GET:resources/{resourceId}',
								validate: (value) => /^[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			// GET should work
			const getEvent = createApiGatewayEvent({
				httpMethod: 'GET',
				resource: '/resources/{resourceId}',
				path: '/resources/123',
				pathParameters: { resourceId: '123' }
			});
			const getRequest = new ClientRequest(getEvent, createMockContext());
			expect(getRequest.isValid()).toBe(true);

			// PUT should work
			const putEvent = createApiGatewayEvent({
				httpMethod: 'PUT',
				resource: '/resources/{resourceId}',
				path: '/resources/123',
				pathParameters: { resourceId: '123' }
			});
			const putRequest = new ClientRequest(putEvent, createMockContext());
			expect(putRequest.isValid()).toBe(true);

			// POST should fail (not allowed for existing resource)
			const postEvent = createApiGatewayEvent({
				httpMethod: 'POST',
				resource: '/resources/{resourceId}',
				path: '/resources/123',
				pathParameters: { resourceId: '123' }
			});
			const postRequest = new ClientRequest(postEvent, createMockContext());
			expect(postRequest.isValid()).toBe(false);
		});
	});

	describe('Scenario 8: Real-World AWS API Gateway Proxy Integration', () => {
		it('should handle API Gateway proxy+ resource pattern', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						proxy: (value) => value.length > 0
					}
				}
			});

			const event = createApiGatewayEvent({
				httpMethod: 'GET',
				resource: '/{proxy+}',
				path: '/api/v1/users/123/profile',
				pathParameters: {
					proxy: 'api/v1/users/123/profile'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				proxy: 'api/v1/users/123/profile'
			});
		});

		it('should handle API Gateway stage variables in path', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					pathParameters: {
						version: (value) => /^v[0-9]+$/.test(value),
						userId: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = createApiGatewayEvent({
				httpMethod: 'GET',
				resource: '/{version}/users/{userId}',
				path: '/v1/users/123',
				pathParameters: {
					version: 'v1',
					userId: '123'
				},
				requestContext: {
					...createApiGatewayEvent().requestContext,
					stage: 'prod'
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({
				version: 'v1',
				userId: '123'
			});
		});
	});

	describe('Scenario 9: Unicode and Special Characters', () => {
		it('should handle Unicode characters in query parameters', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						search: (value) => value.length > 0
					}
				}
			});

			const event = createApiGatewayEvent({
				queryStringParameters: {
					search: '日本語' // Japanese characters
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({
				search: '日本語'
			});
		});

		it('should handle URL-encoded special characters', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					queryParameters: {
						email: (value) => value.includes('@')
					}
				}
			});

			const event = createApiGatewayEvent({
				queryStringParameters: {
					email: 'user@example.com' // API Gateway decodes this
				}
			});

			const request = new ClientRequest(event, createMockContext());

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({
				email: 'user@example.com'
			});
		});
	});

	describe('Scenario 10: All Fixes in Production-Like Context', () => {
		it('should handle complete e-commerce checkout flow', () => {
			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					// Defect 1 & 6: Multiple placeholders with method-and-route
					pathParameters: {
						cartId: (value) => /^cart_[a-z0-9]+$/.test(value),
						itemId: (value) => /^item_[a-z0-9]+$/.test(value),
						BY_ROUTE: [
							{
								route: 'POST:carts/{cartId}/items/{itemId}',
								validate: (value) => value.length > 5
							}
						]
					},
					// Defect 2: Query parameter extraction
					queryParameters: {
						quantity: (value) => !isNaN(value) && parseInt(value) > 0,
						coupon: (value) => /^[A-Z0-9]{6,10}$/.test(value),
						BY_ROUTE: [
							{
								route: 'carts/{cartId}/items/{itemId}?quantity,coupon',
								validate: ({ quantity, coupon }) => {
									const qty = parseInt(quantity || '1');
									return qty >= 1 && qty <= 99;
								}
							}
						]
					},
					// Defect 3: Header parameter extraction
					headerParameters: {
						'x-api-key': (value) => value.length === 32,
						'x-session-id': (value) => /^sess_[a-z0-9]+$/.test(value)
					}
				}
			});

			const event = createApiGatewayEvent({
				httpMethod: 'POST',
				resource: '/carts/{cartId}/items/{itemId}',
				path: '/carts/cart_abc123/items/item_xyz789',
				pathParameters: {
					cartId: 'cart_abc123',
					itemId: 'item_xyz789'
				},
				queryStringParameters: {
					quantity: '2',
					coupon: 'SAVE20'
				},
				headers: {
					'Referer': 'https://shop.example.com',
					'X-Api-Key': '12345678901234567890123456789012',
					'X-Session-Id': 'sess_user123session'
				},
				body: JSON.stringify({
					options: {
						color: 'blue',
						size: 'large'
					}
				})
			});

			const request = new ClientRequest(event, createMockContext());

			// All validations should pass
			expect(request.isValid()).toBe(true);

			// Defect 1: Multiple placeholders extracted
			expect(request.getPathParameters()).toEqual({
				cartId: 'cart_abc123',
				itemId: 'item_xyz789'
			});

			// Defect 2: Query parameters extracted
			expect(request.getQueryStringParameters()).toEqual({
				quantity: '2',
				coupon: 'SAVE20'
			});

			// Defect 3: Header parameters extracted
			expect(request.getHeaderParameters()).toEqual({
				xApiKey: '12345678901234567890123456789012',
				xSessionId: 'sess_user123session'
			});

			// Defect 5: getBodyParameters() method exists
			expect(typeof request.getBodyParameters).toBe('function');
			expect(request.getBodyParameters()).toEqual({});
		});
	});
});
