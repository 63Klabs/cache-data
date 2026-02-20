import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import https from 'https';

describe('APIRequest - Metadata Property Tests', () => {
	let APIRequest;

	beforeEach(async () => {
		// Import fresh module for each test
		const module = await import('../../../src/lib/tools/APIRequest.class.js');
		APIRequest = module.default;
		jest.clearAllMocks();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Property 26: Conditional Metadata Presence', () => {
		it('**Property 26: Conditional Metadata Presence** - Metadata should only be present when retries or pagination occur', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.boolean(), // hasRetry
					fc.boolean(), // hasPagination
					async (hasRetry, hasPagination) => {
						let attemptCount = 0;
						const mockResponses = [
							{
								statusCode: 200,
								headers: {},
								body: JSON.stringify({
									totalItems: hasPagination ? 20 : 10,
									items: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
									offset: 0,
									limit: 10
								})
							},
							// Second page (only if pagination enabled)
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
									if (event === 'error' && hasRetry && attemptCount === 1) {
										setTimeout(() => handler(new Error('Network error')), 10);
									}
									return mockReq;
								}),
								write: jest.fn(),
								end: jest.fn(),
								destroy: jest.fn()
							};

							if (!hasRetry || attemptCount > 1) {
								const responseIndex = hasRetry ? attemptCount - 2 : attemptCount - 1;
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
							path: '/test',
							parameters: { limit: 10 },
							retry: hasRetry ? { enabled: true, maxRetries: 1 } : { enabled: false },
							pagination: hasPagination ? {
								enabled: true,
								totalItemsLabel: 'totalItems',
								itemsLabel: 'items',
								offsetLabel: 'offset',
								limitLabel: 'limit',
								defaultLimit: 10
							} : { enabled: false }
						};

						const apiRequest = new APIRequest(request);
						const response = await apiRequest.send();

						// Property: Metadata should only be present when retries or pagination occur
						if (hasRetry || hasPagination) {
							expect(response).toHaveProperty('metadata');
							if (hasRetry) {
								expect(response.metadata).toHaveProperty('retries');
								expect(response.metadata.retries.occurred).toBe(true);
							}
							if (hasPagination) {
								expect(response.metadata).toHaveProperty('pagination');
								expect(response.metadata.pagination.occurred).toBe(true);
							}
						} else {
							expect(response).not.toHaveProperty('metadata');
						}

						jest.restoreAllMocks();
					}
				),
				{ numRuns: 10 } // Reduced runs for async tests
			);
		});
	});

	describe('Property 27: Metadata Backwards Compatibility', () => {
		it('**Property 27: Metadata Backwards Compatibility** - Adding metadata should not break existing response format', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.boolean(), // hasMetadata (retry or pagination)
					async (hasMetadata) => {
						let attemptCount = 0;
						const mockResponses = [
							{
								statusCode: 200,
								headers: { 'content-type': 'application/json' },
								body: JSON.stringify({
									totalItems: hasMetadata ? 20 : 10,
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

						jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
							const response = mockResponses[attemptCount++];
							
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
							path: '/test',
							parameters: { limit: 10 },
							pagination: hasMetadata ? {
								enabled: true,
								totalItemsLabel: 'totalItems',
								itemsLabel: 'items',
								offsetLabel: 'offset',
								limitLabel: 'limit',
								defaultLimit: 10
							} : { enabled: false }
						};

						const apiRequest = new APIRequest(request);
						const response = await apiRequest.send();

						// Property: Standard response fields must always be present
						expect(response).toHaveProperty('success');
						expect(response).toHaveProperty('statusCode');
						expect(response).toHaveProperty('headers');
						expect(response).toHaveProperty('body');
						expect(response).toHaveProperty('message');

						// Property: Standard fields must have correct types
						expect(typeof response.success).toBe('boolean');
						expect(typeof response.statusCode).toBe('number');
						expect(typeof response.headers).toBe('object');
						expect(typeof response.body).toBe('string');
						expect(typeof response.message).toBe('string');

						// Property: Metadata is additive, not replacing
						if (hasMetadata) {
							expect(response).toHaveProperty('metadata');
							// All standard fields still present
							expect(response.success).toBeDefined();
							expect(response.statusCode).toBeDefined();
							expect(response.body).toBeDefined();
						}

						jest.restoreAllMocks();
					}
				),
				{ numRuns: 10 }
			);
		});
	});
});
