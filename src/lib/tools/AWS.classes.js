/**
 * Can a value be considered true?
 * "true", "1", 1, and true are all true
 * @param {boolean|number|string|null|undefined} value 
 * @returns {boolean} Whether or not the value could be considered true
 */
const isTrue = (value) => {
	return (value !== null && typeof value !== 'undefined' && 
		(value === true || value === 1 || value === "1" || 
		(typeof value === 'string' && value.toLowerCase() === "true")));
};

/**
 * Should we enable X-Ray?
 * Checks for either CacheData_AWSXRayOn or CACHE_DATA_AWS_X_RAY_ON in process.env
 * @returns {boolean} True if X-Ray is enabled
 */
const USE_XRAY = isTrue(process.env?.CacheData_AWSXRayOn) || isTrue(process.env?.CACHE_DATA_AWS_X_RAY_ON);

/**
 * X-Ray object if it is enabled
 * @returns {object|null} The AWSXRay object if enabled and initialized, null otherwise
 */
let AWSXRay = null;

/**
 * Whether or not X-Ray is initialized
 * @private
 * @returns {object|null} The AWSXRay object if enabled and initialized, null otherwise
 */
let xrayInitialized = false;

const initializeXRay = () => {
	if (!xrayInitialized && USE_XRAY) {
		try {
			AWSXRay = require("aws-xray-sdk-core");
			const captureOptions = {
				captureRequestInit: true,
				captureResponse: true,
				generateUniqueId: true
			};
			AWSXRay.captureHTTPsGlobal(require('http'), captureOptions);
			AWSXRay.captureHTTPsGlobal(require("https"), captureOptions);
		} catch (error) {
			AWSXRay = null;
		}
		xrayInitialized = true;
	}
	return AWSXRay;
};

/* =============================================================================
 * TracingProvider Integration
 * -------------------------------------------------------------------------- */

/**
 * Get the active TracingProvider from PowertoolsInit if available.
 * Returns null if PowertoolsInit has not been initialized yet or is not available.
 * This allows AWS.classes.js to use the TracingProvider when it's ready,
 * while falling back to direct AWSXRay usage during early module load.
 * 
 * @private
 * @returns {Object|null} The active TracingProvider instance, or null
 */
function getTracingProvider() {
	try {
		const { getActiveTracingProvider } = require("./PowertoolsInit");
		return getActiveTracingProvider();
	} catch {
		// PowertoolsInit not available - fall back to existing behavior
		return null;
	}
}

/**
 * Instrument an AWS SDK v3 client using the active TracingProvider or direct AWSXRay.
 * 
 * Precedence:
 * 1. If a TracingProvider is available from PowertoolsInit, use provider.instrumentClient()
 * 2. If AWSXRay is initialized (USE_XRAY is true), use AWSXRay.captureAWSv3Client() directly
 * 3. Otherwise, return the client uninstrumented
 * 
 * @private
 * @param {Object} client - AWS SDK v3 client instance to instrument
 * @returns {Object} Instrumented client, or original client if no tracing is active
 */
function instrumentClient(client) {
	// Check for TracingProvider first (Powertools takes precedence)
	const provider = getTracingProvider();
	if (provider) {
		return provider.instrumentClient(client);
	}

	// Fall back to direct AWSXRay usage (existing behavior)
	if (initializeXRay() !== null) {
		try {
			return AWSXRay.captureAWSv3Client(client);
		} catch (error) {
			return client;
		}
	}

	return client;
}

/**
 * Capture HTTP/HTTPS using the active TracingProvider or direct AWSXRay.
 * 
 * Precedence:
 * 1. If a TracingProvider is available from PowertoolsInit, use provider.captureHttp()
 * 2. If AWSXRay is initialized (USE_XRAY is true), use AWSXRay.captureHTTPsGlobal() directly
 * 3. Otherwise, do nothing
 * 
 * Note: This is called during initializeXRay() for backwards compatibility.
 * When PowertoolsInit is active, it handles HTTP capture via the TracingProvider.
 * 
 * @private
 */
function captureHttp() {
	const provider = getTracingProvider();
	if (provider) {
		provider.captureHttp();
		return;
	}

	// Direct AWSXRay capture is handled in initializeXRay() for backwards compatibility
}

