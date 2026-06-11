const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const cors   = require("cors");

const app    = express();
const server = http.createServer(app);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production set FRONTEND_URL env var to your Vercel URL.
// In development every local/LAN origin is allowed.
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || null;

function isOriginAllowed(origin) {
  if (!origin) return true; // same-origin / server-to-server
  if (!ALLOWED_ORIGIN) {
    // dev: allow localhost + LAN IPs
    return (
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      /^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(origin)
    );
  }
  // prod: exact match or any *.vercel.app preview
  return origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app");
}

const corsOptions = {
  origin: (origin, cb) => (isOriginAllowed(origin) ? cb(null, true) : cb(new Error("CORS"))),
  methods: ["GET", "POST"],
};

const io = new Server(server, {
  cors: corsOptions,
  // Prefer WebSocket; fall back to polling for clients behind proxies
  transports: ["websocket", "polling"],
});

app.use(cors(corsOptions));
app.use(express.json());

// Health check — Render pings this to keep the instance alive
app.get("/", (req, res) => {
  res.json({
    status: "IB Digital Banker — OK",
    rooms:  Object.keys(rooms).length,
    uptime: Math.floor(process.uptime()),
  });
});

// ─── State persistence ────────────────────────────────────────────────────────
// Writes active room state to disk every 30 s so a server restart can
// restore in-progress games.  Players reconnect via their existing stableId /
// SESSION_ID and the reconnect_player / reconnect_banker events.
const fs         = require("fs");
const path       = require("path");
const STATE_FILE = path.join(__dirname, ".game-state.json");

function persistState() {
  try {
    // Strip runtime-only fields that can't survive a restart
    const snapshot = {};
    Object.entries(rooms).forEach(([code, room]) => {
      if (!room.started) return; // don't persist lobby rooms
      snapshot[code] = {
        ...room,
        _autoEndTimer: undefined, // can't serialise a timer handle
      };
    });
    fs.writeFileSync(STATE_FILE, JSON.stringify(snapshot, null, 2), "utf8");
  } catch (e) {
    console.error("[persist] write failed:", e.message);
  }
}

function loadPersistedState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw  = fs.readFileSync(STATE_FILE, "utf8");
    const data = JSON.parse(raw);
    const now  = Date.now();
    let loaded = 0;
    Object.entries(data).forEach(([code, room]) => {
      // Drop rooms whose timer already expired
      if (room.endsAt && new Date(room.endsAt).getTime() < now) return;
      // Mark all players offline — they must reconnect
      room.players.forEach(p => { p.online = false; p.socketId = null; });
      rooms[code] = room;
      // Re-arm the auto-end timer
      scheduleAutoEnd(room);
      loaded++;
    });
    if (loaded > 0) console.log(`[persist] restored ${loaded} room(s) from disk`);
    // Clean up the file after loading
    fs.unlinkSync(STATE_FILE);
  } catch (e) {
    console.error("[persist] load failed:", e.message);
  }
}

// Persist every 30 seconds
setInterval(persistState, 30_000);

// Persist on clean shutdown (SIGTERM from Render, Ctrl+C, etc.)
["SIGTERM", "SIGINT"].forEach(sig => {
  process.on(sig, () => {
    persistState();
    process.exit(0);
  });
});

