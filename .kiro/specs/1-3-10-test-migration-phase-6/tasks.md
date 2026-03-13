# Implementation Plan: Test Migration Phase 6

## Overview

This plan completes the migration of the @63klabs/cache-data test suite from Mocha to Jest. Phase 6 migrates the remaining 38 Mocha test files (67% of the original test suite) and removes Mocha as a dependency once migration is complete and validated.

The migration follows the established parallel testing approach from phases 4 and 5, with an additional final step to remove Mocha completely.

## Tasks

- [-] 1. Migrate Root Level Tests
  - [x] 1.1 Migrate test/index-tests.mjs to Jest
    - Create test/index-tests.jest.mjs
    - Convert Chai assertions to Jest assertions
    - Verify all export validation tests pass
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Migrate Config Module Tests
  - [x] 2.1 Migrate test/config/config-getConnCacheProfile-tests.mjs to Jest
    - Create test/config/config-getConnCacheProfile-tests.jest.mjs
    - Convert assertions and promise handling tests
    - Verify cache profile retrieval tests pass
    - _Requirements: 4.1, 4.2, 4.5_
  
  - [x] 2.2 Migrate test/config/connections-property-tests.mjs to Jest
    - Create test/config/connections-property-tests.jest.mjs
    - Convert property-based tests using fast-check
    - Verify connection configuration invariants
    - _Requirements: 4.1, 4.3, 4.5_
  
  - [x] 2.3 Migrate test/config/connections-unit-tests.mjs to Jest
    - Create test/config/connections-unit-tests.jest.mjs
    - Convert unit tests for connection properties
    - Verify authentication handling tests pass
    - _Requirements: 4.1, 4.4, 4.5_

- [x] 3. Checkpoint - Verify config tests pass
  - Ensure all config Jest tests pass, ask the user if questions arise.

- [x] 4. Migrate Security Tests
  - [x] 4.1 Migrate test/security/jsdoc-parser-security-tests.mjs to Jest
    - Create test/security/jsdoc-parser-security-tests.jest.mjs
    - Convert JSDoc parser security validation tests
    - Verify bracket matching and nested structure tests pass
    - _Requirements: 7.1, 7.2, 7.6, 7.7_
  
  - [x] 4.2 Migrate test/security/shell-command-security-tests.mjs to Jest
    - Create test/security/shell-command-security-tests.jest.mjs
    - Convert shell command injection prevention tests
    - Verify safe command execution pattern tests pass
    - _Requirements: 7.1, 7.3, 7.6, 7.7_
  
  - [x] 4.3 Migrate test/security/property/jsdoc-parsing-property-tests.mjs to Jest
    - Create test/security/property/jsdoc-parsing-property-tests.jest.mjs
    - Convert property-based JSDoc parsing tests
    - Verify injection prevention properties with fast-check
    - _Requirements: 7.1, 7.4, 7.6_
  
  - [x] 4.4 Migrate test/security/property/shell-injection-prevention-property-tests.mjs to Jest
    - Create test/security/property/shell-injection-prevention-property-tests.jest.mjs
    - Convert property-based shell injection tests
    - Verify command execution safety properties
    - _Requirements: 7.1, 7.5, 7.6, 7.7_

- [x] 5. Checkpoint - Verify security tests pass
  - Ensure all security Jest tests pass, ask the user if questions arise.

