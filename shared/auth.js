(function () {
  'use strict';
  const config = window.MY_APPS_CONFIG;
  const sharedBase = new URL('.', document.currentScript.src);
  let auth, db, started = false, booting = false, generation = 0, initializing;
  const access = createOwnerAccess(() => auth?.currentUser, config.ownerUid);
  const loaded = new Map();
  const protectedPage = document.documentElement.hasAttribute('data-owner-app');
  const redirectAllowed = () => config.redirectEnabled && location.protocol === 'https:' && location.hostname === config.firebase.authDomain;
  function script(url, type) {
    if (loaded.has(url)) return loaded.get(url);
    const promise = new Promise((resolve, reject) => {
      const element = document.createElement('script'); element.src = url;
      if (type) element.type = type;
      element.onload = resolve;
      element.onerror = () => { element.remove(); loaded.delete(url); reject(new Error('Не удалось загрузить приложение. Проверьте подключение и повторите.')); };
      document.head.append(element);
    }); loaded.set(url, promise); return promise;
  }
  function message(title, detail, state = 'guest') {
    document.getElementById('my-apps-auth-title').textContent = title;
    document.getElementById('my-apps-auth-message').textContent = detail;
    document.getElementById('my-apps-login').hidden = state === 'loading';
    document.getElementById('my-apps-login').disabled = state === 'loading';
    document.getElementById('my-apps-switch').hidden = state !== 'denied';
    document.getElementById('my-apps-retry').hidden = state !== 'error';
    document.getElementById('my-apps-redirect').hidden = !redirectAllowed() || state === 'loading';
  }
  function lock() {
    generation++; access.revoke();
    if (protectedPage) document.documentElement.classList.add('my-apps-locked');
    document.getElementById('my-apps-auth').hidden = false;
    document.getElementById('my-apps-account').hidden = true;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  }
  async function activate(user) {
    if (user?.uid !== config.ownerUid) {
      lock();
      message(user ? 'Нет доступа' : 'Ваши приложения', user ? 'Этот Google-аккаунт не является владельцем My Apps. Выберите аккаунт владельца.' : 'Войдите через Google, чтобы открыть ваши данные.', user ? 'denied' : 'guest');
      if (started || booting) location.reload();
      return;
    }
    if (started || booting) return;
    booting = true; const token = generation;
    message('Открываем приложение', 'Сессия владельца подтверждена.', 'loading');
    try {
      for (const element of document.querySelectorAll('script[data-owner-src]')) {
        access.requireOwner();
        await script(new URL(element.dataset.ownerSrc, document.baseURI).href, element.dataset.ownerType);
        if (token !== generation) return;
      }
      access.requireOwner(); started = true;
      document.documentElement.classList.remove('my-apps-locked');
      document.getElementById('my-apps-auth').hidden = true;
      document.getElementById('my-apps-account').hidden = false;
    } catch (error) { lock(); message('Не удалось открыть приложение', error.message, 'error'); }
    finally { booting = false; }
  }
  const authError = error => {
    console.warn('My Apps Auth:', error.code || error.name || 'unknown');
    const messages = {
      'auth/popup-closed-by-user': 'Окно входа закрыто. Нажмите кнопку, чтобы попробовать ещё раз.',
      'auth/popup-blocked': 'Браузер заблокировал окно Google. Разрешите всплывающие окна для этого сайта и повторите вход.',
      'auth/unauthorized-domain': 'Этот домен не разрешён в Firebase Authentication. Владелец должен добавить его в Authorized Domains.',
      'auth/network-request-failed': 'Не удалось связаться с Google. Проверьте подключение.',
      'auth/web-storage-unsupported': 'Браузер не разрешает хранение сессии. Разрешите данные сайта и повторите вход.'
    };
    message('Не удалось войти', messages[error.code] || 'Вход недоступен. Попробуйте ещё раз или откройте приложение в Safari.', 'error');
  };
  // Called directly from a click, without await before opening the popup.
  function signIn(redirect = false) {
    if (!auth) return initialize();
    const provider = new firebase.auth.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
    if (redirect && !redirectAllowed()) return authError({ code: 'auth/unauthorized-domain' });
    const operation = redirect ? auth.signInWithRedirect(provider) : auth.signInWithPopup(provider);
    message('Вход через Google', 'Завершите вход в окне Google.', 'loading');
    return operation.catch(authError);
  }
  async function signOut() {
    lock(); message('Выходим', 'Завершаем общую сессию My Apps.', 'loading');
    try { await auth.signOut(); if (started || booting) location.reload(); }
    catch (error) { authError(error); }
  }
  function initialize() {
    if (initializing) return initializing;
    initializing = (async () => {
      message('Проверяем сессию', 'Подключаем Firebase Authentication…', 'loading');
      for (const component of ['app', 'auth', 'firestore']) await script(new URL(`vendor/${config.sdkVersion}/firebase-${component}-compat.js`, sharedBase).href);
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config.firebase);
      const firestore = app.firestore();
      // Supported WebChannel fallback for WebKit response buffering.
      const webkit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent);
      if (webkit) firestore.settings({ experimentalForceLongPolling: true, experimentalAutoDetectLongPolling: false });
      auth = app.auth(); db = access.wrap(firestore);
      // Tests use demo-* projects exclusively; production never connects to emulators.
      if (config.emulators) {
        if (!config.firebase.projectId.startsWith('demo-') || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Неверная конфигурация эмулятора');
        auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
        app.firestore().useEmulator('127.0.0.1', 8080);
      }
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      // Popup-only hosting does not need a redirect helper iframe at startup.
      // Avoid making offline/session restoration depend on third-party storage.
      if (redirectAllowed()) await auth.getRedirectResult();
      auth.onAuthStateChanged(user => { activate(user).catch(authError); }, authError);
      return auth;
    })().catch(error => { initializing = null; authError(error); throw error; });
    return initializing;
  }
  window.MyApps = Object.freeze({
    config, get auth() { return auth; }, db() { access.requireOwner(); return db; },
    requireOwner: access.requireOwner, signIn, signOut,
    ready(callback) { queueMicrotask(() => { try { access.requireOwner(); Promise.resolve(callback()).catch(console.error); } catch (error) { console.error(error); } }); }
  });
  function mount() {
    const panel = document.createElement('section'); panel.id = 'my-apps-auth'; panel.setAttribute('aria-label', 'Авторизация My Apps');
    panel.innerHTML = '<div class="auth-card"><span>MY APPS</span><h1 id="my-apps-auth-title">Проверяем сессию</h1><p id="my-apps-auth-message" role="status" aria-live="polite">Загружаем авторизацию…</p><button id="my-apps-login" hidden>Войти через Google</button> <button id="my-apps-switch" hidden>Сменить аккаунт</button> <button id="my-apps-redirect" hidden>Войти с переходом</button> <button id="my-apps-retry" hidden>Повторить подключение</button><p><a href="../index.html">↖ My Apps</a></p></div>';
    document.body.append(panel);
    const account = document.createElement('div'); account.id = 'my-apps-account'; account.hidden = true;
    account.innerHTML = '<button aria-label="Выйти из Google во всех приложениях My Apps">Выйти из My Apps</button>'; document.body.append(account);
    document.getElementById('my-apps-login').onclick = () => signIn()?.catch?.(() => {});
    document.getElementById('my-apps-switch').onclick = signOut;
    document.getElementById('my-apps-redirect').onclick = () => signIn(true);
    document.getElementById('my-apps-retry').onclick = () => auth ? location.reload() : initialize().catch(() => {});
    account.querySelector('button').onclick = signOut;
    // Remove only the legacy OAuth credential cache; financial caches are preserved.
    try { localStorage.removeItem('gAccessToken'); } catch (_) {}
    addEventListener('pagehide', () => access.revoke());
    addEventListener('pageshow', event => { if (event.persisted) { lock(); location.reload(); } });
    initialize().catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