// ─── In-memory state ──────────────────────────────────────────────────────────
const rooms        = {};  // roomCode  → room object
const socketMap    = {};  // socketId  → { roomCode, stableId, isBanker }
const stableToSocket = {}; // stableId → socketId

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid()  { return Math.random().toString(36).substr(2, 6).toUpperCase(); }
function ts()   {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
function money(n) { return "$" + Math.abs(n).toLocaleString(); }
function getRoom(code) { return rooms[code] || null; }

// ── Personalised state snapshots ──────────────────────────────────────────────
function snapBanker(room) {
  return {
    roomName:        room.roomName,
    bankerName:      room.bankerName,
    startMoney:      room.startMoney,
    durationMinutes: room.durationMinutes,
    startedAt:       room.startedAt,
    endsAt:          room.endsAt,
    round:           room.round,
    started:         room.started,
    players:         room.players,
    transactions:    room.transactions.slice(0, 100),
    isBankerView:    true,
  };
}

function snapPlayer(room, stableId) {
  const player     = room.players.find(p => p.stableId === stableId);
  const myHistory  = player ? player.history.slice(0, 100) : [];
  return {
    roomName:        room.roomName,
    bankerName:      room.bankerName,
    startMoney:      room.startMoney,
    durationMinutes: room.durationMinutes,
    startedAt:       room.startedAt,
    endsAt:          room.endsAt,
    round:           room.round,
    started:         room.started,
    players:         room.players.map(p => ({
      ...p,
      // Strip other players' private history
      history: p.stableId === stableId ? p.history.slice(0, 100) : [],
    })),
    transactions:    [],       // players never see global list
    myHistory,
    myStableId:      stableId,
    isBankerView:    false,
  };
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
// Debounce timers per room — collapse rapid-fire broadcasts (e.g. adjust_all) into one
const _broadcastTimers = {};

function broadcast(roomCode) {
  if (_broadcastTimers[roomCode]) return; // already scheduled
  _broadcastTimers[roomCode] = setTimeout(() => {
    delete _broadcastTimers[roomCode];
    const room = getRoom(roomCode);
    if (!room) return;

    const bSock = stableToSocket[room.bankerSessionId];
    if (bSock) io.to(bSock).emit("room_update", snapBanker(room));

    room.players.forEach(p => {
      const pSock = stableToSocket[p.stableId];
      if (pSock) io.to(pSock).emit("room_update", snapPlayer(room, p.stableId));
    });
  }, 40); // 40ms window — imperceptible to humans, collapses same-tick calls
}

// Immediate broadcast — bypasses debounce. Use for game_started, end_game.
function broadcastNow(roomCode) {
  if (_broadcastTimers[roomCode]) {
    clearTimeout(_broadcastTimers[roomCode]);
    delete _broadcastTimers[roomCode];
  }
  const room = getRoom(roomCode);
  if (!room) return;

  const bSock = stableToSocket[room.bankerSessionId];
  if (bSock) io.to(bSock).emit("room_update", snapBanker(room));

  room.players.forEach(p => {
    const pSock = stableToSocket[p.stableId];
    if (pSock) io.to(pSock).emit("room_update", snapPlayer(room, p.stableId));
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────
function notifyStable(stableId, message, type = "info") {
  const sid = stableToSocket[stableId];
  if (sid) io.to(sid).emit("notification", { message, type });
}
function notifyRoom(roomCode, message, type = "info") {
  io.to(roomCode).emit("notification", { message, type });
}

// ── Transaction helper ────────────────────────────────────────────────────────
function playerName(room, stableId) {
  if (stableId === "bank") return "Bank";
  return (room.players.find(p => p.stableId === stableId) || { name: "Unknown" }).name;
}

function flowType(fromId, toId) {
  if (toId   === "bank") return "to_bank";
  if (fromId === "bank") return "from_bank";
  return "player_to_player";
}

function addTx(room, { fromId, toId, amount, participantIds }) {
  const tx = {
    id:       uid(),
    time:     ts(),
    fromId,
    fromName: playerName(room, fromId),
    toId,
    toName:   playerName(room, toId),
    amount:   Math.abs(parseInt(amount) || 0),
    flowType: flowType(fromId, toId),
  };

  room.transactions.unshift(tx);
  if (room.transactions.length > 300) room.transactions = room.transactions.slice(0, 300);

  const ids = participantIds || [fromId, toId].filter(id => id && id !== "bank");
  [...new Set(ids)].forEach(sid => {
    const p = room.players.find(pp => pp.stableId === sid);
    if (p) {
      p.history.unshift(tx);
      if (p.history.length > 100) p.history = p.history.slice(0, 100);
    }
  });

  return tx;
}

// ── Auto-end game when timer expires ─────────────────────────────────────────
function scheduleAutoEnd(room) {
  if (!room.endsAt) return;
  const ms = new Date(room.endsAt).getTime() - Date.now();
  if (ms <= 0) return;

  room._autoEndTimer = setTimeout(() => {
    const r = getRoom(room.roomCode);
    if (!r || !r.started) return;
    const players = r.players
      .filter(p => !p.pending)
      .sort((a, b) => b.balance - a.balance);
    io.to(r.roomCode).emit("game_ended", { players });
    io.to(r.roomCode).emit("notification", { message: "Time's up! Game over.", type: "info" });
    cleanupRoom(r.roomCode);
  }, ms);
}

// ── Room cleanup ──────────────────────────────────────────────────────────────
function cleanupRoom(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  if (room._autoEndTimer) clearTimeout(room._autoEndTimer);
  room.players.forEach(p => delete stableToSocket[p.stableId]);
  delete stableToSocket[room.bankerSessionId];
  delete rooms[roomCode];
  persistState(); // keep saved file in sync after room removal
}

// ── Stale room cleanup (runs every 10 min) ────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  Object.values(rooms).forEach(room => {
    // Remove rooms that were created but never started after 30 min
    if (!room.started && room.createdAt && now - room.createdAt > 30 * 60 * 1000) {
      cleanupRoom(room.roomCode);
    }
    // Remove rooms where all players have been offline for 2 hours
    if (room.started) {
      const allOffline = room.players.every(
        p => !p.online && p.lastSeenAt && now - p.lastSeenAt > 2 * 60 * 60 * 1000
      );
      const bankerGone = !stableToSocket[room.bankerSessionId];
      if (allOffline && bankerGone) cleanupRoom(room.roomCode);
    }
  });
}, 10 * 60 * 1000);

// ─── Restore persisted state (runs after all helpers are defined) ────────────
loadPersistedState();

// ─── Socket.io events ─────────────────────────────────────────────────────────
io.on("connection", socket => {
  // ── CREATE GAME ─────────────────────────────────────────────────────────────
  socket.on("create_game", ({ bankerName, roomName, startMoney, durationMinutes, sessionId }) => {
    const roomCode       = uid();
    const bankerSessionId = sessionId || "banker_" + uid();
    const parsedMoney    = Math.max(1000, parseInt(startMoney) || 25000);
    const parsedDuration = Math.max(1,    parseInt(durationMinutes) || 60);

    rooms[roomCode] = {
      roomCode,
      roomName:        (roomName || "Game").trim(),
      bankerName:      (bankerName || "Banker").trim(),
      startMoney:      parsedMoney,
      durationMinutes: parsedDuration,
      players:         [],
      transactions:    [],
      round:           1,
      started:         false,
      startedAt:       null,
      endsAt:          null,
      bankerSessionId,
      createdAt:       Date.now(),
    };

    socketMap[socket.id]         = { roomCode, stableId: bankerSessionId, isBanker: true };
    stableToSocket[bankerSessionId] = socket.id;

    socket.join(roomCode);
    socket.emit("game_created", {
      roomCode, roomName: rooms[roomCode].roomName,
      bankerName: rooms[roomCode].bankerName,
      startMoney: parsedMoney, durationMinutes: parsedDuration,
      bankerSessionId,
    });
  });

  // ── JOIN GAME ────────────────────────────────────────────────────────────────
  socket.on("join_game", ({ roomCode, playerName: rawName, sessionId }) => {
    const room = getRoom(roomCode);
    if (!room) { socket.emit("error", { message: "Room not found. Check the code." }); return; }

    const name = (rawName || "").trim();
    if (!name) { socket.emit("error", { message: "Enter your name." }); return; }

    // ── Reconnect by session ID ─────────────────────────────────────────────
    if (sessionId) {
      const existing = room.players.find(p => p.stableId === sessionId);
      if (existing) {
        existing.online   = true;
        existing.socketId = socket.id;
        socketMap[socket.id]        = { roomCode, stableId: sessionId, isBanker: false };
        stableToSocket[sessionId]   = socket.id;
        socket.join(roomCode);

        if (room.started) {
          socket.emit("reconnected_to_game", snapPlayer(room, sessionId));
          notifyRoom(roomCode, `${existing.name} is back online.`, "success");
        } else {
          socket.emit("join_pending", {
            playerName: existing.name, roomName: room.roomName, roomCode, stableId: sessionId,
          });
          if (!existing.pending) socket.emit("approved");
        }
        broadcast(roomCode);
        return;
      }
    }

    // ── Reconnect by name (game started, sessionId missing) ─────────────────
    if (room.started) {
      const byName = room.players.find(
        p => p.name.toLowerCase() === name.toLowerCase() && !p.online
      );
      if (byName) {
        byName.online   = true;
        byName.socketId = socket.id;
        const sid = byName.stableId;
        socketMap[socket.id]  = { roomCode, stableId: sid, isBanker: false };
        stableToSocket[sid]   = socket.id;
        socket.join(roomCode);
        socket.emit("reconnected_to_game", snapPlayer(room, sid));
        notifyRoom(roomCode, `${name} reconnected.`, "success");
        broadcast(roomCode);
        return;
      }
      socket.emit("error", { message: "Game already started. Rejoin only works if you were in this game." });
      return;
    }

    // ── Fresh join ──────────────────────────────────────────────────────────
    const duplicate = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (duplicate) { socket.emit("error", { message: "That name is already taken." }); return; }

    const stableId = sessionId || "player_" + uid();
    const player = {
      stableId, id: stableId,
      name, balance: 0,
      cc: { used: false, remaining: 0 },
      jail: false, passport: true,
      history: [], pending: true,
      socketId: socket.id, online: true, lastSeenAt: Date.now(),
    };

    room.players.push(player);
    socketMap[socket.id]    = { roomCode, stableId, isBanker: false };
    stableToSocket[stableId] = socket.id;

    socket.join(roomCode);
    socket.emit("join_pending", {
      playerName: name, roomName: room.roomName, roomCode, stableId,
    });
    broadcast(roomCode);
  });

  // ── APPROVE PLAYER ──────────────────────────────────────────────────────────
  socket.on("approve_player", ({ playerId }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const p = room.players.find(pp => pp.stableId === playerId || pp.id === playerId);
    if (!p) return;
    p.pending = false;
    broadcast(meta.roomCode);
    notifyStable(p.stableId, "You have been approved!", "success");
    const pSock = stableToSocket[p.stableId];
    if (pSock) io.to(pSock).emit("approved");
  });

  socket.on("approve_all_players", () => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    room.players.filter(p => p.pending).forEach(p => {
      p.pending = false;
      const pSock = stableToSocket[p.stableId];
      if (pSock) io.to(pSock).emit("approved");
    });
    broadcast(meta.roomCode);
  });

  // ── REJECT PLAYER ───────────────────────────────────────────────────────────
  socket.on("reject_player", ({ playerId }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const p = room.players.find(pp => pp.stableId === playerId || pp.id === playerId);
    if (!p) return;

    const pSock = stableToSocket[p.stableId];
    if (pSock) {
      io.to(pSock).emit("rejected");
      const s = io.sockets.sockets.get(pSock);
      if (s) s.leave(meta.roomCode);
    }
    delete stableToSocket[p.stableId];
    room.players = room.players.filter(pp => pp.stableId !== p.stableId);
    broadcast(meta.roomCode);
  });

  // ── START GAME ──────────────────────────────────────────────────────────────
  socket.on("start_game", () => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;

    if (room.players.some(p => p.pending)) {
      socket.emit("error", { message: "Approve or reject all pending players first." });
      return;
    }
    const approved = room.players.filter(p => !p.pending);
    if (approved.length === 0) {
      socket.emit("error", { message: "Approve at least one player first." });
      return;
    }

    room.started   = true;
    const now      = Date.now();
    room.startedAt = new Date(now).toISOString();
    room.endsAt    = new Date(now + room.durationMinutes * 60 * 1000).toISOString();

    approved.forEach(p => {
      p.balance = room.startMoney;
      addTx(room, { fromId: "bank", toId: p.stableId, amount: room.startMoney, participantIds: [p.stableId] });
    });

    scheduleAutoEnd(room);
    broadcastNow(meta.roomCode);
    io.to(meta.roomCode).emit("game_started");
    notifyRoom(meta.roomCode, "Game started! Money distributed.", "success");
  });

  // ── BANKER: ADD / DEDUCT ────────────────────────────────────────────────────
  socket.on("banker_adjust", ({ playerId, amount, type }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const p = room.players.find(pp => pp.stableId === playerId || pp.id === playerId);
    if (!p) return;

    const amt = parseInt(amount) || 0;
    if (amt <= 0) { socket.emit("error", { message: "Enter a valid amount." }); return; }

    if (type === "add") {
      p.balance += amt;
      addTx(room, { fromId: "bank", toId: p.stableId, amount: amt, participantIds: [p.stableId] });
      notifyStable(p.stableId, `Bank credited ${money(amt)} to you.`, "success");
      // Notify banker about the action they just performed
      notifyStable(room.bankerSessionId, `✅ Added ${money(amt)} to ${p.name}.`, "success");
    } else {
      if (p.balance < amt) { socket.emit("error", { message: "Player doesn't have enough balance." }); return; }
      p.balance -= amt;
      addTx(room, { fromId: p.stableId, toId: "bank", amount: amt, participantIds: [p.stableId] });
      notifyStable(p.stableId, `Bank deducted ${money(amt)} from you.`, "error");
      // Notify banker about the action they just performed
      notifyStable(room.bankerSessionId, `➖ Deducted ${money(amt)} from ${p.name}.`, "info");
    }
    broadcast(meta.roomCode);
  });

  // ── BANKER: ADJUST ALL PLAYERS (batched) ────────────────────────────────────
  socket.on("banker_adjust_all", ({ amount, type }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;

    const amt = parseInt(amount) || 0;
    if (amt <= 0) { socket.emit("error", { message: "Enter a valid amount." }); return; }

    const eligible = room.players.filter(p => !p.pending);
    if (eligible.length === 0) { socket.emit("error", { message: "No players in game." }); return; }

    if (type === "deduct") {
      const broke = eligible.filter(p => p.balance < amt);
      if (broke.length > 0) {
        socket.emit("error", { message: `${broke.map(p => p.name).join(", ")} don't have enough balance.` });
        return;
      }
    }

    eligible.forEach(p => {
      if (type === "add") {
        p.balance += amt;
        addTx(room, { fromId: "bank", toId: p.stableId, amount: amt, participantIds: [p.stableId] });
        notifyStable(p.stableId, `Bank credited ${money(amt)} to you.`, "success");
      } else {
        p.balance -= amt;
        addTx(room, { fromId: p.stableId, toId: "bank", amount: amt, participantIds: [p.stableId] });
        notifyStable(p.stableId, `Bank deducted ${money(amt)} from you.`, "error");
      }
    });

    const label = type === "add" ? `Added ${money(amt)} to all ${eligible.length} players.` : `Deducted ${money(amt)} from all ${eligible.length} players.`;
    notifyStable(room.bankerSessionId, label, "success");
    broadcast(meta.roomCode);
  });

  // ── BANKER: TRANSFER ────────────────────────────────────────────────────────
  socket.on("banker_transfer", ({ fromId, toId, amount }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;

    const from = room.players.find(p => p.stableId === fromId || p.id === fromId);
    const to   = room.players.find(p => p.stableId === toId   || p.id === toId);
    if (!from || !to || from.stableId === to.stableId) return;

    const amt = parseInt(amount) || 0;
    if (amt <= 0) { socket.emit("error", { message: "Enter a valid amount." }); return; }
    if (from.balance < amt) { socket.emit("error", { message: "Not enough balance." }); return; }

    from.balance -= amt;
    to.balance   += amt;
    addTx(room, { fromId: from.stableId, toId: to.stableId, amount: amt, participantIds: [from.stableId, to.stableId] });
    notifyStable(from.stableId, `Transferred ${money(amt)} to ${to.name}.`,   "info");
    notifyStable(to.stableId,   `Received ${money(amt)} from ${from.name}.`,  "success");
    // Notify banker about the transfer they just made
    notifyStable(room.bankerSessionId, `🔄 Transferred ${money(amt)}: ${from.name} → ${to.name}.`, "info");
    broadcast(meta.roomCode);
  });

  // ── JAIL ─────────────────────────────────────────────────────────────────────
  socket.on("set_jail", ({ playerId, jail }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const p = room.players.find(pp => pp.stableId === playerId || pp.id === playerId);
    if (!p) return;
    p.jail = !!jail;
    broadcast(meta.roomCode);
    notifyStable(p.stableId,
      jail ? "You have been sent to jail." : "You have been released from jail.",
      jail ? "error" : "success"
    );
  });

  // ── PASSPORT ──────────────────────────────────────────────────────────────────
  socket.on("set_passport", ({ playerId, passport }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const p = room.players.find(pp => pp.stableId === playerId || pp.id === playerId);
    if (!p) return;
    p.passport = !!passport;
    broadcast(meta.roomCode);
    notifyStable(p.stableId,
      passport ? "Your passport has been restored." : "Your passport has been suspended.",
      passport ? "success" : "error"
    );
  });

  // ── PARTY HOUSE ───────────────────────────────────────────────────────────────
  socket.on("party_house", ({ landerId }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const lander = room.players.find(p => p.stableId === landerId || p.id === landerId);
    const others = room.players.filter(p => p.stableId !== lander?.stableId && !p.pending);
    if (!lander || others.length === 0) return;

    // Only collect from players who can afford it
    const payers = others.filter(p => p.balance >= 200);
    if (payers.length === 0) { socket.emit("error", { message: "No players have enough balance to pay." }); return; }

    payers.forEach(p => {
      p.balance      -= 200;
      lander.balance += 200;
      addTx(room, {
        fromId: p.stableId, toId: lander.stableId, amount: 200,
        participantIds: [p.stableId, lander.stableId],
      });
      notifyStable(p.stableId, `Party House: paid $200 to ${lander.name}.`, "error");
    });
    notifyStable(lander.stableId, `Party House: received $${(200 * payers.length).toLocaleString()}.`, "success");
    broadcast(meta.roomCode);
  });

  // ── RESORT ────────────────────────────────────────────────────────────────────
  socket.on("resort", ({ landerId }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const lander = room.players.find(p => p.stableId === landerId || p.id === landerId);
    const others = room.players.filter(p => p.stableId !== lander?.stableId && !p.pending);
    if (!lander || others.length === 0) return;

    // Check lander can afford to pay all others
    const totalCost = 200 * others.length;
    if (lander.balance < totalCost) {
      socket.emit("error", { message: `${lander.name} needs $${totalCost.toLocaleString()} but only has $${lander.balance.toLocaleString()}.` });
      return;
    }

    others.forEach(p => {
      p.balance      += 200;
      lander.balance -= 200;
      addTx(room, {
        fromId: lander.stableId, toId: p.stableId, amount: 200,
        participantIds: [lander.stableId, p.stableId],
      });
      notifyStable(p.stableId, `Resort: received $200 from ${lander.name}.`, "success");
    });
    notifyStable(lander.stableId, `Resort: paid $${totalCost.toLocaleString()}.`, "error");
    broadcast(meta.roomCode);
  });

  // ── SET ROUND ─────────────────────────────────────────────────────────────────
  socket.on("set_round", ({ round }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    room.round = Math.max(1, parseInt(round) || 1);
    broadcast(meta.roomCode);
  });

  // ── EXTEND TIMER ──────────────────────────────────────────────────────────────
  socket.on("extend_timer", ({ minutes }) => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room || !room.started) return;

    const mins = Math.max(1, Math.min(120, parseInt(minutes) || 10));
    const addMs = mins * 60 * 1000;

    // Extend endsAt
    const currentEnd = room.endsAt ? new Date(room.endsAt).getTime() : Date.now();
    room.endsAt = new Date(Math.max(currentEnd, Date.now()) + addMs).toISOString();

    // Cancel old auto-end, schedule new one
    if (room._autoEndTimer) clearTimeout(room._autoEndTimer);
    scheduleAutoEnd(room);

    notifyRoom(meta.roomCode, `⏱ ${mins} minutes added to the game!`, "success");
    broadcastNow(meta.roomCode);
  });

  // ── END GAME ──────────────────────────────────────────────────────────────────
  socket.on("end_game", () => {
    const meta = socketMap[socket.id];
    if (!meta?.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const players = room.players.filter(p => !p.pending).sort((a, b) => b.balance - a.balance);
    io.to(meta.roomCode).emit("game_ended", { players });
    cleanupRoom(meta.roomCode);
  });

  // ── PLAYER: SEND ──────────────────────────────────────────────────────────────
  socket.on("player_send", ({ toId, amount }) => {
    const meta = socketMap[socket.id];
    if (!meta || meta.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const me = room.players.find(p => p.stableId === meta.stableId);
    if (!me) return;

    const amt = parseInt(amount) || 0;
    if (amt <= 0) { socket.emit("error", { message: "Enter a valid amount." }); return; }
    if (me.balance < amt) { socket.emit("error", { message: "Not enough balance." }); return; }

    me.balance -= amt;

    if (toId === "bank") {
      addTx(room, { fromId: me.stableId, toId: "bank", amount: amt, participantIds: [me.stableId] });
      notifyStable(me.stableId, `Paid ${money(amt)} to Bank.`, "info");
      // Notify banker that a player sent money to the bank
      notifyStable(room.bankerSessionId, `💰 ${me.name} paid ${money(amt)} to Bank.`, "success");
    } else {
      const to = room.players.find(p => (p.stableId === toId || p.id === toId) && !p.pending);
      if (!to) { me.balance += amt; socket.emit("error", { message: "Player not found." }); return; }
      to.balance += amt;
      addTx(room, { fromId: me.stableId, toId: to.stableId, amount: amt, participantIds: [me.stableId, to.stableId] });
      notifyStable(me.stableId, `Sent ${money(amt)} to ${to.name}.`,    "info");
      notifyStable(to.stableId, `Received ${money(amt)} from ${me.name}.`, "success");
      // Notify banker about the player-to-player transfer
      notifyStable(room.bankerSessionId, `🔄 ${me.name} → ${to.name}: ${money(amt)}.`, "info");
    }
    broadcast(meta.roomCode);
  });

  // ── PLAYER: SEND TO ALL PLAYERS ───────────────────────────────────────────
  socket.on("player_send_all", ({ amount }) => {
    const meta = socketMap[socket.id];
    if (!meta || meta.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const me = room.players.find(p => p.stableId === meta.stableId);
    if (!me) return;

    const amt = parseInt(amount) || 0;
    if (amt <= 0) { socket.emit("error", { message: "Enter a valid amount." }); return; }

    const recipients = room.players.filter(p =>
      p.stableId !== meta.stableId && p.id !== meta.stableId && !p.pending
    );
    if (recipients.length === 0) { socket.emit("error", { message: "No other players found." }); return; }

    const total = amt * recipients.length;
    if (me.balance < total) { socket.emit("error", { message: "Not enough balance." }); return; }

    me.balance -= total;
    recipients.forEach(to => {
      to.balance += amt;
      addTx(room, { fromId: me.stableId, toId: to.stableId, amount: amt, participantIds: [me.stableId, to.stableId] });
      notifyStable(to.stableId, `Received ${money(amt)} from ${me.name}.`, "success");
    });
    notifyStable(me.stableId, `Sent ${money(amt)} to each of ${recipients.length} players (total: ${money(total)}).`, "info");
    notifyStable(room.bankerSessionId, `🔄 ${me.name} sent ${money(amt)} to all players (total: ${money(total)}).`, "info");
    broadcast(meta.roomCode);
  });

  // ── PLAYER: TAKE CC ────────────────────────────────────────────────────────
  socket.on("take_cc", () => {
    const meta = socketMap[socket.id];
    if (!meta || meta.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const me = room.players.find(p => p.stableId === meta.stableId);
    if (!me) return;
    if (me.cc.used) { socket.emit("error", { message: "Credit card already used." }); return; }

    me.balance += 10000;
    me.cc = { used: true, remaining: 6 };
    addTx(room, { fromId: "bank", toId: me.stableId, amount: 10000, participantIds: [me.stableId] });
    notifyStable(me.stableId, "Credit card loan of $10,000 credited.", "success");
    broadcast(meta.roomCode);
  });

  // ── PLAYER: REPAY CC ───────────────────────────────────────────────────────
  socket.on("repay_cc", () => {
    const meta = socketMap[socket.id];
    if (!meta || meta.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const me = room.players.find(p => p.stableId === meta.stableId);
    if (!me || !me.cc.remaining) return;
    if (me.balance < 2000) { socket.emit("error", { message: "Not enough balance." }); return; }

    me.balance     -= 2000;
    me.cc.remaining--;
    addTx(room, { fromId: me.stableId, toId: "bank", amount: 2000, participantIds: [me.stableId] });
    notifyStable(me.stableId, `CC repayment of $2,000 paid. ${me.cc.remaining} left.`, "info");
    broadcast(meta.roomCode);
  });

  // ── PLAYER: JAIL FINE ──────────────────────────────────────────────────────
  socket.on("pay_jail_fine", ({ method }) => {
    const meta = socketMap[socket.id];
    if (!meta || meta.isBanker) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const me = room.players.find(p => p.stableId === meta.stableId);
    if (!me || !me.jail) { socket.emit("error", { message: "You are not in jail." }); return; }

    const cost = method === "cc" ? 3000 : 500;
    if (me.balance < cost) { socket.emit("error", { message: "Not enough balance." }); return; }
    if (method === "cc" && (!me.cc.used || me.cc.remaining === 0)) {
      socket.emit("error", { message: "No active credit card." }); return;
    }

    me.balance -= cost;
    me.jail     = false;
    addTx(room, { fromId: me.stableId, toId: "bank", amount: cost, participantIds: [me.stableId] });
    notifyStable(me.stableId, `Jail fine of ${money(cost)} paid. You are free!`, "success");
    broadcast(meta.roomCode);
  });

  // ── PLAYER LEAVE ───────────────────────────────────────────────────────────
  socket.on("player_leave", () => {
    const meta = socketMap[socket.id];
    if (!meta) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;

    if (meta.isBanker) {
      const players = room.players.filter(p => !p.pending).sort((a, b) => b.balance - a.balance);
      io.to(meta.roomCode).emit("game_ended", { players });
      cleanupRoom(meta.roomCode);
    } else {
      const p = room.players.find(pp => pp.stableId === meta.stableId);
      if (p) {
        room.players = room.players.filter(pp => pp.stableId !== p.stableId);
        delete stableToSocket[p.stableId];
        notifyRoom(meta.roomCode, `${p.name} left the game.`, "info");
        broadcast(meta.roomCode);
      }
    }
    delete socketMap[socket.id];
    socket.emit("you_left_game");
  });

  // ── BANKER RECONNECT ───────────────────────────────────────────────────────
  socket.on("reconnect_banker", ({ roomCode, sessionId }) => {
    const room = getRoom(roomCode);
    if (!room) { socket.emit("error", { message: "Room not found. The game may have ended." }); return; }
    if (sessionId && room.bankerSessionId !== sessionId) {
      socket.emit("error", { message: "Not authorised as banker for this room." }); return;
    }

    socketMap[socket.id]                  = { roomCode, stableId: room.bankerSessionId, isBanker: true };
    stableToSocket[room.bankerSessionId]  = socket.id;
    room.bankerSocketId                   = socket.id;
    socket.join(roomCode);
    socket.emit("reconnected_to_game", snapBanker(room));
  });

  // ── PLAYER RECONNECT (explicit) ─────────────────────────────────────────────
  socket.on("reconnect_player", ({ roomCode, stableId }) => {
    const room = getRoom(roomCode);
    if (!room) { socket.emit("error", { message: "Room not found. The game may have ended." }); return; }
    const p = room.players.find(pp => pp.stableId === stableId);
    if (!p) { socket.emit("error", { message: "Player not found in this room." }); return; }

    p.online   = true;
    p.socketId = socket.id;
    socketMap[socket.id]     = { roomCode, stableId, isBanker: false };
    stableToSocket[stableId] = socket.id;
    socket.join(roomCode);
    socket.emit("reconnected_to_game", snapPlayer(room, stableId));
    notifyRoom(roomCode, `${p.name} reconnected.`, "info");
    broadcast(roomCode);
  });

  // ── REQUEST ROOM STATE (focus / visibility resync) ─────────────────────────
  socket.on("request_room_state", ({ roomCode }) => {
    const meta = socketMap[socket.id];
    const room = getRoom(roomCode);
    if (!room || !meta) return;
    socket.emit("room_state", meta.isBanker ? snapBanker(room) : snapPlayer(room, meta.stableId));
  });

  // ── DISCONNECT ─────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const meta = socketMap[socket.id];
    if (meta) {
      const room = getRoom(meta.roomCode);
      if (room && !meta.isBanker) {
        const p = room.players.find(pp => pp.stableId === meta.stableId);
        if (p) {
          if (!room.started) {
            // Pre-game: remove entirely
            room.players = room.players.filter(pp => pp.stableId !== p.stableId);
            delete stableToSocket[p.stableId];
            broadcast(meta.roomCode);
          } else {
            // Game running: mark offline, keep all state
            p.online      = false;
            p.lastSeenAt  = Date.now();
            notifyRoom(meta.roomCode, `${p.name} went offline.`, "warning");
            broadcast(meta.roomCode);
          }
        }
      }
      // Banker disconnect: preserve room so they can reconnect
      delete socketMap[socket.id];
    }
  });

  // ── PING ───────────────────────────────────────────────────────────────────
  socket.on("ping", () => socket.emit("pong"));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`IB Digital Banker backend running on port ${PORT}`);
  console.log(`FRONTEND_URL: ${ALLOWED_ORIGIN || "(dev mode — all origins allowed)"}`);
});
