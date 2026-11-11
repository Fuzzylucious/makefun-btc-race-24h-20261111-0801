# Dip-Bounce BTC Bot — make.fun "Race a BTC trading bot live for 24 hours"

A long-only mean-reversion bot that trades Coinbase Wrapped BTC (cbBTC) against
USDC on 1-minute on-chain bars, for the make.fun competition
`btc-race-24h-20261111-0801`. It starts with $1,000 of paper money; nothing is
traded for real.

## Strategy

- **Buy the dip:** when the latest close is within 0.1% of the lowest close of
  the last 60 bars **and** the bar bounced (close above the previous bar's
  close), buy with all available cash. A 60-minute low that stops falling is
  where the dev window's intraday bounces started; buying into a still-falling
  low loses.
- **Sell:** take profit at +1% over the entry close, stop out at −1% under it,
  or exit after 240 bars held, whichever comes first. A full-size round trip
  pays about 26 bps in fees, slippage and price impact, so a 1% target clears
  the costs with room; the 240-bar cap keeps capital from sitting in a dead dip.
- At most one open position, full size, at most one order per batch.

## Why this, and not trend-following

The published dev window is choppy and slightly down (BTC −0.99% over the
24 hours). Buy-and-hold loses −$13.44 on it, and the kit's trend baselines
lose more (EMA-cross −$89.29, ADX-momentum −$59.40, RSI-Bollinger −$29.65).
This bot made **+$6.33 on the dev window** in a local grade
(`node cli/makefun.mjs grade-local --kit . --bot . --driver process`):
13 trades, max drawdown 1.48%, L1 reproduced. It was positive on both halves
of the window, and the neighbouring parameter sets (60–90 bar lookback,
0.8–1.0% targets) are positive too, so the edge is a pocket, not a single
tuned point.

## Files

- `main.ts` — the bot (Node 22, TypeScript, erasable syntax only). Speaks
  `agent-fun/bars-replay/v1`: newline-delimited JSON on stdin/stdout, one
  reply per batch. Standard library only, plus the vendored SDK shim.
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's
  `sdk/makefun-bars.ts` shim.
- `.makefun/owner.json` — claim file naming the linked Solana wallet.

## Run it locally

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --driver process
```

Deterministic: float64 closes only, no clock, no environment, no randomness,
so two runs on the same bars produce the same orders.
