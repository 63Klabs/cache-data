# Implementation Plan: Security Fixes

## Overview

This implementation plan addresses three critical security vulnerabilities identified by GitHub's code scanner: shell command injection risks in scripts/audit-documentation.mjs (lines 129 and 641) and test/documentation/property/executable-example-validation-tests.mjs (line 104). The plan includes fixing the vulnerabilities, auditing the codebase for similar patterns, implementing comprehensive security testing, adding ESLint security rules, and creating secure coding practices documentation.

## Tasks

- [x] 1. Fix shell command injection vulnerabilities
  - [x] 1.1 Fix scripts/audit-documentation.mjs line 641
    - Replace `execAsync` with `execFileAsync` from promisified `execFile`
    - Change `await execAsync(\`node --check ${tempFile}\`)` to `await execFileAsync('node', ['--check', tempFile])`
    - Add security comment: `// >! Use execFile to prevent shell interpretation`
    - _Requirements: 1.1, 1.3, 1.4, 1.5_
  
  - [x] 1.2 Fix test/documentation/property/executable-example-validation-tests.mjs line 104
    - Replace `execAsync` with `execFileAsync` from promisified `execFile`
    - Change `await execAsync(\`node --check ${tempFile}\`)` to `await execFileAsync('node', ['--check', tempFile])`
    - Add security comment: `// >! Use execFile to prevent shell interpretation`
    - _Requirements: 1.2, 1.3, 1.4, 1.5_
  
  - [x] 1.3 Update imports in both files
    - Change `import { exec } from 'child_process'` to `import { execFile } from 'child_process'`
    - Update `const execAsync = promisify(exec)` to `const execFileAsync = promisify(execFile)`
    - _Requirements: 1.1, 1.2_

- [x] 2. Fix JSDoc parser string escaping vulnerability
  - [x] 2.1 Create bracket counting function in scripts/audit-documentation.mjs
    - Implement `parseParamTag(line)` function with proper bracket depth counting
    - Handle nested brackets: `{Array<{id: string}>}`
    - Handle escaped brackets: `{string\{with\}brackets}`
    - Handle unmatched brackets gracefully (return null)
    - Add security comments explaining bracket counting logic
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 2.2 Replace regex-based parsing at line 129
    - Replace `line.match(/^@param\s+\{([^}]+)\}.../)` with call to `parseParamTag(line)`
    - Update parseJSDoc function to use new bracket counting approach
    - Maintain backwards compatibility for valid inputs
    - _Requirements: 2.1, 2.3_
  
  - [x] 2.3 Add error handling for malformed input
    - Wrap bracket counting in try-catch
    - Log warnings for unparseable JSDoc but continue processing
    - Return null for malformed input instead of throwing errors
    - _Requirements: 2.2_

- [x] 3. Comprehensive security audit
  - [x] 3.1 Audit all test files for shell command patterns
    - Search for `exec`, `execSync`, `spawn` with template literals
    - Search for command construction from variables
    - Document findings in audit report
    - _Requirements: 3.1_
  
  - [x] 3.2 Audit all code files for string escaping patterns
    - Search for regex patterns like `[^}]+` that don't handle nesting
    - Search for bracket matching logic
    - Document findings in audit report
    - _Requirements: 3.2_
  
  - [x] 3.3 Fix identified patterns using secure approaches
    - Apply execFile pattern to any shell command construction
    - Apply bracket counting to any string parsing with nesting
    - Add security comments to all fixes
    - _Requirements: 3.3_

- [x] 4. Checkpoint - Verify fixes work correctly
  - Run existing tests to ensure no regressions
  - Manually test audit script with various file paths
  - Ensure all tests pass, ask the user if questions arise

- [x] 5. Create security test suite
  - [x] 5.1 Create test/security/ directory structure
    - Create test/security/shell-command-security-tests.mjs
    - Create test/security/jsdoc-parser-security-tests.mjs
    - Create test/security/property/ directory
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 5.2 Write shell command security unit tests
    - Test file paths with spaces: `/tmp/test file.mjs`
    - Test command injection via semicolon: `/tmp/test.mjs; rm -rf /`
    - Test command injection via pipe: `/tmp/test.mjs | cat /etc/passwd`
    - Test command injection via command substitution: `/tmp/test.mjs $(whoami)`
    - Test command injection via backticks: `/tmp/test.mjs \`whoami\``
    - Test file paths with quotes, ampersand, redirection
    - Verify execFile treats all as literal strings
    - _Requirements: 4.1, 4.2_
  
  - [x] 5.3 Write JSDoc parser security unit tests
    - Test nested brackets: `{Array<{id: string, name: string}>}`
    - Test triple nesting: `{Promise<Array<{id: string}>>}`
    - Test escaped brackets: `{string\\{with\\}brackets}`
    - Test unmatched opening: `{Array<string`
    - Test unmatched closing: `Array<string>}`
    - Test mixed brackets: `{Array<[string, number]>}`
    - Test empty brackets: `{}`
    - Test special characters: `{string|number|null}`
    - _Requirements: 4.3_
  
  - [x] 5.4 Add clear error messages to security tests
    - Include security property being tested in error messages
    - Show failing input in error messages
    - Provide remediation guidance in test descriptions
    - _Requirements: 4.6_

