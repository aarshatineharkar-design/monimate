'use client';

/**
 * Pixel-styled sign in / create account screen. Replaces the old localStorage AuthScreen in
 * src/app/game/page.tsx. Uses the Press Start 2P + VT323 fonts already imported in globals.css.
 */
import { useActionState, useState } from 'react';
import { signIn, signUp, resendConfirmation, type AuthFormState } from './actions';

export default function LoginForm({ next, initialMode, initialError }: { next: string; initialMode: 'signin' | 'signup'; initialError?: string }) {
  const [mode, setMode] = useState(initialMode);
  const [signInState, signInAction, signingIn] = useActionState<AuthFormState, FormData>(signIn, {});
  const [signUpState, signUpAction, signingUp] = useActionState<AuthFormState, FormData>(signUp, {});
  const [resendState, resendAction, resending] = useActionState<AuthFormState, FormData>(resendConfirmation, {});
  const isSignup = mode === 'signup';
  const state = isSignup ? signUpState : { ...signInState, error: signInState.error ?? (signInState.info ? undefined : initialError) };
  const pending = signingIn || signingUp || resending;
  const resendTo = resendState.resendTo ?? state.resendTo;

  return (
    <main style={s.screen}>
      <div style={s.sky} aria-hidden />
      <section style={s.card}>
        <div style={s.logo}>MONI<span style={{ color: '#7cfc00' }}>MATE</span></div>
        <p style={s.tag}>Your life. Your money. Your call.</p>

        <div style={s.tabs} role="tablist">
          <button role="tab" aria-selected={!isSignup} style={{ ...s.tab, ...(!isSignup ? s.tabOn : {}) }} onClick={() => setMode('signin')}>CONTINUE</button>
          <button role="tab" aria-selected={isSignup} style={{ ...s.tab, ...(isSignup ? s.tabOn : {}) }} onClick={() => setMode('signup')}>NEW GAME</button>
        </div>

        <form action={isSignup ? signUpAction : signInAction} style={s.form}>
          <input type="hidden" name="next" value={next} />
          {isSignup && (
            <label style={s.label}>PLAYER NAME
              <input name="username" autoComplete="nickname" maxLength={24} required style={s.input} />
            </label>
          )}
          <label style={s.label}>EMAIL
            <input name="email" type="email" autoComplete="email" required style={s.input} />
          </label>
          <label style={s.label}>PASSWORD
            <input name="password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={isSignup ? 8 : undefined} required style={s.input} />
          </label>

          {state.error && <div role="alert" style={s.error}>{state.error}</div>}
          {state.info && <div role="status" style={s.info}>{state.info}</div>}

          <button type="submit" disabled={pending} style={{ ...s.cta, opacity: pending ? 0.6 : 1 }}>
            {pending ? 'LOADING…' : isSignup ? '▶ START YOUR LIFE' : '▶ PRESS START'}
          </button>
        </form>

        {resendTo && (
          <form action={resendAction} style={s.resend}>
            <input type="hidden" name="email" value={resendTo} />
            <span>No email?</span>
            <button type="submit" disabled={pending} style={s.link}>{resending ? 'SENDING…' : 'RESEND LINK'}</button>
            {resendState.error && <div role="alert" style={s.error}>{resendState.error}</div>}
            {resendState.info && <div role="status" style={s.info}>{resendState.info}</div>}
          </form>
        )}
      </section>
    </main>
  );
}

const pixelFont = "'Press Start 2P', monospace";
const bodyFont = "'VT323', monospace";

const s: Record<string, React.CSSProperties> = {
  screen: { position: 'relative', minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, background: '#1a1a2e', overflow: 'hidden' },
  sky: { position: 'absolute', inset: 0, background: 'linear-gradient(#2b2d6e 0%, #6b4a8a 55%, #f0a060 100%)', opacity: 0.55 },
  card: { position: 'relative', width: 'min(380px, 100%)', background: '#14161c', border: '4px solid #f0c038', boxShadow: '8px 8px 0 #000', padding: '28px 22px', color: '#fff' },
  logo: { fontFamily: pixelFont, fontSize: 26, color: '#f0c038', textAlign: 'center', textShadow: '3px 3px 0 #000' },
  tag: { fontFamily: bodyFont, fontSize: 22, textAlign: 'center', margin: '10px 0 20px', color: '#cfd8e3' },
  tabs: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 },
  tab: { fontFamily: pixelFont, fontSize: 10, padding: '10px 4px', background: '#222634', color: '#8892a4', border: '2px solid #000', cursor: 'pointer' },
  tabOn: { background: '#3fb950', color: '#0d1117' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontFamily: pixelFont, fontSize: 9, display: 'flex', flexDirection: 'column', gap: 6, color: '#ffd23f' },
  input: { fontFamily: bodyFont, fontSize: 22, padding: '6px 10px', background: '#0d1117', color: '#fff', border: '2px solid #3a4a7a', outline: 'none' },
  error: { fontFamily: bodyFont, fontSize: 20, color: '#ff8080' },
  info: { fontFamily: bodyFont, fontSize: 20, color: '#7cfc00' },
  resend: { fontFamily: bodyFont, fontSize: 20, color: '#cfd8e3', marginTop: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  link: { fontFamily: pixelFont, fontSize: 9, background: 'none', border: 'none', color: '#f0c038', textDecoration: 'underline', cursor: 'pointer', padding: 0 },
  cta: { fontFamily: pixelFont, fontSize: 12, marginTop: 6, padding: '14px 8px', background: '#f0c038', color: '#1a1a2e', border: '3px solid #000', boxShadow: '4px 4px 0 #000', cursor: 'pointer' },
};
