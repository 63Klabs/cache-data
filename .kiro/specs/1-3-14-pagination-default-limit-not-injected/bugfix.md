# Bugfix Requirements Document

## Introduction

When pagination is enabled with a `defaultLimit` value, the `ApiRequest` constructor does not inject `defaultLimit` as the `parameters[limitLabel]` query parameter on the initial HTTP request. The limit value is only used internally for offset math in `_handlePagination()`, but the actual request URL never includes it. This causes the remote API to use its own default page size (e.g., 20 items), while `_handlePagination` assumes the first page contained `defaultLimit` items (e.g., 1000), leading to incorrect pagination math and incomplete data retrieval.

**GitHub Issue**: [#230](https://github.com/63Klabs/cache-data/issues/230)

**Impact**: Only a fraction of the expected dataset is returned. The initial request fetches the API's small default page size, and pagination math incorrectly concludes no additional pages are needed.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN pagination is enabled with `defaultLimit` configured (e.g., 1000) AND `parameters` does not contain the `limitLabel` key THEN the system constructs the initial request URI (as returned by `getURI()`) without a query parameter matching `limitLabel=defaultLimit`, causing the remote API to apply its own default page size instead of the configured `defaultLimit`

1.2 WHEN pagination is enabled AND the initial request URI omits the limit query parameter AND the remote API returns a `totalItems` count equal to the API's own smaller page size (e.g., 20) THEN `_handlePagination()` resolves `limit` to `defaultLimit` (e.g., 200) via the fallback `this.#request.parameters[limitLabel] || defaultLimit`, computes zero offsets because `defaultLimit >= totalRecords`, and returns without fetching additional pages

1.3 WHEN pagination is enabled AND `parameters` is `undefined`, `null`, or an empty object `{}` AND `defaultLimit` is configured THEN the system does not create or populate a `parameters` object with `parameters[limitLabel] = defaultLimit` before URI construction, resulting in `getURI()` containing no query parameter for the limit

### Expected Behavior (Correct)

2.1 WHEN pagination is enabled with `defaultLimit` configured AND `parameters` does not contain the `limitLabel` key, THEN the system SHALL inject `defaultLimit` as `parameters[limitLabel]` before constructing the request URI, so that the initial HTTP request includes the limit in the query string (e.g., `?take=1000`)

2.2 WHEN pagination is enabled AND the initial request includes the injected or user-provided limit parameter, THEN the system SHALL use the same numeric limit value for both the HTTP request query string and the offset calculation in `_handlePagination()`, ensuring that the offset increments by exactly the limit value used in the query string

2.3 IF pagination is enabled AND `parameters` is `undefined`, `null`, or an empty object `{}` AND `defaultLimit` is configured, THEN the system SHALL create or populate the `parameters` object with `parameters[limitLabel] = defaultLimit` before URI construction, producing a query string that contains the `limitLabel` key with the `defaultLimit` value

2.4 IF pagination is enabled AND `parameters` already contains the `limitLabel` key with a numeric value greater than 0, THEN the system SHALL preserve the user-provided limit value unchanged and SHALL NOT overwrite it with `defaultLimit`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN pagination is enabled AND `parameters` already contains an explicit value for the `limitLabel` key (e.g., `parameters: { take: 500 }`) THEN the system SHALL CONTINUE TO use the user-provided limit value and NOT override it with `defaultLimit`

3.2 WHEN pagination is disabled (the `pagination` key is absent, set to null, or configured with `enabled: false`) THEN the system SHALL CONTINUE TO construct the URI using only the `parameters` object as provided, without injecting any limit parameter

3.3 WHEN pagination is enabled AND `parameters` contains other query parameters (e.g., filters, sort) THEN the system SHALL CONTINUE TO include all existing parameters in the query string alongside the injected limit parameter

3.4 WHEN pagination is enabled AND `defaultLimit` is not explicitly configured (using the default value of 200) AND `parameters` does not contain the `limitLabel` key THEN the system SHALL inject the default value of 200 as `parameters[limitLabel]`

3.5 WHEN a request does not use pagination at all THEN the system SHALL CONTINUE TO construct the URI as `{protocol}://{host}{path}?{query string from parameters}` with no additional parameters injected and no modification to the `parameters` object

---

## Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ApiRequestConfig
  OUTPUT: boolean
  
  // Returns true when pagination is enabled but no explicit limit parameter is provided
  RETURN X.pagination.enabled = true
     AND (X.parameters IS NULL
          OR X.parameters IS UNDEFINED
          OR X.parameters[X.pagination.limitLabel] IS UNDEFINED)
END FUNCTION
```

### Property: Fix Checking

```pascal
// Property: Fix Checking - defaultLimit injected as query parameter
FOR ALL X WHERE isBugCondition(X) DO
  request ← ApiRequest'(X)
  uri ← request.getURI()
  ASSERT uri CONTAINS (X.pagination.limitLabel + "=" + X.pagination.defaultLimit)
END FOR
```

### Property: Preservation Checking

```pascal
// Property: Preservation Checking - explicit limit not overridden
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT ApiRequest(X).getURI() = ApiRequest'(X).getURI()
END FOR
```
