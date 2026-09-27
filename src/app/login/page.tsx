import LoginForm from './LoginForm';

export const metadata = { title: 'MoniMate — Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string; error?: string }> }) {
  const { next, mode, error } = await searchParams;
  return (
    <LoginForm
      next={next ?? '/game'}
      initialMode={mode === 'signup' ? 'signup' : 'signin'}
      initialError={error === 'confirm_failed' ? 'That confirmation link has expired. Sign in, or sign up again.' : undefined}
    />
  );
}
