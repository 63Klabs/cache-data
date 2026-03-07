# Implementation Plan: Body Validation and Header Format Fix

## Overview

This implementation adds body parameter validation to the ClientRequest class and provides a utility method for header key format conversion. The implementation follows existing validation patterns using ValidationMatcher and ValidationExecutor, ensuring consistency with path, query, header, and cookie parameter validation.

## Tasks

- [x] 1. Implement core body validation method
  - Add `#hasValidBodyParameters()` private method to ClientRequest class
  - Implement JSON parsing with error handling for `event.body`
  - Handle null, undefined, and empty string body cases (treat as empty object)
  - Use existing `#hasValidParameters()` method with body validation matcher
  - Store validated parameters in `this.#props.bodyParameters`
  - Log JSON parsing errors using `DebugAndLog.error()`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 7.1, 7.2, 7.3_

- [x] 1.1 Write property test for body validation round-trip
  - **Property 1: Body Validation Round-Trip**
  - **Validates: Requirements 1.1, 1.2, 1.3, 1.8**
  - Generate random body configurations and request bodies
  - Validate that storing then retrieving returns same data
  - _File: test/request/validation/property/body-validation-round-trip-property-tests.jest.mjs_

- [x] 2. Update validation chain to include body validation
  - Modify `#validate()` method to call `#hasValidBodyParameters()`
  - Add body validation after cookie validation in the chain
  - Maintain validation order: referrer → path → query → header → cookie → body
  - Ensure body validation failure sets `isValid` to false
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2.1 Write property test for validation failure propagation
  - **Property 2: Validation Failure Propagation**
  - **Validates: Requirements 1.4, 2.3**
  - Generate random invalid body parameters
  - Verify isValid becomes false when body validation fails
  - _File: test/request/validation/property/validation-failure-propagation-property-tests.jest.mjs_

- [x] 3. Initialize body validation matcher in constructor
  - Add `bodyParameters` entry to `this.#validationMatchers` object
  - Create ValidationMatcher with `ClientRequest.getParameterValidations()?.bodyParameters`
  - Pass `this.#httpMethod` and `this.#resourcePath` to matcher
  - Follow same pattern as other parameter type matchers
  - _Requirements: 1.1_

- [x] 4. Implement header key conversion utility method
  - Add static method `convertHeaderKeyToCamelCase(headerKey)` to ClientRequest
  - Implement conversion: lowercase then replace `-([a-z])` with uppercase letter
  - Handle null/undefined/empty input (return empty string)
  - Handle multiple hyphens correctly (e.g., `x-custom-header` → `xCustomHeader`)
  - Handle uppercase input (e.g., `Content-Type` → `contentType`)
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4.1 Write property test for header key conversion correctness
  - **Property 4: Header Key Conversion Correctness**
  - **Validates: Requirements 4.1, 4.2, 4.6**
  - Generate random kebab-case header names
  - Verify conversion produces valid camelCase JavaScript identifiers
  - _File: test/request/validation/property/header-conversion-property-tests.jest.mjs_

- [x] 4.2 Write unit tests for header key conversion
  - Test common HTTP headers (content-type, authorization, x-api-key)
  - Test multiple hyphens (x-custom-header-name)
  - Test uppercase input (Content-Type, X-API-Key)
  - Test edge cases (empty string, null, no hyphens)
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - _File: test/request/validation/unit/header-key-conversion-tests.jest.mjs_

- [x] 5. Update JSDoc documentation for ClientRequest class
  - Document header key conversion behavior in class JSDoc
  - Add header key conversion reference table to class documentation
  - Explain why conversion is necessary (JavaScript property naming)
  - Provide examples of HTTP headers and camelCase equivalents
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Update JSDoc for #hasValidHeaderParameters method
  - Document the conversion algorithm in method JSDoc
  - Explain: lowercase, then replace `-([a-z])` with uppercase letter
  - Add examples showing kebab-case → camelCase conversion
  - _Requirements: 3.5_

- [x] 7. Add JSDoc for #hasValidBodyParameters method
  - Document that method parses JSON body content before validation
  - Document support for API Gateway v1 and v2 formats
  - Document error handling for invalid JSON
  - Document that null/undefined/empty bodies are treated as empty objects
  - Add example showing internal validation flow
  - _Requirements: 1.5, 1.6, 1.7, 7.1, 7.2, 7.3_

- [x] 8. Add JSDoc for convertHeaderKeyToCamelCase method
  - Document purpose: help developers determine correct validation rule keys
  - Document conversion algorithm with examples
  - Include examples of common HTTP headers
  - Show usage in validation configuration
  - _Requirements: 4.5_

