# KARpOV — исправление задержек прокрутки, 6 ноября 2026

Текущий запрос: при появлении шестерёнок и ниже по странице скролл дёргается. Исправления реализованы, QA объединённого кода завершён. Не начинать проект заново. Устройство пользователя не уточнено, физический телефон и аппаратный GPU/FPS не проверялись.

## Текущая точка

- Preview: **http://127.0.0.1:4174/**, работает. Порт 4173 — другой проект, не трогать.
- Production entry **assets/index-CGOHlaLR.js**, CSS **index-DEfI_tuW.css**. Точные хеши входных исходников, тестов, assets и модели: `docs/evidence/build-scroll-performance.json`.
- Собственные commits: **a09e6b1**, **2aad262**. После fetch найдены upstream **8ba44de / ab278ec**: они сохраняют корректный финал после поздних изменений layout, Windows-скрипты и их старый QA. Эти изменения объединены без удаления оптимизации в merge-коммите **6fd242c**.
- Build/typecheck и **79/79 unit** (10 файлов) прошли на объединённом коде: `docs/evidence/unit-scroll-performance.json`. Свежий полный browser-набор: **20/20 одним запуском, 1 worker, 16,7 минуты, без retry/skip/flaky**, `docs/browser-scroll-performance.json`. Строгая `docs/evidence/scroll-performance-summary.json` сверила реальные entry/SHA, исходники, тесты, assets, модель, освещение и 6 PNG. Результаты других entry не переносились.
- `scripts/profile-scroll.mjs --software --lower-only` и `scripts/inspect-scroll-performance.mjs` завершены последовательно для CGOHlaLR, без JS-ошибок. Сняты и визуально проверены 6 кадров: 1280×800 DPR1 / 390×844 DPR2, reduced-motion статичная поза. Ожидает presentation через 3 RAF и проверяет реальные золотистые пиксели внутри 3D host; один draw-call счётчик не доказывает непустой снимок. Метрики содержат entry/SHA и PNG hash.

## Реализованные исправления

- В нижнем renderer dirty=true от ScrollTrigger раньше обходил frameInterval. Теперь cap действует и во время прокрутки, pending progress сохраняется до следующего разрешённого кадра. Последняя точная поза не теряется.
- GpuTimer читает только готовые EXT_disjoint_timer_query_webgl2 результаты без ожидания GPU; очередь максимум три query, cleanup/disjoint/context loss. CPU-only время renderer.render() дополнено GPU/каденсом и задержкой уже запрошенного RAF; DPR реагирует раньше. Слабый режим нижней сцены — .85 / cap 30 Hz, это не обещание 30 FPS.
- Ближайшие нижние модели создаются по одной в idle-задачах, compileAsync использует настоящее освещение. Один нижний renderer/canvas и один ленивый нижний GLB сохранены.
- Нижний PMREM вынесен из runtime: локальный `public/lighting/detail-room.bin`, прежний RoomEnvironment .07 / 128, lossless RGBA16F CubeUV, 1 572 864 байт. `scripts/bake-detail-environment.mjs` воспроизводит файл; металлическая сфера live/baked имеет **maxPixelDeviation=0**: `docs/evidence/detail-lighting.json`.
- Статические части объединены по материалу только внутри прежних анимируемых carrier, индексы и InstancedMesh сохранены. Calls balance **17→12**, crown **16→12**, geartrain **38→24**; треугольники **11128 / 12420 / 15344** неизменны. `docs/evidence/detail-batching.json`: 5 прямых/обратных движущихся поз, world bounds и моменты позиций/нормалей по материалам, максимальное отклонение <1e-7.
- Основной WatchScene теперь прекращает draw вне viewport. Изменения исполнения/надписи дорисовываются при возвращении, в том числе в manual. Первичная заполненная отрисовка для завершения load разрешена один раз. Resize/DPR используют атомарный setDrawingBufferSize без двойного realloc.
- sessionStorage объединяет scroll-события за 250 ms, flush немедленный на pagehide/hidden/dispose; точное восстановление сохранено.
- Сохранён upstream ResizeObserver body/fonts и один отложенный refresh нижних ScrollTrigger с cleanup; тест финала добавляет 137 px перед ним.

## Инварианты

