/* app.js — SPA controller (Firestore + Google Drive) */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
};

// Универсальное подтверждение через <dialog id="confirmDialog">
function confirmDlg(message = 'Вы уверены?') {
  return new Promise(resolve => {
    const dlg = $('#confirmDialog');
    if (!dlg) return resolve(confirm(message)); // fallback на стандартный confirm
    $('#confirmText').textContent = message;

    const yes = $('#confirmYes');
    const no  = $('#confirmNo');

    const onYes = () => { cleanup(); dlg.close(); resolve(true); };
    const onNo  = () => { cleanup(); dlg.close(); resolve(false); };

    function cleanup(){
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
    }

    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);

    dlg.showModal();
  });
}

const OPEN_CLIENT_ON_TILE_CLICK = false;

// --- Boot overlay utils ---
const BOOT = {
  steps: [
    'DOM готов',
    'Firebase SDK',
    'Проверка сессии',
    'Google Identity (GIS)',
    'Google API (gapi)',
    'Drive готов',
    'Firestore (настройки)',
    'UI готова'
  ],
  el: null, list: null, hint: null, progressEl: null,
  state: [],
  show(){
    this.el = this.el || document.getElementById('bootOverlay');
    this.list = this.list || document.getElementById('bootSteps');
    this.hint = this.hint || document.getElementById('bootHint');
    this.progressEl = this.progressEl || document.getElementById('bootProgress');
    if (!this.el || !this.list) return; // если оверлея нет в HTML — просто тихо выходим
    this.list.innerHTML = '';
    this.state = this.steps.map(_ => 'wait');
    this.steps.forEach((t,i)=>{
      const li = document.createElement('div');
      li.className = 'boot-step wait';
      li.dataset.idx = String(i);
      li.innerHTML = `<span class="mark">…</span><span>${t}</span>`;
      this.list.appendChild(li);
    });
    this.el.classList.remove('hidden');
    this.updateProgress();
  },
  set(i, status, note=''){
    if (!this.list) return;
    const row = this.list.querySelector(`.boot-step[data-idx="${i}"]`);
    if(!row) return;
    row.classList.remove('wait','ok','err');
    row.classList.add(status);
    row.querySelector('.mark').textContent = status==='ok' ? '✓' : (status==='err' ? '!' : '…');
    this.state[i] = status;
    if(note && this.hint) this.hint.textContent = note;
    this.updateProgress();
  },
  hide(){ this.el?.classList.add('hidden'); },
  updateProgress(){
    const ok = this.state.filter(s=>s==='ok').length;
    const pct = Math.round(ok / this.steps.length * 100);
    if (this.progressEl) this.progressEl.textContent = `${pct}%`;
  }
};

// «ожидалка» появления глобалов/состояния
async function waitFor(getter, timeout=10000, step=50){
  const t0 = Date.now();
  while(!getter()){
    if(Date.now()-t0 > timeout) throw new Error('timeout: ' + getter.toString());
    await new Promise(r => setTimeout(r, step));
  }
}

// --- Fast Auth Persistence (ускоряем старт на iOS/Safari/Private) ---
async function testIndexedDB(timeout = 800) {
  return new Promise((resolve) => {
    try {
      let done = false;
      const req = indexedDB.open('tattoocrm_idb_probe', 1);
      const timer = setTimeout(() => { if (!done) { done = true; resolve(false); } }, timeout);
      req.onerror = req.onblocked = () => { if (!done) { done = true; clearTimeout(timer); resolve(false); } };
      req.onsuccess = () => {
        if (!done) {
          done = true; clearTimeout(timer);
          try { req.result.close(); indexedDB.deleteDatabase('tattoocrm_idb_probe'); } catch(_){}
          resolve(true);
        }
      };
      req.onupgradeneeded = () => {};
    } catch (e) {
      resolve(false);
    }
  });
}

async function ensureAuthPersistence() {
  // Если IndexedDB недоступен/тормозит (часто на iOS/Safari) — используем SESSION
  const idbOk = await testIndexedDB(800);
  const isAppleTouch =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const useSession = isAppleTouch && !idbOk;
  const mode = useSession ? firebase.auth.Auth.Persistence.SESSION
                          : firebase.auth.Auth.Persistence.LOCAL;

  await FB.auth.setPersistence(mode);
  try {
    BOOT.set(1, 'ok', useSession ? 'Auth: SESSION (iOS/IDB slow)' : 'Auth: LOCAL');
  } catch(_) {}
}

// --- Env flags (Safari / A2HS) ---
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isStandalone = !!(window.navigator && window.navigator.standalone);
const isSafariA2HS = isIOS && isSafari && isStandalone;

// Обёртка-таймаут для обещаний
function withTimeout(promise, ms = 3000, label = 'timeout') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 e => { clearTimeout(t); reject(e); });
  });
}


// ---------- State ----------
const AppState = {
  connected: false,
  settings: null,
  clients: [],
  reminders: [],
  appointments: [],
  supplies: [],
  marketing: [],            // ← добавили
 manualCosts: { sk: 0, at: 0 },   // ← ДОБАВИТЬ
  autoSyncTimer: null
};
let syncInProgress = false;
let currentUser = null;
let driveReady = false;

// ---------- Init ----------
// ---------- Init ----------
// ---------- Init ----------
window.addEventListener('DOMContentLoaded', async () => {
  // boot: DOM
  try { BOOT.show(); BOOT.set(0,'ok'); } catch(_) {}

  bindTabbar();  bindHeader();
// Привязка кнопки «Проверить календарь»
const btnTest = document.querySelector('#btnTestCalendar');
if (btnTest && !btnTest.dataset.bound) {
  btnTest.dataset.bound = '1';
  btnTest.addEventListener('click', async () => {
    console.log('[TEST] кнопка нажата');
    await testCalendarOnce();   // см. функцию ниже
  });
}
  bindOnboarding();
  bindClientsModal();
  bindSettings();
bindSupplies();

// boot: Firebase SDK виден
try { if (window.firebase && window.FB) BOOT.set(1,'ok'); } catch(_) {}

// Ускоряем инициализацию Auth на iOS/Safari — выбираем быструю персистенцию
await ensureAuthPersistence();

// --- QuickStart: если девайс доверенный и есть кэш токена Drive — показываем UI сразу
try {
  const trusted = isDeviceTrusted();
  const cachedTok = getSavedAccessToken();
  if (trusted && cachedTok) {
    // Мгновенно показываем «Сегодня» (с демо-настройками до прихода реальных)
    if (!AppState.settings) AppState.settings = demoSettings();
    showPage('todayPage');
    renderToday();
    try { BOOT.set(6,'ok','Кэш'); BOOT.set(7,'ok'); BOOT.hide(); } catch(_) {}
    toast('Быстрый старт · восстанавливаем сессию в фоне');

    // Подцепим gapi и подложим сохранённый токен, чтобы Drive был готов
    (async () => {
  try {
    // ждём не только gapi, но и gapi.client
    await waitFor(() => window.gapi && gapi.client);

    // токен подставляем только если метод существует
    if (gapi?.client?.setToken) {
      gapi.client.setToken({ access_token: cachedTok });
    }

    const __ds = document.querySelector('#driveStatus');
    if (__ds) __ds.textContent = 'Drive: онлайн';

    // дальше полноценная инициализация Drive (она сама проставит driveReady)
    initDriveStack({ forceConsent: false }).catch(console.warn);
  } catch (e) {
    console.warn('quickStart drive', e);
    const __ds = document.querySelector('#driveStatus');
    if (__ds) __ds.textContent = 'Drive: оффлайн';
  }
})();
  }
} catch(e){ console.warn('quickStart', e); }



// Не показываем экран входа сразу — ждём состояние сессии
// Не ждём бесконечно: если за 3с нет ответа — показываем гостя, UI не висит
let __authResolved = false;
const __authTimeout = setTimeout(() => {
  if (!__authResolved) {
    try { BOOT.set(2, 'ok', 'Гость (таймаут 3с)'); BOOT.hide(); } catch(_) {}
    showPage('onboarding');
  }
}, 3000);

FB.auth.onAuthStateChanged(async (user) => {
  clearTimeout(__authTimeout);
  __authResolved = true;

  // boot: проверка сессии
  try { BOOT.set(2,'ok', user ? 'Найдена активная сессия' : 'Гость (нет сессии)'); } catch(_) {}

 if (user) {
  currentUser = user;
  setDeviceTrusted(user);
  touchDeviceTrust();
  try {
     // Инициализация Drive
if (!isSafariA2HS) {
  // Стартуем в фоне — UI не ждёт
  const driveInit = initDriveStack({ forceConsent: false })
    .catch(e => {
      console.warn('Drive init (bg) failed', e);
      try { BOOT.set(5,'err','Drive отложен'); } catch(_) {}
    });
} else {
  // В Safari A2HS вообще не трогаем Drive на старте
  try { BOOT.set(5,'err','Drive отложен (Safari A2HS)'); } catch(_) {}
}

await loadSettings();
fillSettingsForm();
AppState.connected = true;

      showPage('todayPage');
      listenClientsRealtime();
      listenRemindersRealtime();
listenSuppliesRealtime();
      renderToday();
renderTodayCalendar(); // ← добавили: виджет «Сегодня» обновляется сразу
renderFullCalendar();
// фоновая инициализация календаря (бейджик в шапке + ensureCalendarId)
initCalendarStack({ forceConsent: false }).catch(console.warn);

listenMarketingRealtime();
mkBindCostsForm();
listenManualCostsRealtime();
toast('Добро пожаловать обратно 👋');
    } catch (e) {
      console.warn('restore session failed', e);
      showPage('onboarding');
      try { BOOT.hide(); } catch(_) {}
    }
  } else {
    showPage('onboarding');
    try { BOOT.hide(); } catch(_) {}
  }
}); // ← закрыли onAuthStateChanged
}); // ← закрыли DOMContentLoaded
// ---------- Tabs ----------
function bindTabbar(){
  $$('.tabbar .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tabbar .tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      showPage(btn.dataset.tab);
      if (btn.dataset.tab === 'clientsPage') renderClients();
      if (btn.dataset.tab === 'todayPage') {
  renderToday();
  renderTodayCalendar();
  renderFullCalendar(); // ← добавили
}
     if (btn.dataset.tab === 'marketingPage') {
  bindMarketing();
  renderMarketing();
  mkBindLeadsChartControls();
  mkRenderLeadsChart();

  // --- [NEW] Форс-рендер диаграмм «Общий отчёт»
  mkBindCostsForm();
  mkRenderLeadsDonut(AppState.clients || MK_CLIENTS_CACHE);
  mkRenderCostsChartManual();
  mkRenderCountriesChart(AppState.clients || MK_CLIENTS_CACHE);
}
      if (btn.dataset.tab === 'suppliesPage') renderSupplies();
      if (btn.dataset.tab === 'settingsPage') fillSettingsForm();
    });
  });
}

function showPage(id){
  $$('.page').forEach(p => p.classList.remove('is-active'));
  $(`#${id}`).classList.add('is-active');
}



// ---------- Header ----------
function bindHeader(){
  // Подключить Drive
  const btnDrive = $('#btnConnectDrive');
  if (btnDrive) {
    btnDrive.addEventListener('click', async () => {
      try {
        await initDriveStack({ forceConsent: true });
        const ds = $('#driveStatus'); if (ds) ds.textContent = 'Drive: онлайн';
        toast('Google Drive подключён');
      } catch (e) {
        console.warn('connect drive failed', e);
        const ds = $('#driveStatus'); if (ds) ds.textContent = 'Drive: оффлайн';
        toast('Не удалось подключить Drive');
      }
    });
  }

  // Кнопка настроек (шестерёнка)
  const btnSettings = $('#btnSettings');
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
  showPage('settingsPage');
  fillSettingsForm(); // ← добавить
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
  }
}
// ---------- Onboarding ----------
function bindOnboarding() {
  // 1) Обработка результата redirect — вызывается при каждом заходе на страницу
  FB.auth.getRedirectResult()
    .then(async (cred) => {
      if (!cred || !cred.user) return;        // redirect ещё не выполнялся
      await afterLogin(cred);
    })
    .catch((e) => {
      console.error('redirect result error', e);
      toast('Ошибка инициализации после входа');
    });

  // 2) Клик по кнопке «Войти через Google» — пробуем POPUP, при неудаче уходим в REDIRECT
  const btn = document.getElementById('bootstrapBtn'); // см. id в index.html :contentReference[oaicite:1]{index=1}
  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();

      provider.addScope('profile');
      provider.addScope('email');
     provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/calendar');       // ← добавили
provider.addScope('https://www.googleapis.com/auth/calendar.events'); // можно оставить
      // Сначала POPUP (быстрее и без перезагрузки)
      const cred = await FB.auth.signInWithPopup(provider);
      await afterLogin(cred);

    } catch (e) {
      // Частые коды: auth/popup-blocked, auth/popup-closed-by-user, auth/cancelled-popup-request
      console.warn('popup auth failed, fallback to redirect', e?.code || e);

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/calendar');
provider.addScope('https://www.googleapis.com/auth/calendar.events');

      // Редирект — после возврата сработает getRedirectResult() выше
      await FB.auth.signInWithRedirect(provider);
    }
  });
}

// Инициализация Google Calendar (через уже полученный токен Drive)
async function initCalendarStack({ forceConsent = false } = {}) {
  try {
    // 1) Получаем/обновляем access_token с расширенными scope
    const token = await ensureDriveAccessToken({ forceConsent });
    if (!token) throw new Error('no google access token');

    // 2) Отдаём токен модулю calendar.js
    TCRM_Calendar.setAuthToken(token);

    // 3) Гарантируем наличие календаря "Tattoo CRM" (создастся, если нет)
    const calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');

    // 4) UI-значок в шапке
    const el = document.querySelector('#calStatus'); // см. index.html, появился бейджик Calendar: offline :contentReference[oaicite:2]{index=2}
    if (el) {
      el.textContent = 'Calendar: online';
      el.classList.remove('bad');
      el.classList.add('good');
      el.title = calId;
    }
  } catch (e) {
    console.warn('initCalendarStack error', e);
    const el = document.querySelector('#calStatus');
    if (el) {
      el.textContent = 'Calendar: offline';
      el.classList.remove('good');
      el.classList.add('bad');
      el.title = e?.message || '';
    }
  }
}


// Общая пост-инициализация после входа
async function afterLogin(cred) {
  try {
    currentUser = cred.user;

    setDeviceTrusted(currentUser);
    touchDeviceTrust();

    await loadSettings();
    fillSettingsForm();
    AppState.connected = true;

    showPage('todayPage');
    toast('Вход выполнен. Firestore готов.');

    // realtime-потоки
    listenClientsRealtime();
    listenRemindersRealtime();
    listenSuppliesRealtime();
    listenMarketingRealtime();
    renderToday();
renderTodayCalendar();
renderFullCalendar();
    // 1) DRIVE
    try {
      await initDriveStack({ forceConsent: true });
      const ds = document.querySelector('#driveStatus');
      if (ds) ds.textContent = 'Drive: онлайн';
      toast('Google Drive подключён');
    } catch (e) {
      console.error('Drive init failed', e);
      const ds = document.querySelector('#driveStatus');
      if (ds) ds.textContent = 'Drive: оффлайн';
      toast('Не удалось подключить Drive');
    }

    // 2) CALENDAR
    await initCalendarStack({ forceConsent: true });

  } catch (e) {
    console.error('afterLogin error', e);
    toast('Ошибка входа/инициализации');
  }
}
// ---------- Firestore realtime ----------
function listenClientsRealtime(){
  FB.db.collection('TattooCRM').doc('app').collection('clients')
    .orderBy('updatedAt', 'desc')
    .onSnapshot((qs)=>{
      AppState.clients = [];
      qs.forEach(d => AppState.clients.push(d.data()));
      renderClients();
      renderToday();
     // ВАЖНО: после загрузки клиентов пересобрать таблицу маркетинга
     renderMarketing();

      // если открыта вкладка маркетинга — обновим график тоже
      if (document.querySelector('[data-tab="marketingPage"]').classList.contains('is-active')) {
        mkBindLeadsChartControls();
        mkRenderLeadsChart();
      }// обновляем график, если открыта вкладка маркетинга
if (document.querySelector('[data-tab="marketingPage"]').classList.contains('is-active')) {
  mkBindLeadsChartControls();
  mkRenderLeadsChart();
}
// Карточка №5: перестраиваем итоги при изменении клиентов
      const untilInput = document.getElementById('mkPotentialUntil');
      if (untilInput) {
        const totals = mkCalcTotalsAndPotential(AppState.clients, AppState.marketing, untilInput.value);
        mkRenderCardTotals(totals);
// --- [NEW] Карточка №8: студийная аналитика
const split = mkCalcStudioSplit(AppState.clients);
mkRenderCardStudioSplit(split);

// --- [NEW] KPI и общий отчёт (блок после «Заглушка 9»)
const kpi = mkCalcKPI(AppState.clients, AppState.marketing, totals);
mkRenderKPI(kpi);
mkRenderSummary(AppState.clients, AppState.marketing);
mkRenderCountriesChart(AppState.clients);
 // Карточка №6: обновить финансы
      if (typeof mkUpdateFinanceCard === 'function') mkUpdateFinanceCard();
// === обновляем KPI и Общий отчёт после прихода данных журнала ===
try {
  const untilInput = document.getElementById('mkPotentialUntil');
  const totals = (typeof mkCalcTotalsAndPotential === 'function')
    ? mkCalcTotalsAndPotential(AppState.clients || MK_CLIENTS_CACHE, AppState.marketing, untilInput?.value || '')
    : null;

  const kpi = mkCalcKPI(AppState.clients || MK_CLIENTS_CACHE, AppState.marketing, totals);
  mkRenderKPI(kpi);
  mkRenderSummary(AppState.clients || MK_CLIENTS_CACHE, AppState.marketing);
} catch(e) {
  console.warn('mk summary refresh after marketing update', e);
}

// --- [NEW] Карточка №8: обновить студийную аналитику при изменении клиентов
{
  const split = mkCalcStudioSplit(AppState.clients);
  mkRenderCardStudioSplit(split);
const kpi = mkCalcKPI(AppState.clients, AppState.marketing, totals);
mkRenderKPI(kpi);
mkRenderSummary(AppState.clients, AppState.marketing);
}
      }
    }, (err)=> {
      console.error(err);
      toast('Ошибка чтения клиентов');
    });
}
function listenRemindersRealtime(){
  FB.db.collection('TattooCRM').doc('app').collection('reminders')
    .orderBy('date', 'asc')
    .onSnapshot((qs)=>{
      AppState.reminders = [];
      qs.forEach(d => AppState.reminders.push(d.data()));
      renderToday();
    }, (err)=> console.error('reminders', err));
}


// ---------- Settings load/save ----------
async function loadSettings(){
  try {
    const docRef = FB.db.collection('TattooCRM').doc('settings').collection('global').doc('default');
    const doc = await docRef.get();
    AppState.settings = doc.exists ? doc.data() : demoSettings();
try { BOOT.set(6,'ok'); } catch(_) {}
  } catch(e) {
    console.warn(e);
    AppState.settings = demoSettings();
try { BOOT.set(6,'ok'); } catch(_) {}

  }
}

function listenSuppliesRealtime(){
  FB.db.collection('TattooCRM').doc('app').collection('supplies')
    .orderBy('updatedAt', 'desc')
    .onSnapshot((qs)=>{
      AppState.supplies = [];
      qs.forEach(d => AppState.supplies.push(d.data()));
      // перерисуем список, если открыта вкладка
      if (document.querySelector('[data-tab="suppliesPage"]').classList.contains('is-active')) {
        renderSupplies();
if (typeof mkUpdateFinanceCard === 'function') mkUpdateFinanceCard();
      }
    }, (err)=> {
      console.error(err);
      toast('Ошибка чтения расходников');
    });
}


function renderSuppliesDictEditor(dict = {}){
  const root = $('#supDictEditor');
  if (!root) return;
  root.innerHTML = '';

  const entries = Object.entries(dict);
  if (!entries.length) {
    root.appendChild(buildSupTypeCard('', { units:'шт' }));
  } else {
    entries.forEach(([name, cfg]) => {
      root.appendChild(buildSupTypeCard(name, cfg || {}));
    });
  }

  const btn = $('#btnAddSupType');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      root.appendChild(buildSupTypeCard('', { units:'шт' }));
    });
  }
  syncSuppliesDictHidden();
}


function bindSuppliesDictToggle(){
  const toggle = $('#supDictToggle');
  const body = $('#supDictBody');
  if (!toggle || !body) return;

  if (!toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    toggle.addEventListener('change', () => {
      body.classList.toggle('collapsed', !toggle.checked);
    });
  }

  // По умолчанию — свернуто
  toggle.checked = false;
  body.classList.add('collapsed');
}


function buildSupTypeCard(name, cfg){
 const el = document.createElement('div');
el.className = 'card glass';
  el.style.marginTop = '12px';
  el.innerHTML = `
    <div class="grid two">
      <label class="field">
        <span>Тип</span>
        <input class="typeName" placeholder="Например: Иглы" value="${name ? escapeHtml(name) : ''}">
      </label>

      <label class="field">
        <span>Единица</span>
        <select class="unit">
          ${['', 'шт','мл','г','л','см','мм','уп'].map(u => `
            <option value="${u}" ${u===(cfg.units||'')?'selected':''}>${u||'—'}</option>
          `).join('')}
        </select>
      </label>

      <label class="field">
        <span>Подтипы (через запятую)</span>
        <input class="kinds" placeholder="RL, RS, RM, CM" value="${(cfg.kinds||[]).join(', ')}">
      </label>

      <label class="field">
        <span>Размеры (через запятую)</span>
        <input class="sizes" placeholder="3,5,7,9,11,13" value="${(cfg.sizes||[]).join(', ')}">
      </label>

      <label class="field">
        <span>Бренды (опционально)</span>
        <input class="brands" placeholder="Eternal, WorldFamous" value="${(cfg.brands||[]).join(', ')}">
      </label>
    </div>

    <div class="row" style="justify-content:flex-end; gap:8px; margin-top:8px">
      <button type="button" class="btn danger" data-del>Удалить тип</button>
    </div>
  `;
  el.querySelector('[data-del]').onclick = () => { el.remove(); syncSuppliesDictHidden(); };
  // Обновляем скрытый JSON при любом вводе
  el.addEventListener('input', () => syncSuppliesDictHidden());
  return el;
}

function readSuppliesDictFromEditor(){
  const root = $('#supDictEditor');
  if (!root) return {};
  const cards = Array.from(root.querySelectorAll('.card'));
  const out = {};
  for (const c of cards) {
    const name = c.querySelector('.typeName')?.value.trim();
    if (!name) continue;
    const units  = c.querySelector('.unit')?.value.trim();
    const kinds  = csv(c.querySelector('.kinds')?.value);
    const sizes  = csvNums(c.querySelector('.sizes')?.value);
    const brands = csv(c.querySelector('.brands')?.value);
    out[name] = {};
    if (units)  out[name].units  = units;
    if (kinds.length)  out[name].kinds  = kinds;
    if (sizes.length)  out[name].sizes  = sizes;
    if (brands.length) out[name].brands = brands;
  }
  return out;
}

