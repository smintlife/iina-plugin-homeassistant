const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

const buildOptions = [
  {
    entryPoints: ['src/global.ts'],
    bundle: true,
    outfile: 'dist/global.js',
    platform: 'neutral',
    target: 'es2020',
    format: 'iife',
    sourcemap: false,
    minify: false,
  },
  {
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'dist/main.js',
    platform: 'neutral',
    target: 'es2020',
    format: 'iife',
    sourcemap: false,
    minify: false,
  },
];

if (isWatch) {
  Promise.all(buildOptions.map((opt) => esbuild.context(opt))).then((ctxs) => {
    ctxs.forEach((ctx) => ctx.watch());
    console.log('Watching for changes in iina-plugin-homeassistant...');
  });
} else {
  Promise.all(buildOptions.map((opt) => esbuild.build(opt))).then(() => {
    console.log('Build completed successfully: dist/global.js, dist/main.js');
  }).catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
}
