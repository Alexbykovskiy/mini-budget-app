// Простроим состояние приложения
const state = {
calendarFontSize: 18,
calendarCardBgColor: "#ffffff",
calendarTextColor: "#111827",
  year: new Date().getFullYear(),
  month: new Date().getMonth(), // 0-11
  titleMain: "Запись на декабрь открыта",
  titleMonth: "",
// ===== Верхний заголовок (Запись на ... открыта) =====
  titleMainFont: "Inter",
  titleMainColor: "#111827",
  titleMainFontSize: 18,
  titleMainFontWeight: "600",
  titleMainFontStyle: "normal",
  footerText: "Ближайшие свободные окна:",
titleMonthFont: "Inter",
titleMonthColor: "#1f2937",

titleMonthFontSize: 20,
titleMonthFontWeight: "400",
titleMonthFontStyle: "normal",

footerFont: "Inter",
footerColor: "#374151",
footerFontSize: 16,
footerFontWeight: "400",
footerFontStyle: "normal",
  
 previewUserScale: 1,   // ползунок пользователя
  previewAutoFit: true,  // авто-вписывание в окно превью
  background: "bg-solid",
  accentColor: "#22c55e", // зелёный по умолчанию

 // параметры календаря
  calendarOpacity: 0.96,

  calendarScale: 1,
  calendarOffsetX: 0,
  calendarOffsetY: 0,
  calendarBgColor: "#f9fafb",

  // эффекты календаря
  calendarEffectsEnabled: true,
  calendarShadowSize: 35,      // "размер" (blur) тени
  calendarShadowOpacity: 0.45, // прозрачность тени
  calendarGlowSize: 0,         // размер свечения

  // вкл/выкл блока настроек календаря
  calendarSettingsEnabled: true,

  availableDays: new Set(), // свободные дни
  customBackground: null,   // dataURL пользовательского фона
 // custom background transform
  bgScale: 1,     // 1..3
  bgOffsetX: 0,   // px
  bgOffsetY: 0,   // px
  bgRotate: 0,    // degrees
// tint overlay (color + opacity)
  tintColor: "#000000",
  tintOpacity: 0, // 0..100
};


// DOM-элементы
let
  monthSelect,
  yearInput,
  titleMainInput,
  titleMonthInput,
  footerTextInput,
  backgroundSelect,
  accentColorInput,

bgRotateKnob,
  bgKnobPointer,
  bgKnobDot,
  bgRotateValue,

  previewScaleInput,
  calendarFontSizeInput,
  calendarCardBgColorInput,
  calendarTextColorInput,

 // tint
  tintLayer,
  tintColorInput,
  tintOpacityInput,
  tintOpacityValue,

  titleMainFontSelect,
  titleMainColorInput,
  titleMainFontSizeInput,
  titleMainFontWeightSelect,
  titleMainFontStyleSelect,

  titleMonthFontSelect,
  titleMonthColorInput,
  titleMonthFontSizeInput,
  titleMonthFontWeightSelect,
  titleMonthFontStyleSelect,

  footerFontSelect,
  footerColorInput,
  footerFontSizeInput,
  footerFontWeightSelect,
  footerFontStyleSelect,

  calendarDaysContainer,
  previewTitleMain,
  previewTitleMonth,
  previewFooterText,
  previewArtboard,
  previewWrapper,

  clearDaysBtn,
  downloadBtn,
  uploadBgBtn,
  bgUploadInput,

  // новые элементы фона
  bgImageLayer,
  bgCustomControls,
  bgScaleInput,
  bgScaleValue,
  bgRotateCWBtn,
  bgRotateCCWBtn,
  bgResetBtn,

  calendarSettingsToggle,
  calendarSettingsGroup,
  calendarOpacityInput,
  calendarScaleInput,
  calendarOffsetXInput,
  calendarOffsetYInput,
  calendarBgColorInput,
  calendarEffectsEnableInput,
  calendarShadowSizeInput,
  calendarShadowOpacityInput,
  calendarGlowSizeInput;
function enhanceFontSelect(selectEl, kind = "font") {
  // Уже обёрнут
  if (!selectEl || selectEl.dataset.enhanced === "1") return;

  selectEl.dataset.enhanced = "1";

 const wrapper = document.createElement("div");
wrapper.className = "font-picker is-up";

  // Вставляем wrapper перед select и переносим select внутрь
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(selectEl);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "font-picker__button";

  const label = document.createElement("span");
  label.className = "font-picker__label";

  const chev = document.createElement("span");
  chev.className = "font-picker__chev";
  chev.textContent = "▾";

  button.appendChild(label);
  button.appendChild(chev);

  const list = document.createElement("div");
list.className = "font-picker__list";
list.setAttribute("role", "listbox");

 // --- touch/scroll guard: distinguish scroll from tap ---
  let didScroll = false;
  let startY = 0;
  let startX = 0;
  let lastMoveTs = 0;

  list.addEventListener(
    "touchstart",
    (e) => {
      didScroll = false;
      const t = e.touches[0];
      startY = t.clientY;
      startX = t.clientX;
    },
    { passive: true }
  );

  list.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      const dy = Math.abs(t.clientY - startY);
      const dx = Math.abs(t.clientX - startX);

      // если палец реально двигается — это скролл
      if (dy > 8 || dx > 8) {
        didScroll = true;
        lastMoveTs = Date.now();
      }
    },
    { passive: true }
  );

  list.addEventListener(
    "touchend",
    () => {
      // оставляем метку скролла на короткое время,
      // чтобы "end of scroll" не стал кликом по кнопке
      if (didScroll) lastMoveTs = Date.now();
    },
    { passive: true }
  );

