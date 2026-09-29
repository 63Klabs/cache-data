/**
 * Structural test for the CI test matrix in `.github/workflows/test.yml` and
 * the unchanged runtime pin in `.github/workflows/npm-publish.yml`.
 *
 * These are declarative CI-configuration criteria (not runtime behavior), so
 * they are validated by parsing the workflow YAML and asserting on its shape
 * rather than by executing anything. The workflow paths are resolved relative
 * to this test file via `import.meta.url`.
 *
 * Requirement 2.1: the test matrix includes '26' in addition to '20','22','24'.
 * Requirement 2.2: the '26' leg is continue-on-error (a Node 26 failure does
 *   not block the workflow); fail-fast is disabled so the other legs still run.
 * Requirement 2.3: the '20' leg is retained and is NOT continue-on-error.
 * Requirement 2.4: coverage stays gated on the '24' leg only (never on '26').
 * Requirement 2.5: `npm-publish.yml` still pins Node 24 and is not switched to
 *   a matrix or to Node 26.
 *
 * Feature: 1-3-17-node-26-support
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
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
	// Feature: 1-3-17-node-26-support
	// Validates: Requirements 2.1, 2.2, 2.3, 2.4

	let testYamlText;
	let testWorkflow;
	let testJob;

	beforeAll(() => {
		testYamlText = readFileSync(testWorkflowPath, 'utf-8');
		testWorkflow = yaml.load(testYamlText);
		testJob = testWorkflow.jobs.test;
		expect(testJob).toBeDefined();
	});

	describe('Requirement 2.1: matrix includes 26 alongside 20, 22, 24', () => {
		it('lists node-version 20, 22, 24, and 26', () => {
			const nodeVersions = testJob.strategy.matrix['node-version'].map(String);
			expect(nodeVersions).toEqual(expect.arrayContaining(['20', '22', '24', '26']));
		});

		it('includes 26 specifically', () => {
			const nodeVersions = testJob.strategy.matrix['node-version'].map(String);
			expect(nodeVersions).toContain('26');
		});
	});

	describe('Requirement 2.2: the 26 leg is continue-on-error and fail-fast is off', () => {
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
			// A bare `true` would let every leg (including 20/22/24) fail silently.
			expect(testJob['continue-on-error']).not.toBe(true);
		});
	});

	describe('Requirement 2.3: the 20 leg is retained and not continue-on-error', () => {
		it('keeps 20 in the matrix', () => {
			const nodeVersions = testJob.strategy.matrix['node-version'].map(String);
			expect(nodeVersions).toContain('20');
		});

		it('does not tie continue-on-error to the 20 leg', () => {
			const continueOnError = String(testJob['continue-on-error'] ?? '');
			expect(continueOnError).not.toMatch(/node-version\s*==\s*'20'/);
		});
	});

	describe('Requirement 2.4: coverage runs only on the 24 leg', () => {
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
	// Feature: 1-3-17-node-26-support
	// Validates: Requirement 2.5

	let publishWorkflow;
	let publishJob;

	beforeAll(() => {
		const publishYamlText = readFileSync(publishWorkflowPath, 'utf-8');
		publishWorkflow = yaml.load(publishYamlText);
		publishJob = publishWorkflow.jobs.publish;
		expect(publishJob).toBeDefined();
	});

	describe('Requirement 2.5: publish stays pinned to Node 24', () => {
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
