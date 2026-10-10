// envelopes-app.js

// Firebase config
// Firebase is initialized once by shared/auth.js.
const db = MyApps.db();
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// Получить название конверта по id (асинхронно)
async function getEnvelopeNameById(id) {
  if (!id) return "";
  const doc = await db.collection("envelopes").doc(id).get();
  if (doc.exists) return doc.data().name || "";
  return "";
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
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:0 4px; margin-top: 12px;">
  ${cancelText ? `<button class="transfer-btn cancel" type="button" title="${cancelText}">
    <svg width="32" height="32" viewBox="0 0 24 24">
      <line x1="6" y1="6" x2="18" y2="18"/>
      <line x1="18" y1="6" x2="6" y2="18"/>
    </svg>
  </button>` : ""}
  <button class="transfer-btn confirm" type="button" ${confirmationValue ? 'disabled' : ''} title="${confirmText}">
    <svg width="32" height="32" viewBox="0 0 24 24">
      <polyline points="5 13 10.5 18 19 7"/>
    </svg>
  </button>
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

   modal.innerHTML = `
  <h3 style="color:#23292D;text-align:center; font-size:1.13em; font-weight:700; margin:0 0 20px 0;">${title}</h3>
  <div class="input-row-with-btn">
    <input id="glass-amount-input" type="number" step="0.01" min="0" inputmode="decimal"
      placeholder="${placeholder}" />
    ${typeof maxAmount === "number" ? `
      <button id="fill-max-btn" class="pill-btn max-btn" type="button">Все</button>
    ` : ""}
  </div>

      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:0 4px; margin-top: 12px;">
        <button class="transfer-btn cancel" type="button" title="${cancelText}">
          <svg width="32" height="32" viewBox="0 0 24 24">
            <line x1="6" y1="6" x2="18" y2="18"/>
            <line x1="18" y1="6" x2="6" y2="18"/>
          </svg>
        </button>
        <button class="transfer-btn confirm" type="button" title="${confirmText}">
          <svg width="32" height="32" viewBox="0 0 24 24">
            <polyline points="5 13 10.5 18 19 7"/>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const input = modal.querySelector("#glass-amount-input");
    if (input) input.focus();

    const fillMaxBtn = modal.querySelector("#fill-max-btn");
    if (fillMaxBtn && typeof maxAmount === "number") {
      fillMaxBtn.onclick = () => {
        input.value = maxAmount;
        input.focus();
      };
    }

    const confirmBtn = modal.querySelector(".transfer-btn.confirm");
    const cancelBtn = modal.querySelector(".transfer-btn.cancel");

    confirmBtn.onclick = confirm;
    cancelBtn.onclick = cancel;

    input.onkeydown = (e) => {
      if (e.key === "Enter") confirm();
      if (e.key === "Escape") cancel();
    };

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

  // Скрыть поле выбора конверта для автопереноса
  const transferSwitch = document.getElementById("transfer-switch");
  const transferSelect = document.getElementById("transfer-target-select");
  transferSwitch.checked = false;
  transferSelect.style.display = "none";

  renderInlineDistributionEditor();

  document.getElementById('envelope-goal').style.display = 'none';
  document.getElementById('envelope-percent').style.display = 'none';
  document.getElementById('envelope-percent-label').style.display = 'none';
  const submitBtn = document.querySelector('#add-envelope-form button[type="submit"]');
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
    comment,
    hasGoal,
    goal,
    distribution,
    percent,
    transferEnabled: document.getElementById("transfer-switch").checked,
    transferTarget: document.getElementById("transfer-switch").checked
      ? document.getElementById("transfer-target-select").value
      : null,
  });
} else {
  await db.collection("envelopes").add({
    name,
    goal,
    comment,
    current: 0,
    created: Date.now(),
    includeInDistribution: distribution,
    percent,
    transferEnabled: document.getElementById("transfer-switch").checked,
    transferTarget: document.getElementById("transfer-switch").checked
      ? document.getElementById("transfer-target-select").value
      : null,
  });
}
async function getEnvelopeNameById(id) {
  if (!id) return "";
  const doc = await db.collection("envelopes").doc(id).get();
  if (doc.exists) return doc.data().name || "";
  return "";
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
    html += `<div class="distribution-warning">часть процентов не распределена! Она будет направлена в "Общий"</div>`;

  } else {
    html += `<div style="color:#186663;">Распределение корректно.</div>`;
  }

  container.innerHTML = html;
}

let editingEnvelopeId = null;

async function fillTransferTargetSelect(editingEnvelopeId = null) {
  const select = document.getElementById("transfer-target-select");
  if (!select) return;
  const prev = select.value;
  select.innerHTML = '<option value="">— Выбери конверт —</option>';

  const snapshot = await db.collection("envelopes").orderBy("created", "asc").get();

  // Соберём id всех конвертов, у которых уже включён автоперенос
  const lockedIds = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.transferEnabled && data.transferTarget) lockedIds.push(doc.id);
  });

  snapshot.forEach(doc => {
    const data = doc.data();
    // Не даём выбрать самого себя
    if (editingEnvelopeId && doc.id === editingEnvelopeId) return;

    // Не даём выбрать те, у кого уже активирован автоперенос — либо вообще не показывать, либо сделать disabled с подписью
    if (lockedIds.includes(doc.id)) {
      // ВАРИАНТ 1: исключить вовсе (раскомментируй следующую строку)
      // return;

      // ВАРИАНТ 2: добавить disabled-опцию с пометкой
      const option = document.createElement("option");
      option.value = doc.id;
      option.disabled = true;
      option.textContent = data.name || "(без названия)";
      select.appendChild(option);
      return;
    }

    // Обычные, доступные для выбора конверты
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = data.name || "(без названия)";
    select.appendChild(option);
  });

  // Сохрани прежний выбор, если редактируешь
  if (prev) select.value = prev;
}
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
document.getElementById("transfer-switch").checked = !!data.transferEnabled;
document.getElementById("transfer-target-select").value = data.transferTarget || "";
document.getElementById("transfer-target-select").style.display = data.transferEnabled ? "block" : "none";

  editingEnvelopeId = id;

  // Если это "Общий" (isPrimary), то делаем чекбокс распределения неактивным и серым
  const distributionCheckbox = document.getElementById('envelope-distribution');
  const percentInput = document.getElementById('envelope-percent');
  const percentLabel = document.getElementById('envelope-percent-label');
  const distRow = distributionCheckbox.closest('.envelope-form-row') || distributionCheckbox.parentNode;

  if (data.isPrimary) {
    distributionCheckbox.checked = false;
    distributionCheckbox.disabled = true;
    if (distRow) distRow.classList.add('ios-switch-disabled');
    percentInput.style.display = percentLabel.style.display = 'none';

    // Сообщение при клике
   distRow.addEventListener('click', function showDistInfo(e) {
  if (distributionCheckbox.disabled) {
    showCenterToast('В "Общий" идут только нераспределённые проценты.');
    e.preventDefault();
  }
});

  } else {
    distributionCheckbox.disabled = false;
    if (distRow) distRow.classList.remove('ios-switch-disabled');
  }


// --- [START] Disable transfer switch if this envelope is a transfer target ---
  const transferSwitch = document.getElementById("transfer-switch");
  const transferSelect = document.getElementById("transfer-target-select");
  const switchLabel = transferSwitch.closest('.ios-switch');
  // Очистить серый класс и события (если были)
  if (switchLabel) {
    switchLabel.classList.remove('ios-switch-disabled');
    switchLabel.onclick = null;
  }
  transferSwitch.disabled = false;
  transferSelect.disabled = false;

  // Проверим: кто-нибудь переносит остатки в этот конверт?
  db.collection("envelopes").get().then(snapshot => {
  let sources = [];
  snapshot.forEach(doc => {
    const d = doc.data();
    if (d.transferEnabled && d.transferTarget === id) {
      sources.push(d.name || "(без названия)");
    }
  });
  if (sources.length) {
    transferSwitch.disabled = true;
    transferSelect.disabled = true;
   if (switchLabel) {
  switchLabel.classList.add('ios-switch-disabled');
  switchLabel.onclick = function(e) {
    showCenterToast(
      `Перенос невозможен. Этот конверт выбран как цель автопереноса из: ${sources.join(', ')}.`,
      2600
    );
    e.preventDefault();
  };
}


  }
});

  // --- [END] Disable transfer switch if this envelope is a transfer target ---

  // Меняем кнопку: ставим "save" вместо "check"
  const submitBtn = document.querySelector('#add-envelope-form button[type="submit"]');
    document.getElementById('cancel-edit-btn').style.display = 'inline-flex';
renderInlineDistributionEditor();
fillTransferTargetSelect(id);
}


async function loadEnvelopes() {
  list.innerHTML = "<p style='color:#999'>Загрузка...</p>";
  const snapshot = await db.collection("envelopes").orderBy("created", "asc").get();
  if (snapshot.empty) {
    list.innerHTML = "<p style='color:#bbb'>Нет ни одного конверта</p>";
    return;
await fillTransferTargetSelect();

  }
  list.innerHTML = "";
const summaryContainer = document.getElementById("envelope-summary-cards");
const summaryHeader = document.getElementById("envelope-summary-header");
if (summaryContainer) summaryContainer.innerHTML = "";
if (summaryHeader) summaryHeader.innerHTML = "";
const envelopeGridContainer = document.createElement("div");
envelopeGridContainer.className = "envelope-grid-container";
list.appendChild(envelopeGridContainer);

let totalBalance = 0; // <-- объявление только ОДИН раз!
await Promise.all(snapshot.docs.map(async doc => {
  const data = doc.data();
  const percent = Math.min(100, Math.round(data.percent || 0));
  const isMiniBudget = data.isMiniBudget === true;
  const isPrimary = data.isPrimary === true;

let displayPercent = percent;

if (isPrimary) {
  // Для "Общий" показать нераспределённый процент
  // 1. Собираем сумму всех percent, где !isPrimary && includeInDistribution === true
  let totalPercent = 0;
  snapshot.docs.forEach(d => {
    const dat = d.data();
    if (!dat.isPrimary && dat.includeInDistribution !== false) {
      totalPercent += Number(dat.percent || 0);
    }
  });
  displayPercent = 100 - totalPercent;
  if (displayPercent < 0) displayPercent = 0;
}


  const name = data.name || "";
  let titleFontSize = "2em";
  if (name.length > 18) titleFontSize = "1.4em";
  if (name.length > 28) titleFontSize = "1.05em";

  // Получить сумму за месяц
  const monthStats = await getEnvelopeMonthStats(doc.id);
  const addedThisMonth = monthStats.added;
  const spentThisMonth = monthStats.spent;

  let goalDisplay;
  let goalForCalc;
  if (data.isPrimary) {
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

  // --- ВСТАВЬ ЭТО СЮДА ---
  const block = document.createElement("div");
  block.className = "envelope-card-grid";
  block.setAttribute("data-id", doc.id);
  // --- ДО block.innerHTML = ... ---

 block.innerHTML = `
  <div class="envelope-main">
    <div class="envelope-header" style="font-size:${titleFontSize}; color:#23292D; font-weight:700;">
      ${escapeHTML(name)}
    </div>
    <div class="envelope-row-grid">
      <div class="envelope-progress-info">
        <div class="envelope-balance">
          <span class="env-balance-main">${Math.round(data.current).toLocaleString('ru-RU')}</span>
          <span class="env-balance-sep">/</span>
          <span class="env-balance-goal">${goalDisplay}</span>
        </div>
        <div class="envelope-distribution">
          <span style="font-size:12px;">Распределение:</span>
          <span style="font-weight:400;font-size:12px;">${displayPercent}%</span>
        </div>
        ${
          data.transferEnabled && data.transferTarget
            ? `<div class="envelope-transfer-note">${"Загрузка..."}</div>`
            : ""
        }
      </div>
<div class="envelope-progress-ring">
  ${
    goalForCalc && goalForCalc > 0
      ? `<svg width="60" height="60">
            <circle
              cx="30" cy="30" r="26"
              stroke="#d2d7dd"
              stroke-width="8"
              fill="none"
              opacity="0.36"
            />
            <circle
              cx="30" cy="30" r="26"
              stroke="#FFA35C"
              stroke-width="8"
              fill="none"
              stroke-linecap="round"
              stroke-dasharray="${2 * Math.PI * 26}"
              stroke-dashoffset="${2 * Math.PI * 26 * (1 - progress)}"
              style="transition:stroke-dashoffset 0.4s;"
              transform="rotate(-90 30 30)"
            />
            <text x="30" y="36" text-anchor="middle" font-size="18" fill="#FFA35C" font-weight="bold">${progressPercent}%</text>
         </svg>`
      : `<svg width="60" height="60">
            <circle
              cx="30" cy="30" r="26"
              stroke="#d2d7dd"
              stroke-width="8"
              fill="none"
              opacity="0.36"
            />
            <text x="30" y="30" text-anchor="middle" dominant-baseline="middle" font-size="32" fill="#FFA35C" font-weight="bold" letter-spacing="2">∞</text>
         </svg>`
  }
</div>
</div>

    <div class="envelope-stats" style="margin: 8px 0 4px 0;">
       <div>Добавлено в этом месяце: <b>${Math.round(addedThisMonth).toLocaleString('ru-RU')}</b></div>
  <div>Потрачено в этом месяце: <b>${Math.round(spentThisMonth).toLocaleString('ru-RU')}</b></div>
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

  // После block.innerHTML и envelopeGridContainer.appendChild(block):

  if (data.transferEnabled && data.transferTarget) {
    const noteDiv = block.querySelector('.envelope-transfer-note');
    if (noteDiv) {
      const targetName = await getEnvelopeNameById(data.transferTarget);
      noteDiv.textContent = `Перенос в «${targetName}» в конце месяца.`;
    }
  }


  totalBalance += data.current || 0;

  // Цвет карточки
  let cardColor = ""; // по умолчанию — стеклянная
  if (data.goal > 0 && data.current >= data.goal) cardColor = "green";
  else {
    const { added, spent } = await getEnvelopeMonthStats(doc.id);
    if (spent > added) cardColor = "red";
  }

  if (summaryContainer) {
    const card = document.createElement("div");
    card.className = `summary-card ${cardColor}`;
    card.dataset.id = doc.id;
    card.innerHTML = `
      <div>${escapeHTML(data.name)}</div>
<div style="font-weight: 500; font-size: 1.2em;">${Math.floor(data.current)} €</div>
      ${data.goal > 0 ? `<div style="font-size: 0.85em;">${Math.min(Math.round((data.current / data.goal) * 100), 999)}%</div>` : ""}
    `;
    card.addEventListener("click", () => {
      const target = document.querySelector(`.envelope-card-grid[data-id='${doc.id}']`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.style.boxShadow = "0 0 0 4px rgba(255,163,92,0.55)";
        setTimeout(() => {
          target.style.boxShadow = "";
        }, 900);
      }
    });
    summaryContainer.appendChild(card);
  }
}));

