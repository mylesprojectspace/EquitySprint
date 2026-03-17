// ============================================================
// EQUITY SPRINT ONLINE — Game Engine (Server-Side)
// Migrated from Equity Sprint (hot-seat) game.js
// All render/DOM code removed. Game logic only.
// ============================================================

'use strict';

const {
  PROPERTIES,
  WHEEL_ECONOMIC_EVENTS,
  WHEEL_MARKET_CHANGES,
  WHEEL_INFLUENCE_CARDS,
  WHEEL_CHANCE_CARDS,
  WHEEL_WEIGHTS,
} = require('./data-server');

// ============================================================
// Constants
// ============================================================

const WIN_TARGET            = 1_000_000;
const MAX_YEARS             = 10;
const BASE_INTEREST_RATE    = 0.065;
const BASE_INCOME_MULT      = 0.70;
const BASE_DEPOSIT_RATE     = 0.20;
const BASE_STRESS_BUFFER    = 0.02;
const LIVING_EXPENSE_RATE   = 0.60;
const RENO_COST_MULT        = 0.08;   // legacy flat rate (used by Classic preset)
const RENO_VALUE_MULT       = 0.50;   // v1.4.0: value uplift = 50% of rent uplift
const RENO_COST_BY_RARITY   = { standard: 0.08, premium: 0.10, rare: 0.12, legendary: 0.15 };
const EQUITY_DEPOSIT_OFFSET = 0.50;   // v1.4.0: 50% of accessible equity offsets deposit
const MIN_DEPOSIT_RATE      = 0.10;   // v1.4.0: hard floor even with equity offset
const RENO_VARIANCE         = { low: 0.15, medium: 0.30, high: 0.50 };
const DEVELOP_COST_MULT     = 0.15;
const DEVELOP_SUCCESS       = 0.60;
const DEBT_REDUCE_MIN       = 10000;
const STARTING_CASH         = 80000;
const STARTING_SALARY       = 95000;
const MARKET_VARIATION      = 0.10;
const METRO_MARKET_SIZE     = 4;
const REGIONAL_MARKET_SIZE  = 5;
const BID_MIN_INCREMENT     = 5000;
const CHEAP_PRICE_THRESHOLD = 400_000;
const CHEAP_GROWTH_PENALTY  = 0.06;
const CHEAP_VACANCY_BONUS   = 0.10;
const SALARY_GROWTH_RATE    = 0.03;
const INFLUENCE_HAND_MAX    = 3;

// Manager: flat annual fee 0–10000 → vacancy reduction up to 10%
const MANAGER_FEE_MAX           = 10000;
const MANAGER_VACANCY_MAX_REDUCTION = 0.10;

const RISK_GROWTH_MULT = { low: 0.6, medium: 1.0, high: 1.5 };

// ============================================================
// v1.4.0: DEFAULT_CONFIG — all balance constants as configurable defaults
// Standard mode = DEFAULT_CONFIG. Custom mode overrides specific values.
// ============================================================

const DEFAULT_CONFIG = {
  startingCash:        80000,
  startingSalary:      95000,
  winTarget:           1000000,
  maxYears:            10,
  actionsPerSlot:      2,
  baseInterestRate:    0.065,
  baseDepositRate:     0.20,
  renoValueMult:       0.50,
  renoCostByRarity:    { standard: 0.08, premium: 0.10, rare: 0.12, legendary: 0.15 },
  renoCooldown:        true,
  equityDepositOffset: 0.50,
  minDepositRate:      0.10,
  rarityGuarantees:    true,
  extendedEventDeck:   true,
  wheelEvents:         true,
  influenceCards:      true,
  marketSize:          9,
  maxProperties:       Infinity,
  growthMultiplier:    'standard',
  botDifficulty:       'standard',
};

// ============================================================
// Utility
// ============================================================

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmt(n) { return Math.round(n || 0).toLocaleString('en-AU'); }

function effectiveGrowthRange(prop) {
  const mid      = (prop.growthMin + prop.growthMax) / 2;
  const halfRange = (prop.growthMax - prop.growthMin) / 2;
  const mult     = RISK_GROWTH_MULT[prop.risk] || 1.0;
  const effMin   = Math.max(mid - halfRange * mult, -0.15);
  const effMax   = mid + halfRange * mult;
  return { effMin, effMax };
}

// ============================================================
// Player Factory
// ============================================================

function createPlayer(name, id, avatarIdx = 1) {
  return {
    id, name, avatarIdx,
    salary:            STARTING_SALARY,   // overridden by cfg in initGame
    cash:              STARTING_CASH,     // overridden by cfg in initGame
    properties:        [],
    totalDebt:         0,
    interestRate:      BASE_INTEREST_RATE, // overridden by cfg in initGame
    rentalIncome:      0,
    annualRepayments:  0,
    serviceability:    0,
    netPassiveIncome:  0,
    netWorth:          0,
    blocked:           false,
    rentHalvedNextRound:    false,
    renoDiscountNextRound:  false,
    freeRenoNextRound:      false,    // chance card: free renovation
    personalRateDiscount:   0,        // chance card: temporary rate reduction
    personalRateDiscountYears: 0,
    _yearRecap: null,
  };
}

// ============================================================
// Fresh Restrictions
// ============================================================

function freshRestrictions(cfg) {
  return {
    depositRate:          (cfg && cfg.baseDepositRate) || BASE_DEPOSIT_RATE,
    incomeMultiplier:     BASE_INCOME_MULT,
    stressBuffer:         BASE_STRESS_BUFFER,
    regionalFreeze:       false,
    investorCap:          false,
    investorCapThreshold: 3,
    metroPriceInflation:  0,
  };
}

// ============================================================
// Game State Init
// ============================================================

function initGame(names, botSlots = [], avatarIdxs = [], gameConfig = null) {
  // Merge custom config over defaults (Standard mode = null = use defaults)
  const cfg = gameConfig ? { ...DEFAULT_CONFIG, ...gameConfig } : { ...DEFAULT_CONFIG };
  // Handle nested renoCostByRarity merge
  if (gameConfig && gameConfig.renoCostByRarity) {
    cfg.renoCostByRarity = { ...DEFAULT_CONFIG.renoCostByRarity, ...gameConfig.renoCostByRarity };
  }

  const startingPlayer = Math.floor(Math.random() * names.length);
  const G = {
    year:              1,
    currentPlayerIdx:  startingPlayer,
    yearSlot:          0,
    firstThisYear:     startingPlayer,
    phase:             'wheelSpin',     // game starts with a wheel spin before year 1
    actionsUsedThisSlot: 0,            // counts paid actions used in current turn (max 2)
    cfg,                               // v1.4.0: merged game config
    players:           names.map((name, id) => {
      const p = createPlayer(name, id, avatarIdxs[id] || (id + 1));
      p.isBot = !!(botSlots[id]);
      p.salary = cfg.startingSalary;
      p.cash   = cfg.startingCash;
      p.interestRate = cfg.baseInterestRate;
      return p;
    }),
    market:            { metro: [], regional: [] },
    wheelDeck:         buildWheelDeck(),
    activeMarketChange: null,           // replaces activeBankPolicy
    marketChangeYearsLeft: 0,
    activeRestrictions: freshRestrictions(cfg),
    log:               [],
    pendingWheelResult: null,           // { category, card } — drawn, awaiting ack
    pendingAuction:    null,
    winner:            null,
    _ownedIdSeq:       0,
    // Per-player private data (NOT sent in public state)
    influenceHands:    names.map(() => []),   // Array[N] of influence card arrays
    // Wheel spin state
    wheelSpun:         false,
    wheelResult:       null,            // last spin result for display
    // Deal alert state (private per-player market listing)
    dealAlertListings: names.map(() => null), // one private deal per player
  };

  generateMarket(G);
  G.players.forEach(p => recalcPlayer(G, p));  // initialise stats without awarding year-1 salary early
  addLog(G, 'Game started. Spin the wheel before Year 1 begins!');
  return G;
}

// ============================================================
// Wheel System
// ============================================================

function buildWheelDeck() {
  // Pre-shuffle each category
  return {
    economicEvents: shuffle([...WHEEL_ECONOMIC_EVENTS]),
    marketChanges:  shuffle([...WHEEL_MARKET_CHANGES]),
    influence:      shuffle([...WHEEL_INFLUENCE_CARDS]),
    chance:         shuffle([...WHEEL_CHANCE_CARDS]),
  };
}

function drawFromDeck(deck, pool) {
  if (deck.length === 0) {
    const newDeck = shuffle([...pool]);
    deck.push(...newDeck);
  }
  return deck.pop();
}

