// ============================================================
// EQUITY SPRINT ONLINE — Client
// ============================================================
'use strict';

// ── State ──────────────────────────────────────────────────
let socket;
let myPlayerIdx  = null;
let myRoomId     = null;
let isHost       = false;
let G            = null;     // public game state
let myPrivate    = { influenceHand: [], dealAlertListing: null };
let clientPhase  = 'lobby';  // 'lobby' | 'waiting' | 'game'
let lastWheelResult  = null;
let pendingRenoResults  = null;
let amtModalCallback = null;
let logPanelOpen = false;
let influencePending = null;
let sidebarActiveTab = 'mine';
let sidebarDetailMode = false;  // false = simple, true = full details
let nwHistory     = {};      // playerIdx → { year: netWorth }
let rentHistory   = {};      // playerIdx → { year: rentalIncome }
let propValHistory = {};     // playerIdx → { year: totalPropValue }
let marketSortMode = 'default';
let slotActionTaken = false; // true if a free action was taken this slot (influences End Turn label)
const VALID_EMOTES  = ['angry', 'broke', 'confused', 'cry-laugh', 'shocked', 'wink'];

// ── Sound FX ───────────────────────────────────────────────
let soundMuted = false;
const SOUNDS = {
  buy:  new Audio('/assets/sound_fx/cha ching.mp3'),
  spin: new Audio('/assets/sound_fx/Game Wheel Spin Sound Effect.mp3'),
  win:  new Audio('/assets/sound_fx/victory.mp3'),
  error: new Audio('/assets/sound_fx/wrong buzz.mp3'),
};
let winSoundPlayed = false;
let lastActionBtn  = null;

function playSound(name) {
  if (soundMuted) return;
  const snd = SOUNDS[name];
  if (!snd) return;
  snd.currentTime = 0;
  snd.play().catch(() => {});
}

// Track last-clicked action button for shake on error
document.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (btn) lastActionBtn = btn;
}, true);

// ── Player colours & city coords ───────────────────────────
const PLAYER_COLORS = ['#4A90E2', '#7ED321', '#D0021B', '#F5A623'];

const CITY_COORDS = {
  // Metro
  'Sydney':         { x: 973,  y: 528 },
  'Melbourne':      { x: 963,  y: 616 },
  'Brisbane':       { x: 963,  y: 388 },
  'Perth':          { x: 360,  y: 490 },
  'Adelaide':       { x: 848,  y: 557 },
  'Gold Coast':     { x: 968,  y: 408 },
  'Hobart':         { x: 1060, y: 718 },
  'Darwin':         { x: 605,  y: 83  },
  'Canberra':       { x: 948,  y: 562 },
  // Regional
  'Newcastle':      { x: 975,  y: 488 },
  'Wollongong':     { x: 965,  y: 548 },
  'Geelong':        { x: 942,  y: 628 },
  'Ballarat':       { x: 930,  y: 614 },
  'Toowoomba':      { x: 948,  y: 400 },
  'Rockhampton':    { x: 952,  y: 305 },
  'Townsville':     { x: 895,  y: 220 },
  'Cairns':         { x: 883,  y: 155 },
  'Broken Hill':    { x: 865,  y: 510 },
  'Dubbo':          { x: 920,  y: 505 },
  // Metro suburbs
  'Bondi':          { x: 975,  y: 533 },
  'Lane Cove':      { x: 973,  y: 521 },
  'South Yarra':    { x: 963,  y: 622 },
  'Toorak':         { x: 966,  y: 625 },
  'Teneriffe':      { x: 963,  y: 394 },
  'Fremantle':      { x: 308,  y: 498 },
  'Cottesloe':      { x: 310,  y: 494 },
  // Regional extras
  'Sunshine Coast': { x: 963,  y: 370 },
  'Noosa':          { x: 960,  y: 363 },
  'Noosa Hinterland': { x: 958, y: 358 },
  'Byron Bay':      { x: 968,  y: 432 },
  'Bunbury':        { x: 318,  y: 548 },
  'Wagga Wagga':    { x: 930,  y: 577 },
  'Bendigo':        { x: 928,  y: 600 },
  'Launceston':     { x: 1055, y: 700 },
  'Mackay':         { x: 930,  y: 260 },
  'Geraldton':      { x: 305,  y: 393 },
  'Albury':         { x: 925,  y: 593 },
  'Bathurst':       { x: 938,  y: 550 },
};

// ── Prop type visuals (emoji fallback) ─────────────────────
const PROP_VISUALS = {
  'unit':          { emoji: '🏢' },
  'house':         { emoji: '🏠' },
  'apartment':     { emoji: '🏙️' },
  'duplex':        { emoji: '🏘️' },
  'cottage':       { emoji: '🏡' },
  'terrace':       { emoji: '🏛️' },
  'warehouse':     { emoji: '🏭' },
  'beach-house':   { emoji: '🏖️' },
  'estate':        { emoji: '🌳' },
  'penthouse':     { emoji: '🌆' },
  'manor':         { emoji: '🏰' },
  'heritage-house':{ emoji: '⛪' },
};

// ── City coord helpers ─────────────────────────────────────
function cityName(cityField) {
  return cityField.replace(/\s+(Unit|House|Apartment|Duplex|Cottage|Terrace|Warehouse|Beach-House|Estate|Penthouse|Manor|Heritage-House|Heritage\s+House|Heritage)$/i, '').trim();
}
function cityCoords(cityField) {
  if (CITY_COORDS[cityField]) return CITY_COORDS[cityField];
  const stripped = cityName(cityField);
  if (CITY_COORDS[stripped]) return CITY_COORDS[stripped];
  // Progressively try shorter names (e.g. "Cottesloe Beach" → "Cottesloe")
  const words = stripped.split(' ');
  for (let i = words.length - 1; i > 0; i--) {
    const candidate = words.slice(0, i).join(' ');
    if (CITY_COORDS[candidate]) return CITY_COORDS[candidate];
  }
  return { x: 690, y: 385 };
}

const CATEGORY_LABEL = {
  economicEvent:   'Economic Event',
  marketChange:    'Market Change',
  marketInfluence: 'Market Influence',
  chance:          'Chance',
};

const MANAGER_NAMES = ['None', 'Basic', 'Standard', 'Premium'];

// ── Formatters ─────────────────────────────────────────────
function fmt(n) {
  return '$' + Math.round(n || 0).toLocaleString('en-AU');
}
function fmtPct(n) {
  return (+(n * 100).toFixed(1)) + '%';
}
function sign(n) {
  return n >= 0 ? `+${fmt(n)}` : fmt(n);
}

// ── Screen management ──────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active');
  });
  const el = document.getElementById(id);
  el.style.display = 'flex';
  el.classList.add('active');
}

function showOverlay(id) {
  document.getElementById(id).classList.remove('hidden');
}
function hideOverlay(id) {
  document.getElementById(id).classList.add('hidden');
}
function hideAllOverlays() {
  ['overlay-wheel','overlay-yearstart','overlay-handoff','overlay-auction','overlay-gameover','overlay-reno']
    .forEach(id => hideOverlay(id));
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer = null;
function showToast(icon, title, lines) {
  const el = document.getElementById('toast-action');
  document.getElementById('toast-icon').textContent  = icon  || '✅';
  document.getElementById('toast-title').textContent = title || '';
  const linesEl = document.getElementById('toast-lines');
  linesEl.innerHTML = (lines || []).map(l => `<div class="toast-line">${l}</div>`).join('');
  el.classList.remove('hidden', 'hiding');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hiding');
    setTimeout(() => el.classList.add('hidden'), 260);
  }, 4000);
}

// ── Socket setup ───────────────────────────────────────────
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    if (clientPhase === 'game' && myRoomId) {
      socket.emit('request-state');
    }
  });

  socket.on('room-created', ({ roomId, playerIdx, maxPlayers }) => {
    myRoomId     = roomId;
    myPlayerIdx  = playerIdx;
    isHost       = true;
    clientPhase  = 'waiting';
    document.getElementById('room-code-value').textContent = roomId;
    showScreen('screen-waiting');
    renderPlayerSlots([{ name: document.getElementById('create-name').value.trim(), connected: true }], maxPlayers);
    updateWaitingStatus(1, maxPlayers);
    if (maxPlayers > 1) document.getElementById('btn-add-bot').classList.remove('hidden');
  });

  socket.on('room-joined', ({ roomId, playerIdx }) => {
    myRoomId    = roomId;
    myPlayerIdx = playerIdx;
    isHost      = false;
    clientPhase = 'waiting';
    showScreen('screen-waiting');
  });

  socket.on('lobby-update', ({ players, maxPlayers }) => {
    renderPlayerSlots(players, maxPlayers);
    const filled = players.filter(p => p.name).length;
    updateWaitingStatus(filled, maxPlayers);
    const startBtn = document.getElementById('btn-start-game');
    const addBotBtn = document.getElementById('btn-add-bot');
    if (isHost && filled === maxPlayers) {
      startBtn.classList.remove('hidden');
      addBotBtn.classList.add('hidden');
    } else {
      startBtn.classList.add('hidden');
      if (isHost && filled < maxPlayers) {
        addBotBtn.classList.remove('hidden');
      } else {
        addBotBtn.classList.add('hidden');
      }
    }
  });

  socket.on('game-state', (state) => {
    // Reset slotActionTaken when a slot ends (phase moves away from 'action')
    if (G && G.phase === 'action' && state.phase !== 'action') slotActionTaken = false;
    G = state;
    // Track net worth, rent, and property value history (client-side)
    G.players.forEach((p, i) => {
      if (!nwHistory[i])      nwHistory[i]      = {};
      if (!rentHistory[i])    rentHistory[i]    = {};
      if (!propValHistory[i]) propValHistory[i] = {};
      nwHistory[i][G.year]      = p.netWorth;
      rentHistory[i][G.year]    = p.rentalIncome || 0;
      propValHistory[i][G.year] = p.properties.reduce((s, pr) => s + (pr.currentValue || 0), 0);
    });
    if (clientPhase !== 'game') {
      clientPhase = 'game';
      showScreen('screen-game');
      initSidebarTabs();
    }
    renderGame();
  });

  socket.on('private-state', (priv) => {
    myPrivate = priv;
    renderBottomStrip();
  });

  socket.on('wheel-result', ({ category, card, spinnerIdx }) => {
    lastWheelResult = { category, card, spinnerIdx };
    renderWheelResult(category, card, spinnerIdx);
  });

  socket.on('action-result', ({ icon, title, lines }) => {
    showToast(icon, title, lines);
  });

  socket.on('reno-complete', (results) => {
    pendingRenoResults = results;
    renderRenoComplete(results);
    showOverlay('overlay-reno');
  });

  socket.on('player-emote', ({ playerIdx, emoteId }) => {
    showEmoteBubble(playerIdx, emoteId);
  });

  socket.on('error', ({ message }) => {
    playSound('error');
    if (lastActionBtn && document.contains(lastActionBtn)) {
      lastActionBtn.classList.remove('shake');
      void lastActionBtn.offsetWidth; // reflow to restart animation
      lastActionBtn.classList.add('shake');
      setTimeout(() => lastActionBtn?.classList.remove('shake'), 500);
    }
    showToast('⚠️', 'Error', [message]);
  });
}

