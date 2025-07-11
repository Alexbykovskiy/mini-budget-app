// Инициализация Firebase
// вставь сюда свой firebaseConfig

// firebaseConfig.js
const firebaseConfig = {
  apiKey: "AIzaSyBzHEcrGfwek6FzguWbSGSfMgebMy1sBe8",
  authDomain: "minibudget-4e474.firebaseapp.com",
  projectId: "minibudget-4e474",
  storageBucket: "minibudget-4e474.appspot.com",
  messagingSenderId: "306275735842",
  appId: "1:306275735842:web:740615c23059e97cd36d7b"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Загрузка студий из Firestore
async function loadStudios() {
  studios = [];
  const snap = await db.collection('studios').get();
  snap.forEach(doc => studios.push({ id: doc.id, ...doc.data() }));

  const def = studios.find(s => s.isDefault);
  if (def) await ensureDefaultCover(def);

  renderStudioOptions();
  renderStudioSelect?.();
  if (typeof renderStudioList === "function") renderStudioList();
}
function renderStudioOptions() {
  // Для доходов
  const incomeSel = document.getElementById('income-location');
  if (incomeSel) {
    incomeSel.innerHTML = studios.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
  }
  // Для расходов (если нужно — можно дублировать)
  const expenseSel = document.getElementById('expense-location');
  if (expenseSel) {
    expenseSel.innerHTML = studios.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
  }
}

function renderStudiosSummary() {
  const summary = document.getElementById('studios-summary');
  if (!summary) return;
  if (!studios.length) {
    summary.innerHTML = '<span style="color:#bbb;">Нет добавленных студий</span>';
    return;
  }
  summary.innerHTML = studios.map((s, i) =>
    `<span class="studio-pill${s.isDefault ? ' default' : ''}" 
            data-idx="${i}" 
            style="background:${s.isDefault ? '' : (s.color || '#4444')}; cursor:pointer;"
            title="Выбрать эту студию">
        ${s.isDefault ? `<svg viewBox="0 0 20 20" width="18" height="18" style="vertical-align:-2.5px; margin-right:5px; fill:#fff; display:inline-block;">
          <path d="M2 10.2 10 3l8 7.2V17a1 1 0 0 1-1 1h-4.2A.8.8 0 0 1 12 17.2V14a2 2 0 0 0-4 0v3.2c0 .44-.36.8-.8.8H3a1 1 0 0 1-1-1v-6.8z" fill="#fff"/>
          <path d="M2.7 9.5a1 1 0 0 1 1.4-1.4L10 4.14l5.9 4.96a1 1 0 1 1-1.3 1.52L10 6.26 4.04 9.58a1 1 0 0 1-1.34-.08z" fill="#ffa35c"/>
        </svg>` : ''}
        ${s.name}${s.isDefault ? ' — по умолчанию' : ''}
    </span>`
  ).join('');

  // Добавим обработчик клика:
  summary.querySelectorAll('.studio-pill').forEach(pill => {
    pill.addEventListener('click', function() {
      const idx = pill.getAttribute('data-idx');
      const select = document.getElementById('studio-select');
      if (select && idx !== null) {
        select.selectedIndex = idx;
        select.dispatchEvent(new Event('change'));
      }
    });
  });
}

async function addIncome() {
  const location = document.getElementById('income-location').value;
  const date = document.getElementById('income-date').value;
  const amount = parseFloat(document.getElementById('income-amount').value);
  const workType = document.getElementById('work-type').value;
  const isInvoice = document.getElementById('is-invoice').checked;

  // Простая валидация
  if (!location || !date || !amount || !workType) {
    alert('Пожалуйста, заполните все поля!');
    return;
  }

  try {
    await db.collection('incomes').add({
      location,
      date,
      amount,
      workType,
      isInvoice,
      created: new Date().toISOString()
    });
    // Очищаем поля после добавления
    document.getElementById('income-location').value = '';
    document.getElementById('income-date').value = '';
    document.getElementById('income-amount').value = '';
    document.getElementById('work-type').value = '';
    document.getElementById('is-invoice').checked = false;

    // Перезагружаем историю
    loadHistory();
  } catch (e) {
    alert('Ошибка при добавлении дохода: ' + e.message);
  }
}

let studios = [];
let trips = [];
let currentTripId = null; // Для отслеживания, редактируем ли поездку
let currentEdit = null; // {type: 'income'|'expense', id: '...'}

async function showCalendar() {
  document.getElementById('calendar-modal').style.display = 'flex';
  renderStudioSelect();
  await loadTrips();

  // Если календарь уже был — уничтожить его перед созданием заново!
  if (window.fcInstance) {
    window.fcInstance.destroy();
    window.fcInstance = null;
  }

 setTimeout(() => {
  window.fcInstance = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: 'dayGridMonth',
    selectable: true,
    events: trips,
    height: 410,
    headerToolbar: { left: 'title', center: '', right: 'today prev,next' },
    locale: 'ru',
    eventClick: function(info) {
      const event = info.event;
      const studioName = event.title;
      const startDate = event.startStr.slice(0, 10);
      // End в календаре эксклюзивно: вычесть 1 день!
      const endDate = event.endStr
        ? (new Date(+event.end - 24 * 3600 * 1000)).toISOString().slice(0, 10)
        : startDate;
      // Найти студию по имени
      const studioIdx = studios.findIndex(s => s.name === studioName);
      document.getElementById('studio-select').value = studioIdx;
      document.getElementById('trip-date-from').value = startDate;
      document.getElementById('trip-date-to').value = endDate;
      currentTripId = event.extendedProps.id;
      // Показать кнопку-корзину для удаления
      document.getElementById('delete-trip-btn').style.display = "";
    }
  });
  window.fcInstance.render();
}, 1);
}

  function closeCalendar() {
  document.getElementById('calendar-modal').style.display = 'none';
  if (window.fcInstance) window.fcInstance.destroy(), window.fcInstance = null;
}
function renderStudioSelect() {
  const sel = document.getElementById('studio-select');
  sel.innerHTML = '';
  studios.forEach((s, i) => {
    sel.innerHTML += `<option value="${i}" style="color:${s.color}">${s.name}</option>`;
  });
}
function showAddStudioModal() {
  document.getElementById('add-studio-modal').style.display = 'flex';
}
function closeAddStudioModal() {
  document.getElementById('add-studio-modal').style.display = 'none';
}
async function addNewStudio() {
  const name = document.getElementById('new-studio-name').value.trim();
  const color = document.getElementById('new-studio-color').value;
  if (name) {
    await db.collection('studios').add({ name, color });
    await loadStudios();
    closeAddStudioModal();
  }
}
async function loadTrips() {
  trips = [];
  const snap = await db.collection('trips').get();
  snap.forEach(doc => {
    const data = doc.data();
    trips.push({
      id: doc.id,
      title: data.studio,
      start: data.start,
      end: data.end,
      color: data.color,
      extendedProps: { id: doc.id } // <-- это обязательно для идентификации!
    });
  });
}


