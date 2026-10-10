import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
const UID = 'BQbwiHs1Y3Wsz1yaT2JizWVWOLG2', project = 'demo-budget-control';
const base = 'http://127.0.0.1:4173/mini-budget-app/';
const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const engine = process.env.BROWSER_ENGINE || 'chromium';
const browser = await playwright[engine].launch({ ...(engine === 'chromium' ? { channel: 'chrome' } : {}), headless: true });
const environment = await initializeTestEnvironment({ projectId: project, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const config = (await readFile(new URL('../../shared/firebase-config.js', import.meta.url), 'utf8')).replace("projectId: 'minibudget-4e474'", `projectId: '${project}'`).replace("apiKey: 'AIzaSyBzHEcrGfwek6FzguWbSGSfMgebMy1sBe8'", "apiKey: 'demo-api-key'").replace("authDomain: 'minibudget-4e474.firebaseapp.com'", "authDomain: '127.0.0.1'").replace("  sdkVersion:", "  emulators: true,\n  sdkVersion:");
const reports = [], errors = [], transportWarnings = [];
const out = fileURLToPath(new URL('../test-results/', import.meta.url)); await mkdir(out, { recursive: true });
const pages = ['minibudget/index.html', 'tattoo/tattoo-index.html', 'envelopes/envelopes.html', 'TattooCRM/index.html', 'budget-control/index.html'];
async function context(options = {}) {
  const ctx = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Berlin', serviceWorkers: 'block', ...options });
  await ctx.route('**/shared/firebase-config.js', route => route.fulfill({ contentType: 'text/javascript', body: config }));
  return ctx;
}
try {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/mini/expenses/car-seed'), { category: 'Топливо', amount: 45.67, date: '2026-10-10', note: 'AUTH-PRIVATE-CAR', tag: '', mileage: 12345, liters: 25 });
    await setDoc(doc(db, 'incomes/income-seed'), { studio: 'Test Studio', amount: 500, date: '2026-10-10', workType: 'Тату', isInvoice: false, created: '2026-10-10T12:00:00Z' });
    await setDoc(doc(db, 'expenses/transport-seed'), { studio: 'Test Studio', amount: 20, date: '2026-10-10', expenseType: 'Транспорт', created: '2026-10-10T12:00:00Z' });
    await setDoc(doc(db, 'studios/studio-seed'), { studio: 'Test Studio', color: '#ffaa00', isDefault: true });
    await setDoc(doc(db, 'TattooCRM/app/clients/client-seed'), { id: 'client-seed', name: 'AUTH-PRIVATE-CLIENT', status: 'new', createdAt: '2026-10-10', updatedAt: '2026-10-10' });
    await setDoc(doc(db, 'TattooCRM/settings/global/default'), { sources: ['Google'], styles: [], zones: [], supplies: [], suppliesDict: {}, calendarId: '' });
  });
  const imported = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchCreate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ users: [{ localId: UID, email: 'owner@example.com', emailVerified: true, displayName: 'Owner', providerUserInfo: [{ providerId: 'google.com', rawId: 'owner-google', email: 'owner@example.com', displayName: 'Owner' }] }] }) });
  assert.equal(imported.ok, true, await imported.text());
  const ctx = await context({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', error => {
    // WebKit Windows reports cancelled emulator WebChannel HTTP requests here
    // during navigation. Keep these visible separately from application exceptions.
    if (engine === 'webkit' && /^\/127\.0\.0\.1:8080\/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel\?.* due to access control checks\.$/.test(error.message)) transportWarnings.push(error.message);
    else errors.push(error.message);
  });
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) console.log('BROWSER', message.type(), message.text()); });
  for (const path of pages) {
    let firestoreRequests = 0;
    const listener = request => { if (/8080/.test(request.url())) firestoreRequests++; };
    page.on('request', listener);
    await page.goto(base + path); await page.getByRole('button', { name: 'Войти через Google', exact: true }).waitFor();
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('my-apps-locked')), true);
    assert.equal(await page.locator('script[data-owner-src]').evaluateAll(els => els.every(el => !el.src)), true);
    assert.equal(firestoreRequests, 0); page.off('request', listener);
    reports.push(`${path}: signed out, no app execution or Firestore calls`);
  }
  await page.screenshot({ path: out + '/auth-guest-' + engine + '.png', fullPage: true });
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Войти через Google', exact: true }).click();
  const popup = await popupPromise;
  // The emulator renders accounts before its provider message handler is ready.
  await popup.getByText('Sign-in with Google.com', { exact: true }).waitFor();
  await Promise.all([popup.waitForEvent('close', { timeout: 10000 }), popup.getByText('owner@example.com', { exact: false }).click()]);
  try { await page.waitForSelector('.big-amount'); } catch (error) {
    console.log('FAIL_STATE', await page.evaluate(() => ({ uid: MyApps.auth?.currentUser?.uid, body: document.body.innerText, main: document.querySelector('#main')?.innerText })));
    await page.screenshot({ path: out + '/auth-failure-' + engine + '.png', fullPage: true }); throw error;
  }
  assert.equal(await page.evaluate(() => MyApps.auth.currentUser.uid), UID);
  assert.equal(await page.evaluate(() => MyApps.auth.currentUser.providerData[0].providerId), 'google.com');
  reports.push('Actual Firebase SDK Google popup through Auth emulator; owner UID and provider accepted');
  // Continue verification below; use the same persisted default app session.
  for (const path of pages) {
    await page.goto(base + path);
    try { await page.waitForFunction(() => !document.documentElement.classList.contains('my-apps-locked')); }
    catch (error) { console.log('RESTORE_FAILURE', path, await page.evaluate(() => ({ uid: MyApps.auth?.currentUser?.uid, body: document.body.innerText }))); throw error; }
    assert.equal(await page.evaluate(() => MyApps.auth.currentUser.uid), UID);
    if (path.startsWith('minibudget')) await page.waitForFunction(() => expenses.some(expense => expense.note === 'AUTH-PRIVATE-CAR'));
    if (path.startsWith('tattoo/')) { await page.locator('#history-list').filter({ hasText: 'Транспорт' }).waitFor({ state: 'attached' }); }
    if (path.startsWith('envelopes')) await page.waitForSelector('.envelope-card-grid');
    if (path.startsWith('TattooCRM')) await page.waitForFunction(() => AppState.clients.some(client => client.name === 'AUTH-PRIVATE-CLIENT'));
    if (path.startsWith('budget-control')) {
      await page.waitForSelector('.big-amount');
      await page.locator('#month').fill('2026-10'); await page.locator('#month').dispatchEvent('change');
      await page.waitForFunction(() => document.querySelector('.directions')?.textContent.includes('45,67'));
    }
    reports.push(`${path}: shares owner session without another popup`);
  }
  await page.getByRole('button', { name: 'Добавить расход', exact: true }).click();
  await page.locator('[name=amount]').fill('12,34'); await page.locator('[name=categoryId]').selectOption('groceries');
  await page.locator('[name=date]').fill('2026-10-10'); await page.locator('textarea[name=description]').fill('AUTH-CLOUD-CRUD');
  await page.locator('#save-button').click(); await page.waitForFunction(() => !document.querySelector('#editor').open);
  await page.reload(); await page.waitForSelector('.big-amount');
  assert.equal(await page.evaluate(async uid => (await MyApps.db().collection(`budgetControl/${uid}/transactions`).get()).docs.some(doc => doc.data().description === 'AUTH-CLOUD-CRUD'), UID), true);
  reports.push('Budget Control cloud form creates real emulator transaction and restores it after reload');
  const other = await ctx.newPage(); await other.goto(base + 'minibudget/index.html');
  await other.waitForFunction(() => !document.documentElement.classList.contains('my-apps-locked'));
  await other.evaluate(() => MyApps.db().doc('users/mini/expenses/car-seed').update({ amount: 66.78 }));
  await page.waitForFunction(() => document.querySelector('.directions')?.textContent.includes('66,78'));
  await other.evaluate(() => MyApps.db().doc('users/mini/expenses/car-seed').delete());
  await page.waitForFunction(() => !document.querySelector('.directions')?.textContent.includes('66,78'));
  reports.push('Mini Budget changes and deletions update Budget Control live, with no copied expense');
  await page.screenshot({ path: out + '/auth-owner-' + engine + '.png', fullPage: true });
  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть данные этого браузера', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#mode-badge')?.textContent === 'На этом устройстве');
  await page.getByRole('button', { name: 'Открыть облачный бюджет', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#mode-badge')?.textContent !== 'На этом устройстве');
  assert.equal(await page.evaluate(async uid => (await MyApps.db().collection(`budgetControl/${uid}/transactions`).get()).size, UID), 1);
  reports.push('Owner can open local data and return to the same cloud budget without automatic imports or duplicate operations');
  await other.locator('#my-apps-account button').click();
  await other.getByRole('button', { name: 'Войти через Google', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Войти через Google', exact: true }).waitFor();
  assert.equal(await page.locator('#main').isVisible(), false);
  reports.push('Logout removes private UI and ends shared session in both tabs');
  await page.goBack(); await page.getByRole('button', { name: 'Войти через Google', exact: true }).waitFor();
  assert.equal(await page.locator('html').evaluate(el => el.classList.contains('my-apps-locked')), true);
  const foreignToken = [Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ iss: 'emulator', sub: 'emulator', aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, uid: 'outsider' })).toString('base64url'), ''].join('.');
  await page.evaluate(token => MyApps.auth.signInWithCustomToken(token), foreignToken);
  await page.getByRole('heading', { name: 'Нет доступа', exact: true }).waitFor();
  assert.equal(await page.locator('html').evaluate(el => el.classList.contains('my-apps-locked')), true);
  for (const path of pages) {
    let requests = 0; const count = req => { if (/8080/.test(req.url())) requests++; }; page.on('request', count);
    await page.goto(base + path); await page.getByRole('heading', { name: 'Нет доступа', exact: true }).waitFor();
    assert.equal(requests, 0); page.off('request', count);
  }
  reports.push('Foreign restored session shows Нет доступа in all five apps and makes zero Firestore requests; back navigation stays gated');
  for (const viewport of [{ width: 430, height: 932 }, { width: 1024, height: 1366 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: out + `/auth-denied-${engine}-${viewport.width}.png`, fullPage: true });
  }
  await ctx.close();
  assert.deepEqual(errors, []);
} finally {
  await writeFile(out + `/auth-${engine}-report.json`, JSON.stringify({ reports, errors, transportWarnings }, null, 2));
  await environment.cleanup(); await browser.close();
}
