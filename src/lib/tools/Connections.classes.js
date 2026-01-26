const DebugAndLog = require('./DebugAndLog.class');
const { safeClone } = require('./utils');


/* ****************************************************************************
 * Connection classes
 * ----------------------------------------------------------------------------
 * 
 * Classes that store connection and cache information for api requests.
 * 
 *************************************************************************** */

class Connections {
	
	_connections = {};

	/**
	 * Creates a Connections object that can hold multiple Connection objects.
	 * @param {Array<object>|Array<Connection>|object|Connection} connections An object containing Connection objects
	 */
	constructor( connections = null ) {
		if ( connections !== null ) {
			if ( Array.isArray(connections) ) {
				for (var i = 0; i < connections.length; i++) {
					this.add(connections[i]);
				}
			} else {
				this.add(connections);
			}
		};
	};


	/**
	 * Given an object (associative array) or Connection instance, create a Connection object to add to
	 * our collection of Connections.
	 * 
	 * @param {object|Connection} obj 
	 */
	add( obj ) {
		let connectionObj = obj;
		let name = null;
		
		if ( obj instanceof Connection ) {
			connectionObj = obj.toObject();
			name = obj.getName();
		} else if ( "name" in obj ) {
			name = obj.name;
		}
		
		if ( name !== null && !(name in this._connections) ) {
			let connection = new Connection(connectionObj);
			this._connections[name] = connection;
		};
	};

	/**
	 * 
	 * @param {object} connectionName 
	 * @returns An object from the named Connection
	 */
	get(connectionName) {
		DebugAndLog.debug("Getting connection: "+connectionName,this._connections[connectionName]);
		return ( ( connectionName in this._connections ) ? this._connections[connectionName] : null );
	};

	toObject() {
		return this._connections;
	};

	toJSON() {
		// loop through the Connection objects in Connections by key and use each of their .toInfoObject() methods to generate an object
		var obj = {};
		for (var key in this._connections) {
			obj[key] = this._connections[key].toInfoObject();
		}
		return JSON.stringify(obj);
	}

};

/**
 * The Connection object provides the base for requests but does not carry
 * the request. myConnection.get() will return an object (associative array) 
 * that can then be used to generate and submit a request to a DAO class or 
 * APIRequest object.
 * You can store and manage multiple connections using the Connections object.
 */
class Connection {


	/**
	 * Given an object (associative array) create a Connection
	 *
	 * @param {{name: string, method: string, uri: string, protocol: string, host: string, path: string, parameters: Array, headers: Array, options: object, note: string, authentication: object|ConnectionAuthentication, cache: Array}} obj
	 */
	constructor(obj = null) {
		this._init(obj);
	};

	_name = null;
	_method = null;
	_uri = null;
	_protocol = null;
	_host = null;
	_path = null;
	_body = null;
	_parameters = null; // {}
	_headers = null; // {}
	_options = null;
	_note = null;
	_authentication = null; // new ConnectionAuthentication();
	_cacheProfiles = null; // {}

	_cachedAuthObject = null;

	/**
	 * Given an object (associative array with key/value pairs) update the 
	 * connection information. Note that for parameters and headers this
	 * is a destructive operation if new values are passed in. Any keys
	 * not passed in will be wiped. It is better to use the .addParameters()
	 * and .addHeaders() function first, then pass in an object that does
	 * not have the headers and parameters key.
	 * @param {*} obj 
	 */
	_init(obj = null) {
		if (  obj !== null && typeof obj === 'object' ) {

			// if, and only if the object is not currently named, will we accept a name
			if ( "name" in obj && obj.name !== null && this._name === null ) { this._name = obj.name; }

			if ( "method" in obj && obj.method !== null ) { this._method = obj.method.toUpperCase(); }
			if ( "uri" in obj && obj.uri !== null ) { this._uri = obj.uri; }
			if ( "protocol" in obj && obj.protocol !== null ) { this._protocol = obj.protocol.replace(/\:$/, '').toLowerCase(); } // The URL().protocol keeps the : we don't need it if present
			if ( "host" in obj && obj.host !== null ) { this._host = obj.host.toLowerCase(); }
			if ( "path" in obj && obj.path !== null ) { this._path = obj.path; }
			if ( "body" in obj && obj.body !== null ) { this._body = obj.body; }
			if ( "parameters" in obj && obj.parameters !== null ) { this._parameters = obj.parameters; }
			if ( "headers" in obj && obj.headers !== null ) { this._headers = obj.headers; }
			if ( "options" in obj && obj.options !== null ) { this._options = obj.options; }
			if ( "note" in obj && obj.note !== null ) { this._note = obj.note; }
			if ( "authentication" in obj && obj.authentication !== null ) { this._setAuthentication(obj.authentication); }
			if ( "cache" in obj && obj.cache !== null) { this._setCacheProfiles(obj.cache); }

		}

	};

