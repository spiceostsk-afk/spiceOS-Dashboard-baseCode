import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import * as db from '../lib/db';
import {
  Utensils, Coffee, Soup, Pizza, IceCream, Salad, Clock, Plus, Trash2,
  ChevronRight, Beef, Croissant, Wine, Sandwich, WifiOff,
  Settings, X, Edit3, Save,
} from 'lucide-react';

const CATEGORY_ICONS = {
  'Beverages': Coffee, 'Drinks': Coffee, 'Desserts': IceCream, 'Sweets': IceCream,
  'Main Course': Beef, 'Mains': Beef, 'Pizza & Pasta': Pizza, 'Pizza': Pizza,
  'Pasta': Pizza, 'Soups': Soup, 'Starters': Salad, 'Appetizers': Salad,
  'Snacks': Sandwich, 'Bakery': Croissant, 'Cocktails': Wine,
};

const getCategoryIcon = (name) => {
  if (!name) return Utensils;
  const match = Object.keys(CATEGORY_ICONS).find((k) => name.toLowerCase().includes(k.toLowerCase()));
  return match ? CATEGORY_ICONS[match] : Utensils;
};

const FOOD_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'200\'%3E%3Crect width=\'400\' height=\'200\' fill=\'%23F9EBE0\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-size=\'48\' opacity=\'0.35\'%3E%F0%9F%8D%BD%EF%B8%8F%3C/text%3E%3C/svg%3E';

