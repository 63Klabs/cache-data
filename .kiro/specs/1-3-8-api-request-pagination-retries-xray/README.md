# API Request Pagination Retries XRay

The APIRequest class requires some updates to include pagination, request retries, and better X-Ray segmentation.

An example working implementation that has been used in production is available in the following 3 files:

- [Acme.dao.class.js](Acme.dao.class.js)
- [AcmeApi.dao.class.js](AcmeApi.dao.class.js)
- [rockets.service.js](rockets.service.js)

These were implemented in a production project but so that they can be replicated across other projects we need to move pagination into APIRequest. Be sure to review how the files and methods are related.

The PAGINATION_OPTIONS in AcmeApi should continue to be used in the developer's DAO class.

paginateResults() in Acme.dao.class should be moved to APIRequest. Also, retries in the get() in Acme should be moved to APIRequest.

It is imperative that the APIRequest class does not receive any breaking changes. All current tests must pass and not be disturbed. Only new tests should be added to ensure the changes work.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.

Documentation will need to be updated.

## Pagination

[Add pagination to the API Request Tool #173](https://github.com/63Klabs/cache-data/issues/173)

API responses of long lists often employ pagination. It would be helpful if pagination within the API tool could be "turned on" if desired.

Since pagination takes many forms and requires different query parameter names and different response object names, it would be necessary to be able to pass hints to the API tool.

A "continuation token" would also need to be an option

Care should be taken to not introduce any breaking changes.

Pagination options are not required by functions calling APIRequest and not all requests require use of pagination.

# API Request Retries

[Add Retries to API Request Tool #172](https://github.com/63Klabs/cache-data/issues/172)

Add retries directly to the API Request.

To allow the calling function or class the ability to perform its own retries (either including or excluding the underlying retries) the API function should return some meta data about the response, including the number of retries.

This should be able to offload the retry code to the APIRequest class API tools, but allow classes to perform their own retries as necessary.

## XRay Subsegments in API Request

[Add AWS X-Ray subsegments to API Request Tool #171](https://github.com/63Klabs/cache-data/issues/171)

When multiple request within the same Lambda invocation are sent to the same endpoint, not all x-ray traces are recorded. 

For each distinct API call, create a custom subsegment to track it separately.

Identify where the issue may be in terms of the meta data and why each call may not be tracked.

Retry and pagination information should be included in the meta data of the xray request so that the segments can be tracked and identified.
