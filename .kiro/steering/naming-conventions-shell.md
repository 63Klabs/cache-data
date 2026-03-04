---
inclusion: fileMatch
fileMatchPattern: '**/*.{sh,bash}'
---

# Naming Conventions - Shell Scripts (Bash)

## Purpose

This document defines naming conventions specific to shell script development. These conventions apply when working with .sh and .bash files.

---

## Variables

### Local Variables

Use **snake_case** for local variables:

```bash
user_name="John"
is_active=true
user_count=42
api_response='{"data": []}'
```

### Environment Variables and Constants

Use **UPPER_SNAKE_CASE** for environment variables and constants:

```bash
MAX_RETRY_COUNT=3
API_BASE_URL="https://api.example.com"
DEFAULT_TIMEOUT=30
HTTP_STATUS_OK=200
```

### Exported Variables

Use **UPPER_SNAKE_CASE** for exported variables:

```bash
export AWS_REGION="us-east-1"
export LOG_LEVEL="info"
export DATABASE_HOST="db.example.com"
```

---

## Functions

### Function Definitions

Use **snake_case** for all functions:

```bash
get_user_data() {
    # Implementation
    echo "Getting user data"
}

fetch_user_profile() {
    local user_id=$1
    # Implementation
}

calculate_total() {
    local items=("$@")
    # Implementation
}
```

### Private Functions

Prefix with single underscore for private functions:

```bash
_validate_user() {
    # Private function
    local user_data=$1
    # Implementation
}

get_user_by_id() {
    # Public function
    local user_id=$1
    _validate_user "$user_id"
}
```

---

## File Names

Choose one style and be consistent:

### Option 1: kebab-case (Recommended)

```
user-service.sh
api-request.sh
deploy-application.sh
backup-database.sh
```

### Option 2: snake_case

```
user_service.sh
api_request.sh
deploy_application.sh
backup_database.sh
```

**Rule**: Follow the majority convention in the existing codebase.

---

## Script Structure

### Shebang and Header

```bash
#!/bin/bash
#
# Script: deploy-application.sh
# Description: Deploy application to production environment
# Author: Team Name
# Date: 2026-01-29
#

set -euo pipefail  # Exit on error, undefined variables, pipe failures
```

### Constants Section

```bash
# Constants
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MAX_RETRIES=3
readonly TIMEOUT=30
readonly LOG_FILE="/var/log/deploy.log"
```

### Function Definitions

```bash
# Functions
log_info() {
    local message=$1
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $message" | tee -a "$LOG_FILE"
}

log_error() {
    local message=$1
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $message" | tee -a "$LOG_FILE" >&2
}

_validate_environment() {
    # Private function
    local env=$1
    [[ "$env" =~ ^(dev|staging|prod)$ ]]
}

deploy_application() {
    local environment=$1
    
    if ! _validate_environment "$environment"; then
        log_error "Invalid environment: $environment"
        return 1
    fi
    
    log_info "Deploying to $environment"
    # Implementation
}
```

### Main Execution

```bash
# Main execution
main() {
    local environment=${1:-dev}
    
    log_info "Starting deployment script"
    
    if deploy_application "$environment"; then
        log_info "Deployment successful"
        exit 0
    else
        log_error "Deployment failed"
        exit 1
    fi
}

# Run main if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
```

---

## Command-Line Arguments

### Positional Arguments

```bash
process_user() {
    local user_id=$1
    local user_name=$2
    local user_email=$3
    
    echo "Processing user: $user_name ($user_id)"
}

# Usage
process_user "123" "John Doe" "john@example.com"
```

### Named Arguments (Flags)

```bash
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                environment="$2"
                shift 2
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}
```

---

## Arrays

Use **snake_case** for array names:

```bash
# Indexed arrays
user_names=("Alice" "Bob" "Charlie")
user_ids=(1 2 3)

# Associative arrays (Bash 4+)
declare -A user_map
user_map["alice"]="alice@example.com"
user_map["bob"]="bob@example.com"

# Iterate over array
for user_name in "${user_names[@]}"; do
    echo "User: $user_name"
done

# Iterate over associative array
for key in "${!user_map[@]}"; do
    echo "$key: ${user_map[$key]}"
done
```

---

## Boolean Variables

Prefix with **is**, **has**, **can**, **should**:

```bash
is_active=true
has_permission=false
can_deploy=true
should_retry=false

if [[ "$is_active" == true ]]; then
    echo "User is active"
fi
```

---

## Environment Variables

Use **UPPER_SNAKE_CASE** for all environment variables:

```bash
# Reading environment variables
api_key="${API_KEY:-default_key}"
db_host="${DATABASE_HOST}"
max_connections="${MAX_CONNECTIONS:-10}"

# Setting environment variables
export AWS_REGION="us-east-1"
export LOG_LEVEL="info"
export NODE_ENV="production"
```

---

## Common Patterns

### Error Handling

