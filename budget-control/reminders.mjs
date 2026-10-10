import { daysBetween, localDate } from './core.mjs';

// Provider-independent reminder payload. A future server-side push provider can
// consume this contract; v1 displays it in-app and never requests push permissions.
export function reminderFor(payment, today = localDate()) {
  const daysUntil = daysBetween(today, payment.nextDate);
  return {
    id: `${payment.id}:${payment.nextDate}`,
    recurringId: payment.id,
    title: payment.name,
    amountCents: payment.amountCents,
    dueDate: payment.nextDate,
    daysUntil,
    status: !payment.enabled ? 'disabled' : daysUntil < 0 ? 'overdue' : 'expected',
  };
}
