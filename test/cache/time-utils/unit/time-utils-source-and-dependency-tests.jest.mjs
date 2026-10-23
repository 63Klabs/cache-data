/**
 * Source and dependency checks for the TimeUtils migration.
 *
 * TimeUtils (src/lib/utils/TimeUtils.class.js) replaced moment-timezone, the package's only
 * runtime dependency. These tests check what the change leaves behind, by reading the files
 * the package ships and by loading the package the way a consumer does:
 *
 * - Nothing in src/ requires or imports moment or moment-timezone, package.json declares no
 *   runtime dependencies, and package-lock.json has no moment or moment-timezone entries
 *   (Requirements 9.1 to 9.3).
 * - CacheData no longer holds the timezone or the time helpers that moved to TimeUtils
 *   (Requirement 8.4).
 * - TimeUtils stays internal. It isn't exported, mentioned by the entry points, or declared
 *   in types/ (Requirement 1.3), and every module a consumer reaches keeps the export names
 *   and kinds it had before the change (Requirement 12.1).
 * - TimeUtils loads only Node.js built-ins and modules inside src/, computes offsets with
 *   Intl.DateTimeFormat, and doesn't mention Temporal (Requirement 1.5).
 *
 * The text scans read whole files and strip nothing, so a match inside a comment counts:
 * they err toward failing. Each failure lists the file, line number, and line of every
 * match, so it can be judged without opening the file.
 *
 * Nothing here spawns a process, calls init(), or mocks anything.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (design.md, "Test files")
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cacheDataPackage from "../../../../src/index.js";
import TimeUtils from "../../../../src/lib/utils/TimeUtils.class.js";
import DebugAndLog from "../../../../src/lib/tools/DebugAndLog.class.js";

/* ****************************************************************************
 *	Paths and baselines
 */

/** The repository root, four directories up from this file. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const SRC_DIR = path.join(REPO_ROOT, "src");
const TYPES_DIR = path.join(REPO_ROOT, "types");
const DAO_CACHE_PATH = path.join(SRC_DIR, "lib", "dao-cache.js");
const TIME_UTILS_PATH = path.join(SRC_DIR, "lib", "utils", "TimeUtils.class.js");

/**
 * A string literal, in any quote style, that names moment or moment-timezone, or a file
 * inside either, such as "moment-timezone/index.js". Not global, so findLines() can reuse it.
 */
