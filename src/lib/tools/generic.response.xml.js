contentType = "application/xml";

headers = {
	"Content-Type": contentType
};

xml = (body) => {
	return `<?xml version="1.0" encoding="UTF-8" ?>${body}`;
}

response200 = {
	statusCode: 200,
	headers: headers,
	body: xml("<hello>Success</hello>")
};

response400 = {
	statusCode: 400,
	headers: headers,
	body: xml("<error>Bad Request</error>")
};

response401 = {
	statusCode: 401,
	headers: headers,
	body: xml("<error>Unauthorized</error>")
};

response403 = {
	statusCode: 403,
	headers: headers,
	body: xml("<error>Forbidden</error>")
};

response404 = {
	statusCode: 404,
	headers: headers,
	body: xml("<error>Not Found</error>")
};

response405 = {
	statusCode: 405,
	headers: headers,
	body: xml("<error>Method Not Allowed</error>")
};

response408 = {
	statusCode: 408,
	headers: headers,
	body: xml("<error>Request Timeout</error>")
};

response418 = {
	statusCode: 418,
	headers: headers,
	body: xml("<error>418 I'm a teapot</error>")
};

response500 = {
	statusCode: 500,
	headers: headers,
	body: xml("<error>Internal Server Error</error>")
};

/**
 * 
 * @param {number|string} statusCode 
 * @returns {{statusCode: number, headers: object, body: Array|Object|string}}
 */
response = function (statusCode) {
	// convert to int
	statusCode = parseInt(statusCode, 10);

	switch (statusCode) {
		case 200:
			return this.response200;
		case 400:
			return this.response400;
		case 401:
			return this.response401;
		case 403:
			return this.response403;
		case 404:
			return this.response404;
		case 405:
			return this.response405;
		case 408:
			return this.response408;
		case 418:
			return this.response418;
		case 500:
			return this.response500;
		default:
			return this.response500;
	}
};

module.exports = {
	contentType,
	headers,
	xml,
	response200,
	response400,
	response401,
	response403,
	response404,
	response405,
	response408,
	response418,
	response500,
	response
}