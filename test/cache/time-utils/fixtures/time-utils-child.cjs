"use strict";

/**
 * Child-process scenarios for the TimeUtils lifecycle and Cache.init() tests.
 *
 * TimeUtils and Cache initialize once per module instance and expose no reset, so
 * anything that depends on the initialized state or on CACHE_DATA_TIME_ZONE_FOR_INTERVAL
 * is observed in a fresh Node.js process. Tests run this file through
 * test/helpers/time-utils-child-runner.mjs and read the single `RESULT:` line it prints.
 *
 * Before a scenario's first call, DebugAndLog.warn and DebugAndLog.error are replaced
 * with recorders. TimeUtils requires src/lib/tools/DebugAndLog.class.js directly and
 * dao-cache.js reaches the same cached module through tools.DebugAndLog, so the
 * recorders see every call either one makes. Recording starts once the module under
 * test has loaded, so a load-time notice, such as a Node.js deprecation warning, can't
 * shift the recorded messages.
 *
 * An error thrown while loading the module under test is reported as `loadError`, so a
 * test fails on its assertions rather than on a crashed child. Until
 * src/lib/utils/TimeUtils.class.js exists, `time-utils-init` reports MODULE_NOT_FOUND.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (design.md, "Child runner and child script")
 *
 * Usage:
 *   node test/cache/time-utils/fixtures/time-utils-child.cjs <scenario> '<json-object-args>'
 *
 * Scenario `time-utils-init`
 *   args.calls      Array, default []. Each entry calls TimeUtils.init(entry.options). An
 *                   entry without `options` passes undefined explicitly, and
 *                   `noArgument: true` calls TimeUtils.init() with no argument at all.
 *                   JSON can't carry undefined, so an omitted `timezone` key stands for it.
 *   result          { scenario, loadError, calls, timeZone, warnings, errors }
 *                   calls[i]   { threw, name, message, causeName }
 *                   timeZone   TimeUtils.getTimeZone() after the calls
 *
 * Scenario `cache-init`
 *   args.calls      Array, default []. Each entry calls Cache.init() with a copy of
 *                   `entry.params` (default {}), plus:
 *                   - a random 32-byte secureDataKey, unless params.inMemoryOnly is true
 *                     or params already has a secureDataKey
 *                   - each name in `entry.undefinedParams` as an own property holding
 *                     undefined. JSON can't carry undefined, and to today's code a key
 *                     holding undefined isn't the same as an omitted key. This models
 *                     `timeZoneForInterval: process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL`
 *                     with the variable unset
 *                   With `entry.nowAtInit` (milliseconds), Date.now returns that value for
 *                   the duration of that Cache.init() call only, which pins the instant
 *                   today's code samples its offset at
 *   args.interval   When given, the result reports Cache.nextIntervalInSeconds(interval, timestamp)
 *   args.timestamp  In seconds, and requires `interval`. When omitted, the method's default (now) applies
 *   result          { scenario, loadError, calls, info, processVersionsTz, nextIntervalInSeconds, warnings, errors }
 *                   calls[i]               { threw, name, message, causeName }
 *                   info                   timeZoneForInterval, offsetInMinutes, tzDataVersion,
 *                                          idHashAlgorithm, dynamoDbTable, and inMemoryOnly from
 *                                          Cache.info() after the calls. A field holding undefined
 *                                          is absent from the JSON
 *                   processVersionsTz      process.versions.tz in the child, or null
 *                   nextIntervalInSeconds  null when `interval` isn't given
 *
 * Shared result fields
 *   calls[i]   threw is false and the other three are null when the call returned
 *   loadError  null, or { name, message, code } when the module under test failed to
 *              load. The scenario stops there
 *   warnings   Messages passed to DebugAndLog.warn, in order
 *   errors     Messages passed to DebugAndLog.error, in order
 *   error      Present only when the scenario threw unexpectedly or the invocation was
 *              invalid: { name, message, code }, plus `stack` for an unexpected throw.
 *              The partial result recorded before an unexpected throw is kept
 *
 * Exit status: 0 when the scenario ran, including when an init call threw or the module
 * under test failed to load; 1 when the scenario threw unexpectedly; 2 for an invalid
 * invocation, such as an unknown scenario, malformed JSON, or an unknown argument key.
 * Every outcome prints the RESULT line, and a non-zero exit also writes one line to stderr.
 *
 * @example
 * // node test/cache/time-utils/fixtures/time-utils-child.cjs time-utils-init '{"calls":[{"options":{"timezone":"America/Chicago"}}]}'
 * // RESULT:{"scenario":"time-utils-init","loadError":null,"calls":[{"threw":false,"name":null,"message":null,"causeName":null}],"timeZone":"America/Chicago","warnings":[],"errors":[]}
 *
 * @example
 * // node test/cache/time-utils/fixtures/time-utils-child.cjs cache-init '{"calls":[{"params":{"dynamoDbTable":"table-one","s3Bucket":"bucket-one"},"undefinedParams":["timeZoneForInterval"]}]}'
 * // RESULT:{"scenario":"cache-init","loadError":null,"calls":[...],"info":{...},"processVersionsTz":"2026a","nextIntervalInSeconds":null,"warnings":[],"errors":[]}
 */

