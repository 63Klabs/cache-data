/**
 * Cache module for the @63klabs/cache-data package.
 *
 * Provides distributed caching using DynamoDB and S3 with optional in-memory
 * caching, encryption for sensitive data, and interval-based expiration.
 *
 * @module cache
 */

import tools = require("./tools/index");

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Shape of cached data objects returned by cache read operations.
 * Contains a nested `cache` property with the cached content and metadata.
 */
export interface CacheDataFormat {
	/** The cached data container */
	cache: {
		/** The cached content body (typically a JSON string) */
		body: string | null;
		/** HTTP headers stored with the cached content */
		headers: Record<string, string> | null;
		/** Expiration timestamp in seconds since Unix epoch */
		expires: number;
		/** HTTP status code from the origin response */
		statusCode: string | null;
	};
}

/**
 * Configuration parameters for Cache.init().
 * All parameters can alternatively be set via environment variables.
 */
export interface CacheInitParameters {
	/** DynamoDB table name for cache storage. Env: CACHE_DATA_DYNAMO_DB_TABLE */
	dynamoDbTable?: string;
	/** S3 bucket name for large cache objects. Env: CACHE_DATA_S3_BUCKET */
	s3Bucket?: string;
	/** Encryption algorithm for private data. Env: CACHE_DATA_SECURE_DATA_ALGORITHM. Default: 'aes-256-cbc' */
	secureDataAlgorithm?: string;
	/** Encryption key for private data. Required, no env var for security. */
	secureDataKey: string | Buffer | object;
	/** Hash algorithm for generating cache IDs. Env: CACHE_DATA_ID_HASH_ALGORITHM. Default: 'RSA-SHA256' */
	idHashAlgorithm?: string;
	/** Maximum size in KB for DynamoDB storage before routing to S3. Env: CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB. Default: 10 */
	DynamoDbMaxCacheSize_kb?: number;
	/** Hours after expiration before purging entries. Env: CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS. Default: 24 */
	purgeExpiredCacheEntriesAfterXHours?: number;
	/** TZ database timezone for interval calculations. Env: CACHE_DATA_TIME_ZONE_FOR_INTERVAL. Default: 'Etc/UTC' */
	timeZoneForInterval?: string;
	/** Whether to use the built-in tools hash method instead of object-hash */
	useToolsHash?: boolean;
	/** Enable in-memory (L0) caching. Env: CACHE_USE_IN_MEMORY */
	useInMemoryCache?: boolean;
	/** Maximum entries for in-memory cache */
	inMemoryCacheMaxEntries?: number;
	/** Entries per GB of memory for in-memory cache sizing */
	inMemoryCacheEntriesPerGB?: number;
	/** Default maximum entries for in-memory cache */
	inMemoryCacheDefaultMaxEntries?: number;
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

/**
 * The Cache class handles settings for the cache system and provides static
 * utility methods for cache operations. It must be initialized before use
 * with Cache.init().
 *
 * Reading of the cache is done through CacheableDataAccess.getData().
 *
 * @example
 * // Initialize the cache system (once at application boot)
 * cache.Cache.init({
 *   dynamoDbTable: process.env.CACHE_DATA_DYNAMO_DB_TABLE,
 *   s3Bucket: process.env.CACHE_DATA_S3_BUCKET,
 *   secureDataKey: Buffer.from(encryptionKey, 'hex'),
 *   idHashAlgorithm: 'sha256'
 * });
 *
 * // Check configuration
 * const info = cache.Cache.info();
 * console.log(info.idHashAlgorithm);
 */
export class Cache {
	/** Classification constant for public (non-encrypted) cache data */
	static PUBLIC: string;
	/** Classification constant for private (encrypted) cache data */
	static PRIVATE: string;
	/** Encoding used for encrypted data */
	static CRYPT_ENCODING: string;
	/** Encoding used for plaintext data */
	static PLAIN_ENCODING: string;

	/** Status: data fetched from origin, no cache existed */
	static STATUS_NO_CACHE: string;
	/** Status: cached data was expired, fetched from origin */
	static STATUS_EXPIRED: string;
	/** Status: origin returned same data as cache */
	static STATUS_CACHE_SAME: string;
	/** Status: data served from in-memory cache */
	static STATUS_CACHE_IN_MEM: string;
	/** Status: data served from cache */
	static STATUS_CACHE: string;
	/** Status: error reading from cache */
	static STATUS_CACHE_ERROR: string;
	/** Status: origin returned 304 Not Modified */
	static STATUS_ORIGINAL_NOT_MODIFIED: string;
	/** Status: error fetching from origin */
	static STATUS_ORIGINAL_ERROR: string;
	/** Status: cache update was forced */
	static STATUS_FORCED: string;

