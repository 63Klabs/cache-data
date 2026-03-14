/**
 * Property-based tests for Test Migration Phase 6 - Test Execution Validation
 * Feature: test-migration-phase-6
 * 
 * These tests validate that Jest test suites pass successfully after
 * the complete migration from Mocha to Jest and Mocha removal.
 * 
 * Validates: Requirements 6.1, 6.3, 6.5
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

/**
 * Parse test output to extract pass/fail counts
 * @param {string} output - Combined stdout+stderr output
 * @returns {{passed: number, failed: number, total: number}}
 */
function parseTestOutput(output) {
	let passed = 0;
	let failed = 0;
	let total = 0;

	// Jest writes summary to stderr; match with flexible whitespace
	const testMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
	if (testMatch) {
		passed = parseInt(testMatch[1]);
		total = parseInt(testMatch[2]);
		failed = total - passed;
	}

	return { passed, failed, total };
}

/**
 * Run Jest tests for a specific file and return results
 * @param {string} testFile - Path to test file
 * @returns {{passed: number, failed: number, total: number, success: boolean}}
 */
function runJestTests(testFile) {
	// >! Use direct jest invocation to avoid infinite loop
	// >! DO NOT use npm test as it would recursively run this test file
	const command = 'node';
	const args = ['--experimental-vm-modules', './node_modules/jest/bin/jest.js', testFile];

	// >! Use spawnSync to capture both stdout and stderr without shell interpretation
	// >! Arguments passed as array are not interpreted by shell
	const result = spawnSync(command, args, {
		cwd: projectRoot,
		encoding: 'utf8',
		timeout: 30000 // 30 second timeout per test file
	});

	// Combine stdout and stderr for parsing (Jest writes summary to stderr)
	const output = (result.stdout || '') + (result.stderr || '');
	const { passed, failed, total } = parseTestOutput(output);

	return {
		passed,
		failed,
		total,
		success: result.status === 0 && failed === 0
	};
}

describe('Test Migration Phase 6 - Test Execution Validation', () => {

	/**
	 * Property 2: Test Execution Validation
	 * For any module in scope, the Jest test suite should pass with zero failures.
	 * Mocha has been fully removed after migration completion.
	 * 
	 * Feature: test-migration-phase-6, Property 2
	 * Validates: Requirements 6.1, 6.3, 6.5
	 * 
	 * Note: This test is expensive as it runs full test suites. We limit to 3 runs.
	 */
	it('Property 2: Test Execution Validation - Jest tests produce passing results', async () => {
		const modules = [
			{ name: 'api-request', jest: 'test/endpoint/api-request-tests.jest.mjs' },
			{ name: 'endpoint-dao', jest: 'test/endpoint/endpoint-dao-tests.jest.mjs' },
			{ name: 'aws-classes', jest: 'test/tools/aws-classes-tests.jest.mjs' }
		];

		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(...modules),
				async (module) => {
					console.log(`\n  Testing ${module.name}...`);

					// Run Jest tests
					console.log(`    Running Jest tests for ${module.name}...`);
					const jestResults = runJestTests(module.jest);
					console.log(`    Jest: ${jestResults.passed} passed, ${jestResults.failed} failed, ${jestResults.total} total`);

					// Jest tests should succeed (no failures)
					expect(jestResults.success).toBe(true);

					// Verify Mocha test files no longer exist (removed in Phase 6)
					const mochaFile = module.jest.replace('.jest.mjs', '.mjs');
					const mochaPath = path.join(projectRoot, mochaFile);
					expect(fs.existsSync(mochaPath)).toBe(false);

					return true;
				}
			),
			{ numRuns: 3 } // Limit runs due to expensive test execution
		);
	}, 120000); // 2 minute timeout

});
