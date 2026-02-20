# APIRequest Retry Guide

## Overview

The APIRequest class provides automatic retry functionality for handling transient network errors and temporary API failures. When enabled, APIRequest will automatically retry failed requests based on configurable conditions, eliminating the need for manual retry logic in your code.

## When to Use Retry

Use retry when:
- APIs may experience temporary failures or network issues
- You want to handle transient errors gracefully
- Server errors (5xx) should be retried automatically
- Network timeouts should trigger retries
- You want consistent retry behavior across all API calls

## Basic Usage

### Minimal Configuration

Enable retry with default settings by passing `{ enabled: true }`:

```javascript
const { tools } = require('@63klabs/cache-data');

const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true  // All other fields use defaults
  }
});

const response = await request.send();

// If the request failed initially but succeeded on retry,
// response.metadata will indicate retries occurred
if (response.metadata?.retries?.occurred) {
  console.log(`Request succeeded after ${response.metadata.retries.attempts} attempts`);
}
```

### How It Works

1. APIRequest makes the initial request
2. If the request fails with a retryable condition, a retry is attempted
3. The request is retried up to `maxRetries` times (default: 1 retry = 2 total attempts)
4. If a retry succeeds, the successful response is returned with metadata
5. If all retries are exhausted, the last error response is returned with metadata

**Important**: `maxRetries` is the number of RETRY attempts AFTER the initial attempt.
- `maxRetries: 1` means 2 total attempts (1 initial + 1 retry)
- `maxRetries: 3` means 4 total attempts (1 initial + 3 retries)

## Configuration Options

### Default Configuration

When you enable retry, these defaults are used:

```javascript
const defaultRetryConfig = {
  enabled: false,                          // Must be explicitly enabled
  maxRetries: 1,                          // 1 retry = 2 total attempts
  retryOn: {
    networkError: true,                   // Retry on network errors
    emptyResponse: true,                  // Retry on empty/null body
    parseError: true,                     // Retry on JSON parse errors
    serverError: true,                    // Retry on 5xx status codes
    clientError: false                    // Do NOT retry on 4xx status codes
  }
};
```

### Custom Retry Count

Control the maximum number of retry attempts:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 3  // 4 total attempts: 1 initial + 3 retries
  }
});
```

### Custom Retry Conditions

Customize which conditions trigger retries:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 2,
    retryOn: {
      networkError: true,      // Retry on network errors
      emptyResponse: false,    // Don't retry on empty responses
      parseError: true,        // Retry on JSON parse errors
      serverError: true,       // Retry on 5xx errors
      clientError: true        // Also retry on 4xx errors (not default)
    }
  }
});
```

## Retry Conditions

### Network Errors

Retry when the request fails with a network error (no response received):

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    retryOn: {
      networkError: true  // Default: true
    }
  }
});

// Will retry if:
// - Connection timeout
// - DNS resolution failure
// - Connection refused
// - Network unreachable
```

### Empty Response

Retry when the response body is empty or null:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    retryOn: {
      emptyResponse: true  // Default: true
    }
  }
});

// Will retry if:
// - response.body === null
// - response.body === ""
```

### Parse Errors

Retry when the response body cannot be parsed as JSON:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    retryOn: {
      parseError: true  // Default: true
    }
  }
});

// Will retry if:
// - JSON.parse(response.body) throws an error
```

### Server Errors (5xx)

Retry when the server returns a 5xx status code:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    retryOn: {
      serverError: true  // Default: true
    }
  }
});

// Will retry if:
// - 500 Internal Server Error
// - 502 Bad Gateway
// - 503 Service Unavailable
// - 504 Gateway Timeout
// - Any other 5xx status code
```

### Client Errors (4xx)

By default, client errors are NOT retried (they usually indicate a problem with the request):

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    retryOn: {
      clientError: false  // Default: false
    }
  }
});

