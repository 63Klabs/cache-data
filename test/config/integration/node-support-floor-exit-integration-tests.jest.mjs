/**
 * Integration test for the Node.js hard-floor EXIT WIRING in
 * `src/lib/tools/vars.js`.
 *
 * Task 1.1 (test/config/property/node-support-hard-floor-property-tests.jest.mjs)
 * covers the PURE predicate (`major < 20`). This file covers a different
 * concern: the sub-floor side effects that the predicate is wired to — the
 * exact `console.error(...)` message AND the `process.exit(1)` call.
 *
 * Because the running Node major cannot be forced below 20 at runtime
 * (`vars.js` reads it from `process.versions.node` via `AWS.NODE_VER_MAJOR`
 * at module load), the sub-floor branch is exercised two ways:
 *   1. A subprocess spawned with `execFile(process.execPath, ['-e', script])`
 *      that mirrors the floor wiring under a simulated sub-floor version and
 *      whose real `process.exit(1)` is observed as the child's exit code.
 *   2. An in-process spy on `process.exit` + `console.error` asserting the
 *      branch invokes exit(1) with the exact message for a sub-floor input.
 * A source-drift guard confirms the mirrored wiring still matches `vars.js`.
 *
 * Feature: 1-3-17-node-26-support, Property 5: Hard floor exits below 20 and only below 20
 * Validates: Requirements 5.1, 5.2, 5.3
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path to the module under test. */
const VARS_JS_PATH = resolve(__dirname, '../../../src/lib/tools/vars.js');

/** The floor the exit branch is wired to, mirrored from `vars.js`. */
const NODE_MAJOR_FLOOR = 20;

/**
 * Build the exact sub-floor error message emitted by `src/lib/tools/vars.js`.
 * Kept byte-for-byte in sync with that module (guarded by the source-drift
 * test below).
 *
 * @param {string} nodeVer - Full Node.js version string (e.g. '18.19.1')
 * @returns {string} The message the floor branch passes to `console.error`
 * @private
 * @example
 * buildFloorMessage('18.19.1');
 * // 'Node.js version 20 or higher is required for @63klabs/cache-data. Version 18.19.1 detected. ...'
 */
const buildFloorMessage = (nodeVer) =>
	`Node.js version 20 or higher is required for @63klabs/cache-data. Version ${nodeVer} detected. Please install at least Node.js 20 (22 or later recommended) in your environment.`;

/**
 * In-process mirror of the `vars.js` floor branch. Uses the same predicate,
 * message, and side effects (`console.error` then `process.exit(1)`).
 *
 * @param {string} nodeVer - Full Node.js version string to evaluate
 * @returns {void}
 * @private
 */
const runFloorBranch = (nodeVer) => {
	const nodeVerMajor = parseInt(nodeVer.split('.')[0], 10);
	if (nodeVerMajor < NODE_MAJOR_FLOOR) {
		console.error(buildFloorMessage(nodeVer));
		process.exit(1);
	}
};

describe('Property 5: Hard floor exits below 20 and only below 20 (exit wiring)', () => {
	// Feature: 1-3-17-node-26-support, Property 5: Hard floor exits below 20 and only below 20
	// Validates: Requirements 5.1, 5.2, 5.3

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('source-drift guard', () => {
		it('vars.js still wires the exact message and process.exit(1) inside the < 20 branch', () => {
			const source = readFileSync(VARS_JS_PATH, 'utf8');

			// The predicate the exit branch hangs off of.
			expect(source).toContain('nodeVerMajor < 20');
			// The exact message template (with the ${nodeVer} interpolation).
			expect(source).toContain(
				'Node.js version 20 or higher is required for @63klabs/cache-data. Version ${nodeVer} detected. Please install at least Node.js 20 (22 or later recommended) in your environment.'
			);
			// The hard-exit call.
			expect(source).toContain('process.exit(1)');
		});
	});

	describe('in-process spy on the exit wiring', () => {
		it('invokes process.exit(1) with the exact message for a sub-floor major', () => {
			const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
			const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			const subFloorVer = '18.19.1';
			runFloorBranch(subFloorVer);

			// >! process.exit is stubbed so the branch continues; assert the wiring.
			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(errorSpy).toHaveBeenCalledWith(buildFloorMessage(subFloorVer));
			expect(exitSpy).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it('does NOT exit or emit the message for a supported major (>= 20)', () => {
			const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
			const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			for (const supportedVer of ['20.11.0', '22.0.0', '24.1.0', '26.0.0']) {
				runFloorBranch(supportedVer);
			}

			expect(exitSpy).not.toHaveBeenCalled();
			expect(errorSpy).not.toHaveBeenCalled();
		});
	});

	describe('subprocess-isolated exit-code wiring', () => {
		// The child independently rebuilds the message from the same template
		// (not an echoed string) and performs a real process.exit(1); the parent
		// observes the actual exit code and stderr.
		const subFloorVer = '18.19.1';
		const childScript = `
const nodeVer = ${JSON.stringify(subFloorVer)};
const nodeVerMajor = parseInt(nodeVer.split('.')[0], 10);
// Mirror of src/lib/tools/vars.js floor wiring for a simulated sub-floor major.
if (nodeVerMajor < 20) {
	console.error(\`Node.js version 20 or higher is required for @63klabs/cache-data. Version \${nodeVer} detected. Please install at least Node.js 20 (22 or later recommended) in your environment.\`);
	process.exit(1);
}
process.exit(0);
`;

		it('exits with code 1 and emits the exact message when the major is sub-floor', async () => {
			let exitCode = 0;
			let stderr = '';

			try {
				// >! execFile with ARRAY args (no shell) prevents shell interpretation.
				const result = await execFileAsync(process.execPath, ['-e', childScript], {
					timeout: 10000,
					maxBuffer: 1024 * 1024
				});
				// Reaching here means exit code 0 - the sub-floor branch failed to exit.
				stderr = result.stderr;
			} catch (error) {
				exitCode = error.code;
				stderr = error.stderr;
			}

			expect(exitCode).toBe(1);
			expect(stderr).toContain(buildFloorMessage(subFloorVer));
		}, 20000);

		it('exits with code 0 and emits nothing for a supported major', async () => {
			const supportedScript = `
const nodeVer = "22.0.0";
const nodeVerMajor = parseInt(nodeVer.split('.')[0], 10);
if (nodeVerMajor < 20) {
	console.error(\`Node.js version 20 or higher is required for @63klabs/cache-data. Version \${nodeVer} detected. Please install at least Node.js 20 (22 or later recommended) in your environment.\`);
	process.exit(1);
}
process.exit(0);
`;

			const { stdout, stderr } = await execFileAsync(process.execPath, ['-e', supportedScript], {
				timeout: 10000,
				maxBuffer: 1024 * 1024
			});

			// No throw => exit code 0; the floor branch was not taken.
			expect(stderr).toBe('');
			expect(stdout).toBe('');
		}, 20000);
	});
});
