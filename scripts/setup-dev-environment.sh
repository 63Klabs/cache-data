#!/bin/bash

# Development Environment Setup Script
# This script sets up the development environment for contributors

set -e

echo "=========================================="
echo "Setting up development environment..."
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the repository root."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Make pre-commit hook executable
if [ -f ".git/hooks/pre-commit" ]; then
    echo "🔧 Setting up pre-commit hook..."
    chmod +x .git/hooks/pre-commit
    echo "✅ Pre-commit hook is now executable"
    echo ""
    
    # Test the hook
    echo "🧪 Testing pre-commit hook..."
    if .git/hooks/pre-commit; then
        echo "✅ Pre-commit hook test passed!"
    else
        echo "⚠️  Pre-commit hook test failed. Please check documentation validation."
    fi
else
    echo "⚠️  Warning: Pre-commit hook not found at .git/hooks/pre-commit"
fi

echo ""
echo "=========================================="
echo "Development environment setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Review CONTRIBUTING.md for contribution guidelines"
echo "  2. Review .kiro/steering/documentation-standards-common.md for documentation requirements"
echo "  3. Run 'npm test' to ensure all tests pass"
echo "  4. Make your changes and commit (pre-commit hook will validate)"
echo ""
echo "Useful commands:"
echo "  npm test                          - Run all tests"
echo "  npm test -- test/documentation/   - Run documentation tests"
echo "  node scripts/audit-documentation.mjs - Run documentation audit"
echo "  .git/hooks/pre-commit             - Test pre-commit hook manually"
echo ""
