import { initialSettings } from './seed.mjs';
import { executeCommand, initialize, stamp } from './commands.mjs';
import { SOURCE_DEFINITIONS, adaptSnapshot } from './adapters.mjs';

export const LOCAL_KEY = 'budget-control.local.v1';
const tables = ['settings', 'transactions', 'recurring', 'payments', 'plans', 'links'];
const emptyDB = () => Object.fromEntries(tables.map(t => [t, {}]));
export class LocalStore {
  constructor(storage = globalThis.localStorage) { this.storage = storage; this.mode = 'local'; this.callback = null; this.onStorage = event => { if (event.key === LOCAL_KEY) this.emit(); }; }
  read() {
    const text = this.storage.getItem(LOCAL_KEY);
    if (text) { const db = JSON.parse(text); if (!db.settings?.main || !tables.every(t => db[t] && typeof db[t] === 'object')) throw new Error('Локальные данные повреждены. Экспортируйте их перед восстановлением.'); return db; }
    const db = emptyDB(); db.settings.main = { ...initialSettings(), createdAt: stamp(), updatedAt: stamp() }; this.storage.setItem(LOCAL_KEY, JSON.stringify(db)); return db;
  }
  async start(callback, range) { this.callback = callback; this.range = range; globalThis.addEventListener?.('storage', this.onStorage); this.emit(); }
  setRange(range) { this.range = range; this.emit(); }
  emit() {
    if (!this.callback) return;
    const db = this.read();
    for (const table of tables.filter(t => t !== 'links')) {
      let data = Object.entries(db[table]).map(([id, value]) => ({ ...value, id }));
      if (table === 'transactions') data = data.filter(t => t.date >= this.range.from && t.date < this.range.to);
      this.callback?.({ key: table, data: table === 'settings' ? db.settings.main : data, status: { state: 'local', lastSuccess: stamp() } });
    }
    for (const key of Object.keys(SOURCE_DEFINITIONS)) this.callback?.({ key, data: [], status: { state: key === 'tattoo_expense' ? 'disabled' : 'unavailable' } });
  }
  async command(command) {
    const run = async () => {
      const db = structuredClone(this.read());
      const tx = { get: async (table, id) => db[table][id], set: (table, id, value) => { db[table][id] = value; }, delete: (table, id) => { delete db[table][id]; }, getExternal: async () => { throw new Error('В локальном режиме внешние источники недоступны.'); } };
      const result = await executeCommand(tx, command);
      this.storage.setItem(LOCAL_KEY, JSON.stringify(db)); this.emit(); return result;
    };
    if (globalThis.navigator?.locks) return navigator.locks.request(LOCAL_KEY, run);
    // Safari versions without Web Locks: prevent edits rather than risk concurrent writes.
    if (typeof window !== 'undefined') throw new Error('Для безопасной записи обновите браузер: требуется поддержка Web Locks.');
    return run();
  }
  async exportData() { return this.read(); }
  stop() { globalThis.removeEventListener?.('storage', this.onStorage); this.callback = null; }
}

