# Проверка fullscreen-версии с GSAP / Lenis

30 октября 2026. Проверяется production на http://127.0.0.1:4173/, entry `index-BKcFNLGu.js`. Результаты прежних версий сохранены в [VERIFICATION_V2.md](VERIFICATION_V2.md) и [browser-v3-initial.json](browser-v3-initial.json); они не доказывают готовность этой версии.

## Подтверждено

- **50/50 unit-тестов**,5 файлов: абсолютные позы 47 групп, rest-TRS, обратимость, многоборотные вращения, измеренное кадрирование, макро-подлёт/отъезд, Lenis→GSAPticker→ScrollTrigger, seek, pause, manual handoff, reduced motion, resize/reload и hidden cleanup. [Сырой JSON](evidence/unit-v4.json).
- TypeScript и production build проходят. Vite без предупреждений. Фактические dependencies: gsap3.15.0, lenis1.3.27, three0.186.1. Исходный и собранный GLB имеют одинаковый SHA256. [Сборка](evidence/build-v4.json).
- **20 снимков**:0/25/50/75/100% для 1440×1000,1280×800,390×844,360×800. Все 20 содержат модель; проверено наличие существенной области латунных пикселей, а не только DOM-статуса ready. Ошибок страницы/console, внешних запросов приложения и горизонтального overflow нет. Общие планы вписаны. На 75% корпус намеренно обрезан ради макро, фокус центрального колеса находится в центре canvas. [Метрики](screenshots/cinematic/metrics.json).
- GLB проверен заново через npm run verify:model:47 групп,95 узлов/47 мешей,188570 треугольников,136 примитивов,5345484 байта, без внешних ресурсов. Геометрия во время этой итерации не пересоздавалась.

## Браузерные сценарии — выполняются

Полный набор из 10 сценариев повторно запущен на указанной production-сборке с двумя workers; журнал .cache/browser-v4.log. Предыдущий прогон подтвердил первые 3 в console, но перезапуск управляющего сервера потерял итоговый канал и JSON. Не считать остальные пройденными до получения отчёта.

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