// Weighted random category pick
function spinWheel(G, spinnerIdx) {
  const roll = Math.random();
  let category;
  if      (roll < WHEEL_WEIGHTS.economicEvent)   category = 'economicEvent';
  else if (roll < WHEEL_WEIGHTS.economicEvent + WHEEL_WEIGHTS.marketChange) category = 'marketChange';
  else if (roll < WHEEL_WEIGHTS.economicEvent + WHEEL_WEIGHTS.marketChange + WHEEL_WEIGHTS.marketInfluence) category = 'marketInfluence';
  else    category = 'chance';

  let card;
  switch (category) {
    case 'economicEvent':
      card = drawFromDeck(G.wheelDeck.economicEvents, WHEEL_ECONOMIC_EVENTS);
      break;
    case 'marketChange':
      card = drawFromDeck(G.wheelDeck.marketChanges, WHEEL_MARKET_CHANGES);
      break;
    case 'marketInfluence':
      card = drawFromDeck(G.wheelDeck.influence, WHEEL_INFLUENCE_CARDS);
      break;
    case 'chance':
      card = drawFromDeck(G.wheelDeck.chance, WHEEL_CHANCE_CARDS);
      break;
  }

  G.wheelSpun = true;
  G.wheelResult = { category, card, spinnerIdx };

  addLog(G, `WHEEL SPIN [${G.players[spinnerIdx].name}]: ${category} — ${card.title}`);

  // Apply effects that resolve immediately
  if (category === 'economicEvent') {
    if (card.effect === 'urgentSale') {
      // Urgent sale: triggers auction — handled after wheel ack
      G.pendingWheelResult = { category, card, spinnerIdx };
    } else {
      applyEconomicEventEffect(G, card);
      G.pendingWheelResult = { category, card, spinnerIdx };
    }
  } else if (category === 'marketChange') {
    applyMarketChange(G, card);
    G.pendingWheelResult = { category, card, spinnerIdx };
  } else if (category === 'marketInfluence') {
    // Deal influence card to player's hand (private)
    dealInfluenceCard(G, spinnerIdx, card);
    G.pendingWheelResult = { category, card, spinnerIdx };
  } else if (category === 'chance') {
    applyChanceCard(G, spinnerIdx, card);
    G.pendingWheelResult = { category, card, spinnerIdx };
  }

  return { category, card, spinnerIdx };
}

function dealInfluenceCard(G, playerIdx, card) {
  const hand = G.influenceHands[playerIdx];
  if (hand.length >= INFLUENCE_HAND_MAX) {
    // Discard oldest card if at max
    hand.shift();
    addLog(G, `${G.players[playerIdx].name}'s influence hand was full — oldest card discarded.`);
  }
  hand.push({ ...card, _handId: `h${Date.now()}_${Math.random().toString(36).slice(2,6)}` });
  addLog(G, `${G.players[playerIdx].name} received a Market Influence card.`);
}

// Called when spinning player acknowledges the wheel result
function acknowledgeWheelResult(G) {
  const result = G.pendingWheelResult;
  if (!result) return;

  G.pendingWheelResult = null;

  if (result.category === 'economicEvent' && result.card.effect === 'urgentSale') {
    startAuction(G, result.card);
    return;  // auction flow handles transition to year start
  }

  continueToYearStart(G);
}

// ============================================================
// Influence Card System
// ============================================================

function playInfluenceCard(G, playerIdx, handId, targetPlayerIdx, targetOwnedId) {
  const hand = G.influenceHands[playerIdx];
  const cardIdx = hand.findIndex(c => c._handId === handId);
  if (cardIdx === -1) return { ok: false, reason: 'Card not found in hand.' };

  const card = hand[cardIdx];
  const result = applyInfluenceEffect(G, card, playerIdx, targetPlayerIdx, targetOwnedId);
  if (!result.ok) return result;

  // Remove from hand after successful play
  hand.splice(cardIdx, 1);
  addLog(G, `${G.players[playerIdx].name} played Market Influence: ${card.title}`);
  return { ok: true, card, playedByIdx: playerIdx, targetPlayerIdx: targetPlayerIdx ?? null };
}

function applyInfluenceEffect(G, card, playerIdx, targetPlayerIdx, targetOwnedId) {
  const target = targetPlayerIdx !== undefined ? G.players[targetPlayerIdx] : null;

  switch (card.effect) {
    case 'vacancyStrike': {
      if (!target) return { ok: false, reason: 'Target player required.' };
      const prop = target.properties.find(p => p._ownedId === targetOwnedId);
      if (!prop) return { ok: false, reason: 'Target property not found.' };
      prop.vacantThisRound = true;
      addLog(G, `Vacancy Strike: ${target.name}'s ${prop.city} will be vacant this year.`);
      return { ok: true };
    }

    case 'rentSabotage': {
      if (!target || !target.properties.length) return { ok: false, reason: 'Target has no properties.' };
      const highest = target.properties.reduce((m, p) => p.currentRent > m.currentRent ? p : m, target.properties[0]);
      highest.currentRent = Math.round(highest.currentRent * 0.75);
      recalcPlayer(G, target);
      addLog(G, `Rent Sabotage: ${target.name}'s ${highest.city} rent reduced by 25%.`);
      return { ok: true };
    }

    case 'rateSpike': {
      if (!target) return { ok: false, reason: 'Target player required.' };
      target.interestRate += 0.005;
      target._rateSpikeYearsLeft = 1;
      recalcPlayer(G, target);
      addLog(G, `Rate Spike: ${target.name}'s interest rate +0.5% for 1 year.`);
      return { ok: true };
    }

    case 'mediaCampaign': {
      if (!target) return { ok: false, reason: 'Target player required.' };
      target.rentHalvedNextRound = true;
      addLog(G, `Media Campaign: ${target.name}'s rent will be halved next year.`);
      return { ok: true };
    }

    case 'councilObjection': {
      if (!target) return { ok: false, reason: 'Target player required.' };
      const renovating = target.properties.find(p => p._renovating);
      if (!renovating) return { ok: false, reason: 'Target has no renovation in progress.' };
      // Double the cost already paid; deduct extra from their cash
      const extraCostRate = RENO_COST_BY_RARITY[renovating.rarity] ?? RENO_COST_BY_RARITY.standard;
      const extraCost = Math.round(renovating.currentValue * extraCostRate);
      if (target.cash < extraCost) {
        // Partial — take what they have
        target.cash = 0;
        addLog(G, `Council Objection: ${target.name} ran out of cash covering extra reno costs on ${renovating.city}.`);
      } else {
        target.cash -= extraCost;
        addLog(G, `Council Objection: ${target.name} paid extra $${fmt(extraCost)} on ${renovating.city} renovation.`);
      }
      recalcPlayer(G, target);
      return { ok: true };
    }

    case 'specBubble': {
      G.players.forEach(p => {
        p.properties.filter(pr => pr.market === 'metro').forEach(pr => {
          pr.currentValue = Math.round(pr.currentValue * 1.06);
        });
        recalcPlayer(G, p);
      });
      addLog(G, `Speculation Bubble: all metro property values +6%.`);
      return { ok: true };
    }

    case 'insiderDeal': {
      const self = G.players[playerIdx];
      const base = PROPERTIES[Math.floor(Math.random() * PROPERTIES.length)];
      const listing = makeMarketListing(base, G.year);
      listing.price = Math.round(listing.price * 0.85);
      listing.rent  = Math.round(listing.price * (base.yieldMin + Math.random() * (base.yieldMax - base.yieldMin)));
      listing.isDeal = true;
      listing.dealDiscountPct = 15;
      listing._lid = `insider_y${G.year}_${Math.random().toString(36).slice(2,6)}`;
      listing._insiderDealFor = playerIdx;
      G.dealAlertListings[playerIdx] = listing;
      addLog(G, `${self.name} got an insider deal tip — ${listing.city} at 15% below market.`);
      return { ok: true };
    }

    case 'tenantPoach': {
      if (!target || !target.properties.length) return { ok: false, reason: 'Target has no properties.' };
      const highest = target.properties.reduce((m, p) => p.currentRent > m.currentRent ? p : m, target.properties[0]);
      highest.currentRent = Math.round(highest.currentRent * 0.70);
      recalcPlayer(G, target);
      addLog(G, `Tenant Poach: ${target.name}'s ${highest.city} rent reduced by 30%.`);
      return { ok: true };
    }

    default:
      return { ok: false, reason: `Unknown influence effect: ${card.effect}` };
  }
}

// ============================================================
// Chance Card Effects
// ============================================================

