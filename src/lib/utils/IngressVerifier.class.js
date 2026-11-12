"use strict";

/**
 * Internal ingress verification for ClientRequest.
 *
 * Decides, without any AWS call on the request path, whether a request came through the
 * CloudFront distribution that holds the ingress secret. The secret is read by two private
 * readers (AWSCURRENT and AWSPREVIOUS) that live in the CachedParameterSecrets registry.
 *
 * This class is not exported from `src/index.js` or `src/lib/tools/index.js` and is not
 * named in `types/`.
 *
 * @private
 */

const crypto = require("node:crypto");
const DebugAndLog = require("../tools/DebugAndLog.class.js");
const { CachedParameterSecrets } = require("../tools/CachedParametersSecrets.classes.js");
const ParameterKeySafety = require("./ParameterKeySafety.class.js");
const {
	IngressCurrentSecretReader,
	IngressPreviousSecretReader
} = require("./IngressSecretReaders.classes.js");

/** Value of the ingress for a request that is not subject to the check, or that came through the distribution. */
const INGRESS_VALUES = Object.freeze({
	DIRECT: "direct",
	CLOUDFRONT: "cloudfront",
	UNVERIFIED: "unverified"
});

/** The only values of `reason` in a result, and in the INGRESS_UNVERIFIED log line. */
const REASON_VALUES = Object.freeze({
	MISSING_HEADER: "missing-header",
	MISMATCH: "mismatch",
	SECRET_NOT_PRIMED: "secret-not-primed",
	SECRET_UNAVAILABLE: "secret-unavailable",
	SECRET_UNUSABLE: "secret-unusable",
	BAD_CONFIGURATION: "bad-configuration"
});

/**
 * Preallocated, frozen results. `evaluate()` returns one of these, so the request path allocates nothing.
 * `reason` is null for `direct` and `cloudfront`.
 */
const RESULT_VALUES = Object.freeze({
	DIRECT: Object.freeze({ ingress: INGRESS_VALUES.DIRECT, reason: null }),
	CLOUDFRONT: Object.freeze({ ingress: INGRESS_VALUES.CLOUDFRONT, reason: null }),
	MISSING_HEADER: Object.freeze({ ingress: INGRESS_VALUES.UNVERIFIED, reason: REASON_VALUES.MISSING_HEADER }),
	MISMATCH: Object.freeze({ ingress: INGRESS_VALUES.UNVERIFIED, reason: REASON_VALUES.MISMATCH }),
	SECRET_NOT_PRIMED: Object.freeze({ ingress: INGRESS_VALUES.UNVERIFIED, reason: REASON_VALUES.SECRET_NOT_PRIMED }),
	SECRET_UNAVAILABLE: Object.freeze({ ingress: INGRESS_VALUES.UNVERIFIED, reason: REASON_VALUES.SECRET_UNAVAILABLE }),
	SECRET_UNUSABLE: Object.freeze({ ingress: INGRESS_VALUES.UNVERIFIED, reason: REASON_VALUES.SECRET_UNUSABLE }),
	BAD_CONFIGURATION: Object.freeze({ ingress: INGRESS_VALUES.UNVERIFIED, reason: REASON_VALUES.BAD_CONFIGURATION })
});

/** Logged once per episode while the current reader has never finished a read. Contains no value. */
const NOT_PRIMED_MESSAGE = "The ingress secret has not been loaded. Call await ClientRequest.prime() or await CachedParameterSecrets.prime() before creating a ClientRequest. Requests are reported as unverified until it loads.";

/** Memo marker meaning "environment variable not read yet". A Symbol never equals a real value. */
const UNREAD = Symbol("unread");

/** Parsed result for an unset, empty, or whitespace-only secret variable. */
const NAME_CONFIG_UNSET = Object.freeze({ kind: "unset", secretId: null });

/** Parsed result for a secret variable that failed validation. */
const NAME_CONFIG_INVALID = Object.freeze({ kind: "invalid", secretId: null });

