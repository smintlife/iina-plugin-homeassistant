const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const rootDir = path.resolve(__dirname, '..');
const distFile = path.join(rootDir, 'dist', 'global.js');
const infoFile = path.join(rootDir, 'Info.json');
const prefFile = path.join(rootDir, 'preferences.html');
const buildDir = path.join(rootDir, 'build');
const bundleDir = path.join(buildDir, 'homeassistant.iinaplg');
const zipFile = path.join(buildDir, 'homeassistant.iinaplgz');

if (!fs.existsSync(distFile)) {
  console.error('Error: dist/global.js does not exist. Run "npm run build" first.');
  process.exit(1);
}

// Clean and recreate build directory
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(bundleDir, { recursive: true });

// Copy files into .iinaplg directory
fs.copyFileSync(infoFile, path.join(bundleDir, 'Info.json'));
fs.copyFileSync(prefFile, path.join(bundleDir, 'preferences.html'));
fs.mkdirSync(path.join(bundleDir, 'dist'), { recursive: true });
fs.copyFileSync(distFile, path.join(bundleDir, 'dist', 'global.js'));

console.log(`Plugin bundle created at: ${bundleDir}`);

// Create zip archive (.iinaplgz)
const output = fs.createWriteStream(zipFile);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Package ready for IINA installation: ${zipFile} (${archive.pointer()} bytes)`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(bundleDir, false);
archive.finalize();
