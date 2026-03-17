// ============================================================
// EQUITY SPRINT ONLINE — Game Data
// Migrated from Equity Sprint (hot-seat) — data layer only
// ============================================================

const PROPERTIES = [
  // ── STANDARD: LOW RISK — stable, lower yield, blue-chip entry points ──
  {
    id: 15, market: 'regional', city: 'Townsville Unit',
    flavour: 'Steady earner in a growing North Queensland hub',
    propType: 'unit',
    price: 185000,
    yieldMin: 0.065, yieldMax: 0.082,
    growthMin: 0.015, growthMax: 0.032,
    renoUpside: 0.30, risk: 'low', vacancy: 0.05,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 16, market: 'regional', city: 'Rockhampton Unit',
    flavour: 'Beef capital bargain — consistent working-class tenants',
    propType: 'unit',
    price: 195000,
    yieldMin: 0.062, yieldMax: 0.080,
    growthMin: 0.015, growthMax: 0.030,
    renoUpside: 0.28, risk: 'low', vacancy: 0.05,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 17, market: 'metro', city: 'Adelaide Unit',
    flavour: 'South Aussie suburban gem — most liveable city bargain',
    propType: 'unit',
    price: 220000,
    yieldMin: 0.062, yieldMax: 0.080,
    growthMin: 0.025, growthMax: 0.050,
    renoUpside: 0.20, risk: 'low', vacancy: 0.04,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 18, market: 'metro', city: 'Perth Unit',
    flavour: 'Boom-state entry point — mining money drives tenants',
    propType: 'unit',
    price: 240000,
    yieldMin: 0.060, yieldMax: 0.078,
    growthMin: 0.028, growthMax: 0.055,
    renoUpside: 0.18, risk: 'low', vacancy: 0.04,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 19, market: 'metro', city: 'Brisbane Unit',
    flavour: 'Olympic city starter pack — demand only heading one way',
    propType: 'unit',
    price: 260000,
    yieldMin: 0.060, yieldMax: 0.078,
    growthMin: 0.030, growthMax: 0.060,
    renoUpside: 0.17, risk: 'low', vacancy: 0.04,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 20, market: 'regional', city: 'Cairns Unit',
    flavour: 'Tropical tourism town — reliable income from workers & tourists',
    propType: 'unit',
    price: 210000,
    yieldMin: 0.062, yieldMax: 0.082,
    growthMin: 0.018, growthMax: 0.038,
    renoUpside: 0.25, risk: 'low', vacancy: 0.05,
    rarity: 'standard', renovated: false, developed: false
  },

  // ── STANDARD: METRO — high price, lower yield, stronger capital growth ──
  {
    id: 1, market: 'metro', city: 'Sydney',
    flavour: 'Crown jewel — eye-watering price, blue-chip capital growth',
    propType: 'house',
    price: 950000,
    yieldMin: 0.034, yieldMax: 0.048,
    growthMin: 0.030, growthMax: 0.120,
    renoUpside: 0.15, risk: 'high', vacancy: 0.03,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 2, market: 'metro', city: 'Melbourne',
    flavour: 'Cultural capital — volatile but prestigious Inner West warehouse',
    propType: 'warehouse',
    price: 820000,
    yieldMin: 0.036, yieldMax: 0.050,
    growthMin: 0.020, growthMax: 0.105,
    renoUpside: 0.12, risk: 'high', vacancy: 0.04,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 3, market: 'metro', city: 'Brisbane',
    flavour: 'River city on the rise — infrastructure spending everywhere',
    propType: 'house',
    price: 680000,
    yieldMin: 0.040, yieldMax: 0.058,
    growthMin: 0.040, growthMax: 0.090,
    renoUpside: 0.18, risk: 'medium', vacancy: 0.04,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 4, market: 'metro', city: 'Perth',
    flavour: 'Mining cycle rides — boom and bust but highest upsides',
    propType: 'house',
    price: 590000,
    yieldMin: 0.042, yieldMax: 0.060,
    growthMin: 0.030, growthMax: 0.090,
    renoUpside: 0.20, risk: 'medium', vacancy: 0.05,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 5, market: 'metro', city: 'Gold Coast',
    flavour: 'Tourist trap or cash cow? Airbnb & holiday demand year-round',
    propType: 'apartment',
    price: 720000,
    yieldMin: 0.038, yieldMax: 0.058,
    growthMin: 0.030, growthMax: 0.092,
    renoUpside: 0.22, risk: 'medium', vacancy: 0.05,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 6, market: 'metro', city: 'Adelaide',
    flavour: 'Underrated gem — consistent demand, lower competition',
    propType: 'house',
    price: 540000,
    yieldMin: 0.040, yieldMax: 0.058,
    growthMin: 0.030, growthMax: 0.082,
    renoUpside: 0.20, risk: 'medium', vacancy: 0.05,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 21, market: 'metro', city: 'Canberra',
    flavour: 'Public servant paradise — stable government tenants, steady income',
    propType: 'house',
    price: 760000,
    yieldMin: 0.040, yieldMax: 0.056,
    growthMin: 0.030, growthMax: 0.080,
    renoUpside: 0.14, risk: 'medium', vacancy: 0.03,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 22, market: 'metro', city: 'Hobart',
    flavour: 'Island escape — short-term rental boom meets old-world charm',
    propType: 'cottage',
    price: 620000,
    yieldMin: 0.038, yieldMax: 0.056,
    growthMin: 0.025, growthMax: 0.078,
    renoUpside: 0.18, risk: 'medium', vacancy: 0.04,
    rarity: 'standard', renovated: false, developed: false
  },

  // ── STANDARD: REGIONAL — lower entry, higher yield, volatile growth ──
  {
    id: 7, market: 'regional', city: 'Ballarat',
    flavour: 'Gold rush history meets modern tree-change growth story',
    propType: 'house',
    price: 380000,
    yieldMin: 0.055, yieldMax: 0.075,
    growthMin: 0.018, growthMax: 0.060,
    renoUpside: 0.25, risk: 'medium', vacancy: 0.07,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 8, market: 'regional', city: 'Toowoomba',
    flavour: 'Garden city — inland tree-change magnet with strong ag economy',
    propType: 'house',
    price: 340000,
    yieldMin: 0.055, yieldMax: 0.076,
    growthMin: 0.016, growthMax: 0.055,
    renoUpside: 0.22, risk: 'medium', vacancy: 0.08,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 9, market: 'regional', city: 'Bunbury',
    flavour: 'WA resource town — high yield potential, high vacancy risk',
    propType: 'house',
    price: 310000,
    yieldMin: 0.060, yieldMax: 0.090,
    growthMin: 0.008, growthMax: 0.075,
    renoUpside: 0.28, risk: 'high', vacancy: 0.09,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 10, market: 'regional', city: 'Wagga Wagga',
    flavour: 'Inland NSW hub — RAAF base drives solid tenant demand',
    propType: 'house',
    price: 290000,
    yieldMin: 0.060, yieldMax: 0.090,
    growthMin: 0.006, growthMax: 0.060,
    renoUpside: 0.30, risk: 'high', vacancy: 0.10,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 11, market: 'regional', city: 'Bendigo',
    flavour: 'Inland Vic gem — hospital and university anchor solid demand',
    propType: 'house',
    price: 360000,
    yieldMin: 0.055, yieldMax: 0.075,
    growthMin: 0.018, growthMax: 0.058,
    renoUpside: 0.26, risk: 'medium', vacancy: 0.07,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 12, market: 'regional', city: 'Launceston',
    flavour: 'Tasmanian treasure — tourism boom meets heritage property',
    propType: 'cottage',
    price: 320000,
    yieldMin: 0.060, yieldMax: 0.088,
    growthMin: 0.008, growthMax: 0.068,
    renoUpside: 0.30, risk: 'high', vacancy: 0.09,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 13, market: 'regional', city: 'Mackay',
    flavour: 'Sugar & coal town — big commodity cycles = big variance',
    propType: 'house',
    price: 275000,
    yieldMin: 0.060, yieldMax: 0.092,
    growthMin: 0.004, growthMax: 0.070,
    renoUpside: 0.35, risk: 'high', vacancy: 0.12,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 14, market: 'regional', city: 'Geraldton',
    flavour: 'Mid-West WA outpost — spectacular yield, spectacular risk',
    propType: 'house',
    price: 260000,
    yieldMin: 0.062, yieldMax: 0.095,
    growthMin: 0.004, growthMax: 0.065,
    renoUpside: 0.35, risk: 'high', vacancy: 0.13,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 23, market: 'regional', city: 'Newcastle',
    flavour: 'Steel city reinvented as lifestyle hub — Sydney commuter belt',
    propType: 'house',
    price: 420000,
    yieldMin: 0.055, yieldMax: 0.074,
    growthMin: 0.022, growthMax: 0.065,
    renoUpside: 0.22, risk: 'medium', vacancy: 0.06,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 24, market: 'regional', city: 'Sunshine Coast',
    flavour: 'South-east Qld hotspot — beach lifestyle drives premium rents',
    propType: 'house',
    price: 450000,
    yieldMin: 0.052, yieldMax: 0.072,
    growthMin: 0.026, growthMax: 0.068,
    renoUpside: 0.20, risk: 'medium', vacancy: 0.06,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 25, market: 'regional', city: 'Albury',
    flavour: 'Border town dual-state catchment — Hume Highway Fixer Upper',
    propType: 'house',
    price: 300000,
    yieldMin: 0.058, yieldMax: 0.078,
    growthMin: 0.015, growthMax: 0.050,
    renoUpside: 0.28, risk: 'medium', vacancy: 0.08,
    rarity: 'standard', renovated: false, developed: false
  },
  {
    id: 26, market: 'regional', city: 'Bathurst',
    flavour: 'Race city heritage — university and hospital anchor demand',
    propType: 'house',
    price: 330000,
    yieldMin: 0.058, yieldMax: 0.078,
    growthMin: 0.016, growthMax: 0.052,
    renoUpside: 0.27, risk: 'medium', vacancy: 0.08,
    rarity: 'standard', renovated: false, developed: false
  },

  // ── PREMIUM — better stats, higher price ──
  {
    id: 27, market: 'metro', city: 'Lane Cove Duplex',
    flavour: 'Blue-ribbon North Shore duplex — two incomes, one investment',
    propType: 'duplex',
    price: 1100000,
    yieldMin: 0.048, yieldMax: 0.065,
    growthMin: 0.045, growthMax: 0.110,
    renoUpside: 0.20, risk: 'medium', vacancy: 0.02,
    rarity: 'premium', renovated: false, developed: false
  },
  {
    id: 28, market: 'metro', city: 'Teneriffe Terrace',
    flavour: "Converted heritage woolstore — Brisbane's most coveted inner suburb",
    propType: 'terrace',
    price: 980000,
    yieldMin: 0.050, yieldMax: 0.068,
    growthMin: 0.050, growthMax: 0.115,
    renoUpside: 0.25, risk: 'medium', vacancy: 0.02,
    rarity: 'premium', renovated: false, developed: false
  },
  {
    id: 29, market: 'regional', city: 'Byron Bay Cottage',
    flavour: 'Hinterland escape with coastal premium — lifestyle meets income',
    propType: 'cottage',
    price: 720000,
    yieldMin: 0.065, yieldMax: 0.088,
    growthMin: 0.050, growthMax: 0.120,
    renoUpside: 0.30, risk: 'medium', vacancy: 0.04,
    rarity: 'premium', renovated: false, developed: false
  },

  // ── RARE — significantly better stats, serious price ──
  {
    id: 30, market: 'metro', city: 'South Yarra Heritage',
    flavour: "Art Deco gem in Melbourne's prestige belt — waiting list of tenants",
    propType: 'heritage-house',
    price: 1650000,
    yieldMin: 0.050, yieldMax: 0.072,
    growthMin: 0.060, growthMax: 0.140,
    renoUpside: 0.22, risk: 'low', vacancy: 0.01,
    rarity: 'rare', renovated: false, developed: false
  },
  {
    id: 31, market: 'metro', city: 'Cottesloe Beach House',
    flavour: "Perth's finest ocean-front strip — never sits vacant for long",
    propType: 'beach-house',
    price: 1800000,
    yieldMin: 0.052, yieldMax: 0.075,
    growthMin: 0.055, growthMax: 0.150,
    renoUpside: 0.18, risk: 'low', vacancy: 0.01,
    rarity: 'rare', renovated: false, developed: false
  },
  {
    id: 32, market: 'regional', city: 'Noosa Hinterland Estate',
    flavour: 'Acreage retreat 20 min from Hastings St — rare landholding',
    propType: 'estate',
    price: 1200000,
    yieldMin: 0.068, yieldMax: 0.095,
    growthMin: 0.058, growthMax: 0.130,
    renoUpside: 0.35, risk: 'low', vacancy: 0.03,
    rarity: 'rare', renovated: false, developed: false
  },

  // ── LEGENDARY — exceptional stats, trophy assets ──
  {
    id: 33, market: 'metro', city: 'Bondi Penthouse',
    flavour: 'The crown jewel of Australian real estate — views, prestige, permanence',
    propType: 'penthouse',
    price: 2500000,
    yieldMin: 0.055, yieldMax: 0.080,
    growthMin: 0.055, growthMax: 0.170,
    renoUpside: 0.15, risk: 'low', vacancy: 0.01,
    rarity: 'legendary', renovated: false, developed: false
  },
  {
    id: 34, market: 'metro', city: 'Toorak Manor',
    flavour: "Melbourne's most exclusive address — old money, new returns",
    propType: 'manor',
    price: 3000000,
    yieldMin: 0.050, yieldMax: 0.075,
    growthMin: 0.060, growthMax: 0.155,
    renoUpside: 0.12, risk: 'low', vacancy: 0.01,
    rarity: 'legendary', renovated: false, developed: false
  },
];

