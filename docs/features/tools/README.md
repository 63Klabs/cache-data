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

- **[ApiRequest](#apirequest-class)**: HTTP request handling
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

- **[AppConfig](#configsuperclass)**: Base class for application configuration
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

If you wish to set the log level programmatically, do so before calling `Config.init()` by using `DebugAndLog.setLogLevel(level)` where level is an integer from `0` to `5` or one of the following strings: `'ERROR'`, `'WARN'`, `'INFO'`, `'MSG'`, `'DIAG'`, `'DEBUG'`.

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
const { tools: {Timer} } = require('@63klabs/cache-data');

const timerTaskGetGames = new Timer("Getting games", true); // We give it a name for logging, and we set to true so the timer starts right away

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
const { tools: {DebugAndLog} } = require('@63klabs/cache-data');

DebugAndLog.debug("Hello World");
DebugAndLog.msg("The sky is set to be blue today");
DebugAndLog.diag("Temperature log:", log);

try {
	// some code
} catch (error) {
	DebugAndLog.error("We have an error in try/catch 1", error);
}

try {
	// some code
} catch (error) {
	DebugAndLog.warn("We have an error but will log it as a warning in try/catch 2", error);
}
```

Before calling `Config.init()` you can set the log level using `DebugAndLog.setLogLevel()`. If you set the log level after calling `Config.init()` OR after calling any `DebugAndLog` function, you will get an error. That is because a default log level has already been set and we will not allow the changing of the log level after a script has begun.

There are seven (7) logging functions.

```js
const {tools: {DebugAndLog}} = require('@63klabs/cache-data');

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
const {tools: {sanitize}} = require('@63klabs/cache-data');

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

console.log("My Sanitized Object", sanitize(obj));
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
const {tools: {obfuscate}} = require('@63klabs/cache-data');

const str = "EXAMPLE1234567890123456789";

console.log( obfuscate(str) );
// output: ******6789

const opt = { keep: 6, char: 'X', len: 16 };
console.log( obfuscate(str, opt) );
// output: XXXXXXXXXX456789
```

### AWS-SDK

The @63klabs/cache-data package uses the AWS SDK for JavaScript v3 and requires Node.js 22 or later.

Note that `package.json` for @63klabs/cache-data only installs the AWS-SDK on dev environments. This is because AWS Lambda environments already include the AWS-SDK without requiring installs. This makes your application lighter and ensures you are always running the most recent SDK release.

Because DynamoDB, S3, SSM Parameter Store, and Secrets Manager are used by cache-data, only those SDKs are included. A client is provided for each along with limited number of commands. To make gets and puts easier a get and put command is mapped for DynamoDb and S3.

#### `tools.AWS` Object

When `tools` is imported, you can use the `tools.AWS` object to perform common read/write operations on S3, DynamoDb, and SSM Parameter Store.

```javascript
const { tools: {AWS} } = require('@63klabs/cache-data');

console.log(`NODE VERSION ${AWS.NODE_VER} USING AWS SDK ${AWS.SDK_VER}`);
console.log(`REGION: ${AWS.REGION}`); // set from Lambda environment variable AWS_REGION

var getParams = {
    Bucket: 'mybucket', // bucket name,
    Key: 'hello.txt' // object to get
}

const result = await AWS.s3.get(getParams);

let objectData = await result.Body.transformToString(); // V3: Object bodies in V3 are readable streams, so we convert to string
console.log(`hello.txt Body: ${objectData}`);
// outputs "hello.txt Body: Hello, World!"

```

The `tools.AWS` object provides the following:

```js
const {tools: {AWS}} = require('@63klabs/cache-data');

AWS.NODE_VER
AWS.NODE_VER_MAJOR
AWS.NODE_VER_MINOR
AWS.NODE_VER_PATCH
AWS.NODE_VER_MAJOR_MINOR
AWS.NODE_VER_ARRAY
AWS.REGION
AWS.SDK_VER
AWS.SDK_V2
AWS.SDK_V3
AWS.INFO // an object containing all of the properties listed above
AWS.dynamo.client
AWS.dynamo.put(params) // const result = await AWS.dynamo.put(params);
AWS.dynamo.get(params) // const result = await AWS.dynamo.get(params);
AWS.dynamo.scan(params) // const result = await AWS.dynamo.scan(params);
AWS.dynamo.delete(params) // const result = await AWS.dynamo.delete(params);
AWS.dynamo.update(params) // const result = await AWS.dynamo.update(params);
AWS.s3.client
AWS.s3.put(params) // const result = await AWS.s3.put(params)
AWS.s3.get(params) // const result = await AWS.s3.get(params)
AWS.ssm.client,
AWS.ssm.getByName(query) // const params = await AWS.ssm.getByName(query)
AWS.ssm.getByPath(query) // const params = await AWS.ssm.getByPath(query)
```

##### When clients are created

Each accessor (`AWS.dynamo`, `AWS.s3`, `AWS.ssm`, and `AWS.secrets`) loads its AWS SDK package and creates its client the first time it is read, then reuses that client for the life of the process. Requiring `@63klabs/cache-data` doesn't load these SDK packages, so a function only loads the ones for the services it uses.

In Lambda, that work happens in the first invocation that reads the accessor. Functions that need it done during the Lambda init phase, such as those using provisioned concurrency, can read the accessors at module scope:

```javascript
const { tools } = require("@63klabs/cache-data");

// Build the DynamoDB and S3 clients during the Lambda init phase
tools.AWS.dynamo;
tools.AWS.s3;
```

##### Using AWS SDK V3 through tools.AWS

To use the AWS SDK you normally have to import the proper SDKs and libraries, create a client, and then send the commands. However, since the package uses reads and writes to S3 objects, DynamoDb tables, and SSM Parameter store, it readily makes these commands available through the `AWS` object from `tools`.

To use the methods you only need to pass the parameter or query object as you normally would.

```javascript
// Given the two parameter/query objects:
const { tools: {AWS} } = require('@63klabs/cache-data');

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

const dbPutResult = await AWS.dynamo.put(paramsForPut);
const dbGetResult = await AWS.dynamo.get(paramsForGet);
```

Refer to the section about `tools.AWS` above for the variables, methods, and SDK objects available.

For more on creating parameter/query objects for S3, DynamoDb, and SSM Parameter Store:

- [Amazon S3 examples using SDK for JavaScript (v3)](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- [Using the DynamoDB Document Client](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html)

##### Import Additional Commands

When using AWS SDK version 3, you can import additional commands and use them with the client provided by `tools.AWS`.

```javascript
const { tools: {AWS} } = require('@63klabs/cache-data');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3'); // AWS SDK v3

const command = new DeleteObjectCommand({
    Bucket: "myBucket",
    Key: "good-bye.txt"
});

const response = await AWS.s3.client.send(command);
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
const { tools: {DebugAndLog} } = require('@63klabs/cache-data');
DebugAndLog.setLogLevel(3); // or 'MSG'
```

### Logging Methods

```javascript
const { tools: {DebugAndLog} } = require('@63klabs/cache-data');

DebugAndLog.log(msgStr, tagStr, obj);    // logs at ALL levels
DebugAndLog.error(msgStr, obj);          // logs at ALL levels
DebugAndLog.warn(msgStr, obj);           // logs at level 1+
DebugAndLog.info(msgStr, obj);           // logs at level 2+
DebugAndLog.msg(msgStr, obj);            // logs at level 3+
DebugAndLog.diag(msgStr, obj);           // logs at level 4+
DebugAndLog.debug(msgStr, obj);          // logs at level 5
```

### Usage Examples

```javascript
const { tools: {DebugAndLog} } = require('@63klabs/cache-data');

DebugAndLog.info('Application started');
DebugAndLog.debug('Debug information', { data: 'value' });

try {
  // some code
} catch (error) {
  DebugAndLog.error('Operation failed', error);
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
const { tools: {Timer} } = require('@63klabs/cache-data');

const timer = new Timer("Operation name", true); // true = start immediately

// ... do work ...

timer.stop(); // Logs elapsed time if log level >= 4 (DIAG)
```

### Getting Elapsed Time

```javascript
const { tools: {Timer} } = require('@63klabs/cache-data');

const timer = new Timer("Task");
timer.start();

// ... do work ...

const ms = timer.elapsed(); // Get elapsed time without stopping
console.log(`Elapsed: ${ms}ms`);

timer.stop(); // Stop and log
```

### Example

```javascript
const { tools: {Timer} } = require('@63klabs/cache-data');

const timer = new Timer("Fetching data", true);

const data = await fetchDataFromAPI();

timer.stop(); // Logs: "[DIAG] Fetching data: 245ms"
```

---

## AWS Object

Simplified access to AWS SDK for DynamoDB, S3, and SSM Parameter Store.

### AWS Information

```javascript
const { tools: {AWS} } = require('@63klabs/cache-data');

console.log(`Node ${AWS.NODE_VER} using AWS SDK ${AWS.SDK_VER}`);
console.log(`Region: ${AWS.REGION}`);
console.log(`SDK Version: ${AWS.SDK_V3 ? 'v3' : 'v2'}`);
```

### DynamoDB Operations

```javascript
const { tools: {AWS} } = require('@63klabs/cache-data');

// Put item
const putParams = {
  TableName: 'myTable',
  Item: {
    'id': '123',
    'name': 'John Doe',
    'email': 'john@example.com'
  }
};
await AWS.dynamo.put(putParams);

// Get item
const getParams = {
  TableName: 'myTable',
  Key: { 'id': '123' }
};
const result = await AWS.dynamo.get(getParams);
console.log(result.Item);

// Scan table
const scanParams = {
  TableName: 'myTable',
  FilterExpression: 'age > :age',
  ExpressionAttributeValues: { ':age': 18 }
};
const scanResult = await AWS.dynamo.scan(scanParams);

// Update item
const updateParams = {
  TableName: 'myTable',
  Key: { 'id': '123' },
  UpdateExpression: 'set #name = :name',
  ExpressionAttributeNames: { '#name': 'name' },
  ExpressionAttributeValues: { ':name': 'Jane Doe' }
};
await AWS.dynamo.update(updateParams);

// Delete item
const deleteParams = {
  TableName: 'myTable',
  Key: { 'id': '123' }
};
await AWS.dynamo.delete(deleteParams);
```

### S3 Operations

```javascript
const { tools: {AWS} } = require('@63klabs/cache-data');

// Put object
const putParams = {
  Bucket: 'myBucket',
  Key: 'data.json',
  Body: JSON.stringify({ data: 'value' }),
  ContentType: 'application/json'
};
await AWS.s3.put(putParams);

// Get object
const getParams = {
  Bucket: 'myBucket',
  Key: 'data.json'
};
const result = await AWS.s3.get(getParams);
const data = await result.Body.transformToString(); // SDK v3
console.log(data);
```

### SSM Parameter Store

```javascript
const { tools: {AWS} } = require('@63klabs/cache-data');

// Get parameters by name
const nameQuery = {
  Names: ['/app/config/apiKey', '/app/config/secret'],
  WithDecryption: true
};
const params = await AWS.ssm.getByName(nameQuery);

// Get parameters by path
const pathQuery = {
  Path: '/app/config/',
  WithDecryption: true
};
const pathParams = await AWS.ssm.getByPath(pathQuery);
```

### Using Additional AWS SDK Commands

```javascript
const { tools: {AWS}} = require('@63klabs/cache-data');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

const command = new DeleteObjectCommand({
  Bucket: 'myBucket',
  Key: 'old-file.txt'
});

const response = await AWS.s3.client.send(command);
```

---

## Cached Parameters and Secrets

Cache SSM parameters and Secrets Manager secrets to reduce API calls and improve performance.

These functions provide an interface to the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html) which must be installed as a layer to your Lambda function.

You will want to set your secrets and parameters during an initialization phase outside of your Lambda handler. This is typically done during a configuration initialization.

### CachedSsmParameter

```javascript
const { tools: {CachedSsmParameter} } = require('@63klabs/cache-data');

const apiKey = new CachedSsmParameter('/path/to/parameter/paramName', {
  refreshAfter: 43200 // Cache for 12 hours
});

// First call fetches from SSM
const key1 = await apiKey.getValue();

// Subsequent calls use cached value
const key2 = await apiKey.getValue();
```

### CachedSecret

```javascript
const { tools: {CachedSecret} } = require('@63klabs/cache-data');

const dbPassword = new CachedSecret('prod/db/password', {
  refreshAfter: 43200 // Cache for 12 hours
});

const password = await dbPassword.getValue();
```

### CachedParameterSecrets

When you create a `new CachedSecret` or `new CachedSsmParameter` they are automatically added to the CachedParameterSecrets. However, if you want to manage them as a group you can do so as well.

Manage multiple cached parameters and secrets:

```javascript
const { tools: {CachedParameterSecrets, CachedSsmParameter, CachedSecret} } = require('@63klabs/cache-data');

const secrets = new CachedParameterSecrets();

secrets.add(new CachedSsmParameter({ name: '/app/apiKey' }));
secrets.add(new CachedSecret({ name: 'prod/db/password' }));

// Prime all at once
await secrets.prime();

// Access individual values
const apiKey = secrets.get('/app/apiKey').sync_getValue();
const password = secrets.get('prod/db/password').sync_getValue();
```

## Data Utilities

### sanitize() Function

> **Note**: Sanitize does a best effort at scrubbing and is used as a last resort, do not log sensitive data!

Scrub sensitive data from objects for logging:

```javascript
const { tools: {sanitize} } = require('@63klabs/cache-data');

const obj = {
  username: 'john',
  password: 'secret123',
  apiKey: 'key-12345678',
  data: 'public info'
};

console.log(sanitize(obj));
// { username: 'john', password: '******123', apiKey: '******5678', data: 'public info' }
```

> **Note**: This attempts to sanitize but may miss sensitive information. Avoid logging sensitive data when possible.

### obfuscate() Function

Obfuscate strings by showing only the last few characters:

```javascript
const { tools: {obfuscate} } = require('@63klabs/cache-data');

const secret = '12345EXAMPLE7890';
console.log(obfuscate(secret));
// ******7890

// Custom options
const options = { keep: 6, char: 'X', len: 16 };
console.log(obfuscate(secret, options));
// XXXXXXXXXX456789
```

### hashThisData() Function

Generate hashes for data:

```javascript
const { tools: {hashThisData} } = require('@63klabs/cache-data');

const data = { user: 'john', action: 'login' };
const hash = hashThisData(data);
console.log(hash); // SHA-256 hash of the data
```

### printMsg() Function

Formatted console output:

```javascript
const { tools: {printMsg} } = require('@63klabs/cache-data');

printMsg('Application started', 'INFO');
printMsg('Error occurred', 'ERROR', errorObject);
```

## ImmutableObject Class

Create immutable objects that cannot be modified after creation:

```javascript
const { tools: {ImmutableObject} } = require('@63klabs/cache-data');

const config = new ImmutableObject({
  apiUrl: 'https://api.example.com',
  timeout: 5000
});

console.log(config.apiUrl); // 'https://api.example.com'

// Attempting to modify throws an error
config.apiUrl = 'https://other.com'; // Error!
config.newProp = 'value'; // Error!
delete config.timeout; // Error!
```

## Request and Response Classes

### ApiRequest Class

Handle HTTP requests to external APIs with automatic pagination, retry logic, and X-Ray tracing.

#### Basic Usage

```javascript
const { tools: {ApiRequest} } = require('@63klabs/cache-data');

const request = new ApiRequest({
  method: 'GET',
  uri: 'https://api.example.com/data',
  headers: { 'Authorization': 'Bearer token' }
});

const response = await request.send();
console.log(response.statusCode, response.body);
```

#### Automatic Pagination

Automatically fetch all pages from paginated APIs:

```javascript
const { tools: {ApiRequest} } = require('@63klabs/cache-data');

const request = new ApiRequest({
  host: 'api.example.com',
  path: '/users',
  parameters: {
    limit: 100  // Items per page
  },
  pagination: {
    enabled: true  // Enable automatic pagination
  }
});

const response = await request.send();

// Response contains all users from all pages combined
const allUsers = JSON.parse(response.body).items;
console.log(`Retrieved ${allUsers.length} total users`);

// Check pagination metadata
if (response.metadata?.pagination?.occurred) {
  console.log(`Fetched ${response.metadata.pagination.totalPages} pages`);
}
```

**Pagination Features:**
- Automatic page fetching with configurable batch size
- Custom field labels for different API structures
- Error handling with partial results
- Metadata about pages retrieved and total items

[View Pagination Guide →](./api-request-pagination.md)

#### Automatic Retry

Automatically retry failed requests with configurable conditions:

```javascript
const { tools: {ApiRequest} } = require('@63klabs/cache-data');

const request = new ApiRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 2  // 3 total attempts (1 initial + 2 retries)
  }
});

