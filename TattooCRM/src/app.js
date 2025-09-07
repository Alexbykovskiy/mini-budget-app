/* app.js — SPA controller */

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
  clients: [],       // [{id, displayName, phone, link, source, first, type, styles[], zones[], status, qual, deposit, amount, notes}]
  reminders: [],     // simplified for MVP
  appointments: [],  // simplified for MVP
  supplies: [],      // simplified for MVP
  autoSyncTimer: null
};

// ---------- Init ----------
window.addEventListener('DOMContentLoaded', () => {
  bindTabbar();
  bindHeader();
  bindOnboarding();
  bindClientsModal();
  bindSettings();

  // Restore token -> auto enter
  const token = YD.getToken();
  if (token) {
    startWithDisk();
  } else {
    showPage('onboarding');
  }
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
  $('#syncBtn').addEventListener('click', syncNow);
}

// ---------- Onboarding ----------
function bindOnboarding(){
  $('#bootstrapBtn').addEventListener('click', async () => {
    try{
      const token = $('#ydToken').value.trim();
      if (!token) return toast('Вставьте OAuth-токен Яндекс.Диска');
      YD.setToken(token);
      await YD.ensureLibrary();
      await loadSettings();
      AppState.connected = true;
      showPage('todayPage');
      toast('Библиотека готова');
      setupAutoSync();
      renderToday();
   } catch(e){
  console.error(e);
  toast('Ошибка запуска: ' + (e?.message || 'неизвестно'));
}
  });

  // демо без диска
  $('#demoBtn').addEventListener('click', () => {
    AppState.connected = false;
    AppState.settings = demoSettings();
    AppState.clients = demoClients();
    AppState.reminders = demoReminders();
    showPage('todayPage');
    renderToday();
    renderClients();
  });
}

async function startWithDisk(){
  try{
    await YD.ensureLibrary();
    await loadSettings();
    AppState.connected = true;
    showPage('todayPage');
    setupAutoSync();
    renderToday();
  }catch(e){
    console.warn('Auto connect failed', e);
    showPage('onboarding');
  }
}

async function loadSettings(){
  const s = await YD.getJSON('TattooCRM/settings.json');
  AppState.settings = s || demoSettings();
}

// ---------- Sync ----------
async function syncNow(){
  $('#syncBtnText').textContent = 'Синхронизация…';
  try{
    // Здесь ты добавишь реальную загрузку клиентов/записей/напоминаний из индекс-файлов.
    // Для MVP подгружаем демо, если пусто:
    if (!AppState.clients.length) AppState.clients = demoClients();
    if (!AppState.reminders.length) AppState.reminders = demoReminders();

    renderToday();
    renderClients();
    toast('Синхронизировано');
  } catch(e){
    console.error(e);
    toast('Ошибка синхронизации');
  } finally {
    $('#syncBtnText').textContent = 'Синхронизировать';
  }
}

function setupAutoSync(){
  clearInterval(AppState.autoSyncTimer);
  const interval = Math.max(15, Number(AppState?.settings?.syncInterval || 60)) * 1000;
  AppState.autoSyncTimer = setInterval(syncNow, interval);
}

// ---------- Today ----------
function renderToday(){
  const sch = $('#todaySchedule');
  const rem = $('#todayReminders');
  sch.innerHTML = '';
  rem.innerHTML = '';

  // простая витрина
  const today = new Date().toISOString().slice(0,10);
  const items = [
    { time:'09:00–13:00', title:'Иван Петров', type:'Сеанс' },
    { time:'15:00–16:00', title:'Анастасия', type:'Консультация' },
  ];
  items.forEach(it => {
    const el = document.createElement('div');
    el.className='row card-client glass';
    el.innerHTML = `<div><b>${it.time}</b> — ${it.title} <span class="badge">${it.type}</span></div>`;
    sch.appendChild(el);
  });

  AppState.reminders.forEach(r => {
    const el = document.createElement('div');
    el.className='row card-client glass';
    el.innerHTML = `<div>🔔 <b>${r.date}</b> — ${r.title}</div>`;
    rem.appendChild(el);
  });
}

// ---------- Clients ----------
function bindClientsModal(){
  $('#addClientBtn').addEventListener('click', () => openClientDialog());

  $('#attachPhotosBtn').addEventListener('click', (e)=>{
    e.preventDefault();
    $('#photoInput').click();
  });

  $('#photoInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const id = $('#clientDialog').dataset.id;
    const day = await YD.ensureSessionFolder(id, new Date().toISOString());
    for (const f of files) {
      await YD.putFile(`TattooCRM/clients/${id}/photos/${day}/${f.name}`, f);
    }
    toast(`Загружено: ${files.length} фото`);
    $('#photosEmptyNote').style.display = 'none';
  });

  $('#saveClientBtn').addEventListener('click', saveClientFromDialog);
  $('#deleteClientBtn').addEventListener('click', deleteClientFromDialog);
}

