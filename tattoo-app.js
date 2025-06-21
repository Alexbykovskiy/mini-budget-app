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

let studios = [
  {name: "Rocco Inc.", color: "#3fa9f5"},
  {name: "SkyLine", color: "#f58a3f"},
  {name: "Tattoo Lab", color: "#3ff5a7"}
];
let trips = [];

function showCalendar() {
  document.getElementById('calendar-modal').style.display = 'flex';
  renderStudioSelect();
  setTimeout(() => {
    if (!window.fcInstance) {
      window.fcInstance = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: 'dayGridMonth',
        selectable: true,
        select: function(info) {
          const studioIndex = document.getElementById('studio-select').value;
          const studio = studios[studioIndex];
          if (studio) {
            trips.push({
              title: studio.name,
              start: info.startStr,
              end: info.endStr,
              color: studio.color
            });
            window.fcInstance.addEvent({
              title: studio.name,
              start: info.startStr,
              end: info.endStr,
              color: studio.color
            });
          }
        },
        events: trips,
        height: 410,
        headerToolbar: { left: 'title', center: '', right: 'today prev,next' },
        locale: 'ru'
      });
      window.fcInstance.render();
    }
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
function addNewStudio() {
  const name = document.getElementById('new-studio-name').value.trim();
  const color = document.getElementById('new-studio-color').value;
  if (name) {
    studios.push({name, color});
    renderStudioSelect();
    closeAddStudioModal();
  }
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
function calculateStats() {
  alert('Расчёт статистики будет реализован позже.');
}

function showCalendar() {
  alert('Календарь будет реализован позже.');
}

function showSettings() {
  alert('Настройки будут реализованы позже.');
}

window.addEventListener('DOMContentLoaded', loadHistory);