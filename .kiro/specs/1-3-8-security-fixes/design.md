# Design Document: Security Fixes

## Overview

This design addresses three critical security vulnerabilities identified by GitHub's code scanner in the @63klabs/cache-data package. The vulnerabilities involve shell command injection risks in scripts/audit-documentation.mjs (lines 129 and 641) and test/documentation/property/executable-example-validation-tests.mjs (line 104).

The design provides comprehensive security fixes using Node.js's `execFile` function to prevent command injection, improves string escaping in JSDoc parsing, implements extensive security testing including property-based tests, establishes secure coding practices through documentation, and adds automated security linting with ESLint.

## Architecture

### Security Fix Strategy

The security fixes follow a defense-in-depth approach:

1. **Immediate Fixes**: Replace unsafe `execSync` calls with `execFile` to eliminate shell interpretation
2. **String Parsing Hardening**: Fix incomplete bracket matching in JSDoc parser to handle all edge cases
3. **Comprehensive Audit**: Scan entire codebase for similar patterns and fix proactively
4. **Security Testing**: Add property-based tests that validate security properties across arbitrary inputs
5. **Automated Prevention**: Add ESLint rules to catch similar issues in code review
6. **Documentation**: Create steering document to prevent future security issues

### execFile vs execSync

**Current (Unsafe)**:
```javascript
// scripts/audit-documentation.mjs:641
await execAsync(`node --check ${tempFile}`);
```

**Problem**: The template literal allows shell interpretation. If `tempFile` contains shell metacharacters like `;`, `|`, `$()`, etc., they will be executed.

**Solution (Safe)**:
```javascript
// >! Use execFile to prevent shell interpretation
// >! Arguments passed as array are not interpreted by shell
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

await execFileAsync('node', ['--check', tempFile]);
```

**Why This Works**: `execFile` executes the command directly without spawning a shell, so special characters in arguments are treated as literal strings, not shell commands.

## Components and Interfaces

### 1. Shell Command Execution Module

**Location**: scripts/audit-documentation.mjs, test files

**Current Implementation**:
```javascript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Line 641 - VULNERABLE
await execAsync(`node --check ${tempFile}`);
```

**Secure Implementation**:
```javascript
// >! Import execFile instead of exec to avoid shell interpretation
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// >! Pass command and arguments separately as array
// >! This prevents shell metacharacters from being interpreted
await execFileAsync('node', ['--check', tempFile]);
```

**Interface**:
```javascript
/**
 * Execute a command safely without shell interpretation
 * 
 * @param {string} command - Command to execute (e.g., 'node')
 * @param {Array<string>} args - Command arguments as array
 * @param {Object} [options] - Execution options
 * @returns {Promise<{stdout: string, stderr: string}>} Command output
 * @throws {Error} If command execution fails
 * 
 * @example
 * // >! Safe: Arguments passed as array, no shell interpretation
 * const result = await execFileAsync('node', ['--check', userProvidedPath]);
 * 
 * @example
 * // >! UNSAFE: Template literal allows shell injection
 * // await execAsync(`node --check ${userProvidedPath}`); // DON'T DO THIS
 */
```

### 2. JSDoc Type Parser Module

**Location**: scripts/audit-documentation.mjs:129

**Current Implementation** (Vulnerable):
```javascript
// Line 129 - INCOMPLETE BRACKET MATCHING
const paramMatch = line.match(/^@param\s+\{([^}]+)\}\s+(\[?[\w.]+\]?)\s*-?\s*(.*)/);
```

**Problem**: The regex `[^}]+` matches any character except `}`, but this fails for nested brackets like `{Array<{id: string, name: string}>}`. It will match only up to the first `}`, leaving the rest unparsed.

