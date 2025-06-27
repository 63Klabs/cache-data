import { expect } from 'chai';
import { randomBytes } from "crypto";
import { execSync } from 'child_process';

/* ****************************************************************************
 *	Cache Validation Tests - Run each test in isolation
 *  Since these tests are validating the initialization of the Cache class,
 *  they must be run in isolation to ensure that the environment is clean
 *  for each test.
 */

// Set the environment variable for AWS region
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

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

	it("Should throw error for invalid timeZoneForInterval parameter", () => {
		const modulePath = new URL('../../src/lib/dao-cache.js', import.meta.url).href;
		const testCode = `process.env.AWS_REGION = '${AWS_REGION}'; import { randomBytes } from 'crypto'; const { Cache } = await import('${modulePath}'); const testKey = randomBytes(32).toString('hex'); const dataKey = Buffer.from(testKey, 'hex'); try { Cache.init({ dynamoDbTable: 'test', s3Bucket: 'test', secureDataKey: dataKey, timeZoneForInterval: '' }); process.exit(1); } catch (error) { if (error.message === 'timeZoneForInterval must be a non-empty string') process.exit(0); else process.exit(1); }`;
		try {
			execSync(`node --input-type=module -e "${testCode}"`);
		} catch (error) {
			if (error.status !== 0) throw new Error('Test failed');
		}
	});

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