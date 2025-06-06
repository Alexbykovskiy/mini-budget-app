

window.addEventListener("load", () => {
  db = firebase.firestore();
  loadExpenses();
  populateTagList();
  resetForm();
  // 📸 Выбор способа загрузки изображения — камера или галерея
  // 📸 Упрощённая загрузка фото: системное меню (камера, галерея, файлы)




  

  // Переключатель журнала
  const toggleJournal = document.getElementById("toggle-journal");
  const journalWrapper = document.getElementById("expense-list-wrapper");
  const journalBlock = journalWrapper?.closest('.block');
  if (toggleJournal && journalWrapper && journalBlock) {
    toggleJournal.addEventListener("change", () => {
      const isOn = toggleJournal.checked;
      journalWrapper.classList.remove("collapsed", "expanded");
      journalWrapper.classList.add(isOn ? "expanded" : "collapsed");
      journalBlock.classList.toggle("auto-height", isOn);
    });
  }

  // Переключатель фильтров
  const filterToggleBtn = document.getElementById("toggle-filters");
  const filtersWrapper = document.getElementById("filters-wrapper");
  const filtersBlock = filtersWrapper?.closest('.block');
  if (filterToggleBtn && filtersWrapper && filtersBlock) {
    filterToggleBtn.addEventListener("change", () => {
      const isOn = filterToggleBtn.checked;
      filtersWrapper.classList.remove("collapsed", "expanded");
      filtersWrapper.classList.add(isOn ? "expanded" : "collapsed");
      filtersBlock.classList.toggle("auto-height", isOn);
    });
  }

  // Переключатель "добавить напоминание"
  const toggleInfoAdd = document.getElementById("toggle-info-add");
  const infoAddWrapper = document.getElementById("info-add-wrapper");
  const infoAddBlock = infoAddWrapper?.closest('.block');
  if (toggleInfoAdd && infoAddWrapper && infoAddBlock) {
    toggleInfoAdd.addEventListener("change", () => {
      const isOn = toggleInfoAdd.checked;
      infoAddWrapper.classList.remove("collapsed", "expanded");
      infoAddWrapper.classList.add(isOn ? "expanded" : "collapsed");
      infoAddBlock.classList.toggle("auto-height", isOn);
loadReminders();
    });
  }
});
const profileCode = "mini";

const form = document.getElementById('expense-form');
const list = document.getElementById('expense-list');
const summary = document.getElementById('summary');
let expenseChart;
let expenses = [];
let fullTotal = 0;
let editingReminderId = null;

// ========== ДОБАВИТЬ НАПОМИНАНИЕ ==========
const infoAddForm = document.getElementById('info-add-form');
if (infoAddForm) {
infoAddForm.onsubmit = async (e) => {
  e.preventDefault();
  const tag = document.getElementById('info-tag').value.trim().toLowerCase();
  const mileage = document.getElementById('info-mileage').value ? Number(document.getElementById('info-mileage').value) : null;
  const interval = document.getElementById('info-interval').value ? Number(document.getElementById('info-interval').value) : null;
  const dateStart = document.getElementById('info-date-start').value;
  const dateEnd = document.getElementById('info-date-end').value;
  let imageUrl = "";
  const photoInput = document.getElementById('info-add-photo');
  if (photoInput && photoInput.files[0]) {
    const file = photoInput.files[0];
    const storageRef = firebase.storage().ref();
    const snapshot = await storageRef.child(`reminders/${Date.now()}_${file.name}`).put(file);
    imageUrl = await snapshot.ref.getDownloadURL();
  }
  const data = { tag, mileage, interval, dateStart, dateEnd };
  if (imageUrl) data.imageUrl = imageUrl;

  if (editingReminderId) {
    await db.collection("users").doc(profileCode).collection("reminders").doc(editingReminderId).update(data);
    editingReminderId = null;
  } else {
    if (!imageUrl) data.imageUrl = "";
    data.created = Date.now();
    await db.collection("users").doc(profileCode).collection("reminders").add(data);
  }
showToast("Напоминание добавлено!");
  infoAddForm.reset();
  const dateStartInput = document.getElementById('info-date-start');
  if (dateStartInput) {
    dateStartInput.value = new Date().toISOString().split('T')[0];
  }
};

}

function resetInfoAddForm() {
  document.getElementById("info-add-form").reset();
    editingReminderId = null;
  // Автозаполнение сегодняшней даты после сброса
  const dateStartInput = document.getElementById('info-date-start');
  if (dateStartInput) {
    dateStartInput.value = new Date().toISOString().split('T')[0];
  }
} 

