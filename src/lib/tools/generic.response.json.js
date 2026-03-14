const { createGenericResponseModule } = require("./generic.response");

const jsonBodyFormatter = (statusCode, message) => ({ message });

const json = function (data = null) {
	return data ? data : {};
};

const mod = createGenericResponseModule("application/json", jsonBodyFormatter);

module.exports = { ...mod, json };
