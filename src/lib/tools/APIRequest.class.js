// This file is used to make API requests and handle responses

const https = require('https');
const {AWS, AWSXRay} = require('./AWS.classes.js');
const DebugAndLog = require('./DebugAndLog.class.js');

/**
 * @typedef {object} ResponseMetadata
 * @description Metadata about pagination and retry operations. This object is only
 * present in the response when pagination or retry features are used and actually occur.
 * 
 * @property {object} [retries] - Retry metadata (present only if retries occurred)
 * @property {boolean} retries.occurred - Whether retry attempts were made
 * @property {number} retries.attempts - Total number of attempts made (including initial attempt)
 * @property {number} retries.finalAttempt - Which attempt number succeeded (1-indexed)
 * 
 * @property {object} [pagination] - Pagination metadata (present only if pagination occurred)
 * @property {boolean} pagination.occurred - Whether pagination was performed
 * @property {number} pagination.totalPages - Total number of pages retrieved
 * @property {number} pagination.totalItems - Total number of items returned across all pages
 * @property {boolean} pagination.incomplete - Whether pagination failed to complete (some pages failed)
 * @property {string|null} pagination.error - Error message if pagination was incomplete, null otherwise
 * 
 * @example
 * // Response with retry metadata only
 * {
 *   success: true,
 *   statusCode: 200,
 *   headers: {...},
 *   body: "...",
 *   message: "SUCCESS",
 *   metadata: {
 *     retries: {
 *       occurred: true,
 *       attempts: 2,
 *       finalAttempt: 2
 *     }
 *   }
 * }
 * 
 * @example
 * // Response with pagination metadata only
 * {
 *   success: true,
 *   statusCode: 200,
 *   headers: {...},
 *   body: "{\"items\": [...], \"returnedItemCount\": 1000}",
 *   message: "SUCCESS",
 *   metadata: {
 *     pagination: {
 *       occurred: true,
 *       totalPages: 5,
 *       totalItems: 1000,
 *       incomplete: false,
 *       error: null
 *     }
 *   }
 * }
 * 
 * @example
 * // Response with both retry and pagination metadata
 * {
 *   success: true,
 *   statusCode: 200,
 *   headers: {...},
 *   body: "{\"items\": [...], \"returnedItemCount\": 1000}",
 *   message: "SUCCESS",
 *   metadata: {
 *     retries: {
 *       occurred: true,
 *       attempts: 2,
 *       finalAttempt: 2
 *     },
 *     pagination: {
 *       occurred: true,
 *       totalPages: 5,
 *       totalItems: 1000,
 *       incomplete: false,
 *       error: null
 *     }
 *   }
 * }
 * 
 * @example
 * // Response with incomplete pagination
 * {
 *   success: true,
 *   statusCode: 200,
 *   headers: {...},
 *   body: "{\"items\": [...], \"returnedItemCount\": 600}",
 *   message: "SUCCESS",
 *   metadata: {
 *     pagination: {
 *       occurred: true,
 *       totalPages: 3,
 *       totalItems: 600,
 *       incomplete: true,
 *       error: "Network error fetching page at offset 600"
 *     }
 *   }
 * }
 * 
 * @example
 * // Response without metadata (no pagination or retry occurred)
 * {
 *   success: true,
 *   statusCode: 200,
 *   headers: {...},
 *   body: "...",
 *   message: "SUCCESS"
 *   // No metadata field present
 * }
 */

/**
 * @typedef {object} APIResponse
 * @description Standard response object returned by APIRequest.send()
 * 
 * @property {boolean} success - Whether the request was successful (statusCode < 400)
 * @property {number} statusCode - HTTP status code
 * @property {object|null} headers - Response headers
 * @property {string|null} body - Response body
 * @property {string|null} message - Response message
 * @property {ResponseMetadata} [metadata] - Optional metadata (present only if pagination or retry occurred)
 */

/* Either return an XRay segment or mock one up so we don't need much logic if xray isn't used */
const xRayProxyFunc = {
	addMetadata: (mockParam, mockObj) => { DebugAndLog.debug(`Mocking XRay addMetadata: ${mockParam} | ${mockObj}`); },
	addAnnotation: (mockParam, mockObj) => { DebugAndLog.debug(`Mocking XRay addAnnotation: ${mockParam} | ${mockObj}`); },
	addError: (mockError) => { DebugAndLog.debug(`Mocking XRay addError: ${mockError}`); },
	addFaultFlag: () => { DebugAndLog.debug(`Mocking XRay addFaultFlag`); },
	addErrorFlag: () => { DebugAndLog.debug(`Mocking XRay addErrorFlag`); },
	close: () => { DebugAndLog.debug(`Mocking XRay close`); }				
};

const xRayProxy = (AWSXRay !== null) ? AWS.XRay.getSegment() : { 
	...xRayProxyFunc,
	addNewSubsegment: (mockString) => { 
		DebugAndLog.debug(`Mocking XRay subsegment: ${mockString}`);
		return xRayProxyFunc;
	}
};

/**
 * An internal tools function used by APIRequest. https.get does not work well
 * inside a class object (specifically doesn't like this.*), so we make it 
 * external to the class and pass the class as a reference to be updated either 
 * with a response or redirect uri.
 * @param {object} options The options object for https.get()
 * @param {APIRequest} requestObject The APIRequest object that contains internal functions, request info (including uri) and redirects. This object will be updated with any redirects and responses
 * @returns A promise that will resolve to a boolean denoting whether or not the response is considered complete (no unresolved redirects). The boolean does not mean "error free." Even if we receive errors it is considered complete.
 */ 
