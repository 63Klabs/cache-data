# Tests

Tests are divided into functional categories by directory.

## Install

The dev dependencies for cache-data must be installed:

```bash
npm install
```

## Running Tests

You can run all tests:

```bash
npm test
```

You can run tests for a single functional category:

```bash
npm run test:response
```

If a new functional area/directory is added, you can add it to the available tests in the package.json file:

```json
{
	"scripts": {
		"test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
		"test:cache": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/cache",
		"test:config": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/config",
		"test:endpoint": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/endpoint",
		"test:logging": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/logging",
		"test:request": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/request",
		"test:response": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/response",
		"test:utils": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/utils"
	}
}
```

Tests are automatically run using a GitHub action before publishing a new version to NPM. If the tests fail, the package will not be published.

## Creating New Tests

The `jest` and `fast-check` packages are used for testing.

Add new tests to their respective functional folder.

Since the test script will run all scripts matching the `*.jest.mjs` format, any test scripts must have `.jest.mjs` added to the end of the file name.

## Capturing Console Logs

To capture console output you can use Jest's built-in spying.

Define the console variables to capture and activate `beforeEach` and deactivate `afterEach`.

```javascript
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe("Inspect Console", () => {

	let logSpy, warnSpy, errorSpy;

	beforeEach(() => {
		logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
		warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
		errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("Logs", async () => {
		// Call the log function
		console.log("My Object", "LOG", obj);

		// Verify that log was actually called
		expect(logSpy).toHaveBeenCalled();

		// Get all calls and their arguments
		const calls = logSpy.mock.calls;
		expect(calls.length).toBeGreaterThan(0);

		// Get the log output from the first call
		const logOutput = calls[0].join(' ')
			.replace(/\u001b\[\d+m/g, '') // remove colorization of console text
			.trim();

		// Your assertions
		expect(logOutput).toContain("My Object");
	});
});
```
