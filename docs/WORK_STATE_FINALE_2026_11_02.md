# KARpOV — финальная итерация завершена

2 ноября 2026. Продолжение восстановлено из GitHub после обрыва работы на другом устройстве. Финальная сборка, гравировка и звук сохранены; QA завершён. Не начинать проект заново.

## Проверенная версия

- Исправление приложения: **8ba44de**. Production entry: **assets/index-BDwMm0TQ.js**, CSS **index-DEfI_tuW.css**.
- Хеши всех assets, исходников и модели: `docs/evidence/build-finale.json`. Итог: `docs/evidence/browser-finale-summary.json`.
- **74/74 unit**, 9 файлов; **19/19 browser**, 1 worker, без retry/skip/flaky; **56 свежих кадров** (36 основного сценария и 20 гравировки/финала).
- Размеры: 1440×1000, 1280×800, 390×844, 360×800. Нет ошибок страницы/консоли, внешних запросов или горизонтального переполнения в проходах съёмки. Подпись KARpOV не перекрывает собранные часы, включая 1280×800.
- TypeScript/Vite build и verify:model прошли. Строгая сводка сопоставила загруженный entry, хеши, результаты и метрики; старые результаты не переносились на новый код.
- Метод: Windows, headless Chrome 156 / ANGLE SwiftShader; viewport и CDP touch эмуляция. AudioContext настоящий, скрытие вкладки моделируется. Физический телефон, аппаратный GPU/FPS, колонки, новый zoom 200% и no-JS не проверялись.

## Что доделано после восстановления

Поздняя загрузка шрифтов и изменение высоты разделов сдвигали начало финала, а нижние ScrollTrigger сохраняли прежние границы. DetailSceneManager теперь наблюдает размеры страницы и сцен, пересчитывает нижние триггеры одним отложенным RAF и отменяет его при dispose. Второй progress-follower не добавлен.

Регрессионный браузерный сценарий увеличивает раздел перед финалом на 137px. До исправления расхождение progress составляло 0,04231; новая сборка проходит проверку сборки, обратного движения и повтора. Он включён в финальный полный прогон.

Скрипты inspect-personalization / inspect-immersive принимают CHROME_BIN. Checkpoint сохраняется на Windows с fsync ZIP и атомарным os.replace; неподдерживаемый fsync каталога пропускается. README содержит команды PowerShell. Одновременный запуск нескольких software-WebGL браузеров вызывал тайм-ауты модели; окончательный чистый прогон и съёмка выполнены последовательно.

## Сохранённое поведение

- 47 основных GLB-групп и rest-TRS. Модель: 5 324 520 байт, 187 898 треугольников, 136 примитивов, 95 nodes / 47 meshes; SHA256 `dc9ecfc7240aba0ebcd3c8dd3930113e9ca5ff3b072485525eb52eb49cfa3d35`. Source/dist совпадают.
- React / TypeScript / Vite / императивный Three.js + GSAP ScrollTrigger + Lenis. Один общий ticker; абсолютный обратимый progress, локальные шрифты, KARpOV и три исполнения PBR.
- Intro fill 1.13 и намеренное макро 54–96% pose сохранены. Raw hold: 0–.06 → pose 0; .25–.30 → .22; .51–.56 → .46; .75–.80 → .75; .96–1 → 1. Не возвращать constant-fit во время макро.
- Основной WatchScene и ОДИН общий нижний renderer/canvas для balance/crown/geartrain/engraving/assembly. Крышка и финал используют один ленивый GLB. Сохранять visibility/reduced-motion cleanup, retry и context restore.
- Инициалы до восьми нормализованных символов следуют back_cover, сохраняются локально и входят в карточку. Два runtime-треугольника и один draw call не меняют исходный GLB.
- В финале сборка завершена к 78%, камера к 90%, подпись появляется в 91–98%. Sticky 360svh desktop / 300svh mobile, reduced 100svh. Повтор запускает прежнюю 42-секундную историю через настоящий scroll.
- Звук выключен по умолчанию и после reload; AudioContext создаётся только нажатием. Hidden/offscreen/mute останавливают источники. Карточка и гравировка — локальная примерка, не заказ. Модели и звук — художественная механическая иллюстрация.

## Запуск на этом устройстве

Папка: `C:/Users/loxne/OneDrive/Документы/ChatGPT/KARpOV`. Preview: **http://127.0.0.1:4174/**. Чужие серверы не останавливать.

```powershell
npm ci
npm run build
npm run preview -- --port 4174 --strictPort
```

При готовой сборке достаточно последней команды. Для Linux остаётся `PORT=4174 ./start.sh`. Для QA на Windows:

```powershell
$env:CHROME_BIN='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PW_BASE_URL='http://127.0.0.1:4174'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='docs/browser-finale-full.json'
npm run test:browser -- --workers=1 --reporter=list,json
node scripts/inspect-personalization.mjs
node scripts/inspect-immersive.mjs docs/screenshots/finale-story
node scripts/summarize-finale.mjs
```

После изменения приложения сначала выполнить build, обновить манифест хешей и повторить необходимые проверки. Подробности и ограничения — `docs/VERIFICATION.md`.

## Git и резервные копии

Целевая ветка сдачи — **origin/main**, https://github.com/Acerman-LoxneZZZ/chasi. Пользователь ранее явно разрешил push готовой итерации; без force push. Облачный деплой не запрашивался. Коммит с итоговыми отчётами следует за 8ba44de; при продолжении сверять локальный HEAD с origin/main после fetch.

Локальная ветка продолжения: `codex/finish-scroll-animation`. Готовые архивы: `artifacts/hod-vremeni.zip` и `artifacts/KARpOV.zip`; резервные копии: `artifacts/checkpoints/latest.zip` / `previous.zip`. ZIP включают исходники, редактируемую модель, готовый dist и QA; исключены аккаунты, .git, .tools, node_modules, .codex, .aws, .env и установки инструментов.

Версия до дополнений остаётся в Git **6b633c1**. Архив before-finale.zip и глобальные инструменты старого Linux-устройства не переносились. Отдельный Remotion-проект/MP4 не запрошен.
