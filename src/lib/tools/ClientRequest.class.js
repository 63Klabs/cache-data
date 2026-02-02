const RequestInfo = require('./RequestInfo.class');
const Timer = require('./Timer.class');
const DebugAndLog = require('./DebugAndLog.class');
const { safeClone } = require('./utils');


/**
 * Extends RequestInfo
 * Can be used to create a custom ClientRequest object
 * @example
 * // Initialize ClientRequest with validations
 * ClientRequest.init({
 *   validations: {
 *     referrers: ['example.com', 'myapp.com'],
 *     parameters: {
 *       queryStringParameters: {
 *         limit: (value) => !isNaN(value) && value > 0 && value <= 100,
 *         page: (value) => !isNaN(value) && value > 0
 *       },
 *       pathParameters: {
 *         id: (value) => /^[a-zA-Z0-9-]+$/.test(value)
 *       }
 *     }
 *   }
 * });
 * 
 * @example
 * // Use in Lambda handler
 * exports.handler = async (event, context) => {
 *   const clientRequest = new ClientRequest(event, context);
 *   
 *   if (!clientRequest.isValid()) {
 *     return { statusCode: 400, body: 'Invalid request' };
 *   }
 *   
 *   const userId = clientRequest.getPathAt(1);
 *   const queryParams = clientRequest.getQueryStringParameters();
 *   
 *   // Add logging for monitoring
 *   clientRequest.addPathLog(`users/${userId}`);
 *   clientRequest.addQueryLog(`limit=${queryParams.limit}`);
 *   
 *   // Process request...
 *   return { statusCode: 200, body: 'Success' };
 * };
 */
class ClientRequest extends RequestInfo { 

