/* ydisk.js — REST API с токеном в URL (без CORS-префлайта) */
const YD = (() => {
  const API = 'https://cloud-api.yandex.net/v1/disk';

  function getToken(){ return localStorage.getItem('ydisk_token') || ''; }
  function setToken(t){ if (t) localStorage.setItem('ydisk_token', t); }
  function clearToken(){ localStorage.removeItem('ydisk_token'); }

  // Собираем URL с токеном
  function u(path, qs = '') {
    const sep = qs ? '&' : '';
    const token = getToken();
    if (!token) throw new Error('Нет OAuth-токена Яндекс.Диска');
    return `${API}${path}?${qs}${sep}oauth_token=${encodeURIComponent(token)}`;
  }

  async function createDir(path){
    const r = await fetch(u('/resources', `path=${encodeURIComponent(path)}`), { method: 'PUT' });
    if (![201,409].includes(r.status)) throw new Error(`Создание папки "${path}" не удалось (${r.status})`);
  }

  async function uploadBlob(path, blob){
    const r1 = await fetch(u('/resources/upload', `path=${encodeURIComponent(path)}&overwrite=true`));
    if (!r1.ok) throw new Error(`Upload URL для "${path}" не выдан (${r1.status})`);
    const { href, method } = await r1.json();
    const r2 = await fetch(href, { method: method || 'PUT', body: blob });
    if (!r2.ok) throw new Error(`Загрузка "${path}" не удалась (${r2.status})`);
  }

  async function putJSON(path, obj){
    const blob = new Blob([JSON.stringify(obj,null,2)], { type:'application/json' });
    await uploadBlob(path, blob);
  }

  async function getJSON(path){
    const r = await fetch(u('/resources/download', `path=${encodeURIComponent(path)}`));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Download URL для "${path}" не выдан (${r.status})`);
    const { href } = await r.json();
    const file = await fetch(href);
    if (file.status === 404) return null;
    if (!file.ok) throw new Error(`GET "${path}" (${file.status})`);
    return await file.json();
  }

  async function list(path){
    const r = await fetch(u('/resources', `path=${encodeURIComponent(path)}&limit=200`));
    if (!r.ok) throw new Error(`LIST "${path}" не удался (${r.status})`);
    return await r.json();
  }

  async function ping(){
    const r = await fetch(u('/', 'fields=total_space,used_space'));
    if (!r.ok) throw new Error(`Токен не принят (${r.status})`);
    return await r.json();
  }

  // High-level
  async function ensureLibrary(){
    await ping();
    const base = 'TattooCRM';
    await createDir(base);
    await createDir(`${base}/clients`);
    await createDir(`${base}/appointments`);
    await createDir(`${base}/reminders`);
    await createDir(`${base}/supplies`);
    await createDir(`${base}/marketing`);
    await createDir(`${base}/exports`);
    const setPath = `${base}/settings.json`;
    const existing = await getJSON(setPath).catch(()=>null);
    if (!existing){
      await putJSON(setPath, {
        sources:["Instagram","TikTok","VK","Google","Сарафан"],
        styles:["Реализм","Ч/Б","Цвет","Олдскул"],
        zones:["Рука","Нога","Спина"],
        supplies:["Краски","Иглы","Химия"],
        defaultReminder:"Через 14 дней — Спросить про заживление",
        syncInterval:60,
        language:"ru"
      });
    }
    return true;
  }

  async function createClientSkeleton(clientId, profile){
    const base = `TattooCRM/clients/${clientId}`;
    await createDir(base);
    await putJSON(`${base}/profile.json`, profile);
    await createDir(`${base}/photos`);
  }

  async function ensureSessionFolder(clientId, isoDate){
    const day = isoDate.split('T')[0];
    await createDir(`TattooCRM/clients/${clientId}/photos/${day}`);
    return day;
  }

  async function putFile(path, file){ await uploadBlob(path, file); }

  return { getToken,setToken,clearToken,
    ensureLibrary,createClientSkeleton,ensureSessionFolder,
    putJSON,getJSON,putFile,list,ping };
})();