wrapper.appendChild(button);
// wrapper.appendChild(list);  // ❌ убираем
document.body.appendChild(list); // ✅ портал в body
  function renderLabel() {
  const opt = selectEl.selectedOptions[0];
  const val = opt?.value || "";

  label.textContent = opt?.textContent || val;

  // сбрасываем, чтобы не тянулось от прошлого типа
  label.style.fontFamily = "";
  label.style.fontWeight = "";
  label.style.fontStyle = "";

  if (kind === "font") {
    label.style.fontFamily = val || "Inter";
  } else if (kind === "weight") {
    label.style.fontFamily = "Inter";
    label.style.fontWeight = val || "400";
  } else if (kind === "style") {
    label.style.fontFamily = "Inter";
    label.style.fontStyle = val || "normal";
  }
}

  function buildList() {
    list.innerHTML = "";

    Array.from(selectEl.options).forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "font-picker__item";
      item.setAttribute("role", "option");

      const main = document.createElement("span");
main.textContent = opt.textContent || opt.value;

// сброс
main.style.fontFamily = "";
main.style.fontWeight = "";
main.style.fontStyle = "";

if (kind === "font") {
  main.style.fontFamily = opt.value;        // превью шрифта
} else if (kind === "weight") {
  main.style.fontFamily = "Inter";
  main.style.fontWeight = opt.value;        // превью толщины
} else if (kind === "style") {
  main.style.fontFamily = "Inter";
  main.style.fontStyle = opt.value;         // превью наклона
}

const hint = document.createElement("span");
hint.className = "font-picker__hint";
hint.textContent = opt.value;

      item.appendChild(main);
      item.appendChild(hint);

      if (opt.value === selectEl.value) item.classList.add("is-active");

      item.addEventListener("click", () => {
  if (didScroll || Date.now() - lastMoveTs < 250) return;

  selectEl.value = opt.value;
  selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  close();
  renderLabel();
  buildList();
});

      list.appendChild(item);
    });
  }

function positionList() {
  const rect = button.getBoundingClientRect();

  list.style.width = rect.width + "px";
  list.style.left = rect.left + "px";

  // ✅ показываем весь список без внутреннего скролла
  list.style.maxHeight = "none";
  list.style.overflow = "visible";

  // временно показываем, чтобы померить высоту
  list.classList.add("is-open");
  const listH = list.getBoundingClientRect().height;

  const gap = 8;
  const top = Math.max(8, rect.top - gap - listH);
  list.style.top = top + "px";
}

function open() {
  buildList();
  positionList();
}

function close() {
  list.classList.remove("is-open");
}
 button.addEventListener("click", () => {
  if (list.classList.contains("is-open")) close();
  else open();
});

  document.addEventListener("click", (e) => {
  if (!wrapper.contains(e.target) && !list.contains(e.target)) close();
});
window.addEventListener("resize", close);
window.addEventListener("scroll", close, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // Начальная отрисовка
  renderLabel();
}

function initFontPickers() {
  document
    .querySelectorAll("select.js-font-picker")
    .forEach((el) => enhanceFontSelect(el, "font"));

  document
    .querySelectorAll("select.js-weight-picker")
    .forEach((el) => enhanceFontSelect(el, "weight"));

  document
    .querySelectorAll("select.js-style-picker")
    .forEach((el) => enhanceFontSelect(el, "style"));
}

function init() {

 setupNoZoom();

  cacheDom();
initFontPickers();
  initDefaults();

 if (tintColorInput) tintColorInput.value = state.tintColor || "#000000";
  if (tintOpacityInput) tintOpacityInput.value = String(state.tintOpacity ?? 0);
  if (tintOpacityValue) tintOpacityValue.textContent = `${state.tintOpacity ?? 0}%`;
  updateTintLayer();

  buildCalendar();
  bindEvents();
  updatePreviewTexts();
  updateBackground();
  updateFormat();
  updateAccentColor();
  updateCalendarOpacity();
  updateCalendarAppearance();
  updatePreviewScale();

if (calendarCardBgColorInput) calendarCardBgColorInput.value = state.calendarCardBgColor;
if (calendarTextColorInput) calendarTextColorInput.value = state.calendarTextColor;
if (calendarFontSizeInput) calendarFontSizeInput.value = state.calendarFontSize;

if (titleMainFontSelect) titleMainFontSelect.value = state.titleMainFont;
if (titleMainColorInput) titleMainColorInput.value = state.titleMainColor;

if (titleMainFontSizeInput) titleMainFontSizeInput.value = state.titleMainFontSize;
if (titleMainFontWeightSelect) titleMainFontWeightSelect.value = state.titleMainFontWeight;
if (titleMainFontStyleSelect) titleMainFontStyleSelect.value = state.titleMainFontStyle;

if (titleMonthFontSelect) titleMonthFontSelect.value = state.titleMonthFont;
if (titleMonthColorInput) titleMonthColorInput.value = state.titleMonthColor;

if (footerFontSelect) footerFontSelect.value = state.footerFont;
if (footerColorInput) footerColorInput.value = state.footerColor;

if (titleMonthFontSizeInput) titleMonthFontSizeInput.value = state.titleMonthFontSize;
if (titleMonthFontWeightSelect) titleMonthFontWeightSelect.value = state.titleMonthFontWeight;
if (titleMonthFontStyleSelect) titleMonthFontStyleSelect.value = state.titleMonthFontStyle;

if (footerFontSizeInput) footerFontSizeInput.value = state.footerFontSize;
if (footerFontWeightSelect) footerFontWeightSelect.value = state.footerFontWeight;
if (footerFontStyleSelect) footerFontStyleSelect.value = state.footerFontStyle;


  // инициализация ползунков и чекбоксов
  if (calendarOpacityInput) {
    calendarOpacityInput.value = state.calendarOpacity;
  }
 if (previewScaleInput) {
    previewScaleInput.value = state.previewUserScale;
  }
  if (calendarScaleInput) {
    calendarScaleInput.value = state.calendarScale;
  }
  if (calendarOffsetXInput) {
    calendarOffsetXInput.value = state.calendarOffsetX;
  }
  if (calendarOffsetYInput) {
    calendarOffsetYInput.value = state.calendarOffsetY;
  }
  if (calendarBgColorInput) {
    calendarBgColorInput.value = state.calendarBgColor;
  }
  if (calendarEffectsEnableInput) {
    calendarEffectsEnableInput.checked = state.calendarEffectsEnabled;
  }
  if (calendarShadowSizeInput) {
    calendarShadowSizeInput.value = state.calendarShadowSize;
  }
  if (calendarShadowOpacityInput) {
    calendarShadowOpacityInput.value = state.calendarShadowOpacity;
  }
  if (calendarGlowSizeInput) {
    calendarGlowSizeInput.value = state.calendarGlowSize;
  }

  if (calendarSettingsToggle) {
    calendarSettingsToggle.checked = state.calendarSettingsEnabled;
  }
  updateCalendarSettingsVisibility();
 updatePreviewScale();
 if (bgScaleInput) bgScaleInput.value = String(Math.round((state.bgScale || 1) * 100));
updateCustomBgTransform();
}

