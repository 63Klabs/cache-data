import { expect } from 'chai';
import { DebugAndLog } from '../../src/lib/tools/index.js'

import sinon from 'sinon';

// we will be testing environment variables on a static class
const modulePath = new URL('../../src/lib/tools/DebugAndLog.class.js', import.meta.url).href;
const runTestCode = function (testCode) {
	try {
		execSync(`node --input-type=module -e "${testCode}"`);
	} catch (error) {
		if (error.status !== 0) throw new Error('Test failed');
	}
}

describe("DebugAndLog tests", () => {

	describe('Check the defaults', () => {
		it('Check the default log level', async () => {
			expect(DebugAndLog.getLogLevel()).to.equal(0)
		})

		it('Get the default environment', async () => {
			expect(DebugAndLog.getEnv()).to.equal("PROD")
		})
	});

	describe('Check environment booleans', () => {
		it('Check isNotProduction', async () => {
			expect(DebugAndLog.isNotProduction()).to.equal(false)
		})

		it('Check isProduction', async () => {
			expect(DebugAndLog.isProduction()).to.equal(true)
		})

		it('Check isDevelopment', async () => {
			expect(DebugAndLog.isDevelopment()).to.equal(false)
		})

		it('Check isTest', async () => {
			expect(DebugAndLog.isTest()).to.equal(false)
		})
	});

	describe("Check logging", () => {
		let logStub, warnStub, errorStub;

		// Setup spies before each test
		beforeEach(() => {
			logStub = sinon.stub(console, 'log');
			warnStub = sinon.stub(console, 'warn');
			errorStub = sinon.stub(console, 'error');
		});

		// Clean up spies after each test
		afterEach(() => {
			logStub.restore();
			warnStub.restore();
			errorStub.restore();
		});

		it('Check Errors and Warnings', () => {
			// Run your code that generates logs
			DebugAndLog.log("1. Test Foo");
			DebugAndLog.log("2. Test Bar");
			DebugAndLog.warn("3. Test warn");
			DebugAndLog.error("4. Test error");
			DebugAndLog.debug("5. Test Debug");
			DebugAndLog.message("6. Test Info");
			DebugAndLog.diag("7. Test diagnostics");

			// Get logs without ANSI color codes
			const logs = logStub.getCalls()
				.map(call => call.args.join(' ').replace(/\u001b\[\d+m/g, '').trim());
			
			const warnings = warnStub.getCalls()
				.map(call => call.args.join(' ').replace(/\u001b\[\d+m/g, '').trim());
			
			const errors = errorStub.getCalls()
				.map(call => call.args.join(' ').replace(/\u001b\[\d+m/g, '').trim());

			// Assertions
			expect(logs[0]).to.equal("[LOG] 1. Test Foo");
			expect(logs[1]).to.equal("[LOG] 2. Test Bar");
			expect(warnings[0]).to.equal("[WARN] 3. Test warn");
			expect(errors[0]).to.equal("[ERROR] 4. Test error");

			// You can also check how many times each method was called
			expect(logStub.callCount).to.equal(2);
			expect(warnStub.callCount).to.equal(1);
			expect(errorStub.callCount).to.equal(1);
		});
	});

});

/* Test DebugAndLog.getEnv() using various environment variables such as
"deploy_environment", "env", "deployEnvironment", "environment", "stage"
and also test the LOG_LEVEL and AWS_LAMBDA_LOG_LEVEL environment variables
also ensuring that the DebugAndLog.getDefaultLogLevel() is always 0 if
the .getEnv() returns PROD
*/
describe("DebugAndLog environment tests", () => {
	let originalEnv;
	
	beforeEach(() => {
		// Save the original environment variables
		originalEnv = { ...process.env };

		// clear out environment and log environment variables
		DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => delete process.env[v]);
		DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
		delete(process.env.NODE_ENV);
	}
	);
	
	afterEach(() => {
		// clear out environment and log environment variables
		DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => delete process.env[v]);
		DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
		delete(process.env.NODE_ENV);

		// Restore the original environment variables
		process.env = originalEnv;
	}
	);
	
	DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach((varName) => {
		it(`Test with ${varName} set to 'DEV'`, () => {
			process.env[varName] = 'DEV';
			expect(DebugAndLog.getEnv()).to.equal('DEV');
			expect(DebugAndLog.isDevelopment()).to.equal(true);
			expect(DebugAndLog.isTest()).to.equal(false);
			expect(DebugAndLog.isProduction()).to.equal(false);
			expect(DebugAndLog.getLogLevel()).to.equal(0);
		});

		it(`Test with ${varName} set to 'TEST'`, () => {
			process.env[varName] = 'TEST';
			expect(DebugAndLog.getEnv()).to.equal('TEST');
			expect(DebugAndLog.isDevelopment()).to.equal(false);
			expect(DebugAndLog.isTest()).to.equal(true);
			expect(DebugAndLog.isProduction()).to.equal(false);
			expect(DebugAndLog.getLogLevel()).to.equal(0);
		});
		
		it(`Test with ${varName} set to 'PROD'`, () => {
			process.env[varName] = 'PROD';
			expect(DebugAndLog.getEnv()).to.equal('PROD');
			expect(DebugAndLog.isDevelopment()).to.equal(false);
			expect(DebugAndLog.isTest()).to.equal(false);
			expect(DebugAndLog.isProduction()).to.equal(true);
			expect(DebugAndLog.getLogLevel()).to.equal(0);
		});
	})
});

describe("DebugAndLog environment and log level tests", () => {
	let originalEnv;
	let logStub, warnStub, errorStub, msgStub;

	beforeEach(() => {
		// Save the original environment variables
		originalEnv = { ...process.env };

		// clear out environment and log environment variables
		DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => delete process.env[v]);
		DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
		delete(process.env.NODE_ENV);

		// use sinon to remove any console output
		logStub = sinon.stub(console, 'log');
		warnStub = sinon.stub(console, 'warn');
		errorStub = sinon.stub(console, 'error');
		msgStub = sinon.stub(console, 'info');

	}
	);
	
	afterEach(() => {
		// clear out environment and log environment variables
		DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => delete process.env[v]);
		DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
		delete(process.env.NODE_ENV);

		// Restore the original environment variables
		process.env = originalEnv;

		// restore console output
		logStub.restore();
		warnStub.restore();
		errorStub.restore();
		msgStub.restore();
	});

	for (let i = 0; i<=5; i++) {
		DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach((varName) => {
			it(`Test set logLevel to ${i} with ${varName} set to 'DEV'`, () => {
				// process.env[varName] = 'DEV';
				// DebugAndLog.setLogLevel(i);
				// expect(DebugAndLog.getEnv()).to.equal('DEV');
				// expect(DebugAndLog.isDevelopment()).to.equal(true);
				// expect(DebugAndLog.isTest()).to.equal(false);
				// expect(DebugAndLog.isProduction()).to.equal(false);
				// expect(DebugAndLog.getLogLevel()).to.equal(i);
				const expected = "DEV";
				const testCode = `
					process.env.${varName} = '${expected}';
					process.env.CACHE_DATA_LOG_LEVEL = ${i};
					const DebugAndLog = await import('${modulePath}');

					if (
						DebugAndLog.getEnv() === '${expected}'
						&& DebugAndLog.isDevelopment() === true
						&& DebugAndLog.isTest() === false
						&& DebugAndLog.isProduction()) === false
						&& DebugAndLog.getLogLevel() === ${i}
					) process.exit(0); else process.exit(1);
				`;
				runTestCode(testCode);
			});

		// 	it(`Test set logLevel to ${i} with ${varName} set to 'TEST'`, () => {
		// 		process.env[varName] = 'TEST';
		// 		DebugAndLog.setLogLevel(i);
		// 		expect(DebugAndLog.getEnv()).to.equal('TEST');
		// 		expect(DebugAndLog.isDevelopment()).to.equal(false);
		// 		expect(DebugAndLog.isTest()).to.equal(true);
		// 		expect(DebugAndLog.isProduction()).to.equal(false);
		// 		expect(DebugAndLog.getLogLevel()).to.equal(i);
		// 	});
			
		// 	it(`Test set logLevel to ${i} with ${varName} set to 'PROD'`, () => {
		// 		process.env[varName] = 'PROD';
		// 		DebugAndLog.setLogLevel(i);
		// 		expect(DebugAndLog.getEnv()).to.equal('PROD');
		// 		expect(DebugAndLog.isDevelopment()).to.equal(false);
		// 		expect(DebugAndLog.isTest()).to.equal(false);
		// 		expect(DebugAndLog.isProduction()).to.equal(true);
		// 		expect(DebugAndLog.getLogLevel()).to.equal(0);
		// 	});
		})

	}
});