const crypto = require("node:crypto");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const TIME_UTILS_PATH = path.join(PROJECT_ROOT, "src", "lib", "utils", "TimeUtils.class.js");
const DAO_CACHE_PATH = path.join(PROJECT_ROOT, "src", "lib", "dao-cache.js");
const DEBUG_AND_LOG_PATH = path.join(PROJECT_ROOT, "src", "lib", "tools", "DebugAndLog.class.js");

const RESULT_MARKER = "RESULT:";
const SECURE_DATA_KEY_BYTES = 32;
const INFO_FIELDS = Object.freeze([
	"timeZoneForInterval",
	"offsetInMinutes",
	"tzDataVersion",
	"idHashAlgorithm",
	"dynamoDbTable",
	"inMemoryOnly"
]);

const EXIT_SCENARIO_RAN = 0;
const EXIT_SCENARIO_FAILED = 1;
const EXIT_INVALID_INVOCATION = 2;

/* =============================================================================
 * Helpers
 * -------------------------------------------------------------------------- */

/**
 * Reduce anything thrown to plain, JSON-serializable fields.
 *
 * @param {*} error - Anything thrown
 * @returns {{name: string|null, message: string, code: string|null}} Error summary
 */
function describeError(error) {
	return {
		name: error?.name ?? null,
		message: error?.message ?? String(error),
		code: error?.code ?? null
	};
}

/**
 * Run one init call and summarize how it ended.
 *
 * @param {function(): *} call - The init call
 * @returns {{threw: boolean, name: string|null, message: string|null, causeName: string|null}} Outcome. Only threw is set when the call returned
 */
function callOutcome(call) {
	try {
		call();
	} catch (error) {
		return {
			threw: true,
			name: error?.name ?? null,
			message: error?.message ?? String(error),
			causeName: error?.cause?.name ?? null
		};
	}
	return { threw: false, name: null, message: null, causeName: null };
}

/**
 * Call a function while Date.now returns a fixed value, then restore Date.now.
 *
 * @param {number} nowMs - Value Date.now returns during the call, in milliseconds
 * @param {function(): *} fn - Function to call
 * @returns {*} What fn returns
 * @throws {*} Whatever fn throws, after Date.now is restored
 */
function callWithPinnedNow(nowMs, fn) {
	const realNow = Date.now;
	Date.now = function pinnedNow() {
		return nowMs;
	};
	try {
		return fn();
	} finally {
		Date.now = realNow;
	}
}

/**
 * Replace DebugAndLog.warn and DebugAndLog.error with recorders.
 *
 * Both originals are async, so the recorders return a resolved promise. Recording
 * ignores the log level, so results don't depend on the caller's environment, and a
 * recorded call prints nothing.
 *
 * @param {Function} DebugAndLog - The class exported by src/lib/tools/DebugAndLog.class.js
 * @param {{warnings: Array<string>, errors: Array<string>}} recorded - Arrays the messages are appended to
 * @returns {void}
 */
function installLogRecorders(DebugAndLog, recorded) {
	DebugAndLog.warn = function recordWarn(message) {
		recorded.warnings.push(String(message));
		return Promise.resolve();
	};
	DebugAndLog.error = function recordError(message) {
		recorded.errors.push(String(message));
		return Promise.resolve();
	};
}

