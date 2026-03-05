/**
 * ValidationExecutor - Executes validation functions with appropriate interfaces
 * 
 * This class provides static methods for executing validation functions with either
 * single-parameter or multi-parameter interfaces. It handles errors gracefully and
 * logs validation failures.
 * 
 * @private
 * @class ValidationExecutor
 */
class ValidationExecutor {
	/**
	 * Execute validation function with appropriate interface.
	 * 
	 * Determines whether to pass a single value or an object based on the number
	 * of parameters specified. Handles validation errors gracefully by catching
	 * exceptions and logging them.
	 * 
	 * @param {Function} validateFn - Validation function to execute
	 * @param {Array<string>} paramNames - Parameter names to validate
	 * @param {Object} paramValues - All parameter values available
	 * @returns {boolean} True if validation passes, false if fails or throws
	 * 
	 * @example
	 * // Single parameter validation
	 * const isValid = ValidationExecutor.execute(
	 *   (value) => value.length > 0,
	 *   ['id'],
	 *   { id: '123' }
	 * );
	 * 
	 * @example
	 * // Multi-parameter validation
	 * const isValid = ValidationExecutor.execute(
	 *   ({page, limit}) => page >= 1 && limit >= 1 && limit <= 100,
	 *   ['page', 'limit'],
	 *   { page: 1, limit: 10 }
	 * );
	 */
	static execute(validateFn, paramNames, paramValues) {
		try {
			if (paramNames.length === 1) {
				// Single parameter: pass value directly
				const value = paramValues[paramNames[0]];
				return validateFn(value);
			} else {
				// Multiple parameters: pass object
				const paramObj = {};
				for (const name of paramNames) {
					paramObj[name] = paramValues[name];
				}
				return validateFn(paramObj);
			}
		} catch (error) {
			// Log error and treat as validation failure
			const tools = require("../tools/index.js");
			tools.DebugAndLog.error(
				`Validation function threw error for parameters [${paramNames.join(", ")}]: ${error?.message || "Unknown error"}`,
				error?.stack
			);
			return false;
		}
	}
}

module.exports = ValidationExecutor;
