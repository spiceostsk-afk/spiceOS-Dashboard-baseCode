import React, { useMemo, useState } from 'react';
import { ChefHat, X, Plus, Trash2, Search, AlertTriangle } from 'lucide-react';
import { useRecipesData } from '../hooks/useRecipesData';

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

export default function Recipes() {
  const { recipes, inventory, metrics, loading, error, saveRecipe } = useRecipesData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (filter === 'mapped' && !r.lines.length) return false;
      if (filter === 'unmapped' && r.lines.length) return false;
      if (filter === 'risk' && r.health !== 'low' && r.health !== 'out') return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
    });
  }, [recipes, query, filter]);

  const cards = [
    { label: 'Dishes', value: metrics.dishes, color: 'var(--color-text)' },
    { label: 'Recipes set', value: metrics.mapped, color: 'var(--color-text)' },
    { label: 'Running low', value: metrics.low, color: 'var(--color-warning)' },
    { label: 'Cannot make', value: metrics.out, color: 'var(--color-danger)' },
  ];

  const FILTERS = [
    { key: 'all', label: 'All dishes' },
    { key: 'mapped', label: 'With a recipe' },
    { key: 'unmapped', label: 'No recipe yet' },
    { key: 'risk', label: 'Needs attention' },
  ];

  return (
    <div className="page">
      <div className="metric-grid metric-grid--4">
        {cards.map((c) => (
          <div key={c.label} className="metric-card">
            <div className="metric-card__label">{c.label}</div>
            <div className="metric-card__value" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="rec-banner rec-banner--error">
          <AlertTriangle size={15} />
          <span>
            Could not load recipes: {error}. If this mentions a missing table, run
            <code> db/migrate_recipes_inventory.sql </code> in the Supabase SQL editor.
          </span>
        </div>
      )}

      {!loading && !error && inventory.length === 0 && (
        <div className="rec-banner">
          <AlertTriangle size={15} />
          <span>Add your raw materials under Inventory first — recipes are built from those items.</span>
        </div>
      )}

      <div className="table-card table-card--padded">
        <div className="table-toolbar">
          <div className="search-input" style={{ flex: 1 }}>
            <Search size={15} />
            <input
              placeholder="Search dishes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="chip-row">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`chip ${filter === f.key ? 'on' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="table-head">
          <div className="c-dish">Dish</div>
          <div className="c-cat">Category</div>
          <div className="c-ing">Recipe</div>
          <div className="c-makes">Can make</div>
          <div className="c-status">Stock</div>
          <div className="c-act" />
        </div>

        {loading && <div className="empty-state">Loading recipes…</div>}

        {!loading && visible.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><ChefHat size={22} /></span>
            <div className="empty-state__title">
              {recipes.length === 0 ? 'No dishes on the menu yet' : 'Nothing matches that filter'}
            </div>
            <div className="empty-state__sub">
              {recipes.length === 0
                ? 'Add dishes in the Menu Catalog, then set a recipe for each one so stock depletes as they sell.'
                : 'Try a different search or filter.'}
            </div>
          </div>
        )}

        {!loading && visible.map((r) => {
          const h = HEALTH[r.health];
          return (
            <div
              key={r.id}
              className="table-row rec-row table-row--clickable"
              style={{ background: h.row }}
              onClick={() => setEditing(r)}
            >
              <div className="c-dish strong">{r.name}</div>
              <div className="c-cat muted">{r.category}</div>
              <div className="c-ing muted">
                {r.lines.length === 0
                  ? '—'
                  : r.lines.map((l) => `${l.name} ${l.quantity}${l.unit}`).join(' · ')}
              </div>
              <div className="c-makes strong amount">
                {r.servingsLeft === null ? '—' : r.servingsLeft}
              </div>
              <div className="c-status"><span className={`pill ${h.tone}`}>{h.label}</span></div>
              <div className="c-act">
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={(e) => { e.stopPropagation(); setEditing(r); }}
                >
                  {r.lines.length ? 'Edit' : 'Set recipe'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <RecipeEditor
          recipe={editing}
          inventory={inventory}
          onSave={saveRecipe}
          onClose={() => setEditing(null)}
        />
      )}

      <style>{`
        .rec-row { margin: 0 -24px; padding: 0 24px; }

        .c-dish { flex: 1.1; min-width: 0; }
        .c-cat { width: 130px; flex-shrink: 0; }
        .c-ing {
          flex: 1.8;
          min-width: 0;
          font-size: 12.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .c-makes { width: 90px; text-align: right; flex-shrink: 0; }
        .c-status { width: 100px; flex-shrink: 0; }
        .c-act { width: 100px; display: flex; justify-content: flex-end; flex-shrink: 0; }

        .rec-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: var(--radius-md);
          background: var(--color-warning-soft);
          color: var(--color-warning);
          font-size: 13px;
          font-weight: 600;
        }
        .rec-banner--error { background: var(--color-danger-soft); color: var(--color-danger); }
        .rec-banner code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