function renderClients(){
  const wrap = $('#clientsList');
  wrap.innerHTML = '';

  const term = ($('#searchInput').value || '').trim().toLowerCase();
  const src = $('#filterSource').value || '';
  const st  = $('#filterStatus').value || '';

  // заполняем источники из настроек
  const srcSel = $('#filterSource');
  if (!srcSel.dataset.filled){
    (AppState.settings?.sources || []).forEach(s=>{
      const o = document.createElement('option'); o.textContent = s; srcSel.appendChild(o);
    });
    srcSel.dataset.filled = '1';
  }

  // фильтрация
  let arr = [...AppState.clients];
  if (term) arr = arr.filter(c => [c.displayName,c.phone,(c.styles||[]).join(',')].join(' ').toLowerCase().includes(term));
  if (src)  arr = arr.filter(c => c.source === src);
  if (st)   arr = arr.filter(c => c.status === st);

  // карточки
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

  // поиск input live
  $('#searchInput').oninput = () => renderClients();
  $('#filterSource').onchange = () => renderClients();
  $('#filterStatus').onchange = () => renderClients();
}

function openClientDialog(c = null){
  const dlg = $('#clientDialog');
  const isNew = !c;
  const id = c?.id || `cl_${crypto.randomUUID().slice(0,8)}`;
  dlg.dataset.id = id;
  $('#clientModalTitle').textContent = isNew ? 'Новый клиент' : c.displayName || 'Клиент';

  // заполнить источники
  const fSource = $('#fSource');
  fSource.innerHTML = '';
  (AppState.settings?.sources || []).forEach(s=>{
    const o = document.createElement('option'); o.textContent = s; fSource.appendChild(o);
  });

  // заполнение полей
  $('#fName').value   = c?.displayName || '';
  $('#fPhone').value  = c?.phone || '';
  $('#fLink').value   = c?.link || '';
  $('#fSource').value = c?.source || (AppState.settings?.sources?.[0] || '');
  $('#fFirst').value  = String(c?.first ?? true);
  $('#fType').value   = c?.type || 'Новая';
  $('#fStyles').value = (c?.styles || []).join(', ');
  $('#fZones').value  = (c?.zones || []).join(', ');
  $('#fStatus').value = c?.status || 'Лид';
  $('#fQual').value   = c?.qual || 'Целевой';
  $('#fDeposit').value= c?.deposit || '';
  $('#fAmount').value = c?.amount || '';
  $('#fNotes').value  = c?.notes || '';

  // фото-пусто
  $('#photosEmptyNote').style.display = 'block';

  dlg.showModal();
}

async function saveClientFromDialog(){
  const id = $('#clientDialog').dataset.id;
  const c = {
    id,
    displayName: $('#fName').value.trim(),
    phone: $('#fPhone').value.trim(),
    link: $('#fLink').value.trim(),
    source: $('#fSource').value,
    first: $('#fFirst').value === 'true',
    type: $('#fType').value,
    styles: splitTags($('#fStyles').value),
    zones: splitTags($('#fZones').value),
    status: $('#fStatus').value,
    qual: $('#fQual').value,
    deposit: Number($('#fDeposit').value||0),
    amount: Number($('#fAmount').value||0),
    notes: $('#fNotes').value.trim(),
    updatedAt: new Date().toISOString()
  };

  // локально
  const idx = AppState.clients.findIndex(x => x.id === id);
  if (idx === -1) AppState.clients.push(c); else AppState.clients[idx] = c;

  // диск: профиль и базовая структура
  try{
    await YD.createClientSkeleton(id, c);
  }catch(e){
    console.warn('createClientSkeleton', e);
  }

  toast('Сохранено');
  $('#clientDialog').close();
  renderClients();
}

async function deleteClientFromDialog(){
  // Для MVP: просто скрыть (реальное удаление через WebDAV DELETE можно добавить позже)
  const id = $('#clientDialog').dataset.id;
  AppState.clients = AppState.clients.filter(x => x.id !== id);
  $('#clientDialog').close();
  renderClients();
}

// ---------- Marketing (stub) ----------
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

// ---------- Supplies (stub) ----------
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
    YD.clearToken();
    toast('Доступ к Диску отключён');
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

  // заполнить фильтры «источник» в Клиентах
  const sel = $('#filterSource');
  const have = Array.from(sel.options).map(o=>o.value);
  (s.sources||[]).forEach(src=>{
    if (!have.includes(src)) {
      const o = document.createElement('option'); o.textContent = src;
      sel.appendChild(o);
    }
  });
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
    await YD.putJSON('TattooCRM/settings.json', s);
    setupAutoSync();
    toast('Настройки сохранены');
  }catch(e){
    console.warn(e);
    toast('Не удалось сохранить на Диск — сохранено только локально');
  }
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
     first:true, type:'Перекрытие', styles:['realism','ч/б'], zones:['forearm'], status:'Сеанс', qual:'Целевой',
     deposit:50, amount:450, notes:'перекрыть надпись', updatedAt: new Date().toISOString()},
    {id:'cl_ana', displayName:'Анастасия Смирнова', phone:'+421...', link:'vk.com/ana', source:'VK',
     first:false, type:'Новая', styles:['минимализм'], zones:['wrist'], status:'Консультация', qual:'Целевой',
     deposit:0, amount:0, notes:''}
  ];
}
function demoReminders(){
  const d = new Date().toISOString().slice(0,10);
  return [
    {date:d, title:'Иван Петров — спросить, как зажило'},
    {date:d, title:'Анастасия — уточнить эскиз'},
  ];
}
