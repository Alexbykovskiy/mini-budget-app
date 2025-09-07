/* ydisk.js
 * Thin client for Yandex.Disk via WebDAV (no server): MKCOL, PUT, GET (JSON), PROPFIND (list)
 * NOTE: In реальности для публикации ссылок удобнее REST API Диска, но для MVP достаточно этого слоя.
 */

const YD = (() => {
  const WEB_DAV = 'https://webdav.yandex.ru';

  function getToken() {
    return localStorage.getItem('ydisk_token') || '';
  }
  function setToken(t) {
    if (t) localStorage.setItem('ydisk_token', t);
  }
  function clearToken() {
    localStorage.removeItem('ydisk_token');
  }

  function authHeader() {
    const t = getToken();
    if (!t) throw new Error('Нет OAuth-токена Яндекс.Диска');
    return { 'Authorization': `OAuth ${t}` };
  }

  // Create folder (MKCOL). 405 = already exists -> treat as OK
  async function mkcol(path) {
    const url = `${WEB_DAV}/${encodeURI(path)}`;
    const res = await fetch(url, { method: 'MKCOL', headers: authHeader() });
    if (!res.ok && res.status !== 405) throw new Error(`MKCOL ${path}: ${res.status}`);
  }

  // PUT json
  async function putJSON(path, obj) {
    const url = `${WEB_DAV}/${encodeURI(path)}`;
    const body = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const res = await fetch(url, { method: 'PUT', headers: authHeader(), body });
    if (!res.ok) throw new Error(`PUT JSON ${path}: ${res.status}`);
  }

  // GET json (simple GET)
  async function getJSON(path) {
    const url = `${WEB_DAV}/${encodeURI(path)}`;
    const res = await fetch(url, { method: 'GET', headers: authHeader() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET JSON ${path}: ${res.status}`);
    return await res.json();
  }

  // Upload file (image)
  async function putFile(path, file) {
    const url = `${WEB_DAV}/${encodeURI(path)}`;
    const res = await fetch(url, { method: 'PUT', headers: authHeader(), body: file });
    if (!res.ok) throw new Error(`PUT FILE ${path}: ${res.status}`);
  }

  // PROPFIND directory listing (depth:1)
  async function list(path) {
    const url = `${WEB_DAV}/${encodeURI(path)}`;
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: { ...authHeader(), 'Depth': '1' }
    });
    if (!res.ok) throw new Error(`LIST ${path}: ${res.status}`);
    const text = await res.text();
    // NOTE: For MVP we won’t parse XML fully; keep as raw or implement later if needed
    return text; // XML WebDAV response
  }

  // Ensure base library structure exists
  async function ensureLibrary() {
    const base = 'TattooCRM';
    await mkcol(base);
    await mkcol(`${base}/clients`);
    await mkcol(`${base}/appointments`);
    await mkcol(`${base}/reminders`);
    await mkcol(`${base}/supplies`);
    await mkcol(`${base}/marketing`);
    await mkcol(`${base}/exports`);

    // settings.json default
    const settingsPath = `${base}/settings.json`;
    const existing = await getJSON(settingsPath).catch(() => null);
    if (!existing) {
      const defaults = {
        sources: ["Instagram","TikTok","VK","Google","Сарафан"],
        styles: ["Реализм","Ч/Б","Цвет","Олдскул"],
        zones: ["Рука","Нога","Спина"],
        supplies: ["Краски","Иглы","Химия"],
        defaultReminder: "Через 14 дней — Спросить про заживление",
        syncInterval: 60,
        language: "ru"
      };
      await putJSON(settingsPath, defaults);
    }
    return true;
  }

  // Create client skeleton: /clients/{id}/ + profile.json + photos/
  async function createClientSkeleton(clientId, profile) {
    const base = `TattooCRM/clients/${clientId}`;
    await mkcol(base);
    await putJSON(`${base}/profile.json`, profile);
    await mkcol(`${base}/photos`);
  }

  // Ensure session date folder exists: /clients/{id}/photos/YYYY-MM-DD/
  async function ensureSessionFolder(clientId, isoDate) {
    const day = isoDate.split('T')[0]; // YYYY-MM-DD
    await mkcol(`TattooCRM/clients/${clientId}/photos/${day}`);
    return day;
  }

  return {
    getToken, setToken, clearToken,
    ensureLibrary, createClientSkeleton, ensureSessionFolder,
    putJSON, getJSON, putFile, list
  };
})();
