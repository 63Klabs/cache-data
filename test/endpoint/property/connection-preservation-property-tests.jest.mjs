import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { Connection } from '../../../src/lib/tools/Connections.classes.js';

/* ****************************************************************************
 * Connection Preservation Property-Based Tests
 * Bugfix: 1-3-14-connection-drops-pagination-retry
 * 
 * These tests capture the EXISTING correct behavior of the Connection class
 * for non-buggy inputs (connections WITHOUT non-null pagination or retry).
 * They MUST PASS on both unfixed and fixed code to confirm no regressions.
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

/**
 * Generators for connection config properties.
 * These generate random but valid connection configurations
 * WITHOUT non-null pagination or retry (the non-buggy input space).
 */

// Generate a valid host string (lowercase, no special chars)
const hostArb = fc.stringMatching(/^[a-z][a-z0-9.-]{0,29}$/)
	.filter(h => h.length > 0 && !h.endsWith('.') && !h.endsWith('-'));

// Generate a valid path string (starts with /)
const pathArb = fc.string({ minLength: 1, maxLength: 50 })
	.map(s => '/' + s.replace(/\s/g, ''));

// Generate a valid HTTP method
const methodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE');

// Generate a valid protocol
const protocolArb = fc.constantFrom('http', 'https');

// Generate headers as dictionary of string keys to string values
const headersArb = fc.dictionary(
	fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
	fc.string({ minLength: 0, maxLength: 50 })
);

// Generate parameters as dictionary of string keys to string values
const parametersArb = fc.dictionary(
	fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
	fc.string({ minLength: 0, maxLength: 50 })
);

// Generate options as a simple object
const optionsArb = fc.record({
	timeout: fc.option(fc.integer({ min: 100, max: 60000 })),
	followRedirects: fc.option(fc.boolean())
}).filter(o => Object.values(o).some(v => v !== null));

// Generate note as a string
const noteArb = fc.string({ minLength: 1, maxLength: 100 });

// Generate a connection config WITHOUT pagination/retry (or with them as null)
const connectionConfigWithoutPaginationRetryArb = fc.record({
	host: hostArb,
	path: fc.option(pathArb),
	method: fc.option(methodArb),
	protocol: fc.option(protocolArb),
	headers: fc.option(headersArb),
	parameters: fc.option(parametersArb),
	options: fc.option(optionsArb),
	note: fc.option(noteArb),
	pagination: fc.constant(null),
	retry: fc.constant(null)
}).map(config => {
	// Remove null optional fields to create varied configs
	const result = { host: config.host };
	if (config.path !== null) result.path = config.path;
	if (config.method !== null) result.method = config.method;
	if (config.protocol !== null) result.protocol = config.protocol;
	if (config.headers !== null && Object.keys(config.headers).length > 0) result.headers = config.headers;
	if (config.parameters !== null && Object.keys(config.parameters).length > 0) result.parameters = config.parameters;
	if (config.options !== null) result.options = config.options;
	if (config.note !== null) result.note = config.note;
	return result;
});

// Generate a config that explicitly includes pagination: null and/or retry: null
const connectionConfigWithNullPaginationRetryArb = fc.record({
	host: hostArb,
	path: fc.option(pathArb),
	method: fc.option(methodArb),
	includePaginationNull: fc.boolean(),
	includeRetryNull: fc.boolean()
}).filter(c => c.includePaginationNull || c.includeRetryNull)
.map(config => {
	const result = { host: config.host };
	if (config.path !== null) result.path = config.path;
	if (config.method !== null) result.method = config.method;
	if (config.includePaginationNull) result.pagination = null;
	if (config.includeRetryNull) result.retry = null;
	return result;
});

