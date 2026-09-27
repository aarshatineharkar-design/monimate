"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * MoniMate 2.0 — barrel export for the new type foundation.
 * Import from '@/game/types' (or a relative path to src/game/types) rather than reaching into
 * individual files, so internal file layout can change without breaking future call sites.
 */
__exportStar(require("./meta"), exports);
__exportStar(require("./time"), exports);
__exportStar(require("./player"), exports);
__exportStar(require("./activity"), exports);
__exportStar(require("./transaction"), exports);
__exportStar(require("./finance"), exports);
__exportStar(require("./energy"), exports);
__exportStar(require("./inventory"), exports);
__exportStar(require("./world"), exports);
__exportStar(require("./relationship"), exports);
__exportStar(require("./npc"), exports);
__exportStar(require("./mission"), exports);
__exportStar(require("./event"), exports);
__exportStar(require("./progression"), exports);
__exportStar(require("./goal"), exports);
__exportStar(require("./domainEvents"), exports);
__exportStar(require("./gameState"), exports);
