const { sanitize } = require("./utils");
const util = require('util');

const _getNodeEnv = function() {
	return process.env?.NODE_ENV === "development" ? "development" : "production";
};

"use strict"

/**
 * A simple Debug and Logging class.
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

	constructor() {
	};

	/**
	 * Set the log level.
	 * Deprecated. Set Lambda Environment variable CACHE_DATA_LOG_LEVEL, LOG_LEVEL, or AWS_LAMBDA_LOG_LEVEL instead.
	 * @param {number} logLevel 0 - 5
	 * @param {*} expiration Deprecated - no effect
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
	 * 
	 * @returns {number} The current log level
	 */
	static getLogLevel() {

		if ( this.#logLevel < 0 || DebugAndLog.nodeEnvIsDevelopment() || DebugAndLog.nodeEnvHasChanged() ) {
			this.#logLevel = this.getDefaultLogLevel();
		}

		return this.#logLevel;

	}

	/**
	 * Alias for getEnvType()
	 */
	static getEnv() {
		return DebugAndLog.getEnvType();
	};

	/**
	 * Check process.env for an environment variable named
	 * env, deployEnvironment, environment, or stage. If they
	 * are not set it will return DebugAndLog.PROD which 
	 * is considered safe (most restrictive)
	 * Note: This is the application environment, not the NODE_ENV
	 * @returns {string} PROD|TEST|DEV - The current environment.
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
	 * 
	 * @returns {string} PROD|TEST|DEV|NONE based upon first environment variable from DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES found
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
	 * Is Environment Variable NODE_ENV set to "development"?
	 */
	static nodeEnvIsDevelopment() {
		return DebugAndLog.getNodeEnv() === "development";
	}

	/**
	 * Is Environment Variable NODE_ENV set to "production" or "" or undefined?
	 */
	static nodeEnvIsProduction() {
		return !this.nodeEnvIsDevelopment();
	}

	/**
	 * Get the current NODE_ENV (returns "production" if not set or if NODE_ENV is set to anything other than "development")
	 * Calls DebugAndLog.nodeEnvHasChanged() to log a warning if the value has changed since initialization. Should only change during testing.
	 * @returns {string} development|production
	 */
	static getNodeEnv() {
		DebugAndLog.nodeEnvHasChanged();
		return _getNodeEnv();
	}

	/**
	 * Checks to see if the current NODE_ENV environment variable has changed since DebugAndLog was initialized.
	 * The only time this should happen is while running tests. This should never happen in a production application.
	 * If these warnings are triggered as you application is running, something is modifying process.env.NODE_ENV during execution.
	 * @returns {boolean}
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
	 * 
	 * @returns {number} log level
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
	 * 
	 * @returns {boolean}
	 */
	static isNotProduction() {
		return ( !DebugAndLog.isProduction() );
	};

	/**
	 * 
	 * @returns {boolean}
	 */
	static isProduction() {
		return ( DebugAndLog.getEnv() === DebugAndLog.PROD );
	};

	/**
	 * 
	 * @returns {boolean}
	 */
	static isDevelopment() {
		return ( DebugAndLog.getEnv() === DebugAndLog.DEV );
	};

	/**
	 * 
	 * @returns {boolean}
	 */
	static isTest() {
		return ( DebugAndLog.getEnv() === DebugAndLog.TEST );
	};

	/**
	 * Write a log entry.
	 * The format used will be "[TAG] message"
	 * @param {string} tag This will appear first in the log in all caps between square brackets ex: [TAG]
	 * @param {string} message The message to be displayed. May also be a delimited log string
	 * @param {object|null} obj An object to include in the log entry
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
	 * Level 5 - Verbose Values and Calculations and Stack Traces
	 * @param {string} message 
	 * @param {object} obj 
	 */
	static async debug(message, obj = null) {
		return DebugAndLog.writeLog(DebugAndLog.DEBUG, message, obj);
	};

	/**
	 * Level 3 - Verbose timing and counts
	 * @param {string} message 
	 * @param {object} obj 
	 */
	static async diag(message, obj = null) {
		return DebugAndLog.writeLog(DebugAndLog.DIAG, message, obj);      
	};

	/**
	 * Level 2 - Short messages and status
	 * @param {string} message 
	 * @param {object} obj 
	 */
	static async msg(message, obj = null) {
		return DebugAndLog.writeLog(DebugAndLog.MSG, message, obj);
	};

	/**
	 * Level 2 - Short messages and status
	 * (same as DebugAndLog.msg() )
	 * @param {string} message 
	 * @param {object} obj 
	 */
	static async message(message, obj = null) {
		return DebugAndLog.msg(message, obj);
	};

	/**
	 * Level 1 - Short messages and status
	 * @param {string} message 
	 * @param {object} obj 
	 */
	static async info(message, obj = null) {
		return DebugAndLog.writeLog(DebugAndLog.INFO, message, obj);
	};

	/**
	 * Level 0 - Production worthy log entries that are not errors or warnings
	 * These should be formatted in a consistent manner and typically only
	 * one entry produced per invocation. (Usually produced at the end of a 
	 * script's execution)
	 * @param {string} message The message, either a text string or fields separated by | or another character you can use to parse your logs
	 * @param {string} tag Optional. The tag that appears at the start of the log. Default is LOG. In logs it will appear at the start within square brackets '[LOG] message' You can use this to filter when parsing log reports
	 * @param {object} obj 
	 */
	static async log(message, tag = DebugAndLog.LOG, obj = null) {
		return DebugAndLog.writeLog(tag, message, obj);
	};

	/**
	 * Level 0 - Warnings
	 * Errors are handled and execution continues.
	 * ClientRequest validation should be done first, and if we received an invalid
	 * request, then a warning, not an error, should be logged even though an 
	 * error is returned to the client (error is on client side, not here, 
	 * but we want to keep track of client errors). 
	 * Requests should be validated first before all other processing.
	 * @param {string} message 
	 * @param {object} obj 
	 */
	static async warn(message, obj = null) {
		DebugAndLog.writeLog(DebugAndLog.WARN, message, obj);
	};

	/**
	 * Level 0 - Warnings
	 * (same as DebugAndLog.warn() )
	 * @param {string} message 
	 * @param {object} obj 
	 */
	static async warning(message, obj = null) {
		DebugAndLog.warn(message, obj);
	};

	/**
	 * Level 0 - Errors
	 * Errors cannot be handled in a way that will allow continued execution.
	 * An error will be passed back to the client. If a client sent a bad
	 * request, send a warning instead.
	 * @param {string} message 
	 * @param {object} obj 
	 */
	static async error(message, obj = null) {
		DebugAndLog.writeLog(DebugAndLog.ERROR, message, obj);
	};

};

DebugAndLog.getLogLevel();

module.exports = DebugAndLog;