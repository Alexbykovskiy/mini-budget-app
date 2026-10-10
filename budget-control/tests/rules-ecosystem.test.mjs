import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { doc, collection, setDoc, getDoc, getDocs, deleteDoc, updateDoc, setLogLevel, query, where, orderBy, limit, writeBatch, increment, deleteField, serverTimestamp, runTransaction } from 'firebase/firestore';
import { initialSettings } from '../seed.mjs';
import { CloudStore } from '../store.mjs';
import { initialize, linkKey, paymentKey } from '../commands.mjs';
import { categoriesFor } from '../core.mjs';
const UID = 'BQbwiHs1Y3Wsz1yaT2JizWVWOLG2';
let environment;
setLogLevel('silent');
const paths = ['users/mini/expenses/test', 'users/mini/tags/test', 'users/mini/reminders/test', 'incomes/test', 'expenses/test', 'studios/test', 'trips/test', 'envelopes/test', 'transactions/test', 'TattooCRM/app/clients/test', 'TattooCRM/app/reminders/test', 'TattooCRM/app/supplies/test', 'TattooCRM/app/marketing/test', 'TattooCRM/app/summary/costsManual', 'TattooCRM/app/clients/test/statusLogs/test', 'TattooCRM/settings/global/default'];
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required.');
  environment = await initializeTestEnvironment({ projectId: 'demo-budget-control', firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
});
after(async () => environment?.cleanup());
beforeEach(async () => environment.clearFirestore());
const payload = { type: 'expense', source: 'budget_control', currency: 'EUR', amountCents: 1200, date: '2026-10-10', createdAt: 'now', updatedAt: 'now' };
test('every audited legacy path supports owner CRUD and collection queries without changing schema', async () => {
  const db = environment.authenticatedContext(UID).firestore();
  for (const path of paths) {
    const ref = doc(db, path);
    await assertSucceeds(setDoc(ref, { legacy: true, amount: 20 }));
    await assertSucceeds(getDoc(ref));
    if (path !== 'TattooCRM/settings/global/default') await assertSucceeds(getDocs(collection(db, path.slice(0, path.lastIndexOf('/')))));
    await assertSucceeds(updateDoc(ref, { amount: 30 }));
    await assertSucceeds(deleteDoc(ref));
  }
});
test('anonymous and other Google accounts cannot read, list, create, edit or delete any finances', async () => {
  const protectedPaths = [...paths, ...Object.entries(budgetDocuments()).map(([table, [id]]) => `budgetControl/${UID}/${table}/${id}`), 'clients/legacy'];
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), batch = writeBatch(db);
    for (const path of paths) batch.set(doc(db, path), payload);
    batch.set(doc(db, 'clients/legacy'), payload);
    for (const [table, [id, data]] of Object.entries(budgetDocuments())) batch.set(doc(db, `budgetControl/${UID}/${table}/${id}`), data);
    await batch.commit();
  });
  for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('anonymous-user', { firebase: { sign_in_provider: 'anonymous' } }), environment.authenticatedContext('outsider', { firebase: { sign_in_provider: 'google.com' } })]) {
    const db = context.firestore();
    for (const path of protectedPaths) {
      const ref = doc(db, path);
      await assertFails(getDoc(ref));
      await assertFails(getDocs(collection(db, path.slice(0, path.lastIndexOf('/')))));
      await assertFails(setDoc(ref, { note: 'unauthorized' }, { merge: true }));
      await assertFails(updateDoc(ref, { note: 'unauthorized' }));
      await assertFails(setDoc(doc(db, `${path}-new`), payload));
      await assertFails(deleteDoc(ref));
    }
    await assertFails(setDoc(doc(db, 'budgetControl/outsider/settings/main'), initialSettings()));
    await assertFails(setDoc(doc(db, 'users/outsider/expenses/test'), payload));
    await assertFails(setDoc(doc(db, 'budgetControlAccess/outsider'), { enabled: true }));
    for (const [table, [id, data]] of Object.entries(budgetDocuments())) {
      const freshId = table === 'settings' ? id : table === 'plans' ? '2026-08' : `${id}-fresh`;
      await assertFails(setDoc(doc(db, `${base}/${table}/${freshId}`), data));
    }
  }
});
test('owner namespace and Budget Control money validation; immutable history; unknown paths denied', async () => {
  const db = environment.authenticatedContext(UID).firestore(), base = `budgetControl/${UID}`;
  await assertSucceeds(setDoc(doc(db, `${base}/settings/main`), { ...initialSettings(), createdAt: 'now', updatedAt: 'now' }));
  await assertSucceeds(setDoc(doc(db, `${base}/transactions/test`), payload));
  await assertFails(setDoc(doc(db, `${base}/transactions/negative`), { ...payload, amountCents: -1 }));
  await assertFails(setDoc(doc(db, `${base}/transactions/fraction`), { ...payload, amountCents: 1.2 }));
  await assertFails(setDoc(doc(db, 'budgetControl/outsider/transactions/test'), payload));
  await assertSucceeds(setDoc(doc(db, `${base}/payments/test`), { amountCents: 1200, operationId: 'test', createdAt: 'now', updatedAt: 'now' }));
  await assertFails(updateDoc(doc(db, `${base}/payments/test`), { amountCents: 50 }));
  await assertFails(deleteDoc(doc(db, `${base}/payments/test`)));
  await assertSucceeds(deleteDoc(doc(db, `${base}/transactions/test`)));
  await assertFails(setDoc(doc(db, 'unknown/test'), payload));
  await assertFails(setDoc(doc(db, 'users/foreign/expenses/test'), payload));
  await assertFails(setDoc(doc(db, 'clients/legacy'), payload));
});