/**
 * IngressVerifier - Internal ingress verification
 *
 * Static class, no instances. Reads `CACHE_DATA_INGRESS_SECRET_NAME` on every evaluation and
 * memoizes the parse by raw value, as ClientIpResolver does. Every failure to verify gives
 * `unverified` with one of six reason codes. Only an unset or empty secret variable gives
 * `direct`. The class never throws, never stores or logs the header value, and never logs a
 * secret value.
 *
 * @private
 * @example
 * // In ClientRequest.class.js, once at module scope
 * IngressVerifier.register();
 *
 * // In the ClientRequest constructor, for each request
 * const { ingress, reason } = IngressVerifier.evaluate(lowercasedHeaders);
 *
 * // Before the first request, for applications that do not use CachedParameterSecrets.prime()
 * const loaded = await IngressVerifier.prime();
 */
class IngressVerifier {

	/** Lowercase form of the platform's `X-Atlantis-Origin-Secret` header. */
	static SECRET_HEADER = "x-atlantis-origin-secret";

	/** Environment variable that holds the name or ARN of the Secrets Manager secret. */
	static ENV_SECRET_NAME = "CACHE_DATA_INGRESS_SECRET_NAME";

	/** Environment variable that holds the refresh interval in seconds. */
	static ENV_REFRESH_SECONDS = "CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS";

	/** Refresh interval used when the interval variable is unset, blank, or invalid. */
	static DEFAULT_REFRESH_SECONDS = 3600;

	/** Smallest accepted refresh interval in seconds. */
	static MIN_REFRESH_SECONDS = 60;

	/** Largest accepted refresh interval in seconds. */
	static MAX_REFRESH_SECONDS = 86400;

	/** Minimum milliseconds between the starts of two mismatch refreshes. Not a setting. */
	static MISMATCH_REFRESH_COOLDOWN_MS = 60000;

	/** The three values of `ingress`. */
	static INGRESS = INGRESS_VALUES;

	/** The six reason codes. */
	static REASON = REASON_VALUES;

	/**
	 * The frozen objects `evaluate()` returns: `DIRECT`, `CLOUDFRONT`, and one per reason code
	 * (`MISSING_HEADER`, `MISMATCH`, `SECRET_NOT_PRIMED`, `SECRET_UNAVAILABLE`, `SECRET_UNUSABLE`,
	 * `BAD_CONFIGURATION`). Each has the shape `{ ingress, reason }`.
	 */
	static RESULT = RESULT_VALUES;

	/** Last raw secret variable seen. */
	static #nameRaw = UNREAD;

	/** Parsed config for #nameRaw: `{ kind: "unset"|"ok"|"invalid", secretId: string|null }`. */
	static #nameConfig = NAME_CONFIG_UNSET;

	/** Last raw interval variable seen. */
	static #secondsRaw = UNREAD;

	/** Refresh interval parsed from #secondsRaw. */
	static #seconds = IngressVerifier.DEFAULT_REFRESH_SECONDS;

	/** Raw secret variable values already reported with an error. */
	static #reportedNames = new Set();

	/** Raw interval variable values already reported with a warning. */
	static #reportedSeconds = new Set();

	/** Failure episodes that have already been logged: keys of #failing(). */
	static #episodes = new Set();

	/** Time of the start of the last mismatch refresh. Negative infinity means "never". */
	static #lastMismatchRefreshAt = Number.NEGATIVE_INFINITY;

	/** The held reader pair: `{ secretId, seconds, current, previous }`, or null. */
	static #readers = null;