// ============================================================
// WHEEL CARD DECKS
// Replaces EVENT_CARDS + BANK_POLICIES from the hot-seat version.
// One wheel spin per year (at year start). Weighted draw:
//   Economic Event  35% — affects all players
//   Market Change   30% — modifies lending/market conditions
//   Market Influence 25% — private PvP card dealt to spinning player
//   Chance          10% — personal wildcard benefit
// ============================================================

// ── Economic Events (35% weight) — replaces EVENT_CARDS ──
// Effects mirror existing applyEventEffect() switch cases
const WHEEL_ECONOMIC_EVENTS = [
  {
    id: 'we1', title: 'Rate Hike Shock',
    text: 'The RBA raises the cash rate. All player interest rates increase by 0.25%.',
    effect: 'allRateRise', value: 0.0025
  },
  {
    id: 'we2', title: 'Rental Boom',
    text: 'Strong migration drives rents up. All metro property rents increase by 10%.',
    effect: 'metroRentBoost', value: 0.10
  },
  {
    id: 'we3', title: 'Regional Vacancy Spike',
    text: "A local employer closes. Each player's lowest-rent regional property sits vacant this year.",
    effect: 'regionalVacancy'
  },
  {
    id: 'we4', title: 'Infrastructure Boom',
    text: 'New rail announced. All regional properties gain 5% extra value growth this year.',
    effect: 'regionalGrowth', value: 0.05
  },
  {
    id: 'we5', title: 'Council Rates Surge',
    text: 'Councils increase rates. All players pay $2,000 in additional holding costs.',
    effect: 'allFlatCost', value: 2000
  },
  {
    id: 'we6', title: 'Property Boom',
    text: 'FOMO grips the market. All property values increase by 5%.',
    effect: 'allValueBoost', value: 0.05
  },
  {
    id: 'we7', title: 'Tenant Dispute',
    text: 'A tenant stops paying. The player with the most properties loses 1 month of rent from their highest-rent property.',
    effect: 'tenantDispute'
  },
  {
    id: 'we8', title: 'Insurance Premium Surge',
    text: 'Climate risk repricing. All players pay $1,500 per property they own.',
    effect: 'insuranceCost', value: 1500
  },
  {
    id: 'we9', title: 'Rate Cut Surprise',
    text: 'The RBA cuts rates. All player interest rates decrease by 0.25%.',
    effect: 'allRateCut', value: 0.0025
  },
  {
    id: 'we10', title: 'Salary Bonus',
    text: 'Strong economy — all players receive a $10,000 cash bonus.',
    effect: 'allCashBonus', value: 10000
  },
  {
    id: 'we11', title: 'Renovation Grants',
    text: 'Government incentive: any renovation next year costs half price for all players.',
    effect: 'renoDiscount'
  },
  {
    id: 'we12', title: 'Flood Event',
    text: 'Flooding hits regional areas. Players with regional properties each pay $5,000 in repairs.',
    effect: 'regionalDamage', value: 5000
  },
  {
    id: 'we13', title: 'Market Correction',
    text: 'Prices drop 3% across the board.',
    effect: 'allValueDrop', value: 0.03
  },
  {
    id: 'we14', title: 'Foreign Investment Surge',
    text: 'Offshore buyers compete in metro markets. Metro purchase prices increase 8% this year.',
    effect: 'metroPriceInflation', value: 0.08
  },
  // ── Rare: Urgent Sale — triggers open auction (all players bid) ──
  {
    id: 'we15', title: 'Urgent Sale!',
    text: 'A distressed seller lists 25% below market. All players bid — highest wins.',
    effect: 'urgentSale', discount: 0.25, rarity: 'rare'
  },
  {
    id: 'we16', title: 'Estate Fire Sale',
    text: 'An estate property hits the market 30% below value. Bid now or miss out.',
    effect: 'urgentSale', discount: 0.30, rarity: 'rare'
  },
  {
    id: 'we17', title: 'Mortgagee Sale',
    text: 'A bank repossession listed 20% below market value. Competitive bidding only.',
    effect: 'urgentSale', discount: 0.20, rarity: 'rare'
  },
  {
    id: 'we18', title: 'National Housing Crisis',
    text: 'Nationwide downturn. All property values drop 5%.',
    effect: 'allValueDrop', value: 0.05
  },
  {
    id: 'we19', title: 'Strata Fee Surge',
    text: 'Body corporates hike levies. All players pay $3,000.',
    effect: 'allFlatCost', value: 3000
  },
  {
    id: 'we20', title: 'Construction Delays',
    text: 'Supply chain crisis. All active renovations and developments delayed +1 year.',
    effect: 'upgradeDelay'
  },
  {
    id: 'we21', title: 'Luxury Market Slump',
    text: 'High-end market softens. Properties valued above $800k lose 10% value.',
    effect: 'luxuryValueDrop', value: 0.10
  },
  {
    id: 'we22', title: 'Tenant Vandalism',
    text: "Problem tenants strike. Each player's cheapest property under $400k loses 8% value.",
    effect: 'tenantDamage', value: 0.08
  },
];

