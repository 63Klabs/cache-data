const { createGenericResponseModule } = require("./generic.response");

const textBodyFormatter = (statusCode, message) => message;

const text = (text) => { return text; };

const mod = createGenericResponseModule("text/plain", textBodyFormatter);

module.exports = { ...mod, text };
