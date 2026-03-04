---
inclusion: fileMatch
fileMatchPattern: '**/*.py'
---

# Naming Conventions - Python

## Purpose

This document defines naming conventions specific to Python development. These conventions apply when working with .py files and follow PEP 8 standards.

---

## Variables

### Standard Variables

Use **snake_case** for all standard variables:

```python
user_name = "John"
is_active = True
user_count = 42
api_response = {"data": []}
```

### Global Constants

Use **UPPER_SNAKE_CASE** for global constants:

```python
MAX_RETRY_COUNT = 3
API_BASE_URL = "https://api.example.com"
DEFAULT_TIMEOUT = 30
HTTP_STATUS_OK = 200
```

### Local Constants

Developer's choice - use best judgment:

```python
def process_data():
    max_items = 100  # OK - feels like a variable
    MAX_ITEMS = 100  # OK - emphasizes it's constant
```

---

## Functions

### Function Definitions

Use **snake_case** for all functions:

```python
def get_user_data():
    # Implementation
    pass

async def fetch_user_profile():
    # Implementation
    pass

def calculate_total(items):
    # Implementation
    return sum(items)
```

### Private Functions

Prefix with single underscore for private functions:

```python
def _validate_user(user_data):
    # Private function
    pass

def get_user_by_id(user_id):
    # Public function
    return _validate_user(user_id)
```

### Name Mangling (Strongly Private)

Use double underscore for name mangling (rare):

```python
def __internal_helper():
    # Strongly private - name mangled
    pass
```

---

## Classes

Use **PascalCase** for all classes:

```python
class UserAccount:
    def __init__(self, name):
        self.name = name

class ApiRequest:
    # Implementation
    pass

class CacheManager:
    # Implementation
    pass
```

---

## Methods

### Instance Methods

Use **snake_case**:

```python
class UserService:
    def get_user_by_id(self, user_id):
        # Public method
        pass
    
    def _validate_user(self, user_data):
        # Private method (by convention)
        pass
```

### Class Methods

Use **snake_case** with `@classmethod` decorator:

```python
class User:
    @classmethod
    def from_dict(cls, data):
        return cls(data['name'], data['email'])
    
    @classmethod
    def create_default(cls):
        return cls('Default User', 'default@example.com')
```

### Static Methods

Use **snake_case** with `@staticmethod` decorator:

```python
class MathUtils:
    @staticmethod
    def calculate_distance(x1, y1, x2, y2):
        return ((x2 - x1)**2 + (y2 - y1)**2)**0.5
```

---

## Properties

### Property Getters and Setters

Use **snake_case** with `@property` decorator:

```python
class User:
    def __init__(self, first_name, last_name):
        self._first_name = first_name
        self._last_name = last_name
    
    @property
    def full_name(self):
        return f"{self._first_name} {self._last_name}"
    
    @full_name.setter
    def full_name(self, value):
        self._first_name, self._last_name = value.split(' ', 1)
```

---

## Private Attributes

### Single Underscore (Protected)

Use single underscore prefix for protected attributes:

```python
class UserService:
    def __init__(self):
        self._api_key = None  # Protected attribute
        self._cache = {}      # Protected attribute
```

### Double Underscore (Private with Name Mangling)

Use double underscore for truly private attributes:

```python
class BankAccount:
    def __init__(self, balance):
        self.__balance = balance  # Private with name mangling
    
    def get_balance(self):
        return self.__balance
```

---

## File Names

Use **snake_case** for all Python files:

```
user_service.py
api_request.py
cache_manager.py
data_processor.py
```

---

## Module Names

Use **snake_case** for module names:

```python
import user_service
from api_request import ApiRequest
from cache_manager import CacheManager
```

---

## Package Names

Use **snake_case** (short, all lowercase, no underscores if possible):

```
mypackage/
my_package/
userauth/
```

---

## Type Hints

Use **PascalCase** for type names:

```python
from typing import List, Dict, Optional, Union

def get_users(user_ids: List[int]) -> List[Dict[str, str]]:
    pass

def find_user(user_id: int) -> Optional[Dict[str, str]]:
    pass

def process_data(data: Union[str, int]) -> bool:
    pass
```

---

## Exceptions

Use **PascalCase** with "Error" or "Exception" suffix:

```python
class UserNotFoundError(Exception):
    pass

class InvalidCredentialsError(Exception):
    pass

class DatabaseConnectionError(Exception):
    pass
```

---

## Environment Variables

Use **UPPER_SNAKE_CASE** for environment variables:

```python
import os

api_key = os.environ.get('API_KEY')
db_host = os.environ.get('DATABASE_HOST')
max_connections = os.environ.get('MAX_CONNECTIONS')
```

---

## Common Patterns

### Boolean Variables

Prefix with **is**, **has**, **can**, **should**:

```python
is_active = True
has_permission = False
can_edit = True
should_retry = False
was_successful = True
```

### Collections

Use plural names:

```python
users = []
user_ids = set()
user_map = {}
active_users = [u for u in users if u.is_active]
```