/* ====== DOM helpers ====== */

function cacheDom() {
calendarCardBgColorInput = document.getElementById("calendarCardBgColorInput");
calendarTextColorInput = document.getElementById("calendarTextColorInput");
titleMonthFontSelect = document.getElementById("titleMonthFontSelect");
titleMonthColorInput = document.getElementById("titleMonthColorInput");

footerFontSelect = document.getElementById("footerFontSelect");
  footerColorInput = document.getElementById("footerColorInput");

footerFontSelect = document.getElementById("footerFontSelect");
footerColorInput = document.getElementById("footerColorInput");
  monthSelect = document.getElementById("monthSelect");
  yearInput = document.getElementById("yearInput");
  titleMainInput = document.getElementById("titleMainInput");
titleMainFontSelect = document.getElementById("titleMainFontSelect");
titleMainColorInput = document.getElementById("titleMainColorInput");
titleMainFontSizeInput = document.getElementById("titleMainFontSizeInput");
titleMainFontWeightSelect = document.getElementById("titleMainFontWeightSelect");
titleMainFontStyleSelect = document.getElementById("titleMainFontStyleSelect");
  titleMonthInput = document.getElementById("titleMonthInput");
  footerTextInput = document.getElementById("footerTextInput");
  accentColorInput = document.getElementById("accentColorInput");
 previewScaleInput = document.getElementById("previewScaleInput");
  calendarDaysContainer = document.getElementById("calendarDays");
  previewTitleMain = document.getElementById("previewTitleMain");
  previewTitleMonth = document.getElementById("previewTitleMonth");
  previewFooterText = document.getElementById("previewFooterText");
  previewArtboard = document.getElementById("previewArtboard");
  previewWrapper = document.getElementById("previewWrapper");
  clearDaysBtn = document.getElementById("clearDaysBtn");
  downloadBtn = document.getElementById("downloadBtn");
calendarFontSizeInput = document.getElementById("calendarFontSizeInput");
  // новые элементы
   // новые элементы
  uploadBgBtn = document.getElementById("uploadBgBtn");
  bgUploadInput = document.getElementById("bgUploadInput");

  calendarSettingsToggle = document.getElementById("calendarSettingsToggle");
  calendarSettingsGroup = document.getElementById("calendarSettingsGroup");

  calendarOpacityInput = document.getElementById("calendarOpacityInput");
  // календарь — размер / положение / цвет / эффекты
  calendarScaleInput = document.getElementById("calendarScaleInput");
  calendarOffsetXInput = document.getElementById("calendarOffsetXInput");
  calendarOffsetYInput = document.getElementById("calendarOffsetYInput");
  calendarBgColorInput = document.getElementById("calendarBgColorInput");
  calendarEffectsEnableInput = document.getElementById("calendarEffectsEnableInput");
  calendarShadowSizeInput = document.getElementById("calendarShadowSizeInput");
  calendarShadowOpacityInput = document.getElementById("calendarShadowOpacityInput");
  calendarGlowSizeInput = document.getElementById("calendarGlowSizeInput");

titleMonthFontSizeInput = document.getElementById("titleMonthFontSizeInput");
  titleMonthFontWeightSelect = document.getElementById("titleMonthFontWeightSelect");
  titleMonthFontStyleSelect = document.getElementById("titleMonthFontStyleSelect");

  footerFontSizeInput = document.getElementById("footerFontSizeInput");
  footerFontWeightSelect = document.getElementById("footerFontWeightSelect");
  footerFontStyleSelect = document.getElementById("footerFontStyleSelect");

 // фон: слой картинки + контролы
  bgImageLayer = document.getElementById("bgImageLayer");
  bgCustomControls = document.getElementById("bgCustomControls");
  bgScaleInput = document.getElementById("bgScaleInput");
  bgScaleValue = document.getElementById("bgScaleValue");
  bgRotateCWBtn = document.getElementById("bgRotateCWBtn");
  bgRotateCCWBtn = document.getElementById("bgRotateCCWBtn");
  bgResetBtn = document.getElementById("bgResetBtn");
 // rotary knob (поворот фона)
  bgRotateKnob = document.getElementById("bgRotateKnob");
  bgKnobPointer = document.getElementById("bgKnobPointer");
  bgKnobDot = document.getElementById("bgKnobDot");
  bgRotateValue = document.getElementById("bgRotateValue");

 // tint
  tintLayer = document.getElementById("tintLayer");
  tintColorInput = document.getElementById("tintColorInput");
  tintOpacityInput = document.getElementById("tintOpacityInput");
  tintOpacityValue = document.getElementById("tintOpacityValue");

}
function initDefaults() {
  // по умолчанию ставим следующий месяц, чтобы было похоже на "запись открыта"
  const now = new Date();
  const nextMonth = (now.getMonth() + 1) % 12;
  const yearForNextMonth =
    nextMonth === 0 ? now.getFullYear() + 1 : now.getFullYear();

  state.month = nextMonth;
  state.year = yearForNextMonth;

  monthSelect.value = String(state.month);
  yearInput.value = state.year;

  const monthName = getMonthName(state.month, "ru-gen"); // "декабря"
  const monthNameCapital = getMonthName(state.month, "ru-nom"); // "Декабрь"

  state.titleMain = `Запись на ${monthName} открыта`;
  state.titleMonth = `${monthNameCapital} ${state.year}`;

  titleMainInput.value = state.titleMain;
  titleMonthInput.value = state.titleMonth;
  footerTextInput.value = state.footerText;

  accentColorInput.value = state.accentColor;
  
}

