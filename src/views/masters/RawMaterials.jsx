import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Zap, FileDown, Upload, Search, X, Star, Trash2, Pencil,
  CheckCircle2, Ban, Package, History, FolderInput,
} from 'lucide-react';
import SearchSelect from '../../components/SearchSelect';
import { useInventoryData } from '../../hooks/useInventoryData';
import { useUnitMaster } from '../../hooks/useMastersData';
import { useOutlet } from '../../context/OutletContext';
import { CategoryStrip, Pager, SelectionBar, ActionMenu, MastersStyles } from './mastersUi';
import { ItemModal, StockLogDrawer } from './rawMaterialModals';

/**
 * Raw Materials — the master list of everything the kitchen tracks.
 *
 * The grid is directly editable: name, category, favourite and active can all
 * be changed in place and saved together with Apply Changes. That is the point
 * of a master screen — you come here to fix twenty spellings or recategorise a
 * whole shelf, and a modal per row would make that unbearable.
 *
 * Edits are held locally until applied, so a half-typed name is never a saved
 * name, and the row shows an amber border while it differs from what is
 * stored. Everything else about a material — units, conversion, barcode,
 * reorder level — lives in the full editor behind the pencil, because those
 * are per-item decisions rather than bulk cleanup.
 */

const PAGE_SIZE = 100;

const dayLabel = (iso) => (iso
  ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
  : '—');

