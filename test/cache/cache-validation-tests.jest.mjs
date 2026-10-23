import { describe, it, expect } from '@jest/globals';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

/* ****************************************************************************
 *	Cache Validation Tests - Run each test in isolation
 *  Since these tests are validating the initialization of the Cache class,
 *  they must be run in isolation to ensure that the environment is clean
 *  for each test.
 */

// Set the environment variable for AWS region
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

/* ****************************************************************************
 *	timeZoneForInterval tests (Spec: .kiro/specs/1-4-0-fully-implement-timezone)
 *  These run fixed child code. Its only input, the dao-cache.js file URL,
 *  arrives through the TZ_TEST_MODULE environment variable, so nothing is
 *  interpolated into the code.
 */

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DAO_CACHE_MODULE_URL = pathToFileURL(path.join(PROJECT_ROOT, 'src', 'lib', 'dao-cache.js')).href;

// The child prints its JSON result on one line after this marker
const RESULT_MARKER = 'RESULT:';
const CHILD_TIMEOUT_MS = 20000;
const CHILD_TEST_TIMEOUT_MS = 60000;

/**
 * Run fixed ES module code in a fresh Node.js process and return the JSON it
 * prints after the RESULT: marker.
 *
 * The child environment is a copy of process.env with AWS_REGION and
 * TZ_TEST_MODULE set, and CACHE_DATA_TIME_ZONE_FOR_INTERVAL removed so the
 * developer's shell can't supply a timezone.
 *
 * @param {string} childCode - Fixed ES module source for the child
 * @returns {Object|null} The parsed result, or null when the child printed no RESULT line
 * @throws {Error} When the child exits non-zero, times out, or can't be spawned
 * @example
 * const result = runIsolatedTimeZoneTest('console.log("RESULT:" + JSON.stringify({ ok: true }));');
 * // result is { ok: true }
 */
function runIsolatedTimeZoneTest(childCode) {
	const env = { ...process.env, AWS_REGION, TZ_TEST_MODULE: DAO_CACHE_MODULE_URL };
	delete env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL;

	// >! Use execFileSync with an argument array: no shell is spawned, so the
	// >! child code reaches node as one literal argument and is never shell-interpreted
	const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', childCode], {
		cwd: PROJECT_ROOT,
		env,
		encoding: 'utf8',
		timeout: CHILD_TIMEOUT_MS,
		stdio: ['ignore', 'pipe', 'pipe']
	});

	const resultLine = stdout.split(/\r?\n/).filter((line) => line.startsWith(RESULT_MARKER)).pop();
	return (resultLine === undefined) ? null : JSON.parse(resultLine.slice(RESULT_MARKER.length));
}

