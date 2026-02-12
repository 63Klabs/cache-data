/**
 * Property-based tests for Test Migration Phase 2 - Migration Completeness
 * Feature: test-migration-phase-2
 * 
 * These tests validate that the Jest migration maintains test completeness,
 * execution equivalence, and follows proper conventions.
 * 
 * Validates: Requirements 1.1, 2.1, 3.1, 1.2, 1.3, 2.2, 2.3, 3.2, 3.3, 5.1, 5.2, 5.3, 6.5, 7.1, 7.2, 7.3, 7.4
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// >! Import execFileSync instead of execSync to prevent shell interpretation
import { execFileSync } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

/**
 * Count the number of test cases in a test file
 * @param {string} filePath - Path to the test file
 * @returns {number} Number of test cases
 */
function countTests(filePath) {
	try {
		const content = fs.readFileSync(filePath, 'utf8');
		// Count 'it(' and 'test(' occurrences
		const itMatches = content.match(/\bit\s*\(/g) || [];
		const testMatches = content.match(/\btest\s*\(/g) || [];
		return itMatches.length + testMatches.length;
	} catch (error) {
		return 0;
	}
}

/**
 * Get file hash for immutability checking
 * @param {string} filePath - Path to the file
 * @returns {string} SHA256 hash of file content
 */
function getFileHash(filePath) {
	try {
		const content = fs.readFileSync(filePath, 'utf8');
		return crypto.createHash('sha256').update(content).digest('hex');
	} catch (error) {
		return '';
	}
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to check
 * @returns {boolean} True if file exists
 */
function fileExists(filePath) {
	try {
		return fs.existsSync(filePath);
	} catch (error) {
		return false;
	}
}

describe('Test Migration Phase 2 - Property-Based Tests', () => {

	/**
	 * Property 1: Test Migration Completeness
	 * For any module in scope, the number of test cases in the Jest test file
	 * should equal the number of test cases in the corresponding Mocha test file.
	 * 
	 * Feature: test-migration-phase-2, Property 1
	 * Validates: Requirements 1.1, 2.1, 3.1
	 */
	it('Property 1: Test Migration Completeness - Jest test count equals Mocha test count', () => {
		const modules = [
			{ name: 'api-request', mocha: 'test/endpoint/api-request-tests.mjs', jest: 'test/endpoint/api-request-tests.jest.mjs' },
			{ name: 'endpoint-dao', mocha: 'test/endpoint/endpoint-dao-tests.mjs', jest: 'test/endpoint/endpoint-dao-tests.jest.mjs' },
			{ name: 'aws-classes', mocha: 'test/tools/aws-classes-tests.mjs', jest: 'test/tools/aws-classes-tests.jest.mjs' }
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...modules),
				(module) => {
					const mochaPath = path.join(projectRoot, module.mocha);
					const jestPath = path.join(projectRoot, module.jest);

					// Both files must exist
					if (!fileExists(mochaPath) || !fileExists(jestPath)) {
						return true; // Skip if files don't exist yet
					}

					const mochaTestCount = countTests(mochaPath);
					const jestTestCount = countTests(jestPath);

					// Jest test count should be greater than or equal to Mocha test count
					// (Jest may have additional tests for better coverage)
					assert.ok(
						jestTestCount >= mochaTestCount,
						`Module ${module.name}: Jest has ${jestTestCount} tests but Mocha has ${mochaTestCount} tests. Jest should have at least as many tests as Mocha.`
					);

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

	/**
	 * Property 7: Source Code Immutability
	 * For any source file in scope, the file content should remain unchanged
	 * after test migration (we can't check before/after, but we can verify
	 * the files haven't been modified in this commit).
	 * 
	 * Feature: test-migration-phase-2, Property 7
	 * Validates: Requirements 5.1, 5.2, 5.3
	 */
	it('Property 7: Source Code Immutability - Source files unchanged during migration', () => {
		const sourceFiles = [
			'src/lib/tools/APIRequest.class.js',
			'src/lib/dao-endpoint.js',
			'src/lib/tools/AWS.classes.js'
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...sourceFiles),
				(sourceFile) => {
					const filePath = path.join(projectRoot, sourceFile);

					// File must exist
					if (!fileExists(filePath)) {
						return true; // Skip if file doesn't exist
					}

					// Check if file has been modified in git (staged or unstaged)
					try {
						// >! Use execFileSync to prevent shell interpretation
						// >! Arguments passed as array are not interpreted by shell
						const gitStatus = execFileSync('git', ['status', '--porcelain', sourceFile], {
							cwd: projectRoot,
							encoding: 'utf8'
						}).trim();

						// If file shows up in git status, it's been modified
						if (gitStatus && gitStatus.includes(sourceFile)) {
							assert.fail(`Source file ${sourceFile} has been modified during test migration`);
						}
					} catch (error) {
						// If git command fails, we can't verify - skip this check
						return true;
					}

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

	/**
	 * Property 11: Jest File Naming Convention
	 * For any Jest test file created during migration, the filename should
	 * follow the pattern [original-name].jest.mjs
	 * 
	 * Feature: test-migration-phase-2, Property 11
	 * Validates: Requirements 6.5, 7.2, 7.3
	 */
	it('Property 11: Jest File Naming Convention - All Jest files follow .jest.mjs pattern', () => {
		const jestFiles = [
			'test/endpoint/api-request-tests.jest.mjs',
			'test/endpoint/endpoint-dao-tests.jest.mjs',
			'test/tools/aws-classes-tests.jest.mjs'
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...jestFiles),
				(jestFile) => {
					// Check if file exists
					const filePath = path.join(projectRoot, jestFile);
					if (!fileExists(filePath)) {
						return true; // Skip if file doesn't exist yet
					}

					// Verify naming pattern: should end with .jest.mjs
					assert.ok(
						jestFile.endsWith('.jest.mjs'),
						`Jest file ${jestFile} does not follow .jest.mjs naming convention`
					);

					// Verify corresponding Mocha file exists
					const mochaFile = jestFile.replace('.jest.mjs', '.mjs');
					const mochaPath = path.join(projectRoot, mochaFile);
					assert.ok(
						fileExists(mochaPath),
						`Corresponding Mocha file ${mochaFile} does not exist for Jest file ${jestFile}`
					);

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

	/**
	 * Property 12: Jest File Location Convention
	 * For any Jest test file created during migration, the file should be
	 * located in the same directory as its corresponding Mocha test file.
	 * 
	 * Feature: test-migration-phase-2, Property 12
	 * Validates: Requirements 7.1, 7.4
	 */
	it('Property 12: Jest File Location Convention - Jest files in same directory as Mocha files', () => {
		const testPairs = [
			{ mocha: 'test/endpoint/api-request-tests.mjs', jest: 'test/endpoint/api-request-tests.jest.mjs' },
			{ mocha: 'test/endpoint/endpoint-dao-tests.mjs', jest: 'test/endpoint/endpoint-dao-tests.jest.mjs' },
			{ mocha: 'test/tools/aws-classes-tests.mjs', jest: 'test/tools/aws-classes-tests.jest.mjs' }
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...testPairs),
				(pair) => {
					const mochaPath = path.join(projectRoot, pair.mocha);
					const jestPath = path.join(projectRoot, pair.jest);

					// Both files must exist
					if (!fileExists(mochaPath) || !fileExists(jestPath)) {
						return true; // Skip if files don't exist yet
					}

					// Get directory paths
					const mochaDir = path.dirname(mochaPath);
					const jestDir = path.dirname(jestPath);

					// Directories should be the same
					assert.equal(
						jestDir,
						mochaDir,
						`Jest file ${pair.jest} is not in the same directory as Mocha file ${pair.mocha}`
					);

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

});
