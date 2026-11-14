/**
 * Test: one-time deprecation warning for response427 (child process tests)
 *
 * Feature: 1-4-2-generic-responses-for-unlisted-status-codes
 *
 * Purpose: Verify that response() in the generic response modules logs one warning,
 * once per process, the first time it resolves status code 427, and that the logging
 * never changes the returned template, never throws and never causes an unhandled
 * rejection. 427 is not a registered HTTP status; response429 replaces response427.
 *
 * The "already warned" flag is module-level state inside generic.response.js, shared by
 * the five format modules and set only once per process. Each case that depends on it
 * therefore runs in its own child process, started directly from process.execPath with
 * spawnSync (no shell, no npm, no Jest). The child reads the project root from
 * process.argv[1] and builds every path with path.join, so no path is interpolated into
 * the script. Stdout and stderr are both captured.
 *
 * Setup:
 * - A child script prelude replaces DebugAndLog.warn with a recorder (every case except
 *   "real logger") and prints one RESULT line of JSON to stdout
 * - The "real logger" case leaves DebugAndLog.warn alone and reads stderr
 *
 * Teardown:
 * - None. Each child exits on its own. Timeout per child: 30 seconds
 *
 * Known Issues:
 * - None
 *
 * Related Tests:
 * - test/response/generic-response-class-fallback-tests.jest.mjs
 * - test/response/generic-response-module-tests.jest.mjs
 */