describe("Connection Preservation Property-Based Tests", () => {

	describe("Property 2a: Existing properties preserved in toObject() for configs without pagination/retry", () => {
		/**
		 * **Validates: Requirements 3.1, 3.2, 3.5**
		 * 
		 * For all connection configs WITHOUT pagination/retry (or with them set to null),
		 * toObject() output must include all provided properties correctly.
		 */

		it("should preserve host, path, method, protocol in toObject() output", () => {
			fc.assert(
				fc.property(
					connectionConfigWithoutPaginationRetryArb,
					(config) => {
						const conn = new Connection(config);
						const result = conn.toObject();

						// host is always stored lowercase
						if (config.host) {
							expect(result.host).toBe(config.host.toLowerCase());
						}

						// path is preserved as-is
						if (config.path) {
							expect(result.path).toBe(config.path);
						}

						// method is stored uppercase
						if (config.method) {
							expect(result.method).toBe(config.method.toUpperCase());
						}

						// protocol is stored lowercase without trailing colon
						if (config.protocol) {
							expect(result.protocol).toBe(config.protocol.replace(/:$/, '').toLowerCase());
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should preserve headers and parameters in toObject() output", () => {
			fc.assert(
				fc.property(
					connectionConfigWithoutPaginationRetryArb,
					(config) => {
						const conn = new Connection(config);
						const result = conn.toObject();

						// headers are preserved
						if (config.headers && Object.keys(config.headers).length > 0) {
							expect(result.headers).toEqual(config.headers);
						}

						// parameters are preserved
						if (config.parameters && Object.keys(config.parameters).length > 0) {
							expect(result.parameters).toEqual(config.parameters);
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should preserve options and note in toObject() output", () => {
			fc.assert(
				fc.property(
					connectionConfigWithoutPaginationRetryArb,
					(config) => {
						const conn = new Connection(config);
						const result = conn.toObject();

						// options are preserved
						if (config.options) {
							expect(result.options).toEqual(config.options);
						}

						// note is preserved
						if (config.note) {
							expect(result.note).toBe(config.note);
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2b: Null pagination/retry excluded from toObject() output", () => {
		/**
		 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
		 * 
		 * For all connection configs with pagination: null and/or retry: null,
		 * toObject() output must NOT contain pagination or retry keys.
		 */

		it("should NOT include pagination or retry keys when set to null", () => {
			fc.assert(
				fc.property(
					connectionConfigWithNullPaginationRetryArb,
					(config) => {
						const conn = new Connection(config);
						const result = conn.toObject();

						// pagination key must NOT be present
						expect('pagination' in result).toBe(false);

						// retry key must NOT be present
						expect('retry' in result).toBe(false);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should NOT include pagination or retry keys when not provided at all", () => {
			fc.assert(
				fc.property(
					connectionConfigWithoutPaginationRetryArb,
					(config) => {
						const conn = new Connection(config);
						const result = conn.toObject();

						// pagination key must NOT be present
						expect('pagination' in result).toBe(false);

						// retry key must NOT be present
						expect('retry' in result).toBe(false);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2c: toInfoObject() never contains pagination or retry", () => {
		/**
		 * **Validates: Requirements 3.6**
		 * 
		 * For all connection configs, toInfoObject() output must NOT contain
		 * pagination or retry keys (toInfoObject is for logging/debugging only).
		 */

		it("should NOT include pagination or retry in toInfoObject() for any config", () => {
			fc.assert(
				fc.property(
					connectionConfigWithoutPaginationRetryArb,
					(config) => {
						const conn = new Connection(config);
						const result = conn.toInfoObject();

						// toInfoObject must never contain pagination
						expect('pagination' in result).toBe(false);

						// toInfoObject must never contain retry
						expect('retry' in result).toBe(false);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should NOT include pagination or retry in toInfoObject() when set to null", () => {
			fc.assert(
				fc.property(
					connectionConfigWithNullPaginationRetryArb,
					(config) => {
						const conn = new Connection(config);
						const result = conn.toInfoObject();

						// toInfoObject must never contain pagination
						expect('pagination' in result).toBe(false);

						// toInfoObject must never contain retry
						expect('retry' in result).toBe(false);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2d: Existing properties round-trip correctly", () => {
		/**
		 * **Validates: Requirements 3.5, 3.7**
		 * 
		 * For all connection configs, existing properties (host, path, method,
		 * protocol, headers, parameters, body, options, note, cache) must
		 * round-trip correctly through new Connection(config).toObject().
		 */

		it("should round-trip host, path, method, protocol correctly", () => {
			fc.assert(
				fc.property(
					hostArb,
					pathArb,
					methodArb,
					protocolArb,
					(host, path, method, protocol) => {
						const config = { host, path, method, protocol };
						const conn = new Connection(config);
						const result = conn.toObject();

						// Round-trip: host stored lowercase
						expect(result.host).toBe(host.toLowerCase());
						// Round-trip: path preserved
						expect(result.path).toBe(path);
						// Round-trip: method stored uppercase
						expect(result.method).toBe(method.toUpperCase());
						// Round-trip: protocol stored lowercase without colon
						expect(result.protocol).toBe(protocol.replace(/:$/, '').toLowerCase());
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should round-trip headers and parameters correctly", () => {
			fc.assert(
				fc.property(
					headersArb,
					parametersArb,
					(headers, parameters) => {
						// Only test with non-empty dicts
						if (Object.keys(headers).length === 0 && Object.keys(parameters).length === 0) return true;

						const config = { host: 'test.example.com' };
						if (Object.keys(headers).length > 0) config.headers = headers;
						if (Object.keys(parameters).length > 0) config.parameters = parameters;

						const conn = new Connection(config);
						const result = conn.toObject();

						// Round-trip: headers preserved
						if (Object.keys(headers).length > 0) {
							expect(result.headers).toEqual(headers);
						}

						// Round-trip: parameters preserved
						if (Object.keys(parameters).length > 0) {
							expect(result.parameters).toEqual(parameters);
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should round-trip options and note correctly", () => {
			fc.assert(
				fc.property(
					optionsArb,
					noteArb,
					(options, note) => {
						const config = { host: 'test.example.com', options, note };
						const conn = new Connection(config);
						const result = conn.toObject();

						// Round-trip: options preserved
						expect(result.options).toEqual(options);

						// Round-trip: note preserved
						expect(result.note).toBe(note);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should round-trip cache profiles correctly", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 20 }),
					fc.integer({ min: 60, max: 3600 }),
					(profileName, ttl) => {
						const cache = [{ profile: profileName, ttl }];
						const config = { host: 'test.example.com', cache };
						const conn = new Connection(config);
						const result = conn.toObject();

						// Round-trip: cache preserved
						expect(result.cache).toEqual(cache);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should round-trip body correctly (object body becomes JSON string)", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.string({ minLength: 1, maxLength: 50 }),
						fc.record({ key: fc.string(), value: fc.string() })
					),
					(body) => {
						const config = { host: 'test.example.com', body };
						const conn = new Connection(config);
						const result = conn.toObject();

						// Body: if object, gets JSON.stringify'd; if string, preserved as-is
						if (typeof body === 'string') {
							expect(result.body).toBe(body);
						} else {
							expect(result.body).toBe(JSON.stringify(body));
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
