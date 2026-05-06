/**
 * Property-based tests for the sharedCacheId feature.
 * Uses fast-check to validate correctness properties from the design document.
 *
 * Feature: shared-cache-identifier
 * Test file: test/cache/cache-shared-id-property-tests.jest.mjs
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { Cache } from "../../src/lib/dao-cache.js";
import objHash from "object-hash";

// Set the environment variable for AWS region
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// Helper to get the module path for subprocess imports
const modulePath = new URL("../../src/lib/dao-cache.js", import.meta.url).href;

// Initialize Cache once for in-process property tests (Properties 1, 2)
const testKey = randomBytes(32).toString("hex");
const dataKey = Buffer.from(testKey, "hex");

const KNOWN_SALT = "property-test-salt";

Cache.init({
	dynamoDbTable: "test-table-prop",
	s3Bucket: "test-bucket-prop",
	secureDataKey: dataKey,
	sharedCacheId: KNOWN_SALT
});

/**
 * Arbitrary generator for connection objects used in cache hash generation.
 * Generates serializable objects with typical connection properties.
 * Uses alphanumeric characters to avoid shell escaping issues in subprocess tests.
 */
const connectionArb = fc.record({
	host: fc.stringMatching(/^[a-z][a-z0-9.]{0,29}$/),
	path: fc.stringMatching(/^\/[a-z0-9/]{0,29}$/),
	headers: fc.dictionary(
		fc.stringMatching(/^[a-z][a-z0-9-]{0,9}$/),
		fc.stringMatching(/^[a-z0-9]{1,20}$/)
	),
	parameters: fc.dictionary(
		fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/),
		fc.stringMatching(/^[a-z0-9]{0,20}$/)
	)
});

/**
 * Arbitrary generator for sharedCacheId strings.
 * Uses alphanumeric + safe characters to avoid shell escaping issues.
 */
const sharedCacheIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}$/);

/**
 * Compute what object-hash would produce for a given connection and salt.
 * Replicates the logic in Cache.generateIdHash() for verification purposes.
 *
 * @param {Object} connection - The connection object
 * @param {string} salt - The salt value
 * @returns {string} The hex hash
 */
function computeExpectedHash(connection, salt) {
	const cloned = structuredClone(connection);
	if (cloned.connection?.options) { delete cloned.connection.options; }
	cloned.THIS_IS_SALT_FOR_CK_CACHE_DATA_ID_HASH = salt;

	const objHashSettings = {
		algorithm: "RSA-SHA256",
		encoding: "hex",
		respectType: true,
		unorderedSets: true,
		unorderedObjects: true,
		unorderedArrays: true
	};

	return objHash(cloned, objHashSettings);
}

/**
 * Helper to run a subprocess test that computes a hash.
 * Uses environment variables to pass data safely (avoids shell escaping issues).
 *
 * @param {Object} options - Test options
 * @param {Object} options.connection - Connection object to hash
 * @param {string|null|undefined} [options.sharedCacheId] - sharedCacheId parameter value
 * @param {Object} [options.envOverrides] - Additional environment variables
 * @returns {string} The hash output from the subprocess
 */
function runHashSubprocess({ connection, sharedCacheId, envOverrides = {} }) {
	const connB64 = Buffer.from(JSON.stringify(connection)).toString("base64");

	let initLine;
	if (sharedCacheId === undefined) {
		initLine = "Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey });";
	} else if (sharedCacheId === null) {
		initLine = "Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: null });";
	} else {
		initLine = `Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: process.env.TEST_SHARED_CACHE_ID });`;
	}

	const testCode = [
		`process.env.AWS_REGION = '${AWS_REGION}';`,
		"import { randomBytes } from 'crypto';",
		`const { Cache } = await import('${modulePath}');`,
		"const testKey = randomBytes(32).toString('hex');",
		"const dataKey = Buffer.from(testKey, 'hex');",
		initLine,
		`const conn = JSON.parse(Buffer.from(process.env.TEST_CONN_B64, 'base64').toString());`,
		"const hash = Cache.generateIdHash(conn);",
		"process.stdout.write(hash);"
	].join(" ");

	const env = {
		...process.env,
		TEST_CONN_B64: connB64,
		...(sharedCacheId !== undefined && sharedCacheId !== null ? { TEST_SHARED_CACHE_ID: sharedCacheId } : {}),
		...envOverrides
	};

	return execSync(`node --input-type=module -e "${testCode}"`, {
		env,
		encoding: "utf8",
		stdio: "pipe",
		timeout: 15000
	});
}

/**
 * Helper to run a subprocess test that validates init throws for invalid types.
 *
 * @param {*} invalidValue - The invalid value to pass as sharedCacheId
 * @returns {void} Throws if subprocess exits with non-zero
 */
function runInvalidTypeSubprocess(invalidValue) {
	const valueB64 = Buffer.from(JSON.stringify(invalidValue)).toString("base64");

	const testCode = [
		`process.env.AWS_REGION = '${AWS_REGION}';`,
		"import { randomBytes } from 'crypto';",
		`const { Cache } = await import('${modulePath}');`,
		"const testKey = randomBytes(32).toString('hex');",
		"const dataKey = Buffer.from(testKey, 'hex');",
		"const invalidVal = JSON.parse(Buffer.from(process.env.TEST_INVALID_VALUE_B64, 'base64').toString());",
		"try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, sharedCacheId: invalidVal }); process.exit(1); }",
		"catch (error) { if (error.message === 'Cache.init() sharedCacheId must be a string, null, or undefined') process.exit(0); else process.exit(1); }"
	].join(" ");

	const env = {
		...process.env,
		TEST_INVALID_VALUE_B64: valueB64
	};

	execSync(`node --input-type=module -e "${testCode}"`, {
		env,
		encoding: "utf8",
		stdio: "pipe",
		timeout: 15000
	});
}

