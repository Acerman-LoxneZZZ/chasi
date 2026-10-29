"""Start the real addon in an isolated development scene/preferences profile."""
import bpy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.preferences.addon_enable(module="blender_mcp")
import blender_mcp

scene = bpy.data.scenes.get("PocketWatchDevelopment")
if scene is None:
    scene = bpy.data.scenes.new("PocketWatchDevelopment")
bpy.context.window.scene = scene
scene.blendermcp_port = 9876
scene.blendermcp_auto_start_server = True
prefs = bpy.context.preferences.addons["blender_mcp"].preferences
prefs.telemetry_consent = False
existing = getattr(bpy.types, "blendermcp_server", None)
if existing:
    existing.stop()
server = blender_mcp.BlenderMCPServer(host="127.0.0.1", port=9876)
bpy.types.blendermcp_server = server
server.start()
scene.blendermcp_server_running = server.running
bpy.ops.wm.save_userpref()

info = {
    "blender_version": bpy.app.version_string,
    "addon_file": blender_mcp.__file__,
    "addon_version": list(blender_mcp.bl_info["version"]),
    "addon_protocol": blender_mcp.ADDON_PROTOCOL_VERSION,
    "host": server.host,
    "port": server.port,
    "running": server.running,
    "telemetry_consent": prefs.telemetry_consent,
    "scene": scene.name,
}
(ROOT / "docs/evidence/blender-addon-start.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
print("POCKET_WATCH_MCP_READY", json.dumps(info), flush=True)