const response = await request.send();

// Check if retries occurred
if (response.metadata?.retries?.occurred) {
  console.log(`Succeeded after ${response.metadata.retries.attempts} attempts`);
}
```

**Retry Features:**
- Retry on network errors, server errors (5xx), empty responses
- Configurable retry conditions
- Metadata about retry attempts
- Automatic logging of retry attempts

[View Retry Guide →](./api-request-retry.md)

#### X-Ray Tracing

Automatic AWS X-Ray tracing for monitoring and debugging:

```javascript
const { tools: {ApiRequest} } = require('@63klabs/cache-data');

const request = new ApiRequest({
  host: 'api.example.com',
  path: '/data',
  note: 'Fetch analytics data',  // Appears in X-Ray
  retry: {
    enabled: true
  },
  pagination: {
    enabled: true
  }
});

const response = await request.send();

// X-Ray subsegment automatically created with:
// - Unique name for each request
// - Request/response annotations
// - Retry and pagination metadata
// - Timing information
```

**X-Ray Features:**
- Unique subsegment names for each request
- Annotations for filtering and searching
- Detailed metadata about retries and pagination
- Subsegments for paginated page requests

[View X-Ray Guide →](./api-request-xray.md)

#### Combining Features

Use pagination, retry, and X-Ray together:

```javascript
const { tools: {ApiRequest} } = require('@63klabs/cache-data');

