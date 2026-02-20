# APIRequest Pagination Guide

## Overview

The APIRequest class provides automatic pagination support for APIs that return results in multiple pages. When enabled, APIRequest will automatically fetch all pages and combine them into a single response, eliminating the need for manual pagination logic in your code.

## When to Use Pagination

Use pagination when:
- The API returns results in pages with pagination indicators
- You need all results, not just the first page
- The API provides total count and offset/limit parameters
- You want to avoid writing custom pagination logic for each endpoint

## Basic Usage

### Minimal Configuration

Enable pagination with default settings by passing `{ enabled: true }`:

```javascript
const { tools } = require('@63klabs/cache-data');

const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/users',
  parameters: {
    limit: 100  // Request 100 items per page
  },
  pagination: {
    enabled: true  // All other fields use defaults
  }
});

const response = await request.send();

// Response contains all users from all pages combined
const allUsers = JSON.parse(response.body).items;
console.log(`Retrieved ${allUsers.length} total users`);
```

### How It Works

1. APIRequest makes the initial request
2. If the response contains pagination indicators (`totalItems` and `items` by default), pagination begins
3. APIRequest calculates how many additional pages are needed
4. Remaining pages are fetched in concurrent batches (default: 5 at a time)
5. All results are combined into a single response
6. The combined response includes metadata about the pagination

## Configuration Options

### Default Configuration

When you enable pagination, these defaults are used:

```javascript
const defaultPaginationConfig = {
  enabled: false,                          // Must be explicitly enabled
  totalItemsLabel: 'totalItems',           // Field name for total count
  itemsLabel: 'items',                     // Field name for items array
  offsetLabel: 'offset',                   // Parameter name for offset
  limitLabel: 'limit',                     // Parameter name for limit
  continuationTokenLabel: null,            // Token-based pagination (not yet implemented)
  responseReturnCountLabel: 'returnedItemCount',  // Field name for count in response
  defaultLimit: 200,                       // Default items per page
  batchSize: 5                            // Concurrent requests per batch
};
```

### Custom Labels

If your API uses different field names, customize the labels:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/products',
  parameters: {
    pageSize: 50  // API uses 'pageSize' instead of 'limit'
  },
  pagination: {
    enabled: true,
    totalItemsLabel: 'total',      // API returns 'total' instead of 'totalItems'
    itemsLabel: 'results',         // API returns 'results' instead of 'items'
    offsetLabel: 'skip',           // API uses 'skip' instead of 'offset'
    limitLabel: 'pageSize'         // API uses 'pageSize' instead of 'limit'
  }
});

const response = await request.send();
```

### Batch Size Configuration

Control how many pages are fetched concurrently:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  pagination: {
    enabled: true,
    batchSize: 10  // Fetch 10 pages at a time (default is 5)
  }
});
```

**Considerations:**
- Larger batch sizes fetch pages faster but may overwhelm the API
- Smaller batch sizes are gentler on the API but take longer
- Consider the API's rate limits when setting batch size
- Default of 5 is a good balance for most APIs

### Default Limit

Set the default number of items per page if not specified in parameters:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  // No 'limit' parameter specified
  pagination: {
    enabled: true,
    defaultLimit: 100  // Use 100 items per page (default is 200)
  }
});
```

## Response Format

### Successful Pagination

When pagination completes successfully, the response includes metadata:

```javascript
const successfulPaginationResponse = {
  success: true,
  statusCode: 200,
  headers: { /* response headers */ },
  body: '{"items":[...all items from all pages...],"returnedItemCount":523}',
  message: 'OK',
  metadata: {
    pagination: {
      occurred: true,
      totalPages: 6,        // Number of pages retrieved (including initial)
      totalItems: 523,      // Total items returned
      incomplete: false,    // Whether pagination completed successfully
      error: null           // Error message if incomplete
    }
  }
};
```

### Incomplete Pagination

If an error occurs while fetching subsequent pages, partial results are returned:

```javascript
const incompletePaginationResponse = {
  success: true,
  statusCode: 200,
  headers: { /* response headers */ },
  body: '{"items":[...items from successful pages...],"returnedItemCount":300}',
  message: 'OK',
  metadata: {
    pagination: {
      occurred: true,
      totalPages: 4,        // Pages retrieved before error
      totalItems: 300,      // Items retrieved before error
      incomplete: true,     // Pagination did not complete
      error: 'Network error on page 5'  // Error message
    }
  }
};
```

### No Pagination

If pagination is not enabled or not needed, no metadata is included:

```javascript
const noPaginationResponse = {
  success: true,
  statusCode: 200,
  headers: { /* response headers */ },
  body: '{"items":[...first page only...],"totalItems":523}',
  message: 'OK'
  // No metadata field
};
```

## Examples

### Example 1: GitHub API

GitHub's API uses `total_count` and `items`:

```javascript
const request = new tools.APIRequest({
  host: 'api.github.com',
  path: '/search/repositories',
  parameters: {
    q: 'language:javascript',
    per_page: 100  // GitHub uses 'per_page'
  },
  headers: {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'MyApp'
  },
  pagination: {
    enabled: true,
    totalItemsLabel: 'total_count',
    itemsLabel: 'items',
    limitLabel: 'per_page',
    offsetLabel: 'page'  // GitHub uses page numbers, not offsets
  }
});

