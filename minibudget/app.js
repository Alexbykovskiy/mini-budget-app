let db; // <--- вот это вставь первой строкой
const profileCode = "mini";

// Date picker must not depend on Firebase or other app startup tasks.
// This also makes it reliable on desktop browsers where another startup task may fail.
document.addEventListener("DOMContentLoaded", () => {
  initExpenseDatePicker();
  initFuelPeriodPickerTrigger();
  initFilterControls();
  initStatsDashboard();
});

window.addEventListener("load", () => {
  db = firebase.firestore();
  loadExpenses();
  populateTagList();
  resetForm();
  initWheelPickerUI();
  initFuelControls();
initCarMapEditor();
initReminderModal();
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
let fuelScrubberPoints = [];
let fuelScrubberIndex = 0;
let fuelScrubberReady = false;
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
let reminderModalEditingId = null;

let reminderModalSelectedIcon =
  "wrench";
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
  return `${left}.${padNumber(right * 10, 2)} €`;
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
  return `${left}.${right} л`;
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
        return `${padNumber(left, 3)}  ${padNumber(right, 3)} км`;
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
      <div
        id="wheel-picker-title"
        class="wheel-picker-title"
      >
        Выбор
      </div>
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

    </div>

    <div class="wheel-picker-footer">

      <button
        type="button"
        id="wheel-picker-cancel"
        class="wheel-picker-footer-btn cancel"
      >
        Отмена
      </button>

      <button
        type="button"
        id="wheel-picker-ok"
        class="wheel-picker-footer-btn primary"
      >
        Готово
      </button>

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
  (e) => {
    e.preventDefault();

    input.blur();

    openWheelPicker(
      type,
      input
    );
  }
);
    }
  );
}


/* =========================================================
   EXPENSE DATE PICKER
   Custom iOS-style day / month / year wheel
   ========================================================= */

const EXPENSE_DATE_MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь"
];

const EXPENSE_DATE_MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
];

const EXPENSE_DATE_WHEEL_ROW_HEIGHT = 44;
const EXPENSE_DATE_WHEEL_RADIUS = 2;
const EXPENSE_DATE_WHEEL_SENSITIVITY = 1.45;
const EXPENSE_DATE_MIN_YEAR = 2000;
const EXPENSE_DATE_MAX_YEAR = 2100;

let expenseDatePickerState = null;

function getLocalISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1, 2);
  const day = padNumber(date.getDate(), 2);
  return `${year}-${month}-${day}`;
}

function getExpenseDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseExpenseDateISO(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate()
    };
  }

  const year = clamp(Number(match[1]), EXPENSE_DATE_MIN_YEAR, EXPENSE_DATE_MAX_YEAR);
  const month = clamp(Number(match[2]), 1, 12);
  const maxDay = getExpenseDaysInMonth(year, month);
  const day = clamp(Number(match[3]), 1, maxDay);

  return { year, month, day };
}

function composeExpenseDateISO(day, month, year) {
  return `${year}-${padNumber(month, 2)}-${padNumber(day, 2)}`;
}

function formatExpenseDateShort(value) {
  const parsed = parseExpenseDateISO(value);
  return `${padNumber(parsed.day, 2)}.${padNumber(parsed.month, 2)}.${parsed.year}`;
}

function formatExpenseDateLong(day, month, year) {
  return `${day} ${EXPENSE_DATE_MONTHS_GENITIVE[month - 1]} ${year}`;
}

function syncExpenseDateTrigger() {
  const input = document.getElementById("date");
  const display = document.getElementById("expense-date-display");

  if (!input || !display) return;

  if (!input.value) {
    input.value = getLocalISODate();
  }

  display.textContent = formatExpenseDateShort(input.value);
}

function createExpenseDatePickerModal() {
  if (document.getElementById("expense-date-picker-modal")) return;

  const modal = document.createElement("div");
  modal.id = "expense-date-picker-modal";
  modal.className = "expense-date-picker-modal hidden";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div
      class="expense-date-picker-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Выбор даты"
    >
      <div class="expense-date-picker-handle" aria-hidden="true"></div>

      <div class="expense-date-picker-header">
        <button
          type="button"
          id="expense-date-picker-close"
          class="expense-date-picker-close"
          aria-label="Закрыть"
        >
          <span data-lucide="x"></span>
        </button>
      </div>

      <div class="expense-date-picker-quick">
        <button
          type="button"
          id="expense-date-picker-today"
          class="expense-date-picker-chip"
        >
          Сегодня
        </button>
      </div>

      <div class="date-wheel-labels" aria-hidden="true">
        <span>День</span>
        <span>Месяц</span>
        <span>Год</span>
      </div>

      <div class="date-wheel-grid">
        <div class="wheel-picker-selection-combined" aria-hidden="true"></div>

        <div class="wheel-picker-unit">
          <div class="wheel-picker-wheel" data-expense-date-wheel="day">
            <div class="wheel-picker-track" id="expense-date-day-track"></div>
          </div>
        </div>

        <div class="wheel-picker-unit date-wheel-month">
          <div class="wheel-picker-wheel" data-expense-date-wheel="month">
            <div class="wheel-picker-track" id="expense-date-month-track"></div>
          </div>
        </div>

        <div class="wheel-picker-unit">
          <div class="wheel-picker-wheel" data-expense-date-wheel="year">
            <div class="wheel-picker-track" id="expense-date-year-track"></div>
          </div>
        </div>
      </div>

      <div class="expense-date-picker-footer">
        <button
          type="button"
          id="expense-date-picker-cancel"
          class="expense-date-picker-btn secondary"
        >
          Отмена
        </button>

        <button
          type="button"
          id="expense-date-picker-apply"
          class="expense-date-picker-btn primary"
        >
          Готово
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  expenseDatePickerState = {
    modal,
    day: 1,
    month: 1,
    year: new Date().getFullYear(),
    wheels: {
      day: {
        root: modal.querySelector('[data-expense-date-wheel="day"]'),
        track: document.getElementById("expense-date-day-track")
      },
      month: {
        root: modal.querySelector('[data-expense-date-wheel="month"]'),
        track: document.getElementById("expense-date-month-track")
      },
      year: {
        root: modal.querySelector('[data-expense-date-wheel="year"]'),
        track: document.getElementById("expense-date-year-track")
      }
    }
  };

  document
    .getElementById("expense-date-picker-close")
    ?.addEventListener("click", closeExpenseDatePicker);

  document
    .getElementById("expense-date-picker-cancel")
    ?.addEventListener("click", closeExpenseDatePicker);

  document
    .getElementById("expense-date-picker-apply")
    ?.addEventListener("click", applyExpenseDatePicker);

  document
    .getElementById("expense-date-picker-today")
    ?.addEventListener("click", () => {
      const today = new Date();
      expenseDatePickerState.day = today.getDate();
      expenseDatePickerState.month = today.getMonth() + 1;
      expenseDatePickerState.year = today.getFullYear();
      normalizeExpenseDatePickerDay();
      renderAllExpenseDateWheels();
      updateExpenseDatePickerPreview();
      wheelHaptic();
    });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeExpenseDatePicker();
    }
  });

  Object.keys(expenseDatePickerState.wheels).forEach((side) => {
    attachExpenseDateWheelDrag(side);
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

function getExpenseDateWheelBounds(side) {
  const state = expenseDatePickerState;

  if (side === "day") {
    return {
      min: 1,
      max: getExpenseDaysInMonth(state.year, state.month)
    };
  }

  if (side === "month") {
    return { min: 1, max: 12 };
  }

  return {
    min: EXPENSE_DATE_MIN_YEAR,
    max: EXPENSE_DATE_MAX_YEAR
  };
}

function formatExpenseDateWheelValue(side, value) {
  if (side === "month") {
    return EXPENSE_DATE_MONTHS[value - 1];
  }

  if (side === "day") {
    return padNumber(value, 2);
  }

  return String(value);
}

function normalizeExpenseDatePickerDay() {
  if (!expenseDatePickerState) return;

  const maxDay = getExpenseDaysInMonth(
    expenseDatePickerState.year,
    expenseDatePickerState.month
  );

  expenseDatePickerState.day = clamp(
    expenseDatePickerState.day,
    1,
    maxDay
  );
}

function renderExpenseDateWheel(side, translateY = 0) {
  const state = expenseDatePickerState;
  const wheel = state?.wheels?.[side];

  if (!state || !wheel) return;

  const bounds = getExpenseDateWheelBounds(side);
  const centerValue = state[side];

  wheel.track.innerHTML = "";

  for (
    let offset = -EXPENSE_DATE_WHEEL_RADIUS;
    offset <= EXPENSE_DATE_WHEEL_RADIUS;
    offset++
  ) {
    const value = centerValue + offset;
    const item = document.createElement("div");
    const distance = Math.abs(offset);

    item.className =
      "wheel-picker-item " +
      `wheel-distance-${distance}` +
      (offset === 0 ? " active" : "");

    if (value < bounds.min || value > bounds.max) {
      item.classList.add("empty");
      item.textContent = "";
    } else {
      item.textContent = formatExpenseDateWheelValue(side, value);
      item.dataset.value = String(value);
    }

    wheel.track.appendChild(item);
  }

  wheel.track.style.transform = `translateY(${translateY}px)`;
}

function renderAllExpenseDateWheels(activeSide = null, translateY = 0) {
  ["day", "month", "year"].forEach((side) => {
    renderExpenseDateWheel(
      side,
      side === activeSide ? translateY : 0
    );
  });
}

function updateExpenseDatePickerPreview() {
  if (!expenseDatePickerState) return;

  const preview = document.getElementById("expense-date-picker-preview");
  if (!preview) return;

  preview.textContent = formatExpenseDateLong(
    expenseDatePickerState.day,
    expenseDatePickerState.month,
    expenseDatePickerState.year
  );
}

function setExpenseDateWheelValue(side, value, translateY = 0) {
  if (!expenseDatePickerState) return;

  const bounds = getExpenseDateWheelBounds(side);
  const nextValue = clamp(Math.round(value), bounds.min, bounds.max);
  const changed = expenseDatePickerState[side] !== nextValue;

  expenseDatePickerState[side] = nextValue;

  if (side === "month" || side === "year") {
    normalizeExpenseDatePickerDay();
  }

  renderAllExpenseDateWheels(side, translateY);
  updateExpenseDatePickerPreview();

  if (changed) {
    wheelHaptic();
  }
}

function openExpenseDatePicker() {
  const input = document.getElementById("date");

  if (!input || !expenseDatePickerState?.modal) return;

  const initial = parseExpenseDateISO(
    input.value || getLocalISODate()
  );

  expenseDatePickerState.day = initial.day;
  expenseDatePickerState.month = initial.month;
  expenseDatePickerState.year = initial.year;

  normalizeExpenseDatePickerDay();
  renderAllExpenseDateWheels();
  updateExpenseDatePickerPreview();

  expenseDatePickerState.modal.classList.remove("hidden");
  expenseDatePickerState.modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("expense-date-picker-lock");

  requestAnimationFrame(() => {
    expenseDatePickerState.modal.classList.add("show");
  });
}

function closeExpenseDatePicker() {
  const modal = expenseDatePickerState?.modal;
  if (!modal) return;

  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("expense-date-picker-lock");

  setTimeout(() => {
    modal.classList.add("hidden");
  }, 200);
}

function applyExpenseDatePicker() {
  const input = document.getElementById("date");
  if (!input || !expenseDatePickerState) return;

  normalizeExpenseDatePickerDay();

  input.value = composeExpenseDateISO(
    expenseDatePickerState.day,
    expenseDatePickerState.month,
    expenseDatePickerState.year
  );

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  syncExpenseDateTrigger();
  closeExpenseDatePicker();
}

function runExpenseDateWheelInertia(side, velocity) {
  if (!expenseDatePickerState) return;

  const speed = Math.abs(velocity);

  if (speed < 0.10) {
    renderExpenseDateWheel(side, 0);
    return;
  }

  const direction = velocity < 0 ? 1 : -1;

  let extraSteps = Math.round(
    speed * 8 * EXPENSE_DATE_WHEEL_SENSITIVITY
  );

  extraSteps = clamp(extraSteps, 1, 28);

  const bounds = getExpenseDateWheelBounds(side);
  const target = clamp(
    expenseDatePickerState[side] + direction * extraSteps,
    bounds.min,
    bounds.max
  );

  animateExpenseDateWheelTo(side, target);
}

function animateExpenseDateWheelTo(side, targetValue) {
  if (!expenseDatePickerState) return;

  const bounds = getExpenseDateWheelBounds(side);
  targetValue = clamp(targetValue, bounds.min, bounds.max);

  let current = expenseDatePickerState[side];

  if (current === targetValue) {
    renderExpenseDateWheel(side, 0);
    return;
  }

  const direction = targetValue > current ? 1 : -1;
  const totalSteps = Math.abs(targetValue - current);
  let completed = 0;

  const nextStep = () => {
    if (!expenseDatePickerState || completed >= totalSteps) {
      renderAllExpenseDateWheels();
      return;
    }

    const dynamicBounds = getExpenseDateWheelBounds(side);
    current = clamp(current + direction, dynamicBounds.min, dynamicBounds.max);
    completed++;

    expenseDatePickerState[side] = current;

    if (side === "month" || side === "year") {
      normalizeExpenseDatePickerDay();
    }

    renderAllExpenseDateWheels();
    updateExpenseDatePickerPreview();
    wheelHaptic();

    const progress = completed / totalSteps;
    const delay = 16 + progress * progress * 48;

    setTimeout(nextStep, delay);
  };

  nextStep();
}

function attachExpenseDateWheelDrag(side) {
  const wheel = expenseDatePickerState?.wheels?.[side];
  if (!wheel) return;

  let dragging = false;
  let startY = 0;
  let startValue = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;
  let moved = false;

  const onPointerMove = (event) => {
    if (!dragging || !expenseDatePickerState) return;

    event.preventDefault();

    const now = performance.now();
    const dy = event.clientY - lastY;
    const dt = Math.max(now - lastTime, 1);
    const instantVelocity = dy / dt;

    velocity = velocity * 0.65 + instantVelocity * 0.35;
    lastY = event.clientY;
    lastTime = now;

    const deltaY = event.clientY - startY;
    if (Math.abs(deltaY) > 4) moved = true;

    const bounds = getExpenseDateWheelBounds(side);

    const floatValue = clamp(
      startValue -
        (deltaY / EXPENSE_DATE_WHEEL_ROW_HEIGHT) *
          EXPENSE_DATE_WHEEL_SENSITIVITY,
      bounds.min,
      bounds.max
    );

    const roundedValue = clamp(
      Math.round(floatValue),
      bounds.min,
      bounds.max
    );

    const translateY =
      (roundedValue - floatValue) *
      EXPENSE_DATE_WHEEL_ROW_HEIGHT;

    setExpenseDateWheelValue(
      side,
      roundedValue,
      translateY
    );
  };

  const onPointerUp = () => {
    if (!dragging) return;

    dragging = false;
    wheel.root.classList.remove("dragging");

    if (moved) {
      runExpenseDateWheelInertia(side, velocity);
    } else {
      renderExpenseDateWheel(side, 0);
    }
  };

  wheel.root.addEventListener("pointerdown", (event) => {
    if (!expenseDatePickerState) return;

    dragging = true;
    moved = false;
    startY = event.clientY;
    startValue = expenseDatePickerState[side];
    lastY = event.clientY;
    lastTime = performance.now();
    velocity = 0;

    wheel.root.classList.add("dragging");

    if (wheel.root.setPointerCapture) {
      wheel.root.setPointerCapture(event.pointerId);
    }
  });

  wheel.root.addEventListener("pointermove", onPointerMove);
  wheel.root.addEventListener("pointerup", onPointerUp);
  wheel.root.addEventListener("pointercancel", onPointerUp);
  wheel.root.addEventListener("lostpointercapture", onPointerUp);
}

function initExpenseDatePicker() {
  createExpenseDatePickerModal();

  const trigger = document.getElementById("expense-date-trigger");
  const input = document.getElementById("date");

  if (!trigger || !input) return;
  if (trigger.dataset.datePickerReady === "1") {
    syncExpenseDateTrigger();
    return;
  }
  trigger.dataset.datePickerReady = "1";

  if (!input.value) {
    input.value = getLocalISODate();
  }

  syncExpenseDateTrigger();

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    trigger.blur();
    openExpenseDatePicker();
  });

  input.addEventListener("change", syncExpenseDateTrigger);

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      expenseDatePickerState?.modal?.classList.contains("show")
    ) {
      closeExpenseDatePicker();
    }
  });
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

