# Changelog

All notable changes to this project will be documented in this file.

Proposed and upcoming changes may be found on [63Klabs/cache-data Issues](https://github.com/63Klabs/cache-data/issues).

Report all vulnerabilities under the [Security menu](https://github.com/63Klabs/cache-data/security/advisories) in the Cache-Data GitHub repository.

> Note: This project is still in beta. Even though changes are tested and breaking changes are avoided, things may break.

## 1.3.2 (2025-09-12)

### Enhancements

- `DebugAndLog`: The environment variable `AWS_LAMBDA_LOG_LEVEL` is now checked as well for setting logging level. `LOG_LEVEL` has priority.

### Fixes

- `DebugAndLog`: Environment and Logging Level value checks are fixed

## 1.3.0 (2025-07-16)

### Enhancements

- Removed AWS SDK V2 support which closes [issue-213](https://github.com/63Klabs/cache-data/issues/213). AWS SDK V2 was for versions of Node 16 and under, and since they are no longer supported Lambda runtimes, support has been removed from cache-data.

### Fixes

- Addressed deprecation warnings (handled by Amazon Q Developer):
  - Eliminated Warning:
    - querystring@0.2.0 - From aws-sdk v2 (removed aws-sdk v2)
  - Remaining Warning (unavoidable):
    - lodash.get@4.4.2 - From sinon dependency (external package)

## 1.2.10 (2025-07-15)

### Enhancements

- Added check for `CACHE_DATA_` environment variables during init so they don't need to be set during Cache initialization. (Closes [issue-212](https://github.com/63Klabs/cache-data/issues/212))
- Cleaner documentation, CloudFormation templates, and code now that defaults and environment variables can be used.
- Added ability to pass an array of objects to `new Connections(connections)` to make it easy when importing a connections file

### Fixes

- Addressed deprecation warnings (handled by Amazon Q Developer):
  - Eliminated Warnings:
    - @extra-number/significant-digits@1.3.9 - REMOVED by eliminating lambda-tester
    - uuid@3.4.0 (2 instances) - REMOVED by eliminating lambda-tester
  - Remaining Warnings (unavoidable):
    - lodash.get@4.4.2 - From sinon dependency (external package)
    - querystring@0.2.0 - From aws-sdk v2 (required for compatibility)
- Fixed variable misname in cache S3 init from v1.2.6
- Fixed to check for environment variable CACHE_DATA_AWS_X_RAY_ON from v1.2.6

The `querystring` warning will be addressed when aws-sdk v2 compatibility is removed from cache-data. (Required for Node <18 which is no longer available as a Lambda runtime.) Opened [issue-213](https://github.com/63Klabs/cache-data/issues/213)

### AI Usage Note

Amazon Q Developer was used to generate tests to ensure backward compatibility, no breaking changes were introduced, and enhancements work as expected. It was used for some additional code generation and reviewed by a human for accuracy.

## 1.2.5 (2025-06-23)

- Updated suggested Lambda environment variables to uppercase: `CACHE_DATA_`
- Added check for environment variable `DEPLOY_ENVIRONMENT` among current list of variables checked to determine environment.

## 1.1.6 (2025-05-05) Moving to @63Klabs

This package has come a long way and is stable. To enhance its longevity I am moving it out of my personal GitHub and NPM accounts an into an organizational account managed by me (chadkluck).

## 1.1.5 (2025-04-08) Security and Optimization for DebugAndLog and utils.sanitize()

- Polynomial regular expression used on uncontrolled data in utils.sanitize()
- Use of externally-controlled format string in DebugAndLog

Malformed strings could be passed to `DebugAndLog` and `utils.sanitize()` that could cause unexpected results.

`utils.sanitize()` will now only handle strings/stringified objects that are of a maximum length of 200,000 characters to prevent Denial of Service. As a result, objects or strings longer than the maximum length will be returned with the message: "Input exceeds maximum allowed length" rather than sanitized output. This will affect the logging of any objects or text strings that are longer than 200,000 characters when stringified.

`utils.sanitize()` is used by DebugAndLog when outputting log data that might contain sensitive information.

> Some regular expressions take a long time to match certain input strings to the point where the time it takes to match a string of length n is proportional to nk or even 2n. Such regular expressions can negatively affect performance, or even allow a malicious user to perform a Denial of Service ("DoS") attack by crafting an expensive input string for the regular expression to match.

While `DebugAndLog` has also been optimized, there is no change to its results. Internally, it was enhanced to prevent malformed messages that are sent to it.

> Functions like the Node.js standard library function util.format accept a format string that is used to format the remaining arguments by providing inline format specifiers. If the format string contains unsanitized input from an untrusted source, then that string may contain unexpected format specifiers that cause garbled output.

## 1.1.4 (2025-03-18) Added XRay sub-segment for API requests

- Feature: Added XRay Segment for APIRequest class

When using the tools.APIRequest class, each remote request is now annotated and provided meta data.

## 1.1.3 (2025-02-17) Additional Options for Sending Parameters via Query String

- Fix v1.1.3: The options property of connection was getting lost when passed to CacheableDataAccess.getData() due to an issue with the way the cache hash Id was calculated.
- Feature v1.1.2: Added new options to specify how duplicate parameters in a query string should be handled. This allows you to craft your query string to match what your endpoint expects when it parses the query string.

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

## 1.1.1 (2024-11-25) First Minor Release!

There should be no breaking changes, but this is being released as a minor release instead of a patch.

- 1.1.0 Enhancement: Shared cache stores are readily available. You can utilize one DynamoDb table and one S3 bucket and share it among your applications. As always, the data encryption key keeps your data secure. As an added feature, each Cache Id is hashed with the application name (Lambda function name) to keep the data separate among applications and instances. (There is currently no support to share cached data among different applications.)
- 1.1.0 Feature: New Response and ClientRequest classes. In the past you needed to extend the RequestDataModel and RequestInfo classes. While the RequestDataModel and RequestInfo classes are still available, these classes should help with organizing your application and logging. The ClientRequest class can handle incoming parameter validation and route parsing. The Response class can handle assembling the response and logging.
- 1.1.0 Began restructuring of the library. No noticeable differences on the end user end, but this better organizes the underlying Classes and methods.
- 1.1.1 Removes Options from the cache identifier so that dynamic timeouts and other options that don't affect the data can be used.


## 1.0.39 (2024-05-06)

3 of 3 new features added in April are now fully functional and documented. See documentation for AWS X-Ray and AWS Parameters and Secrets Lambda Extension.

The experimental feature tools.hashThisData() from v1.0.33 is still experimental and undocumented.

- Feature: Added AWS XRay to HTTP, SSM, S3, and DynamoDb requests. Add Lambda environment variable `CacheData_AWSXRayOn` and set to `true` to enable. Check the X-Ray traces using CloudWatch.
- Feature: Added a switch for experimental tools.hashThisData(). Passing the `useToolsHash: true` property during Cache.init() will use the provided `tools.hashThisData()` function rather than the current hash object package. By default it is `false` and the current hash object function is used.
- Documentation: Added documentation for both X-Ray and CachedParameterSecret
- Chore: Updated tests so it would work with chai 5.x

## 1.0.38 (2024-04-29)

- Feature: Added experimental tools.CachedSecret, tools.CachedParameterSecret classes for use with the [AWS Parameters and Secrets Lambda Extension](https://aws.amazon.com/blogs/compute/using-the-aws-parameter-and-secrets-lambda-extension-to-cache-parameters-and-secrets/). Usage will be documented in a future release.

## 1.0.37 (2024-04-18)

- Fix: [Issue #109 Write to DynamoDb failed for id_hash](https://github.com/chadkluck/npm-chadkluck-cache-data/issues/109)

## 1.0.36 (2024-04-16)

- Security: Fixed a security recommendation for generating message log strings for tools.DebugAndLog.x
- Feature: Added an experimental tools.hashThisData() function for possible future replacement of the dependency object-hash when generating cache-ids.
- Chore: Bump actions/setup-node from 3 to 4 [Pull ClientRequest #108 Dependabot](https://github.com/chadkluck/npm-chadkluck-cache-data/pull/108)
- Chore: Bump chai from 4.3.10 to 5.0.0 [Pull ClientRequest #107 Dependabot](https://github.com/chadkluck/npm-chadkluck-cache-data/pull/107)
- Chore: Reverted chai 5.x back to 4.x and pinned dependency because 5.x doesn't work with node require

## 1.0.33 (2023-09-18)

### Features

- Added additional variables to tools.AWS including `tools.AWS.NODE_VER` (see AWS-SDK section in README)
- Added additional DynamoDb methods:
  - `tools.AWS.dynamo.scan`
  - `tools.AWS.dynamo.delete`
  - `tools.AWS.dynamo.update`
  - `tools.AWS.dynamo.sdk.ScanCommand`
  - `tools.AWS.dynamo.sdk.DeleteCommand`
  - `tools.AWS.dynamo.sdk.UpdateCommand`

## 1.0.32 (2023-09-17)

AWS-SDK version 3 is now available for use. This also means cache-data may be installed on Lambda functions using Node 18 or later, but is still backwards compatible with Node 16.

This version will not run if the Node version is less than 16. AWS will be deprecating version 16 on Lambda in 2024.

### Features

- Fully implemented AWS-SDK version 3 for Node 18 and above. AWS-SDK version 2 will be used for Node 16. (Below Node 16 not supported).
- To assist in development using the SDKs, DynamoDB, S3, and SSM Parameter Store SDKs are accessible when tools are imported. `tools.AWS.dynamo.sdk`. You can also utilize generic `put` and `get` functions for these resources that will automatically use the proper SDK (See AWS-SDK section in README).
- Improved error reporting. Stack traces now logged across all tools.

## 1.0.25 (2023-09-13)

### Fix

- Mitigation for [Issue #80 Applications hang and time out when reading cached items from S3 (no errors reported)](https://github.com/chadkluck/npm-chadkluck-cache-data/issues/80). Large encrypted cached items may still hang.

### Chores

- Bumped some dependencies up.
- Switched to AWS-SDK version 3 from version 2

## 1.0.24 (2023-09-09)

### Fix

- Fix for [Issue #80 Applications hang and time out when reading cached items from S3 (no errors reported)](https://github.com/chadkluck/npm-chadkluck-cache-data/issues/80)

### Chores

- Changelog file had info from a different project cluttering up the first half.
- Bump chai from 4.3.7 to 4.3.8 [Pull ClientRequest #76 Dependabot](https://github.com/chadkluck/npm-chadkluck-cache-data/pull/76)
- Bump aws-sdk from 2.1440.0 to 2.1445.0 [Pull ClientRequest #75 Dependabot](https://github.com/chadkluck/npm-chadkluck-cache-data/pull/75)
- Preparing for aws-sdk v3
- Added lambda-test, sinon, and proxyquire to dev dependencies for testing
- Bump @aws-sdk/client-s3 from 3.400.0 to 3.405.0 [Pull ClientRequest #77 Dependabot](https://github.com/chadkluck/npm-chadkluck-cache-data/pull/77)
- Bump @aws-sdk/client-dynamodb from 3.398.0 to 3.405.0 [Pull ClientRequest #79 Dependabot](https://github.com/chadkluck/npm-chadkluck-cache-data/pull/79)
- Bump aws-sdk from 2.1445.0 to 2.1453.0 [Pull ClientRequest #81 Dependabot](https://github.com/chadkluck/npm-chadkluck-cache-data/pull/81)

## 1.0.22 (2023-08-23)

### Updates

- Cache data access object: Added additional debug messages for read/write functions in DynamoDb, S3, and General Cache
- Improved error message logging for read/write functions in DynamoDb, S3, and General Cache

## 1.0.21 (2023-08-06)

### Fix

- Cleaned up an issue that came up when renaming cache policy profile properties to hostId and pathId.

## 1.0.20 (2023-08-04)

### Updates

- Bumped package dependencies up for aws-sdk
- Updated tests to use `api.chadkluck.net/echo` endpoint instead of `labkit.api.63klabs.net` (both are maintained by the script's author). 
- `defaultExpirationInSeconds` and `expirationIsOnInterval` are now accepted aliases for `defaultExpiresInSeconds` and `expiresIsOnInterval` respectively for Connection Cache Profile configuration. [Resolves Issue #71](https://github.com/chadkluck/npm-chadkluck-cache-data/issues/71)

## 1.0.18 (2023-04-03)

- Added tools.obfuscate() and tools.sanitize() and now attempts to sanitize objects sent to DebugAndLog. Regular Expression used in the stringified object may be [inspected on RegEx101](https://regex101.com/library/IJp35p)

## 1.0.17 (2023-02-04)

- Bumped package dependencies up for aws-sdk and cookiejar

## 1.0.16 (2022-09-14)

- Added extra logging information to API errors in tools. Added host and note to the log for better troubleshooting endpoints.

## 1.0.15 (2022-09-08)
  
- Updated dependencies moment-timezone and aws-sdk

## 1.0.10 (2022-04-13)

- Added a log entry for a warning if timeout is reached in https get tool.

## 1.0.9 (2022-04-12)

- Fixed issue where submitting null header or options to endpoint would fail

## 1.0.8 (2022-04-12)

- Updated timeout to [follow https specs](https://nodejs.org/api/http.html#httprequestoptions-callback) and implemented on("timeout")

## 1.0.2 (2022-02-12)

- Initial Release
