import { asset } from '../data';
import { esc, icon, toast } from '../lib/dom';
import { fileToImage } from '../render/images';
import { MarkupEditor } from '../render/markup';
import { go } from '../router';
import { OWN, fitHash, state } from '../state';

export function topbar(opts: { back?: string; backLabel?: string; right?: string; tab?: 'garage' | 'catalog' } = {}): string {
  const b = state.data.brand;
  const back = opts.back
    ? `<a class="icon-btn" href="${esc(opts.back)}" aria-label="${esc(opts.backLabel ?? 'Назад')}">${icon('back', 22)}</a>`
    : '';
  return `<header class="topbar">
    ${back}
    <a class="brand" href="#/" aria-label="${esc(b.name)}, на главную">
      <img src="${esc(asset(b.logo))}" alt="" width="28" height="28">
      <span>${esc(b.name)}</span>
    </a>
    ${opts.tab ? tabs(opts.tab) : ''}
    <div class="topbar-right">${opts.right ?? ''}</div>
  </header>`;
}

function tabs(active: 'garage' | 'catalog'): string {
  const catalogHref = state.carId ? fitHash() : '#/cars';
  const a = (key: string, href: string, label: string) =>
    `<a class="tab" href="${esc(href)}"${key === active ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="tabs" aria-label="Разделы">${a('garage', '#/cars', 'Гараж')}${a('catalog', catalogHref, 'Каталог')}</nav>`;
}

/** Hidden file input + label; on choose loads the photo and opens the markup screen. */
export function photoInput(id: string): string {
  return `<input class="visually-hidden" type="file" id="${id}" accept="image/*" data-photo-input>`;
}

export function bindPhotoInputs(root: HTMLElement): void {
  // drag & drop onto any [data-drop] zone
  root.querySelectorAll<HTMLElement>('[data-drop]').forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('is-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) openPhoto(file);
    });
  });
  root.querySelectorAll<HTMLInputElement>('[data-photo-input]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) openPhoto(file);
    });
  });
}

async function openPhoto(file: File): Promise<void> {
  document.body.classList.add('is-busy');
  try {
    const { img, width, height, url } = await fileToImage(file);
    state.user = {
      img,
      car: { id: OWN, name: 'Ваша машина', image: url, width, height, stockDiameter: 17, wheels: MarkupEditor.guess(width, height) },
    };
    state.carId = OWN;
    go('markup');
  } catch (e) {
    toast((e as Error).message);
  } finally {
    document.body.classList.remove('is-busy');
  }
}
