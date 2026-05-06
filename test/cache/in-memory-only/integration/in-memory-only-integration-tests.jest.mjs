import { describe, it, expect } from "@jest/globals";
import { execSync } from "child_process";
import path from "path";

/* ****************************************************************************
 *	In-Memory Only Cache Mode - Integration Tests
 *	Tests end-to-end flows for CacheableDataAccess in memory-only mode.
 *	Each test runs in a subprocess for isolation since Cache.init() is a singleton.
 *
 *	Requirements: 8.1, 8.2, 8.3
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
	if (!("CACHE_IN_MEMORY_ONLY" in env)) {
		delete envVars.CACHE_IN_MEMORY_ONLY;
	}
	execSync(`node --input-type=module -e '${testScript.replace(/'/g, "'\\''")}'`, {
		cwd: projectRoot,
		stdio: "pipe",
		env: envVars,
		timeout: 30000
	});
}

describe("CacheableDataAccess Integration - In-Memory Only Mode", () => {

	describe("Requirement 8.1, 8.2: CacheableDataAccess.getData() full flow (miss → fetch → store → hit)", () => {

		it("should call apiCallFunction on first request (cache miss) and use cache on second request (cache hit)", () => {
			const testScript = `
				const { Cache, CacheableDataAccess } = await import("./src/lib/dao-cache.js");

				Cache.init({ inMemoryOnly: true });

				let fetchCount = 0;
				const mockApiCall = async (connection, data) => {
					fetchCount++;
					return {
						success: true,
						statusCode: 200,
						body: JSON.stringify({ result: "test-value-" + fetchCount }),
						headers: { "content-type": "application/json" }
					};
				};

				const connection = {
					host: "api.example.com",
					path: "/integration/full-flow",
					headers: {}
				};

				const cachePolicy = {
					hostId: "api.example.com",
					pathId: "/integration/full-flow",
					profile: "default",
					overrideOriginHeaderExpiration: false,
					defaultExpirationInSeconds: 300,
					expirationIsOnInterval: false,
					headersToRetain: "",
					hostEncryption: "public"
				};

				// First call - should be a miss, calls mockApiCall
				const result1 = await CacheableDataAccess.getData(
					cachePolicy,
					mockApiCall,
					connection,
					null,
					{ path: "integration/full-flow", id: "test-1" }
				);

				if (fetchCount !== 1) {
					console.error("Expected fetchCount === 1 after first call, got " + fetchCount);
					process.exit(1);
				}

				const body1 = result1.getBody();
				if (!body1 || !body1.includes("test-value-1")) {
					console.error("Expected body to contain test-value-1, got: " + body1);
					process.exit(1);
				}

				// Second call with same connection - should be a hit from InMemoryCache
				const connection2 = {
					host: "api.example.com",
					path: "/integration/full-flow",
					headers: {}
				};

				const result2 = await CacheableDataAccess.getData(
					cachePolicy,
					mockApiCall,
					connection2,
					null,
					{ path: "integration/full-flow", id: "test-2" }
				);

				if (fetchCount !== 1) {
					console.error("Expected fetchCount === 1 after second call (cache hit), got " + fetchCount);
					process.exit(1);
				}

				const body2 = result2.getBody();
				if (!body2 || !body2.includes("test-value-1")) {
					console.error("Expected body2 to contain test-value-1 (from cache), got: " + body2);
					process.exit(1);
				}

				// Verify status indicates cache hit
				const status2 = result2.getStatus();
				if (!status2.includes("mem")) {
					console.error("Expected status to indicate in-memory cache hit, got: " + status2);
					process.exit(1);
				}

				process.exit(0);
			`;
			runIsolatedTest(testScript);
		}, 30000);

	});

	describe("Requirement 8.3: Cache expiration and refresh cycle in memory-only mode", () => {

		it("should return cache miss for expired data and fetch fresh data on next request", () => {
			const testScript = `
				const { Cache, CacheableDataAccess } = await import("./src/lib/dao-cache.js");

				Cache.init({ inMemoryOnly: true });

				let fetchCount = 0;
				const mockApiCall = async (connection, data) => {
					fetchCount++;
					return {
						success: true,
						statusCode: 200,
						body: JSON.stringify({ version: fetchCount }),
						headers: { "content-type": "application/json" }
					};
				};

				const connection = {
					host: "api.example.com",
					path: "/integration/expiration-test",
					headers: {}
				};

				const cachePolicy = {
					hostId: "api.example.com",
					pathId: "/integration/expiration-test",
					profile: "default",
					overrideOriginHeaderExpiration: false,
					defaultExpirationInSeconds: 1,
					expirationIsOnInterval: false,
					headersToRetain: "",
					hostEncryption: "public"
				};

				// First call - cache miss, fetches data
				const result1 = await CacheableDataAccess.getData(
					cachePolicy,
					mockApiCall,
					{ ...connection, headers: {} },
					null,
					{ path: "integration/expiration-test", id: "exp-1" }
				);

				if (fetchCount !== 1) {
					console.error("Expected fetchCount === 1 after first call, got " + fetchCount);
					process.exit(1);
				}

				// Wait for expiration (1 second + buffer)
				await new Promise(resolve => setTimeout(resolve, 1500));

				// Second call - should be expired, fetches fresh data
				const result2 = await CacheableDataAccess.getData(
					cachePolicy,
					mockApiCall,
					{ ...connection, headers: {} },
					null,
					{ path: "integration/expiration-test", id: "exp-2" }
				);

				if (fetchCount !== 2) {
					console.error("Expected fetchCount === 2 after expiration, got " + fetchCount);
					process.exit(1);
				}

				const body2 = result2.getBody();
				if (!body2 || !body2.includes('"version":2')) {
					console.error("Expected body to contain version 2 (fresh fetch), got: " + body2);
					process.exit(1);
				}

				process.exit(0);
			`;
			runIsolatedTest(testScript);
		}, 30000);

	});

	describe("Requirement 8.1: Multiple Cache instances sharing the same InMemoryCache", () => {

		it("should share cached data between Cache instances using the same connection", () => {
			const testScript = `
				const { Cache, CacheableDataAccess } = await import("./src/lib/dao-cache.js");

				Cache.init({ inMemoryOnly: true });

				let fetchCount = 0;
				const mockApiCall = async (connection, data) => {
					fetchCount++;
					return {
						success: true,
						statusCode: 200,
						body: JSON.stringify({ shared: "data-from-instance-A" }),
						headers: { "content-type": "application/json", "x-custom": "header-value" }
					};
				};

				const cachePolicy = {
					hostId: "api.example.com",
					pathId: "/integration/shared-cache",
					profile: "default",
					overrideOriginHeaderExpiration: false,
					defaultExpirationInSeconds: 300,
					expirationIsOnInterval: false,
					headersToRetain: "x-custom",
					hostEncryption: "public"
				};

				// Instance A writes data via CacheableDataAccess
				const connectionA = {
					host: "api.example.com",
					path: "/integration/shared-cache",
					headers: {}
				};

				await CacheableDataAccess.getData(
					cachePolicy,
					mockApiCall,
					connectionA,
					null,
					{ path: "integration/shared-cache", id: "instance-A" }
				);

				if (fetchCount !== 1) {
					console.error("Expected fetchCount === 1 after instance A, got " + fetchCount);
					process.exit(1);
				}

				// Instance B reads data using same connection details
				// This creates a new Cache instance internally but should hit the shared InMemoryCache
				const connectionB = {
					host: "api.example.com",
					path: "/integration/shared-cache",
					headers: {}
				};

				const resultB = await CacheableDataAccess.getData(
					cachePolicy,
					mockApiCall,
					connectionB,
					null,
					{ path: "integration/shared-cache", id: "instance-B" }
				);

				if (fetchCount !== 1) {
					console.error("Expected fetchCount === 1 after instance B (shared cache hit), got " + fetchCount);
					process.exit(1);
				}

				const bodyB = resultB.getBody();
				if (!bodyB || !bodyB.includes("data-from-instance-A")) {
					console.error("Expected instance B to get data written by instance A, got: " + bodyB);
					process.exit(1);
				}

				process.exit(0);
			`;
			runIsolatedTest(testScript);
		}, 30000);

	});

	describe("Requirement 8.1: extendExpires() behavior in memory-only mode", () => {

		it("should extend cache expiration via update when cache is still valid (not expired)", () => {
			const testScript = `
				const { Cache, CacheableDataAccess } = await import("./src/lib/dao-cache.js");

				Cache.init({ inMemoryOnly: true });

				let fetchCount = 0;
				const mockApiCall = async (connection, data) => {
					fetchCount++;
					if (fetchCount === 1) {
						// First call: return fresh data with short expiration
						return {
							success: true,
							statusCode: 200,
							body: JSON.stringify({ data: "original-content" }),
							headers: {
								"content-type": "application/json",
								"etag": '"abc123"',
								"last-modified": "Wed, 01 Jan 2025 00:00:00 GMT"
							}
						};
					} else {
						// Subsequent calls: return 304 Not Modified
						return {
							success: true,
							statusCode: 304,
							body: "",
							headers: {}
						};
					}
				};

				const cachePolicy = {
					hostId: "api.example.com",
					pathId: "/integration/extend-expires",
					profile: "default",
					overrideOriginHeaderExpiration: false,
					defaultExpirationInSeconds: 300,
					expirationIsOnInterval: false,
					headersToRetain: "",
					hostEncryption: "public"
				};

				// First call - fetches fresh data
				const result1 = await CacheableDataAccess.getData(
					cachePolicy,
					mockApiCall,
					{ host: "api.example.com", path: "/integration/extend-expires", headers: {}, options: {} },
					null,
					{ path: "integration/extend-expires", id: "ext-1" }
				);

				if (fetchCount !== 1) {
					console.error("Expected fetchCount === 1, got " + fetchCount);
					process.exit(1);
				}

				const body1 = result1.getBody();
				if (!body1 || !body1.includes("original-content")) {
					console.error("Expected body to contain original-content, got: " + body1);
					process.exit(1);
				}

				// Second call with forceRefresh - cache is still valid but we force a refresh
				// Origin returns 304, so extendExpires is called with existing cached body
				const result2 = await CacheableDataAccess.getData(
					cachePolicy,
					mockApiCall,
					{ host: "api.example.com", path: "/integration/extend-expires", headers: {}, options: { forceRefresh: true } },
					null,
					{ path: "integration/extend-expires", id: "ext-2" }
				);

				if (fetchCount !== 2) {
					console.error("Expected fetchCount === 2, got " + fetchCount);
					process.exit(1);
				}

				// Body should still be the original content (304 preserves cached body via extendExpires)
				const body2 = result2.getBody();
				if (!body2 || !body2.includes("original-content")) {
					console.error("Expected body to still contain original-content after 304, got: " + body2);
					process.exit(1);
				}

				// Third call - should be a cache hit (expiration was extended)
				const result3 = await CacheableDataAccess.getData(
					cachePolicy,
					mockApiCall,
					{ host: "api.example.com", path: "/integration/extend-expires", headers: {}, options: {} },
					null,
					{ path: "integration/extend-expires", id: "ext-3" }
				);

				if (fetchCount !== 2) {
					console.error("Expected fetchCount === 2 after third call (extended cache hit), got " + fetchCount);
					process.exit(1);
				}

				const body3 = result3.getBody();
				if (!body3 || !body3.includes("original-content")) {
					console.error("Expected body3 to contain original-content (cache hit), got: " + body3);
					process.exit(1);
				}

				process.exit(0);
			`;
			runIsolatedTest(testScript);
		}, 30000);

	});

});