function applyChanceCard(G, playerIdx, card) {
  const p = G.players[playerIdx];
  switch (card.effect) {
    case 'cashWindfall':
      p.cash += card.value;
      addLog(G, `${p.name} received $${fmt(card.value)} windfall (Chance).`);
      break;

    case 'personalRateDiscount':
      p.personalRateDiscount = card.value;
      p.personalRateDiscountYears = 1;
      p.interestRate = Math.max(0.03, p.interestRate - card.value);
      recalcPlayer(G, p);
      addLog(G, `${p.name} gets -${(card.value * 100).toFixed(2)}% interest rate for 1 year (Chance).`);
      break;

    case 'freeReno':
      p.freeRenoNextRound = true;
      addLog(G, `${p.name} gets one free renovation (Chance).`);
      break;

    case 'dealAlert': {
      const base = PROPERTIES[Math.floor(Math.random() * PROPERTIES.length)];
      const listing = makeMarketListing(base, G.year);
      listing.price = Math.round(listing.price * (1 - card.discount));
      listing.rent  = Math.round(listing.price * (base.yieldMin + Math.random() * (base.yieldMax - base.yieldMin)));
      listing.isDeal = true;
      listing.dealDiscountPct = Math.round(card.discount * 100);
      listing._lid = `dealert_y${G.year}_${Math.random().toString(36).slice(2,6)}`;
      listing._dealAlertFor = playerIdx;
      G.dealAlertListings[playerIdx] = listing;
      addLog(G, `${p.name} got a private deal alert — ${listing.city} at ${listing.dealDiscountPct}% off.`);
      break;
    }

    case 'salaryJump':
      p.salary = Math.round(p.salary * (1 + card.value));
      recalcPlayer(G, p);
      addLog(G, `${p.name}'s salary increased ${(card.value * 100).toFixed(0)}% permanently (Chance).`);
      break;

    case 'personalRentSurge':
      p.properties.forEach(pr => { pr.currentRent = Math.round(pr.currentRent * (1 + card.value)); });
      recalcPlayer(G, p);
      addLog(G, `${p.name}'s rent increased ${(card.value * 100).toFixed(0)}% this year (Chance).`);
      break;
  }
}

// ============================================================
// Market Generation
// ============================================================

function generateMarket(G) {
  const yearFactor   = G ? G.year : 1;
  const allBase      = [...PROPERTIES];
  const metroBase    = allBase.filter(p => p.market === 'metro');
  const regionalBase = allBase.filter(p => p.market === 'regional');

  const metroSize    = Math.ceil(METRO_MARKET_SIZE    * G.players.length / 2);
  const regionalSize = Math.ceil(REGIONAL_MARKET_SIZE * G.players.length / 2);

  if (yearFactor === 1) {
    const lowMetro    = metroBase.filter(p => p.risk === 'low' && p.rarity === 'standard');
    const lowRegional = regionalBase.filter(p => p.risk === 'low' && p.rarity === 'standard');
    const otherMetro  = shuffle(metroBase.filter(p => p.risk !== 'low' && p.rarity === 'standard'));
    const otherReg    = shuffle(regionalBase.filter(p => p.risk !== 'low' && p.rarity === 'standard'));
    const metroPool    = [...shuffle(lowMetro).slice(0, 2), ...otherMetro].slice(0, metroSize);
    const regionalPool = [...shuffle(lowRegional).slice(0, 2), ...otherReg].slice(0, regionalSize);
    G.market.metro    = metroPool.map(p => makeMarketListing(p, yearFactor));
    G.market.regional = regionalPool.map(p => makeMarketListing(p, yearFactor));
    return;
  }

  function pickWithRarity(pool, size) {
    const listings  = [];
    let legendaryUsed = false;
    const available = shuffle([...pool]);
    const byRarity  = {
      legendary: available.filter(p => p.rarity === 'legendary'),
      rare:      available.filter(p => p.rarity === 'rare'),
      premium:   available.filter(p => p.rarity === 'premium'),
      standard:  available.filter(p => p.rarity === 'standard'),
    };

    // v1.4.0: Year 7+ raises legendary roll threshold to 15%
    const legendaryThreshold = yearFactor >= 7 ? 0.15 : 0.10;

    for (let i = 0; i < size; i++) {
      let chosen = null;
      const roll = Math.random();
      if (!legendaryUsed && roll < legendaryThreshold && byRarity.legendary.length) {
        chosen = byRarity.legendary.splice(Math.floor(Math.random() * byRarity.legendary.length), 1)[0];
        legendaryUsed = true;
      } else if (roll < 0.25 && byRarity.rare.length) {
        chosen = byRarity.rare.splice(Math.floor(Math.random() * byRarity.rare.length), 1)[0];
      } else if (roll < 0.50 && byRarity.premium.length) {
        chosen = byRarity.premium.splice(Math.floor(Math.random() * byRarity.premium.length), 1)[0];
      }
      if (!chosen) {
        const fallback = byRarity.standard.length ? byRarity.standard
          : (byRarity.premium.length ? byRarity.premium
          : (byRarity.rare.length ? byRarity.rare
          : byRarity.legendary));
        if (fallback.length) chosen = fallback.splice(Math.floor(Math.random() * fallback.length), 1)[0];
      }
      if (chosen) listings.push(makeMarketListing(chosen, yearFactor));
    }
    return listings;
  }

  G.market.metro    = pickWithRarity(metroBase, metroSize);
  G.market.regional = pickWithRarity(regionalBase, regionalSize);

  // v1.4.0: Progressive rarity guarantees
  const combined = [...G.market.metro, ...G.market.regional];
  function ensureRarity(requiredRarity) {
    if (combined.some(l => l.rarity === requiredRarity)) return;
    // Find a source property of the required rarity
    const source = allBase.filter(p => p.rarity === requiredRarity);
    if (!source.length) return;
    const pick = source[Math.floor(Math.random() * source.length)];
    const listing = makeMarketListing(pick, yearFactor);
    // Replace lowest-value standard listing
    let lowestIdx = -1, lowestVal = Infinity, lowestIn = null;
    G.market.metro.forEach((l, i) => { if (l.rarity === 'standard' && l.price < lowestVal) { lowestVal = l.price; lowestIdx = i; lowestIn = 'metro'; } });
    G.market.regional.forEach((l, i) => { if (l.rarity === 'standard' && l.price < lowestVal) { lowestVal = l.price; lowestIdx = i; lowestIn = 'regional'; } });
    if (lowestIdx >= 0 && lowestIn) {
      G.market[lowestIn][lowestIdx] = listing;
    } else {
      // No standard to replace — just add it
      if (pick.market === 'metro') G.market.metro.push(listing);
      else G.market.regional.push(listing);
    }
  }

  const guaranteesOn = G.cfg ? G.cfg.rarityGuarantees !== false : true;
  if (guaranteesOn) {
    if (yearFactor >= 3) ensureRarity('premium');
    if (yearFactor >= 5) ensureRarity('rare');
    if (yearFactor >= 7) ensureRarity('rare'); // rare always guaranteed at 7+
  }

  // 80% chance: discounted deal property
  if (Math.random() < 0.80) {
    const base = allBase[Math.floor(Math.random() * allBase.length)];
    const listing = makeMarketListing(base, yearFactor);
    const discountPct = 0.10 + Math.random() * 0.10;
    listing.price = Math.round(listing.price * (1 - discountPct));
    listing.rent  = Math.round(listing.price * (base.yieldMin + Math.random() * (base.yieldMax - base.yieldMin)));
    listing.isDeal = true;
    listing.dealDiscountPct = Math.round(discountPct * 100);
    listing._lid = `deal_y${yearFactor}_${Math.random().toString(36).slice(2, 6)}`;
    if (base.market === 'metro') G.market.metro.push(listing);
    else G.market.regional.push(listing);
  }
}

function makeMarketListing(base, yearFactor) {
  const effectiveGrowth = (base.growthMin + base.growthMax) / 2;
  const growth    = Math.pow(1 + effectiveGrowth, yearFactor - 1);
  const variation = (1 - MARKET_VARIATION) + Math.random() * (MARKET_VARIATION * 2);
  const price     = Math.round(base.price * growth * variation);
  const yieldRate = base.yieldMin + Math.random() * (base.yieldMax - base.yieldMin);
  const rent      = Math.round(price * yieldRate);
  return {
    ...base,
    price, rent,
    _lid: `${base.id}_y${yearFactor}_${Math.random().toString(36).slice(2, 6)}`,
    renovated: false, developed: false, vacantThisRound: false,
  };
}

// ============================================================
// Core Calculations
// ============================================================

