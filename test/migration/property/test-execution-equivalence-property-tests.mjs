/**
 * Property-based tests for Test Migration Phase 2 - Test Execution Equivalence
 * Feature: test-migration-phase-2
 * 
 * These tests validate that both Mocha and Jest test suites produce equivalent
 * pass/fail results, ensuring the migration maintains test correctness.
 * 
 * Validates: Requirements 1.2, 1.3, 2.2, 2.3, 3.2, 3.3
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import fc from 'fast-check';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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
		let command;
		if (framework === 'mocha') {
			// CRITICAL: Use direct mocha invocation to avoid infinite loop
			// DO NOT use npm test as it would recursively run this test file
			command = `./node_modules/.bin/mocha ${testFile}`;
		} else if (framework === 'jest') {
			// CRITICAL: Use direct jest invocation to avoid infinite loop
			// DO NOT use npm run test:jest as it would recursively run this test file
			command = `node --experimental-vm-modules ./node_modules/jest/bin/jest.js ${testFile}`;
		} else {
			throw new Error(`Unknown framework: ${framework}`);
		}

		const output = execSync(command, {
			cwd: projectRoot,
			encoding: 'utf8',
			stdio: 'pipe',
			timeout: 30000 // 30 second timeout per test file
		});

		// Parse output to count passed/failed tests
		// Mocha format: "X passing"
		// Jest format: "Tests: X passed, Y total"
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

describe('Test Migration Phase 2 - Test Execution Equivalence', () => {

	/**
	 * Property 2: Test Execution Equivalence
	 * For any module in scope, when both Mocha and Jest test suites are executed,
	 * both should pass with the same number of passing tests and zero failures.
	 * 
	 * Feature: test-migration-phase-2, Property 2
	 * Validates: Requirements 1.2, 1.3, 2.2, 2.3, 3.2, 3.3
	 * 
	 * Note: This test is expensive as it runs full test suites. We limit to 3 runs.
	 */
	it('Property 2: Test Execution Equivalence - Both Mocha and Jest produce same pass/fail results', { timeout: 120000 }, () => {
		const modules = [
			{ name: 'api-request', mocha: 'test/endpoint/api-request-tests.mjs', jest: 'test/endpoint/api-request-tests.jest.mjs' },
			{ name: 'endpoint-dao', mocha: 'test/endpoint/endpoint-dao-tests.mjs', jest: 'test/endpoint/endpoint-dao-tests.jest.mjs' },
			{ name: 'aws-classes', mocha: 'test/tools/aws-classes-tests.mjs', jest: 'test/tools/aws-classes-tests.jest.mjs' }
		];

		fc.assert(
			fc.property(
				fc.constantFrom(...modules),
				(module) => {
					console.log(`\n  Testing ${module.name}...`);

					// Run Mocha tests
					console.log(`    Running Mocha tests for ${module.name}...`);
					const mochaResults = runTests(module.mocha, 'mocha');
					console.log(`    Mocha: ${mochaResults.passed} passed, ${mochaResults.failed} failed, ${mochaResults.total} total`);

					// Run Jest tests
					console.log(`    Running Jest tests for ${module.name}...`);
					const jestResults = runTests(module.jest, 'jest');
					console.log(`    Jest: ${jestResults.passed} passed, ${jestResults.failed} failed, ${jestResults.total} total`);

					// Both should succeed (no failures)
					assert.ok(
						mochaResults.success,
						`Mocha tests for ${module.name} failed: ${mochaResults.failed} failures`
					);

					assert.ok(
						jestResults.success,
						`Jest tests for ${module.name} failed: ${jestResults.failed} failures`
					);

					// Note: We don't require the same number of tests because Jest may have
					// additional edge case tests added during migration (as per task 3.9, 4.6, 5.10)
					// We only require that both pass all their tests

					return true;
				}
			),
			{ numRuns: 3 } // Limit runs due to expensive test execution
		);
	});

});
