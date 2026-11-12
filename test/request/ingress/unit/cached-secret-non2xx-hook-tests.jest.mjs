/**
 * Preservation test for the non-2xx branch of
 * CachedParameterSecret._requestSecretsFromLambdaExtension().
 *
 * Purpose: pin today's contract (resolved result and the single warning line)
 * BEFORE the base-class hook `_logNon2xxResponse` is added, so the refactor can be
 * shown not to change what CachedSecret and CachedSsmParameter do.
 *
 * Setup: the Lambda extension HTTP request is mocked with test/helpers/extension-mock.mjs.
 * Teardown: mocks are restored in afterEach. No environment variable is changed.
 * Each test uses a secret or parameter id unique to it because CachedParameterSecrets
 * has no reset.
 *
 * Requirements: 4.2
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import http from 'http';
import { mockExtension } from '../../../helpers/extension-mock.mjs';

const tools = await import('../../../../src/lib/tools/index.js');
const { CachedSsmParameter, CachedSecret, DebugAndLog } = tools.default;

describe('CachedParameterSecret non-2xx branch (preservation)', () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('CachedSecret resolves non-2xx and writes exactly one warning line', async () => {
		const id = "non2xx-hook-preservation-secret-1";
		mockExtension.nonTwoXxWithJson(jest, http, 403);
		const warnSpy = jest.spyOn(DebugAndLog, "warn").mockImplementation(() => {});

		const secret = new CachedSecret(id);
		const result = await secret._requestSecretsFromLambdaExtension();

		expect(result).toEqual({ ok: false, value: null, reason: "non-2xx" });
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy.mock.calls[0]).toEqual([
			`CachedParameterSecret http: Non-2xx 403 for /secretsmanager/get?secretId=${id}&withDecryption=true`
		]);
	});

	it('CachedSsmParameter resolves non-2xx and writes exactly one warning line', async () => {
		const name = "/non2xx-hook-preservation/param-1";
		mockExtension.nonTwoXxWithJson(jest, http, 403);
		const warnSpy = jest.spyOn(DebugAndLog, "warn").mockImplementation(() => {});

		const param = new CachedSsmParameter(name);
		const result = await param._requestSecretsFromLambdaExtension();

		expect(result).toEqual({ ok: false, value: null, reason: "non-2xx" });
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy.mock.calls[0]).toEqual([
			`CachedParameterSecret http: Non-2xx 403 for /systemsmanager/parameters/get/?name=${encodeURIComponent(name)}&withDecryption=true`
		]);
	});

});
