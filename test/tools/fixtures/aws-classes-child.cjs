"use strict";

/**
 * Child-process scenarios for the AWS lazy-accessor tests.
 *
 * Each scenario runs in a fresh Node.js process, so module-load behavior can be
 * observed directly: which AWS SDK packages are loaded and when, when X-Ray
 * initializes, which region each client resolves, and what happens when a package
 * can't be resolved. Tests run this file through
 * test/helpers/aws-classes-child-runner.mjs and read the single `RESULT:` line it
 * prints.
 *
 * Every scenario except `v2-entry` catches errors thrown while loading the module
 * and reports them, so a test fails on its assertions rather than on a crashed
 * child. `v2-entry` lets the failure escape, so the parent sees the exit status and
 * stderr a consumer would see.
 *
 * Spec: .kiro/specs/1-4-0-convert-aws-to-lazy-accessors (design.md, "Child script")
 *
 * Usage:
 *   node test/tools/fixtures/aws-classes-child.cjs <scenario> '<json-object-args>'
 *
 * @example
 * // node test/tools/fixtures/aws-classes-child.cjs load-sequence '{"reads":["s3"]}'
 * // RESULT:{"scenario":"load-sequence","entryLoaded":true,"atLoad":[],"afterReads":["@aws-sdk/client-s3"],...}
 */

const path = require("node:path");
const Module = require("node:module");
const { SERVICE_PACKAGES } = require("./service-packages.cjs");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const ENTRY_PATH = path.join(PROJECT_ROOT, "src", "index.js");
const AWS_CLASSES_PATH = path.join(PROJECT_ROOT, "src", "lib", "tools", "AWS.classes.js");
const POWERTOOLS_INIT_PATH = path.join(PROJECT_ROOT, "src", "lib", "tools", "PowertoolsInit.js");

const ACCESSORS = Object.keys(SERVICE_PACKAGES);
const CONVERTED_ACCESSORS = ["dynamo", "s3", "ssm"];
const ALL_SERVICE_PACKAGES = [...new Set(Object.values(SERVICE_PACKAGES).flat())].sort();
const XRAY_PACKAGE = "aws-xray-sdk-core";
const XRAY_MIDDLEWARE = "XRaySDKInstrumentation";
const REGION_WARNING = "AWS_REGION is NOT set";
const OLD_NODE_VERSION = "16.20.0";
const RESULT_MARKER = "RESULT:";

/* =============================================================================
 * Helpers
 * -------------------------------------------------------------------------- */

/**
 * Print the scenario result as the single RESULT line the parent parses.
 *
 * @param {Object} value - JSON-serializable result
 * @returns {void}
 */
function report(value) {
	process.stdout.write(`${RESULT_MARKER}${JSON.stringify(value)}\n`);
}

/**
 * Reduce an error to the fields the tests assert on.
 *
 * @param {*} error - Anything thrown
 * @returns {{name: string|null, message: string, code: string|null}} Serializable error summary
 */
function describeError(error) {
	return {
		name: error?.name ?? null,
		message: error?.message ?? String(error),
		code: error?.code ?? null
	};
}

/**
 * Run a function and capture its value or the error it throws.
 *
 * @param {function(): *} fn - Function to run
 * @returns {{ok: true, value: *}|{ok: false, error: {name: string|null, message: string, code: string|null}}} Outcome
 */
function attempt(fn) {
	try {
		return { ok: true, value: fn() };
	} catch (error) {
		return { ok: false, error: describeError(error) };
	}
}

/**
 * Summarize an accessor read for the result.
 *
 * @param {{ok: boolean, error?: Object}} read - Outcome from attempt()
 * @returns {{threw: false}|{threw: true, code: string|null, message: string}} Read summary
 */
function readOutcome(read) {
	return read.ok
		? { threw: false }
		: { threw: true, code: read.error.code, message: read.error.message };
}

/**
 * Whether any module from a package is in the require cache.
 *
 * @param {string} packageName - Package name, e.g. "@aws-sdk/client-s3"
 * @returns {boolean} True when a cached module path contains /node_modules/<packageName>/
 */
function isPackageLoaded(packageName) {
	const marker = `/node_modules/${packageName}/`;
	return Object.keys(require.cache).some((key) => key.split(path.sep).join("/").includes(marker));
}

