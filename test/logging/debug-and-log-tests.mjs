import { expect } from 'chai';
import { DebugAndLog } from '../../src/lib/tools/index.js'

import sinon from 'sinon';

let originalEnv = { ...process.env };
let logStub, warnStub, errorStub, msgStub, debugStub;

const beforeEachEnvVars = function() {
	// clear out environment and log environment variables
	DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.forEach(v => delete process.env[v]);
	DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
	delete(process.env.NODE_ENV);

	logStub = sinon.stub(console, 'log');
	warnStub = sinon.stub(console, 'warn');
	errorStub = sinon.stub(console, 'error');
	msgStub = sinon.stub(console, 'info');
	debugStub = sinon.stub(console, 'debug');
}

const afterEachEnvVars = function() {
	// clear out environment and log environment variables
	DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.forEach(v => delete process.env[v]);
	DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
	delete(process.env.NODE_ENV);

	// Restore the original environment variables
	process.env = originalEnv;

	logStub.restore();
	warnStub.restore();
	errorStub.restore();
	msgStub.restore();
	debugStub.restore();
}

describe("DebugAndLog tests", () => {

	beforeEach(() => {
		beforeEachEnvVars();	
	});
	
	afterEach(() => {
		afterEachEnvVars();
	});

	describe('Check the defaults', () => {
		it('Check the default log level for NODE_ENV production and no ENV_TYPE vars', () => {
			process.env.NODE_ENV = "production";
			expect(DebugAndLog.getLogLevel()).to.equal(2)
		})

		it('Check the default log level for NODE_ENV development and no ENV_TYPE vars', () => {
			process.env.NODE_ENV = "development";
			expect(DebugAndLog.getLogLevel()).to.equal(2)
		})

		it('Check the default log level for NODE_ENV (not set) and no ENV_TYPE vars', () => {
			process.env.NODE_ENV = "";
			expect(DebugAndLog.getLogLevel()).to.equal(2)
		})

		it('Get the default environment', () => {
			process.env.NODE_ENV = "";
			console.log("HI "+DebugAndLog.getEnv());
			expect(DebugAndLog.getEnv()).to.equal("PROD")
		})
	});

	describe('Check default environment booleans', () => {
		it('Check isNotProduction', () => {
			expect(DebugAndLog.isNotProduction()).to.equal(false)
		})

		it('Check isProduction', () => {
			expect(DebugAndLog.isProduction()).to.equal(true)
		})

		it('Check isDevelopment', () => {
			expect(DebugAndLog.isDevelopment()).to.equal(false)
		})

		it('Check isTest', () => {
			expect(DebugAndLog.isTest()).to.equal(false)
		})
	});

	describe('Check NODE_ENV booleans', () => {

		it('Check nodeEnvIsProduction with NODE_ENV not set', () => {
			process.env.NODE_ENV = "";
			expect(DebugAndLog.nodeEnvIsProduction()).to.equal(true);
		})

		it('Check nodeEnvIsDevelopment with NODE_ENV not set', () => {
			process.env.NODE_ENV = "";
			expect(DebugAndLog.nodeEnvIsDevelopment()).to.equal(false);
		})	

		it('Check nodeEnvIsProduction with NODE_ENV=production', () => {
			process.env.NODE_ENV = "production";
			expect(DebugAndLog.nodeEnvIsProduction()).to.equal(true);
		})

		it('Check nodeEnvIsDevelopment with NODE_ENV=production', () => {
			process.env.NODE_ENV = "production";
			expect(DebugAndLog.nodeEnvIsDevelopment()).to.equal(false);
		})	

		it('Check nodeEnvIsProduction with NODE_ENV=development', () => {
			process.env.NODE_ENV = "development";
			expect(DebugAndLog.nodeEnvIsProduction()).to.equal(false);
		})

		it('Check nodeEnvIsDevelopment with NODE_ENV=development', () => {
			process.env.NODE_ENV = "development";
			expect(DebugAndLog.nodeEnvIsDevelopment()).to.equal(true);
		})

	})

	describe('Check environment booleans', () => {

		// --- DEV

		it('Check isNotProduction in DEV', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "DEV";
			expect(DebugAndLog.isNotProduction()).to.equal(true)
		})

		it('Check isProduction in DEV', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "DEV";
			expect(DebugAndLog.isProduction()).to.equal(false)
		})

		it('Check isDevelopment in DEV', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "DEV";
			expect(DebugAndLog.isDevelopment()).to.equal(true)
		})

		it('Check isTest in DEV', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "DEV";
			expect(DebugAndLog.isTest()).to.equal(false)
		})

		// --- TEST

		it('Check isNotProduction in TEST', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "TEST";
			expect(DebugAndLog.isNotProduction()).to.equal(true)
		})

		it('Check isProduction in TEST', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "TEST";
			expect(DebugAndLog.isProduction()).to.equal(false)
		})

		it('Check isDevelopment in TEST', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "TEST";
			expect(DebugAndLog.isDevelopment()).to.equal(false)
		})

		it('Check isTest in TEST', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "TEST";
			expect(DebugAndLog.isTest()).to.equal(true)
		})

		// --- PROD

		it('Check isNotProduction in PROD', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "PROD";
			expect(DebugAndLog.isNotProduction()).to.equal(false)
		})

		it('Check isProduction in PROD', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "PROD";
			expect(DebugAndLog.isProduction()).to.equal(true)
		})

		it('Check isDevelopment in PROD', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "PROD";
			expect(DebugAndLog.isDevelopment()).to.equal(false)
		})

		it('Check isTest in PROD', () => {
			process.env.NODE_ENV = "development";
			process.env.ENV_TYPE = "PROD";
			expect(DebugAndLog.isTest()).to.equal(false)
		})

	});

	describe("Check logging", () => {

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
describe("DebugAndLog environment type tests", () => {
	
	beforeEach(() => {
		beforeEachEnvVars();
	});
	
	afterEach(() => {
		afterEachEnvVars();
	});
	
	DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.forEach((varName) => {
		it(`Test with ${varName} set to 'DEV'`, () => {
			process.env[varName] = 'DEV';
			expect(DebugAndLog.getEnv()).to.equal('DEV');
			expect(DebugAndLog.isDevelopment()).to.equal(true);
			expect(DebugAndLog.isTest()).to.equal(false);
			expect(DebugAndLog.isProduction()).to.equal(false);
			expect(DebugAndLog.getLogLevel()).to.equal(2);
		});

		it(`Test with ${varName} set to 'TEST'`, () => {
			process.env[varName] = 'TEST';
			expect(DebugAndLog.getEnv()).to.equal('TEST');
			expect(DebugAndLog.isDevelopment()).to.equal(false);
			expect(DebugAndLog.isTest()).to.equal(true);
			expect(DebugAndLog.isProduction()).to.equal(false);
			expect(DebugAndLog.getLogLevel()).to.equal(2);
		});
		
		it(`Test with ${varName} set to 'PROD'`, () => {
			process.env[varName] = 'PROD';
			expect(DebugAndLog.getEnv()).to.equal('PROD');
			expect(DebugAndLog.isDevelopment()).to.equal(false);
			expect(DebugAndLog.isTest()).to.equal(false);
			expect(DebugAndLog.isProduction()).to.equal(true);
			expect(DebugAndLog.getLogLevel()).to.equal(2);
		});
	})
});

describe("DebugAndLog environment and log level tests", () => {

	beforeEach(() => {
		beforeEachEnvVars();
		process.env.NODE_ENV = "development";
	});
	
	afterEach(() => {
		afterEachEnvVars();
	});

	// do first 4 DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES
	const testVarNames = DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.slice(0, 3);

	for (let i = 0; i<=5; i++) {
		testVarNames.forEach((varName) => {
			it(`Set logLevel to ${i} with ${varName} set to 'DEV'`, () => {
				process.env[varName] = 'DEV';
				process.env.LOG_LEVEL = i;
				expect(DebugAndLog.getEnv()).to.equal('DEV');
				expect(DebugAndLog.isDevelopment()).to.equal(true);
				expect(DebugAndLog.isTest()).to.equal(false);
				expect(DebugAndLog.isProduction()).to.equal(false);
				expect(DebugAndLog.getLogLevel()).to.equal(i);
			});

			it(`Set logLevel to ${i} with ${varName} set to 'TEST'`, () => {
				process.env[varName] = 'TEST';
				process.env.LOG_LEVEL = i;
				expect(DebugAndLog.getEnv()).to.equal('TEST');
				expect(DebugAndLog.isDevelopment()).to.equal(false);
				expect(DebugAndLog.isTest()).to.equal(true);
				expect(DebugAndLog.isProduction()).to.equal(false);
				expect(DebugAndLog.getLogLevel()).to.equal(i);
			});
			
			it(`Set logLevel to ${i} with ${varName} set to 'PROD'`, () => {
				process.env[varName] = 'PROD';
				process.env.LOG_LEVEL = i;
				expect(DebugAndLog.getEnv()).to.equal('PROD');
				expect(DebugAndLog.isDevelopment()).to.equal(false);
				expect(DebugAndLog.isTest()).to.equal(false);
				expect(DebugAndLog.isProduction()).to.equal(true);
				expect(DebugAndLog.getLogLevel()).to.be.lessThan(3);
			});
		})

	}
});

describe("DebugAndLog complex environment tests", () => {
	beforeEach(() => {
		beforeEachEnvVars();
	});
	
	afterEach(() => {
		afterEachEnvVars();
	});
	
	// get first 4 elements from DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES
	const testVarNames = DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.slice(0, 3);
	const testEnvTypes = ["PROD", "TEST", "DEV"];
	const testNodeEnvs = ["production", "development", "empty"]

	// loop through each of the environment variables and set them all to DEV, TEST, PROD and "" with NODE_ENV set to production and development
	testVarNames.forEach((varName) => {
		testEnvTypes.forEach((envType) => {
			testNodeEnvs.forEach((nodeEnv) => {
				it(`Test with env var ${varName}='${envType}' and NODE_ENV=${nodeEnv}`, () => {
					process.env.NODE_ENV = nodeEnv;
					process.env[varName] = envType;
					expect(DebugAndLog.getEnv()).to.equal(envType);
				});
			})
		})
	})
});

// Test DebugAndLog.getLogLevel() using various environment variables such as LOG_LEVEL and AWS_LAMBDA_LOG_LEVEL
describe("DebugAndLog log level environment variable tests", () => {
	beforeEach(() => {
		beforeEachEnvVars();
		process.env.NODE_ENV = "development";
		process.env.ENV_TYPE = "TEST";
	});
	
	afterEach(() => {
		afterEachEnvVars();
	});

	const testLogLevelVars = DebugAndLog.ALLOWED_LOG_VAR_NAMES.slice(0, 3);
	// remove the "AWS_LAMBDA_LOG_LEVEL" since it doesn't use a number
	testLogLevelVars.splice(testLogLevelVars.indexOf("AWS_LAMBDA_LOG_LEVEL"), 1);

	const testLevels = [5, 4, 3, 2, 1, 0];
	const awsLambdaLogLevels = [
		["ERROR", DebugAndLog.ERROR_LEVEL_NUM],
		["WARN", DebugAndLog.WARN_LEVEL_NUM],
		["INFO", DebugAndLog.INFO_LEVEL_NUM],
		["DEBUG", DebugAndLog.DEBUG_LEVEL_NUM]];

	testLogLevelVars.forEach((varName) => {
		testLevels.forEach((level) => {
			it(`Test with ${varName} set to '${level}'`, () => {
				process.env[varName] = `${level}`;
				process.env.ENV_TYPE = "TEST";
				expect(DebugAndLog.getLogLevel()).to.equal(level);
			});
		})

		it(`Test with ${varName} invalid`, () => {
			process.env[varName] = 'invalid';
			expect(DebugAndLog.getLogLevel()).to.equal(2);
		});	

		it(`Test with ${varName} empty`, () => {
			process.env[varName] = '';
			expect(DebugAndLog.getLogLevel()).to.equal(2);
		});	

		it(`Test with ${varName} unset`, () => {
			delete process.env[varName];
			expect(DebugAndLog.getLogLevel()).to.equal(2);
		});
	})

	it(`Test with both LOG_LEVEL=3 and AWS_LAMBDA_LOG_LEVEL=ERROR set. LOG_LEVEL has priority.`, () => {
		process.env.LOG_LEVEL = '3';
		process.env.AWS_LAMBDA_LOG_LEVEL = 'ERROR';
		expect(DebugAndLog.getLogLevel()).to.equal(3);
	});

	it(`Test with both LOG_LEVEL=invalid and AWS_LAMBDA_LOG_LEVEL=DEBUG set`, () => {
		process.env.LOG_LEVEL = 'invalid';
		process.env.AWS_LAMBDA_LOG_LEVEL = 'DEBUG';
		expect(DebugAndLog.getLogLevel()).to.equal(5);
	});

	it(`Test with both LOG_LEVEL and AWS_LAMBDA_LOG_LEVEL unset`, () => {
		delete process.env.LOG_LEVEL;
		delete process.env.AWS_LAMBDA_LOG_LEVEL;
		expect(DebugAndLog.getLogLevel()).to.equal(2);
	});

	it(`Test with both LOG_LEVEL=invalid and AWS_LAMBDA_LOG_LEVEL=invalid set`, () => {
		process.env.LOG_LEVEL = 'invalid';
		process.env.AWS_LAMBDA_LOG_LEVEL = 'invalid';
		expect(DebugAndLog.getLogLevel()).to.equal(2);
	});

	// test AWS_LAMBDA_LOG_LEVEL with values DEBUG, INFO, WARN, ERROR
	awsLambdaLogLevels.forEach((level) => {
		it(`Test with AWS_LAMBDA_LOG_LEVEL=${level[0]} set`, () => {
			process.env.AWS_LAMBDA_LOG_LEVEL = level[0];
			expect(DebugAndLog.getLogLevel()).to.equal(level[1]);
		});		
	})
});
