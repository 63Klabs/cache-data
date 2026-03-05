# Validation System Migration Guide

## Overview

This guide helps you migrate from global parameter validations to the enhanced validation system with route-specific, method-specific, and multi-parameter validations.

**Good news**: Your existing validation configurations work without any changes. This migration is optional and can be done incrementally.

## Table of Contents

- [Do I Need to Migrate?](#do-i-need-to-migrate)
- [Backwards Compatibility](#backwards-compatibility)
- [Migration Steps](#migration-steps)
- [Migration Patterns](#migration-patterns)
- [Before and After Examples](#before-and-after-examples)
- [Testing Your Migration](#testing-your-migration)
- [Troubleshooting](#troubleshooting)

## Do I Need to Migrate?

You should consider migrating if:

- ✅ You need different validation rules for the same parameter name on different routes
- ✅ You need different validation rules based on HTTP method
- ✅ You need to validate multiple parameters together
- ✅ You want more precise control over validation behavior

You do NOT need to migrate if:

- ❌ Your current global validations work fine for all routes
- ❌ You have simple APIs with consistent parameter formats
- ❌ You don't need route-specific or method-specific validation

## Backwards Compatibility

**Your existing validation configurations continue to work without any changes.**

```javascript
// This still works exactly as before
ClientRequest.init({
  parameters: {
    pathParameters: {
      id: (value) => /^[a-zA-Z0-9-]+$/.test(value)
    },
    queryStringParameters: {
      limit: (value) => !isNaN(value) && value > 0 && value <= 100
    }
  }
});
```

The enhanced validation system adds new optional features without breaking existing functionality.

## Migration Steps

### Step 1: Identify Parameters Needing Different Rules

Review your API and identify parameters that need different validation rules on different routes or methods.

**Example questions to ask**:
- Does the `id` parameter have different formats for products vs. employees?
- Do POST requests need stricter validation than GET requests?
- Do any parameters need to be validated together?

### Step 2: Choose Migration Approach

You can migrate incrementally:

1. **Keep global validations** as fallbacks
2. **Add route-specific rules** for specific routes that need them
3. **Add method-specific rules** for method-dependent validation
4. **Add multi-parameter rules** for parameters with relationships

### Step 3: Update Configuration

Add `BY_ROUTE` or `BY_METHOD` arrays to your parameter validation configuration.

### Step 4: Test Thoroughly

Test all routes and methods to ensure validation works as expected.

## Migration Patterns

### Pattern 1: From Global to Route-Specific

**Use case**: Same parameter name needs different formats on different routes.

**Before** (Global validation only):
```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      // One validation rule for all routes
      id: (value) => typeof value === 'string' && value.length > 0
    }
  }
});
```

**Problem**: Product IDs should start with 'P-', employee IDs with 'E-', but global validation can't distinguish.

**After** (Route-specific validation):
```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      // Keep global as fallback
      id: (value) => typeof value === 'string' && value.length > 0,
      
      // Add route-specific rules
      BY_ROUTE: [
        {
          route: "product/{id}",
          validate: (value) => /^P-[0-9]+$/.test(value)
        },
        {
          route: "employee/{id}",
          validate: (value) => /^E-[0-9]+$/.test(value)
        }
      ]
    }
  }
});
```

**Result**: Product routes validate with 'P-' prefix, employee routes with 'E-' prefix, other routes use global fallback.

### Pattern 2: From Global to Method-Specific

**Use case**: Validation rules depend on HTTP method.

**Before** (Global validation only):
```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      // Same validation for all methods
      id: (value) => typeof value === 'string' && value.length > 0
    }
  }
});
```

**Problem**: POST requests (creating resources) should have stricter length limits than GET requests.

**After** (Method-specific validation):
```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      // Keep global as fallback
      id: (value) => typeof value === 'string' && value.length > 0,
      
      // Add method-specific rules
      BY_METHOD: [
        {
          method: "POST",
          validate: (value) => value.length > 0 && value.length <= 50
        },
        {
          method: "PUT",
          validate: (value) => value.length > 0 && value.length <= 50
        }
      ]
    }
  }
});
```

**Result**: POST and PUT requests enforce 50-character limit, other methods use global fallback.

### Pattern 3: From Global to Method-and-Route

**Use case**: Specific combination of method and route needs unique validation.

**Before** (Global validation only):
```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      id: (value) => /^[0-9]+$/.test(value)
    }
  }
});
```

**Problem**: POST to `/game/join/{id}` requires 6-digit code, but GET allows any numeric ID.

**After** (Method-and-route validation):
```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      // Keep global as fallback
      id: (value) => /^[0-9]+$/.test(value),
      
      // Add method-and-route rules
      BY_ROUTE: [
        {
          route: "POST:game/join/{id}",
          validate: (value) => /^[0-9]{6}$/.test(value)
        },
        {
          route: "GET:game/join/{id}",
          validate: (value) => /^[0-9]+$/.test(value)
        }
      ]
    }
  }
});
```

**Result**: POST to game/join requires exactly 6 digits, GET allows any length, other routes use global fallback.

### Pattern 4: From Separate to Multi-Parameter

**Use case**: Parameters have interdependencies that need to be validated together.

**Before** (Separate validations):
```javascript
ClientRequest.init({
  parameters: {
    queryStringParameters: {
      // Validated separately
      query: (value) => value.length > 0,
      limit: (value) => !isNaN(value) && value > 0 && value <= 100
    }
  }
});
```

**Problem**: Can't enforce that limit is reasonable for query length, or that both are present together.

**After** (Multi-parameter validation):
```javascript
ClientRequest.init({
  parameters: {
    queryStringParameters: {
      // Keep individual validations as fallback
      query: (value) => value.length > 0,
      limit: (value) => !isNaN(value) && value > 0 && value <= 100,
      
      // Add multi-parameter validation
      BY_ROUTE: [
        {
          route: "search?query,limit",
          validate: ({query, limit}) => {
            // Validate both together
            if (!query || query.length === 0) return false;
            
            const numLimit = parseInt(limit);
            if (isNaN(numLimit)) return false;
            
            // Enforce relationship
            return numLimit >= 1 && numLimit <= 100;
          }
        }
      ]
    }
  }
});
```

**Result**: Search endpoint validates query and limit together, enforcing their relationship.

## Before and After Examples

### Example 1: E-commerce API

**Before**:
```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      id: (value) => typeof value === 'string' && value.length > 0
    },
    queryStringParameters: {
      limit: (value) => !isNaN(value) && value > 0 && value <= 100,
      page: (value) => !isNaN(value) && value > 0
    }
  }
});
```

**After**:
```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      // Global fallback
      id: (value) => typeof value === 'string' && value.length > 0,
      
      // Route-specific validations
      BY_ROUTE: [
        {
          route: "product/{id}",
          validate: (value) => /^P-[0-9]+$/.test(value)
        },
        {
          route: "order/{id}",
          validate: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        },
        {
          route: "POST:product/{id}",
          validate: (value) => /^P-[0-9]{4}$/.test(value)
        }
      ]
    },
    queryStringParameters: {
      // Global fallbacks
      limit: (value) => !isNaN(value) && value > 0 && value <= 100,
      page: (value) => !isNaN(value) && value > 0,
      
      // Multi-parameter validation for search
      BY_ROUTE: [
        {
          route: "product?category,minPrice,maxPrice",
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

**Benefits**:
- Product IDs validated with 'P-' prefix
- Order IDs validated as UUIDs
- Product creation requires 4-digit ID
- Price range validation enforces min < max

### Example 2: User Management API

**Before**:
```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      userId: (value) => /^[0-9]+$/.test(value)
    },
    queryStringParameters: {
      role: (value) => ['admin', 'user', 'guest'].includes(value)
    }
  }
});
```

**After**:
```javascript
ClientRequest.init({
  parameters: {
    pathParameters: {
      // Global fallback
      userId: (value) => /^[0-9]+$/.test(value),
      
      // Method-specific validations
      BY_METHOD: [
        {
          method: "POST",
          validate: (value) => /^[0-9]{1,10}$/.test(value)
        },
        {
          method: "DELETE",
          validate: (value) => /^[0-9]+$/.test(value) && value !== '1'
        }
      ]
    },
    queryStringParameters: {
      // Global fallback
      role: (value) => ['admin', 'user', 'guest'].includes(value),
      
      // Route-specific validation
      BY_ROUTE: [
        {
          route: "POST:user?role,email",
          validate: ({role, email}) => {
            if (!['admin', 'user'].includes(role)) return false;
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
          }
        }
      ]
    }
  }
});
```

**Benefits**:
- POST enforces 10-digit max for user IDs
- DELETE prevents deleting user ID 1 (admin)
- User creation validates role and email together

## Testing Your Migration

### Step 1: Test Existing Routes

Ensure existing routes still work with global validations:

```javascript
// Test that existing routes work
const event1 = {
  httpMethod: 'GET',
  resource: '/user/{userId}',
  pathParameters: { userId: '123' }
};

const request1 = new ClientRequest(event1, context);
console.log('Existing route valid:', request1.isValid());
```

### Step 2: Test New Route-Specific Rules

Test routes with new specific validations:

```javascript
// Test product route with P- prefix
const event2 = {
  httpMethod: 'GET',
  resource: '/product/{id}',
  pathParameters: { id: 'P-123' }
};

const request2 = new ClientRequest(event2, context);
console.log('Product route valid:', request2.isValid());

// Test that wrong format fails
const event3 = {
  httpMethod: 'GET',
  resource: '/product/{id}',
  pathParameters: { id: 'E-123' }
};

const request3 = new ClientRequest(event3, context);
console.log('Wrong format invalid:', !request3.isValid());
```

### Step 3: Test Method-Specific Rules

Test different methods on the same route:

```javascript
// Test POST with strict validation
const event4 = {
  httpMethod: 'POST',
  resource: '/product/{id}',
  pathParameters: { id: 'P-1234' }
};

const request4 = new ClientRequest(event4, context);
console.log('POST with 4 digits valid:', request4.isValid());

// Test GET with relaxed validation
const event5 = {
  httpMethod: 'GET',
  resource: '/product/{id}',
  pathParameters: { id: 'P-123456' }
};

const request5 = new ClientRequest(event5, context);
console.log('GET with more digits valid:', request5.isValid());
```

### Step 4: Test Multi-Parameter Validation

Test parameters validated together:

```javascript
// Test valid combination
const event6 = {
  httpMethod: 'GET',
  resource: '/search',
  queryStringParameters: {
    query: 'laptop',
    limit: '10'
  }
};

const request6 = new ClientRequest(event6, context);
console.log('Valid combination:', request6.isValid());

// Test invalid combination
const event7 = {
  httpMethod: 'GET',
  resource: '/search',
  queryStringParameters: {
    query: '',
    limit: '10'
  }
};

const request7 = new ClientRequest(event7, context);
console.log('Invalid combination:', !request7.isValid());
```

### Step 5: Integration Testing

Test with real Lambda events in your development environment:

```bash
# Deploy to dev environment
sam deploy --config-env dev

# Test with real API Gateway events
curl -X GET https://api.example.com/product/P-123
curl -X POST https://api.example.com/product/P-1234
curl -X GET https://api.example.com/search?query=laptop&limit=10
```

## Troubleshooting

### Issue: Validation not applied after migration

**Symptoms**: Parameters pass validation even though they shouldn't.

**Possible causes**:
1. Route pattern doesn't match API Gateway resource path
2. Method prefix is incorrect or missing
3. Parameter specification syntax is wrong

**Solutions**:
```javascript
// Check route pattern matches resource
console.log('Resource:', event.resource);  // Should match your route pattern

// Verify method matches
console.log('Method:', event.httpMethod);  // Should match your method prefix

// Check parameter specification
// Correct: "search?query,limit"
// Wrong: "search?query&limit" (use comma, not &)
```

### Issue: Wrong validation rule is applied

**Symptoms**: A lower-priority rule is being used instead of a higher-priority one.

**Possible causes**:
1. Route pattern doesn't match exactly
2. Method prefix is missing or incorrect
3. Priority order misunderstood

**Solutions**:
```javascript
// Review priority order:
// 1. POST:product/{id} (method-and-route)
// 2. product/{id} (route-only)
// 3. POST (method-only)
// 4. id (global)

// Make sure higher-priority rules come first in your mental model
// The system checks in priority order automatically
```

### Issue: Multi-parameter validation not working

**Symptoms**: Multi-parameter validation function not receiving all parameters.

**Possible causes**:
1. Parameter specification syntax is wrong
2. Parameters are missing from request
3. Parameter names don't match exactly

**Solutions**:
```javascript
// Correct syntax
route: "search?query,limit"  // Comma-separated, no spaces

// Check parameter names match
console.log('Query params:', event.queryStringParameters);

// Remember: missing parameters are passed as undefined
validate: ({query, limit}) => {
  if (query === undefined || limit === undefined) {
    return false;  // Handle missing parameters
  }
  // ... rest of validation
}
```

### Issue: Performance degradation

**Symptoms**: Requests are slower after migration.

**Possible causes**:
1. Too many validation rules
2. Complex regex patterns
3. Not using early exit optimization

**Solutions**:
```javascript
// Use specific rules at higher priorities for early exit
BY_ROUTE: [
  {
    route: "POST:product/{id}",  // Most specific first
    validate: (value) => /^P-[0-9]{4}$/.test(value)
  },
  {
    route: "product/{id}",  // Less specific second
    validate: (value) => /^P-[0-9]+$/.test(value)
  }
]

// Simplify regex patterns
// Before: /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/
// After: /^[\w\s\-]+$/

// Cache validation results if validating same parameters multiple times
```

## Common Migration Patterns

### Pattern: Gradual Migration

Migrate one route at a time:

```javascript
// Week 1: Migrate product routes
BY_ROUTE: [
  {
    route: "product/{id}",
    validate: (value) => /^P-[0-9]+$/.test(value)
  }
]

// Week 2: Add employee routes
BY_ROUTE: [
  {
    route: "product/{id}",
    validate: (value) => /^P-[0-9]+$/.test(value)
  },
  {
    route: "employee/{id}",
    validate: (value) => /^E-[0-9]+$/.test(value)
  }
]

// Week 3: Add method-specific rules
// ... and so on
```

### Pattern: Feature Flag Migration

Use feature flags to test new validations:

```javascript
const useEnhancedValidation = process.env.ENHANCED_VALIDATION === 'true';

ClientRequest.init({
  parameters: {
    pathParameters: {
      id: (value) => typeof value === 'string',
      
      ...(useEnhancedValidation && {
        BY_ROUTE: [
          {
            route: "product/{id}",
            validate: (value) => /^P-[0-9]+$/.test(value)
          }
        ]
      })
    }
  }
});
```

### Pattern: A/B Testing

Test new validations with a subset of traffic:

```javascript
// Use different validation configs for different stages
const validations = process.env.STAGE === 'prod-beta' 
  ? enhancedValidations 
  : legacyValidations;

ClientRequest.init(validations);
```

## Next Steps

After successful migration:

1. **Monitor**: Watch CloudWatch logs for validation failures
2. **Optimize**: Simplify validation rules based on actual usage
3. **Document**: Update your API documentation with new validation rules
4. **Train**: Educate team members on new validation capabilities

## Related Documentation

- [Request Validation Guide](../features/tools/request-validation.md)
- [Example Validation Configurations](../../examples/example-validations-enhanced.js)
- [ClientRequest API Reference](../../src/lib/tools/ClientRequest.class.js)
