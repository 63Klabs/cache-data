/**
 * Property-based tests for ParameterKeySafety prefix resolution (Properties 8, 9, 10, 11)
 *
 * Req 3.3, 6.4, 6.5, 6.6
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

const ParameterKeySafety = (await import('../../../src/lib/utils/ParameterKeySafety.class.js')).default;

// ---------------------------------------------------------------------------
// Property 8 — prefix determinism
// ---------------------------------------------------------------------------

describe('Property 8: prefix resolution is deterministic regardless of entry order', () => {

	it('same result for identical entries in different array orders', () => {
		fc.assert(
			fc.property(
				// Two distinct path prefixes where one is longer
				fc.record({
					short: fc.constantFrom('/app/', '/db/', '/config/'),
					ext: fc.constantFrom('cache/', 'db/', 'auth/', 'params/')
				}).map(({ short, ext }) => ({
					shorter: short,
					longer: short + ext
				})),
				fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
				({ shorter, longer }, paramName) => {
					const entries1 = [
						{ path: shorter, group: 'short', recursive: true },
						{ path: longer, group: 'long', recursive: false }
					];
					const entries2 = [
						{ path: longer, group: 'long', recursive: false },
						{ path: shorter, group: 'short', recursive: true }
					];
					const fullName = longer + paramName;
					const r1 = ParameterKeySafety.resolveGroupAndSegments(
						fullName, ParameterKeySafety.prepareEntries(entries1)
					);
					const r2 = ParameterKeySafety.resolveGroupAndSegments(
						fullName, ParameterKeySafety.prepareEntries(entries2)
					);
					// Must resolve identically regardless of which order entries were provided
					expect(r1).toEqual(r2);
					if (r1) {
						// The longer (more specific) entry should win
						expect(r1.group).toBe('long');
					}
				}
			),
			{ numRuns: 100 }
		);
	});

});

// ---------------------------------------------------------------------------
// Property 9 — trailing slash invariance
// ---------------------------------------------------------------------------

describe('Property 9: resolution is invariant under trailing slash normalization', () => {

	it('path with and without trailing slash resolve identically', () => {
		fc.assert(
			fc.property(
				fc.constantFrom('/app', '/myapp/prod', '/config/db'),
				fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
				(basePath, paramLeaf) => {
					const withSlash = ParameterKeySafety.prepareEntries([
						{ path: basePath + '/', group: 'app', recursive: false }
					]);
					const withoutSlash = ParameterKeySafety.prepareEntries([
						{ path: basePath, group: 'app', recursive: false }
					]);
					const name = basePath + '/' + paramLeaf;
					const r1 = ParameterKeySafety.resolveGroupAndSegments(name, withSlash);
					const r2 = ParameterKeySafety.resolveGroupAndSegments(name, withoutSlash);
					expect(r1).toEqual(r2);
				}
			),
			{ numRuns: 100 }
		);
	});

});

// ---------------------------------------------------------------------------
// Property 10 — unmatched paths produce null, not an error
// ---------------------------------------------------------------------------

describe('Property 10: unmatched parameter never throws', () => {

	it('returns null (not throws) for any parameter matching no configured entry', () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 50 }),
				(paramName) => {
					const entries = ParameterKeySafety.prepareEntries([
						{ path: '/app/', group: 'app', recursive: false }
					]);
					// Either null (no match) or a valid result — never throws
					const result = ParameterKeySafety.resolveGroupAndSegments('/other/' + paramName, entries);
					expect(result).toBeNull();
				}
			),
			{ numRuns: 100 }
		);
	});

});

// ---------------------------------------------------------------------------
// Property 11 — shadow collision detection is order-independent
// ---------------------------------------------------------------------------

describe('Property 11: shadow collisions are symmetric under permutation', () => {

	it('same collisions for any permutation of parameter names', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.string({ minLength: 2, maxLength: 30 }).filter(
						s => /^\/[a-zA-Z0-9_/]{1,29}$/.test(s)
					),
					{ minLength: 0, maxLength: 15 }
				),
				(names) => {
					const shuffled = names.slice().sort(() => Math.random() - 0.5);
					const r1 = ParameterKeySafety.detectShadowCollisions(names);
					const r2 = ParameterKeySafety.detectShadowCollisions(shuffled);
					const sort = arr => arr.map(c => `${c.name}|${c.shadowedBy}`).sort().join(',');
					expect(sort(r1)).toBe(sort(r2));
				}
			),
			{ numRuns: 100 }
		);
	});

	it('shallower scalar always wins (not the deeper path)', () => {
		const names = ['/app/db', '/app/db/host', '/app/db/port'];
		const collisions = ParameterKeySafety.detectShadowCollisions(names);
		// The two deeper paths are in the collision list, not /app/db
		const collisionNames = collisions.map(c => c.name);
		expect(collisionNames).toContain('/app/db/host');
		expect(collisionNames).toContain('/app/db/port');
		expect(collisionNames).not.toContain('/app/db');
	});

});
