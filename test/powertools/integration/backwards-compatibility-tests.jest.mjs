/**
 * Backwards Compatibility Integration Tests
 * 
 * Validates that the v1.3.15 Powertools integration does not break any existing
 * behavior from v1.3.14. When CACHE_DATA_POWERTOOLS=false or no Powertools packages
 * are installed, the package must behave identically to v1.3.14.
 * 
 * Uses subprocess isolation (execFileSync with node) for tests that need a clean
 * module state with CACHE_DATA_POWERTOOLS=false.
 * 
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 * 
 * @module test/powertools/integration/backwards-compatibility-tests
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../../..");

/**
 * Helper to run a script in a subprocess with a clean module state.
 * Uses execFileSync to prevent shell injection.
 * 
 * @param {string} script - The inline script to execute
 * @param {Object} [env={}] - Additional environment variables
 * @returns {string} stdout output
 */
function runInSubprocess(script, env = {}) {
	// >! Use execFileSync to prevent shell interpretation
	const result = execFileSync("node", ["--input-type=module", "-e", script], {
		cwd: PROJECT_ROOT,
		encoding: "utf8",
		timeout: 15000,
		env: {
			...process.env,
			CACHE_DATA_POWERTOOLS: "false",
			// Clear all individual capability flags
			CACHE_DATA_POWERTOOLS_TRACER: undefined,
			CACHE_DATA_POWERTOOLS_LOGGER: undefined,
			CACHE_DATA_POWERTOOLS_METRICS: undefined,
			...env
		},
		stdio: ["pipe", "pipe", "pipe"]
	});
	return result;
}

