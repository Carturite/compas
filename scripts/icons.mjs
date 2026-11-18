// Generates toolbar icons for each state. Run once: `node scripts/icons.mjs` (needs `sharp`).
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH ?? 'sharp');

const states = {
  idle: { ring: '#8a8f98', fill: 'none', dot: '#8a8f98' },
  focus: { ring: '#2f8f83', fill: '#2f8f83', dot: '#ffffff' },
  break: { ring: '#d9a441', fill: '#d9a441', dot: '#ffffff' },
  waiting: { ring: '#7b74c9', fill: '#7b74c9', dot: '#ffffff' },
};

const svg = ({ ring, fill, dot }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="54" fill="${fill}" stroke="${ring}" stroke-width="14"/>
  <circle cx="64" cy="64" r="16" fill="${dot}"/>
</svg>`;

mkdirSync('public/icons', { recursive: true });
for (const [name, colors] of Object.entries(states)) {
  for (const size of [16, 32, 48, 128]) {
    await sharp(Buffer.from(svg(colors))).resize(size, size).png().toFile(`public/icons/${name}-${size}.png`);
  }
}
console.log('icons ok');