// Will NOT retry on:
// - 400 Bad Request
// - 401 Unauthorized
// - 403 Forbidden
// - 404 Not Found
// - 429 Too Many Requests
// - Any other 4xx status code
```

However, you can enable retry for 4xx errors if needed:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    retryOn: {
      clientError: true  // Retry on 4xx errors
    }
  }
});

// Use case: API returns 429 (rate limit) and you want to retry
```

## Response Format

### Successful Retry

When a request fails initially but succeeds on retry:

```javascript
const successfulRetryResponse = {
  success: true,
  statusCode: 200,
  headers: { /* response headers */ },
  body: '{"data":"value"}',
  message: 'OK',
  metadata: {
    retries: {
      occurred: true,       // Retries happened
      attempts: 2,          // Total attempts made (initial + retries)
      finalAttempt: 2       // Which attempt succeeded
    }
  }
};
```

### Exhausted Retries

When all retry attempts fail:

```javascript
const exhaustedRetriesResponse = {
  success: false,
  statusCode: 503,
  headers: { /* response headers */ },
  body: '{"error":"Service Unavailable"}',
  message: 'Service Unavailable',
  metadata: {
    retries: {
      occurred: true,       // Retries happened
      attempts: 4,          // Total attempts made (1 initial + 3 retries)
      finalAttempt: 4       // Last attempt failed
    }
  }
};
```

### No Retry

When retry is not enabled or not needed:

```javascript
const noRetryResponse = {
  success: true,
  statusCode: 200,
  headers: { /* response headers */ },
  body: '{"data":"value"}',
  message: 'OK'
  // No metadata field
};
```

## Examples

### Example 1: Basic Retry for Transient Errors

```javascript
const { tools } = require('@63klabs/cache-data');

const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 2  // 3 total attempts
  }
});

const response = await request.send();

if (response.success) {
  console.log('Request succeeded');
  
  if (response.metadata?.retries?.occurred) {
    console.log(`Succeeded after ${response.metadata.retries.attempts} attempts`);
  }
} else {
  console.error('Request failed after all retries');
  console.error(`Attempts: ${response.metadata.retries.attempts}`);
}
```

### Example 2: Retry with Custom Conditions

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 3,
    retryOn: {
      networkError: true,
      emptyResponse: true,
      parseError: false,      // Don't retry parse errors
      serverError: true,
      clientError: false
    }
  }
});

const response = await request.send();
```

### Example 3: Retry on Rate Limits (4xx)

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  retry: {
    enabled: true,
    maxRetries: 5,  // More retries for rate limits
    retryOn: {
      clientError: true  // Retry on 429 Too Many Requests
    }
  }
});

const response = await request.send();

if (response.statusCode === 429 && !response.success) {
  console.error('Rate limit exceeded even after retries');
}
```

### Example 4: Handling Retry Metadata

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 2
  }
});

const response = await request.send();

// Check if retries occurred
if (response.metadata?.retries?.occurred) {
  console.log('Retry statistics:');
  console.log(`- Total attempts: ${response.metadata.retries.attempts}`);
  console.log(`- Final attempt: ${response.metadata.retries.finalAttempt}`);
  console.log(`- Success: ${response.success}`);
  
  // Log for monitoring
  tools.DebugAndLog.log(
    `API request required ${response.metadata.retries.attempts} attempts`,
    'RETRY'
  );
}
```

### Example 5: Retry with Timeout

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/slow-endpoint',
  options: {
    timeout: 5000  // 5 second timeout per attempt
  },
  retry: {
    enabled: true,
    maxRetries: 2  // Retry timeouts
  }
});

// Each attempt has a 5 second timeout
// Total possible time: 15 seconds (3 attempts × 5 seconds)
const response = await request.send();
```

## Retry Behavior

### When Retry Occurs

A retry will occur when ALL of these conditions are met:

1. `retry.enabled` is `true`
2. Current attempt number < `maxRetries`
3. One of the retry conditions is met:
   - Network error AND `retryOn.networkError` is `true`
   - Empty response AND `retryOn.emptyResponse` is `true`
   - Parse error AND `retryOn.parseError` is `true`
   - 5xx status code AND `retryOn.serverError` is `true`
   - 4xx status code AND `retryOn.clientError` is `true`

