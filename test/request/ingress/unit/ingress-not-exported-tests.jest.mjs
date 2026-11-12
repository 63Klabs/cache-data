/**
 * Test: Ingress internals are not part of the public API
 *
 * Purpose: IngressVerifier and the secret readers are internal classes under
 * src/lib/utils. They must not be exported from the package entry points and
 * must not be named in the published type definitions. The package exports
 * must also gain no name.
 *
 * Validates: Requirements 11.2, 11.4, 15.8
 *
 * Spawns no child processes.
 */

import { describe, it, expect } from "@jest/globals";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const INTERNAL_NAMES = [
	"IngressVerifier",
	"IngressSecretReader",
	"IngressCurrentSecretReader",
	"IngressPreviousSecretReader"
];

/**
 * Names exported at the last release (git HEAD before this change).
 * ClientRequest gains members isIngressVerified and static prime, but the
 * set of exported names does not change.
 */
const EXPECTED_TOP_LEVEL = ["cache", "endpoint", "tools"];
const EXPECTED_CACHE = ["Cache", "CacheableDataAccess", "TestHarness"];
const EXPECTED_ENDPOINT = ["get", "getDataDirectFromURI", "send"];
const EXPECTED_TOOLS = [
	"APIRequest",
	"AWS",
	"AWSXRay",
	"ApiRequest",
	"AppConfig",
	"Aws",
	"AwsXRay",
	"CachedParameterSecret",
	"CachedParameterSecrets",
	"CachedSSMParameter",
	"CachedSecret",
	"CachedSsmParameter",
	"ClientRequest",
	"Connection",
	"ConnectionAuthentication",
	"ConnectionRequest",
	"Connections",
	"DebugAndLog",
	"ImmutableObject",
	"RequestInfo",
	"Response",
	"ResponseDataModel",
	"Timer",
	"_ConfigSuperClass",
	"flushMetrics",
	"hashThisData",
	"htmlGenericResponse",
	"jsonGenericResponse",
	"nodeVer",
	"nodeVerMajor",
	"nodeVerMajorMinor",
	"nodeVerMinor",
	"obfuscate",
	"printMsg",
	"rssGenericResponse",
	"safeClone",
	"sanitize",
	"textGenericResponse",
	"xmlGenericResponse"
];

/**
 * Recursively list every file under a directory.
 * @param {string} dir Absolute directory path
 * @returns {string[]} Absolute file paths
 */
function listFiles(dir) {
	const files = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFiles(full));
		} else if (entry.isFile()) {
			files.push(full);
		}
	}
	return files;
}

describe("Ingress internals are not exported", () => {
	const sourceFiles = [
		path.join(REPO_ROOT, "src", "index.js"),
		path.join(REPO_ROOT, "src", "lib", "tools", "index.js")
	];
	const typeFiles = listFiles(path.join(REPO_ROOT, "types"));

	it("finds the type definition files to scan", () => {
		expect(typeFiles.length).toBeGreaterThan(0);
	});

	for (const name of INTERNAL_NAMES) {
		it(`src/index.js and src/lib/tools/index.js do not contain ${name}`, () => {
			for (const file of sourceFiles) {
				expect(fs.readFileSync(file, "utf8")).not.toContain(name);
			}
		});

		it(`no file under types/ contains ${name}`, () => {
			for (const file of typeFiles) {
				expect({ file: path.relative(REPO_ROOT, file), found: fs.readFileSync(file, "utf8").includes(name) })
					.toEqual({ file: path.relative(REPO_ROOT, file), found: false });
			}
		});
	}

	describe("package exports gain no name", () => {
		const pkg = require(path.join(REPO_ROOT, "src", "index.js"));

		it("top level exports are unchanged", () => {
			expect(Object.keys(pkg).sort()).toEqual(EXPECTED_TOP_LEVEL);
		});

		it("cache exports are unchanged", () => {
			expect(Object.keys(pkg.cache).sort()).toEqual(EXPECTED_CACHE);
		});

		it("endpoint exports are unchanged", () => {
			expect(Object.keys(pkg.endpoint).sort()).toEqual(EXPECTED_ENDPOINT);
		});

		it("tools exports are unchanged", () => {
			expect(Object.keys(pkg.tools).sort()).toEqual(EXPECTED_TOOLS);
		});

		it("no exported name at any level contains Ingress", () => {
			const names = [
				...Object.keys(pkg),
				...Object.keys(pkg.cache),
				...Object.keys(pkg.endpoint),
				...Object.keys(pkg.tools)
			];
			expect(names.filter((name) => name.includes("Ingress"))).toEqual([]);
		});
	});
});
