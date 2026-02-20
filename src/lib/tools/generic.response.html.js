contentType = "text/html; charset=utf-8";

headers = {
	"Content-Type": contentType
};

html = (title, body) => {
	return `<html><head><title>${title}</title></head><body>${body}</body></html>`;
}

response200 = {
	statusCode: 200,
	headers: headers,
	body: html("200 OK", "<p>Success</p>")
};

response400 = {
	statusCode: 400,
	headers: headers,
	body: html("400 Bad Request", "<p>Bad Request</p>")
};

response401 = {
	statusCode: 401,
	headers: headers,
	body: html("401 Unauthorized", "<p>Unauthorized</p>")
};

response403 = {
	statusCode: 403,
	headers: headers,
	body: html("403 Forbidden", "<p>Forbidden</p>")
};

response404 = {
	statusCode: 404,
	headers: headers,
	body: html("404 Not Found", "<p>Not Found</p>")
};

response405 = {
	statusCode: 405,
	headers: headers,
	body: html("405 Method Not Allowed", "<p>Method Not Allowed</p>")
};

response408 = {
	statusCode: 408,
	headers: headers,
	body: html("408 Request Timeout", "<p>Request Timeout</p>")
};

response418 = {
	statusCode: 418,
	headers: headers,
	body: html("418 I'm a teapot", "<p>I'm a teapot</p>")
};

response500 = {
	statusCode: 500,
	headers: headers,
	body: html("500 Error", "<p>Internal Server Error</p>")
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
	html,
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