// Сумма добавленного за этот месяц по всем конвертам
let totalAddedThisMonth = 0;
await Promise.all(snapshot.docs.map(async doc => {
  const stats = await getEnvelopeMonthStats(doc.id);
  totalAddedThisMonth += stats.added;
}));


if (summaryHeader) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric"
  });
summaryHeader.innerHTML = `
  <div style="display: flex; align-items: flex-start; justify-content: space-between; width: 100%;">
    <div style="display: flex; flex-direction: column; align-items: flex-start;">
      <span class="summary-total-label">Всего</span>
      <span class="summary-total-amount" style="white-space:nowrap;">
        ${Math.round(totalBalance).toLocaleString('ru-RU')} €
      </span>
      <span class="summary-month-label" style="font-size:1.02em; color:#e8b17b; font-weight:400; opacity:0.82; margin-top:4px;">
        В этом месяце:
        <b style="color:#fff; font-weight:600;">${Math.round(totalAddedThisMonth).toLocaleString('ru-RU')} €</b>
      </span>
    </div>
    <span class="summary-date" style="
      white-space:nowrap;
      margin-left:12px;
      margin-top:0;
      font-size:1.04em;
      color:#f4ecd3;
      opacity:0.87;
      font-weight:400;
      align-self:flex-start;
      ">
      ${dateStr}
    </span>
  </div>
`;
}

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
  const newPercent = prompt("Распределение (%):", oldPercent);
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
  // Модальное окно
  const ok = await showConfirmModal({
    title: "Удалить конверт?",
    message: "Вы действительно хотите удалить этот конверт? Это действие необратимо.",
    confirmText: "Да",
    cancelText: "Нет"
  });
  if (!ok) return;
  await ref.delete();
  loadEnvelopes();
}


