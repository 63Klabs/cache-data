# Requirements Document

## Introduction

The APIRequest class in the @63klabs/cache-data package requires enhancements to support pagination, automatic retries, and improved AWS X-Ray tracing. These features are currently implemented in production code within individual DAO classes but need to be moved into the APIRequest class for reusability across projects while maintaining backwards compatibility.

## Glossary

- **APIRequest**: The class in src/lib/tools/APIRequest.class.js that handles HTTP/HTTPS requests
- **DAO**: Data Access Object - classes that use APIRequest to interact with external APIs
- **Pagination**: The process of retrieving data in multiple requests when the API returns results in pages
- **Retry**: Automatically re-attempting a failed request a specified number of times
- **X-Ray**: AWS X-Ray distributed tracing service for monitoring and debugging
- **Subsegment**: A custom X-Ray trace segment that tracks a specific operation within a request
- **Continuation Token**: A token provided by an API to retrieve the next page of results
- **Response Metadata**: Additional information about the API response including retry count and pagination details

## Requirements

### Requirement 1: Pagination Support

**User Story:** As a developer using APIRequest, I want automatic pagination support, so that I can retrieve all results from paginated APIs without writing custom pagination logic in each DAO class.

#### Acceptance Criteria

1. WHEN pagination options are provided to APIRequest, THE APIRequest SHALL automatically retrieve all pages of results
2. WHEN pagination is not configured, THE APIRequest SHALL return only the initial response without pagination
3. WHEN pagination options specify batch size, THE APIRequest SHALL process pagination requests in concurrent batches
4. WHEN pagination options specify labels for total items, items array, offset, and limit, THE APIRequest SHALL use those labels to navigate the API response structure
5. WHEN pagination encounters an error on a subsequent page, THE APIRequest SHALL return partial results with metadata indicating incomplete pagination
6. WHEN the initial response does not contain pagination indicators, THE APIRequest SHALL return the initial response without attempting pagination
7. WHEN pagination options include a continuation token label, THE APIRequest SHALL support token-based pagination in addition to offset-based pagination
8. THE APIRequest SHALL combine all paginated results into a single response object with the items array containing all retrieved items
9. THE APIRequest SHALL include pagination metadata in the response indicating total pages retrieved and total items returned
10. THE APIRequest SHALL preserve the original response structure while replacing the items array with the combined results

### Requirement 2: Automatic Retry Support

**User Story:** As a developer using APIRequest, I want automatic retry functionality, so that transient network errors and temporary API failures are handled gracefully without custom retry logic in each DAO class.

#### Acceptance Criteria

1. WHEN retry options are provided to APIRequest, THE APIRequest SHALL automatically retry failed requests up to the specified maximum
2. WHEN retry options are not provided, THE APIRequest SHALL default to a single attempt with no retries
3. WHEN a request fails with a network error, THE APIRequest SHALL retry the request
4. WHEN a request returns an empty or null body, THE APIRequest SHALL retry the request
5. WHEN a request fails to parse JSON, THE APIRequest SHALL retry the request
6. WHEN a request returns a 5xx status code, THE APIRequest SHALL retry the request
7. WHEN a request returns a 4xx status code, THE APIRequest SHALL NOT retry the request
8. WHEN all retry attempts are exhausted, THE APIRequest SHALL return the last error response
9. THE APIRequest SHALL include retry metadata in the response indicating the number of attempts made
10. THE APIRequest SHALL log each retry attempt with appropriate warning messages
11. THE APIRequest SHALL respect the timeout setting for each individual retry attempt
12. WHEN a retry succeeds, THE APIRequest SHALL return the successful response with metadata indicating retries occurred

### Requirement 3: Enhanced X-Ray Subsegments

**User Story:** As a developer monitoring API performance, I want detailed X-Ray subsegments for each distinct API call, so that I can track and debug individual requests even when multiple requests are made to the same endpoint within a single Lambda invocation.

#### Acceptance Criteria

1. WHEN multiple requests are made to the same endpoint, THE APIRequest SHALL create a unique subsegment for each request
2. WHEN a request includes retry attempts, THE X-Ray subsegment SHALL include retry count in metadata
3. WHEN a request includes pagination, THE X-Ray subsegment SHALL include pagination details in metadata
4. THE X-Ray subsegment SHALL include the request method, host, path, and note as annotations
5. THE X-Ray subsegment SHALL include the response status code as an annotation
6. THE X-Ray subsegment SHALL include timing information for the complete request including all retries and pagination
7. WHEN pagination occurs, THE APIRequest SHALL create separate subsegments for each paginated request
8. THE X-Ray subsegment SHALL include the total number of pages retrieved in metadata
9. THE X-Ray subsegment SHALL include the total number of items retrieved in metadata
10. THE X-Ray subsegment SHALL use a unique name that includes the request note or timestamp to ensure distinct tracking

### Requirement 4: Backwards Compatibility

**User Story:** As a developer using the existing APIRequest class, I want all current functionality to remain unchanged, so that my existing code continues to work without modification.

#### Acceptance Criteria

1. THE APIRequest constructor SHALL accept the same parameters as before
2. THE APIRequest.send() method SHALL return the same response format as before when pagination and retry options are not provided
3. THE APIRequest.responseFormat() static method SHALL remain unchanged
4. THE APIRequest class SHALL maintain all existing public methods with unchanged signatures
5. WHEN no pagination options are provided, THE APIRequest SHALL behave exactly as it does currently
6. WHEN no retry options are provided, THE APIRequest SHALL behave exactly as it does currently
7. ALL existing tests SHALL pass without modification
8. THE APIRequest class SHALL not introduce any breaking changes to the public API

### Requirement 5: Configuration Flexibility

**User Story:** As a developer implementing a DAO class, I want to configure pagination and retry options per endpoint, so that I can customize behavior based on the specific API's requirements.

#### Acceptance Criteria

1. WHEN pagination options are provided in the request object, THE APIRequest SHALL use those options
2. WHEN retry options are provided in the request object, THE APIRequest SHALL use those options
3. THE pagination options SHALL support customizable labels for API response fields
4. THE pagination options SHALL support both offset-based and token-based pagination
5. THE pagination options SHALL support configurable batch size for concurrent requests
6. THE retry options SHALL support configurable maximum retry attempts
7. THE retry options SHALL support configurable timeout per attempt
8. THE pagination and retry options SHALL be optional and independent of each other
9. THE APIRequest SHALL provide sensible defaults for all pagination and retry options
10. THE DAO class SHALL be able to define default pagination options that can be overridden per request

### Requirement 6: Response Metadata

**User Story:** As a developer calling APIRequest, I want metadata about retries and pagination in the response, so that I can make informed decisions about caching, logging, and error handling.

#### Acceptance Criteria

1. THE APIRequest response SHALL include a metadata object with retry information
2. THE metadata object SHALL include the total number of attempts made
3. THE metadata object SHALL include whether retries occurred
4. THE metadata object SHALL include pagination information when pagination was used
5. THE metadata object SHALL include the total number of pages retrieved
6. THE metadata object SHALL include the total number of items returned
7. THE metadata object SHALL indicate if pagination was incomplete due to errors
8. THE metadata object SHALL be optional and only present when retries or pagination occur
9. THE metadata object SHALL not break existing code that expects the current response format
10. THE calling function SHALL be able to use metadata to perform its own retry logic if needed