// describe("DebugAndLog complex environment tests", () => {
// 	let originalEnv;
// 	beforeEach(() => {
// 		// Save the original environment variables
// 		originalEnv = { ...process.env };

// 		// clear out environment and log environment variables
// 		DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => delete process.env[v]);
// 		DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
// 		delete(process.env.NODE_ENV);
// 	});

// 	afterEach(() => {

// 		// clear out environment and log environment variables
// 		DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => delete process.env[v]);
// 		DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
// 		delete(process.env.NODE_ENV);

// 		// Restore the original environment variables
// 		process.env = originalEnv;
// 	});
	
// 	// loop through each of the environment variables and set them all to DEV, TEST, PROD and "" with NODE_ENV set to production and development
// 	DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach((varName) => {
// 		it(`Test with env var ${varName}='DEV' and NODE_ENV=production`, () => {
// 			const expected = "DEV";
// 			const testCode = `
// 				process.env.NODE_ENV = "production";
// 				const DebugAndLog = await import('${modulePath}');
// 				console.log(process.env);
// 				DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => process.env[v] = "${expected}");
// 				if (DebugAndLog.getEnv() === ${expected}) process.exit(0); else process.exit(1);`;
// 			runTestCode(testCode);
// 		});
// 		it(`Test with env var ${varName}='TEST' and NODE_ENV=production`, () => {
// 			process.env.NODE_ENV = "production";
// 			DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => process.env[v] = "TEST");
// 			expect(DebugAndLog.getEnv()).to.equal("TEST");
// 		});
// 		it(`Test with env var ${varName}='PROD' and NODE_ENV=production`, () => {
// 			process.env.NODE_ENV = "production";
// 			DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => process.env[v] = "PROD");
// 			expect(DebugAndLog.getEnv()).to.equal("PROD");
// 		});
// 		it(`Test with env var ${varName}='PROD' and NODE_ENV=development`, () => {
// 			process.env.NODE_ENV = "development";
// 			DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => process.env[v] = "PROD");
// 			expect(DebugAndLog.getEnv()).to.equal("PROD");
// 		});
// 		it(`Test with env var ${varName}='' and NODE_ENV=production`, () => {
// 			process.env.NODE_ENV = "production";
// 			DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => process.env[v] = "");
// 			expect(DebugAndLog.getEnv()).to.equal("PROD");
// 		});
// 		it(`Test with env var ${varName}='' and NODE_ENV=development`, () => {
// 			process.env.NODE_ENV = "development";
// 			DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => process.env[v] = "");
// 			expect(DebugAndLog.getEnv()).to.equal("DEV");
// 		});
// 	})
// });

