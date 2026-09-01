/**
 * Preservation baseline tests for SecretsManagerLoader (Task 1)
 *
 * IMPORTANT: These tests are written and run against CURRENT (unfixed) code,
 * per the observation-first methodology described in tasks.md. They lock the
 * behavior that MUST survive the fix in
 * .kiro/specs/1-3-16-fix-ssm-param-security/. Task 2 will add tests for the
 * defects themselves (which MUST fail on current code); this file only
 * covers behavior that is currently correct and must not regress.
 *
 * Covers design.md Properties A4, A5, A8, A10 (partial — normalizePath oracle
 * lives in parameter-key-safety-tests.jest.mjs) and requirements.md
 * Req 1.13, 3.1, 3.2, 3.3, 4.4, 5.4, 5.6, 5.7.
 *
 * @see .kiro/specs/1-3-16-fix-ssm-param-security/requirements.md
 * @see .kiro/specs/1-3-16-fix-ssm-param-security/design.md
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tools = await import('../../src/lib/tools/index.js');
const SecretsManagerLoader = (await import('../../src/lib/utils/SecretsManagerLoader.class.js')).default;

afterEach(() => {
	jest.restoreAllMocks();
});

/**
 * Mocks tools.default.AWS.secrets using the getter-spy pattern required because
 * SecretsManagerLoader lazily requires AWS inside load(). Returns the named mock
 * function so callers can assert call counts (needed later for Property A6).
 *
 * @param {function(object): Promise<object>} getImpl - implementation for AWS.secrets.get
 * @returns {jest.Mock} the mockGet function, so tests can assert on it directly
 */
function mockAwsSecretsGet(getImpl) {
	const mockGet = jest.fn(getImpl);
	jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
		client: {},
		get: mockGet,
		available: true,
		reason: null,
		sdk: {}
	});
	return mockGet;
}

// ---------------------------------------------------------------------------
// Multi-segment names (Property A4, Req 5.7)
// ---------------------------------------------------------------------------

describe('Baseline: multi-segment secret names (Property A4, Req 5.7)', () => {

	it('stores a multi-segment secret name verbatim as ONE key, not nested', async () => {
		mockAwsSecretsGet(async () => ({
			SecretString: '{"user":"alice"}',
			VersionId: 'v1'
		}));

		const result = await SecretsManagerLoader.load([
			{ group: 'db', names: ['myapp/db/credentials'] }
		]);

		expect(result.store.db['myapp/db/credentials']).toBe('{"user":"alice"}');
		// The "/" delimited name is one key, never split into nested objects
		expect(result.store.db.myapp).toBeUndefined();
	});

	it('the multi-segment key appears in Object.keys(store.db)', async () => {
		mockAwsSecretsGet(async () => ({
			SecretString: 'raw-value',
			VersionId: 'v1'
		}));

		const result = await SecretsManagerLoader.load([
			{ group: 'db', names: ['myapp/db/credentials'] }
		]);

		expect(Object.keys(result.store.db)).toContain('myapp/db/credentials');
	});

});

// ---------------------------------------------------------------------------
// ARN names (Property A5, Req 5.6)
// ---------------------------------------------------------------------------

describe('Baseline: ARN secret names (Property A5, Req 5.6)', () => {

	it('stores a full Secrets Manager ARN verbatim as a single key', async () => {
		const arn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:myapp/db-AbCdEf';

		mockAwsSecretsGet(async () => ({
			SecretString: 'arn-secret-value',
			VersionId: 'v1'
		}));

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: [arn] }
		]);

		expect(result.store.app[arn]).toBe('arn-secret-value');
		expect(Object.keys(result.store.app)).toContain(arn);
	});

});

// ---------------------------------------------------------------------------
// Parsed-key warn-and-skip (Property A8, Req 1.13)
// ---------------------------------------------------------------------------

describe('Baseline: parsed-key warn-and-skip (Property A8, Req 1.13)', () => {

	it('parseJson stores safe keys and reports the unsafe __proto__ key in skipped', async () => {
		mockAwsSecretsGet(async () => ({
			SecretString: '{"username":"admin","__proto__":"polluted"}',
			VersionId: 'v1'
		}));

		const before = Object.getOwnPropertyNames(Object.prototype);

		const result = await SecretsManagerLoader.load([
			{ group: 'sec', names: ['myapp/db/credentials'], parseJson: true }
		]);

		const after = Object.getOwnPropertyNames(Object.prototype);
		// >! Object.prototype hygiene: no run of the loader may add an own property
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);

		expect(result.store.sec['myapp/db/credentials'].username).toBe('admin');
		expect(Object.keys(result.store.sec['myapp/db/credentials'])).not.toContain('__proto__');
		expect(result.skipped.some(s => s.name.includes('__proto__'))).toBe(true);
	});

});

