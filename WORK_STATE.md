# KARpOV — исправление задержек скролла, 6 ноября 2026

Текущий запрос: «когда появляются шестерёнки скролл лагает и потом тоже». Проверены обе зоны: основной механизм и нижние живые сцены. Проект не начинался заново. Пользователь не уточнил устройство/браузер; вопрос задан, работа продолжается самостоятельно.

## Актуальная итерация производительности

- Preview остаётся **http://127.0.0.1:4174/**. Новый entry **assets/index-Bb3XpR_I.js**, CSS прежний **index-DEfI_tuW.css**. Хеши assets и входных файлов — `docs/evidence/build-scroll-performance.json`. Старые 74/74 и 19/19 ниже относятся только к Dovk9NqQ.
- Новый build/typecheck и verify:model проходят, **79/79 unit** (10 файлов) — `docs/evidence/unit-scroll-performance.json`. Browser QA текущего entry ещё в работе; итог не переносить из старого отчёта.
- Подтверждён дефект: dirty=true от ScrollTrigger обходил frameInterval в нижнем renderer. Теперь интервал соблюдается и при скролле, pending progress остаётся до следующего разрешённого кадра. Непрерывное движение и demand draw сохранены.
- GPU-команды асинхронны, прежний таймер renderer.render() видел только CPU. Новый GpuTimer читает только готовые EXT_disjoint_timer_query_webgl2 результаты, ограничивает очередь, учитывает context lost/disjoint/dispose; при отсутствии расширения работают CPU и фактическая задержка запрошенного кадра. Основной viewer снижает DPR раньше, нижний — по стоимости/каденсу с fallback .85 / 30 Hz.
- Нижняя подготовка разнесена на idle-задачи: renderer/environment, одна ближайшая геометрия, compileAsync с настоящим освещением. Proximity — примерно один viewport. Один общий нижний renderer/canvas и один нижний GLB сохранены; async завершения проверяют поколение renderer и dispose.
- Расчёт нижнего PMREM убран из runtime: `public/lighting/detail-room.bin` — точный RGBA16F readback прежнего RoomEnvironment с теми же параметрами (.07 / 128). Загружается лениво локально; никаких новых renderer или картинок вместо 3D. `scripts/bake-detail-environment.mjs` воспроизводит файл и сравнивает металлическую сферу при live/baked освещении: **maxPixelDeviation=0**, `docs/evidence/detail-lighting.json`. Сохранено индексированное переиспользование вершин в batching.
- Статические части объединены только внутри прежних анимируемых carrier, зубья остаются InstancedMesh. Calls: balance **17→12**, crown **16→12**, geartrain **38→24**. Треугольники неизменны **11128 / 12420 / 15344**. `scripts/verify-detail-batching.mjs` сравнил исходник 8c6768d и новый код по материалам, числу индексированных вершин, world bounds, моментам позиций/нормалей в пяти прямых/обратных позах: погрешность <1e-6, `docs/evidence/detail-batching.json`.
- Синхронный sessionStorage на каждом scroll заменён сохранением последнего положения раз в 250 ms и немедленным flush на pagehide/hidden/dispose. Reload/restoration сохранены.
- Диагностика реальным wheel: `scripts/profile-scroll.mjs --software --output=...`; before — `docs/evidence/scroll-performance-before.json` (Dovk9NqQ), after — готовится на Bb3XpR_I. Headless Chrome / ANGLE SwiftShader, 1280×800 DPR1, НЕ аппаратный GPU/FPS и НЕ физический телефон. Абсолютные тайминги этого software-прогона не выдавать за пользовательские FPS.
- Промежуточный BKenZUcM-профиль сохранён отдельно в `docs/evidence/scroll-performance-intermediate.json`: он выявил оставшийся тяжёлый старт PMREM и не показал равномерного улучшения всех фаз. После него сохранены индексы geometry и добавлен lossless baked environment; промежуточный отчёт не подтверждает финальный entry.
- Новый browser-сценарий `tests/performance.spec.ts` моделирует дорогие нижние draw, снимает инъекцию после fallback и проверяет бюджет при непрерывном скролле и последнюю позу; в existing experience снижены допустимые draw-call бюджеты. Всего теперь **20** browser-сценариев.
- Новый отчёт — `docs/SCROLL_PERFORMANCE.md`. Старые незавершённые visual QA/правки документации от 2 ноября сохранены; файлы `scripts/inspect-personalization.mjs`, `scripts/summarize-finale.mjs`, `docs/browser-finale-full.json`, `docs/screenshots/finale/` уже были изменены до текущего запроса. Не приписывать их новой итерации и не сбрасывать.

Дальше: закончить after-профиль, выполнить весь текущий browser-набор 20/20 на Bb3XpR_I, проверить нижние кадры desktop/mobile, записать итог, обновить безопасные ZIP/checkpoint, локально закоммитить и выполнить ранее разрешённый push origin/main без force. Облачный deploy не запрошен.

