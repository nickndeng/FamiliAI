// Build script: bundles each extension entry point with esbuild and copies static assets into dist/.
import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  target: 'chrome120',
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

const entries = [
  // Content scripts cannot be ES modules, so bundle as an IIFE (Immediately Invoked Function Expression).
  { entryPoints: ['src/content/index.ts'], outfile: 'dist/content.js', format: 'iife' },
  { entryPoints: ['src/background/index.ts'], outfile: 'dist/background.js', format: 'esm' },
  { entryPoints: ['src/popup/popup.ts'], outfile: 'dist/popup.js', format: 'iife' },
];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });

if (watch) {
  for (const entry of entries) {
    const ctx = await esbuild.context({ ...common, ...entry });
    await ctx.watch();
  }
  console.log('Watching src/ for changes (static/ is copied once; restart to pick up manifest or HTML edits).');
} else {
  await Promise.all(entries.map((entry) => esbuild.build({ ...common, ...entry })));
}