```bash
handle_error() {
    local exit_code=$?
    local line_number=$1
    log_error "Error on line $line_number (exit code: $exit_code)"
    exit "$exit_code"
}

trap 'handle_error ${LINENO}' ERR
```

### Logging Functions

```bash
log_debug() {
    [[ "${LOG_LEVEL}" == "debug" ]] && echo "[DEBUG] $*"
}

log_info() {
    echo "[INFO] $*"
}

log_warn() {
    echo "[WARN] $*" >&2
}

log_error() {
    echo "[ERROR] $*" >&2
}
```

### Validation Functions

```bash
validate_file_exists() {
    local file_path=$1
    if [[ ! -f "$file_path" ]]; then
        log_error "File not found: $file_path"
        return 1
    fi
}

validate_directory_exists() {
    local dir_path=$1
    if [[ ! -d "$dir_path" ]]; then
        log_error "Directory not found: $dir_path"
        return 1
    fi
}

validate_not_empty() {
    local value=$1
    local name=$2
    if [[ -z "$value" ]]; then
        log_error "$name cannot be empty"
        return 1
    fi
}
```

---

## Examples

### Complete Script Example

```bash
#!/bin/bash
#
# Script: backup-database.sh
# Description: Backup database to S3
# Usage: ./backup-database.sh --environment prod --database mydb
#

set -euo pipefail

# Constants
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BACKUP_DIR="/tmp/backups"
readonly MAX_RETRIES=3
readonly S3_BUCKET="my-backups"

# Global variables
environment=""
database_name=""
verbose=false

# Functions
log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $*" >&2
}

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    -e, --environment ENV    Environment (dev, staging, prod)
    -d, --database NAME      Database name
    -v, --verbose            Enable verbose output
    -h, --help               Show this help message

Example:
    $0 --environment prod --database mydb
EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                environment="$2"
                shift 2
                ;;
            -d|--database)
                database_name="$2"
                shift 2
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

validate_arguments() {
    if [[ -z "$environment" ]]; then
        log_error "Environment is required"
        return 1
    fi
    
    if [[ ! "$environment" =~ ^(dev|staging|prod)$ ]]; then
        log_error "Invalid environment: $environment"
        return 1
    fi
    
    if [[ -z "$database_name" ]]; then
        log_error "Database name is required"
        return 1
    fi
}

create_backup() {
    local backup_file="${BACKUP_DIR}/${database_name}_$(date +%Y%m%d_%H%M%S).sql"
    
    log_info "Creating backup: $backup_file"
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    
    # Perform backup (example with PostgreSQL)
    if pg_dump "$database_name" > "$backup_file"; then
        log_info "Backup created successfully"
        echo "$backup_file"
    else
        log_error "Failed to create backup"
        return 1
    fi
}

upload_to_s3() {
    local backup_file=$1
    local s3_path="s3://${S3_BUCKET}/${environment}/${database_name}/$(basename "$backup_file")"
    
    log_info "Uploading to S3: $s3_path"
    
    if aws s3 cp "$backup_file" "$s3_path"; then
        log_info "Upload successful"
    else
        log_error "Failed to upload to S3"
        return 1
    fi
}

cleanup_old_backups() {
    log_info "Cleaning up old backups"
    find "$BACKUP_DIR" -name "${database_name}_*.sql" -mtime +7 -delete
}

main() {
    parse_arguments "$@"
    
    if ! validate_arguments; then
        show_help
        exit 1
    fi
    
    log_info "Starting database backup"
    log_info "Environment: $environment"
    log_info "Database: $database_name"
    
    local backup_file
    if backup_file=$(create_backup); then
        if upload_to_s3 "$backup_file"; then
            cleanup_old_backups
            log_info "Backup completed successfully"
            exit 0
        fi
    fi
    
    log_error "Backup failed"
    exit 1
}

# Run main if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
```

---

## Best Practices

### Use Quotes

Always quote variables to prevent word splitting:

```bash
# Good
file_path="/path/to/file"
cat "$file_path"

# Bad
cat $file_path  # Breaks if path contains spaces
```

### Use Readonly for Constants

```bash
readonly MAX_RETRIES=3
readonly API_URL="https://api.example.com"
```

### Use Local Variables in Functions

```bash
process_data() {
    local input_file=$1
    local output_file=$2
    # Use local variables
}
```

### Check Command Existence

```bash
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI is not installed"
    exit 1
fi
```

---

## Summary

**Shell Script Naming Quick Reference:**

- Variables (local): `snake_case`
- Variables (environment): `UPPER_SNAKE_CASE`
- Constants: `UPPER_SNAKE_CASE`
- Functions: `snake_case`
- Private functions: `_snake_case`
- File names: `kebab-case.sh` or `snake_case.sh`
- Arrays: `snake_case`
- Boolean variables: `is_active`, `has_permission`, etc.
- Always quote variables: `"$variable"`
- Use `readonly` for constants
- Use `local` for function variables
- Use `set -euo pipefail` for safety