// ← ВОТ ЭТА СКОБКА!
function loadExpenses() {
  if (!db) {
    console.error("Firestore не инициализирован (loadExpenses)");
    return;
  }

  db.collection("users").doc(profileCode).collection("expenses")
    .orderBy("date", "desc")
    .onSnapshot(snapshot => {
      expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fullTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      renderExpenses(expenses);
      loadReminders(); // ← вставь эту строку вот здесь!
    });
}



function renderExpenses(data) {
  list.innerHTML = "";
  let total = 0;
  const entriesWithMileage = data.filter(e => e.mileage && !isNaN(Number(e.mileage)));

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
            ${exp.date ? `<div class="info-line"><span class="date-line">${formatDate(exp.date)}</span></div>` : ""}
            ${exp.liters ? `<div class="info-line"><svg width="24" height="24"><path d="M12 2C12 2 6 7 6 12a6 6 0 0 0 12 0c0-5-6-10-6-10z"/></svg><span>${Number(exp.liters).toFixed(1)} л</span></div>` : ""}
            ${exp.mileage ? `<div class="info-line"><svg width="24" height="24"><path d="M3 12h18"/><path d="m15 18 6-6-6-6"/></svg><span>${exp.mileage} км</span></div>` : ""}
            ${exp.note ? `<div class="info-line"><svg width="24" height="24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${exp.note}</span></div>` : ""}
            ${exp.tag ? `<div class="info-line"><svg width="24" height="24"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg><span>#${exp.tag}</span></div>` : ""}
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

 const sorted = [...entriesWithMileage].sort((a, b) => a.date.localeCompare(b.date));
const startMileage = Number(sorted[0]?.mileage || 0);
const endMileage = Number(sorted[sorted.length - 1]?.mileage || 0);
const distance = endMileage - startMileage;

const startDate = sorted[0]?.date;
const endDate = sorted[sorted.length - 1]?.date;
let daysDiff = "—";
if (startDate && endDate) {
  const diff = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
  daysDiff = diff > 0 ? diff : 1;
}

const latestMileage = entriesWithMileage.length
  ? Math.max(...entriesWithMileage.map(e => Number(e.mileage)))
  : 0;

document.getElementById('stat-distance').textContent = distance;
document.getElementById('stat-total-km').textContent = latestMileage;
document.getElementById('stat-days').textContent = `${daysDiff} дней`;

// 🛠 Пробег двигателя
const mileageBeforeSwap = 190000;
const engineOffsetKm = 64374;
const engineKm = latestMileage - mileageBeforeSwap + engineOffsetKm;
const formattedEngineKm = engineKm > 0 ? engineKm.toLocaleString("ru-RU") : "—";
document.getElementById('stat-days').textContent = `${daysDiff} дней`;

document.getElementById('stat-engine-km').innerHTML = `
  ${formattedEngineKm}
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor" style="margin-left:4px; vertical-align:middle">
    <path d="M240,104v48a16,16,0,0,1-16,16H216v16a8,8,0,0,1-16,0V168H184v8a8,8,0,0,1-16,0v-8H128v8a8,8,0,0,1-16,0v-8H88v8a8,8,0,0,1-16,0v-8H56v16a8,8,0,0,1-16,0V168H32a16,16,0,0,1-16-16V104a16,16,0,0,1,16-16H48V80a8,8,0,0,1,8-8H96V56a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8V72h40a8,8,0,0,1,8,8v8h24A16,16,0,0,1,240,104Z"/>
  </svg>
`;
document.getElementById('stat-days').textContent = `${daysDiff} дней`;

  updateChart(data, total);
  calculateCostPerKm(data);
  calculatePureRunningCost(data);
  calculateFuelStats(data);
document.getElementById('stat-total-amount').textContent = total.toFixed(2);
}

function calculateCostPerKm(data) {
  const mileageEntries = data.filter(e => e.mileage && !isNaN(Number(e.mileage)));
  if (mileageEntries.length < 2) {
    document.getElementById('stat-cost-total').textContent = '—';
    return;
  }
  const sorted = [...mileageEntries].sort((a, b) => a.date.localeCompare(b.date));
  const startMileage = Number(sorted[0].mileage);
  const endMileage = Number(sorted[sorted.length - 1].mileage);
  const distance = endMileage - startMileage;
  const totalAmount = data.reduce((sum, e) => sum + Number(e.amount), 0);
  const costPerKm = distance > 0 ? (totalAmount / distance) : 0;

  document.getElementById('stat-cost-total').textContent = costPerKm.toFixed(2);
}