/* ====== События ====== */
function bindEvents() {

if (bgScaleInput) {
  bgScaleInput.addEventListener("input", () => {
    // 100..300 -> 1..3
    state.bgScale = Number(bgScaleInput.value) / 100;
    updateCustomBgTransform();
  });
}

if (tintColorInput) {
  tintColorInput.addEventListener("input", () => {
    state.tintColor = tintColorInput.value;
    updateTintLayer();
  });
}

if (tintOpacityInput) {
  tintOpacityInput.addEventListener("input", () => {
    state.tintOpacity = Number(tintOpacityInput.value);
    updateTintLayer();
  });
}

// ===== Rotary knob: drag around circle to rotate =====
if (bgRotateKnob) {
const knobTarget = bgKnobDot || bgRotateKnob;
  let dragging = false;

const canRotate = () =>
    !!(state.customBackground && state.background === "bg-custom");

  const clampAngle = (deg) => {
    // чтобы не улетало в бесконечность, держим -180..180
    let a = deg;
    while (a > 180) a -= 360;
    while (a < -180) a += 360;
    return a;
  };

  const getAngleFromEvent = (clientX, clientY) => {
    const rect = bgRotateKnob.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // atan2: 0° будет вправо, сделаем 0° вверх как “12 часов”
    const dx = clientX - cx;
    const dy = clientY - cy;

    const rad = Math.atan2(dy, dx);         // -PI..PI
    let deg = (rad * 180) / Math.PI;        // -180..180
    deg += 90;                              // переносим 0° на вверх
    return clampAngle(deg);
  };

  const applyAngle = (deg) => {
    if (!(state.customBackground && state.background === "bg-custom")) return;
    state.bgRotate = deg;
    updateCustomBgTransform();
  };

  const onMove = (clientX, clientY) => {
    if (!dragging) return;
    const a = getAngleFromEvent(clientX, clientY);
    applyAngle(a);
  };

  // mouse
  bgRotateKnob.addEventListener("mousedown", (e) => {
    if (!(state.customBackground && state.background === "bg-custom")) return;
    e.preventDefault();
    dragging = true;
    onMove(e.clientX, e.clientY);
  });

// ----- iOS fallback: Touch Events (Safari can steal the gesture for scroll) -----
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  if (isTouchDevice) {
    const onTouchStart = (e) => {
      if (!canRotate()) return;

      // важно: иначе скролл панели съест жест
      e.preventDefault();
      dragging = true;

      const t = e.touches[0];
applyAngle(getAngleFromEvent(t.clientX, t.clientY));
    };

    const onTouchMove = (e) => {
      if (!dragging) return;
      e.preventDefault();

      const t = e.touches[0];
applyAngle(getAngleFromEvent(t.clientX, t.clientY)); 
   };

    const onTouchEnd = () => {
      dragging = false;
    };

    knobTarget.addEventListener("touchstart", onTouchStart, { passive: false });
    knobTarget.addEventListener("touchmove", onTouchMove, { passive: false });
    knobTarget.addEventListener("touchend", onTouchEnd, { passive: true });
    knobTarget.addEventListener("touchcancel", onTouchEnd, { passive: true });
  }

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    onMove(e.clientX, e.clientY);
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
  });

  // touch
  bgRotateKnob.addEventListener(
    "touchstart",
    (e) => {
      if (!(state.customBackground && state.background === "bg-custom")) return;
      e.preventDefault();
      dragging = true;
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    },
    { passive: false }
  );

  bgRotateKnob.addEventListener(
    "touchmove",
    (e) => {
      if (!dragging) return;
      e.preventDefault();
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    },
    { passive: false }
  );

  bgRotateKnob.addEventListener(
    "touchend",
    () => {
      dragging = false;
    },
    { passive: true }
  );

 }

// ===== Joystick: press & hold + smooth movement =====
let joyDir = null;            // 'up' | 'down' | 'left' | 'right' | null
let joyRaf = 0;
let joyLastTs = 0;

// скорость (px/sec) при удержании. Можно подкрутить.
const JOY_SPEED = 220;

// лёгкое ускорение: первые 0.4s разгоняется
function joySpeedMultiplier(heldMs) {
  const t = Math.min(heldMs / 400, 1); // 0..1
  return 0.35 + 0.65 * t;              // 0.35..1.0
}

function canMoveCustomBg() {
  return !!(state.customBackground && state.background === "bg-custom");
}

function joyTick(ts) {
  if (!joyDir || !canMoveCustomBg()) {
    joyRaf = 0;
    joyLastTs = 0;
    return;
  }

  if (!joyLastTs) joyLastTs = ts;
  const dt = Math.min((ts - joyLastTs) / 1000, 0.05); // сек, clamp
  joyLastTs = ts;

  // сколько держим
  const heldMs = Math.max(0, (ts - (joyTick._startTs || ts)));
  const v = JOY_SPEED * joySpeedMultiplier(heldMs); // px/sec
  const delta = v * dt;

  // движение
  if (joyDir === "up") state.bgOffsetY -= delta;
  if (joyDir === "down") state.bgOffsetY += delta;
  if (joyDir === "left") state.bgOffsetX -= delta;
  if (joyDir === "right") state.bgOffsetX += delta;

  updateCustomBgTransform();
  joyRaf = requestAnimationFrame(joyTick);
}

function joyStart(dir, btnEl) {
  if (!canMoveCustomBg()) return;

  // center оставляем мгновенным
  if (dir === "center") {
    state.bgOffsetX = 0;
    state.bgOffsetY = 0;
    updateCustomBgTransform();
    return;
  }

  joyDir = dir;
  joyTick._startTs = performance.now();

  if (btnEl) btnEl.classList.add("is-holding");

  if (!joyRaf) {
    joyLastTs = 0;
    joyRaf = requestAnimationFrame(joyTick);
  }
}

function joyStop(btnEl) {
  joyDir = null;
  if (btnEl) btnEl.classList.remove("is-holding");
}

// навешиваем на кнопки джойстика (и мышь, и тач)
document.querySelectorAll(".bg-joystick__btn").forEach((btn) => {
  const dir = btn.dataset.move;

  // mouse
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    joyStart(dir, btn);
  });
  window.addEventListener("mouseup", () => joyStop(btn));

  // touch
  btn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      joyStart(dir, btn);
    },
    { passive: false }
  );
  btn.addEventListener(
    "touchend",
    () => joyStop(btn),
    { passive: true }
  );
  btn.addEventListener(
    "touchcancel",
    () => joyStop(btn),
    { passive: true }
  );

  // если увели палец/мышь за кнопку
  btn.addEventListener("mouseleave", () => joyStop(btn));
});

