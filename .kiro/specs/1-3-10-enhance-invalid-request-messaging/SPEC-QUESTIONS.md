# SPEC Questions

## Questions for Clarification

### Q1: Status Code Priority When Multiple Validations Fail

When multiple validation checks fail (e.g., both referrer is invalid AND parameters are invalid), which status code should take priority in the `getValidationReason()` response?

**Proposed approach:** Use a priority order: 401 (authentication) > 403 (referrer/forbidden) > 400 (invalid parameters). The highest-priority failure determines the `statusCode`, but all failure messages are collected in the `messages` array.

### Q2: Status Code as Number or String

The SPEC examples show `statusCode` as a string (`"403"`, `"401"`, `"400"`, `"200"`). Should the `statusCode` in the validation reason object be a numeric type (consistent with HTTP conventions and the Response class which uses `parseInt`) or a string as shown?

**Proposed approach:** Use numeric type (`403`, `401`, `400`, `200`) for consistency with the Response class and HTTP standards. The SPEC examples may have used strings for illustration purposes.

### Q3: Response Class Message Support

The SPEC asks: "Does the Response object allow for passing of a message to add to one of the static JSON or HTML responses?"

Currently, the Response class does not have a built-in method to inject custom messages into generic responses. The `addToJsonBody()` method can merge properties into JSON bodies, but there's no equivalent for HTML/XML/RSS/Text. Should this feature add a convenience method to the Response class for setting a custom message on generic responses, or is the existing `addToJsonBody()` sufficient?

**Proposed approach:** Add a `setMessage(message)` convenience method to the Response class that adds a `message` property to JSON bodies (via `addToJsonBody`) and appends text to string-based bodies. This keeps it simple and backwards-compatible.

### Q4: Validation Reason Persistence

Should `getValidationReason()` be callable at any time after construction, or only when `isValid()` returns false? The SPEC shows it being called in the `else` branch, but it would also be useful to call it when `isValid()` is true (returning the `{ isValid: true, statusCode: 200, messages: [] }` object).

**Proposed approach:** Make it always available. When valid, return `{ isValid: true, statusCode: 200, messages: [] }`. When invalid, return the failure details.

### Q5: Backwards Compatibility of isValid()

The current `isValid()` method returns a simple boolean. Should the existing `isValid()` behavior remain unchanged (returning boolean), with `getValidationReason()` as a separate new method? Or should `isValid()` be modified?

**Proposed approach:** Keep `isValid()` returning a boolean (no breaking change). Add `getValidationReason()` as a new method. This is a minor version addition with zero breaking changes.