/**
 * List the service-client packages currently loaded, sorted.
 *
 * @returns {Array<string>} Loaded service-client package names
 */
function loadedServicePackages() {
	return ALL_SERVICE_PACKAGES.filter(isPackageLoaded);
}

/**
 * Make bare-specifier requires of the given packages fail with MODULE_NOT_FOUND.
 *
 * @param {Array<string>} requests - Exact require() specifiers to block
 * @returns {function(): void} Restores normal module resolution
 */
function blockModules(requests) {
	const blocked = new Set(requests);
	const originalResolve = Module._resolveFilename;
	Module._resolveFilename = function resolveUnlessBlocked(request, ...rest) {
		if (blocked.has(request)) {
			const error = new Error(`Cannot find module '${request}'`);
			error.code = "MODULE_NOT_FOUND";
			throw error;
		}
		return originalResolve.call(this, request, ...rest);
	};
	return function restoreResolution() {
		Module._resolveFilename = originalResolve;
	};
}

/**
 * Make this process report an old Node.js version, so AWS.SDK_V3 is false.
 *
 * @returns {void}
 */
function pretendOldNode() {
	Object.defineProperty(process.versions, "node", { value: OLD_NODE_VERSION });
}

/**
 * Load the package entry, capturing a load failure instead of throwing.
 *
 * @returns {{ok: boolean, value?: {tools: Object}, error?: Object}} Outcome from attempt()
 */
function loadEntry() {
	return attempt(() => require(ENTRY_PATH));
}

/**
 * The X-Ray environment variables as this process sees them.
 *
 * @returns {{CacheData_AWSXRayOn: string|null, CACHE_DATA_AWS_X_RAY_ON: string|null}} Variable values
 */
function xrayEnvironment() {
	return {
		CacheData_AWSXRayOn: process.env.CacheData_AWSXRayOn ?? null,
		CACHE_DATA_AWS_X_RAY_ON: process.env.CACHE_DATA_AWS_X_RAY_ON ?? null
	};
}

/**
 * Whether a read accessor's client carries X-Ray instrumentation middleware.
 *
 * @param {{ok: boolean, value?: {client: Object}}} read - Outcome from attempt()
 * @returns {boolean|null} Null when the read failed
 */
function hasXRayMiddleware(read) {
	if (!read.ok) {
		return null;
	}
	return read.value.client.middlewareStack.identify().some((entry) => entry.includes(XRAY_MIDDLEWARE));
}

/* =============================================================================
 * Scenarios
 * -------------------------------------------------------------------------- */

/**
 * Load the entry, then read accessors in order (Properties 1 and 2).
 *
 * @param {{reads?: Array<string>}} args - Accessor names to read, in order
 * @returns {Object} Packages loaded at entry load and after the reads, plus per-service checks
 * @throws {Error} When reads contains a name that isn't an accessor
 */
function loadSequence(args) {
	const reads = args.reads ?? [];
	if (!Array.isArray(reads) || !reads.every((name) => ACCESSORS.includes(name))) {
		throw new Error(`reads must be an array of: ${ACCESSORS.join(", ")}`);
	}

	const entry = loadEntry();
	const atLoad = loadedServicePackages();
	if (!entry.ok) {
		return { entryLoaded: false, entryError: entry.error, atLoad };
	}

	const { AWS } = entry.value.tools;
	const firstRead = new Map();
	const seenOuterObjects = new Map();
	const checks = {};
	const readErrors = [];

	for (const name of reads) {
		const read = attempt(() => AWS[name]);
		if (!read.ok) {
			readErrors.push({ accessor: name, error: read.error });
			continue;
		}
		const accessor = read.value;
		if (!firstRead.has(name)) {
			firstRead.set(name, accessor);
			seenOuterObjects.set(name, new Set([accessor]));
			checks[name] = { reads: 1, sameClient: true, sameSdk: true, freshLiteral: true };
			continue;
		}
		const check = checks[name];
		const first = firstRead.get(name);
		check.reads += 1;
		check.sameClient = check.sameClient && accessor.client === first.client;
		check.sameSdk = check.sameSdk && accessor.sdk === first.sdk;
		check.freshLiteral = check.freshLiteral && !seenOuterObjects.get(name).has(accessor);
		seenOuterObjects.get(name).add(accessor);
	}

	return { entryLoaded: true, atLoad, afterReads: loadedServicePackages(), checks, readErrors };
}

