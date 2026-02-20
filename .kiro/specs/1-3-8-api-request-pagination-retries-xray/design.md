# Design Document

## Overview

This design enhances the APIRequest class with three new capabilities: automatic pagination, retry logic, and improved AWS X-Ray subsegment tracking. These features are currently implemented in production DAO classes but need to be moved into APIRequest for reusability while maintaining complete backwards compatibility.

The design follows the existing APIRequest patterns and ensures that all current functionality remains unchanged when the new features are not used.

## Architecture

### Current APIRequest Structure

The APIRequest class currently handles:
- HTTP/HTTPS request construction from connection objects
- Query string building with support for array parameters
- Redirect handling (up to MAX_REDIRECTS)
- Basic X-Ray subsegment creation
- Response formatting

### Enhanced APIRequest Structure

The enhanced APIRequest will add:
- **Pagination Handler**: Internal method to handle paginated responses
- **Retry Handler**: Internal method to handle retry logic
- **Enhanced X-Ray Tracking**: Unique subsegments for each request with metadata

### Design Principles

1. **Backwards Compatibility**: All new features are opt-in via configuration
2. **Single Responsibility**: Each enhancement is a separate concern
3. **Existing Patterns**: Follow current APIRequest patterns for consistency
4. **No Breaking Changes**: Default behavior remains unchanged
5. **Metadata Return**: Return metadata about retries and pagination for calling code

## Components and Interfaces

### 1. Request Configuration Extension

The existing request object will accept new optional configuration:

```javascript
{
    // Existing fields (unchanged)
    method: "GET",
    uri: "",
    protocol: "https",
    host: "",
    path: "",
    parameters: {},
    headers: {},
    body: null,
    note: "",
    options: {
        timeout: 8000,
        separateDuplicateParameters: false,
        // ... existing options
    },
    
    // NEW: Pagination configuration (optional)
    // If pagination: { enabled: true } is passed, all other fields use defaults shown below
    pagination: {
        enabled: false,                          // Must be explicitly enabled
        totalItemsLabel: 'totalItems',           // Default: 'totalItems'
        itemsLabel: 'items',                     // Default: 'items'
        offsetLabel: 'offset',                   // Default: 'offset'
        limitLabel: 'limit',                     // Default: 'limit'
        continuationTokenLabel: null,            // Default: null (offset-based)
        responseReturnCountLabel: 'returnedItemCount', // Default: 'returnedItemCount'
        defaultLimit: 200,                       // Default: 200
        batchSize: 5                            // Default: 5
    },
    
    // NEW: Retry configuration (optional)
    // If retry: { enabled: true } is passed, all other fields use defaults shown below
    // NOTE: maxRetries is the number of RETRY attempts AFTER the initial attempt
    // Example: maxRetries: 1 means 2 total attempts (1 initial + 1 retry)
    retry: {
        enabled: false,                          // Must be explicitly enabled
        maxRetries: 1,                          // Default: 1 (means 2 total attempts)
        retryOn: {
            networkError: true,                 // Default: true
            emptyResponse: true,                // Default: true
            parseError: true,                   // Default: true
            serverError: true,                  // Default: true
            clientError: false                  // Default: false
        }
    }
}
```

**Configuration Merging:**

When a configuration object is provided, it is merged with defaults using Object.assign():

```javascript
// Example: Minimal pagination configuration
const request = {
    host: 'api.example.com',
    path: '/data',
    pagination: { enabled: true }  // All other fields use defaults
};

// Example: Custom pagination labels
const request = {
    host: 'api.example.com',
    path: '/data',
    pagination: {
        enabled: true,
        totalItemsLabel: 'total',    // Custom label
        itemsLabel: 'results',       // Custom label
        // Other fields use defaults
    }
};

// Example: Minimal retry configuration
const request = {
    host: 'api.example.com',
    path: '/data',
    retry: { enabled: true }  // maxRetries defaults to 1 (2 total attempts: 1 initial + 1 retry)
};

// Example: Custom retry configuration
const request = {
    host: 'api.example.com',
    path: '/data',
    retry: {
        enabled: true,
        maxRetries: 3,              // 4 total attempts: 1 initial + 3 retries
        retryOn: {
            clientError: true        // Override default to retry on 4xx
            // Other retryOn fields use defaults
        }
    }
};
```

