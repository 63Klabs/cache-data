/**
 * Tools module for the @63klabs/cache-data package.
 *
 * Provides logging, debugging, request handling, AWS integration, and utility
 * classes/functions used by endpoint data access objects (DAOs) and cache-data.
 *
 * @module tools
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Configuration options for AppConfig.init().
 */
export interface AppConfigInitOptions {
	/** Application settings retrieved by Config.settings() */
	settings?: object;
	/** Application connections that can be retrieved by Config.getConn() or Config.getConnCacheProfile() */
	connections?: object;
	/** ClientRequest.init() options for request validation */
	validations?: object;
	/** Response.init() options for response configuration */
	responses?: {
		settings?: {
			errorExpirationInSeconds?: number;
			routeExpirationInSeconds?: number;
			externalRequestHeadroomInMs?: number;
		};
		jsonResponses?: object;
		htmlResponses?: object;
		xmlResponses?: object;
		rssResponses?: object;
		textResponses?: object;
	};
	/** Parameter Store configuration for SSM parameters */
	ssmParameters?: object;
	/** Enable debug logging during initialization */
	debug?: boolean;
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

/**
 * AWS Helper Functions - Functions to perform common get and put operations
 * for DynamoDB, S3, and SSM Parameter Store using AWS SDK v3.
 *
 * @example
 * console.log(AWS.REGION); // outputs the region from process.env.AWS_REGION
 *
 * @example
 * const result = await AWS.dynamo.get(params);
 * const response = await AWS.s3.put(params);
 * const ssmParams = await AWS.ssm.getByName(query);
 */
export class AWS {
	/** Node.js version string (e.g., '20.12.0') */
	static readonly NODE_VER: string;
	/** Node.js major version number */
	static readonly NODE_VER_MAJOR: number;
	/** Node.js minor version number */
	static readonly NODE_VER_MINOR: number;
	/** Node.js patch version number */
	static readonly NODE_VER_PATCH: number;
	/** Node.js major.minor version string (e.g., '20.12') */
	static readonly NODE_VER_MAJOR_MINOR: string;
	/** Node.js version as array [major, minor, patch] */
	static readonly NODE_VER_ARRAY: number[];
	/** AWS SDK version being used ('V2' or 'V3') */
	static readonly SDK_VER: "V2" | "V3";
	/** True if using AWS SDK v2 */
	static readonly SDK_V2: boolean;
	/** True if using AWS SDK v3 */
	static readonly SDK_V3: boolean;
	/** AWS region from process.env.AWS_REGION or 'us-east-1' */
	static readonly REGION: string;
	/** AWS region (alias for REGION) */
	static readonly region: string;

	/** DynamoDB client and helper functions */
	static readonly dynamo: {
		client: object;
		/**
		 * Perform a DynamoDB put command
		 * @param params - DynamoDB put parameters
		 */
		put(params: object): Promise<any>;
		/**
		 * Perform a DynamoDB get command
		 * @param params - DynamoDB get parameters
		 */
		get(params: object): Promise<any>;
		/**
		 * Perform a DynamoDB scan command
		 * @param params - DynamoDB scan parameters
		 */
		scan(params: object): Promise<any>;
		/**
		 * Perform a DynamoDB delete command
		 * @param params - DynamoDB delete parameters
		 */
		delete(params: object): Promise<any>;
		/**
		 * Perform a DynamoDB update command
		 * @param params - DynamoDB update parameters
		 */
		update(params: object): Promise<any>;
		sdk: object;
	};

	/** S3 client and helper functions */
	static readonly s3: {
		client: object;
		/**
		 * Perform an S3 put command
		 * @param params - S3 put parameters
		 */
		put(params: object): Promise<any>;
		/**
		 * Perform an S3 get command
		 * @param params - S3 get parameters
		 */
		get(params: object): Promise<any>;
		sdk: object;
	};

	/** SSM Parameter Store client and helper functions */
	static readonly ssm: {
		client: object;
		/**
		 * Get parameters by name from SSM Parameter Store
		 * @param query - SSM getParameters query
		 */
		getByName(query: object): Promise<any>;
		/**
		 * Get parameters by path from SSM Parameter Store
		 * @param query - SSM getParametersByPath query
		 */
		getByPath(query: object): Promise<any>;
		sdk: object;
	};

	/** AWS X-Ray SDK (null if X-Ray is not enabled) */
	static readonly XRay: object | null;

	/** Information about the current Node.js and AWS environment */
	static readonly INFO: object;

	constructor();
}

/**
 * AWS X-Ray SDK object. Null if X-Ray is not enabled via environment variables.
 * Enable by setting CacheData_AWSXRayOn=true or CACHE_DATA_AWS_X_RAY_ON=true.
 */
export declare const AWSXRay: object | null;


/**
 * Submit GET and POST requests and handle responses.
 * Supports automatic redirect handling, pagination, retry logic, and AWS X-Ray tracing.
 *
 * @example
 * const apiRequest = new ApiRequest({
 *   host: 'api.example.com',
 *   path: '/users',
 *   parameters: { limit: 10 }
 * });
 * const response = await apiRequest.send();
 */
export class ApiRequest {
	/** Maximum number of redirects to follow */
	static MAX_REDIRECTS: number;

	/**
	 * Creates a new ApiRequest instance.
	 *
	 * @param request - Request configuration object
	 * @example
	 * const request = new ApiRequest({
	 *   host: 'api.example.com',
	 *   path: '/data',
	 *   method: 'GET',
	 *   pagination: { enabled: true },
	 *   retry: { enabled: true, maxRetries: 2 }
	 * });
	 */
	constructor(request: {
		method?: string;
		protocol?: string;
		host?: string;
		path?: string;
		uri?: string;
		parameters?: Record<string, string | number | boolean | Array<string | number>> | null;
		headers?: Record<string, string> | null;
		body?: string | null;
		note?: string;
		options?: {
			timeout?: number;
			separateDuplicateParameters?: boolean;
			separateDuplicateParametersAppendToKey?: string;
			combinedDuplicateParameterDelimiter?: string;
		};
		pagination?: {
			enabled?: boolean;
			totalItemsLabel?: string;
			itemsLabel?: string;
			offsetLabel?: string;
			limitLabel?: string;
			continuationTokenLabel?: string | null;
			responseReturnCountLabel?: string;
			defaultLimit?: number;
			batchSize?: number;
		};
		retry?: {
			enabled?: boolean;
			maxRetries?: number;
			retryOn?: {
				networkError?: boolean;
				emptyResponse?: boolean;
				parseError?: boolean;
				serverError?: boolean;
				clientError?: boolean;
			};
		};
	});

	/**
	 * Sends the HTTP request and returns the response.
	 * Handles redirects, pagination, and retries based on configuration.
	 *
	 * @returns Response object with success, statusCode, headers, body, message, and optional metadata
	 * @example
	 * const response = await apiRequest.send();
	 * if (response.success) {
	 *   console.log(response.body);
	 * }
	 */
	send(): Promise<{
		success: boolean;
		statusCode: number;
		headers: Record<string, string> | null;
		body: string | null;
		message: string | null;
		metadata?: {
			retries?: {
				occurred: boolean;
				attempts: number;
				finalAttempt: number;
			};
			pagination?: {
				occurred: boolean;
				totalPages: number;
				totalItems: number;
				incomplete: boolean;
				error: string | null;
			};
		};
	}>;

	/** Resets the request state for reuse */
	resetRequest(): void;