const response = await request.send();
const repos = JSON.parse(response.body).items;
console.log(`Found ${repos.length} repositories`);
```

### Example 2: REST API with Standard Pagination

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/v1/orders',
  parameters: {
    status: 'completed',
    limit: 200
  },
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  pagination: {
    enabled: true
    // Uses default labels: totalItems, items, offset, limit
  }
});

const response = await request.send();

if (response.metadata?.pagination?.incomplete) {
  console.warn('Pagination incomplete:', response.metadata.pagination.error);
  console.log(`Retrieved ${response.metadata.pagination.totalItems} of ${JSON.parse(response.body).totalItems} items`);
} else {
  console.log(`Retrieved all ${response.metadata.pagination.totalItems} orders`);
}
```

### Example 3: Custom Pagination Labels

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/products',
  parameters: {
    category: 'electronics',
    pageSize: 50
  },
  pagination: {
    enabled: true,
    totalItemsLabel: 'count',
    itemsLabel: 'data',
    offsetLabel: 'start',
    limitLabel: 'pageSize',
    batchSize: 3  // Fetch 3 pages at a time
  }
});

const response = await request.send();
const products = JSON.parse(response.body).data;
```

### Example 4: Handling Pagination Metadata

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/logs',
  parameters: {
    date: '2024-01-15',
    limit: 1000
  },
  pagination: {
    enabled: true
  }
});

const response = await request.send();

// Check if pagination occurred
if (response.metadata?.pagination?.occurred) {
  console.log(`Pagination stats:`);
  console.log(`- Total pages: ${response.metadata.pagination.totalPages}`);
  console.log(`- Total items: ${response.metadata.pagination.totalItems}`);
  console.log(`- Complete: ${!response.metadata.pagination.incomplete}`);
  
  if (response.metadata.pagination.incomplete) {
    console.error(`Pagination error: ${response.metadata.pagination.error}`);
  }
}

const logs = JSON.parse(response.body).items;
```

## Pagination Behavior

### When Pagination Occurs

Pagination will occur when ALL of these conditions are met:

1. `pagination.enabled` is `true`
2. Initial request succeeds (`response.success === true`)
3. Response body is valid JSON
4. Response contains the `totalItemsLabel` field (e.g., `totalItems`)
5. Response contains the `itemsLabel` field (e.g., `items`)
6. Total items exceeds items in first page
7. Request is not already a paginated sub-request (offset > 0)

### When Pagination Does NOT Occur

Pagination will NOT occur when:

- `pagination.enabled` is `false` or not set
- Initial request fails
- Response body is not JSON
- Response is missing pagination indicators
- All items fit in the first page
- Request already has an offset > 0 (prevents infinite loops)

### Pagination and Offsets

If your request already includes an offset parameter, pagination is automatically disabled to prevent infinite loops:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  parameters: {
    offset: 100,  // Already requesting a specific page
    limit: 50
  },
  pagination: {
    enabled: true  // Will be ignored because offset > 0
  }
});

// Only returns the single page at offset 100
const response = await request.send();
```

## Error Handling

### Network Errors

If a network error occurs while fetching a subsequent page:

```javascript
const response = await request.send();

if (response.metadata?.pagination?.incomplete) {
  console.error('Pagination failed:', response.metadata.pagination.error);
  console.log(`Retrieved ${response.metadata.pagination.totalItems} items before error`);
  
  // Partial results are still available
  const partialData = JSON.parse(response.body).items;
}
```

### Parse Errors

If a page returns invalid JSON:

```javascript
const response = await request.send();

if (response.metadata?.pagination?.incomplete) {
  // Pagination stopped, partial results returned
  const partialData = JSON.parse(response.body).items;
}
```

### Missing Pagination Indicators

If the API response doesn't include pagination indicators:

```javascript
const response = await request.send();

// No metadata.pagination field - pagination didn't occur
// Response contains only the first page
```

## Performance Considerations

### Memory Usage

Pagination loads all pages into memory. For large datasets:

```javascript
// Be cautious with large datasets
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/large-dataset',
  parameters: {
    limit: 1000  // Larger page size = fewer requests
  },
  pagination: {
    enabled: true,
    batchSize: 10  // Fetch more pages concurrently
  }
});