const base = `budgetControl/${UID}`;
const ownerDB = () => environment.authenticatedContext(UID, { firebase: { sign_in_provider: 'google.com' } }).firestore();
const expense = (overrides = {}) => ({ type: 'expense', amountCents: 4599, date: '2026-10-10', categoryId: 'groceries', description: 'Покупки', ...overrides });
const recurring = (overrides = {}) => ({ name: 'Аренда', amountCents: 120000, nextDate: '2026-01-31', categoryId: 'rent', enabled: true, interval: 1, unit: 'months', ...overrides });
function budgetDocuments() {
  return {
    settings: ['main', { ...initialSettings(), createdAt: 'now', updatedAt: 'now' }],
    transactions: ['test', payload],
    recurring: ['test', { ...recurring(), createdAt: 'now', updatedAt: 'now' }],
    payments: ['test', { amountCents: 1200, operationId: 'budget_control:test', createdAt: 'now', updatedAt: 'now' }],
    links: ['budget_control%3Atest', { paymentId: 'test', createdAt: 'now' }],
    plans: ['2026-09', { closed: true, categories: [], createdAt: 'now', updatedAt: 'now' }],
  };
}
async function cloud() {
  const db = ownerDB(), store = new CloudStore(sdk, db, UID);
  await assertSucceeds(store.transaction(initialize));
  return { db, store, read: async (table, id) => (await getDoc(store.ref(table, id))).data() };
}

test('Budget Control initializes once, exports every collection and queries sources by actual date range', async () => {
  const { db, store, read } = await cloud();
  const initial = await read('settings', 'main');
  await assertSucceeds(store.transaction(initialize));
  assert.deepEqual(await read('settings', 'main'), initial);
  await assertSucceeds(setDoc(doc(db, 'users/mini/expenses/source'), { amount: 10.25, date: '2026-10-10', category: 'Топливо' }));
  await assertSucceeds(setDoc(doc(db, 'incomes/source'), { amount: 200, date: '2026-10-10', studio: 'Studio' }));
  store.range = { from: '2026-10-01', to: '2026-11-01' };
  for (const path of [`${base}/transactions`, 'users/mini/expenses', 'incomes']) {
    await assertSucceeds(getDocs(store.ranged(collection(db, path))));
  }
  const exported = await assertSucceeds(store.exportData());
  assert.deepEqual(Object.keys(exported).sort(), Object.keys(budgetDocuments()).sort());
});