function recalcPlayer(G, p) {
  p.rentalIncome     = p.properties.reduce((s, pr) => {
    if (pr.vacantThisRound) return s;
    if (pr._renovating) return s + Math.round(pr.currentRent / 4); // v1.4.0: 1/4 rent during reno
    return s + pr.currentRent;
  }, 0);
  p.annualRepayments = p.properties.reduce((s, pr) => s + pr.debt * p.interestRate, 0);
  p.totalDebt        = p.properties.reduce((s, pr) => s + pr.debt, 0);
  const mult         = G.activeRestrictions.incomeMultiplier;
  p.serviceability   = (p.salary + p.rentalIncome) * mult - p.annualRepayments;
  p.netPassiveIncome = p.rentalIncome - p.annualRepayments;
  p.netWorth         = Math.round(p.cash + p.properties.reduce((s, pr) => s + pr.currentValue - pr.debt, 0));
  p.blocked          = p.serviceability < 0;
}

function projectedServiceability(G, player, additionalLoan) {
  const mult       = G.activeRestrictions.incomeMultiplier;
  const stressRate = player.interestRate + G.activeRestrictions.stressBuffer;
  const newRepay   = additionalLoan * stressRate;
  return (player.salary + player.rentalIncome) * mult - (player.annualRepayments + newRepay);
}

function canBuyProperty(G, player, prop, overridePrice) {
  const r         = G.activeRestrictions;
  const basePrice = overridePrice !== undefined ? overridePrice : prop.price;
  const inflation  = prop.market === 'metro' ? r.metroPriceInflation : 0;
  const price      = Math.round(basePrice * (1 + inflation));
  const baseDeposit = Math.round(price * r.depositRate);

  // v1.4.0: Equity-based deposit offset (configurable)
  const eqOffset = G.cfg ? G.cfg.equityDepositOffset : EQUITY_DEPOSIT_OFFSET;
  const minDepRate = G.cfg ? G.cfg.minDepositRate : MIN_DEPOSIT_RATE;
  const existingEquity = player.properties.reduce(
    (s, pr) => s + Math.max(0, Math.floor(pr.currentValue * 0.80) - pr.debt), 0
  );
  const equityOffset = eqOffset > 0 ? Math.floor(existingEquity * eqOffset) : 0;
  const minDeposit   = Math.round(price * minDepRate);
  const deposit      = Math.max(minDeposit, baseDeposit - equityOffset);
  const loanAmount   = price - deposit;

  if (player.cash < deposit)
    return { ok: false, reason: `Need $${fmt(deposit)} deposit — only have $${fmt(player.cash)}` };
  if (r.regionalFreeze && prop.market === 'regional')
    return { ok: false, reason: 'Market Policy: Regional lending frozen' };
  if (r.investorCap && player.properties.length >= r.investorCapThreshold)
    return { ok: false, reason: `Market Policy: Investor cap (max ${r.investorCapThreshold} properties)` };

  const svc = projectedServiceability(G, player, loanAmount);
  if (svc < 0)
    return { ok: false, reason: `Serviceability fails — projected $${fmt(svc)} after purchase` };

  return { ok: true, price, deposit, loanAmount };
}

// ============================================================
// Actions
// ============================================================

function actionBuy(G, playerIdx, lid) {
  const player = G.players[playerIdx];
  if (playerIdx !== G.currentPlayerIdx) return { ok: false, reason: 'Not your turn.' };

  // Check deal alert listing first, then main market
  const dealListing = G.dealAlertListings[playerIdx];
  let prop = null;
  if (dealListing && dealListing._lid === lid) {
    prop = dealListing;
  } else {
    prop = [...G.market.metro, ...G.market.regional].find(p => p._lid === lid);
  }
  if (!prop) return { ok: false, reason: 'Property no longer available.' };
  if (G.actionsUsedThisSlot >= maxActionsPerSlot(G)) return { ok: false, reason: 'No actions remaining this turn.' };

  const check = canBuyProperty(G, player, prop);
  if (!check.ok) return check;

  executeBuy(G, player, prop, check);
  G.actionsUsedThisSlot++;

  // Remove listing from market
  G.market.metro    = G.market.metro.filter(p => p._lid !== lid);
  G.market.regional = G.market.regional.filter(p => p._lid !== lid);
  if (G.dealAlertListings[playerIdx] && G.dealAlertListings[playerIdx]._lid === lid) {
    G.dealAlertListings[playerIdx] = null;
  }

  addLog(G, `${player.name} bought ${prop.city} for $${fmt(check.price)} (deposit $${fmt(check.deposit)}, loan $${fmt(check.loanAmount)})`);
  checkWin(G);
  return {
    ok: true,
    icon: '🏠', title: 'Property Purchased!',
    lines: [
      `Deposit paid: $${fmt(check.deposit)}`,
      `New rental income: +$${fmt(prop.rent)}/yr`,
      `Net passive: $${fmt(player.rentalIncome - player.annualRepayments)}/yr`,
    ]
  };
}

function executeBuy(G, player, prop, check) {
  const owned = {
    ...prop,
    purchasePrice:   check.price,
    currentValue:    check.price,
    currentRent:     prop.rent,
    debt:            check.loanAmount,
    vacantThisRound: false,
    managerFee:      0,
    depositPaid:     check.deposit,
    extraSpent:      0,
    _ownedId:        ++G._ownedIdSeq,
    _purchaseYear:   G.year,
  };
  player.cash -= check.deposit;
  player.properties.push(owned);
  recalcPlayer(G, player);
}

function actionReduceDebt(G, playerIdx, oid, amount) {
  const player = G.players[playerIdx];
  if (playerIdx !== G.currentPlayerIdx) return { ok: false, reason: 'Not your turn.' };

  amount = parseInt(amount);
  if (isNaN(amount) || amount < DEBT_REDUCE_MIN)
    return { ok: false, reason: `Minimum debt reduction is $${fmt(DEBT_REDUCE_MIN)}` };

  const prop = player.properties.find(p => p._ownedId === oid);
  if (!prop) return { ok: false, reason: 'Property not found.' };
  if (player.cash < amount) return { ok: false, reason: `Not enough cash — have $${fmt(player.cash)}` };
  if (amount > prop.debt) amount = prop.debt;
  if (G.actionsUsedThisSlot >= maxActionsPerSlot(G)) return { ok: false, reason: 'No actions remaining this turn.' };

  player.cash -= amount;
  prop.debt   -= amount;
  G.actionsUsedThisSlot++;
  recalcPlayer(G, player);

  addLog(G, `${player.name} paid $${fmt(amount)} off ${prop.city} debt. Remaining: $${fmt(prop.debt)}`);
  return {
    ok: true,
    icon: '📉', title: 'Debt Reduced!',
    lines: [
      `Paid off: $${fmt(amount)}`,
      `Remaining debt on ${prop.city}: $${fmt(prop.debt)}`,
      `Interest saved: $${fmt(Math.round(amount * player.interestRate))}/yr`,
    ]
  };
}

function actionRenovate(G, playerIdx, oid) {
  const player = G.players[playerIdx];
  if (playerIdx !== G.currentPlayerIdx) return { ok: false, reason: 'Not your turn.' };

  const prop = player.properties.find(p => p._ownedId === oid);
  if (!prop)          return { ok: false, reason: 'Property not found.' };
  if (prop.renovated)   return { ok: false, reason: `${prop.city} has already been renovated.` };
  if (prop._renovating) return { ok: false, reason: `${prop.city} renovation already in progress.` };
  if (prop._developing) return { ok: false, reason: `${prop.city} is currently being developed. Wait for it to complete first.` };
  // v1.4.0: Configurable reno cooldown
  const renoCooldown = G.cfg ? G.cfg.renoCooldown : true;
  if (renoCooldown && prop._purchaseYear && G.year <= prop._purchaseYear)
    return { ok: false, reason: `${prop.city} was purchased this year — renovations available from Year ${prop._purchaseYear + 1}.` };

  if (G.actionsUsedThisSlot >= maxActionsPerSlot(G)) return { ok: false, reason: 'No actions remaining this turn.' };

  const renoCosts = G.cfg ? G.cfg.renoCostByRarity : RENO_COST_BY_RARITY;
  const baseCostRate = renoCosts[prop.rarity] ?? renoCosts.standard;
  let cost = player.freeRenoNextRound ? 0 : Math.round(prop.currentValue * baseCostRate);
  if (player.renoDiscountNextRound) cost = Math.round(cost * 0.5);
  if (player.cash < cost) return { ok: false, reason: `Renovation costs $${fmt(cost)} — only have $${fmt(player.cash)}.` };

  player.cash     -= cost;
  prop.extraSpent  = (prop.extraSpent || 0) + cost;
  player.renoDiscountNextRound = false;
  player.freeRenoNextRound     = false;
  // Duration: 1 year (low risk) or 2 years (medium/high risk, 50% chance)
  const renoDuration = (prop.risk === 'low' || Math.random() < 0.5) ? 1 : 2;
  prop._renovating       = true;
  prop._renoYear         = G.year;
  prop._renoCompleteYear = G.year + renoDuration;
  G.actionsUsedThisSlot++;

  recalcPlayer(G, player);
  addLog(G, `${player.name} started renovation on ${prop.city}. Cost $${fmt(cost)}. Est. ${renoDuration} year(s).`);
  return {
    ok: true,
    icon: '🔨', title: 'Renovation Started!',
    lines: [
      cost === 0 ? 'FREE renovation (Chance card)!' : `Cost paid: $${fmt(cost)}`,
      `${prop.city} is under construction`,
      `No rent collected during renovation`,
      `Completes in ${renoDuration} year${renoDuration > 1 ? 's' : ''} (Year ${G.year + renoDuration})`,
    ]
  };
}

