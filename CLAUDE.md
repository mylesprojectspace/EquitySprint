# Equity Sprint Online — CLAUDE.md

> **Living document.** Update whenever architecture changes, new events/cards are added, rules change, or new phases are introduced.

---

## What the project is

Australian property investment board game — online multiplayer version.
Each player joins on their own device. 2–4 players per room.
Node.js + Socket.io backend. Browser-based client.

**Predecessor:** `Equity Sprint/` (hot-seat, single HTML file) — financial rules and PROPERTIES data are the same. Architecture, event system, and UI are different.

---

## Architecture

| Layer | Tech | Role |
|-------|------|------|
| Server | Node.js + Socket.io 4 | Authoritative game state, room management, event routing |
| Client | Vanilla JS + HTML/CSS | Socket.io client, per-player screen rendering |
| Data | `client/data.js` + `server/data-server.js` | Same card data in two module formats (browser global / CommonJS) |

**Run:** `npm start` from project root → server at `http://localhost:3000`

---

## File Structure

| File | Role |
|------|------|
| `server/server.js` | Socket.io event router, room registry, state broadcast |
| `server/game-engine.js` | All game logic — no DOM code. Exports action functions. |
| `server/data-server.js` | CommonJS copy of all card data (PROPERTIES, wheel decks) |
| `client/index.html` | Per-player game screen — lobby + game UI |
| `client/style.css` | Dark navy/gold theme. Fixed-viewport CSS Grid layout (no scrolling). |
| `client/client.js` | Socket.io client. Handles rendering and emitting player actions. |
| `client/data.js` | Browser-global copy of card data |
| `assets/REQUIRED_ASSETS.txt` | Spec for property photos. See file for details. |

**Important:** `client/data.js` and `server/data-server.js` must stay in sync. When adding/changing card data, update both files.

---

## Financial Rules

Identical to the hot-seat version. Do not change without explicit instruction.

| Concept | Formula |
|---------|---------|
| Net savings (salary) | `salary × 0.40` per year |
| Annual repayments | `sum(property.debt × player.interestRate)` |
| Rental income | `sum(currentRent)` for non-vacant properties |
| Net passive income | `rentalIncome − annualRepayments` |
| Net worth | `player.cash + sum(prop.currentValue − prop.debt)` — win metric |
| Serviceability | `(salary + rentalIncome) × 0.70 − annualRepayments` |
| Projected serviceability | Same but includes new loan at `interestRate + stressBuffer` |
| Deposit | `price × activeRestrictions.depositRate` (default 20%) |
| Property growth | Applied at year-end in `processYearEnd()` |

---

## Win Conditions

- **Net worth ≥ $1,000,000** — checked after every action via `checkWin()`
- **After 10 years** — `endGame()` sorts players by net worth, highest wins

---

## Wheel System (replaces EVENT_CARDS + BANK_POLICIES)

**One spin per year** at the start of each year, before any actions. The player who goes first (`G.firstThisYear`) spins.

| Category | Weight | Effect | Cards in deck |
|----------|--------|--------|---------------|
| Economic Event | 35% | Applied immediately, affects all players | `WHEEL_ECONOMIC_EVENTS` (17 cards, 3 rare urgent-sale) |
| Market Change | 30% | Applied immediately, may last multiple years | `WHEEL_MARKET_CHANGES` (8 cards) |
| Market Influence | 25% | Dealt privately to spinning player's hand | `WHEEL_INFLUENCE_CARDS` (8 cards) |
| Chance | 10% | Personal benefit applied immediately | `WHEEL_CHANCE_CARDS` (6 cards) |

**Phase flow:** `processYearEnd()` → `G.phase = 'wheelSpin'` → player spins → `acknowledgeWheelResult()` → `continueToYearStart()` → `G.phase = 'yearstart'`

---

## Market Influence Cards (PvP — Private Hand)

