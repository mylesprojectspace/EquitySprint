# Planned v1.4.0 Major Update (Revised)
Equity Sprint Online — planned features for next major release.
Incorporates balance rebalance as the new STANDARD ruleset.
Status: NOT YET IMPLEMENTED

---

## Feature 0 — Balance Rebalance (Standard Ruleset)

### Overview
All balance changes ship as the new standard defaults. These are not optional in Standard mode — they define the baseline game. Custom mode exposes sliders to override any of these values, including reverting to pre-1.4.0 "Classic" behaviour.

### 0A — Renovation Rebalance

**Problem:** Renovations currently return 250–437% ROI in instant equity, making every other action inferior. The root cause is that `renoUpside` applies equally to rent AND property value.

**Changes:**

| Constant | Pre-1.4.0 | v1.4.0 Standard | Notes |
|----------|-----------|-----------------|-------|
| `RENO_VALUE_MULT` | 1.0 (implicit) | 0.50 | Value uplift is 50% of rent uplift |
| `RENO_COST_MULT` (standard) | 0.08 | 0.08 | Unchanged |
| `RENO_COST_MULT` (premium) | 0.08 | 0.10 | New: rarity-scaled costs |
| `RENO_COST_MULT` (rare) | 0.08 | 0.12 | New: rarity-scaled costs |
| `RENO_COST_MULT` (legendary) | 0.08 | 0.15 | New: rarity-scaled costs |
| Reno cooldown | None | 1 year after purchase | Cannot renovate in purchase year |

**Implementation:**
```javascript
const RENO_VALUE_MULT = 0.50;
const RENO_COST_BY_RARITY = {
  standard: 0.08, premium: 0.10, rare: 0.12, legendary: 0.15
};
```

In `checkPendingRenovations()`:
```javascript
const rentBoost  = Math.round(prop.currentRent  * prop.renoUpside * actualMult);
const valueBoost = Math.round(prop.currentValue * prop.renoUpside * RENO_VALUE_MULT * actualMult);
```

In `actionRenovate()` and `showRenovateModal()`:
```javascript
const baseCostRate = RENO_COST_BY_RARITY[prop.rarity] ?? RENO_COST_BY_RARITY.standard;
let cost = Math.round(prop.currentValue * baseCostRate);
```

Cooldown check in `actionRenovate()`:
```javascript
if (prop._purchaseYear && G.year <= prop._purchaseYear)
  return notify(`${prop.city} was purchased this year — renovations available from Year ${prop._purchaseYear + 1}.`);
```

Store in `executeBuy()`:
```javascript
owned._purchaseYear = G.year;
```

**Expected ROI after changes (medium risk, expected values):**

| Tier | Cost | Rent uplift | Value uplift | Value ROI |
|------|------|-------------|--------------|-----------|
| Standard (20% up) | 8% of value | +20% rent | +10% value | 125% |
| Premium (25% up) | 10% of value | +25% rent | +12.5% value | 125% |
| Rare (30% up) | 12% of value | +15% value | +15% value | 125% |
| Legendary (15% up) | 15% of value | +15% rent | +7.5% value | 50% |

Renovations remain clearly profitable but no longer dominate all other actions.

---

### 0B — Property Accessibility

**Problem:** Premium/rare/legendary properties are unreachable before endgame. Deposit requirements create hard walls that salary savings can't overcome in time.

**Changes:**

| Mechanic | Pre-1.4.0 | v1.4.0 Standard | Notes |
|----------|-----------|-----------------|-------|
| `EQUITY_DEPOSIT_OFFSET` | 0 (not present) | 0.50 | 50% of accessible equity offsets deposit |
| Minimum deposit floor | 20% (flat) | 10% of purchase price | Hard floor even with equity offset |
| Legendary prices | $3.5M / $4.2M | $2.5M / $3.0M | ~30% reduction |
| Legendary growth (Bondi) | 0.080–0.200 | 0.055–0.170 | Reduced to match lower base |
| Legendary growth (Toorak) | 0.075–0.180 | 0.060–0.155 | Reduced to match lower base |
| Market rarity guarantees | Year 1 only | Progressive by year | See below |
| Urgent sale tier weighting | Uniform random | Year-weighted | See below |

