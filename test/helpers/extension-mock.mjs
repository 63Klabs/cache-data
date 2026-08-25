/**
 * Reusable mock factories for the Lambda Parameters and Secrets extension HTTP request.
 *
 * Usage in tests:
 *   import { mockExtension } from '../../helpers/extension-mock.mjs';
 *   ...
 *   mockExtension.success(jest, http, { Parameter: { Name: '/x', Value: 'y' } });
 *
 * All factories spy on the Node.js `http` module's `request` method using
 * jest.spyOn so they are restored by jest.restoreAllMocks().
 *
 * Req 21.1 — provides factories for: 2xx SSM body, 2xx secret body,
 * ECONNREFUSED, timeout, non-2xx with JSON body, 2xx with malformed body.
 */

import { EventEmitter } from 'events';

/**
 * Builds a mock http.request spy using provided callbacks.
 *
 * @param {object} jest - Jest global
 * @param {object} http - The 'http' module imported in the test
 * @param {function} responseFactory - (options) => { statusCode, body: string }
 * @param {function|null} errorFactory - (req) => void  — if set, emits an error instead
 * @param {boolean} [isTimeout=false] - emit 'timeout' on the request instead of response
 */
function _mockHttpRequest(jest, http, responseFactory, errorFactory = null, isTimeout = false) {
	return jest.spyOn(http, 'request').mockImplementation((options, callback) => {
		const req = new EventEmitter();
		req.end = jest.fn();
		req.destroy = jest.fn();

		setImmediate(() => {
			if (isTimeout) {
				req.emit('timeout');
				return;
			}
			if (errorFactory) {
				errorFactory(req);
				return;
			}
			const { statusCode, body } = responseFactory(options);
			const res = new EventEmitter();
			res.statusCode = statusCode;
			callback(res);
			setImmediate(() => {
				res.emit('data', body);
				res.emit('end');
			});
		});

		return req;
	});
}

export const mockExtension = {

	/**
	 * 2xx success with an SSM parameter response body.
	 * @param {object} jest
	 * @param {object} http
	 * @param {object} [paramValue] - Optional value to embed in the Parameter
	 */
	ssmSuccess(jest, http, paramValue = { Name: '/test/param', Value: 'test-value', Type: 'String' }) {
		const body = JSON.stringify({ Parameter: paramValue });
		return _mockHttpRequest(jest, http, () => ({ statusCode: 200, body }));
	},

	/**
	 * 2xx success with a Secrets Manager secret response body.
	 */
	secretSuccess(jest, http, secretString = '{"key":"value"}') {
		const body = JSON.stringify({
			ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:test',
			Name: 'test-secret',
			SecretString: secretString,
			VersionId: 'abc123',
			VersionStages: ['AWSCURRENT']
		});
		return _mockHttpRequest(jest, http, () => ({ statusCode: 200, body }));
	},

	/**
	 * ECONNREFUSED — extension is not installed.
	 */
	connectionRefused(jest, http) {
		return _mockHttpRequest(jest, http, null, (req) => {
			const err = new Error('connect ECONNREFUSED 127.0.0.1:2773');
			err.code = 'ECONNREFUSED';
			req.emit('error', err);
		});
	},

	/**
	 * Request timeout.
	 */
	timeout(jest, http) {
		return _mockHttpRequest(jest, http, null, null, true);
	},

	/**
	 * Non-2xx status with a JSON body (e.g. 400 error from extension).
	 */
	nonTwoXxWithJson(jest, http, statusCode = 400) {
		const body = JSON.stringify({ error: 'BadRequest' });
		return _mockHttpRequest(jest, http, () => ({ statusCode, body }));
	},

	/**
	 * 2xx but malformed (non-parseable) body.
	 */
	malformedBody(jest, http) {
		return _mockHttpRequest(jest, http, () => ({ statusCode: 200, body: 'not valid json {{{' }));
	}

};
