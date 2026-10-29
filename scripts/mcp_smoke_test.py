"""Reproducible stdio MCP integration test; never touches visitor runtime.

Run with the Python inside uv's mcp-for-blender tool environment.
The SDK is an external test client, not a claim that this Codex turn hot-reloaded tools.
"""
import asyncio
import base64
import json
import os
from pathlib import Path
import uuid

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence"
NAME = "PocketWatch_MCP_Test_" + uuid.uuid4().hex[:10]
USER_PROMPT = "составь прриложение по промту в папке"


async def main():
    evidence = {"client": "MCP Python SDK external verification client", "test_entity": NAME, "steps": []}
    env = dict(os.environ, DISABLE_TELEMETRY="true", BLENDER_MCP_DISABLE_TELEMETRY="true")
    params = StdioServerParameters(command=str(Path.home() / ".local/bin/mcp-for-blender"), args=["--host", "127.0.0.1", "--port", "9876"], env=env)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            init = await session.initialize()
            evidence["protocol_version"] = init.protocolVersion
            evidence["server_info"] = init.serverInfo.model_dump()
            tools = await session.list_tools()
            evidence["discovered_tools"] = [t.name for t in tools.tools]

            async def call(tool, args):
                result = await session.call_tool(tool, args | {"user_prompt": USER_PROMPT})
                texts = [c.text for c in result.content if c.type == "text"]
                evidence["steps"].append({"tool": tool, "arguments": args, "is_error": bool(result.isError), "text": texts})
                if result.isError or any("Traceback" in t or t.startswith("Error") for t in texts):
                    raise RuntimeError("MCP call failed: " + tool + " " + "\n".join(texts))
                return result, "\n".join(texts)

            await call("get_addon_status", {})
            await call("get_scene_info", {"fields": ["settings", "location"], "limit": 5})
            create = f'''import bpy, json
name = {NAME!r}
col = bpy.data.collections.new(name)
bpy.context.scene.collection.children.link(col)
bpy.ops.mesh.primitive_cube_add(size=0.35, location=(0,0,0.2))
obj = bpy.context.object
obj.name = name
obj.data.name = name + "_mesh"
for collection in list(obj.users_collection):
    collection.objects.unlink(obj)
col.objects.link(obj)
mat = bpy.data.materials.new(name + "_material")
mat.diffuse_color = (0.5, 0.2, 0.06, 1)
obj.data.materials.append(mat)
print(json.dumps({{"name": obj.name, "location": list(obj.location), "collection": col.name}}))'''
            cleanup = f'''import bpy, json
name = {NAME!r}
obj = bpy.data.objects.get(name)
if obj is not None:
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)
col = bpy.data.collections.get(name)
if col is not None:
    bpy.data.collections.remove(col)
mat = bpy.data.materials.get(name + "_material")
if mat is not None and mat.users == 0:
    bpy.data.materials.remove(mat)
print(json.dumps({{"test_object_removed": bpy.data.objects.get(name) is None, "test_collection_removed": bpy.data.collections.get(name) is None}}))'''
            try:
                await call("execute_blender_code", {"code": create})
                modify = f'''import bpy, json
obj=bpy.data.objects[{NAME!r}]
obj.location.x=0.65
obj.data.materials[0].diffuse_color=(0.08,0.4,0.6,1)
print(json.dumps({{"name":obj.name,"location":list(obj.location),"material_rgba":list(obj.data.materials[0].diffuse_color)}}))'''
                await call("execute_blender_code", {"code": modify})
                _, info = await call("get_scene_info", {"query": NAME, "fields": ["location", "materials"], "limit": 5})
                assert "0.65" in info, "Changed position not reflected in a second scene query"
                result, _ = await call("look", {"mode": "angles", "target": [NAME], "views": ["three_quarter"], "shading": "solid", "max_size": 640})
                images = [c for c in result.content if c.type == "image"]
                assert images, "MCP returned no scene image"
                for i, img in enumerate(images):
                    suffix = ".png" if img.mimeType == "image/png" else ".jpg"
                    p = EVIDENCE / (f"mcp-test-scene-{i}" + suffix)
                    p.write_bytes(base64.b64decode(img.data))
                    evidence.setdefault("images", []).append(str(p.relative_to(ROOT)))
            finally:
                _, cleaned = await call("execute_blender_code", {"code": cleanup})
                assert '"test_object_removed": true' in cleaned
                assert '"test_collection_removed": true' in cleaned
            _, final = await call("get_scene_info", {"query": NAME, "limit": 5})
            evidence["final_scene_query"] = final
            evidence["passed"] = True
    (EVIDENCE / "mcp-smoke-test.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"passed": evidence["passed"], "tool_count": len(evidence["discovered_tools"]), "steps": len(evidence["steps"]), "images": evidence.get("images")}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
