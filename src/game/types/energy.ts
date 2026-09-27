/**
 * MoniMate 2.0 — EnergyState: the third resource, alongside time and money, that activities
 * compete for. Mechanics (what costs energy, how activities are gated by it) are NOT implemented
 * here — this is state shape only, deliberately small (no hunger/hygiene/mood submeters).
 */

export interface EnergyState {
  current: number;
  max: number;
  /** How much energy restores per in-game hour of sleep. A single config number is enough for
   *  now; if recovery ever needs to vary (illness, an upgrade, a campaign difficulty), this
   *  becomes a richer config object without changing `current`/`max`. */
  recoveryPerHourAsleep: number;
}