function checkPendingRenovations(G, playerIdx) {
  const player     = G.players[playerIdx];
  const readyProps = player.properties.filter(p => {
    if (!p._renovating) return false;
    const completeYear = p._renoCompleteYear ?? (p._renoYear + 1);
    return G.year >= completeYear;
  });
  const results    = [];

  readyProps.forEach(prop => {
    const variance   = RENO_VARIANCE[prop.risk] ?? 0.30;
    const actualMult = (1 - variance) + Math.random() * (variance * 2);
    const renoValMult = G.cfg ? G.cfg.renoValueMult : RENO_VALUE_MULT;
    const rentBoost  = Math.round(prop.currentRent  * prop.renoUpside * actualMult);
    const valueBoost = Math.round(prop.currentValue * prop.renoUpside * renoValMult * actualMult);

    prop.currentRent  += rentBoost;
    prop.currentValue += valueBoost;
    prop.renovated        = true;
    prop._renovating      = false;
    prop._renoYear        = null;
    prop._renoCompleteYear = null;

    addLog(G, `${player.name}'s renovation on ${prop.city} complete: rent +$${fmt(rentBoost)}/yr, value +$${fmt(valueBoost)}.`);
    results.push({ prop: prop.city, rentBoost, valueBoost, actualMult });
  });

  recalcPlayer(G, player);
  checkWin(G);
  return results;
}

function actionSell(G, playerIdx, oid) {
  const player = G.players[playerIdx];
  if (playerIdx !== G.currentPlayerIdx) return { ok: false, reason: 'Not your turn.' };

  if (G.actionsUsedThisSlot >= maxActionsPerSlot(G)) return { ok: false, reason: 'No actions remaining this turn.' };

  const propIdx = player.properties.findIndex(p => p._ownedId === oid);
  if (propIdx === -1) return { ok: false, reason: 'Property not found.' };

  const prop     = player.properties[propIdx];
  const agentFee = Math.round(prop.currentValue * 0.025);
  const equity   = prop.currentValue - prop.debt - agentFee;

  player.cash += equity;
  G.actionsUsedThisSlot++;
  player.properties.splice(propIdx, 1);
  recalcPlayer(G, player);

  addLog(G, `${player.name} sold ${prop.city} — received $${fmt(equity)} equity (sale $${fmt(prop.currentValue)}, debt $${fmt(prop.debt)}, agent $${fmt(agentFee)}).`);
  checkWin(G);
  return {
    ok: true,
    icon: '💰', title: 'Property Sold!',
    lines: [
      `Equity received: $${fmt(equity)}`,
      `Rental income lost: -$${fmt(prop.currentRent)}/yr`,
      `Agent fee: $${fmt(agentFee)}`,
    ]
  };
}

function actionReleaseEquity(G, playerIdx, oid, amount) {
  const player = G.players[playerIdx];
  if (playerIdx !== G.currentPlayerIdx) return { ok: false, reason: 'Not your turn.' };

  const prop = player.properties.find(p => p._ownedId === oid);
  if (!prop) return { ok: false, reason: 'Property not found.' };

  amount = parseInt(amount);
  const maxEquity = Math.max(0, Math.floor(prop.currentValue * 0.80) - prop.debt);

  if (isNaN(amount) || amount < 10000)
    return { ok: false, reason: 'Minimum equity release is $10,000.' };
  if (amount > maxEquity)
    return { ok: false, reason: `Maximum equity release is $${fmt(maxEquity)} (80% LVR limit).` };

  const svc = projectedServiceability(G, player, amount);
  if (svc < 0)
    return { ok: false, reason: `Serviceability fails — projected $${fmt(svc)} after increase.` };
  if (G.actionsUsedThisSlot >= maxActionsPerSlot(G)) return { ok: false, reason: 'No actions remaining this turn.' };

  prop.debt   += amount;
  player.cash += amount;
  G.actionsUsedThisSlot++;
  recalcPlayer(G, player);

  addLog(G, `${player.name} released $${fmt(amount)} equity from ${prop.city}. New debt: $${fmt(prop.debt)}.`);
  checkWin(G);
  return {
    ok: true,
    icon: '💵', title: 'Equity Released!',
    lines: [
      `Cash received: +$${fmt(amount)}`,
      `New debt on ${prop.city}: $${fmt(prop.debt)}`,
      `Extra interest: $${fmt(Math.round(amount * player.interestRate))}/yr`,
    ]
  };
}

function actionDevelop(G, playerIdx, oid) {
  const player = G.players[playerIdx];
  if (playerIdx !== G.currentPlayerIdx) return { ok: false, reason: 'Not your turn.' };

  const prop = player.properties.find(p => p._ownedId === oid);
  if (!prop)            return { ok: false, reason: 'Property not found.' };
  if (prop.developed)   return { ok: false, reason: `${prop.city} already developed.` };
  if (prop._developing) return { ok: false, reason: `${prop.city} development already in progress.` };
  if (prop._renovating) return { ok: false, reason: `${prop.city} is currently being renovated. Finish the renovation first.` };
  if (prop.market !== 'regional') return { ok: false, reason: 'Development only on regional properties.' };
  if (G.actionsUsedThisSlot >= maxActionsPerSlot(G)) return { ok: false, reason: 'No actions remaining this turn.' };

  const baseCost = Math.round(prop.currentValue * DEVELOP_COST_MULT);
  if (player.cash < baseCost)
    return { ok: false, reason: `Development requires $${fmt(baseCost)} — only have $${fmt(player.cash)}` };

  // Duration: low risk = 1yr, medium = 2yr, high = 2 or 3yr (50/50)
  const devDuration = prop.risk === 'low' ? 1
    : prop.risk === 'high' ? (Math.random() < 0.5 ? 2 : 3)
    : 2;

  player.cash           -= baseCost;
  prop.extraSpent        = (prop.extraSpent || 0) + baseCost;
  prop._developing       = true;
  prop._devYear          = G.year;
  prop._devCompleteYear  = G.year + devDuration;
  G.actionsUsedThisSlot++;

  recalcPlayer(G, player);
  addLog(G, `${player.name} started development on ${prop.city}. Cost $${fmt(baseCost)}. Completes Year ${G.year + devDuration}.`);
  return {
    ok: true,
    icon: '🏗️', title: 'Development Started!',
    lines: [
      `Cost paid: $${fmt(baseCost)}`,
      `${prop.city} is under construction`,
      `60% chance of success on completion`,
      `Completes in ${devDuration} year${devDuration > 1 ? 's' : ''} (Year ${G.year + devDuration})`,
    ]
  };
}

function checkPendingDevelopments(G, playerIdx) {
  const player     = G.players[playerIdx];
  const readyProps = player.properties.filter(p => {
    if (!p._developing) return false;
    return G.year >= (p._devCompleteYear ?? (p._devYear + 2));
  });
  const results = [];

  readyProps.forEach(prop => {
    const success = Math.random() < DEVELOP_SUCCESS;
    if (success) {
      const rentBoost  = Math.round(prop.currentRent  * 0.40);
      const valueBoost = Math.round(prop.currentValue * 0.30);
      prop.currentRent  += rentBoost;
      prop.currentValue += valueBoost;
      prop.developed     = true;
      addLog(G, `${player.name}'s development on ${prop.city} succeeded: rent +$${fmt(rentBoost)}/yr, value +$${fmt(valueBoost)}.`);
      results.push({ prop: prop.city, success: true, rentBoost, valueBoost });
    } else {
      // v1.4.0: Failed development charges 50% cost overrun
      const baseCost = Math.round(prop.currentValue * DEVELOP_COST_MULT);
      const extraCost = Math.round(baseCost * 0.50);
      const actualExtra = Math.min(extraCost, player.cash);
      player.cash -= actualExtra;
      prop.extraSpent = (prop.extraSpent || 0) + actualExtra;
      addLog(G, `${player.name}'s development on ${prop.city} failed — 50% overrun cost $${fmt(actualExtra)}.`);
      results.push({ prop: prop.city, success: false, overrunCost: actualExtra });
    }
    prop._developing      = false;
    prop._devYear         = null;
    prop._devCompleteYear = null;
  });

  recalcPlayer(G, player);
  checkWin(G);
  return results;
}

