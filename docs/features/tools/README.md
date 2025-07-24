# Endpoint Properties, Methods, and Use

TODO

## Monitoring and Logging

### tools.Timer

In its simplest form we can do the following:

```js
/*
Assuming: 
const { tools, cache, endpoint } = require('@63klabs/cache-data');
*/

const timerTaskGetGames = new tools.Timer("Getting games", true); // We give it a name for logging, and we set to true so the timer starts right away

/* A block of code we want to execute and get timing for */
// do something
// do something

timerTaskGetGames.stop(); // if debug level is >= 3 (DebugAndLog.DIAG) it will log the elapsed time in ms
```

The above code will create a timer which we can access by the variable name `timerTaskGetGames`. Since we set the second parameter to `true` it will start the timer upon creation.

Then a block of code will execute.

Then we stop the timer using `.stop()` and if the logging level is 3 or greater it will send a log entry with the elapsed time to the console.

You are able to get the current time elapsed in milliseconds from a running Timer by calling `const ms = timerVarName.elapsed()`

### tools.DebugAndLog

```js
/*
Assuming: 
const { tools, cache, endpoint } = require('@63klabs/cache-data');
*/

/* increase the log level - comment out when not needed  */
tools.DebugAndLog.setLogLevel(5, "2022-02-28T04:59:59Z"); // we can increase the debug level with an expiration

tools.DebugAndLog.debug("Hello World");
tools.DebugAndLog.msg("The sky is set to be blue today");
tools.DebugAndLog.diag("Temperature log:", log);

try {
	// some code
} catch (error) {
	tools.DebugAndLog.error("We have an error in try/catch 1", error);
}

try {
	// some code
} catch (error) {
	tools.DebugAndLog.warn("We have an error but will log it as a warning in try/catch 2", error);
}
```

Before calling `Config.init()` you can set the log level using `DebugAndLog.setLogLevel()`. If you set the log level after calling `Config.init()` OR after calling any `DebugAndLog` function, you will get an error. That is because a default log level has already been set and we will not allow the changing of the log level after a script has begun.

There are six (6) logging functions.

```js
DebugAndLog.error(msgStr, obj); // logs at ALL logging levels
DebugAndLog.warn(msgStr, obj); // logs at ALL logging levels
DebugAndLog.log(msgStr, tagStr, obj); // logs at ALL logging levels
DebugAndLog.msg(msgStr, obj); // logs at level 1 and above
DebugAndLog.diag(msgStr, obj); // logs at level 3 and above
DebugAndLog.debug(msgStr, obj); // logs at level 5
```

In the above the `obj` parameter is optional and is an object you wish to log. Be careful of logging objects that may contain sensitive information.

Choose the method based on how verbose you want your logging to be at various script levels.

Note that `DebugAndLog.log(msgStr, tagStr)` allows you to add a tag. If a tag is not provided `LOG` will be used and your log entry will look like `[LOG] your message`.

If you provide `TEMP` as a tag ('temperature' for example) then the log entry will look something like this: `[TEMP] your message`.

## Sanitize and Obfuscate functions

These functions attempt to scrub items labled as 'secret', 'key', 'token' and 'Authorization' from objects for logging purposes.

Sanitization is also performed on objects passed to the DebugAndLog logging functions.

#### Sanitize

You can pass an object to sanitize for logging purposes.

