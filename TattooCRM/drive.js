// drive.js — helper для Google Drive (scope: drive.file)
// Создаём структуру /TattooCRM/clients и работаем только со “своими” файлами.

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const Drive = (() => {
  let inited = false;
  let rootIds = { root: null, clients: null };

  // Загрузка gapi client + Discovery для Drive v3
  function loadGapi() {
    return new Promise((resolve, reject) => {
      gapi.load('client', async () => {
        try {
          await gapi.client.init({
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
          });
          resolve();
        } catch (e) { reject(e); }
      });
    });
  }

  // Устанавливаем OAuth access_token от Firebase GoogleAuthProvider
  async function setAuthToken(accessToken) {
    gapi.client.setToken({ access_token: accessToken });
  }

  // Найти/создать папку по имени в родительской
  async function ensureFolder(name, parentId = 'root') {
    const q = `'${parentId}' in parents and name='${name.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await gapi.client.drive.files.list({ q, fields:'files(id,name)' });
    if (res.result.files?.length) return res.result.files[0].id;

    const meta = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    };
    const created = await gapi.client.drive.files.create({
      resource: meta,
      fields: 'id,name,webViewLink'
    });
    return created.result.id;
  }

  // Создаём корневую структуру приложения
  async function ensureLibrary() {
    if (inited) return rootIds;
    rootIds.root = await ensureFolder('TattooCRM');
    rootIds.clients = await ensureFolder('clients', rootIds.root);
    inited = true;
    return rootIds;
  }

  // Папка клиента: <clientId>__<Имя_с_подчёркиваниями>
  async function createClientFolder(clientId, displayName) {
    await ensureLibrary();
    const safeName = `${clientId}__${(displayName||'Без_имени').replace(/\s+/g,'_')}`;
    const folderId = await ensureFolder(safeName, rootIds.clients);
    return folderId;
  }

  // Загрузка файла (multipart). Вернём id/name/links для последующего UI.
  async function uploadToFolder(folderId, file) {
    const metadata = {
      name: file.name,
      parents: [folderId]
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;

    const buf = await file.arrayBuffer();
    const contentType = file.type || 'application/octet-stream';
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(buf)));

    const body =
      delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter + `Content-Type: ${contentType}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data + closeDelim;

    const res = await gapi.client.request({
      path: '/upload/drive/v3/files',
      method: 'POST',
      params: { uploadType: 'multipart' },
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body
    });

    // Запросим нужные поля для превью (thumbnail может появиться не мгновенно, но чаще есть сразу)
    const meta = await gapi.client.drive.files.get({
      fileId: res.result.id,
      fields: 'id,name,mimeType,thumbnailLink,webViewLink,iconLink'
    });
    return meta.result; // {id,name,mimeType,thumbnailLink,webViewLink,iconLink}
  }

  // Дать доступ к папке “по ссылке – чтение”
  async function shareFolderPublic(folderId){
    await gapi.client.drive.permissions.create({
      fileId: folderId,
      resource: { role: 'reader', type: 'anyone' }
    });
    const meta = await gapi.client.drive.files.get({
      fileId: folderId,
      fields: 'id,webViewLink'
    });
    return meta.result.webViewLink;
  }

  // >>> ДОБАВЛЕНО: список файлов в папке для миниатюр
  async function listFilesInFolder(folderId, pageSize = 200) {
    await ensureLibrary();
    const res = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize,
      fields: 'files(id,name,mimeType,thumbnailLink,webViewLink,iconLink)'
    });
    return res.result.files || [];
  }

  return {
    loadGapi,
    setAuthToken,
    ensureLibrary,
    createClientFolder,
    uploadToFolder,
    shareFolderPublic,
    listFilesInFolder,    // <-- экспортируем для превью
  };
})();