export class CloudStore {
  constructor(sdk, db, uid) { this.sdk = sdk; this.db = db; this.uid = uid; this.mode = 'cloud'; this.unsubscribers = new Map(); this.listenerTokens = new Map(); this.statuses = {}; this.settings = null; this.generation = 0; }
  ref(table, id) { return this.sdk.doc(this.db, 'budgetControl', this.uid, table, id); }
  collection(table) { return this.sdk.collection(this.db, 'budgetControl', this.uid, table); }
  transaction(run) {
    return this.sdk.runTransaction(this.db, async native => run({
      get: async (table, id) => (await native.get(this.ref(table, id))).data(),
      getExternal: async (path, id) => (await native.get(this.sdk.doc(this.db, path, id))).data(),
      set: (table, id, value) => native.set(this.ref(table, id), value),
      delete: (table, id) => native.delete(this.ref(table, id)),
    }));
  }
  async command(command) {
    if (globalThis.navigator?.onLine === false) throw new Error('Для облачной записи нужен интернет. Изменения ещё не сохранены.');
    return this.transaction(tx => executeCommand(tx, command));
  }
  listen(key, query, convert) {
    this.unsubscribers.get(key)?.();
    this.callback({ key, data: key === 'settings' ? null : [], status: { state: 'loading', lastSuccess: this.statuses[key]?.lastSuccess } });
    const generation = this.generation;
    const token = Symbol(key); this.listenerTokens.set(key, token);
    const unsubscribe = this.sdk.onSnapshot(query, { includeMetadataChanges: true }, snapshot => {
      if (generation !== this.generation || this.listenerTokens.get(key) !== token) return;
      const converted = convert(snapshot);
      const cached = snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites;
      const status = { state: converted.errors?.length ? 'partial' : cached ? 'cached' : 'ready', errors: converted.errors || [], lastSuccess: cached || converted.errors?.length ? this.statuses[key]?.lastSuccess : stamp() };
      this.statuses[key] = status; this.callback({ key, data: converted.data, status });
    }, error => {
      if (generation !== this.generation || this.listenerTokens.get(key) !== token) return;
      const status = { state: 'error', error: error.code === 'permission-denied' ? 'Нет доступа. Проверьте правила Firebase.' : 'Источник недоступен. Проверьте сеть и повторите подключение.', lastSuccess: this.statuses[key]?.lastSuccess };
      this.statuses[key] = status; this.callback({ key, data: null, status });
    });
    this.unsubscribers.set(key, unsubscribe);
  }
  ranged(collection) { return this.sdk.query(collection, this.sdk.where('date', '>=', this.range.from), this.sdk.where('date', '<', this.range.to)); }
  subscribeSources() {
    if (!this.settings) return;
    for (const [key, definition] of Object.entries(SOURCE_DEFINITIONS)) {
      // Version 1 intentionally never subscribes to professional expenses.
      if (key === 'tattoo_expense' || !this.settings.integrations[definition.setting]) {
        this.unsubscribers.get(key)?.(); this.unsubscribers.delete(key);
        this.listenerTokens.delete(key);
        this.callback({ key, data: [], status: { state: 'disabled' } }); continue;
      }
      this.listen(key, this.ranged(this.sdk.collection(this.db, definition.path)), snapshot => {
        const { rows, errors } = adaptSnapshot(snapshot.docs, definition.adapter, this.settings); return { data: rows, errors };
      });
    }
  }
  async start(callback, range) {
    this.callback = callback; this.range = range;
    await this.transaction(initialize);
    for (const table of ['settings', 'recurring', 'payments', 'plans']) {
      this.listen(table, table === 'settings' ? this.ref('settings', 'main') : this.collection(table), snapshot => {
        if (table === 'settings') {
          const next = snapshot.data();
          const changed = JSON.stringify([next?.mappings, next?.integrations]) !== JSON.stringify([this.settings?.mappings, this.settings?.integrations]);
          this.settings = next;
          if (changed) queueMicrotask(() => { if (this.callback) this.subscribeSources(); });
          return { data: next };
        }
        return { data: snapshot.docs.map(d => ({ ...d.data(), id: d.id })) };
      });
    }
    this.setRange(range);
  }
  setRange(range) {
    this.range = range;
    this.listen('transactions', this.ranged(this.collection('transactions')), snapshot => ({ data: snapshot.docs.map(d => ({ ...d.data(), id: d.id })) }));
    this.subscribeSources();
  }
  async exportData() {
    const result = {};
    for (const table of tables) { const snapshot = await this.sdk.getDocsFromServer(this.collection(table)); result[table] = Object.fromEntries(snapshot.docs.map(d => [d.id, d.data()])); }
    return result;
  }
  stop() { this.generation++; for (const unsubscribe of this.unsubscribers.values()) unsubscribe(); this.unsubscribers.clear(); this.callback = null; }
}

// Compat bridge uses the same default app, Auth session and guarded references
// as all legacy modules; no second Firebase app or credential store.
export async function loadCloud(config) {
  if (!config.enabled || !config.ownerUid) throw new Error('Облако не настроено.');
  const shared = globalThis.MyApps;
  if (!shared) throw new Error('Общая авторизация My Apps недоступна.');
  shared.requireOwner();
  const sdk = {
    doc: (db, ...path) => db.doc(path.join('/')),
    collection: (db, ...path) => db.collection(path.join('/')),
    where: (...args) => args,
    query: (ref, ...constraints) => constraints.reduce((query, args) => query.where(...args), ref),
    onSnapshot: (ref, ...args) => ref.onSnapshot(...args),
    runTransaction: (db, callback) => db.runTransaction(callback),
    getDocsFromServer: ref => ref.get({ source: 'server' })
  };
  return { auth: shared.auth, sdk, db: shared.db() };
}