### When Retry Does NOT Occur

A retry will NOT occur when:

- `retry.enabled` is `false` or not set
- Maximum retries have been exhausted
- Response is successful (2xx status code)
- Response is a 3xx redirect (handled separately)
- Response is a 4xx error and `retryOn.clientError` is `false` (default)
- None of the retry conditions are met

### Retry Logging

Each retry attempt is logged as a warning:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  note: 'Fetch user data',
  retry: {
    enabled: true,
    maxRetries: 2
  }
});

const response = await request.send();

// Logs (if retries occur):
// [WARN] Retrying request (Fetch user data [Retry 1/2])
// [WARN] Retrying request (Fetch user data [Retry 2/2])
```

Set `LOG_LEVEL=WARN` or higher to see retry logs.

## Error Handling

### Network Errors

```javascript
const request = new tools.APIRequest({
  host: 'unreachable-api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 2
  }
});

const response = await request.send();

if (!response.success) {
  console.error('Network error after all retries');
  console.error(`Attempts: ${response.metadata.retries.attempts}`);
  
  // Handle the error appropriately
  // - Log to monitoring system
  // - Return cached data
  // - Return error to client
}
```

### Server Errors

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 3
  }
});

const response = await request.send();

if (response.statusCode >= 500 && !response.success) {
  console.error(`Server error ${response.statusCode} after ${response.metadata.retries.attempts} attempts`);
  
  // Decide on fallback strategy
  if (response.metadata.retries.attempts >= 4) {
    // All retries exhausted, use fallback
    return getFallbackData();
  }
}
```

### Partial Success

Some requests may succeed on retry after initial failures:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 2
  }
});

const response = await request.send();

if (response.success && response.metadata?.retries?.occurred) {
  // Request succeeded but required retries
  console.log(`Request succeeded on attempt ${response.metadata.retries.finalAttempt}`);
  
  // Consider logging for monitoring
  if (response.metadata.retries.attempts > 2) {
    tools.DebugAndLog.warn('API required multiple retries', {
      attempts: response.metadata.retries.attempts,
      endpoint: request.getHost() + request.getPath()
    });
  }
}
```

## Performance Considerations

### Timeout Per Attempt

Each retry attempt respects the timeout setting:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  options: {
    timeout: 3000  // 3 seconds per attempt
  },
  retry: {
    enabled: true,
    maxRetries: 2  // 3 total attempts
  }
});

// Maximum possible time: 9 seconds (3 attempts × 3 seconds)
const response = await request.send();
```

### Lambda Timeout

Ensure your Lambda function timeout accommodates retries:

```javascript
// In CloudFormation template
Resources:
  MyFunction:
    Type: AWS::Lambda::Function
    Properties:
      Timeout: 30  # 30 seconds to allow for retries
```

### Retry Delays

Currently, retries happen immediately without delay. Future enhancement will add exponential backoff:

```javascript
// Current behavior: immediate retry
// Attempt 1: 0ms
// Attempt 2: 0ms (immediate)
// Attempt 3: 0ms (immediate)

// Future enhancement: exponential backoff
// Attempt 1: 0ms
// Attempt 2: 1000ms delay
// Attempt 3: 2000ms delay
// Attempt 4: 4000ms delay
```

## Combining with Other Features

### Retry + Pagination

Retry works seamlessly with pagination:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 2
  },
  pagination: {
    enabled: true
  }
});

// Each page request will be retried if it fails
// Pagination metadata will indicate if any pages failed after retries
const response = await request.send();
```

### Retry + X-Ray

Retry attempts are tracked in X-Ray subsegments:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 2
  }
});

const response = await request.send();

// X-Ray subsegment will include:
// - retry_attempts annotation (number of attempts)
// - retry_details metadata (full retry info)
```

