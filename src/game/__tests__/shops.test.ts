/**
 * MoniMate — every product on every shop shelf can be seen and reached: its tag doesn't overlap
 * another tag, and there is a spot on the floor where the player can stand and have THAT item be
 * the one in reach.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERIORS, interiorBlocked } from '../../lib/world';

const REACH = 1.1; // must match GameStore.nearbyShopItem()

for (const interior of Object.values(INTERIORS)) {
  if (!interior.shopItems?.length) continue;

  test(`${interior.name}: every product is reachable from open floor`, () => {
    for (const item of interior.shopItems!) {
      let ok = false;
      for (let x = item.tx - REACH; x <= item.tx + REACH && !ok; x += 0.05) {
        for (let y = item.ty - REACH; y <= item.ty + REACH && !ok; y += 0.05) {
          if (interiorBlocked(interior, x, y)) continue;
          const nearest = interior.shopItems!
            .map(i => ({ i, d: Math.hypot(i.tx - x, i.ty - y) }))
            .filter(e => e.d < REACH)
            .sort((a, b) => a.d - b.d)[0];
          if (nearest?.i.id === item.id) ok = true;
        }
      }
      assert.ok(ok, `${item.id} at (${item.tx}, ${item.ty}) can't be reached in ${interior.id}`);
    }
  });

  test(`${interior.name}: price tags don't overlap and all have an icon`, () => {
    const W = 0.94, H = 0.5; // tag size in tiles, as drawn by drawPriceTag()
    const items = interior.shopItems!;
    for (const it of items) assert.ok(it.icon, `${it.id} has no icon`);
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const A = items[a], B = items[b];
        const overlap = Math.abs(A.tx - B.tx) < W && Math.abs(A.ty - B.ty) < H;
        assert.equal(overlap, false, `${A.id} and ${B.id} tags overlap`);
      }
    }
  });
}
