/**
 * Property-Based Tests for TypeScript Type Definitions
 *
 * Validates structural correctness properties of the .d.ts declaration files
 * using fast-check for property-based testing.
 *
 * Properties tested:
 * 1. Public Export Type Coverage
 * 2. Deprecated Export Annotation Coverage
 * 3. Interface Property Completeness
 * 4. Declaration File Validity (No Implementation Code)
 * 5. JSDoc Documentation Completeness
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const projectRoot = resolve(import.meta.dirname, '..', '..', '..');

const declarationFiles = [
	'types/index.d.ts',
	'types/lib/tools/index.d.ts',
	'types/lib/dao-cache.d.ts',
	'types/lib/dao-endpoint.d.ts'
];

// Read all declaration file contents once
const fileContents = {};
for (const file of declarationFiles) {
	fileContents[file] = readFileSync(resolve(projectRoot, file), 'utf8');
}

// Known public exports by module
const toolsExports = [
	'AWS', 'AWSXRay', 'ApiRequest', 'ImmutableObject', 'Timer', 'DebugAndLog',
	'Connection', 'Connections', 'ConnectionRequest', 'ConnectionAuthentication',
	'RequestInfo', 'ClientRequest', 'ResponseDataModel', 'Response',
	'AppConfig', 'CachedSsmParameter', 'CachedSecret', 'CachedParameterSecret',
	'CachedParameterSecrets', 'printMsg', 'sanitize', 'obfuscate', 'hashThisData',
	'nodeVer', 'nodeVerMajor', 'nodeVerMinor', 'nodeVerMajorMinor',
	'jsonGenericResponse', 'htmlGenericResponse', 'rssGenericResponse',
	'xmlGenericResponse', 'textGenericResponse'
];

const cacheExports = ['Cache', 'CacheableDataAccess', 'TestHarness'];

const endpointExports = ['send', 'get', 'getDataDirectFromURI'];

// All public exports with their corresponding declaration file
const allPublicExports = [
	...toolsExports.map(name => ({ name, file: 'types/lib/tools/index.d.ts' })),
	...cacheExports.map(name => ({ name, file: 'types/lib/dao-cache.d.ts' })),
	...endpointExports.map(name => ({ name, file: 'types/lib/dao-endpoint.d.ts' }))
];

// Deprecated exports with their corresponding declaration file
const deprecatedExports = [
	{ name: 'Aws', file: 'types/lib/tools/index.d.ts' },
	{ name: 'AwsXRay', file: 'types/lib/tools/index.d.ts' },
	{ name: 'APIRequest', file: 'types/lib/tools/index.d.ts' },
	{ name: '_ConfigSuperClass', file: 'types/lib/tools/index.d.ts' },
	{ name: 'CachedSSMParameter', file: 'types/lib/tools/index.d.ts' },
	{ name: 'get', file: 'types/lib/dao-endpoint.d.ts' },
	{ name: 'getDataDirectFromURI', file: 'types/lib/dao-endpoint.d.ts' }
];

// Interface properties to verify
const interfaceProperties = [
	// ConnectionObject properties
	{ interfaceName: 'ConnectionObject', property: 'method', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'ConnectionObject', property: 'uri', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'ConnectionObject', property: 'protocol', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'ConnectionObject', property: 'host', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'ConnectionObject', property: 'path', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'ConnectionObject', property: 'parameters', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'ConnectionObject', property: 'headers', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'ConnectionObject', property: 'body', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'ConnectionObject', property: 'note', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'ConnectionObject', property: 'options', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'ConnectionObject', property: 'cache', file: 'types/lib/tools/index.d.ts' },
	// CacheProfileObject properties
	{ interfaceName: 'CacheProfileObject', property: 'profile', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'CacheProfileObject', property: 'overrideOriginHeaderExpiration', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'CacheProfileObject', property: 'defaultExpirationInSeconds', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'CacheProfileObject', property: 'expirationIsOnInterval', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'CacheProfileObject', property: 'headersToRetain', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'CacheProfileObject', property: 'hostId', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'CacheProfileObject', property: 'pathId', file: 'types/lib/tools/index.d.ts' },
	{ interfaceName: 'CacheProfileObject', property: 'encrypt', file: 'types/lib/tools/index.d.ts' },
	// CacheDataFormat properties (nested under cache.)
	{ interfaceName: 'CacheDataFormat', property: 'body', file: 'types/lib/dao-cache.d.ts' },
	{ interfaceName: 'CacheDataFormat', property: 'headers', file: 'types/lib/dao-cache.d.ts' },
	{ interfaceName: 'CacheDataFormat', property: 'expires', file: 'types/lib/dao-cache.d.ts' },
	{ interfaceName: 'CacheDataFormat', property: 'statusCode', file: 'types/lib/dao-cache.d.ts' }
];

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if a declaration exists for a given export name in a .d.ts file.
 * Looks for class, function, const, type, interface, or export declarations.
 */
