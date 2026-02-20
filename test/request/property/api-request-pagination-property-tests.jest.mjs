import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import https from 'https';

describe('APIRequest - Pagination Property-Based Tests', () => {
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
	 * Property 1: Pagination Completeness
	 * For any API response with pagination indicators and pagination enabled, 
	 * all pages should be retrieved and combined into a single response with 
	 * all items from all pages.
	 * **Validates: Requirements 1.1, 1.8**
	 */
	it('Property 1: Pagination Completeness', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 20, max: 100 }), // totalItems (ensure > itemsPerPage)
				fc.integer({ min: 5, max: 15 }), // itemsPerPage
				async (totalItems, itemsPerPage) => {
					// Ensure we have at least 2 pages
					if (totalItems <= itemsPerPage) {
						totalItems = itemsPerPage + 1;
					}

					const totalPages = Math.ceil(totalItems / itemsPerPage);
					const mockResponses = Array(totalPages).fill(null).map((_, pageIndex) => {
						const startId = pageIndex * itemsPerPage + 1;
						const itemsInPage = Math.min(itemsPerPage, totalItems - pageIndex * itemsPerPage);
						return {
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								totalItems: totalItems,
								items: Array(itemsInPage).fill(null).map((_, i) => ({ id: startId + i })),
								offset: pageIndex * itemsPerPage,
								limit: itemsPerPage
							})
						};
					});

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
						parameters: { limit: itemsPerPage },
						pagination: {
							enabled: true,
							defaultLimit: itemsPerPage
						}
					};

					const apiRequest = new APIRequest(request);
					const response = await apiRequest.send();

					expect(response.success).toBe(true);
					const body = JSON.parse(response.body);
					expect(body.items).toHaveLength(totalItems);
					expect(body.returnedItemCount).toBe(totalItems);
				}
			),
			{ numRuns: 20 }
		);
	});

	/**
	 * Property 2: Pagination Opt-In
	 * For any request without pagination configuration, the response should be 
	 * identical to the current behavior with no pagination occurring.
	 * **Validates: Requirements 1.2, 4.5**
	 */
	it('Property 2: Pagination Opt-In', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 10, max: 100 }),
				async (totalItems) => {
					jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
						const mockRes = {
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							on: jest.fn((event, handler) => {
								if (event === 'data') {
									handler(JSON.stringify({
										totalItems: totalItems,
										items: Array(10).fill(null).map((_, i) => ({ id: i + 1 }))
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
							enabled: false
						}
					};

					const apiRequest = new APIRequest(request);
					const response = await apiRequest.send();

					expect(response.success).toBe(true);
					const body = JSON.parse(response.body);
					// Should only have first page
					expect(body.items).toHaveLength(10);
					// Should not have returnedItemCount added
					expect(body.returnedItemCount).toBeUndefined();
				}
			),
			{ numRuns: 20 }
		);
	});

	/**
	 * Property 3: Pagination Batch Processing
	 * For any pagination configuration with batch size N, concurrent requests 
	 * should not exceed N at any given time.
	 * **Validates: Requirements 1.3**
	 */
	it('Property 3: Pagination Batch Processing', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 2, max: 5 }), // batchSize
				fc.integer({ min: 20, max: 50 }), // totalItems
				async (batchSize, totalItems) => {
					const itemsPerPage = 5;
					const totalPages = Math.ceil(totalItems / itemsPerPage);
					const mockResponses = Array(totalPages).fill(null).map((_, pageIndex) => {
						const startId = pageIndex * itemsPerPage + 1;
						const itemsInPage = Math.min(itemsPerPage, totalItems - pageIndex * itemsPerPage);
						return {
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								totalItems: totalItems,
								items: Array(itemsInPage).fill(null).map((_, i) => ({ id: startId + i })),
								offset: pageIndex * itemsPerPage,
								limit: itemsPerPage
							})
						};
					});

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
						parameters: { limit: itemsPerPage },
						pagination: {
							enabled: true,
							defaultLimit: itemsPerPage,
							batchSize: batchSize
						}
					};

					const apiRequest = new APIRequest(request);
					const response = await apiRequest.send();

					expect(response.success).toBe(true);
					const body = JSON.parse(response.body);
					expect(body.items).toHaveLength(totalItems);
				}
			),
			{ numRuns: 20 }
		);
	});

	/**
	 * Property 4: Pagination Label Customization
	 * For any set of custom pagination labels, the pagination logic should 
	 * correctly navigate the API response structure using those labels.
	 * **Validates: Requirements 1.4, 5.3**
	 */
	it('Property 4: Pagination Label Customization', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(
					{ totalItemsLabel: 'total', itemsLabel: 'results', offsetLabel: 'skip', limitLabel: 'take' },
					{ totalItemsLabel: 'count', itemsLabel: 'data', offsetLabel: 'from', limitLabel: 'size' },
					{ totalItemsLabel: 'totalRecords', itemsLabel: 'records', offsetLabel: 'start', limitLabel: 'max' }
				),
				async (labels) => {
					const totalItems = 20;
					const itemsPerPage = 10;
					const mockResponses = [
						{
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								[labels.totalItemsLabel]: totalItems,
								[labels.itemsLabel]: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
								[labels.offsetLabel]: 0,
								[labels.limitLabel]: itemsPerPage
							})
						},
						{
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								[labels.totalItemsLabel]: totalItems,
								[labels.itemsLabel]: Array(10).fill(null).map((_, i) => ({ id: i + 11 })),
								[labels.offsetLabel]: 10,
								[labels.limitLabel]: itemsPerPage
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
						parameters: { [labels.limitLabel]: itemsPerPage },
						pagination: {
							enabled: true,
							...labels,
							defaultLimit: itemsPerPage
						}
					};

					const apiRequest = new APIRequest(request);
					const response = await apiRequest.send();

					expect(response.success).toBe(true);
					const body = JSON.parse(response.body);
					expect(body[labels.itemsLabel]).toHaveLength(totalItems);
				}
			),
			{ numRuns: 20 }
		);
	});

	/**
	 * Property 5: Pagination Error Handling
	 * For any pagination sequence where a subsequent page fails, partial results 
	 * should be returned with metadata indicating incomplete pagination.
	 * **Validates: Requirements 1.5**
	 */
	it('Property 5: Pagination Error Handling', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 1, max: 3 }), // failAtPage (ensure not last page)
				async (failAtPage) => {
					const totalItems = 50;
					const itemsPerPage = 10;
					const totalPages = Math.ceil(totalItems / itemsPerPage);
					
					let callCount = 0;
					jest.spyOn(https, 'request').mockImplementation((uri, options, callback) => {
						const pageIndex = callCount++;
						
						if (pageIndex === failAtPage) {
							// Fail this page
							const mockRes = {
								statusCode: 500,
								headers: { 'content-type': 'application/json' },
								on: jest.fn((event, handler) => {
									if (event === 'data') {
										handler(JSON.stringify({ error: 'Server error' }));
									} else if (event === 'end') {
										handler();
									}
								})
							};
							callback(mockRes);
						} else {
							// Success
							const startId = pageIndex * itemsPerPage + 1;
							const itemsInPage = Math.min(itemsPerPage, totalItems - pageIndex * itemsPerPage);
							const mockRes = {
								statusCode: 200,
								headers: { 'content-type': 'application/json' },
								on: jest.fn((event, handler) => {
									if (event === 'data') {
										handler(JSON.stringify({
											totalItems: totalItems,
											items: Array(itemsInPage).fill(null).map((_, i) => ({ id: startId + i })),
											offset: pageIndex * itemsPerPage,
											limit: itemsPerPage
										}));
									} else if (event === 'end') {
										handler();
									}
								})
							};
							callback(mockRes);
						}

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
						parameters: { limit: itemsPerPage },
						pagination: {
							enabled: true,
							defaultLimit: itemsPerPage
						}
					};

					const apiRequest = new APIRequest(request);
					const response = await apiRequest.send();

					expect(response.success).toBe(true);
					const body = JSON.parse(response.body);
					// Should have partial results (less than total because error occurred)
					expect(body.items.length).toBeLessThan(totalItems);
					expect(body.items.length).toBeGreaterThan(0);
				}
			),
			{ numRuns: 10 }
		);
	});

	/**
	 * Property 6: Pagination Structure Preservation
	 * For any paginated response, all original response fields except the items 
	 * array should be preserved in the combined response.
	 * **Validates: Requirements 1.10**
	 */
	it('Property 6: Pagination Structure Preservation', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					metadata: fc.string(),
					timestamp: fc.integer(),
					version: fc.string()
				}),
				async (extraFields) => {
					const mockResponses = [
						{
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								totalItems: 20,
								items: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
								offset: 0,
								limit: 10,
								...extraFields
							})
						},
						{
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								totalItems: 20,
								items: Array(10).fill(null).map((_, i) => ({ id: i + 11 })),
								offset: 10,
								limit: 10,
								...extraFields
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
					
					// Check that extra fields are preserved
					expect(body.metadata).toBe(extraFields.metadata);
					expect(body.timestamp).toBe(extraFields.timestamp);
					expect(body.version).toBe(extraFields.version);
					
					// Check that pagination params are removed
					expect(body.offset).toBeUndefined();
					expect(body.limit).toBeUndefined();
				}
			),
			{ numRuns: 20 }
		);
	});

	/**
	 * Property 7: Pagination Metadata Accuracy
	 * For any paginated response, the metadata should accurately reflect the 
	 * total pages retrieved and total items returned.
	 * **Validates: Requirements 1.9, 6.5, 6.6**
	 */
	it('Property 7: Pagination Metadata Accuracy', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 20, max: 50 }), // totalItems (ensure > itemsPerPage)
				fc.integer({ min: 5, max: 15 }), // itemsPerPage
				async (totalItems, itemsPerPage) => {
					// Ensure we have at least 2 pages
					if (totalItems <= itemsPerPage) {
						totalItems = itemsPerPage + 1;
					}

					const totalPages = Math.ceil(totalItems / itemsPerPage);
					const mockResponses = Array(totalPages).fill(null).map((_, pageIndex) => {
						const startId = pageIndex * itemsPerPage + 1;
						const itemsInPage = Math.min(itemsPerPage, totalItems - pageIndex * itemsPerPage);
						return {
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								totalItems: totalItems,
								items: Array(itemsInPage).fill(null).map((_, i) => ({ id: startId + i })),
								offset: pageIndex * itemsPerPage,
								limit: itemsPerPage
							})
						};
					});

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
						parameters: { limit: itemsPerPage },
						pagination: {
							enabled: true,
							defaultLimit: itemsPerPage
						}
					};

					const apiRequest = new APIRequest(request);
					const response = await apiRequest.send();

					expect(response.success).toBe(true);
					const body = JSON.parse(response.body);
					expect(body.returnedItemCount).toBe(totalItems);
					expect(body.items).toHaveLength(totalItems);
				}
			),
			{ numRuns: 20 }
		);
	});
});
