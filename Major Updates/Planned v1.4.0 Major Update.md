# Planned v1.4.0 Major Update
Equity Sprint Online — planned features for next major release.
Status: NOT YET IMPLEMENTED

---

## Feature 1 — Standard vs Custom Game Lobby

### Overview
When the host creates a room, they choose between:
- **Standard** — current ruleset, no configuration, game starts immediately
- **Custom** — exposes a settings panel before the game starts

### Custom Game Settings

| Setting | Default | Range / Options |
|---------|---------|-----------------|
| Starting cash | $80,000 | $20,000 – $200,000 (steps of $10,000) |
| Starting salary | $95,000 | $40,000 – $200,000 (steps of $5,000) |
| Win goal (net worth target) | $1,000,000 | $500,000 – $5,000,000 (steps of $100,000) |
| Game length (years/rounds) | 10 | 5 – 20 |
| Actions per slot | 2 | 1 – 3 |
| Base interest rate | 6.5% | 3% – 12% (steps of 0.5%) |
| Deposit rate / LVR | 20% | 10% – 30% (steps of 5%) |
| Wheel events | On | On / Off |
| Influence cards (PvP) | On | On / Off |
| Property growth multiplier | Standard | Low / Standard / High / Random |
| Market size (for-sale cards) | 9 | 6 – 15 |
| Max properties per player | Unlimited | Unlimited / 3 / 5 / 8 |
| Bot difficulty | Standard | Passive / Standard / Aggressive |

### Architecture Notes
- Custom settings stored in room object on server (`room.gameConfig`)
- `game-engine.js` initialiseGame() reads `gameConfig` to override defaults
- Lobby UI: radio toggle (Standard / Custom) → settings panel slides open if Custom
- Settings passed from host via `create-room` payload: `{ playerName, maxPlayers, gameConfig }`
- All clients receive the config in `game-state` so they can display "Custom Game" badge in lobby
- Standard game: `gameConfig = null` (engine uses hardcoded defaults)

---

## Feature 2 — Handdrawn / Playful UI Redesign

### Overview
Visual overhaul to make the UI feel playful, tactile, and alive. Warm coral/gold palette, sketch-style borders, animated clouds over the map, and richer dashboard components.

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
New root variable + modifier classes:
```css
--radius-sketch: 14px 8px 12px 10px / 10px 12px 8px 14px;
.sketch    { border-radius: var(--radius-sketch) !important; }
.sketch-sm { border-radius: 10px 6px 10px 8px / 8px 10px 6px 10px !important; }
```
Apply `.sketch` to: hero stat cards, quick-stat grid items, owned property cards, portfolio bar chart section.

### 2C — Hero Stat Cards (Coral / Gold)
Replace the two flat `.stat-card` blocks in `renderMineSidebar()` with large coral (Net Income) and gold (Net Worth) cards. Red variant when NPI is negative.

Classes: `.hero-stat-card`, `.hsc-label`, `.hsc-value`, `.hsc-unit`, `.hsc-sub`

### 2D — Dashboard Header in Sidebar
Add "Investor Dashboard" title + player name at the top of the sidebar content (`renderMineSidebar()`).

Classes: `.dashboard-header`, `.dh-title`, `.dh-name`

### 2E — Portfolio Efficiency Bar Chart
New `buildPortfolioBarChart(p)` function renders a horizontal bar chart in the sidebar showing each owned property's current value relative to the highest-value property. Colour-coded: gold = renovating, mint = developed, blue = standard.

Classes: `.bar-chart-section`, `.bar-row`, `.bar-name`, `.bar-track`, `.bar-fill`, `.bar-val`

### 2F — Animated Clouds over Map
Four CSS-animated white cloud divs drift left-to-right over `#map-zone` at different speeds and vertical positions. `pointer-events: none` so they don't block map interaction.

Add `#clouds-layer` div (4 `.cloud` children) inside `#map-zone` in `index.html`.

### 2G — Heritage House Image Gradient Fix
Wrap `<img class="prop-img">` in a `.prop-img-wrap` div with a `::after` white gradient overlay at the bottom to hide any baked-in text on property card images.

---

## Files Affected

| File | Changes |
|------|---------|
| `server/server.js` | Accept `gameConfig` in `create-room`; pass to engine |
| `server/game-engine.js` | `initialiseGame()` reads `gameConfig` to override constants |
| `client/index.html` | Lobby mode toggle (Standard/Custom) + settings panel; `#clouds-layer` in map |
| `client/client.js` | Render custom settings panel; `buildPortfolioBarChart()`; hero stat cards; dashboard header; `.sketch` classes; `propCardHtml()` img wrap |
| `client/style.css` | All new CSS vars, classes listed above |

---

## Verification Checklist
- [ ] Host sees Standard / Custom toggle when creating room
- [ ] Custom panel shows all settings with correct defaults
- [ ] Custom config propagates to engine — changing salary/goal/length actually works in game
- [ ] Standard game is unaffected
- [ ] Coral stat cards render in sidebar (Net Income = coral, Net Worth = gold, negative NPI = red)
- [ ] Sketch borders visible on stat cards and owned property cards
- [ ] Dashboard header shows "Investor Dashboard" + player name
- [ ] Portfolio bar chart appears in sidebar after buying a property
- [ ] Clouds drift across the map (no flicker, no blocking map clicks)
- [ ] Heritage house card images don't show baked-in text