- [x] 6. Create property-based security tests
  - [x] 6.1 Create test/security/property/shell-injection-prevention-property-tests.mjs
    - Import fast-check and execFileAsync
    - Generate arbitrary file paths with fc.string()
    - Include shell metacharacters in generated strings
    - Verify no shell interpretation occurs
    - Configure numRuns: 100
    - Tag: "Feature: security-fixes, Property 1: Shell Command Execution Safety"
    - _Requirements: 5.1, 5.2, 5.5_
  
  - [x] 6.2 Write property test for shell injection prevention
    - **Property 1: Shell Command Execution Safety**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
    - Generate arbitrary strings including `;`, `|`, `$()`, `` ` ``, `&`, `>`, `<`
    - Execute command with generated path using execFileAsync
    - Verify command treats path as literal string (no shell interpretation)
    - Handle expected errors (file not found) vs security errors
    - _Requirements: 5.1, 5.2_
  
  - [x] 6.3 Create test/security/property/jsdoc-parsing-property-tests.mjs
    - Import fast-check and parseParamTag function
    - Generate arbitrary bracket patterns
    - Verify correct parsing or graceful failure
    - Configure numRuns: 100
    - Tag: "Feature: security-fixes, Property 2: JSDoc Bracket Matching Correctness"
    - _Requirements: 5.3, 5.4, 5.5_
  
  - [x] 6.4 Write property test for bracket matching
    - **Property 2: JSDoc Bracket Matching Correctness**
    - **Validates: Requirements 2.1, 2.3**
    - Generate strings with nested brackets using fc.array()
    - Parse generated JSDoc type annotations
    - Verify correct bracket matching across all nesting levels
    - Verify parser returns valid result or null (never throws)
    - _Requirements: 5.3, 5.4_
  
  - [x] 6.5 Write property test for parser resilience
    - **Property 3: JSDoc Parser Resilience**
    - **Validates: Requirements 2.2, 2.4**
    - Generate malformed bracket patterns (unmatched, escaped)
    - Verify parser handles gracefully without errors or hangs
    - Verify parser returns null for unparseable input
    - _Requirements: 5.3, 5.4_
  
  - [x] 6.6 Write property test for backwards compatibility
    - **Property 6: Backwards Compatibility**
    - **Validates: Requirements 9.1, 9.2**
    - Generate valid file paths and JSDoc annotations
    - Compare output of new implementation vs expected behavior
    - Verify identical results for all valid inputs
    - _Requirements: 9.1, 9.2_

- [x] 7. Checkpoint - Verify all security tests pass
  - Run security test suite: `npm test -- test/security/`
  - Verify all property tests run 100+ iterations
  - Ensure all tests pass, ask the user if questions arise

- [x] 8. Add ESLint security rules
  - [x] 8.1 Create .eslintrc.json configuration file
    - Set up Node.js, ES2021, and Mocha environment
    - Extend eslint:recommended
    - Configure parserOptions for ES modules
    - _Requirements: 8.1, 8.2_
  
  - [x] 8.2 Add no-restricted-imports rule for shell commands
    - Restrict `exec` and `execSync` from child_process
    - Provide error message: "Use execFile or execFileSync instead of exec/execSync to prevent shell injection"
    - Include link to steering document in error message
    - _Requirements: 8.1, 8.4_
  
  - [x] 8.3 Add additional security rules
    - Add no-template-curly-in-string rule
    - Add no-eval rule
    - Add no-implied-eval rule
    - Add no-new-func rule
    - _Requirements: 8.2_
  
  - [x] 8.4 Configure overrides for all file types
    - Apply rules to test/**/*.mjs and test/**/*.js
    - Apply rules to scripts/**/*.mjs and scripts/**/*.js
    - Apply rules to src/**/*.js
    - _Requirements: 8.3_
  
  - [x] 8.5 Add ESLint npm scripts
    - Add "lint" script: "eslint ."
    - Add "lint:fix" script: "eslint . --fix"
    - Add "lint:ci" script: "eslint . --max-warnings 0"
    - _Requirements: 8.5_
  
  - [x] 8.6 Run ESLint on codebase
    - Execute `npm run lint` to check for violations
    - Fix any violations found (should be none after previous fixes)
    - Verify ESLint catches the old patterns if reintroduced
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 9. Create secure coding practices steering document
  - [x] 9.1 Create .kiro/steering/secure-coding-practices.md
    - Add document header and purpose
    - Add table of contents
    - _Requirements: 6.1_
  
  - [x] 9.2 Write shell command execution security section
    - Document Node.js execFile vs exec with examples
    - Document Python subprocess.run with shell=False
    - Provide secure patterns and anti-patterns
    - Include code examples with security comments
    - _Requirements: 6.6_
  
  - [x] 9.3 Write input validation section
    - Document file path validation techniques
    - Document user input sanitization
    - Explain allowlisting vs denylisting
    - Provide validation examples
    - _Requirements: 6.8_
  
  - [x] 9.4 Write string handling and escaping section
    - Document proper bracket matching techniques
    - Document handling special characters
    - Document regular expression security
    - Provide escaping examples
    - _Requirements: 6.7_
  
  - [x] 9.5 Write credential management section
    - Document AWS SSM Parameter Store usage with code examples
    - Document AWS Secrets Manager usage with code examples
    - Explicitly prohibit hardcoded credentials
    - Provide examples of secure credential retrieval
    - _Requirements: 6.4, 6.5_
  
  - [x] 9.6 Write security testing section
    - Document Jest security testing patterns
    - Document Hypothesis (Python) property-based testing
    - Provide security test examples for both frameworks
    - Include property-based testing for security properties
    - _Requirements: 6.2_
  
  - [x] 9.7 Write Lambda and CI/CD security section
    - Document Lambda function security best practices
    - Document CodeBuild script security
    - Document environment variable handling
    - Focus on backend development scenarios
    - _Requirements: 6.3_
  
  - [x] 9.8 Write security comment notation section
    - Document Markdown notation: `> comment`
    - Document YAML/Python notation: `# >! comment`
    - Document JavaScript notation: `// >! comment`
    - Provide examples of when to use security comments
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 10. Add security comments to fixed code
  - [x] 10.1 Add comments to shell command fixes
    - Add `// >! Use execFile to prevent shell interpretation` above execFileAsync calls
    - Add `// >! Arguments passed as array are not interpreted by shell` explaining array usage
    - _Requirements: 7.3, 7.4_
  
  - [x] 10.2 Add comments to JSDoc parser fixes
    - Add `// >! Find closing bracket by counting bracket depth` in bracket counting loop
    - Add `// >! Handle escaped brackets` in escape handling code
    - Add `// >! Unmatched brackets - handle gracefully` in error handling
    - _Requirements: 7.3, 7.4_
  
  - [x] 10.3 Add comments to security tests
    - Add comments explaining what each test validates
    - Add comments explaining security properties being tested
    - Add comments showing examples of attacks being prevented
    - _Requirements: 7.3, 7.4_

- [x] 11. Backwards compatibility verification
  - [x] 11.1 Run full existing test suite
    - Execute `npm test` to run all tests
    - Verify all tests pass without modification
    - Check for any unexpected failures or warnings
    - _Requirements: 9.3_
  
  - [x] 11.2 Test audit script with various inputs
    - Run audit script on actual codebase
    - Verify JSDoc parsing produces same results as before
    - Verify no regressions in documentation validation
    - _Requirements: 9.2_
  
  - [x] 11.3 Test executable example validation
    - Run executable example validation tests
    - Verify code examples are validated correctly
    - Verify no false positives or false negatives
    - _Requirements: 9.1_

- [x] 12. Final checkpoint and validation
  - Run complete test suite including new security tests
  - Run ESLint on entire codebase
  - Verify all security comments are in place
  - Review steering document for completeness
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Security fixes in tasks 1-3 are critical and must be completed
- ESLint rules (task 8) provide automated prevention of future issues
- Steering document (task 9) provides long-term security guidance
- All security-critical code should include security comments with `// >!` notation
- Property tests should run minimum 100 iterations to validate security properties
- Backwards compatibility (task 11) is critical - all existing tests must pass