export default function RawMaterials() {
  const {
    items, categories, log, metrics, loading, error,
    addItem, updateItem, adjust, removeItem, addCategory,
    applyEdits, bulkUpdate, quickAdd, refresh,
  } = useInventoryData();
  const { outlet, isMultiOutlet } = useOutlet();
  const { units } = useUnitMaster();

  const [name, setName] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [appliedName, setAppliedName] = useState('');
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(0);

  const [edits, setEdits] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const flash = (msg, tone = 'ok') => {
    setNotice({ msg, tone });
    setTimeout(() => setNotice(null), 3600);
  };

  /* ------------------------------------------------------------ filtering */
  const searched = useMemo(() => {
    const q = appliedName.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryFilter !== 'all' && i.categoryId !== categoryFilter) return false;
      if (q && !i.name.toLowerCase().includes(q) && !i.barcode.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, appliedName, categoryFilter]);

  const tabs = useMemo(() => {
    const counts = new Map();
    searched.forEach((i) => {
      const key = i.categoryId || 'none';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [
      { key: 'all', label: 'All categories', count: searched.length },
      ...categories.map((c) => ({ key: c.id, label: c.name, count: counts.get(c.id) || 0 })),
      { key: 'none', label: 'No category', count: counts.get('none') || 0 },
    ];
  }, [searched, categories]);

  const visible = useMemo(() => {
    if (tab === 'all') return searched;
    if (tab === 'none') return searched.filter((i) => !i.categoryId);
    return searched.filter((i) => i.categoryId === tab);
  }, [searched, tab]);

  const paged = useMemo(
    () => visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [visible, page],
  );

  // A filter change can leave you stranded past the last page.
  useEffect(() => { setPage(0); }, [tab, appliedName, categoryFilter]);

  /* --------------------------------------------------------------- edits */
  const editOf = (item, field) => {
    const patch = edits[item.id];
    if (patch && field in patch) return patch[field];
    if (field === 'item_name') return item.name;
    if (field === 'category_id') return item.categoryId || '';
    if (field === 'is_favourite') return item.isFavourite;
    if (field === 'is_active') return item.isActive;
    return undefined;
  };

  const isDirty = (item, field) => {
    const patch = edits[item.id];
    if (!patch || !(field in patch)) return false;
    const original = field === 'item_name' ? item.name
      : field === 'category_id' ? (item.categoryId || '')
        : field === 'is_favourite' ? item.isFavourite : item.isActive;
    return patch[field] !== original;
  };

  const setEdit = (id, field, value) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const dirtyCount = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    return Object.entries(edits).filter(([id, patch]) => {
      const item = byId.get(id);
      if (!item) return false;
      return Object.keys(patch).some((f) => isDirty(item, f));
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, items]);

  const apply = async () => {
    setSaving(true);
    const res = await applyEdits(edits);
    setSaving(false);
    if (res.success) {
      setEdits({});
      flash(`${res.saved} material${res.saved === 1 ? '' : 's'} updated.`);
    } else {
      flash(res.error || 'Could not save the changes.', 'bad');
    }
  };

  /* ----------------------------------------------------------- selection */
  const allOnPageSelected = paged.length > 0 && paged.every((i) => selected.has(i.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) paged.forEach((i) => next.delete(i.id));
      else paged.forEach((i) => next.add(i.id));
      return next;
    });
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runBulk = async (patch, label) => {
    setSaving(true);
    const res = await bulkUpdate([...selected], patch);
    setSaving(false);
    if (res.success) {
      flash(`${selected.size} material${selected.size === 1 ? '' : 's'} ${label}.`);
      setSelected(new Set());
    } else {
      flash(res.error || 'Could not apply that.', 'bad');
    }
  };

  /* -------------------------------------------------------------- export */
  const exportCsv = () => {
    const head = ['Name', 'Category', 'Consumption Unit', 'Purchase Unit',
      'Conversion', 'Barcode', 'Stock', 'Reorder At', 'Favourite', 'Active'];
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = visible.map((i) => [
      i.name, i.category, i.unit, i.purchaseUnit, i.conversion, i.barcode,
      i.outletStock ?? i.stock, i.reorderAt,
      i.isFavourite ? 'Yes' : 'No', i.isActive ? 'Yes' : 'No',
    ].map(esc).join(','));

    const url = URL.createObjectURL(
      new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `raw-materials-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ---------------------------------------------------------------- view */
  return (
    <div className="page">
      <div className="mst-top">
        <div>
          <h2 className="mst-title">Raw Materials Management</h2>
          <div className="card__subtitle">
            {metrics.tracked} active · {metrics.low} low · {metrics.out} out
            {isMultiOutlet && outlet ? ` · stock at ${outlet.name}` : ''}
          </div>
        </div>
        <div className="mst-actions">
          <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> Create New
          </button>
          <button className="btn btn--ghost" onClick={() => setShowQuickAdd(true)}>
            <Zap size={15} /> Quick Add
          </button>
          <ActionMenu
            label="Action"
            disabled={selected.size === 0}
            items={[
              { label: 'Mark active', icon: <CheckCircle2 size={14} />,
                onClick: () => runBulk({ is_active: true }, 'activated') },
              { label: 'Mark inactive', icon: <Ban size={14} />,
                onClick: () => runBulk({ is_active: false }, 'deactivated') },
              { label: 'Add to favourites', icon: <Star size={14} />,
                onClick: () => runBulk({ is_favourite: true }, 'favourited') },
              { label: 'Remove from favourites', icon: <Star size={14} />,
                onClick: () => runBulk({ is_favourite: false }, 'unfavourited') },
              ...categories.map((c) => ({
                label: `Move to ${c.name}`,
                icon: <FolderInput size={14} />,
                onClick: () => runBulk({ category_id: c.id }, `moved to ${c.name}`),
              })),
            ]}
          />
          <ActionMenu
            label="Files"
            items={[
              { label: 'Export as CSV', icon: <FileDown size={14} />, onClick: exportCsv },
              { label: 'Import from CSV', icon: <Upload size={14} />, onClick: () => setShowImport(true) },
              { label: 'Stock in/out log', icon: <History size={14} />, onClick: () => setShowLog(true) },
            ]}
          />
        </div>
      </div>

      <div className="metric-grid metric-grid--4">
        {[
          { label: 'Items tracked', value: metrics.tracked, color: 'var(--color-text)' },
          { label: 'Low stock', value: metrics.low, color: 'var(--color-warning)' },
          { label: 'Out of stock', value: metrics.out, color: 'var(--color-danger)' },
          { label: 'Stock value', value: `₹${metrics.value.toFixed(0)}`, color: 'var(--color-text)' },
        ].map((c) => (
          <div key={c.label} className="metric-card">
            <div className="metric-card__label">{c.label}</div>
            <div className="metric-card__value metric-card__value--sm" style={{ color: c.color }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {notice && <div className={`mst-note ${notice.tone === 'bad' ? 'bad' : ''}`}>{notice.msg}</div>}
      {error && <div className="mst-note bad">{error}</div>}

      {/* -------------------------------------------------------- filters */}
      <div className="card mst-filters">
        <div className="field">
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setAppliedName(name)}
            placeholder="Search name or barcode"
          />
        </div>
        <div className="field">
          <label>Category</label>
          <SearchSelect
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v || 'all')}
            options={[{ value: 'all', label: 'All' }]
              .concat(categories.map((c) => ({ value: c.id, label: c.name })))}
            placeholder="All"
            ariaLabel="Category"
          />
        </div>
        <div className="mst-filters__actions">
          <button className="btn btn--primary" onClick={() => setAppliedName(name)}>
            <Search size={15} /> Search
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => { setName(''); setAppliedName(''); setCategoryFilter('all'); setTab('all'); }}
          >
            Clear
          </button>
          <button
            className="btn btn--primary"
            onClick={apply}
            disabled={dirtyCount === 0 || saving}
          >
            {saving ? 'Saving…' : `Apply Changes${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </button>
        </div>
      </div>

      <CategoryStrip tabs={tabs} active={tab} onSelect={setTab} unit="ingredients" />

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <span className="card__subtitle">Use the Action menu above to change them together.</span>
      </SelectionBar>

      {/* ---------------------------------------------------------- table */}
      <div className="table-card table-card--padded">
        <div className="table-head rm-head">
          <div className="rm-check">
            <input
              type="checkbox"
              className="gcheck"
              checked={allOnPageSelected}
              onChange={toggleAll}
              aria-label="Select all on this page"
            />
          </div>
          <div className="rm-name">Name</div>
          <div className="rm-cat">Category</div>
          <div className="rm-unit">Unit</div>
          <div className="rm-stock">Stock</div>
          <div className="rm-date">Created</div>
          <div className="rm-date">Last moved</div>
          <div className="rm-fav">Set As Favourite</div>
          <div className="rm-active">Active</div>
          <div className="rm-act">Action</div>
        </div>

        {loading && <div className="empty-state">Loading raw materials…</div>}

        {!loading && items.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><Package size={22} /></span>
            <div className="empty-state__title">No raw materials yet</div>
            <div className="empty-state__sub">
              Add the ingredients the kitchen tracks. Recipes, purchases and stock
              counts are all built from this list.
            </div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Create New
            </button>
          </div>
        )}

        {!loading && items.length > 0 && visible.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__sub">Nothing matches these filters.</div>
          </div>
        )}

        {!loading && paged.map((item) => {
          const inactive = !editOf(item, 'is_active');
          return (
            <div key={item.id} className={`table-row rm-row ${inactive ? 'off' : ''}`}>
              <div className="rm-check">
                <input
                  type="checkbox"
                  className="gcheck"
                  checked={selected.has(item.id)}
                  onChange={() => toggleOne(item.id)}
                  aria-label={`Select ${item.name}`}
                />
              </div>

              <div className="rm-name">
                <input
                  className={`gcell ${isDirty(item, 'item_name') ? 'gcell--dirty' : ''}`}
                  value={editOf(item, 'item_name')}
                  onChange={(e) => setEdit(item.id, 'item_name', e.target.value)}
                  aria-label={`Name of ${item.name}`}
                />
              </div>

              <div className="rm-cat">
                <SearchSelect
                  className={`ss-root--cell ${isDirty(item, 'category_id') ? 'ss-root--dirty' : ''}`}
                  value={editOf(item, 'category_id') || ''}
                  onChange={(v) => setEdit(item.id, 'category_id', v || null)}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Select Category"
                  ariaLabel={`Category of ${item.name}`}
                />
              </div>

              <div className="rm-unit">
                <div className="strong">{item.unit}</div>
                {item.purchaseUnit !== item.unit && (
                  <div className="rm-sub">buys in {item.purchaseUnit}</div>
                )}
              </div>

              <div className="rm-stock tnum">
                {item.outletStock ?? item.stock} {item.unit}
              </div>

              <div className="rm-date muted">{dayLabel(item.createdAt)}</div>
              <div className="rm-date muted">{dayLabel(item.lastMovementAt)}</div>

              <div className="rm-fav">
                <input
                  type="checkbox"
                  className="gcheck"
                  checked={!!editOf(item, 'is_favourite')}
                  onChange={(e) => setEdit(item.id, 'is_favourite', e.target.checked)}
                  aria-label={`Favourite ${item.name}`}
                />
              </div>

              <div className="rm-active">
                <input
                  type="checkbox"
                  className="gcheck"
                  checked={!!editOf(item, 'is_active')}
                  onChange={(e) => setEdit(item.id, 'is_active', e.target.checked)}
                  aria-label={`Active ${item.name}`}
                />
              </div>

              <div className="rm-act">
                <button className="step" title="Stock out" onClick={() => adjust(item.id, -1)}>−</button>
                <button className="step" title="Stock in" onClick={() => adjust(item.id, +1)}>+</button>
                <button className="step" title="Edit full details" onClick={() => setEditing(item)}>
                  <Pencil size={12} />
                </button>
                <button
                  className="step step--danger"
                  title="Remove"
                  onClick={() => {
                    if (window.confirm(`Remove ${item.name} from raw materials?`)) removeItem(item.id);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}

        <Pager page={page} pageSize={PAGE_SIZE} total={visible.length} onPage={setPage} />
      </div>

      {showCreate && (
        <ItemModal
          categories={categories}
          onClose={() => setShowCreate(false)}
          onSave={addItem}
          onAddCategory={addCategory}
        />
      )}
      {editing && (
        <ItemModal
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSave={(draft) => updateItem(editing.id, draft)}
          onAddCategory={addCategory}
        />
      )}
      {showQuickAdd && (
        <QuickAddModal
          categories={categories}
          units={units}
          onClose={() => setShowQuickAdd(false)}
          onSave={quickAdd}
          onDone={(n) => flash(`${n} material${n === 1 ? '' : 's'} added.`)}
        />
      )}
      {showImport && (
        <ImportModal
          categories={categories}
          onClose={() => setShowImport(false)}
          onSave={quickAdd}
          onDone={(n) => flash(`${n} material${n === 1 ? '' : 's'} imported.`)}
        />
      )}
      {showLog && <StockLogDrawer log={log} onClose={() => setShowLog(false)} />}

      <MastersStyles />
      <style>{`
        .rm-head, .rm-row { margin: 0 -24px; padding: 0 24px; }
        .rm-row { align-items: flex-start; }
        .rm-row.off { background: #FAFAFB; }
        .rm-row.off .gcell { color: var(--color-text-muted); }

        .rm-check  { width: 40px; padding-top: 9px; }
        .rm-name   { flex: 1.6; min-width: 150px; }
        .rm-cat    { flex: 1.2; min-width: 140px; }
        .rm-unit   { width: 92px; padding-top: 9px; font-size: 12.5px; }
        .rm-stock  { width: 104px; text-align: right; padding-top: 9px;
                     font-size: 13px; font-weight: 600; color: var(--color-text-soft); }
        .rm-date   { width: 92px; padding-top: 9px; font-size: 12px; }
        .rm-fav    { width: 130px; text-align: center; padding-top: 9px; }
        .rm-active { width: 80px; text-align: center; padding-top: 9px; }
        .rm-act    { width: 140px; display: flex; justify-content: flex-end;
                     gap: 6px; padding-top: 5px; }

        .rm-sub { font-size: 11px; color: var(--color-text-muted); padding: 3px 2px 0; }
        .tnum { font-variant-numeric: tabular-nums; }

        .step {
          width: 26px; height: 26px; border: 1px solid var(--color-border);
          border-radius: 8px; background: var(--color-surface);
          color: var(--color-text-muted); font-weight: 700;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0;
        }
        .step:hover { background: var(--color-canvas); color: var(--color-text); }
        .step--danger:hover { color: var(--color-danger); border-color: var(--color-danger-border); }

        @media (max-width: 1400px) { .rm-date { display: none; } }
        @media (max-width: 1100px) { .rm-stock, .rm-fav, .rm-unit { display: none; } }
      `}</style>
    </div>
  );
}

/* ============================================================ Quick Add */
/**
 * Five blank rows, name and category only.
 *
 * Opening stock is deliberately absent: a quick-add row is a definition, and
 * stock should arrive through a purchase or a count so it lands on the ledger
 * with a reason attached to it.
 */
function QuickAddModal({ categories, units, onClose, onSave, onDone }) {
  const blank = () => ({ key: Math.random().toString(36).slice(2), name: '', categoryId: '', unit: '' });
  const [rows, setRows] = useState(() => [blank(), blank(), blank(), blank(), blank()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key, patch) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const filled = rows.filter((r) => r.name.trim());

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await onSave(filled);
    setSaving(false);
    if (res.success) { onDone(res.added); onClose(); }
    else setError(res.error || 'Could not add those.');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal modal--wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">Quick add materials</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="mst-note bad">{error}</div>}
          <div className="card__subtitle">
            Name and unit are enough to get started — set conversions, barcodes and
            reorder levels later from the grid.
          </div>

          <div className="qa-head">
            <div className="qa-name">Name</div>
            <div className="qa-cat">Category</div>
            <div className="qa-unit">Unit</div>
          </div>

          {rows.map((r) => (
            <div key={r.key} className="qa-row">
              <div className="qa-name">
                <input
                  className="gcell"
                  value={r.name}
                  onChange={(e) => set(r.key, { name: e.target.value })}
                  placeholder="e.g. Basmati Rice"
                />
              </div>
              <div className="qa-cat">
                <SearchSelect
                  className="ss-root--cell"
                  value={r.categoryId}
                  onChange={(v) => set(r.key, { categoryId: v })}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Select Category"
                  ariaLabel="Category"
                />
              </div>
              <div className="qa-unit">
                <SearchSelect
                  className="ss-root--cell"
                  value={r.unit}
                  onChange={(v) => set(r.key, { unit: v })}
                  options={units.filter((u) => u.is_active)
                    .map((u) => ({ value: u.symbol, label: u.symbol }))}
                  placeholder="Unit…"
                  ariaLabel="Unit"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setRows((p) => [...p, blank()])}
          >
            <Plus size={14} /> Add row
          </button>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving || filled.length === 0}>
            {saving ? 'Adding…' : `Add ${filled.length || ''}`.trim()}
          </button>
        </div>

        <style>{`
          .modal--wide { width: 780px; }
          .qa-head, .qa-row { display: flex; gap: 10px; align-items: center; }
          .qa-head {
            font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.04em; color: var(--color-text-muted);
          }
          .qa-name { flex: 2; min-width: 0; }
          .qa-cat  { flex: 1.4; min-width: 0; }
          .qa-unit { width: 110px; flex-shrink: 0; }
        `}</style>
      </form>
    </div>
  );
}

/* =============================================================== Import */
function ImportModal({ categories, onClose, onSave, onDone }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const parse = (text) => {
    const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const rows = [];
    const unknownCats = new Set();

    text.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (!t) return;
      const cells = t.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      if (i === 0 && /name/i.test(cells[0])) return;      // header
      if (!cells[0]) return;

      const catName = (cells[1] || '').toLowerCase();
      if (catName && !catByName.has(catName)) unknownCats.add(cells[1]);

      rows.push({
        name: cells[0],
        categoryId: catByName.get(catName) || '',
        unit: cells[2] || '',
        purchaseUnit: cells[3] || '',
        conversion: cells[4] || 1,
      });
    });

    setPreview({ rows, unknownCats: [...unknownCats] });
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => parse(String(reader.result || ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    const res = await onSave(preview.rows);
    setSaving(false);
    if (res.success) { onDone(res.added); onClose(); }
    else setError(res.error || 'Could not import.');
  };

  const template = () => {
    const csv = 'Name,Category,Consumption Unit,Purchase Unit,Conversion\nBasmati Rice,raw materials,Kg,Sack,25';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'raw-materials-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">Import raw materials</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="mst-note bad">{error}</div>}
          <div className="card__subtitle">
            CSV columns: name, category, consumption unit, purchase unit, conversion.
            Only the name is required.
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn--ghost" onClick={template}>
              <FileDown size={15} /> Template
            </button>
            <button className="btn btn--primary" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Choose file
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          </div>

          {preview && (
            <div className="mst-note">
              {preview.rows.length} row{preview.rows.length === 1 ? '' : 's'} ready to import.
              {preview.unknownCats.length > 0 && (
                <> Unrecognised categories will be left blank: {preview.unknownCats.join(', ')}.</>
              )}
            </div>
          )}
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary"
            onClick={submit}
            disabled={saving || !preview || preview.rows.length === 0}
          >
            {saving ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