/**
 * Count missing-region warnings after load, after reading s3, and after reading ssm.
 *
 * @returns {Object} Warning counts at each step
 */
function regionWarning() {
	const messages = [];
	const originalWarn = console.warn;
	console.warn = (...parts) => {
		messages.push(parts.map((part) => String(part)).join(" "));
	};
	const count = () => messages.filter((message) => message.includes(REGION_WARNING)).length;

	try {
		const awsRegion = process.env.AWS_REGION ?? null;
		const entry = loadEntry();
		const afterLoad = count();
		if (!entry.ok) {
			return { awsRegion, entryLoaded: false, entryError: entry.error, afterLoad };
		}
		const { AWS } = entry.value.tools;
		const s3 = attempt(() => AWS.s3);
		const afterS3 = count();
		const ssm = attempt(() => AWS.ssm);
		const afterSsm = count();
		return {
			awsRegion,
			entryLoaded: true,
			afterLoad,
			afterS3,
			afterSsm,
			s3Read: readOutcome(s3),
			ssmRead: readOutcome(ssm)
		};
	} finally {
		console.warn = originalWarn;
	}
}

/**
 * Report AWS.REGION and the region each client resolves (behavior change 3).
 *
 * @returns {Promise<Object>} The environment seen, AWS.REGION, and each client's region
 */
async function regionSource() {
	const env = {
		AWS_REGION: process.env.AWS_REGION ?? null,
		AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION ?? null,
		AWS_PROFILE: process.env.AWS_PROFILE ?? null,
		AWS_CONFIG_FILE: process.env.AWS_CONFIG_FILE ?? null
	};
	const entry = loadEntry();
	if (!entry.ok) {
		return { env, entryLoaded: false, entryError: entry.error };
	}

	const { AWS } = entry.value.tools;
	const regions = {};
	for (const name of ["s3", "dynamo", "ssm"]) {
		const read = attempt(() => AWS[name]);
		if (!read.ok) {
			regions[name] = { error: read.error };
			continue;
		}
		try {
			regions[name] = { region: await read.value.client.config.region() };
		} catch (error) {
			regions[name] = { error: describeError(error) };
		}
	}

	return { env, entryLoaded: true, awsRegion: AWS.REGION, regions };
}

/**
 * Read dynamo, install a fake TracingProvider, then read s3 twice and ssm once.
 *
 * @returns {Object} Constructor names of the clients the fake provider instrumented
 */
function providerTiming() {
	const entry = loadEntry();
	if (!entry.ok) {
		return { entryLoaded: false, entryError: entry.error };
	}

	const { AWS } = entry.value.tools;
	const dynamo = attempt(() => AWS.dynamo);

	const received = [];
	const { powertoolsState } = require(POWERTOOLS_INIT_PATH).TestHarness.getInternals();
	const previousInstance = powertoolsState.tracer.instance;
	powertoolsState.tracer.instance = {
		instrumentClient(client) {
			received.push(client?.constructor?.name ?? null);
			return client;
		}
	};

	try {
		const s3First = attempt(() => AWS.s3);
		const s3Second = attempt(() => AWS.s3);
		const ssm = attempt(() => AWS.ssm);
		return {
			entryLoaded: true,
			received,
			reads: {
				dynamo: readOutcome(dynamo),
				s3First: readOutcome(s3First),
				s3Second: readOutcome(s3Second),
				ssm: readOutcome(ssm)
			}
		};
	} finally {
		powertoolsState.tracer.instance = previousInstance;
	}
}

/**
 * Report the X-Ray bindings after loading the entry, without reading any service accessor.
 *
 * @param {{blockXray?: boolean}} args - blockXray makes aws-xray-sdk-core unresolvable during load
 * @returns {Object} Null checks, identity checks, export names, and loaded packages
 */
