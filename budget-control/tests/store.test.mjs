import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore, CloudStore, LOCAL_KEY } from '../store.mjs';
import { categoriesFor, planTotals } from '../core.mjs';
import { executeCommand } from '../commands.mjs';
function local() { const values = new Map(); return new LocalStore({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }); }
const expense = (overrides = {}) => ({ type: 'expense', amountCents: 4599, date: '2026-10-10', categoryId: 'groceries', description: 'Покупки', ...overrides });
const recurring = (overrides = {}) => ({ name: 'Аренда', amountCents: 120000, nextDate: '2026-01-31', categoryId: 'rent', enabled: true, interval: 1, unit: 'months', ...overrides });
test('initialization is once; CRUD persists across store instances', async () => {
  const store = local(); store.read();
  await store.command({ type: 'operation', id: 'a', data: expense() });
  const reopened = new LocalStore(store.storage); assert.equal(reopened.read().transactions.a.amountCents, 4599);
  await reopened.command({ type: 'operation', id: 'a', data: expense({ amountCents: 1500 }) });
  assert.equal(store.read().transactions.a.amountCents, 1500);
  await store.command({ type: 'delete-operation', id: 'a' }); assert.equal(Object.keys(store.read().transactions).length, 0);
  assert.equal(Object.keys(store.read().recurring).length, 0); assert.equal(Object.keys(store.read().payments).length, 0);
});
test('one-month and future plan edits preserve past and closed months', async () => {
  const store = local(); let settings = store.read().settings.main;
  const category = categoriesFor(settings, '2026-10').find(c => c.id === 'rent');
  await store.command({ type: 'category', id: 'rent', month: '2026-10', scope: 'month', data: { ...category, amountCents: 130000 } });
  settings = store.read().settings.main;
  assert.equal(planTotals(categoriesFor(settings, '2026-10')).total, 402992);
  assert.equal(planTotals(categoriesFor(settings, '2026-11')).total, 392992);
  await store.command({ type: 'close-month', month: '2026-10', currentMonth: '2026-11' });
  await store.command({ type: 'category', id: 'rent', month: '2026-09', scope: 'future', data: { ...category, amountCents: 140000 } });
  const db = store.read();
  assert.equal(categoriesFor(db.settings.main, '2026-08').find(c => c.id === 'rent').amountCents, 120000);
  assert.equal(categoriesFor(db.settings.main, '2026-11').find(c => c.id === 'rent').amountCents, 140000);
  assert.equal(categoriesFor(db.settings.main, '2026-10', db.plans['2026-10']).find(c => c.id === 'rent').amountCents, 130000);
  await assert.rejects(store.command({ type: 'operation', id: 'closed', data: expense() }), /закрыт/);
  await assert.rejects(store.command({ type: 'category', id: 'rent', month: '2026-10', scope: 'future', data: category }), /закрыт/);
});
test('manual records cannot impersonate an external category', async () => {
  const store = local(); await assert.rejects(store.command({ type: 'operation', id: 'x', data: expense({ categoryId: 'fuel' }) }), /источнике/);
});
test('payment confirmation is idempotent and retains schedule anchor', async () => {
  const store = local(); await store.command({ type: 'recurring', id: 'r', data: recurring() });
  const pay = { type: 'pay', id: 'r', dueDate: '2026-01-31', date: '2026-02-02', amountCents: 119900 };
  await store.command(pay); const duplicate = await store.command(pay);
  assert.equal(duplicate.alreadyPaid, true);
  let db = store.read(); assert.equal(Object.keys(db.transactions).length, 1); assert.equal(Object.keys(db.payments).length, 1);
  assert.equal(db.recurring.r.nextDate, '2026-02-28');
  await store.command({ ...pay, dueDate: '2026-02-28', date: '2026-02-28' });
  db = store.read(); assert.equal(db.recurring.r.nextDate, '2026-03-31');
  await assert.rejects(store.command({ type: 'delete-operation', id: 'payment_r_2026-01-31' }), /защищена/);
  await store.command({ type: 'delete-recurring', id: 'r' }); assert.equal(Object.keys(store.read().payments).length, 2);
});
test('linking an existing expense creates no duplicate and prevents reuse', async () => {
  const store = local(); await store.command({ type: 'operation', id: 'existing', data: expense({ categoryId: 'rent' }) });
  await store.command({ type: 'recurring', id: 'r', data: recurring() });
  await store.command({ type: 'pay', id: 'r', dueDate: '2026-01-31', linkedId: 'budget_control:existing' });
  assert.equal(Object.keys(store.read().transactions).length, 1);
  await assert.rejects(store.command({ type: 'pay', id: 'r', dueDate: '2026-02-28', linkedId: 'budget_control:existing' }), /уже связана/);
  await assert.rejects(store.command({ type: 'delete-operation', id: 'existing' }), /защищена/);
});
test('linking external source reads it atomically and never writes there', async () => {
  const store = local(); await store.command({ type: 'recurring', id: 'car', data: recurring({ categoryId: 'car-insurance' }) });
  const db = store.read(), writes = [];
  const tx = { get: async (table, id) => db[table][id], getExternal: async (path, id) => { assert.equal(path, 'users/mini/expenses'); assert.equal(id, 'source'); return { date: '2026-01-30', amount: 235, category: 'Страховка' }; }, set: (table, id, data) => { writes.push(table); db[table][id] = data; } };
  await executeCommand(tx, { type: 'pay', id: 'car', dueDate: '2026-01-31', linkedId: 'mini_budget:source' });
  assert.deepEqual(writes, ['links', 'payments', 'recurring']); assert.equal(db.payments['car_2026-01-31'].amountCents, 23500);
});
test('storage failures do not falsely report a successful write', async () => {
  const store = local(); const initial = store.read(); store.storage.setItem = () => { throw new Error('QuotaExceeded'); };
  await assert.rejects(store.command({ type: 'operation', id: 'a', data: expense() }), /QuotaExceeded/);
  assert.deepEqual(store.read(), initial);
});
test('CloudStore listeners replace edited/deleted documents and unsubscribe on period changes', async () => {
  const listeners = [], sdk = { collection: (...path) => path.slice(1).join('/'), doc: (...path) => path.slice(1).join('/'), query: (ref, ...where) => ({ ref, where }), where: (...args) => args, onSnapshot: (query, options, next, error) => { const item = { query, next, error, closed: false }; listeners.push(item); return () => { item.closed = true; }; } };
  const events = [], cloud = new CloudStore(sdk, {}, 'owner'); cloud.callback = event => events.push(event); cloud.settings = local().read().settings.main; cloud.range = { from: '2026-01-01', to: '2027-01-01' };
  cloud.subscribeSources(); assert.equal(listeners.length, 2); assert.ok(!listeners.some(l => l.query.ref === 'expenses'));
  const listener = listeners[0], snapshot = docs => ({ docs: docs.map(([id, data]) => ({ id, data: () => data })), metadata: { fromCache: false, hasPendingWrites: false } });
  listener.next(snapshot([['a', { amount: 10, date: '2026-10-10', category: 'Топливо' }]]));
  assert.equal(events.at(-1).data[0].amountCents, 1000);
  listener.next(snapshot([['a', { amount: 12, date: '2026-10-10', category: 'Топливо' }]])); assert.equal(events.at(-1).data.length, 1); assert.equal(events.at(-1).data[0].amountCents, 1200);
  listener.next(snapshot([])); assert.equal(events.at(-1).data.length, 0);
  listener.error({ code: 'permission-denied' }); assert.equal(events.at(-1).status.state, 'error');
  cloud.setRange({ from: '2025-01-01', to: '2026-01-01' }); assert.equal(listeners[0].closed, true);
  const count = events.length;
  listener.next(snapshot([['late', { amount: 99, date: '2026-10-10', category: 'Топливо' }]]));
  assert.equal(events.length, count, 'stale callbacks from the previous period must be ignored');
  cloud.stop(); assert.ok(listeners.every(l => l.closed));
});
test('source snapshots from cache stay explicitly incomplete, including empty cache', () => {
  let next;
  const sdk = { onSnapshot: (query, options, callback) => { next = callback; return () => {}; } };
  const cloud = new CloudStore(sdk, {}, 'owner'); const events = []; cloud.callback = e => events.push(e);
  cloud.listen('mini_budget', {}, () => ({ data: [] }));
  next({ metadata: { fromCache: true, hasPendingWrites: false } });
  assert.equal(events.at(-1).status.state, 'cached'); assert.equal(events.at(-1).status.lastSuccess, undefined);
  next({ metadata: { fromCache: false, hasPendingWrites: false } });
  assert.equal(events.at(-1).status.state, 'ready'); assert.ok(events.at(-1).status.lastSuccess);
  cloud.stop();
});

