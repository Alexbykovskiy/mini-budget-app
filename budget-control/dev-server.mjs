import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 4173);
export const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/') { response.writeHead(302, { Location: '/mini-budget-app/budget-control/index.html' }); response.end(); return; }
    const relative = decodeURIComponent(url.pathname).replace(/^\/mini-budget-app\//, '');
    const target = path.resolve(root, relative || 'index.html');
    if (!target.startsWith(root + path.sep) || relative.split(/[\\/]/).some(p => p.startsWith('.'))) throw new Error('Forbidden');
    const info = await stat(target), file = info.isDirectory() ? path.join(target, 'index.html') : target;
    if (!types[path.extname(file).toLowerCase()]) throw new Error('Forbidden');
    let body = await readFile(file);
    // Test-only server mode also covers service-worker fetches (browser routes do not).
    if (process.env.AUTH_TEST_MODE === '1' && file === path.join(root, 'shared', 'firebase-config.js')) {
      body = body.toString('utf8').replace("projectId: 'minibudget-4e474'", "projectId: 'demo-budget-control'").replace("apiKey: 'AIzaSyBzHEcrGfwek6FzguWbSGSfMgebMy1sBe8'", "apiKey: 'demo-api-key'").replace("authDomain: 'minibudget-4e474.firebaseapp.com'", "authDomain: '127.0.0.1'").replace('  sdkVersion:', '  emulators: true,\n  sdkVersion:');
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()], 'Cache-Control': 'no-cache' }); response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/mini-budget-app/budget-control/index.html${process.env.AUTH_TEST_MODE === '1' ? ' (Firebase emulators only)' : ''}`));
