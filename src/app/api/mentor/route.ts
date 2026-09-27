/**
 * MoniMate — AI Mentor API route (protected version).
 *
 * Server-side only: holds the Anthropic API key (never sent to the browser) and proxies two kinds
 * of requests from the game client (see src/lib/mentor.ts):
 *   - mode: 'chat'    -> the player typed a question to Kai
 *   - mode: 'weekly'  -> a short coaching write-up of how the player's week went
 *
 * Protection (in order):
 *   1. Same-site only: requests must come from the MoniMate site itself (Origin header check).
 *   2. Size limits: message and context are capped before anything reaches the model.
 *   3. Rate limit: per IP address, per minute and per day.
 *   4. Login check: add after switching to Supabase Auth (see README-AUTH.md, section 5).
 *
 * If ANTHROPIC_API_KEY isn't set, a friendly canned reply is returned so the game never breaks.
 */

export const runtime = 'nodejs';

// ── Limits (tune these) ──────────────────────────────────────────────────────
const MAX_MESSAGE_CHARS = 500;
const MAX_CONTEXT_CHARS = 2000;
const PER_MINUTE = 6;
const PER_DAY = 60;

interface MentorContext {
  lifePath?: string;
  day?: string;
  balance?: number;
  activeMissions?: string[];
  startBalance?: number;
  endBalance?: number;
  daysAttended?: number;
  daysTotal?: number;
  schoolProjectDone?: boolean;
  birthdayOutcome?: string;
  unexpectedOutcome?: string;
  wentToArcade?: boolean;
}

interface MentorRequestBody {
  mode: 'chat' | 'weekly';
  message?: string;
  context?: MentorContext;
}

const MENTOR_PERSONA = `You are Kai, a warm, encouraging financial-literacy mentor character inside MoniMate, a
pixel-art life-sim game that teaches teenagers money skills. You speak directly to the player in second person,
in 2-4 short sentences, plain everyday language (no jargon, no bullet points, no markdown). You give concrete,
practical money advice tied to what's actually happening in their game (their balance, their choices, their
week) rather than generic platitudes. You're supportive, never preachy or condescending, and you never lecture
about topics outside personal finance and the game itself. If the player asks about something unrelated to
money or the game, gently steer back to their week.`;

function fallbackReply(mode: 'chat' | 'weekly', ctx?: MentorContext): string {
  if (mode === 'weekly') {
    const delta = (ctx?.endBalance ?? 0) - (ctx?.startBalance ?? 0);
    return delta >= 0
      ? `You ended the week with $${(ctx?.endBalance ?? 0).toFixed(2)}, up from $${(ctx?.startBalance ?? 0).toFixed(2)} — nice job keeping more than you spent. Keep an eye on which choices actually moved that number.`
      : `You ended the week with $${(ctx?.endBalance ?? 0).toFixed(2)}, down from $${(ctx?.startBalance ?? 0).toFixed(2)}. That's normal some weeks — look back at your biggest single expense and ask if you'd make the same call again.`;
  }
  return `I'm here to help you think through money decisions — what's on your mind? (Tip: keep a small buffer for surprises, they always show up.)`;
}

// ── 1. Same-site check ───────────────────────────────────────────────────────
/** True when the request was sent by a page on this same site. Browsers always send `Origin` on a
 *  cross-site POST, so a missing or foreign Origin means it did not come from the game. */
function isSameSite(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    const o = new URL(origin);
    if (host && o.host === host) return true;
    // Extra allowed origins, comma-separated, e.g. a custom domain: ALLOWED_ORIGINS=https://monimate.nz
    const extra = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
    return extra.includes(o.origin);
  } catch {
    return false;
  }
}

// ── 3. Rate limit ────────────────────────────────────────────────────────────
// In-memory, so each server instance counts separately. That's enough to stop a script from
// draining credit in minutes; the hard ceiling is the monthly spend limit in the Anthropic Console.
const hits = new Map<string, number[]>();
const DAY_MS = 24 * 60 * 60 * 1000;

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

/** Returns seconds to wait if over the limit, or 0 if the request may go ahead (and records it). */
function rateLimit(ip: string): number {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < DAY_MS);
  const lastMinute = recent.filter(t => now - t < 60_000);
  if (lastMinute.length >= PER_MINUTE) return Math.ceil((60_000 - (now - lastMinute[0])) / 1000);
  if (recent.length >= PER_DAY) return Math.ceil((DAY_MS - (now - recent[0])) / 1000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // never let the map grow without bound
  return 0;
}

export async function POST(req: Request) {
  if (!isSameSite(req)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const wait = rateLimit(clientIp(req));
  if (wait > 0) {
    return Response.json(
      { reply: "Let's slow down a sec — I need a breather. Try me again in a minute.", source: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(wait) } },
    );
  }

  let body: MentorRequestBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const { mode, context } = body;
  if (mode !== 'chat' && mode !== 'weekly') {
    return Response.json({ error: 'invalid_mode' }, { status: 400 });
  }

  // ── 2. Size limits ─────────────────────────────────────────────────────────
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_CHARS) : '';
  if (mode === 'chat' && !message) {
    return Response.json({ error: 'empty_message' }, { status: 400 });
  }
  const contextJson = JSON.stringify(context ?? {});
  if (contextJson.length > MAX_CONTEXT_CHARS) {
    return Response.json({ error: 'context_too_large' }, { status: 413 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[mentor] ANTHROPIC_API_KEY is not set — serving fallback reply.');
    return Response.json({ reply: fallbackReply(mode, context), source: 'fallback' });
  }

  const userPrompt = mode === 'chat'
    ? `Game context: ${contextJson}\n\nThe player asks: "${message}"`
    : `The player just finished a week. Here's what happened: ${contextJson}\n\nGive them a short, specific recap and one piece of advice for next week.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: MENTOR_PERSONA,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      // Log the status only — the error body can echo request details.
      console.error(`[mentor] Anthropic API returned ${res.status}`);
      return Response.json({ reply: fallbackReply(mode, context), source: 'fallback' });
    }
    const data = await res.json();
    const reply: string = data?.content?.[0]?.text?.trim() || fallbackReply(mode, context);
    return Response.json({ reply, source: 'ai' });
  } catch (err) {
    console.error('[mentor] fetch to Anthropic API threw:', err);
    return Response.json({ reply: fallbackReply(mode, context), source: 'fallback' });
  }
}