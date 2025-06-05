// envelopes-app.js

// Инициализация Firebase
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const goal = parseFloat(goalInput.value);
  const comment = commentInput.value.trim();
  if (!name || isNaN(goal)) {
    console.warn("❗ Неправильные данные формы");
    return;
  }

  try {
    await db.collection("envelopes").add({ name, goal, comment, current: 0, created: Date.now() });
    console.log("✅ Конверт добавлен:", name);
    form.reset();
    loadEnvelopes();
  } catch (e) {
    console.error("❌ Ошибка добавления:", e.message || e);
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
    const percent = Math.min(100, Math.round((data.current / data.goal) * 100));
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
          </div>
        </div>
        <div class="expense-right">
          <button class="round-btn light small" onclick="addToEnvelope('${doc.id}')">
            <span data-lucide="plus"></span>
          </button>
          <button class="round-btn gray small" onclick="editEnvelope('${doc.id}', '${data.name}', ${data.goal}, '${data.comment || ''}')">
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

async function editEnvelope(id, oldName, oldGoal, oldComment) {
  const newName = prompt("Новое название:", oldName);
  const newGoal = prompt("Новая цель (€):", oldGoal);
  const newComment = prompt("Комментарий:", oldComment);
  const name = newName?.trim();
  const goal = parseFloat(newGoal);
  const comment = newComment?.trim();
  if (!name || isNaN(goal) || goal <= 0) return;
  await db.collection("envelopes").doc(id).update({ name, goal, comment });
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

// Загрузка при старте
window.addEventListener("DOMContentLoaded", loadEnvelopes);