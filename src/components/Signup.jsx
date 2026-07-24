import React, { useState } from 'react';
import { Store, Mail, Lock, AlertCircle, ArrowRight, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

const ERROR_MESSAGES = {
  slug_taken: 'That web address is already taken — try another.',
  user_create_failed: 'That email is already registered. Try signing in.',
  password_too_short: 'Password must be at least 8 characters.',
};

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const Signup = ({ onSwitch }) => {
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const slug = slugify(name);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/provision-restaurant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({
          restaurant_name: name.trim(),
          slug,
          owner_email: email.trim(),
          owner_password: password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(ERROR_MESSAGES[data.error] || data.detail || 'Could not create your restaurant.');
        setSubmitting(false);
        return;
      }
      // Provisioned — sign in; the auth hook stamps the new restaurant_id claim.
      await signIn(email.trim(), password);
      // On success the auth listener swaps to the dashboard.
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="signup-screen">
      <form className="signup-card" onSubmit={handleSubmit}>
        <div className="signup-brand">
          <span className="brand-mark">SPICE OS</span>
          <span className="brand-sub">POINT OF SALE</span>
        </div>
        <h1 className="signup-title">Create your restaurant</h1>
        <p className="signup-hint">Set up your POS in under a minute.</p>

        {error && (
          <div className="signup-error" role="alert">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <label className="signup-field">
          <span><Store size={14} /> Restaurant name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Biryani House" required />
          {slug && <small className="slug-preview">Address: <strong>{slug}</strong></small>}
        </label>

        <label className="signup-field">
          <span><Mail size={14} /> Owner email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@restaurant.com" required />
        </label>

        <label className="signup-field">
          <span><Lock size={14} /> Password</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required />
        </label>

        <button type="submit" className="signup-btn" disabled={submitting}>
          {submitting ? <><Loader size={16} className="spin" /> Creating…</> : <>Create restaurant <ArrowRight size={18} /></>}
        </button>

        <button type="button" className="signup-switch" onClick={onSwitch}>
          Already have an account? <strong>Sign in</strong>
        </button>
      </form>

      <style>{`
        .signup-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-bg); padding: 1.5rem; }
        .signup-card { width: 100%; max-width: 400px; background: white; border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-soft); padding: 2.25rem 2rem; display: flex; flex-direction: column; gap: 1rem; }
        .signup-brand { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; margin-bottom: 0.25rem; }
        .brand-mark { font-size: 1.35rem; font-weight: 800; letter-spacing: 0.14em; color: var(--color-primary); }
        .brand-sub { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.3em; color: var(--color-accent); }
        .signup-title { font-size: 1.4rem; font-weight: 700; color: var(--color-primary); text-align: center; }
        .signup-hint { font-size: 0.82rem; color: var(--color-text-muted); text-align: center; margin-top: -0.5rem; }
        .signup-error { display: flex; align-items: center; gap: 0.4rem; background: rgba(214, 40, 40, 0.06); color: var(--color-primary); font-size: 0.82rem; font-weight: 600; padding: 0.65rem 0.8rem; border-radius: 10px; }
        .signup-field { display: flex; flex-direction: column; gap: 0.35rem; }
        .signup-field span { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 700; color: var(--color-text-muted); }
        .signup-field input { padding: 0.75rem 0.85rem; border-radius: 10px; border: 1px solid var(--color-border); font-size: 0.9rem; font-weight: 600; color: var(--color-primary); background: white; outline: none; }
        .signup-field input:focus { border-color: var(--color-accent); }
        .slug-preview { font-size: 0.72rem; color: var(--color-text-muted); }
        .slug-preview strong { color: var(--color-accent); }
        .signup-btn { margin-top: 0.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: var(--color-primary); color: white; padding: 0.9rem; border-radius: 12px; font-weight: 700; font-size: 0.95rem; border: none; cursor: pointer; }
        .signup-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .signup-switch { background: none; border: none; color: var(--color-text-muted); font-size: 0.82rem; cursor: pointer; margin-top: 0.25rem; }
        .signup-switch strong { color: var(--color-primary); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default Signup;
