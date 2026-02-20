# Implementation Plan: API Request Pagination, Retries, and X-Ray Enhancements

## Overview

This implementation plan breaks down the enhancement of the APIRequest class into discrete, manageable tasks. The implementation will add pagination, retry logic, and improved X-Ray subsegment tracking while maintaining complete backwards compatibility.

## Tasks

- [x] 1. Add configuration defaults and merging logic
  - Add default pagination configuration object
  - Add default retry configuration object
  - Implement configuration merging in constructor using Object.assign()
  - Ensure nested retryOn object is also merged properly
  - Store merged configuration in private request object
  - _Requirements: 5.1, 5.2, 5.9_

- [x] 2. Implement retry handler
  - [x] 2.1 Create _handleRetries() private method
    - Accept options and xRaySegment parameters
    - Implement retry loop (initial attempt + retry attempts)
    - Add retry attempt logging with note updates
    - Call _httpGetExecute() for each attempt
    - Return response and retry metadata
    - _Requirements: 2.1, 2.9_
  
  - [x] 2.2 Create _shouldRetry() private method
    - Check if more retries available
    - Check for network errors (no response)
    - Check for empty/null body
    - Check for server errors (5xx)
    - Check for client errors (4xx) based on configuration
    - Check for JSON parse errors
    - Return boolean indicating whether to retry
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7_
  
  - [x] 2.3 Write Jest unit tests for retry logic
    - Test retry on network error
    - Test retry on empty response
    - Test retry on 5xx status code
    - Test no retry on 4xx status code (default)
    - Test retry on 4xx when configured
    - Test exhausted retries return last error
    - Test successful retry returns success
    - Test retry metadata accuracy
    - _Requirements: 2.1-2.12_
  
  - [x] 2.4 Write Jest property test for retry behavior
    - **Property 8: Retry Attempt Count**
    - **Property 9: Retry Opt-In**
    - **Property 10: Retry on Network Errors**
    - **Property 11: Retry on Empty Response**
    - **Property 12: Retry on Server Errors**
    - **Property 13: No Retry on Client Errors**
    - **Property 14: Retry Metadata Accuracy**
    - **Property 15: Successful Retry Returns Success**
    - **Validates: Requirements 2.1-2.12**

- [x] 3. Implement pagination handler
  - [x] 3.1 Create _handlePagination() private method
    - Check if pagination is enabled
    - Parse initial response body
    - Check for pagination indicators in response
    - Check if already on paginated request (offset > 0)
    - Calculate offsets for remaining pages
    - Return early if no more pages
    - Fetch remaining pages in batches
    - Handle errors during pagination (mark incomplete)
    - Combine all results into single response
    - Clean up pagination parameters from response
    - Add returnedItemCount to response
    - Return combined response and pagination metadata
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 1.10_
  
  - [x] 3.2 Create _fetchPage() private method
    - Clone current request with new offset
    - Update note to include offset
    - Disable pagination for sub-requests (prevent infinite loops)
    - Keep retry configuration
    - Create new APIRequest instance
    - Call send() and return response
    - _Requirements: 1.1, 1.3_
  
  - [x] 3.3 Write Jest unit tests for pagination logic
    - Test pagination with 2 pages
    - Test pagination with 5 pages
    - Test pagination with empty pages
    - Test pagination with missing indicators
    - Test pagination with offset > 0 (no pagination)
    - Test pagination error handling (incomplete)
    - Test pagination batch processing
    - Test pagination metadata accuracy
    - Test custom pagination labels
    - _Requirements: 1.1-1.10_
  
  - [x] 3.4 Write Jest property test for pagination behavior
    - **Property 1: Pagination Completeness**
    - **Property 2: Pagination Opt-In**
    - **Property 3: Pagination Batch Processing**
    - **Property 4: Pagination Label Customization**
    - **Property 5: Pagination Error Handling**
    - **Property 6: Pagination Structure Preservation**
    - **Property 7: Pagination Metadata Accuracy**
    - **Validates: Requirements 1.1-1.10**

- [x] 4. Enhance X-Ray subsegment tracking
  - [x] 4.1 Update send_get() method for unique subsegments
    - Change subsegment name to include timestamp: `APIRequest/${host}/${Date.now()}`
    - Add retry configuration to subsegment metadata (if enabled)
    - Add pagination configuration to subsegment metadata (if enabled)
    - Call _handleRetries() instead of direct _httpGetExecute()
    - Add retry metadata to subsegment annotations and metadata
    - Call _handlePagination() after retries
    - Add pagination metadata to subsegment annotations and metadata
    - Store final response and combined metadata
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.10_
  
  - [x] 4.2 Add subsegments for paginated requests
    - Create subsegment in _fetchPage() for each page
    - Include page offset in subsegment name
    - Add page metadata to subsegment
    - _Requirements: 3.7, 3.8, 3.9_
  
  - [x] 4.3 Write Jest unit tests for X-Ray enhancements
    - Test unique subsegment names for multiple requests
    - Test retry metadata in subsegment
    - Test pagination metadata in subsegment
    - Test subsegment annotations completeness
    - Test subsegments for paginated requests
    - _Requirements: 3.1-3.10_
  
  - [x] 4.4 Write Jest property test for X-Ray behavior
    - **Property 16: Unique Subsegments**
    - **Property 17: Retry Metadata in X-Ray**
    - **Property 18: Pagination Metadata in X-Ray**
    - **Property 19: X-Ray Annotations Completeness**
    - **Validates: Requirements 3.1-3.10**

