# KARpOV — последняя итерация завершена

Последний запрос выполнен: часы крупнее на первом экране, анимации плавнее, ниже три другие живые 3D-модели с анимацией. Пользователь предпочитает автономную работу без подтверждений и просит сохранять результат после выключения.

## Что сейчас работает

- React/TypeScript/Vite/Three.js + GSAPScrollTrigger + Lenis. Сохранены брендKARpOV, коммерческие разделы, 47 основныхгрупп GLB/restTRS, три исполнения и локальное скачивание карточки.
- Openingfill1.04desktop/1.00mobile; canvasleft26%. Проекция главных часов по высоте на 1440×1000 на 20,35%больше v5. Introможет немного выходить за frame; это явное увеличение по запросу. На телефоне убрана дублирующая подпись возле дужки.
- Rawholds:0–.06→pose0; .25–.30→.22; .51–.56→.46; .75–.80→.75; .96–1→1. Переходы длиннее, timelinequintic + yawlinearпоpose исключают двойноеускорение. Full423°/407° и макро 54–96%pose сохранены.
- Lenislerp.085. ScrollCoordinator.navigateTo(value) плавно перемещает к остановке за 1.5–2.4s; ввод или новый переход отменяет passage. Range остаётся прямым. App использует navigateTo вместо instantjump.
- WatchScene не повторяет WebGLdraw/47TRS внутри неподвижногоhold при отсутствии transition/dirtyframe/contextloss. Raw/renderedmetadata обновляются для той же нарисованной позы; framecounter не врёт. Labelsdefaultoff не получают лишних DOMwrites.
- Три живых процедурных исследования: balance(баланс/спираль), crown(головка/вал), geartrain(передача). Один дополнительный sharedrenderer/canvas переносится между видимымиhost. LazyIO+GSAPticker, stopoffscreen/hidden, reducedstatic, contextrestore. ПрозрачныеmatchingWebP — fallback, а не замена активной модели.
- DetailSceneManager.ts/DetailScene.tsx/detailModels.ts управляют нижней 3D. Родительские высоты задаёт karpov.css. Один основной и один дополнительныйrenderer; не создавать ещё поrendererнакаждыйблок.

## Точные проверки этой версии

Productionentry: **dist/assets/index-l-D7L3YA.js**. CSS/хеши в docs/evidence/build-live-scenes.json. Эта версия проверена и упакована.

- **60/60 unit**,6 файлов: docs/evidence/unit-live-scenes.json.
- **9/9 browser в одном полном прогоне**,2workers,0retry/skip/flaky: docs/evidence/browser-live-scenes-summary.json / docs/browser-live-scenes-full.json.
- **8 целевых production-кадров**: первые часы и 3 живыемодели для 1440×1000/390×844, docs/screenshots/live-scenes. В каждом live-кадре ready+active+настоящийcanvas+renderertriangles. Нет errors/console/external/overflow. Root осмотрелdesktop/mobile и все модели.
- Изолированный managerQA дополнительно подтвердил contextrestore/cleanup: docs/evidence/detail-manager.json. Geometry/reverse/dispose:detail-models.json. Matchingposters:detail-renders.json.
- Бюджеты нижнихмоделей:11128/12420/15344tri и 17/16/38calls. Главный GLB НЕменялся:5324520B,187898tri,136primitives,47groups,95nodes/47meshes/12materials. GLB SHA256 dc9ecfc7240aba0ebcd3c8dd3930113e9ca5ff3b072485525eb52eb49cfa3d35; source/dist одинаковы.
- Chrome155 headless / ANGLE SwiftShader и viewportэмуляция. Не заявлять физический телефон или аппаратныйFPS benchmark. Отдельного no-JS прогона нет. Старые 200%/native-touch проверкиV4 не подменяют новую QA.

## Запуск и продолжение

```bash
cd '/home/nolimetrus/Рабочий стол/3DD'
./start.sh
```

Адрес http://127.0.0.1:4173/. После выключения запустить start.sh заново; файлы/Git/архивы остаются. Desktop-ярлык KARpOV. Без нового запроса не менять готовый сайт и не повторять QA.

Полная сборка/модель и история находятся в Git. База до этой итерации 53ffa43 и artifacts/checkpoints/before-live-scenes.zip. Реализация новыхсцен — c018044; финальный commit смотрите git log -1. Release:artifacts/hod-vremeni.zip +брендоваякопия artifacts/KARpOV.zip. Резервы latest.zip/previous.zip. После записи этого файла выполнены finalcommit/package/checkpoint.

Команды: npm run build; npm test; npm run verify:model. Browser: npm run test:browser. Целевые 8 кадров: node scripts/inspect-commerce.mjs --focus. Безfocus можно снять 26 полныхкадров(финально проверены 8 целевых, остальные поведения — browserJSON). Главные renders: scripts/render-product.mjs; proceduralposters: scripts/render-detail-models.mjs; оба требуют локальныйdevVite.

Сохранение: python3 scripts/package-release.py; cp artifacts/hod-vremeni.zip artifacts/KARpOV.zip; python3 scripts/save-checkpoint.py. Не включать.git/.tools/node_modules/.codex/.aws/.env в ZIP. Облако/Gitpush не запрошены и не выполнялись. Карточка выбора не является заказом; оплаты/отправки нет. Модели — авторские механические иллюстрации, не инженерная симуляция серийного калибра.
