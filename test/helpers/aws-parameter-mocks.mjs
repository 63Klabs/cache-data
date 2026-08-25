/**
 * Reusable mock factories for AWS.ssm and AWS.secrets getter spies.
 *
 * Usage:
 *   import { mockSsm, mockSecrets } from '../../helpers/aws-parameter-mocks.mjs';
 *   mockSsm.getByName(jest, tools, { parameters: [...], invalidParameters: [] });
 *
 * Req 21.2-21.3 — provides complete objects with multi-page NextToken and
 * InvalidParameters factories.
 */

/**
 * @param {object} jest
 * @param {object} tools  - the tools module (await import('../../src/lib/tools/index.js'))
 * @param {object} overrides - partial override for the returned object
 * @returns {jest.SpyInstance}
 */
function _spyOnSsm(jest, tools, overrides = {}) {
	const base = {
		client: {},
		getByName: jest.fn().mockResolvedValue({ Parameters: [], InvalidParameters: [] }),
		getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
		sdk: {}
	};
	return jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({ ...base, ...overrides });
}

function _spyOnSecrets(jest, tools, overrides = {}) {
	const base = {
		client: {},
		get: jest.fn().mockResolvedValue({ SecretString: '{}' }),
		sdk: {},
		available: true,
		reason: null
	};
	return jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({ ...base, ...overrides });
}

export const mockSsm = {

	/** Standard single-page getByName response. */
	getByName(jest, tools, { parameters = [], invalidParameters = [] } = {}) {
		const fn = jest.fn().mockResolvedValue({ Parameters: parameters, InvalidParameters: invalidParameters });
		_spyOnSsm(jest, tools, { getByName: fn });
		return fn;
	},

	/** Paginated getByPath response across multiple pages. */
	getByPathPaginated(jest, tools, pages) {
		// pages: array of { parameters: [...], nextToken?: string }
		const fn = jest.fn();
		pages.forEach(({ parameters, nextToken }, i) => {
			const response = { Parameters: parameters };
			if (nextToken) response.NextToken = nextToken;
			fn.mockResolvedValueOnce(response);
		});
		// Final call after all pages should resolve empty
		fn.mockResolvedValue({ Parameters: [] });
		_spyOnSsm(jest, tools, { getByPath: fn });
		return fn;
	},

	/** Single-page getByPath. */
	getByPath(jest, tools, { parameters = [] } = {}) {
		const fn = jest.fn().mockResolvedValue({ Parameters: parameters });
		_spyOnSsm(jest, tools, { getByPath: fn });
		return fn;
	},

	/** Both getByName and getByPath. */
	both(jest, tools, { byName = { parameters: [], invalidParameters: [] }, byPath = { parameters: [] } } = {}) {
		const nameFn = jest.fn().mockResolvedValue({ Parameters: byName.parameters, InvalidParameters: byName.invalidParameters || [] });
		const pathFn = jest.fn().mockResolvedValue({ Parameters: byPath.parameters });
		_spyOnSsm(jest, tools, { getByName: nameFn, getByPath: pathFn });
		return { getByName: nameFn, getByPath: pathFn };
	}
};

export const mockSecrets = {

	/** Standard successful secret retrieval. */
	success(jest, tools, secretString = '{"key":"value"}') {
		const fn = jest.fn().mockResolvedValue({
			ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:test',
			Name: 'test-secret',
			SecretString: secretString,
			VersionId: 'abc123'
		});
		_spyOnSecrets(jest, tools, { get: fn });
		return fn;
	},

	/** Failed secret retrieval. */
	failure(jest, tools, errorMessage = 'ResourceNotFoundException') {
		const fn = jest.fn().mockRejectedValue(new Error(errorMessage));
		_spyOnSecrets(jest, tools, { get: fn });
		return fn;
	}
};
