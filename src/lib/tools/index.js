/*
 * =============================================================================
 * Tools
 * -----------------------------------------------------------------------------
 * 
 * Tools used for endpoint data access objects (DAOs) and cache-data. These 
 * tools are also available for other app functionality
 * 
 * Some classes are internal and not exposed via export. Check list of exports
 * for available classes and functions.
 * 
 * -----------------------------------------------------------------------------
 * Environment Variables used
 * -----------------------------------------------------------------------------
 * 
 * This script uses the Node.js environment variable process.env.AWS_REGION if
 * present.
 * 
 */

const { nodeVer, nodeVerMajor, nodeVerMinor, nodeVerMajorMinor } = require('./vars');
const { AWS, AWSXRay } = require('./AWS.classes');
const ApiRequest = require("./ApiRequest.class");
const RequestInfo = require("./RequestInfo.class");
const ClientRequest = require("./ClientRequest.class");
const ResponseDataModel = require("./ResponseDataModel.class");
const Response = require("./Response.class");
const Timer = require("./Timer.class");
const DebugAndLog = require("./DebugAndLog.class");
const ImmutableObject = require('./ImmutableObject.class');
const jsonGenericResponse = require('./generic.response.json');
const htmlGenericResponse = require('./generic.response.html');
const xmlGenericResponse = require('./generic.response.xml');
const rssGenericResponse = require('./generic.response.rss');
const textGenericResponse = require('./generic.response.text');
const { printMsg, sanitize, obfuscate, hashThisData} = require('./utils');
const { CachedParameterSecrets, CachedParameterSecret, CachedSsmParameter, CachedSecret } = require('./CachedParametersSecrets.classes')
const { Connections, Connection, ConnectionRequest, ConnectionAuthentication } = require('./Connections.classes')
const { flushMetrics } = require('./PowertoolsInit')
const ParameterStoreLoader = require('../utils/ParameterStoreLoader.class.js');

// >! Tracks which deprecated method names have already emitted a notice so the
// >! log entry is written at most once per process (Req 18.7).
const _deprecationNoticed = new Set();

/*
 * -----------------------------------------------------------------------------
 * Object definitions
 * -----------------------------------------------------------------------------
 */

/**
 * @typedef {Object} ConnectionObject
 * @property {string} method GET or POST
 * @property {string} uri the full uri (overrides protocol, host, path, and parameters) ex https://example.com/api/v1/1004/?key=asdf&y=4
 * @property {string} protocol https
 * @property {string} host host/domain: example.com
 * @property {string} path path of the request: /api/v1/1004
 * @property {object} parameters parameters for the query string as an object in key/value pairs
 * @property {object} headers headers for the request as an object in key/value pairs
 * @property {string} body for POST requests, the body
 * @property {string} note a note for logging
 * @property {object} options https_get options
 * @property {number} options.timeout timeout in milliseconds
 * @property {CacheProfileObject[]} cache
 */

/**
 * @typedef {Object} CacheProfileObject
 * @property {string} profile The name of the cache profile
 * @property {boolean} overrideOriginHeaderExpiration If true, the cache expiration will be overridden by the origin header expiration
 * @property {number} defaultExpirationInSeconds The default expiration time in seconds
 * @property {boolean} expirationIsOnInterval If true, the cache expiration will be on an interval
 * @property {array<string>} headersToRetain
 * @property {string} hostId The host ID to use for the cache key
 * @property {string} pathId The path ID to use for the cache key
 * @property {boolean} encrypt If true, the cache data will be encrypted
 */

/* ****************************************************************************
 * Configure classes
 * ----------------------------------------------------------------------------
 * 
 * Provides base functionality to be extended by a custom Config class in the 
 * application.
 * 
 *************************************************************************** */

/**
 * AppConfig needs to be extended by your own Config class definition.
 * 
 * This super class holds common variables and methods that can be used by any 
 * application. However, each application requires it's own methods and logic 
 * to init.
 * 
 * Usage: The child class Config should be placed near the top of the script 
 * file outside of the event handler. It should be global and must be 
 * initialized.
 * 
 * @example
 * class Config extends tools.AppConfig {
 * 		// your custom class definition including your implementation of .init()
 * }
 * 
 * Config.init();
 */
