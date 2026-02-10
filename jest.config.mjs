/**
 * Jest Configuration for @63klabs/cache-data
 * 
 * This configuration supports ESM (ECMAScript Modules) and runs Jest tests
 * in parallel with Mocha tests during the migration period.
 * 
 * Test File Pattern: *.jest.mjs
 * Coverage Directory: coverage-jest (separate from Mocha coverage)
 */
export default {
	// Use Node.js environment for testing (not browser/jsdom)
	testEnvironment: 'node',

	// Match only Jest test files (*.jest.mjs pattern)
	// This allows Mocha and Jest tests to coexist in the same directories
	testMatch: ['**/test/**/*.jest.mjs'],

	// Disable transforms - we're using native ESM
	transform: {},

	// Module name mapper for ESM imports
	// Allows imports without .js extension to resolve correctly
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},

	// Coverage configuration
	coverageDirectory: 'coverage-jest',
	collectCoverageFrom: [
		'src/**/*.js',
		'!src/**/*.test.js',
	],
	coverageReporters: ['text', 'lcov', 'html'],

	// Test environment options
	testTimeout: 30000, // 30 second timeout for tests

	// Verbose output for better debugging
	verbose: true,

	// Clear mocks between tests to prevent test pollution
	clearMocks: true,
	restoreMocks: true,
};
