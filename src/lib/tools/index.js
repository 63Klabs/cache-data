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
const APIRequest = require("./APIRequest.class");
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
const { CachedParameterSecrets, CachedParameterSecret, CachedSSMParameter, CachedSecret } = require('./CachedParametersSecrets.classes')
const { Connections, Connection, ConnectionRequest, ConnectionAuthentication } = require('./Connections.classes')

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

	/**
	 * Initialize the Config class
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
	 * @param {object} options.ssmParameters Parameter Store
	 * @returns {Promise<void>}
	 * @example
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
	 */
	static init(options = {}) {

		try {

			const debug = (options?.debug === true);
			if (debug) {
				DebugAndLog.debug("Config Init in debug mode");
			}

			if (options.settings) {
				AppConfig._settings = options.settings;
				if (debug) { DebugAndLog.debug("Settings initialized", AppConfig._settings); }
			}

			if (options.connections) {
				AppConfig._connections = new Connections(options.connections);
				if (debug) { DebugAndLog.debug("Connections initialized", AppConfig._connections.info()); }
			}

			if (options.validations) {
				ClientRequest.init(options.validations);
				if (debug) { DebugAndLog.debug("ClientRequest initialized", ClientRequest.info()); }
			}

			if (options.responses) {
				Response.init(options.responses);
				if (debug) { DebugAndLog.debug("Response initialized", Response.info()); }
			}

			if (options.ssmParameters) {
				AppConfig._ssmParameters = AppConfig._initParameters(options.ssmParameters);
				AppConfig.add(AppConfig._ssmParameters);
			}

			return true;

		} catch (error) {
			DebugAndLog.error(`Could not initialize Config ${error.message}`, error.stack);
			return false;
		}
	};

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
	 * 
	 * @returns {Connections}
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
	 *    endpoint.get
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
	 *    endpoint.get
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
	 * Retrieve all the parameters (listed in const params) from the
	 * parameter store and parse out the name. Then return the name
	 * along with their value.
	 * 
	 * This will automatically decrypt any encrypted values (it will
	 * leave any String and StringList parameters as their normal,
	 * unencrypted self (WithDecryption is ignored for them))
	 * 
	 * @returns {Promise<array>} parameters and their values
	 */
	static async _getParametersFromStore (parameters) {

		let paramstore = {};

		/* go through PARAMS and compile all parameters with 
		their paths pre-pended into a list of names */
		const paramNames = function () {
			let names = [];
			let paths = [];

			/* we have two levels to work through, the base path has param names 
			grouped under it. So get all the names within each base path grouping. */
			parameters.forEach(function(item) {
				if ("names" in item) {
					item.names.forEach(function(p) {
						names.push(item.path+p);
					});                    
				} else {
					paths.push(item.path);
				}
				
			});

			return { names: names, paths: paths};
		};

		let pNames = paramNames();

		if (pNames.names.length > 0 || pNames.paths.length > 0 ) {

			let paramResultsArr = [];

			// process all params by name and place promise in results array
			if (pNames.names.length > 0) {

				// put the list of full path names into query.Names
				const query = {
					'Names': pNames.names,
					'WithDecryption': true
				};

				DebugAndLog.debug("Param by name query:",query);
				
				// get parameters from query - wait for the promise to resolve
				paramResultsArr.push(AWS.ssm.getByName(query));

			}

			// process all params by path and place each promise into results array
			if (pNames.paths.length > 0) {

				pNames.paths.forEach( function (path) {
					const query = {
						'Path': path,
						'WithDecryption': true
					};

					DebugAndLog.debug("Param by path query", query);

					paramResultsArr.push(AWS.ssm.getByPath(query));

				});

			}

			// wait for all parameter request promises to resolve then combine
			let promiseArray = await Promise.all(paramResultsArr); // wait
			let results = [];
			promiseArray.forEach( function (result) { // add parameter list in each result promise to an array
				results.push.apply(results, result.Parameters);
				//DebugAndLog.debug("added results", result.Parameters);
			}); 
			
			//DebugAndLog.debug("Parameters", results );

			/* now that the promise has resolved and we've combined them,
			crop off the path and store key and value within the group */
			results.forEach(param => {
				let nameSections = param.Name.split('/'); // get the last part of the name
				const name = nameSections.pop(); // return last section and return as variable name
				const groupPath = nameSections.join('/')+"/"; // since we removed the last section, join rest together for path

				// put the parameter into its group
				const obj = parameters.find(o => o.path === groupPath);
				const group = obj.group;
				if ( !(group in paramstore)) {
					paramstore[group] = {};
				}

				// store key and value
				paramstore[group][name] = param.Value;
			});
		
		}

		// return an array of keys and values
		return paramstore;
	};

	/**
	 * This is an intermediary wait
	 * @param {*} parameters 
	 * @returns {Promise<array>} parameters and their values
	 */
	static async _getParameters(parameters) {
		return await this._getParametersFromStore(parameters);
	};

	/**
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
	APIRequest,
	ApiRequest: APIRequest, // Alias
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
	_ConfigSuperClass: AppConfig, // Alias
	CachedSSMParameter,
	CachedSsmParameter: CachedSSMParameter, // Alias
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
	hashThisData
};