/**
 * Load the module under test, then install the log recorders.
 *
 * A load failure sets result.loadError instead of throwing. Check result.loadError, not
 * the return value, to tell whether the module loaded.
 *
 * @param {string} modulePath - Absolute path of the module under test, always one of the constants above
 * @param {Object} result - Scenario result; receives loadError
 * @param {{warnings: Array<string>, errors: Array<string>}} recorded - Arrays the recorders append to
 * @returns {*} The module's exports, or null when it failed to load
 */
function loadUnderTest(modulePath, result, recorded) {
	let moduleExports;
	try {
		moduleExports = require(modulePath);
		installLogRecorders(require(DEBUG_AND_LOG_PATH), recorded);
	} catch (error) {
		result.loadError = describeError(error);
		return null;
	}
	result.loadError = null;
	return moduleExports;
}

/**
 * Build the Cache.init() parameters for one call.
 *
 * @param {{params?: Object, undefinedParams?: Array<string>}} entry - Validated call entry
 * @returns {Object} A fresh parameters object
 */
function buildCacheParams(entry) {
	const params = { ...(entry.params ?? {}) };
	for (const name of entry.undefinedParams ?? []) {
		// An own property holding undefined, unlike an omitted key. defineProperty also keeps
		// a name such as "__proto__" an ordinary data property
		Object.defineProperty(params, name, { value: undefined, writable: true, enumerable: true, configurable: true });
	}
	if (params.inMemoryOnly !== true && !Object.hasOwn(params, "secureDataKey")) {
		// >! A fresh random key for each call; it never leaves this process
		params.secureDataKey = crypto.randomBytes(SECURE_DATA_KEY_BYTES);
	}
	return params;
}

/* =============================================================================
 * Argument validation
 * -------------------------------------------------------------------------- */

/**
 * Whether a value is a JSON object: not null and not an array.
 *
 * @param {*} value - Value to check
 * @returns {boolean} True for a non-null, non-array object
 */
function isJsonObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Throw when an object has a key outside an allowlist, so a misspelled argument fails
 * loudly instead of silently changing the scenario.
 *
 * @param {Object} value - Object to check
 * @param {Array<string>} allowed - Permitted keys
 * @param {string} label - Name used in the error message
 * @returns {void}
 * @throws {Error} When value has a key that isn't in allowed
 */
function assertKnownKeys(value, allowed, label) {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unknown.length > 0) {
		throw new Error(`${label} has unknown keys ${JSON.stringify(unknown)}. Allowed: ${allowed.join(", ")}`);
	}
}

/**
 * Throw unless a value is a finite number.
 *
 * @param {*} value - Value to check
 * @param {string} label - Name used in the error message
 * @returns {void}
 * @throws {Error} When value isn't a finite number
 */
function assertFiniteNumber(value, label) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number`);
	}
}

/**
 * Validate args.calls, defaulting to an empty array.
 *
 * @param {Object} args - Scenario arguments
 * @param {string} scenario - Scenario name, for the error message
 * @returns {Array<Object>} The call entries
 * @throws {Error} When calls isn't an array of JSON objects
 */
function readCalls(args, scenario) {
	const calls = Object.hasOwn(args, "calls") ? args.calls : [];
	if (!Array.isArray(calls) || !calls.every((entry) => isJsonObject(entry))) {
		throw new Error(`${scenario} calls must be an array of JSON objects`);
	}
	return calls;
}

/**
 * Validate the `time-utils-init` arguments.
 *
 * @param {Object} args - Parsed arguments
 * @returns {{calls: Array<{options?: *, noArgument?: boolean}>}} Validated arguments
 * @throws {Error} When an argument is unknown or has the wrong type
 */
function validateTimeUtilsInitArgs(args) {
	assertKnownKeys(args, ["calls"], "time-utils-init arguments");
	const calls = readCalls(args, "time-utils-init");
	calls.forEach((entry, index) => {
		const label = `time-utils-init calls[${index}]`;
		assertKnownKeys(entry, ["options", "noArgument"], label);
		if (Object.hasOwn(entry, "noArgument") && typeof entry.noArgument !== "boolean") {
			throw new Error(`${label}.noArgument must be a boolean`);
		}
		if (entry.noArgument === true && Object.hasOwn(entry, "options")) {
			throw new Error(`${label} can't set both noArgument and options`);
		}
	});
	return { calls };
}