function actionSetManager(G, playerIdx, oid, fee) {
  // Does NOT consume an action slot
  const player = G.players[playerIdx];
  if (playerIdx !== G.currentPlayerIdx) return { ok: false, reason: 'Not your turn.' };

  const prop = player.properties.find(p => p._ownedId === oid);
  if (!prop) return { ok: false, reason: 'Property not found.' };

  fee = Math.round(Math.min(MANAGER_FEE_MAX, Math.max(0, parseInt(fee) || 0)) / 500) * 500;
  // Cap at the fee that brings vacancy to 0 — paying more is wasteful
  const maxUsefulFee = Math.ceil((prop.vacancy / MANAGER_VACANCY_MAX_REDUCTION) * MANAGER_FEE_MAX / 500) * 500;
  fee = Math.min(fee, maxUsefulFee);
  prop.managerFee = fee;
  const feeLabel = fee === 0 ? 'None (removed)' : `$${fmt(fee)}/yr`;
  addLog(G, `${player.name} set ${prop.city} property manager fee to ${feeLabel}.`);
  return { ok: true, noSlot: true };
}

// ============================================================
// Slot System
// ============================================================

function maxActionsPerSlot(G)  { return G.cfg ? G.cfg.actionsPerSlot : 2; }
function totalSlots(G)         { return G.players.length * 2; }  // 2 turns per player per year
function slotPlayer(G, slot)   { return (G.firstThisYear + slot) % G.players.length; }

function endActionSlot(G) {
  G.actionsUsedThisSlot = 0;
  G.yearSlot++;

  // v1.4.0: H2 cash flow fires at midpoint of action slots
  const midSlot = Math.floor(totalSlots(G) / 2);
  if (G.yearSlot === midSlot && !G._h2Fired) {
    G._h2Fired = true;
    processAllPlayerCashFlow(G, 'H2');
    G.phase = 'midyear';
    G.currentPlayerIdx = slotPlayer(G, G.yearSlot);
    return;
  }

  if (G.yearSlot >= totalSlots(G)) {
    G._h2Fired = false; // reset for next year
    processYearEnd(G);
  } else {
    G.currentPlayerIdx = slotPlayer(G, G.yearSlot);
    G.phase = 'handoff';
  }
}

// ============================================================
// Year Flow
// ============================================================

// v1.4.0: half = 'H1' (year start — vacancy rolls, manager costs, full income/expense)
//         half = 'H2' (mid-year — second income/expense pass, no new vacancy roll)
function processAllPlayerCashFlow(G, half = 'H1') {
  G.players.forEach(p => {
    const vacancies = [];

    if (half === 'H1') {
      // H1: Roll vacancies, charge manager fees, expire rate effects
      p.properties.forEach(pr => {
        if (pr._renovating) {
          pr.vacantThisRound = false;
          pr._missedRent     = Math.round(pr.currentRent * 0.75); // v1.4.0: collect 1/4 rent during reno
          return;
        }
        const fee             = pr.managerFee || 0;
        const cheapFactor     = Math.max(0, (CHEAP_PRICE_THRESHOLD - pr.currentValue) / CHEAP_PRICE_THRESHOLD);
        const vacancyReduction = (fee / MANAGER_FEE_MAX) * MANAGER_VACANCY_MAX_REDUCTION;
        const baseVacancy     = Math.max(0, pr.vacancy - vacancyReduction);
        const effectiveVacancy = Math.min(0.95, baseVacancy + CHEAP_VACANCY_BONUS * cheapFactor);
        pr.vacantThisRound    = Math.random() < effectiveVacancy;
        pr._missedRent        = pr.vacantThisRound ? pr.currentRent : 0;
        if (pr.vacantThisRound) vacancies.push(pr.city);
      });

      // Manager costs: charged once per year at H1 only (0G verification)
      let managerCosts = 0;
      p.properties.forEach(pr => {
        const cost = pr.managerFee || 0;
        if (cost > 0) managerCosts += cost;
      });
      if (managerCosts > 0) {
        p.cash -= managerCosts;
        addLog(G, `${p.name}: Property manager fees $${fmt(managerCosts)}.`);
      }

      if (p.rentHalvedNextRound) {
        p._rentHalvedThisYear = true;
        p.rentHalvedNextRound = false;
        addLog(G, `${p.name}: Rent halved this year.`);
      }

      // Expire temporary rate effects (influence card rate spike)
      if (p._rateSpikeYearsLeft > 0) {
        p._rateSpikeYearsLeft--;
        if (p._rateSpikeYearsLeft === 0) {
          p.interestRate = Math.max(0, p.interestRate - 0.005);
          addLog(G, `${p.name}: Rate spike expired.`);
        }
      }

      // Expire personal rate discount (chance card)
      if (p.personalRateDiscountYears > 0) {
        p.personalRateDiscountYears--;
        if (p.personalRateDiscountYears === 0 && p.personalRateDiscount > 0) {
          p.interestRate = Math.max(0, p.interestRate + p.personalRateDiscount);
          p.personalRateDiscount = 0;
          addLog(G, `${p.name}: Rate discount expired.`);
        }
      }
    }

    // Both H1 and H2: collect half-year income and pay half-year expenses
    recalcPlayer(G, p);

    const halfLivingExpenses = Math.round((p.salary * LIVING_EXPENSE_RATE) / 2);
    const halfNetSavings     = Math.round(p.salary / 2) - halfLivingExpenses;
    let halfRentCollected    = p.properties.reduce((s, pr) => {
      if (pr.vacantThisRound) return s;
      if (pr._renovating) return s + Math.round(pr.currentRent / 4 / 2); // 1/4 of annual, halved
      return s + Math.round(pr.currentRent / 2);
    }, 0);

    if (p._rentHalvedThisYear) {
      halfRentCollected = Math.round(halfRentCollected / 2);
    }

    const halfInterestPaid = Math.round(p.annualRepayments / 2);
    p.cash += halfNetSavings + halfRentCollected - halfInterestPaid;
    recalcPlayer(G, p);

    if (half === 'H1') {
      // Store recap for year-start display (will be updated by H2)
      p._yearRecap = {
        netSavings: halfNetSavings, rentCollected: halfRentCollected,
        interestPaid: halfInterestPaid, managerCosts: 0, vacancies,
        portfolioGrowthValue: p.properties.reduce((s, pr) => s + (pr._valueGain || 0), 0),
        totalMissedRent:      p.properties.reduce((s, pr) => s + (pr._missedRent || 0), 0)
      };
      // Store manager costs in recap
      let mc = 0; p.properties.forEach(pr => { mc += (pr.managerFee || 0); });
      p._yearRecap.managerCosts = mc;

      if (vacancies.length) addLog(G, `${p.name}: Vacant — ${vacancies.join(', ')}`);
      if (p.blocked) addLog(G, `⚠️ ${p.name} BLOCKED — serviceability negative.`);
    } else {
      // H2: accumulate into recap
      if (p._yearRecap) {
        p._yearRecap.netSavings    += halfNetSavings;
        p._yearRecap.rentCollected += halfRentCollected;
        p._yearRecap.interestPaid  += halfInterestPaid;
      }
      // Clear rent halved flag at end of year
      p._rentHalvedThisYear = false;
    }
  });
}

function processYearEnd(G) {
  G.year++;

  const maxYears = G.cfg ? G.cfg.maxYears : MAX_YEARS;
  if (G.year > maxYears) {
    endGame(G);
    return;
  }

  G.activeRestrictions.metroPriceInflation = 0;

  G.players.forEach(p => { p.salary = Math.round(p.salary * (1 + SALARY_GROWTH_RATE)); });

  // Apply annual growth + reset vacancy
  G.players.forEach(p => {
    p.properties.forEach(pr => {
      const mid        = (pr.growthMin + pr.growthMax) / 2;
      const halfRange  = (pr.growthMax - pr.growthMin) / 2;
      const mult       = RISK_GROWTH_MULT[pr.risk] || 1.0;
      const cheapFactor  = Math.max(0, (CHEAP_PRICE_THRESHOLD - pr.currentValue) / CHEAP_PRICE_THRESHOLD);
      const floorPenalty = CHEAP_GROWTH_PENALTY * cheapFactor;
      const adjMin       = mid - halfRange * mult - floorPenalty;
      const adjMax       = mid + halfRange * mult;
      const rawGrowth    = adjMin + Math.random() * (adjMax - adjMin);
      const actualGrowth = Math.max(rawGrowth, -0.15);
      const valueGain    = Math.round(pr.currentValue * actualGrowth);
      pr._actualGrowth   = actualGrowth;
      pr._valueGain      = valueGain;
      pr.currentValue   += valueGain;
      pr.vacantThisRound = false;
    });
  });

  // Expire market change policy timer (replaces bank policy timer)
  if (G.activeMarketChange && G.marketChangeYearsLeft > 0) {
    G.marketChangeYearsLeft--;
    if (G.marketChangeYearsLeft === 0) {
      expireMarketChange(G, G.activeMarketChange);
      G.activeMarketChange = null;
      addLog(G, 'Market change expired — conditions back to normal.');
    }
  }

  // Rotate first player
  G.firstThisYear = (G.firstThisYear + 1) % G.players.length;

  generateMarket(G);

  // Wheel spin: reset for new year
  G.wheelSpun = false;
  G.wheelResult = null;
  G.phase = 'wheelSpin';
}

