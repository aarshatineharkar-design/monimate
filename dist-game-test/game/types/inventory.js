"use strict";
/**
 * MoniMate 2.0 — InventoryState: minimum item-holding for a life sim, not an RPG inventory.
 * No weight, no equip slots, no stacking rules beyond a plain quantity. Definitions for what an
 * item actually IS (name, price, icon) are content, not state, and live elsewhere (mirroring how
 * the existing ShopItemDef in lib/world.ts is content, not GameState) — this file only shapes
 * what the player is currently holding.
 */
Object.defineProperty(exports, "__esModule", { value: true });
