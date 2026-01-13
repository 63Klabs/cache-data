# Quick-Start Implementation

Just the basics of using debugging, logging, remote endpoints, and caching.

Basics:

- [Debug Using `DebugAndLog` and `Timer`](#debug-using-debugandlog-and-timer)
- [Basic Endpoint Connections](#basic-endpoint-connections)
- [Connections](#connections)

Caching:

- Secrets and Parameter Store
- CacheData

Advanced:

- Data Access Objects
- Connection Options
- CacheData Options

In addition to providing basic debugging, connections, and cache, the Cache-Data package also provides methods to receive, validate, route, respond to, and log requests as a web service much like an advanced framework such as ExpressJS.

For more information, see [Advanced Implementation for Providing a Web Service](../01-advanced-implementation-for-web-service/README.md)

## Debug Using `DebugAndLog` and `Timer`

The `DebugAndLog` and `Timer` objects are available from `tools`.

```js
const { tools: {DebugAndLog, Timer} } = require('@63klabs');

const timer = new Timer("My Timer 1"); // starts new timer
DebugAndLog.debug("My verbose message"); // outputs message to console.debug only if log level is 5
DebugAndLog.warn("My warning message");
DebugAndLog.log("Log data");
timer.stop(); // Stops timer and outputs log message with timer data when in debug mode
```

When using `try/catch` blocks it is recommended you include a `DebugAndLog.error` or `DebugAndLog.warn` in the `catch` block, and stop the timer in the `finally` block.

```js
const { tools: {DebugAndLog, Timer} } = require('@63klabs/cache-data');
const timer = new Timer("My Timer 1"); // starts new timer

try {
	DebugAndLog.debug("I'm doing something")
	// ... do something
}
catch (error) {
	DebugAndLog.error(`Error: ${error.message}`, error.stack);)
} finally {
	timer.stop();
}
```

For additional uses and options see [`tools.DebugAndLog`](../features/tools/README.md#toolsdebugandlog) and [`tools.Timer`](../features/tools/README.md#toolstimer) in the features documentation.

## Basic Endpoint Connections

The simplest connection is to directly call an endpoint from a URI:

```javascript
const { endpoint } = require("@63klabs/cache-data");
const data = await endpoint.get({uri: "https://api.example.com/data?q=Chicago"});

// separate out the query string into the second argument:
const data2 = await endpoint.get({uri: "https://api.example.com/data"}, { parameters: {q: "Chicago" }});

// separate out the path from host
const data3 = await endpoint.get({host: "api.example.com", path: "data"}, { parameters: {q: "Chicago" }});

// use a POST method rather than default GET
const data4 = await endpoint.get({host: "api.example.com", path: "data", method: "POST"}, { parameters: {q: "Chicago" }});
```

You can also pass a `connection` object:

```javascript
const data5 = await endpoint.get(connection);
```

A connection object has the following properties:

```js
/**
 * @typedef ConnectionObject
 * @property {Object} connection
 * @property {string} connection.method
 * @property {string} connection.uri
 * @property {string} connection.protocol http or https
 * @property {string} connection.host
 * @property {string} connection.path
 * @property {string} connection.body
 * @property {object} connection.parameters
 * @property {object} connection.headers
 * @property {object} connection.options
 * @property {number} connection.options.timeout
 * @property {string} connection.note
 */
```

This will be described later.

## Connections

### Config

#### Parameters and Secrets

Cache-Data requires an 32 character hexadecimal key to encrypt data when at rest. This can be stored in an SSM Parameter named `crypt_secureDataKey`.

You have two options for storing and retrieving your SSM Parameters:

1. Using the Cache-Data SSM Parameter access function.
2. Using the AWS Parameter and Secrets Lambda Extension.

Both are easily accessed using functions in the Cache-Data toolkit.

##### Option 1: Cache-Data SSM Parameter access function

This runs in the Config.init() function and can be used to retrieve all of the parameters needed for your application.

```javascript
class Config extends tools._ConfigSuperClass {
	static async init() {
		
		tools._ConfigSuperClass._promise = new Promise(async (resolve, reject) => {
				
			try {

				let params = await this._initParameters(
					[
						{
							"group": "app", // so we can do params.app.weatherapikey later
							"path": process.env.PARAM_STORE_PATH
						}
					]
				);

        // You can access within init() using params.app.crypt_secureDataKey

        resolve(true);
      } catch(error) {
        reject(null);
      }
    });
  }
}
```

Accesses the SSM Parameter Store and places any parameters found under `/apps/my_cool_app/` into a `params.app` variable. You'll see that the cache initialization uses `params.app.crypt_secureDataKey` which is the parameter we created under `/apps/my_cool_app/crypt_secureDataKey`.

New deployments and new concurrent instances will pick up changes to a Parameter value, but long-running instances will not. If you change the value of a Parameter then you need to redeploy the application in order to clear out any use of the old value.

###### Option 2: AWS Parameter and Secrets Lambda Extension

This is a more robust option and works with Secrets Manager as well. It requires the installation of a Lambda layer and then use of the `CachedSecret` and/or `CachedSSMParameter` Class from the Cache-Data tool-kit.

Another advantage is that unlike the previous method, this method will pick up on any Secret and Parameter value changes and begin using the new values within 5 minutes (unless you set the cache for longer).

First, make sure you install the Lambda layer:

```yaml
Resources:

  AppFunction:
    Type: AWS::Serverless::Function
    Properties:
      # ...
      Layers:
        - !Sub "arn:aws:lambda:${AWS::Region}:${ACCT_ID_FOR_AWS_PARAM_AND_SECRETS_EXT}:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11" # https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html#ps-integration-lambda-extensions-add
```

Next, in your code, create the object to store your Parameter or Secret.

```javascript
const myKey = new tools.CachedSSMParameter('appSecretKey', {refreshAfter: 1600});
```

Finally, make sure you prime() and await the value.

```javascript
myKey.prime(); // request in the background so you can do other things before using it.

// ... do many things

let password = await myKey.getValue();
```

If you place it within an object you can also stringify that object and it will replace the reference with the secret. (You need to await the .prime() before processing)

```javascript
myKey.prime(); // request in the background so you can do other things before using it.

// ... do many things
const dbconn = { username: myUsername, password: myKey };

await myKey.prime();
connect(JSON.parse(JSON.stringify(dbconn)));

// or use toString()
await myKey.prime();
connect( {
  username: `${myUsername}`,
  password: `${myKey}`
})
```

##### Connections, and Cache

The cache object acts as an intermediary between your application and your data (whether it be a remote endpoint or other storage/process mechanism).

Before you can use Parameter Store, S3, and DynamoDb for the cache, they need to be set up with the proper access granted to your Lambda function.

1. Set up an S3 bucket (Your application will store cache data in `/cache`)
2. Create a DynamoDb table
3. Create a Parameter in SSM Parameter store `/app/my_cool_app/crypt_secureDataKey` and set the secret text to a 64 character length hex value. (64 hex characters because we are using a 256 bit key and cipher (`aes-256-ofb`)in the example below)
4. Make sure you set up IAM policies to allow you Lambda function access to the S3 bucket, DynamoDb table, and SSM Parameter store.

Once the S3 bucket, DynamoDb table, and SSM Parameter are set up we can focus on your Lambda function.

During your application initialization (but not for each request) we need to initialize the Config object.

The class below will do the following three things:

1. Bring in the secret key (and other parameters) from SSM Parameter Store.
2. Create connections with cache settings for each connection
3. Initialize the Cache

This code can be put into a separate file and brought in using a `require` statement. It should be scoped to the highest level of your Lambda function and not in the request handler.

```js
/* EXAMPLE USING the this._initParameters method of obtaining parameters during Config.init() */

// require cache-data
const { tools, cache, endpoint } = require('@63klabs/cache-data');

/**
 * Extends tools._ConfigSuperClass
 * Used to create a custom Config interface
 * Usage: should be placed near the top of the script file outside 
 * of the event handler. It should be global and must be initialized.
 * @example
 * const obj = require("./classes.js");
 * obj.Config.init();
 */
class Config extends tools._ConfigSuperClass {
	
	/**
	 * This is custom inititialization code for the application. Depending 
	 * upon needs, the _init functions from the super class may be used
	 * as needed. Init is async, and a promise is stored, allowing the 
	 * lambda function to wait until the promise is finished.
	 */
	static async init() {
		
		tools._ConfigSuperClass._promise = new Promise(async (resolve, reject) => {
				
			try {

				let params = await this._initParameters(
					[
						{
							"group": "app", // so we can do params.app.weatherapikey later
							"path": "/apps/my_cool_app/" // process.env.PARAM_STORE_PATH // or store as a Lambda environment variable
						}
					]
				);

				// after we have the params, we can set the connections
				let connections = new tools.Connections();

				/* NOTE: instead of hard coding connections, you could import 
				from a connections file and then add in any additional values 
				such as keys from the Param store
				*/

				// for games demo from api.chadkluck.net
				connections.add( {
					name: "demo",
					host: "api.chadkluck.net",
					path: "/games",
					parameters: {},
					headers: {
						referer: "https://chadkluck.net"
					},
					cache: [
						{
							profile: "games",
							overrideOriginHeaderExpiration: true, // if the endpoint returns an expiration, do we ignore it for our own?
							defaultExpirationInSeconds: (10 * 60),// , // 10 minutes
							expiresIsOnInterval: true, // for example, a 10 min cache can expire on the hour, 10, 20, 30... after. 24 hour cache can expire at midnight. 6 hour cache can expire at 6am, noon, 6pm, and midnight
							headersToRetain: "", // what headers from the endpoint do we want to keep with the cache data?
							hostId: "demo", // log entry friendly (or not)
							pathId: "games",  // log entry friendly (or not)
							encrypt: false // you can set this to true and it will use the key from param store and encrypt data at rest in S3 and DynamoDb
						}
					]
				} );

				tools._ConfigSuperClass._connections = connections;

				// Cache settings
				cache.Cache.init({
					dynamoDbTable: "yourDynamoDbTable", // replace with the name of a DynamoDb table to store cached data
					s3Bucket: "yourS3Bucket", // replace with a bucket name to store cache data. Data will be stored in /cache in yourS3Bucket
					secureDataAlgorithm: "aes-256-ofb", // how do we encrypt data at rest
					secureDataKey: Buffer.from(params.app.crypt_secureDataKey, "hex"), // using the parameter from above during Config.init()
          //secureDataKey: new tools.CachedSSMParameter('/apps/my_cool_app/CacheData_SecureDataKey', {refreshAfter: 300}), // if using tools.CachedSSMParameter()
					idHashAlgorithm: "RSA-SHA3-512", // the alg used to create a unique hash identifier for requests so we can tell them apart in the cache
					DynamoDbMaxCacheSize_kb: 20, // data larger than this (in KB) will be stored in S3 to keep DynamoDb running efficently
					purgeExpiredCacheEntriesAfterXHours: 24, // expired caches hang around for a while before we purge just in case there is cause to fall back on them
					defaultExpirationExtensionOnErrorInSeconds: 300, // so as to not overwhelm a down endpoint, or to not cache an error for too long, how often should we check back?
					timeZoneForInterval: "America/Chicago" // if caching on interval, we need a timezone to account for calculating hours, days, and weeks. List: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
				});
				
				resolve(true);
			} catch (error) {
				tools.DebugAndLog.error("Could not initialize Config", error);
				reject(false);
			};
			
		});

	};
};
```

The `connection` code above does the following:

1. Defines the host and path (and any parameters and headers to send to a remote endpoint)
2. Defines the cache settings for that remote endpoint (note, these are only cache settings for that remote endpoint and not the overall cache)

Additional connections may be added using additional `connections.add()` functions.

The `cache` code does the following:

1. Sets the DynamoDb table and S3 bucket to store cached data
2. Sets the algorithm to securely encrypt data at rest in DynamoDb and S3
3. Sets the hash algorithm used to create a unique id for each unique request
4. How big of an object do we save in DynamoDb before storing it in S3? (20K objects are ideal, anything bigger is in S3)
5. How long to wait before purging expired entries (they aren't purged right away but kept in case of errors)
6. If there is an error getting fresh data, how long do we extend any existing cache? (so we can back off while endpoint is in error)
7. Set the time zone for intervals. For example, we can expire on the hour (8am, 12pm, 8pm, etc) but if we expire at the end of the day, when is the "end of the day"? Midnight where? If empty it will be UTC.

Each of these are described in their own sections below. 

Note that it is probably best to not hard code values but instead bring them in as environment variables from your Lambda function.

Next, we need to call the initialization in our application, and before the handler can be executed, make sure the promise has resolved.

```js
// note that the Config object is defined in the code above

/* initialize the Config */
Config.init(); // we need to await completion in the async call function

/**
 * Lambda function handler
 */
exports.handler = async (event, context) => {

	/* wait for CONFIG to be settled as we need it before continuing. */
	await Config.promise();

	/* Process the request and wait for result */
	const response = await someFunction(event, context); // some code or function that generates a response

	/* Send the result back to API Gateway */
	return response;

}
```

Note that you will replace `someFunction()` with your own function that will call and process the data from cache as in the example below.

Once the `Config` object is initialized, the following code can be used to access data through the cache.

```js
/*
Note that cache object was already set by the require statement
assuming: 
const { tools, cache, endpoint } = require('@63klabs/cache-data');
*/

let connection = Config.getConnection("demo"); // corresponds with the name we gave it during connections.add()
let conn = connection.toObject(); // we'll "extract" the connection data. .toObject() will create a clone of the data so we can modify if need be

let cacheProfile = connection.getCacheProfile("games"); // corresponds with the cache profile we gave within demo for connections.add()

const cacheObj = await cache.CacheableDataAccess.getData(
	cacheProfile, // this is your cache profile for an endpoint, included from connection object
	endpoint.get, // this is the function you want to invoke to get fresh data if the cache is stale. (conn and null will be passed to it)
	conn, // connection information which will be passed to endpoint.get() to get fresh data. Also used to identify the object in cache
	null // this parameter can be used to pass additional data to endpoint.get (or any other DAO)
);

let games = cacheObj.getBody(true); // return the data as an object (true) instead of a string (false). You could use false if you want to keep the data as a string (as in xml or html or text)
```

In order to do its job it needs to:

1. Know how to access the data. We use a Connection object from Config to do this. You can think of a Connection object as all the pieces of an HTTP request. It identifies the protocol, domain, path, query string, headers, etc. (However, it doesn't have to be an HTTP request.)
2. Know the function to use to access fresh data from the remote endpoint. Using the Connection object, your can either use a built in HTTP request, or define your own method for processing an http request or other data source.
3. Know the cache policy for the data. We use a Cache object to do this. It is an object that has information on expiration, headers to save with the data, where cache data is stored, stored data encryption protocol, 

### cache.CacheableDataAccess.getData() without Connection

Note that you can use `cache.CacheableDataAccess.getData()` without a Connection object. You'll notice that we "extract" the connection data from `connection` using `.toObject()`. We do this not just because it creates an object that isn't a reference (thus allowing us to ad hoc modify things like path or parameters without changing the original) but also because any object with any structure may be passed (as long as your passed function is expecting it).

The `cacheProfile` variable is also just an object, but must adhere to the structure outlined in the cache declaration previously shown.

You can create the cache configuration and connection on the fly without the Connection object:

```js
const cacheProfile ={
	overrideOriginHeaderExpiration: true,
	defaultExpirationExtensionOnErrorInSeconds: 3600,
	defaultExpirationInSeconds: (10 * 60), // 10 minutes
	expiresIsOnInterval: true,
	headersToRetain: ['x-data-id', 'x-data-sha1'],
	hostId: "example",
	pathId: "person",
	encrypt: true
};

const conn = {
	host: "api.example.com",
	path: "/person",
	parameters: {id: id, event: event },
	headers: {}
};

const cacheObj = await cache.CacheableDataAccess.getData(
	cacheProfile,
	myCustomDAO_getData,
	conn, 
	null
);
```

### Connections using CachedSSMParameter or CachedSecret

Creating a connection is similar to above, we can add an authorization property to the connection:

```js
conn = {
	authentication: {
		parameters: {
			apikey: new tools.CachedSSMParameter('/apps/my_cool_app/demoAPIkey', {refreshAfter: 300}),
		}
	}
}
```

Learn more about Connection Authentication below. 

And when calling Cache.init(), pass a CachedSSMParameter (or CachedSecret) to the secureDataKey property:

```js
secureDataKey: new tools.CachedSSMParameter('/apps/my_cool_app/CacheData_SecureDataKey', {refreshAfter: 1600}),
```

```js
// for games demo from api.chadkluck.net
connections.add( {
  name: "demo",
  host: "api.chadkluck.net",
  path: "/games",
  parameters: {},
  headers: {
    referer: "https://chadkluck.net"
  },
  authentication: {
    parameters: {
      apikey: new tools.CachedSSMParameter('/apps/my_cool_app/demoAPIkey', {refreshAfter: 300}), // ADDED
    }
  },
  cache: myCacheProfilesArray
} );

tools._ConfigSuperClass._connections = connections;

// Cache settings
cache.Cache.init({
  dynamoDbTable: "yourDynamoDbTable",
  s3Bucket: "yourS3Bucket",
  secureDataAlgorithm: "aes-256-ofb",
  secureDataKey: new tools.CachedSSMParameter('/apps/my_cool_app/CacheData_SecureDataKey', {refreshAfter: 1600}), // CHANGED FROM params.app
  idHashAlgorithm: "RSA-SHA3-512",
  DynamoDbMaxCacheSize_kb: 20,
  purgeExpiredCacheEntriesAfterXHours: 24,
  defaultExpirationExtensionOnErrorInSeconds: 300,
  timeZoneForInterval: "America/Chicago" 
});

```

### Connections Authentication

You can store your authentication methods separate from the headers, parameters, and body properties. You can also use Basic authorization.

Just add an `authentication` property to your connection.

```js
// for games demo from api.chadkluck.net
connections.add( {
  name: "demo",
  host: "api.chadkluck.net",
  path: "/games",
  headers: {
    referer: "https://chadkluck.net"
  },
  authentication: {
    parameters: {
      apikey: new tools.CachedSSMParameter('/apps/my_cool_app/demoAPIkey', {refreshAfter: 1600}), // ADDED
    }
  },
  cache: myCacheProfilesArray
} );

connections.add( {
  name: "demoauthbasic",
  host: "api.chadkluck.net",
  path: "/games",
  headers: {
    referer: "https://chadkluck.net"
  },
  authentication: {
    basic: {
      username: new tools.CachedSSMParameter('/apps/my_cool_app/demoUsername', {refreshAfter: 300}),
      password: new tools.CachedSSMParameter('/apps/my_cool_app/demoPassword', {refreshAfter: 300}),
    }
  },
  cache: myCacheProfilesArray
} );

connections.add( {
  name: "demoauthheaders",
  host: "api.chadkluck.net",
  path: "/games",
  headers: {
    referer: "https://chadkluck.net"
  },
  authentication: {
    headers: {
      'x-api-key': new tools.CachedSSMParameter('/apps/my_cool_app/apiKey', {refreshAfter: 300})
    }
  },
  cache: myCacheProfilesArray
} );

connections.add( {
  name: "demoauthbody",
  host: "api.chadkluck.net",
  path: "/games",
  headers: {
    referer: "https://chadkluck.net"
  },
  authentication: {
    body: {
      'x-api-key': new tools.CachedSSMParameter('/apps/my_cool_app/apiKey', {refreshAfter: 300}),
      'account': new tools.CachedSSMParameter('/apps/my_cool_app/accountId', {refreshAfter: 3600})
    }
  },
  cache: myCacheProfilesArray
} );
```

### Connections Options

Specify a `timeout` in the connection to pass to the http_get command. Default is `8000`.

Specify how duplicate parameters in a query string should be handled. This allows you to craft your query string to match what your endpoint expects when it parses the query string.

```javascript
connections.add({
  method: "POST",
  host: "api.chadkluck.net",
  path: "/echo/",
  headers: headers,
  uri: "",
  protocol: "https",
  body: null,
  parameters: {
    greeting: "Hello",
    planets: ["Earth", "Mars"]
  },
  options: {
    timeout: 8000,
    separateDuplicateParameters: false, // default is false
    separateDuplicateParametersAppendToKey: "", // "" "[]", or "0++", "1++"
    combinedDuplicateParameterDelimiter: ','
	}
})
```

By default the query string used for the request will be:

```text
?greeting=Hello&planets=Earth,Mars
```

However, by changing `separateDuplicateParameters` to `true` and `separateDuplicateParametersAppendToKey` to `[]`:

```text
?greeting=Hello&planets[]=Earth&planets[]=Mars
```

You can also append an index to the end of the parameter:

```javascript
options = {
    separateDuplicateParameters: true,
    separateDuplicateParametersAppendToKey: "0++", // "" "[]", or "0++", "1++"
}
// ?greeting=Hello&planets0=Earth&planets1=Mars
```

Similarly, you can start at index 1 instead of 0:

```javascript
options = {
    separateDuplicateParameters: true,
    separateDuplicateParametersAppendToKey: "1++", // "" "[]", or "0++", "1++"
}
// ?greeting=Hello&planets1=Earth&planets2=Mars
```


### AWS X-Ray

X-Ray can be enabled by making sure you have the Lambda layer installed, appropriate permissions granted to your Lambda execution policy, and setting AWS X-Ray to true in the CloudFormation Template parameters or your Lambda Environment variable.

The templates and code under the installation section already have these implemented.

## Advanced

There are advanced uses for the Cache object such as caching processed data not from an endpoint and creating your own Data Access Object (DAO) classes.

### Caching data not from a remote endpoint

Cache does not have to be from a remote endpoint.

Suppose you gather data from six endpoints and process the data in a resource and time intensive process and would like to cache the result for 6 or 24 hours. You can use the Cache object to store any data from any source, either externally or internally.

The function parameter passed to the Cache object is the method used to obtain data. Remember the `endpoint.get` from the code sample above? That is just a function to return a bare bones response from an api endpoint. (You can actually extend the `endpoint.Endpoint` class and create your own DAOs that can pre and post process data before returning to your application's cache.)

Instead of passing in the function `endpoint.get` you can create any function that will grab or process data and return an object.

Remember, when passing functions for another function to execute, do not include the `()` at the end.

### Creating your own Data Access Object (DAO)

You can either extend `endpoint.Endpoint` or create your own.
