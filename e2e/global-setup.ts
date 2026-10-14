import { build } from 'esbuild';

// Bundle the fixture pages' scripts (React, ProseMirror, Quill are dev-only, served locally).
export default async function globalSetup(): Promise<void> {
  await build({
    entryPoints: ['textarea', 'react', 'prosemirror', 'quill', 'rejecting', 'file'].map((n) =>
      `e2e/fixtures/${n}.${n === 'react' ? 'tsx' : 'ts'}`),
    outdir: 'e2e/.served',
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
}
