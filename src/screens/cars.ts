import { asset } from '../data';
import { esc, icon } from '../lib/dom';
import { go, type ScreenFn } from '../router';
import { OWN, state } from '../state';
import { bindPhotoInputs, photoInput, topbar } from './common';

/** «Гараж»: new client's photo (drop zone) + cars already in the garage. */
export const cars: ScreenFn = (root) => {
  const list = state.data.cars;
  const own = state.user;
  root.innerHTML = `
  ${topbar({ tab: 'garage' })}
  <main class="page garage">
    <section class="new-client" aria-labelledby="nc-h">
      <h1 class="title" id="nc-h">Новый клиент</h1>
      <label class="dropzone" for="cars-photo" data-drop>
        <span class="dropzone-icon">${icon('upload', 28)}</span>
        <span class="dropzone-title">Загрузите фото машины</span>
        <span class="muted small">Снимите сбоку, чтобы оба колеса были видны целиком. JPG, PNG или HEIC; можно перетащить файл сюда</span>
      </label>
      ${photoInput('cars-photo')}
    </section>
    <section aria-labelledby="g-h">
      <h2 class="section-title" id="g-h">В гараже</h2>
      <ul class="car-grid" role="list">
        ${
          own
            ? `<li><button class="car-card" type="button" data-car="${OWN}">
            <img src="${esc(own.car.image)}" alt="" width="480" height="270" decoding="async">
            <span class="car-name">${esc(own.car.name)}</span>
            <span class="muted small">Ваше фото, колёса отмечены</span>
          </button></li>`
            : ''
        }
        ${list
          .map(
            (c) => `<li>
          <button class="car-card" type="button" data-car="${esc(c.id)}">
            <picture>
              ${c.thumb ? `<source type="image/avif" srcset="${esc(asset(c.thumb + '.avif'))}"><source type="image/webp" srcset="${esc(asset(c.thumb + '.webp'))}">` : ''}
              <img src="${esc(asset(c.thumb ? c.thumb + '.webp' : c.image))}" alt="" width="480" height="270" loading="lazy" decoding="async">
            </picture>
            <span class="car-name">${esc(c.name)}</span>
            ${c.paint ? `<span class="muted small">${esc(c.paint)}</span>` : ''}
          </button>
        </li>`,
          )
          .join('')}
      </ul>
    </section>
  </main>`;

  bindPhotoInputs(root);
  root.querySelectorAll<HTMLButtonElement>('[data-car]').forEach((b) =>
    b.addEventListener('click', () => {
      state.carId = b.dataset.car!;
      go('fit', { car: state.carId, wheel: state.wheelId, d: String(state.diameter) });
    }),
  );
};
