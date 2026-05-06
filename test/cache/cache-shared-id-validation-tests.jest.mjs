import { describe, it, expect } from "@jest/globals";
import { execSync } from "child_process";

/* ****************************************************************************
 *	Cache Shared ID Validation Tests - Run each test in isolation
 *  Since these tests are validating the initialization of the Cache class,
 *  they must be run in isolation to ensure that the environment is clean
 *  for each test. Cache.init() is a singleton and can only be called once
 *  per process.
 *
 *  Requirements: 6.1, 6.2, 6.3, 2.1, 2.2
 */

// Set the environment variable for AWS region
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// Helper to get the module path for subprocess imports
const modulePath = new URL("../../src/lib/dao-cache.js", import.meta.url).href;

// Common init preamble for subprocess tests
const initPreamble = `process.env.AWS_REGION = '${AWS_REGION}'; import { randomBytes } from 'crypto'; const { Cache } = await import('${modulePath}'); const testKey = randomBytes(32).toString('hex'); const dataKey = Buffer.from(testKey, 'hex');`;

/**
 * Helper to run a test in a subprocess.
 * Executes the given code in a new Node.js process with --input-type=module.
 * The code should call process.exit(0) on success and process.exit(1) on failure.
 *
 * @param {string} testCode - The code to execute in the subprocess
 * @param {Object} [envOverrides] - Additional environment variables to set
 */
function runIsolatedTest(testCode, envOverrides = {}) {
	const env = { ...process.env, ...envOverrides };
	execSync(`node --input-type=module -e "${testCode}"`, {
		env,
		encoding: "utf8",
		stdio: "pipe",
		timeout: 15000
	});
}

describe("Cache.init() sharedCacheId Validation Tests", () => {

	describe("Invalid types throw Error (Requirement 6.1)", () => {

		it("Should throw error when sharedCacheId is a number", () => {
			const testCode = `${initPreamble} try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: 42 }); process.exit(1); } catch (error) { if (error.message === 'Cache.init() sharedCacheId must be a string, null, or undefined') process.exit(0); else process.exit(1); }`;
			runIsolatedTest(testCode);
		});

		it("Should throw error when sharedCacheId is an object", () => {
			const testCode = `${initPreamble} try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: { id: 'test' } }); process.exit(1); } catch (error) { if (error.message === 'Cache.init() sharedCacheId must be a string, null, or undefined') process.exit(0); else process.exit(1); }`;
			runIsolatedTest(testCode);
		});

		it("Should throw error when sharedCacheId is an array", () => {
			const testCode = `${initPreamble} try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: ['shared'] }); process.exit(1); } catch (error) { if (error.message === 'Cache.init() sharedCacheId must be a string, null, or undefined') process.exit(0); else process.exit(1); }`;
			runIsolatedTest(testCode);
		});

		it("Should throw error when sharedCacheId is a boolean", () => {
			const testCode = `${initPreamble} try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: true }); process.exit(1); } catch (error) { if (error.message === 'Cache.init() sharedCacheId must be a string, null, or undefined') process.exit(0); else process.exit(1); }`;
			runIsolatedTest(testCode);
		});

	});

	describe("Null and undefined treated as not provided (Requirement 6.2)", () => {

		it("Should not throw when sharedCacheId is null", () => {
			const testCode = `${initPreamble} try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: null }); process.exit(0); } catch (error) { process.exit(1); }`;
			runIsolatedTest(testCode);
		});

		it("Should not throw when sharedCacheId is undefined", () => {
			const testCode = `${initPreamble} try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: undefined }); process.exit(0); } catch (error) { process.exit(1); }`;
			runIsolatedTest(testCode);
		});

	});

	describe("Valid strings are accepted (Requirement 6.3)", () => {

		it("Should accept an empty string as sharedCacheId", () => {
			const testCode = `${initPreamble} try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: '' }); process.exit(0); } catch (error) { process.exit(1); }`;
			runIsolatedTest(testCode);
		});

		it("Should accept a whitespace string as sharedCacheId", () => {
			const testCode = `${initPreamble} try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: '   ' }); process.exit(0); } catch (error) { process.exit(1); }`;
			runIsolatedTest(testCode);
		});

		it("Should accept a string with special characters as sharedCacheId", () => {
			const testCode = `${initPreamble} try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: 'my-shared/cache_id@v2!#' }); process.exit(0); } catch (error) { process.exit(1); }`;
			runIsolatedTest(testCode);
		});

		it("Should accept a normal string as sharedCacheId", () => {
			const testCode = `${initPreamble} try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: 'my-shared-cache' }); process.exit(0); } catch (error) { process.exit(1); }`;
			runIsolatedTest(testCode);
		});

	});

	describe("CACHE_SHARED_ID env var is used when parameter not provided (Requirement 2.1)", () => {

		it("Should use CACHE_SHARED_ID env var when sharedCacheId parameter is not provided", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey }); const info = Cache.info(); if (info.sharedCacheId === 'env-shared-id') process.exit(0); else process.exit(1);`;
			runIsolatedTest(testCode, { CACHE_SHARED_ID: "env-shared-id" });
		});

		it("Should use CACHE_SHARED_ID env var when sharedCacheId is null", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: null }); const info = Cache.info(); if (info.sharedCacheId === 'env-fallback') process.exit(0); else process.exit(1);`;
			runIsolatedTest(testCode, { CACHE_SHARED_ID: "env-fallback" });
		});

		it("Should use CACHE_SHARED_ID env var when sharedCacheId is undefined", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: undefined }); const info = Cache.info(); if (info.sharedCacheId === 'env-undefined-fallback') process.exit(0); else process.exit(1);`;
			runIsolatedTest(testCode, { CACHE_SHARED_ID: "env-undefined-fallback" });
		});

	});

	describe("Parameter takes priority over CACHE_SHARED_ID env var (Requirement 2.2)", () => {

		it("Should use parameter value when both parameter and env var are set", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: 'param-value' }); const info = Cache.info(); if (info.sharedCacheId === 'param-value') process.exit(0); else process.exit(1);`;
			runIsolatedTest(testCode, { CACHE_SHARED_ID: "env-value" });
		});

		it("Should use empty string parameter over env var value", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: '' }); const info = Cache.info(); if (info.sharedCacheId === '') process.exit(0); else process.exit(1);`;
			runIsolatedTest(testCode, { CACHE_SHARED_ID: "env-value-should-not-be-used" });
		});

	});

	describe("Cache.info() sharedCacheId exposure (Requirements 4.1, 4.2, 4.3)", () => {

		it("Should return null when sharedCacheId is not configured (no param, no env var)", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey }); const info = Cache.info(); if (info.sharedCacheId === null) process.exit(0); else process.exit(1);`;
			const env = { ...process.env };
			delete env.CACHE_SHARED_ID;
			execSync(`node --input-type=module -e "${testCode}"`, {
				env,
				encoding: "utf8",
				stdio: "pipe",
				timeout: 15000
			});
		});

		it("Should return the configured string value when sharedCacheId is set via parameter", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: 'my-shared-cache' }); const info = Cache.info(); if (info.sharedCacheId === 'my-shared-cache') process.exit(0); else process.exit(1);`;
			runIsolatedTest(testCode);
		});

		it("Should return env var value when only CACHE_SHARED_ID is set (no parameter)", () => {
			const testCode = `${initPreamble} Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey }); const info = Cache.info(); if (info.sharedCacheId === 'env-only-value') process.exit(0); else process.exit(1);`;
			runIsolatedTest(testCode, { CACHE_SHARED_ID: "env-only-value" });
		});

	});

});
