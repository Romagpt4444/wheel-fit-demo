import { icon } from '../lib/dom';
import { MarkupEditor } from '../render/markup';
import { go, type ScreenFn } from '../router';
import { OWN, currentWheel, nearestDiameter, ratioFor, state } from '../state';
import { bindPhotoInputs, photoInput, topbar } from './common';

export const markup: ScreenFn = (root) => {
  const user = state.user;
  if (!user) {
    go('cars');
    return;
  }
  const car = user.car;
  root.innerHTML = `
  ${topbar({ back: '#/cars', backLabel: 'К выбору машины' })}
  <main class="page markup">
    <div class="page-head">
      <h1 class="title">Отметьте колёса</h1>
      <p class="muted">Перетащите круги на шины так, чтобы край круга совпал с краем шины. Размер меняйте двумя пальцами, колесом мыши или ползунком.</p>
    </div>
    <div class="markup-canvas-wrap">
      <canvas class="markup-canvas" aria-label="Фото машины с отметками колёс"></canvas>
    </div>
    <div class="markup-controls">
      <div class="segmented" role="radiogroup" aria-label="Какое колесо настраивать">
        <button type="button" role="radio" data-spot="0">Заднее</button>
        <button type="button" role="radio" data-spot="1">Переднее</button>
      </div>
      <label class="field-range">
        <span>Размер круга</span>
        <input type="range" id="mk-size" min="0" max="100" step="0.5">
      </label>
      <label class="field-range">
        <span>Ракурс: вид сбоку или под углом</span>
        <input type="range" id="mk-squash" min="55" max="100" step="1" value="100">
      </label>
    </div>
    <div class="action-bar">
      <label class="btn btn-ghost" for="mk-photo">${icon('camera')}<span>Другое фото</span></label>
      ${photoInput('mk-photo')}
      <button class="btn btn-ghost icon-only" type="button" id="mk-reset" aria-label="Вернуть круги на место">${icon('reset')}</button>
      <button class="btn btn-primary grow" type="button" id="mk-done">${icon('check')}<span>Примерить диски</span></button>
    </div>
  </main>`;

  bindPhotoInputs(root);
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const editor = new MarkupEditor(canvas, user.img, car.width, car.height, car.wheels.map((s) => ({ ...s })));
  editor.accent = state.data.brand.colors.accent;
  const w = currentWheel();
  editor.ratio = ratioFor(w, nearestDiameter(w, state.diameter));
  const size = root.querySelector<HTMLInputElement>('#mk-size')!;
  const squash = root.querySelector<HTMLInputElement>('#mk-squash')!;
  squash.value = String(Math.round((car.wheels[0].sx ?? 1) * 100));
  const segs = [...root.querySelectorAll<HTMLButtonElement>('[data-spot]')];

  const sync = () => {
    const s = editor.spots[editor.active];
    size.value = String(((s.r - editor.minR) / (editor.maxR - editor.minR)) * 100);
    segs.forEach((b, i) => b.setAttribute('aria-checked', String(i === editor.active)));
  };
  editor.onChange = sync;
  sync();

  segs.forEach((b, i) =>
    b.addEventListener('click', () => {
      editor.active = i;
      sync();
      editor.request();
    }),
  );
  size.addEventListener('input', () => editor.setRadius(editor.minR + (Number(size.value) / 100) * (editor.maxR - editor.minR)));
  squash.addEventListener('input', () => editor.setSquash(Number(squash.value) / 100));
  root.querySelector('#mk-reset')!.addEventListener('click', () => {
    editor.reset();
    squash.value = '100';
  });
  root.querySelector('#mk-done')!.addEventListener('click', () => {
    car.wheels = editor.spots.map((s) => ({ ...s }));
    state.carId = OWN;
    go('fit', { car: OWN, wheel: state.wheelId, d: String(state.diameter) });
  });

  return () => editor.destroy();
};
