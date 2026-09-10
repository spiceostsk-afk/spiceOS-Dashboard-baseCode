import React, { useMemo } from 'react';
import { useReportPeriod, useSalesData } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';

/**
 * What sold, and how much of it.
 *
 * Ranked by revenue rather than quantity by default: a hundred rotis at ₹15
 * matter less to a day's takings than four sizzlers at ₹900, and the first
 * question anyone asks a sales report is where the money came from.
 */
export default function ItemWiseSales() {
  const periodProps = useReportPeriod();
  const { lines, categories, summary, loading, error } = useSalesData(periodProps.range);

  const rows = useMemo(() => {
    // Category names arrive separately from the sale lines, so resolve the id
    // once here rather than looking it up per row while rendering.
    const catName = new Map((categories || []).map((c) => [c.id, c.category_name]));
    const byDish = new Map();
    lines.forEach((l) => {
      const key = l.menuItemId || l.dish;
      if (!byDish.has(key)) {
        byDish.set(key, {
          id: key,
          dish: l.dish,
          category: catName.get(l.categoryId) || 'Uncategorised',
          qty: 0,
          revenue: 0,
          orders: new Set(),
        });
      }
      const r = byDish.get(key);
      r.qty += l.qty;
      r.revenue += l.amount;
      r.orders.add(l.orderId);
    });

    const total = [...byDish.values()].reduce((s, r) => s + r.revenue, 0);

    return [...byDish.values()].map((r) => ({
      ...r,
      revenue: Math.round(r.revenue * 100) / 100,
      orders: r.orders.size,
      avgPrice: r.qty ? Math.round((r.revenue / r.qty) * 100) / 100 : 0,
      share: total ? Math.round((r.revenue / total) * 1000) / 10 : 0,
    }));
  }, [lines, categories]);

  const best = rows.reduce((a, b) => (b.revenue > (a?.revenue ?? -1) ? b : a), null);

  return (
    <ReportPage
      title="Item-wise sales"
      subtitle="Every dish sold in the period, by quantity and revenue"
      periodProps={periodProps}
      loading={loading}
      error={error}
      cards={[
        { label: 'Dishes sold', value: num(rows.length) },
        { label: 'Total quantity', value: num(summary.qty) },
        { label: 'Revenue', value: money(summary.gross) },
        { label: 'Best seller', value: best ? best.dish : '—' },
      ]}
    >
      <ReportTable
        filename="item-wise-sales"
        rows={rows}
        loading={loading}
        initialSort={{ key: 'revenue', dir: 'desc' }}
        empty={{
          title: 'No dishes sold in this period',
          sub: 'Widen the dates, or check that bills were settled — an unsettled table earns nothing here.',
        }}
        columns={[
          { key: 'dish', label: 'Dish' },
          { key: 'category', label: 'Category' },
          { key: 'qty', label: 'Qty sold', align: 'right', total: true },
          { key: 'orders', label: 'Bills', align: 'right', total: true },
          {
            key: 'avgPrice',
            label: 'Avg price',
            align: 'right',
            render: (r) => money(r.avgPrice),
          },
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
            render: (r) => `${r.share}%`,
          },
        ]}
      />
    </ReportPage>
  );
}
