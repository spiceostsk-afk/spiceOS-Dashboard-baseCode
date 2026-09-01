import React, { useEffect, useMemo, useState } from 'react';
import {
  ChefHat, X, Plus, Trash2, Search, AlertTriangle, Copy, Pencil,
  FileDown, Eraser, Zap,
} from 'lucide-react';
import { useRecipesData } from '../hooks/useRecipesData';
import {
  CategoryStrip, Pager, SelectionBar, ActionMenu, MastersStyles,
} from './masters/mastersUi';

const HEALTH = {
  ok:   { label: 'In stock',  tone: 'tone-green',   row: 'transparent' },
  low:  { label: 'Low',       tone: 'tone-amber',   row: '#FDFAF3' },
  out:  { label: 'Out',       tone: 'tone-red',     row: '#FDF6F6' },
  none: { label: 'No recipe', tone: 'tone-neutral', row: 'transparent' },
};

const blankLine = () => ({ key: `l-${Math.random().toString(36).slice(2)}`, inventoryItemId: '', quantity: '' });

/**
 * Edits one dish's recipe: the raw materials a single serving eats up. The
 * quantity is always in the ingredient's own stock unit, which is why the unit
 * is shown rather than asked for.
 */
function RecipeEditor({ recipe, inventory, onSave, onClose }) {
  const [lines, setLines] = useState(() =>
    recipe.lines.length
      ? recipe.lines.map((l) => ({
          key: l.id,
          inventoryItemId: l.inventoryItemId,
          quantity: String(l.quantity),
        }))
      : [blankLine()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const invById = useMemo(
    () => new Map(inventory.map((i) => [i.id, i])),
    [inventory],
  );

  const setLine = (key, patch) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key) =>
    setLines((prev) => (prev.length === 1 ? [blankLine()] : prev.filter((l) => l.key !== key)));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const result = await onSave(recipe.id, lines);
    setSaving(false);
    if (result.success) onClose();
    else setError(result.error || 'Could not save the recipe.');
  };

  const filled = lines.filter((l) => l.inventoryItemId && Number(l.quantity) > 0);

  return (
    <div className="overlay" onClick={saving ? undefined : onClose}>
      <form className="modal modal--wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal__title">{recipe.name}</div>
            <div className="rec-sub">What one serving takes out of inventory</div>
          </div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="rec-error">{error}</div>}

          {inventory.length === 0 ? (
            <div className="rec-note">
              There are no inventory items yet. Add your raw materials on the
              Inventory screen first, then come back and build the recipe.
            </div>
          ) : (
            <>
              <div className="rec-lines">
                {lines.map((line) => {
                  const inv = invById.get(line.inventoryItemId);
                  return (
                    <div key={line.key} className="rec-line">
                      <select
                        value={line.inventoryItemId}
                        onChange={(e) => setLine(line.key, { inventoryItemId: e.target.value })}
                      >
                        <option value="">Select ingredient…</option>
                        {inventory.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.item_name}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                      />

                      <span className="rec-unit">{inv?.unit || '—'}</span>

                      <button
                        type="button"
                        className="rec-remove"
                        onClick={() => removeLine(line.key)}
                        title="Remove ingredient"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                className="btn btn--ghost btn--sm rec-add"
                onClick={() => setLines([...lines, blankLine()])}
              >
                <Plus size={14} /> Add ingredient
              </button>

              <div className="rec-note">
                {filled.length === 0
                  ? 'Saving with no ingredients removes the recipe — this dish will stop moving stock.'
                  : `Each ${recipe.name} ordered will deduct these ${filled.length} ${filled.length === 1 ? 'item' : 'items'} automatically, from any panel.`}
              </div>
            </>
          )}
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving || inventory.length === 0}>
            {saving ? 'Saving…' : 'Save recipe'}
          </button>
        </div>

        <style>{`
          .modal--wide { width: 560px; }
          .rec-sub { font-size: 12.5px; color: var(--color-text-muted); margin-top: 2px; }
          .rec-lines { display: flex; flex-direction: column; gap: 8px; }

          .rec-line {
            display: grid;
            grid-template-columns: 1fr 96px 52px 30px;
            gap: 8px;
            align-items: center;
          }

          .rec-line select,
          .rec-line input {
            height: 40px;
            padding: 0 12px;
            border: 1px solid var(--color-border);
            border-radius: var(--radius-sm);
            background: var(--color-surface);
            color: var(--color-text);
            font-size: 13.5px;
            font-family: inherit;
            box-sizing: border-box;
            width: 100%;
          }
          .rec-line select:focus,
          .rec-line input:focus { border-color: var(--color-border-strong); outline: none; }

          .rec-unit {
            font-size: 12.5px;
            color: var(--color-text-muted);
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .rec-remove {
            width: 30px;
            height: 30px;
            border: 1px solid var(--color-border);
            border-radius: 8px;
            background: var(--color-surface);
            color: var(--color-text-muted);
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
          .rec-remove:hover { color: var(--color-danger); border-color: var(--color-danger-border); }

          .rec-add { align-self: flex-start; gap: 6px; }

          .rec-note {
            font-size: 12.5px;
            line-height: 1.5;
            color: var(--color-text-muted);
            background: var(--color-well);
            border-radius: var(--radius-md);
            padding: 12px 14px;
          }

          .rec-error {
            padding: 12px 14px;
            border-radius: var(--radius-md);
            background: var(--color-danger-soft);
            color: var(--color-danger);
            font-size: 13px;
            font-weight: 600;
          }
        `}</style>
      </form>
    </div>
  );
}

const PAGE_SIZE = 100;

/** Pick a dish to copy this recipe onto. */
function CopyRecipeModal({ recipe, recipes, onClose, onCopy }) {
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await onCopy(recipe.id, target);
    setSaving(false);
    if (res.success) onClose(res.copied);
    else setError(res.error || 'Could not copy the recipe.');
  };

  return (
    <div className="overlay" onClick={() => onClose()}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">Copy recipe</div>
          <button type="button" className="modal__close" onClick={() => onClose()}>
            <X size={17} />
          </button>
        </div>

        <div className="modal__body">
          {error && <div className="mst-note bad">{error}</div>}
          <div className="card__subtitle">
            Copies the {recipe.lines.length} ingredient
            {recipe.lines.length === 1 ? '' : 's'} from <strong>{recipe.name}</strong> onto
            another dish, replacing whatever recipe it has now.
          </div>

          <div className="field">
            <label>Copy onto</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)} required>
              <option value="">Select a dish…</option>
              {recipes
                .filter((r) => r.id !== recipe.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.lines.length ? ` — replaces ${r.lines.length} ingredient(s)` : ''}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => onClose()}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving || !target}>
            {saving ? 'Copying…' : 'Copy recipe'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Recipe Management — which dish eats which raw materials.
 *
 * A recipe is what connects the menu to the store: without one, a dish can be
 * sold all night and stock will never move. So the list leads with whether a
 * recipe exists at all, and the Auto Consumption switch says plainly whether
 * those recipes are currently being applied.
 */
export default function Recipes() {
  const {
    recipes, inventory, categories, metrics, loading, error,
    saveRecipe, autoConsume, setAutoConsumption,
    clearRecipe, clearRecipes, copyRecipe,
  } = useRecipesData();

  const [query, setQuery] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [createdFilter, setCreatedFilter] = useState('all');
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(0);

  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [copying, setCopying] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const flash = (msg, tone = 'ok') => {
    setNotice({ msg, tone });
    setTimeout(() => setNotice(null), 3600);
  };

  /* ------------------------------------------------------------ filtering */
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (itemFilter && r.id !== itemFilter) return false;
      if (categoryFilter && r.categoryId !== categoryFilter) return false;
      if (createdFilter === 'created' && !r.lines.length) return false;
      if (createdFilter === 'not_created' && r.lines.length) return false;
      if (createdFilter === 'risk' && r.health !== 'low' && r.health !== 'out') return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [recipes, query, itemFilter, categoryFilter, createdFilter]);

  const tabs = useMemo(() => {
    const counts = new Map();
    searched.forEach((r) => {
      const key = r.categoryId || 'none';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [
      { key: 'all', label: 'All categories', count: searched.length },
      ...categories.map((c) => ({
        key: c.id, label: c.category_name, count: counts.get(c.id) || 0,
      })),
      { key: 'none', label: 'Uncategorised', count: counts.get('none') || 0 },
    ];
  }, [searched, categories]);

  const visible = useMemo(() => {
    if (tab === 'all') return searched;
    if (tab === 'none') return searched.filter((r) => !r.categoryId);
    return searched.filter((r) => r.categoryId === tab);
  }, [searched, tab]);

  const paged = useMemo(
    () => visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [visible, page],
  );

  useEffect(() => { setPage(0); }, [tab, query, itemFilter, categoryFilter, createdFilter]);

  /* ----------------------------------------------------------- selection */
  const allOnPageSelected = paged.length > 0 && paged.every((r) => selected.has(r.id));

  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allOnPageSelected) paged.forEach((r) => next.delete(r.id));
    else paged.forEach((r) => next.add(r.id));
    return next;
  });

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /* ------------------------------------------------------------- actions */
  const toggleAuto = async () => {
    const next = !autoConsume;
    const res = await setAutoConsumption(next);
    if (!res.success) flash(res.error || 'Could not change the setting.', 'bad');
    else {
      flash(next
        ? 'Auto consumption on — orders will deduct their recipes from stock.'
        : 'Auto consumption off — orders will no longer move stock.');
    }
  };

  const handleClear = async (recipe) => {
    if (!window.confirm(`Remove the recipe for ${recipe.name}? The dish stays on the menu.`)) return;
    const res = await clearRecipe(recipe.id);
    flash(res.success ? `Recipe for ${recipe.name} removed.` : res.error, res.success ? 'ok' : 'bad');
  };

  const bulkClear = async () => {
    const withRecipes = [...selected].filter(
      (id) => recipes.find((r) => r.id === id)?.lines.length,
    );
    if (withRecipes.length === 0) { flash('None of those have a recipe.', 'bad'); return; }
    if (!window.confirm(`Remove ${withRecipes.length} recipe(s)? The dishes stay on the menu.`)) return;

    setBusy(true);
    const res = await clearRecipes(withRecipes);
    setBusy(false);
    if (res.success) { flash(`${withRecipes.length} recipe(s) removed.`); setSelected(new Set()); }
    else flash(res.error || 'Could not clear those.', 'bad');
  };

  const exportCsv = () => {
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [['Dish', 'Category', 'Ingredient', 'Quantity', 'Unit'].join(',')];
    visible.forEach((r) => {
      if (!r.lines.length) {
        rows.push([r.name, r.category, '(no recipe)', '', ''].map(esc).join(','));
        return;
      }
      r.lines.forEach((l) => {
        rows.push([r.name, r.category, l.name, l.quantity, l.unit].map(esc).join(','));
      });
    });
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `recipes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const firstWithoutRecipe = recipes.find((r) => !r.lines.length);

  const cards = [
    { label: 'Dishes', value: metrics.dishes, color: 'var(--color-text)' },
    { label: 'Recipes set', value: metrics.mapped, color: 'var(--color-text)' },
    { label: 'Running low', value: metrics.low, color: 'var(--color-warning)' },
    { label: 'Cannot make', value: metrics.out, color: 'var(--color-danger)' },
  ];

  return (
    <div className="page">
      <div className="mst-top">
        <div>
          <h2 className="mst-title">Recipe Management</h2>
          <div className="card__subtitle">
            {metrics.mapped} of {metrics.dishes} dishes have a recipe
          </div>
        </div>
        <div className="mst-actions">
          <button
            className="btn btn--primary"
            onClick={() => setEditing(firstWithoutRecipe || recipes[0])}
            disabled={recipes.length === 0}
          >
            <Plus size={15} /> Create New
          </button>
          <ActionMenu
            label="More Actions"
            disabled={selected.size === 0}
            items={[
              {
                label: 'Clear selected recipes',
                icon: <Eraser size={14} />,
                danger: true,
                onClick: bulkClear,
                disabled: busy,
              },
            ]}
          />
          <ActionMenu
            label="Files"
            items={[{ label: 'Export as CSV', icon: <FileDown size={14} />, onClick: exportCsv }]}
          />
        </div>
      </div>

      <div className="metric-grid metric-grid--4">
        {cards.map((c) => (
          <div key={c.label} className="metric-card">
            <div className="metric-card__label">{c.label}</div>
            <div className="metric-card__value" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {notice && <div className={`mst-note ${notice.tone === 'bad' ? 'bad' : ''}`}>{notice.msg}</div>}

      {error && (
        <div className="mst-note bad">
          Could not load recipes: {error}. If this mentions a missing table, run
          <code> db/migrate_recipes_inventory.sql </code> in the Supabase SQL editor.
        </div>
      )}

      {!loading && !error && inventory.length === 0 && (
        <div className="mst-note warn">
          <AlertTriangle size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Add raw materials under Inventory first — recipes are built from those.
        </div>
      )}

      {!autoConsume && (
        <div className="mst-note warn">
          <AlertTriangle size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Auto consumption is off. Orders are not deducting ingredients, so stock levels
          will drift from reality until it is switched back on.
        </div>
      )}

      {/* -------------------------------------------------------- filters */}
      <div className="card mst-filters">
        <div className="field">
          <label>Item</label>
          <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
            <option value="">All items</option>
            {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Category</label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.category_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Recipes</label>
          <select value={createdFilter} onChange={(e) => setCreatedFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="created">Created recipes</option>
            <option value="not_created">Not created yet</option>
            <option value="risk">Needs attention</option>
          </select>
        </div>
        <div className="field">
          <label>Search</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Dish or category"
          />
        </div>
        <div className="mst-filters__actions">
          <button
            className="btn btn--ghost"
            onClick={() => {
              setQuery(''); setItemFilter(''); setCategoryFilter('');
              setCreatedFilter('all'); setTab('all');
            }}
          >
            Clear
          </button>
        </div>
        <label className="auto-toggle">
          <button
            type="button"
            className={`toggle ${autoConsume ? 'on' : ''}`}
            onClick={toggleAuto}
            aria-pressed={autoConsume}
            aria-label="Auto consumption"
          />
          <span>Auto Consumption</span>
        </label>
      </div>

      <CategoryStrip tabs={tabs} active={tab} onSelect={setTab} unit="items" />

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <span className="card__subtitle">Use More Actions above to clear their recipes.</span>
      </SelectionBar>

      {/* ---------------------------------------------------------- table */}
      <div className="table-card table-card--padded">
        <div className="table-head rc-head">
          <div className="rc-check">
            <input
              type="checkbox"
              className="gcheck"
              checked={allOnPageSelected}
              onChange={toggleAll}
              aria-label="Select all on this page"
            />
          </div>
          <div className="rc-name">Name</div>
          <div className="rc-cat">Category</div>
          <div className="rc-ing">Ingredients</div>
          <div className="rc-left">Can make</div>
          <div className="rc-act">Action</div>
        </div>

        {loading && <div className="empty-state">Loading recipes…</div>}

        {!loading && recipes.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><ChefHat size={22} /></span>
            <div className="empty-state__title">No dishes on the menu yet</div>
            <div className="empty-state__sub">
              Add dishes in Menu Catalog, then come back and tell each one what it takes
              out of the store.
            </div>
          </div>
        )}

        {!loading && recipes.length > 0 && visible.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__sub">Nothing matches these filters.</div>
          </div>
        )}

        {!loading && paged.map((r) => (
          <div key={r.id} className="table-row rc-row">
            <div className="rc-check">
              <input
                type="checkbox"
                className="gcheck"
                checked={selected.has(r.id)}
                onChange={() => toggleOne(r.id)}
                aria-label={`Select ${r.name}`}
              />
            </div>
            <div className="rc-name">
              <div className="strong">{r.name}</div>
              {!r.isAvailable && <div className="rc-sub">Off the menu</div>}
            </div>
            <div className="rc-cat muted">{r.category}</div>
            <div className="rc-ing">
              {r.lines.length === 0
                ? <span className="pill pill--sm tone-neutral">No recipe</span>
                : (
                  <span className="muted">
                    {r.lines.length} ingredient{r.lines.length === 1 ? '' : 's'}
                  </span>
                )}
            </div>
            <div className="rc-left">
              {r.lines.length === 0 ? <span className="muted">—</span> : (
                <span className={`pill pill--sm ${
                  r.health === 'out' ? 'tone-red' : r.health === 'low' ? 'tone-amber' : 'tone-green'
                }`}
                >
                  {r.servingsLeft} serving{r.servingsLeft === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div className="rc-act">
              <button className="step" title="Edit recipe" onClick={() => setEditing(r)}>
                <Pencil size={12} />
              </button>
              <button
                className="step"
                title="Copy recipe onto another dish"
                onClick={() => setCopying(r)}
                disabled={r.lines.length === 0}
              >
                <Copy size={12} />
              </button>
              <button
                className="step step--danger"
                title="Remove recipe"
                onClick={() => handleClear(r)}
                disabled={r.lines.length === 0}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}

        <Pager page={page} pageSize={PAGE_SIZE} total={visible.length} onPage={setPage} />
      </div>

      {editing && (
        <RecipeEditor
          recipe={editing}
          inventory={inventory}
          onSave={saveRecipe}
          onClose={() => setEditing(null)}
        />
      )}

      {copying && (
        <CopyRecipeModal
          recipe={copying}
          recipes={recipes}
          onCopy={copyRecipe}
          onClose={(copied) => {
            setCopying(null);
            if (copied) flash(`${copied} ingredient(s) copied.`);
          }}
        />
      )}

      <MastersStyles />
      <style>{`
        .rc-head, .rc-row { margin: 0 -24px; padding: 0 24px; }
        .rc-check { width: 40px; }
        .rc-name  { flex: 1.6; min-width: 0; }
        .rc-cat   { flex: 1; min-width: 0; }
        .rc-ing   { width: 140px; }
        .rc-left  { width: 130px; }
        .rc-act   { width: 110px; display: flex; justify-content: flex-end; gap: 6px; }
        .rc-sub   { font-size: 11.5px; color: var(--color-text-muted); }

        .auto-toggle {
          display: flex; align-items: center; gap: 9px;
          font-size: 13px; font-weight: 700; color: var(--color-text);
          white-space: nowrap; padding-bottom: 8px;
        }

        .step {
          width: 26px; height: 26px; border: 1px solid var(--color-border);
          border-radius: 8px; background: var(--color-surface);
          color: var(--color-text-muted); display: inline-flex;
          align-items: center; justify-content: center; cursor: pointer;
        }
        .step:hover:not(:disabled) { background: var(--color-canvas); color: var(--color-text); }
        .step:disabled { opacity: 0.35; cursor: not-allowed; }
        .step--danger:hover:not(:disabled) {
          color: var(--color-danger); border-color: var(--color-danger-border);
        }
      `}</style>
    </div>
  );
}