### 2. Response Format Extension

The response format will be extended to include optional metadata:

```javascript
{
    // Existing fields (unchanged)
    success: boolean,
    statusCode: number,
    headers: object,
    body: string,
    message: string,
    
    // NEW: Metadata (only present when retries or pagination occur)
    metadata: {
        retries: {
            occurred: boolean,              // Whether retries happened
            attempts: number,               // Total attempts made (including initial)
            finalAttempt: number           // Which attempt succeeded
        },
        pagination: {
            occurred: boolean,              // Whether pagination happened
            totalPages: number,             // Total pages retrieved
            totalItems: number,             // Total items returned
            incomplete: boolean,            // Whether pagination failed partway
            error: string                   // Error message if incomplete
        }
    }
}
```

### 3. Internal Methods

#### _handleRetries(options, xRaySegment)

Internal method to wrap the existing _httpGetExecute with retry logic.

```javascript
/**
 * Handle request with retry logic
 * 
 * @private
 * @param {object} options - HTTPS request options
 * @param {object} xRaySegment - X-Ray subsegment for tracking
 * @returns {Promise<{response: object, metadata: object}>} Response and retry metadata
 */
async _handleRetries(options, xRaySegment) {
    const retryConfig = this.#request.retry || { enabled: false };
    const maxRetries = retryConfig.enabled ? (retryConfig.maxRetries || 1) : 0;
    
    let lastResponse = null;
    let attempts = 0;
    
    // Loop: initial attempt + retry attempts
    // If maxRetries = 1, this loops twice (attempt 0 and attempt 1)
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        attempts++;
        
        if (attempt > 0) {
            this.#request.note += ` [Retry ${attempt}/${maxRetries}]`;
            DebugAndLog.warn(`Retrying request (${this.#request.note})`);
        }
        
        // Perform the request
        await _httpGetExecute(options, this, xRaySegment);
        lastResponse = this.#response;
        
        // Check if we should retry
        const shouldRetry = this._shouldRetry(lastResponse, retryConfig, attempt, maxRetries);
        
        if (!shouldRetry) {
            break;
        }
    }
    
    return {
        response: lastResponse,
        metadata: {
            retries: {
                occurred: attempts > 1,
                attempts: attempts,
                finalAttempt: attempts
            }
        }
    };
}
```

#### _shouldRetry(response, retryConfig, currentAttempt, maxRetries)

Determines if a request should be retried based on configuration and response.

```javascript
/**
 * Determine if request should be retried
 * 
 * @private
 * @param {object} response - Current response
 * @param {object} retryConfig - Retry configuration
 * @param {number} currentAttempt - Current attempt number
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {boolean} Whether to retry
 */
_shouldRetry(response, retryConfig, currentAttempt, maxRetries) {
    // No more retries available
    if (currentAttempt >= maxRetries) {
        return false;
    }
    
    const retryOn = retryConfig.retryOn || {};
    
    // Check for network errors (no response)
    if (!response && retryOn.networkError !== false) {
        return true;
    }
    
    // Check for empty/null body
    if (retryOn.emptyResponse !== false && 
        (response.body === null || response.body === "")) {
        return true;
    }
    
    // Check for server errors (5xx)
    if (retryOn.serverError !== false && 
        response.statusCode >= 500 && response.statusCode < 600) {
        return true;
    }
    
    // Check for client errors (4xx) - default is NOT to retry
    if (retryOn.clientError === true && 
        response.statusCode >= 400 && response.statusCode < 500) {
        return true;
    }
    
    // Try to parse JSON if it's expected to be JSON
    if (retryOn.parseError !== false && response.body) {
        try {
            JSON.parse(response.body);
        } catch (error) {
            return true;
        }
    }
    
    return false;
}
```

#### _handlePagination(initialResponse)

Internal method to handle pagination after initial response.

```javascript
/**
 * Handle pagination for API responses
 * 
 * @private
 * @param {object} initialResponse - Initial API response
 * @returns {Promise<{response: object, metadata: object}>} Combined response and pagination metadata
 */
