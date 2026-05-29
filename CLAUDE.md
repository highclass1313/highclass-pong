# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

HighClass Pong is a crypto beer pong PWA targeting the **Cronos blockchain** (Chain ID: 25, native token CRO). There is no build system — the project is a collection of static files meant to be deployed directly to a web host or dropped into a React project.

## Running locally

There is no `package.json`. To serve the app you need any static HTTP server (the service worker requires HTTP, not `file://`):

```bash
python3 -m http.server 8080
# or
npx serve .
```

## Source file conventions

The two main source files use `.txt` extensions intentionally (they are design/integration artifacts, not compiled directly from this repo):

| File | Purpose |
|---|---|
| `HighClassPong.jsx.txt` | Complete React component — drop into a React project as `HighClassPong.jsx` |
| `HighClassPong-sol.txt` | Solidity smart contract — deploy to Cronos via Hardhat/Foundry/Remix |

`index.html` is a plain-text splash/loading screen, not the rendered React app. The actual game UI is rendered by the JSX component.

## React app architecture (`HighClassPong.jsx.txt`)

Single-file React component with no external dependencies beyond React itself (`useState`, `useRef`). Screen routing is handled by a single `screen` state string in `App`.

```
App          — root; owns profile state {xp, tokens, unlocked, tournWins}
├─ Menu      — main menu, achievement display
├─ Game      — all gameplay; receives mode/xp/tokens/unlocked/tournWins/context/onEnd
│   ├─ Cup   — renders one cup (standing, rimming, island, hit states)
│   └─ XpBar — rank progress bar
└─ Tournament — bracket manager; spawns Game instances for each match
```

**State/ref duplication pattern**: Every piece of state used inside `requestAnimationFrame` or `setTimeout` callbacks has a matching `useRef` (e.g., `topCups`/`topRef`, `xp`/`xpRef`). State drives rendering; refs prevent stale closures in animation loops. When modifying game logic, always update both.

**Ball animation**: `animChain(segments, onDone)` chains arc segments using `requestAnimationFrame`. Each segment has `{s, e, h, dur, flash?}` where `h` is the arc height. The easing is in-out quadratic applied per-segment.

**Shot type detection** (in `executeShot`):
- Regular: flick toward opponent half
- Bounce: flick toward own half (crosses center line once, sinks 2 cups)
- Double bounce: bounce + `spd > 0.16` (crosses twice, sinks up to 3 cups)

**Rim mechanic**: On any hit there is a `RIM_PROB = 1/8` chance (except double bounce). `startRim` begins a 2.2-second countdown with orbital ball animation. Human defender double-taps the glowing cup to finger it out; CPU defender has a 30% chance to auto-finger between 500–1200 ms.

**Island detection**: A cup is an island if no other standing cup has its center within 30% coordinate distance. Recalculated after every sink via `detectIsland`.

**CPU accuracy** scales with the player's current rank index (0–6): `[0.45, 0.50, 0.56, 0.62, 0.68, 0.74, 0.80]`.

**Audio**: `sfx(type)` creates a fresh `AudioContext` per call and synthesises all sounds procedurally via oscillators and noise buffers. No audio files.

## Smart contract architecture (`HighClassPong-sol.txt`)

Solidity `^0.8.20`, deployed on **Cronos** (Chain ID 25). Owner-controlled oracle pattern — the owner wallet calls `resolveMatch` / `resolveTournament` after game outcomes are determined off-chain.

Economic constants (all in CRO/ether units):
- Match: 5 CRO buy-in → 8 CRO winner + 2 CRO house
- Tournament: 10 CRO × 8 players = 80 CRO pot → 60 CRO winner + 20 CRO house
- NFT badge: awarded on-chain after 3 tournament wins (`NFT_WIN_THRESHOLD = 3`)

The V1 contract is centralized by design (owner resolves results). The inline comment on `resolveMatch` notes that V2 will replace this with verifiable on-chain results.

## Token economics (front-end vs on-chain)

The in-game 🪙 tokens shown in the UI are **local state only** — they are not the CRO tokens managed by the smart contract. The wallet connect / CRO betting flow (shown as `🔗 CONNECT WALLET · BET CRO · EARN REWARDS` in the menu) is not yet implemented. When wiring up the contract, the `context` prop passed to `Game` (`"match"` | `"tournament"` | `null`) and the `onEnd` callback are the integration points.

## XP / rank system

Seven ranks in `RANKS` constant (Rookie → HighClass). `getRank(xp)` returns the rank index. XP is awarded per sink (5 XP base), with bonuses for bounce (+15), double bounce (+25), streak ≥ 3 (+10), island call (+20), win (+60), Circle of Death win (+80). Losing a match costs 25% of current XP.

## Circle of Death (CoD)

`COD = [0, 3, 9, 5]` — cup indices for the four corners + center of the top rack. A player wins instantly by sinking all four in sequence without hitting a non-CoD cup first. `codBrokRef` tracks whether a player has broken their CoD attempt (by hitting a non-CoD cup).
