
const http = require('http'); // For AWS Parameters and Secrets Lambda Extension - accesses localhost via http

const DebugAndLog = require('./DebugAndLog.class');
const Timer = require('./Timer.class');
// >! Lazy require via function to avoid circular dependency at module-load time.
// >! ExtensionAvailability imports CachedParametersSecrets for hostname/port defaults,
// >! so a top-level require would create a cycle. Loading it inside the method body
// >! defers resolution until after both modules are fully initialised.
function _getExtensionAvailability() {
	return require('../utils/ExtensionAvailability.class.js');
}
function _getAWS() {
	return require('./AWS.classes.js').AWS;
}

/** Request timeout for the Lambda extension in milliseconds (Req 10.7). */
const EXTENSION_REQUEST_TIMEOUT_MS = 5000;

/* ****************************************************************************
 * Systems Manager Parameter Store and Secrets Manager Lambda Extension
 * ----------------------------------------------------------------------------
 * 
 * AWS Parameters and Secrets Lambda Extension
 * To use, the Systems Manager Parameter Store and Secrets Manager Lambda
 * Extension layer must be installed for your Lambda function.
 * 
 * Added in Cache-Data v1.0.38
 * 
 * https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html
 * https://aws.amazon.com/blogs/compute/using-the-aws-parameter-and-secrets-lambda-extension-to-cache-parameters-and-secrets/
 *************************************************************************** */

/**
 * @class CachedParameterSecrets - Container class for CachedParameterSecret objects
 * @example
 * // Create parameters and secrets
 * const dbPassword = new CachedSsmParameter('/myapp/db/password');
 * const apiKey = new CachedSecret('myapp-api-key');
 * 
 * // Prime all parameters and secrets before use
 * await CachedParameterSecrets.prime();
 * 
 * // Get all names
 * const names = CachedParameterSecrets.getNames();
 * console.log(names); // ['/myapp/db/password', 'myapp-api-key']
 * 
 * // Get specific parameter
 * const param = CachedParameterSecrets.get('/myapp/db/password');
 * const value = await param.getValue();
 */
class CachedParameterSecrets {
	/** 
	 * @typedef {Array<CachedParameterSecret>}
	 */
	static #cachedParameterSecrets = [];

