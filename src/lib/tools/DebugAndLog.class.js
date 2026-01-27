const { sanitize } = require("./utils");
const util = require('util');

const _getNodeEnv = function() {
	return process.env?.NODE_ENV === "development" ? "development" : "production";
};

"use strict"

/**
 * A comprehensive debug and logging class for managing application logging with environment-aware log levels.
 * Provides multiple logging levels (ERROR, WARN, INFO, MSG, DIAG, DEBUG) and automatic environment detection.
 * Supports both production and development environments with appropriate log level restrictions.
 * 
 * @class DebugAndLog
 * @example
 * // Basic logging
 * await DebugAndLog.info('Processing request');
 * await DebugAndLog.error('Failed to connect', { error: err });
 * 
 * @example
 * // Check environment
 * if (DebugAndLog.isDevelopment()) {
 *   await DebugAndLog.debug('Detailed debug info', { data });
 * }
 * 
 * @example
 * // Configure via environment variables
 * // Set CACHE_DATA_LOG_LEVEL=5 for DEBUG level
 * // Set CACHE_DATA_ENV=DEV for development environment
 */
class DebugAndLog {

	static #logLevel = -1;
	static #environment = null;
	static #initialNodeEnv = _getNodeEnv();
	static #nodeEnvChangeWarnCount = 0;

	// in priority order
	static ALLOWED_ENV_TYPE_VAR_NAMES = ["CACHE_DATA_ENV", "DEPLOY_ENVIRONMENT", "DEPLOY_ENV", "ENV_TYPE", "deploy_environment",  "ENV", "env", "deployEnvironment", "ENVIRONMENT", "environment"];
	static ALLOWED_LOG_VAR_NAMES = ["CACHE_DATA_LOG_LEVEL", "LOG_LEVEL", "log_level", "detailedLogs", "logLevel", "AWS_LAMBDA_LOG_LEVEL"]

	static PROD = "PROD";
	static TEST = "TEST";
	static DEV = "DEV";

	static ENVIRONMENTS = ["PROD", "TEST", "DEV"];//[DebugAndLog.PROD, DebugAndLog.TEST, DebugAndLog.DEV];

	static LOG = "LOG";
	static ERROR = "ERROR";
	static WARN = "WARN";
	static INFO = "INFO";
	static MSG = "MSG";
	static DIAG = "DIAG";
	static DEBUG = "DEBUG";

	static ALLOWED_LOG_LEVEL_STRINGS = ["ERROR", "WARN", "INFO", "MSG", "DIAG", "DEBUG"];

	static LOG_LEVEL_NUM = 0;
	static ERROR_LEVEL_NUM = 0;
	static WARN_LEVEL_NUM = 1;
	static INFO_LEVEL_NUM = 2;
	static MSG_LEVEL_NUM = 3;
	static DIAG_LEVEL_NUM = 4;
	static DEBUG_LEVEL_NUM = 5;

	static PROD_DEFAULT_LEVEL_NUM = 2;

	/**
	 * Creates a new DebugAndLog instance.
	 * Note: This class is typically used via static methods and does not require instantiation.
	 * 
	 * @example
	 * // Use static methods directly (recommended)
	 * await DebugAndLog.info('Application started');
	 */
	constructor() {
	};

	/**
	 * Sets the log level (DEPRECATED).
	 * This method is deprecated. Use environment variables instead:
	 * - CACHE_DATA_LOG_LEVEL
	 * - LOG_LEVEL
	 * - AWS_LAMBDA_LOG_LEVEL
	 * 
	 * @deprecated Use environment variables CACHE_DATA_LOG_LEVEL, LOG_LEVEL, or AWS_LAMBDA_LOG_LEVEL instead
	 * @param {number} [logLevel=-1] - Log level from 0-5 (0=ERROR, 1=WARN, 2=INFO, 3=MSG, 4=DIAG, 5=DEBUG)
	 * @param {*} [expiration=-1] - Deprecated parameter with no effect
	 * @returns {number} The set log level
	 * @example
	 * // Don't use this - it's deprecated
	 * // Instead, set environment variable:
	 * // process.env.CACHE_DATA_LOG_LEVEL = '5';
	 */
	static setLogLevel(logLevel = -1, expiration = -1) {
		DebugAndLog.warn(`DebugAndLog.setLogLevel(${logLevel}, ${expiration}) is deprecated. Use CACHE_DATA_LOG_LEVEL, LOG_LEVEL, or AWS_LAMBDA_LOG_LEVEL environment variable instead.`);
		
		if (DebugAndLog.isProduction()) {
			if (Number.isFinite(Number(logLevel)) && Number(logLevel) <= DebugAndLog.PROD_DEFAULT_LEVEL_NUM) {
				this.#logLevel = Number(logLevel);
			} else {
				this.#logLevel = DebugAndLog.PROD_DEFAULT_LEVEL_NUM;
			}
		} else if (Number.isFinite(Number(logLevel))) {
			this.#logLevel = Number(logLevel);
		}

		return this.#logLevel;
	};