test('CloudStore recognizes a competing payment only after a fresh matching history read', async () => {
  const store = new CloudStore({}, {}, 'owner');
  const denied = Object.assign(new Error('Denied immutable overwrite'), { code: 'permission-denied' });
  let calls = 0;
  store.transaction = async callback => {
    if (++calls === 1) throw denied;
    return callback({ get: async (table, id) => {
      assert.equal(table, 'payments'); assert.equal(id, 'rent_2026-01-31');
      return { recurringId: 'rent', dueDate: '2026-01-31' };
    } });
  };
  assert.deepEqual(await store.command({ type: 'pay', id: 'rent', dueDate: '2026-01-31' }), { alreadyPaid: true });
  assert.equal(calls, 2);
});

test('CloudStore propagates real denial, unrelated payment history and other command failures', async () => {
  const denied = Object.assign(new Error('Denied'), { code: 'permission-denied' });
  for (const saved of [undefined, { recurringId: 'other', dueDate: '2026-01-31' }, { recurringId: 'rent', dueDate: '2026-02-28' }]) {
    const store = new CloudStore({}, {}, 'owner'); let calls = 0;
    store.transaction = async callback => ++calls === 1 ? Promise.reject(denied) : callback({ get: async () => saved });
    await assert.rejects(store.command({ type: 'pay', id: 'rent', dueDate: '2026-01-31' }), error => error === denied);
    assert.equal(calls, 2);
  }
  for (const [type, code] of [['operation', 'permission-denied'], ['pay', 'unavailable']]) {
    const store = new CloudStore({}, {}, 'owner'); let calls = 0;
    const error = Object.assign(new Error('Failure'), { code });
    store.transaction = async () => { calls++; throw error; };
    await assert.rejects(store.command({ type, id: 'rent', dueDate: '2026-01-31' }), result => result === error);
    assert.equal(calls, 1);
  }
});
