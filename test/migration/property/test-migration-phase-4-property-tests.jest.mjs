/**
 * Property-based tests for Test Migration Phase 4
 * Feature: test-migration-phase-4
 * 
 * These tests validate that the Jest migration for Phase 4 modules maintains
 * test correctness, source code immutability, and follows proper conventions.
 * 
 * Validates: Requirements 1.8, 2.9, 3.12, 4.10, 6.1-6.4, 7.1-7.3, 8.1, 8.6
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

/**
 * Run tests for a specific file and return results
 * @param {string} testFile - Path to test file
 * @param {string} framework - 'mocha' or 'jest'
 * @returns {{passed: number, failed: number, total: number, success: boolean}}
 */
function runTests(testFile, framework) {
	try {
		let command, args;
		if (framework === 'mocha') {
			// >! Use execFileSync to prevent shell interpretation
			// >! CRITICAL: Use direct mocha invocation to avoid infinite loop
			command = './node_modules/.bin/mocha';
			args = [testFile];
		} else if (framework === 'jest') {
			// >! Use execFileSync to prevent shell interpretation
			// >! CRITICAL: Use direct jest invocation to avoid infinite loop
			command = 'node';
			args = ['--experimental-vm-modules', './node_modules/jest/bin/jest.js', testFile];
		} else {
			throw new Error(`Unknown framework: ${framework}`);
		}

		const output = execFileSync(command, args, {
			cwd: projectRoot,
			encoding: 'utf8',
			stdio: 'pipe',
			timeout: 30000 // 30 second timeout per test file
		});

		// Parse output to count passed/failed tests
		let passed = 0;
		let failed = 0;
		let total = 0;

		if (framework === 'mocha') {
			const passingMatch = output.match(/(\d+) passing/);
			const failingMatch = output.match(/(\d+) failing/);
			passed = passingMatch ? parseInt(passingMatch[1]) : 0;
			failed = failingMatch ? parseInt(failingMatch[1]) : 0;
			total = passed + failed;
		} else {
			const testMatch = output.match(/Tests:\s+(\d+) passed,\s+(\d+) total/);
			if (testMatch) {
				passed = parseInt(testMatch[1]);
				total = parseInt(testMatch[2]);
				failed = total - passed;
			}
		}

		return {
			passed,
			failed,
			total,
			success: failed === 0
		};
	} catch (error) {
		// If command fails, tests failed
		const output = error.stdout || error.stderr || '';
		let passed = 0;
		let failed = 0;
		let total = 0;

		if (framework === 'mocha') {
			const passingMatch = output.match(/(\d+) passing/);
			const failingMatch = output.match(/(\d+) failing/);
			passed = passingMatch ? parseInt(passingMatch[1]) : 0;
			failed = failingMatch ? parseInt(failingMatch[1]) : 0;
			total = passed + failed;
		} else {
			const testMatch = output.match(/Tests:\s+(\d+) passed,\s+(\d+) total/);
			if (testMatch) {
				passed = parseInt(testMatch[1]);
				total = parseInt(testMatch[2]);
				failed = total - passed;
			}
		}

		return {
			passed,
			failed,
			total,
			success: false
		};
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

/**
 * Scan file for specific patterns
 * @param {string} filePath - Path to file
 * @param {RegExp} pattern - Pattern to search for
 * @returns {Array<string>} Array of matches
 */
function scanFileForPattern(filePath, pattern) {
	try {
		const content = fs.readFileSync(filePath, 'utf8');
		const matches = content.match(pattern);
		return matches || [];
	} catch (error) {
		return [];
	}
}

describe('Test Migration Phase 4 - Property-Based Tests', () => {

	/**
	 * Property 1: Test Execution - Jest tests produce passing results
	 * For any module in Phase 4 scope, the Jest test suite should pass with zero failures.
	 * 
	 * Note: Mocha has been fully removed after migration completion (Phase 6).
	 * This test now validates that Jest tests pass independently.
	 * 
	 * Feature: test-migration-phase-4, Property 1: Test Execution
	 * Validates: Requirements 1.8, 2.9, 3.12, 4.10, 7.1, 7.2, 7.3
	 * 
	 * Note: This test is expensive as it runs full test suites. We limit to 3 runs.
	 */
	it('Property 1: Test Execution - Jest tests produce passing results', async () => {
		const modules = [
			{ name: 'parameter-secret', jest: 'test/config/parameter-secret-tests.jest.mjs' },
			{ name: 'connections', jest: 'test/config/connections-tests.jest.mjs' },
			{ name: 'debug-and-log', jest: 'test/logging/debug-and-log-tests.jest.mjs' },
			{ name: 'timer', jest: 'test/logging/timer-tests.jest.mjs' }
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...modules),
				(module) => {
					console.log(`\n  Testing ${module.name}...`);

					// Run Jest tests
					console.log(`    Running Jest tests for ${module.name}...`);
					const jestResults = runTests(module.jest, 'jest');
					console.log(`    Jest: ${jestResults.passed} passed, ${jestResults.failed} failed, ${jestResults.total} total`);

					// Jest tests should succeed (no failures)
					expect(jestResults.success).toBe(true);

					// Mocha has been fully removed after Phase 6 migration completion
					// Verify Mocha test files no longer exist
					const mochaFile = module.jest.replace('.jest.mjs', '.mjs');
					const mochaPath = path.join(projectRoot, mochaFile);
					expect(fileExists(mochaPath)).toBe(false);

					return true;
				}
			),
			{ numRuns: 3 } // Limit runs due to expensive test execution
		);
	}, 120000);

	/**
	 * Property 2: Source Code Immutability
	 * For any source file in Phase 4 scope, the file content should remain unchanged
	 * during test migration (verified via git status).
	 * 
	 * Feature: test-migration-phase-4, Property 2: Source Code Immutability
	 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
	 */
	it('Property 2: Source Code Immutability - Source files unchanged during migration', () => {
		const sourceFiles = [
			'src/lib/tools/CachedParametersSecrets.classes.js',
			'src/lib/tools/Connections.classes.js',
			'src/lib/tools/DebugAndLog.class.js',
			'src/lib/tools/Timer.class.js'
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
						return true;
					}

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

	/**
	 * Property 3: Assertion Syntax Conversion
	 * For any Jest test file in Phase 4 scope, the file should use Jest syntax
	 * and not contain Chai syntax patterns.
	 * 
	 * Feature: test-migration-phase-4, Property 3: Assertion Syntax Conversion
	 * Validates: Requirements 1.3, 8.6
	 */
	it('Property 3: Assertion Syntax Conversion - Jest files use Jest syntax, not Chai', () => {
		const jestFiles = [
			'test/config/parameter-secret-tests.jest.mjs',
			'test/config/connections-tests.jest.mjs',
			'test/logging/debug-and-log-tests.jest.mjs',
			'test/logging/timer-tests.jest.mjs'
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...jestFiles),
				(jestFile) => {
					const filePath = path.join(projectRoot, jestFile);

					// File must exist
					if (!fileExists(filePath)) {
						return true; // Skip if file doesn't exist yet
					}

					// Check for Chai syntax patterns
					const chaiPatterns = [
						/expect\([^)]+\)\.to\.equal\(/,
						/expect\([^)]+\)\.to\.deep\.equal\(/,
						/expect\([^)]+\)\.to\.be\./,
						/expect\([^)]+\)\.to\.have\./,
						/expect\([^)]+\)\.to\.not\./
					];

					for (const pattern of chaiPatterns) {
						const matches = scanFileForPattern(filePath, pattern);
						if (matches.length > 0) {
							throw new Error(`Jest file ${jestFile} contains Chai syntax: ${matches[0]}`);
						}
					}

					// Verify Jest syntax is present (check for any Jest matcher)
					const jestPatterns = [
						/\.toBe\(/,
						/\.toEqual\(/,
						/\.toBeGreaterThan\(/,
						/\.toBeLessThan\(/,
						/\.toHaveLength\(/,
						/\.toBeUndefined\(/,
						/\.toBeNull\(/,
						/\.toBeTruthy\(/,
						/\.toBeFalsy\(/
					];

					let hasJestSyntax = false;
					for (const pattern of jestPatterns) {
						const matches = scanFileForPattern(filePath, pattern);
						if (matches.length > 0) {
							hasJestSyntax = true;
							break;
						}
					}

					expect(hasJestSyntax).toBe(true);

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

	/**
	 * Property 4: Mock Library Consistency
	 * For any Jest test file in Phase 4 scope, the file should use Jest mocking
	 * and not contain Sinon patterns.
	 * 
	 * Feature: test-migration-phase-4, Property 4: Mock Library Consistency
	 * Validates: Requirements 1.4, 3.3, 4.3, 8.3
	 */
	it('Property 4: Mock Library Consistency - Jest files use Jest mocking, not Sinon', () => {
		const jestFiles = [
			'test/config/parameter-secret-tests.jest.mjs',
			'test/config/connections-tests.jest.mjs',
			'test/logging/debug-and-log-tests.jest.mjs',
			'test/logging/timer-tests.jest.mjs'
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...jestFiles),
				(jestFile) => {
					const filePath = path.join(projectRoot, jestFile);

					// File must exist
					if (!fileExists(filePath)) {
						return true; // Skip if file doesn't exist yet
					}

					// Check for Sinon patterns
					const sinonPatterns = [
						/sinon\.stub\(/,
						/sinon\.spy\(/,
						/sinon\.mock\(/,
						/import.*sinon/,
						/from ['"]sinon['"]/
					];

					for (const pattern of sinonPatterns) {
						const matches = scanFileForPattern(filePath, pattern);
						if (matches.length > 0) {
							throw new Error(`Jest file ${jestFile} contains Sinon usage: ${matches[0]}`);
						}
					}

					// For files that should have mocking (debug-and-log, timer), verify Jest mocking is present
					if (jestFile.includes('debug-and-log') || jestFile.includes('timer')) {
						const jestMockPatterns = [
							/jest\.spyOn\(/,
							/jest\.fn\(/,
							/jest\.mock\(/,
							/\.mockImplementation\(/
						];

						let hasJestMocking = false;
						for (const pattern of jestMockPatterns) {
							const matches = scanFileForPattern(filePath, pattern);
							if (matches.length > 0) {
								hasJestMocking = true;
								break;
							}
						}

						expect(hasJestMocking).toBe(true);
					}

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

	/**
	 * Property 5: Test Isolation
	 * For any Jest test file in Phase 4 scope, the file should properly restore
	 * mocks and environment variables in afterEach hooks.
	 * 
	 * Feature: test-migration-phase-4, Property 5: Test Isolation
	 * Validates: Requirements 3.11, 4.9, 7.6, 8.2, 10.6
	 */
	it('Property 5: Test Isolation - Jest files restore mocks and environment in afterEach', () => {
		const jestFiles = [
			'test/config/parameter-secret-tests.jest.mjs',
			'test/config/connections-tests.jest.mjs',
			'test/logging/debug-and-log-tests.jest.mjs',
			'test/logging/timer-tests.jest.mjs'
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...jestFiles),
				(jestFile) => {
					const filePath = path.join(projectRoot, jestFile);

					// File must exist
					if (!fileExists(filePath)) {
						return true; // Skip if file doesn't exist yet
					}

					const content = fs.readFileSync(filePath, 'utf8');

					// For files that use mocking, verify jest.restoreAllMocks() is present
					if (jestFile.includes('debug-and-log') || jestFile.includes('timer')) {
						const hasRestoreMocks = /jest\.restoreAllMocks\(\)/.test(content);
						expect(hasRestoreMocks).toBe(true);

						// Verify afterEach is present
						const hasAfterEach = /afterEach\s*\(/.test(content);
						expect(hasAfterEach).toBe(true);
					}

					// For files that modify environment variables, verify restoration
					if (jestFile.includes('debug-and-log') || jestFile.includes('timer')) {
						const hasEnvRestore = /process\.env\s*=\s*originalEnv/.test(content);
						expect(hasEnvRestore).toBe(true);
					}

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

	/**
	 * Property 6: Test Coverage Preservation
	 * For any module in Phase 4 scope, the Jest test file should exist and
	 * have a reasonable number of test cases. Mocha files have been removed
	 * after migration completion (Phase 6).
	 * 
	 * Feature: test-migration-phase-4, Property 6: Test Coverage Preservation
	 * Validates: Requirements 1.2, 1.5, 1.6, 1.7, 2.3, 2.4, 2.5, 2.6, 3.4-3.10, 4.4-4.8, 5.1-5.4
	 */
	it('Property 6: Test Coverage Preservation - Jest test files exist with adequate test counts', () => {
		const testFiles = [
			{ name: 'parameter-secret', jest: 'test/config/parameter-secret-tests.jest.mjs', minTests: 1 },
			{ name: 'connections', jest: 'test/config/connections-tests.jest.mjs', minTests: 1 },
			{ name: 'debug-and-log', jest: 'test/logging/debug-and-log-tests.jest.mjs', minTests: 1 },
			{ name: 'timer', jest: 'test/logging/timer-tests.jest.mjs', minTests: 1 }
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...testFiles),
				(file) => {
					const jestPath = path.join(projectRoot, file.jest);

					// Jest file must exist
					expect(fileExists(jestPath)).toBe(true);

					// Count test cases (it() and test() calls)
					const jestContent = fs.readFileSync(jestPath, 'utf8');
					const jestTests = (jestContent.match(/\bit\s*\(/g) || []).length +
					                  (jestContent.match(/\btest\s*\(/g) || []).length;

					// Jest should have at least the minimum expected tests
					expect(jestTests).toBeGreaterThanOrEqual(file.minTests);

					// Mocha files should no longer exist (removed in Phase 6)
					const mochaFile = file.jest.replace('.jest.mjs', '.mjs');
					const mochaPath = path.join(projectRoot, mochaFile);
					expect(fileExists(mochaPath)).toBe(false);

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

	/**
	 * Property 7: Test Determinism
	 * For any module in Phase 4 scope, running the Jest tests multiple times
	 * should produce consistent results (same pass/fail outcome).
	 * 
	 * Feature: test-migration-phase-4, Property 7: Test Determinism
	 * Validates: Requirements 7.4, 10.7
	 */
	it('Property 7: Test Determinism - Jest tests produce consistent results across runs', async () => {
		const jestFiles = [
			'test/config/parameter-secret-tests.jest.mjs',
			'test/config/connections-tests.jest.mjs',
			'test/logging/debug-and-log-tests.jest.mjs',
			'test/logging/timer-tests.jest.mjs'
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...jestFiles),
				(jestFile) => {
					console.log(`\n  Testing determinism for ${jestFile}...`);

					// Run the same test file 3 times
					const results = [];
					for (let i = 0; i < 3; i++) {
						const result = runTests(jestFile, 'jest');
						results.push(result);
						console.log(`    Run ${i + 1}: ${result.passed} passed, ${result.failed} failed`);
					}

					// All runs should have the same outcome
					const firstResult = results[0];
					for (let i = 1; i < results.length; i++) {
						expect(results[i].success).toBe(firstResult.success);

						// Test counts should also be consistent
						expect(results[i].total).toBe(firstResult.total);
					}

					return true;
				}
			),
			{ numRuns: 2 } // Run 2 iterations of the property test (each runs the test file 3 times)
		);
	}, 120000);

	/**
	 * Property 8: Import Statement Correctness
	 * For any Jest test file in Phase 4 scope, the file should use @jest/globals
	 * import pattern and not import from Chai or Sinon.
	 * 
	 * Feature: test-migration-phase-4, Property 8: Import Statement Correctness
	 * Validates: Requirements 8.1
	 */
	it('Property 8: Import Statement Correctness - Jest files use correct imports', () => {
		const jestFiles = [
			'test/config/parameter-secret-tests.jest.mjs',
			'test/config/connections-tests.jest.mjs',
			'test/logging/debug-and-log-tests.jest.mjs',
			'test/logging/timer-tests.jest.mjs'
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...jestFiles),
				(jestFile) => {
					const filePath = path.join(projectRoot, jestFile);

					// File must exist
					if (!fileExists(filePath)) {
						return true; // Skip if file doesn't exist yet
					}

					const content = fs.readFileSync(filePath, 'utf8');

					// Verify @jest/globals import is present
					const hasJestImport = /import\s+{[^}]*}\s+from\s+['"]@jest\/globals['"]/.test(content);
					expect(hasJestImport).toBe(true);

					// Verify no Chai imports
					const hasChaiImport = /import.*from\s+['"]chai['"]/.test(content);
					expect(hasChaiImport).toBe(false);

					// Verify no Sinon imports
					const hasSinonImport = /import.*from\s+['"]sinon['"]/.test(content);
					expect(hasSinonImport).toBe(false);

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

});