const request = new ApiRequest({
  host: 'api.example.com',
  path: '/orders',
  parameters: {
    status: 'completed',
    limit: 200
  },
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  retry: {
    enabled: true,
    maxRetries: 2
  },
  pagination: {
    enabled: true,
    batchSize: 5
  }
});

const response = await request.send();

// Response includes metadata about both retries and pagination
console.log('Retry attempts:', response.metadata?.retries?.attempts);
console.log('Pages fetched:', response.metadata?.pagination?.totalPages);
console.log('Total items:', response.metadata?.pagination?.totalItems);
```

#### Configuration Options

**Request Configuration:**
```javascript
{
  method: 'GET',                    // HTTP method
  uri: 'https://...',               // Full URI (alternative to host/path)
  protocol: 'https',                // Protocol (if using host/path)
  host: 'api.example.com',          // API host
  path: '/data',                    // API path
  parameters: {},                   // Query parameters
  headers: {},                      // Request headers
  body: null,                       // Request body
  note: '',                         // Note for logging/X-Ray
  options: {
    timeout: 8000,                  // Timeout in milliseconds
    // ... other options
  }
}
```

**Pagination Configuration:**
```javascript
const paginationConfig = {
  enabled: false,                   // Must be explicitly enabled
  totalItemsLabel: 'totalItems',    // Field name for total count
  itemsLabel: 'items',              // Field name for items array
  offsetLabel: 'offset',            // Parameter name for offset
  limitLabel: 'limit',              // Parameter name for limit
  defaultLimit: 200,                // Default items per page
  batchSize: 5                      // Concurrent requests per batch
};
```

**Retry Configuration:**
```javascript
const retryConfig = {
  enabled: false,                   // Must be explicitly enabled
  maxRetries: 1,                    // Retry attempts (1 = 2 total attempts)
  retryOn: {
    networkError: true,             // Retry on network errors
    emptyResponse: true,            // Retry on empty responses
    parseError: true,               // Retry on JSON parse errors
    serverError: true,              // Retry on 5xx status codes
    clientError: false              // Don't retry on 4xx (default)
  }
};
```

#### Response Format

**Standard Response:**
```javascript
{
  success: boolean,
  statusCode: number,
  headers: object,
  body: string,
  message: string
}
```

**Response with Metadata (when retry or pagination occurs):**
```javascript
{
  success: boolean,
  statusCode: number,
  headers: object,
  body: string,
  message: string,
  metadata: {
    retries: {
      occurred: boolean,
      attempts: number,
      finalAttempt: number
    },
    pagination: {
      occurred: boolean,
      totalPages: number,
      totalItems: number,
      incomplete: boolean,
      error: string|null
    }
  }
}
```

#### Detailed Documentation

For comprehensive guides on each feature:

- **[Pagination Guide](./api-request-pagination.md)** - Complete pagination documentation with examples
- **[Retry Guide](./api-request-retry.md)** - Complete retry documentation with examples
- **[X-Ray Guide](./api-request-xray.md)** - Complete X-Ray tracing documentation

### ClientRequest Class

Parse and validate incoming Lambda requests.

Contains event and context information along with parsed properties of the request to be easily passed along to other methods.

```javascript
const { tools: {ClientRequest} } = require('@63klabs/cache-data');