## Предыдущая итерация — контекст и исторические результаты

Пользователь принял все три предложенные функции запросом «добавляй звучит интересно». Они реализованы. Сейчас проверяется последняя правка композиции на коротких desktop-экранах; довести QA, сохранение и разрешённый push. Не начинать заново.

## Точка до исправления производительности

Исходники приложения: **68d40e6** (реализация 1279a22, audio lifecycle 27d5745). Production entry: **dist/assets/index-Dovk9NqQ.js**, CSS **index-DEfI_tuW.css**. Хеши всех assets и дерева входных исходников: docs/evidence/build-finale.json. Основной preview: **http://127.0.0.1:4174/**. Порт 4173 — чужой проект, не трогать.

**QA в работе:** build и 74/74 unit прошли; полный browser-прогон Dovk9NqQ завершён: 19/19, 2 workers, 0 retries / skip / flaky, 13.9 минуты. Теперь нужны 20 свежих кадров новых сцен на четырёх viewport и строгая сводка. Основная история проверяется полным browser-прогоном; её старые PNG не объявлять свежими. Физический телефон/GPU/FPS/колонки не проверялись. Не переносить старые результаты на новый entry.

Ранний полный прогон DmBgl6qn имел 19/19, но визуальная проверка выявила наложение подписи на нижний край часов при 1280×800. Исправление только CSS: у финальной сцены bottom 80px при desktop высотой до 900px, 130px до 650px. Он отражён в 68d40e6. Старые отчёты: docs/browser-finale-before-framing.json и docs/evidence/build-finale-before-framing.json, старые PNG — artifacts/qa-finale-preliminary/. Они не подтверждают новый CSS. Старый targeted CWMf5rZE также не является финальным полным прогоном.

## Реализованные дополнения

- Примерка до восьми нормализованных символов (кириллица, латиница, цифры, пробелы/точки) на живой задней крышке. localStorage, очистка, обновление основной 3D-сцены, строка «Гравировка (примерка)» в локальной карточке. Никакой отправки данных или заказа.
- Engraving — один Mesh/CanvasTexture с локальным Cormorant Garamond, прикреплён к существующему back_cover: position (0,.035,-.079), rotation Y=π, depth test. Цвет текста согласован с brass/steel/graphite. Пустая строка скрывает Mesh. Дополнение даёт 2 runtime-треугольника / 1 draw call и не меняет carrier или исходный GLB. Основной canvas не рисует скрытую сцену при вводе внизу.
- В финале после спецификации 47 GLB-групп собираются по исходным rest-TRS. Сборка завершается к 78%, камера к 90%, подпись KARpOV проявляется на 91–98%. Во время движения только часы; путь абсолютный и обратимый. Sticky 360svh desktop / 300svh mobile, reduced 100svh с собранными часами и подписью. «Повторить историю» возвращает intro и запускает прежний 42-секундный просмотр.
- PersonalWatchModel — один ленивый GLB для новых слотов engraving/assembly. DetailSceneManager сохраняет ОДИН нижний renderer/canvas на все пять слотов: balance/crown/geartrain/engraving/assembly. Вместе с основным WatchScene на странице две WebGL-системы. Не создавать renderer на слот. Crown/engraving/assembly — demand draw, неизменный финальный ракурс переиспользует кадр. Сохранять lazy visibility, hidden/offscreen/reduced stop, retry и context restore.
- Шесть новых fallback WebP (caseback/finale × brass/steel/graphite) получены из того же GLB/кода материалов и камеры. scripts/render-personal-watch.mjs; docs/evidence/personal-posters.json. Активные сцены — живая геометрия.
- MechanismSound: AudioContext создаётся/разблокируется только кнопкой. Синтезированные короткие тихие tick/tock; по умолчанию и после reload выключено. Один context переиспользуется; скрытая вкладка, уход со всех 3D-сцен и mute отменяют источники и suspend. Late resume после выключения тоже suspend. Lookahead использует аудиочасы, визуальный progress независим. Кнопки в header/финале, понятный статус отказа, cleanup закрывает context.

## Сохранённая основа

React / TypeScript / Vite / императивный Three.js + GSAP ScrollTrigger + Lenis. Один общий ticker/ScrollTrigger canonical raw progress. Живые сцены не подменять видео или картинками. Локальные шрифты и KARpOV, коммерческие разделы, три исполнения PBR сохранены.

Основной GLB не менялся: **5 324 520 B, 187 898 triangles, 136 primitives, 95 nodes / 47 meshes, 47 основных групп**. SHA256 `dc9ecfc7240aba0ebcd3c8dd3930113e9ca5ff3b072485525eb52eb49cfa3d35`; public/dist одинаковы. Exported rest-TRS сохранять.

