// envelopes-app.js

// Firebase config
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

const form = document.getElementById("add-envelope-form");
const nameInput = document.getElementById("envelope-name");
const goalInput = document.getElementById("envelope-goal");
const commentInput = document.getElementById("envelope-comment");
const list = document.getElementById("envelope-list");

const incomeButton = document.getElementById("distribute-income");
if (incomeButton) {
  incomeButton.addEventListener("click", distributeIncome);
}
document.getElementById('cancel-edit-btn').addEventListener('click', function() {
  editingEnvelopeId = null;
  form.reset();
renderInlineDistributionEditor();

  document.getElementById('envelope-goal').style.display = 'none';
  document.getElementById('envelope-percent').style.display = 'none';
  document.getElementById('envelope-percent-label').style.display = 'none';
  const submitBtn = document.querySelector('#add-envelope-form button[type="submit"]');
  submitBtn.innerHTML = '<span data-lucide="check"></span>';
  this.style.display = 'none';
  lucide.createIcons();
});
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById('envelope-name').value.trim();
  const hasGoal = document.getElementById('envelope-has-goal').checked;
  const goal = hasGoal ? Number(document.getElementById('envelope-goal').value) : 0;
  const comment = document.getElementById('envelope-comment').value.trim();
  const distribution = document.getElementById('envelope-distribution').checked;
  const percent = distribution ? Number(document.getElementById('envelope-percent').value) : 0;

  if (!name) return;

  try {
    if (editingEnvelopeId) {
      await db.collection("envelopes").doc(editingEnvelopeId).update({
        name,
        goal,
        comment,
        includeInDistribution: distribution,
        percent
      });
      editingEnvelopeId = null;
      document.getElementById('cancel-edit-btn').style.display = 'none';
      const submitBtn = document.querySelector('#add-envelope-form button[type="submit"]');
      submitBtn.innerHTML = '<span data-lucide="check"></span>';
      lucide.createIcons();
    } else {
      await db.collection("envelopes").add({
        name,
        goal,
        comment,
        current: 0,
        created: Date.now(),
        includeInDistribution: distribution,
        percent
      });
    }
    form.reset();
    document.getElementById('envelope-goal').style.display = 'none';
    document.getElementById('envelope-percent').style.display = 'none';
    document.getElementById('envelope-percent-label').style.display = 'none';
    loadEnvelopes();
  } catch (err) {
    alert("Ошибка при добавлении: " + err.message);
  }
});

async function renderInlineDistributionEditor() {
  const container = document.getElementById('inline-distribution-editor');
  if (!container) return;
  // Показывать только если чекбокс распределения отмечен
  container.style.display = 'block';


  // Загружаем конверты (без isPrimary)
  const snapshot = await db.collection("envelopes").orderBy("created", "asc").get();
  if (snapshot.empty) {
    container.innerHTML = "<span style='color:#aaa'>Нет других конвертов для распределения.</span>";
    return;
  }

  // Фильтруем те, что участвуют в распределении (кроме текущего редактируемого)
  const editingId = editingEnvelopeId;
  const envelopes = snapshot.docs.filter(doc =>
    !doc.data().isPrimary &&
    (!editingId || doc.id !== editingId)
  );

  // Собираем UI
  let html = `<div style="font-weight:600; margin-bottom:6px;">Распределение по конвертам:</div>`;
  let total = 0;
  envelopes.forEach(doc => {
    const data = doc.data();
    const percent = Math.min(100, Math.round(data.percent || 0));
    total += percent;
    html += `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px; font-size: 14px;">
        <span style="width:36px; text-align:right;">${percent}%</span>
        <span>${data.name}</span>
      </div>
    `;
  });

  // Текущий конверт (тот, который в форме сейчас)
  const ownPercent = Number(document.getElementById('envelope-percent').value || 0);
  total += ownPercent;

  html += `<div style="margin-top: 8px; font-size:13px;">
    <strong>Итого распределено:</strong> <span id="inline-dist-total" style="font-weight:600; ${total>100?'color:#C93D1F':total<100?'color:#E1A700':'color:#186663'}">${total}%</span>
    <span style="color:#888">/ 100%</span>
  </div>`;
  if (total > 100) {
    html += `<div style="color:#C93D1F; font-weight:500;">Внимание: распределено больше 100%!</div>`;
  } else if (total < 100) {
    html += `<div style="color:#E1A700; font-weight:500;">Внимание: часть суммы не распределена!</div>`;
  } else {
    html += `<div style="color:#186663;">Распределение корректно.</div>`;
  }

  container.innerHTML = html;
}