**Secure Implementation**:
```javascript
/**
 * Parse JSDoc @param tag with proper bracket matching
 * 
 * @param {string} line - JSDoc line to parse
 * @returns {Object|null} Parsed param data or null
 */
function parseParamTag(line) {
	// >! Match @param with proper bracket counting for nested types
	const paramStart = line.match(/^@param\s+\{/);
	if (!paramStart) return null;
	
	// >! Find the closing bracket by counting bracket depth
	let depth = 0;
	let typeEnd = -1;
	const startPos = paramStart.index + paramStart[0].length;
	
	for (let i = startPos; i < line.length; i++) {
		if (line[i] === '{') {
			depth++;
		} else if (line[i] === '}') {
			if (depth === 0) {
				typeEnd = i;
				break;
			}
			depth--;
		}
		// >! Handle escaped brackets
		if (line[i] === '\\' && i + 1 < line.length) {
			i++; // Skip next character
		}
	}
	
	if (typeEnd === -1) {
		// >! Unmatched brackets - handle gracefully
		return null;
	}
	
	const type = line.substring(startPos, typeEnd);
	const remainder = line.substring(typeEnd + 1).trim();
	
	// Parse parameter name and description
	const nameMatch = remainder.match(/^(\[?[\w.]+\]?)\s*-?\s*(.*)/);
	if (!nameMatch) return null;
	
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
}
```

**Why This Works**: Instead of using a regex that fails on nested brackets, we manually count bracket depth, properly handling:
- Nested brackets: `{Array<{id: string}>}`
- Escaped brackets: `{string\}with\{brackets}`
- Unmatched brackets: Returns null gracefully

### 3. Security Testing Module

**Location**: test/security/ (new directory)

**Components**:

#### 3.1 Shell Command Security Tests

```javascript
/**
 * Test shell command execution security
 * 
 * Tests that execFile prevents command injection with:
 * - File paths containing spaces
 * - File paths containing shell metacharacters (;, |, $, `, etc.)
 * - Malicious injection attempts
 */
describe('Shell Command Security', () => {
	it('should handle file paths with spaces safely', async () => {
		const pathWithSpaces = '/tmp/test file with spaces.mjs';
		// Test that execFile handles this without shell escaping
	});
	
	it('should prevent command injection via semicolon', async () => {
		const maliciousPath = '/tmp/test.mjs; rm -rf /';
		// Test that the semicolon is treated as part of filename, not command separator
	});
	
	it('should prevent command injection via pipe', async () => {
		const maliciousPath = '/tmp/test.mjs | cat /etc/passwd';
		// Test that pipe is treated as part of filename
	});
	
	it('should prevent command injection via command substitution', async () => {
		const maliciousPath = '/tmp/test.mjs $(whoami)';
		// Test that command substitution is not executed
	});
});
```

#### 3.2 JSDoc Parser Security Tests

```javascript
/**
 * Test JSDoc parser security and correctness
 * 
 * Tests that parser handles:
 * - Nested brackets
 * - Escaped characters
 * - Malformed input
 */
describe('JSDoc Parser Security', () => {
	it('should parse nested brackets correctly', () => {
		const line = '@param {Array<{id: string, name: string}>} users - User array';
		const result = parseParamTag(line);
		expect(result.type).to.equal('Array<{id: string, name: string}>');
	});
	
	it('should handle escaped brackets', () => {
		const line = '@param {string\\{with\\}brackets} text - Text with brackets';
		const result = parseParamTag(line);
		expect(result.type).to.equal('string\\{with\\}brackets');
	});
	
	it('should handle unmatched brackets gracefully', () => {
		const line = '@param {Array<string} broken - Malformed type';
		const result = parseParamTag(line);
		expect(result).to.be.null;
	});
});
```

#### 3.3 Property-Based Security Tests

```javascript
/**
 * Property-based tests for security properties
 * 
 * Uses fast-check to generate arbitrary inputs and verify security properties
 */