// ── Lobby UI ───────────────────────────────────────────────
function initLobby() {
  document.getElementById('tab-create-btn').addEventListener('click', () => {
    document.getElementById('tab-create-btn').classList.add('active');
    document.getElementById('tab-join-btn').classList.remove('active');
    document.getElementById('form-create').classList.remove('hidden');
    document.getElementById('form-join').classList.add('hidden');
  });
  document.getElementById('tab-join-btn').addEventListener('click', () => {
    document.getElementById('tab-join-btn').classList.add('active');
    document.getElementById('tab-create-btn').classList.remove('active');
    document.getElementById('form-join').classList.remove('hidden');
    document.getElementById('form-create').classList.add('hidden');
  });

  document.getElementById('btn-create-room').addEventListener('click', () => {
    const name = document.getElementById('create-name').value.trim();
    const max  = parseInt(document.getElementById('create-max').value);
    if (!name) { showLobbyError('Enter your name.'); return; }
    socket.emit('create-room', { playerName: name, maxPlayers: max });
  });

  document.getElementById('btn-join-room').addEventListener('click', () => {
    const name = document.getElementById('join-name').value.trim();
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!name) { showLobbyError('Enter your name.'); return; }
    if (!code || code.length !== 6) { showLobbyError('Enter a 6-character room code.'); return; }
    socket.emit('join-room', { roomId: code, playerName: name });
  });

  ['create-name','join-name','join-code'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const isCreate = !document.getElementById('form-create').classList.contains('hidden');
        isCreate
          ? document.getElementById('btn-create-room').click()
          : document.getElementById('btn-join-room').click();
      }
    });
  });

  document.getElementById('btn-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(myRoomId || '').catch(() => {});
    document.getElementById('btn-copy-code').textContent = 'Copied!';
    setTimeout(() => document.getElementById('btn-copy-code').textContent = 'Copy', 2000);
  });

  document.getElementById('btn-start-game').addEventListener('click', () => {
    socket.emit('start-game');
  });

  document.getElementById('btn-add-bot').addEventListener('click', () => {
    socket.emit('add-bot');
  });
}

function showLobbyError(msg) {
  document.getElementById('lobby-error').textContent = msg;
}

function renderPlayerSlots(players, maxPlayers) {
  const el = document.getElementById('player-slots');
  let html = '';
  for (let i = 0; i < maxPlayers; i++) {
    const p = players[i];
    const filled = p && p.name;
    const isBot = p && p.isBot;
    html += `<div class="player-slot${filled ? ' filled' : ' empty'}">
      ${filled ? `<div class="slot-dot" style="${isBot ? 'background:var(--text3)' : ''}"></div>` : ''}
      <span>${filled ? escHtml(p.name) : 'Waiting…'}</span>
      ${isBot ? '<span style="font-size:.68rem;color:var(--text2);font-weight:700;margin-left:auto;">🤖 BOT</span>' : ''}
      ${i === 0 && filled && !isBot ? '<span style="font-size:.68rem;color:var(--text2);font-weight:700;margin-left:auto;">HOST</span>' : ''}
    </div>`;
  }
  el.innerHTML = html;
}

function updateWaitingStatus(filled, max) {
  const el = document.getElementById('waiting-status');
  if (filled < max) {
    el.textContent = `Waiting for ${max - filled} more player${max - filled > 1 ? 's' : ''}…`;
  } else {
    el.textContent = isHost ? 'All players joined! Start when ready.' : 'Waiting for host to start…';
  }
}

// ── Sidebar Tab Init (no-op — sidebar always shows mine) ───
function initSidebarTabs() {}

// ── Main Game Render ────────────────────────────────────────
function renderGame() {
  if (!G) return;
  renderHeader();
  renderMineSidebar();
  renderMarketSidebar();
  renderAustraliaMap();
  renderBottomStrip();
  renderEndTurnBtn();
  renderPhaseOverlays();
  if (logPanelOpen) renderLog();
}

// ── Header ─────────────────────────────────────────────────
function renderHeader() {
  document.getElementById('hdr-year').textContent = `Year ${G.year} / 10`;
  document.getElementById('hdr-phase').textContent = G.phase.charAt(0).toUpperCase() + G.phase.slice(1);

  const mc = document.getElementById('hdr-market-change');
  if (G.activeMarketChange && G.activeMarketChange.effect !== 'normalise') {
    mc.textContent = `⚠️ ${G.activeMarketChange.title} (${G.marketChangeYearsLeft}yr)`;
    mc.classList.remove('hidden');
  } else {
    mc.classList.add('hidden');
  }

  // QoL item 12: turn position badge
  const turnBadge = document.getElementById('hdr-turn-badge');
  if (turnBadge) {
    if (G.phase === 'action') {
      const playerCount = G.players.length;
      const actionNum   = Math.floor(G.yearSlot / Math.max(playerCount, 1)) + 1;
      const activePlayer = G.players[G.currentPlayerIdx];
      turnBadge.textContent = `Slot ${actionNum}/2 · ${activePlayer ? activePlayer.name : '?'}`;
      turnBadge.classList.remove('hidden');
    } else {
      turnBadge.classList.add('hidden');
    }
  }
}

