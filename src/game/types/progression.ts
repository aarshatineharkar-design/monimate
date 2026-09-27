/**
 * MoniMate 2.0 — ProgressionState: XP/level/achievements/unlocks/milestones.
 * Deliberately kept OUT of FinancialState — a "saved $100" achievement is CHECKED by reading
 * finance, but the unlock record itself belongs to progression, not to the account tree.
 */

export interface ProgressionState {
  xp: number;
  /** Derived from xp by a pure function in the real implementation (never stored independently,
   *  to avoid the two disagreeing) — kept as a field here only because GameState needs a concrete
   *  value to serialize/display; the FUTURE ProgressionSystem is responsible for keeping it in
   *  sync with xp rather than letting callers set it directly. */
  level: number;
  /** Unlocked achievement ids. */
  achievements: string[];
  /** Feature/content unlock ids tied to level or milestones — not populated yet. */
  unlocks: string[];
  milestones: {
    financial: string[];
    life: string[];
  };
}
