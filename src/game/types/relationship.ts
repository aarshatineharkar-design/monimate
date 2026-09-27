/**
 * MoniMate 2.0 — RelationshipState: a deliberately minimal player -> NPC -> value model.
 *
 * Kept small on purpose (per the Step 2 design review): this is NOT a social-RPG framework.
 * `familiarity` is optional and unpopulated for most NPCs — only main story NPCs need more than
 * a single `standing` number.
 */

export interface RelationshipHistoryEntry {
  /** Game-world minute this change happened. */
  at: number;
  delta: number;
  reason: string;
}

export interface RelationshipState {
  /** -5..+5, same range as today's world.relationships values. */
  standing: number;
  /** Optional second dimension for NPCs where trust genuinely differs from general standing
   *  (e.g. willing to lend money vs. just liking someone). Unpopulated by default. */
  trust?: number;
  /** Optional: how well the player knows this NPC, separate from how much the NPC is liked.
   *  Unpopulated by default — most NPCs never need this. */
  familiarity?: number;
  /** Short, capped history for context (mentor/dialogue flavor later) — not a full audit log. */
  history: RelationshipHistoryEntry[];
}
