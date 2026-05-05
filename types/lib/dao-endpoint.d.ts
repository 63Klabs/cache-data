/**
 * Endpoint module for the @63klabs/cache-data package.
 *
 * Provides HTTP/HTTPS request handling for making requests to remote APIs
 * and services. Supports both URI-based and component-based connection
 * specifications with automatic JSON parsing of responses.
 *
 * @module endpoint
 */

import tools = require("./tools/index");

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Connection configuration object for making endpoint requests.
 * Re-exported from the tools module for convenience.
 */
export import ConnectionObject = tools.ConnectionObject;

/**
 * Response object returned by endpoint request functions.
 * Contains the success status, HTTP status code, parsed body, and response headers.
 */
export interface EndpointResponse {
	/** Whether the request was successful (status code 2xx) */
	success: boolean;
	/** HTTP status code of the response */
	statusCode: number;
	/** Response body, automatically parsed as JSON if possible, otherwise returned as text */
	body: object | string | null;
	/** Response headers as key-value pairs */
	headers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Makes a request to a remote endpoint with the specified connection configuration.
 *
 * This function provides a simple interface for making HTTP requests to external APIs
 * or services. It supports both URI-based and component-based (protocol/host/path)
 * connection specifications. Query parameters can be provided either in the connection
 * object or as a separate query parameter, which will be merged together.
 *
 * The response body is automatically parsed as JSON if possible, otherwise returned as text.
 *
 * @param connection - Connection configuration object specifying the endpoint details
 * @param query - Additional query data to merge with connection parameters. If query.parameters is provided, it will be merged with connection.parameters
 * @returns Promise resolving to a response object with success status, HTTP status code, parsed body, and response headers
 *
 * @example
 * // Using separate host and path
 * const { endpoint } = require("@63klabs/cache-data");
 * const response = await endpoint.send(
 *   { host: "api.example.com", path: "/data" },
 *   { parameters: { q: "Chicago" } }
 * );
 * console.log(response.body);
 *
 * @example
 * // Using complete URI
 * const { endpoint } = require("@63klabs/cache-data");
 * const response = await endpoint.send(
 *   { uri: "https://api.example.com/data" },
 *   { parameters: { q: "Chicago" } }
 * );
 * console.log(response.body);
 *
 * @example
 * // POST request with body
 * const { endpoint } = require("@63klabs/cache-data");
 * const response = await endpoint.send({
 *   method: "POST",
 *   uri: "https://api.example.com/submit",
 *   body: JSON.stringify({ name: "John", age: 30 }),
 *   headers: { "Content-Type": "application/json" }
 * });
 */
export function send(connection: ConnectionObject, query?: { parameters?: Record<string, string | number | boolean> } | null): Promise<EndpointResponse>;

/**
 * Makes a request to a remote endpoint.
 *
 * @deprecated Use send() instead. This function is maintained for backwards compatibility.
 * @param connection - Connection configuration object specifying the endpoint details
 * @param query - Additional query data to merge with connection parameters
 * @returns Promise resolving to a response object
 * @see send
 */
export function get(connection: ConnectionObject, query?: { parameters?: Record<string, string | number | boolean> } | null): Promise<EndpointResponse>;

/**
 * Makes a request to a remote endpoint using a direct URI.
 *
 * @deprecated Use send() instead. This function is maintained for backwards compatibility.
 * @param connection - Connection configuration object specifying the endpoint details
 * @param query - Additional query data to merge with connection parameters
 * @returns Promise resolving to a response object
 * @see send
 */
export function getDataDirectFromURI(connection: ConnectionObject, query?: { parameters?: Record<string, string | number | boolean> } | null): Promise<EndpointResponse>;
