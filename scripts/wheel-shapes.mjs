// Parametric wheel (rim) drawing in SVG.
// Coordinate system: centre (0,0), rim outer radius R = 500. Angle 0 points up, clockwise.
// Everything inside the barrel (r < 400) that is not a spoke stays transparent,
// so the canvas can paint the brake disc and caliper underneath.

const R = 500;
const f = (n) => Math.round(n * 100) / 100;
const pt = (r, a) => [f(r * Math.sin(a)), f(-r * Math.cos(a))];
const deg = (d) => (d * Math.PI) / 180;

export const FINISHES = {
  silver: {
    metal: ['#fbfbfc', '#d3d6da', '#9ea3aa', '#e2e4e7', '#868b92', '#c4c7cc', '#6b7077'],
    lip: ['#ffffff', '#b9bdc2', '#eef0f2', '#7d8288', '#d9dbde'],
    depth: '#2a2d31', ridge: 0.45, edge: 0.35,
  },
  graphite: {
    metal: ['#c9ccd1', '#7d8289', '#4c5056', '#8a8f96', '#3c3f44', '#6d7178', '#2e3135'],
    lip: ['#d8dadd', '#6f747a', '#a9adb2', '#3f4246', '#8d9197'],
    depth: '#141517', ridge: 0.32, edge: 0.45,
  },
  black: {
    metal: ['#c3c7cd', '#4a4d53', '#1d1e21', '#6a6e75', '#18191b', '#45484e', '#0e0e10'],
    lip: ['#c9ccd1', '#3a3c41', '#7d8187', '#1a1b1d', '#50535a'],
    depth: '#060607', ridge: 0.42, edge: 0.55,
  },
  bronze: {
    metal: ['#f3e1bf', '#c8a573', '#8a6a3e', '#d7b886', '#6e5230', '#b18e5d', '#4f3a20'],
    lip: ['#fbefd6', '#a7875a', '#e6cfa4', '#6a5132', '#c3a273'],
    depth: '#24190d', ridge: 0.4, edge: 0.4,
  },
  polished: {
    metal: ['#ffffff', '#e9ebee', '#a7acb3', '#f6f7f8', '#7c8189', '#dfe2e5', '#5c6168'],
    lip: ['#ffffff', '#c9ccd0', '#ffffff', '#8a8f95', '#eceef0'],
    depth: '#26292d', ridge: 0.6, edge: 0.3,
  },
  steel: {
    metal: ['#d9dcdf', '#a7abb0', '#7f848a', '#b5b9be', '#6d7177', '#9a9ea3', '#5a5e63'],
    lip: ['#e4e6e8', '#8d9196', '#c3c6ca', '#63676c', '#a4a8ad'],
    depth: '#1c1d20', ridge: 0.3, edge: 0.4,
  },
};

// ---- primitive shapes -------------------------------------------------------

/** Sampled spoke: centreline angle can twist with radius, width varies with radius. */
function sampledSpoke({ r0, r1, theta, twist = () => 0, width, n = 18 }) {
  const left = [];
  const right = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = r0 + (r1 - r0) * t;
    const a = theta + twist(t);
    const half = width(t) / 2 / r; // angular half width
    left.push(pt(r, a - half));
    right.push(pt(r, a + half));
  }
  const centre = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    centre.push(pt(r0 + (r1 - r0) * t, theta + twist(t)));
  }
  const rightRev = [...right].reverse();
  const poly = (arr) => 'M' + arr.map((p) => p.join(' ')).join('L') + 'Z';
  return {
    d: poly([...left, ...rightRev]),
    left: poly([...left, ...[...centre].reverse()]),
    right: poly([...centre, ...rightRev]),
    a: theta + twist(0.5),
  };
}

function circlePath(r) {
  return `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z`;
}

function circlePathRev(r) {
  return `M0 ${-r}A${r} ${r} 0 1 0 0 ${r}A${r} ${r} 0 1 0 0 ${-r}Z`;
}

// Ring that renders correctly with both nonzero and evenodd fill rules
function annulus(r0, r1) {
  return circlePath(r1) + circlePathRev(r0);
}