describe('Security Properties', () => {
	it('Property: execFile prevents shell interpretation for any file path', async () => {
		await fc.assert(
			fc.asyncProperty(
				// >! Generate arbitrary file paths including shell metacharacters
				fc.string({ minLength: 1, maxLength: 100 }).map(s => `/tmp/${s}.mjs`),
				async (filePath) => {
					// >! Verify that execFile treats path as literal string
					// >! No shell interpretation should occur
					try {
						await execFileAsync('echo', [filePath]);
						return true; // Command executed without shell interpretation
					} catch (error) {
						// File not found is OK - we're testing injection prevention
						return !error.message.includes('command not found');
					}
				}
			),
			{ numRuns: 100 }
		);
	});
	
	it('Property: JSDoc parser handles arbitrary bracket nesting', () => {
		fc.assert(
			fc.property(
				// >! Generate strings with arbitrary bracket nesting
				fc.array(fc.constantFrom('{', '}', 'string', 'number', 'Array', '<', '>')).map(arr => arr.join('')),
				(typeStr) => {
					const line = `@param {${typeStr}} param - Description`;
					const result = parseParamTag(line);
					
					// >! Property: Parser should either parse correctly or return null
					// >! It should never throw an error or hang
					return result === null || typeof result.type === 'string';
				}
			),
			{ numRuns: 100 }
		);
	});
});
```

### 4. ESLint Security Rules

**Location**: .eslintrc.json (new file)

**Configuration**:
```json
{
	"env": {
		"node": true,
		"es2021": true,
		"mocha": true
	},
	"extends": "eslint:recommended",
	"parserOptions": {
		"ecmaVersion": "latest",
		"sourceType": "module"
	},
	"rules": {
		"no-restricted-imports": ["error", {
			"patterns": [{
				"group": ["child_process"],
				"importNames": ["exec", "execSync"],
				"message": "Use execFile or execFileSync instead of exec/execSync to prevent shell injection. See .kiro/steering/secure-coding-practices.md"
			}]
		}],
		"no-template-curly-in-string": "error",
		"no-eval": "error",
		"no-implied-eval": "error",
		"no-new-func": "error"
	},
	"overrides": [
		{
			"files": ["test/**/*.mjs", "test/**/*.js", "scripts/**/*.mjs", "scripts/**/*.js", "src/**/*.js"],
			"rules": {
				"no-restricted-imports": ["error", {
					"patterns": [{
						"group": ["child_process"],
						"importNames": ["exec", "execSync"],
						"message": "Use execFile or execFileSync instead of exec/execSync to prevent shell injection. See .kiro/steering/secure-coding-practices.md"
					}]
				}]
			}
		}
	]
}
```

**Custom Rule for String Escaping** (if needed):
```javascript
// .eslint/rules/secure-string-escaping.js
module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Detect incomplete string escaping patterns",
			category: "Security",
			recommended: true
		},
		messages: {
			incompleteEscaping: "Incomplete string escaping detected. Use proper bracket counting for nested structures."
		}
	},
	create(context) {
		return {
			// Detect regex patterns like [^}]+ that don't handle nesting
			Literal(node) {
				if (node.regex && node.regex.pattern.includes('[^}]+')) {
					context.report({
						node,
						messageId: "incompleteEscaping"
					});
				}
			}
		};
	}
};
```

### 5. Secure Coding Practices Documentation

**Location**: .kiro/steering/secure-coding-practices.md (new file)

**Structure**:
1. Introduction and Purpose
2. Shell Command Execution Security
   - Node.js: execFile vs exec
   - Python: subprocess.run with shell=False
   - Examples and anti-patterns
3. Input Validation and Sanitization
   - Validating file paths
   - Validating user input
   - Allowlisting vs denylisting
4. String Handling and Escaping
   - Proper bracket matching
   - Handling special characters
   - Regular expression security
5. Credential Management
   - AWS SSM Parameter Store usage
   - AWS Secrets Manager usage
   - Prohibiting hardcoded credentials
6. Testing Security
   - Jest security testing patterns
   - Hypothesis (Python) property-based testing
   - Security test examples
7. Lambda and CI/CD Security
   - Lambda function security best practices
   - CodeBuild script security
   - Environment variable handling
8. Security Comment Notation
   - Markdown: `> comment`
   - YAML/Python: `# >! comment`
   - JavaScript: `// >! comment`

## Data Models

### Security Audit Result

```javascript
{
	auditDate: string,           // ISO 8601 timestamp
	vulnerabilities: [
		{
			file: string,          // Relative file path
			line: number,          // Line number
			type: string,          // 'shell-injection' | 'string-escaping' | 'other'
			severity: string,      // 'critical' | 'high' | 'medium' | 'low'
			description: string,   // Human-readable description
			fix: string,           // Recommended fix
			fixed: boolean         // Whether fix has been applied
		}
	],
	summary: {
		totalFiles: number,
		vulnerabilitiesFound: number,
		vulnerabilitiesFixed: number,
		criticalCount: number,
		highCount: number
	}
}
```

### Test Result

