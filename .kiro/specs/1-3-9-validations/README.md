I need to update src/lib/tools/ClientRequest.class.js 

Specifically ClientRequest.#validate()

ClientRequest.#validations is set through ClientRequest.init({validations}), where the validations object is set from an import from a JavaScript file. An example of the JavaScript file imported is in docs/00-example-implementation/example-validations.js

Currently, the validations.parameters object has pathParameters and queryParameters with the option to also include headerParameters, cookieParameters, and bodyParameters, each specific to parameters/properties/fields that might be passed through each part of the HTTP request.

Also, the parameter objects (pathParameters and queryParameters) are currently one-dimensional, which does not distinguish between parameters used by multiple paths.

For example, pathParameter.id is not distinguished between /api/employee/{id} or /api/product/{id}

Also, for example, queryParameter.players is not distinguished between /api/battle-royale?players=5 or /api/chess?players=1

This is important as chess will only have valid players <= 2, and battle-royal allows valid players between 5 and 100

I need to add paths to the validation.parameters objects. For example, 

pathParameters.BY_PATH.employee.id and pathParameters.BY_PATH.product.id
queryParameters.BY_PATH.chess.players and queryParameters.BY_PATH['battle-royal'].players

However, it needs to be backwards compatible so that pathParameters.id and queryParameters.players still work and can be used as defaults if a property that needs to be validated is not listed by path.

headerParameters and cookieParameters also require modification.
bodyParameters is more complex and is not used directly by ClientRequest.#validate()

Each parameter object (pathParameters, queryParameters, headerParameters, cookieParameters) has its own hasValid* function within ClientRequest that calls the main hasValidParameters function to improve code reuse. The #hasValidParameters function will be the function that needs to be modified to properly iterate through the validations for that particular parameter object.

Tests are written in Mocha and Chai, be sure to add tests to the tests directory using the current format.

Property tests should be maintained separately from the existing tests.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.
