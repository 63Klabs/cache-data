/**
 * Jest edge case tests for Connections classes
 * Tests authentication edge cases, Promise rejection handling, and nested Promise error conditions
 * 
 * Tests cover:
 * - Authentication edge cases (missing credentials, invalid formats)
 * - Promise rejection handling
 * - Nested Promise error conditions
 */

import { describe, it, expect } from '@jest/globals';
import { Connection, ConnectionAuthentication, Connections, ConnectionRequest } from '../../src/lib/tools/index.js';

describe("Connections Edge Case Tests", () => {

	describe("Authentication Edge Cases - Missing Credentials", () => {

		it("should handle Connection with null authentication", () => {
			const conn = new Connection({
				name: 'test-null-auth',
				host: 'api.example.com',
				path: '/test',
				authentication: null
			});

			expect(conn.getParameters()).toBeDefined();
			expect(conn.getHeaders()).toBeDefined();
		});

		it("should handle Connection with undefined authentication", () => {
			const conn = new Connection({
				name: 'test-undefined-auth',
				host: 'api.example.com',
				path: '/test',
				authentication: undefined
			});

			expect(conn.getParameters()).toBeDefined();
			expect(conn.getHeaders()).toBeDefined();
		});

		it("should handle ConnectionAuthentication with empty credentials", () => {
			const auth = new ConnectionAuthentication({
				parameters: {},
				headers: {},
				body: {}
			});

			// Empty objects are still considered as having parameters/headers/body
			expect(auth.hasParameter()).toBe(true);
			expect(auth.hasHeader()).toBe(true);
			expect(auth.hasBody()).toBe(true);
		});

		it("should handle ConnectionAuthentication with null values", () => {
			const auth = new ConnectionAuthentication({
				parameters: null,
				headers: null,
				body: null
			});

			expect(auth.hasParameter()).toBe(false);
			expect(auth.hasHeader()).toBe(false);
			expect(auth.hasBody()).toBe(false);
		});


		it("should handle ConnectionAuthentication with missing basic auth username", () => {
			const auth = new ConnectionAuthentication({
				basic: {
					password: 'test-password'
					// Missing username
				}
			});

			expect(auth.hasBasic()).toBe(true);
			// Should handle missing username gracefully
		});

		it("should handle ConnectionAuthentication with missing basic auth password", () => {
			const auth = new ConnectionAuthentication({
				basic: {
					username: 'test-user'
					// Missing password
				}
			});

			expect(auth.hasBasic()).toBe(true);
			// Should handle missing password gracefully
		});

		it("should handle ConnectionAuthentication with empty basic auth", () => {
			const auth = new ConnectionAuthentication({
				basic: {}
			});

			expect(auth.hasBasic()).toBe(true);
		});

	});

	describe("Authentication Edge Cases - Invalid Formats", () => {

		it("should handle invalid authentication object type", () => {
			const conn = new Connection({
				name: 'test-invalid-auth',
				host: 'api.example.com',
				path: '/test',
				authentication: "invalid-string"
			});

			// Should not throw, but handle gracefully
			expect(() => conn.getParameters()).not.toThrow();
		});

		it("should handle authentication with invalid parameter types", () => {
			const auth = new ConnectionAuthentication({
				parameters: "not-an-object"
			});

			// Invalid types are still considered as having parameters
			expect(auth.hasParameter()).toBe(true);
		});

		it("should handle authentication with invalid header types", () => {
			const auth = new ConnectionAuthentication({
				headers: "not-an-object"
			});

			// Invalid types are still considered as having headers
			expect(auth.hasHeader()).toBe(true);
		});

		it("should handle authentication with array instead of object", () => {
			const auth = new ConnectionAuthentication({
				parameters: ['param1', 'param2']
			});

			// Arrays are still considered as having parameters
			expect(auth.hasParameter()).toBe(true);
		});

	});

	describe("Promise Rejection Handling", () => {

		it("should handle rejected Promise in parameters", () => {
			const rejectedPromise = Promise.reject(new Error('Parameter load failed'));
			// Suppress unhandled rejection warning
			rejectedPromise.catch(() => {});

			const conn = new Connection({
				name: 'test-rejected-param',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					key: 'value',
					failedParam: rejectedPromise
				}
			});

			// Should not throw when getting parameters
			const params = conn.getParameters();
			expect(params.key).toBe('value');
			expect(params.failedParam).toEqual({});
		});


		it("should handle rejected Promise in headers", () => {
			const rejectedPromise = Promise.reject(new Error('Header load failed'));
			rejectedPromise.catch(() => {});

			const conn = new Connection({
				name: 'test-rejected-header',
				host: 'api.example.com',
				path: '/test',
				headers: {
					'Content-Type': 'application/json',
					'X-Failed-Header': rejectedPromise
				}
			});

			const headers = conn.getHeaders();
			expect(headers['Content-Type']).toBe('application/json');
			expect(headers['X-Failed-Header']).toEqual({});
		});

		it("should handle rejected Promise in authentication parameters", () => {
			const rejectedPromise = Promise.reject(new Error('Auth param failed'));
			rejectedPromise.catch(() => {});

			const auth = new ConnectionAuthentication({
				parameters: {
					apiKey: 'static-key',
					dynamicKey: rejectedPromise
				}
			});

			const conn = new Connection({
				name: 'test-rejected-auth-param',
				host: 'api.example.com',
				path: '/test',
				authentication: auth
			});

			const params = conn.getParameters();
			expect(params.apiKey).toBe('static-key');
			expect(params.dynamicKey).toEqual({});
		});

		it("should handle multiple rejected Promises", () => {
			const rejected1 = Promise.reject(new Error('Error 1'));
			const rejected2 = Promise.reject(new Error('Error 2'));
			rejected1.catch(() => {});
			rejected2.catch(() => {});

			const conn = new Connection({
				name: 'test-multiple-rejected',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					key1: 'value1',
					failed1: rejected1,
					failed2: rejected2
				}
			});

			const params = conn.getParameters();
			expect(params.key1).toBe('value1');
			expect(params.failed1).toEqual({});
			expect(params.failed2).toEqual({});
		});

	});

	describe("Nested Promise Error Conditions", () => {

		it("should handle deeply nested rejected Promises", () => {
			const rejectedPromise = Promise.reject(new Error('Nested error'));
			rejectedPromise.catch(() => {});

			const conn = new Connection({
				name: 'test-nested-rejected',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					config: {
						apiKey: 'test-key',
						nested: {
							deepNested: {
								promise: rejectedPromise
							}
						}
					}
				}
			});

			const params = conn.getParameters();
			expect(params.config.apiKey).toBe('test-key');
			expect(params.config.nested.deepNested.promise).toEqual({});
		});


		it("should handle Promise that resolves to another Promise", () => {
			const innerPromise = Promise.resolve('inner-value');
			const outerPromise = Promise.resolve(innerPromise);

			const conn = new Connection({
				name: 'test-promise-chain',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					key: 'value',
					chained: outerPromise
				}
			});

			const params = conn.getParameters();
			expect(params.key).toBe('value');
			// Chained promise should be converted to empty object
			expect(typeof params.chained).toBe('object');
		});

		it("should handle array of Promises", () => {
			const promise1 = Promise.resolve('value1');
			const promise2 = Promise.resolve('value2');

			const conn = new Connection({
				name: 'test-promise-array',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					key: 'value',
					promises: [promise1, promise2]
				}
			});

			const params = conn.getParameters();
			expect(params.key).toBe('value');
			expect(Array.isArray(params.promises)).toBe(true);
		});

		it("should handle Promise in ConnectionRequest", () => {
			const baseConn = new Connection({
				name: 'test-base',
				host: 'api.example.com',
				path: '/test'
			});

			const connRequest = new ConnectionRequest(baseConn);
			
			const promiseHeader = Promise.resolve('Bearer token');
			connRequest.addHeader('Authorization', promiseHeader);

			const headers = connRequest.getHeaders();
			expect(typeof headers['Authorization']).toBe('object');
		});

	});

	describe("Boundary Conditions", () => {

		it("should handle Connection with empty host", () => {
			const conn = new Connection({
				name: 'test-empty-host',
				host: '',
				path: '/test'
			});

			expect(conn.toString()).toContain('://');
		});

		it("should handle Connection with empty path", () => {
			const conn = new Connection({
				name: 'test-empty-path',
				host: 'api.example.com',
				path: ''
			});

			expect(conn.toString()).toContain('api.example.com');
		});

		it("should handle Connections.get with non-existent name", () => {
			const connections = new Connections();
			const result = connections.get('non-existent');
			// Returns null for non-existent connections
			expect(result).toBeNull();
		});

		it("should handle adding duplicate connection names", () => {
			const connections = new Connections();
			
			const conn1 = new Connection({
				name: 'duplicate',
				host: 'api1.example.com',
				path: '/test1'
			});

			const conn2 = new Connection({
				name: 'duplicate',
				host: 'api2.example.com',
				path: '/test2'
			});

			connections.add(conn1);
			connections.add(conn2);

			// First one is kept (not overwritten)
			const retrieved = connections.get('duplicate');
			expect(retrieved.toString()).toContain('api1.example.com');
		});

	});

});
