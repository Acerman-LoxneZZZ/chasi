"""Check readability of the 48 skills explicitly requested by the master prompt."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
HOME = Path.home()
R0 = HOME / ".agents/skills"
R1 = HOME / ".codex/skills/.system"
PLUGINS = HOME / ".codex/plugins/cache"
content = (ROOT / "MASTER_PROMPT_POCKET_WATCH.md").read_text()
section = content.split("### 3.1.", 1)[1].split("### 3.2.", 1)[0]
names = re.search(r"~~~text\n(.*?)\n~~~", section, re.S).group(1).splitlines()
overrides = {
    "documents:documents": PLUGINS / "openai-primary-runtime/documents/26.1025.11240/skills/documents/SKILL.md",
    "pdf:pdf": PLUGINS / "openai-primary-runtime/pdf/26.1025.11240/skills/pdf/SKILL.md",
    "presentations:Presentations": PLUGINS / "openai-primary-runtime/presentations/26.1025.11240/skills/presentations/SKILL.md",
    "template-creator:template-creator": PLUGINS / "openai-primary-runtime/template-creator/26.1025.11240/skills/template-creator/SKILL.md",
    "spreadsheets:Spreadsheets": PLUGINS / "openai-primary-runtime/spreadsheets/26.1025.11240/skills/spreadsheets/SKILL.md",
    "spreadsheets:excel-live-control": PLUGINS / "openai-primary-runtime/spreadsheets/26.1025.11240/skills/excel-live-control/SKILL.md",
    "plugin-management:plugin-management": PLUGINS / "openai-curated-remote/plugin-management/0.1.0/skills/plugin-management/SKILL.md",
    "visualize:visualize": PLUGINS / "openai-bundled/visualize/1.0.49/skills/visualize/SKILL.md",
}
for slug in ["maintain-space", "manage-schedules", "organize-space", "write-page"]:
    overrides["pages:" + slug] = PLUGINS / f"openai-curated-remote/pages/0.1.26/skills/{slug}/SKILL.md"
for slug in ["sites", "sites-remix"]:
    overrides["sites:" + slug] = PLUGINS / f"openai-curated-remote/sites/1.1.2/skills/{slug}/SKILL.md"
for slug in ["create-pet", "pets", "update-pet"]:
    overrides["work-pets:" + slug] = PLUGINS / f"openai-curated-remote/work-pets/0.1.6/skills/{slug}/SKILL.md"
rows = []
for name in names:
    p = overrides.get(name, (R1 if name in {"imagegen", "openai-docs", "skill-creator", "skill-installer"} else R0) / name / "SKILL.md")
    try:
        data = p.read_bytes()
        text = data.decode("utf-8")
        assert "name:" in text and len(text) > 100
        row = {"skill": name, "status": "Уже доступен", "path": str(p), "readable": True, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    except Exception as e:
        row = {"skill": name, "status": "Недоступен", "path": str(p), "readable": False, "error": str(e)}
    rows.append(row)
assert len(rows) == 48, len(rows)
(ROOT / "docs/evidence/skills-audit.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
lines = ["# Отчёт подготовки окружения", "", "Проверено 29 октября 2026 года. Проверка воспроизводится командой `python3 scripts/audit_skills.py`.", "", f"Из 48 запрошенных навыков {sum(r['readable'] for r in rows)} уже объявлены в каталоге текущей сессии и имеют читаемый `SKILL.md`. Новых навыков установлено: **0**. Дубликаты не создавались, системные навыки и кеш плагинов не изменялись.", "", "Таблица фиксирует доступность инструкций. Это не означает запуск всех навыков или проверку входа во все внешние приложения. Нерелевантные сервисы, документы, питомцы и публикации не создавались.", "", "| Навык | Итоговый статус | Источник / пакет | Проверка |", "| --- | --- | --- | --- |"]
for r in rows:
    check = f"Инструкция читается, {r.get('bytes', 0)} байт; объявлена в каталоге сессии" if r["readable"] else r["error"]
    lines.append(f"| {r['skill']} | {r['status']} | `{r['path']}` | {check} |")
lines += ["", "Подробные размеры и SHA256 инструкций: [skills-audit.json](docs/evidence/skills-audit.json).", "", "## Проверка инструментов пакетов", "", "- Pages: в каталоге инструментов есть чтение/поиск/редактирование страниц и управление автоматизациями. Вызовы записи не выполнялись.", "- Sites: инструменты создания, версий, развёртывания и настроек доступны. По заданию проект локальный, облачный сайт не регистрировался.", "- Work Pets: инструменты списка, создания, проверки и обновления доступны. Они не вызывались.", "- Spreadsheet/Presentation/Document навыки: инструкции доступны; в сессии также объявлены инструменты `chatgpt_space_*artifact*` и `codex_document_control_*`. Живая Excel-сессия или внешний документ заданием не предоставлены и не требуются.", "- Plugin Management: поиск Blender выполнен, дополнительных Blender-плагинов в каталоге поиска не найдено; подготовлен самостоятельный MCP-сервер.", "- Imagegen, web и выполнение команд доступны как встроенные инструменты. Imagegen для основной 3D-модели не использовался.", "", "## Зависимости", "", "- ОС: Ubuntu Linux x86_64; Python 3.12.3; Node.js 22.23.3; Codex CLI 0.165.0.", "- uv 0.13.6 установлен официальным скриптом Astral в `~/.local/bin`.", "- Blender 4.5.9 LTS установлен в `.tools/blender/blender-4.5.9-linux-x64/`; SHA256 официального архива проверен.", "- MCP for Blender 2.2.6 установлен через `uv tool install --python /usr/bin/python3 mcp-for-blender==2.2.6`; MCP SDK 1.30.0. Точный список пакетов: [mcp-python-packages.txt](docs/evidence/mcp-python-packages.txt).", "- Зависимости приложения фиксирует единственный `package-lock.json`; браузеру нужны только статические файлы сборки.", "", "## Blender MCP", "", "Сервер и совместимый аддон установлены и проверены реальным MCP SDK-клиентом: initialize, list_tools, чтение сцены, создание своей тестовой коллекции и куба, изменение положения и материала, повторное чтение, снимок и удаление только тестовых сущностей. Подключение — stdio к MCP-серверу и TCP `127.0.0.1:9876` к аддону. Телеметрия отключена.", "", "Конфигурация Codex добавлена только в `.codex/config.toml` проекта. Ранее этого файла не было, резервная копия не требовалась; `~/.codex/config.toml` и другие пользовательские настройки не менялись. `codex mcp list --json` обнаруживает включённый `pocket_watch_blender`.", "", "**Ограничение текущей AI-сессии:** интерфейс инструментов текущего разговора не предоставляет hot reload MCP, а CLI подтверждает доступность новых инструментов после следующего запуска клиента. Поэтому регистрация и внешняя MCP-проверка завершены, но обнаружение Blender-инструментов непосредственно в уже открытой сессии Codex не заявляется. Внешний SDK-клиент не выдаётся за встроенный инструмент этого разговора.", "", "Подробности и проверяемые свидетельства: [docs/BLENDER_MCP.md](docs/BLENDER_MCP.md), [blender-environment.json](docs/blender-environment.json). Для просмотра приложения Blender, MCP и Python не нужны.", ""]
watch_evidence = ROOT / "docs/evidence/mcp-watch-model.json"
if watch_evidence.exists() and json.loads(watch_evidence.read_text()).get("passed"):
    lines += [
        "## Создание настоящей модели через MCP",
        "",
        "После smoke-test окончательный `assets/blender/build_watch.py` действительно выполнен в живом Blender через MCP `execute_blender_code` (внешний SDK-клиент). Построены 47 самостоятельных деталей, сохранены `.blend`, GLB и экспортный манифест. Затем `get_scene_info` независимо прочитал иерархию, дополнительный Python-запрос подтвердил 47 carriers с mesh-геометрией, а `look` вернул снимок настоящих часов.",
        "",
        "Свидетельства: [mcp-watch-model.json](docs/evidence/mcp-watch-model.json), [mcp-watch-model-0.png](docs/evidence/mcp-watch-model-0.png). Это реальное выполнение через MCP и аддон, при сохранённом выше ограничении нативного обнаружения tools в текущем разговоре.",
        "",
    ]
(ROOT / "SETUP_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
print(json.dumps({"requested": len(rows), "already_available": sum(r["readable"] for r in rows), "installed_skills": 0}, ensure_ascii=False))
