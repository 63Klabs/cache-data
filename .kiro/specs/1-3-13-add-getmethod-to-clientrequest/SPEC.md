# Add getMethod to ClientRequest

I want to add a new method called `getMethod` to `ClientRequest` so that `.getProps().method` is not the roundabout way to get the http method. getMethod should return the HTTP method in all upper case.

Also, the `method` property should also be in all upper case if it isn't already.

Identify documentation that needs to be updated.
Identify tests that need to be updated.
Update relevant documents and tests.

This is not considered a breaking change.