	/**
	 * Creates and registers the two readers when the secret variable is valid, so that
	 * `CachedParameterSecrets.prime()` loads them. Idempotent. Does nothing when the check
	 * is not configured or the value is invalid. Never throws.
	 *
	 * @private
	 * @returns {void}
	 * @example
	 * IngressVerifier.register();
	 */
	static register() {
		try {
			const config = IngressVerifier.#readName();
			if (config.kind === "ok") {
				IngressVerifier.#ensureReaders(config.secretId, IngressVerifier.#readSeconds());
			}
		} catch (error) {
			DebugAndLog.error(`IngressVerifier.register(): ${error?.message || "Unknown error"}`, error?.stack);
		}
	}

	/**
	 * Decides whether a request came through the distribution that holds the ingress secret.
	 *
	 * Rows are evaluated in this order and the first that applies wins: variable unset (`direct`);
	 * variable invalid (`bad-configuration`); current reader never finished a read
	 * (`secret-not-primed`); current reader holds no value (`secret-unavailable`); current value
	 * unusable (`secret-unusable`); header absent, empty, or not a string (`missing-header`);
	 * header equals the current value or a usable previous value (`cloudfront`); otherwise
	 * `mismatch`, which also starts a rate-limited, non-awaited refresh of both readers.
	 *
	 * Synchronous: no `await`, no AWS call. Never throws. The returned object is frozen and shared.
	 * Neither the header nor a secret value is stored or logged.
	 *
	 * @private
	 * @param {Object<string, *>} headers - Lowercased request header map. Any other value is treated as no header.
	 * @returns {{ingress: string, reason: (string|null)}} One of the frozen objects in `IngressVerifier.RESULT`
	 * @example
	 * const result = IngressVerifier.evaluate({ "x-atlantis-origin-secret": headerValue });
	 * if (result.ingress === IngressVerifier.INGRESS.UNVERIFIED) {
	 *   // result.reason is one of IngressVerifier.REASON
	 * }
	 */
	static evaluate(headers) {
		try {
			const config = IngressVerifier.#readName();
			if (config.kind === "unset") { return RESULT_VALUES.DIRECT; }                                                  // row 1
			if (config.kind === "invalid") { return RESULT_VALUES.BAD_CONFIGURATION; }                                    // row 2

			const readers = IngressVerifier.#ensureReaders(config.secretId, IngressVerifier.#readSeconds());

			if (!readers.current.hasSettled()) {                                                                          // row 3
				return IngressVerifier.#failing("not-primed", RESULT_VALUES.SECRET_NOT_PRIMED, NOT_PRIMED_MESSAGE);
			}

			const currentValue = readers.current.secretValue();
			if (currentValue === null) {                                                                                  // row 4
				// The reader already logged this failure episode.
				return IngressVerifier.#failing("unavailable", RESULT_VALUES.SECRET_UNAVAILABLE, null);
			}

			if (IngressVerifier.#isUnusable(currentValue)) {                                                              // row 5
				return IngressVerifier.#failing(
					"unusable",
					RESULT_VALUES.SECRET_UNUSABLE,
					`The current value of the ingress secret ${config.secretId} is empty, whitespace, or BLANK. Requests are reported as unverified until the secret holds a generated value.`
				);
			}

			// The current value is good: the not-primed, unavailable, and unusable episodes end here.
			// The "exception" episode is not ended here, because reading the header below can still throw.
			if (IngressVerifier.#episodes.size > 0) {
				IngressVerifier.#episodes.delete("not-primed");
				IngressVerifier.#episodes.delete("unavailable");
				IngressVerifier.#episodes.delete("unusable");
			}

			let outcome;
			const header = headers?.[IngressVerifier.SECRET_HEADER];
			if (typeof header !== "string" || header === "") {
				outcome = RESULT_VALUES.MISSING_HEADER;                                                                   // row 6
			} else {
				// >! Compare SHA-256 digests with timingSafeEqual. Both operands are 32 bytes, so the call cannot
				// >! throw on a length difference and the length of the header is not observable.
				// >! Both accepted values are compared on every evaluation, without stopping at the first match.
				const previousValue = readers.previous.secretValue();
				const previousIsUsable = (previousValue !== null && !IngressVerifier.#isUnusable(previousValue));
				const headerDigest = IngressVerifier.#digest(header);
				const matchesCurrent = crypto.timingSafeEqual(headerDigest, IngressVerifier.#digest(currentValue));
				const matchesPrevious = previousIsUsable
					? crypto.timingSafeEqual(headerDigest, IngressVerifier.#digest(previousValue))
					: false;

				if (matchesCurrent || matchesPrevious) {
					outcome = RESULT_VALUES.CLOUDFRONT;                                                                   // row 7
				} else {
					IngressVerifier.#startMismatchRefresh(readers);                                                       // row 8
					outcome = RESULT_VALUES.MISMATCH;
				}
			}

			// evaluate() completed without throwing: an "exception" episode ends here.
			if (IngressVerifier.#episodes.size > 0) { IngressVerifier.#episodes.delete("exception"); }
			return outcome;
		} catch (error) {
			return IngressVerifier.#failing(
				"exception",
				RESULT_VALUES.SECRET_UNAVAILABLE,
				`IngressVerifier.evaluate(): ${error?.message || "Unknown error"}`
			);
		}
	}

	/**
	 * Loads the ingress secret. Creates and registers the readers when the variable is valid
	 * and they do not exist yet, then calls `prime()` on both. Safe to call repeatedly and
	 * together with `CachedParameterSecrets.prime()`; no second read starts while one is running.
	 * A missing previous version does not make the result false. Never rejects.
	 *
	 * @private
	 * @returns {Promise<boolean>} true when the check is not configured, or when it is configured
	 * and the current reader holds a value; false when the variable is invalid or the current
	 * reader holds no value
	 * @example
	 * const loaded = await IngressVerifier.prime();
	 * if (!loaded) {
	 *   // requests will be reported as unverified
	 * }
	 */
	static async prime() {
		try {
			IngressVerifier.register();
			const config = IngressVerifier.#readName();
			if (config.kind === "unset") { return true; }
			if (config.kind === "invalid") { return false; }
			const readers = IngressVerifier.#ensureReaders(config.secretId, IngressVerifier.#readSeconds());
			await Promise.all([readers.current.prime(), readers.previous.prime()]);
			return readers.current.secretValue() !== null;
		} catch (error) {
			DebugAndLog.error(`IngressVerifier.prime(): ${error?.message || "Unknown error"}`, error?.stack);
			return false;
		}
	}

	/**
	 * Clears the memoized environment parse, the reported-value sets, the failure episodes,
	 * the mismatch refresh cooldown, and the held reader pair. It does not clear the
	 * CachedParameterSecrets registry, which has no reset: the next call that needs readers
	 * finds the ones already registered under the same keys and holds them again.
	 *
	 * FOR TESTING ONLY. WARNING: never call this in production code.
	 *
	 * @private
	 * @returns {void}
	 * @example
	 * // In a test
	 * beforeEach(() => { IngressVerifier.reset(); });
	 */
	static reset() {
		IngressVerifier.#nameRaw = UNREAD;
		IngressVerifier.#nameConfig = NAME_CONFIG_UNSET;
		IngressVerifier.#secondsRaw = UNREAD;
		IngressVerifier.#seconds = IngressVerifier.DEFAULT_REFRESH_SECONDS;
		IngressVerifier.#reportedNames = new Set();
		IngressVerifier.#reportedSeconds = new Set();
		IngressVerifier.#episodes = new Set();
		IngressVerifier.#lastMismatchRefreshAt = Number.NEGATIVE_INFINITY;
		IngressVerifier.#readers = null;
	}

	/**
	 * Reads and parses the secret variable, memoized by raw value. An invalid value is
	 * reported once per distinct raw value.
	 *
	 * @private
	 * @returns {{kind: string, secretId: (string|null)}} `unset`, `ok` with the trimmed secret id, or `invalid`
	 */
	static #readName() {
		const raw = process.env[IngressVerifier.ENV_SECRET_NAME];
		if (raw === IngressVerifier.#nameRaw) { return IngressVerifier.#nameConfig; }

		IngressVerifier.#nameRaw = raw;
		const trimmed = (typeof raw === "string") ? raw.trim() : "";

		if (trimmed === "") {
			IngressVerifier.#nameConfig = NAME_CONFIG_UNSET;
		} else if (ParameterKeySafety.checkSecretName(trimmed).safe) { // also rejects more than 2048 characters
			IngressVerifier.#nameConfig = Object.freeze({ kind: "ok", secretId: trimmed });
		} else {
			IngressVerifier.#nameConfig = NAME_CONFIG_INVALID;
			if (!IngressVerifier.#reportedNames.has(raw)) {
				IngressVerifier.#reportedNames.add(raw);
				// >! JSON.stringify escapes quotes and control characters, so an environment value can't forge or split the log line
				DebugAndLog.error(`${IngressVerifier.ENV_SECRET_NAME} is not a valid Secrets Manager secret name or ARN. Received ${JSON.stringify(raw)}. The ingress check will report unverified (bad-configuration).`);
			}
		}
		return IngressVerifier.#nameConfig;
	}

	/**
	 * Reads and parses the interval variable, memoized by raw value. Unset or blank gives the
	 * default silently. Digits only from 60 to 86400 gives that number. Anything else gives the
	 * default and one warning per distinct raw value.
	 *
	 * @private
	 * @returns {number} Refresh interval in seconds
	 */
	static #readSeconds() {
		const raw = process.env[IngressVerifier.ENV_REFRESH_SECONDS];
		if (raw === IngressVerifier.#secondsRaw) { return IngressVerifier.#seconds; }

		IngressVerifier.#secondsRaw = raw;
		const trimmed = (typeof raw === "string") ? raw.trim() : "";

		if (trimmed === "") {
			IngressVerifier.#seconds = IngressVerifier.DEFAULT_REFRESH_SECONDS;
			return IngressVerifier.#seconds;
		}

		const parsed = /^[0-9]+$/.test(trimmed) ? parseInt(trimmed, 10) : NaN;
		if (Number.isInteger(parsed) && parsed >= IngressVerifier.MIN_REFRESH_SECONDS && parsed <= IngressVerifier.MAX_REFRESH_SECONDS) {
			IngressVerifier.#seconds = parsed;
		} else {
			IngressVerifier.#seconds = IngressVerifier.DEFAULT_REFRESH_SECONDS;
			if (!IngressVerifier.#reportedSeconds.has(raw)) {
				IngressVerifier.#reportedSeconds.add(raw);
				// >! JSON.stringify escapes quotes and control characters, so an environment value can't forge or split the log line
				DebugAndLog.warn(`${IngressVerifier.ENV_REFRESH_SECONDS} must be a whole number of seconds from ${IngressVerifier.MIN_REFRESH_SECONDS} to ${IngressVerifier.MAX_REFRESH_SECONDS}. Received ${JSON.stringify(raw)}. Using the default of ${IngressVerifier.DEFAULT_REFRESH_SECONDS} seconds.`);
			}
		}
		return IngressVerifier.#seconds;
	}

	/**
	 * Returns the reader pair for a secret id, creating it when needed. A pair that is held for
	 * the same id is reused, and only has its `refreshAfter` updated when the interval changed.
	 * When the registry already holds readers under the same keys (for example after `reset()`),
	 * those are held instead of constructing duplicates that the registry would not keep.
	 *
	 * @private
	 * @param {string} secretId - Validated secret name or ARN
	 * @param {number} seconds - Refresh interval in seconds
	 * @returns {{secretId: string, seconds: number, current: IngressCurrentSecretReader, previous: IngressPreviousSecretReader}} The held pair
	 */
	static #ensureReaders(secretId, seconds) {
		const held = IngressVerifier.#readers;
		if (held !== null && held.secretId === secretId) {
			if (held.seconds !== seconds) {
				held.current.cache.refreshAfter = seconds;
				held.previous.cache.refreshAfter = seconds;
				held.seconds = seconds;
			}
			return held;
		}

		const current = IngressVerifier.#findOrCreate(IngressCurrentSecretReader, secretId, seconds);
		const previous = IngressVerifier.#findOrCreate(IngressPreviousSecretReader, secretId, seconds);
		IngressVerifier.#readers = { secretId, seconds, current, previous };
		return IngressVerifier.#readers;
	}

	/**
	 * Returns the registered reader of a class for a secret id, or constructs one (which registers it).
	 *
	 * @private
	 * @param {Function} ReaderClass - IngressCurrentSecretReader or IngressPreviousSecretReader
	 * @param {string} secretId - Validated secret name or ARN
	 * @param {number} seconds - Refresh interval in seconds
	 * @returns {IngressCurrentSecretReader|IngressPreviousSecretReader} The reader
	 */
	static #findOrCreate(ReaderClass, secretId, seconds) {
		const registered = CachedParameterSecrets.get(`${secretId}#${ReaderClass.STAGE}`);
		if (registered instanceof ReaderClass) {
			registered.cache.refreshAfter = seconds;
			return registered;
		}
		return new ReaderClass(secretId, { refreshAfter: seconds });
	}

