const db = firebase.firestore();
const profileCode = "mini";

const form = document.getElementById('expense-form');
const list = document.getElementById('expense-list');
const summary = document.getElementById('summary');

let expenses = [];

function renderExpenses(data) {
  list.innerHTML = "";
  let total = 0;
  data.forEach((exp, index) => {
    total += Number(exp.amount);
    const li = document.createElement('li');
    li.setAttribute('data-category', exp.category);

    const infoBlock = document.createElement('div');
    infoBlock.className = 'expense-info';

    const pill = (text) => `<span class="pill">${text}</span>`;

    infoBlock.innerHTML =
      pill(`#${index + 1}`) +
      pill(exp.category) +
      pill(`€${exp.amount}`) +
      (exp.date ? pill(exp.date) : '') +
      (exp.mileage ? pill(`${exp.mileage} км`) : '') +
      (exp.tag ? pill(`#${exp.tag}`) : '') +
      (exp.note ? `<div class="note">${exp.note}</div>` : '');

    const editBtn = document.createElement('button');
    editBtn.innerHTML = `<svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.41l-2.34-2.34a1.003 1.003 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
    editBtn.onclick = () => fillFormForEdit(exp);

    const delBtn = document.createElement('button');
    delBtn.innerHTML = `<svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
    delBtn.onclick = () => {
      if (confirm("Удалить эту запись?")) {
        db.collection("users").doc(profileCode).collection("expenses").doc(exp.id).delete();
      }
    };

    li.appendChild(infoBlock);
    li.appendChild(editBtn);
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

function fillFormForEdit(exp) {
  document.getElementById('edit-id').value = exp.id;
  document.getElementById('category').value = exp.category;
  document.getElementById('amount').value = exp.amount;
  document.getElementById('liters').value = exp.liters || '';
  document.getElementById('mileage').value = exp.mileage || '';
  document.getElementById('date').value = exp.date;
  document.getElementById('note').value = exp.note || '';
  document.getElementById('tag').value = exp.tag || '';
}

form.onsubmit = (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const category = document.getElementById('category').value;
  const amount = document.getElementById('amount').value;
  const mileage = document.getElementById('mileage').value;
  const liters = document.getElementById('liters').value;
  const date = document.getElementById('date').value;
  const note = document.getElementById('note').value;
  const tag = document.getElementById('tag').value.replace('#', '');

  const data = { category, amount, mileage, liters, date, note, tag };
  const ref = db.collection("users").doc(profileCode).collection("expenses");

  if (id) {
    ref.doc(id).update(data);
  } else {
    ref.add(data);
  }

  form.reset();
};

function applyFilters() {
  const from = document.getElementById("filter-from").value;
  const to = document.getElementById("filter-to").value;
  const tag = document.getElementById("filter-tag").value.replace('#', '');
  const categoryFilter = document.getElementById("filter-category")?.value;
  const rowStart = parseInt(document.getElementById("filter-row-start")?.value);
  const rowEnd = parseInt(document.getElementById("filter-row-end")?.value);

  let filtered = expenses;
  if (from) filtered = filtered.filter(e => e.date >= from);
  if (to) filtered = filtered.filter(e => e.date <= to);
  if (tag) filtered = filtered.filter(e => e.tag === tag);
  if (categoryFilter && categoryFilter !== "Все") filtered = filtered.filter(e => e.category === categoryFilter);
  if (!isNaN(rowStart) && !isNaN(rowEnd)) filtered = filtered.slice(rowStart - 1, rowEnd);

  renderExpenses(filtered);
}

loadExpenses();
