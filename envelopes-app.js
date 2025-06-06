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
    if (data.includeInDistribution === false || data.isPrimary) return;

    const row = document.createElement("div");
    row.style.marginBottom = "16px";
    const percentValue = data.percent || 0;
    row.innerHTML = `
      <label style='display:block; font-weight:bold; margin-bottom:4px;'>
        <span id='label-${doc.id}' style='margin-right:8px;'>${percentValue}%</span>${data.name}
      </label>
      <input type='range' min='0' max='100' step='1' value='${percentValue}' id='range-${doc.id}' style='width:100%'>
    `;
    container.appendChild(row);
    ranges.push({ id: doc.id });
  });

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
      const val = parseFloat(document.getElementById(`range-${r.id}`).value);
      await db.collection("envelopes").doc(r.id).update({ percent: val });
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
