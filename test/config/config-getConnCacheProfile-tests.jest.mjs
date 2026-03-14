import { describe, it, expect, afterEach } from '@jest/globals';
import { _ConfigSuperClass as Config, Connection, Connections } from '../../src/lib/tools/index.js';

describe("Config.getConnCacheProfile() Tests", () => {

	afterEach(() => {
		Config._connections = null;
	});

	it('should return both conn and cacheProfile when both exist', () => {
		const connections = new Connections();
		connections.add(new Connection({
			name: 'test-conn',
			method: 'GET',
			host: 'api.example.com',
			path: '/data',
			parameters: { apiKey: 'test-key' },
			cache: [{
				profile: 'default',
				defaultExpirationInSeconds: 3600,
				hostId: 'api',
				pathId: 'data'
			}]
		}));
		Config._connections = connections;

		const result = Config.getConnCacheProfile('test-conn', 'default');

		expect(result.conn).toBeTruthy();
		expect(result.cacheProfile).toBeTruthy();
		expect(result.conn.host).toBe('api.example.com');
		expect(result.cacheProfile.profile).toBe('default');
		expect(result.cacheProfile.defaultExpirationInSeconds).toBe(3600);
	});

	it('should return conn but null cacheProfile when profile not found', () => {
		const connections = new Connections();
		connections.add(new Connection({
			name: 'test-conn',
			method: 'GET',
			host: 'api.example.com',
			path: '/data'
		}));
		Config._connections = connections;

		const result = Config.getConnCacheProfile('test-conn', 'missing');

		expect(result.conn).toBeTruthy();
		expect(result.cacheProfile).toBeNull();
	});

	it('should return null for both when connection not found', () => {
		const connections = new Connections();
		Config._connections = connections;

		const result = Config.getConnCacheProfile('missing-conn', 'default');

		expect(result.conn).toBeNull();
		expect(result.cacheProfile).toBeNull();
	});

	it('should return null for both when connections not initialized', () => {
		const result = Config.getConnCacheProfile('any-conn', 'any-profile');

		expect(result.conn).toBeNull();
		expect(result.cacheProfile).toBeNull();
	});

	it('should return defensive copies that do not affect internal state', () => {
		const connections = new Connections();
		connections.add(new Connection({
			name: 'test-conn',
			method: 'GET',
			host: 'api.example.com',
			path: '/data',
			parameters: { apiKey: 'test-key' },
			cache: [{
				profile: 'default',
				defaultExpirationInSeconds: 3600,
				hostId: 'api',
				pathId: 'data'
			}]
		}));
		Config._connections = connections;

		const result1 = Config.getConnCacheProfile('test-conn', 'default');
		result1.conn.host = 'modified.example.com';
		result1.cacheProfile.defaultExpirationInSeconds = 9999;

		const result2 = Config.getConnCacheProfile('test-conn', 'default');

		expect(result2.conn.host).toBe('api.example.com');
		expect(result2.cacheProfile.defaultExpirationInSeconds).toBe(3600);
	});

	it('should handle Promises in connection parameters gracefully', () => {
		const connections = new Connections();
		connections.add(new Connection({
			name: 'promise-conn',
			method: 'GET',
			host: 'api.example.com',
			path: '/test',
			parameters: {
				normalKey: 'value',
				promiseKey: Promise.resolve('promise-value')
			},
			cache: [{
				profile: 'test',
				defaultExpirationInSeconds: 3600,
				hostId: 'test',
				pathId: 'test'
			}]
		}));
		Config._connections = connections;

		const result = Config.getConnCacheProfile('promise-conn', 'test');

		expect(result.conn).toBeTruthy();
		expect(result.conn.parameters.normalKey).toBe('value');
		expect(result.conn.parameters.promiseKey).toEqual({});
	});

});