// ── End Turn Button (floating over map) ────────────────────
function renderEndTurnBtn() {
  const btn = document.getElementById('btn-end-slot');
  if (!btn) return;
  const isMyTurn = G.phase === 'action' && G.currentPlayerIdx === myPlayerIdx;
  if (isMyTurn) {
    const playerCount = Math.max(G.players.length, 1);
    const actionNum   = Math.floor(G.yearSlot / playerCount) + 1;
    // QoL item 9: distinguish skipping vs ending after a free action
    btn.textContent = slotActionTaken ? `End Slot ${actionNum}/2 ✓` : `Skip Slot ${actionNum}/2 →`;
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

// ── Mine Sidebar ───────────────────────────────────────────
function renderMineSidebar() {
  const el = document.getElementById('sidebar-mine');
  if (!el || !G || myPlayerIdx === null) return;
  const p = G.players[myPlayerIdx];
  if (!p) return;

  const npi = p.netPassiveIncome;
  const svc = p.serviceability;

  // Flags
  let flagsHtml = '';
  if (p.blocked)               flagsHtml += `<span class="flag-chip blocked">⚠️ Blocked</span>`;
  if (p.freeRenoNextRound)     flagsHtml += `<span class="flag-chip reno-free">🎁 Free Reno</span>`;
  if (p.renoDiscountNextRound) flagsHtml += `<span class="flag-chip reno-free">50% Reno Off</span>`;
  if (p.personalRateDiscountYears > 0) flagsHtml += `<span class="flag-chip rate-disc">↓ Rate ${p.personalRateDiscountYears}yr</span>`;

  // Restrictions
  const r = G.activeRestrictions;
  let restrictHtml = '';
  if (r.regionalFreeze)     restrictHtml += '<span class="restriction-chip">Regional Frozen</span>';
  if (r.investorCap)        restrictHtml += `<span class="restriction-chip">Investor Cap (${r.investorCapThreshold})</span>`;
  if (r.depositRate > 0.20) restrictHtml += `<span class="restriction-chip">Deposit ${Math.round(r.depositRate*100)}%</span>`;

  // Trends chart data
  const history = nwHistory[myPlayerIdx] || {};
  const trendsChart = renderTrendsChart(history, G.year);
  const rentChart = renderMiniSparkline(rentHistory[myPlayerIdx] || {}, G.year, 'Rent/yr', 'var(--mint)');
  const propValChart = renderMiniSparkline(propValHistory[myPlayerIdx] || {}, G.year, 'Prop Value', 'var(--coral)');

  const recentEventsHtml = '';

  // Active market change
  let mcHtml = '';
  if (G.activeMarketChange && G.activeMarketChange.effect !== 'normalise') {
    mcHtml = `<div class="market-change-banner">
      <div class="mc-title">⚠️ ${escHtml(G.activeMarketChange.title)}</div>
      <div class="mc-text">${escHtml(G.activeMarketChange.text)}</div>
      <div class="mc-years">${G.marketChangeYearsLeft} year${G.marketChangeYearsLeft !== 1 ? 's' : ''} remaining</div>
    </div>`;
  }

  el.innerHTML = `
    <div class="dashboard-header">
      <div class="dh-title">Investor Dashboard</div>
      <div class="dh-name">${escHtml(p.name)}</div>
    </div>

    ${restrictHtml ? `<div class="restrictions-bar">${restrictHtml}</div>` : ''}
    ${flagsHtml ? `<div class="flags-row">${flagsHtml}</div>` : ''}

    <div class="hero-stat-card gold sketch">
      <div class="hsc-label">Net Worth</div>
      <div class="hsc-value">${fmt(p.netWorth)}</div>
      <div class="hsc-sub">${p.properties.length} propert${p.properties.length !== 1 ? 'ies' : 'y'}</div>
    </div>

    <div class="hero-stat-card ${npi >= 0 ? 'coral' : 'red'} sketch">
      <div class="hsc-label">Net Income</div>
      <div class="hsc-value">${sign(Math.round(npi))}<span class="hsc-unit">/yr</span></div>
      <div class="hsc-sub">Rent − Repayments</div>
    </div>

    ${buildWinProgress(p)}

    <div class="quick-stats-grid">
      <div class="quick-stat sketch-sm" style="background:var(--mint-light);border-color:var(--mint);grid-column:span 2;">
        <div class="qs-label">💰 Cash on Hand</div>
        <div class="qs-value" style="font-size:1.1rem;color:var(--mint);">${fmt(p.cash)}</div>
      </div>
      <div style="display:none"></div>
      <div class="quick-stat">
        <div class="qs-label">Serviceability</div>
        <div class="qs-value ${svc >= 0 ? 'positive' : 'negative'}">${sign(Math.round(svc))}</div>
      </div>
      <div class="quick-stat">
        <div class="qs-label">Salary</div>
        <div class="qs-value">${fmt(p.salary)}</div>
      </div>
      <div class="quick-stat">
        <div class="qs-label">Rate</div>
        <div class="qs-value">${fmtPct(p.interestRate)}</div>
      </div>
      <div class="quick-stat">
        <div class="qs-label">Total Debt</div>
        <div class="qs-value" style="color:var(--red)">${fmt(p.totalDebt || 0)}</div>
      </div>
      <div class="quick-stat">
        <div class="qs-label">Rent/yr</div>
        <div class="qs-value positive">${fmt(p.rentalIncome || 0)}</div>
      </div>
    </div>

    ${trendsChart}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
      ${rentChart}${propValChart}
    </div>
    ${buildPortfolioBarChart(p)}
    ${mcHtml}
    ${recentEventsHtml}
  `;

  // Wire detail toggle
}

function buildPortfolioHtml(p) {
  if (!p.properties || p.properties.length === 0) return '';
  const isMyTurn = G.phase === 'action' && G.currentPlayerIdx === myPlayerIdx;

  const cards = p.properties.map(prop => {
    const equity = prop.currentValue - prop.debt;
    const isReno = !!prop._renovating;
    const isDev  = !!prop._developing;
    const stateClass = isReno ? 'state-renovating' : isDev ? 'state-developing' : prop.developed ? 'state-developed' : (prop.rarity && prop.rarity !== 'standard' ? `rarity-${prop.rarity}` : '');
    const cardClass = isReno ? 'renovating' : isDev ? 'developing' : prop.developed ? 'developed' : '';

    // Badges
    const badges = [
      isReno  ? `<span class="badge" style="background:var(--gold-light);color:var(--gold-b);">🔨 Renovating</span>` : '',
      isDev   ? `<span class="badge" style="background:var(--blue-light);color:var(--blue);">🏗 Developing</span>` : '',
      prop.developed ? `<span class="badge badge-develop">✅ Developed</span>` : '',
      prop.market === 'regional' && !prop.developed && !isDev
        ? `<span class="badge badge-develop">Dev Ready</span>` : '',
      prop.vacantThisRound ? `<span class="badge" style="background:var(--red-light);color:var(--red);">Vacant</span>` : '',
      prop.managerTier > 0 ? `<span class="badge" style="background:var(--blue-light);color:var(--blue);">Mgr ${prop.managerTier}</span>` : '',
    ].filter(Boolean).join('');

    // Upgrade progress bar
    let upgradeHtml = '';
    if (isReno && prop._renoYear != null) {
      const completeYear = prop._renoCompleteYear ?? (prop._renoYear + 1);
      const totalYears   = completeYear - prop._renoYear;
      const elapsed      = G.year - prop._renoYear;
      const progress     = Math.min(100, Math.round((elapsed / totalYears) * 100));
      const yearsLeft    = Math.max(0, completeYear - G.year);
      const label = yearsLeft === 0
        ? '🎯 Completing this turn!'
        : `🔨 Completes Year ${completeYear} · ${yearsLeft} yr away`;
      upgradeHtml = `
        <div class="opc-upgrade-label">${label}</div>
        <div class="opc-upgrade-bar"><div class="opc-upgrade-fill reno" style="width:${progress}%"></div></div>`;
    } else if (isDev && prop._devYear != null) {
      const completeYear = prop._devCompleteYear ?? (prop._devYear + 1);
      const totalYears   = completeYear - prop._devYear;
      const elapsed      = G.year - prop._devYear;
      const progress     = Math.min(100, Math.round((elapsed / totalYears) * 100));
      const yearsLeft    = Math.max(0, completeYear - G.year);
      const label = yearsLeft === 0
        ? '🎯 Completing this turn!'
        : `🏗 Completes Year ${completeYear} · ${yearsLeft} yr away`;
      upgradeHtml = `
        <div class="opc-upgrade-label">${label}</div>
        <div class="opc-upgrade-bar"><div class="opc-upgrade-fill dev" style="width:${progress}%"></div></div>`;
    }

    // Action buttons
    let actions = '';
    if (isMyTurn) {
      const oid = prop._ownedId;
      if (!isReno && !prop.renovated) {
        // QoL item 5: show estimated reno cost inline (p is buildPortfolioHtml's parameter)
        const baseCost = Math.round(prop.currentValue * 0.08);
        const renoCostDisplay = p.freeRenoNextRound ? 'FREE'
          : p.renoDiscountNextRound ? fmt(Math.round(baseCost * 0.5))
          : fmt(baseCost);
        actions += `<button class="btn-secondary" data-action="renovate" data-oid="${oid}" title="Cost: ${renoCostDisplay}">🔨 Reno <span class="reno-cost-hint">${renoCostDisplay}</span></button>`;
      }
      if (prop.market === 'regional' && !prop.developed && !isDev) {
        const devCost = Math.round(prop.currentValue * 0.15);
        actions += `<button class="btn-secondary" data-action="develop" data-oid="${oid}" title="Cost: ${fmt(devCost)} · 60% success">🏗 Dev <span class="reno-cost-hint">${fmt(devCost)}</span></button>`;
      }
      if (prop.debt > 0) actions += `<button class="btn-secondary" data-action="reduceDebt" data-oid="${oid}">📉 Debt</button>`;
      actions += `<button class="btn-secondary" data-action="releaseEquity" data-oid="${oid}" title="Release equity as cash">🤝 Equity</button>`;
      actions += `<button class="btn-sell" data-action="sell" data-oid="${oid}" title="Sell this property">🏷 Sell</button>`;
    }

    return `<div class="owned-prop-card ${cardClass} ${stateClass}">
      <div class="opc-top">
        <div>
          <div class="opc-city">${escHtml(prop.city)}</div>
          <div class="opc-type">${escHtml(prop.propType || '')}</div>
        </div>
      </div>
      ${badges ? `<div class="opc-badges">${badges}</div>` : ''}
      ${upgradeHtml}
      <div class="opc-stats">
        <div><div class="opc-stat-label">Value</div><div class="opc-stat-value">${fmt(prop.currentValue)}</div></div>
        <div><div class="opc-stat-label">Equity</div><div class="opc-stat-value">${fmt(equity)}</div></div>
        <div><div class="opc-stat-label">Rent/yr</div><div class="opc-stat-value">${prop.vacantThisRound ? '—' : fmt(prop.currentRent)}</div></div>
      </div>
      ${sidebarDetailMode ? `<div class="opc-stats" style="margin-top:3px;">
        <div><div class="opc-stat-label">Debt</div><div class="opc-stat-value" style="color:var(--red)">${fmt(prop.debt)}</div></div>
        <div><div class="opc-stat-label">Bought</div><div class="opc-stat-value">${fmt(prop.purchasePrice)}</div></div>
        <div><div class="opc-stat-label">Spent</div><div class="opc-stat-value">${fmt(prop.extraSpent || 0)}</div></div>
      </div>` : ''}
      ${actions ? `<div class="opc-actions">${actions}</div>` : ''}
    </div>`;
  }).join('');

  const toggleLabel = sidebarDetailMode ? '🎓 Simple' : '🎓 Full';
  return `<div class="portfolio-section">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
      <div class="portfolio-title">My Properties (${p.properties.length})</div>
      <button id="btn-detail-toggle" style="font-size:.6rem;padding:2px 6px;border:1px solid var(--border);border-radius:6px;background:var(--white);color:var(--text2);cursor:pointer;">${toggleLabel}</button>
    </div>
    ${cards}
  </div>`;
}

function buildPortfolioBarChart(p) {
  if (!p.properties || p.properties.length === 0) return '';
  const maxVal = Math.max(...p.properties.map(pr => pr.currentValue), 1);
  const bars = p.properties.map(pr => {
    const pct = Math.round((pr.currentValue / maxVal) * 100);
    const color = pr._renovating ? 'var(--gold)' : pr.developed ? 'var(--mint)' : 'var(--blue)';
    return `<div class="bar-row">
      <div class="bar-name">${escHtml(cityName(pr.city))}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="bar-val">${fmt(pr.currentValue)}</div>
    </div>`;
  }).join('');
  return `<div class="bar-chart-section sketch">
    <div class="trends-title">Portfolio</div>
    ${bars}
  </div>`;
}

// ── Win Target Progress (QoL item 6) ───────────────────────
function buildWinProgress(p) {
  const WIN_TARGET = 1000000;
  const nw  = p.netWorth || 0;
  const pct = Math.min(100, Math.max(0, Math.round((nw / WIN_TARGET) * 100)));
  const fillClass = pct >= 100 ? 'gold' : nw < 0 ? 'red' : 'blue';
  return `<div class="win-progress-section">
    <div class="wp-header">
      <span class="wp-label">🏆 Win Target</span>
      <span class="wp-pct">${pct}%</span>
    </div>
    <div class="prog-bar" style="height:7px;margin:2px 0 3px;">
      <div class="prog-fill ${fillClass}" style="width:${pct}%;"></div>
    </div>
    <div class="wp-val">${fmt(nw)} / $1,000,000</div>
  </div>`;
}

function renderTrendsChart(history, currentYear) {
  const points = [];
  for (let y = 1; y <= currentYear; y++) {
    if (history[y] !== undefined) points.push({ year: y, nw: history[y] });
  }
  if (points.length < 1) {
    return `<div class="trends-section">
      <div class="trends-title">Net Worth Trend</div>
      <div style="font-size:.75rem;color:var(--text3);padding:8px 0;">Building data…</div>
    </div>`;
  }
  // With a single point, duplicate it so the line renders flat
  if (points.length === 1) points.push({ year: points[0].year + 1, nw: points[0].nw });

  const W = 230, H = 60, pad = 10;
  const minNW = Math.min(...points.map(p => p.nw));
  const maxNW = Math.max(...points.map(p => p.nw));
  const range = maxNW - minNW || 1;
  const xScale = (W - pad * 2) / Math.max(points.length - 1, 1);
  const yScale = (H - pad * 2) / range;

  const coords = points.map((p, i) => ({
    x: pad + i * xScale,
    y: H - pad - (p.nw - minNW) * yScale,
  }));

  const polyline = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `M ${coords[0].x},${H} ` + coords.map(c => `L ${c.x},${c.y}`).join(' ') + ` L ${coords[coords.length-1].x},${H} Z`;

  const dots = coords.map((c, i) => `<circle cx="${c.x}" cy="${c.y}" r="3" fill="var(--blue)"/>
    <title>Year ${points[i].year}: ${fmt(points[i].nw)}</title>`).join('');

  return `<div class="trends-section">
    <div class="trends-title">Net Worth Trend</div>
    <svg class="trends-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendsGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--blue)" stop-opacity=".18"/>
          <stop offset="100%" stop-color="var(--blue)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#trendsGrad)"/>
      <polyline points="${polyline}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>
  </div>`;
}

// ── Mini sparkline (rent/yr, prop value) ───────────────────
function renderMiniSparkline(history, currentYear, label, color) {
  const points = [];
  for (let y = 1; y <= currentYear; y++) {
    if (history[y] !== undefined) points.push({ year: y, v: history[y] });
  }
  if (points.length < 1) return `<div class="trends-section" style="padding:7px 10px;"><div class="trends-title">${label}</div><div style="font-size:.7rem;color:var(--text3);">No data yet</div></div>`;
  if (points.length === 1) points.push({ year: points[0].year + 1, v: points[0].v });
  const W = 110, H = 46, pad = 6;
  const minV = Math.min(...points.map(p => p.v));
  const maxV = Math.max(...points.map(p => p.v));
  const range = maxV - minV || 1;
  const xScale = (W - pad * 2) / Math.max(points.length - 1, 1);
  const yScale = (H - pad * 2) / range;
  const coords = points.map((p, i) => ({ x: pad + i * xScale, y: H - pad - (p.v - minV) * yScale }));
  const polyline = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const lastVal = points[points.length - 1].v;
  return `<div class="trends-section" style="padding:7px 10px;">
    <div class="trends-title">${label}</div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:46px;display:block;overflow:visible;">
      <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${coords[coords.length-1].x}" cy="${coords[coords.length-1].y}" r="3" fill="${color}"/>
    </svg>
    <div style="font-size:.72rem;font-weight:800;color:${color};margin-top:2px;">${fmt(lastVal)}</div>
  </div>`;
}

// ── Market Sidebar — no-op, market is now in modal ─────────
function renderMarketSidebar() {}

// ── Market Modal ────────────────────────────────────────────
function openMarketModal() {
  if (!G) return;
  const el = document.getElementById('modal-market-content');
  if (!el) return;

  const allCards = [...G.market.metro, ...G.market.regional];
  const stars = computeStarRatings(allCards);

  // Sort
  const riskOrder = { low: 0, medium: 1, high: 2 };
  const sorted = [...allCards].sort((a, b) => {
    if (marketSortMode === 'price-asc')  return a.price - b.price;
    if (marketSortMode === 'price-desc') return b.price - a.price;
    if (marketSortMode === 'yield')      return b.yieldMax - a.yieldMax;
    if (marketSortMode === 'growth')     return b.growthMax - a.growthMax;
    if (marketSortMode === 'risk')       return (riskOrder[a.risk] || 0) - (riskOrder[b.risk] || 0);
    return 0;
  });

  const sortModes = ['default','price-asc','price-desc','yield','growth','risk'];
  const sortLabels = { default:'Default', 'price-asc':'Price ↑', 'price-desc':'Price ↓', yield:'Yield', growth:'Growth', risk:'Risk ↓' };
  const sortBarHtml = `<div class="market-sort-bar">
    <span class="sort-label">Sort:</span>
    ${sortModes.map(m => `<button class="sort-btn${marketSortMode===m?' active':''}" data-sort="${m}">${sortLabels[m]}</button>`).join('')}
  </div>`;

  const metroCards  = sorted.filter(p => p.market === 'metro').map(p => propCardHtml(p, stars)).join('');
  const regionCards = sorted.filter(p => p.market === 'regional').map(p => propCardHtml(p, stars)).join('');

  // Affordability bar (show my cash + serviceability when modal is open)
  const me = G.players[myPlayerIdx];
  const affordHtml = me ? `<div class="market-afford-bar">
    <div class="mab-stat"><div class="mab-label">💰 My Cash</div><div class="mab-value" style="color:var(--mint);">${fmt(me.cash)}</div></div>
    <div class="mab-div"></div>
    <div class="mab-stat"><div class="mab-label">📊 Serviceability</div><div class="mab-value ${me.serviceability >= 0 ? '' : 'negative'}">${sign(Math.round(me.serviceability))}</div></div>
    <div class="mab-div"></div>
    <div class="mab-stat"><div class="mab-label">📈 Net Worth</div><div class="mab-value" style="color:var(--gold-b);">${fmt(me.netWorth)}</div></div>
  </div>` : '';

  // QoL item 11: market year / refresh indicator
  const nextRefreshYear = G.year + 1;
  const marketRefreshNote = `<div class="market-refresh-note">Market for Year ${G.year} · Refreshes at Year ${nextRefreshYear > 10 ? 'end of game' : nextRefreshYear}</div>`;

  el.innerHTML = `
    ${affordHtml}
    ${marketRefreshNote}
    ${sortBarHtml}
    ${metroCards.length ? `
      <div class="market-section-label">Metro</div>
      <div class="market-modal-grid">${metroCards}</div>` : ''}
    ${regionCards.length ? `
      <div class="market-section-label" style="margin-top:12px;">Regional</div>
      <div class="market-modal-grid">${regionCards}</div>` : ''}
    ${!allCards.length ? '<div style="color:var(--text3);font-size:.82rem;padding:8px 0;">Market is empty this year.</div>' : ''}
  `;

  // Sort button wiring
  el.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      marketSortMode = btn.dataset.sort;
      openMarketModal();
    });
  });

  el.querySelectorAll('[data-action="buy"]').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('buy');
      socket.emit('player-action', { action: 'buy', lid: btn.dataset.lid });
      document.getElementById('modal-market').classList.add('hidden');
    });
  });

  document.getElementById('modal-market').classList.remove('hidden');
}