	/**
	 * Formats a response object with standard fields.
	 *
	 * @param success - Whether the request was successful
	 * @param statusCode - HTTP status code
	 * @param message - Response message
	 * @param headers - Response headers
	 * @param body - Response body
	 * @returns Formatted response object
	 * @example
	 * const response = ApiRequest.responseFormat(true, 200, "SUCCESS", headers, body);
	 */
	static responseFormat(
		success?: boolean,
		statusCode?: number,
		message?: string | null,
		headers?: object | null,
		body?: string | null
	): {
		success: boolean;
		statusCode: number;
		headers: object | null;
		body: string | null;
		message: string | null;
	};

	/**
	 * Formats a response object (alias for responseFormat with named parameters).
	 *
	 * @param options - Response format options
	 * @returns Formatted response object
	 */
	static format(options?: {
		success?: boolean;
		statusCode?: number;
		message?: string | null;
		headers?: object | null;
		body?: string | null;
	}): {
		success: boolean;
		statusCode: number;
		headers: object | null;
		body: string | null;
		message: string | null;
	};

	/**
	 * Formats a response for returning to API Gateway (statusCode, headers, body).
	 *
	 * @param options - Response format options
	 * @returns API Gateway compatible response
	 */
	static responseFormatForApiGateway(options?: {
		success?: boolean;
		statusCode?: number;
		message?: string | null;
		headers?: object | null;
		body?: string | null;
	}): {
		statusCode: number;
		headers: object | null;
		body: string | null;
	};
}

/**
 * Create an object that returns copies (not references) of its properties.
 * Useful for storing configuration that should not be mutated.
 *
 * @example
 * const config = new ImmutableObject({ apiKey: 'secret', timeout: 5000 });
 * config.finalize();
 * const copy = config.get(); // Returns a deep copy
 */
export class ImmutableObject {
	/**
	 * Creates a new ImmutableObject.
	 *
	 * @param obj - The object to store as immutable
	 * @param finalize - Whether to lock the object immediately
	 * @example
	 * const settings = new ImmutableObject({ host: 'localhost' }, true);
	 */
	constructor(obj?: object | null, finalize?: boolean);

	/** Locks the object so it cannot be changed */
	lock(): void;

	/**
	 * Finalizes the object by immediately locking it.
	 *
	 * @param obj - Optional new object to store before locking
	 */
	finalize(obj?: object | null): void;

	/**
	 * Returns a copy of the stored object (alias for get()).
	 *
	 * @returns A deep copy of the stored object
	 */
	toObject(): any;

	/**
	 * Gets a copy of the value (not a reference) via an object's key.
	 *
	 * @param key - Key of the value to return
	 * @returns A deep copy of the value at the specified key, or the entire object if no key
	 * @example
	 * const dbConfig = settings.get('database');
	 */
	get(key?: string): any;
}

/**
 * Timer class for measuring execution time and tracking performance metrics.
 *
 * @example
 * const timer = new Timer('myOperation', true);
 * // ... perform operation ...
 * const elapsed = timer.stop();
 * console.log(`Operation took ${elapsed}ms`);
 */
export class Timer {
	/** Timer name for identification in logs */
	name: string;
	/** Start time in milliseconds (-1 if not started) */
	startTime: number;
	/** Stop time in milliseconds (-1 if not stopped) */
	stopTime: number;
	/** Latest internal message */
	latestMessage: string;

	/**
	 * Creates a new Timer instance.
	 *
	 * @param name - The name of the timer for identification in logs
	 * @param start - Whether to automatically start the timer upon creation
	 * @example
	 * const timer = new Timer('apiCall', true);
	 */
	constructor(name: string, start?: boolean);

	/**
	 * Updates the timer's internal message and logs it.
	 *
	 * @param message - The message to set and log
	 */
	updateMessage(message: string): Promise<void>;

	/**
	 * Starts the timer if it hasn't been started already.
	 */
	start(): Promise<void>;

	/**
	 * Stops the timer and returns the elapsed duration.
	 *
	 * @returns The time elapsed in milliseconds between start and stop
	 * @example
	 * const duration = timer.stop();
	 */
	stop(): number;

	/**
	 * Gets the elapsed time. If running, returns time since start.
	 * If stopped, returns time between start and stop.
	 *
	 * @returns Elapsed time in milliseconds
	 */
	elapsed(): number;

	/**
	 * Gets the time elapsed since the timer was started (even if stopped).
	 *
	 * @returns Time in milliseconds since start
	 */
	elapsedSinceStart(): number;

	/**
	 * Gets the time elapsed since the timer was stopped.
	 *
	 * @returns Time in milliseconds since stop, or -1 if still running
	 */
	elapsedSinceStop(): number;

	/**
	 * Gets the current time in milliseconds (Date.now()).
	 *
	 * @returns Current timestamp in milliseconds
	 */
	now(): number;

	/**
	 * Checks whether the timer has been started.
	 *
	 * @returns True if the timer was started
	 */
	wasStarted(): boolean;

	/**
	 * Checks whether the timer has not been started yet.
	 *
	 * @returns True if timer has not yet been started
	 */
	notStarted(): boolean;

	/**
	 * Checks whether the timer is currently running (started but not stopped).
	 *
	 * @returns True if the timer is currently running
	 */
	isRunning(): boolean;

	/**
	 * Checks whether the timer has been stopped.
	 *
	 * @returns True if the timer was stopped
	 */
	wasStopped(): boolean;

	/**
	 * Gets the current status of the timer.
	 *
	 * @returns Status string: 'NOT_STARTED', 'IS_RUNNING', or 'IS_STOPPED'
	 */
	status(): string;

	/**
	 * Gets the latest internal message from the timer.
	 *
	 * @returns The latest message
	 */
	message(): string;

	/**
	 * Gets a detailed object describing the timer state.
	 *
	 * @param sendToLog - Whether to send details to the console log
	 * @returns Object with timer state details
	 */
	details(sendToLog?: boolean): {
		name: string;
		status: string;
		started: boolean;
		running: boolean;
		stopped: boolean;
		start: number;
		stop: number;
		elapsed: number;
		now: number;
		elapsedSinceStart: number;
		elapsedSinceStop: number;
		latestMessage: string;
	};
}


/**
 * A comprehensive debug and logging class with environment-aware log levels.
 * Provides multiple logging levels (ERROR, WARN, INFO, MSG, DIAG, DEBUG) and
 * automatic environment detection.
 *
 * @example
 * await DebugAndLog.info('Processing request');
 * await DebugAndLog.error('Failed to connect', { error: err });
 *
 * @example
 * if (DebugAndLog.isDevelopment()) {
 *   await DebugAndLog.debug('Detailed debug info', { data });
 * }
 */
export class DebugAndLog {
	static readonly PROD: string;
	static readonly TEST: string;
	static readonly DEV: string;
	static readonly ENVIRONMENTS: string[];

	static readonly LOG: string;
	static readonly ERROR: string;
	static readonly WARN: string;
	static readonly INFO: string;
	static readonly MSG: string;
	static readonly DIAG: string;
	static readonly DEBUG: string;

	static readonly LOG_LEVEL_NUM: number;
	static readonly ERROR_LEVEL_NUM: number;
	static readonly WARN_LEVEL_NUM: number;
	static readonly INFO_LEVEL_NUM: number;
	static readonly MSG_LEVEL_NUM: number;
	static readonly DIAG_LEVEL_NUM: number;
	static readonly DEBUG_LEVEL_NUM: number;
	static readonly PROD_DEFAULT_LEVEL_NUM: number;

