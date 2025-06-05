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
console.log("📦 Firestore подключен:", db);

const form = document.getElementById("envelope-form");
const nameInput = document.getElementById("envelope-name");
const goalInput = document.getElementById("envelope-goal");
const list = document.getElementById("envelope-list");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const goal = parseFloat(goalInput.value);
  if (!name || isNaN(goal)) {
    console.warn("❗ Неправильные данные формы");
    return;
  }

  try {
    await db.collection("envelopes").add({ name, goal, current: 0, created: Date.now() });
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
    const block = document.createElement("div");
    block.className = "expense-entry";
    block.innerHTML = `
      <div class="expense-left">
        <div class="top-line">
          <span><strong>${data.name}</strong></span>
          <span style="font-size:0.8em;color:#999">${percent}%</span>
        </div>
        <div class="bottom-line">
          <span>€${data.current.toFixed(2)} / €${data.goal.toFixed(2)}</span>
        </div>
      </div>
      <div class="expense-right">
        <button class="round-btn light" onclick="addToEnvelope('${doc.id}')">
          <span data-lucide="plus"></span>
        </button>
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

// Загрузка при старте
window.addEventListener("DOMContentLoaded", loadEnvelopes);
