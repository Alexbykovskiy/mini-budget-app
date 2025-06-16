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

function showConfirmModal({
  title = "Подтвердите действие",
  message = "",
  confirmText = "Подтвердить",
  cancelText = "Отменить",
  confirmationValue = null,
  confirmationPlaceholder = ""
} = {}) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "glass-modal";
    modal.style.cssText = `
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 360px;
      max-width: 98vw;
      background: rgba(10,10,10,0.20);
      color: #fff;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.26);
      padding: 26px 26px 22px 26px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    `;

    let confirmationInputHTML = "";
    if (confirmationValue !== null && confirmationValue !== undefined) {
      confirmationInputHTML = `
        <div style="margin-bottom:14px;">
          <input id="confirm-code-input" type="text" inputmode="decimal"
            autocomplete="off"
            placeholder="${confirmationPlaceholder || 'Введите код подтверждения'}"
            style="
              width: 100%; box-sizing: border-box;
              padding: 11px 16px;
              border-radius: 13px;
              border: 1.2px solid rgba(255,255,255,0.30);
              font-size: 1.09em;
              margin-top: 2px;
              text-align:center;
              background: rgba(255,255,255,0.14);
              color: #fff;
              backdrop-filter: blur(7px);
              outline: none;"
          />
        </div>
      `;
    }

    modal.innerHTML = `
      <h3 style="color:#fff; text-align:center; font-size:1.16em; font-weight:700; margin:0 0 12px 0;">${title}</h3>
      <div style="color:#fff; text-align:center; font-size:1.04em; margin-bottom:18px;">${message}</div>
      ${confirmationInputHTML}
      <div style="display:flex; gap:22px; justify-content:center;">
        ${cancelText ? `<button class="transfer-btn cancel" type="button">${cancelText}</button>` : ""}
        <button class="transfer-btn confirm" type="button" ${confirmationValue ? 'disabled' : ''}>${confirmText}</button>
      </div>
      <div id="confirm-error" style="color:#C93D1F;font-size:0.98em;text-align:center;margin-top:10px;min-height:22px;"></div>
    `;

    document.body.appendChild(modal);

    const cancelBtn = modal.querySelector('.transfer-btn.cancel');
    const confirmBtn = modal.querySelector('.transfer-btn.confirm');
    const codeInput = modal.querySelector('#confirm-code-input');
    const errorMsg = modal.querySelector('#confirm-error');

    let codeOk = !confirmationValue;

    if (codeInput) {
      codeInput.focus();
      codeInput.addEventListener("input", () => {
        if (codeInput.value.trim() === String(confirmationValue)) {
          codeOk = true;
          confirmBtn.disabled = false;
          errorMsg.textContent = "";
        } else {
          codeOk = false;
          confirmBtn.disabled = true;
          errorMsg.textContent = "";
        }
      });
      codeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && codeOk) {
          confirmBtn.click();
        }
      });
    }

    if (cancelBtn) cancelBtn.onclick = () => { modal.remove(); resolve(false); };
    confirmBtn.onclick = () => {
      if (confirmationValue && (!codeInput || codeInput.value.trim() !== String(confirmationValue))) {
        errorMsg.textContent = "Подтверждение неверное. Введите правильный код.";
        if (codeInput) codeInput.focus();
        return;
      }
      modal.remove();
      resolve(true);
    };

    window.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape") {
        modal.remove();
        window.removeEventListener("keydown", handler);
        resolve(false);
      }
    });
  });
}