	static readonly ALLOWED_ENV_TYPE_VAR_NAMES: string[];
	static readonly ALLOWED_LOG_VAR_NAMES: string[];
	static readonly ALLOWED_LOG_LEVEL_STRINGS: string[];

	constructor();

	/**
	 * Sets the log level.
	 *
	 * @deprecated Use environment variables CACHE_DATA_LOG_LEVEL, LOG_LEVEL, or AWS_LAMBDA_LOG_LEVEL instead
	 * @param logLevel - Log level from 0-5
	 * @param expiration - Deprecated parameter with no effect
	 * @returns The set log level
	 */
	static setLogLevel(logLevel?: number, expiration?: number): number;

	/**
	 * Gets the current log level.
	 *
	 * @returns The current log level (0-5)
	 */
	static getLogLevel(): number;

	/**
	 * Gets the default log level based on environment variables.
	 *
	 * @returns Default log level (0-5)
	 */
	static getDefaultLogLevel(): number;

	/**
	 * Gets the application environment type.
	 *
	 * @returns Environment type: 'PROD', 'TEST', or 'DEV'
	 */
	static getEnv(): string;

	/**
	 * Gets the environment type from environment variables.
	 *
	 * @returns Environment type: 'PROD', 'TEST', or 'DEV'
	 */
	static getEnvType(): string;

	/**
	 * Gets the environment type from the first matching environment variable.
	 *
	 * @returns Environment type string or 'NONE' if not found
	 */
	static getEnvTypeFromEnvVar(): string;

	/**
	 * Checks if NODE_ENV is set to "development".
	 *
	 * @returns True if NODE_ENV is "development"
	 */
	static nodeEnvIsDevelopment(): boolean;

	/**
	 * Checks if NODE_ENV is set to "production" or is empty/undefined.
	 *
	 * @returns True if NODE_ENV is "production" or not set
	 */
	static nodeEnvIsProduction(): boolean;

	/**
	 * Gets the current NODE_ENV value.
	 *
	 * @returns "development" or "production"
	 */
	static getNodeEnv(): string;

	/**
	 * Checks if NODE_ENV has changed since initialization.
	 *
	 * @returns True if NODE_ENV has changed
	 */
	static nodeEnvHasChanged(): boolean;

	/**
	 * Checks if the application is NOT running in production.
	 *
	 * @returns True if not in production
	 */
	static isNotProduction(): boolean;

	/**
	 * Checks if the application is running in production.
	 *
	 * @returns True if in production
	 */
	static isProduction(): boolean;

	/**
	 * Checks if the application is running in development.
	 *
	 * @returns True if in development
	 */
	static isDevelopment(): boolean;

	/**
	 * Checks if the application is running in test environment.
	 *
	 * @returns True if in test environment
	 */
	static isTest(): boolean;

	/**
	 * Writes a log entry with the specified tag, message, and optional object.
	 *
	 * @param tag - Tag that appears in the log (e.g., 'ERROR', 'INFO')
	 * @param message - The message to be displayed
	 * @param obj - Optional object to include in the log entry
	 * @returns True when log is written
	 * @example
	 * await DebugAndLog.writeLog('INFO', 'User logged in', { userId: 123 });
	 */
	static writeLog(tag: string, message: string, obj?: object | null): Promise<boolean>;

	/**
	 * Logs a debug message at level 5 (DEBUG).
	 *
	 * @param message - The debug message
	 * @param obj - Optional object with additional debug information
	 * @returns True when log is written
	 */
	static debug(message: string, obj?: object | null): Promise<boolean>;

	/**
	 * Logs a diagnostic message at level 4 (DIAG).
	 *
	 * @param message - The diagnostic message
	 * @param obj - Optional object with diagnostic data
	 * @returns True when log is written
	 */
	static diag(message: string, obj?: object | null): Promise<boolean>;

	/**
	 * Logs a message at level 3 (MSG).
	 *
	 * @param message - The message
	 * @param obj - Optional object with additional information
	 * @returns True when log is written
	 */
	static msg(message: string, obj?: object | null): Promise<boolean>;

	/**
	 * Logs a message at level 3 (MSG). Alias for msg().
	 *
	 * @param message - The message
	 * @param obj - Optional object with additional information
	 * @returns True when log is written
	 */
	static message(message: string, obj?: object | null): Promise<boolean>;

	/**
	 * Logs an informational message at level 2 (INFO).
	 *
	 * @param message - The informational message
	 * @param obj - Optional object with additional information
	 * @returns True when log is written
	 */
	static info(message: string, obj?: object | null): Promise<boolean>;

	/**
	 * Logs a production-worthy log entry at level 0 (LOG).
	 *
	 * @param message - The message
	 * @param tag - Optional tag (defaults to 'LOG')
	 * @param obj - Optional object with additional data
	 * @returns True when log is written
	 * @example
	 * await DebugAndLog.log('Request completed | duration: 150ms | status: 200');
	 */
	static log(message: string, tag?: string, obj?: object | null): Promise<boolean>;

	/**
	 * Logs a warning message at level 1 (WARN).
	 *
	 * @param message - The warning message
	 * @param obj - Optional object with warning details
	 */
	static warn(message: string, obj?: object | null): Promise<void>;

	/**
	 * Logs a warning message at level 1 (WARN). Alias for warn().
	 *
	 * @param message - The warning message
	 * @param obj - Optional object with warning details
	 */
	static warning(message: string, obj?: object | null): Promise<void>;

	/**
	 * Logs an error message at level 0 (ERROR).
	 *
	 * @param message - The error message
	 * @param obj - Optional object with error details
	 */
	static error(message: string, obj?: object | null): Promise<void>;
}

/**
 * Stores connection and cache information for API requests.
 * A container for multiple Connection objects.
 *
 * @example
 * const connections = new Connections([
 *   { name: 'api', host: 'api.example.com', path: '/v1/users' },
 *   { name: 'auth', host: 'auth.example.com', path: '/oauth/token' }
 * ]);
 * const apiConnection = connections.get('api');
 */
export class Connections {
	/**
	 * Creates a Connections container.
	 *
	 * @param connections - Connection objects or configuration arrays/objects
	 */
	constructor(connections?: Array<object | Connection> | object | Connection | null);

	/**
	 * Adds a connection to the collection.
	 *
	 * @param obj - Connection instance or configuration object with a name property
	 */
	add(obj: object | Connection): void;

	/**
	 * Gets a Connection by name.
	 *
	 * @param connectionName - The name of the connection to retrieve
	 * @returns The Connection instance or null if not found
	 */
	get(connectionName: string): Connection | null;

	/**
	 * Returns all connections as plain objects.
	 *
	 * @returns Object with connection names as keys and connection objects as values
	 */
	toObject(): Record<string, object>;

	/**
	 * Returns information about all connections.
	 *
	 * @returns Object with connection names as keys and connection info as values
	 */
	info(): Record<string, object>;

	/**
	 * JSON representation of all connections.
	 *
	 * @returns JSON string of connections
	 */
	toJSON(): string;
}

/**
 * The Connection object provides the base for requests.
 * Stores connection configuration including host, path, authentication, and cache profiles.
 *
 * @example
 * const apiConnection = new Connection({
 *   name: 'userAPI',
 *   host: 'api.example.com',
 *   path: '/v1/users',
 *   method: 'GET'
 * });
 * const connObj = apiConnection.toObject();
 */
export class Connection {
	/**
	 * Creates a new Connection from a configuration object.
	 *
	 * @param obj - Connection configuration
	 */
	constructor(obj?: {
		name?: string;
		method?: string;
		uri?: string;
		protocol?: string;
		host?: string;
		path?: string;
		body?: string | null;
		parameters?: object | null;
		headers?: object | null;
		options?: object | null;
		note?: string;
		authentication?: object | ConnectionAuthentication | null;
		cache?: Array<object> | null;
	} | null);

