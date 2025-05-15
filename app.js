let db;

window.addEventListener("load", () => {
  db = firebase.firestore();
  loadExpenses();
  populateTagList();
  resetForm(); // 👉 добавляем автоустановку даты
});const profileCode = "mini";

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
     <div class="expense-line">
  ${exp.date ? `
    <div class="info-line">
      <span class="date-line">${formatDate(exp.date)}</span>
    </div>` : ""}
  ${exp.liters ? `
    <div class="info-line">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2C12 2 6 7 6 12a6 6 0 0 0 12 0c0-5-6-10-6-10z" />
      </svg>
      <span>${Number(exp.liters).toFixed(1)} л</span>
    </div>` : ''}

  ${exp.mileage ? `
    <div class="info-line">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12h18" />
        <path d="m15 18 6-6-6-6" />
      </svg>
      <span>${exp.mileage} км</span>
    </div>` : ''}

  ${exp.note ? `
    <div class="info-line">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span>${exp.note}</span>
    </div>` : ''}

  ${exp.tag ? `
    <div class="info-line">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="4" x2="20" y1="9" y2="9" />
        <line x1="4" x2="20" y1="15" y2="15" />
        <line x1="10" x2="8" y1="3" y2="21" />
        <line x1="16" x2="14" y1="3" y2="21" />
      </svg>
      <span>#${exp.tag}</span>
    </div>` : ''}
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
  const entriesWithMileage = data.filter(e => e.mileage && !isNaN(Number(e.mileage)));
const sorted = [...entriesWithMileage].sort((a, b) => a.date.localeCompare(b.date));
const startMileage = Number(sorted[0]?.mileage || 0);
const endMileage = Number(sorted[sorted.length - 1]?.mileage || 0);
const distance = endMileage - startMileage;

summary.innerHTML = `Всего: €${fullTotal.toFixed(2)} <span class="inline-km">за ${distance} км</span>`;

  updateChart(data, total);
calculateCostPerKm(data);
calculatePureRunningCost(data);
calculateFuelStats(data);

}

