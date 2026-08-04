import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import * as db from '../lib/db';
import {
  Plus, Trash2, ChevronRight, WifiOff, Settings, X, Edit3, Search, Utensils,
} from 'lucide-react';

const FOOD_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'200\'%3E%3Crect width=\'400\' height=\'200\' fill=\'%23F0F1F4\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-size=\'48\' opacity=\'0.35\'%3E%F0%9F%8D%BD%EF%B8%8F%3C/text%3E%3C/svg%3E';

const TAX_RATE = 0.1;

const inr = (n) => `₹${Number(n || 0).toFixed(2)}`;

function getOnlineStatus() {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

function FormModal({ title, fields, onSave, onClose, initial }) {
  const [form, setForm] = useState(initial || {});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">{title}</div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal__body">
          {fields.map((f) => (
            <div key={f.key} className="field">
              <label>{f.label}</label>
              {f.type === 'select' ? (
                <select
                  value={form[f.key] || ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  required={f.required}
                >
                  <option value="">{f.placeholder || 'Select…'}</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'number' ? (
                <input
                  type="number"
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value === '' ? '' : Number(e.target.value) })}
                  required={f.required}
                  placeholder={f.placeholder}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                />
              ) : f.type === 'textarea' ? (
                <textarea
                  value={form[f.key] || ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  rows={3}
                />
              ) : f.type === 'checkbox' ? (
                <div className="menu-toggle-row">
                  <span>{f.checkLabel || 'Enabled'}</span>
                  <button
                    type="button"
                    className={`toggle ${form[f.key] !== false ? 'on' : ''}`}
                    onClick={() => setForm({ ...form, [f.key]: form[f.key] === false })}
                    aria-pressed={form[f.key] !== false}
                  />
                </div>
              ) : (
                <input
                  type={f.type || 'text'}
                  value={form[f.key] || ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  required={f.required}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>

        <style>{`
          .menu-toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 40px;
            padding: 0 14px;
            border: 1px solid var(--color-border);
            border-radius: var(--radius-sm);
            font-size: 13.5px;
            font-weight: 600;
          }
        `}</style>
      </div>
    </div>
  );
}

const MenuCatalog = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('sessionId');
  const tableId = searchParams.get('tableId');

  const [isOnline, setIsOnline] = useState(getOnlineStatus);
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [manageMode, setManageMode] = useState(false);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    fetchMenuData();
  }, []);

  const fetchMenuData = async () => {
    try {
      setLoading(true);
      setLoadError(null);

      if (getOnlineStatus()) {
        const { data: catsData, error: catsError } = await supabase
          .from('menu_categories').select('*').order('category_name');
        if (catsError) throw catsError;

        const { data: itemsData, error: itemsError } = await supabase
          .from('menu_items').select('*');
        if (itemsError) throw itemsError;

        const safeCats = catsData || [];
        const safeItems = itemsData || [];

        await db.putMany('menu_categories', safeCats);
        await db.putMany('menu_items', safeItems);

        setCategories(safeCats);
        setMenuItems(safeItems);
        if (safeCats.length > 0) setActiveCategory((prev) => prev ?? safeCats[0].id);
      } else {
        const cachedCats = (await db.getAll('menu_categories')) || [];
        const cachedItems = (await db.getAll('menu_items')) || [];

        if (cachedCats.length === 0) {
          setLoadError('Menu not available offline. Connect to the internet to load menu data first.');
        } else {
          setCategories(cachedCats);
          setMenuItems(cachedItems);
          setActiveCategory((prev) => prev ?? cachedCats[0].id);
        }
      }
    } catch (error) {
      const cachedCats = (await db.getAll('menu_categories')) || [];
      const cachedItems = (await db.getAll('menu_items')) || [];
      if (cachedCats.length > 0) {
        setCategories(cachedCats);
        setMenuItems(cachedItems);
        setActiveCategory((prev) => prev ?? cachedCats[0].id);
      } else {
        setLoadError('Failed to load menu: ' + (error.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const addToOrder = (item) => {
    const existing = orderItems.find((i) => i.id === item.id);
    if (existing) {
      setOrderItems(orderItems.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i)));
    } else {
      setOrderItems([...orderItems, { id: item.id, name: item.item_name, price: item.price, notes: '', qty: 1 }]);
    }
  };

  const updateQty = (id, delta) => {
    setOrderItems(
      orderItems
        .map((i) => {
          if (i.id === id) {
            const newQty = Math.max(0, i.qty + delta);
            return newQty === 0 ? null : { ...i, qty: newQty };
          }
          return i;
        })
        .filter(Boolean),
    );
  };

  const clearOrder = () => {
    if (confirm('Clear entire order?')) setOrderItems([]);
  };

  const createOrder = async () => {
    if (orderItems.length === 0) return;

    const validSessionId = sessionId && sessionId !== 'undefined' && sessionId !== 'null' ? sessionId : null;
    const validTableId = tableId && tableId !== 'undefined' && tableId !== 'null' ? tableId : null;

    if (!validSessionId) {
      alert('No active session found. Please assign a table first.');
      return;
    }

    try {
      const sub = orderItems.reduce((acc, item) => acc + item.price * item.qty, 0);
      const t = sub * TAX_RATE;
      const tot = sub + t;

      if (getOnlineStatus()) {
        const orderPayload = { session_id: validSessionId, order_status: 'preparing', subtotal: sub, tax: t, total: tot };
        if (validTableId) orderPayload.table_id = validTableId;

        const { data: order, error: orderError } = await supabase
          .from('orders').insert([orderPayload]).select().single();
        if (orderError) throw orderError;

        const orderItemsToInsert = orderItems.map((item) => ({
          order_id: order.id, menu_item_id: item.id, quantity: item.qty,
          item_price: item.price, total_price: item.price * item.qty,
        }));

        const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);
        if (itemsError) throw itemsError;

        alert('Order placed successfully!');
      } else {
        const orderTempId = db.generateTempId();
        const orderData = {
          id: orderTempId, session_id: validSessionId, table_id: validTableId || null,
          order_status: 'preparing', subtotal: sub, tax: t, total: tot, created_at: new Date().toISOString(),
        };
        await db.put('orders', orderData);
        await db.enqueueSync({ action: 'insert', table: 'orders', tempId: orderTempId, data: { session_id: validSessionId, table_id: validTableId || null, order_status: 'preparing', subtotal: sub, tax: t, total: tot } });

        for (const item of orderItems) {
          const itemTempId = db.generateTempId();
          await db.put('order_items', { id: itemTempId, order_id: orderTempId, menu_item_id: item.id, quantity: item.qty, item_price: item.price, total_price: item.price * item.qty, session_id: validSessionId });
          await db.enqueueSync({ action: 'insert', table: 'order_items', tempId: itemTempId, data: { order_id: orderTempId, menu_item_id: item.id, quantity: item.qty, item_price: item.price, total_price: item.price * item.qty } });
        }

        alert('Order saved offline! It will sync when you reconnect.');
      }

      setOrderItems([]);
      navigate('/billing');
    } catch (error) {
      alert('Error creating order: ' + error.message);
    }
  };

  const handleSaveCategory = async (form) => {
    const name = form.category_name?.trim();
    if (!name) { alert('Category name is required.'); return; }
    if (form.id) {
      await supabase.from('menu_categories').update({ category_name: name }).eq('id', form.id);
    } else {
      await supabase.from('menu_categories').insert([{ category_name: name }]);
    }
    await fetchMenuData();
  };

  const handleDeleteCategory = async (id, name) => {
    if (!confirm(`Delete category "${name}"? Items in this category will be orphaned.`)) return;
    await supabase.from('menu_categories').delete().eq('id', id);
    await fetchMenuData();
  };

  const handleSaveItem = async (form) => {
    if (!form.item_name?.trim() || !form.price) { alert('Name and price are required.'); return; }
    const payload = {
      item_name: form.item_name.trim(),
      price: Number(form.price),
      category_id: form.category_id || null,
      description: form.description?.trim() || '',
      image_url: form.image_url?.trim() || '',
      is_available: form.is_available !== false,
    };
    if (form.id) {
      await supabase.from('menu_items').update(payload).eq('id', form.id);
    } else {
      await supabase.from('menu_items').insert([payload]);
    }
    await fetchMenuData();
  };

  const handleToggleAvailability = async (item) => {
    const next = item.is_available === false;
    setMenuItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, is_available: next } : m)));
    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: next })
      .eq('id', item.id);
    if (error) {
      // Roll the optimistic flip back so the card never lies about stock.
      setMenuItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, is_available: !next } : m)));
      alert('Could not update availability: ' + error.message);
    }
  };

  const handleDeleteItem = async (id, name) => {
    if (!confirm(`Delete item "${name}"?`)) return;
    await supabase.from('menu_items').delete().eq('id', id);
    await fetchMenuData();
  };

  const subtotal = orderItems.reduce((acc, item) => acc + item.price * item.qty, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  const q = search.trim().toLowerCase();
  const inCategory = menuItems.filter((item) => item.category_id === activeCategory);
  const searched = q
    ? inCategory.filter((i) => (i.item_name || '').toLowerCase().includes(q))
    : inCategory;
  // Diners can only be sold what's on; managers need to see the 86'd items too.
  const availabilityScoped = manageMode ? searched : searched.filter((i) => i.is_available !== false);
  const visibleItems = availabilityScoped.filter((i) => {
    if (activeFilter === 'Available') return i.is_available !== false;
    if (activeFilter === 'Unavailable') return i.is_available === false;
    return true;
  });

  const countFor = (catId) => menuItems.filter((i) => i.category_id === catId).length;

  // The basket only makes sense when this screen was opened to punch an order
  // (via New Order). Browsing the catalog on its own gets the full width.
  const isOrdering = Boolean(sessionId && sessionId !== 'undefined' && sessionId !== 'null');

  if (loadError) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <span className="empty-state__mark"><WifiOff size={22} /></span>
            <div className="empty-state__title">Menu unavailable</div>
            <div className="empty-state__sub">{loadError}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="menu-view">
      {!isOnline && (
        <div className="menu-offline">
          <WifiOff size={14} /> Offline — using cached menu
        </div>
      )}

      <div className={`menu-layout ${isOrdering ? '' : 'menu-layout--catalog'}`}>
        {/* Category rail */}
        <div className="card menu-rail">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className={`menu-rail__item ${activeCategory === cat.id ? 'on' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <span className="menu-rail__name">{cat.category_name}</span>
              {manageMode ? (
                <span className="menu-rail__actions">
                  <button
                    onClick={(e) => { e.stopPropagation(); setModal({ type: 'editCategory', data: { id: cat.id, category_name: cat.category_name } }); }}
                    title="Edit category"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id, cat.category_name); }}
                    title="Delete category"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ) : (
                <span className="menu-rail__count">{countFor(cat.id)}</span>
              )}
            </div>
          ))}

          <button
            className="menu-rail__add"
            onClick={() => setModal({ type: 'addCategory', data: { category_name: '' } })}
          >
            + Add category
          </button>
        </div>

        {/* Dish grid */}
        <div className="menu-main">
          <div className="menu-toolbar">
            <div className="search-input menu-search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search dishes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="segmented">
              {['All', 'Available', 'Unavailable'].map((f) => (
                <button
                  key={f}
                  className={activeFilter === f ? 'on' : ''}
                  onClick={() => setActiveFilter(f)}
                  title={f === 'Unavailable' ? 'Items currently 86’d' : undefined}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              className={`btn ${manageMode ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setManageMode(!manageMode)}
            >
              <Settings size={14} /> {manageMode ? 'Done' : 'Manage'}
            </button>

            <div className="spacer" />

            <button
              className="btn btn--primary"
              onClick={() => setModal({
                type: 'addItem',
                data: { item_name: '', price: '', description: '', category_id: activeCategory, image_url: '', is_available: true },
              })}
            >
              + Add dish
            </button>
          </div>

          {loading ? (
            <div className="card"><div className="empty-state"><div className="empty-state__sub">Loading menu…</div></div></div>
          ) : visibleItems.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <span className="empty-state__mark"><Utensils size={22} /></span>
                <div className="empty-state__title">Nothing in this category</div>
                <div className="empty-state__sub">
                  {q ? 'No dishes match your search.' : 'Add a dish to get started.'}
                </div>
              </div>
            </div>
          ) : (
            <div className="menu-grid">
              {visibleItems.map((item) => {
                const available = item.is_available !== false;
                return (
                  <div key={item.id} className="dish-card" style={{ opacity: available ? 1 : 0.55 }}>
                    <div className="dish-card__photo">
                      <img
                        src={item.image_url || FOOD_PLACEHOLDER}
                        alt={item.item_name}
                        onError={(e) => { e.target.onerror = null; e.target.src = FOOD_PLACEHOLDER; }}
                      />
                    </div>

                    <div className="dish-card__body">
                      <div className="dish-card__top">
                        <div className="dish-card__name">{item.item_name}</div>
                        {manageMode && (
                          <span className="dish-card__tools">
                            <button
                              onClick={() => setModal({
                                type: 'editItem',
                                data: {
                                  id: item.id, item_name: item.item_name, price: item.price,
                                  description: item.description, category_id: item.category_id,
                                  image_url: item.image_url, is_available: item.is_available,
                                },
                              })}
                              title="Edit dish"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id, item.item_name)}
                              title="Delete dish"
                            >
                              <Trash2 size={13} />
                            </button>
                          </span>
                        )}
                      </div>

                      {item.description && <div className="dish-card__desc">{item.description}</div>}

                      <div className="dish-card__foot">
                        <div className="dish-card__price tnum">{inr(item.price)}</div>
                        {manageMode ? (
                          <button
                            type="button"
                            className={`toggle toggle--sm ${available ? 'on' : ''}`}
                            onClick={() => handleToggleAvailability(item)}
                            aria-pressed={available}
                            title={available ? 'Available' : 'Unavailable'}
                          />
                        ) : (
                          <button className="dish-card__add" onClick={() => addToOrder(item)}>
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Current order — only while taking an order */}
        {isOrdering && (
        <div className="card menu-order">
          <div className="card__head">
            <div style={{ flex: 1 }}>
              <div className="card__title">Current order</div>
              <div className="card__subtitle">{orderItems.length} item{orderItems.length === 1 ? '' : 's'}</div>
            </div>
            <button className="link-action" onClick={clearOrder}>Clear all</button>
          </div>

          <div className="menu-order__items">
            {orderItems.length === 0 && (
              <div className="empty-state">
                <div className="empty-state__sub">Your order is empty.</div>
              </div>
            )}

            {orderItems.map((item, i) => (
              <div key={i} className="menu-order__row">
                <div className="menu-order__main">
                  <div className="menu-order__name">{item.name}</div>
                  <div className="card__subtitle">{item.notes || 'No notes'}</div>
                </div>
                <div className="bd-stepper">
                  <button onClick={() => updateQty(item.id, -1)}>−</button>
                  <span className="tnum">{item.qty}</span>
                  <button onClick={() => updateQty(item.id, 1)}>+</button>
                </div>
                <div className="menu-order__amt tnum">{inr(item.price * item.qty)}</div>
              </div>
            ))}
          </div>

          <div className="menu-order__totals tnum">
            <div className="menu-order__total-row"><span>Subtotal</span><b>{inr(subtotal)}</b></div>
            <div className="menu-order__total-row"><span>Tax (10%)</span><b>{inr(tax)}</b></div>
            <div className="menu-order__total-row menu-order__total-row--grand">
              <span>Total</span><span>{inr(total)}</span>
            </div>
            <button
              className="btn btn--primary"
              style={{ width: '100%', marginTop: 8 }}
              onClick={createOrder}
              disabled={orderItems.length === 0}
            >
              Create order <ChevronRight size={16} />
            </button>
          </div>
        </div>
        )}
      </div>

      {modal?.type === 'addCategory' && (
        <FormModal
          title="Add category"
          fields={[{ key: 'category_name', label: 'Category name', placeholder: 'e.g. Desserts', required: true }]}
          initial={{ category_name: '' }}
          onSave={handleSaveCategory}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'editCategory' && (
        <FormModal
          title="Edit category"
          fields={[{ key: 'category_name', label: 'Category name', required: true }]}
          initial={modal.data}
          onSave={handleSaveCategory}
          onClose={() => setModal(null)}
        />
      )}
      {(modal?.type === 'addItem' || modal?.type === 'editItem') && (
        <FormModal
          title={modal.type === 'addItem' ? 'Add dish' : 'Edit dish'}
          fields={[
            { key: 'item_name', label: 'Dish name', placeholder: 'e.g. Butter Chicken', required: true },
            { key: 'price', label: 'Price (₹)', type: 'number', placeholder: 'e.g. 350', required: true, min: 1, step: 0.5 },
            { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Brief description…' },
            { key: 'category_id', label: 'Category', type: 'select', options: categories.map((c) => ({ value: c.id, label: c.category_name })) },
            { key: 'image_url', label: 'Image URL', placeholder: 'https://…' },
            { key: 'is_available', label: 'Availability', type: 'checkbox', checkLabel: 'Available to order' },
          ]}
          initial={modal.data}
          onSave={handleSaveItem}
          onClose={() => setModal(null)}
        />
      )}

      <style>{`
        .menu-view { padding: 24px 32px 40px 32px; box-sizing: border-box; }

        .menu-offline {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--color-warning-soft);
          color: var(--color-warning);
          padding: 10px 16px;
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 16px;
        }

        .menu-layout {
          display: grid;
          grid-template-columns: 200px minmax(0, 1fr) 340px;
          gap: 20px;
          align-items: start;
        }

        /* No basket on screen — give the whole width to the dishes. */
        .menu-layout--catalog { grid-template-columns: 200px minmax(0, 1fr); }

        .menu-search {
          flex: 1 1 280px;
          min-width: 240px;
          max-width: 460px;
        }

        /* ---- category rail ---- */
        .menu-rail {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          position: sticky;
          top: 16px;
        }

        .menu-rail__item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 9px 12px;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-soft);
          cursor: pointer;
        }
        .menu-rail__item:hover { background: var(--color-well); }
        .menu-rail__item.on { background: var(--color-text); color: #fff; }

        .menu-rail__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .menu-rail__count { font-size: 12px; font-weight: 600; color: var(--color-text-faint); }
        .menu-rail__item.on .menu-rail__count { color: rgba(255, 255, 255, 0.7); }

        .menu-rail__actions { display: flex; gap: 4px; flex-shrink: 0; }
        .menu-rail__actions button {
          width: 22px;
          height: 22px;
          border: none;
          background: none;
          color: inherit;
          opacity: 0.7;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .menu-rail__actions button:hover { opacity: 1; }

        .menu-rail__add {
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 600;
          color: var(--color-info);
          background: none;
          border: none;
          text-align: left;
        }

        /* ---- dish grid ---- */
        .menu-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
        .menu-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

        .menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
        }

        .dish-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          transition: var(--transition-smooth);
        }
        .dish-card:hover { border-color: var(--color-border-strong); }

        .dish-card__photo { height: 110px; background: var(--color-well); }
        .dish-card__photo img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .dish-card__body { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
        .dish-card__top { display: flex; align-items: center; gap: 8px; }
        .dish-card__name { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; }

        .dish-card__desc {
          font-size: 12.5px;
          color: var(--color-text-muted);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .dish-card__tools { display: flex; gap: 4px; }
        .dish-card__tools button {
          width: 24px;
          height: 24px;
          border: none;
          background: none;
          color: var(--color-text-faint);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .dish-card__tools button:hover { color: var(--color-text); }

        .dish-card__foot { display: flex; align-items: center; justify-content: space-between; }
        .dish-card__price { font-size: 15px; font-weight: 800; }

        .dish-card__add {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          border: none;
          background: var(--color-primary);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dish-card__add:hover { background: var(--color-primary-hover); }

        /* ---- order panel ---- */
        .menu-order {
          position: sticky;
          top: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: calc(100vh - 120px);
        }

        .menu-order__items { flex: 1; overflow-y: auto; min-height: 80px; }

        .menu-order__row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 0;
          border-bottom: 1px solid var(--color-border-soft);
        }
        .menu-order__row:last-child { border-bottom: none; }

        .menu-order__main { flex: 1; min-width: 0; }
        .menu-order__name { font-size: 13.5px; font-weight: 600; }
        .menu-order__amt { font-size: 13.5px; font-weight: 700; min-width: 70px; text-align: right; }

        .menu-order__totals {
          border-top: 1px solid var(--color-border);
          padding-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          font-size: 13.5px;
        }
        .menu-order__total-row { display: flex; justify-content: space-between; color: var(--color-text-muted); }
        .menu-order__total-row b { color: var(--color-text); font-weight: 600; }
        .menu-order__total-row--grand {
          font-size: 16px;
          font-weight: 800;
          color: var(--color-text);
          padding-top: 8px;
          border-top: 1px solid var(--color-border);
        }

        @media (max-width: 1280px) {
          .menu-layout { grid-template-columns: 180px minmax(0, 1fr); }
          .menu-order { grid-column: 1 / -1; position: static; max-height: none; }
        }
      `}</style>
    </div>
  );
};

export default MenuCatalog;
