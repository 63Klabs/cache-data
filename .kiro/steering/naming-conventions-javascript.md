---
inclusion: fileMatch
fileMatchPattern: '**/*.{js,mjs,cjs,ts,tsx,jsx}'
---

# Naming Conventions - JavaScript/TypeScript/Node.js

## Purpose

This document defines naming conventions specific to JavaScript, TypeScript, and Node.js development. These conventions apply when working with .js, .mjs, .cjs, .ts, .tsx, and .jsx files.

---

## Variables

### Standard Variables

Use **camelCase** for all standard variables:

```javascript
const userName = "John";
const isActive = true;
const userCount = 42;
const apiResponse = { data: [] };
```

### Global Constants

Use **UPPER_SNAKE_CASE** for global constants:

```javascript
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = "https://api.example.com";
const DEFAULT_TIMEOUT = 30000;
const HTTP_STATUS_OK = 200;
```

### Local Constants

Developer's choice - use best judgment:

```javascript
function processData() {
    const maxItems = 100;  // OK - feels like a variable
    const MAX_ITEMS = 100; // OK - emphasizes it's constant
}
```

---

## Functions and Methods

### Function Declarations

Use **camelCase** for all functions:

```javascript
function getUserData() {
    // Implementation
}

async function fetchUserProfile() {
    // Implementation
}

const calculateTotal = () => {
    // Implementation
};
```

### Private Methods (Optional Convention)

Prefix with underscore for private methods:

```javascript
class UserService {
    _validateUser() {
        // Private method
    }
    
    getUserById() {
        // Public method
    }
}
```

### Private Fields (ES2022+)

Use `#` for truly private fields:

```javascript
class UserService {
    #apiKey;  // Private field
    
    #validateUser() {
        // Private method
    }
    
    constructor(apiKey) {
        this.#apiKey = apiKey;
    }
}
```

---

## Classes

Use **PascalCase** for all classes:

```javascript
class UserAccount {
    constructor(name) {
        this.name = name;
    }
}

class ApiRequest {
    // Implementation
}

class CacheManager {
    // Implementation
}
```

---

## Interfaces and Types (TypeScript)

### Interfaces

Use **PascalCase**, optionally prefix with 'I':

```typescript
interface UserData {
    id: string;
    name: string;
    email: string;
}

interface IUserData {  // Alternative style
    id: string;
    name: string;
}
```

### Type Aliases

Use **PascalCase**:

```typescript
type UserId = string;
type UserRole = "admin" | "user" | "guest";
type ApiResponse<T> = {
    success: boolean;
    data: T;
    error: string | null;
};
```

### Enums

Use **PascalCase** for enum names, **PascalCase** for enum values:

```typescript
enum UserStatus {
    Active,
    Inactive,
    Pending
}

enum HttpMethod {
    Get = "GET",
    Post = "POST",
    Put = "PUT",
    Delete = "DELETE"
}
```

---

## File Names

Choose one style per project and be consistent:

### Option 1: kebab-case (Recommended for most projects)

```
user-service.js
api-request.js
cache-manager.js
data-processor.ts
```

### Option 2: camelCase

```
userService.js
apiRequest.js
cacheManager.js
dataProcessor.ts
```

### Option 3: PascalCase (for class files)

```
UserService.js
ApiRequest.js
CacheManager.js
DataProcessor.ts
```

**Rule**: Follow the majority convention in the existing codebase.

---

## Module Exports

### Named Exports

```javascript
// user-service.js
export function getUserById(id) { }
export function createUser(data) { }
export const MAX_USERS = 1000;
```

### Default Exports

```javascript
// user-service.js
export default class UserService {
    // Implementation
}
```

### Mixed Exports

```javascript
// cache.js
export class Cache { }
export class CacheManager { }
export default Cache;
```

---

## React Components

### Component Names

Use **PascalCase**:

```jsx
function UserProfile({ user }) {
    return <div>{user.name}</div>;
}

const UserList = ({ users }) => {
    return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
};

class UserDashboard extends React.Component {
    render() {
        return <div>Dashboard</div>;
    }
}
```

### Component Files

Use **PascalCase** for component files:

```
UserProfile.jsx
UserList.tsx
UserDashboard.js
```

### Props and State

Use **camelCase**:

