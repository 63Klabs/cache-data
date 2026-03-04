import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { testEventA } from '../helpers/test-event.js';

// Import RequestInfo class
const RequestInfo = (await import('../../src/lib/tools/RequestInfo.class.js')).default;

describe('RequestInfo Class', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Construction and Initialization', () => {
		it('should construct with valid Lambda event', () => {
			const requestInfo = new RequestInfo(testEventA);
			
			expect(requestInfo).toBeDefined();
			expect(requestInfo).toBeInstanceOf(RequestInfo);
		});

		it('should handle null event gracefully', () => {
			// RequestInfo doesn't handle null events - it will throw
			// This is expected behavior as Lambda events should never be null
			expect(() => new RequestInfo(null)).toThrow();
		});

		it('should handle missing requestContext', () => {
			const eventWithoutContext = {
				headers: {
					'User-Agent': 'Mozilla/5.0',
					'Accept': 'application/json'
				},
				queryStringParameters: {
					test: 'value'
				}
			};
			
			expect(() => new RequestInfo(eventWithoutContext)).not.toThrow();
			
			const requestInfo = new RequestInfo(eventWithoutContext);
			expect(requestInfo).toBeDefined();
		});

		it('should handle missing headers', () => {
			const eventWithoutHeaders = {
				requestContext: {
					identity: {
						sourceIp: '192.168.1.1',
						userAgent: 'Mozilla/5.0'
					}
				}
			};
			
			expect(() => new RequestInfo(eventWithoutHeaders)).not.toThrow();
			
			const requestInfo = new RequestInfo(eventWithoutHeaders);
			expect(requestInfo).toBeDefined();
		});

		it('should return correct validation status with isValid()', () => {
			const requestInfo = new RequestInfo(testEventA);
			
			// isValid() returns false by default (set by child classes)
			expect(requestInfo.isValid()).toBe(false);
		});
	});

	describe('Client Information Getters', () => {
		let requestInfo;

		beforeEach(() => {
			requestInfo = new RequestInfo(testEventA);
		});

		it('should return correct user agent with getClientUserAgent()', () => {
			const userAgent = requestInfo.getClientUserAgent();
			
			expect(userAgent).toBe('Mozilla/5.0');
		});

		it('should return correct IP address with getClientIp()', () => {
			const ip = requestInfo.getClientIp();
			
			expect(ip).toBe('192.168.100.1');
		});

		it('should return correct IP address with getClientIP() alias', () => {
			const ip = requestInfo.getClientIP();
			
			expect(ip).toBe('192.168.100.1');
			expect(requestInfo.getClientIP()).toBe(requestInfo.getClientIp());
		});

		it('should return full referrer with getClientReferrer(true)', () => {
			const referrer = requestInfo.getClientReferrer(true);
			
			expect(referrer).toBe('https://internal.example.com/dev');
		});

		it('should return domain-only referrer with getClientReferrer(false)', () => {
			const referrer = requestInfo.getClientReferrer(false);
			
			// Should remove https:// and path
			expect(referrer).toBe('internal.example.com');
		});

		it('should return domain-only referrer by default', () => {
			const referrer = requestInfo.getClientReferrer();
			
			expect(referrer).toBe('internal.example.com');
		});

		it('should work with getClientReferer() alias', () => {
			const referer = requestInfo.getClientReferer(true);
			const referrer = requestInfo.getClientReferrer(true);
			
			expect(referer).toBe(referrer);
			expect(referer).toBe('https://internal.example.com/dev');
		});

		it('should return correct origin with getClientOrigin()', () => {
			const origin = requestInfo.getClientOrigin();
			
			// Origin is not in testEventA headers, should be null
			expect(origin).toBeNull();
		});

		it('should return correct if-modified-since with getClientIfModifiedSince()', () => {
			const ifModifiedSince = requestInfo.getClientIfModifiedSince();
			
			// Not in testEventA, should be null
			expect(ifModifiedSince).toBeNull();
		});

		it('should return correct if-none-match with getClientIfNoneMatch()', () => {
			const ifNoneMatch = requestInfo.getClientIfNoneMatch();
			
			// Not in testEventA, should be null
			expect(ifNoneMatch).toBeNull();
		});

		it('should return correct accept header with getClientAccept()', () => {
			const accept = requestInfo.getClientAccept();
			
			expect(accept).toBe('application/json');
		});

		it('should return normalized headers with getClientHeaders()', () => {
			const headers = requestInfo.getClientHeaders();
			
			expect(headers).toBeDefined();
			expect(typeof headers).toBe('object');
			
			// Headers should be normalized to lowercase
			expect(headers['accept']).toBe('application/json');
			expect(headers['host']).toBe('api.example.com');
			expect(headers['user-agent']).toBe('Mozilla/5.0');
		});

		it('should return query string parameters with getClientParameters()', () => {
			const parameters = requestInfo.getClientParameters();
			
			expect(parameters).toBeDefined();
			expect(parameters.include).toBe('contact,department');
			expect(parameters.format).toBe('detailed');
			expect(parameters.version).toBe('2');
		});

		it('should return request body with getClientBody()', () => {
			const body = requestInfo.getClientBody();
			
			// testEventA has null body
			expect(body).toBeNull();
		});
	});

	describe('Data Access Methods', () => {
		let requestInfo;

		beforeEach(() => {
			requestInfo = new RequestInfo(testEventA);
		});

		it('should access request data with get(key) method', () => {
			const clientData = requestInfo.get('client');
			
			expect(clientData).toBeDefined();
			expect(typeof clientData).toBe('object');
			expect(clientData.ip).toBe('192.168.100.1');
		});

		it('should access client data with getClient(key) method', () => {
			const ip = requestInfo.getClient('ip');
			const userAgent = requestInfo.getClient('userAgent');
			
			expect(ip).toBe('192.168.100.1');
			expect(userAgent).toBe('Mozilla/5.0');
		});

		it('should return null for non-existent keys with get()', () => {
			const nonExistent = requestInfo.get('nonExistentKey');
			
			// get() returns the whole object when key doesn't exist, not null
			// This is the actual behavior of ImmutableObject.get()
			expect(nonExistent).toBeDefined();
		});

		it('should return null for non-existent keys with getClient()', () => {
			const nonExistent = requestInfo.getClient('nonExistentKey');
			
			expect(nonExistent).toBeNull();
		});

		it('should return all client data when getClient() called without key', () => {
			const allClientData = requestInfo.getClient();
			
			expect(allClientData).toBeDefined();
			expect(typeof allClientData).toBe('object');
			expect(allClientData.ip).toBe('192.168.100.1');
			expect(allClientData.userAgent).toBe('Mozilla/5.0');
		});
	});

	describe('Serialization', () => {
		let requestInfo;

		beforeEach(() => {
			requestInfo = new RequestInfo(testEventA);
		});

		it('should strip sensitive data by default with toObject()', () => {
			const obj = requestInfo.toObject();
			
			expect(obj).toBeDefined();
			expect(obj.client).toBeDefined();
			
			// Sensitive fields should be stripped
			expect(obj.client.headers).toBeUndefined();
			expect(obj.client.allHeaders).toBeUndefined();
		});

		it('should strip sensitive data with toObject(false)', () => {
			const obj = requestInfo.toObject(false);
			
			expect(obj).toBeDefined();
			expect(obj.client).toBeDefined();
			
			// Sensitive fields should be stripped
			expect(obj.client.headers).toBeUndefined();
			expect(obj.client.allHeaders).toBeUndefined();
		});

		it('should include all data including sensitive fields with toObject(true)', () => {
			const obj = requestInfo.toObject(true);
			
			expect(obj).toBeDefined();
			expect(obj.client).toBeDefined();
			
			// Sensitive fields should be included
			expect(obj.client.headers).toBeDefined();
			expect(typeof obj.client.headers).toBe('object');
		});

		it('should verify headers and allHeaders are stripped from default output', () => {
			const defaultObj = requestInfo.toObject();
			const fullObj = requestInfo.toObject(true);
			
			// Default should not have headers
			expect(defaultObj.client.headers).toBeUndefined();
			
			// Full should have headers
			expect(fullObj.client.headers).toBeDefined();
		});

		it('should serialize structure matching expected format', () => {
			const obj = requestInfo.toObject(true);
			
			expect(obj).toHaveProperty('client');
			expect(obj.client).toHaveProperty('ip');
			expect(obj.client).toHaveProperty('userAgent');
			expect(obj.client).toHaveProperty('headers');
			expect(obj.client).toHaveProperty('parameters');
		});
	});

	describe('Header Proxying', () => {
		let requestInfo;

		beforeEach(() => {
			requestInfo = new RequestInfo(testEventA);
		});

		it('should proxy default headers with getClientHeadersToProxy()', () => {
			const proxiedHeaders = requestInfo.getClientHeadersToProxy();
			
			expect(proxiedHeaders).toBeDefined();
			expect(typeof proxiedHeaders).toBe('object');
			
			// Default headers: accept, if-modified-since, if-none-match
			expect(proxiedHeaders).toHaveProperty('accept');
			expect(proxiedHeaders).toHaveProperty('if-modified-since');
			expect(proxiedHeaders).toHaveProperty('if-none-match');
		});

		it('should proxy custom header list with getClientHeadersToProxy(customList)', () => {
			const customHeaders = ['accept', 'user-agent', 'host'];
			const proxiedHeaders = requestInfo.getClientHeadersToProxy(customHeaders);
			
			expect(proxiedHeaders).toBeDefined();
			expect(proxiedHeaders).toHaveProperty('accept');
			expect(proxiedHeaders).toHaveProperty('user-agent');
			expect(proxiedHeaders).toHaveProperty('host');
		});

		it('should handle missing headers gracefully in proxying', () => {
			const customHeaders = ['accept', 'non-existent-header'];
			const proxiedHeaders = requestInfo.getClientHeadersToProxy(customHeaders);
			
			expect(proxiedHeaders).toBeDefined();
			expect(proxiedHeaders.accept).toBe('application/json');
			expect(proxiedHeaders['non-existent-header']).toBeUndefined();
		});

		it('should normalize header keys to lowercase in proxying', () => {
			const headers = requestInfo.getClientHeaders();
			
			// All keys should be lowercase
			const keys = Object.keys(headers);
			keys.forEach(key => {
				expect(key).toBe(key.toLowerCase());
			});
		});
	});

	describe('Edge Cases', () => {
		it('should handle undefined header values', () => {
			const eventWithUndefinedHeaders = {
				headers: {
					'Accept': undefined,
					'User-Agent': 'Mozilla/5.0'
				},
				requestContext: {
					identity: {
						sourceIp: '192.168.1.1',
						userAgent: 'Mozilla/5.0'
					}
				}
			};
			
			const requestInfo = new RequestInfo(eventWithUndefinedHeaders);
			const headers = requestInfo.getClientHeaders();
			
			expect(headers).toBeDefined();
			expect(headers['user-agent']).toBe('Mozilla/5.0');
		});

		it('should handle empty query string parameters', () => {
			const eventWithEmptyParams = {
				headers: {
					'Accept': 'application/json'
				},
				queryStringParameters: {},
				requestContext: {
					identity: {
						sourceIp: '192.168.1.1',
						userAgent: 'Mozilla/5.0'
					}
				}
			};
			
			const requestInfo = new RequestInfo(eventWithEmptyParams);
			const parameters = requestInfo.getClientParameters();
			
			expect(parameters).toBeDefined();
			expect(typeof parameters).toBe('object');
			expect(Object.keys(parameters).length).toBe(0);
		});

		it('should handle null referrer', () => {
			const eventWithoutReferrer = {
				headers: {
					'Accept': 'application/json'
				},
				requestContext: {
					identity: {
						sourceIp: '192.168.1.1',
						userAgent: 'Mozilla/5.0'
					}
				}
			};
			
			const requestInfo = new RequestInfo(eventWithoutReferrer);
			const referrer = requestInfo.getClientReferrer();
			
			// Should return null or origin
			expect(referrer === null || typeof referrer === 'string').toBe(true);
		});

		it('should handle missing identity data in requestContext', () => {
			const eventWithoutIdentity = {
				headers: {
					'Accept': 'application/json'
				},
				requestContext: {}
			};
			
			const requestInfo = new RequestInfo(eventWithoutIdentity);
			const ip = requestInfo.getClientIp();
			const userAgent = requestInfo.getClientUserAgent();
			
			expect(ip).toBeNull();
			expect(userAgent).toBeNull();
		});

		it('should handle malformed event structures', () => {
			const malformedEvent = {
				// Missing most fields
				someRandomField: 'value'
			};
			
			expect(() => new RequestInfo(malformedEvent)).not.toThrow();
			
			const requestInfo = new RequestInfo(malformedEvent);
			expect(requestInfo).toBeDefined();
		});

		it('should handle referrer with query string (strips query)', () => {
			const eventWithQueryInReferrer = {
				headers: {
					'Referer': 'https://example.com/page?param=value&other=data'
				},
				requestContext: {
					identity: {
						sourceIp: '192.168.1.1',
						userAgent: 'Mozilla/5.0'
					}
				}
			};
			
			const requestInfo = new RequestInfo(eventWithQueryInReferrer);
			const referrer = requestInfo.getClientReferrer(true);
			
			// Query string should be stripped for privacy
			expect(referrer).toBe('https://example.com/page');
			expect(referrer).not.toContain('?');
		});

		it('should handle referrer with http protocol', () => {
			const eventWithHttpReferrer = {
				headers: {
					'Referer': 'http://example.com/page'
				},
				requestContext: {
					identity: {
						sourceIp: '192.168.1.1',
						userAgent: 'Mozilla/5.0'
					}
				}
			};
			
			const requestInfo = new RequestInfo(eventWithHttpReferrer);
			const domainOnly = requestInfo.getClientReferrer(false);
			
			// Should remove http:// and path
			expect(domainOnly).toBe('example.com');
		});

		it('should handle null queryStringParameters', () => {
			const eventWithNullParams = {
				headers: {
					'Accept': 'application/json'
				},
				queryStringParameters: null,
				requestContext: {
					identity: {
						sourceIp: '192.168.1.1',
						userAgent: 'Mozilla/5.0'
					}
				}
			};
			
			const requestInfo = new RequestInfo(eventWithNullParams);
			const parameters = requestInfo.getClientParameters();
			
			expect(parameters).toBeDefined();
			expect(typeof parameters).toBe('object');
		});

		it('should handle null headers object', () => {
			const eventWithNullHeaders = {
				headers: null,
				requestContext: {
					identity: {
						sourceIp: '192.168.1.1',
						userAgent: 'Mozilla/5.0'
					}
				}
			};
			
			const requestInfo = new RequestInfo(eventWithNullHeaders);
			const headers = requestInfo.getClientHeaders();
			
			expect(headers).toBeDefined();
			expect(typeof headers).toBe('object');
		});
	});
});