const ROT_STEP = 3;

if (bgRotateCWBtn) {
  bgRotateCWBtn.addEventListener("click", () => {
    if (!(state.customBackground && state.background === "bg-custom")) return;
    state.bgRotate = (state.bgRotate || 0) + ROT_STEP;
    updateCustomBgTransform();
  });
}

if (bgRotateCCWBtn) {
  bgRotateCCWBtn.addEventListener("click", () => {
    if (!(state.customBackground && state.background === "bg-custom")) return;
    state.bgRotate = (state.bgRotate || 0) - ROT_STEP;
    updateCustomBgTransform();
  });
}

if (bgResetBtn) {
  bgResetBtn.addEventListener("click", () => {
    state.bgScale = 1;
    state.bgOffsetX = 0;
    state.bgOffsetY = 0;
    state.bgRotate = 0;

    if (bgScaleInput) bgScaleInput.value = "100";
    updateCustomBgTransform();
  });
}


if (calendarFontSizeInput) {
  calendarFontSizeInput.addEventListener("input", () => {
    state.calendarFontSize = Number(calendarFontSizeInput.value);
    updateCalendarAppearance();
buildCalendar();
  });
}

if (calendarCardBgColorInput) {
  calendarCardBgColorInput.addEventListener("input", () => {
    state.calendarCardBgColor = calendarCardBgColorInput.value;
    updateCalendarAppearance();
  });
}

if (calendarTextColorInput) {
  calendarTextColorInput.addEventListener("input", () => {
    state.calendarTextColor = calendarTextColorInput.value;
    updateCalendarAppearance();
  });
}

  // Вкл/выкл группы настроек календаря
  if (calendarSettingsToggle) {
    calendarSettingsToggle.addEventListener("change", () => {
      state.calendarSettingsEnabled = calendarSettingsToggle.checked;
      updateCalendarSettingsVisibility();
    });
  }

if (titleMonthFontSelect) {
  titleMonthFontSelect.addEventListener("change", () => {
    state.titleMonthFont = titleMonthFontSelect.value;
    updatePreviewTexts();
  });
}

if (titleMonthFontSelect) {
  Array.from(titleMonthFontSelect.options).forEach(opt => {
    opt.style.fontFamily = opt.value;
  });
}

if (footerFontSelect) {
  Array.from(footerFontSelect.options).forEach(opt => {
    opt.style.fontFamily = opt.value;
  });
}

if (titleMonthColorInput) {
  titleMonthColorInput.addEventListener("input", () => {
    state.titleMonthColor = titleMonthColorInput.value;
    updatePreviewTexts();
  });
}

if (titleMonthFontSizeInput) {
  titleMonthFontSizeInput.addEventListener("input", () => {
    state.titleMonthFontSize = titleMonthFontSizeInput.value;
    updatePreviewTexts();
  });
}

if (titleMonthFontWeightSelect) {
  titleMonthFontWeightSelect.addEventListener("change", () => {
    state.titleMonthFontWeight = titleMonthFontWeightSelect.value;
    updatePreviewTexts();
  });
}

if (titleMonthFontStyleSelect) {
  titleMonthFontStyleSelect.addEventListener("change", () => {
    state.titleMonthFontStyle = titleMonthFontStyleSelect.value;
    updatePreviewTexts();
  });
}

if (footerFontSelect) {
  footerFontSelect.addEventListener("change", () => {
    state.footerFont = footerFontSelect.value;
    updatePreviewTexts();
  });
}

if (footerColorInput) {
  footerColorInput.addEventListener("input", () => {
    state.footerColor = footerColorInput.value;
    updatePreviewTexts();
  });
}

if (footerFontSizeInput) {
  footerFontSizeInput.addEventListener("input", () => {
    state.footerFontSize = footerFontSizeInput.value;
    updatePreviewTexts();
  });
}

if (footerFontWeightSelect) {
  footerFontWeightSelect.addEventListener("change", () => {
    state.footerFontWeight = footerFontWeightSelect.value;
    updatePreviewTexts();
  });
}

if (footerFontStyleSelect) {
  footerFontStyleSelect.addEventListener("change", () => {
    state.footerFontStyle = footerFontStyleSelect.value;
    updatePreviewTexts();
  });
}

if (previewScaleInput) {
    previewScaleInput.addEventListener("input", () => {
      state.previewUserScale = Number(previewScaleInput.value);
      updatePreviewScale();
    });
  }

// Десктоп + обычные случаи
window.addEventListener("resize", () => {
  requestAnimationFrame(updatePreviewScale);
});

// Мобилка: адресная строка/панели меняют "видимую" высоту без window.resize
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    requestAnimationFrame(updatePreviewScale);
  });
  window.visualViewport.addEventListener("scroll", () => {
    requestAnimationFrame(updatePreviewScale);
  });
}

// Поворот экрана
window.addEventListener("orientationchange", () => {
  setTimeout(updatePreviewScale, 50);
});

  monthSelect.addEventListener("change", () => {
    state.month = Number(monthSelect.value);
    autoUpdateTextsForMonth();
    buildCalendar();
    updatePreviewTexts();
  });

  yearInput.addEventListener("change", () => {
    const val = Number(yearInput.value) || state.year;
    state.year = val;
    autoUpdateTextsForMonth();
    buildCalendar();
    updatePreviewTexts();
  });

  titleMainInput.addEventListener("input", () => {
    state.titleMain = titleMainInput.value;
    updatePreviewTexts();
  });

// ===== Верхний заголовок: шрифт/цвет/размер/толщина/наклон =====
if (titleMainFontSelect) {
  titleMainFontSelect.addEventListener("change", () => {
    state.titleMainFont = titleMainFontSelect.value;
    updatePreviewTexts();
  });

  Array.from(titleMainFontSelect.options).forEach((opt) => {
    opt.style.fontFamily = opt.value;
  });
}

if (titleMainColorInput) {
  titleMainColorInput.addEventListener("input", () => {
    state.titleMainColor = titleMainColorInput.value;
    updatePreviewTexts();
  });
}

