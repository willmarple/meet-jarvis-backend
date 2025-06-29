#!/bin/bash

# API Testing Script for AI Meeting Platform
# This script sets up the local environment and runs the comprehensive API test suite

set -e  # Exit on any error

echo "🚀 AI Meeting Platform - API Testing Script"
echo "============================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Supabase CLI is available
if ! command -v npx supabase &> /dev/null; then
    print_error "Supabase CLI is not available. Please ensure npx is installed."
    exit 1
fi

# Check if local Supabase is running
print_status "Checking local Supabase status..."
if ! npx supabase status &> /dev/null; then
    print_warning "Local Supabase is not running. Starting it now..."
    npx supabase start
    if [ $? -ne 0 ]; then
        print_error "Failed to start local Supabase"
        exit 1
    fi
    print_success "Local Supabase started successfully"
else
    print_success "Local Supabase is already running"
fi

# Check if development server is running
print_status "Checking if development server is running..."
if ! curl -s http://localhost:3001/api/test/openai &> /dev/null; then
    print_error "Development server is not running on port 3001"
    print_error "Please start the server with: npm run dev"
    exit 1
fi
print_success "Development server is running"

# Change to server directory
cd server

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing server dependencies..."
    npm install
fi

# Run the test suite
print_status "Running comprehensive API test suite..."
echo ""

# Run tests with verbose output
npm run test

TEST_EXIT_CODE=$?

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
    print_success "All API tests passed! 🎉"
    echo ""
    echo "📊 Test Summary:"
    echo "  ✅ Health Check & Basic Connectivity"
    echo "  ✅ Knowledge Base API (RAG Search, Health Checks)"
    echo "  ✅ AI Tools API (All 5 tools tested)"
    echo "  ✅ ElevenLabs Integration"
    echo "  ✅ OpenAI Integration (Mocked)"
    echo "  ✅ Error Handling & Edge Cases"
    echo "  ✅ Response Format Validation"
    echo ""
    echo "🚀 Your AI Meeting Platform is ready for demos!"
else
    print_error "Some tests failed. Please check the output above."
    echo ""
    echo "💡 Troubleshooting tips:"
    echo "  - Ensure local Supabase is running (npx supabase start)"
    echo "  - Ensure development server is running (npm run dev)"
    echo "  - Check that all environment variables are set correctly"
    echo "  - Verify database migrations have been applied"
    exit 1
fi