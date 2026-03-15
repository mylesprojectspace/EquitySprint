# Equity Sprint — Full Game Specification
## Reconstruction Reference for Claude Code

> This document captures the complete, current implementation of Equity Sprint — every formula, constant, mechanic, schema, and design decision. Use this alongside CLAUDE.md to recreate or extend the game. Update this document whenever a mechanic changes.

---

## Delivery Format

- Single HTML page: open `index.html` directly in Chrome — no server, no build step
- Files: `index.html`, `style.css`, `data.js`, `game.js`
- `data.js` loads before `game.js` (script order matters — `data.js` exposes `PROPERTIES`, `EVENT_CARDS`, `BANK_POLICIES` as globals)
- Zero dependencies — pure vanilla JS, no frameworks or libraries

---

## All Game Constants (`game.js` top of file)

```js
const WIN_TARGET           = 1_000_000;    // net worth win condition
const MAX_YEARS            = 10;           // game ends after year 10
const BASE_INTEREST_RATE   = 0.065;        // 6.5% starting rate
const BASE_INCOME_MULT     = 0.70;         // serviceability income multiplier
const BASE_DEPOSIT_RATE    = 0.20;         // 20% deposit required
const BASE_STRESS_BUFFER   = 0.02;         // +2% stress buffer on loan rate
const LIVING_EXPENSE_RATE  = 0.60;         // 60% of salary to living costs → saves 40%
const RENO_COST_MULT       = 0.08;         // renovation = 8% of current value
const RENO_VARIANCE        = { low: 0.15, medium: 0.30, high: 0.50 };  // outcome variance by risk
const DEVELOP_COST_MULT    = 0.15;         // development = 15% of current value
const DEVELOP_SUCCESS      = 0.60;         // 60% chance of development succeeding
const DEBT_REDUCE_MIN      = 10_000;       // minimum debt reduction payment
const STARTING_CASH        = 60_000;       // each player starts with $60k
const STARTING_SALARY      = 80_000;       // $80k/yr gross salary
const MARKET_VARIATION     = 0.10;         // ±10% price/rent variation per year
const METRO_MARKET_SIZE    = 4;            // base metro listings per year
const REGIONAL_MARKET_SIZE = 5;            // base regional listings per year
const BID_MIN_INCREMENT    = 5_000;        // minimum auction bid increment
const CHEAP_PRICE_THRESHOLD = 400_000;     // properties below get extra downside
const CHEAP_GROWTH_PENALTY  = 0.06;        // up to -6% extra floor shift for cheap props
const CHEAP_VACANCY_BONUS   = 0.10;        // up to +10% extra vacancy chance for cheap props
const SALARY_GROWTH_RATE    = 0.03;        // 3% annual compounding wage growth
const RISK_GROWTH_MULT      = { low: 0.6, medium: 1.0, high: 1.5 };  // growth variance amplifiers
```

---

## Player Object

Created by `createPlayer(name, id)`:

```js
{
  id,                        // 0-based index
  name,
  salary: 80_000,            // grows 3%/yr via SALARY_GROWTH_RATE
  cash: 60_000,
  properties: [],            // array of owned property objects
  totalDebt: 0,              // derived by recalcPlayer()
  interestRate: 0.065,       // can be changed by events/policies
  rentalIncome: 0,           // derived — sum of non-vacant currentRent
  annualRepayments: 0,       // derived — sum of debt * interestRate
  serviceability: 0,         // derived — (salary + rent) * mult - repayments
  netPassiveIncome: 0,       // derived — rentalIncome - annualRepayments
  netWorth: 0,               // derived — cash + sum(currentValue - debt)
  blocked: false,            // true when serviceability < 0
  rentHalvedNextRound: false, // set by mediaFrenzy event
  renoDiscountNextRound: false, // set by renoDiscount event (50% off renovation)
  _yearRecap: null,          // H1 cash flow data for year-start card
  _midYearRecap: null,       // H2 cash flow data for mid-year card
  isBot: false,              // true = AI controls this player
}
```

---

## G State Object (global game state)

