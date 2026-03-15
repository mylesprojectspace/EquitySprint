# Equity Sprint — Implementation Checklist

> After each ✅ task: screenshot → read PNG → check for bugs → note improvements before moving on.
> Screenshot command: `node screenshot.mjs http://localhost:3000`

---

## Phase A — Bug Fixes (Current Session)

- [x] **A1** Restart server (kill port 3000, start fresh so Add Bot works)
- [x] **A2** Fix pin hover glitch — remove `translateY(-5px)` from `.prop-pin:hover`
- [x] **A3** Fix Marketplace button — solid green primary style so it's obvious
- [x] **A4** Fix city pin coordinates — correct Byron Bay, add missing cities (Broken Hill, Dubbo, Fremantle)
- [x] **A5** Add owned property list to sidebar — Value / Equity / Rent + action buttons per property
- [x] **📸 Screenshot + bug check after Phase A** — screenshot-13-portfolio.png

---

## Phase B — Visual Polish (Next Session)

- [x] **B1** Rarity glow borders — CSS keyframes added; classes applied to prop-card and owned-prop-card (glows visible on year 2+ rare/legendary cards)
- [x] **B2** Reno/Dev progress bars — amber/blue progress bars with year label implemented in buildPortfolioHtml
- [x] **B3** Risk border colours — green/gold/red left borders working (screenshot-14-market-rarity.png confirms)
- [x] **B4** Simple / Full view toggle — 🎓 Full/Simple button in portfolio header; toggles extra stats row (Debt/Bought/Spent) on owned cards
- [x] **📸 Screenshot + bug check after Phase B** — screenshot-14-market-rarity.png

---

## Phase C — Sidebar Richness (Follow-up)

- [x] **C1** Player avatar circles — colored initial circles in player cards; shows avatar image when `/assets/avatar-N.png` exists
- [x] **C2** 6-stat quick grid — Total Debt (red) + Rent/yr (green) added below existing 4 stats
- [x] **C3** Recent events strip — last 3 log entries above portfolio section (working in screenshot-15)
- [x] **📸 Screenshot + bug check after Phase C** — screenshot-15-final.png

---

## Notes / Bugs Found

### Phase C findings (screenshot-16-complete.png)
- ✅ 6-stat grid showing Cash / Serviceability / Salary / Rate / Total Debt / Rent/yr
- ✅ Avatar circles visible on both player cards (TestPlayer + Bot 2)
- ✅ Recent events showing "Strict Test Time..." market change and bot purchases
- ✅ Portfolio showing bought property with Value/Equity/Rent and action buttons
- ✅ Green Market button clearly in header
- ✅ 🎓 Full/Simple toggle button appears in portfolio header (need to test interaction)

### Phase A findings (screenshot-13-portfolio.png)
- ✅ Green Market button clearly visible in header — fix confirmed
- ✅ Portfolio section shows Perth Unit with Value/Equity/Rent and Reno/Sell/Equity buttons
- ✅ Recent Events strip shows last 3 log entries
- ✅ Add Bot works — bot fills slot, Start Game appears, bot takes turns automatically
- ✅ Perth pin placed correctly on west coast of map
- ⚠️ Sidebar overflows past bottom (property cards below fold) — CSS needs `overflow-y: auto` on left sidebar
- ⚠️ There is a broken HTML tag in buildPortfolioHtml — `<span class="badge badge-develop">✅ Developed<\span>` (backslash in closing tag, typo from previous session)
