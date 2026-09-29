/**
 * Subprocess-isolated module-load test for supported Node.js runtimes.
 *
 * Verifies Property 6: on a supported Node major version, requiring the package
 * entry point completes at module load with exit code 0, no hard-floor exit,
 * and no Node deprecation warning. The one exception handled here is Node major
 * 20, which is still supported (it runs, exit 0) but emits the exact Requirement
 * 3.2 deprecation warning via `DebugAndLog.warn()`.
 *
 * `DebugAndLog.warn()` routes through `console.warn`, so the warning is written
 * to the child's STDERR with a `[WARN] ` tag prefix and the verbatim message
 * text (format `[WARN] <message>`). The hard floor in `src/lib/tools/vars.js`
 * writes its message with `console.error` (also STDERR) before calling
 * `process.exit(1)`. Both are asserted against the child's captured STDERR.
 *
 * The child is spawned with `execFile(process.execPath, ['-e', script], ...)`
 * using ARRAY arguments and NO shell string, per the secure-coding steering
 * (no `exec`/`execSync` shell interpolation). An explicit `timeout` and
 * `maxBuffer` bound the child. This file spawns only a couple of short-lived
 * children and never invokes `npm test` or the full suite.
 *
 * Feature: 1-3-17-node-26-support, Property 6: Supported versions neither exit nor warn beyond the Node 20 case
 * Validates: Requirements 3.5, 5.5, 8.2
 *
 * @module test/config/integration/node-support-module-load-integration-tests
 */

import { describe, it, expect } from '@jest/globals';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');

// Absolute path to the package entry point the child will require.
const PACKAGE_ENTRY = resolve(PROJECT_ROOT, 'src/index.js');

// Running Node major version of the current (test) runtime.
const RUNNING_MAJOR = parseInt(process.versions.node.split('.')[0], 10);

// Exact Requirement 3.2 deprecation warning text emitted for Node major 20.
const DEPRECATION_MESSAGE_NODE_20 =
	"Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later.";

// Stable fragment of the vars.js hard-floor message (Requirement 5.2 text).
const FLOOR_MESSAGE_FRAGMENT = "or higher is required for @63klabs/cache-data";

// Bounds for the spawned child (test-execution-monitoring: explicit timeout).
const CHILD_TIMEOUT_MS = 30000;
const CHILD_MAX_BUFFER = 1024 * 1024; // 1MB
const TEST_TIMEOUT_MS = 60000;

/**
 * Spawn a child Node process that requires the package entry point and prints a
 * sentinel on success. Captures stdout, stderr, and the exit code.
 *
 * Uses `execFile` with array arguments (no shell), so nothing in the inline
 * script is interpreted by a shell. The entry path is embedded via
 * `JSON.stringify` and consumed by `require(...)` inside the child.
 *
 * @returns {Promise<{code: number, stdout: string, stderr: string}>} Child outcome
 * @example
 * const { code, stdout, stderr } = await loadPackageInChild();
 * expect(code).toBe(0);
 */
async function loadPackageInChild() {
	// >! Inline script passed as an array arg to execFile; no shell is spawned,
	// >! so the embedded path cannot be interpreted as shell metacharacters.
	const script = `require(${JSON.stringify(PACKAGE_ENTRY)}); console.log("MODULE_LOAD_OK");`;

	try {
		// >! Use execFile with array args (never exec/execSync + shell string).
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			['-e', script],
			{
				cwd: PROJECT_ROOT,
				encoding: 'utf8',
				timeout: CHILD_TIMEOUT_MS,
				maxBuffer: CHILD_MAX_BUFFER
			}
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		// On a non-zero exit, execFile rejects with the exit code and captured
		// streams attached to the error object.
		return {
			code: typeof error.code === 'number' ? error.code : 1,
			stdout: error.stdout ?? '',
			stderr: error.stderr ?? ''
		};
	}
}

describe('Property 6: Supported versions neither exit nor warn beyond the Node 20 case', () => {
	// Feature: 1-3-17-node-26-support, Property 6: Supported versions neither exit nor warn beyond the Node 20 case
	// Validates: Requirements 3.5, 5.5, 8.2

	it(
		'requires the package at module load and exits 0 on a supported runtime',
		async () => {
			const { code, stdout, stderr } = await loadPackageInChild();

			if (RUNNING_MAJOR >= 20) {
				// Supported floor (>= 20): module load must complete cleanly.
				expect(code).toBe(0);
				expect(stdout).toContain('MODULE_LOAD_OK');
			} else {
				// Below the hard floor: the process exits non-zero. The full
				// exit-code-1 / message wiring is covered by task 3.2; here we
				// only sanity-check that load did not succeed.
				expect(code).not.toBe(0);
				expect(stderr).toContain(FLOOR_MESSAGE_FRAGMENT);
			}
		},
		TEST_TIMEOUT_MS
	);

	it(
		'emits neither the floor message nor a deprecation warning on Node 22/24/26, and the exact Node 20 warning on Node 20',
		async () => {
			const { code, stdout, stderr } = await loadPackageInChild();

			if (RUNNING_MAJOR === 20) {
				// Node 20 is still supported (exit 0) but must emit the exact
				// Requirement 3.2 warning via DebugAndLog.warn() -> console.warn
				// (STDERR), and must NOT hit the hard floor.
				expect(code).toBe(0);
				expect(stdout).toContain('MODULE_LOAD_OK');
				expect(stderr).toContain(DEPRECATION_MESSAGE_NODE_20);
				expect(stderr).not.toContain(FLOOR_MESSAGE_FRAGMENT);
			} else if ([22, 24, 26].includes(RUNNING_MAJOR)) {
				// Supported, non-deprecated runtimes: no floor exit, no warning.
				expect(code).toBe(0);
				expect(stdout).toContain('MODULE_LOAD_OK');
				expect(stderr).not.toContain(DEPRECATION_MESSAGE_NODE_20);
				expect(stderr).not.toContain(FLOOR_MESSAGE_FRAGMENT);
			} else if (RUNNING_MAJOR > 20) {
				// Other majors at or above the floor (e.g. 21, 23, 25, 27+):
				// exit 0 with no deprecation warning under the initial registry.
				expect(code).toBe(0);
				expect(stderr).not.toContain(DEPRECATION_MESSAGE_NODE_20);
				expect(stderr).not.toContain(FLOOR_MESSAGE_FRAGMENT);
			} else {
				// Below the floor: not a supported runtime; warn-specific
				// assertions are skipped (covered by task 3.2).
				expect(code).not.toBe(0);
			}
		},
		TEST_TIMEOUT_MS
	);
});
