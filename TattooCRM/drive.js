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
  // Было: async function uploadToFolder(folderId, file) { ...multipart... }
async function uploadToFolder(folderId, file) {
  // Если больше 4 МБ — используем резюмируемый аплоад
  if (file.size > 4 * 1024 * 1024) {
    return uploadResumable(folderId, file);
  }

  // ----- существующая multipart-реализация ниже (оставь как было) -----
  const metadata = { name: file.name, parents: [folderId] };
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

  const meta = await gapi.client.drive.files.get({
    fileId: res.result.id,
    fields: 'id,name,mimeType,thumbnailLink,webViewLink,iconLink'
  });
  return meta.result;
}

// ВНИМАНИЕ: вставь это в drive.js рядом с другими функциями

async function uploadResumable(folderId, file) {
  // 1) Инициируем сессию
  const token = gapi.client.getToken()?.access_token;
  if (!token) throw new Error('No OAuth token for Drive');

  const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': file.type || 'application/octet-stream',
      'X-Upload-Content-Length': String(file.size),
    },
    body: JSON.stringify({
      name: file.name,
      parents: [folderId]
    })
  });

  if (!initRes.ok) {
    const txt = await initRes.text().catch(()=> '');
    throw new Error('Init resumable failed: ' + txt);
  }
  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('No resumable upload URL');

  // 2) Отправляем файл одной порцией (можно нарезать на чанки, но обычно хватает)
  const buf = await file.arrayBuffer();
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Length': String(file.size),
    },
    body: buf
  });

  if (!putRes.ok) {
    const txt = await putRes.text().catch(()=> '');
    throw new Error('Resumable PUT failed: ' + txt);
  }
  const info = await putRes.json();

  // 3) Дотягиваем мету (thumbnailLink/webViewLink)
  const meta = await gapi.client.drive.files.get({
    fileId: info.id,
    fields: 'id,name,mimeType,thumbnailLink,webViewLink,iconLink'
  });
  return meta.result;
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

// Пометить файл/папку как "в корзине"
async function moveToTrash(fileId) {
  await gapi.client.drive.files.update({
    fileId,
    resource: { trashed: true }
  });
}

// Рекурсивно отправить в корзину все содержимое папки и саму папку
async function deleteFolderRecursive(folderId) {
  // сначала дочерние элементы
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,mimeType)'
  });
  const items = res.result.files || [];
  for (const it of items) {
    const isFolder = it.mimeType === 'application/vnd.google-apps.folder';
    if (isFolder) {
      await deleteFolderRecursive(it.id);
    } else {
      await moveToTrash(it.id);
    }
  }
  // затем сама папка
  await moveToTrash(folderId);
}

  return {
    loadGapi,
deleteFolderRecursive, // <-- добавить в экспорт
    setAuthToken,
    ensureLibrary,
    createClientFolder,
    uploadToFolder,
    shareFolderPublic,
    listFilesInFolder,    // <-- экспортируем для превью
  };
})();