test('Budget Control creates, edits, archives categories and preserves month-specific versions', async () => {
  const { store, read } = await cloud();
  const data = { name: 'Новая категория', group: 'Прочее', amountCents: 0, periodMonths: 1, direction: 'home', required: false, kind: 'average', actualSource: 'budget_control', archived: false };
  await assertSucceeds(store.command({ type: 'category', id: 'custom', month: '2026-10', scope: 'future', data }));
  await assertSucceeds(store.command({ type: 'category', id: 'custom', month: '2026-10', scope: 'month', data: { ...data, amountCents: 2500 } }));
  let settings = await read('settings', 'main');
  assert.equal(categoriesFor(settings, '2026-10').find(c => c.id === 'custom').amountCents, 2500);
  assert.equal(categoriesFor(settings, '2026-11').find(c => c.id === 'custom').amountCents, 0);
  await assertSucceeds(store.command({ type: 'category', id: 'custom', month: '2026-11', scope: 'future', data: { ...data, archived: true } }));
  settings = await read('settings', 'main');
  assert.equal(categoriesFor(settings, '2026-11').find(c => c.id === 'custom').archived, true);
  await assertSucceeds(store.command({ type: 'settings', data: { historyStart: '2026-01-01' } }));
  assert.equal((await read('settings', 'main')).historyStart, '2026-01-01');
});

for (const type of ['expense', 'income']) test(`Budget Control actual transaction supports ${type} create, edit and delete`, async () => {
  const { store, read } = await cloud();
  const data = type === 'expense' ? expense() : { type, incomeSource: 'Зарплата', amountCents: 200000, date: '2026-10-10' };
  await assertSucceeds(store.command({ type: 'operation', id: 'manual', data }));
  const original = await read('transactions', 'manual');
  await assertSucceeds(store.command({ type: 'operation', id: 'manual', data: { ...data, amountCents: 5000 } }));
  const edited = await read('transactions', 'manual');
  assert.equal(edited.amountCents, 5000);
  assert.equal(edited.createdAt, original.createdAt);
  await assertSucceeds(store.command({ type: 'delete-operation', id: 'manual' }));
  assert.equal(await read('transactions', 'manual'), undefined);
});

for (const unit of ['months', 'days']) test(`Budget Control recurring CRUD and enable/disable with ${unit} schedule`, async () => {
  const { store, read } = await cloud();
  await assertSucceeds(store.command({ type: 'recurring', id: 'rent', data: recurring({ unit }) }));
  await assertSucceeds(store.command({ type: 'recurring', id: 'rent', data: recurring({ unit, amountCents: 125000, enabled: false }) }));
  assert.equal((await read('recurring', 'rent')).enabled, false);
  await assertSucceeds(store.command({ type: 'recurring', id: 'rent', data: recurring({ unit, amountCents: 125000 }) }));
  assert.equal((await read('recurring', 'rent')).amountCents, 125000);
  await assertSucceeds(store.command({ type: 'delete-recurring', id: 'rent' }));
  assert.equal(await read('recurring', 'rent'), undefined);
});

