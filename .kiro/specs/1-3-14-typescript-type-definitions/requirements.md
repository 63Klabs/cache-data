# Requirements Document

## Introduction

This feature adds TypeScript type definition files (`.d.ts`) to the @63klabs/cache-data NPM package so that consumers get IntelliSense support (autocomplete, parameter hints, return type information, and hover documentation) without converting the package source code from JavaScript to TypeScript. The declaration files will be shipped with the package and referenced via the `types` field in `package.json`.

## Glossary

- **Declaration_File**: A TypeScript type definition file with the `.d.ts` extension that describes the shape of a JavaScript module's public API without containing implementation code.
- **Package**: The @63klabs/cache-data NPM package (version 1.3.14), a CommonJS JavaScript library.
- **IntelliSense**: IDE features including autocomplete, parameter hints, return type information, and documentation on hover, powered by TypeScript language services.
- **Consumer**: A developer who installs and uses the Package in their own project.
- **Tools_Module**: The `tools` export of the Package, providing logging, debugging, request handling, AWS integration, and utility classes/functions.
- **Cache_Module**: The `cache` export of the Package, providing distributed caching using DynamoDB and S3.
- **Endpoint_Module**: The `endpoint` export of the Package, providing HTTP/HTTPS request handling.
- **Main_Declaration_File**: The root `.d.ts` file referenced by the `types` field in `package.json` that declares the top-level module structure.
- **Type_Checker**: The TypeScript compiler (`tsc`) used to validate Declaration_Files for syntactic and semantic correctness.

## Requirements

### Requirement 1: Package.json Types Field Configuration

**User Story:** As a Consumer, I want the Package to declare its type definitions in `package.json`, so that my IDE automatically discovers the Declaration_Files when I import the Package.

#### Acceptance Criteria

1. THE Package SHALL include a `types` field in `package.json` that points to the Main_Declaration_File.
2. WHEN a Consumer imports the Package using `require("@63klabs/cache-data")`, THE IntelliSense SHALL resolve the type information from the Main_Declaration_File.
3. THE Main_Declaration_File SHALL declare the top-level module structure exporting `tools`, `cache`, and `endpoint` namespaces.

### Requirement 2: Tools Module Type Declarations

**User Story:** As a Consumer, I want type definitions for all public classes, functions, and variables in the Tools_Module, so that I get autocomplete and parameter hints when using tools functionality.

#### Acceptance Criteria

1. THE Declaration_File for the Tools_Module SHALL declare types for all public classes: `AWS`, `AWSXRay`, `ApiRequest`, `ImmutableObject`, `Timer`, `DebugAndLog`, `Connection`, `Connections`, `ConnectionRequest`, `ConnectionAuthentication`, `RequestInfo`, `ClientRequest`, `ResponseDataModel`, `Response`, `AppConfig`, `CachedSsmParameter`, `CachedSecret`, `CachedParameterSecret`, and `CachedParameterSecrets`.
2. THE Declaration_File for the Tools_Module SHALL declare types for all public functions: `printMsg`, `sanitize`, `obfuscate`, and `hashThisData`.
3. THE Declaration_File for the Tools_Module SHALL declare types for all public variables: `nodeVer`, `nodeVerMajor`, `nodeVerMinor`, and `nodeVerMajorMinor`.
4. THE Declaration_File for the Tools_Module SHALL declare types for all generic response modules: `jsonGenericResponse`, `htmlGenericResponse`, `rssGenericResponse`, `xmlGenericResponse`, and `textGenericResponse`.
5. WHEN a Consumer accesses a class from the Tools_Module, THE IntelliSense SHALL display constructor parameters, static methods, instance methods, and public properties with their types.

### Requirement 3: Cache Module Type Declarations

**User Story:** As a Consumer, I want type definitions for the public classes in the Cache_Module, so that I get autocomplete and parameter hints when using caching functionality.

#### Acceptance Criteria

1. THE Declaration_File for the Cache_Module SHALL declare types for the public classes: `Cache`, `CacheableDataAccess`, and `TestHarness`.
2. THE Declaration_File for the Cache_Module SHALL declare the `CacheDataFormat` typedef as a TypeScript interface.
3. WHEN a Consumer calls `Cache.init()` or `CacheableDataAccess.getData()`, THE IntelliSense SHALL display parameter types, return types, and documentation.

### Requirement 4: Endpoint Module Type Declarations

**User Story:** As a Consumer, I want type definitions for the public functions and classes in the Endpoint_Module, so that I get autocomplete and parameter hints when making endpoint requests.

#### Acceptance Criteria