function continueToYearStart(G) {
  processAllPlayerCashFlow(G, 'H1');

  G.yearSlot = 0;
  G._h2Fired = false;
  G.currentPlayerIdx = G.firstThisYear;

  addLog(G, `--- Year ${G.year} begins --- (${G.players[G.firstThisYear].name} goes first)`);

  checkWin(G);
  if (G.phase !== 'gameover') {
    G.phase = 'yearstart';
  }
}

// ============================================================
// Economic Event Effects (migrated from applyEventEffect)
// ============================================================

function applyEconomicEventEffect(G, event) {
  addLog(G, `ECONOMIC EVENT: ${event.title} — ${event.text}`);

  switch (event.effect) {
    case 'allRateRise':
      G.players.forEach(p => { p.interestRate += event.value; recalcPlayer(G, p); });
      break;
    case 'allRateCut':
      G.players.forEach(p => { p.interestRate = Math.max(0.03, p.interestRate - event.value); recalcPlayer(G, p); });
      break;
    case 'metroRentBoost':
      G.players.forEach(p => {
        p.properties.filter(pr => pr.market === 'metro').forEach(pr => {
          pr.currentRent = Math.round(pr.currentRent * (1 + event.value));
        });
        recalcPlayer(G, p);
      });
      break;
    case 'regionalVacancy':
      G.players.forEach(p => {
        const reg = p.properties.filter(pr => pr.market === 'regional');
        if (reg.length) {
          const lowest = reg.reduce((m, pr) => pr.currentRent < m.currentRent ? pr : m, reg[0]);
          lowest.vacantThisRound = true;
          addLog(G, `${p.name}: ${lowest.city} vacant (event).`);
        }
      });
      break;
    case 'mediaFrenzy': {
      G.players.forEach(p => recalcPlayer(G, p));
      const target = G.players.reduce((max, p) => p.netWorth > max.netWorth ? p : max, G.players[0]);
      target.rentHalvedNextRound = true;
      addLog(G, `Media frenzy targets ${target.name} (highest net worth) — rent halved next year.`);
      break;
    }
    case 'regionalGrowth':
      G.players.forEach(p => {
        p.properties.filter(pr => pr.market === 'regional').forEach(pr => {
          pr.currentValue = Math.round(pr.currentValue * (1 + event.value));
        });
        recalcPlayer(G, p);
      });
      break;
    case 'allFlatCost':
      G.players.forEach(p => {
        p.cash = Math.max(0, p.cash - event.value);
        recalcPlayer(G, p);
      });
      break;
    case 'allValueBoost':
      G.players.forEach(p => {
        p.properties.forEach(pr => { pr.currentValue = Math.round(pr.currentValue * (1 + event.value)); });
        recalcPlayer(G, p);
      });
      break;
    case 'tenantDispute': {
      const most = G.players.reduce((m, p) => p.properties.length > m.properties.length ? p : m, G.players[0]);
      if (most.properties.length > 0) {
        const highest = most.properties.reduce((m, pr) => pr.currentRent > m.currentRent ? pr : m, most.properties[0]);
        const lost = Math.round(highest.currentRent / 12);
        most.cash = Math.max(0, most.cash - lost);
        recalcPlayer(G, most);
        addLog(G, `${most.name} loses $${fmt(lost)} (1 month rent from ${highest.city}).`);
      }
      break;
    }
    case 'insuranceCost':
      G.players.forEach(p => {
        const cost = p.properties.length * event.value;
        if (cost > 0) {
          p.cash = Math.max(0, p.cash - cost);
          recalcPlayer(G, p);
          addLog(G, `${p.name} pays $${fmt(cost)} insurance.`);
        }
      });
      break;
    case 'allCashBonus':
      G.players.forEach(p => { p.cash += event.value; });
      break;
    case 'renoDiscount':
      G.players.forEach(p => { p.renoDiscountNextRound = true; });
      addLog(G, 'All players get 50% off renovations next year.');
      break;
    case 'regionalDamage':
      G.players.forEach(p => {
        if (p.properties.some(pr => pr.market === 'regional')) {
          p.cash = Math.max(0, p.cash - event.value);
          recalcPlayer(G, p);
          addLog(G, `${p.name} pays $${fmt(event.value)} flood repairs.`);
        }
      });
      break;
    case 'allValueDrop':
      G.players.forEach(p => {
        p.properties.forEach(pr => { pr.currentValue = Math.round(pr.currentValue * (1 - event.value)); });
        recalcPlayer(G, p);
      });
      break;
    case 'metroPriceInflation':
      G.activeRestrictions.metroPriceInflation = event.value;
      addLog(G, `Metro purchase prices inflated by ${(event.value * 100).toFixed(0)}% this year.`);
      break;

    // v1.4.0: Ported from offline version
    case 'upgradeDelay':
      G.players.forEach(p => {
        p.properties.forEach(pr => {
          if (pr._renovating && pr._renoCompleteYear) {
            pr._renoCompleteYear++;
            addLog(G, `${p.name}: ${pr.city} renovation delayed +1 year (now Year ${pr._renoCompleteYear}).`);
          }
          if (pr._developing && pr._devCompleteYear) {
            pr._devCompleteYear++;
            addLog(G, `${p.name}: ${pr.city} development delayed +1 year (now Year ${pr._devCompleteYear}).`);
          }
        });
      });
      break;
    case 'luxuryValueDrop': {
      let affected = 0;
      G.players.forEach(p => {
        p.properties.forEach(pr => {
          if (pr.currentValue > 800000) {
            pr.currentValue = Math.round(pr.currentValue * (1 - event.value));
            affected++;
          }
        });
        recalcPlayer(G, p);
      });
      if (affected === 0) addLog(G, 'Luxury Market Slump: no properties above $800k — no effect.');
      break;
    }
    case 'tenantDamage': {
      let affected = 0;
      G.players.forEach(p => {
        const cheap = p.properties.filter(pr => pr.currentValue < 400000);
        if (cheap.length) {
          const cheapest = cheap.reduce((m, pr) => pr.currentValue < m.currentValue ? pr : m, cheap[0]);
          cheapest.currentValue = Math.round(cheapest.currentValue * (1 - event.value));
          addLog(G, `${p.name}: ${cheapest.city} damaged by tenants (-${(event.value * 100).toFixed(0)}% value).`);
          affected++;
        }
        recalcPlayer(G, p);
      });
      if (affected === 0) addLog(G, 'Tenant Vandalism: no properties under $400k — no effect.');
      break;
    }
  }
}

// ============================================================
// Market Change Effects (migrated from applyBankPolicy)
// ============================================================

function applyMarketChange(G, policy) {
  addLog(G, `MARKET CHANGE: ${policy.title} — ${policy.text}`);

  if (G.activeMarketChange && G.activeMarketChange.effect !== 'normalise') {
    expireMarketChange(G, G.activeMarketChange);
  }
  G.activeMarketChange    = policy;
  G.marketChangeYearsLeft = policy.rounds || 0;

  const r = G.activeRestrictions;
  switch (policy.effect) {
    case 'lvrCap':         r.depositRate = policy.value; break;
    case 'regionalFreeze': r.regionalFreeze = true; break;
    case 'bufferIncrease': r.incomeMultiplier = policy.multiplier; G.players.forEach(p => recalcPlayer(G, p)); break;
    case 'policyRateRise': G.players.forEach(p => { p.interestRate += policy.value; recalcPlayer(G, p); }); break;
    case 'investorCap':    r.investorCap = true; r.investorCapThreshold = policy.threshold; break;
    case 'stressTestUp':   r.stressBuffer = policy.buffer; break;
    case 'policyRateCut':  G.players.forEach(p => { p.interestRate = Math.max(0.03, p.interestRate - policy.value); recalcPlayer(G, p); }); break;
    case 'normalise':      normaliseRestrictions(G); break;
  }
}

