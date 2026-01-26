import { expect } from 'chai';
import assert from 'assert';

import { Connection, ConnectionAuthentication, Connections } from '../../src/lib/tools/index.js';

describe("Test Connection, Connections, and ConnectionAuthentication Classes", () => {
	describe("Test Connection Class", () => {
		it('toString with defaults', () => {
			let conn = new Connection({
				host: 'api.chadkluck.net',
				path: '/games/'
			})

			expect(conn.toString()).to.equal("null null null://api.chadkluck.net/games/")
	
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
			assert.strictEqual(params.apiKey, 'test-key');
			
			// Promise should be converted to empty object by safeClone fallback
			assert.strictEqual(typeof params.token, 'object');
			assert.deepStrictEqual(params.token, {});
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
			assert.strictEqual(headers['Content-Type'], 'application/json');
			
			// Promise should be converted to empty object
			assert.strictEqual(typeof headers['Authorization'], 'object');
			assert.deepStrictEqual(headers['Authorization'], {});
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
			assert.strictEqual(params.apiKey, 'static-key');
			
			// Promise should be converted to empty object
			assert.strictEqual(typeof params.dynamicToken, 'object');
			assert.deepStrictEqual(params.dynamicToken, {});
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
			assert.strictEqual(headers['X-API-Key'], 'static-key');
			
			// Promise should be converted to empty object
			assert.strictEqual(typeof headers['X-Dynamic-Token'], 'object');
			assert.deepStrictEqual(headers['X-Dynamic-Token'], {});
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
			assert.ok(obj.parameters);
			assert.ok(obj.headers);
			
			// Regular values should be preserved
			assert.strictEqual(obj.parameters.key1, 'value1');
			assert.strictEqual(obj.headers['Content-Type'], 'application/json');
			
			// Promises should be converted to empty objects
			assert.deepStrictEqual(obj.parameters.promiseParam, {});
			assert.deepStrictEqual(obj.headers['X-Promise-Header'], {});
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
			assert.strictEqual(params.config.apiKey, 'test-key');
			
			// Nested Promise should be converted to empty object
			assert.deepStrictEqual(params.config.nested.token, {});
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
			
			assert.strictEqual(params1.key, 'value');
			assert.deepStrictEqual(params1.promise, {});
			assert.deepStrictEqual(headers2['Authorization'], {});
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
			
			assert.strictEqual(params.key, 'value');
			assert.deepStrictEqual(params.rejected, {});
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
			
			assert.strictEqual(params.key, 'value');
			assert.deepStrictEqual(params.pending, {});
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
			assert.strictEqual(params.string, 'value');
			assert.strictEqual(params.number, 42);
			assert.strictEqual(params.boolean, true);
			assert.strictEqual(params.null, null);
			assert.deepStrictEqual(params.object, { nested: 'value' });
			assert.deepStrictEqual(params.array, [1, 2, 3]);
			
			// Promise should be converted
			assert.deepStrictEqual(params.promise, {});
		});

	});
 })