/**
 * Validate the `cache-init` arguments.
 *
 * @param {Object} args - Parsed arguments
 * @returns {{calls: Array<{params?: Object, undefinedParams?: Array<string>, nowAtInit?: number}>, interval?: number, timestamp?: number}} Validated arguments
 * @throws {Error} When an argument is unknown, has the wrong type, or contradicts another
 */
function validateCacheInitArgs(args) {
	assertKnownKeys(args, ["calls", "interval", "timestamp"], "cache-init arguments");
	const calls = readCalls(args, "cache-init");
	calls.forEach((entry, index) => {
		const label = `cache-init calls[${index}]`;
		assertKnownKeys(entry, ["params", "undefinedParams", "nowAtInit"], label);
		const params = Object.hasOwn(entry, "params") ? entry.params : {};
		if (!isJsonObject(params)) {
			throw new Error(`${label}.params must be a JSON object`);
		}
		if (Object.hasOwn(entry, "undefinedParams")) {
			const names = entry.undefinedParams;
			if (!Array.isArray(names) || !names.every((name) => typeof name === "string" && name !== "")) {
				throw new Error(`${label}.undefinedParams must be an array of parameter names`);
			}
			const overlap = names.filter((name) => Object.hasOwn(params, name));
			if (overlap.length > 0) {
				throw new Error(`${label} sets ${JSON.stringify(overlap)} in both params and undefinedParams`);
			}
		}
		if (Object.hasOwn(entry, "nowAtInit")) {
			assertFiniteNumber(entry.nowAtInit, `${label}.nowAtInit`);
		}
	});

	const hasInterval = Object.hasOwn(args, "interval");
	if (hasInterval) {
		assertFiniteNumber(args.interval, "cache-init interval");
	}
	if (Object.hasOwn(args, "timestamp")) {
		if (!hasInterval) {
			throw new Error("cache-init timestamp requires interval");
		}
		assertFiniteNumber(args.timestamp, "cache-init timestamp");
	}
	return { ...args, calls };
}

/* =============================================================================
 * Scenarios
 * -------------------------------------------------------------------------- */

/**
 * Call TimeUtils.init() once per entry, then report the active timezone.
 *
 * @param {{calls: Array<{options?: *, noArgument?: boolean}>}} args - Validated arguments
 * @param {Object} result - Result to fill in: loadError, calls, and timeZone
 * @param {{warnings: Array<string>, errors: Array<string>}} recorded - Recorder arrays
 * @returns {void}
 */
function timeUtilsInit(args, result, recorded) {
	const TimeUtils = loadUnderTest(TIME_UTILS_PATH, result, recorded);
	if (result.loadError !== null) {
		return;
	}

	result.calls = args.calls.map((entry) => callOutcome(() => (
		(entry.noArgument === true) ? TimeUtils.init() : TimeUtils.init(entry.options)
	)));
	result.timeZone = TimeUtils.getTimeZone();
}

/**
 * Call Cache.init() once per entry, then report Cache.info() fields and, when an
 * interval is given, one interval boundary.
 *
 * @param {{calls: Array<{params?: Object, undefinedParams?: Array<string>, nowAtInit?: number}>, interval?: number, timestamp?: number}} args - Validated arguments
 * @param {Object} result - Result to fill in: loadError, calls, info, processVersionsTz, and nextIntervalInSeconds
 * @param {{warnings: Array<string>, errors: Array<string>}} recorded - Recorder arrays
 * @returns {void}
 */
