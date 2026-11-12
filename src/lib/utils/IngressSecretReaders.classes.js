"use strict";

/**
 * Internal secret readers used by the ingress check (IngressVerifier).
 *
 * Each reader keeps one version stage of one Secrets Manager secret warm in the
 * CachedParameterSecrets registry, so an application's own
 * `await CachedParameterSecrets.prime()` loads it. The current reader reads
 * AWSCURRENT and the previous reader reads AWSPREVIOUS.
 *
 * None of the classes in this file is exported from `src/index.js` or
 * `src/lib/tools/index.js`.
 *
 * @private
 */

const { CachedSecret } = require("../tools/CachedParametersSecrets.classes.js");
const DebugAndLog = require("../tools/DebugAndLog.class.js");

/**
 * Returns the AWS wrapper. Required lazily, as CachedParametersSecrets.classes.js does,
 * so that the AWS SDK is not loaded when this module is loaded.
 *
 * @private
 * @returns {object} The AWS wrapper class from AWS.classes.js
 */
function _getAWS() {
	return require("../tools/AWS.classes.js").AWS;
}

/**
 * The value stored by the previous reader when the secret has no AWSPREVIOUS version.
 * It has no `SecretString`, so `isValid()` is false and `secretValue()` is null, while
 * the reader's `cache.status` is 1 (a successful read, not a failure).
 *
 * @private
 * @type {Readonly<object>}
 */
const NO_PREVIOUS_VERSION = Object.freeze({});

/**
 * Decides whether an HTTP status from the Lambda extension means "no previous version".
 * The extension's answer for a missing AWSPREVIOUS version was not observed (V1 results,
 * Requirement 14.6), so every non-2xx status counts. Narrow it if the extension is exercised.
 *
 * @private
 * @param {number} statusCode - HTTP status code returned by the extension
 * @returns {boolean} true when the status is outside 200-299
 * @example
 * PREVIOUS_MISSING_STATUS(404); // true
 * PREVIOUS_MISSING_STATUS(200); // false
 */
const PREVIOUS_MISSING_STATUS = (statusCode) => {
	return typeof statusCode === "number" && (statusCode < 200 || statusCode >= 300);
};

/**
 * Shared base for the two ingress readers. Reads one version stage of a secret through the
 * existing transport selection (Lambda extension when available, SDK otherwise), waits
 * 30 seconds after a failed read before `needsRefresh()` is true again, never stays in the
 * refreshing state, and logs once per failure episode. It never logs a secret value.
 *
 * Do not instantiate this class directly. Use IngressCurrentSecretReader or
 * IngressPreviousSecretReader, which set `STAGE` so that the stage is known when the
 * base constructor registers the instance in CachedParameterSecrets.
 *
 * @private
 * @extends CachedSecret
 * @example
 * // Through a subclass
 * const reader = new IngressCurrentSecretReader("my-ingress-secret");
 * await reader.prime();
 * if (reader.hasSettled()) {
 *   const value = reader.secretValue(); // string or null
 * }
 */
class IngressSecretReader extends CachedSecret {

	/**
	 * Version stage read by the subclass. Set by IngressCurrentSecretReader and
	 * IngressPreviousSecretReader.
	 * @type {string|null}
	 */
	static STAGE = null;

	/**
	 * Milliseconds that `needsRefresh()` stays false after a failed read (Requirement 4.11).
	 * @type {number}
	 */
	static RETRY_WAIT_AFTER_FAILURE_MS = 30000;

	#settled = false;
	#failing = false;
	#lastFailureAt = 0;

	/**
	 * Registry key. It differs from the secret id and from the other reader's key (Requirement 4.3).
	 * It reads no private field, because the base constructor calls it before the fields exist.
	 *
	 * @returns {string} `<secretId>#<STAGE>`
	 * @example
	 * new IngressCurrentSecretReader("my-secret").getName(); // "my-secret#AWSCURRENT"
	 */
	getName() {
		return `${this.name}#${this.constructor.STAGE}`;
	}

	/**
	 * Name and class tag used in debug output. It contains the secret id and the stage, never a value.
	 *
	 * @returns {string} `<secretId> [<ClassName> <STAGE>]`
	 * @example
	 * new IngressCurrentSecretReader("my-secret").getNameTag();
	 * // "my-secret [IngressCurrentSecretReader AWSCURRENT]"
	 */
	getNameTag() {
		return `${this.name} [${this.constructor.name} ${this.constructor.STAGE}]`;
	}