function syncSuppliesDictHidden(){
  const hidden = $('#setSuppliesDict');
  if (!hidden) return;
  const obj = readSuppliesDictFromEditor();
  hidden.value = JSON.stringify(obj, null, 2);
}

function csv(s){ return (s||'').split(',').map(v=>v.trim()).filter(Boolean); }
function csvNums(s){ return (s||'').split(',').map(v=>Number(v.trim())).filter(v=>!isNaN(v)); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function pad2(n){ return n < 10 ? '0'+n : ''+n; }



// Вернуть локальную YYYY-MM-DD для объекта Date (без UTC-сдвига)
function ymdLocal(dt){
  return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
}

// Безопасный сдвиг на days календарных дней (по локальному времени)
function addDaysLocal(dateObj, days){
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 
                     dateObj.getHours(), dateObj.getMinutes(), 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

// === Leads Chart: выбранные страны из чекбоксов ===
function mkSelectedCountries(){
  const box = document.getElementById('mkChartCountries');
  if (!box) return ['RU','SK','EN','AT','DE']; // дефолт, если блок ещё не смонтирован
  return Array.from(box.querySelectorAll('input[type="checkbox"]:checked'))
    .map(i => (i.value || '').toUpperCase());
}


// === Post-session followups ===
async function createPostSessionReminders(client, sessionISO, titles) {
  const base = new Date(sessionISO);
  const ids = [];
  for (const { after, title } of titles) {
    // дата = дата сеанса + N дней
    const d = new Date(base);
    d.setDate(d.getDate() + after);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const ymd = `${y}-${m}-${day}`;

    const id = `rm_${crypto.randomUUID().slice(0,8)}`;
    const doc = {
      id, clientId: client.id, clientName: client.displayName,
      date: ymd, title, createdAt: new Date().toISOString()
    };
    await FB.db.collection('TattooCRM').doc('app').collection('reminders').doc(id).set(doc);

    // ⬇️ ДОБАВЛЯЕМ: синхронизируем каждый follow-up reminder
    try { 
      await syncReminderToCalendar(doc); 
    } catch(eSync) { 
      console.warn('follow-up sync fail', eSync); 
    }

    ids.push(id);
  }
  return ids;
}
// Форматировать YYYY-MM-DD в "21 декабря 2025 г."
function formatDateHuman(ymd) {
  if (!ymd) return '';
  const [y,m,d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const months = [
    'января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря'
  ];
  return `${d} ${months[m-1]} ${y} г.`;
}


async function saveSettings(){
  const s = {
    sources: splitTags($('#setSources').value),
    styles: splitTags($('#setStyles').value),
    zones: splitTags($('#setZones').value),
    supplies: splitTags($('#setSupplies').value),
    defaultReminder: $('#setDefaultReminder').value.trim(),
    syncInterval: Math.max(15, Number($('#setSyncInterval').value||60)),
    language: 'ru',
    reminderTemplates: splitTags($('#setReminderTemplates').value),
    reminderDelays: ($('#setReminderDelays').value||'')
      .split(',').map(n => Number(n.trim())).filter(n => !isNaN(n) && n > 0),
    suppliesDict: readSuppliesDictFromEditor()
  };

  // ← автозаполнение категорий, если пусто
  if (!s.supplies?.length) {
    s.supplies = Object.keys(s.suppliesDict || {});
  }

  try{
    const ref = FB.db.collection('TattooCRM').doc('settings').collection('global').doc('default');
    await ref.set(s, { merge: true });
    AppState.settings = s;

    toast('Настройки сохранены');
    if (document.querySelector('[data-tab="suppliesPage"]').classList.contains('is-active')) {
      $('#supFilter').dataset.filled = ''; // пересобрать список
      renderSupplies();
    }
  }catch(e){
    console.warn('saveSettings', e);
    toast('Ошибка сохранения настроек');
  }
}

// ---------- Today ----------
// ---------- Today ----------



function renderToday(todayEvents, futureEvents) {
  // Если массивы не передали — собираем события из состояния
  if (!Array.isArray(todayEvents) || !Array.isArray(futureEvents)) {
    const todayYMD = ymdLocal(new Date());
    const all = [];

    // 1) Напоминания
    (AppState.reminders || []).forEach(r => {
  all.push({
    id: r.id,
    kind: 'reminder',
    clientId: r.clientId,        // ← добавили связку
    date: r.date,
    time: '',
    title: r.title || 'Напоминание',
    who: r.clientName || ''
  });
});

    // 2) Сеансы и консультации из клиентов
    (AppState.clients || []).forEach(c => {
      const sessions = Array.isArray(c.sessions) ? c.sessions : (c?.nextDate ? [c.nextDate] : []);
      sessions.forEach(s => {
        const dt = (typeof s === 'string') ? s : (s?.dt || '');
        if (!dt) return;
        const [d, tFull = ''] = dt.split('T');
        const t = tFull.slice(0, 5); // HH:MM

        all.push({
  id: `${c.id}_${dt}`,
  kind: 'session',
  clientId: c.id,               // ← добавили
  date: d,
  time: t,
  title: 'Сеанс',
  who: c.displayName || '',
  done: !!(typeof s === 'object' && s.done)
});
      });

      // Консультация (если включена и указана дата)
      if (c?.consult && c?.consultDate) {
        const [d, tFull = ''] = String(c.consultDate).split('T');
        const t = tFull.slice(0, 5);
       all.push({
  id: `consult_${c.id}_${c.consultDate}`,
  kind: 'consult',
  clientId: c.id,               // ← добавили
  date: d,
  time: t,
  title: 'Консультация',
  who: c.displayName || ''
});
      }
    });

    // Сортировка: по дате, потом по времени
    all.sort((a, b) => {
      const k1 = `${a.date} ${a.time || '99:99'}`;
      const k2 = `${b.date} ${b.time || '99:99'}`;
      return k1.localeCompare(k2);
    });

    todayEvents  = all.filter(e => e.date === todayYMD);
    futureEvents = all.filter(e => e.date >  todayYMD);
  }

  // Рендер «Сегодня»
  const todayList = document.getElementById('todaySchedule');
  if (!todayList) return;
  todayList.innerHTML = '';

  if (!todayEvents.length) {
    todayList.innerHTML = `<div class="row card-client glass">На сегодня ничего не запланировано</div>`;
  } else {
    todayEvents.forEach(ev => {
      const el = document.createElement('div');
      el.className = 'row card-client glass';
      el.innerHTML = `
        🔔 <b>${formatDateHuman(ev.date)}</b>${ev.time ? ' ' + ev.time : ''} — 
        ${ev.title}${ev.who ? ' · ' + ev.who : ''}
      `;

// клик по строке — открыть клиента
if (OPEN_CLIENT_ON_TILE_CLICK) {
  el.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (ev.clientId) openClientById(ev.clientId);
  });
}      // Кнопка подтверждения только для сеансов
      if (ev.kind === 'session' && !ev.done) {
        const btn = document.createElement('button');
        btn.className = 'btn success';
        btn.textContent = '✓';
        btn.title = 'Подтвердить сеанс';
        btn.style.padding = '2px 10px';
        btn.addEventListener('click', async (e) => {
  e.stopPropagation();
  e.preventDefault();
  const ok = await confirmDlg('Подтвердить, что сеанс состоялся?');
  if (!ok) return;

  // ✅ правильно режем по последнему "_"
  const p = ev.id.lastIndexOf('_');
  const clientId = ev.id.slice(0, p);
  const dt       = ev.id.slice(p + 1);

  await setSessionDone(clientId, dt, true);
  toast('Сеанс подтверждён');
});

        el.appendChild(btn);
      }

      todayList.appendChild(el);
    });
  }

 // Рендер «В будущем»
  const futureList = document.getElementById('futureList');
  if (futureList) {
    futureList.innerHTML = '';
    if (!futureEvents.length) {
      futureList.innerHTML = `<div class="row card-client glass">Будущих событий пока нет</div>`;
    } else {
     futureEvents.forEach(ev => {
  const row = document.createElement('div');
  row.className = 'row card-client glass';
  row.textContent = `${formatDateHuman(ev.date)}${ev.time ? ' ' + ev.time : ''} — ${ev.title}${ev.who ? ' · ' + ev.who : ''}`;

  // клик по строке — открыть карточку клиента (если есть clientId)
 if (OPEN_CLIENT_ON_TILE_CLICK) {
  row.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (ev.clientId) openClientById(ev.clientId);
  });
}

  futureList.appendChild(row);
});
    }
  }

    // Рендер «Напоминания»
  const remList = document.getElementById('remindersList');
  if (remList) {
    // Показываем ВСЕ будущие записи: reminders, consults, sessions
    const upcomingAll = (futureEvents || [])
      .filter(ev => ev && ev.date)
      .sort((a, b) => {
        const k1 = `${a.date} ${a.time || '99:99'}`;
        const k2 = `${b.date} ${b.time || '99:99'}`;
        return k1.localeCompare(k2);
      });

    remList.innerHTML = '';
    if (!upcomingAll.length) {
      remList.innerHTML = `<div class="row card-client glass">Пока нет будущих напоминаний</div>`;
    } else {
      upcomingAll.forEach(ev => {
        const row = document.createElement('div');
        row.className = 'row card-client glass';
        row.style.alignItems = 'center';

        // Иконка по типу
        const icon = ev.kind === 'consult' ? '📞'
                   : ev.kind === 'session' ? '✒️'
                   : '🔔';

        const txt = document.createElement('div');
        txt.innerHTML = `${icon} <b>${formatDateHuman(ev.date)}${ev.time ? ' ' + ev.time : ''}</b> — ${ev.title}${ev.who ? ' · ' + ev.who : ''}`;
        row.appendChild(txt);
// клик по строке — открыть клиента
row.addEventListener('click', (e) => {
  // не реагируем на клик по крестику удаления
  if (e.target.closest('button')) return;
  if (ev.clientId) openClientById(ev.clientId);
});

        // Крестик удаления только для «ручных» напоминаний (из коллекции reminders)
if (ev.kind === 'reminder' && ev.id) {
  const btn = document.createElement('button');
  btn.type = 'button'; // чтобы не триггерить submit где-нибудь в форме
  btn.className = 'btn danger';
  btn.textContent = '✕';
  btn.title = 'Удалить напоминание';
  btn.style.padding = '2px 8px';

  btn.addEventListener('click', async (e) => {
  e.stopPropagation();
  e.preventDefault();

  const ok = await confirmDlg('Удалить это напоминание?');
  if (!ok) return;

  try {
    // 1) Прочитаем документ, чтобы получить gcalEventId
    const remRef = FB.db.collection('TattooCRM').doc('app')
      .collection('reminders').doc(ev.id);
    const snap = await remRef.get();
    const gcalId = snap.exists ? (snap.data()?.gcalEventId || null) : null;

    // 2) Если есть событие в Google — удалим его
    try {
      if (gcalId && window.TCRM_Calendar) {
        const token = await ensureDriveAccessToken({ forceConsent: false }); // как в рендере календаря
        if (token) {
          TCRM_Calendar.setAuthToken(token);
          const calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');
          await TCRM_Calendar.deleteEvent(calId, gcalId);
        }
      }
    } catch (gerr) {
      // не падаем, просто лог
      console.warn('calendar reminder delete', gerr);
    }

    // 3) Удалим сам документ напоминания в Firestore
    await remRef.delete();

    // 4) Локально уберём строку (или подождём snapshot)
    if (row && row.remove) row.remove();

    toast('Напоминание удалено');
  } catch (e2) {
    console.warn(e2);
    toast('Не удалось удалить напоминание');
  }
});

  row.appendChild(btn);
}

        remList.appendChild(row);
      });
    }
  }
}  

// boot: UI готова
try { BOOT.set(7,'ok'); BOOT.hide(); } catch(_) {}

