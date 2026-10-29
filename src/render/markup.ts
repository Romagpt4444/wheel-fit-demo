import type { WheelSpot } from '../types';

/**
 * Wheel markup on a user's photo: two circles that the user drags onto the tyres.
 * One finger drags the active circle, two fingers pinch it, mouse wheel resizes it.
 * Coordinates are kept in image pixels.
 */
export class MarkupEditor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: CanvasImageSource;
  private w: number;
  private h: number;
  spots: WheelSpot[];
  active = 1;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { id: number; dx: number; dy: number } | null = null;
  private pinch: { d0: number; r0: number } | null = null;
  private raf = 0;
  private ro: ResizeObserver;
  accent = '#c9a878';
  ratio = 0.69;
  onChange?: () => void;

  constructor(canvas: HTMLCanvasElement, img: CanvasImageSource, width: number, height: number, spots?: WheelSpot[]) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.img = img;
    this.w = width;
    this.h = height;
    this.spots = spots ?? MarkupEditor.guess(width, height);
    canvas.style.aspectRatio = `${width} / ${height}`;
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
  }

  /** First guess: a side shot usually has wheels at ~22 % and ~78 % of the width, low in the frame. */
  static guess(w: number, h: number): WheelSpot[] {
    const r = Math.min(w * 0.085, h * 0.16);
    const y = Math.min(h - r * 1.1, h * 0.7);
    return [
      { x: w * 0.23, y, r, sx: 1 },
      { x: w * 0.77, y, r, sx: 1 },
    ];
  }

  destroy(): void {
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
  }

  setRadius(r: number): void {
    this.spots[this.active].r = Math.max(this.minR, Math.min(this.maxR, r));
    this.changed();
  }

  setSquash(sx: number): void {
    this.spots.forEach((s) => (s.sx = sx));
    this.changed();
  }

  get minR(): number {
    return Math.min(this.w, this.h) * 0.03;
  }
  get maxR(): number {
    return Math.min(this.w, this.h) * 0.45;
  }

  reset(): void {
    this.spots = MarkupEditor.guess(this.w, this.h);
    this.changed();
  }

  private changed(): void {
    this.onChange?.();
    this.request();
  }

  private toImage(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * this.w, y: ((e.clientY - rect.top) / rect.height) * this.h };
  }

  private hit(p: { x: number; y: number }): number {
    let best = -1;
    let bestD = Infinity;
    this.spots.forEach((s, i) => {
      const d = Math.hypot((p.x - s.x) / (s.sx ?? 1), p.y - s.y) / s.r;
      if (d < 1.35 && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  private down = (e: PointerEvent) => {
    const p = this.toImage(e);
    this.pointers.set(e.pointerId, p);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already released pointer */
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = null;
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), r0: this.spots[this.active].r };
      return;
    }
    const i = this.hit(p);
    if (i >= 0) {
      this.active = i;
      const s = this.spots[i];
      this.drag = { id: e.pointerId, dx: s.x - p.x, dy: s.y - p.y };
      this.changed();
    }
  };

  private move = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.toImage(e);
    this.pointers.set(e.pointerId, p);
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.setRadius(this.pinch.r0 * (d / Math.max(1, this.pinch.d0)));
      return;
    }
    if (this.drag && this.drag.id === e.pointerId) {
      const s = this.spots[this.active];
      s.x = Math.max(0, Math.min(this.w, p.x + this.drag.dx));
      s.y = Math.max(0, Math.min(this.h, p.y + this.drag.dy));
      this.changed();
    }
  };

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.drag?.id === e.pointerId) this.drag = null;
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const s = this.spots[this.active];
    this.setRadius(s.r * (e.deltaY < 0 ? 1.04 : 0.96));
  };

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.request();
  }

  request(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const k = canvas.width / this.w;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.img, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.spots.forEach((s, i) => {
      const on = i === this.active;
      ctx.save();
      ctx.translate(s.x * k, s.y * k);
      ctx.scale(s.sx ?? 1, 1);
      // reveal the wheel area at full brightness
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, s.r * k, 0, Math.PI * 2);
      ctx.clip();
      ctx.scale(1 / (s.sx ?? 1), 1);
      ctx.drawImage(this.img, -s.x * k, -s.y * k, canvas.width, canvas.height);
      ctx.restore();
      ctx.lineWidth = (on ? 2.5 : 1.5) * Math.min(2, window.devicePixelRatio || 1);
      ctx.strokeStyle = on ? this.accent : 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(0, 0, s.r * k, 0, Math.PI * 2);
      ctx.stroke();
      // where the rim will end up
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(0, 0, s.r * k * this.ratio, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = on ? this.accent : '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 3 * Math.min(2, window.devicePixelRatio || 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}
