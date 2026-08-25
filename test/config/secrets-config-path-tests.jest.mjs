/**
 * Tests for SecretsManagerLoader and AppConfig.init({ secrets })
 * Req 14.1-14.10; design.md Property 22
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const tools = await import('../../src/lib/tools/index.js');
const { AppConfig } = tools.default;
const SecretsManagerLoader = (await import('../../src/lib/utils/SecretsManagerLoader.class.js')).default;

beforeEach(() => {
	AppConfig._promises = [];
	AppConfig._promise = null;
	AppConfig._settings = null;
	AppConfig._connections = null;
	AppConfig._ssmParameters = null;
	AppConfig._parametersResolved = null;
	AppConfig._secretsResolved = null;
});

afterEach(() => {
	jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// SecretsManagerLoader unit tests
// ---------------------------------------------------------------------------

describe('SecretsManagerLoader: basic retrieval (Req 14.3, 14.4)', () => {

	it('stores a raw secret string under group[secretName]', async () => {
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {},
			get: jest.fn().mockResolvedValue({
				ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:myapp/db',
				Name: 'myapp/db',
				SecretString: 'raw-secret-value',
				VersionId: 'v1'
			}),
			sdk: {}, available: true, reason: null
		});

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: ['myapp/db'] }
		]);

		// Raw string stored verbatim under group[secretName] (Req 14.3, 14.4)
		expect(result.store.app['myapp/db']).toBe('raw-secret-value');
	});

	it('handles multiple secrets in one entry', async () => {
		const mockGet = jest.fn()
			.mockResolvedValueOnce({ SecretString: 'val1', VersionId: 'v1' })
			.mockResolvedValueOnce({ SecretString: 'val2', VersionId: 'v1' });
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {}, get: mockGet, sdk: {}, available: true, reason: null
		});

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: ['secret1', 'secret2'] }
		]);

		expect(result.store.app.secret1).toBe('val1');
		expect(result.store.app.secret2).toBe('val2');
	});

	it('empty entries returns empty store', async () => {
		const result = await SecretsManagerLoader.load([]);
		expect(result.store).toEqual({});
		expect(result.failed).toHaveLength(0);
	});

});

describe('SecretsManagerLoader: parseJson (Req 14.5, 14.6)', () => {

	it('parseJson: nests parsed keys under group[secretName][key]', async () => {
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {},
			get: jest.fn().mockResolvedValue({
				SecretString: '{"username":"admin","password":"s3cr3t"}',
				VersionId: 'v1'
			}),
			sdk: {}, available: true, reason: null
		});

		const result = await SecretsManagerLoader.load([
			{ group: 'db', names: ['myapp/db/credentials'], parseJson: true }
		]);

		expect(result.store.db['myapp/db/credentials'].username).toBe('admin');
		expect(result.store.db['myapp/db/credentials'].password).toBe('s3cr3t');
	});

	it('parseJson: invalid JSON → stores raw string (Req 14.8)', async () => {
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {},
			get: jest.fn().mockResolvedValue({
				SecretString: 'not-valid-json{{{',
				VersionId: 'v1'
			}),
			sdk: {}, available: true, reason: null
		});

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: ['bad-secret'], parseJson: true }
		]);

		expect(result.store.app['bad-secret']).toBe('not-valid-json{{{');
	});

	it('Property 22: parseJson filters __proto__, constructor, prototype keys', async () => {
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {},
			get: jest.fn().mockResolvedValue({
				SecretString: '{"normalKey":"safe","__proto__":"polluted","constructor":"evil","prototype":"bad"}',
				VersionId: 'v1'
			}),
			sdk: {}, available: true, reason: null
		});

		const before = Object.getOwnPropertyNames(Object.prototype);

		const result = await SecretsManagerLoader.load([
			{ group: 'sec', names: ['test/secret'], parseJson: true }
		]);

		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);

		// Normal key stored
		expect(result.store.sec?.['test/secret']?.normalKey).toBe('safe');
		// Dangerous keys skipped
		const stored = result.store.sec?.['test/secret'] || {};
		expect(Object.keys(stored)).not.toContain('__proto__');
		expect(Object.keys(stored)).not.toContain('constructor');
		expect(Object.keys(stored)).not.toContain('prototype');
		// Reported in skipped
		expect(result.skipped.some(s => s.name.includes('__proto__'))).toBe(true);
	});

	it('Property 22: parseJson filters prototype-reachable keys (toString, valueOf, etc.)', async () => {
		const protoKeys = Object.getOwnPropertyNames(Object.prototype)
			.filter(k => /^[a-zA-Z][a-zA-Z0-9]*$/.test(k))
			.slice(0, 3);

		const secretPayload = Object.fromEntries([
			['normalKey', 'safe'],
			...protoKeys.map(k => [k, 'evil'])
		]);

		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {},
			get: jest.fn().mockResolvedValue({
				SecretString: JSON.stringify(secretPayload),
				VersionId: 'v1'
			}),
			sdk: {}, available: true, reason: null
		});

		const before = Object.getOwnPropertyNames(Object.prototype);
		const result = await SecretsManagerLoader.load([
			{ group: 'sec', names: ['test/secret'], parseJson: true }
		]);
		const after = Object.getOwnPropertyNames(Object.prototype);

		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
		expect(result.store.sec?.['test/secret']?.normalKey).toBe('safe');
	});

});

describe('SecretsManagerLoader: binary secrets (Known Limitation 2)', () => {

	it('binary-only secret (no SecretString) is reported and skipped', async () => {
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {},
			get: jest.fn().mockResolvedValue({
				// No SecretString — binary secret
				ARN: 'arn:...',
				Name: 'binary-secret',
				SecretBinary: Buffer.from('binary-data').toString('base64'),
				VersionId: 'v1'
			}),
			sdk: {}, available: true, reason: null
		});

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: ['binary-secret'] }
		]);

		expect(result.store?.app?.['binary-secret']).toBeUndefined();
		expect(result.skipped.some(s => s.reason === 'binary-secret')).toBe(true);
	});

});

describe('SecretsManagerLoader: failure handling (Req 14.9)', () => {

	it('SDK failure is recorded in failed[], other secrets continue', async () => {
		const mockGet = jest.fn()
			.mockRejectedValueOnce(new Error('ResourceNotFoundException'))
			.mockResolvedValueOnce({ SecretString: 'val', VersionId: 'v1' });
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {}, get: mockGet, sdk: {}, available: true, reason: null
		});

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: ['missing-secret', 'good-secret'] }
		]);

		expect(result.failed.some(f => f.name === 'missing-secret')).toBe(true);
		expect(result.store.app?.['good-secret']).toBe('val');
	});

});

// ---------------------------------------------------------------------------
// AppConfig.init({ secrets }) integration (Req 14.1, 14.9, 14.10)
// ---------------------------------------------------------------------------

describe('AppConfig.init({ secrets }) (Req 14.1, 14.9, 14.10)', () => {

	it('registers a promise via add() and completes before promise() resolves', async () => {
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {},
			get: jest.fn().mockResolvedValue({ SecretString: 'mysecret', VersionId: 'v1' }),
			sdk: {}, available: true, reason: null
		});

		const result = AppConfig.init({
			secrets: [{ group: 'app', names: ['my/secret'] }]
		});

		expect(result).toBe(true);
		expect(AppConfig._promises).toHaveLength(1);

		await AppConfig.promise();

		expect(AppConfig._secretsResolved).toBeDefined();
		expect(AppConfig._secretsResolved.app?.['my/secret']).toBe('mysecret');
	});

	it('secrets init runs in parallel with other options (Req 14.9)', async () => {
		const mockGet = jest.fn().mockResolvedValue({ SecretString: 'val', VersionId: 'v1' });
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {}, get: mockGet, sdk: {}, available: true, reason: null
		});

		AppConfig.init({
			settings: { x: 1 },
			secrets: [{ group: 'app', names: ['s1'] }]
		});

		expect(AppConfig._promises).toHaveLength(2);
		await AppConfig.promise();

		expect(AppConfig._settings).toEqual({ x: 1 });
		expect(AppConfig._secretsResolved?.app?.s1).toBe('val');
	});

	it('secrets failure resolves false but does not block promise() (Req 16.4)', async () => {
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {},
			get: jest.fn().mockRejectedValue(new Error('AccessDenied')),
			sdk: {}, available: true, reason: null
		});

		AppConfig.init({
			secrets: [{ group: 'app', names: ['restricted'] }]
		});

		// promise() must resolve even if secrets fail
		const results = await AppConfig.promise();
		expect(Array.isArray(results)).toBe(true);
	});

});