describe("Backwards Compatibility Integration Tests", () => {

	describe("1. CACHE_DATA_POWERTOOLS=false behaves identically to v1.3.14", () => {

		it("should load the package without errors when Powertools is disabled", () => {
			const script = `
				const pkg = require("./src/index.js");
				if (!pkg.tools || !pkg.cache || !pkg.endpoint) {
					process.exit(1);
				}
				console.log("OK");
			`;
			// >! Use execFileSync to prevent shell interpretation
			const result = execFileSync("node", ["-e", script], {
				cwd: PROJECT_ROOT,
				encoding: "utf8",
				timeout: 15000,
				env: {
					...process.env,
					CACHE_DATA_POWERTOOLS: "false"
				},
				stdio: ["pipe", "pipe", "pipe"]
			});
			expect(result.trim()).toBe("OK");
		});

		it("should have all Powertools capabilities disabled when CACHE_DATA_POWERTOOLS=false", () => {
			const script = `
				process.env.CACHE_DATA_POWERTOOLS = "false";
				const { TestHarness } = require("./src/lib/tools/PowertoolsInit.js");
				const { resetForTesting } = TestHarness.getInternals();
				resetForTesting();
				const { initPowertools, getState } = require("./src/lib/tools/PowertoolsInit.js");
				initPowertools();
				const state = getState();
				if (state.tracer === true || state.logger === true || state.metrics === true) {
					console.log(JSON.stringify(state));
					process.exit(1);
				}
				console.log("OK");
			`;
			// >! Use execFileSync to prevent shell interpretation
			const result = execFileSync("node", ["-e", script], {
				cwd: PROJECT_ROOT,
				encoding: "utf8",
				timeout: 15000,
				env: {
					...process.env,
					CACHE_DATA_POWERTOOLS: "false"
				},
				stdio: ["pipe", "pipe", "pipe"]
			});
			expect(result.trim()).toBe("OK");
		});

		it("should not produce structured JSON log output when Powertools is disabled", () => {
			const script = `
				process.env.CACHE_DATA_POWERTOOLS = "false";
				const { TestHarness } = require("./src/lib/tools/PowertoolsInit.js");
				const { resetForTesting } = TestHarness.getInternals();
				resetForTesting();
				const { initPowertools, getLoggerBridge } = require("./src/lib/tools/PowertoolsInit.js");
				initPowertools();
				const bridge = getLoggerBridge();
				// When disabled, logger bridge should be null or inactive
				if (bridge !== null && bridge.isActive) {
					process.exit(1);
				}
				console.log("OK");
			`;
			// >! Use execFileSync to prevent shell interpretation
			const result = execFileSync("node", ["-e", script], {
				cwd: PROJECT_ROOT,
				encoding: "utf8",
				timeout: 15000,
				env: {
					...process.env,
					CACHE_DATA_POWERTOOLS: "false"
				},
				stdio: ["pipe", "pipe", "pipe"]
			});
			expect(result.trim()).toBe("OK");
		});
	});

	describe("2. All existing exports from src/index.js are present", () => {

		let pkg;

		beforeAll(async () => {
			pkg = await import(resolve(PROJECT_ROOT, "src/index.js"));
			// Handle default export for ESM
			pkg = pkg.default || pkg;
		});

		it("should export tools module", () => {
			expect(pkg.tools).toBeDefined();
			expect(typeof pkg.tools).toBe("object");
		});

		it("should export cache module", () => {
			expect(pkg.cache).toBeDefined();
			expect(typeof pkg.cache).toBe("object");
		});

		it("should export endpoint module", () => {
			expect(pkg.endpoint).toBeDefined();
			expect(typeof pkg.endpoint).toBe("object");
		});

		it("should export Cache class from cache module", () => {
			expect(pkg.cache.Cache).toBeDefined();
			expect(typeof pkg.cache.Cache).toBe("function");
		});

		it("should export CacheableDataAccess from cache module", () => {
			expect(pkg.cache.CacheableDataAccess).toBeDefined();
			expect(typeof pkg.cache.CacheableDataAccess).toBe("function");
		});

		it("should export send function from endpoint module", () => {
			expect(pkg.endpoint.send).toBeDefined();
			expect(typeof pkg.endpoint.send).toBe("function");
		});

		it("should export get function from endpoint module (deprecated)", () => {
			expect(pkg.endpoint.get).toBeDefined();
			expect(typeof pkg.endpoint.get).toBe("function");
		});

		it("should export getDataDirectFromURI from endpoint module (deprecated)", () => {
			expect(pkg.endpoint.getDataDirectFromURI).toBeDefined();
			expect(typeof pkg.endpoint.getDataDirectFromURI).toBe("function");
		});
	});

	describe("3. All existing tools exports are present", () => {

		let tools;

		beforeAll(async () => {
			const pkg = await import(resolve(PROJECT_ROOT, "src/index.js"));
			tools = (pkg.default || pkg).tools;
		});

		it("should export AWS class", () => {
			expect(tools.AWS).toBeDefined();
		});

		it("should export DebugAndLog class", () => {
			expect(tools.DebugAndLog).toBeDefined();
			expect(typeof tools.DebugAndLog).toBe("function");
		});

		it("should export Timer class", () => {
			expect(tools.Timer).toBeDefined();
			expect(typeof tools.Timer).toBe("function");
		});

		it("should export Response class", () => {
			expect(tools.Response).toBeDefined();
			expect(typeof tools.Response).toBe("function");
		});

		it("should export ApiRequest class", () => {
			expect(tools.ApiRequest).toBeDefined();
			expect(typeof tools.ApiRequest).toBe("function");
		});

		it("should export ClientRequest class", () => {
			expect(tools.ClientRequest).toBeDefined();
			expect(typeof tools.ClientRequest).toBe("function");
		});

		it("should export RequestInfo class", () => {
			expect(tools.RequestInfo).toBeDefined();
			expect(typeof tools.RequestInfo).toBe("function");
		});

		it("should export ResponseDataModel class", () => {
			expect(tools.ResponseDataModel).toBeDefined();
			expect(typeof tools.ResponseDataModel).toBe("function");
		});

		it("should export ImmutableObject class", () => {
			expect(tools.ImmutableObject).toBeDefined();
			expect(typeof tools.ImmutableObject).toBe("function");
		});

		it("should export AppConfig class", () => {
			expect(tools.AppConfig).toBeDefined();
			expect(typeof tools.AppConfig).toBe("function");
		});

		it("should export Connection class", () => {
			expect(tools.Connection).toBeDefined();
			expect(typeof tools.Connection).toBe("function");
		});

		it("should export Connections class", () => {
			expect(tools.Connections).toBeDefined();
			expect(typeof tools.Connections).toBe("function");
		});

		it("should export ConnectionRequest class", () => {
			expect(tools.ConnectionRequest).toBeDefined();
			expect(typeof tools.ConnectionRequest).toBe("function");
		});

		it("should export ConnectionAuthentication class", () => {
			expect(tools.ConnectionAuthentication).toBeDefined();
			expect(typeof tools.ConnectionAuthentication).toBe("function");
		});

		it("should export CachedSsmParameter class", () => {
			expect(tools.CachedSsmParameter).toBeDefined();
			expect(typeof tools.CachedSsmParameter).toBe("function");
		});

		it("should export CachedSecret class", () => {
			expect(tools.CachedSecret).toBeDefined();
			expect(typeof tools.CachedSecret).toBe("function");
		});

		it("should export CachedParameterSecret class", () => {
			expect(tools.CachedParameterSecret).toBeDefined();
			expect(typeof tools.CachedParameterSecret).toBe("function");
		});

		it("should export CachedParameterSecrets class", () => {
			expect(tools.CachedParameterSecrets).toBeDefined();
			expect(typeof tools.CachedParameterSecrets).toBe("function");
		});

		it("should export AWSXRay", () => {
			expect(tools.AWSXRay).toBeDefined();
		});

		it("should export generic response modules", () => {
			expect(tools.jsonGenericResponse).toBeDefined();
			expect(tools.htmlGenericResponse).toBeDefined();
			expect(tools.xmlGenericResponse).toBeDefined();
			expect(tools.rssGenericResponse).toBeDefined();
			expect(tools.textGenericResponse).toBeDefined();
		});

		it("should export utility functions", () => {
			expect(typeof tools.printMsg).toBe("function");
			expect(typeof tools.sanitize).toBe("function");
			expect(typeof tools.obfuscate).toBe("function");
			expect(typeof tools.hashThisData).toBe("function");
		});

		it("should export node version info", () => {
			expect(tools.nodeVer).toBeDefined();
			expect(tools.nodeVerMajor).toBeDefined();
			expect(tools.nodeVerMinor).toBeDefined();
			expect(tools.nodeVerMajorMinor).toBeDefined();
		});

		it("should export flushMetrics function", () => {
			expect(typeof tools.flushMetrics).toBe("function");
		});
	});

	describe("4. All existing environment variables still work", () => {

		it("should respect CacheData_AWSXRayOn environment variable", () => {
			const script = `
				process.env.CACHE_DATA_POWERTOOLS = "false";
				process.env.CacheData_AWSXRayOn = "true";
				const { TestHarness } = require("./src/lib/tools/PowertoolsInit.js");
				const { resetForTesting } = TestHarness.getInternals();
				resetForTesting();
				const { initPowertools, getActiveTracingProvider } = require("./src/lib/tools/PowertoolsInit.js");
				initPowertools();
				const provider = getActiveTracingProvider();
				// When Powertools is disabled but XRay is on, should use RawXRayProvider
				if (!provider || provider.constructor.name === "NoOpTracingProvider") {
					console.log("FAIL: Expected RawXRayProvider, got " + (provider ? provider.constructor.name : "null"));
					process.exit(1);
				}
				console.log("OK");
			`;
			// >! Use execFileSync to prevent shell interpretation
			const result = execFileSync("node", ["-e", script], {
				cwd: PROJECT_ROOT,
				encoding: "utf8",
				timeout: 15000,
				env: {
					...process.env,
					CACHE_DATA_POWERTOOLS: "false",
					CacheData_AWSXRayOn: "true"
				},
				stdio: ["pipe", "pipe", "pipe"]
			});
			expect(result.trim()).toBe("OK");
		});

		it("should respect CACHE_DATA_AWS_X_RAY_ON environment variable", () => {
			const script = `
				process.env.CACHE_DATA_POWERTOOLS = "false";
				process.env.CACHE_DATA_AWS_X_RAY_ON = "true";
				const { TestHarness } = require("./src/lib/tools/PowertoolsInit.js");
				const { resetForTesting } = TestHarness.getInternals();
				resetForTesting();
				const { initPowertools, getActiveTracingProvider } = require("./src/lib/tools/PowertoolsInit.js");
				initPowertools();
				const provider = getActiveTracingProvider();
				if (!provider || provider.constructor.name === "NoOpTracingProvider") {
					console.log("FAIL: Expected RawXRayProvider, got " + (provider ? provider.constructor.name : "null"));
					process.exit(1);
				}
				console.log("OK");
			`;
			// >! Use execFileSync to prevent shell interpretation
			const result = execFileSync("node", ["-e", script], {
				cwd: PROJECT_ROOT,
				encoding: "utf8",
				timeout: 15000,
				env: {
					...process.env,
					CACHE_DATA_POWERTOOLS: "false",
					CACHE_DATA_AWS_X_RAY_ON: "true"
				},
				stdio: ["pipe", "pipe", "pipe"]
			});
			expect(result.trim()).toBe("OK");
		});

		it("should disable tracing when neither XRay env var is set and Powertools is disabled", () => {
			const script = `
				process.env.CACHE_DATA_POWERTOOLS = "false";
				delete process.env.CacheData_AWSXRayOn;
				delete process.env.CACHE_DATA_AWS_X_RAY_ON;
				const { TestHarness } = require("./src/lib/tools/PowertoolsInit.js");
				const { resetForTesting } = TestHarness.getInternals();
				resetForTesting();
				const { initPowertools, getActiveTracingProvider } = require("./src/lib/tools/PowertoolsInit.js");
				initPowertools();
				const provider = getActiveTracingProvider();
				if (!provider || provider.constructor.name !== "NoOpTracingProvider") {
					console.log("FAIL: Expected NoOpTracingProvider, got " + (provider ? provider.constructor.name : "null"));
					process.exit(1);
				}
				console.log("OK");
			`;
			// >! Use execFileSync to prevent shell interpretation
			const result = execFileSync("node", ["-e", script], {
				cwd: PROJECT_ROOT,
				encoding: "utf8",
				timeout: 15000,
				env: {
					...process.env,
					CACHE_DATA_POWERTOOLS: "false",
					CacheData_AWSXRayOn: undefined,
					CACHE_DATA_AWS_X_RAY_ON: undefined
				},
				stdio: ["pipe", "pipe", "pipe"]
			});
			expect(result.trim()).toBe("OK");
		});

		it("should respect POWERTOOLS_SERVICE_NAME for service name configuration", () => {
			const script = `
				process.env.CACHE_DATA_POWERTOOLS = "false";
				process.env.POWERTOOLS_SERVICE_NAME = "my-custom-service";
				const { TestHarness } = require("./src/lib/tools/PowertoolsInit.js");
				const { resetForTesting } = TestHarness.getInternals();
				resetForTesting();
				const { initPowertools } = require("./src/lib/tools/PowertoolsInit.js");
				// Should not throw even with service name set
				initPowertools();
				console.log("OK");
			`;
			// >! Use execFileSync to prevent shell interpretation
			const result = execFileSync("node", ["-e", script], {
				cwd: PROJECT_ROOT,
				encoding: "utf8",
				timeout: 15000,
				env: {
					...process.env,
					CACHE_DATA_POWERTOOLS: "false",
					POWERTOOLS_SERVICE_NAME: "my-custom-service"
				},
				stdio: ["pipe", "pipe", "pipe"]
			});
			expect(result.trim()).toBe("OK");
		});
	});

	describe("5. No new required dependencies in package.json", () => {

		let packageJson;

		beforeAll(() => {
			const content = readFileSync(resolve(PROJECT_ROOT, "package.json"), "utf8");
			packageJson = JSON.parse(content);
		});

		it("should only have moment-timezone and object-hash as required dependencies", () => {
			const deps = Object.keys(packageJson.dependencies || {});
			// These are the only allowed required dependencies (same as v1.3.14)
			const allowedDeps = ["moment-timezone", "object-hash"];
			for (const dep of deps) {
				expect(allowedDeps).toContain(dep);
			}
		});

		it("should not have Powertools packages in required dependencies", () => {
			const deps = Object.keys(packageJson.dependencies || {});
			expect(deps).not.toContain("@aws-lambda-powertools/tracer");
			expect(deps).not.toContain("@aws-lambda-powertools/logger");
			expect(deps).not.toContain("@aws-lambda-powertools/metrics");
		});

		it("should have Powertools packages only as optional peerDependencies", () => {
			const peerDeps = Object.keys(packageJson.peerDependencies || {});
			expect(peerDeps).toContain("@aws-lambda-powertools/tracer");
			expect(peerDeps).toContain("@aws-lambda-powertools/logger");
			expect(peerDeps).toContain("@aws-lambda-powertools/metrics");
		});
	});

	describe("6. peerDependenciesMeta marks Powertools as optional", () => {

		let packageJson;

		beforeAll(() => {
			const content = readFileSync(resolve(PROJECT_ROOT, "package.json"), "utf8");
			packageJson = JSON.parse(content);
		});

		it("should have peerDependenciesMeta section", () => {
			expect(packageJson.peerDependenciesMeta).toBeDefined();
			expect(typeof packageJson.peerDependenciesMeta).toBe("object");
		});

		it("should mark @aws-lambda-powertools/tracer as optional", () => {
			expect(packageJson.peerDependenciesMeta["@aws-lambda-powertools/tracer"]).toBeDefined();
			expect(packageJson.peerDependenciesMeta["@aws-lambda-powertools/tracer"].optional).toBe(true);
		});

		it("should mark @aws-lambda-powertools/logger as optional", () => {
			expect(packageJson.peerDependenciesMeta["@aws-lambda-powertools/logger"]).toBeDefined();
			expect(packageJson.peerDependenciesMeta["@aws-lambda-powertools/logger"].optional).toBe(true);
		});

		it("should mark @aws-lambda-powertools/metrics as optional", () => {
			expect(packageJson.peerDependenciesMeta["@aws-lambda-powertools/metrics"]).toBeDefined();
			expect(packageJson.peerDependenciesMeta["@aws-lambda-powertools/metrics"].optional).toBe(true);
		});

		it("should have version range ^2.0.0 for all Powertools peerDependencies", () => {
			expect(packageJson.peerDependencies["@aws-lambda-powertools/tracer"]).toBe("^2.0.0");
			expect(packageJson.peerDependencies["@aws-lambda-powertools/logger"]).toBe("^2.0.0");
			expect(packageJson.peerDependencies["@aws-lambda-powertools/metrics"]).toBe("^2.0.0");
		});
	});

	describe("7. All deprecated aliases still exported", () => {

		let tools;

		beforeAll(async () => {
			const pkg = await import(resolve(PROJECT_ROOT, "src/index.js"));
			tools = (pkg.default || pkg).tools;
		});

		it("should export APIRequest as alias for ApiRequest", () => {
			expect(tools.APIRequest).toBeDefined();
			expect(tools.APIRequest).toBe(tools.ApiRequest);
		});

		it("should export _ConfigSuperClass as alias for AppConfig", () => {
			expect(tools._ConfigSuperClass).toBeDefined();
			expect(tools._ConfigSuperClass).toBe(tools.AppConfig);
		});

		it("should export CachedSSMParameter as alias for CachedSsmParameter", () => {
			expect(tools.CachedSSMParameter).toBeDefined();
			expect(tools.CachedSSMParameter).toBe(tools.CachedSsmParameter);
		});

		it("should export Aws as alias for AWS", () => {
			expect(tools.Aws).toBeDefined();
			expect(tools.Aws).toBe(tools.AWS);
		});

		it("should export AwsXRay as alias for AWSXRay", () => {
			expect(tools.AwsXRay).toBeDefined();
			expect(tools.AwsXRay).toBe(tools.AWSXRay);
		});
	});
});
