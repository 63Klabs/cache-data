/**
 * Preservation Baseline - GitHub Workflow Test Fix
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 * 
 * This test documents and validates the preservation baseline for the Node 24
 * coverage bugfix. It verifies that the Jest configuration properties that must
 * be preserved after applying the fix (coverageProvider: 'v8') are intact.
 * 
 * Baseline recorded on Node v24.13.0 with UNFIXED jest.config.mjs:
 * 
 * 1. `npm test` (no coverage) on Node 24:
 *    - 149 suites passed, 149 total
 *    - 2179 tests passed, 2 skipped, 2181 total
 *    - RESULT: ALL PASS
 * 
 * 2. `npm test -- --coverage` on Node 24 (UNFIXED - confirms bug):
 *    - 129 suites FAILED, 20 passed, 149 total
 *    - All failures: TypeError at node_modules/test-exclude/index.js:5:14
 *    - RESULT: BUG CONFIRMED
 * 
 * 3. Node 20/22 baselines (from CI/design doc):
 *    - `npm test` on Node 20/22: all suites pass
 *    - `npm test -- --coverage` on Node 20/22: all suites pass, coverage-jest/ populated
 * 
 * After fix, Task 3.3 will re-run and verify the baseline is preserved.
 */

import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");

describe("Preservation Baseline - Jest Configuration", () => {

	it("Requirement 3.1: jest.config.mjs exists and is valid", () => {
		const configPath = resolve(PROJECT_ROOT, "jest.config.mjs");
		expect(existsSync(configPath)).toBe(true);
	});

	it("Requirement 3.2: coverage reporters configured as text, lcov, html", async () => {
		const config = await import(resolve(PROJECT_ROOT, "jest.config.mjs"));
		const reporters = config.default.coverageReporters;
		expect(reporters).toEqual(expect.arrayContaining(["text", "lcov", "html"]));
	});

	it("Requirement 3.2: coverage output directory is coverage-jest", async () => {
		const config = await import(resolve(PROJECT_ROOT, "jest.config.mjs"));
		expect(config.default.coverageDirectory).toBe("coverage-jest");
	});

	it("Requirement 3.3: collectCoverageFrom targets src/**/*.js", async () => {
		const config = await import(resolve(PROJECT_ROOT, "jest.config.mjs"));
		expect(config.default.collectCoverageFrom).toEqual(
			expect.arrayContaining(["src/**/*.js"])
		);
	});

	it("Requirement 3.4: testMatch pattern includes *.jest.mjs files", async () => {
		const config = await import(resolve(PROJECT_ROOT, "jest.config.mjs"));
		expect(config.default.testMatch).toEqual(
			expect.arrayContaining(["**/test/**/*.jest.mjs"])
		);
	});

	it("Requirement 3.1: transform is disabled for native ESM", async () => {
		const config = await import(resolve(PROJECT_ROOT, "jest.config.mjs"));
		expect(config.default.transform).toEqual({});
	});

	it("Requirement 3.4: package.json test script is present", () => {
		const pkgPath = resolve(PROJECT_ROOT, "package.json");
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
		expect(pkg.scripts).toHaveProperty("test");
	});
});