	/**
	 * Gets the connection parameters merged with authentication parameters.
	 *
	 * @returns Parameters object or null
	 */
	getParameters(): object | null;

	/**
	 * Gets the connection headers merged with authentication headers.
	 *
	 * @returns Headers object or null
	 */
	getHeaders(): object | null;

	/**
	 * Gets the request body (from authentication or connection).
	 *
	 * @returns Body string or null
	 */
	getBody(): string | null;

	/**
	 * Gets a cache profile by name.
	 *
	 * @param profileName - The name of the cache profile
	 * @returns Cache profile object or undefined
	 */
	getCacheProfile(profileName: string): object | undefined;

	/**
	 * Returns the connection as a plain object including auth-merged fields.
	 *
	 * @returns Connection object with all properties
	 */
	toObject(): object;

	/**
	 * Returns connection info (without merged auth fields).
	 *
	 * @returns Connection info object
	 */
	toInfoObject(): object;

	/**
	 * Gets the connection name.
	 *
	 * @returns Name of the connection
	 */
	getName(): string | null;

	/**
	 * String representation of the connection.
	 *
	 * @returns Concatenated connection values
	 */
	toString(): string;
}

/**
 * Extends Connection to allow adding headers and parameters dynamically.
 * Used when building requests that need runtime modifications.
 *
 * @example
 * const request = new ConnectionRequest(baseConnection.get());
 * request.addHeader('Authorization', `Bearer ${token}`);
 * request.addParameter('limit', 10);
 */
export class ConnectionRequest extends Connection {
	/**
	 * Creates a new ConnectionRequest.
	 *
	 * @param obj - Connection configuration object
	 */
	constructor(obj: object);

	/**
	 * Adds key/value pairs to headers.
	 *
	 * @param headers - Headers object to merge
	 */
	addHeaders(headers: object): void;

	/**
	 * Adds a single header key/value pair.
	 *
	 * @param key - Header key
	 * @param value - Header value
	 */
	addHeader(key: string, value: string): void;

	/**
	 * Adds key/value pairs to parameters.
	 *
	 * @param parameters - Parameters object to merge
	 */
	addParameters(parameters: object): void;

	/**
	 * Adds a single parameter key/value pair.
	 *
	 * @param key - Parameter key
	 * @param value - Parameter value
	 */
	addParameter(key: string, value: any): void;
}

/**
 * Stores authentication tokens, parameters, and credentials separately
 * from regular connection request parameters.
 *
 * @example
 * const auth = new ConnectionAuthentication({
 *   headers: { 'x-api-key': 'your-api-key' }
 * });
 *
 * @example
 * const auth = new ConnectionAuthentication({
 *   basic: { username: 'user', password: 'pass' }
 * });
 */
export class ConnectionAuthentication {
	/**
	 * Creates a new ConnectionAuthentication instance.
	 *
	 * @param obj - Authentication configuration
	 */
	constructor(obj?: {
		headers?: Record<string, string> | null;
		parameters?: Record<string, string> | null;
		body?: object | null;
		basic?: { username: string; password: string } | null;
	} | null);

	/**
	 * Whether authentication headers are configured.
	 *
	 * @returns True if headers are set
	 */
	hasHeader(): boolean;

	/**
	 * Whether authentication parameters are configured.
	 *
	 * @returns True if parameters are set
	 */
	hasParameter(): boolean;

	/**
	 * Whether authentication body is configured.
	 *
	 * @returns True if body is set
	 */
	hasBody(): boolean;

	/**
	 * Whether basic authentication is configured.
	 *
	 * @returns True if basic auth is set
	 */
	hasBasic(): boolean;

	/**
	 * Returns the authentication as a plain object with headers, parameters, and body.
	 *
	 * @returns Authentication object
	 */
	toObject(): object;
}


/**
 * Processes the request from the event data. Parses out client details
 * such as IP and user agent. May be extended to provide custom processing.
 *
 * @example
 * const requestInfo = new RequestInfo(event);
 * const userAgent = requestInfo.getClientUserAgent();
 * const clientIP = requestInfo.getClientIP();
 */
export class RequestInfo {
	/**
	 * Creates a new RequestInfo instance from a Lambda event.
	 *
	 * @param event - API Gateway Lambda event object
	 */
	constructor(event: object);

	/**
	 * Whether the request is valid.
	 *
	 * @returns True if the request is valid
	 */
	isValid(): boolean;

	/**
	 * Returns the request data as an object.
	 *
	 * @param full - If true, includes sensitive information
	 * @returns Request data object
	 */
	toObject(full?: boolean): object;

	/**
	 * Gets a data object by key (e.g., "client").
	 *
	 * @param key - Key to retrieve
	 * @returns Data relating to the key
	 */
	get(key?: string): any;

	/**
	 * Gets client data by key.
	 *
	 * @param key - Client data key (e.g., "userAgent", "ip")
	 * @returns Client data value
	 */
	getClient(key?: string): any;

	/**
	 * Gets the user agent string from the client request.
	 *
	 * @returns User agent string
	 */
	getClientUserAgent(): string | null;

	/**
	 * Gets the IP address from the client request.
	 *
	 * @returns IP address string
	 */
	getClientIp(): string | null;

	/**
	 * Gets the IP address from the client request (alias for getClientIp).
	 *
	 * @returns IP address string
	 */
	getClientIP(): string | null;

	/**
	 * Gets the referrer from the client request.
	 *
	 * @param full - If true, returns full referrer; if false, returns domain only
	 * @returns Referrer string
	 */
	getClientReferrer(full?: boolean): string | null;

	/**
	 * Gets the referrer from the client request (alias for getClientReferrer).
	 *
	 * @param full - If true, returns full referrer; if false, returns domain only
	 * @returns Referrer string
	 */
	getClientReferer(full?: boolean): string | null;

	/**
	 * Gets the origin from the client request.
	 *
	 * @returns Origin string
	 */
	getClientOrigin(): string | null;

	/**
	 * Gets the if-modified-since header value.
	 *
	 * @returns If-modified-since date string
	 */
	getClientIfModifiedSince(): string | null;

	/**
	 * Gets the if-none-match (ETag) header value.
	 *
	 * @returns ETag string
	 */
	getClientIfNoneMatch(): string | null;

	/**
	 * Gets the accept header value.
	 *
	 * @returns Accept header string
	 */
	getClientAccept(): string | null;

	/**
	 * Gets the headers from the client request.
	 *
	 * @returns Headers object
	 */
	getClientHeaders(): object;

	/**
	 * Gets the query string parameters from the client request.
	 *
	 * @returns Parameters object
	 */
	getClientParameters(): object;

	/**
	 * Gets the body from the client request (for POST requests).
	 *
	 * @returns Body string or null
	 */
	getClientBody(): string | null;

