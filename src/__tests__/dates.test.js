/**
 * The house date format.
 *
 * DD-Mon-YYYY everywhere — 10-Sep-2026. The two traps worth guarding are the ones that used
 * to bite: a bare yyyy-mm-dd parsed as UTC midnight and displayed as the day
 * before, and a late-evening timestamp rolling onto tomorrow's date.
 */
import { describe, it, expect } from 'vitest';
import {
  fmtDate, fmtDateTime, fmtTime, fmtDayShort, fmtWeekday, fmtDateWithWeekday, isoDay,
} from '../lib/dates';

describe('fmtDate', () => {
  it('writes day, abbreviated month name, year, joined by hyphens', () => {
    expect(fmtDate(new Date(2026, 8, 10))).toBe('10-Sep-2026');
  });

  it('pads a single-digit day and month', () => {
    expect(fmtDate(new Date(2026, 0, 5))).toBe('05-Jan-2026');
  });

  it('reads a stored yyyy-mm-dd as that calendar day, not the one before', () => {
    expect(fmtDate('2026-09-10')).toBe('10-Sep-2026');
    expect(fmtDate('2026-01-01')).toBe('01-Jan-2026');
  });

  it('keeps a late-evening timestamp on the day it was trading', () => {
    expect(fmtDate(new Date(2026, 8, 10, 23, 45))).toBe('10-Sep-2026');
  });

  it('shows a dash for nothing, and a caller-chosen fallback when asked', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
    expect(fmtDate('', '')).toBe('');
  });

  it('does not print Invalid Date for junk', () => {
    expect(fmtDate('not a date')).toBe('—');
  });
});

describe('fmtDateTime and fmtTime', () => {
  it('puts a 24-hour clock after the date', () => {
    expect(fmtDateTime(new Date(2026, 8, 10, 21, 5))).toBe('10-Sep-2026 21:05');
  });

  it('keeps midnight as 00:00 rather than 12:00', () => {
    expect(fmtTime(new Date(2026, 8, 10, 0, 0))).toBe('00:00');
  });

  it('gives the time alone where the date is already stated', () => {
    expect(fmtTime(new Date(2026, 8, 10, 9, 7))).toBe('09:07');
  });
});

describe('Chart and weekday labels', () => {
  it('drops the year for an axis tick', () => {
    expect(fmtDayShort(new Date(2026, 8, 10))).toBe('10-Sep');
  });

  it('names the weekday in English whatever the browser locale', () => {
    expect(fmtWeekday('2026-09-10')).toBe('Thu');
  });

  it('spells every month the same short way', () => {
    const months = Array.from({ length: 12 }, (_, m) => fmtDate(new Date(2026, m, 1)).slice(3, 6));
    expect(months).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  });

  it('puts the weekday in front of the full date', () => {
    expect(fmtDateWithWeekday('2026-09-10')).toBe('Thu 10-Sep-2026');
  });
});

describe('isoDay', () => {
  it('keys by the local day, not the UTC one', () => {
    expect(isoDay(new Date(2026, 8, 10, 23, 59))).toBe('2026-09-10');
  });

  it('round-trips through fmtDate', () => {
    expect(fmtDate(isoDay(new Date(2026, 11, 31)))).toBe('31-Dec-2026');
  });
});