class AppConfig {

	static _promise = null;
	static _promises = [];
	static _connections = null;
	static _settings = null;
	static _ssmParameters = null;
	static _parametersResolved = null;
	static _secretsResolved = null;

	/**
	 * Initialize the Config class with asynchronous parallel execution.
	 * 
	 * This method returns immediately (synchronously) while initialization operations
	 * execute asynchronously in parallel. Use AppConfig.promise() to wait for all
	 * initialization to complete before accessing initialized configuration.
	 *
	 * @param {object} options Configuration options
	 * @param {object} options.settings Application settings retrieved by Config.settings()
	 * @param {ConnectionObject[]} options.connections Application connections that can then be retrieved by Config.getConn() or Config.getConnCacheProfile()
	 * @param {object} options.validations ClientRequest.init() options
	 * @param {object} options.responses Response.init() options
	 * @param {object} options.responses.settings
	 * @param {number} options.responses.settings.errorExpirationInSeconds
	 * @param {number} options.responses.settings.routeExpirationInSeconds
	 * @param {number} options.responses.settings.externalRequestHeadroomInMs
	 * @param {object} options.responses.jsonResponses
	 * @param {object} options.responses.htmlResponses
	 * @param {object} options.responses.xmlResponses
	 * @param {object} options.responses.rssResponses
	 * @param {object} options.responses.textResponses
	 * @param {Array<{group: string, path: string, names?: string[], recursive?: boolean}>} [options.ssmParameters] SSM Parameter Store entries
	 * @param {Array<{group: string, names: string[], parseJson?: boolean}>} [options.secrets] Secrets Manager entries
	 * @param {boolean} [options.debug=false] Enable debug logging
	 * @returns {boolean} True if initialization started successfully, false on synchronous error
	 * @example
	 * // Initialize configuration (returns immediately)
	 * const { Config } = require("./config");
	 * Config.init({
	 *   settings: {
	 *     dataLimit: 1000,
	 *     cacheTTL: 300
	 *   },
	 *   connections: {
	 *     myConnection: {
	 *       method: "GET",
	 *       host: "example.com",
	 *       path: "/api/v1/data",
	 *       parameters: {
	 *         limit: 100
	 *       }
	 *     }
	 *   }
	 * });
	 * 
	 * // Wait for all initialization to complete
	 * await Config.promise();
	 * 
	 * // Now safe to access initialized configuration
	 * const settings = Config.settings();
	 * const conn = Config.getConn('myConnection');
	 */
	static init(options = {}) {

			try {

				const debug = (options?.debug === true);
				if (debug) {
					DebugAndLog.debug("Config Init in debug mode");
				}

				if (options.settings) {
					const settingsPromise = new Promise((resolve) => {
						try {
							AppConfig._settings = options.settings;
							if (debug) {
								DebugAndLog.debug("Settings initialized", AppConfig._settings);
							}
							resolve(true);
						} catch (error) {
							DebugAndLog.error(`Settings initialization failed: ${error.message}`, error.stack);
							resolve(false);
						}
					});
					AppConfig.add(settingsPromise);
				}

				if (options.connections) {
					const connectionsPromise = new Promise((resolve) => {
						try {
							AppConfig._connections = new Connections(options.connections);
							if (debug) {
								DebugAndLog.debug("Connections initialized", AppConfig._connections.info());
							}
							resolve(true);
						} catch (error) {
							DebugAndLog.error(`Connections initialization failed: ${error.message}`, error.stack);
							resolve(false);
						}
					});
					AppConfig.add(connectionsPromise);
				}

				if (options.validations) {
					const validationsPromise = new Promise((resolve) => {
						try {
							ClientRequest.init(options.validations);
							if (debug) {
								DebugAndLog.debug("ClientRequest initialized", ClientRequest.info());
							}
							resolve(true);
						} catch (error) {
							DebugAndLog.error(`ClientRequest initialization failed: ${error.message}`, error.stack);
							resolve(false);
						}
					});
					AppConfig.add(validationsPromise);
				}

				if (options.responses) {
					const responsesPromise = new Promise((resolve) => {
						try {
							Response.init(options.responses);
							if (debug) {
								DebugAndLog.debug("Response initialized", Response.info());
							}
							resolve(true);
						} catch (error) {
							DebugAndLog.error(`Response initialization failed: ${error.message}`, error.stack);
							resolve(false);
						}
					});
					AppConfig.add(responsesPromise);
				}

				if (options.ssmParameters) {
					// >! _ssmParameters keeps its existing contract: resolves to the paramstore
					// >! (not a boolean), preserving Req 18.8 and the existing tests (Req 18.11).
					// >! A separate derived promise registers the error-contained wrapper and
					// >! populates _parametersResolved for the new parameters() accessor (Req 15).
					// >! Verified: holding a second reference to a rejecting promise does not
					// >! emit an unhandled rejection when a .then().catch() handler is attached.
					AppConfig._ssmParameters = AppConfig._initParameters(options.ssmParameters);
					const registeredParams = AppConfig._ssmParameters
						.then((paramstore) => {
							AppConfig._parametersResolved = paramstore;
							return true;
						})
						.catch((error) => {
							DebugAndLog.error(`SSM parameter initialization failed: ${error.message}`, error.stack);
							return false;
						});
					AppConfig.add(registeredParams);
				}

				if (options.secrets) {
					const SecretsManagerLoader = require('../utils/SecretsManagerLoader.class.js');
					const secretsPromise = new Promise((resolve) => {
						SecretsManagerLoader.load(options.secrets)
							.then((result) => {
								AppConfig._secretsResolved = result.store;
								resolve(true);
							})
							.catch((error) => {
								DebugAndLog.error(`Secrets initialization failed: ${error.message}`, error.stack);
								resolve(false);
							});
					});
					AppConfig.add(secretsPromise);
				}

				return true;

			} catch (error) {
				DebugAndLog.error(`Could not initialize Config ${error.message}`, error.stack);
				return false;
			}
		}
;