```js
G = {
  year: 1,                   // 1–10
  yearSlot: 0,               // 0 to totalSlots()-1
  firstThisYear: N,          // player index who acts first this year (randomised at start, rotates)
  currentPlayerIdx: N,       // which player is currently acting
  phase: 'yearstart',        // see Phase System below
  players: [],               // array of player objects
  market: { metro: [], regional: [] },  // current year's market listings
  eventDeck: [],             // shuffled draw pile (21 cards: 18 standard + 3 rare)
  bankPolicyDeck: [],        // shuffled bank policy pile
  activeBankPolicy: null,    // current active policy or null
  bankPolicyYearsLeft: 0,    // years remaining on active policy
  activeRestrictions: { ... }, // see freshRestrictions()
  activeEvent: null,         // current year's event card (shown in conditions bar)
  log: [],                   // game log, max 40 entries, newest first
  pendingEvent: null,        // event awaiting resolution
  pendingPolicy: null,       // bank policy awaiting resolution
  pendingAuction: null,      // auction state object or null
  winner: null,              // winning player object or null
  simpleMode: true,          // true = simplified card view (🎓 toggle)
  _ownedIdSeq: 0,            // counter for unique owned property IDs
  marketSort: 'default',     // market sort order
}
```

### `freshRestrictions()` — baseline active restrictions:
```js
{
  depositRate: 0.20,
  incomeMultiplier: 0.70,
  stressBuffer: 0.02,
  regionalFreeze: false,
  investorCap: false,
  investorCapThreshold: 3,
  metroPriceInflation: 0,    // reset to 0 each year in processYearEnd()
}
```

---

## Financial Formulas

| Concept | Formula |
|---------|---------|
| Net savings (H1 or H2) | `salary × 0.40 / 2` per half-year |
| Annual repayments | `sum(prop.debt × player.interestRate)` |
| Rental income | `sum(currentRent)` for non-vacant properties only |
| Renovation rent (H1) | `currentRent × 0.5` — half rent during renovation year |
| Development rent | `0` — no rent while developing |
| Net passive income | `rentalIncome − annualRepayments` |
| Net worth (win metric) | `player.cash + sum(prop.currentValue − prop.debt)` |
| Serviceability | `(salary + rentalIncome) × incomeMultiplier − annualRepayments` |
| Projected serviceability | Same formula + new loan repayment at `interestRate + stressBuffer` |
| Deposit | `price × activeRestrictions.depositRate` |
| Loan | `price − deposit` |
| Affordability ceiling | `serviceability / stressRate / (1 − depositRate)` |
| Agent fee (sell) | `currentValue × 0.025` (2.5%) |
| Sell equity | `currentValue − debt − agentFee` |

### Annual salary growth:
```js
p.salary = Math.round(p.salary * (1 + SALARY_GROWTH_RATE));  // 3% compounding each year
```

### Annual property growth (applied in processYearEnd):
```js
const mid        = (prop.growthMin + prop.growthMax) / 2;
const halfRange  = (prop.growthMax - prop.growthMin) / 2;
const mult       = RISK_GROWTH_MULT[prop.risk];
const cheapFactor  = Math.max(0, (CHEAP_PRICE_THRESHOLD - prop.currentValue) / CHEAP_PRICE_THRESHOLD);
const floorPenalty = CHEAP_GROWTH_PENALTY * cheapFactor;
const adjMin    = mid - halfRange * mult - floorPenalty;
const adjMax    = mid + halfRange * mult;
const rawGrowth = adjMin + Math.random() * (adjMax - adjMin);
const actualGrowth = Math.max(rawGrowth, -0.15);  // hard floor at -15%
prop.currentValue += Math.round(prop.currentValue * actualGrowth);
```

---

## Property Data Schema

### Base property (in `PROPERTIES` array):
```js
{
  id,           // unique integer
  market,       // 'metro' | 'regional'
  city,         // display name (e.g. "Sydney Terrace")
  flavour,      // short tagline on card (e.g. "Olympic city starter pack")
  propType,     // 'unit' | 'house' | 'apartment' | 'warehouse' | 'cottage' |
                //  'duplex' | 'terrace' | 'heritage-house' | 'beach-house' |
                //  'estate' | 'penthouse' | 'manor'
  price,        // base purchase price (grows each year via compound growth)
  yieldMin,     // min rental yield (fraction) — rent = price × random in range
  yieldMax,     // max rental yield
  growthMin,    // min annual capital growth (fraction)
  growthMax,    // max annual capital growth
  renoUpside,   // base renovation multiplier (e.g. 0.30 = 30% rent/value boost at actualMult=1.0)
  risk,         // 'low' | 'medium' | 'high'
  vacancy,      // base vacancy chance (fraction)
  rarity,       // 'standard' | 'premium' | 'rare' | 'legendary'
  renovated,    // false (default — only true on owned properties after renovation)
  developed,    // false (default — only true on owned properties after successful development)
}
```

