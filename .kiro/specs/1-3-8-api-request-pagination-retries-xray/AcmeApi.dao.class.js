const { tools } = require("@63klabs/cache-data");
const { Acme } = require("./Acme.dao.class");

/*
The DAO class builds the request from a connection object and performs the actual API call to Acme.
The class is not called directly, but rather through the functions in this file.
The functions are called from the service layer and are responsible for passing the connection object
and query object to the DAO class.
The query object is used to build the request using additional logic within the DAO, but is not sent to the API directly.
The query object is also used to pass data that should not used to calculate the cache key.
*/

/**
 * 
 * @param {object} connection Information used to perform the actual API call
 * @param {object} query Information used by the DAO class to build the request - This data is not sent to the API directly, nor is it used to calculate the cache
 * @returns {object} response from Acme API
 */
exports.skates = async (connection, query = {}) => {
	return (new AcmeSkatesApi(connection, query)).get();
};

/**
 * 
 * @param {object} connection Information used to perform the actual API call
 * @param {object} query Information used by the DAO class to build the request - This data is not sent to the API directly, nor is it used to calculate the cache
 * @returns {object} response from Acme API
 */
exports.rocketSearch = async (connection, query = {}) => {
	return (new AcmeSearchRocketsApi(connection, query)).get();
};

/**
 * 
 * @param {object} connection Information used to perform the actual API call
 * @param {object} query Information used by the DAO class to build the request - This data is not sent to the API directly, nor is it used to calculate the cache
 * @returns {object} response from Acme API
 */
exports.rockets = async (connection, query = {}) => {
	return (new AcmeRocketApi(connection, query)).get();
};

/** Used for both Rockets and AcmeSearchRocketsApi and AcmeSkatesApi 
 *  
 * These can be overridden by the connection passed to the class
*/


const PAGINATION_OPTIONS = Object.freeze({
	totalItemsLabel: "totalItems",
	itemsLabel: "items",
	offsetLabel: "skip",
	limitLabel: "take",
	responseReturnCountLabel: "returnedItemCount",
	defaultLimit: 200,
	batchSize: 5
});

const ROCKET_DEFAULT_PARAM = Object.freeze({
	excludeCoHosts: "false",
	// current date in YYYY-MM-DD format
	endsAfter: new Date().toISOString().slice(0, 10), // endsAfter: "2023-07-01",
	includeSubmissionIds: "false",
	IncludeRsvpCounts: "false",
	Visibilities: "Public", // Visibilities: [ "Public", "Institution"],
	take: PAGINATION_OPTIONS.defaultLimit,
	skip: 0
});
class AcmeRocketApi extends Acme {

	static #DEFAULT_PARAMETERS = Object.freeze(ROCKET_DEFAULT_PARAM);
	static #DEFAULT_PATH = "/api/v3.0/rockets/rocket/";

	constructor(connection, query) {
		super(connection);
		this.query = query;

		this._setRequest();
	}

	_setRequest() {

		this.request.path = AcmeRocketApi.#DEFAULT_PATH;

		this.request.parameters = Object.assign({}, AcmeRocketApi.#DEFAULT_PARAMETERS, (this.request.parameters ??= {})); // overwrite default param (we place {} since defaultParams is CONST)

		const notePath = `(${AcmeRocketApi.#DEFAULT_PATH.replace(/^\/|\/$/g, '')})`;
		// if notePath string not in this.request.note
		if (!this.request.note.includes(notePath)) {
			this.request.note = `${this.request.origNote} ${notePath}`;
		}

		tools.DebugAndLog.debug(`AcmeRocketApi: ${this.request.note}`, this.request);
	};

	async get() {
	
		const initialResponse = await super.get();
		
		return this.paginateResults(initialResponse, PAGINATION_OPTIONS);
	}
}

class AcmeSkatesApi extends Acme {

	static #DEFAULT_PAGINATION_OPTIONS = Object.assign({}, PAGINATION_OPTIONS, { defaultLimit: 1000 });

	static #DEFAULT_PARAMETERS = Object.freeze({
		statuses: "Active",
		isAdminOnly: "false",
		isShownInPublicDirectory: "true",
		take: AcmeSkatesApi.#DEFAULT_PAGINATION_OPTIONS.defaultLimit,
		skip: 0
	});

	static #DEFAULT_PATH = "/api/v3.0/skates/skate/";

	constructor(connection, query) {
		super(connection);
		this.query = query;

		this._setRequest(connection);
	}

	_setRequest() {
		this.request.path = AcmeSkatesApi.#DEFAULT_PATH;

		this.request.parameters = Object.assign({}, AcmeSkatesApi.#DEFAULT_PARAMETERS, (this.request.parameters ??= {})); // overwrite default param (we place {} since defaultParams is CONST)

		// remove any first and last / from default path
		this.request.note = `${this.request.origNote} (${AcmeSkatesApi.#DEFAULT_PATH.replace(/^\/|\/$/g, '')})`;

		tools.DebugAndLog.debug(`AcmeSkatesApi: ${this.request.note}`, this.request);

	};

	async get() {
	
		const initialResponse = await super.get();
		
		return this.paginateResults(initialResponse, AcmeSkatesApi.#DEFAULT_PAGINATION_OPTIONS);
	}
}

class AcmeSearchRocketsApi extends Acme {

	static #DEFAULT_PARAMETERS = Object.freeze(ROCKET_DEFAULT_PARAM);
	static #DEFAULT_PATH = "/api/v3.0/rockets/rocket/search/";

	constructor(connection, query) {
		super(connection);
		this.query = query;

		this._setRequest(connection);
	};

	_setRequest() {
		this.request.path = AcmeSearchRocketsApi.#DEFAULT_PATH;

		this.request.parameters = Object.assign({}, AcmeSearchRocketsApi.#DEFAULT_PARAMETERS, (this.request.parameters ??= {})); // overwrite default param (we place {} since defaultParams is CONST)

		this.request.note = `${this.request.origNote} (${AcmeSearchRocketsApi.#DEFAULT_PATH.replace(/^\/|\/$/g, '')})`;

		tools.DebugAndLog.debug(`AcmeSearchRocketsApi: ${this.request.note}`, this.request);
	};

	async get() {
	
		const initialResponse = await super.get();
		
		return this.paginateResults(initialResponse, PAGINATION_OPTIONS);
	}

}