- [-] 6. Migrate Cache In-Memory Tests
  - [x] 6.1 Migrate test/cache/in-memory-cache/property/InMemoryCache-property-tests.mjs to Jest
    - Create test/cache/in-memory-cache/property/InMemoryCache-property-tests.jest.mjs
    - Convert property-based in-memory cache tests
    - Verify cache operations with fast-check (100+ iterations)
    - _Requirements: 3.1, 3.2, 3.5, 3.7_
  
  - [x] 6.2 Migrate test/cache/in-memory-cache/unit/InMemoryCache-basic-tests.mjs to Jest
    - Create test/cache/in-memory-cache/unit/InMemoryCache-basic-tests.jest.mjs
    - Convert basic in-memory cache unit tests
    - Verify get, set, delete operations
    - _Requirements: 3.1, 3.3, 3.5_
  
  - [x] 6.3 Migrate test/cache/in-memory-cache/unit/InMemoryCache-constructor-tests.mjs to Jest
    - Create test/cache/in-memory-cache/unit/InMemoryCache-constructor-tests.jest.mjs
    - Convert constructor validation tests
    - Verify initialization and configuration
    - _Requirements: 3.1, 3.4, 3.5_
  
  - [x] 6.4 Migrate test/cache/in-memory-cache/property/Cache-integration-property-tests.mjs to Jest
    - Create test/cache/in-memory-cache/property/Cache-integration-property-tests.jest.mjs
    - Convert cache integration property tests
    - Verify in-memory cache integration with main cache
    - _Requirements: 2.1, 2.2, 3.1, 3.6_

- [x] 7. Checkpoint - Verify in-memory cache tests pass
  - Ensure all in-memory cache Jest tests pass, ask the user if questions arise.

- [x] 8. Migrate Cache Module Tests (Part 1: Core and Backwards Compatibility)
  - [x] 8.1 Migrate test/cache/cache-tests.mjs to Jest
    - Create test/cache/cache-tests.jest.mjs
    - Convert core cache functionality tests
    - Mock AWS services (S3, DynamoDB) using Jest spies
    - Verify Cache.init(), generateIdHash(), and core methods
    - _Requirements: 2.1, 2.2, 2.7, 2.8_
  
  - [x] 8.2 Migrate test/cache/cache-backwards-compatibility-property-tests.mjs to Jest
    - Create test/cache/cache-backwards-compatibility-property-tests.jest.mjs
    - Convert backwards compatibility property tests
    - Verify cache format compatibility across versions
    - _Requirements: 2.1, 2.3, 2.7_
  
  - [x] 8.3 Migrate test/cache/cache-feature-flag-tests.mjs to Jest
    - Create test/cache/cache-feature-flag-tests.jest.mjs
    - Convert feature flag configuration tests
    - Verify feature flag behavior
    - _Requirements: 2.1, 2.4, 2.7_

- [x] 9. Migrate Cache Module Tests (Part 2: Header Handling - getHeader)
  - [x] 9.1 Migrate test/cache/cache-getheader-property-tests.mjs to Jest
    - Create test/cache/cache-getheader-property-tests.jest.mjs
    - Convert getHeader property-based tests
    - Verify header retrieval properties with fast-check
    - _Requirements: 2.1, 2.5, 2.7_
  
  - [x] 9.2 Migrate test/cache/cache-getheader-passthrough-property-tests.mjs to Jest
    - Create test/cache/cache-getheader-passthrough-property-tests.jest.mjs
    - Convert getHeader passthrough property tests
    - Verify header passthrough behavior
    - _Requirements: 2.1, 2.5, 2.7_
  
  - [x] 9.3 Migrate test/cache/cache-getheader-unit-tests.mjs to Jest
    - Create test/cache/cache-getheader-unit-tests.jest.mjs
    - Convert getHeader unit tests
    - Verify specific header retrieval scenarios
    - _Requirements: 2.1, 2.5, 2.7_

- [ ] 10. Migrate Cache Module Tests (Part 3: Header Assignment)
  - [ ] 10.1 Migrate test/cache/cache-header-assignment-property-tests.mjs to Jest
    - Create test/cache/cache-header-assignment-property-tests.jest.mjs
    - Convert header assignment property tests
    - Mock AWS DynamoDB for cache retrieval
    - Verify header assignment to connection objects
    - _Requirements: 2.1, 2.5, 2.7_
  
  - [ ] 10.2 Migrate test/cache/cache-header-assignment-integration-tests.mjs to Jest
    - Create test/cache/cache-header-assignment-integration-tests.jest.mjs
    - Convert header assignment integration tests
    - Mock AWS services for end-to-end header flow
    - Verify if-modified-since and if-none-match headers
    - _Requirements: 2.1, 2.5, 2.6, 2.7_

