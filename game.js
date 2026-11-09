/*
 * game.js - Ludo ke rules (UI se alag, koi HTML/DOM nahi)
 * Goti ka progress: -1 base | 0..50 main track | 51..55 home column | 56 HOME
 */
const MAIN_TRACK = 52, START_GAP = 13, LAST_TRACK = 50, HOME = 56;
const COLORS = ["red", "green", "yellow", "blue"];
const SAFE_SQUARES = new Set([0, 13, 26, 39, 8, 21, 34, 47]); // start + star

function absolutePos(seat, p) {
  return (p < 0 || p > LAST_TRACK) ? null : (seat * START_GAP + p) % MAIN_TRACK;
}
function rollDice() { return Math.floor(Math.random() * 6) + 1; }

// seats: jaise [0, 2] = Red aur Yellow
function createGame(seats, mode = "classic") {   // mode: classic | quick (2 goti) | master (kill zaroori)
  return {
    players: seats.map((s) => ({ seat: s, color: COLORS[s], tokens: Array(mode === "quick" ? 2 : 4).fill(-1), rank: null, kills: 0, killed: false })),
    current: 0, roll: null, sixes: 0, ranking: [], over: false, mode,
  };
}

function nextTurn(state) {
  state.sixes = 0;
  do { state.current = (state.current + 1) % state.players.length; }
  while (state.players[state.current].rank !== null);   // jeete hue ko skip
}
function skipTurn(state) { nextTurn(state); state.roll = null; }

// Dice phenko. Lagatar teen 6 par turn cancel.
function doRoll(state) {
  const r = rollDice();
  state.sixes = r === 6 ? state.sixes + 1 : 0;
  if (state.sixes === 3) { nextTurn(state); state.roll = null; return { roll: r, cancelled: true }; }
  state.roll = r;
  return { roll: r, cancelled: false };
}

// Kisi square par doosre color ka block (2+ goti) hai?
function blockedFor(state, pos) {
  return state.players.some((o, i) => i !== state.current &&
    o.tokens.filter((t) => absolutePos(o.seat, t) === pos).length >= 2);
}

// Kaun si goti chal sakti hain (base se 6 par, exact home, block par nahi)
function getValidMoves(state, roll) {
  const p = state.players[state.current], out = [];
  p.tokens.forEach((pr, i) => {
    if (pr === HOME) return;
    const to = pr === -1 ? (roll === 6 ? 0 : null) : (pr + roll <= HOME ? pr + roll : null);
    if (to === null) return;
    if (state.mode === "master" && !p.killed && to > LAST_TRACK) return;   // Master: home column ke liye pehle ek kill
    const pos = absolutePos(p.seat, to);
    if (pos !== null && !SAFE_SQUARES.has(pos) && blockedFor(state, pos)) return;
    out.push(i);
  });
  return out;
}

function moveToken(state, ti, roll) {
  const player = state.players[state.current];
  if (!getValidMoves(state, roll).includes(ti)) return { moved: false };
  const from = player.tokens[ti], to = from === -1 ? 0 : from + roll;
  player.tokens[ti] = to;

  let captured = 0;                                   // kill (safe square par nahi)
  const pos = absolutePos(player.seat, to);
  if (pos !== null && !SAFE_SQUARES.has(pos)) {
    state.players.forEach((o, i) => {
      if (i === state.current) return;
      o.tokens.forEach((p, t) => { if (absolutePos(o.seat, p) === pos) { o.tokens[t] = -1; captured++; } });
    });
  }

  if (captured) { player.killed = true; player.kills += captured; }
  const finished = to === HOME;
  let finishedNow = false;                            // is player ki chaaron goti home?
  if (player.tokens.every((p) => p === HOME)) {
    finishedNow = true;
    player.rank = state.ranking.push(state.current);
    const left = state.players.filter((p) => p.rank === null);
    if (left.length <= 1) {                           // sirf ek bacha -> game khatam
      left.forEach((p) => { p.rank = state.ranking.push(state.players.indexOf(p)); });
      state.over = true;
    }
  }

  const extraTurn = !finishedNow && (roll === 6 || captured > 0 || finished);
  if (!state.over && !extraTurn) nextTurn(state);
  state.roll = null;
  return { moved: true, captured, extraTurn, finished, finishedNow };
}

/* ---------- Computer ki soch ---------- */

// Kya is jagah par peeche se 1-6 door koi doosre ki goti hai?
function inDanger(state, seat, prog) {
  const pos = absolutePos(seat, prog);
  if (pos === null || SAFE_SQUARES.has(pos)) return false;
  return state.players.some((o) => o.seat !== seat && o.tokens.some((t) => {
    const q = absolutePos(o.seat, t);
    const d = q === null ? 99 : (pos - q + 52) % 52;
    return d >= 1 && d <= 6;
  }));
}

function chooseMove(state, moves, roll, level) {
  if (level === "easy") return moves[Math.floor(Math.random() * moves.length)];
  const p = state.players[state.current];
  let best = moves[0], bs = -1e9;
  moves.forEach((i) => {
    const from = p.tokens[i], to = from === -1 ? 0 : from + roll, pos = absolutePos(p.seat, to);
    let s = to;                                       // aage wali goti ko thodi priority
    if (to === HOME) s += 1000;                       // home pahunchao
    if (pos !== null && !SAFE_SQUARES.has(pos) &&
        state.players.some((o, k) => k !== state.current && o.tokens.some((t) => absolutePos(o.seat, t) === pos))) s += 500; // kill
    if (from === -1) s += 300;                        // naya token nikalo
    if (pos !== null && SAFE_SQUARES.has(pos)) s += 100;
    if (to > LAST_TRACK) s += 80;
    if (pos !== null && p.tokens.some((t, k) => k !== i && absolutePos(p.seat, t) === pos)) s += 60; // jodi
    if (inDanger(state, p.seat, from)) s += 150;      // khatre se bachao
    if (inDanger(state, p.seat, to)) s -= 120;
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}

// Console me test: Ludo.simulateGame("normal")
function simulateGame(level = "normal", seats = [0, 1, 2, 3]) {
  const st = createGame(seats);
  let n = 0;
  while (!st.over && n++ < 20000) {
    const r = doRoll(st);
    if (r.cancelled) continue;
    const m = getValidMoves(st, st.roll);
    if (!m.length) { skipTurn(st); continue; }
    moveToken(st, chooseMove(st, m, st.roll, level), st.roll);
  }
  console.log(st.over ? "Ranking: " + st.ranking.map((i) => st.players[i].color).join(" > ") : "Khatam nahi hua");
  return st;
}

const Ludo = { createGame, rollDice, doRoll, getValidMoves, moveToken, skipTurn, chooseMove, absolutePos, simulateGame, SAFE_SQUARES, COLORS, HOME };
if (typeof module !== "undefined" && module.exports) module.exports = Ludo; else window.Ludo = Ludo;
