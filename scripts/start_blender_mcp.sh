#!/usr/bin/env bash
set -eu
POCKET_WATCH_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
export BLENDER_USER_CONFIG="$POCKET_WATCH_ROOT/.tools/blender-user/config"
export BLENDER_USER_SCRIPTS="$POCKET_WATCH_ROOT/.tools/blender-user/scripts"
export DISABLE_TELEMETRY=true
export BLENDER_MCP_DISABLE_TELEMETRY=true
exec "$POCKET_WATCH_ROOT/.tools/blender/blender-4.5.9-linux-x64/blender" --python "$POCKET_WATCH_ROOT/scripts/start_blender_mcp.py"
