'use strict';

/**
 * ParameterKeySafety — the single chokepoint for externally-derived key assignment.
 *
 * All bracket-assignment with a key sourced from AWS (parameter names, path segments,
 * secret key names, parsed JSON keys) MUST go through setGrouped or setGroupedPath.
 * No other code in this package may perform `obj[externalKey] = value`.
 *
 * Stateless. All methods static.
 *
 * @private
 * @see design.md § ParameterKeySafety
 */
class ParameterKeySafety {

	// -------------------------------------------------------------------------
	// Constants — module scope so they are never reallocated inside iteration
	// (Req 1.8). Three layered guards are required:
	//
	//   1. DANGEROUS_KEYS denylist — explicitly catches "__proto__", "constructor",
	//      "prototype". "__proto__" passes the VALID_KEY_PATTERN allowlist and would
	//      bypass a pattern-only check, so the denylist is a mandatory first gate (Req 1.7).
	//
	//   2. PROTOTYPE_KEYS denylist — catches all remaining own-property names of
	//      Object.prototype (toString, valueOf, hasOwnProperty, etc.) that also pass
	//      the allowlist pattern. These names cause the prototype-reachable key defect:
	//      `"toString" in {}` is true, so `paramstore["toString"]` resolves to the
	//      inherited native function rather than creating a new own property (Req 1.2-1.4).
	//
	//   3. VALID_KEY_PATTERN allowlist — rejects keys with characters not valid in
	//      AWS SSM parameter name segments, catching any future prototype members or
	//      injection attempts not covered by the denylists (Req 1.6).
	//
	// -------------------------------------------------------------------------

	// >! Primary denylist: keys that trigger __proto__ mutation or Function.prototype
	// >! access. Checked BEFORE the allowlist because "__proto__" passes the pattern.
	static DANGEROUS_KEYS = Object.freeze(["__proto__", "constructor", "prototype"]);

	// >! Secondary denylist: all remaining Object.prototype own-property names.
	// >! These satisfy VALID_KEY_PATTERN but cause the prototype-reachable key defect
	// >! because `group in {}` returns true via prototype chain lookup.
	static PROTOTYPE_KEYS = Object.freeze(
		new Set(Object.getOwnPropertyNames(Object.prototype))
	);

	// >! Allowlist: only characters valid in AWS SSM parameter name segments.
	// >! Last-resort guard for characters not covered by either denylist.
	static VALID_KEY_PATTERN = /^[a-zA-Z0-9_.-]+$/;

	// >! Maximum Secrets Manager SecretId length. Bounds the segment split in
	// >! checkSecretName before it runs, so a pathological input cannot make the
	// >! scan itself expensive (Req 1.9).
	static MAX_SECRET_NAME_LENGTH = 2048;

	// >! Wider allowlist scoped to Secrets Manager names and ARNs. A SecretId may
	// >! contain "/" (e.g. "myapp/db/credentials") and, when a full ARN is supplied,
	// >! ":" plus the ARN punctuation "+", "=", "@". VALID_KEY_PATTERN is single-segment
	// >! only and would reject both shapes, so this is a second, wider allowlist rather
	// >! than a relaxation of VALID_KEY_PATTERN. Anchored at both ends with exactly one
	// >! repetition over a character class, so it cannot backtrack (js/polynomial-redos
	// >! safe). "-" is placed last inside the character class so it is a literal, not a
	// >! range.
	// >!
	// >! This wider allowlist alone is not sufficient: "__proto__" and "toString" both
	// >! satisfy it, so DANGEROUS_KEYS and PROTOTYPE_KEYS MUST be checked before it in
	// >! checkSecretName, exactly as they are checked before VALID_KEY_PATTERN in checkKey.
	static SECRET_NAME_PATTERN = /^[a-zA-Z0-9_.+=@:/-]+$/;

	// -------------------------------------------------------------------------
	// Validation
	// -------------------------------------------------------------------------