// ── Market Changes (30% weight) — replaces BANK_POLICIES ──
// Effects mirror existing applyBankPolicy() switch cases
const WHEEL_MARKET_CHANGES = [
  {
    id: 'wm1', title: 'LVR Cap Tightened',
    text: 'APRA reduces max LVR to 70%. All new purchases require a 30% deposit.',
    effect: 'lvrCap', value: 0.30, rounds: 2
  },
  {
    id: 'wm2', title: 'Regional Lending Freeze',
    text: 'Banks stop lending on regional properties for 2 years.',
    effect: 'regionalFreeze', rounds: 2
  },
  {
    id: 'wm3', title: 'Serviceability Buffer Up',
    text: 'APRA tightens the buffer. Income multiplier drops from 0.70 to 0.65 for 2 years.',
    effect: 'bufferIncrease', multiplier: 0.65, rounds: 2
  },
  {
    id: 'wm4', title: 'Rate Rise — 0.5%',
    text: 'The RBA raises by 50 basis points. All player interest rates increase by 0.5%.',
    effect: 'policyRateRise', value: 0.005, rounds: 0
  },
  {
    id: 'wm5', title: 'Investor Lending Cap',
    text: 'Banks cap investor lending. Players with 3+ properties cannot buy for 2 years.',
    effect: 'investorCap', threshold: 3, rounds: 2
  },
  {
    id: 'wm6', title: 'Stress Test Rate Up',
    text: 'Serviceability assessed at loan rate + 3% (up from +2%) for 2 years.',
    effect: 'stressTestUp', buffer: 0.03, rounds: 2
  },
  {
    id: 'wm7', title: 'Rate Cut — 0.25%',
    text: 'The RBA eases. All player interest rates decrease by 0.25%.',
    effect: 'policyRateCut', value: 0.0025, rounds: 0
  },
  {
    id: 'wm8', title: 'Normal Conditions',
    text: 'Market conditions return to baseline. All active restrictions lifted.',
    effect: 'normalise', rounds: 0
  },
];