	/**
	 * Returns the result, logging `message` once per failure episode.
	 * A key stays in the episode set until `evaluate()` reaches the comparison.
	 *
	 * @private
	 * @param {string} key - Episode key
	 * @param {{ingress: string, reason: string}} result - Result to return
	 * @param {string|null} message - Error to log on the first call of the episode, or null to log nothing
	 * @returns {{ingress: string, reason: string}} The result
	 */
	static #failing(key, result, message) {
		if (!IngressVerifier.#episodes.has(key)) {
			IngressVerifier.#episodes.add(key);
			if (message !== null) {
				DebugAndLog.error(message);
			}
		}
		return result;
	}

	/**
	 * Whether a secret value cannot be used: empty, whitespace only, or `BLANK` in any case.
	 *
	 * @private
	 * @param {string} value - Secret value
	 * @returns {boolean} true when unusable
	 */
	static #isUnusable(value) {
		const trimmed = value.trim();
		return trimmed === "" || trimmed.toUpperCase() === "BLANK";
	}

	/**
	 * SHA-256 digest of a string.
	 *
	 * @private
	 * @param {string} value - String to hash
	 * @returns {Buffer} 32-byte digest
	 */
	static #digest(value) {
		return crypto.createHash("sha256").update(value, "utf8").digest();
	}

	/**
	 * Starts a forced, non-awaited refresh of both readers, at most once per
	 * MISMATCH_REFRESH_COOLDOWN_MS, measured from the last start. `refresh()` returns the running
	 * promise when a read is already in progress, so no second read starts. Never throws.
	 *
	 * @private
	 * @param {{current: IngressCurrentSecretReader, previous: IngressPreviousSecretReader}} readers - The held pair
	 * @returns {void}
	 */
	static #startMismatchRefresh(readers) {
		const now = Date.now();
		if ((now - IngressVerifier.#lastMismatchRefreshAt) < IngressVerifier.MISMATCH_REFRESH_COOLDOWN_MS) { return; }
		IngressVerifier.#lastMismatchRefreshAt = now;

		// >! Not awaited: the request that mismatched is already answered as unverified.
		for (const reader of [readers.current, readers.previous]) {
			try {
				Promise.resolve(reader.refresh()).catch(() => {});
			} catch (error) { // eslint-disable-line no-unused-vars
				// A synchronous throw from refresh() must not reach the request.
			}
		}
	}
}

module.exports = IngressVerifier;
