/**
 * X-Ray load-time tests (child processes).
 *
 * Purpose: verify what the package exports for X-Ray immediately after it loads,
 * without reading any service accessor. `tools.AWSXRay`, `tools.AwsXRay`, and the
 * binding `ApiRequest.class.js` captures are copies made at load, so a regression
 * here silently disables tracing. The first block is preservation: it passes on
 * the eager implementation and must keep passing after the lazy conversion. The
 * second block is new behavior (task 4.3): X-Ray initializes at load without
 * building any client, and each client is instrumented on its first read. It
 * fails on the eager implementation, except the X-Ray-off case.
 *
 * Setup: each test runs a scenario of test/tools/fixtures/aws-classes-child.cjs in
 * a fresh Node.js process, because module caching makes load-time behavior
 * unobservable in process. The runner removes both X-Ray variables from the child
 * environment unless a test sets one.
 *
 * Requirement 5.7 is checked through export identity: ApiRequest.class.js
 * destructures AWSXRay from the same module.exports object, so
 * `classesExportsIdentical` covers the value it receives.
 *
 * Spec: .kiro/specs/1-4-0-convert-aws-to-lazy-accessors (tasks 3.2 and 4.3)
 * Validates: Requirements 1.3, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 8.1
 *
 * Related tests:
 * - test/tools/aws-lazy-loading-tests.jest.mjs
 * - test/powertools/integration/backwards-compatibility-tests.jest.mjs
 */

import { describe, it, expect } from "@jest/globals";
import { runChild } from "../helpers/aws-classes-child-runner.mjs";

/** Timeout for each child-process test; the child itself times out at 20 seconds. */
const CHILD_TEST_TIMEOUT_MS = 60000;

/** The exports of AWS.classes.js, sorted (Requirement 8.1). */
const EXPORT_NAMES = ["AWS", "AWSXRay", "Aws", "AwsXRay"];

/**
 * Run the xray-exports scenario and assert the entry loaded.
 *
 * @param {Object.<string, string|undefined>} env - Child environment overrides
 * @param {{blockXray?: boolean}} [args={}] - Scenario arguments
 * @returns {Object} The scenario result
 */
function runXrayExports(env, args = {}) {
	const run = runChild("xray-exports", args, { env });
	expect(run.status).toBe(0);
	expect(run.result).not.toBeNull();
	expect(run.result.entryLoaded).toBe(true);
	return run.result;
}

describe("X-Ray at module load: exports (preservation)", () => {

	describe.each([
		["CACHE_DATA_AWS_X_RAY_ON"],
		["CacheData_AWSXRayOn"]
	])("with %s=true", (variable) => {
		it("exports the initialized aws-xray-sdk-core object from every binding (Req 5.2, 5.3, 5.7)", () => {
			const result = runXrayExports({ [variable]: "true" });

			expect(result.xrayEnv[variable]).toBe("true");
			expect(result.xraySdkLoaded).toBe(true);
			expect(result.awsXRayIsNull).toBe(false);
			expect(result.hasCaptureAWSv3Client).toBe(true);
			expect(result.aliasIdentical).toBe(true);
			expect(result.getterIdentical).toBe(true);
			expect(result.classesExportsIdentical).toBe(true);
			expect(result.classesExportNames).toEqual(EXPORT_NAMES);
		}, CHILD_TEST_TIMEOUT_MS);
	});

	it("exports null from every binding and never loads aws-xray-sdk-core when X-Ray is off (Req 5.4)", () => {
		const result = runXrayExports({});

		expect(result.xrayEnv).toEqual({ CacheData_AWSXRayOn: null, CACHE_DATA_AWS_X_RAY_ON: null });
		expect(result.xraySdkLoaded).toBe(false);
		expect(result.awsXRayIsNull).toBe(true);
		expect(result.aliasIdentical).toBe(true);
		expect(result.getterIdentical).toBe(true);
		expect(result.classesExportsIdentical).toBe(true);
		expect(result.classesExportNames).toEqual(EXPORT_NAMES);
	}, CHILD_TEST_TIMEOUT_MS);

	it("loads without throwing and exports null when aws-xray-sdk-core can't be loaded (Req 5.5)", () => {
		const result = runXrayExports({ CACHE_DATA_AWS_X_RAY_ON: "true" }, { blockXray: true });

		expect(result.xrayEnv.CACHE_DATA_AWS_X_RAY_ON).toBe("true");
		expect(result.xraySdkLoaded).toBe(false);
		expect(result.awsXRayIsNull).toBe(true);
		expect(result.aliasIdentical).toBe(true);
		expect(result.getterIdentical).toBe(true);
		expect(result.classesExportsIdentical).toBe(true);
		expect(result.classesExportNames).toEqual(EXPORT_NAMES);
	}, CHILD_TEST_TIMEOUT_MS);
});

describe("X-Ray at module load: lazy clients (new behavior)", () => {

	/**
	 * Run the xray-counts scenario and assert the entry loaded.
	 *
	 * @param {Object.<string, string|undefined>} env - Child environment overrides
	 * @returns {Object} The scenario result
	 */
	function runXrayCounts(env) {
		const run = runChild("xray-counts", {}, { env });
		expect(run.status).toBe(0);
		expect(run.result).not.toBeNull();
		expect(run.result.entryLoaded).toBe(true);
		return run.result;
	}

	it("initializes X-Ray at import without loading any service-client package (Req 1.3, 5.1)", () => {
		const result = runXrayExports({ CACHE_DATA_AWS_X_RAY_ON: "true" });

		expect(result.awsXRayIsNull).toBe(false);
		expect(result.servicePackagesLoaded).toEqual([]);
	}, CHILD_TEST_TIMEOUT_MS);

	it("captures HTTP once at import and instruments each client once, at its first read (Req 4.6, 5.6)", () => {
		const result = runXrayCounts({ CACHE_DATA_AWS_X_RAY_ON: "true" });

		expect(result.xrayEnv.CACHE_DATA_AWS_X_RAY_ON).toBe("true");
		expect(result.afterLoad).toEqual({ captureHTTPsGlobal: 2, captureAWSv3Client: 0 });
		expect(result.afterXRayReads).toEqual({ captureHTTPsGlobal: 2, captureAWSv3Client: 0 });
		expect(result.afterS3).toEqual({ captureHTTPsGlobal: 2, captureAWSv3Client: 1 });
		expect(result.afterDynamo).toEqual({ captureHTTPsGlobal: 2, captureAWSv3Client: 2 });
		expect(result.s3HasXRayMiddleware).toBe(true);
		expect(result.dynamoHasXRayMiddleware).toBe(true);
	}, CHILD_TEST_TIMEOUT_MS);

	it("captures and instruments nothing when X-Ray is off", () => {
		const result = runXrayCounts({});

		expect(result.xrayEnv).toEqual({ CacheData_AWSXRayOn: null, CACHE_DATA_AWS_X_RAY_ON: null });
		expect(result.afterDynamo).toEqual({ captureHTTPsGlobal: 0, captureAWSv3Client: 0 });
		expect(result.s3HasXRayMiddleware).toBe(false);
		expect(result.dynamoHasXRayMiddleware).toBe(false);
	}, CHILD_TEST_TIMEOUT_MS);
});