function calculatePureRunningCost(data) {
  const relevantCosts = data.filter(e =>
    e.category === 'Топливо' || (e.tag && e.tag.toLowerCase() === 'масло')
  );
  const mileageEntries = data.filter(e => e.mileage && !isNaN(Number(e.mileage)));
  if (mileageEntries.length < 2) {
    document.getElementById('stat-cost-pure').textContent = '—';
    return;
  }
  const sorted = [...mileageEntries].sort((a, b) => a.date.localeCompare(b.date));
  const distance = Number(sorted[sorted.length - 1].mileage) - Number(sorted[0].mileage);
  const totalAmount = relevantCosts.reduce((sum, e) => sum + Number(e.amount), 0);
  const cost = distance > 0 ? (totalAmount / distance) : 0;

  document.getElementById('stat-cost-pure').textContent = cost.toFixed(2);
}
 function calculateFuelStats(data) {
  const fuelEntries = data.filter(e =>
    e.category === 'Топливо' &&
    e.liters && !isNaN(Number(e.liters)) &&
    e.amount && !isNaN(Number(e.amount))
  );
  const mileageEntries = data.filter(e => e.mileage && !isNaN(Number(e.mileage)));
  const sorted = [...mileageEntries].sort((a, b) => a.date.localeCompare(b.date));
  const distance = sorted.length >= 2 ? Number(sorted[sorted.length - 1].mileage) - Number(sorted[0].mileage) : 0;
  const totalLiters = fuelEntries.reduce((sum, e) => sum + Number(e.liters), 0);
  const totalAmount = fuelEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  const consumption = distance > 0 ? (totalLiters / distance * 100) : null;
  const pricePerLiter = totalLiters > 0 ? (totalAmount / totalLiters) : null;

  document.getElementById('stat-consumption').textContent =
  consumption !== null ? consumption.toFixed(1) : '—';

document.getElementById('stat-price-fuel').textContent =
  pricePerLiter !== null ? pricePerLiter.toFixed(2) : '—';
   }
 


function deleteExpense(id) {
  if (!db) {
    console.error("Firestore не инициализирован (deleteExpense)");
    return;
  }

  if (confirm("Удалить запись?")) {
    db.collection("users").doc(profileCode).collection("expenses").doc(id).delete()
.then(() => showToast("Запись удалена"));
  }
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

// --- Функция для списания суммы из конверта MiniBudget ---
async function subtractFromMiniBudget(amount) {
  // Получаем ссылку на Firestore (db уже определён выше)
  // envelopes коллекция находится в общем пространстве, без users/mini
  const snapshot = await firebase.firestore().collection("envelopes").where("isMiniBudget", "==", true).limit(1).get();
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const ref = firebase.firestore().collection("envelopes").doc(doc.id);
    await firebase.firestore().runTransaction(async (t) => {
      const d = await t.get(ref);
      t.update(ref, { current: (d.data().current || 0) - amount });
    });
  }
}


form.onsubmit = (e) => {
  e.preventDefault();
 if (!db) {
    console.error("Firestore не инициализирован (form submit)");
    return;
  }
  const id = document.getElementById('edit-id').value;
  const category = document.getElementById('category').value;
  const amount = parseFloat(document.getElementById('amount').value.replace(',', '.'));
  const mileage = document.getElementById('mileage').value;
  const liters = parseFloat(document.getElementById('liters').value.replace(',', '.'));
  const date = document.getElementById('date').value || new Date().toISOString().split('T')[0];
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
 // --- Вот здесь вызываем списание из MiniBudget ---
      subtractFromMiniBudget(amount);
    });
  }
const dateInput = document.getElementById('date');
if (dateInput && !dateInput.value) {
  dateInput.value = new Date().toISOString().split('T')[0];
}
showToast("Расход добавлен!");
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
loadReminders(); // добавь эту строку
}

