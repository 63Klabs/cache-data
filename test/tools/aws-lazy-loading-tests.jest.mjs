/**
 * Lazy loading tests (child processes).
 *
 * Purpose: verify the behavior that changes when `AWS.dynamo`, `AWS.s3`, and
 * `AWS.ssm` become lazy: no service-client package loads at import, each loads on
 * its accessor's first read, the region is read at first construction, clients
 * are instrumented by the tracing provider active at first read, the SDK v2 guard
 * moves into the accessors, and a missing package fails only its own service.
 * These are new-behavior tests: they fail on the eager implementation and must
 * pass after the conversion (tasks 4.5 and 7.1).
 *
 * Setup: each test runs a scenario of test/tools/fixtures/aws-classes-child.cjs in
 * a fresh Node.js process, because module caching makes load-time behavior
 * unobservable in process. The runner starts the child with both X-Ray variables
 * removed and AWS_REGION=us-east-1; tests override what they need.
 *
 * Spec: .kiro/specs/1-4-0-convert-aws-to-lazy-accessors (task 4.2)
 * Validates: Requirements 1.3, 1.4, 4.2, 4.4, 4.5, 4.6, 4.7, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5
 *
 * Related tests:
 * - test/tools/aws-xray-load-tests.jest.mjs
 * - test/tools/property/aws-lazy-accessor-property-tests.jest.mjs
 */

import { describe, it, expect } from "@jest/globals";
import {
	runChild,
	SERVICE_PACKAGES,
	SHARED_CONFIG_FIXTURE,
	MISSING_CREDENTIALS_FILE
} from "../helpers/aws-classes-child-runner.mjs";

/** Timeout for each child-process test; the child itself times out at 20 seconds. */
const CHILD_TEST_TIMEOUT_MS = 60000;

const CONVERTED_ACCESSORS = ["dynamo", "s3", "ssm"];
const SDK_V2_GUARD_MESSAGE = "AWS SDK v2 is no longer supported. Please upgrade to Node.js 18 or higher to use AWS SDK v3.";
const NODE_FLOOR_MESSAGE = "Node.js version 22 or higher is required";

/**
 * The sorted, de-duplicated service-client packages for a sequence of reads.
 *
 * @param {Array<string>} reads - Accessor names
 * @returns {Array<string>} Expected loaded packages
 */
function expectedPackages(reads) {
	return [...new Set(reads.flatMap((name) => SERVICE_PACKAGES[name]))].sort();
}

/**
 * Run a scenario and assert it exited 0 with a result.
 *
 * @param {string} scenario - Scenario name
 * @param {Object} [args={}] - Scenario arguments
 * @param {Object.<string, string|undefined>} [env={}] - Child environment overrides
 * @returns {Object} The scenario result
 */
function runOk(scenario, args = {}, env = {}) {
	const run = runChild(scenario, args, { env });
	expect(run.status).toBe(0);
	expect(run.result).not.toBeNull();
	return run.result;
}

describe("Service-client packages load only on first access (Req 1.3, 1.4)", () => {

	it.each([
		["no accessor", []],
		["AWS.dynamo", ["dynamo"]],
		["AWS.s3", ["s3"]],
		["AWS.ssm", ["ssm"]],
		["all four accessors", ["dynamo", "s3", "ssm", "secrets"]]
	])("loads nothing at import, then only the packages for %s", (label, reads) => {
		const result = runOk("load-sequence", { reads });

		expect(result.entryLoaded).toBe(true);
		expect(result.atLoad).toEqual([]);
		expect(result.afterReads).toEqual(expectedPackages(reads));
		expect(result.readErrors).toEqual([]);
	}, CHILD_TEST_TIMEOUT_MS);

	it("loads nothing at import with X-Ray enabled", () => {
		const result = runOk("load-sequence", { reads: [] }, { CACHE_DATA_AWS_X_RAY_ON: "true" });

		expect(result.entryLoaded).toBe(true);
		expect(result.atLoad).toEqual([]);
	}, CHILD_TEST_TIMEOUT_MS);
});

