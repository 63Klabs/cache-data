/**
 * Child-process runner for the AWS lazy-accessor tests.
 *
 * Runs one scenario of test/tools/fixtures/aws-classes-child.cjs in a fresh
 * Node.js process and returns its exit status, output, and parsed `RESULT:` line.
 * A fresh process is the only way to observe module-load behavior, because Jest
 * and Node both cache modules after the first load.
 *
 * The child environment starts from process.env with both X-Ray variables
 * removed and AWS_REGION set to us-east-1, so results don't depend on the
 * developer's shell. Tests then override what they need.
 *
 * Spec: .kiro/specs/1-4-0-convert-aws-to-lazy-accessors (design.md, "Child-process runner")
 *
 * @module test/helpers/aws-classes-child-runner
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The package map is CommonJS so the child can require it; load it the way the
// repository's other ESM tests load CommonJS.
const requireCjs = createRequire(import.meta.url);

const HELPERS_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Repository root; the child runs with this as its working directory. */
export const PROJECT_ROOT = path.resolve(HELPERS_DIR, "..", "..");

/** The child-process scenario script. */
export const CHILD_SCRIPT = path.join(PROJECT_ROOT, "test", "tools", "fixtures", "aws-classes-child.cjs");

/** Shared AWS config fixture whose [default] profile sets region = eu-west-3. */
export const SHARED_CONFIG_FIXTURE = path.join(PROJECT_ROOT, "test", "tools", "fixtures", "aws-config-eu-west-3.ini");

/** A credentials file path that never exists, so a developer's ~/.aws files can't interfere. */
export const MISSING_CREDENTIALS_FILE = path.join(PROJECT_ROOT, "test", "tools", "fixtures", "aws-credentials-does-not-exist");

/** Accessor name to the service-client packages it loads. */
export const { SERVICE_PACKAGES } = requireCjs("../tools/fixtures/service-packages.cjs");

/** Environment variables that enable X-Ray in AWS.classes.js. */
export const X_RAY_ENV_VARS = Object.freeze(["CacheData_AWSXRayOn", "CACHE_DATA_AWS_X_RAY_ON"]);

/** Default timeout for one child process, in milliseconds. */
export const DEFAULT_CHILD_TIMEOUT_MS = 20000;

const RESULT_MARKER = "RESULT:";

/**
 * Build the environment for a child process.
 *
 * Starts from process.env, removes both X-Ray variables, sets AWS_REGION to
 * us-east-1, then applies the overrides. An override of `undefined` deletes the key.
 *
 * @param {Object.<string, string|undefined>} [overrides={}] - Variables to set or, with undefined, delete
 * @returns {Object.<string, string>} Environment for the child
 * @example
 * // A child with no AWS_REGION and X-Ray enabled
 * const env = buildChildEnv({ AWS_REGION: undefined, CACHE_DATA_AWS_X_RAY_ON: "true" });
 */
export function buildChildEnv(overrides = {}) {
	const env = { ...process.env };
	for (const name of X_RAY_ENV_VARS) {
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
 * @param {string} stdout - Child stdout
 * @returns {Object|null} The parsed result, or null when there is no RESULT line
 * @throws {SyntaxError} When the RESULT line doesn't hold valid JSON
 * @example
 * parseResult('noise\nRESULT:{"ok":true}\n'); // { ok: true }
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
 * Run one child scenario in a fresh Node.js process.
 *
 * A non-zero exit is returned, not thrown, so tests can assert on it. stderr is
 * only captured for a non-zero exit; on success it is an empty string.
 *
 * @param {string} scenario - Scenario name understood by aws-classes-child.cjs
 * @param {Object} [args={}] - Scenario arguments, sent to the child as one JSON argument
 * @param {Object} [options={}] - Run options
 * @param {Object.<string, string|undefined>} [options.env={}] - Environment overrides for buildChildEnv()
 * @param {number} [options.timeout=20000] - Child timeout in milliseconds
 * @returns {{status: number, stdout: string, stderr: string, result: Object|null}} Exit status, output, and parsed result
 * @throws {Error} When the child times out or can't be spawned
 * @example
 * const { status, result } = runChild("load-sequence", { reads: ["s3"] });
 * expect(status).toBe(0);
 * expect(result.afterReads).toEqual(["@aws-sdk/client-s3"]);
 */
export function runChild(scenario, args = {}, { env = {}, timeout = DEFAULT_CHILD_TIMEOUT_MS } = {}) {
	const options = {
		cwd: PROJECT_ROOT,
		env: buildChildEnv(env),
		encoding: "utf8",
		timeout,
		maxBuffer: 10 * 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"]
	};

	try {
		// >! Use execFileSync with an argument array: no shell is spawned, so the
		// >! scenario name and JSON arguments are passed literally and never interpreted
		const stdout = execFileSync(process.execPath, [CHILD_SCRIPT, scenario, JSON.stringify(args)], options);
		return { status: 0, stdout, stderr: "", result: parseResult(stdout) };
	} catch (error) {
		// A timeout or spawn failure has no numeric status; those are test infrastructure errors
		if (typeof error?.status !== "number") {
			throw error;
		}
		const stdout = String(error.stdout ?? "");
		return { status: error.status, stdout, stderr: String(error.stderr ?? ""), result: parseResult(stdout) };
	}
}
