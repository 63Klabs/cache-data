// This file is used to make API requests and handle responses

const https = require('https');
const {AWS, AWSXRay} = require('./AWS.classes.js');
const DebugAndLog = require('./DebugAndLog.class.js');

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
	return new Promise ((resolve, reject) => {

		/*
		Functions/variables we'll use within https.get()
		We need to declare functions that we will be using within https.get()
		"locally" and refer to the requestObject to perform updates
		setResponse() and addRedirect() also performs the resolve() and reject() for the promise
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

								DebugAndLog.debug(`Response status ${res.statusCode}`, {status: res.statusCode, headers: res.headers});

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
 * @example
 * 
 *     async call() {
 * 
 *      var response = null;
 * 
 *         try {
 *             var apiRequest = new tools.APIRequest(this.request);
 *             response = await apiRequest.send();
 * 
 *         } catch (error) {
 *             DebugAndLog.error(`Error in call: ${error.message}`, error.stack);
 *             response = tools.APIRequest.responseFormat(false, 500, "Error in call()");
 *         }
 * 
 *        return response;
 * 
 *     };
 */
class APIRequest {

	static MAX_REDIRECTS = 5;

	#redirects = [];
	#requestComplete = false;
	#response = null;
	#request = null;

	/**
	 * Function used to make an API request utilized directly or from within
	 * a data access object.
	 * 
	 * @param {ConnectionObject} request 
	 */
	constructor(request) {
		this.resetRequest();

		/* We need to have a method, protocol, uri (host/domain), and parameters set 
		Everything else is optional */

		let timeOutInMilliseconds = 8000;

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
			}
		};

		/* if we have a method or protocol passed to us, set them */
		if ( "method" in request && request.method !== "" && request.method !== null) { req.method = request.method.toUpperCase(); }
		if ( "protocol" in request && request.protocol !== "" && request.protocol !== null) { req.protocol = request.protocol.toLowerCase(); }

		if ("body" in request) { req.body = request.body; }
		if ("headers" in request && request.headers !== null) { req.headers = request.headers; }
		if ("note" in request) { req.note = request.note; }

		// With options we want to keep our defaults so we'll use Object.assign
		if ("options" in request && request.options !== null) { req.options = Object.assign(req.options, request.options); }

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
	 * Send the request
	 * @returns {object}
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
	 * Process the request
	 * @returns {object} Response
	 */
	async send_get() {

		return new Promise (async (resolve, reject) => {
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
					while ( !this.#requestComplete ) {
						if (AWSXRay) {

							// async send() {
							// 	const parentSegment = AWSXRay.getSegment();
							// 	const customSegment = new AWSXRay.Segment('APIRequest');
								
							// 	return await AWSXRay.captureAsyncFunc('APIRequest', async (subsegment) => {
							// 		AWSXRay.setSegment(customSegment);
							// 		try {
							// 			// Your custom subsegments here
							// 			subsegment.addAnnotation('host', this.host);
							// 			subsegment.addAnnotation('method', this.method);
										
							// 			const result = await this._performRequest();
							// 			return result;
							// 		} finally {
							// 			AWSXRay.setSegment(parentSegment);
							// 		}
							// 	}, customSegment);
							// }

							const subsegmentName = "APIRequest/" + ((this.getHost()) ? this.getHost() : new URL(this.getURI()).hostname);
							// const parentSegment = AWSXRay.getSegment();
							// const customSegment = new AWSXRay.Segment('APIRequest');

							await AWSXRay.captureAsyncFunc(subsegmentName, async (subsegment) => {
								// AWSXRay.setSegment(subsegment);

								try {

									subsegment.namespace = 'remote';

									// Add searchable annotations
									subsegment.addAnnotation('request_method', this.getMethod());
									subsegment.addAnnotation('request_host', this.getHost());
									subsegment.addAnnotation('request_uri', this.getURI(false));
									subsegment.addAnnotation('request_note', this.getNote());

									const result = await _httpGetExecute(options, this, subsegment);

									subsegment.addAnnotation('success', result ? "true" : "false");
									subsegment.addAnnotation('status_code', this.#response?.statusCode || 500);
									subsegment.addAnnotation('note', this.getNote());
									return result;
								} catch (error) {
									DebugAndLog.error(`Error in APIRequest call to remote endpoint (${this.getNote()}): ${error.message}`, error.stack);
									subsegment.addError(error);
									throw error;
								} finally {
									subsegment.close();
									// AWSXRay.setSegment(parentSegment);
								}
							}/*, customSegment*/);
						} else {
							await _httpGetExecute(options, this);
						}					
					};

					// we now have a completed response
					resolve( this.#response );
				}
				catch (error) {
					DebugAndLog.error(`Error in APIRequest call to _httpGetExecute (${this.getNote()}): ${error.message}`, error.stack);
					reject(APIRequest.responseFormat(false, 500, "Error during send request"));
				}				
			} catch (error) {
				DebugAndLog.error(`API error while trying request for host ${this.getHost()} ${this.getNote()} ${error.message}`, { APIRequest: this.toObject(), trace: error.stack } );
				reject(APIRequest.responseFormat(false, 500, "Error during send request"));
			
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
	 * Formats the response for returning to program logic
	 * @param {boolean} success 
	 * @param {number} statusCode 
	 * @param {string} message 
	 * @param {object} headers 
	 * @param {string} body 
	 * @returns { 
	 * 	 {
	 *  	success: boolean
	 *  	statusCode: number
	 *  	headers: object
	 *  	body: string
	 *  	message: string
	 *   }
	 * }
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