// ── Property Card (Marketplace) ────────────────────────────
function propCardHtml(prop, stars) {
  const s = stars[prop._lid] || { yield: 3, growth: 3, vacancy: 3 };
  const canBuy = G.phase === 'action' && G.currentPlayerIdx === myPlayerIdx;
  const inflation = prop.market === 'metro' ? (G.activeRestrictions.metroPriceInflation || 0) : 0;
  const displayPrice = Math.round(prop.price * (1 + inflation));
  const isMetro = prop.market === 'metro';
  const developReady = prop.market === 'regional' && !prop.developed && !prop._developing;
  const vis = PROP_VISUALS[prop.propType] || { emoji: '🏠' };
  const rarityClass = prop.rarity && prop.rarity !== 'standard' ? `rarity-${prop.rarity}` : '';
  const riskClass = prop.risk ? `risk-${prop.risk}` : '';

  const propJson = escHtml(JSON.stringify({ _lid: prop._lid, city: prop.city, propType: prop.propType, flavour: prop.flavour, yieldMin: prop.yieldMin, yieldMax: prop.yieldMax, growthMin: prop.growthMin, growthMax: prop.growthMax, renoUpside: prop.renoUpside, risk: prop.risk, vacancy: prop.vacancy, rarity: prop.rarity, market: prop.market, price: displayPrice }));
  // QoL item 1: dim unaffordable cards (always show affordability, not just on player's turn)
  let unaffordableClass = '';
  if (G && myPlayerIdx !== null) {
    const me = G.players[myPlayerIdx];
    if (me) {
      const dep = displayPrice * (G.activeRestrictions.depositRate || 0.20);
      const loanAmt = displayPrice - dep;
      const newRepayment = loanAmt * (me.interestRate + (G.activeRestrictions.stressBuffer || 0.02));
      if (me.cash < dep || (me.serviceability - newRepayment) < 0) unaffordableClass = 'unaffordable';
    }
  }

  return `<div class="prop-card ${rarityClass} ${riskClass} ${unaffordableClass}" style="position:relative;">
    <div class="prop-img-wrap">
      <img class="prop-img" src="/assets/${escHtml(prop.propType)}.jpg"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
           alt="${escHtml(prop.propType)}">
      <div class="prop-img-fallback" style="display:none;background:var(--blue-light);">${vis.emoji}</div>
      <button class="prop-info-btn" data-prop-info="${propJson}" title="Property Details">ℹ</button>
    </div>
    <div class="prop-card-body">
      <div class="prop-city">${escHtml(prop.city)}</div>
      <div class="prop-type">${prop.propType}</div>
      <div class="prop-badges">
        <span class="badge badge-${isMetro ? 'metro' : 'regional'}">${isMetro ? 'Metro' : 'Regional'}</span>
        ${developReady ? '<span class="badge badge-develop">Dev Ready</span>' : ''}
        ${prop.rarity !== 'standard' ? `<span class="badge badge-rare">${prop.rarity}</span>` : ''}
        ${prop.isDeal ? `<span class="badge" style="background:var(--red-light);color:var(--red);">-${prop.dealDiscountPct}%</span>` : ''}
      </div>
      <div class="prop-stars">
        <div class="star-row"><span class="star-label">Yield</span><span class="star-val">${renderStars(s.yield)}</span></div>
        <div class="star-row"><span class="star-label">Growth</span><span class="star-val">${renderStars(s.growth)}</span></div>
        <div class="star-row"><span class="star-label">Vacancy</span><span class="star-val">${renderStars(s.vacancy)}</span></div>
      </div>
      <div class="prop-price">${fmt(displayPrice)}</div>
      ${canBuy ? (() => {
        const p = G.players[myPlayerIdx];
        const deposit = displayPrice * (G.activeRestrictions.depositRate || 0.20);
        const newLoan = displayPrice - deposit;
        const newRepayment = newLoan * (p.interestRate + (G.activeRestrictions.stressBuffer || 0.02));
        const projSvc = p.serviceability - newRepayment;
        const canAfford = p.cash >= deposit && projSvc >= 0;
        const reason = p.cash < deposit
          ? `Need ${fmt(deposit)} deposit (have ${fmt(p.cash)})`
          : `Serviceability too low after this purchase`;
        return `<div class="prop-card-actions" style="flex-direction:column;align-items:stretch;">
          <button class="btn-primary" ${canAfford ? '' : `disabled title="${escHtml(reason)}"`}
            data-action="buy" data-lid="${escHtml(prop._lid)}">Buy</button>
          <div class="deposit-note">Deposit: ${fmt(deposit)} · Loan: ${fmt(newLoan)}</div>
        </div>`;
      })() : ''}
    </div>
  </div>`;
}

// ── Australia Map ──────────────────────────────────────────
function renderAustraliaMap() {
  if (!G) return;
  const pinsEl = document.getElementById('map-pins');
  if (!pinsEl) return;

  const cityLabelsRendered = new Set();
  let pinsHtml = '';

  G.players.forEach((player, playerIdx) => {
    const color = PLAYER_COLORS[playerIdx] || '#888';
    player.properties.forEach((prop, propIdx) => {
      const coords = cityCoords(prop.city);
      const isMyProp = playerIdx === myPlayerIdx;
      const vis = PROP_VISUALS[prop.propType] || { emoji: '🏠' };

      // Offset stacked pins
      const offsetX = (playerIdx - (G.players.length - 1) / 2) * 18;
      const pinX = coords.x + offsetX;
      const pinY = coords.y;

      const clipId = `pc${playerIdx}-${prop._ownedId}`;
      const avatarSrc = `/assets/avatars/${(playerIdx % 5) + 1}.png`;
      pinsHtml += `<g class="prop-pin ${isMyProp ? 'mine' : 'enemy'}"
        data-owner="${playerIdx}" data-oid="${prop._ownedId}"
        style="cursor:pointer;transform-origin:${pinX}px ${pinY}px;">
        <defs><clipPath id="${clipId}"><circle cx="${pinX}" cy="${pinY}" r="12"/></clipPath></defs>
        <circle cx="${pinX}" cy="${pinY}" r="14" fill="${color}" opacity=".9" stroke="white" stroke-width="2.5"/>
        <image href="${avatarSrc}" x="${pinX - 12}" y="${pinY - 12}" width="24" height="24"
          clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>
      </g>`;

      // City label (once per city, centred)
      const baseCityName = cityName(prop.city);
      if (!cityLabelsRendered.has(baseCityName)) {
        cityLabelsRendered.add(baseCityName);
        pinsHtml += `<text class="pin-label" x="${coords.x}" y="${coords.y + 26}" text-anchor="middle">${escHtml(baseCityName)}</text>`;
      }
    });
  });

  pinsEl.innerHTML = pinsHtml;

  // Click listeners on pins
  pinsEl.querySelectorAll('.prop-pin').forEach(pin => {
    pin.addEventListener('click', e => {
      e.stopPropagation();
      const ownerIdx = parseInt(pin.dataset.owner);
      const oid = parseInt(pin.dataset.oid);
      const owner = G.players[ownerIdx];
      const prop = owner?.properties.find(pr => pr._ownedId === oid);
      if (!prop) return;

      const coords = cityCoords(prop.city);
      const svg = document.getElementById('australia-svg');
      const svgRect = svg.getBoundingClientRect();

      const scaleX = svgRect.width / 1380;
      const scaleY = svgRect.height / 770;
      const pinScreenX = svgRect.left + coords.x * scaleX;
      const pinScreenY = svgRect.top  + coords.y * scaleY;

      showMapPopover(prop, ownerIdx, pinScreenX + 18, pinScreenY - 20);
    });
  });
}

// ── Map Popover ────────────────────────────────────────────
function showMapPopover(prop, ownerIdx, x, y) {
  const el = document.getElementById('map-popover');
  if (!el) return;

  const isMyProp = ownerIdx === myPlayerIdx;
  const isMyTurn = G.phase === 'action' && G.currentPlayerIdx === myPlayerIdx && isMyProp;
  const equity   = prop.currentValue - prop.debt;
  const owner    = G.players[ownerIdx];
  const vis      = PROP_VISUALS[prop.propType] || { emoji: '🏠' };

  let actionsHtml = '';
  if (isMyTurn) {
    const oid = prop._ownedId;
    if (!prop._renovating && !prop.renovated) {
      actionsHtml += `<button class="btn-secondary btn-sm" data-action="renovate" data-oid="${oid}" title="Renovate: boost rent & value (takes 1-2 years)">🔨 Reno</button>`;
    }
    if (prop.market === 'regional' && !prop.developed && !prop._developing) {
      actionsHtml += `<button class="btn-secondary btn-sm" data-action="develop" data-oid="${oid}" title="Develop: unlock higher value & rent on regional properties">🏗 Dev</button>`;
    }
    if (prop.debt > 0) {
      actionsHtml += `<button class="btn-secondary btn-sm" data-action="reduceDebt" data-oid="${oid}" title="Reduce debt: lower repayments & improve serviceability">📉 Debt</button>`;
    }
    actionsHtml += `<button class="btn-secondary btn-sm" data-action="releaseEquity" data-oid="${oid}" title="Release equity as cash">🤝 Equity</button>`;
    actionsHtml += `<button class="btn-sell btn-sm" data-action="sell" data-oid="${oid}" title="Sell this property">🏷 Sell</button>`;
  }

  const ownerAvatarStyle = `background:url('/assets/avatars/${(ownerIdx%5)+1}.png') center/cover no-repeat;`;
  el.innerHTML = `
    <button class="popover-close" id="btn-close-popover">✕</button>
    <img class="popover-prop-img" src="/assets/${escHtml(prop.propType)}.jpg"
         onerror="this.style.display='none';" alt="${escHtml(prop.propType)}"
         style="width:100%;height:100px;object-fit:cover;object-position:center;border-radius:8px;display:block;margin-bottom:10px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <div style="width:32px;height:32px;border-radius:50%;border:2px solid ${PLAYER_COLORS[ownerIdx]||'#888'};flex-shrink:0;overflow:hidden;${ownerAvatarStyle}"></div>
      <div>
        <div class="popover-title">${escHtml(prop.city)}</div>
        <div class="popover-subtitle">${escHtml(prop.propType)}${!isMyProp ? ` · ${escHtml(owner?.name || '')}` : ' · Your property'}</div>
      </div>
    </div>
    <div class="popover-stats">
      <div><div class="popover-stat-label">Value</div><div class="popover-stat-value">${fmt(prop.currentValue)}</div></div>
      <div><div class="popover-stat-label">Debt</div><div class="popover-stat-value">${fmt(prop.debt)}</div></div>
      <div><div class="popover-stat-label">Equity</div><div class="popover-stat-value">${fmt(equity)}</div></div>
      <div><div class="popover-stat-label">Rent/yr</div><div class="popover-stat-value">${prop.vacantThisRound ? 'Vacant' : fmt(prop.currentRent)}</div></div>
    </div>
    ${actionsHtml ? `<div class="popover-actions">${actionsHtml}</div>` : ''}
  `;

  // Clamp position to viewport
  const popW = 268, popH = 280;
  let left = x;
  let top  = y;
  if (left + popW > window.innerWidth  - 10) left = window.innerWidth  - popW - 10;
  if (top  + popH > window.innerHeight - 10) top  = window.innerHeight - popH - 10;
  if (left < 10) left = 10;
  if (top  < 10) top  = 10;

  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
  el.classList.remove('hidden');

  // Close button
  el.querySelector('#btn-close-popover').addEventListener('click', e => {
    e.stopPropagation();
    hideMapPopover();
  });

  // Action buttons in popover
  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleOwnedAction(btn.dataset.action, parseInt(btn.dataset.oid), btn);
      hideMapPopover();
    });
  });
}