// // Test DebugAndLog.getLogLevel() using various environment variables such as LOG_LEVEL and AWS_LAMBDA_LOG_LEVEL
// // ensuring that LOG_LEVEL has priority over AWS_LAMBDA_LOG_LEVEL
// describe("DebugAndLog log level environment variable tests", () => {
// 	let originalEnv;
// 	beforeEach(() => {
// 		// Save the original environment variables
// 		originalEnv = { ...process.env };

// 		// clear out environment and log environment variables
// 		DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => delete process.env[v]);
// 		DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
// 		delete(process.env.NODE_ENV);

// 	});
	
// 	afterEach(() => {
// 		// clear out environment and log environment variables
// 		DebugAndLog.ALLOWED_ENV_VAR_NAMES.forEach(v => delete process.env[v]);
// 		DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
// 		delete(process.env.NODE_ENV);

// 		// Restore the original environment variables
// 		process.env = originalEnv;
// 	});

// 	DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach((varName) => {
// 		it(`Test with ${varName} set to '0'`, () => {

// 			const expected = 0;
// 			const testCode = `
// 				process.env.DEPLOY_ENVIRONMENT = 'TEST';
// 				process.env.${varName} = '${expected}';
// 				const DebugAndLog = await import('${modulePath}');
// 				if (DebugAndLog.getLogLevel() === ${expected}) process.exit(0); else process.exit(1);`;
// 			runTestCode(testCode);
// 		});
		
