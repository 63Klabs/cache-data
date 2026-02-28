# Request Validation

Configure validation rules for path parameters, query strings, headers, and cookies.

## Setting Up Validation

Initialize `ClientRequest` with validation functions:

```javascript
const { tools } = require('@63klabs/cache-data');
const { ClientRequest } = tools;

// Define validation functions
const validations = {
  referrers: ['example.com', 'subdomain.example.com'], // Allowed referrers
  parameters: {
    pathParameters: {
      id: (value) => /^[0-9]+$/.test(value), // Numeric IDs only
      slug: (value) => /^[a-z0-9-]+$/.test(value) // Lowercase alphanumeric with hyphens
    },
    queryStringParameters: {
      format: (value) => ['json', 'xml', 'html'].includes(value),
      limit: (value) => {
        const num = parseInt(value);
        return !isNaN(num) && num > 0 && num <= 100;
      },
      page: (value) => /^[0-9]+$/.test(value)
    },
    headerParameters: {
      authorization: (value) => value.startsWith('Bearer '),
      contentType: (value) => value.includes('application/json')
    }
  }
};

// Initialize ClientRequest with validations
ClientRequest.init({ validations });
```

## Validation Behavior

- **Automatic Validation**: `ClientRequest` constructor automatically validates all parameters
- **Invalid Requests**: `clientRequest.isValid()` returns `false` if any validation fails
- **Filtered Parameters**: Only validated parameters are included in `getPathParameters()`, `getQueryStringParameters()`, etc.
- **Security**: Invalid parameters are logged as warnings and excluded from the request

## Example with Validation

```javascript
const { tools } = require('@63klabs/cache-data');
const { ClientRequest, Response } = tools;

// Initialize validation rules (do this once, outside the handler)
ClientRequest.init({
  validations: {
    referrers: ['example.com'],
    parameters: {
      pathParameters: {
        id: (value) => /^[0-9]+$/.test(value)
      },
      queryStringParameters: {
        format: (value) => ['json', 'xml'].includes(value)
      }
    }
  }
});

exports.handler = async (event, context) => {
  const clientRequest = new ClientRequest(event, context);
  const response = new Response(clientRequest);
  
  // Check if request passed validation
  if (!clientRequest.isValid()) {
    response.setStatusCode(400);
    response.setBody({ error: 'Invalid request parameters' });
    return response.finalize();
  }
  
  // Access validated parameters safely
  const { id } = clientRequest.getPathParameters();
  const { format } = clientRequest.getQueryStringParameters();
  
  // Process request...
  response.setBody({ id, format });
  return response.finalize();
};
```

## Referrer Validation

Control which domains can access your API:

```javascript
// Allow all referrers (default)
ClientRequest.init({
  validations: {
    referrers: ['*']
  }
});

// Allow specific domains (matches from right to left)
ClientRequest.init({
  validations: {
    referrers: ['example.com'] // Allows example.com and *.example.com
  }
});

// Check if referrer validation is required
if (ClientRequest.requiresValidReferrer()) {
  console.log('Referrer validation is enabled');
}
```

---

Next: [Routing Patterns](./routing-patterns.md)