**Equity-based deposit offset:**
```javascript
const EQUITY_DEPOSIT_OFFSET   = 0.50;
const MIN_DEPOSIT_RATE        = 0.10;
```

In `canBuyProperty()`:
```javascript
const baseDeposit = Math.round(price * r.depositRate);
const existingEquity = player.properties.reduce(
  (s, pr) => s + Math.max(0, Math.floor(pr.currentValue * 0.80) - pr.debt), 0
);
const equityOffset = Math.floor(existingEquity * EQUITY_DEPOSIT_OFFSET);
const minDeposit   = Math.round(price * MIN_DEPOSIT_RATE);
const deposit      = Math.max(minDeposit, baseDeposit - equityOffset);
const loanAmount   = price - deposit;
```

Note: Serviceability check is unchanged — income must still support the larger loan. This only removes the deposit cash barrier for experienced investors.

**Progressive rarity market guarantees:**

| Year | Guarantee |
|------|-----------|
| 1–2 | At least 2 low-risk standard (current behaviour) |
| 3–4 | At least 1 premium in combined market |
| 5–6 | At least 1 rare in combined market |
| 7+ | At least 1 rare guaranteed; legendary roll threshold raised to 15% (from 10%) |

Implementation: after `pickWithRarity()` completes, scan results. If guarantee not met, replace the lowest-value standard listing with a random property of the required tier.

**Urgent sale tier weighting:**

| Year | Standard | Premium | Rare | Legendary |
|------|----------|---------|------|-----------|
| 1–3 | 100% | — | — | — |
| 4–6 | 60% | 30% | 10% | — |
| 7+ | 40% | 30% | 20% | 10% |

---

### 0C — Missing Event Cards (Port from Offline)

**Problem:** The online version is missing 5 event cards that the offline version uses for anti-snowball and risk distribution.

**Cards to add to online EVENT_CARDS array:**

| ID | Title | Effect | Value | Notes |
|----|-------|--------|-------|-------|
| we18 | National Housing Crisis | allValueDrop | 0.05 | -5% all property values |
| we19 | Strata Fee Surge | allFlatCost | 3000 | -$3,000 all players |
| we20 | Construction Delays | upgradeDelay | — | All active renos/devs delayed +1 year |
| we21 | Luxury Market Slump | luxuryValueDrop | 0.10 | Properties >$800k drop 10% value |
| we22 | Tenant Vandalism | tenantDamage | 0.08 | Cheapest property <$400k loses 8% value |

**Effect handlers to port from offline `applyEventEffect()`:**
- `upgradeDelay` — increments `_renoCompleteYear` and `_devCompleteYear` by 1 for all in-progress upgrades
- `luxuryValueDrop` — applies percentage drop to all properties above threshold
- `tenantDamage` — applies percentage drop to each player's cheapest property below threshold

These cards plug the gaps in the online risk spectrum: luxury portfolios, cheap portfolios, and upgrade-rushing all now have systemic checks.

---

### 0D — Development Failure Cost (Bug Fix / Port)

**Problem:** The offline version charges a 50% cost overrun on failed developments. The online version may be missing this, making development a risk-free gamble.

**Verify and if missing, add to development failure logic:**
```javascript
if (roll >= DEVELOP_SUCCESS) {
  const extraCost = Math.round(baseCost * 0.50);
  const actualExtra = Math.min(extraCost, player.cash);
  player.cash -= actualExtra;
  prop.extraSpent = (prop.extraSpent || 0) + actualExtra;
}
```

---

### 0E — Renovation Income During Construction

