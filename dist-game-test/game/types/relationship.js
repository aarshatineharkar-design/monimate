"use strict";
/**
 * MoniMate 2.0 — RelationshipState: a deliberately minimal player -> NPC -> value model.
 *
 * Kept small on purpose (per the Step 2 design review): this is NOT a social-RPG framework.
 * `familiarity` is optional and unpopulated for most NPCs — only main story NPCs need more than
 * a single `standing` number.
 */
Object.defineProperty(exports, "__esModule", { value: true });