	/**
	 * @param {CachedParameterSecret} cachedParameterSecretObject - The CachedParameterSecret object to add
	 */
	static add (cachedParameterSecretObject) {
		// >! Dedupe guard: if a name is already registered, do not add a second entry (Req 12.9).
		const name = cachedParameterSecretObject.getName();
		const exists = CachedParameterSecrets.#cachedParameterSecrets.some(
			obj => obj.getName() === name
		);
		if (!exists) {
			CachedParameterSecrets.#cachedParameterSecrets.push(cachedParameterSecretObject);
		}
	}

	/**
	 * @param {string} name - The Parameter name or Secret Id to locate
	 * @returns {CachedParameterSecret}
	 */
	static get (name) {
		return CachedParameterSecrets.#cachedParameterSecrets.find(cachedParameterSecretObject => cachedParameterSecretObject.getName() === name);
	}

	/**
	 * 
	 * @returns {Array<object>} An array of objects representing the CachedParameterSecret.toObject()
	 * (see CachedParameterSecret.toObject() for details
	 */
	static toArray() {
		// return an array of cachedParameterSecret.toObject()
		const objects = [];
		CachedParameterSecrets.#cachedParameterSecrets.forEach(cachedParameterSecretObject => {
			objects.push(cachedParameterSecretObject.toObject());
		});
		return objects;
	};

	/**
	 * @returns {object: Array<object>} An object containing an array of CachedParameterSecret.toObject()
	 */
	static toObject() {
		// return an object of cachedParameterSecret.toObject()
		return {objects: CachedParameterSecrets.toArray()};
	}

	/**
	 *
	 * @returns {string} JSON string of CachedParameterSecrets.toObject()
	 */
	static toJSON() {
		return JSON.stringify(CachedParameterSecrets.toObject());
	};

	/**
	 * 
	 * @returns {Array<string>}
	 */
	static getNameTags() {
		const nameTags = [];
		CachedParameterSecrets.#cachedParameterSecrets.forEach(cachedParameterSecretObject => {
			nameTags.push(cachedParameterSecretObject.getNameTag());
		});
		return nameTags;
	};

	/**
	 * 
	 * @returns {Array<string>}
	 */
	static getNames() {
		const names = [];
		CachedParameterSecrets.#cachedParameterSecrets.forEach(cachedParameterSecretObject => {
			names.push(cachedParameterSecretObject.getName());
		});
		return names;
	};

	/**
	 * Call .prime() of all CachedParameterSecrets and return all the promises
	 * @returns {Promise<boolean>} Resolves true on success, false on error
	 */
	static async prime() {

		return new Promise(async (resolve) => {

			try {
				const promises = [];
				CachedParameterSecrets.#cachedParameterSecrets.forEach(cachedParameterSecretObject => {
					promises.push(cachedParameterSecretObject.prime());
				});

				await Promise.all(promises);

				resolve(true);

			} catch (error) {
				DebugAndLog.error(`CachedParameterSecrets.prime(): ${error.message}`, error.stack);
				resolve(false);
			}

		});

	};

	/**
	 * Clears the registry. Primarily a test seam for ensuring isolation between tests.
	 * After calling clear(), any new CachedSsmParameter or CachedSecret instances will
	 * be registered as fresh entries.
	 *
	 * @returns {void}
	 */
	static clear() {
		CachedParameterSecrets.#cachedParameterSecrets = [];
	}

	/**
	 * Returns a diagnostic snapshot of the registry and availability state.
	 * Never includes parameter or secret values (Req 13.6).
	 *
	 * @returns {{availability: object, registered: Array, counts: object}}
	 * @example
	 * const info = CachedParameterSecrets.info();
	 * console.log(info.availability.state);  // 'available' | 'unavailable' | 'unknown'
	 * console.log(info.counts.total);         // number of registered entries
	 */
	static info() {
		// Lazily resolve ExtensionAvailability to avoid circular deps
		let availability = { state: 'unknown', reason: null, hostname: 'localhost', port: '2773', transport: 'layer' };
		try {
			const ExtensionAvailability = require('../utils/ExtensionAvailability.class.js');
			availability = ExtensionAvailability.toObject();
		} catch { /* ignore if not available */ }

		const registered = CachedParameterSecrets.#cachedParameterSecrets.map(obj => ({
			name: obj.getName(),
			type: obj.instanceof(),
			isValid: obj.isValid(),
			isRefreshing: obj.isRefreshing(),
			needsRefresh: obj.needsRefresh(),
			// Return a copy of cache excluding the live promise reference
			cache: {
				lastRefresh: obj.cache.lastRefresh,
				status: obj.cache.status,
				refreshAfter: obj.cache.refreshAfter
			}
		}));

		return {
			availability,
			registered,
			counts: {
				total: registered.length,
				valid: registered.filter(r => r.isValid).length,
				refreshing: registered.filter(r => r.isRefreshing).length,
				needsRefresh: registered.filter(r => r.needsRefresh).length
			}
		};
	}

	/**
	 * Initialize parameters and secrets from path and name groupings.
	 * Constructs and registers CachedSsmParameter and CachedSecret instances,
	 * optionally discovering names via path queries.
	 *
	 * Returns a promise so callers can register it via AppConfig.add().
	 *
	 * @param {object} options
	 * @param {Array<{group?: string, path: string, names?: string[], recursive?: boolean}>} [options.ssmParameters]
	 * @param {Array<{group?: string, names: string[], parseJson?: boolean}>} [options.secrets]
	 * @returns {Promise<{registered: number, discovered: number, skipped: Array}>}
	 * @example
	 * CachedParameterSecrets.init({
	 *   ssmParameters: [
	 *     { group: 'app', path: '/myapp/prod/', names: ['authUsername', 'authPassword'] }
	 *   ],
	 *   secrets: [
	 *     { group: 'db', names: ['myapp/db/credentials'] }
	 *   ]
	 * });
	 */
	static async init(options = {}) {
		const registered = [];
		const skipped = [];
		let discoveredCount = 0;

		// ---- SSM parameters ----
		if (Array.isArray(options.ssmParameters) && options.ssmParameters.length > 0) {
			// Lazily require to avoid circular dependencies
			const ParameterStoreLoader = require('../utils/ParameterStoreLoader.class.js');
			const ParameterKeySafety = require('../utils/ParameterKeySafety.class.js');

			for (const entry of options.ssmParameters) {
				const normalizedPath = ParameterKeySafety.normalizePath(entry.path);

				if (Array.isArray(entry.names) && entry.names.length > 0) {
					// Enumerated names — create CachedSsmParameter for each full path
					for (const n of entry.names) {
						const fullName = normalizedPath.replace(/\/$/, '') + '/' + n;
						if (!CachedParameterSecrets.get(fullName)) {
							// Classes defined later in the file — use module.exports reference after load
							const { CachedSsmParameter: SsmParam } = module.exports;
							new SsmParam(fullName);  // auto-registers via constructor
							registered.push(fullName);
						}
					}
				} else {
					// Path discovery — always via SDK (extension has no list endpoint)
					try {
						const result = await ParameterStoreLoader.load([{
							group: entry.group || 'default',
							path: normalizedPath,
							recursive: entry.recursive === true
						}]);

						// Create instances seeded with discovered values to avoid redundant retrieval
						const { CachedSsmParameter: SsmParam } = module.exports;
						for (const [, groupStore] of Object.entries(result.store)) {
							for (const [paramLeaf, paramValue] of Object.entries(groupStore)) {
								const fullName = normalizedPath.replace(/\/$/, '') + '/' + paramLeaf;
								if (!CachedParameterSecrets.get(fullName)) {
									const instance = new SsmParam(fullName);
									// >! Seed discovered value to avoid a redundant retrieval per discovered name
									instance.value = { Parameter: { Name: fullName, Value: paramValue, Type: 'String' } };
									instance.cache.lastRefresh = Date.now();
									instance.cache.status = 1;
									registered.push(fullName);
									discoveredCount++;
								}
							}
						}
						skipped.push(...result.skipped);
					} catch (error) {
						DebugAndLog.error(`CachedParameterSecrets.init(): SSM discovery failed for "${normalizedPath}": ${error.message}`, error.stack);
						skipped.push({ name: normalizedPath, reason: error.message });
					}
				}
			}
		}

		// ---- Secrets ----
		if (Array.isArray(options.secrets) && options.secrets.length > 0) {
			const { CachedSecret: SecretClass } = module.exports;
			for (const entry of options.secrets) {
				const names = Array.isArray(entry.names) ? entry.names : [];
				for (const secretId of names) {
					if (!CachedParameterSecrets.get(secretId)) {
						new SecretClass(secretId);  // auto-registers via constructor
						registered.push(secretId);
					}
				}
			}
		}

		return {
			registered: registered.length,
			discovered: discoveredCount,
			skipped
		};
	}
}

