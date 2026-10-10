import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { prepareAuth, ownerLogin } from './auth-fixture.mjs';
process.env.PORT = '4174';
process.env.AUTH_TEST_MODE = '1';
const { server } = await import('../dev-server.mjs');
const { webkit } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await webkit.launch({ headless: true });
try {
  const context = await browser.newContext(); const page = await context.newPage();
  await prepareAuth(context);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('requestfailed', req => errors.push(`${req.url()} ${req.failure()?.errorText}`));
  const url = 'http://127.0.0.1:4174/mini-budget-app/budget-control/index.html';
  await page.goto(url); await ownerLogin(page); await page.waitForSelector('.big-amount');
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('.big-amount');
  const status = async () => page.evaluate(async () => ({ controller: navigator.serviceWorker.controller?.scriptURL, registrations: (await navigator.serviceWorker.getRegistrations()).map(r => r.active?.state), caches: await caches.keys(), files: (await Promise.all((await caches.keys()).map(async key => [key, (await (await caches.open(key)).keys()).map(r => r.url)]))), heading: document.querySelector('h1')?.textContent }));
  console.log('BEFORE', JSON.stringify(await status()));
  await context.setOffline(true);
  try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 }); console.log('OFFLINE_RELOAD_OK'); } catch (e) { console.log('RELOAD_ERROR', e.message); }
  console.log('AFTER', JSON.stringify(await status()));
  const fetchResults = await page.evaluate(async () => { const out = []; for (const name of ['index.html', 'app.mjs', 'core.mjs']) { try { const response = await fetch(name); out.push([name, response.status]); } catch (e) { out.push([name, e.message]); } } return out; });
  console.log('OFFLINE_FETCH', JSON.stringify(fetchResults)); console.log('ERRORS', JSON.stringify(errors));
  await context.setOffline(false);
  await page.reload(); await page.waitForSelector('.big-amount');
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await page.reload({ timeout: 15000 }); await page.waitForSelector('.big-amount');
  assert.match(await page.locator('.big-amount').textContent(), /3\s?929,92/);
  assert.equal(await page.evaluate(async () => (await fetch('core.mjs')).status), 200);
  console.log('REAL_SERVER_UNAVAILABLE: cached page and module successfully served');
} finally { server.closeAllConnections(); server.close(); await browser.close(); }
