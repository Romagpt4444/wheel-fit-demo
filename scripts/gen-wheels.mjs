// Generates the demo wheel catalogue images.
//   assets-src/wheels/<id>.svg   – vector source
//   public/assets/wheels/<id>.webp      – 1024×1024, transparent, used by the canvas
//   public/assets/wheels/<id>-thumb.webp/.avif – 256×256 card thumbnails
// Run: node scripts/gen-wheels.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { wheelSVG } from './wheel-shapes.mjs';

export const DEMO_WHEELS = [
  { id: 'apex-s5', design: 's5', finish: 'silver' },
  { id: 'apex-mesh-r', design: 'mesh', finish: 'bronze' },
  { id: 'apex-mono', design: 'mono', finish: 'graphite' },
  { id: 'apex-turbine-t12', design: 'turbine', finish: 'polished' },
  { id: 'apex-y10', design: 'y10', finish: 'black' },
  { id: 'apex-split-7', design: 'split7', finish: 'graphite' },
  { id: 'apex-aero', design: 'aero', finish: 'silver' },
  { id: 'apex-multi-15', design: 'multi15', finish: 'silver' },
  { id: 'apex-vector-d', design: 'directional', finish: 'black' },
  { id: 'apex-forged-f6', design: 'forged6', finish: 'bronze' },
  { id: 'apex-deep-dish', design: 'dish', finish: 'graphite', lip: 'polished' },
  { id: 'apex-mesh-black', design: 'mesh', finish: 'black', lip: 'polished' },
];

const SRC = 'assets-src/wheels';
const OUT = 'public/assets/wheels';
await mkdir(SRC, { recursive: true });
await mkdir(OUT, { recursive: true });

for (const w of DEMO_WHEELS) {
  const svg = wheelSVG(w.design, w.finish, w.lip);
  await writeFile(`${SRC}/${w.id}.svg`, svg);
  const png = await sharp(Buffer.from(svg), { density: 72 }).resize(1024, 1024).png().toBuffer();
  await sharp(png).webp({ quality: 88, alphaQuality: 90, effort: 5 }).toFile(`${OUT}/${w.id}.webp`);
  await sharp(png).resize(256, 256).webp({ quality: 82, effort: 5 }).toFile(`${OUT}/${w.id}-thumb.webp`);
  await sharp(png).resize(256, 256).avif({ quality: 55, effort: 5 }).toFile(`${OUT}/${w.id}-thumb.avif`);
  console.log('wheel', w.id);
}
