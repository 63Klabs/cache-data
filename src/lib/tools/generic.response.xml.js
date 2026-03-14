const { createGenericResponseModule } = require("./generic.response");

const xml = (body) => {
	return `<?xml version="1.0" encoding="UTF-8" ?>${body}`;
};

const xmlBodyFormatter = (statusCode, message) => {
	if (statusCode === 200) {
		return xml("<hello>" + message + "</hello>");
	}
	const msg = statusCode === 418 ? "418 " + message : message;
	return xml("<error>" + msg + "</error>");
};

const mod = createGenericResponseModule("application/xml", xmlBodyFormatter);

module.exports = { ...mod, xml };