	/**
	 * 
	 * @returns {Object}
	 */
	getParameters() {
		let params = (this._parameters !== null) ? safeClone(this._parameters) : null;

		if ("parameters" in this._getAuthenticationObject()) {
			if (params === null) { params = {}; }
			// combine auth keys and values with parm keys and values
			params = Object.assign({}, params, this._getAuthenticationObject().parameters);
		}

		return params;
	};

	/**
	 * 
	 * @returns {Object}
	 */
	getHeaders() {
		let headers = (this._headers !== null) ? safeClone(this._headers) : null;

		if ("headers" in this._getAuthenticationObject()) {
			if (headers === null) { headers = {}; }
			// combine auth keys and values with parm keys and values
			headers = Object.assign({}, headers, this._getAuthenticationObject().headers);
		}

		return headers;
	};

	/**
	 * @returns {string}
	 */
	getBody() {
		let body = ("body" in this._getAuthenticationObject()) ? this._getAuthenticationObject().body : this._body;

		if (body !== null && typeof body !== 'string') {
			body = JSON.stringify(body);
		}
		
		return body;
	};

	_getAuthenticationObject() {
		if (this._cachedAuthObject === null) {
			this._cachedAuthObject = (this._authentication === null) ? {} : this._authentication.toObject();
		}
		return this._cachedAuthObject;
	}

	/**
	 * 
	 * @param {string} profileName 
	 * @returns {Object}
	 */
	getCacheProfile( profileName ) {

		if (this._cacheProfiles === null) {
			return undefined;
		}

		function isProfile(item) {
			return item.profile === profileName;
		};

		const profile = this._cacheProfiles.find(isProfile);
		return profile ? safeClone(profile) : undefined;
	};

	_setAuthentication(authentication) {
		if (authentication instanceof ConnectionAuthentication ) { this._authentication = authentication }
		else if ( authentication !== null && typeof authentication === 'object' ) { this._authentication = new ConnectionAuthentication(authentication); }
	};

	_setCacheProfiles(cacheProfiles) {
		this._cacheProfiles = cacheProfiles;
	};

	_toObject() {
		const obj = {};
		if ( this._method !== null ) { obj.method = this._method; }
		if ( this._uri !== null ) { obj.uri = this._uri; }
		if ( this._protocol !== null ) { obj.protocol = this._protocol; }
		if ( this._host !== null ) { obj.host = this._host; }
		if ( this._path !== null ) { obj.path = this._path; }	

		if ( this._options !== null ) { obj.options = this._options; }
		if ( this._note !== null ) { obj.note = this._note; }
		return obj;
	}

	/**
	 * 
	 * @returns object (associative array) with connection details in key/pairs
	 */
	toObject() {
		const obj = this._toObject();

		const headers = this.getHeaders();
		const parameters = this.getParameters();
		const body = this.getBody();

		if ( headers !== null ) { obj.headers = headers; }
		if ( parameters !== null ) { obj.parameters = parameters; }
		if ( body !== null ) { obj.body = body; }

		const authObj = this._getAuthenticationObject();
		if ( Object.keys(authObj).length > 0 ) { obj.authentication = authObj; }

		if ( this._cacheProfiles !== null ) { obj.cache = this._cacheProfiles; }

		return obj;
	};

	toInfoObject() {
		const obj = this._toObject();

		if ( this._headers !== null ) { obj.headers = this._headers; }
		if ( this._parameters !== null ) { obj.parameters = this._parameters; }
		if ( this._body !== null ) { obj.body = this._body; }

		if ( this._authentication !== null && typeof this._authentication === "object" && this._authentication instanceof ConnectionAuthentication) {
			obj.auth = {};
			obj.auth.headers = this._authentication.hasHeader();
			obj.auth.parameters = this._authentication.hasParameter();
			obj.auth.body = this._authentication.hasBody();
			obj.auth.basic = this._authentication.hasBasic();
		}

		return obj;
	}

	getName() {
		return this._name;
	};

	toString() {
		return `${this._name} ${this._method} ${(this._uri) ? this._uri : this._protocol+"://"+this._host+this._path}${(this._note) ? " "+this._note : ""}`;
	};

};

/**
 * ConnectionAuthentication allows auth tokens, parameters, etc to be stored
 * separately from regular connection request parameters so that they can be
 * protected from modification or accidental access.
 * Header, parameter, and/or Basic auth key/value pairs can be passed in. 
 * Additional methods could be added in the future.
 * 
 * new ConnectionAuthentication(
 * {
 *  headers: { x-key: "bsomeKeyForAHeaderField", x-user: "myUserID" },
 *  parameters: { apikey: "myExampleApiKeyForResource1234" },
 *  body: { key: "myExampleApiKeyForResource1283" },
 *  basic: { username: "myUsername", password: "myPassword" }
 * }
 * );
 */
class ConnectionAuthentication {

	// request parts that could contain auth
	#headers = null;
	#parameters = null;
	#body = null;

	// auth methods - we merge in later, keep separate for now
	#basic = null;

