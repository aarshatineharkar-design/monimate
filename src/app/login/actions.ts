'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export interface AuthFormState {
  error?: string;
  info?: string;
  /** Set when the account exists but its email isn't confirmed yet: the form offers "Resend". */
  resendTo?: string;
}

/** Only allow redirects back into our own app (never an attacker-supplied full URL). */
function safeNext(raw: FormDataEntryValue | null): string {
  const next = typeof raw === 'string' ? raw : '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/game';
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      return { error: 'Confirm your email first — check your inbox and spam folder.', resendTo: email };
    }
    return { error: 'Wrong email or password.' };
  }
  redirect(safeNext(formData.get('next')));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = String(formData.get('username') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (username.length < 2 || username.length > 24) return { error: 'Pick a player name between 2 and 24 characters.' };
  if (!email) return { error: 'Enter an email address.' };
  if (password.length < 8) return { error: 'Use at least 8 characters for your password.' };

  const origin = (await headers()).get('origin') ?? '';
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },                              // read by the handle_new_user() trigger
      emailRedirectTo: `${origin}/auth/confirm?next=/game`,
    },
  });
  if (error) {
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return { error: 'Too many sign-ups right now — wait a few minutes and try again.' };
    }
    return { error: error.message };
  }

  // Supabase hides whether an email is taken: an existing confirmed account comes back with no identities.
  if (data.user && data.user.identities?.length === 0) {
    return { error: 'That email already has an account — switch to CONTINUE and sign in.' };
  }

  // If "Confirm email" is OFF in Supabase, signUp returns a live session: go straight in.
  if (data.session) redirect('/game');
  return { info: `Nearly there — we sent a confirmation link to ${email}. Check spam too.`, resendTo: email };
}

export async function resendConfirmation(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return { error: 'Enter your email address first.' };
  const origin = (await headers()).get('origin') ?? '';
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/game` },
  });
  if (error) {
    return {
      error: error.status === 429 || /rate limit|seconds/i.test(error.message)
        ? 'Email limit reached — wait a minute (or longer) before asking again.'
        : error.message,
      resendTo: email,
    };
  }
  return { info: `Sent again to ${email}. It can take a minute — check spam too.`, resendTo: email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
