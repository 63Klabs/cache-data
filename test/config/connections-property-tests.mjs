import { expect } from 'chai';
import fc from 'fast-check';
import { Connection, ConnectionAuthentication } from '../../src/lib/tools/index.js';

/* ****************************************************************************
 * Connections Property-Based Tests
 * Feature: reduce-json-stringify
 */
describe("Connections - Property-Based Tests", () => {

	describe("Property 1: Defensive Copy Immutability", () => {
		// Feature: reduce-json-stringify, Property 1: Defensive Copy Immutability

		it("should not affect internal state when modifying returned parameters", () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), fc.string()),
					(parameters) => {
						// Skip if parameters is empty
						if (Object.keys(parameters).length === 0) return true;

						// Create a Connection with parameters
						const connection = new Connection({
							name: 'test-connection',
							method: 'GET',
							host: 'api.example.com',
							path: '/test',
							parameters: parameters
						});

						// Get a copy of parameters
						const paramsCopy = connection.getParameters();

						// Store the original state
						const originalParams = connection.getParameters();

						// Modify the copy
						paramsCopy.modifiedKey = 'modified';
						const firstKey = Object.keys(paramsCopy)[0];
						paramsCopy[firstKey] = 'modified';

						// Get the state after modification
						const paramsAfterModification = connection.getParameters();

						// Verify the internal state hasn't changed
						expect(JSON.stringify(paramsAfterModification)).to.equal(JSON.stringify(originalParams));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not affect internal state when modifying returned headers", () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), fc.string()),
					(headers) => {
						// Skip if headers is empty
						if (Object.keys(headers).length === 0) return true;

						// Create a Connection with headers
						const connection = new Connection({
							name: 'test-connection',
							method: 'GET',
							host: 'api.example.com',
							path: '/test',
							headers: headers
						});

						// Get a copy of headers
						const headersCopy = connection.getHeaders();

						// Store the original state
						const originalHeaders = connection.getHeaders();

						// Modify the copy
						headersCopy.modifiedKey = 'modified';
						const firstKey = Object.keys(headersCopy)[0];
						headersCopy[firstKey] = 'modified';

						// Get the state after modification
						const headersAfterModification = connection.getHeaders();

						// Verify the internal state hasn't changed
						expect(JSON.stringify(headersAfterModification)).to.equal(JSON.stringify(originalHeaders));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not affect internal state when modifying returned cache profile", () => {
			fc.assert(
				fc.property(
					fc.string(),
					fc.integer({ min: 60, max: 3600 }),
					(profileName, ttl) => {
						// Create a cache profile
						const cacheProfile = {
							profile: profileName,
							ttl: ttl,
							strategy: 'cache-first'
						};

						// Create a Connection with cache profiles
						const connection = new Connection({
							name: 'test-connection',
							method: 'GET',
							host: 'api.example.com',
							path: '/test',
							cache: [cacheProfile]
						});

						// Get a copy of the cache profile
						const profileCopy = connection.getCacheProfile(profileName);

						// Store the original state
						const originalProfile = connection.getCacheProfile(profileName);

						// Modify the copy
						if (profileCopy) {
							profileCopy.modifiedKey = 'modified';
							profileCopy.ttl = 9999;
						}

						// Get the state after modification
						const profileAfterModification = connection.getCacheProfile(profileName);

						// Verify the internal state hasn't changed
						expect(JSON.stringify(profileAfterModification)).to.equal(JSON.stringify(originalProfile));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not affect internal state when modifying toObject() result", () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), fc.string()),
					fc.dictionary(fc.string(), fc.string()),
					(parameters, headers) => {
						// Create a Connection
						const connection = new Connection({
							name: 'test-connection',
							method: 'GET',
							host: 'api.example.com',
							path: '/test',
							parameters: parameters,
							headers: headers
						});

						// Get a copy via toObject()
						const objCopy = connection.toObject();

						// Store the original state
						const originalObj = connection.toObject();

						// Modify the copy
						if (objCopy.parameters) {
							objCopy.parameters.modifiedKey = 'modified';
						}
						if (objCopy.headers) {
							objCopy.headers.modifiedKey = 'modified';
						}
						objCopy.newKey = 'added';

						// Get the state after modification
						const objAfterModification = connection.toObject();

						// Verify the internal state hasn't changed
						expect(JSON.stringify(objAfterModification)).to.equal(JSON.stringify(originalObj));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not affect internal state when modifying nested values in parameters", () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.object())),
					(parameters) => {
						// Skip if parameters is empty
						if (Object.keys(parameters).length === 0) return true;

						// Create a Connection with nested parameters
						const connection = new Connection({
							name: 'test-connection',
							method: 'GET',
							host: 'api.example.com',
							path: '/test',
							parameters: parameters
						});

						// Get a copy of parameters
						const paramsCopy = connection.getParameters();

						// Store the original state
						const originalParams = connection.getParameters();

						// Try to modify nested values
						for (const key in paramsCopy) {
							if (typeof paramsCopy[key] === 'object' && paramsCopy[key] !== null) {
								paramsCopy[key].nestedModification = 'modified';
							}
						}

						// Get the state after modification
						const paramsAfterModification = connection.getParameters();

						// Verify the internal state hasn't changed
						expect(JSON.stringify(paramsAfterModification)).to.equal(JSON.stringify(originalParams));
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2: Output Compatibility with JSON Pattern", () => {
		// Feature: reduce-json-stringify, Property 2: Output Compatibility with JSON Pattern

		it("should produce identical output for getParameters()", () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))),
					(parameters) => {
						// Create a Connection with parameters
						const connection = new Connection({
							name: 'test-connection',
							method: 'GET',
							host: 'api.example.com',
							path: '/test',
							parameters: parameters
						});

						// Get parameters using structuredClone (current implementation)
						const structuredCloneOutput = connection.getParameters();

						// Simulate JSON pattern output
						const jsonPatternOutput = parameters !== null ? JSON.parse(JSON.stringify(parameters)) : null;

						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should produce identical output for getHeaders()", () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))),
					(headers) => {
						// Create a Connection with headers
						const connection = new Connection({
							name: 'test-connection',
							method: 'GET',
							host: 'api.example.com',
							path: '/test',
							headers: headers
						});

						// Get headers using structuredClone (current implementation)
						const structuredCloneOutput = connection.getHeaders();

						// Simulate JSON pattern output
						const jsonPatternOutput = headers !== null ? JSON.parse(JSON.stringify(headers)) : null;

						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should produce identical output for getCacheProfile()", () => {
			fc.assert(
				fc.property(
					fc.string(),
					fc.integer({ min: 60, max: 3600 }),
					fc.string(),
					(profileName, ttl, strategy) => {
						// Create a cache profile
						const cacheProfile = {
							profile: profileName,
							ttl: ttl,
							strategy: strategy
						};

						// Create a Connection with cache profiles
						const connection = new Connection({
							name: 'test-connection',
							method: 'GET',
							host: 'api.example.com',
							path: '/test',
							cache: [cacheProfile]
						});

						// Get cache profile using structuredClone (current implementation)
						const structuredCloneOutput = connection.getCacheProfile(profileName);

						// Simulate JSON pattern output
						const jsonPatternOutput = JSON.parse(JSON.stringify(cacheProfile));

						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should produce identical output for toObject() with authentication", () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), fc.string()),
					fc.dictionary(fc.string(), fc.string()),
					(authHeaders, authParams) => {
						// Create authentication
						const auth = new ConnectionAuthentication({
							headers: authHeaders,
							parameters: authParams
						});

						// Create a Connection with authentication
						const connection = new Connection({
							name: 'test-connection',
							method: 'GET',
							host: 'api.example.com',
							path: '/test',
							authentication: auth
						});

						// Get the authentication object using structuredClone (current implementation)
						const structuredCloneOutput = auth.toObject();

						// Simulate JSON pattern output
						const authObj = {};
						if (Object.keys(authHeaders).length > 0) authObj.headers = authHeaders;
						if (Object.keys(authParams).length > 0) authObj.parameters = authParams;
						const jsonPatternOutput = JSON.parse(JSON.stringify(authObj));

						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
