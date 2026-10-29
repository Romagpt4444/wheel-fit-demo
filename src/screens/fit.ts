import { asset } from '../data';
import { $, esc, icon, price, toast } from '../lib/dom';
import { canvasToBlob, composeResult, download, shareResult } from '../lib/export';
import { loadImage, preload } from '../render/images';
import { Stage } from '../render/stage';
import { go, type ScreenFn } from '../router';
import type { Wheel } from '../types';
import {
  DIAMETERS,
  OWN,
  currentCar,
  currentWheel,
  diametersOf,
  filteredWheels,
  fitHash,
  maxCatalogPrice,
  nearestDiameter,
  ratioFor,
  isPicked,
  num,
  sizeOf,
  state,
  togglePick,
  wheelById,
} from '../state';
import { topbar } from './common';

declare global {
  interface Window {
    __swapMs?: number[];
  }
}

export const fit: ScreenFn = (root, params) => {
  const { brand, catalog } = state.data;
  // restore from URL (shared links)
  const carParam = params.get('car');
  if (carParam) state.carId = carParam;
  const wp = params.get('wheel');
  if (wp && wheelById(wp)) state.wheelId = wp;
  const dp = Number(params.get('d'));
  if (DIAMETERS.includes(dp)) state.diameter = dp;
  if (state.carId === OWN && !state.user) state.carId = null;
  const car = currentCar();
  if (!car) {
    go('cars');
    return;
  }
  const w0 = currentWheel();
  if (!sizeOf(w0, state.diameter)) state.diameter = nearestDiameter(w0, state.diameter);

  const countBy = (d: number) => catalog.wheels.filter((w) => sizeOf(w, d)).length;
  const maxP = maxCatalogPrice();

  root.innerHTML = `
  ${topbar({ tab: 'catalog', right: state.carId === OWN ? `<a class="link-quiet" href="#/markup">Разметка колёс</a>` : '' })}
  <main class="fit">
    <section class="fit-main" aria-label="Примерка">
      <div class="stage-wrap">
        <canvas class="stage-canvas" role="img" aria-label=""></canvas>
        <div class="strip" id="strip" role="radiogroup" aria-label="Быстрый выбор диска"></div>
        <div class="compare" hidden>
          <span class="compare-tag compare-tag-l">До</span>
          <span class="compare-tag compare-tag-r">После</span>
          <div class="compare-line"></div>
          <button class="compare-knob" type="button" role="slider" aria-label="Сравнение: до и после" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><span></span></button>
        </div>
        <div class="stage-tools">
          <button class="chip-btn" type="button" id="t-compare" aria-pressed="false">${icon('compare', 18)}<span>Как было</span></button>
          <button class="chip-btn" type="button" id="t-zoom" aria-pressed="false">${icon('zoomIn', 18)}<span>Крупно</span></button>
          <button class="chip-btn chip-pick" type="button" id="t-pick" aria-pressed="false">${icon('star', 18)}<span>В подборку</span></button>
        </div>
      </div>
      <section class="wheel-info" id="info" aria-live="polite"></section>
    </section>
    <section class="fit-catalog" aria-labelledby="cat-h">
      <div class="cat-head">
        <h1 class="title" id="cat-h">Каталог дисков</h1>
        <div class="segmented seg-sm" role="radiogroup" aria-label="Как показывать каталог">
          <button type="button" role="radio" data-view="wheels">Диски</button>
          <button type="button" role="radio" data-view="car">На машине</button>
        </div>
      </div>
      <div class="diam" role="radiogroup" aria-label="Диаметр">
        ${DIAMETERS.filter((d) => countBy(d) > 0)
          .map((d) => `<button type="button" role="radio" class="chip" data-d="${d}">R${d}</button>`)
          .join('')}
      </div>
      <details class="filters" id="filters">
        <summary>${icon('filters', 18)}<span>Стиль, цвет, цена</span><span class="filters-count" id="f-count"></span></summary>
        <div class="filters-body">
          <fieldset>
            <legend>Стиль</legend>
            <div class="chips" data-group="style">
              <button type="button" class="chip" data-v="all">Все</button>
              ${Object.entries(catalog.styles)
                .filter(([k]) => catalog.wheels.some((w) => w.style === k))
                .map(([k, v]) => `<button type="button" class="chip" data-v="${esc(k)}">${esc(v)}</button>`)
                .join('')}
            </div>
          </fieldset>
          <fieldset>
            <legend>Цвет</legend>
            <div class="chips" data-group="color">
              <button type="button" class="chip" data-v="all">Все</button>
              ${Object.entries(catalog.colors)
                .filter(([k]) => catalog.wheels.some((w) => w.color === k))
                .map(([k, v]) => `<button type="button" class="chip" data-v="${esc(k)}"><i class="swatch" style="background:${esc(v.swatch)}"></i>${esc(v.label)}</button>`)
                .join('')}
            </div>
          </fieldset>
          <label class="field-range">
            <span>Цена за диск: до <b id="f-price-v"></b></span>
            <input type="range" id="f-price" min="40000" max="${maxP}" step="5000">
          </label>
          <label class="field-select">
            <span>Порядок</span>
            <select id="f-sort">
              <option value="rank">Сначала популярные</option>
              <option value="asc">Сначала дешевле</option>
              <option value="desc">Сначала дороже</option>
            </select>
          </label>
          <button type="button" class="btn btn-ghost btn-sm" id="f-reset">Сбросить фильтры</button>
        </div>
      </details>
      <p class="muted small" id="found"></p>
      <ul class="wheel-grid" role="list" id="grid"></ul>
    </section>
  </main>`;

  const canvas = $<HTMLCanvasElement>('canvas', root);
  const stage = new Stage(canvas);
  stage.background = brand.colors.stage;
  stage.caliper = brand.colors.caliper;
  const info = $('#info', root);
  const grid = $('#grid', root);
  const found = $('#found', root);
  const fPrice = $<HTMLInputElement>('#f-price', root);
  const fPriceV = $('#f-price-v', root);
  const fSort = $<HTMLSelectElement>('#f-sort', root);
  const fCount = $('#f-count', root);

  const syncUrl = () => history.replaceState(null, '', fitHash());

  // ---------- rendering ----------
  const renderInfo = () => {
    const w = currentWheel();
    const d = state.diameter;
    const s = sizeOf(w, d)!;
    const color = catalog.colors[w.color]?.label ?? w.color;
    const stock = s.stock > 0 ? `<span class="stock stock-in">${icon('check', 16)}В наличии ${s.stock} шт.</span>` : `<span class="stock">Под заказ, 7–10 дней</span>`;
    info.innerHTML = `
      <div class="info-head">
        <div>
          <h2 class="wheel-name">${esc(w.name)}</h2>
          <p class="muted small">${esc(catalog.styles[w.style] ?? w.style)}, ${esc(color.toLowerCase())}, R${d}</p>
        </div>
        <div class="info-price">
          <span class="price-main">${price(s.price)}<small> за диск</small></span>
          <span class="muted small">${price(s.price * 4)} за комплект из 4</span>
        </div>
      </div>
      ${stock}
      <dl class="specs">
        <div><dt>Диаметр</dt><dd>R${d}</dd></div>
        <div><dt>Ширина</dt><dd>${s.width}J</dd></div>
        <div><dt>Вылет</dt><dd>ET ${s.et}</dd></div>
        <div><dt>Сверловка</dt><dd>${esc(w.pcd.join(', ').replace(/x/g, '×'))}</dd></div>
        <div><dt>Цвет</dt><dd>${esc(color)}</dd></div>
        <div><dt>Материал</dt><dd>${esc(w.material)}</dd></div>
      </dl>
      <p class="muted small sizes">Есть в размерах: ${diametersOf(w).map((x) => `R${x}`).join(', ')}</p>
      <div class="action-bar fit-actions">
        <button class="btn btn-ghost icon-only" type="button" id="a-png" aria-label="Сохранить PNG">${icon('download')}<span class="lbl">Сохранить PNG</span></button>
        <button class="btn btn-ghost icon-only" type="button" id="a-share" aria-label="Поделиться">${icon('share')}<span class="lbl">Поделиться</span></button>
        <a class="btn btn-primary grow" href="#/lead" id="a-lead">Хочу такие</a>
      </div>`;
    $('#a-png', info).addEventListener('click', onPng);
    $('#a-share', info).addEventListener('click', onShare);
    canvas.setAttribute('aria-label', `${car.name}: диски ${w.name} R${d}`);
  };

  const previews = new Map<string, HTMLCanvasElement>();
  const previewKey = (w: Wheel) => `${car.id}|${w.id}|${state.diameter}`;

  const card = (w: Wheel) => {
    const s = sizeOf(w, state.diameter)!;
    const on = w.id === state.wheelId;
    const picked = isPicked(w.id, state.diameter);
    const media =
      state.catalogView === 'car'
        ? `<span class="wc-preview" data-preview="${esc(w.id)}"></span>`
        : `<picture>
        <source type="image/avif" srcset="${esc(asset(w.thumb + '.avif'))}">
        <img src="${esc(asset(w.thumb + '.webp'))}" alt="" width="128" height="128" loading="lazy" decoding="async">
      </picture>`;
    return `<li><button type="button" class="wheel-card${state.catalogView === 'car' ? ' is-car' : ''}" data-wheel="${esc(w.id)}" aria-pressed="${on}">
      ${media}
      <span class="wc-num">${num(w)}${picked ? `<span class="wc-star" aria-label="в подборке">${icon('star', 13)}</span>` : ''}</span>
      <span class="wc-name">${esc(w.name)}</span>
      <span class="wc-spec">R${state.diameter}, ${esc(w.pcd[0].replace('x', '×'))}, ET${s.et}</span>
      <span class="wc-price">${price(s.price)}</span>
      ${s.stock > 0 ? '' : '<span class="wc-meta">под заказ</span>'}
    </button></li>`;
  };

  /** Renders the client's car with every wheel of the list, a few per frame. */
  const fillPreviews = () => {
    if (state.catalogView !== 'car' || !stage.ready) return;
    const slots = [...grid.querySelectorAll<HTMLElement>('[data-preview]')];
    const step = () => {
      const batch = slots.splice(0, 2);
      if (!batch.length) return;
      Promise.all(
        batch.map(async (slot) => {
          const w = wheelById(slot.dataset.preview!)!;
          const key = previewKey(w);
          let c = previews.get(key);
          if (!c) {
            const img = await loadImage(asset(w.image));
            c = stage.renderWith({ key: w.id, img, ratio: ratioFor(w, state.diameter) }, 480);
            previews.set(key, c);
          }
          const copy = c.cloneNode() as HTMLCanvasElement;
          copy.getContext('2d')!.drawImage(c, 0, 0);
          slot.replaceChildren(copy);
        }),
      ).then(() => requestAnimationFrame(step));
    };
    step();
  };

  const stripEl = $('#strip', root);
  const renderStrip = () => {
    const list = filteredWheels();
    stripEl.innerHTML = list
      .map(
        (w) => `<button type="button" role="radio" class="strip-item" data-wheel="${esc(w.id)}" aria-checked="${w.id === state.wheelId}" aria-label="${esc(num(w) + ' ' + w.name)}">
        <img src="${esc(asset(w.thumb + '.webp'))}" alt="" width="56" height="56" decoding="async">
        <span>${num(w)}</span>
      </button>`,
      )
      .join('');
    stripEl.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };

  const syncPick = () => {
    const on = isPicked(state.wheelId, state.diameter);
    const b = $<HTMLButtonElement>('#t-pick', root);
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span')!.textContent = on ? 'В подборке' : 'В подборку';
  };

  const renderCatalog = () => {
    const list = filteredWheels();
    root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === state.catalogView)));
    renderStrip();
    syncPick();
    grid.innerHTML = list.length
      ? list.map(card).join('')
      : `<li class="empty"><p>В R${state.diameter} под эти фильтры дисков нет.</p><button type="button" class="btn btn-ghost btn-sm" data-reset>Сбросить фильтры</button></li>`;
    found.textContent = list.length ? `${list.length} ${plural(list.length, 'модель', 'модели', 'моделей')} в R${state.diameter}` : '';
    root.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.d) === state.diameter)));
    const f = state.filters;
    root.querySelectorAll<HTMLButtonElement>('[data-group] .chip').forEach((b) => {
      const g = (b.parentElement as HTMLElement).dataset.group as 'style' | 'color';
      b.setAttribute('aria-pressed', String(f[g] === b.dataset.v));
    });
    fPrice.value = String(f.maxPrice);
    fPriceV.textContent = price(f.maxPrice);
    fSort.value = f.sort;
    const active = (f.style !== 'all' ? 1 : 0) + (f.color !== 'all' ? 1 : 0) + (f.maxPrice < maxP ? 1 : 0) + (f.sort !== 'rank' ? 1 : 0);
    fCount.textContent = active ? String(active) : '';
    fillPreviews();
  };

  // ---------- actions ----------
  const applyRim = async (animate: boolean) => {
    const w = currentWheel();
    const t0 = performance.now();
    const img = await loadImage(asset(w.image));
    if (w.id !== state.wheelId) return; // user moved on
    stage.onFirstPaint = () => {
      (window.__swapMs ??= []).push(Math.round(performance.now() - t0));
    };
    stage.setRim({ key: w.id, img, ratio: ratioFor(w, state.diameter) }, animate);
  };

  const selectWheel = (id: string) => {
    if (id === state.wheelId) return;
    state.wheelId = id;
    grid.querySelectorAll<HTMLButtonElement>('[data-wheel]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wheel === id)));
    stripEl.querySelectorAll<HTMLButtonElement>('[data-wheel]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.wheel === id)));
    stripEl.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    syncPick();
    applyRim(true);
    renderInfo();
    syncUrl();
  };

  const setDiameter = (d: number) => {
    state.diameter = d;
    if (!sizeOf(currentWheel(), d)) {
      const first = filteredWheels()[0] ?? catalog.wheels.find((w) => sizeOf(w, d));
      if (first) state.wheelId = first.id;
    }
    applyRim(true);
    renderInfo();
    renderCatalog();
    syncUrl();
  };

  const resetFilters = () => {
    state.filters = { style: 'all', color: 'all', maxPrice: maxP, sort: 'rank' };
    renderCatalog();
  };

  const caption = () => `${currentWheel().name}, R${state.diameter}`;
  const fileName = () => `${brand.name}-${currentWheel().id}-R${state.diameter}.png`.toLowerCase().replace(/\s+/g, '-');

  async function onPng(this: HTMLButtonElement) {
    this.disabled = true;
    try {
      const c = await composeResult(stage, brand, caption());
      download(await canvasToBlob(c), fileName());
      toast('Картинка сохранена');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      this.disabled = false;
    }
  }

  async function onShare(this: HTMLButtonElement) {
    this.disabled = true;
    try {
      const c = await composeResult(stage, brand, caption(), 1200);
      const blob = await canvasToBlob(c, 'image/jpeg', 0.88);
      const file = new File([blob], fileName().replace('.png', '.jpg'), { type: 'image/jpeg' });
      const url = state.carId === OWN ? location.href.split('#')[0] : location.href;
      const res = await shareResult(file, brand.name, `Примеряю ${caption()} в ${brand.name}`, url);
      if (res === 'copied') toast('Ссылка на примерку скопирована');
      if (res === 'failed') toast('Не получилось поделиться. Сохраните PNG и отправьте его');
    } finally {
      this.disabled = false;
    }
  }

  // ---------- events ----------
  grid.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLButtonElement>('[data-wheel]');
    if (b) selectWheel(b.dataset.wheel!);
    if (t.closest('[data-reset]')) resetFilters();
  });
  // start the swap on pointerdown: saves ~100 ms on touch screens
  grid.addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-wheel]');
    if (b && e.pointerType !== 'mouse') loadImage(asset(wheelById(b.dataset.wheel!)!.image));
  });
  stripEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-wheel]');
    if (b) selectWheel(b.dataset.wheel!);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      state.catalogView = b.dataset.view as 'wheels' | 'car';
      renderCatalog();
    }),
  );
  $('#t-pick', root).addEventListener('click', () => {
    const added = togglePick(state.wheelId, state.diameter);
    syncPick();
    renderCatalog();
    toast(added ? `${currentWheel().name} R${state.diameter} в подборке` : 'Убрано из подборки');
  });
  root.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.addEventListener('click', () => setDiameter(Number(b.dataset.d))));
  root.querySelectorAll<HTMLElement>('[data-group]').forEach((g) =>
    g.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
      if (!b) return;
      state.filters[g.dataset.group as 'style' | 'color'] = b.dataset.v!;
      renderCatalog();
    }),
  );
  fPrice.addEventListener('input', () => {
    state.filters.maxPrice = Number(fPrice.value);
    renderCatalog();
  });
  fSort.addEventListener('change', () => {
    state.filters.sort = fSort.value as typeof state.filters.sort;
    renderCatalog();
  });
  $('#f-reset', root).addEventListener('click', resetFilters);

  // zoom
  const zoomBtn = $<HTMLButtonElement>('#t-zoom', root);
  zoomBtn.addEventListener('click', () => {
    const on = !stage.isZoomed;
    stage.setZoom(on);
    zoomBtn.setAttribute('aria-pressed', String(on));
    zoomBtn.innerHTML = `${icon(on ? 'zoomOut' : 'zoomIn', 18)}<span>${on ? 'Целиком' : 'Крупно'}</span>`;
  });

  // before / after
  const compare = $('.compare', root);
  const knob = $<HTMLButtonElement>('.compare-knob', root);
  const cmpBtn = $<HTMLButtonElement>('#t-compare', root);
  const setSplit = (v: number) => {
    const x = Math.max(0, Math.min(1, v));
    stage.split = x;
    compare.style.setProperty('--split', String(x));
    knob.setAttribute('aria-valuenow', String(Math.round(x * 100)));
    stage.request();
  };
  cmpBtn.addEventListener('click', () => {
    const on = compare.hidden;
    compare.hidden = !on;
    cmpBtn.setAttribute('aria-pressed', String(on));
    if (on) setSplit(0.5);
    else {
      stage.split = null;
      stage.request();
    }
  });
  let dragging = false;
  const fromEvent = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    setSplit((e.clientX - r.left) / r.width);
  };
  compare.addEventListener('pointerdown', (e) => {
    dragging = true;
    try {
      compare.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    fromEvent(e);
  });
  compare.addEventListener('pointermove', (e) => dragging && fromEvent(e));
  compare.addEventListener('pointerup', () => (dragging = false));
  compare.addEventListener('pointercancel', () => (dragging = false));
  knob.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft') setSplit((stage.split ?? 0.5) - step);
    else if (e.key === 'ArrowRight') setSplit((stage.split ?? 0.5) + step);
    else if (e.key === 'Home') setSplit(0);
    else if (e.key === 'End') setSplit(1);
    else return;
    e.preventDefault();
  });

  // ---------- start ----------
  renderInfo();
  renderCatalog();
  syncUrl();
  const img = state.carId === OWN ? Promise.resolve(state.user!.img) : loadImage(asset(car.image));
  img
    .then((im) => {
      stage.setScene({ img: im, width: car.width, height: car.height, spots: car.wheels, isUserPhoto: state.carId === OWN, floorReflection: car.floorReflection });
      return applyRim(false);
    })
    .then(() => fillPreviews())
    .then(() => preload(catalog.wheels.map((w) => asset(w.image))))
    .catch((e) => toast((e as Error).message));

  return () => stage.destroy();
};

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
