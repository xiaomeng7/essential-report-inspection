#!/bin/bash

# Test script for generateWordReport function
# Usage: ./test-generateWordReport.sh [inspection_id]

INSPECTION_ID=${1:-"EH-2026-01-004"}
BASE_URL=${2:-"https://inspetionreport.netlify.app"}

echo "🧪 Testing generateWordReport function"
echo "======================================"
echo "Inspection ID: $INSPECTION_ID"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Generate Word Report
echo "📝 Step 1: Generating Word Report..."
RESPONSE=$(curl -s "${BASE_URL}/.netlify/functions/generateWordReport?inspection_id=${INSPECTION_ID}")
echo "Response: $RESPONSE"
echo ""

# Check if successful
if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "✅ Word report generated successfully!"
    echo ""
    
    # Test 2: Download Word Document
    echo "📥 Step 2: Downloading Word Document..."
    DOWNLOAD_URL="${BASE_URL}/.netlify/functions/downloadWord?inspection_id=${INSPECTION_ID}"
    echo "Download URL: $DOWNLOAD_URL"
    echo ""
    echo "To download, run:"
    echo "  curl -O -J \"$DOWNLOAD_URL\""
    echo ""
    echo "Or open in browser:"
    echo "  $DOWNLOAD_URL"
else
    echo "❌ Failed to generate Word report"
    echo "Response: $RESPONSE"
    exit 1
fi

echo ""
echo "📋 Next Steps:"
echo "1. Check Netlify function logs for placeholder matching details"
echo "2. Download the Word document and verify placeholders are filled"
echo "3. Look for these log entries:"
echo "   - '📋 Tags recognized by docxtemplater before render:'"
echo "   - '⚠️ Tags in template but not in data:'"
echo "   - '⚠️ Tags in data but not in template:'"
echo "   - '⚠️ Found unreplaced placeholders in rendered text:'"