function showAmountModal({title = "Введите сумму", placeholder = "Сумма", confirmText = "OK", cancelText = "Отмена"} = {}) {
  return new Promise((resolve, reject) => {
    const modal = document.createElement("div");
    modal.className = "glass-modal";
    modal.style.cssText = `
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 340px;
      max-width: 92vw;
      background: rgba(10, 10, 10, 0.20);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      padding: 24px 24px 18px 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    `;

 modal.innerHTML = `
  <h3 style="color:#23292D;text-align:center; font-size:1.13em; font-weight:700; margin:0 0 20px 0;">${title}</h3>
  <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 16px;">
    <input id="glass-amount-input" type="number" step="0.01" min="0" inputmode="decimal"
      placeholder="${placeholder}" style="flex:1 1 0; min-width:0; max-width:170px; text-align:center; font-size:1.13em; padding: 12px 16px;"/>
    <button id="fill-all-btn" type="button" style="margin-left:8px; border:none; background:rgba(255,163,92,0.70); color:#fff; border-radius:999px; font-weight:600; font-size:1em; padding:10px 22px; cursor:pointer; box-shadow:0 2px 8px 0 rgba(255,163,92,0.11); transition:filter 0.12s;">Все</button>
  </div>
  <div style="display:flex;gap:18px;justify-content:center;">
    <button class="transfer-btn cancel" type="button">${cancelText}</button>
    <button class="transfer-btn confirm" type="button">${confirmText}</button>
  </div>
`;


    document.body.appendChild(modal);

    const input = modal.querySelector("#glass-amount-input");
const fillAllBtn = modal.querySelector("#fill-all-btn");
if (fillAllBtn) {
  fillAllBtn.onclick = () => {
    // Предполагается, что maxAmount передаётся в showAmountModal (добавь его, если ещё нет)
    if (typeof modal.maxAmount !== "undefined") {
      input.value = modal.maxAmount;
    }
    input.focus();
  };
}

    input.focus();
    input.onkeydown = (e) => {
      if (e.key === "Enter") confirm();
      if (e.key === "Escape") cancel();
    };

    const confirmBtn = modal.querySelector(".transfer-btn.confirm");
    const cancelBtn = modal.querySelector(".transfer-btn.cancel");

    confirmBtn.onclick = confirm;
    cancelBtn.onclick = cancel;

    function confirm() {
      const val = parseFloat(input.value.replace(',', '.'));
      modal.remove();
      if (isNaN(val) || val <= 0) resolve(null); // если не введено — вернуть null
      else resolve(val);
    }
    function cancel() {
      modal.remove();
      resolve(null); // просто вернуть null
    }
  });
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
    this.style.display = 'none';
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
    html += `<div class="distribution-warning">Внимание: часть суммы не распределена!</div>`;

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
    document.getElementById('cancel-edit-btn').style.display = 'inline-flex';
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
if (isPrimary) { // общий конверт — всегда бесконечность!
  goalDisplay = '∞';
  goalForCalc = null;
} else if (data.goal > 0) {
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
// ===== ВСТАВЬ ЗДЕСЬ =====
block.innerHTML = `
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
      : `<div class="infinity-ring">∞</div>`
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
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#23292D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="6" x2="20" y2="6"/>
      <line x1="4" y1="12" x2="20" y2="12"/>
      <line x1="4" y1="18" x2="20" y2="18"/>
    </svg>
  </button>
  <button class="round-btn orange small" onclick="addToEnvelope('${doc.id}')" title="Добавить">
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>
  <button class="round-btn orange small" onclick="subtractFromEnvelope('${doc.id}')" title="Вычесть">
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>
  <button class="round-btn orange small" onclick="transferEnvelope('${doc.id}', ${data.current})" title="Перевести">
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="18 8 22 12 18 16"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <polyline points="6 8 2 12 6 16"/>
    </svg>
  </button>
</div>
`;
envelopeGridContainer.appendChild(block);

}); // <-- это закрытие только forEach


// --- после forEach, но до конца функции loadEnvelopes ---


} // <-- это уже конец всей функции loadEnvelopes

// остальные функции не изменялись...

async function subtractFromEnvelope(id) {
  const value = await showAmountModal({title: "Вычесть из конверта", placeholder: "Сумма"});
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

// ===== ФУНКЦИЯ ДЛЯ КРАСИВОГО МОДАЛЬНОГО ОКНА ВВОДА СУММЫ =====
function showAmountModal({title = "Введите сумму", placeholder = "Сумма", confirmText = "OK", cancelText = "Отмена", maxAmount = undefined} = {}) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "glass-modal";
    modal.style.cssText = `
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 340px;
      max-width: 92vw;
      background: rgba(10, 10, 10, 0.20);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      padding: 24px 24px 18px 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    `;

    // =============== HTML =================
   modal.innerHTML = `
  <h3 style="color:#23292D;text-align:center; font-size:1.13em; font-weight:700; margin:0 0 20px 0;">${title}</h3>
  <div class="input-row-with-btn">
    <input id="glass-amount-input" type="number" step="0.01" min="0" inputmode="decimal" placeholder="${placeholder}">
    ${typeof maxAmount === "number" ? `<button id="fill-max-btn" type="button" title="Вся сумма" class="pill-btn pill-yellow max-btn">все</button>` : ""}
  </div>
  <div style="display:flex;gap:18px;justify-content:center;">
    <button class="transfer-btn cancel" type="button">${cancelText}</button>
    <button class="transfer-btn confirm" type="button">${confirmText}</button>
  </div>
`;

    // =============== /HTML =================

    document.body.appendChild(modal);

    const input = modal.querySelector("#glass-amount-input");
    input.focus();
    input.onkeydown = (e) => {
      if (e.key === "Enter") confirm();
      if (e.key === "Escape") cancel();
    };

    const confirmBtn = modal.querySelector(".transfer-btn.confirm");
    const cancelBtn = modal.querySelector(".transfer-btn.cancel");

    confirmBtn.onclick = confirm;
    cancelBtn.onclick = cancel;

    // ====== КНОПКА "ВСЕ" — только если maxAmount есть ======
    const fillMaxBtn = modal.querySelector("#fill-max-btn");
    if (fillMaxBtn && typeof maxAmount === "number") {
      fillMaxBtn.onclick = () => {
        input.value = maxAmount;
        input.focus();
      };
    }

    function confirm() {
      const val = parseFloat(input.value.replace(',', '.'));
      modal.remove();
      if (isNaN(val) || val <= 0) resolve(null);
      else resolve(val);
    }
    function cancel() {
      modal.remove();
      resolve(null);
    }
  });
}