if (titleMainFontSizeInput) {
  titleMainFontSizeInput.addEventListener("input", () => {
    state.titleMainFontSize = Number(titleMainFontSizeInput.value);
    updatePreviewTexts();
  });
}

if (titleMainFontWeightSelect) {
  titleMainFontWeightSelect.addEventListener("change", () => {
    state.titleMainFontWeight = titleMainFontWeightSelect.value;
    updatePreviewTexts();
  });
}

if (titleMainFontStyleSelect) {
  titleMainFontStyleSelect.addEventListener("change", () => {
    state.titleMainFontStyle = titleMainFontStyleSelect.value;
    updatePreviewTexts();
  });
}

  titleMonthInput.addEventListener("input", () => {
    state.titleMonth = titleMonthInput.value;
    updatePreviewTexts();
  });

  footerTextInput.addEventListener("input", () => {
    state.footerText = footerTextInput.value;
    updatePreviewTexts();
  });

  
  accentColorInput.addEventListener("input", () => {
    state.accentColor = accentColorInput.value;
    updateAccentColor();
  });



// Кнопка "Добавить свой фон"
  uploadBgBtn.addEventListener("click", () => {
    bgUploadInput.click();
  });

  bgUploadInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
state.bgScale = 1;
state.bgOffsetX = 0;
state.bgOffsetY = 0;
state.bgRotate = 0;
if (bgScaleInput) bgScaleInput.value = "100";
       state.customBackground = event.target.result;
      state.background = "bg-custom";
      updateBackground();
      updateCustomBgTransform();
    };
    reader.readAsDataURL(file);
  });

  // Прозрачность календаря
  if (calendarOpacityInput) {
    calendarOpacityInput.addEventListener("input", () => {
      state.calendarOpacity = Number(calendarOpacityInput.value);
      updateCalendarOpacity();
    });
  }

 
  // Календарь — размер / положение / цвет
  if (calendarScaleInput) {
    calendarScaleInput.addEventListener("input", () => {
      state.calendarScale = Number(calendarScaleInput.value);
      updateCalendarAppearance();
    });
  }

  if (calendarOffsetXInput) {
    calendarOffsetXInput.addEventListener("input", () => {
      state.calendarOffsetX = Number(calendarOffsetXInput.value);
      updateCalendarAppearance();
    });
  }

  if (calendarOffsetYInput) {
    calendarOffsetYInput.addEventListener("input", () => {
      state.calendarOffsetY = Number(calendarOffsetYInput.value);
      updateCalendarAppearance();
    });
  }

  if (calendarBgColorInput) {
    calendarBgColorInput.addEventListener("input", () => {
      state.calendarBgColor = calendarBgColorInput.value;
      updateCalendarAppearance();
    });
  }

  // Эффекты календаря
  if (calendarEffectsEnableInput) {
    calendarEffectsEnableInput.addEventListener("change", () => {
      state.calendarEffectsEnabled = calendarEffectsEnableInput.checked;
      updateCalendarAppearance();
    });
  }

  if (calendarShadowSizeInput) {
    calendarShadowSizeInput.addEventListener("input", () => {
      state.calendarShadowSize = Number(calendarShadowSizeInput.value);
      updateCalendarAppearance();
    });
  }

  if (calendarShadowOpacityInput) {
    calendarShadowOpacityInput.addEventListener("input", () => {
      state.calendarShadowOpacity = Number(calendarShadowOpacityInput.value);
      updateCalendarAppearance();
    });
  }

  if (calendarGlowSizeInput) {
    calendarGlowSizeInput.addEventListener("input", () => {
      state.calendarGlowSize = Number(calendarGlowSizeInput.value);
      updateCalendarAppearance();
    });
  }


  clearDaysBtn.addEventListener("click", () => {
    state.availableDays.clear();
    buildCalendar();
  });

  downloadBtn.addEventListener("click", () => {
    exportPreviewAsPng();
  });
}

/* ====== Календарь ====== */

function buildCalendar() {
  calendarDaysContainer.innerHTML = "";
  const firstDay = new Date(state.year, state.month, 1);
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();

  // 0 = вс, 1 = пн... нам надо с понедельника
  let startWeekDay = firstDay.getDay(); // 0-6
  if (startWeekDay === 0) startWeekDay = 7;

  const totalCells = Math.ceil((startWeekDay - 1 + daysInMonth) / 7) * 7;

  let currentDay = 1;

  for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
    const cell = document.createElement("button");
    cell.className = "calendar-day";
    cell.type = "button";

    const inner = document.createElement("div");
    inner.className = "calendar-day-inner";
    cell.appendChild(inner);

    const isBeforeFirst = cellIndex < startWeekDay - 1;
    const isAfterLast = currentDay > daysInMonth;

    if (isBeforeFirst || isAfterLast) {
      cell.classList.add("empty");
      inner.textContent = "";
    } else {
      const dayNumber = currentDay;
      inner.textContent = String(dayNumber);
      cell.dataset.day = String(dayNumber);

      // выходные
      const weekDayIndex = cellIndex % 7; // 0..6; 5,6 = сб, вс
      if (weekDayIndex === 5 || weekDayIndex === 6) {
        cell.classList.add("weekend");
      }

      // если день есть в availableDays — это свободный (зелёный кружок),
      // иначе — день занятый с красным крестиком
      if (state.availableDays.has(dayNumber)) {
        cell.classList.add("available");
      } else {
        cell.classList.add("unavailable");
      }

      cell.addEventListener("click", () => {
        toggleDay(dayNumber);
      });

      currentDay++;
    }

    calendarDaysContainer.appendChild(cell);
  }
}

function toggleDay(dayNumber) {
  if (state.availableDays.has(dayNumber)) {
    state.availableDays.delete(dayNumber);
  } else {
    state.availableDays.add(dayNumber);
  }
  buildCalendar();
}

/* ====== Тексты/вид ====== */

