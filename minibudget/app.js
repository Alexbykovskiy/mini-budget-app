let db; // <--- вот это вставь первой строкой
const profileCode = "mini";

window.addEventListener("load", () => {
  db = firebase.firestore();
  loadExpenses();
  populateTagList();
  resetForm();
initFuelControls();
  initWheelPickerUI();
  // 📸 Выбор способа загрузки изображения — камера или галерея
  // 📸 Упрощённая загрузка фото: системное меню (камера, галерея, файлы)



  

  // Переключатель журнала
  const toggleJournal = document.getElementById("toggle-journal");
  const journalWrapper = document.getElementById("expense-list-wrapper");
  const journalBlock = journalWrapper?.closest('.block');
  if (toggleJournal && journalWrapper && journalBlock) {
    toggleJournal.addEventListener("change", () => {
      const isOn = toggleJournal.checked;
      journalWrapper.classList.remove("collapsed", "expanded");
      journalWrapper.classList.add(isOn ? "expanded" : "collapsed");
      journalBlock.classList.toggle("auto-height", isOn);
    });
  }

  // Переключатель фильтров
  const filterToggleBtn = document.getElementById("toggle-filters");
  const filtersWrapper = document.getElementById("filters-wrapper");
  const filtersBlock = filtersWrapper?.closest('.block');
  if (filterToggleBtn && filtersWrapper && filtersBlock) {
    filterToggleBtn.addEventListener("change", () => {
      const isOn = filterToggleBtn.checked;
      filtersWrapper.classList.remove("collapsed", "expanded");
      filtersWrapper.classList.add(isOn ? "expanded" : "collapsed");
      filtersBlock.classList.toggle("auto-height", isOn);
    });
  }

  // Переключатель "добавить напоминание"
  const toggleInfoAdd = document.getElementById("toggle-info-add");
  const infoAddWrapper = document.getElementById("info-add-wrapper");
  const infoAddBlock = infoAddWrapper?.closest('.block');
  if (toggleInfoAdd && infoAddWrapper && infoAddBlock) {
    toggleInfoAdd.addEventListener("change", () => {
      const isOn = toggleInfoAdd.checked;
      infoAddWrapper.classList.remove("collapsed", "expanded");
      infoAddWrapper.classList.add(isOn ? "expanded" : "collapsed");
      infoAddBlock.classList.toggle("auto-height", isOn);
loadReminders();
    });
  }
});


const form = document.getElementById('expense-form');
const list = document.getElementById('expense-list');
const summary = document.getElementById('summary');
let expenseChart;
let expenses = [];
let fuelChart; // график расхода по заправкам
let fuelMode =
  (typeof localStorage !== "undefined" && localStorage.getItem("fuelMode")) || "fills"; // fills | period

let fuelFillsCount = Number(
  (typeof localStorage !== "undefined" && localStorage.getItem("fuelFillsCount")) || 10
);

let fuelDateFrom =
  (typeof localStorage !== "undefined" && localStorage.getItem("fuelDateFrom")) || "";

let fuelDateTo =
  (typeof localStorage !== "undefined" && localStorage.getItem("fuelDateTo")) || "";
// ==============================
// ⛽ Fuel: anomaly + labels config
// ==============================
const FUEL_RULES = {
  // Минимальная дистанция между полными заправками, иначе это шум (прогревы/город/перенос топлива)
  MIN_DIST_KM: 180,            // можешь поставить 150..220 по ощущениям

  // Жёсткие физические границы (для дизеля твоего класса)
  HARD_MIN_L100: 2.0,
  HARD_MAX_L100: 15.0,

  // Относительные пороги от среднего (по валидным точкам)
  GOOD_BELOW_PCT: 0.05,        // ниже среднего на 5% = "молодец"
  NORMAL_ABOVE_PCT: 0.10,      // до +10% = "норма"
  ANOMALY_ABOVE_PCT: 0.40      // выше среднего на 40% = аномалия
};

// Тексты меток (пойдут в tooltip и при желании в UI)
const FUEL_LABELS = {
  good:    "ниже среднего (молодец)",
  normal:  "средний",
  high:    "выше среднего",
  anomaly: "аномалия"
};

let fullTotal = 0;
let editingReminderId = null;
let globalDistance = 0; // Пробег для расчёта среднего расхода

const WHEEL_ROW_HEIGHT = 44;
const WHEEL_VISIBLE_RADIUS = 2;
const WHEEL_SWIPE_SENSITIVITY = 1.5;

let wheelPickerState = null;


function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


function padNumber(value, size = 0) {
  return String(value).padStart(size, "0");
}


function getLatestMileage() {
  const mileages = expenses
    .map(e => Number(e.mileage))
    .filter(m => Number.isFinite(m) && m >= 0);

  return mileages.length ? Math.max(...mileages) : "";
}


/* =========================
   WHEEL CONFIG
   ========================= */

function getWheelConfigs() {
  return {

    /* ===== СУММА ===== */

    amount: {
      title: "Сумма",
      unit: "€",

      left: {
        min: 0,
        max: 9999,
        pad: 1
      },

      // 0..9 = 00..90 центов
      right: {
        min: 0,
        max: 9,

        format(value) {
          return padNumber(value * 10, 2);
        }
      },

      parse(raw) {
        let num = Number(
          String(raw || "0").replace(",", ".")
        );

        if (!Number.isFinite(num)) {
          num = 0;
        }

        num = clamp(num, 0, 9999.9);

        const euros = Math.floor(num);
        const cents = Math.round((num - euros) * 100);

        return {
          left: euros,
          right: clamp(
            Math.round(cents / 10),
            0,
            9
          )
        };
      },

      compose(left, right) {
        const cents = right * 10;

        return `${left}.${padNumber(cents, 2)}`;
      },

      preview(left, right) {
        return `${left} | ${padNumber(right * 10, 2)} €`;
      }
    },


    /* ===== ЛИТРЫ ===== */

    liters: {
      title: "Литры",
      unit: "л",

      left: {
        min: 0,
        max: 99,
        pad: 1
      },

      // 0..9 = десятые литра
      right: {
        min: 0,
        max: 9,
        pad: 1
      },

      parse(raw) {
        let num = Number(
          String(raw || "0").replace(",", ".")
        );

        if (!Number.isFinite(num)) {
          num = 0;
        }

        num = clamp(num, 0, 99.9);

        const liters = Math.floor(num);
        const decimal = Math.round(
          (num - liters) * 10
        );

        return {
          left: liters,
          right: clamp(decimal, 0, 9)
        };
      },

      compose(left, right) {
        return `${left}.${right}`;
      },

      preview(left, right) {
        return `${left} | ${right} л`;
      }
    },


    /* ===== ПРОБЕГ ===== */

    mileage: {
      title: "Пробег",
      unit: "км",

      left: {
        min: 0,
        max: 999,
        pad: 3
      },

      right: {
        min: 0,
        max: 999,
        pad: 3
      },

      parse(raw) {
        let value = parseInt(
          String(
            raw ||
            getLatestMileage() ||
            "0"
          ),
          10
        );

        if (!Number.isFinite(value)) {
          value = 0;
        }

        value = clamp(
          value,
          0,
          999999
        );

        return {
          left: Math.floor(value / 1000),
          right: value % 1000
        };
      },

      compose(left, right) {
        return String(
          left * 1000 + right
        );
      },

      preview(left, right) {
        return `${padNumber(left, 3)} | ${padNumber(right, 3)} км`;
      }
    },


    /* ===== КОЛИЧЕСТВО ЗАПРАВОК ===== */

    fuelFills: {
      title: "Количество заправок",
      unit: "заправок",
      singleWheel: true,

      left: {
        min: 3,
        max: 99,
        pad: 1
      },

      parse(raw) {
        let value = parseInt(
          String(raw || "10"),
          10
        );

        if (!Number.isFinite(value)) {
          value = 10;
        }

        return {
          left: clamp(value, 3, 99),
          right: 0
        };
      },

      compose(left) {
        return String(left);
      },

      preview(left) {
        return `${left} заправок`;
      }
    }
  };
}


