---
inclusion: fileMatch
fileMatchPattern: '**/*.py'
---

# Documentation Standards - Python Docstrings

## Purpose

This document defines documentation standards for Python code using docstrings. Python uses docstrings (triple-quoted strings) for inline API documentation following PEP 257 conventions.

---

## Docstring Style

Use **Google Style** docstrings for consistency and readability. This style is widely adopted and well-supported by documentation tools.

---

## Required Documentation Elements

### For Functions

All public functions MUST include:

- **Description**: Clear explanation of what the function does (first line)
- **Args**: One entry per parameter with type and description
- **Returns**: Return value type and description
- **Raises**: Document each exception type that can be raised (if applicable)
- **Example**: At least one code example demonstrating typical usage

### For Classes

All public classes MUST include:

- **Description**: Explanation of the class purpose
- **Attributes**: Document public attributes
- **Example**: Usage example showing instantiation and common methods

### For Modules

All modules MUST include:

- **Module-level docstring**: Brief description of module purpose
- **Example**: Optional usage example for the module

---

## Docstring Templates

### Function Template

```python
def function_name(param1, param2, optional_param=None):
    """Brief description of what the function does.
    
    More detailed explanation if needed. This can span multiple lines
    and provide additional context about the function's behavior.
    
    Args:
        param1 (str): Description of first parameter.
        param2 (int): Description of second parameter.
        optional_param (dict, optional): Description of optional parameter.
            Defaults to None.
    
    Returns:
        bool: Description of return value.
    
    Raises:
        ValueError: Description of when this error occurs.
        TypeError: Description of when this error occurs.
    
    Example:
        Basic usage example:
        
        >>> result = function_name('test', 42)
        >>> print(result)
        True
        
        Example with optional parameter:
        
        >>> result = function_name('test', 42, {'key': 'value'})
        >>> print(result)
        True
    """
    # Implementation
    pass
```

### Class Template

```python
class ClassName:
    """Brief description of the class purpose.
    
    More detailed explanation of what the class does and when to use it.
    
    Attributes:
        attribute1 (str): Description of public attribute.
        attribute2 (int): Description of public attribute.
    
    Example:
        Create instance and use common methods:
        
        >>> instance = ClassName(param1, param2)
        >>> result = instance.method()
        >>> print(result)
    """
    
    def __init__(self, param1, param2):
        """Initialize ClassName instance.
        
        Args:
            param1 (str): Description of first parameter.
            param2 (int): Description of second parameter.
        
        Raises:
            ValueError: When param1 is empty.
        """
        self.attribute1 = param1
        self.attribute2 = param2
    
    def method_name(self, param):
        """Brief description of what the method does.
        
        Args:
            param (str): Description of parameter.
        
        Returns:
            dict: Description of return value with structure:
                - key1 (str): Description
                - key2 (int): Description
        
        Example:
            >>> result = instance.method_name('test')
            >>> print(result['key1'])
            'value'
        """
        # Implementation
        pass
```

### Module Template

```python
"""Module for handling user authentication and authorization.

This module provides functions and classes for managing user sessions,
validating credentials, and checking permissions.

Example:
    Basic usage of the module:
    
    >>> from mypackage import auth
    >>> user = auth.authenticate('username', 'password')
    >>> if auth.has_permission(user, 'admin'):
    ...     print('User is admin')
"""

# Module implementation
```

---

## Type Annotations

Use type hints in function signatures along with docstrings:

```python
from typing import List, Dict, Optional, Union

def process_users(
    user_ids: List[int],
    options: Optional[Dict[str, str]] = None
) -> Dict[str, Union[str, int]]:
    """Process multiple users and return summary.
    
    Args:
        user_ids: List of user IDs to process.
        options: Optional configuration dictionary.
    
    Returns:
        Summary dictionary with processing results.
    
    Example:
        >>> result = process_users([1, 2, 3])
        >>> print(result['processed'])
        3
    """
    # Implementation
    pass
```

---

