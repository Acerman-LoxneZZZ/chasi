# Референс Paragon и его адаптация

Запрос пользователя: сохранить свои часы и переделать движение по [видео](https://www.youtube.com/watch?v=g2pG5JeIsv0) и [посту](https://t.me/paragonzone/743), используя Three.js + GSAP ScrollTrigger + Lenis.

Публичный [первый комментарий](https://t.me/chatparagonzone/33258?embed=1&mode=tme) ссылается на [cinematic-scroll](https://github.com/MustBeSimo/web-design-studio/tree/main/skills/cinematic-scroll). Telegram-архив paragon-scroll-site.zip анонимно не получен; точные координаты оригинального проекта неизвестны.

Через YouTube player response получены реальные storyboard-превью видео:320×180, шаг 5 секунд. Это не просмотр ролика в полном разрешении. Рассмотрен проход 04:30–05:10: общий план тёмного механизма, подлёт внутрь кольца, макро зубчатых колёс, проход к освещённой оси и отъезд к разнесённым слоям. Эта смена масштаба стала основой адаптации для часов.

В сайте сохранены латунь, эмаль, синёные стрелки и собственная геометрия. Добавлены полный обход 423°/407° и макро 54–96% с центральным колесом в фокусе. В отличие от общих планов, в макро корпус намеренно выходит за кадр. На телефоне подлёт мягче. Положение всех деталей и камеры вычисляется из одного обратимого progress, без idle drift.

Интеграция следует [официальной документации Lenis](https://github.com/darkroomengineering/lenis#gsap-scrolltrigger): общий GSAP ticker вызывает Lenis.raf в миллисекундах; scroll обновляет [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/). Standalone ScrollTrigger публикует progress без дополнительного scrub-tween, CSS sticky удерживает сцену. Это рабочие зависимости приложения, а не только названия в документации.