	/**
	 * Create a new Cache instance for a specific connection and cache profile.
	 *
	 * @param connection - Object containing data location and connection details used to generate a unique cache ID
	 * @param cacheProfile - Cache policy configuration
	 */
	constructor(connection: object, cacheProfile?: tools.CacheProfileObject | null);

	/**
	 * Initialize all data common to all Cache objects. Must be called once at
	 * application boot, NOT per request or after new Cache().
	 *
	 * Environment variables can be used to set the S3 bucket, DynamoDB location, etc.
	 * Use Cache.info() to check init values.
	 *
	 * @param parameters - Configuration parameters for the cache system
	 * @throws Error if parameters is not an object or is null
	 * @throws Error if secureDataKey is not provided
	 * @example
	 * cache.Cache.init({
	 *   dynamoDbTable: process.env.CACHE_DATA_DYNAMO_DB_TABLE,
	 *   s3Bucket: process.env.CACHE_DATA_S3_BUCKET,
	 *   secureDataAlgorithm: process.env.CACHE_DATA_SECURE_DATA_ALGORITHM,
	 *   secureDataKey: Buffer.from(params.app.crypt_secureDataKey, cache.Cache.CRYPT_ENCODING),
	 *   idHashAlgorithm: process.env.CACHE_DATA_ID_HASH_ALGORITHM,
	 *   DynamoDbMaxCacheSize_kb: parseInt(process.env.CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB, 10),
	 *   purgeExpiredCacheEntriesAfterXHours: parseInt(process.env.CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS, 10),
	 *   timeZoneForInterval: process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL
	 * });
	 */
	static init(parameters: CacheInitParameters): void;

	/**
	 * Get comprehensive configuration information about the Cache system.
	 *
	 * @returns Configuration information object with all cache settings
	 * @example
	 * const info = Cache.info();
	 * console.log(`Hash algorithm: ${info.idHashAlgorithm}`);
	 * console.log(`DynamoDB table: ${info.dynamoDbTable}`);
	 */
	static info(): {
		idHashAlgorithm: string;
		dynamoDbTable: string | null;
		s3Bucket: { bucket: string | null; path: string };
		secureDataAlgorithm: string;
		secureDataKey: string;
		DynamoDbMaxCacheSize_kb: number;
		purgeExpiredCacheEntriesAfterXHours: number;
		timeZoneForInterval: string;
		offsetInMinutes: number;
		useInMemoryCache: boolean;
		inMemoryCache?: object;
	};

	/**
	 * Convert a value to boolean with strict handling for string values.
	 *
	 * JavaScript's Boolean() treats any non-empty string as true, including "false".
	 * This method provides strict conversion where only "true", "1", 1, and true
	 * return true. All other values return false.
	 *
	 * @param value - A value to convert to boolean
	 * @returns True only if value is explicitly truthy ("true", "1", 1, or true)
	 * @example
	 * Cache.bool("true");    // true
	 * Cache.bool("false");   // false
	 * Cache.bool("1");       // true
	 * Cache.bool(1);         // true
	 * Cache.bool(null);      // false
	 */
	static bool(value: any): boolean;

	/**
	 * Generate a unique hash identifier for a cache entry. Uses object-hash to
	 * create a deterministic hash from an object, array, or string.
	 *
	 * Object-hash normalizes object structures so that objects with the same
	 * key/value pairs produce the same hash regardless of property order.
	 *
	 * @param idObject - Object, Array, or string to hash
	 * @returns A hex hash string representing the object
	 * @example
	 * const connection = { host: 'api.example.com', path: '/users' };
	 * const hash = Cache.generateIdHash(connection);
	 * console.log(hash); // "a1b2c3d4e5f6..."
	 *
	 * @example
	 * const hash = Cache.generateIdHash('MYID-03-88493');
	 */
	static generateIdHash(idObject: object | any[] | string): string;

