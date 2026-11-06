# KARpOV — задержки прокрутки, 6 ноября 2026

Production preview: **http://127.0.0.1:4174/**. Текущая сборка — **assets/index-CbxnG-Tl.js**, CSS **index-DEfI_tuW.css**. [Хеши сборки и исходников](evidence/build-scroll-performance.json). Базовая версия — 8c6768d / Dovk9NqQ.

## Причины и изменения

1. В DetailSceneManager обновление scroll выставляло dirty=true и обходило проверку frameInterval. Режим 30 Hz при перегрузке переставал ограничивать отрисовку именно во время прокрутки. Теперь dirty сохраняется до разрешённого кадра, который берёт самый свежий progress.
2. Прежняя оценка стоимости renderer.render() измеряла отправку команд CPU; асинхронная работа GPU оставалась за ней. GpuTimer получает только уже доступные результаты EXT_disjoint_timer_query_webgl2, без ожидания GPU, с очередью максимум три query и cleanup. Основная сцена также учитывает задержку уже запрошенного RAF, нижняя — реальный cadence своего общего ticker. Idle-паузы читателя не являются образцами нагрузки. DPR основной сцены реагирует раньше.
3. Первый нижний блок синхронно создавал renderer/environment и сразу все три геометрии, затем компилировал новые шейдеры при первом draw. Теперь ближайший контент готовится примерно за viewport, шаги разделены idle-задачами, геометрия создаётся по одной, compileAsync использует настоящее освещение сцены. Расчёт шести граней и blur-проходов нижнего PMREM убран из runtime: лениво загружается точный RGBA16F readback прежнего RoomEnvironment (.07 / 128), `public/lighting/detail-room.bin`, 1 572 864 байт. [Проверка освещения](evidence/detail-lighting.json) сравнила GPU-пиксели металлической сферы при live и восстановленном освещении: **maxPixelDeviation=0**. Первый видимый canvas подключается после компиляции. Async завершения проверяют актуальность renderer и dispose.
4. Мелкие неподвижные Mesh внутри каждого движущегося carrier объединены по материалу. Колёса, спираль и мосты продолжают двигаться независимо; повторяющиеся зубья остаются инстансами. Индексированное переиспользование вершин сохраняется: уменьшение draw calls не увеличивает vertex shader work за счёт разворачивания индексированных колец в triangle soup.
5. sessionStorage синхронно обновлялся при каждом scroll. Теперь последнее положение сохраняется с объединением событий за 250 ms, с немедленным flush на pagehide, hidden и dispose. Reload/restoration остаются точными.
6. Выбор отделки отправлял draw основной тяжёлой сцены даже за экраном. Теперь основной canvas тоже отслеживается IntersectionObserver: невидимые изменения ждут возвращения в viewport и обновляют последнее состояние, в том числе в manual. Первичная заполненная отрисовка для завершения загрузки разрешена один раз. Resize/DPR используют один setDrawingBufferSize, убирая двойной realloc drawing buffer.

| Живая модель | Draw calls до | После | Треугольники до и после |
|---|---:|---:|---:|
| Баланс | 17 | 12 | 11 128 |
| Головка | 16 | 12 | 12 420 |
| Передача | 38 | 24 | 15 344 |

[Проверка batching](evidence/detail-batching.json) сравнивает старый и новый Three.js-код: число индексированных вершин по материалам, world bounds, моменты позиций и нормалей в пяти движущихся прямых/обратных позах. Допуск 1e-6; максимальное отклонение <1e-7. Это численная проверка геометрии, а не замер FPS.

Основной GLB не изменён: 47 carrier, экспортные rest-TRS, 187 898 треугольников, 5 324 520 байт; SHA256 `dc9ecfc7240aba0ebcd3c8dd3930113e9ca5ff3b072485525eb52eb49cfa3d35`. Сохранены два WebGL renderer, один общий нижний canvas на пять слотов и один ленивый нижний GLB, live 3D, прежние камеры/hold/macro, reduced motion и тишина по умолчанию.