const _httpGetExecute = async function (options, requestObject, xRaySegment = xRayProxy) {

	/*
	Return a promise that will resolve to true or false based upon success
	*/
	return new Promise ((resolve) => {

		/*
		Functions/variables we'll use within https.get()
		We need to declare functions that we will be using within https.get()
		"locally" and refer to the requestObject to perform updates
		setResponse() and addRedirect() also performs the resolve() for the promise
		*/
		const setResponse = function (response) { requestObject.setResponse(response); resolve(true)};
		const addRedirect = function (uri) { requestObject.addRedirect(uri); resolve(false)};
		const redirects = requestObject.getNumberOfRedirects();
		const uri = requestObject.getURI();

		let body = "";

		/*
		Perform the https.get()
		*/
		let req = https.request(uri, options, (res) => {
			
			DebugAndLog.debug(`Performing https.get callback on response with status code: ${res.statusCode} ${new URL(uri).host}`);

			try {

				/*
				- IF it is a redirect, then add the redirect to the request object
				and it will not be marked as complete.

				- ELSE we'll update the request object with the response which
				will mark it as complete.
				*/
				if (   res.statusCode === 301 
					|| res.statusCode === 302 
					|| res.statusCode === 303 
					|| res.statusCode === 307
				) 
				{

					DebugAndLog.debug(`Processing a redirect: ${res.statusCode}`);

					/*
					- IF We have not performed the max number of redirects then we
					will process the current redirect.

					- ELSE We will produce an error of too many redirects.
					*/
					if ( redirects < APIRequest.MAX_REDIRECTS ) {

						// we'll gather variables to use in logging
						let newLocation = res.headers.location;
						let nloc = new URL(newLocation);
						let rloc = new URL(uri);
						
						/* log essential as warning, others only when debugging
						Note that we only list the hostname and path because 
						sensitive info may be in the query string. Also,
						redirects typically don't involve query strings anyway */
						if (res.statusCode === 301) {
							// report as this as permanent, we'll want to report this in the log as a warning and fix
							DebugAndLog.warning("301 | Redirect (Moved Permanently) received", {requested: rloc.protocol +"//"+ rloc.hostname + rloc.pathname, redirect: nloc.protocol +"//"+ nloc.hostname + nloc.pathname });
						} else {
							// Temporary redirect, just follow it, don't if we are not in debug mode
							DebugAndLog.debug(res.statusCode+" Redirect received", {requested: rloc.protocol +"//"+ rloc.hostname + rloc.pathname, redirect: nloc.protocol +"//"+ nloc.hostname + nloc.pathname })
						}

						// don't let the redirect downgrade
						if ( rloc.protocol === "https:" && nloc.protocol !== "https:") { // URL() protocol has the colon 'https:'
							newLocation = newLocation.replace("http:","https:");
							DebugAndLog.debug("We requested https but are being redirected to http. Upgrading back to https - "+newLocation);
						};

						// update the request object with the redirect so it can be reprocessed
						DebugAndLog.debug("Setting uri to "+newLocation);
						addRedirect(newLocation);

					} else {
						DebugAndLog.warn(`Too many redirects. Limit of ${APIRequest.MAX_REDIRECTS}`);
						setResponse(APIRequest.responseFormat(false, 500, "Too many redirects"));
					}

				} else {

					/*
					- IF we receive a 304 (not modified) then send that back as 
					a response. (Protocol is to return a null body)

					- ELSE process as usual
					*/
					if (res.statusCode === 304) {
						// 304 not modified
						DebugAndLog.debug("304 Not Modified. Setting body to null");
						setResponse(APIRequest.responseFormat(
							true, 
							res.statusCode, 
							"SUCCESS", 
							res.headers, 
							null));
					} else {

						DebugAndLog.debug("No 'Redirect' or 'Not Modified' received. Processing http get as usual");

						/*
						The 3 classic https.get() functions
						What to do on "data", "end" and "error"
						*/

						res.on('data', (chunk) => { body += chunk; });

						res.on('end', () => { 

							try {

								let success = (res.statusCode < 400);

								xRaySegment.addAnnotation('response_status', res.statusCode);

								xRaySegment.addMetadata('http',  
									{
										request: {
											method: requestObject.getMethod(),
											host: requestObject.getHost(),
											url: requestObject.getURI(false)
										},
										response: {
											status: res.statusCode,
											headers: res.headers
										}
									}
								);
								// Add request data
								xRaySegment.http = {
									request: {
										method: requestObject.getMethod(),
										url: requestObject.getURI(false),
										traced: true
									},
									response: {
										status: res.statusCode,
										headers: res.headers
									}
								};

								DebugAndLog.debug(`Response status ${res.statusCode}`, {status: res.statusCode, method: requestObject.getMethod(), host: requestObject.getHost(), url: requestObject.getURI(false), headers: res.headers});

								if (res.statusCode >= 500) {
									xRaySegment.addFaultFlag();
									xRaySegment.addError(new Error(`Response status ${res.statusCode}`));
									// xRaySegment.close(); // we are handling in calling func
								} else if (res.statusCode >= 400) {
									xRaySegment.addErrorFlag();
									xRaySegment.addError(new Error(`Response status ${res.statusCode}`));
									// xRaySegment.close(); // we are handling in calling func
								} else {
									// xRaySegment.close(); // we are handling in calling func
								}

								setResponse(APIRequest.responseFormat(
									success, 
									res.statusCode, 
									(success ? "SUCCESS" : "FAIL"), 
									res.headers, 
									body));

							} catch (error) {
								DebugAndLog.error(`Error during http get callback for host ${requestObject.getHost()} ${requestObject.getNote()} ${error.message}`, error.stack);
								xRaySegment.addError(error);
								setResponse(APIRequest.responseFormat(false, 500, "https.get resulted in error"));
							}
						});

						res.on('error', error => {
							DebugAndLog.error(`API error during request/response for host ${requestObject.getHost()} ${requestObject.getNote()} ${error.message}`, error.stack);
							xRaySegment.addError(error);
							// xRaySegment.close(); // we are handling in calling func
							setResponse(APIRequest.responseFormat(false, 500, "https.get resulted in error"));
						});

					}                                          
				}

			} catch (error) {
				DebugAndLog.error(`Error during http get callback for host ${requestObject.getHost()} ${requestObject.getNote()} ${error.message}`, error.stack);
				xRaySegment.addError(error);
				setResponse(APIRequest.responseFormat(false, 500, "https.get resulted in error"));
			}

		});

		req.on('timeout', () => {
			DebugAndLog.warn(`Endpoint request timeout reached (${requestObject.getTimeOutInMilliseconds()}ms) for host: ${requestObject.getHost()}`, {host: requestObject.getHost(), note: requestObject.getNote()});
			// create a new error object to pass to xray
			xRaySegment.addFaultFlag();
			xRaySegment.addError(new Error("Endpoint request timeout reached"));
			// xRaySegment.close(); // we are handling in calling func
			setResponse(APIRequest.responseFormat(false, 504, "https.request resulted in timeout"));
			req.destroy(); //req.end()

		});

		req.on('error', error => {
			DebugAndLog.error(`API error during request for host ${requestObject.getHost()} ${requestObject.getNote()} ${error.message}`, error.stack);
			xRaySegment.addFaultFlag();
			xRaySegment.addError(error);
			// xRaySegment.close(); // we are handling in calling func
			setResponse(APIRequest.responseFormat(false, 500, "https.request resulted in error"));
		});

		if ( requestObject.getMethod() === "POST" && requestObject.getBody() !== null ) {
			req.write(requestObject.getBody());
		}
		req.end();

	});
};

