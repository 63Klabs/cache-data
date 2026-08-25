/**
 * Tests for CachedParameterSecrets.init(), info(), clear() — Task 13
 * Req 12.1-12.10, 13.1-13.9; design.md Properties 20, 21
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const tools = await import('../../src/lib/tools/index.js');
const { CachedParameterSecrets, CachedSsmParameter, CachedSecret } = tools.default;
const ExtensionAvailability = (await import('../../src/lib/utils/ExtensionAvailability.class.js')).default;

const ORIGINAL_TOKEN = process.env.AWS_SESSION_TOKEN;

beforeEach(() => {
	CachedParameterSecrets.clear();
	ExtensionAvailability.reset();
	process.env.AWS_SESSION_TOKEN = 'test-token';
});

afterEach(() => {
	jest.restoreAllMocks();
	CachedParameterSecrets.clear();
	ExtensionAvailability.reset();
	if (ORIGINAL_TOKEN === undefined) delete process.env.AWS_SESSION_TOKEN;
	else process.env.AWS_SESSION_TOKEN = ORIGINAL_TOKEN;
});

// ---------------------------------------------------------------------------
// clear() (Req 13.7, 13.8)
// ---------------------------------------------------------------------------

describe('CachedParameterSecrets.clear() (Req 13.7-13.8)', () => {

	it('resets the registry to empty', () => {
		new CachedSsmParameter('/test/param1');
		new CachedSsmParameter('/test/param2');
		expect(CachedParameterSecrets.getNames()).toHaveLength(2);

		CachedParameterSecrets.clear();
		expect(CachedParameterSecrets.getNames()).toHaveLength(0);
	});

	it('after clear, new instances are the only registrations', () => {
		new CachedSsmParameter('/old/param');
		CachedParameterSecrets.clear();
		new CachedSsmParameter('/new/param');
		expect(CachedParameterSecrets.getNames()).toEqual(['/new/param']);
	});

});

// ---------------------------------------------------------------------------
// Constructor dedupe (Req 12.9)
// ---------------------------------------------------------------------------

describe('Constructor dedupe guard (Req 12.9)', () => {

	it('constructing the same name twice does not create two registry entries', () => {
		new CachedSsmParameter('/test/param');
		new CachedSsmParameter('/test/param');  // duplicate
		expect(CachedParameterSecrets.getNames().filter(n => n === '/test/param')).toHaveLength(1);
	});

	it('different names create separate entries', () => {
		new CachedSsmParameter('/test/param1');
		new CachedSsmParameter('/test/param2');
		expect(CachedParameterSecrets.getNames()).toHaveLength(2);
	});

});

// ---------------------------------------------------------------------------
// init() — enumerated SSM names (Req 12.1-12.8)
// ---------------------------------------------------------------------------

describe('CachedParameterSecrets.init(): SSM enumerated names (Req 12.1-12.7)', () => {

	it('registers CachedSsmParameter instances for each enumerated name', async () => {
		const result = await CachedParameterSecrets.init({
			ssmParameters: [
				{ group: 'app', path: '/myapp/prod/', names: ['authUsername', 'authPassword'] }
			]
		});

		expect(result.registered).toBe(2);
		expect(CachedParameterSecrets.getNames()).toContain('/myapp/prod/authUsername');
		expect(CachedParameterSecrets.getNames()).toContain('/myapp/prod/authPassword');

		const p = CachedParameterSecrets.get('/myapp/prod/authUsername');
		expect(p).toBeInstanceOf(CachedSsmParameter);
	});

	it('returns a promise (Req 12.5)', async () => {
		const result = CachedParameterSecrets.init({
			ssmParameters: [{ group: 'app', path: '/test/', names: ['x'] }]
		});
		expect(typeof result.then).toBe('function');
		await result;
	});

	it('deduplicates: init() + direct construction of same name registers once (Req 12.9)', async () => {
		new CachedSsmParameter('/myapp/prod/authUsername');  // manual registration first

		await CachedParameterSecrets.init({
			ssmParameters: [
				{ group: 'app', path: '/myapp/prod/', names: ['authUsername'] }
			]
		});

		expect(CachedParameterSecrets.getNames().filter(n => n === '/myapp/prod/authUsername')).toHaveLength(1);
	});

});

// ---------------------------------------------------------------------------
// init() — secrets (Req 12.6, 12.7)
// ---------------------------------------------------------------------------

describe('CachedParameterSecrets.init(): secrets (Req 12.6)', () => {

	it('registers CachedSecret instances for each secret name', async () => {
		const result = await CachedParameterSecrets.init({
			secrets: [{ group: 'db', names: ['myapp/db/credentials'] }]
		});

		expect(result.registered).toBe(1);
		const s = CachedParameterSecrets.get('myapp/db/credentials');
		expect(s).toBeInstanceOf(CachedSecret);
	});

	it('accepts both ssmParameters and secrets in one call (Req 12.3)', async () => {
		const result = await CachedParameterSecrets.init({
			ssmParameters: [{ group: 'app', path: '/test/', names: ['x'] }],
			secrets: [{ group: 'db', names: ['my-secret'] }]
		});

		expect(result.registered).toBe(2);
	});

});

// ---------------------------------------------------------------------------
// info() (Req 13.1-13.6)
// ---------------------------------------------------------------------------

describe('CachedParameterSecrets.info() (Req 13.1-13.6)', () => {

	it('returns all required fields', () => {
		const info = CachedParameterSecrets.info();
		expect(info).toHaveProperty('availability');
		expect(info).toHaveProperty('registered');
		expect(info).toHaveProperty('counts');
		expect(info.counts).toHaveProperty('total');
	});

	it('reports availability state (Req 13.2)', () => {
		ExtensionAvailability.markAvailable();
		const info = CachedParameterSecrets.info();
		expect(info.availability.state).toBe('available');
	});

	it('reports hostname and port (Req 13.3)', () => {
		const info = CachedParameterSecrets.info();
		expect(typeof info.availability.hostname).toBe('string');
		expect(typeof info.availability.port).toBe('string');
	});

	it('reports registered names and resolution status (Req 13.5)', () => {
		new CachedSsmParameter('/test/p1');
		const info = CachedParameterSecrets.info();
		expect(info.registered).toHaveLength(1);
		expect(info.registered[0].name).toBe('/test/p1');
		expect(typeof info.registered[0].isValid).toBe('boolean');
	});

	it('Property 21: info() does NOT include any value (Req 13.6)', () => {
		const param = new CachedSsmParameter('/test/param');
		// Manually set a value
		param.value = { Parameter: { Name: '/test/param', Value: 'SECRET_VALUE' } };
		param.cache.status = 1;

		const info = CachedParameterSecrets.info();
		const infoStr = JSON.stringify(info);

		expect(infoStr).not.toContain('SECRET_VALUE');
	});

	it('registered cache field is a copy, not the live reference', () => {
		const param = new CachedSsmParameter('/test/p');
		const info = CachedParameterSecrets.info();
		const registeredCache = info.registered[0].cache;

		// Mutating the param's cache should not affect the info snapshot
		param.cache.status = 99;
		expect(registeredCache.status).not.toBe(99);
	});

	it('counts.total matches registered length', () => {
		new CachedSsmParameter('/a');
		new CachedSsmParameter('/b');
		new CachedSecret('c');
		const info = CachedParameterSecrets.info();
		expect(info.counts.total).toBe(3);
		expect(info.registered).toHaveLength(3);
	});

});

// ---------------------------------------------------------------------------
// Property 20: registry dedupe (Req 12.9)
// ---------------------------------------------------------------------------

describe('Property 20: registry dedupe', () => {

	it('same name registered multiple ways produces exactly one entry', async () => {
		// Direct construction + init() with the same name
		new CachedSsmParameter('/myapp/prod/key1');
		await CachedParameterSecrets.init({
			ssmParameters: [{ group: 'app', path: '/myapp/prod/', names: ['key1'] }]
		});
		await CachedParameterSecrets.init({
			ssmParameters: [{ group: 'app', path: '/myapp/prod/', names: ['key1'] }]
		});

		const allNames = CachedParameterSecrets.getNames();
		const countOfKey1 = allNames.filter(n => n === '/myapp/prod/key1').length;
		expect(countOfKey1).toBe(1);
	});

});

// ---------------------------------------------------------------------------
// prime() JSDoc fix (Req 13.9)
// ---------------------------------------------------------------------------

describe('prime() contract (Req 13.9)', () => {

	it('prime() resolves a boolean', async () => {
		new CachedSsmParameter('/test/p');
		// Mock the extension to return ECONNREFUSED so it falls back to SDK
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn().mockRejectedValue(new Error('Network error')),
			getByPath: jest.fn(),
			sdk: {}
		});

		const result = await CachedParameterSecrets.prime();
		expect(typeof result).toBe('boolean');
	});

});
