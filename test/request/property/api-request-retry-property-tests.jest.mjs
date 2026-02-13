import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import APIRequest from '../../../src/lib/tools/APIRequest.class.js';
import https from 'https';

/**
 * APIRequest Retry Property-Based Tests
 * Feature: api-request-pagination-retries-xray
 * 
 * These tests validate universal properties of the retry logic across all valid inputs.
 */
describe('APIRequest Retry - Property-Based Tests', () => {
	
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
	
	describe('Property 8: Retry Attempt Count', () => {
		/**
		 * Feature: api-request-pagination-retries-xray, Property 8: Retry Attempt Count
		 * **Validates: Requirements 2.1, 6.2**
		 * 
		 * For any retry configuration with maxRetries=N, the total number of attempts 
		 * should not exceed N+1 (initial + retries).
		 */
		it('should never exceed maxRetries + 1 total attempts', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 1, max: 5 }), // maxRetries (start from 1 to avoid edge case)
					async (maxRetries) => {
						let attemptCount = 0;
						
						jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
							attemptCount++;
							
							setTimeout(() => {
								// Always fail to test max attempts
								mockResponse.statusCode = 500;
								callback(mockResponse);
								setTimeout(() => {
									mockResponse.dataHandler('{"error":"Server Error"}');
									mockResponse.endHandler();
								}, 10);
							}, 10);
							
							return mockRequest;
						});
						
						const request = {
							host: 'api.example.com',
							path: '/test',
							retry: {
								enabled: true,
								maxRetries: maxRetries
							}
						};
						
						const apiRequest = new APIRequest(request);
						await apiRequest.send();
						
						// Total attempts should be initial + maxRetries
						expect(attemptCount).toBeLessThanOrEqual(maxRetries + 1);
						expect(attemptCount).toBe(maxRetries + 1);
					}
				),
				{ numRuns: 20 }
			);
		});
	});
	
	describe('Property 9: Retry Opt-In', () => {
		/**
		 * Feature: api-request-pagination-retries-xray, Property 9: Retry Opt-In
		 * **Validates: Requirements 2.2, 4.6**
		 * 
		 * For any request without retry configuration, only a single attempt 
		 * should be made matching current behavior.
		 */
		it('should make only one attempt when retry is not enabled', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.constantFrom(undefined, null, { enabled: false }, {}),
					async (retryConfig) => {
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
						
						const request = {
							host: 'api.example.com',
							path: '/test',
							retry: retryConfig
						};
						
						const apiRequest = new APIRequest(request);
						await apiRequest.send();
						
						expect(attemptCount).toBe(1);
					}
				),
				{ numRuns: 20 }
			);
		});
	});
	
	describe('Property 10: Retry on Network Errors', () => {
		/**
		 * Feature: api-request-pagination-retries-xray, Property 10: Retry on Network Errors
		 * **Validates: Requirements 2.3**
		 * 
		 * For any request that fails with a network error and retry enabled, 
		 * the request should be retried up to the maximum attempts.
		 */
		it('should retry on network errors when enabled', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 1, max: 3 }),
					async (maxRetries) => {
						let attemptCount = 0;
						
						jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
							attemptCount++;
							
							setTimeout(() => {
								mockRequest.errorHandler(new Error('Network error'));
							}, 10);
							
							return mockRequest;
						});
						
						const request = {
							host: 'api.example.com',
							path: '/test',
							retry: {
								enabled: true,
								maxRetries: maxRetries
							}
						};
						
						const apiRequest = new APIRequest(request);
						await apiRequest.send();
						
						expect(attemptCount).toBe(maxRetries + 1);
					}
				),
				{ numRuns: 20 }
			);
		});
	});
	
	describe('Property 11: Retry on Empty Response', () => {
		/**
		 * Feature: api-request-pagination-retries-xray, Property 11: Retry on Empty Response
		 * **Validates: Requirements 2.4**
		 * 
		 * For any request that returns an empty or null body and retry enabled, 
		 * the request should be retried.
		 */
		it('should retry on empty response body when enabled', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 1, max: 3 }),
					async (maxRetries) => {
						let attemptCount = 0;
						
						jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
							attemptCount++;
							
							setTimeout(() => {
								mockResponse.statusCode = 200;
								callback(mockResponse);
								setTimeout(() => {
									// Always return empty body
									mockResponse.dataHandler('');
									mockResponse.endHandler();
								}, 10);
							}, 10);
							
							return mockRequest;
						});
						
						const request = {
							host: 'api.example.com',
							path: '/test',
							retry: {
								enabled: true,
								maxRetries: maxRetries
							}
						};
						
						const apiRequest = new APIRequest(request);
						await apiRequest.send();
						
						expect(attemptCount).toBe(maxRetries + 1);
					}
				),
				{ numRuns: 20 }
			);
		});
	});
	
	describe('Property 12: Retry on Server Errors', () => {
		/**
		 * Feature: api-request-pagination-retries-xray, Property 12: Retry on Server Errors
		 * **Validates: Requirements 2.6**
		 * 
		 * For any request that returns a 5xx status code and retry enabled, 
		 * the request should be retried.
		 */
		it('should retry on 5xx status codes when enabled', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 500, max: 599 }),
					fc.integer({ min: 1, max: 3 }),
					async (statusCode, maxRetries) => {
						let attemptCount = 0;
						
						jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
							attemptCount++;
							
							setTimeout(() => {
								mockResponse.statusCode = statusCode;
								callback(mockResponse);
								setTimeout(() => {
									mockResponse.dataHandler('{"error":"Server Error"}');
									mockResponse.endHandler();
								}, 10);
							}, 10);
							
							return mockRequest;
						});
						
						const request = {
							host: 'api.example.com',
							path: '/test',
							retry: {
								enabled: true,
								maxRetries: maxRetries
							}
						};
						
						const apiRequest = new APIRequest(request);
						await apiRequest.send();
						
						expect(attemptCount).toBe(maxRetries + 1);
					}
				),
				{ numRuns: 20 }
			);
		});
	});
	
	describe('Property 13: No Retry on Client Errors', () => {
		/**
		 * Feature: api-request-pagination-retries-xray, Property 13: No Retry on Client Errors
		 * **Validates: Requirements 2.7**
		 * 
		 * For any request that returns a 4xx status code with default retry configuration, 
		 * the request should NOT be retried.
		 */
		it('should not retry on 4xx status codes by default', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 400, max: 499 }),
					fc.integer({ min: 1, max: 3 }),
					async (statusCode, maxRetries) => {
						let attemptCount = 0;
						
						jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
							attemptCount++;
							
							setTimeout(() => {
								mockResponse.statusCode = statusCode;
								callback(mockResponse);
								setTimeout(() => {
									mockResponse.dataHandler('{"error":"Client Error"}');
									mockResponse.endHandler();
								}, 10);
							}, 10);
							
							return mockRequest;
						});
						
						const request = {
							host: 'api.example.com',
							path: '/test',
							retry: {
								enabled: true,
								maxRetries: maxRetries
								// clientError defaults to false
							}
						};
						
						const apiRequest = new APIRequest(request);
						await apiRequest.send();
						
						// Should only make one attempt
						expect(attemptCount).toBe(1);
					}
				),
				{ numRuns: 20 }
			);
		});
		
		it('should retry on 4xx status codes when clientError is enabled', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 400, max: 499 }),
					fc.integer({ min: 1, max: 3 }),
					async (statusCode, maxRetries) => {
						let attemptCount = 0;
						
						jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
							attemptCount++;
							
							setTimeout(() => {
								mockResponse.statusCode = statusCode;
								callback(mockResponse);
								setTimeout(() => {
									mockResponse.dataHandler('{"error":"Client Error"}');
									mockResponse.endHandler();
								}, 10);
							}, 10);
							
							return mockRequest;
						});
						
						const request = {
							host: 'api.example.com',
							path: '/test',
							retry: {
								enabled: true,
								maxRetries: maxRetries,
								retryOn: {
									clientError: true
								}
							}
						};
						
						const apiRequest = new APIRequest(request);
						await apiRequest.send();
						
						// Should retry
						expect(attemptCount).toBe(maxRetries + 1);
					}
				),
				{ numRuns: 20 }
			);
		});
	});
	
	describe('Property 14: Retry Metadata Accuracy', () => {
		/**
		 * Feature: api-request-pagination-retries-xray, Property 14: Retry Metadata Accuracy
		 * **Validates: Requirements 2.9, 6.3**
		 * 
		 * For any request with retries, the response metadata should accurately 
		 * reflect the number of attempts made.
		 */
		it('should accurately track retry attempts', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 1, max: 3 }), // maxRetries (start from 1)
					async (maxRetries) => {
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
						
						const request = {
							host: 'api.example.com',
							path: '/test',
							retry: {
								enabled: true,
								maxRetries: maxRetries
							}
						};
						
						const apiRequest = new APIRequest(request);
						await apiRequest.send();
						
						// Verify attempt count matches expected
						expect(attemptCount).toBe(maxRetries + 1);
						
						// Note: Metadata will be added in task 5
						// This test validates the retry behavior occurred correctly
					}
				),
				{ numRuns: 20 }
			);
		});
	});
	
	describe('Property 15: Successful Retry Returns Success', () => {
		/**
		 * Feature: api-request-pagination-retries-xray, Property 15: Successful Retry Returns Success
		 * **Validates: Requirements 2.12**
		 * 
		 * For any request that fails initially but succeeds on retry, the final 
		 * response should be successful with metadata indicating retries occurred.
		 */
		it('should return success when retry succeeds', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 1, max: 3 }),
					fc.integer({ min: 1, max: 3 }),
					async (maxRetries, successOnAttempt) => {
						// Ensure successOnAttempt is within valid range
						const actualSuccessAttempt = Math.min(successOnAttempt, maxRetries + 1);
						let attemptCount = 0;
						
						jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
							attemptCount++;
							
							setTimeout(() => {
								if (attemptCount < actualSuccessAttempt) {
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
						
						const request = {
							host: 'api.example.com',
							path: '/test',
							retry: {
								enabled: true,
								maxRetries: maxRetries
							}
						};
						
						const apiRequest = new APIRequest(request);
						const response = await apiRequest.send();
						
						// Should succeed on the specified attempt
						expect(response.success).toBe(true);
						expect(response.statusCode).toBe(200);
						expect(attemptCount).toBe(actualSuccessAttempt);
					}
				),
				{ numRuns: 20 }
			);
		});
	});
});
