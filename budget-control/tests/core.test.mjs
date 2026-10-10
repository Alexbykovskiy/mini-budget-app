import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSettings } from '../seed.mjs';
import { cents, categoriesFor, planTotals, monthlyPlan, totals, nextDue, daysBetween, validDate, averageFor, shiftMonth } from '../core.mjs';
import { miniBudgetAdapter, tattooIncomeAdapter, tattooExpenseAdapter, adaptSnapshot } from '../adapters.mjs';
import { reminderFor } from '../reminders.mjs';
const settings = initialSettings();
test('26 defaults exactly match all four requested budget totals', () => {
  const categories = categoriesFor(settings, '2026-10');
  assert.equal(categories.length, 26);
  assert.deepEqual(planTotals(categories), { total: 392992, required: 325992, optional: 67000, monthly: 375200 });
  assert.equal(monthlyPlan(categories).reduce((s, c) => s + c.planCents, 0), 392992);
  assert.equal(settings.integrations.tattooExpenses, false);
});
test('currency conversion is exact and rejects invalid money', () => {
  assert.equal(cents('1 200,09'), 120009); assert.equal(cents(0.29), 29); assert.equal(cents('0', true), 0);
  for (const value of ['1.001', '-3', 'NaN', '', '3x', '1e3', 'Infinity', '0', 0.1 + 0.2]) assert.throws(() => cents(value));
});
test('end-of-month recurrence retains original anchor and handles leap years', () => {
  assert.equal(nextDue('2026-01-31', 1), '2026-02-28');
  assert.equal(nextDue('2026-02-28', 1, 'months', 31), '2026-03-31');
  assert.equal(nextDue('2024-02-29', 12), '2025-02-28');
  assert.equal(nextDue('2024-02-29', 24), '2026-02-28');
  assert.equal(nextDue('2026-11-15', 12), '2027-11-15');
  assert.equal(nextDue('2026-12-31', 3), '2027-03-31');
  assert.equal(nextDue('2026-03-28', 2, 'days'), '2026-03-30');
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('2024-02-29'), true);
  assert.throws(() => nextDue('2026-02-30', 1));
});
test('adapters match the actual legacy fields and never mutate source data', () => {
  const data = { category: 'Топливо', amount: 65.29, date: '2026-10-10', note: 'Заправка' }, original = structuredClone(data);
  const car = miniBudgetAdapter('same-id', data, settings);
  assert.equal(car.categoryId, 'fuel'); assert.equal(car.amountCents, 6529); assert.equal(car.id, 'mini_budget:same-id');
  assert.deepEqual(data, original);
  const income = tattooIncomeAdapter('same-id', { studio: 'Berlin', workType: 'Tattoo', amount: 500, date: data.date });
  assert.equal(income.id, 'tattoo_income:same-id'); assert.equal(income.incomeSource, 'Berlin');
  assert.deepEqual(totals([car, car, income]), { expense: 6529, income: 50000, balance: 43471 });
  assert.equal(miniBudgetAdapter('t', { ...data, type: 'transfer' }, settings), null);
});
test('all professional transport is excluded; other professional costs retained', () => {
  for (const label of ['Транспорт', ' транспорт ', 'ТРАНСПОРТ']) assert.equal(tattooExpenseAdapter('id', { expenseType: label, amount: 20, date: '2026-10-10' }, settings), null);
  const food = tattooExpenseAdapter('f', { expenseType: 'Еда', amount: 20, date: '2026-10-10' }, settings);
  assert.equal(food.direction, 'work'); assert.equal(food.amountCents, 2000);
  assert.equal(tattooExpenseAdapter('l', { expenseType: 'Жильё', amount: 200, date: '2026-10-10' }, settings).categoryId, 'work-lodging');
});
test('invalid source records are visible as errors, not silently zero', () => {
  const data = [{ id: 'bad', data: () => ({ amount: 'x', date: '2026-10-10' }) }, { id: 'valid', data: () => ({ amount: 10, date: '2026-10-10', category: 'Другое' }) }];
  const output = adaptSnapshot(data, miniBudgetAdapter, settings);
  assert.equal(output.errors.length, 1); assert.equal(output.rows.length, 1); assert.equal(output.rows[0].categoryId, 'unmapped-car');
  assert.throws(() => miniBudgetAdapter('usd', { amount: 20, date: '2026-10-10', currency: 'USD' }, settings));
});
test('averages require full 12-month coverage and exclude current month and transfers', () => {
  const rows = [{ id: 'a', type: 'expense', categoryId: 'groceries', date: '2025-10-01', amountCents: 120000 }, { id: 'b', type: 'expense', categoryId: 'groceries', date: '2026-10-01', amountCents: 99000 }];
  assert.equal(averageFor(rows, 'groceries', '2026-10', '2025-10-01', true), 10000);
  assert.equal(averageFor(rows, 'groceries', '2026-10', '2025-10-02', true), null);
  assert.equal(averageFor(rows, 'groceries', '2026-10', '2025-01-01', false), null);
});
test('reminders expose expected, overdue and disabled states without generating payments', () => {
  const payment = { id: 'insurance', name: 'Страховка', amountCents: 23500, enabled: true, nextDate: '2026-11-15' };
  assert.equal(reminderFor(payment, '2026-10-10').daysUntil, 36);
  assert.equal(reminderFor(payment, '2026-10-10').status, 'expected');
  assert.equal(reminderFor(payment, '2026-11-16').status, 'overdue');
  assert.equal(reminderFor({ ...payment, enabled: false }, '2026-11-16').status, 'disabled');
});