exports.handler = async (event, context) => {
  const clientRequest = new ClientRequest(event);
  
  // a few examples of data you can access about the request
  const path = clientRequest.getPath();
  const method = clientRequest.getMethod();
  const headers = clientRequest.getHeaders();
  const queryParams = clientRequest.getQueryStringParameters();
  const props = clientRequest.getProps();
  const e = clientRequest.getEvent();
  const c = clientRequest.getContext();
  const ip = clientRequest.getClientIp();
  const userAgent = clientRequest.getClientUserAgent();
  
  // ... handle request ...
  processThisRequest(clientRequest);
};
```

> NOTE When accessed behind CloudFront: To ensure the user agent is passed along to API Gateway, use the AWS managed Origin Request Policy named AllViewerExceptHostHeader. This forwards the User-Agent along with most other viewer headers while maintaining the correct Host header required for API Gateway to route the request properly. See [Client IP resolution](#client-ip-resolution) for how the client IP is chosen and what to set for your deployment.

#### Client IP resolution

`getClientIp()` (and `getProps().client.ip`, and the client IP in the `RESPONSE` log line) never returns a value that only the client chose. By default it is `identity.sourceIp`, the address of the connection API Gateway received, which no header changed in any of the measurements in [CloudFront and API Gateway observations](../../cloudfront-notes/README.md). CloudFront and API Gateway append to whatever `X-Forwarded-For` the client sends, so the first entry of that header can be forged. When you set a hop count, the address is taken from the right end of the header instead, counting the number of trusted proxies you configure. Only one deployment needs a hop count: your own CloudFront in front of an edge-optimized API (T2).

##### Resolution order

At the default hop count of `0` only step 3 applies. The steps apply in order when you set a hop count of 1 or more. The first step that produces a valid IP address is used:

| Step | Source | Used when | Skipped when |
|------|--------|-----------|--------------|
| 1 | `CloudFront-Viewer-Address` header | `CACHE_DATA_TRUSTED_PROXY_HOPS` is 2 or more and the header holds a valid IP address (an optional port is removed, for example `198.51.100.10:46532` or `[2001:db8::1]:60776`) | The hop count is `0` or `1`, or the header is absent, or its value is not a valid IP address |
| 2 | `X-Forwarded-For` header, counted from the right by the hop count (a hop count of 2 selects the second entry from the right) | The hop count is 1 or more, the header has at least that many entries, and the selected entry is a valid IP address | The hop count is `0`, or the header is absent, or it has fewer entries than the hop count, or the selected entry is not a valid IP address |
| 3 | `requestContext.identity.sourceIp`, returned unchanged | Steps 1 and 2 produced nothing | `sourceIp` is absent |

An invalid or missing value in one step moves on to the next step. If no step produces a value, `getClientIp()` returns `null`.

A hop count that is too low selects the address of one of your own proxies. That is the wrong address, but never one the client wrote, because every entry to the right of the client's entries was appended by a proxy. A hop count that is too high is not safe. It selects an entry to the left of your real proxy chain, and the client can write those. With a count that is `k` higher than the real number of proxies, a client that sends at least `k` extra `X-Forwarded-For` entries chooses the result. With fewer, the header is shorter than the count and resolution falls through to `identity.sourceIp`. A count of `0` never reads `X-Forwarded-For`, so it has no such risk.

For example, an edge-optimized API with no CloudFront of your own (T1) has the real chain `C, M`, where `C` is the client and `M` is the AWS-managed edge. A client that adds one entry produces the header `192.0.2.1, 198.51.100.10, 203.0.113.30`, where `198.51.100.10` is `C` and `203.0.113.30` is `M`:

| Hop count | Selected | Why |
|-----------|----------|-----|
| 2 (matches the chain) | `198.51.100.10` | The client's address |
| 3 (one too high) | `192.0.2.1` | The entry the client wrote |
| 1 (one too low) | `203.0.113.30` | A proxy's address, not written by the client |
| 4 (two too high) | `identity.sourceIp` | The header has three entries, fewer than 4 |

##### Setting `CACHE_DATA_TRUSTED_PROXY_HOPS`

`CACHE_DATA_TRUSTED_PROXY_HOPS` is the number of trusted proxies that append to `X-Forwarded-For` between the client and your Lambda function. Set it as a Lambda environment variable.

| Value | Meaning |
|-------|---------|
| Unset, empty, or only whitespace | `0`, the default |
| `0` | Use `identity.sourceIp` only. Ignore `X-Forwarded-For` and `CloudFront-Viewer-Address`. Correct for T1, T3, and T4. In T2 it returns your own distribution's edge address (wrong, but not forgeable) |
| `1` | One trusted proxy: the chain of a Regional REST API with no CloudFront (T4). For honest traffic the same address as `0`. `CloudFront-Viewer-Address` is ignored |
| `2` | Two trusted proxies: the chain of T1 and T3. For honest traffic the same address as `0`. Reads `CloudFront-Viewer-Address`. In T3, a request sent straight to the API's URL can choose the result |
| `3` | Three trusted proxies: your own CloudFront in front of an edge-optimized REST API (T2) |
| Any other run of digits, such as `4` | That many trusted proxies |
| Anything else, such as `abc`, `-1`, `1.5`, or `2 hops` | A warning is logged once for each distinct value, then the default of `0` is used |

> **Note:** At the default, no topology lets a client choose the address `getClientIp()` returns. A hop count above the real number of proxies does (see above), so set a count only when you know your chain, and confirm it with the [marker check](#check-your-deployment). In T2 the default returns your own distribution's edge address. That is the wrong address, but not a forged one, and setting `3` returns the viewer.

##### Which value to set

In the chains below, `C` is the client, `V` is the viewer of your own CloudFront, `E` is the edge address of your own CloudFront distribution, and `M` is the edge address of the CloudFront distribution that AWS manages for an edge-optimized API. Entries to the left of the ones shown are anything the client chose to send.

| | Endpoint type | Your own CloudFront in front? | Value to set | Chain in `X-Forwarded-For` at Lambda | `identity.sourceIp` | `getClientIp()` returns | Effect of leaving the default (`0`) | Evidence |
|---|---------------|-------------------------------|--------------|--------------------------------------|---------------------|-------------------------|--------------------------------------|----------|
| T1 | Edge-optimized | No | `0` (the default; `2` also works) | `..., C, M` | `C` | `C` | None | Measured 2026-11-04 and 2026-11-09, [O1 and O3](../../cloudfront-notes/README.md#observations) |
| T2 | Edge-optimized | Yes | `3` | `..., V, E, M` | `E` | `V` at `3` | Returns `E`, your distribution's edge address. Wrong, not forgeable. At `3`, a request sent straight to the API's URL can choose the result unless the origin is verified | Measured 2026-11-04 and 2026-11-09, [O1, O3, and O4](../../cloudfront-notes/README.md#observations) |
| T3 | Regional | Yes | `0` | `..., V, E` | `V` | `V` | None | Measured 2026-11-09, [O1, O3, and O6](../../cloudfront-notes/README.md#observations) |
| T4 | Regional | No | `0` (`1` also works) | `..., C` | `C` | `C` | None | Measured 2026-11-04 (chain) and 2026-11-09, [O1, O3, and O5](../../cloudfront-notes/README.md#observations) |

The chains and `identity.sourceIp` values above were measured on REST APIs of each type. AWS defines `identity.sourceIp` as the address of the immediate TCP connection to the API Gateway endpoint ([API Gateway variables](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html)). It does not document what a Regional API reports when your own CloudFront is in front of it (T3), so that row rests on the measurement of 2026-11-09. If AWS changes this behavior, set the variable explicitly for your deployment.

With an edge-optimized API behind your own CloudFront, no single count is right for both paths to your function. Through your distribution the chain is `..., V, E, M` (count 3). A request sent straight to the API's `execute-api` URL has the chain `..., C, M` (count 2), so `3` can select an entry the client wrote. A Regional API behind your own CloudFront avoids the problem: `identity.sourceIp` is the viewer on both paths and the default `0` is correct. If you keep an edge-optimized API, set `3` and restrict the API to your distribution (see [Origin lock](#origin-lock-for-your-own-cloudfront-t2-and-t3)).

For example, in T2 a client that sends `X-Forwarded-For: 192.0.2.1` produces the chain `192.0.2.1, 198.51.100.10, 203.0.113.20, 203.0.113.30`, where `198.51.100.10` is the viewer, `203.0.113.20` is your distribution's edge, and `203.0.113.30` is the AWS-managed edge. With `CACHE_DATA_TRUSTED_PROXY_HOPS=3`, `getClientIp()` returns `198.51.100.10`. The forged `192.0.2.1` is never selected.

A client behind a corporate proxy that adds its own `X-Forwarded-For` entry is reported as the proxy's address, which is the address CloudFront saw, when a hop count of 1 or more is set.

HTTP APIs (payload format version 2) are not supported by `ClientRequest`.

##### About `CloudFront-Viewer-Address`

CloudFront can add a `CloudFront-Viewer-Address` header holding the viewer's IP address and port. It is sent to the origin only when the origin request policy includes it. The AWS managed `AllViewerExceptHostHeader` policy includes it: through a distribution that used it, the header reached a Regional API holding the real viewer address and port, and a value the viewer supplied was replaced (T3, measured 2026-11-09, observations [O6 and O7](../../cloudfront-notes/README.md#observations)). `getClientIp()` reads the header only when the hop count is 2 or more, so it does not read it at the default.

Whether the header can be trusted depends on the path. The AWS-managed distribution of an edge-optimized API dropped a viewer-supplied value, with or without your own CloudFront in front (T1 and T2, measured 2026-11-04 and 2026-11-09, [O4](../../cloudfront-notes/README.md#observations)). A Regional API with no CloudFront delivered a viewer-supplied value unchanged (T4, measured 2026-11-04 and 2026-11-09, [O5](../../cloudfront-notes/README.md#observations)), so do not set a hop count of 2 or more there. AWS does not document either behavior.

Because the AWS-managed distribution drops the header in T2, forwarding it from your own CloudFront gives nothing there, and at `3` `getClientIp()` uses `X-Forwarded-For`. Use the [marker check](#check-your-deployment) to see whether the header arrives.

##### Origin lock for your own CloudFront (T2 and T3)

The API Gateway endpoint stays reachable without going through your distribution. With an edge-optimized API and `3` set (T2), or any deployment that sets a count above the real chain, a request that skips your distribution can carry a forged `X-Forwarded-For` that `getClientIp()` selects. No code in this package can tell your CloudFront hop from a forged one. With a Regional API and the default `0`, a request that skips your distribution cannot change the address (measured 2026-11-09, observations [O3 and O8](../../cloudfront-notes/README.md#observations)), but it still bypasses your distribution's caching and web ACL.

> **Warning:** Only infrastructure prevents this. Restrict the API so that it accepts requests only from your distribution, for example with an origin-verify header that CloudFront adds and that AWS WAF or a Lambda authorizer checks. A third option is to set `CACHE_DATA_INGRESS_SECRET_NAME`, so that `ClientRequest` checks the header and your handler rejects a request that did not pass through your distribution (see [Ingress verification](#ingress-verification)). See the AWS blog post [Restricting access to HTTP APIs with a Lambda authorizer](https://aws.amazon.com/blogs/networking-and-content-delivery/restricting-access-http-api-gateway-lambda-authorizer/).

##### Ingress verification

When your distribution adds a secret header to every request it sends to the API, `ClientRequest` can tell your function whether a request carried that secret. The Atlantis network template adds the header `X-Atlantis-Origin-Secret` when `ApiOriginProtection` is `"true"`. The value is a Secrets Manager secret, and CloudFront replaces any value the viewer sent with the same header name ([O9](../../cloudfront-notes/README.md#observations)). When you set `CACHE_DATA_INGRESS_SECRET_NAME` to the name of that secret, `ClientRequest` compares the header with the secret's current and previous values and reports `getProps().client.ingress` as `direct`, `cloudfront`, or `unverified`. Rejecting a request stays in your handler, so you choose the status and the body. The template side (how the header and the secret are created) is described in the platform's [API ingress standard](https://github.com/63Klabs/atlantis-sam-templates/blob/main/docs/end-user/api-ingress-standard.md) and is not repeated here.

**What it proves.** A matching header proves that the request passed through a distribution configured with the secret. It is not authentication of the caller: anyone who can read the distribution configuration, or the secret, can read the value. A request without a match is not necessarily an attack, and a match does not identify the viewer.

###### Set up ingress verification

1. Enable `ApiOriginProtection` on the network stack and create the secret in the application stack, as the [API ingress standard](https://github.com/63Klabs/atlantis-sam-templates/blob/main/docs/end-user/api-ingress-standard.md) describes. The secret is named `<Prefix>-<ProjectId>-<StageId>-OriginSecret`.
2. Set the environment variables of your function:

   | Variable | Default | Meaning |
   |----------|---------|---------|
   | `CACHE_DATA_INGRESS_SECRET_NAME` | unset | Name or ARN of the secret. Unset or empty turns the check off, and every request reports `direct`. A value that is not a valid secret name or ARN reports `unverified` with reason `bad-configuration` and logs one error |
   | `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS` | `3600` | Seconds before a loaded secret is read again. A whole number from `60` to `86400`. Anything else logs one warning and uses `3600` |

3. Allow your function to read the secret. Add `secretsmanager:GetSecretValue` on the secret, and `kms:Decrypt` on the key if the secret uses a customer-managed KMS key:

   ```yaml
   # Function resource, Properties section
   Policies:
     - Version: "2012-10-17"
       Statement:
         - Sid: ReadIngressSecret
           Effect: Allow
           Action:
             - secretsmanager:GetSecretValue
           Resource: !Sub "arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:${Prefix}-${ProjectId}-${StageId}-OriginSecret-*"
         # Only if the secret is encrypted with a customer-managed key
         - Sid: DecryptIngressSecret
           Effect: Allow
           Action:
             - kms:Decrypt
           Resource: !Ref SecretKeyArn
   ```

   The function reads both the current and the previous version of the secret. A secret that has never been rotated has no previous version, which is normal and is not reported as a problem. You can use the [Parameters and Secrets Lambda Extension layer](../ssm-secrets-sdk-transport.md) or leave it out. Without the layer, the function calls Secrets Manager directly.

4. Load the secret before the first request. `ClientRequest` is created synchronously and cannot wait for a read. Use one of these:

   ```javascript
   const { tools: { ClientRequest, CachedParameterSecrets } } = require("@63klabs/cache-data");

   async function primeIngress() {
   	// Option A: prime everything cached, as in Config.prime()
   	await CachedParameterSecrets.prime();

   	// Option B: prime only the ingress secret.
   	// Resolves true when the check is off or the secret is loaded, false otherwise. It does not reject.
   	return ClientRequest.prime();
   }
   ```

   Both can be called repeatedly and together, and neither starts a second read while one is running. An application that sets `CACHE_DATA_INGRESS_SECRET_NAME` and does neither rejects requests with reason `secret-not-primed`.

5. Guard your handler with `isIngressVerified()`. Roll it out in monitor mode first, as described in [The INGRESS_UNVERIFIED log line](#the-ingress_unverified-log-line).

###### Reject unverified requests

`isIngressVerified()` returns `true` only when `getProps().client.ingress` is `cloudfront`. It returns `false` for `direct` and `unverified`, so a handler that enforces must set `CACHE_DATA_INGRESS_SECRET_NAME`: without it every request reports `direct` and the handler rejects all of them.

```javascript
const { tools: { ClientRequest, Response } } = require("@63klabs/cache-data");