**Difference:** Offline collects 1/4 rent during renovation; online collects 0.

**Decision needed:** Align both versions. Recommendation: adopt the offline approach (1/4 rent) as standard. Zero rent during reno stacks too harshly with the reno cooldown and increased reno costs — players need some income to stay solvent during the construction year.

```javascript
// In processHalfYearCashFlow(), renovating property rent:
if (pr._renovating) return s + Math.round(pr.currentRent / 4);
```

---

### 0F — Half-Yearly Cash Flow (Online Verification)

**Action required:** Verify that the online `game-engine.js` processes cash flow twice per year (H1 at year start, H2 at midpoint of action slots) and that a mid-year summary card is shown to players between action rounds.

If missing, port the offline implementation:
- H1 fires at `yearSlot = 0` (vacancy rolls, manager costs, first income/expense pass)
- H2 fires at `yearSlot = totalSlots / 2` (second income/expense pass, no new vacancy roll)
- `midyear` phase renders a summary card showing H2 income received

---

### 0G — Manager Cost Timing (Online Verification)

**Action required:** Verify online manager fees are deducted once per year (at H1 only), not once per cash-flow run. If fees are being charged at both H1 and H2, that's a bug doubling the annual cost.

---

## Feature 1 — Standard vs Custom Game Lobby

### Overview
When the host creates a room, they choose between:
- **Standard** — v1.4.0 balanced ruleset, no configuration, game starts immediately
- **Custom** — exposes a settings panel before the game starts

### Custom Game Settings

| Setting | Standard Default | Range / Options | Notes |
|---------|-----------------|-----------------|-------|
| **Economy** | | | |
| Starting cash | $80,000 | $20,000 – $200,000 (steps of $10,000) | |
| Starting salary | $95,000 | $40,000 – $200,000 (steps of $5,000) | |
| Win goal (net worth target) | $1,000,000 | $500,000 – $5,000,000 (steps of $100,000) | |
| Game length (years) | 10 | 5 – 20 | |
| Actions per slot | 2 | 1 – 3 | |
| Base interest rate | 6.5% | 3% – 12% (steps of 0.5%) | |
| Deposit rate / LVR | 20% | 10% – 30% (steps of 5%) | |
| **Market** | | | |
| Market size (for-sale cards) | 9 | 6 – 15 | |
| Property growth multiplier | Standard | Low / Standard / High / Random | |
| Max properties per player | Unlimited | Unlimited / 3 / 5 / 8 | |
| Rarity guarantees | On | On / Off | v1.4.0 progressive guarantees |
| **Balance** | | | |
| Renovation power | Balanced | Classic / Balanced / Weak | See below |
| Equity deposit leverage | On | On / Off | Equity-based deposit offset |
| Reno cooldown | On | On / Off | 1-year purchase cooldown |
| Extended event deck | On | On / Off | Includes 5 ported offline cards |
| **Online Features** | | | |
| Wheel events | On | On / Off | |
| Influence cards (PvP) | On | On / Off | |
| Bot difficulty | Standard | Passive / Standard / Aggressive | |

### Renovation Power Presets

| Preset | RENO_VALUE_MULT | Rarity-scaled costs | Description |
|--------|-----------------|---------------------|-------------|
| Classic | 1.0 | Off (flat 8%) | Pre-1.4.0 behaviour. High-ROI renovations. |
| Balanced | 0.50 | On | v1.4.0 standard. Renovations are good, not dominant. |
| Weak | 0.30 | On | Experimental. Renovations are a minor boost. |

### Architecture Notes
- Custom settings stored in room object on server (`room.gameConfig`)
- `game-engine.js` `initialiseGame()` reads `gameConfig` to override defaults
- Lobby UI: radio toggle (Standard / Custom) → settings panel slides open if Custom
- Settings passed from host via `create-room` payload: `{ playerName, maxPlayers, gameConfig }`
- All clients receive the config in `game-state` so they can display "Custom Game" badge in lobby
- Standard game: `gameConfig = null` → engine uses v1.4.0 balanced defaults
- Balance constants in engine should be structured for easy override:

```javascript
// Default config (Standard mode)
const DEFAULT_CONFIG = {
  startingCash:        80000,
  startingSalary:      95000,
  winTarget:           1000000,
  maxYears:            10,
  actionsPerSlot:      2,
  baseInterestRate:    0.065,
  baseDepositRate:     0.20,
  renoValueMult:       0.50,        // NEW — value uplift multiplier
  renoCostByRarity:    { standard: 0.08, premium: 0.10, rare: 0.12, legendary: 0.15 },  // NEW
  renoCooldown:        true,         // NEW — 1yr after purchase
  equityDepositOffset: 0.50,         // NEW — deposit leverage
  minDepositRate:      0.10,         // NEW — hard floor
  rarityGuarantees:    true,         // NEW — progressive guarantees
  extendedEventDeck:   true,         // NEW — 5 ported offline cards
  wheelEvents:         true,
  influenceCards:      true,
  marketSize:          9,
  maxProperties:       Infinity,
  growthMultiplier:    'standard',
  botDifficulty:       'standard',
};

function initialiseGame(players, config = null) {
  const cfg = config ? { ...DEFAULT_CONFIG, ...config } : DEFAULT_CONFIG;
  // Use cfg.renoValueMult, cfg.startingCash, etc. throughout engine
}
```

---

## Feature 2 — Handdrawn / Playful UI Redesign

(Unchanged from original spec — no balance impact)

### 2A — Colour Palette Expansion (`style.css` `:root`)
New CSS variables:
```css
--coral:       #FF6B6B;
--coral-dark:  #E55454;
--coral-light: #FFF0EE;
--mint:        #52C9A0;
--mint-light:  #E8FAF4;
```

### 2B — Sketch / Handdrawn Borders
```css
--radius-sketch: 14px 8px 12px 10px / 10px 12px 8px 14px;
.sketch    { border-radius: var(--radius-sketch) !important; }
.sketch-sm { border-radius: 10px 6px 10px 8px / 8px 10px 6px 10px !important; }
```

### 2C — Hero Stat Cards (Coral / Gold)
Replace flat `.stat-card` blocks with large coral (Net Income) and gold (Net Worth) cards.

### 2D — Dashboard Header in Sidebar
"Investor Dashboard" title + player name.

### 2E — Portfolio Efficiency Bar Chart
`buildPortfolioBarChart(p)` — horizontal bar chart showing each property's value.
**Addition for v1.4.0:** Show accessible equity per property as a secondary bar or label, so players can see their deposit leverage at a glance.

### 2F — Animated Clouds over Map
Four CSS-animated cloud divs over `#map-zone`.

### 2G — Heritage House Image Gradient Fix
White gradient overlay on property card images.

---

## Feature Summary — Implementation Priority

### Priority 1: Balance (Feature 0) — implement first, test thoroughly
1. `0A` Renovation rebalance (RENO_VALUE_MULT, rarity costs, cooldown)
2. `0B` Property accessibility (equity deposit offset, rarity guarantees, legendary repricing)
3. `0C` Port 5 missing event cards + effect handlers
4. `0D` Verify/fix development failure cost
5. `0E` Align renovation income (1/4 rent during construction)
6. `0F` Verify half-yearly cash flow in online version
7. `0G` Verify manager cost timing

### Priority 2: Custom Lobby (Feature 1)
1. `DEFAULT_CONFIG` object with all v1.4.0 defaults
2. `initialiseGame()` config override system
3. Server-side `gameConfig` in room object
4. Lobby UI: Standard/Custom toggle + settings panel
5. Renovation power presets (Classic / Balanced / Weak)