## Migration from DAO-Level Retry

If you have existing retry logic in your DAO classes, you can migrate to APIRequest retry:

### Before (DAO-level retry)

```javascript
class MyDAO {
  async fetchData() {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const request = new APIRequest({
          host: 'api.example.com',
          path: '/data'
        });
        
        const response = await request.send();
        
        if (response.success) {
          return response;
        }
        
        if (response.statusCode >= 500) {
          attempts++;
          if (attempts < maxAttempts) {
            console.warn(`Retry ${attempts}/${maxAttempts - 1}`);
            continue;
          }
        }
        
        return response;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw error;
        }
        console.warn(`Retry ${attempts}/${maxAttempts - 1}`);
      }
    }
  }
}
```

### After (APIRequest retry)

```javascript
class MyDAO {
  async fetchData() {
    const request = new APIRequest({
      host: 'api.example.com',
      path: '/data',
      retry: {
        enabled: true,
        maxRetries: 2  // 3 total attempts
      }
    });
    
    return await request.send();
  }
}
```

**Benefits:**
- Less code to maintain
- Consistent retry logic across all endpoints
- Automatic retry condition detection
- Built-in metadata for monitoring
- Proper logging of retry attempts

## Troubleshooting

### Retry Not Occurring

If retry isn't working:

1. **Check retry.enabled**: Ensure `retry.enabled` is `true`
2. **Check retry conditions**: Verify the failure matches a retry condition
3. **Check maxRetries**: Ensure `maxRetries` > 0
4. **Enable logging**: Set `LOG_LEVEL=WARN` to see retry attempts

```javascript
// Enable warning logging
process.env.LOG_LEVEL = 'WARN';

const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 2
  }
});

const response = await request.send();
// Check logs for retry attempts
```

### Too Many Retries

If requests are retrying too many times:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 1  // Reduce retries (2 total attempts)
  }
});
```

### Wrong Conditions Retrying

If the wrong conditions trigger retries:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    retryOn: {
      networkError: true,
      emptyResponse: false,    // Disable if not needed
      parseError: false,       // Disable if not needed
      serverError: true,
      clientError: false       // Keep disabled for 4xx
    }
  }
});
```

### Retries Taking Too Long

If retries are causing timeouts:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  options: {
    timeout: 2000  // Reduce timeout per attempt
  },
  retry: {
    enabled: true,
    maxRetries: 1  // Reduce number of retries
  }
});

// Maximum time: 4 seconds (2 attempts × 2 seconds)
```

## Best Practices

1. **Use retry for transient errors**: Enable retry for network and server errors
2. **Don't retry client errors by default**: 4xx errors usually indicate a problem with the request
3. **Set reasonable maxRetries**: 1-3 retries is usually sufficient
4. **Monitor retry metadata**: Track retry rates to identify problematic endpoints
5. **Combine with timeout**: Set appropriate timeouts to prevent long waits
6. **Log retry attempts**: Use retry metadata for monitoring and alerting
7. **Consider Lambda timeout**: Ensure Lambda timeout accommodates retries
8. **Use with pagination**: Retry makes pagination more reliable
9. **Don't retry forever**: Always set a maximum retry limit
10. **Handle exhausted retries**: Have a fallback strategy when all retries fail

## Future Enhancements

The following enhancements are planned for future releases:

1. **Exponential Backoff**: Add configurable delay between retries
2. **Jitter**: Add randomization to backoff delays
3. **Custom Retry Logic**: Allow custom retry decision functions
4. **Retry Callbacks**: Execute callbacks before/after retries
5. **Circuit Breaker**: Prevent retries when endpoint is consistently failing

## Related Documentation

- [APIRequest Pagination Guide](./api-request-pagination.md) - Automatic pagination functionality
- [APIRequest X-Ray Guide](./api-request-xray.md) - X-Ray tracing enhancements
- [Tools Module](./README.md) - Complete tools documentation
- [Endpoint Module](../endpoint/README.md) - HTTP request handling
