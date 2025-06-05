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
  snapshot.forEach(doc => {
    const data = doc.data();
    const percent = Math.min(100, Math.round(data.percent || 0));
    const block = document.createElement("fieldset");
    block.className = "block";
    block.innerHTML = `
      <div class="expense-entry">
        <div class="expense-left">
          <div class="top-line">
            <span><strong>${data.name}</strong></span>
            <span style="font-size:0.8em;color:#999">${percent}%</span>
          </div>
          <div class="bottom-line">
            <span>€${data.current.toFixed(2)} / €${data.goal.toFixed(2)}</span>
            ${data.comment ? `<div class="info-line">${data.comment}</div>` : ""}
            ${data.includeInDistribution === false ? `<div class="info-line" style="color:#aaa">Не участвует в распределении</div>` : ""}
          </div>
        </div>
        <div class="expense-right">
          <button class="round-btn light small" onclick="addToEnvelope('${doc.id}')">
            <span data-lucide="plus"></span>
          </button>
          <button class="round-btn gray small" onclick="editEnvelope('${doc.id}', '${data.name}', ${data.goal}, '${data.comment || ''}', ${data.percent || 0}, ${data.includeInDistribution !== false})">
            <span data-lucide="pencil"></span>
          </button>
          <button class="round-btn red small" onclick="deleteEnvelope('${doc.id}')">
            <span data-lucide="trash-2"></span>
          </button>
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
  if (!confirm("Удалить этот конверт?")) return;
  await db.collection("envelopes").doc(id).delete();
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
  await Promise.all(snapshot.docs.map(async (doc) => {
    const data = doc.data();
    const part = (parseFloat(data.percent || 0) / totalPercent) * total;
    await db.collection("envelopes").doc(doc.id).update({
      current: (data.current || 0) + part
    });
  }));
  loadEnvelopes();
}

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

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Сохранить";
  saveBtn.style.marginTop = "1em";
  saveBtn.className = "primary-btn";
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
  modal.style.background = "#fff";
  modal.style.padding = "24px";
  modal.style.borderRadius = "12px";
  modal.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
  modal.style.zIndex = "9999";
  modal.appendChild(container);

  document.body.appendChild(modal);

  snapshot.forEach(doc => {
    const id = doc.id;
    const range = document.getElementById(`range-${id}`);
    const label = document.getElementById(`label-${id}`);
    if (range && label) {
      range.addEventListener("input", () => {
        label.textContent = `${range.value}%`;
      });
    }
  });
}

window.addEventListener("DOMContentLoaded", loadEnvelopes);