test('payment confirms four documents atomically, uses encoded link IDs and is idempotent', async () => {
  const { db, store, read } = await cloud();
  const id = '17000000-0000-4000-8000-000000000001', due = '2026-01-31';
  await store.command({ type: 'recurring', id, data: recurring() });
  const command = { type: 'pay', id, dueDate: due, date: '2026-02-02', amountCents: 119900 };
  await assertSucceeds(store.command(command));
  const key = paymentKey(id, due), operationId = `budget_control:payment_${key}`;
  assert.equal((await read('payments', key)).operationId, operationId);
  assert.equal((await read('links', linkKey(operationId))).paymentId, key);
  assert.equal((await read('transactions', `payment_${key}`)).paymentId, key);
  assert.equal((await read('recurring', id)).nextDate, '2026-02-28');
  assert.deepEqual(await assertSucceeds(store.command(command)), { alreadyPaid: true });
  assert.equal((await getDocs(store.collection('transactions'))).size, 1);
  assert.equal((await getDocs(store.collection('payments'))).size, 1);
  await assertSucceeds(store.command({ ...command, dueDate: '2026-02-28', date: '2026-02-28' }));
  assert.equal((await read('recurring', id)).nextDate, '2026-03-31');
  const operation = doc(db, `${base}/transactions/payment_${key}`);
  await assertFails(updateDoc(operation, { amountCents: 1 }));
  await assertFails(deleteDoc(operation));
  await assertSucceeds(store.command({ type: 'delete-recurring', id }));
  assert.equal((await getDocs(store.collection('payments'))).size, 2);
});

test('simultaneous payment confirmations retry successfully without duplicate history', async () => {
  const { store } = await cloud();
  const secondTab = new CloudStore(sdk, ownerDB(), UID);
  await store.command({ type: 'recurring', id: 'race', data: recurring() });
  const command = { type: 'pay', id: 'race', dueDate: '2026-01-31', date: '2026-01-31', amountCents: 120000 };
  const settled = await Promise.allSettled([store.command(command), secondTab.command(command)]);
  for (const result of settled) assert.equal(result.status, 'fulfilled', result.reason?.message);
  const results = settled.map(result => result.value);
  assert.equal(results.filter(r => r?.alreadyPaid).length, 1);
  for (const table of ['transactions', 'payments', 'links']) assert.equal((await getDocs(store.collection(table))).size, 1);
  assert.equal((await getDoc(store.ref('recurring', 'race'))).data().nextDate, '2026-02-28');
});

test('payment permission denial with no winning payment remains an error and writes nothing', async () => {
  const { store, read } = await cloud();
  await store.command({ type: 'recurring', id: 'invalid', data: recurring() });
  await environment.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), `${base}/recurring/invalid`), { createdAt: 123 }));
  await assertFails(store.command({ type: 'pay', id: 'invalid', dueDate: '2026-01-31', date: '2026-01-31', amountCents: 120000 }));
  for (const table of ['transactions', 'payments', 'links']) assert.equal((await getDocs(store.collection(table))).size, 0);
  assert.equal((await read('recurring', 'invalid')).nextDate, '2026-01-31');
});

test('payment conflict recovery does not grant anonymous or foreign clients access', async () => {
  for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('outsider')]) {
    const store = new CloudStore(sdk, context.firestore(), UID);
    await assertFails(store.command({ type: 'pay', id: 'protected', dueDate: '2026-01-31', date: '2026-01-31', amountCents: 120000 }));
  }
});

test('link existing own expense without rewriting or copying it; exists protects raw SDK writes', async () => {
  const { store, read } = await cloud();
  const id = '3ecbd075-93e6-4fa8-a76b-0a59b094c970';
  await store.command({ type: 'operation', id, data: expense({ categoryId: 'rent' }) });
  const original = await read('transactions', id);
  await store.command({ type: 'recurring', id: 'link-rent', data: recurring() });
  await assertSucceeds(store.command({ type: 'pay', id: 'link-rent', dueDate: '2026-01-31', linkedId: `budget_control:${id}` }));
  assert.deepEqual(await read('transactions', id), original);
  assert.equal((await getDocs(store.collection('transactions'))).size, 1);
  assert.equal((await read('links', linkKey(`budget_control:${id}`))).paymentId, 'link-rent_2026-01-31');
  assert.equal((await read('payments', 'link-rent_2026-01-31')).linked, true);
  await assertFails(updateDoc(store.ref('transactions', id), { amountCents: 200 }));
  await assertFails(setDoc(store.ref('transactions', id), { ...original, amountCents: 200 }));
  await assertFails(deleteDoc(store.ref('transactions', id)));
  await assert.rejects(store.command({ type: 'pay', id: 'link-rent', dueDate: '2026-02-28', linkedId: `budget_control:${id}` }), /уже связана/);
});

