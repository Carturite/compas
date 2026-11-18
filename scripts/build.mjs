// Builds the extension into dist/ (Chrome and Chromium) and dist-firefox/: compiles TypeScript and copies static files.
// Only dependency: typescript.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, extname, relative } from 'node:path';

const STATIC = new Set(['.html', '.css', '.png', '.svg', '.json']);

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

execSync('tsc -p tsconfig.json', { stdio: 'inherit' });

function copyStatic(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) copyStatic(path);
    else if (STATIC.has(extname(name))) cpSync(path, join('dist', relative('src', path)));
  }
}
copyStatic('src');
cpSync('public', 'dist', { recursive: true });

// Firefox runs the same code; only the manifest differs.
rmSync('dist-firefox', { recursive: true, force: true });
cpSync('dist', 'dist-firefox', { recursive: true });
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
delete manifest.key; // Chrome's fixed ID; Firefox uses gecko.id instead
delete manifest.minimum_chrome_version;
manifest.background = { scripts: [manifest.background.service_worker], type: 'module' };
manifest.browser_specific_settings = {
  gecko: {
    id: 'compaz@compaz.app',
    strict_min_version: '128.0',
    data_collection_permissions: { required: ['none'] },
  },
};
writeFileSync('dist-firefox/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

console.log('✓ dist/ lista. Cárgala en chrome://extensions → "Cargar descomprimida".');
console.log('✓ dist-firefox/ lista. Cárgala en about:debugging → "Cargar complemento temporal…" → manifest.json.');
