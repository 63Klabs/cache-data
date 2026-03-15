# Requirements: Fix excludeParamsWithNoValidationMatch Passthrough When No Validations Configured

## Problem Statement

When `excludeParamsWithNoValidationMatch` is set to `false`, parameters should be passed through even when no validation rules are configured for that parameter type. Currently, `#hasValidParameters()` has a guard condition `if (clientParameters && paramValidations)` that short-circuits the entire method when `paramValidations` is `undefined` or `null`, returning `{ isValid: true, params: {} }`. This means parameters are silently dropped even though the user explicitly opted into passthrough behavior.

This bug affects ALL parameter types (path, query, header, cookie, body) but is most commonly encountered with `bodyParameters` since body payloads often contain fields that don't have individual validation rules.

## User Stories

### Story 1: Body Parameter Passthrough Without Validation Rules
As a developer using `excludeParamsWithNoValidationMatch: false`, I want body parameters to be available via `getBodyParameters()` even when no `bodyParameters` validation rules are configured, so that I can access the parsed request body without defining validation for every field.

#### Acceptance Criteria
- 1.1: When `excludeParamsWithNoValidationMatch` is `false` and no `bodyParameters` validations are configured, `getBodyParameters()` returns the parsed body object with all fields.
- 1.2: When `excludeParamsWithNoValidationMatch` is `false` and `bodyParameters` validations is an empty object `{}`, `getBodyParameters()` returns the parsed body object with all fields.
- 1.3: When `excludeParamsWithNoValidationMatch` is `true` (default) and no `bodyParameters` validations are configured, `getBodyParameters()` returns `{}` (existing behavior preserved).
- 1.4: `bodyPayload` in `getProps()` continues to contain the raw body string regardless of validation settings.

### Story 2: All Parameter Types Passthrough Without Validation Rules
As a developer, I want the `excludeParamsWithNoValidationMatch: false` flag to work consistently across all parameter types, so that any parameter type without validation rules still passes through its values.

#### Acceptance Criteria
- 2.1: When `excludeParamsWithNoValidationMatch` is `false` and no `pathParameters` validations are configured, `getPathParameters()` returns the path parameters from the event.
- 2.2: When `excludeParamsWithNoValidationMatch` is `false` and no `queryStringParameters` validations are configured, `getQueryStringParameters()` returns the query parameters from the event (lowercased keys).
- 2.3: When `excludeParamsWithNoValidationMatch` is `false` and no `headerParameters` validations are configured, `getHeaderParameters()` returns the header parameters from the event (camelCased keys).
- 2.4: When `excludeParamsWithNoValidationMatch` is `false` and no `cookieParameters` validations are configured, `getCookieParameters()` returns the cookie parameters from the event.

### Story 3: Backwards Compatibility
As a developer with existing applications, I want the default behavior to remain unchanged so that my applications continue to work without modification.

#### Acceptance Criteria
- 3.1: Default behavior (`excludeParamsWithNoValidationMatch` not set or `true`) is unchanged — parameters without validation rules are excluded.
- 3.2: Existing validation rules continue to work correctly when `excludeParamsWithNoValidationMatch` is `false`.
- 3.3: Mixed scenarios (some parameter types with validations, some without) work correctly — validated types use their rules, unvalidated types pass through all values.
- 3.4: The `isValid()` result is not affected by the passthrough — requests remain valid when parameters pass through without validation.