async function renderFullCalendar() {
  const box = document.getElementById('calendarUI');
  if (!box) return;

  // Очищаем контейнер
  box.innerHTML = '';

  try {
    const token = await ensureDriveAccessToken({ forceConsent: false });
    if (!token) throw new Error('Нет токена');
    TCRM_Calendar.setAuthToken(token);

    const calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');

    // Грузим ближайшие события
    const now = new Date().toISOString();
    const res = await gapi.client.calendar.events.list({
      calendarId: calId,
      timeMin: now,
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const items = res.result.items || [];
    const events = items.map(ev => ({
      title: ev.summary || '(без названия)',
      start: ev.start.dateTime || ev.start.date,
      end: ev.end?.dateTime || ev.end?.date,
      allDay: !!ev.start.date
    }));

    // Рисуем календарь через FullCalendar
    const calendar = new FullCalendar.Calendar(box, {
      initialView: 'dayGridMonth',
      locale: 'ru',
      height: 600,
      events
    });
    calendar.render();

  } catch (e) {
    console.error('renderFullCalendar error', e);
    box.innerHTML = `<div class="bad">Ошибка календаря: ${e.message}</div>`;
  }
}

// --- Sync единственного напоминания в Google Calendar ---
async function syncReminderToCalendar(rem) {
  try {
    if (!window.TCRM_Calendar) return;
    const token = await ensureDriveAccessToken({ forceConsent: false });
    if (!token) return;

    TCRM_Calendar.setAuthToken(token);
    const calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');

    // попробуем найти клиента для описания события
    const client = (window.AppState?.clients || []).find(c => c.id === rem.clientId) || null;

    const eid = await TCRM_Calendar.upsertReminderEvent(calId, rem, client);
    if (eid && rem.gcalEventId !== eid) {
      rem.gcalEventId = eid;
      await FB.db.collection('TattooCRM').doc('app')
        .collection('reminders').doc(rem.id)
        .set({ gcalEventId: eid }, { merge: true });
    }
  } catch (e) {
    console.warn('syncReminderToCalendar', e);
  }
}



   async function renderTodayCalendar() {
  const el = document.querySelector('#todayCalendar');
  if (!el) return;

  el.innerHTML = '<div class="subtle">Загрузка…</div>';

  try {
    const token = await ensureDriveAccessToken({ forceConsent: false });
    if (!token) throw new Error('no token');
    TCRM_Calendar.setAuthToken(token);

    const calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');

// --- безопасная подгрузка календарной либы ---
await waitFor(() => window.gapi && gapi.client, 10000);
if (!gapi.client.calendar || !gapi.client.calendar.events) {
  // если модуль когда-нибудь даст обёртку — используем её,
  // иначе грузим стандартным способом
  if (typeof TCRM_Calendar.ensureLibrary === 'function') {
    await TCRM_Calendar.ensureLibrary();
  } else {
    await new Promise((res, rej) => {
      try { gapi.client.load('calendar', 'v3').then(res, rej); }
      catch (e) { rej(e); }
    });
  }
}

// --- безопасная подгрузка календарной либы ---
await waitFor(() => window.gapi && gapi.client, 10000);
if (!gapi.client.calendar || !gapi.client.calendar.events) {
  // если модуль когда-нибудь даст обёртку — используем её,
  // иначе грузим стандартным способом
  if (typeof TCRM_Calendar.ensureLibrary === 'function') {
    await TCRM_Calendar.ensureLibrary();
  } else {
    await new Promise((res, rej) => {
      try { gapi.client.load('calendar', 'v3').then(res, rej); }
      catch (e) { rej(e); }
    });
  }
}



    const now = new Date().toISOString();
    const res = await gapi.client.calendar.events.list({
      calendarId: calId,
      timeMin: now,
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const items = res.result.items || [];
    if (!items.length) {
      el.innerHTML = '<div class="subtle">Нет ближайших событий</div>';
      return;
    }

    el.innerHTML = items.map(ev => {
      let start = ev.start.dateTime || ev.start.date;
      return `<div class="row">
        <b>${ev.summary || '(без названия)'}</b>
        <span style="margin-left:auto">${start}</span>
      </div>`;
    }).join('');

  } catch (e) {
    console.error('renderTodayCalendar error', e);
    el.innerHTML = '<div class="bad">Ошибка загрузки календаря</div>';
  }
}

// === Тестер календаря (кнопка + консоль) ===
async function testCalendarOnce() {
  const box = document.querySelector('#todayCalendar');
  if (box) box.innerHTML = '<div class="subtle">Тест календаря…</div>';

  try {
    // 1) Токен
    const token = await ensureDriveAccessToken({ forceConsent: false });
    if (!token) throw new Error('Нет access_token');
    TCRM_Calendar.setAuthToken(token);

    // 2) gapi calendar lib (подстраховка: грузим, если нет)
    await waitFor(() => window.gapi && gapi.client, 10000);
    if (!gapi.client.calendar || !gapi.client.calendar.events) {
      // есть два пути: через наш модуль или напрямую
      if (typeof TCRM_Calendar.ensureLibrary === 'function') {
        await TCRM_Calendar.ensureLibrary();
      } else {
        await new Promise((res, rej) => {
          try { gapi.client.load('calendar', 'v3').then(res, rej); } catch (e) { rej(e); }
        });
      }
    }

    // 3) Календарь «Tattoo CRM» (создастся при отсутствии)
    const calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');
    console.log('[TEST] calId =', calId);

// --- безопасная подгрузка календарной либы ---
await waitFor(() => window.gapi && gapi.client, 10000);
if (!gapi.client.calendar || !gapi.client.calendar.events) {
  // если модуль когда-нибудь даст обёртку — используем её,
  // иначе грузим стандартным способом
  if (typeof TCRM_Calendar.ensureLibrary === 'function') {
    await TCRM_Calendar.ensureLibrary();
  } else {
    await new Promise((res, rej) => {
      try { gapi.client.load('calendar', 'v3').then(res, rej); }
      catch (e) { rej(e); }
    });
  }
}
    // 4) Чтение ближайших событий
    const now = new Date().toISOString();
    const res = await gapi.client.calendar.events.list({
      calendarId: calId,
      timeMin: now,
      maxResults: 5,
      singleEvents: true,
      orderBy: 'startTime'
    });
    console.log('[TEST] events.list result:', res);

    const items = res.result?.items || [];
    if (!items.length) {
      if (box) box.innerHTML = '<div class="subtle">Календарь подключен, но событий нет</div>';
      toast('Календарь OK: событий нет');
      return;
    }

    // Показ в блоке
    if (box) {
      box.innerHTML = items.map(ev => {
        const start = ev.start?.dateTime || ev.start?.date || '';
        return `<div class="row"><b>${ev.summary || '(без названия)'}</b><span style="margin-left:auto">${start}</span></div>`;
      }).join('');
    }
    toast(`Календарь OK: ${items.length} событ.`);
  } catch (e) {
    console.error('[TEST] calendar fail:', e);
    if (box) box.innerHTML = `<div class="bad">Тест не прошёл: ${e?.message || e}</div>`;
    toast('Ошибка календаря (см. консоль)');
  }
}

// Доступно из консоли:
window.tcrmCalTest = testCalendarOnce;


async function syncReminderToCalendar(rem) {
  if (!window.TCRM_Calendar) return;
  try {
    const token = await ensureDriveAccessToken({ forceConsent: false });
    if (!token) return;
    TCRM_Calendar.setAuthToken(token);
    const calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');

    // найдём клиента, чтобы подставить имя в description
    const client = (AppState.clients || []).find(c => c.id === rem.clientId) || null;

    const eid = await TCRM_Calendar.upsertReminderEvent(calId, rem, client);
    if (eid && rem.gcalEventId !== eid) {
      rem.gcalEventId = eid;
      await FB.db.collection('TattooCRM').doc('app')
        .collection('reminders').doc(rem.id)
        .set({ gcalEventId: eid }, { merge: true });
    }
  } catch (e) {
    console.warn('syncReminderToCalendar', e);
  }
}

// ---------- Clients ----------
function bindClientsModal(){
  $('#addClientBtn').addEventListener('click', () => openClientDialog());

 $('#attachPhotosBtn').addEventListener('click', async (e)=>{
  e.preventDefault();
  $('#photoInput').click();

  const id = $('#clientDialog').dataset.id;
  if (id) {
    await refreshClientPhotos(id);
  }
});

  $('#openFolderBtn').addEventListener('click', async () => {
    const id = $('#clientDialog').dataset.id;
    if (!id) return;
    const doc = await FB.db.collection('TattooCRM').doc('app').collection('clients').doc(id).get();
    const folderId = doc.data()?.driveFolderId;
    if (!folderId) return toast('Папка ещё не создана');
    const link = `https://drive.google.com/drive/folders/${folderId}`;
    window.open(link, '_blank');
  });

  $('#shareFolderBtn').addEventListener('click', async () => {
    try{
      const id = $('#clientDialog').dataset.id;
      if (!id) return;
      const doc = await FB.db.collection('TattooCRM').doc('app').collection('clients').doc(id).get();
      const folderId = doc.data()?.driveFolderId;
      if (!folderId) return toast('Папка ещё не создана');

      const link = await Drive.shareFolderPublic(folderId);
      await navigator.clipboard.writeText(link);
      toast('Ссылка на папку скопирована');
    }catch(e){
      console.error(e);
      toast('Не удалось поделиться папкой');
    }
  });

  // Загрузка фото в Google Drive (создаём папку и док в Firestore, если их ещё нет)
$('#photoInput').addEventListener('change', async (e) => {
  try{
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const id = $('#clientDialog').dataset.id;
   if (!id) { toast('Сначала откройте карточку клиента'); return; }

if (!driveReady) {
  await initDriveStack({ forceConsent: isSafariA2HS ? true : false }).catch(() => {
    toast('Подключите Google Drive и повторите');
    throw new Error('Drive not ready');
  });
}

    const name = ($('#fName').value || 'Без имени').trim();
    const clientRef = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(id);
    const snap = await clientRef.get();

    let folderId = snap.exists ? (snap.data()?.driveFolderId || null) : null;
    await Drive.ensureLibrary();
driveReady = true;

    if (!folderId) {
      folderId = await Drive.createClientFolder(id, name);
      await clientRef.set({ id, displayName: name, driveFolderId: folderId, updatedAt: new Date().toISOString() }, { merge: true });
    }

    for (const f of files) {
      await Drive.uploadToFolder(folderId, f);
    }

    toast(`Загружено: ${files.length} файл(ов)`);
    $('#photosEmptyNote').style.display = 'none';

    // обновить превью
    await refreshClientPhotos(id);

  }catch(e){
    console.error(e);
    toast('Ошибка загрузки в Google Drive');
  } finally {
    e.target.value = '';
  }
});

  // ВАЖНО: обработчики сохранения/удаления
  $('#saveClientBtn').addEventListener('click', saveClientFromDialog);
  $('#deleteClientBtn').addEventListener('click', deleteClientFromDialog);
}

function renderClients(){
  const wrap = $('#clientsList');
  wrap.innerHTML = '';

  const term = ($('#searchInput').value || '').trim().toLowerCase();
  const src = $('#filterSource').value || '';
  const st  = $('#filterStatus').value || '';

  // заполняем источники в фильтре один раз
  const srcSel = $('#filterSource');
  if (!srcSel.dataset.filled){
    (AppState.settings?.sources || []).forEach(s=>{
      const o = document.createElement('option'); o.textContent = s; srcSel.appendChild(o);
    });
    srcSel.dataset.filled = '1';
  }

let arr = [...(AppState.clients || [])];
const sel = $('#sortClients');
if (sel && !sel.dataset.init) {  // выставляем один раз
  sel.value = sel.value || 'first';
  sel.dataset.init = '1';
}
const sortMode = $('#sortClients')?.value || 'first';

// helpers
const byName    = (a,b) => (a.displayName || '').localeCompare(b.displayName || '');
const byUpdated = (a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || '');
const fc = (c) => String(c.firstcontactdate || c.firstContactDate || c.firstContact || ''); // канон + легаси
const byFirst   = (a,b) => fc(b).localeCompare(fc(a)); // новые сверху, старые снизу

switch (sortMode) {
  case 'name':  arr.sort(byName);    break;
  case 'first': arr.sort(byFirst);   break;
  default:      arr.sort(byUpdated); break;
}
  if (term) arr = arr.filter(c => [c.displayName,c.phone,(c.styles||[]).join(',')].join(' ').toLowerCase().includes(term));
  if (src)  arr = arr.filter(c => c.source === src);
  if (st)   arr = arr.filter(c => c.status === st);

  arr.forEach(c=>{
    const card = document.createElement('div');
    card.className = 'card-client glass';

   const tags = (c.styles||[]).slice(0,3).join(', ') || '—';
const depositVal = Number(c.deposit || 0);
const sessionsSum = (Array.isArray(c.sessions) ? c.sessions : [])
  .reduce((sum, s) => sum + (s?.done ? Number(s.price||0) : 0), 0);
const ltv = depositVal + sessionsSum;

const langBadge = c.lang ? `<span class="badge" title="Язык">${(c.lang || '').toUpperCase()}</span>` : '';

card.innerHTML = `
  <div class="row" style="justify-content:space-between; gap:8px; align-items:center">
    <div class="row" style="gap:8px; align-items:center">
      <b>${c.displayName}</b>
      ${langBadge}
    </div>
    <div class="badge">${c.status || 'Лид'}</div>
  </div>
  <div class="meta">${c.source || '—'}</div>
  <div class="meta">Депозит: €${depositVal.toFixed(2)} + Сеансы: €${sessionsSum.toFixed(2)} = LTV €${ltv.toFixed(2)}</div>
  <div class="meta">Теги: ${tags}</div>
  <div class="row" style="justify-content:flex-end; gap:8px">
    <button class="btn" data-edit>Открыть</button>
  </div>
`;
    card.querySelector('[data-edit]').addEventListener('click', ()=> openClientDialog(c));
    wrap.appendChild(card);
  });

  $('#searchInput').oninput = () => renderClients();
  $('#filterSource').onchange = () => renderClients();
  $('#filterStatus').onchange = () => renderClients();
$('#sortClients').onchange = () => renderClients();
}

async function refreshClientPhotos(clientId){
  try{
    const ref = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(clientId);
    const snap = await ref.get();
    const folderId = snap.data()?.driveFolderId;
    const grid = $('#photosGrid');

    if (!grid) return;
    grid.innerHTML = '';

    if (!folderId) {
      $('#photosEmptyNote').style.display = 'block';
      return;
    }

    const files = await Drive.listFilesInFolder(folderId, 200);
    if (!files.length) {
      $('#photosEmptyNote').style.display = 'block';
      return;
    }
    $('#photosEmptyNote').style.display = 'none';

    files.forEach(f => {
      const div = document.createElement('div');
      div.className = 'thumb';
      const thumb = f.thumbnailLink || f.iconLink;
      div.innerHTML = `
        <img src="${thumb}" alt="${f.name}">
        <div class="thumb-meta" title="${f.name}">${f.name}</div>
      `;
      div.addEventListener('click', ()=> window.open(f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`, '_blank'));
      grid.appendChild(div);
    });
  }catch(e){
    console.error(e);
  }
}

function bindSupplies(){
  const btnAdd = $('#addSupplyBtn');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => openSupplyDialog(null));
  }
}

function openSupplyDialog(s = null){
  const dlg = $('#supplyDialog');
  const isNew = !s;
  dlg.dataset.id = s?.id || '';

  $('#supplyModalTitle').textContent = isNew ? 'Новая позиция' : 'Редактирование';

  // Заполняем селект Типов из настроек
  const typeSel = $('#supType');
  typeSel.innerHTML = '';
  (AppState.settings?.supplies || []).forEach(t=>{
    const o = document.createElement('option'); o.value = t; o.textContent = t; typeSel.appendChild(o);
  });

  const dict = AppState.settings?.suppliesDict || {};
  function fillDependentFields(){
  const t = $('#supType').value;
  const d = (AppState.settings?.suppliesDict || {})[t] || {};

  // Единица
  $('#supUnit').value = (s?.unit) || d.units || '';

  // Подтип
  const kindSel = $('#supKind');
  const kindTxt = $('#supKindText');
  kindSel.innerHTML = '';
  const kinds = d.kinds || [];
  if (kinds.length) {
    kinds.forEach(k => {
      const o = document.createElement('option');
      o.value = k; o.textContent = k; kindSel.appendChild(o);
    });
    kindSel.style.display = '';
    kindTxt.style.display = 'none';
  } else {
    kindSel.style.display = 'none';
    kindTxt.style.display = '';
  }

  // Бренды
  const brandSel = $('#supBrand');
  const brandTxt = $('#supBrandText');
  brandSel.innerHTML = '';
  const brands = d.brands || [];
  if (brands.length) {
    brands.forEach(b => {
      const o = document.createElement('option');
      o.value = b; o.textContent = b; brandSel.appendChild(o);
    });
    brandSel.style.display = '';
    brandTxt.style.display = 'none';
  } else {
    brandSel.style.display = 'none';
    brandTxt.style.display = '';
  }

  // Размеры
  const sizeSel = $('#supSize');
  const sizeTxt = $('#supSizeText');
  sizeSel.innerHTML = '';
  const sizes = d.sizes || [];
  if (sizes.length) {
    sizes.forEach(sz => {
      const o = document.createElement('option');
      o.value = String(sz); o.textContent = String(sz); sizeSel.appendChild(o);
    });
    sizeSel.style.display = '';
    sizeTxt.style.display = 'none';
  } else {
    sizeSel.style.display = 'none';
    sizeTxt.style.display = '';
  }
}



  typeSel.onchange = fillDependentFields;

  // Проставим значения
  typeSel.value = s?.cat || (AppState.settings?.supplies?.[0] || '');
fillDependentFields();

// существующие:
if ($('#supKind').style.display !== 'none') { $('#supKind').value = s?.kind || ''; }
else { $('#supKindText').value = s?.kind || ''; }

if ($('#supBrand').style.display !== 'none') { $('#supBrand').value = s?.brand || ''; }
else { $('#supBrandText').value = s?.brand || ''; }

if ($('#supSize').style.display !== 'none') { $('#supSize').value = s?.size || ''; }
else { $('#supSizeText').value = s?.size || ''; }    $('#supName').value = s?.name || '';
  $('#supQty').value  = (typeof s?.qty === 'number') ? s.qty : 1;
  $('#supUnit').value = s?.unit || $('#supUnit').value;
  $('#supLink').value = s?.link || '';
  $('#supNote').value = s?.note || '';

  // Кнопки
  $('#deleteSupplyBtn').style.display = isNew ? 'none' : '';
  $('#saveSupplyBtn').onclick = saveSupplyFromDialog;
  $('#deleteSupplyBtn').onclick = deleteSupplyFromDialog;

  dlg.showModal();
}

function buildSupplyName({cat, brand, kind, size, note, fallback}){
  const parts = [cat, brand, kind, size ? `⌀${size}` : '', note].filter(Boolean);
  const s = parts.join(' ');
  return s || (fallback || 'Позиция');
}

async function saveSupplyFromDialog(){
  const dlg = $('#supplyDialog');
  let id = dlg.dataset.id;
  const isNew = !id;
  if (isNew) id = `sp_${crypto.randomUUID().slice(0,8)}`;

  const cat  = $('#supType').value.trim();
  const kind = ($('#supKind').style.display !== 'none'

  ? $('#supKind').value.trim()
  : $('#supKindText').value.trim());

const brand = ($('#supBrand').style.display !== 'none'
  ? $('#supBrand').value.trim()
  : $('#supBrandText').value.trim());

const size = ($('#supSize').style.display !== 'none'
  ? $('#supSize').value.trim()
  : $('#supSizeText').value.trim());
  const qty  = Number($('#supQty').value || 0);
  const unit = $('#supUnit').value.trim();
  const link = $('#supLink').value.trim();
  const note = $('#supNote').value.trim();

 const name = ($('#supName').value.trim()) || buildSupplyName({cat, brand, kind, size, note, fallback:'Позиция'});

  const item = {
  id, cat, kind, brand, size, name, qty, unit, link, note,
  left: qty,
  updatedAt: new Date().toISOString()
};

  // Локально — в состояние (чтобы UI отрисовался сразу)
  const i = AppState.supplies.findIndex(x => x.id === id);
  if (i >= 0) AppState.supplies[i] = item; else AppState.supplies.push(item);
  renderSupplies();

  // Firestore
  try {
    const ref = FB.db.collection('TattooCRM').doc('app').collection('supplies').doc(id);
    await ref.set(item, { merge:true });
    toast('Сохранено');
  } catch(e){
    console.warn(e);
    toast('Ошибка сохранения');
  }

  dlg.close();
}

async function deleteSupplyFromDialog(){
  const dlg = $('#supplyDialog');
  const id = dlg.dataset.id;
  if (!id) { dlg.close(); return; }

  // Удалим локально
  AppState.supplies = AppState.supplies.filter(x => x.id !== id);
  renderSupplies();

  // Firestore (мягкое удаление можно сделать позже)
  try{
    await FB.db.collection('TattooCRM').doc('app').collection('supplies').doc(id).delete();
    toast('Удалено');
  }catch(e){
    console.warn(e);
    toast('Ошибка удаления');
  }

  dlg.close();
}



// Пометить конкретный сеанс клиента как состоявшийся (done=true/false)
// Пометить конкретный сеанс клиента как состоявшийся (done=true/false)
// Пометить конкретный сеанс клиента как состоявшийся (done=true/false)
async function setSessionDone(clientId, dtIso, done = true) {
  // найдём клиента и нужный сеанс
  let c = (AppState.clients || []).find(x => x.id === clientId);
  if (!c) {
    // фолбэк: берём из Firestore, чтобы работало даже если стейт не успел обновиться
   const ref = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(clientId);
    const snap = await ref.get();
   if (snap.exists) c = snap.data();
  }
  if (!c) throw new Error('Клиент не найден');
  const sessions = Array.isArray(c.sessions) ? [...c.sessions] : [];
  const idx = sessions.findIndex(s => (typeof s === 'object' ? s.dt : s) === dtIso);
  if (idx < 0) throw new Error('Сеанс не найден');

  const prev = sessions[idx];
  const wasDone = !!(typeof prev === 'object' && prev.done);
  const sObj = (typeof prev === 'object') ? { ...prev } : { dt: prev, price: 0 };

  sObj.done = !!done;

  // если впервые ставим done=true — создаём follow-up напоминания 1/3/10/60 дней
  if (!wasDone && sObj.done && !sObj.postRemindersCreated) {
    try {
      const ids = await createPostSessionReminders(c, sObj.dt, [
        { after: 1,  title: 'Скинуть фотографии' },
        { after: 3,  title: 'Спросить про заживление' },
        { after: 10, title: 'Спросить про заживление' },
        { after: 60, title: 'Спросить, всё ли нравится' } // ≈ 2 месяца
      ]);
      sObj.postRemindersCreated = true;
      sObj.postReminderIds = ids;
    } catch (e) {
      console.warn('createPostSessionReminders', e);
    }
  }

  // локально и UI
  sessions[idx] = sObj;
  c.sessions = sessions;
  c.updatedAt = new Date().toISOString();
  renderToday();
  renderClients();

  // Firestore
  const ref = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(clientId);
  await ref.set({ sessions, updatedAt: c.updatedAt }, { merge: true });
}

function addSessionField(s = { dt: '', price: '', done: false }) {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.style.margin = '6px 0';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';

  wrap.innerHTML = `
    <!-- 1) Галочка (без текста) -->
    <input type="checkbox"
           class="sessionDone"
           ${s.done ? 'checked' : ''}
           title="Сеанс состоялся"
           aria-label="Сеанс состоялся"
           style="width:20px; height:20px; accent-color:#ff9d3a;">

    <!-- 2) Дата и время -->
    <input type="datetime-local"
           class="sessionDate"
           value="${s.dt || ''}"
           style="flex:1; min-width:180px">

    <!-- 3) Сумма -->
    <input type="number"
           step="0.01" min="0"
           class="sessionPrice"
           placeholder="€"
           value="${(s.price ?? '')}"
           title="Стоимость сеанса, €"
           style="width:120px">

    <!-- 4) Удалить -->
    <button type="button" class="btn danger" title="Удалить дату">✕</button>
  `;

  // обработчик удаления
  wrap.querySelector('button').onclick = () => wrap.remove();
// галочка «сеанс состоялся» — создаёт/снимает done и (при включении) делает follow-ups
  const cb = wrap.querySelector('.sessionDone');
  const dtInput = wrap.querySelector('.sessionDate');

  cb.addEventListener('change', async () => {
    const dlg = document.getElementById('clientDialog');
    const clientId = dlg?.dataset?.id;
    const dt = dtInput?.value?.trim();

    if (!clientId) { toast('Сначала сохраните клиента'); cb.checked = !cb.checked; return; }
    if (!dt) { toast('Укажите дату сеанса'); cb.checked = !cb.checked; return; }

    try {
      await setSessionDone(clientId, dt, cb.checked);
      toast(cb.checked ? 'Сеанс отмечен как проведён' : 'Отметка снята');
    } catch (e) {
      console.warn(e);
      toast('Не удалось обновить сеанс');
      cb.checked = !cb.checked;
    }
  });
  $('#sessionsList').appendChild(wrap);
}

// --- История смен статусов клиента ---

function formatDateTimeHuman(iso){
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return iso; }
}

// Записать факт смены статуса в подколлекцию /clients/{id}/statusLogs
async function logStatusChange(clientId, fromStatus, toStatus){
  if (!clientId || fromStatus === toStatus) return;
  const ts = new Date().toISOString();

  const ref = FB.db
    .collection('TattooCRM').doc('app')
    .collection('clients').doc(clientId)
    .collection('statusLogs').doc(String(Date.now())); // простой уникальный id

  await ref.set({ ts, from: fromStatus || null, to: toStatus || null });
}

// Подписаться и отрисовать историю
function bindStatusHistory(clientId){
  const box = document.getElementById('statusHistory');
  if (!box || !clientId) return;

  box.innerHTML = '<div class="meta">Загрузка…</div>';

  const q = FB.db
    .collection('TattooCRM').doc('app')
    .collection('clients').doc(clientId)
    .collection('statusLogs').orderBy('ts', 'desc');

  // live-обновления
  return q.onSnapshot(snap=>{
    const arr = [];
    snap.forEach(doc => arr.push(doc.data()));
    renderStatusHistory(arr);
  }, ()=> {
    box.innerHTML = '<div class="meta">Не удалось загрузить историю</div>';
  });

  function renderStatusHistory(items){
    if (!items.length){
      box.innerHTML = '<div class="empty-note">История пуста</div>';
      return;
    }
    box.innerHTML = '';
    items.forEach(it=>{
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="what">${(it.from || '—')} → <b>${it.to || '—'}</b></div>
        <div class="when">${formatDateTimeHuman(it.ts)}</div>
      `;
      box.appendChild(row);
    });
  }
}


async function openClientDialog(c = null){
  const dlg = $('#clientDialog');
  if (!dlg) { toast('Диалог не найден'); return; }

  try {
    // открываем модалку сразу, чтобы не «залипал» невидимый backdrop
    dlg.showModal();
    console.log('[clientDialog] open', { id: c?.id });

    const isNew = !c;
    const id = c?.id || `cl_${crypto.randomUUID().slice(0,8)}`;
    dlg.dataset.id = id;
    $('#clientModalTitle').textContent = isNew ? 'Новый клиент' : (c?.displayName || 'Клиент');

    // Источник (select)
{
  const fSource = $('#fSource');
  if (fSource) {
    fSource.replaceChildren();
    (AppState.settings?.sources || []).forEach(s => {
      const o = document.createElement('option');
      o.textContent = s;
      fSource.appendChild(o);
    });
  } else {
    console.warn('[clientDialog] #fSource not found');
  }
}

// Стили (multiple select)
{
  const fStyles = $('#fStyles');
  if (fStyles) {
    fStyles.replaceChildren();
    (AppState.settings?.styles || []).forEach(st => {
      const o = document.createElement('option');
      o.value = st; o.textContent = st;
      if ((c?.styles || []).includes(st)) o.selected = true;
      fStyles.appendChild(o);
    });
  } else {
    console.warn('[clientDialog] #fStyles not found');
  }
}

// Зоны (multiple select)
{
  const fZones = $('#fZones');
  if (fZones) {
    fZones.replaceChildren();
    (AppState.settings?.zones || []).forEach(z => {
      const o = document.createElement('option');
      o.value = z; o.textContent = z;
      if ((c?.zones || []).includes(z)) o.selected = true;
      fZones.appendChild(o);
    });
  } else {
    console.warn('[clientDialog] #fZones not found');
  }
}


// Простые поля
$('#fName').value   = c?.displayName || '';
$('#fPhone').value  = c?.phone || '';
$('#fLink').value   = c?.link || '';
const fLang = $('#fLang'); if (fLang) fLang.value = c?.lang || '';
const fGender = $('#fGender'); if (fGender) fGender.value = c?.gender || '';

const fSourceSel = $('#fSource'); if (fSourceSel) fSourceSel.value = c?.source || (AppState.settings?.sources?.[0] || '');

    // Первое обращение (опциональные поля)
    // Первое обращение (опционально)
{
  const firstContactEl = $('#fFirstContact');
  if (firstContactEl) {
    // читаем приоритетно новый ключ firstcontactdate, затем легаси-варианты
  const legacyFCD =
      c?.firstcontactdate
  || c?.firstContactDate
   || c?.firstContact
   || c?.first_contact
   || '';
    // Новый клиент → сегодня; существующий → что было (или пусто)
    firstContactEl.value = isNew ? ymdLocal(new Date()) : (legacyFCD || '');
  }
}
    const firstEl = $('#fFirst');
    if (firstEl) {
      firstEl.value = String(c?.first ?? true);
    }

    // Статусы/типы/квалификация
    $('#fType').value   = c?.type || 'Новая';
    $('#fStatus').value = c?.status || 'Лид';
  {
  const q = String(c?.qual || '').toLowerCase();
  let v = 'Условно-целевой';                 // дефолт
  if (q.includes('не цел') || q.includes('нецел')) v = 'Не целевой';
  else if (q.includes('условно')) v = 'Условно-целевой';
  else if (q.includes('целевой')) v = 'Целевой';
  $('#fQual').value = v;
}
$('#fQualNote').value = c?.qualNote || '';

// Комментарий (заметка по клиенту)
$('#fNotes').value = c?.notes || '';

// Депозит
$('#fDeposit').value = c?.deposit || '';


// включаем/выключаем cold-mode
toggleColdLeadMode($('#fStatus').value === 'Холодный лид');
$('#fStatus').onchange = (e) => {
  toggleColdLeadMode(e.target.value === 'Холодный лид');
};

    // Озвученная сумма: от/до (с учетом «наследия»)
    const minEl = $('#fAmountMin');
    const maxEl = $('#fAmountMax');
    let aMin = c?.amountMin;
    let aMax = c?.amountMax;
    if ((aMin == null && aMax == null) && (c?.amount != null)) {
      const n = Number(c.amount);
      if (!isNaN(n)) { aMin = n; aMax = n; }
    }
    minEl.value = (aMin ?? '');
    maxEl.value = (aMax ?? '');

// --- [NEW] суммы распределения оплаты ---
$('#fAmountMe').value = (c?.amountMe ?? '');
$('#fAmountStudio').value = (c?.amountStudio ?? '');

    // Сеансы — рендерим список полей
    const list = $('#sessionsList');
const rawSessions = c?.sessions || (c?.nextDate ? [c.nextDate] : []);

if (list) {
  list.innerHTML = '';
  rawSessions.forEach(s => {
    if (typeof s === 'string') {
      addSessionField({ dt: s, price: '', done: false });
    } else {
      addSessionField({ dt: s?.dt || '', price: (s?.price ?? ''), done: !!s?.done });
    }
  });
  if (!list.children.length) addSessionField({ dt:'', price:'' });

  const addBtn = $('#btnAddSession');
  if (addBtn) addBtn.onclick = () => addSessionField({ dt:'', price:'' });
} else {
  console.warn('[clientDialog] #sessionsList not found — добавь блок в index.html');
}

    // Консультация (свитч + дата)
    $('#fConsultOn').checked = !!(c?.consult);
    $('#fConsultDate').value = c?.consultDate ? c.consultDate.slice(0,16) : '';
    $('#consultDateField').style.display = $('#fConsultOn').checked ? '' : 'none';
    $('#fConsultOn').onchange = () => {
      $('#consultDateField').style.display = $('#fConsultOn').checked ? '' : 'none';
    };

    // Напоминания: шаблоны и «через N дней» (безопасная инициализация)
{
  const tplSel = $('#fReminderTpl');
  if (tplSel) {
    tplSel.innerHTML = '<option value="">— шаблон —</option>';
    (AppState.settings?.reminderTemplates || []).forEach(t => {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t;
      tplSel.appendChild(o);
    });
  } else {
    console.warn('[clientDialog] #fReminderTpl not found');
  }

  const afterSel = $('#fReminderAfter');
  if (afterSel) {
    afterSel.innerHTML = '<option value="">дни</option>';
    (AppState.settings?.reminderDelays || []).forEach(d => {
      const o = document.createElement('option');
      o.value = String(d);
      o.textContent = `через ${d}`;
      afterSel.appendChild(o);
    });
  } else {
    console.warn('[clientDialog] #fReminderAfter not found');
  }

  const titleInput = $('#fReminderTitle');
  if (titleInput) {
    titleInput.value = '';
  } else {
    console.warn('[clientDialog] #fReminderTitle not found');
  }
}


    // Фото/превью
    $('#photosGrid').innerHTML = '';
    $('#photosEmptyNote').style.display = 'block';
    await refreshClientPhotos(id);

    // Список напоминаний клиента (с удалением)
    const remWrap = $('#clientReminders');
    if (remWrap) {
      remWrap.innerHTML = '';
      const myRems = (AppState.reminders || [])
        .filter(r => r.clientId === c?.id)
        .filter(r => !(r.title && /^Консультация:/i.test(r.title)));
      if (!myRems.length) {
        remWrap.innerHTML = '<div class="meta">Напоминаний нет</div>';
      } else {
        myRems.forEach(r => {
          const row = document.createElement('div');
          row.className = 'row';
          row.style.alignItems = 'center';
          row.style.justifyContent = 'space-between';
          row.style.margin = '4px 0';

          const text = document.createElement('div');
          text.className = 'meta';
          text.textContent = `🔔 ${formatDateHuman(r.date)} — ${r.title}`;

          const btn = document.createElement('button');
          btn.className = 'btn danger';
          btn.textContent = '✕';
          btn.title = 'Удалить это напоминание';
          btn.style.padding = '2px 8px';
          btn.addEventListener('click', async () => {
            if (!r?.id) { toast('У напоминания нет id'); return; }
            const ok = await confirmDlg('Хотите удалить это напоминание?');
            if (!ok) return;
            try {
              await FB.db.collection('TattooCRM').doc('app').collection('reminders').doc(r.id).delete();
              row.remove(); // оптимистично
              toast('Напоминание удалено');
            } catch (e) {
              console.warn(e);
              toast('Не удалось удалить напоминание');
            }
          });

          row.appendChild(text);
          row.appendChild(btn);
          remWrap.appendChild(row);
        });
      }
    }

// История статусов — запустить подписку на обновления
bindStatusHistory(id);
    console.log('[clientDialog] filled');
  } catch (e) {
    console.error('[clientDialog] fail', e);
    toast('Не удалось открыть карточку клиента');
    try { dlg.close(); } catch (_) {}
  }
}
async function openClientById(clientId){
  if (!clientId) return;
  const cached = (AppState.clients || []).find(x => x.id === clientId);
  if (cached) { openClientDialog(cached); return; }

  try {
    const ref = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(clientId);
    const snap = await ref.get();
    if (snap.exists) {
      openClientDialog(snap.data());
    } else {
      toast('Клиент не найден');
    }
  } catch(e){
    console.warn(e);
    toast('Не удалось открыть карточку клиента');
  }
}

// === One-time migration: normalize to "firstcontactdate" ===
async function migrateFirstContactDate() {
  const col = FB.db.collection('TattooCRM').doc('app').collection('clients');
  const snap = await col.get();

  let batch = FB.db.batch();
  let count = 0, writes = 0;
  for (const doc of snap.docs) {
    const c = doc.data() || {};
    // возьмём значение из любого известного поля
    const fcd =
         c.firstcontactdate
      || c.firstContactDate
      || c.firstContact
      || c.first_contact
      || '';

    if (!fcd) continue;

    // пишем каноническое поле + оставляем дубликаты для обратной совместимости
    batch.set(doc.ref, {
      firstcontactdate: fcd,
      firstContactDate: fcd,
      firstContact:     fcd,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    writes++;
    // батчим безопасно пачками < 500
    if (writes >= 400) {
      await batch.commit();
      batch = FB.db.batch();
      writes = 0;
    }
    count++;
  }

  if (writes) await batch.commit();
  console.log('migrateFirstContactDate: updated docs =', count);
}

// (опционально) Чистка легаси-полей — запускать только когда убедишься, что в UI всё ок:
async function cleanupLegacyFirstContactFields() {
  const col = FB.db.collection('TattooCRM').doc('app').collection('clients');
  const snap = await col.get();
  let batch = FB.db.batch(); let writes = 0, count = 0;

  for (const doc of snap.docs) {
    const c = doc.data() || {};
    if (!c.firstcontactdate) continue; // безопасно: чистим только когда уже есть канон

    batch.set(doc.ref, {
      firstContactDate: firebase.firestore.FieldValue.delete?.() ?? undefined,
      firstContact:     firebase.firestore.FieldValue.delete?.() ?? undefined,
      first_contact:    firebase.firestore.FieldValue.delete?.() ?? undefined,
    }, { merge: true });

    writes++; count++;
    if (writes >= 400) { await batch.commit(); batch = FB.db.batch(); writes = 0; }
  }

  if (writes) await batch.commit();
  console.log('cleanupLegacyFirstContactFields: cleaned docs =', count);
}

// --- Cold Lead Mode ---
// Прячет лишние поля, если выбран статус "Холодный лид"
// --- Cold Lead Mode ---
// Прячет лишние поля, если выбран статус "Холодный лид"
function toggleColdLeadMode(isCold) {
  // helper: спрятать обёртку ближайшего .field/.row/.grid.two
  const hideWrap = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const wrap = el.closest('.field, .row, .grid.two') || el;
    wrap.style.display = isCold ? 'none' : '';
  };

  // блоки одной строкой (консультация, деньги)
  const hideBlock = (sel) => {
    const el = document.querySelector(sel);
    if (el) el.style.display = isCold ? 'none' : '';
  };

  // 1) поля, которые точно прячем
  [
    // квалификация
    'fQual', 'fQualNote',
    // первая тату, тип, теги, зоны
    'fFirst', 'fType', 'fStyles', 'fZones',
    // суммы/депозит (внутренности строки "деньги")
    'fAmountMin', 'fAmountMax', 'fDeposit',
    // сеансы и вся их «строка»
    'sessionsList',
    // напоминания
    'fReminderTpl', 'fReminderAfter', 'fReminderTitle', 'clientReminders',
    // заметка
    'fNotes'
  ].forEach(hideWrap);

  // 2) целые строки-секции
  hideBlock('#rowConsult');
  hideBlock('#rowMoney');

  // 3) фотопанель целиком
  const photosPanel = document.getElementById('photosGrid')?.closest('.panel');
  if (photosPanel) photosPanel.style.display = isCold ? 'none' : '';

  // 4) «Даты сеансов» — у них своя обёртка .field
  const sessionsField = document.getElementById('sessionsList')?.closest('.field');
  if (sessionsField) sessionsField.style.display = isCold ? 'none' : '';
}


async function saveClientFromDialog(){
  let id = $('#clientDialog').dataset.id;

  const displayName = $('#fName').value.trim();

// Предыдущая версия клиента до изменений — нужна для сравнения сеансов (что удалили и т.п.)
const prevClient = (AppState.clients || []).find(x => x.id === id) || null;

  const isNew = !id || !id.startsWith('cl_');
  if (isNew) {
    id = `cl_${crypto.randomUUID().slice(0,8)}`;
    $('#clientDialog').dataset.id = id;
  }
const prevStatus = (AppState.clients.find(x => x.id === id) || {}).status || '';
const statusVal = $('#fStatus').value;

 // --- Особый случай: холодный лид ---
if (statusVal === 'Холодный лид') {
  // ❶ Берём предыдущую карточку клиента (если уже существовал)
  const prev = AppState.clients.find(x => x.id === id) || {};

  // ❷ Что ввёл юзер в поле «Дата первого обращения»
  const inputFCD = ($('#fFirstContact').value || '').trim();

  // ❸ Вычисляем итоговую дату:
  // - если юзер ввёл дату → её и берём
  // - иначе берём прежнее значение из клиента (firstContactDate/firstContact)
  // - если это НОВЫЙ клиент (isNew == true), то подставляем «сегодня» локально
  const fcd = inputFCD || prev.firstContactDate || prev.firstContact || (isNew ? ymdLocal(new Date()) : '');

  // ❹ Формируем объект клиента, дублируя дату в оба поля:
  const client = {
    id,
    displayName,
    phone: $('#fPhone').value.trim(),
    status: statusVal,
    source: $('#fSource').value || '',
    link: $('#fLink').value.trim() || '',

    // важное: пишем в оба поля
   // canonical: firstcontactdate + дубликаты для обратной совместимости
   firstcontactdate: fcd,
   firstContactDate: fcd,
    firstContact:     fcd,

    lang: $('#fLang').value || '',
gender: $('#fGender').value || '',

// --- [NEW] для холодных лидов суммы считаем 0 ---
amountMe: 0,
amountStudio: 0,

updatedAt: new Date().toISOString()
  };

  const i = AppState.clients.findIndex(x => x.id === id);
  if (i >= 0) AppState.clients[i] = client; else AppState.clients.push(client);
  renderClients();

  try {
    const ref = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(id);
    await ref.set(client, { merge:true });
// 1) Синхронизация консультации и сеансов в Google Calendar ("Tattoo CRM" календарь)
try {
  await syncClientToCalendar(prevClient, client);

  // 2) Если во время синка проставились/изменились ID событий — сохраним их в Firestore
  const patch = {};
  if (client.gcalConsultEventId) patch.gcalConsultEventId = client.gcalConsultEventId;
  if (Array.isArray(client.sessions)) patch.sessions = client.sessions;

  if (Object.keys(patch).length) {
    await ref.set(patch, { merge: true });
  }
} catch (e) {
  console.warn('calendar sync failed', e);
}
    try { await logStatusChange(id, prevStatus, statusVal); } catch(_) {}
    toast('Сохранено (холодный лид)');
  } catch(e) {
    console.warn('save cold lead', e);
    toast('Ошибка сохранения');
  }

  $('#clientDialog').close();
  return; // ← выходим, остальные поля не сохраняем
}
// --- Озвученная сумма: от/до ---
let amountMin = Number(($('#fAmountMin')?.value ?? '').trim());
let amountMax = Number(($('#fAmountMax')?.value ?? '').trim());

// превращаем NaN в null
if (isNaN(amountMin)) amountMin = null;
if (isNaN(amountMax)) amountMax = null;

// если введено только одно значение — дублируем
if (amountMin != null && amountMax == null) amountMax = amountMin;
if (amountMax != null && amountMin == null) amountMin = amountMax;

// если перепутали местами — поменяем
if (amountMin != null && amountMax != null && amountMin > amountMax) {
  const t = amountMin; amountMin = amountMax; amountMax = t;
}
// --- First Contact Date (общий кейс) ---
{
  const prev = (AppState.clients || []).find(x => x.id === id) || {};
  const inputFCD = ($('#fFirstContact').value || '').trim();
  var fcd =
      inputFCD
   || prev.firstcontactdate
   || prev.firstContactDate
   || prev.firstContact
   || prev.first_contact
   || (isNew ? ymdLocal(new Date()) : '');
}
 const client = {
  id,
  displayName,
  phone: $('#fPhone').value.trim(),
  link: $('#fLink').value.trim(),
source: $('#fSource').value.trim(),
lang: $('#fLang').value || '',
gender: $('#fGender').value || '',

// canonical: firstcontactdate + дубликаты для обратной совместимости
firstcontactdate: fcd,
firstContactDate: fcd,
firstContact:     fcd,

first: ($('#fFirst').value === 'true'),
  type: $('#fType').value.trim(),
styles: Array.from($('#fStyles').selectedOptions).map(o=>o.value),
zones: Array.from($('#fZones').selectedOptions).map(o=>o.value),status: $('#fStatus').value,
qual: $('#fQual').value,
qualNote: $('#fQualNote').value.trim(),            // ← добавили
deposit: Number($('#fDeposit').value || 0),

// --- [NEW] суммы распределения оплаты ---
amountMe: Number(($('#fAmountMe')?.value || '').trim() || 0),
amountStudio: Number(($('#fAmountStudio')?.value || '').trim() || 0),

amountMin,                 // новая модель
amountMax,                 // новая модель
amount: (amountMax ?? amountMin ?? 0),  // легаси: пишем число для старого поляnotes: $('#fNotes').value.trim(),
  sessions: Array.from(document.querySelectorAll('#sessionsList .row'))
  .map(row => {
    const dt = row.querySelector('.sessionDate')?.value;
    if (!dt) return null;
    const priceNum = Number(row.querySelector('.sessionPrice')?.value || 0);
    const done = !!row.querySelector('.sessionDone')?.checked;
    return { dt, price: isNaN(priceNum) ? 0 : priceNum, done };
  })
  .filter(Boolean),

  // NEW
  // --- Консультация: если свитч включён и указана дата — сохраняем; иначе сбрасываем
  ...( (() => {
    const on = $('#fConsultOn').checked;
    const date = $('#fConsultDate').value;
    if (on && date) {
      return { consult: true, consultDate: date };
    } else {
      return { consult: false, consultDate: '' };
    }
  })() ),

  updatedAt: new Date().toISOString()
};




  const i = AppState.clients.findIndex(x => x.id === id);
  if (i >= 0) AppState.clients[i] = client; else AppState.clients.push(client);
  renderClients();

  try {
    const ref = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(id);
    // 1) Сохраняем клиента
await ref.set(client, { merge:true });

// После await ref.set(client, { merge: true });
try {
  await syncClientToCalendar(prevClient, client);
  const patch = {};
  if (client.gcalConsultEventId) patch.gcalConsultEventId = client.gcalConsultEventId;
  if (Array.isArray(client.sessions)) patch.sessions = client.sessions;
  if (Object.keys(patch).length) await ref.set(patch, { merge: true });
} catch (e) {
  console.warn('calendar sync failed', e);
}

// NEW: зафиксируем смену статуса
try { await logStatusChange(id, prevStatus, $('#fStatus').value); } catch(_) {}

    // --- авто-создание напоминания: только если выбран шаблон/введён текст,
// и ВСЕГДА от сегодняшней даты (не зависит от сеансов)
// --- очистка старых напоминаний о консультации (они больше не нужны)
try {
  const remCol = FB.db.collection('TattooCRM').doc('app').collection('reminders');

  // 1) старый фиксированный id вида rc_<clientId>
  await remCol.doc(`rc_${client.id}`).delete().catch(()=>{});

  // 2) любые напоминания этого клиента, где title начинается с "Консультация:"
  const snap = await remCol.where('clientId', '==', client.id).get();
  const batch = FB.db.batch();
  snap.forEach(doc => {
    const r = doc.data() || {};
    if (r.title && /^Консультация:/i.test(r.title)) batch.delete(doc.ref);
  });
  try { await batch.commit(); } catch(_) {}
} catch (e) {
  console.warn('cleanup consult reminders', e);
}    // 2) Автосоздание папки, если ещё нет
    if (driveReady) {
      const snap = await ref.get();
      let folderId = snap.data()?.driveFolderId || null;
      if (!folderId) {
        folderId = await Drive.createClientFolder(id, displayName || 'Без имени');
        await ref.set({ driveFolderId: folderId, updatedAt: new Date().toISOString() }, { merge: true });
      }
      // 3) Обновим превью фоток (если модалка ещё открыта)
      if ($('#clientDialog').open) {
        await refreshClientPhotos(id);
      }
    }
 // --- авто-создание напоминания ---
    try {
      const title = ($('#fReminderTitle').value || '').trim() || $('#fReminderTpl').value.trim();
      if (title) {
        const afterDays = Number($('#fReminderAfter').value || 0);
        const dateObj = addDaysLocal(new Date(), isNaN(afterDays) ? 0 : afterDays);
        const ymd = ymdLocal(dateObj);

        const remId = `rm_${crypto.randomUUID().slice(0,8)}`;
        const reminder = {
          id: remId,
          clientId: client.id,
          clientName: client.displayName,
          date: ymd,
          title,
          createdAt: new Date().toISOString()
        };

        await FB.db.collection('TattooCRM').doc('app').collection('reminders').doc(remId).set(reminder);

        // ⬇️ ДОБАВЛЯЕМ: синхронизируем с Google Calendar
        try { 
          await syncReminderToCalendar(reminder); 
        } catch(eSync) { 
          console.warn('autoReminder sync fail', eSync); 
        }
      }
    } catch (e) {
      console.warn('autoReminder', e);
    }

    toast('Сохранено');
  } catch(e) {
    console.warn('saveClientFromDialog', e);
    toast('Ошибка сохранения');
  }

  $('#clientDialog').close();
}

async function deleteClientFromDialog(){
  const id = $('#clientDialog').dataset.id;
  if (!id) { $('#clientDialog').close(); return; }

  // 1) Уберём из локального стейта, чтобы UI сразу очистился
  AppState.clients = AppState.clients.filter(x => x.id !== id);
  renderClients();

  try {
    // 2) Прочитаем документ, чтобы узнать driveFolderId (если есть)
    const ref = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(id);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;
    const folderId = data?.driveFolderId || null;

    // 3) Удалим связанные напоминания (если создавались автосозданием)
const rs = await FB.db.collection('TattooCRM').doc('app').collection('reminders')
  .where('clientId', '==', id).get();

// 3.1) Попробуем удалить их события в Google Calendar (если есть)
try {
  if (window.TCRM_Calendar) {
    const token = await ensureDriveAccessToken({ forceConsent: false });
    if (token) {
      TCRM_Calendar.setAuthToken(token);
      const calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');

      for (const d of rs.docs) {
        const data = d.data() || {};
        const gcalId = data.gcalEventId || null;
        if (gcalId) {
          try {
            await TCRM_Calendar.deleteEvent(calId, gcalId);
          } catch (eDel) {
            console.warn('calendar reminder delete (client)', gcalId, eDel);
          }
        }
      }
    }
  }
} catch (gerr) {
  console.warn('calendar bulk delete (client)', gerr);
}

// 3.2) Теперь удалим документы напоминаний из Firestore (как было)
const batch = FB.db.batch();
rs.forEach(d => {
  batch.delete(FB.db.collection('TattooCRM').doc('app').collection('reminders').doc(d.id));
});
await batch.commit();

    // 4) Удалим сам документ клиента в Firestore — КЛЮЧЕВО!
    await ref.delete();

    // 5) Отправим папку клиента в корзину на Google Drive (если была)
    try {
      const canTrash = (typeof Drive?.trashFile === 'function');
      if (folderId && canTrash) {
        await Drive.trashFile(folderId, /* hard= */ false); // мягко, в корзину
      }
    } catch (e) {
      console.warn('Drive trash failed', e);
    }

    toast('Клиент удалён');
  } catch (e) {
    console.warn('deleteClientFromDialog', e);
    toast('Ошибка удаления клиента');
  } finally {
    $('#clientDialog').close();
  }
}

// ---------- Marketing ----------

/**
 * Аггрегированный рендер по дням:
 * - для каждой даты берём ПОСЛЕДНЕЕ значение подписчиков за день (по времени),
 * - суммируем расходы за день,
 * - прирост считаем как (подписчики_сегодня - подписчики_вчера),
 * - внизу показываем итоги: последние общие подписчики и сумму расходов за все дни.
 */
function renderMarketing() {
  const body = document.getElementById('mkHistoryBody');
  if (!body) return;

  // 1) Источник данных
  const items = Array.isArray(AppState.marketing) ? [...AppState.marketing] : [];
  items.sort((a,b) => (String(a.date||'')+String(a.time||''))
    .localeCompare(String(b.date||'')+String(b.time||'')));

  const firstByDay = mkBuildDailyFirstContactsStats(AppState.clients || []);

  // 2) Агрегации
  let totalFollowers = 0;   // итог подписчиков (кумулятив IG дельт)
  let prevSpentTotal = 0;   // для вычисления расхода дня
  let totalSpent = 0;       // итог затрат
  let sumCold = 0;          // итог холодных по всем дням и всем языкам
  let sumOther = 0;         // итог не-холодных по всем дням и всем языкам
// НОВОЕ: суммы по каждому языку (cold/other)
const langSums = {
  ru: { c:0, o:0 },
  sk: { c:0, o:0 },
  en: { c:0, o:0 },
  at: { c:0, o:0 },
  de: { c:0, o:0 }
};
const daysCount = items.length; // кол-во строк (дней) в таблице

  // 3) Рендер строк
  const rows = items.map(e => {
    totalFollowers += Number(e.delta || 0);

    const daySpent = Number(e.spentTotal || 0) - prevSpentTotal;
    prevSpentTotal = Number(e.spentTotal || 0);
    totalSpent = prevSpentTotal;

    const rec = firstByDay.get(e.date) || {
      langs: { ru:{c:0,o:0}, sk:{c:0,o:0}, en:{c:0,o:0}, at:{c:0,o:0}, de:{c:0,o:0} }
    };
    const L = rec.langs;

    // суммируем по языкам для итогов
    const dayCold  = L.ru.c + L.sk.c + L.en.c + L.at.c + L.de.c;
    const dayOther = L.ru.o + L.sk.o + L.en.o + L.at.o + L.de.o;
    sumCold  += dayCold;
    sumOther += dayOther;
// НОВОЕ: копим по языкам
langSums.ru.c += L.ru.c; langSums.ru.o += L.ru.o;
langSums.sk.c += L.sk.c; langSums.sk.o += L.sk.o;
langSums.en.c += L.en.c; langSums.en.o += L.en.o;
langSums.at.c += L.at.c; langSums.at.o += L.at.o;
langSums.de.c += L.de.c; langSums.de.o += L.de.o;

    // ячейка языка: C (синяя цифра) | Σ (серая плашка) | N (зелёная цифра)
    const langCell = (o) => `
      <span class="mk-langcell" title="C / Σ / N">
        <span class="mk-txt mk-cold-txt mk-mono">${o.c}</span>
        <span class="mk-pill mk-total mk-mono">${o.c + o.o}</span>
        <span class="mk-txt mk-warm-txt mk-mono">${o.o}</span>
      </span>
    `;

    return `
  <tr>
    <td>${formatDateHuman(e.date) || '—'}</td>
    <td class="mk-mono">+${Number(e.delta || 0)}</td>
    <td class="mk-mono">€${(isFinite(daySpent) ? daySpent : 0).toFixed(2)}</td>
        <td>${langCell(L.ru)}</td>
        <td>${langCell(L.sk)}</td>
        <td>${langCell(L.en)}</td>
        <td>${langCell(L.at)}</td>
        <td>${langCell(L.de)}</td>
      </tr>
    `;
  });

  body.innerHTML = rows.length
    ? rows.join('')
    : `<tr><td colspan="8">Пока нет данных</td></tr>`;

  // 4) Итоги по столбцам — в <tfoot><tr id="mkTotalsRow">
const foot = document.getElementById('mkTotalsRow');
if (foot) {
  const cellLang = (o) => `
    <span class="mk-langcell" title="C / Σ / N">
      <span class="mk-txt mk-cold-txt mk-mono">${o.c}</span>
      <span class="mk-pill mk-total mk-mono">${o.c + o.o}</span>
      <span class="mk-txt mk-warm-txt mk-mono">${o.o}</span>
    </span>
  `;

  // формат "N евро" (без знака € и без .00, если целое)
  const euroWords = (v) => {
    const n = Number(v) || 0;
    const s = n.toFixed(2);
    const trimmed = s.endsWith('.00') ? s.slice(0, -3) : s;
    return `${trimmed}\u00A0евро`;
  };

  foot.innerHTML = `
    <td class="mk-mono">${daysCount}\u00A0дн.</td>
    <td class="mk-mono">${totalFollowers}\u00A0чел.</td>
    <td class="mk-mono">${euroWords(totalSpent)}</td>
    <td>${cellLang(langSums.ru)}</td>
    <td>${cellLang(langSums.sk)}</td>
    <td>${cellLang(langSums.en)}</td>
    <td>${cellLang(langSums.at)}</td>
    <td>${cellLang(langSums.de)}</td>
  `;
}


  // (опционально) обновление карточки про Instagram
  const igBox = document.getElementById('mk-instagram-followers');
  if (igBox) igBox.textContent = `${totalFollowers} новых подписчиков`;
}

// === helper: нормализован ли клиент как «в работе» ===
// Учитываем тех, у кого есть КОНСУЛЬТАЦИЯ / ПРЕДОПЛАТА / ЭСКИЗ / СЕАНС (или массив sessions)
function isQualifiedClient(c) {
  const raw = (c?.status ?? c?.stage ?? c?.type ?? '').toString().toLowerCase();
  const st = (typeof normalizeStatus === 'function') ? normalizeStatus(raw) : raw;

  const hasDeposit  = Number(c?.deposit || 0) > 0;
  const hasSessions = Array.isArray(c?.sessions) && c.sessions.length > 0;

  // Статусы «в работе» (покрываем варианты пайплайна)
  const WORK_STATES = new Set([
    'consult', 'consult_booked', 'consult_confirmed', 'consult_done',
    'deposit', 'design', 'sketch', 'sketch_done',
    'session', 'session_booked', 'session_confirmed', 'session_done'
  ]);

  const inWorkByStatus =
    !!st &&
    (
      WORK_STATES.has(st) ||
      st.includes('consult') || st.includes('конс') ||
      st.includes('deposit') || st.includes('депозит') ||
      st.includes('sketch')  || st.includes('эскиз') ||
      st.startsWith('session') || st.includes('сеанс')
    );

  return hasDeposit || hasSessions || inWorkByStatus;
}

// === helper: получить YYYY-MM-DD из даты/строки ===
function ymdOf(dt) {
  if (!dt) return '';
  const s = String(dt);
  const ymd = s.split('T')[0];
  return ymd || s;
}

// === Totals & Potential (с учётом «клиентов-в работе») ===
// (ниже уже идёт твоя функция mkCalcTotalsAndPotential(...) — она эти хелперы использует)

// --- Helpers for "status as of first contact date" ---

// End-of-day UTC ms for YYYY-MM-DD
function mkEodMs(ymd) {
  if (!ymd) return NaN;
  return Date.parse(`${ymd}T23:59:59.999Z`);
}


/* ===== SUMMARY: helpers ===== */

// берём последнее "общая сумма на рекламу (spentTotal)" из истории маркетинга
function mkGetLatestAdsSpentTotal(marketingArr){
  const arr = Array.isArray(marketingArr) ? marketingArr.slice() : [];
  arr.sort((a,b)=> (String(a.date||'')+String(a.time||'')).localeCompare(String(b.date||'')+String(b.time||'')));
  return Number(arr.length ? (arr[arr.length-1].spentTotal||0) : 0);
}

// KPI агрегаты (подписки, заработано, потенциал)
function mkCalcKPI(clients = [], marketing = [], totalsMaybe = null){
  // 1) подписки: суммируем delta
  const subs = (marketing||[]).reduce((s,m)=> s + Number(m?.delta||0), 0);

  // 2) заработано: депозиты + суммы завершённых сеансов
  let earned = 0;
  for (const c of (clients||[])){
    earned += Number(c?.deposit||0);
    const sessions = Array.isArray(c?.sessions) ? c.sessions : [];
    for (const s of sessions){
      if (s?.done) earned += Number(s?.price||0);
    }
  }

  // 3) потенциал: берём из уже рассчитанных итогов, если пришли; иначе сами считаем:
  //   - незавершённые сеансы (цена) + диапазон озвученной суммы (мин/макс)
  let pot = 0;
  for (const c of (clients||[])){
    const sessions = Array.isArray(c?.sessions) ? c.sessions : [];
    for (const s of sessions){
      if (!s?.done) pot += Number(s?.price||0);
    }
    // если нет сеансов, учитываем озвученный диапазон (берём максимум реалистично)
    if (!sessions.length){
      const mn = Number(c?.amountMin ?? NaN);
      const mx = Number(c?.amountMax ?? NaN);
      if (!Number.isNaN(mx)) pot += mx;
      else if (!Number.isNaN(mn)) pot += mn;
    }
  }

  // округление по деньгам
  const euro = n => '€' + (Number(n)||0).toFixed(0);

  return {
    subs,
    earnedRaw: earned,
    potentialRaw: pot,
    earned: euro(earned),
    potential: euro(pot),
    adsSpent: euro(mkGetLatestAdsSpentTotal(marketing))
  };
}

/* ===== SUMMARY: UI fill ===== */
function mkRenderKPI(kpi){
  // защитимся, если карточка ещё не в DOM
  const byId = id => document.getElementById(id);
  if (!byId('mk-subs-count')) return;

  byId('mk-subs-count').textContent = (kpi?.subs||0);
  byId('mk-earned').textContent     = (kpi?.earned||'€0');
  byId('mk-potential').textContent  = (kpi?.potential||'€0');

  // подпишем дату отчёта «сегодня»
  try{
    const d = new Date();
    const dd = d.toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric'});
    byId('mk-summary-date').textContent = `Отчёт на ${dd}`;
  }catch(_){}
}

/* ===== SUMMARY: charts (Chart.js) ===== */

function mkRenderSummary(clients = [], marketing = []){
  const elLeads = document.getElementById('mk-chart-leads');
  const elCosts = document.getElementById('mk-chart-costs');
  if (!elLeads || !elCosts || typeof Chart !== 'function') return;

  // ---- 1) LEADS donut: распределение статусов
  const counts = {
    cold: 0, consult: 0, deposit: 0, session: 0, other: 0
  };
  (clients||[]).forEach(c=>{
    const raw = String(c?.status || c?.stage || c?.type || '').toLowerCase();
    const s = (typeof normalizeStatus === 'function') ? normalizeStatus(raw) : raw;
    if (s.includes('cold') || s.includes('холод')) counts.cold++;
    else if (s.includes('consult') || s.includes('конс')) counts.consult++;
    else if (s.includes('deposit') || s.includes('предоплат') || s.includes('эскиз')) counts.deposit++;
    else if (s.startsWith('session') || s.includes('сеанс')) counts.session++;
    else counts.other++;
  });

  const donutCfg = {
    type: 'doughnut',
    data: {
      labels: ['Холодные','Консультации','Предоплата/эскиз','Сеансы','Прочие'],
      datasets: [{
        data: [counts.cold,counts.consult,counts.deposit,counts.session,counts.other],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom' }
      },
      cutout: '65%'
    }
  };

  if (MK_SUMMARY_LEADS) MK_SUMMARY_LEADS.destroy();
  MK_SUMMARY_LEADS = new Chart(elLeads.getContext('2d'), donutCfg);

  
}

/* ====== Ручные расходы (SK/AT) + диаграммы Summary ====== */
let MK_SUMMARY_LEADS = null;
let MK_SUMMARY_COSTS = null;
let MK_SUMMARY_COUNTRIES = null;

function summaryDocRef(){
  return FB.db.collection('TattooCRM').doc('app').collection('summary').doc('costsManual');
}

function mkBindCostsForm(){
  const sk = document.getElementById('mkCostSk');
  const at = document.getElementById('mkCostAt');
  const save = document.getElementById('mkCostSave');
  const total = document.getElementById('mkCostTotal');
  if (!sk || !at || !save || !total) return;

  const updTotal = () => {
    const vsk = Number(sk.value || 0);
    const vat = Number(at.value || 0);
    total.textContent = `Всего: €${(vsk + vat).toFixed(0)}`;
  };
  if (!sk.dataset.bound){ sk.dataset.bound = '1'; sk.addEventListener('input', updTotal); }
  if (!at.dataset.bound){ at.dataset.bound = '1'; at.addEventListener('input', updTotal); }
  if (!save.dataset.bound){
    save.dataset.bound = '1';
    save.addEventListener('click', async ()=>{
      const vsk = Number(sk.value || 0);
      const vat = Number(at.value || 0);
      AppState.manualCosts = { sk: vsk, at: vat };
      try{
        await summaryDocRef().set({ sk: vsk, at: vat, updatedAt: new Date().toISOString() }, { merge: true });
        toast('Расходы сохранены');
      }catch(e){ console.warn(e); toast('Не удалось сохранить расходы'); }
      mkRenderCostsChartManual(); // перерисуем диаграмму
    });
  }
}

function listenManualCostsRealtime(){
  try{
    summaryDocRef().onSnapshot(snap=>{
      const d = snap.exists ? snap.data() : { sk:0, at:0 };
      AppState.manualCosts = { sk: Number(d.sk||0), at: Number(d.at||0) };
      const sk = document.getElementById('mkCostSk');
      const at = document.getElementById('mkCostAt');
      if (sk && at){
        sk.value = AppState.manualCosts.sk || 0;
        at.value = AppState.manualCosts.at || 0;
        const total = document.getElementById('mkCostTotal');
        if (total) total.textContent = `Всего: €${(AppState.manualCosts.sk + AppState.manualCosts.at).toFixed(0)}`;
      }
      mkRenderCostsChartManual();
    });
  }catch(e){ console.warn('listenManualCostsRealtime', e); }
}

// 1) Обращения (без изменений, но уничтожаем старый инстанс)
function mkRenderLeadsDonut(clients){
  const el = document.getElementById('mk-chart-leads');
  if (!el || typeof Chart!=='function') return;

  const leads = {
    cold: (clients||[]).filter(c => /холод/i.test(String(c?.status||''))).length,
    lead: (clients||[]).filter(c => /^лид$/i.test(String(c?.status||''))).length,
    consult: (clients||[]).filter(c => /консул/i.test(String(c?.status||''))).length,
    session: (clients||[]).filter(c => Array.isArray(c?.sessions) && c.sessions.some(s=>s?.done)).length
  };

  if (MK_SUMMARY_LEADS) MK_SUMMARY_LEADS.destroy();
  MK_SUMMARY_LEADS = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Холодные','Лиды','Консультации','Сеансы'],
      datasets: [{ data:[leads.cold, leads.lead, leads.consult, leads.session],
        backgroundColor:['#186663','#8C7361','#A6B5B4','#D2AF94'] }]
    },
    options:{ plugins:{ legend:{ position:'bottom' } }, cutout:'65%' }
  });
}

// 2) Расходы (ручные SK/AT → Всего = сумма)
function mkRenderCostsChartManual(){
  const el = document.getElementById('mk-chart-costs');
  if (!el || typeof Chart!=='function') return;
  const sk = Number(AppState.manualCosts?.sk || 0);
  const at = Number(AppState.manualCosts?.at || 0);
  const total = sk + at;

  if (MK_SUMMARY_COSTS) MK_SUMMARY_COSTS.destroy();
  MK_SUMMARY_COSTS = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Всего','Словакия','Австрия'],
      datasets: [{ data:[total, sk, at], backgroundColor:['#002D37','#186663','#D2AF94'] }]
    },
    options:{ plugins:{ legend:{ position:'bottom' } }, cutout:'65%' }
  });
}

