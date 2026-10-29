import type { AppData, BrandConfig, CarCatalog, WheelCatalog } from './types';

const BASE = import.meta.env.BASE_URL;

/** Resolves a path from config (relative to the site root) to a URL. Absolute URLs pass through. */
export function asset(path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return BASE + path.replace(/^\//, '');
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(asset(path), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Не удалось загрузить ${path}: ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Brand switching: config/brand.json by default; ?brand=<name> loads config/brand.<name>.json
 * so a second client can be previewed on the same deploy.
 */
export async function loadData(): Promise<AppData> {
  const params = new URLSearchParams(location.search);
  const brandName = (params.get('brand') || '').replace(/[^a-z0-9-]/gi, '');
  const brandPath = brandName ? `config/brand.${brandName}.json` : 'config/brand.json';
  const [brand, catalog, cars] = await Promise.all([
    getJSON<BrandConfig>(brandPath),
    getJSON<WheelCatalog>('data/wheels.json'),
    getJSON<CarCatalog>('data/cars.json'),
  ]);
  return { brand, catalog, cars: cars.cars };
}

export function applyBrand(brand: BrandConfig): void {
  const c = brand.colors;
  const root = document.documentElement.style;
  root.setProperty('--bg', c.bg);
  root.setProperty('--surface', c.surface);
  root.setProperty('--surface-2', c.surface2);
  root.setProperty('--line', c.line);
  root.setProperty('--text', c.text);
  root.setProperty('--text-2', c.textMuted);
  root.setProperty('--accent', c.accent);
  root.setProperty('--accent-ink', c.accentInk);
  root.setProperty('--stage', c.stage);
  root.setProperty('--font-display', brand.fonts.display);
  root.setProperty('--font-body', brand.fonts.body);
  if (brand.fonts.css) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = asset(brand.fonts.css);
    document.head.appendChild(link);
  }
  document.title = `Примерка дисков — ${brand.name}`;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', c.bg));
}
