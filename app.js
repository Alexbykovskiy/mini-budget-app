const db = firebase.firestore();
const profileCode = "mini";

const form = document.getElementById('expense-form');
const list = document.getElementById('expense-list');
const summary = document.getElementById('summary');
let expenseChart;
let expenses = [];
let fullTotal = 0;

function loadExpenses() {
  db.collection("users").doc(profileCode).collection("expenses")
    .orderBy("date", "desc")
    .onSnapshot(snapshot => {
      expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fullTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      renderExpenses(expenses);
    });
}

function renderExpenses(data) {
  list.innerHTML = "";
  let total = 0;
  data.forEach((exp, index) => {
    total += Number(exp.amount);
    const li = document.createElement('li');

    li.innerHTML = `
      <div class="expense-entry">
        <div class="expense-left">
          <div class="top-line">
            <span>#${index + 1}</span>
            <span>${exp.category}</span>
          </div>
          <div class="expense-line">
            ${exp.date ? `<div class="info-line"><span class="date-line">${formatDate(exp.date)}</span></div>` : ''}
            ${exp.liters ? `<div class="info-line"><span>${Number(exp.liters).toFixed(1)} л</span></div>` : ''}
            ${exp.mileage ? `<div class="info-line"><span>${exp.mileage} км</span></div>` : ''}
            ${exp.note ? `<div class="info-line"><span>${exp.note}</span></div>` : ''}
            ${exp.tag ? `<div class="info-line"><span>#${exp.tag}</span></div>` : ''}
          </div>
        </div>
        <div class="expense-right">
          <div class="expense-amount">€${Number(exp.amount).toFixed(2)}</div>
          <div class="action-icons">
            <button onclick='fillFormForEdit(${JSON.stringify(exp)})'>✎</button>
            <button onclick='deleteExpense("${exp.id}")'>🗑</button>
          </div>
        </div>
      </div>
    `;

    list.appendChild(li);
  });

  summary.textContent = `Всего: €${fullTotal.toFixed(2)}`;
  updateChart(data, total);
}

function deleteExpense(id) {
  if (confirm("Удалить запись?")) {
    db.collection("users").doc(profileCode).collection("expenses").doc(id).delete();
  }
}

form.onsubmit = (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const category = document.getElementById('category').value;
  const amount = parseFloat(document.getElementById('amount').value.replace(',', '.'));
  const mileage = document.getElementById('mileage').value;
  const liters = parseFloat(document.getElementById('liters').value.replace(',', '.'));
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
  document.getElementById('edit-id').value = '';
};

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

function updateChart(data, total) {
  const ctx = document.getElementById('expenseChart').getContext('2d');
  if (expenseChart) expenseChart.destroy();

  const totals = {};
  data.forEach(e => {
    if (!totals[e.category]) totals[e.category] = 0;
    totals[e.category] += Number(e.amount);
  });

  const labels = Object.keys(totals);
  const values = labels.map(k => totals[k]);
  const colors = ["#D2AF94", "#186663", "#A6B5B4", "#8C7361", "#002D37", "#5E8C8A", "#C4B59F", "#7F6A93", "#71A1A5", "#A58C7D", "#5B5B5B"];

  expenseChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, labels.length)
      }]
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: 'white',
            generateLabels: chart => {
              const d = chart.data;
              return d.labels.map((l, i) => {
                const val = d.datasets[0].data[i];
                const perc = ((val / total) * 100).toFixed(1);
                return {
                  text: `${l}: €${val.toFixed(2)} (${perc}%)`,
                  fillStyle: d.datasets[0].backgroundColor[i],
                  strokeStyle: d.datasets[0].backgroundColor[i],
                  lineWidth: 0,
                  index: i
                };
              });
            }
          }
        },
        tooltip: { enabled: false },
        datalabels: { display: false },
      }
    }
  });
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

loadExpenses();