### Iterators

Use descriptive names:

```python
for user in users:
    print(user.name)

for index, value in enumerate(items):
    print(f"{index}: {value}")

for key, value in user_dict.items():
    print(f"{key} = {value}")
```

---

## Async/Await

Use descriptive names that indicate async operations:

```python
async def fetch_user_data(user_id: int) -> dict:
    response = await http_client.get(f"/api/users/{user_id}")
    return response.json()

async def load_user_profile(user_id: int) -> dict:
    # Implementation
    pass
```

---

## Context Managers

Use **snake_case** for context manager methods:

```python
class DatabaseConnection:
    def __enter__(self):
        self.connection = self._create_connection()
        return self.connection
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.connection.close()
```

---

## Decorators

Use **snake_case** for decorator functions:

```python
def require_authentication(func):
    def wrapper(*args, **kwargs):
        if not is_authenticated():
            raise PermissionError("Authentication required")
        return func(*args, **kwargs)
    return wrapper

@require_authentication
def get_user_profile(user_id):
    pass
```

---

## Examples

### Complete Module Example

```python
# user_service.py
"""
User service module for managing user operations.
"""

from typing import Optional, Dict, List

# Global constants
MAX_RETRY_COUNT = 3
API_BASE_URL = "https://api.example.com"

class UserNotFoundError(Exception):
    """Raised when a user is not found."""
    pass

class UserService:
    """Service for managing user operations."""
    
    def __init__(self, api_key: str):
        self._api_key = api_key
        self._cache: Dict[int, dict] = {}
    
    def get_user_by_id(self, user_id: int) -> Optional[dict]:
        """
        Get user by ID.
        
        Args:
            user_id: The user's ID
            
        Returns:
            User data dictionary or None if not found
        """
        if user_id in self._cache:
            return self._cache[user_id]
        
        user_data = self._fetch_user(user_id)
        if user_data:
            self._cache[user_id] = user_data
        return user_data
    
    def _fetch_user(self, user_id: int) -> Optional[dict]:
        """Private method to fetch user from API."""
        # Implementation
        pass
    
    def _validate_user(self, user_data: dict) -> bool:
        """Private method to validate user data."""
        # Implementation
        return True

# Module-level functions
def create_user_service(api_key: str) -> UserService:
    """Factory function to create UserService instance."""
    return UserService(api_key)

def _internal_helper() -> None:
    """Private module-level function."""
    pass
```

### Complete Class Example

```python
# cache_manager.py
"""
Cache manager for handling data caching operations.
"""

from typing import Any, Optional
from datetime import datetime, timedelta

class CacheManager:
    """Manages caching operations with expiration support."""
    
    DEFAULT_TTL = 300  # Class constant
    
    def __init__(self, ttl: int = DEFAULT_TTL):
        self._cache: dict = {}
        self._ttl = ttl
    
    @property
    def cache_size(self) -> int:
        """Get current cache size."""
        return len(self._cache)
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found or expired
        """
        if key not in self._cache:
            return None
        
        entry = self._cache[key]
        if self._is_expired(entry):
            del self._cache[key]
            return None
        
        return entry['value']
    
    def set(self, key: str, value: Any) -> None:
        """
        Set value in cache.
        
        Args:
            key: Cache key
            value: Value to cache
        """
        self._cache[key] = {
            'value': value,
            'expires_at': datetime.now() + timedelta(seconds=self._ttl)
        }
    
    def clear(self) -> None:
        """Clear all cached entries."""
        self._cache.clear()
    
    def _is_expired(self, entry: dict) -> bool:
        """Check if cache entry is expired."""
        return datetime.now() > entry['expires_at']
    
    @classmethod
    def create_with_ttl(cls, ttl: int) -> 'CacheManager':
        """Factory method to create cache manager with specific TTL."""
        return cls(ttl=ttl)
    
    @staticmethod
    def calculate_ttl(hours: int) -> int:
        """Calculate TTL in seconds from hours."""
        return hours * 3600
```

---

## PEP 8 Compliance

Follow PEP 8 guidelines:

- Maximum line length: 79 characters (or 99 for code, 72 for docstrings)
- Use 4 spaces for indentation (never tabs)
- Two blank lines between top-level definitions
- One blank line between method definitions
- Imports at top of file, grouped: standard library, third-party, local

---

## Summary

**Python Naming Quick Reference:**

- Variables: `snake_case`
- Functions: `snake_case`
- Classes: `PascalCase`
- Methods: `snake_case`
- Constants (global): `UPPER_SNAKE_CASE`
- Constants (local): Developer's choice
- Private attributes: `_attribute_name`
- Private methods: `_method_name`
- Name mangling: `__private_name`
- File names: `snake_case.py`
- Module names: `snake_case`
- Package names: `snake_case` (short, lowercase)
- Exceptions: `PascalCase` with Error/Exception suffix
- Boolean variables: `is_active`, `has_permission`, etc.
- Environment variables: `UPPER_SNAKE_CASE`