/**
 * @class CachedParameterSecret - Base class for CachedSsmParameter and CachedSecret
 * Accesses data through Systems Manager Parameter Store and Secrets Manager Lambda Extension
 * Since the Lambda Extension runs a localhost via http, it handles it's own http request. Also,
 * since the lambda extension needs time to boot during a cold start, it is not available during
 * the regular init phase outside of the handler. Therefore, we can pass the Object to be used as
 * the secret and then perform an async .get() or .getValue() at runtime. If we need to use a
 * synchronous function, then we must perform a .prime() and make sure it is complete before calling
 * the sync function.
 * 
 * @example
 *  const write(data) {
 *  	const edata = encrypt(data, myParam.sync_getValue()); // some encrypt function
 *  	return edata;
 *  }
 * 
 * async main () => {
 *  	const myParam = new CachedSsmParameter('myParam');
 *  	myParam.prime(); // gets things started in the background
 * 
 *  	// ... some code that may take a few ms to run ...
 *  
 *  	// We are going to call a sync function that MUST 
 *  	// have the myParam value resolved so we 
 *  	// make sure we are good to go before proceeding
 *  	await myParam.prime(); 
 *  	console.log(write(data));
 * }
 */
class CachedParameterSecret {
	static hostname = "localhost";
	static port = "2773";

	name = "";
	value = null;
	cache = {
		lastRefresh: 0,
		status: -1,
		refreshAfter: (5 * 60),
		promise: null
	}

	/**
	 * 
	 * @param {string} name Path and Parameter Name from Parameter Store '/my/path/parametername' or id of secret from Secret Manager
	 * @param {{refreshAfter: number}} options Increase the number of seconds the value should be kept before refreshing. Note that this is in addition to the Lambda Layer cache of 5 minutes. Can shave off a few ms of time if you increase. However, if value or parameter values change frequently you should leave as default.
	 */
	constructor(name, options = {}) {
		this.name = name;
		this.cache.refreshAfter = parseInt((options?.refreshAfter ?? this.cache.refreshAfter), 10);
		CachedParameterSecrets.add(this);
		DebugAndLog.debug(`CachedParameterSecret: ${this.getNameTag()}`);
	};