	/**
	 * Path for the Lambda extension. The secret id is encoded with `encodeURIComponent`.
	 *
	 * @returns {string} Extension request path with `versionStage`
	 * @example
	 * new IngressPreviousSecretReader("my/secret").getPath();
	 * // "/secretsmanager/get?secretId=my%2Fsecret&versionStage=AWSPREVIOUS&withDecryption=true"
	 */
	getPath() {
		const uriEncodedSecret = encodeURIComponent(this.name);
		return `/secretsmanager/get?secretId=${uriEncodedSecret}&versionStage=${this.constructor.STAGE}&withDecryption=true`;
	}

	/**
	 * Whether at least one read has finished, successfully or not.
	 *
	 * @returns {boolean} true after the first `refresh()` has ended
	 * @example
	 * reader.hasSettled(); // false before the first refresh
	 */
	hasSettled() {
		return this.#settled;
	}

	/**
	 * The secret string of the last good read.
	 *
	 * @returns {string|null} The `SecretString`, or null when there is no valid value
	 * (never read, failed read with no earlier value, or no previous version)
	 * @example
	 * const value = reader.secretValue();
	 */
	secretValue() {
		return (this.isValid() && typeof this.value.SecretString === "string") ? this.value.SecretString : null;
	}

	/**
	 * True when the value needs to be read. After a failed read it stays false for
	 * `RETRY_WAIT_AFTER_FAILURE_MS`, so an outage does not make every request wait for a failing
	 * read. `refresh()` is not blocked by this wait (Requirement 4.11).
	 *
	 * @returns {boolean} true when a read should be started
	 * @example
	 * if (reader.needsRefresh()) { reader.refresh(); }
	 */
	needsRefresh() {
		if (
			this.cache.status < 0
			&& this.#lastFailureAt !== 0
			&& (Date.now() - this.#lastFailureAt) < IngressSecretReader.RETRY_WAIT_AFTER_FAILURE_MS
		) {
			return false;
		}
		return super.needsRefresh();
	}

	/**
	 * Reads the value now, whether or not it has expired. A read that ends with `cache.status`
	 * still 0 is set to -1, so the reader can never stay in the refreshing state. The outcome is
	 * recorded for the failure episode rule.
	 *
	 * @returns {Promise<number>} -1 if error, 1 if success
	 * @example
	 * const status = await reader.refresh();
	 */
	async refresh() {
		const status = await super.refresh();
		if (this.cache.status === 0) {
			this.cache.status = -1;
		}
		this.#settled = true;
		this.#recordOutcome(this.cache.status);
		return status;
	}

	/**
	 * Reads the version stage through the SDK. Failures are not logged here;
	 * `refresh()` records the outcome once per failure episode.
	 *
	 * @returns {Promise<{ok: boolean, value: object|null, reason: string|null}>} The response,
	 * or a failure with the error message as `reason`
	 * @example
	 * const result = await reader._requestFromSdk();
	 */
	async _requestFromSdk() {
		try {
			const AWS = _getAWS();
			const response = await AWS.secrets.get({
				SecretId: this.name,
				VersionStage: this.constructor.STAGE
			});
			return { ok: true, value: response, reason: null };
		} catch (error) {
			return this._mapSdkError(error);
		}
	}

	/**
	 * Turns an SDK error into a result. The default is a failed read. The previous reader overrides it.
	 *
	 * @param {Error} error - Error thrown by the SDK call
	 * @returns {{ok: boolean, value: object|null, reason: string|null}} A failed result
	 * @example
	 * const result = reader._mapSdkError(new Error("timeout"));
	 */
	_mapSdkError(error) {
		return { ok: false, value: null, reason: error?.message || "Unknown error" };
	}

	/**
	 * Writes the first log line of a failure episode. The current reader writes an error and
	 * the previous reader writes a warning.
	 *
	 * @param {string} message - Message naming the secret id and stage, without a value
	 * @returns {void}
	 * @example
	 * reader._logFailureEpisode("Could not read ...");
	 */
	_logFailureEpisode(message) {
		DebugAndLog.warn(message);
	}

	/**
	 * Applies the episode rule: a status below 0 records the failure time and, when no episode
	 * was open, logs once. A status of 1 ends the episode.
	 *
	 * @param {number} status - `cache.status` after the read
	 * @returns {void}
	 */
	#recordOutcome(status) {
		if (status < 0) {
			this.#lastFailureAt = Date.now();
			if (!this.#failing) {
				this.#failing = true;
				this._logFailureEpisode(`${this.constructor.name}: could not read the ${this.constructor.STAGE} version of ${this.name}`);
			}
		} else if (status === 1) {
			this.#failing = false;
			this.#lastFailureAt = 0;
		}
	}
}

