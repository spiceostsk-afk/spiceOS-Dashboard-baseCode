import React, { useState } from 'react';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Login = ({ onSwitch }) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // On success the auth listener swaps this screen for the app.
    } catch (err) {
      setError(err?.message || 'Sign in failed. Check your credentials.');
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-mark">SPICE OS</span>
          <span className="brand-sub">POINT OF SALE</span>
        </div>
        <h1 className="login-title">Sign in</h1>
        <p className="login-hint">Use your staff account to access the dashboard.</p>

        {error && (
          <div className="login-error" role="alert">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <label className="login-field">
          <span><Mail size={14} /> Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@restaurant.com"
            required
          />
        </label>

        <label className="login-field">
          <span><Lock size={14} /> Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </label>

        <button type="submit" className="login-btn" disabled={submitting}>
          <LogIn size={18} />
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        {onSwitch && (
          <button type="button" className="login-switch" onClick={onSwitch}>
            New here? <strong>Create your restaurant</strong>
          </button>
        )}
      </form>

      <style>{`
        .login-screen {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg);
          padding: 1.5rem;
        }
        .login-card {
          width: 100%;
          max-width: 380px;
          background: white;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-soft);
          padding: 2.25rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .login-brand {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.15rem;
          margin-bottom: 0.5rem;
        }
        .brand-mark {
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: 0.18em;
          color: var(--color-primary);
        }
        .brand-sub {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.3em;
          color: var(--color-accent);
        }
        .login-title {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--color-primary);
          text-align: center;
        }
        .login-hint {
          font-size: 0.82rem;
          color: var(--color-text-muted);
          text-align: center;
          margin-top: -0.5rem;
        }
        .login-error {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(198, 40, 40, 0.06);
          color: #C62828;
          font-size: 0.82rem;
          font-weight: 600;
          padding: 0.65rem 0.8rem;
          border-radius: 10px;
        }
        .login-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .login-field span {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--color-text-muted);
        }
        .login-field input {
          padding: 0.75rem 0.85rem;
          border-radius: 10px;
          border: 1px solid var(--color-border);
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--color-primary);
          background: white;
          outline: none;
        }
        .login-field input:focus {
          border-color: var(--color-accent);
        }
        .login-btn {
          margin-top: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: var(--color-primary);
          color: white;
          padding: 0.9rem;
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.95rem;
          border: none;
          cursor: pointer;
        }
        .login-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .login-switch {
          background: none;
          border: none;
          color: var(--color-text-muted);
          font-size: 0.82rem;
          cursor: pointer;
          margin-top: 0.25rem;
        }
        .login-switch strong { color: var(--color-primary); }
      `}</style>
    </div>
  );
};

export default Login;