/* =========================
   CREATE MODAL
   ========================= */

function createWheelPickerModal() {

  if (
    document.getElementById(
      "wheel-picker-modal"
    )
  ) {
    return;
  }

  const modal =
    document.createElement("div");

  modal.id =
    "wheel-picker-modal";

  modal.className =
    "wheel-picker-modal hidden";

  modal.innerHTML = `
    <div class="wheel-picker-sheet">

      <div class="wheel-picker-header">

        <button
          type="button"
          id="wheel-picker-cancel"
          class="wheel-picker-head-btn"
        >
          Отмена
        </button>

        <div
          id="wheel-picker-title"
          class="wheel-picker-title"
        >
          Выбор
        </div>

        <button
          type="button"
          id="wheel-picker-ok"
          class="wheel-picker-head-btn primary"
        >
          Готово
        </button>

      </div>


      <div
        id="wheel-picker-display"
        class="wheel-picker-display"
      ></div>


      <div
        id="wheel-picker-wheels"
        class="wheel-picker-wheels"
      >

        <div
          class="wheel-picker-selection-combined"
        ></div>


        <div class="wheel-picker-unit">

          <div
            class="wheel-picker-wheel"
            id="wheel-left-wheel"
          >

            <div
              class="wheel-picker-track"
              id="wheel-left-track"
            ></div>

          </div>

        </div>


        <div
          id="wheel-picker-divider"
          class="wheel-picker-divider"
        ></div>


        <div
          id="wheel-right-unit"
          class="wheel-picker-unit"
        >

          <div
            class="wheel-picker-wheel"
            id="wheel-right-wheel"
          >

            <div
              class="wheel-picker-track"
              id="wheel-right-track"
            ></div>

          </div>

        </div>


        <div
          id="wheel-picker-inline-unit"
          class="wheel-picker-inline-unit"
        ></div>

      </div>

    </div>
  `;

  document.body.appendChild(modal);


  wheelPickerState = {

    modal,

    input: null,

    type: null,

    config: null,

    configs: getWheelConfigs(),

    leftValue: 0,

    rightValue: 0,

    wheels: {

      left: {
        root:
          document.getElementById(
            "wheel-left-wheel"
          ),

        track:
          document.getElementById(
            "wheel-left-track"
          )
      },

      right: {
        root:
          document.getElementById(
            "wheel-right-wheel"
          ),

        track:
          document.getElementById(
            "wheel-right-track"
          )
      }
    }
  };


  document
    .getElementById(
      "wheel-picker-cancel"
    )
    .addEventListener(
      "click",
      closeWheelPicker
    );


  document
    .getElementById(
      "wheel-picker-ok"
    )
    .addEventListener(
      "click",
      applyWheelPickerValue
    );


  modal.addEventListener(
    "click",
    (e) => {

      if (e.target === modal) {
        closeWheelPicker();
      }
    }
  );


  attachWheelDrag("left");
  attachWheelDrag("right");
}


/* =========================
   RENDER WHEEL
   ========================= */

function renderWheel(
  side,
  centerValue,
  translateY = 0
) {

  if (
    !wheelPickerState ||
    !wheelPickerState.config
  ) {
    return;
  }


  const wheel =
    wheelPickerState.wheels[side];

  const cfg =
    wheelPickerState.config[side];


  if (!wheel || !cfg) {
    return;
  }


  wheel.track.innerHTML = "";


  for (
    let offset = -WHEEL_VISIBLE_RADIUS;
    offset <= WHEEL_VISIBLE_RADIUS;
    offset++
  ) {

    const value =
      clamp(
        centerValue + offset,
        cfg.min,
        cfg.max
      );


    const item =
      document.createElement("div");


    const distance =
      Math.abs(offset);


    item.className =
      "wheel-picker-item " +
      `wheel-distance-${distance}` +
      (offset === 0
        ? " active"
        : "");


    item.textContent =
      cfg.format
        ? cfg.format(value)
        : padNumber(
            value,
            cfg.pad || 0
          );


    wheel.track.appendChild(item);
  }


  wheel.track.style.transform =
    `translateY(${translateY}px)`;
}


/* =========================
   PREVIEW
   ========================= */

function updateWheelPickerPreview() {

  if (
    !wheelPickerState ||
    !wheelPickerState.config
  ) {
    return;
  }


  const display =
    document.getElementById(
      "wheel-picker-display"
    );


  if (!display) {
    return;
  }


  display.textContent =
    wheelPickerState.config.preview(
      wheelPickerState.leftValue,
      wheelPickerState.rightValue
    );
}


/* =========================
   OPEN
   ========================= */

function openWheelPicker(
  type,
  input
) {

  if (!wheelPickerState) {
    return;
  }


  const config =
    wheelPickerState.configs[type];


  if (!config) {
    return;
  }


  const initial =
    config.parse(input.value);


  wheelPickerState.type =
    type;

  wheelPickerState.input =
    input;

  wheelPickerState.config =
    config;

  wheelPickerState.leftValue =
    initial.left;

  wheelPickerState.rightValue =
    initial.right || 0;


  document
    .getElementById(
      "wheel-picker-title"
    )
    .textContent =
      config.title;


  const rightUnit =
    document.getElementById(
      "wheel-right-unit"
    );

  const divider =
    document.getElementById(
      "wheel-picker-divider"
    );

  const wheelsContainer =
    document.getElementById(
      "wheel-picker-wheels"
    );

  const inlineUnit =
    document.getElementById(
      "wheel-picker-inline-unit"
    );


  if (config.singleWheel) {

    rightUnit.style.display =
      "none";

    divider.style.display =
      "none";

    wheelsContainer.classList.add(
      "single-wheel"
    );

  } else {

    rightUnit.style.display =
      "flex";

    divider.style.display =
      "block";

    wheelsContainer.classList.remove(
      "single-wheel"
    );
  }


  inlineUnit.textContent =
    config.unit || "";


  renderWheel(
    "left",
    wheelPickerState.leftValue,
    0
  );


  if (!config.singleWheel) {

    renderWheel(
      "right",
      wheelPickerState.rightValue,
      0
    );
  }


  updateWheelPickerPreview();


  wheelPickerState.modal
    .classList.remove("hidden");


  requestAnimationFrame(() => {

    wheelPickerState.modal
      .classList.add("show");
  });
}


