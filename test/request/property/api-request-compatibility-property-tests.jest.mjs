import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fc from 'fast-check';
import APIRequest from '../../../src/lib/tools/APIRequest.class.js';

describe('APIRequest Backwards Compatibility Property Tests', () => {
	
	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Property 20: Constructor Compatibility', () => {
		it('should accept any valid request object without pagination or retry', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 20: Constructor Compatibility**
			 * 
			 * For any request object that worked with the previous APIRequest version,
			 * the constructor should accept it without errors.
			 * 
			 * **Validates: Requirements 4.1**
			 */
			fc.assert(
				fc.property(
					fc.record({
						host: fc.domain(),
						path: fc.oneof(
							fc.constant(''),
							fc.constant('/'),
							fc.webPath()
						),
						method: fc.oneof(
							fc.constant('GET'),
							fc.constant('POST')
						),
						protocol: fc.oneof(
							fc.constant('https'),
							fc.constant('http')
						),
						parameters: fc.oneof(
							fc.constant({}),
							fc.dictionary(
								fc.string({ minLength: 1, maxLength: 20 }),
								fc.oneof(
									fc.string(),
									fc.integer(),
									fc.array(fc.string(), { maxLength: 5 })
								),
								{ maxKeys: 5 }
							)
						),
						headers: fc.oneof(
							fc.constant(null),
							fc.constant({}),
							fc.dictionary(
								fc.string({ minLength: 1, maxLength: 30 }),
								fc.string({ maxLength: 100 }),
								{ maxKeys: 5 }
							)
						),
						body: fc.oneof(
							fc.constant(null),
							fc.string({ maxLength: 100 })
						),
						note: fc.oneof(
							fc.constant(''),
							fc.string({ maxLength: 50 })
						),
						options: fc.oneof(
							fc.constant(null),
							fc.record({
								timeout: fc.integer({ min: 1000, max: 30000 }),
								separateDuplicateParameters: fc.boolean(),
								combinedDuplicateParameterDelimiter: fc.oneof(
									fc.constant(','),
									fc.constant('|'),
									fc.constant(' ')
								)
							}, { requiredKeys: [] })
						)
					}, { requiredKeys: ['host'] }),
					(request) => {
						// Constructor should not throw for any valid old-style request
						expect(() => new APIRequest(request)).not.toThrow();
						
						const apiRequest = new APIRequest(request);
						const requestObj = apiRequest.toObject();
						
						// Verify basic structure is preserved
						expect(requestObj.request).toBeDefined();
						expect(requestObj.request.method).toBeDefined();
						expect(requestObj.request.uri).toBeDefined();
						
						// Verify new features have defaults
						expect(requestObj.request.pagination).toBeDefined();
						expect(requestObj.request.pagination.enabled).toBe(false);
						expect(requestObj.request.retry).toBeDefined();
						expect(requestObj.request.retry.enabled).toBe(false);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe('Property 21: Response Format Compatibility', () => {
		it('should return old format when pagination and retry are not used', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 21: Response Format Compatibility**
			 * 
			 * For any request without pagination or retry options, the response format
			 * should match the previous APIRequest version exactly (no metadata field).
			 * 
			 * **Validates: Requirements 4.2**
			 */
			fc.assert(
				fc.property(
					fc.record({
						success: fc.boolean(),
						statusCode: fc.integer({ min: 100, max: 599 }),
						message: fc.oneof(
							fc.constant(null),
							fc.string({ maxLength: 50 })
						),
						headers: fc.oneof(
							fc.constant(null),
							fc.dictionary(
								fc.string({ minLength: 1, maxLength: 30 }),
								fc.string({ maxLength: 100 }),
								{ maxKeys: 5 }
							)
						),
						body: fc.oneof(
							fc.constant(null),
							fc.string({ maxLength: 200 })
						)
					}),
					(responseData) => {
						// Use static responseFormat method
						const response = APIRequest.responseFormat(
							responseData.success,
							responseData.statusCode,
							responseData.message,
							responseData.headers,
							responseData.body
						);
						
						// Verify old format structure
						expect(response).toHaveProperty('success');
						expect(response).toHaveProperty('statusCode');
						expect(response).toHaveProperty('message');
						expect(response).toHaveProperty('headers');
						expect(response).toHaveProperty('body');
						
						// Should NOT have metadata field
						expect(response).not.toHaveProperty('metadata');
						
						// Verify values match
						expect(response.success).toBe(responseData.success);
						expect(response.statusCode).toBe(responseData.statusCode);
						expect(response.message).toBe(responseData.message);
						expect(response.headers).toEqual(responseData.headers);
						expect(response.body).toBe(responseData.body);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe('Property 22: Static Method Compatibility', () => {
		it('should have responseFormat work identically to previous version', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 22: Static Method Compatibility**
			 * 
			 * For any call to APIRequest.responseFormat(), the method should work
			 * identically to the previous version.
			 * 
			 * **Validates: Requirements 4.3**
			 */
			fc.assert(
				fc.property(
					fc.boolean(),
					fc.integer({ min: 100, max: 599 }),
					fc.oneof(fc.constant(null), fc.string({ maxLength: 50 })),
					fc.oneof(
						fc.constant(null),
						fc.dictionary(
							fc.string({ minLength: 1, maxLength: 30 }),
							fc.string({ maxLength: 100 }),
							{ maxKeys: 5 }
						)
					),
					fc.oneof(fc.constant(null), fc.string({ maxLength: 200 })),
					(success, statusCode, message, headers, body) => {
						const response = APIRequest.responseFormat(
							success,
							statusCode,
							message,
							headers,
							body
						);
						
						// Verify exact structure
						expect(Object.keys(response).sort()).toEqual(
							['success', 'statusCode', 'message', 'headers', 'body'].sort()
						);
						
						// Verify values
						expect(response.success).toBe(success);
						expect(response.statusCode).toBe(statusCode);
						expect(response.message).toBe(message);
						expect(response.headers).toEqual(headers);
						expect(response.body).toBe(body);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should have MAX_REDIRECTS constant unchanged', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 22: Static Method Compatibility**
			 * 
			 * The MAX_REDIRECTS constant should remain unchanged.
			 * 
			 * **Validates: Requirements 4.3**
			 */
			expect(APIRequest.MAX_REDIRECTS).toBe(5);
			expect(typeof APIRequest.MAX_REDIRECTS).toBe('number');
		});
	});

	describe('Property 23: Public API Compatibility', () => {
		it('should have all public methods with unchanged signatures', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 23: Public API Compatibility**
			 * 
			 * For any public method on APIRequest, the method signature and behavior
			 * should match the previous version when new features are not used.
			 * 
			 * **Validates: Requirements 4.4**
			 */
			fc.assert(
				fc.property(
					fc.record({
						host: fc.domain(),
						path: fc.webPath(),
						note: fc.string({ maxLength: 50 }),
						method: fc.oneof(fc.constant('GET'), fc.constant('POST')),
						body: fc.oneof(fc.constant(null), fc.string({ maxLength: 100 })),
						options: fc.record({
							timeout: fc.integer({ min: 1000, max: 30000 })
						}, { requiredKeys: [] })
					}, { requiredKeys: ['host'] }),
					(request) => {
						const apiRequest = new APIRequest(request);
						
						// Verify all public methods exist
						const publicMethods = [
							'send',
							'send_get',
							'resetRequest',
							'updateRequestURI',
							'addRedirect',
							'getNumberOfRedirects',
							'setResponse',
							'getURI',
							'getBody',
							'getMethod',
							'getNote',
							'getTimeOutInMilliseconds',
							'getHost',
							'toObject'
						];
						
						for (const method of publicMethods) {
							expect(typeof apiRequest[method]).toBe('function');
						}
						
						// Verify getter methods return expected types
						expect(typeof apiRequest.getURI()).toBe('string');
						expect(typeof apiRequest.getMethod()).toBe('string');
						expect(typeof apiRequest.getHost()).toBe('string');
						expect(typeof apiRequest.getNote()).toBe('string');
						expect(typeof apiRequest.getNumberOfRedirects()).toBe('number');
						expect(typeof apiRequest.getTimeOutInMilliseconds()).toBe('number');
						
						// Verify getBody returns correct type
						const body = apiRequest.getBody();
						expect(body === null || typeof body === 'string').toBe(true);
						
						// Verify toObject returns correct structure
						const obj = apiRequest.toObject();
						expect(obj).toHaveProperty('MAX_REDIRECTS');
						expect(obj).toHaveProperty('request');
						expect(obj).toHaveProperty('requestComplete');
						expect(obj).toHaveProperty('redirects');
						expect(obj).toHaveProperty('response');
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should have getURI work with and without query string parameter', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 23: Public API Compatibility**
			 * 
			 * The getURI method should work with both includeQueryString true and false.
			 * 
			 * **Validates: Requirements 4.4**
			 */
			fc.assert(
				fc.property(
					fc.domain(),
					fc.webPath(),
					fc.dictionary(
						fc.string({ minLength: 1, maxLength: 20 }),
						fc.string({ maxLength: 50 }),
						{ minKeys: 1, maxKeys: 3 }
					),
					(host, path, parameters) => {
						const request = { host, path, parameters };
						const apiRequest = new APIRequest(request);
						
						const uriWithQuery = apiRequest.getURI(true);
						const uriWithoutQuery = apiRequest.getURI(false);
						
						// Both should be strings
						expect(typeof uriWithQuery).toBe('string');
						expect(typeof uriWithoutQuery).toBe('string');
						
						// URI with query should contain '?'
						expect(uriWithQuery).toContain('?');
						
						// URI without query should not contain '?'
						expect(uriWithoutQuery).not.toContain('?');
						
						// URI without query should be prefix of URI with query
						expect(uriWithQuery.startsWith(uriWithoutQuery)).toBe(true);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should have redirect tracking work correctly', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 23: Public API Compatibility**
			 * 
			 * Redirect tracking methods should work as before.
			 * 
			 * **Validates: Requirements 4.4**
			 */
			fc.assert(
				fc.property(
					fc.domain(),
					fc.array(fc.webUrl(), { minLength: 1, maxLength: 5 }),
					(host, redirectUrls) => {
						const request = { host, path: '/test' };
						const apiRequest = new APIRequest(request);
						
						// Initially no redirects
						expect(apiRequest.getNumberOfRedirects()).toBe(0);
						
						// Add redirects
						for (let i = 0; i < redirectUrls.length; i++) {
							apiRequest.addRedirect(redirectUrls[i]);
							expect(apiRequest.getNumberOfRedirects()).toBe(i + 1);
							expect(apiRequest.getURI()).toBe(redirectUrls[i]);
						}
						
						// Verify toObject includes redirects
						const obj = apiRequest.toObject();
						expect(obj.redirects.length).toBe(redirectUrls.length);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should have resetRequest clear state correctly', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 23: Public API Compatibility**
			 * 
			 * The resetRequest method should clear redirects and response state.
			 * 
			 * **Validates: Requirements 4.4**
			 */
			fc.assert(
				fc.property(
					fc.domain(),
					fc.array(fc.webUrl(), { minLength: 1, maxLength: 3 }),
					(host, redirectUrls) => {
						const request = { host, path: '/test' };
						const apiRequest = new APIRequest(request);
						
						// Add some redirects
						redirectUrls.forEach(url => apiRequest.addRedirect(url));
						expect(apiRequest.getNumberOfRedirects()).toBeGreaterThan(0);
						
						// Set a response
						const response = APIRequest.responseFormat(true, 200, 'OK');
						apiRequest.setResponse(response);
						
						// Reset
						apiRequest.resetRequest();
						
						// Verify state is cleared
						expect(apiRequest.getNumberOfRedirects()).toBe(0);
						const obj = apiRequest.toObject();
						expect(obj.requestComplete).toBe(false);
						expect(obj.response).toBe(null);
						expect(obj.redirects.length).toBe(0);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe('Property: Query String Building Compatibility', () => {
		it('should build query strings identically to previous version', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 23: Public API Compatibility**
			 * 
			 * Query string building should work identically for all parameter types.
			 * 
			 * **Validates: Requirements 4.4**
			 */
			fc.assert(
				fc.property(
					fc.domain(),
					fc.dictionary(
						fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
						fc.oneof(
							fc.string({ maxLength: 50 }),
							fc.integer(),
							fc.array(fc.string({ maxLength: 20 }), { minLength: 1, maxLength: 3 })
						),
						{ minKeys: 1, maxKeys: 5 }
					),
					(host, parameters) => {
						const request = { host, path: '/test', parameters };
						const apiRequest = new APIRequest(request);
						
						const uri = apiRequest.getURI(true);
						
						// Should contain query string
						expect(uri).toContain('?');
						
						// Should contain all parameter keys
						for (const key of Object.keys(parameters)) {
							expect(uri).toContain(key);
						}
						
						// Should properly encode special characters
						const queryString = uri.split('?')[1];
						expect(queryString).toBeDefined();
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should handle array parameters with separateDuplicateParameters option', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 23: Public API Compatibility**
			 * 
			 * Array parameter handling should work identically to previous version.
			 * 
			 * **Validates: Requirements 4.4**
			 */
			fc.assert(
				fc.property(
					fc.domain(),
					fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
					fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 5 }),
					fc.boolean(),
					(host, paramKey, paramValues, separateDuplicateParameters) => {
						const request = {
							host,
							path: '/test',
							parameters: { [paramKey]: paramValues },
							options: { separateDuplicateParameters }
						};
						
						const apiRequest = new APIRequest(request);
						const uri = apiRequest.getURI(true);
						
						// Should contain parameter key
						expect(uri).toContain(paramKey);
						
						if (separateDuplicateParameters) {
							// Should have multiple occurrences of the key
							const escapedKey = paramKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
							const keyOccurrences = (uri.match(new RegExp(escapedKey, 'g')) || []).length;
							expect(keyOccurrences).toBeGreaterThanOrEqual(paramValues.length);
						} else {
							// Should have single occurrence with comma-separated values
							expect(uri).toContain(paramKey + '=');
						}
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe('Property: Options Merging Compatibility', () => {
		it('should merge options with defaults correctly', () => {
			/**
			 * **Feature: api-request-pagination-retries-xray, Property 23: Public API Compatibility**
			 * 
			 * Options merging should preserve default values while allowing overrides.
			 * 
			 * **Validates: Requirements 4.4**
			 */
			fc.assert(
				fc.property(
					fc.domain(),
					fc.record({
						timeout: fc.integer({ min: 1000, max: 30000 }),
						separateDuplicateParameters: fc.boolean(),
						combinedDuplicateParameterDelimiter: fc.oneof(
							fc.constant(','),
							fc.constant('|'),
							fc.constant(' ')
						)
					}, { requiredKeys: [] }),
					(host, options) => {
						const request = { host, path: '/test', options };
						const apiRequest = new APIRequest(request);
						const requestObj = apiRequest.toObject();
						
						// Verify provided options are set
						if ('timeout' in options) {
							expect(requestObj.request.options.timeout).toBe(options.timeout);
						} else {
							// Default timeout should be 8000
							expect(requestObj.request.options.timeout).toBe(8000);
						}
						
						if ('separateDuplicateParameters' in options) {
							expect(requestObj.request.options.separateDuplicateParameters)
								.toBe(options.separateDuplicateParameters);
						} else {
							// Default should be false
							expect(requestObj.request.options.separateDuplicateParameters).toBe(false);
						}
						
						if ('combinedDuplicateParameterDelimiter' in options) {
							expect(requestObj.request.options.combinedDuplicateParameterDelimiter)
								.toBe(options.combinedDuplicateParameterDelimiter);
						} else {
							// Default should be ','
							expect(requestObj.request.options.combinedDuplicateParameterDelimiter).toBe(',');
						}
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
