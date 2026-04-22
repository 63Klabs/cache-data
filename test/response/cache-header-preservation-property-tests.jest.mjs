/**
 * Preservation Property Tests
 * 
 * Property 2: Preservation — Default Cache Headers Applied When Not Pre-Set
 * 
 * Purpose: Verify that the existing default cache header behavior is preserved
 * for responses where the application has NOT pre-set Cache-Control or Expires
 * headers before calling finalize(). These tests capture the baseline behavior
 * on UNFIXED code so that after the fix is applied, we can confirm no regressions.
 * 
 * All tests should PASS on unfixed code since we are testing existing default behavior.
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Response, ClientRequest } from '../../src/lib/tools/index.js';
import { testEventA } from '../helpers/test-event.js';
import { testContextA } from '../helpers/test-context.js';
import { testValidationsA } from '../helpers/test-validations.js';

// Arbitraries
const errorStatusArb = fc.integer({ min: 400, max: 599 });
const successStatusArb = fc.integer({ min: 200, max: 399 });

// Reserved header names that finalize() sets — must be excluded from Property 2d
const RESERVED_HEADERS = new Set([
	'Cache-Control',
	'Expires',
	'Content-Type',
	'Access-Control-Allow-Origin',
	'Referrer-Policy',
	'Vary',
	'x-exec-ms'
]);

// Safe custom header names for Property 2d
const customHeaderNameArb = fc.constantFrom(
	'X-Custom-Header',
	'X-Request-Id',
	'X-Trace-Id',
	'X-Correlation-Id',
	'X-App-Version',
	'X-Debug-Info'
);

// Header values: non-empty strings without null bytes
const headerValueArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('\0'));

ClientRequest.init({ validations: testValidationsA });

describe("Preservation: Default Cache Headers Applied When Not Pre-Set", () => {
	let REQ;
	let logStub;

	beforeEach(() => {
		logStub = jest.spyOn(console, 'log').mockImplementation();

		Response.init({
			settings: {
				errorExpirationInSeconds: 180,
				routeExpirationInSeconds: 3600
			}
		});

		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("Property 2a: Error path (status >= 400) — config-derived cache headers applied", () => {
		/**
		 * Validates: Requirements 3.1, 3.2
		 * 
		 * For all status codes >= 400 with no pre-set cache headers,
		 * Cache-Control equals max-age=<errorExpirationInSeconds> and
		 * Expires is a valid UTC date string.
		 */
		it("Property 2a: Cache-Control and Expires are set from errorExpirationInSeconds for error status codes", () => {
			fc.assert(
				fc.property(
					errorStatusArb,
					(statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);

						// No pre-set cache headers — just finalize
						const result = RESPONSE.finalize();

						// Cache-Control should be set from errorExpirationInSeconds (180)
						expect(result.headers["Cache-Control"]).toBe("max-age=180");

						// Expires should be a valid UTC date string
						expect(result.headers["Expires"]).toBeDefined();
						expect(typeof result.headers["Expires"]).toBe("string");
						const parsedDate = new Date(result.headers["Expires"]);
						expect(parsedDate.toString()).not.toBe("Invalid Date");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2b: Success path (status < 400, routeExpirationInSeconds > 0) — config-derived cache headers applied", () => {
		/**
		 * Validates: Requirements 3.3, 3.4
		 * 
		 * For all status codes in [200, 399] with routeExpirationInSeconds > 0
		 * and no pre-set cache headers, Cache-Control equals
		 * max-age=<routeExpirationInSeconds> and Expires is a valid UTC date string.
		 */
		it("Property 2b: Cache-Control and Expires are set from routeExpirationInSeconds for success status codes", () => {
			fc.assert(
				fc.property(
					successStatusArb,
					(statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);

						// No pre-set cache headers — just finalize
						const result = RESPONSE.finalize();

						// Cache-Control should be set from routeExpirationInSeconds (3600)
						expect(result.headers["Cache-Control"]).toBe("max-age=3600");

						// Expires should be a valid UTC date string
						expect(result.headers["Expires"]).toBeDefined();
						expect(typeof result.headers["Expires"]).toBe("string");
						const parsedDate = new Date(result.headers["Expires"]);
						expect(parsedDate.toString()).not.toBe("Invalid Date");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2c: Success path with routeExpirationInSeconds = 0 — no cache headers set", () => {
		/**
		 * Validates: Requirements 3.5
		 * 
		 * For all status codes in [200, 399] with routeExpirationInSeconds = 0
		 * and no pre-set cache headers, response headers do NOT contain
		 * Cache-Control or Expires.
		 * 
		 * NOTE: Response.init() can only be called once per process due to
		 * #isInitialized guard. Since the test suite already initializes with
		 * routeExpirationInSeconds: 3600, we verify this property by running
		 * a subprocess with routeExpirationInSeconds: 0.
		 */
		it("Property 2c: No Cache-Control or Expires headers when routeExpirationInSeconds is 0 (subprocess isolation)", () => {
			// We use subprocess isolation because Response.init() can only be called once per process.
			// Write test script to a temp file to avoid shell escaping issues.
			const tempFile = join(process.cwd(), 'test', 'response', '_temp_property2c_test.mjs');
			const testScript = [
				'import { Response, ClientRequest } from "../../src/lib/tools/index.js";',
				'',
				'const testEvent = {',
				'  resource: "/test/{id}", path: "/test/123", httpMethod: "GET",',
				'  headers: { Accept: "application/json", Host: "api.example.com", "User-Agent": "Mozilla/5.0", Referer: "https://example.com/dev" },',
				'  pathParameters: { id: "123" }, queryStringParameters: null,',
				'  requestContext: { accountId: "123456789012", resourceId: "abc123", stage: "prod", requestId: "test-req",',
				'    identity: { sourceIp: "192.168.100.1", userAgent: "Mozilla/5.0" },',
				'    resourcePath: "/test/{id}", httpMethod: "GET", apiId: "1234567890" },',
				'  body: null, isBase64Encoded: false',
				'};',
				'',
				'const testContext = {',
				'  functionName: "test-function", functionVersion: "$LATEST",',
				'  invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:test-function",',
				'  memoryLimitInMB: "128", awsRequestId: "test-req",',
				'  logGroupName: "/aws/lambda/test-function", logStreamName: "2024/01/01/test",',
				'  identity: null, clientContext: null,',
				'  getRemainingTimeInMillis: () => 1000, done: () => {}, fail: () => {}, succeed: () => {},',
				'  callbackWaitsForEmptyEventLoop: true',
				'};',
				'',
				'ClientRequest.init({ validations: { referrers: ["example.com"], parameters: {} } });',
				'Response.init({ settings: { errorExpirationInSeconds: 180, routeExpirationInSeconds: 0 } });',
				'',
				'const REQ = new ClientRequest(testEvent, testContext);',
				'const statusCodes = [200, 201, 204, 250, 301, 302, 304, 350, 399];',
				'let allPassed = true;',
				'',
				'for (const statusCode of statusCodes) {',
				'  const RESPONSE = new Response(REQ);',
				'  RESPONSE.setStatusCode(statusCode);',
				'  const result = RESPONSE.finalize();',
				'  if ("Cache-Control" in result.headers) {',
				'    console.error("FAIL: Cache-Control found for status " + statusCode + ": " + result.headers["Cache-Control"]);',
				'    allPassed = false;',
				'  }',
				'  if ("Expires" in result.headers) {',
				'    console.error("FAIL: Expires found for status " + statusCode + ": " + result.headers["Expires"]);',
				'    allPassed = false;',
				'  }',
				'}',
				'',
				'if (allPassed) { process.exit(0); } else { process.exit(1); }',
			].join('\n');

			try {
				writeFileSync(tempFile, testScript, 'utf8');
				// >! Use execFileSync to prevent shell interpretation
				execFileSync('node', ['--experimental-vm-modules', tempFile], {
					encoding: 'utf8',
					timeout: 15000,
					stdio: 'pipe',
					cwd: process.cwd()
				});
			} finally {
				try { unlinkSync(tempFile); } catch (_) { /* ignore cleanup errors */ }
			}
		});
	});

	describe("Property 2d: Non-cache headers survive finalize() unchanged", () => {
		/**
		 * Validates: Requirements 3.6, 3.7
		 * 
		 * For all arbitrary non-cache header key/value pairs set via addHeader(),
		 * those headers survive finalize() unchanged.
		 */
		it("Property 2d: Custom headers set via addHeader() are preserved after finalize()", () => {
			fc.assert(
				fc.property(
					customHeaderNameArb,
					headerValueArb,
					fc.oneof(errorStatusArb, successStatusArb),
					(headerName, headerValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader(headerName, headerValue);

						const result = RESPONSE.finalize();

						// Custom header should survive finalize() unchanged
						expect(result.headers[headerName]).toBe(headerValue);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("Property 2d (multiple headers): Multiple custom headers survive finalize() unchanged", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.tuple(customHeaderNameArb, headerValueArb),
						{ minLength: 1, maxLength: 4 }
					),
					fc.oneof(errorStatusArb, successStatusArb),
					(headerPairs, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);

						// Deduplicate by header name (last value wins, matching addHeader behavior)
						const headerMap = new Map();
						for (const [name, value] of headerPairs) {
							RESPONSE.addHeader(name, value);
							headerMap.set(name, value);
						}

						const result = RESPONSE.finalize();

						// All custom headers should survive unchanged
						for (const [name, value] of headerMap) {
							expect(result.headers[name]).toBe(value);
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
