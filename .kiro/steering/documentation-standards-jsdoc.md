---
inclusion: fileMatch
fileMatchPattern: '**/*.{js,mjs,cjs,ts,tsx,jsx}'
---

# Documentation Standards - JSDoc (JavaScript/TypeScript)

## Purpose

This document defines JSDoc documentation standards for JavaScript and TypeScript code. JSDoc provides inline API documentation that can be used by IDEs for autocomplete and type checking.

---

## Required JSDoc Tags

### For Functions and Methods

All public functions and methods MUST include:

- **Description**: Clear explanation of what the function does (no tag, just text)
- **@param**: One tag per parameter with type, name, and description
- **@returns**: Return value type and description (omit only for void functions)
- **@example**: At least one code example demonstrating typical usage
- **@throws**: Document each error type that can be thrown (if applicable)

### For Classes

All public classes MUST include:

- **Description**: Explanation of the class purpose and responsibilities
- **@param**: Constructor parameters (in the constructor JSDoc)
- **@example**: Usage example showing instantiation and common methods
- **@property**: Document public properties (if applicable)

---

## Type Annotation Format

### Primitive Types

```javascript
/**
 * @param {string} name - User name
 * @param {number} age - User age
 * @param {boolean} active - Whether user is active
 */
```

### Complex Types

#### Promises

```javascript
/**
 * @returns {Promise<Object>} Resolves with user data
 * @returns {Promise<{id: string, name: string, email: string}>} Detailed structure
 */
```

#### Arrays

```javascript
/**
 * @returns {Array.<string>} Array of user names
 * @returns {Array.<{id: string, name: string}>} Array of user objects
 */
```

#### Objects with Known Structure

```javascript
/**
 * @returns {{success: boolean, data: Array.<Object>, error: string|null}} Response object
 */
```

#### Object Maps

```javascript
/**
 * @param {Object.<string, number>} scores - Map of names to scores
 */
```

#### Optional Parameters

```javascript
/**
 * @param {string} [optionalParam] - Optional parameter
 * @param {number} [count=10] - Optional with default value
 */
```

#### Union Types

```javascript
/**
 * @param {string|number} id - User ID as string or number
 * @returns {Object|null} User object or null if not found
 */
```

#### Callback Functions

```javascript
/**
 * @param {function(Error|null, Object): void} callback - Callback function
 */
```

---

## JSDoc Templates

### Function Template

```javascript
/**
 * Clear, concise description of what the function does and when to use it.
 * 
 * @param {Type} paramName - Description of what this parameter represents
 * @param {Type} [optionalParam=defaultValue] - Description of optional parameter
 * @returns {ReturnType} Description of what is returned
 * @throws {ErrorType} Description of when this error occurs
 * @example
 * // Example showing typical usage
 * const result = functionName(param1, param2);
 * console.log(result);
 * 
 * @example
 * // Example showing edge case or alternative usage
 * const result = functionName(param1);
 */
function functionName(paramName, optionalParam = defaultValue) {
  // Implementation
}
```

### Class Template

```javascript
/**
 * Clear description of the class purpose and responsibilities.
 * 
 * @example
 * // Create instance and use common methods
 * const instance = new ClassName(param1, param2);
 * const result = instance.method();
 */
class ClassName {
  /**
   * Creates a new instance of ClassName.
   * 
   * @param {Type} param1 - Description of first parameter
   * @param {Type} param2 - Description of second parameter
   * @throws {ErrorType} Description of construction errors
   */
  constructor(param1, param2) {
    // Implementation
  }

  /**
   * Method description explaining what it does.
   * 
   * @param {Type} param - Parameter description
   * @returns {ReturnType} Return value description
   * @example
   * const result = instance.methodName(param);
   */
  methodName(param) {
    // Implementation
  }
}
```

### Async Function Template

```javascript
/**
 * Description of async operation and what it accomplishes.
 * 
 * @async
 * @param {Type} param - Parameter description
 * @returns {Promise<{success: boolean, data: Object, error: string|null}>} Promise resolving to result object
 * @throws {ErrorType} Description of when this error occurs
 * @example
 * // Using async/await
 * const result = await asyncFunction(param);
 * if (result.success) {
 *   console.log(result.data);
 * }
 * 
 * @example
 * // Using promises
 * asyncFunction(param)
 *   .then(result => console.log(result.data))
 *   .catch(error => console.error(error));
 */
async function asyncFunction(param) {
  // Implementation
}
```

