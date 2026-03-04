I need to update src/lib/tools/ClientRequest.class.js 

Specifically ClientRequest.#validate()

ClientRequest.#validations is set through ClientRequest.init({validations}), where the validations object is set from an import from a JavaScript file. An example of the JavaScript file imported is in docs/00-example-implementation/example-validations.js

NOTE: example-validations.js is an example implementation, the developer using this pack will implement their own validation functions.

Currently, the validations.parameters object has pathParameters and queryParameters with the option to also include headerParameters, cookieParameters, and bodyParameters, each specific to parameters/properties/fields that might be passed through each part of the HTTP request.

Also, the parameter objects (pathParameters and queryParameters) are currently one-dimensional, which does not distinguish between parameters used by multiple paths.

It also does not distinguish between http methods.

For example, pathParameter.id is not distinguished between /api/employee/{id} or /api/product/{id}

Also, for example, queryParameter.players is not distinguished between /api/battle-royale?players=5 or /api/chess?players=1

This is important as, for example, chess will only have valid players <= 2, and battle-royale allows valid players between 5 and 100

I need to add paths to the validation.parameters objects. For example, 

pathParameters.BY_ROUTE = [ {route: 'employee/{id}', func: employeeId}, {route: 'GET:product/{id}', func: productId}, {route: 'POST:join/{id}', func: gameId}]
queryParameters.BY_ROUTE = [ {route: 'game/chess?players', func: players}, {route: 'game/battle-royale?players', func: players}]

However, it needs to be backwards compatible so that pathParameters.id and queryParameters.players still work and can be used as defaults if a property that needs to be validated is not listed by path.

headerParameters and cookieParameters also require modification.
bodyParameters is more complex and is not used directly by ClientRequest.#validate()
Methods should also be implmented, in lower case.

The search for a valid parameter/header/etc match should be:

Method:Route eg: pathParametres.BY_ROUTE GET:product/{id}
Route eg: pathParametres.BY_ROUTE product/{id}
name eg pathParametres.id

Each parameter object (pathParameters, queryParameters, headerParameters, cookieParameters) has its own hasValid* function within ClientRequest that calls the main hasValidParameters function to improve code reuse. The #hasValidParameters function will be the function that needs to be modified to properly iterate through the validations for that particular parameter object.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.