const MOMENT_MODULE_LITERAL = /(["'`])moment(?:-timezone)?(?:\/[^"'`\n]*)?\1/;

/** The dependency maps a package-lock.json entry can hold. */
const LOCK_DEPENDENCY_FIELDS = Object.freeze(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]);

/** The CacheData methods Requirement 8.4 removes. Each one existed, as a static method, before the change. */
const REMOVED_CACHE_DATA_METHODS = Object.freeze([
	"generateInternetFormattedDate",
	"convertTimestampFromSecondsToMilli",
	"convertTimestampFromMilliToSeconds",
	"nextIntervalInSeconds",
	"getOffsetInMinutes",
	"_setOffsetInMinutes",
	"getTimeZoneForInterval"
]);

/**
 * The modules a consumer reaches through require("@63klabs/cache-data"): the entry point,
 * then the three objects it exports. Each entry is [label, file, exports].
 */
const CONSUMER_MODULES = Object.freeze([
	["the package", "src/index.js", cacheDataPackage],
	["tools", "src/lib/tools/index.js", cacheDataPackage.tools],
	["cache", "src/lib/dao-cache.js", cacheDataPackage.cache],
	["endpoint", "src/lib/dao-endpoint.js", cacheDataPackage.endpoint]
]);

/**
 * The export names and kinds of each consumer module before this change (Requirement 12.1),
 * keyed by file, in declaration order. Recorded by loading the pre-change src/ (commit
 * fe65391, which predates the change) with an in-memory stand-in for moment-timezone, and
 * identical, name for name and kind for kind, to the changed tree. See kindOf() for the kinds.
 *
 * tools.AWSXRay and its alias AwsXRay are null unless X-Ray is enabled, with
 * CACHE_DATA_AWS_X_RAY_ON or CacheData_AWSXRayOn, when the package loads. They're then the
 * aws-xray-sdk-core module object, so either kind is allowed.
 */
const EXPORT_KINDS_BEFORE_CHANGE = Object.freeze({
	"src/index.js": {
		tools: "object",
		cache: "object",
		endpoint: "object"
	},
	"src/lib/tools/index.js": {
		nodeVer: "string",
		nodeVerMajor: "number",
		nodeVerMinor: "number",
		nodeVerMajorMinor: "string",
		AWS: "class",
		Aws: "class",
		AWSXRay: "object|null",
		AwsXRay: "object|null",
		ApiRequest: "class",
		APIRequest: "class",
		ImmutableObject: "class",
		Timer: "class",
		DebugAndLog: "class",
		Connection: "class",
		Connections: "class",
		ConnectionRequest: "class",
		ConnectionAuthentication: "class",
		RequestInfo: "class",
		ClientRequest: "class",
		ResponseDataModel: "class",
		Response: "class",
		AppConfig: "class",
		_ConfigSuperClass: "class",
		CachedSsmParameter: "class",
		CachedSSMParameter: "class",
		CachedSecret: "class",
		CachedParameterSecret: "class",
		CachedParameterSecrets: "class",
		jsonGenericResponse: "object",
		htmlGenericResponse: "object",
		rssGenericResponse: "object",
		xmlGenericResponse: "object",
		textGenericResponse: "object",
		printMsg: "function",
		sanitize: "function",
		obfuscate: "function",
		hashThisData: "function",
		safeClone: "function",
		flushMetrics: "function"
	},
	"src/lib/dao-cache.js": {
		Cache: "class",
		CacheableDataAccess: "class",
		TestHarness: "class"
	},
	"src/lib/dao-endpoint.js": {
		getDataDirectFromURI: "function",
		get: "function",
		send: "function"
	}
});

/* ****************************************************************************
 *	Helpers
 */

/**
 * Read a file as UTF-8 text.
 *
 * @param {string} filePath - Absolute path of the file
 * @returns {string} The file's contents
 */
function readText(filePath) {
	return readFileSync(filePath, "utf8");
}

/**
 * List every file under a directory, at any depth.
 *
 * @param {string} dir - Absolute path of the directory
 * @returns {Array<string>} Absolute file paths, sorted
 * @example
 * listFiles(TYPES_DIR); // [".../types/index.d.ts", ".../types/lib/dao-cache.d.ts", ...]
 */
function listFiles(dir) {
	return readdirSync(dir, { withFileTypes: true })
		.flatMap((entry) => {
			const entryPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				return listFiles(entryPath);
			}
			return entry.isFile() ? [entryPath] : [];
		})
		.sort();
}

/**
 * Express an absolute path relative to the repository root, with forward slashes, for
 * failure messages.
 *
 * @param {string} filePath - Absolute path
 * @returns {string} Such as "src/lib/dao-cache.js"
 */
