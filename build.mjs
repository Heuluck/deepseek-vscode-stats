import { build, context } from 'esbuild';
import { solidPlugin } from 'esbuild-plugin-solid';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['webview/index.tsx'],
  bundle: true,
  outfile: 'media/chart.bundle.js',
  format: 'iife',
  plugins: [solidPlugin()],
  jsx: 'preserve',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: false,
  sourcemap: true,
  target: 'chrome120', // 对齐 VS Code 1.85 内置 Chromium
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[webview] watching…');
} else {
  await build(options);
  console.log('[webview] built → media/chart.bundle.js');
}