	/**
	 * Returns true when a key is safe to use as a property name.
	 * A key is safe when it:
	 *   1. passes the VALID_KEY_PATTERN allowlist, AND
	 *   2. is not in DANGEROUS_KEYS
	 *
	 * @param {*} key
	 * @returns {boolean}
	 */
	static isSafeKey(key) {
		if (typeof key !== 'string' || key.length === 0) return false;
		// >! Check primary denylist first — "__proto__" passes the allowlist pattern
		if (ParameterKeySafety.DANGEROUS_KEYS.includes(key)) return false;
		// >! Check secondary denylist — "toString", "valueOf", etc. also pass the
		// >! allowlist but cause the prototype-reachable key defect
		if (ParameterKeySafety.PROTOTYPE_KEYS.has(key)) return false;
		return ParameterKeySafety.VALID_KEY_PATTERN.test(key);
	}

	/**
	 * Returns a {safe, reason} descriptor for a key.
	 * reason is null when safe === true.
	 *
	 * @param {*} key
	 * @returns {{safe: boolean, reason: string|null}}
	 */
	static checkKey(key) {
		if (typeof key !== 'string' || key.length === 0) {
			return { safe: false, reason: 'not-a-non-empty-string' };
		}
		// >! Primary denylist — "__proto__" would pass the pattern
		if (ParameterKeySafety.DANGEROUS_KEYS.includes(key)) {
			return { safe: false, reason: 'dangerous-key' };
		}
		// >! Secondary denylist — prototype-reachable method names
		if (ParameterKeySafety.PROTOTYPE_KEYS.has(key)) {
			return { safe: false, reason: 'prototype-key' };
		}
		if (!ParameterKeySafety.VALID_KEY_PATTERN.test(key)) {
			return { safe: false, reason: 'invalid-characters' };
		}
		return { safe: true, reason: null };
	}

	/**
	 * Returns a {safe, reason} descriptor for a Secrets Manager secret name.
	 * Unlike checkKey, "/" and ARN punctuation are permitted, because a Secrets
	 * Manager SecretId accepts both a multi-segment name such as
	 * "myapp/db/credentials" and a full ARN. The denylists (DANGEROUS_KEYS,
	 * PROTOTYPE_KEYS) are checked before the allowlist because "__proto__" and
	 * "toString" both satisfy SECRET_NAME_PATTERN.
	 *
	 * Check order:
	 *   1. non-empty string
	 *   2. length <= MAX_SECRET_NAME_LENGTH (bounds the segment split below)
	 *   3. not in DANGEROUS_KEYS
	 *   4. not in PROTOTYPE_KEYS
	 *   5. matches SECRET_NAME_PATTERN
	 *   6. every non-empty "/"-delimited segment clears checks 3 and 4
	 *
	 * Empty segments (e.g. from "a//b") are skipped rather than rejected: an
	 * empty segment cannot be a dangerous or prototype-reachable name, and
	 * rejecting it would be a behavior change with no security benefit.
	 *
	 * @param {*} name - Candidate secret name (SecretId) to validate
	 * @returns {{safe: boolean, reason: string|null}} safe is false with a
	 *   diagnostic reason, or true with reason null
	 * @example
	 * ParameterKeySafety.checkSecretName('myapp/db/credentials');
	 * // → { safe: true, reason: null }
	 *
	 * ParameterKeySafety.checkSecretName('myapp/__proto__/db');
	 * // → { safe: false, reason: 'dangerous-segment' }
	 */
	static checkSecretName(name) {
		if (typeof name !== 'string' || name.length === 0) {
			return { safe: false, reason: 'not-a-non-empty-string' };
		}
		// >! Bound the length before splitting into segments, so a pathological
		// >! input cannot make the segment scan itself expensive (Req 1.9)
		if (name.length > ParameterKeySafety.MAX_SECRET_NAME_LENGTH) {
			return { safe: false, reason: 'too-long' };
		}
		// >! Primary denylist first — "__proto__" would pass SECRET_NAME_PATTERN
		if (ParameterKeySafety.DANGEROUS_KEYS.includes(name)) {
			return { safe: false, reason: 'dangerous-key' };
		}
		// >! Secondary denylist — "toString", "valueOf", etc. also pass the
		// >! allowlist but cause the prototype-reachable key defect
		if (ParameterKeySafety.PROTOTYPE_KEYS.has(name)) {
			return { safe: false, reason: 'prototype-key' };
		}
		if (!ParameterKeySafety.SECRET_NAME_PATTERN.test(name)) {
			return { safe: false, reason: 'invalid-characters' };
		}
		// >! Defense in depth: reject a name that is safe as a whole but carries
		// >! a dangerous or prototype-reachable "/"-delimited segment, in case
		// >! future code ever splits secret names into nested groups.
		for (const seg of name.split('/')) {
			if (seg.length === 0) continue; // empty segments cannot be dangerous
			if (ParameterKeySafety.DANGEROUS_KEYS.includes(seg)) {
				return { safe: false, reason: 'dangerous-segment' };
			}
			if (ParameterKeySafety.PROTOTYPE_KEYS.has(seg)) {
				return { safe: false, reason: 'prototype-segment' };
			}
		}
		return { safe: true, reason: null };
	}

