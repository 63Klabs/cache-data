/**
 * Consumer compilation test for the endpoint module.
 * This file exercises type resolution for endpoint.send(), endpoint.get(),
 * endpoint.getDataDirectFromURI(), ConnectionObject, and EndpointResponse.
 * Compiled with `tsc --noEmit` only.
 *
 * Validates: Requirements 1.2, 4.3, 7.1
 */

import cacheData = require("@63klabs/cache-data");

// ---------------------------------------------------------------------------
// Access endpoint module
// ---------------------------------------------------------------------------
const endpoint = cacheData.endpoint;

// ---------------------------------------------------------------------------
// ConnectionObject interface (re-exported from tools)
// ---------------------------------------------------------------------------
const connection: cacheData.endpoint.ConnectionObject = {
	method: "GET",
	protocol: "https",
	host: "api.example.com",
	path: "/v1/users",
	parameters: { limit: 10, offset: 0, active: true },
	headers: { "Accept": "application/json", "X-Api-Key": "key123" },
	body: null,
	note: "Fetch users endpoint",
	options: { timeout: 5000 }
};

// ConnectionObject with URI
const connectionWithUri: cacheData.endpoint.ConnectionObject = {
	uri: "https://api.example.com/v1/users?limit=10",
	method: "GET"
};

// Minimal ConnectionObject
const minimalConnection: cacheData.endpoint.ConnectionObject = {
	host: "api.example.com",
	path: "/data"
};

// ---------------------------------------------------------------------------
// EndpointResponse interface
// ---------------------------------------------------------------------------
const mockResponse: cacheData.endpoint.EndpointResponse = {
	success: true,
	statusCode: 200,
	body: { users: [{ id: 1, name: "John" }] },
	headers: { "content-type": "application/json" }
};

// EndpointResponse with string body
const textResponse: cacheData.endpoint.EndpointResponse = {
	success: true,
	statusCode: 200,
	body: "Hello World",
	headers: { "content-type": "text/plain" }
};

// EndpointResponse with null body
const emptyResponse: cacheData.endpoint.EndpointResponse = {
	success: false,
	statusCode: 404,
	body: null,
	headers: {}
};

// ---------------------------------------------------------------------------
// endpoint.send() function
// ---------------------------------------------------------------------------
async function testSend(): Promise<void> {
	// Basic send with connection only
	const response1: cacheData.endpoint.EndpointResponse = await endpoint.send(connection);
	const success: boolean = response1.success;
	const statusCode: number = response1.statusCode;
	const body: object | string | null = response1.body;
	const headers: Record<string, string> = response1.headers;

	// Send with query parameter
	const response2: cacheData.endpoint.EndpointResponse = await endpoint.send(
		connection,
		{ parameters: { q: "Chicago", format: "json" } }
	);

	// Send with null query
	const response3: cacheData.endpoint.EndpointResponse = await endpoint.send(connection, null);

	// Send with URI-based connection
	const response4: cacheData.endpoint.EndpointResponse = await endpoint.send(connectionWithUri);

	// POST request
	const postConnection: cacheData.endpoint.ConnectionObject = {
		method: "POST",
		host: "api.example.com",
		path: "/v1/users",
		body: JSON.stringify({ name: "Jane", email: "jane@example.com" }),
		headers: { "Content-Type": "application/json" }
	};
	const response5: cacheData.endpoint.EndpointResponse = await endpoint.send(postConnection);
}

// ---------------------------------------------------------------------------
// endpoint.get() function (deprecated)
// ---------------------------------------------------------------------------
async function testGet(): Promise<void> {
	const response: cacheData.endpoint.EndpointResponse = await endpoint.get(connection);
	const responseWithQuery: cacheData.endpoint.EndpointResponse = await endpoint.get(
		connection,
		{ parameters: { page: 2 } }
	);
}

// ---------------------------------------------------------------------------
// endpoint.getDataDirectFromURI() function (deprecated)
// ---------------------------------------------------------------------------
async function testGetDataDirectFromURI(): Promise<void> {
	const response: cacheData.endpoint.EndpointResponse = await endpoint.getDataDirectFromURI(
		{ uri: "https://api.example.com/data" }
	);
	const responseWithQuery: cacheData.endpoint.EndpointResponse = await endpoint.getDataDirectFromURI(
		{ uri: "https://api.example.com/data" },
		{ parameters: { format: "json" } }
	);
}