	/**
	 *
	 * @returns {string} The Parameter path and name or Id of Secret
	 */
	getName() {
		return this.name;
	};

	/**
	 * Returns a string with the name and instance of the class object
	 * @returns {string} 'name [instanceof]'
	 */
	getNameTag() {
		return `${this.name} [${this.instanceof()}]`
	}

	/**
	 * Returns an object representation of the data (except the value)
	 * @returns {{name: string, instanceof: string, cache: {lastRefresh: number, status: number, refreshAfter: number, promise: Promise} isRefreshing: boolean, needsRefresh: boolean, isValid: boolean}} 
	 */
	toObject() {
		return {
			name: this.name,
			instanceof: this.instanceof(),
			cache: this.cache,
			isRefreshing: this.isRefreshing(),
			needsRefresh: this.needsRefresh(),
			isValid: this.isValid()
		};
	};

	/**
	 * JSON.stringify() looks for .toJSON methods and uses it when stringify is called.
	 * This allows us to set an object property such as key with the Class object and 
	 * then, when the object is put to use through stringify, the object will be 
	 * converted to a string.
	 * @returns {string} value of secret or parameter, or placeholder if unresolved
	 */
	toJSON() {
		if (this.isValid()) {
			return this.sync_getValue();
		}
		return `[Pending: ${this.name}]`;
	};

	/**
	 * This allows us to set an object property such as key with the Class object and 
	 * then, when the object is put to use through stringify, the object will be 
	 * converted to a string.	
	 * @returns {string} value of secret or parameter, or placeholder if unresolved
	 */
	toString() {
		if (this.isValid()) {
			return this.sync_getValue();
		}
		return `[Pending: ${this.name}]`;
	};

	/**
	 * 
	 * @returns {string} The constructor name 
	 */
	instanceof() {
		return this.constructor.name; //((this instanceof CachedSsmParameter) ? 'CachedSsmParameter' : 'CachedSecret');
	};

	/**
	 *
	 * @returns {boolean} true if the value is currently being refreshed
	 */
	isRefreshing() {
		return ( this.cache.status === 0 );
	};

	/**
	 * 
	 * @returns {boolean} true if the value has expired and needs a refresh
	 */
	needsRefresh() {
		return ( !this.isRefreshing() && ( (Date.now() - (this.cache.refreshAfter * 1000)) > this.cache.lastRefresh || this.cache.status < 0 ));
	};

	/**
	 *
	 * @returns {boolean} true if the value is valid (has been set and is not null)
	 */
	isValid() {
		return (
			this.value !== null 
			&& typeof this.value === "object"
		);
	}

	/**
	 * Pre-emptively run a request for the secret or parameter. Call this function without
	 * await to start the request in the background.
	 *
	 * Call any of the async functions (.get(), .getValue()) with await just prior to needing the value.
	 * You must await prior to going into a syncronous function and using sync_getValue()
	 * 
	 * @example
	 *  myParam.prime();
	 * //... some code that may take a few ms to run ...
	 *  await myParam.get();
	 * 
	 * @returns {Promise<number>} -1 if error, 1 if success
	 */
	async prime() {
		DebugAndLog.debug(`CachedParameterSecret.prime() called for ${this.getNameTag()}`);
		const p = (this.needsRefresh()) ? this.refresh() : this.cache.promise; 
		DebugAndLog.debug(`CachedParameterSecret.prime() status of ${this.getNameTag()}`, this.toObject());
		return p;
	};

