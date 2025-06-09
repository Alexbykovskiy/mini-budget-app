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
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
async function getEnvelopeMonthStats(envelopeId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let added = 0;
  let spent = 0;
  const query = await db.collection("transactions")
    .where("envelopeId", "==", envelopeId)
    .where("date", ">=", monthStart)
    .get();
  query.forEach(doc => {
    const t = doc.data();
    if (t.amount > 0) added += t.amount;
    if (t.amount < 0) spent += Math.abs(t.amount);
  });
  return { added, spent };
}


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
const envelopeGridContainer = document.createElement("div");
envelopeGridContainer.className = "envelope-grid-container";
list.appendChild(envelopeGridContainer); // <-- ЭТУ строку ОСТАВЬ!
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


ordered.forEach(async doc => {
  const data = doc.data();
  const percent = Math.min(100, Math.round(data.percent || 0));
  const isMiniBudget = data.isMiniBudget === true;
  const isPrimary = data.isPrimary === true;


 const block = document.createElement("div");
block.className = "envelope-card-grid";
  const name = data.name || "";
  let titleFontSize = "2em";
  if (name.length > 18) titleFontSize = "1.4em";
  if (name.length > 28) titleFontSize = "1.05em";

  // ВАЖНО: ждём результат из Firestore — сколько добавлено и потрачено за месяц:
  const monthStats = await getEnvelopeMonthStats(doc.id); // вызываем новую функцию
  const addedThisMonth = monthStats.added;
  const spentThisMonth = monthStats.spent;

  // Всё остальное, как раньше:
let goalDisplay;
let goalForCalc;
if (data.goal > 0) {
  goalDisplay = data.goal.toFixed(0);
  goalForCalc = data.goal;
} else {
  goalDisplay = '∞';
  goalForCalc = null;
}
const progress = (goalForCalc && goalForCalc > 0)
  ? Math.min(addedThisMonth / goalForCalc, 1)
  : 0;
const progressPercent = (goalForCalc && goalForCalc > 0)
  ? Math.round(addedThisMonth / goalForCalc * 100)
  : 0;

// ===== ВСТАВЬ ЗДЕСЬ =====
block.innerHTML = `
  <div class="envelope-card-grid">
    <div class="envelope-main">
      <div class="envelope-header" style="font-size:${titleFontSize}; color:#23292D; font-weight:700;">
        ${escapeHTML(name)}
      </div>
      <div class="envelope-row" style="display:flex;align-items:center;gap:20px;">
        <div class="envelope-progress-info">
          <div class="envelope-balance">
            <span class="env-balance-main">${data.current.toFixed(2)}</span>
            <span class="env-balance-sep">/</span>
            <span class="env-balance-goal">${goalDisplay}</span>
          </div>
          <div class="envelope-distribution">
            <span style="color:#999;font-size:13px;">Распределение:</span>
            <span style="color:#186663;font-weight:600;font-size:14px;">${percent}%</span>
          </div>
        </div>
        <div class="envelope-progress-ring">
          ${
            goalForCalc && goalForCalc > 0
              ? `<svg width="60" height="60">
                  <circle cx="30" cy="30" r="26" stroke="#EEE" stroke-width="8" fill="none"/>
                  <circle
                    cx="30" cy="30" r="26"
                    stroke="#FFA35C"
                    stroke-width="8"
                    fill="none"
                    stroke-linecap="round"
                    stroke-dasharray="${2 * Math.PI * 26}"
                    stroke-dashoffset="${2 * Math.PI * 26 * (1 - progress)}"
                    style="transition:stroke-dashoffset 0.4s;"
                  />
                  <text x="30" y="36" text-anchor="middle" font-size="18" fill="#FFA35C" font-weight="bold">${progressPercent}%</text>
                </svg>`
              : `<div style="width:60px;height:60px;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:2.5em;opacity:.6;">∞</div>`
          }
        </div>
      </div>
      <div class="envelope-stats" style="margin: 8px 0 4px 0;">
        <div>Добавлено в этом месяце: <b>${addedThisMonth.toFixed(2)}</b></div>
        <div>Потрачено в этом месяце: <b>${spentThisMonth.toFixed(2)}</b></div>
      </div>
      <div class="envelope-divider"></div>
      <div class="envelope-comment">${escapeHTML(data.comment || "Комментарий не указан")}</div>
    </div>
    <div class="envelope-actions">
      <button class="round-btn menu small menu-btn" data-id="${doc.id}" title="Меню">
        <span data-lucide="menu"></span>
      </button>
      <button class="round-btn orange small" onclick="addToEnvelope('${doc.id}')" title="Добавить">
        <span data-lucide="plus"></span>
      </button>
      <button class="round-btn orange small" onclick="subtractFromEnvelope('${doc.id}')" title="Вычесть">
        <span data-lucide="minus"></span>
      </button>
      <button class="round-btn orange small" onclick="transferEnvelope('${doc.id}', ${data.current})" title="Перевести">
        <span data-lucide="move-horizontal"></span>
      </button></div>

  </div>
`;

  envelopeGridContainer.appendChild(block);
}); // <-- это закрытие только forEach

