# Design: Fix excludeParamsWithNoValidationMatch Passthrough When No Validations Configured

## Root Cause Analysis

The bug is in `#hasValidParameters()` in `src/lib/tools/ClientRequest.class.js`. The method has this guard:

```javascript
if (clientParameters && paramValidations) {
    // ... all validation and parameter extraction logic
}
return rValue; // { isValid: true, params: {} }
```

When `paramValidations` is `undefined` (no validation rules configured for that parameter type), the entire block is skipped and an empty `params` object is returned. The `excludeParamsWithNoValidationMatch` flag is checked *inside* the block, so it never gets evaluated.

## Proposed Fix

Modify `#hasValidParameters()` to handle the case where `clientParameters` exists but `paramValidations` is falsy. When `excludeParamsWithNoValidationMatch` is `false`, all client parameters should be passed through.

### Change Location

File: `src/lib/tools/ClientRequest.class.js`
Method: `#hasValidParameters(paramValidations, clientParameters, validationMatcher)`

### Logic Change

Replace the guard:
```javascript
if (clientParameters && paramValidations) {
```

With logic that handles the passthrough case:
```javascript
if (clientParameters) {
    const excludeUnmatched = ClientRequest.#validations.parameters?.excludeParamsWithNoValidationMatch !== false;
    
    if (!paramValidations) {
        // No validation rules for this parameter type
        if (!excludeUnmatched) {
            // Passthrough: include all client parameters without validation
            rValue.params = { ...clientParameters };
        }
        // else: default behavior, return empty params
        return rValue;
    }
    
    // ... existing validation logic (unchanged)
}
```

This approach:
1. Moves the `excludeUnmatched` check before the `paramValidations` guard
2. When no validations exist and passthrough is enabled, copies all client parameters
3. Preserves all existing behavior when `paramValidations` is defined
4. Preserves default behavior (exclude unmatched) when flag is not set

### Impact on Callers

The five caller methods (`#hasValidPathParameters`, `#hasValidQueryStringParameters`, `#hasValidHeaderParameters`, `#hasValidCookieParameters`, `#hasValidBodyParameters`) already normalize their parameters before calling `#hasValidParameters`. The fix is entirely within `#hasValidParameters`, so no caller changes are needed.

### Key Normalization

Parameters passed through without validation will use the same key normalization already applied by each caller:
- Path parameters: as-is from event
- Query parameters: lowercased keys
- Header parameters: camelCased keys
- Cookie parameters: as-is from event
- Body parameters: as-is from parsed JSON

## Correctness Properties

### Property 1: Passthrough Completeness
For all parameter types T and all parameter sets P:
  If `excludeParamsWithNoValidationMatch` is `false` AND no validation rules exist for T,
  Then the getter for T returns all parameters in P (with appropriate key normalization).

### Property 2: Default Exclusion Preservation
For all parameter types T and all parameter sets P:
  If `excludeParamsWithNoValidationMatch` is `true` (or unset) AND no validation rules exist for T,
  Then the getter for T returns `{}`.

### Property 3: Validation Still Applies
For all parameter types T with validation rules V and all parameter sets P:
  If `excludeParamsWithNoValidationMatch` is `false` AND validation rules exist for T,
  Then parameters matching rules in V are validated normally,
  AND parameters NOT matching any rule in V are passed through without validation.

### Property 4: Validity Unaffected by Passthrough
For all requests R:
  If parameters pass through without validation (no rules configured, passthrough enabled),
  Then `isValid()` returns `true` (passthrough does not cause validation failure).

## Testing Strategy

### Unit Tests
- Body parameters passthrough with no validations configured
- Body parameters passthrough with empty validations object
- All parameter types passthrough with no validations configured
- Default behavior preserved (exclude unmatched)
- Mixed scenarios: some types with validations, some without

### Property-Based Tests
- Properties 1-4 above tested with generated parameter sets
- Verify passthrough completeness across random parameter names and values
- Verify default exclusion across random parameter sets