	/**
	 * Gets the current log level.
	 * If not explicitly set, returns the default log level based on environment variables.
	 * 
	 * @returns {number} The current log level (0-5): 0=ERROR, 1=WARN, 2=INFO, 3=MSG, 4=DIAG, 5=DEBUG
	 * @example
	 * const level = DebugAndLog.getLogLevel();
	 * console.log(`Current log level: ${level}`);
	 */
	static getLogLevel() {

		if ( this.#logLevel < 0 || DebugAndLog.nodeEnvIsDevelopment() || DebugAndLog.nodeEnvHasChanged() ) {
			this.#logLevel = this.getDefaultLogLevel();
		}

		return this.#logLevel;

	}

	/**
	 * Gets the application environment type (alias for getEnvType()).
	 * 
	 * @returns {string} Environment type: 'PROD', 'TEST', or 'DEV'
	 * @example
	 * const env = DebugAndLog.getEnv();
	 * console.log(`Running in ${env} environment`);
	 */
	static getEnv() {
		return DebugAndLog.getEnvType();
	};

	/**
	 * Gets the environment type from environment variables.
	 * Checks process.env for environment variables in priority order from ALLOWED_ENV_TYPE_VAR_NAMES.
	 * Returns 'PROD' (most restrictive) if no valid environment variable is found.
	 * Note: This is the application environment, not NODE_ENV.
	 * 
	 * @returns {string} Environment type: 'PROD', 'TEST', or 'DEV'
	 * @example
	 * // Set environment via CACHE_DATA_ENV=DEV
	 * const envType = DebugAndLog.getEnvType();
	 * if (envType === 'DEV') {
	 *   // Development-specific logic
	 * }
	 */
	static getEnvType() {
		// We can switch if NODE_ENV is set to "development"
		if ( this.#environment === null || DebugAndLog.nodeEnvIsDevelopment() || DebugAndLog.nodeEnvHasChanged) {
			const  nodeEnvType = (DebugAndLog.nodeEnvIsDevelopment() ? DebugAndLog.DEV : DebugAndLog.PROD); // if env or deployEnvironment not set, fail to safe
			const envType = DebugAndLog.getEnvTypeFromEnvVar();

			this.#environment = (DebugAndLog.ENVIRONMENTS.includes(envType) ? envType : nodeEnvType);
		}

		return this.#environment;
	}
	/**
	 * Gets the environment type from the first matching environment variable.
	 * Searches through ALLOWED_ENV_TYPE_VAR_NAMES in priority order.
	 * 
	 * @returns {string} Environment type: 'PROD', 'TEST', 'DEV', or 'NONE' if not found
	 * @example
	 * const envType = DebugAndLog.getEnvTypeFromEnvVar();
	 */
	static getEnvTypeFromEnvVar() {
		let environmentType = "none";
		const possibleVars = DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES; // - this is the application env, not the NODE_ENV

		for (let i in possibleVars) {
			let e = possibleVars[i];
			if (e in process.env && process.env[e] !== "" && process.env[e] !== null && DebugAndLog.ENVIRONMENTS.includes(process.env[e].toUpperCase())) {
				environmentType = process.env[e].toUpperCase();
				break; // break out of the for loop
			}
		};

		return environmentType;
	}

