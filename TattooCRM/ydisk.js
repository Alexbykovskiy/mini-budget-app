/* ydisk.js — REST API Яндекс.Диска
   — Всегда используем path с префиксом `disk:/...`.
   — Авторизация только заголовком Authorization: OAuth <token>.
   — Подписанные ссылки для upload/download без заголовка (как требует API).
*/

// ⚠️ на проде лучше заменить на свой Cloudflare Worker
const CORS_PROXY = 'https://cors.isomorphic-git.org/';

const YD = (() => {
  const API = 'https://cloud-api.yandex.net/v1/disk';
  const ROOT = 'disk:/TattooCRM';

  // ---- token store ----
  const getToken = () => localStorage.getItem('ydisk_token') || '';
  const setToken = (t) => t && localStorage.setItem('ydisk_token', t);
  const clearToken = () => localStorage.removeItem('ydisk_token');

  const authHeaders = () => {
    const t = getToken();
    if (!t) throw new Error('Нет OAuth-токена Яндекс.Диска');
    return { 'Authorization': `OAuth ${t}`, 'Accept': 'application/json' };
  };

  // small fetch helper with better errors
  async function jfetch(url, opts = {}) {
    const r = await fetch(url, opts);
    if (!r.ok) {
      let msg = '';
      try { const e = await r.json(); msg = (e.description || e.message || JSON.stringify(e)); }
      catch { msg = await r.text().catch(()=> ''); }
      throw new Error(`${r.status}: ${msg}`);
    }
    if (r.status === 204) return null;
    return await r.json();
  }

  // ---- base ops ----
  async function createDir(path) {
    const url = `${API}/resources?path=${encodeURIComponent(path)}`;
    const r = await fetch(url, { method: 'PUT', headers: authHeaders() });
    if (![201,409].includes(r.status)) {
      let t = '';
      try { const e = await r.json(); t = e.description || e.message || JSON.stringify(e); } catch {}
      throw new Error(`${r.status}: ${t || 'createDir failed'}`);
    }
  }

  async function list(path) {
    const url = `${API}/resources?path=${encodeURIComponent(path)}&limit=1000`;
    return await jfetch(url, { headers: authHeaders() }); // returns meta with _embedded.items
  }


// создаёт папку только если её нет (убирает 409 в консоли)
async function ensureDir(path) {
  try {
    await list(path);           // 200 — папка уже есть
  } catch (e) {
    if (String(e).includes('404')) {
      await createDir(path);    // нет — создаём
    } else {
      throw e;
    }
  }
}

  async function getDownloadUrl(path) {
    const url = `${API}/resources/download?path=${encodeURIComponent(path)}`;
    const { href } = await jfetch(url, { headers: authHeaders() });
    return href;
  }

 async function getJSON(path) {
  const href = await getDownloadUrl(path); // ссылка на downloader.disk.yandex.ru
  const tries = [
    href, // прямой (скорее всего CORS заблокирует — пойдём дальше)
    'https://cors.isomorphic-git.org/' + href,
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(href),
    'https://thingproxy.freeboard.io/fetch/' + href,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`download ${r.status}`);
      return await r.json();
    } catch (e) {
      // пробуем следующий
    }
  }
  throw new Error('download failed: CORS');
}

  async function getUploadUrl(path) {
    const url = `${API}/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`;
    return await jfetch(url, { headers: authHeaders() }); // {href, method}
  }

  async function uploadBlob(path, blob) {
    const { href, method } = await getUploadUrl(path);
    const r = await fetch(href, { method: method || 'PUT', body: blob });
    if (!r.ok) {
      const t = await r.text().catch(()=> '');
      throw new Error(`upload ${r.status}: ${t}`);
    }
  }

  async function putJSON(path, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    await uploadBlob(path, blob);
  }

  async function putFile(path, file) { await uploadBlob(path, file); }

  // ---- healthcheck ----
  async function ping() {
    const url = `${API}/?fields=total_space,used_space`;
    return await jfetch(url, { headers: authHeaders() });
  }

  // ---- high-level ----
 async function ensureLibrary() {
  await ping(); // валидируем токен

  await ensureDir('disk:/TattooCRM');
  await ensureDir(`${ROOT}/clients`);
  await ensureDir(`${ROOT}/appointments`);
  await ensureDir(`${ROOT}/reminders`);
  await ensureDir(`${ROOT}/supplies`);
  await ensureDir(`${ROOT}/marketing`);
  await ensureDir(`${ROOT}/exports`);

  const settingsPath = `${ROOT}/settings.json`;
  const existing = await getJSON(settingsPath).catch(()=> null);
  if (!existing) {
    await putJSON(settingsPath, {
      sources: [], styles: [], zones: [], supplies: [],
      defaultReminder: '', syncInterval: 60, language: 'ru'
    });
  }
  return true;
}

  async function createClientSkeleton(clientId, profile) {
    const base = `${ROOT}/clients/${clientId}`;
await ensureDir(base);
await putJSON(`${base}/profile.json`, profile);
await ensureDir(`${base}/photos`);
  }

  async function ensureSessionFolder(clientId, isoDate) {
    const day = isoDate.split('T')[0];
await ensureDir(`${ROOT}/clients/${clientId}/photos/${day}`);
return day;
  }

  return {
    getToken, setToken, clearToken,
    ensureLibrary, createClientSkeleton, ensureSessionFolder,
    putJSON, getJSON, putFile, list, ping
  };
})();