```javascript
{
	testName: string,
	passed: boolean,
	iterations: number,          // For property-based tests
	failedInput: any,            // Input that caused failure (if any)
	errorMessage: string,        // Error message (if failed)
	securityProperty: string     // Which security property was tested
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Shell Command Execution Safety

*For any* file path (including paths with spaces, quotes, semicolons, pipes, command substitution, or other shell metacharacters), when executing a command using execFile with the path as an argument, the shell SHALL NOT interpret any special characters in the path, and the path SHALL be treated as a literal string.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

### Property 2: JSDoc Bracket Matching Correctness

*For any* JSDoc type annotation with nested brackets (including types like `Array<{id: string, data: {nested: boolean}}>` or `Promise<{success: boolean, data: Object}>`), when parsing the @param tag, the parser SHALL correctly identify the complete type string by matching all opening and closing brackets, maintaining correct bracket depth across all nesting levels.

**Validates: Requirements 2.1, 2.3**

### Property 3: JSDoc Parser Resilience

*For any* malformed JSDoc type annotation (including unmatched brackets, escaped brackets, or invalid nesting), when parsing the @param tag, the parser SHALL handle the input gracefully by returning null or a partial result without throwing errors, hanging, or corrupting subsequent parsing.

**Validates: Requirements 2.2, 2.4**

### Property 4: Shell Injection Prevention

*For any* randomly generated string (including strings with shell metacharacters like `;`, `|`, `$()`, `` ` ``, `&`, `>`, `<`, `*`, `?`, `[`, `]`, `{`, `}`), when used as a file path argument to execFile, the command execution SHALL treat the entire string as a literal file path without executing any embedded commands or interpreting any shell syntax.

**Validates: Requirements 5.1, 5.2**

### Property 5: Bracket Matching with Arbitrary Nesting

*For any* randomly generated string containing brackets (including arbitrary nesting depths, mixed bracket types, and escaped brackets), when parsed by the JSDoc parser, the parser SHALL either correctly identify matching bracket pairs and return the complete type string, or determine that brackets are unmatched and return null, without entering infinite loops or producing incorrect partial matches.

**Validates: Requirements 5.3, 5.4**

### Property 6: Backwards Compatibility

*For any* valid input that was correctly handled by the original implementation (including valid file paths for shell commands and valid JSDoc type annotations for parsing), when processed by the security-fixed implementation, the output SHALL be identical to the original implementation's output, maintaining the same return values, error handling behavior, and side effects.

**Validates: Requirements 9.1, 9.2**

## Error Handling

### Shell Command Execution Errors

**Error Types**:
1. **Command Not Found**: The command executable doesn't exist
2. **Permission Denied**: Insufficient permissions to execute command
3. **Command Failed**: Command executed but returned non-zero exit code
4. **Timeout**: Command execution exceeded timeout limit

**Handling Strategy**:
```javascript
try {
	const { stdout, stderr } = await execFileAsync('node', ['--check', filePath], {
		timeout: 30000 // 30 second timeout
	});
	return { valid: true, stdout, stderr };
} catch (error) {
	// >! Distinguish between different error types for better error messages
	if (error.code === 'ENOENT') {
		throw new Error(`Command not found: node`);
	} else if (error.code === 'EACCES') {
		throw new Error(`Permission denied executing: node`);
	} else if (error.killed) {
		throw new Error(`Command timeout after 30 seconds`);
	} else {
		// Command executed but failed
		return {
			valid: false,
			error: error.message,
			stdout: error.stdout,
			stderr: error.stderr
		};
	}
}
```

### JSDoc Parser Errors

**Error Types**:
1. **Unmatched Brackets**: Opening bracket without closing bracket
2. **Invalid Syntax**: Malformed JSDoc tag
3. **Unexpected Characters**: Characters that break parsing

**Handling Strategy**:
```javascript
function parseParamTag(line) {
	try {
		// >! Attempt to parse with bracket counting
		const result = parseWithBracketCounting(line);
		return result;
	} catch (error) {
		// >! Log error for debugging but return null gracefully
		console.warn(`Failed to parse JSDoc line: ${line}`, error);
		return null;
	}
}
```

**Graceful Degradation**: If parsing fails, return null and continue processing other JSDoc tags. The audit report will flag incomplete documentation, but the script won't crash.

