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
      ${!(isPrimary || isMiniBudget) ? `
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
});
document.getElementById('envelope-percent').addEventListener('input', function() {
  document.getElementById('envelope-percent-label').textContent = this.value + "%";
});

// envelopes-app.js (финальная версия openDistributionEditor)

// envelopes-app.js (финальная версия openDistributionEditor)


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
  <button class="menu-item" style="
    display:flex;
    align-items:center;
    gap:8px;
    padding:8px 16px;
    width:100%;
    background:none;
    border:none;
    cursor:pointer;
    color:#186663;
    font-size:16px;
    font-weight:500;
    transition:background 0.15s;
  " onmouseover="this.style.background='#f0f7f6'" onmouseout="this.style.background='none'">
    <span data-lucide="pencil"></span>
  </button>
  <button class="menu-item" style="
    display:flex;
    align-items:center;
    gap:8px;
    padding:8px 16px;
    width:100%;
    background:none;
    border:none;
    cursor:pointer;
    color:#ff4d4f;
    font-size:16px;
    font-weight:500;
    transition:background 0.15s;
  " onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='none'">
    <span data-lucide="trash-2"></span>
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
      fillEditForm(doc.data(), id);
    }
  });
}
// Цель: показать поле при активации чекбокса
document.getElementById('envelope-has-goal').addEventListener('change', function() {
  document.getElementById('envelope-goal').style.display = this.checked ? 'inline-block' : 'none';
});

// Распределение: показать бегунок при активации чекбокса
document.getElementById('envelope-distribution').addEventListener('change', function() {
  const range = document.getElementById('envelope-percent');
  const label = document.getElementById('envelope-percent-label');
  range.style.display = label.style.display = this.checked ? 'inline-block' : 'none';
  range.disabled = !this.checked;
});

// Обновлять процент при движении бегунка
document.getElementById('envelope-percent').addEventListener('input', function() {
  document.getElementById('envelope-percent-label').textContent = this.value + "%";
});


document.addEventListener("DOMContentLoaded", function () {
  const wrapper = document.getElementById("distribution-settings-wrapper");
  const btn = document.getElementById("toggle-distribution-settings");
  const content = document.getElementById("distribution-settings-content");
  let expanded = false;

  btn.addEventListener("click", async function () {
    expanded = !expanded;
    if (expanded) {
      wrapper.classList.remove("collapsed");
      wrapper.classList.add("expanded");
      btn.querySelector("#distribution-arrow").innerHTML = "&#9650;";
      content.style.display = "block";
      // ВСТАВЬ ТУТ РЕНДЕР ДИСТРИБЬЮТОРА!
      await openDistributionEditorInline(content);
    } else {
      wrapper.classList.remove("expanded");
      wrapper.classList.add("collapsed");
      btn.querySelector("#distribution-arrow").innerHTML = "&#9660;";
      content.style.display = "none";
      content.innerHTML = "";
    }
  });
});

async function openDistributionEditorInline(container) {
  const snapshot = await db.collection("envelopes").orderBy("created", "asc").get();
  if (snapshot.empty) {
    container.innerHTML = "<p>Нет доступных конвертов для настройки.</p>";
    return;
  }

  container.innerHTML = ""; // Очищаем для повторного открытия
  const box = document.createElement("div");
  box.style.background = "#f0f0f0";
  box.style.padding = "16px";
  box.style.borderRadius = "12px";
  box.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
  box.style.width = "100%";
  box.style.maxWidth = "340px";
  box.style.margin = "0 auto";

  // Копируй содержимое редактора процентов, но БЕЗ modal, alert, без закрытия окна!
  // Можно просто взять содержимое openDistributionEditor, чуть упростить:

  const ranges = [];
  const totalSumDisplay = document.createElement("div");
  totalSumDisplay.style.margin = "8px 0";
  box.appendChild(totalSumDisplay);

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.isPrimary) return;
    const row = document.createElement("div");
    row.style.marginBottom = "14px";
    const percentValue = data.percent || 0;
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; font-weight:bold; margin-bottom:4px;">
        <input type="checkbox" id="cb-${doc.id}" ${data.includeInDistribution !== false ? "checked" : ""} style="accent-color:#186663; width:18px; height:18px; margin:0;">
        <span id='label-${doc.id}' style='min-width:36px; text-align:right;'>${percentValue}%</span>
        <span>${data.name}</span>
      </div>
      <input type='range' min='0' max='100' step='1' value='${percentValue}' id='range-${doc.id}' style='width:100%'>
    `;
    box.appendChild(row);
    ranges.push({ id: doc.id });
  });

  // Логика суммы
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

  // Слушатели
  ranges.forEach(r => {
    const range = box.querySelector(`#range-${r.id}`);
    const cb = box.querySelector(`#cb-${r.id}`);
    const label = box.querySelector(`#label-${r.id}`);
    if (range && cb && label) {
      range.disabled = !cb.checked;
      if (!cb.checked) {
        range.value = 0;
        label.textContent = "0%";
      }
      cb.addEventListener("change", () => {
        if (cb.checked) {
          range.disabled = false;
        } else {
          range.value = 0;
          range.disabled = true;
          label.textContent = "0%";
        }
        updateTotalDisplay();
      });
      range.addEventListener("input", () => {
        label.textContent = `${range.value}%`;
        updateTotalDisplay();
      });
    }
  });

  // Кнопка сохранить
  const saveBtn = document.createElement("button");
  saveBtn.className = "round-btn green";
  saveBtn.innerHTML = '<span data-lucide="check"></span>';
  saveBtn.style.marginTop = "10px";
  saveBtn.onclick = async () => {
    await Promise.all(ranges.map(async (r) => {
      const cb = box.querySelector(`#cb-${r.id}`);
      const range = box.querySelector(`#range-${r.id}`);
      const percent = cb.checked ? parseFloat(range.value) : 0;
      await db.collection("envelopes").doc(r.id).update({
        percent,
        includeInDistribution: cb.checked
      });
    }));
    loadEnvelopes();
    saveBtn.innerHTML = '✓';
    setTimeout(() => { saveBtn.innerHTML = '<span data-lucide="check"></span>'; }, 1200);
  };

  box.appendChild(saveBtn);
  container.appendChild(box);
  updateTotalDisplay();
  lucide.createIcons();
}



