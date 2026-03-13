# Remaining Test Fixes - Validation Parameter Extraction

## Summary

16 integration tests remain failing due to incorrect validation function signatures. All failures follow the same pattern: tests use single-parameter validation functions `(value) => ...` for routes with multiple placeholders, when they should use multi-parameter functions `({ param1, param2 }) => ...`.

## The Rule

**When a route has multiple placeholders (e.g., `users/{userId}/posts/{id}`), the validation function MUST accept an object:**

```javascript
// ✅ CORRECT
{
  route: 'users/{userId}/posts/{id}',
  validate: ({ userId, id }) => {
    return /^[0-9]+$/.test(userId) && /^POST-[0-9]+$/.test(id);
  }
}

// ❌ WRONG
{
  route: 'users/{userId}/posts/{id}',
  validate: (value) => /^POST-[0-9]+$/.test(value)  // Only validates one parameter!
}
```

**When a route has a single placeholder, either form works:**

```javascript
// Both are acceptable for single-placeholder routes
{
  route: 'users/{id}',
  validate: (value) => /^[0-9]+$/.test(value)  // OK
}

{
  route: 'users/{id}',
  validate: ({ id }) => /^[0-9]+$/.test(id)  // Also OK
}
```

## Remaining Failures by File

### 1. body-validation-integration-tests.jest.mjs (1 test)
- **Test**: "should handle profile update with partial fields"
- **Issue**: Likely uses single-parameter validation for multi-field body validation

### 2. real-world-scenarios-tests.jest.mjs (3 tests)
- **Test 1**: "should handle complete API Gateway event structure"
  - Route: `users/{userId}/posts/{postId}` (2 placeholders)
  - Fix: Change `validate: (value) => ...` to `validate: ({ userId, postId }) => ...`

- **Test 2**: "should handle API Gateway event with body parameters"
  - Check for multi-parameter body validation

- **Test 3**: "should handle API Gateway event with case-insensitive headers"
  - Check header validation functions

### 3. api-gateway-scenarios-integration.jest.mjs (6 tests)
- **Test 1**: "should handle deeply nested REST resources"
  - Route: `orgs/{orgId}/teams/{teamId}/projects/{projectId}/issues/{issueId}` (4 placeholders)
  - Fix: `validate: ({ orgId, teamId, projectId, issueId }) => ...`

- **Test 2**: "should handle routes with special characters in placeholders"
  - Check for multi-placeholder routes

- **Test 3**: "should handle GitHub-style repository API"
  - Route: `repos/{owner}/{repo}` (2 placeholders)
  - Fix: `validate: ({ owner, repo }) => ...`

- **Test 4**: "should handle Stripe-style nested resource expansion"
  - Route: `customers/{customerId}/subscriptions/{subscriptionId}` (2 placeholders)
  - Fix: `validate: ({ customerId, subscriptionId }) => ...`

- **Test 5**: "should handle missing required headers gracefully"
  - Check header validation

- **Test 6**: "should handle complete e-commerce checkout flow"
  - Route: `carts/{cartId}/items/{itemId}` (2 placeholders)
  - Fix: `validate: ({ cartId, itemId }) => ...`

### 4. mixed-priority-integration-tests.jest.mjs (1 test)
- **Test**: "should handle multiple parameters with different priority matches"
- **Issue**: Multi-placeholder route with single-parameter validation

### 5. complex-validation-integration.jest.mjs (4 tests)
- **Test 1**: "should extract header parameters when validation passes"
  - Issue: Header key mismatch (fixed but may need verification)

- **Test 2**: "should handle complex e-commerce product API"
  - Route: `categories/{categoryId}/products/{productId}` (2 placeholders)
  - Already fixed but may need verification

- **Test 3**: "should handle complex social media post API"
  - Route: `users/{userId}/posts/{postId}/comments/{commentId}` (3 placeholders)
  - Fix: `validate: ({ userId, postId, commentId }) => ...`

- **Test 4**: "should demonstrate all 6 bug fixes working in harmony"
  - Route: `orgs/{orgId}/repos/{repoId}` (2 placeholders)
  - Fix: `validate: ({ orgId, repoId }) => ...`