test('link Mini Budget expense reads source transactionally and leaves legacy source unchanged', async () => {
  const { db, store, read } = await cloud();
  const source = doc(db, 'users/mini/expenses/SourceAutoID012345678');
  const original = { amount: 235, date: '2026-01-30', category: 'Страховка', note: 'Исходная запись' };
  await setDoc(source, original);
  await store.command({ type: 'recurring', id: 'car', data: recurring({ categoryId: 'car-insurance' }) });
  await assertSucceeds(store.command({ type: 'pay', id: 'car', dueDate: '2026-01-31', linkedId: 'mini_budget:SourceAutoID012345678' }));
  assert.deepEqual((await getDoc(source)).data(), original);
  assert.equal((await getDocs(store.collection('transactions'))).size, 0);
  assert.equal((await read('payments', 'car_2026-01-31')).amountCents, 23500);
  assert.equal((await read('links', 'mini_budget%3ASourceAutoID012345678')).paymentId, 'car_2026-01-31');
});

for (const id of ['3ecbd075-93e6-4fa8-a76b-0a59b094c970', 'AutoID0123456789abcdZ', 'payment_recurring-id_2026-10-10']) {
  test(`exists uses the exact encodeURIComponent link document for ${id}`, async () => {
    const db = ownerDB(), ref = doc(db, `${base}/transactions/${id}`);
    await setDoc(ref, payload);
    await setDoc(doc(db, `${base}/links/${linkKey(`mini_budget:${id}`)}`), { paymentId: 'unrelated' });
    await setDoc(doc(db, `${base}/links/budget_control:${id}`), { paymentId: 'raw-colon-is-wrong' });
    await assertSucceeds(updateDoc(ref, { amountCents: 2000 }));
    await setDoc(doc(db, `${base}/links/${linkKey(`budget_control:${id}`)}`), { paymentId: 'matching' });
    await assertFails(updateDoc(ref, { amountCents: 3000 }));
    await assertFails(deleteDoc(ref));
  });
}

test('month closing transaction creates an immutable snapshot', async () => {
  const { store, read } = await cloud();
  await assertSucceeds(store.command({ type: 'close-month', month: '2026-09', currentMonth: '2026-10' }));
  const plan = await read('plans', '2026-09');
  assert.equal(plan.closed, true);
  assert.ok(plan.categories.length > 0);
  await assertFails(updateDoc(store.ref('plans', '2026-09'), { closed: false }));
  await assertFails(deleteDoc(store.ref('plans', '2026-09')));
  await assert.rejects(store.command({ type: 'operation', id: 'closed', data: expense({ date: '2026-09-10' }) }), /закрыт/);
});

for (const table of ['payments', 'links', 'plans']) test(`${table} history cannot be replaced or deleted`, async () => {
  const db = ownerDB(), [id, data] = budgetDocuments()[table], ref = doc(db, `${base}/${table}/${id}`);
  await assertSucceeds(setDoc(ref, data));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(getDocs(collection(db, `${base}/${table}`)));
  await assertFails(setDoc(ref, data));
  await assertFails(deleteDoc(ref));
});

