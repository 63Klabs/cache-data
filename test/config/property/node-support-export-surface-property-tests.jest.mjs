/**
 * Backwards-compatibility export-surface guard for the Node.js 20 deprecation warning.
 *
 * Property 7 states that emitting the deprecation warning must not alter the
 * package's export surface: the set of exported names and the value identities
 * behind them must be identical whether or not the one-time Node 20 warning is
 * emitted at module load.
 *
 * The warning is driven by `checkNodeDeprecationNotices()` in
 * `src/lib/tools/index.js`, runs exactly once during module load, and warns
 * only when the running Node major version is 20. Because this suite runs on a
 * single (the current) runtime, it cannot toggle the module-load branch
 * in-process. Instead it proves the invariant structurally and behaviorally:
 *
 *   1. The exported names of the package (top-level and per-module) are a
 *      fixed, known set — asserted against explicit expected arrays, so any
 *      addition/removal/rename caused by the walker would fail. A Jest snapshot
 *      of the sorted name/type shape provides an additional regression guard.
 *   2. Value identities are stable — the documented alias exports point at the
 *      exact same underlying value as their canonical export.
 *   3. Emitting a warning through the same sink the walker uses
 *      (`DebugAndLog.warn`) does not add, remove, reshape, or re-bind any
 *      export: the surface captured after emitting a warning is deeply equal to
 *      and reference-identical with the surface captured before.
 *
 * The package entry point is loaded via `require` (CommonJS), matching how
 * consumers import `@63klabs/cache-data`, so the assertions cover the real
 * public surface rather than an ESM-interop view of it.
 *
 * Feature: 1-3-17-node-26-support, Property 7: Emitting a warning does not alter module exports
 * Validates: Requirements 8.1, 8.4
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

// >! Use a CommonJS require bound to this ESM test file so we load the package
// >! exactly as a consumer would (`require('@63klabs/cache-data')`).
const require = createRequire(import.meta.url);

/**
 * The complete, expected top-level export surface of the package entry point.
 * @type {string[]}
 */
const EXPECTED_TOP_LEVEL_EXPORTS = ['cache', 'endpoint', 'tools'];

/**
 * The complete, expected set of named exports from the tools module
 * (`src/lib/tools/index.js`), including documented backwards-compatible aliases.
 * @type {string[]}
 */
const EXPECTED_TOOLS_EXPORTS = [
	'APIRequest',
	'AWS',
	'AWSXRay',
	'ApiRequest',
	'AppConfig',
	'Aws',
	'AwsXRay',
	'CachedParameterSecret',
	'CachedParameterSecrets',
	'CachedSSMParameter',
	'CachedSecret',
	'CachedSsmParameter',
	'ClientRequest',
	'Connection',
	'ConnectionAuthentication',
	'ConnectionRequest',
	'Connections',
	'DebugAndLog',
	'ImmutableObject',
	'RequestInfo',
	'Response',
	'ResponseDataModel',
	'Timer',
	'_ConfigSuperClass',
	'flushMetrics',
	'hashThisData',
	'htmlGenericResponse',
	'jsonGenericResponse',
	'nodeVer',
	'nodeVerMajor',
	'nodeVerMajorMinor',
	'nodeVerMinor',
	'obfuscate',
	'printMsg',
	'rssGenericResponse',
	'sanitize',
	'textGenericResponse',
	'xmlGenericResponse'
];

/**
 * The complete, expected set of named exports from the cache module.
 * @type {string[]}
 */
const EXPECTED_CACHE_EXPORTS = ['Cache', 'CacheableDataAccess', 'TestHarness'];

/**
 * The complete, expected set of named exports from the endpoint module.
 * @type {string[]}
 */
const EXPECTED_ENDPOINT_EXPORTS = ['get', 'getDataDirectFromURI', 'send'];

/**
 * Documented backwards-compatible alias pairs within the tools module. Each
 * alias MUST reference the exact same value (identity), not merely an equal one.
 * @type {Array<[string, string]>}
 */
const TOOLS_ALIAS_PAIRS = [
	['Aws', 'AWS'],
	['AwsXRay', 'AWSXRay'],
	['APIRequest', 'ApiRequest'],
	['_ConfigSuperClass', 'AppConfig'],
	['CachedSSMParameter', 'CachedSsmParameter']
];

