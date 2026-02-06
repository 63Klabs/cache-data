export default {
	testEnvironment: 'node',
	testMatch: ['**/test/**/*.jest.mjs'],
	transform: {},
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	coverageDirectory: 'coverage-jest',
	collectCoverageFrom: [
		'src/**/*.js',
		'!src/**/*.test.js',
	],
};
