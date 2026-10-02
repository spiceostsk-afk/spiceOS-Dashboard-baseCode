import { describe, it, expect } from 'vitest';
import { groupBillLines, planLineQtyChange } from '../lib/billLines';

const line = (id, orderId, menuItemId, name, qty, price) => ({ id, orderId, menuItemId, name, qty, price });

describe('groupBillLines', () => {
  const items = [
    line('a', 'o1', 'pet', 'pet 20', 1, 20),
    line('b', 'o1', 'water', 'water', 1, 10),
    line('c', 'o2', 'pet', 'pet 20', 1, 20),
    line('d', 'o2', 'water', 'water', 2, 10),
    line('e', 'o3', 'pet', 'pet 20', 1, 25),            // same dish, different rate
    line('f', 'o3', null, 'Corkage', 1, 50),
    line('g', 'o4', null, 'Corkage', 1, 50),
  ];
  const lines = groupBillLines(items);

  it('merges the same dish ordered in different rounds into one line', () => {
    const pet = lines.find((l) => l.name === 'pet 20' && l.price === 20);
    expect(pet.qty).toBe(2);
    expect(pet.parts.map((p) => p.id)).toEqual(['a', 'c']);
    expect(lines.find((l) => l.name === 'water').qty).toBe(3);
  });

  it('keeps a different price as its own line', () => {
    expect(lines.filter((l) => l.name === 'pet 20')).toHaveLength(2);
  });

  it('merges manual lines by name', () => {
    expect(lines.find((l) => l.name === 'Corkage').qty).toBe(2);
  });

  it('never changes the bill total', () => {
    const sum = (xs) => xs.reduce((s, x) => s + x.price * x.qty, 0);
    expect(sum(lines)).toBe(sum(items));
  });
});

describe('planLineQtyChange', () => {
  const merged = groupBillLines([
    line('a', 'o1', 'roti', 'Roti', 2, 15),
    line('c', 'o2', 'roti', 'Roti', 3, 15),
  ])[0];

  it('adds more to the newest round', () => {
    expect(planLineQtyChange(merged, 7)).toEqual([{ id: 'c', orderId: 'o2', qty: 5 }]);
  });

  it('takes fewer off the newest round first', () => {
    expect(planLineQtyChange(merged, 4)).toEqual([{ id: 'c', orderId: 'o2', qty: 2 }]);
  });

  it('spills into older rounds when the newest runs out', () => {
    expect(planLineQtyChange(merged, 1)).toEqual([
      { id: 'c', orderId: 'o2', qty: 0 },
      { id: 'a', orderId: 'o1', qty: 1 },
    ]);
  });

  it('removing the line clears every round', () => {
    expect(planLineQtyChange(merged, 0).map((c) => c.qty)).toEqual([0, 0]);
  });

  it('does nothing when the quantity is unchanged', () => {
    expect(planLineQtyChange(merged, 5)).toEqual([]);
  });
});
