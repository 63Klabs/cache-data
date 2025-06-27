# Cache Data

A package for node.js applications to access and cache data from remote API endpoints or other sources using AWS S3 and DynamoDb. 

> Note: This repository and package has moved from chadkluck to 63Klabs but is still managed by the same developer.

[@63klabs/cache-data on npmjs.com](https://www.npmjs.com/package/@63klabs/cache-data)

## Description

For Lambda functions written in Node.js that require caching of data either of an internal process or external data sources such as APIs. It is written specifically to be used in AWS Lambda functions using the Node runtime. However, it can be used in EC2 or other environments to access S3 and DynamoDb. While out of the box it can fetch data from remote endpoint APIs, custom Data Access Objects can be written to provide caching of data from all sorts of sources including resource expensive database calls.

It also has several utility functions such as one that can load sensitive data from AWS SSM Parameter Store at load time.

This package has been used in production for applications receiving over 1 million requests per week with a 75% cache-hit rate lowering latency to less than 100ms in most cases. This is a considerable improvement when faced with resource intense processes, connection pools, API rate limits, and slow endpoints.

## Getting Started

### Requirements

* Node >18 runtime on Lambda
* AWS Lambda, S3 bucket, DynamoDb table, and SSM Parameter Store
* A basic understanding of CloudFormation, Lambda, S3, DynamoDb, and SSM Parameters
* A basic understanding of IAM policies, especially the Lambda Execution Role, that will allow Lambda to access S3, DynamoDb, and SSM Parameter Store
* Lambda function should have between 512MB and 1024MB of memory allocated. (256MB minimum). See [Lambda Optimization: Memory Allocation](./docs/lambda-optimization/README.md#lambda-memory-allocation).

### Installing

1. Make sure your function is using an AWS Lambda supported version of Node and has at least 256MB allocated (512-1024MB recommended).
2. Add the cache-data environment variables to your Lambda function. Also update your Lambda's execution role to access your S3 and DynamoDb.
3. Add an S3 bucket and DynamoDb table to store your cache either in the application CloudFormation template or as separate infrastructure.
4. Install the @63klabs/cache-data package `npm install @63klabs/cache-data`
5. Add the cache code to your Lambda function

I recommend using the quick-start method when implementing for the first time. It comes with default values and requires less CloudFormation yaml and Node code.

- [Quick Start Implementation](./docs/00-quick-start-implementation/README.md)
- [Advanced Implementation](./docs/00-advanced-implementation/README.md)

#### Lambda Environment Variables and Execution Role

Below are some typical CloudFormation template settings for use with Lambda functions using Cache-Data:

```yaml
Parameters:
  CacheDataDbMaxCacheSizeInKB:
    Type: Number
    Description: "DynamoDb does better when storing smaller pieces of data. Choose the cut-off in KB that large objects should be stored in S3 instead (10)"
    Default: 10
    MinValue: 10
    MaxValue: 200
    ConstraintDescription: "Numeric value between 10 and 200 (inclusive)"
  CacheDataCryptIdHashAlgorithm:
    Type: String
    Description: "Hash algorithm used for generating the URI ID to identify cached requests. This is for generating IDs, not crypto."
    Default: "RSA-SHA256"
    AllowedValues: ["RSA-SHA256", "RSA-SHA3-224", "RSA-SHA3-256", "RSA-SHA3-384", "RSA-SHA3-512"]
    ConstraintDescription: "Use possible hashes available from Node.js in the RSA- category (RSA-SHA256 to RSA-SM3)"
  CacheDataCryptSecureDataAlg:
    Type: String
    Description: "Cryptographic algorithm to use for storing sensitive cached data in S3 and DynamoDb"
    Default: "aes-256-cbc"
    AllowedValues: ["aes-256-cbc", "aes-256-cfb", "aes-256-cfb1", "aes-256-cfb8", "aes-256-ofb"]
    ConstraintDescription: "Use possible cipher algorithms available (crypto.getCiphers()) from Node.js in the aes-256-xxx category"
  CacheDataErrorExpirationInSeconds:
    Type: Number
    Description: "How long should errors be cached? This prevents retrying a service that is currenlty in error too often (300 is recommended)"
    Default: 300
    MinValue: 1
    ConstraintDescription: "Choose a value of 1 or greater"
  CacheDataPurgeExpiredCacheEntriesInHours:
    Type: Number
    Description: "The number of hours expired cached data should be kept before purging. Expired cache data may be used if the source returns an error."
    Default: 24
    MinValue: 1
    ConstraintDescription: "Choose a value of 1 or greater"
  CacheDataPurgeAgeOfCachedBucketObjInDays:
    Type: Number
    Description: "Similar to CacheData_PurgeExpiredCacheEntriesInHours, but for the S3 Bucket. S3 calculates from time object is created/last modified (not accessed). This should be longer than your longest cache expiration set in custom/policies. Keeping objects in S3 for too long increases storage costs. (30 is recommended)"
    Default: 15
    MinValue: 3
    ConstraintDescription: "Choose a value of 3 days or greater. This should be slightly longer than the longest cache expiration expected"
  CacheDataTimeZoneForInterval:
    Type: String
    Description: "Cache-Data may expire using an interval such as every four, six, twelve, ... hours on the hour starting at midnight. What timezone holds the midnight to calculate from?"
    Default: "Etc/UTC"
    AllowedValues: ["Etc/UTC", "America/Puerto_Rico", "America/New_York", "America/Indianapolis", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"] # https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
    ConstraintDescription: "Common examples for United States of America. Accepted values can be changed in the template for your region."
  CacheDataAWSXRayOn:
    Type: String
    Description: "Turn on AWS XRay tracing for Cache-Data"
    Default: "false"
    AllowedValues: ["true", "false"]
    ConstraintDescription: "Accepted values are true or false"

Conditions:
  IsProduction: !Equals [!Ref DeployEnvironment, "PROD"]

Resources:

  # API Gateway

  WebApi:
    Type: AWS::Serverless::Api
    Properties: 
      Name: !Sub '${APPLICATION-API}-WebApi'
      StageName: !Ref ApiPathBase
      PropagateTags: True
      TracingEnabled: True
      OpenApiVersion: 3.0.0

  # Lambda Function

  AppFunction:
    Type: AWS::Serverless::Function
    Properties:
      # ...
      Runtime: nodejs22.x
      MemorySize: 1028
      Role: !GetAtt LambdaExecutionRole.Arn

      # Lambda Insights and X-Ray
      Tracing: !If [ IsNotDevelopment, "Active", !Ref 'AWS::NoValue'] # X-Ray

      Layers:
        # Lambda Insights and Param Secrets - Account and Version are Mapped in as they vary by region and architecture - Update regions and versions in Mapping section
        - !Sub "arn:aws:lambda:${AWS::Region}:${InsightsAccount}:layer:LambdaInsightsExtension:${Version}"
        - !Sub "arn:aws:lambda:${AWS::Region}:${ParamAccount}:layer:AWS-Parameters-and-Secrets-Lambda-Extension:${Version}"

      Environment:
        Variables:

          NODE_ENV: !If [ IsProduction, "production",  "development"] # Deployed applications should be run as "production" but if you need to drop it down to "development" you can when running in a TEST or DEV DEPLOY_ENVIRONMENT.
          DEPLOY_ENVIRONMENT: !Ref DeployEnvironment # PROD, TEST, DEV - a different category of environment.
          LOG_LEVEL: !If [ IsProduction, "0",  "5"] # 0 for prod, 2-5 for non-prod
          PARAM_STORE_PATH: "/" # SSM Parameter store can use a hierarchy to organize your apps parameters
          
          # Cache-Data settings (from: https://www.npmjs.com/package/@63klabs/cache-data)
          CACHE_DATA_DYNAMO_DB_TABLE: !Ref CacheDataDynamoDbTable
          CACHE_DATA_S3_BUCKET: !Ref CacheDataS3Bucket
          CACHE_DATA_SECURE_DATA_ALGORITHM: !Ref CacheDataCryptSecureDataAlg
          CACHE_DATA_ID_HASH_ALGORITHM: !Ref CacheDataCryptIdHashAlgorithm
          CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB: !Ref CacheDataDbMaxCacheSizeInKB
          CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS: !Ref CacheDataPurgeExpiredCacheEntriesInHours
          CACHE_DATA_ERROR_EXP_IN_SECONDS: !Ref CacheDataErrorExpirationInSeconds
          CACHE_DATA_TIME_ZONE_FOR_INTERVAL: !Ref CacheDataTimeZoneForInterval
          CACHE_DATA_AWS_X_RAY_ON: !Ref CacheDataAWSXRayOn
          CACHE_DATA_USE_TOOLS_HASH_METHOD: true

  # -- LambdaFunction Execution Role --

  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "${LAMBDA_EXECUTION_ROLE_NAME}-ExecutionRole"
      Description: "IAM Role that allows the Lambda permission to execute and access resources"
      Path: /

      AssumeRolePolicyDocument:
        Statement:
        - Effect: Allow
          Principal:
            Service: [lambda.amazonaws.com]
          Action: sts:AssumeRole

      # These are for application monitoring via LambdaInsights and X-Ray
      ManagedPolicyArns:
        - 'arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy'
        - 'arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess'

      # These are the resources your Lambda function needs access to
      # Logs, SSM Parameters, DynamoDb, S3, etc.
      # Define specific actions such as get/put (read/write)
      Policies:
      - PolicyName: LambdaResourceAccessPolicies
        PolicyDocument:
          Statement:

          - Sid: LambdaAccessToWriteLogs
            Action:
            - logs:CreateLogGroup
            - logs:CreateLogStream
            - logs:PutLogEvents
            Effect: Allow
            Resource: !GetAtt AppLogGroup.Arn

          # cache-data Parameter Read Access (from: https://www.npmjs.com/package/@63klabs/cache-data)
          - Sid: LambdaAccessToSSMParameters
            Action:
            - ssm:DescribeParameters
            - ssm:GetParameters
            - ssm:GetParameter
            - ssm:GetParametersByPath
            Effect: Allow
            Resource: 
            - !Sub "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter${ParameterStoreHierarchy}*"

          # cache-data S3 bucket (from: https://www.npmjs.com/package/@63klabs/cache-data)
          - Sid: LambdaAccessToS3BucketCacheData
            Action:
            - s3:PutObject
            - s3:GetObject
            - s3:GetObjectVersion
            Effect: Allow
            Resource: !Join [ '', [ !GetAtt CacheDataS3Bucket.Arn, '/cache/*' ] ]

          # cache-data DynamoDb table (from: https://www.npmjs.com/package/@63klabs/cache-data)
          - Sid: LambdaAccessToDynamoDBTableCacheData
            Action:
            - dynamodb:GetItem
            - dynamodb:Scan
            - dynamodb:Query
            - dynamodb:BatchGetItem
            - dynamodb:PutItem
            - dynamodb:UpdateItem
            - dynamodb:BatchWriteItem
            Effect: Allow
            Resource: !GetAtt CacheDataDynamoDbTable.Arn

```

#### Cache-Data DynamoDb and S3 CloudFormation Resource Templates

Use the following as an example for creating your DynamoDb and S3 cache storage locations.

You can create a centrally-shared DynamoDb table and S3 location for use among all your instances (each instance has its own encryption key to prevent cache-sharing/exposure).

You can also add the DynamoDbTable and CacheDataS3Bucket to each application template individually. However, this will quickly increase the number of S3 buckets and DynamoDb tables to keep track of.

```yaml
Resources:

  # ... all your other resources
  # ... make sure your Lambda function has between 512MB and 1024MB allocated (256MB minimum)
  # ... also make sure you added environment variables to your Lambda function
  # ... and make sure your Lambda Execution Role grants access to your DynamoDb and S3 buckets

  # ---------------------------------------------------------------------------
  # Cache-Data
  # From: https://www.npmjs.com/package/@63klabs/cache-data
  # Your Lambda function will need access via the Execution Role

  # -- Cache-Data DynamoDb Table --

  CacheDataDynamoDbTable:
    Type: AWS::DynamoDB::Table
    Description: Table to store Cache-Data. 
    Properties:
      TableName: !Sub '${YOUR-DYNAMODB-TABLE}-CacheData'
      AttributeDefinitions: 
        - AttributeName: "id_hash"
          AttributeType: "S"
      KeySchema: 
        - AttributeName: "id_hash"
          KeyType: "HASH"
      TimeToLiveSpecification:
        AttributeName: "purge_ts"
        Enabled: true
      BillingMode: "PAY_PER_REQUEST"


  # -- Cache-Data S3 Bucket --

  CacheDataS3Bucket:
    Type: AWS::S3::Bucket
    Description: S3 Bucket to store Cache-Data too big for DynamoDb. Cache-Data stores objects in /cache directory. The application may store additional data outside of the cache directory.
    Properties:
      BucketName: !Sub "${YOUR-BUCKET-NAME}-cachedata"
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      LifecycleConfiguration:
        Rules:
          - Id: "ExpireObjects"
            AbortIncompleteMultipartUpload:
              DaysAfterInitiation: 1
            ExpirationInDays: !Ref CacheDataPurgeAgeOfCachedBucketObjInDays
            Prefix: "cache" # this will limit this policy to YOURBUCKETNAME/cache/*
            NoncurrentVersionExpirationInDays: !Ref CacheDataPurgeAgeOfCachedBucketObjInDays
            Status: "Enabled" # Enable only if you are going to use this LifecycleConfiguration

  # -- Cache-Data S3 Bucket Policy --

  CacheDataS3BucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref CacheDataS3Bucket
      PolicyDocument:
        Version: "2012-10-17"
        Id: SecurityPolicy
        Statement:
          - Sid: "DenyNonSecureTransportAccess"
            Effect: Deny
            Principal: "*"
            Action: "s3:*"
            Resource:
              - !GetAtt CacheDataS3Bucket.Arn
              - !Join [ '', [ !GetAtt CacheDataS3Bucket.Arn, '/*' ] ]
            Condition:
              Bool:
                "aws:SecureTransport": false

```

#### Install npm Package and Add Starter Code

1. Go to your application directory
2. Run the command `npm i @63klabs/cache-data`
3. Add `const { tools, cache, endpoint } = require('@63klabs/cache-data');` to your script
4. Add a Config class to your script. This should be placed before the handler so it only is defined during cold starts. This can also be imported from a separate script.
5. Add `Config.init()` after the Config class but before the handler.
5. Add `await tools.Config.promise();` in the handler to make sure the Config has completed.

```javascript
const { tools, cache, endpoint } = require('@63klabs/cache-data');

class Config extends tools._ConfigSuperClass {
	static async init() {
		tools._ConfigSuperClass._promise = new Promise(async (resolve, reject) => {
        resolve(true);
    };
  };

/* initialize the Config */
obj.Config.init();

exports.handler = async (event, context, callback) => {
  await tools.Config.promise();
  let response = {
			statusCode: 200,
			body: JSON.stringify({message: "Hello from Lambda!"}),
			headers: {'content-type': 'application/json'}
	};

	callback(null, response);
}
```

Note: `DEPLOY_ENVIRONMENT` is only one of the possible runtime environment variables the script checks for. You may also use `env`, `deployEnvironment`, `environment`, or `stage`. Also note the confusion that may be had when we are talking about "environment" as it refers to both Lambda Runtime Environment Variables as well as a variable denoting a Deployment Environment (Production, Development, Testing, etc.), and the standard `NODE_ENV` variable.

(Runtime Environment variables are accessed using `process.env.`_`variableName`_.)

### Usage

Note: There is a sample app and tutorial that works with a CI/CD pipeline available at the repository: [serverless-webservice-template-for-pipeline-atlantis](https://github.com/chadkluck/serverless-webservice-template-for-pipeline-atlantis)

#### Config

##### Parameters and Secrets

Cache-Data requires an 32 character hexadecimal key to encrypt data when at rest. This can be stored in an SSM Parameter named `crypt_secureDataKey`.

You have two options for storing and retrieving your SSM Parameters:

1. Using the Cache-Data SSM Parameter access function.
2. Using the AWS Parameter and Secrets Lambda Extension.

Both are easily accessed using functions in the Cache-Data toolkit.

###### Option 1: Cache-Data SSM Parameter access function

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
exports.handler = async (event, context, callback) => {

	/* wait for CONFIG to be settled as we need it before continuing. */
	await Config.promise();

	/* Process the request and wait for result */
	const response = await someFunction(event, context); // some code or function that generates a response

	/* Send the result back to API Gateway */
	callback(null, response);

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
	endpoint.getDataDirectFromURI, // this is the function you want to invoke to get fresh data if the cache is stale. (conn and null will be passed to it)
	conn, // connection information which will be passed to endpoint.getDataDirectFromURI() to get fresh data. Also used to identify the object in cache
	null // this parameter can be used to pass additional data to endpoint.getDataDirectFromURI (or any other DAO)
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

Creating a connection is similar to above, we can add an authorization property to the conection:

```js
authentication: {
  parameters: {
    apikey: new tools.CachedSSMParameter('/apps/my_cool_app/demoAPIkey', {refreshAfter: 300}),
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

### tools.Timer

In its simplist form we can do the following:

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

## Advanced

The examples above should get you started.

However, there are advanced uses for the Cache object such as caching processed data not from an endpoint and creating your own Data Access Object (DAO) classes.

### Caching data not from a remote endpoint

Cache does not have to be from a remote endpoint.

Suppose you gather data from six endpoints and process the data in a resource and time intensive process and would like to cache the result for 6 or 24 hours. You can use the Cache object to store any data from any source, either externally or internally.

The function parameter passed to the Cache object is the method used to obtain data. Remember the `endpoint.getDataDirectFromURI` from the code sample above? That is just a function to return a bare bones response from an api endpoint. (You can actually extend the `endpoint.Endpoint` class and create your own DAOs that can pre and post process data before returning to your application's cache.)

Instead of passing in the function `endpoint.getDataDirectFromURI` you can create any function that will grab or process data and return an object.

Remember, when passing functions for another function to execute, do not include the `()` at the end.

### Creating your own Data Access Object (DAO)

You can either extend `endpoint.Endpoint` or create your own.

### Sanitize and Obfuscate functions

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

Node 16 environments will use AWS-SDK version 2.

Node 18+ environments will use AWS-SDK version 3.

Note that `package.json` for @63klabs/cache-data only installs the AWS-SDK on dev environments. This is because AWS Lambda already includes the AWS-SDK  without requiring installs. This makes your application lighter and ensures you are always running the most recent SDK release. Given this, that means that AWS SDK v3 is not available in Lambda functions using Node 16, and v2 is not available in Lambda Node >=18 environments.

Because DynamoDb, S3, and SSM Parameter store are used by cache-data, only those SDKs are included. A client is provided for each along with limited number of commands. To make gets and puts easier a get and put command is mapped for DynamoDb and S3. (Uses appropriate commands underneath for V2 and V3 so your code wouldn't need to change.)

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
{
	NODE_VER: '20.6.0',
	NODE_VER_MAJOR: 20,
	NODE_VER_MINOR: 6,
	NODE_VER_PATCH: 0,
	NODE_VER_MAJOR_MINOR: '20.6',
	NODE_VER_ARRAY: [ 20, 6, 0 ],
	REGION: "us-east-1", // Set from Node environment process.env.AWS_REGION
	SDK_VER: "V3",
	SDK_V2: false, // if (tools.AWS.SDK_V2) { console.log('AWS SDK Version 2!'); }
	SDK_V3: true, // if (tools.AWS.SDK_V3) { console.log('AWS SDK Version 3!'); }
	INFO: { /* an object containing all of the properties listed above */ }
	dynamo: {
		client: DynamoDBDocumentClient,
		put: (params) => client.send(new PutCommand(params)), // const result = await tools.AWS.dynamo.put(params);
		get: (params) => client.send(new GetCommand(params)), // const result = await tools.AWS.dynamo.get(params);
		scan: (params) => client.send(new ScanCommand(params)), // const result = await tools.AWS.dynamo.scan(params);
		delete: (params) => client.send(new DeleteCommand(params)), // const result = await tools.AWS.dynamo.delete(params);
		update: (params) => client.send(new UpdateCommand(params)), // const result = await tools.AWS.dynamo.update(params);
		sdk: {
			DynamoDBClient,
			DynamoDBDocumentClient,
			GetCommand,
			PutCommand
		}
	},
	s3: {
		client: S3,
		put: (params) => client.send(new PutObjectCommand(params)), // const result = await tools.AWS.s3.put(params)
		get: (params) => client.send(new GetObjectCommand(params)), // const result = await tools.AWS.s3.get(params)
		sdk: {
			S3,
			GetObjectCommand,
			PutObjectCommand							
		}

	},
	ssm: {
		client: SSMClient,
		getByName: (params) => client.send(new GetParametersCommand(query)), // const params = await tools.AWS.ssm.getByName(query)
		getByPath: (params) => client.send(new GetParametersByPathCommand(query)), // const params = await tools.AWS.ssm.getByPath(query)
		sdk: {
			SSMClient,
			GetParametersByPathCommand,
			GetParametersCommand
		}
	}
}
```

Because Node 16 and the AWS SDK v2 are being deprecated, this documentation will mainly cover AWS SDK v3. However, `{DynamoDb, S3, SSM}` are still available when your environment is using Node 16 and AWS SDK v2 by importing `tools` from cache-data and accessing the `AWS` class. (See Using AWS SDK V2 through tools.AWS (Deprecated) below.)

##### Using AWS SDK V3 through tools.AWS

To use the AWS SDK you normally have to import the proper SDKs and libraries, create a client, and then send the commands. The way this is accomplished in version 2 and version 3 of the AWS SDK is slightly different. How to use the AWS SDK is beyond the scope of this package. However, since the package uses reads and writes to S3 objects, DynamoDb tables, and SSM Parameter store, it readily makes these commands available through the `AWS` object from `tools`.

Also, as a shortcut as you move from Node 16 and Node 18 (and above), the methods exposed will not differ as it automatically uses the correct methods for the loaded SDK.

To use the methds you only need to pass the parameter or query object as you normally would.

```javascript
// Given the two parameter/query objects:

let paramsForPut = {
	TableName: 'myTable',
  	Item: {
		'hash_id': '8e91cef4a27',
		'episode_name': "There's No Disgrace Like Home",
		'air_date': "1990-01-28",
		'production_code': '7G04'
  }
}

let paramsForGet = {
	TableName: 'myTable',
	Key: {'hash_id': '8e91cef4a27'}
};
```

```javascript
// Using AWS SDK V2
const { DynamoDb } = require('aws-sdk');

const dbDocClient = new DynamoDB.DocumentClient( {region: 'us-east-1'} );

const dbPutResult = await dbDocClient.put(paramsForNewRecord).promise();
const dbGetResult = await dbDocClient.get(paramsForGet).promise();
```

```javascript
// Using AWS SDK V3
const { DynamoDBClient} = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand} = require("@aws-sdk/lib-dynamodb");

const dbClient = new DynamoDBClient({ region: AWS.REGION });
const dbDocClient = DynamoDBDocumentClient.from(dbClient);

const dbPutResult = await dbDocClient.send(PutCommand(paramsForNewRecord));
const dbGetResult = await dbDocClient.send(GetCommand(paramsForGetRecord));
```

```javascript
// Using tools to handle the SDK version and basic calls for you
const { tools } = require('@63klabs/cache-data');

const dbPutResult = await tools.AWS.dynamodb.put(paramsForNewRecord);
const dbGetResult = await tools.AWS.dynamodb.get(paramsForGetRecrod);
```

Refer to the section about the tools.AWS above for the variables, methods, and SDK objects available.

For more on creating parameter/query objects for S3, DynamoDb, and SSM Parameter Store:

- [Amazon S3 examples using SDK for JavaScript (v3)](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- [Using the DynamoDB Document Client](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html)
- []()

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

#### Using AWS SDK V2 through tools.AWS (Deprecated)

Because Node 16 and the AWS SDK v2 is being deprecated, this documentation will mainly cover AWS SDK v3. However, `{DynamoDb, S3, SSM}` are still available by importing `tools` from cache-data and accessing the `AWS` class:

```js
// NodeJS 16 using AWS SDK v2
const {tools} = require("@63klabs/cache-data");

// using the provided S3 client
const s3result1 = await tools.AWS.s3.client.putObject(params).promise();

// using your own client
const s3client = new tools.AWS.s3.sdk.S3();
const s3result2 = await s3Client.putObject(params).promise();

// similarly with DynamoDb
const dbResult1 = await tools.AWS.dynamo.client.put(params).promise(); // tools.AWS.dynamo.client uses DynamoDB.DocumentClient

// using your own DynamoDb Document client
const dbClient = new tools.AWS.dynamo.sdk.DynamoDB.DocumentClient( {region: 'us-east-1'} );
const dbResult2 = await dbClient.put(params).promise(),
```

### AWS X-Ray

X-Ray can be enabled by making sure you have the Lambda layer installed, appropriate permissions granted to your Lambda execution policy, and setting AWS X-Ray to true in the CloudFormation Template parameters or your Lambda Environment variable.

The templates and code under the installation section already have these implemented.

## Help

Make sure you have your S3 bucket, DynamoDb table, and SSM Parameter store set up. Also make sure that you have IAM policies to allow your Lambda function access to these.

## Author

### Chad Kluck 

- [Website](https://chadkluck.me/)
- [GitHub](https://github.com/chadkluck)
- [Mastodon: @chadkluck@universeodon.com](https://universeodon.com/@chadkluck)

## Version History

Refer to the [Change Log](CHANGELOG.md)

## License

This project is licensed under the MIT License - see the LICENSE.txt file for details
