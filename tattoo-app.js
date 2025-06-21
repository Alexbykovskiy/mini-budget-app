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

function addIncome() {
const isInvoice = document.getElementById('is-invoice').checked;
// Если true — это белый доход ("Фактура"), если false — чёрный доход  
alert('Добавление дохода будет реализовано позже.');
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