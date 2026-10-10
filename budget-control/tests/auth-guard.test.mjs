import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createOwnerAccess } = createRequire(import.meta.url)('../../shared/owner-access.js');
test('late reads and callbacks, queued batches and transactions stop when session changes', async () => {
  let user = { uid: 'owner' }, resolveRead, callback, stopped = 0, committed = 0;
  const doc = { get: () => new Promise(resolve => { resolveRead = resolve; }), onSnapshot: cb => { callback = cb; return () => stopped++; } };
  const batch = { update() { return this; }, commit: async () => { committed++; } };
  const db = { doc: () => doc, batch: () => batch, runTransaction: async fn => fn(batch) };
  const guard = createOwnerAccess(() => user, 'owner'), secure = guard.wrap(db);
  const pending = secure.doc('test').get(); const queued = secure.batch().update(doc, {});
  let seen = 0; secure.doc('test').onSnapshot(() => seen++); callback({}); assert.equal(seen, 1);
  user = null; guard.revoke(); callback({}); assert.equal(seen, 1); assert.equal(stopped, 1);
  resolveRead({}); await assert.rejects(pending, /Нет доступа/);
  assert.throws(() => queued.commit(), /Нет доступа/); assert.equal(committed, 0);
  user = { uid: 'owner' };
  await assert.rejects(secure.runTransaction(async tx => { tx.update(doc, {}); user = null; }), /Нет доступа/);
});
test('foreign session cannot start any Firestore operation or subscribe', () => {
  const secure = createOwnerAccess(() => ({ uid: 'outsider' }), 'owner').wrap({ collection() { throw new Error('Must never call SDK'); } });
  assert.throws(() => secure.collection('users/mini/expenses'), /Нет доступа/);
});
