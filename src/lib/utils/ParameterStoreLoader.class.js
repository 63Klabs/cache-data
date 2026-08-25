'use strict';

const ParameterKeySafety = require('./ParameterKeySafety.class.js');
const DebugAndLog = require('../tools/DebugAndLog.class.js');

/**
 * ParameterStoreLoader — batches, paginates, and groups SSM Parameter Store results.
 *
 * Responsibilities:
 *   - Partition enumerated names into chunks of at most MAX_NAMES_PER_CALL (Req 4.1)
 *   - Issue parallel GetParameters calls with a concurrency cap (Req 4.3, 4.4)
 *   - Follow NextToken on GetParametersByPath until exhausted (Req 5.2-5.5)
 *   - Detect shadow collisions before any assignment (Req 6.6)
 *   - Group every returned parameter through ParameterKeySafety (Req 7.7)
 *   - Throw for enumerated names failing key validation; warn-and-skip for discovered (Req 2.1-2.3)
 *
 * Stateless. All methods static.
 *
 * @private
 * @see design.md § ParameterStoreLoader
 */
class ParameterStoreLoader {

	/** AWS GetParameters hard limit (Req 4.1) */
	static MAX_NAMES_PER_CALL = 10;

	/** AWS GetParametersByPath hard limit (Req 5.1) */
	static MAX_RESULTS_PER_PAGE = 10;

	/** Concurrency cap for parallel GetParameters chunks (Req 4.4) */
	static MAX_CONCURRENT_CALLS = 5;

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	/**
	 * Retrieve and group SSM parameters according to the provided entries.
	 *
	 * @param {Array<{group: string, path: string, names?: string[], recursive?: boolean}>} entries
	 * @returns {Promise<{
	 *   store: object,
	 *   skipped: Array<{name: string, reason: string}>,
	 *   invalid: Array<{name: string}>,
	 *   collisions: Array<{name: string, shadowedBy: string}>,
	 *   pages: number
	 * }>}
	 */
	static async load(entries) {
		const store = {};
		const skipped = [];
		const invalid = [];
		const collisions = [];
		let totalPages = 0;

		if (!entries || entries.length === 0) {
			return { store, skipped, invalid, collisions, pages: totalPages };
		}

		// Prepare entries: normalise paths and sort longest-first for prefix matching
		const prepared = ParameterKeySafety.prepareEntries(entries);

		// Separate enumerated-names entries from path-discovery entries
		const nameEntries = entries.filter(e => Array.isArray(e.names) && e.names.length > 0);
		const pathEntries = entries.filter(e => !Array.isArray(e.names) || e.names.length === 0);

		// Collect all raw SSM parameter objects from both routes
		let allParams = [];

		// --- Route A: by name ---
		if (nameEntries.length > 0) {
			const allNames = nameEntries.flatMap(e =>
				e.names.map(n => ParameterKeySafety.normalizePath(e.path).replace(/\/$/, '') + '/' + n)
			);

			const { params, invalidNames } = await ParameterStoreLoader.#retrieveByNames(allNames);
			allParams.push(...params);
			invalid.push(...invalidNames.map(n => ({ name: n })));
		}

		// --- Route B: by path ---
		for (const entry of pathEntries) {
			const normalizedPath = ParameterKeySafety.normalizePath(entry.path);
			const { params, pages } = await ParameterStoreLoader.#discoverByPath(
				normalizedPath,
				entry.recursive === true
			);
			allParams.push(...params);
			totalPages += pages;
		}

		// --- Shadow collision pre-pass (Req 6.6) ---
		const allParamNames = allParams.map(p => p.Name);
		const shadowCollisions = ParameterKeySafety.detectShadowCollisions(allParamNames);
		const shadowedSet = new Set(shadowCollisions.map(c => c.name));
		collisions.push(...shadowCollisions);

		if (shadowCollisions.length > 0) {
			shadowCollisions.forEach(({ name, shadowedBy }) => {
				DebugAndLog.warn(
					`ParameterStoreLoader: Shadow collision — skipping "${name}" ` +
					`(shadowed by shallower parameter "${shadowedBy}")`
				);
			});
		}

