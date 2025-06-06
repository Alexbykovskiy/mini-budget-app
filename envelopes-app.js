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

const form = document.getElementById("envelope-form");
const nameInput = document.getElementById("envelope-name");
const goalInput = document.getElementById("envelope-goal");
const commentInput = document.getElementById("envelope-comment");
const list = document.getElementById("envelope-list");

const incomeButton = document.getElementById("distribute-income");
if (incomeButton) {
  incomeButton.addEventListener("click", distributeIncome);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const goal = parseFloat(goalInput.value);
  const comment = commentInput.value.trim();
  if (!name || isNaN(goal)) return;

  try {
    await db.collection("envelopes").add({
      name,
      goal,
      comment,
      current: 0,
      created: Date.now(),
      percent: 0,
      includeInDistribution: true
    });
    form.reset();
    loadEnvelopes();
  } catch (e) {
    console.error("Ошибка:", e.message);
  }
});

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
      <div class="top-line">
        <span class="top-name">
          <strong>${data.name}</strong>
          ${isPrimary ? "<span style='color:#999'>(общий)</span>" : ""}
        </span>
        <span style="font-size:0.8em;color:#999">${isPrimary ? remaining + "%" : percent + "%"}</span>
      </div>
      <div class="bottom-line">
        <span>€${data.current.toFixed(2)} / €${data.goal.toFixed(2)}</span>
        ${data.comment ? `<div class="info-line">${data.comment}</div>` : ""}
        ${data.includeInDistribution === false && !isPrimary ? `<div class="info-line" style="color:#aaa">Не участвует в распределении</div>` : ""}
      </div>
    </div>
    <div class="expense-right" style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
      <!-- Кнопка меню (3 полоски) -->
      ${!(isPrimary || isMiniBudget) ? `
      <button class="round-btn gray small menu-btn" data-id="${doc.id}">
        <span data-lucide="menu"></span>
      </button>
      ` : ""}
      <!-- 4 основные круглые кнопки -->
      <button class="round-btn green small" onclick="startEditEnvelope('${doc.id}')">
        <span data-lucide="pencil"></span>
      </button>
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
  const snapshot = await db.collection("envelopes").where("includeInDistribution", "==", true).get();
  let totalPercent = 0;
  snapshot.forEach(doc => {
    const data = doc.data();
    totalPercent += parseFloat(data.percent || 0);
  });
  if (totalPercent === 0) {
    alert("Нет активных процентов для распределения.");
    return;
  }
if (totalPercent < 100) {
  const leftover = total * ((100 - totalPercent) / 100);
  const fallback = await db.collection("envelopes")
    .where("isPrimary", "==", true)
    .limit(1)
    .get();
  
  if (!fallback.empty) {
    const fallbackDoc = fallback.docs[0];
    const fallbackId = fallbackDoc.id;
    const current = fallbackDoc.data().current || 0;

    await db.collection("envelopes").doc(fallbackId).update({
      current: current + leftover
    });
  } else {
    alert("Остаток некуда поместить: основной конверт не задан.");
  }
}

  await Promise.all(snapshot.docs.map(async (doc) => {
    const data = doc.data();
    const part = (parseFloat(data.percent || 0) / totalPercent) * total;
    await db.collection("envelopes").doc(doc.id).update({
      current: (data.current || 0) + part
    });
  }));
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
      comment: "Основной резервный конверт",
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

  const menu = document.createElement('div');
  menu.id = 'envelope-menu-popup';
  menu.style.position = 'absolute';
  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
  menu.style.left = `${rect.left + window.scrollX - 8}px`;
  menu.style.background = '#fff';
  menu.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)';
  menu.style.borderRadius = '10px';
  menu.style.padding = '8px 0';
  menu.style.zIndex = 9999;
  menu.style.minWidth = '120px';
  menu.innerHTML = `
    <button class="menu-item" style="display:flex;align-items:center;gap:8px;padding:8px 16px;width:100%;background:none;border:none;cursor:pointer;">
      <span data-lucide="pencil"></span> Редактировать
    </button>
    <button class="menu-item" style="display:flex;align-items:center;gap:8px;padding:8px 16px;width:100%;background:none;border:none;cursor:pointer;">
      <span data-lucide="trash-2"></span> Удалить
    </button>
  `;
  document.body.appendChild(menu);
  lucide.createIcons();

  // Клик вне меню — закрыть
  setTimeout(() => {
    document.addEventListener('mousedown', function handler(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) {
        menu.remove();
        document.removeEventListener('mousedown', handler);
      }
    });
  }, 50);

  // Обработчики
  menu.children[0].onclick = () => { menu.remove(); startEditEnvelope(id); };
  menu.children[1].onclick = () => { menu.remove(); deleteEnvelope(id); };
}

function startEditEnvelope(id) {
  db.collection("envelopes").doc(id).get().then(doc => {
    if (doc.exists) {
      const d = doc.data();
      editEnvelope(id, d.name, d.goal, d.comment || '', d.percent || 0, d.includeInDistribution !== false);
    }
  });
}

