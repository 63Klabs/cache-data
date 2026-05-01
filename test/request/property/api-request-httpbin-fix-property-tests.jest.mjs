import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fc from 'fast-check';
import ApiRequest from '../../../src/lib/tools/ApiRequest.class.js';
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { resolve } from 'path';

/**
 * Property-Based Tests for Bugfix: Flaky CI httpbin Tests
 * 
 * These tests validate the bug condition and expected behavior for the
 * 9 HTTP-dependent tests in api-request-backwards-compat-tests.jest.mjs.
 * 
 * Property 1 (Bug Condition): Demonstrates that the 9 HTTP tests are
 * unreliable without mocks by verifying the backwards compat test file
 * lacks mock setup in the 3 HTTP describe blocks, AND that with mocks
 * the tests would pass reliably.
 */

// Path to the backwards compat test file
const BACKWARDS_COMPAT_FILE = resolve(
	process.cwd(),
	'test/request/api-request-backwards-compat-tests.jest.mjs'
);

/**
 * Define the 9 HTTP test cases across the 3 describe blocks.
 * Each test case includes the describe block name, test name,
 * request configuration, expected response values, and mock response.
 */
const HTTP_TEST_CASES = [
	// === Response Format Compatibility (3 tests) ===
	{
		describeBlock: 'Response Format Compatibility',
		testName: 'should return old format without new features',
		host: 'httpbin.org',
		path: '/status/200',
		options: { timeout: 10000 },
		expectedSuccess: true,
		expectedStatusCode: 200,
		mockResponse: ApiRequest.responseFormat(true, 200, "SUCCESS", {}, "")
	},
	{
		describeBlock: 'Response Format Compatibility',
		testName: 'should return response without metadata when pagination disabled',
		host: 'httpbin.org',
		path: '/get',
		requestExtra: { pagination: { enabled: false } },
		options: { timeout: 10000 },
		expectedSuccess: true,
		expectedStatusCode: 200,
		mockResponse: ApiRequest.responseFormat(
			true, 200, "SUCCESS",
			{ "content-type": "application/json" },
			'{"url":"https://httpbin.org/get"}'
		)
	},
	{
		describeBlock: 'Response Format Compatibility',
		testName: 'should return response without metadata when retry disabled',
		host: 'httpbin.org',
		path: '/get',
		requestExtra: { retry: { enabled: false } },
		options: { timeout: 10000 },
		expectedSuccess: true,
		expectedStatusCode: 200,
		mockResponse: ApiRequest.responseFormat(
			true, 200, "SUCCESS",
			{ "content-type": "application/json" },
			'{"url":"https://httpbin.org/get"}'
		)
	},
	// === Requests Without Pagination Behave Identically (3 tests) ===
	{
		describeBlock: 'Requests Without Pagination Behave Identically',
		testName: 'should make simple GET request without pagination',
		host: 'httpbin.org',
		path: '/get',
		options: { timeout: 10000 },
		expectedSuccess: true,
		expectedStatusCode: 200,
		mockResponse: ApiRequest.responseFormat(
			true, 200, "SUCCESS",
			{ "content-type": "application/json" },
			'{"url":"https://httpbin.org/get"}'
		)
	},
	{
		describeBlock: 'Requests Without Pagination Behave Identically',
		testName: 'should handle query parameters without pagination',
		host: 'httpbin.org',
		path: '/get',
		requestExtra: { parameters: { param1: 'value1', param2: 'value2' } },
		options: { timeout: 10000 },
		expectedSuccess: true,
		expectedStatusCode: 200,
		mockResponse: ApiRequest.responseFormat(
			true, 200, "SUCCESS",
			{ "content-type": "application/json" },
			'{"url":"https://httpbin.org/get"}'
		)
	},
	{
		describeBlock: 'Requests Without Pagination Behave Identically',
		testName: 'should handle headers without pagination',
		host: 'httpbin.org',
		path: '/headers',
		requestExtra: { headers: { 'X-Custom-Header': 'test-value' } },
		options: { timeout: 10000 },
		expectedSuccess: true,
		expectedStatusCode: 200,
		mockResponse: ApiRequest.responseFormat(
			true, 200, "SUCCESS",
			{ "content-type": "application/json" },
			'{"headers":{}}'
		)
	},
	// === Requests Without Retry Behave Identically (3 tests) ===
	{
		describeBlock: 'Requests Without Retry Behave Identically',
		testName: 'should make single attempt without retry',
		host: 'httpbin.org',
		path: '/status/200',
		options: { timeout: 10000 },
		expectedSuccess: true,
		expectedStatusCode: 200,
		mockResponse: ApiRequest.responseFormat(true, 200, "SUCCESS", {}, "")
	},
	{
		describeBlock: 'Requests Without Retry Behave Identically',
		testName: 'should fail immediately on error without retry',
		host: 'httpbin.org',
		path: '/status/500',
		options: { timeout: 10000 },
		expectedSuccess: false,
		expectedStatusCode: 500,
		mockResponse: ApiRequest.responseFormat(false, 500, "ERROR", {}, "")
	},
	{
		describeBlock: 'Requests Without Retry Behave Identically',
		testName: 'should handle timeout without retry',
		host: 'httpbin.org',
		path: '/delay/10',
		options: { timeout: 1000 },
		expectedSuccess: false,
		expectedStatusCode: 504,
		mockResponse: ApiRequest.responseFormat(false, 504, "ERROR: TIMEOUT", {}, "")
	}
];

