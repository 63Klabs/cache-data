# Requirements Document

## Introduction

The five `generic.response.*.js` files (`html`, `json`, `rss`, `text`, `xml`) in `src/lib/tools/` share an identical structure: each defines the same ten status code response objects (200, 400, 401, 403, 404, 405, 408, 418, 427, 500), a `response()` switch function, `contentType`, `headers`, and a format-specific body builder. The duplicated switch logic and response object definitions make it difficult to add new status codes or update messages consistently.

This feature introduces a centralized `generic.response.js` module that encapsulates the shared logic. Each format-specific file will delegate to this central module by passing a configuration object containing its content type and body formatter. All existing exports, return values, and public API contracts remain unchanged to preserve backwards compatibility.

## Glossary

- **Generic_Response_Module**: The new centralized `generic.response.js` file in `src/lib/tools/` that exports factory functions for building response objects and the `response()` lookup function.
- **Format_File**: One of the five existing format-specific files: `generic.response.html.js`, `generic.response.json.js`, `generic.response.rss.js`, `generic.response.text.js`, `generic.response.xml.js`.
- **Status_Code_Map**: A JSON object mapping HTTP status codes to their default message strings (e.g., `{ 200: "Success", 400: "Bad Request", ... }`).
- **Body_Formatter**: A function specific to each format that transforms a message string into the appropriate body representation (e.g., HTML wraps in `<html>` tags, JSON returns `{ message: string }`, text returns the raw string).
- **Response_Object**: A plain JavaScript object with the shape `{ statusCode: number, headers: object, body: * }`.
- **Tools_Index**: The `src/lib/tools/index.js` module that exports all tools including the five generic response modules.
- **Response_Class**: The `Response` class in `src/lib/tools/Response.class.js` that consumes the generic response modules.

## Requirements

### Requirement 1: Create Centralized Generic Response Module

**User Story:** As a package maintainer, I want a single centralized module containing the shared response logic, so that I can update status codes and messages in one place.

#### Acceptance Criteria

1. THE Generic_Response_Module SHALL export a function that accepts a content type string and a Body_Formatter function and returns a complete response module object containing `contentType`, `headers`, all ten response objects (`response200` through `response500`), and a `response()` function.
2. THE Generic_Response_Module SHALL define the Status_Code_Map containing entries for status codes 200, 400, 401, 403, 404, 405, 408, 418, 427, and 500 with their corresponding default message strings.
3. WHEN the `response()` function is called with a known status code, THE Generic_Response_Module SHALL return the matching Response_Object for that status code.
4. WHEN the `response()` function is called with an unknown status code, THE Generic_Response_Module SHALL return the Response_Object for status code 500.
5. WHEN the `response()` function is called with a string status code, THE Generic_Response_Module SHALL parse the string to an integer before performing the lookup.
6. THE Generic_Response_Module SHALL reside at `src/lib/tools/generic.response.js`.

### Requirement 2: Refactor Format Files to Use Centralized Module

**User Story:** As a package maintainer, I want each format-specific file to delegate to the centralized module, so that the duplicated switch logic and response definitions are eliminated.

#### Acceptance Criteria

1. WHEN the HTML Format_File is loaded, THE Format_File SHALL import the Generic_Response_Module and pass its content type (`text/html; charset=utf-8`), Body_Formatter (`html` function), and the `html` helper function to the factory, and re-export the resulting module object along with the `html` helper.
2. WHEN the JSON Format_File is loaded, THE Format_File SHALL import the Generic_Response_Module and pass its content type (`application/json`) and Body_Formatter (`json` function) to the factory, and re-export the resulting module object along with the `json` helper.
3. WHEN the RSS Format_File is loaded, THE Format_File SHALL import the Generic_Response_Module and pass its content type (`application/rss+xml`) and Body_Formatter (`rss` function) to the factory, and re-export the resulting module object along with the `rss` helper.
4. WHEN the Text Format_File is loaded, THE Format_File SHALL import the Generic_Response_Module and pass its content type (`text/plain`) and Body_Formatter (`text` function) to the factory, and re-export the resulting module object along with the `text` helper.
5. WHEN the XML Format_File is loaded, THE Format_File SHALL import the Generic_Response_Module and pass its content type (`application/xml`) and Body_Formatter (`xml` function) to the factory, and re-export the resulting module object along with the `xml` helper.

### Requirement 3: Preserve Backwards Compatibility

**User Story:** As a consumer of the @63klabs/cache-data package, I want the refactoring to produce identical outputs, so that my existing application code continues to work without changes.

#### Acceptance Criteria

1. THE each Format_File SHALL export the same set of named properties as before the refactoring: `contentType`, `headers`, `response200`, `response400`, `response401`, `response403`, `response404`, `response405`, `response408`, `response418`, `response427`, `response500`, `response`, and the format-specific helper function (`html`, `json`, `rss`, `text`, or `xml`).
2. FOR ALL supported status codes, THE `response()` function on each Format_File SHALL return a Response_Object with the same `statusCode`, `headers`, and `body` values as the original implementation.
3. THE Tools_Index SHALL continue to export `jsonGenericResponse`, `htmlGenericResponse`, `rssGenericResponse`, `xmlGenericResponse`, and `textGenericResponse` with identical interfaces.
4. THE Response_Class SHALL continue to function correctly with the refactored generic response modules, including `getGenericResponses()` and `CONTENT_TYPE` lookups.

### Requirement 4: Existing Tests Pass Without Modification

**User Story:** As a package maintainer, I want all existing tests to pass without any changes, so that I can verify the refactoring is safe.

#### Acceptance Criteria

1. THE existing Jest test files (`generic-response-html-tests.jest.mjs`, `generic-response-json-tests.jest.mjs`, `generic-response-rss-tests.jest.mjs`, `generic-response-text-tests.jest.mjs`, `generic-response-xml-tests.jest.mjs`) SHALL pass without modification after the refactoring.
2. THE existing Response class tests SHALL pass without modification after the refactoring.

### Requirement 5: New Jest Tests for Centralized Module

**User Story:** As a package maintainer, I want dedicated tests for the new centralized module, so that I can verify the shared logic works correctly in isolation.

#### Acceptance Criteria

1. THE new test file SHALL be a Jest test file with the `.jest.mjs` extension located in the `test/response/` directory.
2. THE new tests SHALL verify that the Generic_Response_Module factory function produces a valid module object with all required properties (`contentType`, `headers`, `response200` through `response500`, and `response`).
3. THE new tests SHALL verify that the `response()` function returns the correct Response_Object for each of the ten supported status codes.
4. THE new tests SHALL verify that the `response()` function returns the 500 Response_Object for unknown status codes.
5. THE new tests SHALL verify that the `response()` function handles string status code inputs by parsing them to integers.
6. THE new tests SHALL verify that the Body_Formatter function is called to generate the body for each response object.
7. THE new tests SHALL verify that the `headers` object contains the correct `Content-Type` value matching the provided content type string.

### Requirement 6: Support Adding New Status Codes

**User Story:** As a package maintainer, I want the centralized module to make it straightforward to add new status codes, so that future additions require changes in only one place.

#### Acceptance Criteria

1. WHEN a new status code entry is added to the Status_Code_Map in the Generic_Response_Module, THE factory function SHALL automatically generate the corresponding response object for all formats that use the module.
2. WHEN a new status code entry is added to the Status_Code_Map, THE `response()` function SHALL recognize the new status code and return the corresponding Response_Object without requiring changes to the switch logic.