// --- после forEach, но до конца функции loadEnvelopes ---
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
} // <-- это уже конец всей функции loadEnvelopes

// остальные функции не изменялись...

async function subtractFromEnvelope(id) {
  const amount = prompt("Сколько вычесть (€)?");
  const value = parseFloat(amount);
  if (isNaN(value) || value <= 0) return;
  const ref = db.collection("envelopes").doc(id);
  await db.runTransaction(async (t) => {
  const docSnap = await t.get(ref);
  const data = docSnap.data();
  t.update(ref, { current: (data.current || 0) - value });
});
await db.collection("transactions").add({
  envelopeId: id,
  amount: -value,
  type: "subtract",
  date: Date.now()
});
loadEnvelopes();

}

async function addToEnvelope(id) {
  const amount = prompt("Сколько добавить (€)?");
  const value = parseFloat(amount);
  if (isNaN(value) || value <= 0) return;
  const ref = db.collection("envelopes").doc(id);
  await db.runTransaction(async (t) => {
  const docSnap = await t.get(ref);
  const data = docSnap.data();
  t.update(ref, { current: (data.current || 0) + value });
});
// ДОБАВЬ это после транзакции, но до loadEnvelopes();
await db.collection("transactions").add({
  envelopeId: id,
  amount: value,
  type: "add",
  date: Date.now()
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
// Две записи: исходящий и входящий трансфер
await db.collection("transactions").add({
  envelopeId: fromId,
  amount: -value,
  type: "transfer-out",
  toEnvelopeId: toId,
  date: Date.now()
});
await db.collection("transactions").add({
  envelopeId: toId,
  amount: value,
  type: "transfer-in",
  fromEnvelopeId: fromId,
  date: Date.now()
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
await db.collection("transactions").add({
  envelopeId: doc.id,
  amount: part,
  type: "income",
  date: Date.now()
});

    }
  }));

  // Остаток — в "Общий"
  const leftover = total - distributed;
  if (leftover > 0) {
    await db.collection("envelopes").doc(primaryId).update({
      current: primaryCurrent + leftover
    });
await db.collection("transactions").add({
  envelopeId: primaryId,
  amount: leftover,
  type: "income",
  date: Date.now()
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
async function resetAllEnvelopes() {
  if (!confirm("ВНИМАНИЕ: Это удалит все балансы и всю историю транзакций. Продолжить?")) return;

  // 1. Обнуляем все балансы envelope'ов
  const envelopesSnapshot = await db.collection('envelopes').get();
  const batch = db.batch();
  envelopesSnapshot.forEach(doc => {
    batch.update(doc.ref, { current: 0 });
  });
  await batch.commit();

  // 2. Удаляем ВСЕ транзакции
  // Firestore не поддерживает прямое удаление коллекции, поэтому поштучно или батчами
  const transactionsSnapshot = await db.collection('transactions').get();
  const batch2 = db.batch();
  transactionsSnapshot.forEach(doc => {
    batch2.delete(doc.ref);
  });
  await batch2.commit();

  alert("Все балансы и история транзакций полностью сброшены!");
  loadEnvelopes();
}

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

  // Два круглых svg-кнопки, как в MiniBudget
function showEnvelopeMenu(btn, id) {
  // Убрать старое меню, если есть
  const oldMenu = document.getElementById('envelope-menu-popup');
  if (oldMenu) oldMenu.remove();

  // Серое неоморфное меню-плашка с Lucide-иконками
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

  // Меню с Lucide-иконками (точно как в напоминаниях)
  menu.innerHTML = `
    <button class="popup-menu-btn" title="Редактировать">
      <span data-lucide="pencil"></span>
    </button>
    <button class="popup-menu-btn" id="envelope-menu-del" title="Удалить">
      <span data-lucide="trash-2"></span>
    </button>
  `;

  document.body.appendChild(menu);

  // Вызов рендера иконок Lucide
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

  // Скрыть кнопку удаления для "Общий" и "MiniBudget"
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

window.addEventListener("DOMContentLoaded", async () => {
  await ensureSystemEnvelopes();
  loadEnvelopes();
  document.getElementById('reset-envelopes').addEventListener('click', resetAllEnvelopes);
});
