import { expect, test, type Page } from '@playwright/test';
import { readFileSync, statSync, mkdirSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('tests/fixtures/own-car.json', 'utf8')) as {
  width: number;
  height: number;
  wheels: { x: number; y: number; r: number }[];
};
const SHOTS = 'docs/screenshots';
mkdirSync(SHOTS, { recursive: true });

/** Fails the test on any console error or uncaught exception. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Records deep links instead of opening Telegram. */
async function stubWindowOpen(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url: string) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
}

const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `${SHOTS}/${project}-${name}.png`, fullPage: false });

test('start → car → 3 wheels → PNG → lead form → thanks', async ({ page }, info) => {
  const errors = watchConsole(page);
  await stubWindowOpen(page);
  const p = info.project.name;

  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Примерьте диски');
  await expect(page.getByText('Загрузить фото')).toBeVisible();
  await page.waitForTimeout(900); // hero rim turn-in
  await shot(page, '01-home', p);

  await page.getByRole('link', { name: 'Выбрать из галереи' }).click();
  await expect(page.getByRole('heading', { name: 'Новый клиент' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'В гараже' })).toBeVisible();
  const cars = page.locator('[data-car]');
  expect(await cars.count()).toBeGreaterThanOrEqual(6);
  await shot(page, '02-cars', p);

  await cars.nth(2).click();
  await expect(page).toHaveURL(/#\/fit\?car=crossover-silver/);
  const cards = page.locator('#grid [data-wheel]');
  await expect(cards.first()).toBeVisible();
  // let wheel images preload, like a user looking at the first result
  await page.waitForFunction(() => (window.__swapMs?.length ?? 0) >= 1);
  await page.waitForTimeout(1500);

  // three wheels in a row; each swap must reach the canvas in < 150 ms
  const names: string[] = [];
  for (const i of [1, 3, 5]) {
    const card = cards.nth(i);
    const name = (await card.locator('.wc-name').textContent())!.trim();
    names.push(name);
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.wheel-name').first()).toHaveText(name);
    await page.waitForTimeout(260);
  }
  // quick strip over the stage (reference: №01…№10 row)
  const strip = page.locator('#strip [data-wheel]');
  expect(await strip.count()).toBeGreaterThan(3);
  await strip.nth(0).click();
  await expect(strip.nth(0)).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(260);
  await cards.nth(5).click();
  await page.waitForTimeout(260);
  const swaps = await page.evaluate(() => window.__swapMs!.slice(1));
  console.log(`[${p}] swap → first frame, ms:`, swaps);
  expect(swaps.length).toBe(5);
  for (const ms of swaps) expect(ms).toBeLessThan(150);
  await shot(page, '03-fit', p);

  // shortlist + "on your car" previews
  await page.locator('#t-pick').click();
  await expect(page.locator('#t-pick')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('radio', { name: 'На машине' }).click();
  await expect(page.locator('.wc-preview canvas').first()).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, '03b-catalog-on-car', p);
  await page.getByRole('radio', { name: 'Диски', exact: true }).click();

  // filters: diameter, style, sort by price
  await page.getByRole('radio', { name: 'R22' }).click();
  await expect(page.locator('#found')).toContainText('R22');
  const r22 = await page.locator('#grid [data-wheel]').count();
  expect(r22).toBeGreaterThan(0);
  await page.locator('#filters summary').click();
  await page.locator('[data-group="style"] .chip', { hasText: 'Многоспицевые' }).click();
  await expect(page.locator('#grid [data-wheel]')).toHaveCount(1);
  await page.locator('[data-group="style"] .chip', { hasText: 'Все' }).click();
  await page.getByRole('radio', { name: 'R19' }).click();
  await page.locator('#f-sort').selectOption('asc');
  const prices = await page.locator('.wc-price').allTextContents();
  const nums = prices.map((t) => Number(t.replace(/\D/g, '')));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
  await page.locator('#f-sort').selectOption('rank');
  await page.locator('#filters summary').click();

  await page.locator('#grid [data-wheel]', { hasText: names[2] }).click();
  await expect(page.locator('.wheel-name').first()).toHaveText(names[2]);

  // before / after
  await page.locator('#t-compare').click();
  const knob = page.getByRole('slider', { name: /до и после/ });
  await expect(knob).toBeVisible();
  await knob.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(knob).toHaveAttribute('aria-valuenow', '48');
  await page.waitForTimeout(200);
  await shot(page, '04-compare', p);
  await page.locator('#t-compare').click();

  // PNG with watermark
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#a-png').click()]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const file = `test-results/${p}-${download.suggestedFilename()}`;
  await download.saveAs(file);
  expect(statSync(file).size).toBeGreaterThan(80_000);

  // lead form
  await page.getByRole('link', { name: 'Хочу такие' }).click();
  await expect(page.getByRole('heading', { name: 'Заявка на диски' })).toBeVisible();
  await page.getByRole('button', { name: 'Отправить заявку' }).click();
  await expect(page.locator('#e-name')).toBeVisible();
  await expect(page.locator('#e-phone')).toBeVisible();
  await page.getByLabel('Имя').fill('Марк');
  await page.getByLabel('Телефон').pressSequentially('9001234567');
  await expect(page.getByLabel('Телефон')).toHaveValue('+7 (900) 123-45-67');
  await page.getByLabel(/Марка и модель/).fill('Kia Sportage');
  await page.waitForTimeout(300);
  await shot(page, '05-lead', p);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Отправить заявку' }).click();

  await expect(page).toHaveURL(/#\/thanks/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Марк');
  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  expect(opened).toHaveLength(1);
  const text = decodeURIComponent(opened[0]);
  expect(opened[0]).toMatch(/^https:\/\/t\.me\/share\/url\?/);
  expect(text).toContain('Телефон: +7 (900) 123-45-67');
  expect(text).toContain(`Диски: ${names[2]}, R19`);
  expect(text).toContain('Подборка:');
  await expect(page.getByRole('link', { name: 'Примерить другие' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Написать в Telegram/ })).toHaveAttribute('href', /t\.me/);
  await shot(page, '06-thanks', p);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('own photo: upload → mark wheels by drag and pinch → fit', async ({ page }, info) => {
  const errors = watchConsole(page);
  const p = info.project.name;
  await page.goto('./');
  await page.locator('#home-photo').setInputFiles('tests/fixtures/own-car.jpg');
  await expect(page.getByRole('heading', { name: 'Отметьте колёса' })).toBeVisible();
  const canvas = page.locator('.markup-canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const k = box.width / fixture.width;
  const toScreen = (x: number, y: number) => ({ x: box.x + x * k, y: box.y + y * k });

  // initial guess positions (MarkupEditor.guess)
  const r0 = Math.min(fixture.width * 0.085, fixture.height * 0.16);
  const gy = Math.min(fixture.height - r0 * 1.1, fixture.height * 0.7);
  const guesses = [
    { x: fixture.width * 0.23, y: gy },
    { x: fixture.width * 0.77, y: gy },
  ];
  for (let i = 0; i < 2; i++) {
    const from = toScreen(guesses[i].x, guesses[i].y);
    const to = toScreen(fixture.wheels[i].x, fixture.wheels[i].y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }

  // pinch on the active (front) circle: two pointers moving apart → bigger circle
  const sizeBefore = Number(await page.locator('#mk-size').inputValue());
  await page.evaluate(
    ([cx, cy]) => {
      const c = document.querySelector('.markup-canvas')!;
      const fire = (type: string, id: number, x: number, y: number) =>
        c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', isPrimary: id === 1, bubbles: true }));
      fire('pointerdown', 1, cx - 20, cy);
      fire('pointerdown', 2, cx + 20, cy);
      for (let s = 1; s <= 5; s++) fire('pointermove', 2, cx + 20 + s * 4, cy);
      fire('pointerup', 2, cx + 40, cy);
      fire('pointerup', 1, cx - 20, cy);
    },
    [toScreen(fixture.wheels[1].x, fixture.wheels[1].y).x, toScreen(fixture.wheels[1].x, fixture.wheels[1].y).y],
  );
  const sizeAfter = Number(await page.locator('#mk-size').inputValue());
  expect(sizeAfter).toBeGreaterThan(sizeBefore);

  // set exact sizes with the slider for both wheels (tyre radius = 100 px in the fixture)
  for (const i of [0, 1]) {
    await page.locator(`[data-spot="${i}"]`).click();
    await page.evaluate((r) => {
      const min = Math.min(1300, 700) * 0.03;
      const max = Math.min(1300, 700) * 0.45;
      const el = document.querySelector<HTMLInputElement>('#mk-size')!;
      el.value = String(((r - min) / (max - min)) * 100);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, fixture.wheels[i].r);
  }
  await page.waitForTimeout(200);
  await shot(page, '07-markup', p);

  await page.getByRole('button', { name: 'Примерить диски' }).click();
  await expect(page).toHaveURL(/#\/fit\?car=own/);
  await page.waitForFunction(() => (window.__swapMs?.length ?? 0) >= 1);
  await page.locator('#grid [data-wheel]').nth(2).click();
  await page.waitForTimeout(400);
  await shot(page, '08-own-fit', p);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('brand switch through config only', async ({ page }, info) => {
  const errors = watchConsole(page);
  await page.goto('./?brand=kolesa');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Подберите диски по фото');
  await expect(page.locator('.brand span')).toHaveText('Колёса Лаб');
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(accent.toLowerCase()).toBe('#1e56c8');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(238, 240, 242)');
  await page.waitForTimeout(900);
  await shot(page, '09-brand-kolesa', info.project.name);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('lead via Worker: JSON with JPEG preview ≤ 300 KB', async ({ page }) => {
  const errors = watchConsole(page);
  await page.route('**/config/brand.json', async (route) => {
    const res = await route.fetch();
    const brand = await res.json();
    brand.leads.workerUrl = 'https://leads.example/lead';
    await route.fulfill({ response: res, json: brand });
  });
  let sent: Record<string, unknown> | null = null;
  await page.route('https://leads.example/lead', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('./#/fit?car=suv-navy&wheel=apex-forged-f6&d=21');
  await page.waitForFunction(() => (window.__swapMs?.length ?? 0) >= 1);
  await page.getByRole('link', { name: 'Хочу такие' }).click();
  await page.getByLabel('Имя').fill('Ирина');
  await page.getByLabel('Телефон').fill('89161234567');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Отправить заявку' }).click();
  await expect(page).toHaveURL(/#\/thanks\?via=bot/);
  expect(sent).not.toBeNull();
  const s = sent as unknown as { name: string; phone: string; wheel: string; diameter: number; image: string };
  expect(s.name).toBe('Ирина');
  expect(s.phone).toBe('+7 (916) 123-45-67');
  expect(s.wheel).toBe('APEX Forged F6');
  expect(s.diameter).toBe(21);
  const bytes = Buffer.from(s.image, 'base64');
  expect(bytes[0]).toBe(0xff); // JPEG magic
  expect(bytes.length).toBeLessThanOrEqual(300 * 1024);
  console.log(`[worker lead] preview ${Math.round(bytes.length / 1024)} KB`);
  expect(errors, errors.join('\n')).toEqual([]);
});