/**
 * Reads the AWSCURRENT version of a secret. A failure episode is logged once with
 * `DebugAndLog.error`, and the last good value is kept.
 *
 * @private
 * @extends IngressSecretReader
 * @example
 * const reader = new IngressCurrentSecretReader("my-ingress-secret");
 * await reader.prime();
 * const value = reader.secretValue();
 */
class IngressCurrentSecretReader extends IngressSecretReader {

	static STAGE = "AWSCURRENT";

	/**
	 * Writes the first log line of a failure episode as an error.
	 *
	 * @param {string} message - Message naming the secret id and stage, without a value
	 * @returns {void}
	 * @example
	 * reader._logFailureEpisode("IngressCurrentSecretReader: could not read the AWSCURRENT version of my-secret");
	 */
	_logFailureEpisode(message) {
		DebugAndLog.error(message);
	}
}

/**
 * Reads the AWSPREVIOUS version of a secret. A secret with no previous version is a
 * successful read (`cache.status` 1, value without `SecretString`), logged at debug level
 * only. Any other failure is logged once per episode with `DebugAndLog.warn`.
 *
 * @private
 * @extends IngressSecretReader
 * @example
 * const reader = new IngressPreviousSecretReader("my-ingress-secret");
 * await reader.prime();
 * const value = reader.secretValue(); // null when there is no previous version
 */
class IngressPreviousSecretReader extends IngressSecretReader {

	static STAGE = "AWSPREVIOUS";

	/**
	 * Value stored when the secret has no previous version.
	 * @type {Readonly<object>}
	 */
	static NO_PREVIOUS_VERSION = NO_PREVIOUS_VERSION;

	#lastNon2xxStatus = null;

	/**
	 * Records the status instead of writing the default warning, and logs at debug level that
	 * the answer is treated as "no previous version". Called by the base class (the hook).
	 *
	 * @param {number} statusCode - HTTP status code returned by the extension
	 * @param {string} path - Extension request path (not logged)
	 * @returns {void}
	 * @example
	 * reader._logNon2xxResponse(404, "/secretsmanager/get?secretId=my-secret");
	 */
	_logNon2xxResponse(statusCode, path) { // eslint-disable-line no-unused-vars
		this.#lastNon2xxStatus = statusCode;
		DebugAndLog.debug(`IngressPreviousSecretReader: HTTP ${statusCode} for the previous version of ${this.name}; treating as no previous version`);
	}

	/**
	 * Requests the previous version from the Lambda extension. A non-2xx answer that
	 * `PREVIOUS_MISSING_STATUS` accepts becomes a successful "no previous version" result.
	 *
	 * @returns {Promise<{ok: boolean, value: object|null, reason: string|null}>} The extension
	 * result, or a successful result holding NO_PREVIOUS_VERSION
	 * @example
	 * const result = await reader._requestSecretsFromLambdaExtension();
	 */
	async _requestSecretsFromLambdaExtension() {
		this.#lastNon2xxStatus = null;
		const result = await super._requestSecretsFromLambdaExtension();
		if (!result.ok && result.reason === "non-2xx" && PREVIOUS_MISSING_STATUS(this.#lastNon2xxStatus)) {
			return { ok: true, value: NO_PREVIOUS_VERSION, reason: null };
		}
		return result;
	}

	/**
	 * Maps an SDK error whose `name` is `ResourceNotFoundException` to "no previous version"
	 * (observed in V1, Requirement 4.10). Any other error is a failed read.
	 *
	 * @param {Error} error - Error thrown by the SDK call
	 * @returns {{ok: boolean, value: object|null, reason: string|null}} Success with
	 * NO_PREVIOUS_VERSION, or a failed result
	 * @example
	 * const error = Object.assign(new Error("not found"), { name: "ResourceNotFoundException" });
	 * reader._mapSdkError(error).ok; // true
	 */
	_mapSdkError(error) {
		if (error?.name === "ResourceNotFoundException") {
			DebugAndLog.debug(`IngressPreviousSecretReader: no previous version of ${this.name}`);
			return { ok: true, value: NO_PREVIOUS_VERSION, reason: null };
		}
		return super._mapSdkError(error);
	}
}

module.exports = {
	IngressSecretReader,
	IngressCurrentSecretReader,
	IngressPreviousSecretReader,
	NO_PREVIOUS_VERSION,
	PREVIOUS_MISSING_STATUS
};
