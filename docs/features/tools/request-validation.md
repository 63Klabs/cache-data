# Request Validation

## Overview

The ClientRequest class provides a flexible validation system for Lambda API Gateway requests. The validation system supports global, route-specific, method-specific, and method-and-route-specific validation rules with a clear priority order.

This allows you to:
- Define different validation rules for the same parameter name on different routes
- Apply different validation rules based on HTTP method
- Validate multiple parameters together to enforce relationships
- Maintain backwards compatibility with existing global validations

## Table of Contents

- [Quick Start](#quick-start)
- [Validation Priority Order](#validation-priority-order)
- [Global Validations](#global-validations)
- [Route-Specific Validations](#route-specific-validations)
- [Method-Specific Validations](#method-specific-validations)
- [Method-and-Route Validations](#method-and-route-validations)
- [Multi-Parameter Validation](#multi-parameter-validation)
- [Parameter Specification Syntax](#parameter-specification-syntax)
- [Complete Examples](#complete-examples)
- [Troubleshooting](#troubleshooting)

## Quick Start

```javascript
const { ClientRequest } = require('@63klabs/cache-data');

// Initialize with validation rules
ClientRequest.init({
  referrers: ['example.com'],
  parameters: {
    pathParameters: {
      id: (value) => /^[a-zA-Z0-9-]+$/.test(value)
    },
    queryStringParameters: {
      limit: (value) => !isNaN(value) && value > 0 && value <= 100
    }
  }
});

// Use in Lambda handler
exports.handler = async (event, context) => {
  const clientRequest = new ClientRequest(event, context);
  
  if (!clientRequest.isValid()) {
    return { statusCode: 400, body: 'Invalid request' };
  }
  
  // Get validated parameters
  const pathParams = clientRequest.getPathParameters();
  const queryParams = clientRequest.getQueryStringParameters();
  
  // Process request...
};
```

## Validation Priority Order

When multiple validation rules could apply to a parameter, the system uses this priority order (highest to lowest):

1. **Method-and-route match** - `BY_ROUTE` with `"METHOD:route"` pattern
2. **Route-only match** - `BY_ROUTE` with `"route"` pattern
3. **Method-only match** - `BY_METHOD` with `"METHOD"` pattern
4. **Global parameter name** - Direct parameter validation function

The system stops checking as soon as it finds a matching rule (early exit optimization).

### Priority Example

```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      id: (value) => typeof value === 'string',  // Priority 4: Global
      
      BY_METHOD: [
        {
          method: "POST",  // Priority 3: Method-only
          validate: (value) => value.length <= 50
        }
      ],
      
      BY_ROUTE: [
        {
          route: "product/{id}",  // Priority 2: Route-only
          validate: (value) => /^P-[0-9]+$/.test(value)
        },
        {
          route: "POST:product/{id}",  // Priority 1: Method-and-route
          validate: (value) => /^P-[0-9]{4}$/.test(value)
        }
      ]
    }
  }
});
```

For a `POST` request to `/product/P-1234`:
- Checks `POST:product/{id}` (Priority 1) → **Matches** → Uses this validation
- Does NOT check lower priorities (early exit)

For a `GET` request to `/product/P-1234`:
- Checks `POST:product/{id}` (Priority 1) → No match (wrong method)
- Checks `product/{id}` (Priority 2) → **Matches** → Uses this validation
- Does NOT check lower priorities (early exit)

## Global Validations

Global validations apply to all routes and methods. This is the traditional validation approach that remains fully backwards compatible.

```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      // Applies to 'id' parameter on all routes
      id: (value) => typeof value === 'string' && value.length > 0,
      userId: (value) => /^[0-9]+$/.test(value)
    },
    queryStringParameters: {
      limit: (value) => !isNaN(value) && value > 0 && value <= 100,
      page: (value) => !isNaN(value) && value > 0
    },
    headerParameters: {
      contentType: (value) => ['application/json', 'application/xml'].includes(value)
    }
  }
});
```

### When to Use Global Validations

- Parameter has the same validation rules across all routes
- Simple APIs with consistent parameter formats
- Backwards compatibility with existing validation configurations

## Route-Specific Validations

Route-specific validations allow different validation rules for the same parameter name on different routes.

```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      // Global fallback
      id: (value) => typeof value === 'string',
      
      // Route-specific validations
      BY_ROUTE: [
        {
          route: "product/{id}",
          validate: (value) => /^P-[0-9]+$/.test(value)
        },
        {
          route: "employee/{id}",
          validate: (value) => /^E-[0-9]+$/.test(value)
        },
        {
          route: "order/{id}",
          validate: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        }
      ]
    }
  }
});
```

### Route Pattern Matching

Route patterns are matched against the API Gateway `resource` path (not the actual path with values):

- **Exact match**: `"users"` matches `/users`
- **Path parameters**: `"product/{id}"` matches `/product/{id}` resource
- **Multiple placeholders**: `"users/{userId}/posts/{postId}"` matches `/users/{userId}/posts/{postId}` resource
- **Nested paths**: `"user/{userId}/profile"` matches `/user/{userId}/profile`
- **Case-insensitive**: `"Product/{id}"` matches `/product/{id}`
- **Normalized**: Leading/trailing slashes are ignored
- **Method prefix**: `"POST:product/{id}"` matches POST requests to `/product/{id}` resource

### When to Use Route-Specific Validations

- Same parameter name needs different formats on different routes
- Different business rules for different resources
- RESTful APIs with resource-specific constraints

## Method-Specific Validations

Method-specific validations apply based on HTTP method, regardless of route.

```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      BY_METHOD: [
        {
          method: "POST",
          validate: (value) => value.length > 0 && value.length <= 50
        },
        {
          method: "GET",
          validate: (value) => value.length > 0 && value.length <= 200
        },
        {
          method: "DELETE",
          validate: (value) => value.length > 0
        }
      ]
    }
  }
});
```

### Method Matching

- Methods are matched case-insensitively: `"POST"`, `"post"`, `"Post"` all match
- Supported methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`

### When to Use Method-Specific Validations

- Validation rules depend on HTTP method across all routes
- POST requests require stricter validation than GET
- Different methods have different parameter constraints

## Method-and-Route Validations

Method-and-route validations are the most specific, applying only to a particular combination of HTTP method and route.

**Note**: Method-and-route patterns use the format `"METHOD:route"` where METHOD is the HTTP method (GET, POST, PUT, DELETE, etc.) and route is the route pattern. This allows you to apply different validation rules to the same route based on the HTTP method.

```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      BY_ROUTE: [
        {
          route: "POST:game/join/{id}",
          validate: (value) => /^[0-9]{6}$/.test(value)
        },
        {
          route: "GET:game/join/{id}",
          validate: (value) => /^[0-9]+$/.test(value)
        },
        {
          route: "POST:product/{id}",
          validate: (value) => /^P-[0-9]{4}$/.test(value)
        },
        {
          route: "GET:product/{id}",
          validate: (value) => /^P-[0-9]+$/.test(value)
        }
      ]
    }
  }
});
```

### When to Use Method-and-Route Validations

- Most precise control over validation behavior
- Different methods on the same route need different validation
- Creating vs. retrieving resources with different ID formats

## Multi-Parameter Validation

Multi-parameter validation allows you to validate multiple parameters together to enforce relationships and cross-parameter constraints.

```javascript
ClientRequest.init({
  parameters: {
    queryStringParameters: {
      BY_ROUTE: [
        {
          // Specify multiple parameters with comma separation
          route: "search?query,limit",
          validate: ({query, limit}) => {
            // Validation function receives object with all parameters
            if (!query || query.length === 0) return false;
            
            const numLimit = parseInt(limit);
            return !isNaN(numLimit) && numLimit >= 1 && numLimit <= 100;
          }
        },
        {
          route: "users?page,limit",
          validate: ({page, limit}) => {
            const numPage = parseInt(page);
            const numLimit = parseInt(limit);
            
            if (isNaN(numPage) || isNaN(numLimit)) return false;
            if (numPage < 1 || numLimit < 1) return false;
            
            return numLimit <= 100;
          }
        }
      ]
    },
    pathParameters: {
      BY_ROUTE: [
        {
          // Multiple path parameters
          route: "user/{userId}/post/{postId}",
          validate: ({userId, postId}) => {
            return /^[0-9]+$/.test(userId) && /^[0-9]+$/.test(postId);
          }
        },
        {
          // Three or more path parameters
          route: "api/{version}/resources/{resourceId}/items/{itemId}",
          validate: ({version, resourceId, itemId}) => {
            return /^v[0-9]+$/.test(version) && 
                   /^[a-zA-Z0-9-]+$/.test(resourceId) && 
                   /^[0-9]+$/.test(itemId);
          }
        }
      ]
    }
  }
});
```

### Multi-Parameter Validation Rules

- Validation function receives an object with parameter names as keys
- All specified parameters are included, even if undefined
- Return `true` if all parameters are valid together, `false` otherwise
- Can enforce relationships between parameters (e.g., min < max)

### When to Use Multi-Parameter Validation

- Parameters have interdependencies
- Need to validate ranges (minPrice, maxPrice)
- Pagination parameters (page, limit)
- Search with filters (query, category, sort)

## Parameter Specification Syntax

The parameter specification syntax tells the validation system which parameters to validate.

### Path Parameters

```javascript
// Single path parameter
route: "product/{id}"  // Validates 'id' path parameter

// Multiple path parameters
route: "user/{userId}/post/{postId}"  // Validates both parameters together
```

### Query Parameters

```javascript
// Single query parameter
route: "search?query"  // Validates 'query' query parameter

// Multiple query parameters
route: "search?query,limit"  // Validates both parameters together
route: "users?page,limit,sort"  // Validates all three parameters together
```

### Mixed Parameters

```javascript
// Path and query parameters together
route: "product/{id}?includeDetails"  // Validates both 'id' and 'includeDetails'
```

### Method Prefix

```javascript
// Method-and-route pattern
route: "POST:product/{id}"  // Only applies to POST requests
route: "GET:search?query"   // Only applies to GET requests
```

## Complete Examples

### Example 1: RESTful Product API

```javascript
ClientRequest.init({
  referrers: ['myapp.com'],
  parameters: {
    pathParameters: {
      // Global fallback
      id: (value) => typeof value === 'string' && value.length > 0,
      
      BY_ROUTE: [
        // Product creation requires 4-digit ID
        {
          route: "POST:product/{id}",
          validate: (value) => /^P-[0-9]{4}$/.test(value)
        },
        // Product retrieval allows any length
        {
          route: "GET:product/{id}",
          validate: (value) => /^P-[0-9]+$/.test(value)
        },
        // Product update requires existing ID format
        {
          route: "PUT:product/{id}",
          validate: (value) => /^P-[0-9]+$/.test(value)
        }
      ]
    },
    queryStringParameters: {
      BY_ROUTE: [
        // Search with validation
        {
          route: "GET:product?category,minPrice,maxPrice",
          validate: ({category, minPrice, maxPrice}) => {
            if (!category || category.length === 0) return false;
            
            const min = parseFloat(minPrice);
            const max = parseFloat(maxPrice);
            
            if (isNaN(min) || isNaN(max)) return false;
            return min >= 0 && max >= min;
          }
        }
      ]
    }
  }
});
```

### Example 2: Multi-Tenant API

```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      BY_ROUTE: [
        // Tenant-specific user validation
        {
          route: "tenant/{tenantId}/user/{userId}",
          validate: ({tenantId, userId}) => {
            // Both must be numeric
            if (!/^[0-9]+$/.test(tenantId)) return false;
            if (!/^[0-9]+$/.test(userId)) return false;
            
            // Tenant ID must be 1-6 digits
            return tenantId.length >= 1 && tenantId.length <= 6;
          }
        }
      ]
    }
  }
});
```

### Example 3: Game API with Join Codes

```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      BY_ROUTE: [
        // POST to join requires 6-digit code
        {
          route: "POST:game/join/{id}",
          validate: (value) => /^[0-9]{6}$/.test(value)
        },
        // GET to view game allows any numeric ID
        {
          route: "GET:game/join/{id}",
          validate: (value) => /^[0-9]+$/.test(value)
        }
      ]
    },
    queryStringParameters: {
      BY_ROUTE: [
        // Join with player info
        {
          route: "POST:game/join/{id}?playerName,teamId",
          validate: ({playerName, teamId}) => {
            if (!playerName || playerName.length === 0) return false;
            if (!teamId || !/^[0-9]+$/.test(teamId)) return false;
            return playerName.length <= 50;
          }
        }
      ]
    }
  }
});
```

## Troubleshooting

### Recent Bug Fixes (v1.3.9)

The following validation issues were fixed in version 1.3.9:

1. **Multiple Placeholder Routes**: Routes with multiple placeholders (e.g., `users/{userId}/posts/{postId}`) now match correctly
2. **Query Parameter Extraction**: Query parameters are now properly extracted when validation rules exist
3. **Header Parameter Extraction**: Header parameters are now properly extracted when validation rules exist
4. **Method-and-Route Patterns**: Method-and-route patterns (e.g., `POST:product/{id}`) now match correctly
5. **Duplicate Parameters**: Validation rules no longer contain duplicate parameter names
6. **Body Parameters Method**: The `getBodyParameters()` method is now available

If you experienced issues with any of these scenarios in earlier versions, upgrading to v1.3.9 or later will resolve them.

### Common Issues

#### Issue: Validation not being applied

**Problem**: Parameters are not being validated even though rules are defined.

**Solutions**:
1. Check that `ClientRequest.init()` is called before creating ClientRequest instances
2. Verify parameter type matches (pathParameters vs queryStringParameters)
3. Check route pattern matches the API Gateway resource path
4. Ensure method matches (case-insensitive)

#### Issue: Wrong validation rule is applied

**Problem**: A lower-priority validation rule is being used instead of a higher-priority one.

**Solutions**:
1. Review the priority order (method-and-route > route > method > global)
2. Check that route pattern exactly matches the resource path
3. Verify method prefix is correct (e.g., `"POST:route"` not `"post:route"`)
4. Use console logging to debug which rule is matching

#### Issue: Multi-parameter validation not working

**Problem**: Multi-parameter validation function is not receiving all parameters.

**Solutions**:
1. Verify parameter specification syntax: `"route?param1,param2"`
2. Check that all parameters are present in the request
3. Remember that missing parameters are passed as `undefined`
4. Validate that parameter names match exactly (case-sensitive)

#### Issue: Parameters being excluded unexpectedly

**Problem**: Valid parameters are not included in validated parameters object.

**Solutions**:
1. Check `excludeParamsWithNoValidationMatch` setting (default: `true`)
2. Add validation rules for all parameters you want to include
3. Set `excludeParamsWithNoValidationMatch: false` to include all parameters

### Debugging Tips

#### Enable Debug Logging

```javascript
// Set environment variable
process.env.LOG_LEVEL = '5';