test('owner cannot use another namespace, unsupported collections, parent docs or old CRM writes', async () => {
  const db = ownerDB();
  for (const [table, [id, data]] of Object.entries(budgetDocuments())) {
    const ref = doc(db, `budgetControl/foreign/${table}/${id}`);
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(db, `budgetControl/foreign/${table}`)));
    await assertFails(setDoc(ref, data));
    await assertFails(deleteDoc(ref));
  }
  for (const path of ['budgetControlAccess/' + UID, 'budgetControl/' + UID, 'budgetControl/' + UID + '/unknown/test', 'users/mini', 'users/mini/unknown/test', 'users/foreign/expenses/test', 'TattooCRM/app', 'TattooCRM/app/unknown/test', 'TattooCRM/settings/global/other', 'unknown/test']) {
    await assertFails(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), payload));
  }
  await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'clients/old'), { name: 'Legacy' }));
  await assertSucceeds(getDoc(doc(db, 'clients/old')));
  await assertSucceeds(getDocs(collection(db, 'clients')));
  await assertFails(updateDoc(doc(db, 'clients/old'), { name: 'Changed' }));
  await assertFails(deleteDoc(doc(db, 'clients/old')));
});

test('transaction schema rejects invalid money, source, type, currency, date and changed createdAt', async () => {
  const db = ownerDB();
  const invalid = [{ amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.2 }, { amountCents: 10000000001 }, { amountCents: '100' }, { source: 'mini_budget' }, { currency: 'USD' }, { type: 'transfer' }, { date: '10.10.2026' }, { createdAt: 123 }];
  for (const [i, fields] of invalid.entries()) await assertFails(setDoc(doc(db, `${base}/transactions/invalid-${i}`), { ...payload, ...fields }));
  const ref = doc(db, `${base}/transactions/valid`);
  await assertSucceeds(setDoc(ref, { ...payload, amountCents: 10000000000 }));
  await assertFails(updateDoc(ref, { createdAt: 'changed' }));
  await assertSucceeds(deleteDoc(ref));
});

test('settings and recurring schema validate actual app payloads', async () => {
  const db = ownerDB(), settings = budgetDocuments().settings[1], regular = budgetDocuments().recurring[1];
  await assertFails(setDoc(doc(db, `${base}/settings/main`), { ...settings, integrations: { ...settings.integrations, tattooExpenses: true } }));
  await assertFails(setDoc(doc(db, `${base}/settings/other`), settings));
  for (const [i, fields] of [{ interval: 0 }, { interval: 3661 }, { interval: 1.5 }, { unit: 'weeks' }, { enabled: 'true' }, { nextDate: '31.01.2026' }, { name: 42 }, { amountCents: 0 }].entries()) {
    await assertFails(setDoc(doc(db, `${base}/recurring/invalid-${i}`), { ...regular, ...fields }));
  }
});

test('actual legacy filtered and ordered queries remain accessible', async () => {
  const db = ownerDB();
  const queries = [
    query(collection(db, 'users/mini/expenses'), orderBy('date', 'desc')),
    query(collection(db, 'users/mini/reminders'), orderBy('date', 'asc')),
    query(collection(db, 'envelopes'), orderBy('created', 'asc')),
    query(collection(db, 'envelopes'), where('isMiniBudget', '==', true), limit(1)),
    query(collection(db, 'envelopes'), where('isPrimary', '==', true), limit(1)),
    query(collection(db, 'transactions'), where('envelopeId', '==', 'env'), orderBy('date', 'desc')),
    query(collection(db, 'transactions'), where('envelopeId', '==', 'env'), where('date', '>=', '2026-10-01')),
    query(collection(db, 'trips'), where('studio', '==', 'Studio'), where('isDefaultCover', '==', true), limit(1)),
    ...['incomes', 'expenses'].map(path => query(collection(db, path), where('studio', '==', 'Studio'), where('date', '>=', '2026-10-01'), where('date', '<=', '2026-10-31'), orderBy('date', 'asc'))),
    query(collection(db, 'TattooCRM/app/reminders'), where('clientId', '==', 'client')),
    query(collection(db, 'TattooCRM/app/reminders'), orderBy('date', 'asc')),
    query(collection(db, 'TattooCRM/app/clients/client/statusLogs'), orderBy('ts', 'desc')),
    ...['clients', 'supplies'].map(path => query(collection(db, 'TattooCRM/app/' + path), orderBy('updatedAt', 'desc'))),
    query(collection(db, 'TattooCRM/app/marketing'), orderBy('date', 'asc')),
  ];
  for (const q of queries) await assertSucceeds(getDocs(q));
});

