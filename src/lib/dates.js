/**
 * Every date the app shows, in one place.
 *
 * The house format is DD-Mon-YYYY — 16-Sep-2026. The client asked for the
 * month spelled out (2026-09-16) because 09/10 reads as either 9 October or
 * 10 September depending on who is holding the report. It was previously spelled
 * about six different ways across the screens — en-GB here, en-IN there, the
 * browser default somewhere else — so one module means it cannot drift again.
 *
 * Month names are a fixed English list, not toLocaleDateString, so a till
 * whose browser is set to Hindi or US English prints the same thing.
 *
 * Everything is LOCAL time. A restaurant's day is the day it was trading in,
 * and `toISOString` would push an 11pm bill onto tomorrow.
 */

const pad = (n) => String(n).padStart(2, '0');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

/** 16-Sep-2026 — the house format. */
export function fmtDate(value, fallback = '—') {
  const d = toDate(value);
  if (!d) return fallback;
  return `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** 16-Sep-2026 21:05, 24-hour — a till roll has no room for "PM". */
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
 * 16-Sep without the year, for chart axes and other places where thirty labels
 * sit side by side. The full year on every bar is unreadable, and the range it
 * belongs to is always stated above the chart.
 */
export function fmtDayShort(value, fallback = '') {
  const d = toDate(value);
  if (!d) return fallback;
  return `${pad(d.getDate())}-${MONTHS[d.getMonth()]}`;
}

/** Mon, Tue… on its own, for a week-long chart axis. */
export function fmtWeekday(value, fallback = '') {
  const d = toDate(value);
  if (!d) return fallback;
  return WEEKDAYS[d.getDay()];
}

/** Wed 16-Sep-2026, where the day of week matters. */
export function fmtDateWithWeekday(value, fallback = '—') {
  const d = toDate(value);
  if (!d) return fallback;
  return `${fmtWeekday(d)} ${fmtDate(d)}`;
}

/** yyyy-mm-dd in local time — the key format, never shown to anyone. */
export function isoDay(value = new Date()) {
  const d = toDate(value) || new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
