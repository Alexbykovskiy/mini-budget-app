/* ydisk.js — версия через REST API Яндекс.Диска (CORS-friendly)
   Создание папок, запись/чтение JSON и загрузка файлов.
*/
const YD = (() => {
  const API = 'https://cloud-api.yandex.net/v1/disk';

  // ---- Token storage ----
  function getToken(){ return localStorage.getItem('ydisk_token') || ''; }
  function setToken(t){ if (t) localStorage.setItem('ydisk_token', t); }
  function clearToken(){ localStorage.removeItem('ydisk_token'); }

  function authHeadersJSON(){
    const t = getToken();
    if (!t) throw new Error('Нет OAuth-токена Яндекс.Диска');
    return { 'Authorization': `OAuth ${t}`, 'Accept': 'application/json' };
  }

  // ---- Helpers ----
  async function createDir(path){
    const url = `${API}/resources?path=${encodeURIComponent(path)}`;
    const res = await fetch(url, { method: 'PUT', headers: authHeadersJSON() });
    // 201 Created — ок, 409 Already exists — тоже ок
    if (![201, 409].includes(res.status)){
      const text = await res.text().catch(()=> '');
      throw new Error(`Создание папки "${path}" не удалось (${res.status}). ${text}`);
    }
  }

  // upload any blob/file
  async function uploadBlob(path, blob){
    // получаем одноразовую ссылку
    const u = `${API}/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`;
    const r = await fetch(u, { headers: authHeadersJSON() });
    if (!r.ok){
      const t = await r.text().catch(()=> '');
      throw new Error(`Не получил upload URL для "${path}" (${r.status}). ${t}`);
    }
    const { href, method } = await r.json();
    const put = await fetch(href, { method: method || 'PUT', body: blob });
    if (!put.ok){
      const t = await put.text().catch(()=> '');
      throw new Error(`Загрузка файла "${path}" не удалась (${put.status}). ${t}`);
    }
  }

  async function putJSON(path, obj){
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    await uploadBlob(path, blob);
  }

  // download JSON via signed URL
  async function getJSON(path){
    const u = `${API}/resources/download?path=${encodeURIComponent(path)}`;
    const r = await fetch(u, { headers: authHeadersJSON() });
    if (r.status === 404) return null;
    if (!r.ok){
      const t = await r.text().catch(()=> '');
      throw new Error(`Не получил download URL для "${path}" (${r.status}). ${t}`);
    }
    const { href } = await r.json();
    const file = await fetch(href);
    if (file.status === 404) return null;
    if (!file.ok) throw new Error(`GET "${path}" (${file.status})`);
    return await file.json();
  }

  async function putFile(path, file){ await uploadBlob(path, file); }

  // список элементов папки (метаданные)
  async function list(path){
    const url = `${API}/resources?path=${encodeURIComponent(path)}&limit=200`;
    const r = await fetch(url, { headers: authHeadersJSON() });
    if (!r.ok){
      const t = await r.text().catch(()=> '');
      throw new Error(`LIST "${path}" (${r.status}). ${t}`);
    }
    return await r.json(); // вернёт объект с _embedded.items
  }

  // просто проверить токен/квоту
  async function ping(){
    const r = await fetch(`${API}/?fields=total_space,used_space`, { headers: authHeadersJSON() });
    if (!r.ok) throw new Error(`Токен не принят (${r.status})`);
    return await r.json();
  }

  // ---- High-level ----
  async function ensureLibrary(){
    // заодно валидируем токен
    await ping();

    const base = 'TattooCRM';
    await createDir(base);
    await createDir(`${base}/clients`);
    await createDir(`${base}/appointments`);
    await createDir(`${base}/reminders`);
    await createDir(`${base}/supplies`);
    await createDir(`${base}/marketing`);
    await createDir(`${base}/exports`);

    const settingsPath = `${base}/settings.json`;
    const existing = await getJSON(settingsPath).catch(()=> null);
    if (!existing){
      const defaults = {
        sources:["Instagram","TikTok","VK","Google","Сарафан"],
        styles:["Реализм","Ч/Б","Цвет","Олдскул"],
        zones:["Рука","Нога","Спина"],
        supplies:["Краски","Иглы","Химия"],
        defaultReminder:"Через 14 дней — Спросить про заживление",
        syncInterval:60,
        language:"ru"
      };
      await putJSON(settingsPath, defaults);
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

  return {
    getToken, setToken, clearToken,
    ensureLibrary, createClientSkeleton, ensureSessionFolder,
    putJSON, getJSON, putFile, list, ping
  };
})();