- [ ] 11. Migrate Cache Module Tests (Part 4: Header Validation and Sanitization)
  - [ ] 11.1 Migrate test/cache/cache-header-sanitization-tests.mjs to Jest
    - Create test/cache/cache-header-sanitization-tests.jest.mjs
    - Convert header sanitization tests
    - Verify header value cleaning and normalization
    - _Requirements: 2.1, 2.5, 2.7_
  
  - [ ] 11.2 Migrate test/cache/cache-isvalidheadervalue-property-tests.mjs to Jest
    - Create test/cache/cache-isvalidheadervalue-property-tests.jest.mjs
    - Convert isValidHeaderValue property tests
    - Verify header validation properties with fast-check
    - _Requirements: 2.1, 2.5, 2.7_
  
  - [ ] 11.3 Migrate test/cache/cache-isvalidheadervalue-unit-tests.mjs to Jest
    - Create test/cache/cache-isvalidheadervalue-unit-tests.jest.mjs
    - Convert isValidHeaderValue unit tests
    - Verify specific header validation scenarios
    - _Requirements: 2.1, 2.5, 2.7_

- [ ] 12. Migrate Cache Module Tests (Part 5: Validation)
  - [ ] 12.1 Migrate test/cache/cache-validation-tests.mjs to Jest
    - Create test/cache/cache-validation-tests.jest.mjs
    - Convert cache validation tests using subprocess isolation
    - Verify Cache.init() parameter validation
    - Handle singleton initialization constraints
    - _Requirements: 2.1, 2.7, 2.8_

- [ ] 13. Checkpoint - Verify all cache tests pass
  - Ensure all cache Jest tests pass, ask the user if questions arise.

- [ ] 14. Migrate Documentation Tests (Part 1: JSDoc Validation)
  - [ ] 14.1 Migrate test/documentation/property/jsdoc-completeness-property-tests.mjs to Jest
    - Create test/documentation/property/jsdoc-completeness-property-tests.jest.mjs
    - Convert JSDoc completeness property tests
    - Verify all public APIs have complete JSDoc
    - _Requirements: 5.1, 5.7_
  
  - [ ] 14.2 Migrate test/documentation/property/jsdoc-hallucination-detection-property-tests.mjs to Jest
    - Create test/documentation/property/jsdoc-hallucination-detection-property-tests.jest.mjs
    - Convert JSDoc hallucination detection tests
    - Verify documented parameters match function signatures
    - _Requirements: 5.1, 5.8_
  
  - [ ] 14.3 Migrate test/documentation/property/jsdoc-return-type-format-property-tests.mjs to Jest
    - Create test/documentation/property/jsdoc-return-type-format-property-tests.jest.mjs
    - Convert JSDoc return type format tests
    - Verify return type documentation format
    - _Requirements: 5.1, 5.9_
  
  - [ ] 14.4 Migrate test/documentation/property/jsdoc-throws-completeness-property-tests.mjs to Jest
    - Create test/documentation/property/jsdoc-throws-completeness-property-tests.jest.mjs
    - Convert JSDoc throws completeness tests
    - Verify error documentation completeness
    - _Requirements: 5.1, 5.10_

- [ ] 15. Migrate Documentation Tests (Part 2: Code Examples and Links)
  - [ ] 15.1 Migrate test/documentation/property/example-code-validation-property-tests.mjs to Jest
    - Create test/documentation/property/example-code-validation-property-tests.jest.mjs
    - Convert example code validation tests
    - Verify code examples are syntactically valid
    - _Requirements: 5.1, 5.4_
  
  - [ ] 15.2 Migrate test/documentation/property/executable-example-validation-property-tests.mjs to Jest
    - Create test/documentation/property/executable-example-validation-property-tests.jest.mjs
    - Convert executable example validation tests
    - Verify code examples can execute without errors
    - _Requirements: 5.1, 5.4_
  
  - [ ] 15.3 Migrate test/documentation/property/documentation-link-validity-property-tests.mjs to Jest
    - Create test/documentation/property/documentation-link-validity-property-tests.jest.mjs
    - Convert link validity property tests
    - Verify all documentation links resolve correctly
    - _Requirements: 5.1, 5.3_

