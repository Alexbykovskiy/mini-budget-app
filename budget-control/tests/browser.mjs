import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareAuth, ownerLogin } from './auth-fixture.mjs';

const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const engine = process.env.BROWSER_ENGINE || 'chromium';
const browser = await playwright[engine].launch({ ...(engine === 'chromium' ? { channel: 'chrome' } : {}), headless: true });
const base = 'http://127.0.0.1:4173/mini-budget-app/';
const out = fileURLToPath(new URL('../test-results/', import.meta.url)); await mkdir(out, { recursive: true });
const report = [], errors = [], limitations = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'ru-RU', timezoneId: 'Europe/Berlin', colorScheme: 'light' });
  await prepareAuth(context);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-10T12:00:00Z'));
  await page.goto(`${base}index.html`);
  await page.getByRole('link', { name: 'Открыть Budget Control' }).click();
  await ownerLogin(page);
  await page.waitForSelector('.big-amount');
  assert.match(await page.locator('.big-amount').textContent(), /3\s?929,92/);
  assert.match(await page.locator('.plan-metrics').textContent(), /3\s?259,92/);
  assert.equal(await page.locator('.directions .panel').count(), 3);
  report.push('My Apps → Budget Control and all seed totals');
  await page.locator('#month').fill('2026-10'); await page.locator('#month').dispatchEvent('change');
  await page.getByRole('button', { name: 'Добавить расход', exact: true }).click();
  await page.locator('[name=amount]').fill('45,67');
  await page.locator('[name=categoryId]').selectOption('groceries');
  await page.locator('[name=date]').fill('2026-10-10');
  await page.locator('textarea[name=description]').fill('Тестовая покупка <script>alert(1)</script>');
  await page.locator('#save-button').click(); await page.waitForFunction(() => !document.querySelector('#editor').open);
  await page.locator('.directions').filter({ hasText: /45,67/ }).waitFor();
  await page.reload(); await page.waitForSelector('.big-amount');
  await page.locator('.directions').filter({ hasText: /45,67/ }).waitFor();
  await page.getByRole('link', { name: 'Расходы', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить операцию Продукты питания' }).click();
  await page.locator('[name=amount]').fill('50,12'); await page.locator('#save-button').click();
  await page.waitForFunction(() => !document.querySelector('#editor').open);
  await page.getByRole('button', { name: 'Удалить операцию', exact: true }).click(); await page.locator('#save-button').click();
  await page.waitForFunction(() => !document.querySelector('#editor').open);
  await page.locator('.total-strip').filter({ hasText: /0,00/ }).waitFor();
  report.push('Expense create, reload persistence, edit, delete; safe text rendering');
  await page.getByRole('link', { name: 'Доходы', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить доход' }).click();
  await page.locator('[name=amount]').fill('500'); await page.locator('[name=date]').fill('2026-10-09');
  await page.locator('[name=incomeSource]').fill('Другая работа'); await page.locator('#save-button').click();
  await page.waitForFunction(() => !document.querySelector('#editor').open);
  await page.locator('.total-strip').filter({ hasText: /500,00/ }).waitFor();
  report.push('Manual income is saved and included in the journal');
  await page.getByRole('link', { name: 'Платежи', exact: true }).click();
  await page.locator('[data-action=add-recurring]').click();
  await page.locator('[name=name]').fill('Тест аренды'); await page.locator('[name=amount]').fill('1200');
  await page.locator('[name=nextDate]').fill('2026-01-31'); await page.locator('[name=categoryId]').selectOption('rent');
  assert.equal(await page.locator('#custom-interval').isVisible(), false);
  await page.locator('[name=preset]').selectOption('custom'); assert.equal(await page.locator('#custom-interval').isVisible(), true);
  await page.locator('[name=preset]').selectOption('1');
  await page.locator('#save-button').click(); await page.waitForFunction(() => !document.querySelector('#editor').open);
  await page.getByRole('button', { name: 'Подтвердить оплату', exact: true }).click();
  await page.locator('[name=date]').fill('2026-10-10');
  await page.locator('#save-button').dblclick(); await page.waitForFunction(() => !document.querySelector('#editor').open);
  let db = await page.evaluate(() => JSON.parse(localStorage.getItem('budget-control.local.v1')));
  assert.equal(Object.keys(db.payments).length, 1); assert.equal(Object.values(db.recurring)[0].nextDate, '2026-02-28');
  assert.equal(Object.values(db.transactions).filter(t => t.paymentId).length, 1);
  report.push('Recurring payment creation, custom interval UI, confirmation and duplicate-click safety');
  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить категорию Продукты питания', exact: true }).click();
  await page.locator('[name=amount]').fill('470'); await page.locator('[name=scope]').selectOption('month');
  await page.locator('#save-button').click(); await page.waitForFunction(() => !document.querySelector('#editor').open);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('budget-control.local.v1')).settings.main.categories.find(c => c.id === 'groceries').overrides['2026-10']?.amountCents), 47000);
  await page.getByRole('link', { name: 'Главная', exact: true }).click();
  await page.locator('.big-amount').filter({ hasText: /3\s?949,92/ }).waitFor();
  await page.getByRole('button', { name: 'Следующий месяц', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.big-amount')?.textContent.includes('929,92'));
  assert.match(await page.locator('.big-amount').textContent(), /3\s?929,92/);
  await page.getByRole('button', { name: 'Предыдущий месяц', exact: true }).click();
  report.push('Category editing and one-month plan isolation');
  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: '＋ Категория' }).click();
  await page.locator('[name=name]').fill('Тестовая категория'); await page.locator('[name=amount]').fill('12,34');
  await page.locator('#save-button').click(); await page.waitForFunction(() => !document.querySelector('#editor').open);
  await page.getByRole('button', { name: 'Изменить категорию Тестовая категория', exact: true }).click();
  await page.locator('[name=archived]').check(); await page.locator('#save-button').click(); await page.waitForFunction(() => !document.querySelector('#editor').open);
  await page.locator('#show-archived').check();
  await page.getByRole('button', { name: 'Изменить категорию Тестовая категория', exact: true }).click();
  await page.locator('[name=archived]').uncheck(); await page.locator('#save-button').click(); await page.waitForFunction(() => !document.querySelector('#editor').open);
  report.push('Category creation, archive, and restore');
  for (const [label, width, height] of [['desktop', 1440, 1050], ['iphone-portrait', 430, 932], ['iphone-landscape', 932, 430], ['ipad-portrait', 1024, 1366], ['ipad-landscape', 1366, 1024]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.getByRole('link', { name: 'Настройки', exact: true }).click(); await page.locator('#theme-select').selectOption(theme);
      for (const section of ['Главная', 'Расходы', 'Платежи', 'Доходы', 'Аналитика', 'Настройки']) {
        await page.getByRole('link', { name: section, exact: true }).click();
        await page.waitForTimeout(70);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}/${theme}/${section} horizontally overflows`);
      }
      await page.getByRole('link', { name: 'Главная', exact: true }).click();
      await page.screenshot({ path: path.join(out, `${engine}-${label}-${theme}.png`), fullPage: true });
    }
    report.push(`${label}: all six screens, light + dark, no horizontal overflow`);
  }
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByRole('button', { name: 'Добавить расход', exact: true }).click();
  assert.ok(await page.locator('#editor').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#editor').isVisible(), false);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForSelector('.big-amount');
  await context.setOffline(true);
  try { await page.reload(); await page.waitForSelector('.big-amount'); report.push('Offline PWA cache reload'); }
  catch (error) {
    if (engine !== 'webkit' || !error.message.includes('WebKit encountered an internal error')) throw error;
    limitations.push('WebKit for Windows: Playwright offline emulation rejects navigation with an internal engine error, despite an active service worker and complete shell cache. See separate real-server-unavailable test.');
    await context.setOffline(false); await page.reload(); await page.waitForSelector('.big-amount'); await context.setOffline(true);
  }
  assert.match(await page.locator('#mode-badge').textContent(), /На этом устройстве/);
  await page.getByRole('button', { name: 'Добавить расход', exact: true }).click();
  await page.locator('[name=amount]').fill('7,89'); await page.locator('[name=date]').fill('2026-10-10');
  await page.locator('#save-button').click(); await page.waitForFunction(() => !document.querySelector('#editor').open);
  report.push('Offline local write; mobile modal and Escape');
  await context.setOffline(false); await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByRole('link', { name: '↖ My Apps', exact: true }).click();
  assert.match(await page.title(), /My Apps/);
  report.push('Budget Control → My Apps');
  // Two clients share the origin's lock, so an occurrence is committed only once.
  await page.goto(`${base}budget-control/index.html`); await page.waitForSelector('.big-amount');
  const second = await context.newPage(); await second.goto(`${base}budget-control/index.html`); await second.waitForSelector('.big-amount');
  await page.evaluate(async () => {
    const { LocalStore } = await import('./store.mjs');
    await new LocalStore().command({ type: 'recurring', id: 'concurrent-test', data: { name: 'Concurrency test', amountCents: 1000, nextDate: '2026-10-10', categoryId: 'rent', enabled: true, interval: 1, unit: 'months' } });
  });
  const simultaneousPay = () => (async () => { const { LocalStore } = await import('./store.mjs'); return new LocalStore().command({ type: 'pay', id: 'concurrent-test', dueDate: '2026-10-10', date: '2026-10-10', amountCents: 1000 }); })();
  const concurrentResults = await Promise.all([page.evaluate(simultaneousPay), second.evaluate(simultaneousPay)]);
  assert.equal(concurrentResults.filter(result => result?.alreadyPaid).length, 1);
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('budget-control.local.v1')).payments).filter(k => k.startsWith('concurrent-test')).length), 1);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('budget-control.local.v1')).recurring['concurrent-test'].nextDate), '2026-11-10');
  report.push('Two-tab concurrent payment produces exactly one operation and one confirmation');
  assert.deepEqual(errors, []);
  await context.close();
  // A clean profile captures the real first-run empty state, not financial fixtures.
  const clean = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'ru-RU', timezoneId: 'Europe/Berlin', colorScheme: 'light' });
  await prepareAuth(clean);
  const start = await clean.newPage(); await start.goto(`${base}budget-control/index.html`); await ownerLogin(start); await start.waitForSelector('.big-amount');
  await start.screenshot({ path: path.join(out, 'first-run-desktop.png'), fullPage: true });
  await start.setViewportSize({ width: 430, height: 932 }); await start.screenshot({ path: path.join(out, 'first-run-iphone.png'), fullPage: true }); await clean.close();
  await writeFile(path.join(out, `${engine}-report.json`), JSON.stringify({ engine, report, errors, limitations }, null, 2));
  console.log(JSON.stringify({ engine, passed: report, pageErrors: errors, limitations }, null, 2));
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) { await page.screenshot({ path: path.join(out, `${engine}-failure.png`), fullPage: true }); console.error((await page.locator('body').innerText()).slice(-6000)); console.error(await page.evaluate(() => JSON.parse(localStorage.getItem('budget-control.local.v1'))?.settings.main.categories.find(c => c.id === 'groceries'))); }
  throw error;
} finally { await browser.close(); }