describe("Region (Req 4.2, 4.4, 4.5)", () => {

	it("warns about a missing AWS_REGION at the first client construction, not at import (Req 4.5)", () => {
		const result = runOk("region-warning", {}, { AWS_REGION: undefined });

		expect(result.awsRegion).toBeNull();
		expect(result.entryLoaded).toBe(true);
		expect({ afterLoad: result.afterLoad, afterS3: result.afterS3, afterSsm: result.afterSsm })
			.toEqual({ afterLoad: 0, afterS3: 1, afterSsm: 1 });
	}, CHILD_TEST_TIMEOUT_MS);

	it("builds every client in AWS.REGION even when the shared config file names another region (Req 4.2, 4.4)", () => {
		const result = runOk("region-source", {}, {
			AWS_REGION: undefined,
			AWS_DEFAULT_REGION: undefined,
			AWS_PROFILE: undefined,
			AWS_CONFIG_FILE: SHARED_CONFIG_FIXTURE,
			AWS_SHARED_CREDENTIALS_FILE: MISSING_CREDENTIALS_FILE
		});

		expect(result.env).toEqual({
			AWS_REGION: null,
			AWS_DEFAULT_REGION: null,
			AWS_PROFILE: null,
			AWS_CONFIG_FILE: SHARED_CONFIG_FIXTURE
		});
		expect(result.entryLoaded).toBe(true);
		expect(result.awsRegion).toBe("us-east-1");
		expect(result.regions).toEqual({
			s3: { region: "us-east-1" },
			dynamo: { region: "us-east-1" },
			ssm: { region: "us-east-1" }
		});
	}, CHILD_TEST_TIMEOUT_MS);
});

describe("Instrumentation timing (Req 4.6, 4.7)", () => {

	it("instruments each client once, through the tracing provider active at its first read", () => {
		const result = runOk("provider-timing");

		expect(result.entryLoaded).toBe(true);
		expect(Object.values(result.reads).every((read) => read.threw === false)).toBe(true);
		// dynamo was read before the provider was installed; s3 was read twice
		expect(result.received).toEqual(["S3", "SSMClient"]);
	}, CHILD_TEST_TIMEOUT_MS);
});

describe("SDK v2 guard (Req 6.1 to 6.3)", () => {

	it("loads AWS.classes.js on old Node.js and throws the guard error from each converted accessor", () => {
		const result = runOk("v2-guard");

		expect(result.moduleLoaded).toBe(true);
		expect(result.nodeVersion).toBe("16.20.0");
		expect(result.sdkV3).toBe(false);
		for (const name of CONVERTED_ACCESSORS) {
			const guarded = { threw: true, code: null, message: SDK_V2_GUARD_MESSAGE };
			expect(result.reads[name]).toEqual([guarded, guarded]);
		}
		expect(result.packagesBeforeSecrets).toEqual([]);
		expect(result.secretsRead).toEqual({ threw: false });
		expect(result.secretsAvailable).toBe(true);
	}, CHILD_TEST_TIMEOUT_MS);

	it("stops at the Node.js 22 floor in vars.js when the package entry loads on old Node.js (Q13)", () => {
		const run = runChild("v2-entry");

		expect(run.status).toBe(1);
		expect(run.result).toBeNull();
		expect(run.stderr).toContain(NODE_FLOOR_MESSAGE);
		expect(run.stderr).not.toContain("AWS SDK v2 is no longer supported");
	}, CHILD_TEST_TIMEOUT_MS);
});

describe("Unavailable service-client package (Req 7.1 to 7.5)", () => {

	it("fails only the service whose package is missing, with the original error, and recovers once it resolves", () => {
		const result = runOk("missing-one");

		expect(result.entryLoaded).toBe(true);
		const blocked = { threw: true, code: "MODULE_NOT_FOUND", message: "Cannot find module '@aws-sdk/client-s3'" };
		expect(result.blockedReads).toEqual([blocked, blocked]);
		expect(result.ssmRead).toEqual({ threw: false });
		expect(result.ssmHasClient).toBe(true);
		expect(result.recoveredRead).toEqual({ threw: false });
		expect(result.recoveredHasClient).toBe(true);
		expect(result.recoveredKeys).toEqual(["client", "get", "put", "sdk"]);
	}, CHILD_TEST_TIMEOUT_MS);

	it("loads the package entry with every service-client package missing", () => {
		const result = runOk("missing-all");

		expect(result.entryLoaded).toBe(true);
		for (const name of CONVERTED_ACCESSORS) {
			expect(result.reads[name].threw).toBe(true);
			expect(result.reads[name].code).toBe("MODULE_NOT_FOUND");
		}
		expect(result.secretsRead).toEqual({ threw: false });
		expect(result.secretsAvailable).toBe(false);
	}, CHILD_TEST_TIMEOUT_MS);
});