### Market listing (returned by `makeMarketListing(base, yearFactor)`):
```js
{
  ...base,
  price,        // compound-grown: base.price * (1 + midGrowth)^(year-1) * ±10%
  rent,         // price × random yield within yieldMin-yieldMax range
  _lid,         // unique listing ID per year: `${id}_y${year}_${rand}`
  renovated: false,
  developed: false,
  vacantThisRound: false,
}
```

### Owned property (added to `player.properties` when bought via `executeBuy()`):
```js
{
  ...all market fields,
  purchasePrice,     // price at time of purchase
  currentValue,      // grows each year; starts = purchasePrice
  currentRent,       // grows/changes with events; starts = listing rent
  debt,              // loanAmount at purchase; reduced by actionReduceDebt
  vacantThisRound,   // true if vacant this year
  depositPaid,       // cash paid at purchase
  extraSpent,        // cumulative reno + dev costs (0 if none)
  _ownedId,          // unique ID assigned at purchase via G._ownedIdSeq++
  managerTier,       // 0=None, 1=Basic, 2=Standard, 3=Premium
  _renovating,       // true while renovation in progress
  _renoYear,         // year renovation started
  _renoCompleteYear, // year renovation will complete (default: _renoYear + 1; delay event increments this)
  _developing,       // true while development in progress
  _devYear,          // year development started
  _devCompleteYear,  // year development will complete (default: _devYear + 1; delay event increments this)
  _actualGrowth,     // last year's actual growth rate (for perf panel)
  _valueGain,        // last year's absolute value gain
  _missedRent,       // last year's missed rent (vacancy/reno/dev)
}
```

---

## Player Actions (7 total)

Actions that **consume a slot**: Buy, Renovate, Develop, Reduce Debt, Release Equity, Sell
Actions that do **not** consume a slot: Property Manager (set tier anytime), Passing (click "End Action")

### 1. Buy
- Validates: enough cash for deposit, no regional freeze, no investor cap, projected serviceability ≥ 0
- `deposit = price × depositRate`; `loan = price − deposit`
- `player.cash -= deposit`
- Creates owned property via `executeBuy()`: sets `purchasePrice`, `currentValue = price`, `currentRent = listing.rent`, `debt = loan`, `depositPaid = deposit`, `extraSpent = 0`
- Listing removed from market after purchase

### 2. Renovate
- One-time per property; blocked during development
- Cost: `Math.round(currentValue × 0.08)` — halved if `player.renoDiscountNextRound`
- Sets `prop._renovating = true`, `prop._renoYear = G.year`, `prop._renoCompleteYear = G.year + 1`
- During renovation year: property earns **half rent** (×0.5)
- Outcome revealed at next player turn via `checkPendingRenovations()`:
  ```js
  // Called at dismissHandoff when G.year >= prop._renoCompleteYear
  const variance   = RENO_VARIANCE[prop.risk];  // 0.15 | 0.30 | 0.50
  const actualMult = (1 - variance) + Math.random() * (variance * 2);  // e.g. 0.70–1.30 for medium
  const rentBoost  = Math.round(prop.currentRent  × prop.renoUpside × actualMult);
  const valueBoost = Math.round(prop.currentValue × prop.renoUpside × actualMult);
  prop.currentRent  += rentBoost;
  prop.currentValue += valueBoost;
  prop.renovated     = true;
  prop._renovating   = false;
  prop._renoYear     = null;
  prop._renoCompleteYear = null;
  ```
- `actualMult ≥ 1.1` → "Above estimate"; `≤ 0.9` → "Below estimate"; else "On target"

