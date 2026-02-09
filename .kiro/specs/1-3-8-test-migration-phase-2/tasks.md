# Implementation Plan: Test Migration Phase 2

## Overview

This implementation plan outlines the tasks for migrating Mocha tests to Jest for three modules: APIRequest.class.js, dao-endpoint.js, and AWS.classes.js. The migration will maintain backwards compatibility, ensure no breaking changes, and run both test frameworks in parallel during the transition period.

## Tasks

- [x] 1. Set up Jest configuration and test infrastructure
  - Verify Jest is installed in devDependencies (already present in package.json)
  - Create or verify jest.config.mjs for ESM support
  - Verify test:jest and test:all scripts in package.json
  - Test that Jest can run with existing .jest.mjs files
  - _Requirements: 6.1, 6.6, 8.1_

- [x] 2. Analyze existing Mocha tests and identify coverage gaps
  - [x] 2.1 Analyze APIRequest.class tests
    - Count existing test cases in test/endpoint/api-request-tests.mjs
    - Document test coverage areas (GET, POST, redirects, timeouts, headers, parameters, body)
    - Identify untested code paths in src/lib/tools/APIRequest.class.js
    - Document missing test cases needed for complete coverage
    - _Requirements: 1.1, 4.1, 4.5, 4.6_
  
  - [x] 2.2 Analyze dao-endpoint.js tests
    - Count existing test cases in test/endpoint/endpoint-dao-tests.mjs
    - Document test coverage areas (connection config, query merging, JSON parsing, errors)
    - Identify untested code paths in src/lib/dao-endpoint.js
    - Document missing test cases needed for complete coverage
    - _Requirements: 2.1, 4.2, 4.5, 4.6_
  
  - [x] 2.3 Analyze AWS.classes tests
    - Check if test/tools/aws-classes-tests.mjs exists
    - If missing, document all testable functionality in src/lib/tools/AWS.classes.js
    - If exists, count test cases and identify gaps
    - Document test coverage areas (version detection, SDK selection, client operations)
    - Identify untested code paths
    - _Requirements: 3.1, 4.3, 4.5, 4.6_

- [x] 3. Migrate APIRequest.class tests to Jest
  - [x] 3.1 Create test/endpoint/api-request-tests.jest.mjs
    - Add file header with migration documentation
    - Add imports for Jest and module under test
    - Set up describe block structure matching Mocha tests
    - _Requirements: 1.1, 7.1, 7.2, 7.3, 7.5, 9.1, 9.2_
  
  - [x] 3.2 Migrate basic GET request tests
    - Migrate "Passing uri results in success" test
    - Migrate "Passing host and path results in success" test
    - Convert Chai assertions to Jest assertions
    - Verify tests pass
    - _Requirements: 1.2, 1.5, 8.2_
  
  - [x] 3.3 Migrate header and parameter tests
    - Migrate "Headers were passed along" test
    - Migrate "Parameters were passed along and duplicates were combined" test
    - Migrate "Parameters were passed along and duplicates were separate" test
    - Convert Chai assertions to Jest assertions
    - Verify tests pass
    - _Requirements: 1.2, 1.5, 8.2_
  
  - [x] 3.4 Migrate POST request and body tests
    - Migrate "Body was passed along in a POST request" test
    - Migrate "GET request" test
    - Convert Chai assertions to Jest assertions
    - Verify tests pass
    - _Requirements: 1.2, 1.5, 8.2_
  
  - [x] 3.5 Migrate redirect and error tests
    - Migrate "Passing uri results in 404" test
    - Migrate "Passing uri results in no redirect" test
    - Convert Chai assertions to Jest assertions
    - Verify tests pass
    - _Requirements: 1.2, 1.5, 8.2_
  
  - [x] 3.6 Migrate timeout tests with mocks
    - Migrate "Test timeout" test
    - Convert Sinon stubs to Jest spies (jest.spyOn)
    - Add proper cleanup in afterEach
    - Verify console mocks work correctly
    - Verify tests pass
    - _Requirements: 1.2, 1.5, 8.3, 8.4, 8.7, 10.5_
  
  - [x] 3.7 Migrate APIRequest class method tests
    - Migrate "Testing setter and getter functions" test
    - Migrate "Testing min value of timeOutInMilliseconds" test
    - Convert Chai assertions to Jest assertions
    - Verify tests pass
    - _Requirements: 1.2, 1.5, 8.2_
  
  - [x] 3.8 Migrate Connection and ConnectionAuthentication tests
    - Migrate all ConnectionAuthentication tests (Basic, Parameters, Headers, Body)
    - Convert Chai assertions to Jest assertions
    - Verify tests pass
    - _Requirements: 1.2, 1.5, 8.2_
  
  - [x] 3.9 Add missing test cases for APIRequest coverage gaps
    - Add tests for identified untested code paths from task 2.1
    - Add tests for error handling scenarios
    - Add tests for edge cases
    - Verify all tests pass
    - _Requirements: 4.4, 4.5, 4.6_
  
  - [x] 3.10 Verify APIRequest migration completeness
    - Run both Mocha and Jest tests: npm run test:all
    - Verify test counts match between frameworks
    - Verify all tests pass in both frameworks
    - Check coverage hasn't regressed
    - _Requirements: 1.2, 1.3, 1.4, 6.1, 6.2_