### TypeScript-Specific

For TypeScript, JSDoc is optional since types are in the code, but documentation is still required:

```typescript
/**
 * Description of what the function does.
 * 
 * @param userId - User ID to fetch
 * @returns User object with profile data
 * @throws {UserNotFoundError} When user doesn't exist
 * @example
 * const user = await getUser(123);
 * console.log(user.name);
 */
async function getUser(userId: number): Promise<User> {
  // Implementation
}
```

---

## Complete Examples

### Example 1: Simple Function

```javascript
/**
 * Calculate the total price including tax.
 * 
 * @param {number} price - Base price before tax
 * @param {number} taxRate - Tax rate as decimal (e.g., 0.08 for 8%)
 * @returns {number} Total price including tax
 * @example
 * const total = calculateTotal(100, 0.08);
 * console.log(total); // 108
 */
function calculateTotal(price, taxRate) {
  return price * (1 + taxRate);
}
```

### Example 2: Function with Optional Parameters

```javascript
/**
 * Fetch user data from the API with optional filtering.
 * 
 * @param {string} userId - User ID to fetch
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.includeProfile=false] - Include full profile data
 * @param {boolean} [options.includeActivity=false] - Include activity history
 * @returns {Promise<Object>} User data object
 * @throws {Error} When user ID is invalid or user not found
 * @example
 * // Fetch basic user data
 * const user = await fetchUser('123');
 * 
 * @example
 * // Fetch user with profile and activity
 * const user = await fetchUser('123', {
 *   includeProfile: true,
 *   includeActivity: true
 * });
 */
async function fetchUser(userId, options = {}) {
  // Implementation
}
```

### Example 3: Class with Methods

```javascript
/**
 * Cache manager for storing and retrieving data with expiration.
 * 
 * @example
 * const cache = new CacheManager({ ttl: 300 });
 * await cache.set('user:123', userData);
 * const data = await cache.get('user:123');
 */
class CacheManager {
  /**
   * Creates a new CacheManager instance.
   * 
   * @param {Object} options - Configuration options
   * @param {number} [options.ttl=300] - Time to live in seconds
   * @param {string} [options.prefix=''] - Key prefix for all cache entries
   */
  constructor(options = {}) {
    this.ttl = options.ttl || 300;
    this.prefix = options.prefix || '';
    this.cache = new Map();
  }

  /**
   * Store a value in the cache with expiration.
   * 
   * @param {string} key - Cache key
   * @param {*} value - Value to cache (will be JSON serialized)
   * @returns {Promise<void>}
   * @example
   * await cache.set('user:123', { name: 'John', email: 'john@example.com' });
   */
  async set(key, value) {
    // Implementation
  }

  /**
   * Retrieve a value from the cache.
   * 
   * @param {string} key - Cache key
   * @returns {Promise<*|null>} Cached value or null if not found or expired
   * @example
   * const userData = await cache.get('user:123');
   * if (userData) {
   *   console.log(userData.name);
   * }
   */
  async get(key) {
    // Implementation
  }
}
```

---

## Deprecation Documentation

When deprecating functions, use the `@deprecated` tag:

```javascript
/**
 * Get user by ID (deprecated - use getUserById instead).
 * 
 * @deprecated Since version 2.0.0. Use getUserById() instead.
 * @param {string} id - User ID
 * @returns {Promise<Object>} User object
 * @example
 * // Old way (deprecated)
 * const user = await getUser('123');
 * 
 * // New way (recommended)
 * const user = await getUserById('123');
 */
async function getUser(id) {
  // Implementation
}
```

---

## Private Function Documentation

Private functions should still be documented, but marked as private:

```javascript
/**
 * Validate user credentials (internal use only).
 * 
 * @private
 * @param {Object} credentials - User credentials
 * @returns {boolean} True if valid
 */
function _validateCredentials(credentials) {
  // Implementation
}
```

---

## Summary

**JSDoc Quick Reference:**

- All public functions need: description, @param, @returns, @example
- All public classes need: description, constructor @param, @example
- Use precise type annotations: `Promise<Object>`, `Array.<string>`, etc.
- Include @throws for functions that throw errors
- Use @deprecated for deprecated APIs
- Mark private functions with @private
- Examples must be executable and realistic
- Parameter names in JSDoc must match function signature exactly
