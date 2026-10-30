# Проверка fullscreen-версии с GSAP / Lenis

30 октября 2026. Проверена production на http://127.0.0.1:4173/, entry `index-BKcFNLGu.js`. Результаты прежних версий сохранены в [VERIFICATION_V2.md](VERIFICATION_V2.md) и [browser-v3-initial.json](browser-v3-initial.json); они не доказывают готовность этой версии.

## Подтверждено

- **50/50 unit-тестов**,5 файлов: абсолютные позы 47 групп, rest-TRS, обратимость, многоборотные вращения, измеренное кадрирование, макро-подлёт/отъезд, Lenis→GSAPticker→ScrollTrigger, seek, pause, manual handoff, reduced motion, resize/reload и hidden cleanup. [Сырой JSON](evidence/unit-v4.json).
- TypeScript и production build проходят. Vite без предупреждений. Фактические dependencies: gsap3.15.0, lenis1.3.27, three0.186.1. Исходный и собранный GLB имеют одинаковый SHA256. [Сборка](evidence/build-v4.json).
- **20 снимков**:0/25/50/75/100% для 1440×1000,1280×800,390×844,360×800. Все 20 содержат модель; проверено наличие существенной области латунных пикселей, а не только DOM-статуса ready. Ошибок страницы/console, внешних запросов приложения и горизонтального overflow нет. Общие планы вписаны. На 75% корпус намеренно обрезан ради макро, фокус центрального колеса находится в центре canvas. [Метрики](screenshots/cinematic/metrics.json).
- GLB проверен заново через npm run verify:model:47 групп,95 узлов/47 мешей,188570 треугольников,136 примитивов,5345484 байта, без внешних ресурсов. Геометрия во время этой итерации не пересоздавалась.

## Браузерные сценарии — 10 подтверждены

**9 passed /1 failed** в полном прогоне с двумя workers; **1 passed** в целевом повторе после исправления ожидания только в тесте. Это не один полностью зелёный full run. Код приложения и production-сборка между прогонами не менялись. [Машинная сводка](evidence/browser-v4-summary.json), [полный JSON](browser-v4-full.json), [целевой JSON](browser-v4-targeted.json).

Первичная ошибка controlled-503: assertion стартовал в trace на 275104ms, а GLB-fetch начался на 296652ms, через 21,5 секунды подготовки PMREM в SwiftShader. Старое ожидание 15 секунд истекало ещё до запроса. Теперь тест сначала дожидается реального 503 response (лимит 60s), затем проверяет error, компактный fallback, доступность retry и успешную повторную загрузку ровно вторым запросом. Целевой повтор прошёл.

Подтверждены fullscreen на 4 размерах; полный оборот/макро/обратимость/idle; native range/Home/End/Arrow/Space pause/wheel interruption; manual Orbit/slider/document independence/resume/reload; native dialog47 иfocus/Escape; reduced motion иruntime preference; error/retry; WebGL loss/restore/unsupported fallback;200%layout density/keyboard/44px targets; native touch swipe, ручное вращение и необязательные подписи.

Сводка воспроизводится командой `node scripts/summarize-browser-v4.mjs`.

## Среда и ограничения

Chrome155 headless / Playwright1.64.1, Linux. WebGL2 через ANGLE/Vulkan/SwiftShader, DPR1 при съёмке. Это программный renderer, не аппаратный GPU и не проверка физического телефона. Мобильные размеры, touch и 200%layout density проверяются эмуляцией; аппаратныйFPS не заявлен. Шрифты, GLB и окружение локальные. No-JS здесь отдельно не перепроверялся; index.html содержит noscript-пояснение.

Модель — авторская демонстрационная конструкция, не точная инженерная симуляция. Стекло использует экономичную прозрачную примесь без transmission-прохода. Общий GSAP ticker обновляет Lenis; WebGL рисует по требованию и прекращает кадры после остановки. Скрытая вкладка прекращает программный проход, уничтожает Lenis и освобождает его ticker.

## Воспроизведение

```bash
npm run build
npm test -- --reporter=json --outputFile=docs/evidence/unit-v4.json
npm run verify:model
./start.sh
PW_BASE_URL=http://127.0.0.1:4173 npm run test:browser
PW_BASE_URL=http://127.0.0.1:4173 node scripts/inspect-watch.mjs docs/screenshots/cinematic
python3 scripts/package-release.py
python3 scripts/save-checkpoint.py
```

Продолжение — WORK_STATE.md и AGENTS.md. Исходники, модель, локальная Git-история и атомарные latest.zip/previous.zip сохраняются на диске. Облако и Git push не выполнялись.
