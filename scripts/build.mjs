// Builds dist/chrome and dist/firefox (same files, one manifest) plus a zip for each.
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

/** Icon: blue rounded square with text lines, the middle one blacked out (a redaction bar). */
function iconPng(size) {
  const px = (x, y) => {
    const u = (x + 0.5) / size, v = (y + 0.5) / size, r = 0.2;
    const dx = Math.max(r - u, u - (1 - r), 0), dy = Math.max(r - v, v - (1 - r), 0);
    if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
    const bar = (cy, h, x0, x1) => Math.abs(v - cy) <= h / 2 && u >= x0 && u <= x1;
    if (bar(0.5, 0.16, 0.18, 0.82)) return [17, 17, 17, 255];
    if (bar(0.27, 0.08, 0.2, 0.8) || bar(0.73, 0.08, 0.2, 0.6)) return [255, 255, 255, 255];
    return [31, 111, 235, 255];
  };
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) raw.set(px(x, y), y * (size * 4 + 1) + 1 + x * 4);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
manifest.version = pkg.version;
manifest.content_scripts[0].matches = manifest.host_permissions;

rmSync('dist', { recursive: true, force: true });
const out = 'dist/chrome';
await build({
  entryPoints: {
    content: 'src/content/index.ts',
    background: 'src/background/index.ts',
    options: 'src/options/main.ts',
    popup: 'src/popup/main.ts',
  },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: ['chrome121', 'firefox128'],
  // Readable output: easier to audit and accepted by AMO review without sources.
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
});
const icons = Object.fromEntries([16, 32, 48, 128].map((s) => [s, `icons/${s}.png`]));
mkdirSync(join(out, 'icons'), { recursive: true });
for (const [s, f] of Object.entries(icons)) writeFileSync(join(out, f), iconPng(Number(s)));
manifest.icons = icons;
manifest.action.default_icon = icons;
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
for (const f of ['src/options/options.html', 'src/options/page.css', 'src/popup/popup.html']) cpSync(f, join(out, f.split('/').pop()));
cpSync(out, 'dist/firefox', { recursive: true });

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
for (const target of ['chrome', 'firefox']) {
  const dir = `dist/${target}`;
  const zip = zipSync(Object.fromEntries(files(dir).map((f) => [relative(dir, f), readFileSync(f)])));
  writeFileSync(`dist/redactor-${target}.zip`, zip);
}
console.log(`built dist/ v${pkg.version}`);
