
const ImmutableObject = require("./ImmutableObject.class");
const ClientIpResolver = require("../utils/ClientIpResolver.class.js");

/* ****************************************************************************
 * ClientRequest Data Model
 * ----------------------------------------------------------------------------
 * 
 * Provides a class that stores information about the request
 * 
 *************************************************************************** */

/**
 * Processes the request from the event data. Parses out
 * client details such as ip and user agent. May be extended
 * to provide custom processing for the application.
 * @example
 * // Basic usage in Lambda handler
 * exports.handler = async (event, context) => {
 *   const requestInfo = new RequestInfo(event);
 *   
 *   // Get client information
 *   const userAgent = requestInfo.getClientUserAgent();
 *   const clientIP = requestInfo.getClientIP();
 *   const referer = requestInfo.getClientReferer();
 *   
 *   console.log(`Request from ${clientIP} using ${userAgent}`);
 *   
 *   // Check if request is valid
 *   if (!requestInfo.isValid()) {
 *     return { statusCode: 400, body: 'Invalid request' };
 *   }
 *   
 *   // Process request...
 * };
 * 
 * @example
 * // Extend RequestInfo for custom processing
 * class CustomRequestInfo extends RequestInfo {
 *   constructor(event) {
 *     super(event);
 *     // Add custom processing
 *   }
 *   
 *   getCustomData() {
 *     return this.get('client');
 *   }
 * }
 * 
 * @example
 * // Get request data as object
 * const requestInfo = new RequestInfo(event);
 * const fullData = requestInfo.toObject(true); // Include sensitive data
 * const safeData = requestInfo.toObject(); // Sensitive data stripped
 */
class RequestInfo {

	_requestInfo = null;
	_isValid = false;

	/**
	 * Process the event
	 * @param {object} event 
	 */
	constructor(event) {
		let req = this._gatherRequest(event);
		this._requestInfo = new ImmutableObject( req , true);
	};

	/**
	 * Is the request valid? Validity is set by a series of checks
	 * during child class construction.
	 * Validity needs to be set by a child class, not this (super)
	 * class. 
	 * @returns {boolean} Whether or not the request is valid.
	 */
	isValid() {
		return this._isValid;
	};

	/**
	 * Standard toObject() but by default sensitive information is stripped out.
	 * Additional sensitive information may be stripped out by overriding this
	 * method. To receive the full object pass true.
	 * 
	 * @param {boolean} full 
	 * @returns {object} By default sensitive information is stripped out
	 */
	toObject(full = false) {
		let obj = this._requestInfo.toObject();

		if ( !full ) {
			// strip out any fields we don't want in the logs
			if ("client" in obj) {
				if ("allHeaders" in obj.client) { delete obj.client.allHeaders; }
				if ("headers" in obj.client) 	{ delete obj.client.headers; }
			}			
		}
		
		return obj;
	};

	/**
	 * Gets an object with data. So far the only key available is "client"
	 * which contains request fields from the client such as ip, user agent,
	 * etc.
	 * @param {string} key 
	 * @returns {object} Data relating to the key
	 */
	get(key = "") {
		return this._requestInfo.get(key);
	};

	/**
	 * Get a data object associated with the client request.
	 * @param {*} key such as "userAgent", "ip", etc.
	 * @returns {*} Return a object ("headers", "userAgent", etc) from the client data
	 */
	getClient(key = "") {
		let value = null;
		let clientObj = this.get("client");

		if ( key !== "" ) {
			if (key in clientObj) { value = clientObj[key]; }
		} else {
			value = clientObj;
		}
		
		return value;
	};

	/**
	 * User Agent of client request
	 * Note When accessed behind CloudFront:
	 * To ensure the user agent is passed along to API Gateway, use the AWS 
	 * managed Origin Request Policy named AllViewerExceptHostHeader. This 
	 * forwards the User-Agent along with most other viewer headers while 
	 * maintaining the correct Host header required for API Gateway to route 
	 * the request properly.
	 * @returns {string} The user agent string supplied by the client request
	 */
	getClientUserAgent() {
		return this.getClient("userAgent");
	};

