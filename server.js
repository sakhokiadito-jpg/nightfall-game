import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, pingInterval: 10000, pingTimeout: 20000 });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "dist")));
app.get("/health", (_, res) => res.json({ ok: true, game: "NIGHTFALL" }));

const rooms = new Map();
const MAX_PLAYERS = 6;
const GENERATORS_TO_ESCAPE = 3;

function roomCode() {
  return "NF-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}
function publicRoom(room) {
  return {
    code: room.code,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, role: p.role, alive: p.alive
    })),
    phase: room.phase,
    generators: room.generators,
    maxPlayers: MAX_PLAYERS
  };
}
function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (room) {
    room.players.delete(socket.id);
    socket.leave(code);
    if (room.players.size === 0) rooms.delete(code);
    else {
      if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
      emitRoom(room);
    }
  }
  socket.data.roomCode = null;
}

io.on("connection", socket => {
  socket.on("room:create", ({ name } = {}, cb = () => {}) => {
    leaveRoom(socket);
    const code = roomCode();
    const player = { id: socket.id, name: cleanName(name), role: "survivor", alive: true, x: 0, z: 0, yaw: 0 };
    const room = {
      code, hostId: socket.id, players: new Map([[socket.id, player]]),
      phase: "lobby", generators: 0, generatorCooldown: new Map(), lastAttack: new Map(), createdAt: Date.now()
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    cb({ ok: true, room: publicRoom(room), host: true });
    emitRoom(room);
  });

  socket.on("room:join", ({ code, name } = {}, cb = () => {}) => {
    leaveRoom(socket);
    const normalized = String(code || "").trim().toUpperCase();
    const room = rooms.get(normalized);
    if (!room) return cb({ ok: false, error: "Комната не найдена. Проверь ID." });
    if (room.players.size >= MAX_PLAYERS) return cb({ ok: false, error: "Комната заполнена (максимум 6 игроков)." });
    if (room.phase !== "lobby") return cb({ ok: false, error: "Матч уже начался." });
    room.players.set(socket.id, { id: socket.id, name: cleanName(name), role: "survivor", alive: true, x: Math.random()*4-2, z: Math.random()*4-2, yaw: 0 });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    cb({ ok: true, room: publicRoom(room), host: false });
    emitRoom(room);
  });

  socket.on("match:start", (_, cb = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return cb({ ok: false, error: "Сначала создай комнату." });
    if (room.hostId !== socket.id) return cb({ ok: false, error: "Запустить матч может только создатель комнаты." });
    if (room.players.size < 2) return cb({ ok: false, error: "Нужен хотя бы один друг. Сейчас игроков: " + room.players.size });
    const list = [...room.players.values()];
    const killer = list[Math.floor(Math.random() * list.length)];
    for (const p of list) { p.role = p.id === killer.id ? "killer" : "survivor"; p.alive = true; p.x = (Math.random() - .5) * 12; p.z = (Math.random() - .5) * 12; }
    room.phase = "playing";
    room.generators = 0;
    io.to(room.code).emit("match:started", publicRoom(room));
    emitRoom(room);
    cb({ ok: true });
  });

  socket.on("player:move", data => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== "playing") return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return;
    const x = clamp(Number(data?.x) || 0, -48, 48);
    const z = clamp(Number(data?.z) || 0, -48, 48);
    const yaw = Number(data?.yaw) || 0;
    p.x = x; p.z = z; p.yaw = yaw;
    socket.to(room.code).emit("player:moved", { id: socket.id, x, z, yaw, role: p.role, alive: p.alive });
  });

  socket.on("generator:repair", (_, cb = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== "playing") return cb({ ok: false });
    const p = room.players.get(socket.id);
    if (!p || p.role !== "survivor" || !p.alive) return cb({ ok: false, error: "Только живой выживший может чинить генератор." });
    const now = Date.now(), last = room.generatorCooldown.get(socket.id) || 0;
    if (now - last < 3500) return cb({ ok: false, error: "Подожди немного." });
    room.generatorCooldown.set(socket.id, now);
    room.generators = Math.min(GENERATORS_TO_ESCAPE, room.generators + 1);
    io.to(room.code).emit("objective:update", { generators: room.generators, needed: GENERATORS_TO_ESCAPE });
    if (room.generators >= GENERATORS_TO_ESCAPE) {
      room.phase = "survivorsWon";
      io.to(room.code).emit("match:ended", { winner: "survivors", message: "Выжившие запустили эвакуацию!" });
    }
    cb({ ok: true, generators: room.generators });
  });

  socket.on("killer:attack", (_, cb = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== "playing") return cb({ ok: false });
    const killer = room.players.get(socket.id);
    if (!killer || killer.role !== "killer" || !killer.alive) return cb({ ok: false, error: "Ты не маньяк." });
    const now = Date.now(), last = room.lastAttack.get(socket.id) || 0;
    if (now - last < 1600) return cb({ ok: false, error: "Удар перезаряжается." });
    room.lastAttack.set(socket.id, now);
    let target = null, best = 3.4;
    for (const p of room.players.values()) {
      if (p.role !== "survivor" || !p.alive) continue;
      const d = Math.hypot(p.x - killer.x, p.z - killer.z);
      if (d < best) { best = d; target = p; }
    }
    if (!target) return cb({ ok: false, error: "Подойди ближе к выжившему." });
    target.alive = false;
    io.to(room.code).emit("player:eliminated", { id: target.id, by: socket.id });
    emitRoom(room);
    const alive = [...room.players.values()].filter(p => p.role === "survivor" && p.alive).length;
    if (alive === 0) {
      room.phase = "killerWon";
      io.to(room.code).emit("match:ended", { winner: "killer", message: "Маньяк поймал всех выживших." });
    }
    cb({ ok: true });
  });

  socket.on("disconnect", () => leaveRoom(socket));
});

function cleanName(v) { return String(v || "Игрок").replace(/[<>]/g, "").trim().slice(0, 16) || "Игрок"; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

server.listen(PORT, "0.0.0.0", () => console.log(`NIGHTFALL server on ${PORT}`));