function expireMarketChange(G, policy) {
  const r = G.activeRestrictions;
  switch (policy.effect) {
    case 'lvrCap':         r.depositRate = (G.cfg ? G.cfg.baseDepositRate : BASE_DEPOSIT_RATE); break;
    case 'regionalFreeze': r.regionalFreeze = false; break;
    case 'bufferIncrease': r.incomeMultiplier = BASE_INCOME_MULT; G.players.forEach(p => recalcPlayer(G, p)); break;
    case 'investorCap':    r.investorCap = false; break;
    case 'stressTestUp':   r.stressBuffer = BASE_STRESS_BUFFER; break;
    case 'policyRateRise': G.players.forEach(p => { p.interestRate = Math.max(0.03, p.interestRate - policy.value); recalcPlayer(G, p); }); break;
    case 'policyRateCut':  G.players.forEach(p => { p.interestRate += policy.value; recalcPlayer(G, p); }); break;
  }
}

function normaliseRestrictions(G) {
  G.activeRestrictions = freshRestrictions(G.cfg);
  G.players.forEach(p => recalcPlayer(G, p));
}

// ============================================================
// Auction System (unchanged logic)
// ============================================================

function pickAuctionProperty(G) {
  // v1.4.0: Year-weighted tier selection for urgent sales
  const year = G.year;
  let weights;
  if (year <= 3)      weights = { standard: 1.0, premium: 0, rare: 0, legendary: 0 };
  else if (year <= 6) weights = { standard: 0.60, premium: 0.30, rare: 0.10, legendary: 0 };
  else                weights = { standard: 0.40, premium: 0.30, rare: 0.20, legendary: 0.10 };

  const roll = Math.random();
  let targetRarity;
  if (roll < weights.legendary)                                          targetRarity = 'legendary';
  else if (roll < weights.legendary + weights.rare)                      targetRarity = 'rare';
  else if (roll < weights.legendary + weights.rare + weights.premium)    targetRarity = 'premium';
  else                                                                    targetRarity = 'standard';

  const pool = PROPERTIES.filter(p => p.rarity === targetRarity);
  if (pool.length === 0) return PROPERTIES[Math.floor(Math.random() * PROPERTIES.length)];
  return pool[Math.floor(Math.random() * pool.length)];
}

function startAuction(G, eventCard) {
  const base = pickAuctionProperty(G);
  const listing = makeMarketListing(base, G.year);
  const discountedPrice = Math.round(listing.price * (1 - eventCard.discount));

  G.pendingAuction = {
    property:       listing,
    originalPrice:  listing.price,
    discountedPrice,
    currentBid:     discountedPrice - BID_MIN_INCREMENT,
    currentBidder:  null,
    biddingTurn:    G.firstThisYear,
    passed:         Array(G.players.length).fill(false),
  };

  G.phase = 'auction';
  addLog(G, `URGENT SALE: ${listing.city} — starting at $${fmt(discountedPrice)} (was $${fmt(listing.price)})`);
}

function placeBid(G, playerIdx, bidAmount) {
  const auction = G.pendingAuction;
  bidAmount = parseInt(bidAmount);

  const minBid = auction.currentBid + BID_MIN_INCREMENT;
  if (isNaN(bidAmount) || bidAmount < minBid)
    return { ok: false, reason: `Minimum bid is $${fmt(minBid)}` };

  const player  = G.players[playerIdx];
  const deposit = Math.round(bidAmount * G.activeRestrictions.depositRate);
  if (player.cash < deposit)
    return { ok: false, reason: `Need $${fmt(deposit)} deposit for that bid — have $${fmt(player.cash)}` };

  const svc = projectedServiceability(G, player, bidAmount - deposit);
  if (svc < 0)
    return { ok: false, reason: `Serviceability fails at that bid (projected $${fmt(svc)})` };

  auction.currentBid    = bidAmount;
  auction.currentBidder = playerIdx;
  addLog(G, `${G.players[playerIdx].name} bids $${fmt(bidAmount)}`);

  const n = G.players.length;
  let next = (playerIdx + 1) % n;
  let steps = 0;
  while (auction.passed[next]) {
    next = (next + 1) % n;
    if (++steps >= n) { resolveAuction(G); return { ok: true }; }
  }
  if (next === playerIdx) { resolveAuction(G); return { ok: true }; }

  auction.biddingTurn = next;
  return { ok: true };
}

function passAuction(G, playerIdx) {
  const auction = G.pendingAuction;
  auction.passed[playerIdx] = true;
  addLog(G, `${G.players[playerIdx].name} passes.`);

  const n = G.players.length;
  let next = (playerIdx + 1) % n;
  let steps = 0;
  while (auction.passed[next] || next === auction.currentBidder) {
    next = (next + 1) % n;
    if (++steps >= n) {
      if (auction.currentBidder !== null) { resolveAuction(G); }
      else {
        addLog(G, 'Urgent Sale: no bids — property withdrawn.');
        G.pendingAuction = null;
        continueToYearStart(G);
      }
      return { ok: true };
    }
  }

  auction.biddingTurn = next;
  return { ok: true };
}

function resolveAuction(G) {
  const auction = G.pendingAuction;
  if (auction.currentBidder !== null) {
    const winner  = G.players[auction.currentBidder];
    const prop    = auction.property;
    const bid     = auction.currentBid;
    const deposit = Math.round(bid * G.activeRestrictions.depositRate);
    const loan    = bid - deposit;

    const svc = projectedServiceability(G, winner, loan);
    if (winner.cash >= deposit && svc >= 0) {
      executeBuy(G, winner, prop, { price: bid, deposit, loanAmount: loan });
      addLog(G, `${winner.name} wins the auction! Bought ${prop.city} for $${fmt(bid)}`);
    } else {
      addLog(G, `${winner.name} can no longer afford the winning bid — property withdrawn.`);
    }
  }

  G.pendingAuction = null;
  continueToYearStart(G);
}

// ============================================================
// Win / End Game
// ============================================================

// v1.4.0: Dismiss midyear summary → continue to next action slot
function dismissMidyear(G) {
  if (G.phase !== 'midyear') return;
  G.currentPlayerIdx = slotPlayer(G, G.yearSlot);
  G.phase = 'handoff';
}

function checkWin(G) {
  const target = G.cfg ? G.cfg.winTarget : WIN_TARGET;
  for (const p of G.players) {
    recalcPlayer(G, p);
    if (p.netWorth >= target) {
      G.phase  = 'gameover';
      G.winner = p;
      addLog(G, `${p.name} reached $${fmt(target)} net worth — WINS!`);
      return true;
    }
  }
  return false;
}

function endGame(G) {
  G.phase = 'gameover';
  const sorted = [...G.players].sort((a, b) => b.netWorth - a.netWorth);
  G.winner = sorted[0];
  const years = G.cfg ? G.cfg.maxYears : MAX_YEARS;
  addLog(G, `GAME OVER — ${years} years complete. Winner: ${G.winner.name} with $${fmt(G.winner.netWorth)} net worth!`);
}

// ============================================================
// Helpers
// ============================================================

function addLog(G, msg) {
  G.log.unshift(msg);
  if (G.log.length > 30) G.log.length = 30;
}

// ============================================================
// Public / Private State Views
// ============================================================

// Full public state — no influence hands
function getPublicState(G) {
  const state = { ...G };
  delete state.influenceHands;  // never sent in public broadcast
  delete state.dealAlertListings;
  return state;
}

// State slice for a specific player (includes their private data)
function getPrivateState(G, playerIdx) {
  return {
    influenceHand: G.influenceHands[playerIdx] || [],
    dealAlertListing: G.dealAlertListings[playerIdx] || null,
  };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Init
  initGame,
  // Turn flow
  endActionSlot,
  processYearEnd,
  continueToYearStart,
  // Wheel
  spinWheel,
  acknowledgeWheelResult,
  // Influence cards
  playInfluenceCard,
  // Renovation + development checks
  checkPendingRenovations,
  checkPendingDevelopments,
  // Actions
  actionBuy,
  actionReduceDebt,
  actionRenovate,
  actionSell,
  actionReleaseEquity,
  actionDevelop,
  actionSetManager,
  // Midyear
  dismissMidyear,
  // Auction
  placeBid,
  passAuction,
  // State views
  getPublicState,
  getPrivateState,
  // Config
  DEFAULT_CONFIG,
  maxActionsPerSlot,
  // Utils (needed by server)
  recalcPlayer,
  checkWin,
  slotPlayer,
  totalSlots,
};
