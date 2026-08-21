const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/global.ts'],
  bundle: true,
  outfile: 'dist/global.js',
  platform: 'neutral',
  target: 'es2020',
  format: 'iife',
  sourcemap: false,
  minify: false,
};

if (isWatch) {
  esbuild.context(buildOptions).then((ctx) => {
    ctx.watch();
    console.log('Watching for changes in iina-plugin-homeassistant...');
  });
} else {
  esbuild.build(buildOptions).then(() => {
    console.log('Build completed successfully: dist/global.js');
  }).catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
}