/* =========================
   CLOSE
   ========================= */

function closeWheelPicker() {

  if (!wheelPickerState?.modal) {
    return;
  }


  wheelPickerState.modal
    .classList.remove("show");


  setTimeout(() => {

    wheelPickerState.modal
      .classList.add("hidden");

  }, 180);
}


/* =========================
   APPLY
   ========================= */

function applyWheelPickerValue() {

  if (
    !wheelPickerState?.input ||
    !wheelPickerState?.config
  ) {
    return;
  }


  const {
    input,
    config,
    leftValue,
    rightValue
  } = wheelPickerState;


  input.value =
    config.compose(
      leftValue,
      rightValue
    );


  input.dispatchEvent(
    new Event(
      "input",
      {
        bubbles: true
      }
    )
  );


  input.dispatchEvent(
    new Event(
      "change",
      {
        bubbles: true
      }
    )
  );


  closeWheelPicker();
}


/* =========================
   HAPTIC
   ========================= */

function wheelHaptic() {

  if (
    typeof navigator !== "undefined" &&
    navigator.vibrate
  ) {

    navigator.vibrate(7);
  }
}


/* =========================
   INERTIA
   ========================= */

function runWheelInertia(
  side,
  velocity
) {

  const state =
    wheelPickerState;


  if (!state?.config) {
    return;
  }


  const cfg =
    state.config[side];


  if (!cfg) {
    return;
  }


  /*
   * velocity = pixels / ms
   *
   * Чем быстрее свайп,
   * тем больше дополнительный
   * "выбег".
   */

  const speed =
    Math.abs(velocity);


  if (speed < 0.10) {

    renderWheel(
      side,
      state[`${side}Value`],
      0
    );

    return;
  }


  /*
   * Ограничиваем, чтобы колесо
   * не улетало на сотни значений.
   */

  const direction =
    velocity < 0
      ? 1
      : -1;


  let extraSteps =
    Math.round(
      speed *
      7 *
      WHEEL_SWIPE_SENSITIVITY
    );


  extraSteps =
    clamp(
      extraSteps,
      1,
      18
    );


  const current =
    state[`${side}Value`];


  const target =
    clamp(
      current +
      direction * extraSteps,
      cfg.min,
      cfg.max
    );


  animateWheelTo(
    side,
    target
  );
}


/* =========================
   INERTIA ANIMATION
   ========================= */

function animateWheelTo(
  side,
  targetValue
) {

  if (
    !wheelPickerState ||
    !wheelPickerState.config
  ) {
    return;
  }


  const cfg =
    wheelPickerState.config[side];


  if (!cfg) {
    return;
  }


  let current =
    wheelPickerState[
      `${side}Value`
    ];


  targetValue =
    clamp(
      targetValue,
      cfg.min,
      cfg.max
    );


  if (
    current === targetValue
  ) {

    renderWheel(
      side,
      current,
      0
    );

    return;
  }


  const direction =
    targetValue > current
      ? 1
      : -1;


  const totalSteps =
    Math.abs(
      targetValue - current
    );


  let completed = 0;


  function nextStep() {

    if (
      completed >= totalSteps
    ) {

      renderWheel(
        side,
        wheelPickerState[
          `${side}Value`
        ],
        0
      );

      return;
    }


    current += direction;

    completed++;


    wheelPickerState[
      `${side}Value`
    ] = current;


    updateWheelPickerPreview();

    renderWheel(
      side,
      current,
      0
    );

    wheelHaptic();


    /*
     * Чем ближе к концу,
     * тем медленнее.
     */

    const progress =
      completed / totalSteps;


    const delay =
      18 +
      progress * progress * 70;


    setTimeout(
      nextStep,
      delay
    );
  }


  nextStep();
}


/* =========================
   DRAG
   ========================= */

function attachWheelDrag(side) {

  const wheel =
    wheelPickerState?.wheels?.[side];


  if (!wheel) {
    return;
  }


  let dragging = false;

  let startY = 0;

  let startValue = 0;

  let lastY = 0;

  let lastTime = 0;

  let velocity = 0;

  let lastTickValue = null;


  const onPointerMove = (e) => {

    if (
      !dragging ||
      !wheelPickerState?.config
    ) {
      return;
    }


    e.preventDefault();


    const cfg =
      wheelPickerState.config[side];


    if (!cfg) {
      return;
    }


    const now =
      performance.now();


    const dy =
      e.clientY - lastY;


    const dt =
      Math.max(
        now - lastTime,
        1
      );


    /*
     * Скорость текущего движения.
     */

    const instantVelocity =
      dy / dt;


    /*
     * Сглаживаем скорость.
     */

    velocity =
      velocity * 0.65 +
      instantVelocity * 0.35;


    lastY =
      e.clientY;

    lastTime =
      now;


    const deltaY =
      e.clientY - startY;


    const floatValue =
      clamp(

        startValue -

        (
          deltaY /
          WHEEL_ROW_HEIGHT
        ) *

        WHEEL_SWIPE_SENSITIVITY,

        cfg.min,
        cfg.max
      );


    const roundedValue =
      clamp(
        Math.round(floatValue),
        cfg.min,
        cfg.max
      );


    const translateY =
      (
        roundedValue -
        floatValue
      ) *
      WHEEL_ROW_HEIGHT;


    if (
      wheelPickerState[
        `${side}Value`
      ] !== roundedValue
    ) {

      wheelPickerState[
        `${side}Value`
      ] = roundedValue;


      updateWheelPickerPreview();


      if (
        lastTickValue !==
        roundedValue
      ) {

        wheelHaptic();
      }


      lastTickValue =
        roundedValue;
    }


    renderWheel(
      side,
      roundedValue,
      translateY
    );
  };


  const onPointerUp = () => {

    if (!dragging) {
      return;
    }


    dragging = false;


    wheel.root
      .classList.remove(
        "dragging"
      );


    runWheelInertia(
      side,
      velocity
    );
  };


  wheel.root.addEventListener(
    "pointerdown",
    (e) => {

      if (
        !wheelPickerState?.config
      ) {
        return;
      }


      const cfg =
        wheelPickerState.config[side];


      if (!cfg) {
        return;
      }


      dragging = true;


      startY =
        e.clientY;


      startValue =
        wheelPickerState[
          `${side}Value`
        ];


      lastTickValue =
        startValue;


      lastY =
        e.clientY;


      lastTime =
        performance.now();


      velocity = 0;


      wheel.root
        .classList.add(
          "dragging"
        );


      if (
        wheel.root.setPointerCapture
      ) {

        wheel.root.setPointerCapture(
          e.pointerId
        );
      }
    }
  );


  wheel.root.addEventListener(
    "pointermove",
    onPointerMove
  );


  wheel.root.addEventListener(
    "pointerup",
    onPointerUp
  );


  wheel.root.addEventListener(
    "pointercancel",
    onPointerUp
  );


  wheel.root.addEventListener(
    "lostpointercapture",
    onPointerUp
  );
}


/* =========================
   INIT
   ========================= */