// ---------------------------------------------------------------------------
// Unchanged edge cases
// ---------------------------------------------------------------------------

describe('Baseline: unchanged edge cases', () => {

	it('binary secret (no SecretString) is reported in skipped with reason binary-secret', async () => {
		mockAwsSecretsGet(async () => ({
			ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:binary-secret',
			Name: 'binary-secret',
			SecretBinary: Buffer.from('binary-data').toString('base64'),
			VersionId: 'v1'
		}));

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: ['binary-secret'] }
		]);

		expect(result.store.app?.['binary-secret']).toBeUndefined();
		expect(result.skipped.some(s => s.name === 'binary-secret' && s.reason === 'binary-secret')).toBe(true);
	});

	it('parseJson on a non-JSON value stores the raw string', async () => {
		mockAwsSecretsGet(async () => ({
			SecretString: 'not-valid-json{{{',
			VersionId: 'v1'
		}));

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: ['bad-secret'], parseJson: true }
		]);

		expect(result.store.app['bad-secret']).toBe('not-valid-json{{{');
	});

	it('parseJson on scalar JSON stores the raw string', async () => {
		mockAwsSecretsGet(async () => ({
			SecretString: '42',
			VersionId: 'v1'
		}));

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: ['scalar-secret'], parseJson: true }
		]);

		expect(result.store.app['scalar-secret']).toBe('42');
	});

	it('parseJson on array JSON stores the raw string', async () => {
		mockAwsSecretsGet(async () => ({
			SecretString: '["a","b","c"]',
			VersionId: 'v1'
		}));

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: ['array-secret'], parseJson: true }
		]);

		expect(result.store.app['array-secret']).toBe('["a","b","c"]');
	});

	it('AWS.secrets.get rejection is reported in failed, and remaining names still process', async () => {
		const mockGet = jest.fn()
			.mockRejectedValueOnce(new Error('ResourceNotFoundException'))
			.mockResolvedValueOnce({ SecretString: 'val', VersionId: 'v1' });

		jest.spyOn(tools.default.AWS, 'secrets', 'get').mockReturnValue({
			client: {}, get: mockGet, available: true, reason: null, sdk: {}
		});

		const result = await SecretsManagerLoader.load([
			{ group: 'app', names: ['missing-secret', 'good-secret'] }
		]);

		expect(result.failed.some(f => f.name === 'missing-secret')).toBe(true);
		expect(result.store.app['good-secret']).toBe('val');
	});

});

// ---------------------------------------------------------------------------
// Task 2 — Bug condition tests (written and run against CURRENT, unfixed code)
//
// CRITICAL: Every assertion below is written against the FIXED behavior that
// Tasks 3-6 will implement. On CURRENT (unfixed) code they are EXPECTED TO
// FAIL — a failure here is the documented confirmation that the corresponding
// defect exists. Do NOT "fix" a failing assertion in this block as part of
// this task. Task 7 re-runs this exact file and expects every case below to
// PASS once the fix lands.
//
// Pattern used throughout: capture whether load() threw (rather than using
// `await expect(...).rejects.toThrow()` directly) so that a single test can
// both (a) assert the required post-fix behavior — `thrown` must not be
// null — and (b) document, in a conditional block that only executes while
// the bug is present, what CURRENT code actually does. After the fix lands,
// `thrown` will not be null, the documentation block is skipped, and the
// test passes without needing any changes to this file.
// ---------------------------------------------------------------------------

