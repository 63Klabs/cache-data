/**
 * Secure JSDoc parsing utilities
 * 
 * These functions use bracket depth counting instead of regex to correctly parse
 * JSDoc tags with nested brackets, preventing string escaping vulnerabilities.
 * 
 * @module test/helpers/jsdoc-parser
 */

/**
 * Parse JSDoc @param tag with proper bracket matching
 * 
 * Handles nested brackets, escaped brackets, and malformed input gracefully.
 * Uses bracket depth counting instead of regex to correctly parse complex types.
 * 
 * @param {string} line - JSDoc line to parse
 * @returns {Object|null} Parsed param data with {name, type, description, optional, defaultValue} or null if unparseable
 * @example
 * // Simple type
 * parseParamTag('@param {string} name - User name')
 * // Returns: { name: 'name', type: 'string', description: 'User name', optional: false, defaultValue: null }
 * 
 * @example
 * // Nested brackets
 * parseParamTag('@param {Array<{id: string, name: string}>} users - User array')
 * // Returns: { name: 'users', type: 'Array<{id: string, name: string}>', description: 'User array', optional: false, defaultValue: null }
 */
export function parseParamTag(line) {
	try {
		// >! Match @param with proper bracket counting for nested types
		const paramStart = line.match(/^@param\s+\{/);
		if (!paramStart) return null;
		
		// >! Find the closing bracket by counting bracket depth
		// >! This handles nested brackets like {Array<{id: string}>} correctly
		let depth = 0;
		let typeEnd = -1;
		const startPos = paramStart.index + paramStart[0].length;
		
		for (let i = startPos; i < line.length; i++) {
			const char = line[i];
			
			// >! Handle escaped brackets - skip the next character
			if (char === '\\' && i + 1 < line.length) {
				i++; // Skip next character
				continue;
			}
			
			if (char === '{') {
				depth++;
			} else if (char === '}') {
				if (depth === 0) {
					// Found the closing bracket for the type
					typeEnd = i;
					break;
				}
				depth--;
			}
		}
		
		// >! Unmatched brackets - handle gracefully by returning null
		if (typeEnd === -1) {
			return null;
		}
		
		const type = line.substring(startPos, typeEnd);
		const remainder = line.substring(typeEnd + 1).trim();
		
		// Parse parameter name and description
		const nameMatch = remainder.match(/^(\[?[\w.]+\]?)\s*-?\s*(.*)/);
		if (!nameMatch) {
			return null;
		}
		
		const [, name, description] = nameMatch;
		const isOptional = name.startsWith('[') && name.endsWith(']');
		const cleanName = name.replace(/[\[\]]/g, '').split('=')[0];
		const defaultValue = name.includes('=') ? name.split('=')[1].replace(']', '') : null;
		
		return {
			name: cleanName,
			type,
			description: description || '',
			optional: isOptional,
			defaultValue
		};
	} catch (error) {
		// >! Catch any unexpected errors and continue processing
		return null;
	}
}

/**
 * Parse JSDoc @returns tag with proper bracket matching
 * 
 * Handles nested brackets, escaped brackets, and malformed input gracefully.
 * Uses bracket depth counting instead of regex to correctly parse complex types.
 * 
 * @param {string} line - JSDoc line to parse
 * @returns {Object|null} Parsed returns data with {type, description} or null if unparseable
 * @example
 * // Simple type
 * parseReturnsTag('@returns {string} User name')
 * // Returns: { type: 'string', description: 'User name' }
 * 
 * @example
 * // Nested brackets
 * parseReturnsTag('@returns {Promise<{success: boolean, data: Object}>} Result object')
 * // Returns: { type: 'Promise<{success: boolean, data: Object}>', description: 'Result object' }
 */
export function parseReturnsTag(line) {
	try {
		// >! Match @returns with proper bracket counting for nested types
		const returnsStart = line.match(/^@returns?\s+\{/);
		if (!returnsStart) return null;
		
		// >! Find the closing bracket by counting bracket depth
		let depth = 0;
		let typeEnd = -1;
		const startPos = returnsStart.index + returnsStart[0].length;
		
		for (let i = startPos; i < line.length; i++) {
			const char = line[i];
			
			// >! Handle escaped brackets - skip the next character
			if (char === '\\' && i + 1 < line.length) {
				i++; // Skip next character
				continue;
			}
			
			if (char === '{') {
				depth++;
			} else if (char === '}') {
				if (depth === 0) {
					// Found the closing bracket for the type
					typeEnd = i;
					break;
				}
				depth--;
			}
		}
		
		// >! Unmatched brackets - handle gracefully by returning null
		if (typeEnd === -1) {
			return null;
		}
		
		const type = line.substring(startPos, typeEnd);
		const description = line.substring(typeEnd + 1).trim();
		
		return {
			type,
			description: description || ''
		};
	} catch (error) {
		// >! Catch any unexpected errors and continue processing
		return null;
	}
}

/**
 * Parse JSDoc @throws tag with proper bracket matching
 * 
 * Handles nested brackets, escaped brackets, and malformed input gracefully.
 * Uses bracket depth counting instead of regex to correctly parse complex types.
 * 
 * @param {string} line - JSDoc line to parse
 * @returns {Object|null} Parsed throws data with {type, description} or null if unparseable
 * @example
 * // Simple type
 * parseThrowsTag('@throws {Error} When validation fails')
 * // Returns: { type: 'Error', description: 'When validation fails' }
 * 
 * @example
 * // Nested brackets
 * parseThrowsTag('@throws {ValidationError<{field: string}>} When field validation fails')
 * // Returns: { type: 'ValidationError<{field: string}>', description: 'When field validation fails' }
 */
export function parseThrowsTag(line) {
	try {
		// >! Match @throws with proper bracket counting for nested types
		const throwsStart = line.match(/^@throws?\s+\{/);
		if (!throwsStart) return null;
		
		// >! Find the closing bracket by counting bracket depth
		let depth = 0;
		let typeEnd = -1;
		const startPos = throwsStart.index + throwsStart[0].length;
		
		for (let i = startPos; i < line.length; i++) {
			const char = line[i];
			
			// >! Handle escaped brackets - skip the next character
			if (char === '\\' && i + 1 < line.length) {
				i++; // Skip next character
				continue;
			}
			
			if (char === '{') {
				depth++;
			} else if (char === '}') {
				if (depth === 0) {
					// Found the closing bracket for the type
					typeEnd = i;
					break;
				}
				depth--;
			}
		}
		
		// >! Unmatched brackets - handle gracefully by returning null
		if (typeEnd === -1) {
			return null;
		}
		
		const type = line.substring(startPos, typeEnd);
		const description = line.substring(typeEnd + 1).trim();
		
		return {
			type,
			description: description || ''
		};
	} catch (error) {
		// >! Catch any unexpected errors and continue processing
		return null;
	}
}

/**
 * Parse module.exports with proper bracket matching
 * 
 * Handles nested objects in exports using bracket depth counting.
 * 
 * @param {string} content - File content to parse
 * @returns {Array<string>} Array of exported names
 * @example
 * // Simple exports
 * parseModuleExports('module.exports = { Cache, Endpoint }')
 * // Returns: ['Cache', 'Endpoint']
 * 
 * @example
 * // Nested exports (though rare)
 * parseModuleExports('module.exports = { Cache, utils: { helper1, helper2 } }')
 * // Returns: ['Cache', 'utils']
 */
export function parseModuleExports(content) {
	try {
		// >! Find module.exports = { with proper bracket counting
		const exportsStart = content.match(/module\.exports\s*=\s*\{/);
		if (!exportsStart) return [];
		
		// >! Find the closing bracket by counting bracket depth
		let depth = 0;
		let exportsEnd = -1;
		const startPos = exportsStart.index + exportsStart[0].length;
		
		for (let i = startPos; i < content.length; i++) {
			const char = content[i];
			
			if (char === '{') {
				depth++;
			} else if (char === '}') {
				if (depth === 0) {
					// Found the closing bracket for module.exports
					exportsEnd = i;
					break;
				}
				depth--;
			}
		}
		
		// >! Unmatched brackets - handle gracefully by returning empty array
		if (exportsEnd === -1) {
			return [];
		}
		
		const exportsContent = content.substring(startPos, exportsEnd);
		
		// Parse exported names (simple approach - split by comma and extract names)
		const exportedNames = exportsContent
			.split(',')
			.map(e => e.trim().split(':')[0].trim())
			.filter(e => e.length > 0);
		
		return exportedNames;
	} catch (error) {
		// >! Catch any unexpected errors and continue processing
		return [];
	}
}
