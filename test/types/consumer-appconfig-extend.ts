/**
 * Consumer compilation test for AppConfig extensibility.
 * This file demonstrates that AppConfig can be extended by a custom Config class
 * and that inherited static methods resolve correctly. Compiled with `tsc --noEmit` only.
 *
 * Validates: Requirements 2.5, 8.1, 8.2
 */

import cacheData = require("@63klabs/cache-data");

// ---------------------------------------------------------------------------
// Extend AppConfig with a custom Config class
// ---------------------------------------------------------------------------

/**
 * Custom application configuration class that extends AppConfig.
 * Demonstrates that all inherited static methods are available and type-safe.
 */
class Config extends cacheData.tools.AppConfig {
	/**
	 * Custom initialization that calls super.init() and adds additional setup.
	 */
	static init(options?: cacheData.tools.AppConfigInitOptions): boolean {
		const result = super.init(options);
		// Custom initialization logic can go here
		return result;
	}

	/**
	 * Custom method demonstrating extensibility.
	 */
	static getApiConnection(): object | null {
		return super.getConn("api");
	}
}

// ---------------------------------------------------------------------------
// Use the extended Config class
// ---------------------------------------------------------------------------

// Initialize with full options
Config.init({
	settings: {
		dataLimit: 1000,
		apiVersion: "v2"
	},
	connections: {
		api: {
			name: "api",
			host: "api.example.com",
			path: "/v2",
			method: "GET",
			cache: [
				{
					profile: "default",
					defaultExpirationInSeconds: 300,
					overrideOriginHeaderExpiration: true
				}
			]
		},
		auth: {
			name: "auth",
			host: "auth.example.com",
			path: "/oauth/token",
			method: "POST"
		}
	},
	validations: {
		referrers: ["example.com"],
		parameters: {}
	},
	responses: {
		settings: {
			errorExpirationInSeconds: 300,
			routeExpirationInSeconds: 600,
			externalRequestHeadroomInMs: 1500
		},
		jsonResponses: {},
		htmlResponses: {},
		xmlResponses: {},
		rssResponses: {},
		textResponses: {}
	},
	ssmParameters: {
		"/myapp/api/key": {}
	},
	debug: false
});

// ---------------------------------------------------------------------------
// Verify inherited static methods resolve correctly
// ---------------------------------------------------------------------------

// Add a promise
const myPromise: Promise<any> = Promise.resolve("loaded");
Config.add(myPromise);

// Get settings
const settings: object | null = Config.settings();

// Get connections
const connections: cacheData.tools.Connections | null = Config.connections();

// Get a specific connection instance
const apiConnection: cacheData.tools.Connection | null = Config.getConnection("api");

// Get a connection as plain object
const apiConn: object | null = Config.getConn("api");

// Get connection with cache profile
const connAndProfile = Config.getConnCacheProfile("api", "default");
const conn: object | null = connAndProfile.conn;
const cacheProfile: object | null = connAndProfile.cacheProfile;

// Wait for all initialization to complete
async function testConfigPromise(): Promise<void> {
	const results: any[] = await Config.promise();
}

// ---------------------------------------------------------------------------
// Verify custom method works
// ---------------------------------------------------------------------------
const customApiConn: object | null = Config.getApiConnection();

// ---------------------------------------------------------------------------
// Verify another extension pattern (minimal override)
// ---------------------------------------------------------------------------

class MinimalConfig extends cacheData.tools.AppConfig {
	// No overrides - just inherits everything
}

MinimalConfig.init({ settings: { minimal: true } });
const minSettings: object | null = MinimalConfig.settings();
const minConnections: cacheData.tools.Connections | null = MinimalConfig.connections();

// ---------------------------------------------------------------------------
// Verify AppConfig can be used directly (not just extended)
// ---------------------------------------------------------------------------
cacheData.tools.AppConfig.init({ settings: { direct: true } });
const directSettings: object | null = cacheData.tools.AppConfig.settings();

async function testDirectAppConfig(): Promise<void> {
	await cacheData.tools.AppConfig.promise();
	const conn = cacheData.tools.AppConfig.getConn("myConn");
	const connection = cacheData.tools.AppConfig.getConnection("myConn");
	const { conn: c, cacheProfile: cp } = cacheData.tools.AppConfig.getConnCacheProfile("myConn", "profile");
}