function initWheelPickerUI() {

  createWheelPickerModal();


  const bindings = [

    {
      id: "amount",
      type: "amount"
    },

    {
      id: "liters",
      type: "liters"
    },

    {
      id: "mileage",
      type: "mileage"
    },

    {
      id: "fuel-fills-count",
      type: "fuelFills"
    }
  ];


  bindings.forEach(
    ({
      id,
      type
    }) => {

      const input =
        document.getElementById(id);


      if (!input) {
        return;
      }


      input.readOnly = true;

      input.setAttribute(
        "inputmode",
        "none"
      );

      input.classList.add(
        "wheel-input"
      );


      input.addEventListener(
        "click",
        () => {

          openWheelPicker(
            type,
            input
          );
        }
      );
    }
  );
}

// ========== ДОБАВИТЬ НАПОМИНАНИЕ ==========
const infoAddForm = document.getElementById('info-add-form');
if (infoAddForm) {
infoAddForm.onsubmit = async (e) => {
  e.preventDefault();
  const tag = document.getElementById('info-tag').value.trim().toLowerCase();
  const mileage = document.getElementById('info-mileage').value ? Number(document.getElementById('info-mileage').value) : null;
  const interval = document.getElementById('info-interval').value ? Number(document.getElementById('info-interval').value) : null;
  const dateStart = document.getElementById('info-date-start').value;
  const dateEnd = document.getElementById('info-date-end').value;
  let imageUrl = "";
  const photoInput = document.getElementById('info-add-photo');
  if (photoInput && photoInput.files[0]) {
    const file = photoInput.files[0];
    const storageRef = firebase.storage().ref();
    const snapshot = await storageRef.child(`reminders/${Date.now()}_${file.name}`).put(file);
    imageUrl = await snapshot.ref.getDownloadURL();
  }
  const data = { tag, mileage, interval, dateStart, dateEnd };
  if (imageUrl) data.imageUrl = imageUrl;

  if (editingReminderId) {
    await db.collection("users").doc(profileCode).collection("reminders").doc(editingReminderId).update(data);
    editingReminderId = null;
  } else {
    if (!imageUrl) data.imageUrl = "";
    data.created = Date.now();
    await db.collection("users").doc(profileCode).collection("reminders").add(data);
  }
showToast("Напоминание добавлено!");
  infoAddForm.reset();
  const dateStartInput = document.getElementById('info-date-start');
  if (dateStartInput) {
    dateStartInput.value = new Date().toISOString().split('T')[0];
  }
};

}

function resetInfoAddForm() {
  document.getElementById("info-add-form").reset();
    editingReminderId = null;
  // Автозаполнение сегодняшней даты после сброса
  const dateStartInput = document.getElementById('info-date-start');
  if (dateStartInput) {
    dateStartInput.value = new Date().toISOString().split('T')[0];
  }
} 

// ← ВОТ ЭТА СКОБКА!
function loadExpenses() {
  if (!db) {
    console.error("Firestore не инициализирован (loadExpenses)");
    return;
  }

  db.collection("users").doc(profileCode).collection("expenses")
    .orderBy("date", "desc")
.onSnapshot(snapshot => {
  expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  fullTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  renderExpenses(expenses);
  updateStats(expenses);
  loadReminders();

  // Автоподстановка последнего известного пробега,
  // если сейчас не редактируем существующую запись
  const editId = document.getElementById("edit-id")?.value;
  const mileageInput = document.getElementById("mileage");

  if (!editId && mileageInput) {
    mileageInput.value = getLatestMileage();
  }
});
}



function renderExpenses(data) {
  list.innerHTML = "";
  let total = 0;

    data.forEach((exp, index) => {
    total += Number(exp.amount);
    const li = document.createElement('li');

    li.innerHTML = `
      <div class="expense-entry">
        <div class="expense-left">
          <div class="top-line">
            <span>#${index + 1}</span>
            <span>${exp.category}</span>
          </div>
          <div class="expense-line">
            ${exp.date ? `<div class="info-line"><span class="date-line">${formatDate(exp.date)}</span></div>` : ""}
            ${exp.liters ? `<div class="info-line"><svg width="24" height="24"><path d="M12 2C12 2 6 7 6 12a6 6 0 0 0 12 0c0-5-6-10-6-10z"/></svg><span>${Number(exp.liters).toFixed(1)} л</span></div>` : ""}
            ${exp.mileage ? `<div class="info-line"><svg width="24" height="24"><path d="M3 12h18"/><path d="m15 18 6-6-6-6"/></svg><span>${exp.mileage} км</span></div>` : ""}
            ${exp.note ? `<div class="info-line"><svg width="24" height="24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${exp.note}</span></div>` : ""}
            ${exp.tag ? `<div class="info-line"><svg width="24" height="24"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg><span>#${exp.tag}</span></div>` : ""}
          </div>
        </div>
        <div class="expense-right">
          <div class="expense-amount">€${Number(exp.amount).toFixed(2)}</div>
          <div class="action-icons">
            <button onclick='fillFormForEdit(${JSON.stringify(exp)})'>
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75l11-11.03-3.75-3.75L3 17.25zM21.41 6.34c.38-.38.38-1.02 0-1.41l-2.34-2.34a1.003 1.003 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button onclick='deleteExpense("${exp.id}")'>
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    list.appendChild(li);
  });

  updateChart(data, total);
 }

// Обновляет карточки статистики по всему массиву расходов
function updateStats(fullData) {
  // Берём только записи с пробегом
  const entriesWithMileage = fullData.filter(e => e.mileage && !isNaN(Number(e.mileage)));
  // 1) Сортируем по дате для расчёта дней
  const sorted   = [...entriesWithMileage].sort((a,b)=>a.date.localeCompare(b.date));
  // 2) Берём все пробеги и считаем дистанцию
  const ms       = entriesWithMileage.map(e=>Number(e.mileage));
  const distance = ms.length ? Math.max(...ms) - Math.min(...ms) : 0;
globalDistance = distance; // Всегда держим актуальный пробег для расхода
  // 3) Считаем дни между первой и последней датой
  const daysDiff = sorted.length>1
    ? Math.ceil((new Date(sorted.at(-1).date) - new Date(sorted[0].date)) / (1000*60*60*24))
    : 0;
  // 4) Записываем в карточки
  document.getElementById('stat-distance').textContent  = distance;
  document.getElementById('stat-total-km').textContent = ms.length ? Math.max(...ms) : 0;
  document.getElementById('stat-days').textContent     = daysDiff + ' дней';
  // 5) Пробег двигателя
  const mileageBeforeSwap = 190000;
  const engineOffsetKm    = 64374;
  const engineKm = ms.length ? Math.max(...ms) - mileageBeforeSwap + engineOffsetKm : 0;
  document.getElementById('stat-engine-km').textContent =
    engineKm > 0 ? engineKm.toLocaleString("ru-RU") : "—";

  // Всё, что касается сумм
  document.getElementById('stat-total-amount').textContent = fullData.reduce((sum, e) => sum + Number(e.amount), 0).toFixed(2);

  // Подсчёт стоимости на км, чистых затрат, расхода и средней цены литра
  calculateCostPerKm(fullData);
  calculatePureRunningCost(fullData);
  calculateFuelStats(fullData);
 updateFuelConsumptionUI(fullData);
}