// 3) По странам (суммарно из «детальной статистики по дням»)
function mkRenderCountriesChart(clients){
  const el = document.getElementById('mk-chart-countries');
  if (!el || typeof Chart!=='function') return;

  // строим карту по дням/языкам и суммируем
  const map = (typeof mkBuildDailyFirstContactsStats === 'function')
    ? mkBuildDailyFirstContactsStats(clients || [])
    : new Map();

  const totals = { ru:0, sk:0, en:0, at:0, de:0 };
  map.forEach(rec=>{
    for (const k in totals){
      const o = rec?.langs?.[k] || { c:0, o:0 };
      totals[k] += (o.c + o.o);
    }
  });

  const labels = ['Русский','Словакия','Английский','Австрия','Немецкий'];
  const data   = [totals.ru, totals.sk, totals.en, totals.at, totals.de];

  if (MK_SUMMARY_COUNTRIES) MK_SUMMARY_COUNTRIES.destroy();
  MK_SUMMARY_COUNTRIES = new Chart(el.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets:[{ label:'Обращения', data }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } }
    }
  });
}



// Determine if a status is "cold"
function mkIsColdStatus(st) {
  let s = (typeof normalizeStatus === 'function')
    ? normalizeStatus(st)
    : String(st || '').toLowerCase().trim();
  return s === 'cold' || s === 'холодный' || s === 'cold lead';
}

