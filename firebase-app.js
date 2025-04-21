
const profileCode = "mini"; // код-профиль
const form = document.getElementById('expense-form');
const list = document.getElementById('expense-list');
const summary = document.getElementById('summary');

let expenses = [];

function renderExpenses() {
  list.innerHTML = "";
  let total = 0;
  expenses.forEach((exp) => {
    total += Number(exp.amount);
    const li = document.createElement('li');
    li.textContent = `[${exp.category}] €${exp.amount} | ${exp.date || "—"} | ${exp.note || ""} ${exp.mileage ? '| ' + exp.mileage + ' км' : ''}`;
    list.appendChild(li);
  });
  summary.textContent = `Всего расходов: €${total.toFixed(2)}`;
}

function loadExpenses() {
  db.collection("users").doc(profileCode).collection("expenses")
    .orderBy("date", "desc")
    .onSnapshot((snapshot) => {
      expenses = snapshot.docs.map(doc => doc.data());
      renderExpenses();
    });
}

form.onsubmit = (e) => {
  e.preventDefault();
  const category = document.getElementById('category').value;
  const amount = document.getElementById('amount').value;
  const mileage = document.getElementById('mileage').value;
  const date = document.getElementById('date').value;
  const note = document.getElementById('note').value;

  const expense = { category, amount, mileage, date, note };
  db.collection("users").doc(profileCode).collection("expenses").add(expense)
    .then(() => form.reset());
};

loadExpenses();
