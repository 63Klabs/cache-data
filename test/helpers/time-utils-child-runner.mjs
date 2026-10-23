/**
 * Child-process runner for the TimeUtils lifecycle and Cache.init() tests.
 *
 * Runs one scenario of test/cache/time-utils/fixtures/time-utils-child.cjs in a
 * fresh Node.js process and returns its exit status, output, and parsed `RESULT:`
 * line. TimeUtils and Cache initialize once per module instance and expose no
 * reset, so behavior that depends on the initialized state or on
 * CACHE_DATA_TIME_ZONE_FOR_INTERVAL is only observable in a fresh process
 * (Requirement 11.6).
 *
 * The child environment starts from process.env with CLEARED_ENV_VARS removed and
 * AWS_REGION set to us-east-1, so results don't depend on the developer's shell.
 * Tests then override what they need. Every other variable passes through, so a
 * test asserting a field another variable can set, such as `info.idHashAlgorithm`
 * from CACHE_DATA_ID_HASH_ALGORITHM, should override that variable as well.
 *
 * The child runs through execFileSync with an argument array and a timeout of at
 * most 120 seconds, never through a shell or `npm test` (Requirement 11.9).
 *
 * Not a test file: the name ends in `.mjs` rather than `.jest.mjs`, so Jest's
 * `testMatch` doesn't collect it as a suite.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (design.md, "Child runner and child script")
 *
 * @module test/helpers/time-utils-child-runner
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HELPERS_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Repository root; the child runs with this as its working directory. */
export const PROJECT_ROOT = path.resolve(HELPERS_DIR, "..", "..");

/** The child-process scenario script. */
export const CHILD_SCRIPT = path.join(PROJECT_ROOT, "test", "cache", "time-utils", "fixtures", "time-utils-child.cjs");

/**
 * Variables removed from every child's environment before the overrides apply: the
 * timezone env var, and CACHE_USE_IN_MEMORY and CACHE_IN_MEMORY_ONLY, which turn on
 * the in-memory modes of Cache.init().
 */
export const CLEARED_ENV_VARS = Object.freeze([
	"CACHE_DATA_TIME_ZONE_FOR_INTERVAL",
	"CACHE_USE_IN_MEMORY",
	"CACHE_IN_MEMORY_ONLY"
]);

/** Default timeout for one child process, in milliseconds. */
export const DEFAULT_CHILD_TIMEOUT_MS = 20000;

/** Longest timeout a caller can set, in milliseconds (Requirement 11.9). */
const MAX_CHILD_TIMEOUT_MS = 120000;

/** Most bytes accepted on the child's stdout or stderr. */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

const RESULT_MARKER = "RESULT:";

/**
 * Build the environment for a child process.
 *
 * Starts from process.env, removes CLEARED_ENV_VARS, sets AWS_REGION to us-east-1,
 * then applies the overrides. An override of `undefined` deletes the key; any other
 * value is converted with String(), as assigning to process.env does. Overrides
 * apply last, so they can set a cleared variable or remove AWS_REGION.
 *
 * @param {Object.<string, (string|undefined)>} [overrides={}] - Variables to set or, with undefined, delete
 * @returns {Object.<string, string>} Environment for the child
 * @example
 * // A child that reads its timezone from the env var and has no AWS_REGION
 * const env = buildChildEnv({ CACHE_DATA_TIME_ZONE_FOR_INTERVAL: "America/Chicago", AWS_REGION: undefined });
 */
export function buildChildEnv(overrides = {}) {
	const env = { ...process.env };
	for (const name of CLEARED_ENV_VARS) {
		delete env[name];
	}
	env.AWS_REGION = "us-east-1";
	for (const [name, value] of Object.entries(overrides)) {
		if (value === undefined) {
			delete env[name];
		} else {
			env[name] = String(value);
		}
	}
	return env;
}

/**
 * Parse the JSON after the last `RESULT:` line of a child's stdout.
 *
 * time-utils-child.cjs prints exactly one `RESULT:` line for every outcome, as its
 * only write to stdout. If more than one line starts with the marker, the last one
 * is used, as design.md specifies. Lines that don't start with the marker, such as
 * log output from the module under test, are ignored.
 *
 * @param {string} stdout - Child stdout
 * @returns {Object|null} The parsed result, or null when no line starts with `RESULT:`
 * @throws {SyntaxError} When the last RESULT line doesn't hold valid JSON
 * @example
 * parseResult('noise\nRESULT:{"scenario":"cache-init"}\n'); // { scenario: "cache-init" }
 * parseResult("no result line\n"); // null
 */
