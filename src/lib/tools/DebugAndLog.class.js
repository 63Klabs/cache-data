const { sanitize } = require("./utils");
const util = require('util');

const _getNodeEnv = function() {
	return process.env?.NODE_ENV === "development" ? "development" : "production";
};

/**
 * A simple Debug and Logging class.
 */
class DebugAndLog {

	static #logLevel = -1;
	static #environment = null;
	static #initialNodeEnv = _getNodeEnv();

	// in priority order
	static ALLOWED_ENV_TYPE_VAR_NAMES = ["DEPLOY_ENVIRONMENT", "DEPLOY_ENV", "ENV_TYPE", "deploy_environment",  "ENV", "env", "deployEnvironment", "ENVIRONMENT", "environment"];
	static ALLOWED_LOG_VAR_NAMES = ["CACHE_DATA_LOG_LEVEL", "LOG_LEVEL", "log_level", "detailedLogs", "logLevel", "AWS_LAMBDA_LOG_LEVEL"]

	static PROD = "PROD";
	static TEST = "TEST";
	static DEV = "DEV";

	static ENVIRONMENTS = ["PROD", "TEST", "DEV"];//[DebugAndLog.PROD, DebugAndLog.TEST, DebugAndLog.DEV];

	static ERROR = "ERROR"; // 0
	static WARN = "WARN"; // 0
	static LOG = "LOG"; // 0
	static MSG = "MSG"; // 1
	static DIAG = "DIAG"; // 3
	static DEBUG = "DEBUG"; // 5

	constructor() {
	};

	/**
	 * Set the log level.
	 * Deprecated. Set Lambda Environment variable LOG_LEVEL instead.
	 * @param {number} logLevel 0 - 5
	 * @param {*} expiration YYYY-MM-DD HH:MM:SS format. Only set to specified level until this date
	 */
	static setLogLevel(logLevel = -1, expiration = -1) {
		DebugAndLog.warn("DebugAndLog.setLogLevel() no longer has any effect use LOG_LEVEL environment variable instead.");
		DebugAndLog.debug(`DebugAndLog.setLogLevel(${logLevel}, ${expiration}) no longer has any effect.`)
	};

	/**
	 * 
	 * @returns {number} The current log level
	 */
	static getLogLevel() {

		if ( this.#logLevel < 0 || DebugAndLog.nodeEnvIsDevelopment() || DebugAndLog.nodeEnvHasChanged() ) {

			if (DebugAndLog.isProduction()) {
				this.#logLevel = 0;
			} else {
				this.#logLevel = this.getDefaultLogLevel();
			}
		}

		return this.#logLevel;

	}

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
	 * Alias for getEnvType()
	 */
	static getEnv() {
		return DebugAndLog.getEnvType();
	};

	/**
	 * 
	 * @returns {string} PROD|TEST|DEV|NONE based upon first environment variable from DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES found
	 */
	static getEnvTypeFromEnvVar() {
		let environmentType = "NONE";
		const possibleVars = DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES; // - this is the application env, not the NODE_ENV

		for (let i in possibleVars) {
			let e = possibleVars[i];
			if (e in process.env && process.env[e] !== "" && process.env[e] !== null) {
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
			DebugAndLog.warn("DebugAndLog: NODE_ENV changed from initial value of '"+this.#initialNodeEnv+"' to '"+_getNodeEnv()+"' during execution. This is not recommended.");
		}
		return hasChanged;
	}

	/**
	 * 
	 * @returns {number} log level
	 */
	static getDefaultLogLevel() {
		let possibleVars = DebugAndLog.ALLOWED_LOG_VAR_NAMES; // in priority order and we want to evaluate AWS_LAMBDA_LOG_LEVEL as upper
		let logLevel = 0;

		if ( DebugAndLog.isNotProduction() ) { // PROD is always at logLevel 0. Always.
			if ( "env" in process ) {
				for (let i in possibleVars) {
					let lev = possibleVars[i];
					if (lev in process.env && process.env[lev] !== "" && process.env[lev] !== null) {
						if (lev === "AWS_LAMBDA_LOG_LEVEL") {

							switch (process.env.AWS_LAMBDA_LOG_LEVEL) {
								case "DEBUG":
									logLevel = 5;
									break;
								case "INFO":
									logLevel = 3;
									break;
								default: // logLevel is already 0
									break;
							}

							break; // break out of the for loop
						} else if (!Number.isNaN(process.env[lev])) {
							logLevel = Number(process.env[lev]);
							break; // break out of the for loop
						}
					}
				};
			}

		}

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
		
		// let lvl = (this.#logLevel > -1) ? DebugAndLog.getLogLevel() : DebugAndLog.MSG; 
		let lvl = (this.#logLevel > -1) ? this.#logLevel > -1 : DebugAndLog.MSG; 

		tag = tag.toUpperCase();

		switch (tag) {
			case DebugAndLog.ERROR:
				error(tag, message, obj);
				break;
			case DebugAndLog.WARN:
				warn(tag, message, obj);
				break;
			case DebugAndLog.MSG:
				if (lvl >= 1) { info(tag, message, obj); } // 1
				break; 
			case DebugAndLog.DIAG:
				if (lvl >= 3) { debug(tag, message, obj); } //3
				break; 
			case DebugAndLog.DEBUG:
				if (lvl >= 5) { debug(tag, message, obj); } //5
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
	 * Level 1 - Short messages and status
	 * @param {string} message 
	 * @param {object} obj 
	 */
	static async msg(message, obj = null) {
		return DebugAndLog.writeLog(DebugAndLog.MSG, message, obj);
	};

	/**
	 * Level 1 - Short messages and status
	 * (same as DebugAndLog.msg() )
	 * @param {string} message 
	 * @param {object} obj 
	 */
	static async message(message, obj = null) {
		return DebugAndLog.msg(message, obj);
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