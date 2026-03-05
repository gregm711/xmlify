#!/bin/bash
# Download BFCL v3 test data from HuggingFace
set -e

DIR="$(cd "$(dirname "$0")/data" 2>/dev/null || mkdir -p "$(dirname "$0")/data" && cd "$(dirname "$0")/data" && pwd)"
BASE="https://huggingface.co/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard/resolve/main"

CATEGORIES=("simple" "multiple" "parallel" "parallel_multiple")

for cat in "${CATEGORIES[@]}"; do
  echo "Downloading BFCL_v3_${cat}..."
  curl -sL "${BASE}/BFCL_v3_${cat}.json" -o "${DIR}/BFCL_v3_${cat}.json"
  curl -sL "${BASE}/possible_answer/BFCL_v3_${cat}.json" -o "${DIR}/BFCL_v3_${cat}_answer.json"
  lines=$(wc -l < "${DIR}/BFCL_v3_${cat}.json" | tr -d ' ')
  echo "  ${lines} cases"
done

echo "Done. Data in ${DIR}/"