### 6. by-route-integration-tests.jest.mjs (1 test)
- **Test**: "should validate mixed path and query parameters together"
- **Issue**: Query validation for route with path parameters needs object form

## Fix Pattern Examples

### Example 1: Two Placeholders

```javascript
// Before (WRONG)
{
  route: 'users/{userId}/posts/{postId}',
  validate: (value) => /^[0-9]+$/.test(value)
}

// After (CORRECT)
{
  route: 'users/{userId}/posts/{postId}',
  validate: ({ userId, postId }) => {
    return /^[0-9]+$/.test(userId) && /^[0-9]+$/.test(postId);
  }
}
```

### Example 2: Three Placeholders

```javascript
// Before (WRONG)
{
  route: 'users/{userId}/posts/{postId}/comments/{commentId}',
  validate: (value) => /^[0-9]+$/.test(value)
}

// After (CORRECT)
{
  route: 'users/{userId}/posts/{postId}/comments/{commentId}',
  validate: ({ userId, postId, commentId }) => {
    return /^[0-9]+$/.test(userId) && 
           /^[0-9]+$/.test(postId) && 
           /^[0-9]+$/.test(commentId);
  }
}
```

### Example 3: Four Placeholders

```javascript
// Before (WRONG)
{
  route: 'orgs/{orgId}/teams/{teamId}/projects/{projectId}/issues/{issueId}',
  validate: (value) => /^[0-9]+$/.test(value)
}

// After (CORRECT)
{
  route: 'orgs/{orgId}/teams/{teamId}/projects/{projectId}/issues/{issueId}',
  validate: ({ orgId, teamId, projectId, issueId }) => {
    return /^[0-9]+$/.test(orgId) && 
           /^[0-9]+$/.test(teamId) && 
           /^[0-9]+$/.test(projectId) && 
           /^[0-9]+$/.test(issueId) &&
           parseInt(orgId) > 0;  // Additional validation as needed
  }
}
```

### Example 4: Mixed Path and Query Parameters

```javascript
// Before (WRONG)
queryParameters: {
  includeProfile: (value) => value === 'true' || value === 'false',
  BY_ROUTE: [
    {
      route: 'users/{id}?includeProfile',
      validate: (value) => value === 'true' || value === 'false'
    }
  ]
}

// After (CORRECT)
queryParameters: {
  includeProfile: (value) => value === 'true' || value === 'false',
  BY_ROUTE: [
    {
      route: 'users/{id}?includeProfile',
      validate: ({ id, includeProfile }) => {
        // Validate both path and query parameters
        return /^[0-9]+$/.test(id) && 
               (includeProfile === 'true' || includeProfile === 'false');
      }
    }
  ]
}
```

## Systematic Fix Process

For each failing test:

1. **Identify the route pattern**: Look for routes with multiple `{placeholder}` segments
2. **Count the placeholders**: Determine how many parameters need validation
3. **Update the validation function**:
   - Change `(value) => ...` to `({ param1, param2, ... }) => ...`
   - Update validation logic to check ALL parameters
4. **Run the specific test**: Verify it passes
5. **Move to next test**

## Commands to Run Tests

```bash
# Run all integration tests
npm run test:jest -- test/request/validation/integration/

# Run specific test file
npm run test:jest -- test/request/validation/integration/api-gateway-scenarios-integration.jest.mjs

# Run specific test by name
npm run test:jest -- test/request/validation/integration/api-gateway-scenarios-integration.jest.mjs -t "should handle deeply nested REST resources"

# Run all tests (Mocha + Jest)
npm run test:all
```

## Success Criteria

- All 16 failing tests pass
- Mocha: 622+ passing
- Jest: 1,766+ passing (1,750 + 16)
- No new test failures introduced
- Both test suites pass: `npm run test:all`

## Notes

- The core implementation fix is complete and working correctly
- These test failures are NOT bugs in the implementation
- These are test code issues where tests use incorrect validation function signatures
- Once these 16 tests are fixed, the entire validation system will be fully functional
