'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function switchMode(next) {
    setMode(next);
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError('E-mail ou senha inválidos.');
      } else {
        window.location.href = '/';
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Conta criada! Verifique seu e-mail para confirmar o cadastro.');
      }
    }

    setLoading(false);
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="login-wrap">
      <h1>⚽ Panini FIFA World Cup 2026</h1>
      <p className="login-subtitle">Sticker Tracker</p>

      <div className="auth-card">
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`auth-tab${mode === 'signup' ? ' active' : ''}`}
            onClick={() => switchMode('signup')}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            className="auth-input"
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="auth-input"
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="auth-error">{error}</p>}
          {success && <p className="auth-success">{success}</p>}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <div className="auth-divider"><span>ou</span></div>

        <button type="button" className="google-btn" onClick={signInWithGoogle}>
          Entrar com Google
        </button>
      </div>
    </div>
  );
}
