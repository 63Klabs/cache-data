/**
 * Security Bugfix Exploration Tests
 * 
 * Property 1: Bug Condition — Incomplete String Escaping and Prototype Pollution
 * 
 * CRITICAL: These tests MUST FAIL on unfixed code — failure confirms the bugs exist.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * This test encodes the expected behavior — it will validate the fix when it
 * passes after implementation.
 * 
 * Goal: Surface counterexamples that demonstrate both bugs exist on unfixed code.
 * 
 * Issue 1: Incomplete string escaping (CWE-116) in parseParamTag
 *   - .replace(']', '') only removes the first ] occurrence
 *   - test/helpers/jsdoc-parser.mjs:78
 *   - scripts/audit-documentation.mjs:155
 * 
 * Issue 2: Prototype pollution (CWE-471) in _getParametersFromStore
 *   - paramstore[group][name] = param.Value can alter Object.prototype
 *   - src/lib/tools/index.js:471
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import parseParamTag from test helper (ESM export)
import { parseParamTag as helperParseParamTag } from '../helpers/jsdoc-parser.mjs';

// Import parseParamTag from audit-documentation.mjs (not exported, extract via eval)
const auditScriptPath = path.join(__dirname, '..', '..', 'scripts', 'audit-documentation.mjs');
const auditScriptContent = fs.readFileSync(auditScriptPath, 'utf-8');
const parseParamTagMatch = auditScriptContent.match(/function parseParamTag\(line\) \{[\s\S]*?\n\}/);
if (!parseParamTagMatch) {
	throw new Error('Could not find parseParamTag function in audit script');
}
const auditParseParamTag = eval(`(${parseParamTagMatch[0]})`);

// Import tools module for Issue 2 (prototype pollution)
const tools = await import('../../src/lib/tools/index.js');
const { AppConfig, AWS, DebugAndLog } = tools.default;


/**
 * DANGEROUS_KEYS constant used across Issue 2 tests
 */
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