async function transferEnvelope(fromId, maxAmount) {
  // Получаем все конверты
  const snapshot = await db.collection("envelopes").orderBy("created", "asc").get();
  const envelopes = snapshot.docs.filter(doc => doc.id !== fromId);
  if (!envelopes.length) {
    alert("Нет других конвертов для перевода.");
    return;
  }
  const fromDoc = snapshot.docs.find(doc => doc.id === fromId);
  const fromName = fromDoc?.data()?.name || "Текущий";

  // --- Создаём модалку ---
  const modal = document.createElement("div");
  modal.className = "glass-modal";
  modal.style.cssText = `
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 340px; max-width: 98vw;
    background: rgba(10, 10, 10, 0.22);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-radius: 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.22);
    padding: 24px 22px 18px 22px;
    z-index: 99999;
    display: flex; flex-direction: column; align-items: stretch;
  `;

  // --- Вставляем HTML ---
  modal.innerHTML = `
    <h3 style="color:#23292D; text-align:center; font-size:1.13em; font-weight:700; margin:0 0 18px 0;">Перевод из "${fromName}"</h3>
    <div style="display:flex; gap:10px; margin-bottom: 16px; width:100%;">
  <input id="glass-amount-input" type="number"
    class="transfer-select"
    style="flex:1 1 0; min-width:0; max-width:210px; text-align:center; font-size:1.13em;"
    step="0.01" min="0" inputmode="decimal" placeholder="Сумма для перевода" />
  <button id="fill-max-btn" class="pill-btn max-btn" type="button" style="height:44px;">Все</button>
</div>
<select id="envelope-select" class="transfer-select" style="width:100%;margin-bottom: 16px;">
  <option value="">— выбрать конверт —</option>
  ${envelopes.map(doc => `<option value="${doc.id}">${doc.data().name}</option>`).join('')}
</select>

    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:0 4px; margin-top: 10px;">
      <button class="transfer-btn cancel" type="button" title="Отмена">
        <svg width="32" height="32" viewBox="0 0 24 24">
          <line x1="6" y1="6" x2="18" y2="18"/>
          <line x1="18" y1="6" x2="6" y2="18"/>
        </svg>
      </button>
      <button class="transfer-btn confirm" type="button" title="Перевести">
        <svg width="32" height="32" viewBox="0 0 24 24">
          <polyline points="5 13 10.5 18 19 7"/>
        </svg>
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  // --- Логика для кнопок и инпутов ---
  const input = modal.querySelector("#glass-amount-input");
  const fillMaxBtn = modal.querySelector("#fill-max-btn");
  const select = modal.querySelector("#envelope-select");
  const confirmBtn = modal.querySelector(".transfer-btn.confirm");
  const cancelBtn = modal.querySelector(".transfer-btn.cancel");

  // “Все” — подставить максимум
  fillMaxBtn.onclick = () => {
    input.value = maxAmount;
    input.focus();
  };

  // Подтвердить перевод
  confirmBtn.onclick = async () => {
    const value = parseFloat(input.value.replace(",", "."));
    const toId = select.value;
    if (isNaN(value) || value <= 0 || value > maxAmount) {
      input.focus();
      input.select();
      input.classList.add("input-error");
      setTimeout(() => input.classList.remove("input-error"), 400);
      return;
    }
    if (!toId) {
      select.focus();
      select.classList.add("input-error");
      setTimeout(() => select.classList.remove("input-error"), 400);
      return;
    }

    // Перевод
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

  // Закрыть модалку
  cancelBtn.onclick = () => modal.remove();

  // enter / escape в поле
  input.onkeydown = (e) => {
    if (e.key === "Enter") confirmBtn.click();
    if (e.key === "Escape") cancelBtn.click();
  };
  select.onkeydown = (e) => {
    if (e.key === "Enter") confirmBtn.click();
    if (e.key === "Escape") cancelBtn.click();
  };
  input.focus();
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
buttonRow.style.marginTop = "12px";
buttonRow.style.display = "flex";
buttonRow.style.justifyContent = "space-between";
buttonRow.style.alignItems = "center";
buttonRow.style.width = "100%";
buttonRow.style.padding = "0 4px";
buttonRow.style.gap = "0";

 const cancelBtn = document.createElement("button");
cancelBtn.className = "transfer-btn cancel";
cancelBtn.title = "Отмена";
cancelBtn.innerHTML = `
  <svg width="32" height="32" viewBox="0 0 24 24">
    <line x1="6" y1="6" x2="18" y2="18"/>
    <line x1="18" y1="6" x2="6" y2="18"/>
  </svg>
`;
cancelBtn.onclick = () => {
  document.body.removeChild(modal);
};

const saveBtn = document.createElement("button");
saveBtn.className = "transfer-btn confirm";
saveBtn.title = "Сохранить";
saveBtn.innerHTML = `
  <svg width="32" height="32" viewBox="0 0 24 24">
    <polyline points="5 13 10.5 18 19 7"/>
  </svg>
`;
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

   menu.innerHTML = `
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

  const [editBtn, delBtn] = menu.querySelectorAll('button');
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

menu.style.marginTop = '-4.5px';     // вверх
menu.style.marginRight = '-8.5px';    // влево

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
        text = `+ ${amount.toFixed(2)} € — ${envelopeNames[envelopeId] || "?"}`;
      } else if (type === "subtract") {
        className = "history-sub";
        text = `– ${Math.abs(amount).toFixed(2)} € — ${envelopeNames[envelopeId] || "?"}`;
      } else if (type === "transfer-out") {
        className = "history-transfer";
        text = `➡ ${Math.abs(amount).toFixed(2)} € — ${envelopeNames[envelopeId] || "?"} → ${envelopeNames[toEnvelopeId] || "?"}`;
      } else {
        // всё остальное, включая transfer-in, не показываем!
        return;
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

  // ===== ВЕРХНИЙ БЛОК: заголовок и крестик =====
modal.innerHTML = `
  <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
    <h3 style="margin:0;font-size:1.14em; font-weight:700; color:#fff;">История транзакций</h3>
    <button id="close-history-modal" style="
      background:rgba(30,30,40,0.20);
      color:#fff;
      border:none;
      border-radius:50%;
      width:38px;height:38px;
      display:flex;align-items:center;justify-content:center;
      font-size:24px;
      font-weight:900;
      box-shadow: 0 2px 10px 0 rgba(0,0,0,0.11);
      cursor:pointer;
      transition:filter 0.12s, background 0.14s;
      ">
      <svg width="22" height="22" viewBox="0 0 22 22">
        <line x1="5" y1="5" x2="17" y2="17" stroke="#fff" stroke-width="2.7" stroke-linecap="round"/>
        <line x1="17" y1="5" x2="5" y2="17" stroke="#fff" stroke-width="2.7" stroke-linecap="round"/>
      </svg>
    </button>
  </div>

    <div style="display:flex; gap:8px; align-items:center; margin-bottom:7px;">
      <select id="filter-envelope" class="transfer-select" style="max-width:122px;flex:1 1 0;">
        <option value="all">Все конверты</option>
      </select>
      <label style="display:flex;align-items:center;gap:5px;user-select:none;">
        <input type="checkbox" value="income" id="filter-income" style="accent-color:#2dd474;width:15px;height:15px;margin:0;">
        <span style="font-size:0.99em;">Приход</span>
      </label>
      <label style="display:flex;align-items:center;gap:5px;user-select:none;">
        <input type="checkbox" value="subtract" id="filter-subtract" style="accent-color:#c93d1f;width:15px;height:15px;margin:0;">
        <span style="font-size:0.99em;">Уход</span>
      </label>
      <label style="display:flex;align-items:center;gap:5px;user-select:none;">
        <input type="checkbox" value="transfer" id="filter-transfer" style="accent-color:#e1a700;width:15px;height:15px;margin:0;">
        <span style="font-size:0.99em;">Перевод</span>
      </label>
    </div>

    <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
   <div style="display:flex; gap:16px; justify-content:center; margin:0 0 8px 0;">
  <input id="filter-date-from" type="date" class="transfer-select"
    style="width:135px; min-width:110px; max-width:135px; font-size:14px;"/>
  <input id="filter-date-to" type="date" class="transfer-select"
    style="width:135px; min-width:110px; max-width:135px; font-size:14px;"/>
</div>

    </div>

    <div style="display:flex;justify-content:center;margin-bottom:10px;">
      <button id="reset-history-filters" style="
        background:rgba(80,80,85,0.22);
        color:#fff;
        border:none;
        border-radius:999px;
        font-weight:600;
        font-size:1em;
        letter-spacing:0.01em;
        padding:8px 28px;
        cursor:pointer;
        transition:filter 0.15s,background 0.17s;">
        Сбросить фильтры
      </button>
    </div>
  `;

  // ===== Логика закрытия =====
  modal.querySelector('#close-history-modal').onclick = () => modal.remove();

  // ===== Динамически наполняем список конвертов =====
  const envelopesSnapshot = await db.collection("envelopes").get();
  const envelopeNames = {};
  envelopesSnapshot.forEach(doc => {
    envelopeNames[doc.id] = doc.data().name;
  });
  const filterEnvelope = modal.querySelector('#filter-envelope');
  Object.entries(envelopeNames).forEach(([id, name]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    filterEnvelope.appendChild(opt);
  });

  // ===== Scroll wrapper =====
  const scrollWrapper = document.createElement("div");
  scrollWrapper.id = "history-scroll-wrapper";
  scrollWrapper.style.cssText = `
    overflow-y: auto;
    max-height: 60vh;
    margin-top: 4px;
    flex: 1 1 auto;
  `;
  modal.appendChild(scrollWrapper);

  // ===== Рендер истории =====
  async function renderHistoryList() {
    scrollWrapper.innerHTML = '';
    // Фильтры
    const types = [];
    if (modal.querySelector('#filter-income').checked) types.push("income");
    if (modal.querySelector('#filter-subtract').checked) types.push("subtract");
    if (modal.querySelector('#filter-transfer').checked) types.push("transfer");
    const envelopeId = filterEnvelope.value;
    const fromDate = modal.querySelector('#filter-date-from').value;
    const toDate = modal.querySelector('#filter-date-to').value;

    let txs = [];
    const snapshot = await db.collection("transactions").orderBy("date", "desc").get();
    snapshot.forEach(doc => {
      const tx = doc.data();
      tx.id = doc.id;
      txs.push(tx);
    });

    txs = txs.filter(tx => {
      if (types.length) {
        if (
          (types.includes("income") && (tx.type === "add" || tx.type === "income")) ||
          (types.includes("subtract") && tx.type === "subtract") ||
          (types.includes("transfer") && (tx.type === "transfer-out" || tx.type === "transfer-in"))
        ) {
          // ok
        } else {
          return false;
        }
      }
      if (envelopeId !== "all") {
        if (tx.envelopeId !== envelopeId && tx.toEnvelopeId !== envelopeId && tx.fromEnvelopeId !== envelopeId)
          return false;
      }
      if (fromDate) {
        const d = new Date(tx.date);
        const fromD = new Date(fromDate + "T00:00:00");
        if (d < fromD) return false;
      }
      if (toDate) {
        const d = new Date(tx.date);
        const toD = new Date(toDate + "T23:59:59");
        if (d > toD) return false;
      }
      return true;
    });

    if (!txs.length) {
      scrollWrapper.innerHTML = "<p style='color:#555;margin-top:18px;text-align:center;'>Нет данных</p>";
      return;
    }

    txs.forEach(tx => {
      const { amount, envelopeId, type, date, toEnvelopeId, fromEnvelopeId } = tx;
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
        text = `– ${Math.abs(amount).toFixed(2)} € — ${envelopeNames[envelopeId] || "?"}`;
      } else if (type === "transfer-out") {
        className = "history-transfer";
        text = `➡ ${Math.abs(amount).toFixed(2)} € — ${envelopeNames[envelopeId] || "?"} → ${envelopeNames[toEnvelopeId] || "?"}`;
      } else {
        // всё остальное, включая transfer-in, не показываем!
        return;
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
        color: #fff;
      `;
      entry.innerHTML = `<div style="font-size:13px; color:#c9c9c9;">${dateStr} ${timeStr}</div><div>${text}</div>`;
      scrollWrapper.appendChild(entry);
    });
  }

  // ===== События на фильтрах и сброс =====
  [
    '#filter-income', '#filter-subtract', '#filter-transfer',
    '#filter-envelope', '#filter-date-from', '#filter-date-to'
  ].forEach(sel => {
    modal.querySelector(sel).onchange = renderHistoryList;
  });
  modal.querySelector('#reset-history-filters').onclick = () => {
    modal.querySelector('#filter-income').checked = false;
    modal.querySelector('#filter-subtract').checked = false;
    modal.querySelector('#filter-transfer').checked = false;
    modal.querySelector('#filter-envelope').value = "all";
    modal.querySelector('#filter-date-from').value = "";
    modal.querySelector('#filter-date-to').value = "";
    renderHistoryList();
  };

  // ===== Первый запуск =====
  renderHistoryList();

  // ===== Показать =====
  document.body.appendChild(modal);
});


   
MyApps.ready(async () => {
  await ensureSystemEnvelopes();
  await fillTransferTargetSelect();

  // --- Перенос остатков 1 числа месяца ---
  const today = new Date();
  if (today.getDate() === 1) {
    await transferBalancesAtMonthStart();
showCenterToast("Остатки автоматически перенесены!", 2900);
  }

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

async function startEditEnvelope(id) {
  // Получаем данные конверта
  const doc = await db.collection("envelopes").doc(id).get();
  if (!doc.exists) return;
  const data = doc.data();

  // Открыть форму (если она закрыта)
  const toggle = document.getElementById('toggle-add-envelope');
  if (toggle && !toggle.checked) {
    toggle.checked = true;
    const wrapper = document.getElementById("add-envelope-wrapper");
    const container = wrapper?.querySelector('.add-envelope-toggle-container');
    wrapper?.classList.remove("collapsed");
    wrapper?.classList.add("expanded");
    if (container) container.style.display = "block";
  }


  // Заполнить форму значениями
  fillEditForm(data, id);

  // Скроллим к форме (по желанию)
  document.getElementById('add-envelope-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
}



const transferSwitch = document.getElementById("transfer-switch");
const transferSelect = document.getElementById("transfer-target-select");

function updateTransferNote() {
  if (!commentInput) return;
  let value = commentInput.value.replace(/\n?Перенос в «[^»]+» в конце месяца\./, "");
  if (transferSwitch.checked && transferSelect.value) {
    const targetOption = transferSelect.options[transferSelect.selectedIndex];
    const targetName = targetOption ? targetOption.textContent : "";
    value = value.trim() + `\nПеренос в «${targetName}» в конце месяца.`;
  }
  commentInput.value = value.trim();
}


transferSelect.style.display = transferSwitch.checked ? "block" : "none";
transferSwitch.addEventListener("change", () => {
  transferSelect.style.display = transferSwitch.checked ? "block" : "none";
});

// Показать уведомление по центру экрана
function showCenterToast(message, ms = 2200) {
  // Удалить предыдущий, если был
  let old = document.getElementById('center-toast-tip');
  if (old) old.remove();

  const tip = document.createElement('div');
  tip.id = 'center-toast-tip';
  tip.className = 'toast-tip-center';
  tip.textContent = message;
  document.body.appendChild(tip);

  setTimeout(() => {
    tip.style.opacity = '0';
    setTimeout(() => tip.remove(), 400);
  }, ms);
}



async function transferBalancesAtMonthStart() {
  const snapshot = await db.collection("envelopes").get();
  const batch = db.batch();

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.transferEnabled && data.transferTarget && data.current > 0) {
      const amount = data.current;
      const fromRef = doc.ref;
      const toRef = db.collection("envelopes").doc(data.transferTarget);

      batch.update(fromRef, { current: 0 });
      batch.update(toRef, {
        current: firebase.firestore.FieldValue.increment(amount)
      });
    }
  });

  await batch.commit();
  console.log("✅ Остатки перенесены.");
}
