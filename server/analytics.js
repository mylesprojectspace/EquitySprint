// ============================================================
// EQUITY SPRINT ONLINE — Analytics & Game Logging
// Structured action logging, JSON file persistence, REST API
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'game-logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ============================================================
// Logging functions (called from server.js during gameplay)
// ============================================================

function logAction(room, entry) {
  if (!room.actionLog) room.actionLog = [];
  room.actionLog.push(entry);
}

function logWheelSpin(room, entry) {
  if (!room.wheelSpins) room.wheelSpins = [];
  room.wheelSpins.push(entry);
}

function takeYearSnapshot(room, G) {
  if (!room.yearSnapshots) room.yearSnapshots = [];
  room.yearSnapshots.push({
    year: G.year - 1, // snapshot is for the year that just ended
    players: G.players.map(p => ({
      name:         p.name,
      isBot:        !!p.isBot,
      netWorth:     p.netWorth,
      cash:         Math.round(p.cash),
      properties:   p.properties.length,
      totalDebt:    p.properties.reduce((s, pr) => s + pr.debt, 0),
      salary:       p.salary,
      rentalIncome: p.rentalIncome,
    })),
  });
}

// ============================================================
// Game log file writing (called at gameover)
// ============================================================

function writeGameLog(room, roomId) {
  ensureLogDir();

  const G   = room.G;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const gameId  = roomId;
  const filename = `game_${dateStr}_${gameId}.json`;

  // Determine win condition
  const winTarget    = G.cfg?.winTarget || 1000000;
  const winCondition = G.winner && G.winner.netWorth >= winTarget ? 'netWorthTarget' : 'maxYears';

  // Take final snapshot
  if (room.yearSnapshots) {
    room.yearSnapshots.push({
      year: G.year,
      players: G.players.map(p => ({
        name:         p.name,
        isBot:        !!p.isBot,
        netWorth:     p.netWorth,
        cash:         Math.round(p.cash),
        properties:   p.properties.length,
        totalDebt:    p.properties.reduce((s, pr) => s + pr.debt, 0),
        salary:       p.salary,
        rentalIncome: p.rentalIncome,
      })),
    });
  }

  const gameLog = {
    gameId,
    startedAt:   room.gameStartedAt || null,
    endedAt:     now.toISOString(),
    players:     G.players.map((p, i) => ({
      name:            p.name,
      isBot:           !!p.isBot,
      avatarIdx:       p.avatarIdx,
      finalNetWorth:   p.netWorth,
      finalCash:       Math.round(p.cash),
      propertiesOwned: p.properties.length,
      totalDebt:       p.properties.reduce((s, pr) => s + pr.debt, 0),
      salary:          p.salary,
      rentalIncome:    p.rentalIncome,
      propertyDetails: p.properties.map(pr => ({
        city:          pr.city,
        rarity:        pr.rarity,
        currentValue:  pr.currentValue,
        debt:          pr.debt,
        currentRent:   pr.currentRent,
        purchasePrice: pr.purchasePrice,
        purchaseYear:  pr._purchaseYear,
        renovated:     pr.renovated,
        developed:     pr.developed,
      })),
    })),
    winner: G.winner ? {
      name:      G.winner.name,
      netWorth:  G.winner.netWorth,
      isBot:     !!G.winner.isBot,
      playerIdx: G.players.indexOf(G.winner),
    } : null,
    winCondition,
    yearReached:  G.year,
    totalYears:   G.cfg?.maxYears || 10,
    playerCount:  G.players.length,
    botCount:     G.players.filter(p => p.isBot).length,
    gameConfig:   G.cfg || null,
    actions:      room.actionLog || [],
    yearSnapshots: room.yearSnapshots || [],
    wheelSpins:   room.wheelSpins || [],
  };

  // Write individual game file
  const filePath = path.join(LOG_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(gameLog, null, 2), 'utf8');
    console.log(`[Analytics] Game log written: ${filename}`);
  } catch (err) {
    console.error(`[Analytics] Failed to write game log: ${err.message}`);
    return;
  }

  // Update index
  updateIndex({
    gameId,
    file:        filename,
    startedAt:   room.gameStartedAt || null,
    endedAt:     now.toISOString(),
    winnerName:  G.winner?.name || 'Unknown',
    winnerIsBot: !!G.winner?.isBot,
    winCondition,
    yearReached: G.year,
    playerCount: G.players.length,
    botCount:    G.players.filter(p => p.isBot).length,
    playerNames: G.players.map(p => p.name),
  });
}