	/**
	 * Checks if the NODE_ENV environment variable is set to "development".
	 * 
	 * @returns {boolean} True if NODE_ENV is "development", false otherwise
	 * @example
	 * if (DebugAndLog.nodeEnvIsDevelopment()) {
	 *   console.log('Running in development mode');
	 * }
	 */
	static nodeEnvIsDevelopment() {
		return DebugAndLog.getNodeEnv() === "development";
	}

	/**
	 * Checks if the NODE_ENV environment variable is set to "production" or is empty/undefined.
	 * 
	 * @returns {boolean} True if NODE_ENV is "production" or not set, false if "development"
	 * @example
	 * if (DebugAndLog.nodeEnvIsProduction()) {
	 *   // Production-specific logic
	 * }
	 */
	static nodeEnvIsProduction() {
		return !this.nodeEnvIsDevelopment();
	}

	/**
	 * Gets the current NODE_ENV value.
	 * Returns "development" if NODE_ENV is set to "development", otherwise returns "production".
	 * Calls nodeEnvHasChanged() to log a warning if the value has changed since initialization.
	 * NODE_ENV should only change during testing.
	 * 
	 * @returns {string} "development" or "production"
	 * @example
	 * const nodeEnv = DebugAndLog.getNodeEnv();
	 * console.log(`NODE_ENV: ${nodeEnv}`);
	 */
	static getNodeEnv() {
		DebugAndLog.nodeEnvHasChanged();
		return _getNodeEnv();
	}

	/**
	 * Checks if the NODE_ENV environment variable has changed since DebugAndLog was initialized.
	 * This should only happen during testing. In production applications, NODE_ENV should never change during execution.
	 * Logs a warning if NODE_ENV has changed (first occurrence and every 100th occurrence).
	 * 
	 * @returns {boolean} True if NODE_ENV has changed, false otherwise
	 * @example
	 * if (DebugAndLog.nodeEnvHasChanged()) {
	 *   console.warn('NODE_ENV changed during execution');
	 * }
	 */
	static nodeEnvHasChanged() {
		const hasChanged = _getNodeEnv() !== this.#initialNodeEnv;
		if (hasChanged && this.#logLevel > -1) {
			this.#nodeEnvChangeWarnCount++;
			// if this.#nodeEnvChangeWarnCount == 1 or is divisible by 25
			if (this.#nodeEnvChangeWarnCount === 1 || this.#nodeEnvChangeWarnCount % 100 === 0) {
				DebugAndLog.warn(`DebugAndLog: NODE_ENV changed from initial value of '${this.#initialNodeEnv}' to '${_getNodeEnv()}' during execution. This is not recommended outside of tests.`);
			}
		} else {
			this.#nodeEnvChangeWarnCount = 0;
		}

		return hasChanged;
	}

	/**
	 * Gets the default log level based on environment variables.
	 * Checks ALLOWED_LOG_VAR_NAMES in priority order for log level configuration.
	 * In production, log level is capped at PROD_DEFAULT_LEVEL_NUM (2).
	 * 
	 * @returns {number} Default log level (0-5)
	 * @example
	 * // Set via CACHE_DATA_LOG_LEVEL=5 or LOG_LEVEL=DEBUG
	 * const defaultLevel = DebugAndLog.getDefaultLogLevel();
	 */
	static getDefaultLogLevel() {
		let possibleVars = DebugAndLog.ALLOWED_LOG_VAR_NAMES; // in priority order and we want to evaluate AWS_LAMBDA_LOG_LEVEL as upper
		let logLevel = DebugAndLog.PROD_DEFAULT_LEVEL_NUM;
		let found = false;

		for (let i in possibleVars) {
			let lev = possibleVars[i];
			if (lev in process.env && process.env[lev] !== "" && process.env[lev] !== null) {
				if (lev === "AWS_LAMBDA_LOG_LEVEL") {

					switch (process.env.AWS_LAMBDA_LOG_LEVEL) {
						case "DEBUG":
							logLevel = DebugAndLog.DEBUG_LEVEL_NUM;
							found = true;
							break;
						case "INFO":
							logLevel = DebugAndLog.INFO_LEVEL_NUM;
							found = true;
							break;
						case "WARN":
							logLevel = DebugAndLog.WARN_LEVEL_NUM;
							found = true;
							break;
						case "ERROR":
							logLevel = DebugAndLog.ERROR_LEVEL_NUM;
							found = true;
							break;
						case "CRITICAL":
							logLevel = DebugAndLog.ERROR_LEVEL_NUM; // This is lowest we go and will let Lambda filter out
							found = true;
							break;
						case "SILENT":
							logLevel = DebugAndLog.ERROR_LEVEL_NUM; // This is lowest we go and will let Lambda filter out
							found = true;
							break;
						default: // invalid
							break;
					}
				} else if (typeof process.env[lev] === "string" && DebugAndLog.ALLOWED_LOG_LEVEL_STRINGS.includes(process.env[lev].toUpperCase())) {
					logLevel = DebugAndLog[process.env[lev].toUpperCase().concat("_LEVEL_NUM")];
					found = true;
				} else if (Number.isFinite(Number(process.env[lev]))) {
					logLevel = Number(process.env[lev]);
					found = true;
				}

				if (found) {
					if (DebugAndLog.isProduction()) {
						if (logLevel > DebugAndLog.PROD_DEFAULT_LEVEL_NUM) {
							DebugAndLog.warn(`DebugAndLog: ${lev} set to ${logLevel} in production environment. Only 0-2 is allowed in production. Setting to ${DebugAndLog.PROD_DEFAULT_LEVEL_NUM}`);
							logLevel = DebugAndLog.PROD_DEFAULT_LEVEL_NUM;
						}
					}
					break; // break out of the for loop
				}
			}
		};

		return logLevel;
	};

