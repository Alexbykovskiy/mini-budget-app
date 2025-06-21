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

async function loadHistory() {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;
  historyList.innerHTML = '<li style="color:#bbb">Загрузка...</li>';

  try {
    const incomeSnap = await db.collection('incomes').orderBy('created', 'desc').get();
    if (incomeSnap.empty) {
      historyList.innerHTML = '<li style="color:#bbb">Нет доходов</li>';
      return;
    }

    historyList.innerHTML = '';
    incomeSnap.forEach(doc => {
      const data = doc.data();
      historyList.innerHTML += `
        <li class="history-entry income">
          <div>Доход: <b>${data.amount} €</b> ${data.isInvoice ? '(Фактура)' : ''}</div>
          <div>Студия: ${data.location}</div>
          <div>Дата: ${data.date}</div>
          <div>Тип: ${data.workType}</div>
        </li>
      `;
    });
  } catch (e) {
    historyList.innerHTML = `<li style="color:red">Ошибка загрузки истории: ${e.message}</li>`;
  }
}


function addExpense() {
  alert('Добавление расхода будет реализовано позже.');
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