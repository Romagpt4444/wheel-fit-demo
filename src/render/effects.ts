import type { WheelSpot } from '../types';

export interface SpotLight {
  /** brightness multiplier for the rim, 0.75…1.25 */
  brightness: number;
  /** average tyre colour, used to paint over the stock rim */
  tyre: [number, number, number];
}

const LREF = 0.2; // average luminance of a wheel area in the demo studio shots

/**
 * Samples the photo around a wheel: overall luminance (to match rim brightness ±25%)
 * and the tyre sidewall colour (ring 0.84…0.96 r).
 */
export function measureSpot(img: CanvasImageSource, spot: WheelSpot): SpotLight {
  const N = 48;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const sx = spot.sx ?? 1;
  const rw = spot.r * sx;
  ctx.drawImage(img, spot.x - rw * 1.4, spot.y - spot.r * 1.4, rw * 2.8, spot.r * 2.8, 0, 0, N, N);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, N, N).data;
  } catch {
    return { brightness: 1, tyre: [28, 28, 30] };
  }
  let lum = 0;
  let lumN = 0;
  const ty = [0, 0, 0];
  let tyN = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dx = (i + 0.5) / N - 0.5;
      const dy = (j + 0.5) / N - 0.5;
      const d = Math.hypot(dx, dy) * 2.8; // in units of r
      const k = (j * N + i) * 4;
      const r = data[k], g = data[k + 1], b = data[k + 2];
      if (d < 1.0) {
        lum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        lumN++;
      }
      if (d > 0.84 && d < 0.96) {
        ty[0] += r;
        ty[1] += g;
        ty[2] += b;
        tyN++;
      }
    }
  }
  const L = lumN ? lum / lumN : LREF;
  const brightness = Math.max(0.75, Math.min(1.25, 1 + (L - LREF) * 1.6));
  const tyre: [number, number, number] = tyN ? [ty[0] / tyN, ty[1] / tyN, ty[2] / tyN].map((v) => Math.min(70, v)) as [number, number, number] : [28, 28, 30];
  return { brightness, tyre };
}

let noiseCanvas: HTMLCanvasElement | null = null;
function noise(): HTMLCanvasElement {
  if (noiseCanvas) return noiseCanvas;
  const n = 128;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const v = Math.random() * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseCanvas = c;
  return c;
}

const spriteCache = new Map<string, HTMLCanvasElement>();

/**
 * Pre-composites a rim at a given pixel size with photo-matching effects:
 * brightness ±25 %, top arch occlusion shadow, film grain. Cached by key.
 */
export function rimSprite(key: string, img: HTMLImageElement, size: number, brightness: number, grain: number): HTMLCanvasElement {
  const s = Math.max(32, Math.min(1024, Math.ceil(size / 32) * 32));
  const k = `${key}|${s}|${brightness.toFixed(2)}|${grain}`;
  const hit = spriteCache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, s, s);
  ctx.globalCompositeOperation = 'source-atop';
  if (brightness < 1) {
    ctx.fillStyle = `rgba(0,0,0,${(1 - brightness).toFixed(3)})`;
    ctx.fillRect(0, 0, s, s);
  } else if (brightness > 1) {
    ctx.fillStyle = `rgba(255,255,255,${((brightness - 1) * 0.55).toFixed(3)})`;
    ctx.fillRect(0, 0, s, s);
  }
  // light comes from above: the arch shades the upper part of the rim
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, 'rgba(0,0,0,0.26)');
  g.addColorStop(0.42, 'rgba(0,0,0,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  if (grain > 0) {
    ctx.globalAlpha = grain;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(noise(), 'repeat')!;
    ctx.fillRect(0, 0, s, s);
    ctx.globalAlpha = 1;
    // overlay paints outside the rim as well: cut back to the rim alpha
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (spriteCache.size > 80) spriteCache.delete(spriteCache.keys().next().value!);
  spriteCache.set(k, c);
  return c;
}
