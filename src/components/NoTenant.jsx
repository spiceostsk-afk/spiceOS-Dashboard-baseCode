import React from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Shown when a user is authenticated but their JWT carries no restaurant_id.
 * Means the access-token hook is disabled, or the user has no restaurant_members
 * row. Without a tenant claim, RLS returns nothing, so the app can't function.
 */
const NoTenant = () => {
  const { signOut, user } = useAuth();
  return (
    <div className="no-tenant">
      <div className="no-tenant-card">
        <AlertTriangle size={40} color="#C62828" />
        <h1>No restaurant linked</h1>
        <p>
          You're signed in as <strong>{user?.email}</strong>, but this account
          isn't linked to a restaurant yet.
        </p>
        <p className="no-tenant-fix">
          An admin needs to add a <code>restaurant_members</code> row for you, and
          the access-token hook must be enabled in Supabase.
        </p>
        <button className="no-tenant-btn" onClick={signOut}>
          <LogOut size={16} /> Sign out
        </button>
      </div>

      <style>{`
        .no-tenant {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg);
          padding: 1.5rem;
        }
        .no-tenant-card {
          max-width: 420px;
          background: white;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-soft);
          padding: 2.25rem 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.85rem;
        }
        .no-tenant-card h1 {
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--color-primary);
        }
        .no-tenant-card p {
          font-size: 0.88rem;
          color: var(--color-text);
          line-height: 1.5;
        }
        .no-tenant-fix {
          font-size: 0.8rem;
          color: var(--color-text-muted);
        }
        .no-tenant-card code {
          background: var(--color-accent-soft);
          padding: 0.1rem 0.35rem;
          border-radius: 6px;
          font-size: 0.78rem;
        }
        .no-tenant-btn {
          margin-top: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: var(--color-primary);
          color: white;
          padding: 0.7rem 1.2rem;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.85rem;
          border: none;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default NoTenant;
