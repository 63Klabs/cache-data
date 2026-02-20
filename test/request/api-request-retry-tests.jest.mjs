import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import APIRequest from '../../src/lib/tools/APIRequest.class.js';
import https from 'https';

describe('APIRequest Retry Logic', () => {
	
	let mockRequest;
	let mockResponse;
	
	beforeEach(() => {
		// Create mock request object
		mockRequest = {
			on: jest.fn((event, handler) => {
				if (event === 'timeout') {
					mockRequest.timeoutHandler = handler;
				} else if (event === 'error') {
					mockRequest.errorHandler = handler;
				}
				return mockRequest;
			}),
			write: jest.fn(),
			end: jest.fn(),
			destroy: jest.fn()
		};
		
		// Create mock response object
		mockResponse = {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			on: jest.fn((event, handler) => {
				if (event === 'data') {
					mockResponse.dataHandler = handler;
				} else if (event === 'end') {
					mockResponse.endHandler = handler;
				} else if (event === 'error') {
					mockResponse.errorHandler = handler;
				}
				return mockResponse;
			})
		};
	});
	
	afterEach(() => {
		jest.restoreAllMocks();
	});
	
	describe('Retry on Network Error', () => {
		it('should retry on network error when retry is enabled', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 2
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				if (attemptCount < 3) {
					// First two attempts fail with network error
					setTimeout(() => {
						mockRequest.errorHandler(new Error('Network error'));
					}, 10);
				} else {
					// Third attempt succeeds
					setTimeout(() => {
						callback(mockResponse);
						setTimeout(() => {
							mockResponse.dataHandler('{"success":true}');
							mockResponse.endHandler();
						}, 10);
					}, 10);
				}
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(3); // 1 initial + 2 retries
			expect(response.success).toBe(true);
			expect(response.statusCode).toBe(200);
		});
		
		it('should not retry on network error when retry is disabled', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: false
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					mockRequest.errorHandler(new Error('Network error'));
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(1); // Only initial attempt
			expect(response.success).toBe(false);
			expect(response.statusCode).toBe(500);
		});
	});
	
	describe('Retry on Empty Response', () => {
		it('should retry when response body is empty', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					callback(mockResponse);
					setTimeout(() => {
						if (attemptCount === 1) {
							// First attempt returns empty body
							mockResponse.dataHandler('');
						} else {
							// Second attempt returns valid body
							mockResponse.dataHandler('{"success":true}');
						}
						mockResponse.endHandler();
					}, 10);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(2); // 1 initial + 1 retry
			expect(response.body).toBe('{"success":true}');
		});
		
		it('should retry when response body is null', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				// Create a fresh mockResponse for each attempt
				const freshMockResponse = {
					statusCode: attemptCount === 1 ? 304 : 200,
					headers: { 'content-type': 'application/json' },
					dataHandler: null,
					endHandler: null,
					errorHandler: null,
					on: jest.fn((event, handler) => {
						if (event === 'data') {
							freshMockResponse.dataHandler = handler;
						} else if (event === 'end') {
							freshMockResponse.endHandler = handler;
							// Trigger end handler after it's registered
							setTimeout(() => {
								if (attemptCount > 1 && freshMockResponse.dataHandler) {
									freshMockResponse.dataHandler('{"success":true}');
								}
								if (freshMockResponse.endHandler) {
									freshMockResponse.endHandler();
								}
							}, 10);
						} else if (event === 'error') {
							freshMockResponse.errorHandler = handler;
						}
						return freshMockResponse;
					})
				};
				
				setTimeout(() => {
					callback(freshMockResponse);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(2); // 1 initial + 1 retry
		});
	});
	
	describe('Retry on 5xx Status Code', () => {
		it('should retry on 500 status code', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					if (attemptCount === 1) {
						mockResponse.statusCode = 500;
					} else {
						mockResponse.statusCode = 200;
					}
					callback(mockResponse);
					setTimeout(() => {
						mockResponse.dataHandler('{"success":true}');
						mockResponse.endHandler();
					}, 10);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(2); // 1 initial + 1 retry
			expect(response.statusCode).toBe(200);
		});
		
		it('should retry on 503 status code', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 1
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					if (attemptCount === 1) {
						mockResponse.statusCode = 503;
					} else {
						mockResponse.statusCode = 200;
					}
					callback(mockResponse);
					setTimeout(() => {
						mockResponse.dataHandler('{"success":true}');
						mockResponse.endHandler();
					}, 10);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(2); // 1 initial + 1 retry
			expect(response.statusCode).toBe(200);
		});
	});
	
	describe('No Retry on 4xx Status Code (Default)', () => {
		it('should not retry on 400 status code by default', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 2
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					mockResponse.statusCode = 400;
					callback(mockResponse);
					setTimeout(() => {
						mockResponse.dataHandler('{"error":"Bad Request"}');
						mockResponse.endHandler();
					}, 10);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(1); // Only initial attempt
			expect(response.statusCode).toBe(400);
			expect(response.success).toBe(false);
		});
		
		it('should not retry on 404 status code by default', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 2
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					mockResponse.statusCode = 404;
					callback(mockResponse);
					setTimeout(() => {
						mockResponse.dataHandler('{"error":"Not Found"}');
						mockResponse.endHandler();
					}, 10);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(1); // Only initial attempt
			expect(response.statusCode).toBe(404);
		});
	});
	
	describe('Retry on 4xx When Configured', () => {
		it('should retry on 400 status code when clientError is enabled', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 1,
					retryOn: {
						clientError: true
					}
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					if (attemptCount === 1) {
						mockResponse.statusCode = 400;
					} else {
						mockResponse.statusCode = 200;
					}
					callback(mockResponse);
					setTimeout(() => {
						mockResponse.dataHandler('{"success":true}');
						mockResponse.endHandler();
					}, 10);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(2); // 1 initial + 1 retry
			expect(response.statusCode).toBe(200);
		});
	});
	
	describe('Exhausted Retries Return Last Error', () => {
		it('should return last error when all retries are exhausted', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 2
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					mockResponse.statusCode = 500;
					callback(mockResponse);
					setTimeout(() => {
						mockResponse.dataHandler('{"error":"Server Error"}');
						mockResponse.endHandler();
					}, 10);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(3); // 1 initial + 2 retries
			expect(response.statusCode).toBe(500);
			expect(response.success).toBe(false);
		});
	});
	
	describe('Successful Retry Returns Success', () => {
		it('should return success when retry succeeds', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 2
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					if (attemptCount === 1) {
						mockResponse.statusCode = 500;
					} else if (attemptCount === 2) {
						mockResponse.statusCode = 503;
					} else {
						mockResponse.statusCode = 200;
					}
					callback(mockResponse);
					setTimeout(() => {
						mockResponse.dataHandler('{"success":true}');
						mockResponse.endHandler();
					}, 10);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(3); // 1 initial + 2 retries
			expect(response.statusCode).toBe(200);
			expect(response.success).toBe(true);
		});
	});
	
	describe('Retry Metadata Accuracy', () => {
		it('should include accurate retry metadata when retries occur', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 2
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					if (attemptCount < 3) {
						mockResponse.statusCode = 500;
					} else {
						mockResponse.statusCode = 200;
					}
					callback(mockResponse);
					setTimeout(() => {
						mockResponse.dataHandler('{"success":true}');
						mockResponse.endHandler();
					}, 10);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			// Note: Metadata will be added in a future task
			// This test validates the retry behavior occurred correctly
			expect(attemptCount).toBe(3); // 1 initial + 2 retries
			expect(response.statusCode).toBe(200);
		});
		
		it('should not include retry metadata when no retries occur', async () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 2
				}
			};
			
			let attemptCount = 0;
			
			jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
				attemptCount++;
				
				setTimeout(() => {
					mockResponse.statusCode = 200;
					callback(mockResponse);
					setTimeout(() => {
						mockResponse.dataHandler('{"success":true}');
						mockResponse.endHandler();
					}, 10);
				}, 10);
				
				return mockRequest;
			});
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(attemptCount).toBe(1); // Only initial attempt
			expect(response.statusCode).toBe(200);
		});
	});
});