	/**
	 * Forces a refresh of the value from AWS Parameter Store or Secrets Manager whether or not it has expired
	 * @returns {Promise<number>} -1 if error, 1 if success
	 */
	async refresh() {

		// check to see if this.cache.status is an unresolved promise
		DebugAndLog.debug(`CachedParameterSecret.refresh() Checking refresh status of ${this.name}`);
		if ( !this.isRefreshing() ) {
			this.cache.status = 0;
			this.cache.promise = new Promise(async (resolve) => {
				try {
					const timer = new Timer('CachedParameterSecret_refresh', true);

					// Select transport based on availability state (Req 11.1-11.2)
					const ExtensionAvailability = _getExtensionAvailability();
					let transport = ExtensionAvailability.transportForRetrieval();

					let value = null;

					if (transport === 'layer') {
						// Layer path: up to 3 attempts, unchanged retry count (Req 11.10)
						let tryCount = 0;
						while (value === null && tryCount < 3) {
							tryCount++;
							if (tryCount > 1) {
								DebugAndLog.warn(`CachedParameterSecret.refresh() failed. Retry #${tryCount} for ${this.name}`);
							}
							const result = await this._requestSecretsFromLambdaExtension();
							if (result.ok) {
								value = result.value;
								ExtensionAvailability.markAvailable();
							} else if (result.reason === ExtensionAvailability.REASON.CONNECTION_REFUSED ||
							           result.reason === ExtensionAvailability.REASON.TIMEOUT) {
								// >! Extension absent — mark unavailable and fall through to SDK
								ExtensionAvailability.markUnavailable(result.reason);
								transport = 'sdk';
								break;
							} else {
								// Non-2xx or parse failure: layer present but request failed
								ExtensionAvailability.markAvailable();
								DebugAndLog.warn(
									`CachedParameterSecret.refresh(): Layer request failed (${result.reason}) for ${this.name}`
								);
								break;
							}
						}
					}

					if (transport === 'sdk') {
						// SDK path: single attempt (Req 11.9)
						const result = await this._requestFromSdk();
						if (result.ok) {
							value = result.value;
						} else {
							DebugAndLog.warn(
								`CachedParameterSecret.refresh(): SDK request failed for ${this.name}: ${result.reason}`
							);
						}
					}

					if (value !== null) {
						this.value = value;
						this.cache.lastRefresh = Date.now();
						this.cache.status = 1;
					} else {
						this.cache.status = -1;
					}

					timer.stop();
					resolve(this.cache.status);
				} catch (error) {
					DebugAndLog.error(`Error during refresh for ${this.name}: ${error.message}`, error.stack);
					resolve(-1);
				}
			});
		}
		return this.cache.promise;
	}

	/**
	 * Gets the current value object from AWS Parameter Store or Secrets Manager.
	 * It contains the meta-data and properties of the value as well as the value.
	 * The value comes back decrypted.
	 * If the value has expired, it will be refreshed and the refreshed value will be returned.
	 * @returns {Promise<object>} Secret or Parameter Object
	 */
	async get() {
		await this.prime();
		return this.value;
	}

	/**
	 * Returns just the current value string from AWS Parameter Store or Secrets Manager.
	 * The value comes back decrypted.
	 * If the value has expired, it will be refreshed and the refreshed value will be returned.
	 * @returns {Promise<string>} Secret or Parameter String
	 */
	async getValue() {
		await this.get();
		if (this.value === null) {
			return null;
		} else {
			return this.sync_getValue();
		}
	}

	/**
	 * This can be used in sync functions after .get(), .getValue(), or .refresh() completes
	 * The value comes back decrypted.
	 * It will return the current, cached copy which may have expired.
	 * @returns {string} The value of the Secret or Parameter
	 * @throws {Error} If the secret is null or .get(), .getValue(), or .refresh() has not been called first
	 */
	sync_getValue() {
		if (this.isValid()) {
			DebugAndLog.debug(`CachedParameterSecret.sync_getValue() returning value for ${this.name}`, this.toObject());
			return ("Parameter" in this.value) ? this.value?.Parameter?.Value : this.value?.SecretString ;
		} else {
			// Throw error
			throw new Error("CachedParameterSecret Error: Secret is null. Must call and await async function .get(), .getValue(), or .refresh() first");
		}
	}

	/**
	 * Returns the URL path for the AWS Parameters and Secrets Lambda Extension.
	 * Subclasses override this to provide service-specific paths.
	 * @returns {string}
	 */
	getPath() {
		return "";
	}

	/**
	 * Retrieves the value via SDK when the extension is unavailable. Subclasses override.
	 * @returns {Promise<{ok: boolean, value: object|null, reason: string|null}>}
	 */
	async _requestFromSdk() {
		return { ok: false, value: null, reason: 'no-sdk-implementation' };
	}