1. THE Declaration_File for the Endpoint_Module SHALL declare types for the public functions: `send`, `get`, and `getDataDirectFromURI`.
2. THE Declaration_File for the Endpoint_Module SHALL declare the `ConnectionObject` typedef as a TypeScript interface.
3. WHEN a Consumer calls `endpoint.send()`, THE IntelliSense SHALL display the connection parameter structure and the return type (Promise resolving to a response object).

### Requirement 5: Deprecated API Annotations

**User Story:** As a Consumer, I want deprecated APIs to be marked with `@deprecated` in the Declaration_Files, so that my IDE warns me when I use deprecated functionality.

#### Acceptance Criteria

1. THE Declaration_File SHALL mark the following exports with `@deprecated` JSDoc annotations: `Aws`, `AwsXRay`, `APIRequest`, `_ConfigSuperClass`, `CachedSSMParameter`.
2. THE Declaration_File SHALL mark the following Endpoint_Module functions with `@deprecated` JSDoc annotations: `get` and `getDataDirectFromURI`.
3. WHEN a Consumer uses a deprecated export, THE IntelliSense SHALL display a deprecation warning with guidance on the replacement API.

### Requirement 6: Interface and Typedef Declarations

**User Story:** As a Consumer, I want TypeScript interfaces for all documented object shapes (typedefs), so that I get autocomplete when constructing configuration objects and reading response objects.

#### Acceptance Criteria

1. THE Declaration_File SHALL declare a `ConnectionObject` interface with properties: `method`, `uri`, `protocol`, `host`, `path`, `parameters`, `headers`, `body`, `note`, `options`, and `cache`.
2. THE Declaration_File SHALL declare a `CacheProfileObject` interface with properties: `profile`, `overrideOriginHeaderExpiration`, `defaultExpirationInSeconds`, `expirationIsOnInterval`, `headersToRetain`, `hostId`, `pathId`, and `encrypt`.
3. THE Declaration_File SHALL declare a `CacheDataFormat` interface with properties: `cache.body`, `cache.headers`, `cache.expires`, and `cache.statusCode`.
4. WHEN a Consumer constructs a `ConnectionObject` or `CacheProfileObject`, THE IntelliSense SHALL display all available properties with their types.

### Requirement 7: Declaration File Validity

**User Story:** As a package maintainer, I want the Declaration_Files to be syntactically and semantically valid TypeScript, so that they do not cause errors in Consumer projects.

#### Acceptance Criteria

1. WHEN the Type_Checker validates the Declaration_Files using `tsc --noEmit`, THE Type_Checker SHALL report zero errors.
2. THE Declaration_Files SHALL use only TypeScript declaration syntax (no implementation code).
3. THE Declaration_Files SHALL be compatible with TypeScript versions 4.5 and above.

### Requirement 8: AppConfig Extensibility

**User Story:** As a Consumer, I want the `AppConfig` class type definition to support extension via class inheritance, so that my custom Config class gets proper IntelliSense when extending AppConfig.

#### Acceptance Criteria

1. THE Declaration_File SHALL declare `AppConfig` as a class that can be extended using `class Config extends AppConfig`.
2. WHEN a Consumer extends `AppConfig`, THE IntelliSense SHALL display inherited static methods: `init`, `settings`, `connections`, `getConnection`, `getConn`, `getConnCacheProfile`, `promise`, and `add`.
3. THE Declaration_File SHALL declare the `init` method parameter as an options object with typed properties for `settings`, `connections`, `validations`, `responses`, `ssmParameters`, and `debug`.

### Requirement 9: Declaration Files Shipped with Package

**User Story:** As a Consumer, I want the Declaration_Files to be included in the published NPM package, so that I do not need to install a separate `@types` package.

#### Acceptance Criteria

1. THE Declaration_Files SHALL be included in the published package (not excluded by `.npmignore`).
2. THE Package SHALL NOT require Consumers to install a separate `@types/@63klabs/cache-data` package.
3. THE Declaration_Files SHALL be located alongside the source files or in a dedicated types directory referenced by `package.json`.

### Requirement 10: JSDoc Documentation in Declaration Files

**User Story:** As a Consumer, I want JSDoc comments in the Declaration_Files, so that I see documentation on hover in my IDE.

#### Acceptance Criteria

1. THE Declaration_File SHALL include JSDoc descriptions for all public classes.
2. THE Declaration_File SHALL include JSDoc `@param` tags for all method parameters.
3. THE Declaration_File SHALL include JSDoc `@returns` tags for all methods with non-void return types.
4. THE Declaration_File SHALL include JSDoc `@example` tags for primary public API methods (e.g., `Cache.init`, `CacheableDataAccess.getData`, `endpoint.send`, `AppConfig.init`).
5. WHEN a Consumer hovers over a class, method, or function from the Package, THE IntelliSense SHALL display the JSDoc documentation from the Declaration_File.