	/**
	 * Generate an ETag hash for cache validation.
	 *
	 * @param idHash - The unique identifier hash for the cache entry
	 * @param content - The content body to include in the ETag calculation
	 * @returns A 10-character ETag hash
	 */
	static generateEtag(idHash: string, content: string): string;

	/**
	 * Convert all keys in an object to lowercase.
	 *
	 * @param objectWithKeys - Object whose keys should be lowercased
	 * @returns New object with all keys converted to lowercase
	 */
	static lowerCaseKeys(objectWithKeys: object): Record<string, any>;

	/**
	 * Generate an internet-formatted date string for HTTP headers.
	 *
	 * @param timestamp - Unix timestamp (seconds by default, or milliseconds if inMilliseconds is true)
	 * @param inMilliseconds - Set to true if timestamp is in milliseconds
	 * @returns Internet-formatted date string (e.g., "Wed, 28 Jul 2021 12:24:11 GMT")
	 */
	static generateInternetFormattedDate(timestamp: number, inMilliseconds?: boolean): string;

	/**
	 * Calculate the next interval boundary timestamp.
	 *
	 * @param intervalInSeconds - The interval duration in seconds
	 * @param timestampInSeconds - The timestamp to calculate from (0 = use current time)
	 * @returns The next interval boundary timestamp in seconds
	 */
	static nextIntervalInSeconds(intervalInSeconds: number, timestampInSeconds?: number): number;

	/**
	 * Calculate the size of a string in kilobytes.
	 *
	 * @param aString - The string to measure
	 * @param encode - Character encoding to use for byte calculation
	 * @returns String size in kilobytes, rounded to 3 decimal places
	 */
	static calculateKBytes(aString: string, encode?: string): number;

	/**
	 * Convert a comma-delimited string or array to a lowercase array.
	 *
	 * @param list - Comma-delimited string or array to convert
	 * @returns Array with all values converted to lowercase
	 */
	static convertToLowerCaseArray(list: string | string[]): string[];

	/**
	 * Convert an array to a string using a join delimiter.
	 *
	 * @param identifierArrayOrString - An array to join or a string to pass through
	 * @param glue - The delimiter to place between array elements
	 * @returns The array in string form delimited by the glue, or null if invalid input
	 */
	static multipartId(identifierArrayOrString: any[] | string, glue?: string): string | null;

	/**
	 * Convert a date string to a Unix timestamp in seconds.
	 *
	 * @param date - Date string to parse
	 * @returns The date in seconds since Unix epoch, or 0 if parsing fails
	 */
	static parseToSeconds(date: string): number;

	/**
	 * Test the interval calculation functionality.
	 *
	 * @returns Object containing cache info and test results with next interval timestamps
	 */
	static testInterval(): { info: object; tests: object };

	// -----------------------------------------------------------------------
	// Instance methods
	// -----------------------------------------------------------------------

	/**
	 * Get the cache profile configuration for this Cache instance.
	 *
	 * @returns Cache profile configuration object
	 */
	profile(): {
		overrideOriginHeaderExpiration: boolean;
		defaultExpirationInSeconds: number;
		defaultExpirationExtensionOnErrorInSeconds: number;
		expirationIsOnInterval: boolean;
		headersToRetain: string[];
		hostId: string;
		pathId: string;
		encrypt: boolean;
	};

	/**
	 * Read cached data from storage (DynamoDB and potentially S3).
	 *
	 * @returns Formatted cache data
	 */
	read(): Promise<CacheDataFormat>;

	/**
	 * Get the complete cache data object.
	 *
	 * @returns The complete cache data object
	 */
	get(): CacheDataFormat;

	/**
	 * Get the source status of the cache data.
	 *
	 * @returns The source status string
	 */
	getSourceStatus(): string;

	/**
	 * Get the current status of the cache (alias for getSourceStatus).
	 *
	 * @returns The cache status string
	 */
	getStatus(): string;

	/**
	 * Get the ETag header value from the cached data.
	 *
	 * @returns The ETag value, or null if not present
	 */
	getETag(): string | null;

	/**
	 * Get the Last-Modified header value from the cached data.
	 *
	 * @returns The Last-Modified header value, or null if not present
	 */
	getLastModified(): string | null;

	/**
	 * Get the expiration timestamp of the cached data.
	 *
	 * @returns Expiration timestamp in seconds since Unix epoch
	 */
	getExpires(): number;