describe("Cache Validation Tests", () => {

	it("Should throw error for invalid DynamoDbMaxCacheSize_kb parameter", () => {
		const modulePath = new URL('../../src/lib/dao-cache.js', import.meta.url).href;
		const testCode = `process.env.AWS_REGION = '${AWS_REGION}'; import { randomBytes } from 'crypto'; const { Cache } = await import('${modulePath}'); const testKey = randomBytes(32).toString('hex'); const dataKey = Buffer.from(testKey, 'hex'); try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, DynamoDbMaxCacheSize_kb: -5 }); process.exit(1); } catch (error) { if (error.message === 'DynamoDbMaxCacheSize_kb must be a positive integer') process.exit(0); else process.exit(1); }`;
		try {
			execSync(`node --input-type=module -e "${testCode}"`);
		} catch (error) {
			if (error.status !== 0) throw new Error('Test failed');
		}
	});

	it("Should throw error for invalid purgeExpiredCacheEntriesAfterXHours parameter", () => {
		const modulePath = new URL('../../src/lib/dao-cache.js', import.meta.url).href;
		const testCode = `process.env.AWS_REGION = '${AWS_REGION}'; import { randomBytes } from 'crypto'; const { Cache } = await import('${modulePath}'); const testKey = randomBytes(32).toString('hex'); const dataKey = Buffer.from(testKey, 'hex'); try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, purgeExpiredCacheEntriesAfterXHours: 0 }); process.exit(1); } catch (error) { if (error.message === 'purgeExpiredCacheEntriesAfterXHours must be a positive integer') process.exit(0); else process.exit(1); }`;
		try {
			execSync(`node --input-type=module -e "${testCode}"`);
		} catch (error) {
			if (error.status !== 0) throw new Error('Test failed');
		}
	});

	it("Should default timeZoneForInterval to Etc/UTC when it is an empty string", () => {
		// The result is { timeZoneForInterval } when Cache.init() succeeds, or { error } when it throws
		const childCode = `
			import { randomBytes } from "node:crypto";
			const { Cache } = await import(process.env.TZ_TEST_MODULE);
			let result;
			try {
				Cache.init({ dynamoDbTable: "test", s3Bucket: "test", secureDataKey: randomBytes(32), timeZoneForInterval: "" });
				result = { timeZoneForInterval: Cache.info().timeZoneForInterval };
			} catch (error) {
				result = { error: error?.message ?? String(error) };
			}
			console.log("RESULT:" + JSON.stringify(result));
		`;
		const result = runIsolatedTimeZoneTest(childCode);
		expect(result).toEqual({ timeZoneForInterval: "Etc/UTC" });
	}, CHILD_TEST_TIMEOUT_MS);

	it("Should throw a readable error for an invalid timeZoneForInterval name", () => {
		// The result is { timeZoneForInterval } when Cache.init() succeeds, or { error } when it throws
		const childCode = `
			import { randomBytes } from "node:crypto";
			const { Cache } = await import(process.env.TZ_TEST_MODULE);
			let result;
			try {
				Cache.init({ dynamoDbTable: "test", s3Bucket: "test", secureDataKey: randomBytes(32), timeZoneForInterval: "Invalid/Zone" });
				result = { timeZoneForInterval: Cache.info().timeZoneForInterval };
			} catch (error) {
				result = { error: error?.message ?? String(error) };
			}
			console.log("RESULT:" + JSON.stringify(result));
		`;
		const result = runIsolatedTimeZoneTest(childCode);
		expect(result).toEqual({ error: 'Invalid timezone "Invalid/Zone". Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".' });
	}, CHILD_TEST_TIMEOUT_MS);

	it("Should throw error for invalid environment variable CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB", () => {
		const modulePath = new URL('../../src/lib/dao-cache.js', import.meta.url).href;
		const testCode = `process.env.AWS_REGION = '${AWS_REGION}'; process.env.CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB = 'invalid'; import { randomBytes } from 'crypto'; const { Cache } = await import('${modulePath}'); const testKey = randomBytes(32).toString('hex'); const dataKey = Buffer.from(testKey, 'hex'); try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey }); process.exit(1); } catch (error) { if (error.message === 'CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB must be a positive integer') process.exit(0); else process.exit(1); }`;
		try {
			execSync(`node --input-type=module -e "${testCode}"`);
		} catch (error) {
			if (error.status !== 0) throw new Error('Test failed');
		}
	});

	it("Should use valid environment variables when parameters not provided", () => {
		const modulePath = new URL('../../src/lib/dao-cache.js', import.meta.url).href;
		const testCode = `process.env.AWS_REGION = '${AWS_REGION}'; process.env.CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB = '15'; process.env.CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS = '48'; process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL = 'America/New_York'; import { randomBytes } from 'crypto'; const { Cache } = await import('${modulePath}'); const testKey = randomBytes(32).toString('hex'); const dataKey = Buffer.from(testKey, 'hex'); Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey }); const info = Cache.info(); if (info.DynamoDbMaxCacheSize_kb === 15 && info.purgeExpiredCacheEntriesAfterXHours === 48 && info.timeZoneForInterval === 'America/New_York') process.exit(0); else process.exit(1);`;
		try {
			execSync(`node --input-type=module -e "${testCode}"`);
		} catch (error) {
			if (error.status !== 0) throw new Error('Test failed');
		}
	});

	it("Should use environment variables when parameters object is empty", () => {
		const modulePath = new URL('../../src/lib/dao-cache.js', import.meta.url).href;
		const testCode = `process.env.AWS_REGION = '${AWS_REGION}'; process.env.CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB = '20'; process.env.CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS = '72'; process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL = 'Europe/London'; import { randomBytes } from 'crypto'; const { Cache } = await import('${modulePath}'); const testKey = randomBytes(32).toString('hex'); const dataKey = Buffer.from(testKey, 'hex'); Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey }); const info = Cache.info(); if (info.DynamoDbMaxCacheSize_kb === 20 && info.purgeExpiredCacheEntriesAfterXHours === 72 && info.timeZoneForInterval === 'Europe/London') process.exit(0); else process.exit(1);`;
		try {
			execSync(`node --input-type=module -e "${testCode}"`);
		} catch (error) {
			if (error.status !== 0) throw new Error('Test failed');
		}
	});

});
