/**
 * Structural test reconciling the minimum supported Node.js version across
 * `package.json` `engines.node` and the `README.md` "Requirements" section.
 *
 * This test reads both files as data/text and asserts on their structure; it
 * imports nothing from the package, so it does not depend on or alter the
 * package export surface.
 *
 * Requirement 6.1: `package.json` `engines.node` SHALL be `">=22.0.0"`.
 * Requirement 6.2: the `README.md` "Requirements" section SHALL state a single
 *   consistent minimum Node.js version matching `engines.node`, with no
 *   residual `>=20.0.0`.
 *
 * Feature: 1-3-17-node-26-support
 * Validates: Requirements 6.1, 6.2
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// The single reconciled minimum, matching `engines.node`.
const EXPECTED_ENGINES_NODE = ">=22.0.0";

describe('Node support: engines.node and README minimum reconciliation', () => {
	// Feature: 1-3-17-node-26-support
	// Validates: Requirements 6.1, 6.2

	const __dirname = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(__dirname, '../..');
	const packageJsonPath = resolve(repoRoot, 'package.json');
	const readmePath = resolve(repoRoot, 'README.md');

	let packageJson;
	let readmeContent;
	let requirementsSection;

	beforeAll(() => {
		packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
		readmeContent = readFileSync(readmePath, 'utf-8');

		// Extract the "### Requirements" section: from its heading up to (but not
		// including) the next heading at the same-or-higher level (### or ##).
		const match = readmeContent.match(/###\s+Requirements\s*\n([\s\S]*?)(?=\n#{2,3}\s+|$)/);
		expect(match).not.toBeNull();
		requirementsSection = match[1];
	});

	describe('Requirement 6.1: package.json engines.node', () => {
		it('sets engines.node to exactly ">=22.0.0"', () => {
			expect(packageJson.engines).toBeDefined();
			expect(packageJson.engines.node).toBe(EXPECTED_ENGINES_NODE);
		});

		it('does not retain the prior ">=20.0.0" minimum', () => {
			expect(packageJson.engines.node).not.toContain('20.0.0');
		});
	});

	describe('Requirement 6.2: README Requirements section is reconciled', () => {
		it('states the minimum Node.js version matching engines.node', () => {
			expect(requirementsSection).toContain(EXPECTED_ENGINES_NODE);
		});

		it('does not state a residual >=20.0.0 minimum in the Requirements section', () => {
			expect(requirementsSection).not.toMatch(/>=?\s*20\.0\.0/);
		});

		it('states a single, consistent Node.js minimum in the Requirements section', () => {
			// Every Node version minimum expressed as >=NN.0.0 in the section must
			// be the reconciled 22.0.0 value; there must be exactly one distinct
			// minimum, and it must match engines.node.
			const minimums = [...requirementsSection.matchAll(/>=?\s*(\d+)\.0\.0/g)]
				.map((m) => m[1]);
			expect(minimums.length).toBeGreaterThan(0);
			const distinct = [...new Set(minimums)];
			expect(distinct).toEqual(['22']);
		});

		it('reconciles the whole README with no residual >=20.0.0 anywhere', () => {
			// The prior inconsistency spanned two statements (Requirements section
			// and the Getting Started steps); neither should reference 20.0.0.
			expect(readmeContent).not.toMatch(/>=?\s*20\.0\.0/);
		});

		it('keeps the README minimum consistent with package.json engines.node', () => {
			const engineMajor = packageJson.engines.node.match(/(\d+)\.0\.0/)[1];
			const readmeMinimums = [...readmeContent.matchAll(/>=?\s*(\d+)\.0\.0/g)]
				.map((m) => m[1]);
			for (const major of readmeMinimums) {
				expect(major).toBe(engineMajor);
			}
		});
	});
});