	/**
	 * Requests the value from the Lambda extension, returning a discriminated result.
	 * Never throws (Req 10.6). The result.reason distinguishes connection failures
	 * (safe to fall back) from request failures (layer present, do not fall back).
	 * @returns {Promise<{ok: boolean, value: object|null, reason: string|null}>}
	 */
	async _requestSecretsFromLambdaExtension() {
		const ExtensionAvailability = _getExtensionAvailability();

		return new Promise((resolve) => {
			let body = "";

			const options = {
				hostname: ExtensionAvailability.hostname(),
				// >! Port from PARAMETERS_SECRETS_EXTENSION_HTTP_PORT or default (Req 9.5-9.6)
				port:     ExtensionAvailability.port(),
				path: this.getPath(),
				headers: {
					'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN
				},
				method: 'GET',
				// >! Explicit timeout so req.on('timeout') is reachable (Req 10.7)
				timeout: EXTENSION_REQUEST_TIMEOUT_MS
			};

			let req = http.request(options, (res) => {
				DebugAndLog.debug('CachedParameterSecret http: Calling Lambda Extension');
				try {
					res.on('data', (chunk) => { body += chunk; });
					res.on('end', () => {
						DebugAndLog.debug(`CachedParameterSecret http: Response ${res.statusCode} for ${options.path}`);
						// >! Non-2xx: extension present but request failed — do NOT fall back (Req 10.2-10.3)
						if (res.statusCode < 200 || res.statusCode >= 300) {
							DebugAndLog.warn(`CachedParameterSecret http: Non-2xx ${res.statusCode} for ${options.path}`);
							resolve({ ok: false, value: null, reason: 'non-2xx' });
							return;
						}
						try {
							const value = (typeof body === 'string') ? JSON.parse(body) : null;
							resolve({ ok: value !== null, value, reason: value === null ? 'parse-error' : null });
						} catch (err) {
							DebugAndLog.error(`CachedParameterSecret http: Parse error for ${options.path}: ${err.message}`, err.stack);
							resolve({ ok: false, value: null, reason: 'parse-error' });
						}
					});
					res.on('error', (err) => {
						DebugAndLog.error(`CachedParameterSecret http: Response error for ${options.path}: ${err.message}`, err.stack);
						resolve({ ok: false, value: null, reason: 'request-error' });
					});
				} catch (err) {
					DebugAndLog.error(`CachedParameterSecret http: Callback error for ${options.path}: ${err.message}`, err.stack);
					resolve({ ok: false, value: null, reason: 'request-error' });
				}
			});

			req.on('timeout', () => {
				DebugAndLog.error(`CachedParameterSecret http: Timeout for ${options.path}`);
				req.destroy();
				// >! Timeout: extension not responding — fallback is safe (Req 10.4)
				resolve({ ok: false, value: null, reason: ExtensionAvailability.REASON.TIMEOUT });
			});

			req.on('error', (err) => {
				// >! Preserve error.code so ECONNREFUSED is distinguishable (Req 10.4)
				const isConn = (err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH' || err.code === 'ENOTFOUND');
				const reason = isConn ? ExtensionAvailability.REASON.CONNECTION_REFUSED : 'request-error';
				DebugAndLog.error(`CachedParameterSecret http: Request error [${err.code}] for ${options.path}: ${err.message}`, err.stack);
				resolve({ ok: false, value: null, reason });
			});

			req.end();
		});
	};

}

/**
 * CachedSsmParameter extends CachedParameterSecret and is used to retrieve parameters from AWS Systems Manager Parameter Store
 * @extends CachedParameterSecret
 * @example
 * // Create a cached SSM parameter
 * const dbPassword = new CachedSsmParameter('/myapp/db/password');
 * 
 * // Get the parameter value (async)
 * const password = await dbPassword.getValue();
 * console.log(password); // 'my-secret-password'
 * 
 * @example
 * // Use with synchronous functions after priming
 * const apiKey = new CachedSsmParameter('/myapp/api/key');
 * 
 * async function init() {
 *   // Prime the parameter in the background
 *   apiKey.prime();
 *   
 *   // Do other initialization work...
 *   
 *   // Ensure parameter is loaded before sync usage
 *   await apiKey.prime();
 *   
 *   // Now safe to use in sync functions
 *   const key = apiKey.sync_getValue();
 *   return key;
 * }
 */
class CachedSsmParameter extends CachedParameterSecret {
	/**
	 * Returns the URL path for the AWS Parameters and Secrets Lambda Extension to retrieve this SSM parameter
	 * @returns {string} The URL path with encoded parameter name
	 */
	getPath() {
		const uriEncodedSecret = encodeURIComponent(this.name);
		return `/systemsmanager/parameters/get/?name=${uriEncodedSecret}&withDecryption=true`;
	}