	/**
	 * Checks if the application is NOT running in production environment.
	 * 
	 * @returns {boolean} True if not in production, false if in production
	 * @example
	 * if (DebugAndLog.isNotProduction()) {
	 *   await DebugAndLog.debug('Debug info only in non-prod');
	 * }
	 */
	static isNotProduction() {
		return ( !DebugAndLog.isProduction() );
	};

	/**
	 * Checks if the application is running in production environment.
	 * 
	 * @returns {boolean} True if in production, false otherwise
	 * @example
	 * if (DebugAndLog.isProduction()) {
	 *   // Restrict logging in production
	 * }
	 */
	static isProduction() {
		return ( DebugAndLog.getEnv() === DebugAndLog.PROD );
	};

	/**
	 * Checks if the application is running in development environment.
	 * 
	 * @returns {boolean} True if in development, false otherwise
	 * @example
	 * if (DebugAndLog.isDevelopment()) {
	 *   await DebugAndLog.debug('Development debug info', { data });
	 * }
	 */
	static isDevelopment() {
		return ( DebugAndLog.getEnv() === DebugAndLog.DEV );
	};

	/**
	 * Checks if the application is running in test environment.
	 * 
	 * @returns {boolean} True if in test environment, false otherwise
	 * @example
	 * if (DebugAndLog.isTest()) {
	 *   // Test-specific logic
	 * }
	 */
	static isTest() {
		return ( DebugAndLog.getEnv() === DebugAndLog.TEST );
	};