	/**
	 * IP of client request.
	 * 
	 * By default (`CACHE_DATA_TRUSTED_PROXY_HOPS` unset or `0`) this is
	 * `identity.sourceIp`, the address of the connection API Gateway received.
	 * That is the client for an edge-optimized API with no CloudFront of your
	 * own, for a Regional API, and for your own CloudFront in front of a
	 * Regional API. With your own CloudFront in front of an edge-optimized API,
	 * set `CACHE_DATA_TRUSTED_PROXY_HOPS=3`.
	 * 
	 * With a hop count of 1 or more, the IP is taken only from values written
	 * by a trusted proxy, in this order: the `CloudFront-Viewer-Address` header
	 * (used only when the hop count is 2 or more), then the `X-Forwarded-For`
	 * header read from the right by the hop count, then `identity.sourceIp`.
	 * A value that is missing or is not a valid IP address moves on to the next source.
	 * A hop count above the real number of proxies is not safe: a client that
	 * sends extra `X-Forwarded-For` entries can choose the result.
	 * 
	 * See "Client IP resolution" in docs/features/tools/README.md and
	 * docs/cloudfront-notes/README.md.
	 * 
	 * @returns {string|null} The client IP address, or null when no source has a value
	 * @example
	 * const requestInfo = new RequestInfo(event);
	 * const ip = requestInfo.getClientIp();
	 * if (ip !== null) {
	 *   console.log(`Request from ${ip}`);
	 * }
	 */
	getClientIp() {
		return this.getClient("ip");
	};

	/**
	 * Alias of getClientIp(). Returns `identity.sourceIp` by default
	 * (`CACHE_DATA_TRUSTED_PROXY_HOPS` unset or `0`). With a hop count of 1 or
	 * more it resolves the IP from the `CloudFront-Viewer-Address` header
	 * (2 or more hops), then the `X-Forwarded-For` header read from the right
	 * by the hop count, then `identity.sourceIp`.
	 * 
	 * @see getClientIp
	 * @returns {string|null} The client IP address, or null when no source has a value
	 * @example
	 * const ip = new RequestInfo(event).getClientIP();
	 */
	getClientIP() {
		return this.getClientIp();
	};