- [x] 4. Migrate dao-endpoint.js tests to Jest
  - [x] 4.1 Create test/endpoint/endpoint-dao-tests.jest.mjs
    - Add file header with migration documentation
    - Add imports for Jest and module under test
    - Set up describe block structure matching Mocha tests
    - _Requirements: 2.1, 7.1, 7.2, 7.3, 7.5, 9.1, 9.2_
  
  - [x] 4.2 Migrate basic endpoint tests
    - Migrate "Test endpoint directly" test (if keeping)
    - Migrate "Passing uri results in success" test
    - Migrate "Passing host and path results in success" test
    - Convert Chai assertions to Jest assertions
    - Verify tests pass
    - _Requirements: 2.2, 2.5, 8.2_
  
  - [x] 4.3 Migrate header and parameter tests
    - Migrate "Headers were passed along" test
    - Migrate "Parameters were passed along" test
    - Convert Chai assertions to Jest assertions
    - Verify tests pass
    - _Requirements: 2.2, 2.5, 8.2_
  
  - [x] 4.4 Migrate request method tests
    - Migrate "GET request" test
    - Migrate "Passing host and path and an empty uri" test
    - Convert Chai assertions to Jest assertions
    - Verify tests pass
    - _Requirements: 2.2, 2.5, 8.2_
  
  - [x] 4.5 Migrate timeout tests with mocks
    - Migrate "Test timeout" test
    - Convert Sinon stubs to Jest spies
    - Add proper cleanup in afterEach
    - Verify tests pass
    - _Requirements: 2.2, 2.5, 8.3, 8.4, 8.7, 10.5_
  
  - [x] 4.6 Add missing test cases for dao-endpoint coverage gaps
    - Add tests for identified untested code paths from task 2.2
    - Add tests for error handling in _call() method
    - Add tests for non-JSON response handling
    - Add tests for edge cases
    - Verify all tests pass
    - _Requirements: 4.4, 4.5, 4.6_
  
  - [x] 4.7 Verify dao-endpoint migration completeness
    - Run both Mocha and Jest tests: npm run test:all
    - Verify test counts match between frameworks
    - Verify all tests pass in both frameworks
    - Check coverage hasn't regressed
    - _Requirements: 2.2, 2.3, 2.4, 6.1, 6.2_

