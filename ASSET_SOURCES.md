# Происхождение ресурсов

Все ресурсы, необходимые посетителю, поставляются в проекте и production-сборке. Внешних моделей, платных ассетов, CDN-шрифтов, удалённого HDRI и запросов к AI во время просмотра нет.

| Ресурс | Источник | Условия / использование |
| --- | --- | --- |
| Карманные часы: вся предметная геометрия, материалы, компоновка | Созданы для этого проекта процедурно в `assets/blender/build_watch.py` | Авторский результат задания. `.blend`, `.glb` и генератор включены; чужие 3D-модели не использовались. |
| Текст и цифры на циферблате | Геометрия из DejaVu Serif / Sans; локальные исходные TTF в `assets/blender/fonts/` | Bitstream Vera / DejaVu font license; [полный текст](docs/licenses/DejaVu.txt). Сайт не загружает эти TTF: надписи входят в mesh. |
| Изображение часов при ошибке | Снимок настоящей собранной модели из Three.js в браузере | Сгенерировано из собственной модели, преобразовано в WebP без замены содержания. `public/images/watch-fallback.webp`. |
| Manrope Variable 5.3.0, кириллица и латиница | npm `@fontsource-variable/manrope`; [Fontsource](https://fontsource.org/fonts/manrope), [исходный проект](https://github.com/sharanda/manrope) | SIL Open Font License 1.1. [Лицензия](docs/licenses/Manrope-OFL.txt); WOFF2 включены в сборку. |
| Cormorant Garamond 5.3.0, кириллица и латиница | npm `@fontsource/cormorant-garamond`; [Fontsource](https://fontsource.org/fonts/cormorant-garamond), [исходный проект](https://github.com/CatharsisFonts/Cormorant) | SIL Open Font License 1.1. [Лицензия](docs/licenses/Cormorant-Garamond-OFL.txt); WOFF2 включены в сборку. |
| Знак часов, иконки интерфейса, схемы передачи энергии | Собственные SVG в `src/components/Icon.tsx`, `src/app/App.tsx`, `public/favicon.svg` | Созданы для задания; внешняя иконочная библиотека не используется. |
| Отражения и студийное окружение | Three.js `RoomEnvironment`, программная PMREM; без файлов HDRI | MIT, как и Three.js. Окружение строится локально; геометрия комнаты в экспозиции не показывается. |
| React / React DOM, Three.js | npm, версии и integrity в `package-lock.json` | MIT. Лицензии браузерных зависимостей дополнительно сохранены в `docs/licenses/React-MIT.txt`, `React-DOM-MIT.txt`, `Three-MIT.txt`. |
| Vite, TypeScript, Vitest, Playwright | npm, версии и integrity в `package-lock.json` | Инструменты разработки; лицензии пакетов находятся в установленных `node_modules`. Их исполняемые программы не включаются в статический сайт. |
| Blender 4.5.9 LTS | [Официальный download.blender.org](https://download.blender.org/release/Blender4.5/) | GPL; portable-инструмент разработки в `.tools/`, не включается в браузерную сборку. SHA256 проверен, см. отчёт MCP. |
| MCP for Blender 2.2.6 / аддон 1.8 | [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender), PyPI | Сторонняя MIT-интеграция для разработки; не является продуктом Blender Foundation. Телеметрия отключена. |

Технические первичные источники реализации: [Three.js](https://threejs.org/docs/), [React](https://react.dev/), [Vite](https://vite.dev/), [Blender Python API](https://docs.blender.org/api/current/), [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Источники навыков перечислены отдельно в `SETUP_REPORT.md`.
