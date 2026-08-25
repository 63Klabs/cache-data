/**
 * SDK fallback transport tests — Tasks 9 and 10.
 *
 * Tests that CachedSsmParameter and CachedSecret fall back to the SDK when the
 * Lambda extension is unavailable, and that the wrapper shapes are preserved.
 *
 * Req 11.1-11.13; design.md Properties 12, 13, 14
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import http from 'http';
import { mockExtension } from '../helpers/extension-mock.mjs';

const tools = await import('../../src/lib/tools/index.js');
const { CachedSsmParameter, CachedSecret, CachedParameterSecrets } = tools.default;
const ExtensionAvailability = (await import('../../src/lib/utils/ExtensionAvailability.class.js')).default;

const ORIGINAL_TOKEN = process.env.AWS_SESSION_TOKEN;

beforeEach(() => {
	ExtensionAvailability.reset();
	process.env.AWS_SESSION_TOKEN = 'test-token';
	CachedParameterSecrets.clear();
});

afterEach(() => {
	jest.restoreAllMocks();
	if (ORIGINAL_TOKEN === undefined) delete process.env.AWS_SESSION_TOKEN;
	else process.env.AWS_SESSION_TOKEN = ORIGINAL_TOKEN;
	CachedParameterSecrets.clear();
	ExtensionAvailability.reset();
});

// ---------------------------------------------------------------------------
// 1. Layer success path (unchanged behaviour)
// ---------------------------------------------------------------------------

describe('Layer path: success (Req 11.2)', () => {

	it('CachedSsmParameter retrieves via layer when available', async () => {
		mockExtension.ssmSuccess(jest, http, {
			Name: '/test/param',
			Value: 'layer-value',
			Type: 'SecureString'
		});

		const param = new CachedSsmParameter('/test/param');
		await param.prime();

		expect(param.isValid()).toBe(true);
		expect(param.sync_getValue()).toBe('layer-value');
		expect(param.cache.status).toBe(1);
	});

	it('CachedSecret retrieves via layer when available', async () => {
		mockExtension.secretSuccess(jest, http, 'my-secret-value');

		const secret = new CachedSecret('my-secret');
		await secret.prime();

		expect(secret.isValid()).toBe(true);
		expect(secret.sync_getValue()).toBe('my-secret-value');
	});

});

// ---------------------------------------------------------------------------
// 2. ECONNREFUSED → SDK fallback (Req 11.1, 9.8)
// ---------------------------------------------------------------------------

describe('SDK fallback on ECONNREFUSED (Req 11.1, 11.9)', () => {

	it('CachedSsmParameter falls back to SDK on ECONNREFUSED', async () => {
		// First call: ECONNREFUSED
		mockExtension.connectionRefused(jest, http);
		// Mock SDK
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/test/param', Value: 'sdk-value', Type: 'String' }],
				InvalidParameters: []
			}),
			getByPath: jest.fn(),
			sdk: {}
		});

		const param = new CachedSsmParameter('/test/param');
		await param.prime();

		expect(param.isValid()).toBe(true);
		expect(param.sync_getValue()).toBe('sdk-value');
		expect(param.cache.status).toBe(1);
		// Availability should now be UNAVAILABLE (Req 9.8)
		expect(ExtensionAvailability.toObject().state).toBe('unavailable');
	});

	it('CachedSecret falls back to SDK on ECONNREFUSED', async () => {
		mockExtension.connectionRefused(jest, http);
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {},
			get: jest.fn().mockResolvedValue({
				ARN: 'arn:...',
				Name: 'my-secret',
				SecretString: '{"apiKey":"secret123"}',
				VersionId: 'v1'
			}),
			sdk: {},
			available: true,
			reason: null
		});

		const secret = new CachedSecret('my-secret');
		await secret.prime();

		expect(secret.isValid()).toBe(true);
		expect(secret.sync_getValue()).toBe('{"apiKey":"secret123"}');
	});

	it('subsequent retrievals use SDK directly after UNAVAILABLE (Req 9.9, 9.10)', async () => {
		// Force unavailable via override
		ExtensionAvailability.setOverride(false);

		const mockGetByName = jest.fn().mockResolvedValue({
			Parameters: [{ Name: '/test/p', Value: 'val', Type: 'String' }],
			InvalidParameters: []
		});
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {}, getByName: mockGetByName, getByPath: jest.fn(), sdk: {}
		});

		const param = new CachedSsmParameter('/test/p');
		await param.prime();

		// Should NOT have touched the layer at all
		expect(mockGetByName).toHaveBeenCalledTimes(1);
		expect(param.sync_getValue()).toBe('val');
	});

});

// ---------------------------------------------------------------------------
// 3. Wrapper shape invariance (Req 11.5, 11.6, Properties 13, 14)
// ---------------------------------------------------------------------------

describe('Wrapper shape invariance (Req 11.5, 11.6, Property 13)', () => {

	it('SDK SSM value normalised to {Parameter:{...}} satisfies isValid()', async () => {
		ExtensionAvailability.setOverride(false);
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/x', Value: 'v' }],
				InvalidParameters: []
			}),
			getByPath: jest.fn(),
			sdk: {}
		});

		const p = new CachedSsmParameter('/x');
		await p.prime();

		expect(p.isValid()).toBe(true);
		expect('Parameter' in p.value).toBe(true);
		expect(p.sync_getValue()).toBe('v');
	});

	it('SDK secrets value satisfies "SecretString" in value and isValid()', async () => {
		ExtensionAvailability.setOverride(false);
		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {},
			get: jest.fn().mockResolvedValue({
				ARN: 'arn:...',
				Name: 'sec',
				SecretString: 'top-secret',
				VersionId: 'v1'
			}),
			sdk: {},
			available: true,
			reason: null
		});

		const s = new CachedSecret('sec');
		await s.prime();

		expect(s.isValid()).toBe(true);
		expect('SecretString' in s.value).toBe(true);
		expect(s.sync_getValue()).toBe('top-secret');
	});

	it('Property 14: sync_getValue throws while unresolved regardless of transport setting', () => {
		ExtensionAvailability.setOverride(false);
		const p = new CachedSsmParameter('/not-yet-loaded');
		expect(() => p.sync_getValue()).toThrow('CachedParameterSecret Error');
	});

	it('Property 14: toString() returns placeholder while unresolved', () => {
		const p = new CachedSsmParameter('/pending');
		expect(p.toString()).toContain('[Pending:');
	});

});

// ---------------------------------------------------------------------------
// 4. Non-2xx response — layer stays AVAILABLE, no SDK fallback (design decision)
// ---------------------------------------------------------------------------

describe('Non-2xx from extension — no SDK fallback (design decision)', () => {

	it('non-2xx leaves availability AVAILABLE, returns status=-1', async () => {
		mockExtension.nonTwoXxWithJson(jest, http, 400);

		const param = new CachedSsmParameter('/bad-param');
		const status = await param.refresh();

		expect(status).toBe(-1);
		expect(ExtensionAvailability.toObject().state).toBe('available');
	});

});

// ---------------------------------------------------------------------------
// 5. Extension mock — request diagnosis (Req 10.1-10.7)
// ---------------------------------------------------------------------------

describe('Extension request failure classification (Req 10.1-10.7)', () => {

	it('ECONNREFUSED → reason=connection-refused', async () => {
		mockExtension.connectionRefused(jest, http);
		const param = new CachedSsmParameter('/x');
		const result = await param._requestSecretsFromLambdaExtension();
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('connection-refused');
	});

	it('timeout → reason=timeout', async () => {
		mockExtension.timeout(jest, http);
		const param = new CachedSsmParameter('/x');
		const result = await param._requestSecretsFromLambdaExtension();
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('timeout');
	});

	it('non-2xx with JSON body → ok=false, reason=non-2xx', async () => {
		mockExtension.nonTwoXxWithJson(jest, http, 403);
		const param = new CachedSsmParameter('/x');
		const result = await param._requestSecretsFromLambdaExtension();
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('non-2xx');
	});

	it('malformed body → ok=false, reason=parse-error', async () => {
		mockExtension.malformedBody(jest, http);
		const param = new CachedSsmParameter('/x');
		const result = await param._requestSecretsFromLambdaExtension();
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('parse-error');
	});

	it('success → ok=true, value is the parsed object', async () => {
		mockExtension.ssmSuccess(jest, http, { Name: '/x', Value: 'hello' });
		const param = new CachedSsmParameter('/x');
		const result = await param._requestSecretsFromLambdaExtension();
		expect(result.ok).toBe(true);
		expect(result.value).toHaveProperty('Parameter');
		expect(result.value.Parameter.Value).toBe('hello');
	});

	it('_requestSecretsFromLambdaExtension never rejects (Req 10.6)', async () => {
		// Extension not reachable — ECONNREFUSED
		mockExtension.connectionRefused(jest, http);

		const param = new CachedSsmParameter('/x');
		// Must resolve (not reject) even on connection error
		const result = await param._requestSecretsFromLambdaExtension();
		expect(typeof result).toBe('object');
		expect(result).toHaveProperty('ok');
	});

});

// ---------------------------------------------------------------------------
// 6. Property 12: transport equivalence
// ---------------------------------------------------------------------------

describe('Property 12: transport equivalence (Req 11.7-11.8)', () => {

	it('getValue() returns the same string from either transport', async () => {
		const VALUE = 'equivalent-value';

		// --- Layer ---
		mockExtension.ssmSuccess(jest, http, { Name: '/test/p', Value: VALUE });
		ExtensionAvailability.reset();
		process.env.AWS_SESSION_TOKEN = 'token';

		const pLayer = new CachedSsmParameter('/test/p');
		const layerVal = await pLayer.getValue();

		// --- SDK ---
		jest.restoreAllMocks();
		
		ExtensionAvailability.reset();
		ExtensionAvailability.setOverride(false);

		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/test/p', Value: VALUE }],
				InvalidParameters: []
			}),
			getByPath: jest.fn(),
			sdk: {}
		});

		const pSdk = new CachedSsmParameter('/test/p');
		const sdkVal = await pSdk.getValue();

		expect(layerVal).toBe(sdkVal);
	});

});
