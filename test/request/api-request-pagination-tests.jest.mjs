import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import https from 'https';

describe('APIRequest - Pagination Unit Tests', () => {
	let APIRequest;

	beforeEach(async () => {
		// Import fresh module for each test
		const module = await import('../../src/lib/tools/APIRequest.class.js');
		APIRequest = module.default;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Pagination with 2 pages', () => {
		it('should fetch and combine 2 pages of results', async () => {
			const mockResponses = [
				// First page
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
					totalItemsLabel: 'totalItems',
					itemsLabel: 'items',
					offsetLabel: 'offset',
					limitLabel: 'limit',
					defaultLimit: 10,
					batchSize: 5
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			expect(response.statusCode).toBe(200);

			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(20);
			expect(body.returnedItemCount).toBe(20);
			expect(body.items[0].id).toBe(1);
			expect(body.items[19].id).toBe(20);
		});
	});

	describe('Pagination with 5 pages', () => {
		it('should fetch and combine 5 pages of results', async () => {
			const mockResponses = Array(5).fill(null).map((_, pageIndex) => ({
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					totalItems: 50,
					items: Array(10).fill(null).map((_, i) => ({ id: pageIndex * 10 + i + 1 })),
					offset: pageIndex * 10,
					limit: 10
				})
			}));

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
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(50);
			expect(body.returnedItemCount).toBe(50);
		});
	});

	describe('Pagination with empty pages', () => {
		it('should handle empty pages gracefully', async () => {
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
						items: [],
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

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(10);
			expect(body.returnedItemCount).toBe(10);
		});
	});

	describe('Pagination with missing indicators', () => {
		it('should not paginate when totalItems is missing', async () => {
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const mockRes = {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(JSON.stringify({
								items: [{ id: 1 }, { id: 2 }]
								// Missing totalItems
							}));
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
				pagination: {
					enabled: true
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(2);
			expect(body.returnedItemCount).toBeUndefined();
		});

		it('should not paginate when items array is missing', async () => {
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const mockRes = {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(JSON.stringify({
								totalItems: 100
								// Missing items array
							}));
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
				pagination: {
					enabled: true
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.totalItems).toBe(100);
			expect(body.returnedItemCount).toBeUndefined();
		});
	});

	describe('Pagination with offset > 0', () => {
		it('should not paginate when offset is already set', async () => {
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const mockRes = {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(JSON.stringify({
								totalItems: 100,
								items: Array(10).fill(null).map((_, i) => ({ id: i + 11 })),
								offset: 10,
								limit: 10
							}));
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
				parameters: { offset: 10, limit: 10 },
				pagination: {
					enabled: true
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(10);
			expect(body.offset).toBe(10);
		});
	});

	describe('Pagination error handling', () => {
		it('should mark pagination as incomplete on error', async () => {
			const mockResponses = [
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
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			// Should have first page only
			expect(body.items).toHaveLength(10);
			expect(body.returnedItemCount).toBe(10);
		});
	});

	describe('Pagination batch processing', () => {
		it('should process pages in batches', async () => {
			const mockResponses = Array(10).fill(null).map((_, pageIndex) => ({
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					totalItems: 100,
					items: Array(10).fill(null).map((_, i) => ({ id: pageIndex * 10 + i + 1 })),
					offset: pageIndex * 10,
					limit: 10
				})
			}));

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
					batchSize: 3
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(100);
			expect(body.returnedItemCount).toBe(100);
		});
	});

	describe('Custom pagination labels', () => {
		it('should use custom labels for pagination', async () => {
			const mockResponses = [
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						total: 20,
						results: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
						skip: 0,
						take: 10
					})
				},
				{
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						total: 20,
						results: Array(10).fill(null).map((_, i) => ({ id: i + 11 })),
						skip: 10,
						take: 10
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
				parameters: { take: 10 },
				pagination: {
					enabled: true,
					totalItemsLabel: 'total',
					itemsLabel: 'results',
					offsetLabel: 'skip',
					limitLabel: 'take',
					responseReturnCountLabel: 'count',
					defaultLimit: 10
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.results).toHaveLength(20);
			expect(body.count).toBe(20);
			expect(body.skip).toBeUndefined();
			expect(body.take).toBeUndefined();
		});
	});
});
