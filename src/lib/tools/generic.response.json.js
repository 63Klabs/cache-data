contentType = "application/json"

headers = {
	"Content-Type": contentType
};

json = function (data = null) {
	return data ? data : {};
};

response200 = {
	statusCode: 200,
	headers: headers,
	body: {
		message: "Success"
	}
};

response400 = {
	statusCode: 400,
	headers: headers,
	body: {
		message: "Bad Request"
	}
};

response401 = {
	statusCode: 401,
	headers: headers,
	body: {
		message: "Unauthorized"
	}
};

response403 = {
	statusCode: 403,
	headers: headers,
	body: {
		message: "Forbidden"
	}
};

response404 = {
	statusCode: 404,
	headers: headers,
	body: {
		message: "Not Found"
	}
};

response405 = {
	statusCode: 405,
	headers: headers,
	body: {
		message: "Method Not Allowed"
	}
};

response408 = {
	statusCode: 408,
	headers: headers,
	body: {
		message: "Request Timeout"
	}
};

response418 = {
	statusCode: 418,
	headers: headers,
	body: {
		message: "I'm a teapot"
	}
};

response500 = {
	statusCode: 500,
	headers: headers,
	body: {
		message: "Internal Server Error"
	}
};

/**
 * 
 * @param {number|string} statusCode 
 * @returns {{statusCode: number, headers: object, body: Array|Object|string}}
 */
const response = function (statusCode) {
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
	json,
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