- [ ] 5. Create or migrate AWS.classes tests to Jest
  - [ ] 5.1 Create test/tools/ directory if it doesn't exist
    - Create directory structure
    - _Requirements: 3.1, 7.1_
  
  - [ ] 5.2 Create or analyze test/tools/aws-classes-tests.mjs
    - If file doesn't exist, create Mocha version first
    - If file exists, analyze existing tests
    - Document test coverage areas
    - _Requirements: 3.1_
  
  - [ ] 5.3 Create test/tools/aws-classes-tests.jest.mjs
    - Add file header with migration documentation
    - Add imports for Jest and module under test
    - Set up describe block structure
    - _Requirements: 3.1, 7.1, 7.2, 7.3, 7.5, 9.1, 9.2_
  
  - [ ] 5.4 Create/migrate Node.js version detection tests
    - Test NODE_VER getter
    - Test NODE_VER_MAJOR, NODE_VER_MINOR, NODE_VER_PATCH getters
    - Test NODE_VER_ARRAY getter
    - Test SDK_VER returns 'V3' for Node >= 18
    - Convert to Jest assertions
    - Verify tests pass
    - _Requirements: 3.2, 3.5, 8.2_
  
  - [ ] 5.5 Create/migrate AWS region configuration tests
    - Test REGION getter with AWS_REGION set
    - Test REGION getter without AWS_REGION (should default to us-east-1)
    - Test warning is logged when AWS_REGION not set
    - Mock process.env appropriately
    - Convert to Jest assertions and mocks
    - Verify tests pass
    - _Requirements: 3.2, 3.5, 8.2, 8.4_
  
  - [ ] 5.6 Create/migrate DynamoDB client tests
    - Test dynamo.client is defined
    - Test dynamo.get() function exists
    - Test dynamo.put() function exists
    - Test dynamo.scan() function exists
    - Test dynamo.delete() function exists
    - Test dynamo.update() function exists
    - Mock AWS SDK appropriately
    - Convert to Jest assertions and mocks
    - Verify tests pass
    - _Requirements: 3.2, 3.5, 8.2, 8.4_
  
  - [ ] 5.7 Create/migrate S3 client tests
    - Test s3.client is defined
    - Test s3.get() function exists
    - Test s3.put() function exists
    - Mock AWS SDK appropriately
    - Convert to Jest assertions and mocks
    - Verify tests pass
    - _Requirements: 3.2, 3.5, 8.2, 8.4_
  
  - [ ] 5.8 Create/migrate SSM client tests
    - Test ssm.client is defined
    - Test ssm.getByName() function exists
    - Test ssm.getByPath() function exists
    - Mock AWS SDK appropriately
    - Convert to Jest assertions and mocks
    - Verify tests pass
    - _Requirements: 3.2, 3.5, 8.2, 8.4_
  
  - [ ] 5.9 Create/migrate X-Ray initialization tests
    - Test X-Ray initialization when CacheData_AWSXRayOn is true
    - Test X-Ray initialization when CACHE_DATA_AWS_X_RAY_ON is true
    - Test X-Ray is null when environment variables are false
    - Mock aws-xray-sdk-core appropriately
    - Convert to Jest assertions and mocks
    - Verify tests pass
    - _Requirements: 3.2, 3.5, 8.2, 8.4_
  
  - [ ] 5.10 Add missing test cases for AWS.classes coverage gaps
    - Add tests for identified untested code paths from task 2.3
    - Add tests for error handling scenarios
    - Add tests for edge cases
    - Verify all tests pass
    - _Requirements: 4.4, 4.5, 4.6_
  
  - [ ] 5.11 Verify AWS.classes migration completeness
    - Run both Mocha and Jest tests: npm run test:all
    - Verify test counts match between frameworks
    - Verify all tests pass in both frameworks
    - Check coverage hasn't regressed
    - _Requirements: 3.2, 3.3, 3.4, 6.1, 6.2_

- [ ] 6. Create property-based tests for migration validation
  - [ ] 6.1 Create test/migration/property/ directory
    - Create directory structure for migration validation tests
    - _Requirements: All properties_
  
  - [ ] 6.2 Create property test for test migration completeness (Property 1)
    - Test that Jest test count equals Mocha test count for each module
    - Use fast-check to generate module names
    - Tag with: Feature: test-migration-phase-2, Property 1
    - _Requirements: 1.1, 2.1, 3.1_
  
  - [ ] 6.3 Create property test for test execution equivalence (Property 2)
    - Test that both Mocha and Jest produce same pass/fail results
    - Use fast-check to generate test scenarios
    - Tag with: Feature: test-migration-phase-2, Property 2
    - _Requirements: 1.2, 1.3, 2.2, 2.3, 3.2, 3.3_
  
  - [ ] 6.4 Create property test for source code immutability (Property 7)
    - Test that source file hashes haven't changed
    - Compare before/after hashes for all source files
    - Tag with: Feature: test-migration-phase-2, Property 7
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [ ] 6.5 Create property test for Jest file naming convention (Property 11)
    - Test that all Jest files follow .jest.mjs naming pattern
    - Use fast-check to validate filenames
    - Tag with: Feature: test-migration-phase-2, Property 11
    - _Requirements: 6.5, 7.2, 7.3_
  
  - [ ] 6.6 Create property test for Jest file location (Property 12)
    - Test that Jest files are in same directory as Mocha files
    - Use fast-check to validate file paths
    - Tag with: Feature: test-migration-phase-2, Property 12
    - _Requirements: 7.1, 7.4_

