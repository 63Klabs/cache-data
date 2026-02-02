/*
 * =============================================================================
 * Classes for caching application data. Uses S3 and DynamoDb.
 * -----------------------------------------------------------------------------
 *
 * 
 */

/*
 * -----------------------------------------------------------------------------
 * Object definitions
 * -----------------------------------------------------------------------------
 */

/**
 * @typedef CacheDataFormat
 * @property {Object} cache
 * @property {string} cache.body
 * @property {Object} cache.headers
 * @property {number} cache.expires
 * @property {string} cache.statusCode
 */

/*
 * -----------------------------------------------------------------------------
 */

const tools = require("./tools/index.js");

/* for hashing and encrypting */
const crypto = require("crypto"); // included by aws so don't need to add to package.json
const objHash = require('object-hash');
const moment = require('moment-timezone');

/**
 * Basic S3 read/write for cache data. Provides low-level storage operations
 * for cached data in Amazon S3. This class handles only the storage format
 * and retrieval operations - cache expiration logic and data management are
 * handled by the CacheData class.
 * 
 * Use this class when you need direct access to S3 cache storage operations.
 * For most use cases, use the Cache or CacheableDataAccess classes instead.
 * 
 * @example
 * // Initialize S3Cache with bucket name
 * S3Cache.init('my-cache-bucket');
 * 
 * // Write data to cache
 * const data = JSON.stringify({ body: 'content', headers: {} });
 * await S3Cache.write('cache-key-hash', data);
 * 
 * // Read data from cache
 * const cachedData = await S3Cache.read('cache-key-hash');
 */
class S3Cache {

	static #bucket = null;
	static #objPath = "cache/";

	constructor () {
	};

	/**
	 * Get the S3 bucket name configured for cache storage.
	 * Returns null if S3Cache has not been initialized.
	 * 
	 * @returns {string|null} The bucket name used for cached data, or null if not initialized
	 * @example
	 * const bucketName = S3Cache.getBucket();
	 * console.log(`Cache bucket: ${bucketName}`);
	 */
	static getBucket() {
		return this.#bucket;
	};

	/**
	 * Get the S3 object key prefix (path) used for all cache objects.
	 * This prefix is prepended to all cache object keys to organize
	 * cached data within the bucket.
	 * 
	 * @returns {string} The object key prefix for cache objects (default: "cache/")
	 * @example
	 * const cachePath = S3Cache.getPath();
	 * console.log(`Cache path prefix: ${cachePath}`); // "cache/"
	 */
	static getPath() {
		return this.#objPath;
	};

	/**
	 * Initialize the S3 bucket for storing cached data. This method must be
	 * called before any read or write operations. Can only be initialized once -
	 * subsequent calls will be ignored with a warning.
	 * 
	 * The bucket name can be provided as a parameter or via the
	 * CACHE_DATA_S3_BUCKET environment variable.
	 * 
	 * @param {string|null} [bucket=null] The bucket name for storing cached data. If null, uses CACHE_DATA_S3_BUCKET environment variable
	 * @throws {Error} If no bucket name is provided and CACHE_DATA_S3_BUCKET environment variable is not set
	 * @example
	 * // Initialize with explicit bucket name
	 * S3Cache.init('my-cache-bucket');
	 * 
	 * @example
	 * // Initialize using environment variable
	 * process.env.CACHE_DATA_S3_BUCKET = 'my-cache-bucket';
	 * S3Cache.init();
	 */

	static init(bucket = null) {
		if ( S3Cache.getBucket() === null ) {
			bucket = (bucket === null) ? process.env?.CACHE_DATA_S3_BUCKET || null : bucket;
			if (bucket === null || bucket === "") {
				tools.DebugAndLog.error("Unable to initialize S3 Bucket for Cache. No bucket name provided.");
				throw new Error("Unable to initialize S3 Cache. No bucket name provided. Please set the CACHE_DATA_S3_BUCKET environment variable or pass a bucket name to S3Cache.init().");
			} else {
				this.#bucket = bucket;
			}
		} else {
			tools.DebugAndLog.error("S3Cache already initialized. Ignoring call to S3Cache.init()");
		}
	};

	/**
	 * Get configuration information about the S3Cache instance.
	 * Returns the bucket name and object key prefix currently in use.
	 * 
	 * @returns {{bucket: string|null, path: string}} Object containing bucket name and path prefix used for cached data
	 * @example
	 * const info = S3Cache.info();
	 * console.log(`Bucket: ${info.bucket}, Path: ${info.path}`);
	 */
	static info() {
		return {
			bucket: S3Cache.getBucket(),
			path: S3Cache.getPath()
		};
	};

	/**
	 * Convert an S3 response body to a JavaScript object. Handles both Buffer
	 * and ReadableStream response types from the AWS SDK, parsing the JSON
	 * content into a usable object.
	 * 
	 * This method is used internally when reading cache data from S3 to convert
	 * the raw response body into a usable JavaScript object.
	 * 
	 * @param {Buffer|ReadableStream} s3Body The S3 response body to convert
	 * @returns {Promise<Object>} A parsed JSON object from the S3 body content
	 * @throws {SyntaxError} If the body content is not valid JSON
	 * @example
	 * const s3Response = await tools.AWS.s3.get(params);
	 * const dataObject = await S3Cache.s3BodyToObject(s3Response.Body);
	 * console.log(dataObject); // { cache: { body: '...', headers: {...} } }
	 */
	static async s3BodyToObject(s3Body) {
		let str = "";
		let obj = {};

		// check if s3Body is buffer or stream
		if (s3Body instanceof Buffer) {
			str = s3Body.toString('utf-8');
		} else {
			str = await s3Body.transformToString();
		}

		obj = JSON.parse(str); // TODO: if it is a stream, there are better JSON parse options

		return obj;
	}
	
	/**
	 * Read cached data from S3 for the given cache identifier hash.
	 * Retrieves the JSON object stored at the cache key location and parses it.
	 * Returns null if the object doesn't exist or if an error occurs during retrieval.
	 * 
	 * The cache object is stored at: {bucket}/{path}{idHash}.json
	 * 
	 * @param {string} idHash The unique identifier hash of the cached content to retrieve
	 * @returns {Promise<Object|null>} The cached data object, or null if not found or on error
	 * @example
	 * const cachedData = await S3Cache.read('abc123def456');
	 * if (cachedData) {
	 *   console.log('Cache hit:', cachedData);
	 * } else {
	 *   console.log('Cache miss or error');
	 * }
	 */
	static async read (idHash) {

		return new Promise(async (resolve) => {

			const objKey = `${S3Cache.getPath()}${idHash}.json`;
			const objFullLocation = `${S3Cache.getBucket()}/${objKey}`;
			tools.DebugAndLog.debug(`Getting object from S3: ${objFullLocation}`);

			let item = null;

			try {

				let params = {
					Bucket: S3Cache.getBucket(),
					Key: objKey,
					ResponseContentType:'application/json'
				};

				const result = await tools.AWS.s3.get(params);

				tools.DebugAndLog.debug(`Success getting object from S3 ${objFullLocation}`);

				item = await S3Cache.s3BodyToObject(result.Body);
		
				tools.DebugAndLog.debug(`Success parsing object from S3 ${objFullLocation}`);
		
				resolve(item);

			} catch (error) {
				tools.DebugAndLog.error(`Error getting object from S3 (${objFullLocation}): ${error?.message || 'Unknown error'}`, error?.stack);
				resolve(item);
			}

		});

	};

	/**
	 * Write data to the cache in S3. Stores the provided data as a JSON object
	 * at the cache key location. The data should already be in string format
	 * (typically JSON.stringify'd).
	 * 
	 * The cache object is stored at: {bucket}/{path}{idHash}.json
	 * 
	 * @param {string} idHash The unique identifier hash for the cache entry
	 * @param {string} data The data to write to cache (should be a JSON string)
	 * @returns {Promise<boolean>} True if write was successful, false if an error occurred
	 * @example
	 * const cacheData = JSON.stringify({ body: 'content', headers: {}, expires: 1234567890 });
	 * const success = await S3Cache.write('abc123def456', cacheData);
	 * if (success) {
	 *   console.log('Cache written successfully');
	 * }
	 */
	static async write (idHash, data) {

		const objKey = `${S3Cache.getPath()}${idHash}.json`;
		const objFullLocation = `${S3Cache.getBucket()}/${objKey}`;
		tools.DebugAndLog.debug(`Putting object to S3: ${objFullLocation}`);

		return new Promise( async (resolve) => {

			try {
				const params = {
					Bucket: S3Cache.getBucket(),
					Key: objKey,
					Body: data,
					ContentType: 'application/json'
				};

				let response = await tools.AWS.s3.put(params);

				tools.DebugAndLog.debug(`Put object to S3 ${objFullLocation}`, response);

				resolve(true);
			
			} catch (error) {
				tools.DebugAndLog.error(`Error putting object to S3. [E2] (${objFullLocation}) ${error?.message || 'Unknown error'}`, error?.stack);
				resolve(false)
			};
		});

	};
};

/**
 * Basic DynamoDb read/write for cache data. Provides low-level storage operations
 * for cached data in Amazon DynamoDB. This class handles only the storage format
 * and retrieval operations - cache expiration logic and data management are
 * handled by the CacheData class.
 * 
 * Use this class when you need direct access to DynamoDB cache storage operations.
 * For most use cases, use the Cache or CacheableDataAccess classes instead.
 * 
 * @example
 * // Initialize DynamoDbCache with table name
 * DynamoDbCache.init('my-cache-table');
 * 
 * // Write data to cache
 * const item = { id_hash: 'cache-key', data: {}, expires: 1234567890 };
 * await DynamoDbCache.write(item);
 * 
 * // Read data from cache
 * const cachedData = await DynamoDbCache.read('cache-key');
 */
class DynamoDbCache {

	static #table = null;

	constructor () {
	};

	/**
	 * Initialize the DynamoDB table for storing cached data. This method must be
	 * called before any read or write operations. Can only be initialized once -
	 * subsequent calls will be ignored with a warning.
	 * 
	 * The table name can be provided as a parameter or via the
	 * CACHE_DATA_DYNAMO_DB_TABLE environment variable.
	 * 
	 * @param {string|null} [table=null] The table name to store cached data. If null, uses CACHE_DATA_DYNAMO_DB_TABLE environment variable
	 * @throws {Error} If no table name is provided and CACHE_DATA_DYNAMO_DB_TABLE environment variable is not set
	 * @example
	 * // Initialize with explicit table name
	 * DynamoDbCache.init('my-cache-table');
	 * 
	 * @example
	 * // Initialize using environment variable
	 * process.env.CACHE_DATA_DYNAMO_DB_TABLE = 'my-cache-table';
	 * DynamoDbCache.init();
	 */
	static init(table = null) {
		if ( this.#table === null ) {
			table = (table === null || table === "") ? process.env?.CACHE_DATA_DYNAMO_DB_TABLE || null : table;
			if (table === null || table === "") {
				tools.DebugAndLog.error("Unable to initialize DynamoDbCache. No table name provided.");
				throw new Error("Unable to initialize DynamoDbCache. No table name provided. Please set the CACHE_DATA_DYNAMO_DB_TABLE environment variable or pass a table name to DynamoDbCache.init().");
			} else {
				this.#table = table;
			}
		} else {
			tools.DebugAndLog.error("DynamoDbCache already initialized. Ignoring call to DynamoDbCache.init()");
		}
	};

	/**
	 * Get configuration information about the DynamoDbCache instance.
	 * Returns the table name currently in use for cache storage.
	 * 
	 * @returns {string|null} The DynamoDB table name, or null if not initialized
	 * @example
	 * const tableName = DynamoDbCache.info();
	 * console.log(`Cache table: ${tableName}`);
	 */
	static info() {
		return this.#table;
	};

	/**
	 * Read cached data from DynamoDB for the given cache identifier hash.
	 * Retrieves the cache record using the id_hash as the primary key.
	 * Returns an empty object if the record doesn't exist or if an error occurs.
	 * 
	 * The query uses ProjectionExpression to retrieve only the necessary fields:
	 * id_hash, data, and expires.
	 * 
	 * @param {string} idHash The unique identifier hash of the cached content to retrieve
	 * @returns {Promise<Object>} The DynamoDB query result containing the Item property with cached data, or empty object on error
	 * @example
	 * const result = await DynamoDbCache.read('abc123def456');
	 * if (result.Item) {
	 *   console.log('Cache hit:', result.Item);
	 * } else {
	 *   console.log('Cache miss or error');
	 * }
	 */
	static async read (idHash) {

		return new Promise(async (resolve) => {

			tools.DebugAndLog.debug(`Getting record from DynamoDb for id_hash: ${idHash}`)
			let result = {};
			
			// https://www.fernandomc.com/posts/eight-examples-of-fetching-data-from-dynamodb-with-node/
			try {
				let params = {
					TableName: this.#table,
					Key: {
						"id_hash": idHash
					},
					ExpressionAttributeNames: {
						"#expires": "expires",
						"#data": "data"
					},
					ProjectionExpression: "id_hash, #data, #expires"
				};
			
				result = await tools.AWS.dynamo.get(params);

				tools.DebugAndLog.debug(`Query success from DynamoDb for id_hash: ${idHash}`);

			} catch (error) {
				tools.DebugAndLog.error(`Unable to perform DynamoDb query. (${idHash}) ${error?.message || 'Unknown error'}`, error?.stack);
			} finally {
				resolve(result);
			}

		});

	};

	/**
	 * Write data to the cache in DynamoDB. Stores the provided item object
	 * as a record in the DynamoDB table. The item must contain an id_hash
	 * property which serves as the primary key.
	 * 
	 * @param {Object} item The cache item object to write to DynamoDB. Must include id_hash property
	 * @param {string} item.id_hash The unique identifier hash for the cache entry (primary key)
	 * @param {Object} item.data The cached data object
	 * @param {number} item.expires The expiration timestamp in seconds
	 * @param {number} item.purge_ts The timestamp when the expired entry should be purged
	 * @returns {Promise<boolean>} True if write was successful, false if an error occurred
	 * @example
	 * const item = {
	 *   id_hash: 'abc123def456',
	 *   data: { body: 'content', headers: {} },
	 *   expires: 1234567890,
	 *   purge_ts: 1234654290
	 * };
	 * const success = await DynamoDbCache.write(item);
	 * if (success) {
	 *   console.log('Cache written successfully');
	 * }
	 */
	static async write (item) {

		return new Promise( async (resolve) => {

			try {
				
				tools.DebugAndLog.debug(`Putting record to DynamoDb for id_hash: ${item.id_hash}`)

				let params = { 
					Item: item,
					TableName: this.#table
				};

				let response = await tools.AWS.dynamo.put(params);

				tools.DebugAndLog.debug(`Write to DynamoDb for id_hash: ${item.id_hash}`, response);

				resolve(true);
			
			} catch (error) {
				tools.DebugAndLog.error(`Write to DynamoDb failed for id_hash: ${item.id_hash} ${error?.message || 'Unknown error'}`, error?.stack);
				resolve(false)
			}
		});

	};

};

