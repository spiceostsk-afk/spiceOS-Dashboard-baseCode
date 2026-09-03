import React, { useMemo } from 'react';
import { useReportPeriod, useSalesData } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';

/**
 * Revenue rolled up by menu category.
 *
 * Dishes whose category was deleted still sold, so they are gathered under
 * "Uncategorised" rather than dropped — a report that quietly omits revenue is
 * worse than one that shows it awkwardly.
 */
export default function CategoryWiseSales() {
  const periodProps = useReportPeriod();
  const { lines, categories, summary, loading, error } = useSalesData(periodProps.range);

  const rows = useMemo(() => {
    const catName = new Map(categories.map((c) => [c.id, c.category_name]));
    const byCat = new Map();

    lines.forEach((l) => {
      const key = l.categoryId || 'none';
      if (!byCat.has(key)) {
        byCat.set(key, {
          id: key,
          category: catName.get(l.categoryId) || 'Uncategorised',
          qty: 0,
          revenue: 0,
          dishes: new Set(),
        });
      }
      const r = byCat.get(key);
      r.qty += l.qty;
      r.revenue += l.amount;
      r.dishes.add(l.menuItemId || l.dish);
    });

    const total = [...byCat.values()].reduce((s, r) => s + r.revenue, 0);

    return [...byCat.values()].map((r) => ({
      ...r,
      revenue: Math.round(r.revenue * 100) / 100,
      dishes: r.dishes.size,
      share: total ? Math.round((r.revenue / total) * 1000) / 10 : 0,
    }));
  }, [lines, categories]);

  const top = rows.reduce((a, b) => (b.revenue > (a?.revenue ?? -1) ? b : a), null);

  return (
    <ReportPage
      title="Category-wise sales"
      subtitle="Where the money came from, grouped by menu category"
      periodProps={periodProps}
      loading={loading}
      error={error}
      cards={[
        { label: 'Categories', value: num(rows.length) },
        { label: 'Total quantity', value: num(summary.qty) },
        { label: 'Revenue', value: money(summary.gross) },
        { label: 'Strongest', value: top ? top.category : '—' },
      ]}
    >
      <ReportTable
        filename="category-wise-sales"
        rows={rows}
        loading={loading}
        initialSort={{ key: 'revenue', dir: 'desc' }}
        empty={{
          title: 'No sales in this period',
          sub: 'Only settled bills count towards revenue.',
        }}
        columns={[
          { key: 'category', label: 'Category' },
          { key: 'dishes', label: 'Dishes', align: 'right', total: true },
          { key: 'qty', label: 'Qty sold', align: 'right', total: true },
          {
            key: 'revenue',
            label: 'Revenue',
            align: 'right',
            total: true,
            money: true,
            render: (r) => money(r.revenue),
          },
          {
            key: 'share',
            label: 'Share',
            align: 'right',
            render: (r) => (
              <span className="cw-share">
                <span className="cw-bar" style={{ width: `${Math.min(100, r.share)}%` }} />
                {r.share}%
              </span>
            ),
          },
        ]}
      />

      <style>{`
        .cw-share { position: relative; display: inline-block; padding: 2px 0; }
        .cw-bar {
          position: absolute; left: 0; right: auto; bottom: 0; height: 3px;
          background: var(--color-info, #2563EB); border-radius: 2px; opacity: 0.55;
        }
      `}</style>
    </ReportPage>
  );
}