function rectPolar(rIn, rOut, a, w) {
  // small rectangular slot centred on angle a, width w (px)
  const h = w / 2;
  const c = [Math.sin(a), -Math.cos(a)];
  const nrm = [Math.cos(a), Math.sin(a)];
  const p = (r, s) => [f(c[0] * r + nrm[0] * s), f(c[1] * r + nrm[1] * s)];
  return `M${p(rIn, -h).join(' ')}L${p(rOut, -h).join(' ')}L${p(rOut, h).join(' ')}L${p(rIn, h).join(' ')}Z`;
}

const lerp = (a, b, t) => a + (b - a) * t;
const taper = (w0, w1, bulge = 0) => (t) => lerp(w0, w1, t) + bulge * Math.sin(Math.PI * t);

// ---- designs -----------------------------------------------------------------
// Each returns { spokes: string[] (paths), ridges: [r0,r1,thetaFn][] , hubR, lugs, lip }

const HUB = 128;
const RIM_IN = 462;

export const DESIGNS = {
  // Classic 5 spoke with concave sides
  s5: () => {
    const spokes = [];
    const ridges = [];
    for (let i = 0; i < 5; i++) {
      const th = (i * 2 * Math.PI) / 5;
      spokes.push(sampledSpoke({ r0: HUB - 20, r1: RIM_IN, theta: th, width: (t) => lerp(132, 190, t) - 50 * Math.sin(Math.PI * t) }));
    }
    return { spokes, ridges, lugs: 5 };
  },
  // Cross-laced mesh
  mesh: () => {
    const spokes = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const th = (i * 2 * Math.PI) / n;
      for (const s of [-1, 1]) {
        spokes.push(sampledSpoke({ r0: HUB - 10, r1: RIM_IN, theta: th, twist: (t) => s * deg(10) * t, width: taper(40, 36), n: 10 }));
      }
    }
    // inner ring tying the mesh
    spokes.push(annulus(HUB - 6, HUB + 22));
    return { spokes, ridges: [], lugs: 5 };
  },
  // Monoblock: very wide spokes, small windows
  mono: () => {
    const spokes = [];
    const ridges = [];
    for (let i = 0; i < 5; i++) {
      const th = (i * 2 * Math.PI) / 5;
      spokes.push(sampledSpoke({ r0: HUB - 20, r1: RIM_IN, theta: th, width: (t) => lerp(175, 390, t) + 50 * Math.sin(Math.PI * t) }));
    }
    spokes.push(annulus(HUB - 10, 205));
    return { spokes, ridges, lugs: 5 };
  },
  // Turbine: curved blades
  turbine: () => {
    const spokes = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const th = (i * 2 * Math.PI) / n;
      spokes.push(sampledSpoke({ r0: HUB - 10, r1: RIM_IN, theta: th, twist: (t) => deg(38) * Math.pow(t, 1.4), width: (t) => lerp(34, 92, t), n: 22 }));
    }
    spokes.push(annulus(HUB - 6, HUB + 30));
    return { spokes, ridges: [], lugs: 5 };
  },
  // 5 double Y spokes
  y10: () => {
    const spokes = [];
    const ridges = [];
    for (let i = 0; i < 5; i++) {
      const th = (i * 2 * Math.PI) / 5;
      spokes.push(sampledSpoke({ r0: HUB - 20, r1: 300, theta: th, width: taper(104, 92) }));
      for (const s of [-1, 1]) {
        spokes.push(sampledSpoke({ r0: 270, r1: RIM_IN, theta: th, twist: (t) => s * deg(15) * Math.pow(t, 0.8), width: taper(64, 72), n: 12 }));
      }
    }
    return { spokes, ridges, lugs: 5 };
  },
  // 7 split (twin) spokes
  split7: () => {
    const spokes = [];
    const ridges = [];
    for (let i = 0; i < 7; i++) {
      const th = (i * 2 * Math.PI) / 7;
      for (const s of [-1, 1]) {
        spokes.push(sampledSpoke({ r0: HUB - 15, r1: RIM_IN, theta: th, twist: (t) => s * deg(5.5) * t, width: taper(44, 50), n: 12 }));
      }
    }
    return { spokes, ridges, lugs: 5 };
  },
  // Aero disc with slots
  aero: () => {
    let d = annulus(HUB - 10, RIM_IN);
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n + deg(4);
      d += rectPolar(250, 420, a, 34);
    }
    return { spokes: [d], ridges: [], lugs: 5, evenodd: true };
  },
  // 15 thin spokes
  multi15: () => {
    const spokes = [];
    for (let i = 0; i < 15; i++) {
      const th = (i * 2 * Math.PI) / 15;
      spokes.push(sampledSpoke({ r0: HUB - 10, r1: RIM_IN, theta: th, width: taper(30, 40), n: 8 }));
    }
    spokes.push(annulus(HUB - 6, HUB + 26));
    return { spokes, ridges: [], lugs: 5 };
  },
  // Directional curved 10 spoke
  directional: () => {
    const spokes = [];
    const ridges = [];
    for (let i = 0; i < 10; i++) {
      const th = (i * 2 * Math.PI) / 10;
      const tw = (t) => deg(24) * Math.sin((Math.PI / 2) * t);
      spokes.push(sampledSpoke({ r0: HUB - 15, r1: RIM_IN, theta: th, twist: tw, width: taper(54, 66, -6), n: 20 }));
    }
    return { spokes, ridges, lugs: 5 };
  },
  // Forged 6 spoke with pockets
  forged6: () => {
    const spokes = [];
    const pockets = [];
    for (let i = 0; i < 6; i++) {
      const th = (i * 2 * Math.PI) / 6;
      spokes.push(sampledSpoke({ r0: HUB - 20, r1: RIM_IN, theta: th, width: (t) => lerp(130, 176, t) - 30 * Math.sin(Math.PI * t) }));
      pockets.push(sampledSpoke({ r0: 190, r1: 410, theta: th, width: (t) => lerp(44, 70, t) - 16 * Math.sin(Math.PI * t), n: 12 }));
    }
    return { spokes, ridges: [], pockets, lugs: 6 };
  },
  // Deep dish: 5 spokes ending at a stepped lip
  dish: () => {
    const spokes = [];
    const ridges = [];
    for (let i = 0; i < 5; i++) {
      const th = (i * 2 * Math.PI) / 5;
      spokes.push(sampledSpoke({ r0: HUB - 20, r1: 372, theta: th, width: (t) => lerp(118, 150, t) - 30 * Math.sin(Math.PI * t) }));
    }
    spokes.push(annulus(362, 384));
    return { spokes, ridges, lugs: 5, deepLip: true };
  },
  // Simple stock wheel used inside the demo car photos ("before")
  stock: () => {
    const spokes = [];
    for (let i = 0; i < 5; i++) {
      const th = (i * 2 * Math.PI) / 5;
      spokes.push(sampledSpoke({ r0: HUB - 20, r1: RIM_IN, theta: th, width: (t) => lerp(96, 120, t) - 30 * Math.sin(Math.PI * t) }));
    }
    spokes.push(annulus(HUB - 10, 175));
    return { spokes, ridges: [], lugs: 5 };
  },
};