	/**
	 * Add a promise to AppConfig. Use AppConfig.promise() to ensure all are resolved.
	 * @param {Promise} promise 
	 */
	static add(promise) {
		AppConfig._promises.push(promise);
	}

	/**
	 * Get the application settings object
	 * 
	 * @returns {object|null} Settings object containing application configuration, or null if not initialized
	 * @example
	 * // Config extends AppConfig
	 * const { Config } = require("./config");
	 * const limit = Config.settings().dataLimit;
	 */
	static settings() {
		return AppConfig._settings;
	};

	/**
	 * Get the resolved SSM parameters store. Returns null until AppConfig.promise() settles.
	 * Matches the pattern of settings() and connections().
	 *
	 * @returns {object|null} Paramstore as {group: {name: value}} or null
	 * @example
	 * await Config.promise();
	 * const host = Config.parameters()?.db?.host;
	 */
	static parameters() {
		return AppConfig._parametersResolved;
	}

	/**
	 * Get the resolved Secrets Manager secrets store. Returns null until AppConfig.promise() settles.
	 *
	 * @returns {object|null} Secrets store as {group: {secretName: value}} or null
	 * @example
	 * await Config.promise();
	 * const credentials = Config.secrets()?.db?.['myapp/db/credentials'];
	 */
	static secrets() {
		return AppConfig._secretsResolved;
	}

	/**
	 * Get the Connections instance.
	 *
	 * @returns {Connections|null} The Connections instance or null if not initialized
	 */
	static connections() {
		return AppConfig._connections;
	};

	/**
	 * Get a connection by name and return the Connection instance
	 * 
	 * @param {string} name The name of the connection to retrieve
	 * @returns {Connection|null} Connection instance or null if not found
	 */
	static getConnection(name) {
		if (AppConfig._connections === null) {
			return null;
		}
		return AppConfig._connections.get(name);
	}

