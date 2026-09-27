/**
 * MoniMate 2.0 — InventoryState: minimum item-holding for a life sim, not an RPG inventory.
 * No weight, no equip slots, no stacking rules beyond a plain quantity. Definitions for what an
 * item actually IS (name, price, icon) are content, not state, and live elsewhere (mirroring how
 * the existing ShopItemDef in lib/world.ts is content, not GameState) — this file only shapes
 * what the player is currently holding.
 */

export type InventoryItemCategory =
  | 'grocery' | 'school_supply' | 'clothing' | 'transport' | 'personal' | 'quest';

export interface InventoryItem {
  /** Instance id (unique per stack), distinct from `itemDefId` (which item this is). */
  id: string;
  itemDefId: string;
  category: InventoryItemCategory;
  quantity: number;
  acquiredAt: number;
  /** Optional: where/how this was acquired, for future flavor text or analytics — not required. */
  acquiredFrom?: { type: 'purchase' | 'mission_reward' | 'gift' | 'found'; refId?: string };
}

export interface InventoryState {
  items: InventoryItem[];
}
