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
  snap.forEach(doc => {
    studios.push({ id: doc.id, ...doc.data() });
  });
  renderStudioOptions(); // <-- добавь сюда
  renderStudioSelect && renderStudioSelect();
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
    closeAddStudioModal();
    loadStudios();
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
      // Заполняем поля дохода
      document.getElementById('income-location').value = data.location;
      document.getElementById('income-date').value = data.date;
      document.getElementById('income-amount').value = data.amount;
      document.getElementById('work-type').value = data.workType;
      document.getElementById('is-invoice').checked = !!data.isInvoice;

      // Визуально подсветить форму (например, добавить класс .editing)
      document.querySelector('.form-section').classList.add('editing');
    } else if (type === 'expense') {
      const doc = await db.collection('expenses').doc(id).get();
      const data = doc.data();
      document.getElementById('expense-location').value = data.location;
      document.getElementById('expense-date').value = data.date;
      document.getElementById('expense-amount').value = data.amount;
      document.getElementById('expense-type').value = data.expenseType;

      // Визуально подсветить форму (найти первый блок с h2 = 'Добавить расход')
      document.querySelectorAll('.block').forEach(block => {
        if (block.querySelector('h2')?.textContent.includes('Добавить расход')) {
          block.classList.add('editing');
        }
      });
    }
  });
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
  const modal = document.getElementById('studio-modal');
  modal.style.display = 'flex';
  const nameInput = document.getElementById('studio-name');
  const colorInput = document.getElementById('studio-color');
  const datalist = document.getElementById('studio-list');
  const deleteBtn = document.getElementById('delete-studio-btn');
  nameInput.value = "";
  colorInput.value = "#3fa9f5";
  deleteBtn.style.display = "none";


  // Найти текущую студию по умолчанию
  const currentDefaultStudio = studios.find(s => s.isDefault);

  // Заполняем datalist студий
  datalist.innerHTML = studios.map(s => `<option value="${s.name}">`).join('');

  if (studioIdx !== null && studios[studioIdx]) {
    nameInput.value = studios[studioIdx].name;
    colorInput.value = studios[studioIdx].color;
    defaultSwitch.checked = !!studios[studioIdx].isDefault;
    deleteBtn.style.display = "block";
    // Свитч только доступен, если это студия по умолчанию или сейчас нет другой студии по умолчанию
    if (
      currentDefaultStudio &&
      !studios[studioIdx].isDefault
    ) {
      defaultSwitch.disabled = true;
      defaultSwitch.classList.add('switch-disabled');
    } else {
      defaultSwitch.disabled = false;
      defaultSwitch.classList.remove('switch-disabled');
    }
    // ...
  } else {
    defaultSwitch.checked = false;
    if (currentDefaultStudio) {
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
      alert('Студия по умолчанию: "' + currentDefaultStudio.name + '"');
      return false;
    }
  };

  // ...остальной код (цвет, удаление и т.д.)
}


  // Заполняем datalist студий
  datalist.innerHTML = studios.map(s => `<option value="${s.name}">`).join('');

  // Если редактируем — автозаполняем поля
  if (studioIdx !== null && studios[studioIdx]) {
    nameInput.value = studios[studioIdx].name;
    colorInput.value = studios[studioIdx].color;
    deleteBtn.style.display = "block";
    deleteBtn.onclick = function() {
      if (confirm(`Удалить студию "${studios[studioIdx].name}"?`)) {
        studios.splice(studioIdx, 1);
        closeStudioModal();
        renderStudioSelect();
        if (typeof renderStudioList === "function") renderStudioList();
      }
    };
  } else {
    deleteBtn.style.display = "none";
    deleteBtn.onclick = null;
  }

  // При вводе — если студия уже есть, автозаполнить цвет
  nameInput.oninput = function() {
    const idx = studios.findIndex(s => s.name.toLowerCase() === nameInput.value.trim().toLowerCase());
if (idx >= 0) {
  colorInput.value = studios[idx].color;
  deleteBtn.style.display = "block";
  deleteBtn.onclick = function() {
    if (confirm(`Удалить студию "${studios[idx].name}"?`)) {
      const id = studios[idx].id;
      db.collection('studios').doc(id).delete()
        .then(() => {
          closeStudioModal();
          loadStudios(); // подгрузить новый актуальный список после удаления
        })
        .catch(e => alert('Ошибка при удалении студии: ' + e.message));
    }
  };
} else {
  colorInput.value = "#3fa9f5";
  deleteBtn.style.display = "none";
  deleteBtn.onclick = null;
}
  };
}

// Скрыть модалку
function closeStudioModal() {
  document.getElementById('studio-modal').style.display = 'none';
}

// Обработка формы
document.getElementById('studio-form').onsubmit = async function(e) {
  e.preventDefault();
  const name = document.getElementById('studio-name').value.trim();
  const color = document.getElementById('studio-color').value;
  if (!name) return;

  let idx = studios.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    // Обновляем существующую студию в Firestore
    const id = studios[idx].id;
    await db.collection('studios').doc(id).update({ color });
  } else {
    // Добавляем новую студию в Firestore
    await db.collection('studios').add({ name, color });
  }
  closeStudioModal();
  loadStudios();
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
  await db.collection('trips').doc(currentTripId).delete();
  // После удаления обновить календарь
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





window.addEventListener('DOMContentLoaded', () => {
  loadStudios();
  loadHistory();
});