- Player holds up to **3** influence cards at a time (`INFLUENCE_HAND_MAX = 3`)
- Each card is private to the player who holds it (sent via `private-state` socket event)
- Can be played **anytime** during the game (not turn-restricted)
- Playing a card removes it from hand

**Target types:**
- `'opponent'` — target a specific opponent player
- `'opponent-property'` — target a specific opponent's property (requires `targetOwnedId`)
- `'market'` — affects the shared market
- `'self'` — affects only the playing player

**Current influence cards:** Vacancy Strike, Rent Sabotage, Rate Spike, Media Campaign, Council Objection, Spec Bubble, Insider Deal, Tenant Poach

---

## G State Object (server-side, in game-engine.js)

```js
G = {
  year, currentPlayerIdx, yearSlot, firstThisYear,
  phase,              // 'wheelSpin' | 'yearstart' | 'handoff' | 'action' | 'auction' | 'gameover'
  players[],
  market: { metro[], regional[] },
  wheelDeck: { economicEvents[], marketChanges[], influence[], chance[] },
  activeMarketChange,        // replaces activeBankPolicy
  marketChangeYearsLeft,
  activeRestrictions,        // { depositRate, incomeMultiplier, stressBuffer, regionalFreeze, investorCap, investorCapThreshold, metroPriceInflation }
  log[],
  pendingWheelResult,        // { category, card, spinnerIdx } — drawn, awaiting ack
  pendingAuction,
  winner,
  _ownedIdSeq,
  // Private (NOT in public state broadcast):
  influenceHands[],          // Array[N] — each player's held influence cards
  dealAlertListings[],       // Array[N] — private deal listings per player
  // Wheel state:
  wheelSpun,                 // bool
  wheelResult,               // last spin result
}
```

---

## Phase System

`G.phase` routes rendering on the client. Add phases here when added.

| Phase | Who sees it | Content |
|-------|-------------|---------|
| `'wheelSpin'` | All players | Animated wheel overlay. Spinner = G.firstThisYear. |
| `'yearstart'` | All players | Year-start summary card for all players |
| `'handoff'` | All players | "Player X is now active" screen — confirms whose turn it is |
| `'action'` | Active player | Main game board — player dashboard, marketplace, owned properties |
| `'auction'` | All players | Urgent sale bidding overlay |
| `'gameover'` | All players | Final scores |

---

## Socket.io Event Contracts

### Server receives:

| Event | Payload | Description |
|-------|---------|-------------|
| `create-room` | `{ playerName, maxPlayers }` | Host creates a new room |
| `join-room` | `{ roomId, playerName }` | Player joins existing room |
| `start-game` | — | Host starts the game (all slots filled) |
| `request-state` | — | Reconnecting player requests current state |
| `spin-wheel` | — | First-this-year player spins the wheel |
| `acknowledge-wheel` | — | Spinning player dismisses wheel overlay |
| `play-influence` | `{ handId, targetPlayerIdx?, targetOwnedId? }` | Play an influence card |
| `player-action` | `{ action, ...params }` | Game action (see below) |
| `dismiss-year-start` | — | Current player dismisses year-start card |
| `dismiss-handoff` | — | Current player dismisses handoff screen |
| `bid-auction` | `{ bidAmount }` | Place auction bid |
| `pass-auction` | — | Pass on auction |

### player-action payloads:

| action | Extra params |
|--------|-------------|
| `'buy'` | `{ lid }` |
| `'reduceDebt'` | `{ oid, amount }` |
| `'renovate'` | `{ oid }` |
| `'sell'` | `{ oid }` |
| `'releaseEquity'` | `{ oid, amount }` |
| `'develop'` | `{ oid }` |
| `'setManager'` | `{ oid, tier }` (does NOT consume action slot) |
| `'endSlot'` | — |

### Server emits:

| Event | Payload | Description |
|-------|---------|-------------|
| `room-created` | `{ roomId, playerIdx, maxPlayers }` | Confirmed to host |
| `room-joined` | `{ roomId, playerIdx }` | Confirmed to joining player |
| `lobby-update` | `{ players[], maxPlayers }` | Sent to all on join/leave |
| `game-state` | public G (no influence hands) | Full state broadcast after any change |
| `private-state` | `{ influenceHand[], dealAlertListing }` | Per-player private data |
| `wheel-result` | `{ category, card, spinnerIdx }` | Sent to all when wheel lands |
| `action-result` | `{ icon, title, lines[] }` | Pop-up notification broadcast |
| `reno-complete` | `[{ prop, rentBoost, valueBoost, actualMult }]` | Renovation reveal |
| `error` | `{ message }` | Sent to specific socket |

---

## UI Layout (per-player screen, no scrolling)

```
+--------------------+----------------------------------+
|  OWN DASHBOARD     |  MARKETPLACE (top-right, fixed)  |
|  Cash / NW / NPI   |  9 property cards — for-sale     |
|  Portfolio mini    |  board style with star ratings   |
+--------------------+  Stays until bought or changed   |
|  OTHER PLAYERS     |                                  |
|  (mini cards,      |                                  |
|   click to expand) +----------------------------------+
+--------------------+  ACTIVE AREA (centre-right)      |
                     |  Owned properties + action icons |
                     |  Current action visual feedback  |
+--------------------+----------------------------------+
|  INFLUENCE HAND (private, bottom strip)               |
|  [Card 1] [Card 2] [Card 3]  Play button on each      |
+------------------------------------------------------+
```

CSS Grid: `100vh` fixed, no `overflow-y`. Columns: `280px 1fr`. No scrolling anywhere on screen.

---

## Property Card Design (Marketplace)

```
+------------------+
|  [PLACEHOLDER    |  ← 160px, gradient by propType or real photo
|   IMAGE AREA]    |
|  [RARITY BADGE]  |
+------------------+
| City Name        |
| propType label   |
| [RISK badge]     |
+------------------+
| Yield   ★★★★☆  |  ← relative to current market pool (1–5 stars)
| Growth  ★★★☆☆  |
| Vacancy ★★★★★  |  ← inverted (low vacancy = more stars)
+------------------+
| [DEVELOP READY]  |  ← badge if applicable (regional only)
| $485,000         |
+------------------+
| [BUY] [DETAILS]  |
+------------------+
```

Star ratings are computed relative to the current market pool (not absolute values).

---

## Action Feedback Icons (on owned property cards)

| Action | Visual |
|--------|--------|
| Renovating | 🔨 + amber pulsing border |
| Just sold | SOLD banner overlay, card fades out |
| Equity released | 🤝 brief flash overlay |
| Developed | ✅ banner → gold glow border |
| Influence targeted | ⚠️ brief warning overlay |

---

## Turn Flow

```
processYearEnd()
  → G.phase = 'wheelSpin'
  → firstThisYear player spins → wheel resolves
  → acknowledgeWheelResult() → continueToYearStart()
      → processAllPlayerCashFlow() (ALL players simultaneously)
      → G.phase = 'yearstart'

dismissYearStart()
  → G.phase = 'handoff'

dismissHandoff()
  → G.phase = 'action'
  → checkPendingRenovations()

endActionSlot()
  → if more slots: G.phase = 'handoff', next player
  → if all slots done: processYearEnd()
```

---

## Action Rules

- Each slot = 1 action. Each player gets 2 slots per year.
- **Consume a slot:** Buy, Renovate, Develop, Reduce Debt, Release Equity, Sell
- **Free (no slot):** Set Property Manager, Play Influence Card
- Auction is triggered by Urgent Sale wheel event — outside normal slot system

---

## Working Rules

- Do not refactor working code unless asked
- Do not add features beyond what is explicitly requested in a session
- Do not introduce new libraries without discussion
- Update this file when architecture or rules change
- Both `client/data.js` and `server/data-server.js` must stay in sync
