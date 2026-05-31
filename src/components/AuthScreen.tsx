import React, { useState } from 'react';
import { BookOpen, Loader2, Mail, Lock, UserPlus, LogIn } from 'lucide-react';
import { supabase } from '../services/supabase';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        // If session is returned immediately, email confirmations are disabled
        if (data.session) {
          onAuthenticated();
        } else {
          setRegistered(true);
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        onAuthenticated();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(
        msg.includes('Invalid login credentials')
          ? 'Incorrect email or password.'
          : msg.includes('already registered') || msg.includes('already been registered')
          ? 'An account with this email already exists.'
          : msg.includes('Password should be at least')
          ? 'Password must be at least 6 characters.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle} className="glass animate-fade">
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Mail size={24} style={{ color: '#10b981' }} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '10px' }}>Check your inbox</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              We sent a confirmation link to <strong style={{ color: '#fff' }}>{email}</strong>.<br />
              Click it to activate your account, then come back to sign in.
            </p>
            <button
              onClick={() => { setMode('login'); setRegistered(false); }}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle} className="glass animate-fade">
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
          <BookOpen size={26} style={{ color: 'var(--accent-primary)' }} />
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Studit
          </h1>
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '28px' }}>
          {mode === 'login' ? 'Welcome back — sign in to your account' : 'Create your account to get started'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Email */}
          <div>
            <label style={labelStyle}>Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{ paddingLeft: '38px', width: '100%' }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="password"
                placeholder={mode === 'register' ? 'At least 6 characters' : ''}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                style={{ paddingLeft: '38px', width: '100%' }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '0.82rem', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '4px', fontSize: '0.9rem', gap: '8px' }}
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
            ) : mode === 'login' ? (
              <><LogIn size={16} /> Sign In</>
            ) : (
              <><UserPlus size={16} /> Create Account</>
            )}
          </button>
        </form>

        {/* Toggle */}
        <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '20px' }}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', padding: 0 }}
          >
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 60%), var(--bg-primary)',
  zIndex: 9999,
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '400px',
  padding: '36px 32px',
  borderRadius: '20px',
  border: '1px solid var(--border-active)',
  boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
  margin: '0 16px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '6px',
};