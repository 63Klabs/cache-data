const { tools, cache } = require('@63klabs/cache-data');
const { Config } = require("../config");
const Utils = require('../utils');
const AcmeApi = require('./AcmeApi.dao.class.js');
const SkatesMap = require('./skates.map.js');


exports.get = async (query) => {

	const logIdentifier = "Skate Service GET";

	return new Promise(async (resolve, reject) => {
		
		let success = false;
		let data = null;
		let meta = {};
		const timer = new tools.Timer(logIdentifier, true);
		tools.DebugAndLog.debug(`${logIdentifier}: Query Received`, query);

		try {

			const connection = Config.getConnection("acme");
			const cacheCfg = connection.getCacheProfile("skates");
			const conn = connection.toObject();

			conn.options ??= {};
			conn.options.timeout ??= 8000;

			/* We pass only the values needed by the DAO.
			conn.parameters contain only valid endpoint parameters
			conn.query contain only properties used by DAO external of the endpoint 
				(such as limit to determine how many total records the DAO should return
				after the DAO uses the endpoint's own limit/size/offset parameters for pagination)
			If it is date specific, we could calculate today's date or a date range here */

			conn.parameters = Utils.func.addTimeSpanToAcmeSkateParameters(conn.parameters, query);

			const allowedParams = [
				"productId", "categoryIds", "color", "size", "fuel", "skateIds", 
				"orderByField", "orderByDirection", 
				"Visibilities", "visibilities" // Acme uses Visibilities instead of visibilities so we will fix that later
			];

			// remove any parameters not in the allowed list
			conn.parameters = Object.fromEntries(
				Object.entries(conn.parameters).filter(([key]) => allowedParams.includes(key))
			);

			// add any query parameters in the allowed list
			if (query) {
				for (const [key, value] of Object.entries(query)) {
					if (allowedParams.includes(key)) {
						conn.parameters[key] = value;
					}
				}
			}

			// visibilities to Visibilities - this is one property Acme decided to capitalize unlike the rest
			if ("visibilities" in conn.parameters) {
				conn.parameters.Visibilities = conn.parameters.visibilities;
				delete conn.parameters.visibilities;
			}

			// set the query values to pass on to the DAO
			const daoQuery = {
				limit: query?.limit ?? null,
			};

			// remove null values from daoQuery
			Object.keys(daoQuery).forEach(key => daoQuery[key] === null && delete daoQuery[key]);

			tools.DebugAndLog.debug(`${logIdentifier}: Query to DAO`, daoQuery);
			tools.DebugAndLog.debug(`${logIdentifier}: Conn to DAO`, conn);

			/* Send the request through CacheData to see if we have a cached response.
			If we do, we will return it. If not, we will call the function passed as the
			second parameter with the conn and query as parameters to that function and
			use the response to get the data. */

			const cacheObj = await cache.CacheableDataAccess.getData(
				cacheCfg, 
				AcmeApi.skates,
				conn, 
				daoQuery
			);

			/* It appears the Acme API has a habit of returning incomplete responses
			so we need to be really careful about checking for errors and return an unsuccessful
			status so that the cache may be utilized. */
			try {
				data = JSON.parse(cacheObj.getBody(false)); // we will handle deserialization ourselves
				// check for expiration headers in cacheObj
				if (cacheObj.getExpires()) {
					meta.expiration = cacheObj.getExpires();
					tools.DebugAndLog.debug(`${logIdentifier}: Data expiration (from cache): ${meta.expiration}`);
				}
			} catch (error) {
				meta.error = "Error parsing data from endpoint"
				tools.DebugAndLog.error(`${logIdentifier}: Error: ${error.message}`, error.stack );
			}

			// as long as we got what we expected, transform the data
			if( data !== null && data instanceof Object && "items" in data && Array.isArray(data.items) ) {

				meta.count = data.items.length;
				data = { items: SkatesMap.json(data.items, query) };
				success = true;

				tools.DebugAndLog.debug(`${logIdentifier} skates.items.length: ${meta.count}`);
			}

		} catch (error) {
			tools.DebugAndLog.error(`${logIdentifier}: Error: ${error.message}`, error.stack);
			meta.error = "Error getting data"
		} finally {
			timer.stop();
			resolve({success, meta, data});
		}

	});

};
