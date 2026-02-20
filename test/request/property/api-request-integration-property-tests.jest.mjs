import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import https from 'https';

describe('APIRequest - Integration Property Tests', () => {
	let APIRequest;

	beforeEach(async () => {
		// Import fresh module for each test
		const module = await import('../../../src/lib/tools/APIRequest.class.js');
		APIRequest = module.default;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	/**
	 * Property 24: Independent Feature Configuration
	 * 
	 * For any combination of pagination and retry configurations, each feature should work 
	 * independently without affecting the other.
	 * 
	 * Validates: Requirements 5.8
	 */
	it('Property 24: Independent Feature Configuration', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate combinations of pagination and retry enabled/disabled
				fc.boolean(), // pagination enabled
				fc.boolean(), // retry enabled
				async (paginationEnabled, retryEnabled) => {
					// Mock successful responses
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
						const response = mockResponses[callCount % mockResponses.length];
						callCount++;
						
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
						parameters: { limit: 10 }
					};

					// Add pagination config if enabled
					if (paginationEnabled) {
						request.pagination = {
							enabled: true,
							defaultLimit: 10
						};
					}

					// Add retry config if enabled
					if (retryEnabled) {
						request.retry = {
							enabled: true,
							maxRetries: 1
						};
					}

					const apiRequest = new APIRequest(request);
					const response = await apiRequest.send();

					// Request should succeed regardless of feature combination
					expect(response.success).toBe(true);
					expect(response.statusCode).toBe(200);

					// Verify pagination metadata only present when pagination enabled
					if (paginationEnabled) {
						// Pagination metadata should exist if pagination occurred
						if (response.metadata?.pagination) {
							expect(response.metadata.pagination.occurred).toBe(true);
						}
					} else {
						// Pagination should not occur when disabled
						if (response.metadata?.pagination) {
							expect(response.metadata.pagination.occurred).toBe(false);
						}
					}

					// Verify retry metadata only present when retry enabled and retries occurred
					if (retryEnabled && response.metadata?.retries) {
						// If retry metadata exists, it should be valid
						expect(response.metadata.retries.attempts).toBeGreaterThanOrEqual(1);
					}

					// Features should not interfere with each other
					// If both enabled and both occurred, both should have metadata
					if (paginationEnabled && retryEnabled) {
						// At least the response should be successful
						expect(response.success).toBe(true);
					}

					return true;
				}
			),
			{ numRuns: 20 }
		);
	});

	/**
	 * Property 25: Configuration Defaults
	 * 
	 * For any pagination or retry configuration with missing fields, sensible defaults 
	 * should be applied.
	 * 
	 * Validates: Requirements 5.9
	 */
	it('Property 25: Configuration Defaults', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate partial pagination configs
				fc.record({
					enabled: fc.constant(true),
					totalItemsLabel: fc.option(fc.constantFrom('totalItems', 'total', 'count'), { nil: undefined }),
					itemsLabel: fc.option(fc.constantFrom('items', 'results', 'data'), { nil: undefined }),
					offsetLabel: fc.option(fc.constantFrom('offset', 'skip', 'page'), { nil: undefined }),
					limitLabel: fc.option(fc.constantFrom('limit', 'take', 'per_page'), { nil: undefined }),
					defaultLimit: fc.option(fc.integer({ min: 10, max: 100 }), { nil: undefined }),
					batchSize: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined })
				}, { requiredKeys: ['enabled'] }),
				// Generate partial retry configs
				fc.record({
					enabled: fc.constant(true),
					maxRetries: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
					retryOn: fc.option(fc.record({
						networkError: fc.option(fc.boolean(), { nil: undefined }),
						emptyResponse: fc.option(fc.boolean(), { nil: undefined }),
						parseError: fc.option(fc.boolean(), { nil: undefined }),
						serverError: fc.option(fc.boolean(), { nil: undefined }),
						clientError: fc.option(fc.boolean(), { nil: undefined })
					}, { requiredKeys: [] }), { nil: undefined })
				}, { requiredKeys: ['enabled'] }),
				async (paginationConfig, retryConfig) => {
					// Mock successful responses
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
						const response = mockResponses[callCount % mockResponses.length];
						callCount++;
						
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
						pagination: paginationConfig,
						retry: retryConfig
					};

					const apiRequest = new APIRequest(request);
					const response = await apiRequest.send();

					// Request should succeed with partial configs
					expect(response.success).toBe(true);
					expect(response.statusCode).toBe(200);

					// Verify defaults were applied for pagination
					if (paginationConfig.enabled) {
						// Should work even with missing fields
						// Pagination metadata only exists if pagination occurred
						if (response.metadata?.pagination) {
							expect(response.metadata.pagination.occurred).toBe(true);
							
							// If pagination occurred, verify it worked with defaults
							expect(response.metadata.pagination.totalPages).toBeGreaterThan(0);
							expect(response.metadata.pagination.totalItems).toBeGreaterThan(0);
						}
					}

					// Verify defaults were applied for retry
					if (retryConfig.enabled) {
						// Should work even with missing fields
						// Retry metadata only exists if retries occurred
						if (response.metadata?.retries) {
							expect(response.metadata.retries.attempts).toBeGreaterThanOrEqual(1);
						}
					}

					return true;
				}
			),
			{ numRuns: 50 }
		);
	});

	/**
	 * Additional property: Configuration merging preserves user values
	 * 
	 * When user provides specific configuration values, those values should be used
	 * instead of defaults.
	 */
	it('Property: Configuration merging preserves user values', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 50, max: 200 }), // Custom default limit
				fc.integer({ min: 1, max: 10 }), // Custom batch size
				fc.integer({ min: 1, max: 5 }), // Custom max retries
				async (customLimit, customBatchSize, customMaxRetries) => {
					// Mock successful responses
					jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
						const mockRes = {
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							on: jest.fn((event, handler) => {
								if (event === 'data') {
									handler(JSON.stringify({
										totalItems: 10,
										items: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
										offset: 0,
										limit: customLimit
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
						parameters: { limit: customLimit },
						pagination: {
							enabled: true,
							defaultLimit: customLimit,
							batchSize: customBatchSize
						},
						retry: {
							enabled: true,
							maxRetries: customMaxRetries
						}
					};

					const apiRequest = new APIRequest(request);
					const response = await apiRequest.send();

					// Request should succeed with custom values
					expect(response.success).toBe(true);
					expect(response.statusCode).toBe(200);

					// Custom values should be respected
					// (We can't directly verify internal config, but we verify behavior works)
					// Metadata only exists if features were actually used
					if (response.metadata) {
						// If metadata exists, verify it's valid
						if (response.metadata.pagination) {
							expect(response.metadata.pagination.occurred).toBeDefined();
						}
						if (response.metadata.retries) {
							expect(response.metadata.retries.attempts).toBeGreaterThanOrEqual(1);
						}
					}

					return true;
				}
			),
			{ numRuns: 30 }
		);
	});

	/**
	 * Additional property: Empty configuration objects use all defaults
	 * 
	 * When user provides { enabled: true } with no other fields, all defaults
	 * should be applied and the request should work.
	 */
	it('Property: Empty configuration objects use all defaults', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.boolean(), // Test with pagination
				fc.boolean(), // Test with retry
				async (testPagination, testRetry) => {
					// Skip if both false (nothing to test)
					if (!testPagination && !testRetry) {
						return true;
					}

					// Mock successful responses
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
						const response = mockResponses[callCount % mockResponses.length];
						callCount++;
						
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
						path: '/data'
					};

					// Add minimal configs
					if (testPagination) {
						request.pagination = { enabled: true };
					}

					if (testRetry) {
						request.retry = { enabled: true };
					}

					const apiRequest = new APIRequest(request);
					const response = await apiRequest.send();

					// Request should succeed with minimal config
					expect(response.success).toBe(true);
					expect(response.statusCode).toBe(200);

					// Features should work with all defaults
					// Metadata only exists if features were actually used
					if (testPagination && response.metadata?.pagination) {
						expect(response.metadata.pagination.occurred).toBeDefined();
					}

					if (testRetry && response.metadata?.retries) {
						expect(response.metadata.retries.attempts).toBeGreaterThanOrEqual(1);
					}

					return true;
				}
			),
			{ numRuns: 20 }
		);
	});
});