// This could load millions of items into memory
const response = await request.send();
```

**Recommendations:**
- Use larger page sizes to reduce the number of requests
- Consider processing pages individually if dataset is very large
- Monitor Lambda memory usage when paginating large datasets

### API Rate Limits

Respect API rate limits by adjusting batch size:

```javascript
// For APIs with strict rate limits
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  pagination: {
    enabled: true,
    batchSize: 2  // Fetch only 2 pages at a time
  }
});
```

### Timeout Considerations

Pagination can take time for large datasets. Ensure your Lambda timeout is sufficient:

```javascript
// In CloudFormation template
Resources:
  MyFunction:
    Type: AWS::Lambda::Function
    Properties:
      Timeout: 300  # 5 minutes for large pagination operations
```

## Combining with Other Features

### Pagination + Retry

Pagination works seamlessly with retry logic:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  pagination: {
    enabled: true
  },
  retry: {
    enabled: true,
    maxRetries: 2  // Retry failed page requests
  }
});

// Each page request will be retried if it fails
const response = await request.send();
```

### Pagination + X-Ray

Pagination is tracked in X-Ray subsegments:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  pagination: {
    enabled: true
  }
});

const response = await request.send();

// X-Ray subsegment will include:
// - pagination_pages annotation (number of pages)
// - pagination_items annotation (total items)
// - pagination_details metadata (full pagination info)
```

## Migration from DAO-Level Pagination

If you have existing pagination logic in your DAO classes, you can migrate to APIRequest pagination:

### Before (DAO-level pagination)

```javascript
class MyDAO {
  async getAllData() {
    let allItems = [];
    let offset = 0;
    const limit = 200;
    let hasMore = true;
    
    while (hasMore) {
      const request = new APIRequest({
        host: 'api.example.com',
        path: '/data',
        parameters: { offset, limit }
      });
      
      const response = await request.send();
      const body = JSON.parse(response.body);
      
      allItems = allItems.concat(body.items);
      offset += limit;
      hasMore = offset < body.totalItems;
    }
    
    return allItems;
  }
}
```

### After (APIRequest pagination)

```javascript
class MyDAO {
  async getAllData() {
    const request = new APIRequest({
      host: 'api.example.com',
      path: '/data',
      parameters: { limit: 200 },
      pagination: { enabled: true }
    });
    
    const response = await request.send();
    return JSON.parse(response.body).items;
  }
}
```

**Benefits:**
- Less code to maintain
- Automatic error handling
- Concurrent page fetching
- Consistent pagination logic across all endpoints
- Built-in metadata for monitoring

## Troubleshooting

### Pagination Not Occurring

If pagination isn't working:

1. **Check response structure**: Ensure the API returns `totalItems` and `items` (or your custom labels)
2. **Verify JSON**: Response body must be valid JSON
3. **Check initial success**: Initial request must succeed
4. **Verify offset**: Ensure request doesn't already have an offset > 0
5. **Enable logging**: Set `LOG_LEVEL=DEBUG` to see pagination decisions

```javascript
// Enable debug logging
process.env.LOG_LEVEL = 'DEBUG';

const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  pagination: { enabled: true }
});

const response = await request.send();
// Check logs for pagination decisions
```

### Incomplete Pagination

If pagination stops partway through:

```javascript
const response = await request.send();

if (response.metadata?.pagination?.incomplete) {
  console.error('Pagination incomplete:');
  console.error('- Error:', response.metadata.pagination.error);
  console.error('- Pages retrieved:', response.metadata.pagination.totalPages);
  console.error('- Items retrieved:', response.metadata.pagination.totalItems);
  
  // Decide whether to retry or use partial results
}
```

### Wrong Field Names

If the API uses different field names:

```javascript
// Check the actual API response structure
const testRequest = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  parameters: { limit: 10 }
});

const testResponse = await testRequest.send();
console.log('API response structure:', JSON.parse(testResponse.body));

// Then configure pagination with correct labels
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  pagination: {
    enabled: true,
    totalItemsLabel: 'count',  // Use actual field name
    itemsLabel: 'results'      // Use actual field name
  }
});
```

## Best Practices

1. **Test with small datasets first**: Verify pagination works before using with large datasets
2. **Monitor memory usage**: Large paginated responses can consume significant memory
3. **Handle incomplete pagination**: Always check `metadata.pagination.incomplete`
4. **Use appropriate batch sizes**: Balance speed vs. API rate limits
5. **Set reasonable timeouts**: Ensure Lambda timeout accommodates pagination time
6. **Log pagination metadata**: Track pagination performance and errors
7. **Combine with retry**: Enable retry for more reliable pagination
8. **Use larger page sizes**: Reduce number of requests by requesting more items per page

## Related Documentation

- [APIRequest Retry Guide](./api-request-retry.md) - Automatic retry functionality
- [APIRequest X-Ray Guide](./api-request-xray.md) - X-Ray tracing enhancements
- [Tools Module](./README.md) - Complete tools documentation
- [Endpoint Module](../endpoint/README.md) - HTTP request handling
