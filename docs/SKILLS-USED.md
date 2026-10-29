# Скиллы, использованные в проекте

Источник: `~/Desktop/SGX Материалы/Скиллы/SGX-скиллы/`. Отбор: роутер `route_skills.py` (3 формулировки задачи) и ручной просмотр каталога по категориям «Дизайн и фронтенд», «Мобильные приложения», «Деплой и инфраструктура», «Тесты и отладка».

Все скиллы скопированы в `./.claude/skills/<имя>/SKILL.md` с исходным frontmatter (`name` + `description`).

## Отобраны и скопированы (10)

| Скилл | Область | Зачем в этом проекте |
| --- | --- | --- |
| `frontend-design` | Дизайн | План токенов (цвет, шрифт, раскладка) до кода, проверка плана на «шаблонность», одна смелая деталь |
| `design-taste-frontend` | Дизайн / лендинги | Анти-слоп чек-лист для посадочных экранов: первый экран, иерархия, тексты |
| `impeccable` | UI | Аудит готового интерфейса: состояния, пустые экраны, ошибки, фокус, контраст |
| `emil-design-eng` | UI / анимации | Решения по движению: кроссфейд диска 200 мс, нажатие 0.98, одна кривая ease-out, прерываемые переходы |
| `mobile-native` | Мобильная вёрстка | Базовый набор: `viewport-fit=cover`, `100dvh`, поля 16px без зума, `touch-action`, safe-area, hover только для мыши |
| `web-design-guidelines` | UI | Финальная сверка с Web Interface Guidelines (доступность, формы, фокус) |
| `web-perf` | Производительность | Бюджет JS ≤ 150 КБ gzip, ленивые WebP/AVIF, Lighthouse |
| `playwright-best-practices` | Тесты | E2E-сценарий, проверка консоли, мобильные жесты, скачивание файла |
| `github-actions-templates` | Деплой | Воркфлоу сборки и публикации на GitHub Pages |
| `workers-best-practices` | Деплой / бэкенд | Cloudflare Worker для заявок в Telegram: секреты в env, валидация, CORS, лимиты |

## Активно применены на этапе разработки (5, по правилу PROMPT.md)

1. `frontend-design`: план токенов и проверка на дефолтность в `docs/DESIGN.md`.
2. `mobile-native`: базовые мета-теги и CSS в `index.html` и `src/styles/base.css`.
3. `emil-design-eng`: тайминги и кривые в `src/styles/tokens.css` и `src/render/compositor.ts`.
4. `playwright-best-practices`: `tests/e2e.spec.ts`.
5. `github-actions-templates`: `.github/workflows/deploy.yml`.

Остальные пять использованы как чек-листы на проверке (`impeccable`, `web-design-guidelines`, `web-perf`) и при написании воркера (`workers-best-practices`), а `design-taste-frontend` при выборе текстов первого экрана.

## Прочие материалы SGX

См. `docs/SGX-INVENTORY.md`: запретный список агента `lera` и чек-лист 152-ФЗ.

## Видео-референс

См. `REFERENCE-NOTES.md`: подходящего видео на рабочем столе нет.
