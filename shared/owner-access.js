/* Runtime guard for legacy compat APIs. Server Rules remain the security boundary. */
(function (root) {
  'use strict';
  function createOwnerAccess(getUser, ownerUid) {
    let generation = 0;
    const listeners = new Set(), proxies = new WeakMap(), originals = new WeakMap();
    function requireOwner() {
      if (getUser()?.uid !== ownerUid) {
        const error = new Error('Нет доступа'); error.code = 'permission-denied'; throw error;
      }
    }
    const unwrap = value => originals.get(value) || value;
    const referenceMethods = new Set(['collection', 'doc', 'where', 'orderBy', 'limit', 'limitToLast', 'startAt', 'startAfter', 'endAt', 'endBefore', 'withConverter', 'batch']);
    function snapshot(value) {
      if (!value || typeof value !== 'object') return value;
      return new Proxy(value, { get(target, key) {
        if (key === 'ref') return wrap(target.ref);
        if (key === 'docs') return target.docs.map(snapshot);
        if (key === 'forEach') return fn => target.forEach(doc => fn(snapshot(doc)));
        const item = Reflect.get(target, key, target);
        return typeof item === 'function' ? item.bind(target) : item;
      }});
    }
    function wrap(target) {
      if (!target || typeof target !== 'object') return target;
      if (proxies.has(target)) return proxies.get(target);
      const proxy = new Proxy(target, { get(object, key) {
        const item = Reflect.get(object, key, object);
        if (key === 'parent' || key === 'firestore') return wrap(item);
        if (typeof item !== 'function') return item;
        return (...args) => {
          requireOwner();
          const token = generation;
          if (key === 'onSnapshot') {
            const safe = args.map(arg => typeof arg === 'function' ? (...values) => {
              if (token === generation && getUser()?.uid === ownerUid) arg(...values.map(snapshot));
            } : arg && typeof arg === 'object' && ('next' in arg || 'error' in arg) ? {
              next: value => { if (token === generation && getUser()?.uid === ownerUid) arg.next?.(snapshot(value)); },
              error: error => { if (token === generation && getUser()?.uid === ownerUid) arg.error?.(error); }
            } : arg);
            const stop = item.apply(object, safe);
            const unsubscribe = () => { listeners.delete(unsubscribe); stop(); };
            listeners.add(unsubscribe); return unsubscribe;
          }
          if (key === 'runTransaction') return item.call(object, async native => {
            requireOwner(); const result = await args[0](wrap(native));
            requireOwner(); if (token !== generation) throw new Error('Сессия завершена');
            return result;
          }, ...args.slice(1));
          const result = item.apply(object, args.map(unwrap));
          if (referenceMethods.has(key) || result === object) return wrap(result);
          if (result?.then) return result.then(value => {
            requireOwner(); if (token !== generation) throw new Error('Сессия завершена');
            return key === 'get' ? snapshot(value) : key === 'add' ? wrap(value) : value;
          });
          return result;
        };
      }});
      proxies.set(target, proxy); originals.set(proxy, target); return proxy;
    }
    return { requireOwner, wrap, revoke() { generation++; for (const stop of [...listeners]) stop(); } };
  }
  root.createOwnerAccess = createOwnerAccess;
  if (typeof module !== 'undefined') module.exports = { createOwnerAccess };
})(globalThis);
