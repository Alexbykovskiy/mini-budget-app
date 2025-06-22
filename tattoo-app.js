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
      allEntries.push({ type: 'income', ...doc.data() });
    });
    expenseSnap.forEach(doc => {
      allEntries.push({ type: 'expense', ...doc.data() });
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
          </li>
        `;
      } else if (entry.type === 'expense') {
        historyList.innerHTML += `
          <li class="history-entry expense">
            <div>Расход: <b>${entry.amount} €</b></div>
            <div>Локация: ${entry.location}</div>
            <div>Дата: ${entry.date}</div>
            <div>Категория: ${entry.expenseType}</div>
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


window.addEventListener('DOMContentLoaded', () => {
  loadStudios();
  loadHistory();
});