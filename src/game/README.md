# src/game — MoniMate 2.0 foundation (parallel, not yet active)

This folder is the new simulation type foundation designed in Step 2 and implemented in Step 2A.
**Nothing here is imported by the live game yet.** `src/app/game/page.tsx` continues to use
`src/lib/store.ts`'s `GameStore` exactly as before.

## Layout

- `types/` — the new `GameState` and its domain types (meta, time, player, activity, finance,
  transaction, energy, inventory, world, relationship, npc, mission, event, progression, goal),
  plus a typed (not implemented) domain-event union and a barrel `index.ts`.
- `systems/` — **Step 3: five of these are now real, implemented classes**, not just interfaces:
  `clockSystem.ts`, `playerSystem.ts`, `energySystem.ts`, `financeSystem.ts`, `activitySystem.ts`
  (barrel: `systems/index.ts`). `interfaces.ts` holds type-only contracts for the systems NOT yet
  built (EconomySystem/WorldSystem/NPCSystem/MissionSystem/EventSystem/RelationshipSystem/
  ProgressionSystem/SaveSystem).
- `content/schoolActivities.ts` — Step 3's four worked-example activities (walk/bus/lunch/chore) as
  real `ActivityDef` data, not hardcoded inside a system.
- `state/createInitialGameState.ts` — a pure function returning a valid `GameState` with School
  Life defaults (Monday 7:00 AM, $20 cash, 100/100 energy, at home), for testing the new shape in
  isolation. Not called from the live app.
- `__tests__/` — `node:test` unit tests for the five Step 3 systems. Run with
  `npx tsc -p tsconfig.game-test.json && node --test dist-game-test/game/__tests__/*.test.js`
  (see the root `tsconfig.game-test.json`, added solely so these tests can run without adding a
  test-framework dependency — it compiles `src/game/` to plain CommonJS in a throwaway `dist-game-
  test/` folder; it does not affect `next build` or `tsc -p tsconfig.json`).

## Relationship to `src/lib/`

Two exceptions where this module intentionally references existing `src/lib/` types instead of
redeclaring them, to avoid drift on things the mission/NPC engines already own:
- `types/mission.ts` imports `MissionRuntime` from `src/lib/types.ts`.
- `types/npc.ts`'s `NpcScheduleSlot` mirrors (but does not import) `src/lib/world.ts`'s `NpcSlot`
  shape, since `src/game/` is meant to stand alone as a foundation that doesn't depend on
  `src/lib/`'s current shapes, which are expected to change during the real migration.

Everything else here is independently declared, even where it overlaps with an existing
`src/lib/` type (e.g. `SceneId`, `PlaceId`), by design — see the comment at the top of
`types/world.ts`.

## What comes next (not part of this step)

See the Step 2 design doc's STEP 3/4/5 checklist: converting between old and new shapes, then
standing up `GameEngine` + real system implementations one at a time (starting with
`ClockSystem`/`FinanceSystem`), migrating `GameStore` incrementally rather than rewriting it.