async _handlePagination(initialResponse) {
    const paginationConfig = this.#request.pagination || { enabled: false };
    
    // If pagination not enabled or initial request failed, return as-is
    if (!paginationConfig.enabled || !initialResponse.success) {
        return {
            response: initialResponse,
            metadata: { pagination: { occurred: false } }
        };
    }
    
    // Parse body to check for pagination indicators
    let body;
    try {
        body = JSON.parse(initialResponse.body);
    } catch (error) {
        // Can't paginate if body isn't JSON
        return {
            response: initialResponse,
            metadata: { pagination: { occurred: false } }
        };
    }
    
    const {
        totalItemsLabel = 'totalItems',
        itemsLabel = 'items',
        offsetLabel = 'offset',
        limitLabel = 'limit',
        continuationTokenLabel = null,
        responseReturnCountLabel = 'returnedItemCount',
        defaultLimit = 200,
        batchSize = 5
    } = paginationConfig;
    
    // Check if response has pagination indicators
    if (!(totalItemsLabel in body) || !(itemsLabel in body)) {
        return {
            response: initialResponse,
            metadata: { pagination: { occurred: false } }
        };
    }
    
    // Check if we're already on a paginated request (offset > 0)
    if (offsetLabel in this.#request.parameters && 
        this.#request.parameters[offsetLabel] > 0) {
        return {
            response: initialResponse,
            metadata: { pagination: { occurred: false } }
        };
    }
    
    const limit = this.#request.parameters[limitLabel] || defaultLimit;
    const totalRecords = body[totalItemsLabel];
    
    // Calculate offsets for remaining pages
    const offsets = [];
    for (let offset = limit; offset < totalRecords; offset += limit) {
        offsets.push(offset);
    }
    
    // If no more pages, return initial response
    if (offsets.length === 0) {
        return {
            response: initialResponse,
            metadata: { pagination: { occurred: false } }
        };
    }
    
    // Fetch remaining pages in batches
    const allResults = [];
    let incomplete = false;
    let paginationError = null;
    
    for (let i = 0; i < offsets.length; i += batchSize) {
        const batchOffsets = offsets.slice(i, i + batchSize);
        const batchPromises = batchOffsets.map(offset => 
            this._fetchPage(offset, offsetLabel, limitLabel)
        );
        
        try {
            const batchResults = await Promise.all(batchPromises);
            allResults.push(...batchResults);
        } catch (error) {
            incomplete = true;
            paginationError = error.message;
            DebugAndLog.warn(`Pagination incomplete: ${error.message}`);
            break;
        }
    }
    
    // Combine all results
    const allRecords = [
        ...body[itemsLabel],
        ...allResults.flatMap(result => {
            if (!result || !result.body) {
                incomplete = true;
                return [];
            }
            try {
                const pageBody = JSON.parse(result.body);
                return pageBody[itemsLabel] || [];
            } catch (error) {
                incomplete = true;
                return [];
            }
        })
    ];
    
    // Build combined response
    const combinedBody = {
        ...body,
        [itemsLabel]: allRecords
    };
    
    // Clean up pagination parameters from response
    delete combinedBody[offsetLabel];
    delete combinedBody[limitLabel];
    combinedBody[responseReturnCountLabel] = allRecords.length;
    
    const combinedResponse = {
        ...initialResponse,
        body: JSON.stringify(combinedBody)
    };
    
    return {
        response: combinedResponse,
        metadata: {
            pagination: {
                occurred: true,
                totalPages: allResults.length + 1,
                totalItems: allRecords.length,
                incomplete: incomplete,
                error: paginationError
            }
        }
    };
}
```

#### _fetchPage(offset, offsetLabel, limitLabel)

Fetches a single page of paginated results.

```javascript
/**
 * Fetch a single page of paginated results
 * 
 * @private
 * @param {number} offset - Offset for this page
 * @param {string} offsetLabel - Parameter name for offset
 * @param {string} limitLabel - Parameter name for limit
 * @returns {Promise<object>} Page response
 */