	/**
	 * Boolean form of checkSecretName.
	 *
	 * @param {*} name - Candidate secret name (SecretId) to validate
	 * @returns {boolean} true when the name is safe to use as a property name
	 * @example
	 * ParameterKeySafety.isSafeSecretName('myapp/db/credentials'); // → true
	 * ParameterKeySafety.isSafeSecretName('__proto__'); // → false
	 */
	static isSafeSecretName(name) {
		return ParameterKeySafety.checkSecretName(name).safe;
	}

	// -------------------------------------------------------------------------
	// Secret assignment — the ONLY permitted sites of secret-key bracket
	// assignment (Req 2.1, 2.3). Neither method below uses the `in` operator
	// or `obj.hasOwnProperty`; both use Object.prototype.hasOwnProperty.call()
	// at every level, matching setGrouped / setGroupedPath.
	// -------------------------------------------------------------------------

	/**
	 * Writes a scalar secret value at store[group][secretName].
	 *
	 * group is validated with isSafeKey (SSM-style single-segment allowlist);
	 * secretName is validated with checkSecretName (the wider Secrets Manager
	 * allowlist, which also permits "/" and ARN punctuation).
	 *
	 * // >! Only permitted site of secret-key bracket assignment for the raw
	 * // >! (non-parsed) Secrets Manager path (Req 2.1).
	 *
	 * @param {object} store - Accumulator object
	 * @param {string} group - Group key
	 * @param {string} secretName - Secrets Manager secret name (SecretId)
	 * @param {string} value - Secret value to store
	 * @returns {{assigned: boolean, reason: string|null}} assigned is false
	 *   with a diagnostic reason, or true with reason null
	 * @example
	 * const store = {};
	 * ParameterKeySafety.setGroupedSecret(store, 'app', 'myapp/db/credentials', '{"user":"alice"}');
	 * // → { assigned: true, reason: null }
	 * // store.app['myapp/db/credentials'] === '{"user":"alice"}'
	 */
	static setGroupedSecret(store, group, secretName, value) {
		if (!ParameterKeySafety.isSafeKey(group)) {
			return { assigned: false, reason: 'unsafe-group' };
		}

		const nameCheck = ParameterKeySafety.checkSecretName(secretName);
		if (!nameCheck.safe) {
			return { assigned: false, reason: nameCheck.reason };
		}

		// >! Own-property check prevents resolving to an inherited function object,
		// >! exactly as in setGrouped. `in` would walk the prototype chain.
		if (!Object.prototype.hasOwnProperty.call(store, group)) {
			store[group] = {};
		}

		// >! Direct bracket assignment with the validated secret name
		store[group][secretName] = value;
		return { assigned: true, reason: null };
	}

