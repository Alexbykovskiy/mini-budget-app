const db = firebase.firestore();
const profileCode = "mini";

const form = document.getElementById('expense-form');
const list = document.getElementById('expense-list');
const summary = document.getElementById('summary');
let expenseChart;
let expenses = [];
let fullTotal = 0;

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
      <div class="bottom-line">
      ${exp.date ? `<span class="date-line">${formatDate(exp.date)}</span>` : ""}

${exp.liters ? `<span class="info-line">
  <svg class="icon" viewBox="0 0 256 256">
    <path d="M240 80v96a8 8 0 01-16 0v-40a8 8 0 00-16 0v80a8 8 0 01-16 0v-96a24 24 0 0148 0zM136 40v24H88v-24a8 8 0 00-16 0v176H40V72a8 8 0 00-16 0v144a16 16 0 0016 16h128a16 16 0 0016-16V40a8 8 0 00-16 0z"/>
  </svg>${Number(exp.liters).toFixed(1)} л</span>` : ""}

${exp.mileage ? `<span class="info-line">
  <svg class="icon" viewBox="0 0 256 256">
    <path d="M10.5 22h3l1.5-10h-6l1.5 10zM3 2l7 20h1.5l-1.5-10h6l-1.5 10H14l7-20H3z"/>
  </svg>${exp.mileage} км</span>` : ""}

${exp.note ? `<span class="info-line">
  <svg class="icon" viewBox="0 0 256 256">
    <path d="M128 24a104 104 0 00-88 160l-12 36a8 8 0 0010 10l36-12a104 104 0 10154-94 103.68 103.68 0 00-100-100z"/>
  </svg>${exp.note}</span>` : ""}

${exp.tag ? `<span class="info-line">
  <svg class="icon" viewBox="0 0 256 256">
    <path d="M248 136L120 8a16 16 0 00-22.6 0L24 81.4a16 16 0 000 22.6L152 232a16 16 0 0022.6 0l73.4-73.4a16 16 0 000-22.6z"/>
  </svg>#${exp.tag}</span>` : ""}

      </div>
    </div>
    <div class="expense-right">
      <div class="expense-amount">€${Number(exp.amount).toFixed(2)}</div>
      <div class="action-icons">
        <button onclick='fillFormForEdit(${JSON.stringify(exp)})'>
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75l11-11.03-3.75-3.75L3 17.25zM21.41 6.34c.38-.38.38-1.02 0-1.41l-2.34-2.34a1.003 1.003 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button onclick='deleteExpense("${exp.id}")'>
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
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

function loadExpenses() {
  db.collection("users").doc(profileCode).collection("expenses")
    .orderBy("date", "desc")
    .onSnapshot(snapshot => {
      expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fullTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
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
      labels: labels,
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
        centerText: {
          display: true,
          text: `€${total.toFixed(2)}`
        }
      }
    },
    plugins: [{
      id: 'centerText',
      beforeDraw(chart) {
        const { width } = chart;
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(`€${total.toFixed(2)}`, width / 2, chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2);
      }
    }]
  });
}

function formatDate(isoString) {
  const [year, month, day] = isoString.split("-");
  return `${day}.${month}.${year}`;
}

loadExpenses();



document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("date");
  if (dateInput && !dateInput.value) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
  }
});