	static #validations = {
		referrers: ['*'],
		parameters: {}
	};

	static #authenticationIsRequired = false; // is it a public API (no authentication required) or authenticated API? (if both, set to false and use authorizations and roles)
	static #unauthenticatedAuthorizations = (ClientRequest.#authenticationIsRequired) ? ['none'] : ['all']; // change from 'all' if there is a mix of public and authenticated access
	
	/* we would need to add valid roles and authorizations as well as static */

	/* What and who of the request */
	#event = null;
	#context = null;
	#authorizations = safeClone(ClientRequest.#unauthenticatedAuthorizations);
	#roles = [];

	/* The request data */
	#props = {};

	/* Logging */
	#timer = null;
	#logs = {
		pathLog: [],
		queryLog: [],
		apiKey: null
	}


	/**
	 * Initializes the request data based on the event. Also sets the 
	 * validity of the request so it may be checked by .isValid()
	 * @param {object} event object from Lambda
	 */
	constructor(event, context) {
		super(event);
		
		this.#timer = new Timer("ClientRequest", true);

		this.#event = event;
		this.#context = context;

		this.#authenticate();

		const { resource, resourceArray, path, pathArray } = this.#extractResourceAndPath();

		this.#props = {
			method: this.#event.httpMethod,
			path,
			pathArray,
			resource,
			resourceArray,
			pathParameters: {},
			queryStringParameters: {},
			headerParameters: {},
			cookieParameters: {},
			bodyPayload: this.#event?.body || null, // from body
			client: {
				isAuthenticated: this.isAuthenticated(),
				isGuest: this.isGuest(),
				authorizations: this.getAuthorizations(),
				roles: this.getRoles()
			},
			deadline: (this.deadline() - 500),
			calcMsToDeadline: this.calcMsToDeadline
		};
		
		this.#validate();

	};

	/**
	 * This is used to initialize the ClientRequest class for all requests.
	 * Add ClientRequest.init(options) to the Config.init process or at the
	 * top of the main index.js file outside of the handler.
	 * @param {object} options - Configuration options with validations property containing referrers and parameters
	 * @throws {Error} If options is not an object
	 */
	static init(options) {
		if (typeof options === 'object') {
			if ('validations' in options) {
				if ('referrers' in options.validations) {
					ClientRequest.#validations.referrers = options.validations.referrers;
				}
				if ('parameters' in options.validations) {
					ClientRequest.#validations.parameters = options.validations.parameters;
				}
			}
		} else {
			const errMsg = 'Application Configuration Error. Invalid options passed to ClientRequest.init(). Received:';
			DebugAndLog.error(errMsg, options);
			throw new Error(errMsg, options);
		}

	};

	static getReferrerWhiteList() {
		return ClientRequest.#validations.referrers;
	};

	static getParameterValidations() {
		return ClientRequest.#validations.parameters;
	};

	/**
	 * Used in the constructor to set validity of the request
	 * This method may be customized to meet your validation needs
	 */
	#validate() {
	
		let valid = false;

		// add your additional validations here
		valid = this.isAuthorizedReferrer() && this.#hasValidPathParameters() && this.#hasValidQueryStringParameters() && this.#hasValidHeaderParameters() && this.#hasValidCookieParameters();

		// set the variable
		super._isValid = valid;

	};

	#hasValidParameters(paramValidations, clientParameters) {

		let rValue = {
			isValid: true,
			params: {}
		}
	
		if (clientParameters && paramValidations) {
			// Use a for...of loop instead of forEach for better control flow
			for (const [key, value] of Object.entries(clientParameters)) {
				const paramKey = key.replace(/^\/|\/$/g, '');
				const paramValue = value;
				
				if (paramKey in paramValidations) {
					const validationFunc = paramValidations[paramKey];
					if (typeof validationFunc === 'function' && validationFunc(paramValue)) {
						rValue.params[paramKey] = paramValue;
					} else {
						DebugAndLog.warn(`Invalid parameter: ${paramKey} = ${paramValue}`);
						rValue.isValid = false;
						rValue.params = {};
						return rValue; // exit right away
					}
				}
			}
		}	
		return rValue;
	}

	#hasValidPathParameters() {
		const { isValid, params } = this.#hasValidParameters(ClientRequest.getParameterValidations()?.pathParameters, this.#event?.pathParameters);
		this.#props.pathParameters = params;
		return isValid;
	}

	#hasValidQueryStringParameters() {
		// lowercase all the this.#event.queryStringParameters keys
		const qs = {};
		for (const key in this.#event.queryStringParameters) {
			qs[key.toLowerCase()] = this.#event.queryStringParameters[key];
		}
		const { isValid, params } = this.#hasValidParameters(ClientRequest.getParameterValidations()?.queryStringParameters, qs);
		this.#props.queryStringParameters = params;
		return isValid;
	}

	#hasValidHeaderParameters() {
		// camel case all the this.#event.headers keys and remove hyphens
		const headers = {};
		for (const key in this.#event.headers) {
			const camelCaseKey = key.toLowerCase().replace(/-([a-z])/g, (g) => g[1].toUpperCase());
			headers[camelCaseKey] = this.#event.headers[key];
		}
		const { isValid, params } = this.#hasValidParameters(ClientRequest.getParameterValidations()?.headerParameters, headers);
		this.#props.headerParameters = params;
		return isValid;
	}

	#hasValidCookieParameters() {
		const { isValid, params } = this.#hasValidParameters(ClientRequest.getParameterValidations()?.cookiearameters, this.#event?.cookie); // TODO
		this.#props.cookieParameters = params;
		return isValid;
	}


	// Utility function for getPathArray and getResourceArray
	// Returns array slice based on n parameter
	#getArray(arr, n = 0) {
		if (n === 0 || arr.length <= n || (n < 0 && arr.length <= (n*-1))) {
			return arr;
		} else if (n > 0) {
			return arr.slice(0, n);
		} else {
			// Handle negative indices by counting from the end
			return arr.slice(n);
		}
	};

	#getElementAt(arr, n = 0) {
		if (arr.length <= n || (n < 0 && arr.length <= (n*-1)-1)) return null;
		if (n < 0) {
			// Handle negative indices by counting from the end
			return arr[arr.length + n];
		} else {
			return arr[n];
		}
	};

	/** 
	 * Get the first n path elements as a string.
	 * If n is 0, the whole path will be provided
	 * If n is a negative number, the last n elements will be provided
	 * The return value is a string with each element separated by a slash.
	 * @param {number} n number of elements to return.
	 * @returns {string} path elements
	*/
	getPath(n = 0) {
		return this.getPathArray(n).join('/');
	}

	/**
	 * Get the first n path elements as an array.
	 * If n is 0, the whole path will be provided
	 * If n is a negative number, the last n elements will be provided
	 * The return value is an array of strings.
	 * @param {number} n number of elements to return.
	 * @returns {array<string>} path elements
	 */
	getPathArray(n = 0) {
		return this.#getArray(this.#props.pathArray, n);
	}


	/**
	 * Get the path element at the specified index. If n is a negative number then return the nth element from the end.
	 * @param {number} n index of the resource to return
	 * @returns {string} path element
	 */
	getPathAt(n = 0) {
		return this.#getElementAt(this.#props.pathArray, n);
	}

	/**
	 * Get the first n resource elements as a string.
	 * If n is 0, the whole resource will be provided
	 * If n is a negative number, the last n elements will be provided
	 * The return value is a string with each element separated by a slash.
	 * @param {number} n number of elements to return.
	 * @returns {string} resource elements
	 */
	getResource(n = 0) {
		return this.getResourceArray(n).join('/');
	}

	/**
	 * Get the first n resource elements as an array.
	 * If n is 0, the whole resource will be provided
	 * If n is a negative number, the last n elements will be provided
	 * The return value is an array of strings.
	 * @param {number} n number of elements to return.
	 * @returns {array<string>} resource elements
	 */
	getResourceArray(n = 0) {
		return this.#getArray(this.#props.resourceArray, n);
	}

	/**
	 * Get the resource element at the specified index. If n is a negative number then return the nth element from the end.
	 * @param {number} n index of the resource to return
	 * @returns {string} resource element
	 */
	getResourceAt(n = 0) {
		return this.#getElementAt(this.#props.resourceArray, n);
	}

	/**
	 * Returns the path parameters received in the request.
	 * Path parameters are defined in the API's path definition and validated in the applications validation functions.
	 * @returns {object} path parameters
	 */
	getPathParameters() {
		return this.#props.pathParameters;
	};

	/**
	 * Returns the query string parameters received in the request.
	 * Query string parameters are validated in the applications validation functions.
	 * @returns {object} query string parameters
	 */
	getQueryStringParameters() {
		return this.#props.queryStringParameters;
	};

	/**
	 * Returns the header parameters received in the request.
	 * Only headers validated in the applications validation functions are returned.
	 * @returns {object} header parameters
	 */
	getHeaderParameters() {
		return this.#props.headerParameters;
	};

	/**
	 * Returns the cookie parameters received in the request.
	 * Only cookies validated in the applications validation functions are returned.
	 * @returns {object} cookie parameters
	 */
	getCookieParameters() {
		return this.#props.cookieParameters;
	};

	#authenticate() {
		// add your authentication logic here
		this.authenticated = false; // anonymous
	};

	isAuthenticated() {
		return (ClientRequest.#authenticationIsRequired && this.authenticated);
	};

	isGuest() {
		return (!ClientRequest.#authenticationIsRequired && !this.authenticated);
	};

	isAuthorizedToPerform(action="all") {
		return ( this.getAuthorizations().includes(action) || this.getAuthorizations().includes('all'));
	};

	getRoles() {
		if (this.isAuthenticated()) {
			return this.#roles;
		} else {
			return ['guest'];
		}
	};

	getAuthorizations() {
		if (this.isAuthenticated()) {
			return this.#authorizations;
		} else {
			return safeClone(ClientRequest.#unauthenticatedAuthorizations);
		}
	};

	isAuthorizedReferrer() {
		/* Check the array of valid referrers */
		/* Check if the array includes a wildcard (*) OR if one of the whitelisted referrers matches the end of the referrer */
		if (ClientRequest.requiresValidReferrer()) {
			return true;
		} else {
			for (let i = 0; i < ClientRequest.#validations.referrers.length; i++) {
				if (this.getClientReferer().endsWith(ClientRequest.#validations.referrers[i])) {
					return true;
				}
			}
		}
		return false;
	};

	static requiresValidReferrer() {
		return !ClientRequest.#validations.referrers.includes('*');
	};

	hasNoAuthorization() {
		return (this.getAuthorizations().includes('none') || !this.isAuthorizedReferrer() );
	};


	getExecutionTime() {
		return this.#timer.elapsed();
	};

	getFinalExecutionTime() {
		return this.#timer.stop();
	}

	/**
	 * Get the _processed_ request properties. These are the properties that
	 * the ClientRequest object took from the event sent to Lambda, validated,
	 * supplemented, and makes available to controllers. 
	 * @returns {{ method: string, path: string, pathArray: string[], resource: string, resourceArray[], pathParameters: {}, queryStringParameters: {}, headerParameters: {}, cookieParameters: {}, bodyPayload: string, client: {isAuthenticated: boolean, isGuest: boolean, authorizations: string[], roles: string[]}, deadline: number, calcMsToDeadline: number}
	 */
	getProps() {
		return this.#props;
	};
	
	/**
	 * Add one or more path notations to the log.
	 * These are used for logging and monitoring. When a response is finalized the route
	 * is recorded in CloudWatch logs along with the status and other information.
	 * Do not send sensitive information in the path notation, use placeholders instead. 
	 * For example, /user/{id}/profile instead of /user/123/profile
	 * However, /city/Chicago is acceptable because it is not a sensitive identifier.
	 * Only add meaningful parameters. You can abbreviate and rewrite long parameters.
	 * For example, /format/jpg can be coded as /f:jpg or /user/123/profile/privacy as /userProfile/privacy
	 * @param {string|Array<string>} path
	 */
	addPathLog(path = null) {
		if (path === null) {
			path = `${this.#props.method}:${this.#props.pathArray.join("/")}`;
		}
		if (typeof path === 'string') {
			this.#logs.pathLog.push(path);
		} else if (Array.isArray(path)) {
			this.#logs.pathLog = this.#logs.pathLog.concat(path);
		}
	};

	/**
	 * Add one or more query notations to the query log.
	 * These are used for logging and monitoring. When a response is finalized the 
	 * parameters are recorded in CloudWatch logs along with the status and other 
	 * information.
	 * Do not send sensitive information in the query notation, use placeholders instead. 
	 * For example, user instead of user=123
	 * However, city=Chicago is acceptable because it is not a sensitive query.
	 * Only add meaningful parameters. You can abbreviate long parameters.
	 * For example, format=jpg can be coded as f:jpg
	 * @param {string|Array<string>} query
	 */
	addQueryLog(query) {
		if (typeof query === 'string') {
			this.#logs.queryLog.push(query);
		} else if (Array.isArray(query)) {
			this.#logs.queryLog = this.#logs.queryLog.concat(query);
		}
	};

	/**
	 * Get the request log entries
	 * resource: http method and resource path with path parameter keys (no values)
	 * queryKeys: query string keys (no values)
	 * pathLog: custom route path with values (set by application using addPathLog())
	 * queryLog: custom query with or without values (set by addQueryLog())
	 * apiKey: last 6 characters of api key if present
	 * @returns {resource: string, queryKeys: string, routeLog: string, queryLog: string, apiKey: string}
	 */
	getRequestLog() {
		return {
			resource: `${this.#props.method}:${this.#props.resourceArray.join('/')}`,
			// put queryString keys in alpha order and join with &
			queryKeys: Object.keys(this.#props.queryStringParameters).sort().map(key => `${key}=${this.#props.queryStringParameters[key]}`).join('&'),
			routeLog: this.#logs.pathLog.join('/'),
			// put logs.params in alpha order and join with &
			queryLog: this.#logs.queryLog.sort().join('&'),
			// only show last 6 characters of this.apiKey
			apiKey: (this.#logs.apiKey !== null) ? this.#logs.apiKey.substring(this.#logs.apiKey.length - 6) : null
		};
	};

	timerStop() {
		return this.#timer?.stop() || 0;
	};

	/**
	 * 
	 * @returns {number} The remaining time before Lambda times out. 1000 if context is not set in ClientRequest object.
	 */
	getRemainingTimeInMillis() {
		return this.getContext().getRemainingTimeInMillis() || 1000;
	};

	/**
	 * Get the number of milliseconds remaining and deduct the headroom given.
	 * Useful when you want to set a timeout on a function (such as an http request)
	 * that may take longer than our function has time for.
	 * @param {number} headroomInMillis number in milliseconds to deduct from Remaining Time
	 * @returns {number} greater than or equal to 0
	 */
	calcRemainingTimeInMillis(headroomInMillis = 0) {
		let rt = this.getRemainingTimeInMillis() - headroomInMillis;
		return (rt > 0 ? rt : 0);
	};

	/**
	 * 
	 * @returns timestamp for when the remaining time is up
	 */
	deadline() {
		return Date.now() + this.getRemainingTimeInMillis();
	};

	/**
	 * 
	 * @returns Milliseconds to Deadline
	 */
	calcMsToDeadline(deadline) {
		if (!deadline) {
			deadline = Date.now() - 500;
		}
		return deadline - Date.now();
	};

	getContext() {
		if (this.#context === null) {
			DebugAndLog.warn("Context for request is null but was requested. Set context along with event when constructing ClientRequest object");
		}
		return this.#context;
	};

	getEvent() {
		return this.#event;
	};

	#extractResourceAndPath() {
		const {resource, path} = this.getEvent();

		let resourceIndex = [];

		const resourcesAndPaths = {
			resource: '',
			resourceArray: [],
			path: '',
			pathArray: []
		};

		/* We want to use reqContext.resourcePath to create a resourcePath and resourceArray, and we want to use path to create a path and pathArray
		For resourcePathArray, we want to split resourcePath on / and remove any empty strings. We also want to lowercase any element that is not surrounded with {}
		We want to add the index of any resource element that is surrounded with {} to the resourceIndex array.
		For pathArray we want to split on / and remove any empty strings. We also want to lowercase any element that is not at an index listed in the resourceIndex array
		*/
		if (resource) {
			const resourceArray = resource.split('/').filter((element) => element !== '');
			resourceArray.forEach((element, index) => {
				if (element.startsWith('{') && element.endsWith('}')) {
					resourceIndex.push(index);
					resourcesAndPaths.resourceArray.push(element);
				} else {
					resourcesAndPaths.resourceArray.push(element.toLowerCase());
				}
			});
			resourcesAndPaths.resource = resourcesAndPaths.resourceArray.join('/');
		}

		if (path) {
			const pathArray = path.split('/').filter((element) => element !== '');
			pathArray.forEach((element, index) => {
				if (!resourceIndex.includes(index)) {
					resourcesAndPaths.pathArray.push(element.toLowerCase());
				} else {
					resourcesAndPaths.pathArray.push(element);
				}
			});
			resourcesAndPaths.path = resourcesAndPaths.pathArray.join('/');
		}

		return resourcesAndPaths;

	}

};

module.exports = ClientRequest;