/**
 * AWS Helper Functions - Functions to perform common get and put operations for DynamoDB, S3, and SSM parameter store.
 * Uses AWS SDK v3. Each service's SDK package is loaded, and its client constructed, the first time
 * its accessor (AWS.dynamo, AWS.s3, AWS.ssm, or AWS.secrets) is read. Later reads reuse the same client.
 * 
 * @example
 * console.log(AWS.REGION); // outputs the region set in Node environment: process.env.AWS_REGION
 * 
 * @example
 * const result = await AWS.dynamo.get(params);
 * const response = await AWS.dynamo.put(params);
 * AWS.dynamo.client; // access the DynamoDb Document client directly
 * AWS.dynamo.sdk; // access the DynamoDB SDK classes { DynamoDBClient, DynamoDBDocumentClient, GetCommand, PutCommand }
 * const item = await AWS.dynamo.client.send(new AWS.dynamo.sdk.GetCommand(params));
 * 
 * @example
 * result = await AWS.s3.get(params);
 * response = await AWS.s3.put(params);
 * AWS.s3.client; // access the S3 client directly
 * 
 * @example
 * ssmParams1 = await AWS.ssm.getByName(query);
 * ssmParams2 = await AWS.ssm.getByPath(query);
 * AWS.ssm.client; // access the SSM Client
 * AWS.ssm.sdk; // access the SSM SDK classes { SSMClient, GetParametersByPathCommand, GetParametersCommand }
 * 
 * @class AWS
 * @property {string} NODE_VER
 * @property {number} NODE_VER_MAJOR
 * @property {number} NODE_VER_MINOR
 * @property {number} NODE_VER_PATCH
 * @property {string} NODE_VER_MAJOR_MINOR
 * @property {string} SDK_VER 'V2' or 'V3'
 * @property {boolean} SDK_V2 true if using AWS SDK v2
 * @property {boolean} SDK_V3 true if using AWS SDK v3
 * @property {string} REGION AWS region grabbed from Node process.env.AWS_REGION. If not set uses 'us-east-1'
 * @property {object} dynamo
 * @property {object} dynamo.client DynamoDB document client (DynamoDBDocumentClient)
 * @property {object} dynamo.sdk { DynamoDBClient, DynamoDBDocumentClient, GetCommand, PutCommand }
 * @property {object} dynamo.put function(params) Given a DynamoDb param object, sends a PutCommand through dynamo.client
 * @property {object} dynamo.get function(params) Given a DynamoDb param object, sends a GetCommand through dynamo.client
 * @property {object} dynamo.scan function(params) Given a DynamoDb param object, sends a ScanCommand through dynamo.client
 * @property {object} dynamo.delete function(params) Given a DynamoDb param object, sends a DeleteCommand through dynamo.client
 * @property {object} dynamo.update function(params) Given a DynamoDb param object, sends an UpdateCommand through dynamo.client
 * @property {object} s3
 * @property {object} s3.client S3 client (an instance of the aggregated S3 class)
 * @property {object} s3.sdk { S3, GetObjectCommand, PutObjectCommand }
 * @property {object} s3.put function(params) Given an S3 param object, sends a PutObjectCommand through s3.client
 * @property {object} s3.get function(params) Given an S3 param object, sends a GetObjectCommand through s3.client
 * @property {object} ssm
 * @property {object} ssm.client SSM client (SSMClient)
 * @property {object} ssm.sdk { SSMClient, GetParametersByPathCommand, GetParametersCommand }
 * @property {object} ssm.getByName function(query) Given SSM Parameter Store query, sends a GetParametersCommand through ssm.client
 * @property {object} ssm.getByPath function(query) Given SSM Parameter Store query, sends a GetParametersByPathCommand through ssm.client
 * @property {object} secrets
 * @property {boolean} secrets.available true when the Secrets Manager SDK was loaded successfully
 * @property {string|null} secrets.reason null when available; the error message when unavailable
 * @property {object|null} secrets.client SecretsManagerClient instance or null when unavailable
 * @property {object|null} secrets.sdk { SecretsManagerClient, GetSecretValueCommand } or null when unavailable
 * @property {function} secrets.get function(params) Sends a GetSecretValueCommand using the secrets client
 * @property {object|null} XRay The AWS X-Ray SDK when X-Ray is enabled; otherwise null
 */
class AWS {

	static #nodeVer = [];
	static #aws_region = null;

	/**
	 * Memoized DynamoDB SDK: { client, put, get, scan, delete, update, sdk }.
	 * Null until the first successful construction.
	 * @private
	 */
	static #dynamoSdk = null;