let editingEnvelopeId = null;

function fillEditForm(data, id) {
  document.getElementById('envelope-name').value = data.name || "";
  document.getElementById('envelope-comment').value = data.comment || "";
  document.getElementById('envelope-has-goal').checked = !!(data.goal && data.goal > 0);
  document.getElementById('envelope-goal').style.display = (data.goal && data.goal > 0) ? 'inline-block' : 'none';
  document.getElementById('envelope-goal').value = data.goal && data.goal > 0 ? data.goal : '';
  document.getElementById('envelope-distribution').checked = data.includeInDistribution === undefined ? true : !!data.includeInDistribution;
  document.getElementById('envelope-percent').style.display = document.getElementById('envelope-percent-label').style.display =
    document.getElementById('envelope-distribution').checked ? 'inline-block' : 'none';
  document.getElementById('envelope-percent').disabled = !document.getElementById('envelope-distribution').checked;
  document.getElementById('envelope-percent').value = data.percent || 0;
  document.getElementById('envelope-percent-label').textContent = (data.percent || 0) + "%";
  editingEnvelopeId = id;

  // Меняем кнопку: ставим "save" вместо "check"
  const submitBtn = document.querySelector('#add-envelope-form button[type="submit"]');
  submitBtn.innerHTML = '<span data-lucide="save"></span>';
  document.getElementById('cancel-edit-btn').style.display = 'inline-flex';
  lucide.createIcons();
renderInlineDistributionEditor();

}