describe("Cache Shared ID Property Tests", () => {

	describe("Property 1: Same sharedCacheId produces identical hashes", () => {
		// Feature: shared-cache-identifier, Property 1: Same sharedCacheId produces identical hashes
		// **Validates: Requirements 3.1**

		it("should produce identical hashes for same sharedCacheId and same connection object", () => {
			fc.assert(
				fc.property(
					connectionArb,
					(connection) => {
						const hash1 = Cache.generateIdHash(connection);
						const hash2 = Cache.generateIdHash(connection);
						expect(hash1).toBe(hash2);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2: Different sharedCacheId produces different hashes", () => {
		// Feature: shared-cache-identifier, Property 2: Different sharedCacheId produces different hashes
		// **Validates: Requirements 3.2**

		it("should produce different hashes for different sharedCacheId values with same connection", () => {
			fc.assert(
				fc.property(
					connectionArb,
					sharedCacheIdArb.filter(s => s !== KNOWN_SALT),
					(connection, differentSalt) => {
						// Hash produced by Cache with the known salt
						const hashWithKnownSalt = Cache.generateIdHash(connection);

						// Compute what the hash would be with a different salt
						const hashWithDifferentSalt = computeExpectedHash(connection, differentSalt);

						expect(hashWithKnownSalt).not.toBe(hashWithDifferentSalt);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 3: Parameter takes priority over environment variable", () => {
		// Feature: shared-cache-identifier, Property 3: Parameter takes priority over environment variable
		// **Validates: Requirements 2.1, 2.2**

		it("should use parameter value as salt when both parameter and env var are set", () => {
			fc.assert(
				fc.property(
					connectionArb,
					sharedCacheIdArb,
					sharedCacheIdArb,
					(connection, paramValue, envValue) => {
						// Ensure param and env are different
						fc.pre(paramValue !== envValue);

						const hashFromSubprocess = runHashSubprocess({
							connection,
							sharedCacheId: paramValue,
							envOverrides: { CACHE_SHARED_ID: envValue }
						});

						// Compute expected hash using the parameter value (not env var)
						const expectedHash = computeExpectedHash(connection, paramValue);
						expect(hashFromSubprocess).toBe(expectedHash);
					}
				),
				{ numRuns: 5 }
			);
		});
	});

	describe("Property 4: Backwards compatibility — no sharedCacheId preserves existing behavior", () => {
		// Feature: shared-cache-identifier, Property 4: Backwards compatibility — no sharedCacheId preserves existing behavior
		// **Validates: Requirements 5.1**

		it("should produce same hash as current implementation when no sharedCacheId is configured", () => {
			const LAMBDA_FUNCTION_NAME = "test-lambda-function";

			fc.assert(
				fc.property(
					connectionArb,
					(connection) => {
						const hashFromSubprocess = runHashSubprocess({
							connection,
							sharedCacheId: undefined,
							envOverrides: { AWS_LAMBDA_FUNCTION_NAME: LAMBDA_FUNCTION_NAME }
						});

						// Compute expected hash using AWS_LAMBDA_FUNCTION_NAME as salt (current behavior)
						const expectedHash = computeExpectedHash(connection, LAMBDA_FUNCTION_NAME);
						expect(hashFromSubprocess).toBe(expectedHash);
					}
				),
				{ numRuns: 5 }
			);
		});
	});

	describe("Property 5: Invalid types are rejected", () => {
		// Feature: shared-cache-identifier, Property 5: Invalid types are rejected
		// **Validates: Requirements 6.1**

		it("should throw Error when sharedCacheId is a non-string, non-null, non-undefined value", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.integer(),
						fc.double({ noNaN: true, noDefaultInfinity: true }),
						fc.boolean(),
						fc.constant([]),
						fc.constant({}),
						fc.array(fc.integer(), { minLength: 1, maxLength: 3 }),
						fc.record({ key: fc.string({ minLength: 1, maxLength: 5 }) })
					),
					(invalidValue) => {
						expect(() => runInvalidTypeSubprocess(invalidValue)).not.toThrow();
					}
				),
				{ numRuns: 10 }
			);
		});
	});

	describe("Property 6: Null and undefined fall through to environment variable", () => {
		// Feature: shared-cache-identifier, Property 6: Null and undefined fall through to environment variable
		// **Validates: Requirements 6.2**

		it("should use CACHE_SHARED_ID env var when sharedCacheId is null or undefined", () => {
			fc.assert(
				fc.property(
					connectionArb,
					sharedCacheIdArb,
					fc.constantFrom(null, undefined),
					(connection, envValue, nullishValue) => {
						const hashFromSubprocess = runHashSubprocess({
							connection,
							sharedCacheId: nullishValue,
							envOverrides: { CACHE_SHARED_ID: envValue }
						});

						// When null/undefined is passed, env var should be used as salt
						const expectedHash = computeExpectedHash(connection, envValue);
						expect(hashFromSubprocess).toBe(expectedHash);
					}
				),
				{ numRuns: 5 }
			);
		});
	});

});
