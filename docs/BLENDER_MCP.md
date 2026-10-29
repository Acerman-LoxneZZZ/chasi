# Подготовка Blender и проверка MCP

Проверено 29 октября 2026 года. Для просмотра готового сайта эти инструменты не нужны: модель GLB и все ресурсы загружаются обычным браузером.

## Что установлено

| Компонент | Фактический результат |
| --- | --- |
| Blender | 4.5.9 LTS, Linux x64, portable в `.tools/blender/blender-4.5.9-linux-x64/` |
| Источник Blender | [Официальный архив](https://download.blender.org/release/Blender4.5/blender-4.5.9-linux-x64.tar.xz), проверен по [официальному SHA256](https://download.blender.org/release/Blender4.5/blender-4.5.9.sha256) |
| SHA256 архива | `dcdc3eca6c9825bb35a8033b689c053f3cb5a9b0cd2a61b2eac2a49436b4ad3d` |
| uv | 0.13.6, официальный installer `https://astral.sh/uv/install.sh`, `~/.local/bin/uv` и `uvx` |
| MCP for Blender | PyPI `mcp-for-blender==2.2.6`, установка через `uv tool install --python /usr/bin/python3 mcp-for-blender==2.2.6` |
| Python SDK MCP | 1.30.0, в изолированном uv tool-окружении |
| Аддон Blender | Bundled addon из MCP for Blender 2.2.6; `bl_info.version=(1,8)`, protocol 15 |
| Исходник интеграции | [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender), revision `8782963ba87a4c90482198bd7c7e17219ac3a0f7` в `.tools/blender-mcp/` |

Это сторонняя интеграция, не официальный продукт Blender Foundation. Актуальный README прочитан перед установкой: пакет переименован из `blender-mcp` в `mcp-for-blender`; новое имя использовано и для установки, и для запуска.

## Изоляция и конфигурация

Подключение Codex сохранено только в `.codex/config.toml` данного проекта. Используется абсолютный executable `~/.local/bin/mcp-for-blender`, stdio-транспорт; флаги соединения — `--host 127.0.0.1 --port 9876`. Порт аддона привязан только к loopback, что проверено через `ss -ltnp`.

До задачи проектный файл `.codex/config.toml` отсутствовал, поэтому копировать прежнюю версию было нечего. Пользовательский `~/.codex/config.toml` не изменялся. Blender запускается с отдельными `BLENDER_USER_CONFIG` и `BLENDER_USER_SCRIPTS` внутри `.tools/blender-user/`; существующие пользовательские настройки и сцены не удаляются. Создана собственная сцена `PocketWatchDevelopment`.

Аддон установлен штатной командой `mcp-for-blender install-addon --addons-dir <абсолютный путь>`. Затем включён через `bpy.ops.preferences.addon_enable`, его сервер запущен через Python API. Подтверждение: [blender-addon-start.json](evidence/blender-addon-start.json). Телеметрия выключена и в предпочтениях аддона, и через `DISABLE_TELEMETRY=true`, `BLENDER_MCP_DISABLE_TELEMETRY=true`.

## Реальная проверка

Скрипт [mcp_smoke_test.py](../scripts/mcp_smoke_test.py) выступает самостоятельным MCP SDK-клиентом и запускает сервер по stdio. Он проверил:

1. MCP `initialize` согласовал protocol `2025-11-25`.
2. `list_tools` обнаружил 9 инструментов, включая `get_scene_info`, `execute_blender_code`, `look`.
3. `get_addon_status` подтвердил Blender 4.5.9, совместимый addon protocol 15 и отключённую телеметрию.
4. `get_scene_info` прочитал реальную запущенную сцену.
5. `execute_blender_code` создал уникальную тестовую коллекцию, куб и материал.
6. Второй вызов изменил X на 0.65 и цвет материала.
7. Повторное независимое `get_scene_info` показало новое положение и материал.
8. `look` вернул изображение сцены. PNG сохранён и визуально просмотрен.
9. Удалены только сущности с уникальным тестовым именем; финальный запрос больше их не обнаруживает.

Проверяемый машинный отчёт: [mcp-smoke-test.json](evidence/mcp-smoke-test.json). Снимок: [mcp-test-scene-0.png](evidence/mcp-test-scene-0.png). Лог: [mcp-test-client.log](evidence/mcp-test-client.log). Список точных зависимостей: [mcp-python-packages.txt](evidence/mcp-python-packages.txt).

Повторная проверка разработчиком при запущенном Blender:

```bash
/home/nolimetrus/.local/share/uv/tools/mcp-for-blender/bin/python scripts/mcp_smoke_test.py
```

## Построение окончательной модели через MCP

После завершения фоновой отладки финальный генератор действительно повторно выполнен в живом Blender через `execute_blender_code`:

```python
runpy.run_path("<корень проекта>/assets/blender/build_watch.py", run_name="__main__")
```

Построение и glTF-экспорт успешно завершились: 47 самостоятельных carriers, 47 meshes, 95 nodes, 12 материалов, 120 704 треугольника, GLB 3 020 672 байт. Экспортёр повторно подтвердил имена, координаты, исходные TRS, положительные масштабы и нормализованные quaternion. Затем отдельный `get_scene_info` прочитал иерархию, а независимый запрос Python проверил, что все 47 carriers содержат настоящую mesh-геометрию. MCP `look` вернул изображение именно созданных часов.

Сценарий: [mcp_build_watch.py](../scripts/mcp_build_watch.py). Подробное свидетельство с результатами инструментов, проверкой GLB и SHA256 полученных файлов: [mcp-watch-model.json](evidence/mcp-watch-model.json). Снимок полной модели: [mcp-watch-model-0.png](evidence/mcp-watch-model-0.png). Дополнительный [технический вид циферблата](evidence/mcp-watch-technical-preview.png) получен с выключенным **только в live viewport** стеклом: его геометрия сохранена в `.blend` и GLB, экспорт не менялся. Blender оставлен открытым с часами; последующее кадрирование viewport не пересохраняет файлы. Визуальная проверка окончательных материалов сайта проводится отдельно в Three.js, поскольку Blender material-preview и браузер используют разные настройки стекла и окружения.

## Граница текущей сессии Codex

`codex mcp list --json` действительно видит включённый сервер `pocket_watch_blender` из проектного конфига. Это подтверждает чтение конфигурации, но не заменяет проверку исполнения: она отдельно выполнена SDK-клиентом выше.

В уже открытом разговоре нет доступного инструмента hot reload MCP, а поиск по реестру инструментов текущей AI-сессии не обнаруживает Blender-инструменты. Поэтому не заявляется, что новые Blender tools стали нативно доступны внутри этого разговора. README интеграции указывает доступность после нового запуска Codex. Перезапуск клиента не выполнялся, чтобы не прервать текущую работу; участие пользователя для изготовления модели и сайта не требовалось.

Итог: сервер, аддон, конфигурация и реальное двустороннее MCP-исполнение подтверждены; последняя граница — нативное обнаружение инструментов в уже идущей AI-сессии — остаётся явно отмеченным ограничением. Внешняя SDK-проверка не выдаётся за нативный инструмент Codex.

## Первичные источники

- [MCP for Blender README](https://github.com/ahujasid/mcp-for-blender) — пакет, установка, совместимость, транспорт и addon.
- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) — project `.codex/config.toml`, stdio и параметры конфигурации.
- [Blender Python API](https://docs.blender.org/api/current/) — работа с сценой и аддонами.
- [Blender 4.5 LTS](https://download.blender.org/release/Blender4.5/) — официальный portable-архив и checksum.
