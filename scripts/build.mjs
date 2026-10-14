// Builds dist/chrome and dist/firefox (same files, one manifest) plus a zip for each.
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
manifest.version = pkg.version;
manifest.content_scripts[0].matches = manifest.host_permissions;

rmSync('dist', { recursive: true, force: true });
const out = 'dist/chrome';
await build({
  entryPoints: { content: 'src/content/index.ts', background: 'src/background/index.ts' },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: ['chrome121', 'firefox128'],
  // Readable output: easier to audit and accepted by AMO review without sources.
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
});
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
cpSync(out, 'dist/firefox', { recursive: true });

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
for (const target of ['chrome', 'firefox']) {
  const dir = `dist/${target}`;
  const zip = zipSync(Object.fromEntries(files(dir).map((f) => [relative(dir, f), readFileSync(f)])));
  writeFileSync(`dist/redactor-${target}.zip`, zip);
}
console.log(`built dist/ v${pkg.version}`);
