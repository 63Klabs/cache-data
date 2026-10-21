/**
 * Cold-start benchmark for the lazy AWS accessors.
 *
 * Compares a baseline git ref against a candidate directory by timing, in fresh
 * Node.js processes, how long it takes to load the package entry and read AWS
 * accessors. The baseline's src/ and package.json are extracted with `git archive`
 * into a temporary directory, and every child resolves dependencies from this
 * repository's node_modules through NODE_PATH, so both sides run against the same
 * installed SDK versions. Baseline and candidate runs are interleaved so drift
 * affects both sides equally.
 *
 * Writes a markdown report to stdout and progress to stderr. Not part of the test
 * suite, not run in CI, and excluded from the npm package.
 *
 * Spec: .kiro/specs/1-4-0-convert-aws-to-lazy-accessors (Requirement 10)
 *
 * Usage:
 *   node .kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/lazy-accessor-coldstart.mjs \
 *     --baseline <git-ref> [--candidate <dir>] [--runs <n>] [--one <dynamo|s3|ssm>]
 *
 * @example
 * // A/A check while src/ is unchanged: both sides are the same code
 * // node .kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/lazy-accessor-coldstart.mjs --baseline HEAD
 *
 * @example
 * // After the conversion, against the commit before it, with 40 runs per side
 * // node .kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/lazy-accessor-coldstart.mjs --baseline main --runs 40
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const BENCHMARK_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(BENCHMARK_DIR, "..", "..", "..", "..");
const CHILD_TIMER = path.join(BENCHMARK_DIR, "child-timer.cjs");

const CONVERTED_ACCESSORS = ["dynamo", "s3", "ssm"];
const X_RAY_ENV_VARS = ["CacheData_AWSXRayOn", "CACHE_DATA_AWS_X_RAY_ON"];
const DEFAULT_RUNS = 20;
const MAX_RUNS = 1000;
const CHILD_TIMEOUT_MS = 30000;
const RESULT_MARKER = "RESULT:";

// >! Allowlist git refs and reject a leading "-", so a ref can never be read as a git option
const GIT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]*$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

const USAGE = "Usage: node lazy-accessor-coldstart.mjs --baseline <git-ref> [--candidate <dir>] [--runs <n>] [--one <dynamo|s3|ssm>]";

/**
 * Parse and validate the command-line options.
 *
 * @param {Array<string>} argv - Arguments after the script path
 * @returns {{baseline: string, candidate: string, runs: number, one: string}|null} Options, or null for --help
 * @throws {Error} When an option is missing, unknown, or invalid
 */
function parseCliArgs(argv) {
	const { values } = parseArgs({
		args: argv,
		options: {
			baseline: { type: "string" },
			candidate: { type: "string" },
			runs: { type: "string" },
			one: { type: "string" },
			help: { type: "boolean", short: "h" }
		},
		strict: true,
		allowPositionals: false
	});

	if (values.help) {
		return null;
	}

	if (values.baseline === undefined) {
		throw new Error("--baseline <git-ref> is required");
	}
	if (!GIT_REF_PATTERN.test(values.baseline)) {
		throw new Error(`--baseline "${values.baseline}" is not an accepted git ref`);
	}

	const candidate = path.resolve(values.candidate ?? REPO_ROOT);
	if (!fs.existsSync(path.join(candidate, "src", "index.js"))) {
		throw new Error(`--candidate "${candidate}" has no src/index.js`);
	}

	const runs = values.runs === undefined ? DEFAULT_RUNS : Number(values.runs);
	if (!Number.isInteger(runs) || runs < 1 || runs > MAX_RUNS) {
		throw new Error(`--runs must be an integer from 1 to ${MAX_RUNS}`);
	}

	const one = values.one ?? "ssm";
	if (!CONVERTED_ACCESSORS.includes(one)) {
		throw new Error(`--one must be one of: ${CONVERTED_ACCESSORS.join(", ")}`);
	}

	return { baseline: values.baseline, candidate, runs, one };
}

/**
 * Run a git command in the repository root.
 *
 * @param {Array<string>} args - git arguments
 * @returns {string} Trimmed stdout
 * @throws {Error} When git exits non-zero
 */
function git(args) {
	// >! execFileSync with an argument array: no shell, so arguments are never interpreted
	return execFileSync("git", args, {
		cwd: REPO_ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"]
	}).trim();
}