// Get client's status at (<=) the end of given date (YYYY-MM-DD) using statusLogs.
// Fallback to client's current status if no logs before that moment.
function mkGetStatusOnDate(client, ymd) {
  const target = mkEodMs(ymd);
  const logs = Array.isArray(client?.statusLogs) ? client.statusLogs.slice() : [];

  // Normalize + sort logs by time ascending
  logs.sort((a, b) => {
    const ta = Date.parse(a?.at || a?.date || a?.ts || a?.time || '');
    const tb = Date.parse(b?.at || b?.date || b?.ts || b?.time || '');
    return (isFinite(ta) ? ta : 0) - (isFinite(tb) ? tb : 0);
  });

  let picked = null;
  for (const L of logs) {
    const t = Date.parse(L?.at || L?.date || L?.ts || L?.time || '');
    if (!isFinite(t)) continue;
    if (t <= target) picked = L; else break; // логи дальше этой даты нам не нужны
  }

  // Если нашли лог на/до даты — берём его статус, иначе — текущий статус клиента
  return (picked?.status ?? picked?.value ?? picked?.stage ?? picked?.type ?? client?.status ?? client?.stage ?? '');
}

// Построить статистику первых обращений по дням с разрезом: холодные (C) и остальные (N)
// и по языкам RU/SK/EN/AT/DE (в коде: ru, sk, en, at, de).
// Build stats of first contacts by day & language using the STATUS AS OF that date
function mkBuildDailyFirstContactsStats(clients) {
  const map = new Map(); // ymd -> { langs: {ru:{c,o}, sk:{c,o}, en:{c,o}, at:{c,o}, de:{c,o}} }

  const ensure = (ymd) => {
    if (!map.has(ymd)) {
      map.set(ymd, {
        langs: {
          ru: { c:0, o:0 },
          sk: { c:0, o:0 },
          en: { c:0, o:0 },
          at: { c:0, o:0 },
          de: { c:0, o:0 },
        }
      });
    }
    return map.get(ymd);
  };

  const list = Array.isArray(clients) ? clients : [];
  for (const c of list) {
    // 1) дата первого обращения
   // поддерживаем канон firstcontactdate + легаси firstContactDate
let ymd = String(c?.firstcontactdate || c?.firstContactDate || '').slice(0, 10);
if ((!ymd || ymd.length !== 10) && typeof ymdOf === 'function') {
  ymd = ymdOf(c?.firstcontactdate || c?.firstContactDate);
}
    if (!ymd) continue;

    // 2) язык/страна (только наши 5 кодов)
    const lang = String(c?.lang || '').trim().toLowerCase();
    if (!['ru','sk','en','at','de'].includes(lang)) continue;

    // 3) статус на ЭТУ дату (по логам статусов); если логов нет — текущий
    const statusAtDay = mkGetStatusOnDate(c, ymd);
    const isCold = mkIsColdStatus(statusAtDay);

    // 4) учёт
    const rec = ensure(ymd);
    if (isCold) rec.langs[lang].c++;
    else        rec.langs[lang].o++;
  }

  return map;
}

// --- [MK#7] Получить список месяцев, в которых есть первые обращения (YYYY-MM)
function mkListMonthsFromClients(clients){
  const set = new Set();
  (Array.isArray(clients)?clients:[]).forEach(c=>{
    const ymd = String(c?.firstcontactdate || c?.firstContactDate || '').slice(0,10);
    if (ymd && ymd.length===10) set.add(ymd.slice(0,7)); // YYYY-MM
  });
  return Array.from(set).sort(); // по возрастанию
}

// --- [MK#7] Форматировать YYYY-MM в «Сентябрь 2025»
function mkMonthHuman(ym){
  const [y, m] = ym.split('-').map(Number);
  const months = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  if (!y || !m) return ym;
  const name = months[m-1] || ym;
  // с заглавной буквы + год
  return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + y;
}

// --- [MK#7] Данные для графика по дням и языкам
// mode: 'all' | 'cold' | 'warm'
function mkPrepareLeadsSeriesByMonth(clients, ym='YYYY-MM', mode='all'){
  // строим карту по дням с разрезом по языкам: { ru:{c,o}, sk:{c,o}, ... }
  const daily = mkBuildDailyFirstContactsStats(clients); // Map<YYYY-MM-DD, { langs: {ru:{c,o} ...} }>

  // количество дней в месяце
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  // инициализация: по каждому языку массив из daysInMonth нулей
  const langs = ['ru','sk','en','at','de'];
  const byLang = {};
  langs.forEach(k => byLang[k] = Array.from({length: daysInMonth}, ()=>0));

  for (let d=1; d<=daysInMonth; d++){
    const ymd = `${ym}-${String(d).padStart(2,'0')}`;
    const rec = daily.get(ymd);
    if (!rec) continue;
    for (const k of langs){
      const o = rec.langs[k] || { c:0, o:0 };
      const val = (mode==='cold') ? o.c : (mode==='warm') ? o.o : (o.c + o.o);
      byLang[k][d-1] = val;
    }
  }

  return {
    labels: Array.from({length: daysInMonth}, (_,i)=> String(i+1)), // "1".."30"
    series: byLang
  };
}

// --- [MK#7] Данные IG (+подписчики за день) по месяцу YYYY-MM
function mkPrepareIgSeriesByMonth(marketing = [], ym = 'YYYY-MM') {
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const data = Array.from({ length: daysInMonth }, () => 0);

  for (const rec of (marketing || [])) {
    const d = String(rec?.date || '');
    if (!d.startsWith(ym + '-')) continue;
    const day = Number(d.slice(8, 10)) || 0;
    const delta = Number(rec?.delta || 0); // поле delta мы и так сохраняем в маркетинге
    if (day >= 1 && day <= daysInMonth) data[day - 1] += delta;
  }
  return data;
}


// --- [MK#7] Chart instance cache
let MK_CHART = null;
// --- [MK#7] Данные для IG (+подписчики в день) по месяцу
function mkPrepareIgSeriesByMonth(marketing = [], ym = 'YYYY-MM') {
  // определяем длину месяца
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const data = Array.from({ length: daysInMonth }, () => 0);

  marketing.forEach(rec => {
    const d = String(rec?.date || '');
    if (!d.startsWith(ym + '-')) return;
    const day = Number(d.slice(8, 10)) || 0;
    const delta = Number(rec?.delta || 0);
    if (day >= 1 && day <= daysInMonth) data[day - 1] += delta;
  });

  return data;
}



// --- [MK#7] Нарисовать/обновить график
function mkRenderLeadsChart(){
  const canvas = document.getElementById('mkLeadsChart');
  if (!canvas) return;

  const monthSel = document.getElementById('mkChartMonth');
  const mode = (document.querySelector('input[name="mkChartMode"]:checked')?.value) || 'all';
  const ym = monthSel?.value || (mkListMonthsFromClients(AppState.clients).slice(-1)[0] || '');

 const { labels, series } = mkPrepareLeadsSeriesByMonth(AppState.clients || [], ym, mode);

const datasets = [
  { key:'ru', label:'Русский',  data: series.ru, borderColor:'#186663', backgroundColor:'#186663' },
  { key:'sk', label:'Словацкий', data: series.sk, borderColor:'#A6B5B4', backgroundColor:'#A6B5B4' },
  { key:'en', label:'Английский', data: series.en, borderColor:'#8C7361', backgroundColor:'#8C7361' },
  { key:'at', label:'Австрия',  data: series.at, borderColor:'#D2AF94', backgroundColor:'#D2AF94' },
  { key:'de', label:'Немецкий', data: series.de, borderColor:'#002D37', backgroundColor:'#002D37' },
].map((d)=>({
  label: d.label,
  data: d.data,
  tension: 0.2,
  pointRadius: 2,
  borderWidth: 2
}));

// NEW: если включён тумблер IG — добавляем дневной прирост подписчиков как столбики
const igOn = document.getElementById('mkChartIG')?.checked;
if (igOn) {
  const igData = mkPrepareIgSeriesByMonth(AppState.marketing || [], ym);
  datasets.push({
    label: 'IG (+подписчики)',
    data: igData,
    type: 'bar',
    yAxisID: 'y',
    borderWidth: 1,
    pointRadius: 0,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.8)'
  });
}

  const cfg = {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
     plugins: {
  legend: { display: true, position: 'bottom' },
  title:  { display: true, text: mkMonthHuman(ym) }
},
scales: {
  x: {
    title:{ display:true, text:'Дни' },
    ticks:{ autoSkip:false, maxRotation:70, minRotation:50 },
    grid: {  color: 'rgba(255,255,255,0.3)' }   // ← сетка по оси X белая
  },
  y: {
    title:{ display:true, text:'Количество лидов' },
    beginAtZero:true,
    ticks:{ precision:0 },
    grid: {  color: 'rgba(255,255,255,0.3)'}   // ← сетка по оси Y белая
  }
}  
  }
  };

  if (MK_CHART) { MK_CHART.destroy(); }
  MK_CHART = new Chart(canvas.getContext('2d'), cfg);
}

// --- [MK#7] Заполнить селект месяцев и навесить обработчики
function mkBindLeadsChartControls(){
  const sel = document.getElementById('mkChartMonth');
  if (!sel) return;

  // Заполняем список месяцев по клиентам
  const months = mkListMonthsFromClients(AppState.clients || []);
  sel.innerHTML = months.length
    ? months.map(ym => `<option value="${ym}">${mkMonthHuman(ym)}</option>`).join('')
    : `<option value="">—</option>`;

  // Выставим последний месяц по умолчанию
  if (months.length) sel.value = months[months.length - 1];

  // Обработчики
  if (!sel.dataset.bound){
    sel.dataset.bound = '1';
    sel.addEventListener('change', mkRenderLeadsChart);
    document.querySelectorAll('input[name="mkChartMode"]').forEach(r=>{
      r.addEventListener('change', mkRenderLeadsChart);
    });
  }

// NEW: тумблер IG (+подписчики/день)
const ig = document.getElementById('mkChartIG');
if (ig && !ig.dataset.bound) {
  ig.dataset.bound = '1';
  ig.addEventListener('change', mkRenderLeadsChart);
}

// --- чекбоксы стран ---
  const countriesBox = document.getElementById('mkChartCountries');
  if (countriesBox && !countriesBox.dataset.bound) {
    countriesBox.addEventListener('change', (e) => {
      if (e.target && e.target.matches('input[type="checkbox"]')) {
        mkRenderLeadsChart(); // перерисовываем график при переключении стран
      }
    });
    countriesBox.dataset.bound = '1';
  }
}



