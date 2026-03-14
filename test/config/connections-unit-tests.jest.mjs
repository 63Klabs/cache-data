import { describe, it, expect } from '@jest/globals';
import { Connection, ConnectionAuthentication } from '../../src/lib/tools/index.js';

/* ****************************************************************************
 * Connections Unit Tests - Edge Cases
 * Feature: reduce-json-stringify
 */
describe("Connections - Unit Tests (Edge Cases)", () => {

	describe("Empty parameters/headers", () => {
		it("should handle empty parameters object", () => {
			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				parameters: {}
			});

			const params = connection.getParameters();
			expect(params).toEqual(expect.any(Object));
			expect(Object.keys(params)).toHaveLength(0);
		});

		it("should handle null parameters", () => {
			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				parameters: null
			});

			const params = connection.getParameters();
			expect(params).toBeNull();
		});

		it("should handle empty headers object", () => {
			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				headers: {}
			});

			const headers = connection.getHeaders();
			expect(headers).toEqual(expect.any(Object));
			expect(Object.keys(headers)).toHaveLength(0);
		});

		it("should handle null headers", () => {
			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				headers: null
			});

			const headers = connection.getHeaders();
			expect(headers).toBeNull();
		});
	});

	describe("Null cache profiles", () => {
		it("should handle null cache profiles array", () => {
			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				cache: null
			});

			// getCacheProfile should handle null cache profiles gracefully
			const profile = connection.getCacheProfile('test-profile');
			expect(profile).toBeUndefined();
		});

		it("should handle empty cache profiles array", () => {
			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				cache: []
			});

			const profile = connection.getCacheProfile('test-profile');
			expect(profile).toBeUndefined();
		});

		it("should handle non-existent cache profile", () => {
			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				cache: [
					{ profile: 'profile1', ttl: 3600 },
					{ profile: 'profile2', ttl: 7200 }
				]
			});

			const profile = connection.getCacheProfile('non-existent');
			expect(profile).toBeUndefined();
		});
	});

	describe("Complex nested connection objects", () => {
		it("should handle deeply nested parameters", () => {
			const nestedParams = {
				level1: {
					level2: {
						level3: {
							value: 'deep'
						}
					}
				},
				array: [1, 2, { nested: 'value' }]
			};

			const connection = new Connection({
				name: 'test-connection',
				method: 'POST',
				host: 'api.example.com',
				path: '/test',
				parameters: nestedParams
			});

			const params = connection.getParameters();
			
			// Verify deep cloning worked
			expect(params).toEqual(nestedParams);
			
			// Verify it's a copy, not a reference
			params.level1.level2.level3.value = 'modified';
			const paramsAgain = connection.getParameters();
			expect(paramsAgain.level1.level2.level3.value).toBe('deep');
		});

		it("should handle nested headers with arrays", () => {
			const nestedHeaders = {
				'X-Custom-Header': 'value',
				'X-Array-Header': ['value1', 'value2'],
				'X-Object-Header': { key: 'value' }
			};

			const connection = new Connection({
				name: 'test-connection',
				method: 'POST',
				host: 'api.example.com',
				path: '/test',
				headers: nestedHeaders
			});

			const headers = connection.getHeaders();
			
			// Verify deep cloning worked
			expect(headers).toEqual(nestedHeaders);
			
			// Verify it's a copy, not a reference
			headers['X-Array-Header'].push('value3');
			const headersAgain = connection.getHeaders();
			expect(headersAgain['X-Array-Header']).toHaveLength(2);
		});

		it("should handle complex authentication with nested structures", () => {
			const auth = new ConnectionAuthentication({
				headers: {
					'X-Auth-Token': 'token123',
					'X-Auth-Data': { userId: 123, roles: ['admin', 'user'] }
				},
				parameters: {
					apiKey: 'key123',
					metadata: { version: '1.0', features: ['a', 'b'] }
				}
			});

			const connection = new Connection({
				name: 'test-connection',
				method: 'POST',
				host: 'api.example.com',
				path: '/test',
				authentication: auth
			});

			const authObj = auth.toObject();
			
			// Verify the auth object is properly cloned
			expect(authObj).toHaveProperty('headers');
			expect(authObj).toHaveProperty('parameters');
			
			// Modify the returned object
			authObj.headers['X-Auth-Data'].userId = 999;
			
			// Verify internal state hasn't changed
			const authObjAgain = auth.toObject();
			expect(authObjAgain.headers['X-Auth-Data'].userId).toBe(123);
		});

		it("should handle toObject() with complex nested structures", () => {
			const connection = new Connection({
				name: 'test-connection',
				method: 'POST',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					nested: {
						deep: {
							value: 'test'
						}
					}
				},
				headers: {
					'X-Custom': {
						nested: ['a', 'b', 'c']
					}
				}
			});

			const obj = connection.toObject();
			
			// Verify the object is properly structured
			expect(obj).toHaveProperty('parameters');
			expect(obj).toHaveProperty('headers');
			
			// Modify the returned object
			obj.parameters.nested.deep.value = 'modified';
			obj.headers['X-Custom'].nested.push('d');
			
			// Verify internal state hasn't changed
			const objAgain = connection.toObject();
			expect(objAgain.parameters.nested.deep.value).toBe('test');
			expect(objAgain.headers['X-Custom'].nested).toHaveLength(3);
		});

		it("should handle cache profiles with nested configuration", () => {
			const cacheProfile = {
				profile: 'complex-profile',
				ttl: 3600,
				strategy: 'cache-first',
				config: {
					maxAge: 7200,
					staleWhileRevalidate: 3600,
					tags: ['api', 'user', 'data']
				}
			};

			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				cache: [cacheProfile]
			});

			const profile = connection.getCacheProfile('complex-profile');
			
			// Verify the profile is properly cloned
			expect(profile).toEqual(cacheProfile);
			
			// Modify the returned profile
			profile.config.tags.push('modified');
			profile.config.maxAge = 9999;
			
			// Verify internal state hasn't changed
			const profileAgain = connection.getCacheProfile('complex-profile');
			expect(profileAgain.config.tags).toHaveLength(3);
			expect(profileAgain.config.maxAge).toBe(7200);
		});
	});

	describe("Authentication edge cases", () => {
		it("should handle empty authentication objects", () => {
			const auth = new ConnectionAuthentication({});
			const authObj = auth.toObject();
			
			expect(authObj).toEqual(expect.any(Object));
			expect(Object.keys(authObj)).toHaveLength(0);
		});

		it("should handle authentication with only headers", () => {
			const auth = new ConnectionAuthentication({
				headers: { 'X-Auth': 'token' }
			});

			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				authentication: auth
			});

			const headers = connection.getHeaders();
			expect(headers).toHaveProperty('X-Auth', 'token');
			
			const params = connection.getParameters();
			expect(params).toBeNull();
		});

		it("should handle authentication with only parameters", () => {
			const auth = new ConnectionAuthentication({
				parameters: { apiKey: 'key123' }
			});

			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				authentication: auth
			});

			const params = connection.getParameters();
			expect(params).toHaveProperty('apiKey', 'key123');
			
			const headers = connection.getHeaders();
			expect(headers).toBeNull();
		});

		it("should merge authentication parameters with connection parameters", () => {
			const auth = new ConnectionAuthentication({
				parameters: { authParam: 'authValue' }
			});

			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				parameters: { regularParam: 'regularValue' },
				authentication: auth
			});

			const params = connection.getParameters();
			expect(params).toHaveProperty('authParam', 'authValue');
			expect(params).toHaveProperty('regularParam', 'regularValue');
		});

		it("should merge authentication headers with connection headers", () => {
			const auth = new ConnectionAuthentication({
				headers: { 'X-Auth': 'token' }
			});

			const connection = new Connection({
				name: 'test-connection',
				method: 'GET',
				host: 'api.example.com',
				path: '/test',
				headers: { 'Content-Type': 'application/json' },
				authentication: auth
			});

			const headers = connection.getHeaders();
			expect(headers).toHaveProperty('X-Auth', 'token');
			expect(headers).toHaveProperty('Content-Type', 'application/json');
		});
	});
});
