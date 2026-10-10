// Editable defaults, used only when a workspace is first created.
export const GROUPS = ['Жильё', 'Страховки и связь', 'Автомобиль и транспорт', 'Семья и быт', 'Работа и прочее'];
const rows = [
  ['rent', 'Аренда квартиры', 1200, 1, 0, 'home', true, 'regular'],
  ['electricity', 'Электричество', 750, 12, 0, 'home', true, 'regular'],
  ['water', 'Вода', 750, 12, 0, 'home', true, 'regular'],
  ['health', 'Медицинская страховка', 121, 1, 1, 'home', true, 'regular'],
  ['mobile', 'Мобильная связь', 46, 1, 1, 'home', true, 'regular'],
  ['car-insurance', 'Автостраховка', 235, 12, 1, 'car', true, 'regular'],
  ['fuel', 'Дизель / бензин', 380, 1, 2, 'car', true, 'average'],
  ['car-service', 'Обслуживание автомобиля', 110, 12, 2, 'car', true, 'average'],
  ['parking', 'Парковки и платные дороги', 250, 12, 2, 'car', true, 'average'],
  ['car-wash', 'Мойка автомобиля', 5, 1, 2, 'car', true, 'average'],
  ['car-inspection', 'Техосмотр и регистрация', 80, 24, 2, 'car', true, 'regular'],
  ['public-transport', 'Общественный транспорт', 20, 1, 2, 'home', true, 'average'],
  ['groceries', 'Продукты питания', 450, 1, 3, 'home', true, 'average'],
  ['household', 'Бытовая химия и гигиена', 50, 1, 3, 'home', true, 'average'],
  ['pharmacy', 'Лекарства и аптека', 50, 1, 3, 'home', true, 'average'],
  ['clothing', 'Одежда и обувь', 50, 1, 3, 'home', false, 'average'],
  ['activities', 'Кружки и занятия', 250, 1, 3, 'home', true, 'regular'],
  ['leisure', 'Развлечения и отдых', 100, 1, 3, 'home', false, 'average'],
  ['taxes', 'Налоги и социальные взносы', 135, 1, 4, 'home', true, 'regular'],
  ['subscriptions', 'Подписки и приложения', 25, 1, 4, 'home', true, 'regular'],
  ['work-lodging', 'Проживание в рабочих поездках', 350, 1, 4, 'work', true, 'average'],
  ['furniture', 'Мебель, техника и ремонт', 50, 1, 4, 'home', false, 'average'],
  ['travel', 'Отпуск и путешествия', 200, 1, 4, 'home', false, 'average'],
  ['hobbies', 'Хобби и увлечения', 70, 1, 4, 'home', false, 'average'],
  ['gifts', 'Подарки и праздники', 100, 1, 4, 'home', false, 'average'],
  ['unexpected', 'Непредвиденные расходы', 100, 1, 4, 'home', false, 'average'],
];
export const MINI_CATEGORIES = ['Топливо', 'Парковка', 'Штрафы', 'Сервис', 'Ремонт', 'Страховка', 'Шины', 'Тюнинг', 'Мойка', 'Виньетка/Платные дороги', 'Другое'];
export function initialSettings() {
  return {
    schemaVersion: 1, currency: 'EUR', groups: [...GROUPS],
    integrations: { miniBudget: true, tattooIncome: true, tattooExpenses: false },
    mappings: { mini_budget: { 'Топливо': 'fuel', 'Парковка': 'parking', 'Сервис': 'car-service', 'Ремонт': 'car-service', 'Страховка': 'car-insurance', 'Шины': 'car-service', 'Мойка': 'car-wash', 'Виньетка/Платные дороги': 'parking' }, tattoo_expense: { 'Жильё': 'work-lodging' } },
    categories: rows.map(([id, name, euros, periodMonths, group, direction, required, kind]) => ({ id, versions: [{ from: '0001-01', name, amountCents: euros * 100, periodMonths, group: GROUPS[group], direction, required, kind, actualSource: direction === 'car' ? 'mini_budget' : direction === 'work' ? 'tattoo_expense' : 'budget_control', archived: false }], overrides: {} })),
  };
}