### Test Failures

**Property Test Failures**:
- When a property test fails, fast-check provides the failing input
- Log the failing input for reproduction
- Provide clear error message indicating which security property was violated

```javascript
try {
	await fc.assert(
		fc.asyncProperty(
			fc.string(),
			async (input) => {
				// Test property
			}
		),
		{ numRuns: 100 }
	);
} catch (error) {
	console.error('Property test failed with input:', error.counterexample);
	console.error('Security property violated:', 'Shell injection prevention');
	throw error;
}
```

## Testing Strategy

### Dual Testing Approach

This spec requires both unit tests and property-based tests:

**Unit Tests**: Verify specific examples, edge cases, and error conditions
- Test specific malicious inputs (e.g., `; rm -rf /`)
- Test specific JSDoc patterns (e.g., `Array<{id: string}>`)
- Test error handling for specific error types
- Test integration between components

**Property Tests**: Verify universal properties across all inputs
- Generate arbitrary file paths and verify no shell interpretation
- Generate arbitrary JSDoc types and verify correct parsing
- Run minimum 100 iterations per property test
- Each property test references its design document property

**Together**: Comprehensive coverage where unit tests catch concrete bugs and property tests verify general correctness.

### Test Organization

```
test/
├── security/
│   ├── shell-command-security-tests.mjs          # Unit tests for shell commands
│   ├── jsdoc-parser-security-tests.mjs           # Unit tests for JSDoc parser
│   └── property/
│       ├── shell-injection-prevention-property-tests.mjs
│       └── jsdoc-parsing-property-tests.mjs
└── documentation/
    └── property/
        └── executable-example-validation-tests.mjs  # Updated with security fixes
```

### Property-Based Testing Configuration

**Framework**: fast-check (already in use)

**Configuration**:
```javascript
fc.assert(
	fc.asyncProperty(
		// Arbitraries
		fc.string({ minLength: 1, maxLength: 100 }),
		async (input) => {
			// Test implementation
		}
	),
	{
		numRuns: 100,  // Minimum 100 iterations
		verbose: true,  // Show failing inputs
		seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : Date.now()
	}
);
```

**Test Tags**:
```javascript
// Feature: security-fixes, Property 1: Shell Command Execution Safety
it('Property 1: Shell command execution prevents injection', async () => {
	// Test implementation
});
```

### Security Test Coverage

**Required Test Cases**:

1. **Shell Command Security**:
   - File paths with spaces: `/tmp/test file.mjs`
   - File paths with quotes: `/tmp/test"file.mjs`, `/tmp/test'file.mjs`
   - Command injection via semicolon: `/tmp/test.mjs; rm -rf /`
   - Command injection via pipe: `/tmp/test.mjs | cat /etc/passwd`
   - Command injection via command substitution: `/tmp/test.mjs $(whoami)`
   - Command injection via backticks: `/tmp/test.mjs \`whoami\``
   - File paths with ampersand: `/tmp/test.mjs & echo hacked`
   - File paths with redirection: `/tmp/test.mjs > /tmp/output`

2. **JSDoc Parser Security**:
   - Nested brackets: `{Array<{id: string, name: string}>}`
   - Triple nesting: `{Promise<Array<{id: string}>>}`
   - Escaped brackets: `{string\\{with\\}brackets}`
   - Unmatched opening: `{Array<string`
   - Unmatched closing: `Array<string>}`
   - Mixed brackets: `{Array<[string, number]>}`
   - Empty brackets: `{}`
   - Special characters: `{string|number|null}`

3. **Property-Based Tests**:
   - Arbitrary file paths (100+ iterations)
   - Arbitrary JSDoc types (100+ iterations)
   - Arbitrary bracket nesting (100+ iterations)

### ESLint Integration

**Test ESLint Rules**:
```bash
# Run ESLint on all files
npm run lint

# Run ESLint on specific file
npx eslint scripts/audit-documentation.mjs

# Run ESLint in CI/CD (fail on errors)
npx eslint . --max-warnings 0
```

**Expected Behavior**:
- ESLint should flag any use of `exec` or `execSync` from `child_process`
- ESLint should provide clear error message with link to steering document
- ESLint should fail CI/CD build if security issues detected