	/**
	 * Referrer of client request
	 * @param {boolean} full If true, return the full referrer string supplied by the client request. If false (default), return only the domain from the referrer string (no https:// and no path
	 * @returns {string} The referrer string supplied by the client request
	 */
	getClientReferrer(full=false) {
		let referrer = this.getClient("referrer");
		if (full) {
			return referrer;
		} else if (referrer !== null && referrer !== undefined) {
			// return only the domain from the referrer string (no https:// and no path)
			// remove 'https://' and 'http://' from the beginning.
			referrer = referrer.replace(/^https?:\/\//, "");
			// remove everything after the first '/'
			referrer = referrer.split("/")[0];				
		}

		return referrer;
	};
	
	/**
	 * @see getClientReferrer
	 * @returns {string} The referrer string supplied by the client request
	 */
	getClientReferer(full=false) {
		return this.getClientReferrer(full);
	};

	/**
	 * Origin of client request
	 * @returns {string} The origin string supplied by the client request
	 */
	getClientOrigin() {
		return this.getClient("origin");
	};

	/**
	 * If client requested data using the if-modified-since header field,
	 * the date that was supplied.
	 * @returns {string} The if modified since date string supplied by the client request
	 */
	getClientIfModifiedSince() {
		return this.getClient("ifModifiedSince");
	};

	/**
	 * If client requested data using an eTag header field, the etag that
	 * was supplied.
	 * @returns {string} eTag supplied by the client for a match
	 */
	getClientIfNoneMatch() {
		return this.getClient("ifNoneMatch");
	};

	/**
	 * Response data format accepted by the client request
	 * @returns {string} Response data format accepted by the client request
	 */
	getClientAccept() {
		return this.getClient("accept");
	};

	/**
	 * 
	 * @returns {object} The headers supplied in the client request
	 */
	getClientHeaders() {
		return this.getClient("headers");
	};

	/**
	 * 
	 * @returns {object} The query string parameters supplied in the client request
	 */
	getClientParameters() {
		return this.getClient("parameters");
	};

	/**
	 * For POST requests, if a body was supplied in the request.
	 * @returns {string} The body supplied in the client request
	 */
	getClientBody() {
		return this.getClient("body");
	};

	/**
	 * There may be headers to pass along to an endpoint if our application
	 * is working as a proxy.
	 * @param {array} headerKeysToProxy An array of strings listing the header keys/fields to proxy
	 * @returns {array} Header keys to proxy
	 */
	getClientHeadersToProxy(headerKeysToProxy = []) {
		let headers = {};
		let clientHeaders = this.getClientHeaders();

		if ( headerKeysToProxy.length === 0) {
			headerKeysToProxy = ["accept", "if-modified-since", "if-none-match"];
		}

		headerKeysToProxy.forEach(function( h ) { headers[h] = clientHeaders[h]; });

		return headers;
	};


	/**
	 * Obtain lambda event request details for logging.
	 * Parses the API Gateway event to extract client information including IP,
	 * user agent, origin, referrer, headers, and query parameters.
	 * 
	 * By default (`CACHE_DATA_TRUSTED_PROXY_HOPS` unset or `0`), `client.ip` is
	 * `identity.sourceIp`. That is the client for an edge-optimized API with no
	 * CloudFront of your own, for a Regional API, and for your own CloudFront in
	 * front of a Regional API. With your own CloudFront in front of an
	 * edge-optimized API, set `CACHE_DATA_TRUSTED_PROXY_HOPS=3`.
	 * 
	 * With a hop count of 1 or more, only values written by a trusted proxy are
	 * used, in this order: the `CloudFront-Viewer-Address` header (only when the
	 * hop count is 2 or more), then the `X-Forwarded-For` header read from the
	 * right by the hop count, then `identity.sourceIp`. A missing or invalid
	 * value moves on to the next source. `client.ip` is null when no source has
	 * a value. A hop count above the real number of proxies is not safe: a client
	 * that sends extra `X-Forwarded-For` entries can choose the result.
	 * 
	 * See "Client IP resolution" in docs/features/tools/README.md and
	 * docs/cloudfront-notes/README.md.
	 * 
	 * For `client.userAgent`, the `user-agent` header is preferred over
	 * `identity.userAgent`. When the header is present and non-empty, its
	 * value is used directly. This ensures the original client user agent
	 * is returned instead of a proxy identifier (e.g. "Amazon CloudFront").
	 * Falls back to `identity.userAgent` when the header is absent or empty.
	 * 
	 * @param {object} event - API Gateway Lambda event object
	 * @returns {{ip: string|null, userAgent: string|null, origin: string|null, referrer: string|null, ifModifiedSince: string|null, ifNoneMatch: string|null, accept: string|null, headers: object, parameters: object, body: string|null}} Client request information
	 */
	_clientRequestInfo (event) {

		let client = { ip: null, userAgent: null, origin: null, referrer: null, ifModifiedSince: null, ifNoneMatch: null, accept: null, headers: {}, parameters: {}, body: null };
		let identity = {};
		let headers = {};

		// identity data
		if ( "requestContext" in event && "identity" in event.requestContext && event.requestContext.identity !== null ) {
			identity = event.requestContext.identity;
		}
		
		// header data
		if ( "headers" in event && event.headers !== null) {
			// extract just the keys so we can iterate and lowercase
			let hkeys = Object.keys(event.headers); 

			// move each value from event.headers to headers but lowercase the key
			hkeys.forEach( function( k ) { headers[k.toLowerCase()] = event.headers[k]; });
		} else {
			headers = {};
		}

		client.headers = headers;

		// >! Resolve the client IP only from values a trusted proxy wrote:
		// >! CloudFront-Viewer-Address, X-Forwarded-For read from the right, then identity.sourceIp.
		client.ip = ClientIpResolver.resolve(headers, identity);

		// if there is a user-agent header, set it
		if ( "userAgent" in identity && identity.userAgent !== null ) {
			client.userAgent = identity.userAgent;
		}

		// if user-agent header is present, prefer it over identity.userAgent (original client user agent)
		if ( "user-agent" in headers && headers["user-agent"] !== null && headers["user-agent"] !== "" ) {
			client.userAgent = headers["user-agent"];
		}

		// if there is an origin header, set it
		if ( headers?.origin) {
			client.origin = headers.origin;
		} // otherwise we'll just leave it as the default ""

		// if there is a referrer header, set it
		if ( headers?.referer) {
			client.referrer = headers.referer.split("?")[0]; // for privacy we don't want the query string
		} else {
			client.referrer = client.origin;
		}

		// if there is a if-modified-since header, copy over
		if ( "if-modified-since" in headers && headers['if-modified-since'] !== "" && headers['if-modified-since'] !== null) {
			client.ifModifiedSince = headers['if-modified-since'];
		}

		// if there is a if-none-match header, set it
		if ( "if-none-match" in headers && headers['if-none-match'] !== "" && headers['if-none-match'] !== null ) {
			client.ifNoneMatch = headers['if-none-match'];
		}

		// if there is an accept header, set it
		if ( "accept" in headers && headers.accept !== "" && headers.accept !== null ) {
			client.accept = headers['accept'];
		}

		// if query string parameters were passed, set it
		if ( "queryStringParameters" in event && event.queryStringParameters !== null) {
			client.parameters = event.queryStringParameters
		} else {
			client.parameters = {};
		}

		// TODO:
		// if body was passed in a post request, set it
		if ( false ) {
			client.body = null;
		}

		return client;

	};

	/**
	 * 
	 * @param {*} event 
	 * @returns Token and client info of the request. This is the stored object.
	 */
	_gatherRequest (event) {

		let r = {
			client: this._clientRequestInfo(event)
		};

		return r;

	};

};

module.exports = RequestInfo;