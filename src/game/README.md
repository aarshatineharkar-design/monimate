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
- **Every money decision gets a verdict.** `GameStore.applyChoice()` / `resolveLifeEvent()` log the
  choice into `today.decisions` with its verdict from `src/lib/content/verdicts.ts` (`good` /
  `tradeoff` / `bad`, keyed `missionId:choiceId`) and its lesson. The page shows a decision card for
  each (`takeDecisions()`) and the morning recap lists the whole day. When you add a choice that's a
  real money decision, add its verdict there — `polishPass.test.ts` fails on keys that no longer exist.
- **The bus waits.** Standing still at a stop when a bus pulls in holds the clock for
  `BUS_HOLD_REAL_SECONDS` real seconds (`busHoldSecondsLeft()` drives the HUD countdown).
- **Side tasks arrive one at a time.** `poolTaskMayArrive()` (missions.ts) holds a rolled task back
  while another is still waiting on the player, spaces a pool's tasks out (`POOL_SPACING`), leaves a
  breather after the last one, and skips one that no longer has time to be done.
- **Errands have someone there.** A step with `host` (see `ERRAND_HOSTS` in world.ts) only opens when
  you walk up to that person at the place; `withNpc` errands send the friend there (`errandPlaceFor`).
  `effect: 'start_dog_walk' | 'start_can_collect'` starts a hands-on errand (`GameState.errand`) and a
  `needsErrandDone` step waits for it. `startMission()` never rewinds a task you accepted by text.
- **Home has a jobs board** (`content/homeJobs.ts`, `GameStore.homeJobs()/doHomeJob()`) instead of a
  daily "help Mum?" prompt: three different jobs a day, an hourly rate on each, a weekly bonus.
- **Small talk never repeats in a day** (`src/lib/smallTalk.ts`), and reacts to your decisions.
- `types/` holds the domain types; `systems/interfaces.ts` holds contracts for systems not built yet
  (Mission, Event, NPC, Relationship, Progression, Save) — the next ones to move in.

## Tests

```bash
npm test
```

`__tests__/schoolWeek.test.ts` plays whole School Weeks end to end; `oneEngine.test.ts` covers the
money rules, piggy bank, bills and save upgrades.