/**
 * Manages cached data stored in DynamoDB and S3. CacheData is a static class
 * that handles expiration calculations, data encryption/decryption, and
 * coordinates storage between DynamoDB (for small items) and S3 (for large items).
 * 
 * This class is used internally by the publicly exposed Cache class and should
 * not be used directly in most cases. Use the Cache or CacheableDataAccess
 * classes instead for application-level caching.
 * 
 * Key responsibilities:
 * - Expiration time calculations and interval-based caching
 * - Data encryption for private/sensitive content
 * - Automatic routing between DynamoDB and S3 based on size
 * - ETag and Last-Modified header generation
 * 
 * @example
 * // Initialize CacheData (typically done through Cache.init())
 * CacheData.init({
 *   dynamoDbTable: 'my-cache-table',
 *   s3Bucket: 'my-cache-bucket',
 *   secureDataKey: Buffer.from('...'),
 *   secureDataAlgorithm: 'aes-256-cbc'
 * });
 * 
 * // Read from cache
 * const cacheData = await CacheData.read('cache-key-hash', expiresTimestamp);
 * 
 * // Write to cache
 * await CacheData.write('cache-key-hash', now, body, headers, host, path, expires, statusCode, true);
 */
class CacheData {

	static PRIVATE = "private";
	static PUBLIC = "public";

	static PLAIN_ENCODING = "utf8";
	static CRYPT_ENCODING = "hex";

	static #secureDataAlgorithm = null;
	static #secureDataKey = null;
	static #dynamoDbMaxCacheSize_kb = 10;
	static #purgeExpiredCacheEntriesAfterXHours = 24;
	static #timeZoneForInterval = "UTC";
	static #offsetInMinutes = 0;

	constructor() {
	};

	/**
	 * Initialize CacheData with configuration parameters. This method must be called
	 * before any cache operations. It initializes both DynamoDbCache and S3Cache,
	 * sets up encryption parameters, and configures cache behavior settings.
	 * 
	 * Configuration can be provided via parameters or environment variables.
	 * 
	 * @param {Object} parameters Configuration object
	 * @param {string} [parameters.dynamoDbTable] DynamoDB table name (or use CACHE_DATA_DYNAMO_DB_TABLE env var)
	 * @param {string} [parameters.s3Bucket] S3 bucket name (or use CACHE_DATA_S3_BUCKET env var)
	 * @param {string} [parameters.secureDataAlgorithm='aes-256-cbc'] Encryption algorithm (or use CACHE_DATA_SECURE_DATA_ALGORITHM env var)
	 * @param {string|Buffer|tools.Secret|tools.CachedSSMParameter|tools.CachedSecret} parameters.secureDataKey Encryption key (required, no env var for security)
	 * @param {number} [parameters.DynamoDbMaxCacheSize_kb=10] Max size in KB for DynamoDB storage (or use CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB env var)
	 * @param {number} [parameters.purgeExpiredCacheEntriesAfterXHours=24] Hours after expiration to purge entries (or use CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS env var)
	 * @param {string} [parameters.timeZoneForInterval='Etc/UTC'] Timezone for interval calculations (or use CACHE_DATA_TIME_ZONE_FOR_INTERVAL env var)
	 * @throws {Error} If secureDataKey is not provided
	 * @throws {Error} If DynamoDbMaxCacheSize_kb is not a positive integer
	 * @throws {Error} If purgeExpiredCacheEntriesAfterXHours is not a positive integer
	 * @throws {Error} If timeZoneForInterval is not a non-empty string
	 * @example
	 * CacheData.init({
	 *   dynamoDbTable: 'my-cache-table',
	 *   s3Bucket: 'my-cache-bucket',
	 *   secureDataKey: Buffer.from('my-32-byte-key-here', 'hex'),
	 *   secureDataAlgorithm: 'aes-256-cbc',
	 *   DynamoDbMaxCacheSize_kb: 10,
	 *   purgeExpiredCacheEntriesAfterXHours: 24,
	 *   timeZoneForInterval: 'America/Chicago'
	 * });
	 */
	static init(parameters) {

		// if we don't have the key set, we don't have anything set
		if ( this.#secureDataKey === null ) {

			// Throw error if no secureData key
			if ( !("secureDataKey" in parameters) || parameters.secureDataKey === null ) {
				tools.DebugAndLog.error("CacheData.init() requires a secureDataKey parameter.");
				throw new Error("CacheData.init() requires a secureDataKey parameter.");
			}

			// let DynamoDbCache and S3Cache know where to store the data, let them handle the Env variables
			DynamoDbCache.init(parameters?.dynamoDbTable || null);
			S3Cache.init(parameters?.s3Bucket || null);

			// secureDataKey can be a string, Buffer, or CachedParameterSecret
			this.#secureDataKey = parameters.secureDataKey;

			// set other values based on parameters or environment variables
			this.#secureDataAlgorithm = parameters.secureDataAlgorithm || process.env.CACHE_DATA_SECURE_DATA_ALGORITHM || "aes-256-cbc";

			// CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB
			if ("DynamoDbMaxCacheSize_kb" in parameters ) { 
				if (!Number.isInteger(parameters.DynamoDbMaxCacheSize_kb) || parameters.DynamoDbMaxCacheSize_kb <= 0) throw new Error("DynamoDbMaxCacheSize_kb must be a positive integer");
				this.#dynamoDbMaxCacheSize_kb = parameters.DynamoDbMaxCacheSize_kb; 
			} else if (process.env.CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB) { 
				let val = parseInt(process.env.CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB);
				if (isNaN(val) || val <= 0) throw new Error("CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB must be a positive integer");
				this.#dynamoDbMaxCacheSize_kb = val; 
			} else {
				this.#dynamoDbMaxCacheSize_kb = 10; // default to 10KB
			}
			// CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS
			if ("purgeExpiredCacheEntriesAfterXHours" in parameters ) { 
				if (!Number.isInteger(parameters.purgeExpiredCacheEntriesAfterXHours) || parameters.purgeExpiredCacheEntriesAfterXHours <= 0) throw new Error("purgeExpiredCacheEntriesAfterXHours must be a positive integer");
				this.#purgeExpiredCacheEntriesAfterXHours = parameters.purgeExpiredCacheEntriesAfterXHours; 
			} else if (process.env.CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS) { 
				let val = parseInt(process.env.CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS);
				if (isNaN(val) || val <= 0) throw new Error("CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS must be a positive integer");
				this.#purgeExpiredCacheEntriesAfterXHours = val; 
			} else {
				this.#purgeExpiredCacheEntriesAfterXHours = 24; // default to 24 hours
			}
			// CACHE_DATA_TIME_ZONE_FOR_INTERVAL
			if ("timeZoneForInterval" in parameters ) { 
				if (typeof parameters.timeZoneForInterval !== 'string' || parameters.timeZoneForInterval.trim() === '') throw new Error("timeZoneForInterval must be a non-empty string");
				this.#timeZoneForInterval = parameters.timeZoneForInterval; 
			} else if (process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL) { 
				if (process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL.trim() === '') throw new Error("CACHE_DATA_TIME_ZONE_FOR_INTERVAL must be a non-empty string");
				this.#timeZoneForInterval = process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL; 
			} else {
				this.#timeZoneForInterval = "Etc/UTC"; // default to Etc/UTC
			}

			this._setOffsetInMinutes();

		} else {
			tools.DebugAndLog.warn("CacheData already initialized. Ignoring call to CacheData.init()");
		}

	};

