'use client';

import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();

  async function signIn() {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
  }

  return (
    <div className="login-wrap">
      <h1>⚽ Panini FIFA World Cup 2026</h1>
      <p>Sticker Tracker</p>
      <button className="google-btn" onClick={signIn}>
        Entrar com Google
      </button>
    </div>
  );
}