// 		it(`Test with ${varName} set to '1'`, () => {
// 			process.env[varName] = '1';
// 			console.log(DebugAndLog.getEnv());
// 			expect(DebugAndLog.getLogLevel()).to.equal(1);
// 		}
// 		);
// 		it(`Test with ${varName} set to '2'`, () => {
// 			process.env[varName] = '2';
// 			expect(DebugAndLog.getLogLevel()).to.equal(2);
// 		}
// 		);
// 		it(`Test with ${varName} set to '3'`, () => {
// 			process.env[varName] = '3';
// 			expect(DebugAndLog.getLogLevel()).to.equal(3);
// 		}
// 		);
// 		it(`Test with ${varName} set to '4'`, () => {
// 			process.env[varName] = '4';
// 			expect(DebugAndLog.getLogLevel()).to.equal(4);
// 		}
// 		);
// 		it(`Test with ${varName} set to '5'`, () => {
// 			process.env[varName] = '5';
// 			expect(DebugAndLog.getLogLevel()).to.equal(5);
// 		}
// 		);
// 		it(`Test with ${varName} set to 'invalid'`, () => {
// 			process.env[varName] = 'invalid';
// 			expect(DebugAndLog.getLogLevel()).to.equal(0);
// 		}
// 		);
// 		it(`Test with ${varName} unset`, () => {
// 			delete process.env[varName];
// 			expect(DebugAndLog.getLogLevel()).to.equal(0);
// 		}
// 		);
// 	})
// 	it(`Test with both LOG_LEVEL=3 and AWS_LAMBDA_LOG_LEVEL=ERROR set`, () => {
// 		process.env.LOG_LEVEL = '3';
// 		process.env.AWS_LAMBDA_LOG_LEVEL = 'ERROR';
// 		expect(DebugAndLog.getLogLevel()).to.equal(3);
// 	}
// 	);
// 	it(`Test with both LOG_LEVEL=invalid and AWS_LAMBDA_LOG_LEVEL=DEBUG set`, () => {
// 		process.env.LOG_LEVEL = 'invalid';
// 		process.env.AWS_LAMBDA_LOG_LEVEL = 'DEBUG';
// 		expect(DebugAndLog.getLogLevel()).to.equal(5);
// 	}
// 	);
// 	it(`Test with both LOG_LEVEL and AWS_LAMBDA_LOG_LEVEL unset`, () => {
// 		delete process.env.LOG_LEVEL;
// 		delete process.env.AWS_LAMBDA_LOG_LEVEL;
// 		expect(DebugAndLog.getLogLevel()).to.equal(0);
// 	}
// 	);
// 	it(`Test with both LOG_LEVEL=invalid and AWS_LAMBDA_LOG_LEVEL=invalid set`, () => {
// 		process.env.LOG_LEVEL = 'invalid';
// 		process.env.AWS_LAMBDA_LOG_LEVEL = 'invalid';
// 		expect(DebugAndLog.getLogLevel()).to.equal(0);
// 	}
// 	);

// 	// test AWS_LAMBDA_LOG_LEVEL with values DEBUG, INFO, WARN, ERROR
// 	it(`Test with AWS_LAMBDA_LOG_LEVEL=DEBUG set`, () => {
// 		process.env.AWS_LAMBDA_LOG_LEVEL = 'DEBUG';
// 		expect(DebugAndLog.getLogLevel()).to.equal(5);
// 	});
// 	it(`Test with AWS_LAMBDA_LOG_LEVEL=INFO set`, () => {
// 		process.env.AWS_LAMBDA_LOG_LEVEL = 'INFO';
// 		expect(DebugAndLog.getLogLevel()).to.equal(3);
// 	});
// 	it(`Test with AWS_LAMBDA_LOG_LEVEL=WARN set`, () => {
// 		process.env.AWS_LAMBDA_LOG_LEVEL = 'WARN';
// 		expect(DebugAndLog.getLogLevel()).to.equal(0);
// 	});
// 	it(`Test with AWS_LAMBDA_LOG_LEVEL=ERROR set`, () => {
// 		process.env.AWS_LAMBDA_LOG_LEVEL = 'ERROR';
// 		expect(DebugAndLog.getLogLevel()).to.equal(0);
// 	});
// });
