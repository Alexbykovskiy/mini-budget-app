import test, { before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, setDoc, getDoc, getDocs, deleteDoc, updateDoc, setLogLevel } from 'firebase/firestore';
import { initialSettings } from '../seed.mjs';
const UID = 'BQbwiHs1Y3Wsz1yaT2JizWVWOLG2';
let environment;
setLogLevel('silent');
const paths = ['users/mini/expenses/test', 'users/mini/tags/test', 'users/mini/reminders/test', 'incomes/test', 'expenses/test', 'studios/test', 'trips/test', 'envelopes/test', 'transactions/test', 'TattooCRM/app/clients/test', 'TattooCRM/app/reminders/test', 'TattooCRM/app/supplies/test', 'TattooCRM/app/marketing/test', 'TattooCRM/app/summary/costsManual', 'TattooCRM/app/clients/test/statusLogs/test', 'TattooCRM/settings/global/default'];
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required.');
  environment = await initializeTestEnvironment({ projectId: 'demo-budget-control', firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
});
after(async () => environment?.cleanup());
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
  for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('outsider', { firebase: { sign_in_provider: 'google.com' } })]) {
    const db = context.firestore();
    for (const path of [...paths, `budgetControl/${UID}/transactions/test`, 'clients/legacy']) {
      const ref = doc(db, path);
      await assertFails(getDoc(ref));
      await assertFails(getDocs(collection(db, path.slice(0, path.lastIndexOf('/')))));
      await assertFails(setDoc(ref, payload));
      await assertFails(deleteDoc(ref));
    }
    await assertFails(setDoc(doc(db, 'budgetControl/outsider/settings/main'), initialSettings()));
    await assertFails(setDoc(doc(db, 'users/outsider/expenses/test'), payload));
    await assertFails(setDoc(doc(db, 'budgetControlAccess/outsider'), { enabled: true }));
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
