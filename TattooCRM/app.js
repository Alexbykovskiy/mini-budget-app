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
listenMarketingRealtime();
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
      if (btn.dataset.tab === 'todayPage') renderToday();
      if (btn.dataset.tab === 'marketingPage') { bindMarketing(); renderMarketing(); }
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
  // 1) Обработка результата redirect – запускается при каждой загрузке
  FB.auth.getRedirectResult().then(async (cred) => {
    if (!cred.user) return; // redirect ещё не выполнялся
    await afterLogin(cred);
  }).catch((e) => {
    console.error('redirect result error', e);
    toast('Ошибка инициализации после входа');
  });

  // 2) Клик по кнопке – пробуем popup, при неудаче fallback в redirect
  $('#bootstrapBtn').addEventListener('click', async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.addScope('https://www.googleapis.com/auth/drive.file');

      // Сначала POPUP
      const cred = await FB.auth.signInWithPopup(provider);
      await afterLogin(cred);

    } catch (e) {
      console.warn('popup auth failed, fallback to redirect', e?.code || e);

      // Частые коды для fallback:
      // auth/popup-blocked, auth/popup-closed-by-user, auth/cancelled-popup-request
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.addScope('https://www.googleapis.com/auth/drive.file');

      await FB.auth.signInWithRedirect(provider);
      // Дальше вернёмся сюда после редиректа, и блок getRedirectResult() выше отработает
    }
  });
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

    listenClientsRealtime();
listenRemindersRealtime();
listenSuppliesRealtime();

    renderToday();

listenMarketingRealtime();

  // Инициализируем Drive (ожидаем библиотеки детерминированно)
initDriveStack({ forceConsent: true })
  .then(() => toast('Google Drive подключён'))
  .catch(e => {
    console.error(e);
    toast('Не удалось подключить Drive');
  });


  } catch (e) {
    console.error('afterLogin error', e);
    toast('Ошибка входа/инициализации');
  }
}

