// ============================================================
// EQUITY SPRINT ONLINE — Socket.io Server
// Run: node server/server.js (or npm start from project root)
// Players open: http://localhost:3000
// ============================================================

'use strict';

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const engine = require('./game-engine');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// ── Serve client files ──────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// ── Room Registry ────────────────────────────────────────────
// rooms: Map<roomId, { G, playerSlots: [socketId|null, ...], hostSocket }>
const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Broadcast public state to all players in a room
function broadcastState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const publicState = engine.getPublicState(room.G);
  io.to(roomId).emit('game-state', publicState);
}

// Send private state to one player
function sendPrivateState(socket, G, playerIdx) {
  const priv = engine.getPrivateState(G, playerIdx);
  socket.emit('private-state', priv);
}

// Broadcast private states to all connected players
function broadcastAllPrivateStates(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.playerSlots.forEach((socketId, idx) => {
    if (!socketId) return;
    const socket = io.sockets.sockets.get(socketId);
    if (socket) sendPrivateState(socket, room.G, idx);
  });
}

// Broadcast action result notification to all players
function broadcastActionResult(roomId, result) {
  if (result && result.ok && result.title) {
    io.to(roomId).emit('action-result', {
      icon:  result.icon  || '',
      title: result.title || '',
      lines: result.lines || [],
    });
  }
}

// Emit error to a single socket
function emitError(socket, msg) {
  socket.emit('error', { message: msg });
}

// Helper: find which playerIdx a socket maps to in a room
function getPlayerIdx(room, socketId) {
  return room.playerSlots.indexOf(socketId);
}

// ── Bot AI ───────────────────────────────────────────────────

function getBotActingIdx(G) {
  if (!G) return null;
  switch (G.phase) {
    case 'wheelSpin':
      return (!G.wheelSpun && G.players[G.firstThisYear]?.isBot) ? G.firstThisYear : null;
    case 'yearstart':
    case 'handoff':
    case 'action':
      return G.players[G.currentPlayerIdx]?.isBot ? G.currentPlayerIdx : null;
    case 'auction': {
      const t = G.pendingAuction?.biddingTurn;
      return (t != null && !G.pendingAuction.passed[t] && G.players[t]?.isBot) ? t : null;
    }
    default: return null;
  }
}

function maybeTriggerBot(roomId) {
  const room = rooms.get(roomId);
  if (!room?.G || room.G.phase === 'gameover') return;
  if (getBotActingIdx(room.G) === null) return;
  clearTimeout(room.botTimer);
  room.botTimer = setTimeout(() => runBotTurn(roomId), 1300);
}

function runBotTurn(roomId) {
  const room = rooms.get(roomId);
  if (!room?.G) return;
  const G = room.G;
  const botIdx = getBotActingIdx(G);
  if (botIdx === null) return;

  switch (G.phase) {
    case 'wheelSpin': {
      const result = engine.spinWheel(G, botIdx);
      io.to(roomId).emit('wheel-result', { category: result.category, card: result.card, spinnerIdx: botIdx });
      broadcastState(roomId);
      broadcastAllPrivateStates(roomId);
      // Acknowledge after wheel animation
      clearTimeout(room.botTimer);
      room.botTimer = setTimeout(() => {
        engine.acknowledgeWheelResult(G);
        broadcastState(roomId);
        broadcastAllPrivateStates(roomId);
        maybeTriggerBot(roomId);
      }, 3200);
      return;
    }
    case 'yearstart':
      G.phase = 'handoff';
      broadcastState(roomId);
      break;
    case 'handoff': {
      G.phase = 'action';
      const renoResults = engine.checkPendingRenovations(G, botIdx);
      if (renoResults.length) io.to(roomId).emit('reno-complete', renoResults);
      const devResults = engine.checkPendingDevelopments(G, botIdx);
      if (devResults.length) io.to(roomId).emit('dev-complete', devResults);
      broadcastState(roomId);
      broadcastAllPrivateStates(roomId);
      break;
    }
    case 'action': {
      const player = G.players[botIdx];
      let acted = false;
      if (!player.blocked && G.actionsUsedThisSlot < 2) {
        const allMarket = [...G.market.metro, ...G.market.regional];
        const affordable = allMarket.filter(p => {
          const dep = p.price * (G.activeRestrictions.depositRate || 0.20);
          const newRep = (p.price - dep) * (player.interestRate + (G.activeRestrictions.stressBuffer || 0.02));
          return player.cash >= dep && (player.serviceability - newRep) >= 0;
        }).sort((a, b) => a.price - b.price);
        if (affordable.length > 0 && player.properties.length < 3) {
          const result = engine.actionBuy(G, botIdx, affordable[0]._lid);
          if (result.ok) { broadcastActionResult(roomId, result); acted = true; }
        }
      }
      // Bot ends turn after acting or when out of actions
      if (!acted || G.actionsUsedThisSlot >= 2) engine.endActionSlot(G);
      broadcastState(roomId);
      broadcastAllPrivateStates(roomId);
      break;
    }
    case 'auction':
      engine.passAuction(G, botIdx);
      broadcastState(roomId);
      broadcastAllPrivateStates(roomId);
      break;
  }
  maybeTriggerBot(roomId);
}