function initFuelControls() {
  const fillsControl = document.getElementById("fuel-fills-control");
  const periodControl = document.getElementById("fuel-period-control");

  const fillsCountInput = document.getElementById("fuel-fills-count");
  const dateFromInput = document.getElementById("fuel-date-from");
  const dateToInput = document.getElementById("fuel-date-to");

  const modeRadios = document.querySelectorAll('input[name="fuelMode"]');

  // Если HTML ещё не обновлён или элементы не найдены — просто выходим
  if (!fillsControl || !periodControl || !fillsCountInput || !dateFromInput || !dateToInput || !modeRadios.length) {
    return;
  }

  // 1) Проставляем сохранённые значения в инпуты
  fillsCountInput.value = String(isFinite(fuelFillsCount) && fuelFillsCount > 0 ? fuelFillsCount : 10);
  dateFromInput.value = fuelDateFrom || "";
  dateToInput.value = fuelDateTo || "";

  // 2) Проставляем выбранный режим
  modeRadios.forEach(r => {
    r.checked = r.value === fuelMode;
  });

  // 3) Показать/скрыть нужный блок
  const applyVisibility = () => {
  fillsControl.style.display = fuelMode === "fills" ? "block" : "none";
  periodControl.style.display = fuelMode === "period" ? "flex" : "none";
};
 
  applyVisibility();

  // 4) Лисенеры
  modeRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      fuelMode = e.target.value || "fills";
      try { localStorage.setItem("fuelMode", fuelMode); } catch (e) {}
      applyVisibility();
      updateFuelConsumptionUI(expenses);
    });
  });

  fillsCountInput.addEventListener("input", () => {
    const v = Number(fillsCountInput.value);
    fuelFillsCount = isFinite(v) ? Math.max(3, Math.floor(v)) : 10;
    try { localStorage.setItem("fuelFillsCount", String(fuelFillsCount)); } catch (e) {}
    updateFuelConsumptionUI(expenses);
  });

  dateFromInput.addEventListener("change", () => {
    fuelDateFrom = dateFromInput.value || "";
    try { localStorage.setItem("fuelDateFrom", fuelDateFrom); } catch (e) {}
    updateFuelConsumptionUI(expenses);
  });

  dateToInput.addEventListener("change", () => {
    fuelDateTo = dateToInput.value || "";
    try { localStorage.setItem("fuelDateTo", fuelDateTo); } catch (e) {}
    updateFuelConsumptionUI(expenses);
  });
}

// ==============================
// ⛽ Расход по каждому "баку" (между полными заправками)
// ==============================


function computeFuelTankPoints(fullData) {
  const fuel = fullData
    .filter(e =>
      e.category === 'Топливо' &&
      e.liters && !isNaN(Number(e.liters)) &&
      e.mileage && !isNaN(Number(e.mileage)) &&
      e.date
    )
    .map(e => ({
      date: e.date,
      mileage: Number(e.mileage),
      liters: Number(e.liters)
    }))
    .sort((a, b) => a.mileage - b.mileage);

  const points = [];
  for (let i = 1; i < fuel.length; i++) {
    const prev = fuel[i - 1];
    const cur = fuel[i];
    const dist = cur.mileage - prev.mileage;
    if (!dist || dist <= 0) continue;
    const l100 = (cur.liters / dist) * 100;

   // первичные причины аномалии (до сравнения со средним)
let anomalyReason = "";

if (dist < FUEL_RULES.MIN_DIST_KM) anomalyReason = `дистанция < ${FUEL_RULES.MIN_DIST_KM} км`;
if (l100 < FUEL_RULES.HARD_MIN_L100) anomalyReason = `расход < ${FUEL_RULES.HARD_MIN_L100}`;
if (l100 > FUEL_RULES.HARD_MAX_L100) anomalyReason = `расход > ${FUEL_RULES.HARD_MAX_L100}`;

points.push({
  date: cur.date,
  mileage: cur.mileage,
  distance: dist,
  liters: cur.liters,
  l100,
  // заполним статус позже, когда узнаем среднее
  status: anomalyReason ? "anomaly" : "normal",
  reason: anomalyReason
});
  }
  return points;
}

function computeAvgFromValidPoints(points) {
  const valid = (points || []).filter(p => p.status !== "anomaly" && isFinite(p.l100));
  if (valid.length === 0) return null;
  return valid.reduce((s, p) => s + p.l100, 0) / valid.length;
}

function classifyFuelPoint(p, avg) {
  // если уже жёстко аномалия — оставляем
  if (p.status === "anomaly") return p;

  if (!avg || !isFinite(avg)) {
    // если среднего ещё нет (например всего 1 валидная точка)
    p.status = "normal";
    p.reason = "";
    return p;
  }

  const goodEdge   = avg * (1 - FUEL_RULES.GOOD_BELOW_PCT);
  const normalEdge = avg * (1 + FUEL_RULES.NORMAL_ABOVE_PCT);
  const anomEdge   = avg * (1 + FUEL_RULES.ANOMALY_ABOVE_PCT);

  if (p.l100 > anomEdge) {
    p.status = "anomaly";
    p.reason = `>${Math.round(FUEL_RULES.ANOMALY_ABOVE_PCT * 100)}% от среднего`;
    return p;
  }

  if (p.l100 <= goodEdge) {
    p.status = "good";
    p.reason = "";
    return p;
  }

  if (p.l100 <= normalEdge) {
    p.status = "normal";
    p.reason = "";
    return p;
  }

  p.status = "high";
  p.reason = "";
  return p;
}


function renderFuelLineChart(points, avgLine) {
  const el = document.querySelector('#fuel-line-chart');
  if (!el) return;

  const categories = points.map(p => {
    const d = formatDate(p.date);
    const km = Math.round(p.mileage).toLocaleString('ru-RU');
    return `${d}\n${km}км`;
  });

  const series = [{
    name: 'л/100',
    data: points.map(p => Number(p.l100.toFixed(2)))
  }];

const statusColor = (status) => {
  if (status === "good") return "#4CAF50";     // зелёный
  if (status === "normal") return "#186663";   // твой фирменный
  if (status === "high") return "#FFA35C";     // оранжевый
  return "#888888";                            // anomaly = серый
};

const discreteMarkers = points.map((p, i) => ({
  seriesIndex: 0,
  dataPointIndex: i,
  fillColor: statusColor(p.status),
  strokeColor: statusColor(p.status),
  size: p.status === "anomaly" ? 6 : 4
}));

  const options = {
    chart: {
      type: 'line',
      height: 190,
      toolbar: { show: false },
      zoom: { enabled: false }
    },
    series,
    stroke: { width: 3, curve: 'smooth' },
    markers: {
  size: 4,
  discrete: discreteMarkers
},
   xaxis: {
  categories,
  labels: {
    show: true,
    style: { fontSize: "10px" },
    rotate: 0,
    trim: true
  }
},
yaxis: {
  labels: {
    show: true,
    style: { fontSize: "10px" }
  },
  decimalsInFloat: 2
},
annotations: avgLine ? {
  yaxis: [{
    y: Number(avgLine.toFixed(2)),
    borderColor: "#999",
    strokeDashArray: 4,
    label: {
      text: `AVG ${avgLine.toFixed(2)}`,
      style: {
        fontSize: "10px"
      }
    }
  }]
} : undefined,
    grid: { padding: { left: 8, right: 8, top: 8, bottom: 0 } },
    tooltip: {
      y: {
        formatter: (v, opts) => {
          const idx = opts.dataPointIndex;
          const p = points[idx];
          if (!p) return `${v} л/100`;
          const dist = Math.round(p.distance);
          const lit = Number(p.liters).toFixed(1);
          const label = FUEL_LABELS[p.status] || "";
const reason = p.reason ? ` · ${p.reason}` : "";
return `${v.toFixed(2)} л/100 ( ${dist} км / ${lit} л ) · ${label}${reason}`;
        }
      }
    }
  };

  if (fuelChart) {
  // ВАЖНО: series обновляем только через updateSeries,
  // а в updateOptions НЕ передаем series (иначе иногда слетают оси/лейблы)
  const { series: _ignoreSeries, ...optionsNoSeries } = options;

  fuelChart.updateOptions(optionsNoSeries, false, true);
  fuelChart.updateSeries(series, true);
} else {
  fuelChart = new ApexCharts(el, options);
  fuelChart.render();
}
}

