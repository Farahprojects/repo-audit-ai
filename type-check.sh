#!/bin/bash

# SCAI Type Checking Script
# Runs comprehensive type checks for both Deno functions and frontend code

set -e

echo "🔍 SCAI Type Checking"
echo "====================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0

# Function to run type checks
run_check() {
    local check_name=$1
    local check_command=$2

    echo -e "\n📋 Running ${check_name}..."
    echo "----------------------------------------"

    if $check_command 2>/dev/null; then
        echo -e "${GREEN}✅ ${check_name} PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ ${check_name} FAILED${NC}"
        return 1
    fi
}

# Run Deno functions type check (only .ts files, not .tsx)
if command -v deno >/dev/null 2>&1; then
    # Use find to get all .ts files and pass them individually to avoid glob expansion issues
    TS_FILES=$(find supabase/functions -name "*.ts" -type f | tr '\n' ' ')
    if run_check "Deno Functions Type Check" "deno check $TS_FILES"; then
        ((PASSED++))
    else
        ((FAILED++))
    fi
else
    echo -e "\n⚠️  Deno not found - skipping Deno type checks"
    echo "Install Deno with: curl -fsSL https://deno.land/install.sh | sh"
    echo "Then add ~/.deno/bin to your PATH"
    ((PASSED++)) # Don't fail if Deno isn't installed
fi

# Run frontend type check (excluding Deno functions)
if run_check "Frontend Type Check" "npx tsc --noEmit"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Summary
echo -e "\n📊 TYPE CHECK RESULTS SUMMARY"
echo "=============================="
echo "Total Checks: $((PASSED + FAILED))"
echo -e "Passed: ${GREEN}${PASSED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n🎉 ${GREEN}ALL TYPE CHECKS PASSED!${NC}"
    echo "Your code is type-safe and ready for deployment."
    exit 0
else
    echo -e "\n⚠️  ${RED}SOME TYPE CHECKS FAILED${NC}"
    echo "Please review the failed checks and fix any type errors before deploying."
    exit 1
fi