// The 3 HTTP-dependent describe block names
const HTTP_DESCRIBE_BLOCKS = [
	'Response Format Compatibility',
	'Requests Without Pagination Behave Identically',
	'Requests Without Retry Behave Identically'
];

describe('Property 1: Bug Condition - HTTP-Dependent Tests Fail Without Mocks', () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('Fix applied: backwards compat test file HAS beforeEach mock setup in HTTP describe blocks', () => {
		/**
		 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
		 * 
		 * This test reads the actual backwards compat test file and verifies
		 * that the 3 HTTP-dependent describe blocks DO contain beforeEach
		 * mock setup for _handleRetries. This confirms the fix was applied:
		 * with mocks, these tests no longer make real HTTP calls to httpbin.org.
		 */
		const fileContent = readFileSync(BACKWARDS_COMPAT_FILE, 'utf8');

		fc.assert(
			fc.property(
				fc.constantFrom(...HTTP_DESCRIBE_BLOCKS),
				(describeBlockName) => {
					// Find the describe block using indexOf (block names have no regex special chars)
					const searchStr = "describe('" + describeBlockName + "'";
					const startIndex = fileContent.indexOf(searchStr);
					expect(startIndex).toBeGreaterThanOrEqual(0);

					// Extract the content of this describe block by finding its boundaries
					let braceDepth = 0;
					let blockStart = -1;
					let blockEnd = -1;

					for (let i = startIndex; i < fileContent.length; i++) {
						if (fileContent[i] === '{') {
							if (blockStart === -1) blockStart = i;
							braceDepth++;
						} else if (fileContent[i] === '}') {
							braceDepth--;
							if (braceDepth === 0) {
								blockEnd = i;
								break;
							}
						}
					}

					const blockContent = fileContent.substring(blockStart, blockEnd + 1);

					// Verify: block HAS beforeEach with _handleRetries mock (fix applied)
					expect(blockContent).toMatch(/beforeEach/);
					expect(blockContent).toMatch(/_handleRetries/);
					expect(blockContent).toMatch(/jest\.spyOn/);

					// Verify: block still references httpbin.org in test cases
					expect(blockContent).toMatch(/httpbin\.org/);

					// Verify: block still calls apiRequest.send()
					expect(blockContent).toMatch(/apiRequest\.send\(\)/);

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

	it('Expected behavior: all 9 HTTP tests pass reliably with mocked _handleRetries', async () => {
		/**
		 * **Validates: Requirements 1.1, 1.2, 1.3**
		 * 
		 * This property test verifies that for each of the 9 HTTP test cases,
		 * when _handleRetries is mocked to return the expected response,
		 * the ApiRequest.send() call produces the correct result.
		 * 
		 * This test PASSES with mocks, proving the fix approach works.
		 * The bug is that the actual test file has NO mocks, so real HTTP
		 * calls to httpbin.org fail intermittently in CI.
		 */
		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(...HTTP_TEST_CASES),
				async (testCase) => {
					// Construct the request matching the original test
					const request = {
						host: testCase.host,
						path: testCase.path,
						options: testCase.options,
						...testCase.requestExtra
					};

					const apiRequest = new ApiRequest(request);

					// Spy on _handleRetries to return the expected mock response
					jest.spyOn(ApiRequest.prototype, '_handleRetries').mockImplementation(
						async function () {
							const response = testCase.mockResponse;
							// Set the response on the instance to populate this.#response
							this.setResponse(response);
							return {
								response,
								metadata: {
									retries: {
										occurred: false,
										attempts: 1,
										finalAttempt: 1
									}
								}
							};
						}
					);

					// Call send() which goes through send_get() -> _handleRetries (mocked) -> _handlePagination
					const response = await apiRequest.send();

					// Assert response matches expected values
					expect(response.success).toBe(testCase.expectedSuccess);
					expect(response.statusCode).toBe(testCase.expectedStatusCode);

					// Should NOT have metadata when pagination/retry not used
					expect(response).not.toHaveProperty('metadata');

					// Verify response has the standard format fields
					expect(response).toHaveProperty('success');
					expect(response).toHaveProperty('statusCode');
					expect(response).toHaveProperty('headers');
					expect(response).toHaveProperty('body');
					expect(response).toHaveProperty('message');

					// Verify types
					expect(typeof response.success).toBe('boolean');
					expect(typeof response.statusCode).toBe('number');

					// Restore mocks for next iteration
					jest.restoreAllMocks();

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});
});

// The 6 non-HTTP describe block names and their expected test counts
const NON_HTTP_DESCRIBE_BLOCKS = [
	{ name: 'Constructor Compatibility', expectedTests: 5 },
	{ name: 'Static Method Compatibility', expectedTests: 3 },
	{ name: 'Public API Compatibility', expectedTests: 8 },
	{ name: 'Query String Building Compatibility', expectedTests: 4 },
	{ name: 'Redirect Handling Compatibility', expectedTests: 2 },
	{ name: 'Options Merging Compatibility', expectedTests: 3 }
];

// Total expected non-HTTP tests
const TOTAL_NON_HTTP_TESTS = 25;

/**
 * Helper: Extract a describe block's content from the file by name.
 * Uses indexOf for matching and bracket depth counting for boundaries.
 *
 * @param {string} fileContent - Full file content
 * @param {string} blockName - Name of the describe block
 * @returns {string} The content of the describe block (between outer braces)
 */
function extractDescribeBlock(fileContent, blockName) {
	// Use indexOf to find the describe block (no regex special chars in block names)
	const searchStr = "describe('" + blockName + "'";
	const startIndex = fileContent.indexOf(searchStr);
	if (startIndex === -1) {
		throw new Error('Describe block "' + blockName + '" not found in file');
	}

	let braceDepth = 0;
	let blockStart = -1;
	let blockEnd = -1;

	for (let i = startIndex; i < fileContent.length; i++) {
		if (fileContent[i] === '{') {
			if (blockStart === -1) blockStart = i;
			braceDepth++;
		} else if (fileContent[i] === '}') {
			braceDepth--;
			if (braceDepth === 0) {
				blockEnd = i;
				break;
			}
		}
	}

	return fileContent.substring(blockStart, blockEnd + 1);
}

describe('Property 2: Preservation - Non-HTTP Tests Unchanged', () => {

	it('Non-HTTP describe blocks do NOT contain httpbin.org references or real HTTP calls', () => {
		/**
		 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
		 *
		 * For each of the 6 non-HTTP describe blocks, verify that:
		 * 1. The block does NOT contain httpbin.org references
		 * 2. The block does NOT call apiRequest.send() with a real host
		 * 3. The block does NOT have beforeEach mock setup added (for _handleRetries)
		 *
		 * This confirms these blocks are pure unit tests that don't depend
		 * on external HTTP services and should remain unchanged by the fix.
		 */
		const fileContent = readFileSync(BACKWARDS_COMPAT_FILE, 'utf8');

		fc.assert(
			fc.property(
				fc.constantFrom(...NON_HTTP_DESCRIBE_BLOCKS.map(b => b.name)),
				(describeBlockName) => {
					const blockContent = extractDescribeBlock(fileContent, describeBlockName);

					// Verify: block does NOT contain httpbin.org references
					expect(blockContent).not.toMatch(/httpbin\.org/);

					// Verify: block does NOT call apiRequest.send() with a real host
					// (non-HTTP blocks should not call send() at all)
					expect(blockContent).not.toMatch(/apiRequest\.send\(\)/);

					// Verify: block does NOT have beforeEach mock setup for _handleRetries
					// (these blocks should not need any HTTP mocking)
					expect(blockContent).not.toMatch(/_handleRetries/);

					return true;
				}
			),
			{ numRuns: 20 }
		);
	});

	it('All 25 non-HTTP tests pass when running the backwards compat test file', () => {
		/**
		 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
		 *
		 * Run the full backwards compat test file and verify that at least
		 * 25 non-HTTP tests pass. The 9 HTTP tests may pass or fail depending
		 * on network conditions, but the 25 non-HTTP tests must always pass.
		 */
		// >! Use spawnSync to capture both stdout and stderr without shell interpretation
		const result = spawnSync('node', [
			'--experimental-vm-modules',
			'./node_modules/jest/bin/jest.js',
			'test/request/api-request-backwards-compat-tests.jest.mjs'
		], {
			encoding: 'utf8',
			timeout: 60000
		});

		// Jest writes test summary to stderr, combine both streams
		const output = (result.stdout || '') + '\n' + (result.stderr || '');

		// Parse the Jest output to find the number of passed tests.
		// Jest output includes ANSI color codes, so we need to strip them first.
		// Jest output format: "Tests:  X failed, Y passed, Z total"
		// or "Tests:  Y passed, Z total" if all pass
		const cleanOutput = output.replace(/\u001b\[\d+m/g, '');
		const passedMatch = cleanOutput.match(/Tests:\s+.*?(\d+)\s+passed/);
		expect(passedMatch).not.toBeNull();

		const passedCount = parseInt(passedMatch[1], 10);

		// At least 25 non-HTTP tests must pass
		expect(passedCount).toBeGreaterThanOrEqual(TOTAL_NON_HTTP_TESTS);
	}, 120000);
});