function updateFuelConsumptionUI(fullData) {
  const avgEl = document.getElementById('fuel-consumption-avg');
  const subEl = document.getElementById('fuel-consumption-sub');
  if (!avgEl || !subEl) return;

 
  const allPoints = computeFuelTankPoints(fullData);

let pointsRaw = [];
if (fuelMode === "fills") {
  const n = isFinite(fuelFillsCount) ? Math.max(3, Math.floor(fuelFillsCount)) : 10;
  pointsRaw = allPoints.slice(-n);
} else {
  const from = fuelDateFrom || "";
  const to = fuelDateTo || "";
  pointsRaw = allPoints.filter(p => {
    if (from && p.date < from) return false;
    if (to && p.date > to) return false;
    return true;
  });
}
if (!pointsRaw || pointsRaw.length === 0) {
  avgEl.textContent = "—";

  if (fuelMode === "fills") {
    subEl.textContent = `последние ${Math.max(3, Math.floor(fuelFillsCount || 10))} заправок · точек: 0`;
  } else {
    const fromTxt = fuelDateFrom ? formatDate(fuelDateFrom) : "…";
    const toTxt = fuelDateTo ? formatDate(fuelDateTo) : "…";
    subEl.textContent = `период: ${fromTxt}–${toTxt} · точек: 0`;
  }

  renderFuelLineChart([], null);
  return;
}
// 1) считаем среднее только по валидным (без аномалий)
const avgValid = computeAvgFromValidPoints(pointsRaw);

// 2) размечаем ВСЕ точки (включая аномалии) относительно avgValid
const points = pointsRaw.map(p => classifyFuelPoint({ ...p }, avgValid));

// 3) среднее для UI показываем только по валидным
if (!avgValid) {
  avgEl.textContent = '—';
} else {
  avgEl.textContent = avgValid.toFixed(2);
}

// 4) доп. инфа: сколько валидных и сколько аномалий
const validCount = points.filter(p => p.status !== "anomaly").length;
const anomalyCount = points.length - validCount;

if (fuelMode === "fills") {
  const n = Math.max(3, Math.floor(fuelFillsCount || 10));
  subEl.textContent = `последние ${n} заправок · точек: ${points.length} · валидных: ${validCount} · аномалий: ${anomalyCount}`;
} else {
  const fromTxt = fuelDateFrom ? formatDate(fuelDateFrom) : "…";
  const toTxt = fuelDateTo ? formatDate(fuelDateTo) : "…";
  subEl.textContent = `период: ${fromTxt}–${toTxt} · точек: ${points.length} · валидных: ${validCount} · аномалий: ${anomalyCount}`;
}
// 5) рендерим график уже с метками + линией среднего
renderFuelLineChart(points, avgValid);
}

function calculateCostPerKm(data) {
  const mileageEntries = data.filter(e => e.mileage && !isNaN(Number(e.mileage)));
  if (mileageEntries.length < 2) {
    document.getElementById('stat-cost-total').textContent = '—';
    return;
  }
  const sorted = [...mileageEntries].sort((a, b) => a.date.localeCompare(b.date));
  const startMileage = Number(sorted[0].mileage);
  const endMileage = Number(sorted[sorted.length - 1].mileage);
  const distance = endMileage - startMileage;
  const totalAmount = data.reduce((sum, e) => sum + Number(e.amount), 0);
  const costPerKm = distance > 0 ? (totalAmount / distance) : 0;

  document.getElementById('stat-cost-total').textContent = costPerKm.toFixed(2);
}

function calculatePureRunningCost(data) {
  const relevantCosts = data.filter(e =>
    e.category === 'Топливо' || (e.tag && e.tag.toLowerCase() === 'масло')
  );
  const mileageEntries = data.filter(e => e.mileage && !isNaN(Number(e.mileage)));
  if (mileageEntries.length < 2) {
    document.getElementById('stat-cost-pure').textContent = '—';
    return;
  }
  const sorted = [...mileageEntries].sort((a, b) => a.date.localeCompare(b.date));
  const distance = Number(sorted[sorted.length - 1].mileage) - Number(sorted[0].mileage);
  const totalAmount = relevantCosts.reduce((sum, e) => sum + Number(e.amount), 0);
  const cost = distance > 0 ? (totalAmount / distance) : 0;

  document.getElementById('stat-cost-pure').textContent = cost.toFixed(2);
}
 function calculateFuelStats(data) {
  const fuelEntries = data.filter(e =>
    e.category === 'Топливо' &&
    e.liters && !isNaN(Number(e.liters)) &&
    e.amount && !isNaN(Number(e.amount))
  );
  const distance = globalDistance; // ← Берём расчетный пробег из карточки!
const totalLiters = fuelEntries.reduce((sum, e) => sum + Number(e.liters), 0);
const totalAmount = fuelEntries.reduce((sum, e) => sum + Number(e.amount), 0);
const consumption = distance > 0 ? (totalLiters / distance * 100) : null;
const pricePerLiter = totalLiters > 0 ? (totalAmount / totalLiters) : null;


  document.getElementById('stat-consumption').textContent =
  consumption !== null ? consumption.toFixed(2) : '—';


document.getElementById('stat-price-fuel').textContent =
  pricePerLiter !== null ? pricePerLiter.toFixed(2) : '—';
   }
 


function deleteExpense(id) {
  if (!db) {
    console.error("Firestore не инициализирован (deleteExpense)");
    return;
  }

  if (confirm("Удалить запись?")) {
    // 1. Сначала получаем сумму расхода
    db.collection("users").doc(profileCode).collection("expenses").doc(id).get().then(doc => {
      if (!doc.exists) return;
      const amount = Number(doc.data().amount) || 0;
      // 2. Удаляем запись
      db.collection("users").doc(profileCode).collection("expenses").doc(id).delete().then(async () => {
        // 3. Возвращаем сумму в MiniBudget
        await subtractFromMiniBudget(-amount); // минус на минус = вернуть обратно
        showToast("Запись удалена");
      });
    });
  }
}