async function loadEnvelopes() {
  list.innerHTML = "<p style='color:#999'>Загрузка...</p>";
  const snapshot = await db.collection("envelopes").orderBy("created", "asc").get();
  if (snapshot.empty) {
    list.innerHTML = "<p style='color:#bbb'>Нет ни одного конверта</p>";
    return;
  }
  list.innerHTML = "";

  const envelopes = snapshot.docs;
const primary = envelopes.find(doc => doc.data().isPrimary);
const miniBudget = envelopes.find(doc => doc.data().isMiniBudget);
const others = envelopes.filter(doc => !doc.data().isPrimary && !doc.data().isMiniBudget);



// Итоговый порядок: Общий → MiniBudget → остальные
const ordered = [];
if (primary) ordered.push(primary);
if (miniBudget) ordered.push(miniBudget);
ordered.push(...others);


 function calculateRemainingPercent() {
  // Суммируем percent для всех конвертов, кроме isPrimary
  return envelopes.reduce((acc, doc) => {
    if (!doc.data().isPrimary) {
      return acc + parseFloat(doc.data().percent || 0);
    }
    return acc;
  }, 0);
}
const remaining = 100 - calculateRemainingPercent();


  ordered.forEach(doc => {
    const data = doc.data();
    const percent = Math.min(100, Math.round(data.percent || 0));
    const isMiniBudget = data.isMiniBudget === true;
    const isPrimary = data.isPrimary === true;
    const block = document.createElement("div");

   block.className = "block envelope-block"; // 👈 добавляем envelope-block
block.innerHTML = `
  <div class="expense-entry">
    <div class="expense-left">
<div class="top-line" style="display:flex; align-items:center; gap:14px; justify-content:space-between;">
  <span class="top-name" style="display:flex; align-items:center; gap:12px;">
    <strong>${data.name}</strong>
    ${isPrimary ? "<span style='color:#999'>(общий)</span>" : ""}
    <span style="font-size:0.97em; color:#888; min-width:38px;">
      ${
        isPrimary
          ? (typeof remaining === 'number' ? remaining : 0) + "%"
          : (typeof data.percent === 'number' ? data.percent : 0) + "%"
      }
    </span>
  </span>
  ${(!isPrimary && !isMiniBudget && data.goal && data.goal > 0)
  ? `<div class="progress-ring" style="width:36px; height:36px; margin-left:6px;">
      <svg width="36" height="36">
        <circle cx="18" cy="18" r="16" stroke="#888" stroke-width="4" fill="none"/>
        <circle
          cx="18" cy="18" r="16"
          stroke="#f7931e"
          stroke-width="4"
          fill="none"
          stroke-linecap="round"
          stroke-dasharray="${2 * Math.PI * 16}"
          stroke-dashoffset="${2 * Math.PI * 16 * (1 - Math.min(1, data.current / data.goal))}"
          style="transition: stroke-dashoffset 0.4s;"/>
        <text x="18" y="22" text-anchor="middle" font-size="13" fill="#f7931e" font-weight="bold">
          ${Math.round(Math.min(1, data.current / data.goal) * 100)}%
        </text>
      </svg>
    </div>`
  : ""
}
</div>

      <div class="bottom-line">
  <span>
    €${data.current.toFixed(2)} / ${
      (isPrimary || isMiniBudget || !data.goal || data.goal == 0)
         ? '<span style="font-size:1.35em;vertical-align:-2px;">&#8734;</span>'
        : "€" + data.goal.toFixed(2)
    }
  </span>
  ${data.comment ? `<div class="info-line">${data.comment}</div>` : ""}
  ${data.includeInDistribution === false && !isPrimary ? `<div class="info-line" style="color:#aaa">Не участвует в распределении</div>` : ""}
</div>

    </div>
    <div class="expense-right" style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
      <!-- Кнопка меню (3 полоски) -->
      ${!isPrimary ? `
  <button class="round-btn menu small menu-btn" data-id="${doc.id}">
    <span data-lucide="menu"></span>
  </button>
` : ""}
           <!-- 4 основные круглые кнопки -->
            <button class="round-btn blue small" onclick="addToEnvelope('${doc.id}')">
        <span data-lucide="plus"></span>
      </button>
      <button class="round-btn red small" onclick="subtractFromEnvelope('${doc.id}')">
        <span data-lucide="minus"></span>
      </button>
      <button class="round-btn orange small" onclick="transferEnvelope('${doc.id}', ${data.current})">
        <span data-lucide="move-horizontal"></span>
      </button>
    </div>
  </div>
`;

    list.appendChild(block);
  });
setTimeout(() => {
  document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      showEnvelopeMenu(btn, id);
    });
  });
}, 0);

  lucide.createIcons();
}

// остальные функции не изменялись...

async function subtractFromEnvelope(id) {
  const amount = prompt("Сколько вычесть (€)?");
  const value = parseFloat(amount);
  if (isNaN(value) || value <= 0) return;
  const ref = db.collection("envelopes").doc(id);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    const data = doc.data();
    t.update(ref, { current: (data.current || 0) - value });
  });
  loadEnvelopes();
}

async function addToEnvelope(id) {
  const amount = prompt("Сколько добавить (€)?");
  const value = parseFloat(amount);
  if (isNaN(value) || value <= 0) return;
  const ref = db.collection("envelopes").doc(id);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    const data = doc.data();
    t.update(ref, { current: (data.current || 0) + value });
  });
  loadEnvelopes();
}