	/**
	 * Gets headers to proxy from the client request.
	 *
	 * @param headerKeysToProxy - Array of header keys to proxy
	 * @returns Object with proxied headers
	 */
	getClientHeadersToProxy(headerKeysToProxy?: string[]): object;
}

/**
 * Extends RequestInfo to provide request validation, parameter extraction, and authentication.
 * Processes Lambda API Gateway events and validates parameters using a flexible validation system.
 *
 * @example
 * ClientRequest.init({
 *   referrers: ['example.com'],
 *   parameters: {
 *     pathParameters: { id: (value) => /^[a-zA-Z0-9-]+$/.test(value) }
 *   }
 * });
 *
 * const clientRequest = new ClientRequest(event, context);
 * if (clientRequest.isValid()) {
 *   // Process valid request
 * }
 */
export class ClientRequest extends RequestInfo {
	/**
	 * Creates a new ClientRequest from a Lambda event and context.
	 *
	 * @param event - Lambda API Gateway event object
	 * @param context - Lambda context object
	 */
	constructor(event: object, context: object);

	/**
	 * Initializes the ClientRequest class with validation configuration.
	 *
	 * @param options - Validation configuration options
	 * @throws Error if options is not an object
	 * @example
	 * ClientRequest.init({
	 *   referrers: ['example.com'],
	 *   parameters: {
	 *     pathParameters: { id: (value) => /^[a-zA-Z0-9-]+$/.test(value) },
	 *     queryStringParameters: { limit: (value) => !isNaN(value) && value > 0 }
	 *   }
	 * });
	 */
	static init(options: object): void;

	/**
	 * Returns the current validation rules.
	 *
	 * @returns Validation info object
	 */
	static info(): { referrerWhiteList: string[] };

	/**
	 * Gets the allowed referrers list.
	 *
	 * @returns Array of allowed referrer strings
	 */
	static getReferrerWhiteList(): string[];

	/**
	 * Gets the parameter validation configuration.
	 *
	 * @returns Parameter validations object
	 */
	static getParameterValidations(): object;

	/**
	 * Converts an HTTP header key from kebab-case to camelCase.
	 *
	 * @param headerKey - HTTP header key (e.g., 'Content-Type')
	 * @returns Header key in camelCase (e.g., 'contentType')
	 * @example
	 * ClientRequest.convertHeaderKeyToCamelCase('x-api-key'); // 'xApiKey'
	 */
	static convertHeaderKeyToCamelCase(headerKey: string): string;

	/**
	 * Returns a structured validation result describing why the request passed or failed.
	 *
	 * @returns Validation reason object
	 */
	getValidationReason(): {
		isValid: boolean;
		statusCode: number;
		messages: string[];
	};
}

/**
 * ResponseDataModel class for collecting and structuring response data.
 * Supports building complex response objects by adding items with keys or as array elements.
 *
 * @example
 * const response = new ResponseDataModel({ users: [], metadata: {} }, 'data');
 * response.addItemByKey({ id: 1, name: 'John' }, 'users');
 * console.log(response.toString());
 */
export class ResponseDataModel {
	/**
	 * Creates a new ResponseDataModel instance.
	 *
	 * @param data - Initial data structure (can be a skeleton or complete object)
	 * @param label - Label to use as a key when added to another ResponseDataModel
	 */
	constructor(data?: any, label?: string);

	/**
	 * Gets the label for this data model.
	 *
	 * @returns The label string
	 */
	getLabel(): string;

	/**
	 * Gets a copy of the response data.
	 *
	 * @returns A cloned copy of the data
	 */
	getResponseData(): any;

	/**
	 * Adds an item as part of an array or under a labeled key.
	 *
	 * @param item - Item to add (can be ResponseDataModel or any value)
	 */
	addItem(item: ResponseDataModel | any): void;

	/**
	 * Adds an item by a specific key.
	 *
	 * @param item - Item to add (can be ResponseDataModel or any value)
	 * @param key - Key to use for the item
	 */
	addItemByKey(item: ResponseDataModel | any, key?: string): void;

	/**
	 * Converts the response data to an object (optionally wrapped with label).
	 *
	 * @returns The data object
	 */
	toObject(): any;

	/**
	 * Converts the response data to a JSON string.
	 *
	 * @returns JSON string representation
	 */
	toString(): string;
}

/**
 * Response class for building and managing HTTP responses.
 * Provides static initialization, content type detection, and generic response templates.
 *
 * @example
 * const response = new Response(clientRequest, { statusCode: 200, body: { success: true } });
 * response.finalize();
 * return response.toObject();
 */
export class Response {
	/** Content type constants */
	static readonly CONTENT_TYPE: {
		JSON: string;
		HTML: string;
		XML: string;
		RSS: string;
		TEXT: string;
		JAVASCRIPT: string;
		CSS: string;
		CSV: string;
	};

	/**
	 * Creates a new Response instance.
	 *
	 * @param clientRequest - The client request object
	 * @param obj - Initial response structure
	 * @param contentType - Content type for the response
	 */
	constructor(clientRequest: ClientRequest, obj?: object, contentType?: string | null);

	/**
	 * Initializes the Response class with custom settings and response templates.
	 *
	 * @param options - Configuration options
	 * @example
	 * Response.init({
	 *   settings: { errorExpirationInSeconds: 300 },
	 *   jsonResponses: { response404: { statusCode: 404, body: { error: 'Not found' } } }
	 * });
	 */
	static init(options: object): void;

	/**
	 * Gets information about response initialization.
	 *
	 * @returns Object with isInitialized and settings
	 */
	static info(): { isInitialized: boolean; settings: object };

	/**
	 * Gets the static content type setting.
	 *
	 * @returns Content type string
	 */
	static getContentType(): string;

	/**
	 * Gets the error expiration setting in seconds.
	 *
	 * @returns Error expiration in seconds
	 */
	static getErrorExpirationInSeconds(): number;

	/**
	 * Gets the route expiration setting in seconds.
	 *
	 * @returns Route expiration in seconds
	 */
	static getRouteExpirationInSeconds(): number;

	/**
	 * Inspects an object to determine its content type.
	 *
	 * @param obj - Object to inspect
	 * @returns Detected content type string
	 */
	static inspectContentType(obj: object): string;

	/**
	 * Inspects a body string to determine its content type.
	 *
	 * @param body - Body string to inspect
	 * @returns Detected content type string
	 */
	static inspectBodyContentType(body: string): string;

	/**
	 * Inspects headers to determine content type.
	 *
	 * @param headers - Headers object to inspect
	 * @returns Detected content type string
	 */
	static inspectHeaderContentType(headers: object): string;

	/**
	 * Gets generic response templates for a content type.
	 *
	 * @param contentType - Content type to get responses for
	 * @returns Generic response templates object
	 */
	static getGenericResponses(contentType: string): object;

	/**
	 * Resets the response to default values.
	 *
	 * @param obj - Properties to set after reset
	 * @param contentType - Content type
	 */
	reset(obj: object, contentType?: string | null): void;

	/**
	 * Sets the response properties.
	 *
	 * @param obj - Response properties to set
	 * @param contentType - Content type
	 */
	set(obj: object, contentType?: string | null): void;

	/**
	 * Gets the response status code.
	 *
	 * @returns HTTP status code
	 */
	getStatusCode(): number;

	/**
	 * Gets the response headers.
	 *
	 * @returns Headers object
	 */
	getHeaders(): object;

	/**
	 * Gets the response body.
	 *
	 * @returns Body value
	 */
	getBody(): any;

	/**
	 * Gets the instance content type.
	 *
	 * @returns Content type string
	 */
	getContentType(): string;

	/**
	 * Gets the content type code.
	 *
	 * @returns Content type code string
	 */
	getContentTypeCode(): string;

	/**
	 * Inspects the instance to determine content type.
	 *
	 * @returns Detected content type
	 */
	inspectContentType(): string;