```jsx
function UserCard({ userName, isActive, onUserClick }) {
    const [isExpanded, setIsExpanded] = useState(false);
    
    return (
        <div onClick={() => onUserClick(userName)}>
            {userName}
        </div>
    );
}
```

---

## Event Handlers

Use **handle** or **on** prefix:

```javascript
function handleClick() {
    // Handle click event
}

function onSubmit(event) {
    // Handle submit event
}

function handleUserLogin(credentials) {
    // Handle user login
}
```

### React Event Handlers

```jsx
function LoginForm() {
    const handleSubmit = (event) => {
        event.preventDefault();
        // Handle form submission
    };
    
    const handleInputChange = (event) => {
        // Handle input change
    };
    
    return (
        <form onSubmit={handleSubmit}>
            <input onChange={handleInputChange} />
        </form>
    );
}
```

---

## Async/Await and Promises

Use descriptive names that indicate async operations:

```javascript
async function fetchUserData(userId) {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
}

async function loadUserProfile() {
    // Implementation
}

function getUserAsync(id) {
    return new Promise((resolve, reject) => {
        // Implementation
    });
}
```

---

## Environment Variables

Use **UPPER_SNAKE_CASE** for environment variables:

```javascript
const apiKey = process.env.API_KEY;
const dbHost = process.env.DATABASE_HOST;
const maxConnections = process.env.MAX_CONNECTIONS;
const nodeEnv = process.env.NODE_ENV;
```

---

## Common Patterns

### Boolean Variables

Prefix with **is**, **has**, **can**, **should**:

```javascript
const isActive = true;
const hasPermission = false;
const canEdit = true;
const shouldRetry = false;
const wasSuccessful = true;
```

### Collections

Use plural names:

```javascript
const users = [];
const userIds = new Set();
const userMap = new Map();
const activeUsers = users.filter(u => u.isActive);
```

### Callbacks

Use descriptive names:

```javascript
function processUsers(users, onComplete, onError) {
    // Implementation
}

array.map(user => user.name);
array.filter(user => user.isActive);
array.reduce((acc, user) => acc + user.age, 0);
```

---

## Examples

### Complete Module Example

```javascript
// user-service.js

// Global constants
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = "https://api.example.com";

// Class definition
class UserService {
    #apiKey;  // Private field
    
    constructor(apiKey) {
        this.#apiKey = apiKey;
    }
    
    // Public method
    async getUserById(userId) {
        const response = await this.#fetchUser(userId);
        return response.data;
    }
    
    // Private method
    async #fetchUser(userId) {
        const url = `${API_BASE_URL}/users/${userId}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.#apiKey}`
            }
        });
        return response.json();
    }
}

// Named exports
export { UserService, MAX_RETRY_COUNT };

// Default export
export default UserService;
```

### Complete React Component Example

```jsx
// UserProfile.jsx
import React, { useState, useEffect } from 'react';

const MAX_BIO_LENGTH = 500;

function UserProfile({ userId, onUserUpdate }) {
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    useEffect(() => {
        loadUserData();
    }, [userId]);
    
    const loadUserData = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(`/api/users/${userId}`);
            const data = await response.json();
            setUserData(data);
        } catch (error) {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleUpdateClick = () => {
        onUserUpdate(userData);
    };
    
    if (isLoading) return <div>Loading...</div>;
    if (hasError) return <div>Error loading user</div>;
    
    return (
        <div className="user-profile">
            <h1>{userData.name}</h1>
            <p>{userData.bio.slice(0, MAX_BIO_LENGTH)}</p>
            <button onClick={handleUpdateClick}>Update</button>
        </div>
    );
}

export default UserProfile;
```

---

## Summary

**JavaScript/TypeScript Naming Quick Reference:**

- Variables: `camelCase`
- Functions: `camelCase`
- Classes: `PascalCase`
- Interfaces/Types: `PascalCase`
- Constants (global): `UPPER_SNAKE_CASE`
- Constants (local): Developer's choice
- Private fields: `#fieldName`
- Private methods: `_methodName` (optional) or `#methodName`
- File names: `kebab-case` or `camelCase` (be consistent)
- React components: `PascalCase`
- Event handlers: `handleEvent` or `onEvent`
- Boolean variables: `isActive`, `hasPermission`, etc.
- Environment variables: `UPPER_SNAKE_CASE`
