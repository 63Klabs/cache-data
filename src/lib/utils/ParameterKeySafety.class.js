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

	// -------------------------------------------------------------------------
	// Path normalization
	// -------------------------------------------------------------------------

	/**
	 * Normalizes a path to end with exactly one trailing slash.
	 * "/myapp/prod"  → "/myapp/prod/"
	 * "/myapp/prod/" → "/myapp/prod/"
	 * "/myapp/prod//"→ "/myapp/prod/"
	 *
	 * @param {string} path
	 * @returns {string}
	 */
	static normalizePath(path) {
		if (typeof path !== 'string') return path;
		return path.replace(/\/*$/, '/');
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