	/**
	 * Retrieves this SSM parameter via the AWS SDK as a fallback when the extension
	 * is unavailable. Normalizes to {Parameter: {Value}} wrapper shape (Req 11.5).
	 * @returns {Promise<{ok: boolean, value: object|null, reason: string|null}>}
	 */
	async _requestFromSdk() {
		try {
			const AWS = _getAWS();
			const response = await AWS.ssm.getByName({
				Names: [this.name],
				WithDecryption: true
			});
			if (response.InvalidParameters && response.InvalidParameters.includes(this.name)) {
				DebugAndLog.warn(`CachedSsmParameter SDK: Parameter "${this.name}" not found`);
				return { ok: false, value: null, reason: 'invalid-parameter' };
			}
			if (!response.Parameters || response.Parameters.length === 0) {
				return { ok: false, value: null, reason: 'empty-response' };
			}
			// >! Normalize to the same wrapper shape as the Layer response so
			// >! sync_getValue(), isValid(), toString(), toJSON() are unchanged (Req 11.5)
			const param = response.Parameters[0];
			return { ok: true, value: { Parameter: param }, reason: null };
		} catch (error) {
			DebugAndLog.error(`CachedSsmParameter SDK: Request failed for "${this.name}": ${error.message}`, error.stack);
			return { ok: false, value: null, reason: error.message };
		}
	}

	isValid() {
		return (
			super.isValid()
			&& "Parameter" in this.value
		);
	}
}

/**
 * CachedSecret extends CachedParameterSecret and is used to retrieve secrets from AWS Secrets Manager
 * @extends CachedParameterSecret
 * @example
 * // Create a cached secret
 * const dbCredentials = new CachedSecret('myapp-database-credentials');
 * 
 * // Get the secret value (async)
 * const credentials = await dbCredentials.getValue();
 * console.log(credentials); // '{"username":"admin","password":"secret"}'
 * 
 * @example
 * // Use with JSON secrets
 * const apiSecret = new CachedSecret('myapp-api-secret');
 * 
 * async function connectToAPI() {
 *   const secretString = await apiSecret.getValue();
 *   const secretData = JSON.parse(secretString);
 *   
 *   return {
 *     apiKey: secretData.apiKey,
 *     apiSecret: secretData.apiSecret
 *   };
 * }
 * 
 * @example
 * // Prime multiple secrets at once
 * const secret1 = new CachedSecret('secret-1');
 * const secret2 = new CachedSecret('secret-2');
 * 
 * // Prime all secrets in parallel
 * await CachedParameterSecrets.prime();
 * 
 * // Now all secrets are loaded and cached
 * const value1 = secret1.sync_getValue();
 * const value2 = secret2.sync_getValue();
 */
class CachedSecret extends CachedParameterSecret {

	/**
	 * Returns the URL path for the AWS Parameters and Secrets Lambda Extension to retrieve this secret
	 * @returns {string} The URL path with encoded secret ID
	 */
	getPath() {
		const uriEncodedSecret = encodeURIComponent(this.name);
		return `/secretsmanager/get?secretId=${uriEncodedSecret}&withDecryption=true`;
	}

	/**
	 * Retrieves this secret via the AWS Secrets Manager SDK as a fallback (Req 11.4, 11.6).
	 * The SDK response already contains SecretString at the top level, matching the
	 * Layer response shape, so no normalization is needed (Req 11.6).
	 * @returns {Promise<{ok: boolean, value: object|null, reason: string|null}>}
	 */
	async _requestFromSdk() {
		try {
			const AWS = _getAWS();
			const response = await AWS.secrets.get({ SecretId: this.name });
			// >! SDK GetSecretValue response already satisfies "SecretString" in value (Req 11.6)
			return { ok: true, value: response, reason: null };
		} catch (error) {
			DebugAndLog.error(`CachedSecret SDK: Request failed for "${this.name}": ${error.message}`, error.stack);
			return { ok: false, value: null, reason: error.message };
		}
	}

	isValid() {
		return (
			super.isValid()
			&& "SecretString" in this.value
		);
	}
};

module.exports = {
	CachedParameterSecrets,
	CachedParameterSecret,
	CachedSsmParameter,
	CachedSSMParameter: CachedSsmParameter,
	CachedSecret
}