// === [NEW] Totals & Potential (карточка №5) ===============================

// Сумма всех подписок (суммируем delta по маркетингу)
function mkGetTotalSubscribers(marketingArr){
  return (Array.isArray(marketingArr) ? marketingArr : [])
    .reduce((s, m) => s + (Number(m?.delta || 0)), 0);
}

// Стоимость: за подписчика и за «не холодного» лида
function mkCalcCostsForTotals(clientsArr, marketingArr, adsSpent){
  const followers = mkGetTotalSubscribers(marketingArr);

  const nonCold = (Array.isArray(clientsArr) ? clientsArr : []).reduce((n, c) => {
    const st = (typeof normalizeStatus === 'function')
      ? normalizeStatus(c?.status || c?.stage || c?.type)
      : String(c?.status || c?.stage || c?.type || '').toLowerCase();
    return n + (st !== 'cold' ? 1 : 0); // все статусы, кроме «cold»
  }, 0);

  return {
    perSubscriber: followers > 0 ? adsSpent / followers : 0,
    perLeadNonCold: nonCold  > 0 ? adsSpent / nonCold  : 0
  };
}



// === helper: нормализован ли клиент как «в работе» ===
// Учитываем тех, у кого есть КОНСУЛЬТАЦИЯ / ПРЕДОПЛАТА / ЭСКИЗ / СЕАНС (или массив sessions)
function isQualifiedClient(c) {
  const st = typeof normalizeStatus === 'function'
    ? normalizeStatus(c?.status || c?.stage || c?.type)
    : String(c?.status || c?.stage || c?.type || '').toLowerCase();

  const hasDeposit = Number(c?.deposit || 0) > 0;
  const hasSessions = Array.isArray(c?.sessions) && c.sessions.length > 0;

  // Статусы «в работе» (покрываем варианты пайплайна)
  const WORK_STATES = new Set([
    'consult', 'consult_booked', 'consult_confirmed', 'consult_done',
    'deposit', 'design', 'sketch', 'sketch_done',
    'session', 'session_booked', 'session_confirmed', 'session_done'
  ]);

  const inWorkByStatus =
    !!st &&
    (WORK_STATES.has(st) ||
     st.includes('consult') || st.includes('конс') ||
     st.includes('deposit') || st.includes('депозит') ||
     st.includes('sketch')  || st.includes('эскиз') ||
     st.startsWith('session') || st.includes('сеанс'));

  return hasDeposit || hasSessions || inWorkByStatus;
}

// === helper: получить YYYY-MM-DD из даты/строки ===
function ymdOf(dt) {
  if (!dt) return '';
  const s = String(dt);
  const ymd = s.split('T')[0];
  return ymd || s;
}

// === Totals & Potential (с учётом «клиентов-в работе») ===
function mkCalcTotalsAndPotential(clients, marketingArr, cutoffYmd) {
  const clientsArr = Array.isArray(clients) ? clients : [];
  const cutoff = cutoffYmd ? String(cutoffYmd) : '';

  // 1) Реклама — последнее spentTotal
  const adsSpent = mkGetLatestAdsSpentTotal(marketingArr);

  // 2) Предоплаты (просто сумма и количество)
  let depCount = 0, depSum = 0;
  for (const c of clientsArr) {
    const v = Number(c?.deposit || 0);
    if (v > 0) { depCount++; depSum += v; }
  }

  // 3) Сеансы (проведённые — всегда; запланированные — только до cutoff включ.)
  let doneCount = 0, doneSum = 0;
  let planCount = 0, planSum = 0;

  for (const c of clientsArr) {
    const sessions = Array.isArray(c?.sessions) ? c.sessions : [];
    for (const s of sessions) {
      const obj = (typeof s === 'object') ? s : { dt: s, price: 0, done: false };
      const ymd = ymdOf(obj.dt);
      const price = Number(obj.price || 0);

      if (obj.done) {
        doneCount++; 
        doneSum += price;
      } else {
        if (!cutoff || (ymd && ymd <= cutoff)) {
          planCount++; 
          planSum += price;
        }
      }
    }
  }

  // 4) Потенциал: ТОЛЬКО клиенты с назначенным сеансом (не done) и с озвученной вилкой от-до
let potMin = 0, potMax = 0;

for (const c of clientsArr) {
  // есть ли НЕпроведённые сеансы с датой?
  const sessions = Array.isArray(c?.sessions) ? c.sessions : [];
  const plannedYmds = sessions
    .filter(s => {
      const obj = (typeof s === 'object') ? s : { dt: s, price: 0, done: false };
      if (obj.done) return false;
      const ymd = ymdOf(obj.dt);
      return !!ymd; // только с датой
    })
    .map(s => ymdOf(typeof s === 'object' ? s.dt : s))
    .filter(Boolean)
    .sort();

  if (!plannedYmds.length) continue; // нет назначенных сеансов ⇒ не считаем

  // уважаем "до даты", если указана
  if (cutoff && plannedYmds[0] > cutoff) continue;

  // вилка от-до (или amount как точка)
  let aMin = c?.amountMin, aMax = c?.amountMax;
  if (aMin == null && aMax == null && c?.amount != null) {
    const n = Number(c.amount);
    if (!isNaN(n)) { aMin = n; aMax = n; }
  }

  // без вилки/суммы — пропускаем (ничего «реально считать»)
  if (aMin == null && aMax == null) continue;

  let minNum = Number(aMin || 0);
  let maxNum = Number(aMax || 0);

  // Вычитаем депозит и уже ПРОВЕДЁННЫЕ сеансы до cutoff — чтобы видеть остаток «реально ожидаемых» денег
  const dep = Number(c?.deposit || 0);
  let doneSumClient = 0;
  for (const s of sessions) {
    const obj = (typeof s === 'object') ? s : { dt: s, price: 0, done: false };
    if (!obj.done) continue;
    const ymd = ymdOf(obj.dt);
    if (!cutoff || (ymd && ymd <= cutoff)) {
      doneSumClient += Number(obj.price || 0);
    }
  }

  minNum = Math.max(0, minNum - dep - doneSumClient);
  maxNum = Math.max(0, maxNum - dep - doneSumClient);

  potMin += minNum;
  potMax += maxNum;
}

  const costs = mkCalcCostsForTotals(clientsArr, marketingArr, adsSpent);

// --- [NEW] общие суммы «мне» и «в студию» по всем клиентам ---
const sumMe     = (Array.isArray(clientsArr) ? clientsArr : []).reduce((s, c) => s + Number(c?.amountMe || 0), 0);
const sumStudio = (Array.isArray(clientsArr) ? clientsArr : []).reduce((s, c) => s + Number(c?.amountStudio || 0), 0);

// --- [NEW] процентное соотношение (текст) ---
const totalAll = sumMe + sumStudio;
const ratioText = totalAll > 0
  ? `${(sumMe / totalAll * 100).toFixed(1)}% / ${(sumStudio / totalAll * 100).toFixed(1)}%`
  : '—';

return {
  adsSpent,
  deposits: { count: depCount, sum: depSum },
  sessionsDone: { count: doneCount, sum: doneSum },
  sessionsPlanned: { count: planCount, sum: planSum },
  potential: { min: potMin, max: potMax },
  costs,
  // --- [NEW] блок со сводными суммами и процентами
  amounts: { me: sumMe, studio: sumStudio, ratioText }
};
}

// === [NEW] Карточка №8: Студийная аналитика ===============================

// «Это студийный источник?» — true, если source == "Студия" (без учета регистра и пробелов)
function _isStudioSource(src) {
  return String(src || '').trim().toLowerCase() === 'студия';
}

// Суммируем по группе клиентов: суммы мне / студии + текстовое соотношение
function _mkSumMeStudio(list) {
  const me = (Array.isArray(list) ? list : []).reduce((s, c) => s + Number(c?.amountMe || 0), 0);
  const studio = (Array.isArray(list) ? list : []).reduce((s, c) => s + Number(c?.amountStudio || 0), 0);
  const total = me + studio;
  const ratioText = total > 0
    ? `${(me / total * 100).toFixed(1)}% / ${(studio / total * 100).toFixed(1)}%`
    : '—';
  return { me, studio, ratioText };
}

// Главный расчёт: разбиваем клиентов на «мои» и «студийные» по полю source
function mkCalcStudioSplit(clients) {
  const arr = Array.isArray(clients) ? clients : [];
  const myClients = arr.filter(c => !_isStudioSource(c?.source)); // все КРОМЕ «Студия»
  const stClients = arr.filter(c =>  _isStudioSource(c?.source)); // только «Студия»

  const my = _mkSumMeStudio(myClients);
  const st = _mkSumMeStudio(stClients);

  // Баланс: что я заплатил студии (из Мои.клиенты → amountStudio) минус что студия заплатила мне (из Студийные.клиенты → amountMe)
  const balance = my.studio - st.me; // >0 значит я «в минусе» к студии; <0 — студия «в минусе» ко мне

  return { my, st, balance };
}

// Рендер в карточку №8 (см. id'шники в index.html)
function mkRenderCardStudioSplit(data) {
  if (!data) return;
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
const eur = n => `€${Number(n || 0).toFixed(2)}`;

  // Мои клиенты
set('mk8-my-amount-me',     eur(data.my.me));
set('mk8-my-amount-studio', eur(data.my.studio));
set('mk8-my-ratio',         data.my.ratioText);

// Студийные клиенты
set('mk8-st-amount-me',     eur(data.st.me));
set('mk8-st-amount-studio', eur(data.st.studio));
set('mk8-st-ratio',         data.st.ratioText);

// Баланс
set('mk8-studio-balance',   eur(data.balance));
}


// === [NEW] Финансы (карточка №6) ===============================

// Берём последнее total по рекламе
function mkGetLatestAdsSpentTotal(marketingArr) {
  const arr = Array.isArray(marketingArr) ? [...marketingArr] : [];
  arr.sort((a,b) => (String(a.date||'')+String(a.time||'')).localeCompare(String(b.date||'')+String(b.time||'')));
  const last = arr[arr.length - 1];
  return Number(last?.spentTotal || 0);
}

// Медиана/квантили
function _quantiles(nums) {
  const a = nums.slice().sort((x,y)=>x-y);
  const q = (p) => {
    if (!a.length) return 0;
    const idx = (a.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return (a[lo] + a[hi]) / 2;
  };
  return { p25: q(0.25), med: q(0.5), p75: q(0.75) };
}

// Главный расчёт
function mkCalcFinanceMetrics(clients, marketingArr, suppliesArr, cutoffYmd, useSupplies = false) {
  const list = Array.isArray(clients) ? clients : [];
  const cutoff = cutoffYmd ? String(cutoffYmd) : '';
  // период = календарный месяц cutoff-даты
  const co = cutoff ? new Date(cutoff) : new Date();
  const ymStart = new Date(co.getFullYear(), co.getMonth(), 1);
  const ymEnd   = new Date(co.getFullYear(), co.getMonth()+1, 0);
  const startYMD = ymdOf(ymStart.toISOString());
  const endYMD   = ymdOf(ymEnd.toISOString());

  const adsSpent = mkGetLatestAdsSpentTotal(marketingArr); // реклама «на сегодня»

  let depositsSum = 0;
  let sessionsSum = 0;
  let sessionsCnt = 0;
  const sessionPrices = [];

  // клиенты
  const payingClientIds = new Set();
  const newPayingClientIds = new Set();
  const repeatClientIds = new Set();
  let canceledClients = 0;

  for (const c of list) {
    // депозиты учитываем как часть gross, если они в карточке клиента (без даты — берём как есть)
    depositsSum += Number(c?.deposit || 0) || 0;

    // сеансы
    const sessions = Array.isArray(c?.sessions) ? c.sessions : [];
    const doneBeforePeriod = sessions.some(s => {
      const dt = ymdOf(typeof s === 'string' ? s : s?.dt);
      return (typeof s === 'object' && s.done) && dt && dt < startYMD;
    });

    let hadInPeriod = false;

    for (const s of sessions) {
      const dt = ymdOf(typeof s === 'string' ? s : s?.dt);
      const price = Number(typeof s === 'object' ? (s.price || 0) : 0);
      const isDone = (typeof s === 'object' && !!s.done);

      if (!dt) continue;

      // суммируем деньги только за сеансы текущего месяца
      if (dt >= startYMD && dt <= endYMD && isDone) {
        sessionsSum += price;
        sessionsCnt += 1;
        sessionPrices.push(price);
        hadInPeriod = true;
      }
    }

    // уникальные платящие за период
    if (hadInPeriod) {
      payingClientIds.add(c.id);
      if (doneBeforePeriod) repeatClientIds.add(c.id);
      else newPayingClientIds.add(c.id);
    }

    // отмены — грубо по текущему статусу клиента (оценка)
    const st = normalizeStatus(c?.status || c?.stage || c?.type);
    if (st === 'canceled') canceledClients += 1;
  }

  const gross = depositsSum + sessionsSum;

  // расходники: сейчас модели цены/списания нет → считаем 0, пока не появятся поля.
  // Хук на будущее: если появится suppliesArr[i].cost или списания — суммируй здесь.
  const suppliesCost = useSupplies ? 0 : 0;

  const net = Math.max(0, gross - adsSpent - suppliesCost);

  // средние/медианы по «сеансам» (без депозитов)
  const avgCheck    = sessionsCnt ? (sessionsSum / sessionsCnt) : 0;
  const avgNetCheck = sessionsCnt ? ((sessionsSum - adsSpent - suppliesCost) / sessionsCnt) : 0;
  const { p25, med, p75 } = _quantiles(sessionPrices);

  // реклама
  const roi = adsSpent > 0 ? (gross / adsSpent) : 0; // выручка на 1 €
  const profitPerEuro = adsSpent > 0 ? ((gross - adsSpent - suppliesCost) / adsSpent) : 0;

  // стоимость нового клиента (только «новые платящие» в текущем месяце)
  const costPerClient = newPayingClientIds.size > 0
    ? (adsSpent / newPayingClientIds.size)
    : 0;

  // отмены как доля среди «сеанс состоялся» + «отменил» (оценка)
  const denomForCancel = sessionsCnt + canceledClients;
  const cancelPct = denomForCancel > 0 ? Math.round((canceledClients / denomForCancel) * 100) : 0;

  // возвраты
  const uniqueCount = payingClientIds.size;
  const repeatPct = uniqueCount > 0 ? Math.round((repeatClientIds.size / uniqueCount) * 100) : 0;

  return {
    period: { startYMD, endYMD },
    gross, sessionsSum, net,
    avgCheck, avgNetCheck,
    medianCheck: med, p25, p75,
    ads: { spent: adsSpent, roi, profitPerEuro, costPerClient },
    clients: { uniqueCount, repeatPct, cancelPct }
  };
}

function mkRenderCardFinance(data) {
  const list = document.getElementById('mk-finance-list');
  if (!list || !data) return;

  list.innerHTML = `
    <li><b>Выручка (gross)</b> — сеансы + депозиты: <b>€${data.gross.toFixed(2)}</b></li>
    <li>Деньги с проведённых сеансов за период: €${data.sessionsSum.toFixed(2)}</li>
    <li><b>Чистая выручка (net)</b> ${data.ads.spent>0?'(минус реклама'+(document.getElementById('mkIncludeSupplies')?.checked?', расходники':'')+')':''}: <b>€${data.net.toFixed(2)}</b></li>
    <li>Средний чек: €${data.avgCheck.toFixed(2)}</li>
    <li>Средний «чистый» чек: €${data.avgNetCheck.toFixed(2)}</li>
    <li>Медианный чек: €${data.medianCheck.toFixed(2)} (P25–P75: €${data.p25.toFixed(2)}–€${data.p75.toFixed(2)})</li>

    <li class="mk-sub">Эффективность рекламы</li>
    <li>Выручка на 1 € рекламы: €${data.ads.roi.toFixed(2)}</li>
    <li>Прибыль на 1 € рекламы: €${data.ads.profitPerEuro.toFixed(2)}</li>
    <li>Стоимость нового клиента с рекламы: €${data.ads.costPerClient.toFixed(2)}</li>

    <li class="mk-sub">Клиенты</li>
    <li>Уникальные платящие: ${data.clients.uniqueCount}</li>
    <li>% возвратов / повторных: ${data.clients.repeatPct}%</li>
    <li>Доля отмен: ${data.clients.cancelPct}%</li>
  `;
}

function mkRenderCardTotals(totals) {
  if (!totals) return;
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  set('mk-ads-spent',        `€${totals.adsSpent.toFixed(2)}`);
  set('mk-deposits',         `${totals.deposits.count} шт. €${totals.deposits.sum.toFixed(2)}`);
  set('mk-sessions-done',    `${totals.sessionsDone.count} шт. €${totals.sessionsDone.sum.toFixed(2)}`);
  set('mk-sessions-planned', `${totals.sessionsPlanned.count} шт. €${totals.sessionsPlanned.sum.toFixed(2)}`);

  // Новые строки:
  const cps = totals?.costs?.perSubscriber  || 0;
  const cpl = totals?.costs?.perLeadNonCold || 0;
  set('mk-cost-per-sub',  cps > 0 ? `€${cps.toFixed(2)}` : '—');
  set('mk-cost-per-lead', cpl > 0 ? `€${cpl.toFixed(2)}` : '—');
set('mk-total-amount-me',     `€${Number(totals.amounts?.me || 0).toFixed(2)}`);
set('mk-total-amount-studio', `€${Number(totals.amounts?.studio || 0).toFixed(2)}`);
set('mk-total-amount-ratio', totals.amounts?.ratioText || '—');

  set('mk-potential-range', `€${totals.potential.min.toFixed(2)} — €${totals.potential.max.toFixed(2)}`);
}// ===== Карточка №6: Финансы =====
function mkUpdateFinanceCard() {
  const cutoff = document.getElementById('mkPotentialUntil')?.value || '';
  const useSup = !!document.getElementById('mkIncludeSupplies')?.checked;

  const data = mkCalcFinanceMetrics(
    AppState.clients || MK_CLIENTS_CACHE,
    AppState.marketing,
    AppState.supplies,
    cutoff,
    useSup
  );
  mkRenderCardFinance(data);
}


/** Сохранение записи маркетинга из формы */
async function saveMarketingEntry(){
  const date = $('#mkDate').value || ymdLocal(new Date());
  const time = $('#mkTime').value || new Date().toISOString().slice(11,16);

  const delta = Number($('#mkDelta').value || 0);          // +подписчики
  const spentTotal = Number($('#mkSpentTotal').value || 0); // общий расход к дате
setMkNowDefaults();

  const id = `mk_${date}_${time.replace(':','')}`;
  const entry = { id, date, time, delta, spentTotal };

  // локально
  AppState.marketing = AppState.marketing || [];
  const i = AppState.marketing.findIndex(x=>x.id===id);
  if (i>=0) AppState.marketing[i] = entry; else AppState.marketing.push(entry);

  renderMarketing();

  // Firestore
  try {
    const ref = FB.db.collection('TattooCRM').doc('app').collection('marketing').doc(id);
    await ref.set(entry, { merge:true });
    toast('Запись сохранена');
    $('#mkDelta').value = '';
    $('#mkSpentTotal').value = '';
  } catch(e) {
    console.warn(e);
    toast('Ошибка сохранения маркетинга');
  }
}
function setMkNowDefaults(){
  const now = new Date();
  const dEl = document.getElementById('mkDate');
  const tEl = document.getElementById('mkTime');
const cut = document.getElementById('mkPotentialUntil');
if (cut && !cut.value) cut.value = ymdLocal(new Date());
  if (dEl && !dEl.value) dEl.value = ymdLocal(now);                  // YYYY-MM-DD локально
  if (tEl && !tEl.value) tEl.value = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`; // HH:MM
}


/** Привязка клика к кнопке Сохранить (однократно) */
function bindMarketing(){
  const btn = document.getElementById('saveMkBtn');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', saveMarketingEntry);
  }
  setMkNowDefaults(); // ← автозаполнить дату/время при открытии формы
}


/** Реалтайм-подписка на коллекцию marketing */
function listenMarketingRealtime(){
  FB.db.collection('TattooCRM').doc('app').collection('marketing')
    .orderBy('date','asc')   // сортировка по дате
    .onSnapshot(qs => {
      const arr = [];
      qs.forEach(d => arr.push(d.data()));
      // локально сортируем по дате+времени, чтобы не требовать составного индекса
      arr.sort((a,b) => (String(a.date||'')+String(a.time||'')).localeCompare(String(b.date||'')+String(b.time||'')));
      AppState.marketing = arr;
 // Карточка №5: обновляем итоги и потенциал при новых данных маркетинга
      const untilInput = document.getElementById('mkPotentialUntil');
      if (untilInput) {
        const totals = mkCalcTotalsAndPotential(AppState.clients || MK_CLIENTS_CACHE, AppState.marketing, untilInput.value);
        mkRenderCardTotals(totals);
      }

      renderMarketing();
if (document.querySelector('[data-tab="marketingPage"]').classList.contains('is-active')) {
  mkBindLeadsChartControls();
  mkRenderLeadsChart();
}

 if (typeof mkUpdateFinanceCard === 'function') mkUpdateFinanceCard();

    }, err => console.error('marketing', err));
}



// ---------- Supplies ----------
function renderSupplies(){
  const list = $('#suppliesList');
  if (!list) return;
  list.innerHTML = '';

  const items = Array.isArray(AppState.supplies) ? AppState.supplies : [];

  // Заполняем фильтр категорий 1 раз
  const catSel = $('#supFilter');
  if (catSel && !catSel.dataset.filled) {
    (AppState.settings?.supplies || []).forEach(c=>{
      const o = document.createElement('option'); o.value = c; o.textContent = c;
      catSel.appendChild(o);
    });
    catSel.dataset.filled = '1';
    catSel.onchange = renderSupplies;
  }

  const catFilter = catSel?.value || '';
  const arr = catFilter ? items.filter(i => (i.cat||'') === catFilter) : items;

  if (!arr.length) {
    list.innerHTML = `<div class="row card-client glass">Список пуст</div>`;
    return; // ← теперь этот return снова внутри функции
  }

  arr.forEach(s=>{
    const card = document.createElement('div');
    card.className='card-client glass';
    const left = (typeof s.left === 'number') ? s.left : (s.qty ?? '');
    const meta = [s.cat||'', s.brand||'', s.kind||'', s.size?`⌀${s.size}`:'', s.unit||'']
      .filter(Boolean).join(' · ');
    card.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div><b>${s.name}</b> · <span class="meta">${meta}</span></div>
        <div class="badge">${left}</div>
      </div>
      <div class="row" style="justify-content:flex-end; gap:8px">
        ${s.link ? `<a class="btn ghost" href="${s.link}" target="_blank">Заказать</a>` : ''}
        <button class="btn" data-edit>Открыть</button>
      </div>
    `;
    card.querySelector('[data-edit]').addEventListener('click', ()=> openSupplyDialog(s));
    list.appendChild(card);
  });
}