React / TypeScript / Vite / императивный Three.js + GSAP ScrollTrigger + Lenis. Один общий clock Lenis/ScrollTrigger, без второго progress-follower. На странице **две** WebGL-системы: WatchScene и один нижний canvas на balance/crown/geartrain/engraving/assembly. Активные сцены — настоящая 3D-геометрия. Один общий нижний GLB для крышки/финала, текст следует back_cover. Lazy visibility, reduced-motion cleanup, retry/context restore и тишина по умолчанию сохраняются.

Основной GLB не менялся: **47 групп**, экспортные rest-TRS, **5 324 520 байт / 187 898 треугольников / 136 primitives**. SHA256 `dc9ecfc7240aba0ebcd3c8dd3930113e9ca5ff3b072485525eb52eb49cfa3d35`. Intro fill 1.13 / FOV30, небольшое обрезание разрешено. Raw hold: 0–.06→0, .25–.30→.22, .51–.56→.46, .75–.80→.75, .96–1→1. Макро **54–96% pose** намеренно может обрезать корпус; constant-fit не возвращать. 42 s просмотра идут через настоящий scroll. Коммерческий бренд KARpOV и дальнейшие разделы сохранены.

## История и сохранённые черновики

- Первоначальный локальный Dovk9NqQ и незавершённые старые WIP не выдаются за текущую сборку. Локальный контекст до merge — `docs/WORK_STATE_PERFORMANCE_PREMERGE.md`; исходное состояние сохранено в `artifacts/checkpoints/before-scroll-performance.zip`.
- Upstream BDwMm0TQ имел 74/74, 19/19 и 56 кадров на другом устройстве (Windows / software Chrome); исторический контекст — `docs/WORK_STATE_FINALE_2026_11_02.md`, отчёт — `docs/VERIFICATION.md`. Это не проверка нового кода.
- Bb3XpR_I дал 18/20, два endpoint не достигнуты за 15 s при software WebGL: `docs/browser-scroll-before-visibility.json`, build/profile перед visibility отдельно. Ожидание endpoint в новых тестах 60 s без изменения точности .001; duration clock проверяется unit-тестами. CbxnG-Tl после visibility имел частичный прерванный прогон; полным QA не считается.
- Промежуточные профили BKenZUcM / Bb3XpR_I / CbxnG-Tl сохранены с собственными entry. Абсолютные software-тайминги разных протоколов не сравнивать как аппаратный FPS. Даже после оптимизации SwiftShader имеет длительные GPU-ожидания.
- До текущего запроса были изменены `scripts/inspect-personalization.mjs`, `scripts/summarize-finale.mjs` и неотслеживаемые finale-отчёты/PNG. Они сохранены в `artifacts/premerge-finale-wip/` и Git stash `Preserve original finale WIP before merging origin main`. После merge рабочие изменения двух scripts восстановлены из `scripts.patch`; они остаются незакоммиченными, как в начале задачи. Новейшие upstream PNG старыми не заменялись. Stash не удалять.

## Сохранение и запуск

QA завершён, исходники приложения **6fd242c** / entry **CGOHlaLR**. Новый performance-сценарий подтвердил cap при синтетической перегрузке; скрытый выбор отделки не вызывает main draw; upstream late-layout регрессия прошла. Сводка и все исходные отчёты сохранены. Итоговые QA/PNG зафиксированы в **9cec51d** и успешно отправлены в **origin/main Acerman-LoxneZZZ/chasi** вместе с кодом и merge, без force. Служебное обновление этого состояния сохраняется следующим коммитом. Release ZIP и checkpoint обновляются после него. Облачный deploy не запрошен.

Запуск: `PORT=4174 ./start.sh`. Сервер оставлен на 4174. После исходников нужен `npm run build`; текущая сборка уже совпадает с проверенными хешами. Release ZIP: `artifacts/hod-vremeni.zip` / `KARpOV.zip`; checkpoint: `artifacts/checkpoints/latest.zip` / `previous.zip`. Исходный baseline этой задачи — `before-scroll-performance.zip`.

Не включать в ZIP .git, .tools, node_modules, .codex, .aws, .env или настройки аккаунтов. Сохранять контрольные точки через `python3 scripts/save-checkpoint.py` после значимых этапов. Запуск: `PORT=4174 ./start.sh`; после исходников нужен build. Текущие проверки — headless Chrome / ANGLE SwiftShader и viewport/touch эмуляция, не физический телефон или аппаратный GPU/FPS.
