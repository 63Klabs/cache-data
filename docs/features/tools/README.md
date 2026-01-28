# Tools Module Documentation

## Overview

The tools module provides a comprehensive set of utility classes and functions for AWS Lambda development. It includes logging, timing, AWS SDK integration, request/response handling, data manipulation, and connection management utilities.

## Available Tools

### Logging and Debugging

- **[DebugAndLog](#debugandlog-class)**: Configurable logging with environment-based log levels
- **[Timer](#timer-class)**: Performance timing for operations

### AWS Integration

- **[AWS](#aws-object)**: Simplified AWS SDK access for DynamoDB, S3, and SSM Parameter Store
- **[CachedParameterSecrets](#cached-parameters-and-secrets)**: Cached access to SSM parameters and Secrets Manager

### Request and Response Handling

- **[APIRequest](#apirequest-class)**: HTTP request handling
- **[ClientRequest](#clientrequest-class)**: Client request parsing and validation
- **[RequestInfo](#requestinfo-class)**: Request information extraction
- **[Response](#response-class)**: HTTP response formatting
- **[ResponseDataModel](#responsedatamodel-class)**: Response data structure management
- **[Generic Response Generators](#generic-response-generators)**: JSON, HTML, XML, RSS, and text response formatters

### Data Utilities

- **[ImmutableObject](#immutableobject-class)**: Create immutable objects
- **[sanitize()](#sanitize-function)**: Scrub sensitive data from objects
- **[obfuscate()](#obfuscate-function)**: Obfuscate strings
- **[hashThisData()](#hashthisdata-function)**: Generate hashes for data
- **[printMsg()](#printmsg-function)**: Formatted console output

### Configuration and Connections

- **[_ConfigSuperClass](#configsuperclass)**: Base class for application configuration
- **[Connections](#connections-classes)**: Connection management and authentication

---

## Monitoring and Logging

The `tools` object provides a Timer class and a DebugAndLog class to help with monitoring and logging.

### Setting the Log Level

To set the log level, `DebugAndLog` checks for environment variables in the following order:

1. `CACHE_DATA_LOG_LEVEL`
2. `LOG_LEVEL`
3. `log_level` (__deprecated, will be removed in future__)
4. `detailedLog`s (__deprecated, will be removed in future__)
5. `logLevel` (__deprecated, will be removed in future__)
6. `AWS_LAMBDA_LOG_LEVEL`

If none of these is set, it defaults to level 2 (INFO).

You can get the current list of accepted variables in priority order from `tools.DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES` (since v1.3.2).

Most examples will use `LOG_LEVEL` but if you have another package using `LOG_LEVEL` and wish to set `DebugAndLog` separately, use `CACHE_DATA_LOG_LEVEL`.

If you only provide `AWS_LAMBDA_LOG_LEVEL` and set it to `SILENT`, `ERROR` or `WARN` then those log settings will take precedence (`CACHE` and `RESPONSE` logs will not be generated).

These can be set in your CloudFormation template Lambda resource Environment Variables.

There are six levels of logging:

> `LOG`, `RESPONSE`, `CACHE`, and `ERROR` logs will always be logged unless `AWS_LAMBDA_LOG_LEVEL` is set to `SILENT`, `CRITICAL`, `ERROR`, or `WARN`.

- 0 - ERROR: Errors in addition to RESPONSE and CACHE logs will be logged.
- 1 - WARN: Warnings and Errors will be logged.
- 2 - INFO: In addition to previous, INFO will be logged.
- 3 - MSG: More verbose than INFO
- 4 - DIAG: Timers and diagnostic info
- 5 - DEBUG: Everything is logged

If you wish to set the log level programmatically, do so before calling `Config.init()` by using `tools.DebugAndLog.setLogLevel(level)` where level is an integer from `0` to `5` or one of the following strings: `'ERROR'`, `'WARN'`, `'INFO'`, `'MSG'`, `'DIAG'`, `'DEBUG'`.

> Note: The default log level is 2 (INFO) and cannot be set higher in production `PROD` environments.

DebugAndLog will not set logging higher than 2 in production (`PROD`) environments, based on whether the following environment variables are set to `PROD`, `TEST`, or `DEV`. If none are set, `NODE_ENV` is checked for `production` or `development`. 

The default is `PROD`.

- `CACHE_DATA_ENV`
- `DEPLOY_ENVIRONMENT`
- `DEPLOY_ENV`
- `ENV_TYPE`
- `deploy_environment` (__deprecated, will be removed in future__)
- `ENV`
- `env` (__deprecated, will be removed in future__)
- `deployEnvironment` (__deprecated, will be removed in future__)
- `ENVIRONMENT`
- `environment` (__deprecated, will be removed in future__)

You can get the current list of accepted variables in priority order from `tools.DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES` (since v1.3.2).

As an example, in your Lambda function CloudFormation template you would set:

```yaml
Resources:
  MyFunction:
	Type: AWS::Lambda::Function
	Properties:
	  Environment:
		Variables:
		  DEPLOY_ENVIRONMENT: TEST
		  LOG_LEVEL: DEBUG
```

For a production environment:

```yaml
Resources:
  MyFunction:
	Type: AWS::Lambda::Function
	Properties:
	  Environment:
		Variables:
		  DEPLOY_ENVIRONMENT: PROD
		  LOG_LEVEL: INFO
```

An example using template parameters and conditionals:

```yaml
Resources:
  MyFunction:
	Type: AWS::Lambda::Function
	Properties:
	  Environment:
		Variables:
		  DEPLOY_ENVIRONMENT: !Ref DeployEnvironment
		  LOG_LEVEL: !If [ IsProduction, "INFO", "DEBUG"]
```

> Note: The deployment environment variables use `DEV`, `TEST`, and `PROD`. `DEV` is for local environments. `TEST` is for environments deployed in the cloud. `PROD` is, of course, for production environments. This is similar, but a bit different, than `NODE_ENV` as `NODE_ENV` also controls what package dependencies are deployed.

### tools.Timer

> Timer only generates logs at level 4 (DIAG) or higher.

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
const { tools, cache, endpoint } = require('@63klabs/cache-data');

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

There are seven (7) logging functions.

```js
DebugAndLog.log(msgStr, tagStr, obj); // logs at ALL logging levels
DebugAndLog.error(msgStr, obj); // logs at ALL logging levels
DebugAndLog.warn(msgStr, obj); // logs at level 1 and higher
DebugAndLog.info(msgStr, obj); // logs at level 2 and higher
DebugAndLog.msg(msgStr, obj); // logs at level 3 and higher
DebugAndLog.diag(msgStr, obj); // logs at level 4 and higher
DebugAndLog.debug(msgStr, obj); // logs at level 5
```

In the above the `obj` parameter is optional and is an object you wish to log. Be careful of logging objects that may contain sensitive information.

Choose the method based on how verbose you want your logging to be at various script levels.

Note that `DebugAndLog.log(msgStr, tagStr)` allows you to add a tag. If a tag is not provided `LOG` will be used and your log entry will look like `[LOG] your message`.

If you provide `TEMP` as a tag ('temperature' for example) then the log entry will look something like this: `[TEMP] your message`.

> The `DebugAndLog.log()` function is for __logging row data__ such as requests, cache responses, and data points that can be queried and aggregated in Dashboards or exported to databases or data tables.

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


## DebugAndLog Class

Provides configurable logging with environment-based log levels and automatic sanitization of sensitive data.

### Log Levels

There are six levels of logging (0-5):

- **0 - ERROR**: Errors only
- **1 - WARN**: Warnings and errors
- **2 - INFO**: Informational messages (default)
- **3 - MSG**: More verbose messages
- **4 - DIAG**: Diagnostic information and timers
- **5 - DEBUG**: Everything

### Setting Log Level

DebugAndLog checks environment variables in this order:

1. `CACHE_DATA_LOG_LEVEL`
2. `LOG_LEVEL`
3. `AWS_LAMBDA_LOG_LEVEL`

```javascript
// In CloudFormation template
Environment:
  Variables:
    LOG_LEVEL: INFO
```

Or programmatically before calling any Config.init():

```javascript
const { tools } = require('@63klabs/cache-data');
tools.DebugAndLog.setLogLevel(3); // or 'MSG'
```

### Logging Methods

```javascript
const { tools } = require('@63klabs/cache-data');

tools.DebugAndLog.log(msgStr, tagStr, obj);    // logs at ALL levels
tools.DebugAndLog.error(msgStr, obj);          // logs at ALL levels
tools.DebugAndLog.warn(msgStr, obj);           // logs at level 1+
tools.DebugAndLog.info(msgStr, obj);           // logs at level 2+
tools.DebugAndLog.msg(msgStr, obj);            // logs at level 3+
tools.DebugAndLog.diag(msgStr, obj);           // logs at level 4+
tools.DebugAndLog.debug(msgStr, obj);          // logs at level 5
```

### Usage Examples

```javascript
const { tools } = require('@63klabs/cache-data');

tools.DebugAndLog.info('Application started');
tools.DebugAndLog.debug('Debug information', { data: 'value' });

try {
  // some code
} catch (error) {
  tools.DebugAndLog.error('Operation failed', error);
}
```

### Environment Detection

DebugAndLog automatically detects the deployment environment and limits log levels in production:

Environment variables checked (in order):
1. `CACHE_DATA_ENV`
2. `DEPLOY_ENVIRONMENT`
3. `DEPLOY_ENV`
4. `ENV_TYPE`
5. `NODE_ENV`

Values: `PROD`, `TEST`, `DEV`

**Note**: In production (`PROD`), log level cannot exceed 2 (INFO) for security.

---

## Timer Class

Track execution time for operations with automatic logging at DIAG level.

### Basic Usage

```javascript
const { tools } = require('@63klabs/cache-data');

const timer = new tools.Timer("Operation name", true); // true = start immediately

// ... do work ...

timer.stop(); // Logs elapsed time if log level >= 4 (DIAG)
```

### Getting Elapsed Time

```javascript
const timer = new tools.Timer("Task");
timer.start();

// ... do work ...

const ms = timer.elapsed(); // Get elapsed time without stopping
console.log(`Elapsed: ${ms}ms`);

timer.stop(); // Stop and log
```

### Example

```javascript
const { tools } = require('@63klabs/cache-data');

const timer = new tools.Timer("Fetching data", true);

const data = await fetchDataFromAPI();

timer.stop(); // Logs: "[DIAG] Fetching data: 245ms"
```

---

## AWS Object

Simplified access to AWS SDK for DynamoDB, S3, and SSM Parameter Store.

### AWS Information

```javascript
const { tools } = require('@63klabs/cache-data');

console.log(`Node ${tools.AWS.NODE_VER} using AWS SDK ${tools.AWS.SDK_VER}`);
console.log(`Region: ${tools.AWS.REGION}`);
console.log(`SDK Version: ${tools.AWS.SDK_V3 ? 'v3' : 'v2'}`);
```

### DynamoDB Operations

```javascript
const { tools } = require('@63klabs/cache-data');

// Put item
const putParams = {
  TableName: 'myTable',
  Item: {
    'id': '123',
    'name': 'John Doe',
    'email': 'john@example.com'
  }
};
await tools.AWS.dynamo.put(putParams);

// Get item
const getParams = {
  TableName: 'myTable',
  Key: { 'id': '123' }
};
const result = await tools.AWS.dynamo.get(getParams);
console.log(result.Item);

// Scan table
const scanParams = {
  TableName: 'myTable',
  FilterExpression: 'age > :age',
  ExpressionAttributeValues: { ':age': 18 }
};
const scanResult = await tools.AWS.dynamo.scan(scanParams);

// Update item
const updateParams = {
  TableName: 'myTable',
  Key: { 'id': '123' },
  UpdateExpression: 'set #name = :name',
  ExpressionAttributeNames: { '#name': 'name' },
  ExpressionAttributeValues: { ':name': 'Jane Doe' }
};
await tools.AWS.dynamo.update(updateParams);

// Delete item
const deleteParams = {
  TableName: 'myTable',
  Key: { 'id': '123' }
};
await tools.AWS.dynamo.delete(deleteParams);
```

### S3 Operations

```javascript
const { tools } = require('@63klabs/cache-data');

// Put object
const putParams = {
  Bucket: 'myBucket',
  Key: 'data.json',
  Body: JSON.stringify({ data: 'value' }),
  ContentType: 'application/json'
};
await tools.AWS.s3.put(putParams);

// Get object
const getParams = {
  Bucket: 'myBucket',
  Key: 'data.json'
};
const result = await tools.AWS.s3.get(getParams);
const data = await result.Body.transformToString(); // SDK v3
console.log(data);
```

### SSM Parameter Store

```javascript
const { tools } = require('@63klabs/cache-data');

// Get parameters by name
const nameQuery = {
  Names: ['/app/config/apiKey', '/app/config/secret'],
  WithDecryption: true
};
const params = await tools.AWS.ssm.getByName(nameQuery);

// Get parameters by path
const pathQuery = {
  Path: '/app/config/',
  WithDecryption: true
};
const pathParams = await tools.AWS.ssm.getByPath(pathQuery);
```

### Using Additional AWS SDK Commands

```javascript
const { tools } = require('@63klabs/cache-data');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

const command = new DeleteObjectCommand({
  Bucket: 'myBucket',
  Key: 'old-file.txt'
});

const response = await tools.AWS.s3.client.send(command);
```

---

## Cached Parameters and Secrets

Cache SSM parameters and Secrets Manager secrets to reduce API calls and improve performance.

### CachedSSMParameter

```javascript
const { tools } = require('@63klabs/cache-data');

const apiKey = new tools.CachedSSMParameter({
  name: '/app/config/apiKey',
  maxAge_ms: 300000  // Cache for 5 minutes
});

// First call fetches from SSM
const key1 = await apiKey.getValue();

// Subsequent calls use cached value
const key2 = await apiKey.getValue();

// Force refresh
await apiKey.prime();
```

### CachedSecret

```javascript
const { tools } = require('@63klabs/cache-data');

const dbPassword = new tools.CachedSecret({
  name: 'prod/db/password',
  maxAge_ms: 600000  // Cache for 10 minutes
});

const password = await dbPassword.getValue();
```

### CachedParameterSecrets

Manage multiple cached parameters and secrets:

```javascript
const { tools } = require('@63klabs/cache-data');

const secrets = new tools.CachedParameterSecrets();

secrets.add(new tools.CachedSSMParameter({ name: '/app/apiKey' }));
secrets.add(new tools.CachedSecret({ name: 'prod/db/password' }));

// Prime all at once
await secrets.prime();

// Access individual values
const apiKey = secrets.get('/app/apiKey').sync_getValue();
const password = secrets.get('prod/db/password').sync_getValue();
```

---

## Data Utilities

### sanitize() Function

Scrub sensitive data from objects for logging:

```javascript
const { tools } = require('@63klabs/cache-data');

const obj = {
  username: 'john',
  password: 'secret123',
  apiKey: 'key-12345678',
  data: 'public info'
};

console.log(tools.sanitize(obj));
// { username: 'john', password: '******123', apiKey: '******5678', data: 'public info' }
```

**Note**: This attempts to sanitize but may miss sensitive information. Avoid logging sensitive data when possible.

### obfuscate() Function

Obfuscate strings by showing only the last few characters:

```javascript
const { tools } = require('@63klabs/cache-data');

const secret = '12345EXAMPLE7890';
console.log(tools.obfuscate(secret));
// ******7890

// Custom options
const options = { keep: 6, char: 'X', len: 16 };
console.log(tools.obfuscate(secret, options));
// XXXXXXXXXX456789
```

### hashThisData() Function

Generate hashes for data:

```javascript
const { tools } = require('@63klabs/cache-data');

const data = { user: 'john', action: 'login' };
const hash = tools.hashThisData(data);
console.log(hash); // SHA-256 hash of the data
```

### printMsg() Function

Formatted console output:

```javascript
const { tools } = require('@63klabs/cache-data');

tools.printMsg('Application started', 'INFO');
tools.printMsg('Error occurred', 'ERROR', errorObject);
```

---

## ImmutableObject Class

Create immutable objects that cannot be modified after creation:

```javascript
const { tools } = require('@63klabs/cache-data');

const config = new tools.ImmutableObject({
  apiUrl: 'https://api.example.com',
  timeout: 5000
});

console.log(config.apiUrl); // 'https://api.example.com'

// Attempting to modify throws an error
config.apiUrl = 'https://other.com'; // Error!
config.newProp = 'value'; // Error!
delete config.timeout; // Error!
```

---

## Request and Response Classes

### APIRequest Class

Handle HTTP requests to external APIs:

```javascript
const { tools } = require('@63klabs/cache-data');

const request = new tools.APIRequest({
  method: 'GET',
  uri: 'https://api.example.com/data',
  headers: { 'Authorization': 'Bearer token' }
});

const response = await request.send();
console.log(response.statusCode, response.body);
```

### ClientRequest Class

Parse and validate incoming Lambda requests:

```javascript
const { tools } = require('@63klabs/cache-data');

exports.handler = async (event, context) => {
  const clientRequest = new tools.ClientRequest(event);
  
  const path = clientRequest.getPath();
  const method = clientRequest.getMethod();
  const headers = clientRequest.getHeaders();
  const queryParams = clientRequest.getQueryStringParameters();
  
  // ... handle request ...
};
```

### Response Class

Format Lambda responses:

```javascript
const { tools } = require('@63klabs/cache-data');

const response = new tools.Response();
response.setStatusCode(200);
response.setBody({ message: 'Success', data: results });
response.setHeader('Content-Type', 'application/json');

return response.get();
```

### ResponseDataModel Class

Manage response data structure:

```javascript
const { tools } = require('@63klabs/cache-data');

const dataModel = new tools.ResponseDataModel();
dataModel.setData(results);
dataModel.setMessage('Operation successful');
dataModel.setSuccess(true);

const response = new tools.Response();
response.setBody(dataModel.get());
```

---

## Generic Response Generators

Pre-built response formatters for common content types.

### JSON Response

```javascript
const { tools } = require('@63klabs/cache-data');

const response = tools.jsonGenericResponse(
  200,
  { message: 'Success', data: results }
);

return response;
```

### HTML Response

```javascript
const { tools } = require('@63klabs/cache-data');

const html = '<html><body><h1>Hello World</h1></body></html>';
const response = tools.htmlGenericResponse(200, html);

return response;
```

### XML Response

```javascript
const { tools } = require('@63klabs/cache-data');

const xml = '<?xml version="1.0"?><root><item>value</item></root>';
const response = tools.xmlGenericResponse(200, xml);

return response;
```

### RSS Response

```javascript
const { tools } = require('@63klabs/cache-data');

const rss = '<?xml version="1.0"?><rss version="2.0">...</rss>';
const response = tools.rssGenericResponse(200, rss);

return response;
```

### Text Response

```javascript
const { tools } = require('@63klabs/cache-data');

const text = 'Plain text response';
const response = tools.textGenericResponse(200, text);

return response;
```

---

## _ConfigSuperClass

Base class for application configuration. Extend this to create your own Config class:

```javascript
const { tools } = require('@63klabs/cache-data');

class Config extends tools._ConfigSuperClass {
  static async init() {
    // Initialize connections
    this._connections = new tools.Connections();
    
    // Add connections
    this._connections.add(new tools.Connection({
      name: 'apiConnection',
      host: 'api.example.com',
      path: '/data'
    }));
    
    // Load parameters from SSM
    const params = await this._initParameters([
      {
        group: 'app',
        path: '/myapp/config/',
        names: ['apiKey', 'secret']
      }
    ]);
    
    this._settings = params;
    
    // Initialize cache
    const { cache } = require('@63klabs/cache-data');
    cache.Cache.init({
      dynamoDbTable: process.env.CACHE_TABLE,
      s3Bucket: process.env.CACHE_BUCKET,
      secureDataKey: Buffer.from(params.app.secret, 'hex')
    });
  }
}

// Initialize at application boot
Config.init();

// Access later
const conn = Config.getConn('apiConnection');
const settings = Config.settings();
```

---

## Connections Classes

Manage connection configurations and authentication.

### Connection Class

```javascript
const { tools } = require('@63klabs/cache-data');

const connection = new tools.Connection({
  name: 'apiConnection',
  protocol: 'https',
  host: 'api.example.com',
  path: '/v1/data',
  headers: {
    'Content-Type': 'application/json'
  },
  parameters: {
    apiKey: 'your-key'
  }
});

// Add cache profile
connection.addCacheProfile({
  profile: 'default',
  defaultExpirationInSeconds: 300,
  encrypt: true
});

// Get as object
const connObj = connection.toObject();
```

### Connections Class

Manage multiple connections:

```javascript
const { tools } = require('@63klabs/cache-data');

const connections = new tools.Connections();

connections.add(new tools.Connection({
  name: 'api1',
  host: 'api1.example.com'
}));

connections.add(new tools.Connection({
  name: 'api2',
  host: 'api2.example.com'
}));

// Get connection
const api1 = connections.get('api1');
```

### ConnectionAuthentication Class

Manage authentication for connections:

```javascript
const { tools } = require('@63klabs/cache-data');

const auth = new tools.ConnectionAuthentication({
  type: 'bearer',
  token: 'your-token-here'
});

const connection = new tools.Connection({
  name: 'secureApi',
  host: 'api.example.com',
  authentication: auth
});
```

---

## API Reference

For detailed API documentation including all methods, parameters, and return types, refer to the JSDoc comments in the source code:

- **Timer class**: `src/lib/tools/Timer.class.js`
- **DebugAndLog class**: `src/lib/tools/DebugAndLog.class.js`
- **Response classes**: `src/lib/tools/Response.class.js`, `src/lib/tools/ResponseDataModel.class.js`
- **Request classes**: `src/lib/tools/APIRequest.class.js`, `src/lib/tools/ClientRequest.class.js`, `src/lib/tools/RequestInfo.class.js`
- **AWS classes**: `src/lib/tools/AWS.classes.js`
- **Parameter/Secret classes**: `src/lib/tools/CachedParametersSecrets.classes.js`
- **Connection classes**: `src/lib/tools/Connections.classes.js`
- **Utility classes**: `src/lib/tools/ImmutableObject.class.js`, `src/lib/tools/utils.js`
- **Response generators**: `src/lib/tools/generic.response.*.js`
- **Config class**: `src/lib/tools/index.js`

See JSDoc in source files for complete method signatures, parameters, return types, and usage examples.

---

## Related Documentation

- [Cache Module](../cache/README.md) - Caching functionality
- [Endpoint Module](../endpoint/README.md) - HTTP request handling
- [Quick Start Guide](../../00-quick-start-implementation/README.md) - Getting started
- [Advanced Implementation](../../01-advanced-implementation-for-web-service/README.md) - Web service patterns
