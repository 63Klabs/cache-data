import { describe, it, expect } from "@jest/globals";
import { execSync } from "child_process";

/* ****************************************************************************
 *	Cache.info() saltSource Tests - Run each test in isolation
 *
 *  These tests verify that Cache.info().saltSource returns the correct
 *  provenance label for each of the three salt-resolution tiers:
 *    1. "sharedCacheId"            - a sharedCacheId is configured
 *    2. "AWS_LAMBDA_FUNCTION_NAME" - no sharedCacheId, AWS_LAMBDA_FUNCTION_NAME set
 *    3. "none"                     - neither configured
 *
 *  Cache.init() is once-only global state (a singleton that can only be
 *  initialized once per process), so each tier MUST be exercised in its own
 *  Node.js subprocess to guarantee a clean, deterministic environment.
 *
 *  Subprocess isolation mirrors the established pattern in
 *  test/cache/cache-shared-id-validation-tests.jest.mjs. Test values are
 *  passed to the child via dedicated environment variables and are never
 *  string-interpolated into the `-e` program, so a hostile value cannot be
 *  interpreted by the shell. The `-e` program is a fixed string.
 *
 *  Requirements: 8.1, 10.2
 */

// Set the environment variable for AWS region
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// Helper to get the module path for subprocess imports
const modulePath = new URL("../../src/lib/dao-cache.js", import.meta.url).href;

// Common init preamble for subprocess tests. Imports Cache dynamically and
// builds a 32-byte data key so Cache.init() succeeds.
const initPreamble = `process.env.AWS_REGION = '${AWS_REGION}'; import { randomBytes } from 'crypto'; const { Cache } = await import('${modulePath}'); const testKey = randomBytes(32).toString('hex'); const dataKey = Buffer.from(testKey, 'hex');`;

/**
 * Build a child environment that does NOT inherit the salt-affecting keys from
 * the parent process, so each tier is deterministic regardless of where the
 * test suite runs (local shell, CI, or a Lambda-shaped environment).
 *
 * @param {Object} [overrides] - Keys to set on the cleaned child environment
 * @returns {Object} The constructed child environment
 */
function buildChildEnv(overrides = {}) {
	const env = { ...process.env };
	// Start from a clean slate for the two keys that drive salt resolution so a
	// stray value from the parent cannot flip the tier under test.
	delete env.CACHE_SHARED_ID;
	delete env.AWS_LAMBDA_FUNCTION_NAME;
	return { ...env, ...overrides };
}

/**
 * Run the given module code in an isolated Node.js subprocess. The code must
 * call process.exit(0) on success and process.exit(1) on failure.
 *
 * @param {string} testCode - The code to execute in the subprocess
 * @param {Object} env - The fully-constructed child environment
 */
function runIsolatedTest(testCode, env) {
	execSync(`node --input-type=module -e "${testCode}"`, {
		env,
		encoding: "utf8",
		stdio: "pipe",
		timeout: 120000
	});
}

describe("Cache.info() saltSource provenance (Requirements 8.1, 10.2)", () => {

	describe("Tier 1: sharedCacheId configured returns \"sharedCacheId\"", () => {

		it("Should return \"sharedCacheId\" when sharedCacheId is set via the init parameter", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: 'my-shared-cache' }); const info = Cache.info(); if (info.saltSource === 'sharedCacheId') { process.exit(0); } else { console.error('Expected saltSource "sharedCacheId", got: ' + info.saltSource); process.exit(1); }`;
			// No AWS_LAMBDA_FUNCTION_NAME set, so this also proves sharedCacheId
			// takes priority only by its own presence (the tier-1 branch).
			runIsolatedTest(testCode, buildChildEnv());
		});

		it("Should return \"sharedCacheId\" when sharedCacheId is set via the CACHE_SHARED_ID env var", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey }); const info = Cache.info(); if (info.saltSource === 'sharedCacheId') { process.exit(0); } else { console.error('Expected saltSource "sharedCacheId", got: ' + info.saltSource); process.exit(1); }`;
			runIsolatedTest(testCode, buildChildEnv({ CACHE_SHARED_ID: "env-shared-id" }));
		});

		it("Should return \"sharedCacheId\" even when AWS_LAMBDA_FUNCTION_NAME is also set (sharedCacheId wins)", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: 'my-shared-cache' }); const info = Cache.info(); if (info.saltSource === 'sharedCacheId') { process.exit(0); } else { console.error('Expected saltSource "sharedCacheId", got: ' + info.saltSource); process.exit(1); }`;
			runIsolatedTest(testCode, buildChildEnv({ AWS_LAMBDA_FUNCTION_NAME: "my-lambda-fn" }));
		});

	});

	describe("Tier 2: no sharedCacheId but AWS_LAMBDA_FUNCTION_NAME set returns \"AWS_LAMBDA_FUNCTION_NAME\"", () => {

		it("Should return \"AWS_LAMBDA_FUNCTION_NAME\" when no sharedCacheId and AWS_LAMBDA_FUNCTION_NAME is set", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey }); const info = Cache.info(); if (info.saltSource === 'AWS_LAMBDA_FUNCTION_NAME') { process.exit(0); } else { console.error('Expected saltSource "AWS_LAMBDA_FUNCTION_NAME", got: ' + info.saltSource); process.exit(1); }`;
			runIsolatedTest(testCode, buildChildEnv({ AWS_LAMBDA_FUNCTION_NAME: "my-lambda-fn" }));
		});

	});

	describe("Tier 3: neither configured returns \"none\"", () => {

		it("Should return \"none\" when there is no sharedCacheId and no AWS_LAMBDA_FUNCTION_NAME", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey }); const info = Cache.info(); if (info.saltSource === 'none') { process.exit(0); } else { console.error('Expected saltSource "none", got: ' + info.saltSource); process.exit(1); }`;
			// buildChildEnv() strips both CACHE_SHARED_ID and AWS_LAMBDA_FUNCTION_NAME.
			runIsolatedTest(testCode, buildChildEnv());
		});

	});

});
