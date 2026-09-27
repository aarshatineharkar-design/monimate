"use strict";
/**
 * MoniMate 2.0 — save/campaign identity.
 *
 * This is the ONLY place a "version" concept lives for the new state. The existing game
 * (src/lib/types.ts GameState.version) has its own separate versioning and is untouched —
 * `schemaVersion` here versions the NEW GameState shape defined under src/game/, not the
 * old one. When migration actually happens (a later step), the old save's `version` and this
 * `schemaVersion` become two points on the same migration chain, not two competing concepts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
