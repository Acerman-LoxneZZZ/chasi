"""Build the actual watch via a real MCP stdio client connected to live Blender.

Run only after the model owner has finished changes/CLI exports. This intentionally
uses an external SDK client and does not imply native tool reload in Codex.
"""
import asyncio
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence"
USER_PROMPT = "составь прриложение по промту в папке"


async def main():
    evidence = {"client": "external MCP Python SDK", "verified_at_utc": datetime.now(timezone.utc).isoformat(), "native_codex_tools_reloaded": False, "steps": []}
    params = StdioServerParameters(
        command=str(Path.home() / ".local/bin/mcp-for-blender"),
        args=["--host", "127.0.0.1", "--port", "9876"],
        env=dict(os.environ, DISABLE_TELEMETRY="true", BLENDER_MCP_DISABLE_TELEMETRY="true"),
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            init = await session.initialize()
            evidence["protocol_version"] = init.protocolVersion
            evidence["discovered_tools"] = [t.name for t in (await session.list_tools()).tools]

            async def call(name, arguments):
                result = await session.call_tool(name, arguments | {"user_prompt": USER_PROMPT})
                texts = [c.text for c in result.content if c.type == "text"]
                evidence["steps"].append({"tool": name, "arguments": arguments, "is_error": bool(result.isError), "text": texts})
                if result.isError or any("Traceback" in t or t.startswith("Error") for t in texts):
                    raise RuntimeError("MCP model call failed: " + name + "\n" + "\n".join(texts))
                return result, "\n".join(texts)

            builder = ROOT / "assets/blender/build_watch.py"
            code = "import runpy\nrunpy.run_path(" + repr(str(builder)) + ", run_name='__main__')"
            _, built = await call("execute_blender_code", {"code": code})
            assert "WATCH_BUILD_DONE 47 parts" in built, "No completed builder result from Blender"
            _, summary = await call("get_scene_info", {"root": "watch_root", "fields": ["location", "children", "materials", "details"], "limit": 120})
            assert "case_body" in summary and "dial_face" in summary and "hand_hour" in summary
            verify = '''import bpy, json
root=bpy.data.objects['watch_root']
parts=list(root.children)
assert len(parts)==47
assert all(any(c.type=='MESH' for c in p.children) for p in parts)
print(json.dumps({'scene':bpy.context.scene.name,'parts':len(parts),'mesh_objects':sum(o.type=='MESH' for o in bpy.context.scene.objects),'file':bpy.data.filepath,'part_names':sorted(p.name for p in parts)},ensure_ascii=False))
from mathutils import Vector
eye=Vector((2.2,-6,2.0)); center=Vector((0,0,.25))
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        space=area.spaces.active
        space.region_3d.view_location=center
        space.region_3d.view_distance=5.3
        space.region_3d.view_rotation=(center-eye).to_track_quat('-Z','Y')
        space.shading.type='MATERIAL'
        space.overlay.show_overlays=False
'''
            await call("execute_blender_code", {"code": verify})
            result, _ = await call("look", {"mode": "angles", "target": ["watch_root"], "views": [[2.2, -6, 2.0]], "shading": "material", "max_size": 1000})
            images = [c for c in result.content if c.type == "image"]
            assert images, "No real watch screenshot returned"
            for i, img in enumerate(images):
                suffix = ".png" if img.mimeType == "image/png" else ".jpg"
                path = EVIDENCE / (f"mcp-watch-model-{i}" + suffix)
                path.write_bytes(base64.b64decode(img.data))
                evidence.setdefault("images", []).append(str(path.relative_to(ROOT)))
            # Material preview in Blender reflects differently from the final
            # Three.js lighting. Hide only the crystal in the LIVE viewport for
            # an additional technical view; never save or export this setting.
            await call("execute_blender_code", {"code": "import bpy\nfor obj in bpy.data.objects['front_glass'].children:\n    obj.hide_set(True)\nprint('VIEWPORT_ONLY_CRYSTAL_HIDDEN_NOT_SAVED')"})
            technical, _ = await call("look", {"mode": "angles", "target": ["watch_root"], "views": [[2.2, -6, 2.0]], "shading": "material", "max_size": 1000})
            technical_images = [c for c in technical.content if c.type == "image"]
            assert technical_images
            path = EVIDENCE / "mcp-watch-technical-preview.png"
            path.write_bytes(base64.b64decode(technical_images[0].data))
            evidence["technical_viewport_preview"] = {
                "image": str(path.relative_to(ROOT)),
                "note": "Only the crystal mesh is hidden in the live Blender viewport to inspect the dial; not saved to blend or GLB. Full glass geometry remains in exported files and original capture.",
                "gui_left_open": True,
                "gui_scene": "PocketWatch_Exhibit",
            }
            evidence["passed"] = True
    for relative in ["assets/blender/build_watch.py", "assets/blender/export_watch.py", "assets/blender/pocket-watch.blend", "public/models/pocket-watch.glb", "src/data/watch-parts.json"]:
        p = ROOT / relative
        evidence.setdefault("artifacts", []).append({"path": relative, "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()})
    evidence["model_validation"] = json.loads((EVIDENCE / "model-validation.json").read_text())
    (EVIDENCE / "mcp-watch-model.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"passed": evidence["passed"], "images": evidence["images"], "model_validation": evidence["model_validation"]}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