	/**
	 * Writes each own enumerable key of parsed at store[group][secretName][key].
	 *
	 * group and secretName are validated exactly once (Req 2.7), not per parsed
	 * key. Every key of parsed is then validated individually with isSafeKey;
	 * an unsafe key is reported in the returned skipped array and the remaining
	 * keys are still written, matching the parsed-key warn-and-skip contract
	 * (Req 1.13).
	 *
	 * // >! Only permitted site of secret-key bracket assignment for the
	 * // >! parseJson Secrets Manager path (Req 2.1).
	 *
	 * @param {object} store - Accumulator object
	 * @param {string} group - Group key
	 * @param {string} secretName - Secrets Manager secret name (SecretId)
	 * @param {Object.<string, *>} parsed - Parsed JSON object from the secret's SecretString
	 * @returns {{assigned: boolean, reason: string|null, skipped: Array.<{key: string, reason: string}>}}
	 *   assigned is false with a diagnostic reason and an empty skipped array
	 *   when group or secretName is rejected; otherwise true, with skipped
	 *   listing any parsed keys that were rejected
	 * @example
	 * const store = {};
	 * ParameterKeySafety.setGroupedSecretMap(store, 'app', 'myapp/db/credentials', { user: 'alice', pass: 's3cr3t' });
	 * // → { assigned: true, reason: null, skipped: [] }
	 * // store.app['myapp/db/credentials'].user === 'alice'
	 */
	static setGroupedSecretMap(store, group, secretName, parsed) {
		if (!ParameterKeySafety.isSafeKey(group)) {
			return { assigned: false, reason: 'unsafe-group', skipped: [] };
		}

		const nameCheck = ParameterKeySafety.checkSecretName(secretName);
		if (!nameCheck.safe) {
			return { assigned: false, reason: nameCheck.reason, skipped: [] };
		}

		// >! Own-property checks at both levels, never `in` / `obj.hasOwnProperty`
		if (!Object.prototype.hasOwnProperty.call(store, group)) {
			store[group] = {};
		}
		if (!Object.prototype.hasOwnProperty.call(store[group], secretName)) {
			store[group][secretName] = {};
		}

		const container = store[group][secretName];
		const skipped = [];

		for (const key of Object.keys(parsed)) {
			const keyCheck = ParameterKeySafety.checkKey(key);
			if (!keyCheck.safe) {
				skipped.push({ key, reason: keyCheck.reason });
				continue;
			}
			// >! Direct bracket assignment with the validated parsed key.
			// >! String(value) preserves the current coercion.
			container[key] = String(parsed[key]);
		}

		return { assigned: true, reason: null, skipped };
	}

	// -------------------------------------------------------------------------
	// Path normalization
	// -------------------------------------------------------------------------

	/**
	 * Normalizes a path to end with exactly one trailing slash.
	 * "/myapp/prod"  → "/myapp/prod/"
	 * "/myapp/prod/" → "/myapp/prod/"
	 * "/myapp/prod//"→ "/myapp/prod/"
	 *
	 * @param {string} path - Path to normalize
	 * @returns {string} path with exactly one trailing slash, or path
	 *   unchanged when it is not a string
	 * @example
	 * ParameterKeySafety.normalizePath('/myapp/prod');
	 * // → '/myapp/prod/'
	 *
	 * ParameterKeySafety.normalizePath('/myapp/prod///');
	 * // → '/myapp/prod/'
	 */
	static normalizePath(path) {
		if (typeof path !== 'string') return path;

		// >! Manual trailing-slash scan replaces /\/*$/. That pattern is unanchored at
		// >! the start, so the engine retries \/* at every position and backtracks through
		// >! each run of slashes, giving quadratic time (js/polynomial-redos). Measured on
		// >! the regex: 48ms at 10k leading slashes, 167ms at 20k, 632ms at 40k.
		let end = path.length;
		while (end > 0 && path.charCodeAt(end - 1) === 0x2F) {
			end--;
		}
		return path.slice(0, end) + '/';
	}

	// -------------------------------------------------------------------------
	// Accumulator factory
	// -------------------------------------------------------------------------