	/**
	 * Inspects the instance body to determine content type.
	 *
	 * @returns Detected content type
	 */
	inspectBodyContentType(): string;

	/**
	 * Inspects the instance headers to determine content type.
	 *
	 * @returns Detected content type
	 */
	inspectHeaderContentType(): string;

	/**
	 * Sets the response status code.
	 *
	 * @param statusCode - HTTP status code
	 */
	setStatusCode(statusCode: number): void;

	/**
	 * Sets the response headers.
	 *
	 * @param headers - Headers object
	 */
	setHeaders(headers: object): void;

	/**
	 * Sets the response body.
	 *
	 * @param body - Body value
	 */
	setBody(body: any): void;

	/**
	 * Adds a single header to the response.
	 *
	 * @param key - Header key
	 * @param value - Header value
	 */
	addHeader(key: string, value: string): void;

	/**
	 * Adds an object to the JSON body.
	 *
	 * @param obj - Object to add to the body
	 */
	addToJsonBody(obj: object): void;

	/**
	 * Sets a message in the response body.
	 *
	 * @param message - Message string
	 */
	setMessage(message: string): void;

	/**
	 * Converts the response to an object (statusCode, headers, body).
	 *
	 * @returns Response object
	 */
	toObject(): { statusCode: number; headers: object; body: string };

	/**
	 * Converts the response to a JSON string.
	 *
	 * @returns JSON string
	 */
	toString(): string;

	/**
	 * Converts the response to a JSON-compatible object.
	 *
	 * @returns JSON-compatible response object
	 */
	toJSON(): object;

	/**
	 * Finalizes the response, applying generic templates and cache headers.
	 */
	finalize(): void;
}


/**
 * AppConfig provides base functionality to be extended by a custom Config class.
 * Holds common variables and methods for application configuration including
 * settings, connections, validations, responses, and SSM parameters.
 *
 * @example
 * class Config extends AppConfig {
 *   static init(options) {
 *     super.init(options);
 *     // Custom initialization
 *   }
 * }
 *
 * Config.init({
 *   settings: { dataLimit: 1000 },
 *   connections: { myApi: { host: 'api.example.com', path: '/v1' } }
 * });
 *
 * await Config.promise();
 * const settings = Config.settings();
 */
export class AppConfig {
	/**
	 * Initialize the Config class with asynchronous parallel execution.
	 * Returns immediately while initialization operations execute asynchronously.
	 * Use AppConfig.promise() to wait for all initialization to complete.
	 *
	 * @param options - Configuration options
	 * @returns True if initialization started successfully, false on synchronous error
	 * @example
	 * Config.init({
	 *   settings: { dataLimit: 1000 },
	 *   connections: { myApi: { host: 'api.example.com', path: '/v1' } }
	 * });
	 * await Config.promise();
	 */
	static init(options?: AppConfigInitOptions): boolean;

	/**
	 * Add a promise to AppConfig. Use AppConfig.promise() to ensure all are resolved.
	 *
	 * @param promise - Promise to add to the initialization queue
	 */
	static add(promise: Promise<any>): void;

	/**
	 * Get the application settings object.
	 *
	 * @returns Settings object or null if not initialized
	 * @example
	 * const limit = Config.settings().dataLimit;
	 */
	static settings(): object | null;

	/**
	 * Get the Connections instance.
	 *
	 * @returns Connections instance or null if not initialized
	 */
	static connections(): Connections | null;

	/**
	 * Get a connection by name and return the Connection instance.
	 *
	 * @param name - The name of the connection to retrieve
	 * @returns Connection instance or null if not found
	 */
	static getConnection(name: string): Connection | null;

	/**
	 * Get a connection by name and return it as a plain object.
	 *
	 * @param name - The name of the connection to retrieve
	 * @returns Connection object with properties or null if not found
	 * @example
	 * const conn = Config.getConn('myConnection');
	 */
	static getConn(name: string): object | null;

	/**
	 * Get a connection AND one of its Cache Profiles by name and return as plain objects.
	 *
	 * @param connectionName - The name of the connection to retrieve
	 * @param cacheProfileName - The name of the cache profile to retrieve
	 * @returns Object with conn and cacheProfile properties (either may be null)
	 * @example
	 * const { conn, cacheProfile } = Config.getConnCacheProfile('myConnection', 'myCacheProfile');
	 */
	static getConnCacheProfile(connectionName: string, cacheProfileName: string): {
		conn: object | null;
		cacheProfile: object | null;
	};

	/**
	 * Returns a promise that resolves when all initialization is complete.
	 *
	 * @returns A promise that resolves when all added promises are resolved
	 * @example
	 * await Config.promise();
	 */
	static promise(): Promise<any[]>;
}

/**
 * Base class for CachedSsmParameter and CachedSecret.
 * Accesses data through the AWS Parameters and Secrets Lambda Extension.
 *
 * @example
 * const myParam = new CachedSsmParameter('/myapp/db/password');
 * myParam.prime(); // Start loading in background
 * await myParam.prime(); // Ensure loaded
 * const value = myParam.sync_getValue();
 */
export class CachedParameterSecret {
	static hostname: string;
	static port: string;

	/** Parameter path/name or Secret ID */
	name: string;
	/** Cached value object (null until loaded) */
	value: object | null;
	/** Cache metadata */
	cache: {
		lastRefresh: number;
		status: number;
		refreshAfter: number;
		promise: Promise<number> | null;
	};

	/**
	 * Creates a new CachedParameterSecret.
	 *
	 * @param name - Path and Parameter Name or Secret ID
	 * @param options - Configuration options
	 */
	constructor(name: string, options?: { refreshAfter?: number });

	/**
	 * Gets the parameter/secret name.
	 *
	 * @returns The parameter path/name or Secret ID
	 */
	getName(): string;

	/**
	 * Returns a string with the name and instance type.
	 *
	 * @returns Name tag string
	 */
	getNameTag(): string;

	/**
	 * Returns an object representation (excluding the value).
	 *
	 * @returns Object with name, instanceof, cache, and status properties
	 */
	toObject(): object;

	/**
	 * JSON representation (returns value string or placeholder).
	 *
	 * @returns Value string or pending placeholder
	 */
	toJSON(): string;

	/**
	 * String representation (returns value string or placeholder).
	 *
	 * @returns Value string or pending placeholder
	 */
	toString(): string;

	/**
	 * Gets the constructor name.
	 *
	 * @returns Constructor name string
	 */
	instanceof(): string;

	/**
	 * Whether the value is currently being refreshed.
	 *
	 * @returns True if refreshing
	 */
	isRefreshing(): boolean;

	/**
	 * Whether the value has expired and needs a refresh.
	 *
	 * @returns True if refresh is needed
	 */
	needsRefresh(): boolean;

	/**
	 * Whether the value is valid (has been set and is not null).
	 *
	 * @returns True if valid
	 */
	isValid(): boolean;

	/**
	 * Pre-emptively requests the secret or parameter.
	 * Call without await to start in background, then await before use.
	 *
	 * @returns -1 if error, 1 if success
	 * @example
	 * myParam.prime(); // Start in background
	 * await myParam.prime(); // Ensure complete
	 */
	prime(): Promise<number>;

	/**
	 * Forces a refresh from AWS regardless of expiration.
	 *
	 * @returns -1 if error, 1 if success
	 */
	refresh(): Promise<number>;

	/**
	 * Gets the current value object (refreshes if expired).
	 *
	 * @returns Secret or Parameter object
	 */
	get(): Promise<object | null>;