test('Mini Budget legacy transaction adjusts its shared envelope, reminder batch permits field transforms', async () => {
  const db = ownerDB(), ref = doc(db, 'envelopes/mini');
  await setDoc(ref, { current: 100, isMiniBudget: true });
  const snapshot = await getDocs(query(collection(db, 'envelopes'), where('isMiniBudget', '==', true), limit(1)));
  await assertSucceeds(runTransaction(db, async tx => {
    const saved = await tx.get(snapshot.docs[0].ref);
    tx.update(saved.ref, { current: (saved.data().current || 0) - 20.5 });
  }));
  assert.equal((await getDoc(ref)).data().current, 79.5);
  const batch = writeBatch(db);
  for (let i = 0; i < 30; i++) batch.set(doc(db, `users/mini/reminders/reminder-${i}`), { mileage: 100000, done: true, updatedAt: serverTimestamp() }, { merge: true });
  await assertSucceeds(batch.commit());
  assert.equal((await getDocs(collection(db, 'users/mini/reminders'))).size, 30);
});

test('Envelopes transfer transaction and month-start increment batch preserve balances', async () => {
  const db = ownerDB(), from = doc(db, 'envelopes/from'), to = doc(db, 'envelopes/to');
  await setDoc(from, { current: 100 }); await setDoc(to, { current: 20 });
  await assertSucceeds(runTransaction(db, async tx => {
    const a = await tx.get(from), b = await tx.get(to);
    tx.update(from, { current: a.data().current - 30 });
    tx.update(to, { current: b.data().current + 30 });
  }));
  const batch = writeBatch(db);
  batch.update(from, { current: 0 }); batch.update(to, { current: increment(70) });
  batch.set(doc(db, 'transactions/history'), { type: 'transfer', amount: 70, date: '2026-10-10', fromId: 'from', toId: 'to' });
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(from)).data().current, 0);
  assert.equal((await getDoc(to)).data().current, 120);
  const reset = writeBatch(db);
  reset.update(to, { current: 0 }); reset.delete(doc(db, 'transactions/history'));
  await assertSucceeds(reset.commit());
});

test('Tattoo Finance transaction splits trip; cover batches delete and create trips', async () => {
  const db = ownerDB(), old = doc(db, 'trips/old');
  const cover = { studio: 'Studio', start: '2026-10-01', end: '2026-10-31', isDefaultCover: true };
  await setDoc(old, cover);
  await assertSucceeds(runTransaction(db, async tx => {
    const saved = await tx.get(old);
    tx.delete(old);
    tx.set(doc(db, 'trips/before'), { ...saved.data(), end: '2026-10-10' });
    tx.set(doc(db, 'trips/after'), { ...saved.data(), start: '2026-10-20' });
  }));
  assert.equal((await getDoc(old)).exists(), false);
  const covers = await getDocs(query(collection(db, 'trips'), where('studio', '==', 'Studio'), where('isDefaultCover', '==', true)));
  const batch = writeBatch(db);
  for (const item of covers.docs) batch.delete(item.ref);
  batch.set(doc(db, 'trips/replacement'), cover);
  await assertSucceeds(batch.commit());
  assert.equal((await getDocs(collection(db, 'trips'))).size, 1);
});