- [x] 5. Update response format to include metadata
  - [x] 5.1 Add private field for response metadata
    - Add #responseMetadata private field to class
    - Initialize in constructor
    - Update in _handleRetries() and _handlePagination()
    - _Requirements: 6.1_
  
  - [x] 5.2 Modify send_get() to include metadata in response
    - Check if metadata exists (retries or pagination occurred)
    - Add metadata field to response only if present
    - Ensure metadata structure matches design
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  
  - [x] 5.3 Write Jest unit tests for metadata
    - Test metadata presence when retries occur
    - Test metadata presence when pagination occurs
    - Test metadata absence when neither occurs
    - Test metadata structure and accuracy
    - Test metadata doesn't break existing code
    - _Requirements: 6.1-6.9_
  
  - [x] 5.4 Write Jest property test for metadata behavior
    - **Property 26: Conditional Metadata Presence**
    - **Property 27: Metadata Backwards Compatibility**
    - **Validates: Requirements 6.1-6.9**

- [x] 6. Backwards compatibility validation
  - [x] 6.1 Write Jest backwards compatibility tests
    - Test constructor accepts old parameters
    - Test send() returns old format without new features
    - Test responseFormat() static method unchanged
    - Test all public methods work as before
    - Test requests without pagination behave identically
    - Test requests without retry behave identically
    - _Requirements: 4.1-4.6_
  
  - [x] 6.2 Write Jest property test for backwards compatibility
    - **Property 20: Constructor Compatibility**
    - **Property 21: Response Format Compatibility**
    - **Property 22: Static Method Compatibility**
    - **Property 23: Public API Compatibility**
    - **Validates: Requirements 4.1-4.6**
  
  - [x] 6.3 Run all existing tests to verify no breakage
    - Run existing Mocha tests: `npm test`
    - Run existing Jest tests: `npm run test:jest`
    - Verify all tests pass without modification
    - _Requirements: 4.7_

- [x] 7. Add comprehensive JSDoc documentation
  - [x] 7.1 Document new configuration options
    - Add JSDoc for pagination configuration object
    - Add JSDoc for retry configuration object
    - Include examples of minimal and custom configurations
    - Document default values for all fields
    - _Requirements: All_
  
  - [x] 7.2 Document new private methods
    - Add JSDoc for _handleRetries()
    - Add JSDoc for _shouldRetry()
    - Add JSDoc for _handlePagination()
    - Add JSDoc for _fetchPage()
    - Include @private tag
    - Include parameter and return type documentation
    - _Requirements: All_
  
  - [x] 7.3 Update existing method documentation
    - Update send() JSDoc to mention new features
    - Update send_get() JSDoc to mention new features
    - Update constructor JSDoc to document new parameters
    - Add examples showing pagination and retry usage
    - _Requirements: All_
  
  - [x] 7.4 Document response metadata structure
    - Add JSDoc for metadata object structure
    - Document retries metadata fields
    - Document pagination metadata fields
    - Include examples of metadata in responses
    - _Requirements: 6.1-6.9_

- [x] 8. Update user documentation
  - [x] 8.1 Create pagination usage guide
    - Document how to enable pagination
    - Document configuration options
    - Provide examples with different APIs
    - Document batch size configuration
    - Document custom label configuration
    - _Requirements: 1.1-1.10_
  
  - [x] 8.2 Create retry usage guide
    - Document how to enable retries
    - Document retry configuration options
    - Provide examples of retry scenarios
    - Document retry metadata usage
    - Document custom retry conditions
    - _Requirements: 2.1-2.12_
  
  - [x] 8.3 Create X-Ray tracking guide
    - Document enhanced X-Ray subsegments
    - Explain unique subsegment naming
    - Document metadata in subsegments
    - Provide examples of X-Ray traces
    - _Requirements: 3.1-3.10_
  
  - [x] 8.4 Update APIRequest README/documentation
    - Add pagination section
    - Add retry section
    - Add X-Ray enhancements section
    - Update examples to show new features
    - Add migration guide from DAO-level implementations
    - _Requirements: All_

- [x] 9. Integration testing
  - [x] 9.1 Write Jest integration tests
    - Test pagination + retries together
    - Test X-Ray tracking with pagination
    - Test X-Ray tracking with retries
    - Test X-Ray tracking with pagination + retries
    - Test real-world API response structures
    - Test error scenarios across features
    - _Requirements: All_
  
  - [x] 9.2 Write Jest property test for feature integration
    - **Property 24: Independent Feature Configuration**
    - **Property 25: Configuration Defaults**
    - **Validates: Requirements 5.8, 5.9**

- [x] 10. Update CHANGELOG.md
  - Add entry under "Unreleased" section
  - Document pagination feature addition
  - Document retry feature addition
  - Document X-Ray enhancements
  - Reference spec and GitHub issues (#171, #172, #173)
  - Note backwards compatibility maintained
  - _Requirements: All_

- [x] 11. Final validation and cleanup
  - [x] 11.1 Run full test suite
    - Run all Mocha tests: `npm test`
    - Run all Jest tests: `npm run test:jest`
    - Run all tests: `npm run test:all`
    - Verify 100% pass rate
    - _Requirements: 4.7_
  
  - [x] 11.2 Run documentation validation
    - Run documentation tests
    - Run documentation audit script
    - Verify all JSDoc is complete and accurate
    - _Requirements: All_
  
  - [x] 11.3 Code review checklist
    - Verify no breaking changes
    - Verify all tests pass
    - Verify documentation complete
    - Verify backwards compatibility
    - Verify error handling proper
    - Verify performance acceptable
    - _Requirements: All_

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- All new tests are written in Jest (not Mocha)
- Existing tests (Mocha and Jest) must pass without modification
- No breaking changes allowed - all new features are opt-in
- All tasks are required for comprehensive implementation