function updateChart(data, total) {
  const categoriesMap = {};

  data.forEach(entry => {
    const cat = entry.category;
    const value = Number(entry.amount);
    if (!categoriesMap[cat]) categoriesMap[cat] = 0;
    categoriesMap[cat] += value;
  });

 const colors = ['#D2AF94', '#186663', '#A6B5B4', '#8C7361', '#002D37',
                  '#5E8C8A', '#C4B59F', '#7F6A93', '#71A1A5', '#A58C7D', '#BFB4A3'];

  const sortedEntries = Object.entries(categoriesMap)
  .map(([label, value]) => ({ label, value }))
  .sort((a, b) => b.value - a.value);

const labels = sortedEntries.map(entry => entry.label);
const values = sortedEntries.map(entry => entry.value);
const legendColors = sortedEntries.map((_, i) => colors[i % colors.length]);

 
if (expenseChart) expenseChart.destroy();

  expenseChart = new ApexCharts(document.querySelector("#mini-donut-chart"), {
    chart: {
      type: 'donut',
      width: 200,
    },
    series: values,
    labels: labels,
    colors: legendColors,
    dataLabels: {
      enabled: false
    },
    legend: {
      show: false
    },
    tooltip: {
      y: {
        formatter: val => `€${val.toFixed(2)}`
      }
    },

plotOptions: {
  pie: {
    donut: {
      size: '55%',
      labels: {
        show: true,
        name: {
          show: false
        },
        value: {
          show: false // отключаем всплывающее значение при наведении
        },
        total: {
          show: true,
          showAlways: true, // 👈 обязательно!
          fontSize: '14px',
          fontWeight: 600,
          color: '#222',
          formatter: () => `€${total.toFixed(2)}`
        }
      }
    }
  }
} // ← это закрывает plotOptions целиком

}); // ← это закрывает new ApexCharts(...)

expenseChart.render();
  // кастомная легенда
  const legendContainer = document.getElementById("custom-legend");
  if (!legendContainer) return;
  legendContainer.innerHTML = "";

  const totalSum = values.reduce((a, b) => a + b, 0);
  const legendItems = sortedEntries.map((entry, i) => ({
  label: entry.label,
  value: entry.value,
  color: legendColors[i],
  percent: ((entry.value / totalSum) * 100).toFixed(1)
})).sort((a, b) => b.value - a.value);

  legendItems.forEach(entry => {
    const row = document.createElement("div");
    row.className = "legend-row";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.fontSize = "11px";
    row.style.lineHeight = "1.4";

    row.innerHTML = `
      <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${entry.color}"></span>
      <span style="flex:1;">${entry.label}</span>
      <span style="min-width: 60px; text-align:right;">€${entry.value.toFixed(2)}</span>
      <span style="min-width: 40px; text-align:right;">${entry.percent}%</span>
    `;
    legendContainer.appendChild(row);
  });
}


function resetForm() {
  if (!form) return;
  form.reset();
  document.getElementById('edit-id').value = '';
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('date');
  if (dateInput && !dateInput.value) {
    dateInput.value = today;
  }
}


