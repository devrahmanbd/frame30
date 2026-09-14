#!/usr/bin/env bash
# ==============================================================================
# Framique — Build Immutable Production Container
#
# Usage:
#   ./ops/docker/build.sh [--push] [--dry-run]
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"

bun run scripts/build-immutable-artifact.ts "$@"
