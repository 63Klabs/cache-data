import { describe, it, expect } from '@jest/globals';

import { Connection, ConnectionAuthentication, Connections } from '../../src/lib/tools/index.js';

describe("Test Connection, Connections, and ConnectionAuthentication Classes", () => {
	describe("Test Connection Class", () => {
		it('toString with defaults', () => {
			let conn = new Connection({
				host: 'api.chadkluck.net',
				path: '/games/'
			})

			expect(conn.toString()).toBe("null null null://api.chadkluck.net/games/")
	
		})
	})

	describe("Promise Handling in Connection Properties", () => {
		
		it('should handle resolved Promise in parameters', () => {
			const conn = new Connection({
				name: 'test-connection',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					apiKey: 'test-key',
					token: Promise.resolve('resolved-token')
				}
			});

			// Should not throw when getting parameters
			const params = conn.getParameters();
			
			// Regular properties should be preserved
			expect(params.apiKey).toBe('test-key');
			
			// Promise should be converted to empty object by safeClone fallback
			expect(typeof params.token).toBe('object');
			expect(params.token).toEqual({});
		});

		it('should handle resolved Promise in headers', () => {
			const conn = new Connection({
				name: 'test-connection',
				host: 'api.example.com',
				path: '/test',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': Promise.resolve('Bearer token123')
				}
			});

			// Should not throw when getting headers
			const headers = conn.getHeaders();
			
			// Regular properties should be preserved
			expect(headers['Content-Type']).toBe('application/json');
			
			// Promise should be converted to empty object
			expect(typeof headers['Authorization']).toBe('object');
			expect(headers['Authorization']).toEqual({});
		});

		it('should handle Promise in authentication parameters', () => {
			const auth = new ConnectionAuthentication({
				parameters: {
					apiKey: 'static-key',
					dynamicToken: Promise.resolve('dynamic-value')
				}
			});

			const conn = new Connection({
				name: 'test-connection',
				host: 'api.example.com',
				path: '/test',
				authentication: auth
			});

			// Should not throw when getting parameters
			const params = conn.getParameters();
			
			// Static auth parameter should be present
			expect(params.apiKey).toBe('static-key');
			
			// Promise should be converted to empty object
			expect(typeof params.dynamicToken).toBe('object');
			expect(params.dynamicToken).toEqual({});
		});

		it('should handle Promise in authentication headers', () => {
			const auth = new ConnectionAuthentication({
				headers: {
					'X-API-Key': 'static-key',
					'X-Dynamic-Token': Promise.resolve('dynamic-token')
				}
			});

			const conn = new Connection({
				name: 'test-connection',
				host: 'api.example.com',
				path: '/test',
				authentication: auth
			});

			// Should not throw when getting headers
			const headers = conn.getHeaders();
			
			// Static auth header should be present
			expect(headers['X-API-Key']).toBe('static-key');
			
			// Promise should be converted to empty object
			expect(typeof headers['X-Dynamic-Token']).toBe('object');
			expect(headers['X-Dynamic-Token']).toEqual({});
		});

		it('should handle Promise in toObject()', () => {
			const conn = new Connection({
				name: 'test-connection',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					key1: 'value1',
					promiseParam: Promise.resolve('promise-value')
				},
				headers: {
					'Content-Type': 'application/json',
					'X-Promise-Header': Promise.resolve('header-promise')
				}
			});

			// Should not throw when calling toObject()
			const obj = conn.toObject();
			
			// Should have the expected structure
			expect(obj.parameters).toBeDefined();
			expect(obj.headers).toBeDefined();
			
			// Regular values should be preserved
			expect(obj.parameters.key1).toBe('value1');
			expect(obj.headers['Content-Type']).toBe('application/json');
			
			// Promises should be converted to empty objects
			expect(obj.parameters.promiseParam).toEqual({});
			expect(obj.headers['X-Promise-Header']).toEqual({});
		});

		it('should handle nested Promises in connection properties', () => {
			const conn = new Connection({
				name: 'test-connection',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					config: {
						apiKey: 'test-key',
						nested: {
							token: Promise.resolve('nested-promise')
						}
					}
				}
			});

			// Should not throw
			const params = conn.getParameters();
			
			// Regular nested properties should be preserved
			expect(params.config.apiKey).toBe('test-key');
			
			// Nested Promise should be converted to empty object
			expect(params.config.nested.token).toEqual({});
		});

		it('should handle Promises in Connections collection', () => {
			const connections = new Connections();
			
			connections.add(new Connection({
				name: 'conn1',
				host: 'api1.example.com',
				path: '/test1',
				parameters: {
					key: 'value',
					promise: Promise.resolve('test')
				}
			}));

			connections.add(new Connection({
				name: 'conn2',
				host: 'api2.example.com',
				path: '/test2',
				headers: {
					'Authorization': Promise.resolve('Bearer token')
				}
			}));

			// Should not throw when getting connections
			const conn1 = connections.get('conn1');
			const conn2 = connections.get('conn2');
			
			// Should be able to get parameters/headers without errors
			const params1 = conn1.getParameters();
			const headers2 = conn2.getHeaders();
			
			expect(params1.key).toBe('value');
			expect(params1.promise).toEqual({});
			expect(headers2['Authorization']).toEqual({});
		});

		it('should handle rejected Promises gracefully', () => {
			const rejectedPromise = Promise.reject(new Error('test error'));
			// Suppress unhandled rejection warning
			rejectedPromise.catch(() => {});

			const conn = new Connection({
				name: 'test-connection',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					key: 'value',
					rejected: rejectedPromise
				}
			});

			// Should not throw
			const params = conn.getParameters();
			
			expect(params.key).toBe('value');
			expect(params.rejected).toEqual({});
		});

		it('should handle pending Promises', () => {
			const pendingPromise = new Promise((resolve) => {
				// Never resolves
			});

			const conn = new Connection({
				name: 'test-connection',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					key: 'value',
					pending: pendingPromise
				}
			});

			// Should not throw
			const params = conn.getParameters();
			
			expect(params.key).toBe('value');
			expect(params.pending).toEqual({});
		});

		it('should handle mixed Promise and non-Promise values', () => {
			const conn = new Connection({
				name: 'test-connection',
				host: 'api.example.com',
				path: '/test',
				parameters: {
					string: 'value',
					number: 42,
					boolean: true,
					null: null,
					promise: Promise.resolve('test'),
					object: { nested: 'value' },
					array: [1, 2, 3]
				}
			});

			// Should not throw
			const params = conn.getParameters();
			
			// All non-Promise values should be preserved
			expect(params.string).toBe('value');
			expect(params.number).toBe(42);
			expect(params.boolean).toBe(true);
			expect(params.null).toBe(null);
			expect(params.object).toEqual({ nested: 'value' });
			expect(params.array).toEqual([1, 2, 3]);
			
			// Promise should be converted
			expect(params.promise).toEqual({});
		});

	});
 })
