#!/bin/bash

# Automated Test Runner for SCAI Scalability & Auto-Fix Implementation
# This script runs all test suites and reports results

set -e

echo "🚀 Running SCAI Automated Tests"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run tests and capture results
run_test_suite() {
    local test_name=$1
    local test_file=$2

    echo -e "\n📋 Running ${test_name}..."
    echo "----------------------------------------"

    if deno test --allow-read --allow-net "$test_file" 2>/dev/null; then
        echo -e "${GREEN}✅ ${test_name} PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ ${test_name} FAILED${NC}"
        return 1
    fi
}

# Function to run type checks
run_type_check() {
    local check_name=$1
    local check_command=$2

    echo -e "\n🔍 Running ${check_name}..."
    echo "----------------------------------------"

    if $check_command 2>/dev/null; then
        echo -e "${GREEN}✅ ${check_name} PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ ${check_name} FAILED${NC}"
        return 1
    fi
}

# Track test results
PASSED=0
FAILED=0

# Run type checks
echo -e "\n🔍 TYPE CHECKS"
echo "=============="

if run_type_check "Deno Functions Type Check" "deno check supabase/functions/**/*.{ts,tsx}"; then
    ((PASSED++))
else
    ((FAILED++))
fi

if run_type_check "Frontend Type Check" "npx tsc --noEmit"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Run unit tests
echo -e "\n🏗️  UNIT TESTS"
echo "=============="

if run_test_suite "Service Layer Tests" "tests/unit/services.test.ts"; then
    ((PASSED++))
else
    ((FAILED++))
fi

if run_test_suite "Database Chunking Tests" "tests/unit/database.test.ts"; then
    ((PASSED++))
else
    ((FAILED++))
fi

if run_test_suite "Edge Functions Tests" "tests/unit/edge-functions.test.ts"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Run integration tests
echo -e "\n🔗 INTEGRATION TESTS"
echo "==================="

if run_test_suite "Audit Flow Integration" "tests/integration/audit-flow.test.ts"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Summary
echo -e "\n📊 TEST RESULTS SUMMARY"
echo "======================="
echo "Total Tests: $((PASSED + FAILED))"
echo -e "Passed: ${GREEN}${PASSED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n🎉 ${GREEN}ALL TESTS PASSED!${NC}"
    echo "Your scalability and auto-fix implementation is working correctly."
    exit 0
else
    echo -e "\n⚠️  ${RED}SOME TESTS FAILED${NC}"
    echo "Please review the failed tests and fix any issues before deploying."
    exit 1
fi
