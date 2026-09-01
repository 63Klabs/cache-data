'use strict';

const ParameterKeySafety = require('./ParameterKeySafety.class.js');
const DebugAndLog = require('../tools/DebugAndLog.class.js');

/**
 * SecretsManagerLoader — retrieves Secrets Manager secrets and groups them
 * into the same `{ group: { secretName: value } }` store shape used by
 * ParameterStoreLoader.
 *
 * Secret names may contain "/" (e.g. "myapp/db/credentials") and are stored
 * verbatim as a single key — they are NOT split on "/" or segment-validated
 * into nested groups. That design choice stands; the names themselves ARE
 * validated, via ParameterKeySafety.checkSecretName, which applies a wider
 * allowlist than isSafeKey (it also permits "/" and ARN punctuation) plus
 * the same DANGEROUS_KEYS / PROTOTYPE_KEYS denylists. See design.md Known
 * Limitation 1 in .kiro/specs/1-3-16-fix-ssm-param-security/.
 *
 * When parseJson is true for an entry, the SecretString is parsed and keys
 * are nested as store[group][secretName][key]. Every parsed key is validated
 * through ParameterKeySafety (Req 14.7).
 *
 * All writes into the store are delegated to ParameterKeySafety.setGroupedSecret
 * and ParameterKeySafety.setGroupedSecretMap — this class performs no bracket
 * assignment of its own (Req 2.1, 2.2).
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

		// >! Validate every group and secret name before issuing any AWS call, so a
		// >! configuration error is reported without consuming a Secrets Manager
		// >! request (Req 1.11) and the throw cannot be swallowed by the per-secret
		// >! catch below (Req 1.12).
		SecretsManagerLoader.#validateEntries(entries);

		// Lazily require AWS to avoid circular dependencies
		const { AWS } = require('../tools/AWS.classes.js');

		for (const entry of entries) {
			const group = entry.group;
			const names = Array.isArray(entry.names) ? entry.names : [];

			for (const secretName of names) {
				try {
					// >! Group and secret name were already validated by #validateEntries
					// >! before this loop ever started (Req 1.11). The calls below to
					// >! setGroupedSecret / setGroupedSecretMap re-validate internally —
					// >! that is redundant defense-in-depth, not a correctness dependency,
					// >! and it keeps these entry points safe to call from any future caller.
					const response = await AWS.secrets.get({ SecretId: secretName });

					// #resolveValue is pure with respect to the store (Task 6.2): it
					// decides *what* to store and returns a descriptor, writing nothing.
					const descriptor = SecretsManagerLoader.#resolveValue(entry, response, secretName);

					if (descriptor.kind === 'none') {
						// Binary secret — no SecretString to store.
						DebugAndLog.warn(
							`SecretsManagerLoader: Secret "${secretName}" has no SecretString ` +
							`(binary secrets are not supported). Skipping.`
						);
						skipped.push({ name: secretName, group, reason: descriptor.reason });
						continue;
					}

					if (descriptor.kind === 'map') {
						// >! Only permitted site of secret-key bracket assignment for the
						// >! parseJson path — delegated to ParameterKeySafety (Req 2.1, 2.2).
						const mapResult = ParameterKeySafety.setGroupedSecretMap(store, group, secretName, descriptor.parsed);
						if (!mapResult.assigned) {
							// Should not happen: group and secretName already passed the
							// pre-pass. Handled defensively per the return contract.
							DebugAndLog.warn(
								`SecretsManagerLoader: Skipping secret "${secretName}" — ` +
								`group "${group}" failed key validation (${mapResult.reason})`
							);
							skipped.push({ name: secretName, group, reason: mapResult.reason });
							continue;
						}
						// >! Merge setGroupedSecretMap's own skipped array, prefixing each
						// >! entry's key as "secretName.key" to match the existing reporting shape.
						for (const s of mapResult.skipped) {
							DebugAndLog.warn(
								`SecretsManagerLoader: Skipping unsafe parsed key "${s.key}" from secret "${secretName}" in group "${group}"`
							);
							skipped.push({ name: `${secretName}.${s.key}`, group, reason: s.reason });
						}
						continue;
					}

					// descriptor.kind === 'raw' — returned when:
					//   (a) parseJson=false — store the raw string
					//   (b) parseJson=true but JSON is invalid, or scalar/array JSON — fallback to raw string (Req 14.8)
					// >! Only permitted site of secret-key bracket assignment for the raw
					// >! path — delegated to ParameterKeySafety (Req 2.1, 2.2).
					const rawResult = ParameterKeySafety.setGroupedSecret(store, group, secretName, descriptor.value);
					if (!rawResult.assigned) {
						// Should not happen: group and secretName already passed the
						// pre-pass. Handled defensively per the return contract.
						DebugAndLog.warn(
							`SecretsManagerLoader: Skipping secret "${secretName}" — ` +
							`group "${group}" failed key validation (${rawResult.reason})`
						);
						skipped.push({ name: secretName, group, reason: rawResult.reason });
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
	 * Validates every entry's group and every name in entry.names before any
	 * AWS call is issued. Throws on the first offending group or name.
	 *
	 * group is validated with isSafeKey (SSM-style single-segment allowlist);
	 * each name is validated with checkSecretName (the wider Secrets Manager
	 * allowlist, which also permits "/" and ARN punctuation).
	 *
	 * // >! Runs before the AWS module is even required, so a configuration
	 * // >! error cannot consume a Secrets Manager request (Req 1.11) and the
	 * // >! throw is outside the per-secret try/catch in load(), so it cannot
	 * // >! be captured into the `failed` array (Req 1.12).
	 * // >! The secret VALUE is never available at this point and is never
	 * // >! interpolated into the thrown message (Req 1.10).
	 *
	 * @param {Array<{group: string, names: string[], parseJson?: boolean}>} entries
	 * @returns {void}
	 * @throws {Error} identifying the offending secret name (or group), the
	 *   group, and the validation failure reason, stating that the secret
	 *   would otherwise be silently unreachable
	 */
	static #validateEntries(entries) {
		for (const entry of entries) {
			const group = entry.group;
			const names = Array.isArray(entry.names) ? entry.names : [];

			const groupCheck = ParameterKeySafety.checkKey(group);
			if (!groupCheck.safe) {
				throw new Error(
					`SecretsManagerLoader: Group "${group}" has an unsafe name (${groupCheck.reason}). ` +
					`Storing it would leave the secret silently unreachable.`
				);
			}

			for (const secretName of names) {
				const nameCheck = ParameterKeySafety.checkSecretName(secretName);
				if (!nameCheck.safe) {
					throw new Error(
						`SecretsManagerLoader: Secret "${secretName}" in group "${group}" has an unsafe name ` +
						`(${nameCheck.reason}). Storing it would leave the secret silently unreachable.`
					);
				}
			}
		}
	}

	/**
	 * Resolves the value from a GetSecretValue response into a descriptor.
	 *
	 * Pure with respect to the store: this method writes nothing and mutates
	 * no caller-supplied state (Req 3.1, 5.2). It only decides *what* to
	 * store and returns one of three descriptors for the caller to act on:
	 *   - {kind: 'raw', value}    — parseJson false, or true with invalid
	 *                               JSON, or true with non-object JSON
	 *   - {kind: 'map', parsed}   — parseJson true with an object payload
	 *   - {kind: 'none', reason: 'binary-secret'} — no SecretString
	 *
	 * @param {object} entry - The entry being processed ({group, names, parseJson?})
	 * @param {object} response - GetSecretValue response
	 * @param {string} secretName - The secret name currently being resolved
	 * @returns {{kind: 'raw', value: string}|{kind: 'map', parsed: object}|{kind: 'none', reason: string}}
	 * @example
	 * SecretsManagerLoader.#resolveValue({ parseJson: false }, { SecretString: 'v1' }, 's1');
	 * // → { kind: 'raw', value: 'v1' }
	 */
	static #resolveValue(entry, response, secretName) {
		const parseJson = entry.parseJson === true;

		// Binary-only secrets omit SecretString — treat as unresolved (Known Limitation 2)
		if (typeof response.SecretString !== 'string') {
			return { kind: 'none', reason: 'binary-secret' };
		}

		const raw = response.SecretString;

		if (!parseJson) {
			return { kind: 'raw', value: raw };
		}

		// >! parseJson: parse the SecretString. Keys produced by JSON.parse are
		// >! attacker-influenced and MUST go through ParameterKeySafety before
		// >! any bracket-assignment (Req 14.7, design P22) — that dispatch now
		// >! happens in the caller, not here.
		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch {
			DebugAndLog.warn(
				`SecretsManagerLoader: parseJson enabled for "${secretName}" but value is not valid JSON. ` +
				`Storing raw string instead. (Req 14.8)`
			);
			return { kind: 'raw', value: raw };
		}

		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			// Scalar JSON (number, boolean, array) — store as raw string
			return { kind: 'raw', value: raw };
		}

		return { kind: 'map', parsed };
	}

}

module.exports = SecretsManagerLoader;
