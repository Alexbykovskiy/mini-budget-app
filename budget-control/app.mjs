import { cloudConfig } from './config.mjs';
import { LocalStore, CloudStore, loadCloud } from './store.mjs';
import { MINI_CATEGORIES } from './seed.mjs';
import { reminderFor } from './reminders.mjs';
import { cents, localDate, validMonth, shiftMonth, daysBetween, categoriesFor, monthlyPlan, planTotals, totals, operationsUnique, averageFor } from './core.mjs';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const money = value => value == null ? '—' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR' }).format(value / 100);
const dateLabel = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthLabel = value => new Date(`${value}-15T12:00:00Z`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const uuid = () => crypto.randomUUID();
const paths = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  expenses: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18m-6 6h3M6 5V3h11"/>',
  payments: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>',
  income: '<path d="M4 17 10 11l4 4 6-10m-6 0h6v6M4 21h16"/>',
  analytics: '<path d="M4 20V10m8 10V4m8 16v-7M2 21h20"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  car: '<path d="m4 10 2-6h12l2 6M3 10h18v8H3zM6 18v3m12-3v3M6 14h2m8 0h2"/>',
  work: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V3h8v4M3 12h18m-11 0v3h4v-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  edit: '<path d="m14 5 5 5M3 21l5-1L21 7l-5-5L3 15z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.expenses}</svg>`;
const sections = { dashboard: ['Главная', 'Финансы под контролем', 'Один взгляд на всё, что важно.'], expenses: ['Расходы', 'На что уходит бюджет', 'План, покупки и расходы из ваших приложений.'], payments: ['Платежи', 'Всё вовремя', 'Регулярные обязательства и история оплат.'], income: ['Доходы', 'Ваши поступления', 'Доходы Tattoo Finance и дополнительные источники.'], analytics: ['Аналитика', 'За цифрами — картина', 'Динамика, структура и результат за выбранный период.'], settings: ['Настройки', 'Бюджет по вашим правилам', 'Категории, планирование и подключённые источники.'] };
const state = { month: localDate().slice(0, 7), page: 'dashboard', settings: null, transactions: [], recurring: [], payments: [], plans: [], mini_budget: [], tattoo_income: [], tattoo_expense: [], statuses: {}, direction: 'all', categoryFilter: '', search: '', expenseTab: 'history', archived: false, analyticsFrom: '', analyticsTo: '', theme: 'system' };
state.analyticsFrom = `${state.month.slice(0, 4)}-01`; state.analyticsTo = `${state.month.slice(0, 4)}-12`;
let store, frame, dialogSave, busy = false, toastTimer, runtime, authUnsubscribe, lastFocused;
const statusNames = { local: 'На этом устройстве', loading: 'Загрузка…', ready: 'Синхронизировано', cached: 'Кеш · требуется интернет', partial: 'Есть некорректные записи', error: 'Ошибка подключения', unavailable: 'Не подключён', disabled: 'Отключено' };
const sourceNames = { budget_control: 'Budget Control', mini_budget: 'Mini Budget', tattoo_income: 'Tattoo Finance', tattoo_expense: 'Tattoo Finance · расходы' };
const ready = key => !(store?.mode === 'cloud' && !navigator.onLine) && ['ready', 'local'].includes(state.statuses[key]?.state);
const sourceReady = source => ready(source === 'budget_control' ? 'transactions' : source);
function queryRange() { return { from: `${[shiftMonth(state.month, -12), state.analyticsFrom].sort()[0]}-01`, to: `${[shiftMonth(state.month, 1), shiftMonth(state.analyticsTo, 1)].sort().at(-1)}-01` }; }
function cats(month = state.month) { return state.settings ? categoriesFor(state.settings, month, state.plans.find(p => p.id === month)) : []; }
function allOperations() {
  const own = state.transactions.map(t => ({ ...t, documentId: t.id, id: `budget_control:${t.id}` }));
  return operationsUnique([...own, ...state.mini_budget, ...state.tattoo_income, ...state.tattoo_expense]).map(t => {
    const category = cats(t.date.slice(0, 7)).find(c => c.id === t.categoryId);
    if (t.type === 'expense' && category?.actualSource !== t.source) return { ...t, categoryId: `unmapped-${t.direction}`, categoryName: t.originalCategory || category?.name || 'Без категории' };
    return { ...t, direction: t.readOnly ? t.direction : category?.direction || t.direction, categoryName: category?.name || t.originalCategory || 'Без категории' };
  });
}
const monthOperations = () => allOperations().filter(t => t.date.startsWith(state.month));
const known = () => totals(monthOperations());
const expenseComplete = () => ready('transactions') && ready('mini_budget') && ready('settings');
const incomeComplete = () => ready('transactions') && ready('tattoo_income');
const empty = (title, description, action = '', label = '') => `<div class="empty"><div class="empty-icon">${icon('expenses')}</div><strong>${escape(title)}</strong><p>${escape(description)}</p>${action ? `<button class="button secondary" data-action="${action}">${escape(label)}</button>` : ''}</div>`;
const progress = (actual, plan) => `<div class="progress ${actual > plan ? 'over' : ''}"><span style="width:${plan ? Math.min(100, Math.max(0, actual / plan * 100)) : actual ? 100 : 0}%"></span></div>`;
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show'); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
function scheduleRender() { if (!frame) frame = requestAnimationFrame(() => { frame = null; render(); }); }
function receive({ key, data, status }) { state.statuses[key] = status; if (data != null) state[key] = data; scheduleRender(); }
async function setStore(next) {
  store?.stop(); store = next;
  state.settings = null; for (const key of ['transactions', 'recurring', 'payments', 'plans', 'mini_budget', 'tattoo_income', 'tattoo_expense']) state[key] = [];
  state.statuses = {}; scheduleRender();
  await store.start(receive, queryRange());
}
function setTheme(value) {
  state.theme = value; try { localStorage.setItem('budget-control.theme', value); } catch { /* Storage errors are reported by the data store. */ }
  const theme = value === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
  document.documentElement.dataset.theme = theme; $('meta[name="theme-color"]').content = theme === 'dark' ? '#10272b' : '#edf1ed';
  $('#theme-toggle').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
}
function syncPanel() {
  return `<div class="panel"><div class="panel-header"><h2>Источники данных</h2><button class="text-button" data-action="navigate" data-page="settings">Настроить ↗</button></div><div class="sync-grid">${['mini_budget', 'tattoo_income', 'tattoo_expense'].map(key => { const s = state.statuses[key] || { state: 'loading' }; return `<div class="sync-source"><span class="status-dot ${s.state}"></span><div><strong>${sourceNames[key]}</strong><p>${escape(statusNames[s.state])}${s.error ? ` · ${escape(s.error)}` : ''}</p><p>${key === 'tattoo_expense' ? 'Подготовлено для следующего этапа' : s.lastSuccess ? `Последняя синхронизация: ${new Date(s.lastSuccess).toLocaleString('ru-RU')}` : 'Успешной синхронизации пока не было'}${s.errors?.length ? ` · Пропущено записей: ${s.errors.length}` : ''}</p></div></div>`; }).join('')}</div></div>`;
}
function stat(label, value, note, tone = '', symbol = '↗') { return `<article class="panel stat"><div class="stat-top"><span>${label}</span><span class="stat-symbol ${tone}">${symbol}</span></div><div class="value money ${tone}">${money(value)}</div><small>${note}</small></article>`; }
function upcomingList(limit = Infinity) { return state.recurring.filter(p => p.enabled).sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, limit); }
function dueText(payment) { const { daysUntil: days, status } = reminderFor(payment); return status === 'disabled' ? 'Отключено' : days < 0 ? `Просрочено на ${-days} дн.` : days === 0 ? 'Ожидается сегодня' : `Ожидается через ${days} дн.`; }
function paymentPreview(p) { return `<div class="row"><span class="row-icon">${icon('payments')}</span><div class="row-main"><strong>${escape(p.name)}</strong><small>${dateLabel(p.nextDate)} · <span class="${p.nextDate < localDate() ? 'negative' : ''}">${dueText(p)}</span></small></div><div class="row-amount"><strong class="money">${money(p.amountCents)}</strong></div><button class="icon-button" data-action="pay" data-id="${escape(p.id)}" aria-label="Оплатить ${escape(p.name)}">${icon('arrow')}</button></div>`; }
function dashboard() {
  const categories = cats(), plan = planTotals(categories), actual = known(), complete = expenseComplete(), completeIncome = incomeComplete();
  const upcoming = upcomingList(3), urgent = upcoming.filter(p => daysBetween(localDate(), p.nextDate) <= 7);
  const requiredPercent = plan.total ? Math.round(plan.required / plan.total * 100) : 0;
  return `${urgent.length ? `<div class="notice"><span>${icon('payments')} Ближайший платёж: <strong>${escape(urgent[0].name)}</strong> · ${money(urgent[0].amountCents)} · ${dueText(urgent[0])}</span><button class="text-button" data-action="navigate" data-page="payments">Подробнее →</button></div>` : ''}
    <div class="dashboard-top"><section class="panel plan-panel"><div class="panel-header"><p class="eyebrow">ВАШ ПЛАН НА МЕСЯЦ</p><span class="badge">${categories.filter(c => !c.archived).length} категорий</span></div><div class="plan-content"><div><div class="big-amount money">${money(plan.total)}</div><p class="plan-sub">Полный среднемесячный бюджет</p><div class="plan-metrics"><div><small>Обязательный минимум</small><strong class="money">${money(plan.required)}</strong></div><div><small>Можно сократить</small><strong class="money">${money(plan.optional)}</strong></div></div></div><div class="donut" style="--required:${requiredPercent}%" role="img" aria-label="Обязательные расходы: ${requiredPercent}% плана"><strong>${requiredPercent}%</strong><span>обязательные<br>расходы</span></div></div><div class="plan-bottom"><span>Без годовых платежей <strong>${money(plan.monthly)}</strong></span><span>Годовые суммы распределены справочно</span></div></section><div class="stats-grid">${stat('Фактические расходы', complete ? actual.expense : null, complete ? 'По дате реальной оплаты' : `Известно: ${money(actual.expense)} · данные неполные`, '', '↗')}${stat('Фактические доходы', completeIncome ? actual.income : null, completeIncome ? 'Все поступления за месяц' : `Известно: ${money(actual.income)} · данные неполные`, 'positive', '↙')}${stat('Финансовый результат', complete && completeIncome ? actual.balance : null, 'Доходы минус фактические расходы', actual.balance < 0 ? 'negative' : 'positive', '=')}${stat('Остаток по плану', complete ? plan.total - actual.expense : null, complete ? 'План минус фактические расходы' : 'Доступен после подключения источников', complete && actual.expense > plan.total ? 'negative' : '', '≈')}</div></div>
    <div class="section-heading"><h2>Три стороны вашего бюджета</h2><small>${escape(monthLabel(state.month))}</small></div><div class="directions">${[['car', 'Автомобиль', 'Расходы из Mini Budget', 'mini_budget'], ['work', 'Тату-бизнес', 'Доходы из Tattoo Finance', 'tattoo_income'], ['home', 'Дом и семья', 'Ваши повседневные расходы', 'transactions']].map(([direction, name, subtitle, source]) => {
      const ops = monthOperations().filter(t => t.direction === direction), values = totals(ops), planned = monthlyPlan(categories).filter(c => c.direction === direction).reduce((s, c) => s + c.planCents, 0), available = ready(source), isWork = direction === 'work';
      return `<article class="panel"><div class="direction-top"><div class="direction-icon ${direction}">${icon(direction)}</div><div><h3>${name}</h3><p>${subtitle}</p></div></div><div class="direction-value money ${isWork ? 'positive' : ''}">${money(available ? isWork ? values.income : values.expense : null)}</div><p class="direction-plan">${isWork ? `План расходов ${money(planned)} · импорт расходов отключён` : `из ${money(planned)} в плане`}</p>${progress(available && !isWork ? values.expense : 0, planned)}<div class="direction-foot"><span>${available ? isWork ? 'Поступления за месяц' : planned ? `${Math.round(values.expense / planned * 100)}% плана использовано` : 'Без установленного плана' : 'Источник пока недоступен'}</span><button class="text-button" data-action="direction" data-direction="${direction}">Детали ↗</button></div></article>`;
    }).join('')}</div><div class="lower-grid"><section class="panel"><div class="panel-header"><h2>Ближайшие платежи</h2><button class="text-button" data-action="navigate" data-page="payments">Все →</button></div>${upcoming.length ? upcoming.map(paymentPreview).join('') : empty('Без неожиданных платежей', 'Добавьте обязательство, когда знаете точную дату.', 'add-recurring', '＋ Добавить платёж')}</section><section class="panel"><div class="panel-header"><h2>Последние операции</h2><button class="text-button" data-action="navigate" data-page="expenses">Журнал →</button></div>${transactionList(monthOperations().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4), false)}</section></div><div class="section-heading"><h2>Всегда актуальная картина</h2><small>Источники доступны только вам</small></div>${syncPanel()}`;
}
function transactionList(rows, controls = true) {
  if (!rows.length) return empty('Пока нет операций', 'Здесь появятся ваши покупки и поступления за выбранный месяц.');
  return rows.map(t => `<div class="row"><span class="row-icon ${t.type === 'income' ? 'positive' : ''}">${icon(t.type === 'income' ? 'income' : t.direction)}</span><div class="row-main"><strong>${escape(t.type === 'income' ? t.incomeSource : t.categoryName)}</strong><small>${dateLabel(t.date)} · ${sourceNames[t.source]}${t.paymentId ? ' · Регулярный платёж' : ''}</small>${t.description ? `<small>${escape(t.description)}</small>` : ''}</div><div class="row-amount"><strong class="money ${t.type === 'income' ? 'positive' : ''}">${t.type === 'income' ? '+' : '−'}${money(t.amountCents)}</strong>${t.readOnly ? `<small><a class="inline-link" href="${t.source === 'mini_budget' ? '../minibudget/index.html' : '../tattoo/tattoo-index.html'}">В источнике ↗</a></small>` : ''}</div>${controls && !t.readOnly && !t.paymentId ? `<div class="row-actions"><button class="icon-button" data-action="edit-operation" data-id="${escape(t.documentId)}" aria-label="Изменить операцию ${escape(t.categoryName || t.incomeSource)}">${icon('edit')}</button><button class="icon-button" data-action="delete-operation" data-id="${escape(t.documentId)}" aria-label="Удалить операцию">${icon('trash')}</button></div>` : ''}</div>`).join('');
}
function comparison(editable = false, month = state.month, rows = monthOperations()) {
  const categories = cats(month), plan = monthlyPlan(categories), archived = categories.filter(c => c.archived).map(c => ({ ...c, planCents: 0 }));
  const display = (state.archived && editable ? [...plan, ...archived] : plan).filter(c => state.direction === 'all' || c.direction === state.direction);
  const header = '<div class="comparison-head comparison-grid"><span>Категория</span><span>План / мес.</span><span>Факт</span><span>Остаток</span><span class="compare-progress">Выполнение</span><span></span></div>';
  let result = '';
  for (const group of [...new Set(display.map(c => c.group))]) {
    result += `<h3 class="group-title">${escape(group)}</h3>${header}`;
    result += display.filter(c => c.group === group).map(c => {
      const actual = rows.filter(t => t.type === 'expense' && t.categoryId === c.id).reduce((sum, t) => sum + t.amountCents, 0), available = sourceReady(c.actualSource), remaining = c.planCents - actual;
      const percent = c.planCents ? `${Math.round(actual / c.planCents * 100)}%` : actual ? 'Вне плана' : '0%';
      return `<div class="comparison-row comparison-grid ${c.archived ? 'archived' : ''}"><div><span class="category-name">${escape(c.name)}</span><small>${c.required ? 'Обязательный' : 'Необязательный'} · ${c.kind === 'regular' ? 'Регулярный' : 'Ориентир'}${c.archived ? ' · Архив' : ''}</small></div><div class="compare-cell money" data-label="План">${money(c.planCents)}${c.periodMonths !== 1 ? `<small>${money(c.amountCents)} / ${c.periodMonths} мес.</small>` : ''}</div><div class="compare-cell money" data-label="Факт">${money(available ? actual : null)}</div><div class="compare-cell money ${available && remaining < 0 ? 'negative' : ''}" data-label="${remaining < 0 ? 'Перерасход' : 'Остаток'}">${money(available ? remaining : null)}</div><div class="compare-progress">${progress(available ? actual : 0, c.planCents)}<span>${available ? percent : 'Нет данных'}</span></div><button class="icon-button" data-action="edit-category" data-id="${escape(c.id)}" aria-label="Изменить категорию ${escape(c.name)}">${icon('edit')}</button></div>`;
    }).join('');
  }
  const unplanned = rows.filter(t => t.type === 'expense' && !plan.some(c => c.id === t.categoryId));
  if (unplanned.length) result += `<div class="notice" style="margin-top:20px"><span>Вне активного плана: <strong>${money(totals(unplanned).expense)}</strong>. Эти операции входят в общие расходы. Проверьте сопоставления и архивные категории.</span></div>`;
  return result || empty('Категорий нет', 'Добавьте первую категорию бюджета.');
}
function directionChips() { return `<div class="filter-chips">${[['all', 'Все направления'], ['home', 'Дом и семья'], ['car', 'Автомобиль'], ['work', 'Тату-бизнес']].map(([key, label]) => `<button class="chip ${state.direction === key ? 'active' : ''}" data-action="filter-direction" data-direction="${key}">${label}</button>`).join('')}</div>`; }
function expenses() {
  const rows = monthOperations().filter(t => t.type === 'expense' && (state.direction === 'all' || t.direction === state.direction) && (!state.categoryFilter || t.categoryId === state.categoryFilter) && (!state.search || `${t.categoryName} ${t.description}`.toLocaleLowerCase('ru').includes(state.search.toLocaleLowerCase('ru')))).sort((a, b) => b.date.localeCompare(a.date));
  return `${directionChips()}<div class="panel"><div class="panel-header"><div class="filter-chips" style="margin:0"><button class="chip ${state.expenseTab === 'history' ? 'active' : ''}" data-action="expense-tab" data-tab="history">Операции</button><button class="chip ${state.expenseTab === 'plan' ? 'active' : ''}" data-action="expense-tab" data-tab="plan">План и факт</button></div><small>${escape(monthLabel(state.month))}</small></div>${state.expenseTab === 'plan' ? comparison() : `<div class="toolbar"><input id="search" type="search" placeholder="Найти операцию…" aria-label="Поиск операций" value="${escape(state.search)}"><select id="category-filter" aria-label="Фильтр категорий"><option value="">Все категории</option>${cats().map(c => `<option value="${escape(c.id)}" ${state.categoryFilter === c.id ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}</select></div><div class="total-strip"><span class="muted">${rows.length} операций · по доступным данным</span><strong class="money">${money(totals(rows).expense)}</strong></div>${transactionList(rows)}`}</div>`;
}
function payments() {
  const list = [...state.recurring].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.nextDate.localeCompare(b.nextDate));
  const history = [...state.payments].sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="lower-grid" style="margin-top:0"><section class="panel"><div class="panel-header"><h2>Предстоящие обязательства</h2><button class="button primary" data-action="add-recurring">＋ Добавить</button></div><p class="hint">Оплата учитывается только после подтверждения. Сроки показаны относительно сегодняшнего дня, независимо от месяца бюджета.</p>${list.length ? list.map(p => `<article class="payment-card"><div class="row"><span class="row-icon">${icon('payments')}</span><div class="row-main"><strong>${escape(p.name)}</strong><small>${dateLabel(p.nextDate)} · каждые ${p.interval} ${p.unit === 'days' ? 'дн.' : 'мес.'}</small></div><div class="row-amount"><strong class="money">${money(p.amountCents)}</strong><small>${p.unit === 'months' && p.interval > 1 ? `≈ ${money(Math.round(p.amountCents / p.interval))} / мес.` : 'По факту оплаты'}</small></div></div><div class="payment-actions"><span class="payment-status ${p.enabled && p.nextDate < localDate() ? 'negative' : 'muted'}">${dueText(p)}</span>${p.enabled ? `<button class="button secondary" data-action="pay" data-id="${escape(p.id)}">Подтвердить оплату</button>` : ''}<button class="icon-button" data-action="edit-recurring" data-id="${escape(p.id)}" aria-label="Изменить ${escape(p.name)}">${icon('edit')}</button><button class="icon-button" data-action="delete-recurring" data-id="${escape(p.id)}" aria-label="Удалить обязательство">${icon('trash')}</button></div></article>`).join('') : empty('У каждого платежа своё время', 'Добавьте название, сумму, следующую дату и периодичность. Мы ничего не назначаем за вас.')}</section><section class="panel"><div class="panel-header"><h2>История оплат</h2><span class="badge">${history.length} оплачено</span></div>${history.length ? history.map(p => `<div class="row"><span class="row-icon positive">✓</span><div class="row-main"><strong>${escape(p.name)}</strong><small>${dateLabel(p.date)} · оплачено${p.linked ? ' · связано с операцией' : ''}</small><small>Обязательство на ${dateLabel(p.dueDate)}</small></div><div class="row-amount"><strong class="money">${money(p.amountCents)}</strong></div></div>`).join('') : empty('История ещё чиста', 'Подтверждённые платежи появятся здесь. Наступление даты само по себе не создаёт расход.')}</section></div>`;
}
function incomes() {
  const rows = monthOperations().filter(t => t.type === 'income').sort((a, b) => b.date.localeCompare(a.date));
  return `<section class="panel"><div class="panel-header"><h2>Поступления за месяц</h2><button class="button primary" data-action="add-income">＋ Добавить доход</button></div><div class="total-strip"><span class="muted">${rows.length} операций · по доступным данным</span><strong class="money positive">${money(totals(rows).income)}</strong></div>${transactionList(rows)}</section><div style="margin-top:20px">${syncPanel()}</div>`;
}
function bars(rows, key) {
  const sums = new Map(); for (const t of rows) sums.set(t[key] || 'Прочее', (sums.get(t[key] || 'Прочее') || 0) + t.amountCents);
  const max = Math.max(1, ...sums.values());
  return sums.size ? [...sums].sort((a, b) => b[1] - a[1]).map(([name, value]) => `<div class="category-bar"><div class="label"><span>${escape(name)}</span><strong class="money">${money(value)}</strong></div>${progress(value, max)}</div>`).join('') : empty('Пока недостаточно данных', 'Диаграмма появится, когда будут операции в этом периоде.');
}
function analytics() {
  const rows = allOperations().filter(t => t.date.slice(0, 7) >= state.analyticsFrom && t.date.slice(0, 7) <= state.analyticsTo), result = totals(rows);
  const months = []; for (let m = state.analyticsFrom; m <= state.analyticsTo && months.length < 60; m = shiftMonth(m, 1)) months.push(m);
  const series = months.map(m => ({ month: m, ...totals(rows.filter(t => t.date.startsWith(m))), plan: planTotals(cats(m)).total }));
  const max = Math.max(1, ...series.flatMap(v => [v.income, v.expense]));
  const partial = !expenseComplete() || !incomeComplete();
  return `<div class="toolbar"><label class="field" style="margin:0">С месяца<input id="analytics-from" type="month" value="${state.analyticsFrom}" min="2000-01" max="2100-12"></label><label class="field" style="margin:0">По месяц<input id="analytics-to" type="month" value="${state.analyticsTo}" min="2000-01" max="2100-12"></label><button class="button secondary" data-action="analytics-year">Весь выбранный год</button></div>${partial ? '<div class="notice">Показаны только доступные операции. Итоги и графики неполные: подключите источники и дождитесь синхронизации. Рабочие расходы пока не включены.</div>' : '<p class="hint">Рабочие расходы Tattoo Finance пока не включены.</p>'}<div class="stats-grid" style="margin-bottom:20px">${stat('Доходы', result.income, 'По доступным операциям', 'positive')}${stat('Расходы', result.expense, 'По доступным операциям')}${stat('Результат', result.balance, 'По доступным операциям', result.balance < 0 ? 'negative' : 'positive')}${stat('Средние расходы', Math.round(result.expense / Math.max(1, months.length)), `${months.length} месяцев в периоде`)}</div><section class="panel"><div class="panel-header"><h2>Доходы и расходы по месяцам</h2><div class="chart-legend"><span><i class="legend-dot"></i>Доходы</span><span><i class="legend-dot orange"></i>Расходы</span></div></div>${rows.length ? `<div class="chart" role="img" aria-label="Динамика доходов и расходов. Точные значения в таблице ниже.">${series.map(v => `<div class="chart-column"><div class="chart-bar" style="height:${v.income / max * 100}%" title="${escape(monthLabel(v.month))}: доходы ${money(v.income)}"></div><div class="chart-bar expense" style="height:${v.expense / max * 100}%" title="Расходы ${money(v.expense)}"></div><span class="chart-label">${v.month.slice(5)}</span></div>`).join('')}</div>` : empty('Здесь будет ваша финансовая динамика', 'Никаких демонстрационных сумм — только ваши операции.')}<details><summary class="text-button">Точные значения по месяцам</summary><div class="table-scroll"><table class="annual-table"><thead><tr><th>Месяц</th><th>План</th><th>Доходы</th><th>Расходы</th><th>Результат</th></tr></thead><tbody>${series.map(v => `<tr><td>${escape(monthLabel(v.month))}</td><td>${money(v.plan)}</td><td>${money(v.income)}</td><td>${money(v.expense)}</td><td>${money(v.balance)}</td></tr>`).join('')}</tbody></table></div></details></section><div class="lower-grid"><section class="panel"><h2>Расходы по категориям</h2>${bars(rows.filter(t => t.type === 'expense'), 'categoryName')}</section><section class="panel"><h2>Доходы по источникам</h2>${bars(rows.filter(t => t.type === 'income'), 'incomeSource')}</section><section class="panel"><h2>Три направления расходов</h2>${bars(rows.filter(t => t.type === 'expense').map(t => ({ ...t, directionName: ({ car: 'Автомобиль', work: 'Тату-бизнес', home: 'Дом и семья' })[t.direction] })), 'directionName')}</section><section class="panel"><h2>Структура плана · ${escape(monthLabel(state.month))}</h2>${bars(monthlyPlan(cats()).map(c => ({ ...c, amountCents: c.planCents })), 'group')}</section></div><section class="panel table-panel"><div class="panel-header"><h2>План и факт · ${escape(monthLabel(state.month))}</h2><button class="text-button" data-action="suggest-plan">Предложить обновить план →</button></div>${comparison()}</section>`;
}
function settings() {
  const plan = state.plans.find(p => p.id === state.month), configured = cloudConfig.enabled && cloudConfig.ownerUid && cloudConfig.rulesReviewed;
  return `<div class="settings-grid"><section class="panel"><div class="panel-header"><h2>Хранение и подключение</h2><span class="badge ${store.mode}">${store.mode === 'local' ? 'Локально' : 'Firebase'}</span></div><p class="hint">${store.mode === 'local' ? 'Записи сохраняются в этом браузере. Они не передаются в Firebase и не объединяются с облачными данными. Для резервной копии используйте экспорт.' : 'Данные сохраняются в вашем пространстве Firestore. Автомобиль и доходы студий подключаются только для чтения.'}</p><div class="settings-row"><span>Тема оформления</span><select id="theme-select" aria-label="Тема оформления">${[['system', 'Как на устройстве'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([v, l]) => `<option value="${v}" ${state.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${store.mode === 'local' ? `<button class="button secondary" data-action="login" ${configured ? '' : 'disabled'}>Открыть облачный бюджет</button>${configured ? '' : '<p class="hint" style="margin-top:12px">Нужна настройка владельца, Firebase Authentication и проверка правил доступа. <a class="inline-link" href="./README.md">Инструкция подключения ↗</a></p>'}` : '<button class="button secondary" data-action="local-mode">Открыть данные этого браузера</button><button class="button secondary" data-action="logout">Выйти из My Apps</button>'}<button class="button secondary" data-action="export">Экспортировать свои данные</button><a class="button secondary mobile-only" href="../index.html">↖ My Apps</a></section><section class="panel"><div class="panel-header"><h2>История бюджета</h2><span class="badge">${plan?.closed ? 'Месяц закрыт' : 'Месяц открыт'}</span></div><p class="hint">Изменение категории можно применить на один месяц или на будущее. Закрытие сохраняет снимок плана и защищает ручные операции месяца. Исправления во внешних источниках продолжают учитываться.</p><button class="button secondary" data-action="close-month" ${plan?.closed || state.month >= localDate().slice(0, 7) ? 'disabled' : ''}>Закрыть ${escape(monthLabel(state.month))}</button><div class="settings-row"><label class="field" style="margin:0">Полная история ведётся с<input id="history-start" type="date" value="${escape(state.settings.historyStart || '')}"><small>Укажите дату, только если внесены все расходы с этого дня.</small></label></div><button class="text-button" data-action="save-history">Сохранить начало истории</button><button class="text-button" data-action="suggest-plan">Предложить обновить план →</button></section></div><div style="margin-top:20px">${syncPanel()}</div><section class="panel table-panel"><div class="panel-header"><h2>Категории и план</h2><button class="button primary" data-action="add-category">＋ Категория</button></div>${directionChips()}<label class="check-field"><input id="show-archived" type="checkbox" ${state.archived ? 'checked' : ''}>Показать архивные категории</label>${comparison(true)}</section><section class="panel table-panel"><div class="panel-header"><h2>Сопоставление Mini Budget</h2><span class="badge">Только чтение</span></div><p class="hint">Несопоставленные расходы входят в итоги автомобиля как расходы вне плана. Выберите категорию с источником Mini Budget. Старые «Конверты» не подключены.</p><div class="settings-grid" style="margin-top:14px">${MINI_CATEGORIES.map(name => `<label class="mapping-row"><span>${escape(name)}</span><select data-mapping="${escape(name)}" aria-label="Сопоставление ${escape(name)}"><option value="">Вне плана</option>${cats().filter(c => c.actualSource === 'mini_budget' && !c.archived).map(c => `<option value="${escape(c.id)}" ${state.settings.mappings.mini_budget[name] === c.id ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}</select></label>`).join('')}</div><button class="button secondary" data-action="save-mappings">Сохранить сопоставления</button></section>`;
}
function render() {
  const section = sections[state.page];
  $('#navigation').innerHTML = Object.entries(sections).map(([key, [name]]) => `<a href="#${key}" class="nav-item ${state.page === key ? 'active' : ''}" ${state.page === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${name}</span></a>`).join('');
  $('#section-label').textContent = section[0]; $('#page-title').textContent = section[1]; $('#page-subtitle').textContent = section[2]; $('#month').value = state.month;
  $('#mode-badge').className = `badge ${store?.mode === 'local' ? 'local' : expenseComplete() && incomeComplete() ? 'ready' : ''}`;
  $('#mode-badge').textContent = store?.mode === 'local' ? 'На этом устройстве' : expenseComplete() && incomeComplete() ? 'Синхронизировано' : 'Подключение источников';
  const dataErrors = Object.entries(state.statuses).filter(([, s]) => ['error', 'partial', 'cached'].includes(s.state));
  if (store?.mode === 'cloud' && !navigator.onLine) dataErrors.push(['transactions', { state: 'cached', error: 'Нет подключения к интернету. Данные могут быть устаревшими.' }]);
  $('#connection-notice').innerHTML = store?.mode === 'local' ? '<div class="notice"><span>Локальный режим · данные сохранены на этом устройстве. Mini Budget и Tattoo Finance пока не подключены.</span><button class="text-button" data-action="navigate" data-page="settings">Настроить →</button></div>' : dataErrors.length ? `<div class="notice"><span>Данные неполные или устарели: ${dataErrors.map(([k, s]) => `${escape(sourceNames[k] || 'Budget Control')} — ${escape(s.error || statusNames[s.state])}`).join('; ')}</span><button class="text-button" data-action="retry">Повторить</button></div>` : '<div class="notice"><span>Рабочие расходы Tattoo Finance отключены в версии 1.0. Они пока не входят в расходы и финансовый результат.</span></div>';
  if (!state.settings) { $('#main').innerHTML = empty('Загружаем бюджет', 'Ожидаем настройки и данные. Если подключение недоступно, вернитесь в локальный режим.', 'local-mode', 'Открыть локальный режим'); return; }
  $('#main').innerHTML = ({ dashboard, expenses, payments, income: incomes, analytics, settings })[state.page]();
}

const field = (label, name, value = '', type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
const options = (items, selected) => items.map(([value, label]) => `<option value="${escape(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escape(label)}</option>`).join('');
const select = (label, name, items, selected, extra = '') => `<label class="field"><span>${label}</span><select name="${name}" ${extra}>${options(items, selected)}</select></label>`;
const check = (label, name, checked) => `<label class="check-field"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}>${label}</label>`;
const euroInput = value => value == null ? '' : (value / 100).toFixed(2);
function showDialog(title, fields, save, label = 'Сохранить') {
  lastFocused = document.activeElement; $('#dialog-title').textContent = title; $('#dialog-fields').innerHTML = fields; $('#form-error').textContent = ''; $('#save-button').textContent = label; $('#save-button').disabled = false;
  dialogSave = save; $('#editor').showModal();
  // Focus synchronously: a deferred focus can steal typing from a field the user
  // has already selected immediately after opening the dialog.
  $('#dialog-fields input:not([type=checkbox]), #dialog-fields select, #save-button')?.focus();
}
function closeDialog() { if (busy) return; $('#editor').close(); dialogSave = null; if (lastFocused?.isConnected) lastFocused.focus(); else $('#main').focus({ preventScroll: true }); }
function formObject() { const f = new FormData($('#editor-form')); return Object.fromEntries(f.entries()); }
async function command(command, message = 'Сохранено') { const result = await store.command(command); toast(result?.alreadyPaid ? 'Этот платёж уже подтверждён.' : message); }
function operationDialog(type, id) {
  const previous = state.transactions.find(t => t.id === id), day = previous?.date || (state.month === localDate().slice(0, 7) ? localDate() : `${state.month}-01`);
  const list = cats(day.slice(0, 7)).filter(c => !c.archived && c.actualSource === 'budget_control');
  const documentId = id || uuid();
  showDialog(previous ? 'Изменить операцию' : type === 'expense' ? 'Новый расход' : 'Новый доход',
    field('Сумма, €', 'amount', euroInput(previous?.amountCents), 'text', 'inputmode="decimal" required autocomplete="off" class="amount-input" placeholder="0,00" maxlength="14"') +
    (type === 'expense' ? select('Категория', 'categoryId', list.map(c => [c.id, c.name]), previous?.categoryId || 'groceries', 'required') : `${field('Источник дохода', 'incomeSource', previous?.incomeSource || 'Прочие поступления', 'text', 'required maxlength="100" list="income-sources"')}<datalist id="income-sources"><option>Аренда недвижимости</option><option>Другая работа</option><option>Прочие поступления</option></datalist>`) +
    field('Дата операции', 'date', day, 'date', 'required min="2000-01-01" max="2100-12-31"') + `<label class="field"><span>Комментарий <small style="display:inline">· необязательно</small></span><textarea name="description" maxlength="500" placeholder="Например, покупки на неделю">${escape(previous?.description || '')}</textarea></label>${type === 'expense' ? '<p class="hint">Для автомобиля и рабочих расходов используйте приложение-источник. Перевод между своими счетами не является расходом или доходом.</p>' : ''}`,
    async () => { const f = formObject(); await command({ type: 'operation', id: documentId, data: { type, amountCents: cents(f.amount), date: f.date, categoryId: f.categoryId || '', incomeSource: f.incomeSource?.trim() || '', description: f.description.trim() } }, type === 'expense' ? 'Расход сохранён' : 'Доход сохранён'); });
}
function categoryFields(c) { const { name, amountCents, periodMonths, group, direction, required, kind, actualSource, archived } = c; return { name, amountCents, periodMonths, group, direction, required, kind, actualSource, archived }; }
function categoryDialog(id) {
  const c = cats().find(c => c.id === id) || { name: '', amountCents: 0, periodMonths: 1, group: state.settings.groups[0], direction: 'home', required: true, kind: 'average', actualSource: 'budget_control', archived: false };
  const month = state.month, categoryId = id || uuid();
  const average = id ? averageFor(allOperations(), id, month, state.settings.historyStart, sourceReady(c.actualSource)) : null;
  showDialog(id ? 'Настроить категорию' : 'Новая категория',
    field('Название', 'name', c.name, 'text', 'required maxlength="100"') +
    `<div class="field-grid">${field('Плановая сумма, €', 'amount', euroInput(c.amountCents), 'text', 'inputmode="decimal" required maxlength="14"')}${select('Период плана', 'periodMonths', [[1, 'Месяц'], [3, '3 месяца'], [6, '6 месяцев'], [12, 'Год'], [24, 'Два года']], c.periodMonths)}</div>` +
    `${field('Группа', 'group', c.group, 'text', 'required list="groups" maxlength="80"')}<datalist id="groups">${state.settings.groups.map(g => `<option>${escape(g)}</option>`).join('')}</datalist>` +
    `<div class="field-grid">${select('Направление', 'direction', [['home', 'Дом и семья'], ['car', 'Автомобиль'], ['work', 'Тату-бизнес']], c.direction)}${select('Тип плана', 'kind', [['regular', 'Регулярный платёж'], ['average', 'Среднемесячный ориентир']], c.kind)}</div>` +
    select('Источник фактических расходов', 'actualSource', [['budget_control', 'Вручную · Budget Control'], ['mini_budget', 'Mini Budget'], ['tattoo_expense', 'Tattoo Finance · пока отключён']], c.actualSource) +
    check('Обязательный расход', 'required', c.required) + check('Категория в архиве', 'archived', c.archived) +
    select('Применить изменения', 'scope', [['future', `С ${monthLabel(month)} и далее`], ['month', 'Только выбранный месяц']], 'future') +
    `<p class="hint">Среднее за предыдущие 12 полных месяцев: ${average == null ? 'недостаточно подтверждённой истории' : `<strong>${money(average)} / мес.</strong>`}. План не создаёт оплат. Даты обязательств задаются в разделе «Платежи».</p>`,
    async () => { const f = formObject(); await command({ type: 'category', id: categoryId, month, scope: f.scope, data: { name: f.name.trim(), amountCents: cents(f.amount, true), periodMonths: Number(f.periodMonths), group: f.group.trim(), direction: f.direction, kind: f.kind, actualSource: f.actualSource, required: f.required === 'on', archived: f.archived === 'on' } }, 'Категория и история плана сохранены'); });
}
function recurringDialog(id) {
  const p = state.recurring.find(p => p.id === id), recurringId = id || uuid();
  const preset = p && p.unit === 'months' && [1, 3, 6, 12, 24].includes(p.interval) ? String(p.interval) : p ? 'custom' : '1';
  showDialog(p ? 'Изменить платёж' : 'Регулярный платёж',
    field('Название расхода', 'name', p?.name || '', 'text', 'required maxlength="100" placeholder="Например, аренда квартиры"') +
    field('Сумма, €', 'amount', euroInput(p?.amountCents), 'text', 'inputmode="decimal" required maxlength="14" placeholder="0,00"') +
    field('Дата следующего платежа', 'nextDate', p?.nextDate || '', 'date', 'required min="2000-01-01" max="2100-12-31"') +
    select('Периодичность', 'preset', [[1, 'Каждый месяц'], [3, 'Каждые 3 месяца'], [6, 'Каждые 6 месяцев'], [12, 'Каждый год'], [24, 'Каждые 2 года'], ['custom', 'Произвольный интервал']], preset) +
    `<div id="custom-interval" class="field-grid" ${preset === 'custom' ? '' : 'hidden'}>${field('Интервал', 'interval', p?.interval || 1, 'number', 'min="1" max="3660" step="1"')}${select('Единица', 'unit', [['months', 'Месяцы'], ['days', 'Дни']], p?.unit || 'months')}</div>` +
    select('Категория расхода', 'categoryId', cats().filter(c => !c.archived).map(c => [c.id, c.name]), p?.categoryId || 'rent', 'required') +
    check('Платёж включён', 'enabled', p?.enabled ?? true) + '<p class="hint">Расход появится после подтверждения реальной оплаты. Платёж из внешнего приложения можно связать с обязательством.</p>',
    async () => { const f = formObject(); await command({ type: 'recurring', id: recurringId, data: { name: f.name.trim(), amountCents: cents(f.amount), nextDate: f.nextDate, interval: Number(f.preset === 'custom' ? f.interval : f.preset), unit: f.preset === 'custom' ? f.unit : 'months', categoryId: f.categoryId, enabled: f.enabled === 'on' } }, 'Регулярный платёж сохранён'); });
}
function payDialog(id) {
  const p = state.recurring.find(p => p.id === id); if (!p) return;
  const category = cats().find(c => c.id === p.categoryId), manual = category?.actualSource === 'budget_control';
  const linkedIds = new Set(state.payments.map(p => p.operationId));
  const choices = allOperations().filter(t => t.type === 'expense' && t.categoryId === p.categoryId && !linkedIds.has(t.id) && !t.paymentId).sort((a, b) => b.date.localeCompare(a.date));
  showDialog('Подтвердить оплату', `<div class="notice"><span><strong>${escape(p.name)}</strong><br>Срок: ${dateLabel(p.nextDate)} · план ${money(p.amountCents)}</span></div>` +
    select('Как учесть оплату', 'linkedId', [...(manual ? [['', 'Создать фактический расход']] : [['', 'Выберите существующую операцию']]), ...choices.map(t => [t.id, `${dateLabel(t.date)} · ${money(t.amountCents)} · ${t.description || sourceNames[t.source]}`])], '') +
    `<div id="new-payment-fields" ${manual ? '' : 'hidden'}>${field('Реальная сумма оплаты, €', 'amount', euroInput(p.amountCents), 'text', 'inputmode="decimal" maxlength="14"')}${field('Дата фактической оплаты', 'date', localDate(), 'date', 'min="2000-01-01" max="2100-12-31"')}</div>` +
    `<p class="hint">${manual ? 'При связывании берём сумму и дату исходной операции. Новый расход не создаётся.' : 'Добавьте расход в приложении-источнике, затем выберите его здесь. При необходимости переключите месяц для загрузки другого периода.'} Одна операция может подтвердить только одно обязательство.</p>`,
    async () => { const f = formObject(); if (!manual && !f.linkedId) throw new Error('Выберите существующую расходную операцию.'); await command({ type: 'pay', id, dueDate: p.nextDate, linkedId: f.linkedId || '', date: f.date || '', amountCents: f.linkedId ? 0 : cents(f.amount) }, 'Оплата подтверждена. Следующий срок рассчитан.'); }, 'Подтвердить оплату');
}
function confirmDialog(title, description, save, label = 'Подтвердить') { showDialog(title, `<p class="hint">${escape(description)}</p>`, save, label); }
function suggestDialog() {
  const month = state.month;
  const suggestions = cats().filter(c => !c.archived).map(c => ({ ...c, average: averageFor(allOperations(), c.id, month, state.settings.historyStart, sourceReady(c.actualSource)) })).filter(c => c.average != null);
  if (!suggestions.length) { showDialog('Предложение для плана', '<p class="hint">Для предложения нужны 12 полных месяцев доступных данных до выбранного месяца. В настройках укажите подтверждённое начало полной истории и подключите нужный источник. План останется прежним.</p>', async () => {}, 'Понятно'); return; }
  showDialog('Обновить план по истории', select('Категория и среднее за 12 месяцев', 'categoryId', suggestions.map(c => [c.id, `${c.name} · ${money(c.average)} / мес.`]), suggestions[0].id) + select('Применить', 'scope', [['month', 'Только выбранный месяц'], ['future', 'К выбранному и следующим месяцам']], 'month') + '<p class="hint">После подтверждения план выбранной категории будет заменён её средним расходом. Для годового плана среднее умножается на 12, для двухлетнего — на 24.</p>', async () => { const f = formObject(), c = suggestions.find(c => c.id === f.categoryId); await command({ type: 'category', id: c.id, month, scope: f.scope, data: { ...categoryFields(c), amountCents: c.average * c.periodMonths } }, 'Предложение применено к плану'); }, 'Применить предложение');
}
async function useCloud(user) {
  MyApps.requireOwner();
  if (user.uid !== cloudConfig.ownerUid) throw new Error('Нет доступа');
  await setStore(new CloudStore(runtime.sdk, runtime.db, user.uid));
  localStorage.setItem('budget-control.mode', 'cloud');
}
function loginDialog() {
  return loadCloud(cloudConfig).then(async next => { runtime = next; await useCloud(runtime.auth.currentUser); });
}
async function exportData() {
  const data = await store.exportData(); const blob = new Blob([JSON.stringify({ application: 'Budget Control', version: 1, mode: store.mode, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `budget-control-${store.mode}-${localDate()}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); toast('Резервная копия подготовлена');
}
function navigate(page) { state.page = page; location.hash = page; scheduleRender(); }
function changeMonth(month) {
  if (!validMonth(month) || month < '2000-01' || month > '2100-12') return;
  state.month = month; state.categoryFilter = ''; store.setRange(queryRange()); scheduleRender();
}
function updateAnalytics(from, to) {
  if (!validMonth(from) || !validMonth(to) || from > to || shiftMonth(from, 59) < to) { toast('Выберите период от 1 до 60 месяцев.'); scheduleRender(); return; }
  state.analyticsFrom = from; state.analyticsTo = to; store.setRange(queryRange()); scheduleRender();
}
async function action(element) {
  const { action: name, id } = element.dataset;
  if (name === 'close-dialog') return closeDialog();
  if (busy) return;
  if (name === 'navigate') return navigate(element.dataset.page);
  if (name === 'prev-month') return changeMonth(shiftMonth(state.month, -1));
  if (name === 'next-month') return changeMonth(shiftMonth(state.month, 1));
  if (name === 'local-mode') { authUnsubscribe?.(); authUnsubscribe = null; localStorage.setItem('budget-control.mode', 'local'); return setStore(new LocalStore()); }
  if (!state.settings) return toast('Дождитесь загрузки настроек.');
  if (name === 'add-expense') return operationDialog('expense');
  if (name === 'add-income') return operationDialog('income');
  if (name === 'edit-operation') return operationDialog(state.transactions.find(t => t.id === id)?.type, id);
  if (name === 'delete-operation') return confirmDialog('Удалить операцию?', 'Операция будет удалена из Budget Control, и итоги пересчитаются.', () => command({ type: 'delete-operation', id }, 'Операция удалена'), 'Удалить');
  if (name === 'add-category' || name === 'edit-category') return categoryDialog(id);
  if (name === 'add-recurring' || name === 'edit-recurring') return recurringDialog(id);
  if (name === 'delete-recurring') return confirmDialog('Удалить обязательство?', 'Будущие напоминания исчезнут. История подтверждённых оплат и фактические расходы сохранятся.', () => command({ type: 'delete-recurring', id }, 'Обязательство удалено'), 'Удалить');
  if (name === 'pay') return payDialog(id);
  if (name === 'filter-direction') { state.direction = element.dataset.direction; scheduleRender(); return; }
  if (name === 'direction') { state.direction = element.dataset.direction; state.expenseTab = 'history'; return navigate(state.direction === 'work' ? 'income' : 'expenses'); }
  if (name === 'expense-tab') { state.expenseTab = element.dataset.tab; scheduleRender(); return; }
  if (name === 'login') return loginDialog();
  if (name === 'logout') return MyApps.signOut();
  if (name === 'retry') { const active = store; active.stop(); return active.start(receive, queryRange()); }
  if (name === 'export') return exportData();
  if (name === 'close-month') { const month = state.month; return confirmDialog('Закрыть месяц?', `План и ручные операции за ${monthLabel(month)} будут защищены от изменений. Это действие нельзя отменить в версии 1.0. Внешние операции продолжат отражать источник.`, () => command({ type: 'close-month', month, currentMonth: localDate().slice(0, 7) }, 'Месяц закрыт'), 'Закрыть месяц'); }
  if (name === 'save-mappings') { const mini_budget = Object.fromEntries([...document.querySelectorAll('[data-mapping]')].map(s => [s.dataset.mapping, s.value])); return command({ type: 'settings', data: { mappings: { ...state.settings.mappings, mini_budget } } }, 'Сопоставления сохранены'); }
  if (name === 'save-history') return command({ type: 'settings', data: { historyStart: $('#history-start').value } }, 'Начало истории сохранено');
  if (name === 'suggest-plan') return suggestDialog();
  if (name === 'analytics-year') return updateAnalytics(`${state.month.slice(0, 4)}-01`, `${state.month.slice(0, 4)}-12`);
}
function showFatal(error) { $('#main').innerHTML = `<div class="panel error-panel"><h2>Не удалось открыть бюджет</h2><p class="hint">${escape(error.message)}</p><button class="button secondary" data-action="local-mode">Локальный режим</button></div>`; toast(error.message); }
document.addEventListener('click', event => { const target = event.target.closest('[data-action]'); if (target) action(target).catch(error => toast(error.message)); });
$('#editor-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !dialogSave) return; busy = true; $('#save-button').disabled = true; $('#form-error').textContent = '';
  try { await dialogSave(); busy = false; closeDialog(); } catch (error) { $('#form-error').textContent = error.message || 'Не удалось сохранить. Попробуйте ещё раз.'; } finally { busy = false; $('#save-button').disabled = false; }
});
$('#editor').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
document.addEventListener('change', event => {
  const t = event.target;
  if (t.id === 'month') changeMonth(t.value);
  if (t.id === 'theme-select') setTheme(t.value);
  if (t.id === 'category-filter') { state.categoryFilter = t.value; scheduleRender(); }
  if (t.id === 'show-archived') { state.archived = t.checked; scheduleRender(); }
  if (t.id === 'analytics-from') updateAnalytics(t.value, state.analyticsTo);
  if (t.id === 'analytics-to') updateAnalytics(state.analyticsFrom, t.value);
  if (t.name === 'preset') $('#custom-interval').hidden = t.value !== 'custom';
  if (t.name === 'actualSource' && t.value !== 'budget_control') $('#editor-form [name=direction]').value = t.value === 'mini_budget' ? 'car' : 'work';
  if (t.name === 'linkedId' && $('#new-payment-fields')) $('#new-payment-fields').hidden = !!t.value || !$('#new-payment-fields input[name=amount]');
});
document.addEventListener('input', event => {
  if (event.target.id === 'search') {
    const selection = event.target.selectionStart; state.search = event.target.value; render(); $('#search').focus(); $('#search').setSelectionRange(selection, selection);
  }
});
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'system') setTheme('system'); });
addEventListener('hashchange', () => { state.page = sections[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard'; scheduleRender(); window.scrollTo(0, 0); });
addEventListener('offline', () => { toast('Нет подключения к интернету. Облачные данные могут быть неполными.'); scheduleRender(); });
addEventListener('online', () => { toast('Подключение восстановлено'); if (store?.mode === 'cloud') { const active = store; active.stop(); active.start(receive, queryRange()).catch(error => toast(error.message)); } });
addEventListener('pagehide', () => store?.stop());
addEventListener('pageshow', event => { if (event.persisted && store) store.start(receive, queryRange()).catch(showFatal); });
async function start() {
  MyApps.requireOwner();
  try { setTheme(localStorage.getItem('budget-control.theme') || 'system'); } catch { setTheme('system'); }
  state.page = sections[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  if (localStorage.getItem('budget-control.mode') === 'local') await setStore(new LocalStore());
  else { runtime = await loadCloud(cloudConfig); await useCloud(runtime.auth.currentUser); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('../service-worker.js', { updateViaCache: 'none' }).catch(() => toast('Офлайн-кеш недоступен.'));
}
start().catch(showFatal);
