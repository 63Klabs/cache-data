# AWS.classes.js Test Coverage Analysis

## Test Count Summary

**Total Test Cases in test/tools/aws-classes-tests.mjs: 0 (FILE DOES NOT EXIST)**

### Status
- ❌ No test file exists for AWS.classes.js
- ❌ No Mocha tests to migrate
- ✅ Need to create tests from scratch for both Mocha and Jest

## Testable Functionality in src/lib/tools/AWS.classes.js

### 1. Helper Functions

#### isTrue() Function
- **Purpose**: Determines if a value can be considered true
- **Inputs**: boolean, number, string, null, undefined
- **Expected Behavior**:
  - Returns true for: true, 1, "1", "true", "TRUE", "True"
  - Returns false for: false, 0, "0", "false", null, undefined, "", other strings

#### USE_XRAY Constant
- **Purpose**: Determines if X-Ray should be enabled
- **Depends On**: process.env.CacheData_AWSXRayOn or process.env.CACHE_DATA_AWS_X_RAY_ON
- **Expected Behavior**:
  - True if either environment variable is truthy
  - False otherwise

#### initializeXRay() Function
- **Purpose**: Initializes AWS X-Ray SDK if enabled
- **Expected Behavior**:
  - Returns AWSXRay object if USE_XRAY is true and initialization succeeds
  - Returns null if USE_XRAY is false
  - Returns null if initialization fails (error caught)
  - Only initializes once (xrayInitialized flag)
  - Captures HTTP and HTTPS with specific options

### 2. AWS Class - Version Detection

#### NODE_VER Getter
- **Returns**: Node.js version string (e.g., "24.12.0")
- **Fallback**: "0.0.0" if process.versions.node is not available

#### NODE_VER_MAJOR Getter
- **Returns**: Major version number (e.g., 24)
- **Depends On**: nodeVersionArray[0]

#### NODE_VER_MINOR Getter
- **Returns**: Minor version number (e.g., 12)
- **Depends On**: nodeVersionArray[1]

#### NODE_VER_PATCH Getter
- **Returns**: Patch version number (e.g., 0)
- **Depends On**: nodeVersionArray[2]

#### NODE_VER_MAJOR_MINOR Getter
- **Returns**: Major.minor version string (e.g., "24.12")

#### NODE_VER_ARRAY Getter
- **Returns**: Array of [major, minor, patch]

#### nodeVersionArray Getter (Private)
- **Purpose**: Parses NODE_VER into array of integers
- **Caching**: Only parses once, caches result

### 3. AWS Class - SDK Version Detection

#### SDK_VER Getter
- **Returns**: "V2" for Node.js < 18, "V3" for Node.js >= 18
- **Logic**: Based on NODE_VER_MAJOR

#### SDK_V2 Getter
- **Returns**: true if SDK_VER === "V2"

#### SDK_V3 Getter
- **Returns**: true if SDK_VER === "V3"

### 4. AWS Class - Region Configuration

#### region Getter (Private)
- **Returns**: AWS region from process.env.AWS_REGION
- **Fallback**: "us-east-1" if not set
- **Warning**: Logs console.warn if AWS_REGION not set
- **Caching**: Only checks once, caches result

#### REGION Getter (Public)
- **Returns**: Result of region getter

### 5. AWS Class - INFO Getter

#### INFO Getter
- **Returns**: Object with all version and configuration info
- **Properties**:
  - NODE_VER
  - NODE_VER_MAJOR
  - NODE_VER_MINOR
  - NODE_VER_PATCH
  - NODE_VER_MAJOR_MINOR
  - NODE_VER_ARRAY
  - SDK_VER
  - REGION
  - SDK_V2
  - SDK_V3
  - AWSXRayOn

### 6. AWS Class - DynamoDB Client

#### dynamo Getter
- **Returns**: Object with DynamoDB client and operations
- **Properties**:
  - client: DynamoDBDocumentClient instance
  - put: Function to perform put operation
  - get: Function to perform get operation
  - scan: Function to perform scan operation
  - delete: Function to perform delete operation
  - update: Function to perform update operation
  - sdk: SDK objects (DynamoDBClient, DynamoDBDocumentClient, GetCommand, PutCommand)

#### DynamoDB Operations
- **put(params)**: Sends PutCommand
- **get(params)**: Sends GetCommand
- **scan(params)**: Sends ScanCommand
- **delete(params)**: Sends DeleteCommand
- **update(params)**: Sends UpdateCommand

#### X-Ray Integration
- Client wrapped with AWSXRay.captureAWSv3Client if X-Ray enabled

### 7. AWS Class - S3 Client

