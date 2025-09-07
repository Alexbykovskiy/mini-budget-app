// drive.js — минимальный helper для Google Drive
// Даём доступ ТОЛЬКО к файлам, созданным приложением: scope drive.file
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const Drive = (() => {
  let inited = false;
  let rootIds = { root: null, clients: null };

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

  async function setAuthToken(accessToken) {
    gapi.client.setToken({ access_token: accessToken });
  }

  // создаёт папку, если её нет; возвращает id
  async function ensureFolder(name, parentId = 'root') {
    // ищем по имени
    const q = `'${parentId}' in parents and name='${name.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await gapi.client.drive.files.list({ q, fields:'files(id,name)' });
    if (res.result.files?.length) return res.result.files[0].id;

    // создаём
    const meta = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    };
    const created = await gapi.client.drive.files.create({
      resource: meta,
      fields: 'id,name'
    });
    return created.result.id;
  }

  async function ensureLibrary() {
    if (inited) return rootIds;
    // корень (можно оставить root, но лучше создать "TattooCRM")
    rootIds.root = await ensureFolder('TattooCRM');
    rootIds.clients = await ensureFolder('clients', rootIds.root);
    inited = true;
    return rootIds;
  }

  async function createClientFolder(clientId, displayName) {
    await ensureLibrary();
    const safeName = `${clientId}__${(displayName||'Без_имени').replace(/\s+/g,'_')}`;
    const folderId = await ensureFolder(safeName, rootIds.clients);
    return folderId;
  }

  async function uploadToFolder(folderId, file) {
    // multipart upload
    const metadata = {
      name: file.name,
      parents: [folderId]
    };
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;

    const reader = await file.arrayBuffer();
    const contentType = file.type || 'application/octet-stream';
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(reader)));

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
    return res.result;
  }

  async function shareFolderPublic(folderId){
    // доступ «по ссылке – просмотр»
    await gapi.client.drive.permissions.create({
      fileId: folderId,
      resource: { role: 'reader', type: 'anyone' }
    });
    // получить webViewLink:
    const meta = await gapi.client.drive.files.get({ fileId: folderId, fields: 'id,webViewLink' });
    return meta.result.webViewLink;
  }

  return {
    loadGapi, setAuthToken,
    ensureLibrary, createClientFolder, uploadToFolder, shareFolderPublic
  };
})();