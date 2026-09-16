import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { Room } from './Room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no O/I/L to avoid confusion

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const httpServer = createServer(app);
const io = new Server(httpServer);

/** @type {Map<string, Room>} */
const rooms = new Map();

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function broadcastRoom(room) {
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit('state:host', room.toHostState());
  }
  for (const p of room.players.values()) {
    if (p.socketId) {
      io.to(p.socketId).emit('state:player', room.toPlayerState(p.id));
    }
  }
}

function requireHost(room, hostSecret) {
  return room && room.hostSecret === hostSecret;
}

function requirePlayer(room, playerId, token) {
  const p = room && room.players.get(playerId);
  return p && p.token === token ? p : null;
}

io.on('connection', (socket) => {
  socket.on('host:create', (_payload, ack) => {
    const code = generateCode();
    const room = new Room(code);
    room.hostSocketId = socket.id;
    rooms.set(code, room);
    socket.data.role = 'host';
    socket.data.code = code;
    socket.join(`room:${code}`);
    ack?.({ ok: true, code, hostSecret: room.hostSecret });
    broadcastRoom(room);
  });

  socket.on('host:rejoin', ({ code, hostSecret } = {}, ack) => {
    const room = rooms.get(code);
    if (!requireHost(room, hostSecret)) return ack?.({ ok: false, error: 'Room not found.' });
    room.hostSocketId = socket.id;
    socket.data.role = 'host';
    socket.data.code = code;
    socket.join(`room:${code}`);
    ack?.({ ok: true, state: room.toHostState() });
  });

  socket.on('host:setQuestions', ({ code, hostSecret, questions } = {}, ack) => {
    const room = rooms.get(code);
    if (!requireHost(room, hostSecret)) return ack?.({ ok: false, error: 'Not authorized.' });
    if (!Array.isArray(questions)) return ack?.({ ok: false, error: 'Invalid questions.' });
    const clean = questions
      .map((q) => ({
        text: String(q.text || '').trim(),
        correct: String(q.correct || '').trim(),
        wrong: (q.wrong || []).map((w) => String(w).trim()).filter(Boolean),
      }))
      .filter((q) => q.text && q.correct && q.wrong.length >= 1);
    room.setQuestions(clean);
    ack?.({ ok: true, count: clean.length });
    broadcastRoom(room);
  });

  socket.on('host:setSettings', ({ code, hostSecret, settings } = {}, ack) => {
    const room = rooms.get(code);
    if (!requireHost(room, hostSecret)) return ack?.({ ok: false, error: 'Not authorized.' });
    const s = settings || {};
    const clean = {};
    if (s.traitorCount !== undefined) clean.traitorCount = s.traitorCount ? Math.max(1, parseInt(s.traitorCount, 10)) : null;
    if (s.pointsPerCorrect !== undefined) clean.pointsPerCorrect = Math.max(0, parseInt(s.pointsPerCorrect, 10) || 0);
    if (s.questionSeconds !== undefined) clean.questionSeconds = Math.max(5, parseInt(s.questionSeconds, 10) || 20);
    if (s.discussionSeconds !== undefined) clean.discussionSeconds = Math.max(10, parseInt(s.discussionSeconds, 10) || 90);
    if (s.votingSeconds !== undefined) clean.votingSeconds = Math.max(5, parseInt(s.votingSeconds, 10) || 30);
    if (s.questionsPerRound !== undefined) clean.questionsPerRound = Math.max(1, parseInt(s.questionsPerRound, 10) || 3);
    room.setSettings(clean);
    ack?.({ ok: true });
    broadcastRoom(room);
  });

  socket.on('host:startGame', ({ code, hostSecret } = {}, ack) => {
    const room = rooms.get(code);
    if (!requireHost(room, hostSecret)) return ack?.({ ok: false, error: 'Not authorized.' });
    const result = room.startGame();
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true });
    broadcastRoom(room);
  });

  socket.on('host:next', ({ code, hostSecret } = {}, ack) => {
    const room = rooms.get(code);
    if (!requireHost(room, hostSecret)) return ack?.({ ok: false, error: 'Not authorized.' });
    const result = room.hostAdvance();
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true });
    broadcastRoom(room);
  });

  socket.on('host:resetToLobby', ({ code, hostSecret } = {}, ack) => {
    const room = rooms.get(code);
    if (!requireHost(room, hostSecret)) return ack?.({ ok: false, error: 'Not authorized.' });
    room.resetToLobby();
    ack?.({ ok: true });
    broadcastRoom(room);
  });

  socket.on('host:kick', ({ code, hostSecret, playerId } = {}, ack) => {
    const room = rooms.get(code);
    if (!requireHost(room, hostSecret)) return ack?.({ ok: false, error: 'Not authorized.' });
    const p = room.players.get(playerId);
    if (p?.socketId) io.to(p.socketId).emit('kicked');
    room.removePlayer(playerId);
    ack?.({ ok: true });
    broadcastRoom(room);
  });

  socket.on('player:join', ({ code, name } = {}, ack) => {
    code = String(code || '').trim().toUpperCase();
    name = String(name || '').trim().slice(0, 24);
    const room = rooms.get(code);
    if (!room) return ack?.({ ok: false, error: 'Room not found. Check the code.' });
    if (room.phase !== 'LOBBY') return ack?.({ ok: false, error: 'This game has already started.' });
    if (!name) return ack?.({ ok: false, error: 'Enter a name.' });
    const taken = [...room.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (taken) return ack?.({ ok: false, error: 'That name is already taken.' });

    const player = room.addPlayer(name);
    player.socketId = socket.id;
    player.connected = true;
    socket.data.role = 'player';
    socket.data.code = code;
    socket.data.playerId = player.id;
    socket.join(`room:${code}`);
    ack?.({ ok: true, playerId: player.id, token: player.token, code });
    broadcastRoom(room);
  });

  socket.on('player:rejoin', ({ code, playerId, token } = {}, ack) => {
    code = String(code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const p = requirePlayer(room, playerId, token);
    if (!p) return ack?.({ ok: false, error: 'Could not rejoin that game.' });
    p.socketId = socket.id;
    p.connected = true;
    socket.data.role = 'player';
    socket.data.code = code;
    socket.data.playerId = playerId;
    socket.join(`room:${code}`);
    ack?.({ ok: true, state: room.toPlayerState(playerId) });
    broadcastRoom(room);
  });

  socket.on('player:answer', ({ code, playerId, token, choiceIndex } = {}, ack) => {
    const room = rooms.get(code);
    const p = requirePlayer(room, playerId, token);
    if (!p) return ack?.({ ok: false, error: 'Not authorized.' });
    room.submitAnswer(playerId, choiceIndex);
    ack?.({ ok: true });
    broadcastRoom(room);
  });

  socket.on('player:vote', ({ code, playerId, token, targetId } = {}, ack) => {
    const room = rooms.get(code);
    const p = requirePlayer(room, playerId, token);
    if (!p) return ack?.({ ok: false, error: 'Not authorized.' });
    room.submitVote(playerId, targetId);
    ack?.({ ok: true });
    broadcastRoom(room);
  });

  socket.on('player:murderChoice', ({ code, playerId, token, targetId } = {}, ack) => {
    const room = rooms.get(code);
    const p = requirePlayer(room, playerId, token);
    if (!p) return ack?.({ ok: false, error: 'Not authorized.' });
    room.submitMurderChoice(playerId, targetId);
    ack?.({ ok: true });
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const { role, code, playerId } = socket.data;
    const room = rooms.get(code);
    if (!room) return;
    if (role === 'host' && room.hostSocketId === socket.id) {
      room.hostSocketId = null;
    } else if (role === 'player') {
      const p = room.players.get(playerId);
      if (p && p.socketId === socket.id) {
        p.connected = false;
        p.socketId = null;
      }
    }
    broadcastRoom(room);
  });
});

// Sweep empty/stale rooms periodically so memory doesn't grow across a long day of use.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const stale = now - room.createdAt > 1000 * 60 * 60 * 6; // 6 hours
    const empty = !room.hostSocketId && room.players.size === 0;
    if (stale || empty) {
      room.clearTimer();
      rooms.delete(code);
    }
  }
}, 1000 * 60 * 10);

httpServer.listen(PORT, () => {
  console.log(`Traitors: Vocab Edition running at http://localhost:${PORT}`);
});