	/**
	 * Refresh runtime environment variables and cached secrets. This method can be
	 * called during execution to update values that may have changed since init().
	 * 
	 * Calling prime() without await can help get runtime refreshes started in the
	 * background. You can safely call prime() again with await just before you need
	 * the refreshed values to ensure completion.
	 * 
	 * @returns {Promise<boolean>} True if priming was successful, false if an error occurred
	 * @example
	 * // Start priming in background
	 * CacheData.prime();
	 * 
	 * // Later, ensure priming is complete before using
	 * await CacheData.prime();
	 * const data = await CacheData.read(idHash, expires);
	 */
	static async prime() {
		return new Promise(async (resolve) => {
			try {
				let primeTasks = [];

				if (CacheData.getSecureDataKeyType() === 'CachedParameterSecret') {
					primeTasks.push( this.#secureDataKey.prime());
				}

				await Promise.all(primeTasks);

				resolve(true);
			} catch (error) {
				tools.DebugAndLog.error(`CacheData.prime() failed ${error?.message || 'Unknown error'}`, error?.stack);
				resolve(false);
			}
		});
	}

	/**
	 * Internal method to set the timezone offset in minutes from UTC. This method
	 * is called during init() to calculate the offset based on the configured
	 * timeZoneForInterval and the current date/time, accounting for daylight
	 * saving time transitions.
	 * 
	 * The offset is stored as a negative value following POSIX conventions, where
	 * positive offsets are west of UTC and negative offsets are east of UTC.
	 * 
	 * @private
	 * @example
	 * // Called internally during CacheData.init()
	 * CacheData._setOffsetInMinutes();
	 */
	static _setOffsetInMinutes() {
		this.#offsetInMinutes = ( -1 * moment.tz.zone(this.getTimeZoneForInterval()).utcOffset(Date.now())); // invert by *-1 because of POSIX
	};

	/**
	 * Get the timezone offset in minutes from UTC, accounting for daylight saving time.
	 * This offset is used for interval-based cache expiration calculations to align
	 * intervals with local midnight rather than UTC midnight.
	 * 
	 * The offset is calculated based on the timeZoneForInterval setting and the
	 * current date/time to account for DST transitions.
	 * 
	 * @returns {number} The offset in minutes from UTC (positive for west of UTC, negative for east)
	 * @example
	 * const offset = CacheData.getOffsetInMinutes();
	 * console.log(`Timezone offset: ${offset} minutes from UTC`);
	 */
	static getOffsetInMinutes() {
		return this.#offsetInMinutes;
	};

	/**
	 * Get the TZ database timezone name used for interval calculations.
	 * This timezone is used to align cache expiration intervals with local time
	 * rather than UTC, which is useful for aligning with business hours or
	 * batch processing schedules.
	 * 
	 * See: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
	 * 
	 * @returns {string} The TZ database name (e.g., 'America/Chicago', 'Etc/UTC')
	 * @example
	 * const tz = CacheData.getTimeZoneForInterval();
	 * console.log(`Cache intervals aligned to: ${tz}`);
	 */
	static getTimeZoneForInterval() {
		return this.#timeZoneForInterval;
	};

	/**
	 * Get comprehensive information about the cache configuration settings.
	 * Returns an object containing all configuration parameters including
	 * DynamoDB table, S3 bucket, encryption settings, size limits, and
	 * timezone information.
	 * 
	 * Note: The secureDataKey is masked for security and shows only the key type.
	 * 
	 * @returns {{dynamoDbTable: string, s3Bucket: Object, secureDataAlgorithm: string, secureDataKey: string, DynamoDbMaxCacheSize_kb: number, purgeExpiredCacheEntriesAfterXHours: number, timeZoneForInterval: string, offsetInMinutes: number}} Configuration information object
	 * @example
	 * const info = CacheData.info();
	 * console.log(`Cache table: ${info.dynamoDbTable}`);
	 * console.log(`Max DynamoDB size: ${info.DynamoDbMaxCacheSize_kb} KB`);
	 * console.log(`Timezone: ${info.timeZoneForInterval}`);
	 */
	static info() {

		return {
			dynamoDbTable: DynamoDbCache.info(),
			s3Bucket: S3Cache.info(),
			secureDataAlgorithm: this.#secureDataAlgorithm,
			secureDataKey: `************** [${CacheData.getSecureDataKeyType()}]`,
			DynamoDbMaxCacheSize_kb: this.#dynamoDbMaxCacheSize_kb,
			purgeExpiredCacheEntriesAfterXHours: this.#purgeExpiredCacheEntriesAfterXHours,
			timeZoneForInterval: CacheData.getTimeZoneForInterval(),
			offsetInMinutes: CacheData.getOffsetInMinutes()
		};

	};

	/**
	 * Format cache data into the standard CacheDataFormat structure.
	 * Creates a cache object with the specified expiration, body, headers, and status code.
	 * 
	 * @param {number|null} [expires=null] Expiration timestamp in seconds
	 * @param {string|null} [body=null] The cached content body
	 * @param {Object|null} [headers=null] HTTP headers object
	 * @param {string|null} [statusCode=null] HTTP status code
	 * @returns {CacheDataFormat} Formatted cache object with cache property containing body, headers, expires, and statusCode
	 * @example
	 * const cacheData = CacheData.format(1234567890, '{"data":"value"}', {'content-type':'application/json'}, '200');
	 * console.log(cacheData.cache.body); // '{"data":"value"}'
	 * console.log(cacheData.cache.expires); // 1234567890
	 */
	static format(expires = null, body = null, headers = null, statusCode = null) {
		return { "cache": { body: body, headers: headers, expires: expires, statusCode: statusCode } };
	};

	/**
	 * Internal method to process cached data retrieved from storage. Handles
	 * S3 pointer resolution, decryption of private data, and formatting of
	 * the cache response.
	 * 
	 * If the cached item is stored in S3 (indicated by objInS3 flag), this method
	 * fetches the full data from S3. For private/encrypted data, it performs
	 * decryption before returning.
	 * 
	 * @private
	 * @param {string} idHash The unique identifier hash for the cache entry
	 * @param {Object} item The cache item object from DynamoDB
	 * @param {number} syncedNow Timestamp to use for immediate expiration on errors
	 * @param {number} syncedLater Default expiration timestamp to use if cache is not found
	 * @returns {Promise<{body: string|null, headers: Object|null, expires: number, statusCode: string|null}>} Processed cache data
	 * @example
	 * // Called internally by CacheData.read()
	 * const now = Math.floor(Date.now() / 1000);
	 * const later = now + 300;
	 * const processed = await CacheData._process(idHash, item, now, later);
	 */
	static async _process(idHash, item, syncedNow, syncedLater) {
		
		try {
				
			// Is this a pointer to data in S3?
			if ("data" in item && "info" in item.data && "objInS3" in item.data.info && item.data.info.objInS3 === true) {
				tools.DebugAndLog.debug(`Item is in S3. Fetching... (${idHash})`);
				item = await S3Cache.read(idHash); // The data is stored in S3 so get it
				tools.DebugAndLog.debug(`Item returned from S3 replaces pointer to S3 (${idHash})`, item);
				// NOTE: if this fails and returns null it will be handled as any item === null which is to say that body will be null
			}
			
			let body = null;
			let headers = null;
			let expires = syncedLater;
			let statusCode = null;

			if (item !== null) {
				tools.DebugAndLog.debug(`Process data from cache (${idHash})`);
				body = item.data.body; // set the cached body data (this is what we will be the body of the response)

				headers = item.data.headers;
				expires = item.expires;
				statusCode = item.data.statusCode;
				
				// if the body is encrypted (because classification is private) decrypt it
				if ( item.data.info.classification === CacheData.PRIVATE ) {
					try {
						tools.DebugAndLog.debug(`Policy for (${idHash}) data is classified as PRIVATE. Decrypting body...`);
						await CacheData.prime();
						body = this._decrypt(body);
					} catch (error) {
						// Decryption failed
						body = null;
						expires = syncedNow;
						headers = null;
						statusCode = "500";
						tools.DebugAndLog.error(`Unable to decrypt cache. Ignoring it. (${idHash}) ${error?.message || 'Unknown error'}`, error?.stack);
					}
				}               
			}

			return { body: body, headers: headers, expires: expires, statusCode: statusCode };
		} catch (error) {
			tools.DebugAndLog.error(`Error getting data from cache. (${idHash}) ${error?.message || 'Unknown error'}`, error?.stack);
			return { body: null, expires: syncedNow, headers: null, statusCode: "500" };
		}
			
	};

	/**
	 * Read cached data from storage (DynamoDB and potentially S3). Retrieves the
	 * cache entry for the given ID hash, handles decryption if needed, and returns
	 * the formatted cache data.
	 * 
	 * If the cached item is stored in S3 (indicated by objInS3 flag), this method
	 * automatically fetches it from S3. Handles both public and private (encrypted)
	 * cache entries.
	 * 
	 * @param {string} idHash The unique identifier hash for the cache entry
	 * @param {number} syncedLater Default expiration timestamp to use if cache is not found
	 * @returns {Promise<CacheDataFormat>} Formatted cache data with body, headers, expires, and statusCode
	 * @example
	 * const expiresDefault = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now
	 * const cacheData = await CacheData.read('abc123def456', expiresDefault);
	 * if (cacheData.cache.body) {
	 *   console.log('Cache hit:', cacheData.cache.body);
	 * } else {
	 *   console.log('Cache miss');
	 * }
	 */
	static async read(idHash, syncedLater) {

		return new Promise(async (resolve) => {

			let cache = this.format(syncedLater);

			try {
				
				const result = await DynamoDbCache.read(idHash);

				/* if we have a cached object, provide it for evaluation */
				/* NOTE: AWS-SDK seems to provide a hidden Item that is undefined? toString and stringify doesn't show it, 
				but "Item" in result will be true. So we will do extensive testing to make compatible with both v2 and v3 */
				if ( "Item" in result && typeof result.Item !== "undefined" && result.Item !== null ) { 
					// hand the item over for processing
					const cachedCopy = await this._process(idHash, result.Item);
					cache = this.format(cachedCopy.expires, cachedCopy.body, cachedCopy.headers, cachedCopy.statusCode);
					tools.DebugAndLog.debug(`Cached Item Processed: ${idHash}`);
				} else {
					tools.DebugAndLog.debug(`No cache found for ${idHash}`);
				}

			} catch (error) {
				tools.DebugAndLog.error(`CacheData.read(${idHash}) failed ${error?.message || 'Unknown error'}`, error?.stack);
			} finally {
				resolve(cache);
			};
			
		});
	};

	/**
	 * Write data to cache storage (DynamoDB and potentially S3). Handles encryption
	 * for private data, generates ETags and headers, and automatically routes large
	 * items to S3 while keeping a pointer in DynamoDB.
	 * 
	 * Items larger than DynamoDbMaxCacheSize_kb are stored in S3 with a reference
	 * in DynamoDB. Smaller items are stored entirely in DynamoDB for faster access.
	 * 
	 * @param {string} idHash The unique identifier hash for the cache entry
	 * @param {number} syncedNow Current timestamp in seconds
	 * @param {string} body The content body to cache
	 * @param {Object} headers HTTP headers object
	 * @param {string} host Host identifier for logging
	 * @param {string} path Path identifier for logging
	 * @param {number} expires Expiration timestamp in seconds
	 * @param {string|number} statusCode HTTP status code
	 * @param {boolean} [encrypt=true] Whether to encrypt the body (true for private, false for public)
	 * @returns {Promise<CacheDataFormat>} Formatted cache data that was written
	 * @example
	 * const now = Math.floor(Date.now() / 1000);
	 * const expires = now + 3600; // 1 hour from now
	 * const body = JSON.stringify({ data: 'value' });
	 * const headers = { 'content-type': 'application/json' };
	 * 
	 * const cacheData = await CacheData.write(
	 *   'abc123def456',
	 *   now,
	 *   body,
	 *   headers,
	 *   'api.example.com',
	 *   '/api/data',
	 *   expires,
	 *   '200',
	 *   true
	 * );
	 */
	static async write (idHash, syncedNow, body, headers, host, path, expires, statusCode, encrypt = true) {

		let cacheData = null;
	
		return new Promise(async (resolve) => {

			const taskList = [];

			try {

				tools.DebugAndLog.debug(`Updating Cache for ${idHash} now:${syncedNow} | host:${host} | path:${path} | expires:${expires} | statusCode:${statusCode} | encrypt:${encrypt} ... `);

				if( isNaN(expires) || expires < syncedNow ) {
					expires = syncedNow + 300;
				}

				// lowercase all headers
				headers = CacheData.lowerCaseKeys(headers);

				// set etag
				if ( !("etag" in headers) ) {
					headers.etag = CacheData.generateEtag(idHash, body);
				}

				// set last modified
				if ( !("last-modified" in headers) ) {
					headers['last-modified'] = CacheData.generateInternetFormattedDate(syncedNow);
				}

				// set expires in header
				if ( !("expires" in headers) ) {
					headers['expires'] = CacheData.generateInternetFormattedDate(expires);
				}
		
				cacheData = CacheData.format(expires, body, headers, statusCode);

				const bodySize_kb = this.calculateKBytes(body);
				let bodyToStore = body;

				// if the endpoint policy is classified as private, encrypt
				if ( encrypt ) {
					tools.DebugAndLog.debug(`Policy for (${idHash}) data is classified as PRIVATE. Encrypting body...`);
					bodyToStore = this._encrypt(body);
				}

				// create the (preliminary) cache record
				let item = {
					id_hash: idHash,
					expires: expires,
					purge_ts: (syncedNow + (this.#purgeExpiredCacheEntriesAfterXHours * 3600)),
					data: { 
						info: { 
							expires: headers.expires,
							host: host,
							path: path,
							classification: (encrypt ? CacheData.PRIVATE : CacheData.PUBLIC),
							size_kb: bodySize_kb,
							objInS3: false
						},
						headers: headers,
						body: bodyToStore,
						statusCode: statusCode
					}
				};

				/*
				DynamoDb has a limit of 400KB per item so we want to make sure
				the Item does not take up that much space. Also, we want 
				DynamoDb to run efficiently so it is best to only store smaller 
				items there and move larger items into S3.

				Any items larger than the max size we set will be stored over 
				in S3.

				What is the max size? It can be set in the Lambda Environment
				Variables and discovering the proper balance will take some trials.
				We don't want to constantly be calling S3, but we also don't want
				to make DynamoDb too heavy either.

				(In summary: Max Item size in DynamoDb is 400KB, and storing too many large
				items can have a performance impact. However constantly calling
				S3 also will have a performance impact.)
				*/

				// do the size check
				if (bodySize_kb > this.#dynamoDbMaxCacheSize_kb) {
					// over max size limit set in Lambda Environment Variables
					taskList.push(S3Cache.write(idHash, JSON.stringify(item) )); // ADD_PROMISE_COLLECTION_HERE
					// update the Item we will pass to DynamoDb
					let preview = (typeof item.data.body === "string") ? item.data.body.slice(0,100)+"..." : "[---ENCRYPTED---]";
					item.data.body = "ID: "+idHash+" PREVIEW: "+preview;
					item.data.info.objInS3 = true; 
				}
				
				taskList.push(DynamoDbCache.write(item)); // ADD_PROMISE_COLLECTION_HERE

			} catch (error) {
				tools.DebugAndLog.error(`CacheData.write for ${idHash} FAILED now:${syncedNow} | host:${host} | path:${path} | expires:${expires} | statusCode:${statusCode} | encrypt:${encrypt} failed. ${error?.message || 'Unknown error'}`, error?.stack);
				cacheData = CacheData.format(0);
			} finally {
				await Promise.all(taskList);
				resolve(cacheData); // ADD_PROMISE_COLLECTION_HERE
			}
		});
		

	};

	/* 
	***********************************************************************
	Encryption Functions
	-----------------------------------------------------------------------
	
	Encrypt and Decrypt data classified as private
	
	Even though we can set up DynamoDB to encrypt data when at rest, we
	don't want data classified as private to be viewed or exported from the
	AWS console

	-----------------------------------------------------------------------
	
	Adapted from
	https://codeforgeek.com/encrypt-and-decrypt-data-in-node-js/
	
	and
	https://nodejs.org/api/crypto.html

	************************************************************************
	*/

	/**
	 * Get the type of the secure data key being used for encryption.
	 * Returns a string indicating whether the key is a Buffer, string, or
	 * CachedParameterSecret object.
	 * 
	 * @returns {string} One of: 'buffer', 'string', or 'CachedParameterSecret'
	 * @example
	 * const keyType = CacheData.getSecureDataKeyType();
	 * console.log(`Encryption key type: ${keyType}`);
	 */
	static getSecureDataKeyType() {
		// look at type of parameters.secureDataKey as it can be a string, Buffer, or object.
		let dataKeyType = typeof this.#secureDataKey;
		if ( Buffer.isBuffer(this.#secureDataKey)) { dataKeyType = 'buffer'; }
		if ( dataKeyType === 'object' && this.#secureDataKey instanceof tools.CachedParameterSecret ) { dataKeyType = 'CachedParameterSecret'; }
		return dataKeyType;
	}

	/**
	 * Obtain the secure data key as a Buffer for encryption/decryption operations.
	 * Handles different key storage formats (Buffer, string, CachedParameterSecret)
	 * and converts them to a Buffer in the format specified by CRYPT_ENCODING.
	 * 
	 * @returns {Buffer|null} The encryption key as a Buffer, or null if key cannot be retrieved
	 * @example
	 * const keyBuffer = CacheData.getSecureDataKey();
	 * if (keyBuffer) {
	 *   // Use keyBuffer for encryption/decryption
	 * }
	 */
	static getSecureDataKey() {

		let buff = null;

		try {

			// The secureDataKey can be stored several different ways
			switch (CacheData.getSecureDataKeyType()) {
				case 'buffer':
					buff = this.#secureDataKey;
					break;
				case 'string':
					buff = Buffer.from(this.#secureDataKey, this.CRYPT_ENCODING);
					break;
				case 'CachedParameterSecret':
					// it may be null
					const key = this.#secureDataKey.sync_getValue();
					buff = ( key === null ) ? null : Buffer.from( key, this.CRYPT_ENCODING);
					break;
				default:
					break;
			}

		} catch (error) {
			tools.DebugAndLog.error(`CacheData.getSecureDataKey() failed ${error?.message || 'Unknown error'}`, error?.stack);
		}

		return buff;

	};

	/**
	 * Internal method to encrypt data classified as private. Uses the configured
	 * encryption algorithm and secure data key to encrypt the provided text.
	 * 
	 * This method generates a random initialization vector (IV) for each encryption
	 * operation to ensure unique ciphertext even for identical plaintext. The IV
	 * is returned along with the encrypted data.
	 * 
	 * Note: null values are substituted with "{{{null}}}" before encryption to
	 * handle the edge case of null data.
	 * 
	 * @private
	 * @param {string|null} text Data to encrypt
	 * @returns {{iv: string, encryptedData: string}} Object containing the IV and encrypted data, both as hex strings
	 * @example
	 * // Called internally by CacheData.write()
	 * const encrypted = CacheData._encrypt('sensitive data');
	 * console.log(encrypted); // { iv: 'abc123...', encryptedData: 'def456...' }
	 */
	static _encrypt (text) {

		const dataKey = this.getSecureDataKey();

		tools.DebugAndLog.debug(`Encrypting cache using ${this.#secureDataAlgorithm} with secureDataKey [${CacheData.getSecureDataKeyType()}]  ... `);

		// can't encrypt null, so we'll substitute (and in _decrypt() reverse the sub)
		if (text === null) { text = "{{{null}}}"; }

		let iv = crypto.randomBytes(16);
		let cipher = crypto.createCipheriv(this.#secureDataAlgorithm, Buffer.from(dataKey), iv);

		let encrypted = cipher.update(text, this.PLAIN_ENCODING, this.CRYPT_ENCODING);
		encrypted += cipher.final(this.CRYPT_ENCODING);

		return { iv: iv.toString(this.CRYPT_ENCODING), encryptedData: encrypted };
	};
	
	/**
	 * Internal method to decrypt data classified as private. Uses the configured
	 * encryption algorithm and secure data key to decrypt the provided encrypted data.
	 * 
	 * This method requires both the initialization vector (IV) and the encrypted data
	 * that were produced by the _encrypt() method. It reverses the encryption process
	 * to recover the original plaintext.
	 * 
	 * Note: The special value "{{{null}}}" is converted back to null after decryption
	 * to handle the edge case of null data.
	 * 
	 * @private
	 * @param {{iv: string, encryptedData: string, plainEncoding?: string, cryptEncoding?: string}} data Object containing encrypted data and IV
	 * @param {string} data.iv The initialization vector as a hex string
	 * @param {string} data.encryptedData The encrypted data as a hex string
	 * @param {string} [data.plainEncoding] Optional plain text encoding (defaults to PLAIN_ENCODING)
	 * @param {string} [data.cryptEncoding] Optional cipher text encoding (defaults to CRYPT_ENCODING)
	 * @returns {string|null} Decrypted data as plaintext, or null if original data was null
	 * @example
	 * // Called internally by CacheData._process()
	 * const decrypted = CacheData._decrypt({ iv: 'abc123...', encryptedData: 'def456...' });
	 * console.log(decrypted); // 'sensitive data'
	 */
	static _decrypt (data) {
		
		const dataKey = this.getSecureDataKey();

		tools.DebugAndLog.debug(`Decrypting cache using ${this.#secureDataAlgorithm} with secureDataKey [${CacheData.getSecureDataKeyType()}]  ... `);

		let plainEncoding = ("plainEncoding" in data) ? data.plainEncoding : this.PLAIN_ENCODING;
		let cryptEncoding = ("cryptEncoding" in data) ? data.cryptEncoding : this.CRYPT_ENCODING;

		let iv = Buffer.from(data.iv, cryptEncoding);
		let decipher = crypto.createDecipheriv(this.#secureDataAlgorithm, Buffer.from(dataKey), iv);

		let decrypted = decipher.update(data.encryptedData, cryptEncoding, plainEncoding);
		decrypted += decipher.final(plainEncoding);

		// reverse the substitute for null that _encrypt() used
		if ( decrypted === "{{{null}}}") { decrypted = null; }

		return decrypted;
	};

	// utility functions
	/**
	 * Generate an ETag hash for cache validation. Creates a unique hash by combining
	 * the cache ID hash with the content. This is used for HTTP ETag headers to
	 * enable conditional requests and cache validation.
	 * 
	 * The ETag is a 10-character SHA-1 hash slice, which is sufficient for cache
	 * validation at a specific endpoint without needing global uniqueness.
	 * 
	 * @param {string} idHash The unique identifier hash for the cache entry
	 * @param {string} content The content body to include in the ETag calculation
	 * @returns {string} A 10-character ETag hash
	 * @example
	 * const etag = CacheData.generateEtag('abc123', '{"data":"value"}');
	 * console.log(`ETag: ${etag}`); // e.g., "a1b2c3d4e5"
	 */
	static generateEtag (idHash, content) {
		const hasher = crypto.createHash('sha1');
		hasher.update(idHash+content);
		return hasher.digest('hex').slice(0, 10); // we'll only take 10 characters
		// again, we aren't comparing the hash to the rest of the world
	};

	/**
	 * Generate an internet-formatted date string for use in HTTP headers.
	 * Converts a Unix timestamp to the standard HTTP date format.
	 * 
	 * Example output: "Wed, 28 Jul 2021 12:24:11 GMT"
	 * 
	 * @param {number} timestamp Unix timestamp (in seconds by default, or milliseconds if inMilliSeconds is true)
	 * @param {boolean} [inMilliSeconds=false] Set to true if timestamp is in milliseconds
	 * @returns {string} Internet-formatted date string (e.g., "Wed, 28 Jul 2021 12:24:11 GMT")
	 * @example
	 * const now = Math.floor(Date.now() / 1000);
	 * const dateStr = CacheData.generateInternetFormattedDate(now);
	 * console.log(dateStr); // "Mon, 26 Jan 2026 15:30:45 GMT"
	 * 
	 * @example
	 * const nowMs = Date.now();
	 * const dateStr = CacheData.generateInternetFormattedDate(nowMs, true);
	 */
	static generateInternetFormattedDate (timestamp, inMilliSeconds = false) {

		if ( !inMilliSeconds ) {
			timestamp = CacheData.convertTimestampFromSecondsToMilli(timestamp);
		}

		return new Date(timestamp).toUTCString();
	};

	/**
	 * Convert all keys in an object to lowercase. Useful for normalizing HTTP headers
	 * or other key-value pairs for case-insensitive comparison.
	 * 
	 * Note: If lowercasing keys causes a collision (e.g., "Content-Type" and "content-type"),
	 * one value will overwrite the other.
	 * 
	 * @param {Object} objectWithKeys Object whose keys should be lowercased
	 * @returns {Object} New object with all keys converted to lowercase
	 * @example
	 * const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
	 * const normalized = CacheData.lowerCaseKeys(headers);
	 * console.log(normalized); // { 'content-type': 'application/json', 'cache-control': 'no-cache' }
	 */
	static lowerCaseKeys (objectWithKeys) {
		let objectWithLowerCaseKeys = {};
		if ( objectWithKeys !== null && objectWithKeys !== undefined && typeof objectWithKeys === 'object' ) {
			let keys = Object.keys(objectWithKeys); 
			// move each value from objectWithKeys to objectWithLowerCaseKeys
			keys.forEach( function( k ) { 
				objectWithLowerCaseKeys[k.toLowerCase()] = objectWithKeys[k]; 
			});
		}
		return objectWithLowerCaseKeys;
	}

	/**
	 * Calculate the size of a string in kilobytes. Uses Buffer.byteLength() to
	 * determine the byte size based on the specified character encoding, then
	 * converts to KB (bytes / 1024).
	 * 
	 * The result is rounded to 3 decimal places for precision (0.001 KB = 1 byte).
	 * 
	 * @param {string} aString The string to measure
	 * @param {string} [encode='utf8'] Character encoding to use for byte calculation
	 * @returns {number} String size in kilobytes, rounded to 3 decimal places
	 * @example
	 * const text = 'Hello, World!';
	 * const sizeKB = CacheData.calculateKBytes(text);
	 * console.log(`Size: ${sizeKB} KB`);
	 * 
	 * @example
	 * const largeText = 'x'.repeat(10000);
	 * const sizeKB = CacheData.calculateKBytes(largeText);
	 * console.log(`Size: ${sizeKB} KB`); // ~9.766 KB
	 */
	static calculateKBytes ( aString, encode = CacheData.PLAIN_ENCODING ) {
		let kbytes = 0;		
	
		if ( aString !== null ) {
			//https://www.jacklmoore.com/notes/rounding-in-javascript/

			kbytes = Number(Math.round((Buffer.byteLength(aString, encode) / 1024)+'e3')+'e-3');  ; // size in KB (rounded to 3 decimals)
			// 3 decimals is good as 1 byte = .0009KB (rounded to .001) and 5bytes = .0048KB (rounded to .005)
			// Otherwise .0009KB would be rounded to .00 and .0048 rounded to .00			
		}

		return kbytes;
	};

	/**
	 * Calculate the interval-based expiration time for cache entries. This method
	 * rounds up to the next interval boundary based on the specified interval duration.
	 * 
	 * Intervals can be set for various durations such as every 15 seconds (mm:00, mm:15,
	 * mm:30, mm:45), every hour (T00:00:00, T01:00:00), etc. For intervals of 2+ hours,
	 * calculations are based on midnight in the configured timeZoneForInterval. For
	 * multi-day intervals (48+ hours), calculations are based on the UNIX epoch
	 * (January 1, 1970).
	 * 
	 * When a timezone is configured, the interval aligns with local midnight rather
	 * than UTC midnight. For example, with timeZoneForInterval set to "America/Chicago",
	 * a 4-hour interval will align to hours 00, 04, 08, 12, 16, 20 in Chicago time.
	 * 
	 * @param {number} intervalInSeconds The interval duration in seconds (e.g., 3600 for 1 hour)
	 * @param {number} [timestampInSeconds=0] The timestamp to calculate from (0 = use current time)
	 * @returns {number} The next interval boundary timestamp in seconds
	 * @example
	 * // Calculate next 15-minute interval
	 * const now = Math.floor(Date.now() / 1000);
	 * const nextInterval = CacheData.nextIntervalInSeconds(900, now); // 900 = 15 minutes
	 * console.log(new Date(nextInterval * 1000)); // Next :00, :15, :30, or :45
	 * 
	 * @example
	 * // Calculate next hourly interval (uses current time)
	 * const nextHour = CacheData.nextIntervalInSeconds(3600);
	 * console.log(new Date(nextHour * 1000)); // Next hour boundary
	 */
	static nextIntervalInSeconds(intervalInSeconds, timestampInSeconds = 0 ) {

		// if no timestamp given, the default timestamp is now()
		if ( timestampInSeconds === 0 ) {
			timestampInSeconds = CacheData.convertTimestampFromMilliToSeconds(Date.now());
		}

		/* We do an offset conversion by adjusting the timestamp to a "local"
		time. This is purely for calculations and is not used as a "date".
		*/

		// Add in offset so we can calculate from midnight local time
		let offset = (CacheData.getOffsetInMinutes() * 60 ); // convert to seconds
		timestampInSeconds += offset;

		// convert the seconds into a date
		let date = new Date( CacheData.convertTimestampFromSecondsToMilli(timestampInSeconds) );

		// https://stackoverflow.com/questions/10789384/round-a-date-to-the-nearest-5-minutes-in-javascript
		let coeff = CacheData.convertTimestampFromSecondsToMilli(intervalInSeconds);
		let rounded = new Date(Math.ceil(date.getTime() / coeff) * coeff);
		let nextInSeconds = CacheData.convertTimestampFromMilliToSeconds(rounded.getTime());

		// revert the offset so we are looking at UTC
		nextInSeconds -= offset;

		return nextInSeconds;
	};

	/**
	 * Convert a Unix timestamp from milliseconds to seconds. If no parameter is
	 * provided, uses the current time (Date.now()).
	 * 
	 * @param {number} [timestampInMillseconds=0] Timestamp in milliseconds (0 = use current time)
	 * @returns {number} Timestamp in seconds (rounded up using Math.ceil)
	 * @example
	 * const nowMs = Date.now();
	 * const nowSec = CacheData.convertTimestampFromMilliToSeconds(nowMs);
	 * console.log(`${nowMs}ms = ${nowSec}s`);
	 * 
	 * @example
	 * // Get current time in seconds
	 * const nowSec = CacheData.convertTimestampFromMilliToSeconds();
	 */
	static convertTimestampFromMilliToSeconds (timestampInMillseconds = 0) {
		if (timestampInMillseconds === 0) { timestampInMillseconds = Date.now().getTime(); }
		return Math.ceil(timestampInMillseconds / 1000);
	};

	/**
	 * Convert a Unix timestamp from seconds to milliseconds. If no parameter is
	 * provided, uses the current time (Date.now()).
	 * 
	 * @param {number} [timestampInSeconds=0] Timestamp in seconds (0 = use current time)
	 * @returns {number} Timestamp in milliseconds
	 * @example
	 * const nowSec = Math.floor(Date.now() / 1000);
	 * const nowMs = CacheData.convertTimestampFromSecondsToMilli(nowSec);
	 * console.log(`${nowSec}s = ${nowMs}ms`);
	 * 
	 * @example
	 * // Get current time in milliseconds
	 * const nowMs = CacheData.convertTimestampFromSecondsToMilli();
	 */
	static convertTimestampFromSecondsToMilli (timestampInSeconds = 0) {
		let timestampInMilli = 0;

		if (timestampInSeconds === 0) { 
			timestampInMilli = Date.now().getTime(); 
		} else {
			timestampInMilli = timestampInSeconds * 1000;
		}

		return timestampInMilli;
	};

};

/**
 * The Cache object handles the settings for the cache system
 * 
 * Before using it must be initialized. 
 * 
 * Many settings can be set through Environment variables or by
 * passing parameters to Cache.init():
 * 
 * Cache.init({parameters});
 * 
 * Then you can then make a request, sending it through CacheableDataAccess:
 * 
 *  const { cache } = require("@63klabs/cache-data");
 * 
 *	const cacheObj = await cache.CacheableDataAccess.getData(
 *		cacheCfg, 
 *		yourFetchFunction,
 *		conn, 
 *		daoQuery
 *	);
 * 
 * @example
 * // Initialize the cache system
 * Cache.init({
 *   dynamoDbTable: 'my-cache-table',
 *   s3Bucket: 'my-cache-bucket',
 *   idHashAlgorithm: 'sha256'
 * });
 * 
 * // Create a cache instance with connection and profile
 * const connection = { host: 'api.example.com', path: '/data' };
 * const cacheProfile = { 
 *   defaultExpirationInSeconds: 300,
 *   encrypt: true 
 * };
 * const cacheInstance = new Cache(connection, cacheProfile);
 */
class Cache {

	static PUBLIC = CacheData.PUBLIC;
	static PRIVATE = CacheData.PRIVATE;

	static CRYPT_ENCODING = CacheData.CRYPT_ENCODING;
	static PLAIN_ENCODING = CacheData.PLAIN_ENCODING;

	static STATUS_NO_CACHE = "original";
	static STATUS_EXPIRED = "original:cache-expired";
	static STATUS_CACHE_SAME = "cache:original-same-as-cache";
	static STATUS_CACHE_IN_MEM = "cache:memory";
	static STATUS_CACHE = "cache";
	static STATUS_CACHE_ERROR = "error:cache"
	static STATUS_ORIGINAL_NOT_MODIFIED = "cache:original-not-modified";
	static STATUS_ORIGINAL_ERROR = "error:original";
	static STATUS_FORCED = "original:cache-update-forced";

	static #idHashAlgorithm = null;
	static #useToolsHash = null; // gets set in Cache.init()
	static #useInMemoryCache = false;
	static #inMemoryCache = null;

	#syncedNowTimestampInSeconds = 0; // consistent time base for calculations
	#syncedLaterTimestampInSeconds = 0; // default expiration if not adjusted
	#idHash = "";
	#status = null;
	#errorCode = 0;
	#store = null;

	#overrideOriginHeaderExpiration = false;
	#defaultExpirationInSeconds = 60;
	#defaultExpirationExtensionOnErrorInSeconds = 3600;
	#expirationIsOnInterval = false;
	#headersToRetain = [];

	#hostId = "notset";
	#pathId = "notset";
	#encrypt = true;

	/**
	 * Create a new Cache object
	 * @param {object} connection An object that contains data location and connection details. Typically a connection object. It may be of any format with any keys as long as they can uniquely identify this cashed object from others
	 * @param {object} cacheProfile An object with some or all of the available parameter settings listed above.
	 * @param {boolean} cacheProfile.overrideOriginHeaderExpiration Will we ignore and replace the expires header from origin or will we create our own? Defalue: false
	 * @param {number} cacheProfile.defaultExpirationInSeconds In seconds, how long is the default expiration? Default: 60 (60 seconds)
	 * @param {number} cacheProfile.defaultExpirationExtensionOnErrorInSeconds In seconds, if there is an error, how long until the error expires from cache? Default: 3600 (5 minutes)
	 * @param {boolean} cacheProfile.expirationIsOnInterval Does the cache expires timer reset on first request, or is the expires set to the clock? (ex. every 10 seconds, every hour, etc) Default: false
	 * @param {Array|string} cacheProfile.headersToRetain Array or comma deliminated string of header keys to keep from the original source to cache and pass to client. Note that there are certain headers such as content type that are always retained. Default: [] (none)
	 * @param {string} cacheProfile.hostId Used for logging. Does not need to be a valid internet host. Any identifier is valid. Default: "notset"
	 * @param {string} cacheProfile.pathId Used for logging. Does not need to be a valid internet path. Should not contain sensitive information. For example, /record/user/488322 should just be /record/user/ to denote a user record was accessed. Default: "notset"
	 * @param {boolean} cacheProfile.encrypt When at rest is the data encrypted? This also corresponds to "public" (encrypted: false) or "private" (encrypted: true) in the cache-control header. Default: true
	 */
	constructor(connection, cacheProfile = null) {

		// set cacheProfile first - these come from files and fields, so we need to cast them
		if (cacheProfile !== null) {

			// There is some documentation and template code that uses different names for these cacheProfile - offda - sorry - chadkluck 2023-08-04
			// https://github.com/chadkluck/npm-chadkluck-cache-data/issues/71
			if ( "expiresIsOnInterval" in cacheProfile ) { this.#expirationIsOnInterval = Cache.bool(cacheProfile.expiresIsOnInterval); } // we'll accept this for backwards compatibility - chadkluck 2023-08-05
			if ( "expirationIsOnInterval" in cacheProfile ) { this.#expirationIsOnInterval = Cache.bool(cacheProfile.expirationIsOnInterval); }

			if ( "defaultExpiresInSeconds" in cacheProfile ) { this.#defaultExpirationInSeconds = parseInt(cacheProfile.defaultExpiresInSeconds, 10); } // we'll accept this for backwards compatibility - chadkluck 2023-08-05
			if ( "defaultExpirationInSeconds" in cacheProfile ) { this.#defaultExpirationInSeconds = parseInt(cacheProfile.defaultExpirationInSeconds, 10); }

			// Host and Path can be confusing as these aren't actually used in the cache, but are used for logging - chadkluck 2023-08-05
			if ( "host" in cacheProfile ) { this.#hostId = cacheProfile.host; } // we'll accept host for backwards compatibility - chadkluck 2023-08-05
			if ( "hostId" in cacheProfile ) { this.#hostId = cacheProfile.hostId; } // changed from host to hostId chadkluck 2023-08-05
			if ( "path" in cacheProfile ) { this.#pathId = cacheProfile.path; } // we'll accept path for backwards compatibility - chadkluck 2023-08-05
			if ( "pathId" in cacheProfile ) { this.#pathId = cacheProfile.pathId; } // changed from path to pathId chadkluck 2023-08-05

			// Documentation uses a better term of Override rather than ignore - chadkluck 2023-08-05
			if ( "ignoreOriginHeaderExpires" in cacheProfile ) { this.#overrideOriginHeaderExpiration = Cache.bool(cacheProfile.ignoreOriginHeaderExpires); } // we'll accept this for backwards compatibility - chadkluck 2023-08-05
			if ( "ignoreOriginHeaderExpiration" in cacheProfile ) { this.#overrideOriginHeaderExpiration = Cache.bool(cacheProfile.ignoreOriginHeaderExpiration); } // we'll accept this for backwards compatibility - chadkluck 2023-08-05
			if ( "overrideOriginHeaderExpiration" in cacheProfile ) { this.#overrideOriginHeaderExpiration = Cache.bool(cacheProfile.overrideOriginHeaderExpiration); }
			
			// We are using expiration rather than expires - chadkluck 2023-08-05
			if ( "defaultExpiresExtensionOnErrorInSeconds" in cacheProfile ) { this.#defaultExpirationExtensionOnErrorInSeconds = parseInt(cacheProfile.defaultExpiresExtensionOnErrorInSeconds, 10); }
			if ( "defaultExpirationExtensionOnErrorInSeconds" in cacheProfile ) { this.#defaultExpirationExtensionOnErrorInSeconds = parseInt(cacheProfile.defaultExpirationExtensionOnErrorInSeconds, 10); }

			// set cacheProfile using the accepted property names
			if ( "headersToRetain" in cacheProfile ) { this.#headersToRetain = this.#parseHeadersToRetain(cacheProfile.headersToRetain); }
			if ( "encrypt" in cacheProfile ) { this.#encrypt = Cache.bool(cacheProfile.encrypt); }

		}
		
		// now set cache info
		this.#idHash = Cache.generateIdHash(connection);
		this.#syncedNowTimestampInSeconds = CacheData.convertTimestampFromMilliToSeconds(Date.now());
		this.#syncedLaterTimestampInSeconds = this.#syncedNowTimestampInSeconds + this.#defaultExpirationInSeconds; // now + default cache time
	};

	/**
	 * Initialize all data common to all Cache objects. 
	 * Needs to be used at the application boot, 
	 * NOT per request or after new Cache().
	 * Environment variables can be used to set the S3 bucket, DynamoDb location, etc.
	 * Use Cache.info() to check init values.
	 * 
	 * Sample param object:
	 * @example
	 * cache.Cache.init({
	 *		dynamoDbTable: process.env.CACHE_DATA_DYNAMO_DB_TABLE,
	 *		s3Bucket: process.env.CACHE_DATA_S3_BUCKET,
	 *		secureDataAlgorithm: process.env.CACHE_DATA_SECURE_DATA_ALGORITHM,
	 *		secureDataKey: Buffer.from(params.app.crypt_secureDataKey, cache.Cache.CRYPT_ENCODING),
	 *		idHashAlgorithm: process.env.CACHE_DATA_ID_HASH_ALGORITHM, // sha1, sha256, sha512, etc.
	 *		DynamoDbMaxCacheSize_kb: parseInt(process.env.CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB, 10),
	 *		purgeExpiredCacheEntriesAfterXHours: parseInt(process.env.CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS, 10),
	 * 		timeZoneForInterval: process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL // if caching on interval, we need a timezone to account for calculating hours, days, and weeks. List: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
	 *	});
	 * 
	 * @param {Object} parameters
	 * @param {string} parameters.dynamoDbTable Can also be set with environment variable CACHE_DATA_DYNAMO_DB_TABLE
	 * @param {string} parameters.s3Bucket Can also be set with environment variable CACHE_DATA_S3_BUCKET
	 * @param {string} parameters.secureDataAlgorithm Can also be set with environment variable CACHE_DATA_SECURE_DATA_ALGORITHM
	 * @param {string|Buffer|tools.Secret|tools.CachedSSMParameter|tools.CachedSecret} parameters.secureDataKey Must be passed, will not accept an environment variable for security reasons.
	 * @param {number} parameters.DynamoDbMaxCacheSize_kb Can also be set with environment variable CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB
	 * @param {number} parameters.purgeExpiredCacheEntriesAfterXHours Can also be set with environment variable CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS
	 * @param {string} parameters.timeZoneForInterval Can also be set with environment variable CACHE_DATA_TIME_ZONE_FOR_INTERVAL
	 * @throws {Error} If parameters is not an object or is null
	 */
	static init(parameters) {
		// check if parameters is an object
		if ( typeof parameters !== 'object' || parameters === null ) {
			tools.DebugAndLog.error("Cache.init() parameters must be an object");
			throw new Error("Cache.init() parameters must be an object");
		}

		// if parameters are set, use them, otherwise check for environment variables
		this.#idHashAlgorithm = parameters.idHashAlgorithm || process.env.CACHE_DATA_ID_HASH_ALGORITHM || "RSA-SHA256";
		this.#useToolsHash = ( "useToolsHash" in parameters ) ? Cache.bool(parameters.useToolsHash) : 
			("CACHE_DATA_USE_TOOLS_HASH" in process.env ? Cache.bool(process.env.CACHE_DATA_USE_TOOLS_HASH_METHOD) : false);
		
		// Initialize in-memory cache feature flag
		this.#useInMemoryCache = parameters.useInMemoryCache || 
			(process.env.CACHE_USE_IN_MEMORY === 'true') || 
			false;
		
		// Initialize InMemoryCache if enabled
		if (this.#useInMemoryCache) {
			const InMemoryCache = require('./utils/InMemoryCache.js');
			this.#inMemoryCache = new InMemoryCache({
				maxEntries: parameters.inMemoryCacheMaxEntries,
				entriesPerGB: parameters.inMemoryCacheEntriesPerGB,
				defaultMaxEntries: parameters.inMemoryCacheDefaultMaxEntries
			});
			tools.DebugAndLog.debug('In-memory cache initialized');
		}
		
		// Let CacheData handle the rest of the initialization
		CacheData.init(parameters);
	};

	/**
	 * Get comprehensive configuration information about the Cache system.
	 * Returns an object containing all configuration parameters including
	 * the ID hash algorithm, DynamoDB table, S3 bucket, encryption settings,
	 * size limits, timezone information, and in-memory cache status.
	 * 
	 * This method combines Cache-specific settings with CacheData configuration
	 * to provide a complete view of the cache system configuration.
	 * 
	 * @returns {{
	 * 		idHashAlgorithm: string,
	 * 		dynamoDbTable: string, 
	 * 		s3Bucket: string,
	 * 		secureDataAlgorithm: string,
	 * 		secureDataKey: string,
	 * 		DynamoDbMaxCacheSize_kb: number,
	 * 		purgeExpiredCacheEntriesAfterXHours: number,
	 * 		timeZoneForInterval: string,
	 * 		offsetInMinutes: number,
	 * 		useInMemoryCache: boolean,
	 * 		inMemoryCache?: Object
	 * }} Configuration information object
	 * @example
	 * const info = Cache.info();
	 * console.log(`Hash algorithm: ${info.idHashAlgorithm}`);
	 * console.log(`DynamoDB table: ${info.dynamoDbTable}`);
	 * console.log(`S3 bucket: ${info.s3Bucket.bucket}`);
	 * console.log(`In-memory cache enabled: ${info.useInMemoryCache}`);
	 */
	static info() {
		const info = Object.assign({ idHashAlgorithm: this.#idHashAlgorithm }, CacheData.info()); // merge into 1 object
		
		// Add in-memory cache info
		info.useInMemoryCache = this.#useInMemoryCache;
		if (this.#useInMemoryCache && this.#inMemoryCache !== null) {
			info.inMemoryCache = this.#inMemoryCache.info();
		}
		
		return info;
	};

	/**
	 * Test the interval calculation functionality by computing next intervals
	 * for various durations. This method is useful for debugging and verifying
	 * that interval-based cache expiration is working correctly with the
	 * configured timezone.
	 * 
	 * Returns an object containing the current cache configuration and test
	 * results showing the next interval boundary for various durations from
	 * 15 seconds to 120 hours (5 days).
	 * 
	 * @returns {{info: Object, tests: Object}} Object containing cache info and test results with next interval timestamps
	 * @example
	 * const testResults = Cache.testInterval();
	 * console.log('Current time:', testResults.tests.start);
	 * console.log('Next 15-second interval:', testResults.tests.sec_15);
	 * console.log('Next hourly interval:', testResults.tests.min_60);
	 * console.log('Next daily interval:', testResults.tests.hrs_24);
	 */
	static testInterval () {
		let ts = CacheData.convertTimestampFromMilliToSeconds(Date.now());
		return { 
			"info": Cache.info(),
			"tests": {
				"start":  (new Date( CacheData.convertTimestampFromSecondsToMilli(ts))),
				"sec_15": (new Date(Cache.nextIntervalInSeconds(15, ts)*1000)),
				"sec_30": (new Date(Cache.nextIntervalInSeconds(30, ts)*1000)),
				"sec_60": (new Date(Cache.nextIntervalInSeconds(60, ts)*1000)),
				"min_05": (new Date(Cache.nextIntervalInSeconds(5*60, ts)*1000)),
				"min_10": (new Date(Cache.nextIntervalInSeconds(10*60, ts)*1000)),
				"min_15": (new Date(Cache.nextIntervalInSeconds(15*60, ts)*1000)),
				"min_30": (new Date(Cache.nextIntervalInSeconds(30*60, ts)*1000)),
				"min_60": (new Date(Cache.nextIntervalInSeconds(60*60, ts)*1000)),
				"hrs_02": (new Date(Cache.nextIntervalInSeconds(2*60*60, ts)*1000)),
				"hrs_03": (new Date(Cache.nextIntervalInSeconds(3*60*60, ts)*1000)),
				"hrs_04": (new Date(Cache.nextIntervalInSeconds(4*60*60, ts)*1000)),
				"hrs_05": (new Date(Cache.nextIntervalInSeconds(5*60*60, ts)*1000)),
				"hrs_06": (new Date(Cache.nextIntervalInSeconds(6*60*60, ts)*1000)),
				"hrs_08": (new Date(Cache.nextIntervalInSeconds(8*60*60, ts)*1000)),
				"hrs_12": (new Date(Cache.nextIntervalInSeconds(12*60*60, ts)*1000)),
				"hrs_24": (new Date(Cache.nextIntervalInSeconds(24*60*60, ts)*1000)),
				"hrs_48": (new Date(Cache.nextIntervalInSeconds(48*60*60, ts)*1000)),
				"hrs_72": (new Date(Cache.nextIntervalInSeconds(72*60*60, ts)*1000)),
				"hrs_96": (new Date(Cache.nextIntervalInSeconds(96*60*60, ts)*1000)),
				"hrs_120": (new Date(Cache.nextIntervalInSeconds(120*60*60, ts)*1000))
			}
		};
	};

	/**
	 * Convert a value to boolean with special handling for the string "false".
	 * 
	 * JavaScript's Boolean() function treats any non-empty string as true, including
	 * the string "false". This method adds special handling for the string "false"
	 * (case-insensitive) to return false, which is useful when dealing with JSON data,
	 * query parameters, or configuration strings.
	 * 
	 * All other values are evaluated using JavaScript's standard Boolean() conversion.
	 * 
	 * @param {*} value A value to convert to boolean
	 * @returns {boolean} The boolean representation of the value, with "false" string treated as false
	 * @example
	 * Cache.bool(true);      // true
	 * Cache.bool(false);     // false
	 * Cache.bool("true");    // true
	 * Cache.bool("false");   // false (special handling)
	 * Cache.bool("FALSE");   // false (case-insensitive)
	 * Cache.bool(1);         // true
	 * Cache.bool(0);         // false
	 * Cache.bool(null);      // false
	 * Cache.bool("");        // false
	 */
	static bool (value) {

		if ( typeof value === 'string') { value = value.toLowerCase(); }

		// Boolean("false") is true so we need to code for it. As long as it is not "false", trust Boolean()
		return  (( value !== "false") ? Boolean(value) : false ); 
	};
	
	/**
	 * Generate an ETag hash for cache validation. Creates a unique hash by combining
	 * the cache ID hash with the content body. This is used for HTTP ETag headers to
	 * enable conditional requests and cache validation.
	 * 
	 * This is a convenience wrapper around CacheData.generateEtag().
	 * 
	 * @param {string} idHash The unique identifier hash for the cache entry
	 * @param {string} content The content body to include in the ETag calculation
	 * @returns {string} A 10-character ETag hash
	 * @example
	 * const etag = Cache.generateEtag('abc123', '{"data":"value"}');
	 * console.log(`ETag: ${etag}`); // e.g., "a1b2c3d4e5"
	 */
	static generateEtag(idHash, content) {
		return CacheData.generateEtag(idHash, content);
	};

	/**
	 * Convert all keys in an object to lowercase. Useful for normalizing HTTP headers
	 * or other key-value pairs for case-insensitive comparison.
	 * 
	 * This is a convenience wrapper around CacheData.lowerCaseKeys().
	 * 
	 * Note: If lowercasing keys causes a collision (e.g., "Content-Type" and "content-type"),
	 * one value will overwrite the other.
	 * 
	 * @param {Object} objectWithKeys Object whose keys should be lowercased
	 * @returns {Object} New object with all keys converted to lowercase
	 * @example
	 * const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
	 * const normalized = Cache.lowerCaseKeys(headers);
	 * console.log(normalized); // { 'content-type': 'application/json', 'cache-control': 'no-cache' }
	 */
	static lowerCaseKeys(objectWithKeys) {
		return CacheData.lowerCaseKeys(objectWithKeys);
	};

	/**
	 * Generate an internet-formatted date string for use in HTTP headers.
	 * Converts a Unix timestamp to the standard HTTP date format.
	 * 
	 * This is a convenience wrapper around CacheData.generateInternetFormattedDate().
	 * 
	 * Example output: "Wed, 28 Jul 2021 12:24:11 GMT"
	 * 
	 * @param {number} timestamp Unix timestamp (in seconds by default, or milliseconds if inMilliseconds is true)
	 * @param {boolean} [inMilliseconds=false] Set to true if timestamp is in milliseconds
	 * @returns {string} Internet-formatted date string (e.g., "Wed, 28 Jul 2021 12:24:11 GMT")
	 * @example
	 * const now = Math.floor(Date.now() / 1000);
	 * const dateStr = Cache.generateInternetFormattedDate(now);
	 * console.log(dateStr); // "Mon, 26 Jan 2026 15:30:45 GMT"
	 * 
	 * @example
	 * const nowMs = Date.now();
	 * const dateStr = Cache.generateInternetFormattedDate(nowMs, true);
	 */
	static generateInternetFormattedDate(timestamp, inMilliseconds = false) {
		return CacheData.generateInternetFormattedDate(timestamp, inMilliseconds);
	};

	/**
	 * Uses object-hash to create a hash of an object passed to it
	 * Object-hash respects object structures and arrays and performs a sort to
	 * normalize objects so that objects with the same key/value structure are
	 * identified as such. For example:
	 * {host: "example.com", path: "/api"} === {path: "/api", host: "example.com"}
	 * 
	 * You can also pass in a string such as "MYID-03-88493" if your id is not
	 * query based.
	 * 
	 * Note: Arrays are sorted alphabetically. So [1,2,3] will be same as 
	 * [3,1,2] and ["A","B","C"] will be same as ["B","C","A"] so if the order
	 * of the array matters it is recommended to perform a .join prior. This is 
	 * so that:
	 * 	{query: {types: "db,contact,guides"} } === {query: {types: "contact,guides,db"} }
	 * 	example.com/?types=db,contact,guides === example.com/?types=contact,guides,db
	 * 
	 * You can pass in an object containing request header and query param 
	 * represented as objects.
	 * 
	 * As an example, CacheableDataAccess() combines 3 of the parameter objects
	 * passed to it.
	 * query, connection, and cachePolicy are pased as an object by 
	 * CacheableDataAccess() for Cache() to create a hashed id: 
	 * { query: query, connection: connection, cachePolicy: cachePolicy };
	 * 
	 * Passing an array of objects such as:
	 * [ query, connection, cachePolicy ]
	 * also works. object-hash is REALLY cool and magical
	 * 
	 * Uses object-hash: https://www.npmjs.com/package/object-hash
	 * Git: https://github.com/puleos/object-hash
	 * 
	 * Make sure it is installed in app/node_modules with an entry in app/package.json
	 *   "dependencies": {
	 * 		"object-hash": "^2.2.0"
	 *   }
	 * 
	 * @param {Object|Array|string} idObject Object, Array, or string to hash. Object may contain a single value with a text string, or complex http request broken down into parts
	 * @returns {string} A hash representing the object (Algorithm used is set in Cache object constructor)
	 * @example
	 * // Hash a simple object
	 * const connection = { host: 'api.example.com', path: '/users' };
	 * const hash = Cache.generateIdHash(connection);
	 * console.log(hash); // "a1b2c3d4e5f6..."
	 * 
	 * @example
	 * // Hash a complex request object
	 * const requestObj = {
	 *   query: { type: 'user', id: '123' },
	 *   connection: { host: 'api.example.com', path: '/data' },
	 *   cachePolicy: { ttl: 300 }
	 * };
	 * const hash = Cache.generateIdHash(requestObj);
	 * 
	 * @example
	 * // Hash a simple string ID
	 * const hash = Cache.generateIdHash('MYID-03-88493');
	 */
	static generateIdHash(idObject) {

		// Helper function to remove functions from an object
		const removeFunctions = (obj) => {
			const newObj = {};
			for (const [key, value] of Object.entries(obj)) {
				if (typeof value === 'function') {
					continue; // skip functions
				}
				if (typeof value === 'object' && value !== null) {
					newObj[key] = removeFunctions(value); // recursively handle nested objects
				} else {
					newObj[key] = value;
				}
			}
			return newObj;
		};
	
		// Create clean object without functions first
		const cleanObject = removeFunctions(idObject);
		
		// Now safe to use structuredClone - deep clone idObject so we don't change the original
		const clonedIdObject = structuredClone(cleanObject);
			
		// set salt to process.env.AWS_LAMBDA_FUNCTION_NAME if it exists, otherwise use ""
		const salt = process.env?.AWS_LAMBDA_FUNCTION_NAME || "";

		// remove connection.options from clonedIdObject
		if ( clonedIdObject.connection?.options ) { delete clonedIdObject.connection.options; }

		// use the built-in hashing from CacheData tools
		if ( this.#useToolsHash ) { return tools.hashThisData(this.#idHashAlgorithm, clonedIdObject, {salt}); }

		// use the external package object-hash settings
		const objHashSettings = {
			algorithm: this.#idHashAlgorithm,
			encoding: "hex", // default, but we'll list it here anyway as it is important for this use case
			respectType: true, // default, but we'll list it here anyway as it is important for this use case
			unorderedSets: true, // default, but we'll list it here anyway as it is important for this use case
			unorderedObjects: true, // default, but we'll list it here anyway as it is important for this use case
			unorderedArrays: true // default is false but we want true - would be a problem if array sequence mattered, but not in this use case
		};

		// there is no salt in object-hash, so we add it to a property that would be least likely to conflict
		clonedIdObject.THIS_IS_SALT_FOR_CK_CACHE_DATA_ID_HASH = salt;

		return objHash(clonedIdObject, objHashSettings);

	};

	/**
	 * Converts an array to a string using a join. However, it is fluid in case
	 * we might also be passed an id that is already a string.
	 * @param {Array|string} identifierArrayOrString An array we wish to join together as an id. (also could be a string which we won't touch)
	 * @param {string} glue The glue or delimiter to place between the array elements once it is in string form
	 * @returns {string} The array in string form delimited by the glue.
	 * @example
	 * // Join array elements with default delimiter
	 * const id = Cache.multipartId(['user', '123', 'profile']);
	 * console.log(id); // "user-123-profile"
	 * 
	 * @example
	 * // Use custom delimiter
	 * const id = Cache.multipartId(['api', 'v2', 'users'], '/');
	 * console.log(id); // "api/v2/users"
	 * 
	 * @example
	 * // Pass a string (returns unchanged)
	 * const id = Cache.multipartId('already-a-string');
	 * console.log(id); // "already-a-string"
	 */
	static multipartId (identifierArrayOrString, glue = "-") {
		let id = null;
		if ( Array.isArray(identifierArrayOrString) || typeof identifierArrayOrString === 'string') {
			id = ( Array.isArray(identifierArrayOrString) ) ? identifierArrayOrString.join(glue) : identifierArrayOrString;
		}
		return id;
	};

	/**
	 * Convert a date string to a Unix timestamp in seconds. Uses Date.parse() to
	 * parse the date string and converts the result from milliseconds to seconds.
	 * 
	 * This method is useful for converting HTTP date headers (like "Expires" or
	 * "Last-Modified") into Unix timestamps for comparison and calculation.
	 * 
	 * @param {string} date Date string to parse (e.g., "2011-10-10T14:48:00" or "Wed, 28 Jul 2021 12:24:11 GMT")
	 * @returns {number} The date in seconds since January 1, 1970, 00:00:00 UTC, or 0 if parsing fails
	 * @example
	 * const timestamp = Cache.parseToSeconds("2021-07-28T12:24:11Z");
	 * console.log(timestamp); // 1627476251
	 * 
	 * @example
	 * const timestamp = Cache.parseToSeconds("Wed, 28 Jul 2021 12:24:11 GMT");
	 * console.log(timestamp); // 1627476251
	 */
	static parseToSeconds(date) {
		let timestampInSeconds = 0;
		try {
			timestampInSeconds = CacheData.convertTimestampFromMilliToSeconds( Date.parse(date) );
		} catch (error) {
			tools.DebugAndLog.error(`Cannot parse date/time: ${date} ${error?.message || 'Unknown error'}`, error?.stack);
		}
		return timestampInSeconds;
	};

	/**
	 * We can set times and expirations on intervals, such as every
	 * 15 seconds (mm:00, mm:15, mm:30, mm:45), every half hour 
	 * (hh:00:00, hh:30:00), every hour (T00:00:00, T01:00:00), etc.
	 * In some cases such as every 2 hours, the interval is calculated
	 * from midnight in the timezone specified in timeZoneForInterval 
	 * Spans of days (such as every two days (48 hours) or every three
	 * days (72 hours) are calculated from midnight of the UNIX epoch
	 * (January 1, 1970).
	 * 
	 * When a timezone is set in timeZoneForInterval, then there is
	 * a slight adjustment made so that the interval lines up with
	 * midnight of the "local" time. For example, if an organization
	 * is primarily located in the Central Time Zone (or their 
	 * nightly batch jobs occur at GMT-05:00) then timeZoneForInterval
	 * may be set to "America/Chicago" so that midnight in 
	 * "America/Chicago" may be used for calculations. That keeps
	 * every 4 hours on hours 00, 04, 08, 12, 16, etc.
	 * @param {number} intervalInSeconds 
	 * @param {number} timestampInSeconds 
	 * @returns {number} Next interval in seconds
	 * @example
	 * // Calculate next 15-minute interval
	 * const now = Math.floor(Date.now() / 1000);
	 * const next15Min = Cache.nextIntervalInSeconds(15 * 60, now);
	 * console.log(new Date(next15Min * 1000)); // Next 15-minute boundary
	 * 
	 * @example
	 * // Calculate next hourly interval
	 * const nextHour = Cache.nextIntervalInSeconds(3600);
	 * console.log(new Date(nextHour * 1000)); // Next hour boundary
	 */
	static nextIntervalInSeconds(intervalInSeconds, timestampInSeconds = 0) {
		return CacheData.nextIntervalInSeconds(intervalInSeconds, timestampInSeconds);
	};


	/**
	 * Calculate the size of a string in kilobytes. Uses Buffer.byteLength() to
	 * determine the byte size based on the specified character encoding, then
	 * converts to KB (bytes / 1024).
	 * 
	 * This is a convenience wrapper around CacheData.calculateKBytes().
	 * 
	 * The result is rounded to 3 decimal places for precision (0.001 KB = 1 byte).
	 * 
	 * @param {string} aString The string to measure
	 * @param {string} [encode='utf8'] Character encoding to use for byte calculation
	 * @returns {number} String size in kilobytes, rounded to 3 decimal places
	 * @example
	 * const text = 'Hello, World!';
	 * const sizeKB = Cache.calculateKBytes(text);
	 * console.log(`Size: ${sizeKB} KB`);
	 * 
	 * @example
	 * const largeText = 'x'.repeat(10000);
	 * const sizeKB = Cache.calculateKBytes(largeText);
	 * console.log(`Size: ${sizeKB} KB`); // ~9.766 KB
	 */
	static calculateKBytes ( aString, encode = CacheData.PLAIN_ENCODING ) {
		return CacheData.calculateKBytes( aString, encode);
	};

	/**
	 * Convert a comma-delimited string or array to an array with all lowercase values.
	 * This method is useful for normalizing lists of header names or other identifiers
	 * for case-insensitive comparison.
	 * 
	 * If an array is provided, it is first converted to a comma-delimited string,
	 * then lowercased and split back into an array.
	 * 
	 * @param {string|Array.<string>} list Comma-delimited string or array to convert
	 * @returns {Array.<string>} Array with all values converted to lowercase
	 * @example
	 * const headers = Cache.convertToLowerCaseArray('Content-Type,Cache-Control,ETag');
	 * console.log(headers); // ['content-type', 'cache-control', 'etag']
	 * 
	 * @example
	 * const headers = Cache.convertToLowerCaseArray(['Content-Type', 'Cache-Control']);
	 * console.log(headers); // ['content-type', 'cache-control']
	 */
	static convertToLowerCaseArray(list) {

		// if it is an array, we'll convert to csv string
		if (Array.isArray(list)) {
			list = list.join(',');
		}

		// lowercase the string and then convert to an array
		return list.toLowerCase().split(',');
	};

	/**
	 * Internal method to parse and normalize the headersToRetain configuration.
	 * Converts either a comma-delimited string or array into an array of lowercase
	 * header names that should be retained from the origin response.
	 * 
	 * @private
	 * @param {string|Array.<string>} list Comma-delimited string or array of header names
	 * @returns {Array.<string>} Array of lowercase header names to retain
	 * @example
	 * // Called internally during Cache constructor
	 * const headers = this.#parseHeadersToRetain('Content-Type,Cache-Control');
	 * // Returns: ['content-type', 'cache-control']
	 */
	#parseHeadersToRetain (list) {
		return Cache.convertToLowerCaseArray(list);
	};

	/**
	 * Get the cache profile configuration for this Cache instance.
	 * Returns an object containing all the cache policy settings that were
	 * configured when this Cache object was created.
	 * 
	 * @returns {{
	 * 		overrideOriginHeaderExpiration: boolean,
	 * 		defaultExpirationInSeconds: number,
	 * 		defaultExpirationExtensionOnErrorInSeconds: number,
	 * 		expirationIsOnInterval: boolean,
	 * 		headersToRetain: Array<string>,
	 * 		hostId: string,
	 * 		pathId: string,
	 * 		encrypt: boolean
	 * }} Cache profile configuration object
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * const profile = cache.profile();
	 * console.log(`Expiration: ${profile.defaultExpirationInSeconds}s`);
	 * console.log(`Encrypted: ${profile.encrypt}`);
	 */
	profile () {
		return {
			overrideOriginHeaderExpiration: this.#overrideOriginHeaderExpiration,
			defaultExpirationInSeconds: this.#defaultExpirationInSeconds,
			defaultExpirationExtensionOnErrorInSeconds: this.#defaultExpirationExtensionOnErrorInSeconds,
			expirationIsOnInterval: this.#expirationIsOnInterval,
			headersToRetain: this.#headersToRetain,
			hostId: this.#hostId,
			pathId: this.#pathId,
			encrypt: this.#encrypt			
		}
	};

	/**
	 * Read cached data from storage (DynamoDB and potentially S3). This method
	 * first checks the in-memory cache (if enabled), then falls back to DynamoDB.
	 * 
	 * If data is found in the in-memory cache and not expired, it is returned
	 * immediately. Otherwise, data is fetched from DynamoDB and stored in the
	 * in-memory cache for future requests.
	 * 
	 * This method is called automatically by CacheableDataAccess.getData() and
	 * typically does not need to be called directly.
	 * 
	 * @returns {Promise<CacheDataFormat>} Formatted cache data with body, headers, expires, and statusCode
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * if (cache.needsRefresh()) {
	 *   console.log('Cache miss or expired');
	 * } else {
	 *   console.log('Cache hit:', cache.getBody());
	 * }
	 */
	async read () {

		return new Promise(async (resolve) => {

			if ( this.#store !== null ) {
				resolve(this.#store);
			} else {
				try {
					let staleData = null;
					
					// Check L0_Cache if feature is enabled
					if (Cache.#useInMemoryCache && Cache.#inMemoryCache !== null) {
						const memResult = Cache.#inMemoryCache.get(this.#idHash);
						
						if (memResult.cache === 1) {
							// Cache hit - return immediately
							this.#store = memResult.data;
							this.#status = Cache.STATUS_CACHE_IN_MEM;
							tools.DebugAndLog.debug(`In-memory cache hit: ${this.#idHash}`);
							resolve(this.#store);
							return;
						} else if (memResult.cache === -1) {
							// Expired - retain for potential fallback
							staleData = memResult.data;
							tools.DebugAndLog.debug(`In-memory cache expired, retaining stale data: ${this.#idHash}`);
						}
						// cache === 0 means miss, continue to DynamoDB
					}
					
					// Fetch from DynamoDB
					this.#store = await CacheData.read(this.#idHash, this.#syncedLaterTimestampInSeconds);
					this.#status = ( this.#store.cache.statusCode === null ) ? Cache.STATUS_NO_CACHE : Cache.STATUS_CACHE;
					
					// Store in L0_Cache if successful and feature enabled
					if (Cache.#useInMemoryCache && Cache.#inMemoryCache !== null && this.#store.cache.statusCode !== null) {
						const expiresAt = this.#store.cache.expires * 1000; // Convert to milliseconds
						Cache.#inMemoryCache.set(this.#idHash, this.#store, expiresAt);
						tools.DebugAndLog.debug(`Stored in L0_Cache: ${this.#idHash}`);
					}

					tools.DebugAndLog.debug(`Cache Read status: ${this.#status}`);

					resolve(this.#store);
				} catch (error) {
					// Error occurred - check if we have stale data to return
					if (staleData !== null) {
						// Calculate new expiration using error extension
						const newExpires = this.#syncedNowTimestampInSeconds + this.#defaultExpirationExtensionOnErrorInSeconds;
						const newExpiresAt = newExpires * 1000;
						
						// Update stale data expiration
						staleData.cache.expires = newExpires;
						
						// Store updated stale data back in L0_Cache
						if (Cache.#useInMemoryCache && Cache.#inMemoryCache !== null) {
							Cache.#inMemoryCache.set(this.#idHash, staleData, newExpiresAt);
						}
						
						this.#store = staleData;
						this.#status = Cache.STATUS_CACHE_ERROR;
						tools.DebugAndLog.warn(`Returning stale data due to error: ${this.#idHash}`);
					} else {
						this.#store = CacheData.format(this.#syncedLaterTimestampInSeconds);
						this.#status = Cache.STATUS_CACHE_ERROR;
					}

					tools.DebugAndLog.error(`Cache Read: Cannot read cached data for ${this.#idHash}: ${error?.message || 'Unknown error'}`, error?.stack);

					resolve(this.#store);
				};
			}

		});

	};

	/**
	 * Get diagnostic test data for this Cache instance. Returns an object containing
	 * the results of calling various getter methods, useful for debugging and
	 * verifying cache state.
	 * 
	 * This method is primarily for testing and debugging purposes.
	 * 
	 * @returns {{
	 * 		get: CacheDataFormat,
	 * 		getStatus: string,
	 * 		getETag: string,
	 * 		getLastModified: string,
	 * 		getExpires: number,
	 * 		getExpiresGMT: string,
	 * 		getHeaders: Object,
	 * 		getSyncedNowTimestampInSeconds: number,
	 * 		getBody: string,
	 * 		getIdHash: string,
	 * 		getClassification: string,
	 * 		needsRefresh: boolean,
	 * 		isExpired: boolean,
	 * 		isEmpty: boolean,
	 * 		isPrivate: boolean,
	 * 		isPublic: boolean,
	 * 		currentStatus: string,
	 * 		calculateDefaultExpires: number
	 * }} Object containing test data from various cache methods
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const testData = cache.test();
	 * console.log('Cache test data:', testData);
	 */
	test() {
		return {
			get: this.get(),
			getStatus: this.getStatus(),
			getETag: this.getETag(),
			getLastModified: this.getLastModified(),
			getExpires: this.getExpires(),
			getExpiresGMT: this.getExpiresGMT(),
			getHeaders: this.getHeaders(),
			getSyncedNowTimestampInSeconds: this.getSyncedNowTimestampInSeconds(),
			getBody: this.getBody(),
			getIdHash: this.getIdHash(),
			getClassification: this.getClassification(),
			needsRefresh: this.needsRefresh(),
			isExpired: this.isExpired(),
			isEmpty: this.isEmpty(),
			isPrivate: this.isPrivate(),
			isPublic: this.isPublic(),
			currentStatus: this.getStatus(),
			calculateDefaultExpires: this.calculateDefaultExpires()
		};
	};

	/**
	 * Get the complete cache data object. Returns the internal cache store
	 * containing the cached body, headers, expiration, and status code.
	 * 
	 * @returns {CacheDataFormat} The complete cache data object
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const data = cache.get();
	 * console.log(data.cache.body);
	 * console.log(data.cache.expires);
	 */
	get() {
		return this.#store;
	};

	/**
	 * Get the source status of the cache data. Returns a status string indicating
	 * where the data came from and its current state.
	 * 
	 * Possible values include:
	 * - Cache.STATUS_NO_CACHE: No cached data exists
	 * - Cache.STATUS_CACHE: Data from cache
	 * - Cache.STATUS_CACHE_IN_MEM: Data from in-memory cache
	 * - Cache.STATUS_EXPIRED: Cached data was expired
	 * - Cache.STATUS_CACHE_SAME: Cache updated but content unchanged
	 * - Cache.STATUS_ORIGINAL_NOT_MODIFIED: Origin returned 304 Not Modified
	 * - Cache.STATUS_ORIGINAL_ERROR: Error fetching from origin
	 * - Cache.STATUS_CACHE_ERROR: Error reading from cache
	 * - Cache.STATUS_FORCED: Cache update was forced
	 * 
	 * @returns {string} The source status string
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * console.log(`Data source: ${cache.getSourceStatus()}`);
	 */
	getSourceStatus() {
		return this.#status;
	};

	/**
	 * Get the ETag header value from the cached data. The ETag is used for
	 * cache validation and conditional requests.
	 * 
	 * @returns {string|null} The ETag value, or null if not present
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const etag = cache.getETag();
	 * console.log(`ETag: ${etag}`);
	 */
	getETag() {
		return this.getHeader("etag");
	};

	/**
	 * Get the Last-Modified header value from the cached data. This timestamp
	 * indicates when the cached content was last modified at the origin.
	 * 
	 * @returns {string|null} The Last-Modified header value in HTTP date format, or null if not present
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const lastModified = cache.getLastModified();
	 * console.log(`Last modified: ${lastModified}`);
	 */
	getLastModified() {
		return this.getHeader("last-modified");
	};

	/**
	 * Get the expiration timestamp of the cached data. Returns the Unix timestamp
	 * (in seconds) when the cached data will expire.
	 * 
	 * @returns {number} Expiration timestamp in seconds since Unix epoch, or 0 if no cache data
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const expires = cache.getExpires();
	 * console.log(`Expires at: ${new Date(expires * 1000)}`);
	 */
	getExpires() {
		let exp = (this.#store !== null) ? this.#store.cache.expires : 0;
		return exp;
	};

	/**
	 * Get the expiration as an internet formatted date used in headers.
	 * 
	 * Example: "Wed, 28 Jul 2021 12:24:11 GMT"
	 * 
	 * @returns {string} The expiration formated for use in headers. Same as expires header.
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const expiresGMT = cache.getExpiresGMT();
	 * console.log(expiresGMT); // "Wed, 28 Jul 2021 12:24:11 GMT"
	 */
	getExpiresGMT() {
		return this.getHeader("expires");
	};

	/**
	 * Calculate the number of seconds remaining until the cached data expires.
	 * Returns 0 if the cache is already expired or if there is no cached data.
	 * 
	 * @returns {number} The number of seconds until expiration, or 0 if expired
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const secondsLeft = cache.calculateSecondsLeftUntilExpires();
	 * console.log(`Cache expires in ${secondsLeft} seconds`);
	 */
	calculateSecondsLeftUntilExpires() {
		let secondsLeftUntilExpires = this.getExpires() - CacheData.convertTimestampFromMilliToSeconds( Date.now() );
		if (secondsLeftUntilExpires < 0) { secondsLeftUntilExpires = 0; }

		return secondsLeftUntilExpires;
	};

	/**
	 * Generate the value for the Cache-Control HTTP header. Returns a string
	 * containing the classification (public or private) and the max-age directive
	 * based on the time remaining until expiration.
	 * 
	 * Example output: "public, max-age=3600" or "private, max-age=300"
	 * 
	 * @returns {string} The Cache-Control header value
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const cacheControl = cache.getCacheControlHeaderValue();
	 * console.log(cacheControl); // "public, max-age=3600"
	 */
	getCacheControlHeaderValue() {
		return this.getClassification() +", max-age="+this.calculateSecondsLeftUntilExpires();
	};

	/**
	 * Get all HTTP headers from the cached data. Returns an object containing
	 * all header key-value pairs that were stored with the cached content.
	 * 
	 * @returns {Object|null} Object containing all cached headers, or null if no cache data
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const headers = cache.getHeaders();
	 * console.log(headers['content-type']);
	 * console.log(headers['etag']);
	 */
	getHeaders() {
		return (this.#store !== null && "headers" in this.#store.cache) ? this.#store.cache.headers : null;
	};

	/**
	 * Get the HTTP status code from the cached data. Returns the status code
	 * that was stored when the data was originally cached.
	 * 
	 * @returns {string|null} The HTTP status code (e.g., "200", "404"), or null if no cache data
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const statusCode = cache.getStatusCode();
	 * console.log(`Status: ${statusCode}`); // "200"
	 */
	getStatusCode() {
		return (this.#store !== null && "statusCode" in this.#store.cache) ? this.#store.cache.statusCode : null;
	};

	/**
	 * Get the current error code for this cache instance. Returns a non-zero
	 * error code if an error occurred during cache operations, or 0 if no error.
	 * 
	 * Error codes are typically HTTP status codes (400+) that were encountered
	 * when trying to refresh the cache from the origin.
	 * 
	 * @returns {number} The error code, or 0 if no error
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const errorCode = cache.getErrorCode();
	 * if (errorCode >= 400) {
	 *   console.log(`Error occurred: ${errorCode}`);
	 * }
	 */
	getErrorCode() {
		return this.#errorCode;
	};

	/**
	 * Get the classification of the cached data. Returns "private" if the data
	 * is encrypted, or "public" if not encrypted.
	 * 
	 * This classification is used in the Cache-Control header to indicate how
	 * the data should be treated by intermediate caches and proxies.
	 * 
	 * @returns {string} Either "private" (encrypted) or "public" (not encrypted)
	 * @example
	 * const cache = new Cache(connection, { encrypt: true });
	 * console.log(cache.getClassification()); // "private"
	 * 
	 * const publicCache = new Cache(connection, { encrypt: false });
	 * console.log(publicCache.getClassification()); // "public"
	 */
	getClassification() {
		return (this.#encrypt ? Cache.PRIVATE : Cache.PUBLIC );
	};

	/**
	 * Get the synchronized "now" timestamp in seconds. This timestamp is set when
	 * the Cache object is created and remains constant throughout the cache operation,
	 * providing a consistent time base for expiration calculations.
	 * 
	 * @returns {number} The timestamp in seconds when this Cache object was created
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * const now = cache.getSyncedNowTimestampInSeconds();
	 * console.log(`Cache created at: ${new Date(now * 1000)}`);
	 */
	getSyncedNowTimestampInSeconds() {
		return this.#syncedNowTimestampInSeconds;
	};

	/**
	 * Get a specific header value from the cached data by key. Header keys are
	 * case-insensitive (stored as lowercase).
	 * 
	 * @param {string} key The header key to retrieve (case-insensitive)
	 * @returns {string|number|null} The header value, or null if the header doesn't exist
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const contentType = cache.getHeader('content-type');
	 * const etag = cache.getHeader('ETag'); // Case-insensitive
	 * console.log(`Content-Type: ${contentType}`);
	 */
	getHeader(key) {
		let headers = this.getHeaders();
		return ( headers !== null && key in headers) ? headers[key] : null
	};

	/**
	 * Get the cached body content. Optionally parses JSON content into an object.
	 * 
	 * By default, returns the body as a string (which may be JSON-encoded). If
	 * parseBody is true, attempts to parse the body as JSON and return an object.
	 * If parsing fails, returns the original string.
	 * 
	 * @param {boolean} [parseBody=false] If true, parse JSON body into an object
	 * @returns {string|Object|null} The body as a string, parsed object, or null if no cache data
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * 
	 * // Get body as string
	 * const bodyStr = cache.getBody();
	 * console.log(bodyStr); // '{"data":"value"}'
	 * 
	 * // Get body as parsed object
	 * const bodyObj = cache.getBody(true);
	 * console.log(bodyObj.data); // 'value'
	 */
	getBody(parseBody = false) {
		let body = (this.#store !== null) ? this.#store.cache.body : null;
		let bodyToReturn = null;

		try {
			bodyToReturn = (body !== null && parseBody) ? JSON.parse(body) : body;
		} catch (error) {
			tools.DebugAndLog.error(`Cache.getBody() parse error: ${error?.message || 'Unknown error'}`, error?.stack);
			tools.DebugAndLog.debug("Error parsing body", body);
		};

		return (( bodyToReturn !== null) ? bodyToReturn : body );
	};

	/**
	 * Get a plain data response object containing the status code, headers, and body.
	 * This is a simplified response format suitable for internal use.
	 * 
	 * For a full HTTP response suitable for API Gateway, use generateResponseForAPIGateway() instead.
	 * 
	 * @param {boolean} [parseBody=false] If true, parse JSON body into an object
	 * @returns {{statusCode: string, headers: Object, body: string|Object}|null} Response object, or null if no cache data
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * const response = cache.getResponse();
	 * console.log(response.statusCode); // "200"
	 * console.log(response.headers['content-type']);
	 * console.log(response.body);
	 */
	getResponse(parseBody = false) {
		let response = null;

		if (this.#store !== null) {
			response = {
				statusCode: this.getStatusCode(),
				headers: this.getHeaders(),
				body: ( this.getBody(parseBody))
			};
		}

		return response;
	};

	/**
	 * Generate a complete HTTP response suitable for AWS API Gateway. This method
	 * adds standard headers (CORS, Cache-Control, data source), handles conditional
	 * requests (If-None-Match, If-Modified-Since), and formats the response according
	 * to API Gateway requirements.
	 * 
	 * If the client's ETag or Last-Modified matches the cached data, returns a
	 * 304 Not Modified response with no body.
	 * 
	 * @param {Object} parameters Configuration parameters for the response
	 * @param {string} [parameters.ifNoneMatch] The If-None-Match header value from the client request
	 * @param {string} [parameters.ifModifiedSince] The If-Modified-Since header value from the client request
	 * @returns {{statusCode: string, headers: Object, body: string|null}} Complete HTTP response for API Gateway
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * 
	 * const response = cache.generateResponseForAPIGateway({
	 *   ifNoneMatch: event.headers['if-none-match'],
	 *   ifModifiedSince: event.headers['if-modified-since']
	 * });
	 * 
	 * return response; // Return to API Gateway
	 */
	generateResponseForAPIGateway( parameters ) {

		const ifNoneMatch = ( ("ifNoneMatch" in parameters) ? parameters.ifNoneMatch : null);
		const ifModifiedSince = ( ("ifModifiedSince" in parameters) ? parameters.ifModifiedSince : null);

		const response = this.getResponse(false);

		const additionalHeaders = {
            "access-control-allow-origin": "*", // we've already checked referer access, and since this can only list one host it presents issues if it can be used across a set of hosts
            "cache-control": this.getCacheControlHeaderValue(),
            "x-cprxy-data-source": this.getSourceStatus()
        };

        // see if the client sent conditionals to elicit a 304 not modified and respond accordingly
        if ( 
			(ifNoneMatch !== null && "etag" in response.headers && ifNoneMatch === response.headers.etag) 
            || (ifModifiedSince !== null &&  "last-modified" in response.headers && Date.parse(ifModifiedSince) >= Date.parse(response.headers['last-modified']) )
		) {
            // etag and last-modified match, so the client has the most recent copy in it's cache
            response.statusCode = "304"; // return a Not Modified
            response.body = null;
        }

        /*
        Note: The response for an OK (200) status can be empty ("")
        However, if a response code is not allowed to return a body, it is set
        to null to signify that it should not be included in the response and 
        filtered out at this step.
        */

        // set the statusCode if null
        if (response.statusCode === null) { 
			response.statusCode = "200";
		}

		response.headers = Object.assign(response.headers, additionalHeaders);

		return response;

	};

	/**
	 * Get the unique identifier hash for this cache entry. This hash is generated
	 * from the connection, data, and cache policy parameters and uniquely identifies
	 * this specific cache entry.
	 * 
	 * @returns {string} The unique cache identifier hash
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * const idHash = cache.getIdHash();
	 * console.log(`Cache ID: ${idHash}`);
	 */
	getIdHash() {
		return this.#idHash;
	};

	/**
	 * Check if the cache needs to be refreshed. Returns true if the cache is
	 * expired or empty, indicating that fresh data should be fetched from the origin.
	 * 
	 * @returns {boolean} True if cache needs refresh, false otherwise
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * if (cache.needsRefresh()) {
	 *   console.log('Fetching fresh data from origin');
	 *   // Fetch and update cache
	 * }
	 */
	needsRefresh() {
		return (this.isExpired() || this.isEmpty());
	};

	/**
	 * Check if the cached data has expired. Compares the expiration timestamp
	 * with the current time to determine if the cache is still valid.
	 * 
	 * @returns {boolean} True if cache is expired, false if still valid
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * if (cache.isExpired()) {
	 *   console.log('Cache has expired');
	 * }
	 */
	isExpired() {
		return ( CacheData.convertTimestampFromSecondsToMilli(this.getExpires()) <= Date.now());
	};

	/**
	 * Check if the cache is empty (no cached data exists). Returns true if there
	 * is no cached data, indicating this is a cache miss.
	 * 
	 * @returns {boolean} True if cache is empty, false if data exists
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * if (cache.isEmpty()) {
	 *   console.log('Cache miss - no data found');
	 * }
	 */
	isEmpty() {
		return (this.#store.cache.statusCode === null);
	};

	/**
	 * Check if the cache is configured for private (encrypted) storage.
	 * Private caches encrypt data at rest for sensitive content.
	 * 
	 * @returns {boolean} True if cache is private/encrypted, false otherwise
	 * @example
	 * const cache = new Cache(connection, { encrypt: true });
	 * if (cache.isPrivate()) {
	 *   console.log('Cache data is encrypted');
	 * }
	 */
	isPrivate() {
		return this.#encrypt;
	};

	/**
	 * Check if the cache is configured for public (non-encrypted) storage.
	 * Public caches do not encrypt data at rest.
	 * 
	 * @returns {boolean} True if cache is public/non-encrypted, false otherwise
	 * @example
	 * const cache = new Cache(connection, { encrypt: false });
	 * if (cache.isPublic()) {
	 *   console.log('Cache data is not encrypted');
	 * }
	 */
	isPublic() {
		return !this.#encrypt;
	};

	/**
	 * Extend the expiration time of the cached data. This method is used when
	 * the origin returns a 304 Not Modified response or when an error occurs
	 * fetching fresh data.
	 * 
	 * If an error occurred (reason is STATUS_ORIGINAL_ERROR), the cache is extended
	 * by defaultExpirationExtensionOnErrorInSeconds. Otherwise, it's extended by
	 * the specified seconds or the default expiration time.
	 * 
	 * @param {string} reason Reason for extending: Cache.STATUS_ORIGINAL_ERROR or Cache.STATUS_ORIGINAL_NOT_MODIFIED
	 * @param {number} [seconds=0] Number of seconds to extend (0 = use default)
	 * @param {number} [errorCode=0] HTTP error code if extending due to error
	 * @returns {Promise<boolean>} True if extension was successful, false otherwise
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * 
	 * // Extend due to 304 Not Modified
	 * await cache.extendExpires(Cache.STATUS_ORIGINAL_NOT_MODIFIED);
	 * 
	 * // Extend due to error
	 * await cache.extendExpires(Cache.STATUS_ORIGINAL_ERROR, 0, 500);
	 */
	async extendExpires(reason, seconds = 0, errorCode = 0) {

		let returnStatus = false;

		return new Promise(async (resolve) => {

			try {
				
				let cache = this.#store.cache;

				// we will extend based on error extention if in error, we'll look at passed seconds and non-error default later
				if (seconds === 0 && reason === Cache.STATUS_ORIGINAL_ERROR) {
					seconds = this.#defaultExpirationExtensionOnErrorInSeconds;
				}

				// if the cache exists, we'll extend it
				if ( cache !== null ) {
					// statusCode
					let statusCode = (cache.statusCode !== null) ? cache.statusCode : errorCode ; 

					// we are going to create a new expires header, so delete it if it exists so we start from now()
					if (cache.headers !== null && "expires" in cache.headers) { delete cache.headers.expires; }

					// calculate the new expires based on default (seconds === 0) or now() + seconds passed to this function
					let expires = (seconds === 0) ? this.calculateDefaultExpires() : this.#syncedNowTimestampInSeconds + seconds;

					// if a reason was passed, use it only if it is a valid reason for extending. Otherwise null
					let status = (reason === Cache.STATUS_ORIGINAL_ERROR || reason === Cache.STATUS_ORIGINAL_NOT_MODIFIED) ? reason : null;

					// if we received an error, add it in in case we want to evaluate further
					if (errorCode >= 400) { this.#errorCode = errorCode; }

					// perform the update with existing info, but new expires and status
					await this.update( cache.body,  cache.headers, statusCode, expires, status);
				} else {
					tools.DebugAndLog.debug("Cache is null. Nothing to extend.");
				}

				returnStatus = true;

			} catch (error) {
				tools.DebugAndLog.error(`Unable to extend cache: ${error?.message || 'Unknown error'}`, error?.stack);
			} finally {
				resolve(returnStatus);
			};

		});


	};

	/**
	 * Calculate the default expiration timestamp for cached data. If expiration
	 * is configured to use intervals, calculates the next interval boundary.
	 * Otherwise, returns the synced later timestamp (now + default expiration).
	 * 
	 * @returns {number} The default expiration timestamp in seconds
	 * @example
	 * const cache = new Cache(connection, { expirationIsOnInterval: true, defaultExpirationInSeconds: 3600 });
	 * const expires = cache.calculateDefaultExpires();
	 * console.log(`Default expiration: ${new Date(expires * 1000)}`);
	 */
	calculateDefaultExpires() {
		return (this.#expirationIsOnInterval) ? Cache.nextIntervalInSeconds(this.#defaultExpirationInSeconds, this.#syncedNowTimestampInSeconds) : this.#syncedLaterTimestampInSeconds;
	};

	/**
	 * Get the current status of the cache. Returns a status string indicating
	 * the source and state of the cached data.
	 * 
	 * This is an alias for getSourceStatus().
	 * 
	 * @returns {string} The cache status string
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * console.log(`Status: ${cache.getStatus()}`);
	 */
	getStatus() {
		return this.#status;
	};

	/**
	 * Store data in cache. Updates the cache with new content, headers, status code,
	 * and expiration time. This method handles header normalization, expiration
	 * calculation, and writes the data to both DynamoDB and S3 (if needed).
	 * 
	 * The method automatically:
	 * - Lowercases all header keys for consistency
	 * - Retains specified headers from the origin response
	 * - Generates ETag and Last-Modified headers if not present
	 * - Calculates expiration based on origin headers or default settings
	 * - Encrypts data if configured as private
	 * - Routes large items to S3 storage
	 * 
	 * @param {string|Object} body The content body to cache (will be stringified if object)
	 * @param {Object} headers HTTP headers from the origin response
	 * @param {string|number} [statusCode=200] HTTP status code from the origin
	 * @param {number} [expires=0] Expiration Unix timestamp in seconds (0 = calculate default)
	 * @param {string|null} [status=null] Optional status override (e.g., Cache.STATUS_FORCED)
	 * @returns {Promise<CacheDataFormat>} Representation of data stored in cache
	 * @example
	 * const cache = new Cache(connection, cacheProfile);
	 * await cache.read();
	 * 
	 * // Update cache with fresh data
	 * const body = JSON.stringify({ data: 'value' });
	 * const headers = { 'content-type': 'application/json' };
	 * await cache.update(body, headers, 200);
	 * 
	 * console.log(`Cache updated: ${cache.getStatus()}`);
	 */
	async update (body, headers, statusCode = 200, expires = 0, status = null) {

		return new Promise(async (resolve) => {
				
			const prev = {
				eTag: this.getETag(),
				modified: this.getLastModified(),
				expired: this.isExpired(),
				empty: this.isEmpty()
			};

			// lowercase all the header keys so we can evaluate each
			headers = Cache.lowerCaseKeys(headers);

			/* Bring in headers
			We'll keep the etag and last-modified. Also any specified
			*/
			let defaultHeadersToRetain = [
				"content-type",
				"etag",
				"last-modified",
				"ratelimit-limit",
				"ratelimit-remaining",
				"ratelimit-reset",
				"x-ratelimit-limit",
				"x-ratelimit-remaining",
				"x-ratelimit-reset",
				"retry-after"
			];

			// combine the standard headers with the headers specified for endpoint in custom/policies.json
			let ptHeaders = [].concat(this.#headersToRetain, defaultHeadersToRetain);

			// lowercase the headers we are looking for
			let passThrough = ptHeaders.map(element => {
				return element.toLowerCase();
			});

			let headersForCache = {};

			// retain specified headers
			passThrough.forEach(function( key ) {
				if (key in headers) { headersForCache[key] = headers[key]; }
			});

			// we'll set the default expires, in case the expires in header does not work out, or we don't use the header expires
			if ( isNaN(expires) || expires === 0) {
				expires = this.calculateDefaultExpires();
			}
			
			// get the expires and max age (as timestamp)from headers if we don't insist on overriding
			// unlike etag and last-modified, we won't move them over, but let the expires param in .update() do the talking
			if ( !this.#overrideOriginHeaderExpiration && ("expires" in headers || ("cache-control" in headers && headers['cache-control'].includes("max-age") ))) { 

				let age = this.#syncedNowTimestampInSeconds;
				let exp = this.#syncedNowTimestampInSeconds;

				if ("cache-control" in headers && headers['cache-control'].includes("max-age")) {
					// extract max-age
					let cacheControl = headers['cache-control'].split(",");
					for(const p of cacheControl) {
						if(p.trim().startsWith("max-age")) {
							let maxage = parseInt(p.trim().split("=")[1], 10);
							age = this.#syncedNowTimestampInSeconds + maxage; // convert to timestamp
							break; // break out of for
						}
					}
				}

				if ("expires" in headers) {
					exp = Cache.parseToSeconds(headers.expires);
				}

				// we will take the greater of max-age or expires, and if they are not 0 and not past, use it as expTimestamp
				let max = ( exp > age ) ? exp : age;
				if ( max !== 0 && expires > this.#syncedNowTimestampInSeconds) { expires = max; }

			}

			/* Write to Cache
			We are now ready to write to the cache
			*/
			try {
				this.#store = await CacheData.write(this.#idHash, this.#syncedNowTimestampInSeconds, body, headersForCache, this.#hostId, this.#pathId, expires, statusCode, this.#encrypt);

				if (status === null) {
					if (prev.empty) {
						status = Cache.STATUS_NO_CACHE;
					} else if (this.getETag() === prev.eTag || this.getLastModified() === prev.modified) {
						status = Cache.STATUS_CACHE_SAME;
					} else if (prev.expired) {
						status = Cache.STATUS_EXPIRED;
					} else {
						status = Cache.STATUS_FORCED;
					}					
				}

				this.#status = status; 

				tools.DebugAndLog.debug("Cache Updated "+this.getStatus()+": "+this.#idHash);
				
			} catch (error) {
				tools.DebugAndLog.error(`Cannot copy cached data to local store for evaluation: ${this.#idHash} ${error?.message || 'Unknown error'}`, error?.stack);
				if ( this.#store === null ) {
					this.#store = CacheData.format(this.#syncedLaterTimestampInSeconds);
				}
				this.#status = Cache.STATUS_CACHE_ERROR;
			} finally {
				resolve(this.#store);
			}

		});
	};
};

/**
 * The CacheableDataAccess object provides an interface to 
 * the cache. It is responsible for reading from and writing to cache.
 * All requests to data go through the cache
 * 
 * Before using CacheableDataAccess, the Cache must be initialized. 
 * 
 * @example
 * // Init should be done outside the handler
 * Cache.init({parameters});
 * 
 * // Then you can then make a request in the handler
 * // sending it through CacheableDataAccess:
 * const { cache } = require("@63klabs/cache-data");
 * const cacheObj = await cache.CacheableDataAccess.getData(
 *		cacheCfg, 
 *		yourFetchFunction,
 *		conn, 
 *		daoQuery
 *	);
 */
class CacheableDataAccess {
	constructor() { };

	static #prevId = -1;

	/**
	 * Internal method to generate sequential IDs for logging and tracking cache requests.
	 * Each call increments and returns the next ID in the sequence.
	 * 
	 * @private
	 * @returns {string} The next sequential ID as a string
	 * @example
	 * // Called internally by CacheableDataAccess.getData()
	 * const id = CacheableDataAccess.#getNextId(); // "0", "1", "2", etc.
	 */
	static #getNextId() {
		this.#prevId++;
		return ""+this.#prevId;
	};

	/**
	 * Prime (refresh) runtime environment variables and cached secrets. This method
	 * can be called to update values that may have changed since initialization.
	 * 
	 * This is a convenience wrapper around CacheData.prime().
	 * 
	 * @returns {Promise<boolean>} True if priming was successful, false if an error occurred
	 * @example
	 * // Prime before making cache requests
	 * await CacheableDataAccess.prime();
	 * const cache = await CacheableDataAccess.getData(cachePolicy, fetchFn, connection, data);
	 */
	static async prime() {
		return CacheData.prime();
	};

	/**
	 * Data access object that will evaluate the cache and make a request to 
	 * an endpoint to refresh.
	 * 
	 * @param {object} cachePolicy A cache policy object with properties: overrideOriginHeaderExpiration (boolean), defaultExpirationInSeconds (number), expirationIsOnInterval (boolean), headersToRetain (Array|string), hostId (string), pathId (string), encrypt (boolean)
	 * @param {Function} apiCallFunction The function to call in order to make the request. This function can call ANY datasource (file, http endpoint, etc) as long as it returns a DAO object
	 * @param {object} connection A connection object that specifies an id, location, and connection details for the apiCallFunction to access data. If you have a Connection object pass conn.toObject(). Properties: method (string), protocol (string), host (string), path (string), parameters (object), headers (object), body (string, for POST requests), options (object with timeout in ms)
	 * @param {object} [data=null] An object passed to the apiCallFunction as a parameter. Set to null if the apiCallFunction does not require a data param
	 * @param {object} [tags={}] For logging. Do not include sensitive information.
	 * @returns {Promise<Cache>} A Cache object with either cached or fresh data.
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
	 *   options: {timeout: 5000}
	 * };
	 *
	 * const cache = await CacheableDataAccess.getData(
	 *   cachePolicy,
	 *   endpoint.get,
	 *   connection,
	 *   null,
	 *   {path: 'users', id: '123'}
	 * );
	 */
	static async getData(cachePolicy, apiCallFunction, connection, data = null, tags = {} ) {

		return new Promise(async (resolve) => {

			CacheData.prime(); // prime anything we'll need that may have changed since init, we'll await the result before read and write

			/* tags and id have no bearing on the idHash, it is only for human readable logs */
			if ( !("path" in tags) ) { tags.path = [cachePolicy.hostId.replace(/^\/|\/$/g, ''), cachePolicy.pathId.replace(/^\/|\/$/g, '')]; } // we don't want extra / in the glue
			if ( !("id" in tags) ) { tags.id = this.#getNextId(); }
			
			tags.path = Cache.multipartId(tags.path, "/");
			tags.id = Cache.multipartId(tags.id, "/");

			const timer = new tools.Timer(`timerGetCacheableData_${tags.path}::${tags.id}`, true);
			const idToHash = { data: data, connection: connection, cachePolicy: cachePolicy };
			const cache = new Cache(idToHash, cachePolicy);
			const idHash = cache.getIdHash();

			try {
				
				await cache.read();

				if ( cache.needsRefresh() ) {

					tools.DebugAndLog.debug("Cache needs refresh.");

					// add etag and last modified to connection
					if ( !("headers" in connection)) { connection.headers = {}; }
					if ( !("if-none-match" in connection.headers) && cache.getETag() !== null) { 
						connection.headers['if-none-match'] = cache.getETag();
					}
					if (!("if-modified-since" in connection.headers) && cache.getLastModified() !== null) { 
						connection.headers['if-modified-since'] = cache.getLastModified(); 
					}

					// request data from original source
					let originalSource = await apiCallFunction(connection, data);
					
					if ( originalSource.success ) {

						try {
							// check header and status for 304 not modified
							if (originalSource.statusCode === 304) {
                                tools.DebugAndLog.debug("Received 304 Not Modified. Extending cache");
								await cache.extendExpires(Cache.STATUS_ORIGINAL_NOT_MODIFIED, 0, originalSource.statusCode);
							} else {
								let body = ( typeof originalSource.body !== "object" ) ? originalSource.body : JSON.stringify(originalSource.body);
								await CacheData.prime(); // can't proceed until we have the secrets
								await cache.update(body, originalSource.headers, originalSource.statusCode);
							}
							
						} catch (error) {
							tools.DebugAndLog.error(`Not successful in creating cache: ${idHash} (${tags.path}/${tags.id}) ${error?.message || 'Unknown error'}`, error?.stack);
						}

					} else {

						tools.DebugAndLog.error(`${originalSource.statusCode} | Not successful in getting data from original source for cache. Extending cache expires. ${idHash} (${tags.path}/${tags.id})`, originalSource);
						await cache.extendExpires(Cache.STATUS_ORIGINAL_ERROR, 0, originalSource.statusCode);

					}
				}

				timer.stop();
				tools.DebugAndLog.log(`${idHash} | ${tags.path} | ${cache.getStatus()} | ${timer.elapsed()}`, "CACHE");
				resolve(cache);

			} catch (error) {
				timer.stop();
				tools.DebugAndLog.error(`Error while getting data: (${tags.path}/${tags.id}) ${error?.message || 'Unknown error'}`, error?.stack);
				resolve(cache);
			};
		});
	};
};

module.exports = {
	Cache,
	CacheableDataAccess
};