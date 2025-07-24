#!/bin/bash
# Packaging script for Whisper Transcriber GNOME Extension

# Get directory of the script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
EXT_UUID="whisper-transcriber@opreto.com"
EXT_NAME="Whisper Transcriber"
VERSION=$(grep -oP '"version": "\K[^"]+' "${SCRIPT_DIR}/metadata.json")

echo "Packaging ${EXT_NAME} v${VERSION}..."

# Check for required files
required_files=(
  "extension.js"
  "prefs.js"
  "metadata.json"
  "LICENSE"
  "PRIVACY.md"
  "README.md"
  "stylesheet.css"
  "schemas/org.gnome.shell.extensions.whisper-transcriber.gschema.xml"
  "schemas/gschemas.compiled"
  "icon.png"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${SCRIPT_DIR}/${file}" ]; then
    echo "Error: Required file ${file} not found!"
    exit 1
  fi
done

# Ensure schemas are compiled
if [ ! -f "${SCRIPT_DIR}/schemas/gschemas.compiled" ]; then
  echo "Compiling schemas..."
  glib-compile-schemas "${SCRIPT_DIR}/schemas/"
  if [ $? -ne 0 ]; then
    echo "Error: Failed to compile schemas!"
    exit 1
  fi
fi

# Translation files are compiled during pack, not included in source

# Create build directory
BUILD_DIR="/tmp/${EXT_UUID}-build"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Copy files to build directory
echo "Copying files to build directory..."
cp -r "${SCRIPT_DIR}/"* "${BUILD_DIR}/"

# Remove any git or development files
rm -rf "${BUILD_DIR}/.git"
rm -rf "${BUILD_DIR}/.github"
rm -f "${BUILD_DIR}/.gitignore"
rm -f "${BUILD_DIR}/package.sh"
rm -f "${BUILD_DIR}/${EXT_UUID}.zip"

# Create the ZIP file (without nesting the directory inside)
echo "Creating ZIP package..."
cd "${BUILD_DIR}" && zip -r "${SCRIPT_DIR}/${EXT_UUID}.zip" .

echo "Package created: ${SCRIPT_DIR}/${EXT_UUID}.zip"
echo "You can now upload this file to extensions.gnome.org"