// ---------- Settings ----------
function bindSettings(){
  $('#saveSettingsBtn').addEventListener('click', saveSettings);
  $('#logoutBtn').addEventListener('click', ()=>{
    FB.auth.signOut();
    toast('Вы вышли из аккаунта');
    location.reload();
});

} // ← закрыли bindSettings()
 function fillSettingsForm(){
  const s = AppState.settings || demoSettings();
  $('#setSources').value  = (s.sources||[]).join(', ');
  $('#setStyles').value   = (s.styles||[]).join(', ');
  $('#setZones').value    = (s.zones||[]).join(', ');
  $('#setSupplies').value = (s.supplies||[]).join(', ');
  $('#setDefaultReminder').value = s.defaultReminder || '';
$('#setReminderTemplates').value = (s.reminderTemplates||[]).join(', ');
$('#setReminderDelays').value = (s.reminderDelays||[]).join(', ');
$('#setSuppliesDict').value = JSON.stringify(s.suppliesDict || {}, null, 2);
renderSuppliesDictEditor(s.suppliesDict || {});
bindSuppliesDictToggle();
 $('#setSyncInterval').value = s.syncInterval ?? 60;

  const sel = $('#filterSource');
  const have = Array.from(sel.options).map(o=>o.value);
  (s.sources||[]).forEach(src=>{
    if (!have.includes(src)) {
      const o = document.createElement('option'); o.textContent = src;
      sel.appendChild(o);
    }
  });
}




// ---------- Utils ----------

// ---------- Google Identity Services token manager ----------
// ВАЖНО: замени CLIENT_ID на свой из Firebase Console:
// Firebase Console → Authentication → Sign-in method → Google → Web SDK configuration (или GCP → Credentials)

const GOOGLE_CLIENT_ID = '306275735842-9iebq4vtv2pv9t6isia237os0r1u3eoi.apps.googleusercontent.com';

const OAUTH_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar openid email profile';
let gisTokenClient = null;
let driveAccessToken = null;
let driveTokenExpTs = 0; // ms timestamp

function initGISTokenClient() {
  if (gisTokenClient) return;
  gisTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: OAUTH_SCOPES,
    // callback заполнится динамически в ensureDriveAccessToken()
    callback: () => {}
  });
}

/**
 * Получить access_token для Drive бесшумно.
 * - Если токен жив — возвращаем его.
 * - Если протух — запрашиваем новый с prompt: '' (без UI).
 * - Если прав ещё не было — можно вызвать с forceConsent=true в момент первого входа.
 */
