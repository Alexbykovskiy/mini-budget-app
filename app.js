// Firebase Firestore
const db = firebase.firestore();
const profileCode = "mini";

const form = document.getElementById('expense-form');
const list = document.getElementById('expense-list');
const summary = document.getElementById('summary');
const categoryInput = document.getElementById('category');

let expenses = [];

function renderExpenses(data) {
  list.innerHTML = "";
  let total = 0;
  data.forEach((exp, index) => {
    total += Number(exp.amount);
    const li = document.createElement('li');
    li.innerHTML = `#${index + 1} [${exp.category}] €${exp.amount} | ${exp.date || "—"} | ${exp.note || ""} ${exp.tag ? '#' + exp.tag : ''}`;
    const delBtn = document.createElement('button');
    delBtn.textContent = "❌";
    delBtn.onclick = () => {
      if (confirm("Удалить эту запись?")) {
        db.collection("users").doc(profileCode).collection("expenses").doc(exp.id).delete();
      }
    };
    li.appendChild(delBtn);
    list.appendChild(li);
  });
  summary.textContent = `Всего: €${total.toFixed(2)}`;
}

function loadExpenses() {
  db.collection("users").doc(profileCode).collection("expenses")
    .orderBy("date", "desc")
    .onSnapshot(snapshot => {
      expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderExpenses(expenses);
    });
}

form.onsubmit = (e) => {
  e.preventDefault();
  const category = document.getElementById('category').value;
  const amount = document.getElementById('amount').value;
  const mileage = document.getElementById('mileage').value;
  const liters = document.getElementById('liters').value;
  const date = document.getElementById('date').value;
  const note = document.getElementById('note').value;
  const tag = document.getElementById('tag').value.replace('#', '');

  const data = { category, amount, mileage, liters, date, note, tag };
  db.collection("users").doc(profileCode).collection("expenses").add(data)
    .then(() => form.reset());
};

function applyFilters() {
  const from = document.getElementById("filter-from").value;
  const to = document.getElementById("filter-to").value;
  const tag = document.getElementById("filter-tag").value.replace('#', '');

  let filtered = expenses;
  if (from) filtered = filtered.filter(e => e.date >= from);
  if (to) filtered = filtered.filter(e => e.date <= to);
  if (tag) filtered = filtered.filter(e => e.tag === tag);
  renderExpenses(filtered);
}

loadExpenses();