### 3. Develop (regional only)
- One-time per property; blocked during renovation
- Cost: `Math.round(currentValue × 0.15)`
- Sets `prop._developing = true`, `prop._devYear = G.year`, `prop._devCompleteYear = G.year + 1`
- During development year: property earns **no rent**
- Outcome revealed at next player turn via `checkPendingDevelopments()`:
  ```js
  // Called at dismissHandoff when G.year >= prop._devCompleteYear
  const roll = Math.random();
  if (roll < 0.60) {  // SUCCESS
    prop.currentRent  += Math.round(prop.currentRent  × 0.40);  // +40% rent
    prop.currentValue += Math.round(prop.currentValue × 0.30);  // +30% value
    prop.developed     = true;
    prop._developing   = false;
    prop._devYear      = null;
    prop._devCompleteYear = null;
  } else {  // FAILURE — cost overrun, NO gains, CAN attempt again
    const extraCost = Math.round(baseCost × 0.50);  // +50% overrun
    player.cash -= Math.min(extraCost, player.cash);
    prop.extraSpent += actualExtra;
    // prop.developed stays false — player can try again
    prop._developing    = false;
    prop._devYear       = null;
    prop._devCompleteYear = null;
  }
  ```
- **Bug fix note:** On failure, `prop.developed` must NOT be set to `true`. Previous versions had this bug.

### 4. Reduce Debt
- Minimum payment: $10,000
- `prop.debt -= amount; player.cash -= amount`
- Triggers `recalcPlayer()` — improves serviceability and reduces repayments

### 5. Release Equity (Refinance)
- Available when available equity ≥ $10,000: `Math.floor(currentValue × 0.80) − debt`
- Player selects amount; `prop.debt += amount; player.cash += amount`
- Serviceability check still applies

### 6. Sell
- Agent fee: `currentValue × 0.025`
- Equity returned: `currentValue − debt − agentFee`
- Property removed from `player.properties`
- Sell button: green if `equity − depositPaid − extraSpent >= 0`, red if loss

### 7. Property Manager (no slot cost)
- Tiers: None ($0), Basic ($2,000/yr), Standard ($4,000/yr), Premium ($8,000/yr)
- Manager cost deducted at H1 cash flow
- Vacancy reduction: `[0, 0.02, 0.04, 0.07]` (subtracted from base vacancy rate)

---

## Renovation / Development Progress UI

When `prop._renovating` or `prop._developing` is true, the owned property card shows:

```
[IN PROGRESS badge with tooltip: "Started Year X, completes Year Y..."]
[Progress bar: fills left-to-right, amber for reno, blue for dev]
[Label: "Completes Year 4 · 1 yr away" or "🎯 Completing this turn!"]
[Disabled button: "🔨 Renovating… (Yr 4)" or "🏗️ Developing… (Yr 4)"]
```

Progress calculation:
```js
const renoCompleteYear = prop._renoCompleteYear ?? (prop._renoYear + 1);
const renoTotalYears   = renoCompleteYear - prop._renoYear;
const renoElapsed      = G.year - prop._renoYear;
const renoProgress     = Math.min(100, Math.round((renoElapsed / renoTotalYears) * 100));
const renoYearsLeft    = Math.max(0, renoCompleteYear - G.year);
```

CSS classes: `.upgrade-progress`, `.upgrade-progress-bar`, `.upgrade-progress-fill.reno-fill` (amber gradient), `.upgrade-progress-fill.dev-fill` (blue gradient)

---

## Turn Flow — Interleaved Action Slots

Year has `N × 2` total slots (2 per player):

| Players | Slots/year |
|---------|-----------|
| 2 | 4 |
| 3 | 6 |
| 4 | 8 |

Slot-to-player mapping:
```js
function slotPlayer(slot) {
  return (G.firstThisYear + (slot % N)) % N;
}
```

`G.firstThisYear` is randomised at game start, then rotates `+1` each year. Both `G.firstThisYear` and `G.currentPlayerIdx` are set from the same `startingPlayer` variable at init.

