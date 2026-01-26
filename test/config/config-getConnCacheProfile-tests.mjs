import assert from 'assert';
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

assert.ok(result.conn);
assert.ok(result.cacheProfile);
assert.strictEqual(result.conn.host, 'api.example.com');
assert.strictEqual(result.cacheProfile.profile, 'default');
assert.strictEqual(result.cacheProfile.defaultExpirationInSeconds, 3600);
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

assert.ok(result.conn);
assert.strictEqual(result.cacheProfile, null);
});

it('should return null for both when connection not found', () => {
const connections = new Connections();
Config._connections = connections;

const result = Config.getConnCacheProfile('missing-conn', 'default');

assert.strictEqual(result.conn, null);
assert.strictEqual(result.cacheProfile, null);
});

it('should return null for both when connections not initialized', () => {
const result = Config.getConnCacheProfile('any-conn', 'any-profile');

assert.strictEqual(result.conn, null);
assert.strictEqual(result.cacheProfile, null);
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

assert.strictEqual(result2.conn.host, 'api.example.com');
assert.strictEqual(result2.cacheProfile.defaultExpirationInSeconds, 3600);
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

assert.ok(result.conn);
assert.strictEqual(result.conn.parameters.normalKey, 'value');
assert.deepStrictEqual(result.conn.parameters.promiseKey, {});
});

});
