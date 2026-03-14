# New Response Format Method

The tools.ApiRequest class currently has a static method called responseFormat that is used to wrap responses in a common object to store in a cache or move along a workflow. This is helpful when standardizing REST API responses and other responses (such as S3 or DynamoDb queries).

When calling a REST API endpoint, ApiRequest already wraps it in this wrapper. However, when making a call to S3 or other SDK API the data needs to be placed within this wrapper and sent back to the requestor through the cache.

All data whether from REST API or SDK API is stored in the cache in this wrapper and returned to the requestor.

When the developer creates their own custom functions to get a list of objects from S3, or object meta data, or any other SDK API request, they need an easy way to wrap their data to send it back to the requestor and cache.

The current format is:
```js
const someFunction = async (connection, opts) => {
    const list = await Models.S3Templates.list(connection, opts);

    // >! We need to wrap the list in a response format suitable for CacheableDataAccess
    if ("errors" in list) {
      return ApiRequest.responseFormat(false, 500, "ERROR", {}, JSON.stringify(list));
    } else {
      return ApiRequest.responseFormat(true, 200, "SUCCESS", {}, JSON.stringify(list));
    }
};
```

ApiRequest.responseFormat is defined as such within the ApiRequest class:

```js
static responseFormat(success = false, statusCode = 0, message = null, headers = null, body = null) {
	
	return {
		success: success,
		statusCode: statusCode,
		headers: headers,
		body: body,
		message: message
	};
};
```

Since it uses positional arguments, it is not easy for developers to implement.

A better, and more modern approach is to pass an object:

```js
const someFunction = async (connection, opts) => {
    const list = await Models.S3Templates.list(connection, opts);

    // >! We need to wrap the list in a response format suitable for CacheableDataAccess
    if ("errors" in list) {
      return ApiRequest.format({success: false, body: list});
    } else {
      return ApiRequest.format({success: true, body: list});
    }
};
```

This will allow the developer to reduce code, use defaults, and not worry about the exact order of parameters.

We need to maintain backwards compatibility, so the responseFormat() signature should not be changed.

However, to better provide defaults, the internal structure of responseFormat should call the new method.

```js
static responseFormat(success = false, statusCode = 0, message = null, headers = null, body = null) {
	return ApiRequest.format({success, statusCode, message, headers, body});
}

/**
 * @param response {object}
 * @param response.success {boolean}
 * @param response.statusCode {number}
 * @param response.message {string}
 * @param response.headers {object|null}
 * @param response.body {object|string|null}
 * */
static format({
        success = false,
        statusCode = 0,
        message = null,
        headers = null,
        body = null
    }) {

	return {
		success,
		statusCode,
		message,
		headers,
		body
	};
}
```

I also went to create additional helper shortcuts:

```js
ApiRequest.success()
ApiRequest.error()
ApiRequest.apiGateway()
```

```js
class ApiRequest {

    static success({
        success = true,
        statusCode = 200,
        message = "SUCCESS",
        headers = null,
        body = null
    }) {
        return ApiRequest.format({
            success,
            statusCode,
            message,
            headers,
            body
        });
    }

    static error({
        success = false,
        statusCode = 500,
        message = "ERROR",
        headers = null,
        body = null
    }) {
        return ApiRequest.format({
            success,
            statusCode,
            message,
            headers,
            body
        });
    }
	
    static apiGateway(response) {
		const resp = ApiRequest.format(response);
        return {
            statusCode: resp.statusCode,
            headers: resp.headers,
            body: resp.body // stringify if object
        };
    }

}
```

Shortcut usage example:

```js
const someFunction = async (connection, opts) => {
    const list = await Models.S3Templates.list(connection, opts);

    // >! We need to wrap the list in a response format suitable for CacheableDataAccess
    if ("errors" in list) {
      return ApiRequest.success({body: list});
    } else {
      return ApiRequest.error({body: list});
    }
};
```