	/**
	 * Memoized S3 SDK: { client, put, get, sdk }.
	 * Null until the first successful construction.
	 * @private
	 */
	static #s3Sdk = null;

	/**
	 * Memoized SSM SDK: { client, getByName, getByPath, sdk }.
	 * Null until the first successful construction.
	 * @private
	 */
	static #ssmSdk = null;

	/**
	 * Memoized Secrets Manager SDK. Null until first access.
	 * { client, sdk } on success; { client: null, sdk: null, error } when unavailable.
	 * @private
	 */
	static #secretsSdk = null;

	/**
	 * @private
	 * @returns {boolean} True if X-Ray is enabled and initialized
	 */
	static get #XRayOn() {
		return initializeXRay() !== null;
	}

	constructor() {}

	/**
	 * @returns {number[]} Node version in array [major, minor, patch]
	 */
	static get nodeVersionArray() {
		if (this.#nodeVer.length === 0) {
			// split this.NODE_VER into an array of integers
			this.#nodeVer = this.NODE_VER.split(".").map( (x) => parseInt(x, 10) );
		}
		return this.#nodeVer;
	};

	/**
	 * Returns the AWS Region from process.env.AWS_REGION.
	 * If not set, it will return 'us-east-1' and issue a warning.
	 *
	 * @returns {string} AWS Region
	 */
	static get region() {
		if (this.#aws_region === null) {

			const hasRegion = (
				"AWS_REGION" in process.env 
				&& typeof process.env.AWS_REGION !== 'undefined' 
				&& process.env.AWS_REGION !== null 
				&& process.env.AWS_REGION !== ""
			);

			if (!hasRegion) {
				console.warn("AWS_REGION is NOT set in Lambda Node environment variables. Trying 'us-east-1'. To prevent unexpected results, please create and set the 'AWS_REGION' in your Lambda environment variables.");
			}

			this.#aws_region = ( hasRegion ? process.env.AWS_REGION : "us-east-1" );
		}

		return this.#aws_region;
	}

	/**
	 * @returns {string} Node.js version ex: '24.12.0'
	 */
	static get NODE_VER() { return ( ("versions" in process && "node" in process.versions) ? process.versions.node : "0.0.0"); }
	
	/**
	 * @returns {number} Node.js major version ex: 24
	 */
	static get NODE_VER_MAJOR() { return ( this.nodeVersionArray[0] ); }

	/**
	 * @returns {number} Node.js minor version ex: 12
	 */
	static get NODE_VER_MINOR() { return ( this.nodeVersionArray[1] ); }

	/**
	 * @returns {number} Node.js patch version ex: 0
	 */
	static get NODE_VER_PATCH() { return ( this.nodeVersionArray[2] ); }

	/**
	 * @returns {string} Node.js major.minor version ex: '24.12'
	 */
	static get NODE_VER_MAJOR_MINOR() { return (this.nodeVersionArray[0] + "." + this.nodeVersionArray[1]); }
	
	/**
	 * @returns {number[]} Node.js version array [major, minor, patch]
	 */
	static get NODE_VER_ARRAY() { return (this.nodeVersionArray); }

	/**
	 * @returns {'V2'|'V3'} AWS SDK Version being used based on Node.js version. V2 for Node.js < 18, V3 for Node.js >= 18
	 */
	static get SDK_VER() { return ((this.NODE_VER_MAJOR < 18) ? "V2" : "V3"); }

	/**
	 * @returns {string} AWS Region
	 */
	static get REGION() { return ( this.region ); }

	/**
	 * @returns {boolean} True if using AWS SDK v2
	 */
	static get SDK_V2() { return (this.SDK_VER === "V2"); }

	/**
	 * @returns {boolean} True if using AWS SDK v3
	 */
	static get SDK_V3() { return (this.SDK_VER === "V3"); }

	/**
	 * @returns {object} Information about the current Node.js and AWS environment
	 */
	static get INFO() { 
		return ( {
			NODE_VER: this.NODE_VER,
			NODE_VER_MAJOR: this.NODE_VER_MAJOR,
			NODE_VER_MINOR: this.NODE_VER_MINOR,
			NODE_VER_PATCH: this.NODE_VER_PATCH,
			NODE_VER_MAJOR_MINOR: this.NODE_VER_MAJOR_MINOR,
			NODE_VER_ARRAY: this.NODE_VER_ARRAY,
			SDK_VER: this.SDK_VER,
			REGION: this.REGION,
			SDK_V2: this.SDK_V2,
			SDK_V3: this.SDK_V3,
			AWSXRayOn: USE_XRAY
		});
	}

	/**
	 * Throw the SDK v2 guard error when the runtime would select AWS SDK v2.
	 * Each converted builder calls this before requiring any SDK package.
	 *
	 * @private
	 * @returns {void}
	 * @throws {Error} When AWS.SDK_V3 is false
	 */
	static #assertSdkV3() {
		if (!AWS.SDK_V3) {
			throw new Error("AWS SDK v2 is no longer supported. Please upgrade to Node.js 18 or higher to use AWS SDK v3.");
		}
	}

	/**
	 * Require the DynamoDB SDK packages and build the memo that AWS.dynamo returns.
	 * The dynamo getter calls this on its first read, and again on a later read if an
	 * earlier build threw.
	 *
	 * @private
	 * @returns {{client: object, put: Function, get: Function, scan: Function, delete: Function, update: Function, sdk: object}} The DynamoDB memo
	 * @throws {Error} The SDK v2 guard error, when AWS.SDK_V3 is false
	 * @throws {Error} The require() error, with code MODULE_NOT_FOUND, when a DynamoDB SDK package cannot be loaded
	 */
	static #buildDynamo() {
		AWS.#assertSdkV3();
		const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
		const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
		const client = DynamoDBDocumentClient.from(
			instrumentClient(new DynamoDBClient({ region: AWS.REGION }))
		);
		return {
			client,
			put: (params) => client.send(new PutCommand(params)),
			get: (params) => client.send(new GetCommand(params)),
			scan: (params) => client.send(new ScanCommand(params)),
			delete: (params) => client.send(new DeleteCommand(params)),
			update: (params) => client.send(new UpdateCommand(params)),
			sdk: { DynamoDBClient, DynamoDBDocumentClient, GetCommand, PutCommand }
		};
	}

	/**
	 * Require the S3 SDK package and build the memo that AWS.s3 returns.
	 * The s3 getter calls this on its first read, and again on a later read if an
	 * earlier build threw.
	 *
	 * @private
	 * @returns {{client: object, put: Function, get: Function, sdk: object}} The S3 memo
	 * @throws {Error} The SDK v2 guard error, when AWS.SDK_V3 is false
	 * @throws {Error} The require() error, with code MODULE_NOT_FOUND, when @aws-sdk/client-s3 cannot be loaded
	 */
	static #buildS3() {
		AWS.#assertSdkV3();
		const { S3, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
		const client = instrumentClient(new S3({ region: AWS.REGION }));
		return {
			client,
			put: (params) => client.send(new PutObjectCommand(params)),
			get: (params) => client.send(new GetObjectCommand(params)),
			sdk: { S3, GetObjectCommand, PutObjectCommand }
		};
	}

	/**
	 * Require the SSM SDK package and build the memo that AWS.ssm returns.
	 * The ssm getter calls this on its first read, and again on a later read if an
	 * earlier build threw.
	 *
	 * @private
	 * @returns {{client: object, getByName: Function, getByPath: Function, sdk: object}} The SSM memo
	 * @throws {Error} The SDK v2 guard error, when AWS.SDK_V3 is false
	 * @throws {Error} The require() error, with code MODULE_NOT_FOUND, when @aws-sdk/client-ssm cannot be loaded
	 */
	static #buildSsm() {
		AWS.#assertSdkV3();
		const { SSMClient, GetParametersByPathCommand, GetParametersCommand } = require("@aws-sdk/client-ssm");
		const client = instrumentClient(new SSMClient({ region: AWS.REGION }));
		return {
			client,
			getByName: (query) => client.send(new GetParametersCommand(query)),
			getByPath: (query) => client.send(new GetParametersByPathCommand(query)),
			sdk: { SSMClient, GetParametersByPathCommand, GetParametersCommand }
		};
	}

	/**
	 * Provides a DynamoDB document client and helper functions.
	 *
	 * The first read requires `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` and
	 * constructs the client in `AWS.REGION`. Later reads reuse the same client, helper
	 * functions, and `sdk` object. Each read returns a new object.
	 *
	 * @returns {{
	 *   client: object,
	 *   put: {(params:Object) => Promise<any>},
	 *   get: {(params:Object) => Promise<any>},
	 *   scan: {(params:Object) => Promise<any>},
	 *   delete: {(params:Object) => Promise<any>},
	 *   update: {(params:Object) => Promise<any>},
	 *   sdk: {
	 *     DynamoDBClient: object,
	 *     DynamoDBDocumentClient: object,
	 *     GetCommand: object,
	 *     PutCommand: object
	 *   }
	 * }} The DynamoDB document client; helper functions that send a PutCommand, GetCommand,
	 *   ScanCommand, DeleteCommand, or UpdateCommand through it; and SDK classes
	 * @throws {Error} When AWS.SDK_V3 is false: "AWS SDK v2 is no longer supported. Please upgrade to Node.js 18 or higher to use AWS SDK v3."
	 * @throws {Error} When `@aws-sdk/client-dynamodb` or `@aws-sdk/lib-dynamodb` cannot be loaded:
	 *   the original require() error, with code MODULE_NOT_FOUND. Nothing is memoized, so the next read tries again.
	 * @example
	 * const result = await AWS.dynamo.get({ TableName: "my-cache-table", Key: { id_hash: "abc123" } });
	 * console.log(result.Item);
	 */
	static get dynamo() {
		// Build on the first read. The memo is assigned only after the build returns,
		// so a build that throws leaves it null and the next read tries again.
		if (AWS.#dynamoSdk === null) {
			AWS.#dynamoSdk = AWS.#buildDynamo();
		}
		const memo = AWS.#dynamoSdk;
		// Return a fresh object literal per access so jest.spyOn(AWS, 'dynamo', 'get')
		// keeps working, as it does for secrets.
		return {
			client: memo.client,
			put: memo.put,
			get: memo.get,
			scan: memo.scan,
			delete: memo.delete,
			update: memo.update,
			sdk: memo.sdk
		};
	}

	/**
	 * Provides an S3 client and helper functions.
	 *
	 * The first read requires `@aws-sdk/client-s3` and constructs the client in
	 * `AWS.REGION`. Later reads reuse the same client, helper functions, and `sdk`
	 * object. Each read returns a new object.
	 *
	 * @returns {{
	 *   client: object,
	 *   put: {(params:Object) => Promise<any>},
	 *   get: {(params:Object) => Promise<any>},
	 *   sdk: {
	 *     S3: object,
	 *     GetObjectCommand: object,
	 *     PutObjectCommand: object
	 *   }
	 * }} The S3 client, an instance of the aggregated S3 class; helper functions that send
	 *   a PutObjectCommand or GetObjectCommand through it; and SDK classes
	 * @throws {Error} When AWS.SDK_V3 is false: "AWS SDK v2 is no longer supported. Please upgrade to Node.js 18 or higher to use AWS SDK v3."
	 * @throws {Error} When `@aws-sdk/client-s3` cannot be loaded: the original require() error,
	 *   with code MODULE_NOT_FOUND. Nothing is memoized, so the next read tries again.
	 * @example
	 * const result = await AWS.s3.get({ Bucket: "my-cache-bucket", Key: "cache/abc123.json" });
	 * const body = await result.Body.transformToString();
	 */
	static get s3() {
		// Same build-once, fresh-literal pattern as dynamo.
		if (AWS.#s3Sdk === null) {
			AWS.#s3Sdk = AWS.#buildS3();
		}
		const memo = AWS.#s3Sdk;
		return {
			client: memo.client,
			put: memo.put,
			get: memo.get,
			sdk: memo.sdk
		};
	}

	/**
	 * Provides an SSM Parameter Store client and helper functions.
	 *
	 * The first read requires `@aws-sdk/client-ssm` and constructs the client in
	 * `AWS.REGION`. Later reads reuse the same client, helper functions, and `sdk`
	 * object. Each read returns a new object.
	 *
	 * @returns {{
	 *   client: object,
	 *   getByName: {(query:Object) => Promise<any>},
	 *   getByPath: {(query:Object) => Promise<any>},
	 *   sdk: {
	 *     SSMClient: object,
	 *     GetParametersByPathCommand: object,
	 *     GetParametersCommand: object
	 *   }
	 * }} The SSM client; helper functions that send a GetParametersCommand or
	 *   GetParametersByPathCommand through it; and SDK classes
	 * @throws {Error} When AWS.SDK_V3 is false: "AWS SDK v2 is no longer supported. Please upgrade to Node.js 18 or higher to use AWS SDK v3."
	 * @throws {Error} When `@aws-sdk/client-ssm` cannot be loaded: the original require() error,
	 *   with code MODULE_NOT_FOUND. Nothing is memoized, so the next read tries again.
	 * @example
	 * const result = await AWS.ssm.getByName({ Names: ["/my-app/api-key"], WithDecryption: true });
	 * console.log(result.Parameters);
	 */
	static get ssm() {
		// Same build-once, fresh-literal pattern as dynamo.
		if (AWS.#ssmSdk === null) {
			AWS.#ssmSdk = AWS.#buildSsm();
		}
		const memo = AWS.#ssmSdk;
		return {
			client: memo.client,
			getByName: memo.getByName,
			getByPath: memo.getByPath,
			sdk: memo.sdk
		};
	}

	/**
	 * Provides a lazy Secrets Manager client and helper functions.
	 *
	 * The SDK package is required on first access (not at module load) so that an
	 * absent package does not throw for consumers that never use secrets (Req 8.3-8.4).
	 * The client is memoized after the first successful construction (Req 8.6).
	 *
	 * @returns {{
	 *   client: object|null,
	 *   get: function,
	 *   sdk: object|null,
	 *   available: boolean,
	 *   reason: string|null
	 * }}
	 * @example
	 * const secret = await AWS.secrets.get({ SecretId: 'myapp/db/credentials' });
	 * console.log(secret.SecretString);
	 */
	static get secrets() {
		// >! Build the memoized SDK object lazily on first access so the
		// >! @aws-sdk/client-secrets-manager require does not run at module load.
		// >! If the package is absent the accessor stays available=false rather
		// >! than throwing, so consumers without Secrets Manager needs are unaffected.
		if (AWS.#secretsSdk === null) {
			try {
				const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
				const client = instrumentClient(new SecretsManagerClient({ region: AWS.REGION }));
				AWS.#secretsSdk = {
					client,
					get: (params) => client.send(new GetSecretValueCommand(params)),
					sdk: { SecretsManagerClient, GetSecretValueCommand },
					available: true,
					reason: null
				};
			} catch (error) {
				// >! Package absent or instantiation failed — record the reason and
				// >! return a non-throwing accessor shape so callers can inspect .available.
				AWS.#secretsSdk = {
					client: null,
					get: () => Promise.reject(new Error(`AWS.secrets is unavailable: ${error.message}`)),
					sdk: null,
					available: false,
					reason: error.message
				};
			}
		}

		// Return a fresh object literal per access so jest.spyOn(AWS, 'secrets', 'get')
		// continues to work identically to the ssm/dynamo/s3 accessor pattern (Req 8.1).
		return {
			client: AWS.#secretsSdk.client,
			get: AWS.#secretsSdk.get,
			sdk: AWS.#secretsSdk.sdk,
			available: AWS.#secretsSdk.available,
			reason: AWS.#secretsSdk.reason
		};
	}

	/**
	 * Provides the AWS X-Ray SDK when X-Ray is enabled.
	 *
	 * X-Ray is enabled by setting `CACHE_DATA_AWS_X_RAY_ON` or `CacheData_AWSXRayOn` to
	 * `true` before the package is loaded. It is then initialized while the package
	 * loads, before any AWS client is constructed.
	 *
	 * @returns {object|null} The initialized `aws-xray-sdk-core` object when X-Ray is enabled
	 *   and the SDK loaded; `null` when X-Ray is disabled or `aws-xray-sdk-core` could not be loaded
	 * @example
	 * const xray = AWS.XRay;
	 * if (xray !== null) {
	 *   // HTTP and HTTPS requests are already captured
	 *   const segment = xray.getSegment();
	 * }
	 */
	static get XRay() {
		return initializeXRay();
	}

};

// Initialize X-Ray at module load when it is enabled. tools.AWSXRay, tools.AwsXRay,
// and ApiRequest.class.js copy AWSXRay when they load, so it has to be initialized
// before module.exports is assigned. Building the clients used to do this as a side
// effect; the clients are now built on first use.
if (USE_XRAY) {
	initializeXRay();
}

module.exports = {
	AWS,
	Aws: AWS, // alias
	AWSXRay,
	AwsXRay: AWSXRay, // alias
};