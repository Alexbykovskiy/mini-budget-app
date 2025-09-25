/* calendar.js
   Minimal Google Calendar layer for Tattoo CRM
   - creates/fetches "Tattoo CRM" calendar
   - upserts events for sessions/consultations/reminders
*/

window.TCRM_Calendar = (() => {
  let isInited = false;
  let calendarId = null;

  // ---- utils ----
  const TZ = 'Europe/Bratislava';

// Приводим к 'YYYY-MM-DDTHH:MM:00'
function ensureDateTimeLocal(s) {
  // s: 'YYYY-MM-DDTHH:MM' или уже с секундами
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s = s + ':00';
  return { dateTime: s, timeZone: TZ };
}

// Форматируем объект Date в локальное 'YYYY-MM-DDTHH:MM:00'
function fmtLocal(dt) {
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}` +
         `T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
}
  function allDayRange(ymd /* 'YYYY-MM-DD' */) {
    const d = new Date(`${ymd}T00:00:00`);
    const end = new Date(d);
    end.setDate(end.getDate() + 1);
    const endYMD = end.toISOString().slice(0, 10);
    return {
      start: { date: ymd },
      end:   { date: endYMD }
    };
  }

  async function initGapiCalendar() {
    if (isInited) return;
    await new Promise((resolve, reject) => {
      gapi.load('client', async () => {
        try {
          // Подгружаем discovery для Calendar
          await gapi.client.init({
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']
          });
          isInited = true;
          resolve();
        } catch (e) { reject(e); }
      });
    });
  }

  function setAuthToken(accessToken) {
    // Токен нам дает Firebase Auth с расширенным scope
    gapi.client.setToken({ access_token: accessToken });
  }

  async function ensureCalendarId(name = 'Tattoo CRM') {
    await initGapiCalendar();
    if (calendarId) return calendarId;

    // 1) пробуем достать из настроек (если ты уже сохранил его ранее)
    try {
      const snap = await FB.db
        .collection('TattooCRM').doc('settings')
        .collection('global').doc('default').get();
      const cfg = snap.exists ? snap.data() : {};
      if (cfg && cfg.calendarId) {
        calendarId = cfg.calendarId;
        return calendarId;
      }
    } catch (e) {
      console.warn('Failed to read calendarId from settings', e);
    }

    // 2) ищем календарь по названию
    const list = await gapi.client.calendar.calendarList.list({ maxResults: 250 });
    const found = (list.result.items || []).find(c => c.summary === name);
    if (found) {
      calendarId = found.id;
    } else {
      // 3) создаем новый
      const res = await gapi.client.calendar.calendars.insert({ summary: name });
      calendarId = res.result.id;
    }

    // 4) сохраняем в настройки
    try {
      await FB.db
        .collection('TattooCRM').doc('settings')
        .collection('global').doc('default')
        .set({ calendarId }, { merge: true });
    } catch (e) {
      console.warn('Failed to save calendarId', e);
    }
    return calendarId;
  }

  // ---- upserts / delete ----
  async function upsertSessionEvent(calId, client, session /* {dt, price, gcalEventId?} */, opts = {}) {
    // сессия: старт=dt, длительность по умолчанию 3ч (можно поменять)
    const start = ensureDateTimeLocal(session.dt);
const endDate = new Date(session.dt);
endDate.setHours(endDate.getHours() + (opts.durationHours || 3));
const endISO = fmtLocal(endDate);
const body = {
  summary: `Сеанс: ${client.displayName || client.name || 'Без имени'}`,
  description: client?.notes || '',
  start,
  end: { dateTime: endISO, timeZone: TZ }
};
    if (session.gcalEventId) {
      const up = await gapi.client.calendar.events.patch({
        calendarId: calId,
        eventId: session.gcalEventId,
        resource: body
      });
      return up.result.id;
    } else {
      const ins = await gapi.client.calendar.events.insert({
        calendarId: calId,
        resource: body
      });
      return ins.result.id;
    }
  }

  async function upsertConsultEvent(calId, client /* {consultDate:'YYYY-MM-DDTHH:MM', ...} */, opts = {}) {
    if (!client.consultDate) return null;
   const start = ensureDateTimeLocal(client.consultDate);
const endDate = new Date(client.consultDate);
endDate.setMinutes(endDate.getMinutes() + (opts.durationMinutes || 30));
const endISO = fmtLocal(endDate);
const body = {
  summary: `Консультация: ${client.displayName || client.name || 'Без имени'}`,
  description: client?.notes || '',
  start,
  end: { dateTime: endISO, timeZone: TZ }
};
    if (client.gcalConsultEventId) {
      const up = await gapi.client.calendar.events.patch({
        calendarId: calId,
        eventId: client.gcalConsultEventId,
        resource: body
      });
      return up.result.id;
    } else {
      const ins = await gapi.client.calendar.events.insert({
        calendarId: calId,
        resource: body
      });
      return ins.result.id;
    }
  }

  async function upsertReminderEvent(calId, reminder /* {id,title,date, gcalEventId?} */, client) {
    // напоминание как all-day event
    const { start, end } = allDayRange(reminder.date);
    const body = {
      summary: `Напоминание: ${reminder.title}`,
      description: client ? `Клиент: ${client.displayName || client.name || ''}\n${client?.notes || ''}` : '',
      start, end
    };
    if (reminder.gcalEventId) {
      const up = await gapi.client.calendar.events.patch({
        calendarId: calId,
        eventId: reminder.gcalEventId,
        resource: body
      });
      return up.result.id;
    } else {
      const ins = await gapi.client.calendar.events.insert({
        calendarId: calId,
        resource: body
      });
      return ins.result.id;
    }
  }

  async function deleteEvent(calId, eventId) {
    try {
      await gapi.client.calendar.events.delete({ calendarId: calId, eventId });
    } catch (e) {
      // если уже удален/нет доступа — просто молчим
      console.warn('deleteEvent error (ignored)', e?.result || e);
    }
  }

  return {
    setAuthToken,
    ensureCalendarId,
    upsertSessionEvent,
    upsertConsultEvent,
    upsertReminderEvent,
    deleteEvent
  };
})();