test('CRM 400-document batches allow merge migrations and deleteField without access-call limit failures', async () => {
  const db = ownerDB(), create = writeBatch(db);
  for (let i = 0; i < 400; i++) create.set(doc(db, `TattooCRM/app/clients/client-${i}`), { name: 'Клиент', firstContactDate: '2026-10-10' });
  await assertSucceeds(create.commit());
  const migrate = writeBatch(db);
  for (let i = 0; i < 400; i++) migrate.set(doc(db, `TattooCRM/app/clients/client-${i}`), { firstcontactdate: '2026-10-10', firstContact: '2026-10-10', updatedAt: '2026-10-10T12:00:00Z' }, { merge: true });
  await assertSucceeds(migrate.commit());
  const cleanup = writeBatch(db);
  for (let i = 0; i < 400; i++) cleanup.set(doc(db, `TattooCRM/app/clients/client-${i}`), { firstContactDate: deleteField(), firstContact: deleteField() }, { merge: true });
  await assertSucceeds(cleanup.commit());
  const snapshot = await getDocs(collection(db, 'TattooCRM/app/clients'));
  assert.equal(snapshot.size, 400);
  for (const item of snapshot.docs) { assert.equal(item.data().firstcontactdate, '2026-10-10'); assert.equal('firstContactDate' in item.data(), false); }
});

test('CRM reminder cleanup batch, Calendar settings and nested status logs remain writable', async () => {
  const db = ownerDB(), reminders = collection(db, 'TattooCRM/app/reminders');
  await setDoc(doc(reminders, 'r1'), { clientId: 'client', title: 'Консультация: 1' });
  await setDoc(doc(reminders, 'r2'), { clientId: 'client', title: 'Консультация: 2' });
  const snapshot = await getDocs(query(reminders, where('clientId', '==', 'client'))), batch = writeBatch(db);
  for (const item of snapshot.docs) batch.delete(item.ref);
  await assertSucceeds(batch.commit());
  assert.equal((await getDocs(reminders)).size, 0);
  await assertSucceeds(setDoc(doc(db, 'TattooCRM/settings/global/default'), { calendarId: 'calendar' }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, 'TattooCRM/app/clients/client'), { calendarEventId: 'event', driveFolderId: 'folder' }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, 'TattooCRM/app/clients/client/statusLogs/1720000000000'), { status: 'active', ts: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'TattooCRM/app/summary/costsManual'), { sk: 10, at: 20, timestamp: serverTimestamp() }, { merge: true }));
});

test('Budget Control batch permits valid edits and atomically rejects editing a linked expense', async () => {
  const db = ownerDB();
  const initial = writeBatch(db);
  for (let i = 0; i < 10; i++) initial.set(doc(db, `${base}/transactions/batch-${i}`), payload);
  await assertSucceeds(initial.commit());
  const edit = writeBatch(db);
  for (let i = 0; i < 10; i++) edit.update(doc(db, `${base}/transactions/batch-${i}`), { amountCents: 2000 });
  await assertSucceeds(edit.commit());
  await setDoc(doc(db, `${base}/links/${linkKey('budget_control:batch-0')}`), { paymentId: 'protected' });
  const denied = writeBatch(db);
  denied.update(doc(db, `${base}/transactions/batch-0`), { amountCents: 3000 });
  denied.update(doc(db, `${base}/transactions/batch-1`), { amountCents: 3000 });
  await assertFails(denied.commit());
  assert.equal((await getDoc(doc(db, `${base}/transactions/batch-1`))).data().amountCents, 2000);
});

test('foreign and anonymous transactions/batches fail without partial writes', async () => {
  const db = ownerDB(), ref = doc(db, 'envelopes/protected');
  await setDoc(ref, { current: 100 });
  for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('outsider')]) {
    const foreign = context.firestore();
    await assertFails(runTransaction(foreign, async tx => {
      await tx.get(doc(foreign, 'envelopes/protected'));
      tx.update(doc(foreign, 'envelopes/protected'), { current: 0 });
    }));
    const batch = writeBatch(foreign);
    batch.update(doc(foreign, 'envelopes/protected'), { current: 0 });
    batch.set(doc(foreign, 'TattooCRM/app/clients/unauthorized'), { name: 'Unauthorized' });
    await assertFails(batch.commit());
  }
  assert.equal((await getDoc(ref)).data().current, 100);
  assert.equal((await getDoc(doc(db, 'TattooCRM/app/clients/unauthorized'))).exists(), false);
});