function formatDate(isoString) {
  const [year, month, day] = isoString.split("-");
  return `${day}.${month}.${year}`;
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



function renderInlineInfoBoard(notifications) {
  const board = document.getElementById('inline-info-board');
  if (!board) return;
  board.innerHTML = '';
  notifications.forEach(n => {
    board.innerHTML += `
      <div class="info-row ${n.status}" style="padding: 2px 6px;">
        <div class="info-menu">
          <button class="alert-button ${n.status}" onclick="toggleMenu(this)">
  <span data-lucide="${n.icon}"></span>
</button>

          <div class="menu-actions hidden">
            <button onclick="editInfoEntry('${n.id}')"><span data-lucide="pencil"></span></button>
            <button onclick="showInfoImage('${n.imageUrl || ''}')"><span data-lucide="image"></span></button>
            <button onclick="deleteInfoEntry('${n.id}')"><span data-lucide="trash-2"></span></button>
          </div>
        </div>
        <span>${n.text}</span>
      </div>
    `;
  });
  lucide.createIcons();
}

function renderInlineInfoBoardHeader(notifications) {
  const board = document.getElementById('inline-info-board');
  if (!board) return;

  const infoAddWrapper = document.getElementById('info-add-wrapper');
  const isCollapsed = infoAddWrapper?.classList.contains('collapsed');

  if (isCollapsed && notifications.length > 0) {
    const n = notifications[0];
    board.innerHTML = `
      <div class="info-row ${n.status}" style="padding: 2px 6px;">
        <div class="info-menu">
          <button class="alert-button ${n.status}" onclick="toggleMenu(this)">
            <span data-lucide="${n.icon}"></span>
          </button>
          <div class="menu-actions hidden">
            <button onclick="editInfoEntry('${n.id}')"><span data-lucide="pencil"></span></button>
            <button onclick="showInfoImage('${n.imageUrl || ''}')"><span data-lucide="image"></span></button>
            <button onclick="deleteInfoEntry('${n.id}')"><span data-lucide="trash-2"></span></button>
          </div>
        </div>
        <span>${n.text}</span>
      </div>
    `;
  } else {
    renderInlineInfoBoard(notifications);
  }

  lucide.createIcons();
}

function toggleMenu(button) {
  const menu = button.nextElementSibling;
  if (!menu) return;
  document.querySelectorAll(".menu-actions").forEach(el => {
    if (el !== menu) el.classList.add("hidden");
  });
  menu.classList.toggle("hidden");
}


function loadReminders() {
  if (!db) {
    console.error("Firestore не инициализирован (loadReminders)");
    return;
  }

  db.collection("users").doc(profileCode).collection("reminders")
    .onSnapshot(snapshot => {
      const reminders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const processed = processReminders(reminders);
renderInlineInfoBoardHeader(processed);


    });
}

function processReminders(reminders) {
  const lastMileage = expenses.reduce((max, e) => e.mileage && Number(e.mileage) > max ? Number(e.mileage) : max, 0);
  const today = new Date();
  return reminders.map(r => {
    let kmLeft = null, daysLeft = null, text = "", icon = "circle", status = "gray";
    if (r.mileage && r.interval) {
      kmLeft = (Number(r.mileage) + Number(r.interval)) - lastMileage;
    }
    if (r.dateEnd) {
      const d1 = new Date(r.dateEnd);
      daysLeft = Math.ceil((d1 - today) / (1000*60*60*24));
    }
    let details = [];
    if (kmLeft !== null) details.push(`${kmLeft >= 0 ? "" : "-"}${kmLeft} км`);
    if (daysLeft !== null) details.push(`${daysLeft >= 0 ? "" : "-"}${daysLeft} дней`);
    text = `${r.tag} — ${details.join(" / ")}`;

    if ((kmLeft !== null && kmLeft < 0) || (daysLeft !== null && daysLeft < 0)) {
      status = "expired";
      icon = "alert-triangle";
    } else if ((kmLeft !== null && kmLeft <= 500) || (daysLeft !== null && daysLeft <= 7)) {
      status = "red";
      icon = "alert-triangle";
    } else if ((kmLeft !== null && kmLeft <= 1000) || (daysLeft !== null && daysLeft <= 21)) {
      status = "orange";
      icon = "alert-triangle";
    } else if ((kmLeft !== null && kmLeft <= 2000) || (daysLeft !== null && daysLeft <= 60)) {
      status = "yellow";
      icon = "alert-triangle";
    }

    return {
      id: r.id,
      status,
      icon,
      text,
      imageUrl: r.imageUrl || ""
    };
  }).sort((a, b) => {
    const statusOrder = { expired: 0, red: 1, orange: 2, yellow: 3, gray: 4 };
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
    const aNum = a.text.match(/-?\\d+/) ? Math.abs(Number(a.text.match(/-?\\d+/)[0])) : 99999;
    const bNum = b.text.match(/-?\\d+/) ? Math.abs(Number(b.text.match(/-?\\d+/)[0])) : 99999;
    return aNum - bNum;
  });
}


function deleteInfoEntry(id) {
  if (confirm("Удалить напоминание?")) {
    db.collection("users").doc(profileCode).collection("reminders").doc(id).delete()
.then(() => showToast("Напоминание удалено"));
  }
}

function editInfoEntry(id) {
  db.collection("users").doc(profileCode).collection("reminders").doc(id).get().then(doc => {
    if (!doc.exists) return;
    const r = doc.data();
    editingReminderId = id;

    // Разворачиваем блок "Добавить напоминание"
    const toggle = document.getElementById("toggle-info-add");
if (toggle) {
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
}


    // Заполняем все поля формы напоминания
    setTimeout(() => { // задержка чтобы точно DOM был готов
      if (document.getElementById('info-type')) document.getElementById('info-type').value = r.type || "";
      if (document.getElementById('info-tag')) document.getElementById('info-tag').value = r.tag || "";
      if (document.getElementById('info-mileage')) document.getElementById('info-mileage').value = r.mileage || "";
      if (document.getElementById('info-interval')) document.getElementById('info-interval').value = r.interval || "";
      if (document.getElementById('info-date-start')) document.getElementById('info-date-start').value = r.dateStart || "";
      if (document.getElementById('info-date-end')) document.getElementById('info-date-end').value = r.dateEnd || "";
      if (document.getElementById("info-add-photo-btn")) document.getElementById("info-add-photo-btn").classList.remove("selected");
      if (document.getElementById("info-add-photo")) document.getElementById("info-add-photo").value = "";
    }, 100); // 100ms задержки хватит
  });
}
function showToast(message = "Готово!") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hidden");
  }, 2000);
}

function showInfoImage(url) { /* ...добавить позже... */ }
// Сворачивание блока добавления напоминания

  