async _fetchPage(offset, offsetLabel, limitLabel) {
    // Clone the current request
    const pageRequest = {
        ...this.#request,
        parameters: {
            ...this.#request.parameters,
            [offsetLabel]: offset
        },
        note: `${this.#request.note} [Offset ${offset}]`,
        // Disable pagination for sub-requests to avoid infinite loops
        pagination: { enabled: false },
        // Keep retry configuration
        retry: this.#request.retry
    };
    
    // Create new APIRequest instance for this page
    const pageApiRequest = new APIRequest(pageRequest);
    return await pageApiRequest.send();
}
```

### 4. Enhanced X-Ray Subsegments

The existing X-Ray subsegment creation will be enhanced to:
1. Use unique names for each request (include timestamp or counter)
2. Add retry and pagination metadata
3. Create separate subsegments for paginated requests

```javascript
// In send_get() method, enhance subsegment creation:

const subsegmentName = `APIRequest/${this.getHost()}/${Date.now()}`;

await AWSXRay.captureAsyncFunc(subsegmentName, async (subsegment) => {
    subsegment.namespace = 'remote';
    
    // Existing annotations
    subsegment.addAnnotation('request_method', this.getMethod());
    subsegment.addAnnotation('request_host', this.getHost());
    subsegment.addAnnotation('request_uri', this.getURI(false));
    subsegment.addAnnotation('request_note', this.getNote());
    
    // NEW: Add retry and pagination info to metadata
    if (this.#request.retry?.enabled) {
        subsegment.addMetadata('retry_config', this.#request.retry);
    }
    
    if (this.#request.pagination?.enabled) {
        subsegment.addMetadata('pagination_config', this.#request.pagination);
    }
    
    // Perform request with retries
    const { response, metadata } = await this._handleRetries(options, subsegment);
    
    // Add retry metadata to subsegment
    if (metadata.retries?.occurred) {
        subsegment.addAnnotation('retry_attempts', metadata.retries.attempts);
        subsegment.addMetadata('retry_details', metadata.retries);
    }
    
    // Handle pagination if enabled
    const { response: finalResponse, metadata: paginationMetadata } = 
        await this._handlePagination(response);
    
    // Add pagination metadata to subsegment
    if (paginationMetadata.pagination?.occurred) {
        subsegment.addAnnotation('pagination_pages', paginationMetadata.pagination.totalPages);
        subsegment.addAnnotation('pagination_items', paginationMetadata.pagination.totalItems);
        subsegment.addMetadata('pagination_details', paginationMetadata.pagination);
    }
    
    // Store final response and metadata
    this.#response = finalResponse;
    this.#responseMetadata = {
        ...metadata,
        ...paginationMetadata
    };
    
    return true;
});
```

## Data Models

### Request Object (Extended)

```javascript
{
    // Existing fields (unchanged)
    method: string,
    uri: string,
    protocol: string,
    host: string,
    path: string,
    parameters: object,
    headers: object,
    body: string|null,
    note: string,
    options: {
        timeout: number,
        separateDuplicateParameters: boolean,
        separateDuplicateParametersAppendToKey: string,
        combinedDuplicateParameterDelimiter: string
    },
    
    // NEW: Optional pagination configuration
    pagination: {
        enabled: boolean,
        totalItemsLabel: string,
        itemsLabel: string,
        offsetLabel: string,
        limitLabel: string,
        continuationTokenLabel: string|null,
        responseReturnCountLabel: string,
        defaultLimit: number,
        batchSize: number
    },
    
    // NEW: Optional retry configuration
    retry: {
        enabled: boolean,
        maxRetries: number,
        retryOn: {
            networkError: boolean,
            emptyResponse: boolean,
            parseError: boolean,
            serverError: boolean,
            clientError: boolean
        }
    }
}
```

### Response Object (Extended)

```javascript
{
    // Existing fields (unchanged)
    success: boolean,
    statusCode: number,
    headers: object,
    body: string,
    message: string,
    
    // NEW: Optional metadata
    metadata: {
        retries: {
            occurred: boolean,
            attempts: number,
            finalAttempt: number
        },
        pagination: {
            occurred: boolean,
            totalPages: number,
            totalItems: number,
            incomplete: boolean,
            error: string|null
        }
    }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, here are the correctness properties for this feature:

### Pagination Properties

**Property 1: Pagination Completeness**
*For any* API response with pagination indicators and pagination enabled, all pages should be retrieved and combined into a single response with all items from all pages.
**Validates: Requirements 1.1, 1.8**

**Property 2: Pagination Opt-In**
*For any* request without pagination configuration, the response should be identical to the current behavior with no pagination occurring.
**Validates: Requirements 1.2, 4.5**

**Property 3: Pagination Batch Processing**
*For any* pagination configuration with batch size N, concurrent requests should not exceed N at any given time.
**Validates: Requirements 1.3**

**Property 4: Pagination Label Customization**
*For any* set of custom pagination labels, the pagination logic should correctly navigate the API response structure using those labels.
**Validates: Requirements 1.4, 5.3**

**Property 5: Pagination Error Handling**
*For any* pagination sequence where a subsequent page fails, partial results should be returned with metadata indicating incomplete pagination.
**Validates: Requirements 1.5**

**Property 6: Pagination Structure Preservation**
*For any* paginated response, all original response fields except the items array should be preserved in the combined response.
**Validates: Requirements 1.10**

**Property 7: Pagination Metadata Accuracy**
*For any* paginated response, the metadata should accurately reflect the total pages retrieved and total items returned.
**Validates: Requirements 1.9, 6.5, 6.6**

### Retry Properties

**Property 8: Retry Attempt Count**
*For any* retry configuration with maxRetries=N, the total number of attempts should not exceed N+1 (initial + retries).
**Validates: Requirements 2.1, 6.2**

**Property 9: Retry Opt-In**
*For any* request without retry configuration, only a single attempt should be made matching current behavior.
**Validates: Requirements 2.2, 4.6**

**Property 10: Retry on Network Errors**
*For any* request that fails with a network error and retry enabled, the request should be retried up to the maximum attempts.
**Validates: Requirements 2.3**

**Property 11: Retry on Empty Response**
*For any* request that returns an empty or null body and retry enabled, the request should be retried.
**Validates: Requirements 2.4**

**Property 12: Retry on Server Errors**
*For any* request that returns a 5xx status code and retry enabled, the request should be retried.
**Validates: Requirements 2.6**

**Property 13: No Retry on Client Errors**
*For any* request that returns a 4xx status code with default retry configuration, the request should NOT be retried.
**Validates: Requirements 2.7**

**Property 14: Retry Metadata Accuracy**
*For any* request with retries, the response metadata should accurately reflect the number of attempts made.
**Validates: Requirements 2.9, 6.3**

**Property 15: Successful Retry Returns Success**
*For any* request that fails initially but succeeds on retry, the final response should be successful with metadata indicating retries occurred.
**Validates: Requirements 2.12**

### X-Ray Properties

**Property 16: Unique Subsegments**
*For any* multiple requests to the same endpoint, each request should create a unique X-Ray subsegment with a distinct name.
**Validates: Requirements 3.1, 3.10**

**Property 17: Retry Metadata in X-Ray**
*For any* request with retries, the X-Ray subsegment should include retry count and details in metadata.
**Validates: Requirements 3.2**

**Property 18: Pagination Metadata in X-Ray**
*For any* request with pagination, the X-Ray subsegment should include pagination details in metadata.
**Validates: Requirements 3.3, 3.8, 3.9**

**Property 19: X-Ray Annotations Completeness**
*For any* request, the X-Ray subsegment should include method, host, path, note, and status code as annotations.
**Validates: Requirements 3.4, 3.5**

### Backwards Compatibility Properties

**Property 20: Constructor Compatibility**
*For any* request object that worked with the previous APIRequest version, the constructor should accept it without errors.
**Validates: Requirements 4.1**

**Property 21: Response Format Compatibility**
*For any* request without pagination or retry options, the response format should match the previous APIRequest version exactly.
**Validates: Requirements 4.2**

**Property 22: Static Method Compatibility**
*For any* call to APIRequest.responseFormat(), the method should work identically to the previous version.
**Validates: Requirements 4.3**

**Property 23: Public API Compatibility**
*For any* public method on APIRequest, the method signature and behavior should match the previous version when new features are not used.
**Validates: Requirements 4.4**

### Configuration Properties

**Property 24: Independent Feature Configuration**
*For any* combination of pagination and retry configurations, each feature should work independently without affecting the other.
**Validates: Requirements 5.8**

**Property 25: Configuration Defaults**
*For any* pagination or retry configuration with missing fields, sensible defaults should be applied.
**Validates: Requirements 5.9**

### Metadata Properties

**Property 26: Conditional Metadata Presence**
*For any* request without retries or pagination, the response should not include metadata fields.
**Validates: Requirements 6.8**

**Property 27: Metadata Backwards Compatibility**
*For any* existing code that expects the current response format, adding metadata should not break that code.
**Validates: Requirements 6.9**

## Error Handling

### Retry Error Handling

1. **Network Errors**: Caught and retried based on configuration
2. **Parse Errors**: Caught and retried based on configuration
3. **Empty Responses**: Detected and retried based on configuration
4. **Server Errors (5xx)**: Retried based on configuration
5. **Client Errors (4xx)**: Not retried by default
6. **Exhausted Retries**: Return last error response with metadata

### Pagination Error Handling

1. **Missing Pagination Indicators**: Return initial response without pagination
2. **Invalid JSON**: Return initial response without pagination
3. **Page Fetch Failure**: Return partial results with incomplete flag
4. **Parse Error on Page**: Skip that page, mark as incomplete
5. **Network Error on Page**: Stop pagination, return partial results

### X-Ray Error Handling

1. **X-Ray Not Available**: Use mock proxy, continue operation
2. **Subsegment Creation Failure**: Log error, continue without X-Ray
3. **Metadata Addition Failure**: Log error, continue operation

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

### Test Framework

**All new tests will be written in Jest** (not Mocha). The repository is migrating to Jest, and new features should use Jest exclusively.

- **Test Runner**: Jest with ES modules support
- **Assertions**: Jest expect assertions
- **Property Testing**: fast-check library
- **Mocking**: Jest mocking capabilities

### Unit Testing Focus

Unit tests should cover:
- Specific pagination scenarios (2 pages, 5 pages, empty pages)
- Specific retry scenarios (1 retry, 3 retries, exhausted retries)
- Error conditions (network errors, parse errors, server errors)
- Edge cases (empty responses, malformed JSON, missing fields)
- X-Ray subsegment creation and metadata
- Backwards compatibility (requests without new features)

### Property-Based Testing Configuration

- Use fast-check library for property generation
- Minimum 100 iterations per property test
- Each property test references its design document property
- Tag format: **Feature: api-request-pagination-retries-xray, Property {number}: {property_text}**

### Test Organization

```
test/
├── request/
│   ├── api-request-pagination-tests.jest.mjs
│   ├── api-request-retry-tests.jest.mjs
│   ├── api-request-xray-tests.jest.mjs
│   ├── api-request-backwards-compat-tests.jest.mjs
│   └── property/
│       ├── api-request-pagination-property-tests.jest.mjs
│       ├── api-request-retry-property-tests.jest.mjs
│       ├── api-request-xray-property-tests.jest.mjs
│       └── api-request-compatibility-property-tests.jest.mjs
```

### Running Tests

```bash
# Run all Jest tests
npm run test:jest

# Run all tests (Mocha + Jest)
npm run test:all

# Run specific Jest test file
node --experimental-vm-modules node_modules/jest/bin/jest.js test/request/api-request-pagination-tests.jest.mjs
```

### Mocking Strategy

- Mock HTTPS requests using Jest mocks
- Mock X-Ray subsegments for testing
- Mock API responses with various pagination structures
- Mock network errors and timeouts
- Do NOT modify existing APIRequest tests (Mocha or Jest versions)

### Integration Testing

Integration tests should verify:
- Pagination + Retries working together
- X-Ray tracking with pagination and retries
- Real-world API response structures
- Performance with large paginated datasets

## Implementation Notes

### Configuration Defaults and Merging

The implementation will use Object.assign() to merge provided configuration with defaults:

```javascript
// In constructor or initialization
const defaultPaginationConfig = {
    enabled: false,
    totalItemsLabel: 'totalItems',
    itemsLabel: 'items',
    offsetLabel: 'offset',
    limitLabel: 'limit',
    continuationTokenLabel: null,
    responseReturnCountLabel: 'returnedItemCount',
    defaultLimit: 200,
    batchSize: 5
};

const defaultRetryConfig = {
    enabled: false,
    maxRetries: 1,
    retryOn: {
        networkError: true,
        emptyResponse: true,
        parseError: true,
        serverError: true,
        clientError: false
    }
};

// Merge with provided configuration
this.#request.pagination = Object.assign({}, defaultPaginationConfig, request.pagination || {});
this.#request.retry = Object.assign({}, defaultRetryConfig, request.retry || {});

// For nested retryOn object, also merge
if (request.retry?.retryOn) {
    this.#request.retry.retryOn = Object.assign(
        {},
        defaultRetryConfig.retryOn,
        request.retry.retryOn
    );
}
```

This ensures that:
- `{ pagination: { enabled: true } }` uses all default values
- `{ retry: { enabled: true } }` uses all default values
- Partial configurations merge with defaults
- Developers can override only the fields they need

### Backwards Compatibility Guarantees

1. **No Changes to Existing Behavior**: When pagination and retry are not configured, behavior is identical to current implementation
2. **No Changes to Constructor**: Constructor accepts same parameters as before
3. **No Changes to Public Methods**: All public methods maintain same signatures
4. **No Changes to Response Format**: Response format unchanged when new features not used
5. **Metadata is Additive**: Metadata field is added, not replacing existing fields
6. **All Existing Tests Pass**: No modifications to existing tests required

### Performance Considerations

1. **Pagination Batching**: Concurrent requests limited by batchSize to avoid overwhelming APIs
2. **Retry Delays**: Consider adding exponential backoff in future enhancement
3. **Memory Usage**: Large paginated responses may consume significant memory
4. **X-Ray Overhead**: Minimal overhead from additional metadata

### Security Considerations

1. **No Sensitive Data in Logs**: Retry and pagination logs should not include sensitive data
2. **X-Ray Metadata**: Ensure no sensitive data in X-Ray metadata
3. **Error Messages**: Error messages should not expose internal implementation details

### Future Enhancements

1. **Exponential Backoff**: Add configurable delay between retries
2. **Token-Based Pagination**: Full implementation of continuation token pagination
3. **Retry Callbacks**: Allow custom retry decision logic
4. **Pagination Callbacks**: Allow custom page processing logic
5. **Circuit Breaker**: Add circuit breaker pattern for repeated failures
