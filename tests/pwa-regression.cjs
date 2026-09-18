const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

assert.match(html, /rel="manifest" href="manifest\.webmanifest/);
assert.match(html, /rel="apple-touch-icon"/);
assert.match(html, /navigator\.serviceWorker\.register\('\.\/service-worker\.js'/);
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert(manifest.icons.some(icon => icon.sizes === '192x192' && icon.type === 'image/png'));
assert(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
for (const icon of manifest.icons) assert(fs.existsSync(path.join(root, icon.src)), `Missing ${icon.src}`);

// The installed admin must never serve cached sales, sessions, or pages.
assert.match(worker, /event\.respondWith\(fetch\(event\.request\)\)/);
assert.doesNotMatch(worker, /caches\.(?:match|open)|cache\.put/);

console.log('PASS installable app manifest, icons, and network-only admin service worker');