function xrayExports(args) {
	const restoreResolution = args.blockXray === true ? blockModules([XRAY_PACKAGE]) : null;
	const entry = loadEntry();
	if (restoreResolution !== null) {
		restoreResolution();
	}

	const xrayEnv = xrayEnvironment();
	// Captured before any getter is read, so nothing below can affect them
	const servicePackagesLoaded = loadedServicePackages();
	const xraySdkLoaded = isPackageLoaded(XRAY_PACKAGE);
	if (!entry.ok) {
		return { xrayEnv, entryLoaded: false, entryError: entry.error, servicePackagesLoaded, xraySdkLoaded };
	}

	const tools = entry.value.tools;
	const classes = require(AWS_CLASSES_PATH);
	const xray = tools.AWSXRay;
	return {
		xrayEnv,
		entryLoaded: true,
		servicePackagesLoaded,
		xraySdkLoaded,
		awsXRayIsNull: xray === null,
		hasCaptureAWSv3Client: typeof xray?.captureAWSv3Client === "function",
		aliasIdentical: tools.AwsXRay === xray,
		getterIdentical: tools.AWS.XRay === xray,
		classesExportsIdentical: classes.AWSXRay === xray && classes.AwsXRay === xray,
		classesExportNames: Object.keys(classes).sort()
	};
}

/**
 * Count X-Ray capture calls across load, AWS.XRay reads, and accessor reads.
 *
 * @returns {Object} Call counts after each step and whether clients carry X-Ray middleware
 */
function xrayCounts() {
	// Pre-load and wrap so the module object AWS.classes.js requires is the counted one
	const xray = require(XRAY_PACKAGE);
	const calls = { captureHTTPsGlobal: 0, captureAWSv3Client: 0 };
	const originalCaptureHttps = xray.captureHTTPsGlobal;
	const originalCaptureClient = xray.captureAWSv3Client;
	xray.captureHTTPsGlobal = function countedCaptureHTTPsGlobal(...captureArgs) {
		calls.captureHTTPsGlobal += 1;
		return originalCaptureHttps.apply(this, captureArgs);
	};
	xray.captureAWSv3Client = function countedCaptureAWSv3Client(...captureArgs) {
		calls.captureAWSv3Client += 1;
		return originalCaptureClient.apply(this, captureArgs);
	};
	const snapshot = () => ({ ...calls });

	const xrayEnv = xrayEnvironment();
	const entry = loadEntry();
	const afterLoad = snapshot();
	if (!entry.ok) {
		return { xrayEnv, entryLoaded: false, entryError: entry.error, afterLoad };
	}

	const { AWS } = entry.value.tools;
	for (let index = 0; index < 3; index += 1) {
		attempt(() => AWS.XRay);
	}
	const afterXRayReads = snapshot();
	const s3 = attempt(() => AWS.s3);
	attempt(() => AWS.s3);
	const afterS3 = snapshot();
	const dynamo = attempt(() => AWS.dynamo);
	const afterDynamo = snapshot();

	return {
		xrayEnv,
		entryLoaded: true,
		afterLoad,
		afterXRayReads,
		afterS3,
		afterDynamo,
		s3HasXRayMiddleware: hasXRayMiddleware(s3),
		dynamoHasXRayMiddleware: hasXRayMiddleware(dynamo)
	};
}

/**
 * Require AWS.classes.js directly on a pretend Node.js 16 and read every accessor.
 *
 * @returns {Object} Load outcome, SDK_V3, each read's outcome, and the secrets result
 */
function v2Guard() {
	pretendOldNode();
	const loaded = attempt(() => require(AWS_CLASSES_PATH));
	if (!loaded.ok) {
		return { moduleLoaded: false, loadError: loaded.error, servicePackagesLoaded: loadedServicePackages() };
	}

	const { AWS } = loaded.value;
	const reads = {};
	for (const name of CONVERTED_ACCESSORS) {
		reads[name] = [readOutcome(attempt(() => AWS[name])), readOutcome(attempt(() => AWS[name]))];
	}
	const packagesBeforeSecrets = loadedServicePackages();
	const secrets = attempt(() => AWS.secrets);

	return {
		moduleLoaded: true,
		nodeVersion: AWS.NODE_VER,
		sdkV3: AWS.SDK_V3,
		reads,
		packagesBeforeSecrets,
		secretsRead: readOutcome(secrets),
		secretsAvailable: secrets.ok ? secrets.value.available : null
	};
}

/**
 * Require the package entry on a pretend Node.js 16, letting any failure escape.
 *
 * @returns {{entryLoaded: true}} Only returned if loading neither exits nor throws
 */