#### s3 Getter
- **Returns**: Object with S3 client and operations
- **Properties**:
  - client: S3 instance
  - put: Function to perform put operation
  - get: Function to perform get operation
  - sdk: SDK objects (S3, GetObjectCommand, PutObjectCommand)

#### S3 Operations
- **put(params)**: Sends PutObjectCommand
- **get(params)**: Sends GetObjectCommand

#### X-Ray Integration
- Client wrapped with AWSXRay.captureAWSv3Client if X-Ray enabled

### 8. AWS Class - SSM Client

#### ssm Getter
- **Returns**: Object with SSM client and operations
- **Properties**:
  - client: SSMClient instance
  - getByName: Function to get parameters by name
  - getByPath: Function to get parameters by path
  - sdk: SDK objects (SSMClient, GetParametersByPathCommand, GetParametersCommand)

#### SSM Operations
- **getByName(query)**: Sends GetParametersCommand
- **getByPath(query)**: Sends GetParametersByPathCommand

#### X-Ray Integration
- Client wrapped with AWSXRay.captureAWSv3Client if X-Ray enabled

### 9. AWS Class - X-Ray Getter

#### XRay Getter
- **Returns**: AWSXRay object or null
- **Depends On**: initializeXRay() result

### 10. Module Exports

#### Exports
- AWS class
- AWSXRay object

## Missing Test Cases Needed for Complete Coverage

### High Priority (Core Functionality):

#### 1. Helper Function Tests
```javascript
describe('isTrue function', () => {
  it('should return true for boolean true')
  it('should return true for number 1')
  it('should return true for string "1"')
  it('should return true for string "true" (case insensitive)')
  it('should return false for boolean false')
  it('should return false for number 0')
  it('should return false for string "0"')
  it('should return false for string "false"')
  it('should return false for null')
  it('should return false for undefined')
  it('should return false for empty string')
  it('should return false for other strings')
})

describe('USE_XRAY constant', () => {
  it('should be true when CacheData_AWSXRayOn is set')
  it('should be true when CACHE_DATA_AWS_X_RAY_ON is set')
  it('should be false when neither environment variable is set')
})

describe('initializeXRay function', () => {
  it('should initialize X-Ray when USE_XRAY is true')
  it('should return null when USE_XRAY is false')
  it('should only initialize once')
  it('should capture HTTP and HTTPS')
  it('should handle initialization errors gracefully')
})
```

#### 2. Version Detection Tests
```javascript
describe('AWS.NODE_VER', () => {
  it('should return Node.js version string')
  it('should return "0.0.0" if process.versions.node is not available')
})

describe('AWS.NODE_VER_MAJOR', () => {
  it('should return major version number')
})

describe('AWS.NODE_VER_MINOR', () => {
  it('should return minor version number')
})

describe('AWS.NODE_VER_PATCH', () => {
  it('should return patch version number')
})

describe('AWS.NODE_VER_MAJOR_MINOR', () => {
  it('should return major.minor version string')
})

describe('AWS.NODE_VER_ARRAY', () => {
  it('should return array of [major, minor, patch]')
})

describe('AWS.nodeVersionArray', () => {
  it('should parse version string into array of integers')
  it('should cache parsed result')
})
```

#### 3. SDK Version Detection Tests
```javascript
describe('AWS.SDK_VER', () => {
  it('should return "V3" for Node.js >= 18')
  it('should return "V2" for Node.js < 18')
})

describe('AWS.SDK_V2', () => {
  it('should return true when SDK_VER is "V2"')
  it('should return false when SDK_VER is "V3"')
})

describe('AWS.SDK_V3', () => {
  it('should return true when SDK_VER is "V3"')
  it('should return false when SDK_VER is "V2"')
})
```

#### 4. Region Configuration Tests
```javascript
describe('AWS.REGION', () => {
  it('should return AWS_REGION from environment')
  it('should return "us-east-1" if AWS_REGION not set')
  it('should log warning if AWS_REGION not set')
  it('should cache region value')
})
```

#### 5. INFO Getter Tests
```javascript
describe('AWS.INFO', () => {
  it('should return object with all version info')
  it('should include NODE_VER properties')
  it('should include SDK_VER properties')
  it('should include REGION')
  it('should include AWSXRayOn status')
})
```

### Medium Priority (Client Functionality):

#### 6. DynamoDB Client Tests
```javascript
describe('AWS.dynamo', () => {
  it('should return object with client')
  it('should return object with put function')
  it('should return object with get function')
  it('should return object with scan function')
  it('should return object with delete function')
  it('should return object with update function')
  it('should return object with sdk')
  it('should wrap client with X-Ray when enabled')
  it('should not wrap client with X-Ray when disabled')
})

describe('AWS.dynamo operations', () => {
  it('should perform put operation')
  it('should perform get operation')
  it('should perform scan operation')
  it('should perform delete operation')
  it('should perform update operation')
})
```

