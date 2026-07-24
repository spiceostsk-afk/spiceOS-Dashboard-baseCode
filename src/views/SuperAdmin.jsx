import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, Ban, PlayCircle, Store, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLES = {
  trial: { bg: '#E3F2FD', color: '#1565C0' },
  active: { bg: '#E8F5E9', color: '#2E7D32' },
  suspended: { bg: '#FFEBEE', color: '#C62828' },
  cancelled: { bg: '#F5F5F5', color: '#757575' },
};

export default function SuperAdmin() {
  const { isPlatformAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Platform admins bypass RLS, so this returns every restaurant.
      const { data, error: err } = await supabase
        .from('restaurants')
        .select('id, name, slug, status, plan, created_at')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setRows(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isPlatformAdmin) fetchAll(); }, [isPlatformAdmin, fetchAll]);

  const setStatus = async (id, status) => {
    setBusyId(id);
    try {
      const { error: err } = await supabase.from('restaurants').update({ status }).eq('id', id);
      if (err) throw err;
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      alert('Update failed: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!isPlatformAdmin) {
    return (
      <div className="sa-guard">
        <ShieldCheck size={40} />
        <h2>Platform admins only</h2>
        <p>Your account doesn't have platform-admin access.</p>
        <style>{`
          .sa-guard { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; color: var(--color-text-muted); }
          .sa-guard h2 { color: var(--color-primary); }
        `}</style>
      </div>
    );
  }

  const filtered = rows.filter((r) =>
    !query || r.name.toLowerCase().includes(query.toLowerCase()) || r.slug.includes(query.toLowerCase()));

  const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

  return (
    <div className="sa-view">
      <div className="sa-head">
        <div>
          <h2><ShieldCheck size={22} /> Platform Admin</h2>
          <p>{rows.length} restaurants · {counts.active || 0} active · {counts.trial || 0} trial · {counts.suspended || 0} suspended</p>
        </div>
        <button className="sa-btn" onClick={fetchAll}><RefreshCw size={16} /> Refresh</button>
      </div>

      <div className="sa-search">
        <Search size={16} />
        <input placeholder="Search by name or slug…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {loading ? (
        <div className="sa-empty">Loading tenants…</div>
      ) : error ? (
        <div className="sa-empty">Failed to load: {error}</div>
      ) : filtered.length === 0 ? (
        <div className="sa-empty">No restaurants found.</div>
      ) : (
        <div className="sa-table">
          <div className="sa-row sa-row--head">
            <span>Restaurant</span><span>Slug</span><span>Plan</span><span>Status</span><span>Joined</span><span>Actions</span>
          </div>
          {filtered.map((r) => {
            const st = STATUS_STYLES[r.status] || STATUS_STYLES.cancelled;
            const suspended = r.status === 'suspended' || r.status === 'cancelled';
            return (
              <div className="sa-row" key={r.id}>
                <span className="sa-name"><Store size={15} /> {r.name}</span>
                <span className="sa-mono">{r.slug}</span>
                <span>{r.plan}</span>
                <span><em className="sa-badge" style={{ background: st.bg, color: st.color }}>{r.status}</em></span>
                <span className="sa-date">{new Date(r.created_at).toLocaleDateString()}</span>
                <span>
                  {suspended ? (
                    <button className="sa-action activate" disabled={busyId === r.id} onClick={() => setStatus(r.id, 'active')}>
                      <PlayCircle size={14} /> Activate
                    </button>
                  ) : (
                    <button className="sa-action suspend" disabled={busyId === r.id} onClick={() => { if (confirm(`Suspend ${r.name}? Their staff and diners will be blocked.`)) setStatus(r.id, 'suspended'); }}>
                      <Ban size={14} /> Suspend
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .sa-view { padding: 1.5rem 2rem; }
        .sa-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .sa-head h2 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin: 0; }
        .sa-head p { color: var(--color-text-muted); font-weight: 600; font-size: 0.82rem; margin: 0.25rem 0 0; }
        .sa-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.5rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.8rem; font-weight: 700; color: var(--color-primary); background: white; cursor: pointer; }
        .sa-search { display: flex; align-items: center; gap: 0.5rem; background: white; border: 1px solid var(--color-border); border-radius: 10px; padding: 0.6rem 0.9rem; margin-bottom: 1rem; max-width: 360px; color: var(--color-text-muted); }
        .sa-search input { border: none; outline: none; width: 100%; font-size: 0.88rem; color: var(--color-primary); font-weight: 600; }
        .sa-table { background: white; border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; }
        .sa-row { display: grid; grid-template-columns: 2fr 1.4fr 0.8fr 1fr 1fr 1.2fr; align-items: center; padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--color-border); font-size: 0.85rem; }
        .sa-row:last-child { border-bottom: none; }
        .sa-row--head { background: var(--color-sidebar); font-weight: 700; color: var(--color-text-muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .sa-name { display: flex; align-items: center; gap: 0.4rem; font-weight: 700; color: var(--color-primary); }
        .sa-mono { font-family: monospace; color: var(--color-text-muted); }
        .sa-date { color: var(--color-text-muted); }
        .sa-badge { font-style: normal; font-weight: 700; font-size: 0.7rem; padding: 0.2rem 0.55rem; border-radius: 20px; text-transform: capitalize; }
        .sa-action { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.7rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700; border: 1px solid var(--color-border); background: white; cursor: pointer; }
        .sa-action.suspend { color: #C62828; border-color: #F0C0C0; }
        .sa-action.activate { color: #2E7D32; border-color: #BEE0C2; }
        .sa-action:disabled { opacity: 0.5; cursor: not-allowed; }
        .sa-empty { padding: 3rem; text-align: center; color: var(--color-text-muted); font-weight: 600; }
      `}</style>
    </div>
  );
}
