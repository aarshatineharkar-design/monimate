/**
 * MoniMate — auth + local save helpers (moved out of page.tsx verbatim; logic unchanged).
 */
import type { GameState } from './types';

export interface PlayerProfile {
  name: string;
  email: string;
  passwordHash: string;
  lifePath: 'school' | 'university' | 'international' | 'working';
  avatar: string;
  level: number;
  xp: number;
  achievements: string[];
  createdAt: number;
}

export function hashPassword(pw: string): string {
  return btoa(pw + 'monimate_salt_2024');
}
export function verifyPassword(pw: string, hash: string): boolean {
  return hashPassword(pw) === hash;
}
export function loadAccounts(): Record<string, PlayerProfile> {
  try { return JSON.parse(localStorage.getItem('monimate_accounts') || '{}'); } catch { return {}; }
}
export function saveAccounts(accounts: Record<string, PlayerProfile>): void {
  localStorage.setItem('monimate_accounts', JSON.stringify(accounts));
}
export function loadSession(): string | null {
  try { return localStorage.getItem('monimate_session'); } catch { return null; }
}
export function saveSession(email: string): void {
  localStorage.setItem('monimate_session', email);
}
export function clearSession(): void {
  localStorage.removeItem('monimate_session');
}

/**
 * Game save stores the whole GameStore state blob (version 2), keyed by email AND life path —
 * each path is really its own separate game (different starting money, missions, goals), so
 * switching paths must never silently overwrite the save you left behind on another one.
 */
const saveKey = (email: string, lifePath: PlayerProfile['lifePath']) => `monimate_save_${email}_${lifePath}`;

export function loadGameSave(email: string, lifePath: PlayerProfile['lifePath']): GameState | null {
  try { return JSON.parse(localStorage.getItem(saveKey(email, lifePath)) || 'null'); } catch { return null; }
}
export function saveGame(email: string, lifePath: PlayerProfile['lifePath'], state: GameState): void {
  try { localStorage.setItem(saveKey(email, lifePath), JSON.stringify(state)); } catch { /* ignore */ }
}