async function editEnvelope(id, oldName, oldGoal, oldComment, oldPercent, oldInclude) {
  const newName = prompt("Новое название:", oldName);
  const newGoal = prompt("Новая цель (€):", oldGoal);
  const newComment = prompt("Комментарий:", oldComment);
  const newPercent = prompt("Процент (%):", oldPercent);
  const includeInDistribution = confirm("Включить в автораспределение?");
  const name = newName?.trim();
  const goal = parseFloat(newGoal);
  const comment = newComment?.trim();
  const percent = parseFloat(newPercent);
  if (!name || isNaN(goal) || goal <= 0 || isNaN(percent)) return;
  await db.collection("envelopes").doc(id).update({ name, goal, comment, percent, includeInDistribution });
  loadEnvelopes();
}

async function deleteEnvelope(id) {
  const ref = db.collection("envelopes").doc(id);
  const snap = await ref.get();
 if (snap.exists && (snap.data().isPrimary || snap.data().isMiniBudget)) {
  alert("Нельзя удалить этот конверт.");
  return;
}
  if (!confirm("Удалить этот конверт?")) return;
  await ref.delete();
  loadEnvelopes();
}


async function transferEnvelope(fromId, maxAmount) {
  const amount = prompt("Сколько перевести (€)?");
  const value = parseFloat(amount);
  if (isNaN(value) || value <= 0 || value > maxAmount) return;
  const toId = prompt("ID конверта, в который перевести:");
  if (!toId || toId === fromId) return;
  const fromRef = db.collection("envelopes").doc(fromId);
  const toRef = db.collection("envelopes").doc(toId);
  await db.runTransaction(async (t) => {
    const fromDoc = await t.get(fromRef);
    const toDoc = await t.get(toRef);
    if (!fromDoc.exists || !toDoc.exists) throw new Error("Один из конвертов не найден");
    const fromData = fromDoc.data();
    const toData = toDoc.data();
    t.update(fromRef, { current: (fromData.current || 0) - value });
    t.update(toRef, { current: (toData.current || 0) + value });
  });
  loadEnvelopes();
}

async function distributeIncome() {
  const amount = prompt("Сколько дохода добавить (€)?");
  const total = parseFloat(amount);
  if (isNaN(total) || total <= 0) return;

  // Получаем все конверты
  const snapshot = await db.collection("envelopes").orderBy("created", "asc").get();
  if (snapshot.empty) {
    alert("Нет доступных конвертов для распределения.");
    return;
  }

  // Находим основной (общий) конверт
  let primaryId = null, primaryCurrent = 0;
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.isPrimary) {
      primaryId = doc.id;
      primaryCurrent = data.current || 0;
    }
  });

  if (!primaryId) {
    alert("Основной конверт не найден.");
    return;
  }

  // Распределяем проценты
  let distributed = 0;
  await Promise.all(snapshot.docs.map(async (doc) => {
    const data = doc.data();
    if (data.includeInDistribution && !data.isPrimary) {
      const percent = parseFloat(data.percent || 0);
      const part = total * (percent / 100);
      distributed += part;
      await db.collection("envelopes").doc(doc.id).update({
        current: (data.current || 0) + part
      });
    }
  }));

  // Остаток — в "Общий"
  const leftover = total - distributed;
  if (leftover > 0) {
    await db.collection("envelopes").doc(primaryId).update({
      current: primaryCurrent + leftover
    });
  }
  loadEnvelopes();
}

// === ДОБАВЬ вместо ensurePrimaryEnvelopeExists ===
async function ensureSystemEnvelopes() {
  // 1. Создаём "Общий", если его нет
  const primary = await db.collection("envelopes").where("isPrimary", "==", true).limit(1).get();
  if (primary.empty) {
    await db.collection("envelopes").add({
      name: "Общий",
      goal: 1000000,
      comment: "Основной конверт",
      current: 0,
      created: Date.now(),
      percent: 0,
      includeInDistribution: false,
      isPrimary: true
    });
    console.log("✅ Конверт 'Общий' создан автоматически");
  }

  // 2. Создаём "MiniBudget", если его нет
  const miniBudget = await db.collection("envelopes").where("isMiniBudget", "==", true).limit(1).get();
  if (miniBudget.empty) {
    await db.collection("envelopes").add({
      name: "MiniBudget",
      goal: 1000000,
      comment: "Mini Budget. Деньги списываются автоматически",
      current: 0,
      created: Date.now(),
      percent: 0,
      includeInDistribution: true,
      isMiniBudget: true
    });
    console.log("✅ Конверт 'MiniBudget' создан автоматически");
  }
}
window.addEventListener("DOMContentLoaded", async () => {
  await ensureSystemEnvelopes();
  loadEnvelopes();
});

