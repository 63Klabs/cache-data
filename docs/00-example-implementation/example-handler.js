/* 
*******************************************************************************
Example Handler for Cache Data when used as a Web Service API
*******************************************************************************
The code below is bare bones example code
*******************************************************************************
*/

const { 
	cache: { 
		CacheableDataAccess 
	},
	tools: {
		DebugAndLog,
		Timer
	}
} = require("@63klabs/cache-data");

const { Config } = require("./config");

/* log a cold start and keep track of init time */
const coldStartInitTimer = new Timer("coldStartTimer", true);

/* initialize the Config */
Config.init(); // we will await completion in the handler

/**
 * Lambda function handler
 * 
 * @param {object} event Lambda event - doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {object} context Lambda context - doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
 */
exports.handler = async (event, context) => {

	let response = null;

	try {

		/* wait for Config.promise and THEN Config.prime to be settled as we need it before continuing. */
		await Config.promise(); // makes sure general config init is complete
		await Config.prime(); // makes sure all prime tasks (tasks that need to be completed AFTER init but BEFORE handler) are completed
		/* If the cold start init timer is running, stop it and log. This won't run again until next cold start */
		if (coldStartInitTimer.isRunning()) { DebugAndLog.log(coldStartInitTimer.stop(),"COLDSTART"); }

		/* Process the request and wait for result */
		response = await process(event, context);

	} catch (error) {

		/* Log the error */
		DebugAndLog.error(`Unhandled Execution Error in Handler  Error: ${error.message}`, error.stack);

		/* This failed before we even got to parsing the request so we don't have all the log info */
		response = {
            statusCode: 500,
            body: JSON.stringify({
                message: "Internal Server Error",
                error: error.message
            })
        };

	} finally {
		DebugAndLog.debug("Response from Handler: ", response);
		/* Send the result back to API Gateway */
		return response;
	}

};

/**
 * 
 * @param {Object} event 
 * @param {Object} context 
 * @returns {Object}
 */
const process = async (event, context) => {

	return new Promise(async (resolve) => {

		let results = {};
		const timer = new Timer("Process", true);
		DebugAndLog.debug(`Process Event`, event);

		try {
			const conn = {url: "https://api.chadkluck.net/games"};
            const cacheProfile = {
				defaultExpirationInSeconds: (10 * 60), // 10 min
				hostId: "exampleapi",
				pathId: "games",
				encrypt: true
			}

			/* Send the request through CacheableDataAccess to see if we have a cached response.
			If we do, we will return it. If not, it will call the function passed as the
			second parameter with the conn and query as parameters to that function and
			use the response to get the data. */
			const cacheObj = await CacheableDataAccess.getData(
				cacheProfile, 
				endpoint.get, // function to call if cache miss
				conn, 
				null
			);

			results = cacheObj.getBody(true);

			DebugAndLog.debug("Retrieved games", results);

		} catch (error) {
			DebugAndLog.error(`Process Error: ${error.message}`, error.stack);
			// we could return an Error object in the data, but for now we will just log it and leave data as null
		} finally {
			timer.stop();
            resolve({
                statusCode: 200,
                body: JSON.stringify({
                    message: "Success",
                    data: results,
                    timing: timer.getElapsed()
                })
            })
        };
    });
}
