export const MONEY_LIMIT = 100_000_000_00;
export const PERIODS = [1, 3, 6, 12, 24];
export function cents(value, allowZero = false) {
  const text = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Введите сумму с точностью до двух знаков.');
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > MONEY_LIMIT || result < (allowZero ? 0 : 1)) throw new Error('Недопустимая сумма.');
  return result;
}
export function validMonth(value) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && +value.slice(0, 4) >= 1; }
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !validMonth(value.slice(0, 7))) return false;
  const [y, m, d] = value.split('-').map(Number);
  return d > 0 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function shiftMonth(month, offset) {
  if (!validMonth(month)) throw new Error('Некорректный месяц.');
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function daysBetween(a, b) {
  if (!validDate(a) || !validDate(b)) throw new Error('Некорректная дата.');
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}
export function nextDue(date, interval, unit = 'months', anchorDay = +date.slice(8)) {
  if (!validDate(date) || !Number.isInteger(interval) || interval < 1 || interval > 3660) throw new Error('Проверьте дату и периодичность.');
  if (unit === 'days') {
    const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + interval); return d.toISOString().slice(0, 10);
  }
  if (unit !== 'months') throw new Error('Неизвестная периодичность.');
  const month = shiftMonth(date.slice(0, 7), interval);
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(Math.min(anchorDay, new Date(Date.UTC(y, m, 0)).getUTCDate())).padStart(2, '0')}`;
}
export function categoriesFor(settings, month, plan) {
  if (plan?.closed) return plan.categories;
  return settings.categories.flatMap(category => {
    const version = [...category.versions].filter(v => v.from <= month).sort((a, b) => b.from.localeCompare(a.from))[0];
    return version ? [{ ...version, ...category.overrides?.[month], id: category.id }] : [];
  });
}
// Distribute fractional cents once across the plan (largest remainder), so totals agree.
export function monthlyPlan(categories) {
  const rows = categories.filter(c => !c.archived).map(c => ({ ...c, units: c.amountCents * (24 / c.periodMonths), planCents: Math.floor(c.amountCents / c.periodMonths) }));
  let remainder = Math.round(rows.reduce((n, c) => n + c.units, 0) / 24) - rows.reduce((n, c) => n + c.planCents, 0);
  for (const row of [...rows].sort((a, b) => (b.units % 24) - (a.units % 24) || a.id.localeCompare(b.id))) { if (remainder-- > 0) row.planCents++; }
  return rows;
}
export function planTotals(categories) {
  return monthlyPlan(categories).reduce((sum, c) => ({ total: sum.total + c.planCents, required: sum.required + (c.required ? c.planCents : 0), optional: sum.optional + (!c.required ? c.planCents : 0), monthly: sum.monthly + (c.periodMonths === 1 ? c.amountCents : 0) }), { total: 0, required: 0, optional: 0, monthly: 0 });
}
export function operationsUnique(rows) { return [...new Map(rows.filter(Boolean).filter(x => x.type !== 'transfer').map(x => [x.id, x])).values()]; }
export function totals(rows) { return operationsUnique(rows).reduce((s, t) => { if (t.type === 'expense') s.expense += t.amountCents; if (t.type === 'income') s.income += t.amountCents; s.balance = s.income - s.expense; return s; }, { income: 0, expense: 0, balance: 0 }); }
export function averageFor(rows, categoryId, endMonth, coveredFrom, complete) {
  const start = shiftMonth(endMonth, -12);
  if (!complete || !coveredFrom || coveredFrom > `${start}-01`) return null;
  return Math.round(operationsUnique(rows).filter(t => t.categoryId === categoryId && t.type === 'expense' && t.date >= `${start}-01` && t.date < `${endMonth}-01`).reduce((s, t) => s + t.amountCents, 0) / 12);
}
export function validateCategory(c) {
  if (!c.name?.trim() || c.name.length > 100 || !c.group?.trim() || c.group.length > 80) throw new Error('Укажите название и группу категории.');
  if (!Number.isSafeInteger(c.amountCents) || c.amountCents < 0 || c.amountCents > MONEY_LIMIT || !PERIODS.includes(c.periodMonths)) throw new Error('Проверьте сумму и период плана.');
  if (!['home', 'car', 'work'].includes(c.direction) || !['budget_control', 'mini_budget', 'tattoo_expense'].includes(c.actualSource) || !['regular', 'average'].includes(c.kind)) throw new Error('Проверьте параметры категории.');
  if ((c.actualSource === 'mini_budget' && c.direction !== 'car') || (c.actualSource === 'tattoo_expense' && c.direction !== 'work')) throw new Error('Mini Budget относится к автомобилю, Tattoo Finance — к тату-бизнесу.');
}
export function validateOperation(t) {
  if (!['expense', 'income'].includes(t.type) || !Number.isSafeInteger(t.amountCents) || t.amountCents < 1 || t.amountCents > MONEY_LIMIT || !validDate(t.date)) throw new Error('Проверьте сумму и дату операции.');
  if (t.type === 'expense' && !t.categoryId) throw new Error('Выберите категорию.');
  if (t.type === 'income' && !t.incomeSource?.trim()) throw new Error('Укажите источник дохода.');
  if ((t.description || '').length > 500 || (t.incomeSource || '').length > 100) throw new Error('Комментарий или источник слишком длинный.');
}
