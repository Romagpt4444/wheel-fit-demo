import type { WheelSpot } from '../types';
import { measureSpot, rimSprite, type SpotLight } from './effects';

export interface Scene {
  img: CanvasImageSource;
  width: number;
  height: number;
  spots: WheelSpot[];
  /** user photos get a bit more grain to match phone-camera noise */
  isUserPhoto?: boolean;
  floorReflection?: boolean;
}

export interface RimState {
  key: string;
  img: HTMLImageElement;
  /** rim radius as a share of the tyre radius (rimToTireRatio) */
  ratio: number;
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FADE_MS = 200;
const TURN = (-15 * Math.PI) / 180;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Canvas 2D compositor: photo + painted-over stock rim + brake + new rim with
 * shadow, brightness match and grain; cross-fade with a 15° turn on change;
 * before/after split; zoom to the front wheel.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scene: Scene | null = null;
  private lights: SpotLight[] = [];
  private rim: RimState | null = null;
  private prevRim: RimState | null = null;
  private fadeStart = 0;
  private raf = 0;
  private view: View = { x: 0, y: 0, w: 1, h: 1 };
  private viewFrom: View | null = null;
  private viewTo: View | null = null;
  private viewStart = 0;
  private zoomed = false;
  /** share of the canvas width (0…1) that shows the original photo; null = no comparison */
  split: number | null = null;
  caliper = '#34373c';
  background = '#0e0f12';
  private ro: ResizeObserver;
  onFirstPaint?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
  }

  destroy(): void {
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
  }

  setScene(scene: Scene): void {
    this.scene = scene;
    this.lights = scene.spots.map((s) => measureSpot(scene.img, s));
    this.view = this.zoomed ? this.zoomView() : this.fullView();
    this.canvas.style.aspectRatio = `${scene.width} / ${scene.height}`;
    this.resize();
  }

  /** Sets the rim. With animate, the old rim fades out while the new one turns in 15°. */
  setRim(rim: RimState, animate = true): void {
    if (this.rim && this.rim.key === rim.key && this.rim.ratio === rim.ratio) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.prevRim = animate && !reduce ? this.rim : null;
    this.rim = rim;
    this.fadeStart = performance.now();
    this.request();
  }

  get isZoomed(): boolean {
    return this.zoomed;
  }

  setZoom(on: boolean): void {
    if (on === this.zoomed) return;
    this.zoomed = on;
    if (!this.scene) return; // applied in setScene
    this.viewFrom = { ...this.view };
    this.viewTo = on ? this.zoomView() : this.fullView();
    this.viewStart = performance.now();
    this.request();
  }

  private fullView(): View {
    const s = this.scene!;
    return { x: 0, y: 0, w: s.width, h: s.height };
  }

  /** Front wheel = the right-most spot (cars face right in the demo shots). */
  private zoomView(): View {
    const s = this.scene!;
    const spot = [...s.spots].sort((a, b) => b.x - a.x)[0];
    const aspect = s.width / s.height;
    const h = Math.min(s.height, spot.r * 3.1);
    const w = h * aspect;
    const x = Math.max(0, Math.min(s.width - w, spot.x - w * 0.55));
    const y = Math.max(0, Math.min(s.height - h, spot.y - h * 0.5));
    return { x, y, w, h };
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.request();
  }

  request(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      this.frame(t);
    });
  }

  private frame(now: number): void {
    let animating = false;
    if (this.viewTo && this.viewFrom) {
      const t = Math.min(1, (now - this.viewStart) / 250);
      const e = easeOut(t);
      const a = this.viewFrom;
      const b = this.viewTo;
      this.view = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e };
      if (t >= 1) this.viewTo = this.viewFrom = null;
      else animating = true;
    }
    let fade = 1;
    if (this.prevRim) {
      fade = Math.min(1, (now - this.fadeStart) / FADE_MS);
      if (fade >= 1) this.prevRim = null;
      else animating = true;
    }
    this.draw(this.ctx, this.canvas.width, this.canvas.height, this.view, easeOut(fade), this.split);
    if (this.onFirstPaint) {
      this.onFirstPaint();
      this.onFirstPaint = undefined;
    }
    if (animating) this.request();
  }

  /** Draws the scene into any context; reused by PNG export. */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, view: View, fade = 1, split: number | null = null): void {
    const s = this.scene;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, W, H);
    if (!s) return;
    const px = W / view.w; // canvas px per image px
    ctx.save();
    ctx.setTransform(px, 0, 0, px, -view.x * px, -view.y * px);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s.img, 0, 0, s.width, s.height);
    if (this.rim) {
      if (s.floorReflection) s.spots.forEach((spot, i) => this.drawReflection(ctx, spot, this.lights[i], px, fade));
      s.spots.forEach((spot, i) => this.drawWheel(ctx, spot, this.lights[i], px, fade));
    }
    ctx.restore();
    if (split !== null && split > 0) {
      const sx = Math.round(W * split);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, sx, H);
      ctx.clip();
      ctx.setTransform(px, 0, 0, px, -view.x * px, -view.y * px);
      ctx.drawImage(s.img, 0, 0, s.width, s.height);
      ctx.restore();
    }
  }

  /** Mirrored rim on the glossy floor, fading out in slices (matches the baked car reflection). */
  private drawReflection(ctx: CanvasRenderingContext2D, spot: WheelSpot, light: SpotLight, px: number, fade: number): void {
    const ground = spot.y + spot.r;
    const depth = spot.r * 1.9;
    const N = 6;
    for (let i = 0; i < N; i++) {
      const y0 = ground + (depth * i) / N;
      const mid = (i + 0.5) / N;
      ctx.save();
      ctx.beginPath();
      ctx.rect(spot.x - spot.r * 1.3, y0, spot.r * 2.6, depth / N + 0.5);
      ctx.clip();
      ctx.globalAlpha = 0.34 * Math.pow(1 - mid, 1.6);
      ctx.translate(0, 2 * ground);
      ctx.scale(1, -1);
      this.drawWheel(ctx, spot, light, px, fade, false);
      ctx.restore();
    }
  }

  private drawWheel(ctx: CanvasRenderingContext2D, spot: WheelSpot, light: SpotLight, px: number, fade: number, shadow = true): void {
    const rim = this.rim!;
    const r = spot.r;
    const rimR = r * rim.ratio;
    const D = rimR * 2 * (512 / 500); // sprite has 12px margin around a 500px rim radius
    const grain = this.scene!.isUserPhoto ? 0.1 : 0.05;
    const [tr, tg, tb] = light.tyre;
    const baseAlpha = ctx.globalAlpha;
    ctx.save();
    ctx.translate(spot.x, spot.y);
    ctx.scale(spot.sx ?? 1, 1);

    // 1. paint the stock rim over with tyre sidewall
    const side = ctx.createRadialGradient(-r * 0.12, -r * 0.14, r * 0.1, 0, 0, r * 0.9);
    const rgb = (k: number, a = 1) => `rgba(${Math.round(tr * k)},${Math.round(tg * k)},${Math.round(tb * k)},${a})`;
    side.addColorStop(0, rgb(0.85));
    side.addColorStop(0.78, rgb(1.25));
    side.addColorStop(0.9, rgb(1.0, 0.95));
    side.addColorStop(1, rgb(1.0, 0));
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
    ctx.fill();

    // 2. brake disc and caliper, seen through the spokes
    const discR = rimR * 0.8;
    const disc = ctx.createRadialGradient(-discR * 0.2, -discR * 0.25, discR * 0.1, 0, 0, discR);
    disc.addColorStop(0, '#74777c');
    disc.addColorStop(0.55, '#55585d');
    disc.addColorStop(0.92, '#3a3c40');
    disc.addColorStop(1, '#1e1f22');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(0, 0, discR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(0.6, discR * 0.012);
    for (const k of [0.62, 0.75, 0.88]) {
      ctx.beginPath();
      ctx.arc(0, 0, discR * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#202124';
    ctx.beginPath();
    ctx.arc(0, 0, discR * 0.45, 0, Math.PI * 2);
    ctx.fill();
    // caliper at ~10 o'clock
    const a0 = (-160 * Math.PI) / 180;
    const a1 = (-112 * Math.PI) / 180;
    const cal = ctx.createLinearGradient(-discR, -discR, 0, 0);
    cal.addColorStop(0, shadeHex(this.caliper, 0.25));
    cal.addColorStop(1, shadeHex(this.caliper, -0.35));
    ctx.fillStyle = cal;
    ctx.beginPath();
    ctx.arc(0, 0, discR * 1.05, a0, a1);
    ctx.arc(0, 0, discR * 0.6, a1 + 0.08, a0 - 0.08, true);
    ctx.closePath();
    ctx.fill();
    // depth: the barrel darkens towards the rim
    const depth = ctx.createRadialGradient(0, 0, discR * 0.3, 0, 0, rimR);
    depth.addColorStop(0, 'rgba(0,0,0,0.05)');
    depth.addColorStop(0.78, 'rgba(0,0,0,0.2)');
    depth.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = depth;
    ctx.beginPath();
    ctx.arc(0, 0, rimR, 0, Math.PI * 2);
    ctx.fill();

    // 3. rim(s) with soft shadow on the tyre (rgba 0,0,0,.35 + blur)
    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = rimR * 0.12 * px;
      ctx.shadowOffsetY = rimR * 0.03 * px;
    }
    const sizePx = D * px;
    if (this.prevRim && fade < 1) {
      const p = this.prevRim;
      const Dp = r * p.ratio * 2 * (512 / 500);
      const sp = rimSprite(p.key, p.img, Dp * px, light.brightness, grain);
      ctx.globalAlpha = baseAlpha * (1 - fade);
      ctx.drawImage(sp, -Dp / 2, -Dp / 2, Dp, Dp);
    }
    const sprite = rimSprite(rim.key, rim.img, sizePx, light.brightness, grain);
    ctx.globalAlpha = baseAlpha * fade;
    if (fade < 1) ctx.rotate(TURN * (1 - fade));
    ctx.drawImage(sprite, -D / 2, -D / 2, D, D);
    ctx.restore();
  }

  /** Still frame of the current scene with another rim (catalog previews); the live rim is left untouched. */
  renderWith(rim: RimState, width: number, height?: number): HTMLCanvasElement {
    const s = this.scene!;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height ?? Math.round((width * s.height) / s.width);
    const keep = [this.rim, this.prevRim] as const;
    this.rim = rim;
    this.prevRim = null;
    this.draw(c.getContext('2d')!, c.width, c.height, this.fullView(), 1, null);
    [this.rim, this.prevRim] = keep;
    return c;
  }

  get ready(): boolean {
    return !!this.scene;
  }

  /** Renders the "after" state at full image resolution for PNG export. */
  renderFull(maxWidth = 1600): HTMLCanvasElement {
    const s = this.scene!;
    const k = Math.min(1, maxWidth / s.width);
    const c = document.createElement('canvas');
    c.width = Math.round(s.width * k);
    c.height = Math.round(s.height * k);
    this.draw(c.getContext('2d')!, c.width, c.height, this.fullView(), 1, null);
    return c;
  }
}

function shadeHex(hex: string, k: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${ch.map((v) => Math.round(v)).join(',')})`;
}
