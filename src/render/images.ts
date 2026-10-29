const cache = new Map<string, Promise<HTMLImageElement>>();

/** Loads and decodes an image once; later calls reuse the same promise. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        img.decode().then(
          () => resolve(img),
          () => resolve(img),
        );
      };
      img.onerror = () => {
        cache.delete(url);
        reject(new Error('Не удалось загрузить изображение'));
      };
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

/** Warm the cache in idle time, a few at a time, without blocking interaction. */
export function preload(urls: string[]): void {
  const queue = [...urls];
  const idle = (cb: () => void) =>
    'requestIdleCallback' in window ? (window as Window).requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 200);
  const next = () => {
    const batch = queue.splice(0, 3);
    if (!batch.length) return;
    Promise.allSettled(batch.map(loadImage)).then(() => idle(next));
  };
  idle(next);
}

/** Reads a user file into a downscaled image (max side 2000px) so the canvas stays fast on phones. */
export async function fileToImage(file: File, maxSide = 2000): Promise<{ img: HTMLImageElement | HTMLCanvasElement; width: number; height: number; url: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Это не изображение. Выберите фото в формате JPG, PNG, HEIC или WebP.');
  const bitmap = await createImageBitmap(file).catch(() => null);
  let w: number;
  let h: number;
  let source: CanvasImageSource;
  if (bitmap) {
    w = bitmap.width;
    h = bitmap.height;
    source = bitmap;
  } else {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url).catch(() => {
      throw new Error('Браузер не смог открыть это фото. Попробуйте JPG или PNG.');
    });
    w = img.naturalWidth;
    h = img.naturalHeight;
    source = img;
  }
  const k = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.round(w * k);
  const ch = Math.round(h * k);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext('2d')!.drawImage(source, 0, 0, cw, ch);
  bitmap?.close();
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Не удалось обработать фото'))), 'image/jpeg', 0.9));
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);
  return { img, width: cw, height: ch, url };
}
