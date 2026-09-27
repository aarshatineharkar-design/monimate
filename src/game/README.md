# src/game — the MoniMate engine

There is **one engine**. The live game (`src/lib/store.ts` → `GameStore`) runs on these systems
directly; there is no adapter and no throwaway copy of state.

| System | Owns | Used by the live game for |
| --- | --- | --- |
| `systems/financeSystem.ts` | `GameState.finance` (accounts, income, recurring bills, debt, ledger) | every spend, earning, bus fare, purchase, mission reward, piggy-bank transfer |
| `systems/energySystem.ts` | `GameState.energy` | choice/activity energy costs, sleep recovery |
| `systems/activitySystem.ts` | nothing (rules) | timed activities: Attend Class, Help Mum (`GameStore.runActivity`) |
| `systems/clockSystem.ts`, `playerSystem.ts` | a standalone `TimeState` / `PlayerState` | tests and `content/school/mondayFlow.ts`; the live clock is `GameStore.advance()`, which satisfies `ActivityClock` |

Rules:

- **Every money change is a `Transaction`** with account, category, type, description (the reason),
  source and timestamp. Money never goes negative: `GameStore.spend()` returns `false` instead.
- **Saves are versioned.** `GameState.version` is 3; `src/lib/saveMigration.ts` upgrades older saves.
  Bump the version and add a migration whenever the saved shape changes.
- `types/` holds the domain types; `systems/interfaces.ts` holds contracts for systems not built yet
  (Mission, Event, NPC, Relationship, Progression, Save) — the next ones to move in.

## Tests

```bash
npm test
```

`__tests__/schoolWeek.test.ts` plays whole School Weeks end to end; `oneEngine.test.ts` covers the
money rules, piggy bank, bills and save upgrades.
