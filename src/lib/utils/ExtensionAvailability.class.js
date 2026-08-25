'use strict';

/**
 * ExtensionAvailability — availability state machine for the
 * AWS Parameters and Secrets Lambda Extension.
 *
 * Determines whether the extension can be used for parameter/secret retrieval
 * and provides the transport decision to callers. Resolution is memoized
 * after the first determination so the process pays the detection cost at most once.
 *
 * Detection order (Req 9.2-9.7):
 *   1. Explicit override set by setOverride() — takes precedence over everything
 *   2. Environment heuristic (evaluate()) — no network call, fast
 *   3. Observed connection refusal during first retrieval attempt — markUnavailable()
 *   4. Successful retrieval — markAvailable()
 *
 * Stateless from the caller's perspective; process-global state is held in
 * private static fields. Tests must call reset() between runs.
 *
 * @private
 * @see design.md § ExtensionAvailability
 */
class ExtensionAvailability {

	// -------------------------------------------------------------------------
	// State constants
	// -------------------------------------------------------------------------

	static STATE = Object.freeze({
		UNKNOWN:     'unknown',
		AVAILABLE:   'available',
		UNAVAILABLE: 'unavailable'
	});

	static REASON = Object.freeze({
		OVERRIDE:          'override',
		NO_SESSION_TOKEN:  'no-session-token',
		CONNECTION_REFUSED:'connection-refused',
		TIMEOUT:           'timeout',
		PROBED_OK:         'probed-ok'
	});

	// -------------------------------------------------------------------------
	// Private state
	// -------------------------------------------------------------------------

	static #state    = 'unknown';
	static #reason   = null;
	static #override = null;   // null | true | false

	// -------------------------------------------------------------------------
	// Override
	// -------------------------------------------------------------------------

	/**
	 * Sets an explicit override. When set, this takes precedence over every
	 * heuristic and probe (Req 9.2). Pass null to clear.
	 *
	 * @param {boolean|null} useExtension
	 */
	static setOverride(useExtension) {
		ExtensionAvailability.#override = (useExtension === null) ? null : Boolean(useExtension);
		// Re-evaluate immediately so state is consistent
		ExtensionAvailability.evaluate();
	}

	// -------------------------------------------------------------------------
	// Heuristic evaluation (no network call)
	// -------------------------------------------------------------------------

	/**
	 * Applies environment heuristics and updates the internal state accordingly.
	 * Does NOT issue any network request.
	 *
	 * Heuristic (Req 9.3-9.5):
	 *   - Explicit override → AVAILABLE or UNAVAILABLE
	 *   - AWS_SESSION_TOKEN absent/empty → UNAVAILABLE (extension cannot work without it)
	 *   - Otherwise → UNKNOWN (first retrieval attempt will determine)
	 *
	 * @returns {string} The new state string
	 */
	static evaluate() {
		// 1. Override always wins
		if (ExtensionAvailability.#override !== null) {
			if (ExtensionAvailability.#override) {
				ExtensionAvailability.#state  = ExtensionAvailability.STATE.AVAILABLE;
				ExtensionAvailability.#reason = ExtensionAvailability.REASON.OVERRIDE;
			} else {
				ExtensionAvailability.#state  = ExtensionAvailability.STATE.UNAVAILABLE;
				ExtensionAvailability.#reason = ExtensionAvailability.REASON.OVERRIDE;
			}
			return ExtensionAvailability.#state;
		}

		// 2. Without a session token the extension cannot authenticate (Req 9.4)
		const token = process.env.AWS_SESSION_TOKEN;
		const hasToken = (typeof token === 'string' && token.length > 0);
		if (!hasToken) {
			ExtensionAvailability.#state  = ExtensionAvailability.STATE.UNAVAILABLE;
			ExtensionAvailability.#reason = ExtensionAvailability.REASON.NO_SESSION_TOKEN;
			return ExtensionAvailability.#state;
		}

		// 3. Inconclusive — first retrieval attempt will call markAvailable/markUnavailable
		ExtensionAvailability.#state  = ExtensionAvailability.STATE.UNKNOWN;
		ExtensionAvailability.#reason = null;
		return ExtensionAvailability.#state;
	}

	// -------------------------------------------------------------------------
	// State transitions from observed outcomes
	// -------------------------------------------------------------------------

