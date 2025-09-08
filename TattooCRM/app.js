/* app.js — SPA controller (Firestore + Google Drive) */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
};

// ---------- State ----------
const AppState = {
  connected: false,
  settings: null,
  clients: [],
  reminders: [],
  appointments: [],
  supplies: [],
  autoSyncTimer: null
};
let syncInProgress = false;
let currentUser = null;
let driveReady = false;

// ---------- Init ----------
window.addEventListener('DOMContentLoaded', () => {
  bindTabbar();
  bindHeader();
  bindOnboarding();
  bindClientsModal();
  bindSettings();

  showPage('onboarding'); // стартуем со страницы входа
});

// ---------- Tabs ----------
function bindTabbar(){
  $$('.tabbar .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tabbar .tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      showPage(btn.dataset.tab);
      if (btn.dataset.tab === 'clientsPage') renderClients();
      if (btn.dataset.tab === 'todayPage') renderToday();
      if (btn.dataset.tab === 'marketingPage') renderMarketing();
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
  $('#syncBtn').addEventListener('click', () => {
    toast('Все данные синхронизируются автоматически');
  });
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
    const accessToken = cred.credential && cred.credential.accessToken;
    if (!accessToken) throw new Error('Google accessToken не получен');

    await Drive.loadGapi();
    await Drive.setAuthToken(accessToken);
    await Drive.ensureLibrary();
    driveReady = true;

    await loadSettings();
    AppState.connected = true;

    showPage('todayPage');
    toast('Вход выполнен. Firestore + Drive готовы.');

    listenClientsRealtime();
    renderToday();
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
    }, (err)=> {
      console.error(err);
      toast('Ошибка чтения клиентов');
    });
}

// ---------- Settings load/save ----------
async function loadSettings(){
  try {
    const docRef = FB.db.collection('TattooCRM').doc('settings').collection('global').doc('default');
    const doc = await docRef.get();
    AppState.settings = doc.exists ? doc.data() : demoSettings();
  } catch(e) {
    console.warn(e);
    AppState.settings = demoSettings();
  }
}

async function saveSettings(){
  const s = {
    sources: splitTags($('#setSources').value),
    styles: splitTags($('#setStyles').value),
    zones: splitTags($('#setZones').value),
    supplies: splitTags($('#setSupplies').value),
    defaultReminder: $('#setDefaultReminder').value.trim(),
    syncInterval: Math.max(15, Number($('#setSyncInterval').value||60)),
    language: 'ru'
  };
  AppState.settings = s;
  try{
    const docRef = FB.db.collection('TattooCRM').doc('settings').collection('global').doc('default');
    await docRef.set(s, { merge:true });
    toast('Настройки сохранены');
  }catch(e){
    console.warn(e);
    toast('Не удалось сохранить настройки');
  }
}