// ---- assembly ------------------------------------------------------------------

function gradientStops(colors) {
  return colors.map((c, i) => `<stop offset="${f(i / (colors.length - 1))}" stop-color="${c}"/>`).join('');
}

/**
 * Returns an SVG fragment (defs + group) for a wheel. `id` must be unique in the document.
 * finish: key of FINISHES; lipFinish optional (for two-tone).
 */
export function wheelGroup(design, finish, id, lipFinish = finish) {
  const F = FINISHES[finish];
  const L = FINISHES[lipFinish];
  const g = DESIGNS[design]();
  const ruleAttr = g.evenodd ? ' fill-rule="evenodd"' : '';
  const spokeD = g.spokes.map((x) => (typeof x === 'string' ? x : x.d)).join('');
  // facet shading: each spoke has a lit half and a shaded half (light from top-left)
  const Lx = -0.55, Ly = -0.83;
  const facets = g.spokes
    .filter((x) => typeof x !== 'string')
    .map((x) => {
      const nl = [-Math.cos(x.a), -Math.sin(x.a)];
      const dl = nl[0] * Lx + nl[1] * Ly;
      const shade = (d, k) => (k > 0 ? `<path d="${d}" fill="#fff" opacity="${f(0.2 * k)}"/>` : `<path d="${d}" fill="#000" opacity="${f(0.38 * -k)}"/>`);
      return shade(x.left, dl) + shade(x.right, -dl);
    })
    .join('');
  const lipIn = g.deepLip ? 384 : 458;

  const defs = `
  <linearGradient id="${id}m" gradientUnits="userSpaceOnUse" x1="-430" y1="-470" x2="420" y2="480">${gradientStops(F.metal)}</linearGradient>
  <linearGradient id="${id}l" gradientUnits="userSpaceOnUse" x1="-500" y1="-500" x2="500" y2="500">${gradientStops(L.lip)}</linearGradient>
  <radialGradient id="${id}b" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${lipIn}">
    <stop offset="0.80" stop-color="#050506"/><stop offset="0.93" stop-color="#1b1c1f"/><stop offset="1" stop-color="#3a3c40"/>
  </radialGradient>
  <radialGradient id="${id}h" gradientUnits="userSpaceOnUse" cx="-24" cy="-30" r="150">${gradientStops([F.metal[0], F.metal[2], F.metal[6]])}</radialGradient>
  <radialGradient id="${id}n" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#d9dce0"/><stop offset="0.5" stop-color="#6a6e74"/><stop offset="1" stop-color="#1a1b1d"/></radialGradient>
  <radialGradient id="${id}c" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#3d4045"/><stop offset="1" stop-color="#0b0c0d"/></radialGradient>
  <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/></linearGradient>`;

  // barrel (inner well) visible between spokes near the rim
  const barrel = `<path d="${annulus(g.deepLip ? 300 : 398, lipIn)}" fill="url(#${id}b)"/>`;

  // spoke depth (side faces) then faces
  const depth = `<path d="${spokeD}" fill="${F.depth}"${ruleAttr} transform="translate(7 11)"/>`;
  const faces = `<path d="${spokeD}" fill="url(#${id}m)"${ruleAttr} stroke="rgba(0,0,0,${F.edge})" stroke-width="2"/>${facets}`;

  const ridges = (g.ridges || [])
    .map((rg) => {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const r = rg.r0 + (rg.r1 - rg.r0) * t;
        pts.push(pt(r, rg.theta + (rg.twist ? rg.twist(t) : 0) - deg(0.6)));
      }
      return `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="rgba(255,255,255,${F.ridge})" stroke-width="3" stroke-linecap="round"/>`;
    })
    .join('');

  const pockets = (g.pockets || [])
    .map((d) => `<path d="${d}" fill="${F.depth}" opacity="0.85"/><path d="${d}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" transform="translate(-2 -3)"/>`)
    .join('');

  // lip: outer polished/painted ring with bevel lines
  const lip = `
  <path d="${annulus(lipIn, R)}" fill="url(#${id}l)" fill-rule="evenodd"/>
  <circle r="${R - 2}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="4"/>
  <circle r="${R - 14}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
  <circle r="${lipIn + 2}" fill="none" stroke="rgba(0,0,0,0.6)" stroke-width="5"/>
  ${g.deepLip ? `<path d="${annulus(398, 452)}" fill="url(#${id}l)" opacity="0.55" fill-rule="evenodd"/><circle r="452" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="3"/>` : ''}`;

  // hub, lug nuts, centre cap
  const lugs = [];
  for (let i = 0; i < g.lugs; i++) {
    const a = (i * 2 * Math.PI) / g.lugs + Math.PI / g.lugs;
    const [x, y] = pt(80, a);
    const hex = Array.from({ length: 6 }, (_, k) => pt(15, (k * Math.PI) / 3).map((v, j) => f(v + (j ? y : x))).join(' ')).join('L');
    lugs.push(`<circle cx="${x}" cy="${y}" r="21" fill="#08090a"/><path d="M${hex}Z" fill="url(#${id}n)"/>`);
  }
  const hub = `
  <circle r="${HUB + 2}" fill="${F.depth}" transform="translate(4 7)"/>
  <circle r="${HUB}" fill="url(#${id}h)" stroke="rgba(0,0,0,0.45)" stroke-width="3"/>
  <circle r="${HUB - 16}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>
  ${lugs.join('')}
  <circle r="47" fill="url(#${id}c)" stroke="rgba(255,255,255,0.28)" stroke-width="2.5"/>
  <path d="M-17 15L0 -19L17 15L9 15L0 -3L-9 15Z" fill="#c9cdd2" opacity="0.9"/>`;

  return { defs, body: `<g>${barrel}${depth}${faces}${pockets}${ridges}${lip}${hub}</g>` };
}

export function wheelSVG(design, finish, lipFinish) {
  const w = wheelGroup(design, finish, 'w', lipFinish);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-512 -512 1024 1024">
<defs>${w.defs}</defs>
${w.body}
</svg>`;
}
