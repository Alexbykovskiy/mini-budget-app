/* ydisk.js — REST API Яндекс.Диска
   — Всегда используем path с префиксом `disk:/...`.
   — Авторизация только заголовком Authorization: OAuth <token>.
   — Подписанные ссылки для upload/download без заголовка (как требует API).
*/
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

  async function getDownloadUrl(path) {
    const url = `${API}/resources/download?path=${encodeURIComponent(path)}`;
    const { href } = await jfetch(url, { headers: authHeaders() });
    return href;
  }

  async function getJSON(path) {
    try {
      const href = await getDownloadUrl(path);
      const r = await fetch(href);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`download ${r.status}`);
      return await r.json();
    } catch (e) {
      // 404 на этапе выдачи ссылки
      if (String(e).includes('404')) return null;
      throw e;
    }
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

    await createDir('disk:/TattooCRM');
    await createDir(`${ROOT}/clients`);
    await createDir(`${ROOT}/appointments`);
    await createDir(`${ROOT}/reminders`);
    await createDir(`${ROOT}/supplies`);
    await createDir(`${ROOT}/marketing`);
    await createDir(`${ROOT}/exports`);

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
    await createDir(base);
    await putJSON(`${base}/profile.json`, profile);
    await createDir(`${base}/photos`);
  }

  async function ensureSessionFolder(clientId, isoDate) {
    const day = isoDate.split('T')[0];
    await createDir(`${ROOT}/clients/${clientId}/photos/${day}`);
    return day;
  }

  return {
    getToken, setToken, clearToken,
    ensureLibrary, createClientSkeleton, ensureSessionFolder,
    putJSON, getJSON, putFile, list, ping
  };
})();