function updatePreviewTexts() {
  previewTitleMain.textContent =
    state.titleMain && state.titleMain.trim().length
      ? state.titleMain
      : "\u00A0"; // неразрывный пробел, чтобы блок не схлопывался

// Верхний заголовок
previewTitleMain.style.setProperty("--title-main-font", state.titleMainFont);
previewTitleMain.style.setProperty("--title-main-font-size", state.titleMainFontSize + "px");
previewTitleMain.style.setProperty("--title-main-font-weight", state.titleMainFontWeight);
previewTitleMain.style.setProperty("--title-main-font-style", state.titleMainFontStyle);
previewTitleMain.style.setProperty("--title-main-color", state.titleMainColor);

previewTitleMonth.style.setProperty("--title-month-font", state.titleMonthFont);
previewTitleMonth.style.setProperty("--title-month-font-size", state.titleMonthFontSize + "px");
previewTitleMonth.style.setProperty("--title-month-font-weight", state.titleMonthFontWeight);
previewTitleMonth.style.setProperty("--title-month-font-style", state.titleMonthFontStyle);

previewTitleMonth.style.setProperty("--title-month-color", state.titleMonthColor);

previewFooterText.style.setProperty("--footer-font", state.footerFont);

previewFooterText.style.setProperty("--footer-font-size", state.footerFontSize + "px");
previewFooterText.style.setProperty("--footer-font-weight", state.footerFontWeight);
previewFooterText.style.setProperty("--footer-font-style", state.footerFontStyle);

previewFooterText.style.setProperty("--footer-color", state.footerColor);

  previewTitleMonth.textContent =
    state.titleMonth && state.titleMonth.trim().length
      ? state.titleMonth
      : "\u00A0";

  previewFooterText.textContent =
    state.footerText && state.footerText.trim().length
      ? state.footerText
      : "";
}

function updateBackground() {
  previewArtboard.classList.remove(
    "bg-beige",
    "bg-red",
    "bg-green",
    "bg-solid",
    "bg-custom"
  );

  // по умолчанию: скрываем <img>-слой
  if (bgImageLayer) {
    bgImageLayer.src = "";
  }
  previewArtboard.classList.remove("has-custom-image");

  // если пользовательская картинка выбрана
  if (state.customBackground && state.background === "bg-custom") {
    previewArtboard.classList.add("bg-custom");

    // ВАЖНО: больше не через background-image, а через <img>
    if (bgImageLayer) {
      bgImageLayer.src = state.customBackground;
    }
    previewArtboard.classList.add("has-custom-image");

    // на всякий случай очищаем background-image чтобы не мешалось
    previewArtboard.style.backgroundImage = "";
    updateCustomBgTransform();
    return;
  }

  // обычные градиенты
  previewArtboard.style.backgroundImage = "";
  previewArtboard.classList.add(state.background);

  updateCustomBgTransform();
}
function updateCustomBgTransform() {
  if (!previewArtboard || !bgImageLayer) return;

  // показываем/прячем панель контролов
  const hasCustom = !!(state.customBackground && state.background === "bg-custom");
  if (bgCustomControls) bgCustomControls.style.display = hasCustom ? "" : "none";

  // применяем transform к <img>
  const x = state.bgOffsetX || 0;
  const y = state.bgOffsetY || 0;
  const s = state.bgScale || 1;
  const r = state.bgRotate || 0;

  bgImageLayer.style.transform = `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`;

  // подпись процента
  if (bgScaleValue) bgScaleValue.textContent = `${Math.round(s * 100)}%`;
updateRotateKnobUI();
}

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function updateTintLayer() {
  if (!tintLayer) return;

  const { r, g, b } = hexToRgb(state.tintColor || "#000000");
  const a = Math.max(0, Math.min(100, Number(state.tintOpacity ?? 0))) / 100;

  tintLayer.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;

  if (tintOpacityValue) tintOpacityValue.textContent = `${Math.round(a * 100)}%`;
}

function updateRotateKnobUI() {
  if (!bgKnobPointer || !bgKnobDot) return;

  const a = Number(state.bgRotate || 0);

  bgKnobPointer.style.transform = `translateY(-50%) rotate(${a}deg)`;
  bgKnobDot.style.transform = `translate(-50%, -50%) rotate(${a}deg) translateX(44px)`;

  if (bgRotateValue) bgRotateValue.textContent = `${Math.round(a)}°`;
}

function updateAccentColor() {
  previewArtboard.style.setProperty("--accent-color", state.accentColor);
}

function updateCalendarOpacity() {
  previewArtboard.style.setProperty(
    "--calendar-opacity",
    state.calendarOpacity
  );
}

// размер / положение / эффекты календаря
// размер / положение / эффекты календаря
function updateCalendarAppearance() {

previewArtboard.style.setProperty("--calendar-font-size", state.calendarFontSize + "px");
  if (!previewArtboard) return;

  // размер и положение
previewArtboard.style.setProperty("--calendar-card-bg-color", state.calendarCardBgColor);
previewArtboard.style.setProperty("--calendar-text-color", state.calendarTextColor);
  previewArtboard.style.setProperty("--calendar-scale", state.calendarScale);
  previewArtboard.style.setProperty("--calendar-offset-x", state.calendarOffsetX + "px");
  previewArtboard.style.setProperty("--calendar-offset-y", state.calendarOffsetY + "px");
  previewArtboard.style.setProperty("--calendar-bg-color", state.calendarBgColor);

  // если эффекты выключены – тени нет
  if (!state.calendarEffectsEnabled) {
    previewArtboard.style.setProperty("--calendar-shadow", "none");
    return;
  }

  // эффекты календаря
  const blur = state.calendarShadowSize;
  const opacity = state.calendarShadowOpacity;
  const glow = state.calendarGlowSize;

  const baseShadow = `0 18px ${blur}px rgba(15, 23, 42, ${opacity})`;
  const glowShadow = glow > 0 ? `, 0 0 ${glow}px rgba(255, 255, 255, 0.7)` : "";

// Размер ячейки привязываем к размеру шрифта
const cellSize = Math.round(state.calendarFontSize * 1.7);
previewArtboard.style.setProperty("--calendar-cell-size", cellSize + "px");

  previewArtboard.style.setProperty(
    "--calendar-shadow",
    baseShadow + glowShadow
  );
}
function updateCalendarSettingsVisibility() {
  if (!calendarSettingsGroup) return;
  calendarSettingsGroup.style.display = state.calendarSettingsEnabled ? "" : "none";
}
 
function updateFormat() {
  // Формат фиксированный 9:16 — Instagram Stories
  updatePreviewScale();
}



