// Generates demo car "studio shots" (side profile, facing right) with stock wheels.
//   assets-src/cars/<id>.svg
//   public/assets/cars/<id>.webp (1600×900) + -thumb.webp/.avif (480×270)
// With --write-config also rewrites public/data/cars.json (wheel positions are known exactly).
// Run: node scripts/gen-cars.mjs [--write-config]
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { wheelGroup } from './wheel-shapes.mjs';

const W = 1600;
const H = 900;
const G = 700; // ground line
const STOCK_RATIO = 0.62;

const f = (n) => Math.round(n * 10) / 10;

// --- colour helpers ---
function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(h, k) {
  // k>0 → towards white, k<0 → towards black
  const c = hex2rgb(h).map((v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

// --- Catmull-Rom spline through points; {c:true} marks a sharp corner ---
function spline(pts) {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t1 = p1.c ? [0, 0] : [(p2.x - p0.x) / 6, (p2.y - p0.y) / 6];
    const t2 = p2.c ? [0, 0] : [(p3.x - p1.x) / 6, (p3.y - p1.y) / 6];
    if (i === 0) d += `M${f(p1.x)} ${f(p1.y)}`;
    d += `C${f(p1.x + t1[0])} ${f(p1.y + t1[1])} ${f(p2.x - t2[0])} ${f(p2.y - t2[1])} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

// --- body types (all heights are above ground, x relative to wheel centres) ---
const TYPES = {
  sedan: { r: 104, wb: 790, fo: 225, ro: 245, clear: 42, nose: 225, hood: 282, aBase: 312, roof: 458, deck: 318, tail: 298, roofR: 170, roofF: 300, aX: 165, cX: 20, shape: 'trunk' },
  coupe: { r: 106, wb: 720, fo: 230, ro: 230, clear: 36, nose: 210, hood: 268, aBase: 298, roof: 428, deck: 312, tail: 292, roofR: 190, roofF: 310, aX: 140, cX: 40, shape: 'fastback' },
  crossover: { r: 118, wb: 780, fo: 215, ro: 215, clear: 62, nose: 280, hood: 345, aBase: 372, roof: 545, deck: 0, tail: 365, roofR: 150, roofF: 290, aX: 160, cX: 0, shape: 'hatchSUV' },
  suv: { r: 126, wb: 810, fo: 205, ro: 195, clear: 72, nose: 320, hood: 385, aBase: 402, roof: 590, deck: 0, tail: 405, roofR: 80, roofF: 300, aX: 170, cX: 0, shape: 'box' },
  hatch: { r: 100, wb: 700, fo: 200, ro: 160, clear: 40, nose: 235, hood: 295, aBase: 326, roof: 478, deck: 0, tail: 330, roofR: 150, roofF: 320, aX: 165, cX: 0, shape: 'hatch' },
  wagon: { r: 104, wb: 790, fo: 220, ro: 250, clear: 44, nose: 230, hood: 285, aBase: 318, roof: 466, deck: 0, tail: 335, roofR: 40, roofF: 320, aX: 165, cX: 0, shape: 'wagon' },
  fastback: { r: 108, wb: 800, fo: 220, ro: 235, clear: 36, nose: 215, hood: 275, aBase: 304, roof: 440, deck: 312, tail: 298, roofR: 210, roofF: 320, aX: 155, cX: 10, shape: 'fastback' },
};

export const DEMO_CARS = [
  { id: 'sedan-pearl', name: 'Бизнес-седан', body: 'sedan', color: '#e6e3dc', paintName: 'белый перламутр' },
  { id: 'coupe-red', name: 'Купе', body: 'coupe', color: '#8f1d22', paintName: 'красный металлик' },
  { id: 'crossover-silver', name: 'Кроссовер', body: 'crossover', color: '#b9bdc3', paintName: 'серебро' },
  { id: 'suv-navy', name: 'Внедорожник', body: 'suv', color: '#2a3c5c', paintName: 'тёмно-синий' },
  { id: 'hatch-blue', name: 'Хэтчбек', body: 'hatch', color: '#2f63a8', paintName: 'синий' },
  { id: 'wagon-graphite', name: 'Универсал', body: 'wagon', color: '#5a6069', paintName: 'графит' },
  { id: 'fastback-green', name: 'Спорт-лифтбек', body: 'fastback', color: '#1f5a4e', paintName: 'изумруд' },
];


const LIGHT = '#f1d5a6';
/** Dark garage showroom: panelled wall, warm light bars, ceiling lamps with haze, podium and wet floor. */
function garage(id) {
  const HZ = 470; // wall / floor line
  const panels = Array.from({ length: 11 }, (_, i) => `<rect x="${i * 150 - 25}" y="0" width="146" height="${HZ}" fill="url(#${id}panel)"/>`).join('');
  const lamps = [420, 610, 800, 990, 1180]
    .map((x) => `<rect x="${x - 45}" y="26" width="90" height="8" rx="4" fill="#fff6e6"/><ellipse cx="${x}" cy="32" rx="80" ry="16" fill="${LIGHT}" opacity="0.5" filter="url(#${id}glow)"/>`)
    .join('');
  const bars = [
    [0, 300, 470],
    [1130, 300, 470],
  ]
    .map(([x, y, w]) => `<rect x="${x}" y="${y - 6}" width="${w}" height="12" fill="${LIGHT}" opacity="0.55" filter="url(#${id}glow)"/><rect x="${x}" y="${y - 2}" width="${w}" height="4" fill="#fff3dc"/>
      <rect x="${x}" y="${2 * HZ - y + 40}" width="${w}" height="10" fill="${LIGHT}" opacity="0.22" filter="url(#${id}glow)"/>`)
    .join('');
  return `
  <defs>
    <linearGradient id="${id}wallg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0e10"/><stop offset="1" stop-color="#16181b"/></linearGradient>
    <linearGradient id="${id}panel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#15171a"/><stop offset="0.5" stop-color="#1b1d21"/><stop offset="1" stop-color="#121316"/></linearGradient>
    <linearGradient id="${id}floorg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1b1e"/><stop offset="0.35" stop-color="#0f1012"/><stop offset="1" stop-color="#060607"/></linearGradient>
    <linearGradient id="${id}cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LIGHT}" stop-opacity="0.2"/><stop offset="1" stop-color="${LIGHT}" stop-opacity="0"/></linearGradient>
    <radialGradient id="${id}pod" cx="0.5" cy="0.4" r="0.6"><stop offset="0" stop-color="#25272b"/><stop offset="0.7" stop-color="#141518"/><stop offset="1" stop-color="#0c0d0f"/></radialGradient>
    <filter id="${id}glow" x="-50%" y="-300%" width="200%" height="700%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="${id}haze" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="40"/></filter>
  </defs>
  <rect width="${W}" height="${HZ}" fill="url(#${id}wallg)"/>
  <g opacity="0.9">${panels}</g>
  <rect width="${W}" height="62" fill="#08090a"/>
  <rect y="${HZ}" width="${W}" height="${H - HZ}" fill="url(#${id}floorg)"/>
  <rect y="${HZ - 2}" width="${W}" height="3" fill="#000" opacity="0.6"/>
  ${bars}
  <path d="M520 34L1080 34L1480 ${HZ + 230}L120 ${HZ + 230}Z" fill="url(#${id}cone)" filter="url(#${id}haze)"/>
  ${lamps}
  <ellipse cx="${W / 2}" cy="${G + 22}" rx="742" ry="80" fill="#050506"/>
  <ellipse cx="${W / 2}" cy="${G + 8}" rx="740" ry="78" fill="url(#${id}pod)"/>
  <ellipse cx="${W / 2}" cy="${G + 8}" rx="740" ry="78" fill="none" stroke="${LIGHT}" stroke-width="6" opacity="0.35" filter="url(#${id}glow)"/>
  <ellipse cx="${W / 2}" cy="${G + 8}" rx="740" ry="78" fill="none" stroke="#f6e3c2" stroke-width="1.6" opacity="0.8"/>
  <ellipse cx="${W / 2}" cy="${G + 8}" rx="600" ry="60" fill="none" stroke="#fff" stroke-width="1" opacity="0.08"/>`;
}

function carSVG(car, carOnly = false) {
  const T = TYPES[car.body];
  const r = T.r;
  const len = T.ro + T.wb + T.fo;
  const x0 = (W - len) / 2 + 10;
  const xr = x0 + T.ro; // rear wheel centre
  const xf = xr + T.wb; // front wheel centre
  const xL = x0;
  const xR = xf + T.fo;
  const cy = G - r;
  const yB = G - T.clear;
  const Y = (h) => G - h;
  const c = car.color;

  // upper silhouette, rear-bottom → front-bottom
  const top = [];
  top.push({ x: xL + 34, y: yB - 6, c: true });
  top.push({ x: xL + 4, y: Y(T.clear + 70) });
  if (T.shape === 'trunk' || T.shape === 'fastback') {
    top.push({ x: xL + 2, y: Y(T.tail) });
    top.push({ x: xL + 40, y: Y(T.deck), c: T.shape === 'trunk' });
    if (T.shape === 'trunk') top.push({ x: xr + T.cX, y: Y(T.deck + 8) });
    top.push({ x: xr + T.roofR, y: Y(T.roof) });
  } else {
    // hatch / wagon / SUV: steep rear
    const lean = T.shape === 'box' ? 14 : T.shape === 'wagon' ? 30 : T.shape === 'hatchSUV' ? 50 : 70;
    top.push({ x: xL + 6, y: Y(T.tail) });
    top.push({ x: xL + lean, y: Y(T.roof - 18) });
    top.push({ x: xL + lean + 40, y: Y(T.roof), c: false });
    top.push({ x: xr + T.roofR, y: Y(T.roof + 2) });
  }
  top.push({ x: xf - T.roofF, y: Y(T.roof) });
  top.push({ x: xf - T.aX, y: Y(T.aBase) });
  top.push({ x: xR - 70, y: Y(T.hood) });
  top.push({ x: xR - 6, y: Y(T.nose) });
  top.push({ x: xR - 2, y: Y(T.clear + 90) });
  top.push({ x: xR - 36, y: yB - 4, c: true });

  const ar = r + 15;
  const archDx = (cxw) => Math.sqrt(Math.max(0, ar * ar - (yB - cy) ** 2));
  const dxF = archDx(xf);
  const dxR = archDx(xr);
  const bodyD =
    spline(top) +
    `L${f(xf + dxF)} ${f(yB)}A${ar} ${ar} 0 1 0 ${f(xf - dxF)} ${f(yB)}` +
    `L${f(xr + dxR)} ${f(yB)}A${ar} ${ar} 0 1 0 ${f(xr - dxR)} ${f(yB)}Z`;

  // glasshouse
  const belt = T.aBase + 8;
  const rearGlassX = T.shape === 'trunk' ? xr + T.cX + 40 : T.shape === 'fastback' ? xr + T.cX + 120 : xL + (T.shape === 'box' ? 46 : T.shape === 'wagon' ? 62 : 110);
  const glass = [
    { x: rearGlassX, y: Y(belt), c: true },
    { x: T.shape === 'trunk' || T.shape === 'fastback' ? xr + T.roofR + 20 : xL + 90, y: Y(T.roof - 16) },
    { x: xf - T.roofF - 6, y: Y(T.roof - 16) },
    { x: xf - T.aX - 34, y: Y(belt), c: true },
  ];
  const glassD = spline(glass) + 'Z';
  const bX = (rearGlassX + (xf - T.aX - 34)) / 2 + 30; // B pillar
  const dX = T.shape === 'box' || T.shape === 'wagon' || T.shape === 'hatchSUV' ? xr + 60 : null; // D pillar for long roofs

  const top0 = Y(T.roof);
  const span = yB - top0;
  const beltT = (Y(belt) - top0) / span;
  const id = car.id.replace(/[^a-z]/g, '');

  // stock wheels
  const stock = wheelGroup('stock', 'steel', id + 'st');
  const rimR = r * STOCK_RATIO;
  const sc = rimR / 500;
  const wheel = (cx) => `
    <g transform="translate(${f(cx)} ${f(cy)})">
      <circle r="${r}" fill="url(#${id}tire)"/>
      <circle r="${f(r * 0.96)}" fill="none" stroke="#050505" stroke-width="3"/>
      <circle r="${f(r * 0.8)}" fill="url(#${id}wall)"/>
      <path d="M${f(-r * 0.86)} ${f(-r * 0.2)}A${f(r * 0.88)} ${f(r * 0.88)} 0 0 1 ${f(-r * 0.15)} ${f(-r * 0.87)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6" stroke-linecap="round"/>
      <circle r="${f(rimR * 0.8)}" fill="#3a3c40"/>
      <circle r="${f(rimR * 0.8)}" fill="url(#${id}disc)"/>
      <path d="M${f(rimR * 0.35)} ${f(-rimR * 0.72)}a${f(rimR * 0.78)} ${f(rimR * 0.78)} 0 0 1 ${f(rimR * 0.42)} ${f(rimR * 0.45)}l${f(-rimR * 0.18)} ${f(rimR * 0.06)}a${f(rimR * 0.6)} ${f(rimR * 0.6)} 0 0 0 ${f(-rimR * 0.3)} ${f(-rimR * 0.34)}z" fill="#2b2d31"/>
      <g transform="scale(${f(sc * 1000) / 1000})">${stock.body}</g>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  ${stock.defs}
  <radialGradient id="${id}bg" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="#25282d"/><stop offset="0.6" stop-color="#121417"/><stop offset="1" stop-color="#090a0c"/></radialGradient>
  <linearGradient id="${id}floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16181b"/><stop offset="1" stop-color="#08090a"/></linearGradient>
  <radialGradient id="${id}spot" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#3a3d43" stop-opacity="0.75"/><stop offset="1" stop-color="#3a3d43" stop-opacity="0"/></radialGradient>
  <linearGradient id="${id}paint" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top0)}" x2="0" y2="${f(yB)}">
    <stop offset="0" stop-color="${shade(c, 0.45)}"/>
    <stop offset="0.12" stop-color="${shade(c, 0.12)}"/>
    <stop offset="${f(beltT - 0.04)}" stop-color="${shade(c, 0.02)}"/>
    <stop offset="${f(beltT + 0.03)}" stop-color="${shade(c, 0.42)}"/>
    <stop offset="${f(beltT + 0.09)}" stop-color="${shade(c, 0.05)}"/>
    <stop offset="0.62" stop-color="${shade(c, -0.12)}"/>
    <stop offset="0.85" stop-color="${shade(c, -0.42)}"/>
    <stop offset="1" stop-color="${shade(c, -0.7)}"/>
  </linearGradient>
  <linearGradient id="${id}side" gradientUnits="userSpaceOnUse" x1="${xL}" y1="0" x2="${xR}" y2="0">
    <stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.15" stop-color="#000" stop-opacity="0"/>
    <stop offset="0.55" stop-color="#fff" stop-opacity="0.06"/><stop offset="0.9" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/>
  </linearGradient>
  <linearGradient id="${id}glass" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#3a424c"/><stop offset="0.5" stop-color="#151a20"/><stop offset="1" stop-color="#07090b"/></linearGradient>
  <radialGradient id="${id}tire" cx="0.45" cy="0.42" r="0.6"><stop offset="0.7" stop-color="#1b1b1d"/><stop offset="1" stop-color="#0c0c0d"/></radialGradient>
  <radialGradient id="${id}wall" cx="0.42" cy="0.38" r="0.62"><stop offset="0.7" stop-color="#1e1e20"/><stop offset="0.9" stop-color="#2a2a2d"/><stop offset="1" stop-color="#141415"/></radialGradient>
  <radialGradient id="${id}disc" cx="0.45" cy="0.4" r="0.6"><stop offset="0" stop-color="#55585e"/><stop offset="0.75" stop-color="#3b3d42"/><stop offset="1" stop-color="#1c1d20"/></radialGradient>
  <linearGradient id="${id}head" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#cfd6de"/><stop offset="1" stop-color="#7e8791"/></linearGradient>
  <linearGradient id="${id}tail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a0b0f"/><stop offset="0.5" stop-color="#d3262c"/><stop offset="1" stop-color="#7c1014"/></linearGradient>
  <filter id="${id}blur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="${id}blur2" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>
  <clipPath id="${id}clip"><path d="${bodyD}"/></clipPath>
  <clipPath id="${id}above"><rect x="0" y="0" width="${W}" height="${f(yB + 2)}"/></clipPath>
  <linearGradient id="${id}reflg" gradientUnits="userSpaceOnUse" x1="0" y1="${G}" x2="0" y2="${G + 170}"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="${id}refl" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="0" y="${G}" width="${W}" height="${H - G}" fill="url(#${id}reflg)"/></mask>
  <g id="${id}car"><g clip-path="url(#${id}above)">
    <circle cx="${f(xr)}" cy="${f(cy)}" r="${ar - 2}" fill="#060607"/>
    <circle cx="${f(xf)}" cy="${f(cy)}" r="${ar - 2}" fill="#060607"/>
  </g>
  <path d="${bodyD}" fill="url(#${id}paint)"/>
  <path d="${bodyD}" fill="url(#${id}side)"/>
  <g clip-path="url(#${id}clip)">
    <path d="${glassD}" fill="url(#${id}glass)" stroke="#0b0c0e" stroke-width="5"/>
    <path d="M${f(bX - 40)} ${f(Y(T.roof))}L${f(bX + 40)} ${f(Y(T.roof))}L${f(bX - 120)} ${f(Y(belt))}L${f(bX - 190)} ${f(Y(belt))}Z" fill="#fff" opacity="0.06"/>
    <rect x="${f(bX - 13)}" y="${f(Y(T.roof))}" width="26" height="${f(T.roof - belt)}" fill="#0d0e10"/>
    ${dX ? `<rect x="${f(dX)}" y="${f(Y(T.roof))}" width="30" height="${f(T.roof - belt)}" fill="#0d0e10"/>` : ''}
    <path d="M${f(xL)} ${f(Y(belt - 52))}C${f(xr)} ${f(Y(belt - 44))} ${f(xf)} ${f(Y(belt - 40))} ${f(xR)} ${f(Y(belt - 70))}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="2.5"/>
    <path d="M${f(xL)} ${f(Y(belt - 54))}C${f(xr)} ${f(Y(belt - 46))} ${f(xf)} ${f(Y(belt - 42))} ${f(xR)} ${f(Y(belt - 72))}" fill="none" stroke="#000" stroke-opacity="0.18" stroke-width="2"/>
    <path d="M${f(xf - T.aX - 26)} ${f(Y(belt))}L${f(xf - T.aX - 40)} ${f(yB - 22)}M${f(bX + 2)} ${f(Y(belt))}L${f(bX - 4)} ${f(yB - 22)}M${f(rearGlassX + 30)} ${f(Y(belt - 2))}Q${f(xr + ar + 20)} ${f(Y(belt - 120))} ${f(xr + ar + 6)} ${f(cy - 20)}" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="2.5"/>
    <rect x="${f(xf - T.aX - 120)}" y="${f(Y(belt - 34))}" width="54" height="11" rx="5.5" fill="${shade(c, -0.35)}"/>
    <rect x="${f(bX - 104)}" y="${f(Y(belt - 34))}" width="54" height="11" rx="5.5" fill="${shade(c, -0.35)}"/>
    <path d="M${f(xL)} ${f(yB - 26)}L${f(xR)} ${f(yB - 26)}L${f(xR)} ${f(yB + 4)}L${f(xL)} ${f(yB + 4)}Z" fill="#0b0c0e" opacity="0.8"/>
    <path d="M${f(xR - 120)} ${f(Y(T.hood - 14))}L${f(xR - 8)} ${f(Y(T.nose + 18))}L${f(xR - 6)} ${f(Y(T.nose - 2))}L${f(xR - 110)} ${f(Y(T.hood - 34))}Z" fill="url(#${id}head)"/>
    <path d="M${f(xR - 80)} ${f(yB - 70)}L${f(xR)} ${f(yB - 74)}L${f(xR)} ${f(yB - 40)}L${f(xR - 70)} ${f(yB - 44)}Z" fill="#0a0b0c" opacity="0.85"/>
    <path d="M${f(xL)} ${f(Y(T.tail + 8))}L${f(xL + 64)} ${f(Y(T.tail + 2))}L${f(xL + 60)} ${f(Y(T.tail - 26))}L${f(xL)} ${f(Y(T.tail - 30))}Z" fill="url(#${id}tail)"/>
  </g>
  <path d="M${f(xf - T.aX - 6)} ${f(Y(belt + 4))}l-34 -22l-40 6l6 28l60 2z" fill="${shade(c, -0.1)}" stroke="#000" stroke-opacity="0.35" stroke-width="2"/>
  <path d="M${f(xf - ar)} ${f(yB)}A${ar} ${ar} 0 0 1 ${f(xf + ar)} ${f(yB)}M${f(xr - ar)} ${f(yB)}A${ar} ${ar} 0 0 1 ${f(xr + ar)} ${f(yB)}" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="5" transform="translate(0 2)"/>
  <ellipse cx="${f(xr)}" cy="${G}" rx="${f(r * 0.95)}" ry="9" fill="#000" filter="url(#${id}blur2)"/>
  <ellipse cx="${f(xf)}" cy="${G}" rx="${f(r * 0.95)}" ry="9" fill="#000" filter="url(#${id}blur2)"/>
  ${wheel(xr)}
  ${wheel(xf)}
  </g>
</defs>
${carOnly ? '' : garage(id)}
${carOnly ? '' : `<ellipse cx="${f((xL + xR) / 2)}" cy="${G + 4}" rx="${f(len / 2 + 30)}" ry="22" fill="#000" opacity="0.85" filter="url(#${id}blur)"/>`}
<use href="#${id}car"/>

</svg>`;
}

const SRC = 'assets-src/cars';
const OUT = 'public/assets/cars';
await mkdir(SRC, { recursive: true });
await mkdir(OUT, { recursive: true });

/** Composites a mirrored, fading copy of the car onto the wet floor below the ground line. */
async function withReflection(sceneSvg, carOnlySvg) {
  const base = await sharp(Buffer.from(sceneSvg)).ensureAlpha().raw().toBuffer();
  const car = await sharp(Buffer.from(carOnlySvg)).ensureAlpha().blur(1.2).raw().toBuffer();
  const refl = Buffer.alloc(W * H * 4);
  const FADE = 190;
  for (let y = G; y < Math.min(H, G + FADE); y++) {
    const sy = 2 * G - y;
    if (sy < 0) continue;
    const k = 0.34 * Math.pow(1 - (y - G) / FADE, 1.6);
    for (let x = 0; x < W; x++) {
      const si = (sy * W + x) * 4;
      const di = (y * W + x) * 4;
      refl[di] = car[si];
      refl[di + 1] = car[si + 1];
      refl[di + 2] = car[si + 2];
      refl[di + 3] = Math.round(car[si + 3] * k);
    }
  }
  const reflPng = await sharp(refl, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const sceneWithRefl = await sharp(base, { raw: { width: W, height: H, channels: 4 } }).composite([{ input: reflPng }]).png().toBuffer();
  // redraw the car itself on top so the tyres stay crisp over the reflection
  return sharp(sceneWithRefl).composite([{ input: await sharp(Buffer.from(carOnlySvg)).png().toBuffer() }]).png().toBuffer();
}

const config = [];
for (const car of DEMO_CARS) {
  const svg = carSVG(car);
  await writeFile(`${SRC}/${car.id}.svg`, svg);
  const png = await withReflection(svg, carSVG(car, true));
  await sharp(png).webp({ quality: 84, effort: 5 }).toFile(`${OUT}/${car.id}.webp`);
  await sharp(png).resize(480, 270).webp({ quality: 78, effort: 5 }).toFile(`${OUT}/${car.id}-thumb.webp`);
  await sharp(png).resize(480, 270).avif({ quality: 50, effort: 5 }).toFile(`${OUT}/${car.id}-thumb.avif`);
  const T = TYPES[car.body];
  const len = T.ro + T.wb + T.fo;
  const xr = (W - len) / 2 + 10 + T.ro;
  config.push({
    id: car.id,
    name: car.name,
    paint: car.paintName,
    image: `assets/cars/${car.id}.webp`,
    thumb: `assets/cars/${car.id}-thumb`,
    width: W,
    height: H,
    stockDiameter: 17,
    floorReflection: true,
    wheels: [
      { x: xr, y: G - T.r, r: T.r },
      { x: xr + T.wb, y: G - T.r, r: T.r },
    ],
  });
  console.log('car', car.id);
}
if (process.argv.includes('--write-config')) {
  await writeFile('public/data/cars.json', JSON.stringify({ cars: config }, null, 2) + '\n');
  console.log('wrote public/data/cars.json');
}