/**
 * Resolve a git ref to a full commit SHA.
 *
 * @param {string} ref - Validated git ref
 * @returns {string} Commit SHA
 * @throws {Error} When the ref doesn't name a commit
 */
function resolveCommit(ref) {
	let sha;
	try {
		sha = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
	} catch {
		throw new Error(`"${ref}" does not name a commit in ${REPO_ROOT}`);
	}
	if (!COMMIT_SHA_PATTERN.test(sha)) {
		throw new Error(`"${ref}" resolved to an unexpected value: ${sha}`);
	}
	return sha;
}

/**
 * Extract src/ and package.json at a commit into a fresh directory.
 *
 * @param {string} sha - Commit SHA
 * @param {string} workDir - Temporary directory to extract into
 * @returns {string} Root of the extracted baseline
 */
function extractBaseline(sha, workDir) {
	const tarPath = path.join(workDir, "baseline.tar");
	const root = path.join(workDir, "baseline");
	fs.mkdirSync(root);
	git(["archive", "--format=tar", "-o", tarPath, sha, "src", "package.json"]);
	execFileSync("tar", ["-xf", tarPath, "-C", root], { stdio: ["ignore", "pipe", "pipe"] });
	return root;
}

/**
 * Describe the candidate's state when it is this repository's working tree.
 *
 * @param {string} candidate - Candidate root
 * @returns {string|null} A short description, or null for any other directory
 */
function describeCandidate(candidate) {
	if (candidate !== REPO_ROOT) {
		return null;
	}
	const changes = git(["status", "--porcelain", "--", "src"]);
	return changes === "" ? "working tree; src/ matches HEAD" : "working tree; src/ has uncommitted changes";
}

/**
 * Build the environment every timed child runs with.
 *
 * @returns {Object.<string, string>} Child environment
 */
function childEnvironment() {
	const env = {
		...process.env,
		NODE_PATH: path.join(REPO_ROOT, "node_modules"),
		AWS_REGION: "us-east-1"
	};
	for (const name of X_RAY_ENV_VARS) {
		delete env[name];
	}
	return env;
}

/**
 * Time one fresh-process load of a root's package entry plus the given reads.
 *
 * @param {string} root - Baseline or candidate root
 * @param {Array<string>} reads - Accessor names to read after loading
 * @param {Object.<string, string>} env - Child environment
 * @returns {number} Elapsed milliseconds measured inside the child
 * @throws {Error} When the child fails or prints no usable result
 */
function timeOnce(root, reads, env) {
	const entry = path.join(root, "src", "index.js");
	const stdout = execFileSync(process.execPath, [CHILD_TIMER, entry, JSON.stringify(reads)], {
		env,
		encoding: "utf8",
		timeout: CHILD_TIMEOUT_MS,
		stdio: ["ignore", "pipe", "pipe"]
	});
	const line = stdout.split(/\r?\n/).reverse().find((outputLine) => outputLine.startsWith(RESULT_MARKER));
	if (line === undefined) {
		throw new Error(`No ${RESULT_MARKER} line from the child for ${entry}`);
	}
	const { ms } = JSON.parse(line.slice(RESULT_MARKER.length));
	if (!Number.isFinite(ms)) {
		throw new Error(`The child for ${entry} reported a non-numeric time`);
	}
	return ms;
}

/**
 * Summarize timing samples.
 *
 * @param {Array<number>} samples - Milliseconds
 * @returns {{runs: number, mean: number, median: number, min: number, max: number}} Summary statistics
 */
function summarize(samples) {
	const sorted = [...samples].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
	const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
	return { runs: samples.length, mean, median, min: sorted[0], max: sorted[sorted.length - 1] };
}

/**
 * Measure one scenario on both sides: a discarded warm-up each, then interleaved runs.
 *
 * @param {{name: string, reads: Array<string>}} scenario - Scenario to measure
 * @param {{baseline: string, candidate: string}} roots - Roots to compare
 * @param {number} runs - Measured runs per side
 * @param {Object.<string, string>} env - Child environment
 * @returns {{baseline: Object, candidate: Object}} Summary statistics per side
 */
function measureScenario(scenario, roots, runs, env) {
	timeOnce(roots.baseline, scenario.reads, env);
	timeOnce(roots.candidate, scenario.reads, env);

	const samples = { baseline: [], candidate: [] };
	for (let index = 0; index < runs; index += 1) {
		// Alternate which side goes first so ordering effects cancel out
		const order = index % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
		for (const side of order) {
			samples[side].push(timeOnce(roots[side], scenario.reads, env));
		}
	}
	return { baseline: summarize(samples.baseline), candidate: summarize(samples.candidate) };
}