async function loadHistory() {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;
  historyList.innerHTML = '<li style="color:#bbb">Загрузка...</li>';

  try {
    // Получаем доходы и расходы
    const [incomeSnap, expenseSnap] = await Promise.all([
      db.collection('incomes').orderBy('created', 'desc').get(),
      db.collection('expenses').orderBy('created', 'desc').get()
    ]);

    // Собираем все записи в один массив
    let allEntries = [];
   incomeSnap.forEach(doc => {
  allEntries.push({ type: 'income', id: doc.id, ...doc.data() });
});
expenseSnap.forEach(doc => {
  allEntries.push({ type: 'expense', id: doc.id, ...doc.data() });
});

    // Сортируем по дате (убывание)
    allEntries.sort((a, b) => (b.created > a.created ? 1 : -1));

    if (allEntries.length === 0) {
      historyList.innerHTML = '<li style="color:#bbb">Нет записей</li>';
      return;
    }

    // Рендерим историю
    historyList.innerHTML = '';
    allEntries.forEach(entry => {
      if (entry.type === 'income') {
  historyList.innerHTML += `
    <li class="history-entry income">
      <div>Доход: <b>${entry.amount} €</b> ${entry.isInvoice ? '(Фактура)' : ''}</div>
      <div>Студия: ${entry.location}</div>
      <div>Дата: ${entry.date}</div>
      <div>Тип: ${entry.workType}</div>
      <button class="edit-entry-btn" data-type="income" data-id="${entry.id}">✎</button>
    </li>
  `;
// После рендера карточек истории:
document.querySelectorAll('.edit-entry-btn').forEach(btn => {
  btn.addEventListener('click', async function() {
    const type = btn.getAttribute('data-type');
    const id = btn.getAttribute('data-id');
    currentEdit = { type, id };
renderEditActions();

if (type === 'income') {
  // (тут заполнение полей)
  // ...  
  document.querySelector('.form-section').classList.add('editing');
  // Прокрутка к блоку "Добавить доход"
  document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
} else if (type === 'expense') {
  // (тут заполнение полей)
  // ...
  document.querySelectorAll('.block').forEach(block => {
    if (block.querySelector('h2')?.textContent.includes('Добавить расход')) {
      block.classList.add('editing');
      // Прокрутка к блоку "Добавить расход"
      block.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

if (type === 'income') {
  const doc = await db.collection('incomes').doc(id).get();
  const data = doc.data();

  // Заполняем поля дохода только если они есть в DOM
  const elLoc = document.getElementById('income-location');
  const elDate = document.getElementById('income-date');
  const elAmount = document.getElementById('income-amount');
  const elType = document.getElementById('work-type');
  const elInvoice = document.getElementById('is-invoice');
  if (elLoc) elLoc.value = data.location;
  if (elDate) elDate.value = data.date;
  if (elAmount) elAmount.value = data.amount;
  if (elType) elType.value = data.workType;
  if (elInvoice) elInvoice.checked = !!data.isInvoice;

  // Визуально подсветить форму (например, добавить класс .editing)
  document.querySelector('.form-section').classList.add('editing');
}
 else if (type === 'expense') {
  const doc = await db.collection('expenses').doc(id).get();
  const data = doc.data();

  const elLoc = document.getElementById('expense-location');
  const elDate = document.getElementById('expense-date');
  const elAmount = document.getElementById('expense-amount');
  const elType = document.getElementById('expense-type');
  if (elLoc) elLoc.value = data.location;
  if (elDate) elDate.value = data.date;
  if (elAmount) elAmount.value = data.amount;
  if (elType) elType.value = data.expenseType;

  // Визуально подсветить форму (найти первый блок с h2 = 'Добавить расход')
  document.querySelectorAll('.block').forEach(block => {
    if (block.querySelector('h2')?.textContent.includes('Добавить расход')) {
      block.classList.add('editing');
    }
  });
}  });
});



} else if (entry.type === 'expense') {
  historyList.innerHTML += `
    <li class="history-entry expense">
      <div>Расход: <b>${entry.amount} €</b></div>
      <div>Локация: ${entry.location}</div>
      <div>Дата: ${entry.date}</div>
      <div>Категория: ${entry.expenseType}</div>
      <button class="edit-entry-btn" data-type="expense" data-id="${entry.id}">✎</button>
    </li>
  `;
}
    });
  } catch (e) {
    historyList.innerHTML = `<li style="color:red">Ошибка загрузки истории: ${e.message}</li>`;
  }
}

async function addExpense() {
  const location = document.getElementById('expense-location').value;
  const date = document.getElementById('expense-date').value;
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const expenseType = document.getElementById('expense-type').value;

  // Простая валидация
  if (!location || !date || !amount || !expenseType) {
    alert('Пожалуйста, заполните все поля!');
    return;
  }

  try {
    await db.collection('expenses').add({
      location,
      date,
      amount,
      expenseType,
      created: new Date().toISOString()
    });

    // Очищаем поля после добавления
    document.getElementById('expense-location').value = '';
    document.getElementById('expense-date').value = '';
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-type').value = '';

    // Перезагружаем историю
    loadHistory();
  } catch (e) {
    alert('Ошибка при добавлении расхода: ' + e.message);
  }
}


// Открыть модалку для новой или существующей студии
function showStudioModal(studioIdx = null) {
  const modal      = document.getElementById('studio-modal');
  modal.style.display = 'flex';

  const nameInput  = document.getElementById('studio-name');
  const colorInput = document.getElementById('studio-color');
  const datalist   = document.getElementById('studio-list');
  const deleteBtn  = document.getElementById('delete-studio-btn');
  const defaultSwitch = document.getElementById('studio-default-switch'); // ← новая строка
  nameInput.value = "";
  colorInput.value = "#3fa9f5";
  deleteBtn.style.display = "none";


  // Найти текущую студию по умолчанию
  const currentDefaultStudio = studios.find(s => s.isDefault);

// Универсальный поиск студии: по индексу, по выбранному селектору, по имени в поле ввода
let studio = null;
if (studioIdx !== null && studios[studioIdx]) {
  studio = studios[studioIdx];
} else {
  // ищем по выбранному значению селектора, если есть
  const sel = document.getElementById('studio-select');
  let selIdx = sel && sel.selectedIndex >= 0 ? sel.selectedIndex : null;
  if (selIdx !== null && studios[selIdx]) {
    studio = studios[selIdx];
  } else if (nameInput.value) {
    studio = studios.find(s => s.name.trim().toLowerCase() === nameInput.value.trim().toLowerCase());
  }
}
if (studio) {
  nameInput.value = studio.name;
  colorInput.value = studio.color;
  defaultSwitch.checked = !!studio.isDefault;
  deleteBtn.style.display = "block";
  deleteBtn.onclick = async function() {
    if (confirm(`Удалить студию "${studio.name}"?`)) {
      try {
        await db.collection('studios').doc(studio.id).delete();
        await loadStudios();
        closeStudioModal();
      } catch(e) {
        alert('Ошибка при удалении студии: ' + e.message);
      }
    }
  };

  const countDefault = studios.filter(s => s.isDefault).length;
  if (studio.isDefault) {
    defaultSwitch.disabled = false;
    defaultSwitch.classList.remove('switch-disabled');
  } else if (countDefault > 0) {
    defaultSwitch.disabled = true;
    defaultSwitch.classList.add('switch-disabled');
  } else {
    defaultSwitch.disabled = false;
    defaultSwitch.classList.remove('switch-disabled');
  }
} else {
  defaultSwitch.checked = false;
  const countDefault = studios.filter(s => s.isDefault).length;
  if (countDefault > 0) {
    defaultSwitch.disabled = true;
    defaultSwitch.classList.add('switch-disabled');
  } else {
    defaultSwitch.disabled = false;
    defaultSwitch.classList.remove('switch-disabled');
  }
  deleteBtn.style.display = "none";
  deleteBtn.onclick = null;
}

// При клике на недоступный свитч — показать подсказку!
defaultSwitch.onclick = function() {
  if (defaultSwitch.disabled) {
    const currentDefaultStudio = studios.find(s => s.isDefault);
    if (currentDefaultStudio) {
      alert('Студия по умолчанию: "' + currentDefaultStudio.name + '"');
    }
    return false;
  }
};






  // При вводе — если студия уже есть, автозаполнить цвет
  nameInput.oninput = function() {
    const idx = studios.findIndex(s => s.name.toLowerCase() === nameInput.value.trim().toLowerCase());
if (idx >= 0) {
  colorInput.value = studios[idx].color;
  deleteBtn.style.display = "block";
 deleteBtn.onclick = async function() {
  if (confirm(`Удалить студию "${studio.name}"?`)) {
    try {
      // Если студия была дефолтной — удалить ковёр для нее из trips
      if (studio.isDefault) {
        const q = await db.collection('trips')
          .where('studio','==', studio.name)
          .where('isDefaultCover','==', true).get();
        const batch = db.batch();
        q.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      // Удаляем саму студию
      await db.collection('studios').doc(studio.id).delete();
      await loadStudios();
      closeStudioModal();
    } catch(e) {
      alert('Ошибка при удалении студии: ' + e.message);
    }
  }
};
} else {
  colorInput.value = "#3fa9f5";
  deleteBtn.style.display = "none";
  deleteBtn.onclick = null;
}
};              // конец nameInput.oninput
}               // ← ДОБАВЬ ЭТУ СТРОКУ! конец showStudioModal
// Скрыть модалку
function closeStudioModal() {
  document.getElementById('studio-modal').style.display = 'none';
}

// Обработка формы
document.getElementById('studio-form').onsubmit = async function(e) {
  e.preventDefault();
  const name = document.getElementById('studio-name').value.trim();
  const color = document.getElementById('studio-color').value;
  const isDefault = document.getElementById('studio-default-switch').checked;
  if (!name) return;

  let idx = studios.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
  let id = idx >= 0 ? studios[idx].id : null;

  // 1. Если снимаем чекбокс — явно сбрасываем isDefault у текущей студии
  if (!isDefault && idx >= 0 && studios[idx].isDefault) {
  await db.collection('studios').doc(id).update({ color, isDefault: false });

  // После снятия флажка — удалить ковер (trips с isDefaultCover: true для этой студии)
  const q = await db.collection('trips')
    .where('studio','==', studios[idx].name)
    .where('isDefaultCover','==', true).get();
  const batch = db.batch();
  q.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

  // 2. Если ставим чекбокс — снимаем isDefault у всех других
  if (isDefault) {
    const updates = studios.filter(s => s.isDefault && s.name !== name)
      .map(s => db.collection('studios').doc(s.id).update({ isDefault: false }));
    await Promise.all(updates);

    if (idx >= 0) {
      await db.collection('studios').doc(id).update({ color, isDefault: true });
    } else {
      await db.collection('studios').add({ name, color, isDefault: true });
    }
  } else if (idx < 0) {
    // 3. Если добавляем новую студию без дефолта
    await db.collection('studios').add({ name, color, isDefault: false });
  }

    await loadStudios();
  await loadTrips(); // <-- ЭТО
  if (window.fcInstance) {
    window.fcInstance.removeAllEvents();
    trips.forEach(event => window.fcInstance.addEvent(event));
  }
  closeStudioModal();
};
async function addTripByDates() {
  const studioIdx = document.getElementById('studio-select').value;
  const studio = studios[studioIdx];
  const dateFrom = document.getElementById('trip-date-from').value;
  const dateTo = document.getElementById('trip-date-to').value;
  if (!studio || !dateFrom || !dateTo) {
    alert('Выберите студию и обе даты!');
    return;
  }

  if (currentTripId) {
    // Редактирование существующей поездки
    await db.collection('trips').doc(currentTripId).update({
      studio: studio.name,
      color: studio.color,
      start: dateFrom,
      end: addDays(dateTo, 1)
    });
    currentTripId = null; // После обновления сбрасываем!
  } else {
    // Новая поездка
    await db.collection('trips').add({
      studio: studio.name,
      color: studio.color,
      start: dateFrom,
      end: addDays(dateTo, 1),
      created: new Date().toISOString()
    });
  }

// Обрезаем ковёр дефолт-студии, если выбрана не дефолт-студия!
  const def = studios.find(s => s.isDefault);
  if (def && def.name !== studio.name) {
    await clipDefaultCover(dateFrom, addDays(dateTo, 1));
  }

  // Обновить календарь
  if (window.fcInstance) {
    await loadTrips();
    window.fcInstance.removeAllEvents();
    trips.forEach(event => window.fcInstance.addEvent(event));
  }

  // Сбросить поля и скрыть кнопку удаления
  document.getElementById('trip-date-from').value = '';
  document.getElementById('trip-date-to').value = '';
  document.getElementById('delete-trip-btn').style.display = "none";
currentTripId = null;
}

// Вспомогательная функция для вычисления end (эксклюзивно)
function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

async function deleteTripById() {
  if (!currentTripId) return;
  if (!confirm('Удалить поездку?')) return;

  // 1. Получаем диапазон удаляемой поездки
  const docSnap = await db.collection('trips').doc(currentTripId).get();
  const data = docSnap.exists ? docSnap.data() : null;
  const start = data ? data.start : null;
  const end = data ? data.end : null;
  const studioName = data ? data.studio : null;

  // 2. Удаляем поездку
  await db.collection('trips').doc(currentTripId).delete();

  // 3. Если это НЕ дефолт-студия, восстанавливаем ковёр
  const def = studios.find(s => s.isDefault);
if (def && def.name !== studioName && start && end) {
  await mergeDefaultCover(start, end);
  await new Promise(r => setTimeout(r, 250)); // <-- эта строка!
}

if (window.fcInstance) {
  await loadTrips();
  window.fcInstance.removeAllEvents();
  trips.forEach(event => window.fcInstance.addEvent(event));
}
  // Очистить всё
  document.getElementById('trip-date-from').value = '';
  document.getElementById('trip-date-to').value = '';
  currentTripId = null;
  document.getElementById('delete-trip-btn').style.display = "none";
}

function onIncomeConfirm() {
  if (currentEdit && currentEdit.type === 'income') {
    saveIncomeEdit();
  } else {
    addIncome();
  }
}

function onExpenseConfirm() {
  if (currentEdit && currentEdit.type === 'expense') {
    saveExpenseEdit();
  } else {
    addExpense();
  }
}


async function saveIncomeEdit() {
  if (!currentEdit || currentEdit.type !== 'income') return;
  const location = document.getElementById('income-location').value;
  const date = document.getElementById('income-date').value;
  const amount = parseFloat(document.getElementById('income-amount').value);
  const workType = document.getElementById('work-type').value;
  const isInvoice = document.getElementById('is-invoice').checked;
  if (!location || !date || !amount || !workType) {
    alert('Пожалуйста, заполните все поля!');
    return;
 renderEditActions();
  }
  try {
    await db.collection('incomes').doc(currentEdit.id).update({
      location, date, amount, workType, isInvoice
    });
    clearIncomeForm();
    currentEdit = null;
    document.querySelector('.form-section').classList.remove('editing');
    loadHistory();
  } catch (e) {
    alert('Ошибка при сохранении: ' + e.message);
  }
}

async function saveExpenseEdit() {
  if (!currentEdit || currentEdit.type !== 'expense') return;
  const location = document.getElementById('expense-location').value;
  const date = document.getElementById('expense-date').value;
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const expenseType = document.getElementById('expense-type').value;
  if (!location || !date || !amount || !expenseType) {
    alert('Пожалуйста, заполните все поля!');
    return;
renderEditActions();
  }
  try {
    await db.collection('expenses').doc(currentEdit.id).update({
      location, date, amount, expenseType
    });
    clearExpenseForm();
    currentEdit = null;
    document.querySelectorAll('.block').forEach(block => {
      if (block.querySelector('h2')?.textContent.includes('Добавить расход')) {
        block.classList.remove('editing');
      }
    });
    loadHistory();
  } catch (e) {
    alert('Ошибка при сохранении: ' + e.message);
  }
}

function cancelIncome() {
  clearIncomeForm();
  currentEdit = null;
  document.querySelector('.form-section').classList.remove('editing');
 renderEditActions();
}
function clearIncomeForm() {
  document.getElementById('income-location').value = '';
  document.getElementById('income-date').value = '';
  document.getElementById('income-amount').value = '';
  document.getElementById('work-type').value = '';
  document.getElementById('is-invoice').checked = false;
}

function cancelExpense() {
  clearExpenseForm();
  currentEdit = null;
  document.querySelectorAll('.block').forEach(block => {
    if (block.querySelector('h2')?.textContent.includes('Добавить расход')) {
      block.classList.remove('editing');
renderEditActions();
    }
  });
}
function clearExpenseForm() {
  document.getElementById('expense-location').value = '';
  document.getElementById('expense-date').value = '';
  document.getElementById('expense-amount').value = '';
  document.getElementById('expense-type').value = '';
}

function renderEditActions() {
  // Для ДОХОДА
  const incActions = document.getElementById('income-edit-actions');
  if (incActions) {
    if (currentEdit && currentEdit.type === 'income') {
      incActions.innerHTML = `<button class="delete-entry-btn" onclick="deleteIncomeEdit()">Удалить</button>`;
    } else {
      incActions.innerHTML = '';
    }
  }
  // Для РАСХОДА
  const expActions = document.getElementById('expense-edit-actions');
  if (expActions) {
    if (currentEdit && currentEdit.type === 'expense') {
      expActions.innerHTML = `<button class="delete-entry-btn" onclick="deleteExpenseEdit()">Удалить</button>`;
    } else {
      expActions.innerHTML = '';
    }
  }
}

async function deleteIncomeEdit() {
  if (!currentEdit || currentEdit.type !== 'income') return;
  if (!confirm('Удалить этот доход?')) return;
  try {
    await db.collection('incomes').doc(currentEdit.id).delete();
    clearIncomeForm();
    currentEdit = null;
    document.querySelector('.form-section').classList.remove('editing');
    renderEditActions();
    loadHistory();
  } catch (e) {
    alert('Ошибка при удалении: ' + e.message);
  }
}

async function deleteExpenseEdit() {
  if (!currentEdit || currentEdit.type !== 'expense') return;
  if (!confirm('Удалить этот расход?')) return;
  try {
    await db.collection('expenses').doc(currentEdit.id).delete();
    clearExpenseForm();
    currentEdit = null;
    document.querySelectorAll('.block').forEach(block => {
      if (block.querySelector('h2')?.textContent.includes('Добавить расход')) {
        block.classList.remove('editing');
      }
    });
    renderEditActions();
    loadHistory();
  } catch (e) {
    alert('Ошибка при удалении: ' + e.message);
  }
}

// Создать дефолтный "ковёр" для студии по умолчанию, если его нет
async function ensureDefaultCover(defStudio) {
  const q = await db.collection('trips')
        .where('studio','==', defStudio.name)
        .where('isDefaultCover','==', true).limit(1).get();
  if (q.empty) {
    await db.collection('trips').add({
      studio: defStudio.name,
      color : defStudio.color,
      start : '1900-01-01',          // максимально большой диапазон
      end   : '2100-01-01',
      isDefaultCover: true,
      created: new Date().toISOString()
    });
  }
}

// Обрезать ковёр дефолт-студии при добавлении новой поездки другой студии
async function clipDefaultCover(start, end) {
  const def = studios.find(s => s.isDefault);
  if (!def) return;
  const snap = await db.collection('trips')
        .where('studio','==', def.name)
        .where('isDefaultCover','==', true).limit(1).get();
  if (snap.empty) return;
  const doc = snap.docs[0];
  const data = doc.data();
  if (start <= data.end && end >= data.start) {
    await db.runTransaction(async t => {
      t.delete(doc.ref);
      if (start > data.start) {
        t.set(db.collection('trips').doc(), {
          studio: def.name, color: def.color,
          start : data.start, end: start,
          isDefaultCover: true
        });
      }
      if (end < data.end) {
        t.set(db.collection('trips').doc(), {
          studio: def.name, color: def.color,
          start : end, end: data.end,
          isDefaultCover: true
        });
      }
    });
  }
}

// Восстанавливает ковёр дефолт-студии при удалении поездки другой студии
async function mergeDefaultCover(start, end) {
  const def = studios.find(s => s.isDefault);
  if (!def) return;
  const partsSnap = await db.collection('trips')
      .where('studio','==',def.name)
      .where('isDefaultCover','==',true)
      .orderBy('start').get();
  let left = start, right = end, toDelete=[];
  partsSnap.forEach(d=>{
    const p = d.data();
    if (p.end === start) { left = p.start; toDelete.push(d.id); }
    if (p.start === end) { right = p.end;  toDelete.push(d.id); }
  });
  await db.runTransaction(async t=>{
    toDelete.forEach(id=>t.delete(db.collection('trips').doc(id)));
    t.set(db.collection('trips').doc(),{
      studio:def.name,color:def.color,
      start:left,end:right,isDefaultCover:true
    });
  });
}


window.addEventListener('DOMContentLoaded', () => {
  loadStudios();
  loadHistory();
});