- [ ] 16. Migrate Documentation Tests (Part 3: Coverage and Completeness)
  - [ ] 16.1 Migrate test/documentation/property/feature-documentation-coverage-property-tests.mjs to Jest
    - Create test/documentation/property/feature-documentation-coverage-property-tests.jest.mjs
    - Convert feature documentation coverage tests
    - Verify all features are documented
    - _Requirements: 5.1, 5.6_
  
  - [ ] 16.2 Migrate test/documentation/property/module-documentation-completeness-property-tests.mjs to Jest
    - Create test/documentation/property/module-documentation-completeness-property-tests.jest.mjs
    - Convert module documentation completeness tests
    - Verify all modules have complete documentation
    - _Requirements: 5.1, 5.11_
  
  - [ ] 16.3 Migrate test/documentation/property/readme-feature-coverage-property-tests.mjs to Jest
    - Create test/documentation/property/readme-feature-coverage-property-tests.jest.mjs
    - Convert README feature coverage tests
    - Verify README documents all major features
    - _Requirements: 5.1, 5.12_
  
  - [ ] 16.4 Migrate test/documentation/property/test-documentation-property-tests.mjs to Jest
    - Create test/documentation/property/test-documentation-property-tests.jest.mjs
    - Convert test documentation property tests
    - Verify test files have appropriate documentation
    - _Requirements: 5.1_

- [ ] 17. Migrate Documentation Tests (Part 4: Backwards Compatibility)
  - [ ] 17.1 Migrate test/documentation/property/backwards-compatibility-documentation-property-tests.mjs to Jest
    - Create test/documentation/property/backwards-compatibility-documentation-property-tests.jest.mjs
    - Convert backwards compatibility documentation tests
    - Verify breaking changes are documented
    - _Requirements: 5.1, 5.2_

- [ ] 18. Checkpoint - Verify all documentation tests pass
  - Ensure all documentation Jest tests pass, ask the user if questions arise.

- [ ] 19. Migrate Migration Validation Tests
  - [ ] 19.1 Migrate test/migration/property/test-execution-equivalence-property-tests.mjs to Jest
    - Create test/migration/property/test-execution-equivalence-property-tests.jest.mjs
    - Convert test execution equivalence property tests
    - Use direct test runner invocation (NOT npm scripts)
    - Verify Mocha and Jest produce equivalent results
    - Update to use Jest test runner for Jest tests
    - _Requirements: 6.1, 6.3, 6.5_
  
  - [ ] 19.2 Migrate test/migration/property/test-migration-completeness-property-tests.mjs to Jest
    - Create test/migration/property/test-migration-completeness-property-tests.jest.mjs
    - Convert migration completeness property tests
    - Verify all Mocha tests have Jest equivalents
    - Verify test count consistency
    - _Requirements: 6.1, 6.2, 6.4_

- [ ] 20. Checkpoint - Verify all migration validation tests pass
  - Ensure all migration validation Jest tests pass, ask the user if questions arise.

- [ ] 21. Validate Complete Migration
  - [ ] 21.1 Run both test suites and verify equivalence
    - Execute: npm run test:all
    - Verify both Mocha and Jest test suites pass
    - Compare test counts between frameworks
    - Verify no test failures or errors
    - _Requirements: 11.1, 11.2_
  
  - [ ] 21.2 Verify test coverage maintained
    - Run Jest with coverage: npm run test:jest -- --coverage
    - Compare coverage with previous Mocha coverage
    - Verify line coverage >= previous levels
    - Verify branch coverage >= previous levels
    - Verify function coverage >= previous levels
    - _Requirements: 8.4, 11.4_
  
  - [ ] 21.3 Verify no breaking changes
    - Run all existing Jest tests from previous phases
    - Verify no existing tests broken by migration
    - Verify all public APIs unchanged
    - Verify test utilities remain functional
    - _Requirements: 11.3, 11.5, 11.6, 11.7_