#### 7. S3 Client Tests
```javascript
describe('AWS.s3', () => {
  it('should return object with client')
  it('should return object with put function')
  it('should return object with get function')
  it('should return object with sdk')
  it('should wrap client with X-Ray when enabled')
  it('should not wrap client with X-Ray when disabled')
})

describe('AWS.s3 operations', () => {
  it('should perform put operation')
  it('should perform get operation')
})
```

#### 8. SSM Client Tests
```javascript
describe('AWS.ssm', () => {
  it('should return object with client')
  it('should return object with getByName function')
  it('should return object with getByPath function')
  it('should return object with sdk')
  it('should wrap client with X-Ray when enabled')
  it('should not wrap client with X-Ray when disabled')
})

describe('AWS.ssm operations', () => {
  it('should perform getByName operation')
  it('should perform getByPath operation')
})
```

### Low Priority (X-Ray and Exports):

#### 9. X-Ray Tests
```javascript
describe('AWS.XRay', () => {
  it('should return AWSXRay object when enabled')
  it('should return null when disabled')
})
```

#### 10. Module Export Tests
```javascript
describe('Module exports', () => {
  it('should export AWS class')
  it('should export AWSXRay object')
})
```

### Edge Cases and Error Handling:

#### 11. Edge Case Tests
```javascript
describe('Edge cases', () => {
  it('should handle missing process.versions')
  it('should handle malformed version strings')
  it('should handle missing AWS_REGION gracefully')
  it('should handle X-Ray initialization failure')
  it('should throw error for Node.js < 18 (SDK v2 no longer supported)')
})
```

## Coverage Metrics Estimate

Based on the analysis:

- **Lines Covered**: 0% (no tests exist)
- **Branches Covered**: 0% (no tests exist)
- **Functions Covered**: 0% (no tests exist)

**All functionality is untested.**

## Recommendations

1. **Immediate Priority**: Create basic test structure for Mocha and Jest
2. **High Priority**: Add version detection tests (NODE_VER, SDK_VER)
3. **High Priority**: Add region configuration tests
4. **High Priority**: Add helper function tests (isTrue, USE_XRAY)
5. **Medium Priority**: Add client getter tests (dynamo, s3, ssm)
6. **Medium Priority**: Add INFO getter test
7. **Low Priority**: Add X-Ray integration tests (requires mocking)
8. **Low Priority**: Add module export tests

## Notes

- **No existing tests**: This module has zero test coverage
- **Critical functionality**: Version detection and SDK selection are critical
- **AWS SDK mocking**: Will need to mock AWS SDK v3 clients for testing
- **X-Ray mocking**: Will need to mock aws-xray-sdk-core for X-Ray tests
- **Environment variables**: Tests will need to manipulate process.env
- **Static class**: All methods are static, no instantiation needed
- **Caching**: Some getters cache values, tests need to account for this
- **Node.js version**: Tests should work regardless of Node.js version
- **SDK v2 deprecated**: Code throws error for Node.js < 18

## Test Migration Impact

When creating tests:
- **No Mocha tests to migrate**: Start from scratch
- Create comprehensive test suite for both Mocha and Jest
- Estimated 40-50 tests needed for complete coverage
- Focus on version detection, region configuration, and client getters
- Mock AWS SDK v3 clients to avoid actual AWS calls
- Mock X-Ray SDK to test X-Ray integration
- Use environment variable mocking for configuration tests

## Comparison with Other Modules

- **APIRequest.class.js**: 20 existing tests
- **dao-endpoint.js**: 8 existing tests
- **AWS.classes.js**: 0 existing tests (CRITICAL GAP)

This module has the largest coverage gap and should be prioritized for test creation.

## Special Considerations

### Environment Variable Testing
- Tests must manipulate process.env
- Need to save and restore original values
- Consider using subprocess isolation for some tests

### AWS SDK Mocking
- Mock @aws-sdk/client-dynamodb
- Mock @aws-sdk/lib-dynamodb
- Mock @aws-sdk/client-s3
- Mock @aws-sdk/client-ssm
- Mock aws-xray-sdk-core

### Static Class Testing
- No instantiation needed
- All tests call static methods directly
- Be aware of caching behavior

### Node.js Version Testing
- Tests should work on Node.js >= 18
- Mock process.versions.node for version detection tests
- Test SDK v2 error for Node.js < 18 (if possible)
