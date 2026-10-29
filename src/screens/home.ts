import { asset } from '../data';
import { esc, icon } from '../lib/dom';
import { loadImage } from '../render/images';
import { Stage } from '../render/stage';
import type { ScreenFn } from '../router';
import { nearestDiameter, ratioFor, state } from '../state';
import { bindPhotoInputs, photoInput, topbar } from './common';

export const home: ScreenFn = (root) => {
  const { brand, cars, catalog } = state.data;
  const car = cars[0];
  const featured = [...catalog.wheels].sort((a, b) => a.rank - b.rank)[1] ?? catalog.wheels[0];
  const c = brand.contacts;

  root.innerHTML = `
  ${topbar()}
  <main class="home">
    <div class="home-copy">
      <h1 class="display">${esc(brand.texts.homeTitle)}</h1>
      <p class="lead">${esc(brand.texts.homeLead)}</p>
      <div class="home-actions">
        <label class="btn btn-primary" for="home-photo">${icon('camera')}<span>Загрузить фото</span></label>
        ${photoInput('home-photo')}
        <a class="btn btn-ghost" href="#/cars">${icon('gallery')}<span>Выбрать из галереи</span></a>
      </div>
    </div>
    <figure class="home-stage">
      <canvas class="stage-canvas" aria-label="${esc(car.name)} с дисками ${esc(featured.name)}" role="img"></canvas>
      <figcaption>${esc(featured.name)}, R${nearestDiameter(featured, 19)} на машине «${esc(car.name)}»</figcaption>
    </figure>
    <footer class="home-foot">
      ${c.address ? `<span>${esc(c.address)}</span>` : ''}
      ${c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : ''}
    </footer>
  </main>`;

  bindPhotoInputs(root);

  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const stage = new Stage(canvas);
  stage.background = brand.colors.stage;
  stage.caliper = brand.colors.caliper;
  let timer = 0;
  Promise.all([loadImage(asset(car.image)), loadImage(asset(featured.image))]).then(([img, rim]) => {
    stage.setScene({ img, width: car.width, height: car.height, spots: car.wheels, floorReflection: car.floorReflection });
    // the one orchestrated moment: stock wheel first, then the APEX rim turns in
    timer = window.setTimeout(() => {
      const d = nearestDiameter(featured, 19);
      stage.setRim({ key: featured.id, img: rim, ratio: ratioFor(featured, d) });
    }, 450);
  });

  return () => {
    clearTimeout(timer);
    stage.destroy();
  };
};
