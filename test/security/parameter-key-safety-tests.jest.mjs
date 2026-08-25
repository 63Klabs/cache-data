/**
 * Unit and property tests for ParameterKeySafety
 *
 * Covers design.md Properties 1, 2, 3, 4, 8, 9, 11 and requirements.md
 * Req 1.1-1.8, 3.3, 6.4, 6.5, 6.6, 7.4, 7.5
 *
 * Includes the design's worked example:
 *   /app/ recursive + /app/db/ non-recursive → /app/db/host resolves to group "database"
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

const ParameterKeySafety = (await import('../../src/lib/utils/ParameterKeySafety.class.js')).default;

// ---------------------------------------------------------------------------
// isSafeKey / checkKey
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: isSafeKey / checkKey', () => {

	// Property 2 — dangerous keys are rejected
	it('DANGEROUS_KEYS are all unsafe', () => {
		for (const k of ['__proto__', 'constructor', 'prototype']) {
			expect(ParameterKeySafety.isSafeKey(k)).toBe(false);
			expect(ParameterKeySafety.checkKey(k).safe).toBe(false);
			expect(ParameterKeySafety.checkKey(k).reason).toBe('dangerous-key');
		}
	});

	// Property 1 — prototype-reachable built-in names are rejected
	it('Object.prototype own-property names are all unsafe (prototype-reachable keys)', () => {
		for (const k of Object.getOwnPropertyNames(Object.prototype)) {
			expect(ParameterKeySafety.isSafeKey(k)).toBe(false);
		}
	});

	// Property 3 — safe keys pass
	it('valid SSM-format keys are safe', () => {
		for (const k of ['authUsername', 'db-host', 'my.param', 'key_123', 'HOST']) {
			expect(ParameterKeySafety.isSafeKey(k)).toBe(true);
		}
	});

	it('empty string is unsafe', () => {
		expect(ParameterKeySafety.isSafeKey('')).toBe(false);
	});

	it('non-string values are unsafe', () => {
		for (const v of [null, undefined, 123, {}, [], true]) {
			expect(ParameterKeySafety.isSafeKey(v)).toBe(false);
		}
	});

	it('keys with special chars are unsafe', () => {
		for (const k of ['a b', 'a/b', 'a[b]', 'a@b', 'a!b']) {
			expect(ParameterKeySafety.isSafeKey(k)).toBe(false);
		}
	});

	// Property-based: all safe keys satisfy /^[a-zA-Z0-9_.-]+$/ and not in DANGEROUS_KEYS or PROTOTYPE_KEYS
	it('Property 3: safe keys always satisfy allowlist + not-in-denylist', () => {
		const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);
		const PROTO_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-zA-Z0-9_.-]{1,50}$/).filter(
					s => !DANGEROUS.has(s) && !PROTO_KEYS.has(s)
				),
				(key) => {
					expect(ParameterKeySafety.isSafeKey(key)).toBe(true);
				}
			),
			{ numRuns: 200 }
		);
	});

});

// ---------------------------------------------------------------------------
// normalizePath
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: normalizePath (Property 9)', () => {

	it('adds trailing slash when absent', () => {
		expect(ParameterKeySafety.normalizePath('/myapp/prod')).toBe('/myapp/prod/');
	});

	it('preserves single trailing slash', () => {
		expect(ParameterKeySafety.normalizePath('/myapp/prod/')).toBe('/myapp/prod/');
	});

	it('collapses multiple trailing slashes', () => {
		expect(ParameterKeySafety.normalizePath('/myapp/prod//')).toBe('/myapp/prod/');
	});

	it('Property 9: normalizePath is idempotent', () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 50 }),
				(path) => {
					const once = ParameterKeySafety.normalizePath(path);
					const twice = ParameterKeySafety.normalizePath(once);
					expect(once).toBe(twice);
				}
			),
			{ numRuns: 200 }
		);
	});

	it('Property 9: normalizePath always ends with exactly one slash', () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 50 }), (path) => {
				const result = ParameterKeySafety.normalizePath(path);
				expect(result.endsWith('/')).toBe(true);
				expect(result.endsWith('//')).toBe(false);
			}),
			{ numRuns: 200 }
		);
	});

});

// ---------------------------------------------------------------------------
// createAccumulator
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: createAccumulator', () => {

	it('returns a null-prototype object', () => {
		const acc = ParameterKeySafety.createAccumulator();
		expect(Object.getPrototypeOf(acc)).toBeNull();
	});

	it('returned object is empty', () => {
		expect(Object.keys(ParameterKeySafety.createAccumulator())).toHaveLength(0);
	});

});

// ---------------------------------------------------------------------------
// setGrouped — Properties 1, 4 (own-property-safe assignment)
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: setGrouped (Properties 1, 3, 4)', () => {

	it('stores a value as own property (Property 3)', () => {
		const store = {};
		const assigned = ParameterKeySafety.setGrouped(store, 'app', 'authUsername', 'alice');
		expect(assigned).toBe(true);
		expect(Object.prototype.hasOwnProperty.call(store, 'app')).toBe(true);
		expect(Object.keys(store)).toContain('app');
		expect(store.app.authUsername).toBe('alice');
	});

	it('creates the group as a plain {} so consumers keep inherited methods (Req 7.5)', () => {
		const store = {};
		ParameterKeySafety.setGrouped(store, 'app', 'key', 'val');
		// The created group is a plain {}, not null-prototype
		expect(Object.getPrototypeOf(store.app)).toBe(Object.prototype);
	});

	it('Property 4 [Bug fix]: group="toString" is rejected (isSafeKey returns false)', () => {
		// After the fix: "toString" is in PROTOTYPE_KEYS and is therefore unsafe.
		// setGrouped rejects it, nothing is written to Object.prototype.
		const store = {};
		const assigned = ParameterKeySafety.setGrouped(store, 'toString', 'secretKey', 'S3cr3t');
		expect(assigned).toBe(false);
		// No group was created
		expect(Object.keys(store)).not.toContain('toString');
		// The native Object.prototype.toString is NOT modified
		expect(Object.prototype.toString).toBe(Object.prototype.toString);
		expect(typeof Object.prototype.toString).toBe('function');
		expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain('secretKey');
	});

	it('Property 1 [Bug fix]: no own property is added to Object.prototype', () => {
		const store = {};
		const before = Object.getOwnPropertyNames(Object.prototype);
		for (const group of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
			ParameterKeySafety.setGrouped(store, group, 'param', 'val');
		}
		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
	});

	it('Property 2: dangerous keys return false and nothing is stored', () => {
		const store = {};
		for (const k of ['__proto__', 'constructor', 'prototype']) {
			expect(ParameterKeySafety.setGrouped(store, k, 'param', 'val')).toBe(false);
			expect(ParameterKeySafety.setGrouped(store, 'app', k, 'val')).toBe(false);
		}
		expect(Object.keys(store)).toHaveLength(0);
	});

	it('Property 3: any safe group+name round-trips the value correctly', () => {
		const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);
		const PROTO_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));
		const isSafe = s => !DANGEROUS.has(s) && !PROTO_KEYS.has(s);
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-zA-Z0-9_.-]{1,20}$/).filter(isSafe),
				fc.stringMatching(/^[a-zA-Z0-9_.-]{1,20}$/).filter(isSafe),
				fc.string({ maxLength: 100 }),
				(group, name, value) => {
					const store = {};
					const assigned = ParameterKeySafety.setGrouped(store, group, name, value);
					expect(assigned).toBe(true);
					expect(Object.keys(store)).toContain(group);
					expect(store[group][name]).toBe(value);
				}
			),
			{ numRuns: 200 }
		);
	});

});

// ---------------------------------------------------------------------------
// setGroupedPath — nested assignment and shadow collision (Req 1.1, 6.6)
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: setGroupedPath', () => {

	it('stores a single-segment path correctly', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedPath(store, 'app', ['host'], '10.0.0.1');
		expect(result).toEqual({ assigned: true, reason: null });
		expect(store.app.host).toBe('10.0.0.1');
	});

	it('stores a two-segment path correctly', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedPath(store, 'app', ['db', 'host'], 'db.example.com');
		expect(result).toEqual({ assigned: true, reason: null });
		expect(store.app.db.host).toBe('db.example.com');
	});

	it('stores a three-segment path correctly', () => {
		const store = {};
		ParameterKeySafety.setGroupedPath(store, 'app', ['a', 'b', 'c'], 'deep');
		expect(store.app.a.b.c).toBe('deep');
	});

	it('Property 11: shadow collision — scalar shadows deeper path', () => {
		const store = {};
		// Write the shallower scalar first
		ParameterKeySafety.setGroupedPath(store, 'app', ['db'], 'scalar');
		// Deeper path conflicts with the scalar
		const result = ParameterKeySafety.setGroupedPath(store, 'app', ['db', 'host'], 'val');
		expect(result.assigned).toBe(false);
		expect(result.reason).toBe('shadow-collision');
		// Shallower scalar is preserved
		expect(store.app.db).toBe('scalar');
	});

	it('Property 11: shadow collision — deeper written first, scalar blocked', () => {
		const store = {};
		ParameterKeySafety.setGroupedPath(store, 'app', ['db', 'host'], 'db.example.com');
		// Now try to write the shallower scalar — it would shadow the object
		const result = ParameterKeySafety.setGroupedPath(store, 'app', ['db'], 'scalar');
		expect(result.assigned).toBe(false);
		expect(result.reason).toBe('shadow-collision');
		// Deeper path is preserved
		expect(store.app.db.host).toBe('db.example.com');
	});

	it('unsafe group name is rejected', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedPath(store, '__proto__', ['key'], 'v');
		expect(result.assigned).toBe(false);
		expect(result.reason).toBe('unsafe-group');
	});

	it('unsafe segment is rejected', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedPath(store, 'app', ['__proto__', 'key'], 'v');
		expect(result.assigned).toBe(false);
		expect(result.reason).toBe('unsafe-segment');
	});

	it('multiple calls to same group accumulate correctly', () => {
		const store = {};
		ParameterKeySafety.setGroupedPath(store, 'app', ['db', 'host'], 'h');
		ParameterKeySafety.setGroupedPath(store, 'app', ['db', 'port'], '5432');
		ParameterKeySafety.setGroupedPath(store, 'app', ['cache', 'ttl'], '300');
		expect(store.app.db.host).toBe('h');
		expect(store.app.db.port).toBe('5432');
		expect(store.app.cache.ttl).toBe('300');
	});

	it('Property 1 [Bug fix]: no own property added to Object.prototype via nested path', () => {
		const store = {};
		const before = Object.getOwnPropertyNames(Object.prototype);
		// "toString" is in PROTOTYPE_KEYS so it is rejected
		const result = ParameterKeySafety.setGroupedPath(store, 'toString', ['nested', 'key'], 'value');
		expect(result.assigned).toBe(false);
		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
	});

});

// ---------------------------------------------------------------------------
// resolveGroupAndSegments and prepareEntries — Properties 8, 9
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: resolveGroupAndSegments (Properties 8, 9)', () => {

	const ENTRIES_FLAT = [
		{ path: '/app/', group: 'app', recursive: false },
		{ path: '/db/', group: 'db', recursive: false }
	];

	const ENTRIES_RECURSIVE = [
		{ path: '/app/', group: 'app', recursive: true },
		{ path: '/app/db/', group: 'database', recursive: false }
	];

	it('basic single-segment resolution', () => {
		const prepared = ParameterKeySafety.prepareEntries(ENTRIES_FLAT);
		const result = ParameterKeySafety.resolveGroupAndSegments('/app/host', prepared);
		expect(result).toEqual({ group: 'app', segments: ['host'] });
	});

	it('returns null when no entry matches', () => {
		const prepared = ParameterKeySafety.prepareEntries(ENTRIES_FLAT);
		expect(ParameterKeySafety.resolveGroupAndSegments('/other/x', prepared)).toBeNull();
	});

	it('non-recursive entry does not claim deeper paths', () => {
		const prepared = ParameterKeySafety.prepareEntries(ENTRIES_FLAT);
		// /app/db/host has 2 segments below /app/ — non-recursive entry cannot claim it
		expect(ParameterKeySafety.resolveGroupAndSegments('/app/db/host', prepared)).toBeNull();
	});

	it('Design worked example: /app/db/ wins over /app/ for /app/db/host (Property 8)', () => {
		const prepared = ParameterKeySafety.prepareEntries(ENTRIES_RECURSIVE);
		// /app/db/ is longer and wins
		expect(ParameterKeySafety.resolveGroupAndSegments('/app/db/host', prepared))
			.toEqual({ group: 'database', segments: ['host'] });
	});

	it('Design worked example: /app/ recursive claims /app/host', () => {
		const prepared = ParameterKeySafety.prepareEntries(ENTRIES_RECURSIVE);
		expect(ParameterKeySafety.resolveGroupAndSegments('/app/host', prepared))
			.toEqual({ group: 'app', segments: ['host'] });
	});

	it('Design worked example: /app/ recursive claims /app/cache/ttl (multi-segment)', () => {
		const prepared = ParameterKeySafety.prepareEntries(ENTRIES_RECURSIVE);
		expect(ParameterKeySafety.resolveGroupAndSegments('/app/cache/ttl', prepared))
			.toEqual({ group: 'app', segments: ['cache', 'ttl'] });
	});

	it('Property 9: path without trailing slash resolves the same as with slash', () => {
		const withSlash = ParameterKeySafety.prepareEntries([
			{ path: '/app/', group: 'app', recursive: false }
		]);
		const withoutSlash = ParameterKeySafety.prepareEntries([
			{ path: '/app', group: 'app', recursive: false }
		]);
		expect(ParameterKeySafety.resolveGroupAndSegments('/app/host', withSlash))
			.toEqual(ParameterKeySafety.resolveGroupAndSegments('/app/host', withoutSlash));
	});

	it('Property 8: resolution is independent of entry order in the original array', () => {
		const entriesAB = ParameterKeySafety.prepareEntries([
			{ path: '/app/', group: 'app', recursive: true },
			{ path: '/app/db/', group: 'database', recursive: false }
		]);
		const entriesBA = ParameterKeySafety.prepareEntries([
			{ path: '/app/db/', group: 'database', recursive: false },
			{ path: '/app/', group: 'app', recursive: true }
		]);
		expect(ParameterKeySafety.resolveGroupAndSegments('/app/db/host', entriesAB))
			.toEqual(ParameterKeySafety.resolveGroupAndSegments('/app/db/host', entriesBA));
	});

});

// ---------------------------------------------------------------------------
// detectShadowCollisions — Property 11
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: detectShadowCollisions (Property 11)', () => {

	it('returns empty array when no collisions', () => {
		const names = ['/app/host', '/app/port', '/db/pass'];
		expect(ParameterKeySafety.detectShadowCollisions(names)).toHaveLength(0);
	});

	it('detects a direct prefix collision', () => {
		const names = ['/app/db', '/app/db/host'];
		const result = ParameterKeySafety.detectShadowCollisions(names);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ name: '/app/db/host', shadowedBy: '/app/db' });
	});

	it('detects multiple collisions from one shallower name', () => {
		const names = ['/app/db', '/app/db/host', '/app/db/port'];
		const result = ParameterKeySafety.detectShadowCollisions(names);
		expect(result).toHaveLength(2);
		const collisionNames = result.map(c => c.name).sort();
		expect(collisionNames).toEqual(['/app/db/host', '/app/db/port']);
	});

	it('Property 11: result is independent of input order', () => {
		const names1 = ['/app/db', '/app/db/host'];
		const names2 = ['/app/db/host', '/app/db'];
		const r1 = ParameterKeySafety.detectShadowCollisions(names1);
		const r2 = ParameterKeySafety.detectShadowCollisions(names2);
		expect(r1).toEqual(r2);
	});

	it('non-collision sibling paths are not reported', () => {
		// /app/cache and /app/db are siblings, not in a prefix relationship
		const names = ['/app/cache', '/app/db', '/app/db/host'];
		const result = ParameterKeySafety.detectShadowCollisions(names);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('/app/db/host');
	});

	it('Property 11: property-based — collisions are symmetric under permutation', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.stringMatching(/^\/[a-zA-Z0-9_/]{1,30}$/),
					{ minLength: 0, maxLength: 20 }
				),
				(names) => {
					const shuffled = names.slice().sort(() => Math.random() - 0.5);
					const r1 = ParameterKeySafety.detectShadowCollisions(names);
					const r2 = ParameterKeySafety.detectShadowCollisions(shuffled);
					// Same set of {name, shadowedBy} pairs regardless of order
					const sort = arr => arr.map(c => `${c.name}|${c.shadowedBy}`).sort().join(',');
					expect(sort(r1)).toBe(sort(r2));
				}
			),
			{ numRuns: 100 }
		);
	});

});