/**
 * Submit GET and POST requests and handle responses.
 * This class can be used in a DAO class object within its call() method.
 * 
 * Features:
 * - Automatic redirect handling (up to MAX_REDIRECTS)
 * - Optional automatic pagination for paginated APIs
 * - Optional automatic retry logic for transient failures
 * - AWS X-Ray distributed tracing with unique subsegments
 * - Response metadata for pagination and retry details
 * 
 * @example
 * // Basic usage in a DAO class
 * async call() {
 *   var response = null;
 *   try {
 *     var apiRequest = new tools.APIRequest(this.request);
 *     response = await apiRequest.send();
 *   } catch (error) {
 *     DebugAndLog.error(`Error in call: ${error.message}`, error.stack);
 *     response = tools.APIRequest.responseFormat(false, 500, "Error in call()");
 *   }
 *   return response;
 * }
 * 
 * @example
 * // Using pagination feature
 * const apiRequest = new tools.APIRequest({
 *   host: 'api.example.com',
 *   path: '/data',
 *   pagination: {
 *     enabled: true,
 *     totalItemsLabel: 'total',
 *     itemsLabel: 'results'
 *   }
 * });
 * const response = await apiRequest.send();
 * // All pages automatically retrieved and combined
 * 
 * @example
 * // Using retry feature
 * const apiRequest = new tools.APIRequest({
 *   host: 'api.example.com',
 *   path: '/data',
 *   retry: {
 *     enabled: true,
 *     maxRetries: 3
 *   }
 * });
 * const response = await apiRequest.send();
 * // Automatically retries on transient failures
 * 
 * @example
 * // Using both pagination and retry
 * const apiRequest = new tools.APIRequest({
 *   host: 'api.example.com',
 *   path: '/data',
 *   pagination: { enabled: true },
 *   retry: { enabled: true, maxRetries: 2 }
 * });
 * const response = await apiRequest.send();
 * // Response includes metadata about both features
 * if (response.metadata) {
 *   console.log('Retries:', response.metadata.retries);
 *   console.log('Pagination:', response.metadata.pagination);
 * }
 */
class APIRequest {

	static MAX_REDIRECTS = 5;

	#redirects = [];
	#requestComplete = false;
	#response = null;
	#request = null;
	#responseMetadata = null;

	/**
	 * Function used to make an API request utilized directly or from within
	 * a data access object.
	 * 
	 * @param {object} request - Request configuration object
	 * @param {string} [request.method="GET"] - HTTP method (GET, POST)
	 * @param {string} [request.protocol="https"] - Protocol (https or http)
	 * @param {string} request.host - Host domain for the request
	 * @param {string} [request.path=""] - Path for the request
	 * @param {string} [request.uri] - Complete URI (overrides host/path if provided)
	 * @param {object} [request.parameters={}] - Query string parameters
	 * @param {object} [request.headers={}] - HTTP headers
	 * @param {string|null} [request.body=null] - Request body for POST requests
	 * @param {string} [request.note=""] - Note for troubleshooting and tracing
	 * @param {object} [request.options] - Request options
	 * @param {number} [request.options.timeout=8000] - Request timeout in milliseconds
	 * @param {boolean} [request.options.separateDuplicateParameters=false] - Whether to separate array parameters into multiple key/value pairs
	 * @param {string} [request.options.separateDuplicateParametersAppendToKey=""] - String to append to key for separated parameters ("", "[]", "0++", "1++")
	 * @param {string} [request.options.combinedDuplicateParameterDelimiter=","] - Delimiter for combined array parameters
	 * @param {object} [request.pagination] - Pagination configuration (opt-in)
	 * @param {boolean} [request.pagination.enabled=false] - Enable automatic pagination
	 * @param {string} [request.pagination.totalItemsLabel="totalItems"] - Response field name for total items count
	 * @param {string} [request.pagination.itemsLabel="items"] - Response field name for items array
	 * @param {string} [request.pagination.offsetLabel="offset"] - Parameter name for offset
	 * @param {string} [request.pagination.limitLabel="limit"] - Parameter name for limit
	 * @param {string|null} [request.pagination.continuationTokenLabel=null] - Parameter name for continuation token (for token-based pagination)
	 * @param {string} [request.pagination.responseReturnCountLabel="returnedItemCount"] - Response field name for returned item count
	 * @param {number} [request.pagination.defaultLimit=200] - Default limit per page
	 * @param {number} [request.pagination.batchSize=5] - Number of pages to fetch concurrently
	 * @param {object} [request.retry] - Retry configuration (opt-in)
	 * @param {boolean} [request.retry.enabled=false] - Enable automatic retries
	 * @param {number} [request.retry.maxRetries=1] - Maximum number of retry attempts after initial attempt (total attempts = maxRetries + 1)
	 * @param {object} [request.retry.retryOn] - Conditions for retrying requests
	 * @param {boolean} [request.retry.retryOn.networkError=true] - Retry on network errors
	 * @param {boolean} [request.retry.retryOn.emptyResponse=true] - Retry on empty or null response body
	 * @param {boolean} [request.retry.retryOn.parseError=true] - Retry on JSON parse errors
	 * @param {boolean} [request.retry.retryOn.serverError=true] - Retry on 5xx status codes
	 * @param {boolean} [request.retry.retryOn.clientError=false] - Retry on 4xx status codes (default: false)
	 * 
	 * @example
	 * // Basic request without pagination or retry
	 * const request = new APIRequest({
	 *   host: 'api.example.com',
	 *   path: '/users',
	 *   parameters: { limit: 10 }
	 * });
	 * const response = await request.send();
	 * 
	 * @example
	 * // Request with minimal pagination configuration (uses all defaults)
	 * const request = new APIRequest({
	 *   host: 'api.example.com',
	 *   path: '/data',
	 *   pagination: { enabled: true }
	 * });
	 * const response = await request.send();
	 * // Response will include metadata.pagination with details
	 * 
	 * @example
	 * // Request with custom pagination labels
	 * const request = new APIRequest({
	 *   host: 'api.example.com',
	 *   path: '/data',
	 *   pagination: {
	 *     enabled: true,
	 *     totalItemsLabel: 'total',
	 *     itemsLabel: 'results',
	 *     offsetLabel: 'skip',
	 *     limitLabel: 'take',
	 *     batchSize: 3
	 *   }
	 * });
	 * const response = await request.send();
	 * 
	 * @example
	 * // Request with minimal retry configuration (uses all defaults)
	 * const request = new APIRequest({
	 *   host: 'api.example.com',
	 *   path: '/data',
	 *   retry: { enabled: true }
	 * });
	 * const response = await request.send();
	 * // Response will include metadata.retries if retries occurred
	 * 
	 * @example
	 * // Request with custom retry configuration
	 * const request = new APIRequest({
	 *   host: 'api.example.com',
	 *   path: '/data',
	 *   retry: {
	 *     enabled: true,
	 *     maxRetries: 3,
	 *     retryOn: {
	 *       clientError: true,  // Also retry on 4xx errors
	 *       serverError: true,
	 *       networkError: true
	 *     }
	 *   }
	 * });
	 * const response = await request.send();
	 * 
	 * @example
	 * // Request with both pagination and retry
	 * const request = new APIRequest({
	 *   host: 'api.example.com',
	 *   path: '/data',
	 *   pagination: { enabled: true },
	 *   retry: { enabled: true, maxRetries: 2 }
	 * });
	 * const response = await request.send();
	 * // Response may include both metadata.pagination and metadata.retries
	 */
	constructor(request) {
		this.resetRequest();

		/* We need to have a method, protocol, uri (host/domain), and parameters set 
		Everything else is optional */

		let timeOutInMilliseconds = 8000;

		/* Default pagination configuration */
		const defaultPaginationConfig = {
			enabled: false,
			totalItemsLabel: 'totalItems',
			itemsLabel: 'items',
			offsetLabel: 'offset',
			limitLabel: 'limit',
			continuationTokenLabel: null,
			responseReturnCountLabel: 'returnedItemCount',
			defaultLimit: 200,
			batchSize: 5
		};

		/* Default retry configuration */
		const defaultRetryConfig = {
			enabled: false,
			maxRetries: 1,
			retryOn: {
				networkError: true,
				emptyResponse: true,
				parseError: true,
				serverError: true,
				clientError: false
			}
		};

		/* Default values */
		let req = {
			method: "GET",
			uri: "",
			protocol: "https",
			host: "",
			path: "",
			parameters: {},
			headers: {},
			body: null,
			note: "",
			options: { 
				timeout: timeOutInMilliseconds,
				separateDuplicateParameters: false,
				separateDuplicateParametersAppendToKey: "", // "" "[]", or "0++", "1++"
				combinedDuplicateParameterDelimiter: ',' // "," or "|" or " "
			},
			pagination: defaultPaginationConfig,
			retry: defaultRetryConfig
		};

		/* if we have a method or protocol passed to us, set them */
		if ( "method" in request && request.method !== "" && request.method !== null) { req.method = request.method.toUpperCase(); }
		if ( "protocol" in request && request.protocol !== "" && request.protocol !== null) { req.protocol = request.protocol.toLowerCase(); }

		if ("body" in request) { req.body = request.body; }
		if ("headers" in request && request.headers !== null) { req.headers = request.headers; }
		if ("note" in request) { req.note = request.note; }

		// With options we want to keep our defaults so we'll use Object.assign
		if ("options" in request && request.options !== null) { req.options = Object.assign(req.options, request.options); }

		// Merge pagination configuration with defaults
		if ("pagination" in request && request.pagination !== null) {
			req.pagination = Object.assign({}, defaultPaginationConfig, request.pagination);
		}

		// Merge retry configuration with defaults, including nested retryOn object
		if ("retry" in request && request.retry !== null && request.retry !== undefined) {
			req.retry = Object.assign({}, defaultRetryConfig, request.retry);
			// Ensure nested retryOn object is also merged properly
			if ("retryOn" in request.retry && request.retry.retryOn !== null) {
				req.retry.retryOn = Object.assign({}, defaultRetryConfig.retryOn, request.retry.retryOn);
			}
		}

		/* if there is no timeout set, or if it is less than 1, then set to default */
		if ( !("timeout" in req.options && req.options.timeout > 0) ) {
			req.options.timeout = timeOutInMilliseconds;
		}

		/* if we have a uri, set it, otherwise form one using host and path */
		if ( "uri" in request && request.uri !== null && request.uri !== "" ) {
			req.uri = request.uri;
		} else if ("host" in request && request.host !== "" && request.host !== null) {
			let path = ("path" in request && request.path !== null && request.path !== null) ? request.path : "";
			req.uri = `${req.protocol}://${request.host}${path}`; // we use req.protocol because it is already set
		}

		/* if we have parameters, create a query string and append to uri */
		if (
				"parameters" in request 
				&&  request.parameters !== null 
				&& (typeof request.parameters === 'object' && Object.keys(request.parameters).length !== 0)
			){

			req.uri += this._queryStringFromObject(request.parameters, req.options);
		}

		this.#request = req;
	};