### Priority 3: UI Redesign (Feature 2)
1. CSS variables and sketch borders
2. Hero stat cards
3. Portfolio bar chart (with equity display)
4. Dashboard header
5. Clouds and image fixes

---

## Updated Property Data (Legendary Tier Only)

```javascript
// BEFORE (pre-1.4.0)
{ id: 33, city: 'Bondi Penthouse',  price: 3500000, growthMin: 0.080, growthMax: 0.200, ... }
{ id: 34, city: 'Toorak Manor',     price: 4200000, growthMin: 0.075, growthMax: 0.180, ... }

// AFTER (v1.4.0)
{ id: 33, city: 'Bondi Penthouse',  price: 2500000, growthMin: 0.055, growthMax: 0.170, ... }
{ id: 34, city: 'Toorak Manor',     price: 3000000, growthMin: 0.060, growthMax: 0.155, ... }
```

All other property data unchanged.

---

## Files Affected

| File | Changes |
|------|---------|
| `server/game-engine.js` | `DEFAULT_CONFIG`; `initialiseGame()` config override; reno rebalance logic; equity deposit offset in `canBuyProperty()`; progressive rarity in `generateMarket()`; 5 new event effects in `applyEventEffect()`; dev failure cost verification; reno income alignment; half-yearly verification; manager cost verification |
| `server/data.js` | Legendary price/growth changes; 5 new event cards (we18–we22) |
| `server/server.js` | Accept `gameConfig` in `create-room`; pass to engine |
| `client/index.html` | Lobby mode toggle + settings panel; `#clouds-layer` |
| `client/client.js` | Custom settings UI; portfolio bar chart with equity display; hero stat cards; dashboard header; sketch classes; reno cooldown display in property cards; equity leverage indicator |
| `client/style.css` | All Feature 2 CSS |

---

## Verification Checklist

### Balance (Feature 0)
- [ ] Renovation value boost is halved compared to rent boost
- [ ] Reno cost scales with property rarity (8% / 10% / 12% / 15%)
- [ ] Cannot renovate a property in the same year it was purchased
- [ ] Equity deposit offset reduces required cash for experienced players
- [ ] Minimum 10% deposit always required regardless of equity
- [ ] Premium property guaranteed in market from Year 3
- [ ] Rare property guaranteed in market from Year 5
- [ ] Legendary properties use new reduced prices ($2.5M / $3M)
- [ ] Urgent sale tier weighting changes by game year
- [ ] 5 new event cards appear in the event deck
- [ ] Construction Delays correctly postpones in-progress upgrades
- [ ] Luxury Market Slump hits properties above $800k threshold
- [ ] Tenant Vandalism hits cheapest property below $400k threshold
- [ ] Failed developments charge 50% cost overrun
- [ ] Renovating properties collect 1/4 rent (not 0)
- [ ] Half-yearly cash flow fires twice per year (H1 + H2)
- [ ] Manager fees deducted once per year at H1 only

### Custom Lobby (Feature 1)
- [ ] Host sees Standard / Custom toggle when creating room
- [ ] Custom panel shows all settings with correct v1.4.0 defaults
- [ ] "Renovation Power: Classic" reverts to pre-1.4.0 reno behaviour
- [ ] "Equity Deposit Leverage: Off" disables equity offset
- [ ] "Extended Event Deck: Off" removes the 5 ported cards
- [ ] Custom config propagates to engine correctly
- [ ] Standard game uses v1.4.0 balanced defaults with no config needed
- [ ] Custom games display "Custom Game" badge in lobby

### UI Redesign (Feature 2)
- [ ] Coral stat cards render (Net Income = coral, Net Worth = gold)
- [ ] Sketch borders visible on stat cards and property cards
- [ ] Dashboard header shows "Investor Dashboard" + player name
- [ ] Portfolio bar chart appears with equity leverage indicator
- [ ] Clouds drift across map without blocking interaction
- [ ] Heritage house images don't show baked-in text
