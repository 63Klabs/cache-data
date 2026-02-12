/**
 * Shell Command Security Tests
 * 
 * Tests that execFile prevents command injection with various malicious inputs.
 * These tests verify that file paths with shell metacharacters are treated as
 * literal strings and not interpreted by the shell.
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('Shell Command Security', () => {
	/**
	 * Security Property: execFile prevents shell interpretation
	 * 
	 * These tests verify that execFile treats file paths as literal strings,
	 * even when they contain shell metacharacters that would normally be
	 * interpreted by a shell.
	 */

	it('should handle file paths with spaces safely', async () => {
		// Security Test: File paths with spaces should be treated as literal strings
		// Remediation: Use execFile instead of exec to prevent shell interpretation
		const pathWithSpaces = '/tmp/test file with spaces.mjs';
		
		try {
			// This will fail with ENOENT (file not found), which is expected
			// The important thing is that it doesn't try to execute multiple commands
			await execFileAsync('node', ['--check', pathWithSpaces]);
			// If we get here, the file exists (unlikely), but that's OK
			// The test passes as long as no shell interpretation occurred
		} catch (error) {
			// Expected error: file not found (ENOENT) or syntax error (exit code 1)
			// Security violation would be: command not found or shell interpretation
			// Accept either ENOENT or exit code 1 (syntax error from node --check)
			const isExpectedError = error.code === 'ENOENT' || error.code === 1;
			expect(isExpectedError).to.be.true;
			expect(error.message).to.include(pathWithSpaces);
		}
	});

	it('should prevent command injection via semicolon', async () => {
		// Security Test: Semicolons should not act as command separators
		// Failing Input Example: /tmp/test.mjs; rm -rf /
		// Remediation: Use execFile which doesn't spawn a shell
		const maliciousPath = '/tmp/test.mjs; rm -rf /';
		
		try {
			await execFileAsync('node', ['--check', maliciousPath]);
		} catch (error) {
			// The entire string should be treated as a filename
			// If shell interpretation occurred, we'd see different error
			const isExpectedError = error.code === 'ENOENT' || error.code === 1;
			expect(isExpectedError).to.be.true;
			expect(error.message).to.include(maliciousPath);
		}
	});

	it('should prevent command injection via pipe', async () => {
		// Security Test: Pipes should not redirect output to other commands
		// Failing Input Example: /tmp/test.mjs | cat /etc/passwd
		// Remediation: Use execFile to prevent shell metacharacter interpretation
		const maliciousPath = '/tmp/test.mjs | cat /etc/passwd';
		
		try {
			await execFileAsync('node', ['--check', maliciousPath]);
		} catch (error) {
			// Pipe character should be part of filename, not a shell operator
			const isExpectedError = error.code === 'ENOENT' || error.code === 1;
			expect(isExpectedError).to.be.true;
			expect(error.message).to.include(maliciousPath);
		}
	});

	it('should prevent command injection via command substitution', async () => {
		// Security Test: Command substitution should not execute embedded commands
		// Failing Input Example: /tmp/test.mjs $(whoami)
		// Remediation: Use execFile which treats $() as literal characters
		const maliciousPath = '/tmp/test.mjs $(whoami)';
		
		try {
			await execFileAsync('node', ['--check', maliciousPath]);
		} catch (error) {
			// Command substitution should not execute
			const isExpectedError = error.code === 'ENOENT' || error.code === 1;
			expect(isExpectedError).to.be.true;
			expect(error.message).to.include(maliciousPath);
		}
	});

	it('should prevent command injection via backticks', async () => {
		// Security Test: Backticks should not execute embedded commands
		// Failing Input Example: /tmp/test.mjs `whoami`
		// Remediation: Use execFile which treats backticks as literal characters
		const maliciousPath = '/tmp/test.mjs `whoami`';
		
		try {
			await execFileAsync('node', ['--check', maliciousPath]);
		} catch (error) {
			// Backticks should not trigger command execution
			const isExpectedError = error.code === 'ENOENT' || error.code === 1;
			expect(isExpectedError).to.be.true;
			expect(error.message).to.include(maliciousPath);
		}
	});

	it('should handle file paths with quotes safely', async () => {
		// Security Test: Quotes should be treated as literal characters
		// Failing Input Example: /tmp/test"file.mjs or /tmp/test'file.mjs
		// Remediation: Use execFile to prevent quote interpretation
		const pathWithDoubleQuotes = '/tmp/test"file.mjs';
		const pathWithSingleQuotes = "/tmp/test'file.mjs";
		
		try {
			await execFileAsync('node', ['--check', pathWithDoubleQuotes]);
		} catch (error) {
			const isExpectedError = error.code === 'ENOENT' || error.code === 1;
			expect(isExpectedError).to.be.true;
			expect(error.message).to.include(pathWithDoubleQuotes);
		}
		
		try {
			await execFileAsync('node', ['--check', pathWithSingleQuotes]);
		} catch (error) {
			const isExpectedError = error.code === 'ENOENT' || error.code === 1;
			expect(isExpectedError).to.be.true;
			expect(error.message).to.include(pathWithSingleQuotes);
		}
	});

	it('should prevent command injection via ampersand', async () => {
		// Security Test: Ampersand should not run commands in background
		// Failing Input Example: /tmp/test.mjs & echo hacked
		// Remediation: Use execFile which doesn't interpret & as background operator
		const maliciousPath = '/tmp/test.mjs & echo hacked';
		
		try {
			await execFileAsync('node', ['--check', maliciousPath]);
		} catch (error) {
			// Ampersand should be part of filename, not a shell operator
			const isExpectedError = error.code === 'ENOENT' || error.code === 1;
			expect(isExpectedError).to.be.true;
			expect(error.message).to.include(maliciousPath);
		}
	});

	it('should prevent command injection via redirection', async () => {
		// Security Test: Redirection operators should not redirect output
		// Failing Input Example: /tmp/test.mjs > /tmp/output
		// Remediation: Use execFile which treats > and < as literal characters
		const maliciousPathOutput = '/tmp/test.mjs > /tmp/output';
		const maliciousPathInput = '/tmp/test.mjs < /tmp/input';
		
		try {
			await execFileAsync('node', ['--check', maliciousPathOutput]);
		} catch (error) {
			// Redirection should not occur
			const isExpectedError = error.code === 'ENOENT' || error.code === 1;
			expect(isExpectedError).to.be.true;
			expect(error.message).to.include(maliciousPathOutput);
		}
		
		try {
			await execFileAsync('node', ['--check', maliciousPathInput]);
		} catch (error) {
			const isExpectedError = error.code === 'ENOENT' || error.code === 1;
			expect(isExpectedError).to.be.true;
			expect(error.message).to.include(maliciousPathInput);
		}
	});
});