exports.handler = async (event, context) => {
	// Load the ingress secret before creating a ClientRequest.
	// Not needed if Config.prime() already calls CachedParameterSecrets.prime().
	await ClientRequest.prime();

	const clientRequest = new ClientRequest(event, context);
	const response = new Response(clientRequest);

	if (!clientRequest.isIngressVerified()) {
		// 401, not 403 or 404: the Atlantis distribution rewrites those two to its landing page with HTTP 200
		response.setStatusCode(401);
		response.addHeader("Cache-Control", "no-store");
		response.addHeader("Expires", "0");
		response.setBody({ message: "Unauthorized" });
		return response.finalize();
	}

	// ... handle the request ...
	return response.finalize();
};
```

Use `401`, not `403` or `404`, because the distribution created by the Atlantis network template rewrites those two statuses to its landing page and answers with HTTP `200`. Send `Cache-Control: no-store` so that CloudFront does not cache the rejection and repeat it to other viewers.

Ingress does not change validation. `isValid()`, `getValidationReason()`, and the status codes they report are the same for an `unverified` request, which stays valid.

###### Ingress values and reason codes

`getProps().client.ingress` is set once, when the `ClientRequest` is constructed.

| Value | Meaning |
|-------|---------|
| `direct` | `CACHE_DATA_INGRESS_SECRET_NAME` is unset or empty. No check was made |
| `cloudfront` | The header equals the secret's current value, or its previous value when one exists |
| `unverified` | The check is on and the request did not verify. The reason code says why |

Every failure ends in `unverified`. Only an unset or empty variable gives `direct`.

| Reason code | Meaning | Usual cause |
|-------------|---------|-------------|
| `missing-header` | The header is absent, empty, or not a single string | A request that skipped the distribution; `ApiOriginProtection` is `"false"` |
| `mismatch` | The header matches neither the current nor the previous value | A guessed value; a distribution holding an old value; a stale container |
| `secret-not-primed` | The current value has not finished loading | Priming was skipped (step 4 of the setup) |
| `secret-unavailable` | The read of the current value finished without a value | Missing permission, wrong secret id, a Secrets Manager outage on a cold start |
| `secret-unusable` | The current value is empty, whitespace, or `BLANK` in any letter case | The application stack has not generated the secret |
| `bad-configuration` | The value of `CACHE_DATA_INGRESS_SECRET_NAME` is not a valid secret name or ARN | A typo in the secret id |

The comparison is exact (the whole secret string, with no trimming), uses a constant-time comparison, and matches the header name in any letter case.

###### The INGRESS_UNVERIFIED log line

Each unverified request writes one line, whether or not your handler later rejects it. The message is compact JSON with the reason code and nothing else: no address, no header value, and no secret name.

```text
[INGRESS_UNVERIFIED] {"reason":"mismatch"}
```

A request with ingress `direct` or `cloudfront` writes no such line. The `RESPONSE` line is unchanged. This CloudWatch Logs Insights query counts rejections by reason:

```text
fields @timestamp, @message
| filter @message like /INGRESS_UNVERIFIED/
| parse @message '"reason":"*"' as reason
| stats count() by reason, bin(5m)
```

To roll out without risk, run in monitor mode first:

1. Set `CACHE_DATA_INGRESS_SECRET_NAME` and prime, but do not reject yet.
2. Watch the line. Requests that came through your distribution should produce none. A `secret-not-primed`, `secret-unavailable`, or `secret-unusable` line means the setup is wrong. A `missing-header` line from traffic that should pass through the distribution means `ApiOriginProtection` is off or the request skipped the distribution.
3. When only requests that skip your distribution remain, add the `isIngressVerified()` guard.

###### Rotate the secret

Three places hold a copy of the secret, and each changes at a different time. Let R be the value of `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS`.

| Where | What it holds | When it changes | Delay |
|-------|---------------|-----------------|-------|
| Secrets Manager | Versions labeled `AWSCURRENT` and `AWSPREVIOUS` | `put-secret-value` moves the labels: the new value is current and the old value becomes previous | Immediate |
| CloudFront distribution | The `AWSCURRENT` value as of the last stack update | A stack update with a changed `ApiOriginSecretRevision` | About one to two minutes until the distribution is `Deployed` |
| Each warm Lambda container | A copy of the current and the previous value | The next `prime()` after R seconds. With the extension layer the copy may also be up to 300 seconds old | Up to R + 300 seconds |

Steps:

1. Deploy a version of your application that has `CACHE_DATA_INGRESS_SECRET_NAME` set, and confirm the secret loads (no `secret-*` lines).
2. Put the new value into the secret. The current value is now new and the previous value is old. The distribution still sends the old value, which still matches, and containers that refresh begin to accept both.
3. Wait at least R + 300 seconds (65 minutes at the default of `3600`), plus a margin, so that every warm container has refreshed on its own and no request is rejected.
4. Update the network stack with a changed `ApiOriginSecretRevision`. The distribution switches to the new value over one to two minutes. During the switch both values reach the function, and both are accepted.
5. Wait until the distribution is `Deployed`, plus a margin.
6. Retire the old value. Detach the `AWSPREVIOUS` label from the old version, or wait for the next rotation:

   ```bash
   # Find the version that holds the AWSPREVIOUS label
   aws secretsmanager list-secret-version-ids \
     --secret-id my-origin-lock-secret \
     --query "Versions[?contains(VersionStages, 'AWSPREVIOUS')].VersionId"

   # Detach the label. The version stays in the secret, but it is no longer the previous version
   aws secretsmanager update-secret-version-stage \
     --secret-id my-origin-lock-secret \
     --version-stage AWSPREVIOUS \
     --remove-from-version-id <version-id>
   ```

   After the command, a read of the previous version behaves as it does for a secret that was never rotated: the function treats it as "no previous version" and logs it at debug level only. Containers stop accepting the old value after up to R + 300 seconds, when their copy expires.

Do not put a second new value before step 4 finishes. The distribution would then send a value that is neither current nor previous, and every request would be rejected with `mismatch`.

**If you skip the wait.** If the stack update runs before every container has refreshed, a container that still holds the old values rejects the new header with `mismatch`. That mismatch starts a reload of the current and previous values in the background. The request that caused it is rejected, and so are requests that arrive before the reload finishes. A container starts at most one such reload per 60 seconds. Without the extension layer the container holds the new values within seconds. With the layer, a forced reload may return the extension's cached copy, which is at most 300 seconds old, so a stale container can need further mismatches (one reload per 60 seconds) and corrects itself within about 6 minutes. Compared with the 65 minutes of waiting for the refresh interval, a skipped wait costs minutes of rejected requests.

**What the mismatch reload does not do.** It does not shorten step 6. A retired value keeps matching the previous value a container has cached, so no mismatch occurs to trigger a reload. A header that is absent, empty, or not a string, an unusable secret, a secret that is not loaded, an unavailable secret, and an invalid configuration never start a reload, because a reload cannot fix them.

**Suspected leak.** Put the new value, detach the `AWSPREVIOUS` label as in step 6, make the functions start new containers (publish a new version or change any setting), and then update the stack. Legitimate traffic is rejected from the moment the containers restart until the distribution switches, about one to two minutes. The refresh interval does not delay revocation on this path.

A shorter interval shortens the wait in step 3 and the time before a retired value stops working, and it increases the number of Secrets Manager calls (two per warm container per interval). The outage after a skipped wait does not depend on it, because of the mismatch reload.

###### Ingress verification limits

- **Not authentication.** The secret proves passage through a distribution configured with it. Anyone who can read the distribution configuration, the secret, or a log that holds the header can present a matching value.
- **Never log the header or the secret.** The package does not write either value to any log, error message, or object it returns. Your code must not either. `sanitize()` is not a safe way to hide this value: it prints the last four characters of an alphanumeric value, and for a value that contains a character outside `a-z`, `0-9`, `+`, `_`, `:`, `.`, `-`, and `/`, it prints everything after the first such character. Code that logs `event` or `getClientHeaders()` outside `sanitize()` prints the full value.
- **REST API events only.** Like the rest of `ClientRequest`, ingress verification reads REST API (payload format version 1) events. An HTTP API (payload format version 2) event is not supported.
- **`client.sourceIp`.** `getProps().client.sourceIp` is `identity.sourceIp` exactly as API Gateway gave it, or `null` when it is missing, not a string, or empty (an HTTP API event gives `null`). On an edge-optimized API behind your own CloudFront it is an edge address, not the viewer ([O3](../../cloudfront-notes/README.md#observations)). `CACHE_DATA_TRUSTED_PROXY_HOPS` does not change it, and `client.ip` is unchanged by this feature. For example, `client.ip` can be `198.51.100.10` while `client.sourceIp` is `203.0.113.20`.
- **Stale containers.** A container can hold an old copy for up to R + 300 seconds after a rotation. See [Rotate the secret](#rotate-the-secret).
- **Outages.** A container that starts while Secrets Manager cannot be read has no value, so an enforcing handler rejects requests with `secret-unavailable` until a read succeeds. A container that already holds a value keeps it while a later read fails.

##### Check your deployment

**Check the configuration.** Find the endpoint type of your API, then find out whether a CloudFront distribution of your own has it as an origin. Replace `<id>` with your REST API id.

```bash
# Prints ["EDGE"] or ["REGIONAL"]
aws apigateway get-rest-api --rest-api-id <id> --query endpointConfiguration.types

