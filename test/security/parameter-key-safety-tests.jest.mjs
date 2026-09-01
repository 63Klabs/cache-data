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

	// Task 5: explicit design-table cases for the charCodeAt-scan rewrite
	it('Task 5: matches the four design table cases explicitly', () => {
		expect(ParameterKeySafety.normalizePath('')).toBe('/');
		expect(ParameterKeySafety.normalizePath('/myapp/prod')).toBe('/myapp/prod/');
		expect(ParameterKeySafety.normalizePath('/myapp/prod/')).toBe('/myapp/prod/');
		expect(ParameterKeySafety.normalizePath('/////')).toBe('/');
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
// normalizePath baseline (Task 1, Property A10, Req 4.4)
//
// Captures the CURRENT regex behavior as a permanently-retained reference
// implementation. This is the differential oracle Task 5 will assert the
// rewritten charCodeAt-scan implementation against. Do not delete this block
// when Task 5 lands; it must keep testing the real ParameterKeySafety.normalizePath
// against this independent oracle.
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: normalizePath baseline oracle (Task 1, Property A10, Req 4.4)', () => {

	// >! This is the CURRENT regex-based implementation, captured verbatim from
	// >! ParameterKeySafety.normalizePath as of Task 1 (before any source change).
	// >! Retained permanently as the differential oracle for Task 5's rewrite.
	const referenceNormalize = p => typeof p !== 'string' ? p : p.replace(/\/*$/, '/');

	it('matches the reference implementation for the four design table cases', () => {
		for (const input of ['', '/myapp/prod', '/myapp/prod/', '/////']) {
			expect(ParameterKeySafety.normalizePath(input)).toBe(referenceNormalize(input));
		}
	});

	it('Property A10 (baseline): matches the reference implementation for generated inputs', () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.string({ maxLength: 60 }),
					fc.stringMatching(/^[/a-z]{0,60}$/)
				),
				(path) => {
					expect(ParameterKeySafety.normalizePath(path)).toBe(referenceNormalize(path));
				}
			),
			{ numRuns: 200 }
		);
	});

	it('non-string input is returned unchanged by both implementations', () => {
		for (const v of [null, undefined, 123, {}, [], true]) {
			expect(ParameterKeySafety.normalizePath(v)).toBe(referenceNormalize(v));
		}
	});

});

// ---------------------------------------------------------------------------
// Task 2 — Defect 8: normalizePath is quadratic (Property A11)
//
// CRITICAL: This measures CURRENT (unfixed) code. It is EXPECTED TO FAIL —
// specifically at the 40000 case — confirming the polynomial-regex defect
// exists. Do NOT "fix" a failing assertion here as part of this task. Task 5
// rewrites normalizePath and Task 7 re-runs this file expecting all three
// sizes to pass comfortably under the 50ms bound.
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: normalizePath timing (Task 2, Property A11, Bug_Condition: long run of trailing slashes followed by a non-slash)', () => {

	it('Defect 8: normalizePath should complete in under 50ms for 10000, 20000, and 40000 trailing slashes', () => {
		// Warmup call, per design.md's timing test mitigation, before measuring.
		ParameterKeySafety.normalizePath('/'.repeat(1000) + 'a');

		const sizes = [10000, 20000, 40000];
		const timings = [];

		for (const n of sizes) {
			const input = '/'.repeat(n) + 'a';
			const start = performance.now();
			ParameterKeySafety.normalizePath(input);
			const elapsed = performance.now() - start;
			timings.push({ n, elapsed });
		}

		// Document observed timings for each size, whether they pass or fail.
		// Observed on CURRENT (unfixed) code per design.md: ~48ms, ~167ms, ~632ms
		// (the 40000 case is expected to blow past the 50ms bound).
		for (const { n, elapsed } of timings) {
			// eslint-disable-next-line no-console
			console.log(`Defect 8: normalizePath('/'.repeat(${n}) + 'a') took ${elapsed.toFixed(2)}ms`);
		}

		for (const { n, elapsed } of timings) {
			expect(elapsed).toBeLessThan(50);
		}
	});

});

// ---------------------------------------------------------------------------
// checkSecretName / isSafeSecretName (Task 3, Property A5, Req 1.1-1.7, 1.9, 5.6)
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: checkSecretName / isSafeSecretName', () => {

	it('accepts a multi-segment secret name', () => {
		expect(ParameterKeySafety.isSafeSecretName('myapp/db/credentials')).toBe(true);
		expect(ParameterKeySafety.checkSecretName('myapp/db/credentials')).toEqual({ safe: true, reason: null });
	});

	it('accepts a full Secrets Manager ARN', () => {
		const arn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:myapp/db-AbCdEf';
		expect(ParameterKeySafety.isSafeSecretName(arn)).toBe(true);
	});

	it('accepts ARN and secret-name punctuation: + = @ - . _', () => {
		for (const name of ['my+secret', 'my=secret', 'my@secret', 'my-secret', 'my.secret', 'my_secret']) {
			expect(ParameterKeySafety.isSafeSecretName(name)).toBe(true);
		}
	});

	it('rejects DANGEROUS_KEYS with reason dangerous-key', () => {
		for (const k of ['__proto__', 'constructor', 'prototype']) {
			expect(ParameterKeySafety.isSafeSecretName(k)).toBe(false);
			expect(ParameterKeySafety.checkSecretName(k)).toEqual({ safe: false, reason: 'dangerous-key' });
		}
	});

	it('rejects every PROTOTYPE_KEYS member with reason prototype-key', () => {
		// "constructor" is a member of both DANGEROUS_KEYS and PROTOTYPE_KEYS, and
		// DANGEROUS_KEYS is checked first, so it reports "dangerous-key" (already
		// covered by the DANGEROUS_KEYS test above). Every other Object.prototype
		// own-property name reports "prototype-key".
		for (const k of Object.getOwnPropertyNames(Object.prototype)) {
			expect(ParameterKeySafety.isSafeSecretName(k)).toBe(false);
			const expectedReason = ParameterKeySafety.DANGEROUS_KEYS.includes(k) ? 'dangerous-key' : 'prototype-key';
			expect(ParameterKeySafety.checkSecretName(k)).toEqual({ safe: false, reason: expectedReason });
		}
	});

	it('rejects names with characters outside the allowlist', () => {
		for (const name of ['a b', 'a[b]', 'a{b}']) {
			expect(ParameterKeySafety.isSafeSecretName(name)).toBe(false);
			expect(ParameterKeySafety.checkSecretName(name).reason).toBe('invalid-characters');
		}
	});

	it('rejects an empty string with reason not-a-non-empty-string', () => {
		expect(ParameterKeySafety.checkSecretName('')).toEqual({ safe: false, reason: 'not-a-non-empty-string' });
	});

	it('rejects non-string values with reason not-a-non-empty-string', () => {
		for (const v of [null, undefined, 123, {}, [], true]) {
			expect(ParameterKeySafety.isSafeSecretName(v)).toBe(false);
			expect(ParameterKeySafety.checkSecretName(v)).toEqual({ safe: false, reason: 'not-a-non-empty-string' });
		}
	});

	it('rejects a name longer than MAX_SECRET_NAME_LENGTH with reason too-long', () => {
		const tooLong = 'a'.repeat(ParameterKeySafety.MAX_SECRET_NAME_LENGTH + 1);
		expect(tooLong.length).toBe(2049);
		expect(ParameterKeySafety.checkSecretName(tooLong)).toEqual({ safe: false, reason: 'too-long' });
	});

	it('rejects a dangerous segment with reason dangerous-segment', () => {
		expect(ParameterKeySafety.checkSecretName('myapp/__proto__/db')).toEqual({ safe: false, reason: 'dangerous-segment' });
	});

	it('rejects a prototype-reachable segment with reason prototype-segment', () => {
		expect(ParameterKeySafety.checkSecretName('myapp/toString')).toEqual({ safe: false, reason: 'prototype-segment' });
	});

	it('skips empty segments rather than rejecting them', () => {
		// "a//b" has an empty middle segment; it must not be rejected on that basis
		const result = ParameterKeySafety.checkSecretName('a//b');
		expect(result).toEqual({ safe: true, reason: null });
	});

	it('Property A5: generated Secrets Manager ARNs are accepted', () => {
		const arnGenerator = fc.tuple(
			fc.stringMatching(/^[a-z0-9-]{2,20}$/), // region
			fc.stringMatching(/^[0-9]{12}$/), // account id
			fc.stringMatching(/^[a-zA-Z0-9/_+=.@-]{1,100}$/), // secret name portion
			fc.stringMatching(/^[a-zA-Z0-9]{6}$/) // AWS-appended suffix
		).map(([region, accountId, secretName, suffix]) =>
			`arn:aws:secretsmanager:${region}:${accountId}:secret:${secretName}-${suffix}`
		);

		fc.assert(
			fc.property(arnGenerator, (arn) => {
				expect(ParameterKeySafety.isSafeSecretName(arn)).toBe(true);
			}),
			{ numRuns: 100 }
		);
	});

});

// ---------------------------------------------------------------------------
// setGroupedSecret / setGroupedSecretMap (Task 4, Property A9, Req 1.13, 2.1,
// 2.3-2.7, 3.1-3.3, 3.5, 3.6)
// ---------------------------------------------------------------------------

describe('ParameterKeySafety: setGroupedSecret', () => {

	it('safe group and name round-trip and are enumerable via Object.keys', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedSecret(store, 'app', 'myapp/db/credentials', 'raw-value');
		expect(result).toEqual({ assigned: true, reason: null });
		expect(Object.keys(store)).toContain('app');
		expect(Object.keys(store.app)).toContain('myapp/db/credentials');
		expect(store.app['myapp/db/credentials']).toBe('raw-value');
	});

	it('accepts a full ARN as the secret name', () => {
		const store = {};
		const arn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:myapp/db-AbCdEf';
		const result = ParameterKeySafety.setGroupedSecret(store, 'app', arn, 'raw-value');
		expect(result).toEqual({ assigned: true, reason: null });
		expect(store.app[arn]).toBe('raw-value');
	});

	it('Property A9: created group has Object.prototype as its prototype', () => {
		const store = {};
		ParameterKeySafety.setGroupedSecret(store, 'app', 'my-secret', 'v');
		expect(Object.getPrototypeOf(store.app)).toBe(Object.prototype);
	});

	it('created group.hasOwnProperty is the native function', () => {
		const store = {};
		ParameterKeySafety.setGroupedSecret(store, 'app', 'my-secret', 'v');
		expect(store.app.hasOwnProperty).toBe(Object.prototype.hasOwnProperty);
	});

	it('rejects an unsafe group with reason unsafe-group', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedSecret(store, '__proto__', 'my-secret', 'v');
		expect(result).toEqual({ assigned: false, reason: 'unsafe-group' });
		expect(Object.keys(store)).toHaveLength(0);
	});

	it('rejects an unsafe secret name with the checkSecretName reason', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedSecret(store, 'app', '__proto__', 'v');
		expect(result).toEqual({ assigned: false, reason: 'dangerous-key' });
		expect(Object.keys(store)).toHaveLength(0);
	});

	it('rejects a prototype-reachable secret name (toString) without shadowing the inherited member', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedSecret(store, 'app', 'toString', 'v');
		expect(result).toEqual({ assigned: false, reason: 'prototype-key' });
		expect(typeof (store.app && store.app.toString)).not.toBe('string');
	});

	it('Object.prototype gains no own property across rejection cases', () => {
		const before = Object.getOwnPropertyNames(Object.prototype);
		const store = {};
		ParameterKeySafety.setGroupedSecret(store, '__proto__', 'x', 'v');
		ParameterKeySafety.setGroupedSecret(store, 'toString', 'x', 'v');
		ParameterKeySafety.setGroupedSecret(store, 'app', '__proto__', 'v');
		ParameterKeySafety.setGroupedSecret(store, 'app', 'toString', 'v');
		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
	});

	it('Property: any safe group + secret name round-trips the value', () => {
		const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);
		const PROTO_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));
		const isSafeGroup = s => !DANGEROUS.has(s) && !PROTO_KEYS.has(s);
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-zA-Z0-9_.-]{1,20}$/).filter(isSafeGroup),
				fc.stringMatching(/^[a-zA-Z0-9_.+=@:/-]{1,20}$/).filter(
					s => !DANGEROUS.has(s) && !PROTO_KEYS.has(s)
				),
				fc.string({ maxLength: 50 }),
				(group, secretName, value) => {
					const store = {};
					const result = ParameterKeySafety.setGroupedSecret(store, group, secretName, value);
					expect(result.assigned).toBe(true);
					expect(Object.keys(store)).toContain(group);
					expect(store[group][secretName]).toBe(value);
				}
			),
			{ numRuns: 200 }
		);
	});

});

describe('ParameterKeySafety: setGroupedSecretMap', () => {

	it('safe group and name round-trip and every key is enumerable via Object.keys', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedSecretMap(store, 'app', 'myapp/db/credentials', { user: 'alice', pass: 's3cr3t' });
		expect(result.assigned).toBe(true);
		expect(result.reason).toBeNull();
		expect(result.skipped).toHaveLength(0);
		expect(Object.keys(store)).toContain('app');
		expect(Object.keys(store.app)).toContain('myapp/db/credentials');
		expect(Object.keys(store.app['myapp/db/credentials'])).toEqual(['user', 'pass']);
		expect(store.app['myapp/db/credentials'].user).toBe('alice');
		expect(store.app['myapp/db/credentials'].pass).toBe('s3cr3t');
	});

	it('writes values via String(value), preserving current coercion', () => {
		const store = {};
		ParameterKeySafety.setGroupedSecretMap(store, 'app', 'my-secret', { count: 42, active: true });
		expect(store.app['my-secret'].count).toBe('42');
		expect(store.app['my-secret'].active).toBe('true');
	});

	it('Property A9: created group and container have Object.prototype as their prototype', () => {
		const store = {};
		ParameterKeySafety.setGroupedSecretMap(store, 'app', 'my-secret', { user: 'alice' });
		expect(Object.getPrototypeOf(store.app)).toBe(Object.prototype);
		expect(Object.getPrototypeOf(store.app['my-secret'])).toBe(Object.prototype);
	});

	it('created group.hasOwnProperty and container.hasOwnProperty are the native function', () => {
		const store = {};
		ParameterKeySafety.setGroupedSecretMap(store, 'app', 'my-secret', { user: 'alice' });
		expect(store.app.hasOwnProperty).toBe(Object.prototype.hasOwnProperty);
		expect(store.app['my-secret'].hasOwnProperty).toBe(Object.prototype.hasOwnProperty);
	});

	it('rejects an unsafe group with reason unsafe-group and an empty skipped array', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedSecretMap(store, '__proto__', 'my-secret', { user: 'alice' });
		expect(result).toEqual({ assigned: false, reason: 'unsafe-group', skipped: [] });
		expect(Object.keys(store)).toHaveLength(0);
	});

	it('rejects an unsafe secret name with the checkSecretName reason and an empty skipped array', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedSecretMap(store, 'app', '__proto__', { user: 'alice' });
		expect(result).toEqual({ assigned: false, reason: 'dangerous-key', skipped: [] });
		expect(Object.keys(store)).toHaveLength(0);
	});

	it('unsafe parsed keys are pushed to skipped and remaining keys are still stored', () => {
		const store = {};
		const result = ParameterKeySafety.setGroupedSecretMap(store, 'app', 'my-secret', {
			user: 'alice',
			__proto__: 'ignored-own-enumerable-not-possible-but-toString-is',
			toString: 'shadow-attempt',
			pass: 's3cr3t'
		});
		// Object.keys(parsed) never yields "__proto__" here because the object
		// literal's __proto__ key sets the prototype rather than creating an own
		// enumerable property; "toString" is the reachable unsafe key under test.
		expect(result.assigned).toBe(true);
		expect(result.skipped).toEqual(
			expect.arrayContaining([{ key: 'toString', reason: 'prototype-key' }])
		);
		expect(store.app['my-secret'].user).toBe('alice');
		expect(store.app['my-secret'].pass).toBe('s3cr3t');
		expect(typeof store.app['my-secret'].toString).toBe('function');
	});

	it('Object.prototype gains no own property across all rejection and skip cases', () => {
		const before = Object.getOwnPropertyNames(Object.prototype);
		const store = {};
		ParameterKeySafety.setGroupedSecretMap(store, '__proto__', 'x', { a: '1' });
		ParameterKeySafety.setGroupedSecretMap(store, 'app', '__proto__', { a: '1' });
		ParameterKeySafety.setGroupedSecretMap(store, 'app', 'my-secret', { toString: 'x', hasOwnProperty: 'y', constructor: 'z' });
		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
	});

	it('Property: any safe group + secret name + safe parsed keys round-trip with no skips', () => {
		const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);
		const PROTO_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));
		const isSafeSsmKey = s => !DANGEROUS.has(s) && !PROTO_KEYS.has(s);
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-zA-Z0-9_.-]{1,20}$/).filter(isSafeSsmKey),
				fc.stringMatching(/^[a-zA-Z0-9_.+=@:/-]{1,20}$/).filter(
					s => !DANGEROUS.has(s) && !PROTO_KEYS.has(s)
				),
				fc.dictionary(
					fc.stringMatching(/^[a-zA-Z0-9_.-]{1,15}$/).filter(isSafeSsmKey),
					fc.string({ maxLength: 30 }),
					{ maxKeys: 5 }
				),
				(group, secretName, parsed) => {
					const store = {};
					const result = ParameterKeySafety.setGroupedSecretMap(store, group, secretName, parsed);
					expect(result.assigned).toBe(true);
					expect(result.skipped).toHaveLength(0);
					for (const key of Object.keys(parsed)) {
						expect(store[group][secretName][key]).toBe(String(parsed[key]));
					}
				}
			),
			{ numRuns: 100 }
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
