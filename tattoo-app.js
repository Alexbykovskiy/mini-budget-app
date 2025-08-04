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

function renderGuestSpotsSummary() {
  const summary = document.getElementById('studios-guest-summary');
  if (!summary) return;

  // Собираем guest spots и длинные default covers (> 3 дней)
  let tripsForList = trips.filter(trip => {
    const studio = studios.find(s => s.name === trip.title);
    if (!studio) return false;
    if (trip.isDefaultCover) {
      // вычисляем длину периода
      const days = (new Date(trip.end) - new Date(trip.start)) / (1000 * 60 * 60 * 24);
      return days > 3; // только длинные дефолтные периоды
    }
    return !studio.isDefault && !trip.isDefaultCover; // обычные guest spots
  });

  if (!tripsForList.length) {
    summary.innerHTML = `<div style="opacity:.5;text-align:center">Нет поездок или длинных периодов по умолчанию</div>`;
    return;
  }

  // Сортировка по старту (старые выше)
  tripsForList.sort((a, b) => a.start.localeCompare(b.start));

  // Сегодня
  const todayStr = new Date().toISOString().slice(0, 10);

  // Найти "текущий" (сегодня внутри диапазона)
  let currentIdx = tripsForList.findIndex(trip => trip.start <= todayStr && todayStr < trip.end);
  if (currentIdx === -1) {
    currentIdx = tripsForList.findIndex(trip => trip.start > todayStr);
    if (currentIdx === -1) currentIdx = tripsForList.length - 1;
  }

  // Формат дат
  const fmt = d => {
    const [y, m, dd] = d.split('-');
    return `${dd}.${m}.${y}`;
  };

summary.innerHTML = `
  <div class="guest-spot-scrollbox" style="max-height:222px;overflow-y:auto;padding-right:3px;">
    ${
      tripsForList.map((trip, i) => {
        const studio = studios.find(s => s.name === trip.title);
        const dateTo = (new Date(+new Date(trip.end)-24*3600*1000)).toISOString().slice(0,10);
        const isPast = trip.end <= todayStr;
        const isDefault = !!trip.isDefaultCover;

        const rowStyle = `
          display:flex;align-items:center;margin-bottom:5px;border-radius:999px;
          background:${studio?.color || '#8888'};
          min-height:32px;font-size:13.2px;font-weight:500;box-shadow:0 1px 6px #0002;
          overflow:hidden;position:relative;${isPast ? ' opacity:0.54;filter:grayscale(0.22);' : ''}
        `;
        // формат даты: дд.мм.гг (2 цифры года)
        const fmt = d => {
          const [y, m, dd] = d.split('-');
          return `${dd}.${m}.${y.slice(-2)}`;
        };
        const startDate = new Date(trip.start);
        const endDate = new Date(trip.end);
        const daysCount = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));

        // Название студии, минимум 5 букв + троеточие если длиннее 7
        let shortTitle = trip.title.length > 7 
            ? trip.title.slice(0, 5) + '…' 
            : trip.title;
        // Подпись “по умолчанию” маленьким
        let defaultLabel = isDefault ? '<span style="font-size:11px;opacity:.68;"> (по умолч.)</span>' : '';

        return `
          <div class="guest-spot-row" style="${rowStyle};cursor:pointer;" onclick="showTripModal('${trip.title.replace(/'/g,"\\'")}', '${trip.start}', '${dateTo}')">


            <span style="flex:2; min-width:0; max-width:88px; padding:5px 8px 5px 12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#fff; font-size:13.7px;">
  ${trip.title}${defaultLabel}
</span>
            <span style="flex:1; min-width:50px; text-align:right; color:#fff; opacity:.93; font-variant-numeric:tabular-nums; letter-spacing:.01em; padding-right:3px;">
  ${fmt(trip.start)}
</span>
<span style="flex:0 0 14px; text-align:center; color:#fff; font-size:17px; line-height:1; font-weight:900; opacity:0.91; padding:0 3px;">
  &bull;
</span>
<span style="flex:1; min-width:50px; text-align:left; color:#fff; opacity:.93; font-variant-numeric:tabular-nums; letter-spacing:.01em; padding-left:3px;">
  ${fmt(dateTo)}
