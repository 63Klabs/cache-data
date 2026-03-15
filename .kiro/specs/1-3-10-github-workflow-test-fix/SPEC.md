# GitHub Workflow Test Fix

The `.github/workflows/test.yml` is failing in the matrix for Node 24. Node 20 and Node 22 pass.

The run tests with coverage fails. 

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.

Execution logs:

```
 npm test -- --coverage
  shell: /usr/bin/bash -e {0}

> @63klabs/cache-data@1.3.10 test
> node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage

  console.log
    
      Testing connections...

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:179:14

  console.log
        Running Jest tests for connections...

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:182:14

(node:6457) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
FAIL test/request/property/api-request-retry-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

(node:6455) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
  console.log
        Jest: 0 passed, 0 failed, 0 total

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:184:14

  console.log
    
      Testing debug-and-log...

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:179:14

  console.log
        Running Jest tests for debug-and-log...

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:182:14

  console.log
        Jest: 0 passed, 0 failed, 0 total

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:184:14

  console.log
    
      Testing connections...

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:179:14

  console.log
        Running Jest tests for connections...

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:182:14

  console.log
        Jest: 0 passed, 0 failed, 0 total

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:184:14

  console.log
    
      Testing determinism for test/logging/debug-and-log-tests.jest.mjs...

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:516:14

  console.log
        Run 1: 0 passed, 0 failed

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:523:15

  console.log
        Run 2: 0 passed, 0 failed

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:523:15

  console.log
        Run 3: 0 passed, 0 failed

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:523:15

  console.log
    
      Testing determinism for test/config/parameter-secret-tests.jest.mjs...

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:516:14

PASS test/security/property/shell-injection-prevention-property-tests.jest.mjs (6.922 s)
  Property-Based Tests: Shell Injection Prevention
    ✓ Property 1: Shell Command Execution Safety - execFile treats all paths as literal strings (3406 ms)
    ✓ Property 1b: Shell Command Execution Safety - specific attack vectors are prevented (3420 ms)

  console.log
        Run 1: 0 passed, 0 failed

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:523:15

FAIL test/request/validation/property/error-handling-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      3 |
      4 | // Import ValidationMatcher and ValidationExecutor
    > 5 | const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
        |                                 ^
      6 | const ValidationMatcher = ValidationMatcherModule.default;
      7 |
      8 | const ValidationExecutorModule = await import('../../../../src/lib/utils/ValidationExecutor.class.js');

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/request/validation/property/error-handling-property-tests.jest.mjs:5:33

FAIL test/request/validation-reason-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

  console.log
    
      Testing api-request...

      at test/migration/property/test-execution-equivalence-property-tests.jest.mjs:97:14

  console.log
        Running Jest tests for api-request...

      at test/migration/property/test-execution-equivalence-property-tests.jest.mjs:100:14

  console.log
        Run 2: 0 passed, 0 failed

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:523:15

  console.log
        Run 3: 0 passed, 0 failed

      at test/migration/property/test-migration-phase-4-property-tests.jest.mjs:523:15

(node:6454) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS test/migration/property/test-migration-phase-4-property-tests.jest.mjs (9.187 s)
  Test Migration Phase 4 - Property-Based Tests
    ✓ Property 1: Test Execution - Jest tests produce passing results (3061 ms)
    ✓ Property 2: Source Code Immutability - Source files unchanged during migration (47 ms)
    ✓ Property 3: Assertion Syntax Conversion - Jest files use Jest syntax, not Chai (4 ms)
    ✓ Property 4: Mock Library Consistency - Jest files use Jest mocking, not Sinon (4 ms)
    ✓ Property 5: Test Isolation - Jest files restore mocks and environment in afterEach (2 ms)
    ✓ Property 6: Test Coverage Preservation - Jest test files exist with adequate test counts (5 ms)
    ✓ Property 7: Test Determinism - Jest tests produce consistent results across runs (5768 ms)
    ✓ Property 8: Import Statement Correctness - Jest files use correct imports (3 ms)

FAIL test/logging/timer-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

FAIL test/config/property/appconfig-async-init-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      11 |
      12 | // Import tools module to access AppConfig and related classes
    > 13 | const tools = await import('../../../src/lib/tools/index.js');
         |               ^
      14 | const { AppConfig, DebugAndLog, Connections, ClientRequest, Response } = tools.default;
      15 |
      16 | /**

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/config/property/appconfig-async-init-property-tests.jest.mjs:13:15

FAIL test/endpoint/endpoint-dao-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

FAIL test/endpoint/api-request-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

FAIL test/cache/in-memory-cache/property/Cache-integration-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

  console.log
        Jest: 26 passed, 0 failed, 26 total

      at test/migration/property/test-execution-equivalence-property-tests.jest.mjs:102:14

  console.log
    
      Testing aws-classes...

      at test/migration/property/test-execution-equivalence-property-tests.jest.mjs:97:14

  console.log
        Running Jest tests for aws-classes...

      at test/migration/property/test-execution-equivalence-property-tests.jest.mjs:100:14

FAIL test/request/api-request-backwards-compat-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

FAIL test/request/validation/property/invalid-request-preservation.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      3 |
      4 | // Import ClientRequest to test the full validation flow
    > 5 | const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
        |                             ^
      6 | const ClientRequest = ClientRequestModule.default;
      7 |
      8 | /**

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/request/validation/property/invalid-request-preservation.jest.mjs:5:29

  console.log
    
    Example Import Issues:

      at Object.<anonymous> (test/documentation/property/executable-example-validation-tests.jest.mjs:350:13)

  console.log
      - docs/01-advanced-implementation-for-web-service/best-practices.md:83 - Uses cache-data functionality but missing import statement

      at test/documentation/property/executable-example-validation-tests.jest.mjs:352:14
          at Array.forEach (<anonymous>)

  console.log
      - docs/features/cache/README.md:102 - Uses cache-data functionality but missing import statement

      at test/documentation/property/executable-example-validation-tests.jest.mjs:352:14
          at Array.forEach (<anonymous>)

  console.log
      - docs/features/tools/README.md:995 - Uses cache-data functionality but missing import statement

      at test/documentation/property/executable-example-validation-tests.jest.mjs:352:14
          at Array.forEach (<anonymous>)

  console.log
      - docs/features/tools/README.md:1331 - Uses cache-data functionality but missing import statement

      at test/documentation/property/executable-example-validation-tests.jest.mjs:352:14
          at Array.forEach (<anonymous>)

  console.log
      - docs/technical/in-memory-cache.md:199 - Uses cache-data functionality but missing import statement

      at test/documentation/property/executable-example-validation-tests.jest.mjs:352:14
          at Array.forEach (<anonymous>)

  console.log
    
    Note: Found 5 examples that may need import statements

      at Object.<anonymous> (test/documentation/property/executable-example-validation-tests.jest.mjs:361:13)

PASS test/documentation/property/executable-example-validation-tests.jest.mjs (9.908 s)
  Executable Example Validation - Property-Based Tests
    Property 15: Executable Example Validation
      ✓ should have syntactically valid JavaScript in all documentation examples (8169 ms)
      ✓ should use property-based testing to verify example executability (1381 ms)
      ✓ should validate that examples use proper module imports (32 ms)
      ✓ should validate that examples don't use deprecated APIs (6 ms)

FAIL test/request/validation/property/validation-failure-propagation-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      24 |
      25 | // Import ClientRequest class
    > 26 | const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
         |                             ^
      27 | const ClientRequest = ClientRequestModule.default;
      28 |
      29 | // Mock Lambda context

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/request/validation/property/validation-failure-propagation-property-tests.jest.mjs:26:29

FAIL test/utils/utils-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

FAIL test/request/property/api-request-compatibility-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

FAIL test/request/request-info-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

FAIL test/cache/in-memory-cache/property/InMemoryCache-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)

  console.log
        Jest: 27 passed, 0 failed, 27 total

      at test/migration/property/test-execution-equivalence-property-tests.jest.mjs:102:14

  console.log
    
      Testing aws-classes...

      at test/migration/property/test-execution-equivalence-property-tests.jest.mjs:97:14

  console.log
        Running Jest tests for aws-classes...

      at test/migration/property/test-execution-equivalence-property-tests.jest.mjs:100:14

FAIL test/documentation/property/backwards-compatibility-tests.jest.mjs
  Feature: documentation-quality-fixes - Backwards Compatibility
    Property 10: Function Signature Preservation
      ✓ should preserve all function signatures in dao-cache.js (6 ms)
      ✓ should preserve all function signatures in dao-endpoint.js
      ✓ should preserve all function signatures in tools module (82 ms)
      ✓ Property 10: Function signatures must remain unchanged after documentation fixes (810 ms)
    Property 11: Export Preservation
      ✕ should preserve exact export structure in src/index.js (1 ms)
      ✕ should preserve tools module exports (1 ms)
      ✕ should preserve cache module exports (2 ms)
      ✕ should preserve endpoint module exports (1 ms)
      ✕ Property 11: All module exports must be preserved after documentation fixes (3 ms)

  ● Feature: documentation-quality-fixes - Backwards Compatibility › Property 11: Export Preservation › should preserve exact export structure in src/index.js

    TypeError: The "original" argument must be of type function. Received an instance of Object

      243 | 			
      244 | 			// Load the actual module and verify exports
    > 245 | 			const indexModule = require(indexPath);
          | 			                    ^
      246 | 			expect(indexModule).toHaveProperty('tools');
      247 | 			expect(indexModule).toHaveProperty('cache');
      248 | 			expect(indexModule).toHaveProperty('endpoint');

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/documentation/property/backwards-compatibility-tests.jest.mjs:245:24)

  ● Feature: documentation-quality-fixes - Backwards Compatibility › Property 11: Export Preservation › should preserve tools module exports

    TypeError: The "original" argument must be of type function. Received an instance of Object

      256 | 		it('should preserve tools module exports', () => {
      257 | 			const toolsIndexPath = path.join(rootDir, 'src/lib/tools/index.js');
    > 258 | 			const toolsModule = require(toolsIndexPath);
          | 			                    ^
      259 |
      260 | 			// Verify key tool exports exist
      261 | 			expect(toolsModule).toHaveProperty('ApiRequest');

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/documentation/property/backwards-compatibility-tests.jest.mjs:258:24)

  ● Feature: documentation-quality-fixes - Backwards Compatibility › Property 11: Export Preservation › should preserve cache module exports

    TypeError: The "original" argument must be of type function. Received an instance of Object

      268 | 		it('should preserve cache module exports', () => {
      269 | 			const cachePath = path.join(rootDir, 'src/lib/dao-cache.js');
    > 270 | 			const cacheModule = require(cachePath);
          | 			                    ^
      271 |
      272 | 			// Verify cache exports exist
      273 | 			expect(cacheModule).toHaveProperty('Cache');

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/documentation/property/backwards-compatibility-tests.jest.mjs:270:24)

  ● Feature: documentation-quality-fixes - Backwards Compatibility › Property 11: Export Preservation › should preserve endpoint module exports

    TypeError: The "original" argument must be of type function. Received an instance of Object

      278 | 		it('should preserve endpoint module exports', () => {
      279 | 			const endpointPath = path.join(rootDir, 'src/lib/dao-endpoint.js');
    > 280 | 			const endpointModule = require(endpointPath);
          | 			                       ^
      281 |
      282 | 			// Verify endpoint exports exist
      283 | 			expect(endpointModule).toHaveProperty('get');

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/documentation/property/backwards-compatibility-tests.jest.mjs:280:27)

  ● Feature: documentation-quality-fixes - Backwards Compatibility › Property 11: Export Preservation › Property 11: All module exports must be preserved after documentation fixes

    Property failed after 1 tests
    { seed: -1299310018, path: "0:0", endOnFailure: true }
    Counterexample: [{"path":"src/index.js","exports":["tools","cache","endpoint"]}]
    Shrunk 1 time(s)

    Hint: Enable verbose mode in order to have the list of all failing values encountered during the run

      292 | 		 */
      293 | 		it('Property 11: All module exports must be preserved after documentation fixes', () => {
    > 294 | 			fc.assert(
          | 			   ^
      295 | 				fc.property(
      296 | 					fc.constantFrom(
      297 | 						{ path: 'src/index.js', exports: ['tools', 'cache', 'endpoint'] },

      at buildError (node_modules/fast-check/lib/fast-check.js:2434:16)
      at throwIfFailed (node_modules/fast-check/lib/fast-check.js:2441:8)
      at reportRunDetails (node_modules/fast-check/lib/fast-check.js:2457:14)
      at Module.assert (node_modules/fast-check/lib/fast-check.js:2514:7)
      at Object.<anonymous> (test/documentation/property/backwards-compatibility-tests.jest.mjs:294:7)

    Cause:
    TypeError: The "original" argument must be of type function. Received an instance of Object

      301 | 					(moduleInfo) => {
      302 | 						const modulePath = path.join(rootDir, moduleInfo.path);
    > 303 | 						const module = require(modulePath);
          | 						               ^
      304 |
      305 | 						// Property: All expected exports should exist
      306 | 						moduleInfo.exports.forEach(exportName => {

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/documentation/property/backwards-compatibility-tests.jest.mjs:303:22
      at Property.predicate (node_modules/fast-check/lib/fast-check.js:1329:99)
      at Property.run (node_modules/fast-check/lib/fast-check.js:1298:24)
      at runIt (node_modules/fast-check/lib/fast-check.js:2477:24)
      at check (node_modules/fast-check/lib/fast-check.js:2509:204)
      at Module.assert (node_modules/fast-check/lib/fast-check.js:2512:14)
      at Object.<anonymous> (test/documentation/property/backwards-compatibility-tests.jest.mjs:294:7)

FAIL test/request/validation/property/performance-optimization-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      3 |
      4 | // Import ValidationMatcher
    > 5 | const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
        |                                 ^
      6 | const ValidationMatcher = ValidationMatcherModule.default;
      7 |
      8 | /**

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/request/validation/property/performance-optimization-property-tests.jest.mjs:5:33

  console.log
        Jest: 27 passed, 0 failed, 27 total

      at test/migration/property/test-execution-equivalence-property-tests.jest.mjs:102:14

PASS test/migration/property/test-execution-equivalence-property-tests.jest.mjs
  Test Migration Phase 6 - Test Execution Validation
    ✓ Property 2: Test Execution Validation - Jest tests produce passing results (3849 ms)

FAIL test/request/validation/property/preservation-property-tests.jest.mjs
  Preservation - Existing Behavior Properties
    Property 9: No Validation Rules Preservation
      ✕ Property: When no validation rules exist, parameter getter methods return empty objects (excludeParamsWithNoValidationMatch=true) (1 ms)
    Property 10: Validation Failure Preservation
      ✕ Property: When validation fails, parameter getter methods return empty objects (1 ms)
    Property 11: Exclude Unmatched Flag Preservation
      ✕ Property: When excludeParamsWithNoValidationMatch=false, unvalidated parameters are included
    Property 12: Single-Parameter Validation Interface Preservation
      ✕ Property: Single-parameter validation continues to pass value directly to validation function (1 ms)
    Property 13: Path Parameters Without BY_ROUTE Preservation
      ✕ Property: Path parameters validated without BY_ROUTE rules continue to work correctly (1 ms)
    Property 14: Referrer Validation Preservation
      ✕ Property: When referrer validation fails, isValid() returns false regardless of parameter validation
    Property 15: Single Placeholder Routes Preservation
      ✕ Property: Route patterns with single placeholders continue to match and validate correctly
    Property 16: Global Parameter Validation Preservation
      ✕ Property: Global parameter validation (no BY_ROUTE or BY_METHOD) continues to work correctly (1 ms)
    Property 17: No Duplicate Parameters Preservation
      ✕ Property: Validation rules with no duplicate parameters continue to work correctly (1 ms)
    Property 18: getBodyParameters() Method Preservation
      ✕ Property: getBodyParameters() method returns an object without throwing TypeError
      ✕ Property: getBodyParameters() returns empty object when validation fails

  ● Preservation - Existing Behavior Properties › Property 9: No Validation Rules Preservation › Property: When no validation rules exist, parameter getter methods return empty objects (excludeParamsWithNoValidationMatch=true)

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

  ● Preservation - Existing Behavior Properties › Property 10: Validation Failure Preservation › Property: When validation fails, parameter getter methods return empty objects

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

  ● Preservation - Existing Behavior Properties › Property 11: Exclude Unmatched Flag Preservation › Property: When excludeParamsWithNoValidationMatch=false, unvalidated parameters are included

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

  ● Preservation - Existing Behavior Properties › Property 12: Single-Parameter Validation Interface Preservation › Property: Single-parameter validation continues to pass value directly to validation function

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

  ● Preservation - Existing Behavior Properties › Property 13: Path Parameters Without BY_ROUTE Preservation › Property: Path parameters validated without BY_ROUTE rules continue to work correctly

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

  ● Preservation - Existing Behavior Properties › Property 14: Referrer Validation Preservation › Property: When referrer validation fails, isValid() returns false regardless of parameter validation

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

  ● Preservation - Existing Behavior Properties › Property 15: Single Placeholder Routes Preservation › Property: Route patterns with single placeholders continue to match and validate correctly

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

  ● Preservation - Existing Behavior Properties › Property 16: Global Parameter Validation Preservation › Property: Global parameter validation (no BY_ROUTE or BY_METHOD) continues to work correctly

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

  ● Preservation - Existing Behavior Properties › Property 17: No Duplicate Parameters Preservation › Property: Validation rules with no duplicate parameters continue to work correctly

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

  ● Preservation - Existing Behavior Properties › Property 18: getBodyParameters() Method Preservation › Property: getBodyParameters() method returns an object without throwing TypeError

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

  ● Preservation - Existing Behavior Properties › Property 18: getBodyParameters() Method Preservation › Property: getBodyParameters() returns empty object when validation fails

    TypeError: The "original" argument must be of type function. Received an instance of Object

      54 | 	beforeAll(async () => {
      55 | 		// Dynamic import to get fresh module
    > 56 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      57 | 		ClientRequest = module.default;
      58 | 	});
      59 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/property/preservation-property-tests.jest.mjs:56:18)

FAIL test/request/property/api-request-xray-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      4 |
      5 | // Import ApiRequest
    > 6 | const tools = await import('../../../src/lib/tools/index.js');
        |               ^
      7 | const ApiRequest = tools.default.ApiRequest;
      8 |
      9 | describe('ApiRequest X-Ray Property-Based Tests', () => {

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/request/property/api-request-xray-property-tests.jest.mjs:6:15

FAIL test/request/validation/property/multi-parameter-validation-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      26 |
      27 | // Import ClientRequest class
    > 28 | const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
         |                             ^
      29 | const ClientRequest = ClientRequestModule.default;
      30 |
      31 | // Import ValidationExecutor for direct testing

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/request/validation/property/multi-parameter-validation-property-tests.jest.mjs:28:29

PASS test/cache/cache-validation-tests.jest.mjs
  Cache Validation Tests
    ✓ Should throw error for invalid DynamoDbMaxCacheSize_kb parameter (299 ms)
    ✓ Should throw error for invalid purgeExpiredCacheEntriesAfterXHours parameter (313 ms)
    ✓ Should throw error for invalid timeZoneForInterval parameter (276 ms)
    ✓ Should throw error for invalid environment variable CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB (324 ms)
    ✓ Should use valid environment variables when parameters not provided (317 ms)
    ✓ Should use environment variables when parameters object is empty (324 ms)

FAIL test/request/validation/property/validation-execution-property-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      3 |
      4 | // Import ValidationMatcher and ValidationExecutor
    > 5 | const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
        |                                 ^
      6 | const ValidationMatcher = ValidationMatcherModule.default;
      7 |
      8 | const ValidationExecutorModule = await import('../../../../src/lib/utils/ValidationExecutor.class.js');

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/request/validation/property/validation-execution-property-tests.jest.mjs:5:33

FAIL test/request/validation/integration/real-world-scenarios-tests.jest.mjs
  ClientRequest - Real-World Scenarios Integration Tests
    Scenario 1: Product API with Different Validation per Route
      ✕ should validate product IDs with P- prefix (1 ms)
      ✕ should validate employee IDs with E- prefix
      ✕ should validate order IDs with ORD- prefix
      ✕ should reject product ID without P- prefix
      ✕ should use global validation for unmatched routes
    Scenario 2: RESTful API with Method-Specific Validation
      ✕ should apply stricter validation for POST requests
      ✕ should reject POST with id=0
      ✕ should allow GET with any numeric id
      ✕ should validate body parameters differently for POST vs PUT
    Scenario 3: Search API with Multi-Parameter Validation
      ✕ should validate search query and limit together
      ✕ should reject search with limit > 100 (1 ms)
      ✕ should reject search with empty query
      ✕ should handle missing limit parameter with default
      ✕ should validate pagination parameters together
    Scenario 4: Game API with Method-And-Route Validation
      ✕ should validate POST:join/{id} with GAME- prefix
      ✕ should validate GET:join/{id} with plain numeric
      ✕ should reject POST:join/{id} without GAME- prefix (1 ms)
      ✕ should validate DELETE:game/{id} with different rules
    Scenario 5: Error Handling Scenarios
      ✕ should handle validation function that throws error
      ✕ should handle missing parameters gracefully
      ✕ should handle null parameter values
      ✕ should handle undefined parameter values in multi-parameter validation
      ✕ should handle validation function returning non-boolean
      ✕ should stop validation on first failure
    Scenario 6: excludeParamsWithNoValidationMatch Flag Behavior
      ✕ should exclude unvalidated parameters by default
      ✕ should include unvalidated parameters when flag is false
      ✕ should exclude unvalidated parameters with BY_ROUTE
      ✕ should include unvalidated parameters with flag false and BY_ROUTE
      ✕ should handle mixed validated and unvalidated parameters
    Scenario 7: Complex Real-World API Gateway Events
      ✕ should handle complete API Gateway event structure
      ✕ should handle API Gateway event with body parameters
      ✕ should handle API Gateway event with all parameter types
      ✕ should handle API Gateway event with case-insensitive headers
    Scenario 8: Edge Cases and Boundary Conditions
      ✕ should handle empty validation configuration
      ✕ should handle very long parameter values
      ✕ should handle special characters in parameter values
      ✕ should handle numeric string vs number comparison

  ● ClientRequest - Real-World Scenarios Integration Tests › Scenario 1: Product API with Different Validation per Route › should validate product IDs with P- prefix

    TypeError: The "original" argument must be of type function. Received an instance of Object

      52 | 	beforeAll(async () => {
      53 | 		// Dynamic import to get fresh module
    > 54 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      55 | 		ClientRequest = module.default;
      56 | 	});
      57 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/integration/real-world-scenarios-tests.jest.mjs:54:18)

  ● ClientRequest - Real-World Scenarios Integration Tests › Scenario 1: Product API with Different Validation per Route › should validate employee IDs with E- prefix

    TypeError: The "original" argument must be of type function. Received an instance of Object

      52 | 	beforeAll(async () => {
      53 | 		// Dynamic import to get fresh module
    > 54 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      55 | 		ClientRequest = module.default;
      56 | 	});
      57 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/integration/real-world-scenarios-tests.jest.mjs:54:18)

  ● ClientRequest - Real-World Scenarios Integration Tests › Scenario 1: Product API with Different Validation per Route › should validate order IDs with ORD- prefix

    TypeError: The "original" argument must be of type function. Received an instance of Object

      52 | 	beforeAll(async () => {
      53 | 		// Dynamic import to get fresh module
    > 54 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      55 | 		ClientRequest = module.default;
      56 | 	});
      57 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/integration/real-world-scenarios-tests.jest.mjs:54:18)

  ● ClientRequest - Real-World Scenarios Integration Tests › Scenario 1: Product API with Different Validation per Route › should reject product ID without P- prefix

    TypeError: The "original" argument must be of type function. Received an instance of Object

      52 | 	beforeAll(async () => {
      53 | 		// Dynamic import to get fresh module
    > 54 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      55 | 		ClientRequest = module.default;
      56 | 	});
      57 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/integration/real-world-scenarios-tests.jest.mjs:54:18)

  ● ClientRequest - Real-World Scenarios Integration Tests › Scenario 1: Product API with Different Validation per Route › should use global validation for unmatched routes

    TypeError: The "original" argument must be of type function. Received an instance of Object

      52 | 	beforeAll(async () => {
      53 | 		// Dynamic import to get fresh module
    > 54 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      55 | 		ClientRequest = module.default;
      56 | 	});
      57 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/integration/real-world-scenarios-tests.jest.mjs:54:18)

  ● ClientRequest - Real-World Scenarios Integration Tests › Scenario 2: RESTful API with Method-Specific Validation › should apply stricter validation for POST requests

    TypeError: The "original" argument must be of type function. Received an instance of Object

      52 | 	beforeAll(async () => {
      53 | 		// Dynamic import to get fresh module
    > 54 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      55 | 		ClientRequest = module.default;
      56 | 	});
      57 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/integration/real-world-scenarios-tests.jest.mjs:54:18)

  ● ClientRequest - Real-World Scenarios Integration Tests › Scenario 2: RESTful API with Method-Specific Validation › should reject POST with id=0

    TypeError: The "original" argument must be of type function. Received an instance of Object

      52 | 	beforeAll(async () => {
      53 | 		// Dynamic import to get fresh module
    > 54 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      55 | 		ClientRequest = module.default;
      56 | 	});
      57 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/integration/real-world-scenarios-tests.jest.mjs:54:18)

  ● ClientRequest - Real-World Scenarios Integration Tests › Scenario 2: RESTful API with Method-Specific Validation › should allow GET with any numeric id

    TypeError: The "original" argument must be of type function. Received an instance of Object

      52 | 	beforeAll(async () => {
      53 | 		// Dynamic import to get fresh module
    > 54 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      55 | 		ClientRequest = module.default;
      56 | 	});
      57 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/integration/real-world-scenarios-tests.jest.mjs:54:18)

  ● ClientRequest - Real-World Scenarios Integration Tests › Scenario 2: RESTful API with Method-Specific Validation › should validate body parameters differently for POST vs PUT

    TypeError: The "original" argument must be of type function. Received an instance of Object

      52 | 	beforeAll(async () => {
      53 | 		// Dynamic import to get fresh module
    > 54 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      55 | 		ClientRequest = module.default;
      56 | 	});
      57 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at Object.<anonymous> (test/request/validation/integration/real-world-scenarios-tests.jest.mjs:54:18)

  ● ClientRequest - Real-World Scenarios Integration Tests › Scenario 3: Search API with Multi-Parameter Validation › should validate search query and limit together

    TypeError: The "original" argument must be of type function. Received an instance of Object

      52 | 	beforeAll(async () => {
      53 | 		// Dynamic import to get fresh module
    > 54 | 		const module = await import('../../../../src/lib/tools/ClientRequest.class.js');
         | 		               ^
      55 | 		ClientRequest = module.default;
      56 | 	});
      57 |

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/request/validation/unit/duplicate-parameters-exploration.jest.mjs:4:33

FAIL test/request/validation/unit/header-parameter-extraction-exploration.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      2 |
      3 | // Import ClientRequest to test the full validation flow
    > 4 | const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
        |                             ^
      5 | const ClientRequest = ClientRequestModule.default;
      6 |
      7 | /**

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)
      at test/request/validation/unit/header-parameter-extraction-exploration.jest.mjs:4:29

FAIL test/response/generic-response-json-tests.jest.mjs
  ● Test suite failed to run

    TypeError: The "original" argument must be of type function. Received an instance of Object

      at Object.<anonymous> (node_modules/test-exclude/index.js:5:14)
      at Object.<anonymous> (node_modules/babel-plugin-istanbul/lib/index.js:12:43)
      at _babelPluginIstanbul (node_modules/@jest/transform/build/index.js:45:39)
      at ScriptTransformer._instrumentFile (node_modules/@jest/transform/build/index.js:306:18)
      at ScriptTransformer._buildTransformResult (node_modules/@jest/transform/build/index.js:369:33)
      at ScriptTransformer.transformSource (node_modules/@jest/transform/build/index.js:424:17)
      at ScriptTransformer._transformAndBuildScript (node_modules/@jest/transform/build/index.js:512:40)
      at ScriptTransformer.transform (node_modules/@jest/transform/build/index.js:551:19)


Test Suites: 127 failed, 20 passed, 147 total
Tests:       234 failed, 1 skipped, 113 passed, 348 total
Snapshots:   0 total
Time:        18.566 s, estimated 40 s
Ran all test suites.
Error: Process completed with exit code 1.
```