// Or in Lambda environment variables
LOG_LEVEL=5
```

#### Check Validation Configuration

```javascript
const info = ClientRequest.info();
console.log('Referrer whitelist:', info.referrerWhiteList);

const validations = ClientRequest.getParameterValidations();
console.log('Path validations:', validations.pathParameters);
```

#### Test Validation Rules Independently

```javascript
// Test a validation function directly
const validateProductId = (value) => /^P-[0-9]+$/.test(value);

console.log(validateProductId('P-123'));   // true
console.log(validateProductId('E-123'));   // false
console.log(validateProductId('P-abc'));   // false
```

#### Check Request Properties

```javascript
const clientRequest = new ClientRequest(event, context);

console.log('Is valid:', clientRequest.isValid());
console.log('Path params:', clientRequest.getPathParameters());
console.log('Query params:', clientRequest.getQueryStringParameters());
console.log('Resource:', clientRequest.getResource());
console.log('Method:', clientRequest.getProps().method);
```

### Performance Considerations

The validation system is optimized for performance:

- **Pattern caching**: Route patterns are normalized and cached during initialization
- **Early exit**: Validation stops at the first matching rule (no unnecessary checks)
- **Absent parameter skipping**: Validation functions are not called for missing parameters

For best performance:
- Define specific rules at higher priorities to enable early exit
- Use simple validation functions (avoid complex regex or async operations)
- Cache validation results if the same parameters are validated multiple times

## Migration Guide

See [validation-system-migration.md](../../migration/validation-system-migration.md) for detailed migration instructions from global validations to route-specific and method-specific validations.

## Related Documentation

- [ClientRequest API Reference](../../../src/lib/tools/ClientRequest.class.js)
- [Example Validation Configurations](../../../examples/example-validations-enhanced.js)
- [Migration Guide](../../migration/validation-system-migration.md)