	/**
	 * Records that the extension is unavailable and should not be retried.
	 * Only transitions if not already decided (Req 9.9).
	 *
	 * @param {string} reason - A value from ExtensionAvailability.REASON
	 */
	static markUnavailable(reason) {
		// >! Once availability is decided, do not re-evaluate on subsequent calls (Req 9.9)
		if (ExtensionAvailability.#state !== ExtensionAvailability.STATE.AVAILABLE) {
			ExtensionAvailability.#state  = ExtensionAvailability.STATE.UNAVAILABLE;
			ExtensionAvailability.#reason = reason;
		}
	}

	/**
	 * Records that the extension successfully responded.
	 * Only transitions from UNKNOWN (Req 9.9).
	 *
	 * @param {string} [reason] - Optional reason code
	 */
	static markAvailable(reason = ExtensionAvailability.REASON.PROBED_OK) {
		if (ExtensionAvailability.#state === ExtensionAvailability.STATE.UNKNOWN) {
			ExtensionAvailability.#state  = ExtensionAvailability.STATE.AVAILABLE;
			ExtensionAvailability.#reason = reason;
		}
	}

	// -------------------------------------------------------------------------
	// Transport decision
	// -------------------------------------------------------------------------

	/**
	 * Returns the transport to use for a single retrieval by name.
	 *
	 * Callers must have called evaluate() at least once before calling this.
	 * If state is still UNKNOWN the extension is attempted (optimistic) and
	 * the outcome will update the state via markAvailable/markUnavailable.
	 *
	 * @returns {'layer'|'sdk'}
	 */
	static transportForRetrieval() {
		// If the heuristic has not been applied yet, apply it now
		if (ExtensionAvailability.#state === ExtensionAvailability.STATE.UNKNOWN &&
			ExtensionAvailability.#reason === null) {
			ExtensionAvailability.evaluate();
		}
		return (ExtensionAvailability.#state === ExtensionAvailability.STATE.UNAVAILABLE)
			? 'sdk'
			: 'layer';   // AVAILABLE or UNKNOWN both try the layer first
	}

	// -------------------------------------------------------------------------
	// Port and hostname resolution
	// -------------------------------------------------------------------------

	/**
	 * Returns the extension hostname. Defaults to the public static on
	 * CachedParameterSecret for backwards compatibility (Req 9.6).
	 *
	 * @returns {string}
	 */
	static hostname() {
		// Lazily read CachedParameterSecret.hostname at call time
		// (avoids a require cycle by not importing at module scope)
		try {
			const { CachedParameterSecret } = require('../tools/CachedParametersSecrets.classes.js');
			return CachedParameterSecret.hostname;
		} catch {
			return 'localhost';
		}
	}

	/**
	 * Returns the extension port.
	 *
	 * Precedence (Req 9.5):
	 *   1. PARAMETERS_SECRETS_EXTENSION_HTTP_PORT env var (when set by the Lambda service)
	 *   2. CachedParameterSecret.port (default "2773", publicly writable for compat)
	 *
	 * @returns {string}
	 */
	static port() {
		const envPort = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT;
		if (typeof envPort === 'string' && envPort.length > 0) {
			return envPort;
		}
		try {
			const { CachedParameterSecret } = require('../tools/CachedParametersSecrets.classes.js');
			return CachedParameterSecret.port;
		} catch {
			return '2773';
		}
	}

	// -------------------------------------------------------------------------
	// Introspection
	// -------------------------------------------------------------------------

	/**
	 * Returns a snapshot of current availability state for diagnostics.
	 * Never includes parameter or secret values (Req 13.6).
	 *
	 * @returns {{state: string, reason: string|null, hostname: string, port: string, transport: string}}
	 */
	static toObject() {
		return {
			state:     ExtensionAvailability.#state,
			reason:    ExtensionAvailability.#reason,
			hostname:  ExtensionAvailability.hostname(),
			port:      ExtensionAvailability.port(),
			transport: ExtensionAvailability.transportForRetrieval()
		};
	}

	// -------------------------------------------------------------------------
	// Test seam
	// -------------------------------------------------------------------------

	/**
	 * Resets all state to the initial UNKNOWN condition.
	 * FOR TESTING ONLY — call in beforeEach to ensure test isolation.
	 */
	static reset() {
		ExtensionAvailability.#state    = 'unknown';
		ExtensionAvailability.#reason   = null;
		ExtensionAvailability.#override = null;
	}

}

module.exports = ExtensionAvailability;
