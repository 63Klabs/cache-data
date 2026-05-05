# Implementation Plan: TypeScript Type Definitions

## Overview

Add TypeScript declaration files (`.d.ts`) to the @63klabs/cache-data package so consumers get IntelliSense support. The implementation creates hand-written declaration files in a `types/` directory, configures `package.json` to reference them, and validates correctness through compilation tests and property-based structural tests.

## Tasks

- [x] 1. Set up TypeScript infrastructure and main entry point
  - [x] 1.1 Add TypeScript as a devDependency and create test tsconfig
    - Run `npm install --save-dev typescript` to add TypeScript compiler
    - Create `test/types/tsconfig.json` with `strict: true`, `noEmit: true`, `module: "commonjs"`, `target: "ES2020"`, targeting TypeScript 4.5+ compatibility
    - Add `"types": "types/index.d.ts"` field to `package.json`
    - _Requirements: 1.1, 7.3, 9.1_

  - [x] 1.2 Create main declaration file (`types/index.d.ts`)
    - Declare the top-level module using `import ... = require(...)` pattern for CommonJS
    - Export `tools`, `cache`, and `endpoint` namespaces matching `src/index.js` structure
    - Include JSDoc module description
    - _Requirements: 1.2, 1.3_

- [x] 2. Implement Tools module type declarations
  - [x] 2.1 Create `types/lib/tools/index.d.ts` with class declarations
    - Declare all 18+ public classes: `AWS`, `AWSXRay`, `ApiRequest`, `ImmutableObject`, `Timer`, `DebugAndLog`, `Connection`, `Connections`, `ConnectionRequest`, `ConnectionAuthentication`, `RequestInfo`, `ClientRequest`, `ResponseDataModel`, `Response`, `AppConfig`, `CachedSsmParameter`, `CachedSecret`, `CachedParameterSecret`, `CachedParameterSecrets`
    - Include constructor signatures, static methods, instance methods, and public properties with types
    - Declare `AppConfig` as extensible class with `init`, `add`, `settings`, `connections`, `getConnection`, `getConn`, `getConnCacheProfile`, and `promise` static methods
    - Declare `AppConfigInitOptions` interface for the `init` method parameter
    - Include JSDoc descriptions, `@param`, `@returns`, and `@example` tags for primary methods
    - _Requirements: 2.1, 2.5, 8.1, 8.2, 8.3, 10.1, 10.2, 10.3, 10.4_

  - [x] 2.2 Add function, variable, and generic response declarations to tools
    - Declare functions: `printMsg`, `sanitize`, `obfuscate`, `hashThisData` with parameter and return types
    - Declare variables: `nodeVer`, `nodeVerMajor`, `nodeVerMinor`, `nodeVerMajorMinor` as string/number types
    - Declare generic response modules: `jsonGenericResponse`, `htmlGenericResponse`, `rssGenericResponse`, `xmlGenericResponse`, `textGenericResponse`
    - Include JSDoc for all declarations
    - _Requirements: 2.2, 2.3, 2.4, 10.1, 10.2, 10.3_

  - [x] 2.3 Add deprecated aliases and shared interfaces to tools
    - Declare deprecated aliases: `Aws`, `AwsXRay`, `APIRequest`, `_ConfigSuperClass`, `CachedSSMParameter` with `@deprecated` JSDoc annotations including replacement guidance
    - Declare `ConnectionObject` interface with all properties: `method`, `uri`, `protocol`, `host`, `path`, `parameters`, `headers`, `body`, `note`, `options`, `cache`
    - Declare `CacheProfileObject` interface with all properties: `profile`, `overrideOriginHeaderExpiration`, `defaultExpirationInSeconds`, `expirationIsOnInterval`, `headersToRetain`, `hostId`, `pathId`, `encrypt`
    - _Requirements: 5.1, 5.3, 6.1, 6.2_

- [x] 3. Implement Cache module type declarations
  - [x] 3.1 Create `types/lib/dao-cache.d.ts`
    - Declare `Cache` class with static methods: `init`, `info`, `bool`, `generateIdHash` and relevant instance methods
    - Declare `CacheableDataAccess` class with static methods: `getData`, `prime`
    - Declare `TestHarness` class with `getInternals` static method
    - Declare `CacheDataFormat` interface with `cache.body`, `cache.headers`, `cache.expires`, `cache.statusCode` properties
    - Declare `CacheInitParameters` interface for `Cache.init()` parameters
    - Declare `CacheProfileObject` interface (or reference from tools)
    - Include JSDoc with `@param`, `@returns`, and `@example` tags for `Cache.init()` and `CacheableDataAccess.getData()`
    - _Requirements: 3.1, 3.2, 3.3, 6.3, 10.1, 10.2, 10.3, 10.4_

