const { createGenericResponseModule } = require("./generic.response");

const rss = (body) => {
	return `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0">${body}</rss>`;
};

const rssBodyFormatter = (statusCode, message) => {
	if (statusCode === 200) {
		return rss("<hello>" + message + "</hello>");
	}
	const msg = statusCode === 418 ? "418 " + message : message;
	return rss("<error>" + msg + "</error>");
};

const mod = createGenericResponseModule("application/rss+xml", rssBodyFormatter);

module.exports = { ...mod, rss };
