# KARpOV — полноэкранная кинематографическая история завершена

Последний запрос выполнен: полное погружение, сначала только большие часы, свободный экран во время анимации, плавный обход/приближение камеры и просмотр как ролика. По дополнительному запросу установлен официальный Remotion skill. Пользователь предпочитает самостоятельную работу без лишних вопросов. Без нового запроса готовый сайт не менять и QA не повторять.

## GitHub

Последним сообщением пользователь явно попросил запушить изменения. Все 14 локальных коммитов сайта и проверок, до **3c9cfef**, успешно отправлены в **origin/main**: https://github.com/Acerman-LoxneZZZ/chasi. Fetch перед push подтвердил отсутствие расхождения веток; force push не использовался. Последующий коммит обновляет только журнал и документацию. Сайт продолжает работать локально на 4174; облачный деплой не запрашивался.

Пользователь также попросил предложить дальнейшее дополнение. Приоритетная идея: финальная плавная сборка часов выбранного исполнения перед подписью KARpOV. Дополнительные идеи: примерка гравировки и тихий звук механизма по явному включению. Эти предложения пока не реализовывать без нового запроса.

## Текущая версия

- React / TypeScript / Vite / императивный Three.js, GSAP ScrollTrigger + Lenis. Модель и 47 основных групп / экспортные rest-TRS сохранены. GLB не менялся; активный 3D не заменён изображением или видео.
- Главный canvas занимает весь viewport на desktop и mobile. Прежние left 26% / top 230px убраны. Первый кадр — только часы по центру. Opening fill 1.13, FOV 30°. Небольшая обрезка intro намеренна; общие остановки вписаны. По высоте проекции intro больше V6 на 8.7% desktop 1440×1000 и 12.1% при эмуляции 390×844; границы включают намеренную обрезку.
- Пять raw hold сохранены: 0–.06 → pose 0; .25–.30 → .22; .51–.56 → .46; .75–.80 → .75; .96–1 → 1. В intro и четырёх пролётах нет подписи. Характеристики появляются только внутри остальных hold, на тёмной подложке.
- cinematicEase: мягкий разгон, равномерный пролёт, торможение; пик скорости 1.25 средней вместо 1.875 у прежней quintic, то есть на треть ниже при той же длине перехода. Это математика, не FPS. Абсолютность, C2, обратимость и неподвижность hold проверены. Обход 423° desktop / 407° mobile и macro 54–96% POSE сохранены; не возвращать constant-fit во время macro.
- Lenis lerp .075, один общий GSAP ticker / ScrollTrigger canonical raw progress. Навигация 2.4–8.5s. «Смотреть историю» проходит весь путь за 42s через настоящий scroll; продолжение занимает пропорционально меньше. Пауза мышью, wheel/touch/key/range, новая навигация и скрытая вкладка прерывают проход. Второго progress-follower нет.
- Меню по умолчанию скрыто в story. Мышь у верхнего/нижнего края, tap или Tab вызывают его. Над управлением оно остаётся видимым; после ухода указателя исчезает через 2.8s. Wheel/свайп убирают его сразу. Во время playback можно вызвать меню и нажать паузу. Popover и keyboard focus сохраняют доступ. Tap истории больше не выбирает случайный узел: picking работает только в manual.
- Сохранены бренд KARpOV, коммерческие разделы, три исполнения PBR, localStorage и скачивание карточки. Нижние balance/crown/geartrain — живые procedural 3D с одним дополнительным shared renderer/canvas, lazy visibility, offscreen/hidden stop, reduced static и cleanup. Не создавать renderer на каждый блок и не заменять активные модели картинками.

## Фактические проверки этой сборки

Production entry: **dist/assets/index-BdpAQHkG.js**. Основной source commit: **560d116** (первый этап 44ae2be). Точные хеши JS/CSS/исходников и GLB: docs/evidence/build-immersive.json. Финальный документационный commit см. git log -1.

