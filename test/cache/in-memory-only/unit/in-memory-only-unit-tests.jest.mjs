import { describe, it, expect } from "@jest/globals";
import { execSync } from "child_process";
import path from "path";

/* ****************************************************************************
 *	In-Memory Only Cache Mode - Unit Tests
 *	Tests for Cache.init() inMemoryOnly activation behavior.
 *	Each test runs in a subprocess for isolation since Cache.init() is a singleton.
 *
 *	Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 5.1, 5.2, 9.1, 9.2, 9.3
 */

const projectRoot = path.resolve(process.cwd());
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

/**
 * Helper to run a test script in a subprocess.
 * The script should call process.exit(0) on success, process.exit(1) on failure.
 * @param {string} testScript - The inline module script to execute
 * @param {Object} [env] - Additional environment variables to set
 */
function runIsolatedTest(testScript, env = {}) {
	const envVars = {
		...process.env,
		AWS_REGION,
		...env
	};
	// Remove env vars that could interfere unless explicitly set
	if (!("CACHE_IN_MEMORY_ONLY" in env)) {
		delete envVars.CACHE_IN_MEMORY_ONLY;
	}
	execSync(`node --input-type=module -e '${testScript}'`, {
		cwd: projectRoot,
		stdio: "pipe",
		env: envVars,
		timeout: 15000
	});
}