	_queryStringFromObject = function (parameters, options) {

		let qString = [];
		
		for (const [key,value] of Object.entries(parameters) ) {
	
			/* if the value is an array, then we have to join into one parameter or separate into multiple key/value pairs */
			if ( Array.isArray(value) ) {
				let values = [];
	
				/* apply encodeURIComponent() to each element in value array */
				for (const v of value) {
					values.push(encodeURIComponent(v));
				}
				
				if ( "separateDuplicateParameters" in options && options.separateDuplicateParameters === true) {
					let a = "";
					if ( "separateDuplicateParametersAppendToKey" in options ) {
						if ( options.separateDuplicateParametersAppendToKey === '1++' || options.separateDuplicateParametersAppendToKey === '0++') {
							a = (options.separateDuplicateParametersAppendToKey === "1++") ? 1 : 0;
						} else {
							a = options.separateDuplicateParametersAppendToKey;
						}
					}
					
					for (const v of values) {
						qString.push(`${key}${a}=${v}`); // we encoded above
						if(Number.isInteger(a)) { a++; }
					}
				} else {
					const delim = ("combinedDuplicateParameterDelimiter" in options && options.combinedDuplicateParameterDelimiter !== null && options.combinedDuplicateParameterDelimiter !== "") ? options.combinedDuplicateParameterDelimiter : ",";
					qString.push(`${key}=${values.join(delim)}`); // we encoded above
				}
	
			} else {
				qString.push(`${key}=${encodeURIComponent(value)}`);
			}
		}
	
		return (qString.length > 0) ? '?'+qString.join("&") : "";
	}

