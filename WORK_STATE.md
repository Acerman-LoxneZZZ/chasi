# KARpOV — коммерческий сайт, новая итерация в работе

Последний запрос: добавить точки остановки с характеристиками, продолжить страницу красивыми разделами/анимациями и оформить часы под брендом **KARpOV**. Этот запрос отменяет прежнее ограничение «только часы/одна fullscreen-секция» и старое название.

Предыдущая готовая версия сохранена в Git ef14d61 и неизменяемом архиве artifacts/checkpoints/before-karpov.zip. Не начинать проект заново.

Реализовано:
- Сохранить Three.js + GSAP ScrollTrigger + Lenis и единственный raw progress. Ввести пять настоящих плато позы, с характеристиками и навигацией по этапам.
- Заменить маркировку в реальном Blender/GLB на KARpOV, сохранить 47carrier/restTRS и модель.
- Коммерческая композиция: 3D-презентация → характер коллекции → материалы/механизм → выбор исполнения → спецификация/заключение.
- Реальный выбор корпуса: латунь, сталь, графит; не выдумывать цены, запас хода, водозащиту, наличие или историю бренда. Сохранять конфигурацию локально, без фиктивной отправки заказа.
- Рендеры для редакционных разделов из настоящей модели; основная сцена остаётся живой 3D.

Код и модель реализованы. Production entry: index-CNBY7Zpe.js; CSS index-ZchmsDhd.css. Свежие unit:54/54,6 файлов, docs/evidence/unit-karpov.json. Branded GLB:5324520B/187898tri/136primitives/47groups; manifest byte-identical, proof docs/evidence/karpov-model.json. 5WebP из GLB: docs/evidence/karpov-renders.json.

Первый browser-прогон:5passed/2failed (docs/browser-karpov-initial.json). Найден реальный overflow material-rule при resize1440→390: GSAP сохранял origin633.6px; исправлен явным from-origin0px0px иCSS0 0. Второй fail — quaternion ULPS~3e-16; тест использует1e-12. Также fallback теперь соответствуетfinish, PartInfo получаетpose-progress.

Выполняются повторные 7 browser-сценариев (2workers), журнал .cache/karpov-browser-final.log; первый сценарий остановок passed. Продукт заморожен на указанной сборке. Параллельно scripts/inspect-commerce.mjs снимает 20production desktop/mobile кадров в docs/screenshots/karpov/, журнал .cache/karpov-shots-final.log (production-кадры переснимаются после исправления). Dev-preview20 кадров уже безerrors/overflow, rootосмотрелhero/materials/selection. Итог новогоbrowserпрогона пока неизвестен. Не переноситьv4 результаты.

README/DESIGN/MODEL обновлены. Нужно получитьbrowser/shotрезультаты, исправить реальныеfailuresеслиесть, финализироватьVERIFICATION/WORK_STATE, собратьархивыиGitcheckpoint.

Запуск: ./start.sh → http://127.0.0.1:4173/. Dev5173 при необходимости. После выключения файлы/Git/архивы остаются. Без облачной публикации и Git push. Пользователь просит самостоятельную работу без подтверждений.

Восстановление: git log/status, этот файл и AGENTS.md. Checkpoint: python3 scripts/save-checkpoint.py. Release: python3 scripts/package-release.py. Не включать.git/.tools/node_modules/.codex/.aws/.env.

Предыдущая проверенная модель:47 групп/188570 треугольников/136 примитивов/5345484B; при ребрендинге текста метрики могут немного измениться. Исторические отчёты: docs/evidence/browser-v4-summary.json и docs/VERIFICATION.md (временно ещё о v4).
