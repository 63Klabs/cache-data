import { describe, it, expect } from "@jest/globals";
import { execSync } from "child_process";
import path from "path";

/* ****************************************************************************
 *	In-Memory Only Cache Mode - Property-Based Tests
 *	Tests correctness properties from the design document using fast-check.
 *	Each test runs the entire property test inside a subprocess for isolation
 *	since Cache.init() is a singleton.
 *
 *	Test Framework: Jest + fast-check
 *	Minimum iterations: 100 per property
 */

const projectRoot = path.resolve(process.cwd());

describe("Property 2: Read/Write Round-Trip via InMemoryCache", () => {

	/**
	 * **Validates: Requirements 3.1, 3.2, 3.3, 4.1, 4.2, 4.3**
	 *
	 * For any valid cache data (body string, headers object, status code,
	 * expiration), when written to the cache in memory-only mode and then
	 * read back using the same connection object, the returned data SHALL
	 * contain the same body, headers, and status code — without any
	 * encryption or external storage calls.
	 */
	it("For any valid cache data, write then read returns same data", () => {
		const testScript = `
			import fc from "fast-check";
			const { Cache } = await import("./src/lib/dao-cache.js");

			Cache.init({ inMemoryOnly: true });

			let counter = 0;

			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 1000 }),
					fc.dictionary(
						fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
						fc.string({ minLength: 0, maxLength: 100 })
					),
					fc.constantFrom("200", "201", "301", "304", "400", "404", "500"),
					async (body, headers, statusCode) => {
						counter++;
						const connection = { host: "test.example.com", path: "/prop2/" + counter };
						const cacheProfile = {
							hostId: "test.example.com",
							pathId: "/prop2/" + counter,
							defaultExpirationInSeconds: 300,
							encrypt: false
						};

						const cache = new Cache(connection, cacheProfile);

						// Write data via cache.update()
						await cache.update(body, headers, statusCode);

						// Read back via a new Cache instance with same connection
						const cache2 = new Cache(connection, cacheProfile);
						await cache2.read();

						// Verify returned data matches what was written
						const readBody = cache2.getBody();
						const readHeaders = cache2.getHeaders();
						const readStatusCode = cache2.getStatusCode();

						if (readBody !== body) {
							throw new Error("Body mismatch: expected " + JSON.stringify(body) + " got " + JSON.stringify(readBody));
						}

						if (readStatusCode !== statusCode) {
							throw new Error("StatusCode mismatch: expected " + statusCode + " got " + readStatusCode);
						}

						// Verify headers: all original headers should be present in read headers
						for (const [key, value] of Object.entries(headers)) {
							if (readHeaders[key] !== value) {
								throw new Error("Header mismatch for key " + key + ": expected " + JSON.stringify(value) + " got " + JSON.stringify(readHeaders[key]));
							}
						}

						return true;
					}
				),
				{ numRuns: 100 }
			);

			process.exit(0);
		`;

		execSync(`node --input-type=module -e '${testScript.replace(/'/g, "'\\''")}'`, {
			cwd: projectRoot,
			stdio: "pipe",
			timeout: 120000
		});
	}, 120000);

});

describe("Property 3: Cache Miss Returns Empty Format", () => {

	/**
	 * **Validates: Requirements 3.4**
	 *
	 * For any connection object that has not been previously written to,
	 * reading from the cache in memory-only mode SHALL return a CacheDataFormat
	 * object with body === null, headers === null, and statusCode === null.
	 */
	it("For any connection not written to, read returns null body/headers/statusCode", () => {
		const testScript = `
			import fc from "fast-check";
			const { Cache } = await import("./src/lib/dao-cache.js");

			Cache.init({ inMemoryOnly: true });

			let counter = 0;

			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
					fc.string({ minLength: 1, maxLength: 100 }).filter(s => /^\\/[a-z0-9/]+$/.test(s)),
					async (host, pathStr) => {
						counter++;
						const uniquePath = pathStr + "/miss/" + counter;
						const connection = { host: host + ".example.com", path: uniquePath };
						const cacheProfile = {
							hostId: host + ".example.com",
							pathId: uniquePath,
							defaultExpirationInSeconds: 300,
							encrypt: false
						};

						const cache = new Cache(connection, cacheProfile);
						await cache.read();

						const body = cache.getBody();
						const headers = cache.getHeaders();
						const statusCode = cache.getStatusCode();

						if (body !== null) {
							throw new Error("Expected body === null, got " + JSON.stringify(body));
						}
						if (headers !== null) {
							throw new Error("Expected headers === null, got " + JSON.stringify(headers));
						}
						if (statusCode !== null) {
							throw new Error("Expected statusCode === null, got " + JSON.stringify(statusCode));
						}

						return true;
					}
				),
				{ numRuns: 100 }
			);

			process.exit(0);
		`;

		execSync(`node --input-type=module -e '${testScript.replace(/'/g, "'\\''")}'`, {
			cwd: projectRoot,
			stdio: "pipe",
			timeout: 120000
		});
	}, 120000);

});