function hasDeclaration(content, exportName) {
	// Match class declarations
	const classPattern = new RegExp(`\\bclass\\s+${escapeRegex(exportName)}\\b`);
	// Match function declarations
	const functionPattern = new RegExp(`\\bfunction\\s+${escapeRegex(exportName)}\\b`);
	// Match const/let/var declarations
	const constPattern = new RegExp(`\\b(?:export\\s+)?(?:const|let|var|declare\\s+const|declare\\s+let|declare\\s+var)\\s+${escapeRegex(exportName)}\\b`);
	// Match type alias declarations
	const typePattern = new RegExp(`\\btype\\s+${escapeRegex(exportName)}\\b`);
	// Match interface declarations
	const interfacePattern = new RegExp(`\\binterface\\s+${escapeRegex(exportName)}\\b`);
	// Match export declarations (export { name } or export const name)
	const exportPattern = new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:class|function|const|let|var|type|interface)\\s+${escapeRegex(exportName)}\\b`);
	// Match re-export patterns (export import X = ...)
	const reExportPattern = new RegExp(`\\bexport\\s+import\\s+${escapeRegex(exportName)}\\b`);

	return classPattern.test(content) ||
		functionPattern.test(content) ||
		constPattern.test(content) ||
		typePattern.test(content) ||
		interfacePattern.test(content) ||
		exportPattern.test(content) ||
		reExportPattern.test(content);
}

/**
 * Check if @deprecated annotation exists near a specific export name.
 */
function hasDeprecatedAnnotation(content, exportName) {
	// Look for @deprecated in a JSDoc comment that precedes the export declaration
	// The pattern: /** ... @deprecated ... */ followed by the export name
	const pattern = new RegExp(
		`/\\*\\*[^]*?@deprecated[^]*?\\*/\\s*(?:export\\s+)?(?:declare\\s+)?(?:class|function|const|let|var|type|interface|import)\\s+${escapeRegex(exportName)}\\b`,
		's'
	);
	return pattern.test(content);
}

/**
 * Check if an interface contains a specific property.
 * Uses bracket depth counting to find the full interface body including nested braces.
 */
function interfaceHasProperty(content, interfaceName, propertyName) {
	// Find the start of the interface declaration
	const interfaceStartPattern = new RegExp(
		`(?:export\\s+)?interface\\s+${escapeRegex(interfaceName)}\\s*\\{`
	);
	const startMatch = interfaceStartPattern.exec(content);
	if (!startMatch) {
		return false;
	}

	// Use bracket depth counting to find the full interface body
	const startIndex = startMatch.index + startMatch[0].length;
	let depth = 1;
	let endIndex = startIndex;

	while (endIndex < content.length && depth > 0) {
		if (content[endIndex] === '{') {
			depth++;
		} else if (content[endIndex] === '}') {
			depth--;
		}
		endIndex++;
	}

	const interfaceBody = content.substring(startIndex, endIndex - 1);

	// Check if the property exists in the interface body (including nested objects)
	const propertyPattern = new RegExp(`\\b${escapeRegex(propertyName)}\\s*[?:]`);
	return propertyPattern.test(interfaceBody);
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract all class and function declarations from a .d.ts file content.
 * Only matches actual declarations, not references in comments.
 */
function extractDeclaredSymbols(content) {
	const symbols = [];
	const lines = content.split('\n');
	let inBlockComment = false;

	for (const line of lines) {
		const trimmed = line.trim();

		// Track block comment state
		if (trimmed.startsWith('/*')) {
			inBlockComment = true;
		}
		if (inBlockComment) {
			if (trimmed.includes('*/')) {
				inBlockComment = false;
			}
			continue;
		}

		// Skip single-line comments
		if (trimmed.startsWith('//')) {
			continue;
		}

		// Match exported class declarations
		const classMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?class\s+([A-Z]\w*)/);
		if (classMatch) {
			symbols.push({ type: 'class', name: classMatch[1] });
		}

		// Match exported function declarations
		const funcMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?function\s+([a-z]\w*)/);
		if (funcMatch) {
			symbols.push({ type: 'function', name: funcMatch[1] });
		}
	}

	return symbols;
}

/**
 * Check if a JSDoc comment block exists before a symbol declaration.
 */
function hasJsDocComment(content, symbolName, symbolType) {
	// Look for /** ... */ immediately before the symbol declaration
	const pattern = new RegExp(
		`/\\*\\*[\\s\\S]*?\\*/\\s*(?:export\\s+)?(?:declare\\s+)?${escapeRegex(symbolType)}\\s+${escapeRegex(symbolName)}\\b`
	);
	return pattern.test(content);
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: typescript-type-definitions, Property 1: Public Export Type Coverage', () => {
	/**
	 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.1, 4.1**
	 *
	 * For each known public export in source files, verify a corresponding
	 * declaration exists in the .d.ts file.
	 */
	it('every public export has a corresponding type declaration', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...allPublicExports),
				(exportEntry) => {
					const content = fileContents[exportEntry.file];
					const found = hasDeclaration(content, exportEntry.name);
					expect(found).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});
});

describe('Feature: typescript-type-definitions, Property 2: Deprecated Export Annotation Coverage', () => {
	/**
	 * **Validates: Requirements 5.1, 5.2**
	 *
	 * For each known deprecated export, verify @deprecated appears in the
	 * corresponding .d.ts file.
	 */
	it('every deprecated export has a @deprecated JSDoc annotation', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...deprecatedExports),
				(deprecatedEntry) => {
					const content = fileContents[deprecatedEntry.file];
					const found = hasDeprecatedAnnotation(content, deprecatedEntry.name);
					expect(found).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});
});

describe('Feature: typescript-type-definitions, Property 3: Interface Property Completeness', () => {
	/**
	 * **Validates: Requirements 6.1, 6.2, 6.3**
	 *
	 * For each specified interface property in requirements, verify it exists
	 * in the TypeScript interface declaration.
	 */
	it('every required interface property exists in the declaration', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...interfaceProperties),
				(propEntry) => {
					const content = fileContents[propEntry.file];
					const found = interfaceHasProperty(content, propEntry.interfaceName, propEntry.property);
					expect(found).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});
});

describe('Feature: typescript-type-definitions, Property 4: Declaration File Validity (No Implementation Code)', () => {
	/**
	 * **Validates: Requirements 7.1, 7.2**
	 *
	 * For each .d.ts file, verify no implementation patterns exist
	 * (no function bodies with statements, no variable assignments with runtime values).
	 */
	it('declaration files contain no implementation code', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...declarationFiles),
				(file) => {
					const content = fileContents[file];

					// Check for implementation patterns that should NOT exist in .d.ts files
					// Pattern: = require( that is NOT import ... = require(...)
					const requireLines = content.split('\n').filter(line => {
						const trimmed = line.trim();
						// Skip comments and JSDoc lines
						if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('/**')) {
							return false;
						}
						// Allow: import X = require("...")
						if (/^\s*import\s+\w+\s*=\s*require\s*\(/.test(trimmed)) {
							return false;
						}
						// Allow: export import X = require("...")
						if (/^\s*export\s+import\s+\w+\s*=\s*require\s*\(/.test(trimmed)) {
							return false;
						}
						// Flag any other require()
						return /=\s*require\s*\(/.test(trimmed);
					});
					expect(requireLines).toHaveLength(0);

					// Check for: = new ClassName( (runtime instantiation)
					const newInstanceLines = content.split('\n').filter(line => {
						const trimmed = line.trim();
						// Skip comments and JSDoc
						if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
							return false;
						}
						return /=\s*new\s+\w+\s*\(/.test(trimmed);
					});
					expect(newInstanceLines).toHaveLength(0);

					// Check for: console.log (runtime code)
					const consoleLines = content.split('\n').filter(line => {
						const trimmed = line.trim();
						// Skip comments and JSDoc
						if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
							return false;
						}
						return /\bconsole\.\w+\s*\(/.test(trimmed);
					});
					expect(consoleLines).toHaveLength(0);

					// Check for: JSON.parse( (runtime code, not in comments)
					const jsonParseLines = content.split('\n').filter(line => {
						const trimmed = line.trim();
						// Skip comments and JSDoc
						if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
							return false;
						}
						return /\bJSON\.parse\s*\(/.test(trimmed);
					});
					expect(jsonParseLines).toHaveLength(0);

					// Check for function bodies with statements (implementation code)
					// Pattern: function or method with { ... statements ... }
					// In .d.ts files, methods should end with ): ReturnType; not have bodies
					// Look for patterns like: functionName(...) { ... }
					const functionBodyLines = content.split('\n').filter(line => {
						const trimmed = line.trim();
						// Skip comments and JSDoc
						if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
							return false;
						}
						// Skip interface/type/class opening braces
						if (/(?:interface|type|class|export|declare|readonly|static)\s/.test(trimmed)) {
							return false;
						}
						// Skip property type definitions that use { }
						if (/^\w+\s*[?:]/.test(trimmed)) {
							return false;
						}
						// Flag: lines that look like function implementations
						// e.g., "return something;" or "const x = ..." inside a function
						return /^\s*return\s+/.test(trimmed) || /^\s*(?:let|var)\s+\w+\s*=/.test(trimmed);
					});
					expect(functionBodyLines).toHaveLength(0);
				}
			),
			{ numRuns: 100 }
		);
	});
});

describe('Feature: typescript-type-definitions, Property 5: JSDoc Documentation Completeness', () => {
	/**
	 * **Validates: Requirements 10.1, 10.2, 10.3**
	 *
	 * For each declared class/function in .d.ts files, verify JSDoc comment
	 * block exists with appropriate tags.
	 */
	it('every declared class and exported function has a JSDoc comment', () => {
		// Collect all declared symbols across all files
		const allSymbols = [];
		for (const file of declarationFiles) {
			const content = fileContents[file];
			const symbols = extractDeclaredSymbols(content);
			for (const symbol of symbols) {
				allSymbols.push({ ...symbol, file });
			}
		}

		// Ensure we have symbols to test
		expect(allSymbols.length).toBeGreaterThan(0);

		fc.assert(
			fc.property(
				fc.constantFrom(...allSymbols),
				(symbolEntry) => {
					const content = fileContents[symbolEntry.file];
					const found = hasJsDocComment(content, symbolEntry.name, symbolEntry.type);
					expect(found).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});
});
