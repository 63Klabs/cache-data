Something in the 1.3.6 release seems to have changed the way cache-dao is used.

All tests pass, but none really go over cache-dao which uses AWS resources.

The error that comes up is:

```
2026-02-05T21:55:55.144Z	cc38c8d4-aee4-4feb-ac6c-06441bbd63cb	ERROR	[ERROR] Error in APIRequest call to remote endpoint (Get data from endpoint): Invalid value "undefined" for header "if-modified-since" | {
  value: 'TypeError [ERR_HTTP_INVALID_HEADER_VALUE]: Invalid value "undefined" for header "if-modified-since"\n' +
    '    at ClientRequest.setHeader (node:_http_outgoing:645:3)\n' +
    '    at new ClientRequest (node:_http_client:355:14)\n' +
    '    at request (node:https:633:10)\n' +
    '    at captureOutgoingHTTPs (/var/task/node_modules/aws-xray-sdk-core/dist/lib/patchers/http_p.js:134:19)\n' +
    '    at Object.captureHTTPsRequest [as request] (/var/task/node_modules/aws-xray-sdk-core/dist/lib/patchers/http_p.js:175:16)\n' +
    '    at /var/task/node_modules/@63klabs/cache-data/src/lib/tools/APIRequest.class.js:57:19\n' +
    '    at new Promise (<anonymous>)\n' +
    '    at _httpGetExecute (/var/task/node_modules/@63klabs/cache-data/src/lib/tools/APIRequest.class.js:39:9)\n' +
    '    at /var/task/node_modules/@63klabs/cache-data/src/lib/tools/APIRequest.class.js:586:31\n' +
    '    at /var/task/node_modules/aws-xray-sdk-core/dist/lib/capture.js:95:25'
}
```

We need to figure out what changed and either update the code so that it handles undefined properties properly, OR see if something in the code is now incorrectly providing undefined properties. Was this an existing bug that has now surfaced due to better checks, or did something break and is causing the undefined?

Figuring this out is paramount as we do not want to further break things and not address the true cause.

Examine the specs in the directories starting with `1-3-6-*` and see if there were any changes to cache-dao beyond documentation.

Evaluate cache-dao and see if it is providing undefined values where it shouldn't be.

We need to improve tests to catch these issues earlier. One thing we should do is migrate to Jest so we can utilize aws resource mocking. However, we don't want to go too far down that road, we mainly want to fix this issue and test for it.

1. Identify the issue causing the error
2. Fix the issue
3. Set up Jest (we will continue to use Mocha for now for established tests and migrate at a later date)
4. Ensure mocha and jest tests can be run separately without conflict.
5. Write tests to validate cache-dao fix works properly and doesn't pass undefined values to http headers.
6. Report back how many tests it would take to fully test cache-dao and we'll decide if we will do those now.
7. Update any documentation

If you have any questions or need clarification, or have observations and recommendations, please ask them in SPEC-QUESTIONS.md in this directory and I will answer and respond to them there.