document.getElementById('envelope-has-goal').addEventListener('change', function() {
  document.getElementById('envelope-goal').style.display = this.checked ? 'inline-block' : 'none';
});

document.getElementById('envelope-distribution').addEventListener('change', function() {
  const range = document.getElementById('envelope-percent');
  const label = document.getElementById('envelope-percent-label');
  range.style.display = label.style.display = this.checked ? 'inline-block' : 'none';
  range.disabled = !this.checked;
  renderInlineDistributionEditor();
});

document.getElementById('envelope-percent').addEventListener('input', function() {
  document.getElementById('envelope-percent-label').textContent = this.value + "%";
  renderInlineDistributionEditor();
});

// Один отдельный вызов для инициализации, если нужно:
renderInlineDistributionEditor();

// envelopes-app.js (финальная версия openDistributionEditor)

// envelopes-app.js (финальная версия openDistributionEditor)

async function openDistributionEditor() {
  const snapshot = await db.collection("envelopes").orderBy("created", "asc").get();
  if (snapshot.empty) {
    alert("Нет доступных конвертов для настройки.");
    return;
  }

  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.background = "#f0f0f0";
  modal.style.padding = "24px";
  modal.style.borderRadius = "12px";
  modal.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
  modal.style.zIndex = "9999";
  modal.style.width = "320px";

  const container = document.createElement("div");
  container.innerHTML = `<h3 style='margin-bottom: 12px'>Настройка процентов</h3>`;

  const ranges = [];

  const totalSumDisplay = document.createElement("div");
  totalSumDisplay.style.margin = "8px 0";
  container.appendChild(totalSumDisplay);

  snapshot.forEach(doc => {
    const data = doc.data();
   if (data.isPrimary) return;

// а для MiniBudget ничего не фильтруем!

    const row = document.createElement("div");
    row.style.marginBottom = "16px";
    const percentValue = data.percent || 0;
  row.innerHTML = `
  <div style="display:flex; align-items:center; gap:8px; font-weight:bold; margin-bottom:4px;">
    <input type="checkbox" id="cb-${doc.id}" ${data.includeInDistribution !== false ? "checked" : ""} style="accent-color:#186663; width:18px; height:18px; margin:0;">
    <span id='label-${doc.id}' style='min-width:36px; text-align:right;'>${percentValue}%</span>
    <span>${data.name}</span>
  </div>
  <input type='range' min='0' max='100' step='1' value='${percentValue}' id='range-${doc.id}' style='width:100%'>
`;


    container.appendChild(row);
    ranges.push({ id: doc.id });
  });

// После того как все row/range/checkbox созданы:
ranges.forEach(r => {
  const range = document.getElementById(`range-${r.id}`);
  const cb = document.getElementById(`cb-${r.id}`);
  const label = document.getElementById(`label-${r.id}`);
  if (range && cb && label) {
    // инициализация
    range.disabled = !cb.checked;
    if (!cb.checked) {
      range.value = 0;
      label.textContent = "0%";
    }
    // слушатель чекбокса
    cb.addEventListener("change", () => {
      if (cb.checked) {
        range.disabled = false;
        // НЕ меняем range.value — пусть пользователь сам крутит!
      } else {
        range.value = 0;
        range.disabled = true;
        label.textContent = "0%";
      }
      updateTotalDisplay();
    });
    // слушатель бегунка для лейбла
    range.addEventListener("input", () => {
      label.textContent = `${range.value}%`;
      updateTotalDisplay();
    });
  }
});

setTimeout(() => {
  document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      showEnvelopeMenu(btn, id);
    });
  });
}, 0);

  function calculateTotalPercent() {
    return ranges.reduce((acc, r) => acc + parseFloat(document.getElementById(`range-${r.id}`).value || 0), 0);
  }

  function updateTotalDisplay() {
    const total = calculateTotalPercent();
    const remaining = 100 - total;
    totalSumDisplay.innerHTML = `🧮 Распределено: <strong>${total}%</strong>, свободно: <strong>${remaining}%</strong>`;

    if (total > 100) {
      totalSumDisplay.style.color = "#cc0000";
      saveBtn.disabled = true;
    } else if (total < 100) {
      totalSumDisplay.style.color = "#ff9900";
      saveBtn.disabled = false;
    } else {
      totalSumDisplay.style.color = "#186663";
      saveBtn.disabled = false;
    }
  }

  const buttonRow = document.createElement("div");
  buttonRow.className = "row end";
  buttonRow.style.marginTop = "16px";
  buttonRow.style.display = "flex";
  buttonRow.style.justifyContent = "center";
  buttonRow.style.gap = "32px";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "round-btn orange";
  cancelBtn.innerHTML = '<span data-lucide="x"></span>';
  cancelBtn.onclick = () => {
    document.body.removeChild(modal);
  };

  const saveBtn = document.createElement("button");
  saveBtn.className = "round-btn green";
  saveBtn.innerHTML = '<span data-lucide="check"></span>';
  saveBtn.onclick = async () => {
  await Promise.all(ranges.map(async (r) => {
    const cb = document.getElementById(`cb-${r.id}`);
    const range = document.getElementById(`range-${r.id}`);
    const percent = cb.checked ? parseFloat(range.value) : 0;
    await db.collection("envelopes").doc(r.id).update({
      percent,
      includeInDistribution: cb.checked
    });
  }));
  alert("Проценты сохранены");
  document.body.removeChild(modal);
  loadEnvelopes();
};



  buttonRow.appendChild(cancelBtn);
  buttonRow.appendChild(saveBtn);
  container.appendChild(buttonRow);

  modal.appendChild(container);
  document.body.appendChild(modal);

  // слушатели изменений значений ползунков
  snapshot.forEach(doc => {
    if (doc.data().includeInDistribution === false || doc.data().isPrimary) return;
    const id = doc.id;
    const range = document.getElementById(`range-${id}`);
    const label = document.getElementById(`label-${id}`);
    if (range && label) {
      range.addEventListener("input", () => {
        label.textContent = `${range.value}%`;
        updateTotalDisplay();
      });
    }
  });

  updateTotalDisplay();
  lucide.createIcons();
}