describe('Task 2 — Bug condition tests (run on UNFIXED code, expected to FAIL)', () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	// -------------------------------------------------------------------------
	// Defect 1 — dangerous secret name, raw path (Property A1)
	// -------------------------------------------------------------------------

	it('Defect 1: secret named "__proto__" on the raw path — load() should reject (Bug_Condition: secretName IN DANGEROUS_KEYS AND parseJson is falsy)', async () => {
		const before = Object.getOwnPropertyNames(Object.prototype);

		mockAwsSecretsGet(async () => ({
			SecretString: 'some-secret-value',
			VersionId: 'v1'
		}));

		let thrown = null;
		let result = null;
		try {
			result = await SecretsManagerLoader.load([
				{ group: 'app', names: ['__proto__'] }
			]);
		} catch (err) {
			thrown = err;
		}

		// EXPECTED (fixed) behavior
		expect(thrown).not.toBeNull();

		if (thrown === null) {
			// CURRENT (unfixed) behavior: the native "__proto__" setter silently
			// ignores a non-object assignment, so store.app ends up with no own
			// properties at all, yet the loader reports success.
			expect(Object.getOwnPropertyNames(result.store.app ?? {})).toHaveLength(0);
			expect(result.failed).toHaveLength(0);
			expect(result.skipped).toHaveLength(0);
		}

		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Defect 2 — dangerous secret name, parse path (Property A1)
	// -------------------------------------------------------------------------

	it('Defect 2: secret named "__proto__" on the parseJson path — load() should reject (Bug_Condition: secretName IN DANGEROUS_KEYS AND parseJson is true)', async () => {
		const before = Object.getOwnPropertyNames(Object.prototype);

		mockAwsSecretsGet(async () => ({
			SecretString: JSON.stringify({ username: 'alice', password: 's3cr3t' }),
			VersionId: 'v1'
		}));

		let thrown = null;
		let result = null;
		try {
			result = await SecretsManagerLoader.load([
				{ group: 'app', names: ['__proto__'], parseJson: true }
			]);
		} catch (err) {
			thrown = err;
		}

		// EXPECTED (fixed) behavior
		expect(thrown).not.toBeNull();

		if (thrown === null) {
			// CURRENT (unfixed) behavior: store.app["__proto__"] = {} reparents
			// store.app's prototype. Parsed keys are then written onto that new
			// prototype object instead of as own properties of store.app, so they
			// are dotted-access readable but not enumerable via Object.keys().
			expect(Object.getPrototypeOf(result.store.app)).not.toBe(Object.prototype);
			expect(Object.keys(result.store.app)).not.toContain('username');
		}

		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Defect 3 — prototype-reachable secret name (Property A2)
	// -------------------------------------------------------------------------

	it('Defect 3: any Object.prototype own-property name as secret — load() should reject (Bug_Condition: secretName IN Object.getOwnPropertyNames(Object.prototype))', async () => {
		const beforeAll = Object.getOwnPropertyNames(Object.prototype);
		const protoKeys = Object.getOwnPropertyNames(Object.prototype);

		mockAwsSecretsGet(async () => ({
			SecretString: 'some-secret-value',
			VersionId: 'v1'
		}));

		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(...protoKeys),
				async (secretName) => {
					const before = Object.getOwnPropertyNames(Object.prototype);

					let thrown = null;
					let result = null;
					try {
						result = await SecretsManagerLoader.load([
							{ group: 'app', names: [secretName] }
						]);
					} catch (err) {
						thrown = err;
					}

					// EXPECTED (fixed) behavior
					expect(thrown).not.toBeNull();

					if (thrown === null && secretName === 'toString') {
						// CURRENT (unfixed) behavior: store.app.toString is
						// overwritten with the raw string value, shadowing the
						// native inherited method.
						expect(typeof result.store.app?.toString).toBe('function');
					}

					const after = Object.getOwnPropertyNames(Object.prototype);
					expect(after.filter(k => !before.includes(k))).toHaveLength(0);
				}
			),
			{ numRuns: 20 }
		);

		const afterAll = Object.getOwnPropertyNames(Object.prototype);
		expect(afterAll.filter(k => !beforeAll.includes(k))).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Defect 4 — dangerous segment (Property A3)
	// -------------------------------------------------------------------------

	it('Defect 4: secret name containing a dangerous or prototype-reachable segment — load() should reject (Bug_Condition: any segment of secretName IN DANGEROUS_KEYS OR PROTOTYPE_KEYS)', async () => {
		const before = Object.getOwnPropertyNames(Object.prototype);

		mockAwsSecretsGet(async () => ({
			SecretString: 'some-secret-value',
			VersionId: 'v1'
		}));

		for (const secretName of ['myapp/__proto__/db', 'myapp/toString']) {
			let thrown = null;
			try {
				await SecretsManagerLoader.load([
					{ group: 'app', names: [secretName] }
				]);
			} catch (err) {
				thrown = err;
			}

			// EXPECTED (fixed) behavior — CURRENT (unfixed) code accepts these
			// names verbatim because segments are not validated at all.
			expect(thrown).not.toBeNull();
		}

		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Defect 5 — unsafe group throws (Req 1.8)
	// -------------------------------------------------------------------------

	it('Defect 5: unsafe group ("__proto__" or "toString") — load() should reject rather than warn-and-skip', async () => {
		const before = Object.getOwnPropertyNames(Object.prototype);

		mockAwsSecretsGet(async () => ({
			SecretString: 'some-secret-value',
			VersionId: 'v1'
		}));

		for (const group of ['__proto__', 'toString']) {
			let thrown = null;
			let result = null;
			try {
				result = await SecretsManagerLoader.load([
					{ group, names: ['ok'] }
				]);
			} catch (err) {
				thrown = err;
			}

			// EXPECTED (fixed) behavior (Req 1.8)
			expect(thrown).not.toBeNull();

			if (thrown === null) {
				// CURRENT (unfixed) behavior: the group is warned and skipped
				// rather than throwing; load() resolves successfully with the
				// secret reported in `skipped` instead of raising an error.
				expect(result.skipped.some(s => s.group === group)).toBe(true);
				expect(Object.keys(result.store)).not.toContain(group);
			}
		}

		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Defect 6 — AWS call issued on invalid config (Property A6)
	// -------------------------------------------------------------------------

	it('Defect 6: no AWS call should be issued when config is invalid (Bug_Condition: validation runs after retrieval)', async () => {
		const mockGet = mockAwsSecretsGet(async () => ({
			SecretString: 'some-secret-value',
			VersionId: 'v1'
		}));

		try {
			await SecretsManagerLoader.load([
				{ group: 'app', names: ['__proto__'] }
			]);
		} catch {
			// Whether or not load() rejects is covered by Defect 1; this test is
			// only about the AWS call count.
		}

		// EXPECTED (fixed) behavior (Req 1.11) — CURRENT (unfixed) code issues
		// the AWS call before any validation runs.
		expect(mockGet).toHaveBeenCalledTimes(0);
	});

	// -------------------------------------------------------------------------
	// Defect 7 — throw swallowed by retrieval handler (Property A7)
	// -------------------------------------------------------------------------

	it('Defect 7: load() should reject rather than resolving with the unsafe name present in `failed` (Bug_Condition: validation throw occurs inside the per-secret try/catch)', async () => {
		const before = Object.getOwnPropertyNames(Object.prototype);

		mockAwsSecretsGet(async () => ({
			SecretString: 'some-secret-value',
			VersionId: 'v1'
		}));

		let thrown = null;
		let result = null;
		try {
			result = await SecretsManagerLoader.load([
				{ group: 'app', names: ['__proto__'] }
			]);
		} catch (err) {
			thrown = err;
		}

		// EXPECTED (fixed) behavior
		expect(thrown).not.toBeNull();

		if (thrown === null) {
			// CURRENT (unfixed) behavior: the unsafe name is never captured by the
			// per-secret retrieval try/catch — it is not present in `failed`,
			// because the value was written (and silently discarded, see Defect 1)
			// rather than raising a retrieval error.
			expect(result.failed.some(f => f.name === '__proto__')).toBe(false);
		}

		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
	});

});

// ---------------------------------------------------------------------------
// Existing fixture audit — confirm secret names used elsewhere in the suite
// will pass the Task 3 validation, so implementing checkSecretName does not
// begin throwing for any existing test fixture.
//
// checkSecretName does not exist yet (Task 3 has not run). This block encodes
// the algorithm exactly as documented in design.md so the audit can run now,
// against the CURRENT set of fixture names, before the real implementation
// exists. Task 3's implementation is expected to match this reference; Task 7
// re-verifies against the real ParameterKeySafety.checkSecretName.
// ---------------------------------------------------------------------------

describe('Baseline: existing fixture names pass the upcoming Task 3 validation', () => {

	const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
	const PROTOTYPE_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));
	const SECRET_NAME_PATTERN = /^[a-zA-Z0-9_.+=@:/-]+$/;
	const MAX_SECRET_NAME_LENGTH = 2048;

	/**
	 * Reference implementation of the future ParameterKeySafety.checkSecretName,
	 * transcribed from design.md's documented check order. Used only to audit
	 * existing fixtures before the real implementation lands in Task 3.
	 *
	 * @param {*} name
	 * @returns {{safe: boolean, reason: string|null}}
	 */
	function referenceCheckSecretName(name) {
		if (typeof name !== 'string' || name.length === 0) {
			return { safe: false, reason: 'not-a-non-empty-string' };
		}
		if (name.length > MAX_SECRET_NAME_LENGTH) {
			return { safe: false, reason: 'too-long' };
		}
		if (DANGEROUS_KEYS.includes(name)) {
			return { safe: false, reason: 'dangerous-key' };
		}
		if (PROTOTYPE_KEYS.has(name)) {
			return { safe: false, reason: 'prototype-key' };
		}
		if (!SECRET_NAME_PATTERN.test(name)) {
			return { safe: false, reason: 'invalid-characters' };
		}
		for (const seg of name.split('/')) {
			if (seg === '') continue;
			if (DANGEROUS_KEYS.includes(seg)) {
				return { safe: false, reason: 'dangerous-segment' };
			}
			if (PROTOTYPE_KEYS.has(seg)) {
				return { safe: false, reason: 'prototype-segment' };
			}
		}
		return { safe: true, reason: null };
	}

	// Names already used as secret fixtures in
	// test/config/cached-parameter-secrets-init-tests.jest.mjs and
	// test/config/secrets-config-path-tests.jest.mjs
	const EXISTING_FIXTURE_NAMES = [
		'myapp/db/credentials',
		'my-secret',
		'my/secret',
		's1',
		'restricted'
	];

	it.each(EXISTING_FIXTURE_NAMES)('fixture name "%s" passes the reference checkSecretName', (name) => {
		expect(referenceCheckSecretName(name)).toEqual({ safe: true, reason: null });
	});

});

// ---------------------------------------------------------------------------
// Task 6.4 — Chokepoint compliance test (Property A12)
//
// A source scan of SecretsManagerLoader.class.js finds no bracket-assignment
// expression. This is the structural guarantee behind Req 2.1/2.2: every
// secret-key write is delegated to ParameterKeySafety.setGroupedSecret /
// setGroupedSecretMap, and SecretsManagerLoader itself performs no bracket
// assignment of its own.
//
// >! This is a TEXT SCAN, not a semantic proof. It matches assignment syntax
// >! (identifier[expression] = ...), not program semantics. A sufficiently
// >! indirect reintroduction of the same defect — e.g. Reflect.set(store[group],
// >! secretName, value), or a destructuring assignment into a computed key
// >! such as ({[secretName]: store[group][secretName]} = ...) — would evade
// >! this scan entirely. It is a guardrail against the obvious regression
// >! (typing `store[group][secretName] = ...` back into this file), not a
// >! guarantee that the chokepoint invariant holds under all possible code.
// See design.md § Correctness Properties, Property A12, and § Known
// Limitations, item 3.
// ---------------------------------------------------------------------------

describe('SecretsManagerLoader: chokepoint compliance (Property A12)', () => {

	it('source contains no bracket-assignment expression outside comments', () => {
		const filePath = path.join(__dirname, '../../src/lib/utils/SecretsManagerLoader.class.js');
		const source = fs.readFileSync(filePath, 'utf-8');

		// >! Strip comments before scanning so that documentation (e.g. the
		// >! class-level JSDoc referencing "store[group][secretName]") is not
		// >! mistaken for executable bracket-assignment code. Order matters:
		// >! block comments first, then line comments, so a "//" inside a
		// >! block comment is not treated as starting a separate line comment.
		const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
		const withoutLineComments = withoutBlockComments.replace(/\/\/.*$/gm, '');

		// >! Detect a computed member expression on the left side of an
		// >! assignment: identifier[expression] = value. The negative lookahead
		// >! (?!=) excludes "==" (equality) and "===" so this only matches
		// >! actual assignment, not comparison.
		const bracketAssignmentPattern = /\w+\[[^\]]+\]\s*=(?!=)/g;
		const matches = withoutLineComments.match(bracketAssignmentPattern) || [];

		expect(matches).toEqual([]);
	});

});
