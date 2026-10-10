import { initialSettings } from './seed.mjs';
import { categoriesFor, validateCategory, validateOperation, validDate, validMonth, nextDue } from './core.mjs';
import { SOURCE_DEFINITIONS } from './adapters.mjs';

export const stamp = () => new Date().toISOString();
export const paymentKey = (id, due) => `${id}_${due}`;
export const linkKey = id => encodeURIComponent(id);
async function writableMonth(tx, month) {
  if (!validMonth(month)) throw new Error('Некорректный месяц.');
  if ((await tx.get('plans', month))?.closed) throw new Error('Месяц закрыт. Его план и ручные операции защищены от изменений.');
}
export async function initialize(tx) { if (!await tx.get('settings', 'main')) tx.set('settings', 'main', { ...initialSettings(), createdAt: stamp(), updatedAt: stamp() }); }

// All reads precede writes: compatible with Firestore retries and atomic transactions.
export async function executeCommand(tx, command) {
  const { type, id, data, month } = command;
  const now = stamp();
  if (type === 'category') {
    await writableMonth(tx, month); validateCategory(data);
    const settings = await tx.get('settings', 'main');
    const categories = [...settings.categories];
    const index = categories.findIndex(c => c.id === id);
    const category = index < 0 ? { id, versions: [], overrides: {} } : structuredClone(categories[index]);
    const fields = { ...data, from: month };
    if (command.scope === 'month') category.overrides[month] = fields;
    else { category.versions = [...category.versions.filter(v => v.from !== month), fields]; delete category.overrides[month]; }
    // A category created for one month needs a hidden base for other months.
    if (!category.versions.length) category.versions.push({ ...fields, archived: true });
    if (index < 0) categories.push(category); else categories[index] = category;
    const groups = [...new Set([...settings.groups, data.group])];
    tx.set('settings', 'main', { ...settings, categories, groups, updatedAt: now });
  } else if (type === 'settings') {
    const settings = await tx.get('settings', 'main');
    if (data.historyStart && !validDate(data.historyStart)) throw new Error('Некорректная дата начала истории.');
    tx.set('settings', 'main', { ...settings, ...data, categories: settings.categories, updatedAt: now });
  } else if (type === 'operation' || type === 'delete-operation') {
    const previous = await tx.get('transactions', id);
    if (previous) await writableMonth(tx, previous.date.slice(0, 7));
    if (previous?.paymentId || await tx.get('links', linkKey(`budget_control:${id}`))) throw new Error('Операция связана с подтверждённым платежом. Её история защищена от изменения.');
    if (type === 'delete-operation') { tx.delete('transactions', id); return; }
    validateOperation(data); await writableMonth(tx, data.date.slice(0, 7));
    const settings = await tx.get('settings', 'main');
    const category = categoriesFor(settings, data.date.slice(0, 7)).find(c => c.id === data.categoryId);
    if (data.type === 'expense' && (!category || category.archived || category.actualSource !== 'budget_control')) throw new Error('Выберите активную категорию с ручным учётом. Внешние операции вносятся в приложении-источнике.');
    tx.set('transactions', id, { ...data, direction: category?.direction || 'home', source: 'budget_control', currency: 'EUR', createdAt: previous?.createdAt || now, updatedAt: now });
  } else if (type === 'recurring' || type === 'delete-recurring') {
    const previous = await tx.get('recurring', id);
    if (type === 'delete-recurring') { tx.delete('recurring', id); return; }
    validateOperation({ ...data, type: 'expense', date: data.nextDate });
    if (!data.name?.trim() || data.name.length > 100) throw new Error('Укажите название платежа.');
    nextDue(data.nextDate, data.interval, data.unit);
    tx.set('recurring', id, { ...data, anchorDay: previous?.nextDate === data.nextDate ? previous.anchorDay : +data.nextDate.slice(8), createdAt: previous?.createdAt || now, updatedAt: now });
  } else if (type === 'pay') {
    const recurring = await tx.get('recurring', id);
    if (!recurring || !recurring.enabled) throw new Error('Этот платёж удалён или отключён.');
    const key = paymentKey(id, command.dueDate);
    if (await tx.get('payments', key)) return { alreadyPaid: true };
    if (recurring.nextDate !== command.dueDate) throw new Error('Срок платежа изменился. Откройте форму заново.');
    const settings = await tx.get('settings', 'main');
    let operation, operationId;
    if (command.linkedId) {
      const split = command.linkedId.indexOf(':');
      const source = command.linkedId.slice(0, split), sourceId = command.linkedId.slice(split + 1);
      if (source === 'budget_control') {
        const saved = await tx.get('transactions', sourceId);
        operation = saved && { ...saved, id: command.linkedId };
      } else {
        const definition = SOURCE_DEFINITIONS[source];
        if (!definition || source === 'tattoo_income' || !settings.integrations[definition.setting]) throw new Error('Этот источник не подключён.');
        const raw = await tx.getExternal(definition.path, sourceId);
        operation = raw && definition.adapter(sourceId, raw, settings);
      }
      if (!operation || operation.type !== 'expense') throw new Error('Исходная расходная операция не найдена.');
      operationId = command.linkedId;
      if (operation.categoryId !== recurring.categoryId) throw new Error('Категория операции не совпадает с обязательством. Проверьте сопоставления.');
    } else {
      const category = categoriesFor(settings, command.date?.slice(0, 7)).find(c => c.id === recurring.categoryId && !c.archived);
      if (!category || category.actualSource !== 'budget_control') throw new Error('Этот расход ведётся во внешнем приложении. Свяжите существующую операцию.');
      operationId = `budget_control:payment_${key}`;
      operation = { type: 'expense', amountCents: command.amountCents, date: command.date, categoryId: recurring.categoryId, description: recurring.name, direction: category.direction, source: 'budget_control', currency: 'EUR', paymentId: key, createdAt: now, updatedAt: now };
      validateOperation(operation);
    }
    await writableMonth(tx, operation.date.slice(0, 7));
    if (await tx.get('links', linkKey(operationId))) throw new Error('Эта операция уже связана с другим платежом.');
    const date = nextDue(recurring.nextDate, recurring.interval, recurring.unit, recurring.anchorDay);
    if (!command.linkedId) tx.set('transactions', `payment_${key}`, operation);
    tx.set('links', linkKey(operationId), { paymentId: key, createdAt: now });
    tx.set('payments', key, { recurringId: id, name: recurring.name, dueDate: recurring.nextDate, date: operation.date, amountCents: operation.amountCents, operationId, linked: !!command.linkedId, createdAt: now, updatedAt: now });
    tx.set('recurring', id, { ...recurring, nextDate: date, updatedAt: now });
  } else if (type === 'close-month') {
    await writableMonth(tx, month);
    if (month >= command.currentMonth) throw new Error('Закрыть можно только завершённый месяц.');
    const settings = await tx.get('settings', 'main');
    tx.set('plans', month, { closed: true, categories: categoriesFor(settings, month), createdAt: now, updatedAt: now });
  } else throw new Error('Неизвестное действие.');
}
