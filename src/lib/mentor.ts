/**
 * MoniMate — client-side helper for talking to the AI Mentor API route (src/app/api/mentor/route.ts).
 * The Anthropic API key never touches the browser — this just calls our own server route.
 */

export interface MentorChatContext {
  lifePath?: string;
  day?: string;
  balance?: number;
  activeMissions?: string[];
}

export interface MentorWeeklyContext {
  startBalance: number;
  endBalance: number;
  daysAttended: number;
  daysTotal: number;
  schoolProjectDone: boolean;
  birthdayOutcome: string;
  unexpectedOutcome: string;
  wentToArcade: boolean;
}

async function callMentor(mode: 'chat' | 'weekly', message: string | undefined, context: unknown): Promise<string> {
  try {
    const res = await fetch('/api/mentor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, message, context }),
    });
    const data = await res.json();
    return data.reply ?? "Sorry, I couldn't think of anything just then — try asking again.";
  } catch {
    return "I can't reach the mentor service right now, but keep tracking where your money's going — that's the biggest lever you have.";
  }
}

export function askMentorChat(message: string, context: MentorChatContext): Promise<string> {
  return callMentor('chat', message, context);
}

export function askMentorWeeklyRecap(context: MentorWeeklyContext): Promise<string> {
  return callMentor('weekly', undefined, context);
}