	/**
	 * Gets just the value string (refreshes if expired).
	 *
	 * @returns Secret or Parameter value string
	 */
	getValue(): Promise<string | null>;

	/**
	 * Synchronously returns the cached value string.
	 * Must call and await get(), getValue(), or refresh() first.
	 *
	 * @returns The value string
	 * @throws Error if value is null or async methods haven't been called
	 */
	sync_getValue(): string;

	/**
	 * Gets the URL path for the Lambda Extension request.
	 *
	 * @returns URL path string
	 */
	getPath(): string;
}

/**
 * Retrieves parameters from AWS Systems Manager Parameter Store
 * via the Parameters and Secrets Lambda Extension.
 *
 * @example
 * const dbPassword = new CachedSsmParameter('/myapp/db/password');
 * const password = await dbPassword.getValue();
 */
export class CachedSsmParameter extends CachedParameterSecret {
	/**
	 * Creates a new CachedSsmParameter.
	 *
	 * @param name - Full path and parameter name (e.g., '/myapp/db/password')
	 * @param options - Configuration options
	 */
	constructor(name: string, options?: { refreshAfter?: number });

	/**
	 * Returns the URL path for the SSM parameter Lambda Extension endpoint.
	 *
	 * @returns URL path with encoded parameter name
	 */
	getPath(): string;

	/**
	 * Whether the SSM parameter value is valid.
	 *
	 * @returns True if value contains a Parameter property
	 */
	isValid(): boolean;
}

/**
 * Retrieves secrets from AWS Secrets Manager
 * via the Parameters and Secrets Lambda Extension.
 *
 * @example
 * const dbCredentials = new CachedSecret('myapp-database-credentials');
 * const credentials = await dbCredentials.getValue();
 */
export class CachedSecret extends CachedParameterSecret {
	/**
	 * Creates a new CachedSecret.
	 *
	 * @param name - Secret ID from Secrets Manager
	 * @param options - Configuration options
	 */
	constructor(name: string, options?: { refreshAfter?: number });

	/**
	 * Returns the URL path for the Secrets Manager Lambda Extension endpoint.
	 *
	 * @returns URL path with encoded secret ID
	 */
	getPath(): string;

	/**
	 * Whether the secret value is valid.
	 *
	 * @returns True if value contains a SecretString property
	 */
	isValid(): boolean;
}

/**
 * Container class for CachedParameterSecret objects.
 * Manages a collection of cached parameters and secrets.
 *
 * @example
 * const dbPassword = new CachedSsmParameter('/myapp/db/password');
 * const apiKey = new CachedSecret('myapp-api-key');
 * await CachedParameterSecrets.prime();
 * const names = CachedParameterSecrets.getNames();
 */
export class CachedParameterSecrets {
	/**
	 * Adds a CachedParameterSecret to the collection.
	 *
	 * @param cachedParameterSecretObject - The object to add
	 */
	static add(cachedParameterSecretObject: CachedParameterSecret): void;

	/**
	 * Gets a CachedParameterSecret by name.
	 *
	 * @param name - The parameter name or secret ID
	 * @returns The matching CachedParameterSecret or undefined
	 */
	static get(name: string): CachedParameterSecret | undefined;

	/**
	 * Returns all cached parameter secrets as an array of objects.
	 *
	 * @returns Array of toObject() representations
	 */
	static toArray(): object[];

	/**
	 * Returns all cached parameter secrets as an object.
	 *
	 * @returns Object containing the array
	 */
	static toObject(): { objects: object[] };

	/**
	 * Returns JSON string of all cached parameter secrets.
	 *
	 * @returns JSON string
	 */
	static toJSON(): string;

	/**
	 * Gets all name tags.
	 *
	 * @returns Array of name tag strings
	 */
	static getNameTags(): string[];

	/**
	 * Gets all names.
	 *
	 * @returns Array of name strings
	 */
	static getNames(): string[];