# Lists distributions that have the API's execute-api domain as an origin
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Origins.Items[?starts_with(DomainName, '<id>.execute-api.')]].{Id: Id, Domain: DomainName}"
```

An empty list means no distribution of your own uses the API's default domain (T1 or T4, depending on the endpoint type). A distribution that reaches the API through an API Gateway custom domain name won't match, because its origin domain is your custom domain and not `<id>.execute-api.`. Check the origins of such distributions by hand.

**Check the hop count with a marker.** Set the log level to `DEBUG`, then send a request with a marker entry in `X-Forwarded-For`:

```bash
curl -H "X-Forwarded-For: 192.0.2.1" https://<your-api-or-distribution-url>/<path>
```

Find the debug-level log line that begins with `ClientIpResolver:` for that request. It reports the step that produced the IP, the hop count in use, and the number of `X-Forwarded-For` entries, without any addresses. The only entry not written by a proxy is your marker, so the number of trusted proxies in front of your function is the entry count minus one. That is the count that matches the chain, and it is the value to set for T2. For example, `xForwardedForEntries=4` means three proxies appended entries after your marker, so set `CACHE_DATA_TRUSTED_PROXY_HOPS=3`. For a Regional API, or an edge-optimized API with no CloudFront of your own, leave the default `0`. A count that matches the chain also works for honest traffic, but on another path to the same function a chain that is shorter or longer than the one you measured lets a client choose the result. When the step is `viewer-address`, the `CloudFront-Viewer-Address` header arrived and was used.

#### ClientRequest `getProps()`

You can also pass a lighter object using `getProps()` that contains many request properties:

```javascript
const { tools: {ClientRequest} } = require('@63klabs/cache-data');

