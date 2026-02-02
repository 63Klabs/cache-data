
const jsonGenericResponse = require('./generic.response.json');
const htmlGenericResponse = require('./generic.response.html');
const rssGenericResponse = require('./generic.response.rss');
const xmlGenericResponse = require('./generic.response.xml');
const textGenericResponse = require('./generic.response.text');
const ClientRequest = require('./ClientRequest.class');
const DebugAndLog = require('./DebugAndLog.class');

/**
 * Response class for creating and managing HTTP responses with support for multiple content types.
 * Provides methods to build, customize, and finalize responses for Lambda functions or web services.
 * Supports JSON, HTML, XML, RSS, and TEXT content types with automatic content type detection.
 * 
 * @class Response
 * @example
 * // Create a JSON response
 * const response = new Response(clientRequest);
 * response.setStatusCode(200);
 * response.setBody({ message: 'Success', data: results });
 * return response.finalize();
 * 
 * @example
 * // Initialize Response class with custom settings
 * Response.init({
 *   settings: {
 *     errorExpirationInSeconds: 180,
 *     routeExpirationInSeconds: 3600,
 *     contentType: Response.CONTENT_TYPE.JSON
 *   }
 * });
 */
class Response {

	static #isInitialized = false;

	static #jsonResponses = jsonGenericResponse;
	static #htmlResponses = htmlGenericResponse;
	static #rssResponses = rssGenericResponse;
	static #xmlResponses = xmlGenericResponse;
	static #textResponses = textGenericResponse;

	static CONTENT_TYPE = {
		JSON: Response.#jsonResponses.contentType,
		HTML: Response.#htmlResponses.contentType,
		XML: Response.#xmlResponses.contentType,
		RSS: Response.#rssResponses.contentType,
		TEXT: Response.#textResponses.contentType,
		JAVASCRIPT: 'application/javascript',
		CSS: 'text/css',
		CSV: 'text/csv'
	};