// ── Market Influence Cards (25% weight) — new PvP cards, private to spinning player ──
// Player holds these in hand (max 3). Played anytime on opponents.
// Effects are applied via playInfluenceCard() server-side.
const WHEEL_INFLUENCE_CARDS = [
  {
    id: 'wi1', title: 'Vacancy Strike',
    text: "File a tenant complaint. Target player's chosen property goes vacant next year.",
    effect: 'vacancyStrike',
    targetType: 'opponent-property',  // requires target playerIdx + property ownedId
    flavour: 'A well-timed complaint to the tenancy board never hurts.'
  },
  {
    id: 'wi2', title: 'Rent Sabotage',
    text: "Bad press campaign. Reduce target player's highest-rent property rent by 25% for 1 year.",
    effect: 'rentSabotage',
    targetType: 'opponent',           // requires target playerIdx only
    flavour: 'One Glassdoor review and suddenly no one wants to live there.'
  },
  {
    id: 'wi3', title: 'Rate Spike',
    text: "Tip off the bank. Add +0.5% to target player's interest rate for 1 year.",
    effect: 'rateSpike',
    targetType: 'opponent',
    flavour: "A word in the right ear at their lender's risk department."
  },
  {
    id: 'wi4', title: 'Media Campaign',
    text: "Negative press. Halve target player's salary savings next year.",
    effect: 'mediaCampaign',
    targetType: 'opponent',
    flavour: 'Nothing kills a career like a well-placed story.'
  },
  {
    id: 'wi5', title: 'Council Objection',
    text: "Block a development. If target player has a property under renovation, double its remaining cost.",
    effect: 'councilObjection',
    targetType: 'opponent',
    flavour: 'Heritage overlay objection lodged — your reno just got complicated.'
  },
  {
    id: 'wi6', title: 'Spec Bubble',
    text: "Fuel market speculation. All metro property prices increase 6% this year — great if you own metro.",
    effect: 'specBubble',
    targetType: 'market',             // affects market, not a specific player
    flavour: 'Buy the rumour, sell the news.'
  },
  {
    id: 'wi7', title: 'Insider Deal',
    text: "Tip from a contact. A premium property appears in the market at 15% below its listed price — for you only.",
    effect: 'insiderDeal',
    targetType: 'self',               // personal benefit, no opponent targeting
    flavour: 'It pays to know the right people at the right auction house.'
  },
  {
    id: 'wi8', title: 'Tenant Poach',
    text: "Recruit their best tenant. Reduce target player's highest-rent property rent by 30% for 1 year.",
    effect: 'tenantPoach',
    targetType: 'opponent',
    flavour: 'You offered better carpet and a dishwasher. They moved.'
  },
];