describe("Cache.init() inMemoryOnly activation", () => {

	describe("Requirement 1.1, 9.1: inMemoryOnly: true activates mode", () => {

		it("should activate in-memory-only mode with inMemoryOnly: true without requiring secureDataKey", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({ inMemoryOnly: true });
				const info = Cache.info();
				if (!info.useInMemoryCache) {
					console.error("useInMemoryCache not true in info()");
					process.exit(1);
				}
				if (!info.inMemoryCache) {
					console.error("inMemoryCache not present in info()");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

	});

	describe("Requirement 9.2: String coercion via Cache.bool()", () => {

		it("should activate in-memory-only mode with inMemoryOnly: 'true'", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({ inMemoryOnly: "true" });
				const info = Cache.info();
				if (!info.useInMemoryCache) {
					console.error("inMemoryOnly not activated with string true");
					process.exit(1);
				}
				if (!info.inMemoryCache) {
					console.error("inMemoryCache not present");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

		it("should activate in-memory-only mode with inMemoryOnly: '1'", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({ inMemoryOnly: "1" });
				const info = Cache.info();
				if (!info.useInMemoryCache) {
					console.error("inMemoryOnly not activated with string 1");
					process.exit(1);
				}
				if (!info.inMemoryCache) {
					console.error("inMemoryCache not present");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

	});

	describe("Requirement 1.2: CACHE_IN_MEMORY_ONLY env var activates mode", () => {

		it("should activate in-memory-only mode via CACHE_IN_MEMORY_ONLY=true env var when parameter not provided", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({});
				const info = Cache.info();
				if (!info.useInMemoryCache) {
					console.error("inMemoryOnly not activated via env var");
					process.exit(1);
				}
				if (!info.inMemoryCache) {
					console.error("inMemoryCache not present");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript, { CACHE_IN_MEMORY_ONLY: "true" });
		});

		it("should activate in-memory-only mode via CACHE_IN_MEMORY_ONLY=1 env var", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({});
				const info = Cache.info();
				if (!info.useInMemoryCache) {
					console.error("inMemoryOnly not activated via env var 1");
					process.exit(1);
				}
				if (!info.inMemoryCache) {
					console.error("inMemoryCache not present");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript, { CACHE_IN_MEMORY_ONLY: "1" });
		});

	});

	describe("Requirement 1.3: Parameter takes precedence over env var", () => {

		it("should use parameter value true even when env var is false", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({ inMemoryOnly: true });
				const info = Cache.info();
				if (!info.useInMemoryCache) {
					console.error("Parameter true did not take precedence over env var false");
					process.exit(1);
				}
				if (!info.inMemoryCache) {
					console.error("inMemoryCache not present");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript, { CACHE_IN_MEMORY_ONLY: "false" });
		});

		it("should use env var when parameter is not provided in init", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({});
				const info = Cache.info();
				if (!info.useInMemoryCache) {
					console.error("Env var did not activate mode when param not provided");
					process.exit(1);
				}
				if (!info.inMemoryCache) {
					console.error("inMemoryCache not present");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript, { CACHE_IN_MEMORY_ONLY: "true" });
		});

	});

	describe("Requirement 5.1, 5.2: useInMemoryCache override", () => {

		it("should override useInMemoryCache: false when inMemoryOnly: true", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({ inMemoryOnly: true, useInMemoryCache: false });
				const info = Cache.info();
				if (!info.useInMemoryCache) {
					console.error("useInMemoryCache was not forced to true by inMemoryOnly");
					process.exit(1);
				}
				if (!info.inMemoryCache) {
					console.error("inMemoryCache object not present in info");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

	});

	describe("Requirement 5.3: InMemoryCache configuration parameters passed through", () => {

		it("should pass inMemoryCacheMaxEntries to InMemoryCache", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({
					inMemoryOnly: true,
					inMemoryCacheMaxEntries: 500
				});
				const info = Cache.info();
				if (!info.inMemoryCache) {
					console.error("inMemoryCache not present in info");
					process.exit(1);
				}
				if (info.inMemoryCache.maxEntries !== 500) {
					console.error("maxEntries not passed through, got: " + info.inMemoryCache.maxEntries);
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

		it("should pass inMemoryCacheDefaultMaxEntries to InMemoryCache", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({
					inMemoryOnly: true,
					inMemoryCacheDefaultMaxEntries: 200
				});
				const info = Cache.info();
				if (!info.inMemoryCache) {
					console.error("inMemoryCache not present in info");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

	});

	describe("Requirement 12.3: Debug log message emitted on activation", () => {

		it("should emit debug log message when in-memory-only mode is activated", () => {
			const testScript = `
				const toolsModule = await import("./src/lib/tools/index.js");
				const tools = toolsModule.default;
				let debugMessages = [];
				const originalDebug = tools.DebugAndLog.debug;
				tools.DebugAndLog.debug = function(msg) {
					debugMessages.push(msg);
				};
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({ inMemoryOnly: true });
				tools.DebugAndLog.debug = originalDebug;
				const found = debugMessages.some(m => m.includes("In-memory only cache mode activated"));
				if (!found) {
					console.error("Expected debug message not found, got: " + JSON.stringify(debugMessages));
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

	});

	describe("Requirement 2.1, 2.2, 2.3: Relaxed initialization", () => {

		it("should not require secureDataKey when inMemoryOnly is true", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				try {
					Cache.init({ inMemoryOnly: true });
					process.exit(0);
				} catch (error) {
					console.error("Threw error: " + error.message);
					process.exit(1);
				}
			`;
			runIsolatedTest(testScript);
		});

		it("should not require dynamoDbTable when inMemoryOnly is true", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				try {
					Cache.init({ inMemoryOnly: true });
					const info = Cache.info();
					process.exit(0);
				} catch (error) {
					console.error("Threw error: " + error.message);
					process.exit(1);
				}
			`;
			runIsolatedTest(testScript);
		});

		it("should not require s3Bucket when inMemoryOnly is true", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				try {
					Cache.init({ inMemoryOnly: true });
					const info = Cache.info();
					process.exit(0);
				} catch (error) {
					console.error("Threw error: " + error.message);
					process.exit(1);
				}
			`;
			runIsolatedTest(testScript);
		});

	});

	describe("Requirement 9.3: Falsy values do not activate mode", () => {

		it("should not activate in-memory-only mode with inMemoryOnly: false", () => {
			const testScript = `
				import { randomBytes } from "crypto";
				const { Cache } = await import("./src/lib/dao-cache.js");
				const testKey = randomBytes(32).toString("hex");
				const dataKey = Buffer.from(testKey, "hex");
				Cache.init({
					inMemoryOnly: false,
					dynamoDbTable: "test-table",
					s3Bucket: "test-bucket",
					secureDataKey: dataKey
				});
				const info = Cache.info();
				if (info.dynamoDbTable !== "test-table") {
					console.error("Normal init did not set dynamoDbTable");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

		it("should not activate in-memory-only mode when inMemoryOnly is not provided", () => {
			const testScript = `
				import { randomBytes } from "crypto";
				const { Cache } = await import("./src/lib/dao-cache.js");
				const testKey = randomBytes(32).toString("hex");
				const dataKey = Buffer.from(testKey, "hex");
				Cache.init({
					dynamoDbTable: "test-table",
					s3Bucket: "test-bucket",
					secureDataKey: dataKey
				});
				const info = Cache.info();
				if (info.dynamoDbTable !== "test-table") {
					console.error("Normal init did not set dynamoDbTable");
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

	});

});


/* ****************************************************************************
 *	Cache.info() inMemoryOnly Exposure - Unit Tests
 *	Tests for Cache.info() returning correct inMemoryOnly status.
 *	Each test runs in a subprocess for isolation since Cache.init() is a singleton.
 *
 *	Requirements: 6.1, 6.2, 6.3
 */

describe("Cache.info() inMemoryOnly exposure", () => {

	describe("Requirement 6.3: info() returns inMemoryOnly: false when mode not activated", () => {

		it("should return inMemoryOnly: false when initialized without inMemoryOnly", () => {
			const testScript = `
				import { randomBytes } from "crypto";
				const { Cache } = await import("./src/lib/dao-cache.js");
				const testKey = randomBytes(32).toString("hex");
				const dataKey = Buffer.from(testKey, "hex");
				Cache.init({
					dynamoDbTable: "test-table",
					s3Bucket: "test-bucket",
					secureDataKey: dataKey
				});
				const info = Cache.info();
				if (info.inMemoryOnly !== false) {
					console.error("Expected inMemoryOnly to be false, got: " + info.inMemoryOnly);
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

		it("should return inMemoryOnly: false when inMemoryOnly is explicitly false", () => {
			const testScript = `
				import { randomBytes } from "crypto";
				const { Cache } = await import("./src/lib/dao-cache.js");
				const testKey = randomBytes(32).toString("hex");
				const dataKey = Buffer.from(testKey, "hex");
				Cache.init({
					inMemoryOnly: false,
					dynamoDbTable: "test-table",
					s3Bucket: "test-bucket",
					secureDataKey: dataKey
				});
				const info = Cache.info();
				if (info.inMemoryOnly !== false) {
					console.error("Expected inMemoryOnly to be false, got: " + info.inMemoryOnly);
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

	});

	describe("Requirement 6.2: info() returns inMemoryOnly: true when mode is activated", () => {

		it("should return inMemoryOnly: true when initialized with inMemoryOnly: true", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({ inMemoryOnly: true });
				const info = Cache.info();
				if (info.inMemoryOnly !== true) {
					console.error("Expected inMemoryOnly to be true, got: " + info.inMemoryOnly);
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

	});

	describe("Requirement 6.1, 6.2: info() includes useInMemoryCache and inMemoryCache when mode is active", () => {

		it("should include useInMemoryCache: true and inMemoryCache object when inMemoryOnly mode is active", () => {
			const testScript = `
				const { Cache } = await import("./src/lib/dao-cache.js");
				Cache.init({ inMemoryOnly: true });
				const info = Cache.info();
				if (info.useInMemoryCache !== true) {
					console.error("Expected useInMemoryCache to be true, got: " + info.useInMemoryCache);
					process.exit(1);
				}
				if (!info.inMemoryCache || typeof info.inMemoryCache !== "object") {
					console.error("Expected inMemoryCache to be an object, got: " + JSON.stringify(info.inMemoryCache));
					process.exit(1);
				}
				if (info.inMemoryOnly !== true) {
					console.error("Expected inMemoryOnly to be true, got: " + info.inMemoryOnly);
					process.exit(1);
				}
				process.exit(0);
			`;
			runIsolatedTest(testScript);
		});

	});

});
