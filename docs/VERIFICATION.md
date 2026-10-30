# KARpOV — больше, плавнее, дополнительные живые 3D-сцены

30 октября 2026. Проверена production-сборка http://127.0.0.1:4173/ — entry `index-l-D7L3YA.js`. Предыдущий полный отчёт сохранён в [VERIFICATION_V5.md](VERIFICATION_V5.md); его результаты не подменяют этот прогон.

## Изменения

- Первые часы крупнее: openingfill1.04desktop/1.00mobile, canvasleft26%. Проекция по вертикали на 1440×1000 увеличена на 20,35% относительноv5 при том же GLB. Небольшой выход intro за границы намеренный; следующие общие планы снова вписаны. На телефоне убрано дублирование подписи№01 возле дужки.
- Переходы между пятью выдержками длиннее. Timeline остаётся quintic, yaw линейный поpose: исключено повторное ускорение одной траектории. Lenislerp.085. Переход по точкамnavigateTo занимает 1.5–2.4s, отменяется wheel/touch/key/новой навигацией. Native range остаётся прямым. Без второго progress-follower или второго Lenis.
- При неизменной позе наhold основной viewer повторно не вычисляет 47TRS и не рисует 187898 треугольников. Проверка учитывает загрузку, pendingframe, camera-transition, contextloss, resize, материалы и подписи; metadata rawprogress остаётся точной.
- В нижних разделах теперь живые оригинальные 3D-модели баланса со спиралью, заводной головки и колёсной передачи. Один дополнительный WebGLRenderer/canvas переносится между видимыми host. GSAPticker, lazyIO, выключение вне экрана/в скрытой вкладке, reducedstatic, восстановление контекста. Совпадающие прозрачные WebP — резерв, а не замена активной сцены.

## Результат

- **60/60 unit**,6 файлов: mapping/holds/C2 границы, уменьшение пикового ускорения камеры, framing, полная обратимость/423°–407°, ownership/resize/reload, navigateTo и прерывание. [Сырой JSON](evidence/unit-live-scenes.json).
- **9/9 browser в одном полном прогоне**,2workers, без retries/skip/flaky. [Сводка](evidence/browser-live-scenes-summary.json), [полный JSON](browser-live-scenes-full.json).
- Браузер подтвердил крупный intro, плавный non-instant nav, отсутствие новых WebGL-кадров наhold при измененииraw; manual/resume/reload; desktop/mobile разделы и 44pxцели; реальные PBR-исполнения иlocalStorage; скачивание карточки; reducedmotion;503retry; все 3 новые сцены с ненулевой геометрией и одним sharedcanvas, движение видимых/остановку невидимых; сохранение постеров и коммерческой части при отказе нижнегоWebGL.
- **8 целевых production-кадров**: enlargedintro +3 живыхмодели для 1440×1000 и 390×844. В каждом live-кадре managerready, canvas находится в host, renderer показывает реальные drawcalls/triangles. Ошибок страницы/console, внешних запросов и горизонтального overflow нет. Root визуально осмотрел обе версии первого экрана и все новые модели. [Метрики](screenshots/live-scenes/metrics.json).
- Изолированная проверка менеджера дополнительно подтверждает contextloss→restore и cleanup/unregister. [JSON](evidence/detail-manager.json). Это отдельная проверка того же кода, не 9-й дополнительный полный прогон страницы.
- Три proceduralmodel: balance11128tri/17calls, crown12420/16, geartrain15344/38. [Геометрия и обратимость](evidence/detail-models.json), [точные резервные рендеры](evidence/detail-renders.json).
- TypeScript/Vitebuild проходят; основной GLB не менялся:5324520 байт,47 групп,187898 треугольников,136 примитивов. Исходный иdist SHA256 одинаковы. [Сборка](evidence/build-live-scenes.json).

## Ограничения

Chrome155 headless / Playwright1.64.1, Linux, WebGL2 через ANGLE/Vulkan/SwiftShader. Это программный renderer и viewport-эмуляция, не физический телефон и не аппаратныйFPS benchmark. Аппаратная плавность не измерялась. Старые 200%/native-touch проверкиV4 не объявляются новыми; currentreducedmotion и WebGLfallback проверены указанными сценариями. No-JSposter существует, отдельный no-JSпрогон не выполнялся.

Модели — авторские механические иллюстрации, не инженерная симуляция серийного калибра. Оплата/отправка заказа не добавлялись; «Сохранить выбор» скачивает локальную карточку.

## Воспроизведение

```bash
npm run build
npm test -- --reporter=json --outputFile=docs/evidence/unit-live-scenes.json
./start.sh
PW_BASE_URL=http://127.0.0.1:4173 npm run test:browser -- --fully-parallel --workers=2
PW_BASE_URL=http://127.0.0.1:4173 node scripts/inspect-commerce.mjs --focus
python3 scripts/package-release.py
python3 scripts/save-checkpoint.py
```

Без --focus inspect-commerce может снять 26 полных кадров; финальная целевая серия содержит 8, а остальные сценарии подтверждены browserJSON. Восстановление — WORK_STATE/AGENTS, локальныйGit, latest.zip/previous.zip. База до этой итерации:53ffa43 и before-live-scenes.zip. Облако иGitpush не использовались.
