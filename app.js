let db;

window.addEventListener("load", () => {
  db = firebase.firestore();
  loadExpenses();
  populateTagList();
  resetForm();
  // 📸 Выбор способа загрузки изображения — камера или галерея
  const photoBtn = document.getElementById("info-add-photo-btn");

  // Создаём два скрытых инпута
  const inputCamera = document.createElement("input");
  inputCamera.type = "file";
  inputCamera.accept = "image/*";
  inputCamera.capture = "environment";
  inputCamera.style.display = "none";

  const inputGallery = document.createElement("input");
  inputGallery.type = "file";
  inputGallery.accept = "image/*";
  inputGallery.style.display = "none";

  document.body.appendChild(inputCamera);
  document.body.appendChild(inputGallery);

  photoBtn?.addEventListener("click", () => {
  const choice = confirm("Нажми OK — чтобы открыть камеру\nНажми Отмена — чтобы выбрать из галереи");

  const handleChange = (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const input = document.getElementById("info-add-photo");
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;

      photoBtn.classList.add("selected");
    }
  };

  if (choice) {
    inputCamera.onchange = handleChange;
    inputCamera.click();
  } else {
    inputGallery.onchange = handleChange;
    inputGallery.click();
  }
});

  // Обработка выбранного файла из камеры или галереи
  function handlePhotoSelect(file) {
    const btn = document.getElementById("info-add-photo-btn");
    const input = document.getElementById("info-add-photo");
    if (file && btn && input) {
      // Копируем выбранный файл в скрытое поле формы
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;

      btn.classList.add("selected");
    }
  }

  inputCamera.addEventListener("change", () => {
    if (inputCamera.files.length > 0) {
      handlePhotoSelect(inputCamera.files[0]);
    }
  });

  inputGallery.addEventListener("change", () => {
    if (inputGallery.files.length > 0) {
      handlePhotoSelect(inputGallery.files[0]);
    }
  });


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
    });
  }
});
;const profileCode = "mini";

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
  const type = document.getElementById('info-type').value;
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
  const data = { type, tag, mileage, interval, dateStart, dateEnd };
  if (imageUrl) data.imageUrl = imageUrl;

  if (editingReminderId) {
    // обновляем запись
    await db.collection("users").doc(profileCode).collection("reminders").doc(editingReminderId).update(data);
    editingReminderId = null;
  } else {
    // новая запись
    if (!imageUrl) data.imageUrl = "";
    data.created = Date.now();
    await db.collection("users").doc(profileCode).collection("reminders").add(data);
  }
  infoAddForm.reset();
  document.getElementById("info-add-photo-btn").classList.remove("selected");
  // Автозаполнение сегодняшней даты после сброса
  const dateStartInput = document.getElementById('info-date-start');
  if (dateStartInput) {
    dateStartInput.value = new Date().toISOString().split('T')[0];
  }
};


function resetInfoAddForm() {
  document.getElementById("info-add-form").reset();
  document.getElementById("info-add-photo-btn").classList.remove("selected");
  editingReminderId = null;
  // Автозаполнение сегодняшней даты после сброса
  const dateStartInput = document.getElementById('info-date-start');
  if (dateStartInput) {
    dateStartInput.value = new Date().toISOString().split('T')[0];
  }
} 

// ← ВОТ ЭТА СКОБКА!function loadExpenses() {
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
      loadReminders();  // ← вот это!
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


function loadReminders() {
  db.collection("users").doc(profileCode).collection("reminders")
    .onSnapshot(snapshot => {
      const reminders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderInfoBoard(processReminders(reminders));
    });
}

function processReminders(reminders) {
  // Найти последний пробег из расходов
  const lastMileage = expenses.reduce((max, e) => e.mileage && Number(e.mileage) > max ? Number(e.mileage) : max, 0);
  const today = new Date();
  return reminders.map(r => {
    let kmLeft = null, daysLeft = null, text = "", icon = "circle", status = "gray";
    if (r.type === "service" && r.mileage && r.interval) {
      kmLeft = (Number(r.mileage) + Number(r.interval)) - lastMileage;
    }
    if (r.dateEnd) {
      const d1 = new Date(r.dateEnd);
      daysLeft = Math.ceil((d1 - today) / (1000*60*60*24));
    }
    // Формируем текст напоминания
    let details = [];
    if (kmLeft !== null) details.push(`${kmLeft >= 0 ? "осталось" : "просрочено"}: ${kmLeft} км`);
    if (daysLeft !== null) details.push(`${daysLeft >= 0 ? "осталось" : "просрочено"}: ${daysLeft} дней`);
    text = `${r.tag} — ${details.join(" / ")}`;
    // Статус и иконка
    if ((kmLeft !== null && kmLeft < 0) || (daysLeft !== null && daysLeft < 0)) { status = "black"; icon = "alert-triangle"; }
    else if ((kmLeft !== null && kmLeft <= 1000) || (daysLeft !== null && daysLeft <= 30)) { status = "red"; icon = "alert-triangle"; }
    else if ((kmLeft !== null && kmLeft <= 2000) || (daysLeft !== null && daysLeft <= 60)) { status = "yellow"; icon = "alert-triangle"; }
    return {
      id: r.id,
      status,
      icon,
      text,
      imageUrl: r.imageUrl || ""
    };
  }).sort((a, b) => {
    // Сортировка: черные, красные, жёлтые, серые, внутри — по ближайшему сроку
    const statusOrder = { black: 0, red: 1, yellow: 2, gray: 3 };
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
    // по наименьшему остатку км или дней
    const aNum = a.text.match(/-?\d+/) ? Math.abs(Number(a.text.match(/-?\d+/)[0])) : 99999;
    const bNum = b.text.match(/-?\d+/) ? Math.abs(Number(b.text.match(/-?\d+/)[0])) : 99999;
    return aNum - bNum;
  });
}

function deleteInfoEntry(id) {
  if (confirm("Удалить напоминание?")) {
    db.collection("users").doc(profileCode).collection("reminders").doc(id).delete();
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

function showInfoImage(url) { /* ...добавить позже... */ }
// Сворачивание блока добавления напоминания

  