	/**
	 * Get a connection by name and return it as a plain object
	 * 
	 * @param {string} name The name of the connection to retrieve
	 * @returns {{method: string, uri: string, protocol: string, host: string, path: string, headers: object, parameters: object, body: string, options: object, note: string, authentication: object}|null} Connection object with properties or null if not found
	 * @example
	 * const conn = Config.getConn('myConnection');
	 * const cacheObj = await CacheableDataAccess.getData(
	 *    cacheProfile,
	 *    endpoint.send
	 *    conn
	 * )
	 * */
	static getConn(name) {
		if (AppConfig._connections === null) {
			return null;
		}
		
		const connection = AppConfig._connections.get(name);
		
		if (connection === null) {
			return null;
		}
		
		return connection.toObject();
	}

	/**
	 * Get a connection AND one of its Cache Profiles by name and return as plain objects
	 * @param {string} connectionName The name of the connection to retrieve
	 * @param {string} cacheProfileName The name of the cache profile to retrieve from the connection
	 * @returns {{conn: {method: string, uri: string, protocol: string, host: string, path: string, headers: object, parameters: object, body: string, options: object, note: string, authentication: object}|null, cacheProfile: {profile: string, overrideOriginHeaderExpiration: boolean, defaultExpirationInSeconds: number, expirationIsOnInterval: boolean, hostId: string, pathId: string, encrypt: boolean, defaultExpirationExtensionOnErrorInSeconds: number}|null}} Connection and Cache Profile objects or null if not found
	 * @example
	 * const { conn, cacheProfile } = Config.getConnCacheProfile('myConnection', 'myCacheProfile');
	 * const cacheObj = await CacheableDataAccess.getData(
	 *    cacheProfile,
	 *    endpoint.send
	 *    conn
	 * )
	 */
	static getConnCacheProfile(connectionName, cacheProfileName) {

		if (AppConfig._connections === null) {
			return { conn: null, cacheProfile: null };
		}

		const connection = AppConfig._connections.get(connectionName);

		if (connection === null) {
			return { conn: null, cacheProfile: null };
		}

		let cacheProfile;
		
		try {
			const profile = connection.getCacheProfile(cacheProfileName);
			cacheProfile = (profile === undefined) ? null : profile;
		} catch {
			// getCacheProfile throws if _cacheProfiles is null
			cacheProfile = null;
		}

		return {
			conn: connection.toObject(),
			cacheProfile
		};	

	}

	/**
	 * 
	 * @returns {Promise<array>} A promise that resolves when the Config class has finished initializing
	 */
	static promise() {
		if (AppConfig._promise !== null ) { // Backwards compatibility
			AppConfig._promises.push(AppConfig._promise);
		}
		return Promise.all(AppConfig._promises);
	};

	
	/**
	 * Retrieve all the parameters listed in the parameters array from AWS Systems Manager
	 * Parameter Store, group them by the caller-supplied `group` key, and return the
	 * resulting store object.
	 *
	 * This method decrypts SecureString parameters automatically.  String and StringList
	 * parameters are returned in their stored form (WithDecryption is a no-op for them).
	 *
	 * Delegates to ParameterStoreLoader which fixes five defects present in the original
	 * implementation:
	 *   - Prototype-reachable key leakage (CWE-471)
	 *   - GetParameters limit of 10 names per call (batching)
	 *   - GetParametersByPath truncation at 10 results (pagination)
	 *   - TypeError when a path lacked a trailing slash
	 *   - Silent data loss when a returned parameter matched no configured entry
	 *
	 * @deprecated Use `AppConfig.init({ ssmParameters })` and `AppConfig.parameters()` instead.
	 *   The method remains fully supported and now carries all defect fixes.
	 * @param {Array<{group: string, path: string, names?: string[], recursive?: boolean}>} parameters
	 * @returns {Promise<object>} Parameters from the parameter store as `{group: {name: value}}`
	 */
	static async _getParametersFromStore (parameters) {
		if (!_deprecationNoticed.has('_getParametersFromStore')) {
			_deprecationNoticed.add('_getParametersFromStore');
			DebugAndLog.warn(
				'AppConfig._getParametersFromStore() is deprecated. ' +
				'Use AppConfig.init({ ssmParameters }) and AppConfig.parameters() instead.'
			);
		}

		const result = await ParameterStoreLoader.load(parameters);
		return result.store;
	};