function hideMapPopover() {
  const el = document.getElementById('map-popover');
  if (el) el.classList.add('hidden');
}

// ── My Properties Popover (dock button) ────────────────────
function renderPropsPopover() {
  const el = document.getElementById('props-popover');
  if (!el || !G || myPlayerIdx === null) return;
  const p = G.players[myPlayerIdx];
  if (!p) return;

  const rows = (p.properties || []).map(prop => {
    const vis = PROP_VISUALS[prop.propType] || { emoji: '🏠' };
    const equity = prop.currentValue - prop.debt;
    const status = prop._renovating ? '🔨 Reno' : prop._developing ? '🏗 Dev' : prop.developed ? '✅ Dev\'d' : '';
    return `<div class="pp-prop-row">
      <div class="pp-prop-emoji">${vis.emoji}</div>
      <div class="pp-prop-info">
        <div class="pp-prop-name">${escHtml(cityName(prop.city))} ${status}</div>
        <div class="pp-prop-stats">${fmt(prop.currentValue)} · Equity ${fmt(equity)} · ${prop.vacantThisRound ? 'Vacant' : fmt(prop.currentRent)+'/yr'}</div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <button class="ep-close" id="btn-close-props">✕</button>
    <div class="ep-title">My Properties (${(p.properties||[]).length})</div>
    ${rows || '<div class="ep-none">No properties yet.</div>'}
  `;
  el.querySelector('#btn-close-props').addEventListener('click', () => {
    el.classList.add('hidden');
    document.getElementById('dock-props-btn').classList.remove('active');
  });
  el.classList.remove('hidden');
}

// ── Events Popover (dock button) ───────────────────────────
function renderEventsPopover() {
  const el = document.getElementById('events-popover');
  if (!el || !G) return;

  const items = [];

  // Active market change
  if (G.activeMarketChange && G.activeMarketChange.effect !== 'normalise') {
    items.push(`<div class="ep-item">
      <div class="ep-item-icon">⚠️</div>
      <div class="ep-item-body">
        <div class="ep-item-name">${escHtml(G.activeMarketChange.title)}</div>
        <div class="ep-item-desc">${escHtml(G.activeMarketChange.text)}</div>
        <span class="ep-item-tag ep-tag-market">${G.marketChangeYearsLeft} yr remaining</span>
      </div>
    </div>`);
  }

  // Active restrictions
  const r = G.activeRestrictions || {};
  if (r.regionalFreeze)     items.push(`<div class="ep-item"><div class="ep-item-icon">🔒</div><div class="ep-item-body"><div class="ep-item-name">Regional Freeze</div><div class="ep-item-desc">No regional property purchases.</div><span class="ep-item-tag ep-tag-restrict">Active</span></div></div>`);
  if (r.investorCap)        items.push(`<div class="ep-item"><div class="ep-item-icon">🏦</div><div class="ep-item-body"><div class="ep-item-name">Investor Cap</div><div class="ep-item-desc">Max ${r.investorCapThreshold} properties.</div><span class="ep-item-tag ep-tag-restrict">Active</span></div></div>`);
  if (r.depositRate > 0.20) items.push(`<div class="ep-item"><div class="ep-item-icon">💰</div><div class="ep-item-body"><div class="ep-item-name">Higher Deposit Required</div><div class="ep-item-desc">${Math.round(r.depositRate * 100)}% deposit on purchases.</div><span class="ep-item-tag ep-tag-restrict">Active</span></div></div>`);
  if (r.metroPriceInflation > 0) items.push(`<div class="ep-item"><div class="ep-item-icon">📈</div><div class="ep-item-body"><div class="ep-item-name">Metro Price Inflation</div><div class="ep-item-desc">Metro prices +${Math.round(r.metroPriceInflation * 100)}%.</div><span class="ep-item-tag ep-tag-market">Active</span></div></div>`);

  el.innerHTML = `
    <button class="ep-close" id="btn-close-events">✕</button>
    <div class="ep-title">Active Events & Restrictions</div>
    ${items.length ? items.join('') : '<div class="ep-none">No active events this year.</div>'}
  `;
  el.querySelector('#btn-close-events').addEventListener('click', () => {
    el.classList.add('hidden');
    document.getElementById('dock-events-btn').classList.remove('active');
  });
  el.classList.remove('hidden');
}

// ── Property Info Modal ────────────────────────────────────
function showPropInfoModal(prop) {
  const el = document.getElementById('prop-info-content');
  if (!el) return;

  const isMetro = prop.market === 'metro';
  const riskColor = { low: 'var(--green)', medium: 'var(--gold-b)', high: 'var(--red)' }[prop.risk] || 'var(--text)';

  // QoL item 4: affordability section
  let affordHtml = '';
  if (G && myPlayerIdx !== null && prop.price) {
    const me = G.players[myPlayerIdx];
    if (me) {
      const depositRate = G.activeRestrictions.depositRate || 0.20;
      const deposit     = Math.round(prop.price * depositRate);
      const loan        = prop.price - deposit;
      const newRepay    = loan * (me.interestRate + (G.activeRestrictions.stressBuffer || 0.02));
      const projSvc     = me.serviceability - newRepay;
      const canAfford   = me.cash >= deposit && projSvc >= 0;
      const noDeposit   = me.cash < deposit;
      const reason      = noDeposit
        ? `Need ${fmt(deposit)} deposit (have ${fmt(me.cash)})`
        : `Serviceability becomes ${sign(Math.round(projSvc))} after purchase`;
      affordHtml = `<div class="pi-afford-section">
        <div class="pi-afford-title ${canAfford ? 'can' : 'cannot'}">${canAfford ? '✅ Affordable' : '❌ Currently Unaffordable'}</div>
        ${!canAfford ? `<div style="font-size:.72rem;color:var(--red);font-weight:700;margin-bottom:6px;">${escHtml(reason)}</div>` : ''}
        <div class="pi-grid" style="margin-bottom:0;">
          <div class="pi-stat"><div class="pi-stat-label">Price</div><div class="pi-stat-value">${fmt(prop.price)}</div></div>
          <div class="pi-stat"><div class="pi-stat-label">Deposit (${Math.round(depositRate * 100)}%)</div><div class="pi-stat-value" style="${me.cash < deposit ? 'color:var(--red);' : ''}">${fmt(deposit)}</div></div>
          <div class="pi-stat"><div class="pi-stat-label">Loan</div><div class="pi-stat-value">${fmt(loan)}</div></div>
          <div class="pi-stat"><div class="pi-stat-label">Post-buy Svc</div><div class="pi-stat-value" style="color:${projSvc >= 0 ? 'var(--green)' : 'var(--red)'};">${sign(Math.round(projSvc))}</div></div>
        </div>
      </div>`;
    }
  }

  el.innerHTML = `
    <img class="pi-img" src="/assets/${escHtml(prop.propType)}.jpg" onerror="this.style.display='none';" alt="">
    <div class="pi-city">${escHtml(prop.city)}</div>
    <div class="pi-type">${escHtml(prop.propType)} · <span class="badge badge-${isMetro ? 'metro' : 'regional'}">${isMetro ? 'Metro' : 'Regional'}</span>${prop.rarity !== 'standard' ? ` <span class="badge badge-rare">${escHtml(prop.rarity)}</span>` : ''}</div>
    ${prop.flavour ? `<div class="pi-flavour">"${escHtml(prop.flavour)}"</div>` : ''}
    <div class="pi-grid">
      <div class="pi-stat">
        <div class="pi-stat-label">Yield Range</div>
        <div class="pi-stat-value" style="color:var(--green);">${fmtPct(prop.yieldMin)}–${fmtPct(prop.yieldMax)}</div>
      </div>
      <div class="pi-stat">
        <div class="pi-stat-label">Growth Range</div>
        <div class="pi-stat-value" style="color:var(--blue);">${fmtPct(prop.growthMin)}–${fmtPct(prop.growthMax)}</div>
      </div>
      <div class="pi-stat">
        <div class="pi-stat-label">Reno Upside</div>
        <div class="pi-stat-value" style="color:var(--gold-b);">+${fmtPct(prop.renoUpside)}</div>
      </div>
      <div class="pi-stat">
        <div class="pi-stat-label">Vacancy</div>
        <div class="pi-stat-value">${fmtPct(prop.vacancy)}</div>
      </div>
      <div class="pi-stat">
        <div class="pi-stat-label">Risk Level</div>
        <div class="pi-stat-value" style="color:${riskColor};text-transform:capitalize;">${escHtml(prop.risk)}</div>
      </div>
      <div class="pi-stat">
        <div class="pi-stat-label">Market</div>
        <div class="pi-stat-value">${isMetro ? 'Metro' : 'Regional'}</div>
      </div>
    </div>
    ${affordHtml}
  `;
  document.getElementById('modal-prop-info').classList.remove('hidden');
}

// ── Compact property cards for bottom strip ────────────────
function buildBottomPropsHtml(p) {
  if (!p || !p.properties || p.properties.length === 0) {
    return '<div class="strip-no-props">Buy a property<br>to see it here</div>';
  }
  const isMyTurn = G.phase === 'action' && G.currentPlayerIdx === myPlayerIdx;
  return p.properties.map(prop => {
    const equity = prop.currentValue - prop.debt;
    const isReno = !!prop._renovating;
    const isDev  = !!prop._developing;
    const oid    = prop._ownedId;

    let stateHtml = '';
    if (isReno)               stateHtml = '<span class="bpc-state reno">🔨 Reno</span>';
    else if (isDev)           stateHtml = '<span class="bpc-state dev">🏗 Dev</span>';
    else if (prop.developed)  stateHtml = '<span class="bpc-state done">✅ Dev</span>';
    else if (prop.vacantThisRound) stateHtml = '<span class="bpc-state vacant">Vacant</span>';

    let actions = '';
    if (isMyTurn) {
      if (!isReno && !prop.renovated) {
        const baseCost = Math.round(prop.currentValue * 0.08);
        const renoCostDisplay = p.freeRenoNextRound ? 'FREE' : p.renoDiscountNextRound ? fmt(Math.round(baseCost * 0.5)) : fmt(baseCost);
        actions += `<button class="bpc-btn" data-action="renovate" data-oid="${oid}">🔨 ${renoCostDisplay}</button>`;
      }
      if (prop.market === 'regional' && !prop.developed && !isDev) {
        actions += `<button class="bpc-btn" data-action="develop" data-oid="${oid}">🏗 Dev</button>`;
      }
      if (prop.debt > 0) actions += `<button class="bpc-btn" data-action="reduceDebt" data-oid="${oid}">📉</button>`;
      actions += `<button class="bpc-btn" data-action="releaseEquity" data-oid="${oid}">🤝</button>`;
      actions += `<button class="bpc-btn sell" data-action="sell" data-oid="${oid}">🏷</button>`;
    }

    return `<div class="bottom-prop-card${isReno ? ' bpc-reno' : isDev ? ' bpc-dev' : prop.developed ? ' bpc-developed' : ''}">
      <div class="bpc-city">${escHtml(cityName(prop.city))}</div>
      <div class="bpc-type">${escHtml(prop.propType || '')}</div>
      ${stateHtml}
      <div class="bpc-stats">
        <span>${fmt(prop.currentValue)}</span>
        <span class="bpc-eq">+${fmt(equity)}</span>
      </div>
      <div class="bpc-rent">${prop.vacantThisRound ? '— Vacant' : fmt(prop.currentRent) + '/yr'}</div>
      ${actions ? `<div class="bpc-actions">${actions}</div>` : ''}
    </div>`;
  }).join('');
}

// ── Bottom Strip (props left + player cards/influence right) ─
function renderBottomStrip() {
  const el = document.getElementById('bottom-strip');
  if (!el || !G) return;

  const p    = G.players[myPlayerIdx];
  const hand = myPrivate.influenceHand || [];
  const deal = myPrivate.dealAlertListing;

  // ── Left: My Properties ──────────────────────────────────
  const propsInner = buildBottomPropsHtml(p);
  const propsPanel = `<div id="strip-props-panel">
    <div class="strip-props-label">My Properties${p && p.properties.length ? ` (${p.properties.length})` : ''}</div>
    <div class="strip-props-scroll">${propsInner}</div>
  </div>`;

  // ── Right: influence + player cards ──────────────────────
  let rightHtml = '';

  hand.forEach(card => {
    rightHtml += `<div class="influence-card">
      <div class="influence-card-title">${escHtml(card.title)}</div>
      <div class="influence-card-target">${card.targetType}</div>
      <div class="influence-card-text">${escHtml(card.text)}</div>
      <button class="influence-card-btn"
        data-card="${escHtml(JSON.stringify({ title: card.title, text: card.text, effect: card.effect, targetType: card.targetType, _handId: card._handId }))}">
        ▶ Play
      </button>
    </div>`;
  });

  if (deal) {
    rightHtml += `<div class="deal-alert-card">
      <div class="deal-alert-title">🔔 Deal Alert — ${deal.dealDiscountPct}% Off!</div>
      <div class="deal-alert-city">${escHtml(deal.city)}</div>
      <div class="deal-alert-price">${fmt(deal.price)}</div>
      ${G.phase === 'action' && G.currentPlayerIdx === myPlayerIdx
        ? `<button class="deal-alert-btn" data-action="buy" data-lid="${escHtml(deal._lid)}">Buy Now</button>`
        : `<div style="font-size:.68rem;color:var(--text3);margin-top:auto;">Available on your turn</div>`}
    </div>`;
  }

  if (hand.length || deal) rightHtml += '<div class="strip-divider"></div>';

  G.players.forEach((player, idx) => {
    const color     = PLAYER_COLORS[idx] || '#888';
    const isMe      = idx === myPlayerIdx;
    const isCurrent = idx === G.currentPlayerIdx && G.phase === 'action';
    rightHtml += `<div class="player-card${isMe ? ' me' : ''}${isCurrent ? ' current-turn' : ''}"
      data-player-idx="${idx}" style="border-left-color:${color};">
      <div class="pc-name">
        <div class="player-avatar" style="border-color:${color};background:url('/assets/avatars/${(idx%5)+1}.png') center/cover no-repeat;"></div>
        ${escHtml(player.name)}
        ${isMe ? '<span class="pc-you-tag">YOU</span>' : ''}
        ${player.isBot ? '<span class="pc-you-tag" style="background:var(--text3);">BOT</span>' : ''}
        ${isCurrent ? '<div class="pc-turn-dot"></div>' : ''}
      </div>
      <div class="pc-stats">
        <div><div class="pc-stat-val">${fmt(player.netWorth)}</div><div class="pc-stat-lbl">Net Worth</div></div>
        <div><div class="pc-stat-val">${player.properties.length}</div><div class="pc-stat-lbl">Properties</div></div>
      </div>
      ${player.blocked ? '<div class="pc-blocked">⚠️ Blocked</div>' : ''}
    </div>`;
  });

  el.innerHTML = propsPanel + `<div id="strip-right-panel">${rightHtml}</div>`;

  // ── Wire events ──────────────────────────────────────────

  // Property action buttons (bottom-left panel)
  el.querySelectorAll('.bottom-prop-card [data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleOwnedAction(btn.dataset.action, parseInt(btn.dataset.oid), btn);
    });
  });

  // Player card clicks (enemy → show popover)
  el.querySelectorAll('.player-card:not(.me)').forEach(card => {
    card.addEventListener('click', e => {
      const idx = parseInt(card.dataset.playerIdx);
      showPlayerPopover(G.players[idx], idx, card.getBoundingClientRect());
    });
  });

  // Influence card play buttons
  el.querySelectorAll('.influence-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = JSON.parse(btn.dataset.card);
      openInfluenceModal(card);
    });
  });

  // Deal alert buy
  el.querySelectorAll('[data-action="buy"]').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('buy');
      socket.emit('player-action', { action: 'buy', lid: btn.dataset.lid });
    });
  });
}

