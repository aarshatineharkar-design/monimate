"use strict";
/**
 * MoniMate 2.0 — first-class Transaction model.
 *
 * IMPORTANT design rule this file exists to enforce: a Transaction represents a financial EVENT,
 * not a balance mutation. Applying one is idempotent bookkeeping (append to history + adjust the
 * relevant account), never "add/subtract a number and forget it happened" — that is exactly what
 * the current game's ledger (capped at 400 entries, wiped every Monday) does today, and why the
 * Step 1 audit flagged it as something to eventually replace.
 */
Object.defineProperty(exports, "__esModule", { value: true });
