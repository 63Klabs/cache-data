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
 * Basic S3 read/write for cache data. No cache logic,
 * only handles the storage format and retrieval.
 * Logic is handled by CacheData.
 */
class S3Cache {

	static #bucket = null;
	static #objPath = "cache/";

	constructor () {
	};

	/**
	 * 
	 * @returns {string} The bucket name used for cached data
	 */
	static getBucket() {
		return this.#bucket;
	};

	/**
	 * 
	 * @returns {string} The object key (path) for cache objects
	 */
	static getPath() {
		return this.#objPath;
	};

	/**
	 * Initialize the S3 bucket for storing cached data.
	 * @param {string} bucket The bucket name for storing cached data
	 */

	static init(bucket = null) {
		if ( S3Cache.getBucket() === null ) {
			bucket = (bucket === null) ? process.env?.CACHE_DATA_DYNAMO_DB_TABLE || null : bucket;
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
	 * S3Cache information
	 * @returns {{bucket: string, path: string}} The bucket and path (key) used for cached data
	 */
	static info() {
		return {
			bucket: S3Cache.getBucket(),
			path: S3Cache.getPath()
		};
	};

	/**
	 * @param {Buffer|ReadableStream} s3Body
	 * @returns {object} a parsed JSON object
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
	 * Read cache data from S3 for given idHash
	 * @param {string} idHash The id of the cached content to retrieve
	 * @returns {Promise<object>} Cache data
	 */
	static async read (idHash) {

		return new Promise(async (resolve, reject) => {

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
				tools.DebugAndLog.error(`Error getting object from S3 (${objFullLocation}): ${error.message}`, error.stack);
				reject(item);
			}

		});

	};

	/**
	 * Write data to cache in S3
	 * @param {string} idHash ID of data to write
	 * @param {Object} data Data to write to cache
	 * @returns {Promise<boolean>} Whether or not the write was successful
	 */
	static async write (idHash, data) {

		const objKey = `${S3Cache.getPath()}${idHash}.json`;
		const objFullLocation = `${S3Cache.getBucket()}/${objKey}`;
		tools.DebugAndLog.debug(`Putting object to S3: ${objFullLocation}`);

		return new Promise( async (resolve, reject) => {

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
				tools.DebugAndLog.error(`Error putting object to S3. [E2] (${objFullLocation}) ${error.message}`, error.stack);
				reject(false)
			};
		});

	};
};

/**
 * Basic DynamoDb read/write for cache data. No cache logic,
 * only handles the storage format and retrieval.
 * Logic is handled by CacheData.
 */
class DynamoDbCache {

	static #table = null;

	constructor () {
	};

	/**
	 * Initialize the DynamoDb settings for storing cached data
	 * @param {string|null} table The table name to store cached data
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
	 * Information about the DynamoDb table storing cached data
	 * @returns {string} The DynamoDb table name
	 */
	static info() {
		return this.#table;
	};

	/**
	 * Read cache data from DynamoDb for given idHash
	 * @param {string} idHash The id of the cached content to retrieve
	 * @returns {Promise<object>} Cached data
	 */
	static async read (idHash) {

		return new Promise(async (resolve, reject) => {

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

				resolve(result);
			} catch (error) {
				tools.DebugAndLog.error(`Unable to perform DynamoDb query. (${idHash}) ${error.message}`, error.stack);
				reject(result);
			};

		});

	};

	/**
	 * Write data to cache in DynamoDb
	 * @param {object} item JSON object to write to DynamoDb
	 * @returns {Promise<boolean>} Whether or not the write was successful
	 */
	static async write (item) {

		return new Promise( async (resolve, reject) => {

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
				tools.DebugAndLog.error(`Write to DynamoDb failed for id_hash: ${item.id_hash} ${error.message}`, error.stack);
				reject(false)
			};
		});

	};

};

