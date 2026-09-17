#!/bin/bash
# Run on Andy's Mac (gh already authenticated via keyring).
set -euo pipefail
DEST="${1:-$HOME/Library/Application Support/CareerLoop/dev/career-loop}"
mkdir -p "$(dirname "$DEST")"
if [[ ! -d "$DEST/.git" ]]; then
  git clone https://github.com/andymccutcheon/career-loop.git "$DEST"
fi
cd "$DEST"
git status -sb
git push -u origin main
echo "SHA=$(git rev-parse HEAD)"