export function parseResult(stdout) {
	const lines = String(stdout ?? "").split(/\r?\n/);
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		if (lines[index].startsWith(RESULT_MARKER)) {
			return JSON.parse(lines[index].slice(RESULT_MARKER.length));
		}
	}
	return null;
}

/**
 * Run one time-utils-child.cjs scenario in a fresh Node.js process.
 *
 * The child runs with PROJECT_ROOT as its working directory and the environment from
 * buildChildEnv(env). A non-zero exit is returned, not thrown, so tests can assert on
 * it: the child exits 1 when a scenario throws unexpectedly and 2 for an invalid
 * invocation, and prints its RESULT line either way. stderr is captured only for a
 * non-zero exit; on a zero exit execFileSync returns stdout alone, so stderr is an
 * empty string.
 *
 * A failure with no numeric exit status, or with a system error code, is rethrown:
 * a timeout, output beyond the buffer limit, a kill by a signal, or a failed spawn.
 * Those are test infrastructure errors with possibly incomplete output, not scenario
 * outcomes.
 *
 * @param {string} scenario - Scenario name understood by time-utils-child.cjs, "time-utils-init" or "cache-init". Any other name is passed through, and the child reports it as an invalid invocation
 * @param {Object} [args={}] - Scenario arguments, sent to the child as one JSON argument
 * @param {Object} [options={}] - Run options
 * @param {Object.<string, (string|undefined)>} [options.env={}] - Environment overrides for buildChildEnv(). undefined deletes a key
 * @param {number} [options.timeout=20000] - Child timeout in milliseconds, an integer from 1 to 120000
 * @returns {{status: number, stdout: string, stderr: string, result: Object|null}} Exit status, output, and parsed result. result is null when the child printed no RESULT line
 * @throws {RangeError} When timeout isn't an integer from 1 to 120000
 * @throws {Error} When the child times out, exceeds the output buffer, is killed by a signal, or can't be spawned
 * @throws {SyntaxError} When the child's RESULT line doesn't hold valid JSON
 * @example
 * import { runTimeUtilsChild } from "../../../helpers/time-utils-child-runner.mjs";
 *
 * // The env var supplies the timezone when the option is absent
 * const { status, result } = runTimeUtilsChild(
 *   "time-utils-init",
 *   { calls: [{ options: {} }] },
 *   { env: { CACHE_DATA_TIME_ZONE_FOR_INTERVAL: "America/Chicago" } }
 * );
 * expect(status).toBe(0);
 * expect(result.timeZone).toBe("America/Chicago");
 *
 * @example
 * // A non-zero exit is returned with the child's RESULT line and stderr
 * const { status, stderr, result } = runTimeUtilsChild("no-such-scenario");
 * expect(status).toBe(2);
 * expect(result.error.message).toMatch(/^Unknown scenario "no-such-scenario"/);
 * expect(stderr).toContain("time-utils-child:");
 */
export function runTimeUtilsChild(scenario, args = {}, { env = {}, timeout = DEFAULT_CHILD_TIMEOUT_MS } = {}) {
	// execFileSync blocks the event loop, so Jest's test timeout can't interrupt a hung
	// child. This timeout is the only bound on it, and Node.js treats 0 as no timeout
	if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_CHILD_TIMEOUT_MS) {
		throw new RangeError(`timeout must be an integer from 1 to ${MAX_CHILD_TIMEOUT_MS} milliseconds, got ${String(timeout)}`);
	}

	const options = {
		cwd: PROJECT_ROOT,
		env: buildChildEnv(env),
		encoding: "utf8",
		timeout,
		maxBuffer: MAX_BUFFER_BYTES,
		// An explicit stdio keeps the child's stderr out of the test output
		stdio: ["ignore", "pipe", "pipe"]
	};

	let stdout;
	try {
		// >! execFileSync with an argument array spawns no shell. The scenario name and the
		// >! JSON arguments reach the child as literal argv entries, so quotes, $(), ;, |,
		// >! and backticks in them are never interpreted as shell syntax
		stdout = execFileSync(process.execPath, [CHILD_SCRIPT, scenario, JSON.stringify(args)], options);
	} catch (error) {
		// No numeric status means the child was killed or never started. A system error
		// code (ETIMEDOUT, ENOBUFS, ENOENT, ...) means the run was cut short even if an
		// exit status was recorded. Either way the output may be incomplete
		if (typeof error?.status !== "number" || typeof error?.code === "string") {
			throw error;
		}
		const failedStdout = String(error.stdout ?? "");
		return { status: error.status, stdout: failedStdout, stderr: String(error.stderr ?? ""), result: parseResult(failedStdout) };
	}
	return { status: 0, stdout, stderr: "", result: parseResult(stdout) };
}
