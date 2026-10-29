# Примерка дисков — демо для детейлинг-центра

Клиент выбирает машину из гаража или загружает фото своей, листает диски, видит их на машине (Canvas 2D), сравнивает «как было», сохраняет PNG, делится ссылкой и оставляет заявку.

**Демо:** https://romagpt4444.github.io/wheel-fit-demo/
**Второй бренд из того же кода:** https://romagpt4444.github.io/wheel-fit-demo/?brand=kolesa

## Запуск

```bash
npm install
```

```bash
npm run dev
```

Откроется `http://localhost:5173/wheel-fit-demo/`.

| Команда | Что делает |
| --- | --- |
| `npm run build` | проверка типов + сборка в `dist/` |
| `npm run test:e2e` | Playwright: телефон 390 px и десктоп 1440 px, скриншоты в `docs/screenshots/` |
| `npm run test:worker` | тесты воркера заявок |
| `npm run assets` | перегенерировать демо-диски и демо-машины |

## Экраны

1. **Главная:** «Примерьте диски», «Загрузить фото» и «Выбрать из галереи».
2. **Гараж:** «Новый клиент» (загрузка или перетаскивание фото) и «В гараже» (7 машин).
   - **Разметка своего фото:** два круга на шины; перетаскивание, щипок двумя пальцами, колесо мыши или ползунок; «Ракурс» для съёмки под углом.
3. **Каталог (примерка):**
   - сцена гаража;
   - лента `№01…№12`;
   - «Как было», «Крупно», «В подборку»;
   - фильтры R16–R22, стиль, цвет, цена; сортировка по цене;
   - режим «Диски / На машине»;
   - характеристики и цена за 1 и за 4 шт.;
   - «Хочу такие», «Сохранить PNG», «Поделиться».
4. **Заявка:** имя, телефон с маской, авто (необязательно), согласие на обработку данных.
5. **Спасибо:** «Примерить другие», «Написать в Telegram».

## Новый клиент за 15 минут

Всё, что относится к клиенту, лежит в `public/` и меняется без правок кода.

1. **`public/config/brand.json`:**
   - название и логотип (`public/assets/brand/…svg`);
   - цвета: фон, поверхности, текст, акцент, цвет суппорта;
   - шрифты (`fonts.css` — путь к своему CSS с `@font-face` в `public/fonts/`);
   - контакты и тексты главной/благодарности, водяной знак;
   - `leads`: адрес воркера или канал deep link (`telegram` / `whatsapp`).
2. **Диски:** для каждого фото запустить `scripts/prepare-wheel.py` и добавить запись в `public/data/wheels.json`:

   ```bash
   python3 scripts/prepare-wheel.py photo.jpg --id client-wheel-1
   ```

   Поля записи: `id`, `name`, `style`, `color`, `material`, `pcd`, `diameters: { "19": { width, et, price, stock } }`, `image`, `thumb`, `rank`.
3. **Машины:** фото сбоку в `public/assets/cars/` и запись в `public/data/cars.json` с разметкой колёс: `wheels: [{ x, y, r }]` в пикселях фото, где `r` — радиус шины. Координаты удобно снять в самой примерке: загрузить фото, разметить и посмотреть результат.
4. **Проверка без замены основного:** положить конфиг как `public/config/brand.<имя>.json` и открыть `?brand=<имя>`.

Пример второго бренда (светлая тема, синий акцент, WhatsApp): `public/config/brand.kolesa.json`.

### prepare-wheel.py

Установка rembg (один раз):

```bash
python3 -m venv .venv-wheels && .venv-wheels/bin/pip install "rembg[cpu]" pillow
```

Обработка фото диска:

```bash
.venv-wheels/bin/python scripts/prepare-wheel.py photo.jpg --id my-wheel
```

Флаг `--no-rembg` подходит для фото на ровном фоне. Флаг `--tighten 0.95` нужен, если в кадр попала шина. При первом запуске rembg скачивает модель `u2net` (около 170 МБ).

## Заявки в Telegram (Cloudflare Worker)

```bash
cd worker
```

```bash
npx wrangler deploy
```

```bash
npx wrangler secret put TG_BOT_TOKEN
```

```bash
npx wrangler secret put TG_CHAT_ID
```

`ALLOWED_ORIGINS` в `worker/wrangler.toml` — адрес сайта клиента. Адрес воркера (`https://wheel-fit-leads.<аккаунт>.workers.dev/lead`) вписать в `brand.json → leads.workerUrl`. Пока поле пустое, заявка уходит deep link'ом: Telegram открывается с готовым текстом.

## Деплой

Каждый push в `main` собирает и публикует сайт на GitHub Pages: `.github/workflows/deploy.yml`. Для другого хостинга соберите с базовым путём:

```bash
BASE=/ npm run build
```

## Структура

```
public/config/brand*.json   бренд клиента
public/data/wheels.json     каталог дисков + rimToTireRatio
public/data/cars.json       машины и разметка колёс
src/render/stage.ts         Canvas-компоновщик: диск, тормоз, тени, отражение, кроссфейд, до/после, зум
src/render/markup.ts        разметка колёс на своём фото (Pointer Events)
src/screens/*.ts            экраны
scripts/                    генераторы демо-ассетов, prepare-wheel.py
worker/                     Cloudflare Worker для заявок
tests/e2e.spec.ts           Playwright
```

Решения и компромиссы: [DECISIONS.md](DECISIONS.md). Видео-референс: [REFERENCE-NOTES.md](REFERENCE-NOTES.md).