exports.handler = async (event, context) => {
  const clientRequest = new ClientRequest(event);

  const props = clientRequest.getProps();

  // ... handle request ...
  processThisRequest(props);
}
```

The `getProps()` method returns data about the client request to use for routing and processing. 

```
{
  method: "POST", // GET|POST|PUT|DELETE|PATCH etc
  path: "users/1234", // path after the API Gateway Stage Name (from event.path)
  pathArray: ['users', '1234'], // array version of path (from event.path)
  resource: "users/{id}", // path template (from event.resource) use for routing and logging
  resourceArray: ['users', '{id}'], // path template (from event.resource) use for routing and logging
  pathParameters: {},
  queryStringParameters: {},
  headerParameters: {},
  cookieParameters: {},
  bodyParameters: {}, // body as an object if JSON was detected
  bodyPayload: "", // body as string
  client: {
    ip: "x.x.x.x", // IP of client (could be IPv4 or IPv6, or null; see Client IP resolution)
    sourceIp: "x.x.x.x", // address API Gateway received (identity.sourceIp), or null
    ingress: "direct", // "direct" (no ingress secret configured), "cloudfront" (secret verified), or "unverified"
    userAgent: "", // user agent of client (CloudFront origin policy must be AllViewerExceptHostHeader)
    origin: "", // origin host
    referrer: "example.com", // domain of referrer
    isAuthenticated: false, // authenticated client
    isGuest: true, // un-authenticated client
    authorizations: ['all'], // explicit authorizations from policy
    roles: ['guest'] // from a user record, can be used to determine authorization programatically
  },
  deadline: 123456677, // static timestamp
  calcMsToDeadline: function() // countdown
}
```

The `deadline` and `calcMsToDeadLine` properties utilize the timeout from `context.getRemainingTimeInMillis()` to determine how much time is remaining in the Lambda function's execution. This can be used to dynamically set external API timeouts or provide time to clean up/return a partial response if time is getting short. The `deadline` property is a static deadline which can be passed to methods to calculate time remaining on their own, whereas `calcMsToDeadline()` provides a dynamic output.

### Response Class

Format Lambda responses:

```javascript
const { tools: {Response} } = require('@63klabs/cache-data');

