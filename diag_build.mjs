import esbuild from 'esbuild';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

await esbuild.build({
  entryPoints: ['src/diag_global.ts'],
  bundle: true, outfile: 'dist/diag_global.js',
  platform: 'neutral', target: 'es2020', format: 'iife',
});

const buildDir = path.join(rootDir, 'build_diag');
const bundleDir = path.join(buildDir, 'homeassistant.iinaplg');
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(path.join(bundleDir, 'dist'), { recursive: true });
fs.copyFileSync('dist/diag_global.js', path.join(bundleDir, 'dist', 'diag_global.js'));
const info = JSON.parse(fs.readFileSync('Info.json','utf8'));
info.globalEntry = 'dist/diag_global.js';
info.name = 'HA Diag';
info.identifier = 'io.iina.homeassistant.diag';
fs.writeFileSync(path.join(bundleDir, 'Info.json'), JSON.stringify(info, null, 2));
const prefFile = path.join(rootDir, 'preferences.html');
if (fs.existsSync(prefFile)) fs.copyFileSync(prefFile, path.join(bundleDir, 'preferences.html'));

const zipFile = path.join(buildDir, 'homeassistant-diag.iinaplgz');
const output = fs.createWriteStream(zipFile);
const archive = archiver('zip', { zlib: { level: 9 } });
output.on('close', () => console.log('Diag package: ' + zipFile + ' (' + archive.pointer() + ' bytes)'));
archive.pipe(output);
archive.directory(bundleDir, false);
archive.finalize();
