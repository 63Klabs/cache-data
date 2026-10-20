/**
 * Subprocess-isolated module-load test for supported Node.js runtimes.
 *
 * Verifies Property 6: on a supported Node major version (>= 22), requiring the
 * package entry point completes at module load with exit code 0, no hard-floor
 * exit, and no Node deprecation warning. After the v1.4.0 Node 20 removal the
 * hard floor is `nodeVerMajor < 22`, so Node major 20 (and 21) now hit the hard
 * floor and exit non-zero with the floor message BEFORE any deprecation-warning
 * path is reachable; the Node 20 deprecation warning is no longer emitted for
 * any running major (its registry entry is retained but inactive).
 *
 * `DebugAndLog.warn()` routes through `console.warn`, so a warning would be
 * written to the child's STDERR with a `[WARN] ` tag prefix and the verbatim
 * message text (format `[WARN] <message>`). The hard floor in
 * `src/lib/tools/vars.js` writes its message with `console.error` (also STDERR)
 * before calling `process.exit(1)`. Both are asserted against the child's
 * captured STDERR. `DEPRECATION_MESSAGE_NODE_20` is retained here only as a
 * NEGATIVE assertion: it must never appear for any running major.
 *
 * The child is spawned with `execFile(process.execPath, ['-e', script], ...)`
 * using ARRAY arguments and NO shell string, per the secure-coding steering
 * (no `exec`/`execSync` shell interpolation). An explicit `timeout` and
 * `maxBuffer` bound the child. This file spawns only a couple of short-lived
 * children and never invokes `npm test` or the full suite.
 *
 * Feature: 1-4-0-remove-node-20-support, Property 6: Supported versions (>= 22) neither exit nor warn
 * Validates: Requirements 2.4, 6.2, 6.5, 6.6
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

// Exact Requirement 3.2 (v1.3.17) deprecation warning text, retained here only
// as a negative assertion: after v1.4.0 it is never emitted for any running
// major (the Node 20 registry entry is inactive, and a Node 20 process hits the
// hard floor first).
const DEPRECATION_MESSAGE_NODE_20 =
	"Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later.";

// Stable fragment of the vars.js hard-floor message (Requirement 1.3 text).
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

describe('Property 6: Supported versions (>= 22) neither exit nor warn', () => {
	// Feature: 1-4-0-remove-node-20-support, Property 6: Supported versions (>= 22) neither exit nor warn
	// Validates: Requirements 2.4, 6.2, 6.5, 6.6

	it(
		'requires the package at module load and exits 0 on a supported runtime (>= 22)',
		async () => {
			const { code, stdout, stderr } = await loadPackageInChild();

			if (RUNNING_MAJOR >= 22) {
				// Supported floor (>= 22): module load must complete cleanly.
				expect(code).toBe(0);
				expect(stdout).toContain('MODULE_LOAD_OK');
			} else {
				// Below the hard floor (includes Node 20 and 21 after v1.4.0):
				// the process exits non-zero with the floor message on STDERR.
				expect(code).not.toBe(0);
				expect(stderr).toContain(FLOOR_MESSAGE_FRAGMENT);
			}
		},
		TEST_TIMEOUT_MS
	);

	it(
		'emits neither the floor message nor a deprecation warning on Node 22/24/26, and hits the floor (no deprecation warning) below 22',
		async () => {
			const { code, stdout, stderr } = await loadPackageInChild();

			if ([22, 24, 26].includes(RUNNING_MAJOR)) {
				// Supported, non-deprecated runtimes: no floor exit, no warning.
				expect(code).toBe(0);
				expect(stdout).toContain('MODULE_LOAD_OK');
				expect(stderr).not.toContain(DEPRECATION_MESSAGE_NODE_20);
				expect(stderr).not.toContain(FLOOR_MESSAGE_FRAGMENT);
			} else if (RUNNING_MAJOR >= 22) {
				// Other majors at or above the floor (e.g. 23, 25, 27+):
				// exit 0 with no deprecation warning under the updated registry.
				expect(code).toBe(0);
				expect(stderr).not.toContain(DEPRECATION_MESSAGE_NODE_20);
				expect(stderr).not.toContain(FLOOR_MESSAGE_FRAGMENT);
			} else {
				// Below the floor (includes Node 20 and 21 after v1.4.0): the
				// process hits the hard floor and exits non-zero with the floor
				// message. The Node 20 deprecation warning is NEVER emitted
				// (the warning path is unreachable below the floor, and the
				// registry entry is inactive) - assert it as a negative.
				expect(code).not.toBe(0);
				expect(stderr).toContain(FLOOR_MESSAGE_FRAGMENT);
				expect(stderr).not.toContain(DEPRECATION_MESSAGE_NODE_20);
			}
		},
		TEST_TIMEOUT_MS
	);
});