describe("Property 1: Relaxed Initialization in Memory-Only Mode", () => {

	/**
	 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
	 *
	 * For any set of init parameters where inMemoryOnly is true,
	 * Cache.init() SHALL succeed without throwing, regardless of whether
	 * secureDataKey, dynamoDbTable, or s3Bucket are provided.
	 */
	it("Cache.init() succeeds with inMemoryOnly: true regardless of missing infrastructure params", () => {
		const testScript = `
			import fc from "fast-check";
			import { execSync } from "child_process";
			import { randomBytes } from "crypto";
			import { writeFileSync, unlinkSync } from "fs";
			import { join } from "path";

			const projectRoot = process.cwd();

			fc.assert(
				fc.property(
					fc.boolean(),
					fc.boolean(),
					fc.boolean(),
					(includeSecureDataKey, includeDynamoDbTable, includeS3Bucket) => {
						const initParams = { inMemoryOnly: true };
						if (includeSecureDataKey) initParams.secureDataKey = randomBytes(32).toString("hex");
						if (includeDynamoDbTable) initParams.dynamoDbTable = "test-table-" + Math.random().toString(36).slice(2);
						if (includeS3Bucket) initParams.s3Bucket = "test-bucket-" + Math.random().toString(36).slice(2);

						const scriptContent = [
							"const { Cache } = await import('./src/lib/dao-cache.js');",
							"const params = " + JSON.stringify(initParams) + ";",
							initParams.secureDataKey ? "params.secureDataKey = Buffer.from(params.secureDataKey, 'hex');" : "",
							"Cache.init(params);",
							"process.exit(0);"
						].join("\\n");

						const scriptFile = join(projectRoot, ".tmp-prop1-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".mjs");
						writeFileSync(scriptFile, scriptContent);

						try {
							execSync("node " + scriptFile, {
								cwd: projectRoot,
								stdio: "pipe",
								timeout: 10000
							});
						} catch (error) {
							throw new Error("Cache.init() threw with params: " + JSON.stringify(initParams) + " error: " + (error.stderr ? error.stderr.toString() : error.message));
						} finally {
							try { unlinkSync(scriptFile); } catch (e) {}
						}
						return true;
					}
				),
				{ numRuns: 100 }
			);

			process.exit(0);
		`;

		execSync(`node --input-type=module -e '${testScript.replace(/'/g, "'\\''")}'`, {
			cwd: projectRoot,
			stdio: "pipe",
			timeout: 300000
		});
	}, 300000);

});