// ── Socket.io Connection ─────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // ── create-room ──────────────────────────────────────────
  // Payload: { playerName: string, maxPlayers: number (2-4) }
  socket.on('create-room', ({ playerName, maxPlayers }) => {
    maxPlayers = Math.min(4, Math.max(2, parseInt(maxPlayers) || 2));
    const roomId = generateRoomId();
    const playerSlots = Array(maxPlayers).fill(null);
    playerSlots[0] = socket.id;

    rooms.set(roomId, {
      G: null,            // not initialised until game starts
      playerSlots,
      maxPlayers,
      playerNames:   [playerName, ...Array(maxPlayers - 1).fill(null)],
      botSlots:      Array(maxPlayers).fill(false),
      playerAvatars: Array(maxPlayers).fill(null).map((_, i) => i + 1),
      botTimer:    null,
      hostSocket: socket.id,
      started: false,
    });

    socket.join(roomId);
    socket.data.roomId    = roomId;
    socket.data.playerIdx = 0;

    socket.emit('room-created', { roomId, playerIdx: 0, maxPlayers });
    console.log(`Room ${roomId} created by ${playerName} (max ${maxPlayers} players)`);
  });

  // ── join-room ────────────────────────────────────────────
  // Payload: { roomId: string, playerName: string }
  socket.on('join-room', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (!room) return emitError(socket, `Room ${roomId} not found.`);
    if (room.started) return emitError(socket, 'Game already in progress.');

    const emptySlot = room.playerSlots.indexOf(null);
    if (emptySlot === -1) return emitError(socket, 'Room is full.');

    room.playerSlots[emptySlot] = socket.id;
    room.playerNames[emptySlot] = playerName;

    socket.join(roomId);
    socket.data.roomId    = roomId;
    socket.data.playerIdx = emptySlot;

    socket.emit('room-joined', { roomId, playerIdx: emptySlot });
    io.to(roomId).emit('lobby-update', {
      players: room.playerNames.map((n, i) => ({ name: n, connected: !!room.playerSlots[i], isBot: room.botSlots[i], avatarIdx: room.playerAvatars[i] })),
      maxPlayers: room.maxPlayers,
    });
    console.log(`${playerName} joined room ${roomId} as player ${emptySlot}`);
  });

  // ── add-bot ──────────────────────────────────────────────
  // Host adds a bot player to fill an empty slot
  socket.on('add-bot', () => {
    const roomId = socket.data.roomId;
    const room   = rooms.get(roomId);
    if (!room || room.started || socket.id !== room.hostSocket) return;
    const emptySlot = room.playerSlots.indexOf(null);
    if (emptySlot === -1) return;
    const botName = `Bot ${emptySlot + 1}`;
    room.playerSlots[emptySlot] = 'BOT';
    room.playerNames[emptySlot] = botName;
    room.botSlots[emptySlot]    = true;
    io.to(roomId).emit('lobby-update', {
      players:    room.playerNames.map((n, i) => ({ name: n, connected: !!room.playerSlots[i], isBot: room.botSlots[i], avatarIdx: room.playerAvatars[i] })),
      maxPlayers: room.maxPlayers,
    });
    console.log(`Bot added to room ${roomId} as player ${emptySlot}`);
  });

  // ── set-avatar ───────────────────────────────────────────
  // Player picks their avatar in the waiting room
  socket.on('set-avatar', ({ avatarIdx }) => {
    const roomId = socket.data.roomId;
    const room   = rooms.get(roomId);
    if (!room || room.started) return;
    const playerIdx = getPlayerIdx(room, socket.id);
    if (playerIdx === -1) return;
    room.playerAvatars[playerIdx] = Math.min(5, Math.max(1, parseInt(avatarIdx) || 1));
    io.to(roomId).emit('lobby-update', {
      players:    room.playerNames.map((n, i) => ({ name: n, connected: !!room.playerSlots[i], isBot: room.botSlots[i], avatarIdx: room.playerAvatars[i] })),
      maxPlayers: room.maxPlayers,
    });
  });

  // ── start-game ───────────────────────────────────────────
  // Only host can start. All slots must be filled.
  socket.on('start-game', () => {
    const roomId = socket.data.roomId;
    const room   = rooms.get(roomId);
    if (!room) return emitError(socket, 'Not in a room.');
    if (socket.id !== room.hostSocket) return emitError(socket, 'Only the host can start the game.');
    if (room.playerSlots.some(s => s === null)) return emitError(socket, 'Waiting for all players to join.');
    if (room.started) return emitError(socket, 'Game already started.');

    room.G       = engine.initGame(room.playerNames, room.botSlots, room.playerAvatars);
    room.started = true;

    broadcastState(roomId);
    broadcastAllPrivateStates(roomId);
    maybeTriggerBot(roomId);
    console.log(`Game started in room ${roomId}`);
  });

  // ── request-state ────────────────────────────────────────
  // Player reconnecting or refreshing — re-send their state
  socket.on('request-state', () => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || !room.G) return emitError(socket, 'No active game.');
    broadcastState(roomId);
    sendPrivateState(socket, room.G, playerIdx);
  });

  // ── spin-wheel ───────────────────────────────────────────
  // Payload: (none) — spinning player is derived from G.firstThisYear
  socket.on('spin-wheel', () => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || !room.G) return emitError(socket, 'No active game.');

    const G = room.G;
    if (G.phase !== 'wheelSpin') return emitError(socket, 'Not the wheel spin phase.');
    if (playerIdx !== G.firstThisYear) return emitError(socket, 'Not your turn to spin.');
    if (G.wheelSpun) return emitError(socket, 'Wheel already spun this year.');

    const result = engine.spinWheel(G, playerIdx);
    io.to(roomId).emit('wheel-result', {
      category:   result.category,
      card:       result.card,
      spinnerIdx: result.spinnerIdx,
    });

    // If influence or chance: private deal with player handled inside engine
    // Broadcast updated state + private states
    broadcastState(roomId);
    broadcastAllPrivateStates(roomId);
    maybeTriggerBot(roomId);
  });

  // ── acknowledge-wheel ────────────────────────────────────
  // Spinning player dismisses the wheel result overlay
  socket.on('acknowledge-wheel', () => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || !room.G) return emitError(socket, 'No active game.');

    const G = room.G;
    if (playerIdx !== G.firstThisYear) return emitError(socket, 'Only the spinning player can continue.');

    engine.acknowledgeWheelResult(G);
    broadcastState(roomId);
    broadcastAllPrivateStates(roomId);
    maybeTriggerBot(roomId);
  });

  // ── play-influence ───────────────────────────────────────
  // Payload: { handId, targetPlayerIdx?, targetOwnedId? }
  socket.on('play-influence', ({ handId, targetPlayerIdx, targetOwnedId }) => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || !room.G) return emitError(socket, 'No active game.');

    const result = engine.playInfluenceCard(room.G, playerIdx, handId, targetPlayerIdx, targetOwnedId);
    if (!result.ok) return emitError(socket, result.reason);

    broadcastState(roomId);
    broadcastAllPrivateStates(roomId);
  });

  // ── player-action ────────────────────────────────────────
  // Payload: { action: string, ...params }
  // action: 'buy' | 'reduceDebt' | 'renovate' | 'sell' | 'releaseEquity' | 'develop' | 'setManager' | 'endSlot'
  socket.on('player-action', (payload) => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || !room.G) return emitError(socket, 'No active game.');

    const G = room.G;
    if (G.phase !== 'action' && payload.action !== 'endSlot') {
      return emitError(socket, `Cannot act in phase: ${G.phase}`);
    }
    if (playerIdx !== G.currentPlayerIdx && payload.action !== 'setManager') {
      return emitError(socket, 'Not your turn.');
    }

    let result = { ok: true };

    switch (payload.action) {
      case 'buy':
        result = engine.actionBuy(G, playerIdx, payload.lid);
        break;
      case 'reduceDebt':
        result = engine.actionReduceDebt(G, playerIdx, payload.oid, payload.amount);
        break;
      case 'renovate':
        result = engine.actionRenovate(G, playerIdx, payload.oid);
        break;
      case 'sell':
        result = engine.actionSell(G, playerIdx, payload.oid);
        break;
      case 'releaseEquity':
        result = engine.actionReleaseEquity(G, playerIdx, payload.oid, payload.amount);
        break;
      case 'develop':
        result = engine.actionDevelop(G, playerIdx, payload.oid);
        break;
      case 'setManager':
        result = engine.actionSetManager(G, playerIdx, payload.oid, payload.tier);
        break;
      case 'endSlot':
        engine.endActionSlot(G);
        result = { ok: true };
        break;
      default:
        return emitError(socket, `Unknown action: ${payload.action}`);
    }

    if (!result.ok) return emitError(socket, result.reason);

    // Slot-consuming actions automatically advance the turn (1 action per slot per rules)
    const SLOT_CONSUMING = ['buy', 'reduceDebt', 'renovate', 'sell', 'releaseEquity', 'develop'];
    if (SLOT_CONSUMING.includes(payload.action) && G.phase !== 'gameover') {
      engine.endActionSlot(G);
    }

    broadcastActionResult(roomId, result);
    broadcastState(roomId);
    broadcastAllPrivateStates(roomId);
    maybeTriggerBot(roomId);
  });

  // ── dismiss-year-start ───────────────────────────────────
  socket.on('dismiss-year-start', () => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || !room.G) return;

    const G = room.G;
    if (G.phase !== 'yearstart') return;
    if (playerIdx !== G.currentPlayerIdx) return;

    G.phase = 'handoff';
    broadcastState(roomId);
    maybeTriggerBot(roomId);
  });

  // ── dismiss-handoff ──────────────────────────────────────
  socket.on('dismiss-handoff', () => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || !room.G) return;

    const G = room.G;
    if (G.phase !== 'handoff') return;
    if (playerIdx !== G.currentPlayerIdx) return;

    G.phase = 'action';
    // Check for completed renovations + developments
    const renoResults = engine.checkPendingRenovations(G, playerIdx);
    if (renoResults.length) io.to(roomId).emit('reno-complete', renoResults);
    const devResults = engine.checkPendingDevelopments(G, playerIdx);
    if (devResults.length) io.to(roomId).emit('dev-complete', devResults);
    broadcastState(roomId);
    broadcastAllPrivateStates(roomId);
    maybeTriggerBot(roomId);
  });

  // ── bid-auction ──────────────────────────────────────────
  // Payload: { bidAmount: number }
  socket.on('bid-auction', ({ bidAmount }) => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || !room.G) return;

    const result = engine.placeBid(room.G, playerIdx, bidAmount);
    if (!result.ok) return emitError(socket, result.reason);
    broadcastState(roomId);
    maybeTriggerBot(roomId);
  });

  // ── pass-auction ─────────────────────────────────────────
  socket.on('pass-auction', () => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || !room.G) return;

    engine.passAuction(room.G, playerIdx);
    broadcastState(roomId);
    broadcastAllPrivateStates(roomId);
    maybeTriggerBot(roomId);
  });

  // ── emote ────────────────────────────────────────────────
  // Payload: { emoteId: string }
  const VALID_EMOTES = ['angry', 'broke', 'confused', 'cry-laugh', 'shocked', 'wink'];
  socket.on('emote', ({ emoteId }) => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || !VALID_EMOTES.includes(emoteId)) return;
    io.to(roomId).emit('player-emote', { playerIdx, emoteId });
  });

  // ── send-chat ────────────────────────────────────────────
  socket.on('send-chat', ({ text }) => {
    const roomId    = socket.data.roomId;
    const playerIdx = socket.data.playerIdx;
    const room      = rooms.get(roomId);
    if (!room || typeof text !== 'string') return;
    const clean = text.trim().slice(0, 200);
    if (!clean) return;
    const name = room.G
      ? (room.G.players[playerIdx]?.name || 'Player')
      : (room.playerNames[playerIdx] || 'Player');
    io.to(roomId).emit('chat-message', { playerIdx, name, text: clean });
  });

  // ── disconnect ───────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const idx = room.playerSlots.indexOf(socket.id);
    if (idx !== -1 && !room.started) {
      // Pre-game: free the slot
      room.playerSlots[idx]  = null;
      room.playerNames[idx]  = null;
      io.to(roomId).emit('lobby-update', {
        players:    room.playerNames.map((n, i) => ({ name: n, connected: !!room.playerSlots[i], isBot: room.botSlots[i], avatarIdx: room.playerAvatars[i] })),
        maxPlayers: room.maxPlayers,
      });
    }
    // In-game disconnects: slot remains reserved for reconnect
    // TODO: add reconnect token support in a future update
  });
});

// ── Start ────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Equity Sprint Online — server running at http://localhost:${PORT}`);
});