- [ ] 22. Checkpoint - Confirm migration validation complete
  - Ensure all validation checks pass, ask the user if questions arise.

- [ ] 23. Remove Mocha Dependencies
  - [ ] 23.1 Delete all Mocha test files
    - Delete all 38 *-tests.mjs files
    - Verify no Mocha test files remain: find test -name '*-tests.mjs'
    - _Requirements: 10.1_
  
  - [ ] 23.2 Remove Mocha from package.json devDependencies
    - Remove "mocha" from devDependencies
    - _Requirements: 10.2_
  
  - [ ] 23.3 Remove Chai from package.json devDependencies
    - Remove "chai" from devDependencies
    - _Requirements: 10.6_
  
  - [ ] 23.4 Remove Sinon from package.json devDependencies
    - Remove "sinon" from devDependencies
    - _Requirements: 10.7_
  
  - [ ] 23.5 Update npm test script to run Jest only
    - Change "test" script to run Jest
    - Update to: "node --experimental-vm-modules node_modules/jest/bin/jest.js"
    - _Requirements: 10.4_
  
  - [ ] 23.6 Remove test:all script from package.json
    - Remove "test:all" script (no longer needed)
    - _Requirements: 10.5_
  
  - [ ] 23.7 Update module-specific test scripts
    - Update test:cache to run Jest
    - Update test:config to run Jest
    - Update test:endpoint to run Jest
    - Remove Mocha-specific test scripts
    - _Requirements: 10.3_

- [ ] 24. Update CI/CD Configuration
  - [ ] 24.1 Update GitHub Actions workflow to run Jest only
    - Modify .github/workflows/test.yml
    - Change test command to: npm test
    - Update coverage upload to use coverage-jest directory
    - _Requirements: 10.8_

- [ ] 25. Update Documentation
  - [ ] 25.1 Update README.md to remove Mocha references
    - Remove Mocha test execution instructions
    - Update test examples to use Jest syntax
    - Update test command documentation
    - _Requirements: 12.1, 12.5_
  
  - [ ] 25.2 Update CONTRIBUTING.md with Jest testing guidelines
    - Remove Mocha/Chai/Sinon instructions
    - Add Jest testing patterns and best practices
    - Update test execution instructions
    - _Requirements: 12.3, 12.6_
  
  - [ ] 25.3 Update steering documents to remove Mocha references
    - Update test-requirements.md
    - Update test-execution-monitoring.md
    - Remove Mocha-specific guidance
    - _Requirements: 12.4_
  
  - [ ] 25.4 Update CHANGELOG.md with migration completion
    - Document Mocha removal
    - Document Jest-only testing
    - List removed dependencies
    - _Requirements: 12.1_

- [ ] 26. Final Validation
  - [ ] 26.1 Clean install and run all tests
    - Remove node_modules and package-lock.json
    - Run: npm install
    - Run: npm test
    - Verify all Jest tests pass
    - _Requirements: 10.9_
  
  - [ ] 26.2 Verify no Mocha artifacts remain
    - Search for Mocha files: find . -name '*mocha*'
    - Search for Chai files: find . -name '*chai*'
    - Search for Sinon files: find . -name '*sinon*'
    - Verify only node_modules results (if any)
    - _Requirements: 10.1_
  
  - [ ] 26.3 Run final test suite validation
    - Execute: npm test
    - Verify all 38 migrated test files pass
    - Verify test coverage meets requirements
    - Verify no errors or warnings
    - _Requirements: 10.9_

- [ ] 27. Final Checkpoint - Migration Complete
  - Ensure all tests pass, documentation updated, and Mocha fully removed. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Migration follows priority order: Root → Config → Security → Cache In-Memory → Cache → Documentation → Migration
- All test files must maintain equivalent test coverage to Mocha versions
- AWS service mocking requires careful handling of getter properties
- Migration validation tests must use direct test runner invocation to avoid infinite loops
- Mocha removal is the final step after all validation passes
- Both test suites must pass during migration period before Mocha removal

