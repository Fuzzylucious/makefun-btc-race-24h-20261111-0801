// Dip-bounce bot for the BTC race: long-only mean reversion on 1-minute cbBTC bars.
//
// Strategy (tuned on the published dev window, 1,440 one-minute bars of CBBTC/USDC):
//   - Buy the dip: when the latest close is within 0.1% of the lowest close of the
//     last 60 bars and the bar bounced (close above the previous bar's close), buy
//     with all available cash. A 60-minute low that stops falling is where the dev
//     window's intraday bounces started; buying into a still-falling low loses.
//   - Sell: take profit at +1% over the entry close, stop out at -1% under it, or
//     exit after 240 bars held, whichever comes first. A full-size round trip pays
//     about 26 bps in fees, slippage and price impact, so a 1% target clears the
//     costs with room; the 240-bar cap keeps capital from sitting in a dead dip.
//   - One position at most, full size, at most one order per batch.
//
// The dev window is choppy and slightly down (BTC -0.99% over the window), so
// buy-and-hold and the kit's trend baselines all lose on it; this bot made
// about +$6.72 on the dev window in a local backtest of the same fill model
// (4 bps fee, 2 bps slippage, constant-product impact against the bar's open
// depth, fills at the next bar's open), positive on both halves of the window.
//
// Determinism: float64 closes only, no clock, no environment, no randomness, so
// two runs on the same bars produce the same orders.

import { BPS, runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK_BARS = 60;
/** Buy when the close is within this of the 60-bar low (10 bps). */
const DIP_BPS = 10;
/** Take profit / stop loss vs the entry close (100 bps each way). */
const TARGET_BPS = 100;
const STOP_BPS = 100;
/** Exit a position held this many CBBTC bars, whatever the price. */
const MAX_HOLD_BARS = 240;
const MAX_SLIPPAGE_BPS = 100;

/** The closes of the last LOOKBACK_BARS bars, oldest first. */
const closes: number[] = [];
/** The close of the previous CBBTC bar, for the bounce check. */
let prevClose: number | null = null;
/** How many CBBTC bars have been seen. */
let barsSeen = 0;
/** The close the current position was entered on, and the bar count then. */
let entryClose: number | null = null;
let entryBarsSeen = 0;

await runBars({
  onBatch(state: BarsState, batch) {
    const orders: (BuyInput | SellInput)[] = [];
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      const close = Number(bar.c);
      barsSeen += 1;
      closes.push(close);
      if (closes.length > LOOKBACK_BARS) closes.shift();

      const held = state.positions.get(SYMBOL);
      // A sell decided on the previous bar has filled when the position is
      // gone; only then forget the entry (a rejected sell keeps it, so the
      // exit is retried instead of buying into a position still held).
      if (held === undefined && entryClose !== null) entryClose = null;
      if (held !== undefined && entryClose !== null) {
        const up = close * 10000 >= entryClose * (10000 + TARGET_BPS);
        const down = close * 10000 <= entryClose * (10000 - STOP_BPS);
        const stale = barsSeen - entryBarsSeen >= MAX_HOLD_BARS;
        if (up || down || stale) {
          orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        }
      } else if (held === undefined && closes.length >= LOOKBACK_BARS && prevClose !== null) {
        let low = closes[0];
        for (const c of closes) if (c < low) low = c;
        const nearLow = close * 10000 <= low * (10000 + DIP_BPS);
        const bounced = close > prevClose;
        if (nearLow && bounced) {
          const room = state.weightRoom(SYMBOL);
          const notional = state.cash < room ? state.cash : room;
          if (notional >= BigInt(state.hello.fees.min_notional_quote_units)) {
            orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS });
            entryClose = close;
            entryBarsSeen = barsSeen;
          }
        }
      }
      prevClose = close;
    }
    return orders;
  },
});