/* ====== Авто-обновление текстов при смене месяца/года ====== */

function autoUpdateTextsForMonth() {
  const monthNameGen = getMonthName(state.month, "ru-gen"); // декабря
  const monthNameNom = getMonthName(state.month, "ru-nom"); // Декабрь

  if (!titleMainInput.value || titleMainInput.value === state.titleMain) {
    state.titleMain = `Запись на ${monthNameGen} открыта`;
    titleMainInput.value = state.titleMain;
  }

  if (!titleMonthInput.value || titleMonthInput.value === state.titleMonth) {
    state.titleMonth = `${monthNameNom} ${state.year}`;
    titleMonthInput.value = state.titleMonth;
  }
}

/* ====== Экспорт PNG ====== */

function exportPreviewAsPng() {
  const target = document.getElementById("previewArtboard");
  if (!target) return;

  // режим экспорта: без скруглений/теней/бордеров (у тебя это уже есть в CSS)
  target.classList.add("is-exporting");

  // сохраняем текущий preview-scale, чтобы вернуть после экспорта
  const prevScale = getComputedStyle(target).getPropertyValue("--preview-scale").trim();

  // ВАЖНО: при экспорте убираем transform-scale, иначе будет "пустая полоса"
  target.style.setProperty("--preview-scale", "1");

  // чуть увеличиваем масштаб для более чёткого PNG
  const scale = 3; // 360px * 3 = 1080px, 640px * 3 = 1920px

  requestAnimationFrame(() => {
    html2canvas(target, {
      backgroundColor: null,
      scale,
      useCORS: true,
    })
      .then((canvas) => {
        // возвращаем как было
        target.style.setProperty("--preview-scale", prevScale || "1");
        target.classList.remove("is-exporting");

        const monthNumber = String(state.month + 1).padStart(2, "0");
const filename = `calendar-${state.year}-${monthNumber}.png`;

// Пытаемся сделать "сохранение в галерею" через системное Share меню (мобилки)
canvas.toBlob(async (blob) => {
  try {
    if (!blob) throw new Error("Blob is null");

    const file = new File([blob], filename, { type: "image/png" });

    // iOS/Android: если поддерживается Web Share с файлами — откроется нативное меню
    const canShareFiles =
      navigator.canShare && navigator.canShare({ files: [file] });

    if (navigator.share && canShareFiles) {
  try {
    await navigator.share({
      files: [file],
      title: "Календарь",
      text: "Сохрани в Фото/Галерею через «Сохранить изображение»",
    });
  } catch (err) {
    // Пользователь закрыл меню (тап по пустому месту / Cancel) — это НЕ ошибка
    if (err && (err.name === "AbortError" || err.code === 20)) return;
    // Если вдруг другая ошибка — пусть упадём в фоллбэки ниже
    throw err;
  }
  return; // важно: после успешного share ничего больше не делаем
}

    // Фоллбэк 1: открыть картинку в новой вкладке (на мобилке можно долгим тапом "Сохранить")
    const url = URL.createObjectURL(blob);
window.open(url, "_blank", "noopener,noreferrer");

// Чистим URL чуть позже
setTimeout(() => URL.revokeObjectURL(url), 30_000);
return;
  } catch (e) {
    // Фоллбэк 2: старый способ скачивания в "Загрузки"
    const link = document.createElement("a");
link.download = filename;
link.href = canvas.toDataURL("image/png");
document.body.appendChild(link);
link.click();
link.remove();
  }
}, "image/png");
      })
      .catch(() => {
        // возвращаем как было даже при ошибке
        target.style.setProperty("--preview-scale", prevScale || "1");
        target.classList.remove("is-exporting");
      });
  });
}
/* ====== Утилита: русские месяцы ====== */
/**
 * @param {number} monthIndex 0-11
 * @param {'ru-nom'|'ru-gen'} form
 */
function getMonthName(monthIndex, form) {
  const monthsNom = [
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
    "Декабрь",
  ];

  const monthsGen = [
    "январь", // в январь -> но нам лучше "январь"->"январь"? упрощаем, нужнее нижний регистр
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
  ];

  // чуть красивее родительный: "января", "февраля"...
  const monthsGenNice = [
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
  ];

   if (form === "ru-nom") {
    return monthsNom[monthIndex] || "";
  }

  return monthsGenNice[monthIndex] || monthsGen[monthIndex] || "";
}

function getArtboardBaseSize() {
  // UI-макет (удобный для превью). Пропорции 9:16.
  // Экспорт в 1080×1920 делаем отдельно через html2canvas scale.
  return { w: 360, h: 640 };
}
function updatePreviewScale() {
  if (!previewWrapper || !previewArtboard) return;

  const { w, h } = getArtboardBaseSize();
previewArtboard.style.setProperty("--artboard-w", `${w}px`);
previewArtboard.style.setProperty("--artboard-h", `${h}px`);
  
  // доступная площадь внутри wrapper
  const wrapperRect = previewWrapper.getBoundingClientRect();

// Make zoom slider length match the preview area height (especially on iPhone)
const zoomLen = Math.max(
  280,
  Math.min(wrapperRect.height - 48, Math.round(wrapperRect.height * 0.85))
);
document.documentElement.style.setProperty("--zoom-len", `${zoomLen}px`);
  // небольшой запас, чтобы не липло к краям
  const padding = 16;
  const availW = Math.max(0, wrapperRect.width - padding * 2);
  const availH = Math.max(0, wrapperRect.height - padding * 2);

  // авто-вписывание
  const fitScale = Math.min(availW / w, availH / h) * 0.98;

  // итоговый масштаб: авто-fit * ползунок
  const finalScale = (state.previewAutoFit ? fitScale : 1) * (state.previewUserScale || 1);

  previewArtboard.style.setProperty("--preview-scale", String(finalScale));
}


function setupNoZoom() {
  // iOS Safari: блокируем pinch-zoom жесты
  const block = (e) => e.preventDefault();
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });
  document.addEventListener("gestureend", block, { passive: false });

  // Блокируем double-tap zoom (часто срабатывает на iOS)
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // Десктоп: блокируем Ctrl + колесо (zoom браузера)
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );
}

document.addEventListener("DOMContentLoaded", init);
