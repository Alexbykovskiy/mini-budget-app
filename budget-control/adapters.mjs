import { cents, validDate } from './core.mjs';
const norm = x => String(x || '').trim().toLocaleLowerCase('ru');
function base(id, data, source, type, direction) {
  if (data.type === 'transfer' || data.isTransfer === true) return null;
  if (data.currency && data.currency !== 'EUR') throw new Error(`В записи ${id} валюта отличается от EUR.`);
  if (!validDate(data.date)) throw new Error(`В записи ${id} некорректная дата.`);
  return { id: `${source}:${id}`, documentId: id, source, type, direction, amountCents: cents(data.amount), currency: 'EUR', date: data.date, description: String(data.note || data.comment || data.workType || data.expenseType || data.category || ''), readOnly: true };
}
export function miniBudgetAdapter(id, data, settings) {
  const row = base(id, data, 'mini_budget', 'expense', 'car');
  return row && { ...row, originalCategory: data.category || 'Другое', categoryId: settings.mappings.mini_budget[data.category] || 'unmapped-car' };
}
export function tattooIncomeAdapter(id, data) {
  const row = base(id, data, 'tattoo_income', 'income', 'work');
  return row && { ...row, categoryId: 'tattoo-income', incomeSource: data.studio || 'Tattoo Finance', description: [data.studio, data.workType].filter(Boolean).join(' · ') };
}
export function tattooExpenseAdapter(id, data, settings) {
  if (norm(data.expenseType || data.category) === 'транспорт') return null;
  const row = base(id, data, 'tattoo_expense', 'expense', 'work');
  return row && { ...row, originalCategory: data.expenseType || 'Прочее', categoryId: settings.mappings.tattoo_expense[data.expenseType] || 'unmapped-work' };
}
export const SOURCE_DEFINITIONS = {
  mini_budget: { path: 'users/mini/expenses', setting: 'miniBudget', adapter: miniBudgetAdapter },
  tattoo_income: { path: 'incomes', setting: 'tattooIncome', adapter: tattooIncomeAdapter },
  tattoo_expense: { path: 'expenses', setting: 'tattooExpenses', adapter: tattooExpenseAdapter },
};
export function adaptSnapshot(documents, adapter, settings) {
  const rows = [], errors = [];
  for (const document of documents) { try { const row = adapter(document.id, document.data(), settings); if (row) rows.push(row); } catch (error) { errors.push(error.message); } }
  return { rows, errors };
}