## Проверки

- Build/typecheck и verify:model прошли.
- **79/79 unit, 10 файлов:** [JSON](evidence/unit-scroll-performance.json). Новые проверки подтверждают неблокирующее чтение query, ограниченную очередь, disjoint/context loss/отсутствие расширения и объединение storage с точным flush.
- Browser QA текущего entry в работе: **20 сценариев**. Новый сценарий моделирует дорогую отрисовку, после включения fallback снимает инъекцию и проверяет соблюдение частоты при непрерывном scroll, последний pending progress и единственный нижний canvas. Старые результаты не подставляются.
- [Исходный полный wheel-профиль](evidence/scroll-performance-before.json), [полный профиль Bb3XpR_I до остановки невидимого main canvas](evidence/scroll-performance-before-visibility.json) и свежий [целевой профиль трёх procedural сцен CbxnG-Tl](evidence/scroll-performance-after.json). Каждый записывает entry/SHA256, renderer, viewport, RAF, long tasks, long animation frames и метрики сцен. У промежуточного полного профиля нет устойчивого общего выигрыша по RAF: остаются долгие ожидания software GPU и тяжёлый getContext (2.78 s). Свежий целевой протокол подтверждает текущие ресурсы нижних сцен; его длительность не сравнивается с полным протоколом как общий выигрыш FPS. Фиксированный 30 Hz — верхняя граница частоты, а не обещание 30 FPS на SwiftShader. Аппаратные FPS не заявляются.
- До последнего исправления полный browser-прогон Bb3XpR_I дал **18/20**: [исходный JSON](browser-scroll-before-visibility.json). Два перехода не успели дойти до endpoint за 15 s при software WebGL. После остановки скрытых draw и атомарного resize новая сборка проходит весь набор заново; тестовое ожидание endpoint увеличено до 60 s, точность .001, неподвижность поз и остальные проверки сохранены. Время самого clock проверяется unit-тестами. Старые 18/20 не засчитываются новому коду.
- [Промежуточный профиль BKenZUcM](evidence/scroll-performance-intermediate.json) показал работающий fallback DPR .85 и снижение calls, но неодинаковую динамику задержек и оставшийся тяжёлый старт окружения. После него сохранены индексы геометрии и добавлен заранее рассчитанный PMREM. Он не считается проверкой финальной сборки.

## Метод и ограничения

Диагностика выполняется в headless Chrome / ANGLE SwiftShader, 1280×800 DPR1, с настоящими wheel-событиями; viewport и отдельный сценарий перегрузки эмулированы. Длительные GPU-ожидания software WebGL не эквивалентны FPS на компьютере пользователя. Устройство и браузер пользователя не сообщены. Физический телефон и аппаратный GPU/FPS не проверены. Число draw calls и сохранение геометрии сравнимы независимо от GPU; абсолютные времена относятся только к указанному тестовому окружению.

## Воспроизведение

```bash
npm run build
npm test -- --reporter=json --outputFile=docs/evidence/unit-scroll-performance.json
npm run verify:model
PORT=4174 ./start.sh
node scripts/verify-detail-batching.mjs
node scripts/profile-scroll.mjs --software --lower-only --output=docs/evidence/scroll-performance-after.json
PW_BASE_URL=http://127.0.0.1:4174 PLAYWRIGHT_JSON_OUTPUT_NAME=docs/browser-scroll-performance.json npm run test:browser -- --fully-parallel --workers=2 --reporter=list,json
node scripts/inspect-scroll-performance.mjs
node scripts/summarize-scroll-performance.mjs
```

Загрузка GPU/CPU другими программами влияет на тайминги; сравнение профилей запускается последовательно. Ни аппаратные FPS, ни плавность на физическом телефоне не заявляются по этому прогону.