// Keep this alias so private-state handler works without change
function renderInfluenceStrip() { renderBottomStrip(); }

// ── Player Popover ─────────────────────────────────────────
function showPlayerPopover(player, idx, cardRect) {
  const el = document.getElementById('player-popover');
  if (!el) return;
  const color = PLAYER_COLORS[idx] || '#888';

  el.innerHTML = `
    <button class="popover-close" id="btn-close-player-popover" style="position:absolute;top:8px;right:10px;">✕</button>
    <div class="player-popover-name">
      <div class="player-color-dot" style="background:${color};"></div>
      ${escHtml(player.name)}
    </div>
    <div class="player-popover-stats">
      <div class="pp-stat"><span class="pp-stat-label">Net Worth</span><span class="pp-stat-value">${fmt(player.netWorth)}</span></div>
      <div class="pp-stat"><span class="pp-stat-label">Cash</span><span class="pp-stat-value">${fmt(player.cash)}</span></div>
      <div class="pp-stat"><span class="pp-stat-label">Rate</span><span class="pp-stat-value">${fmtPct(player.interestRate)}</span></div>
    </div>
    ${player.properties.length ? `
    <div class="player-popover-props">
      <div class="player-popover-props-title">Properties (${player.properties.length})</div>
      ${player.properties.map(p =>
        `<div class="pp-prop-item">${escHtml(p.city)} — ${fmt(p.currentValue)}</div>`
      ).join('')}
    </div>` : ''}
    ${player.blocked ? '<div style="font-size:.75rem;color:var(--red);font-weight:700;">⚠️ Blocked</div>' : ''}
  `;

  // Position above the card, centred
  const popW = 270;
  const popH = 220;
  let left = cardRect.left + cardRect.width / 2 - popW / 2;
  let top  = cardRect.top - popH - 8;
  if (left < 8) left = 8;
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
  if (top < 8) top = cardRect.bottom + 8;

  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
  el.classList.remove('hidden');

  const closeBtn = el.querySelector('#btn-close-player-popover');
  if (closeBtn) closeBtn.addEventListener('click', e => { e.stopPropagation(); hidePlayerPopover(); });
}

function hidePlayerPopover() {
  const el = document.getElementById('player-popover');
  if (el) el.classList.add('hidden');
}

// ── Emote Bubble ───────────────────────────────────────────
// Positions a speech bubble above the target player's avatar card
function showEmoteBubble(playerIdx, emoteId) {
  const container = document.getElementById('emote-bubbles');
  if (!container) return;

  // Find the player card in the bottom strip
  const card = document.querySelector(`.player-card[data-player-idx="${playerIdx}"]`);
  if (!card) return;

  const rect = card.getBoundingClientRect();
  const bubbleSize = 64; // bubble width/height approx

  // Position: centred above the card avatar (left quarter of card)
  const left = rect.left + 14;
  const top  = rect.top  - bubbleSize - 20;

  // Remove any existing bubble for this player
  const existing = container.querySelector(`.emote-bubble[data-player="${playerIdx}"]`);
  if (existing) existing.remove();

  const bubble = document.createElement('div');
  bubble.className = 'emote-bubble';
  bubble.dataset.player = playerIdx;
  bubble.style.left = `${left}px`;
  bubble.style.top  = `${top}px`;
  bubble.innerHTML  = `<img src="/assets/emote/${emoteId}.png" alt="${emoteId}">`;

  container.appendChild(bubble);

  // Auto-remove after animation completes (2.8s display + 0.4s fade)
  setTimeout(() => bubble.remove(), 3300);
}

// Dismiss popovers on body click
document.addEventListener('click', e => {
  const playerPop = document.getElementById('player-popover');
  if (playerPop && !playerPop.classList.contains('hidden') && !playerPop.contains(e.target)) {
    hidePlayerPopover();
  }
  const mapPop = document.getElementById('map-popover');
  if (mapPop && !mapPop.classList.contains('hidden') && !mapPop.contains(e.target) && !e.target.closest('.prop-pin')) {
    hideMapPopover();
  }
});

// ── Owned Property (used in action handling) ───────────────
function ownedCardHtml(prop, player, isMyTurn) {
  // Kept for backward compat with handleOwnedAction; actions now via popover
  return '';
}

// ── Handle property actions ────────────────────────────────
function handleOwnedAction(action, oid, btn) {
  switch (action) {
    case 'sell':
      if (confirm('Sell this property?')) {
        socket.emit('player-action', { action: 'sell', oid });
      }
      break;
    case 'renovate': {
      // QoL item 2: cost preview + confirm
      const _p  = G.players[myPlayerIdx];
      const _pr = _p.properties.find(pr => pr._ownedId === oid);
      if (_pr) {
        const baseCost = Math.round(_pr.currentValue * 0.08);
        const cost = _p.freeRenoNextRound ? 0 : (_p.renoDiscountNextRound ? Math.round(baseCost * 0.5) : baseCost);
        const costStr = cost === 0 ? 'FREE (bonus active)' : `${fmt(cost)} (8% of value)`;
        if (confirm(`Renovate ${_pr.city} for ${costStr}?\n\nExpected upside: ~${fmtPct(_pr.renoUpside || 0.20)} boost to rent & value. Completes in 1–2 years.`)) {
          socket.emit('player-action', { action: 'renovate', oid });
        }
      } else {
        socket.emit('player-action', { action: 'renovate', oid });
      }
      break;
    }
    case 'develop': {
      // QoL item 2: cost preview + confirm
      const _p  = G.players[myPlayerIdx];
      const _pr = _p.properties.find(pr => pr._ownedId === oid);
      if (_pr) {
        const cost = Math.round(_pr.currentValue * 0.15);
        if (confirm(`Develop ${_pr.city} for ${fmt(cost)} (15% of value)?\n\n60% success chance. If successful, unlocks higher rent & value growth.`)) {
          socket.emit('player-action', { action: 'develop', oid });
        }
      } else {
        socket.emit('player-action', { action: 'develop', oid });
      }
      break;
    }
    case 'reduceDebt': {
      const p    = G.players[myPlayerIdx];
      const prop = p.properties.find(pr => pr._ownedId === oid);
      openAmountModal(
        'Reduce Debt',
        `${prop ? prop.city : ''} — Current debt: ${fmt(prop ? prop.debt : 0)}. Min $10,000.`,
        10000, prop ? prop.debt : 0,
        (amount) => socket.emit('player-action', { action: 'reduceDebt', oid, amount })
      );
      break;
    }
    case 'releaseEquity': {
      const p    = G.players[myPlayerIdx];
      const prop = p.properties.find(pr => pr._ownedId === oid);
      const maxEquity = prop ? Math.max(0, Math.floor(prop.currentValue * 0.80) - prop.debt) : 0;
      openAmountModal(
        'Release Equity',
        `${prop ? prop.city : ''} — Max releasable: ${fmt(maxEquity)}.`,
        10000, maxEquity,
        (amount) => socket.emit('player-action', { action: 'releaseEquity', oid, amount })
      );
      break;
    }
  }
}

