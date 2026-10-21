"use strict";

/**
 * Timed child process for the lazy-accessor cold-start benchmark.
 *
 * Requires a package entry, reads the listed accessors through `tools.AWS`, and
 * prints one line, `RESULT:{"ms":<elapsed>}`, measuring only the work inside this
 * process (Node.js startup is excluded). Spawned once per measurement by
 * lazy-accessor-coldstart.mjs, so every run starts with an empty module cache.
 *
 * Spec: .kiro/specs/1-4-0-convert-aws-to-lazy-accessors (Requirement 10)
 *
 * Usage:
 *   node child-timer.cjs <absolute-entry-path> '<json-array-of-accessor-names>'
 *
 * @example
 * // Time loading the package and reading AWS.ssm
 * // node child-timer.cjs /path/to/repo/src/index.js '["ssm"]'
 * // RESULT:{"ms":187.42}
 */

const path = require("node:path");

const ALLOWED_ACCESSORS = ["dynamo", "s3", "ssm", "secrets"];

/**
 * Parse and validate the command-line arguments.
 *
 * @param {Array<string>} argv - process.argv
 * @returns {{entryPath: string, reads: Array<string>}} Validated arguments
 * @throws {Error} When the entry path is not absolute or a read name is not allowed
 */
function parseArgs(argv) {
	const entryPath = argv[2];
	// >! Accept only an absolute path so the require target never depends on
	// >! this script's location or the current working directory
	if (typeof entryPath !== "string" || !path.isAbsolute(entryPath)) {
		throw new Error("First argument must be the absolute path of the package entry");
	}

	const reads = JSON.parse(argv[3] ?? "[]");
	// >! Allowlist the accessor names so arbitrary property reads can't be requested
	if (!Array.isArray(reads) || !reads.every((name) => ALLOWED_ACCESSORS.includes(name))) {
		throw new Error(`Second argument must be a JSON array of: ${ALLOWED_ACCESSORS.join(", ")}`);
	}

	return { entryPath, reads };
}

/**
 * Time the entry load plus the accessor reads, and print the result.
 *
 * @returns {void}
 */
function main() {
	let args;
	try {
		args = parseArgs(process.argv);
	} catch (error) {
		process.stderr.write(`child-timer: ${error.message}\n`);
		process.exitCode = 2;
		return;
	}

	const start = process.hrtime.bigint();
	const { tools } = require(args.entryPath);
	for (const name of args.reads) {
		// Reading the getter is the work being timed; the value itself is unused
		const accessor = tools.AWS[name];
		if (accessor === undefined || accessor === null) {
			throw new Error(`tools.AWS.${name} returned ${accessor}`);
		}
	}
	const ms = Number(process.hrtime.bigint() - start) / 1e6;

	process.stdout.write(`RESULT:${JSON.stringify({ ms })}\n`);
}

main();