function cacheInit(args, result, recorded) {
	const daoCache = loadUnderTest(DAO_CACHE_PATH, result, recorded);
	if (result.loadError !== null) {
		return;
	}
	const { Cache } = daoCache;

	result.calls = args.calls.map((entry) => {
		const params = buildCacheParams(entry);
		const init = () => Cache.init(params);
		return callOutcome(Object.hasOwn(entry, "nowAtInit") ? () => callWithPinnedNow(entry.nowAtInit, init) : init);
	});

	const info = Cache.info();
	result.info = Object.fromEntries(INFO_FIELDS.map((field) => [field, info[field]]));
	result.processVersionsTz = process.versions.tz ?? null;

	let boundary = null;
	if (Object.hasOwn(args, "timestamp")) {
		boundary = Cache.nextIntervalInSeconds(args.interval, args.timestamp);
	} else if (Object.hasOwn(args, "interval")) {
		boundary = Cache.nextIntervalInSeconds(args.interval);
	}
	result.nextIntervalInSeconds = boundary;
}

/* =============================================================================
 * Dispatch
 * -------------------------------------------------------------------------- */

const SCENARIOS = Object.freeze({
	"time-utils-init": Object.freeze({ validate: validateTimeUtilsInitArgs, run: timeUtilsInit }),
	"cache-init": Object.freeze({ validate: validateCacheInitArgs, run: cacheInit })
});

/**
 * Parse and validate the scenario name and its JSON arguments.
 *
 * @param {Array<string>} argv - process.argv
 * @returns {{scenario: string, args: Object}} Validated invocation
 * @throws {Error} When the scenario is unknown or the arguments are invalid
 */
function parseInvocation(argv) {
	const scenario = argv[2];
	// >! Allowlist scenario names: inputs pick a scenario and supply data, never code or module paths
	if (typeof scenario !== "string" || !Object.hasOwn(SCENARIOS, scenario)) {
		throw new Error(`Unknown scenario ${JSON.stringify(scenario ?? null)}. Expected one of: ${Object.keys(SCENARIOS).join(", ")}`);
	}

	let args;
	try {
		// >! Arguments are parsed as JSON data and never evaluated
		args = (argv[3] === undefined) ? {} : JSON.parse(argv[3]);
	} catch (error) {
		throw new Error(`Scenario arguments must be valid JSON: ${error.message}`, { cause: error });
	}
	if (!isJsonObject(args)) {
		throw new Error("Scenario arguments must be a JSON object");
	}
	return { scenario, args: SCENARIOS[scenario].validate(args) };
}

/**
 * Print the RESULT line and set the exit status.
 *
 * Sets process.exitCode rather than calling process.exit(), so stdout is flushed before
 * the process ends. JSON.stringify escapes line breaks inside strings, so the result is
 * always a single line, and this is the only stdout write the script makes.
 *
 * @param {Object} result - Result to print
 * @param {number} status - Exit status
 * @returns {void}
 */
function finish(result, status) {
	let payload = result;
	let exitStatus = status;
	let line;
	try {
		line = JSON.stringify(payload);
	} catch (error) {
		payload = { scenario: result.scenario ?? null, error: describeError(error) };
		line = JSON.stringify(payload);
		exitStatus = EXIT_SCENARIO_FAILED;
	}

	process.stdout.write(`${RESULT_MARKER}${line}\n`);
	if (exitStatus !== EXIT_SCENARIO_RAN) {
		process.stderr.write(`time-utils-child: ${payload.error?.message ?? "scenario failed"}\n`);
	}
	process.exitCode = exitStatus;
}

/**
 * Run the requested scenario and print its result.
 *
 * @returns {void}
 */
function main() {
	let invocation;
	try {
		invocation = parseInvocation(process.argv);
	} catch (error) {
		const scenario = (typeof process.argv[2] === "string") ? process.argv[2] : null;
		finish({ scenario, error: describeError(error) }, EXIT_INVALID_INVOCATION);
		return;
	}

	const { scenario, args } = invocation;
	const result = { scenario };
	const recorded = { warnings: [], errors: [] };
	let failure = null;
	try {
		SCENARIOS[scenario].run(args, result, recorded);
	} catch (error) {
		failure = { ...describeError(error), stack: error?.stack ?? null };
	}

	const output = { ...result, warnings: recorded.warnings, errors: recorded.errors };
	if (failure !== null) {
		output.error = failure;
	}
	finish(output, (failure === null) ? EXIT_SCENARIO_RAN : EXIT_SCENARIO_FAILED);
}

main();
