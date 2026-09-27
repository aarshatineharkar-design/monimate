/**
 * Browser-side Supabase client. Use in 'use client' components (the game page, the phone UI).
 * Session lives in cookies (managed by @supabase/ssr), so the server and proxy see the same login.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
