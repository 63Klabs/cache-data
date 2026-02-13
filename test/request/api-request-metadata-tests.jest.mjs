import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import https from 'https';

describe('APIRequest - Response Metadata', () => {
	let APIRequest;

	beforeEach(async () => {
		// Import fresh module for each test
		const module = await import('../../src/lib/tools/APIRequest.class.js');
		APIRequest = module.default;
		jest.clearAllMocks();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Metadata Presence', () => {
		it('should include metadata when retries occur', async () => {
			let attemptCount = 0;

			// Mock https.request to fail once then succeed
			jest.spyOn(https, 'request').mockImplementation((url, options, callback) => {
				attemptCount++;

				const mockReq = {
					on: jest.fn((event, handler) => {
						if (event === 'error' && attemptCount === 1) {
							// First attempt fails
							setTimeout(() => handler(new Error('Network error')), 10);
						}
						return mockReq;
					}),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};

				if (attemptCount === 2) {
					// Second attempt succeeds
					setTimeout(() => {
						const mockRes = {
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							on: jest.fn((event, handler) => {
								if (event === 'data') {
									setTimeout(() => handler('{"result":"success"}'), 10);
								} else if (event === 'end') {
									setTimeout(() => handler(), 20);
								}
								return mockRes;
							})
						};
						callback(mockRes);
					}, 10);
				}

				return mockReq;
			});

			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Verify metadata is present
			expect(response).toHaveProperty('metadata');
			expect(response.metadata).toHaveProperty('retries');
			expect(response.metadata.retries.occurred).toBe(true);
			expect(response.metadata.retries.attempts).toBe(2);
			expect(response.metadata.retries.finalAttempt).toBe(2);
		});

		it('should include metadata when pagination occurs', async () => {
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

			// Verify pagination worked
			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items).toHaveLength(20);

			// Verify metadata is present
			expect(response).toHaveProperty('metadata');
			expect(response.metadata).toHaveProperty('pagination');
			expect(response.metadata.pagination.occurred).toBe(true);
			expect(response.metadata.pagination.totalPages).toBe(2);
			expect(response.metadata.pagination.totalItems).toBe(20);
			expect(response.metadata.pagination.incomplete).toBe(false);
		});

		it('should not include metadata when neither retries nor pagination occur', async () => {
			// Mock https.request for simple successful request
			jest.spyOn(https, 'request').mockImplementation((url, options, callback) => {
				const mockReq = {
					on: jest.fn(),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};

				setTimeout(() => {
					const mockRes = {
						statusCode: 200,
						headers: { 'content-type': 'application/json' },
						on: jest.fn((event, handler) => {
							if (event === 'data') {
								setTimeout(() => handler('{"result":"success"}'), 10);
							} else if (event === 'end') {
								setTimeout(() => handler(), 20);
							}
							return mockRes;
						})
					};
					callback(mockRes);
				}, 10);

				return mockReq;
			});

			const request = {
				host: 'api.example.com',
				path: '/test'
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Verify metadata is NOT present
			expect(response).not.toHaveProperty('metadata');
		});
	});

	describe('Metadata Structure', () => {
		it('should have correct retry metadata structure', async () => {
			let attemptCount = 0;

			// Mock https.request to fail once then succeed
			jest.spyOn(https, 'request').mockImplementation((url, options, callback) => {
				attemptCount++;

				const mockReq = {
					on: jest.fn((event, handler) => {
						if (event === 'error' && attemptCount === 1) {
							setTimeout(() => handler(new Error('Network error')), 10);
						}
						return mockReq;
					}),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};

				if (attemptCount === 2) {
					setTimeout(() => {
						const mockRes = {
							statusCode: 200,
							headers: {},
							on: jest.fn((event, handler) => {
								if (event === 'data') {
									setTimeout(() => handler('{"result":"success"}'), 10);
								} else if (event === 'end') {
									setTimeout(() => handler(), 20);
								}
								return mockRes;
							})
						};
						callback(mockRes);
					}, 10);
				}

				return mockReq;
			});

			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 2
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Verify retry metadata structure
			expect(response.metadata.retries).toEqual({
				occurred: true,
				attempts: 2,
				finalAttempt: 2
			});
		});

		it('should have correct pagination metadata structure', async () => {
			const mockResponses = [
				// First page
				{
					statusCode: 200,
					headers: {},
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
					headers: {},
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
				path: '/items',
				parameters: { limit: 10 },
				pagination: {
					enabled: true,
					totalItemsLabel: 'totalItems',
					itemsLabel: 'items',
					offsetLabel: 'offset',
					limitLabel: 'limit',
					defaultLimit: 10
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Verify pagination metadata structure
			expect(response.metadata.pagination).toEqual({
				occurred: true,
				totalPages: 2,
				totalItems: 20,
				incomplete: false,
				error: null
			});
		});

		it('should include both retry and pagination metadata when both occur', async () => {
			let attemptCount = 0;
			const mockResponses = [
				// First page (after retry)
				{
					statusCode: 200,
					headers: {},
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
					headers: {},
					body: JSON.stringify({
						totalItems: 20,
						items: Array(10).fill(null).map((_, i) => ({ id: i + 11 })),
						offset: 10,
						limit: 10
					})
				}
			];

			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;

				const mockReq = {
					on: jest.fn((event, handler) => {
						if (event === 'error' && attemptCount === 1) {
							setTimeout(() => handler(new Error('Network error')), 10);
						}
						return mockReq;
					}),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};

				if (attemptCount > 1) {
					// After first retry, return paginated responses
					const responseIndex = attemptCount - 2; // 0 for second attempt, 1 for third
					if (responseIndex < mockResponses.length) {
						const response = mockResponses[responseIndex];
						
						setTimeout(() => {
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
						}, 10);
					}
				}

				return mockReq;
			});

			const request = {
				host: 'api.example.com',
				path: '/items',
				parameters: { limit: 10 },
				retry: {
					enabled: true,
					maxRetries: 1
				},
				pagination: {
					enabled: true,
					totalItemsLabel: 'totalItems',
					itemsLabel: 'items',
					offsetLabel: 'offset',
					limitLabel: 'limit',
					defaultLimit: 10
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Verify both metadata types are present
			expect(response.metadata).toHaveProperty('retries');
			expect(response.metadata).toHaveProperty('pagination');
			expect(response.metadata.retries.occurred).toBe(true);
			expect(response.metadata.pagination.occurred).toBe(true);
		});
	});

	describe('Backwards Compatibility', () => {
		it('should not break existing code that expects standard response format', async () => {
			jest.spyOn(https, 'request').mockImplementation((url, options, callback) => {
				const mockReq = {
					on: jest.fn(),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};

				setTimeout(() => {
					const mockRes = {
						statusCode: 200,
						headers: { 'content-type': 'application/json' },
						on: jest.fn((event, handler) => {
							if (event === 'data') {
								setTimeout(() => handler('{"result":"success"}'), 10);
							} else if (event === 'end') {
								setTimeout(() => handler(), 20);
							}
							return mockRes;
						})
					};
					callback(mockRes);
				}, 10);

				return mockReq;
			});

			const request = {
				host: 'api.example.com',
				path: '/test'
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Verify standard response format is maintained
			expect(response).toHaveProperty('success');
			expect(response).toHaveProperty('statusCode');
			expect(response).toHaveProperty('headers');
			expect(response).toHaveProperty('body');
			expect(response).toHaveProperty('message');

			// Verify response values
			expect(response.success).toBe(true);
			expect(response.statusCode).toBe(200);
			expect(response.body).toBe('{"result":"success"}');
		});

		it('should allow accessing standard response fields when metadata is present', async () => {
			let attemptCount = 0;

			jest.spyOn(https, 'request').mockImplementation((url, options, callback) => {
				attemptCount++;

				const mockReq = {
					on: jest.fn((event, handler) => {
						if (event === 'error' && attemptCount === 1) {
							setTimeout(() => handler(new Error('Network error')), 10);
						}
						return mockReq;
					}),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};

				if (attemptCount === 2) {
					setTimeout(() => {
						const mockRes = {
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							on: jest.fn((event, handler) => {
								if (event === 'data') {
									setTimeout(() => handler('{"result":"success"}'), 10);
								} else if (event === 'end') {
									setTimeout(() => handler(), 20);
								}
								return mockRes;
							})
						};
						callback(mockRes);
					}, 10);
				}

				return mockReq;
			});

			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Verify standard fields are still accessible
			expect(response.success).toBe(true);
			expect(response.statusCode).toBe(200);
			expect(response.body).toBe('{"result":"success"}');
			expect(response.headers).toHaveProperty('content-type');

			// And metadata is also present
			expect(response.metadata).toBeDefined();
			expect(response.metadata.retries.occurred).toBe(true);
		});
	});
});
