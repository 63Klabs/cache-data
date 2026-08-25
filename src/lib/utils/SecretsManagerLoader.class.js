'use strict';

const ParameterKeySafety = require('./ParameterKeySafety.class.js');
const DebugAndLog = require('../tools/DebugAndLog.class.js');

/**
 * SecretsManagerLoader — retrieves Secrets Manager secrets and groups them
 * into the same `{ group: { secretName: value } }` store shape used by
 * ParameterStoreLoader.
 *
 * Secret names may contain "/" (e.g. "myapp/db/credentials") and are stored
 * verbatim as a single key via setGrouped() — they are NOT split on "/" or
 * segment-validated. See design.md Known Limitation 1.
 *
 * When parseJson is true for an entry, the SecretString is parsed and keys
 * are nested as store[group][secretName][key]. Every parsed key is validated
 * through ParameterKeySafety (Req 14.7).
 *
 * Stateless. All methods static.
 *
 * @private
 * @see design.md § SecretsManagerLoader
 */
class SecretsManagerLoader {

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	/**
	 * Retrieve and store the secrets described by entries.
	 *
	 * @param {Array<{group: string, names: string[], parseJson?: boolean}>} entries
	 * @returns {Promise<{store: object, skipped: Array, failed: Array}>}
	 */
	static async load(entries) {
		const store = {};
		const skipped = [];
		const failed = [];

		if (!entries || entries.length === 0) {
			return { store, skipped, failed };
		}

		// Lazily require AWS to avoid circular dependencies
		const { AWS } = require('../tools/AWS.classes.js');

		for (const entry of entries) {
			const group = entry.group;
			const names = Array.isArray(entry.names) ? entry.names : [];

			for (const secretName of names) {
				try {
					// >! Secret names are stored verbatim — NOT validated through isSafeKey()
					// >! because they may contain "/" (e.g. "myapp/db/credentials").
					// >! The group IS validated (Req 7.2 via setGrouped).
					// >! Known Limitation 1 in design.md.
					const response = await AWS.secrets.get({ SecretId: secretName });

					const rawValue = SecretsManagerLoader.#resolveValue(entry, response, secretName, store, group, skipped);

					if (rawValue !== null) {
						// rawValue is returned when:
						//   (a) parseJson=false — store the raw string
						//   (b) parseJson=true but JSON is invalid — fallback to raw string (Req 14.8)
						const groupCheck = ParameterKeySafety.checkKey(group);
						if (!groupCheck.safe) {
							DebugAndLog.warn(
								`SecretsManagerLoader: Skipping secret "${secretName}" — ` +
								`group "${group}" failed key validation (${groupCheck.reason})`
							);
							skipped.push({ name: secretName, group, reason: groupCheck.reason });
						} else {
							// >! Own-property check on the group before assigning (Req 1.1)
							if (!Object.prototype.hasOwnProperty.call(store, group)) {
								store[group] = {};
							}
							// >! Direct bracket assignment with the verbatim secret name.
							// >! Secret names may contain "/" — they are not segment-validated (Known Limitation 1).
							store[group][secretName] = rawValue;
						}
					}

				} catch (error) {
					DebugAndLog.error(
						`SecretsManagerLoader: Failed to retrieve secret "${secretName}": ${error.message}`,
						error.stack
					);
					failed.push({ name: secretName, group, reason: error.message });
				}
			}
		}

		return { store, skipped, failed };
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Resolves the value from a GetSecretValue response and writes it into the store.
	 *
	 * For raw storage, returns the string so the caller can write it.
	 * For parseJson, writes directly into the store and returns null.
	 *
	 * @param {object} entry
	 * @param {object} response  - GetSecretValue response
	 * @param {string} secretName
	 * @param {object} store
	 * @param {string} group
	 * @param {Array}  skipped
	 * @returns {string|null} raw string for raw storage; null when parseJson handled the write or on error
	 */
	static #resolveValue(entry, response, secretName, store, group, skipped) {
		const parseJson = entry.parseJson === true;

		// Binary-only secrets omit SecretString — treat as unresolved (Known Limitation 2)
		if (typeof response.SecretString !== 'string') {
			DebugAndLog.warn(
				`SecretsManagerLoader: Secret "${secretName}" has no SecretString ` +
				`(binary secrets are not supported). Skipping.`
			);
			skipped.push({ name: secretName, group, reason: 'binary-secret' });
			return null;
		}

		const raw = response.SecretString;

		if (!parseJson) {
			return raw;
		}

		// >! parseJson: parse the SecretString and nest under the secret name.
		// >! Keys produced by JSON.parse are attacker-influenced and MUST go through
		// >! ParameterKeySafety before any bracket-assignment (Req 14.7, design P22).
		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch {
			DebugAndLog.warn(
				`SecretsManagerLoader: parseJson enabled for "${secretName}" but value is not valid JSON. ` +
				`Storing raw string instead. (Req 14.8)`
			);
			return raw;  // caller writes the raw string
		}

		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			// Scalar JSON (number, boolean, array) — store as raw string
			return raw;
		}

		// Create the group own-property if absent
		if (!Object.prototype.hasOwnProperty.call(store, group)) {
			// Validate the group key
			if (!ParameterKeySafety.isSafeKey(group)) {
				DebugAndLog.warn(`SecretsManagerLoader: Group "${group}" failed key validation — skipping`);
				skipped.push({ name: secretName, group, reason: 'unsafe-group' });
				return null;
			}
			store[group] = {};
		}

		// Create the secretName level
		if (!Object.prototype.hasOwnProperty.call(store[group], secretName)) {
			store[group][secretName] = {};
		}

		// Write each parsed key through ParameterKeySafety
		for (const [key, value] of Object.entries(parsed)) {
			// >! Every key from JSON.parse goes through validation (Req 14.7)
			if (!ParameterKeySafety.isSafeKey(key)) {
				DebugAndLog.warn(
					`SecretsManagerLoader: Skipping unsafe parsed key "${key}" from secret "${secretName}" in group "${group}"`
				);
				skipped.push({ name: `${secretName}.${key}`, group, reason: 'unsafe-parsed-key' });
				continue;
			}
			store[group][secretName][key] = String(value);
		}

		return null;  // handled above, no further write needed
	}

}

module.exports = SecretsManagerLoader;