- **63/63 unit**, 6 файлов: docs/evidence/unit-immersive.json.
- **13/13 browser в одном полном прогоне**, 2 workers, 0 retry / skip / flaky: docs/browser-immersive-full.json и docs/evidence/browser-immersive-summary.json. Каждый сценарий записал фактически загруженный entry. Проверены чистая сцена/меню/Tab, четыре пролёта, неподвижные hold и отсутствие лишнего draw, playback/mouse pause/wheel/Escape, CDP touch swipe, manual/resume/reload, реальные PBR-исполнения, карточка, reduced motion, 503/retry, три нижних live-сцены/один canvas/stop offscreen, matching fallback и main WebGL loss/restore.
- **36 свежих production-кадров**, 1440×1000 / 1280×800 / 390×844 / 360×800. В каждом размере intro, 4 пролёта, 4 остановки. docs/screenshots/immersive/metrics.json подтверждает entry и SHA, full viewport canvas, hidden header/dock, caption только на hold, отсутствие page/console errors, внешних запросов и horizontal overflow. Основные кадры всех четырёх размеров просмотрены. Source model triangles и rendered triangles различаются при frustum culling в macro; это не удаление геометрии.
- Строгая сводка воспроизводится через node scripts/summarize-immersive.mjs: проверяет один полный green run, 13 entry, 63 unit, 36 кадров, их хеши и кадрирование остановок. Impeccable detect финального UI: docs/evidence/ui-immersive.json (`[]`).
- npm run build / npm run verify:model проходят. GLB: 5 324 520 B, 187 898 triangles, 136 primitives, 95 nodes / 47 meshes, 47 groups. Source/dist идентичны, SHA256 dc9ecfc7240aba0ebcd3c8dd3930113e9ca5ff3b072485525eb52eb49cfa3d35.
- Метод: headless Chrome / ANGLE SwiftShader, viewport и CDP touch эмуляция. Это не физический телефон и не замер аппаратного GPU/FPS. Новых отдельных browser zoom 200% / no-JS прогонов нет. Подробности — docs/VERIFICATION.md; предыдущая версия — VERIFICATION_V6.md.

## Запуск после выключения

```bash
cd '/home/nolimetrus/Рабочий стол/Karpov_Watch'
PORT=4174 ./start.sh
```

Текущий сайт: **http://127.0.0.1:4174/**. Порт 4173 занят другим проектом; его не останавливать. Не использовать устаревший путь /3DD. После выключения исходники/Git/ZIP сохраняются, сервер запускается заново. После изменения исходников выполнить npm run build перед preview.

## Навык Remotion

Официальный remotion-dev/skills → remotion-best-practices **4.0.540** установлен через skill-installer в `/home/nolimetrus/.codex/skills/remotion-best-practices`. Он доступен со следующего сообщения пользователя. Сайт сохраняет утверждённый стек; отдельный Remotion-видеопроект и MP4 не запрашивались.

## Локальное сохранение

Релиз: artifacts/hod-vremeni.zip и брендовая копия artifacts/KARpOV.zip. Резервы: artifacts/checkpoints/latest.zip / previous.zip. После записи этого состояния выполнены финальный локальный Git-коммит, packaging и checkpoint. Исходная версия до этой итерации — b490e00, первая реализация — 44ae2be, управление — 560d116.

Команды: npm run build; npm test; npm run verify:model; PW_BASE_URL=http://127.0.0.1:4174 npm run test:browser -- --fully-parallel --workers=2. Кадры: node scripts/inspect-immersive.mjs. Не переносить результаты предыдущих entry на новый код.

Сохранение: python3 scripts/package-release.py; cp artifacts/hod-vremeni.zip artifacts/KARpOV.zip; python3 scripts/save-checkpoint.py. ZIP не содержит .git / .tools / node_modules / .codex / .aws / .env и настроек аккаунтов. Git push выполнен по отдельному запросу, см. раздел GitHub. Облачная публикация сайта не выполнялась.

Карточка выбора не является заказом, оплата и отправка отсутствуют. Модели — авторские механические иллюстрации, не инженерная симуляция серийного калибра.