/**
 * Format milliseconds for the report.
 *
 * @param {number} value - Milliseconds
 * @returns {string} Value with one decimal place; a value that rounds to zero prints as "0.0", never "-0.0"
 */
function formatMs(value) {
	const rounded = Number(value.toFixed(1));
	return (rounded === 0 ? 0 : rounded).toFixed(1);
}

/**
 * Build the markdown report.
 *
 * @param {Object} report - Report inputs
 * @param {{baseline: string, candidate: string, runs: number}} report.options - Parsed options
 * @param {string} report.sha - Baseline commit SHA
 * @param {string|null} report.candidateState - Candidate description, if any
 * @param {Array<{name: string, stats: {baseline: Object, candidate: Object}}>} report.results - Measured scenarios
 * @returns {string} Markdown
 */
function formatReport({ options, sha, candidateState, results }) {
	const lines = [
		"## Lazy-accessor cold-start benchmark",
		"",
		`- Date: ${new Date().toISOString()}`,
		`- Node.js: ${process.version} (${process.platform} ${process.arch})`,
		`- Baseline: \`${options.baseline}\` (${sha})`,
		`- Candidate: \`${options.candidate}\`${candidateState === null ? "" : ` (${candidateState})`}`,
		`- Runs: ${options.runs} per side and scenario, after one discarded warm-up per side`,
		"- Time is measured inside each child: loading the package entry plus the listed accessor reads",
		"",
		"| Scenario | Side | Runs | Mean (ms) | Median (ms) | Min (ms) | Max (ms) |",
		"|---|---|---|---|---|---|---|"
	];

	for (const { name, stats } of results) {
		for (const side of ["baseline", "candidate"]) {
			const summary = stats[side];
			lines.push(`| ${name} | ${side} | ${summary.runs} | ${formatMs(summary.mean)} | ${formatMs(summary.median)} | ${formatMs(summary.min)} | ${formatMs(summary.max)} |`);
		}
	}

	lines.push(
		"",
		"| Scenario | Median: candidate minus baseline (ms) | Mean: candidate minus baseline (ms) |",
		"|---|---|---|"
	);
	for (const { name, stats } of results) {
		lines.push(`| ${name} | ${formatMs(stats.candidate.median - stats.baseline.median)} | ${formatMs(stats.candidate.mean - stats.baseline.mean)} |`);
	}

	const importOnly = results[0];
	const allThree = results[results.length - 1];
	const firstReadCost = (side) => formatMs(allThree.stats[side].median - importOnly.stats[side].median);
	lines.push(
		"",
		`First-read cost (median of "${allThree.name}" minus median of "${importOnly.name}"): baseline ${firstReadCost("baseline")} ms, candidate ${firstReadCost("candidate")} ms`
	);

	return lines.join("\n");
}

/**
 * Run the benchmark.
 *
 * @returns {void}
 */
function main() {
	let options;
	try {
		options = parseCliArgs(process.argv.slice(2));
	} catch (error) {
		process.stderr.write(`${error.message}\n${USAGE}\n`);
		process.exitCode = 2;
		return;
	}
	if (options === null) {
		process.stdout.write(`${USAGE}\n`);
		return;
	}

	let workDir = null;
	try {
		const sha = resolveCommit(options.baseline);
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-data-lazy-benchmark-"));
		const roots = { baseline: extractBaseline(sha, workDir), candidate: options.candidate };
		const env = childEnvironment();
		const scenarios = [
			{ name: "import only", reads: [] },
			{ name: `import + ${options.one}`, reads: [options.one] },
			{ name: "import + dynamo, s3, ssm", reads: CONVERTED_ACCESSORS }
		];

		const results = scenarios.map((scenario) => {
			process.stderr.write(`Measuring "${scenario.name}"...\n`);
			return { name: scenario.name, stats: measureScenario(scenario, roots, options.runs, env) };
		});

		const candidateState = describeCandidate(options.candidate);
		process.stdout.write(`${formatReport({ options, sha, candidateState, results })}\n`);
	} catch (error) {
		process.stderr.write(`Benchmark failed: ${error.message}\n`);
		process.exitCode = 1;
	} finally {
		if (workDir !== null) {
			fs.rmSync(workDir, { recursive: true, force: true });
		}
	}
}

main();
