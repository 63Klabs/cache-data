# Clean Up Generic Responses

Right now generic.responses.*.js scripts use the same format and are redundant, making it hard to update and add new status codes.

Create a generic.response.js script that can be imported into each of the generic.response.*.js files.
Each generic.response.*.js file will have a json object with the status code and message.
The Json object will be passed to a functions exported by generic.response.js that will provide the same functionality but logic will be centrally located and maintainable.

All current tests should still pass without modification.
Create new tests in Jest only.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.
