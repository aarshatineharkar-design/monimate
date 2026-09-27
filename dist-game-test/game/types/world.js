"use strict";
/**
 * MoniMate 2.0 — WorldState: persistent world facts, deliberately kept free of anything
 * rendering-related. No sprites, no canvas contexts, no React state, no DOM references — those
 * stay in src/lib/render.ts and src/app/game/page.tsx, untouched by this module.
 *
 * `SceneId`/`PlaceId` are re-declared here (not imported from src/lib/types.ts) on purpose: this
 * module must be able to stand alone as the new foundation without creating an import dependency
 * from src/game/ back onto src/lib/'s current types, which are expected to change shape as the
 * real migration happens later. The VALUES match today's lib/types.ts exactly, so nothing here
 * is incompatible with the existing content in lib/world.ts — it's just declared independently.
 */
Object.defineProperty(exports, "__esModule", { value: true });