async function createResponse(clientRequest, results) {
  const response = new Response(clientRequest);
  response.setStatusCode(200);
  response.setBody({ message: 'Success', data: results });
  response.addHeader('X-Custom-Header', 'value');

  return response.finalize();
}
```

To send a response with no body, such as a `202 Accepted` or `204 No Content`, call `setBodyToNull()`; `setBody(null)` is ignored. See [Sending a response with no body](../../01-advanced-implementation-for-web-service/response-management.md#sending-a-response-with-no-body).

### ResponseDataModel Class

Manage response data structure:

```javascript
const { tools: {ResponseDataModel, Response} } = require('@63klabs/cache-data');

const dataModel = new ResponseDataModel();
dataModel.setData(results);
dataModel.setMessage('Operation successful');
dataModel.setSuccess(true);

const response = new Response();
response.setBody(dataModel.get());
```

## Generic Response Generators

Pre-built response formatters for common content types.

### JSON Response

```javascript
const { tools: {jsonGenericResponse} } = require('@63klabs/cache-data');

async function jsonResponse(results) {
  const response = jsonGenericResponse(
    200,
    { message: 'Success', data: results }
  );

  return response;
}
```

### HTML Response

```javascript
const { tools: {htmlGenericResponse} } = require('@63klabs/cache-data');

async function htmlResponse() {
  const html = '<html><body><h1>Hello World</h1></body></html>';
  const response = htmlGenericResponse(200, html);

  return response;
}
```

### XML Response

```javascript
const { tools: {xmlGenericResponse} } = require('@63klabs/cache-data');

async function xmlResponse() {
  const xml = '<?xml version="1.0"?><root><item>value</item></root>';
  const response = xmlGenericResponse(200, xml);

  return response;
}
```

### RSS Response

```javascript
const { tools: {rssGenericResponse} } = require('@63klabs/cache-data');

async function rssResponse() {
  const rss = '<?xml version="1.0"?><rss version="2.0">...</rss>';
  const response = rssGenericResponse(200, rss);

  return response;
}
```

### Text Response

```javascript
const { tools: {textGenericResponse} } = require('@63klabs/cache-data');

async function textResponse() {
  const text = 'Plain text response';
  const response = textGenericResponse(200, text);

  return response;
}
```

## AppConfig super class

Base class for application configuration. Extend this to create your own Config class.

Instead of initializing Connections, Response, ClientRequest and more individually, you can pass them all to the super class.

```javascript
// config/index.js
const { tools: {AppConfig} } = require('@63klabs/cache-data');

const settings = require("./settings.js");
const validations = require("./validations.js");
const connections = require("./connections.js");
const responses = require("./responses.js");

class Config extends AppConfig {
  static async init() {
						
    try {

      AppConfig.init( { settings, validations, connections, responses, debug: true } );

      // Cache settings
      Cache.init({
        secureDataKey: new CachedSsmParameter(process.env.PARAM_STORE_PATH+'CacheData_SecureDataKey', {refreshAfter: 43200}), // 12 hours
      });

    } catch (error) {
      DebugAndLog.error(`Could not initialize Config ${error.message}`, error.stack);
    }

    return AppConfig.promise();
				
	};

	static async prime() {
		return Promise.all([
			CacheableDataAccess.prime(),
			CachedParameterSecrets.prime()
		]);
	};
};

module.exports = {
	Config
};
```

```js
// handler.js

const {Config} = require('./config');

// Initialize at application boot
Config.init();

exports.handler = async (event, context) => {

  await Config.promise();
  await Config.prime();

  // Access later
  const {conn, cacheProfile} = Config.getConnCacheProfile('games', 'default'); // conn and profile
  const conn2 = Config.getConn('prediction'); // just conn
  const settings = Config.settings();

  // ... code

  return result
};
```

## Connections Classes

Manage connection configurations and authentication.

Below are examples of how to load connections manually, however, when using `Config` and `AppConfig` you can load a whole array of connections at once.

### Connection Class

```javascript
const { tools: {Connection} } = require('@63klabs/cache-data');

const connection = new Connection({
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
const { tools: {Connections, Connection} } = require('@63klabs/cache-data');

const connections = new Connections();

connections.add(new Connection({
  name: 'api1',
  host: 'api1.example.com'
}));

connections.add(new Connection({
  name: 'api2',
  host: 'api2.example.com'
}));

// Get connection
const api1 = connections.get('api1');
```

### ConnectionAuthentication Class

Manage authentication for connections:

```javascript
const { tools: {Connection, ConnectionAuthentication} } = require('@63klabs/cache-data');

const auth = new ConnectionAuthentication({
  type: 'bearer',
  token: 'your-token-here-but-brought-in-from-ssm-parameter-store'
});

const connection = new Connection({
  name: 'secureApi',
  host: 'api.example.com',
  authentication: auth
});
```

### Loading a bunch of connections during Config.init()

Connections file:

```js
// connections.js

const connections = [
	{
		name: "games",
		host: "api.chadkluck.net",
		path: "/games",
		cache: [
			{
				profile: "default",
				overrideOriginHeaderExpiration: true,
				defaultExpirationInSeconds: (5 * 60), // 5 minutes
				expirationIsOnInterval: true,
				headersToRetain: "",
				hostId: "chadkluck", // log entry label - only used for logging
				pathId: "games", // log entry label - only used for logging
				encrypt: true, // encrypt the data in the cache
			}
		]        
	}
]

module.exports = connections;
```

Configuration script:

```js
// config.js

const {tools: {AppConfig }} = require("@63klabs/cache-data");

const connections = require("./connections.js");

class Config extends AppConfig {
  static async init() {
		AppConfig.init( { connections } );
    return AppConfig.promise();
  }
}
```

## API Reference

For detailed API documentation including all methods, parameters, and return types, refer to the JSDoc comments in the source code:

- **Timer class**: `src/lib/tools/Timer.class.js`
- **DebugAndLog class**: `src/lib/tools/DebugAndLog.class.js`
- **Response classes**: `src/lib/tools/Response.class.js`, `src/lib/tools/ResponseDataModel.class.js`
- **Request classes**: `src/lib/tools/ApiRequest.class.js`, `src/lib/tools/ClientRequest.class.js`, `src/lib/tools/RequestInfo.class.js`
- **AWS classes**: `src/lib/tools/AWS.classes.js`
- **Parameter/Secret classes**: `src/lib/tools/CachedParametersSecrets.classes.js`
- **Connection classes**: `src/lib/tools/Connections.classes.js`
- **Utility classes**: `src/lib/tools/ImmutableObject.class.js`, `src/lib/tools/utils.js`
- **Response generators**: `src/lib/tools/generic.response.*.js`
- **Config class**: `src/lib/tools/index.js`

See JSDoc in source files for complete method signatures, parameters, return types, and usage examples.

---

## Related Documentation

- [AWS Lambda Powertools Integration](./powertools-integration.md) - Structured logging, enhanced tracing, and CloudWatch metrics
- [ApiRequest X-Ray Tracking](./api-request-xray.md) - X-Ray tracing for API requests
- [ApiRequest Pagination](./api-request-pagination.md) - Automatic pagination
- [ApiRequest Retry](./api-request-retry.md) - Automatic retry logic
- [Cache Module](../cache/README.md) - Caching functionality
- [Endpoint Module](../endpoint/README.md) - HTTP request handling
- [Quick Start Guide](../../00-quick-start-implementation/README.md) - Getting started
- [Advanced Implementation](../../01-advanced-implementation-for-web-service/README.md) - Web service patterns