	/**
	 * Primes all cached parameter secrets in parallel.
	 *
	 * @returns Promise resolving to true on success, false on error
	 * @example
	 * await CachedParameterSecrets.prime();
	 */
	static prime(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Prints a demo message to the console.
 *
 * @example
 * printMsg(); // logs "This is a message from the demo package"
 */
export function printMsg(): void;

/**
 * Given an object such as a Lambda event which may hold secret keys in the
 * query string or Authorization headers, it will attempt to find and obfuscate
 * them. It searches for any object keys or string patterns that have 'key',
 * 'secret', or 'token' in the label and obfuscates its value.
 *
 * @param obj - The object to sanitize
 * @returns A sanitized copy of the object with secrets obfuscated
 * @example
 * const event = { queryStringParameters: { apiKey: 'sk-1234567890' } };
 * const safe = sanitize(event);
 * // safe.queryStringParameters.apiKey === '******7890'
 */
export function sanitize(obj: object | string): object;

/**
 * Given a secret string, returns a string padded out at the beginning with '*'
 * or a passed character, leaving only the specified number of characters
 * unobfuscated. No more than 25% of the string, or 6 characters may be kept,
 * whichever is lesser.
 *
 * @param str - The secret string to obfuscate
 * @param options - Obfuscation options
 * @param options.keep - Number of characters to keep unobfuscated on the end (default: 4)
 * @param options.char - Character to pad with (default: '*')
 * @param options.len - Length of the result string (default: 10)
 * @returns Obfuscated string with only trailing characters visible
 * @example
 * obfuscate('123456789123456');
 * // returns '******3456'
 *
 * @example
 * obfuscate('mySecret', { keep: 2, char: '#', len: 8 });
 * // returns '######et'
 */
export function obfuscate(str: string, options?: {
	keep?: number;
	char?: string | number;
	len?: number;
}): string;

/**
 * Hash JSON objects and arrays to determine matches. Works best with JSON data
 * objects that survive JSON.stringify(). Produces reproducible hashes for
 * equivalent data structures regardless of key order.
 *
 * @param algorithm - Hash algorithm (e.g., 'sha256', 'md5')
 * @param data - Data to hash (object, array, string, number, boolean, or BigInt)
 * @param options - Hashing options
 * @param options.salt - Salt string to append during hashing (default: '')
 * @param options.iterations - Number of hash iterations (default: 1)
 * @returns Reproducible hash string in hex format
 * @example
 * const hash = hashThisData('sha256', { name: 'test', value: 42 });
 *
 * @example
 * const hash = hashThisData('sha256', data, { salt: 'mySalt', iterations: 3 });
 */
export function hashThisData(
	algorithm: string,
	data: object | any[] | bigint | number | string | boolean,
	options?: {
		salt?: string;
		iterations?: number;
	}
): string;

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

/**
 * Node.js version in '0.0.0' format retrieved from process.versions.node.
 * Returns '0.0.0' if not present.
 *
 * @example
 * console.log(nodeVer); // e.g., '20.12.0'
 */
export const nodeVer: string;

/**
 * Node.js major version number. The first number in the version string.
 * For example, '20.1.6' returns 20.
 *
 * @example
 * if (nodeVerMajor >= 20) { /* use modern features *\/ }
 */
export const nodeVerMajor: number;

/**
 * Node.js minor version number. The second number in the version string.
 * For example, '20.31.6' returns 31.
 */
export const nodeVerMinor: number;

/**
 * Node.js major.minor version string (e.g., '20.12').
 */
export const nodeVerMajorMinor: string;

// ---------------------------------------------------------------------------
// Generic Response Modules
// ---------------------------------------------------------------------------

/**
 * Response object shape returned by generic response modules.
 */
export interface GenericResponseObject {
	/** HTTP status code */
	statusCode: number;
	/** Response headers including Content-Type */
	headers: Record<string, string>;
	/** Response body (format depends on the module) */
	body: any;
}

/**
 * Generic response module interface shared by all format-specific modules.
 */
export interface GenericResponseModule {
	/** MIME content type string (e.g., 'application/json') */
	contentType: string;
	/** Default headers object with Content-Type */
	headers: Record<string, string>;
	/** Pre-built response for HTTP 200 */
	response200: GenericResponseObject;
	/** Pre-built response for HTTP 400 */
	response400: GenericResponseObject;
	/** Pre-built response for HTTP 401 */
	response401: GenericResponseObject;
	/** Pre-built response for HTTP 403 */
	response403: GenericResponseObject;
	/** Pre-built response for HTTP 404 */
	response404: GenericResponseObject;
	/** Pre-built response for HTTP 405 */
	response405: GenericResponseObject;
	/** Pre-built response for HTTP 408 */
	response408: GenericResponseObject;
	/** Pre-built response for HTTP 418 */
	response418: GenericResponseObject;
	/** Pre-built response for HTTP 427 */
	response427: GenericResponseObject;
	/** Pre-built response for HTTP 500 */
	response500: GenericResponseObject;
	/**
	 * Get a response object by status code. Falls back to response500 for unknown codes.
	 *
	 * @param statusCode - HTTP status code
	 * @returns Response object for the given status code
	 */
	response(statusCode: number | string): GenericResponseObject;
}

/**
 * JSON generic response module interface.
 */
export interface JsonGenericResponseModule extends GenericResponseModule {
	/**
	 * Returns the data as-is or an empty object if no data is provided.
	 *
	 * @param data - Data to return
	 * @returns The data or an empty object
	 */
	json(data?: any): any;
}

/**
 * HTML generic response module interface.
 */
export interface HtmlGenericResponseModule extends GenericResponseModule {
	/**
	 * Wraps title and body content in a basic HTML document structure.
	 *
	 * @param title - HTML page title
	 * @param body - HTML body content
	 * @returns Complete HTML document string
	 */
	html(title: string, body: string): string;
}

/**
 * RSS generic response module interface.
 */
export interface RssGenericResponseModule extends GenericResponseModule {
	/**
	 * Wraps body content in an RSS XML document structure.
	 *
	 * @param body - RSS body content
	 * @returns Complete RSS XML string
	 */
	rss(body: string): string;
}

/**
 * XML generic response module interface.
 */
export interface XmlGenericResponseModule extends GenericResponseModule {
	/**
	 * Wraps body content in an XML document structure with declaration.
	 *
	 * @param body - XML body content
	 * @returns Complete XML string with declaration
	 */
	xml(body: string): string;
}

/**
 * Text generic response module interface.
 */
export interface TextGenericResponseModule extends GenericResponseModule {
	/**
	 * Returns the text as-is.
	 *
	 * @param text - Text content
	 * @returns The text string
	 */
	text(text: string): string;
}

/**
 * JSON format generic response module.
 * Provides pre-built response objects for common HTTP status codes
 * with JSON content type and body formatting.
 *
 * @example
 * const notFound = jsonGenericResponse.response(404);
 * // { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: { message: 'Not Found' } }
 */
export const jsonGenericResponse: JsonGenericResponseModule;

/**
 * HTML format generic response module.
 * Provides pre-built response objects for common HTTP status codes
 * with HTML content type and body formatting.
 *
 * @example
 * const notFound = htmlGenericResponse.response(404);
 * // { statusCode: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: '<html>...</html>' }
 */
export const htmlGenericResponse: HtmlGenericResponseModule;

/**
 * RSS format generic response module.
 * Provides pre-built response objects for common HTTP status codes
 * with RSS XML content type and body formatting.
 *
 * @example
 * const error = rssGenericResponse.response(500);
 * // { statusCode: 500, headers: { 'Content-Type': 'application/rss+xml' }, body: '<?xml ...>' }
 */
export const rssGenericResponse: RssGenericResponseModule;

/**
 * XML format generic response module.
 * Provides pre-built response objects for common HTTP status codes
 * with XML content type and body formatting.
 *
 * @example
 * const error = xmlGenericResponse.response(500);
 * // { statusCode: 500, headers: { 'Content-Type': 'application/xml' }, body: '<?xml ...>' }
 */
export const xmlGenericResponse: XmlGenericResponseModule;

/**
 * Plain text format generic response module.
 * Provides pre-built response objects for common HTTP status codes
 * with plain text content type and body formatting.
 *
 * @example
 * const notFound = textGenericResponse.response(404);
 * // { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not Found' }
 */
export const textGenericResponse: TextGenericResponseModule;



// ---------------------------------------------------------------------------
// Deprecated Aliases
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `AWS` instead. This alias will be removed in a future major version.
 */
export type Aws = AWS;

/**
 * @deprecated Use `AWSXRay` instead. This alias will be removed in a future major version.
 */
export type AwsXRay = typeof AWSXRay;

/**
 * @deprecated Use `ApiRequest` instead. This alias will be removed in a future major version.
 */
export type APIRequest = ApiRequest;

/**
 * @deprecated Use `AppConfig` instead. This alias will be removed in a future major version.
 */
export type _ConfigSuperClass = AppConfig;

/**
 * @deprecated Use `CachedSsmParameter` instead. This alias will be removed in a future major version.
 */
export type CachedSSMParameter = CachedSsmParameter;

// ---------------------------------------------------------------------------
// Shared Interfaces
// ---------------------------------------------------------------------------

/**
 * Connection configuration object used for endpoint requests.
 * Describes the target host, path, method, headers, parameters, and cache profiles.
 */
export interface ConnectionObject {
	/** HTTP method: GET or POST */
	method?: string;
	/** Full URI (overrides protocol, host, path, and parameters) e.g., https://example.com/api/v1/1004/?key=asdf */
	uri?: string;
	/** Protocol (e.g., 'https') */
	protocol?: string;
	/** Host/domain (e.g., 'example.com') */
	host?: string;
	/** Path of the request (e.g., '/api/v1/1004') */
	path?: string;
	/** Parameters for the query string as key/value pairs */
	parameters?: Record<string, string | number | boolean> | null;
	/** Headers for the request as key/value pairs */
	headers?: Record<string, string> | null;
	/** Request body (for POST requests) */
	body?: string | null;
	/** A note for logging purposes */
	note?: string;
	/** Request options (e.g., timeout) */
	options?: { timeout?: number } | null;
	/** Cache profiles for this connection */
	cache?: CacheProfileObject[];
}

/**
 * Cache profile configuration object.
 * Defines caching behavior for a connection including expiration, encryption, and key generation.
 */
export interface CacheProfileObject {
	/** The name of the cache profile */
	profile?: string;
	/** If true, the cache expiration will be overridden by the origin header expiration */
	overrideOriginHeaderExpiration?: boolean;
	/** The default expiration time in seconds */
	defaultExpirationInSeconds?: number;
	/** If true, the cache expiration will be on an interval */
	expirationIsOnInterval?: boolean;
	/** Headers to retain from the origin response */
	headersToRetain?: string[] | string;
	/** The host ID to use for the cache key */
	hostId?: string;
	/** The path ID to use for the cache key */
	pathId?: string;
	/** If true, the cache data will be encrypted */
	encrypt?: boolean;
	/** Default expiration extension in seconds when an error occurs */
	defaultExpirationExtensionOnErrorInSeconds?: number;
}