### Year flow:
```
initGame()
  → generateMarket()
  → processHalfYearCashFlow(true)  [H1]
  → render() [phase: 'yearstart']

[Player dismisses year-start card]
  → dismissYearStart() → phase = 'handoff' or 'action' → render()

[Player acts or passes]
  → endActionSlot()
    → if slot < N×2/2: next slot (handoff → action)
    → if slot = N×2/2: processHalfYearCashFlow(false) [H2] → phase = 'midyear'
    → if slot = N×2:   processYearEnd()

processYearEnd()
  → G.year++
  → salary growth
  → annual property growth applied (all players)
  → expire bank policy if timer hits 0
  → G.firstThisYear rotates
  → generateMarket()
  → drawEventAndPolicy()

drawEventAndPolicy()
  → if event.effect === 'urgentSale': startAuction()
  → else: G.pendingEvent = event; show event phase
  → bank policy drawn every 2 years (even years: 2,4,6,8,10)

resolveEvent() → resolveBankPolicy() → continueToYearStart()
  → processHalfYearCashFlow(true) [H1 for new year]
  → G.yearSlot = 0; G.currentPlayerIdx = firstThisYear
  → phase = 'yearstart' → render()
```

### Renovation/development reveal timing:
Called in `dismissHandoff()` for the current player:
```js
checkPendingRenovations();   // reveals any reno where G.year >= _renoCompleteYear
checkPendingDevelopments();  // reveals any dev where G.year >= _devCompleteYear
```

---

## Phase System

`render()` routes entirely on `G.phase`:

| Phase | What renders |
|-------|-------------|
| `'yearstart'` | Combined year-start card — H1 cash flow for all players + action order |
| `'midyear'` | Mid-year card — H2 cash flow for all players |
| `'handoff'` | "Pass the screen to Player X" — hot-seat privacy |
| `'action'` | Main game board for current player's slot |
| `'event'` | Event card overlay |
| `'bankpolicy'` | Bank policy overlay |
| `'auction'` | Urgent sale bidding overlay |
| `'gameover'` | Final scores |

---

## Event Cards (21 total)

### Standard events (18):

| ID | Title | Effect | Params |
|----|-------|--------|--------|
| e1 | Rate Hike Shock | `allRateRise` | value: +0.0025 |
| e2 | Rental Boom | `metroRentBoost` | value: +0.10 |
| e3 | Regional Vacancy Spike | `regionalVacancy` | — (lowest rent regional goes vacant) |
| e4 | National Housing Crisis | `allValueDrop` | value: 0.05 |
| e5 | Infrastructure Boom | `regionalGrowth` | value: +0.05 |
| e6 | Council Rates Surge | `allFlatCost` | value: 2000 |
| e7 | Property Boom | `allValueBoost` | value: +0.05 |
| e8 | Strata Fee Surge | `allFlatCost` | value: 3000 |
| e9 | Insurance Premium Surge | `insuranceCost` | value: 1500/property |
| e10 | Rate Cut Surprise | `allRateCut` | value: 0.0025 (floor 3%) |
| e11 | Salary Bonus | `allCashBonus` | value: 10000 |
| e12 | Renovation Grants | `renoDiscount` | — (50% off renovation next round) |
| e13 | Flood Event | `regionalDamage` | value: 5000 (per player with regional) |
| e14 | Market Correction | `allValueDrop` | value: 0.03 |
| e15 | Foreign Investment Surge | `metroPriceInflation` | value: 0.08 (purchase prices only, this year) |
| e19 | Construction Delays | `upgradeDelay` | — (delays all active upgrades by 1 year; capped at MAX_YEARS) |
| e20 | Luxury Market Slump | `luxuryValueDrop` | value: 0.10, threshold: 800000 |
| e21 | Tenant Vandalism | `tenantDamage` | value: 0.08, threshold: 400000 |

### Rare events (3) — trigger open ascending auction:

| ID | Title | Effect | Discount |
|----|-------|--------|---------|
| e16 | Urgent Sale! | `urgentSale` | 25% off |
| e17 | Estate Fire Sale | `urgentSale` | 30% off |
| e18 | Mortgagee Sale | `urgentSale` | 20% off |

### Event deck construction:
Rare cards interleaved at ~1:4 ratio (1 rare per 4 standard), then full deck re-shuffled. Deck rebuilds from scratch if exhausted.

### Event effect implementations (in `applyEventEffect()`):

