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

  // Сначала отображаем основной (isPrimary: true), потом остальные
  const envelopes = snapshot.docs;
  const primary = envelopes.find(doc => doc.data().isPrimary);
  const others = envelopes.filter(doc => !doc.data().isPrimary);

  const ordered = primary ? [primary, ...others] : envelopes;
function calculateRemainingPercent() {
  return others.reduce((acc, doc) => {
    const p = parseFloat(doc.data().percent || 0);
    return acc + p;
  }, 0) <= 100
    ? 100 - others.reduce((acc, doc) => acc + parseFloat(doc.data().percent || 0), 0)
    : 0;
}

  ordered.forEach(doc => {
    const data = doc.data();
    const percent = Math.min(100, Math.round(data.percent || 0));
    const isPrimary = data.isPrimary === true;
    const block = document.createElement("fieldset");
    block.className = "block";
    block.innerHTML = `
      <div class="expense-entry">
        <div class="expense-left">
          <div class="top-line">
            <span class="top-name">
  <strong>${data.name}</strong>
  ${isPrimary ? "<span style='color:#999'>(общий)</span>" : ""}
</span>

            <<span style="font-size:0.8em;color:#999">${isPrimary ? calculateRemainingPercent() + "%" : percent + "%"}</span>


          </div>
          <div class="bottom-line">
            <span>€${data.current.toFixed(2)} / €${data.goal.toFixed(2)}</span>
            ${data.comment ? `<div class="info-line">${data.comment}</div>` : ""}
            ${data.includeInDistribution === false && !isPrimary ? `<div class="info-line" style="color:#aaa">Не участвует в распределении</div>` : ""}
          </div>
        </div>
        <div class="expense-right">
          <button class="round-btn light small" onclick="addToEnvelope('${doc.id}')">
            <span data-lucide="plus"></span>
          </button>
          ${!isPrimary ? `
            <button class="round-btn gray small" onclick="editEnvelope('${doc.id}', '${data.name}', ${data.goal}, '${data.comment || ''}', ${data.percent || 0}, ${data.includeInDistribution !== false})">
              <span data-lucide="pencil"></span>
            </button>
            <button class="round-btn red small" onclick="deleteEnvelope('${doc.id}')">
              <span data-lucide="trash-2"></span>
            </button>
          ` : ""}
          <button class="round-btn blue small" onclick="transferEnvelope('${doc.id}', ${data.current})">
            <span data-lucide="move-horizontal"></span>
          </button>
        </div>
      </div>
    `;
    list.appendChild(block);
  });
  lucide.createIcons();
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
  if (snap.exists && snap.data().isPrimary) {
    alert("Нельзя удалить основной конверт.");
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

async function ensurePrimaryEnvelopeExists() {
  const check = await db.collection("envelopes").where("isPrimary", "==", true).limit(1).get();
  if (check.empty) {
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
}

window.addEventListener("DOMContentLoaded", async () => {
  await ensurePrimaryEnvelopeExists();
  loadEnvelopes();
});


async function openDistributionEditor() {
  const snapshot = await db.collection("envelopes").orderBy("created", "asc").get();
  if (snapshot.empty) {
    alert("Нет доступных конвертов для настройки.");
    return;
  }

  const container = document.createElement("div");
  container.style.padding = "1em";
  container.innerHTML = `<h3 style='margin-bottom: 12px'>Настройка процентов</h3>`;

  const ranges = [];
  let totalSumDisplay;

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.includeInDistribution === false) return;

    const row = document.createElement("div");
    row.style.marginBottom = "12px";
    row.innerHTML = `
      <label style='display:block; font-weight:bold; margin-bottom:4px;'>${data.name}</label>
      <input type='range' min='0' max='100' step='1' value='${data.percent || 0}' id='range-${doc.id}' style='width:100%'>
      <span id='label-${doc.id}' style='font-size:0.8em;'>${data.percent || 0}%</span>
    `;
    container.appendChild(row);
    ranges.push({ id: doc.id, initial: data.percent || 0 });
  });

  totalSumDisplay = document.createElement("div");
  totalSumDisplay.id = "total-percent-display";
  totalSumDisplay.style.fontSize = "0.9em";
  totalSumDisplay.style.marginTop = "8px";
  totalSumDisplay.style.marginBottom = "16px";
  container.appendChild(totalSumDisplay);

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Сохранить";
  saveBtn.style.marginTop = "1em";
  saveBtn.className = "primary-btn";
  saveBtn.disabled = true;
  saveBtn.onclick = async () => {
  await Promise.all(ranges.map(async (r) => {
    const val = parseFloat(document.getElementById(`range-${r.id}`).value);
    await db.collection("envelopes").doc(r.id).update({ percent: val });
  }));
  alert("Проценты сохранены");
  document.body.removeChild(modal);
  loadEnvelopes();
};

  container.appendChild(saveBtn);

  const modal = document.createElement("div");
 modal.style.position = "fixed";
modal.style.top = "50%";
modal.style.left = "50%";
modal.style.transform = "translate(-50%, -50%)";
modal.style.background = "#f0f0f0"; // ← светло-серый фон
modal.style.padding = "24px";
modal.style.borderRadius = "12px";
modal.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
modal.style.zIndex = "9999";
modal.style.width = "320px"; // ← фиксированная ширина

  document.body.appendChild(modal);

  function calculateTotalPercent() {
    let total = 0;
    ranges.forEach(r => {
      const val = parseFloat(document.getElementById(`range-${r.id}`).value);
      total += val;
    });
    return total;
  }

  function updateTotalDisplay() {
  const total = calculateTotalPercent();
  const remaining = 100 - total;
  totalSumDisplay.innerHTML = `🧮 Распределено: <strong>${total}%</strong>, свободно: <strong>${remaining}%</strong>`;

  if (total > 100) {
    totalSumDisplay.style.color = "#cc0000"; // красный — ошибка
    saveBtn.disabled = true;
  } else if (total < 100) {
    totalSumDisplay.style.color = "#ff9900"; // оранжевый — предупреждение
    saveBtn.disabled = false; // можно сохранить
  } else {
    totalSumDisplay.style.color = "#186663"; // зелёный — ок
    saveBtn.disabled = false;
  }
}


  snapshot.forEach(doc => {
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
}

// <button onclick="openDistributionEditor()">Настроить проценты</button>