/**
 * Accesses cached data stored in DynamoDb and S3. CacheData is a static 
 * object that manages expiration calculations, accessing and storing data. 
 * This class is used by the publicly exposed class Cache
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
	 * 
	 * @param {Object} parameters
	 * @param {string} parameters.dynamoDbTable
	 * @param {string} parameters.s3Bucket
	 * @param {string} parameters.secureDataAlgorithm
	 * @param {string|Buffer|tools.Secret|tools.CachedSSMParameter|tools.CachedSecret} parameters.secureDataKey
	 * @param {number} parameters.DynamoDbMaxCacheSize_kb
	 * @param {number} parameters.purgeExpiredCacheEntriesAfterXHours
	 * @param {string} parameters.timeZoneForInterval
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
	 * Similar to init, but runs during execution time to refresh environment variables that may have changed since init.
	 * Calling .prime() without an await can help get runtime refreshes started.
	 * You can safely call .prime() again with an await to make sure it has completed just before you need it.
	 * @returns {Promise<boolean>}
	 */
	static async prime() {
		return new Promise(async (resolve, reject) => {
			try {
				let primeTasks = [];

				if (CacheData.getSecureDataKeyType() === 'CachedParameterSecret') {
					primeTasks.push( this.#secureDataKey.prime());
				}

				await Promise.all(primeTasks);

				resolve(true);
			} catch (error) {
				tools.DebugAndLog.error(`CacheData.prime() failed ${error.message}`, error.stack);
				reject(false);
			}
		});
	}

	/**
	 * Used in the init() method, based on the timeZoneForInterval and current
	 * date, set the offset in minutes (offset from UTC taking into account
	 * daylight savings time for that time zone)
	 */
	static _setOffsetInMinutes() {
		this.#offsetInMinutes = ( -1 * moment.tz.zone(this.getTimeZoneForInterval()).utcOffset(Date.now())); // invert by *-1 because of POSIX
	};

	/**
	 * 
	 * @returns {number} The offset in minutes taking into account whether or not daylight savings is in effect AND observed
	 */
	static getOffsetInMinutes() {
		return this.#offsetInMinutes;
	};

	/**
	 * https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
	 * @returns {string} Returns the TZ database name assigned to the time zone
	 */
	static getTimeZoneForInterval() {
		return this.#timeZoneForInterval;
	};

	/**
	 * Get information about the cache settings
	 * @returns {{
	 * 		dynamoDbTable: string, 
	 * 		s3Bucket: string,
	 * 		secureDataAlgorithm: string,
	 * 		secureDataKey: string,
	 * 		DynamoDbMaxCacheSize_kb: number,
	 * 		purgeExpiredCacheEntriesAfterXHours: number,
	 * 		timeZoneForInterval: string,
	 * 		offsetInMinutes: number
	 * }}
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
	 * Format the cache object for returning to main program
	 * @param {number} expires 
	 * @param {Object} body 
	 * @param {Object} headers 
	 * @param {string} statusCode 
	 * @returns {CacheDataFormat} Formatted cache object
	 */
	static format(expires = null, body = null, headers = null, statusCode = null) {
		return { "cache": { body: body, headers: headers, expires: expires, statusCode: statusCode } };
	};

	/**
	 * 
	 * @param {string} idHash 
	 * @param {Object} item 
	 * @param {number} syncedNow 
	 * @param {number} syncedLater 
	 * @returns {Promise<{ body: string, headers: Object, expires: number, statusCode: string }>}
	 */
	static async _process(idHash, item, syncedNow, syncedLater) {
		
		return new Promise(async (resolve, reject) => {

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
							tools.DebugAndLog.error(`Unable to decrypt cache. Ignoring it. (${idHash}) ${error.message}`, error.stack);
						}
					}               
				}

				resolve({ body: body, headers: headers, expires: expires, statusCode: statusCode });
			} catch (error) {
				tools.DebugAndLog.error(`Error getting data from cache. (${idHash}) ${error.message}`, error.stack);
				reject( {body: null, expires: syncedNow, headers: null, statusCode: "500"} );
			}
				
		});
	};

	/**
	 * 
	 * @param {string} idHash 
	 * @param {number} syncedLater 
	 * @returns {Promise<CacheDataFormat>} 
	 */
	static async read(idHash, syncedLater) {

		return new Promise(async (resolve, reject) => {

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

				resolve(cache);
			} catch (error) {
				tools.DebugAndLog.error(`CacheData.read(${idHash}) failed ${error.message}`, error.stack);
				reject(cache);
			};
			
		});
	};

	/**
	 * 
	 * @param {string} idHash ID of data to write
	 * @param {number} syncedNow 
	 * @param {string} body 
	 * @param {Object} headers 
	 * @param {string} host 
	 * @param {string} path 
	 * @param {number} expires 
	 * @param {number} statusCode 
	 * @param {boolean} encrypt 
	 * @returns {CacheDataFormat}
	 */
	static write (idHash, syncedNow, body, headers, host, path, expires, statusCode, encrypt = true) {

		let cacheData = null;
	
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
				S3Cache.write(idHash, JSON.stringify(item) );
				// update the Item we will pass to DynamoDb
				let preview = (typeof item.data.body === "string") ? item.data.body.slice(0,100)+"..." : "[---ENCRYPTED---]";
				item.data.body = "ID: "+idHash+" PREVIEW: "+preview;
				item.data.info.objInS3 = true; 
			}
			
			DynamoDbCache.write(item); // we don't wait for a response 

		} catch (error) {
			tools.DebugAndLog.error(`CacheData.write for ${idHash} FAILED now:${syncedNow} | host:${host} | path:${path} | expires:${expires} | statusCode:${statusCode} | encrypt:${encrypt} failed. ${error.message}`, error.stack);
			cacheData = CacheData.format(0);
		};

		return cacheData;

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
	 * Returns the type of secureDataKey
	 * 
	 * @returns {string} 'buffer', 'string', 'CachedParameterSecret'
	 */
	static getSecureDataKeyType() {
		// look at type of parameters.secureDataKey as it can be a string, Buffer, or object.
		let dataKeyType = typeof this.#secureDataKey;
		if ( Buffer.isBuffer(this.#secureDataKey)) { dataKeyType = 'buffer'; }
		if ( dataKeyType === 'object' && this.#secureDataKey instanceof tools.CachedParameterSecret ) { dataKeyType = 'CachedParameterSecret'; }
		return dataKeyType;
	}

	/**
	 * Obtain the secureDataKey as a Buffer for encryption/decryption.
	 *
	 * @returns {Buffer|null} The Data key as a buffer in the format specified by CacheData.CRYPT_ENCODING
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
			tools.DebugAndLog.error(`CacheData.getSecureDataKey() failed ${error.message}`, error.stack);
		}

		return buff;

	};

	/**
	 * 
	 * @param {string} text Data to encrypt
	 * @returns {string} Encrypted data
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
	 * 
	 * @param {string} data Data to decrypt
	 * @returns {string} Decrypted data
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
	 * Generate an eTag hash
	 * 
	 * This is very basic as there is no specification for doing this.
	 * All an eTag needs to be is a unique hash for a particular request.
	 * We already have a unique ID for the request, so it's not like we
	 * need to make sure the content matches (or does not match) any content
	 * throughout the rest of the world. We are just doing a quick check
	 * at this exact endpoint. So we pair the idHash (this exact endpoint)
	 * with it's content.
	 * @param {string} idHash The id of the endpoint
	 * @param {string} content The string to generate an eTag for
	 * @returns {string} 10 character ETag hash
	 */
	static generateEtag (idHash, content) {
		const hasher = crypto.createHash('sha1');
		hasher.update(idHash+content);
		return hasher.digest('hex').slice(0, 10); // we'll only take 10 characters
		// again, we aren't comparing the hash to the rest of the world
	};

	/**
	 * Generate an internet formatted date such as those used in headers.
	 * 
	 * Example: "Wed, 28 Jul 2021 12:24:11 GMT"
	 * 
	 * The timestamp passed is expected to be in seconds. If it is in
	 * milliseconds then inMilliSeconds parameter needs to be set to
	 * true.
	 * @param {number} timestamp If in milliseconds, inMilliseconds parameter MUST be set to true
	 * @param {boolean} inMilliSeconds Set to true if timestamp passed is in milliseconds. Default is false
	 * @returns {string} An internet formatted date such as Wed, 28 Jul 2021 12:24:11 GMT
	 */
	static generateInternetFormattedDate (timestamp, inMilliSeconds = false) {

		if ( !inMilliSeconds ) {
			timestamp = CacheData.convertTimestampFromSecondsToMilli(timestamp);
		}

		return new Date(timestamp).toUTCString();
	};

	/**
	 * Returns an object with lowercase keys. Note that if after
	 * lowercasing the keys there is a collision one will be
	 * over-written.
	 * Can be used for headers, response, or more.
	 * @param {Object} objectWithKeys 
	 * @returns {Object} Same object but with lowercase keys
	 */
	static lowerCaseKeys (objectWithKeys) {
		let objectWithLowerCaseKeys = {};
		if ( objectWithKeys !== null ) {
			let keys = Object.keys(objectWithKeys); 
			// move each value from objectWithKeys to objectWithLowerCaseKeys
			keys.forEach( function( k ) { 
				objectWithLowerCaseKeys[k.toLowerCase()] = objectWithKeys[k]; 
			});            
		}
		return objectWithLowerCaseKeys;
	}

	/**
	 * Calculate the number of Kilobytes in memory a String takes up.
	 * This function first calculates the number of bytes in the String using
	 * Buffer.byteLength() and then converts it to KB = (bytes / 1024)
	 * @param {string} aString A string to calculate on
	 * @param {string} encode What character encoding should be used? Default is "utf8"
	 * @returns {number} String size in estimated KB
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
	 * If no parameter is passed, Date.now() is used.
	 * @param {number} timestampInMillseconds The timestamp in milliseconds to convert to seconds
	 * @returns {number} The timestamp in seconds
	 */
	static convertTimestampFromMilliToSeconds (timestampInMillseconds = 0) {
		if (timestampInMillseconds === 0) { timestampInMillseconds = Date.now().getTime(); }
		return Math.ceil(timestampInMillseconds / 1000);
	};

	/**
	 * If no parameter is passed, Date.now() is used.
	 * @param {number} timestampInSeconds 
	 * @returns {number} Timestamp in milliseconds
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
 * The Cache object handles reads and writes from the cache. 
 * It also acts as a proxy between the app and CacheData which is a private class.
 * This is the actual data object our application can work with and is returned
 * from CachableDataAccess.
 * 
 * Before using it must be initialized
 * 
 * Cache.init({parameters});
 * 
 * Then you can create new objects:
 * 
 * const cacheObject = new Cache({id}, {parameters});
 */
class Cache {

	static PUBLIC = CacheData.PUBLIC;
	static PRIVATE = CacheData.PRIVATE;

	static CRYPT_ENCODING = CacheData.CRYPT_ENCODING;
	static PLAIN_ENCODING = CacheData.PLAIN_ENCODING;

	static STATUS_NO_CACHE = "original";
	static STATUS_EXPIRED = "original:cache-expired";
	static STATUS_CACHE_SAME = "cache:original-same-as-cache";
	static STATUS_CACHE = "cache";
	static STATUS_CACHE_ERROR = "error:cache"
	static STATUS_ORIGINAL_NOT_MODIFIED = "cache:original-not-modified";
	static STATUS_ORIGINAL_ERROR = "error:original";
	static STATUS_FORCED = "original:cache-update-forced";

	static #idHashAlgorithm = null;
	static #useToolsHash = null; // gets set in Cache.init()

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
		
		// Let CacheData handle the rest of the initialization
		CacheData.init(parameters);
	};

	/**
	 * Returns all the common information such as hash algorithm, s3 bucket, 
	 * dynamo db location, etc.
	 * @returns {{
	 * 		idHashAlgorithm: string,
	 * 		dynamoDbTable: string, 
	 * 		s3Bucket: string,
	 * 		secureDataAlgorithm: string,
	 * 		secureDataKey: string,
	 * 		DynamoDbMaxCacheSize_kb: number,
	 * 		purgeExpiredCacheEntriesAfterXHours: number,
	 * 		timeZoneForInterval: string,
	 * 		offsetInMinutes: number
	 * }}
	 */
	static info() {
		return Object.assign({ idHashAlgorithm: this.#idHashAlgorithm }, CacheData.info()); // merge into 1 object and return
	};

	/**
	 * 
	 * @returns {object} Test data of nextIntervalInSeconds method
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
	 * When testing a variable as a boolean, 0, false, and null are false,
	 * but the string "false" is true. Since we can be dealing with JSON data,
	 * query parameters, and strings coded as "false" we want to include the
	 * string "false" as false.
	 * This function only adds "false" to the list of values already considered
	 * false by JavaScript
	 * @param {*} value A value you want to turn to boolean
	 * @returns {boolean} Does the value equal false according to JavaScript evaluation rules?
	 */
	static bool (value) {

		if ( typeof value === 'string') { value = value.toLowerCase(); }

		// Boolean("false") is true so we need to code for it. As long as it is not "false", trust Boolean()
		return  (( value !== "false") ? Boolean(value) : false ); 
	};
	
	/**
	 * Generate an etag based on an id and content body
	 * @param {string} idHash Hashed content identifier. For web pages this a hash of host, path, query, etc.
	 * @param {string} content Content. usually body and static headers
	 * @returns {string} An etag specific to that content and id
	 */
	static generateEtag(idHash, content) {
		return CacheData.generateEtag(idHash, content);
	};

	/**
	 * To make submitted key comparison easier against a standard set of keys,
	 * lowercase keys in the object.
	 * @param {object} objectWithKeys Object we want to lowercase keys on
	 * @returns {object} Object with lowercase keys
	 */
	static lowerCaseKeys(objectWithKeys) {
		return CacheData.lowerCaseKeys(objectWithKeys);
	};

	/**
	 * Generate an internet formatted date such as those used in headers.
	 * 
	 * Example: "Wed, 28 Jul 2021 12:24:11 GMT"
	 * 
	 * @param {number} timestamp Unix timestamp in seconds or milliseconds. 
	 * @param {boolean} inMilliseconds Set to true if timestamp is in milliseconds. Default is false.
	 * @returns {string} Formatted date/time such as Wed, 28 Jul 2021 12:24:11 GMT
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
	 */
	static multipartId (identifierArrayOrString, glue = "-") {
		let id = null;
		if ( Array.isArray(identifierArrayOrString) || typeof identifierArrayOrString === 'string') {
			id = ( Array.isArray(identifierArrayOrString) ) ? identifierArrayOrString.join(glue) : identifierArrayOrString;
		}
		return id;
	};

	/**
	 * Uses Date.parse() but returns seconds instead of milliseconds.
	 * Takes a date string (such as "2011-10-10T14:48:00") and returns the number of seconds since January 1, 1970, 00:00:00 UTC
	 * @param {string} date 
	 * @returns {number} The date in seconds since January 1, 1970, 00:00:00 UTC
	*/
	static parseToSeconds(date) {
		let timestampInSeconds = 0;
		try {
			timestampInSeconds = CacheData.convertTimestampFromMilliToSeconds( Date.parse(date) );
		} catch (error) {
			tools.DebugAndLog.error(`Cannot parse date/time: ${date} ${error.message}`, error.stack);
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
	 */
	static nextIntervalInSeconds(intervalInSeconds, timestampInSeconds = 0) {
		return CacheData.nextIntervalInSeconds(intervalInSeconds, timestampInSeconds);
	};


	/**
	 * Calculate the number of Kilobytes in memory a String takes up.
	 * This function first calculates the number of bytes in the String using
	 * Buffer.byteLength() and then converts it to KB = (bytes / 1024)
	 * @param {string} aString A string to calculate on
	 * @param {string} encode What character encoding should be used? Default is "utf8"
	 * @returns String size in estimated KB
	 */
	static calculateKBytes ( aString, encode = CacheData.PLAIN_ENCODING ) {
		return CacheData.calculateKBytes( aString, encode);
	};

	/**
	 * Converts a comma delimited string or an array to an array with all
	 * lowercase values. Can be used to pass a comma delimited string
	 * for conversion to an array that will then be used as (lowercase) keys.
	 * @param {string|Array} list 
	 * @returns Array with lowercase values
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
	 * Takes either a csv string or an Array. It will return an array
	 * with lowercase values to be used as header keys
	 * @param {string|Array} list 
	 * @returns Array with lowercase values
	 */
	#parseHeadersToRetain (list) {
		return Cache.convertToLowerCaseArray(list);
	};

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
	 * 
	 * @returns {Promise<CacheDataFormat>}
	 */
	async read () {

		return new Promise(async (resolve, reject) => {

			if ( this.#store !== null ) {
				resolve(this.#store);
			} else {
				try {
					this.#store = await CacheData.read(this.#idHash, this.#syncedLaterTimestampInSeconds);
					this.#status = ( this.#store.cache.statusCode === null ) ? Cache.STATUS_NO_CACHE : Cache.STATUS_CACHE;

					tools.DebugAndLog.debug(`Cache Read status: ${this.#status}`);

					resolve(this.#store);
				} catch (error) {
					this.#store = CacheData.format(this.#syncedLaterTimestampInSeconds);
					this.#status = Cache.STATUS_CACHE_ERROR;

					tools.DebugAndLog.error(`Cache Read: Cannot read cached data for ${this.#idHash}: ${error.message}`, error.stack);

					reject(this.#store);
				};
			}

		});

	};

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
	 * 
	 * @returns {CacheDataFormat}
	 */
	get() {
		return this.#store;
	};

	/**
	 * 
	 * @returns {string}
	 */
	getSourceStatus() {
		return this.#status;
	};

	/**
	 * 
	 * @returns {string}
	 */
	getETag() {
		return this.getHeader("etag");
	};

	/**
	 * 
	 * @returns {string} The falue of the cached header field last-modified
	 */
	getLastModified() {
		return this.getHeader("last-modified");
	};

	/**
	 * 
	 * @returns {number} Expiration timestamp in seconds
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
	 */
	getExpiresGMT() {
		return this.getHeader("expires");
	};

	/**
	 * 
	 * @returns {number} The calculated number of seconds from now until expires
	 */
	calculateSecondsLeftUntilExpires() {
		let secondsLeftUntilExpires = this.getExpires() - CacheData.convertTimestampFromMilliToSeconds( Date.now() );
		if (secondsLeftUntilExpires < 0) { secondsLeftUntilExpires = 0; }

		return secondsLeftUntilExpires;
	};

	/**
	 * Example: public, max-age=123456
	 * @returns {string} The value for cache-control header
	 */
	getCacheControlHeaderValue() {
		return this.getClassification() +", max-age="+this.calculateSecondsLeftUntilExpires();
	};

	/**
	 * 
	 * @returns {object|null} All the header key/value pairs for the cached object
	 */
	getHeaders() {
		return (this.#store !== null && "headers" in this.#store.cache) ? this.#store.cache.headers : null;
	};

	/**
	 * 
	 * @returns {string|null} The status code of the cache object
	 */
	getStatusCode() {
		return (this.#store !== null && "statusCode" in this.#store.cache) ? this.#store.cache.statusCode : null;
	};

	/**
	 * 
	 * @returns {number} Current error code for this cache
	 */
	getErrorCode() {
		return this.#errorCode;
	};

	/**
	 * Classification is used in the cache header to note how the data returned
	 * should be treated in the cache. If it is private then it should be 
	 * protected.
	 * @returns {string} Based on whether the cache is stored as encrypted, returns "private" (encrypted) or "public" (not encrypted)
	 */
	getClassification() {
		return (this.#encrypt ? Cache.PRIVATE : Cache.PUBLIC );
	};

	/**
	 * 
	 * @returns {number} The timestamp in seconds of when the object was created and used for currency logic of the cache. (used as comparasion against expiration and for creating new expirations)
	 */
	getSyncedNowTimestampInSeconds() {
		return this.#syncedNowTimestampInSeconds;
	};

	/**
	 * 
	 * @param {string} key The header key to access
	 * @returns {string|number|null} The value assigned to the provided header key. null if it doesn't exist
	 */
	getHeader(key) {
		let headers = this.getHeaders();
		return ( headers !== null && key in headers) ? headers[key] : null
	};

	/**
	 * 
	 * @param {boolean} parseBody If set to true then JSON decode will be used on the body before returning.
	 * @returns {string|object|null} A string (as is) which could be encoded JSON but we want to leave it that way, an object if parseBody is set to true and it is parsable by JSON, or null if body is null
	 */
	getBody(parseBody = false) {
		let body = (this.#store !== null) ? this.#store.cache.body : null;
		let bodyToReturn = null;

		try {
			bodyToReturn = (body !== null && parseBody) ? JSON.parse(body) : body;
		} catch (error) {
			tools.DebugAndLog.error(`Cache.getBody() parse error: ${error.message}`, error.stack);
			tools.DebugAndLog.debug("Error parsing body", body);
		};

		return (( bodyToReturn !== null) ? bodyToReturn : body );
	};

	/**
	 * Returns a plain data response in the form of an object. If a full HTTP
	 * response is needed use generateResponseForAPIGateway()
	 * @param {boolean} parseBody If true we'll return body as object
	 * @returns {{statusCode: string, headers: object, body: string|object}} a plain data response in the form of an object
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
	 * 
	 * @param {object} parameters
	 * @returns {{statusCode: string, headers: object, body: string}}
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
	 * 
	 * @returns {string}
	 */
	getIdHash() {
		return this.#idHash;
	};

	/**
	 * 
	 * @returns {boolean}
	 */
	needsRefresh() {
		return (this.isExpired() || this.isEmpty());
	};

	/**
	 * 
	 * @returns {boolean}
	 */
	isExpired() {
		return ( CacheData.convertTimestampFromSecondsToMilli(this.getExpires()) <= Date.now());
	};

	/**
	 * 
	 * @returns {boolean}
	 */
	isEmpty() {
		return (this.#store.cache.statusCode === null);
	};

	/**
	 * 
	 * @returns {boolean}
	 */
	isPrivate() {
		return this.#encrypt;
	};

	/**
	 * 
	 * @returns {boolean}
	 */
	isPublic() {
		return !this.#encrypt;
	};

	/**
	 * 
	 * @param {string} reason Reason for extending, either Cache.STATUS_ORIGINAL_ERROR or Cache.STATUS_ORIGINAL_NOT_MODIFIED
	 * @param {number} seconds 
	 * @param {number} errorCode
	 */
	extendExpires(reason, seconds = 0, errorCode = 0) {

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
				this.update( cache.body,  cache.headers, statusCode, expires, status);
			} else {
				tools.DebugAndLog.debug("Cache is null. Nothing to extend.");
			}

		} catch (error) {
			tools.DebugAndLog.error(`Unable to extend cache: ${error.message}`, error.stack);
		};

	};

	/**
	 * 
	 * @returns {number}
	 */
	calculateDefaultExpires() {
		return (this.#expirationIsOnInterval) ? Cache.nextIntervalInSeconds(this.#defaultExpirationInSeconds, this.#syncedNowTimestampInSeconds) : this.#syncedLaterTimestampInSeconds;
	};

	/**
	 * 
	 * @returns {string}
	 */
	getStatus() {
		return this.#status;
	};

	/**
	 * Store data in cache. Returns a representation of data stored in the cache
	 * @param {object} body 
	 * @param {object} headers Any headers you want to pass along, including last-modified, etag, and expires. Note that if expires is included as a header here, then it will override the expires paramter passed to .update()
	 * @param {number} statusCode Status code of original request
	 * @param {number} expires Expiration unix timestamp in seconds
	 * @returns {CacheDataFormat} Representation of data stored in cache
	 */
	update (body, headers, statusCode = 200, expires = 0, status = null) {

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
			this.#store = CacheData.write(this.#idHash, this.#syncedNowTimestampInSeconds, body, headersForCache, this.#hostId, this.#pathId, expires, statusCode, this.#encrypt);

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
			tools.DebugAndLog.error(`Cannot copy cached data to local store for evaluation: ${this.#idHash} ${error.message}`, error.stack);
			if ( this.#store === null ) {
				this.#store = CacheData.format(this.#syncedLaterTimestampInSeconds);
			}
			this.#status = Cache.STATUS_CACHE_ERROR;
		};

		return this.#store;
			
	};

};

class CacheableDataAccess {
	constructor() { };

	static #prevId = -1;

	static #getNextId() {
		this.#prevId++;
		return ""+this.#prevId;
	};

	static async prime() {
		return CacheData.prime();
	};

	/**
	 * Data access object that will evaluate the cache and make a request to 
	 * an endpoint to refresh.
	 * 
	 * @example
	 * cachePolicy = {
	 *		overrideOriginHeaderExpiration: true, 
	 *		defaultExpirationInSeconds: 60,
	 *		expirationIsOnInterval: true,
	 *		headersToRetain: [],
	 *		host: vars.policy.host,
	 *		path: vars.policy.endpoint.path,
	 *		encrypt: true
	 *	}
	 *
	 *	connection = {
	 *		method: vars.method,
	 *		protocol: vars.protocol,
	 *		host: vars.host,
	 *		path: vars.path,
	 *		parameters: vars.parameters,
	 *		headers: vars.requestHeaders,
	 *      options: {timeout: vars.timeout}
	 *	}
	 *
	 * @param {object} cachePolicy A cache policy object.
	 * @param {boolean} cachePolicy.overrideOriginHeaderExpiration
	 * @param {number} cachePolicy.defaultExpirationInSeconds
	 * @param {boolean} cachePolicy.expirationIsOnInterval
	 * @param {Array|string} cachePolicy.headersToRetain
	 * @param {string} cachePolicy.hostId
	 * @param {string} cachePolicy.pathId
	 * @param {boolean} cachePolicy.encrypt
	 * @param {object} apiCallFunction The function to call in order to make the request. This function can call ANY datasource (file, http endpoint, etc) as long as it returns a DAO object
	 * @param {object} connection A connection object that specifies an id, location, and connectin details for the apiCallFunction to access data. If you have a Connection object pass conn.toObject()
	 * @param {string} connection.method
	 * @param {string} connection.protocol
	 * @param {string} connection.host
	 * @param {string} connection.path
	 * @param {object} connection.parameters
	 * @param {object} connection.headers
	 * @param {string} connection.body For POST requests a body with data may be sent.
	 * @param {object} connection.options
	 * @param {number} connection.options.timeout Number in ms for request to time out
	 * @param {object} data An object passed to the apiCallFunction as a parameter. Set to null if the apiCallFunction does not require a data param
	 * @param {object} tags For logging. Do not include sensitive information.
	 * @returns {Promise<Cache>} A Cache object with either cached or fresh data.
	 */
	static async getData(cachePolicy, apiCallFunction, connection, data = null, tags = {} ) {

		return new Promise(async (resolve, reject) => {

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
								cache.extendExpires(Cache.STATUS_ORIGINAL_NOT_MODIFIED, 0, originalSource.statusCode);
							} else {
								let body = ( typeof originalSource.body !== "object" ) ? originalSource.body : JSON.stringify(originalSource.body);
								await CacheData.prime(); // can't proceed until we have the secrets
								cache.update(body, originalSource.headers, originalSource.statusCode);
							}
							
						} catch (error) {
							tools.DebugAndLog.error(`Not successful in creating cache: ${idHash} (${tags.path}/${tags.id}) ${error.message}`, error.stack);
						}

					} else {

						tools.DebugAndLog.error(`${originalSource.statusCode} | Not successful in getting data from original source for cache. Extending cache expires. ${idHash} (${tags.path}/${tags.id})`, originalSource);
						cache.extendExpires(Cache.STATUS_ORIGINAL_ERROR, 0, originalSource.statusCode);

					}
				}

				timer.stop();
				tools.DebugAndLog.log(`${idHash} | ${tags.path} | ${cache.getStatus()} | ${timer.elapsed()}`, "CACHE");
				resolve(cache);

			} catch (error) {
				timer.stop();
				tools.DebugAndLog.error(`Error while getting data: (${tags.path}/${tags.id}) ${error.message}`, error.stack);
				reject(cache);
			};
		});
	};
};

module.exports = {
	Cache,
	CacheableDataAccess
};