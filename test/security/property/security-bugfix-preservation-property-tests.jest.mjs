/**
 * Security Bugfix Preservation Property Tests
 * 
 * Property 3: Preservation — JSDoc Parsing Unchanged for Normal Inputs
 * Property 4: Preservation — SSM Parameter Storage Unchanged for Normal Keys
 * 
 * These tests verify that existing behavior is unchanged for normal (non-buggy) inputs.
 * They MUST PASS on the current UNFIXED code, confirming baseline behavior to preserve.
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import parseParamTag from test helper (ESM export)
import { parseParamTag as helperParseParamTag } from '../../helpers/jsdoc-parser.mjs';

// Import parseParamTag from audit-documentation.mjs (not exported, extract via eval)
const auditScriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'audit-documentation.mjs');
const auditScriptContent = fs.readFileSync(auditScriptPath, 'utf-8');
const parseParamTagMatch = auditScriptContent.match(/function parseParamTag\(line\) \{[\s\S]*?\n\}/);
if (!parseParamTagMatch) {
	throw new Error('Could not find parseParamTag function in audit script');
}
const auditParseParamTag = eval(`(${parseParamTagMatch[0]})`);

// Import tools module for Issue 2 (SSM parameter storage)
const tools = await import('../../../src/lib/tools/index.js');
const { AppConfig, AWS, DebugAndLog } = tools.default;

const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

// =========================================================================
// Generators for JSDoc preservation tests
// =========================================================================

// Generate safe type names (no special chars that break parsing)
const safeTypeName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/);

// Generate safe param names (alphanumeric, starting with letter)
const safeParamName = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/);

// Generate safe default values (no ] characters — preservation condition)
const safeDefaultValue = fc.stringMatching(/^[a-zA-Z0-9_.-]{1,10}$/);

// Generate safe description text (no special chars)
const safeDescription = fc.stringMatching(/^[a-zA-Z0-9 ]{1,20}$/);

// Generate safe group/name strings for SSM (exclude dangerous keys)
const safeGroupOrName = fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/).filter(
	s => !DANGEROUS_KEYS.includes(s)
);

// Generate a safe SSM parameter value
const safeParamValue = fc.stringMatching(/^[a-zA-Z0-9_.-]{1,20}$/);


describe('Security Bugfix Preservation Property Tests', () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	// =========================================================================
	// Property 3: JSDoc Parsing Preservation
	// Preservation: For all jsdocLine where countBrackets(extractDefault(jsdocLine), ']') <= 1,
	// parseParamTag output is unchanged
	// =========================================================================

	describe('Property 3: JSDoc Parsing Unchanged for Normal Inputs', () => {

		describe('test/helpers/jsdoc-parser.mjs and scripts/audit-documentation.mjs', () => {

			/**
			 * **Validates: Requirements 3.2**
			 * 
			 * Preservation: For all @param tags with no default value (simple params),
			 * parseParamTag returns null for defaultValue and correct name/type/optional.
			 */
			it('Preservation (PBT): simple @param without default returns null defaultValue', () => {
				fc.assert(
					fc.property(
						safeTypeName,
						safeParamName,
						(typeName, paramName) => {
							const line = `@param {${typeName}} ${paramName}`;
							const helperResult = helperParseParamTag(line);
							const auditResult = auditParseParamTag(line);

							expect(helperResult).not.toBeNull();
							expect(auditResult).not.toBeNull();

							// No default value
							expect(helperResult.defaultValue).toBeNull();
							expect(auditResult.defaultValue).toBeNull();

							// Correct fields
							expect(helperResult.name).toBe(paramName);
							expect(helperResult.type).toBe(typeName);
							expect(helperResult.optional).toBe(false);

							expect(auditResult.name).toBe(paramName);
							expect(auditResult.type).toBe(typeName);
							expect(auditResult.optional).toBe(false);
						}
					),
					{ numRuns: 100 }
				);
			});

			/**
			 * **Validates: Requirements 3.1, 3.2**
			 * 
			 * Preservation: For all @param tags with optional marker [name] (no default),
			 * parseParamTag returns optional=true and defaultValue=null.
			 */
			it('Preservation (PBT): optional @param [name] without default returns null defaultValue', () => {
				fc.assert(
					fc.property(
						safeTypeName,
						safeParamName,
						(typeName, paramName) => {
							const line = `@param {${typeName}} [${paramName}]`;
							const helperResult = helperParseParamTag(line);
							const auditResult = auditParseParamTag(line);

							expect(helperResult).not.toBeNull();
							expect(auditResult).not.toBeNull();

							// Optional with no default
							expect(helperResult.optional).toBe(true);
							expect(helperResult.defaultValue).toBeNull();
							expect(helperResult.name).toBe(paramName);
							expect(helperResult.type).toBe(typeName);

							expect(auditResult.optional).toBe(true);
							expect(auditResult.defaultValue).toBeNull();
							expect(auditResult.name).toBe(paramName);
							expect(auditResult.type).toBe(typeName);
						}
					),
					{ numRuns: 100 }
				);
			});

			/**
			 * **Validates: Requirements 3.1, 3.2**
			 * 
			 * Preservation: For @param tags with description, the description is captured.
			 * Note: The regex trims leading/trailing whitespace from descriptions.
			 */
			it('Preservation (PBT): @param with description captures description correctly', () => {
				// Use descriptions without leading/trailing whitespace to match regex behavior
				const trimmedDescription = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,18}[a-zA-Z0-9]$/);
				fc.assert(
					fc.property(
						safeTypeName,
						safeParamName,
						trimmedDescription,
						(typeName, paramName, desc) => {
							const line = `@param {${typeName}} ${paramName} - ${desc}`;
							const helperResult = helperParseParamTag(line);
							const auditResult = auditParseParamTag(line);

							expect(helperResult).not.toBeNull();
							expect(auditResult).not.toBeNull();

							// Description should be captured (regex captures after `- `)
							expect(helperResult.description).toBe(desc);
							expect(auditResult.description).toBe(desc);

							// Other fields correct
							expect(helperResult.name).toBe(paramName);
							expect(helperResult.type).toBe(typeName);
							expect(helperResult.optional).toBe(false);
							expect(helperResult.defaultValue).toBeNull();

							expect(auditResult.name).toBe(paramName);
							expect(auditResult.type).toBe(typeName);
							expect(auditResult.optional).toBe(false);
							expect(auditResult.defaultValue).toBeNull();
						}
					),
					{ numRuns: 100 }
				);
			});

			/**
			 * **Validates: Requirements 3.1, 3.3**
			 * 
			 * Preservation: Both parsers produce identical output for all normal inputs.
			 * This ensures the fix doesn't diverge behavior between the two implementations.
			 */
			it('Preservation (PBT): helper and audit parsers produce identical results for normal inputs', () => {
				fc.assert(
					fc.property(
						safeTypeName,
						safeParamName,
						fc.constantFrom('simple', 'optional', 'withDesc'),
						safeDescription,
						(typeName, paramName, variant, desc) => {
							let line;
							if (variant === 'simple') {
								line = `@param {${typeName}} ${paramName}`;
							} else if (variant === 'optional') {
								line = `@param {${typeName}} [${paramName}]`;
							} else {
								line = `@param {${typeName}} ${paramName} - ${desc}`;
							}

							const helperResult = helperParseParamTag(line);
							const auditResult = auditParseParamTag(line);

							expect(helperResult).not.toBeNull();
							expect(auditResult).not.toBeNull();

							// Both parsers should produce identical results
							expect(helperResult.name).toBe(auditResult.name);
							expect(helperResult.type).toBe(auditResult.type);
							expect(helperResult.optional).toBe(auditResult.optional);
							expect(helperResult.defaultValue).toBe(auditResult.defaultValue);
						}
					),
					{ numRuns: 100 }
				);
			});
		});
	});


	// =========================================================================
	// Property 4: SSM Parameter Storage Preservation
	// Preservation: For all ssmParam where group NOT IN DANGEROUS_KEYS
	// AND name NOT IN DANGEROUS_KEYS, paramstore stores correctly
	// =========================================================================

	describe('Property 4: SSM Parameter Storage Unchanged for Normal Keys', () => {

		afterEach(() => {
			jest.restoreAllMocks();
		});

		/**
		 * **Validates: Requirements 3.4, 3.6**
		 * 
		 * Preservation: For all SSM parameters where neither group nor name is
		 * in DANGEROUS_KEYS, paramstore[group][name] stores the value correctly.
		 */
		it('Preservation (PBT): safe group/name parameters are stored correctly', async () => {
			await fc.assert(
				fc.asyncProperty(
					safeGroupOrName,
					safeGroupOrName,
					safeParamValue,
					async (group, name, value) => {
						const mockGetByName = jest.fn().mockResolvedValue({
							Parameters: [
								{ Name: `/app/${group}/${name}`, Value: value }
							]
						});

						jest.spyOn(AWS, 'ssm', 'get').mockReturnValue({
							client: {},
							getByName: mockGetByName,
							getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
							sdk: {}
						});

						const parameters = [
							{ group: group, path: `/app/${group}/`, names: [name] }
						];

						const paramstore = await AppConfig._getParametersFromStore(parameters);

						// Parameter should be stored correctly
						expect(paramstore).toHaveProperty(group);
						expect(paramstore[group]).toHaveProperty(name);
						expect(paramstore[group][name]).toBe(value);

						jest.restoreAllMocks();
					}
				),
				{ numRuns: 50 }
			);
		});

		/**
		 * **Validates: Requirements 3.5**
		 * 
		 * Preservation: Empty parameter arrays return empty paramstore object.
		 */
		it('Preservation: empty parameter arrays return empty paramstore', async () => {
			const paramstore = await AppConfig._getParametersFromStore([]);
			expect(paramstore).toEqual({});
		});

		/**
		 * **Validates: Requirements 3.4, 3.6**
		 * 
		 * Preservation: Multi-group parameters are organized into their respective groups.
		 */
		it('Preservation (PBT): multi-group parameters are organized correctly', async () => {
			await fc.assert(
				fc.asyncProperty(
					safeGroupOrName,
					safeGroupOrName,
					safeGroupOrName,
					safeGroupOrName,
					safeParamValue,
					safeParamValue,
					async (group1, group2, name1, name2, value1, value2) => {
						// Ensure groups are different for a meaningful multi-group test
						fc.pre(group1 !== group2);

						const mockGetByName = jest.fn().mockResolvedValue({
							Parameters: [
								{ Name: `/app/${group1}/${name1}`, Value: value1 },
								{ Name: `/app/${group2}/${name2}`, Value: value2 }
							]
						});

						jest.spyOn(AWS, 'ssm', 'get').mockReturnValue({
							client: {},
							getByName: mockGetByName,
							getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
							sdk: {}
						});

						const parameters = [
							{ group: group1, path: `/app/${group1}/`, names: [name1] },
							{ group: group2, path: `/app/${group2}/`, names: [name2] }
						];

						const paramstore = await AppConfig._getParametersFromStore(parameters);

						// Both groups should exist with correct values
						expect(paramstore).toHaveProperty(group1);
						expect(paramstore).toHaveProperty(group2);
						expect(paramstore[group1][name1]).toBe(value1);
						expect(paramstore[group2][name2]).toBe(value2);

						jest.restoreAllMocks();
					}
				),
				{ numRuns: 50 }
			);
		});
	});
});
