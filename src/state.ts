import type { AppData, Car, Wheel, WheelSize } from './types';

export type Sort = 'rank' | 'asc' | 'desc';

export interface Filters {
  style: string;
  color: string;
  maxPrice: number;
  sort: Sort;
}

export interface UserPhoto {
  car: Car;
  img: CanvasImageSource;
}

interface State {
  data: AppData;
  carId: string | null;
  user: UserPhoto | null;
  wheelId: string;
  diameter: number;
  filters: Filters;
  lead: { name: string; phone: string; car: string };
  lastLeadLink: string | null;
  /** shortlisted fittings, "wheelId@diameter" */
  picks: string[];
  catalogView: 'wheels' | 'car';
}

const PICKS_KEY = 'wheel-fit:picks';
function readPicks(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PICKS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 30) : [];
  } catch {
    return [];
  }
}

export function togglePick(wheelId: string, d: number): boolean {
  const key = `${wheelId}@${d}`;
  const i = state.picks.indexOf(key);
  if (i >= 0) state.picks.splice(i, 1);
  else state.picks.push(key);
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify(state.picks));
  } catch {
    /* private mode: keep in memory */
  }
  return i < 0;
}

export function isPicked(wheelId: string, d: number): boolean {
  return state.picks.includes(`${wheelId}@${d}`);
}

export function picksText(): string[] {
  return state.picks
    .map((k) => {
      const [id, d] = k.split('@');
      const w = wheelById(id);
      return w ? `${w.name} R${d}` : '';
    })
    .filter(Boolean);
}

/** Catalogue number like the price list: №01, №02… */
export function num(w: Wheel): string {
  return '№' + String(w.rank).padStart(2, '0');
}

export const OWN = 'own';
export const DIAMETERS = [16, 17, 18, 19, 20, 21, 22];

export let state: State;

export function initState(data: AppData): void {
  const maxPrice = Math.max(...data.catalog.wheels.flatMap((w) => Object.values(w.diameters).map((s) => s.price)));
  state = {
    data,
    carId: null,
    user: null,
    wheelId: [...data.catalog.wheels].sort((a, b) => a.rank - b.rank)[0].id,
    diameter: 19,
    filters: { style: 'all', color: 'all', maxPrice, sort: 'rank' },
    lead: { name: '', phone: '', car: '' },
    lastLeadLink: null,
    picks: readPicks(),
    catalogView: 'wheels',
  };
}

export function maxCatalogPrice(): number {
  return Math.max(...state.data.catalog.wheels.flatMap((w) => Object.values(w.diameters).map((s) => s.price)));
}

export function currentCar(): Car | null {
  if (state.carId === OWN) return state.user?.car ?? null;
  return state.data.cars.find((c) => c.id === state.carId) ?? null;
}

export function wheelById(id: string): Wheel | undefined {
  return state.data.catalog.wheels.find((w) => w.id === id);
}

export function currentWheel(): Wheel {
  return wheelById(state.wheelId) ?? state.data.catalog.wheels[0];
}

export function sizeOf(w: Wheel, d: number): WheelSize | undefined {
  return w.diameters[String(d)];
}

export function diametersOf(w: Wheel): number[] {
  return Object.keys(w.diameters).map(Number).sort((a, b) => a - b);
}

/** Closest diameter the model is made in. */
export function nearestDiameter(w: Wheel, d: number): number {
  return diametersOf(w).reduce((best, x) => (Math.abs(x - d) < Math.abs(best - d) ? x : best));
}

export function ratioFor(w: Wheel, d: number): number {
  const table = { ...state.data.catalog.rimToTireRatio, ...(w.rimToTireRatio ?? {}) };
  if (table[String(d)]) return table[String(d)];
  // linear fallback between known points
  return Math.max(0.5, Math.min(0.85, 0.62 + (d - 17) * 0.032));
}

export function filteredWheels(): Wheel[] {
  const { style, color, maxPrice, sort } = state.filters;
  const d = state.diameter;
  const list = state.data.catalog.wheels.filter((w) => {
    const s = sizeOf(w, d);
    if (!s) return false;
    if (style !== 'all' && w.style !== style) return false;
    if (color !== 'all' && w.color !== color) return false;
    return s.price <= maxPrice;
  });
  const p = (w: Wheel) => sizeOf(w, d)!.price;
  if (sort === 'asc') list.sort((a, b) => p(a) - p(b));
  else if (sort === 'desc') list.sort((a, b) => p(b) - p(a));
  else list.sort((a, b) => a.rank - b.rank);
  return list;
}

/** URL fragment that restores the fitting (used for sharing). */
export function fitHash(): string {
  const q = new URLSearchParams();
  if (state.carId) q.set('car', state.carId);
  q.set('wheel', state.wheelId);
  q.set('d', String(state.diameter));
  return `#/fit?${q.toString()}`;
}
