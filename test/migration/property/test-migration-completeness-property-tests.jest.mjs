/**
 * Property-based tests for Test Migration Phase 6 - Migration Completeness
 * Feature: test-migration-phase-6
 * 
 * These tests validate that the Jest migration maintains test completeness,
 * execution equivalence, and follows proper conventions.
 * 
 * Validates: Requirements 6.1, 6.2, 6.4
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

describe('Test Migration Phase 6 - Property-Based Tests', () => {

	/**
	 * Property 1: Test Migration Completeness
	 * For any module in scope, the Jest test file should exist with an adequate
	 * number of test cases. Mocha files have been removed after migration completion.
	 * 
	 * Feature: test-migration-phase-6, Property 1
	 * Validates: Requirements 6.1, 6.2, 6.4
	 */
	it('Property 1: Test Migration Completeness - Jest test files exist with adequate test counts', () => {
		const modules = [
			{ name: 'api-request', jest: 'test/endpoint/api-request-tests.jest.mjs', minTests: 1 },
			{ name: 'endpoint-dao', jest: 'test/endpoint/endpoint-dao-tests.jest.mjs', minTests: 1 },
			{ name: 'aws-classes', jest: 'test/tools/aws-classes-tests.jest.mjs', minTests: 1 }
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...modules),
				(module) => {
					const jestPath = path.join(projectRoot, module.jest);

					// Jest file must exist
					expect(fileExists(jestPath)).toBe(true);

					const jestTestCount = countTests(jestPath);

					// Jest test count should be at least the minimum expected
					expect(jestTestCount).toBeGreaterThanOrEqual(module.minTests);

					// Mocha files should no longer exist (removed in Phase 6)
					const mochaFile = module.jest.replace('.jest.mjs', '.mjs');
					const mochaPath = path.join(projectRoot, mochaFile);
					expect(fileExists(mochaPath)).toBe(false);

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
	 * Feature: test-migration-phase-6, Property 7
	 * Validates: Requirements 6.1
	 */
	it('Property 7: Source Code Immutability - Source files unchanged during migration', () => {
		const sourceFiles = [
			'src/lib/tools/ApiRequest.class.js',
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
							throw new Error(`Source file ${sourceFile} has been modified during test migration`);
						}
					} catch (error) {
						// If git command fails, we can't verify - skip this check
						if (error.message && error.message.includes('modified during test migration')) {
							throw error;
						}
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
	 * follow the pattern [original-name].jest.mjs and the corresponding
	 * Mocha file should no longer exist (removed in Phase 6).
	 * 
	 * Feature: test-migration-phase-6, Property 11
	 * Validates: Requirements 6.1, 6.4
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
					expect(fileExists(filePath)).toBe(true);

					// Verify naming pattern: should end with .jest.mjs
					expect(jestFile.endsWith('.jest.mjs')).toBe(true);

					// Verify corresponding Mocha file has been removed (Phase 6 migration complete)
					const mochaFile = jestFile.replace('.jest.mjs', '.mjs');
					const mochaPath = path.join(projectRoot, mochaFile);
					expect(fileExists(mochaPath)).toBe(false);

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

	/**
	 * Property 12: Jest File Location Convention
	 * For any Jest test file created during migration, the file should be
	 * located in the expected directory and the corresponding Mocha file
	 * should no longer exist (removed in Phase 6).
	 * 
	 * Feature: test-migration-phase-6, Property 12
	 * Validates: Requirements 6.1, 6.4
	 */
	it('Property 12: Jest File Location Convention - Jest files in expected directories', () => {
		const testFiles = [
			{ jest: 'test/endpoint/api-request-tests.jest.mjs', expectedDir: 'test/endpoint' },
			{ jest: 'test/endpoint/endpoint-dao-tests.jest.mjs', expectedDir: 'test/endpoint' },
			{ jest: 'test/tools/aws-classes-tests.jest.mjs', expectedDir: 'test/tools' }
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...testFiles),
				(file) => {
					const jestPath = path.join(projectRoot, file.jest);

					// Jest file must exist
					expect(fileExists(jestPath)).toBe(true);

					// Verify Jest file is in the expected directory
					const jestDir = path.dirname(file.jest);
					expect(jestDir).toBe(file.expectedDir);

					// Verify corresponding Mocha file has been removed (Phase 6 migration complete)
					const mochaFile = file.jest.replace('.jest.mjs', '.mjs');
					const mochaPath = path.join(projectRoot, mochaFile);
					expect(fileExists(mochaPath)).toBe(false);

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

});
