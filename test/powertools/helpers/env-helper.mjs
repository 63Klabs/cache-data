/**
 * Test helper for environment variable save/restore during Powertools tests.
 * 
 * Provides utilities to safely modify environment variables during tests
 * and restore them to their original state afterward, preventing test pollution.
 * 
 * WARNING: This module is for testing only and should NEVER be used in production code.
 * 
 * @private
 * @module test/powertools/helpers/env-helper
 */

/**
 * List of all Powertools-related environment variables used by the package.
 * 
 * @type {Array<string>}
 */
export const POWERTOOLS_ENV_VARS = [
	"CACHE_DATA_POWERTOOLS",
	"CACHE_DATA_POWERTOOLS_TRACER",
	"CACHE_DATA_POWERTOOLS_LOGGER",
	"CACHE_DATA_POWERTOOLS_METRICS",
	"POWERTOOLS_SERVICE_NAME",
	"POWERTOOLS_METRICS_NAMESPACE",
	"CacheData_AWSXRayOn",
	"CACHE_DATA_AWS_X_RAY_ON",
	"_X_AMZN_TRACE_ID"
];

/**
 * Save the current state of all Powertools-related environment variables.
 * Returns a snapshot that can be passed to `restoreEnv()` to restore the original state.
 * 
 * @param {Array<string>} [varNames=POWERTOOLS_ENV_VARS] - Variable names to save
 * @returns {Map<string, string|undefined>} Snapshot of environment variable values
 * @example
 * const snapshot = saveEnv();
 * // ... modify env vars during test ...
 * restoreEnv(snapshot);
 */
export function saveEnv(varNames = POWERTOOLS_ENV_VARS) {
	const snapshot = new Map();
	for (const name of varNames) {
		snapshot.set(name, process.env[name]);
	}
	return snapshot;
}

/**
 * Restore environment variables to a previously saved state.
 * Variables that were undefined in the snapshot are deleted from process.env.
 * Variables that had values are restored to those values.
 * 
 * @param {Map<string, string|undefined>} snapshot - Snapshot from saveEnv()
 * @example
 * const snapshot = saveEnv();
 * process.env.CACHE_DATA_POWERTOOLS = "true";
 * // ... run test ...
 * restoreEnv(snapshot); // CACHE_DATA_POWERTOOLS restored to original value
 */
export function restoreEnv(snapshot) {
	for (const [name, value] of snapshot) {
		if (value === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = value;
		}
	}
}

/**
 * Clear all Powertools-related environment variables.
 * Useful for starting tests with a clean slate.
 * 
 * @param {Array<string>} [varNames=POWERTOOLS_ENV_VARS] - Variable names to clear
 * @example
 * clearPowertoolsEnv();
 * // All CACHE_DATA_POWERTOOLS* and related vars are now unset
 */
export function clearPowertoolsEnv(varNames = POWERTOOLS_ENV_VARS) {
	for (const name of varNames) {
		delete process.env[name];
	}
}

/**
 * Set multiple environment variables at once from an object.
 * Keys with `undefined` or `null` values will delete the variable.
 * 
 * @param {Object<string, string|null|undefined>} vars - Object mapping variable names to values
 * @example
 * setEnvVars({
 *   CACHE_DATA_POWERTOOLS: "true",
 *   CACHE_DATA_POWERTOOLS_TRACER: "false",
 *   CACHE_DATA_POWERTOOLS_LOGGER: undefined // deletes this var
 * });
 */
export function setEnvVars(vars) {
	for (const [name, value] of Object.entries(vars)) {
		if (value === undefined || value === null) {
			delete process.env[name];
		} else {
			process.env[name] = value;
		}
	}
}

/**
 * Create a scoped environment context that automatically saves and restores
 * environment variables. Use with beforeEach/afterEach or as a wrapper.
 * 
 * @returns {{setup: Function, teardown: Function, set: Function, clear: Function}} Environment context manager
 * @example
 * // Usage with Jest beforeEach/afterEach
 * const envContext = createEnvContext();
 * 
 * beforeEach(() => {
 *   envContext.setup();
 * });
 * 
 * afterEach(() => {
 *   envContext.teardown();
 * });
 * 
 * it('should handle disabled powertools', () => {
 *   envContext.set({ CACHE_DATA_POWERTOOLS: "false" });
 *   // ... test logic ...
 * });
 */
export function createEnvContext() {
	let snapshot = null;

	return {
		/**
		 * Save current environment state and clear Powertools variables.
		 * Call in beforeEach().
		 */
		setup() {
			snapshot = saveEnv();
			clearPowertoolsEnv();
		},

		/**
		 * Restore environment to saved state.
		 * Call in afterEach().
		 */
		teardown() {
			if (snapshot) {
				restoreEnv(snapshot);
				snapshot = null;
			}
		},

		/**
		 * Set environment variables within the current context.
		 * 
		 * @param {Object<string, string|null|undefined>} vars - Variables to set
		 */
		set(vars) {
			setEnvVars(vars);
		},

		/**
		 * Clear all Powertools environment variables within the current context.
		 */
		clear() {
			clearPowertoolsEnv();
		}
	};
}

/**
 * Run a function with specific environment variables set, then restore.
 * Useful for one-off tests that need specific env configuration.
 * 
 * @param {Object<string, string|null|undefined>} vars - Variables to set during execution
 * @param {Function} fn - Function to execute with the modified environment
 * @returns {*} Return value of fn
 * @example
 * const result = withEnv(
 *   { CACHE_DATA_POWERTOOLS: "true", CACHE_DATA_POWERTOOLS_TRACER: "false" },
 *   () => {
 *     return parseEnvFlag(process.env.CACHE_DATA_POWERTOOLS);
 *   }
 * );
 * expect(result).toBe(true);
 */
export function withEnv(vars, fn) {
	const snapshot = saveEnv([...POWERTOOLS_ENV_VARS, ...Object.keys(vars)]);
	try {
		setEnvVars(vars);
		return fn();
	} finally {
		restoreEnv(snapshot);
	}
}

/**
 * Async version of withEnv for async test functions.
 * 
 * @param {Object<string, string|null|undefined>} vars - Variables to set during execution
 * @param {Function} fn - Async function to execute with the modified environment
 * @returns {Promise<*>} Return value of fn
 * @example
 * const result = await withEnvAsync(
 *   { CACHE_DATA_POWERTOOLS: "true" },
 *   async () => {
 *     return await initPowertools();
 *   }
 * );
 */
export async function withEnvAsync(vars, fn) {
	const snapshot = saveEnv([...POWERTOOLS_ENV_VARS, ...Object.keys(vars)]);
	try {
		setEnvVars(vars);
		return await fn();
	} finally {
		restoreEnv(snapshot);
	}
}
