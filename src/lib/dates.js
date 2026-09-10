/**
 * Every date the app shows, in one place.
 *
 * The house format is DD/MM/YYYY. It was previously spelled about six
 * different ways across the screens — en-GB here, en-IN there, the browser
 * default somewhere else — so the same day read differently depending on which
 * report you were standing in. One module means it cannot drift again.
 *
 * Everything is LOCAL time. A restaurant's day is the day it was trading in,
 * and `toISOString` would push an 11pm bill onto tomorrow.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Accepts an ISO instant, a yyyy-mm-dd day, or a Date. Null when unusable. */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // A bare yyyy-mm-dd is a calendar day, not an instant. Parsed as local
  // midnight so a stored date never displays as the day before.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 09/10/2026 → the house format, DD/MM/YYYY. */
export function fmtDate(value, fallback = '—') {
  const d = toDate(value);
  if (!d) return fallback;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** DD/MM/YYYY HH:mm, 24-hour — a till roll has no room for "PM". */
export function fmtDateTime(value, fallback = '—') {
  const d = toDate(value);
  if (!d) return fallback;
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** HH:mm on its own, for a column that already states the date. */
export function fmtTime(value, fallback = '—') {
  const d = toDate(value);
  if (!d) return fallback;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * DD/MM without the year, for chart axes and other places where thirty labels
 * sit side by side. The full year on every bar is unreadable, and the range it
 * belongs to is always stated above the chart.
 */
export function fmtDayShort(value, fallback = '') {
  const d = toDate(value);
  if (!d) return fallback;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** DD/MM/YYYY with the weekday in front, where the day of week matters. */
export function fmtDateWithWeekday(value, fallback = '—') {
  const d = toDate(value);
  if (!d) return fallback;
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' });
  return `${day} ${fmtDate(d)}`;
}

/** yyyy-mm-dd in local time — the key format, never shown to anyone. */
export function isoDay(value = new Date()) {
  const d = toDate(value) || new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