// ── Amount Modal ───────────────────────────────────────────
function openAmountModal(title, desc, min, max, callback) {
  document.getElementById('amt-modal-title').textContent = title;
  document.getElementById('amt-modal-desc').textContent  = desc;
  const inp = document.getElementById('amt-input');
  inp.min   = min;
  inp.max   = max;
  inp.value = min;
  inp.step  = 5000;
  amtModalCallback = callback;
  document.getElementById('modal-amount').classList.remove('hidden');
  inp.focus();
}

// ── Influence Target Modal ─────────────────────────────────
function openInfluenceModal(card) {
  influencePending = card;
  document.getElementById('inf-modal-title').textContent = `Play: ${card.title}`;
  document.getElementById('inf-modal-desc').textContent  = card.text;

  const targets = document.getElementById('inf-modal-targets');
  targets.innerHTML = '';

  if (card.targetType === 'self' || card.targetType === 'market') {
    targets.innerHTML = `<p style="color:var(--text2);font-size:.82rem;">This card applies immediately.</p>
      <div class="modal-actions" style="margin-top:8px;">
        <button class="btn-primary" id="btn-play-now">Play Card</button>
      </div>`;
    document.getElementById('btn-play-now').addEventListener('click', () => {
      socket.emit('play-influence', { handId: card._handId });
      if (G && G.currentPlayerIdx === myPlayerIdx) slotActionTaken = true;
      document.getElementById('modal-influence').classList.add('hidden');
    });
  } else if (card.targetType === 'opponent') {
    const list = document.createElement('div');
    list.className = 'target-player-list';
    G.players.forEach((p, i) => {
      if (i === myPlayerIdx) return;
      const btn = document.createElement('button');
      btn.className = 'target-player-btn';
      btn.textContent = `${p.name} — ${fmt(p.netWorth)} NW`;
      btn.addEventListener('click', () => {
        socket.emit('play-influence', { handId: card._handId, targetPlayerIdx: i });
        if (G && G.currentPlayerIdx === myPlayerIdx) slotActionTaken = true;
        document.getElementById('modal-influence').classList.add('hidden');
      });
      list.appendChild(btn);
    });
    targets.appendChild(list);
  } else if (card.targetType === 'opponent-property') {
    const playerList = document.createElement('div');
    playerList.className = 'target-player-list';
    G.players.forEach((p, i) => {
      if (i === myPlayerIdx || !p.properties.length) return;
      const btn = document.createElement('button');
      btn.className = 'target-player-btn';
      btn.textContent = `${p.name} (${p.properties.length} properties)`;
      btn.addEventListener('click', () => {
        targets.innerHTML = `<div style="font-size:.78rem;color:var(--text2);margin-bottom:8px;">Choose property from ${escHtml(p.name)}:</div>`;
        const propList = document.createElement('div');
        propList.className = 'target-prop-list';
        p.properties.forEach(prop => {
          const pb = document.createElement('button');
          pb.className = 'target-prop-btn';
          pb.textContent = `${prop.city} — ${fmt(prop.currentValue)} | Rent: ${fmt(prop.currentRent)}/yr`;
          pb.addEventListener('click', () => {
            socket.emit('play-influence', { handId: card._handId, targetPlayerIdx: i, targetOwnedId: prop._ownedId });
            if (G && G.currentPlayerIdx === myPlayerIdx) slotActionTaken = true;
            document.getElementById('modal-influence').classList.add('hidden');
          });
          propList.appendChild(pb);
        });
        targets.appendChild(propList);
      });
      playerList.appendChild(btn);
    });
    targets.appendChild(playerList);
  }

  document.getElementById('modal-influence').classList.remove('hidden');
}

// ── Phase Overlays ─────────────────────────────────────────
function renderPhaseOverlays() {
  if (pendingRenoResults) {
    ['overlay-wheel','overlay-yearstart','overlay-handoff','overlay-auction','overlay-gameover']
      .forEach(id => hideOverlay(id));
    return;
  }
  hideAllOverlays();
  switch (G.phase) {
    case 'wheelSpin': renderWheelOverlay();    break;
    case 'yearstart': renderYearStartOverlay(); break;
    case 'handoff':   renderHandoffOverlay();   break;
    case 'auction':   renderAuctionOverlay();   break;
    case 'gameover':  renderGameoverOverlay();  break;
  }
}

// ── Wheel Overlay ──────────────────────────────────────────
function renderWheelOverlay() {
  const isSpinner = G.firstThisYear === myPlayerIdx;
  const spinner   = G.players[G.firstThisYear];

  document.getElementById('wheel-title').textContent =
    isSpinner ? 'Your Turn to Spin!' : `${spinner ? spinner.name : 'Player'} is Spinning…`;
  document.getElementById('wheel-subtitle').textContent =
    `Year ${G.year} — spin to reveal this year's event`;

  const spinBtn = document.getElementById('btn-spin-wheel');
  const ackBtn  = document.getElementById('btn-ack-wheel');

  spinBtn.disabled = false;  // always reset between years

  if (G.wheelSpun && G.pendingWheelResult) {
    spinBtn.classList.add('hidden');
    ackBtn.classList.toggle('hidden', !isSpinner);
    if (lastWheelResult) {
      renderWheelResult(lastWheelResult.category, lastWheelResult.card, lastWheelResult.spinnerIdx);
    }
  } else {
    spinBtn.classList.toggle('hidden', !isSpinner || G.wheelSpun);
    ackBtn.classList.add('hidden');
    document.getElementById('wheel-result-display').classList.add('hidden');
    document.getElementById('wheel-img').classList.remove('wheel-spinning');
  }

  showOverlay('overlay-wheel');
}

function renderWheelResult(category, card, spinnerIdx) {
  const wheelImg = document.getElementById('wheel-img');
  wheelImg.classList.remove('wheel-spinning');
  void wheelImg.offsetWidth;
  wheelImg.classList.add('wheel-spinning');

  const catColor = {
    economicEvent:   'var(--red)',
    marketChange:    'var(--gold-b)',
    marketInfluence: 'var(--purple)',
    chance:          'var(--green)',
  }[category] || 'var(--text)';

  setTimeout(() => {
    const display = document.getElementById('wheel-result-display');
    display.innerHTML = `
      <div style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${catColor};margin-bottom:4px;">${CATEGORY_LABEL[category] || category}</div>
      <div style="font-size:.92rem;font-weight:800;margin-bottom:4px;">${escHtml(card.title)}</div>
      <div style="font-size:.8rem;color:var(--text2);font-weight:600;">${escHtml(card.text)}</div>
    `;
    display.classList.remove('hidden');

    if (G && G.firstThisYear === myPlayerIdx) {
      document.getElementById('btn-ack-wheel').classList.remove('hidden');
      document.getElementById('btn-spin-wheel').classList.add('hidden');
    }
  }, 2600);
}

// ── Year Start Overlay ─────────────────────────────────────
function renderYearStartOverlay() {
  document.getElementById('ys-title').textContent = `Year ${G.year} — Summary`;
  const yrsLeft = 10 - G.year + 1;
  document.getElementById('ys-subtitle').textContent =
    yrsLeft > 0 ? `${yrsLeft} year${yrsLeft !== 1 ? 's' : ''} remaining` : '';

  const mcEl = document.getElementById('ys-market-change');
  if (G.activeMarketChange && G.activeMarketChange.effect !== 'normalise') {
    mcEl.innerHTML = `<div class="market-change-banner">
      <div class="mc-title">Active Market Change</div>
      <div style="font-size:.85rem;font-weight:600;">${escHtml(G.activeMarketChange.title)}</div>
      <div style="font-size:.75rem;color:var(--text2);margin-top:2px;">${escHtml(G.activeMarketChange.text)}</div>
    </div>`;
  } else {
    mcEl.innerHTML = '';
  }

  const grid = document.getElementById('ys-recap-grid');
  grid.innerHTML = G.players.map(p => {
    const recap = p._yearRecap;
    if (!recap) {
      return `<div class="recap-card"><div class="recap-name">${escHtml(p.name)}</div><div style="font-size:.75rem;color:var(--text3);">Starting position</div></div>`;
    }
    // QoL item 3: add portfolio growth line
    const portGrowth = recap.portfolioGrowthValue != null ? recap.portfolioGrowthValue : null;
    return `<div class="recap-card">
      <div class="recap-name">${escHtml(p.name)}</div>
      <div class="recap-stat"><span>Salary savings</span><strong class="positive">${sign(recap.netSavings)}</strong></div>
      <div class="recap-stat"><span>Rent collected</span><strong class="positive">${sign(recap.rentCollected)}</strong></div>
      <div class="recap-stat"><span>Interest paid</span><strong class="negative">-${fmt(recap.interestPaid)}</strong></div>
      ${portGrowth != null && p.properties && p.properties.length > 0 ? `<div class="recap-stat"><span>Portfolio growth</span><strong class="${portGrowth >= 0 ? 'positive' : 'negative'}">${sign(Math.round(portGrowth))}</strong></div>` : ''}
      ${recap.managerCosts  ? `<div class="recap-stat"><span>Manager fees</span><strong class="negative">-${fmt(recap.managerCosts)}</strong></div>` : ''}
      ${recap.totalMissedRent ? `<div class="recap-stat"><span>Missed rent</span><strong class="negative">-${fmt(recap.totalMissedRent)}</strong></div>` : ''}
      <div class="recap-stat" style="border-top:1px solid var(--border);padding-top:5px;margin-top:3px;">
        <span>Net Worth</span><strong class="text-gold">${fmt(p.netWorth)}</strong>
      </div>
    </div>`;
  }).join('');

  const isCurrent = G.currentPlayerIdx === myPlayerIdx;
  document.getElementById('btn-dismiss-ys').classList.toggle('hidden', !isCurrent);
  document.getElementById('ys-waiting').textContent = isCurrent
    ? '' : `Waiting for ${G.players[G.currentPlayerIdx]?.name || 'player'} to continue…`;

  showOverlay('overlay-yearstart');
}

// ── Handoff Overlay ────────────────────────────────────────
function renderHandoffOverlay() {
  const current   = G.players[G.currentPlayerIdx];
  const isMe      = G.currentPlayerIdx === myPlayerIdx;
  const actionNum = G.players.length > 0 ? Math.floor(G.yearSlot / G.players.length) + 1 : 1;

  document.getElementById('handoff-player-name').textContent = current ? current.name : '?';
  document.getElementById('handoff-slot-info').textContent   = `Action ${actionNum} of 2 · Year ${G.year}`;

  const btn     = document.getElementById('btn-dismiss-handoff');
  const waiting = document.getElementById('handoff-waiting');
  if (isMe) {
    btn.classList.remove('hidden');
    waiting.classList.add('hidden');
  } else {
    btn.classList.add('hidden');
    waiting.classList.remove('hidden');
    waiting.textContent = `Waiting for ${current ? current.name : 'player'} to take their turn…`;
  }

  showOverlay('overlay-handoff');
}