- [ ] 7. Verify backwards compatibility and no breaking changes
  - [ ] 7.1 Verify source files unchanged
    - Run git diff on src/lib/tools/APIRequest.class.js
    - Run git diff on src/lib/dao-endpoint.js
    - Run git diff on src/lib/tools/AWS.classes.js
    - Verify no changes to source code
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [ ] 7.2 Verify package.json dependencies
    - Check that no new production dependencies were added
    - Verify Jest is only in devDependencies
    - Verify all other dependencies unchanged
    - _Requirements: 5.6_
  
  - [ ] 7.3 Run all existing tests
    - Run npm test (Mocha only)
    - Verify all existing tests pass
    - Verify no test failures introduced
    - _Requirements: 5.4, 6.4_
  
  - [ ] 7.4 Run all new Jest tests
    - Run npm run test:jest
    - Verify all Jest tests pass
    - Verify test output is clear and informative
    - _Requirements: 6.1, 6.2_
  
  - [ ] 7.5 Run combined test suite
    - Run npm run test:all
    - Verify both Mocha and Jest tests pass
    - Verify no conflicts between test frameworks
    - Check total execution time is reasonable
    - _Requirements: 6.1, 6.6_

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Update documentation and configuration
  - [ ] 9.1 Update test scripts in package.json if needed
    - Verify test:jest script works correctly
    - Verify test:all script runs both frameworks
    - Add test:endpoint:jest script if useful
    - _Requirements: 6.1, 6.6_
  
  - [ ] 9.2 Create or update jest.config.mjs
    - Configure ESM support
    - Configure test file patterns (*.jest.mjs)
    - Configure coverage settings
    - Configure test environment
    - _Requirements: 8.1_
  
  - [ ] 9.3 Update .gitignore if needed
    - Ensure Jest cache directories are ignored
    - Ensure coverage directories are ignored
    - _Requirements: N/A_
  
  - [ ] 9.4 Document migration in spec README
    - Update .kiro/specs/1-3-8-test-migration-phase-2/README.md
    - Document what was migrated
    - Document any issues encountered
    - Document next steps for future phases
    - _Requirements: 9.3_

- [ ] 10. Final validation and cleanup
  - [ ] 10.1 Run full test suite multiple times
    - Run npm run test:all at least 3 times
    - Verify consistent results (no flaky tests)
    - Verify no test pollution between runs
    - _Requirements: 10.1, 10.2, 10.4_
  
  - [ ] 10.2 Generate and review coverage report
    - Run coverage analysis
    - Verify coverage hasn't regressed
    - Document coverage improvements
    - _Requirements: 1.4, 2.4, 3.4_
  
  - [ ] 10.3 Review all Jest test files for quality
    - Check all files have proper headers
    - Check all files have requirements references
    - Check all files use Jest patterns consistently
    - Check all files have proper cleanup
    - _Requirements: 7.5, 8.1-8.7, 9.1-9.5, 10.3, 10.5_
  
  - [ ] 10.4 Verify property-based tests pass
    - Run all migration validation property tests
    - Verify all properties hold true
    - Document any property violations
    - _Requirements: All properties_
  
  - [ ] 10.5 Final checkpoint
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive test migration
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Both Mocha and Jest tests must pass throughout migration
- No source code modifications are allowed during migration
- All mocks must be properly cleaned up to prevent test pollution