</span>
            <span style="flex:0 0 32px;text-align:right;color:#fff;font-size:13px;font-weight:400;opacity:.79;margin-left:4px;margin-right:7px;">
              ${daysCount} д
            </span>
          </div>
        `;
      }).join('')
    }
  </div>
`;



  // Скролл: показывать "текущий" (или ближайший будущий) посередине блока
  setTimeout(() => {
    const scrollBox = summary.querySelector('.guest-spot-scrollbox');
    const rows = scrollBox?.querySelectorAll('.guest-spot-row');
    if (!rows || !rows.length) return;
    let toIdx = Math.max(0, currentIdx - 2);
    if (toIdx > rows.length - 5) toIdx = Math.max(0, rows.length - 5);
    const scrollToRow = rows[toIdx];
    if (scrollToRow) scrollBox.scrollTop = scrollToRow.offsetTop;
  }, 60);
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
await updateStats();
  } catch (e) {
    alert('Ошибка при добавлении дохода: ' + e.message);
  }
}

let studios = [];
// Приоритет студии: 1 — по умолчанию, 2 — все остальные
function getStudioPriority(studio) {
  return studio.isDefault ? 1 : 2;
}
let trips = [];
let currentTripId = null; // Для отслеживания, редактируем ли поездку
let currentEdit = null; // {type: 'income'|'expense', id: '...'}