	constructor(obj = null) {

		if ( obj !== null && typeof obj === 'object' ) {

			// places auth could be placed
			if ( "parameters" in obj && obj.parameters !== null ) {  this.#parameters = obj.parameters; }
			if ( "headers" in obj && obj.headers !== null ) {  this.#headers = obj.headers; }
			if ( "body" in obj && obj.body !== null ) {  this.#body = obj.body; }

			// auth methods
			if ( "basic" in obj && obj.basic !== null ) { this.#basic = obj.basic; }

		}

	};

	hasHeader() {
		return (this.#headers !== null);
	};

	hasParameter() {
		return (this.#parameters !== null);
	};

	hasBody() {
		return (this.#body !== null);
	};

	hasBasic() {
		return (this.#basic !== null);
	};

	/**
	 * Generates the basic auth Authorization header.
	 * Takes the basic object containing a username and password during object
	 * construction and concatenates them together in a base64 encoded string
	 * and places it in an Authorization header.
	 * @returns {object} Object containing the key/value pair of a Authorization header for basic auth
	 */
	_getBasicAuthHeader() {
		let obj = {};
		if ( this.hasBasic() ) {
			obj = { Authorization: "" };
			obj.Authorization = "Basic " + Buffer.from(this.#basic.username + ":" + this.#basic.password).toString("base64");
		}
		return obj;
	};

	/**
	 * Combines any auth parameters sent via a query string
	 * @returns {object} Object containing key/value pairs for parameters
	 */
	_getParameters() {
		let obj = {};
		if ( this.hasParameter() ) { obj = this.#parameters; }
		return obj;
	};

	/**
	 * Combines any auth header fields. If authorizations such as Basic is used the 
	 * appropriate header field is generated.
	 * @returns {object} Object containing key/value pairs for headers
	 */
	_getHeaders() {
		let obj = {};
		if ( this.hasHeader() ) { obj = this.#headers; };

		// auth methods here
		if ( this.hasBasic() ) { obj = Object.assign({}, obj.headers, this._getBasicAuthHeader()); } // merge basic auth into headers
		
		return obj;
	};

	/**
	 * Combines any auth fields sent via a body
	 * @returns {object} Object containing key/value pairs for body
	 */
	_getBody() {
		let obj = {};
		if ( this.hasBody() ) { obj = this.#body; };
		return obj;
	};


	/**
	 * 
	 * @returns {object} An object with any header, parameter, or body fields necessary
	 * to complete authentication
	 */
	toObject() {
		let obj = {};

		/*
		Object.keys(myObj).length
		Object.keys(myObj) will return the keys of the object (associative array) as an indexed array of keys. 
		.length will then return the number of keys in the indexed array. If there are more than 0 then there is content.
		*/

		let headers = this._getHeaders();
		if ( Object.keys(headers).length ) { obj.headers = headers; }

		let parameters = this._getParameters();
		if ( Object.keys(parameters).length ) { obj.parameters = parameters; }

		let body = this._getBody();
		if ( Object.keys(body).length ) { obj.body = body; }

		return safeClone(obj);
	};

	// Static methods that could perform authentication could go here
	// such as OAuth 2.0 or Bearer tokens.
	// that way an object containing the right info could be passed in and executed
	
};

/**
 * A Connection provides the base for a ClientRequest. A ClientRequest extends the 
 * Connection by adding request specific parameters. While a Connection 
 * cannot be modified after creation (it is a config), a ClientRequest can be 
 * modified as the application or DAO assembles the request.
 */
class ConnectionRequest extends Connection {

	constructor(obj) {
		super(obj);
	};

	/**
	 * Add key/value pairs to headers. If the header key already exists,
	 * it will be updated with the new one.
	 * @param {*} headers 
	 */
	addHeaders(headers) {
		if (  headers !== null && typeof headers === 'object' ) {
			// if we have headers (not null) then merge new headers in, otherwise just set to passed headers
			this._headers = ( this._headers !== null ) ? Object.assign({}, this._headers, headers) : headers;
		}
	};

	/**
	 * Add a single header key/value pair to headers. If the header key
	 * already exists it will be updated with the new one.
	 * @param {*} key 
	 * @param {*} value 
	 */
	addHeader(key, value) {
		let obj = {};
		obj[key] = value;
		this.addHeaders( obj );
	};

	/**
	 * Add key/value pairs to parameters. If the parameter already exists,
	 * it will be updated with the new one.
	 * @param {*} parameters 
	 */
	addParameters(parameters) {
		if (  parameters !== null && typeof parameters === 'object' ) {
			// if we have parameters (not null) then merge new parameters in, otherwise just set to passed parameters
			this._parameters = ( this._parameters !== null ) ? Object.assign({}, this._parameters, parameters) : parameters; 
		}
	};

	/**
	 * Add a single parameter key/value pair to parameters. If the parameter key
	 * already exists it will be updated with the new one.
	 * @param {*} key 
	 * @param {*} value 
	 */
	addParameter(key, value) {
		let obj = {};
		obj[key] = value;
		this.addParameter( obj );
	};
};

module.exports = {
	Connections,
	Connection,
	ConnectionRequest,
	ConnectionAuthentication
};