- [x] 4. Implement Endpoint module type declarations
  - [x] 4.1 Create `types/lib/dao-endpoint.d.ts`
    - Declare `send` function with `connection` and optional `query` parameters, returning `Promise<EndpointResponse>`
    - Declare `get` function with `@deprecated` JSDoc annotation pointing to `send`
    - Declare `getDataDirectFromURI` function with `@deprecated` JSDoc annotation pointing to `send`
    - Declare `ConnectionObject` interface (or reference from tools)
    - Declare `EndpointResponse` interface with `success`, `statusCode`, `body`, `headers` properties
    - Include JSDoc with `@param`, `@returns`, and `@example` tags for `send()`
    - _Requirements: 4.1, 4.2, 4.3, 5.2, 5.3, 6.1, 10.1, 10.2, 10.3, 10.4_

- [x] 5. Checkpoint - Validate declaration files compile
  - Ensure `tsc --noEmit` passes on all declaration files with no errors, ask the user if questions arise.

- [x] 6. Create consumer compilation tests
  - [x] 6.1 Create consumer test files for type validation
    - Create `test/types/consumer-tools.ts` that imports and uses tools module classes, functions, and variables
    - Create `test/types/consumer-cache.ts` that imports and uses Cache, CacheableDataAccess, and interfaces
    - Create `test/types/consumer-endpoint.ts` that imports and uses endpoint.send() with ConnectionObject
    - Create `test/types/consumer-appconfig-extend.ts` that extends AppConfig and verifies inherited methods
    - Each file should exercise type resolution without runtime execution (compile-only validation)
    - _Requirements: 1.2, 2.5, 3.3, 4.3, 7.1, 8.1, 8.2_

  - [x] 6.2 Add npm script for type validation
    - Add `"test:types": "tsc --noEmit -p test/types/tsconfig.json"` script to `package.json`
    - Verify all consumer test files compile without errors
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 7. Create property-based structural tests
  - [x] 7.1 Write property test for Public Export Type Coverage (Property 1)
    - **Property 1: Public Export Type Coverage**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.1, 4.1**
    - For each known public export in source files, verify a corresponding declaration exists in the `.d.ts` file
    - Use fast-check to generate selections from the known exports list and verify each has a type declaration
    - Create `test/types/property/type-definitions-property-tests.jest.mjs`

  - [x] 7.2 Write property test for Deprecated Export Annotation Coverage (Property 2)
    - **Property 2: Deprecated Export Annotation Coverage**
    - **Validates: Requirements 5.1, 5.2**
    - For each known deprecated export, verify `@deprecated` appears in the corresponding `.d.ts` file
    - Use fast-check to select from deprecated exports and verify annotation presence

  - [x] 7.3 Write property test for Interface Property Completeness (Property 3)
    - **Property 3: Interface Property Completeness**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - For each specified interface property in requirements, verify it exists in the TypeScript interface declaration
    - Use fast-check to select from required interface properties and verify presence

  - [x] 7.4 Write property test for Declaration File Validity (Property 4)
    - **Property 4: Declaration File Validity (No Implementation Code)**
    - **Validates: Requirements 7.1, 7.2**
    - For each `.d.ts` file, verify no implementation patterns exist (no function bodies, no variable assignments with runtime values)
    - Use fast-check to select from declaration files and verify structural validity

  - [x] 7.5 Write property test for JSDoc Documentation Completeness (Property 5)
    - **Property 5: JSDoc Documentation Completeness**
    - **Validates: Requirements 10.1, 10.2, 10.3**
    - For each declared class/method in `.d.ts` files, verify JSDoc comment block exists with appropriate tags
    - Use fast-check to select from declared symbols and verify JSDoc presence

- [x] 8. Verify package publishing configuration
  - [x] 8.1 Verify `.npmignore` does not exclude `types/` directory
    - Confirm `types/` is not listed in `.npmignore`
    - Confirm `test/types/` IS excluded (test files should not ship)
    - Add `test/types` to `.npmignore` if not already excluded by the `test` entry
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Run `npm test` to ensure existing tests still pass
  - Run `npm run test:types` to ensure type declarations compile
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The design uses TypeScript specifically, so all declaration files use TypeScript syntax
- TypeScript is added as a devDependency only — it is not shipped with the package
- The `types/` directory ships with the package; `test/types/` does not
- fast-check is already available in devDependencies