import { describe, it, expect, jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Each child process starts Node and loads the package, so allow more than the 5 second default
jest.setTimeout(120000);

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHILD_TIMEOUT_MS = 30000;
const RESULT_MARKER = "RESULT:";

/**
 * Start of every child script. The child is CommonJS. It reads the project root from
 * process.argv[1], stubs DebugAndLog.warn to record the arguments of each call, and
 * defines report() to print one JSON line. It uses no template literal and no line
 * break escape, so it can sit inside this template literal unchanged.
 */
const CHILD_PRELUDE = `
const path = require("path");
const root = process.argv[1];
const tools = (name) => require(path.join(root, "src", "lib", "tools", name));
const DebugAndLog = tools("DebugAndLog.class");
const jsonMod = tools("generic.response.json");
const xmlMod = tools("generic.response.xml");
const calls = [];
DebugAndLog.warn = function () { calls.push(Array.prototype.slice.call(arguments)); };
function report(extra) {
	console.log("${RESULT_MARKER}" + JSON.stringify(Object.assign({ calls: calls }, extra)));
}
`;

/**
 * Run a child script with process.execPath and return what it produced.
 *
 * @param {string} body - Script text that follows the prelude (or the whole script when withPrelude is false)
 * @param {{withPrelude?: boolean}} [options] - Set withPrelude to false to run the script as written
 * @returns {{status: number|null, signal: string|null, stdout: string, stderr: string, result: Object|null}} Captured output and the parsed RESULT line
 */
function runChild(body, { withPrelude = true } = {}) {
	const script = withPrelude ? CHILD_PRELUDE + body : body;
	const run = spawnSync(process.execPath, ["-e", script, PROJECT_ROOT], {
		encoding: "utf8",
		timeout: CHILD_TIMEOUT_MS
	});

	const stdout = run.stdout ?? "";
	const stderr = run.stderr ?? "";
	const markerAt = stdout.indexOf(RESULT_MARKER);
	let result = null;
	if (markerAt >= 0) {
		const line = stdout.slice(markerAt + RESULT_MARKER.length).split("\n")[0];
		result = JSON.parse(line);
	}

	return { status: run.status, signal: run.signal, error: run.error, stdout, stderr, result };
}

/**
 * Assert that the child exited normally with code 0 and printed a RESULT line.
 *
 * @param {{status: number|null, signal: string|null, error: Error|undefined, stdout: string, stderr: string, result: Object|null}} run - Output of runChild
 * @returns {Object} The parsed RESULT object
 */
function expectCleanRun(run) {
	expect({ error: run.error, status: run.status, signal: run.signal, stderr: run.stderr }).toEqual({
		error: undefined,
		status: 0,
		signal: null,
		stderr: run.stderr
	});
	expect(run.result).not.toBeNull();
	return run.result;
}

describe("response427 deprecation warning (child processes)", () => {

	describe("when the warning is logged", () => {

		it("logs once for the first response(427), with the deprecation, status and replacement in the message", () => {
			const run = runChild(`
				const first = jsonMod.response(427);
				report({ sameObject: first === jsonMod.response427 });
			`);
			const result = expectCleanRun(run);

			expect(result.calls).toHaveLength(1);
			const message = result.calls[0][0];
			expect(message).toContain("response427");
			expect(message).toContain("deprecated");
			expect(message).toContain("427 is not a registered HTTP status");
			expect(message).toContain("response429");
		});

		it("does not log on a second call, on the same module or on a different module", () => {
			const run = runChild(`
				jsonMod.response(427);
				const afterFirst = calls.length;
				jsonMod.response(427);
				const afterSameModule = calls.length;
				xmlMod.response(427);
				xmlMod.response("427");
				report({ afterFirst: afterFirst, afterSameModule: afterSameModule });
			`);
			const result = expectCleanRun(run);

			expect(result.afterFirst).toBe(1);
			expect(result.afterSameModule).toBe(1);
			expect(result.calls).toHaveLength(1);
		});

		it("logs once for response(427) first called on the xml module, then not for the json module", () => {
			const run = runChild(`
				xmlMod.response(427);
				jsonMod.response(427);
				report({});
			`);
			const result = expectCleanRun(run);

			expect(result.calls).toHaveLength(1);
		});

		it("passes the message as the only argument and puts no request data in it", () => {
			const run = runChild(`
				const ClientRequest = tools("index.js").ClientRequest;
				const Response = tools("index.js").Response;
				DebugAndLog.log = function () { return Promise.resolve(); };
				const event = require(path.join(root, "test", "helpers", "test-event.js")).testEventA;
				const context = require(path.join(root, "test", "helpers", "test-context.js")).testContextA;
				const validations = require(path.join(root, "test", "helpers", "test-validations.js")).testValidationsA;
				ClientRequest.init({ validations: validations });
				const req = new ClientRequest(event, context);
				new Response(req, { statusCode: 427 });
				report({ event: JSON.stringify(event), awsRequestId: context.awsRequestId });
			`);
			const result = expectCleanRun(run);

			expect(result.calls).toHaveLength(1);
			expect(result.calls[0]).toHaveLength(1);
			const message = result.calls[0][0];
			expect(typeof message).toBe("string");
			expect(message).not.toContain("12345");
			expect(message).not.toContain("employees");
			expect(message).not.toContain("api.example.com");
			expect(message).not.toContain(result.awsRequestId);
			expect(message).not.toContain("test-function");
		});

		it("logs once when a Response is built with status 427, and the body is the 427 template body", () => {
			const run = runChild(`
				const ClientRequest = tools("index.js").ClientRequest;
				const Response = tools("index.js").Response;
				DebugAndLog.log = function () { return Promise.resolve(); };
				const event = require(path.join(root, "test", "helpers", "test-event.js")).testEventA;
				const context = require(path.join(root, "test", "helpers", "test-context.js")).testContextA;
				const validations = require(path.join(root, "test", "helpers", "test-validations.js")).testValidationsA;
				ClientRequest.init({ validations: validations });
				const req = new ClientRequest(event, context);
				const response = new Response(req, { statusCode: 427 });
				const finalized = response.finalize();
				report({
					statusCode: finalized.statusCode,
					body: finalized.body,
					expectedBody: JSON.stringify(jsonMod.response427.body)
				});
			`);
			const result = expectCleanRun(run);

			expect(result.calls).toHaveLength(1);
			expect(result.statusCode).toBe(427);
			expect(result.body).toBe(result.expectedBody);
		});
	});

	describe("when the warning is not logged", () => {

		it("does not log for response(429), response(404), response(410), response(999) or other codes", () => {
			const run = runChild(`
				const codes = [429, 404, 410, 999, 200, 201, 204, 301, 400, 500, 503, 0, -1, "abc", "429", undefined, null];
				codes.forEach(function (code) { jsonMod.response(code); xmlMod.response(code); });
				report({});
			`);
			const result = expectCleanRun(run);

			expect(result.calls).toHaveLength(0);
		});

		it("does not log when response427 is read directly", () => {
			const run = runChild(`
				const template = jsonMod.response427;
				const again = xmlMod.response427;
				report({ statusCode: template.statusCode, xmlStatusCode: again.statusCode, hasBody: template.body !== undefined });
			`);
			const result = expectCleanRun(run);

			expect(result.calls).toHaveLength(0);
			expect(result.statusCode).toBe(427);
			expect(result.xmlStatusCode).toBe(427);
			expect(result.hasBody).toBe(true);
		});

		it("does not log for a direct read, and then logs once for the first response(427)", () => {
			const run = runChild(`
				void jsonMod.response427;
				const beforeCall = calls.length;
				jsonMod.response(427);
				report({ beforeCall: beforeCall });
			`);
			const result = expectCleanRun(run);

			expect(result.beforeCall).toBe(0);
			expect(result.calls).toHaveLength(1);
		});
	});

	describe("returned value", () => {

		it("is the response427 template on the call that logs and on the call that does not", () => {
			const run = runChild(`
				const first = jsonMod.response(427);
				const callsAfterFirst = calls.length;
				const second = jsonMod.response(427);
				const fromString = jsonMod.response("427");
				report({
					firstIsTemplate: first === jsonMod.response427,
					secondIsTemplate: second === jsonMod.response427,
					stringIsTemplate: fromString === jsonMod.response427,
					callsAfterFirst: callsAfterFirst,
					statusCode: first.statusCode
				});
			`);
			const result = expectCleanRun(run);

			expect(result.callsAfterFirst).toBe(1);
			expect(result.calls).toHaveLength(1);
			expect(result.firstIsTemplate).toBe(true);
			expect(result.secondIsTemplate).toBe(true);
			expect(result.stringIsTemplate).toBe(true);
			expect(result.statusCode).toBe(427);
		});
	});

	describe("when the logger fails", () => {

		it("returns the 427 template and does not throw when DebugAndLog.warn throws synchronously", () => {
			const run = runChild(`
				let warnCalls = 0;
				DebugAndLog.warn = function () { warnCalls++; throw new Error("logger failed"); };
				let threw = false;
				let first = null;
				let second = null;
				try {
					first = jsonMod.response(427);
					second = jsonMod.response(427);
				} catch (error) {
					threw = true;
				}
				report({
					threw: threw,
					firstIsTemplate: first === jsonMod.response427,
					secondIsTemplate: second === jsonMod.response427,
					warnCalls: warnCalls
				});
			`);
			const result = expectCleanRun(run);

			expect(result.threw).toBe(false);
			expect(result.firstIsTemplate).toBe(true);
			expect(result.secondIsTemplate).toBe(true);
			// The flag is set before the logger is called, so a failing logger is not called again
			expect(result.warnCalls).toBe(1);
		});

		it("returns the 427 template, does not throw and causes no unhandled rejection when DebugAndLog.warn returns a rejected promise", () => {
			const run = runChild(`
				let unhandled = 0;
				process.on("unhandledRejection", function () { unhandled++; });
				let warnCalls = 0;
				DebugAndLog.warn = function () { warnCalls++; return Promise.reject(new Error("logger rejected")); };
				let threw = false;
				let returned = null;
				try {
					returned = jsonMod.response(427);
				} catch (error) {
					threw = true;
				}
				setTimeout(function () {
					report({
						threw: threw,
						isTemplate: returned === jsonMod.response427,
						warnCalls: warnCalls,
						unhandled: unhandled
					});
				}, 100);
			`);
			const result = expectCleanRun(run);

			expect(result.threw).toBe(false);
			expect(result.isTemplate).toBe(true);
			expect(result.warnCalls).toBe(1);
			expect(result.unhandled).toBe(0);
		});
	});

	describe("real logger", () => {

		it("writes one [WARN] line naming response427 for two calls, and returns the template", () => {
			// No DebugAndLog.warn stub here, so the script does not use the prelude
			const run = runChild(`
				const path = require("path");
				const root = process.argv[1];
				const jsonMod = require(path.join(root, "src", "lib", "tools", "generic.response.json"));
				const first = jsonMod.response(427);
				const second = jsonMod.response(427);
				setTimeout(function () {
					console.log("${RESULT_MARKER}" + JSON.stringify({ same: first === jsonMod.response427 && second === first }));
				}, 100);
			`, { withPrelude: false });
			const result = expectCleanRun(run);

			expect(result.same).toBe(true);
			const warnLines = run.stderr.split("\n").filter((line) => line.includes("[WARN]"));
			expect(warnLines).toHaveLength(1);
			expect(warnLines[0]).toContain("response427");
			expect(warnLines[0]).toContain("deprecated");
		});
	});

	describe("module loading", () => {

		it("loads src/index.js without error (no require cycle) and exposes the generic response modules", () => {
			const run = runChild(`
				const pkg = require(path.join(root, "src", "index.js"));
				report({
					hasTools: typeof pkg.tools === "object" && pkg.tools !== null,
					hasResponse: typeof pkg.tools.Response === "function",
					hasResponseFn: typeof pkg.tools.jsonGenericResponse.response === "function"
				});
			`);
			const result = expectCleanRun(run);

			expect(result.hasTools).toBe(true);
			expect(result.hasResponse).toBe(true);
			expect(result.hasResponseFn).toBe(true);
			expect(result.calls).toHaveLength(0);
		});
	});
});