async function addToEnvelope(id) {
  const value = await showAmountModal({title: "Добавить в конверт", placeholder: "Сумма"});
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
  const value = await showAmountModal({
    title: "Сумма для перевода",
    placeholder: "Сумма",
    maxAmount: maxAmount  // <-- передаём сюда сумму из конверта
  });
  if (isNaN(value) || value <= 0 || value > maxAmount) return;

  const snapshot = await db.collection("envelopes").orderBy("created", "asc").get();
  if (snapshot.empty) {
    alert("Нет доступных конвертов.");
    return;
  }

  const fromDoc = snapshot.docs.find(doc => doc.id === fromId);
  const fromName = fromDoc?.data()?.name || "Текущий";

  const modal = document.createElement("div");
  modal.id = "transfer-modal";
  modal.style.cssText = `
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 340px;
  max-height: 80vh;
  overflow-y: auto;
   background: rgba(10, 10, 10, 0.2); /* ← новый полупрозрачный фон */
  backdrop-filter: blur(18px); /* ← эффект размытия фона */
  -webkit-backdrop-filter: blur(18px);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  padding: 20px;
  z-index: 9999;
  color: #fff;
  font-size: 14.5px;
  scrollbar-width: none;
  -ms-overflow-style: none;
`;

  modal.innerHTML = `<h3 style="margin-top:0; color:#23292D;">Перевод из "${fromName}"</h3>`;

  const select = document.createElement("select");
  select.className = "transfer-select";
  snapshot.docs.forEach(doc => {
    if (doc.id === fromId) return;
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = doc.data().name;
    select.appendChild(option);
  });

  const confirmBtn = document.createElement("button");
confirmBtn.textContent = "Перевести";
confirmBtn.className = "transfer-btn confirm";

const cancelBtn = document.createElement("button");
cancelBtn.textContent = "Отмена";
cancelBtn.className = "transfer-btn cancel";

const buttonsRow = document.createElement("div");
buttonsRow.style.display = "flex";
buttonsRow.style.justifyContent = "space-between";
buttonsRow.style.gap = "18px";
buttonsRow.style.marginTop = "18px";
buttonsRow.appendChild(cancelBtn);   // Слева
buttonsRow.appendChild(confirmBtn);  // Справа

modal.appendChild(select);
modal.appendChild(buttonsRow);

  document.body.appendChild(modal);

  cancelBtn.onclick = () => modal.remove();

  confirmBtn.onclick = async () => {
    const toId = select.value;
    if (!toId || toId === fromId) return;

    const fromRef = db.collection("envelopes").doc(fromId);
    const toRef = db.collection("envelopes").doc(toId);
    await db.runTransaction(async (t) => {
      const fromDoc = await t.get(fromRef);
      const toDoc = await t.get(toRef);
      if (!fromDoc.exists || !toDoc.exists) throw new Error("Конверт не найден");
      const fromData = fromDoc.data();
      const toData = toDoc.data();
      t.update(fromRef, { current: (fromData.current || 0) - value });
      t.update(toRef, { current: (toData.current || 0) + value });
    });

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

    modal.remove();
    loadEnvelopes();
  };
}

