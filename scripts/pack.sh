#!/bin/bash

# Exit on any error
set -e

echo "🚀 Starting build process..."

# Clean previous build
if [ -d "dist" ]; then
    echo "🧹 Cleaning previous build..."
    rm -rf dist
fi

# Run the build
echo "📦 Building project..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "❌ Build failed - dist directory not found"
    exit 1
fi

# Create zip file with timestamp
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
ZIP_NAME="nookbag-${TIMESTAMP}.zip"

echo "🗜️  Creating zip file: ${ZIP_NAME}"

# Create zip file from dist directory contents
cd dist
zip -r "${ZIP_NAME}" . -x "*.DS_Store"
cd ..

echo "✅ Successfully created ${ZIP_NAME}"
echo "📁 Build artifacts are in: dist/"
echo "📦 Packaged file: dist/${ZIP_NAME}" 