	static #settings = {
		errorExpirationInSeconds: (60 * 3),
		routeExpirationInSeconds: 0,
		contentType: Response.CONTENT_TYPE.JSON
	};

	_clientRequest = null;
	_statusCode = 200;
	_headers = {};
	_body = null;

	/**
	 * Creates a new Response instance.
	 * 
	 * @param {ClientRequest} clientRequest - The client request object associated with this response
	 * @param {{statusCode: number, headers: Object, body: string|number|Object|Array}} [obj={}] - Initial response structure
	 * @param {string} [contentType=null] - Content type for the response (e.g., Response.CONTENT_TYPE.JSON)
	 * @example
	 * const response = new Response(clientRequest, { statusCode: 200, body: { success: true } });
	 * 
	 * @example
	 * const response = new Response(clientRequest, {}, Response.CONTENT_TYPE.HTML);
	 */
	constructor(clientRequest, obj = {}, contentType = null) {
		this._clientRequest = clientRequest;
		this.reset(obj, contentType);
	};

	/**
	 * @typedef statusResponseObject
	 * @property {number} statusCode
	 * @property {object} headers
	 * @property {object|array} body
	 */

	/**
	 * Initializes the Response class with custom settings and response templates.
	 * Should be called once during application initialization, typically in Config.init() or at the top of index.js.
	 * 
	 * @param {Object} options - Configuration options with settings, jsonResponses, htmlResponses, xmlResponses, rssResponses, and textResponses properties
	 * @returns {void}
	 * @example
	 * Response.init({
	 *   settings: {
	 *     errorExpirationInSeconds: 300,
	 *     routeExpirationInSeconds: 3600,
	 *     contentType: Response.CONTENT_TYPE.JSON
	 *   },
	 *   jsonResponses: {
	 *     response404: {
	 *       statusCode: 404,
	 *       headers: { 'Content-Type': 'application/json' },
	 *       body: { error: 'Resource not found' }
	 *     }
	 *   }
	 * });
	 */
	static init = (options) => {
		if (!Response.#isInitialized) {

			Response.#isInitialized = true;

			if ( options?.settings ) {
				// merge settings using assign object
				//this.#settings = Object.assign({}, Response.#settings, options.settings);
				Response.#settings = { ...Response.#settings, ...options.settings };
			}
			if ( options?.jsonResponses ) {
				// merge settings using assign object
				//Response.#jsonResponses = Object.assign({}, Response.#jsonResponses, options.jsonResponses);
				Response.#jsonResponses = { ...Response.#jsonResponses, ...options.jsonResponses };
			}

			if ( options?.htmlResponses ) {
				// merge settings using assign object
				//Response.#htmlResponses = Object.assign({}, Response.#htmlResponses, options.htmlResponses);
				Response.#htmlResponses = { ...Response.#htmlResponses, ...options.htmlResponses };
			}
			
			if ( options?.xmlResponses ) {
				// merge settings using assign object
				//Response.#xmlResponses = Object.assign({}, Response.#xmlResponses, options.xmlResponses);
				Response.#htmlResponses = { ...Response.#xmlResponses, ...options.xmlResponses };
			}

			if ( options?.rssResponses ) {
				// merge settings using assign object
				//Response.#rssResponses = Object.assign({}, Response.#rssResponses, options.rssResponses);
				Response.#rssResponses = { ...Response.#rssResponses, ...options.rssResponses };
			}

			if ( options?.textResponses ) {
				// merge settings using assign object
				//Response.#textResponses = Object.assign({}, Response.#textResponses, options.textResponses);
				Response.#textResponses = { ...Response.#textResponses, ...options.textResponses };
			}
		}

	};

	/**
	 * Resets all properties of the response to default values except those specified in the object.
	 * ClientRequest cannot be reset. Uses generic response templates based on status code.
	 * 
	 * @param {{statusCode: number|string, headers: Object, body: string|number|Object|Array}} obj - Properties to set after reset
	 * @param {string} [contentType=null] - Content type (use Response.CONTENT_TYPE values)
	 * @returns {void}
	 * @example
	 * response.reset({ statusCode: 404 });
	 * 
	 * @example
	 * response.reset({ statusCode: 200, body: { data: results } }, Response.CONTENT_TYPE.JSON);
	 */
	reset = (obj, contentType = null) => {

		let newObj = {};

		newObj.statusCode = obj?.statusCode ?? 200;

		if (contentType === null) {
			const result = Response.inspectContentType(obj);
			contentType = (result !== null) ? result : Response.#settings.contentType;
		}

		const genericResponses = Response.getGenericResponses(contentType);

		newObj.headers = obj?.headers ?? genericResponses.response(newObj.statusCode).headers;
		newObj.body = obj?.body ?? genericResponses.response(newObj.statusCode).body;

		this.set(newObj, contentType);
	};

	/**
	 * Sets properties of the response, overwriting only the supplied properties.
	 * Use reset() to clear all properties. ClientRequest cannot be set.
	 * 
	 * @param {{statusCode: number|string, headers: Object, body: string|number|Object|Array}} obj - Properties to set
	 * @param {string} [contentType=null] - Content type (use Response.CONTENT_TYPE values)
	 * @returns {void}
	 * @example
	 * response.set({ statusCode: 201, body: { id: newId } });
	 * 
	 * @example
	 * response.set({ headers: { 'X-Custom-Header': 'value' } });
	 */
	set = (obj, contentType = null) => {

		if (contentType === null) {
			const result = Response.inspectContentType(obj);
			const thisResult = this.inspectContentType();
			contentType = result || thisResult || Response.#settings.contentType;
		}

		if (obj?.statusCode) this._statusCode = parseInt(obj.statusCode);
		if (obj?.headers) this._headers = obj.headers;
		if (obj?.body) this._body = obj.body;

		this.addHeader('Content-Type', contentType);
	}

	/**
	 * Gets the current status code of the response.
	 * 
	 * @returns {number} Current status code
	 * @example
	 * const statusCode = response.getStatusCode();
	 * console.log(`Response status: ${statusCode}`);
	 */
	getStatusCode = () => {
		return this._statusCode;
	};

	/**
	 * Gets the current headers of the response.
	 * 
	 * @returns {Object} Current headers object
	 * @example
	 * const headers = response.getHeaders();
	 * console.log(headers['Content-Type']);
	 */
	getHeaders = () => {
		return this._headers;
	};

	/**
	 * Gets the current body of the response.
	 * 
	 * @returns {Object|Array|string|number|null} Current body content
	 * @example
	 * const body = response.getBody();
	 * console.log(body);
	 */
	getBody = () => {
		return this._body;
	};

	/**
	 * Gets the default content type from settings.
	 * 
	 * @returns {string} Default content type string
	 * @example
	 * const contentType = Response.getContentType();
	 * console.log(`Default content type: ${contentType}`);
	 */
	static getContentType() {
		return Response.#settings.contentType;
	};

	/**
	 * Gets the error expiration time in seconds from settings.
	 * 
	 * @returns {number} Error expiration time in seconds
	 * @example
	 * const expiration = Response.getErrorExpirationInSeconds();
	 * console.log(`Error cache expires in ${expiration} seconds`);
	 */
	static getErrorExpirationInSeconds() {
		return Response.#settings.errorExpirationInSeconds;
	};
	
	/**
	 * Gets the route expiration time in seconds from settings.
	 * 
	 * @returns {number} Route expiration time in seconds
	 * @example
	 * const expiration = Response.getRouteExpirationInSeconds();
	 * console.log(`Route cache expires in ${expiration} seconds`);
	 */
	static getRouteExpirationInSeconds() {
		return Response.#settings.routeExpirationInSeconds;
	};

	/**
	 * Inspects the body and headers to determine the content type.
	 * Checks headers first, then body content.
	 * 
	 * @param {{headers: Object, body: Object|Array|string|number|null}} obj - Object to inspect
	 * @returns {string|null} The determined content type, or null if cannot be determined
	 * @example
	 * const contentType = Response.inspectContentType({ 
	 *   headers: { 'Content-Type': 'application/json' }, 
	 *   body: { data: 'test' } 
	 * });
	 */
	static inspectContentType = (obj) => {
		const headerResult = Response.inspectHeaderContentType(obj.headers);
		const bodyResult = Response.inspectBodyContentType(obj.body);
		return (headerResult !== null) ? headerResult : bodyResult;
	}

	/**
	 * Inspects the body to determine the content type based on content.
	 * Detects HTML, RSS, XML, TEXT, or JSON based on body structure.
	 * 
	 * @param {Object|Array|string|number|null} body - Body content to inspect
	 * @returns {string|null} The determined content type, or null if body is null
	 * @example
	 * const contentType = Response.inspectBodyContentType('<html></html>');
	 * // Returns Response.CONTENT_TYPE.HTML
	 */
	static inspectBodyContentType = (body) => {
		if (body !== null) {
			if (typeof body === 'string') {
				if (body.includes('</html>')) {
					return Response.CONTENT_TYPE.HTML;
				} else if (body.includes('</rss>')) {
					return Response.CONTENT_TYPE.RSS;
				} else if (body.includes('<?xml')) {
					return Response.CONTENT_TYPE.XML;
				} else {
					return Response.CONTENT_TYPE.TEXT;
				}
			} else {
				return Response.CONTENT_TYPE.JSON;
			}
		}
		return null;
	}

	/**
	 * Inspects the headers to determine the content type.
	 * 
	 * @param {Object} headers - Headers object to inspect
	 * @returns {string|null} The content type from headers, or null if not found
	 * @example
	 * const contentType = Response.inspectHeaderContentType({ 'Content-Type': 'application/json' });
	 */
	static inspectHeaderContentType = (headers) => {
		return (headers && 'Content-Type' in headers ? headers['Content-Type'] : null);
	}

	/**
	 * Inspects this response's content type by checking headers and body.
	 * 
	 * @returns {string|null} The determined content type, or null if cannot be determined
	 * @example
	 * const contentType = response.inspectContentType();
	 */
	inspectContentType = () => {
		return Response.inspectContentType({headers: this._headers, body: this._body});
	}

	/**
	 * Inspects this response's body to determine content type.
	 * 
	 * @returns {string|null} Content type determined from the current body
	 * @example
	 * response.setBody({ data: 'test' });
	 * const contentType = response.inspectBodyContentType();
	 * // Returns Response.CONTENT_TYPE.JSON
	 */
	inspectBodyContentType = () => {
		return Response.inspectBodyContentType(this._body);
	}

	/**
	 * Inspects this response's headers to determine content type.
	 * 
	 * @returns {string|null} Content type determined from the current headers
	 * @example
	 * const contentType = response.inspectHeaderContentType();
	 */
	inspectHeaderContentType = () => {
		return Response.inspectHeaderContentType(this._headers);
	}

	/**
	 * Gets the current content type of the response by inspecting headers and body.
	 * Returns the default content type from settings if none is determined.
	 * 
	 * @returns {string} Content type string value
	 * @example
	 * const contentType = response.getContentType();
	 * console.log(`Response content type: ${contentType}`);
	 */
	getContentType = () => {
		// Default content type is JSON
		let defaultContentType = Response.#settings.contentType;
		let contentType = this.inspectContentType();
		if (contentType === null) {
			contentType = defaultContentType;
		}
		return contentType;
	};
	
	/**
	 * Gets the content type code (key) for the response.
	 * Returns the key from CONTENT_TYPE object that matches the current content type.
	 * 
	 * @returns {string} Content type code (e.g., 'JSON', 'HTML', 'XML')
	 * @example
	 * const code = response.getContentTypeCode();
	 * // Returns 'JSON' if content type is 'application/json'
	 */
	getContentTypeCode = () => {
		const contentTypeStr = this.getContentType();
		const contentTypeCodes = Object.keys(Response.CONTENT_TYPE);
		// loop through CONTENT_TYPE and find the index of the contentTypeStr
		for (let i = 0; i < contentTypeCodes.length; i++) {
			if (Response.CONTENT_TYPE[contentTypeCodes[i]] === contentTypeStr) {
				return contentTypeCodes[i];
			}
		}
	}

	/**
	 * Sets the status code of the response, overwriting the current value.
	 * 
	 * @param {number} statusCode - HTTP status code (e.g., 200, 404, 500)
	 * @returns {void}
	 * @example
	 * response.setStatusCode(201);
	 */
	setStatusCode = (statusCode) => {
		this.set({statusCode: statusCode});
	};

	/**
	 * Sets the headers of the response, overwriting the current headers.
	 * 
	 * @param {Object} headers - Headers object with key-value pairs
	 * @returns {void}
	 * @example
	 * response.setHeaders({ 'Content-Type': 'application/json', 'X-Custom': 'value' });
	 */
	setHeaders = (headers) => {
		this.set({headers: headers});
	};

	/**
	 * Sets the body of the response, overwriting the current body.
	 * 
	 * @param {string|number|Object|Array} body - Response body content
	 * @returns {void}
	 * @example
	 * response.setBody({ message: 'Success', data: results });
	 * 
	 * @example
	 * response.setBody('<html><body>Hello</body></html>');
	 */
	setBody = (body) => {
		this.set({body: body});
	};

	/**
	 * Gets the generic response templates for the specified content type.
	 * Generic responses are either provided by default or loaded during Response.init().
	 * 
	 * @param {string} contentType - Content type (use Response.CONTENT_TYPE values or codes like 'JSON', 'HTML')
	 * @returns {Object} Generic response object with response templates
	 * @throws {Error} If content type is not implemented
	 * @example
	 * const jsonResponses = Response.getGenericResponses(Response.CONTENT_TYPE.JSON);
	 * const response404 = jsonResponses.response(404);
	 */
	static getGenericResponses = (contentType) => {
		if (contentType === Response.CONTENT_TYPE.JSON || contentType === 'JSON') {
			return Response.#jsonResponses;
		} else if (contentType === Response.CONTENT_TYPE.HTML || contentType === 'HTML') {
			return Response.#htmlResponses;
		} else if (contentType === Response.CONTENT_TYPE.RSS || contentType === 'RSS') {
			return Response.#rssResponses;
		} else if (contentType === Response.CONTENT_TYPE.XML || contentType === 'XML') {
			return Response.#xmlResponses;
		} else if (contentType === Response.CONTENT_TYPE.TEXT || contentType === 'TEXT') {
			return Response.#textResponses;
		} else {
			throw new Error(`Content Type: ${contentType} is not implemented for getResponses. Response.CONTENT_TYPES[JSON|HTML|XML|RSS|TEXT] must be used. Perform a custom implementation by extending the Response class.`);
		}
	}

	/**
	 * Adds or updates a header in the response.
	 * If the header exists, its value is updated; otherwise, it's added.
	 * 
	 * @param {string} key - Header name
	 * @param {string} value - Header value
	 * @returns {void}
	 * @example
	 * response.addHeader('X-Request-ID', '12345');
	 * response.addHeader('Cache-Control', 'no-cache');
	 */
	addHeader = (key, value) => {
		this._headers[key] = value;
	};

	/**
	 * Adds properties to the JSON body by merging with existing body.
	 * Only works if the current body is an object.
	 * 
	 * @param {Object} obj - Object with properties to add to the body
	 * @returns {void}
	 * @example
	 * response.setBody({ message: 'Success' });
	 * response.addToJsonBody({ timestamp: Date.now(), version: '1.0' });
	 * // Body is now: { message: 'Success', timestamp: ..., version: '1.0' }
	 */
	addToJsonBody = (obj) => {
		if (typeof this._body === 'object') {
			this._body = Object.assign({}, this._body, obj);
		}
	};

	/**
	 * Converts the response to a plain object.
	 * 
	 * @returns {{statusCode: number, headers: Object, body: null|string|Array|Object}} Response as object
	 * @example
	 * const obj = response.toObject();
	 * console.log(obj.statusCode, obj.headers, obj.body);
	 */
	toObject = () => {
		return {
			statusCode: this._statusCode,
			headers: this._headers,
			body: this._body
		};
	};

	/**
	 * Converts the response to a JSON string.
	 * 
	 * @returns {string} JSON string representation of the response
	 * @example
	 * const jsonString = response.toString();
	 * console.log(jsonString);
	 */
	toString = () => {
		return JSON.stringify(this.toObject());
	};

	/**
	 * Converts the response to an object for JSON.stringify().
	 * Used automatically by JSON.stringify when serializing the response.
	 * 
	 * @returns {{statusCode: number, headers: Object, body: null|string|Array|Object}} Response as object
	 * @example
	 * const json = JSON.stringify(response);
	 */
	toJSON = () => {
		return this.toObject();
	};

	/**
	 * Finalizes and prepares the response for sending to the client.
	 * Handles body stringification, sets appropriate headers (CORS, caching, execution time),
	 * and logs the response to CloudWatch. If body is an object/array, it's stringified.
	 * For JSON responses, string/number bodies are wrapped in an array.
	 * 
	 * @returns {{statusCode: number, headers: Object, body: string}} Finalized response ready for Lambda return
	 * @example
	 * response.setStatusCode(200);
	 * response.setBody({ data: results });
	 * return response.finalize();
	 * 
	 * @example
	 * // Finalize handles errors automatically
	 * response.setBody(new Error('Something failed'));
	 * return response.finalize(); // Returns 500 error response
	 */
	finalize = () => {

		let bodyAsString = null;

		try {
			// if the header response type is not set, determine from contents of body. default to json
			if (!('Content-Type' in this._headers)) {
				this._headers['Content-Type'] = this.getContentType();
			}

			// If body is of type error then set status to 500
			if (this._body instanceof Error) {
				this.reset({statusCode: 500});
			}

			if (this._body !== null) { // we'll keep null as null

				// if response type is JSON we need to make sure we respond with stringified json
				if (this._headers['Content-Type'] === Response.CONTENT_TYPE.JSON) {

					// body is a string or number, place in array (unless the number is 404, then that signifies not found)
					if (typeof this._body === 'string' || typeof this._body === 'number') {
						if (this._body === 404) {
							this.reset({statusCode: 404});
						} else {
							this._body = [this._body];
						}
					}

					// body is presumably an object or array, so stringify
					bodyAsString = JSON.stringify(this._body);

				} else { // if response type is not json we need to respond with a string (or null but we already did a null check)
					bodyAsString = `${this._body}`;
				}
			}
		
		} catch (error) {
			/* Log the error */
			DebugAndLog.error(`Error Finalizing Response: ${error.message}`, error.stack);
			this.reset({statusCode: 500});
			bodyAsString = JSON.stringify(this._body); // we reset to 500 so stringify it
		}

		try {
			if (ClientRequest.requiresValidReferrer()) {
				this.addHeader("Referrer-Policy", "strict-origin-when-cross-origin");
				this.addHeader("Vary", "Origin");
				this.addHeader("Access-Control-Allow-Origin", `https://${this._clientRequest.getClientReferrer()}`);
			} else {
				this.addHeader("Access-Control-Allow-Origin", "*");
			}

			if (this._statusCode >= 400) {
				this.addHeader("Expires", (new Date(Date.now() + ( Response.#settings.errorExpirationInSeconds * 1000))).toUTCString());
				this.addHeader("Cache-Control", "max-age="+Response.#settings.errorExpirationInSeconds);	
			} else if (Response.#settings.routeExpirationInSeconds > 0 ) {
				this.addHeader("Expires", (new Date(Date.now() + ( Response.#settings.routeExpirationInSeconds * 1000))).toUTCString());
				this.addHeader("Cache-Control", "max-age="+Response.#settings.routeExpirationInSeconds);
			}

			this.addHeader('x-exec-ms', `${this._clientRequest.getFinalExecutionTime()}`);

			this._log(bodyAsString);
		} catch (error) {
			DebugAndLog.error(`Error Finalizing Response: Header and Logging Block: ${error.message}`, error.stack);
			this.reset({statusCode: 500});
			bodyAsString = JSON.stringify(this._body); // we reset to 500 so stringify it
		}

		return {
			statusCode: this._statusCode,
			headers: this._headers,
			body: bodyAsString
		};
		
	};
	
	/** 
	 * Logs the ClientRequest and Response to CloudWatch.
	 * Formats a log entry for parsing in CloudWatch Dashboard with fields:
	 * statusCode, bytes, contentType, execms, clientIp, userAgent, origin, referrer, resource, queryKeys, routeLog, queryLog, apiKey.
	 * 
	 * @param {string} bodyAsString - The stringified response body
	 * @returns {void}
	 * @private
	 */
	_log(bodyAsString) {

		try {

			/* These are pushed onto the array in the same order that the CloudWatch
			query is expecting to parse out. 
			-- NOTE: If you add any here, be sure to update the Dashboard template --
			-- that parses response logs in template.yml !!                        --
			-- loggingType, statusCode, bodySize, execTime, clientIP, userAgent, origin, referrer, route, params, key
			*/

			const loggingType = "RESPONSE";
			const statusCode = this._statusCode;
			const bytes = this._body !== null ? Buffer.byteLength(bodyAsString, 'utf8') : 0; // calculate byte size of response.body
			const contentType = this.getContentTypeCode();
			const execms = this._clientRequest.getFinalExecutionTime();
			const clientIp = this._clientRequest.getClientIp();
			const userAgent = this._clientRequest.getClientUserAgent();
			const origin = this._clientRequest.getClientOrigin();
			const referrer = this._clientRequest.getClientReferrer(true);
			const {resource, queryKeys, routeLog, queryLog, apiKey } = this._clientRequest.getRequestLog();

			let logFields = [];
			logFields.push(statusCode);
			logFields.push(bytes);
			logFields.push(contentType);
			logFields.push(execms);
			logFields.push(clientIp);
			logFields.push( (( userAgent !== "" && userAgent !== null) ? userAgent : "-").replace(/|/g, "") ); // doubtful, but userAgent could have | which will mess with log fields
			logFields.push( (( origin !== "" && origin !== null) ? origin : "-") );
			logFields.push( (( referrer !== ""  && referrer !== null) ? referrer : "-") );
			logFields.push(resource); // path includes any path parameter keys (not values)
			logFields.push(queryKeys ? queryKeys : "-"); // just the keys used in query string (no values)
			logFields.push(routeLog ? routeLog : "-"); // custom set routePath with values
			logFields.push(queryLog ? queryLog : "-"); // custom set keys with values
			logFields.push(apiKey ? apiKey : "-");

			/* Join array together into single text string delimited by ' | ' */
			const msg = logFields.join(" | ");

			/* send it to CloudWatch via DebugAndLog.log() */
			DebugAndLog.log(msg, loggingType);

		} catch (error) {
			DebugAndLog.error(`Error Logging Response: ${error.message}`, error.stack);
		}

	};
};

module.exports = Response;