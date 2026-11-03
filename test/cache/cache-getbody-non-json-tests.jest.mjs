import { describe, it, expect } from "@jest/globals";
import { spawnSync } from "child_process";
import path from "path";

/* ****************************************************************************
 *	Cache.getBody() - non-JSON content
 *
 *	Purpose: Verify that getBody(true) and getResponse(true) return non-JSON
 *	bodies (HTML, RSS, XML, text) unchanged and do not log an [ERROR] entry,
 *	while JSON bodies are still parsed.
 *
 *	Isolation: Cache.init() is a singleton, so each case runs in a subprocess.
 *	spawnSync is used without a shell per secure-coding-practices, and so that
 *	stderr (where [ERROR] entries are written) is captured on success too.
 */
const projectRoot = path.resolve(process.cwd());
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

/**
 * Run an inline ES module script in a separate Node.js process and capture
 * everything it writes to stdout and stderr.
 * @param {string} script - Module source to run
 * @returns {{output: string, result: any}} Combined log output and the parsed RESULT line
 */
function runIsolated(script) {
	const env = { ...process.env, AWS_REGION };
	delete env.CACHE_IN_MEMORY_ONLY;
	delete env.LOG_LEVEL;
	delete env.DEPLOY_ENVIRONMENT;

	const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
		cwd: projectRoot,
		env,
		encoding: "utf8",
		timeout: 30000
	});
	const stdout = child.stdout || "";
	const stderr = child.stderr || "";

	if (child.status !== 0) {
		throw new Error(`Subprocess failed (status ${child.status}): ${child.error?.message || ""}\n${stdout}\n${stderr}`);
	}

	const resultLine = stdout.split("\n").find((line) => line.startsWith("RESULT:"));
	return {
		output: stdout + stderr,
		result: resultLine ? JSON.parse(resultLine.slice("RESULT:".length)) : null
	};
}

/**
 * Build a script that caches the given body through CacheableDataAccess.getData()
 * and then reads it back with getBody(true) and getResponse(true).
 * @param {string} body - Body returned by the mocked origin
 * @param {string} contentType - Content-Type returned by the mocked origin
 * @param {string} pathId - Unique path so cases never share a cache entry
 * @returns {string} Script source
 */
function buildScript(body, contentType, pathId) {
	return `
		const { Cache, CacheableDataAccess } = await import("./src/lib/dao-cache.js");
		Cache.init({ inMemoryOnly: true });
		const apiCall = async () => ({
			success: true,
			statusCode: 200,
			body: ${JSON.stringify(body)},
			headers: { "content-type": ${JSON.stringify(contentType)} }
		});
		const connection = { host: "feeds.example.com", path: ${JSON.stringify(pathId)}, headers: {} };
		const cachePolicy = {
			hostId: "feeds.example.com",
			pathId: ${JSON.stringify(pathId)},
			profile: "default",
			overrideOriginHeaderExpiration: false,
			defaultExpirationInSeconds: 300,
			expirationIsOnInterval: false,
			headersToRetain: "",
			hostEncryption: "public"
		};
		const cache = await CacheableDataAccess.getData(cachePolicy, apiCall, connection, null, {});
		const parsed = cache.getBody(true);
		const raw = cache.getBody();
		const response = cache.getResponse(true);
		console.log("RESULT:" + JSON.stringify({ parsed, raw, responseBody: response.body }));
	`;
}

describe("Cache.getBody() with non-JSON content", () => {
	const nonJsonCases = [
		{ name: "RSS", body: '<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0"><channel></channel></rss>', type: "application/rss+xml" },
		{ name: "HTML", body: "<!DOCTYPE html><html><body>Hello</body></html>", type: "text/html" },
		{ name: "XML", body: '<?xml version="1.0"?><root><a>1</a></root>', type: "application/xml" },
		{ name: "plain text", body: "just some plain text", type: "text/plain" }
	];

	for (const testCase of nonJsonCases) {
		it(`should return ${testCase.name} unchanged and log no error when parseBody is true`, () => {
			const { output, result } = runIsolated(buildScript(testCase.body, testCase.type, `/getbody/non-json/${testCase.name.replace(/\s/g, "-")}`));

			expect(result.parsed).toBe(testCase.body);
			expect(result.raw).toBe(testCase.body);
			expect(result.responseBody).toBe(testCase.body);
			expect(output).not.toContain("[ERROR]");
			expect(output).not.toContain("parse error");
		});
	}

	it("should still parse JSON bodies when parseBody is true", () => {
		const { output, result } = runIsolated(buildScript(JSON.stringify({ data: "value", list: [1, 2] }), "application/json", "/getbody/json"));

		expect(result.parsed).toEqual({ data: "value", list: [1, 2] });
		expect(result.raw).toBe('{"data":"value","list":[1,2]}');
		expect(result.responseBody).toEqual({ data: "value", list: [1, 2] });
		expect(output).not.toContain("[ERROR]");
	});
});
