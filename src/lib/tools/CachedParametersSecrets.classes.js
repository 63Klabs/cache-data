
const http = require('http'); // For AWS Parameters and Secrets Lambda Extension - accesses localhost via http

const DebugAndLog = require('./DebugAndLog.class');
const Timer = require('./Timer.class');

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
 * const dbPassword = new CachedSSMParameter('/myapp/db/password');
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
		CachedParameterSecrets.#cachedParameterSecrets.push(cachedParameterSecretObject);
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
	 * @returns {Promise<Array>}
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
}

/**
 * @class CachedParameterSecret - Base class for CachedSSMParameter and CachedSecret
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
 *  	const myParam = new CachedSSMParameter('myParam');
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
	 * @returns {string} value of secret or parameter
	 */
	toJSON() {
		return this.sync_getValue();
	};

	/**
	 * This allows us to set an object property such as key with the Class object and 
	 * then, when the object is put to use through stringify, the object will be 
	 * converted to a string.	
	 * @returns {string} value of secret or parameter
	 */
	toString() {
		return this.sync_getValue();
	};

	/**
	 * 
	 * @returns {string} The constructor name 
	 */
	instanceof() {
		return this.constructor.name; //((this instanceof CachedSSMParameter) ? 'CachedSSMParameter' : 'CachedSecret');
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
					let resp = null;
					let tryCount = 0;
					while (resp === null && tryCount < 3) {
						tryCount++;
						if (tryCount > 1) { DebugAndLog.warn(`CachedParameterSecret.refresh() failed. Retry #${tryCount} for ${this.name}`)}
						resp = await this._requestSecretsFromLambdaExtension();
						if (resp !== null) {
							this.value = resp;
							this.cache.lastRefresh = Date.now();
							this.cache.status = 1;						
						} else {
							this.cache.status = -1;
						}
					}
					timer.stop();
					resolve(this.cache.status);					
				} catch (error) {
					DebugAndLog.error(`Error Calling Secrets Manager and SSM Parameter Store Lambda Extension during refresh: ${error.message}`, error.stack);
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
	 * 
	 * @returns {string} The URL path passed to localhost for the AWS Parameters and Secrets Lambda Extension
	 */
	getPath() {
		return "";
	}

	async _requestSecretsFromLambdaExtension() {

		return new Promise(async (resolve) => {

			let body = "";

			const options = {
				hostname: CachedParameterSecret.hostname,
				port: CachedParameterSecret.port,
				path: this.getPath(),
				headers: {
					'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN
				},
				method: 'GET'
			};

			const responseBodyToObject = function (valueBody) { 
				try {
					let value = null;

					if (typeof valueBody === "string") {
						value = JSON.parse(valueBody);
					}
					
					resolve(value);

				} catch (error) {
					DebugAndLog.error(`CachedParameterSecret http: Error Calling Secrets Manager and SSM Parameter Store Lambda Extension: Error parsing response for ${options.path} ${error.message}`, error.stack);
					resolve(null);
				}

			};

			let req = http.request(options, (res) => {

				DebugAndLog.debug('CachedParameterSecret http: Calling Secrets Manager and SSM Parameter Store Lambda Extension');

				try {
					/*
					The 3 classic https.get() functions
					What to do on "data", "end" and "error"
					*/

					res.on('data', function (chunk) { body += chunk; });

					res.on('end', function () { 
						DebugAndLog.debug(`CachedParameterSecret http: Received response for ${options.path}`);
						responseBodyToObject(body);
					});

					res.on('error', error => {
						DebugAndLog.error(`CachedParameterSecret http Error: E0 Error obtaining response for ${options.path} ${error.message}`, error.stack);
						resolve(null);
					});

				}  catch (error) {
					DebugAndLog.error(`CachedParameterSecret http Error: E1 Error obtaining response for ${options.path} ${error.message}`, error.stack);
					resolve(null);
				}

			});

			req.on('timeout', () => {
				DebugAndLog.error(`CachedParameterSecret http Error: Endpoint request timeout reached for ${options.path}`);
				req.end();
				resolve(null);
			});

			req.on('error', error => {
				DebugAndLog.error(`CachedParameterSecret http Error: Error during request for ${options.path} ${error.message}`, error.stack);
				resolve(null);
			});

			req.end();

		});

	};

}

/**
 * CachedSSMParameter extends CachedParameterSecret and is used to retrieve parameters from AWS Systems Manager Parameter Store
 * @extends CachedParameterSecret
 * @example
 * // Create a cached SSM parameter
 * const dbPassword = new CachedSSMParameter('/myapp/db/password');
 * 
 * // Get the parameter value (async)
 * const password = await dbPassword.getValue();
 * console.log(password); // 'my-secret-password'
 * 
 * @example
 * // Use with synchronous functions after priming
 * const apiKey = new CachedSSMParameter('/myapp/api/key');
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
class CachedSSMParameter extends CachedParameterSecret {
	/**
	 * Returns the URL path for the AWS Parameters and Secrets Lambda Extension to retrieve this SSM parameter
	 * @returns {string} The URL path with encoded parameter name
	 */
	getPath() {
		const uriEncodedSecret = encodeURIComponent(this.name);
		return `/systemsmanager/parameters/get/?name=${uriEncodedSecret}&withDecryption=true`;
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
	CachedSSMParameter,
	CachedSecret
}