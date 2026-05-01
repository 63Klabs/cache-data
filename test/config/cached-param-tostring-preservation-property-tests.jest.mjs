import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import {
	CachedParameterSecret,
	CachedSsmParameter,
	CachedSecret,
	ConnectionAuthentication,
	Connection
} from '../../src/lib/tools/index.js';

/* ****************************************************************************
 * Preservation Property Tests: Resolved Values, Plain String Auth,
 * sync_getValue Throw Contract
 * ---------------------------------------------------------------------------
 * 
 * Property 2: Preservation — Existing behavior that must remain unchanged
 * after the bugfix for unresolved CachedParameterSecret toString/toJSON.
 * 
 * These tests capture baseline behavior on UNFIXED code and MUST PASS both
 * before and after the fix is applied.
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 * 
 *************************************************************************** */

describe("Preservation Property Tests: Resolved Values, Plain String Auth, sync_getValue Throw Contract", () => {

	describe("Preservation 2a — sync_getValue() throw contract", () => {
		/**
		 * **Validates: Requirements 3.6**
		 * 
		 * For any unresolved CachedParameterSecret instance, sync_getValue()
		 * MUST throw an error containing "CachedParameterSecret Error".
		 * This contract must be preserved after the fix.
		 */

		it("CachedParameterSecret.sync_getValue() throws for arbitrary unresolved parameter names", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 200 }),
					(paramName) => {
						const param = new CachedParameterSecret(paramName);

						// Confirm unresolved
						expect(param.isValid()).toBe(false);

						// sync_getValue() MUST throw
						expect(() => param.sync_getValue()).toThrow("CachedParameterSecret Error");
					}
				),
				{ numRuns: 100 }
			);
		});

		it("CachedSsmParameter.sync_getValue() throws for arbitrary unresolved parameter names", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 200 }),
					(paramName) => {
						const param = new CachedSsmParameter(paramName);

						expect(param.isValid()).toBe(false);

						expect(() => param.sync_getValue()).toThrow("CachedParameterSecret Error");
					}
				),
				{ numRuns: 100 }
			);
		});

		it("CachedSecret.sync_getValue() throws for arbitrary unresolved parameter names", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 200 }),
					(paramName) => {
						const param = new CachedSecret(paramName);

						expect(param.isValid()).toBe(false);

						expect(() => param.sync_getValue()).toThrow("CachedParameterSecret Error");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Preservation 2b — Resolved toString()/toJSON() behavior", () => {
		/**
		 * **Validates: Requirements 3.2, 3.3, 3.7**
		 * 
		 * For resolved CachedParameterSecret instances, toString() and toJSON()
		 * MUST return the same value as sync_getValue(). This tests that the
		 * fix does not alter behavior for resolved instances.
		 */

		it("Resolved CachedSsmParameter toString()/toJSON() return sync_getValue() for arbitrary value strings", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 200 }),
					fc.string({ minLength: 1, maxLength: 500 }),
					(paramName, resolvedValue) => {
						const param = new CachedSsmParameter(paramName);

						// Manually set value to simulate resolution (SSM structure)
						param.value = { Parameter: { Value: resolvedValue } };

						// Confirm resolved
						expect(param.isValid()).toBe(true);

						// toString() and toJSON() must return the resolved value
						const syncVal = param.sync_getValue();
						expect(syncVal).toBe(resolvedValue);
						expect(param.toString()).toBe(syncVal);
						expect(param.toJSON()).toBe(syncVal);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("Resolved CachedSecret toString()/toJSON() return sync_getValue() for arbitrary value strings", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 200 }),
					fc.string({ minLength: 1, maxLength: 500 }),
					(secretName, resolvedValue) => {
						const param = new CachedSecret(secretName);

						// Manually set value to simulate resolution (Secrets Manager structure)
						param.value = { SecretString: resolvedValue };

						// Confirm resolved
						expect(param.isValid()).toBe(true);

						// toString() and toJSON() must return the resolved value
						const syncVal = param.sync_getValue();
						expect(syncVal).toBe(resolvedValue);
						expect(param.toString()).toBe(syncVal);
						expect(param.toJSON()).toBe(syncVal);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Preservation 2c — Plain string basic auth", () => {
		/**
		 * **Validates: Requirements 3.4**
		 * 
		 * For ConnectionAuthentication constructed with plain string username
		 * and password (not CachedParameterSecret instances), _getBasicAuthHeader()
		 * (accessed via toObject()) MUST produce a valid Base64-encoded
		 * Authorization header.
		 */

		it("Plain string basic auth produces correct Base64 Authorization header for arbitrary credentials", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 100 }),
					fc.string({ minLength: 1, maxLength: 100 }),
					(username, password) => {
						const auth = new ConnectionAuthentication({
							basic: { username, password }
						});

						const result = auth.toObject();

						// Must have headers with Authorization
						expect(result).toHaveProperty("headers");
						expect(result.headers).toHaveProperty("Authorization");

						// Authorization must be "Basic <base64>"
						const expectedBase64 = Buffer.from(username + ":" + password).toString("base64");
						const expectedHeader = "Basic " + expectedBase64;
						expect(result.headers.Authorization).toBe(expectedHeader);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Preservation 2d — Plain string header auth", () => {
		/**
		 * **Validates: Requirements 3.5**
		 * 
		 * For ConnectionAuthentication constructed with plain object headers
		 * (no CachedParameterSecret instances), _getHeaders() (accessed via
		 * toObject()) MUST return the same headers.
		 */

		it("Plain string headers are returned unchanged for arbitrary header key/value pairs", () => {
			fc.assert(
				fc.property(
					fc.dictionary(
						// Alphanumeric keys to avoid edge cases with special chars in header names
						fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,19}$/),
						fc.string({ minLength: 1, maxLength: 100 })
					),
					(headers) => {
						// Skip empty headers (toObject returns {} with no keys)
						if (Object.keys(headers).length === 0) return true;

						const auth = new ConnectionAuthentication({ headers });

						const result = auth.toObject();

						// Must have headers
						expect(result).toHaveProperty("headers");

						// Each input header key/value must be present in the output
						for (const [key, value] of Object.entries(headers)) {
							expect(result.headers[key]).toBe(value);
						}

						// Output headers should have the same number of keys as input
						expect(Object.keys(result.headers).length).toBe(Object.keys(headers).length);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Preservation 2e — Connection without auth", () => {
		/**
		 * **Validates: Requirements 3.8**
		 * 
		 * For a Connection created without an authentication field,
		 * toObject() MUST return an object without an `authentication` key
		 * and MUST NOT throw.
		 */

		it("Connection without auth returns object without authentication key for arbitrary connection configs", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 50 }),
					fc.constantFrom("GET", "POST", "PUT", "DELETE"),
					fc.string({ minLength: 1, maxLength: 100 }),
					fc.string({ minLength: 1, maxLength: 100 }),
					(name, method, host, path) => {
						const conn = new Connection({
							name,
							method,
							host,
							path
						});

						// toObject() must not throw
						const result = conn.toObject();

						// Result must be an object
						expect(typeof result).toBe("object");
						expect(result).not.toBeNull();

						// Must NOT have authentication key
						expect(result).not.toHaveProperty("authentication");

						// Should have the basic connection properties
						expect(result.method).toBe(method);
						expect(result.host).toBe(host.toLowerCase());
						expect(result.path).toBe(path);
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
