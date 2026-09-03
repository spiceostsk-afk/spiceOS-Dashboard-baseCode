/**
 * The sales reports.
 *
 * Date boundaries are the part worth guarding. A period that is off by an hour
 * does not throw — it quietly moves a late-evening sale onto the wrong day, and
 * nobody notices until a month-end total disagrees with the till.
 */
import { describe, it, expect } from 'vitest';
import { resolveReportPeriod, isoDay } from '../hooks/useSalesReports';

/** Local wall-clock, since every boundary here is a local day. */
const at = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} `
  + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('Report periods', () => {
  it('covers today from first minute to last', () => {
    const { from, to } = resolveReportPeriod('today');
    const now = new Date();
    expect(isoDay(from)).toBe(isoDay(now));
    expect(isoDay(to)).toBe(isoDay(now));
    expect(at(from).endsWith('00:00')).toBe(true);
    expect(at(to).endsWith('23:59')).toBe(true);
  });

  it('puts yesterday entirely in the past', () => {
    const { from, to } = resolveReportPeriod('yesterday');
    const y = new Date();
    y.setDate(y.getDate() - 1);
    expect(isoDay(from)).toBe(isoDay(y));
    expect(isoDay(to)).toBe(isoDay(y));
    expect(to.getTime()).toBeLessThan(Date.now());
  });

  it('starts this month on the 1st', () => {
    const { from, to } = resolveReportPeriod('this_month');
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(new Date().getMonth());
    expect(isoDay(to)).toBe(isoDay(new Date()));
  });

  // Day 0 of this month is the last day of the previous one, which is how the
  // 28th/30th/31st is found without a table of month lengths.
  it('ends last month on its real final day', () => {
    const { from, to } = resolveReportPeriod('last_month');
    const now = new Date();
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe((now.getMonth() + 11) % 12);
    expect(to.getMonth()).toBe(from.getMonth());

    const dayAfter = new Date(to);
    dayAfter.setDate(to.getDate() + 1);
    expect(dayAfter.getMonth()).toBe(now.getMonth());
  });

  it('never lets last month bleed into this one', () => {
    const { to } = resolveReportPeriod('last_month');
    const thisMonthStart = resolveReportPeriod('this_month').from;
    expect(to.getTime()).toBeLessThan(thisMonthStart.getTime());
  });

  it('honours a custom range end to end', () => {
    const { from, to } = resolveReportPeriod('custom', { from: '2026-08-01', to: '2026-08-31' });
    expect(isoDay(from)).toBe('2026-08-01');
    expect(isoDay(to)).toBe('2026-08-31');
    expect(at(to).endsWith('23:59')).toBe(true);
  });

  // A backwards range is a typo, not an empty period.
  it('reads a backwards custom range the right way round', () => {
    const { from, to } = resolveReportPeriod('custom', { from: '2026-08-31', to: '2026-08-01' });
    expect(isoDay(from)).toBe('2026-08-01');
    expect(isoDay(to)).toBe('2026-08-31');
  });

  it('falls back to today when a custom range is incomplete', () => {
    const { from, to } = resolveReportPeriod('custom', { from: '2026-08-01', to: '' });
    expect(isoDay(from)).toBe(isoDay(new Date()));
    expect(isoDay(to)).toBe(isoDay(new Date()));
  });

  it('treats an unknown period as today rather than throwing', () => {
    const { from } = resolveReportPeriod('nonsense');
    expect(isoDay(from)).toBe(isoDay(new Date()));
  });

  // isoDay must use local parts: toISOString would roll an evening in a
  // positive-offset zone onto the following day.
  it('formats a day from local parts, not UTC', () => {
    const lateEvening = new Date(2026, 7, 31, 23, 30, 0);
    expect(isoDay(lateEvening)).toBe('2026-08-31');
  });

  it('keeps a single custom day as one whole day', () => {
    const { from, to } = resolveReportPeriod('custom', { from: '2026-09-02', to: '2026-09-02' });
    expect(isoDay(from)).toBe('2026-09-02');
    expect(isoDay(to)).toBe('2026-09-02');
    expect(to.getTime() - from.getTime()).toBeGreaterThan(86_000_000);
  });
});