	/**
	 * Handle request with retry logic. This private method wraps the HTTP request
	 * execution with automatic retry functionality based on the retry configuration.
	 * 
	 * @private
	 * @param {object} options - HTTPS request options for the underlying https.request call
	 * @param {object} xRaySegment - X-Ray subsegment for tracking request attempts
	 * @returns {Promise<{response: object, metadata: object}>} Promise resolving to response and retry metadata
	 * @returns {object} return.response - The final response object from the request
	 * @returns {boolean} return.response.success - Whether the request was successful
	 * @returns {number} return.response.statusCode - HTTP status code
	 * @returns {object} return.response.headers - Response headers
	 * @returns {string} return.response.body - Response body
	 * @returns {string} return.response.message - Response message
	 * @returns {object} return.metadata - Metadata about retry attempts
	 * @returns {object} return.metadata.retries - Retry information
	 * @returns {boolean} return.metadata.retries.occurred - Whether retries occurred
	 * @returns {number} return.metadata.retries.attempts - Total number of attempts made (including initial)
	 * @returns {number} return.metadata.retries.finalAttempt - Which attempt succeeded
	 * 
	 * @example
	 * // Internal usage within send_get()
	 * const { response, metadata } = await this._handleRetries(options, xRaySegment);
	 * if (metadata.retries.occurred) {
	 *   console.log(`Request succeeded after ${metadata.retries.attempts} attempts`);
	 * }
	 */
	async _handleRetries(options, xRaySegment) {
		const retryConfig = this.#request.retry || { enabled: false };
		const maxRetries = retryConfig.enabled ? (retryConfig.maxRetries || 1) : 0;
		
		let lastResponse = null;
		let attempts = 0;
		
		// Loop: initial attempt + retry attempts
		// If maxRetries = 1, this loops twice (attempt 0 and attempt 1)
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			attempts++;
			
			if (attempt > 0) {
				this.#request.note += ` [Retry ${attempt}/${maxRetries}]`;
				DebugAndLog.warn(`Retrying request (${this.#request.note})`);
				// Reset request state for retry
				this.#requestComplete = false;
			}
			
			// Perform the request (handles redirects internally)
			while (!this.#requestComplete) {
				await _httpGetExecute(options, this, xRaySegment);
			}
			lastResponse = this.#response;
			
			// Check if we should retry
			const shouldRetry = this._shouldRetry(lastResponse, retryConfig, attempt, maxRetries);
			
			if (!shouldRetry) {
				break;
			}
		}
		