function updateCalendarInputsVisibility() {
  const select = document.getElementById('studio-select');
  const idx = select ? select.value : null;
  const studio = idx !== null && studios[idx] ? studios[idx] : null;
  const isDefault = studio && studio.isDefault;

  // Показываем нужный блок, скрываем ненужный
  document.getElementById('fill-cover-block').style.display = isDefault ? '' : 'none';
  document.getElementById('dates-block').style.display = isDefault ? 'none' : 'flex';

  // Если выбрана дефолт-студия — очищаем даты и скрываем кнопку удаления поездки
  if (isDefault) {
    document.getElementById('trip-date-from').value = '';
    document.getElementById('trip-date-to').value = '';
    document.getElementById('delete-trip-btn').style.display = "none";
  } else {
    // ← Вот это важно! Показываем кнопку для guest spot-студии всегда
    document.getElementById('delete-trip-btn').style.display = "";
  }
}

 function renderStudioSelect() {
  const sel = document.getElementById('studio-select');
  sel.innerHTML = '';
  studios.forEach((s, i) => {
    sel.innerHTML += `<option value="${i}" style="color:${s.color}">${s.name}</option>`;
  });

  // --- Добавить обработчик и сразу вызвать обновление видимости полей ---
  sel.removeEventListener('change', updateCalendarInputsVisibility); // чтобы не дублировать
  sel.addEventListener('change', updateCalendarInputsVisibility);
  updateCalendarInputsVisibility();
}function showAddStudioModal() {
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
showCalendarToast('Студия добавлена!');
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
      isDefaultCover: !!data.isDefaultCover,
      extendedProps: { id: doc.id }
    });
  });

  // --- ДОБАВЬ ВОТ ЭТИ ДВЕ СТРОКИ В КОНЦЕ ---
  renderStudiosSummary();
  renderGuestSpotsSummary();
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
    allEntries.sort((a, b) => b.date.localeCompare(a.date));

    if (allEntries.length === 0) {
      historyList.innerHTML = '<li style="color:#bbb">Нет записей</li>';
      return;
    }

    // Рендерим историю
    historyList.innerHTML = '';
    allEntries.forEach(entry => {

// --- Форматирование даты ---
function formatDateDMY(dateStr) {
  if (!dateStr) return '';
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const [y, m, d] = dateStr.split('-');
  const mm = parseInt(m, 10);
  return `${parseInt(d, 10)} ${months[mm - 1]} ${y}`;
}

historyList.innerHTML += `
  <li class="history-entry flex-history-threecol ${entry.type}">
    <div class="history-col-sum">
      <span>${entry.amount}</span>
    </div>
    <div class="history-col-main">
      <div class="history-studio">${entry.location || ''}</div>
${entry.isInvoice ? '<div class="history-invoice">(Фактура)</div>' : ''}
<div class="history-date">${formatDateDMY(entry.date)}</div>
      <div class="history-category">${entry.workType || entry.expenseType || ''}</div>
    </div>
    <div class="history-col-actions">
      <button class="edit-entry-btn-mini" data-type="${entry.type}" data-id="${entry.id}" title="Редактировать">
        <svg width="20" height="20" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7" fill="none">
          <path d="M14.7 3.8c.5-.5 1.3-.5 1.8 0s.5 1.3 0 1.8l-8.8 8.8-2.5.7.7-2.5 8.8-8.8z"/>
          <path d="M12.3 6.2l1.5 1.5"/>
        </svg>
      </button>
    </div>
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
await updateStats();

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
showCalendarToast('Студия удалена!');
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

  await loadStudios();       // Перечитали список студий, это создаст/удалит ковер если надо
await loadTrips();         // <-- ЭТО ДОБАВЬ! Сразу получаем новые trips

// Если календарь открыт, обнови события
if (window.fcInstance) {
  window.fcInstance.removeAllEvents();
  trips.forEach(event => window.fcInstance.addEvent(event));
}

closeStudioModal();        // Закрываем модалку уже после обновления календаря
showCalendarToast('Студия изменена!');
};
async function addTripByDates() {
  const studioIdx = document.getElementById('studio-select').value;
  const studio = studios[studioIdx];
  const dateFrom = document.getElementById('trip-date-from').value;
  const dateTo = document.getElementById('trip-date-to').value;
  // ... валидация и проверка пересечений (оставляй как было)

// Проверяем, нет ли пересечений с другими guest spot-студиями (не дефолт)
const from = new Date(dateFrom);
const to = new Date(dateTo);
to.setHours(23,59,59,999); // чтобы включительно

const busyRanges = trips.filter(ev =>
  ev.title !== studio.name &&
  (!studios.find(s => s.name === ev.title)?.isDefault)
);

let overlapDates = [];
for (const ev of busyRanges) {
  let d1 = new Date(ev.start);
  let d2 = new Date(ev.end);
  d2.setDate(d2.getDate() - 1); // включительно

  if (from <= d2 && to >= d1) {
    let cur = new Date(Math.max(d1, from));
    let until = new Date(Math.min(d2, to));
    while (cur <= until) {
      overlapDates.push(cur.toISOString().slice(0,10));
      cur.setDate(cur.getDate() + 1);
    }
  }
}

if (overlapDates.length > 0) {
  // Группируем по диапазонам для красоты
  overlapDates.sort();
  let ranges = [];
  let rangeStart = overlapDates[0], prev = overlapDates[0];
  for (let i = 1; i < overlapDates.length; i++) {
    let curr = overlapDates[i];
    let prevDate = new Date(prev);
    prevDate.setDate(prevDate.getDate() + 1);
    if (curr !== prevDate.toISOString().slice(0,10)) {
      ranges.push([rangeStart, prev]);
      rangeStart = curr;
    }
    prev = curr;
  }
  ranges.push([rangeStart, prev]);

  // === Форматируем в дд.мм.гггг ===
  function fmt(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
  }
  let message = ranges.map(([a, b]) => {
    if (a === b) return fmt(a);
    return fmt(a) + ' – ' + fmt(b);
  }).join('\n');

  alert('Выбранные даты пересекаются с уже добавленными поездками:\n' + message + '\nПроверьте диапазон!');
  return;
}

  // --- СНАЧАЛА ОБРЕЗАЕМ ДЕФОЛТ-КОВЁР! ---
  // Обрезаем только ковер дефолт-студии (isDefaultCover === true)
for (const ev of trips) {
  if (
    !(ev.end <= dateFrom || ev.start >= addDays(dateTo, 1)) // Есть пересечение дат
    && ev.title !== studio.name // Не совпадает имя студии
    && ev.isDefaultCover // Только дефолт-ковер!
  ) {
    // Полное перекрытие — удалить event
    if (dateFrom <= ev.start && addDays(dateTo,1) >= ev.end) {
      await db.collection('trips').doc(ev.id).delete();
    } else {
      // Частичное перекрытие: обрезаем слева и/или справа
      if (dateFrom > ev.start && dateFrom < ev.end) {
        await db.collection('trips').add({
          studio: ev.title,
          title: ev.title,
          color: ev.color,
          start: ev.start,
          end: dateFrom,
          isDefaultCover: !!ev.isDefaultCover,
          created: ev.created || new Date().toISOString()
        });
showCalendarToast('Период добавлен!');
      }
      if (addDays(dateTo,1) > ev.start && addDays(dateTo,1) < ev.end) {
        await db.collection('trips').add({
          studio: ev.title,
          title: ev.title,
          color: ev.color,
          start: addDays(dateTo, 1),
          end: ev.end,
          isDefaultCover: !!ev.isDefaultCover,
          created: ev.created || new Date().toISOString()
        });
      }
      await db.collection('trips').doc(ev.id).delete();
    }
  }
}

  // --- ТЕПЕРЬ ДОБАВЛЯЕМ НОВУЮ ПОЕЗДКУ ---
  if (currentTripId) {
    // Редактирование существующей поездки
    await db.collection('trips').doc(currentTripId).update({
      studio: studio.name,
      color: studio.color,
      start: dateFrom,
      end: addDays(dateTo, 1)
    });
    showCalendarToast('Период изменён!');
currentTripId = null;
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

  // 1. Получаем диапазон удаляемой поездки
  const docSnap = await db.collection('trips').doc(currentTripId).get();
  const data = docSnap.exists ? docSnap.data() : null;
  const start = data ? data.start : null;
  const end = data ? data.end : null;
  const studioName = data ? data.studio : null;

  // 2. Удаляем поездку
  await db.collection('trips').doc(currentTripId).delete();

showCalendarToast('Период удалён!');

 
  // === Вот тут обновление календаря! ===
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
await updateStats();

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
await updateStats();

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
  setDefaultDateInputs();
  setDefaultStudioInputs();
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
  setDefaultDateInputs();
  setDefaultStudioInputs();
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
await updateStats();

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
await updateStats();

  } catch (e) {
    alert('Ошибка при удалении: ' + e.message);
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

// --- ЗАПОЛНИТЬ ВСЕ СВОБОДНЫЕ ДНИ КОВРОМ ДЕФОЛТ-СТУДИИ ---
async function fillDefaultCoverGaps() {
  const def = studios.find(s => s.isDefault);
  if (!def) return alert("Нет студии по умолчанию!");

  await loadTrips();

  const busyDays = new Set();
  for (const ev of trips) {
    if (!ev.isDefaultCover) {
      let d = new Date(ev.start);
      const end = new Date(ev.end);
      while (d < end) {
        busyDays.add(d.toISOString().slice(0,10));
        d.setDate(d.getDate() + 1);
      }
    }
  }

  let allDates = [];
  for (const ev of trips) {
    let d = new Date(ev.start);
    const end = new Date(ev.end);
    while (d < end) {
      allDates.push(d.toISOString().slice(0,10));
      d.setDate(d.getDate() + 1);
    }
  }
  
  if (allDates.length === 0) {
    // Если событий нет — ковер на ближайший год с сегодня
    let today = new Date();
    let startStr = today.toISOString().slice(0,10);
    let endDate = new Date(today);
    endDate.setFullYear(endDate.getFullYear() + 1); // +1 год
    let endStr = endDate.toISOString().slice(0,10);

    // Удаляем старые ковры
    const oldCovers = await db.collection('trips')
      .where('studio', '==', def.name)
      .where('isDefaultCover', '==', true)
      .get();
    const batch = db.batch();
    oldCovers.forEach(doc => batch.delete(doc.ref));

    // Создаём новый ковёр на год
    const ref = db.collection('trips').doc();
    batch.set(ref, {
      studio: def.name,
      color: def.color,
      start: startStr,
      end: endStr,
      isDefaultCover: true,
      created: new Date().toISOString()
    });
    await batch.commit();

    await loadTrips();
    if (window.fcInstance) {
      window.fcInstance.removeAllEvents();
      trips.forEach(event => window.fcInstance.addEvent(event));
    }
    alert("Ковёр дефолт-студии создан на ближайший год!");
    return;
  }

  // ... остальная часть кода, как было ранее
  allDates.sort();
  let globalStart = allDates[0];
  let globalEnd = allDates[allDates.length - 1];

  let intervals = [];
  let rangeStart = null;

  let d = new Date(globalStart);
  const end = new Date(globalEnd);
  while (d <= end) {
    const dateStr = d.toISOString().slice(0,10);
    if (!busyDays.has(dateStr)) {
      if (!rangeStart) rangeStart = dateStr;
    } else {
      if (rangeStart) {
        intervals.push({ start: rangeStart, end: dateStr });
        rangeStart = null;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  if (rangeStart) intervals.push({ start: rangeStart, end: addDays(globalEnd,1) });

  const oldCovers = await db.collection('trips')
    .where('studio', '==', def.name)
    .where('isDefaultCover', '==', true)
    .get();
  const batch = db.batch();
  oldCovers.forEach(doc => batch.delete(doc.ref));

  for (const range of intervals) {
    if (range.start >= range.end) continue;
    const ref = db.collection('trips').doc();
    batch.set(ref, {
      studio: def.name,
      color: def.color,
      start: range.start,
      end: range.end,
      isDefaultCover: true,
      created: new Date().toISOString()
    });
  }
  await batch.commit();

  await loadTrips();
  if (window.fcInstance) {
    window.fcInstance.removeAllEvents();
    trips.forEach(event => window.fcInstance.addEvent(event));
  }

  alert("Все свободные дни заполнены");
}
function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}


function showCalendarToast(msg) {
  const toast = document.getElementById('calendar-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = '';
  // Плавная анимация появления
  setTimeout(() => toast.style.opacity = '1', 10);

  // Скрыть через 3 секунды
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.style.display = 'none', 350);
  }, 3000);
}

// Глобальная переменная для календаря
window.fcInstance = null;

function subtractOneDay(dateStr) {
  const date = new Date(dateStr);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function refreshCalendar() {
  if (window.fcInstance) {
    window.fcInstance.destroy();
    window.fcInstance = null;
  }
setTimeout(() => {
  window.fcInstance = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: 'dayGridMonth',
    selectable: true,
    events: trips,
    height: 'auto',
    headerToolbar: { left: 'title', center: '', right: 'today prev,next' },
    locale: 'ru',
firstDay: 1,
    eventClick: function(info) {
      const event = info.event;
      const studioName = event.title;
      const startDate = event.startStr.slice(0, 10);
    const endDate = event.endStr
  ? subtractOneDay(event.endStr)
  : startDate;
      const studioIdx = studios.findIndex(s => s.name === studioName);
      document.getElementById('studio-select').value = studioIdx;

      // Обновить видимость!
      updateCalendarInputsVisibility();

      const studio = studios[studioIdx];
      if (studio && !studio.isDefault) {
        document.getElementById('trip-date-from').value = startDate;
        document.getElementById('trip-date-to').value = endDate;
        document.getElementById('delete-trip-btn').style.display = "";
        currentTripId = event.extendedProps.id;
      } else {
        // Для дефолт-студии сбрасываем id и прячем кнопку удаления
        currentTripId = null;
        document.getElementById('delete-trip-btn').style.display = "none";
      }
    }
  });
  window.fcInstance.render();
}, 1);
}

// Вызови refreshCalendar() после загрузки trips (и при каждом изменении trips)
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
      isDefaultCover: !!data.isDefaultCover,
      extendedProps: { id: doc.id }
    });
  });

  renderStudiosSummary();
  renderGuestSpotsSummary();
  refreshCalendar(); // <-- ДОБАВЬ В КОНЦЕ
setDefaultStudioInputs();
}

function setDefaultDateInputs() {
  const today = new Date().toISOString().slice(0, 10);
  if (document.getElementById('income-date')) {
    document.getElementById('income-date').value = today;
  }
  if (document.getElementById('expense-date')) {
    document.getElementById('expense-date').value = today;
  }
}

function findActiveStudio(dateStr) {
  // 1. Сначала ищем guest spot/trip для даты
  let activeTrip = trips.find(trip => {
    // trip.start <= dateStr < trip.end (!)
    return trip.start <= dateStr && dateStr < trip.end && !trip.isDefaultCover;
  });
  if (activeTrip) {
    // Находим студию по названию
    let s = studios.find(st => st.name === activeTrip.title);
    return s ? s.name : studios.find(st => st.isDefault)?.name || '';
  }
  // 2. Если нет guest spot — дефолтная студия
  return studios.find(st => st.isDefault)?.name || '';
}

function setDefaultStudioInputs() {
  const dateIncome = document.getElementById('income-date')?.value || new Date().toISOString().slice(0,10);
  const dateExpense = document.getElementById('expense-date')?.value || new Date().toISOString().slice(0,10);

  // Для дохода
  let activeStudioIncome = findActiveStudio(dateIncome);
  if (document.getElementById('income-location')) {
    document.getElementById('income-location').value = activeStudioIncome;
  }
  // Для расхода
  let activeStudioExpense = findActiveStudio(dateExpense);
  if (document.getElementById('expense-location')) {
    document.getElementById('expense-location').value = activeStudioExpense;
  }
}

function attachDateInputHandlers() {
  const incomeDate = document.getElementById('income-date');
  const expenseDate = document.getElementById('expense-date');

  if (incomeDate) {
    incomeDate.addEventListener('change', function() {
      const date = this.value;
      const studio = findActiveStudio(date);
      document.getElementById('income-location').value = studio;
    });
  }
  if (expenseDate) {
    expenseDate.addEventListener('change', function() {
      const date = this.value;
      const studio = findActiveStudio(date);
      document.getElementById('expense-location').value = studio;
    });
  }
}

function onTripDeleteOrReset() {
  // Если редактируем существующий трип — удаляем его
  if (currentTripId) {
    deleteTripById();
  } else {
    // Просто сбросить поля ввода
    document.getElementById('trip-date-from').value = '';
    document.getElementById('trip-date-to').value = '';
    currentTripId = null;
    document.getElementById('delete-trip-btn').style.display = "none";
    // Можно также обновить UI, если нужно
  }
}
async function updateStats() {
  // Получаем доходы и расходы
  const [incomeSnap, expenseSnap] = await Promise.all([
    db.collection('incomes').get(),
    db.collection('expenses').get()
  ]);

  let totalIncome = 0;
  let whiteIncome = 0;
  let blackIncome = 0;
  let totalExpenses = 0;

  incomeSnap.forEach(doc => {
    const d = doc.data();
    totalIncome += Number(d.amount) || 0;
    if (d.isInvoice) {
      whiteIncome += Number(d.amount) || 0;
    } else {
      blackIncome += Number(d.amount) || 0;
    }
  });
  expenseSnap.forEach(doc => {
    const d = doc.data();
    totalExpenses += Number(d.amount) || 0;
  });

  const netIncome = totalIncome - totalExpenses;

  // Обновляем значения на странице
  document.getElementById('total-income').textContent = totalIncome.toLocaleString() + ' €';
  document.getElementById('white-income').textContent = whiteIncome.toLocaleString() + ' €';
  document.getElementById('black-income').textContent = blackIncome.toLocaleString() + ' €';
  document.getElementById('total-expenses').textContent = totalExpenses.toLocaleString() + ' €';
  document.getElementById('net-income').textContent = netIncome.toLocaleString() + ' €';
}


async function showTripModal(studioName, dateStart, dateEnd) {
  const modal = document.getElementById('trip-modal');
  const closeBtn = document.getElementById('trip-modal-close');
  const content = document.getElementById('trip-modal-content');
  if (!modal || !content) return;

  modal.style.display = 'flex';
  closeBtn.onclick = () => { modal.style.display = 'none'; content.innerHTML = ''; };
  // Закрытие по фону
  modal.onclick = e => { if (e.target === modal) { modal.style.display = 'none'; content.innerHTML = ''; } };

  // Фильтрация истории
 const [incomeSnap, expenseSnap] = await Promise.all([
    db.collection('incomes')
      .where('location', '==', studioName)
      .where('date', '>=', dateStart)
      .where('date', '<=', dateEnd)
      .orderBy('date', 'asc').get(),
    db.collection('expenses')
      .where('location', '==', studioName)
      .where('date', '>=', dateStart)
      .where('date', '<=', dateEnd)
      .orderBy('date', 'asc').get()
  ]);
  let incomes = [];
  incomeSnap.forEach(doc => incomes.push({ id: doc.id, ...doc.data() }));
  let expenses = [];
  expenseSnap.forEach(doc => expenses.push({ id: doc.id, ...doc.data() }));

  // Подсчёт статистики
  let sumIncome = incomes.reduce((s, e) => s + Number(e.amount || 0), 0);
  let sumExpense = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  let netIncome = sumIncome - sumExpense;
  const days = Math.max(1, Math.round((new Date(dateEnd) - new Date(dateStart)) / (1000 * 60 * 60 * 24)));
  let avgIncomeDay = sumIncome / days;
  let avgNetIncomeDay = netIncome / days;
  let maxIncome = incomes.reduce((max, e) => Math.max(max, Number(e.amount || 0)), 0);
  let maxExpense = expenses.reduce((max, e) => Math.max(max, Number(e.amount || 0)), 0);

  // Формат даты
  const fmt = d => {
    const [y, m, dd] = d.split('-');
    return `${dd}.${m}.${y.slice(-2)}`;
  };

  // Итоговый html
  content.innerHTML = `
    <div style="font-size:18px;font-weight:600;line-height:1.2;margin-bottom:6px;">
      ${studioName}<br>
      <span style="font-size:15px;font-weight:400;opacity:.86;">
        ${fmt(dateStart)} — ${fmt(dateEnd)} (${days} дн.)
      </span>
    </div>
    <div style="font-size:14.5px;line-height:1.7;margin-bottom:8px;">
      <b>Доходы:</b> <span style="color:#65ffa0;">${sumIncome.toLocaleString(undefined,{maximumFractionDigits:2})} €</span><br>
      <b>Расходы:</b> <span style="color:#ff8888;">${sumExpense.toLocaleString(undefined,{maximumFractionDigits:2})} €</span><br>
      <b>Чистый доход:</b> <span style="color:#ffffc0;">${netIncome.toLocaleString(undefined,{maximumFractionDigits:2})} €</span><br>
      <b>Средний доход в день:</b> ${avgIncomeDay.toLocaleString(undefined,{maximumFractionDigits:2})} €<br>
      <b>Средний чистый доход в день:</b> ${avgNetIncomeDay.toLocaleString(undefined,{maximumFractionDigits:2})} €<br>
      <b>Максимальный доход за день:</b> ${maxIncome.toLocaleString(undefined,{maximumFractionDigits:2})} €<br>
      <b>Максимальный расход:</b> ${maxExpense.toLocaleString(undefined,{maximumFractionDigits:2})} €
    </div>
    <div style="font-size:15px;font-weight:500;margin-top:7px;margin-bottom:2px;">Детализация:</div>
    <div style="font-size:13.5px;max-height:188px;overflow-y:auto;">
      ${incomes.map(e => `<div style="color:#65ffa0;">${fmt(e.date)} — +${e.amount} € <span style="opacity:.66;">${e.workType||''}</span></div>`).join('')}
      ${expenses.map(e => `<div style="color:#ffb2b2;">${fmt(e.date)} — -${e.amount} € <span style="opacity:.66;">${e.expenseType||''}</span></div>`).join('')}
      ${incomes.length===0 && expenses.length===0 ? `<div style="opacity:.6;">Нет записей</div>` : ''}
    </div>
  `;
}


window.addEventListener('DOMContentLoaded', () => {
  loadStudios().then(() => {
    loadHistory();
    loadTrips();
    updateStats();
    setDefaultDateInputs();
    attachDateInputHandlers();
  });
});