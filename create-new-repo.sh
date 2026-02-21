#!/bin/bash
#
# Creates a new GitHub repo "Reporting_Module_v0.1" under husam-hammami
# with a fresh initial commit (no history from Salalah_config).
#
# Prerequisites: gh CLI authenticated (run: gh auth login)
#
# Usage: bash create-new-repo.sh
#

set -e

REPO_NAME="Reporting_Module_v0.1"
OWNER="husam-hammami"
DESCRIPTION="Configurable reporting system with drag-and-drop report builder, live monitoring, and historical data visualization."
SOURCE_BRANCH="claude/create-repo-from-branch-DTDCw"

echo "==> Step 1: Creating GitHub repo ${OWNER}/${REPO_NAME}..."
gh repo create "${OWNER}/${REPO_NAME}" \
  --public \
  --description "${DESCRIPTION}" \
  --confirm 2>/dev/null || \
gh repo create "${OWNER}/${REPO_NAME}" \
  --public \
  --description "${DESCRIPTION}"

echo "==> Step 2: Cloning source branch..."
TMPDIR=$(mktemp -d)
git clone -b "${SOURCE_BRANCH}" "https://github.com/${OWNER}/Salalah_config.git" "${TMPDIR}/source"

echo "==> Step 3: Creating fresh repo (no history)..."
mkdir "${TMPDIR}/fresh"
cd "${TMPDIR}/fresh"
git init -b main

# Copy all files except .git
cp -a "${TMPDIR}/source/." "${TMPDIR}/fresh/"
rm -rf "${TMPDIR}/fresh/.git"
cd "${TMPDIR}/fresh"
git init -b main
git add .
git commit -m "Initial commit — Reporting Module v0.1

Configurable reporting system with drag-and-drop report builder,
live monitoring, and historical data visualization."

echo "==> Step 4: Pushing to new repo..."
git remote add origin "https://github.com/${OWNER}/${REPO_NAME}.git"
git push -u origin main

echo ""
echo "==> Done! New repo created at: https://github.com/${OWNER}/${REPO_NAME}"

# Cleanup
rm -rf "${TMPDIR}"