function updateIndex(entry) {
  const indexPath = path.join(LOG_DIR, 'game-log-index.json');
  let index = [];
  try {
    if (fs.existsSync(indexPath)) {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    }
  } catch (err) {
    console.error(`[Analytics] Failed to read index: ${err.message}`);
    index = [];
  }
  index.push(entry);
  try {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
  } catch (err) {
    console.error(`[Analytics] Failed to write index: ${err.message}`);
  }
}

// ============================================================
// REST API endpoints + admin route
// ============================================================

function registerRoutes(app, rooms) {
  ensureLogDir();

  // GET /api/games — index of all completed games
  app.get('/api/games', (req, res) => {
    const indexPath = path.join(LOG_DIR, 'game-log-index.json');
    if (!fs.existsSync(indexPath)) return res.json([]);
    try {
      res.json(JSON.parse(fs.readFileSync(indexPath, 'utf8')));
    } catch (err) {
      res.status(500).json({ error: 'Failed to read index' });
    }
  });

  // GET /api/games/summary — aggregated stats across all games
  app.get('/api/games/summary', (req, res) => {
    try {
      res.json(computeSummary());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/games/latest — most recent game log
  app.get('/api/games/latest', (req, res) => {
    const indexPath = path.join(LOG_DIR, 'game-log-index.json');
    if (!fs.existsSync(indexPath)) return res.status(404).json({ error: 'No games found' });
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      if (index.length === 0) return res.status(404).json({ error: 'No games found' });
      const latest = index[index.length - 1];
      const filePath = path.join(LOG_DIR, latest.file);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Game file not found' });
      res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/games/:gameId — specific game log
  app.get('/api/games/:gameId', (req, res) => {
    const gameId = req.params.gameId;
    // Find matching file in log dir
    try {
      const files = fs.readdirSync(LOG_DIR).filter(f => f.includes(gameId) && f.endsWith('.json') && f !== 'game-log-index.json');
      if (files.length === 0) return res.status(404).json({ error: `Game ${gameId} not found` });
      const filePath = path.join(LOG_DIR, files[0]);
      res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /admin — admin dashboard
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'admin.html'));
  });
}

// ============================================================
// Summary computation
// ============================================================

function computeSummary() {
  const indexPath = path.join(LOG_DIR, 'game-log-index.json');
  if (!fs.existsSync(indexPath)) return { totalGames: 0 };

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (index.length === 0) return { totalGames: 0 };

  const summary = {
    totalGames:          index.length,
    humanWins:           0,
    botWins:             0,
    winsByNetWorthTarget: 0,
    winsByMaxYears:      0,
    averageGameLength:   0,
    averageWinnerNetWorth: 0,
    averagePropertiesAtGameEnd: 0,
    actionFrequency:     {},
    propertyTiersPurchased: { standard: 0, premium: 0, rare: 0, legendary: 0 },
  };

  let totalYears = 0;
  let totalWinnerNW = 0;
  let totalProps = 0;
  let totalPlayers = 0;

  for (const entry of index) {
    // Win stats
    if (entry.winnerIsBot) summary.botWins++;
    else summary.humanWins++;
    if (entry.winCondition === 'netWorthTarget') summary.winsByNetWorthTarget++;
    else summary.winsByMaxYears++;
    totalYears += entry.yearReached || 0;

    // Load full game log for detailed stats
    const filePath = path.join(LOG_DIR, entry.file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const game = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Winner net worth
      if (game.winner) totalWinnerNW += game.winner.netWorth;

      // Properties at game end
      if (game.players) {
        game.players.forEach(p => {
          totalProps += p.propertiesOwned || 0;
          totalPlayers++;
          // Property tiers
          if (p.propertyDetails) {
            p.propertyDetails.forEach(pr => {
              if (summary.propertyTiersPurchased[pr.rarity] !== undefined) {
                summary.propertyTiersPurchased[pr.rarity]++;
              }
            });
          }
        });
      }

      // Action frequency
      if (game.actions) {
        game.actions.forEach(a => {
          const key = a.action || 'unknown';
          summary.actionFrequency[key] = (summary.actionFrequency[key] || 0) + 1;
        });
      }
    } catch (err) {
      // Skip corrupted files
    }
  }

  summary.averageGameLength = index.length > 0 ? +(totalYears / index.length).toFixed(1) : 0;
  summary.averageWinnerNetWorth = index.length > 0 ? Math.round(totalWinnerNW / index.length) : 0;
  summary.averagePropertiesAtGameEnd = totalPlayers > 0 ? +(totalProps / totalPlayers).toFixed(1) : 0;

  return summary;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  logAction,
  logWheelSpin,
  takeYearSnapshot,
  writeGameLog,
  registerRoutes,
};