// ── Auction Overlay ────────────────────────────────────────
function renderAuctionOverlay() {
  const auction = G.pendingAuction;
  if (!auction) return;

  const prop = auction.property;
  const vis  = PROP_VISUALS[prop.propType] || { emoji: '🏠' };
  document.getElementById('auction-prop-info').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="/assets/${escHtml(prop.propType)}.jpg" style="width:52px;height:52px;border-radius:8px;object-fit:cover;object-position:top;flex-shrink:0;"
           onerror="this.outerHTML='<div style=\\'width:52px;height:52px;border-radius:8px;background:var(--blue-light);display:flex;align-items:center;justify-content:center;font-size:1.6rem;\\'>${vis.emoji}</div>'">
      <div>
        <div style="font-size:.92rem;font-weight:700;">${escHtml(prop.city)}</div>
        <div style="font-size:.75rem;color:var(--text2);">${prop.propType} · ${prop.risk} risk</div>
        <div style="font-size:.75rem;color:var(--text3);">Market value: ${fmt(auction.originalPrice)}</div>
        <div style="font-size:.75rem;color:var(--green);">Starting bid: ${fmt(auction.discountedPrice)}</div>
      </div>
    </div>
  `;

  document.getElementById('auction-current-bid').textContent = fmt(auction.currentBid);
  document.getElementById('auction-leader').textContent = auction.currentBidder !== null
    ? `Leading: ${G.players[auction.currentBidder]?.name}`
    : 'No bids yet';

  const isMyTurn = auction.biddingTurn === myPlayerIdx;
  const myPassed = auction.passed[myPlayerIdx];
  const minBid   = auction.currentBid + 5000;

  const passedNames = G.players.filter((_, i) => auction.passed[i]).map(p => p.name);
  document.getElementById('auction-passed').textContent = passedNames.length ? `Passed: ${passedNames.join(', ')}` : '';

  const turnMsg = document.getElementById('auction-turn-msg');
  const bidRow  = document.getElementById('auction-bid-row');

  if (isMyTurn && !myPassed) {
    turnMsg.textContent = '🟢 Your bid!';
    bidRow.classList.remove('hidden');
    const inp = document.getElementById('auction-bid-input');
    inp.min = minBid;
    inp.value = minBid;
  } else if (myPassed) {
    turnMsg.textContent = 'You have passed.';
    bidRow.classList.add('hidden');
  } else {
    turnMsg.textContent = `Waiting for ${G.players[auction.biddingTurn]?.name || 'player'}…`;
    bidRow.classList.add('hidden');
  }

  showOverlay('overlay-auction');
}

// ── Game Over Overlay ──────────────────────────────────────
function renderGameoverOverlay() {
  if (!winSoundPlayed) { winSoundPlayed = true; playSound('win'); }
  const sorted = [...G.players].sort((a, b) => b.netWorth - a.netWorth);
  document.getElementById('go-subtitle').textContent = G.winner
    ? `${G.winner.name} wins with ${fmt(G.winner.netWorth)} net worth!`
    : `${sorted[0]?.name || ''} wins on net worth`;

  document.getElementById('go-rankings').innerHTML = sorted.map((p, i) => `
    <div class="rank-row${i === 0 ? ' rank-1' : ''}">
      <span class="rank-num">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`}</span>
      <span class="rank-name">${escHtml(p.name)}</span>
      <span class="rank-nw">${fmt(p.netWorth)}</span>
    </div>
  `).join('');

  showOverlay('overlay-gameover');
}

// ── Reno Complete Overlay ──────────────────────────────────
function renderRenoComplete(results) {
  const el = document.getElementById('reno-results');
  el.innerHTML = results.map(r => {
    const mid    = r.prop.renoUpside || 0.20;
    const actual = r.actualMult || 1;
    const resultLabel = actual >= mid * 1.1 ? '✓ Above Estimate'
                      : actual <= mid * 0.9 ? '✗ Below Estimate'
                      : '≈ On Target';
    return `<div class="reno-item">
      <strong>🔨 ${escHtml(r.prop.city)}</strong>
      <div>Rent +${fmt(r.rentBoost)}/yr · Value +${fmt(r.valueBoost)}</div>
      <div style="font-size:.78rem;color:var(--text2);">${resultLabel}</div>
    </div>`;
  }).join('');
}

// ── Star Ratings ───────────────────────────────────────────
function computeStarRatings(cards) {
  if (!cards.length) return {};
  const ratings = {};
  const yields    = cards.map(c => (c.yieldMin  + c.yieldMax)  / 2);
  const growths   = cards.map(c => (c.growthMin + c.growthMax) / 2);
  const vacancies = cards.map(c => c.vacancy || 0.05);

  cards.forEach((card, i) => {
    ratings[card._lid] = {
      yield:   toStars(percentileRank(yields,    yields[i])),
      growth:  toStars(percentileRank(growths,   growths[i])),
      vacancy: toStars(1 - percentileRank(vacancies, vacancies[i])),
    };
  });
  return ratings;
}
function percentileRank(arr, val) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = sorted.findIndex(v => v >= val);
  return idx < 0 ? 1 : idx / Math.max(sorted.length - 1, 1);
}
function toStars(rank) { return Math.max(1, Math.min(5, Math.ceil(rank * 5))); }
function renderStars(n) {
  return '★'.repeat(n) + `<span class="empty">${'☆'.repeat(5-n)}</span>`;
}

// ── Utility ────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Wire up overlay & modal buttons ────────────────────────
function initGameButtons() {
  // Wheel
  document.getElementById('btn-spin-wheel').addEventListener('click', () => {
    playSound('spin');
    document.getElementById('wheel-img').classList.add('wheel-spinning');
    document.getElementById('btn-spin-wheel').disabled = true;
    socket.emit('spin-wheel');
  });
  document.getElementById('btn-ack-wheel').addEventListener('click', () => {
    lastWheelResult = null;
    socket.emit('acknowledge-wheel');
  });

  // Year start
  document.getElementById('btn-dismiss-ys').addEventListener('click', () => {
    socket.emit('dismiss-year-start');
  });

  // Handoff
  document.getElementById('btn-dismiss-handoff').addEventListener('click', () => {
    socket.emit('dismiss-handoff');
  });

  // End turn (floating map button)
  document.getElementById('btn-end-slot').addEventListener('click', () => {
    socket.emit('player-action', { action: 'endSlot' });
  });

  // Auction
  document.getElementById('btn-bid').addEventListener('click', () => {
    const amount = parseInt(document.getElementById('auction-bid-input').value);
    if (!isNaN(amount)) socket.emit('bid-auction', { bidAmount: amount });
  });
  document.getElementById('btn-pass-auction').addEventListener('click', () => {
    socket.emit('pass-auction');
  });

  // Reno complete
  document.getElementById('btn-dismiss-reno').addEventListener('click', () => {
    pendingRenoResults = null;
    hideOverlay('overlay-reno');
    renderPhaseOverlays();
  });

  // Influence modal cancel
  document.getElementById('btn-cancel-influence').addEventListener('click', () => {
    document.getElementById('modal-influence').classList.add('hidden');
    influencePending = null;
  });

  // Amount modal
  document.getElementById('btn-cancel-amount').addEventListener('click', () => {
    document.getElementById('modal-amount').classList.add('hidden');
    amtModalCallback = null;
  });
  document.getElementById('btn-confirm-amount').addEventListener('click', () => {
    const val = parseInt(document.getElementById('amt-input').value);
    if (!isNaN(val) && amtModalCallback) {
      amtModalCallback(val);
      amtModalCallback = null;
      document.getElementById('modal-amount').classList.add('hidden');
    }
  });
  document.getElementById('amt-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-confirm-amount').click();
  });

  // Log toggle
  document.getElementById('game-log-btn').addEventListener('click', () => {
    logPanelOpen = !logPanelOpen;
    const panel = document.getElementById('game-log-panel');
    if (logPanelOpen) {
      panel.classList.remove('hidden');
      renderLog();
    } else {
      panel.classList.add('hidden');
    }
  });

  // Market modal (header + dock buttons)
  document.getElementById('hdr-market-btn').addEventListener('click', () => openMarketModal());
  document.getElementById('btn-close-market').addEventListener('click', () => {
    document.getElementById('modal-market').classList.add('hidden');
  });
  document.getElementById('dock-market-btn').addEventListener('click', () => openMarketModal());

  // My Properties dock button
  document.getElementById('dock-props-btn').addEventListener('click', () => {
    const pop = document.getElementById('props-popover');
    if (!pop.classList.contains('hidden')) { pop.classList.add('hidden'); document.getElementById('dock-props-btn').classList.remove('active'); return; }
    renderPropsPopover();
    document.getElementById('dock-props-btn').classList.add('active');
  });

  // Events dock button
  document.getElementById('dock-events-btn').addEventListener('click', () => {
    const pop = document.getElementById('events-popover');
    if (!pop.classList.contains('hidden')) { pop.classList.add('hidden'); document.getElementById('dock-events-btn').classList.remove('active'); return; }
    renderEventsPopover();
    document.getElementById('dock-events-btn').classList.add('active');
  });

  // Emote dock button — toggle picker
  document.getElementById('dock-emote-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const picker = document.getElementById('emote-picker');
    picker.classList.toggle('hidden');
    document.getElementById('dock-emote-btn').classList.toggle('active', !picker.classList.contains('hidden'));
  });

  // Emote picker button clicks
  document.getElementById('emote-picker').addEventListener('click', e => {
    const btn = e.target.closest('.emote-pick-btn');
    if (!btn) return;
    const emoteId = btn.dataset.emote;
    if (!VALID_EMOTES.includes(emoteId)) return;
    socket.emit('emote', { emoteId });
    // Close picker
    document.getElementById('emote-picker').classList.add('hidden');
    document.getElementById('dock-emote-btn').classList.remove('active');
  });

  // Property info modal close
  document.getElementById('btn-close-prop-info').addEventListener('click', () => {
    document.getElementById('modal-prop-info').classList.add('hidden');
  });

  // Prop info button (delegated on market modal content)
  document.getElementById('modal-market-content').addEventListener('click', e => {
    const btn = e.target.closest('.prop-info-btn');
    if (!btn) return;
    e.stopPropagation();
    const prop = JSON.parse(btn.dataset.propInfo);
    showPropInfoModal(prop);
  });

  // Close popovers on outside click
  document.addEventListener('click', e => {
    ['events-popover','props-popover'].forEach(id => {
      const pop = document.getElementById(id);
      const btnId = id === 'events-popover' ? 'dock-events-btn' : 'dock-props-btn';
      if (pop && !pop.classList.contains('hidden') && !pop.contains(e.target) && !document.getElementById(btnId).contains(e.target)) {
        pop.classList.add('hidden');
        document.getElementById(btnId).classList.remove('active');
      }
    });
    // Close emote picker on outside click
    const emotePicker = document.getElementById('emote-picker');
    const emoteBtn    = document.getElementById('dock-emote-btn');
    if (emotePicker && !emotePicker.classList.contains('hidden') &&
        !emotePicker.contains(e.target) && !emoteBtn.contains(e.target)) {
      emotePicker.classList.add('hidden');
      emoteBtn.classList.remove('active');
    }
  });

  // Help modal (in-game header)
  document.getElementById('hdr-help-btn').addEventListener('click', () => {
    document.getElementById('modal-help').classList.remove('hidden');
  });
  document.getElementById('btn-close-help').addEventListener('click', () => {
    document.getElementById('modal-help').classList.add('hidden');
  });

  // Mute toggle
  document.getElementById('hdr-mute-btn').addEventListener('click', () => {
    soundMuted = !soundMuted;
    const btn = document.getElementById('hdr-mute-btn');
    btn.classList.toggle('muted', soundMuted);
    btn.title = soundMuted ? 'Unmute Sound' : 'Toggle Sound';
  });
}

function initHelpModal() {
  // Lobby help button
  const lobbyBtn = document.getElementById('btn-lobby-help');
  if (lobbyBtn) {
    lobbyBtn.addEventListener('click', () => {
      document.getElementById('modal-help').classList.remove('hidden');
    });
  }
}

function renderLog() {
  if (!G || !logPanelOpen) return;
  const el = document.getElementById('game-log-panel');
  el.innerHTML = `<div class="log-title">Game Log</div>` +
    [...(G.log || [])].reverse().map(entry => `<div class="log-item">${escHtml(entry)}</div>`).join('');
}

// ── Init ───────────────────────────────────────────────────
function init() {
  initSocket();
  initLobby();
  initGameButtons();
  initHelpModal();
}

document.addEventListener('DOMContentLoaded', init);