function repoPath(filePath) {
	return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

/**
 * Find the lines of a text that match a pattern.
 *
 * @param {string} text - The text to search, such as a source file
 * @param {string|RegExp} pattern - A substring to find, or a regular expression without the g flag
 * @returns {Array<string>} One "<line number>: <trimmed line>" entry per matching line, empty when nothing matches
 * @example
 * findLines("const a = 1;\nconst b = Temporal.Now;", "Temporal"); // ["2: const b = Temporal.Now;"]
 */
function findLines(text, pattern) {
	return text.split("\n").flatMap((line, index) => {
		const isMatch = (typeof pattern === "string") ? line.includes(pattern) : pattern.test(line);
		return isMatch ? [`${index + 1}: ${line.trim()}`] : [];
	});
}

/**
 * Find the matches of a pattern in several files.
 *
 * @param {Array<string>} filePaths - Absolute paths of the files to search
 * @param {string|RegExp} pattern - As for findLines()
 * @returns {Array<string>} One "<file>:<line number>: <trimmed line>" entry per matching line, empty when nothing matches
 * @example
 * findLinesInFiles([DAO_CACHE_PATH], "moment"); // [] after the change
 */
function findLinesInFiles(filePaths, pattern) {
	return filePaths.flatMap((filePath) => findLines(readText(filePath), pattern).map((line) => `${repoPath(filePath)}:${line}`));
}

/**
 * Whether a package name is moment or moment-timezone.
 *
 * @param {*} name - A package name, or undefined
 * @returns {boolean} true for "moment" and "moment-timezone"
 */
function isMomentPackage(name) {
	return name === "moment" || name === "moment-timezone";
}

/**
 * Find every place a parsed package-lock.json names moment or moment-timezone as a package:
 * a packages entry at any depth, such as "node_modules/moment"; a dependency that any locked
 * package declares, the root project included; and, in lockfile versions 1 and 2, the
 * legacy dependencies tree and its requires maps.
 *
 * @param {Object} lock - The parsed package-lock.json
 * @returns {Array<string>} One path per place, such as 'packages["node_modules/moment"]', empty when there's none
 * @example
 * findMomentInLockfile({ packages: { "": { dependencies: { "moment-timezone": "^0.6.5" } } } });
 * // ['packages[""].dependencies["moment-timezone"]']
 */
function findMomentInLockfile(lock) {
	const found = [];
	for (const [key, entry] of Object.entries(lock.packages ?? {})) {
		const where = `packages[${JSON.stringify(key)}]`;
		// A nested key such as "node_modules/a/node_modules/moment" ends with the package name
		if (isMomentPackage(key.split("node_modules/").pop()) || isMomentPackage(entry?.name)) {
			found.push(where);
		}
		for (const field of LOCK_DEPENDENCY_FIELDS) {
			for (const name of Object.keys(entry?.[field] ?? {}).filter(isMomentPackage)) {
				found.push(`${where}.${field}[${JSON.stringify(name)}]`);
			}
		}
	}
	const walkLegacyTree = (dependencies, trail) => {
		for (const [name, entry] of Object.entries(dependencies ?? {})) {
			const where = `${trail}[${JSON.stringify(name)}]`;
			if (isMomentPackage(name)) {
				found.push(where);
			}
			for (const required of Object.keys(entry?.requires ?? {}).filter(isMomentPackage)) {
				found.push(`${where}.requires[${JSON.stringify(required)}]`);
			}
			walkLegacyTree(entry?.dependencies, `${where}.dependencies`);
		}
	};
	walkLegacyTree(lock.dependencies, "dependencies");
	return found;
}

/**
 * Find the modules a source loads with require() or import(). Comments aren't stripped, so a
 * call in an @example counts too. An argument other than one string literal, such as
 * require(name), can't be checked, so its specifier is null.
 *
 * @param {string} source - JavaScript source text
 * @returns {Array<{line: number, call: string, specifier: string|null}>} One entry per call, in source order
 * @example
 * findModuleLoads('const fs = require("node:fs");\nconst lib = require(name);');
 * // [{ line: 1, call: 'require("node:fs")', specifier: "node:fs" },
 * //  { line: 2, call: "require(name)", specifier: null }]
 */
function findModuleLoads(source) {
	return [...source.matchAll(/\b(require|import)\s*\(/g)].map((match) => {
		const argument = source.slice(match.index + match[0].length);
		const literal = /^\s*(["'`])([^"'`$\\\n]*)\1\s*\)/.exec(argument);
		return {
			line: source.slice(0, match.index).split("\n").length,
			call: `${match[1]}(${literal ? literal[1] + literal[2] + literal[1] : argument.slice(0, 40).split(")")[0].trim()})`,
			specifier: literal ? literal[2] : null
		};
	});
}

/**
 * Whether a module specifier names a Node.js built-in or a module inside src/: a node:
 * specifier, a bare built-in name such as "crypto", or a relative path that resolves inside
 * src/. Anything else, including a package from node_modules, is rejected.
 *
 * @param {string|null} specifier - The specifier, or null for an argument that isn't a string literal
 * @param {string} fromFile - Absolute path of the file that loads it
 * @returns {boolean} true when the specifier is a built-in or a module in src/
 * @example
 * isBuiltinOrPackageModule("../tools/DebugAndLog.class.js", TIME_UTILS_PATH); // true
 * isBuiltinOrPackageModule("moment-timezone", TIME_UTILS_PATH); // false
 */
function isBuiltinOrPackageModule(specifier, fromFile) {
	if (specifier === null) {
		return false;
	}
	if (specifier.startsWith("node:") || builtinModules.includes(specifier)) {
		return true;
	}
	if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
		return false;
	}
	const fromSrc = path.relative(SRC_DIR, path.resolve(path.dirname(fromFile), specifier));
	return fromSrc !== ".." && !fromSrc.startsWith(`..${path.sep}`) && !path.isAbsolute(fromSrc);
}

/**
 * The kind of an exported value: "class" for a class, "function" for any other function,
 * "null", "array", or otherwise its typeof, such as "object" or "string".
 *
 * @param {*} value - An exported value
 * @returns {string} The kind
 * @example
 * kindOf(class Timer {}); // "class"
 * kindOf(() => 0); // "function"
 * kindOf(null); // "null"
 */
function kindOf(value) {
	if (value === null) {
		return "null";
	}
	if (Array.isArray(value)) {
		return "array";
	}
	if (typeof value === "function") {
		return /^class\b/.test(Function.prototype.toString.call(value)) ? "class" : "function";
	}
	return typeof value;
}

/**
 * Describe a module's exports as a map of export name to kind, for comparison with a
 * baseline. A baseline kind can list alternatives, such as "object|null". When the actual
 * kind is one of them, the description uses the baseline's wording, so a single toEqual
 * compares names and kinds, and a failure shows only the exports that differ.
 *
 * @param {Object} moduleExports - The module's exports
 * @param {Object.<string, string>} baseline - The expected kind of each export, by name
 * @returns {Object.<string, string>} The kind of each export, by name
 * @example
 * describeExports({ Cache: class Cache {}, AWSXRay: null }, { Cache: "class", AWSXRay: "object|null" });
 * // { Cache: "class", AWSXRay: "object|null" }
 */
function describeExports(moduleExports, baseline) {
	return Object.fromEntries(Object.keys(moduleExports).map((name) => {
		const kind = kindOf(moduleExports[name]);
		const allowedKinds = Object.hasOwn(baseline, name) ? baseline[name].split("|") : [];
		return [name, allowedKinds.includes(kind) ? baseline[name] : kind];
	}));
}

/* ****************************************************************************
 *	Tests
 */

describe("TimeUtils source and dependency checks", () => {

	// Validates: Requirements 9.1, 9.2, 9.3
	describe("moment-timezone is gone", () => {

		it("no file in src/ requires or imports moment or moment-timezone", () => {
			const sourceFiles = listFiles(SRC_DIR).filter((filePath) => /\.[cm]?js$/.test(filePath));

			// The walk reaches the two files the change touched, so an empty result means something
			expect(sourceFiles).toEqual(expect.arrayContaining([DAO_CACHE_PATH, TIME_UTILS_PATH]));
			// require(), import(), and import ... from all take the module name as a string
			// literal, so matching the literal finds every form, and a name stored in a
			// variable before it's loaded
			expect(findLinesInFiles(sourceFiles, MOMENT_MODULE_LITERAL)).toEqual([]);
		});

		it("package.json declares no runtime dependencies", () => {
			const packageJson = JSON.parse(readText(path.join(REPO_ROOT, "package.json")));

			expect(Object.keys(packageJson.dependencies ?? {})).toEqual([]);
			// npm installs optional dependencies by default, so they'd be runtime dependencies too
			expect(Object.keys(packageJson.optionalDependencies ?? {})).toEqual([]);
		});

		it("package-lock.json has no moment or moment-timezone entries", () => {
			const lock = JSON.parse(readText(path.join(REPO_ROOT, "package-lock.json")));

			// The lockfile lists the dev dependency tree, so an empty result means something
			expect(Object.keys(lock.packages ?? lock.dependencies ?? {}).length).toBeGreaterThan(1);
			expect(findMomentInLockfile(lock)).toEqual([]);
		});
	});

	// Validates: Requirement 8.4
	describe("CacheData no longer handles the timezone", () => {

		it("dao-cache.js no longer contains #timeZoneForInterval, #offsetInMinutes, or _setOffsetInMinutes", () => {
			// Private # fields can't be reached by reflection, so the source is checked instead
			expect(findLinesInFiles([DAO_CACHE_PATH], /#timeZoneForInterval|#offsetInMinutes|_setOffsetInMinutes/)).toEqual([]);
		});

		it("CacheData has none of the seven methods that moved to TimeUtils", () => {
			const { CacheData } = cacheDataPackage.cache.TestHarness.getInternals();

			// The real class, so an empty result below means the methods are gone
			expect(typeof CacheData.init).toBe("function");
			// "in" also finds an inherited or accessor member, and the prototype holds instance methods
			expect(REMOVED_CACHE_DATA_METHODS.filter((name) => (name in CacheData) || (name in CacheData.prototype))).toEqual([]);
		});
	});

	// Validates: Requirements 1.3, 12.1
	describe("TimeUtils stays internal", () => {

		it("isn't among the exports of the package, tools, cache, or endpoint", () => {
			// This file and the package share module instances, so an exported TimeUtils,
			// under any name, would be the class imported above
			expect(cacheDataPackage.tools.DebugAndLog).toBe(DebugAndLog);

			const exported = CONSUMER_MODULES.flatMap(([, file, moduleExports]) => Object.entries(moduleExports)
				.filter(([name, value]) => name === "TimeUtils" || value === TimeUtils)
				.map(([name]) => `${file} exports ${name}`));
			expect(exported).toEqual([]);
		});

		it("isn't mentioned in src/index.js or src/lib/tools/index.js", () => {
			const entryPoints = ["src/index.js", "src/lib/tools/index.js"].map((file) => path.join(REPO_ROOT, file));

			expect(findLinesInFiles(entryPoints, "TimeUtils")).toEqual([]);
		});

		it("isn't declared or mentioned anywhere in types/", () => {
			const typeFiles = listFiles(TYPES_DIR);

			// The walk reaches the declarations, so an empty result means something
			expect(typeFiles.map(repoPath)).toEqual(expect.arrayContaining(["types/index.d.ts", "types/lib/dao-cache.d.ts"]));
			expect(findLinesInFiles(typeFiles, "TimeUtils")).toEqual([]);
		});

		it.each(CONSUMER_MODULES)("%s (%s) keeps the export names and kinds it had before the change", (label, file, moduleExports) => {
			const baseline = EXPORT_KINDS_BEFORE_CHANGE[file];

			// Exact: a missing, added, or renamed export, or one whose kind changed, fails here
			expect(describeExports(moduleExports, baseline)).toEqual(baseline);
		});
	});

	// Validates: Requirement 1.5
	describe("TimeUtils relies only on the Node.js runtime", () => {

		it("loads only Node.js built-ins and modules inside src/", () => {
			const loads = findModuleLoads(readText(TIME_UTILS_PATH));

			// The scan finds the require TimeUtils makes, so an empty result below means something
			expect(loads.map((load) => load.specifier)).toContain("../tools/DebugAndLog.class.js");
			expect(loads.filter((load) => !isBuiltinOrPackageModule(load.specifier, TIME_UTILS_PATH))).toEqual([]);
		});

		it("computes offsets with Intl.DateTimeFormat", () => {
			expect(findLinesInFiles([TIME_UTILS_PATH], /\bnew Intl\.DateTimeFormat\(/)).not.toEqual([]);
		});

		it("doesn't mention Temporal anywhere, comments included", () => {
			expect(findLinesInFiles([TIME_UTILS_PATH], "Temporal")).toEqual([]);
		});
	});
});
