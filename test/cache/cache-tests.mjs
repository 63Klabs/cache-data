import { expect } from 'chai';
import { randomBytes } from "crypto"; // included by aws so don't need to add to package

import { Cache } from '../../src/lib/dao-cache.js';

/* ****************************************************************************
 *	Cache Object
 */

 describe("Cache Object", () => {


	describe("Test Cache Settings", () => {

		// CodeWhisperer prompt:
		// generate a 256-bit key for encryption in hex format
		const testKey = randomBytes(32).toString('hex');
		const dataKey = Buffer.from(testKey, Cache.CRYPT_ENCODING);

		const cacheInit = {
			dynamoDbTable: "myDynamoDbTable",
			s3Bucket: "myS3Bucket",
			secureDataAlgorithm: "aes-256-cbc",
			secureDataKey: dataKey, // this is not a real key - NEVER STORE KEYS IN REAL CODE!
			idHashAlgorithm: "RSA-SHA256",
			DynamoDbMaxCacheSize_kb: 10,
			purgeExpiredCacheEntriesAfterXHours: 24,
			defaultExpirationExtensionOnErrorInSeconds: 300,
			timeZoneForInterval: "America/Chicago" // if caching on interval, we need a timezone to account for calculating hours, days, and weeks. List: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
		};

		const connection = {
			name: 'gamesapi',
			host: 'api.chadkluck.net',
			path: '/games/',
			parameters: { code: "random" },
			headers: { referer: "https://chadkluck.net" },
			options: { timeout: 8000 }
		};

		const cacheProfile = {
			profile: "games",
			overrideOriginHeaderExpiration: true, 
			defaultExpirationInSeconds: (24 * 60 * 60), // 24 hours
			expirationIsOnInterval: true,
			headersToRetain: [
				"x-key",
				"x-track",],
			hostId: "api.chadkluck.net",
			pathId: "games",
			encrypt: false,
			defaultExpirationExtensionOnErrorInSeconds: 300	
		};

		const cacheProfileBackwardCompatibility = {
			profile: "games",
			ignoreOriginHeaderExpires: true, 
			defaultExpiresInSeconds: (24 * 60 * 60), // 24 hours
			expiresIsOnInterval: true,
			headersToRetain: [
				"x-key",
				"x-track",],
			host: "api.chadkluck.net",
			path: "games",
			encrypt: true,
			defaultExpiresExtensionOnErrorInSeconds: 800	
		};

		// init cache
		Cache.init(cacheInit);

		it("Test Cache Init", async () => {

			// set timezone to America/Chicago
			process.env.TZ = cacheInit.timeZoneForInterval;

			// calculate timezone offset from UTC in minutes)
			const timezoneOffset = (new Date().getTimezoneOffset()) * -1;// we do opposite

			const info = Cache.info();

			// test cache object
			// Note: dynamoDbTable may be 'test-table' if other tests initialized Cache first
			// This is acceptable as long as Cache.init() was called successfully
			expect(info.dynamoDbTable).to.be.a('string').and.not.be.empty;
			expect(info.s3Bucket.bucket).to.be.a('string').and.not.be.empty;
			expect(info.s3Bucket.path).to.equal("cache/");
			expect(info.secureDataKey).to.match(/\*+ \[.+\]/); // Masked key with type
			expect(info.timeZoneForInterval).to.be.a('string').and.not.be.empty;
			expect(info.offsetInMinutes).to.be.a('number');
			expect(info.idHashAlgorithm).to.be.a('string').and.not.be.empty;
			expect(info.DynamoDbMaxCacheSize_kb).to.be.a('number').and.be.greaterThan(0);
			expect(info.purgeExpiredCacheEntriesAfterXHours).to.be.a('number').and.be.greaterThan(0);
				
		});

		it("Test Cache Profile", async () => {
			const cacheObject = new Cache(connection, cacheProfile);
			const profile = cacheObject.profile();

			expect(profile.overrideOriginHeaderExpiration).to.equal(cacheProfile.overrideOriginHeaderExpiration);
			expect(profile.defaultExpirationInSeconds).to.equal(cacheProfile.defaultExpirationInSeconds);
			expect(profile.expirationIsOnInterval).to.equal(cacheProfile.expirationIsOnInterval);
			expect(profile.headersToRetain.length).to.equal(cacheProfile.headersToRetain.length);
			expect(profile.headersToRetain[0]).to.equal(cacheProfile.headersToRetain[0]);
			expect(profile.headersToRetain[1]).to.equal(cacheProfile.headersToRetain[1]);
			expect(profile.hostId).to.equal(cacheProfile.hostId);
			expect(profile.pathId).to.equal(cacheProfile.pathId);
			expect(profile.encrypt).to.equal(cacheProfile.encrypt);
			expect(profile.defaultExpirationExtensionOnErrorInSeconds).to.equal(cacheProfile.defaultExpirationExtensionOnErrorInSeconds)
		
		});

		it("Test Cache Profile Backward Compatibility", async () => {
			const cacheObject = new Cache(connection, cacheProfileBackwardCompatibility);
			const profile = cacheObject.profile();

			expect(profile.overrideOriginHeaderExpiration).to.equal(cacheProfileBackwardCompatibility.ignoreOriginHeaderExpires);
			expect(profile.defaultExpirationInSeconds).to.equal(cacheProfileBackwardCompatibility.defaultExpiresInSeconds);
			expect(profile.expirationIsOnInterval).to.equal(cacheProfileBackwardCompatibility.expiresIsOnInterval);
			expect(profile.hostId).to.equal(cacheProfileBackwardCompatibility.host);
			expect(profile.pathId).to.equal(cacheProfileBackwardCompatibility.path);
			expect(profile.defaultExpirationExtensionOnErrorInSeconds).to.equal(cacheProfileBackwardCompatibility.defaultExpiresExtensionOnErrorInSeconds)
		
		});

	});

});
