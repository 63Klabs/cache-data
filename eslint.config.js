import js from '@eslint/js';

export default [
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				// Node.js globals
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				exports: 'writable',
				module: 'writable',
				require: 'readonly',
				global: 'readonly',
				// Mocha globals
				describe: 'readonly',
				it: 'readonly',
				before: 'readonly',
				after: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
				// ES2021 globals
				globalThis: 'readonly'
			}
		},
		rules: {
			'no-template-curly-in-string': 'error',
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error'
		}
	},
	{
		files: ['test/**/*.mjs', 'test/**/*.js', 'scripts/**/*.mjs', 'scripts/**/*.js', 'src/**/*.js'],
		rules: {
			'no-restricted-imports': ['error', {
				patterns: [{
					group: ['child_process'],
					importNames: ['exec', 'execSync'],
					message: 'Use execFile or execFileSync instead of exec/execSync to prevent shell injection. See .kiro/steering/secure-coding-practices.md'
				}]
			}]
		}
	},
	{
		ignores: ['node_modules/**', 'coverage/**', 'coverage-jest/**', '.git/**']
	}
];