	/**
	 * Creates a null-prototype accumulator for internal use.
	 * Internal accumulators are null-prototype so they have no inherited members
	 * that could be shadowed by a parameter group named "toString" etc.
	 * The RETURNED store passed back to callers uses plain {} so consumers can
	 * call inherited methods (Req 7.5, 7.6).
	 *
	 * @returns {object} Object.create(null)
	 */
	static createAccumulator() {
		return Object.create(null);
	}

	// -------------------------------------------------------------------------
	// Assignment — the ONLY place in this codebase that may do obj[extKey] = v
	// -------------------------------------------------------------------------

	/**
	 * Writes value at store[group][name] using own-property checks throughout.
	 * Creates store[group] as a plain {} if it does not yet exist as an own property.
	 *
	 * @param {object} store     - Accumulator object
	 * @param {string} group     - Group key (validated by caller or by this method)
	 * @param {string} name      - Parameter name (validated by caller or by this method)
	 * @param {string} value     - Parameter value to store
	 * @returns {boolean} true if the value was assigned, false if validation rejected it
	 */
	static setGrouped(store, group, name, value) {
		if (!ParameterKeySafety.isSafeKey(group)) return false;
		if (!ParameterKeySafety.isSafeKey(name)) return false;

		// >! Own-property check prevents resolving to an inherited function object.
		// >! `in` would return true for "toString" etc. because it walks the prototype
		// >! chain, causing the write to land on the shared native function rather
		// >! than creating a new own-property group. (prototype-reachable key defect)
		if (!Object.prototype.hasOwnProperty.call(store, group)) {
			store[group] = {};
		}

		// >! Direct bracket assignment with the validated key
		store[group][name] = value;
		return true;
	}

	/**
	 * Writes value into a nested path within store[group][segments[0]][segments[1]]...
	 * Used for recursive SSM parameter results where the remainder below the
	 * configured path prefix has multiple segments (e.g. "db/host").
	 *
	 * Detects shadow collisions:
	 *   - An intermediate segment that is already a non-object scalar → collision
	 *   - A leaf segment that already holds a plain object → collision
	 *
	 * @param {object}   store    - Accumulator object
	 * @param {string}   group    - Top-level group key
	 * @param {string[]} segments - One or more path segments below the group prefix
	 * @param {string}   value    - Parameter value to store
	 * @returns {{assigned: boolean, reason: string|null}}
	 */
	static setGroupedPath(store, group, segments, value) {
		// >! Validate the group key
		if (!ParameterKeySafety.isSafeKey(group)) {
			return { assigned: false, reason: 'unsafe-group' };
		}

		// >! Validate every segment before touching the store
		for (const seg of segments) {
			if (!ParameterKeySafety.isSafeKey(seg)) {
				return { assigned: false, reason: 'unsafe-segment' };
			}
		}

		// >! Create the group own-property if absent (same guard as setGrouped)
		if (!Object.prototype.hasOwnProperty.call(store, group)) {
			store[group] = {};
		}

		let node = store[group];

		// Traverse / create intermediate nodes
		for (let i = 0; i < segments.length - 1; i++) {
			const seg = segments[i];
			if (Object.prototype.hasOwnProperty.call(node, seg)) {
				if (typeof node[seg] !== 'object' || node[seg] === null || Array.isArray(node[seg])) {
					// >! An intermediate segment already holds a scalar — shadow collision.
					// >! The shallower scalar wins; this deeper assignment is skipped.
					return { assigned: false, reason: 'shadow-collision' };
				}
			} else {
				node[seg] = {};
			}
			node = node[seg];
		}

		// Write the leaf
		const leaf = segments[segments.length - 1];
		if (Object.prototype.hasOwnProperty.call(node, leaf) &&
			typeof node[leaf] === 'object' && node[leaf] !== null && !Array.isArray(node[leaf])) {
			// >! Leaf already holds a nested object — this scalar would shadow it.
			return { assigned: false, reason: 'shadow-collision' };
		}
		node[leaf] = value;
		return { assigned: true, reason: null };
	}

	// -------------------------------------------------------------------------
	// Prefix resolution
	// -------------------------------------------------------------------------