function calculateCostPerKm(data) {
  const entriesWithMileage = data.filter(e => e.mileage && !isNaN(Number(e.mileage)));
  if (entriesWithMileage.length < 2) {
    document.getElementById('cost-per-km').textContent = "€/км: недостаточно данных";
    return;
  }
  const sorted = [...entriesWithMileage].sort((a, b) => a.date.localeCompare(b.date));
  const startMileage = Number(sorted[0].mileage);
  const endMileage = Number(sorted[sorted.length - 1].mileage);
  const distance = endMileage - startMileage;
  const totalAmount = data.reduce((sum, e) => sum + Number(e.amount), 0);
  const costPerKm = distance > 0 ? (totalAmount / distance) : 0;
document.getElementById('cost-per-km').innerHTML =
  distance > 0
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" 
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
         <circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg> €/км: €${costPerKm.toFixed(2)}`
    : `€/км: —`;
}
function calculatePureRunningCost(data) {
  const relevantCosts = data.filter(e =>
    e.category === 'Топливо' || (e.tag && e.tag.toLowerCase() === 'масло')
  );
  const mileageEntries = data.filter(e => e.mileage && !isNaN(Number(e.mileage)));
  if (mileageEntries.length < 2) {
    document.getElementById('pure-km-cost').textContent = "€/км: недостаточно данных";
    return;
  }
  const sorted = [...mileageEntries].sort((a, b) => a.date.localeCompare(b.date));
  const distance = Number(sorted[sorted.length - 1].mileage) - Number(sorted[0].mileage);
  const totalAmount = relevantCosts.reduce((sum, e) => sum + Number(e.amount), 0);
  const cost = distance > 0 ? (totalAmount / distance) : 0;
 document.getElementById('pure-km-cost').innerHTML =
  distance > 0
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" 
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
         <path d="M12 2C12 2 6 7 6 12a6 6 0 0 0 12 0c0-5-6-10-6-10z"/></svg>
         €/км: €${cost.toFixed(2)}`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" 
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
         <path d="M12 2C12 2 6 7 6 12a6 6 0 0 0 12 0c0-5-6-10-6-10z"/></svg>
         €/км: —`;
}
function calculateFuelStats(data) {
  const fuelEntries = data.filter(e =>
    e.category === 'Топливо' &&
    e.liters && !isNaN(Number(e.liters)) &&
    e.amount && !isNaN(Number(e.amount))
  );
  const allMileageEntries = data.filter(e => e.mileage && !isNaN(Number(e.mileage)));
  const sorted = [...allMileageEntries].sort((a, b) => a.date.localeCompare(b.date));
  const distance = sorted.length >= 2 ? Number(sorted[sorted.length - 1].mileage) - Number(sorted[0].mileage) : 0;
  const totalLiters = fuelEntries.reduce((sum, e) => sum + Number(e.liters), 0);
  const totalAmount = fuelEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  const consumption = distance > 0 ? (totalLiters / distance * 100) : null;
  const pricePerLiter = totalLiters > 0 ? (totalAmount / totalLiters) : null;

 document.getElementById('fuel-consumption').innerHTML =
  consumption !== null
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
         <path d="M4 4h8v12H4z"/><path d="M14 4v12"/><path d="M4 8h8"/></svg>
         : ${consumption.toFixed(1)} л/100`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
         <path d="M4 4h8v12H4z"/><path d="M14 4v12"/><path d="M4 8h8"/></svg> : —`;


document.getElementById('fuel-price').textContent =
  pricePerLiter !== null
    ? `€/л: €${pricePerLiter.toFixed(2)}`
    : `€/л: —`;
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

  // 👉 Нормализуем тег: только строчные буквы, слитно, без пробелов
  let tag = document.getElementById('tag').value.trim().toLowerCase().replace(/\s+/g, '');

  const data = { category, amount, mileage, liters, date, note, tag };
  const ref = db.collection("users").doc(profileCode).collection("expenses");

  if (id) {
    ref.doc(id).update(data);
  } else {
    ref.add(data).then(() => {
      // 👉 Сохраняем новый тег, если он не пустой
      if (tag) {
        db.collection("users").doc(profileCode).collection("tags").doc(tag).set({ used: true });
      }
    });
  }

  form.reset();
  document.getElementById('edit-id').value = '';
};

function fetchTags() {
  return db.collection("users").doc(profileCode).collection("tags").get()
    .then(snapshot => snapshot.docs.map(doc => doc.id));
}

function populateTagList() {
  fetchTags().then(tags => {
    const datalist = document.getElementById('tag-list');
    if (!datalist) return;
    datalist.innerHTML = tags.map(tag => `<option value="${tag}">`).join('');
  });
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

function resetForm() {
  form.reset();
  document.getElementById('edit-id').value = '';
  const dateInput = document.getElementById('date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }
}


function formatDate(isoString) {
  const [year, month, day] = isoString.split("-");
  return `${day}.${month}.${year}`;
}




document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggle-journal");

  const wrapper = document.getElementById("expense-list-wrapper");
  const journalBlock = wrapper.closest('.block');
const filterToggleBtn = document.getElementById("toggle-filters");
const filtersWrapper = document.getElementById("filters-wrapper");
const filtersBlock = filtersWrapper.closest('.block');

if (toggleBtn && wrapper && journalBlock) {
  toggleBtn.addEventListener("change", () => {
    const isOn = toggleBtn.checked;
    wrapper.classList.toggle("collapsed", !isOn);
    wrapper.classList.toggle("expanded", isOn);
    journalBlock.classList.toggle("auto-height", isOn);
  });
}

if (filterToggleBtn && filtersWrapper && filtersBlock) {
  filterToggleBtn.addEventListener("change", () => {
    const isOn = filterToggleBtn.checked;
    filtersWrapper.classList.toggle("collapsed", !isOn);
    filtersWrapper.classList.toggle("expanded", isOn);
    filtersBlock.classList.toggle("auto-height", isOn);
  });
}


 
  // ✅ Добавь сюда вызов
  populateTagList();

  // Автоустановка сегодняшней даты
  const dateInput = document.getElementById('date');
const editIdInput = document.getElementById('edit-id');
if (dateInput && editIdInput && !editIdInput.value.trim()) {
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;
}

// ========== Инфотабло (уведомления сервис/документы) ==========

function renderInfoBoard(notifications) {
  const board = document.getElementById('info-board');
  if (!board) return;
  board.innerHTML = '';
  notifications.forEach(n => {
    board.innerHTML += `
      <div class="info-row ${n.status}">
        <span class="info-icon" data-lucide="${n.icon}"></span>
        <span>${n.text}</span>
        <span class="info-action">
          <button title="Редактировать" onclick="editInfoEntry('${n.id}')"><span data-lucide="pencil"></span></button>
          <button title="Фото" onclick="showInfoImage('${n.imageUrl||''}')"><span data-lucide="image"></span></button>
          <button title="Удалить" onclick="deleteInfoEntry('${n.id}')"><span data-lucide="trash-2"></span></button>
        </span>
      </div>
    `;
  });
  lucide.createIcons();
}

// ========== Заглушка для теста ==========

renderInfoBoard([
  {
    id: "1",
    status: "black",
    icon: "alert-triangle",
    text: "Масло — просрочено: -430 км / -8 дней",
    imageUrl: ""
  },
  {
    id: "2",
    status: "red",
    icon: "alert-triangle",
    text: "Тормозная жидкость — осталось: 420 км / 16 дней",
    imageUrl: ""
  },
  {
    id: "3",
    status: "yellow",
    icon: "alert-triangle",
    text: "Виньетка Австрия — осталось: 1410 км / 33 дня",
    imageUrl: ""
  },
  {
    id: "4",
    status: "gray",
    icon: "circle",
    text: "Масло — осталось: 7300 км / 164 дня",
    imageUrl: ""
  }
]);

function editInfoEntry(id) { /* ...добавить позже... */ }
function showInfoImage(url) { /* ...добавить позже... */ }
function deleteInfoEntry(id) { /* ...добавить позже... */ }
// Сворачивание блока добавления напоминания
document.addEventListener("DOMContentLoaded", () => {
  const infoAddToggleBtn = document.getElementById("toggle-info-add");
  const infoAddWrapper = document.getElementById("info-add-wrapper");
  if (infoAddToggleBtn && infoAddWrapper) {
    infoAddToggleBtn.addEventListener("change", () => {
      infoAddWrapper.classList.toggle("collapsed", !infoAddToggleBtn.checked);
      infoAddWrapper.classList.toggle("expanded", infoAddToggleBtn.checked);
    });
  }

  // Кнопка "Добавить фото"
  const photoBtn = document.getElementById("info-add-photo-btn");
  const photoInput = document.getElementById("info-add-photo");
  if (photoBtn && photoInput) {
    photoBtn.onclick = () => photoInput.click();
    photoInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        photoBtn.classList.add("selected");
      } else {
        photoBtn.classList.remove("selected");
      }
    };
  }

  // Заполнение сегодняшней датой
  const dateStartInput = document.getElementById('info-date-start');
  if (dateStartInput && !dateStartInput.value) {
    const today = new Date().toISOString().split('T')[0];
    dateStartInput.value = today;
  }
});

function resetInfoAddForm() {
  document.getElementById("info-add-form").reset();
  const photoBtn = document.getElementById("info-add-photo-btn");
  if (photoBtn) photoBtn.classList.remove("selected");
}


});

  