function ensureDriveAccessToken({ forceConsent = false } = {}) {
  return new Promise((resolve, reject) => {
    const needsRefresh = !driveAccessToken || Date.now() > (driveTokenExpTs - 60_000);
    if (!needsRefresh) return resolve(driveAccessToken);

    initGISTokenClient();

    gisTokenClient.callback = (resp) => {
      if (resp && resp.access_token) {
        driveAccessToken = resp.access_token;
        // expires_in обычно ~3600 с; поставим запас -60 с
      const sec = Number(resp.expires_in || 3600);
driveTokenExpTs = Date.now() + (sec - 60) * 1000;

gapi.client.setToken({ access_token: driveAccessToken });
saveAccessToken(driveAccessToken, sec);
return resolve(driveAccessToken);
      }
      reject(new Error('No access_token from GIS'));
    };

    try {
      // Если forceConsent=true (первый логин) — покажет одноразовое согласие;
      // иначе попробует тихо обновить без UI.
      gisTokenClient.requestAccessToken({
        prompt: forceConsent ? 'consent' : ''
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function initDriveStack({ forceConsent = false } = {}) {
  try{
    // 3) GIS
    await waitFor(() => window.google && google.accounts && google.accounts.oauth2);
    try { BOOT.set(3,'ok'); } catch(_) {}

    // 4) gapi client
await waitFor(() => window.gapi);
await Drive.loadGapi();
try { BOOT.set(4,'ok'); } catch(_) {}

// 4.5) access token — сначала из кэша, иначе с таймаутом
const cachedTok = (typeof getSavedAccessToken === 'function') && getSavedAccessToken();
if (cachedTok) {
  driveAccessToken = cachedTok;
  gapi.client.setToken({ access_token: driveAccessToken });
} else {
  await withTimeout(ensureDriveAccessToken({ forceConsent }), 8000, 'gis_token_timeout');
}

// 5) Drive library (папки)
try {
  await Drive.ensureLibrary();
driveReady = true;
  const __ds = document.querySelector('#driveStatus'); if (__ds) __ds.textContent = 'Drive: онлайн';
  try { BOOT.set(5,'ok'); } catch(_) {}
  // фоновое обновление токена (не ждём)
  ensureDriveAccessToken({ forceConsent: false }).catch(console.warn);
} catch (e) {
  console.warn('Drive library skipped', e);
  try { BOOT.set(5,'err','Drive отложен'); } catch(_) {}
}


    
    // автообновление токена
    if (!window.__driveAutoRefresh) {


      window.__driveAutoRefresh = setInterval(() => {
        ensureDriveAccessToken().catch(console.warn);
      }, 45 * 60 * 1000);
    }
  }catch(e){
    console.warn('initDriveStack', e);
    try { BOOT.set(3,'err', e.message || 'Ошибка инициализации Drive'); } catch(_) {}
    throw e;
  }
}


// Храним Google Drive access_token локально (на один час примерно)
function saveAccessToken(token, ttlSeconds = 3600) {
  try {
    const data = {
      token,
      exp: Date.now() + ttlSeconds * 1000
    };
    localStorage.setItem('gAccessToken', JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

function getSavedAccessToken() {
  try {
    const raw = localStorage.getItem('gAccessToken');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.token || !data?.exp) return null;
    if (Date.now() > data.exp) return null; // протух
    return data.token;
  } catch (e) {
    return null;
  }
}

// --- Trusted device (моментальный старт) ---
const TRUST_KEY = 'tcrm_device';

function setDeviceTrusted(user) {
  try {
    localStorage.setItem(TRUST_KEY, JSON.stringify({
      uid: user?.uid || null,
      ts: Date.now()
    }));
  } catch(_) {}
}

function isDeviceTrusted(maxAgeDays = 14) {
  try {
    const raw = localStorage.getItem(TRUST_KEY);
    if (!raw) return false;
    const { uid, ts } = JSON.parse(raw);
    if (!ts) return false;
    return (Date.now() - ts) < maxAgeDays * 24 * 60 * 60 * 1000;
  } catch(_) { return false; }
}

function touchDeviceTrust(){
  try {
    const raw = localStorage.getItem(TRUST_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    obj.ts = Date.now();
    localStorage.setItem(TRUST_KEY, JSON.stringify(obj));
  } catch(_) {}
}


function splitTags(s){
  return (s||'').split(',').map(x=>x.trim()).filter(Boolean);
}

// ---------- Demo ----------
function demoSettings(){
  return {
    sources:["Instagram","TikTok","VK","Google","Сарафан"],
    styles:["Реализм","Ч/Б","Цвет","Олдскул"],
    zones:["Рука","Нога","Спина"],
    supplies:["Краски","Иглы","Химия","Уход"],
    suppliesDict:{
      "Иглы": { "units": "шт", "kinds": ["RL","RS","RM","CM"], "sizes": [3,5,7,9,11,13] },
      "Краски": { "units": "мл", "brands": ["Eternal","WorldFamous"], "sizes": [30,60,120] },
      "Химия": { "units": "мл" },
      "Уход": { "units": "шт" }
    },
    defaultReminder:"Через 14 дней — Спросить про заживление",
    syncInterval:60,
    language:"ru",
    reminderTemplates:["Спросить про заживление","Попросить отзыв","Отправить инструкцию по уходу"],
    reminderDelays:[14,30,180],
  };
}
function demoClients(){
  return [
    {id:'cl_ivan', displayName:'Иван Петров', phone:'+421...', link:'instagram.com/ivan', source:'Instagram',
     first:true, type:'Перекрытие', styles:['реализм','ч/б'], zones:['предплечье'], status:'Сеанс', qual:'Целевой',
     deposit:50, amount:450, notes:'перекрыть надпись', updatedAt: new Date().toISOString()},
    {id:'cl_ana', displayName:'Анастасия Смирнова', phone:'+421...', link:'vk.com/ana', source:'VK',
     first:false, type:'Новая', styles:['минимализм'], zones:['кисть'], status:'Консультация', qual:'Целевой',
     deposit:0, amount:0, notes:'', updatedAt: new Date().toISOString()}
  ];
}
function demoReminders(){ return []; }


// === Marketing overview: statuses + deposits split ============================

// Заголовки по порядку вывода для КАРТОЧКИ #1
const MK_STATUS_LABELS = {
   total:       'Всего клиентов',
  cold:        'Холодные лиды',
  lead:        'Лиды',
  consultation:'Консультации',
  prepay:      'Предоплата/эскиз',
  session:     'Сеансы',
  canceled:    'Отменил',
 dropped:     'Слился'
};

// Подписи для языка/страны и пола
const LANG_LABELS = {
  ru: 'Русский',
  en: 'Английский',
  sk: 'Словацкий',
  de: 'Немецкий',
  at: 'Австрия',
  '':  '—'
};
const GENDER_LABELS = {
  male:   'Мужчины',
  female: 'Женщины',
  '':     'Не указан'
};

// --- SuperFilter State ---
const MK_FILTERS = {
  status: new Set(),   // значения normalizeStatus: cold/lead/consultation/prepay/session/canceled/dropped
  lang:   new Set(),   // ru/en/sk/de/at/...
  gender: new Set(),   // male/female/''
  qual:   new Set(),   // target/semi/nontarget (нормализуем внутри)
};
let MK_CLIENTS_CACHE = [];



function normalizeStatus(raw) {
  const s = (raw || '').toString().trim().toLowerCase();
  if (!s) return '';

  if (s === 'lead' || s.startsWith('лид')) return 'lead';
  if (s.includes('холод')) return 'cold';

  if (s.includes('конс')) return 'consultation'; // "запись на конс.", "конс. подтверждена", "консультация"
  if (s.includes('предоплат') || s.includes('эскиз') || s.includes('скетч')) return 'prepay';

  if (s.includes('сеанс') || s.includes('session')) return 'session';

  if (s.includes('отмен')) return 'canceled';

  if (s.includes('слил') || s.includes('пропал') || s.includes('no show') || s.includes('ghost')) return 'dropped';

  return '';
}

// Сбор депозитов из разных схем (массив/поле)
function extractDepositsFromClient(c) {
  let count = 0, sum = 0;
  if (Array.isArray(c?.deposits)) {
    count += c.deposits.length;
    for (const d of c.deposits) sum += Number(d?.amount) || 0;
  }
  if (c?.depositAmount) {
    count += 1;
    sum += Number(c.depositAmount) || 0;
  }
  if (c?.deposit?.amount) {
    count += 1;
    sum += Number(c.deposit.amount) || 0;
  }
  return { count, sum };
}

// --- "Как в Excel": считаем ДОСТИЖЕНИЯ статусов (to == ...), если клиент когда-либо был лидом ---
function mkBuildReachedConversion(clients, logsMap) {
  const TARGETS = ['consultation', 'prepay', 'session', 'canceled', 'dropped'];
  const counts = { consultation:0, prepay:0, session:0, canceled:0, dropped:0 };
  let denom = 0;

  const norm = (x) => normalizeStatus(x);

  for (const c of (clients || [])) {
    const logs = logsMap.get(c.id) || [];

    // был ли когда-то лидом (по логам или текущее состояние)
    const wasLead = logs.some(r => norm(r?.to) === 'lead' || norm(r?.from) === 'lead')
               || norm(c?.status) === 'lead';
    if (!wasLead) continue;

    denom++;

    // клиент может попасть в несколько корзин — как в Excel
    for (const t of TARGETS) {
      const hit = logs.some(r => norm(r?.to) === t);
      if (hit) counts[t] += 1;
    }
  }

  const pct = (n) => denom > 0 ? Math.round((n / denom) * 100) : 0;

  return {
    denom,
    consultation: { n: counts.consultation, p: pct(counts.consultation) },
    prepay:       { n: counts.prepay,       p: pct(counts.prepay)       },
    session:      { n: counts.session,      p: pct(counts.session)      },
    canceled:     { n: counts.canceled,     p: pct(counts.canceled)     },
    dropped:      { n: counts.dropped,      p: pct(counts.dropped)      }
  };
}

function normalizeQual(qRaw='') {
  const q = String(qRaw).toLowerCase();
  if (q.includes('целевой') && !q.includes('условно')) return 'target';
  if (q.includes('условно')) return 'semi';
  if (q.includes('не цел') || q.includes('нецел')) return 'nontarget';
  return ''; // неизвестно
}


// Главный расчёт
function mkBuildOverviewFromClients(clients) {
  const counts = { total: clients.length, cold: 0, lead: 0, consultation: 0, prepay: 0, session: 0, canceled: 0, dropped: 0 };

  let depCount = 0, depSum = 0;

  for (const c of clients) {
    const st = normalizeStatus(c?.status || c?.stage || c?.type);
    if (st && counts.hasOwnProperty(st)) counts[st]++;

    const d = extractDepositsFromClient(c);
    depCount += d.count;
    depSum   += d.sum;
  }
  return { counts, depCount, depSum };
}

// Демография/профиль по клиентам (берём всех, если указан тип)
function mkBuildDemographicsFromClients(clients) {
  const pool = Array.isArray(clients) ? clients : [];

  // Языки/страны
  const langCounts = {};
  for (const c of pool) {
    const key = (c?.lang || '').trim().toLowerCase();
    langCounts[key] = (langCounts[key] || 0) + 1;
  }

  // Пол
  const genderCounts = { male: 0, female: 0, '': 0 };
  for (const c of pool) {
    const g = (c?.gender || '').trim().toLowerCase();
    if (g === 'male') genderCounts.male++;
    else if (g === 'female') genderCounts.female++;
    else genderCounts['']++;
  }

  // Квалификация (только 3 категории)
  const qualCounts = { target: 0, semi: 0, nontarget: 0 };
  for (const c of pool) {
    const q = (c?.qual || '').toLowerCase();
    if (q.includes('целевой') && !q.includes('условно')) qualCounts.target++;
    else if (q.includes('условно')) qualCounts.semi++;
    else if (q.includes('не цел') || q.includes('нецел')) qualCounts.nontarget++;
  }

  return { langCounts, genderCounts, qualCounts };
}

function mkRenderCardDemographics({ langCounts = {}, genderCounts = {}, qualCounts = {} }) {
  // Язык/страна
  const langEl = document.getElementById('mk-demo-lang');
  if (langEl) {
    const entries = Object.entries(langCounts)
      .sort((a,b) => b[1] - a[1]); // по убыванию количества
    langEl.innerHTML = entries.length
      ? entries.map(([code, n]) => {
          const label = LANG_LABELS.hasOwnProperty(code) ? LANG_LABELS[code] : (code || '—');
          return `<li class="mk-row"><span class="label">${label}</span><span class="value">${n}</span></li>`;
        }).join('')
      : `<li class="mk-row"><span class="label">—</span><span class="value">0</span></li>`;
  }

  // Пол
  const gEl = document.getElementById('mk-demo-gender');
  if (gEl) {
    const order = ['male','female',''];
    gEl.innerHTML = order.map(key => {
      const label = GENDER_LABELS[key] || key;
      const val = genderCounts[key] || 0;
      return `<li class="mk-row"><span class="label">${label}</span><span class="value">${val}</span></li>`;
    }).join('');
  }

  // Квалификация
  const qEl = document.getElementById('mk-demo-qual');
  if (qEl) {
    const rows = [
      ['target',    'Целевой'],
      ['semi',      'Условно-целевой'],
      ['nontarget', 'Не целевой']
    ];
    qEl.innerHTML = rows.map(([k, label]) => {
      const val = qualCounts[k] || 0;
      return `<li class="mk-row"><span class="label">${label}</span><span class="value">${val}</span></li>`;
    }).join('');
  }
}


// Рендер КАРТОЧКИ #1 (только статусы)
function mkRenderCardStatuses(counts) {
  const list = document.getElementById('mk-status-list');
  if (!list) return;

  const order = ['total', 'cold', 'lead', 'consultation', 'prepay', 'session', 'canceled', 'dropped'];
  const html = order.map(key => {
    const label = MK_STATUS_LABELS[key] || key;
    const val = counts[key] ?? 0;

    if (key === 'total') {
      return `<li class="mk-row"><span class="label">${label}</span><span class="value">${val}</span></li>`;
    }

    // чекбокс для фильтра статусов
    const isChecked = MK_FILTERS.status.has(key) ? 'checked' : '';
    return `
      <li class="mk-row">
        <label class="mk-check">
          <span class="label">
            <input type="checkbox" class="mk-filter" data-mk-group="status" data-mk-value="${key}" ${isChecked}/>
            ${label}
          </span>
          <span class="value">${val}</span>
        </label>
      </li>`;
  }).join('');

  list.innerHTML = html;
}
// Рендер КАРТОЧКИ #2 (только депозиты)
function mkRenderCardDemographics({ langCounts = {}, genderCounts = {}, qualCounts = {} }) {
  // Язык/страна
  const langEl = document.getElementById('mk-demo-lang');
  if (langEl) {
    const entries = Object.entries(langCounts).sort((a,b) => b[1] - a[1]);
    langEl.innerHTML = entries.length
      ? entries.map(([code, n]) => {
          const label = LANG_LABELS.hasOwnProperty(code) ? LANG_LABELS[code] : (code || '—');
          const checked = MK_FILTERS.lang.has(code) ? 'checked' : '';
          return `<li class="mk-row">
            <label class="mk-check">
              <span class="label">
                <input type="checkbox" class="mk-filter" data-mk-group="lang" data-mk-value="${code}" ${checked}/>
                ${label}
              </span>
              <span class="value">${n}</span>
            </label>
          </li>`;
        }).join('')
      : `<li class="mk-row"><span class="label">—</span><span class="value">0</span></li>`;
  }

  // Пол
  const gEl = document.getElementById('mk-demo-gender');
  if (gEl) {
    const order = ['male','female',''];
    gEl.innerHTML = order.map(key => {
      const label = GENDER_LABELS[key] || key;
      const val = genderCounts[key] || 0;
      const checked = MK_FILTERS.gender.has(key) ? 'checked' : '';
      return `<li class="mk-row">
        <label class="mk-check">
          <span class="label">
            <input type="checkbox" class="mk-filter" data-mk-group="gender" data-mk-value="${key}" ${checked}/>
            ${label}
          </span>
          <span class="value">${val}</span>
        </label>
      </li>`;
    }).join('');
  }

  // Квалификация
  const qEl = document.getElementById('mk-demo-qual');
  if (qEl) {
    const rows = [
      ['target',    'Целевой'],
      ['semi',      'Условно целевой'],
      ['nontarget', 'Не целевой']
    ];
    qEl.innerHTML = rows.map(([k, label]) => {
      const val = qualCounts[k] || 0;
      const checked = MK_FILTERS.qual.has(k) ? 'checked' : '';
      return `<li class="mk-row">
        <label class="mk-check">
          <span class="label">
            <input type="checkbox" class="mk-filter" data-mk-group="qual" data-mk-value="${k}" ${checked}/>
            ${label}
          </span>
          <span class="value">${val}</span>
        </label>
      </li>`;
    }).join('');
  }
}


// Достаём клиентов (под разные варианты)
async function mkFetchClientsFallback() {
  if (window.AppState?.clients && Array.isArray(AppState.clients)) return AppState.clients;

  try {
    const db = firebase?.firestore?.();
    if (db) {
      const snap1 = await db.collection('TattooCRM').doc('app').collection('clients').get();
      if (!snap1.empty) return snap1.docs.map(d => ({ id: d.id, ...d.data() }));

      const snap2 = await db.collection('clients').get();
      if (!snap2.empty) return snap2.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (_) { /* noop */ }

  return [];
}

// --- Логи статусов по всем клиентам (через FB.db, с аккуратной сортировкой) ---
async function mkFetchStatusLogsForClients(clients) {
  const out = new Map(); // clientId -> [{ ts, from, to, _id }, ... asc]
  if (!Array.isArray(clients) || !clients.length) return out;

  for (const c of clients) {
    const id = c?.id;
    if (!id) continue;

    try {
      const snap = await FB.db
        .collection('TattooCRM').doc('app')
        .collection('clients').doc(id)
        .collection('statusLogs')
        .get();

      const arr = [];
      snap.forEach(d => {
        const row = d.data() || {};
        arr.push({
          ts: row.ts || '',
          from: row.from || '',
          to: row.to || '',
          _id: d.id || ''
        });
      });

      // сортируем по ts (если ISO), иначе по doc.id (у нас это Date.now())
      arr.sort((a, b) => {
        const ak = a.ts ? a.ts : String(a._id || '');
        const bk = b.ts ? b.ts : String(b._id || '');
        return ak.localeCompare(bk);
      });

      out.set(id, arr);
    } catch (e) {
      console.warn('[mkFetchStatusLogsForClients]', id, e?.message || e);
      out.set(id, []);
    }
  }
  return out;
}

// --- Конверсия "из лидов" в другие статусы по логам (по индексу после первого LEAD) ---
function mkBuildLeadConversionFromLogs(clients, logsMap) {
  const TARGETS = ['consultation', 'prepay', 'session', 'canceled', 'dropped'];

  // Возвращает индекс первой записи, где to == 'lead'. Если нет — null если текущий статус == lead, иначе -1.
  function findLeadIndex(sortedLogs, client) {
    const i = (sortedLogs || []).findIndex(row => normalizeStatus(row?.to) === 'lead');
    if (i >= 0) return i;
    const nowIsLead = normalizeStatus(client?.status || client?.stage || client?.type) === 'lead';
    return nowIsLead ? null : -1;
  }

  let denom = 0;
  const cnt = { consultation: 0, prepay: 0, session: 0, canceled: 0, dropped: 0 };

  for (const c of (clients || [])) {
    const logs = logsMap.get(c.id) || [];
    const iLead = findLeadIndex(logs, c);
    if (iLead === -1) continue;  // не был лидом вовсе
    denom++;

    for (const t of TARGETS) {
      // Если iLead === null (сейчас в лиде, но лога LEAD нет) — засчитываем любой зафиксированный переход в t.
      // Иначе — ищем переход в t СТРОГО ПОСЛЕ индекса iLead.
      const hit = logs.some((row, idx) => {
        const toNorm = normalizeStatus(row?.to);
        if (toNorm !== t) return false;
        return (iLead === null) ? true : (idx > iLead);
      });
      if (hit) cnt[t] += 1;
    }
  }

  const pct = (n) => denom > 0 ? Math.round((n / denom) * 100) : 0;

  return {
    denom,
    consultation: { n: cnt.consultation, p: pct(cnt.consultation) },
    prepay:       { n: cnt.prepay,       p: pct(cnt.prepay)       },
    session:      { n: cnt.session,      p: pct(cnt.session)      },
    canceled:     { n: cnt.canceled,     p: pct(cnt.canceled)     },
    dropped:      { n: cnt.dropped,      p: pct(cnt.dropped)      }
  };
}


async function syncClientToCalendar(prevClient, client) {
  // Если календарь не инициализирован — тихо выходим
  if (!window.TCRM_Calendar) return;

  // 1) получаем id календаря
  let calId = null;
  try {
    const token = await ensureDriveAccessToken({ forceConsent: false });
    if (!token) return;
    TCRM_Calendar.setAuthToken(token);
    calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');
  } catch (e) {
    console.warn('Calendar not ready', e);
    return;
  }

  // 2) консалт-событие
  if (client.consultDate) {
    try {
      const eid = await TCRM_Calendar.upsertConsultEvent(calId, client, { durationMinutes: 30 });
      if (eid && client.gcalConsultEventId !== eid) {
        client.gcalConsultEventId = eid;
      }
    } catch (e) { console.warn('consult upsert failed', e); }
  }

  // 3) сессии (upsert + удаление удаленных)
  const prevSessions = (prevClient?.sessions || []).map(s => ({ dt: s.dt, gcalEventId: s.gcalEventId }));
  const currSessions = (client.sessions || []);

  // upsert текущих
  for (const s of currSessions) {
    if (!s.dt) continue;
    try {
      const eid = await TCRM_Calendar.upsertSessionEvent(calId, client, s, { durationHours: 3 });
      if (eid && s.gcalEventId !== eid) s.gcalEventId = eid;
    } catch (e) { console.warn('session upsert failed', s, e); }
  }

// Если консультацию удалили — удалим её событие из календаря (если было)
if (!client.consultDate && prevClient?.gcalConsultEventId) {
  try {
    await TCRM_Calendar.deleteEvent(calId, prevClient.gcalConsultEventId);
    client.gcalConsultEventId = '';
  } catch (e) {
    console.warn('consult delete failed', e);
  }
}

  // удаление тех, что были и исчезли (сопоставляем по dt)
  const removed = prevSessions.filter(ps => !currSessions.some(cs => cs.dt === ps.dt));
  for (const r of removed) {
    if (r.gcalEventId) {
      try { await TCRM_Calendar.deleteEvent(calId, r.gcalEventId); }
      catch (e) { console.warn('session delete failed', e); }
    }
  }
}


// --- Рендер карточки конверсии (карточка №4) ---
function mkRenderCardConversion(conv) {
  // Может не быть карточки в DOM — просто выходим
  const box = document.getElementById('mk-card-conv');
  if (!box || !conv) return;

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  set('mk-conv-den', String(conv.denom));
  set('mk-conv-consult', `${conv.consultation.n} (${conv.consultation.p}%)`);
  set('mk-conv-prepay',   `${conv.prepay.n} (${conv.prepay.p}%)`);
  set('mk-conv-session',  `${conv.session.n} (${conv.session.p}%)`);
  set('mk-conv-canceled', `${conv.canceled.n} (${conv.canceled.p}%)`);
  set('mk-conv-dropped',  `${conv.dropped.n} (${conv.dropped.p}%)`);
}


function mkClientMatchesFilters(c) {
  // Если ни один фильтр не выбран — считаем, что совпадает любой
  const hasAny =
    MK_FILTERS.status.size || MK_FILTERS.lang.size ||
    MK_FILTERS.gender.size || MK_FILTERS.qual.size;

  if (!hasAny) return false;

  // Группа: STATUS
  if (MK_FILTERS.status.size) {
    const st = normalizeStatus(c?.status || c?.stage || c?.type);
    if (!MK_FILTERS.status.has(st)) return false;
  }

  // Группа: LANG
  if (MK_FILTERS.lang.size) {
    const lang = String(c?.lang || '').trim().toLowerCase();
    if (!MK_FILTERS.lang.has(lang)) return false;
  }

  // Группа: GENDER
  if (MK_FILTERS.gender.size) {
    const g = String(c?.gender || '').trim().toLowerCase();
    const key = (g === 'male' || g === 'female') ? g : '';
    if (!MK_FILTERS.gender.has(key)) return false;
  }

  // Группа: QUAL
  if (MK_FILTERS.qual.size) {
    const q = normalizeQual(c?.qual || '');
    if (!MK_FILTERS.qual.has(q)) return false;
  }

  return true;
}

function mkRenderResults(clients) {
  const list = document.getElementById('mk-filter-list');
  const cntEl = document.getElementById('mk-result-count');
  if (!list || !cntEl) return;

  const pool = clients.filter(mkClientMatchesFilters);
  cntEl.textContent = pool.length;

  // Выводим до 50 строк (чтобы не взрывать карточку)
  const rows = pool.slice(0, 50).map(c => {
    const name = c?.displayName || '(без имени)';
    const st = normalizeStatus(c?.status || c?.stage || c?.type);
    return `<li>
      <span class="left mk-link" data-open-client="${c.id || ''}">${name}</span>
      <span class="right">${MK_STATUS_LABELS[st] || ''}</span>
    </li>`;
  });

  list.innerHTML = rows.join('') || `<li><span class="left">—</span><span class="right">0</span></li>`;
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement)) return;
  if (!el.classList.contains('mk-filter')) return;

  const group = el.dataset.mkGroup;  // status | lang | gender | qual
  const value = el.dataset.mkValue;  // нормализованное значение

  if (!group) return;

  const set = MK_FILTERS[group];
  if (!set) return;

  if (el.checked) set.add(value);
  else set.delete(value);

  // Перерисовать результаты
  mkRenderResults(MK_CLIENTS_CACHE);
});

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-open-client]');
  if (!a) return;
  const id = a.getAttribute('data-open-client');
  if (!id) return;
  // если есть твоя функция openClientDialog(id) — вызови её:
  if (typeof openClientById === 'function') openClientById(id);;
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('#mk-filter-reset');
  if (!btn) return;
  mkResetFilters();
});

function mkResetFilters() {
  // очистить выбранные значения
  MK_FILTERS.status.clear();
  MK_FILTERS.lang.clear();
  MK_FILTERS.gender.clear();
  MK_FILTERS.qual.clear();

  // снять галочки в UI
  document.querySelectorAll('input.mk-filter[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });

  // перерисовать результаты
  mkRenderResults(MK_CLIENTS_CACHE);
}


// Одноразовая миграция всех существующих консультаций/сеансов/напоминаний в Google Calendar
async function migrateAllToGoogleCalendar() {
  try {
    const token = await ensureDriveAccessToken({ forceConsent: true });
    if (!token) { toast('Нет токена Google'); return; }
    TCRM_Calendar.setAuthToken(token);
    const calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');

    // 1) Клиенты — синк консультаций/сеансов
    const cs = await FB.db.collection('TattooCRM').doc('app').collection('clients').get();
    for (const doc of cs.docs) {
      const client = doc.data();
      await syncClientToCalendar(null, client);
      const patch = {};
      if (client.gcalConsultEventId) patch.gcalConsultEventId = client.gcalConsultEventId;
      if (Array.isArray(client.sessions)) patch.sessions = client.sessions;
      if (Object.keys(patch).length) await doc.ref.set(patch, { merge: true });
      await new Promise(r => setTimeout(r, 200)); // лёгкий троттлинг
    }

    // 2) Напоминания
    const rs = await FB.db.collection('TattooCRM').doc('app').collection('reminders').get();
    for (const d of rs.docs) {
      const rem = d.data();
      await syncReminderToCalendar(rem);
      await new Promise(r => setTimeout(r, 150));
    }

    toast('Миграция завершена');
  } catch (e) {
    console.error('migrateAllToGoogleCalendar', e);
    toast('Ошибка миграции (консоль)');
  }
}
window.tcrmMigrateToGoogleCalendar = migrateAllToGoogleCalendar;

// --- Одноразовая миграция всех данных в Google Calendar ---
async function migrateAllToGoogleCalendar() {
  try {
    // авторизация
    const token = await ensureDriveAccessToken({ forceConsent: true });
    if (!token) { toast && toast('Нет токена Google'); return; }

    TCRM_Calendar.setAuthToken(token);
    const calId = await TCRM_Calendar.ensureCalendarId('Tattoo CRM');

    // 1) Клиенты: консультации и сеансы
    const cs = await FB.db.collection('TattooCRM').doc('app').collection('clients').get();
    for (const doc of cs.docs) {
      const client = doc.data();
      try {
        await syncClientToCalendar(null, client);
        // запишем обновлённые gcal id обратно, если появились
        const patch = {};
        if (client.gcalConsultEventId) patch.gcalConsultEventId = client.gcalConsultEventId;
        if (Array.isArray(client.sessions)) patch.sessions = client.sessions;
        if (Object.keys(patch).length) await doc.ref.set(patch, { merge: true });
      } catch (e1) {
        console.warn('sync client fail', client?.id, e1);
      }
      await new Promise(r => setTimeout(r, 150)); // троттлинг
    }

    // 2) Напоминания
    const rs = await FB.db.collection('TattooCRM').doc('app').collection('reminders').get();
    for (const d of rs.docs) {
      const rem = d.data();
      try { await syncReminderToCalendar(rem); } 
      catch (e2) { console.warn('sync reminder fail', rem?.id, e2); }
      await new Promise(r => setTimeout(r, 120));
    }

    toast && toast('Миграция завершена');
    console.log('[migrate] done');
  } catch (e) {
    console.error('migrateAllToGoogleCalendar', e);
    toast && toast('Ошибка миграции (смотри консоль)');
  }
}

// вынесем в глобал, чтобы вызывать из консоли
window.tcrmMigrateToGoogleCalendar = migrateAllToGoogleCalendar;

function mkBuildClientLog(clientsArr) {
  const rows = [];

  (Array.isArray(clientsArr) ? clientsArr : []).forEach(c => {
    if (Array.isArray(c.sessions)) {
      c.sessions.forEach(s => {
        if (s.done) { // только проведённые
        rows.push({
  ymd: ymdOf(typeof s === 'object' ? s.dt : s), // ← подтверждённый сеанс: берём s.dt
  name: c.displayName || '(без имени)',
  me: Number(c.amountMe || 0),
  studio: Number(c.amountStudio || 0)
          });
        }
      });
    }
  });

  // сортируем по дате (новые сверху)
  rows.sort((a, b) => String(b.ymd || '').localeCompare(String(a.ymd || '')));
  return rows;
}

function mkRenderClientLog(rows) {
  const ul = $('#mk-client-log');
  if (!ul) return;

  ul.innerHTML = '';

  if (!rows.length) {
    ul.innerHTML = '<li class="mk-row"><span class="label">Нет данных</span></li>';
    return;
  }

  rows.forEach(r => {
    const dateStr = r.ymd ? formatDateHuman(r.ymd) : '—';
    const li = document.createElement('li');
    li.className = 'mk-row';
    li.innerHTML = `
      <span class="label">${dateStr} — ${r.name}</span>
      <span class="value">€${r.me} / €${r.studio}</span>
    `;
    ul.appendChild(li);
  });
}

const COSTS_LS_KEY = 'mkCostsManual_v1';

function summaryDocRef() {
  return FB?.db
    ?.collection('TattooCRM').doc('app')
    .collection('summary').doc('costsManual');
}

function applyManualCostsToUI() {
  const sk = document.getElementById('mkCostSk');
  const at = document.getElementById('mkCostAt');
  const total = document.getElementById('mkCostTotal');
  if (sk) sk.value = Number(AppState.manualCosts?.sk || 0);
  if (at) at.value = Number(AppState.manualCosts?.at || 0);
  if (total) {
    const v = (Number(sk?.value || 0) + Number(at?.value || 0));
    total.textContent = `Всего: €${v.toFixed(0)}`;
  }
}

async function mkSaveManualCosts(vsk, vat) {
  AppState.manualCosts = { sk: vsk, at: vat };
  // локально
  try { localStorage.setItem(COSTS_LS_KEY, JSON.stringify(AppState.manualCosts)); } catch (_){}
  // Firestore (если доступен)
  try {
    const ref = summaryDocRef();
    if (ref) await ref.set({ sk: vsk, at: vat, updatedAt: new Date().toISOString() }, { merge: true });
    toast('Расходы сохранены');
  } catch (e) {
    console.warn('save firestore', e);
    // оффлайн — тоже ок, остаёмся на локалке
    toast('Сохранено локально');
  }
}

function mkBindCostsForm() {
  const sk = document.getElementById('mkCostSk');
  const at = document.getElementById('mkCostAt');
  const save = document.getElementById('mkCostSave');
  if (!sk || !at || !save) return;

  const upd = () => applyManualCostsToUI();
  if (!sk.dataset.bound) { sk.dataset.bound = '1'; sk.addEventListener('input', upd); }
  if (!at.dataset.bound) { at.dataset.bound = '1'; at.addEventListener('input', upd); }
  if (!save.dataset.bound) {
    save.dataset.bound = '1';
    save.addEventListener('click', async () => {
      const vsk = Number(sk.value || 0);
      const vat = Number(at.value || 0);
      await mkSaveManualCosts(vsk, vat);
      mkRenderCostsChartManual();
    });
  }
}

function listenManualCostsRealtime() {
  // 1) сначала подхватываем локальные значения
  try {
    const raw = localStorage.getItem(COSTS_LS_KEY);
    if (raw) AppState.manualCosts = JSON.parse(raw);
  } catch (_){}
  applyManualCostsToUI();
  mkRenderCostsChartManual();

  // 2) затем подписываемся на Firestore (если доступен)
  try {
    const ref = summaryDocRef();
    if (!ref) return;
    ref.onSnapshot(snap => {
      const d = snap.exists ? snap.data() : { sk:0, at:0 };
      AppState.manualCosts = { sk: Number(d.sk||0), at: Number(d.at||0) };
      try { localStorage.setItem(COSTS_LS_KEY, JSON.stringify(AppState.manualCosts)); } catch (_){}
      applyManualCostsToUI();
      mkRenderCostsChartManual();
    });
  } catch (e) {
    console.warn('listenManualCostsRealtime', e);
  }
}


function mkRenderSummary(clients, marketing) {
  const elDate = document.getElementById('mk-summary-date');
  const euro = n => `€${(Number(n)||0).toFixed(2)}`;

  // ---- 0) Источник: журнал маркетинга (таблица ниже)
  const items = Array.isArray(marketing) ? marketing.slice() : [];
  items.sort((a,b)=> (String(a.date||'')+String(a.time||'')).localeCompare(String(b.date||'')+String(b.time||'')));

  // ---- 1) Шапка: "от <первая дата> — <сегодня> · N дней"
  const fmt = (ymd) => {
    if (!ymd) return '';
    const [y,m,d] = String(ymd).split('-').map(x=>parseInt(x,10));
    const dt = new Date(y, (m||1)-1, d||1);
    return dt.toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric'});
  };
  const firstYmd = items.length ? items[0].date : null;
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  let days = 0;
  if (firstYmd) {
    const d0 = new Date(firstYmd);
    const diff = Math.ceil((today.setHours(0,0,0,0) - d0.setHours(0,0,0,0)) / 86400000);
    days = Math.max(0, diff + 1); // инклюзивно
  }
  if (elDate) elDate.textContent = firstYmd
    ? `${fmt(firstYmd)} — ${fmt(todayYmd)} · ${days} ${days % 10 === 1 && days % 100 !== 11 ? 'день' : (days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20) ? 'дня' : 'дней')}`
    : `${fmt(todayYmd)} · 0 дней`;

  // ---- 2) KPI
  // Подписки: сумма IG-добавлений (delta) из журнала
  const subs = items.reduce((s, e) => s + Number(e.delta || 0), 0);

  // Заработано: все предоплаты + все проведённые сеансы
  let earned = 0;
  for (const c of (clients || [])) {
    earned += Number(c?.deposit || 0);
    const sessions = Array.isArray(c?.sessions) ? c.sessions : [];
    for (const s of sessions) {
      const obj = (typeof s === 'object') ? s : { price: Number(s)||0, done:false };
      if (obj.done) earned += Number(obj.price || 0);
    }
  }

  // Потенциал: из карточки №5 (максимум)
  let potential = 0;
  try {
    const until = document.getElementById('mkPotentialUntil')?.value || '';
    const totals = typeof mkCalcTotalsAndPotential === 'function'
      ? mkCalcTotalsAndPotential(clients, items, until)
      : null;
    potential = Number(totals?.potential?.max || 0);
  } catch(_){}

  // Проставляем KPI
  const byId = (id) => document.getElementById(id);
  byId('mk-subs-count') && (byId('mk-subs-count').textContent = subs);
  byId('mk-earned') && (byId('mk-earned').textContent = euro(earned));
  byId('mk-potential') && (byId('mk-potential').textContent = euro(potential));

  // ---- 3) Диаграмма «Обращения»
  const leads = {
    cold: (clients||[]).filter(c => /холод/i.test(String(c?.status||c?.stage||''))).length,
    lead: (clients||[]).filter(c => /^лид$/i.test(String(c?.status||''))).length,
    consult: (clients||[]).filter(c => /консул/i.test(String(c?.status||''))).length,
    session: (clients||[]).filter(c => Array.isArray(c?.sessions) && c.sessions.some(s => (typeof s==='object'? s.done : false))).length
  };
  new Chart(document.getElementById('mk-chart-leads'), {
    type: 'doughnut',
    data: {
      labels: ['Холодные', 'Лиды', 'Консультации', 'Сеансы'],
      datasets: [{
        data: [leads.cold, leads.lead, leads.consult, leads.session],
        backgroundColor: ['#186663','#8C7361','#A6B5B4','#D2AF94']
      }]
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout:'65%' }
  });

  // ---- 4) Диаграмма «Расходы» (Всего / Словакия / Австрия) из журнала
  const byCountry = (cc) => items
    .filter(m => (m.country||'').toLowerCase().startsWith(cc))
    .reduce((s,m)=> s + Number(m.amount || m.daySpent || 0), 0);

  // «Всего» для пончика берём сумму дневных/внесённых значений
  const totalSpent = items.reduce((s, m) => s + Number(m.amount || m.daySpent || 0), 0);
  const spentSk = byCountry('slovak');   // Slovakia
  const spentAt = byCountry('austr');    // Austria

  new Chart(document.getElementById('mk-chart-costs'), {
    type: 'doughnut',
    data: {
      labels: ['Всего', 'Словакия', 'Австрия'],
      datasets: [{
        data: [totalSpent, spentSk, spentAt],
        backgroundColor: ['#002D37','#186663','#D2AF94']
      }]
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout:'65%' }
  });
}

// Инициализация карточек
document.addEventListener('DOMContentLoaded', async () => {
  try {
    MK_CLIENTS_CACHE = await mkFetchClientsFallback();
mkBindCostsForm();
listenManualCostsRealtime();

// первый рендер карточки «Общий отчёт»
mkRenderLeadsDonut(AppState.clients || MK_CLIENTS_CACHE);
mkRenderCostsChartManual();
mkRenderCountriesChart(AppState.clients || MK_CLIENTS_CACHE);


    // Карточка №1
    const { counts } = mkBuildOverviewFromClients(MK_CLIENTS_CACHE);
    mkRenderCardStatuses(counts);

    // Карточка №2
    const demo = mkBuildDemographicsFromClients(MK_CLIENTS_CACHE);
    mkRenderCardDemographics(demo);

    // Суперфильтр
    mkResetFilters();
    mkRenderResults(MK_CLIENTS_CACHE);

    // Карточка №4: «как в Excel»
    const logsMap = await mkFetchStatusLogsForClients(MK_CLIENTS_CACHE);
    const conv = mkBuildReachedConversion(MK_CLIENTS_CACHE, logsMap);
    mkRenderCardConversion(conv);
    console.log('[conv reached]', conv);
// --- Карточка №5: Totals + Potential ---
    const untilInput = document.getElementById('mkPotentialUntil');
    if (untilInput) {
      // Дата по умолчанию: 1-е число следующего месяца
      const now = new Date();
      const def = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const defYmd =
        `${def.getFullYear()}-${String(def.getMonth()+1).padStart(2,'0')}-${String(def.getDate()).padStart(2,'0')}`;
      if (!untilInput.value) untilInput.value = defYmd;

      // Первый рендер итогов
     const totals1 = mkCalcTotalsAndPotential(MK_CLIENTS_CACHE, AppState.marketing, untilInput.value);
mkRenderCardTotals(totals1);

// --- [NEW] Карточка №7: журнал клиентов (проведённые сеансы)
const logRows1 = mkBuildClientLog(MK_CLIENTS_CACHE);
mkRenderClientLog(logRows1);

// --- [NEW] Карточка №8: первичный рендер студийной аналитики
{
  const split1 = mkCalcStudioSplit(MK_CLIENTS_CACHE);
  mkRenderCardStudioSplit(split1);
 // --- KPI / Общий отчёт (карточка №10 под Заглушкой 9)
  const kpi1 = mkCalcKPI(MK_CLIENTS_CACHE, AppState.marketing, totals1);
  mkRenderKPI(kpi1);
  mkRenderSummary(AppState.clients || MK_CLIENTS_CACHE, AppState.marketing);
mkRenderLeadsDonut(AppState.clients || MK_CLIENTS_CACHE);
mkRenderCostsChartManual();
mkRenderCountriesChart(AppState.clients || MK_CLIENTS_CACHE);
}


      // Пересчёт при смене даты
      untilInput.addEventListener('change', () => {
        const totals2 = mkCalcTotalsAndPotential(MK_CLIENTS_CACHE, AppState.marketing, untilInput.value);
        mkRenderCardTotals(totals2);
const logRows2 = mkBuildClientLog(MK_CLIENTS_CACHE);
mkRenderClientLog(logRows2);
// Перерисуем и карточку №8 (она от даты не зависит, но держим в актуальном состоянии)
{
  const split2 = mkCalcStudioSplit(MK_CLIENTS_CACHE);
  mkRenderCardStudioSplit(split2);
 const kpi2 = mkCalcKPI(MK_CLIENTS_CACHE, AppState.marketing, totals2);
  mkRenderKPI(kpi2);
  mkRenderSummary(AppState.clients || MK_CLIENTS_CACHE, AppState.marketing);
}
      });
    }
const btnMig = document.getElementById('btnMigrateAll');
if (btnMig) btnMig.addEventListener('click', () => {
  if (window.tcrmMigrateToGoogleCalendar) window.tcrmMigrateToGoogleCalendar();
});
   // --- Карточка №6: Финансы ---
    // единый апдейтер (функция будет ниже в файле)
    mkUpdateFinanceCard();

    // чекбокс «учитывать расходники»
    document.getElementById('mkIncludeSupplies')?.addEventListener('change', mkUpdateFinanceCard);

  } catch (e) {
    console.warn('[marketing overview] render failed:', e);
  }
});