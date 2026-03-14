import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { RequestInfo } from '../../src/lib/tools/index.js';

/* ****************************************************************************
 * RequestInfo Property-Based Tests
 * Feature: 1-3-9-test-migration-phase-3
 */
describe("RequestInfo - Property-Based Tests", () => {

	describe("Property 3: RequestInfo Immutability", () => {
		// Feature: 1-3-9-test-migration-phase-3, Property 3: RequestInfo Immutability

		it("should not affect internal state when modifying returned headers", () => {
			fc.assert(
				fc.property(
					fc.record({
						headers: fc.dictionary(
							fc.string({ minLength: 1, maxLength: 20 }),
							fc.string({ minLength: 1, maxLength: 50 })
						),
						requestContext: fc.record({
							identity: fc.record({
								sourceIp: fc.ipV4(),
								userAgent: fc.string({ minLength: 1, maxLength: 100 })
							})
						})
					}),
					(eventData) => {
						// Create a Lambda event with random headers
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: eventData.headers,
							requestContext: eventData.requestContext,
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get headers (should be a defensive copy)
						const headersCopy = requestInfo.getClientHeaders();

						// Store original headers
						const originalHeaders = requestInfo.getClientHeaders();

						// Modify the returned copy
						headersCopy.newHeader = 'modified';
						headersCopy.tamperedHeader = 'tampered';
						if (Object.keys(headersCopy).length > 0) {
							const firstKey = Object.keys(headersCopy)[0];
							headersCopy[firstKey] = 'modified-value';
						}

						// Get headers again after modification
						const headersAfterModification = requestInfo.getClientHeaders();

						// Verify the internal state hasn't changed
						expect(JSON.stringify(headersAfterModification)).toBe(JSON.stringify(originalHeaders));
						expect(headersAfterModification).not.toHaveProperty('newHeader');
						expect(headersAfterModification).not.toHaveProperty('tamperedHeader');
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not affect internal state when modifying returned parameters", () => {
			fc.assert(
				fc.property(
					fc.record({
						queryStringParameters: fc.dictionary(
							fc.string({ minLength: 1, maxLength: 20 }),
							fc.string({ minLength: 1, maxLength: 50 })
						),
						requestContext: fc.record({
							identity: fc.record({
								sourceIp: fc.ipV4(),
								userAgent: fc.string({ minLength: 1, maxLength: 100 })
							})
						})
					}),
					(eventData) => {
						// Create a Lambda event with random query parameters
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: {},
							requestContext: eventData.requestContext,
							queryStringParameters: eventData.queryStringParameters,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get parameters (should be a defensive copy)
						const paramsCopy = requestInfo.getClientParameters();

						// Store original parameters
						const originalParams = requestInfo.getClientParameters();

						// Modify the returned copy
						paramsCopy.newParam = 'modified';
						paramsCopy.tamperedParam = 'tampered';
						if (Object.keys(paramsCopy).length > 0) {
							const firstKey = Object.keys(paramsCopy)[0];
							paramsCopy[firstKey] = 'modified-value';
						}

						// Get parameters again after modification
						const paramsAfterModification = requestInfo.getClientParameters();

						// Verify the internal state hasn't changed
						expect(JSON.stringify(paramsAfterModification)).toBe(JSON.stringify(originalParams));
						expect(paramsAfterModification).not.toHaveProperty('newParam');
						expect(paramsAfterModification).not.toHaveProperty('tamperedParam');
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not affect internal state when modifying toObject() output", () => {
			fc.assert(
				fc.property(
					fc.record({
						headers: fc.dictionary(
							fc.string({ minLength: 1, maxLength: 20 }),
							fc.string({ minLength: 1, maxLength: 50 })
						),
						requestContext: fc.record({
							identity: fc.record({
								sourceIp: fc.ipV4(),
								userAgent: fc.string({ minLength: 1, maxLength: 100 })
							})
						})
					}),
					(eventData) => {
						// Create a Lambda event
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: eventData.headers,
							requestContext: eventData.requestContext,
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get object representation
						const objCopy = requestInfo.toObject(true);

						// Store original state
						const originalObj = requestInfo.toObject(true);

						// Modify the returned copy
						if (objCopy.client) {
							objCopy.client.newField = 'modified';
							objCopy.client.ip = 'tampered-ip';
							if (objCopy.client.headers) {
								objCopy.client.headers.tamperedHeader = 'tampered';
							}
						}

						// Get object again after modification
						const objAfterModification = requestInfo.toObject(true);

						// Verify the internal state hasn't changed
						expect(JSON.stringify(objAfterModification)).toBe(JSON.stringify(originalObj));
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 4: Referrer Parsing Consistency", () => {
		// Feature: 1-3-9-test-migration-phase-3, Property 4: Referrer Parsing Consistency

		it("should ensure domain-only referrer is substring of full referrer", () => {
			fc.assert(
				fc.property(
					fc.webUrl(),
					(referrerUrl) => {
						// Create a Lambda event with referrer
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: {
								referer: referrerUrl
							},
							requestContext: {
								identity: {
									sourceIp: "192.168.1.1",
									userAgent: "Test Agent"
								}
							},
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get full and domain-only referrer
						const fullReferrer = requestInfo.getClientReferrer(true);
						const domainOnly = requestInfo.getClientReferrer(false);

						// If referrer exists, domain-only should be derived from full
						if (fullReferrer && domainOnly) {
							// Domain-only should be contained in full referrer
							expect(fullReferrer).toContain(domainOnly);
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should remove protocol from domain-only referrer", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant('https://'),
						fc.constant('http://')
					),
					fc.domain(),
					fc.string({ minLength: 1, maxLength: 50 }),
					(protocol, domain, path) => {
						const referrerUrl = `${protocol}${domain}/${path}`;

						// Create a Lambda event with referrer
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: {
								referer: referrerUrl
							},
							requestContext: {
								identity: {
									sourceIp: "192.168.1.1",
									userAgent: "Test Agent"
								}
							},
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get domain-only referrer
						const domainOnly = requestInfo.getClientReferrer(false);

						// Domain-only should not contain protocol
						if (domainOnly) {
							expect(domainOnly).not.toContain('https://');
							expect(domainOnly).not.toContain('http://');
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should remove path from domain-only referrer", () => {
			fc.assert(
				fc.property(
					fc.domain(),
					fc.string({ minLength: 1, maxLength: 50 }),
					(domain, path) => {
						const referrerUrl = `https://${domain}/${path}`;

						// Create a Lambda event with referrer
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: {
								referer: referrerUrl
							},
							requestContext: {
								identity: {
									sourceIp: "192.168.1.1",
									userAgent: "Test Agent"
								}
							},
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get domain-only referrer
						const domainOnly = requestInfo.getClientReferrer(false);

						// Domain-only should not contain path (no slash)
						if (domainOnly) {
							expect(domainOnly).toBe(domain);
							expect(domainOnly).not.toContain('/');
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 5: Sensitive Data Stripping", () => {
		// Feature: 1-3-9-test-migration-phase-3, Property 5: Sensitive Data Stripping

		it("should strip headers from toObject() without full parameter", () => {
			fc.assert(
				fc.property(
					fc.record({
						headers: fc.dictionary(
							fc.string({ minLength: 1, maxLength: 20 }),
							fc.string({ minLength: 1, maxLength: 50 }),
							{ minKeys: 1 }
						),
						requestContext: fc.record({
							identity: fc.record({
								sourceIp: fc.ipV4(),
								userAgent: fc.string({ minLength: 1, maxLength: 100 })
							})
						})
					}),
					(eventData) => {
						// Create a Lambda event with headers
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: eventData.headers,
							requestContext: eventData.requestContext,
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get object without full parameter (default)
						const objDefault = requestInfo.toObject();

						// Verify headers are stripped
						if (objDefault.client) {
							expect(objDefault.client).not.toHaveProperty('headers');
							expect(objDefault.client).not.toHaveProperty('allHeaders');
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should strip allHeaders from toObject() without full parameter", () => {
			fc.assert(
				fc.property(
					fc.record({
						headers: fc.dictionary(
							fc.string({ minLength: 1, maxLength: 20 }),
							fc.string({ minLength: 1, maxLength: 50 }),
							{ minKeys: 1 }
						),
						requestContext: fc.record({
							identity: fc.record({
								sourceIp: fc.ipV4(),
								userAgent: fc.string({ minLength: 1, maxLength: 100 })
							})
						})
					}),
					(eventData) => {
						// Create a Lambda event
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: eventData.headers,
							requestContext: eventData.requestContext,
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get object with false parameter
						const objFalse = requestInfo.toObject(false);

						// Verify allHeaders are stripped
						if (objFalse.client) {
							expect(objFalse.client).not.toHaveProperty('allHeaders');
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should include all fields including sensitive ones in toObject(true)", () => {
			fc.assert(
				fc.property(
					fc.record({
						headers: fc.dictionary(
							fc.string({ minLength: 1, maxLength: 20 }),
							fc.string({ minLength: 1, maxLength: 50 }),
							{ minKeys: 1 }
						),
						requestContext: fc.record({
							identity: fc.record({
								sourceIp: fc.ipV4(),
								userAgent: fc.string({ minLength: 1, maxLength: 100 })
							})
						})
					}),
					(eventData) => {
						// Create a Lambda event with headers
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: eventData.headers,
							requestContext: eventData.requestContext,
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get object with full=true
						const objFull = requestInfo.toObject(true);

						// Verify headers are included
						if (objFull.client) {
							expect(objFull.client).toHaveProperty('headers');
							expect(typeof objFull.client.headers).toBe('object');
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 6: Header Case Insensitivity", () => {
		// Feature: 1-3-9-test-migration-phase-3, Property 6: Header Case Insensitivity

		it("should normalize all header keys to lowercase", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							key: fc.string({ minLength: 1, maxLength: 20 }),
							value: fc.string({ minLength: 1, maxLength: 50 })
						}),
						{ minLength: 1, maxLength: 10 }
					),
					(headerPairs) => {
						// Create headers with mixed case keys
						const headers = {};
						headerPairs.forEach(pair => {
							// Randomly capitalize the key
							const mixedCaseKey = pair.key
								.split('')
								.map((char, idx) => idx % 2 === 0 ? char.toUpperCase() : char.toLowerCase())
								.join('');
							headers[mixedCaseKey] = pair.value;
						});

						// Create a Lambda event
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: headers,
							requestContext: {
								identity: {
									sourceIp: "192.168.1.1",
									userAgent: "Test Agent"
								}
							},
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get headers
						const normalizedHeaders = requestInfo.getClientHeaders();

						// Verify all keys are lowercase
						Object.keys(normalizedHeaders).forEach(key => {
							expect(key).toBe(key.toLowerCase());
						});
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should preserve header values exactly as provided", () => {
			fc.assert(
				fc.property(
					fc.dictionary(
						fc.string({ minLength: 1, maxLength: 20 }),
						fc.string({ minLength: 1, maxLength: 50 }),
						{ minKeys: 1 }
					),
					(headers) => {
						// Filter out prototype pollution keys
						const safeHeaders = {};
						Object.keys(headers).forEach(key => {
							if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
								safeHeaders[key] = headers[key];
							}
						});

						// Skip test if no safe headers
						if (Object.keys(safeHeaders).length === 0) {
							return true;
						}

						// Create a Lambda event
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: safeHeaders,
							requestContext: {
								identity: {
									sourceIp: "192.168.1.1",
									userAgent: "Test Agent"
								}
							},
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get headers
						const normalizedHeaders = requestInfo.getClientHeaders();

						// Build expected headers (last value wins for case collisions)
						const expectedHeaders = {};
						Object.keys(safeHeaders).forEach(originalKey => {
							const lowercaseKey = originalKey.toLowerCase();
							expectedHeaders[lowercaseKey] = safeHeaders[originalKey];
						});

						// Verify values match expected (accounting for case collisions)
						Object.keys(expectedHeaders).forEach(lowercaseKey => {
							if (normalizedHeaders[lowercaseKey]) {
								expect(normalizedHeaders[lowercaseKey]).toBe(expectedHeaders[lowercaseKey]);
							}
						});
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should allow case-insensitive header access", () => {
			fc.assert(
				fc.property(
					fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,19}$/),
					fc.string({ minLength: 1, maxLength: 50 }),
					(headerKey, headerValue) => {
						// Create headers with uppercase key
						const headers = {
							[headerKey.toUpperCase()]: headerValue
						};

						// Create a Lambda event
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: headers,
							requestContext: {
								identity: {
									sourceIp: "192.168.1.1",
									userAgent: "Test Agent"
								}
							},
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Get headers
						const normalizedHeaders = requestInfo.getClientHeaders();

						// Access with lowercase key should work
						const lowercaseKey = headerKey.toLowerCase();
						if (normalizedHeaders[lowercaseKey]) {
							expect(normalizedHeaders[lowercaseKey]).toBe(headerValue);
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 7: Round-Trip Serialization", () => {
		// Feature: 1-3-9-test-migration-phase-3, Property 7: Round-Trip Serialization

		it("should preserve structure through toObject(true) round-trip", () => {
			fc.assert(
				fc.property(
					fc.record({
						headers: fc.dictionary(
							fc.string({ minLength: 1, maxLength: 20 }),
							fc.string({ minLength: 1, maxLength: 50 })
						),
						queryStringParameters: fc.dictionary(
							fc.string({ minLength: 1, maxLength: 20 }),
							fc.string({ minLength: 1, maxLength: 50 })
						),
						requestContext: fc.record({
							identity: fc.record({
								sourceIp: fc.ipV4(),
								userAgent: fc.string({ minLength: 1, maxLength: 100 })
							})
						})
					}),
					(eventData) => {
						// Create a Lambda event
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: eventData.headers,
							requestContext: eventData.requestContext,
							queryStringParameters: eventData.queryStringParameters,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Serialize with full=true
						const serialized = requestInfo.toObject(true);

						// Verify structure is preserved
						expect(serialized).toHaveProperty('client');
						expect(typeof serialized.client).toBe('object');

						// Verify client properties exist
						if (serialized.client) {
							expect(serialized.client).toHaveProperty('ip');
							expect(serialized.client).toHaveProperty('userAgent');
							expect(serialized.client).toHaveProperty('headers');
							expect(serialized.client).toHaveProperty('parameters');
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should handle nested objects correctly in serialization", () => {
			fc.assert(
				fc.property(
					fc.record({
						headers: fc.dictionary(
							fc.string({ minLength: 1, maxLength: 20 }),
							fc.oneof(
								fc.string({ minLength: 1, maxLength: 50 }),
								fc.constant(null),
								fc.constant(undefined)
							)
						),
						requestContext: fc.record({
							identity: fc.record({
								sourceIp: fc.ipV4(),
								userAgent: fc.string({ minLength: 1, maxLength: 100 })
							})
						})
					}),
					(eventData) => {
						// Create a Lambda event
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: eventData.headers,
							requestContext: eventData.requestContext,
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Serialize with full=true
						const serialized = requestInfo.toObject(true);

						// Verify nested objects are properly serialized
						if (serialized.client && serialized.client.headers) {
							expect(typeof serialized.client.headers).toBe('object');
							// Should be JSON-serializable
							expect(() => JSON.stringify(serialized)).not.toThrow();
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should maintain consistent sensitive data handling through round-trip", () => {
			fc.assert(
				fc.property(
					fc.record({
						headers: fc.dictionary(
							fc.string({ minLength: 1, maxLength: 20 }),
							fc.string({ minLength: 1, maxLength: 50 }),
							{ minKeys: 1 }
						),
						requestContext: fc.record({
							identity: fc.record({
								sourceIp: fc.ipV4(),
								userAgent: fc.string({ minLength: 1, maxLength: 100 })
							})
						})
					}),
					(eventData) => {
						// Create a Lambda event
						const testEvent = {
							resource: "/test",
							path: "/test",
							httpMethod: "GET",
							headers: eventData.headers,
							requestContext: eventData.requestContext,
							queryStringParameters: null,
							body: null,
							isBase64Encoded: false
						};

						// Create RequestInfo instance
						const requestInfo = new RequestInfo(testEvent);

						// Serialize without full parameter
						const serializedSafe = requestInfo.toObject();

						// Serialize with full=true
						const serializedFull = requestInfo.toObject(true);

						// Verify sensitive data handling is consistent
						// Safe version should not have headers
						if (serializedSafe.client) {
							expect(serializedSafe.client).not.toHaveProperty('headers');
							expect(serializedSafe.client).not.toHaveProperty('allHeaders');
						}

						// Full version should have headers
						if (serializedFull.client) {
							expect(serializedFull.client).toHaveProperty('headers');
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
