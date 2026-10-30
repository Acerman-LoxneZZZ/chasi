# Точка продолжения — «Ход времени»

## Последний запрос и приоритет

Переделать существующий сайт по видео https://www.youtube.com/watch?v=g2pG5JeIsv0 и посту https://t.me/paragonzone/743 на **Three.js + GSAP ScrollTrigger + Lenis**. Пользователь хочет только крупные красивые часы, сильное вращение и плавную прокрутку, без вопросов/подтверждений. Не начинать проект заново. Новый запрос разрешает заменить прежний кастомный scroll-clock и constant-fit камеру.

## Текущее состояние — реализация и проверки завершены

Работа завершена. Версия Three.js + GSAP ScrollTrigger + Lenis реализована и проверена. После сохранения этого файла созданы финальный локальный commit, release ZIP и резервный checkpoint. При новом запуске сначала проверить git log/status и архивы; без новой задачи не переделывать готовый сайт и не повторять весь цикл проверок.

- React / TypeScript / Vite / imperative Three.js сохранены. gsap 3.15.0 и lenis 1.3.27 установлены через npm, lockfile сохранён.
- Только fullscreen сцена: тихий header, «Управление» в native details, каталог всех 47 групп в native dialog. Нижние anatomy/about/journey/footer удалены. Подписи default off.
- Lenis.raf вызывается общим GSAP ticker; ScrollTrigger standalone передаёт единственный progress. CSS sticky держит сцену. Второй render follower удалён. Manual/reduced/hidden уничтожают Lenis, освобождая document scroll; resume синхронизирует позицию.
- Камера делает 423° desktop /407° mobile. По реальным YouTube storyboard-кадрам добавлен dolly:54–72% подлёт к центральному колесу,72–78% макро,78–96% отъезд. Desktop distance36% общего плана / mobile68%. Корпус в макро намеренно выходит из кадра;0/50/100% вписаны целиком. Фокус следует world-position центрального колеса.
- Части используют абсолютные экспортные rest-TRS и quintic easing. Все 47 групп модели сохранены. Новая геометрия не генерировалась.
- Сцена объявляет ready после реального первого кадра с моделью. WebGL рендерится по требованию; DPR адаптируется до.85 desktop/.9 mobile на медленном renderer.
- Последняя production-сборка: `dist/assets/index-BKcFNLGu.js`.
- Browser: все 10 сценариев подтверждены — 9 в полном прогоне, 1 в целевом повторе после исправления ожидания 503 только в тесте; не выдавать за один зелёный full run. Продукт между прогонами не менялся. docs/evidence/browser-v4-summary.json, docs/browser-v4-full.json, docs/browser-v4-targeted.json.
- Unit: 50/50 passed, 5 файлов, docs/evidence/unit-v4.json; включает 16 coordinator-тестов с mocks Lenis/GSAP. Модель проверена заново, SHA исходной/собранной совпадает.
- Сняты 20 новых production-кадров в docs/screenshots/cinematic/: ошибок/внешних запросов/overflow нет, общие планы вписаны, макро-фокус в центре. Проверено наличие модели во всех 20 PNG; desktop/mobile макро осмотрены. docs/VERIFICATION.md содержит актуальные результаты и ограничения.

## Модель и история

GLB:47 групп,95 узлов/47 мешей,188570 треугольников,136 примитивов,12PBRматериалов,5345484 байта.
SHA256 GLB: e7a922c003ce0215e01d37544be733e4a905e002be46456ef90e5d228ebe87ef.
Модель и Blender исходник уже детализированы во второй итерации; генератор изолирует свои материалы и сохраняет чужие объекты.

Завершённая версия до fullscreen:716fe47. Полноэкранный WIP до GSAP:8a7258e. Реализация нового движения:7803fbc; unit/снимки:d7239a8. Финальный коммит смотрите через git log -1. Старые отчёты в docs/VERIFICATION_V2.md и docs/evidence/browser-v2-summary.json — только история.

## Запуск и проверки

```bash
cd '/home/nolimetrus/Рабочий стол/3DD'
./start.sh
```

Адрес http://127.0.0.1:4173/. После выключения запустить снова; файлы, коммиты и ZIP сохраняются на диске. Не пушить и не публиковать в облако без запроса.

```bash
npm run build
npm test -- --reporter=json --outputFile=docs/evidence/unit-v4.json
npm run verify:model
PW_BASE_URL=http://127.0.0.1:4173 npm run test:browser
PW_BASE_URL=http://127.0.0.1:4173 node scripts/inspect-watch.mjs docs/screenshots/cinematic
python3 scripts/package-release.py
python3 scripts/save-checkpoint.py
```

## Восстановление и ограничения проверки

- Локальная история: git log -5 --oneline.
- Последний backup: artifacts/checkpoints/latest.zip; предыдущий: previous.zip.
- Архив передачи: artifacts/hod-vremeni.zip. При изменениях документации обновить через package-release.py и save-checkpoint.py.
- Не включать .git/.tools/node_modules/.codex/.aws/.env в архивы.
- Headless Chrome + ANGLE SwiftShader и touch/viewport emulation не доказывают FPS аппаратного GPU или работу физического телефона.
- Публичный пост прочитан; реальные превью видео 320×180 получены из YouTube storyboard, маршрут 04:30–05:10 рассмотрен. Точные координаты оригинала не получены; это адаптация для часов. Кэш .cache/reference не часть release.
