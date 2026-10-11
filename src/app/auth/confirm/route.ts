/**
 * Email-confirmation landing route.
 *
 * Works with both Supabase email templates:
 *  - the default "Confirm signup" template ({{ .ConfirmationURL }}), which sends the player back here
 *    with a one-time `code`, and
 *  - a custom template pointing at  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 *
 * Either way the email is confirmed, and the player is sent to the sign-in page ("Email confirmed —
 * sign in to start"), so every new player goes: sign up → confirm email → sign in → choose a life.
 */
import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const supabase = await createClient();

  let confirmed = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    confirmed = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    confirmed = !error;
  }
  if (!confirmed) return NextResponse.redirect(`${origin}/login?error=confirm_failed`);

  // Confirmed. Sign out of the session the link created, so the player signs in themselves.
  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/login?confirmed=1`);
}
