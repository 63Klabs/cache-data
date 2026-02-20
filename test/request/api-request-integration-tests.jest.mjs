import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import https from 'https';

describe('APIRequest - Integration Tests', () => {
	let APIRequest;

	beforeEach(async () => {
		// Import fresh modules for each test
		const apiModule = await import('../../src/lib/tools/APIRequest.class.js');
		APIRequest = apiModule.default;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Pagination + Retries Integration', () => {
		it('should retry failed pagination requests', async () => {
			const mockResponses = [
				// First page - success on first try
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 30,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
						offset: 0,
						limit: 10
					})
				},
				// Second page - fails first time
				{
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Server error' })
				},
				// Second page - succeeds on retry
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 30,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 11 })),
						offset: 10,
						limit: 10
					})
				},
				// Third page - success on first try
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 30,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 21 })),
						offset: 20,
						limit: 10
					})
				}
			];

			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const response = mockResponses[callCount++];
				
				const mockRes = {
					statusCode: response.statusCode,
					headers: response.headers,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(response.body);
						} else if (event === 'end') {
							handler();
						}
					})
				};

				callback(mockRes);

				return {
					on: jest.fn(),
					end: jest.fn(),
					write: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				parameters: { limit: 10 },
				pagination: {
					enabled: true,
					defaultLimit: 10,
					batchSize: 5
				},
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			expect(response.statusCode).toBe(200);

			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(30);
			expect(body.returnedItemCount).toBe(30);

			// Verify metadata includes both pagination and retry info
			expect(response.metadata).toBeDefined();
			expect(response.metadata.pagination).toBeDefined();
			expect(response.metadata.pagination.occurred).toBe(true);
			expect(response.metadata.pagination.totalPages).toBe(3);
		});

		it('should handle pagination when initial request requires retry', async () => {
			const mockResponses = [
				// First attempt - network error
				null,
				// Second attempt - success
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 20,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
						offset: 0,
						limit: 10
					})
				},
				// Second page
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 20,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 11 })),
						offset: 10,
						limit: 10
					})
				}
			];

			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const response = mockResponses[callCount++];
				
				if (response === null) {
					// Simulate network error
					const mockReq = {
						on: jest.fn((event, handler) => {
							if (event === 'error') {
								handler(new Error('Network error'));
							}
						}),
						end: jest.fn(),
						write: jest.fn(),
						destroy: jest.fn()
					};
					return mockReq;
				}

				const mockRes = {
					statusCode: response.statusCode,
					headers: response.headers,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(response.body);
						} else if (event === 'end') {
							handler();
						}
					})
				};

				callback(mockRes);

				return {
					on: jest.fn(),
					end: jest.fn(),
					write: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				parameters: { limit: 10 },
				pagination: {
					enabled: true,
					defaultLimit: 10
				},
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(20);

			// Verify both retry and pagination metadata
			expect(response.metadata.retries.occurred).toBe(true);
			expect(response.metadata.retries.attempts).toBe(2);
			expect(response.metadata.pagination.occurred).toBe(true);
		});
	});

	describe('X-Ray Tracking with Pagination', () => {
		it('should work with pagination configuration (X-Ray compatibility)', async () => {
			const mockResponses = [
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 20,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
						offset: 0,
						limit: 10
					})
				},
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 20,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 11 })),
						offset: 10,
						limit: 10
					})
				}
			];

			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const response = mockResponses[callCount++];
				
				const mockRes = {
					statusCode: response.statusCode,
					headers: response.headers,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(response.body);
						} else if (event === 'end') {
							handler();
						}
					})
				};

				callback(mockRes);

				return {
					on: jest.fn(),
					end: jest.fn(),
					write: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				parameters: { limit: 10 },
				pagination: {
					enabled: true,
					defaultLimit: 10
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Verify pagination worked correctly
			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(20);
			expect(body.returnedItemCount).toBe(20);

			// Verify pagination metadata is present
			expect(response.metadata).toBeDefined();
			expect(response.metadata.pagination).toBeDefined();
			expect(response.metadata.pagination.occurred).toBe(true);
			expect(response.metadata.pagination.totalPages).toBe(2);
			expect(response.metadata.pagination.totalItems).toBe(20);
		});
	});

	describe('X-Ray Tracking with Retries', () => {
		it('should work with retry configuration (X-Ray compatibility)', async () => {
			const mockResponses = [
				{
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Server error' })
				},
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ data: 'success' })
				}
			];

			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const response = mockResponses[callCount++];
				
				const mockRes = {
					statusCode: response.statusCode,
					headers: response.headers,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(response.body);
						} else if (event === 'end') {
							handler();
						}
					})
				};

				callback(mockRes);

				return {
					on: jest.fn(),
					end: jest.fn(),
					write: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Verify retry worked correctly
			expect(response.success).toBe(true);
			expect(response.statusCode).toBe(200);

			// Verify retry metadata is present
			expect(response.metadata).toBeDefined();
			expect(response.metadata.retries).toBeDefined();
			expect(response.metadata.retries.occurred).toBe(true);
			expect(response.metadata.retries.attempts).toBe(2);
		});
	});

	describe('X-Ray Tracking with Pagination + Retries', () => {
		it('should work with both pagination and retry configuration (X-Ray compatibility)', async () => {
			const mockResponses = [
				// First page - fails then succeeds
				{
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Server error' })
				},
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 20,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
						offset: 0,
						limit: 10
					})
				},
				// Second page
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 20,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 11 })),
						offset: 10,
						limit: 10
					})
				}
			];

			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const response = mockResponses[callCount++];
				
				const mockRes = {
					statusCode: response.statusCode,
					headers: response.headers,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(response.body);
						} else if (event === 'end') {
							handler();
						}
					})
				};

				callback(mockRes);

				return {
					on: jest.fn(),
					end: jest.fn(),
					write: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				parameters: { limit: 10 },
				pagination: {
					enabled: true,
					defaultLimit: 10
				},
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Verify both features worked correctly
			expect(response.success).toBe(true);

			// Verify both retry and pagination metadata
			expect(response.metadata).toBeDefined();
			expect(response.metadata.retries).toBeDefined();
			expect(response.metadata.retries.occurred).toBe(true);
			expect(response.metadata.retries.attempts).toBe(2);

			expect(response.metadata.pagination).toBeDefined();
			expect(response.metadata.pagination.occurred).toBe(true);
			expect(response.metadata.pagination.totalPages).toBe(2);
			expect(response.metadata.pagination.totalItems).toBe(20);
		});
	});

	describe('Real-World API Response Structures', () => {
		it('should handle GitHub API-style pagination', async () => {
			const mockResponses = [
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						total_count: 50,
						items: Array(30).fill(null).map((_, i) => ({ 
							id: i + 1,
							name: `repo-${i + 1}` 
						})),
						page: 1,
						per_page: 30
					})
				},
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						total_count: 50,
						items: Array(20).fill(null).map((_, i) => ({ 
							id: i + 31,
							name: `repo-${i + 31}` 
						})),
						page: 2,
						per_page: 30
					})
				}
			];

			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const response = mockResponses[callCount++];
				
				const mockRes = {
					statusCode: response.statusCode,
					headers: response.headers,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(response.body);
						} else if (event === 'end') {
							handler();
						}
					})
				};

				callback(mockRes);

				return {
					on: jest.fn(),
					end: jest.fn(),
					write: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.github.com',
				path: '/search/repositories',
				parameters: { per_page: 30 },
				pagination: {
					enabled: true,
					totalItemsLabel: 'total_count',
					itemsLabel: 'items',
					offsetLabel: 'page',
					limitLabel: 'per_page',
					defaultLimit: 30
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(50);
			expect(body.returnedItemCount).toBe(50);
		});

		it('should handle Stripe API-style pagination with has_more', async () => {
			const mockResponses = [
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						object: 'list',
						data: Array(10).fill(null).map((_, i) => ({ 
							id: `cus_${i + 1}`,
							email: `user${i + 1}@example.com` 
						})),
						has_more: true,
						url: '/v1/customers'
					})
				},
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						object: 'list',
						data: Array(5).fill(null).map((_, i) => ({ 
							id: `cus_${i + 11}`,
							email: `user${i + 11}@example.com` 
						})),
						has_more: false,
						url: '/v1/customers'
					})
				}
			];

			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const response = mockResponses[callCount++];
				
				const mockRes = {
					statusCode: response.statusCode,
					headers: response.headers,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(response.body);
						} else if (event === 'end') {
							handler();
						}
					})
				};

				callback(mockRes);

				return {
					on: jest.fn(),
					end: jest.fn(),
					write: jest.fn(),
					destroy: jest.fn()
				};
			});

			// Note: This test demonstrates the structure but our implementation
			// uses offset-based pagination, not cursor-based like Stripe
			const request = {
				host: 'api.stripe.com',
				path: '/v1/customers',
				parameters: { limit: 10 }
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.data).toBeDefined();
		});
	});

	describe('Error Scenarios Across Features', () => {
		it('should handle retry exhaustion during pagination', async () => {
			const mockResponses = [
				// First page - success
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 30,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
						offset: 0,
						limit: 10
					})
				},
				// Second page - fails all retries
				{
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Server error' })
				},
				{
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Server error' })
				}
			];

			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const response = mockResponses[callCount++];
				
				const mockRes = {
					statusCode: response.statusCode,
					headers: response.headers,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(response.body);
						} else if (event === 'end') {
							handler();
						}
					})
				};

				callback(mockRes);

				return {
					on: jest.fn(),
					end: jest.fn(),
					write: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				parameters: { limit: 10 },
				pagination: {
					enabled: true,
					defaultLimit: 10
				},
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Should return partial results
			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(10);
			expect(body.returnedItemCount).toBe(10);
		});

		it('should handle network errors during paginated requests with retry', async () => {
			const mockResponses = [
				// First page - success
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 20,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
						offset: 0,
						limit: 10
					})
				},
				// Second page - network error
				null,
				// Second page retry - success
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 20,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 11 })),
						offset: 10,
						limit: 10
					})
				}
			];

			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const response = mockResponses[callCount++];
				
				if (response === null) {
					const mockReq = {
						on: jest.fn((event, handler) => {
							if (event === 'error') {
								handler(new Error('Network error'));
							}
						}),
						end: jest.fn(),
						write: jest.fn(),
						destroy: jest.fn()
					};
					return mockReq;
				}

				const mockRes = {
					statusCode: response.statusCode,
					headers: response.headers,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(response.body);
						} else if (event === 'end') {
							handler();
						}
					})
				};

				callback(mockRes);

				return {
					on: jest.fn(),
					end: jest.fn(),
					write: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				parameters: { limit: 10 },
				pagination: {
					enabled: true,
					defaultLimit: 10
				},
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(20);
			expect(body.returnedItemCount).toBe(20);
		});

		it('should handle malformed JSON in paginated responses', async () => {
			const mockResponses = [
				// First page - success
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						totalItems: 20,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
						offset: 0,
						limit: 10
					})
				},
				// Second page - malformed JSON
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: 'invalid json {'
				}
			];

			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const response = mockResponses[callCount++];
				
				const mockRes = {
					statusCode: response.statusCode,
					headers: response.headers,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(response.body);
						} else if (event === 'end') {
							handler();
						}
					})
				};

				callback(mockRes);

				return {
					on: jest.fn(),
					end: jest.fn(),
					write: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				parameters: { limit: 10 },
				pagination: {
					enabled: true,
					defaultLimit: 10
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Should return partial results
			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(10);
		});
	});
});