**`upgradeDelay`:** For each player's property where `_renovating` or `_developing` is true:
- If `_renoCompleteYear < MAX_YEARS`: increment `_renoCompleteYear` by 1
- If at `MAX_YEARS`: log "no effect" (don't soft-lock late-game upgrades)
- Same logic for `_devCompleteYear`

**`luxuryValueDrop`:** `properties.filter(pr => pr.currentValue > 800000)` → each loses `value × 0.10` of `currentValue`. Logs "no effect" if no qualifying properties.

**`tenantDamage`:** For each player: find cheapest property where `currentValue < 400000` → loses `value × 0.08` of `currentValue`. Per-player targeting (not global).

---

## Bank Policy Cards (8 total — drawn every 2 years)

| ID | Title | Effect | Params | Rounds |
|----|-------|--------|--------|--------|
| b1 | LVR Cap Tightened | `lvrCap` | depositRate: 0.30 | 2 |
| b2 | Regional Lending Freeze | `regionalFreeze` | — | 2 |
| b3 | Serviceability Buffer Up | `bufferIncrease` | multiplier: 0.65 | 2 |
| b4 | Rate Rise — 0.5% | `policyRateRise` | +0.005 | 0 (permanent this game) |
| b5 | Investor Lending Cap | `investorCap` | threshold: 3 | 2 |
| b6 | Stress Test Rate Up | `stressTestUp` | buffer: 0.03 | 2 |
| b7 | Rate Cut — 0.25% | `policyRateCut` | -0.0025 | 0 (permanent this game) |
| b8 | Normal Conditions | `normalise` | — | 0 (resets all restrictions) |

Policies with `rounds: 0` apply immediately and don't expire. Policies with `rounds > 0` track via `G.bankPolicyYearsLeft` and are reversed in `expireBankPolicy()` when the counter hits 0.

---

## Market Generation

Year 1: Always includes entry-level properties (low risk, standard rarity) so players can afford deposits with $60k starting cash.

Years 2+: Rarity-weighted selection:
- Legendary: ~3% chance per slot
- Rare: ~10% chance per slot
- Premium: ~25% chance per slot
- Standard: fills remaining slots

Market scales with player count: `Math.ceil(baseSize × N / 2)` for both metro and regional pools.

Price growth per year (compound):
```js
const midGrowth = (base.growthMin + base.growthMax) / 2;
const growth    = Math.pow(1 + midGrowth, yearFactor - 1);
const variation = 1 + (Math.random() * 2 - 1) * MARKET_VARIATION;  // ±10%
const price     = Math.round(base.price * growth * variation);
const rent      = Math.round(price × randomYieldInRange);
```

---

## Win Conditions

- **Mid-game win:** First player whose `netWorth ≥ $1,000,000` checked by `checkWin()` after every action and at year start. Checked in `G.players[]` order — earliest index wins on simultaneous qualification.
- **End of 10 years:** `endGame()` sorts players by `netWorth` descending; highest wins.

---

## Rarity System

Properties have `rarity: 'standard' | 'premium' | 'rare' | 'legendary'`.

**Rarity glow borders on cards:**
- Standard: no glow
- Premium: blue shimmer (`.rarity-glow-premium`)
- Rare: purple shimmer (`.rarity-glow-rare`)
- Legendary: intense gold shimmer (`.rarity-glow-legendary`)
- Developed property: gold glow takes priority over rarity glow (`.developed-glow`)
- Renovation in-progress: amber pulse (`.reno-in-progress`) — takes priority over rarity glow
- Development in-progress: blue pulse (`.dev-in-progress`)

---

## Risk System

| Risk | Border colour | Growth mult | Reno variance | Notes |
|------|--------------|------------|--------------|-------|
| low | green | 0.6 | ±15% | Stable, predictable |
| medium | amber | 1.0 | ±30% | Balanced |
| high | red | 1.5 | ±50% | Volatile — can wildly over/under-perform |

Cheap properties (currentValue < $400k) have additional growth floor penalty that scales linearly down to -6% extra downside.

---

## Stat Colour Coding on Market Cards

`getStatColorClass(stat, prop)` returns:
- `'stat-gold'`: rare/legendary/premium properties with exceptional stat values
- `'stat-green'`: solid stats regardless of rarity
- `'stat-red'`: warning stats (low yield, low growth ceiling, high vacancy)

---

## Simple View vs Full View

`G.simpleMode` (bool, default `true`) — toggled by 🎓 button.

**Simple view:** Plain-language stats, fewer rows, emoji-free labels. Shows: Value (with gain), Net Passive/yr, Rental Income, Yield %, Growth Range, Vacancy Rate, Remaining Debt, Equity. All action buttons + "ⓘ Full Details" button. Progress bars for upgrades in both views.

**Full view:** All same stats plus: detailed interest rows, per-property serviceability breakdown, raw data rows.

---

## Bot AI (Medium Difficulty — current)

Bot is activated if `player.isBot = true`. Bot takes turns automatically via `runBotTurn()` called in `dismissHandoff()`.

Bot strategy (medium):
1. Scores all possible actions: buy, renovate, develop, release equity, reduce debt, sell
2. Prefers positively-geared properties
3. Sells losing assets when blocked (serviceability negative)
4. Never renovates/develops an already-upgraded property
5. Considers cash reserve — won't go below minimum buffer

Bot action scoring happens via `scoreBotActions()`. Best scoring action is executed.

---

## Auction System (Urgent Sale Events)

1. Event card with `effect: 'urgentSale'` triggers `startAuction(event)`
2. Auction property is generated as a market listing at `price × (1 − discount)`
3. All players participate in open ascending bidding
4. Starting bid = discounted price; minimum increment = $5,000
5. Players bid or pass; last non-passed bidder wins
6. `resolveAuction()` calls `executeBuy()` for winner (serviceability re-checked)
7. After auction: bank policy drawn regardless (`finishAuctionFlow()`)

---

## Rendering Conventions

- All UI flows through `render()` → phase-specific function
- Render functions write to DOM via `innerHTML` on container elements
- Inline `onclick` attributes in generated HTML strings are standard (e.g., `onclick="actionBuy('${lid}')"`)
- `notify(msg)`: non-blocking error — auto-dismisses 3.5s, top-of-screen banner
- `showActionResult(icon, title, lines)`: center-screen overlay — click to dismiss or auto-dismisses 3.5s

### Formatters:
```js
fmt(n)        // AUD with commas: "12,500"
fmtPct(n)     // percentage: "6.50%"
fmtDelta(n)   // signed delta: "+1,200" or "-800"
fmtRed(n)     // wraps negatives in red span
fmtGrowthRange(effMin, effMax)  // e.g. "<red>-3</red>–8%"
```

---

## CSS Theme

Dark navy/gold design system. Key custom properties:
```css
:root {
  --bg:       #0a0f1e;   /* darkest background */
  --surface:  #111827;   /* card backgrounds */
  --surface2: #1a2332;   /* raised surfaces */
  --gold:     #d4a017;   /* primary accent — wins, highlights, legendary */
  --green:    #22c55e;
  --red:      #ef4444;
  --orange:   #f97316;
  --blue:     #3b82f6;
  --text:     #e2e8f0;
  --text-dim: #94a3b8;
}
```

### Key CSS class patterns:
- `.property-card` — base for all property cards
- `.property-card.owned` — owned property card
- `.risk-low / .risk-medium / .risk-high` — left border colour
- `.developed-glow` — gold animated glow (beats all other glows)
- `.rarity-glow-premium / -rare / -legendary` — rarity shimmer borders
- `.reno-in-progress` — amber animated border
- `.dev-in-progress` — blue animated border
- `.upgrade-progress` — upgrade progress bar container
- `.upgrade-progress-fill.reno-fill` — amber gradient fill
- `.upgrade-progress-fill.dev-fill` — blue gradient fill
- `.badge` — small inline tag (RENOVATED, DEVELOPED, IN PROGRESS, VACANT)
- `.tooltip-host[data-tooltip]` — hover tooltip pattern

---

## Property Inventory (34 properties)

### Standard / Low Risk
- Townsville Unit (regional, $185k) — yield 6.5–8.2%, growth 1.5–3.2%, reno 30%
- Rockhampton Unit (regional, $195k) — yield 6.2–8.0%, growth 1.5–3.0%, reno 28%
- Adelaide Unit (metro, $220k) — yield 6.2–8.0%, growth 2.5–5.0%, reno 20%
- Perth Unit (metro, $240k) — yield 6.0–7.8%, growth 2.8–5.5%, reno 18%
- Brisbane Unit (metro, $260k) — yield 6.0–7.8%, growth 3.0–6.0%, reno 17%
- Cairns Unit (regional, ~$270k) — yield range, low risk
- Wagga Wagga House (regional, ~$280k) — low risk
- Toowoomba House (regional, ~$310k) — low risk
- Ballarat Cottage (regional, ~$320k) — low risk

### Standard / Medium Risk
- Gold Coast Apartment (metro, ~$540k)
- Melbourne Apartment (metro, ~$620k)
- Adelaide Terrace (metro, ~$580k)
- Darwin Warehouse (regional, ~$350k)
- Broken Hill House (regional, ~$260k)

### Standard / High Risk
- Dubbo Duplex (regional, ~$275k) — high vacancy, high growth ceiling
- Mackay House (regional, ~$300k)

### Premium tier (~$720k–$820k)
- Byron Bay Cottage (regional, premium)
- Newcastle Terrace (metro, premium)
- Wollongong House (metro, premium)

### Rare tier (~$900k–$1.2M)
- Lane Cove House (metro, rare)
- Noosa Estate (regional, rare)
- Fremantle Heritage House (metro, rare)

### Legendary tier (trophy assets, $1.65M–$4.2M)
- South Yarra Heritage House (~$1.65M)
- Cottesloe Beach House (~$1.8M)
- Bondi Penthouse (~$3.5M)
- Toorak Manor (~$4.2M)

*(Plus additional properties to reach 34 total — see PROPERTIES array in data.js for full list)*

---

## Key Design Decisions (record of why things work this way)

| Decision | Rationale |
|---------|-----------|
| 2 actions per player regardless of player count | Prevents 3-4P games from feeling truncated vs 2P |
| `firstThisYear` randomised at start | Eliminates first-mover structural advantage |
| Property growth applied at year end, not mid-year | Prevents exploit of buying at end of year for same-year growth |
| Renovation always yields positive boost (variable magnitude) | Variance is the mechanic — no binary fail for renovation |
| Development has binary success/fail (60/40) | Higher cost (15% vs 8%) warrants higher risk/reward profile |
| Failed development does NOT mark `prop.developed = true` | Bug fix: player can retry; gold glow should only appear on actual success |
| `_renoCompleteYear` stored separately from `_renoYear` | Allows delay events to extend completion without losing start year data |
| Market price scales with `(1 + midGrowth)^(year-1)` | Infinite model — no hard price caps |
| Year 1 guarantees entry-level properties | Players need ≤$60k deposit to buy in year 1 |
| `metroPriceInflation` resets to 0 each year | Event is one-time per year; purchase prices (not ownership values) affected |
| `CHEAP_PRICE_THRESHOLD = 400_000` | Properties below this get growth floor penalty + vacancy bonus as realistic downside |
| Agent fee at 2.5% on sale | Realistic Australian market rate |
| `upgradeDelay` event capped at `MAX_YEARS` | Prevents soft-lock where a renovation can never complete before game end |
| `luxuryValueDrop` threshold at $800k | Targets players with mid-high to premium properties; negligible impact early game |
| `tenantDamage` targets cheapest sub-$400k property | Penalises holding cheap entry properties long-term without selling/upgrading |
| Event deck ratio: 1 rare per 4 standard | Rare urgent-sale events create drama without dominating; ~2–3 auctions per game |
| Bank policy every 2 years (even years) | Predictable cadence; players can plan around it |

---

## File Responsibilities

| File | Role |
|------|------|
| `index.html` | UI layout — setup screen (`#setup-screen`) + game screen (`#game-screen`). Key IDs: `overlay`, `modal`, `main-ui`, `active-player-stats`, `other-player-stats`, `owned-properties`, `market-cards`, `actions-indicator`, `round-indicator`, `notification`, `action-feedback` |
| `style.css` | Dark navy/gold theme. CSS custom properties in `:root`. Append new styles at end of file. |
| `data.js` | Static data only — `PROPERTIES` (34), `EVENT_CARDS` (21), `BANK_POLICIES` (8). Loaded before game.js. |
| `game.js` | Full game engine + all DOM rendering. Single global state `G`. No framework. |