function showEnvelopeMenu(btn, id) {
  // Убрать старое меню, если есть
  const oldMenu = document.getElementById('envelope-menu-popup');
  if (oldMenu) oldMenu.remove();

  // Серое неоморфное меню-плашка, SVG как в MiniBudget
  const menu = document.createElement('div');
  menu.id = 'envelope-menu-popup';
  menu.style.position = 'absolute';
  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.top + window.scrollY + 4}px`;
  menu.style.left = `${rect.right + window.scrollX + 12}px`;
  menu.style.background = '#e0e0e0';
  menu.style.boxShadow = '4px 4px 12px #bebebe, -4px -4px 12px #ffffff';
  menu.style.borderRadius = '12px';
  menu.style.display = 'flex';
  menu.style.flexDirection = 'row';
  menu.style.padding = '6px';
  menu.style.gap = '6px';
  menu.style.zIndex = 100;

  menu.innerHTML = `
    <button
      style="background:#e0e0e0; border-radius:50%; width:40px; height:40px; border:none; box-shadow:4px 4px 12px #bebebe, -4px -4px 12px #ffffff; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:transform 0.15s;"
      title="Редактировать"
    >
      <svg width="28" height="28" stroke="#444" stroke-width="2.2" fill="none" viewBox="0 0 24 24">
        <path d="M3 17.25V21h3.75l11-11.03-3.75-3.75L3 17.25z"></path>
        <path d="M21.41 6.34c.38-.38.38-1.02 0-1.41l-2.34-2.34a1.003 1.003 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path>
      </svg>
    </button>
    <button
      id="envelope-menu-del"
      style="background:#e0e0e0; border-radius:50%; width:40px; height:40px; border:none; box-shadow:4px 4px 12px #bebebe, -4px -4px 12px #ffffff; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:transform 0.15s;"
      title="Удалить"
    >
      <svg width="28" height="28" stroke="#444" stroke-width="2.2" fill="none" viewBox="0 0 24 24">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    </button>
  `;

  document.body.appendChild(menu);

  // Клик вне меню — закрыть
  setTimeout(() => {
    document.addEventListener('mousedown', function handler(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) {
        menu.remove();
        document.removeEventListener('mousedown', handler);
      }
    });
  }, 50);

  // Скрыть кнопку удаления для спецконвертов
  db.collection("envelopes").doc(id).get().then(doc => {
    const data = doc.data();
    if (data.isPrimary || data.isMiniBudget) {
      const delBtn = document.getElementById('envelope-menu-del');
      if (delBtn) delBtn.style.display = 'none';
    }
  });

  // Обработчики
  const [editBtn, delBtn] = menu.querySelectorAll('button');
  editBtn.onclick = () => { menu.remove(); startEditEnvelope(id); };
  delBtn.onclick = () => { menu.remove(); deleteEnvelope(id); };
}
lucide.createIcons();


  // Принудительно перекрасим иконки (если Lucide всё равно вставляет свои цвета)
  setTimeout(() => {
    menu.querySelectorAll('span[data-lucide]').forEach(el => {
      el.style.stroke = '#444';
      el.style.fill = 'none';
      el.style.strokeWidth = '1.9';
    });
  }, 30);

  // Клик вне меню — закрыть
  setTimeout(() => {
    document.addEventListener('mousedown', function handler(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) {
        menu.remove();
        document.removeEventListener('mousedown', handler);
      }
    });
  }, 50);

  // Скрыть кнопку удаления для спецконвертов
  db.collection("envelopes").doc(id).get().then(doc => {
    const data = doc.data();
    if (data.isPrimary || data.isMiniBudget) {
      const delBtn = document.getElementById('envelope-menu-del');
      if (delBtn) delBtn.style.display = 'none';
    }
  });

  // Обработчики
  const [editBtn, delBtn] = menu.querySelectorAll('button');
  editBtn.onclick = () => { menu.remove(); startEditEnvelope(id); };
  delBtn.onclick = () => { menu.remove(); deleteEnvelope(id); };
}
function startEditEnvelope(id) {
  db.collection("envelopes").doc(id).get().then(doc => {
    if (doc.exists) {
      fillEditForm(doc.data(), id);
    }
  });
}
// Цель: показать поле при активации чекбокса
document.getElementById('envelope-has-goal').addEventListener('change', function() {
  document.getElementById('envelope-goal').style.display = this.checked ? 'inline-block' : 'none';
});

renderInlineDistributionEditor();


// Распределение: показать бегунок при активации чекбокса
document.getElementById('envelope-distribution').addEventListener('change', function() {
  const range = document.getElementById('envelope-percent');
  const label = document.getElementById('envelope-percent-label');
  range.style.display = label.style.display = this.checked ? 'inline-block' : 'none';
  range.disabled = !this.checked;
  renderInlineDistributionEditor();  // <-- ВАЖНО
});

document.getElementById('envelope-percent').addEventListener('input', function() {
  document.getElementById('envelope-percent-label').textContent = this.value + "%";
  renderInlineDistributionEditor();  // <-- ВАЖНО
});



