import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import https from 'https';

// Import APIRequest
const tools = await import('../../src/lib/tools/index.js');
const APIRequest = tools.default.APIRequest;

describe('APIRequest X-Ray Enhancements', () => {
	beforeEach(() => {
		// Mock https.request to return successful responses
		jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
			const mockResponse = {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				on: jest.fn((event, handler) => {
					if (event === 'data') {
						handler('{"success": true}');
					} else if (event === 'end') {
						handler();
					}
				})
			};

			// Call the callback immediately
			setTimeout(() => callback(mockResponse), 0);

			return {
				on: jest.fn(),
				write: jest.fn(),
				end: jest.fn(),
				destroy: jest.fn()
			};
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Unique Subsegment Names', () => {
		it('should work without X-Ray enabled (backwards compatibility)', async () => {
			const request1 = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET'
			};

			const request2 = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET'
			};

			const apiRequest1 = new APIRequest(request1);
			const apiRequest2 = new APIRequest(request2);

			const response1 = await apiRequest1.send();
			const response2 = await apiRequest2.send();

			// Should complete successfully even without X-Ray
			expect(response1.success).toBe(true);
			expect(response2.success).toBe(true);
		});

		it('should handle requests with retry configuration', async () => {
			const request = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET',
				retry: {
					enabled: true,
					maxRetries: 3
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
		});
	});

	describe('Retry Metadata in X-Ray', () => {
		it('should handle retry configuration without X-Ray', async () => {
			const request = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET',
				retry: {
					enabled: true,
					maxRetries: 3
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
		});

		it('should work when retries occur without X-Ray', async () => {
			// Mock a failing then successful response
			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				callCount++;
				const mockResponse = {
					statusCode: callCount === 1 ? 500 : 200,
					headers: { 'content-type': 'application/json' },
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler('{"success": true}');
						} else if (event === 'end') {
							handler();
						}
					})
				};

				setTimeout(() => callback(mockResponse), 0);

				return {
					on: jest.fn(),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET',
				retry: {
					enabled: true,
					maxRetries: 2
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Should succeed after retry
			expect(response.success).toBe(true);
			expect(callCount).toBe(2);
		});
	});

	describe('Pagination Metadata in X-Ray', () => {
		it('should handle pagination configuration without X-Ray', async () => {
			const request = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET',
				pagination: {
					enabled: true,
					batchSize: 10
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
		});

		it('should work when pagination occurs without X-Ray', async () => {
			// Mock paginated response
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const url = new URL(uri);
				const offset = url.searchParams.get('offset') || '0';
				
				const mockResponse = {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							if (offset === '0') {
								handler(JSON.stringify({
									totalItems: 250,
									items: Array(100).fill({ id: 1 }),
									offset: 0,
									limit: 100
								}));
							} else {
								handler(JSON.stringify({
									totalItems: 250,
									items: Array(100).fill({ id: 2 }),
									offset: parseInt(offset),
									limit: 100
								}));
							}
						} else if (event === 'end') {
							handler();
						}
					})
				};

				setTimeout(() => callback(mockResponse), 0);

				return {
					on: jest.fn(),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET',
				parameters: {
					limit: 100
				},
				pagination: {
					enabled: true,
					batchSize: 5
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Should succeed with combined results
			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items.length).toBeGreaterThan(100);
		});
	});

	describe('X-Ray Annotations Completeness', () => {
		it('should work with all request configurations without X-Ray', async () => {
			const request = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET',
				note: 'Test request',
				retry: {
					enabled: true,
					maxRetries: 2
				},
				pagination: {
					enabled: false
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
			expect(response.statusCode).toBe(200);
		});
	});

	describe('Subsegments for Paginated Requests', () => {
		it('should create paginated requests without X-Ray', async () => {
			// Mock paginated response
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const url = new URL(uri);
				const offset = url.searchParams.get('offset') || '0';
				
				const mockResponse = {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							if (offset === '0') {
								handler(JSON.stringify({
									totalItems: 250,
									items: Array(100).fill({ id: 1 }),
									offset: 0,
									limit: 100
								}));
							} else {
								handler(JSON.stringify({
									totalItems: 250,
									items: Array(50).fill({ id: 2 }),
									offset: parseInt(offset),
									limit: 100
								}));
							}
						} else if (event === 'end') {
							handler();
						}
					})
				};

				setTimeout(() => callback(mockResponse), 0);

				return {
					on: jest.fn(),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET',
				parameters: {
					limit: 100
				},
				pagination: {
					enabled: true,
					batchSize: 5
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Should succeed with paginated results
			expect(response.success).toBe(true);
			const body = JSON.parse(response.body);
			expect(body.items.length).toBeGreaterThan(100);
		});

		it('should handle page requests with note updates', async () => {
			// Mock paginated response
			let requestNotes = [];
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				const url = new URL(uri);
				const offset = url.searchParams.get('offset') || '0';
				
				// Track request notes (would be in subsegment in real X-Ray)
				requestNotes.push(`Offset ${offset}`);
				
				const mockResponse = {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							handler(JSON.stringify({
								totalItems: offset === '0' ? 250 : 0,
								items: Array(100).fill({ id: 1 }),
								offset: parseInt(offset),
								limit: 100
							}));
						} else if (event === 'end') {
							handler();
						}
					})
				};

				setTimeout(() => callback(mockResponse), 0);

				return {
					on: jest.fn(),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET',
				note: 'Test pagination',
				parameters: {
					limit: 100
				},
				pagination: {
					enabled: true,
					batchSize: 5
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Should have made multiple requests
			expect(requestNotes.length).toBeGreaterThan(1);
			expect(response.success).toBe(true);
		});
	});

	describe('X-Ray Integration Tests', () => {
		it('should not break when X-Ray is not available', async () => {
			const request = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET',
				note: 'Test without X-Ray',
				retry: {
					enabled: true,
					maxRetries: 2
				},
				pagination: {
					enabled: false
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			expect(response.success).toBe(true);
		});

		it('should handle combined retry and pagination without X-Ray', async () => {
			let callCount = 0;
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				callCount++;
				const url = new URL(uri);
				const offset = url.searchParams.get('offset') || '0';
				
				// First call fails, subsequent succeed
				const statusCode = callCount === 1 ? 500 : 200;
				
				const mockResponse = {
					statusCode: statusCode,
					headers: { 'content-type': 'application/json' },
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							if (statusCode === 200) {
								handler(JSON.stringify({
									totalItems: offset === '0' ? 250 : 0,
									items: Array(100).fill({ id: 1 }),
									offset: parseInt(offset),
									limit: 100
								}));
							} else {
								handler('{"error": "Server error"}');
							}
						} else if (event === 'end') {
							handler();
						}
					})
				};

				setTimeout(() => callback(mockResponse), 0);

				return {
					on: jest.fn(),
					write: jest.fn(),
					end: jest.fn(),
					destroy: jest.fn()
				};
			});

			const request = {
				host: 'api.example.com',
				path: '/data',
				method: 'GET',
				parameters: {
					limit: 100
				},
				retry: {
					enabled: true,
					maxRetries: 2
				},
				pagination: {
					enabled: true,
					batchSize: 5
				}
			};

			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();

			// Should succeed after retry and pagination
			expect(response.success).toBe(true);
			expect(callCount).toBeGreaterThan(1);
		});
	});
});
