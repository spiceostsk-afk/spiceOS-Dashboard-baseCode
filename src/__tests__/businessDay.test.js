import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  setDayCloseHour, tradingDate, tradingDayKey, dayOpens, dayCloses, tradingToday,
} from '../lib/businessDay';
import { resolveReportPeriod, isoDay } from '../hooks/useSalesReports';
import { resolvePeriod } from '../hooks/useDashboardData';

afterEach(() => {
  setDayCloseHour(0);
  vi.useRealTimers();
});

describe('business day — midnight (the default)', () => {
  it('files a 1am sale under its own calendar date', () => {
    expect(tradingDayKey(new Date(2026, 9, 5, 1, 0))).toBe('2026-10-05');
  });

  it('runs a day from midnight to the last millisecond before the next', () => {
    const d = new Date(2026, 9, 4);
    expect(dayOpens(d)).toEqual(new Date(2026, 9, 4, 0, 0, 0, 0));
    expect(dayCloses(d)).toEqual(new Date(2026, 9, 4, 23, 59, 59, 999));
  });
});

describe('business day — closing at 3am', () => {
  it('files a 1am sale under the night before', () => {
    setDayCloseHour(3);
    expect(tradingDayKey(new Date(2026, 9, 5, 1, 0))).toBe('2026-10-04');
    expect(tradingDayKey(new Date(2026, 9, 5, 2, 59, 59))).toBe('2026-10-04');
  });

  it('starts the new day at 3am exactly', () => {
    setDayCloseHour(3);
    expect(tradingDayKey(new Date(2026, 9, 5, 3, 0))).toBe('2026-10-05');
  });

  it('runs a day from 3am to 2:59:59.999 the next morning', () => {
    setDayCloseHour(3);
    const d = new Date(2026, 9, 4);
    expect(dayOpens(d)).toEqual(new Date(2026, 9, 4, 3, 0, 0, 0));
    expect(dayCloses(d)).toEqual(new Date(2026, 9, 5, 2, 59, 59, 999));
  });

  it('carries the last night of a month into that month', () => {
    setDayCloseHour(3);
    expect(tradingDayKey(new Date(2026, 10, 1, 1, 30))).toBe('2026-10-31');
    expect(tradingDayKey(new Date(2027, 0, 1, 2, 0))).toBe('2026-12-31');
  });

  it('is still yesterday at 1am', () => {
    setDayCloseHour(3);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 1, 0));
    expect(isoDay(tradingToday())).toBe('2026-10-04');
    expect(isoDay(tradingDate(new Date()))).toBe('2026-10-04');
  });

  it("makes the report's Today cover last night's service at 1am", () => {
    setDayCloseHour(3);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 1, 0));
    const { from, to } = resolveReportPeriod('today');
    expect(from).toEqual(new Date(2026, 9, 4, 3, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 9, 5, 2, 59, 59, 999));
  });

  it('starts This month at 3am on the 1st, and Last month ends at 2:59 on the 1st', () => {
    setDayCloseHour(3);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0));
    expect(resolvePeriod('this_month').from).toEqual(new Date(2026, 9, 1, 3, 0, 0, 0));
    expect(resolvePeriod('last_month').to).toEqual(new Date(2026, 9, 1, 2, 59, 59, 999));
  });

  it('reads a custom range as whole trading days', () => {
    setDayCloseHour(3);
    const { from, to } = resolveReportPeriod('custom', { from: '2026-10-01', to: '2026-10-02' });
    expect(from).toEqual(new Date(2026, 9, 1, 3, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 9, 3, 2, 59, 59, 999));
  });

  it('ignores an hour outside 0–6', () => {
    setDayCloseHour(9);
    expect(tradingDayKey(new Date(2026, 9, 5, 1, 0))).toBe('2026-10-05');
  });
});