- [x] 9. Add body validation examples to ClientRequest JSDoc
  - Add example of basic body parameter validation configuration
  - Show single-field and multi-field validation
  - Demonstrate error handling for invalid body content
  - Show how to access validated body parameters using getBodyParameters()
  - Add example of complex validation (nested objects, arrays)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 10. Write unit tests for body validation
  - Test valid JSON body with valid parameters
  - Test empty body treated as empty object
  - Test body with multiple fields
  - Test invalid JSON body (parsing error)
  - Test valid JSON but fails validation rules
  - Test missing required fields
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 7.3_
  - _File: test/request/validation/unit/body-validation-tests.jest.mjs_

- [x] 11. Write property test for JSON parsing precondition
  - **Property 3: JSON Parsing Precondition**
  - **Validates: Requirements 1.5**
  - Generate random JSON strings
  - Verify validation functions receive parsed objects
  - _File: test/request/validation/property/json-parsing-property-tests.jest.mjs_

- [x] 12. Write property test for backwards compatibility
  - **Property 5: Backwards Compatibility Preservation**
  - **Validates: Requirements 6.2, 6.3**
  - Generate requests without body validation configuration
  - Verify getBodyParameters() returns empty object
  - Verify validation succeeds (assuming other validations pass)
  - _File: test/request/validation/property/backwards-compatibility-property-tests.jest.mjs_

- [x] 13. Write unit tests for validation chain
  - Test body validation included in chain
  - Test body validation executes after cookie validation
  - Test body validation failure affects overall validity
  - Test validation order maintained
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - _File: test/request/validation/unit/validation-chain-tests.jest.mjs_

- [x] 14. Write property test for common validation patterns
  - **Property 7: Common Validation Pattern Support**
  - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**
  - Test required fields validation
  - Test field types validation (string, number, boolean, array, object)
  - Test field formats validation (email, URL, date)
  - Test field constraints (min/max length, min/max value, regex)
  - Test nested object validation
  - Test array element validation
  - _File: test/request/validation/property/validation-patterns-property-tests.jest.mjs_

- [x] 15. Write property test for multi-parameter validation interface
  - **Property 8: Multi-Parameter Validation Interface**
  - **Validates: Requirements 8.7**
  - Generate single-parameter validation rules
  - Generate multi-parameter validation rules
  - Verify ValidationExecutor uses correct interface for each
  - _File: test/request/validation/property/multi-parameter-validation-property-tests.jest.mjs_

- [x] 16. Write integration tests for body validation
  - Test end-to-end body validation workflow
  - Create ClientRequest with body validation configuration
  - Validate request with body parameters
  - Verify complete flow from parsing to retrieval
  - Test with both valid and invalid bodies
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - _File: test/request/validation/integration/body-validation-integration-tests.jest.mjs_

- [x] 17. Write integration tests for validation framework
  - Test ValidationMatcher finds correct rules for body parameters
  - Test ValidationExecutor executes body validation correctly
  - Test 4-tier priority system works for body parameters
  - Test BY_METHOD_AND_ROUTE, BY_ROUTE, BY_METHOD, and global rules
  - _Requirements: 1.1_
  - _File: test/request/validation/integration/validation-framework-integration-tests.jest.mjs_

- [x] 18. Write integration tests for error handling
  - Test JSON parsing errors are logged and handled
  - Test validation exceptions are caught and logged
  - Test error states propagate correctly through validation chain
  - Verify DebugAndLog.error() is called with appropriate messages
  - _Requirements: 1.6, 7.3, 7.5_
  - _File: test/request/validation/integration/error-handling-integration-tests.jest.mjs_

- [x] 19. Checkpoint - Ensure all tests pass
  - Run all Jest tests: `npm run test:jest`
  - Run all Mocha tests: `npm test`
  - Run both test suites: `npm run test:all`
  - Verify no test failures or regressions
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Update CHANGELOG.md
  - Add entry for version 1.3.9 (if not already present)
  - Document new feature: Body parameter validation
  - Document new utility: convertHeaderKeyToCamelCase() method
  - Document improved documentation for header key conversion
  - Note backwards compatibility maintained
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 21. Final validation and review
  - Run documentation validation tests
  - Verify all JSDoc is accurate and complete
  - Check that all examples are executable
  - Verify backwards compatibility maintained
  - Run full test suite one final time
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property-based tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests validate component interactions
- All new tests MUST be written in Jest (`.jest.mjs` files)
- Body validation is opt-in - only activates when configured
- Maintains full backwards compatibility with existing code
- Uses existing ValidationMatcher and ValidationExecutor classes
- Follows existing validation patterns for consistency
