/**
 * Consumer compilation test for the cache module.
 * This file exercises type resolution for Cache, CacheableDataAccess,
 * TestHarness, and related interfaces. Compiled with `tsc --noEmit` only.
 *
 * Validates: Requirements 1.2, 3.3, 7.1
 */

import cacheData = require("@63klabs/cache-data");

// ---------------------------------------------------------------------------
// Access cache module
// ---------------------------------------------------------------------------
const cache = cacheData.cache;

// ---------------------------------------------------------------------------
// CacheInitParameters interface
// ---------------------------------------------------------------------------
const initParams: cacheData.cache.CacheInitParameters = {
	dynamoDbTable: "my-cache-table",
	s3Bucket: "my-cache-bucket",
	secureDataAlgorithm: "aes-256-cbc",
	secureDataKey: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
	idHashAlgorithm: "sha256",
	DynamoDbMaxCacheSize_kb: 10,
	purgeExpiredCacheEntriesAfterXHours: 24,
	timeZoneForInterval: "America/Chicago",
	useToolsHash: true,
	useInMemoryCache: true,
	inMemoryCacheMaxEntries: 500,
	inMemoryCacheEntriesPerGB: 200,
	inMemoryCacheDefaultMaxEntries: 100
};

// ---------------------------------------------------------------------------
// Cache class - static methods
// ---------------------------------------------------------------------------
cache.Cache.init(initParams);

const info = cache.Cache.info();
const hashAlgo: string = info.idHashAlgorithm;
const table: string | null = info.dynamoDbTable;
const bucket: { bucket: string | null; path: string } = info.s3Bucket;
const secureAlgo: string = info.secureDataAlgorithm;
const useInMem: boolean = info.useInMemoryCache;

const boolTrue: boolean = cache.Cache.bool("true");
const boolFalse: boolean = cache.Cache.bool(0);

const idHash: string = cache.Cache.generateIdHash({ host: "api.example.com", path: "/users" });
const idHashStr: string = cache.Cache.generateIdHash("MY-ID-123");
const idHashArr: string = cache.Cache.generateIdHash(["part1", "part2"]);

const etag: string = cache.Cache.generateEtag("abc123", "body content");
const lowered: Record<string, any> = cache.Cache.lowerCaseKeys({ "Content-Type": "application/json" });
const dateStr: string = cache.Cache.generateInternetFormattedDate(1700000000);
const dateStrMs: string = cache.Cache.generateInternetFormattedDate(1700000000000, true);
const nextInterval: number = cache.Cache.nextIntervalInSeconds(300);
const kbytes: number = cache.Cache.calculateKBytes("hello world");
const lowerArr: string[] = cache.Cache.convertToLowerCaseArray("Content-Type,Accept");
const lowerArr2: string[] = cache.Cache.convertToLowerCaseArray(["Content-Type", "Accept"]);
const multipart: string | null = cache.Cache.multipartId(["part1", "part2"], "/");
const parsed: number = cache.Cache.parseToSeconds("2024-01-01T00:00:00Z");
const testIntervalResult = cache.Cache.testInterval();

// Static constants
const publicConst: string = cache.Cache.PUBLIC;
const privateConst: string = cache.Cache.PRIVATE;
const statusNoCache: string = cache.Cache.STATUS_NO_CACHE;
const statusExpired: string = cache.Cache.STATUS_EXPIRED;
const statusCacheSame: string = cache.Cache.STATUS_CACHE_SAME;
const statusCacheInMem: string = cache.Cache.STATUS_CACHE_IN_MEM;
const statusCache: string = cache.Cache.STATUS_CACHE;
const statusCacheError: string = cache.Cache.STATUS_CACHE_ERROR;
const statusOrigNotMod: string = cache.Cache.STATUS_ORIGINAL_NOT_MODIFIED;
const statusOrigError: string = cache.Cache.STATUS_ORIGINAL_ERROR;
const statusForced: string = cache.Cache.STATUS_FORCED;

// ---------------------------------------------------------------------------
// Cache class - instance methods
// ---------------------------------------------------------------------------
const cacheInstance = new cache.Cache(
	{ host: "api.example.com", path: "/users" },
	{ profile: "default", defaultExpirationInSeconds: 300, encrypt: false }
);

const profile = cacheInstance.profile();
const overrideExp: boolean = profile.overrideOriginHeaderExpiration;
const defaultExp: number = profile.defaultExpirationInSeconds;
const isInterval: boolean = profile.expirationIsOnInterval;
const headersRetain: string[] = profile.headersToRetain;
const hostId: string = profile.hostId;
const pathId: string = profile.pathId;
const encrypt: boolean = profile.encrypt;