function v2Entry() {
	pretendOldNode();
	// Deliberately not caught: the parent checks the exit status and stderr a consumer would see
	require(ENTRY_PATH);
	return { entryLoaded: true };
}

/**
 * Block @aws-sdk/client-s3, read s3 twice and ssm once, then unblock and read s3 again.
 *
 * @returns {Object} Each read's outcome and the recovered accessor's keys
 */
function missingOne() {
	const restoreResolution = blockModules(["@aws-sdk/client-s3"]);
	let restored = false;
	try {
		const entry = loadEntry();
		if (!entry.ok) {
			return { entryLoaded: false, entryError: entry.error };
		}

		const { AWS } = entry.value.tools;
		const blockedReads = [readOutcome(attempt(() => AWS.s3)), readOutcome(attempt(() => AWS.s3))];
		const ssm = attempt(() => AWS.ssm);

		restoreResolution();
		restored = true;
		const recovered = attempt(() => AWS.s3);

		return {
			entryLoaded: true,
			blockedReads,
			ssmRead: readOutcome(ssm),
			ssmHasClient: ssm.ok && ssm.value.client !== null && ssm.value.client !== undefined,
			recoveredRead: readOutcome(recovered),
			recoveredHasClient: recovered.ok && recovered.value.client !== null && recovered.value.client !== undefined,
			recoveredKeys: recovered.ok ? Object.keys(recovered.value).sort() : null
		};
	} finally {
		if (!restored) {
			restoreResolution();
		}
	}
}

/**
 * Block all five service-client packages, then read every accessor.
 *
 * @returns {Object} Entry load outcome, each converted read's outcome, and the secrets result
 */
function missingAll() {
	const restoreResolution = blockModules(ALL_SERVICE_PACKAGES);
	try {
		const entry = loadEntry();
		if (!entry.ok) {
			return { entryLoaded: false, entryError: entry.error };
		}

		const { AWS } = entry.value.tools;
		const reads = {};
		for (const name of CONVERTED_ACCESSORS) {
			reads[name] = readOutcome(attempt(() => AWS[name]));
		}
		const secrets = attempt(() => AWS.secrets);

		return {
			entryLoaded: true,
			reads,
			secretsRead: readOutcome(secrets),
			secretsAvailable: secrets.ok ? secrets.value.available : null,
			secretsReason: secrets.ok ? secrets.value.reason : null
		};
	} finally {
		restoreResolution();
	}
}

/* =============================================================================
 * Dispatch
 * -------------------------------------------------------------------------- */

const SCENARIOS = Object.freeze({
	"load-sequence": loadSequence,
	"region-warning": regionWarning,
	"region-source": regionSource,
	"provider-timing": providerTiming,
	"xray-exports": xrayExports,
	"xray-counts": xrayCounts,
	"v2-guard": v2Guard,
	"v2-entry": v2Entry,
	"missing-one": missingOne,
	"missing-all": missingAll
});

/**
 * Parse and validate the scenario name and its JSON arguments.
 *
 * @param {Array<string>} argv - process.argv
 * @returns {{scenario: string, args: Object}} Validated invocation
 * @throws {Error} When the scenario is unknown or the arguments aren't a JSON object
 */
function parseInvocation(argv) {
	const scenario = argv[2];
	// >! Allowlist scenario names; never build code or require paths from inputs
	if (typeof scenario !== "string" || !Object.hasOwn(SCENARIOS, scenario)) {
		throw new Error(`Unknown scenario ${JSON.stringify(scenario)}. Expected one of: ${Object.keys(SCENARIOS).join(", ")}`);
	}
	const args = JSON.parse(argv[3] ?? "{}");
	if (args === null || typeof args !== "object" || Array.isArray(args)) {
		throw new Error("Scenario arguments must be a JSON object");
	}
	return { scenario, args };
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
		process.stderr.write(`aws-classes-child: ${error.message}\n`);
		process.exitCode = 2;
		return;
	}

	const { scenario, args } = invocation;
	// A synchronous throw escapes to Node's default handler on purpose; v2-entry relies on it
	const outcome = SCENARIOS[scenario](args);
	Promise.resolve(outcome).then(
		(result) => report({ scenario, ...result }),
		(error) => {
			process.stderr.write(`aws-classes-child: ${scenario} failed: ${error?.stack ?? error}\n`);
			process.exitCode = 1;
		}
	);
}

main();