const TAX_RATE = 0.1;

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {fields.map((f) => (
            <div key={f.key} className="form-group">
              <label>{f.label}</label>
              {f.type === 'select' ? (
                <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} required={f.required}>
                  <option value="">{f.placeholder || 'Select...'}</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'number' ? (
                <input type="number" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value === '' ? '' : Number(e.target.value) })} required={f.required} placeholder={f.placeholder} min={f.min} max={f.max} step={f.step} />
              ) : f.type === 'textarea' ? (
                <textarea value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} rows={3} />
              ) : f.type === 'checkbox' ? (
                <label className="checkbox-label"><input type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} /> {f.checkLabel || 'Enabled'}</label>
              ) : (
                <input type={f.type || 'text'} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} required={f.required} placeholder={f.placeholder} />
              )}
            </div>
          ))}
          <div className="modal-footer">
            <button type="submit" className="save-btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
        <style>{`
          .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
          .modal-content { background: white; width: 440px; border-radius: 20px; overflow: hidden; box-shadow: var(--shadow-soft); border: 1px solid var(--color-border); }
          .modal-header { padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); }
          .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin: 0; }
          .close-btn { color: var(--color-text-muted); background: none; border: none; cursor: pointer; }
          .modal-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
          .form-group { display: flex; flex-direction: column; gap: 0.3rem; }
          .form-group label { font-size: 0.78rem; font-weight: 700; color: var(--color-text-muted); }
          .form-group input, .form-group select, .form-group textarea { padding: 0.65rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.9rem; color: var(--color-primary); font-weight: 600; background: white; outline: none; }
          .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: var(--color-accent); }
          .checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 600; color: var(--color-primary); cursor: pointer; }
          .checkbox-label input { width: auto; }
          .modal-footer { margin-top: 0.5rem; }
          .save-btn { width: 100%; padding: 0.75rem; background: var(--color-primary); color: white; border: none; border-radius: 10px; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
          .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
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
        if (safeCats.length > 0) setActiveCategory(safeCats[0].id);
      } else {
        const cachedCats = (await db.getAll('menu_categories')) || [];
        const cachedItems = (await db.getAll('menu_items')) || [];

        if (cachedCats.length === 0) {
          setLoadError('Menu not available offline. Please connect to internet to load menu data first.');
        } else {
          setCategories(cachedCats);
          setMenuItems(cachedItems);
          if (cachedCats.length > 0) setActiveCategory(cachedCats[0].id);
        }
      }
    } catch (error) {
      const cachedCats = (await db.getAll('menu_categories')) || [];
      const cachedItems = (await db.getAll('menu_items')) || [];
      if (cachedCats.length > 0) {
        setCategories(cachedCats);
        setMenuItems(cachedItems);
        if (cachedCats.length > 0) setActiveCategory(cachedCats[0].id);
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
        .filter(Boolean)
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
      const subtotal = orderItems.reduce((acc, item) => acc + item.price * item.qty, 0);
      const tax = subtotal * TAX_RATE;
      const total = subtotal + tax;

      if (getOnlineStatus()) {
        const orderPayload = { session_id: validSessionId, order_status: 'preparing', subtotal, tax, total };
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
          order_status: 'preparing', subtotal, tax, total, created_at: new Date().toISOString(),
        };
        await db.put('orders', orderData);
        await db.enqueueSync({ action: 'insert', table: 'orders', tempId: orderTempId, data: { session_id: validSessionId, table_id: validTableId || null, order_status: 'preparing', subtotal, tax, total } });

        for (const item of orderItems) {
          const itemTempId = db.generateTempId();
          await db.put('order_items', { id: itemTempId, order_id: orderTempId, menu_item_id: item.id, quantity: item.qty, item_price: item.price, total_price: item.price * item.qty, session_id: validSessionId });
          await db.enqueueSync({ action: 'insert', table: 'order_items', tempId: itemTempId, data: { order_id: orderTempId, menu_item_id: item.id, quantity: item.qty, item_price: item.price, total_price: item.price * item.qty } });
        }

        alert('Order saved offline! Will sync when connected.');
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

  const handleDeleteItem = async (id, name) => {
    if (!confirm(`Delete item "${name}"?`)) return;
    await supabase.from('menu_items').delete().eq('id', id);
    await fetchMenuData();
  };

  const subtotal = orderItems.reduce((acc, item) => acc + item.price * item.qty, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  const filteredItems = menuItems.filter((item) => item.category_id === activeCategory);

  const visibleItems = manageMode ? filteredItems : filteredItems.filter((i) => i.is_available !== false);

  if (loading) {
    return <div className="loading-state">Loading menu...</div>;
  }

  if (loadError) {
    return (
      <div className="error-state">
        <WifiOff size={32} strokeWidth={1} />
        <p>{loadError}</p>
        <style>{`
          .error-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; height: 100%; color: var(--color-text-muted); }
          .error-state p { max-width: 300px; text-align: center; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="menu-view">
      {!isOnline && (
        <div className="offline-banner">
          <WifiOff size={14} /> Offline — using cached menu
        </div>
      )}

      <div className="category-sidebar">
        {categories.map((cat) => {
          const IconComponent = getCategoryIcon(cat.category_name);
          return (
            <div key={cat.id} className={`category-item ${activeCategory === cat.id ? 'active' : ''} ${manageMode ? 'manage-mode' : ''}`}>
              <div className="cat-icon-box" onClick={() => setActiveCategory(cat.id)}>
                <IconComponent size={22} />
              </div>
              <span>{cat.category_name}</span>
              {manageMode && (
                <div className="cat-manage-actions">
                  <button className="cat-edit-btn" onClick={() => setModal({ type: 'editCategory', data: { id: cat.id, category_name: cat.category_name } })}><Edit3 size={12} /></button>
                  <button className="cat-del-btn" onClick={() => handleDeleteCategory(cat.id, cat.category_name)}><Trash2 size={12} /></button>
                </div>
              )}
            </div>
          );
        })}
        {manageMode && (
          <button className="add-cat-btn" onClick={() => setModal({ type: 'addCategory', data: { category_name: '' } })}>
            <Plus size={16} /> Add
          </button>
        )}
      </div>

      <div className="catalog-area">
        <div className="catalog-header">
          <h2 className="section-title">Menu Selection</h2>
          <div className="catalog-filters">
            {['All', 'Vegetarian', 'Spicy'].map((filter) => (
              <button key={filter} className={`filter-btn ${activeFilter === filter ? 'active' : ''}`} onClick={() => setActiveFilter(filter)}>{filter}</button>
            ))}
            <button className={`manage-toggle ${manageMode ? 'active' : ''}`} onClick={() => setManageMode(!manageMode)}>
              <Settings size={16} /> {manageMode ? 'Done' : 'Manage'}
            </button>
          </div>
        </div>

        <div className="menu-grid">
          {visibleItems.map((item) => (
            <div key={item.id} className={`food-card ${!item.is_available ? 'unavailable' : ''}`}>
              <div className="food-image-container">
                <img src={item.image_url || FOOD_PLACEHOLDER} alt={item.item_name} onError={(e) => { e.target.onerror = null; e.target.src = FOOD_PLACEHOLDER; }} />
                <div className="price-badge">₹{Number(item.price).toFixed(2)}</div>
                {!item.is_available && <div className="unavailable-badge">Unavailable</div>}
              </div>
              <div className="food-info">
                <h3>{item.item_name}</h3>
                <p className="food-desc">{item.description || 'Freshly prepared with care.'}</p>
                <div className="food-footer">
                  <div className="prep-time"><Clock size={14} /> <span>20 mins</span></div>
                  {manageMode ? (
                    <div className="manage-item-actions">
                      <button className="item-edit-btn" onClick={() => setModal({ type: 'editItem', data: { id: item.id, item_name: item.item_name, price: item.price, description: item.description, category_id: item.category_id, image_url: item.image_url, is_available: item.is_available } })}><Edit3 size={14} /></button>
                      <button className="item-del-btn" onClick={() => handleDeleteItem(item.id, item.item_name)}><Trash2 size={14} /></button>
                    </div>
                  ) : (
                    item.is_available !== false && <button className="add-btn" onClick={() => addToOrder(item)}><Plus size={18} /></button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {manageMode && (
          <button className="add-item-btn" onClick={() => setModal({ type: 'addItem', data: { item_name: '', price: '', description: '', category_id: activeCategory, image_url: '', is_available: true } })}>
            <Plus size={16} /> Add Item to {categories.find((c) => c.id === activeCategory)?.category_name || 'Category'}
          </button>
        )}
      </div>

      <div className="order-panel">
        <div className="order-header">
          <div>
            <h3>Current Order</h3>
            <p>Order Items: {orderItems.length}</p>
          </div>
          <button className="clear-btn" onClick={clearOrder}>Clear All</button>
        </div>
        <div className="order-items">
          {orderItems.map((item, i) => (
            <div key={i} className="order-item">
              <div className="item-main">
                <div className="item-details">
                  <h4>{item.name}</h4>
                  <p>{item.notes || 'No notes'}</p>
                </div>
                <div className="item-price">₹{(item.price * item.qty).toFixed(2)}</div>
              </div>
              <div className="item-controls">
                <div className="qty-picker">
                  <button onClick={() => updateQty(item.id, -1)}>-</button>
                  <span>{item.qty}</span>
                  <button onClick={() => updateQty(item.id, 1)}>+</button>
                </div>
                <button className="delete-item" onClick={() => updateQty(item.id, -item.qty)}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          {orderItems.length === 0 && <div className="empty-order-msg">Your order is empty.</div>}
        </div>
        <div className="order-summary">
          <div className="summary-row"><span>Subtotal</span> <span>₹{subtotal.toFixed(2)}</span></div>
          <div className="summary-row"><span>Tax (10%)</span> <span>₹{tax.toFixed(2)}</span></div>
          <div className="summary-total"><span>Total</span> <span>₹{total.toFixed(2)}</span></div>
          <button className="create-order-btn" onClick={createOrder} disabled={orderItems.length === 0}
            style={{ opacity: orderItems.length === 0 ? 0.5 : 1, cursor: orderItems.length === 0 ? 'not-allowed' : 'pointer' }}>
            Create Order <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {modal?.type === 'addCategory' && (
        <FormModal title="Add Category" fields={[{ key: 'category_name', label: 'Category Name', placeholder: 'e.g. Desserts', required: true }]} initial={{ category_name: '' }} onSave={handleSaveCategory} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'editCategory' && (
        <FormModal title="Edit Category" fields={[{ key: 'category_name', label: 'Category Name', required: true }]} initial={modal.data} onSave={handleSaveCategory} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'addItem' && (
        <FormModal title="Add Menu Item" fields={[
          { key: 'item_name', label: 'Item Name', placeholder: 'e.g. Butter Chicken', required: true },
          { key: 'price', label: 'Price (₹)', type: 'number', placeholder: 'e.g. 350', required: true, min: 1, step: 0.5 },
          { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Brief description...' },
          { key: 'category_id', label: 'Category', type: 'select', options: categories.map((c) => ({ value: c.id, label: c.category_name })) },
          { key: 'image_url', label: 'Image URL', placeholder: 'https://...' },
          { key: 'is_available', label: 'Availability', type: 'checkbox', checkLabel: 'Available' },
        ]} initial={modal.data} onSave={handleSaveItem} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'editItem' && (
        <FormModal title="Edit Menu Item" fields={[
          { key: 'item_name', label: 'Item Name', required: true },
          { key: 'price', label: 'Price (₹)', type: 'number', required: true, min: 1, step: 0.5 },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'category_id', label: 'Category', type: 'select', options: categories.map((c) => ({ value: c.id, label: c.category_name })) },
          { key: 'image_url', label: 'Image URL' },
          { key: 'is_available', label: 'Availability', type: 'checkbox', checkLabel: 'Available' },
        ]} initial={modal.data} onSave={handleSaveItem} onClose={() => setModal(null)} />
      )}

      <style>{`
        .loading-state { display: flex; align-items: center; justify-content: center; height: 100%; font-weight: 600; color: var(--color-text-muted); }
        .menu-view { display: flex; height: 100%; gap: 2rem; position: relative; }
        .offline-banner { position: absolute; top: 0; left: 0; right: 0; background: #FFF3E0; color: #E65100; padding: 0.4rem 1rem; font-size: 0.75rem; font-weight: 700; display: flex; align-items: center; gap: 0.35rem; z-index: 10; border-radius: 0 0 8px 8px; }
        .category-sidebar { width: 100px; display: flex; flex-direction: column; gap: 1.5rem; padding-top: 1rem; margin-top: ${!isOnline ? '2rem' : '0'}; align-items: center; }
        .category-item { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; transition: var(--transition-smooth); position: relative; }
        .cat-icon-box { width: 56px; height: 56px; background: #FDECEC; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--color-primary); }
        .category-item span { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); text-align: center; }
        .category-item.active .cat-icon-box { background: var(--color-primary); color: white; }
        .category-item.active span { color: var(--color-primary); }
        .cat-manage-actions { display: flex; gap: 0.2rem; margin-top: 0.15rem; }
        .cat-edit-btn, .cat-del-btn { width: 20px; height: 20px; border-radius: 4px; border: 1px solid var(--color-border); background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text-muted); font-size: 0.6rem; }
        .cat-edit-btn:hover { color: var(--color-primary); border-color: var(--color-primary); }
        .cat-del-btn:hover { color: #d32f2f; border-color: #d32f2f; }
        .add-cat-btn { display: flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.6rem; border: 1px dashed var(--color-border); border-radius: 8px; font-size: 0.72rem; font-weight: 700; color: var(--color-text-muted); background: transparent; cursor: pointer; }
        .add-cat-btn:hover { color: var(--color-primary); border-color: var(--color-primary); }
        .catalog-area { flex: 1; display: flex; flex-direction: column; gap: 2rem; overflow-y: auto; padding-right: 1rem; padding-top: ${!isOnline ? '2rem' : '0'}; }
        .catalog-header { display: flex; justify-content: space-between; align-items: center; }
        .section-title { font-size: 1.5rem; font-weight: 700; }
        .catalog-filters { display: flex; gap: 0.5rem; align-items: center; }
        .filter-btn { padding: 0.4rem 1rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); background: #EDE8E3; border: none; cursor: pointer; }
        .filter-btn.active { background: white; color: var(--color-primary); box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
        .manage-toggle { display: flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.75rem; border-radius: 8px; font-size: 0.78rem; font-weight: 700; border: 1px solid var(--color-border); background: white; cursor: pointer; color: var(--color-text-muted); }
        .manage-toggle.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
        .menu-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.5rem; padding-bottom: 2rem; }
        .food-card { background: white; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--color-border); transition: var(--transition-smooth); }
        .food-card.unavailable { opacity: 0.55; }
        .food-card:hover { transform: translateY(-5px); box-shadow: var(--shadow-soft); }
        .food-image-container { height: 160px; position: relative; }
        .food-image-container img { width: 100%; height: 100%; object-fit: cover; }
        .price-badge { position: absolute; top: 12px; right: 12px; background: white; padding: 0.4rem 0.85rem; border-radius: 8px; font-weight: 700; font-size: 0.9rem; color: var(--color-primary); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .unavailable-badge { position: absolute; bottom: 8px; left: 8px; background: #d32f2f; color: white; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.65rem; font-weight: 700; }
        .food-info { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .food-info h3 { font-size: 1.1rem; font-weight: 700; margin: 0; }
        .food-desc { font-size: 0.85rem; color: var(--color-text-muted); line-height: 1.4; height: 2.8rem; overflow: hidden; margin: 0; }
        .food-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; }
        .prep-time { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; }
        .add-btn { width: 36px; height: 36px; background: var(--color-primary); color: white; border-radius: 10px; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; }
        .manage-item-actions { display: flex; gap: 0.3rem; }
        .item-edit-btn, .item-del-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--color-border); background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text-muted); }
        .item-edit-btn:hover { color: var(--color-primary); border-color: var(--color-primary); }
        .item-del-btn:hover { color: #d32f2f; border-color: #d32f2f; }
        .add-item-btn { display: flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.75rem; border: 1px dashed var(--color-border); border-radius: 12px; font-size: 0.85rem; font-weight: 700; color: var(--color-text-muted); background: transparent; cursor: pointer; margin-bottom: 2rem; }
        .add-item-btn:hover { color: var(--color-primary); border-color: var(--color-primary); }
        .order-panel { width: 340px; background: white; border-radius: var(--radius-lg); border: 1px solid var(--color-border); display: flex; flex-direction: column; overflow: hidden; }
        .order-header { padding: 1.5rem; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--color-border); }
        .order-header h3 { font-size: 1.25rem; font-weight: 700; margin: 0; }
        .order-header p { font-size: 0.85rem; color: var(--color-text-muted); margin-top: 0.25rem; }
        .clear-btn { font-size: 0.8rem; font-weight: 700; color: #E53935; background: none; border: none; cursor: pointer; }
        .order-items { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
        .order-item { background: #FFF5EE; padding: 1rem; border-radius: 14px; display: flex; flex-direction: column; gap: 0.75rem; }
        .item-main { display: flex; justify-content: space-between; align-items: flex-start; }
        .item-details h4 { font-size: 0.95rem; font-weight: 700; margin: 0; }
        .item-details p { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }
        .item-price { font-weight: 700; color: var(--color-primary); }
        .item-controls { display: flex; justify-content: space-between; align-items: center; }
        .qty-picker { display: flex; align-items: center; gap: 1rem; background: white; padding: 0.25rem 0.75rem; border-radius: 8px; border: 1px solid var(--color-border); }
        .qty-picker button { font-weight: 700; font-size: 1.1rem; color: var(--color-primary); background: none; border: none; cursor: pointer; }
        .qty-picker span { font-weight: 700; font-size: 0.95rem; min-width: 20px; text-align: center; }
        .delete-item { color: #8A8A8A; opacity: 0.6; background: none; border: none; cursor: pointer; }
        .order-summary { padding: 1.5rem; background: #FDFBF9; border-top: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 1rem; }
        .summary-row { display: flex; justify-content: space-between; font-size: 0.95rem; font-weight: 600; color: var(--color-text-muted); }
        .summary-total { display: flex; justify-content: space-between; font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin-top: 0.5rem; border-top: 1px dashed var(--color-border); padding-top: 1rem; }
        .create-order-btn { width: 100%; background: var(--color-primary); color: white; padding: 1.1rem; border-radius: 14px; font-weight: 700; border: none; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 0.5rem; cursor: pointer; }
        .create-order-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .empty-order-msg { text-align: center; padding: 2rem; color: var(--color-text-muted); font-weight: 600; }
      `}</style>
    </div>
  );
};

export default MenuCatalog;