	/**
	 * Writes a log entry with the specified tag, message, and optional object.
	 * The format used will be "[TAG] message" or "[TAG] message | object".
	 * Log level determines whether the entry is actually written to console.
	 * 
	 * @param {string} tag - Tag that appears first in the log in all caps between square brackets (e.g., [ERROR])
	 * @param {string} message - The message to be displayed
	 * @param {Object|null} [obj=null] - Optional object to include in the log entry
	 * @returns {Promise<boolean>} True when log is written
	 * @example
	 * await DebugAndLog.writeLog('INFO', 'User logged in', { userId: 123 });
	 * // Output: [INFO] User logged in | { userId: 123 }
	 * 
	 * @example
	 * await DebugAndLog.writeLog('ERROR', 'Database connection failed');
	 * // Output: [ERROR] Database connection failed
	 */
	static async writeLog(tag, message, obj = null) {

		const logLevels = {
			error: console.error,
			warn: console.warn,
			log: console.log,
			info: console.info,
			debug: console.debug
		};

		const DEFAULT_LEVEL = 'info';
		const FORMAT_WITH_OBJ = '[%s] %s | %s';
		const FORMAT_WITHOUT_OBJ = '[%s] %s';

		const baseLog = function(level, tag, message, obj = null) {
			// Early return for invalid input
			if (typeof level !== 'string') {
				throw new TypeError('Log level must be a string');
			}
		
			// Use logical OR for faster undefined/null checks
			const safeTag = String(tag || '');
			const safeMessage = String(message || '');
			
			// Direct property lookup is faster than hasOwnProperty
			const logFn = logLevels[level] || logLevels[DEFAULT_LEVEL];
			
			try {
				// Single util.format call with conditional arguments
				if (obj !== null) {
					logFn(
						util.format(
							FORMAT_WITH_OBJ,
							safeTag,
							safeMessage,
							util.inspect(sanitize(obj), { depth: null })
						)
					);
				} else {
					logFn(
						util.format(
							FORMAT_WITHOUT_OBJ,
							safeTag,
							safeMessage
						)
					);
				}
			} catch (error) {
				console.error('Logging failed:', error);
			}
		};
		
		// Create individual logging functions using the base function
		const error = (tag, message, obj) => baseLog('error', tag, message, obj);
		const warn = (tag, message, obj) => baseLog('warn', tag, message, obj);
		const log = (tag, message, obj) => baseLog('log', tag, message, obj);
		const info = (tag, message, obj) => baseLog('info', tag, message, obj);
		const debug = (tag, message, obj) => baseLog('debug', tag, message, obj);
		
		// let lvl = (this.#logLevel > -1) ? DebugAndLog.getLogLevel() : DebugAndLog.MSG_LEVEL_NUM; 
		let lvl = (this.#logLevel > -1) ? this.#logLevel : DebugAndLog.INFO_LEVEL_NUM; 

		tag = tag.toUpperCase();

		switch (tag) {
			case DebugAndLog.ERROR:
				error(tag, message, obj);
				break;
			case DebugAndLog.WARN:
				if (lvl >= DebugAndLog.WARN_LEVEL_NUM) { warn(tag, message, obj); }
				break;
			case DebugAndLog.INFO:
				if (lvl >= DebugAndLog.INFO_LEVEL_NUM) { info(tag, message, obj); }
				break; 
			case DebugAndLog.MSG:
				if (lvl >= DebugAndLog.MSG_LEVEL_NUM) { info(tag, message, obj); }
				break; 
			case DebugAndLog.DIAG:
				if (lvl >= DebugAndLog.DIAG_LEVEL_NUM) { debug(tag, message, obj); }
				break; 
			case DebugAndLog.DEBUG:
				if (lvl >= DebugAndLog.DEBUG_LEVEL_NUM) { debug(tag, message, obj); }
				break; 
			default: // log
				log(tag, message, obj);
				break;
		}

		return true;
	};

	/**
	 * Logs a debug message at level 5 (DEBUG).
	 * Used for verbose values, calculations, and stack traces.
	 * Only logged when log level is 5 or higher.
	 * 
	 * @param {string} message - The debug message
	 * @param {Object} [obj=null] - Optional object with additional debug information
	 * @returns {Promise<boolean>} True when log is written
	 * @example
	 * await DebugAndLog.debug('Variable state', { x: 10, y: 20, result: 30 });
	 * 
	 * @example
	 * await DebugAndLog.debug('Stack trace', { stack: new Error().stack });
	 */
	static async debug(message, obj = null) {
		return DebugAndLog.writeLog(DebugAndLog.DEBUG, message, obj);
	};

	/**
	 * Logs a diagnostic message at level 4 (DIAG).
	 * Used for verbose timing and counts.
	 * Only logged when log level is 4 or higher.
	 * 
	 * @param {string} message - The diagnostic message
	 * @param {Object} [obj=null] - Optional object with diagnostic data
	 * @returns {Promise<boolean>} True when log is written
	 * @example
	 * await DebugAndLog.diag('Query execution time: 45ms', { queryTime: 45, rowCount: 100 });
	 */
	static async diag(message, obj = null) {
		return DebugAndLog.writeLog(DebugAndLog.DIAG, message, obj);      
	};

	/**
	 * Logs a message at level 3 (MSG).
	 * Used for short messages and status updates.
	 * Only logged when log level is 3 or higher.
	 * 
	 * @param {string} message - The message
	 * @param {Object} [obj=null] - Optional object with additional information
	 * @returns {Promise<boolean>} True when log is written
	 * @example
	 * await DebugAndLog.msg('Processing batch 5 of 10');
	 */
	static async msg(message, obj = null) {
		return DebugAndLog.writeLog(DebugAndLog.MSG, message, obj);
	};

	/**
	 * Logs a message at level 3 (MSG).
	 * Alias for msg(). Used for short messages and status updates.
	 * 
	 * @param {string} message - The message
	 * @param {Object} [obj=null] - Optional object with additional information
	 * @returns {Promise<boolean>} True when log is written
	 * @example
	 * await DebugAndLog.message('Request processed successfully');
	 */
	static async message(message, obj = null) {
		return DebugAndLog.msg(message, obj);
	};

	/**
	 * Logs an informational message at level 2 (INFO).
	 * Used for short messages and status updates.
	 * Only logged when log level is 2 or higher.
	 * 
	 * @param {string} message - The informational message
	 * @param {Object} [obj=null] - Optional object with additional information
	 * @returns {Promise<boolean>} True when log is written
	 * @example
	 * await DebugAndLog.info('User authentication successful', { userId: 'user123' });
	 */
	static async info(message, obj = null) {
		return DebugAndLog.writeLog(DebugAndLog.INFO, message, obj);
	};

	/**
	 * Logs a production-worthy log entry at level 0 (LOG).
	 * These should be formatted consistently and typically only one entry per invocation.
	 * Usually produced at the end of a script's execution.
	 * Always logged regardless of log level.
	 * 
	 * @param {string} message - The message, either text or fields separated by | or another delimiter for log parsing
	 * @param {string} [tag='LOG'] - Optional tag that appears at the start within square brackets (e.g., [LOG])
	 * @param {Object} [obj=null] - Optional object with additional data
	 * @returns {Promise<boolean>} True when log is written
	 * @example
	 * await DebugAndLog.log('Request completed | duration: 150ms | status: 200');
	 * 
	 * @example
	 * await DebugAndLog.log('Batch processed', 'BATCH', { count: 100, errors: 0 });
	 */
	static async log(message, tag = DebugAndLog.LOG, obj = null) {
		return DebugAndLog.writeLog(tag, message, obj);
	};

	/**
	 * Logs a warning message at level 1 (WARN).
	 * Used when errors are handled and execution continues.
	 * For client validation errors, use warn() rather than error() since the error is on the client side.
	 * Always logged regardless of log level (level 0).
	 * 
	 * @param {string} message - The warning message
	 * @param {Object} [obj=null] - Optional object with warning details
	 * @returns {Promise<void>}
	 * @example
	 * await DebugAndLog.warn('Invalid request parameter', { param: 'userId', value: null });
	 * 
	 * @example
	 * await DebugAndLog.warn('Deprecated API usage detected');
	 */
	static async warn(message, obj = null) {
		DebugAndLog.writeLog(DebugAndLog.WARN, message, obj);
	};

	/**
	 * Logs a warning message at level 1 (WARN).
	 * Alias for warn(). Used when errors are handled and execution continues.
	 * 
	 * @param {string} message - The warning message
	 * @param {Object} [obj=null] - Optional object with warning details
	 * @returns {Promise<void>}
	 * @example
	 * await DebugAndLog.warning('Cache miss, fetching from database');
	 */
	static async warning(message, obj = null) {
		DebugAndLog.warn(message, obj);
	};

	/**
	 * Logs an error message at level 0 (ERROR).
	 * Used when errors cannot be handled and execution cannot continue normally.
	 * An error will be passed back to the client. For client-side errors (bad requests), use warn() instead.
	 * Always logged regardless of log level.
	 * 
	 * @param {string} message - The error message
	 * @param {Object} [obj=null] - Optional object with error details
	 * @returns {Promise<void>}
	 * @example
	 * await DebugAndLog.error('Database connection failed', { error: err.message, code: err.code });
	 * 
	 * @example
	 * await DebugAndLog.error('Critical system failure');
	 */
	static async error(message, obj = null) {
		DebugAndLog.writeLog(DebugAndLog.ERROR, message, obj);
	};

};

DebugAndLog.getLogLevel();

module.exports = DebugAndLog;