function initStatsDashboard() {
  if (!document.querySelector('.stats-dashboard')) return;

  if (window.lucide) {
    lucide.createIcons();
  }
}

function setStatText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatStatInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number).toLocaleString('ru-RU') : '—';
}

function formatStatMoney(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
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
  // 4) Записываем данные в digital-панель статистики
  const totalMileage = ms.length ? Math.max(...ms) : 0;
  setStatText('stat-distance', formatStatInteger(distance));
  setStatText('stat-total-km', formatStatInteger(totalMileage));
  setStatText('stat-days', `${formatStatInteger(daysDiff)} дней`);

  // 5) Пробег двигателя отображается второй строкой под общим пробегом
  const mileageBeforeSwap = 190000;
  const engineOffsetKm = 64374;
  const engineKm = ms.length ? totalMileage - mileageBeforeSwap + engineOffsetKm : 0;
  setStatText('stat-engine-km', engineKm > 0 ? formatStatInteger(engineKm) : '—');

  // Всё, что касается сумм
  const totalAmount = fullData.reduce((sum, e) => sum + Number(e.amount), 0);
  setStatText('stat-total-amount', formatStatMoney(totalAmount));

  // Подсчёт стоимости на км, чистых затрат, расхода и средней цены литра
  calculateCostPerKm(fullData);
  calculatePureRunningCost(fullData);
  calculateFuelStats(fullData);
 updateFuelConsumptionUI(fullData);
}



let fuelPeriodPickerState = null;

function getFuelPeriodDefaultRange() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    from: {
      year: from.getFullYear(),
      month: from.getMonth() + 1,
      day: from.getDate()
    },
    to: {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate()
    }
  };
}

function parseFuelPeriodDate(value, fallback) {
  if (!value) return { ...fallback };
  return parseExpenseDateISO(value);
}

function formatFuelPeriodTriggerValue(fromValue, toValue) {
  if (!fromValue && !toValue) return 'Выбрать период';
  if (fromValue && toValue) return `${formatExpenseDateShort(fromValue)} — ${formatExpenseDateShort(toValue)}`;
  if (fromValue) return `${formatExpenseDateShort(fromValue)} —`;
  return `— ${formatExpenseDateShort(toValue)}`;
}

function syncFuelPeriodTrigger() {
  const trigger = document.getElementById('fuel-period-trigger');
  const display = document.getElementById('fuel-period-display');
  const fromInput = document.getElementById('fuel-date-from');
  const toInput = document.getElementById('fuel-date-to');

  if (!trigger || !display || !fromInput || !toInput) return;

  const text = formatFuelPeriodTriggerValue(fromInput.value, toInput.value);
  display.textContent = text;
  trigger.classList.toggle('is-selected', !!(fromInput.value || toInput.value));
}

function syncFilterPeriodTrigger() {
  const trigger = document.getElementById('filter-period-trigger');
  const display = document.getElementById('filter-period-display');
  const fromInput = document.getElementById('filter-from');
  const toInput = document.getElementById('filter-to');

  if (!trigger || !display || !fromInput || !toInput) return;

  const text = formatFuelPeriodTriggerValue(fromInput.value, toInput.value);
  display.textContent = text;
  trigger.classList.toggle('is-selected', !!(fromInput.value || toInput.value));
}

function getPeriodPickerContextElements(context = 'fuel') {
  if (context === 'filter') {
    return {
      fromInput: document.getElementById('filter-from'),
      toInput: document.getElementById('filter-to')
    };
  }

  return {
    fromInput: document.getElementById('fuel-date-from'),
    toInput: document.getElementById('fuel-date-to')
  };
}