	/**
	 * Get the expiration as a GMT-formatted date string.
	 *
	 * @returns Expiration as internet-formatted date string
	 */
	getExpiresGMT(): string;

	/**
	 * Get all HTTP headers from the cached data.
	 *
	 * @returns Object containing all cached headers, or null if no cache data
	 */
	getHeaders(): Record<string, string> | null;

	/**
	 * Get a specific header value from the cached data by key.
	 *
	 * @param key - The header key to retrieve (case-insensitive)
	 * @returns The header value, or null if not present
	 */
	getHeader(key: string): string | number | null;

	/**
	 * Get the HTTP status code from the cached data.
	 *
	 * @returns The HTTP status code, or null if no cache data
	 */
	getStatusCode(): string | null;

	/**
	 * Get the current error code for this cache instance.
	 *
	 * @returns The error code, or 0 if no error
	 */
	getErrorCode(): number;

	/**
	 * Get the classification of the cached data ("private" or "public").
	 *
	 * @returns Either "private" (encrypted) or "public" (not encrypted)
	 */
	getClassification(): string;

	/**
	 * Get the synchronized "now" timestamp in seconds.
	 *
	 * @returns The timestamp in seconds when this Cache object was created
	 */
	getSyncedNowTimestampInSeconds(): number;

	/**
	 * Get the cached body content.
	 *
	 * @param parseBody - If true, parse JSON body into an object
	 * @returns The body as a string, parsed object, or null if no cache data
	 */
	getBody(parseBody?: boolean): string | object | null;

	/**
	 * Get a plain data response object.
	 *
	 * @param parseBody - If true, parse JSON body into an object
	 * @returns Response object with statusCode, headers, and body
	 */
	getResponse(parseBody?: boolean): { statusCode: string; headers: Record<string, string>; body: string | object | null } | null;

	/**
	 * Generate a complete HTTP response suitable for AWS API Gateway.
	 *
	 * @param parameters - Configuration parameters for the response
	 * @returns Complete HTTP response for API Gateway
	 */
	generateResponseForAPIGateway(parameters: { ifNoneMatch?: string; ifModifiedSince?: string }): { statusCode: string; headers: Record<string, string>; body: string | null };

	/**
	 * Get the Cache-Control header value.
	 *
	 * @returns Cache-Control header value (e.g., "public, max-age=3600")
	 */
	getCacheControlHeaderValue(): string;

	/**
	 * Get the unique identifier hash for this cache entry.
	 *
	 * @returns The unique cache identifier hash
	 */
	getIdHash(): string;

	/**
	 * Check if the cache needs to be refreshed (expired or empty).
	 *
	 * @returns True if cache needs refresh
	 */
	needsRefresh(): boolean;

	/**
	 * Check if the cached data has expired.
	 *
	 * @returns True if cache is expired
	 */
	isExpired(): boolean;

	/**
	 * Check if the cache is empty (no cached data exists).
	 *
	 * @returns True if cache is empty
	 */
	isEmpty(): boolean;

	/**
	 * Check if the cache is configured for private (encrypted) storage.
	 *
	 * @returns True if cache is private/encrypted
	 */
	isPrivate(): boolean;

	/**
	 * Check if the cache is configured for public (non-encrypted) storage.
	 *
	 * @returns True if cache is public/non-encrypted
	 */
	isPublic(): boolean;

	/**
	 * Extend the expiration time of the cached data.
	 *
	 * @param reason - Reason for extending (STATUS_ORIGINAL_ERROR or STATUS_ORIGINAL_NOT_MODIFIED)
	 * @param seconds - Number of seconds to extend (0 = use default)
	 * @param errorCode - HTTP error code if extending due to error
	 * @returns True if extension was successful
	 */
	extendExpires(reason: string, seconds?: number, errorCode?: number): Promise<boolean>;

	/**
	 * Calculate the default expiration timestamp for cached data.
	 *
	 * @returns The default expiration timestamp in seconds
	 */
	calculateDefaultExpires(): number;

	/**
	 * Calculate seconds remaining until cache expires.
	 *
	 * @returns Number of seconds until expiration
	 */
	calculateSecondsLeftUntilExpires(): number;