async function testCacheInstance(): Promise<void> {
	const data: cacheData.cache.CacheDataFormat = await cacheInstance.read();
	const cacheBody: string | null = data.cache.body;
	const cacheHeaders: Record<string, string> | null = data.cache.headers;
	const cacheExpires: number = data.cache.expires;
	const cacheStatusCode: string | null = data.cache.statusCode;

	const getData: cacheData.cache.CacheDataFormat = cacheInstance.get();
	const sourceStatus: string = cacheInstance.getSourceStatus();
	const status: string = cacheInstance.getStatus();
	const etagVal: string | null = cacheInstance.getETag();
	const lastMod: string | null = cacheInstance.getLastModified();
	const expires: number = cacheInstance.getExpires();
	const expiresGmt: string = cacheInstance.getExpiresGMT();
	const headers: Record<string, string> | null = cacheInstance.getHeaders();
	const header: string | number | null = cacheInstance.getHeader("content-type");
	const statusCode: string | null = cacheInstance.getStatusCode();
	const errorCode: number = cacheInstance.getErrorCode();
	const classification: string = cacheInstance.getClassification();
	const syncedNow: number = cacheInstance.getSyncedNowTimestampInSeconds();

	const bodyStr: string | object | null = cacheInstance.getBody(false);
	const bodyParsed: string | object | null = cacheInstance.getBody(true);
	const response = cacheInstance.getResponse(true);
	if (response) {
		const respStatusCode: string = response.statusCode;
		const respHeaders: Record<string, string> = response.headers;
		const respBody: string | object | null = response.body;
	}

	const gatewayResp = cacheInstance.generateResponseForAPIGateway({
		ifNoneMatch: '"etag123"',
		ifModifiedSince: "Wed, 28 Jul 2021 12:24:11 GMT"
	});
	const gwStatusCode: string = gatewayResp.statusCode;
	const gwHeaders: Record<string, string> = gatewayResp.headers;
	const gwBody: string | null = gatewayResp.body;

	const cacheControl: string = cacheInstance.getCacheControlHeaderValue();
	const cacheIdHash: string = cacheInstance.getIdHash();
	const needsRefresh: boolean = cacheInstance.needsRefresh();
	const isExpired: boolean = cacheInstance.isExpired();
	const isEmpty: boolean = cacheInstance.isEmpty();
	const isPrivate: boolean = cacheInstance.isPrivate();
	const isPublic: boolean = cacheInstance.isPublic();

	const extended: boolean = await cacheInstance.extendExpires(cache.Cache.STATUS_ORIGINAL_ERROR, 60, 500);
	const defaultExpires: number = cacheInstance.calculateDefaultExpires();
	const secsLeft: number = cacheInstance.calculateSecondsLeftUntilExpires();

	const updated: cacheData.cache.CacheDataFormat = await cacheInstance.update(
		'{"data":"value"}',
		{ "content-type": "application/json" },
		"200",
		0,
		null
	);

	const testData: object = cacheInstance.test();
}

// ---------------------------------------------------------------------------
// CacheableDataAccess class
// ---------------------------------------------------------------------------
async function testCacheableDataAccess(): Promise<void> {
	const primed: boolean = await cache.CacheableDataAccess.prime();

	const cachePolicy: cacheData.tools.CacheProfileObject = {
		profile: "default",
		overrideOriginHeaderExpiration: true,
		defaultExpirationInSeconds: 60,
		expirationIsOnInterval: false,
		headersToRetain: [],
		hostId: "api.example.com",
		pathId: "/users",
		encrypt: true
	};

	const apiCallFn = async (connection: object, data?: object | null) => ({
		success: true,
		statusCode: 200,
		body: { users: [] } as object | string | null,
		headers: { "content-type": "application/json" } as Record<string, string>
	});

	const connectionObj = {
		method: "GET",
		host: "api.example.com",
		path: "/users"
	};

	const cacheObj: cacheData.cache.Cache = await cache.CacheableDataAccess.getData(
		cachePolicy,
		apiCallFn,
		connectionObj,
		null,
		{ path: "users", id: "123" }
	);

	// Verify returned Cache instance has expected methods
	const body = cacheObj.getBody(true);
	const cacheStatus = cacheObj.getStatus();
	const cacheIsExpired = cacheObj.isExpired();
}

// ---------------------------------------------------------------------------
// CacheDataFormat interface
// ---------------------------------------------------------------------------
const cacheDataFormat: cacheData.cache.CacheDataFormat = {
	cache: {
		body: '{"key":"value"}',
		headers: { "content-type": "application/json" },
		expires: 1700000000,
		statusCode: "200"
	}
};

// Nullable fields
const cacheDataFormatNulls: cacheData.cache.CacheDataFormat = {
	cache: {
		body: null,
		headers: null,
		expires: 0,
		statusCode: null
	}
};

// ---------------------------------------------------------------------------
// TestHarness class
// ---------------------------------------------------------------------------
const internals = cache.TestHarness.getInternals();
const cacheDataClass: any = internals.CacheData;
const s3CacheClass: any = internals.S3Cache;
const dynamoDbCacheClass: any = internals.DynamoDbCache;