function fillFormForEdit(exp) {
  document.getElementById('edit-id').value = exp.id;
  document.getElementById('category').value = exp.category;
  document.getElementById('amount').value = exp.amount;
  document.getElementById('liters').value = exp.liters || '';
  document.getElementById('mileage').value = exp.mileage || '';
  document.getElementById('date').value = exp.date;
  document.getElementById('note').value = exp.note || '';
  document.getElementById('tag').value = exp.tag || '';
}

// --- Функция для списания суммы из конверта MiniBudget ---
async function subtractFromMiniBudget(amount) {
  // Получаем ссылку на Firestore (db уже определён выше)
  // envelopes коллекция находится в общем пространстве, без users/mini
  const snapshot = await firebase.firestore().collection("envelopes").where("isMiniBudget", "==", true).limit(1).get();
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const ref = firebase.firestore().collection("envelopes").doc(doc.id);
    await firebase.firestore().runTransaction(async (t) => {
      const d = await t.get(ref);
      t.update(ref, { current: (d.data().current || 0) - amount });
    });
  }
}


form.onsubmit = async (e) => {
  e.preventDefault();
  if (!db) {
    console.error("Firestore не инициализирован (form submit)");
    return;
  }
  const id = document.getElementById('edit-id').value;
  const category = document.getElementById('category').value;
  const amount = parseFloat(document.getElementById('amount').value.replace(',', '.'));
  const mileage = document.getElementById('mileage').value;
  const liters = document.getElementById('liters').value;
  const date = document.getElementById('date').value;
  const note = document.getElementById('note').value;
  const tag = document.getElementById('tag').value.trim();
  const data = { category, amount, mileage, liters, date, note, tag };
  const ref = db.collection("users").doc(profileCode).collection("expenses");

if (id) {
  // Получаем старое значение расхода
  const oldDoc = await ref.doc(id).get();
  const oldAmount = Number(oldDoc.data()?.amount) || 0;
  await ref.doc(id).update(data);
  // Корректируем MiniBudget на разницу
  const diff = amount - oldAmount;
  if (diff !== 0) {
    await subtractFromMiniBudget(diff);
  }
} else {
  await ref.add(data);
  if (tag) {
    await db.collection("users").doc(profileCode).collection("tags").doc(tag).set({ used: true });
  }
  await subtractFromMiniBudget(amount);
}


  // --- Всё остальное после логики добавления ---
  const dateInput = document.getElementById('date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  showToast("Расход добавлен!");
resetForm();
};
function fetchTags() {
  return db.collection("users").doc(profileCode).collection("tags").get()
    .then(snapshot => snapshot.docs.map(doc => doc.id));
}

function populateTagList() {
  fetchTags().then(tags => {
    const datalist = document.getElementById('tag-list');
    if (!datalist) return;
    datalist.innerHTML = tags.map(tag => `<option value="${tag}">`).join('');
  });
}


function applyFilters() {
  const from = document.getElementById("filter-from").value;
  const to = document.getElementById("filter-to").value;
  const tag = document.getElementById("filter-tag").value.replace('#', '');
  const categoryFilter = document.getElementById("filter-category")?.value;
  const rowStart = parseInt(document.getElementById("filter-row-start")?.value);
  const rowEnd = parseInt(document.getElementById("filter-row-end")?.value);

  let filtered = expenses;
  if (from) filtered = filtered.filter(e => e.date >= from);
  if (to) filtered = filtered.filter(e => e.date <= to);
  if (tag) filtered = filtered.filter(e => e.tag === tag);
  if (categoryFilter && categoryFilter !== "Все") filtered = filtered.filter(e => e.category === categoryFilter);
  if (!isNaN(rowStart) && !isNaN(rowEnd)) filtered = filtered.slice(rowStart - 1, rowEnd);

  renderExpenses(filtered, true);
loadReminders(); // добавь эту строку
}

function updateChart(data, total) {
  const categoriesMap = {};

  data.forEach(entry => {
    const cat = entry.category;
    const value = Number(entry.amount);
    if (!categoriesMap[cat]) categoriesMap[cat] = 0;
    categoriesMap[cat] += value;
  });

 const colors = ['#D2AF94', '#186663', '#A6B5B4', '#8C7361', '#002D37',
                  '#5E8C8A', '#C4B59F', '#7F6A93', '#71A1A5', '#A58C7D', '#BFB4A3'];

  const sortedEntries = Object.entries(categoriesMap)
  .map(([label, value]) => ({ label, value }))
  .sort((a, b) => b.value - a.value);

const labels = sortedEntries.map(entry => entry.label);
const values = sortedEntries.map(entry => entry.value);
const legendColors = sortedEntries.map((_, i) => colors[i % colors.length]);

 
if (expenseChart) expenseChart.destroy();

  expenseChart = new ApexCharts(document.querySelector("#mini-donut-chart"), {
    chart: {
      type: 'donut',
      width: 200,
    },
    series: values,
    labels: labels,
    colors: legendColors,
    dataLabels: {
      enabled: false
    },
    legend: {
      show: false
    },
    tooltip: {
      y: {
        formatter: val => `€${val.toFixed(2)}`
      }
    },

plotOptions: {
  pie: {
    donut: {
      size: '55%',
      labels: {
        show: true,
        name: {
          show: false
        },
        value: {
          show: false // отключаем всплывающее значение при наведении
        },
        total: {
          show: true,
          showAlways: true, // 👈 обязательно!
          fontSize: '14px',
          fontWeight: 600,
          color: '#222',
          formatter: () => `€${total.toFixed(2)}`
        }
      }
    }
  }
} // ← это закрывает plotOptions целиком

}); // ← это закрывает new ApexCharts(...)

expenseChart.render();
  // кастомная легенда
  const legendContainer = document.getElementById("custom-legend");
  if (!legendContainer) return;
  legendContainer.innerHTML = "";

  const totalSum = values.reduce((a, b) => a + b, 0);
  const legendItems = sortedEntries.map((entry, i) => ({
  label: entry.label,
  value: entry.value,
  color: legendColors[i],
  percent: ((entry.value / totalSum) * 100).toFixed(1)
})).sort((a, b) => b.value - a.value);

  legendItems.forEach(entry => {
    const row = document.createElement("div");
    row.className = "legend-row";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.fontSize = "11px";
    row.style.lineHeight = "1.4";

    row.innerHTML = `
      <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${entry.color}"></span>
      <span style="flex:1;">${entry.label}</span>
      <span style="min-width: 60px; text-align:right;">€${entry.value.toFixed(2)}</span>
      <span style="min-width: 40px; text-align:right;">${entry.percent}%</span>
    `;
    legendContainer.appendChild(row);
  });
}


function resetForm() {
  if (!form) return;

  form.reset();
  document.getElementById("edit-id").value = "";

  const today = new Date().toISOString().split("T")[0];
  const dateInput = document.getElementById("date");

  if (dateInput) {
    dateInput.value = today;
  }

  const mileageInput = document.getElementById("mileage");

  if (mileageInput) {
    mileageInput.value = getLatestMileage();
  }
}

function formatDate(isoString) {
  const [year, month, day] = isoString.split("-");
  return `${day}.${month}.${year}`;
}





 
   // Автоустановка сегодняшней даты
  const dateInput = document.getElementById('date');
const editIdInput = document.getElementById('edit-id');
if (dateInput && editIdInput && !editIdInput.value.trim()) {
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;
}

// ========== Инфотабло (уведомления сервис/документы) ==========



function renderInlineInfoBoard(notifications) {
  const board = document.getElementById('inline-info-board');
  if (!board) return;
  board.innerHTML = '';
  notifications.forEach(n => {
    board.innerHTML += `
      <div class="info-row ${n.status}" style="padding: 2px 6px;">
        <div class="info-menu">
          <button class="alert-button ${n.status}" onclick="toggleMenu(this)">
  <span data-lucide="${n.icon}"></span>
</button>

          <div class="menu-actions hidden">
            <button onclick="editInfoEntry('${n.id}')"><span data-lucide="pencil"></span></button>
            <button onclick="showInfoImage('${n.imageUrl || ''}')"><span data-lucide="image"></span></button>
            <button onclick="deleteInfoEntry('${n.id}')"><span data-lucide="trash-2"></span></button>
          </div>
        </div>
        <span>${n.text}</span>
      </div>
    `;
  });
  lucide.createIcons();
}

function renderInlineInfoBoardHeader(notifications) {
  const board = document.getElementById('inline-info-board');
  if (!board) return;

  const infoAddWrapper = document.getElementById('info-add-wrapper');
  const isCollapsed = infoAddWrapper?.classList.contains('collapsed');

  if (isCollapsed && notifications.length > 0) {
    const n = notifications[0];
    board.innerHTML = `
      <div class="info-row ${n.status}" style="padding: 2px 6px;">
        <div class="info-menu">
          <button class="alert-button ${n.status}" onclick="toggleMenu(this)">
            <span data-lucide="${n.icon}"></span>
          </button>
          <div class="menu-actions hidden">
            <button onclick="editInfoEntry('${n.id}')"><span data-lucide="pencil"></span></button>
            <button onclick="showInfoImage('${n.imageUrl || ''}')"><span data-lucide="image"></span></button>
            <button onclick="deleteInfoEntry('${n.id}')"><span data-lucide="trash-2"></span></button>
          </div>
        </div>
        <span>${n.text}</span>
      </div>
    `;
  } else {
    renderInlineInfoBoard(notifications);
  }

  lucide.createIcons();
}

function toggleMenu(button) {
  const menu = button.nextElementSibling;
  if (!menu) return;
  document.querySelectorAll(".menu-actions").forEach(el => {
    if (el !== menu) el.classList.add("hidden");
  });
  menu.classList.toggle("hidden");
}


function loadReminders() {
  if (!db) {
    console.error("Firestore не инициализирован (loadReminders)");
    return;
  }

  db.collection("users").doc(profileCode).collection("reminders")
    .onSnapshot(snapshot => {
      const reminders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const processed = processReminders(reminders);
renderInlineInfoBoardHeader(processed);


    });
}

function processReminders(reminders) {
  const lastMileage = expenses.reduce((max, e) => e.mileage && Number(e.mileage) > max ? Number(e.mileage) : max, 0);
  const today = new Date();
  return reminders.map(r => {
    let kmLeft = null, daysLeft = null, text = "", icon = "circle", status = "gray";
    if (r.mileage && r.interval) {
      kmLeft = (Number(r.mileage) + Number(r.interval)) - lastMileage;
    }
    if (r.dateEnd) {
      const d1 = new Date(r.dateEnd);
      daysLeft = Math.ceil((d1 - today) / (1000*60*60*24));
    }
    let details = [];
    if (kmLeft !== null) details.push(`${kmLeft >= 0 ? "" : "-"}${kmLeft} км`);
    if (daysLeft !== null) details.push(`${daysLeft >= 0 ? "" : "-"}${daysLeft} дней`);
    text = `${r.tag} — ${details.join(" / ")}`;

    if ((kmLeft !== null && kmLeft < 0) || (daysLeft !== null && daysLeft < 0)) {
      status = "expired";
      icon = "alert-triangle";
    } else if ((kmLeft !== null && kmLeft <= 500) || (daysLeft !== null && daysLeft <= 7)) {
      status = "red";
      icon = "alert-triangle";
    } else if ((kmLeft !== null && kmLeft <= 1000) || (daysLeft !== null && daysLeft <= 21)) {
      status = "orange";
      icon = "alert-triangle";
    } else if ((kmLeft !== null && kmLeft <= 2000) || (daysLeft !== null && daysLeft <= 60)) {
      status = "yellow";
      icon = "alert-triangle";
    }

    return {
      id: r.id,
      status,
      icon,
      text,
      imageUrl: r.imageUrl || ""
    };
  }).sort((a, b) => {
    const statusOrder = { expired: 0, red: 1, orange: 2, yellow: 3, gray: 4 };
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
    const aNum = a.text.match(/-?\\d+/) ? Math.abs(Number(a.text.match(/-?\\d+/)[0])) : 99999;
    const bNum = b.text.match(/-?\\d+/) ? Math.abs(Number(b.text.match(/-?\\d+/)[0])) : 99999;
    return aNum - bNum;
  });
}


function deleteInfoEntry(id) {
  if (confirm("Удалить напоминание?")) {
    db.collection("users").doc(profileCode).collection("reminders").doc(id).delete()
.then(() => showToast("Напоминание удалено"));
  }
}

function editInfoEntry(id) {
  db.collection("users").doc(profileCode).collection("reminders").doc(id).get().then(doc => {
    if (!doc.exists) return;
    const r = doc.data();
    editingReminderId = id;

    // Разворачиваем блок "Добавить напоминание"
    const toggle = document.getElementById("toggle-info-add");
if (toggle) {
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
}


    // Заполняем все поля формы напоминания
    setTimeout(() => { // задержка чтобы точно DOM был готов
      if (document.getElementById('info-type')) document.getElementById('info-type').value = r.type || "";
      if (document.getElementById('info-tag')) document.getElementById('info-tag').value = r.tag || "";
      if (document.getElementById('info-mileage')) document.getElementById('info-mileage').value = r.mileage || "";
      if (document.getElementById('info-interval')) document.getElementById('info-interval').value = r.interval || "";
      if (document.getElementById('info-date-start')) document.getElementById('info-date-start').value = r.dateStart || "";
      if (document.getElementById('info-date-end')) document.getElementById('info-date-end').value = r.dateEnd || "";
      if (document.getElementById("info-add-photo-btn")) document.getElementById("info-add-photo-btn").classList.remove("selected");
      if (document.getElementById("info-add-photo")) document.getElementById("info-add-photo").value = "";
    }, 100); // 100ms задержки хватит
  });
}
function showToast(message = "Готово!") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hidden");
  }, 2000);
}

function showInfoImage(url) { /* ...добавить позже... */ }
// Сворачивание блока добавления напоминания

  