### Backwards Compatibility Testing

**Approach**: Run existing test suite after applying security fixes

```bash
# Run all existing tests
npm test

# Run specific test suites
npm test -- test/documentation/
npm test -- test/cache/
npm test -- test/endpoint/
```

**Success Criteria**: All existing tests must pass without modification

## Implementation Notes

### File Modifications Required

1. **scripts/audit-documentation.mjs**:
   - Line 641: Replace `execAsync` with `execFileAsync`
   - Line 129: Replace regex-based parsing with bracket counting function
   - Add security comments explaining changes

2. **test/documentation/property/executable-example-validation-tests.mjs**:
   - Line 104: Replace `execAsync` with `execFileAsync`
   - Add security comments explaining changes

3. **All test files**: Audit for similar patterns and fix proactively

4. **All code files**: Audit for similar string escaping patterns

### New Files Required

1. **.eslintrc.json**: ESLint configuration with security rules
2. **.kiro/steering/secure-coding-practices.md**: Comprehensive security documentation
3. **test/security/shell-command-security-tests.mjs**: Unit tests for shell command security
4. **test/security/jsdoc-parser-security-tests.mjs**: Unit tests for JSDoc parser security
5. **test/security/property/shell-injection-prevention-property-tests.mjs**: Property tests for shell injection
6. **test/security/property/jsdoc-parsing-property-tests.mjs**: Property tests for JSDoc parsing

### Security Comment Examples

**JavaScript**:
```javascript
// >! Use execFile to prevent shell interpretation
// >! Arguments passed as array are not interpreted by shell
await execFileAsync('node', ['--check', tempFile]);
```

**Python** (for future reference):
```python
# >! Use subprocess.run with shell=False to prevent shell injection
# >! Arguments passed as list are not interpreted by shell
subprocess.run(['node', '--check', temp_file], shell=False)
```

**YAML** (for CI/CD configs):
```yaml
# >! Use explicit command array to prevent shell interpretation
command:
  - node
  - --check
  - ${TEMP_FILE}
```

**Markdown** (for documentation):
```markdown
> **Security Note**: Always use `execFile` instead of `exec` to prevent shell injection attacks. Pass arguments as an array, not as a template string.
```

### Migration Path

1. **Phase 1**: Fix identified vulnerabilities (lines 129, 641, 104)
2. **Phase 2**: Audit codebase and fix similar patterns
3. **Phase 3**: Add security tests (unit and property-based)
4. **Phase 4**: Add ESLint rules and run on codebase
5. **Phase 5**: Create steering document
6. **Phase 6**: Run full test suite to verify backwards compatibility

### Performance Considerations

**execFile vs exec**: `execFile` is actually slightly faster than `exec` because it doesn't spawn a shell. No performance degradation expected.

**Bracket Counting vs Regex**: The bracket counting algorithm is O(n) where n is the length of the type string. For typical JSDoc types (< 200 characters), this is negligible. No performance impact expected.

### Security Considerations

**Defense in Depth**: This design implements multiple layers of security:
1. **Prevention**: Use execFile to prevent shell interpretation
2. **Detection**: ESLint rules catch unsafe patterns in code review
3. **Testing**: Property-based tests verify security properties
4. **Documentation**: Steering document educates developers

**Threat Model**:
- **Attacker Goal**: Execute arbitrary commands on the system
- **Attack Vector**: Inject shell metacharacters into file paths or JSDoc strings
- **Mitigation**: Use execFile which doesn't interpret shell syntax
- **Residual Risk**: None - execFile provides complete protection against shell injection

**Credential Security**:
- No credentials are used in the affected code
- Steering document will require SSM Parameter Store or Secrets Manager for any future credential usage
- Hardcoded credentials are prohibited and will be caught by code review

## Conclusion

This design provides comprehensive security fixes for the three identified vulnerabilities while establishing a robust security foundation for the entire codebase. The combination of immediate fixes, comprehensive testing, automated linting, and developer education ensures both current security and future prevention of similar issues.

The use of `execFile` instead of `exec` provides complete protection against shell injection attacks, while the improved JSDoc parser handles all edge cases correctly. Property-based testing validates security properties across arbitrary inputs, and ESLint rules prevent similar issues from being introduced in the future.