async function distributeIncome() {
  const total = await showAmountModal({
    title: "Добавить доход",
    placeholder: "Сумма",
    confirmText: "Добавить",
    cancelText: "Отмена"
  });
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

function generateConfirmCode() {
  return Math.floor(1000 + Math.random() * 9000); // 4-значное число от 1000 до 9999
}

async function resetAllEnvelopes() {
  const confirmCode = generateConfirmCode();
  const ok = await showConfirmModal({
    title: "Подтвердите действие",
    message: "ВНИМАНИЕ: Это удалит все балансы и всю историю транзакций.",
    confirmText: "Подтвердить",
    cancelText: "Отменить",
    confirmationValue: confirmCode,
    confirmationPlaceholder: `Введите ${confirmCode} для подтверждения`
  });
  if (!ok) return;

  // 1. Обнуляем все балансы envelope'ов
  const envelopesSnapshot = await db.collection('envelopes').get();
  const batch = db.batch();
  envelopesSnapshot.forEach(doc => {
    batch.update(doc.ref, { current: 0 });
  });
  await batch.commit();

  // 2. Удаляем ВСЕ транзакции
  const transactionsSnapshot = await db.collection('transactions').get();
  const batch2 = db.batch();
  transactionsSnapshot.forEach(doc => {
    batch2.delete(doc.ref);
  });
  await batch2.commit();

  await showConfirmModal({
    title: "Готово!",
    message: "Все балансы и история транзакций полностью сброшены!",
    confirmText: "OK",
    cancelText: ""
  });

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
  const menuBtns = document.querySelectorAll('.menu-btn');
  console.log("Назначаем обработчик на кнопки:", menuBtns);
  menuBtns.forEach(btn => {
    btn.onclick = null;
    btn.addEventListener('click', (e) => {
      console.log("Клик по кнопке меню!", btn, btn.getAttribute('data-id'));
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

  cancelBtn.onclick = () => {
    document.body.removeChild(modal);
  };

  const saveBtn = document.createElement("button");
  saveBtn.className = "round-btn green";
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
}

function showEnvelopeMenu(btn, id) {
  const oldMenu = document.getElementById('envelope-menu-popup');
  if (oldMenu) oldMenu.remove();

  const menu = document.createElement('div');
  menu.id = 'envelope-menu-popup';
  menu.className = 'envelope-menu-popup glass-pill-menu';

  // Три кнопки: история, редактировать, удалить
  menu.innerHTML = `
    <button class="menu-icon-btn menu-btn-history" title="История">
      <svg width="20" height="20" fill="none" stroke="#23292D" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <polyline points="11 6 11 11 15 13"/>
      </svg>
    </button>
    <button class="menu-icon-btn menu-btn-edit" title="Редактировать">
      <svg width="20" height="20" fill="none" stroke="#23292D" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.5 4.5a2.1 2.1 0 1 1 3 3L7 18l-3 1 1-3L14.5 4.5Z"/>
        <path d="M10 16h7"/>
      </svg>
    </button>
    <button class="menu-icon-btn menu-btn-delete" title="Удалить">
      <svg width="20" height="20" fill="none" stroke="#23292D" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 17 6"/>
        <path d="M15 6v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3-2v2"/>
        <line x1="8" y1="9" x2="8" y2="15"/>
        <line x1="12" y1="9" x2="12" y2="15"/>
      </svg>
    </button>
  `;

  const [historyBtn, editBtn, delBtn] = menu.querySelectorAll('button');
  historyBtn.onclick = () => { menu.remove(); openEnvelopeHistory(id); };
  editBtn.onclick    = () => { menu.remove(); startEditEnvelope(id); };
  delBtn.onclick     = () => { menu.remove(); deleteEnvelope(id); };

  setTimeout(() => {
    document.addEventListener('mousedown', function handler(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) {
        menu.remove();
        document.removeEventListener('mousedown', handler);
      }
    });
  }, 50);

  // Вставить пилюлю меню слева от кнопки меню:
 btn.parentNode.insertBefore(menu, btn);

menu.style.marginTop = '0px';     // вверх
menu.style.marginRight = '-5px';    // влево

  // Прячем "Удалить" для спец-конвертов
  db.collection("envelopes").doc(id).get().then(doc => {
    const data = doc.data();
    if (data.isPrimary || data.isMiniBudget) {
      delBtn.style.display = 'none';
    }
  });
}

async function openEnvelopeHistory(envelopeId) {
  // 1. Получить имя конверта для заголовка
  const envelopeDoc = await db.collection("envelopes").doc(envelopeId).get();
  const envelopeName = envelopeDoc.exists ? envelopeDoc.data().name : "Конверт";

  // 2. Создать модальное окно
  const modal = document.createElement("div");
  modal.id = "history-modal";
  modal.classList.add("glass-modal");
  modal.style.cssText = `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 340px;
    max-height: 80vh;
    background: rgba(255,255,255,0.45);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-radius: 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    padding: 20px;
    z-index: 9999;
    color: #23292D;
    font-size: 14.5px;
    display: flex;
    flex-direction: column;
  `;

  // 3. Заголовок
  modal.innerHTML = `
    <h3 style="margin: 0 0 12px 0; font-size: 1.15em; text-align: center; color:#23292D;">История: ${escapeHTML(envelopeName)}</h3>
  `;

  // 4. Кнопка "Закрыть"
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕ Закрыть";
  closeBtn.style.cssText = `
    position: sticky;
    top: 0;
    z-index: 1000;
    background: rgba(190, 60, 50,0.7);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.2);
    padding: 6px 16px;
    margin-bottom: 12px;
    margin-left: auto;
    margin-right: auto;
    display: block;
    font-weight: 600;
    color: #23292D;
    cursor: pointer;
  `;
  closeBtn.onclick = () => modal.remove();
  modal.appendChild(closeBtn);

  // 5. Обёртка для скролла
  const scrollWrapper = document.createElement("div");
  scrollWrapper.id = "history-scroll-wrapper";
  scrollWrapper.style.cssText = `
    overflow-y: auto;
    max-height: 63vh;
    padding-right: 2px;
    margin-top: 10px;
    flex: 1 1 auto;
  `;

  // 6. Загрузка транзакций только для этого envelopeId
  const snapshot = await db.collection("transactions")
    .where("envelopeId", "==", envelopeId)
    .orderBy("date", "desc")
    .get();

  if (snapshot.empty) {
    scrollWrapper.innerHTML += "<p style='color:#555;'>Нет данных</p>";
  } else {
    snapshot.forEach(doc => {
      const { amount, type, date, toEnvelopeId, fromEnvelopeId } = doc.data();
      const d = new Date(date);
      const dateStr = d.toLocaleDateString();
      const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

      // Цвета по типу операции
      let className = "";
      let text = "";
      if (type === "add" || type === "income") {
        className = "history-add";
        text = `+ ${amount.toFixed(2)} €`;
      } else if (type === "subtract") {
        className = "history-sub";
        text = `– ${Math.abs(amount).toFixed(2)} €`;
      } else if (type === "transfer-out") {
        className = "history-transfer";
        text = `➡ ${Math.abs(amount).toFixed(2)} € →`;
        if (toEnvelopeId) text += " в другой конверт";
      } else if (type === "transfer-in") {
        className = "history-transfer";
        text = `⬅ ${amount.toFixed(2)} € ←`;
        if (fromEnvelopeId) text += " из другого конверта";
      } else {
        return;
      }

      // Вставка блока-строки
      const entry = document.createElement("div");
      entry.className = className;
      entry.style.cssText = `
        margin-bottom: 8px;
        padding: 10px 12px;
        border-radius: 14px;
        font-weight: 500;
        letter-spacing: 0.2px;
        font-size: 14.5px;
        background: ${className === "history-add" ? "rgba(43, 130, 66, 0.85)" : className === "history-sub" ? "rgba(160, 47, 29, 0.85)" : "rgba(168, 121, 0, 0.85)"};
        color: #fff;
      `;
      entry.innerHTML = `<div style="font-size:13px; color:#c9c9c9;">${dateStr} ${timeStr}</div><div>${text}</div>`;
      scrollWrapper.appendChild(entry);
    });
  }

  // 7. Добавить всё в модалку и вывести на экран
  modal.appendChild(scrollWrapper);
  document.body.appendChild(modal);
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



document.getElementById('open-history-btn')?.addEventListener('click', async () => {
  const modal = document.createElement("div");
  modal.id = "history-modal";
  modal.classList.add("glass-modal");
  modal.style.cssText = `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 340px;
    max-height: 80vh;
    background: rgba(30,30,40,0.45);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-radius: 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    padding: 20px;
    z-index: 9999;
    color: #fff;
    font-size: 14.5px;
    display: flex;
    flex-direction: column;
  `;

  modal.innerHTML = `<h3 style="margin: 0 0 12px 0; font-size: 1.15em; text-align: center; color:#23292D;">История транзакций</h3>`;

  // Кнопка "Закрыть"
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕ Закрыть";
  closeBtn.style.cssText = `
    position: sticky;
    top: 0;
    z-index: 1000;
    background: rgba(190, 60, 50,0.7);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.2);
    padding: 6px 16px;
    margin-bottom: 12px;
    margin-left: auto;
    margin-right: auto;
    display: block;
    font-weight: 600;
    color: #23292D;
    cursor: pointer;
  `;
  modal.appendChild(closeBtn);

  // Создаём scrollWrapper для прокрутки истории
  const scrollWrapper = document.createElement("div");
  scrollWrapper.id = "history-scroll-wrapper";
  scrollWrapper.style.cssText = `
    overflow-y: auto;
    max-height: 63vh;
    padding-right: 2px;
    margin-top: 10px;
    flex: 1 1 auto;
  `;

  // Загружаем названия конвертов
  const envelopesSnapshot = await db.collection("envelopes").get();
  const envelopeNames = {};
  envelopesSnapshot.forEach(doc => {
    envelopeNames[doc.id] = doc.data().name;
  });

  // Загружаем и рендерим транзакции В scrollWrapper
  const snapshot = await db.collection("transactions").orderBy("date", "desc").get();
  if (snapshot.empty) {
    scrollWrapper.innerHTML += "<p style='color:#555;'>Нет данных</p>";
  } else {
    snapshot.forEach(doc => {
      const { amount, envelopeId, type, date, toEnvelopeId } = doc.data();
      const d = new Date(date);
      const dateStr = d.toLocaleDateString();
      const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

      let className = "";
      let text = "";
      if (type === "add" || type === "income") {
        className = "history-add";
        text = `+ ${amount.toFixed(2)} € — ${envelopeNames[envelopeId] || "?"}`;
      } else if (type === "subtract") {
        className = "history-sub";
        text = `– ${amount.toFixed(2)} € — ${envelopeNames[envelopeId] || "?"}`;
      } else if (type === "transfer-out") {
        className = "history-transfer";
        text = `➡ ${amount.toFixed(2)} € — ${envelopeNames[envelopeId]} → ${envelopeNames[toEnvelopeId]}`;
      } else {
        return; // пропустить другие типы
      }

      const entry = document.createElement("div");
      entry.className = className;
      entry.style.cssText = `
        margin-bottom: 8px;
        padding: 10px 12px;
        border-radius: 14px;
        font-weight: 500;
        letter-spacing: 0.2px;
        font-size: 14.5px;
        background: ${className === "history-add" ? "rgba(43, 130, 66, 0.85)" : className === "history-sub" ? "rgba(160, 47, 29, 0.85)" : "rgba(168, 121, 0, 0.85)"};
        color: #ffffff;
      `;
      entry.innerHTML = `<div style="font-size:13px; color:#555;">${dateStr} ${timeStr}</div><div>${text}</div>`;
      scrollWrapper.appendChild(entry);
    });
  }

  modal.appendChild(scrollWrapper);
  document.body.appendChild(modal);

  closeBtn.onclick = () => modal.remove();
});

   
window.addEventListener("DOMContentLoaded", async () => {
  await ensureSystemEnvelopes();
  loadEnvelopes();
  document.getElementById('reset-envelopes').addEventListener('click', resetAllEnvelopes);

  // --- Добавь обработчик для сворачивания/разворачивания "добавить конверт" ---
  const toggleAddEnvelope = document.getElementById("toggle-add-envelope");
  const addEnvelopeWrapper = document.getElementById("add-envelope-wrapper");
  const addEnvelopeToggleContainer = addEnvelopeWrapper?.querySelector('.add-envelope-toggle-container');
  if (toggleAddEnvelope && addEnvelopeWrapper && addEnvelopeToggleContainer) {
    toggleAddEnvelope.addEventListener("change", () => {
      const isOn = toggleAddEnvelope.checked;
      addEnvelopeWrapper.classList.remove("collapsed", "expanded");
      addEnvelopeWrapper.classList.add(isOn ? "expanded" : "collapsed");
      addEnvelopeToggleContainer.style.display = isOn ? "block" : "none";
    });
    // По умолчанию свернуто
      addEnvelopeToggleContainer.style.display = "none";
  }

  // <--- ВОТ СЮДА! --->
  document.getElementById('envelope-list').addEventListener('click', function(e) {
    const btn = e.target.closest('.menu-btn');
    if (btn && btn.closest('.envelope-actions')) {
      console.log("=== [DEBUG] Клик по кнопке меню!", btn, btn.getAttribute('data-id'));
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      showEnvelopeMenu(btn, id);
    }
  });

});
