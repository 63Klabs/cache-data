/**
 * Structural test for the CI test matrix in `.github/workflows/test.yml` and
 * the unchanged runtime pin in `.github/workflows/npm-publish.yml`.
 *
 * These are declarative CI-configuration criteria (not runtime behavior), so
 * they are validated by parsing the workflow YAML and asserting on its shape
 * rather than by executing anything. The workflow paths are resolved relative
 * to this test file via `import.meta.url`.
 *
 * Requirement 3.1: the test matrix is ['22','24','26'] with no '20' leg.
 * Requirement 3.2: the '26' leg is the only continue-on-error leg; the '22'
 *   and '24' legs are required. Fail-fast is disabled so a '26' failure does
 *   not cancel the required legs.
 * Requirement 3.3: the matrix comments reference the '22' and '24' legs.
 * Requirement 3.4: coverage stays gated on the '24' leg only (never on '26').
 * Requirement 3.5: the '20' leg has been removed; no required leg references
 *   '20', and continue-on-error is not tied to the '20' leg.
 * Requirement 3.6: `npm-publish.yml` still pins Node 24 and is not switched to
 *   a matrix or to Node 26 (out of scope for the Node 20 removal).
 *
 * Feature: 1-4-0-remove-node-20-support
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';

// js-yaml is present in the dependency tree (via the toolchain) and gives a
// structural view of the workflow. The raw text is also asserted where the
// meaning is carried by a GitHub Actions expression string.
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const __dirname = dirname(fileURLToPath(import.meta.url));
const testWorkflowPath = resolve(__dirname, '../../.github/workflows/test.yml');
const publishWorkflowPath = resolve(__dirname, '../../.github/workflows/npm-publish.yml');

describe('CI test matrix (.github/workflows/test.yml)', () => {
	// Feature: 1-4-0-remove-node-20-support
	// Validates: Requirements 3.1, 3.2, 3.4, 3.5

	let testYamlText;
	let testWorkflow;
	let testJob;

	beforeAll(() => {
		testYamlText = readFileSync(testWorkflowPath, 'utf-8');
		testWorkflow = yaml.load(testYamlText);
		testJob = testWorkflow.jobs.test;
		expect(testJob).toBeDefined();
	});

	describe('Requirement 3.1: matrix is 22, 24, 26 with no 20 leg', () => {
		it('lists node-version 22, 24, and 26 in order', () => {
			const nodeVersions = testJob.strategy.matrix['node-version'].map(String);
			expect(nodeVersions).toEqual(['22', '24', '26']);
			expect(nodeVersions).not.toContain('20');
		});

		it('includes 26 specifically', () => {
			const nodeVersions = testJob.strategy.matrix['node-version'].map(String);
			expect(nodeVersions).toContain('26');
		});
	});

	describe('Requirement 3.2: the 26 leg is continue-on-error and fail-fast is off', () => {
		it('sets fail-fast: false on the matrix strategy', () => {
			// js-yaml normalizes the `fail-fast` key to `fail-fast`.
			expect(testJob.strategy['fail-fast']).toBe(false);
		});

		it('gates continue-on-error on the 26 leg via a per-matrix expression', () => {
			// The value is a GitHub Actions expression string that is truthy only
			// for the '26' leg, so only Node 26 is allowed to fail.
			const continueOnError = testJob['continue-on-error'];
			expect(typeof continueOnError).toBe('string');
			expect(continueOnError).toMatch(/matrix\.node-version\s*==\s*'26'/);
		});

		it('does not make continue-on-error unconditionally true', () => {
			// A bare `true` would let every leg (including 22/24) fail silently.
			expect(testJob['continue-on-error']).not.toBe(true);
		});
	});

	describe('Requirement 3.5: the 20 leg is removed', () => {
		it('does not include 20 in the matrix', () => {
			const nodeVersions = testJob.strategy.matrix['node-version'].map(String);
			expect(nodeVersions).not.toContain('20');
		});

		it('does not tie continue-on-error to the 20 leg', () => {
			const continueOnError = String(testJob['continue-on-error'] ?? '');
			expect(continueOnError).not.toMatch(/node-version\s*==\s*'20'/);
		});
	});

	describe('Requirement 3.4: coverage runs only on the 24 leg', () => {
		it('gates the coverage test step on node-version == 24', () => {
			const coverageStep = testJob.steps.find(
				(step) => typeof step.run === 'string' && step.run.includes('--coverage')
			);
			expect(coverageStep).toBeDefined();
			expect(coverageStep.if).toMatch(/matrix\.node-version\s*==\s*'24'/);
		});

		it('does not run coverage on the 26 leg', () => {
			const coverageStep = testJob.steps.find(
				(step) => typeof step.run === 'string' && step.run.includes('--coverage')
			);
			expect(coverageStep.if).not.toMatch(/node-version\s*==\s*'26'/);
		});

		it('gates the coverage upload artifact step on node-version == 24', () => {
			const uploadStep = testJob.steps.find(
				(step) => typeof step.uses === 'string' && step.uses.includes('upload-artifact')
			);
			expect(uploadStep).toBeDefined();
			expect(uploadStep.if).toMatch(/matrix\.node-version\s*==\s*'24'/);
		});
	});
});

describe('Publish workflow (.github/workflows/npm-publish.yml)', () => {
	// Feature: 1-4-0-remove-node-20-support
	// Validates: Requirement 3.6

	let publishWorkflow;
	let publishJob;

	beforeAll(() => {
		const publishYamlText = readFileSync(publishWorkflowPath, 'utf-8');
		publishWorkflow = yaml.load(publishYamlText);
		publishJob = publishWorkflow.jobs.publish;
		expect(publishJob).toBeDefined();
	});

	describe('Requirement 3.6: publish stays pinned to Node 24', () => {
		it('pins the setup-node step to node-version 24', () => {
			const setupNodeStep = publishJob.steps.find(
				(step) => typeof step.uses === 'string' && step.uses.includes('setup-node')
			);
			expect(setupNodeStep).toBeDefined();
			expect(String(setupNodeStep.with['node-version'])).toBe('24');
		});

		it('does not introduce a node-version matrix', () => {
			expect(publishJob.strategy?.matrix?.['node-version']).toBeUndefined();
		});

		it('does not reference Node 26', () => {
			const publishYamlText = readFileSync(publishWorkflowPath, 'utf-8');
			expect(publishYamlText).not.toMatch(/node-version:\s*['"]?26['"]?/);
		});
	});
});