// ── Chance Cards (10% weight) — personal wildcard benefits ──
const WHEEL_CHANCE_CARDS = [
  {
    id: 'wc1', title: 'Cash Windfall',
    text: 'Unexpected inheritance. Receive $15,000 cash.',
    effect: 'cashWindfall', value: 15000,
    flavour: 'Great-uncle Bruce finally updated his will.'
  },
  {
    id: 'wc2', title: 'Rate Discount',
    text: 'Loyalty bonus from your lender. Your interest rate drops by 0.5% for 1 year.',
    effect: 'personalRateDiscount', value: 0.005,
    flavour: 'Turns out 15 years of on-time payments does count for something.'
  },
  {
    id: 'wc3', title: 'Free Renovation',
    text: 'Government grant secured. Your next renovation costs nothing.',
    effect: 'freeReno',
    flavour: 'Heritage restoration subsidy, no questions asked.'
  },
  {
    id: 'wc4', title: 'Deal Alert',
    text: 'Off-market find. A randomly selected property is added to the market at 20% off — only visible to you for one turn.',
    effect: 'dealAlert', discount: 0.20,
    flavour: 'Agent called you first. Be quick.'
  },
  {
    id: 'wc5', title: 'Salary Jump',
    text: 'Promotion. Your salary increases by 10% permanently.',
    effect: 'salaryJump', value: 0.10,
    flavour: "They finally recognised what you've been doing for the past three years."
  },
  {
    id: 'wc6', title: 'Rent Surge',
    text: 'Strong leasing season. All your properties get a 15% rent increase this year.',
    effect: 'personalRentSurge', value: 0.15,
    flavour: 'Spring listings dried up. Demand is yours.'
  },
];

// ── Wheel weights for server-side spin ──
// Used in game-engine.js spinWheel()
const WHEEL_WEIGHTS = {
  economicEvent:    0.35,
  marketChange:     0.30,
  marketInfluence:  0.25,
  chance:           0.10,
};