describe("Property 4: Backwards Compatibility — secureDataKey Required Without inMemoryOnly", () => {

	/**
	 * **Validates: Requirements 1.4, 7.1, 7.3, 7.4**
	 *
	 * For any set of init parameters where inMemoryOnly is not set (or is false)
	 * and secureDataKey is absent, Cache.init() SHALL throw an error, preserving
	 * the existing initialization requirements.
	 */
	it("Cache.init() throws when inMemoryOnly is not set and secureDataKey is absent", () => {
		const testScript = `
			import fc from "fast-check";
			import { execSync } from "child_process";
			import { writeFileSync, unlinkSync } from "fs";
			import { join } from "path";

			const projectRoot = process.cwd();

			fc.assert(
				fc.property(
					fc.boolean(),
					fc.boolean(),
					fc.boolean(),
					fc.constantFrom(false, undefined),
					(includeDynamoDbTable, includeS3Bucket, includeOtherParams, inMemoryOnlyValue) => {
						const initParams = {};

						// inMemoryOnly is either false or not set
						if (inMemoryOnlyValue === false) {
							initParams.inMemoryOnly = false;
						}
						// When undefined, we simply don't include it

						// Never include secureDataKey — that's the point of this test

						if (includeDynamoDbTable) initParams.dynamoDbTable = "test-table-" + Math.random().toString(36).slice(2);
						if (includeS3Bucket) initParams.s3Bucket = "test-bucket-" + Math.random().toString(36).slice(2);
						if (includeOtherParams) {
							initParams.idHashAlgorithm = "sha256";
						}

						const scriptContent = [
							"const { Cache } = await import('./src/lib/dao-cache.js');",
							"const params = " + JSON.stringify(initParams) + ";",
							"try {",
							"  Cache.init(params);",
							"  process.exit(0);",
							"} catch (error) {",
							"  process.exit(1);",
							"}"
						].join("\\n");

						const scriptFile = join(projectRoot, ".tmp-prop4-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".mjs");
						writeFileSync(scriptFile, scriptContent);

						try {
							// If execSync succeeds (exit 0), Cache.init() did NOT throw
							// That means the property is VIOLATED — secureDataKey should be required
							execSync("node " + scriptFile, {
								cwd: projectRoot,
								stdio: "pipe",
								timeout: 10000
							});
							// If we reach here, subprocess exited 0 — Cache.init() did not throw
							throw new Error("Cache.init() should have thrown without secureDataKey when inMemoryOnly is not active. Params: " + JSON.stringify(initParams));
						} catch (error) {
							// If the error is our own assertion error, re-throw it
							if (error.message && error.message.startsWith("Cache.init() should have thrown")) {
								throw error;
							}
							// Otherwise, execSync threw because subprocess exited non-zero
							// This is the EXPECTED behavior — Cache.init() threw an error
							// Property holds: secureDataKey is required without inMemoryOnly
						} finally {
							try { unlinkSync(scriptFile); } catch (e) {}
						}
						return true;
					}
				),
				{ numRuns: 100 }
			);

			process.exit(0);
		`;

		execSync(`node --input-type=module -e '${testScript.replace(/'/g, "'\\''")}'`, {
			cwd: projectRoot,
			stdio: "pipe",
			timeout: 300000
		});
	}, 300000);

});

describe("Property 5: Expiration Is Respected in Memory-Only Mode", () => {

	/**
	 * **Validates: Requirements 4.4, 8.3**
	 *
	 * For any cache entry written with a specific expiration timestamp,
	 * reading from the cache after that timestamp has passed SHALL return
	 * a cache miss (empty format), demonstrating that the InMemoryCache
	 * expiration mechanism is properly utilized.
	 */
	it("Expired cache entries return cache miss on read", () => {
		const testScript = `
			import fc from "fast-check";
			const { Cache } = await import("./src/lib/dao-cache.js");

			Cache.init({ inMemoryOnly: true });

			let counter = 0;

			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 500 }),
					fc.constantFrom("200", "201", "404", "500"),
					fc.integer({ min: 1, max: 3600 }),
					async (body, statusCode, secondsInPast) => {
						counter++;
						const connection = { host: "expire-test.example.com", path: "/prop5/" + counter };
						const cacheProfile = {
							hostId: "expire-test.example.com",
							pathId: "/prop5/" + counter,
							defaultExpirationInSeconds: 300,
							encrypt: false
						};

						// Write with already-expired timestamp (Unix seconds in the past)
						const expiredTimestamp = Math.floor(Date.now() / 1000) - secondsInPast;
						const cache = new Cache(connection, cacheProfile);
						await cache.update(body, {}, statusCode, expiredTimestamp);

						// Read back - should be a miss since it is expired
						const cache2 = new Cache(connection, cacheProfile);
						await cache2.read();

						if (cache2.getBody() !== null) {
							throw new Error("Expected null body for expired entry, got " + JSON.stringify(cache2.getBody()));
						}
						if (cache2.getStatusCode() !== null) {
							throw new Error("Expected null statusCode for expired entry, got " + JSON.stringify(cache2.getStatusCode()));
						}
						if (cache2.getHeaders() !== null) {
							throw new Error("Expected null headers for expired entry, got " + JSON.stringify(cache2.getHeaders()));
						}

						return true;
					}
				),
				{ numRuns: 100 }
			);

			process.exit(0);
		`;

		execSync(`node --input-type=module -e '${testScript.replace(/'/g, "'\\''")}'`, {
			cwd: projectRoot,
			stdio: "pipe",
			timeout: 120000
		});
	}, 120000);

});