function createFuelPeriodPickerModal() {
  if (document.getElementById('fuel-period-picker-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'fuel-period-picker-modal';
  modal.className = 'fuel-period-picker-modal hidden';
  modal.setAttribute('aria-hidden', 'true');

  modal.innerHTML = `
    <div class="fuel-period-picker-sheet" role="dialog" aria-modal="true" aria-label="Выбор периода">
      <div class="fuel-period-picker-sections">

        <section class="fuel-period-picker-section">
          <div class="fuel-period-picker-section__head">
            <div class="fuel-period-picker-section__title">От</div>
            <div class="fuel-period-presets" aria-label="Быстрый выбор начала периода">
              <button type="button" class="fuel-period-chip" data-period-from-days="7">7 дн</button>
              <button type="button" class="fuel-period-chip" data-period-from-months="1">1 мес</button>
              <button type="button" class="fuel-period-chip" data-period-from-months="3">3 мес</button>
              <button type="button" class="fuel-period-chip" data-period-from-months="6">6 мес</button>
              <button type="button" class="fuel-period-chip" data-period-from-months="9">9 мес</button>
              <button type="button" class="fuel-period-chip" data-period-from-months="12">12 мес</button>
            </div>
          </div>

          <div class="date-wheel-labels" aria-hidden="true">
            <span>День</span>
            <span>Месяц</span>
            <span>Год</span>
          </div>

          <div class="date-wheel-grid fuel-period-wheel-grid">
            <div class="wheel-picker-selection-combined" aria-hidden="true"></div>

            <div class="wheel-picker-unit">
              <div class="wheel-picker-wheel" data-fuel-period-wheel="from-day">
                <div class="wheel-picker-track" id="fuel-period-from-day-track"></div>
              </div>
            </div>

            <div class="wheel-picker-unit date-wheel-month">
              <div class="wheel-picker-wheel" data-fuel-period-wheel="from-month">
                <div class="wheel-picker-track" id="fuel-period-from-month-track"></div>
              </div>
            </div>

            <div class="wheel-picker-unit">
              <div class="wheel-picker-wheel" data-fuel-period-wheel="from-year">
                <div class="wheel-picker-track" id="fuel-period-from-year-track"></div>
              </div>
            </div>
          </div>
        </section>

        <section class="fuel-period-picker-section">
          <div class="fuel-period-picker-section__head">
            <div class="fuel-period-picker-section__title">До</div>
            <div class="fuel-period-presets" aria-label="Быстрый выбор конца периода">
              <button type="button" class="fuel-period-chip" data-period-to-today>Сегодня</button>
              <button type="button" class="fuel-period-chip" data-period-to-days="7">−7 дн</button>
              <button type="button" class="fuel-period-chip" data-period-to-months="1">−1 мес</button>
              <button type="button" class="fuel-period-chip" data-period-to-months="3">−3 мес</button>
              <button type="button" class="fuel-period-chip" data-period-to-months="6">−6 мес</button>
              <button type="button" class="fuel-period-chip" data-period-to-months="9">−9 мес</button>
              <button type="button" class="fuel-period-chip" data-period-to-months="12">−12 мес</button>
            </div>
          </div>

          <div class="date-wheel-labels" aria-hidden="true">
            <span>День</span>
            <span>Месяц</span>
            <span>Год</span>
          </div>

          <div class="date-wheel-grid fuel-period-wheel-grid">
            <div class="wheel-picker-selection-combined" aria-hidden="true"></div>

            <div class="wheel-picker-unit">
              <div class="wheel-picker-wheel" data-fuel-period-wheel="to-day">
                <div class="wheel-picker-track" id="fuel-period-to-day-track"></div>
              </div>
            </div>

            <div class="wheel-picker-unit date-wheel-month">
              <div class="wheel-picker-wheel" data-fuel-period-wheel="to-month">
                <div class="wheel-picker-track" id="fuel-period-to-month-track"></div>
              </div>
            </div>

            <div class="wheel-picker-unit">
              <div class="wheel-picker-wheel" data-fuel-period-wheel="to-year">
                <div class="wheel-picker-track" id="fuel-period-to-year-track"></div>
              </div>
            </div>
          </div>
        </section>

      </div>

      <div class="fuel-period-picker-footer">
        <button type="button" id="fuel-period-picker-cancel" class="fuel-period-picker-btn secondary">Отмена</button>
        <button type="button" id="fuel-period-picker-apply" class="fuel-period-picker-btn primary">Готово</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  fuelPeriodPickerState = {
    modal,
    context: 'fuel',
    from: { day: 1, month: 1, year: new Date().getFullYear() },
    to: { day: 1, month: 1, year: new Date().getFullYear() },
    wheels: {
      from: {
        day: { root: modal.querySelector('[data-fuel-period-wheel="from-day"]'), track: document.getElementById('fuel-period-from-day-track') },
        month: { root: modal.querySelector('[data-fuel-period-wheel="from-month"]'), track: document.getElementById('fuel-period-from-month-track') },
        year: { root: modal.querySelector('[data-fuel-period-wheel="from-year"]'), track: document.getElementById('fuel-period-from-year-track') }
      },
      to: {
        day: { root: modal.querySelector('[data-fuel-period-wheel="to-day"]'), track: document.getElementById('fuel-period-to-day-track') },
        month: { root: modal.querySelector('[data-fuel-period-wheel="to-month"]'), track: document.getElementById('fuel-period-to-month-track') },
        year: { root: modal.querySelector('[data-fuel-period-wheel="to-year"]'), track: document.getElementById('fuel-period-to-year-track') }
      }
    }
  };

  document.getElementById('fuel-period-picker-cancel')?.addEventListener('click', closeFuelPeriodPicker);
  document.getElementById('fuel-period-picker-apply')?.addEventListener('click', applyFuelPeriodPicker);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeFuelPeriodPicker();
  });

  attachFuelPeriodPresetActions(modal);

  ['from', 'to'].forEach((rangeKey) => {
    ['day', 'month', 'year'].forEach((side) => {
      attachFuelPeriodWheelDrag(rangeKey, side);
    });
  });
}

function getFuelPeriodWheelBounds(rangeKey, side) {
  const state = fuelPeriodPickerState?.[rangeKey];
  if (!state) return { min: 1, max: 1 };

  if (side === 'day') {
    return { min: 1, max: getExpenseDaysInMonth(state.year, state.month) };
  }

  if (side === 'month') {
    return { min: 1, max: 12 };
  }

  return { min: EXPENSE_DATE_MIN_YEAR, max: EXPENSE_DATE_MAX_YEAR };
}

function normalizeFuelPeriodDay(rangeKey) {
  if (!fuelPeriodPickerState?.[rangeKey]) return;
  const state = fuelPeriodPickerState[rangeKey];
  const maxDay = getExpenseDaysInMonth(state.year, state.month);
  state.day = clamp(state.day, 1, maxDay);
}

function renderFuelPeriodWheel(rangeKey, side, translateY = 0) {
  const wheel = fuelPeriodPickerState?.wheels?.[rangeKey]?.[side];
  const state = fuelPeriodPickerState?.[rangeKey];
  if (!wheel || !state) return;

  const bounds = getFuelPeriodWheelBounds(rangeKey, side);
  const centerValue = state[side];
  wheel.track.innerHTML = '';

  for (let offset = -EXPENSE_DATE_WHEEL_RADIUS; offset <= EXPENSE_DATE_WHEEL_RADIUS; offset++) {
    const value = centerValue + offset;
    const item = document.createElement('div');
    const distance = Math.abs(offset);

    item.className = 'wheel-picker-item ' + `wheel-distance-${distance}` + (offset === 0 ? ' active' : '');

    if (value < bounds.min || value > bounds.max) {
      item.classList.add('empty');
      item.textContent = '';
    } else {
      item.textContent = formatExpenseDateWheelValue(side, value);
      item.dataset.value = String(value);
    }

    wheel.track.appendChild(item);
  }

  wheel.track.style.transform = `translateY(${translateY}px)`;
}

function renderAllFuelPeriodWheels() {
  ['from', 'to'].forEach((rangeKey) => {
    ['day', 'month', 'year'].forEach((side) => renderFuelPeriodWheel(rangeKey, side, 0));
  });
}

function setFuelPeriodWheelValue(rangeKey, side, value, translateY = 0) {
  const bounds = getFuelPeriodWheelBounds(rangeKey, side);
  value = clamp(value, bounds.min, bounds.max);

  if (!fuelPeriodPickerState?.[rangeKey]) return;

  fuelPeriodPickerState[rangeKey][side] = value;
  if (side === 'month' || side === 'year') normalizeFuelPeriodDay(rangeKey);

  ['day', 'month', 'year'].forEach((wheelSide) => {
    if (wheelSide === side) {
      renderFuelPeriodWheel(rangeKey, wheelSide, translateY);
    } else {
      renderFuelPeriodWheel(rangeKey, wheelSide, 0);
    }
  });
}

function runFuelPeriodWheelInertia(rangeKey, side, velocity) {
  if (!fuelPeriodPickerState) return;
  const speed = Math.abs(velocity);

  if (speed < 0.10) {
    renderFuelPeriodWheel(rangeKey, side, 0);
    return;
  }

  const direction = velocity < 0 ? 1 : -1;
  let extraSteps = Math.round(speed * 8 * EXPENSE_DATE_WHEEL_SENSITIVITY);
  extraSteps = clamp(extraSteps, 1, 28);

  const bounds = getFuelPeriodWheelBounds(rangeKey, side);
  const target = clamp(fuelPeriodPickerState[rangeKey][side] + direction * extraSteps, bounds.min, bounds.max);
  animateFuelPeriodWheelTo(rangeKey, side, target);
}

function animateFuelPeriodWheelTo(rangeKey, side, targetValue) {
  if (!fuelPeriodPickerState?.[rangeKey]) return;

  const bounds = getFuelPeriodWheelBounds(rangeKey, side);
  targetValue = clamp(targetValue, bounds.min, bounds.max);
  let current = fuelPeriodPickerState[rangeKey][side];

  if (current === targetValue) {
    renderFuelPeriodWheel(rangeKey, side, 0);
    return;
  }

  const direction = targetValue > current ? 1 : -1;
  const totalSteps = Math.abs(targetValue - current);
  let completed = 0;

  const nextStep = () => {
    if (!fuelPeriodPickerState?.[rangeKey] || completed >= totalSteps) {
      renderAllFuelPeriodWheels();
      return;
    }

    const dynamicBounds = getFuelPeriodWheelBounds(rangeKey, side);
    current = clamp(current + direction, dynamicBounds.min, dynamicBounds.max);
    completed++;
    fuelPeriodPickerState[rangeKey][side] = current;

    if (side === 'month' || side === 'year') normalizeFuelPeriodDay(rangeKey);

    renderAllFuelPeriodWheels();
    wheelHaptic();

    const progress = completed / totalSteps;
    const delay = 16 + progress * progress * 48;
    setTimeout(nextStep, delay);
  };

  nextStep();
}

function attachFuelPeriodWheelDrag(rangeKey, side) {
  const wheel = fuelPeriodPickerState?.wheels?.[rangeKey]?.[side];
  if (!wheel) return;

  let dragging = false;
  let startY = 0;
  let startValue = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;
  let moved = false;

  const onPointerMove = (event) => {
    if (!dragging || !fuelPeriodPickerState) return;
    event.preventDefault();

    const now = performance.now();
    const dy = event.clientY - lastY;
    const dt = Math.max(now - lastTime, 1);
    const instantVelocity = dy / dt;

    velocity = velocity * 0.65 + instantVelocity * 0.35;
    lastY = event.clientY;
    lastTime = now;

    const deltaY = event.clientY - startY;
    if (Math.abs(deltaY) > 4) moved = true;

    const bounds = getFuelPeriodWheelBounds(rangeKey, side);
    const floatValue = clamp(startValue - (deltaY / EXPENSE_DATE_WHEEL_ROW_HEIGHT) * EXPENSE_DATE_WHEEL_SENSITIVITY, bounds.min, bounds.max);
    const roundedValue = clamp(Math.round(floatValue), bounds.min, bounds.max);
    const translateY = (roundedValue - floatValue) * EXPENSE_DATE_WHEEL_ROW_HEIGHT;

    setFuelPeriodWheelValue(rangeKey, side, roundedValue, translateY);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    wheel.root.classList.remove('dragging');

    if (moved) runFuelPeriodWheelInertia(rangeKey, side, velocity);
    else renderFuelPeriodWheel(rangeKey, side, 0);
  };

  wheel.root.addEventListener('pointerdown', (event) => {
    if (!fuelPeriodPickerState) return;
    dragging = true;
    moved = false;
    startY = event.clientY;
    startValue = fuelPeriodPickerState[rangeKey][side];
    lastY = event.clientY;
    lastTime = performance.now();
    velocity = 0;

    wheel.root.classList.add('dragging');
    if (wheel.root.setPointerCapture) wheel.root.setPointerCapture(event.pointerId);
  });

  wheel.root.addEventListener('pointermove', onPointerMove);
  wheel.root.addEventListener('pointerup', onPointerUp);
  wheel.root.addEventListener('pointercancel', onPointerUp);
  wheel.root.addEventListener('lostpointercapture', onPointerUp);
}

function fuelPeriodPartsToDate(parts) {
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

function fuelPeriodDateToParts(date) {
  return {
    day: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear()
  };
}

function subtractFuelPeriodMonths(parts, months) {
  const source = fuelPeriodPartsToDate(parts);
  const originalDay = source.getDate();

  source.setDate(1);
  source.setMonth(source.getMonth() - months);

  const lastDay = getExpenseDaysInMonth(
    source.getFullYear(),
    source.getMonth() + 1
  );

  source.setDate(Math.min(originalDay, lastDay));
  return fuelPeriodDateToParts(source);
}

function subtractFuelPeriodDays(parts, days) {
  const source = fuelPeriodPartsToDate(parts);
  source.setDate(source.getDate() - days);
  return fuelPeriodDateToParts(source);
}

function setFuelPeriodPart(rangeKey, parts) {
  if (!fuelPeriodPickerState?.[rangeKey]) return;
  fuelPeriodPickerState[rangeKey] = { ...parts };
  normalizeFuelPeriodDay(rangeKey);
  renderAllFuelPeriodWheels();
  wheelHaptic();
}

function attachFuelPeriodPresetActions(modal) {
  modal.querySelectorAll('[data-period-from-days]').forEach((button) => {
    button.addEventListener('click', () => {
      const days = Number(button.dataset.periodFromDays || 0);
      setFuelPeriodPart('from', subtractFuelPeriodDays(fuelPeriodPickerState.to, days));
    });
  });

  modal.querySelectorAll('[data-period-from-months]').forEach((button) => {
    button.addEventListener('click', () => {
      const months = Number(button.dataset.periodFromMonths || 0);
      setFuelPeriodPart('from', subtractFuelPeriodMonths(fuelPeriodPickerState.to, months));
    });
  });

  modal.querySelector('[data-period-to-today]')?.addEventListener('click', () => {
    const today = new Date();
    setFuelPeriodPart('to', {
      day: today.getDate(),
      month: today.getMonth() + 1,
      year: today.getFullYear()
    });
  });

  modal.querySelectorAll('[data-period-to-days]').forEach((button) => {
    button.addEventListener('click', () => {
      const days = Number(button.dataset.periodToDays || 0);
      const today = fuelPeriodDateToParts(new Date());
      setFuelPeriodPart('to', subtractFuelPeriodDays(today, days));
    });
  });

  modal.querySelectorAll('[data-period-to-months]').forEach((button) => {
    button.addEventListener('click', () => {
      const months = Number(button.dataset.periodToMonths || 0);
      const today = fuelPeriodDateToParts(new Date());
      setFuelPeriodPart('to', subtractFuelPeriodMonths(today, months));
    });
  });
}

function openFuelPeriodPicker(context = 'fuel') {
  createFuelPeriodPickerModal();

  const { fromInput, toInput } = getPeriodPickerContextElements(context);
  const defaults = getFuelPeriodDefaultRange();

  if (!fromInput || !toInput || !fuelPeriodPickerState) return;

  fuelPeriodPickerState.context = context;
  fuelPeriodPickerState.from = parseFuelPeriodDate(fromInput.value, defaults.from);
  fuelPeriodPickerState.to = parseFuelPeriodDate(toInput.value, defaults.to);
  normalizeFuelPeriodDay('from');
  normalizeFuelPeriodDay('to');
  renderAllFuelPeriodWheels();

  fuelPeriodPickerState.modal.classList.remove('hidden');
  requestAnimationFrame(() => fuelPeriodPickerState?.modal?.classList.add('show'));
  fuelPeriodPickerState.modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('expense-date-picker-lock');
}

function closeFuelPeriodPicker() {
  if (!fuelPeriodPickerState?.modal) return;
  fuelPeriodPickerState.modal.classList.remove('show');
  fuelPeriodPickerState.modal.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    fuelPeriodPickerState?.modal?.classList.add('hidden');
  }, 180);
  document.body.classList.remove('expense-date-picker-lock');
}

function applyFuelPeriodPicker() {
  if (!fuelPeriodPickerState) return;

  const context = fuelPeriodPickerState.context || 'fuel';
  const { fromInput, toInput } = getPeriodPickerContextElements(context);
  if (!fromInput || !toInput) return;

  let fromIso = composeExpenseDateISO(fuelPeriodPickerState.from.day, fuelPeriodPickerState.from.month, fuelPeriodPickerState.from.year);
  let toIso = composeExpenseDateISO(fuelPeriodPickerState.to.day, fuelPeriodPickerState.to.month, fuelPeriodPickerState.to.year);

  if (fromIso > toIso) {
    [fromIso, toIso] = [toIso, fromIso];
  }

  fromInput.value = fromIso;
  toInput.value = toIso;
  fromInput.dispatchEvent(new Event('change', { bubbles: true }));
  toInput.dispatchEvent(new Event('change', { bubbles: true }));

  if (context === 'filter') {
    syncFilterPeriodTrigger();
  } else {
    fuelDateFrom = fromIso;
    fuelDateTo = toIso;

    try {
      localStorage.setItem('fuelDateFrom', fuelDateFrom);
      localStorage.setItem('fuelDateTo', fuelDateTo);
    } catch (e) {}

    syncFuelPeriodTrigger();
    updateFuelConsumptionUI(expenses);
  }

  closeFuelPeriodPicker();
}

function initFuelPeriodPickerTrigger() {
  createFuelPeriodPickerModal();

  const trigger = document.getElementById('fuel-period-trigger');
  const fromInput = document.getElementById('fuel-date-from');
  const toInput = document.getElementById('fuel-date-to');

  if (!trigger || !fromInput || !toInput) return;
  if (trigger.dataset.fuelPeriodReady === '1') {
    syncFuelPeriodTrigger();
    return;
  }

  trigger.dataset.fuelPeriodReady = '1';
  if (!document.documentElement.dataset.fuelPeriodDelegatedReady) {
    document.documentElement.dataset.fuelPeriodDelegatedReady = '1';
    document.addEventListener('click', (event) => {
      const delegatedTrigger = event.target.closest?.('#fuel-period-trigger');
      if (!delegatedTrigger) return;
      event.preventDefault();
      openFuelPeriodPicker('fuel');
    });
  }

  syncFuelPeriodTrigger();


  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && fuelPeriodPickerState?.modal?.classList.contains('show')) {
      closeFuelPeriodPicker();
    }
  });
}

function getSelectedFilterCategories() {
  const allInput = document.getElementById('filter-category-all');
  const selected = Array.from(
    document.querySelectorAll('[data-filter-category]:checked')
  ).map((input) => input.value);

  if (allInput?.checked || selected.length === 0) {
    return [];
  }

  return selected;
}

function syncFilterCategoryUI() {
  const trigger = document.getElementById('filter-category-trigger');
  const display = document.getElementById('filter-category-display');
  const allInput = document.getElementById('filter-category-all');
  const categoryInputs = Array.from(document.querySelectorAll('[data-filter-category]'));

  if (!trigger || !display || !allInput) return;

  const selected = categoryInputs.filter((input) => input.checked);

  if (allInput.checked || selected.length === 0) {
    display.textContent = 'Все категории';
    trigger.classList.remove('is-selected');
    return;
  }

  trigger.classList.add('is-selected');

  if (selected.length === 1) {
    display.textContent = selected[0].value;
  } else if (selected.length <= 3) {
    display.textContent = selected.map((input) => input.value).join(', ');
  } else {
    display.textContent = `${selected.length} категорий`;
  }
}

function initFilterCategoryMultiSelect() {
  const trigger = document.getElementById('filter-category-trigger');
  const panel = document.getElementById('filter-category-panel');
  const allInput = document.getElementById('filter-category-all');
  const categoryInputs = Array.from(document.querySelectorAll('[data-filter-category]'));

  if (!trigger || !panel || !allInput || !categoryInputs.length) return;
  if (trigger.dataset.filterCategoryReady === '1') {
    syncFilterCategoryUI();
    return;
  }

  trigger.dataset.filterCategoryReady = '1';

  const closePanel = () => {
    panel.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
  };

  const openPanel = () => {
    panel.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
  };

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    const isOpen = !panel.classList.contains('hidden');
    if (isOpen) closePanel();
    else openPanel();
  });

  allInput.addEventListener('change', () => {
    if (allInput.checked) {
      categoryInputs.forEach((input) => {
        input.checked = false;
      });
    } else if (!categoryInputs.some((input) => input.checked)) {
      allInput.checked = true;
    }
    syncFilterCategoryUI();
  });

  categoryInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const anySelected = categoryInputs.some((item) => item.checked);
      allInput.checked = !anySelected;
      syncFilterCategoryUI();
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('.filter-category-multi')) {
      closePanel();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanel();
  });

  syncFilterCategoryUI();

  if (window.lucide) {
    lucide.createIcons();
  }
}

function initFilterControls() {
  createFuelPeriodPickerModal();

  const periodTrigger = document.getElementById('filter-period-trigger');
  const fromInput = document.getElementById('filter-from');
  const toInput = document.getElementById('filter-to');

  if (periodTrigger && fromInput && toInput && periodTrigger.dataset.filterPeriodReady !== '1') {
    periodTrigger.dataset.filterPeriodReady = '1';
    periodTrigger.addEventListener('click', (event) => {
      event.preventDefault();
      periodTrigger.blur();
      openFuelPeriodPicker('filter');
    });

    fromInput.addEventListener('change', syncFilterPeriodTrigger);
    toInput.addEventListener('change', syncFilterPeriodTrigger);
  }

  syncFilterPeriodTrigger();
  initFilterCategoryMultiSelect();
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

  initFuelPeriodPickerTrigger();

  // The whole control opens the wheel picker. On touch screens it is much
  // easier and more reliable than having to hit the tiny number input itself.
  if (fillsControl.dataset.wheelTriggerReady !== "1") {
    fillsControl.dataset.wheelTriggerReady = "1";
    fillsControl.setAttribute("role", "button");
    fillsControl.setAttribute("tabindex", "0");

    const openFillsWheel = (event) => {
      if (event) event.preventDefault();
      fillsCountInput.blur();
      openWheelPicker("fuelFills", fillsCountInput);
    };

    fillsControl.addEventListener("click", (event) => {
      // The input has its own wheel binding. Let that handler own direct input
      // clicks so one tap can never open the modal twice.
      if (event.target === fillsCountInput) return;
      openFillsWheel(event);
    });

    fillsControl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        openFillsWheel(event);
      }
    });
  }

  // 1) Проставляем сохранённые значения в инпуты
  fillsCountInput.value = String(isFinite(fuelFillsCount) && fuelFillsCount > 0 ? fuelFillsCount : 10);
  dateFromInput.value = fuelDateFrom || "";
  dateToInput.value = fuelDateTo || "";
  syncFuelPeriodTrigger();

  // 2) Проставляем выбранный режим
  modeRadios.forEach(r => {
    r.checked = r.value === fuelMode;
  });

  // 3) Показать/скрыть нужный блок
  const applyVisibility = () => {
  fillsControl.style.display = fuelMode === "fills" ? "flex" : "none";
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
    syncFuelPeriodTrigger();
    updateFuelConsumptionUI(expenses);
  });

  dateToInput.addEventListener("change", () => {
    fuelDateTo = dateToInput.value || "";
    try { localStorage.setItem("fuelDateTo", fuelDateTo); } catch (e) {}
    syncFuelPeriodTrigger();
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


function getFuelComparisonRawPoints(allPoints) {
  if (!Array.isArray(allPoints) || allPoints.length === 0) return [];

  if (fuelMode === "fills") {
    const n = isFinite(fuelFillsCount) ? Math.max(3, Math.floor(fuelFillsCount)) : 10;
    const currentStart = Math.max(0, allPoints.length - n);
    const previousStart = Math.max(0, currentStart - n);
    return allPoints.slice(previousStart, currentStart);
  }

  if (!fuelDateFrom || !fuelDateTo) return [];

  const from = new Date(`${fuelDateFrom}T12:00:00`);
  const to = new Date(`${fuelDateTo}T12:00:00`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) return [];

  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = Math.max(1, Math.round((to - from) / dayMs) + 1);
  const previousTo = new Date(from.getTime() - dayMs);
  const previousFrom = new Date(previousTo.getTime() - (spanDays - 1) * dayMs);

  const toIso = getLocalISODate(previousTo);
  const fromIso = getLocalISODate(previousFrom);

  return allPoints.filter((point) => point.date >= fromIso && point.date <= toIso);
}

function getFuelValidValues(points) {
  return (points || [])
    .filter((point) => point.status !== "anomaly" && Number.isFinite(point.l100))
    .map((point) => Number(point.l100));
}

function updateFuelDashboardMeta(points, avgValid) {
  const gauge = document.getElementById('fuel-gauge');
  const needle = document.getElementById('fuel-gauge-needle');
  const gaugeMinLabel = document.getElementById('fuel-gauge-min-label');
  const gaugeMaxLabel = document.getElementById('fuel-gauge-max-label');
  const pointCountEl = document.getElementById('fuel-point-count');
  const anomalyCountEl = document.getElementById('fuel-anomaly-count');
  const minEl = document.getElementById('fuel-min-value');
  const maxEl = document.getElementById('fuel-max-value');

  const validValues = getFuelValidValues(points);
  const anomalyCount = (points || []).filter((point) => point.status === 'anomaly').length;
  const minValue = validValues.length ? Math.min(...validValues) : null;
  const maxValue = validValues.length ? Math.max(...validValues) : null;

  if (pointCountEl) pointCountEl.textContent = String((points || []).length);
  if (anomalyCountEl) anomalyCountEl.textContent = String(anomalyCount);
  if (minEl) minEl.textContent = minValue == null ? '—' : minValue.toFixed(1);
  if (maxEl) maxEl.textContent = maxValue == null ? '—' : maxValue.toFixed(1);

  if (gauge && needle) {
    const gaugeMin = 5;
    const safeAvg = Number.isFinite(avgValid) ? avgValid : gaugeMin;

    // Keep the familiar 5–10 scale in normal use, but expand it automatically
    // when the average goes above 10 so the needle never gets pinned falsely.
    const gaugeMax = safeAvg <= 10 ? 10 : Math.max(15, Math.ceil(safeAvg / 5) * 5);
    const ratio = clamp((safeAvg - gaugeMin) / (gaugeMax - gaugeMin), 0, 1);
    const angle = -90 + ratio * 180;

    needle.style.setProperty('--fuel-gauge-angle', `${angle}deg`);
    gauge.classList.toggle('is-empty', !Number.isFinite(avgValid));

    if (gaugeMinLabel) gaugeMinLabel.textContent = gaugeMin.toFixed(1);
    if (gaugeMaxLabel) gaugeMaxLabel.textContent = gaugeMax.toFixed(1);
  }
}

function updateFuelChartDates(points) {
  const startEl = document.getElementById('fuel-chart-date-start');
  const midEl = document.getElementById('fuel-chart-date-mid');
  const endEl = document.getElementById('fuel-chart-date-end');

  if (!points?.length) {
    if (startEl) startEl.textContent = '—';
    if (midEl) midEl.textContent = '—';
    if (endEl) endEl.textContent = '—';
    return;
  }

  const middleIndex = Math.floor((points.length - 1) / 2);
  if (startEl) startEl.textContent = formatDate(points[0].date);
  if (midEl) midEl.textContent = formatDate(points[middleIndex].date);
  if (endEl) endEl.textContent = formatDate(points[points.length - 1].date);
}

function getFuelPointStatusColor(status) {
  if (status === 'good') return '#35e8a5';
  if (status === 'normal') return '#20d9d2';
  if (status === 'high') return '#ffab45';
  return '#ff4f64';
}

function formatFuelScrubberPoint(point) {
  if (!point) return '—';

  const l100 = Number.isFinite(point.l100) ? point.l100.toFixed(2) : '—';
  const distance = Number.isFinite(point.distance) ? `${Math.round(point.distance)} км` : '— км';
  const liters = Number.isFinite(point.liters) ? `${Number(point.liters).toFixed(1)} л` : '— л';
  const status = FUEL_LABELS[point.status] || '';
  const reason = point.reason ? ` · ${point.reason}` : '';

  return `${l100} л/100 · ${distance} / ${liters}${status ? ` · ${status}` : ''}${reason}`;
}

function getFuelChartPointGeometry() {
  const chartBox = document.querySelector('.fuel-digital-chart');
  const chartEl = document.getElementById('fuel-line-chart');
  if (!chartBox || !chartEl) return null;

  const boxRect = chartBox.getBoundingClientRect();

  // Use the actual rendered marker centres first. This keeps the scrubber
  // aligned with ApexCharts even if its internal plot padding changes.
  const markerCenters = Array.from(
    chartEl.querySelectorAll('.apexcharts-marker')
  )
    .map((marker) => {
      const rect = marker.getBoundingClientRect();
      if (!rect.width && !rect.height) return null;
      return rect.left + rect.width / 2 - boxRect.left;
    })
    .filter((value) => Number.isFinite(value));

  if (markerCenters.length >= 2) {
    return {
      left: Math.min(...markerCenters),
      right: Math.max(...markerCenters)
    };
  }

  // Fallback for the short moment before SVG markers are painted.
  const chartRect = chartEl.getBoundingClientRect();
  const globals = fuelChart?.w?.globals;
  const translateX = Number(globals?.translateX);
  const gridWidth = Number(globals?.gridWidth);

  if (Number.isFinite(translateX) && Number.isFinite(gridWidth) && gridWidth > 0) {
    const left = chartRect.left - boxRect.left + translateX;
    return { left, right: left + gridWidth };
  }

  return {
    left: chartRect.left - boxRect.left,
    right: chartRect.right - boxRect.left
  };
}

function syncFuelScrubberGeometry() {
  const chartBox = document.querySelector('.fuel-digital-chart');
  const scrubber = document.getElementById('fuel-scrubber');
  const wrap = document.getElementById('fuel-scrubber-wrap');
  if (!chartBox || !scrubber || !wrap) return;

  const geometry = getFuelChartPointGeometry();
  if (!geometry) return;

  const chartStyle = getComputedStyle(chartBox);
  const contentLeft = parseFloat(chartStyle.paddingLeft) || 0;
  const thumbSize = 20;
  const plotWidth = Math.max(0, geometry.right - geometry.left);

  // A range thumb can only move between half-thumb insets. Extend the range
  // itself by one thumb diameter so its centre endpoints land exactly on the
  // first and last ApexCharts points.
  wrap.style.width = `${plotWidth + thumbSize}px`;
  wrap.style.marginLeft = `${geometry.left - contentLeft - thumbSize / 2}px`;
  wrap.style.marginRight = '0';
  wrap.dataset.plotLeft = String(geometry.left);
  wrap.dataset.plotRight = String(geometry.right);
}

let fuelScrubberGeometryFrame = 0;
let fuelScrubberGeometryTimer = 0;

function scheduleFuelScrubberGeometrySync() {
  if (fuelScrubberGeometryFrame) cancelAnimationFrame(fuelScrubberGeometryFrame);
  if (fuelScrubberGeometryTimer) clearTimeout(fuelScrubberGeometryTimer);

  // First pass: update on the very next painted frame. This makes the slider
  // jump to its new width immediately when the number of fills changes.
  fuelScrubberGeometryFrame = requestAnimationFrame(() => {
    fuelScrubberGeometryFrame = 0;
    syncFuelScrubberGeometry();
    updateFuelScrubberVisual(fuelScrubberIndex);

    // Second pass: Apex can finish SVG layout one frame later on Safari.
    requestAnimationFrame(() => {
      syncFuelScrubberGeometry();
      updateFuelScrubberVisual(fuelScrubberIndex);
    });
  });

  // Small safety pass for font/layout changes. No long retry loop.
  fuelScrubberGeometryTimer = window.setTimeout(() => {
    fuelScrubberGeometryTimer = 0;
    syncFuelScrubberGeometry();
    updateFuelScrubberVisual(fuelScrubberIndex);
  }, 120);
}

function updateFuelScrubberVisual(index, { haptic = false } = {}) {
  const scrubber = document.getElementById('fuel-scrubber');
  const wrap = document.getElementById('fuel-scrubber-wrap');
  const info = document.getElementById('fuel-scrubber-info');
  const valueEl = document.getElementById('fuel-scrubber-value');
  const dot = document.getElementById('fuel-scrubber-status');
  const guide = document.getElementById('fuel-scrubber-guide');

  const count = fuelScrubberPoints.length;
  if (!scrubber || !wrap || !info || !valueEl || !dot || !guide) return;

  if (!count) {
    scrubber.min = '0';
    scrubber.max = '0';
    scrubber.value = '0';
    scrubber.disabled = true;
    wrap.classList.add('is-empty');
    info.classList.add('is-empty');
    guide.classList.add('is-hidden');
    valueEl.textContent = 'Нет данных';
    return;
  }

  const nextIndex = clamp(Math.round(Number(index) || 0), 0, count - 1);
  const changed = nextIndex !== fuelScrubberIndex;
  fuelScrubberIndex = nextIndex;

  scrubber.disabled = count <= 1;
  scrubber.min = '0';
  scrubber.max = String(Math.max(0, count - 1));
  scrubber.step = '1';
  scrubber.value = String(nextIndex);

  const progress = count <= 1 ? 0 : nextIndex / (count - 1);
  const percent = progress * 100;
  scrubber.style.setProperty('--fuel-scrubber-progress', `${percent}%`);
  wrap.style.setProperty('--fuel-scrubber-progress', `${percent}%`);

  // The guide follows the real Apex plot width, not the range element width.
  // This keeps it directly under the selected graph point from first to last.
  const geometry = getFuelChartPointGeometry();
  if (geometry) {
    guide.style.left = `${geometry.left + progress * (geometry.right - geometry.left)}px`;
    guide.style.transform = 'none';
  }

  const point = fuelScrubberPoints[nextIndex];
  valueEl.textContent = formatFuelScrubberPoint(point);
  dot.style.background = getFuelPointStatusColor(point.status);
  dot.style.boxShadow = `0 0 12px ${getFuelPointStatusColor(point.status)}`;

  wrap.classList.remove('is-empty');
  info.classList.remove('is-empty');
  guide.classList.remove('is-hidden');

  if (haptic && changed) wheelHaptic();
}

function initFuelScrubber() {
  if (fuelScrubberReady) return;

  const scrubber = document.getElementById('fuel-scrubber');
  if (!scrubber) return;

  fuelScrubberReady = true;

  let frameId = 0;
  let pendingIndex = 0;

  const flush = () => {
    frameId = 0;
    updateFuelScrubberVisual(pendingIndex, { haptic: true });
  };

  const handle = () => {
    pendingIndex = Number(scrubber.value) || 0;

    // Range inputs can emit dozens of events per second while dragging.
    // Batch them to one UI update per animation frame so mobile Safari and
    // desktop browsers never get flooded with synchronous work.
    if (!frameId) {
      frameId = requestAnimationFrame(flush);
    }
  };

  scrubber.addEventListener('input', handle);
  scrubber.addEventListener('change', handle);

  window.addEventListener('resize', scheduleFuelScrubberGeometrySync, { passive: true });
}

function resetFuelScrubber(points) {
  initFuelScrubber();
  fuelScrubberPoints = Array.isArray(points) ? points : [];
  fuelScrubberIndex = 0;
  // Start from the leftmost point every time the chart dataset changes.
  requestAnimationFrame(() => updateFuelScrubberVisual(0));
  scheduleFuelScrubberGeometrySync();
}

function renderFuelLineChart(points, avgLine) {
  const el = document.querySelector('#fuel-line-chart');
  if (!el) return;

  updateFuelChartDates(points);

  const series = [{
    name: 'л/100',
    data: (points || []).map((point) => Number(point.l100.toFixed(2)))
  }];

  const discreteMarkers = (points || []).map((point, index) => ({
    seriesIndex: 0,
    dataPointIndex: index,
    fillColor: getFuelPointStatusColor(point.status),
    strokeColor: '#eefeff',
    size: point.status === 'anomaly' ? 5 : 4
  }));

  const yValues = (points || [])
    .map((point) => Number(point.l100))
    .filter(Number.isFinite);

  const avgGuideValues = Number.isFinite(avgLine)
    ? [-1.0, -0.5, 0, 0.5, 1.0].map((offset) => avgLine + offset)
    : [];

  const scaleValues = [...yValues, ...avgGuideValues];
  let yMin = scaleValues.length ? Math.min(...scaleValues) : undefined;
  let yMax = scaleValues.length ? Math.max(...scaleValues) : undefined;

  if (Number.isFinite(yMin) && Number.isFinite(yMax)) {
    const span = Math.max(0.5, yMax - yMin);
    const padding = Math.max(0.12, span * 0.08);
    yMin = Math.floor((yMin - padding) * 10) / 10;
    yMax = Math.ceil((yMax + padding) * 10) / 10;
  }

  const makeYLabel = (value, offset = 0) => {
    const isAverage = Math.abs(offset) < 0.001;
    const isWholeLiter = Math.abs(offset) === 1;

    return {
      y: Number(value.toFixed(3)),
      borderColor: isAverage
        ? 'rgba(218, 241, 242, 0.48)'
        : isWholeLiter
          ? 'rgba(190, 220, 222, 0.16)'
          : 'rgba(190, 220, 222, 0.11)',
      strokeDashArray: isAverage ? 5 : 0,
      borderWidth: 1,
      label: {
        show: true,
        position: 'left',
        offsetX: 3,
        borderColor: 'transparent',
        text: value.toFixed(1),
        style: {
          background: 'rgba(12, 25, 31, 0.72)',
          color: isAverage
            ? 'rgba(235,250,250,.90)'
            : 'rgba(190,211,214,.62)',
          fontSize: isAverage ? '9px' : '8px',
          fontWeight: isAverage ? 700 : 600,
          padding: { left: 2, right: 2, top: 0, bottom: 0 }
        }
      }
    };
  };

  const avgAnnotation = Number.isFinite(avgLine)
    ? [-1.0, -0.5, 0, 0.5, 1.0].map((offset) =>
        makeYLabel(avgLine + offset, offset)
      )
    : [];

  const options = {
    chart: {
      type: 'area',
      height: 128,
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      sparkline: { enabled: true },
      events: {
        dataPointSelection: (_event, _chartContext, config) => {
          if (Number.isInteger(config?.dataPointIndex) && config.dataPointIndex >= 0) {
            updateFuelScrubberVisual(config.dataPointIndex);
          }
        }
      }
    },
    series,
    colors: ['#27e3dd'],
    stroke: {
      width: 2.5,
      curve: 'smooth',
      lineCap: 'round'
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        type: 'vertical',
        shadeIntensity: 0.15,
        gradientToColors: ['#0aa7a5'],
        inverseColors: false,
        opacityFrom: 0.30,
        opacityTo: 0.012,
        stops: [0, 70, 100]
      }
    },
    annotations: {
      yaxis: avgAnnotation
    },
    markers: {
      size: 3.5,
      strokeWidth: 2,
      strokeColors: '#eaffff',
      hover: { sizeOffset: 2 },
      discrete: discreteMarkers
    },
    states: {
      active: {
        allowMultipleDataPointsSelection: false,
        filter: { type: 'none' }
      }
    },
    dataLabels: { enabled: false },
    grid: {
      show: false,
      padding: { left: 24, right: 3, top: 8, bottom: 2 }
    },
    yaxis: {
      min: yMin,
      max: yMax,
      labels: { show: false }
    },
    xaxis: {
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false }
    },
    tooltip: {
      theme: 'dark',
      x: { show: false },
      marker: { show: true },
      y: {
        formatter: (value, opts) => {
          const point = points?.[opts.dataPointIndex];
          if (!point) return `${Number(value).toFixed(2)} л/100`;
          const dist = Math.round(point.distance);
          const liters = Number(point.liters).toFixed(1);
          const status = FUEL_LABELS[point.status] || '';
          const reason = point.reason ? ` · ${point.reason}` : '';
          return `${Number(value).toFixed(2)} л/100 · ${dist} км / ${liters} л · ${status}${reason}`;
        }
      }
    }
  };

  const finishChartUpdate = () => {
    resetFuelScrubber(points || []);
    scheduleFuelScrubberGeometrySync();
  };

  if (fuelChart) {
    // One redraw, no animation. Previously Apex was performing two animated
    // redraws (options + series), so the scrubber could keep geometry from the
    // previous dataset until the SVG finally settled.
    const updateResult = fuelChart.updateOptions(options, true, false);
    Promise.resolve(updateResult).then(finishChartUpdate).catch(finishChartUpdate);
  } else {
    fuelChart = new ApexCharts(el, options);
    Promise.resolve(fuelChart.render()).then(finishChartUpdate).catch(finishChartUpdate);
  }
}

function updateFuelConsumptionUI(fullData) {
  const avgEl = document.getElementById('fuel-consumption-avg');
  if (!avgEl) return;

  const allPoints = computeFuelTankPoints(fullData);
  let pointsRaw = [];

  if (fuelMode === 'fills') {
    const n = isFinite(fuelFillsCount) ? Math.max(3, Math.floor(fuelFillsCount)) : 10;
    pointsRaw = allPoints.slice(-n);
  } else {
    const from = fuelDateFrom || '';
    const to = fuelDateTo || '';
    pointsRaw = allPoints.filter((point) => {
      if (from && point.date < from) return false;
      if (to && point.date > to) return false;
      return true;
    });
  }

  if (!pointsRaw.length) {
    avgEl.textContent = '—';
    updateFuelDashboardMeta([], null);
    renderFuelLineChart([], null);
    return;
  }

  const avgValid = computeAvgFromValidPoints(pointsRaw);
  const points = pointsRaw.map((point) => classifyFuelPoint({ ...point }, avgValid));

  avgEl.textContent = Number.isFinite(avgValid) ? avgValid.toFixed(2) : '—';

  updateFuelDashboardMeta(points, avgValid);
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
  document.getElementById('date').value = exp.date || getLocalISODate();
  syncExpenseDateTrigger();
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
  const date = document.getElementById('date').value || getLocalISODate();
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
  const from = document.getElementById("filter-from")?.value || "";
  const to = document.getElementById("filter-to")?.value || "";
  const tag = document.getElementById("filter-tag")?.value.replace('#', '') || "";
  const selectedCategories = getSelectedFilterCategories();
  const rowStart = parseInt(document.getElementById("filter-row-start")?.value);
  const rowEnd = parseInt(document.getElementById("filter-row-end")?.value);

  let filtered = expenses;
  if (from) filtered = filtered.filter(e => e.date >= from);
  if (to) filtered = filtered.filter(e => e.date <= to);
  if (tag) filtered = filtered.filter(e => e.tag === tag);
  if (selectedCategories.length) {
    const allowedCategories = new Set(selectedCategories);
    filtered = filtered.filter(e => allowedCategories.has(e.category));
  }
  if (!isNaN(rowStart) && !isNaN(rowEnd)) filtered = filtered.slice(rowStart - 1, rowEnd);

  renderExpenses(filtered, true);
  loadReminders();
}

function updateChart(data, total) {
  const container = document.getElementById("category-spend-bars");
  if (!container) return;

  // Keep every current category visible, even when its filtered amount is zero.
  const categorySelect = document.getElementById("category");
  const knownCategories = categorySelect
    ? Array.from(categorySelect.options)
        .map(option => option.value || option.textContent || "")
        .map(value => value.trim())
        .filter(Boolean)
    : [];

  const categoriesMap = new Map(
    knownCategories.map(category => [category, 0])
  );

  data.forEach(entry => {
    const category = String(entry.category || "Другое").trim() || "Другое";
    const value = Number(entry.amount);
    const safeValue = Number.isFinite(value) ? value : 0;

    categoriesMap.set(
      category,
      (categoriesMap.get(category) || 0) + safeValue
    );
  });

  const sortedEntries = Array.from(categoriesMap.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.label.localeCompare(b.label, "ru");
    });

  const totalSum = sortedEntries.reduce((sum, entry) => sum + entry.value, 0);
  const maxValue = sortedEntries.reduce((max, entry) => Math.max(max, entry.value), 0);

  container.innerHTML = "";

  sortedEntries.forEach((entry, index) => {
    const percent = totalSum > 0 ? (entry.value / totalSum) * 100 : 0;
    const relativeWidth = maxValue > 0 ? (entry.value / maxValue) * 100 : 0;

    const row = document.createElement("div");
    row.className = "category-spend-row";

    const safeWidth = entry.value > 0
      ? Math.max(relativeWidth, 1.5)
      : 0;

    row.innerHTML = `
      <div class="category-spend-track">
        <div
          class="category-spend-fill"
          style="--category-bar-width: ${safeWidth.toFixed(2)}%; --category-bar-delay: ${index * 22}ms;"
          aria-hidden="true"
        ></div>

        <div class="category-spend-content">
          <span class="category-spend-name">${entry.label}</span>
          <span class="category-spend-values">
            <span class="category-spend-amount">€${entry.value.toFixed(2)}</span>
            <span class="category-spend-percent">${percent.toFixed(1)}%</span>
          </span>
        </div>
      </div>
    `;

    container.appendChild(row);
  });
}


function resetForm() {
  if (!form) return;

  form.reset();
  document.getElementById("edit-id").value = "";

  const today = getLocalISODate();
  const dateInput = document.getElementById("date");

  if (dateInput) {
    dateInput.value = today;
    syncExpenseDateTrigger();
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
  const today = getLocalISODate();
  dateInput.value = today;
  syncExpenseDateTrigger();
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
    console.error(
      "Firestore не инициализирован (loadReminders)"
    );

    return;
  }


  db
    .collection("users")
    .doc(profileCode)
    .collection("reminders")
    .onSnapshot(snapshot => {

      const reminders =
        snapshot.docs.map(
          doc => ({
            id: doc.id,
            ...doc.data()
          })
        );


      const processed =
        processReminders(
          reminders
        );


      renderCarReminderBoard(
        processed
      );

    });

}

function processReminders(reminders) {
  const lastMileage = expenses.reduce(
    (max, e) =>
      e.mileage && Number(e.mileage) > max
        ? Number(e.mileage)
        : max,
    0
  );

  const today = new Date();

  return reminders.map(r => {
    let kmLeft = null;
    let daysLeft = null;
    let text = "";
    let icon = "circle";
    let status = "gray";

    if (r.mileage && r.interval) {
      kmLeft =
        (Number(r.mileage) + Number(r.interval)) -
        lastMileage;
    }

    if (r.dateEnd) {
      const d1 = new Date(r.dateEnd);

      daysLeft = Math.ceil(
        (d1 - today) /
        (1000 * 60 * 60 * 24)
      );
    }

    const details = [];

    if (kmLeft !== null) {
      details.push(
        `${kmLeft >= 0 ? "" : "-"}${kmLeft} км`
      );
    }

    if (daysLeft !== null) {
      details.push(
        `${daysLeft >= 0 ? "" : "-"}${daysLeft} дней`
      );
    }

    text = `${r.tag} — ${details.join(" / ")}`;

    if (
      (kmLeft !== null && kmLeft < 0) ||
      (daysLeft !== null && daysLeft < 0)
    ) {
      status = "expired";
      icon = "alert-triangle";

    } else if (
      (kmLeft !== null && kmLeft <= 500) ||
      (daysLeft !== null && daysLeft <= 7)
    ) {
      status = "red";
      icon = "alert-triangle";

    } else if (
      (kmLeft !== null && kmLeft <= 1000) ||
      (daysLeft !== null && daysLeft <= 21)
    ) {
      status = "orange";
      icon = "alert-triangle";

    } else if (
      (kmLeft !== null && kmLeft <= 2000) ||
      (daysLeft !== null && daysLeft <= 60)
    ) {
      status = "yellow";
      icon = "alert-triangle";
    }

  return {
  id: r.id,

  tag: r.tag || "Напоминание",

  status,
  icon,
  text,

  kmLeft,
  daysLeft,

  mileage:
    r.mileage !== null &&
    r.mileage !== undefined &&
    r.mileage !== ""
      ? Number(r.mileage)
      : null,

  interval:
    r.interval !== null &&
    r.interval !== undefined &&
    r.interval !== ""
      ? Number(r.interval)
      : null,

  dateStart: r.dateStart || "",
  dateEnd: r.dateEnd || "",

 mapLayout: r.mapLayout || null,

mapIcon:
  r.mapIcon || "",

mapLinked:
  typeof r.mapLinked === "boolean"
    ? r.mapLinked
    : null,

imageUrl: r.imageUrl || ""
};

  }).sort((a, b) => {
    const statusOrder = {
      expired: 0,
      red: 1,
      orange: 2,
      yellow: 3,
      gray: 4
    };

    if (
      statusOrder[a.status] !==
      statusOrder[b.status]
    ) {
      return (
        statusOrder[a.status] -
        statusOrder[b.status]
      );
    }

    const aMatch =
      a.text.match(/-?\d+/);

    const bMatch =
      b.text.match(/-?\d+/);

    const aNum =
      aMatch
        ? Math.abs(Number(aMatch[0]))
        : 99999;

    const bNum =
      bMatch
        ? Math.abs(Number(bMatch[0]))
        : 99999;

    return aNum - bNum;
  });
}

/* =========================================================
   🛠 CAR MAP EDITOR
   ========================================================= */

function clampPercent(
  value,
  min = 0,
  max = 100
) {

  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}


function findCarReminderById(id) {

  return carMapEditorState
    .notifications
    .find(
      item =>
        item.id === id
    );
}


function findCarReminderIndex(id) {

  return carMapEditorState
    .notifications
    .findIndex(
      item =>
        item.id === id
    );
}


function getCarEditorLayoutById(id) {

  const reminder =
    findCarReminderById(id);


  const index =
    findCarReminderIndex(id);


  if (
    !reminder ||
    index < 0
  ) {
    return null;
  }


  return getCarReminderLayout(
    reminder,
    index
  );
}


function updateCarReminderVisual(
  id,
  layout
) {

  const root =
    document.getElementById(
      "car-reminder-map"
    );


  if (!root) {
    return;
  }


  const card =
    root.querySelector(
      `.car-reminder-card[data-reminder-id="${id}"]`
    );


  const anchor =
    root.querySelector(
      `.car-reminder-anchor-handle[data-reminder-id="${id}"]`
    );


  const line =
    root.querySelector(
      `.car-reminder-line[data-reminder-id="${id}"]`
    );


  if (card) {

    card.style.setProperty(
      "--card-x",
      `${layout.x}%`
    );


    card.style.setProperty(
      "--card-y",
      `${layout.y}%`
    );

  }


  if (
    anchor &&
    layout.anchorX !== undefined &&
    layout.anchorY !== undefined
  ) {

    anchor.style.setProperty(
      "--anchor-x",
      `${layout.anchorX}%`
    );


    anchor.style.setProperty(
      "--anchor-y",
      `${layout.anchorY}%`
    );

  }


  if (
    line &&
    layout.anchorX !== undefined &&
    layout.anchorY !== undefined
  ) {

    const start =
      getCarReminderLineStart(
        layout
      );


    line.setAttribute(
      "x1",
      start.x
    );


    line.setAttribute(
      "y1",
      start.y
    );


    line.setAttribute(
      "x2",
      layout.anchorX
    );


    line.setAttribute(
      "y2",
      layout.anchorY
    );

  }

}


function updateCarMapDraft(
  id,
  values
) {

  const previous =
    carMapEditorState
      .draft
      .get(id) || {};


  carMapEditorState
    .draft
    .set(
      id,
      {
        ...previous,
        ...values
      }
    );


  carMapEditorState
    .dirtyIds
    .add(id);

}


function startCarMapCardDrag(
  event,
  card
) {

  if (
    !carMapEditorState.enabled
  ) {
    return;
  }


  event.preventDefault();


  const id =
    card.dataset.reminderId;


  const layout =
    getCarEditorLayoutById(id);


  if (!layout) {
    return;
  }


  const scene =
    document.querySelector(
      ".car-reminder-map__scene"
    );


  if (!scene) {
    return;
  }


  const rect =
    scene.getBoundingClientRect();


  const startPointerX =
    event.clientX;


  const startPointerY =
    event.clientY;


  const startCardX =
    layout.x;


  const startCardY =
    layout.y;


  card.classList.add(
    "is-dragging"
  );


  card.setPointerCapture?.(
    event.pointerId
  );


  const move = e => {

    const dx =
      (
        e.clientX -
        startPointerX
      ) /
      rect.width *
      100;


    const dy =
      (
        e.clientY -
        startPointerY
      ) /
      rect.height *
      100;


    const cardX =
      clampPercent(
        startCardX + dx,
        0,
        100 - layout.w
      );


    const cardY =
      clampPercent(
        startCardY + dy,
        0,
        100 - layout.h
      );


    const current =
      {
        ...layout,
        x: cardX,
        y: cardY
      };


    updateCarMapDraft(
      id,
      {
        cardX,
        cardY
      }
    );


    updateCarReminderVisual(
      id,
      current
    );

  };


  const stop = () => {

    card.classList.remove(
      "is-dragging"
    );


    card.removeEventListener(
      "pointermove",
      move
    );


    card.removeEventListener(
      "pointerup",
      stop
    );


    card.removeEventListener(
      "pointercancel",
      stop
    );

  };


  card.addEventListener(
    "pointermove",
    move
  );


  card.addEventListener(
    "pointerup",
    stop
  );


  card.addEventListener(
    "pointercancel",
    stop
  );

}


function startCarMapAnchorDrag(
  event,
  anchor
) {

  if (
    !carMapEditorState.enabled
  ) {
    return;
  }


  event.preventDefault();

  event.stopPropagation();


  const id =
    anchor.dataset.reminderId;


  const layout =
    getCarEditorLayoutById(id);


  if (!layout) {
    return;
  }


  const scene =
    document.querySelector(
      ".car-reminder-map__scene"
    );


  if (!scene) {
    return;
  }


  const rect =
    scene.getBoundingClientRect();


  anchor.classList.add(
    "is-dragging"
  );


  anchor.setPointerCapture?.(
    event.pointerId
  );


  const move = e => {

    const anchorX =
      clampPercent(
        (
          (
            e.clientX -
            rect.left
          ) /
          rect.width
        ) *
        100
      );


    const anchorY =
      clampPercent(
        (
          (
            e.clientY -
            rect.top
          ) /
          rect.height
        ) *
        100
      );


    const current =
      {
        ...layout,
        anchorX,
        anchorY
      };


    updateCarMapDraft(
      id,
      {
        anchorX,
        anchorY
      }
    );


    updateCarReminderVisual(
      id,
      current
    );

  };


  const stop = () => {

    anchor.classList.remove(
      "is-dragging"
    );


    anchor.removeEventListener(
      "pointermove",
      move
    );


    anchor.removeEventListener(
      "pointerup",
      stop
    );


    anchor.removeEventListener(
      "pointercancel",
      stop
    );

  };


  anchor.addEventListener(
    "pointermove",
    move
  );


  anchor.addEventListener(
    "pointerup",
    stop
  );


  anchor.addEventListener(
    "pointercancel",
    stop
  );

}


function setCarMapEditorButtonState(
  editing
) {

  const button =
    document.getElementById(
      "car-map-edit"
    );


  if (!button) {
    return;
  }


  button.innerHTML =
    editing
      ? '<span data-lucide="check"></span>'
      : '<span data-lucide="move"></span>';


  button.title =
    editing
      ? "Сохранить расположение"
      : "Настроить расположение";


  button.setAttribute(
    "aria-label",
    button.title
  );


  button.classList.toggle(
    "save",
    editing
  );


  if (
    typeof lucide !==
    "undefined"
  ) {

    lucide.createIcons();

  }

}


function toggleCarMapEditor() {

  if (
    carMapEditorState.enabled
  ) {

    saveCarMapEditor();

  } else {

    enableCarMapEditor();

  }

}


function enableCarMapEditor() {

  carMapEditorState.enabled =
    true;


  closeCarReminderActions();


  carMapEditorState
    .draft
    .clear();


  carMapEditorState
    .dirtyIds
    .clear();


  const root =
    document.getElementById(
      "car-reminder-map"
    );


  root?.classList.add(
    "editing"
  );


  setCarMapEditorButtonState(
    true
  );


  showToast(
    "Перетащи карточку или точку"
  );

}

function cancelCarMapEditor() {

  carMapEditorState.enabled =
    false;


  carMapEditorState.draft.clear();

  carMapEditorState.dirtyIds.clear();


  document
    .getElementById(
      "car-map-edit"
    )
    ?.classList
    .remove(
      "hidden"
    );


  document
    .getElementById(
      "car-map-edit-actions"
    )
    ?.classList
    .add(
      "hidden"
    );


  renderCarReminderBoard(
    carMapEditorState.notifications
  );

}


async function saveCarMapEditor() {

  if (!db) {
    return;
  }


  const ids =
    Array.from(
      carMapEditorState.dirtyIds
    );


  if (!ids.length) {

  carMapEditorState.enabled =
    false;


  document
    .getElementById(
      "car-reminder-map"
    )
    ?.classList
    .remove(
      "editing"
    );


  setCarMapEditorButtonState(
    false
  );


  return;
}


  try {

    const batch =
      db.batch();


    ids.forEach(id => {

      const reminder =
        findCarReminderById(id);


      const index =
        findCarReminderIndex(id);


      if (
        !reminder ||
        index < 0
      ) {
        return;
      }


      const layout =
        getCarReminderLayout(
          reminder,
          index
        );


      const mapLayout = {

        cardX:
          Number(
            layout.x.toFixed(2)
          ),

        cardY:
          Number(
            layout.y.toFixed(2)
          )

      };


      if (
        layout.anchorX !== undefined &&
        layout.anchorY !== undefined
      ) {

        mapLayout.anchorX =
          Number(
            layout.anchorX.toFixed(2)
          );


        mapLayout.anchorY =
          Number(
            layout.anchorY.toFixed(2)
          );

      }


      const ref =
        db.collection("users")
          .doc(profileCode)
          .collection("reminders")
          .doc(id);


      batch.update(
        ref,
        {
          mapLayout
        }
      );

    });


    await batch.commit();


    carMapEditorState.enabled =
      false;

document
  .getElementById(
    "car-reminder-map"
  )
  ?.classList
  .remove(
    "editing"
  );


setCarMapEditorButtonState(
  false
);

    carMapEditorState.draft.clear();

    carMapEditorState.dirtyIds.clear();


   

    showToast(
      "Расположение сохранено"
    );


  } catch (error) {

    console.error(
      "Ошибка сохранения схемы:",
      error
    );


    showToast(
      "Не удалось сохранить"
    );

  }

}


function initCarMapEditor() {

  const root =
    document.getElementById(
      "car-reminder-map"
    );

  if (!root) {
    return;
  }


  /* =========================
     TOOLBAR
     ========================= */

  document
    .getElementById(
      "car-map-add-reminder"
    )
    ?.addEventListener(
      "click",
      openNewCarReminderForm
    );


  document
    .getElementById(
      "car-map-edit"
    )
    ?.addEventListener(
      "click",
toggleCarMapEditor
    );



  /* =========================
     DRAG MODE
     ========================= */

  root.addEventListener(
    "pointerdown",
    event => {

      if (
        !carMapEditorState.enabled
      ) {
        return;
      }


      const anchor =
        event.target.closest(
          ".car-reminder-anchor-handle"
        );


      if (anchor) {

        startCarMapAnchorDrag(
          event,
          anchor
        );

        return;
      }


      const card =
        event.target.closest(
          ".car-reminder-card"
        );


      if (card) {

        startCarMapCardDrag(
          event,
          card
        );

      }

    }
  );


  /* =========================
     NORMAL CARD CLICK
     ========================= */

  root.addEventListener(
    "click",
    event => {

      /*
       * В режиме перемещения
       * меню карточки не открываем.
       */
      if (
        carMapEditorState.enabled
      ) {
        return;
      }


      /* Нажали кнопку внутри меню */
      const actionButton =
        event.target.closest(
          "[data-car-reminder-action]"
        );


      if (actionButton) {

        event.preventDefault();
        event.stopPropagation();


        const card =
          actionButton.closest(
            ".car-reminder-card"
          );


        if (!card) {
          return;
        }


        const id =
          card.dataset.reminderId;


        const action =
          actionButton.dataset
            .carReminderAction;


        if (action === "edit") {

          closeCarReminderActions();

          editInfoEntry(id);

          return;
        }


        if (action === "image") {

          closeCarReminderActions();

          changeReminderImage(id);

          return;
        }


        if (action === "delete") {

          closeCarReminderActions();

          deleteInfoEntry(id);

          return;
        }


        return;
      }


      /* Нажали саму карточку */
      const card =
        event.target.closest(
          ".car-reminder-card"
        );


      if (!card) {

        closeCarReminderActions();

        return;
      }


      const wasOpen =
        card.classList.contains(
          "actions-open"
        );


      closeCarReminderActions(
        card
      );


      card.classList.toggle(
        "actions-open",
        !wasOpen
      );

    }
  );

}
/* =========================================================
   🚗 VISUAL CAR REMINDER MAP
   ========================================================= */

const carMapEditorState = {
  enabled: false,

  notifications: [],

  draft: new Map(),

  dirtyIds: new Set()
};

const CAR_REMINDER_LAYOUTS = [

  /* АКПП */
  {
    match: /акпп|коробк/i,
    icon: "settings",

    x: 33,
    y: 5,
    w: 28,
    h: 12,

    anchorX: 47,
    anchorY: 43
  },

  /* Аккумулятор */
  {
    match: /аккумуля/i,
    icon: "battery",

    x: 62,
    y: 5,
    w: 25,
    h: 12,

    anchorX: 58,
    anchorY: 46
  },

  /* Воск / сиденья */
  {
    match: /воск|сиден/i,
    icon: "sparkles",

    x: 3,
    y: 14,
    w: 27,
    h: 12,

    anchorX: 54,
    anchorY: 49
  },

  /* Масло двигателя */
  {
    match: /масло.*двиг|двиг.*масло/i,
    icon: "droplet",

    x: 3,
    y: 8,
    w: 27,
    h: 12,

    anchorX: 32,
    anchorY: 45
  },

  /* Топливный фильтр */
  {
    match: /топлив.*фильтр|фильтр.*топлив/i,
    icon: "fuel",

    x: 74,
    y: 18,
    w: 24,
    h: 12,

    anchorX: 78,
    anchorY: 43
  },

  /* Дифференциал */
  {
    match: /дифф/i,
    icon: "settings",

    x: 72,
    y: 59,
    w: 26,
    h: 12,

    anchorX: 61,
    anchorY: 69
  },

  /* Тормозная жидкость */
  {
    match: /тормоз.*жид/i,
    icon: "circle",

    x: 3,
    y: 62,
    w: 27,
    h: 12,

    anchorX: 34,
    anchorY: 76
  },

  /* Страховка */
  {
    match: /страхов/i,
    icon: "shield-check",

    x: 4,
    y: 84,
    w: 21,
    h: 11,

    compact: true
  },

  /* STK */
  {
    match: /\bstk\b/i,
    icon: "clipboard-check",

    x: 27,
    y: 84,
    w: 20,
    h: 11,

    compact: true
  },

  /* Словацкая виньетка */
  {
    match: /словац.*винь|винь.*словац/i,
    icon: "route",

    x: 49,
    y: 84,
    w: 24,
    h: 11,

    compact: true
  },

  /* Австрийская виньетка */
  {
    match: /австр.*винь|винь.*австр/i,
    icon: "route",

    x: 75,
    y: 84,
    w: 22,
    h: 11,

    compact: true
  }

];


/*
 * Если название неизвестно,
 * кладём карточку в одно из запасных мест.
 */
const CAR_REMINDER_FALLBACKS = [

  {
    x: 3,
    y: 31,
    w: 26,
    h: 12,
    anchorX: 35,
    anchorY: 55
  },

  {
    x: 72,
    y: 32,
    w: 26,
    h: 12,
    anchorX: 72,
    anchorY: 50
  },

  {
    x: 3,
    y: 47,
    w: 26,
    h: 12,
    anchorX: 34,
    anchorY: 64
  },

  {
    x: 72,
    y: 46,
    w: 26,
    h: 12,
    anchorX: 67,
    anchorY: 61
  }

];


function resolveCarReminderLayout(tag, index) {

  const normalizedTag =
    String(tag || "").trim();

  const predefined =
    CAR_REMINDER_LAYOUTS.find(
      item =>
        item.match.test(normalizedTag)
    );

  if (predefined) {
    return predefined;
  }

  const fallback =
    CAR_REMINDER_FALLBACKS[
      index %
      CAR_REMINDER_FALLBACKS.length
    ];

  return {
    ...fallback,
    icon: "wrench"
  };
}

function getCarReminderLayout(reminder, index) {

  const base =
    resolveCarReminderLayout(
      reminder.tag,
      index
    );


  const saved =
    reminder.mapLayout || {};


  const draft =
    carMapEditorState.draft.get(
      reminder.id
    ) || {};


  const result = {
    ...base
  };


  if (
    Number.isFinite(
      Number(saved.cardX)
    )
  ) {
    result.x =
      Number(saved.cardX);
  }


  if (
    Number.isFinite(
      Number(saved.cardY)
    )
  ) {
    result.y =
      Number(saved.cardY);
  }


  if (
    Number.isFinite(
      Number(saved.anchorX)
    )
  ) {
    result.anchorX =
      Number(saved.anchorX);
  }


  if (
    Number.isFinite(
      Number(saved.anchorY)
    )
  ) {
    result.anchorY =
      Number(saved.anchorY);
  }


  if (
    Number.isFinite(
      Number(draft.cardX)
    )
  ) {
    result.x =
      Number(draft.cardX);
  }


  if (
    Number.isFinite(
      Number(draft.cardY)
    )
  ) {
    result.y =
      Number(draft.cardY);
  }


  if (
    Number.isFinite(
      Number(draft.anchorX)
    )
  ) {
    result.anchorX =
      Number(draft.anchorX);
  }


  if (
    Number.isFinite(
      Number(draft.anchorY)
    )
  ) {
    result.anchorY =
      Number(draft.anchorY);
  }


/* Ручная иконка имеет приоритет
   над автоматической */
if (reminder.mapIcon) {

  result.icon =
    reminder.mapIcon;

}


/*
 * Явно отключена связь
 * с автомобилем.
 */
if (
  reminder.mapLinked === false
) {

  delete result.anchorX;

  delete result.anchorY;

}


/*
 * Пользователь явно включил связь,
 * но у автоматического шаблона
 * точки раньше не было.
 */
if (
  reminder.mapLinked === true &&
  (
    result.anchorX === undefined ||
    result.anchorY === undefined
  )
) {

  result.anchorX = 50;

  result.anchorY = 55;

}

  return result;
}

function getCarReminderStatusColor(status) {

  const colors = {

    expired: "#ff3b4f",

    red: "#ff4b55",

    orange: "#ff8a34",

    yellow: "#ffc928",

    /* Обычное напоминание */
    gray: "#80ddff"
  };

  return (
    colors[status] ||
    colors.gray
  );
}


function formatCarReminderNumber(value) {

  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "";
  }

  return Math.abs(
    Math.round(Number(value))
  ).toLocaleString("ru-RU");
}


function formatCarReminderDetails(reminder) {

  const details = [];

  if (
    reminder.kmLeft !== null &&
    reminder.kmLeft !== undefined
  ) {

    const km =
      Number(reminder.kmLeft);

    const sign =
      km < 0
        ? "−"
        : "";

    details.push(
      `${sign}${formatCarReminderNumber(km)} км`
    );
  }


  if (
    reminder.daysLeft !== null &&
    reminder.daysLeft !== undefined
  ) {

    const days =
      Number(reminder.daysLeft);

    const sign =
      days < 0
        ? "−"
        : "";

    details.push(
      `${sign}${formatCarReminderNumber(days)} дней`
    );
  }


  return (
    details.join(" / ") ||
    "без срока"
  );
}


function getCarReminderProgress(reminder) {

  const percentages = [];


  /* Остаток по километрам */
  if (
    reminder.kmLeft !== null &&
    Number(reminder.interval) > 0
  ) {

    const percentage =
      (
        Number(reminder.kmLeft) /
        Number(reminder.interval)
      ) * 100;

    percentages.push(
      percentage
    );
  }


  /* Остаток по времени */
  if (
    reminder.daysLeft !== null &&
    reminder.dateStart &&
    reminder.dateEnd
  ) {

    const start =
      new Date(reminder.dateStart);

    const end =
      new Date(reminder.dateEnd);


    const totalDays =
      Math.ceil(
        (
          end - start
        ) /
        (
          1000 *
          60 *
          60 *
          24
        )
      );


    if (
      Number.isFinite(totalDays) &&
      totalDays > 0
    ) {

      const percentage =
        (
          Number(reminder.daysLeft) /
          totalDays
        ) * 100;

      percentages.push(
        percentage
      );
    }
  }


  let result;


  if (percentages.length) {

    /*
     * Берём тот параметр,
     * который ближе к окончанию.
     */
    result =
      Math.min(
        ...percentages
      );

  } else {

    /*
     * Fallback,
     * если старые данные без интервала.
     */
    const defaults = {

      expired: 5,

      red: 14,

      orange: 30,

      yellow: 48,

      gray: 78
    };


    result =
      defaults[
        reminder.status
      ] ?? 70;
  }


  return Math.max(
    5,
    Math.min(
      100,
      result
    )
  );
}


function getCarReminderLineStart(layout) {

  const cardCenterX =
    layout.x +
    layout.w / 2;

  const cardCenterY =
    layout.y +
    layout.h / 2;


  const dx =
    layout.anchorX -
    cardCenterX;

  const dy =
    layout.anchorY -
    cardCenterY;


  /*
   * Выбираем ближайшую сторону карточки,
   * чтобы линия не шла через неё.
   */
  if (
    Math.abs(dx) >
    Math.abs(dy)
  ) {

    return {

      x:
        dx > 0
          ? layout.x + layout.w
          : layout.x,

      y:
        cardCenterY
    };
  }


  return {

    x:
      cardCenterX,

    y:
      dy > 0
        ? layout.y + layout.h
        : layout.y
  };
}


function escapeReminderHTML(value) {

  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function renderCarReminderBoard(notifications) {

  const root =
    document.getElementById(
      "car-reminder-map"
    );

  const cards =
    document.getElementById(
      "car-reminder-cards"
    );

  const lines =
    document.getElementById(
      "car-reminder-lines"
    );


  if (
    !root ||
    !cards ||
    !lines
  ) {
    return;
  }

carMapEditorState.notifications =
  Array.isArray(notifications)
    ? notifications
    : [];


  const visibleNotifications =
  Array.isArray(notifications)
    ? notifications
    : [];


  cards.innerHTML = "";

  lines.innerHTML = "";


  if (
    !visibleNotifications.length
  ) {

    root.classList.add(
      "is-empty"
    );

    return;
  }


  root.classList.remove(
    "is-empty"
  );


  const cardHTML = [];

  const lineHTML = [];

const anchorHTML = [];

  visibleNotifications.forEach(
    (reminder, index) => {

    const layout =
  getCarReminderLayout(
    reminder,
    index
  );


      const accentColor =
        getCarReminderStatusColor(
          reminder.status
        );


      const progress =
        getCarReminderProgress(
          reminder
        );


      const title =
        escapeReminderHTML(
          reminder.tag ||
          "Напоминание"
        );


      const details =
        escapeReminderHTML(
          formatCarReminderDetails(
            reminder
          )
        );


      const alertIcon =
        reminder.status === "gray"
          ? ""
          : `
              <span
                class="car-reminder-card__alert"
                aria-hidden="true"
              >
                <span data-lucide="triangle-alert"></span>
              </span>
            `;
const imageAction = "";
      cardHTML.push(`
        <article
  data-reminder-id="${reminder.id}"
  class="
    car-reminder-card
    ${reminder.status}
    ${layout.compact ? "compact" : ""}
  "
          style="
            --card-x: ${layout.x}%;
            --card-y: ${layout.y}%;
            --card-w: ${layout.w}%;
            --reminder-progress: ${progress}%;
          "
        >

          <div class="car-reminder-card__icon">

            <span
              data-lucide="${layout.icon || "wrench"}"
            ></span>

            ${alertIcon}

          </div>


          <div class="car-reminder-card__content">

            <div class="car-reminder-card__title">
              ${title}
            </div>

            <div class="car-reminder-card__meta">
              ${details}
            </div>

            <div class="car-reminder-card__progress">
              <span></span>
            </div>

          </div>

<div class="car-reminder-card__actions">

  <button
    type="button"
    class="car-reminder-action-btn"
    data-car-reminder-action="edit"
    title="Редактировать"
  >
    <span data-lucide="pencil"></span>
  </button>

  ${imageAction}

  <button
    type="button"
    class="car-reminder-action-btn danger"
    data-car-reminder-action="delete"
    title="Удалить"
  >
    <span data-lucide="trash-2"></span>
  </button>

</div>

        </article>
      `);


      /*
       * Нижние документные карточки
       * можно оставить без линий.
       */
      if (
        layout.anchorX === undefined ||
        layout.anchorY === undefined
      ) {
        return;
      }

anchorHTML.push(`

  <button
    type="button"
    class="car-reminder-anchor-handle"
    data-reminder-id="${reminder.id}"

    style="
      --anchor-x: ${layout.anchorX}%;
      --anchor-y: ${layout.anchorY}%;
      --anchor-color: ${accentColor};
    "

    title="Точка привязки"
  ></button>

`);


      const start =
        getCarReminderLineStart(
          layout
        );


      lineHTML.push(`

  <line
    class="car-reminder-line"
    data-reminder-id="${reminder.id}"

    x1="${start.x}"
    y1="${start.y}"

    x2="${layout.anchorX}"
    y2="${layout.anchorY}"

    stroke="${accentColor}"
  ></line>

`);

    }
  );

 cards.innerHTML =
  cardHTML.join("") +
  anchorHTML.join("");

  lines.innerHTML =
    lineHTML.join("");

if (
  carMapEditorState.enabled
) {

  root.classList.add(
    "editing"
  );

} else {

  root.classList.remove(
    "editing"
  );

}

  if (
    typeof lucide !==
    "undefined"
  ) {

    lucide.createIcons();
  }
}

function closeCarReminderActions(
  exceptCard = null
) {

  document
    .querySelectorAll(
      ".car-reminder-card.actions-open"
    )
    .forEach(card => {

      if (card !== exceptCard) {
        card.classList.remove(
          "actions-open"
        );
      }

    });
}

/* =========================================================
   REMINDER MODAL
   ========================================================= */

function setReminderModalIcon(icon) {

  reminderModalSelectedIcon =
    icon || "wrench";


  document
    .querySelectorAll(
      ".reminder-icon-btn"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.reminderIcon ===
          reminderModalSelectedIcon
      );

    });
}


function getAutomaticReminderIcon(tag) {

  const layout =
    resolveCarReminderLayout(
      tag || "",
      0
    );


  return (
    layout?.icon ||
    "wrench"
  );
}


function getAutomaticReminderLinked(tag) {

  const layout =
    resolveCarReminderLayout(
      tag || "",
      0
    );


  return (
    layout?.anchorX !== undefined &&
    layout?.anchorY !== undefined
  );
}


async function openReminderModal(
  reminderId = null
) {

  const modal =
    document.getElementById(
      "reminder-modal"
    );


  const form =
    document.getElementById(
      "reminder-modal-form"
    );


  if (
    !modal ||
    !form
  ) {
    return;
  }


  closeCarReminderActions();


  form.reset();


  reminderModalEditingId =
    reminderId || null;


  let selectedIcon =
    "wrench";


  let linked =
    true;


  if (reminderId) {

    const doc =
      await db
        .collection("users")
        .doc(profileCode)
        .collection("reminders")
        .doc(reminderId)
        .get();


    if (!doc.exists) {
      return;
    }


    const reminder =
      doc.data();


    document
      .getElementById(
        "reminder-modal-title"
      )
      .textContent =
        "Редактировать напоминание";


    document
      .getElementById(
        "reminder-modal-tag"
      )
      .value =
        reminder.tag || "";


    document
      .getElementById(
        "reminder-modal-mileage"
      )
      .value =
        reminder.mileage ?? "";


    document
      .getElementById(
        "reminder-modal-interval"
      )
      .value =
        reminder.interval ?? "";


    document
      .getElementById(
        "reminder-modal-date-start"
      )
      .value =
        reminder.dateStart || "";


    document
      .getElementById(
        "reminder-modal-date-end"
      )
      .value =
        reminder.dateEnd || "";


    selectedIcon =
      reminder.mapIcon ||
      getAutomaticReminderIcon(
        reminder.tag
      );


    if (
      typeof reminder.mapLinked ===
      "boolean"
    ) {

      linked =
        reminder.mapLinked;

    } else {

      linked =
        getAutomaticReminderLinked(
          reminder.tag
        );

    }


  } else {

    document
      .getElementById(
        "reminder-modal-title"
      )
      .textContent =
        "Новое напоминание";


    const today =
      new Date()
        .toISOString()
        .split("T")[0];


    document
      .getElementById(
        "reminder-modal-date-start"
      )
      .value =
        today;


    selectedIcon =
      "wrench";


    linked =
      true;

  }


  document
    .getElementById(
      "reminder-modal-linked"
    )
    .checked =
      linked;


  setReminderModalIcon(
    selectedIcon
  );


  modal.classList.remove(
    "hidden"
  );


  modal.setAttribute(
    "aria-hidden",
    "false"
  );


  requestAnimationFrame(() => {

    modal.classList.add(
      "show"
    );

  });


  if (
    typeof lucide !==
    "undefined"
  ) {

    lucide.createIcons();

  }


  setTimeout(() => {

    document
      .getElementById(
        "reminder-modal-tag"
      )
      ?.focus();

  }, 150);

}


function closeReminderModal() {

  const modal =
    document.getElementById(
      "reminder-modal"
    );


  if (!modal) {
    return;
  }


  modal.classList.remove(
    "show"
  );


  modal.setAttribute(
    "aria-hidden",
    "true"
  );


  setTimeout(() => {

    modal.classList.add(
      "hidden"
    );

  }, 180);

}


async function saveReminderModal(
  event
) {

  event.preventDefault();


  if (!db) {
    return;
  }


  const tag =
    document
      .getElementById(
        "reminder-modal-tag"
      )
      .value
      .trim()
      .toLowerCase();


  if (!tag) {
    return;
  }


  const mileageRaw =
    document
      .getElementById(
        "reminder-modal-mileage"
      )
      .value;


  const intervalRaw =
    document
      .getElementById(
        "reminder-modal-interval"
      )
      .value;


  const data = {

    tag,

    mileage:
      mileageRaw !== ""
        ? Number(mileageRaw)
        : null,

    interval:
      intervalRaw !== ""
        ? Number(intervalRaw)
        : null,

    dateStart:
      document
        .getElementById(
          "reminder-modal-date-start"
        )
        .value || "",

    dateEnd:
      document
        .getElementById(
          "reminder-modal-date-end"
        )
        .value || "",

    mapIcon:
      reminderModalSelectedIcon ||
      "wrench",

    mapLinked:
      document
        .getElementById(
          "reminder-modal-linked"
        )
        .checked

  };


  try {

    const reminders =
      db
        .collection("users")
        .doc(profileCode)
        .collection("reminders");


    if (
      reminderModalEditingId
    ) {

      await reminders
        .doc(
          reminderModalEditingId
        )
        .update(
          data
        );


      showToast(
        "Напоминание обновлено"
      );


    } else {

      await reminders.add({

        ...data,

        imageUrl: "",

        created:
          Date.now()

      });


      showToast(
        "Напоминание добавлено"
      );

    }


    closeReminderModal();


  } catch (error) {

    console.error(
      "Ошибка сохранения напоминания:",
      error
    );


    showToast(
      "Не удалось сохранить"
    );

  }

}


function initReminderModal() {

  const modal =
    document.getElementById(
      "reminder-modal"
    );


  if (!modal) {
    return;
  }


  document
    .getElementById(
      "reminder-modal-form"
    )
    ?.addEventListener(
      "submit",
      saveReminderModal
    );


  modal.addEventListener(
    "click",
    event => {

      const closeButton =
        event.target.closest(
          "[data-reminder-modal-close]"
        );


      if (closeButton) {

        closeReminderModal();

        return;
      }


      const iconButton =
        event.target.closest(
          "[data-reminder-icon]"
        );


      if (iconButton) {

        setReminderModalIcon(
          iconButton.dataset
            .reminderIcon
        );

      }

    }
  );


  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Escape" &&
        !modal.classList.contains(
          "hidden"
        )
      ) {

        closeReminderModal();

      }

    }
  );

}

function openNewCarReminderForm() {

  openReminderModal();

}

function deleteInfoEntry(id) {
  if (confirm("Удалить напоминание?")) {
    db.collection("users").doc(profileCode).collection("reminders").doc(id).delete()
.then(() => showToast("Напоминание удалено"));
  }
}

function editInfoEntry(id) {

  openReminderModal(id);

}


function showToast(message = "Готово!") {

  const toast =
    document.getElementById("toast");

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

  