	/**
	 * Store data in cache with new content, headers, status code, and expiration.
	 *
	 * @param body - The content body to cache
	 * @param headers - HTTP headers from the origin response
	 * @param statusCode - HTTP status code from the origin
	 * @param expires - Expiration Unix timestamp in seconds (0 = calculate default)
	 * @param status - Optional status override
	 * @returns Representation of data stored in cache
	 */
	update(body: string | object, headers: object, statusCode?: string | number, expires?: number, status?: string | null): Promise<CacheDataFormat>;

	/**
	 * Get diagnostic test data for this Cache instance.
	 *
	 * @returns Object containing test data from various cache methods
	 */
	test(): object;
}

/**
 * CacheableDataAccess provides the primary interface for reading cached data.
 * It handles cache reads, origin requests, and cache updates automatically.
 *
 * Before using CacheableDataAccess, the Cache must be initialized with Cache.init().
 *
 * @example
 * // Initialize cache (once at boot)
 * cache.Cache.init({ ...parameters });
 *
 * // Then use CacheableDataAccess in the handler
 * const cacheObj = await cache.CacheableDataAccess.getData(
 *   cachePolicy,
 *   endpoint.send,
 *   connection,
 *   null,
 *   { path: 'users', id: '123' }
 * );
 *
 * // Access cached data
 * const body = cacheObj.getBody(true);
 * const status = cacheObj.getStatus();
 */
export class CacheableDataAccess {
	/**
	 * Prime (refresh) runtime environment variables and cached secrets.
	 *
	 * @returns True if priming was successful, false if an error occurred
	 * @example
	 * await CacheableDataAccess.prime();
	 */
	static prime(): Promise<boolean>;

	/**
	 * Data access method that evaluates the cache and makes a request to
	 * refresh data from the origin if needed.
	 *
	 * This method:
	 * 1. Checks the cache for existing data
	 * 2. If cache is expired or empty, calls the apiCallFunction to fetch fresh data
	 * 3. Stores the fresh data in cache
	 * 4. Returns a Cache object with the data
	 *
	 * @param cachePolicy - Cache policy configuration object
	 * @param apiCallFunction - Function to call to fetch data from the origin
	 * @param connection - Connection object specifying location and connection details
	 * @param data - Optional data object passed to the apiCallFunction
	 * @param tags - Optional logging tags (do not include sensitive information)
	 * @returns A Cache object with either cached or fresh data
	 * @example
	 * const cachePolicy = {
	 *   overrideOriginHeaderExpiration: true,
	 *   defaultExpirationInSeconds: 60,
	 *   expirationIsOnInterval: true,
	 *   headersToRetain: [],
	 *   hostId: 'api.example.com',
	 *   pathId: '/users',
	 *   encrypt: true
	 * };
	 *
	 * const connection = {
	 *   method: 'GET',
	 *   protocol: 'https',
	 *   host: 'api.example.com',
	 *   path: '/users/123',
	 *   parameters: {},
	 *   headers: {},
	 *   options: { timeout: 5000 }
	 * };
	 *
	 * const cacheObj = await CacheableDataAccess.getData(
	 *   cachePolicy,
	 *   endpoint.send,
	 *   connection,
	 *   null,
	 *   { path: 'users', id: '123' }
	 * );
	 *
	 * const body = cacheObj.getBody(true);
	 */
	static getData(
		cachePolicy: tools.CacheProfileObject,
		apiCallFunction: (connection: object, data?: object | null) => Promise<{ success: boolean; statusCode: number; body: object | string | null; headers: Record<string, string> }>,
		connection: object,
		data?: object | null,
		tags?: { path?: string | string[]; id?: string | string[]; [key: string]: any }
	): Promise<Cache>;
}

/**
 * TestHarness provides access to internal classes for testing purposes only.
 * This class should NEVER be used in production code.
 *
 * @private
 * @example
 * // In tests only - DO NOT use in production
 * import { TestHarness } from '../../src/lib/dao-cache.js';
 * const { CacheData, S3Cache, DynamoDbCache } = TestHarness.getInternals();
 */
export class TestHarness {
	/**
	 * Get access to internal classes for testing purposes.
	 * WARNING: This method is for testing only and should never be used in production.
	 *
	 * @returns Object containing internal classes: CacheData, S3Cache, DynamoDbCache
	 * @example
	 * const { CacheData, S3Cache, DynamoDbCache } = TestHarness.getInternals();
	 */
	static getInternals(): {
		CacheData: any;
		S3Cache: any;
		DynamoDbCache: any;
	};
}
