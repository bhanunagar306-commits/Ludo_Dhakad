/*
 * ui.js - screen, keyboard aur computer ki baari sambhalta hai.
 * Rules game.js (Ludo) me hain, yahan sirf dikhana aur control.
 */
(function () {
  "use strict";

  const HEX = ["var(--p0)", "var(--p1)", "var(--p2)", "var(--p3)"];   // rang theme se aate hain
  const NAMES = ["Red", "Green", "Yellow", "Blue"];
  const KEYS = ["f", "g", "h", "j"];              // dice keys (Red, Green, Yellow, Blue)
  const ORD = ["1st", "2nd", "3rd", "4th"];

  const TRACK = [
    [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],
    [0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],
    [6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],
    [8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],
    [12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [7,0],[6,0]
  ];
  const HOME_COL = [
    [[7,1],[7,2],[7,3],[7,4],[7,5]], [[1,7],[2,7],[3,7],[4,7],[5,7]],
    [[7,13],[7,12],[7,11],[7,10],[7,9]], [[13,7],[12,7],[11,7],[10,7],[9,7]]
  ];
  const HOME_END = [[7,6],[6,7],[7,8],[8,7]];
  const BASE_ORIGIN = [[0,0],[0,9],[9,9],[9,0]];
  const SLOT_OFFSETS = [[2,2],[4,2],[2,4],[4,4]];
  const BASE_SLOTS = BASE_ORIGIN.map(([r, c]) => SLOT_OFFSETS.map(([x, y]) => [c + x, r + y]));

  const $ = (id) => document.getElementById(id);
  const board = $("board");
  const setupEl = $("setup"), gameEl = $("game"), pauseEl = $("pause"), resultEl = $("result"), exitEl = $("exit");
  const errEl = $("err"), startBtn = $("start");

  let state = null, cfg = null, tokenEls = [], diceEls = [];
  let timer = null, paused = false, locked = false, rolling = false, sel = -1;
  let disp = null, after = null, baseEls = [], actx = null, muted = false;
  let tmId = null, tmLeft = 0, mode = "classic", timerSec = 0, musicOn = true, musicId = null, mNote = 2, mStep = 0;

  const cur = () => state.players[state.current];
  function schedule(fn, ms) { clearTimeout(timer); timer = setTimeout(fn, ms); }
  // Fireworks ka "boom" (noise + dhamak). Browser ne awaaz allow ki ho tabhi sunai deta hai (installed app me aksar chalta hai)
  function boom() {
    if (muted) return;
    try {
      audio();
      const n = Math.floor(actx.sampleRate * 0.35), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const src = actx.createBufferSource(), g = actx.createGain();
      src.buffer = buf; g.gain.value = 0.18; src.connect(g); g.connect(sfxBus); src.start();
      tone(90, 0.3, "sine", 0.1);
    } catch (e) { /* awaaz na chale to bhi theek */ }
  }

  // fn ko ms baad chalao; pause ke baad resume par turant chal jata hai
  function later(fn, ms) { after = () => { after = null; fn(); }; schedule(after, ms); }

  /* ---------- Dice ka face (dots) ---------- */
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const face = (v) => Array.from({ length: 9 }, (_, i) => (PIPS[v] || []).includes(i) ? "<i></i>" : "<b></b>").join("");

  /* ---------- Awaazein (code se bani, koi file nahi). M se mute ---------- */
  let sfxBus = null, musBus = null, sfxVol = 1, musVol = 0.8;
  function audio() {                                   // AudioContext + Sound/Music ke alag volume bus
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (!sfxBus) {
      sfxBus = actx.createGain(); musBus = actx.createGain();
      sfxBus.connect(actx.destination); musBus.connect(actx.destination);
      applyVol();
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function applyVol() { if (sfxBus) { sfxBus.gain.value = sfxVol * 3; musBus.gain.value = musVol * 4; } }   // x3 / x4 = pehle se zyada tez
  function tone(f, d, type = "sine", v = 0.08, at = 0, bus = "sfx") {
    if (muted) return;
    try {
      const a = audio(), t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(bus === "music" ? musBus : sfxBus); o.start(t); o.stop(t + d);
    } catch (e) { /* awaaz na chale to bhi game chalega */ }
  }
  const SFX = {
    click: () => { tone(900, 0.05, "triangle", 0.1); tone(1350, 0.07, "sine", 0.06, 0.03); },   // button click
    roll: () => tone(300 + Math.random() * 250, 0.05, "square", 0.04),
    land: () => tone(520, 0.12, "triangle", 0.1),
    step: () => tone(700, 0.05, "sine", 0.07),
    out: () => tone(660, 0.12, "triangle", 0.1),
    kill: () => { tone(400, 0.25, "sawtooth", 0.07); tone(200, 0.3, "sawtooth", 0.07, 0.12); },
    home: () => [523, 659, 784].forEach((f, i) => tone(f, 0.2, "triangle", 0.1, i * 0.1)),
    win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.25, "triangle", 0.1, i * 0.12)),
  };

  /* ---------- Setup: step 1 = players ki ginti, step 2 = naam, rang, Human/Computer ---------- */

  const SEATS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
  const kinds = ["human", "bot", "bot", "bot"];       // seat -> human / bot
  const names = ["", "", "", ""];                      // khaali = default naam
  const PALETTE = ["#e53935", "#43a047", "#fdd835", "#1e88e5", "#fb8c00", "#8e24aa", "#ec407a", "#00acc1"];
  const custom = [null, null, null, null];             // null = theme ka apna rang
  let count = 0;
  const step1 = $("step1"), step2 = $("step2"), root = document.documentElement;

  const defName = (seat) => kinds[seat] === "bot" ? "Computer" : "Player " + (SEATS[count].indexOf(seat) + 1);
  const pname = (seat) => (names[seat] || "").trim() || defName(seat);
  const themeColor = (seat) => {                       // theme ka asli rang (custom hata ke padho)
    const old = root.style.getPropertyValue("--p" + seat);
    root.style.removeProperty("--p" + seat);
    const v = getComputedStyle(root).getPropertyValue("--p" + seat).trim().toLowerCase();
    if (old) root.style.setProperty("--p" + seat, old);
    return v;
  };
  const effColor = (seat) => (custom[seat] || themeColor(seat)).toLowerCase();
  function setColor(seat, c) {
    custom[seat] = c;
    if (c) root.style.setProperty("--p" + seat, c); else root.style.removeProperty("--p" + seat);
  }
  function nextColor(seat) {                           // agla rang jo kisi aur ne nahi liya
    const order = [null, ...PALETTE], i = order.indexOf(custom[seat]);
    for (let n = 1; n <= order.length; n++) {
      const c = order[(i + n) % order.length], val = c || themeColor(seat);
      if (!SEATS[count].some((s) => s !== seat && effColor(s) === val)) return c;
    }
    return custom[seat];
  }

  // Mode aur turn timer ke buttons
  const MODES = [["classic", "Classic"], ["quick", "Quick"], ["master", "Master"]];
  const MODE_DESC = { classic: "4 goti each. Standard rules.", quick: "2 goti each. Shorter game.", master: "Capture a goti before entering home." };
  function seg(box, opts, get, set) {
    box.innerHTML = "";
    opts.forEach(([v, label]) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label; b.className = "opt" + (get() === v ? " on" : "");
      b.onclick = () => { set(v); box.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); };
      box.appendChild(b);
    });
  }
  seg($("mode-seg"), MODES, () => mode, (v) => { mode = v; $("mode-desc").textContent = MODE_DESC[v]; });
  seg($("timer-seg"), [[0, "Off"], [10, "10s"], [20, "20s"], [30, "30s"]], () => timerSec, (v) => { timerSec = v; });
  $("mode-desc").textContent = MODE_DESC[mode];

  document.querySelectorAll("#count-btns button").forEach((b) => {
    b.onclick = () => { count = +b.dataset.n; buildRows(); step1.hidden = true; step2.hidden = false; };
  });
  $("back").onclick = () => { step2.hidden = true; step1.hidden = false; };

  function buildRows() {
    const box = $("seat-rows");
    box.innerHTML = "";
    SEATS[count].forEach((seat) => {
      const row = document.createElement("div");
      row.className = "seat-row";
      const left = document.createElement("div");
      left.className = "who";
      const sw = document.createElement("button");
      sw.type = "button"; sw.className = "swatch"; sw.title = "Change colour";
      sw.style.background = `var(--p${seat})`;
      sw.onclick = () => setColor(seat, nextColor(seat));
      const inp = document.createElement("input");
      inp.className = "name"; inp.maxLength = 12; inp.placeholder = defName(seat); inp.value = names[seat];
      inp.oninput = () => { names[seat] = inp.value; };
      left.append(sw, inp);
      const grp = document.createElement("div");
      grp.className = "seg";
      [["human", "Human"], ["bot", "Computer"]].forEach(([k, label]) => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = label;
        b.className = "opt" + (kinds[seat] === k ? " on" : "");
        b.onclick = () => {
          kinds[seat] = k; inp.placeholder = defName(seat);
          grp.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
          validate();
        };
        grp.appendChild(b);
      });
      row.append(left, grp);
      box.appendChild(row);
    });
    validate();
  }

  function validate() {
    const ok = SEATS[count].some((s) => kinds[s] === "human");
    errEl.textContent = ok ? "" : "Pick at least 1 human player.";
    startBtn.disabled = !ok;
  }

  /* ---------- Board (ek baar) ---------- */

  function addCell(r, c, bg, text, cls) {
    const d = document.createElement("div");
    d.className = "cell" + (cls ? " " + cls : "");
    d.style.gridRow = r + 1; d.style.gridColumn = c + 1;
    if (bg) d.style.background = bg;
    if (text) d.textContent = text;
    board.appendChild(d);
  }

  function buildBoard() {
    BASE_ORIGIN.forEach(([r, c], seat) => {
      const b = document.createElement("div");
      b.className = "base";
      b.style.gridRow = (r + 1) + " / span 6"; b.style.gridColumn = (c + 1) + " / span 6";
      b.style.background = HEX[seat];
      SLOT_OFFSETS.forEach(([x, y]) => {
        const s = document.createElement("div");
        s.className = "slot";
        s.style.left = (x / 6 * 100) + "%"; s.style.top = (y / 6 * 100) + "%";
        b.appendChild(s);
      });
      baseEls[seat] = b;
      board.appendChild(b);
    });
    TRACK.forEach(([r, c], i) => {
      if (i % 13 === 0) addCell(r, c, HEX[i / 13]);
      else if (Ludo.SAFE_SQUARES.has(i)) addCell(r, c, null, "", "star");
      else addCell(r, c);
    });
    HOME_COL.forEach((cells, seat) => cells.forEach(([r, c]) => addCell(r, c, HEX[seat])));
    const center = document.createElement("div");
    center.className = "center";
    center.style.gridRow = "7 / span 3"; center.style.gridColumn = "7 / span 3";
    board.appendChild(center);
  }

  /* ---------- Dice boxes aur tokens ---------- */

  // Dice apne color ke corner me: upar Red | Green, neeche Blue | Yellow
  function buildDice() {
    const top = $("dice-top"), bot = $("dice-bottom");
    top.innerHTML = ""; bot.innerHTML = ""; diceEls = [];
    [[top, [0, 1]], [bot, [3, 2]]].forEach(([row, seats]) => seats.forEach((seat) => {
      const p = state.players.find((q) => q.seat === seat);
      const d = document.createElement("div");
      if (!p) { d.className = "dbox spacer"; row.appendChild(d); return; }   // band color ka corner khali
      d.className = "dbox";
      d.style.setProperty("--c", HEX[seat]);
      d.innerHTML = `<span class="k">${KEYS[seat].toUpperCase()}</span><span class="v">${cubeHTML()}</span><span class="rk"></span><span class="tm"></span><small></small>`;
      d.querySelector("small").textContent = p.name;
      d.onclick = () => { if (p === cur() && p.kind === "human") doRoll(); };
      row.appendChild(d);
      diceEls[seat] = d;
      setCube(seat, 1, false);
    }));
  }
  // 3D dice: 6 faces wala cube. FACE_ROT = us number ko saamne lane ke liye [rotateX, rotateY]
  const cubeHTML = () => '<div class="cube">' + [1, 2, 3, 4, 5, 6].map((n) => `<div class="cf f${n}">${face(n)}</div>`).join("") + "</div>";
  const FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  function setCube(seat, v, spin) {
    const c = diceEls[seat].querySelector(".cube"), [rx, ry] = FACE_ROT[v];
    const px = c._x || 0, py = c._y || 0;
    const tx = spin ? rx + 360 * Math.ceil((px + 720 - rx) / 360) : rx;     // 2 chakkar X me
    const ty = spin ? ry + 360 * Math.ceil((py + 1080 - ry) / 360) : ry;    // 3 chakkar Y me
    c._x = tx; c._y = ty;
    c.style.transform = `rotateX(${tx}deg) rotateY(${ty}deg)`;   // tilt nahi: rukne par face seedha saamne
  }

  function createTokens() {
    board.querySelectorAll(".token").forEach((t) => t.remove());
    tokenEls = state.players.map((p, pi) => p.tokens.map((_, ti) => {
      const t = document.createElement("div");
      t.className = "token";
      t.dataset.seat = p.seat;                       // theme ke hisaab se goti par chitra
      t.style.background = HEX[p.seat];
      t.onclick = () => {
        if (pi === state.current && cur().kind === "human" && state.roll !== null &&
            Ludo.getValidMoves(state, state.roll).includes(ti)) doMove(ti);
      };
      board.appendChild(t);
      return t;
    }));
  }

  function tokenXY(seat, progress, ti) {
    if (progress === -1) return BASE_SLOTS[seat][ti];
    if (progress <= 50) { const [r, c] = TRACK[(seat * 13 + progress) % 52]; return [c + 0.5, r + 0.5]; }
    if (progress <= 55) { const [r, c] = HOME_COL[seat][progress - 51]; return [c + 0.5, r + 0.5]; }
    const [r, c] = HOME_END[seat]; return [c + 0.5, r + 0.5];
  }

  /* ---------- Screen update ---------- */

  function render() {
    const groups = {};
    state.players.forEach((p, pi) => p.tokens.forEach((real, ti) => {
      const pr = disp ? disp[pi][ti] : real;   // animation ke waqt dikhne wali position
      const [x, y] = tokenXY(p.seat, pr, ti);
      (groups[x + "," + y] = groups[x + "," + y] || []).push({ pi, ti, x, y, pr, seat: p.seat });
    }));
    Object.values(groups).forEach((list) => {
      const f = list[0], pos = Ludo.absolutePos(f.seat, f.pr);
      // ek hi color ki 2+ goti unsafe square par = block
      const block = list.length > 1 && list.every((e) => e.pi === f.pi) && pos !== null && !Ludo.SAFE_SQUARES.has(pos);
      list.forEach((e, k) => {
        const off = list.length > 1 ? (k - (list.length - 1) / 2) * 0.3 : 0;
        const el = tokenEls[e.pi][e.ti];
        el.style.left = ((e.x + off) / 15 * 100) + "%";
        el.style.top = (e.y / 15 * 100) + "%";
        el.classList.toggle("block", block);
      });
    });

    const p = cur();
    baseEls.forEach((b, seat) => b.classList.toggle("turn", !state.over && p.seat === seat));
    const human = !state.over && p.kind === "human" && !locked && !paused;
    const valid = state.roll !== null && !state.over ? Ludo.getValidMoves(state, state.roll) : [];
    tokenEls.forEach((row, pi) => row.forEach((el, ti) => {
      const m = human && pi === state.current && valid.includes(ti);
      el.classList.toggle("movable", m);
      el.classList.toggle("sel", m && ti === sel);
    }));
    state.players.forEach((q, i) => {
      const d = diceEls[q.seat], rk = d.querySelector(".rk");
      d.classList.toggle("on", !state.over && i === state.current);
      rk.textContent = q.rank ? ORD[q.rank - 1] : "";
      rk.className = "rk" + (q.rank === 1 ? " gold" : "");
    });

  }

  /* ---------- Game flow ---------- */

  // Har state badalne ke baad ye dekhta hai ki aage kya hona hai
  function kick() {
    if (!state || paused || state.over) return;
    const p = cur(), r = state.roll;
    const v = r === null ? [] : Ludo.getValidMoves(state, r);
    if (v.length && !v.includes(sel)) sel = v[0];
    render();
    if (r === null) saveGame();                                          // har baari par auto-save
    stopTm();
    if (p.kind === "human" && cfg.timer && (r === null || v.length > 1)) startTm();   // turn timer
    if (r === null) { if (p.kind === "bot") schedule(doRoll, 800); }
    else if (!v.length) {
      const bx = diceEls[p.seat];
      bx.classList.remove("shake"); void bx.offsetWidth; bx.classList.add("shake");
      schedule(() => { Ludo.skipTurn(state); kick(); }, 1000);
    }
    else if (v.length === 1) schedule(() => doMove(v[0]), 450);          // ek hi option to khud chalo
    else if (p.kind === "bot") schedule(botMove, 700);
  }

  function doRoll() {
    if (!state || paused || locked || rolling || state.over || state.roll !== null) return;
    rolling = true; stopTm();
    const seat = cur().seat, box = diceEls[seat];
    const res = Ludo.doRoll(state);
    if (res.cancelled && state.players.find((p) => p.seat === seat).kind === "human") unlock("six3");                    // nateeja pehle tay, 3D animation baad me
    box.classList.add("rolling");
    setCube(seat, res.roll, true);                     // upar uthke ghoomta hua face par rukta hai
    let n = 0;
    (function step() {
      SFX.roll();
      if (++n < 8) { schedule(step, 110); return; }
      rolling = false; box.classList.remove("rolling");
      SFX.land();
      box.classList.remove("land"); void box.offsetWidth; box.classList.add("land");
      kick();
    })();
  }

  function botMove() {
    if (paused || !state || state.roll === null || cur().kind !== "bot") return;
    doMove(Ludo.chooseMove(state, Ludo.getValidMoves(state, state.roll), state.roll, cfg.level));
  }

  function doMove(ti) {
    if (!state || paused || locked || rolling || state.roll === null) return;
    const pi = state.current, pl = cur();
    const snap = state.players.map((p) => p.tokens.slice());   // chalne se pehle ki positions
    const from = snap[pi][ti];
    const res = Ludo.moveToken(state, ti, state.roll);
    if (!res.moved) return;
    stopTm();
    if (pl.kind === "human") {                         // achievements
      if (res.captured) unlock("firstkill");
      if (pl.kills >= 3) unlock("streak3");
      if (res.finished) unlock("home1");
    }
    sel = -1;
    const to = pl.tokens[ti], el = tokenEls[pi][ti], path = [];
    if (from === -1) path.push(0); else for (let p = from + 1; p <= to; p++) path.push(p);
    locked = true; disp = snap;

    after = () => {                                     // animation khatam hone par
      after = null; disp = null; locked = false;
      el.classList.remove("hop", "pop", "home");
      tokenEls.forEach((row) => row.forEach((t) => {
        if (t.classList.contains("kill")) {
          t.classList.remove("kill"); t.classList.add("pop");
          setTimeout(() => t.classList.remove("pop"), 500);
        }
      }));
      if (res.finishedNow) {                            // jeet ka celebration (2.5 sec)
        locked = true;
        SFX.win(); bigFireworks(); render();
        later(afterCelebrate, 2500);
      } else kick();
    };

    let i = 0;
    (function step() {                                  // ek-ek square par rukke chalo
      if (i < path.length) {
        disp[pi][ti] = path[i++];
        el.classList.remove("hop", "pop"); void el.offsetWidth;
        el.classList.add(from === -1 ? "pop" : "hop");
        if (from === -1) SFX.out(); else SFX.step();
        render(); schedule(step, 190);
        return;
      }
      if (to === Ludo.HOME) {                           // home pahunchne ka effect
        el.classList.remove("hop"); el.classList.add("home"); SFX.home();
        const [hr, hc] = HOME_END[pl.seat];
        celebrate(14, (hc + 0.5) / 15 * 100, (hr + 0.5) / 15 * 100);
      }
      if (res.captured) {                               // kati hui gotiyan chhoti hoke gayab
        state.players.forEach((q, qi) => q.tokens.forEach((p, k) => {
          if (snap[qi][k] !== -1 && p === -1) tokenEls[qi][k].classList.add("kill");
        }));
        SFX.kill();
      }
      schedule(() => { if (after) after(); }, res.captured || to === Ludo.HOME ? 600 : 120);
    })();
  }

  function afterCelebrate() { locked = false; if (state.over) showResult(); else kick(); }

  // n patakhe; cx, cy (% me) diye to wahin chhota sa burst
  function celebrate(n = 40, cx = null, cy = null) {
    for (let i = 0; i < n; i++) {
      const d = document.createElement("div"), small = cx !== null;
      const a = Math.random() * 6.283, r = (small ? 15 : 60) + Math.random() * (small ? 40 : 140);
      d.className = "fw";
      d.style.cssText = `--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r - (small ? 0 : 80)}px;background:hsl(${Math.random() * 360},90%,55%);left:${small ? cx : 20 + Math.random() * 60}%;top:${small ? cy : 30 + Math.random() * 30}%`;
      board.appendChild(d);
      setTimeout(() => d.remove(), 2400);
    }
  }

  /* ---------- Keyboard se goti chunna ---------- */

  function moveSel(key) {
    const v = Ludo.getValidMoves(state, state.roll);
    if (v.length < 2) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    const pos = (ti) => tokenXY(cur().seat, cur().tokens[ti], ti);
    const [sx, sy] = pos(sel);
    let best = -1, bd = 1e9;
    v.forEach((ti) => {
      if (ti === sel) return;
      const [x, y] = pos(ti), dx = x - sx, dy = y - sy;
      if (dx * d[0] + dy * d[1] <= 0) return;           // us direction me nahi
      const dist = Math.hypot(dx, dy);
      if (dist < bd) { bd = dist; best = ti; }
    });
    if (best < 0) {                                     // koi nahi mila to agli/pichli goti
      const step = (d[0] + d[1]) > 0 ? 1 : -1;
      best = v[(v.indexOf(sel) + step + v.length) % v.length];
    }
    sel = best; render();
  }

  addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT") return;   // naam likhte waqt shortcuts band
    if (e.key === "Escape") { togglePause(); return; }
    if (e.key.toLowerCase() === "m") { toggleMute(); return; }
    if (!state || paused || locked || rolling || e.repeat || gameEl.hidden || !resultEl.hidden) return;
    const si = KEYS.indexOf(e.key.toLowerCase()), p = cur();
    if (si >= 0) {
      if (state.over) return;
      if (p.seat === si && p.kind === "human") doRoll();
      return;
    }
    if (state.roll !== null && p.kind === "human" && !state.over) {
      if (e.key === "Enter" && sel >= 0) { e.preventDefault(); doMove(sel); }
      else if (e.key.startsWith("Arrow")) { e.preventDefault(); moveSel(e.key); }
    }
  });

  /* ---------- Menus ---------- */

  function halt() {
    paused = true; clearTimeout(timer); rolling = false;
    diceEls.forEach((d) => d && d.classList.remove("rolling"));
  }
  function resume() {
    paused = false; pauseEl.hidden = true; exitEl.hidden = true;
    if (after) after(); else kick();
  }
  function togglePause() {
    if (!state || gameEl.hidden || !resultEl.hidden) return;
    if (paused) { resume(); return; }
    halt(); pauseEl.hidden = false;
  }
  function askExit() {                                   // "Exit Game?" confirm
    if (!state || gameEl.hidden || !resultEl.hidden) return;
    if (!paused) halt();
    pauseEl.hidden = true; exitEl.hidden = false; $("exit-msg").textContent = "";
  }
  function quitGame(msgEl) {                             // PWA window band hoti hai; browser tab me message aata hai
    window.close();
    msgEl.textContent = "Your browser blocked closing. Press Alt+F4 or click the X button.";
  }

  function showSetup() {
    clearTimeout(timer);
    paused = false; locked = false; disp = null; after = null;
    gameEl.hidden = true; pauseEl.hidden = true; resultEl.hidden = true; exitEl.hidden = true; setupEl.hidden = false;
    step1.hidden = false; step2.hidden = true;
    stopTm(); $("continue").hidden = !hasSave();
  }

  function showResult() {
    clearSave(); recordStats();
    const list = $("rank-list");
    list.innerHTML = "";
    state.ranking.forEach((pi, i) => {
      const q = state.players[pi], li = document.createElement("li");
      li.innerHTML = `<span class="dot" style="background:${HEX[q.seat]}"></span> `;
      li.append(`${ORD[i]}: ${q.name}${q.kind === "bot" ? " (CPU)" : ""}`);
      if (i === 0) li.className = "first";
      list.appendChild(li);
    });
    resultEl.hidden = false;
  }

  function startGame(c) {
    cfg = c;
    clearTimeout(timer);
    state = Ludo.createGame(c.seats, c.mode);
    state.players.forEach((p) => { p.kind = c.kinds[p.seat]; p.name = c.names[p.seat]; });
    paused = false; locked = false; rolling = false; sel = -1; disp = null; after = null;
    setupEl.hidden = true; gameEl.hidden = false; pauseEl.hidden = true; resultEl.hidden = true;
    buildDice(); createTokens(); kick();
  }

  startBtn.onclick = () => startGame({ seats: SEATS[count], kinds: kinds.slice(), names: [0, 1, 2, 3].map(pname), level: "normal", mode, timer: timerSec });
  $("p-resume").onclick = resume;
  $("p-exit").onclick = askExit;
  $("btn-menu").onclick = togglePause;
  $("btn-exit").onclick = askExit;
  $("x-cancel").onclick = resume;
  $("x-quit").onclick = () => quitGame($("exit-msg"));
  $("s-exit").onclick = () => quitGame($("menu-msg"));
  $("p-restart").onclick = () => startGame(cfg);
  $("p-setup").onclick = showSetup;
  $("r-again").onclick = () => startGame(cfg);
  $("r-setup").onclick = showSetup;

  /* ---------- Theme aur mute ---------- */
  const THEMES = [["games", "Games (Default)"], ["cartoon", "Cartoon"], ["anime", "Anime"], ["money", "Money"],
                  ["cars", "Cars"], ["girls", "Cute Girls"], ["boys", "Cute Boys"]];
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    document.querySelectorAll(".theme-sel").forEach((s) => { s.value = t; });
    try { localStorage.setItem("ludo-theme", t); } catch (e) { /* save na ho to bhi chalega */ }
  }
  document.querySelectorAll(".theme-sel").forEach((s) => {
    s.innerHTML = THEMES.map(([v, n]) => `<option value="${v}">${n}</option>`).join("");
    s.onchange = () => { applyTheme(s.value); startMusic(); };
  });
  let savedTheme = null;
  try { savedTheme = localStorage.getItem("ludo-theme"); } catch (e) { /* ignore */ }
  applyTheme(THEMES.some(([v]) => v === savedTheme) ? savedTheme : "games");

  function toggleMute() { muted = !muted; $("mute").textContent = muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"; }
  $("mute").onclick = () => { toggleMute(); $("mute").blur(); };

  /* ---------- Save / Continue ---------- */
  const SAVE = "ludo-save";
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  function saveGame() { if (state && !state.over) store(SAVE, { state, cfg, custom }); }
  function clearSave() { try { localStorage.removeItem(SAVE); } catch (e) { /* ignore */ } }
  function hasSave() { return !!load(SAVE, null); }
  function continueGame() {
    const d = load(SAVE, null);
    if (!d) return;
    cfg = d.cfg; state = d.state;
    d.custom.forEach((c, i) => setColor(i, c));
    paused = false; locked = false; rolling = false; sel = -1; disp = null; after = null;
    setupEl.hidden = true; gameEl.hidden = false; pauseEl.hidden = true; resultEl.hidden = true; exitEl.hidden = true;
    buildDice(); createTokens(); kick();
  }
  $("continue").onclick = continueGame;
  $("continue").hidden = !hasSave();

  /* ---------- Stats aur Achievements ---------- */
  const ACH = {
    firstkill: ["First Kill", "Capture an opponent goti"], six3: ["Triple Six", "Roll three 6s in a row"],
    streak3: ["Kill Streak", "Capture 3 goti in one game"], home1: ["Home Run", "Bring a goti home"],
    firstwin: ["First Win", "Win a game"], win5: ["Dhakad Champion", "Win 5 games"],
  };
  const el = (t, txt, cls) => { const e = document.createElement(t); if (txt !== undefined && txt !== null) e.textContent = txt; if (cls) e.className = cls; return e; };
  function toast(t) { const d = el("div", t, "toast"); document.body.appendChild(d); setTimeout(() => d.remove(), 3300); }
  function unlock(id) {
    const a = load("ludo-ach", {});
    if (a[id]) return;
    a[id] = 1; store("ludo-ach", a); toast("Achievement: " + ACH[id][0]);
  }
  function recordStats() {                              // sirf Human players ka record
    const st = load("ludo-stats", {});
    state.players.forEach((p) => {
      if (p.kind !== "human") return;
      const r = st[p.name] || (st[p.name] = { played: 0, wins: 0, kills: 0 });
      r.played++; r.kills += p.kills || 0;
      if (p.rank === 1) {
        r.wins++; unlock("firstwin");
        if (Object.values(st).reduce((a, x) => a + x.wins, 0) >= 5) unlock("win5");
      }
    });
    store("ludo-stats", st);
  }
  function showStats() {
    const st = load("ludo-stats", {}), a = load("ludo-ach", {}), box = $("stats-body");
    box.innerHTML = "";
    const tb = el("table"), hd = el("tr");
    ["Player", "Played", "Wins", "Kills"].forEach((x) => hd.appendChild(el("th", x)));
    tb.appendChild(hd);
    const rows = Object.entries(st).sort((x, y) => y[1].wins - x[1].wins);
    if (!rows.length) { const r = el("tr"), c = el("td", "No games yet."); c.colSpan = 4; r.appendChild(c); tb.appendChild(r); }
    rows.forEach(([n, v]) => { const r = el("tr"); [n, v.played, v.wins, v.kills].forEach((x) => r.appendChild(el("td", x))); tb.appendChild(r); });
    box.appendChild(tb); box.appendChild(el("h3", "Achievements"));
    Object.entries(ACH).forEach(([id, [t, d]]) => {
      const r = el("div", null, "ach" + (a[id] ? " got" : ""));
      r.appendChild(el("b", (a[id] ? "\u2605 " : "\u2606 ") + t)); r.appendChild(el("small", d)); box.appendChild(r);
    });
    $("stats").hidden = false;
  }
  $("m-stats").onclick = showStats;
  $("st-close").onclick = () => { $("stats").hidden = true; };
  $("st-reset").onclick = () => { if (confirm("Reset all stats and achievements?")) { store("ludo-stats", {}); store("ludo-ach", {}); showStats(); } };

  /* ---------- Turn timer ---------- */
  function stopTm() { clearInterval(tmId); tmId = null; document.querySelectorAll(".tm").forEach((e) => { e.textContent = ""; }); }
  function startTm() {
    stopTm(); tmLeft = cfg.timer;
    const badge = diceEls[cur().seat].querySelector(".tm");
    badge.textContent = tmLeft;
    tmId = setInterval(() => {
      if (paused || locked || rolling) return;
      badge.textContent = --tmLeft;
      if (tmLeft <= 0) {                                // waqt khatam: khud roll ya best chaal
        stopTm();
        if (state.roll === null) doRoll();
        else doMove(Ludo.chooseMove(state, Ludo.getValidMoves(state, state.roll), state.roll, "normal"));
      }
    }, 1000);
  }

  /* ---------- Gamepad: A = roll/move, D-pad ya stick = chunna, Start = pause ---------- */
  const padPrev = {};
  let padOn = false;
  function padPress(k) {
    if (k === "S") { togglePause(); return; }
    if (!state || paused || locked || rolling || gameEl.hidden || state.over || cur().kind !== "human") return;
    if (k === "A") { if (state.roll === null) doRoll(); else if (sel >= 0) doMove(sel); }
    else if (k.startsWith("Arrow") && state.roll !== null) moveSel(k);
  }
  function padLoop() {
    for (const gp of (navigator.getGamepads ? navigator.getGamepads() : [])) {
      if (!gp) continue;
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), ax = gp.axes;
      const now = { A: b(0), S: b(9), ArrowUp: b(12) || ax[1] < -0.6, ArrowDown: b(13) || ax[1] > 0.6, ArrowLeft: b(14) || ax[0] < -0.6, ArrowRight: b(15) || ax[0] > 0.6 };
      for (const k in now) { if (now[k] && !padPrev[k]) padPress(k); padPrev[k] = now[k]; }
    }
    requestAnimationFrame(padLoop);
  }
  addEventListener("gamepadconnected", () => { if (!padOn) { padOn = true; requestAnimationFrame(padLoop); } });

  /* ---------- Background music (code se bani, theme ke hisaab se alag) ---------- */
  const MUSIC = {   // [tempo ms, wave, notes]
    games: [330, "triangle", [262, 294, 330, 392, 440, 523]], cartoon: [250, "square", [330, 392, 440, 523, 587, 659]],
    anime: [320, "sine", [220, 262, 294, 330, 392, 440]], money: [380, "triangle", [196, 247, 294, 330, 392, 494]],
    cars: [210, "sawtooth", [165, 196, 220, 247, 294, 330]], girls: [300, "sine", [392, 440, 523, 587, 659, 784]],
    boys: [260, "triangle", [262, 330, 392, 440, 523, 659]],
  };
  try { musicOn = localStorage.getItem("ludo-music") !== "0"; } catch (e) { /* ignore */ }
  function musicTick() {
    if (!musicOn || paused || document.hidden) return;
    const m = MUSIC[root.dataset.theme] || MUSIC.games;
    mNote = Math.max(0, Math.min(m[2].length - 1, mNote + [-1, 0, 1, 1, -2, 2][Math.floor(Math.random() * 6)]));
    tone(m[2][mNote], 0.3, m[1], m[1] === "square" || m[1] === "sawtooth" ? 0.012 : 0.03, 0, "music");
    if (mStep++ % 4 === 0) tone(m[2][0] / 2, 0.55, "sine", 0.04, 0, "music");
  }
  function startMusic() {
    clearInterval(musicId); musicId = null;
    if (!musicOn) return;
    musicId = setInterval(musicTick, (MUSIC[root.dataset.theme] || MUSIC.games)[0]);
  }
  function paintMusicBtn() { $("music").style.opacity = musicOn ? 1 : 0.45; }
  function toggleMusic() {
    musicOn = !musicOn; paintMusicBtn(); startMusic();
    try { localStorage.setItem("ludo-music", musicOn ? "1" : "0"); } catch (e) { /* ignore */ }
  }
  $("music").onclick = () => { toggleMusic(); $("music").blur(); };
  paintMusicBtn();
  ["pointerdown", "keydown"].forEach((ev) => addEventListener(ev, startMusic, { once: true }));   // pehle click/key par shuru
  addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "n" && !(e.target && e.target.tagName === "INPUT")) toggleMusic(); });

  /* ---------- Fullscreen aur splash ---------- */
  $("fs").onclick = () => {
    if (!document.fullscreenElement) { if (root.requestFullscreen) root.requestFullscreen(); }
    else document.exitFullscreen();
    $("fs").blur();
  };
  /* ---------- Fireworks (canvas): splash aur jeet par ---------- */
  const FW_HUES = { money: [45, 50, 130, 40], girls: [320, 340, 290, 350], boys: [200, 210, 150, 45], anime: [330, 270, 180, 50], cars: [0, 25, 45, 210], cartoon: [0, 50, 120, 200, 300] };
  function runFw(cv, ms, done) {
    const pal = FW_HUES[root.dataset.theme];                              // theme ke rang (games = koi bhi rang)
    const pickHue = () => pal ? pal[Math.floor(Math.random() * pal.length)] : Math.random() * 360;
    cv.width = cv.clientWidth || innerWidth; cv.height = cv.clientHeight || innerHeight;
    const g = cv.getContext("2d"), W = cv.width, H = cv.height, rockets = [], sparks = [], t0 = performance.now();
    const launch = () => rockets.push({ x: W * (0.12 + Math.random() * 0.76), y: H, ty: H * (0.1 + Math.random() * 0.4), hue: pickHue() });
    const burst = (r) => {
      boom();
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * 6.283, v = 1 + Math.random() * 5;
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 70 + Math.random() * 30, hue: r.hue + Math.random() * 40 });
      }
    };
    (function tick(now) {
      g.globalCompositeOperation = "destination-out"; g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(0, 0, W, H);   // trails
      g.globalCompositeOperation = "lighter";
      if (now - t0 < ms && Math.random() < 0.07) launch();
      for (let i = rockets.length - 1; i >= 0; i--) {                    // upar jaata rocket
        const r = rockets[i]; r.y -= H / 55;
        g.fillStyle = `hsl(${r.hue},100%,75%)`; g.fillRect(r.x - 1.5, r.y, 3, 10);
        if (r.y <= r.ty) { burst(r); rockets.splice(i, 1); }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {                     // phatne ke baad chingariyan
        const p = sparks[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.vx *= 0.985; p.life--;
        g.fillStyle = `hsla(${p.hue},100%,60%,${Math.max(p.life / 100, 0)})`;
        g.beginPath(); g.arc(p.x, p.y, 2.2, 0, 6.283); g.fill();
        if (p.life <= 0) sparks.splice(i, 1);
      }
      if (now - t0 > ms && !rockets.length && !sparks.length) { g.clearRect(0, 0, W, H); if (done) done(); return; }
      requestAnimationFrame(tick);
    })(t0);
  }
  function bigFireworks() { const cv = $("fw-win"); cv.hidden = false; runFw(cv, 2200, () => { cv.hidden = true; }); }

  /* ---------- Splash: animated logo + fireworks ---------- */
  runFw($("fw"), 3000);
  $("splash").onclick = () => $("splash").remove();
  setTimeout(() => { const sp = $("splash"); if (sp) sp.remove(); }, 3500);

  if (location.protocol === "file:") root.classList.add("local");   // file se kholne par mask-image block hota hai
  /* ---------- Volume sliders (Sound / Music) aur button click ki awaaz ---------- */
  const rd = (k, d) => { try { const v = parseFloat(localStorage.getItem(k)); return isNaN(v) ? d : v; } catch (e) { return d; } };
  sfxVol = rd("ludo-vol-sfx", 1); musVol = rd("ludo-vol-music", 0.8);
  function paintVol() {
    document.querySelectorAll(".vol-sfx").forEach((r) => { r.value = Math.round(sfxVol * 100); });
    document.querySelectorAll(".vol-music").forEach((r) => { r.value = Math.round(musVol * 100); });
  }
  function bindVol(sel, set, key) {
    document.querySelectorAll(sel).forEach((r) => {
      r.oninput = () => { set(r.value / 100); applyVol(); paintVol(); try { localStorage.setItem(key, r.value / 100); } catch (e) { /* ignore */ } };
      r.onchange = () => SFX.click();                  // slider chhodte hi awaaz sunai de
    });
  }
  bindVol(".vol-sfx", (v) => { sfxVol = v; }, "ludo-vol-sfx");
  bindVol(".vol-music", (v) => { musVol = v; }, "ludo-vol-music");
  paintVol();
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("button")) SFX.click(); });

  buildBoard();
})();