	/**
	 * Resolves a returned SSM parameter name to a {group, segments} pair by
	 * finding the configured entry whose normalized path is the longest prefix
	 * of parameterName (longest-first search, so more specific entries win).
	 *
	 * normalizedEntries MUST already be sorted by path.length DESCENDING before
	 * calling this method. Use ParameterKeySafety.sortEntriesLongestFirst().
	 *
	 * Returns null when:
	 *   - No configured entry is a prefix of parameterName
	 *   - The remaining segments are deeper than the entry claims (non-recursive with >1 segment)
	 *
	 * @param {string} parameterName - Full SSM parameter name e.g. "/myapp/prod/db/host"
	 * @param {Array<{path: string, group: string, recursive?: boolean}>} normalizedEntries
	 * @returns {{group: string, segments: string[]}|null}
	 */
	static resolveGroupAndSegments(parameterName, normalizedEntries) {
		for (const entry of normalizedEntries) {
			if (!parameterName.startsWith(entry.path)) continue;

			const remainder = parameterName.slice(entry.path.length);
			// remainder may be "" when parameterName === entry.path (degenerate)
			if (remainder === '') {
				// The parameter name IS the path itself — no leaf, skip
				return null;
			}

			const segments = remainder.split('/').filter(s => s.length > 0);
			if (segments.length === 0) return null;

			// A non-recursive entry can only claim parameters one level below its path
			if (segments.length > 1 && !entry.recursive) {
				// Deeper than this non-recursive entry — fall through to try a longer prefix
				continue;
			}

			return { group: entry.group, segments };
		}
		return null;
	}

	/**
	 * Sorts a copy of entries by their normalized path length DESCENDING so that
	 * resolveGroupAndSegments picks the most-specific (longest) prefix first.
	 *
	 * @param {Array<{path: string, group: string, recursive?: boolean}>} entries
	 * @returns {Array<{path: string, group: string, recursive?: boolean}>}
	 */
	static sortEntriesLongestFirst(entries) {
		return entries.slice().sort((a, b) => b.path.length - a.path.length);
	}

	/**
	 * Normalizes the path of every entry and returns a new array sorted
	 * longest-first, ready for use with resolveGroupAndSegments.
	 *
	 * @param {Array<{path: string, group: string, recursive?: boolean}>} entries
	 * @returns {Array<{path: string, group: string, recursive?: boolean}>}
	 */
	static prepareEntries(entries) {
		const normalized = entries.map(e => ({
			...e,
			path: ParameterKeySafety.normalizePath(e.path)
		}));
		return ParameterKeySafety.sortEntriesLongestFirst(normalized);
	}

	// -------------------------------------------------------------------------
	// Shadow collision detection
	// -------------------------------------------------------------------------

	/**
	 * Identifies pairs where one parameter name is a strict path-prefix of another,
	 * meaning they cannot both be stored without a type conflict (scalar vs object).
	 *
	 * Detection is order-independent: runs as a pre-pass before any assignment so
	 * the outcome does not depend on the API response ordering.
	 *
	 * Resolution policy: the shallower name wins (it is kept); every deeper name
	 * that has it as a prefix is reported in the returned array so callers can
	 * log a warning and skip those names.
	 *
	 * @param {string[]} parameterNames - Full SSM parameter names
	 * @returns {Array<{name: string, shadowedBy: string}>}
	 */
	static detectShadowCollisions(parameterNames) {
		const sorted = parameterNames.slice().sort();
		const collisions = [];

		for (let i = 0; i < sorted.length; i++) {
			for (let j = i + 1; j < sorted.length; j++) {
				// sorted[j] is alphabetically ≥ sorted[i].
				// A true path-prefix relationship means sorted[j] starts with sorted[i] + "/"
				if (sorted[j].startsWith(sorted[i] + '/')) {
					collisions.push({ name: sorted[j], shadowedBy: sorted[i] });
				} else {
					// Because the array is sorted, once sorted[j] no longer shares the
					// prefix of sorted[i], neither will any later entry
					break;
				}
			}
		}

		return collisions;
	}

}

module.exports = ParameterKeySafety;