		return {
			response: lastResponse,
			metadata: {
				retries: {
					occurred: attempts > 1,
					attempts: attempts,
					finalAttempt: attempts
				}
			}
		};
	}

	/**
	 * Determine if a request should be retried based on the response and retry configuration.
	 * This private method evaluates various failure conditions to decide whether another
	 * attempt should be made.
	 * 
	 * @private
	 * @param {object} response - Current response object from the request attempt
	 * @param {boolean} response.success - Whether the request was successful
	 * @param {number} response.statusCode - HTTP status code
	 * @param {string} response.body - Response body
	 * @param {object} retryConfig - Retry configuration object
	 * @param {boolean} retryConfig.enabled - Whether retries are enabled
	 * @param {number} retryConfig.maxRetries - Maximum number of retry attempts
	 * @param {object} retryConfig.retryOn - Conditions for retrying
	 * @param {boolean} retryConfig.retryOn.networkError - Retry on network errors
	 * @param {boolean} retryConfig.retryOn.emptyResponse - Retry on empty responses
	 * @param {boolean} retryConfig.retryOn.parseError - Retry on JSON parse errors
	 * @param {boolean} retryConfig.retryOn.serverError - Retry on 5xx errors
	 * @param {boolean} retryConfig.retryOn.clientError - Retry on 4xx errors
	 * @param {number} currentAttempt - Current attempt number (0-indexed)
	 * @param {number} maxRetries - Maximum retry attempts allowed
	 * @returns {boolean} True if the request should be retried, false otherwise
	 * 
	 * @example
	 * // Internal usage within _handleRetries()
	 * const shouldRetry = this._shouldRetry(lastResponse, retryConfig, attempt, maxRetries);
	 * if (!shouldRetry) {
	 *   break; // Exit retry loop
	 * }
	 */
	_shouldRetry(response, retryConfig, currentAttempt, maxRetries) {
		// No more retries available
		if (currentAttempt >= maxRetries) {
			return false;
		}
		
		const retryOn = retryConfig.retryOn || {};
		
		// Check for network errors (no response)
		if (!response && retryOn.networkError !== false) {
			return true;
		}
		
		// Check for empty/null body
		if (retryOn.emptyResponse !== false && 
			(response.body === null || response.body === "")) {
			return true;
		}
		
		// Check for server errors (5xx)
		if (retryOn.serverError !== false && 
			response.statusCode >= 500 && response.statusCode < 600) {
			return true;
		}
		
		// Check for client errors (4xx) - default is NOT to retry
		if (retryOn.clientError === true && 
			response.statusCode >= 400 && response.statusCode < 500) {
			return true;
		}
		
		// Try to parse JSON if it's expected to be JSON
		if (retryOn.parseError !== false && response.body) {
			try {
				JSON.parse(response.body);
			} catch (error) {
				return true;
			}
		}
		
		return false;
	}

	/**
	 * Handle pagination for API responses. This private method automatically retrieves
	 * all pages of results from a paginated API and combines them into a single response.
	 * 
	 * @private
	 * @param {object} initialResponse - Initial API response from the first request
	 * @param {boolean} initialResponse.success - Whether the initial request was successful
	 * @param {number} initialResponse.statusCode - HTTP status code
	 * @param {string} initialResponse.body - Response body (JSON string)
	 * @param {object} initialResponse.headers - Response headers
	 * @returns {Promise<{response: object, metadata: object}>} Promise resolving to combined response and pagination metadata
	 * @returns {object} return.response - The combined response with all pages
	 * @returns {boolean} return.response.success - Whether pagination was successful
	 * @returns {number} return.response.statusCode - HTTP status code
	 * @returns {string} return.response.body - Combined response body with all items
	 * @returns {object} return.metadata - Metadata about pagination
	 * @returns {object} return.metadata.pagination - Pagination information
	 * @returns {boolean} return.metadata.pagination.occurred - Whether pagination occurred
	 * @returns {number} [return.metadata.pagination.totalPages] - Total pages retrieved (if pagination occurred)
	 * @returns {number} [return.metadata.pagination.totalItems] - Total items returned (if pagination occurred)
	 * @returns {boolean} [return.metadata.pagination.incomplete] - Whether pagination was incomplete due to errors
	 * @returns {string|null} [return.metadata.pagination.error] - Error message if pagination was incomplete
	 * 
	 * @example
	 * // Internal usage within send_get()
	 * const { response: finalResponse, metadata: paginationMetadata } = 
	 *   await this._handlePagination(response);
	 * if (paginationMetadata.pagination.occurred) {
	 *   console.log(`Retrieved ${paginationMetadata.pagination.totalItems} items from ${paginationMetadata.pagination.totalPages} pages`);
	 * }
	 */
	async _handlePagination(initialResponse) {
		const paginationConfig = this.#request.pagination || { enabled: false };
		
		// If pagination not enabled or initial request failed, return as-is
		if (!paginationConfig.enabled || !initialResponse.success) {
			return {
				response: initialResponse,
				metadata: { pagination: { occurred: false } }
			};
		}
		
		// Parse body to check for pagination indicators
		let body;
		try {
			body = JSON.parse(initialResponse.body);
		} catch (error) {
			// Can't paginate if body isn't JSON
			return {
				response: initialResponse,
				metadata: { pagination: { occurred: false } }
			};
		}
		
		const {
			totalItemsLabel = 'totalItems',
			itemsLabel = 'items',
			offsetLabel = 'offset',
			limitLabel = 'limit',
			continuationTokenLabel = null,
			responseReturnCountLabel = 'returnedItemCount',
			defaultLimit = 200,
			batchSize = 5
		} = paginationConfig;
		
		// Check if response has pagination indicators
		if (!(totalItemsLabel in body) || !(itemsLabel in body)) {
			return {
				response: initialResponse,
				metadata: { pagination: { occurred: false } }
			};
		}
		
		// Check if we're already on a paginated request (offset > 0)
		if (offsetLabel in this.#request.parameters && 
			this.#request.parameters[offsetLabel] > 0) {
			return {
				response: initialResponse,
				metadata: { pagination: { occurred: false } }
			};
		}
		
		const limit = this.#request.parameters[limitLabel] || defaultLimit;
		const totalRecords = body[totalItemsLabel];
		
		// Calculate offsets for remaining pages
		const offsets = [];
		for (let offset = limit; offset < totalRecords; offset += limit) {
			offsets.push(offset);
		}
		
		// If no more pages, return initial response
		if (offsets.length === 0) {
			return {
				response: initialResponse,
				metadata: { pagination: { occurred: false } }
			};
		}
		
		// Fetch remaining pages in batches
		const allResults = [];
		let incomplete = false;
		let paginationError = null;
		
		for (let i = 0; i < offsets.length; i += batchSize) {
			const batchOffsets = offsets.slice(i, i + batchSize);
			const batchPromises = batchOffsets.map(offset => 
				this._fetchPage(offset, offsetLabel, limitLabel)
			);
			
			try {
				const batchResults = await Promise.all(batchPromises);
				allResults.push(...batchResults);
			} catch (error) {
				incomplete = true;
				paginationError = error.message;
				DebugAndLog.warn(`Pagination incomplete: ${error.message}`);
				break;
			}
		}
		
		// Combine all results
		const allRecords = [
			...body[itemsLabel],
			...allResults.flatMap(result => {
				if (!result || !result.body) {
					incomplete = true;
					return [];
				}
				try {
					const pageBody = JSON.parse(result.body);
					return pageBody[itemsLabel] || [];
				} catch (error) {
					incomplete = true;
					return [];
				}
			})
		];
		
		// Build combined response
		const combinedBody = {
			...body,
			[itemsLabel]: allRecords
		};
		
		// Clean up pagination parameters from response
		delete combinedBody[offsetLabel];
		delete combinedBody[limitLabel];
		combinedBody[responseReturnCountLabel] = allRecords.length;
		
		const combinedResponse = {
			...initialResponse,
			body: JSON.stringify(combinedBody)
		};
		
		return {
			response: combinedResponse,
			metadata: {
				pagination: {
					occurred: true,
					totalPages: allResults.length + 1,
					totalItems: allRecords.length,
					incomplete: incomplete,
					error: paginationError
				}
			}
		};
	}

	/**
	 * Fetch a single page of paginated results. This private method creates a new
	 * APIRequest instance for a specific page offset and retrieves that page's data.
	 * If X-Ray is available, it creates a subsegment to track the page request.
	 * 
	 * @private
	 * @param {number} offset - Offset value for this page (e.g., 200, 400, 600)
	 * @param {string} offsetLabel - Parameter name for offset in the API (e.g., 'offset', 'skip')
	 * @param {string} limitLabel - Parameter name for limit in the API (e.g., 'limit', 'take')
	 * @returns {Promise<object>} Promise resolving to the page response
	 * @returns {boolean} return.success - Whether the page request was successful
	 * @returns {number} return.statusCode - HTTP status code
	 * @returns {string} return.body - Page response body (JSON string)
	 * @returns {object} return.headers - Response headers
	 * 
	 * @example
	 * // Internal usage within _handlePagination()
	 * const pageResponse = await this._fetchPage(200, 'offset', 'limit');
	 * const pageBody = JSON.parse(pageResponse.body);
	 * const pageItems = pageBody.items;
	 */
	async _fetchPage(offset, offsetLabel, limitLabel) {
		// Clone the current request
		const pageRequest = {
			...this.#request,
			parameters: {
				...this.#request.parameters,
				[offsetLabel]: offset
			},
			note: `${this.#request.note} [Offset ${offset}]`,
			// Disable pagination for sub-requests to avoid infinite loops
			pagination: { enabled: false },
			// Keep retry configuration
			retry: this.#request.retry
		};
		
		// Create subsegment for this paginated request if X-Ray is available
		if (AWSXRay) {
			const subsegmentName = `APIRequest/${this.getHost()}/Page-${offset}`;
			
			return await AWSXRay.captureAsyncFunc(subsegmentName, async (subsegment) => {
				try {
					subsegment.namespace = 'remote';
					
					// Add page metadata to subsegment
					subsegment.addAnnotation('page_offset', offset);
					subsegment.addAnnotation('request_host', this.getHost());
					subsegment.addAnnotation('request_note', pageRequest.note);
					subsegment.addMetadata('page_info', {
						offset: offset,
						offsetLabel: offsetLabel,
						limitLabel: limitLabel,
						parentNote: this.#request.note
					});
					
					// Create new APIRequest instance for this page
					const pageApiRequest = new APIRequest(pageRequest);
					const response = await pageApiRequest.send();
					
					subsegment.addAnnotation('success', response.success ? "true" : "false");
					subsegment.addAnnotation('status_code', response?.statusCode || 500);
					
					return response;
				} catch (error) {
					DebugAndLog.error(`Error fetching page at offset ${offset}: ${error.message}`, error.stack);
					subsegment.addError(error);
					throw error;
				} finally {
					subsegment.close();
				}
			});
		} else {
			// No X-Ray available, just create and send the request
			const pageApiRequest = new APIRequest(pageRequest);
			return await pageApiRequest.send();
		}
	}

	/**
	 * Clears out any redirects, completion flag, and response
	 */
	resetRequest() {
		this.#redirects = [];
		this.#requestComplete = false;
		this.#response = null;
	};

	/**
	 * Set the uri of the request
	 * @param {string} newURI 
	 */
	updateRequestURI(newURI) {
		this.#request.uri = newURI;
	};

	/**
	 * Add a redirect uri to the stack
	 * @param {string} uri 
	 */
	addRedirect(uri) {
		this.#redirects.push(uri);
		this.updateRequestURI(uri);
	};
	
	/**
	 * 
	 * @returns {number} Number of redirects currently experienced for this request
	 */
	getNumberOfRedirects() {
		return this.#redirects.length;
	};

	/**
	 * When the request is complete, set the response and mark as complete
	 * @param {object} response 
	 */
	setResponse(response) {
		this.#requestComplete = true;
		this.#response = response;
	};

	/**
	 * @param {boolean} includeQueryString Whether or not to include the query string in the URI - For logging purposes when you don't want to include sensitive information
	 * @returns {string} The current URI of the request
	 */
	getURI(includeQueryString = true) {
		return (includeQueryString) ? this.#request.uri : this.#request.uri.split("?")[0];
	};

	/**
	 * 
	 * @returns {string|null} The body of a post request
	 */
	getBody() {
		return this.#request.body;
	};

	/**
	 * 
	 * @returns {string} The request method
	 */
	getMethod() {
		return this.#request.method;
	};

	/**
	 * 
	 * @returns {string} A note for troubleshooting and tracing the request
	 */
	getNote() {
		return this.#request.note;
	};

	/**
	 * 
	 * @returns {number} ClientRequest timout in milliseconds
	 */
	getTimeOutInMilliseconds() {
		return this.#request.options.timeout;
	};

	/**
	 * 
	 * @returns {string} The host domain submitted for the request
	 */
	getHost() {
		return (new URL(this.getURI())).host;
	};

	/**
	 * Send the request. This method dispatches the request based on the HTTP method
	 * (GET or POST). It automatically handles pagination and retries if configured.
	 * 
	 * @returns {Promise<object>} Promise resolving to the response object
	 * @returns {boolean} return.success - Whether the request was successful
	 * @returns {number} return.statusCode - HTTP status code
	 * @returns {object} return.headers - Response headers
	 * @returns {string} return.body - Response body
	 * @returns {string} return.message - Response message
	 * @returns {object} [return.metadata] - Optional metadata (present if pagination or retries occurred)
	 * @returns {object} [return.metadata.retries] - Retry metadata (if retries occurred)
	 * @returns {boolean} return.metadata.retries.occurred - Whether retries occurred
	 * @returns {number} return.metadata.retries.attempts - Total attempts made
	 * @returns {number} return.metadata.retries.finalAttempt - Which attempt succeeded
	 * @returns {object} [return.metadata.pagination] - Pagination metadata (if pagination occurred)
	 * @returns {boolean} return.metadata.pagination.occurred - Whether pagination occurred
	 * @returns {number} return.metadata.pagination.totalPages - Total pages retrieved
	 * @returns {number} return.metadata.pagination.totalItems - Total items returned
	 * @returns {boolean} return.metadata.pagination.incomplete - Whether pagination was incomplete
	 * @returns {string|null} return.metadata.pagination.error - Error message if incomplete
	 * 
	 * @example
	 * // Basic request
	 * const apiRequest = new APIRequest({ host: 'api.example.com', path: '/users' });
	 * const response = await apiRequest.send();
	 * console.log(response.body);
	 * 
	 * @example
	 * // Request with pagination
	 * const apiRequest = new APIRequest({
	 *   host: 'api.example.com',
	 *   path: '/data',
	 *   pagination: { enabled: true }
	 * });
	 * const response = await apiRequest.send();
	 * if (response.metadata?.pagination?.occurred) {
	 *   console.log(`Retrieved ${response.metadata.pagination.totalItems} items`);
	 * }
	 * 
	 * @example
	 * // Request with retry
	 * const apiRequest = new APIRequest({
	 *   host: 'api.example.com',
	 *   path: '/data',
	 *   retry: { enabled: true, maxRetries: 2 }
	 * });
	 * const response = await apiRequest.send();
	 * if (response.metadata?.retries?.occurred) {
	 *   console.log(`Succeeded after ${response.metadata.retries.attempts} attempts`);
	 * }
	 */
	async send() {

		this.resetRequest();

		var response = null;

		switch (this.#request.method) {
			case "GET":
				response = await this.send_get();
				break;
			case "POST":
				response = await this.send_get(); // this.method should already be set and is all it needs
				break;
			default:
				break; // PUT, DELETE, etc not yet implemented
		}

		return response;
	}

	/**
	 * Process the request with GET or POST method. This method handles the actual
	 * HTTP request execution, including retry logic, pagination, and X-Ray tracing.
	 * It creates unique X-Ray subsegments for each request and includes metadata
	 * about retries and pagination in the subsegment annotations.
	 * 
	 * @returns {Promise<object>} Promise resolving to the response object
	 * @returns {boolean} return.success - Whether the request was successful
	 * @returns {number} return.statusCode - HTTP status code
	 * @returns {object} return.headers - Response headers
	 * @returns {string} return.body - Response body
	 * @returns {string} return.message - Response message
	 * @returns {object} [return.metadata] - Optional metadata (present if pagination or retries occurred)
	 * @returns {object} [return.metadata.retries] - Retry metadata (if retries occurred)
	 * @returns {object} [return.metadata.pagination] - Pagination metadata (if pagination occurred)
	 * 
	 * @example
	 * // Internal usage - typically called via send()
	 * const response = await this.send_get();
	 * 
	 * @example
	 * // Response with retry metadata
	 * const response = await this.send_get();
	 * // response.metadata.retries = { occurred: true, attempts: 2, finalAttempt: 2 }
	 * 
	 * @example
	 * // Response with pagination metadata
	 * const response = await this.send_get();
	 * // response.metadata.pagination = { occurred: true, totalPages: 5, totalItems: 1000, incomplete: false, error: null }
	 */
	async send_get() {

		return new Promise (async (resolve) => {
			// https://stackoverflow.com/questions/41470296/how-to-await-and-return-the-result-of-a-http-request-so-that-multiple-request

			// https://nodejs.org/api/https.html#https_https_request_url_options_callback
			// https://usefulangle.com/post/170/nodejs-synchronous-http-request
				
			try {
				
				if ( "note" in this.#request ) {
					DebugAndLog.msg("Sending request for: "+this.#request.note);
				}

				// create the options object, use either options passed in, or an empty one
				let options = ( this.#request.options !== null) ? this.#request.options : {};

				// add the request headers to options
				if ( this.#request.headers !== null ) {
					options.headers = this.#request.headers;
				}

				// add the request method to options (default is GET)
				if ( this.#request.method === null || this.#request.method === "") {
					this.#request.method = "GET";
				}
				options.method = this.#request.method;

				try {

					// we will want to follow redirects, so keep submitting until considered complete
					if (AWSXRay) {

						// Use timestamp to ensure unique subsegment names for each request
						const subsegmentName = `APIRequest/${this.getHost()}/${Date.now()}`;

						await AWSXRay.captureAsyncFunc(subsegmentName, async (subsegment) => {

							try {

								subsegment.namespace = 'remote';

								// Add searchable annotations
								subsegment.addAnnotation('request_method', this.getMethod());
								subsegment.addAnnotation('request_host', this.getHost());
								subsegment.addAnnotation('request_uri', this.getURI(false));
								subsegment.addAnnotation('request_note', this.getNote());

								// Add retry configuration to subsegment metadata (if enabled)
								if (this.#request.retry?.enabled) {
									subsegment.addMetadata('retry_config', this.#request.retry);
								}

								// Add pagination configuration to subsegment metadata (if enabled)
								if (this.#request.pagination?.enabled) {
									subsegment.addMetadata('pagination_config', this.#request.pagination);
								}

								// Use retry handler which handles redirects internally
								const { response, metadata: retryMetadata } = await this._handleRetries(options, subsegment);

								// Add retry metadata to subsegment annotations and metadata
								if (retryMetadata.retries?.occurred) {
									subsegment.addAnnotation('retry_attempts', retryMetadata.retries.attempts);
									subsegment.addMetadata('retry_details', retryMetadata.retries);
								}

								// Handle pagination if enabled
								const { response: finalResponse, metadata: paginationMetadata } = 
									await this._handlePagination(response);

								// Add pagination metadata to subsegment annotations and metadata
								if (paginationMetadata.pagination?.occurred) {
									subsegment.addAnnotation('pagination_pages', paginationMetadata.pagination.totalPages);
									subsegment.addAnnotation('pagination_items', paginationMetadata.pagination.totalItems);
									subsegment.addMetadata('pagination_details', paginationMetadata.pagination);
								}

								// Store final response and combined metadata
								this.#response = finalResponse;
								this.#responseMetadata = {
									...retryMetadata,
									...paginationMetadata
								};

								subsegment.addAnnotation('success', finalResponse.success ? "true" : "false");
								subsegment.addAnnotation('status_code', finalResponse?.statusCode || 500);
								subsegment.addAnnotation('note', this.getNote());
								
								return true;
							} catch (error) {
								DebugAndLog.error(`Error in APIRequest call to remote endpoint (${this.getNote()}): ${error.message}`, error.stack);
								subsegment.addError(error);
								throw error;
							} finally {
								subsegment.close();
							}
						});
					} else {
						// Use retry handler which handles redirects internally
						const { response, metadata: retryMetadata } = await this._handleRetries(options, xRayProxy);

						// Handle pagination if enabled
						const { response: finalResponse, metadata: paginationMetadata } = 
							await this._handlePagination(response);

						// Store final response and combined metadata
						this.#response = finalResponse;
						this.#responseMetadata = {
							...retryMetadata,
							...paginationMetadata
						};
					}

					// Add metadata to response if retries or pagination occurred
					if (this.#responseMetadata) {
						const hasRetries = this.#responseMetadata.retries?.occurred === true;
						const hasPagination = this.#responseMetadata.pagination?.occurred === true;
						
						if (hasRetries || hasPagination) {
							// Create response with metadata
							const responseWithMetadata = {
								...this.#response,
								metadata: {}
							};
							
							// Add retry metadata if retries occurred
							if (hasRetries) {
								responseWithMetadata.metadata.retries = this.#responseMetadata.retries;
							}
							
							// Add pagination metadata if pagination occurred
							if (hasPagination) {
								responseWithMetadata.metadata.pagination = this.#responseMetadata.pagination;
							}
							
							resolve(responseWithMetadata);
							return;
						}
					}

					// we now have a completed response (without metadata)
					resolve( this.#response );
				}
				catch (error) {
					DebugAndLog.error(`Error in APIRequest call to _httpGetExecute (${this.getNote()}): ${error.message}`, error.stack);
					resolve(APIRequest.responseFormat(false, 500, "Error during send request"));
				}				
			} catch (error) {
				DebugAndLog.error(`API error while trying request for host ${this.getHost()} ${this.getNote()} ${error.message}`, { APIRequest: this.toObject(), trace: error.stack } );
				resolve(APIRequest.responseFormat(false, 500, "Error during send request"));
			
			}
		});	
					

	};

	/**
	 * Get information about the ClientRequest and the Response including
	 * any redirects encountered, the request and response objects,
	 * whether or not the request was sent, and the max number of
	 * redirects allowed.
	 * @returns { {MAX_REDIRECTS: number, request: object, requestComplete: boolean, redirects: Array<string>, response: object}} Information about the request
	 */
	toObject() {

		return {
			MAX_REDIRECTS: APIRequest.MAX_REDIRECTS,
			request: this.#request,
			requestComplete: this.#requestComplete,
			redirects: this.#redirects,
			response: this.#response
		};

	};

	/**
	 * Formats the response for returning to program logic. When pagination or retry
	 * features are used, the response may include an optional metadata field with
	 * details about those operations.
	 * 
	 * @param {boolean} [success=false] - Whether the request was successful
	 * @param {number} [statusCode=0] - HTTP status code
	 * @param {string|null} [message=null] - Response message
	 * @param {object|null} [headers=null] - Response headers
	 * @param {string|null} [body=null] - Response body
	 * @returns {object} Formatted response object
	 * @returns {boolean} return.success - Whether the request was successful
	 * @returns {number} return.statusCode - HTTP status code
	 * @returns {object|null} return.headers - Response headers
	 * @returns {string|null} return.body - Response body
	 * @returns {string|null} return.message - Response message
	 * 
	 * @example
	 * // Basic response format
	 * const response = APIRequest.responseFormat(true, 200, "SUCCESS", headers, body);
	 * // { success: true, statusCode: 200, headers: {...}, body: "...", message: "SUCCESS" }
	 * 
	 * @example
	 * // Error response format
	 * const response = APIRequest.responseFormat(false, 500, "Internal Server Error");
	 * // { success: false, statusCode: 500, headers: null, body: null, message: "Internal Server Error" }
	 * 
	 * @example
	 * // Response with metadata (added by send() method when pagination/retry occurs)
	 * // Note: metadata is NOT added by this static method, but by the send() method
	 * const response = await apiRequest.send();
	 * // {
	 * //   success: true,
	 * //   statusCode: 200,
	 * //   headers: {...},
	 * //   body: "...",
	 * //   message: "SUCCESS",
	 * //   metadata: {
	 * //     retries: { occurred: true, attempts: 2, finalAttempt: 2 },
	 * //     pagination: { occurred: true, totalPages: 5, totalItems: 1000, incomplete: false, error: null }
	 * //   }
	 * // }
	 */
	static responseFormat(success = false, statusCode = 0, message = null, headers = null, body = null) {
		
		return {
			success: success,
			statusCode: statusCode,
			headers: headers,
			body: body,
			message: message
		};
	};
};

module.exports = APIRequest;
