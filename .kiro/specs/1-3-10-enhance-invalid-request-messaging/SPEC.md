# Enhance Invalid Request Messages

Currently the ClientRequest class validates requests based on a variety of factors such as Referrer, Parameters, and Authentication.

It appears if the request fails any of these checks, a blanket isValid response of false is returned.

It would be nice to provide a reason the response failed, and the appropriate HTTP status code.

For example, if the referrer is not a valid referrer, validation could fail, but a message could be retreived with a status code and a corresponding message stating that "x is not a valid referrer"

```
const req = new ClientRequest(event, context);
if (req.isValid()) {
	// route
} else {
	const reason = req.getValidationReason();
	switch reason.statusCode
		case 401
			console.warn(reason.message)
}
```

Response object of getValidationReason:

```json
{
	"isValid": false,
	"statusCode": "403",
	"messages": [
		"REFERRER not a valid referrer."
	]
}
```

```json
{
	"isValid": false,
	"statusCode": "401",
	"messages": [
		"Unauthorized"
	]
}
```

```json
{
	"isValid": false,
	"statusCode": "400",
	"messages": [
		"Invalid parameter: {id}",
		"Invalid parameter: {players}"
	]
}
```

```json
{
	"isValid": true,
	"statusCode": "200",
	"messages": []
}
```

The status code could then be passed on to the Response object to generate a response. Adding the messages to the repsponse is up to the developer.

Does the Response object allow for passing of a message to add to one of the static JSON or HTML responses?

All tests should be written in Jest and documentation for developers should be provided.

Ask any clarifying questions in SPEC-QUESTIONS.md.