## Command-Line Script Documentation

### argparse Requirements

All command-line scripts MUST:

1. Include a module-level docstring describing the script
2. Use `argparse` for argument parsing
3. Provide `-h/--help` flag with comprehensive help text
4. Include description and epilog in ArgumentParser
5. Document each argument with help text

### Complete Script Template

```python
#!/usr/bin/env python3
"""Script for processing user data and generating reports.

This script reads user data from a CSV file, processes it according to
specified rules, and generates output reports in various formats.

Example:
    Basic usage:
    
    $ python process_users.py input.csv --output report.json
    
    With verbose logging:
    
    $ python process_users.py input.csv -o report.json --verbose
"""

import argparse
import sys
from typing import Optional


def process_data(input_file: str, output_file: str, verbose: bool = False) -> int:
    """Process user data from input file and write to output file.
    
    Args:
        input_file: Path to input CSV file.
        output_file: Path to output file.
        verbose: Enable verbose logging.
    
    Returns:
        Exit code (0 for success, non-zero for error).
    
    Raises:
        FileNotFoundError: When input file doesn't exist.
        ValueError: When input data is invalid.
    """
    # Implementation
    return 0


def parse_arguments() -> argparse.Namespace:
    """Parse command-line arguments.
    
    Returns:
        Parsed arguments namespace.
    """
    parser = argparse.ArgumentParser(
        description='Process user data and generate reports.',
        epilog='For more information, see: https://example.com/docs',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    # Required arguments
    parser.add_argument(
        'input_file',
        help='Path to input CSV file containing user data'
    )
    
    # Optional arguments
    parser.add_argument(
        '-o', '--output',
        dest='output_file',
        default='output.json',
        help='Path to output file (default: output.json)'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    parser.add_argument(
        '--format',
        choices=['json', 'csv', 'xml'],
        default='json',
        help='Output format (default: json)'
    )
    
    parser.add_argument(
        '--max-records',
        type=int,
        default=1000,
        help='Maximum number of records to process (default: 1000)'
    )
    
    return parser.parse_args()


def main() -> int:
    """Main entry point for the script.
    
    Returns:
        Exit code (0 for success, non-zero for error).
    """
    args = parse_arguments()
    
    try:
        return process_data(
            args.input_file,
            args.output_file,
            args.verbose
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
```

### argparse Best Practices

1. **Always provide help text** for every argument
2. **Use descriptive dest names** for optional arguments
3. **Specify default values** in help text
4. **Use choices** for arguments with limited valid values
5. **Use type** parameter for type conversion and validation
6. **Include epilog** with links to documentation
7. **Use argument groups** for related arguments

```python
parser = argparse.ArgumentParser(description='My script')

# Argument groups for organization
input_group = parser.add_argument_group('input options')
input_group.add_argument('--input', help='Input file path')

output_group = parser.add_argument_group('output options')
output_group.add_argument('--output', help='Output file path')
output_group.add_argument('--format', choices=['json', 'csv'])

# Mutually exclusive arguments
group = parser.add_mutually_exclusive_group()
group.add_argument('--verbose', action='store_true')
group.add_argument('--quiet', action='store_true')
```

---

## Complete Examples

### Example 1: Simple Function

```python
def calculate_total(price: float, tax_rate: float) -> float:
    """Calculate total price including tax.
    
    Args:
        price: Base price before tax.
        tax_rate: Tax rate as decimal (e.g., 0.08 for 8%).
    
    Returns:
        Total price including tax.
    
    Example:
        >>> total = calculate_total(100.0, 0.08)
        >>> print(total)
        108.0
    """
    return price * (1 + tax_rate)
```

### Example 2: Function with Optional Parameters

