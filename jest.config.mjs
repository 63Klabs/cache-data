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

	// Suite-wide fast-check seeding from the FC_SEED environment variable.
	// Must be setupFilesAfterEnv, NOT setupFiles: setupFiles runs in a module
	// registry the test files do not share, so fc.configureGlobal() there mutates
	// a different fast-check instance than the one a test file imports and never
	// reaches fc.assert. setupFilesAfterEnv loads into the test file's own
	// registry, where the global configuration does apply.
	// See test/setup/fast-check-seed.mjs and
	// .kiro/specs/1-4-0-property-test-generator-preconditions/design.md § F
	setupFilesAfterEnv: ['<rootDir>/test/setup/fast-check-seed.mjs'],

	// Module name mapper for ESM imports
	// Allows imports without .js extension to resolve correctly
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},

	// Coverage configuration
	coverageProvider: 'v8',
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