	/**
	 * Retrieve parameters from the store.
	 *
	 * @deprecated Use `AppConfig.init({ ssmParameters })` and `AppConfig.parameters()` instead.
	 * @param {Array} parameters
	 * @returns {Promise<object>} Parameters from the parameter store
	 */
	static async _getParameters(parameters) {
		if (!_deprecationNoticed.has('_getParameters')) {
			_deprecationNoticed.add('_getParameters');
			DebugAndLog.warn(
				'AppConfig._getParameters() is deprecated. ' +
				'Use AppConfig.init({ ssmParameters }) and AppConfig.parameters() instead.'
			);
		}
		return await this._getParametersFromStore(parameters);
	};

	/**
	 * Retrieve and return all SSM parameters defined in the parameters array.
	 *
	 * @deprecated Use `AppConfig.init({ ssmParameters })` and `AppConfig.parameters()` instead.
	 *   The method remains fully supported and now carries pagination, batching, and key-safety fixes.
	 * @example
	 *
	 * let params = await this._initParameters(
	 *  [
	 *      {
	 *          "group": "appone", // so we can do params.app.authUsername later
	 *          "path": process.env.PARAM_STORE_PATH, // Lambda environment variable
	 *          "names": [
	 *              "authUsername",
	 *              "authPassword",
	 *              "authAPIkey",
	 *              "crypt_secureDataKey"
	 *          ]
	 *      }, // OR get all under a single path
	 *      {
	 *          "group": "app", // so we can do params.app.authUsername later
	 *          "path": process.env.PARAM_STORE_PATH // Lambda environment variable
	 *      }
	 *  ]
	 * );
	 * @param {array} parameters An array of parameter locations
	 * @returns {Promise<object>} Parameters from the parameter store
	 */
	static async _initParameters(parameters) {
		if (!_deprecationNoticed.has('_initParameters')) {
			_deprecationNoticed.add('_initParameters');
			DebugAndLog.warn(
				'AppConfig._initParameters() is deprecated. ' +
				'Use AppConfig.init({ ssmParameters }) and AppConfig.parameters() instead.'
			);
		}
		// make the call to get the parameters and wait before proceeding to the return
		return await this._getParameters(parameters);
	};

	// static async _initS3File(paths) {
	// 	return {};
	// };

	// static async _initDynamoDbRecord(query) {
	// 	return {};
	// };
	
};

module.exports = {
	nodeVer,
	nodeVerMajor,
	nodeVerMinor,
	nodeVerMajorMinor,
	AWS,
	Aws: AWS,
	AWSXRay,
	AwsXRay: AWSXRay, // Alias
	ApiRequest,
	/** @deprecated Use ApiRequest instead */
	APIRequest: ApiRequest, // Alias
	ImmutableObject,
	Timer,
	DebugAndLog,
	Connection,
	Connections,
	ConnectionRequest,
	ConnectionAuthentication,
	RequestInfo,
	ClientRequest,
	ResponseDataModel,
	Response,
	AppConfig,
	/** @deprecated Use AppConfig instead */
	_ConfigSuperClass: AppConfig, // Alias
	CachedSsmParameter,
	/** @deprecated Use CachedSsmParameter instead */
	CachedSSMParameter: CachedSsmParameter, // Alias
	CachedSecret,
	CachedParameterSecret,
	CachedParameterSecrets,
	jsonGenericResponse,
	htmlGenericResponse,
	rssGenericResponse,
	xmlGenericResponse,
	textGenericResponse,
	printMsg,
	sanitize,
	obfuscate,
	hashThisData,
	flushMetrics
};