NOTE: This is a tool that attempts to sanitize and may miss sensitive information. Inspect the [regular expression used for performing search](https://regex101.com/r/IJp35p/3) for more information. Care should be taken when logging objects for purposes of debugging.

What it attempts to do:

- Finds object keys with 'secret', 'key', and 'token' in the name and obfuscates their values.
- It checks string values for key:value and key=value pairs and obfuscates the value side if the key contains the words 'secret', 'key', or 'token'. For example, parameters in a query string `https://www.example.com?client=435&key=1234EXAMPLE783271234567` would produce `https://www.example.com?client=435&key=******4567`
- It checks for 'Authentication' object keys and sanitizes the value.
- It checks for multi-value (arrays) of object keys named with secret, key, or token such as `"Client-Secrets":[123456789,1234567890,90987654321]`

```JavaScript
// Note: These fake secrets are hard-coded for demo/test purposes only. NEVER hard-code secrets!
const obj = {
	secret: "98765-EXAMPLE-1234567890efcd",
	apiKey: "123456-EXAMPLE-123456789bcea",
	kbToken: "ABCD-EXAMPLE-12345678901234567890",
	queryString: "?site=456&secret=12345EXAMPLE123456&b=1",
	headers: {
		Authorization: "Basic someBase64EXAMPLE1234567"
	}
};

console.log("My Sanitized Object", tools.sanitize(obj));
/* output: My Sanitized Object {
  secret: '******efcd',
  apiKey: '******bcea',
  kbToken: '******7890',
  queryString: '?site=456&secret=******3456&b=1',
  headers: { Authorization: 'Basic ******4567' }
}
*/
```

> It is best to avoid logging ANY data that contains sensitive information. While this function provides an extra layer of protection, it should be used sparingly for debugging purposes (not on-going logging) in non-production environments.

#### Obfuscate

You can pass a string to obfuscate.

For example, `12345EXAMPLE7890` will return `******7890`.

By default, asterisks are used to pad the left-hand side, and only 4 characters are kept on the right. The length of the string returned is not dependent on the length of the string passed in which in turn obfuscates the original length of the string. However, the right side will not reveal more than 25% of the string (it actually rounds up 1 character so a 2 character string would still reveal the final character).

Default options can be changed by passing an options object.

```JavaScript
const str = "EXAMPLE1234567890123456789";

console.log( tools.obfuscate(str) );
// output: ******6789

const opt = { keep: 6, char: 'X', len: 16 };
console.log( tools.obfuscate(str, opt) );
// output: XXXXXXXXXX456789
```

### AWS-SDK

The @63klabs/cache-data package will automatically detect and use the correct AWS SDK based on the version of Node.

Node < 18 is unsupported as of 63klabs/cache-data v1.3.0.

Node 18+ environments will use AWS-SDK version 3.

Note that `package.json` for @63klabs/cache-data only installs the AWS-SDK on dev environments. This is because AWS Lambda environments already include the AWS-SDK without requiring installs. This makes your application lighter and ensures you are always running the most recent SDK release.

Because DynamoDb, S3, and SSM Parameter store are used by cache-data, only those SDKs are included. A client is provided for each along with limited number of commands. To make gets and puts easier a get and put command is mapped for DynamoDb and S3.

#### `tools.AWS` Object

When `tools` is imported, you can use the `tools.AWS` object to perform common read/write operations on S3, DynamoDb, and SSM Parameter Store.

```javascript
const { tools } = require('@63klabs/cache-data');

console.log(`NODE VERSION ${tools.AWS.NODE_VER} USING AWS SDK ${tools.AWS.SDK_VER}`);
console.log(`REGION: ${tools.AWS.REGION}`); // set from Lambda environment variable AWS_REGION

var getParams = {
    Bucket: 'mybucket', // bucket name,
    Key: 'hello.txt' // object to get
}

const result = await tools.AWS.s3.get(getParams);

let objectData = await s3Body.transformToString(); // V3: Object bodies in V3 are readable streams, so we convert to string
// let objectData = data.Body.toString('utf-8'); // V2: Object bodies are Buffers, so we convert to string
console.log(`hello.txt Body: ${objectData}`);
// outputs "hello.txt Body: Hello, World!"

```

The `tools.AWS` object provides the following:

```js
tools.AWS.NODE_VER
tools.AWS.NODE_VER_MAJOR
tools.AWS.NODE_VER_MINOR
tools.AWS.NODE_VER_PATCH
tools.AWS.NODE_VER_MAJOR_MINOR
tools.AWS.NODE_VER_ARRAY
tools.AWS.REGION
tools.AWS.SDK_VER
tools.AWS.SDK_V2
tools.AWS.SDK_V3
tools.AWS.INFO // an object containing all of the properties listed above
tools.AWS.dynamo.client
tools.AWS.dynamo.put(params) // const result = await tools.AWS.dynamo.put(params);
tools.AWS.dynamo.get(params) // const result = await tools.AWS.dynamo.get(params);
tools.AWS.dynamo.scan(params) // const result = await tools.AWS.dynamo.scan(params);
tools.AWS.dynamo.delete(params) // const result = await tools.AWS.dynamo.delete(params);
tools.AWS.dynamo.update(params) // const result = await tools.AWS.dynamo.update(params);
tools.AWS.s3.client
tools.AWS.s3.put(params) // const result = await tools.AWS.s3.put(params)
tools.AWS.s3.get(params) // const result = await tools.AWS.s3.get(params)
tools.AWS.ssm.client,
tools.AWS.ssm.getByName(query) // const params = await tools.AWS.ssm.getByName(query)
tools.AWS.ssm.getByPath(query) // const params = await tools.AWS.ssm.getByPath(query)
```

##### Using AWS SDK V3 through tools.AWS

To use the AWS SDK you normally have to import the proper SDKs and libraries, create a client, and then send the commands. However, since the package uses reads and writes to S3 objects, DynamoDb tables, and SSM Parameter store, it readily makes these commands available through the `AWS` object from `tools`.

To use the methods you only need to pass the parameter or query object as you normally would.

```javascript
// Given the two parameter/query objects:
const { tools } = require('@63klabs/cache-data');

const paramsForPut = {
	TableName: 'myTable',
  	Item: {
		'hash_id': '8e91cef4a27',
		'episode_name': "There's No Disgrace Like Home",
		'air_date': "1990-01-28",
		'production_code': '7G04'
  }
}

const paramsForGet = {
	TableName: 'myTable',
	Key: {'hash_id': '8e91cef4a27'}
};

const dbPutResult = await tools.AWS.dynamodb.put(paramsForPut);
const dbGetResult = await tools.AWS.dynamodb.get(paramsForGet);
```

Refer to the section about the tools.AWS above for the variables, methods, and SDK objects available.

For more on creating parameter/query objects for S3, DynamoDb, and SSM Parameter Store:

- [Amazon S3 examples using SDK for JavaScript (v3)](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- [Using the DynamoDB Document Client](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html)

##### Import Additional Commands

When using AWS SDK version 3, you can import additional commands and use them with the client provided by `tools.AWS`.

```javascript
const { tools } = require('@63klabs/cache-data');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3'); // AWS SDK v3

const command = new DeleteObjectCommand({
    Bucket: "myBucket",
    Key: "good-bye.txt"
});

const response = await tools.AWS.s3.client.send(command);
```