// ---------- Today ----------
function renderToday(){
  const sch = $('#todaySchedule');
  const rem = $('#todayReminders');
  sch.innerHTML = '';
  rem.innerHTML = '';

  const today = new Date().toISOString().slice(0,10);

  const todays = (AppState.clients || [])
    .filter(c => (c.nextDate || '').slice(0,10) === today)
    .sort((a,b) => (cTime(a) || '').localeCompare(cTime(b) || ''));

  if (!todays.length) {
    const el = document.createElement('div');
    el.className = 'row card-client glass';
    el.textContent = 'На сегодня записей нет';
    sch.appendChild(el);
  } else {
    todays.forEach(c => {
      const time = (c.nextDate || '').slice(11,16) || '';
      const el = document.createElement('div');
      el.className='row card-client glass';
      el.innerHTML = `<div><b>${time||'—'}</b> — ${c.displayName} <span class="badge">${c.status||'Сеанс'}</span></div>`;
      sch.appendChild(el);
    });
  }

  (AppState.reminders || []).forEach(r => {
    const el = document.createElement('div');
    el.className='row card-client glass';
    el.innerHTML = `<div>🔔 <b>${r.date}</b> — ${r.title}</div>`;
    rem.appendChild(el);
  });

  function cTime(c){ return (c.nextDate||''); }
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

    const name = ($('#fName').value || 'Без имени').trim();
    const clientRef = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(id);
    const snap = await clientRef.get();

    let folderId = snap.exists ? (snap.data()?.driveFolderId || null) : null;
    await Drive.ensureLibrary();

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
  if (term) arr = arr.filter(c => [c.displayName,c.phone,(c.styles||[]).join(',')].join(' ').toLowerCase().includes(term));
  if (src)  arr = arr.filter(c => c.source === src);
  if (st)   arr = arr.filter(c => c.status === st);

  arr.forEach(c=>{
    const card = document.createElement('div');
    card.className = 'card-client glass';

    const tags = (c.styles||[]).slice(0,3).join(', ') || '—';
    card.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div><b>${c.displayName}</b></div>
        <div class="badge">${c.status||'Лид'}</div>
      </div>
      <div class="meta">${c.source||'—'} • LTV €${c.amount||0}</div>
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


function openClientDialog(c = null){
  const dlg = $('#clientDialog');
  const isNew = !c;
  const id = c?.id || `cl_${crypto.randomUUID().slice(0,8)}`;
  dlg.dataset.id = id;
  $('#clientModalTitle').textContent = isNew ? 'Новый клиент' : (c?.displayName || 'Клиент');

  const fSource = $('#fSource');
  fSource.innerHTML = '';
  (AppState.settings?.sources || []).forEach(s=>{
    const o = document.createElement('option'); o.textContent = s; fSource.appendChild(o);
  });

  $('#fName').value   = c?.displayName || '';
  $('#fPhone').value  = c?.phone || '';
  $('#fLink').value   = c?.link || '';
  $('#fSource').value = c?.source || (AppState.settings?.sources?.[0] || '');
  $('#fFirst').value  = String(c?.first ?? true);      // это select!
  $('#fType').value   = c?.type || 'Новая';
  $('#fStyles').value = (c?.styles || []).join(', ');
  $('#fZones').value  = (c?.zones || []).join(', ');
  $('#fStatus').value = c?.status || 'Лид';
  $('#fQual').value   = c?.qual || 'Целевой';
  $('#fDeposit').value= c?.deposit || '';
  $('#fAmount').value = c?.amount || '';
  $('#fNotes').value  = c?.notes || '';
  $('#fNextDate').value = c?.nextDate ? c.nextDate.slice(0,16) : '';
  $('#photosEmptyNote').style.display = 'block';
// очистим и подгрузим превью, если есть папка
$('#photosGrid').innerHTML = '';
$('#photosEmptyNote').style.display = 'block';
refreshClientPhotos($('#clientDialog').dataset.id);
  dlg.showModal();
}

async function saveClientFromDialog(){
  let id = $('#clientDialog').dataset.id;

  const displayName = $('#fName').value.trim();
  const isNew = !id || !id.startsWith('cl_');
  if (isNew) {
    id = `cl_${crypto.randomUUID().slice(0,8)}`;
    $('#clientDialog').dataset.id = id;
  }

  const client = {
    id,
    displayName,
    phone: $('#fPhone').value.trim(),
    link: $('#fLink').value.trim(),
    source: $('#fSource').value.trim(),
    first: ($('#fFirst').value === 'true'),
    type: $('#fType').value.trim(),
    styles: splitTags($('#fStyles').value),
    zones: splitTags($('#fZones').value),
    status: $('#fStatus').value,
    qual: $('#fQual').value,
    deposit: Number($('#fDeposit').value || 0),
    amount: Number($('#fAmount').value || 0),
    notes: $('#fNotes').value.trim(),
    nextDate: ($('#fNextDate').value || ''),
    updatedAt: new Date().toISOString()
  };

  const i = AppState.clients.findIndex(x => x.id === id);
  if (i >= 0) AppState.clients[i] = client; else AppState.clients.push(client);
  renderClients();

  try {
    const ref = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(id);
    // 1) Сохраняем клиента
    await ref.set(client, { merge:true });

    // 2) Автосоздание папки, если ещё нет
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

    toast('Сохранено');
  } catch(e) {
    console.warn('saveClientFromDialog', e);
    toast('Ошибка сохранения');
  }

  $('#clientDialog').close();
}

async function deleteClientFromDialog(){
  const id = $('#clientDialog').dataset.id;
  if (!id) return;

  // Подтверждение (как вы и хотели — обязательно спрашивать)
  const ok = confirm('Удалить клиента и его папку в Google Drive?');
  if (!ok) return;

  try {
    const ref = FB.db.collection('TattooCRM').doc('app').collection('clients').doc(id);
    const snap = await ref.get();
    const folderId = snap.exists ? (snap.data()?.driveFolderId || null) : null;

    // 1) Удаляем документ в Firestore
    await ref.delete();

    // 2) Удаляем папку в Google Drive (рекурсивно в корзину), если была создана
    if (driveReady && folderId) {
      await Drive.deleteFolderRecursive(folderId);
    }

    toast('Клиент удалён');

  } catch (e) {
    console.error('deleteClientFromDialog', e);
    toast('Не удалось удалить клиента');
  } finally {
    // Локально сразу убираем из списка
    AppState.clients = AppState.clients.filter(x => x.id !== id);
    $('#clientDialog').close();
    renderClients();
  }
}
// ---------- Marketing ----------
function renderMarketing(){
  const hi = $('#mkHighlites');
  const tb = $('#mkTable');
  hi.innerHTML = '';
  tb.innerHTML = '';

  const highlights = [
    {k:'55%', t:'Instagram'},
    {k:'17%', t:'Конверсия → сеанс'},
    {k:'32%', t:'Повторные клиенты'},
    {k:'€ 2 450', t:'Выручка (мес)'},
  ];
  highlights.forEach(m=>{
    const el = document.createElement('div');
    el.className='metric glass';
    el.innerHTML = `<div class="k">${m.k}</div><div class="t">${m.t}</div>`;
    hi.appendChild(el);
  });

  const rows = [
    {src:'Instagram', lead:6, consult:3, session:1},
    {src:'VK', lead:2, consult:0, session:0},
  ];
  tb.innerHTML = rows.map(r=>`
    <div class="row">
      <div style="width:30%">${r.src}</div>
      <div>Обращения: <b>${r.lead}</b></div>
      <div>Консультации: <b>${r.consult}</b></div>
      <div>Сеансы: <b>${r.session}</b></div>
    </div>
  `).join('');
}

// ---------- Supplies ----------
function renderSupplies(){
  const list = $('#suppliesList'); list.innerHTML = '';
  AppState.supplies = AppState.supplies?.length ? AppState.supplies : [
    {name:'Dynamic Black 12oz', cat:'Краски', left:'20%', note:'пора докупить', link:'#'},
    {name:'Картриджи 0.35 #12', cat:'Иглы', left:'3 уп.', link:'#'},
  ];
  AppState.supplies.forEach(s=>{
    const card = document.createElement('div');
    card.className='card-client glass';
    card.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div><b>${s.name}</b> · <span class="meta">${s.cat}</span></div>
        <div class="badge">${s.left}</div>
      </div>
      <div class="row" style="justify-content:flex-end; gap:8px">
        <a class="btn ghost" href="${s.link}" target="_blank">Заказать</a>
      </div>
    `;
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
}

function fillSettingsForm(){
  const s = AppState.settings || demoSettings();
  $('#setSources').value  = (s.sources||[]).join(', ');
  $('#setStyles').value   = (s.styles||[]).join(', ');
  $('#setZones').value    = (s.zones||[]).join(', ');
  $('#setSupplies').value = (s.supplies||[]).join(', ');
  $('#setDefaultReminder').value = s.defaultReminder || '';
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
function splitTags(s){
  return (s||'').split(',').map(x=>x.trim()).filter(Boolean);
}

// ---------- Demo ----------
function demoSettings(){
  return {
    sources:["Instagram","TikTok","VK","Google","Сарафан"],
    styles:["Реализм","Ч/Б","Цвет","Олдскул"],
    zones:["Рука","Нога","Спина"],
    supplies:["Краски","Иглы","Химия"],
    defaultReminder:"Через 14 дней — Спросить про заживление",
    syncInterval:60,
    language:"ru"
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
