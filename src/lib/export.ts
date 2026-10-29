import type { BrandConfig } from '../types';
import { asset } from '../data';
import { loadImage } from '../render/images';
import type { Stage } from '../render/stage';

/** Full-resolution render with the brand watermark in the bottom-right corner. */
export async function composeResult(stage: Stage, brand: BrandConfig, caption: string, maxWidth = 1600): Promise<HTMLCanvasElement> {
  const c = stage.renderFull(maxWidth);
  const ctx = c.getContext('2d')!;
  await document.fonts?.ready;
  const u = c.width / 1600;
  const pad = 28 * u;
  const logo = await loadImage(asset(brand.logo)).catch(() => null);
  const display = getComputedStyle(document.documentElement).getPropertyValue('--font-display') || 'serif';
  const body = getComputedStyle(document.documentElement).getPropertyValue('--font-body') || 'sans-serif';
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 8 * u;
  ctx.fillStyle = 'rgba(242,242,242,0.92)';
  ctx.font = `${Math.round(30 * u)}px ${display}`;
  const x = c.width - pad;
  ctx.fillText(brand.texts.watermark, x, c.height - pad - 30 * u);
  ctx.font = `${Math.round(22 * u)}px ${body}`;
  ctx.fillStyle = 'rgba(242,242,242,0.72)';
  ctx.fillText(caption, x, c.height - pad);
  if (logo) {
    const s = 58 * u;
    const tw = Math.max(ctx.measureText(caption).width, (() => {
      ctx.font = `${Math.round(30 * u)}px ${display}`;
      return ctx.measureText(brand.texts.watermark).width;
    })());
    ctx.globalAlpha = 0.95;
    ctx.drawImage(logo, x - tw - s - 16 * u, c.height - pad - s + 4 * u, s, s);
  }
  ctx.restore();
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось сохранить изображение'))), type, quality));
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** JPEG preview for the lead, stepped down until it fits into 300 KB. */
export async function leadPreview(stage: Stage): Promise<Blob | null> {
  try {
    for (const [w, q] of [[1280, 0.82], [1024, 0.78], [800, 0.72], [640, 0.65]] as const) {
      const b = await canvasToBlob(stage.renderFull(w), 'image/jpeg', q);
      if (b.size <= 300 * 1024) return b;
    }
  } catch {
    /* preview is optional */
  }
  return null;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareResult(file: File | null, title: string, text: string, url: string): Promise<ShareResult> {
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text: `${text}\n${url}` });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