// ---------- Firestore realtime ----------
function listenClientsRealtime(){
  FB.db.collection('TattooCRM').doc('app').collection('clients')
    .orderBy('updatedAt', 'desc')   // базовая сортировка
    .onSnapshot((qs)=>{
      AppState.clients = [];
      qs.forEach(d => AppState.clients.push(d.data()));
      renderClients();   // внутри будем сортировать по выбору
      renderToday();
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
  row.addEventListener('click', (e) => {
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
  const [clientId, dt] = ev.id.split('_');
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
    // ключевой анти-залипательный блок
    e.stopPropagation();   // не даём клику подняться до карточки (чтобы та не открывала клиента)
    e.preventDefault();    // на всякий случай — никаких дефолтных действий

    const ok = await confirmDlg('Удалить это напоминание?');
    if (!ok) return;
    try {
      await FB.db.collection('TattooCRM').doc('app')
        .collection('reminders').doc(ev.id).delete();

      // локально убираем строку, либо дождёмся snapshot
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
// сортировка
const sortMode = $('#sortClients')?.value || 'updatedAt';
if (sortMode === 'name') {
  arr.sort((a,b) => (a.displayName||'').localeCompare(b.displayName||''));
} else {
  arr.sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''));
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

card.innerHTML = `
  <div class="row" style="justify-content:space-between">
    <div><b>${c.displayName}</b></div>
    <div class="badge">${c.status||'Лид'}</div>
  </div>
  <div class="meta">${c.source||'—'}</div>
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
async function setSessionDone(clientId, dtIso, done = true) {
  // найдём клиента в состоянии
  const c = (AppState.clients || []).find(x => x.id === clientId);
  if (!c) throw new Error('Клиент не найден');

  const sessions = Array.isArray(c.sessions) ? [...c.sessions] : [];
  const i = sessions.findIndex(s => (typeof s === 'object' ? s.dt : s) === dtIso);
  if (i < 0) throw new Error('Сеанс не найден');

  // нормализуем объект
  const sObj = typeof sessions[i] === 'object' ? {...sessions[i]} : { dt: sessions[i], price: 0 };
  sObj.done = !!done;
  sessions[i] = sObj;

  // локально
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

  $('#sessionsList').appendChild(wrap);
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
    const fSource = $('#fSource');
    fSource.innerHTML = '';
    (AppState.settings?.sources || []).forEach(s=>{
      const o = document.createElement('option'); o.textContent = s; fSource.appendChild(o);
    });

    // Стили (multiple select)
    const fStyles = $('#fStyles');
    fStyles.innerHTML = '';
    (AppState.settings?.styles || []).forEach(st=>{
      const o = document.createElement('option'); o.value = st; o.textContent = st;
      if ((c?.styles||[]).includes(st)) o.selected = true;
      fStyles.appendChild(o);
    });

    // Зоны (multiple select)
    const fZones = $('#fZones');
    fZones.innerHTML = '';
    (AppState.settings?.zones || []).forEach(z=>{
      const o = document.createElement('option'); o.value = z; o.textContent = z;
      if ((c?.zones||[]).includes(z)) o.selected = true;
      fZones.appendChild(o);
    });

    // Простые поля
    $('#fName').value   = c?.displayName || '';
    $('#fPhone').value  = c?.phone || '';
    $('#fLink').value   = c?.link || '';
    $('#fSource').value = c?.source || (AppState.settings?.sources?.[0] || '');

    // Первое обращение (опциональные поля)
    const firstContactEl = $('#fFirstContact');
    if (firstContactEl) {
      firstContactEl.value = c?.firstContactDate || new Date().toISOString().slice(0,10);
    }
    const firstEl = $('#fFirst');
    if (firstEl) {
      firstEl.value = String(c?.first ?? true);
    }

    // Статусы/типы/квалификация
    $('#fType').value   = c?.type || 'Новая';
    $('#fStatus').value = c?.status || 'Лид';
    $('#fQual').value   = c?.qual || 'Не определена';
    $('#fQualNote').value = c?.qualNote || '';

    // Депозит
    $('#fDeposit').value = c?.deposit || '';

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

    // Сеансы — рендерим список полей
    const list = $('#sessionsList');
    list.innerHTML = '';
    const rawSessions = c?.sessions || (c?.nextDate ? [c.nextDate] : []);
    rawSessions.forEach(s => {
      if (typeof s === 'string') {
        addSessionField({ dt: s, price: '', done: false });
      } else {
        addSessionField({ dt: s?.dt || '', price: (s?.price ?? ''), done: !!s?.done });
      }
    });
    if (!list.children.length) addSessionField({ dt:'', price:'' });
    $('#btnAddSession').onclick = () => addSessionField({ dt:'', price:'' });

    // Консультация (свитч + дата)
    $('#fConsultOn').checked = !!(c?.consult);
    $('#fConsultDate').value = c?.consultDate ? c.consultDate.slice(0,16) : '';
    $('#consultDateField').style.display = $('#fConsultOn').checked ? '' : 'none';
    $('#fConsultOn').onchange = () => {
      $('#consultDateField').style.display = $('#fConsultOn').checked ? '' : 'none';
    };

    // Напоминания: шаблоны и «через N дней»
    const tplSel = $('#fReminderTpl');
    tplSel.innerHTML = '<option value="">— шаблон —</option>';
    (AppState.settings?.reminderTemplates || []).forEach(t=>{
      const o = document.createElement('option'); o.value = t; o.textContent = t; tplSel.appendChild(o);
    });
    const afterSel = $('#fReminderAfter');
    afterSel.innerHTML = '<option value="">дни</option>';
    (AppState.settings?.reminderDelays || []).forEach(d=>{
      const o = document.createElement('option'); o.value = String(d); o.textContent = `через ${d}`; afterSel.appendChild(o);
    });
    $('#fReminderTitle').value = '';

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

// --- Cold Lead Mode ---
// Прячет лишние поля, если выбран статус "Холодный лид"
function toggleColdLeadMode(isCold) {
  const dlg = $('#clientDialog');
  if (!dlg) return;

  // список id, которые нужно скрыть
  const toHide = [
  'fFirst',
  'fType','fStyles','fZones','fQual','fQualNote',
  'fDeposit','fAmount','fAmountMin','fAmountMax','fNotes','sessionsList',
  'fConsultOn','fConsultDate','consultDateField'
];

  toHide.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const wrapper = el.closest('.field, .row') || el;
    wrapper.style.display = isCold ? 'none' : '';
  });
}


async function saveClientFromDialog(){
  let id = $('#clientDialog').dataset.id;

  const displayName = $('#fName').value.trim();

  const isNew = !id || !id.startsWith('cl_');
  if (isNew) {
    id = `cl_${crypto.randomUUID().slice(0,8)}`;
    $('#clientDialog').dataset.id = id;
  }

const statusVal = $('#fStatus').value;

  // --- Особый случай: холодный лид ---
  if (statusVal === 'Холодный лид') {
    const client = {
    id,
    displayName,
    phone: $('#fPhone').value.trim(),
    status: statusVal,
    source: $('#fSource').value || '',                // ← источник
    link: $('#fLink').value.trim() || '',             // ← контакт (ссылка)
    firstContact: $('#fFirstContact').value || '',    // ← дата первого обращения (YYYY-MM-DD)
    updatedAt: new Date().toISOString()
  };

    const i = AppState.clients.findIndex(x => x.id === id);
    if (i >= 0) AppState.clients[i] = client; else AppState.clients.push(client);
    renderClients();

    try {
      const ref = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(id);
      await ref.set(client, { merge:true });
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

 const client = {
  id,
  displayName,
  phone: $('#fPhone').value.trim(),
  link: $('#fLink').value.trim(),
source: $('#fSource').value.trim(),
firstContactDate: ($('#fFirstContact').value || new Date().toISOString().slice(0,10)),
first: ($('#fFirst').value === 'true'),
  type: $('#fType').value.trim(),
styles: Array.from($('#fStyles').selectedOptions).map(o=>o.value),
zones: Array.from($('#fZones').selectedOptions).map(o=>o.value),status: $('#fStatus').value,
qual: $('#fQual').value,
qualNote: $('#fQualNote').value.trim(),            // ← добавили
deposit: Number($('#fDeposit').value || 0),
amountMin,                 // новая модель
amountMax,                 // новая модель
amount: (amountMax ?? amountMin ?? 0),  // легаси: пишем число для старого поля
notes: $('#fNotes').value.trim(),
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

}// ---------- Marketing ----------

/**
 * Аггрегированный рендер по дням:
 * - для каждой даты берём ПОСЛЕДНЕЕ значение подписчиков за день (по времени),
 * - суммируем расходы за день,
 * - прирост считаем как (подписчики_сегодня - подписчики_вчера),
 * - внизу показываем итоги: последние общие подписчики и сумму расходов за все дни.
 */
function renderMarketing() {
  const wrap = $('#mkHistory');
  if (!wrap) return;

  const items = Array.isArray(AppState.marketing) ? [...AppState.marketing] : [];
  // сортируем стабильно по дате+времени
  items.sort((a,b) => (String(a.date||'')+String(a.time||'')).localeCompare(String(b.date||'')+String(b.time||'')));

  // агрегируем по датам
  const days = {}; // date -> { date, lastTime, lastFollowers, spent }
  for (const e of items) {
    if (!e?.date) continue;
    const key = e.date;
    if (!days[key]) {
      days[key] = { date: e.date, lastTime: '', lastFollowers: 0, spent: 0 };
    }
    // суммарный расход за день
    days[key].spent += Number(e.spent || 0);

    // для подписчиков берём ПОСЛЕДНЕЕ значение за день по времени
    const tNew = String(e.time || '');
    const tOld = String(days[key].lastTime || '');
    if (tNew >= tOld) {
      days[key].lastTime = tNew;
      days[key].lastFollowers = Number(e.followers || 0);
    }
  }

  const dayKeys = Object.keys(days).sort(); // по возрастанию даты
  let prevFollowers = null;
  let totalFollowers = 0;
  let totalSpent = 0;

  const rows = dayKeys.map(d => {
    const day = days[d];
    const growth = (prevFollowers == null) ? 0 : (day.lastFollowers - prevFollowers);
    prevFollowers = day.lastFollowers;

    totalFollowers = day.lastFollowers; // последнее значение — это «итого» подписчиков
    totalSpent += day.spent;

    return `
      <div class="row" style="justify-content:space-between; padding:6px 0">
        <div><b>${formatDateHuman(day.date)}</b>${day.lastTime ? ' ' + day.lastTime : ''}</div>
        <div>Прирост: <b>${growth >= 0 ? '+' : ''}${growth}</b></div>
        <div>Расход: €${day.spent.toFixed(2)}</div>
      </div>
    `;
  });

  const footer = dayKeys.length ? `
    <div class="row card-client glass" style="margin-top:10px; justify-content:space-between">
      <div><b>Итого</b></div>
      <div>Подписчики: <b>${totalFollowers}</b></div>
      <div>Расход: €${totalSpent.toFixed(2)}</div>
    </div>
  ` : '';

  wrap.innerHTML = rows.length ? rows.join('') + footer
                               : `<div class="row">Пока нет данных</div>`;
}

/** Сохранение записи маркетинга из формы */
async function saveMarketingEntry(){
  const date = $('#mkDate').value || ymdLocal(new Date());
  const time = $('#mkTime').value || new Date().toISOString().slice(11,16);
  const followers = Number($('#mkFollowers').value || 0);
  const spent = Number($('#mkSpent').value || 0);

  const id = `mk_${date}_${time.replace(':','')}`;
  const entry = { id, date, time, followers, spent };

  // ЛОКАЛЬНОЕ состояние (для мгновенного рендера)
  AppState.marketing = AppState.marketing || [];
  const i = AppState.marketing.findIndex(x => x.id === id);
  if (i >= 0) AppState.marketing[i] = entry;
  else AppState.marketing.push(entry);

  renderMarketing();

  // Firestore
  try {
    const ref = FB.db.collection('TattooCRM').doc('app').collection('marketing').doc(id);
    await ref.set(entry, { merge:true });
    toast('Запись сохранена');
  } catch(e) {
    console.warn(e);
    toast('Ошибка сохранения маркетинга');
  }
}

/** Привязка клика к кнопке Сохранить (однократно) */
function bindMarketing(){
  const btn = document.getElementById('saveMkBtn');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', saveMarketingEntry);
  }
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
      renderMarketing();
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

const OAUTH_SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';


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
  await withTimeout(ensureDriveAccessToken({ forceConsent }), 3000, 'gis_token_timeout');
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