describe('Security Bugfix Exploration Tests — Bug Condition Property', () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	// =========================================================================
	// Issue 1 — Incomplete String Escaping (CWE-116)
	// =========================================================================

	describe('Issue 1: Incomplete String Escaping — test/helpers/jsdoc-parser.mjs', () => {

		it('Bug Condition: parseParamTag should remove ALL ] from defaultValue for [name=default]]', () => {
			// Expected behavior: defaultValue should be "default" with no remaining ]
			// Bug condition: .replace(']', '') only removes the first ]
			const result = helperParseParamTag('@param {string} [name=default]]');
			expect(result).not.toBeNull();
			expect(result.defaultValue).toBe('default');
		});

		it('Bug Condition: parseParamTag should remove ALL ] from defaultValue for [name=val]]]', () => {
			// Expected behavior: defaultValue should be "val" with no remaining ]
			const result = helperParseParamTag('@param {string} [name=val]]]');
			expect(result).not.toBeNull();
			expect(result.defaultValue).toBe('val');
		});

		it('Bug Condition (PBT): for all default values with 2+ ] chars, no ] remains in defaultValue', () => {
			fc.assert(
				fc.property(
					// Generate alphanumeric default values with 2+ ] appended
					fc.tuple(
						fc.stringMatching(/^[a-z0-9]{1,10}$/),
						fc.integer({ min: 2, max: 5 })
					),
					([baseValue, bracketCount]) => {
						const brackets = ']'.repeat(bracketCount);
						const line = `@param {string} [name=${baseValue}${brackets}]`;
						const result = helperParseParamTag(line);

						// Expected: result is not null and defaultValue has no ] characters
						expect(result).not.toBeNull();
						expect(result.defaultValue).not.toBeNull();
						expect(result.defaultValue).not.toContain(']');
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Issue 1: Incomplete String Escaping — scripts/audit-documentation.mjs', () => {

		it('Bug Condition: parseParamTag should remove ALL ] from defaultValue for [name=default]]', () => {
			const result = auditParseParamTag('@param {string} [name=default]]');
			expect(result).not.toBeNull();
			expect(result.defaultValue).toBe('default');
		});

		it('Bug Condition: parseParamTag should remove ALL ] from defaultValue for [name=val]]]', () => {
			const result = auditParseParamTag('@param {string} [name=val]]]');
			expect(result).not.toBeNull();
			expect(result.defaultValue).toBe('val');
		});

		it('Bug Condition (PBT): for all default values with 2+ ] chars, no ] remains in defaultValue', () => {
			fc.assert(
				fc.property(
					fc.tuple(
						fc.stringMatching(/^[a-z0-9]{1,10}$/),
						fc.integer({ min: 2, max: 5 })
					),
					([baseValue, bracketCount]) => {
						const brackets = ']'.repeat(bracketCount);
						const line = `@param {string} [name=${baseValue}${brackets}]`;
						const result = auditParseParamTag(line);

						expect(result).not.toBeNull();
						expect(result.defaultValue).not.toBeNull();
						expect(result.defaultValue).not.toContain(']');
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	// =========================================================================
	// Issue 2 — Prototype Pollution Guard (CWE-471)
	// =========================================================================

	describe('Issue 2: Prototype Pollution — src/lib/tools/index.js', () => {

		afterEach(() => {
			// >! Critical: clean up any prototype pollution that may have occurred
			for (const key of DANGEROUS_KEYS) {
				// Remove any properties that were added to Object.prototype
				const descriptors = Object.getOwnPropertyDescriptors(Object.prototype);
				for (const prop of Object.keys(descriptors)) {
					if (prop === 'polluted' || prop === 'testKey' || prop === 'exploitValue') {
						delete Object.prototype[prop];
					}
				}
			}
			jest.restoreAllMocks();
		});

		it('Bug Condition: __proto__ as group should NOT modify Object.prototype', async () => {
			// Mock AWS.ssm to return parameters with __proto__ as group
			const mockGetByName = jest.fn().mockResolvedValue({
				Parameters: [
					{ Name: '/app/__proto__/polluted', Value: 'exploitValue' }
				]
			});

			jest.spyOn(AWS, 'ssm', 'get').mockReturnValue({
				client: {},
				getByName: mockGetByName,
				getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
				sdk: {}
			});

			const parameters = [
				{ group: '__proto__', path: '/app/__proto__/', names: ['polluted'] }
			];

			// Save Object.prototype state before
			const protoBefore = Object.keys(Object.getOwnPropertyDescriptors(Object.prototype));

			const paramstore = await AppConfig._getParametersFromStore(parameters);

			// Expected behavior: Object.prototype should NOT be modified
			const protoAfter = Object.keys(Object.getOwnPropertyDescriptors(Object.prototype));
			expect(protoAfter).toEqual(protoBefore);
			expect({}.polluted).toBeUndefined();

			// Expected behavior: dangerous key should NOT be in paramstore
			expect(Object.hasOwn(paramstore, '__proto__')).toBe(false);
		});

		it('Bug Condition: constructor as group should NOT modify Object.prototype', async () => {
			const mockGetByName = jest.fn().mockResolvedValue({
				Parameters: [
					{ Name: '/app/constructor/testKey', Value: 'exploitValue' }
				]
			});

			jest.spyOn(AWS, 'ssm', 'get').mockReturnValue({
				client: {},
				getByName: mockGetByName,
				getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
				sdk: {}
			});

			const parameters = [
				{ group: 'constructor', path: '/app/constructor/', names: ['testKey'] }
			];

			const paramstore = await AppConfig._getParametersFromStore(parameters);

			// Expected: constructor group should be skipped
			expect(Object.hasOwn(paramstore, 'constructor')).toBe(false);
		});

		it('Bug Condition: prototype as group should NOT modify Object.prototype', async () => {
			const mockGetByName = jest.fn().mockResolvedValue({
				Parameters: [
					{ Name: '/app/prototype/testKey', Value: 'exploitValue' }
				]
			});

			jest.spyOn(AWS, 'ssm', 'get').mockReturnValue({
				client: {},
				getByName: mockGetByName,
				getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
				sdk: {}
			});

			const parameters = [
				{ group: 'prototype', path: '/app/prototype/', names: ['testKey'] }
			];

			const paramstore = await AppConfig._getParametersFromStore(parameters);

			// Expected: prototype group should be skipped
			expect(Object.hasOwn(paramstore, 'prototype')).toBe(false);
		});

		it('Bug Condition: __proto__ as name should NOT modify Object.prototype', async () => {
			const mockGetByName = jest.fn().mockResolvedValue({
				Parameters: [
					{ Name: '/app/config/__proto__', Value: 'exploitValue' }
				]
			});

			jest.spyOn(AWS, 'ssm', 'get').mockReturnValue({
				client: {},
				getByName: mockGetByName,
				getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
				sdk: {}
			});

			const parameters = [
				{ group: 'config', path: '/app/config/', names: ['__proto__'] }
			];

			const paramstore = await AppConfig._getParametersFromStore(parameters);

			// Expected: __proto__ name should be skipped
			if (paramstore.config) {
				expect(Object.hasOwn(paramstore.config, '__proto__')).toBe(false);
			}
		});

		it('Bug Condition (PBT): for all dangerous keys as group, Object.prototype is unmodified', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.constantFrom(...DANGEROUS_KEYS),
					fc.stringMatching(/^[a-z]{1,8}$/),
					async (dangerousGroup, paramName) => {
						// Mock SSM
						const mockGetByName = jest.fn().mockResolvedValue({
							Parameters: [
								{ Name: `/app/${dangerousGroup}/${paramName}`, Value: 'exploit' }
							]
						});

						jest.spyOn(AWS, 'ssm', 'get').mockReturnValue({
							client: {},
							getByName: mockGetByName,
							getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
							sdk: {}
						});

						const parameters = [
							{ group: dangerousGroup, path: `/app/${dangerousGroup}/`, names: [paramName] }
						];

						const protoBefore = Object.keys(Object.getOwnPropertyDescriptors(Object.prototype));

						const paramstore = await AppConfig._getParametersFromStore(parameters);

						// Expected: Object.prototype unchanged
						const protoAfter = Object.keys(Object.getOwnPropertyDescriptors(Object.prototype));
						expect(protoAfter).toEqual(protoBefore);

						// Expected: dangerous group not in paramstore
						expect(Object.hasOwn(paramstore, dangerousGroup)).toBe(false);

						// Cleanup
						delete Object.prototype[paramName];
						jest.restoreAllMocks();
					}
				),
				{ numRuns: 9 } // 3 dangerous keys × 3 random names
			);
		});
	});
});