```python
from typing import Optional, Dict, Any

async def fetch_user(
    user_id: str,
    include_profile: bool = False,
    include_activity: bool = False
) -> Dict[str, Any]:
    """Fetch user data from the API with optional filtering.
    
    Args:
        user_id: User ID to fetch.
        include_profile: Include full profile data. Defaults to False.
        include_activity: Include activity history. Defaults to False.
    
    Returns:
        User data dictionary with requested information.
    
    Raises:
        ValueError: When user_id is invalid.
        UserNotFoundError: When user doesn't exist.
    
    Example:
        Fetch basic user data:
        
        >>> user = await fetch_user('123')
        >>> print(user['name'])
        'John Doe'
        
        Fetch user with profile and activity:
        
        >>> user = await fetch_user('123', include_profile=True, include_activity=True)
        >>> print(user['profile']['bio'])
        'Software developer'
    """
    # Implementation
    pass
```

### Example 3: Class with Methods

```python
from typing import Any, Optional
from datetime import datetime, timedelta

class CacheManager:
    """Cache manager for storing and retrieving data with expiration.
    
    This class provides a simple in-memory cache with TTL (time-to-live)
    support for automatic expiration of cached entries.
    
    Attributes:
        ttl: Time to live in seconds for cache entries.
        prefix: Key prefix for all cache entries.
    
    Example:
        Create cache and store data:
        
        >>> cache = CacheManager(ttl=300)
        >>> cache.set('user:123', {'name': 'John', 'email': 'john@example.com'})
        >>> data = cache.get('user:123')
        >>> print(data['name'])
        'John'
    """
    
    def __init__(self, ttl: int = 300, prefix: str = ''):
        """Initialize CacheManager instance.
        
        Args:
            ttl: Time to live in seconds. Defaults to 300.
            prefix: Key prefix for all cache entries. Defaults to empty string.
        """
        self.ttl = ttl
        self.prefix = prefix
        self._cache: Dict[str, Any] = {}
    
    def set(self, key: str, value: Any) -> None:
        """Store a value in the cache with expiration.
        
        Args:
            key: Cache key.
            value: Value to cache (must be serializable).
        
        Example:
            >>> cache.set('user:123', {'name': 'John'})
        """
        # Implementation
        pass
    
    def get(self, key: str) -> Optional[Any]:
        """Retrieve a value from the cache.
        
        Args:
            key: Cache key.
        
        Returns:
            Cached value or None if not found or expired.
        
        Example:
            >>> data = cache.get('user:123')
            >>> if data:
            ...     print(data['name'])
        """
        # Implementation
        pass
```

---

## Deprecation Documentation

When deprecating functions, include a deprecation warning:

```python
import warnings

def get_user(user_id: str) -> dict:
    """Get user by ID (deprecated).
    
    .. deprecated:: 2.0.0
        Use :func:`get_user_by_id` instead.
    
    Args:
        user_id: User ID to fetch.
    
    Returns:
        User data dictionary.
    
    Example:
        >>> # Old way (deprecated)
        >>> user = get_user('123')
        >>> 
        >>> # New way (recommended)
        >>> user = get_user_by_id('123')
    """
    warnings.warn(
        "get_user is deprecated, use get_user_by_id instead",
        DeprecationWarning,
        stacklevel=2
    )
    # Implementation
    pass
```

---

## Private Function Documentation

Private functions should still be documented:

```python
def _validate_credentials(credentials: dict) -> bool:
    """Validate user credentials (internal use only).
    
    This is a private function used internally by the authentication module.
    
    Args:
        credentials: Dictionary containing username and password.
    
    Returns:
        True if credentials are valid, False otherwise.
    """
    # Implementation
    pass
```

---

## Summary

**Python Documentation Quick Reference:**

- Use Google Style docstrings
- All public functions need: description, Args, Returns, Example
- All public classes need: description, Attributes, Example
- Use type hints in function signatures
- Command-line scripts MUST use argparse with comprehensive help
- Include `-h/--help` flag with detailed descriptions
- Document all arguments with help text
- Use `"""` for docstrings (triple double quotes)
- First line should be a brief summary
- Include Raises section for functions that raise exceptions
- Examples should use `>>>` for doctest compatibility
- Private functions use single underscore prefix and still need docs
