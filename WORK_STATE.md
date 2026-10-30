# В работе: крупнее часы, плавнее движение, три живые 3D-сцены

Последний запрос реализован в коде, выполняется финальный QA. База до изменения: Git53ffa43 и artifacts/checkpoints/before-live-scenes.zip. Не начинать проект заново и не переносить старые55/7результаты.

- Biggerintro1.04desktop/1.0mobile, canvasleft26%, +20.35%projectedheightdesktop1440 относительноv5. Phoneintroduplicatefactскрыт, часы сохраняютчитаемость.
- Holds raw0–.06,.25–.30,.51–.56,.75–.80,.96–1; transitionquintic + LINEARcameraYawperpose убираютdouble-acceleration. Full423°/407°сохранён; Lenis.085. PublicnavigateTo плавно1.5–2.4s, отменяетсявводом/новойнавигацией. Appподключён.
- WatchScene повторноневычисляет47TRS/не рисует187k треугольников внутриhold, еслиposeиcameraужеpainted иничегонепереходит/неinvalidated. Обновляеттолькоrawmetadata. LabelsdefaultoffнеполучаютлишнихDOMwrites.
- Триживыеoriginalproceduralmodels balance/crown/geartrain вCollectionPage. ОдинижнийsharedWebGLRenderer/canvas, lazyIO+GSAPticker, stopoffscreen/hidden, reducedstatic,contextrestore. Budgets11128/12420/15344tri,17/16/38calls. Canvasпереноситсямеждуhost,matchingWebPfallbackизтехжемоделей.
- ГлавныйGLBнеизменён:5324520B/187898tri/47groups/restTRS. Исходник+distSHAодинаковые.
- Unit60/60:docs/evidence/unit-live-scenes.json. Buildpassed:./assets/index-l-D7L3YA.js. Proofbuild-live-scenes.json.
- ИзолированныйbrowserQAнижнегоменеджерапрошёл, включаядвижение/idle/offscreen/reduced/contextlossrestore/unregister: docs/evidence/detail-manager.json. Geometryproof:detail-models.json;posterrecipe:detail-renders.json.
- Rootосмотрел8previewdesktop/mobileкадров в.cache/live-preview (неfinaldeliveryevidence). Главныечасыбольшие,3Dмоделиреальнорендерятся.

Выполняетсяобщийbrowserнабор9сценариев, durablelog.cache/live-browser.log. Первые3passed; итогещёнеизвестен. Нужно завершить этотпрогон, создать26финальныхскриншотов scripts/inspect-commerce.mjs (newoutputdocs/screenshots/live-scenes), обновитьVERIFICATION/этотфайл,упаковать/commit/checkpoint. README/DESIGNпишетsmooth_primary,MODEL/ASSET_SOURCESпишетlive_detail_scenes — rootнеперетиратьдоdone.

Ниже сохранён контекст предыдущей завершённой версии для восстановления.

---
# KARpOV — сайт готов

Последний запрос выполнен: коммерческая презентация карманных часов **KARpOV №01**, пять остановок с характеристиками и дальнейшие разделы с анимацией. Пользователь просит самостоятельную работу без подтверждений и сохранение после выключения.

## Текущая версия

- React / TypeScript / Vite / Three.js + GSAP ScrollTrigger + Lenis. Один raw progress и общий ticker; без второго render follower.
- Реальные плато в src/animation/storyTimeline.ts:raw0–.10→pose0; .22–.34→.22; .47–.59→.46; .72–.84→.75; .94–1→1. Переходы quintic, прокрутка документа не блокируется.
- Пять остановок: облик, корпус, циферблат, механизм, целое. Камера согласована с предметом характеристик; yaw desktop−18/40/338/385/405°, mobile−12/32/338/378/395° на пяти pose-ключах. Полный оборот 423°/407° сохранён. Макро 54–96% относится к pose, не raw.
- Ниже: коллекция, материалы, механизм, три исполнения, спецификация и footer. Редакционные изображения и SVG-анимации дополняют живую 3D-сцену.
- Латунь/сталь/графит реально меняют PBR пяти корпусных групп, соответствующие WebP и сведения; localStorage karpov:finish. Выбор применяется до первого кадра. Резервное изображение соответствует отделке.
- Карточка выбора скачивается как .txt локально. Нет фиктивной отправки заказа, оплаты, цен, наличия, водозащиты или запаса хода.
- Native dialog47 деталей, ручное вращение и controls сохранены. PartInfo получает pose progress. Reduced motion — компактный прямой viewer, дальнейшие разделы доступны.
- Бренд KARpOV реально заменён в геометрии циферблата, крышки и платины.44 меша/PBR и все 47restTRS сохранены; manifest byte-identical.

## Проверки — завершены

Production entry: **dist/assets/index-CK0DU8li.js**, CSS index-ZchmsDhd.css. Эта сборка проверена и упакована.

- **55/55 unit**,6 файлов: docs/evidence/unit-karpov.json.
- **7/7 browser в одном полном прогоне**,2workers,0retries/skip: docs/evidence/browser-karpov-summary.json и docs/browser-karpov-full.json. Исторические initial/pre-camera/targeted JSON не подменяют этот прогон.
- **20 production-снимков**1440×1000/390×844:docs/screenshots/karpov, включая пять остановок и пять нижних разделов. Ошибок/console/external/overflow нет. Root осмотрел desktop/mobile, циферблат и крупный механизм. Метрики содержат actualentry.
- Typecheck/build/model verifier прошли. GLB5324520B,187898triangles,136primitives,47groups,95nodes/47meshes/12materials,0externalresources.
- GLB SHA256 dc9ecfc7240aba0ebcd3c8dd3930113e9ca5ff3b072485525eb52eb49cfa3d35. Источник и dist совпадают. Доказательства: docs/evidence/build-karpov.json, karpov-model.json, karpov-renders.json.
- Chrome155 headless / ANGLE SwiftShader и viewport emulation. Не называть это проверкой физического телефона или аппаратногоFPS. Старые WebGL-loss/200%/native-touch сценарииV4 отдельно не перепроверялись; no-JSposter есть, отдельного no-JSQA нет.

## Запуск и восстановление

```bash
cd '/home/nolimetrus/Рабочий стол/3DD'
./start.sh
```

Адрес http://127.0.0.1:4173/. После выключения снова запустить start.sh; файлы, Git и архивы остаются. Desktop-ярлык показывает KARpOV. Без нового запроса не переделывать готовый сайт и не повторять весь цикл QA.

Резервные копии: artifacts/checkpoints/latest.zip и previous.zip. Неизменяемая версия до брендинга: before-karpov.zip и Git ef14d61. Основной коммерческий commit f569b57, responsive-fix7822393, финальный коммит смотрите git log -1. Release: artifacts/hod-vremeni.zip и брендовая копия artifacts/KARpOV.zip. После записи этого файла выполнены финальный commit/package/checkpoint.

При изменениях: npm run build; npm test; npm run verify:model; новые необходимые проверки. Коммерческий QA: npm run test:browser; node scripts/inspect-commerce.mjs. Рендеры: dev5173 + node scripts/render-product.mjs. Сохранение: python3 scripts/package-release.py; python3 scripts/save-checkpoint.py.

Не включать .git/.tools/node_modules/.codex/.aws/.env в архивы. Облачная публикация и Git push не запрошены и не выполнялись.