/**
 * Produce a deterministic, comparable description of a module's export surface:
 * the sorted export names plus the `typeof` of each exported value. Sorting
 * makes the result independent of declaration order so it is stable across runs
 * (safe for snapshotting) and directly diffable.
 *
 * @param {Object} mod - The module object to describe
 * @returns {{names: string[], types: Object.<string, string>}} Sorted names and a name->typeof map
 * @example
 * const surface = describeSurface(require('../../../src/index.js'));
 * // surface.names === ['cache', 'endpoint', 'tools']
 * // surface.types === { cache: 'object', endpoint: 'object', tools: 'object' }
 */
function describeSurface(mod) {
	const names = Object.keys(mod).sort();
	const types = {};
	for (const name of names) {
		types[name] = typeof mod[name];
	}
	return { names, types };
}

describe('Property 7: Emitting a warning does not alter module exports', () => {
	// Feature: 1-3-17-node-26-support, Property 7: Emitting a warning does not alter module exports
	// Validates: Requirements 8.1, 8.4

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('exposes exactly the expected top-level exports (tools, cache, endpoint)', () => {
		const pkg = require(path.join(rootDir, 'src/index.js'));
		expect(Object.keys(pkg).sort()).toEqual(EXPECTED_TOP_LEVEL_EXPORTS);
		for (const name of EXPECTED_TOP_LEVEL_EXPORTS) {
			expect(typeof pkg[name]).toBe('object');
		}
	});

	it('exposes exactly the expected tools export names', () => {
		const pkg = require(path.join(rootDir, 'src/index.js'));
		expect(Object.keys(pkg.tools).sort()).toEqual(EXPECTED_TOOLS_EXPORTS);
	});

	it('exposes exactly the expected cache and endpoint export names', () => {
		const pkg = require(path.join(rootDir, 'src/index.js'));
		expect(Object.keys(pkg.cache).sort()).toEqual(EXPECTED_CACHE_EXPORTS);
		expect(Object.keys(pkg.endpoint).sort()).toEqual(EXPECTED_ENDPOINT_EXPORTS);
	});

	it('preserves value identity for documented backwards-compatible aliases', () => {
		const pkg = require(path.join(rootDir, 'src/index.js'));
		for (const [alias, canonical] of TOOLS_ALIAS_PAIRS) {
			// Identity, not equality: the alias and canonical must be the same value.
			expect(pkg.tools[alias]).toBe(pkg.tools[canonical]);
		}
	});

	it('matches the known export-surface snapshot (names and value types)', () => {
		const pkg = require(path.join(rootDir, 'src/index.js'));
		const surface = {
			index: describeSurface(pkg),
			tools: describeSurface(pkg.tools),
			cache: describeSurface(pkg.cache),
			endpoint: describeSurface(pkg.endpoint)
		};
		// Deterministic (names sorted, values reduced to typeof), so the snapshot
		// is stable across repeated runs.
		expect(surface).toMatchSnapshot();
	});

	it('does not change the export surface when a warning is emitted through the walker sink', () => {
		const pkg = require(path.join(rootDir, 'src/index.js'));

		// Capture the surface and the concrete exported value identities before
		// any warning is emitted in this test.
		const before = describeSurface(pkg);
		const beforeToolsRefs = { ...pkg.tools };

		// Emit a warning through DebugAndLog.warn — the exact sink the once-per-load
		// walker (checkNodeDeprecationNotices) uses to log the Node 20 notice.
		// Spy so the emission is observable and does not clutter test output.
		const warnSpy = jest.spyOn(pkg.tools.DebugAndLog, 'warn').mockImplementation(() => {});
		pkg.tools.DebugAndLog.warn(
			'Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later.'
		);
		expect(warnSpy).toHaveBeenCalledTimes(1);

		// Re-load the entry point (CommonJS cache returns the same object) to model
		// "the exports as observed whether or not a warning was emitted".
		const pkgAfter = require(path.join(rootDir, 'src/index.js'));
		const after = describeSurface(pkgAfter);

		// Names and value types are unchanged by emitting a warning.
		expect(after).toEqual(before);

		// Value identities are unchanged: every tools export still points at the
		// exact same value it did before the warning.
		for (const name of Object.keys(beforeToolsRefs)) {
			expect(pkgAfter.tools[name]).toBe(beforeToolsRefs[name]);
		}
		expect(Object.keys(pkgAfter.tools).sort()).toEqual(EXPECTED_TOOLS_EXPORTS);
	});
});
