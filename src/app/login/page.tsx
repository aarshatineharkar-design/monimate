import LoginForm from './LoginForm';

export const metadata = { title: 'MoniMate — Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string; error?: string; confirmed?: string; reason?: string }> }) {
  const { next, mode, error, confirmed, reason } = await searchParams;
  return (
    <LoginForm
      next={next ?? '/game'}
      initialMode={mode === 'signup' ? 'signup' : 'signin'}
      initialError={error === 'confirm_failed' ? 'That confirmation link has expired or was already used. Sign in, or sign up again.' : undefined}
      initialInfo={confirmed ? '✅ Email confirmed! Sign in to start playing.' : reason === 'start' ? 'Welcome back — sign in to play.' : undefined}
    />
  );
}
