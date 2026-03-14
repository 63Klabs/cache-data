const { createGenericResponseModule } = require("./generic.response");

const html = (title, body) => {
	return `<html><head><title>${title}</title></head><body>${body}</body></html>`;
};

const HTML_TITLE_MAP = {
	200: "OK",
	500: "Error"
};

const htmlBodyFormatter = (statusCode, message) => html(statusCode + " " + (HTML_TITLE_MAP[statusCode] || message), "<p>" + message + "</p>");

const mod = createGenericResponseModule("text/html; charset=utf-8", htmlBodyFormatter);

module.exports = { ...mod, html };