		// --- Group parameters ---
		for (const param of allParams) {
			// Skip shadowed parameters (shallower scalar wins, per design)
			if (shadowedSet.has(param.Name)) {
				skipped.push({ name: param.Name, reason: 'shadow-collision' });
				continue;
			}

			const resolved = ParameterKeySafety.resolveGroupAndSegments(param.Name, prepared);

			if (resolved === null) {
				DebugAndLog.warn(
					`ParameterStoreLoader: No configured entry matches parameter "${param.Name}" — skipping`
				);
				skipped.push({ name: param.Name, reason: 'unmatched-path' });
				continue;
			}

			const { group, segments } = resolved;

			let assignResult;
			if (segments.length === 1) {
				// Single-segment: flat assignment via setGrouped
				const name = segments[0];

				// Determine whether this name was enumerated by the caller
				const wasEnumerated = nameEntries.some(e =>
					e.names.includes(name) &&
					ParameterKeySafety.normalizePath(e.path) ===
					ParameterKeySafety.normalizePath(param.Name.slice(0, param.Name.lastIndexOf('/') + 1))
				);

				const groupCheck = ParameterKeySafety.checkKey(group);
				const nameCheck = ParameterKeySafety.checkKey(name);

				if (!groupCheck.safe || !nameCheck.safe) {
					const badKey = !groupCheck.safe ? group : name;
					const reason = !groupCheck.safe ? groupCheck.reason : nameCheck.reason;
					const isEnumerated = wasEnumerated;

					DebugAndLog.warn(
						`ParameterStoreLoader: Skipping parameter "${param.Name}" — ` +
						`key "${badKey}" failed validation (${reason})`
					);

					if (isEnumerated) {
						// >! Throw for enumerated names so a missing credential is loud (Req 2.1)
						throw new Error(
							`ParameterStoreLoader: Enumerated parameter "${param.Name}" has an unsafe key ` +
							`"${badKey}" (${reason}). This would cause the parameter to be silently unreachable.`
						);
					}

					skipped.push({ name: param.Name, reason });
					continue;
				}

				const assigned = ParameterKeySafety.setGrouped(store, group, name, param.Value);
				if (!assigned) {
					skipped.push({ name: param.Name, reason: 'key-validation-failed' });
				}

			} else {
				// Multi-segment: nested assignment via setGroupedPath
				assignResult = ParameterKeySafety.setGroupedPath(store, group, segments, param.Value);
				if (!assignResult.assigned) {
					DebugAndLog.warn(
						`ParameterStoreLoader: Skipping parameter "${param.Name}" — ` +
						`nested assignment failed (${assignResult.reason})`
					);
					skipped.push({ name: param.Name, reason: assignResult.reason });
				}
			}
		}

		return { store, skipped, invalid, collisions, pages: totalPages };
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Retrieves parameters by their full names, chunking into groups of
	 * MAX_NAMES_PER_CALL and issuing parallel calls with a concurrency cap.
	 *
	 * @param {string[]} names - Full SSM parameter paths (e.g. ["/app/prod/authUsername"])
	 * @returns {Promise<{params: Array, invalidNames: string[]}>}
	 */
	static async #retrieveByNames(names) {
		if (names.length === 0) return { params: [], invalidNames: [] };

		// Lazily require AWS to avoid circular dependency at module-load time
		const { AWS } = require('../tools/AWS.classes.js');

		const params = [];
		const invalidNames = [];

		// Partition into chunks of at most MAX_NAMES_PER_CALL (Req 4.1)
		const chunks = ParameterStoreLoader.#chunkArray(names, ParameterStoreLoader.MAX_NAMES_PER_CALL);

		// Issue in batches of MAX_CONCURRENT_CALLS (Req 4.4)
		for (let i = 0; i < chunks.length; i += ParameterStoreLoader.MAX_CONCURRENT_CALLS) {
			const batch = chunks.slice(i, i + ParameterStoreLoader.MAX_CONCURRENT_CALLS);

			const responses = await Promise.all(
				batch.map(chunk =>
					AWS.ssm.getByName({
						Names: chunk,
						WithDecryption: true
					})
				)
			);

			for (const response of responses) {
				if (response.Parameters) {
					params.push(...response.Parameters);
				}
				if (response.InvalidParameters && response.InvalidParameters.length > 0) {
					// Log and collect invalid names (Req 4.5)
					for (const n of response.InvalidParameters) {
						DebugAndLog.warn(
							`ParameterStoreLoader: Parameter "${n}" not found or not accessible — skipping`
						);
						invalidNames.push(n);
					}
				}
			}
		}

		return { params, invalidNames };
	}

	/**
	 * Discovers all parameters under a path by following NextToken until
	 * the response contains no further token.
	 *
	 * Always sets MaxResults: 10 explicitly (Req 5.1, 19).
	 *
	 * @param {string} normalizedPath - Path ending in exactly one slash
	 * @param {boolean} recursive     - Whether to retrieve nested parameters (Req 6.1-6.3)
	 * @returns {Promise<{params: Array, pages: number}>}
	 */
	static async #discoverByPath(normalizedPath, recursive) {
		// Lazily require AWS to avoid circular dependency at module-load time
		const { AWS } = require('../tools/AWS.classes.js');

		const params = [];
		let nextToken = undefined;
		let pages = 0;

		do {
			// >! MaxResults must be set explicitly — the ceiling is 10 regardless of what
			// >! is requested, and omitting it relies on the default which may change.
			const query = {
				Path: normalizedPath,
				WithDecryption: true,
				MaxResults: ParameterStoreLoader.MAX_RESULTS_PER_PAGE
			};

			if (recursive) {
				// >! Recursive: true only when the entry opts in — defaulting this to true
				// >! would silently widen the read scope because AWS grants transitive
				// >! access under recursive path queries (a principal permitted on /a can
				// >! read /a/b even when IAM explicitly denies /a/b). (Req 6.7)
				query.Recursive = true;
			}

			if (nextToken) {
				query.NextToken = nextToken;
			}

			DebugAndLog.debug('ParameterStoreLoader: GetParametersByPath', { path: normalizedPath, recursive, pages });

			const response = await AWS.ssm.getByPath(query);

			if (response.Parameters) {
				params.push(...response.Parameters);
			}

			nextToken = response.NextToken;
			pages++;

		} while (nextToken);

		return { params, pages };
	}

	/**
	 * Partitions an array into chunks of at most `size` elements.
	 *
	 * @param {Array} arr
	 * @param {number} size
	 * @returns {Array[]}
	 */
	static #chunkArray(arr, size) {
		const chunks = [];
		for (let i = 0; i < arr.length; i += size) {
			chunks.push(arr.slice(i, i + size));
		}
		return chunks;
	}

}

module.exports = ParameterStoreLoader;
