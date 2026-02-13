import { describe, it, expect } from '@jest/globals';
import APIRequest from '../../src/lib/tools/APIRequest.class.js';

describe('APIRequest Configuration Defaults and Merging', () => {
	
	describe('Default Configuration', () => {
		it('should apply default pagination configuration when not provided', () => {
			const request = {
				host: 'api.example.com',
				path: '/test'
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.pagination).toBeDefined();
			expect(requestObj.request.pagination.enabled).toBe(false);
			expect(requestObj.request.pagination.totalItemsLabel).toBe('totalItems');
			expect(requestObj.request.pagination.itemsLabel).toBe('items');
			expect(requestObj.request.pagination.offsetLabel).toBe('offset');
			expect(requestObj.request.pagination.limitLabel).toBe('limit');
			expect(requestObj.request.pagination.continuationTokenLabel).toBe(null);
			expect(requestObj.request.pagination.responseReturnCountLabel).toBe('returnedItemCount');
			expect(requestObj.request.pagination.defaultLimit).toBe(200);
			expect(requestObj.request.pagination.batchSize).toBe(5);
		});

		it('should apply default retry configuration when not provided', () => {
			const request = {
				host: 'api.example.com',
				path: '/test'
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.retry).toBeDefined();
			expect(requestObj.request.retry.enabled).toBe(false);
			expect(requestObj.request.retry.maxRetries).toBe(1);
			expect(requestObj.request.retry.retryOn).toBeDefined();
			expect(requestObj.request.retry.retryOn.networkError).toBe(true);
			expect(requestObj.request.retry.retryOn.emptyResponse).toBe(true);
			expect(requestObj.request.retry.retryOn.parseError).toBe(true);
			expect(requestObj.request.retry.retryOn.serverError).toBe(true);
			expect(requestObj.request.retry.retryOn.clientError).toBe(false);
		});
	});

	describe('Pagination Configuration Merging', () => {
		it('should merge minimal pagination configuration with defaults', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				pagination: {
					enabled: true
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.pagination.enabled).toBe(true);
			expect(requestObj.request.pagination.totalItemsLabel).toBe('totalItems');
			expect(requestObj.request.pagination.itemsLabel).toBe('items');
			expect(requestObj.request.pagination.defaultLimit).toBe(200);
		});

		it('should merge custom pagination labels with defaults', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				pagination: {
					enabled: true,
					totalItemsLabel: 'total',
					itemsLabel: 'results'
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.pagination.enabled).toBe(true);
			expect(requestObj.request.pagination.totalItemsLabel).toBe('total');
			expect(requestObj.request.pagination.itemsLabel).toBe('results');
			expect(requestObj.request.pagination.offsetLabel).toBe('offset');
			expect(requestObj.request.pagination.batchSize).toBe(5);
		});

		it('should override all pagination defaults when provided', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				pagination: {
					enabled: true,
					totalItemsLabel: 'count',
					itemsLabel: 'data',
					offsetLabel: 'skip',
					limitLabel: 'take',
					continuationTokenLabel: 'nextToken',
					responseReturnCountLabel: 'returned',
					defaultLimit: 100,
					batchSize: 10
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.pagination.enabled).toBe(true);
			expect(requestObj.request.pagination.totalItemsLabel).toBe('count');
			expect(requestObj.request.pagination.itemsLabel).toBe('data');
			expect(requestObj.request.pagination.offsetLabel).toBe('skip');
			expect(requestObj.request.pagination.limitLabel).toBe('take');
			expect(requestObj.request.pagination.continuationTokenLabel).toBe('nextToken');
			expect(requestObj.request.pagination.responseReturnCountLabel).toBe('returned');
			expect(requestObj.request.pagination.defaultLimit).toBe(100);
			expect(requestObj.request.pagination.batchSize).toBe(10);
		});
	});

	describe('Retry Configuration Merging', () => {
		it('should merge minimal retry configuration with defaults', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.retry.enabled).toBe(true);
			expect(requestObj.request.retry.maxRetries).toBe(1);
			expect(requestObj.request.retry.retryOn.networkError).toBe(true);
			expect(requestObj.request.retry.retryOn.clientError).toBe(false);
		});

		it('should merge custom maxRetries with default retryOn', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 3
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.retry.enabled).toBe(true);
			expect(requestObj.request.retry.maxRetries).toBe(3);
			expect(requestObj.request.retry.retryOn.networkError).toBe(true);
			expect(requestObj.request.retry.retryOn.serverError).toBe(true);
			expect(requestObj.request.retry.retryOn.clientError).toBe(false);
		});

		it('should merge nested retryOn object properly', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					maxRetries: 2,
					retryOn: {
						clientError: true
					}
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.retry.enabled).toBe(true);
			expect(requestObj.request.retry.maxRetries).toBe(2);
			expect(requestObj.request.retry.retryOn.networkError).toBe(true);
			expect(requestObj.request.retry.retryOn.emptyResponse).toBe(true);
			expect(requestObj.request.retry.retryOn.parseError).toBe(true);
			expect(requestObj.request.retry.retryOn.serverError).toBe(true);
			expect(requestObj.request.retry.retryOn.clientError).toBe(true);
		});

		it('should override specific retryOn conditions while keeping others', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				retry: {
					enabled: true,
					retryOn: {
						serverError: false,
						clientError: true
					}
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.retry.retryOn.networkError).toBe(true);
			expect(requestObj.request.retry.retryOn.emptyResponse).toBe(true);
			expect(requestObj.request.retry.retryOn.parseError).toBe(true);
			expect(requestObj.request.retry.retryOn.serverError).toBe(false);
			expect(requestObj.request.retry.retryOn.clientError).toBe(true);
		});
	});

	describe('Combined Configuration', () => {
		it('should merge both pagination and retry configurations independently', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				pagination: {
					enabled: true,
					batchSize: 3
				},
				retry: {
					enabled: true,
					maxRetries: 2
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			// Verify pagination
			expect(requestObj.request.pagination.enabled).toBe(true);
			expect(requestObj.request.pagination.batchSize).toBe(3);
			expect(requestObj.request.pagination.defaultLimit).toBe(200);
			
			// Verify retry
			expect(requestObj.request.retry.enabled).toBe(true);
			expect(requestObj.request.retry.maxRetries).toBe(2);
			expect(requestObj.request.retry.retryOn.networkError).toBe(true);
		});
	});

	describe('Backwards Compatibility', () => {
		it('should work with requests that do not include pagination or retry', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				method: 'GET'
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.pagination.enabled).toBe(false);
			expect(requestObj.request.retry.enabled).toBe(false);
			expect(requestObj.request.method).toBe('GET');
			expect(requestObj.request.uri).toContain('api.example.com');
		});

		it('should preserve existing options merging behavior', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				options: {
					timeout: 5000,
					separateDuplicateParameters: true
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.options.timeout).toBe(5000);
			expect(requestObj.request.options.separateDuplicateParameters).toBe(true);
			expect(requestObj.request.options.combinedDuplicateParameterDelimiter).toBe(',');
		});
	});
});