Основной canvas занимает полный viewport. Intro fill 1.13, FOV 30°, небольшой выход за край намеренный. Raw hold: 0–.06 → pose 0; .25–.30 → .22; .51–.56 → .46; .75–.80 → .75; .96–1 → 1. Подписи только на остановках после intro. CinematicEase даёт мягкий разгон/равномерный пролёт/торможение, пик 1.25 средней (на треть меньше прежнего quintic); это математика, не FPS. Обход 423° desktop / 407° mobile; macro 54–96% POSE намеренно может обрезать корпус. Не возвращать constant-fit в macro.

Lenis lerp .075; навигация 2.4–8.5s, просмотр всей основной истории 42s через настоящий scroll. Нет второго progress-follower. Mouse pause, wheel, touch, key, range, новая навигация и hidden tab прерывают проход. Меню изначально скрыто, вызывается краем экрана/нажатием/Tab и уходит через 2.8s; focus/popover удерживают доступ. Picking только в manual. Три нижних procedural-модели остаются живыми.

## Проверки и доказательства

- npm run build / npm run verify:model — проходят; unit-файл последней сборки docs/evidence/unit-finale.json: 74/74, 9 файлов.
- Новый полный browser: docs/browser-finale-full.json; каждый сценарий аннотирует реальный entry. 13 прежних + 6 новых: настоящие пиксели гравировки/память/карточка, assembly/reverse/replay, reduced, реальный opt-in AudioContext с моделируемым visibility, lower GLB retry/context restore, отказ AudioContext.
- Свежие кадры нужно снять в docs/screenshots/finale/ (20): 1440×1000, 1280×800, 390×844, 360×800. scripts/inspect-personalization.mjs дожидается скрытия header и двух RAF перед кадром.
- Строгая сводка scripts/summarize-finale.mjs проверяет 19 единичных passed без retry/skip/flaky, реальные entry, 74 unit, хеши dist/всех входных исходников, GLB и метрики 20 кадров новых сцен. Основную историю заново проверяет полный набор browser-сценариев; дополнительный повтор 36 её PNG для изменения CSS только в финале не требуется. Выход docs/evidence/browser-finale-summary.json.
- Impeccable detect финальных App/components/CSS: docs/evidence/ui-finale.json (`[]`). DESIGN/ASSET_SOURCES/README обновлены. docs/VERIFICATION.md честно отмечает повторный QA в работе — заменить на итог после успешной сводки.
- Метод: headless Chrome / ANGLE SwiftShader; viewport и CDP touch эмуляция. AudioContext настоящий, скрытие вкладки в интеграционном тесте моделируется. Это не физический телефон, аппаратный GPU/FPS или акустическая проверка колонок. Отдельных новых zoom 200% / no-JS прогонов нет.

## Запуск и команды

```bash
cd '/home/nolimetrus/Рабочий стол/Karpov_Watch'
PORT=4174 ./start.sh
```

После выключения исходники/Git/ZIP сохраняются, сервер запускается заново. После изменения исходников нужен npm run build перед preview. Не использовать старый путь /3DD. Временный dev 5173 для генерации рендеров остановлен; production preview 4174 оставить.

```bash
PW_BASE_URL=http://127.0.0.1:4174 PLAYWRIGHT_JSON_OUTPUT_NAME=docs/browser-finale-full.json npm run test:browser -- --fully-parallel --workers=2 --reporter=list,json
node scripts/inspect-personalization.mjs
node scripts/summarize-finale.mjs
python3 scripts/package-release.py
cp artifacts/hod-vremeni.zip artifacts/KARpOV.zip
python3 scripts/save-checkpoint.py
```

## Git и локальные копии

Пользователь явно разрешил push готовой итерации: origin/main, https://github.com/Acerman-LoxneZZZ/chasi. Предыдущая версия до 6b633c1 отправлена. Новый запрос пользователя «запуш все что сделал пока» требует немедленно отправить текущий код и WIP-документацию, не дожидаясь окончания повторного QA. Отправляются commits 1279a22, 27d5745, 68d40e6 и текущий коммит состояния. После завершения QA отдельно отправить окончательные отчёты. Без force push. Облачная публикация сайта не запрашивалась.

Baseline этой итерации: Git **6b633c1**, artifacts/checkpoints/before-finale.zip. Предыдущие отчёты — docs/VERIFICATION_V7.md и более ранние. Release artifacts/hod-vremeni.zip / KARpOV.zip и checkpoints/latest.zip / previous.zip финально обновить после завершения и коммитов. Не включать .git, .tools, node_modules, .codex, .aws, .env и настройки аккаунтов.

Официальный remotion-dev/skills → remotion-best-practices **4.0.540** установлен глобально в /home/nolimetrus/.codex/skills/remotion-best-practices. Отдельный Remotion-проект/MP4 не запрошены; сайт сохраняет текущий стек. Глобальный skill не входит в ZIP проекта.

Карточка — локальная памятка, не заказ. Гравировка — визуальная примерка. Модели и звук — художественная механическая иллюстрация, не инженерная симуляция серийного калибра.
