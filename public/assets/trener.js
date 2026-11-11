// НВО тренажор по БЕЛ: 10 modules like the three NVO parts, a grade after each module, a gradebook with dates,
// an NVO forecast, a timed mock exam and a mistakes notebook.
// Two ways to run: on the site (/t/, opened with a personal code, grades kept on the server with the code)
// and as a standalone file with the questions built in (window.TRENER_BANK, grades kept in this browser).
const EMBED = window.TRENER_BANK || null;
const ONLINE = !EMBED;
const LOGO = window.TRENER_LOGO || "/assets/logo.png";
// Illustrations, sounds and the video: on the site from /media/ (cached for 30 days), in the standalone file built in (window.TRENER_IMG).
const IMGS = window.TRENER_IMG || null;
const img = (n) => (IMGS ? IMGS[n] || "" : `/media/${n}.webp`);
const asset = (path) => (IMGS ? IMGS[path] || "" : `/media/${path}`); // e.g. "sfx/right.mp3", "g-banner.mp4"
const pic = (n, cls = "", alt = "", eager) => `<img class="${cls}" src="${img(n)}" alt="${alt.replace(/"/g, "&quot;")}" ${eager ? "" : `loading="lazy"`} decoding="async">`;
// Erčo moves (animated WebP made from short clips, tools/nvo-trener/anim.py) unless the device asks for less motion.
const ANIM = ["hi", "yay", "oops", "trophy", "detective"];
const mascot = (pose) => (ANIM.includes(pose) && !matchMedia("(prefers-reduced-motion: reduce)").matches && img(`a-${pose}`) ? `a-${pose}` : `m-${pose}`);
const MOD_IMG = { chetene: "i-chetene", pravopis: "i-pravopis", glagol: "i-glagol", morfologia: "i-morfologia", sintaksis: "i-sintaksis", punktuacia: "i-punktuacia", leksika: "i-leksika", lit1: "i-lit1", lit2: "i-lit2", teoria: "i-teoria" };
const mIcon = (sec) => `mt-${sec === "fin" ? "sys" : sec || "sys"}`;
const modImg = (m) => (m.area === "math" ? mIcon(m.sec) : MOD_IMG[m.id]) || (/^ezik/.test(m.id) ? "i-ezik" : /^karti/.test(m.id) ? "i-karti" : m.area === "read" ? "i-chetene" : m.area === "lit" ? "i-lit1" : "i-pravopis");

const AREAS = {
  read: { t: "Четене с разбиране", nvo: "задачи 1–7 на НВО", w: 7, c: "var(--read)" },
  lang: { t: "Български език", nvo: "задачи 8–17 на НВО", w: 10, c: "var(--lang)" },
  lit:  { t: "Литература", nvo: "задачи 18–25 на НВО", w: 8, c: "var(--lit)" },
};
// Practice decks (the literature and language cards): graded and in the gradebook, but outside the NVO forecast and the mock exam.
const EXTRA = { cards: { t: "Карти за преговор", nvo: "не влизат в прогнозата за НВО", c: "var(--gold)" } };
const ALL_AREAS = { ...AREAS, ...EXTRA };
const isNvo = (m) => !!AREAS[m.area];
// Math (bank.math): the 50 cards „Математика за НВО, 5.–7. клас“; each written card has a practice module "mk-N" (area "math").
const isMath = (m) => !!m && m.area === "math";
let BANK = null, MODULES = [], MOD = {}, Q = {};
function setBank(b) {
  BANK = b;
  MODULES = (b.modules || []).slice();
  // Math: one mixed practice per section that has two or more cards ("ms-<section>", questions from its cards).
  if (b.math && Array.isArray(b.math.sections)) {
    for (const sec of b.math.sections) {
      const ms = MODULES.filter((m) => m.area === "math" && m.sec === sec.id && /^mk-/.test(m.id));
      if (ms.length >= 2) MODULES.push({ id: `ms-${sec.id}`, n: 900, title: `${sec.t}: смесено упражнение`, area: "math", sec: sec.id, mix: true, desc: `Задачи от ${ms.length} карти` });
    }
  }
  MOD = Object.fromEntries(MODULES.map((m) => [m.id, m]));
  Q = {};
  for (const q of b.questions) Q[q.id] = q;
}
const ofMod = (id) => BANK.questions.filter((q) => q.m === id);
const MOCK_MIN = 45;
const LET = "АБВГДЕ";
const KEY = "edubel-nvo-trener-v1";

/* ---------- saved progress ---------- */
// Standalone file: this browser only. On the site: a copy in this browser, synced to the server with the code.
let canSave = true;
const blank = () => ({ v: 1, name: "", avatar: "", hist: [], mist: {}, dos: {}, resetAt: 0, resets: {}, at: 0 });
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
function normState(o) {
  if (!o || typeof o !== "object" || !Array.isArray(o.hist)) return blank();
  return { ...blank(), ...o, v: 1, name: o.name || "", avatar: typeof o.avatar === "string" ? o.avatar : "", mist: o.mist || {}, dos: o.dos && typeof o.dos === "object" ? o.dos : {}, resets: o.resets || {} };
}
function loadLocal() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? normState(JSON.parse(s)) : blank();
  } catch (e) { canSave = false; return blank(); }
}
let S = blank();
function save() {
  S.at = Date.now();
  if (ONLINE) return Online.changed();
  canSave = ls.set(KEY, JSON.stringify(S));
}

/* ---------- two subjects: БЕЛ and математика (the choice is kept in this browser) ---------- */
const K_SUBJ = "edubel-trener-subject";
let SUBJ = ls.get(K_SUBJ) === "math" ? "math" : "bel";
// A card's QR code leads to /m/N -> /t/?m=N: open that card (after the code, if the device has none yet).
let GOTO = Number(new URLSearchParams(location.search).get("m")) || 0;
if (GOTO) SUBJ = "math";
const hasMath = () => !!(BANK && BANK.math && Array.isArray(BANK.math.cards) && BANK.math.cards.length);
const mathOn = () => SUBJ === "math" && hasMath();
const qMath = (q) => isMath(MOD[q.m]);

/* ---------- helpers ---------- */
const app = document.getElementById("app");

/* ---------- feel: short sounds, a light vibration and confetti (sound can be switched off; no motion if the device asks for less) ---------- */
const FX = (() => {
  const K = "edubel-trener-sound";
  let on = ls.get(K) !== "0", ctx = null;
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function tone(freqs, dur = 0.12, type = "sine", vol = 0.07) {
    if (!on) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime + 0.01;
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), s = t0 + i * dur * 0.75;
        o.type = type;
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(vol, s + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
        o.connect(g).connect(ctx.destination);
        o.start(s);
        o.stop(s + dur + 0.03);
      });
    } catch (e) {}
  }
  const buzz = (p) => { try { if (on && navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  // Real sound effects (public/media/sfx/, made by tools/nvo-trener/sfx.py), loaded after the first tap.
  // Until a file is ready, or if it cannot load, the short synthesized tones play instead.
  const SFX = ["right", "wrong", "tap", "found", "win", "levelup", "badge", "reveal", "stamp"], buf = {};
  let loading = false;
  function load() {
    if (loading) return;
    loading = true;
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    for (const n of SFX) {
      const url = asset(`sfx/${n}.mp3`);
      if (!url) continue;
      fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((a) => new Promise((ok, no) => ctx.decodeAudioData(a, ok, no))).then((b) => { buf[n] = b; }).catch(() => {});
    }
  }
  function play(n, vol = 0.55) {
    if (!on || !buf[n] || !ctx) return false;
    try {
      if (ctx.state === "suspended") ctx.resume();
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf[n];
      g.gain.value = vol;
      src.connect(g).connect(ctx.destination);
      src.start();
      return true;
    } catch (e) { return false; }
  }
  addEventListener("pointerdown", () => { if (on) load(); }, { once: false, passive: true });
  const COLORS = ["#7C5CFF", "#FF5FA2", "#FFC83D", "#2BD4A4", "#38B6FF", "#FF8A3D"];
  function confetti(n) {
    if (still()) return;
    const c = document.createElement("canvas");
    c.className = "fx-confetti";
    c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const ps = Array.from({ length: n }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35,
      vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 5,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, col: COLORS[(Math.random() * COLORS.length) | 0],
    }));
    const t0 = performance.now();
    (function frame(t) {
      const k = (t - t0) / 1000;
      g.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.globalAlpha = Math.max(0, 1 - k / 2.4); g.translate(p.x, p.y); g.rotate(p.r);
        g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 2); g.restore();
      }
      if (k < 2.4) requestAnimationFrame(frame);
      else c.remove();
    })(t0);
  }
  return {
    get on() { return on; },
    toggle() { on = !on; ls.set(K, on ? "1" : "0"); if (on) { load(); play("tap") || tone([660, 880], 0.09, "triangle"); } return on; },
    right() { play("right") || tone([587, 784, 988], 0.09, "triangle"); buzz(12); },
    wrong() { play("wrong", 0.45) || tone([247, 208], 0.13, "sine", 0.05); buzz([25, 40, 25]); },
    win(big) { play(big ? "levelup" : "win", 0.6) || tone(big ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047], 0.12, "triangle"); buzz(35); confetti(big ? 170 : 90); },
    pop() { play("tap", 0.5) || tone([880, 1175], 0.06, "triangle", 0.05); },
    found() { play("found") || tone([880, 1175], 0.06, "triangle", 0.05); buzz(8); },
    badge() { play("badge", 0.6) || tone([988, 1319], 0.08, "triangle"); },
    reveal() { play("reveal", 0.6) || tone([523, 784, 1047], 0.1, "triangle"); buzz([20, 30, 40]); confetti(110); },
    stamp() { play("stamp", 0.7) || tone([140, 90], 0.08, "sine", 0.1); buzz(30); },
  };
})();

/* ---------- light / dark ("Нощна смяна") – chosen on this device, else as the device is set ---------- */
const Theme = (() => {
  const K = "edubel-trener-theme", root = document.documentElement;
  const apply = (v) => { if (v === "dark" || v === "light") root.dataset.theme = v; else delete root.dataset.theme; };
  apply(ls.get(K));
  const dark = () => root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  return { dark, toggle() { const v = dark() ? "light" : "dark"; ls.set(K, v); apply(v); } };
})();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rich = (s) => esc(s).replace(/&lt;(\/?)(i|b|u|em|strong)&gt;/g, "<$1$2>").replace(/&lt;br\s*\/?&gt;/g, "<br>");
// Math content comes as HTML (fractions, italic letters, small drawings): only these tags and attributes get through.
const MH_TAGS = new Set("span b i em strong small sup sub p ol ul li div section br h5 figure figcaption details summary table thead tbody tr th td svg g path circle line rect ellipse polyline polygon text tspan".split(" "));
const MH_ATTR = /^(class|width|height|viewbox|d|stroke|stroke-width|fill|cx|cy|r|rx|ry|x|y|x1|y1|x2|y2|points|transform|text-anchor|font-size|font-style|font-family|font-weight|stroke-dasharray|stroke-linecap|stroke-linejoin|opacity|dominant-baseline|fill-opacity|stroke-opacity|style)$/i;
const mhCache = new Map();
function mh(s) {
  s = String(s ?? "");
  if (mhCache.has(s)) return mhCache.get(s);
  const t = document.createElement("template");
  t.innerHTML = s;
  const walk = (el) => {
    for (const c of [...el.children]) {
      if (!MH_TAGS.has(c.tagName.toLowerCase())) { c.remove(); continue; }
      for (const a of [...c.attributes]) {
        if (!MH_ATTR.test(a.name) || /javascript:|url\(|expression/i.test(a.value) || (a.name === "style" && c.tagName.toLowerCase() !== "svg")) c.removeAttribute(a.name);
      }
      walk(c);
    }
  };
  walk(t.content);
  const out = t.innerHTML;
  mhCache.set(s, out);
  return out;
}
const R = (q, s) => (q && q.h ? mh(s) : rich(s));
const rightHtml = (q) => (q.t === "mc" ? R(q, rightText(q)) : rich(rightText(q)));
const ansHtml = (q, a) => (q.t === "input" || q.t === "self" ? esc(answerText(q, a)) : R(q, answerText(q, a)));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (p, n) => (n ? p / n : 0);
const gradeOf = (r) => (r >= 0.9 ? 6 : r >= 0.76 ? 5 : r >= 0.63 ? 4 : r >= 0.5 ? 3 : 2);
const GW = { 6: "Отличен", 5: "Много добър", 4: "Добър", 3: "Среден", 2: "Слаб" };
const dec = (x) => x.toFixed(2).replace(".", ",");
const pc = (r) => Math.round(r * 100) + "%";
const two = (n) => String(n).padStart(2, "0");
function fmtDate(t, time) {
  const d = new Date(t);
  const s = `${d.getDate()}.${two(d.getMonth() + 1)}.${d.getFullYear()} г.`;
  return time ? `${s}, ${two(d.getHours())}:${two(d.getMinutes())}` : s;
}
const fmtShort = (t) => { const d = new Date(t); return `${d.getDate()}.${two(d.getMonth() + 1)}`; };
function fmtDur(sec) { const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m} мин. ${s} сек.` : `${s} сек.`; }
const fmtClock = (sec) => `${Math.floor(sec / 60)}:${two(sec % 60)}`;
const pl = (n, one, many) => (n === 1 ? one : many);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[„“"”«»'’`.!?;:]/g, "").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
const modTitle = (m) => (m === "mock" ? "Пробна матура" : MOD[m] ? MOD[m].title : m);

const attemptsOf = (m) => S.hist.filter((h) => h.m === m);
const lastOf = (m) => { const a = attemptsOf(m); return a.length ? a[a.length - 1] : null; };
const bestOf = (m) => attemptsOf(m).reduce((b, h) => (!b || pct(h.p, h.n) > pct(b.p, b.n) ? h : b), null);
// The mistakes notebook, for one subject (math = true / false) or for both.
const mistIds = (math) => Object.keys(S.mist).filter((id) => Q[id] && MOD[Q[id].m] && (math === undefined || qMath(Q[id]) === math)).sort((a, b) => S.mist[b].d - S.mist[a].d);

function forecast() {
  const areas = {};
  for (const k in AREAS) {
    const ms = MODULES.filter((m) => m.area === k);
    const done = ms.map((m) => lastOf(m.id)).filter(Boolean);
    areas[k] = { p: done.length ? done.reduce((s, h) => s + pct(h.p, h.n), 0) / done.length : null, done: done.length, total: ms.length };
  }
  let sw = 0, s = 0;
  for (const k in areas) if (areas[k].p !== null) { sw += AREAS[k].w; s += AREAS[k].w * areas[k].p; }
  return { areas, total: sw ? s / sw : null, done: MODULES.filter((m) => lastOf(m.id)).length };
}
// The modules that give the most NVO points for the work: weight of the module on the exam × share still to win.
function nextSteps() {
  return MODULES.filter(isNvo).map((m) => {
    const h = lastOf(m.id);
    const per = AREAS[m.area].w / MODULES.filter((x) => x.area === m.area).length;
    const p = h ? pct(h.p, h.n) : null;
    return { m, p, gain: per * (1 - (p === null ? 0.4 : p)) };
  }).filter((x) => x.p === null || x.p < 0.9).sort((a, b) => b.gain - a.gain).slice(0, 3);
}

/* ---------- Erčo's voice: short lines (public/media/voice/, made by tools/nvo-trener/voice.py) ---------- */
// Only with the sound on and "Ерчо говори" on (both remembered in this browser). One audio element for all lines:
// once a tap has let it play, later lines may start on their own (phones allow sound only after a tap).
const Voice = (() => {
  const K = "edubel-trener-voice", V = 1;
  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  let on = ls.get(K) !== "0", el = null, queue = [], timer = 0, unlocked = false;
  const can = () => FX.on && on;
  const elem = () => {
    if (!el) { el = new Audio(); el.preload = "auto"; el.addEventListener("ended", next); }
    return el;
  };
  function next() {
    const n = queue.shift();
    if (!n || !can()) return;
    const url = asset(`voice/${n}-${V}.mp3`);
    if (!url) return next();
    const a = elem();
    a.src = url;
    a.volume = 0.8;
    a.play().catch(() => {});
  }
  // Says the lines one after the other (after `delay` ms); a new call replaces what is still waiting or playing –
  // unless `wait`: then the lines come after the one playing now (the greeting is not cut off by the first task).
  function say(names, delay = 0, wait = false) {
    names = (Array.isArray(names) ? names : [names]).filter(Boolean);
    if (wait && el && !el.paused && !el.ended && el.src.indexOf("data:audio/wav") !== 0) { queue = queue.concat(names); return; }
    clearTimeout(timer);
    if (el) el.pause();
    queue = names;
    if (!can() || !names.length) return;
    if (delay) timer = setTimeout(next, delay);
    else next();
  }
  // The first line right inside a tap; tells whether the browser let it play.
  function now(name) {
    const url = asset(`voice/${name}-${V}.mp3`);
    if (!can() || !url) return Promise.resolve(false);
    clearTimeout(timer);
    queue = [];
    const a = elem();
    a.src = url;
    a.volume = 0.8;
    return a.play().then(() => { unlocked = true; return true; }, () => false);
  }
  // The first tap "unlocks" the audio element, so later lines (after a short pause) can play on phones too.
  addEventListener("click", () => {
    if (unlocked || !can()) return;
    const a = elem();
    if (!a.paused) { unlocked = true; return; }
    a.src = SILENT;
    a.play().then(() => { unlocked = true; }, () => {});
  }, true);
  return {
    get on() { return on; },
    toggle() { on = !on; ls.set(K, on ? "1" : "0"); if (!on) { queue = []; clearTimeout(timer); if (el) el.pause(); } else say("ok-0"); return on; },
    say, now, stop: () => say([]),
  };
})();

// The greeting: once a day, on the board. If the browser refuses sound before a tap, it waits for the first tap
// (played right inside it, as Safari wants) – and is skipped if that tap is on the sound switch.
const Hello = (() => {
  const K = "edubel-trener-hello";
  const LINES = {
    hello: "Хей, здравей! Аз съм Ерчо. Хайде да учим и да играем!",
    back: "Ей, пак си тук! Супер. Да продължим ли?",
    math: "Здрасти! Днес сме с числата. Да започваме!",
  };
  let waiting = false;
  const day = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const pick = (tap) => (mathOn() ? "math" : !ls.get(K) || (tap && !/^h-/.test(S.avatar || "")) ? "hello" : "back");
  function show(line) {
    const b = document.querySelector(".hero .bubble");
    if (!b) return;
    b.textContent = LINES[line];
    b.classList.remove("talk");
    void b.offsetWidth;
    b.classList.add("talk");
  }
  function onTap(e) {
    removeEventListener("click", onTap, true);
    removeEventListener("keydown", onTap, true);
    waiting = false;
    if (e.target && e.target.closest && e.target.closest('[data-act="sound"],[data-act="voice"]')) return;
    greet();
  }
  function greet() {
    if (!FX.on || !Voice.on || ls.get(K) === day() || waiting) return;
    const line = pick();
    Voice.now(line).then((ok) => {
      if (ok) { ls.set(K, day()); show(line); }
      else if (!waiting) { waiting = true; addEventListener("click", onTap, true); addEventListener("keydown", onTap, true); }
    });
  }
  // A tap on Erčo: the line again (the words show in the bubble even when he is quiet).
  function tap() {
    const line = pick(true);
    show(line);
    Voice.now(line).then((ok) => { if (ok) ls.set(K, day()); });
  }
  return { greet, tap };
})();

// "Чуй задачата": the task read aloud by the device's own Bulgarian voice (free, nothing to download, works with every
// task). The button shows only where the device has a Bulgarian voice.
const Speak = (() => {
  const has = "speechSynthesis" in window;
  let bg = null;
  const find = () => { try { bg = speechSynthesis.getVoices().find((v) => /^bg/i.test(v.lang)) || null; } catch (e) { bg = null; } };
  if (has) { find(); try { speechSynthesis.addEventListener("voiceschanged", find); } catch (e) {} }
  const plain = (html) => { const d = document.createElement("div"); d.innerHTML = html; d.querySelectorAll(".fr").forEach((f) => { const p = f.children; if (p.length === 2) f.textContent = ` ${p[0].textContent} върху ${p[1].textContent} `; }); return d.textContent; };
  // Math said in words: "2 · 3" -> "2 по 3", "x²" -> "x на квадрат", "15%" -> "15 процента"…
  const words = (t) => t.replace(/(\d)\s*·\s*(?=[\d(a-zа-я])/gi, "$1 по ").replace(/(\d)\s*:\s*(?=\d)/g, "$1 делено на ").replace(/\s[−–-]\s/g, " минус ").replace(/(^|[\s(=])[−-](?=\d)/g, "$1минус ")
    .replace(/\+/g, " плюс ").replace(/=/g, " равно на ").replace(/</g, " по-малко от ").replace(/>/g, " по-голямо от ").replace(/²/g, " на квадрат").replace(/³/g, " на куб")
    .replace(/%/g, " процента").replace(/€/g, " евро").replace(/°/g, " градуса").replace(/\bcm\b/g, "сантиметра").replace(/\bm\b/g, "метра").replace(/(\d)\s*\/\s*(\d)/g, "$1 върху $2");
  function text(q, part, v, a) {
    const T = (s) => (q.h ? words(plain(s)) : plain(String(s).replace(/<br\s*\/?>/g, ". ")));
    if (part === "why") return T(q.why || "");
    let t = (q.text ? T(q.text) + ". " : "") + T(q.q);
    if (q.t === "mc") t += " " + (v && v.ord ? v.ord : q.o.map((_, i) => i)).map((oi, k) => `${LET[k]}: ${T(q.o[oi])}.`).join(" ");
    if (q.t === "order") t += " " + (Array.isArray(a) ? a : q.items.map((_, i) => i)).map((k) => T(q.items[k]) + ".").join(" ");
    if (q.t === "match") t += " " + q.pairs.map((p) => T(p[0]) + ".").join(" ");
    return t;
  }
  function read(q, part, v, a) {
    if (!has) return;
    Voice.stop();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text(q, part, v, a).replace(/\s+/g, " ").trim());
    u.lang = "bg-BG";
    if (bg) u.voice = bg;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
  return { ok: () => has && !!bg, read, stop: () => { if (has) speechSynthesis.cancel(); } };
})();

/* ---------- progress you can see: XP, levels, stars, badges (all worked out from the saved results – nothing to buy, nothing random) ---------- */
const LEVELS = ["Новобранец", "Читател", "Откривател", "Тълкувател", "Майстор на запетаята", "Словесен стратег", "Пазител на словото", "Магьосник на думите", "Легенда на НВО", "Безсмъртен класик"];
function xpNow() {
  let x = 0;
  for (const h of S.hist) x += h.p * 10 + (h.m === "mock" ? 50 : 0);
  for (const [k, v] of Object.entries(S.dos || {})) {
    if (!v || typeof v !== "object") continue;
    if (v.done) x += k === "final" ? 150 : 60;
    if (v.b4) x += 20;
    if (v.b5) x += 20;
  }
  return x;
}
const lvlFrom = (L) => 75 * L * (L - 1); // XP needed for level L: 0, 150, 450, 900, 1500…
function level(x = xpNow()) {
  let L = 1;
  while (x >= lvlFrom(L + 1)) L++;
  return { L, x, name: LEVELS[Math.min(L, LEVELS.length) - 1], from: lvlFrom(L), to: lvlFrom(L + 1) };
}
// Stars on a module, like in a game: the best grade 4 → ★, 5 → ★★, 6 → ★★★.
const starsOf = (m) => { const b = bestOf(m); const g = b ? gradeOf(pct(b.p, b.n)) : 0; return g >= 6 ? 3 : g === 5 ? 2 : g === 4 ? 1 : 0; };
const starRow = (n, cls = "") => `<span class="stars ${cls}" role="img" aria-label="${n} от 3 звезди">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}">★</i>`).join("")}</span>`;
const firstLast = (m) => { const a = attemptsOf(m); return a.length > 1 ? [a[0], a[a.length - 1]] : null; };
const BADGES = [
  { id: "first", e: "🚀", t: "Първа стъпка", d: "Реши първия си тест", ok: () => S.hist.length > 0 },
  { id: "six", e: "⭐", t: "Шестица", d: "Изкарай Отличен 6 на тест", ok: () => S.hist.some((h) => gradeOf(pct(h.p, h.n)) === 6) },
  { id: "perfect", e: "💯", t: "Без грешка", d: "Реши тест без нито една грешка", ok: () => S.hist.some((h) => h.p === h.n) },
  { id: "up", e: "📈", t: "Нагоре", d: "Подобри оценката си в модул", ok: () => MODULES.some((m) => { const f = firstLast(m.id); return f && gradeOf(pct(f[1].p, f[1].n)) > gradeOf(pct(f[0].p, f[0].n)); }) },
  { id: "worlds", e: "🧭", t: "Трите части", d: "Реши модул от четене, език и литература", ok: () => Object.keys(AREAS).every((k) => MODULES.some((m) => m.area === k && lastOf(m.id))) },
  { id: "mock", e: "🏁", t: "Генерална репетиция", d: "Направи пробна матура", ok: () => !!lastOf("mock") },
  { id: "ten", e: "⚡", t: "Десетка", d: "Реши 10 теста", ok: () => S.hist.length >= 10 },
  { id: "all", e: "🗺️", t: "Изследовател", d: "Реши всеки модул по БЕЛ поне веднъж", ok: () => { const ms = MODULES.filter((m) => !isMath(m)); return ms.length > 0 && ms.every((m) => lastOf(m.id)); } },
  { id: "m1", e: "📐", t: "Математик", d: "Упражни първата карта по математика", ok: () => S.hist.some((h) => isMath(MOD[h.m])), math: true },
  { id: "m5", e: "🧮", t: "Пет по три", d: "Вземи ★★★ на 5 карти по математика", ok: () => MODULES.filter((m) => isMath(m) && starsOf(m.id) === 3).length >= 5, math: true },
  { id: "mtrap", e: "🪤", t: "Ловец на капани", d: "Реши карта „Капан“ без нито една грешка", ok: () => S.hist.some((h) => MOD[h.m] && MOD[h.m].sec === "trap" && h.p === h.n), math: true },
  { id: "det", e: "🔎", t: "Детектив", d: "Разкрий 5 литературни досиета", ok: () => Game.solvedN() >= 5, game: true },
  { id: "col", e: "🃏", t: "Колекционер", d: "Събери 12 героя в колекцията", ok: () => Game.solvedN() >= 12, game: true },
  { id: "king", e: "👑", t: "Главен инспектор", d: "Разкрий тайното послание", ok: () => Game.finished(), game: true },
];
const badgeList = () => BADGES.filter((b) => (!b.game || BANK.dossiers) && (!b.math || hasMath()));
const earned = () => new Set(badgeList().filter((b) => { try { return b.ok(); } catch (e) { return false; } }).map((b) => b.id));
// Erčo's lines on the board: dry, kind, never about the child's mistakes.
const ERCHO = [
  "Запетаите не хапят. Проверих.",
  "Днес е добър ден за една шестица.",
  "Бай Ганьо пак търси килимчето си. Ти търси верния отговор.",
  "Аз съм Ъ. Все ме изпускат. Ти – не.",
  "Пет минути сега са по-добре от два часа в нощта преди изпита.",
  "Грешката е улика. Детективите обичат улики.",
  "Вазов е писал и в трудни дни. Ти можеш един модул.",
  "Обещавам: глаголните времена са по-лесни от домашното по физика.",
  "Чавдар на 12 е бил по-смел от всички. Ти си на ход.",
  "Не бързай. Прочети въпроса два пъти – той често сам подсказва.",
];

/* ---------- home: forecast, modules, gradebook ---------- */
let sess = null, timer = null, histAll = false;

function home(scrollTo) {
  stopTimer();
  Speak.stop();
  sess = null;
  Game.leave();
  if (GOTO && hasMath()) {
    const n = GOTO;
    GOTO = 0;
    SUBJ = "math";
    if (mCard(n)) return mathCard(n);
    scrollTo = `mt-${n}`; // a card that is not in the app yet: show where it will be
  }
  const M = mathOn();
  const nvoCount = BANK.questions.filter((q) => MOD[q.m] && isNvo(MOD[q.m])).length;
  const cardCount = BANK.questions.filter((q) => MOD[q.m] && MOD[q.m].area === "cards").length;
  const f = forecast();
  const mist = mistIds(false).length;
  const lv = level(), nx = nextSteps()[0], name = S.name.trim();
  const tips = M ? MATH_TIPS : ERCHO;
  const tip = tips[Math.floor(Date.now() / 3.6e6) % tips.length];
  const mx = M ? mathNext() : null;
  let h = `<header class="top">
      <div class="topbar"><img class="logo" src="${LOGO}" alt="Еду БЕЛ" width="44" height="44"><span class="eyebrow">${M ? "Математика за НВО" : "НВО по БЕЛ · 7. клас"}</span>
        <span class="tb-btns"><button class="iconbtn" data-act="theme" aria-label="${Theme.dark() ? "Светла тема" : "Нощна смяна (тъмна тема)"}" title="${Theme.dark() ? "Светла тема" : "Нощна смяна"}">${Theme.dark() ? "☀️" : "🌙"}</button><button class="iconbtn" data-act="sound" aria-pressed="${FX.on}" aria-label="${FX.on ? "Изключи звука" : "Включи звука"}" title="${FX.on ? "Изключи звука" : "Включи звука"}">${FX.on ? "🔊" : "🔇"}</button><button class="iconbtn ${FX.on ? "" : "dim"}" data-act="voice" aria-pressed="${Voice.on}" aria-label="${Voice.on ? "Ерчо да мълчи" : "Ерчо да говори"}" title="${Voice.on ? "Ерчо говори – докосни, за да мълчи" : "Ерчо мълчи – докосни, за да говори"}">${Voice.on ? "🗣️" : "🤐"}</button></span></div>
      ${hasMath() ? `<div class="subj" role="group" aria-label="Предмет"><button data-act="subj" data-s="bel" aria-pressed="${!M}">${pic("i-lit1", "sj-i", "", true)}<span>БЕЛ</span></button><button data-act="subj" data-s="math" aria-pressed="${M}">${pic("mt-geo", "sj-i", "", true)}<span>Математика</span></button></div>` : ""}
      <section class="hero ${M ? "long" : ""}" aria-labelledby="heroT">
        <div class="hero-txt">
          <p class="hi">${name ? `Здрасти, ${esc(name)}!` : "Здрасти!"}</p>
          <h1 id="heroT">НВО тренажор <em>${M ? "по математика" : "по БЕЛ"}</em></h1>
          <button class="lvl" data-act="go-badges" aria-label="Ниво ${lv.L}: ${esc(lv.name)}. Виж значките"><b>${lv.L}</b><span><small>Ниво</small>${esc(lv.name)}</span></button>
          <div class="xp" role="img" aria-label="${lv.x - lv.from} от ${lv.to - lv.from} точки опит до ниво ${lv.L + 1}"><i style="width:${Math.max(3, Math.round(((lv.x - lv.from) / (lv.to - lv.from)) * 100))}%"></i></div>
          <p class="xp-t"><b>${lv.x} XP</b> · още ${lv.to - lv.x} до ниво ${lv.L + 1}</p>
        </div>
        <div class="hero-art"><button class="hero-say" data-act="hello" aria-label="Чуй Ерчо">${avatarPic("hero-m", true)}</button><p class="bubble" aria-live="polite">${esc(tip)}</p></div>
        <div class="hero-go">${M ? (mx ? `<button class="btn gold big" data-act="mcard" data-n="${mx.c.n}"><span>▶</span> ${mx.again ? "Упражни пак" : "Започни"}: карта ${mx.c.n}</button>` : "") : nx ? `<button class="btn gold big" data-act="start" data-m="${nx.m.id}"><span>▶</span> ${nx.p === null ? "Започни" : "Продължи"}: ${esc(nx.m.title)}</button>` : `<button class="btn gold big" data-act="mock"><span>▶</span> Пробна матура</button>`}</div>
      </section>
      <div class="facts">${M ? `<span>${BANK.math.cards.length} ${pl(BANK.math.cards.length, "карта", "карти")}</span><span>${BANK.questions.filter(qMath).length} задачи</span><span>Решен пример и капани</span><span>Оценки 2–6</span>`
        : `<span>${nvoCount} задачи</span>${cardCount ? `<span>${cardCount} карти</span>` : ""}${BANK.dossiers ? `<span>${BANK.dossiers.dossiers.length} досиета</span>` : ""}<span>Оценки 2–6</span><span>Пробна матура</span>`}</div>
    </header>`;
  if (!canSave) h += `<p class="warnbox">Този браузър не позволява да се пазят данни (например в личен прозорец). Можеш да решаваш, но оценките ще изчезнат, когато затвориш страницата.</p>`;
  if (ONLINE && Online.flash) { h += `<p class="okbox" role="status">${esc(Online.flash)}</p>`; Online.flash = ""; }
  if (ONLINE && Online.offline) h += `<p class="warnbox">Няма връзка с интернет. Можеш да решаваш – оценките ще се запишат, когато връзката се върне.</p>`;
  if (M) h += mathBoard();
  else h += forecastPanel(f, mist) + Game.card() + modulesSection();
  h += badgesSection();
  h += gradebook();
  if (ONLINE) h += Online.accessSection();
  h += `<section class="reset" id="reset"><h3>Започни отначало</h3>
      <p class="small muted">Изтрива всички оценки, датите, тетрадката с грешки и напредъка в играта. Задачите остават. Ако искаш да изчистиш само един модул, използвай „Нулирай“ до него.</p>
      <div id="resetZone"><button class="btn line danger sm" data-act="resetAllAsk">Нулирай целия прогрес</button></div></section>
    <p class="legal">© ${new Date().getFullYear()} Еду БЕЛ. Задачите, играта, героите и илюстрациите са защитени с авторско право. Достъпът е личен – копирането и разпространението не са разрешени.</p>`;
  app.innerHTML = h;
  drawChart();
  if (scrollTo) document.getElementById(scrollTo)?.scrollIntoView({ block: "start" });
  else window.scrollTo(0, 0);
  Hello.greet();
}

function ring(r) {
  const R = 64, C = 2 * Math.PI * R;
  const v = r === null ? 0 : Math.max(0.004, r);
  return `<svg viewBox="0 0 150 150" aria-hidden="true"><defs><linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C5CFF"/><stop offset=".55" stop-color="#FF5FA2"/><stop offset="1" stop-color="#FFC83D"/></linearGradient></defs>
    <circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--band)" stroke-width="13"/>
    <circle class="ring-v" cx="75" cy="75" r="${R}" fill="none" stroke="url(#ringG)" stroke-width="13" stroke-linecap="round" stroke-dasharray="${(C * v).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 75 75)"/></svg>`;
}
const gradeBadge = (g, cls = "") => `<span class="gb g${g} ${cls}" aria-label="${GW[g]} ${g}"><b>${g}</b><small>${GW[g]}</small></span>`;

function forecastPanel(f, mist) {
  const r = f.total;
  let h = `<section class="fc" aria-labelledby="fcT"><div class="fc-top">
      <div class="meter">${ring(r)}<div class="in"><b>${r === null ? "–" : pc(r)}</b><span>готовност</span></div></div>
      <div class="fc-text"><span class="fc-eb">${pic("i-ready", "fc-i")}<span class="eyebrow">Прогноза за НВО</span></span>`;
  if (r === null) {
    h += `<h2 id="fcT">Реши първия модул и тук ще видиш с каква оценка би излязъл днес.</h2>
      <p class="muted small">Прогнозата претегля частите като на изпита: четенето е 7 задачи, езикът – 10, литературата – 8.</p>`;
  } else {
    const g = gradeOf(r);
    h += `<h2 id="fcT">Ако изпитът е днес:</h2>${gradeBadge(g, "fc-gb")}
      <p class="muted small">По последната оценка от ${f.done} от ${MODULES.length} модула${f.done < MODULES.length ? ". С всеки следващ модул прогнозата става по-точна" : ""}.</p>`;
  }
  h += `</div></div><div class="areas">`;
  for (const k in AREAS) {
    const a = f.areas[k];
    h += `<div class="area"><span class="nm">${AREAS[k].t}<small>${AREAS[k].nvo}</small></span><span class="v">${a.p === null ? "–" : pc(a.p)}</span>
      <div class="bar" role="img" aria-label="${AREAS[k].t}: ${a.p === null ? "няма решени модули" : pc(a.p)}"><i style="width:${a.p === null ? 0 : Math.round(a.p * 100)}%;--c:${AREAS[k].c}"></i></div></div>`;
  }
  h += `</div>`;
  const nx = nextSteps();
  if (nx.length) {
    h += `<div class="next"><h3>Тук ще спечелиш най-много точки</h3><ol>`;
    for (const x of nx) {
      h += `<li><p><b>${esc(x.m.title)}</b><small>${x.p === null ? "Още не е решаван" : `Последно: ${pc(x.p)} – ${GW[gradeOf(x.p)].toLowerCase()} ${gradeOf(x.p)}`} · ${AREAS[x.m.area].t.toLowerCase()}</small></p>
        <button class="btn sm" data-act="start" data-m="${x.m.id}">${x.p === null ? "Започни" : "Упражни"}</button></li>`;
    }
    h += `</ol></div>`;
  }
  h += `<div class="fc-actions">
      <button class="tool" data-act="mock">${pic("i-mock", "tool-i")}<span class="tool-t"><b>Пробна матура</b><span>25 задачи, ${MOCK_MIN} минути, оценка накрая – като на изпита</span></span></button>
      <button class="tool alt" data-act="mist" ${mist ? "" : "disabled"}>${pic("i-mist", "tool-i")}<span class="tool-t"><b>Улики за преразглеждане${mist ? ` · ${mist}` : ""}</b><span>${mist ? "Задачите, в които си сгрешил. Реши ги вярно 2 пъти и изчезват." : "Тук ще се събират задачите, в които сгрешиш. Грешката е улика."}</span></span></button>
    </div></section>`;
  return h;
}

function spark(m) {
  const a = attemptsOf(m).slice(-8);
  if (a.length < 2) return "";
  const W = 84, H = 22, pts = a.map((h, i) => [4 + (i * (W - 8)) / (a.length - 1), H - 3 - pct(h.p, h.n) * (H - 6)]);
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Последни ${a.length} резултата: ${a.map((h) => pc(pct(h.p, h.n))).join(", ")}">
    <polyline points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="var(--pen)"/></svg>`;
}

function modulesSection() {
  let h = `<section class="parts" id="modules"><h2 class="sec-t">Модули</h2>`;
  for (const k in ALL_AREAS) {
    if (!MODULES.some((x) => x.area === k)) continue;
    const ms = MODULES.filter((x) => x.area === k), got = ms.reduce((s, m) => s + starsOf(m.id), 0);
    h += `<div class="part" style="--c:${ALL_AREAS[k].c}"><div class="part-hd"><h3>${ALL_AREAS[k].t}</h3><span class="part-s">${AREAS[k] ? "като " : ""}${ALL_AREAS[k].nvo}</span><span class="part-st" aria-label="${got} от ${ms.length * 3} звезди">★ ${got}/${ms.length * 3}</span></div><div class="mods">`;
    for (const m of ms) {
      const n = ofMod(m.id).length, last = lastOf(m.id), best = bestOf(m.id), cnt = attemptsOf(m.id).length;
      const g = last ? gradeOf(pct(last.p, last.n)) : null;
      h += `<article class="mod ${last ? "played" : ""}" id="mod-${m.id}">
        <span class="mod-art">${pic(modImg(m))}</span>
        <div class="body"><h3>${esc(m.title)}</h3><p>${esc(m.desc)}</p>
          <div class="meta">${starRow(starsOf(m.id))}<span>${n} ${k === "cards" ? "карти" : "задачи"}</span>${last ? `<span>Последно: ${fmtDate(last.d)} · ${last.p}/${last.n}</span><span>Най-добро: ${best.p}/${best.n}</span>` : `<span>Още не е решаван</span>`}${spark(m.id)}</div>
          ${cnt ? `<div><button class="link" data-act="resetModAsk" data-m="${m.id}">Нулирай модула</button></div>` : ""}</div>
        <div class="side ${g ? "" : "nog"}">${g ? gradeBadge(g, "sm") : ""}
          <button class="btn sm ${last ? "line" : ""}" data-act="start" data-m="${m.id}">${last ? "Реши пак" : "Играй"}</button></div>
        <div class="zone" id="zone-${m.id}" hidden></div>
      </article>`;
    }
    h += `</div></div>`;
  }
  return h + `</section>`;
}

// Avatar: Erčo by default, or any hero the child has unlocked in the game.
const avatarOk = (a) => a === "m-hi" || a === "m-detective" || a === "m-read" || (/^h-d\d\d$/.test(a || "") && Game.unlocked(a.slice(2)));
const avatarPic = (cls, move) => { const a = avatarOk(S.avatar) ? S.avatar : "m-hi"; return pic(move && a.startsWith("m-") ? mascot(a.slice(2)) : a, cls, "Твоят аватар", true); };
function badgesSection() {
  const have = earned(), list = badgeList();
  let h = `<section class="badges" id="badges" aria-labelledby="bdT"><div class="sec-hd"><h2 id="bdT" class="sec-t">Значки</h2><span class="muted small">${have.size} от ${list.length}</span></div>
    <ul class="bdg">${list.map((b) => `<li class="${have.has(b.id) ? "on" : ""}"><span class="bdg-e" aria-hidden="true">${have.has(b.id) ? b.e : "🔒"}</span><b>${esc(b.t)}</b><small>${esc(b.d)}</small></li>`).join("")}</ul>`;
  const opts = ["m-hi", "m-detective", "m-read", ...(BANK.dossiers ? BANK.dossiers.dossiers.map((d) => "h-" + d.id) : [])];
  h += `<details class="avpick"><summary>${avatarPic("av-now")}<span><b>Избери аватар</b><small>Ерчо или герой, когото си отключил в „Литературни досиета“</small></span></summary>
    <div class="avgrid">${opts.map((a) => {
      const ok = avatarOk(a), cur = (avatarOk(S.avatar) ? S.avatar : "m-hi") === a;
      return `<button class="av ${cur ? "cur" : ""} ${ok ? "" : "locked"}" data-act="avatar" data-a="${a}" ${ok ? "" : "disabled"} aria-label="${ok ? "Избери" : "Заключен – разкрий досието"}">${pic(a)}</button>`;
    }).join("")}</div></details></section>`;
  return h;
}

function gradebook() {
  const hist = S.hist;
  const lasts = MODULES.map((m) => lastOf(m.id)).filter(Boolean);
  const avg = lasts.length ? lasts.reduce((s, h) => s + gradeOf(pct(h.p, h.n)), 0) / lasts.length : null;
  const sixes = hist.filter((h) => gradeOf(pct(h.p, h.n)) === 6).length;
  const solved = hist.reduce((s, h) => s + h.n, 0);
  let h = `<section class="book" id="book" aria-labelledby="bookT"><div class="book-hd"><h2 id="bookT">Бележник</h2>
      <label for="pupil">на <input id="pupil" maxlength="40" placeholder="твоето име" value="${esc(S.name)}" autocomplete="off"></label></div>
    <div class="stats">
      <div class="stat"><b class="hand">${avg === null ? "–" : dec(avg)}</b><span>среден успех по модулите</span></div>
      <div class="stat"><b>${hist.length}</b><span>${pl(hist.length, "решен тест", "решени теста")}</span></div>
      <div class="stat"><b>${solved}</b><span>решени задачи</span></div>
      <div class="stat"><b>${sixes}</b><span>${pl(sixes, "шестица", "шестици")}</span></div>
    </div>`;
  if (!hist.length) {
    return h + `<p class="empty">Още няма оценки. Реши който и да е модул – оценката и датата ще се запишат тук, а графиката ще показва как се движиш.</p></section>`;
  }
  h += `<div class="chart" id="chart"></div>
    <div class="legend"><span><i></i>модул</span><span><i class="mk"></i>пробна матура</span><span>Ивиците показват границите на оценките 2–6.</span></div>`;
  const rows = hist.slice().reverse();
  const shown = histAll ? rows : rows.slice(0, 8);
  h += `<div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Тест</th><th class="num">Точки</th><th class="num">Оценка</th></tr></thead><tbody>`;
  for (const r of shown) {
    const g = gradeOf(pct(r.p, r.n));
    const dd = new Date(r.d);
    h += `<tr><td class="dt">${dd.getDate()}.${two(dd.getMonth() + 1)}.${dd.getFullYear()}<small>${two(dd.getHours())}:${two(dd.getMinutes())} ч.</small></td><td>${esc(modTitle(r.m))}</td><td class="num">${r.p}/${r.n}</td><td class="num"><span class="hand" title="${GW[g]}">${g}</span></td></tr>`;
  }
  h += `</tbody></table></div>`;
  if (rows.length > 8) h += `<div><button class="link" data-act="histToggle">${histAll ? "Покажи само последните 8" : `Покажи всички ${rows.length} оценки`}</button></div>`;
  h += shareBlock("book", "Изпрати бележника на родител", "Мама или татко ще видят оценките, датите и прогнозата за НВО.", bookMsg());
  return h + `</section>`;
}

function drawChart() {
  const box = document.getElementById("chart");
  if (!box) return;
  const hist = S.hist.slice(-40);
  const W = Math.max(280, Math.round(box.clientWidth || 600)), H = W < 480 ? 190 : 220, L = 38, R = 28, T = 10, B = 24;
  const x = (i) => (hist.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (hist.length - 1));
  const y = (r) => T + (1 - r) * (H - T - B);
  const bands = [[0, 0.5, 2], [0.5, 0.63, 3], [0.63, 0.76, 4], [0.76, 0.9, 5], [0.9, 1, 6]];
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Графика на резултатите във времето, в проценти">`;
  bands.forEach(([a, b, g], i) => {
    if (i % 2 === 0) s += `<rect x="${L}" y="${y(b).toFixed(1)}" width="${W - L - R}" height="${(y(a) - y(b)).toFixed(1)}" fill="var(--band)"/>`;
    s += `<text x="${W - R + 10}" y="${((y(a) + y(b)) / 2 + 5).toFixed(1)}" font-family="Caveat, cursive" font-weight="700" font-size="17" fill="var(--pen)">${g}</text>`;
  });
  [0, 0.5, 1].forEach((r) => { s += `<text x="${L - 6}" y="${(y(r) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="var(--muted)">${Math.round(r * 100)}%</text>`; });
  s += `<line x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}" stroke="var(--line)" stroke-width="1"/>`;
  s += `<text x="${L}" y="${H - 6}" font-size="12" fill="var(--muted)">${fmtShort(hist[0].d)}</text>`;
  if (hist.length > 1) s += `<text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="12" fill="var(--muted)">${fmtShort(hist[hist.length - 1].d)}</text>`;
  if (hist.length > 1) s += `<polyline points="${hist.map((h, i) => `${x(i).toFixed(1)},${y(pct(h.p, h.n)).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--lang)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  hist.forEach((h, i) => {
    const cx = x(i).toFixed(1), cy = y(pct(h.p, h.n)).toFixed(1);
    s += h.m === "mock"
      ? `<rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" transform="rotate(45 ${cx} ${cy})" fill="var(--gold)" stroke="var(--paper)" stroke-width="2"/>`
      : `<circle cx="${cx}" cy="${cy}" r="4.5" fill="var(--lang)" stroke="var(--paper)" stroke-width="2"/>`;
    s += `<circle class="hit" data-i="${i}" cx="${cx}" cy="${cy}" r="14" fill="transparent"/>`;
  });
  s += `</svg><div class="tip" id="tip" hidden></div>`;
  box.innerHTML = s;
  const tip = document.getElementById("tip");
  const show = (el) => {
    const h = hist[+el.dataset.i], g = gradeOf(pct(h.p, h.n));
    const svg = box.querySelector("svg"), k = 1;
    tip.innerHTML = `<b>${esc(modTitle(h.m))}</b><br>${fmtDate(h.d, true)}<br>${h.p}/${h.n} · ${GW[g]} ${g}`;
    tip.style.left = `${Math.min(Math.max(+el.getAttribute("cx") * k, 80), svg.getBoundingClientRect().width - 80)}px`;
    tip.style.top = `${+el.getAttribute("cy") * k}px`;
    tip.hidden = false;
  };
  box.querySelectorAll(".hit").forEach((el) => {
    el.addEventListener("pointerenter", () => show(el));
    el.addEventListener("pointerdown", () => show(el));
    el.addEventListener("pointerleave", () => { tip.hidden = true; });
  });
}

/* ---------- send to a parent ---------- */
function bookMsg() {
  const f = forecast();
  const lines = [`Бележник – НВО тренажор по БЕЛ${S.name.trim() ? ` – ${S.name.trim()}` : ""}`];
  const lasts = MODULES.map((m) => [m, lastOf(m.id)]).filter((x) => x[1]);
  if (lasts.length) {
    const avg = lasts.reduce((s, x) => s + gradeOf(pct(x[1].p, x[1].n)), 0) / lasts.length;
    lines.push(`Среден успех: ${dec(avg)} (решени ${lasts.length} от ${MODULES.length} модула)`);
  }
  if (f.total !== null) { const g = gradeOf(f.total); lines.push(`Прогноза за НВО: ${pc(f.total)} – ${GW[g]} ${g}`); }
  lines.push("", "Последни оценки:");
  for (const [m, h] of lasts) { const g = gradeOf(pct(h.p, h.n)); lines.push(`• ${m.title} – ${GW[g]} ${g} (${h.p}/${h.n}, ${fmtDate(h.d)})`); }
  const mk = lastOf("mock");
  if (mk) { const g = gradeOf(pct(mk.p, mk.n)); lines.push(`• Пробна матура – ${GW[g]} ${g} (${mk.p}/${mk.n}, ${fmtDate(mk.d)})`); }
  const nx = nextSteps().filter((x) => x.p !== null).slice(0, 2);
  if (nx.length) lines.push("", `За упражнение: ${nx.map((x) => x.m.title).join(", ")}`);
  const mist = mistIds().length;
  if (mist) lines.push(`В тетрадката с грешки: ${mist} ${pl(mist, "задача", "задачи")}`);
  lines.push("", "Подготовка за НВО по БЕЛ: edubel.site");
  return lines.join("\n");
}
function resultMsg(r) {
  const g = gradeOf(pct(r.p, r.n));
  const who = S.name.trim() || "Решен тест";
  const lines = [`${who}: „${r.s.title}“ – ${GW[g]} ${g}`, `${r.p} от ${r.n} точки (${pc(pct(r.p, r.n))}), ${fmtDate(r.rec ? r.rec.d : Date.now(), true)}`];
  if (r.rec && r.rec.a) for (const k in AREAS) lines.push(`• ${AREAS[k].t}: ${r.rec.a[k][0]}/${r.rec.a[k][1]}`);
  if (r.prev) { const d = r.p - r.prev.p; lines.push(d > 0 ? `С ${d} ${pl(d, "точка", "точки")} повече от миналия път.` : d < 0 ? `С ${-d} ${pl(-d, "точка", "точки")} по-малко от миналия път.` : "Колкото и миналия път."); }
  lines.push("", "Подготовка за НВО по БЕЛ: edubel.site");
  return lines.join("\n");
}
function shareBlock(id, title, sub, msg) {
  const t = encodeURIComponent(msg);
  return `<div class="share"><h3>${esc(title)}</h3><p class="small muted">${esc(sub)}</p>
    <pre class="preview" id="pv-${id}">${esc(msg)}</pre>
    <div class="sharebtns"><a class="sh-viber" href="viber://forward?text=${t}" target="_blank" rel="noopener">Viber</a><a class="sh-wa" href="https://wa.me/?text=${t}" target="_blank" rel="noopener">WhatsApp</a><button class="sh-copy" data-act="copy" data-id="${id}">Копирай</button></div>
    <p class="small muted" id="cp-${id}" role="status"></p></div>`;
}

/* ---------- sessions ---------- */
/* ---------- math: the cards by section, one card (front and back, like the printed one), practice ---------- */
const MATH_TIPS = [
  "Нарисувай чертеж. Чертежът мисли вместо теб.",
  "Процентите не се събират един след друг. Умножават се.",
  "Провери отговора: може ли периметърът да е −5 cm? Не може.",
  "Празен лист = 0 точки. Започни с „Нека x е…“.",
  "Една карта на ден – и до изпита минаваш всичките. Сметнах го.",
  "Минусът пред степента е хитър. Аз съм Ъ – и аз съм хитър.",
  "Прочети задачата два пъти. Числата обичат да се крият в думите.",
  "Грешката е улика. В картите „Капан“ ги ловим нарочно.",
];
let mview = null;
const mCard = (n) => (hasMath() ? BANK.math.cards.find((c) => c.n === n) : null);
const mSec = (id) => (BANK.math.sections || []).find((s) => s.id === id) || { id, t: "", c: "#6C4BFF" };
const mMod = (n) => MOD[`mk-${n}`];
const shortT = (t) => (t.length > 34 ? t.slice(0, 32).replace(/[\s,:;–-]+\S*$/, "") + "…" : t);
const mBlock = (b) => { const tg = ["section", "p", "div", "ol", "ul", "table"].includes(b.tag) ? b.tag : "div"; return `<${tg} class="mb ${esc(b.cls || "")}">${mh(b.html)}</${tg}>`; };
// What to do next: the first card not practised yet, else the one with the fewest stars.
function mathNext() {
  const cs = BANK.math.cards.filter((c) => mMod(c.n));
  if (!cs.length) return null;
  const fresh = cs.find((c) => !lastOf(`mk-${c.n}`));
  if (fresh) return { c: fresh, again: false };
  const low = cs.slice().sort((a, b) => starsOf(`mk-${a.n}`) - starsOf(`mk-${b.n}`))[0];
  return starsOf(`mk-${low.n}`) < 3 ? { c: low, again: true } : null;
}
function mathBoard() {
  const M = BANK.math, idx = M.index && M.index.length ? M.index : M.cards, total = idx.length;
  const mods = MODULES.filter((m) => isMath(m) && !m.mix), done = mods.filter((m) => lastOf(m.id)).length;
  const got = mods.reduce((s, m) => s + starsOf(m.id), 0), mist = mistIds(true).length;
  let h = `<section class="fc mx-top" aria-labelledby="mxT"><div class="mx-sum">
      ${pic("mt-sys", "mx-i", "", true)}<div><span class="eyebrow">${esc(M.title || "Математика за НВО")}</span>
      <h2 id="mxT">${total} карти: правилото отпред, практиката отзад</h2>
      <p class="muted small">Отвори карта, обърни я и я упражни. Числовите отговори се проверяват сами, а големите задачи решаваш на лист и сравняваш.</p></div></div>
    <div class="mx-stats"><div class="stat"><b>${done}/${mods.length}</b><span>упражнени карти</span></div><div class="stat"><b>★ ${got}</b><span>от ${mods.length * 3} звезди</span></div>${M.cards.length < total ? `<div class="stat"><b>${M.cards.length}/${total}</b><span>карти вече тук</span></div>` : ""}</div>
    <div class="fc-actions"><button class="tool alt" data-act="mist" ${mist ? "" : "disabled"}>${pic("i-mist", "tool-i")}<span class="tool-t"><b>Грешки по математика${mist ? ` · ${mist}` : ""}</b><span>${mist ? "Задачите, в които си сгрешил. Реши ги вярно 2 пъти и изчезват." : "Тук ще се събират задачите, в които сгрешиш."}</span></span></button></div></section>
    <section class="parts" id="modules"><h2 class="sec-t">Картите по раздели</h2>`;
  for (const sec of M.sections || []) {
    const list = idx.filter((e) => (e.sec || e.area) === sec.id);
    if (!list.length) continue;
    const ms = mods.filter((m) => m.sec === sec.id), st = ms.reduce((s, m) => s + starsOf(m.id), 0), mix = MOD[`ms-${sec.id}`];
    h += `<div class="part mx-sec" style="--c:${esc(sec.c)}"><div class="part-hd">${pic(mIcon(sec.id), "mx-si", "", true)}<h3>${esc(sec.t)}</h3><span class="part-s">${list.length} ${pl(list.length, "карта", "карти")}</span>${ms.length ? `<span class="part-st" aria-label="${st} от ${ms.length * 3} звезди">★ ${st}/${ms.length * 3}</span>` : ""}</div>
      <div class="mtiles">`;
    for (const e of list) {
      const c = mCard(e.n), mod = c && mMod(c.n), last = mod && lastOf(mod.id);
      if (!c) { h += `<div class="mtile soon" id="mt-${e.n}"><span class="no">${e.n}</span><b>${esc(shortT(e.title))}</b><small>скоро</small></div>`; continue; }
      h += `<button class="mtile ${last ? "played" : ""}" id="mt-${e.n}" data-act="mcard" data-n="${c.n}"><span class="no">${c.n}</span><b>${esc(c.title)}</b>
        <small>${c.grades ? `${esc([...c.grades].join(", "))} клас` : ""}${c.stars ? ` · на НВО ${"★".repeat(c.stars)}` : ""}</small>${mod ? starRow(starsOf(mod.id), "sm") : `<small class="ro">за четене</small>`}</button>`;
    }
    h += `</div>${mix ? `<button class="btn line sm mx-mix" data-act="mmix" data-m="${mix.id}">🔀 Смесено упражнение по раздела</button>` : ""}</div>`;
  }
  return h + `</section>`;
}
function mathCard(n, back = false, flip = false) {
  const c = mCard(n);
  if (!c) return home();
  stopTimer();
  sess = null;
  Game.leave();
  mview = { n, back };
  const M = BANK.math, total = (M.index && M.index.length) || M.cards.length, list = M.cards, i = list.indexOf(c);
  const prev = list[i - 1], next = list[i + 1], mod = mMod(n), last = mod && lastOf(mod.id), qn = mod ? ofMod(mod.id).length : 0;
  const sec = mSec(c.sec || c.area);
  let h = `<div class="qbar"><button class="back" data-act="home">← Табло</button><span class="qtitle">Карта ${n} от ${total}</span><span class="pill">${back ? "Гръб" : "Лице"}</span></div>
    <article class="mcard a-${esc(c.area)} ${back ? "is-back" : ""} ${flip ? "flip" : ""}" style="--c:${esc(sec.c)}" aria-label="Карта ${n}, ${back ? "гръб" : "лице"}">`;
  if (!back) {
    h += `<header class="mc-hd">${pic(mIcon(c.sec || c.area), "mc-ic", "", true)}<span class="mc-area">${esc(c.areaT || sec.t)}${c.grades ? `<small>${esc([...c.grades].join(", "))} клас</small>` : ""}</span><span class="mc-no">${two(n)}<small>/${total}</small></span></header>
      <h1 class="mc-t">${esc(c.title)}</h1>${c.nvo ? `<p class="mc-nvo">${c.stars ? `<span class="st" aria-label="${c.stars} от 3">${"★".repeat(c.stars)}${"☆".repeat(3 - c.stars)}</span> ` : ""}${esc(c.nvo)}</p>` : ""}
      ${(c.front || []).map(mBlock).join("")}`;
  } else {
    h += `<header class="mc-hd bk"><span class="mc-no">${two(n)}</span><span class="mc-area">${esc(c.backT || c.title)}</span></header>${(c.back || []).map(mBlock).join("")}`;
  }
  h += `</article>
    <div class="mc-act"><button class="btn line" data-act="mflip">${back ? "↺ Към лицето" : "↻ Обърни картата"}</button>${qn ? `<button class="btn gold" data-act="start" data-m="${mod.id}">▶ Упражни · ${qn} ${pl(qn, "задача", "задачи")}</button>` : ""}</div>
    ${last ? `<p class="mc-last">${starRow(starsOf(mod.id))}<span>Последно: ${fmtDate(last.d)} · ${last.p}/${last.n}</span>${gradeBadge(gradeOf(pct(last.p, last.n)), "sm")}</p>` : ""}
    <nav class="mc-nav" aria-label="Други карти">${prev ? `<button class="btn line sm" data-act="mcard" data-n="${prev.n}">← ${prev.n}. ${esc(shortT(prev.title))}</button>` : "<span></span>"}${next ? `<button class="btn line sm" data-act="mcard" data-n="${next.n}">${next.n}. ${esc(shortT(next.title))} →</button>` : ""}</nav>`;
  app.innerHTML = h;
  // "Повтори: карта 7", "карта 11" in the list: a tap opens that card (when it is in the app)
  app.querySelectorAll(".mcard .ref, .mcard .memlist i").forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/карта (\d{1,2})/g, (all, k) => (mCard(+k) && +k !== n ? `<button class="cref" data-act="mcard" data-n="${+k}">${all}</button>` : all));
  });
  window.scrollTo(0, 0);
}

function prepView(q) {
  if (q.t === "mc") return { ord: q.fix ? q.o.map((_, i) => i) : shuffle(q.o.map((_, i) => i)) };
  if (q.t === "match") return { right: shuffle(q.pairs.map((_, i) => i)) };
  if (q.t === "order") {
    let o = shuffle(q.items.map((_, i) => i));
    if (o.length > 1 && o.every((v, i) => v === i)) o = [o[1], o[0], ...o.slice(2)];
    return { ord: o };
  }
  return {};
}
function initAns(q, v) {
  if (q.t === "order") return v.ord.slice();
  if (q.t === "match") return q.pairs.map(() => -1);
  return null;
}
function newSess(kind, m, title, qs) {
  const view = qs.map(prepView);
  sess = { kind, m, title, qs, view, i: 0, ans: qs.map((q, i) => initAns(q, view[i])), ok: qs.map(() => null), checked: qs.map(() => false), t0: Date.now(), touched: false };
  if (kind === "mock") startTimer();
  renderQ();
}
// Reading questions stay together with their text; passages come in random order.
function moduleQs(m) {
  if (/^ms-/.test(m)) return shuffle(BANK.questions.filter((q) => MOD[q.m] && MOD[q.m].sec === m.slice(3))).slice(0, 15);
  const qs = ofMod(m);
  if (!qs.some((q) => q.p)) return shuffle(qs);
  const groups = {};
  for (const q of qs) (groups[q.p || "_"] = groups[q.p || "_"] || []).push(q);
  return shuffle(Object.values(groups)).flat();
}
function startModule(m) { newSess("module", m, MOD[m].title, moduleQs(m)); }
function startMistakes(ids) {
  const list = (ids && ids.length ? ids : mistIds()).filter((id) => Q[id]).slice(0, 20);
  if (!list.length) return home();
  newSess("mist", "mist", list.every((id) => qMath(Q[id])) ? "Грешки по математика" : "Тетрадка с грешки", shuffle(list.map((id) => Q[id])));
}
function pick(arr, n) { return shuffle(arr).slice(0, n); }
function buildMock() {
  const read = ofMod(MODULES.find((m) => m.area === "read").id);
  const byP = {};
  for (const q of read) (byP[q.p || "_"] = byP[q.p || "_"] || []).push(q);
  const ps = shuffle(Object.keys(byP));
  let r = byP[ps[0]].slice(0, 7);
  for (const p of ps.slice(1)) { if (r.length >= 7) break; r = r.concat(pick(byP[p], 7 - r.length)); }
  const langMods = MODULES.filter((m) => m.area === "lang");
  let lang = langMods.map((m) => pick(ofMod(m.id), 1)[0]).filter(Boolean);
  const restL = shuffle(langMods.flatMap((m) => ofMod(m.id)).filter((q) => !lang.includes(q)));
  lang = lang.concat(restL.slice(0, Math.max(0, 10 - lang.length)));
  lang.sort((a, b) => MOD[a.m].n - MOD[b.m].n);
  const litMods = shuffle(MODULES.filter((m) => m.area === "lit"));
  const counts = litMods.map((_, i) => Math.floor(8 / litMods.length) + (i < 8 % litMods.length ? 1 : 0));
  let lit = litMods.flatMap((m, i) => pick(ofMod(m.id), counts[i]));
  lit.sort((a, b) => MOD[a.m].n - MOD[b.m].n);
  return r.concat(lang, lit);
}
function startMock() { newSess("mock", "mock", "Пробна матура", buildMock()); }

function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    if (!sess || sess.kind !== "mock") return stopTimer();
    const left = MOCK_MIN * 60 - Math.round((Date.now() - sess.t0) / 1000);
    const el = document.getElementById("clock");
    if (el) { el.textContent = fmtClock(Math.max(0, left)); el.classList.toggle("low", left <= 300); }
    if (left <= 0) { stopTimer(); finish(true); }
  }, 1000);
}
function stopTimer() { if (timer) clearInterval(timer); timer = null; }

// The one number in a math answer: "2,42 €", "2.42", "x = 240", "1/6", "−17", "10 000" (null if there is none or more than one).
function numOf(s) {
  s = String(s ?? "").replace(/[−–]/g, "-").replace(/(\d)\s+(?=\d{3}\b)/g, "$1");
  if (s.includes("=")) s = s.split("=").pop();
  const m = s.match(/-?\d+(?:[.,]\d+)?(?:\s*\/\s*-?\d+(?:[.,]\d+)?)?/g);
  if (!m || m.length !== 1) return null;
  const [a, b] = m[0].replace(/,/g, ".").replace(/\s/g, "").split("/");
  const v = b === undefined ? +a : +a / +b;
  return Number.isFinite(v) ? v : null;
}
const numEq = (v, x) => v !== null && Math.abs(v - x) <= (Math.abs(x * 100 - Math.round(x * 100)) > 1e-9 ? 0.0051 : 1e-9 * Math.max(1, Math.abs(x)));
function isRight(q, a) {
  if (q.t === "mc") return a === q.a;
  if (q.t === "input" && q.num) return q.num.some((x) => numEq(numOf(a), x)) || q.a.some((x) => norm(x) === norm(a));
  if (q.t === "input") return a != null && q.a.some((x) => norm(x) === norm(a));
  if (q.t === "self") return a === true;
  if (q.t === "match" || q.t === "order") return Array.isArray(a) && a.every((v, i) => v === i);
  return false;
}
function answered(q, a) {
  if (q.t === "mc") return a !== null && a !== undefined;
  if (q.t === "input") return !!String(a || "").trim();
  if (q.t === "match") return Array.isArray(a) && a.every((v) => v >= 0);
  if (q.t === "self") return a === true || a === false;
  return true;
}
function answerText(q, a) {
  if (q.t === "mc") return a === null || a === undefined ? "без отговор" : q.o[a];
  if (q.t === "input") return String(a || "").trim() || "без отговор";
  if (q.t === "match") return q.pairs.map((p, i) => `${p[0]} – ${a && a[i] >= 0 ? q.pairs[a[i]][1] : "?"}`).join("; ");
  if (q.t === "order") return (a || []).map((k) => q.items[k]).join(" → ");
  if (q.t === "self") return a === true ? "Решено вярно" : a === false ? "Не стана" : "без отговор";
  return "";
}
function rightText(q) {
  if (q.t === "mc") return q.o[q.a];
  if (q.t === "self") return q.a[0];
  if (q.t === "input") return q.a[0];
  if (q.t === "match") return q.pairs.map((p) => `${p[0]} – ${p[1]}`).join("; ");
  if (q.t === "order") return q.items.join(" → ");
  return "";
}
function track(id, ok) {
  if (!ok) {
    const m = S.mist[id] || { n: 0, ok: 0 };
    m.n++; m.ok = 0; m.d = Date.now();
    S.mist[id] = m;
  } else if (S.mist[id]) {
    S.mist[id].ok++;
    if (S.mist[id].ok >= 2) delete S.mist[id];
  }
  save();
}

/* ---------- one task on screen ---------- */
function passageBlock(pid) {
  const p = BANK.passages[pid];
  return `<details class="passage" open><summary>${esc(p.title)}</summary><div class="ptext">${p.text.map((t) => `<p>${rich(t)}</p>`).join("")}${p.src ? `<p class="src">${esc(p.src)}</p>` : ""}</div></details>`;
}
function body(q, v, a, locked, showKey) {
  if (q.t === "mc") {
    return `<div class="opts" role="radiogroup" aria-label="Отговори">${v.ord.map((oi, k) => {
      let c = a === oi ? "sel" : "";
      if (showKey) c = oi === q.a ? "right" : a === oi ? "wrong" : "";
      return `<button class="opt ${c}" role="radio" aria-checked="${a === oi}" data-act="pick" data-v="${oi}" ${locked ? "disabled" : ""}><span class="key">${LET[k]}</span><span>${R(q, q.o[oi])}</span></button>`;
    }).join("")}</div>`;
  }
  if (q.t === "input") {
    const c = showKey ? (isRight(q, a) ? "right" : "wrong") : "";
    const field = `<input class="field ${c}" id="ansIn" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Твоят отговор" placeholder="${q.num ? "Напиши числото" : "Напиши отговора"}" value="${esc(a || "")}" ${locked ? "readonly" : ""}>`;
    if (q.num) return `<div class="numrow">${field}${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ""}</div><p class="hint">Пиши с десетична запетая (2,5) или като дроб (5/2).</p>`;
    return field + (q.hint ? `<p class="hint">${rich(q.hint)}</p>` : "");
  }
  if (q.t === "self") {
    // Solved on paper (like on the exam), then compared with the solution; the pupil says how it went.
    if (!v.rev && !locked) return `<p class="self-tip">✏️ Реши на лист или в тетрадка. Когато си готов, сравни с решението.</p><button class="btn line" data-act="reveal">Покажи решението</button>`;
    let h = `<div class="self-sol">${q.sol ? `<div class="msol">${mh(q.sol)}</div>` : ""}<p class="ans"><b>Отговор:</b> ${esc(q.a[0])}</p></div>`;
    if (!locked) h += `<div class="self-q"><p>Как се справи?</p><div class="row"><button class="btn ok-btn" data-act="self" data-v="1">✓ Решено вярно</button><button class="btn line" data-act="self" data-v="0">✗ Не стана</button></div></div>`;
    return h;
  }
  if (q.t === "match") {
    return `<div class="match">${q.pairs.map((p, i) => {
      const c = showKey ? (a[i] === i ? "right" : "wrong") : "";
      return `<div class="mrow ${c}"><span class="l">${rich(p[0])}</span><select data-i="${i}" aria-label="${esc(String(p[0]).replace(/<[^>]+>/g, ""))}" ${locked ? "disabled" : ""}><option value="-1">Избери…</option>${v.right.map((ri) => `<option value="${ri}" ${a[i] === ri ? "selected" : ""}>${esc(q.pairs[ri][1])}</option>`).join("")}</select>${showKey && a[i] !== i ? `<span class="fix">Вярно: ${esc(p[1])}</span>` : ""}</div>`;
    }).join("")}</div>`;
  }
  if (q.t === "order") {
    return `<ol class="ord">${a.map((k, pos) => {
      const c = showKey ? (k === pos ? "right" : "wrong") : "";
      return `<li class="${c}"><span>${rich(q.items[k])}</span><span class="mv">${locked ? "" : `<button data-act="mv" data-k="${pos}" data-d="-1" aria-label="Нагоре" ${pos === 0 ? "disabled" : ""}>↑</button><button data-act="mv" data-k="${pos}" data-d="1" aria-label="Надолу" ${pos === a.length - 1 ? "disabled" : ""}>↓</button>`}</span></li>`;
    }).join("")}</ol>`;
  }
  return "";
}

function renderQ() {
  const s = sess, q = s.qs[s.i], v = s.view[s.i], a = s.ans[s.i];
  const mock = s.kind === "mock", done = s.checked[s.i];
  const okN = s.ok.filter((x) => x === true).length;
  const left = MOCK_MIN * 60 - Math.round((Date.now() - s.t0) / 1000);
  let h = `<div class="qbar"><button class="back" data-act="quitAsk">← Табло</button><span class="qtitle">${esc(s.title)}</span>
      ${mock ? `<span class="pill ${left <= 300 ? "low" : ""}" id="clock" aria-label="Оставащо време">${fmtClock(Math.max(0, left))}</span>` : `<span class="pill" aria-label="Верни отговори">✓ ${okN}</span>`}
      <div class="prog"><i style="width:${((mock ? s.ans.filter((x, i) => answered(s.qs[i], x) && (s.qs[i].t !== "order" || s.touchedIdx?.[i])).length : s.i + (done ? 1 : 0)) / s.qs.length) * 100}%"></i></div></div>
    <div id="quitZone"></div>`;
  const nav = `<nav class="nav" aria-label="Задачи">${s.qs.map((qq, i) => `<button data-act="go" data-i="${i}" class="${i === s.i ? "cur" : ""} ${answered(qq, s.ans[i]) && (qq.t !== "order" || s.touchedIdx?.[i]) ? "done" : ""}" aria-label="Задача ${i + 1}">${i + 1}</button>`).join("")}</nav>`;
  h += `<article class="qcard"><p class="qnum">${pic(modImg(MOD[q.m]), "qn-i", "", true)}<span>Задача ${s.i + 1} от ${s.qs.length} · ${esc(MOD[q.m].title)}${q.nvo ? ` · като задача ${esc(q.nvo)} на НВО` : ""}</span>${Speak.ok() ? `<button class="readbtn" data-act="read" data-part="q" aria-label="Чуй задачата" title="Чуй задачата">🔈</button>` : ""}</p>`;
  if (q.p && BANK.passages[q.p]) h += passageBlock(q.p);
  if (q.text) h += `<blockquote class="qtext ${q.h ? "mtext" : ""}">${R(q, q.text)}</blockquote>`;
  h += `<h2 class="qq ${q.h ? "mq" : ""}">${R(q, q.q)}</h2>`;
  h += body(q, v, a, done || false, done && !mock);
  if (done && !mock) {
    const ok = s.ok[s.i];
    const say = ok ? CHEER[(s.i + s.qs.length) % CHEER.length] : CALM[s.i % CALM.length];
    h += `<div class="fb ${ok ? "ok" : "no"} ${s.fresh ? "fresh" : ""}" id="fb" tabindex="-1">${pic(mascot(ok ? "yay" : "oops"), "fb-m", "", true)}<div class="fb-t"><b class="t">${say}${ok ? ` <span class="xp-plus">+10 XP</span>` : ""}</b>${ok || q.t === "self" ? "" : `<span>Верният отговор: <b>${rightHtml(q)}</b></span>`}${q.why ? `<span class="why">${R(q, q.why)}${Speak.ok() ? ` <button class="readbtn sm" data-act="read" data-part="why" aria-label="Чуй обяснението" title="Чуй обяснението">🔈</button>` : ""}</span>` : ""}</div></div>`;
  }
  h += `<div class="qact">`;
  if (mock) {
    h += `<button class="btn line sm" data-act="prev" ${s.i === 0 ? "disabled" : ""}>← Предишна</button>
      ${s.i < s.qs.length - 1 ? `<button class="btn sm" data-act="mnext">Следваща →</button>` : `<button class="btn gold sm" data-act="submitAsk">Предай матурата</button>`}`;
  } else if (!done) {
    h += `<button class="link" data-act="restartAsk">Започни отначало</button>${q.t === "self" ? "" : `<button class="btn" id="checkBtn" data-act="check" ${answered(q, a) ? "" : "disabled"}>Провери</button>`}`;
  } else {
    h += `<button class="link" data-act="restartAsk">Започни отначало</button><button class="btn gold" id="nextBtn" data-act="next">${s.i < s.qs.length - 1 ? "Следваща задача →" : "Виж оценката"}</button>`;
  }
  h += `</div>`;
  if (mock) h += `<div id="submitZone">${s.i < s.qs.length - 1 ? `<button class="link" data-act="submitAsk">Предай матурата сега</button>` : ""}</div>`;
  h += `</article>`;
  if (mock) h += `<section style="display:grid;gap:8px"><p class="small muted">Отиди на задача (тъмните са с отговор):</p>${nav}</section>`;
  app.innerHTML = h;
  window.scrollTo(0, 0);
  if (s.said !== s.i) { s.said = s.i; Speak.stop(); if (mock) { if (s.i === 0) Voice.say("mock", 0, true); } else Voice.say(introLines(s), 0, true); }
  if (done && !mock) document.getElementById("nextBtn")?.focus({ preventScroll: true });
  const inp = document.getElementById("ansIn");
  if (inp && !done) {
    inp.addEventListener("input", () => {
      s.ans[s.i] = inp.value;
      const b = document.getElementById("checkBtn");
      if (b) b.disabled = !answered(q, inp.value);
      if (mock) updateNav();
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !mock && answered(q, inp.value)) { e.preventDefault(); check(); } });
    if (!mock) inp.focus({ preventScroll: true });
  }
  app.querySelectorAll(".match select").forEach((sel) => sel.addEventListener("change", () => {
    s.ans[s.i][+sel.dataset.i] = +sel.value;
    const b = document.getElementById("checkBtn");
    if (b) b.disabled = !answered(q, s.ans[s.i]);
    if (mock) updateNav();
  }));
}
// What Erčo says when a task appears: how to answer it, but only when the kind of task changes (not 20 times
// "Избери верния отговор"); first a word for the start of a card or of the mistakes, and "Последна задача!".
const kindOf = (q) => (q.t === "input" ? (q.num ? "i-num" : "i-input") : q.t === "mc" ? "i-mc" : `i-${q.t}`);
function introLines(s) {
  const q = s.qs[s.i], prev = s.i ? s.qs[s.i - 1] : null, out = [];
  if (s.i === 0 && s.kind === "mist") out.push("mist");
  else if (s.i === 0 && /^mk-/.test(s.m)) out.push("card");
  if (s.i === s.qs.length - 1 && s.qs.length >= 4) out.push("last");
  if (q.p && (!prev || prev.p !== q.p)) out.push("i-text");
  else if (!prev || kindOf(prev) !== kindOf(q) || (prev.p && !q.p)) out.push(kindOf(q));
  return out;
}
function updateNav() {
  const s = sess;
  app.querySelectorAll(".nav button").forEach((b) => {
    const i = +b.dataset.i;
    b.classList.toggle("done", answered(s.qs[i], s.ans[i]) && (s.qs[i].t !== "order" || !!s.touchedIdx?.[i]));
  });
}
function check() {
  const s = sess, q = s.qs[s.i];
  if (!answered(q, s.ans[s.i]) || s.checked[s.i]) return;
  s.checked[s.i] = true;
  s.ok[s.i] = isRight(q, s.ans[s.i]);
  s.touched = true;
  track(q.id, s.ok[s.i]);
  s.fresh = true;
  renderQ();
  s.fresh = false;
  if (s.ok[s.i]) FX.right(); else FX.wrong();
  Voice.say(s.ok[s.i] ? `ok-${(s.i + s.qs.length) % CHEER.length}` : `no-${s.i % CALM.length}`, 380);
  document.getElementById("fb")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
}
// Warm, varied praise – the same words Erčo says out loud (voice lines ok-0…ok-6, no-0…no-3); calm words after a mistake, never a joke about it.
const CHEER = ["Браво! Точно така!", "Браво! Позна!", "Супер! Справи се!", "Да! Точно това е!", "Отлично! Браво!", "Чудесно! Продължавай!", "Браво! Чисто попадение!"];
const CALM = ["Не точно. Ето защо:", "Почти! Виж обяснението:", "Този път не. Запомни:", "Не е това. Ето уликата:"];

/* ---------- result ---------- */
function finish(timeUp) {
  const s = sess;
  stopTimer();
  if (s.kind === "mock") s.qs.forEach((q, i) => { s.ok[i] = isRight(q, s.ans[i]); track(q.id, s.ok[i]); });
  const p = s.ok.filter(Boolean).length, n = s.qs.length;
  const sec = Math.min(Math.round((Date.now() - s.t0) / 1000), s.kind === "mock" ? MOCK_MIN * 60 : Infinity);
  const prev = s.kind === "mist" ? null : lastOf(s.m);
  const before = { lv: level(), badges: earned(), stars: s.kind === "module" ? starsOf(s.m) : 0 };
  let rec = null;
  if (s.kind !== "mist") {
    rec = { m: s.m, d: Date.now(), p, n, s: sec, w: s.qs.filter((q, i) => !s.ok[i]).map((q) => q.id) };
    if (s.kind === "mock") {
      rec.a = {};
      for (const k in AREAS) {
        const idx = s.qs.map((q, i) => i).filter((i) => MOD[s.qs[i].m].area === k);
        rec.a[k] = [idx.filter((i) => s.ok[i]).length, idx.length];
      }
    }
    S.hist.push(rec);
    save();
    if (ONLINE) Online.syncNow();
  }
  result({ s, p, n, sec, prev, rec, timeUp, before });
}

function result(r) {
  const { s, p, n } = r;
  const g = gradeOf(pct(p, n));
  const wrongIdx = s.qs.map((q, i) => i).filter((i) => !s.ok[i]);
  let delta = "";
  if (r.prev) {
    const d = p - r.prev.p;
    delta = d > 0 ? `<span class="delta up">С ${d} ${pl(d, "точка", "точки")} повече от миналия път (${fmtDate(r.prev.d)}).</span>`
      : d < 0 ? `<span class="delta down">С ${-d} ${pl(-d, "точка", "точки")} по-малко от миналия път (${fmtDate(r.prev.d)}).</span>`
      : `<span class="delta">Толкова точки, колкото и миналия път (${fmtDate(r.prev.d)}).</span>`;
  }
  const praise = g === 6 ? "Отлично представяне. Това е ниво НВО." : g === 5 ? "Много добре. Още малко и стигаш шестицата." : g === 4 ? "Добра основа. Прегледай уликите по-долу и реши пак." : g === 3 ? "Има какво да се упражни. Прочети обясненията и опитай отново." : "Не се отказвай. Прочети обясненията, упражни грешките и реши модула пак.";
  const b = r.before || {}, lv = level(), xpGot = b.lv ? lv.x - b.lv.x : 0, up = b.lv && lv.L > b.lv.L;
  const newB = b.badges ? badgeList().filter((x) => earned().has(x.id) && !b.badges.has(x.id)) : [];
  const stars = s.kind === "module" ? starsOf(s.m) : 0, thisStars = g >= 6 ? 3 : g === 5 ? 2 : g === 4 ? 1 : 0;
  const pose = mascot(g === 6 ? "trophy" : g === 5 ? "yay" : g === 4 ? "hi" : "think");
  let h = `<div class="qbar"><button class="back" data-act="home">← Табло</button><span class="qtitle">${esc(s.title)}</span><span></span></div>
    <section class="res g${g}">
      <div class="res-art">${pic(pose, "res-m", "", true)}<div class="medal" role="img" aria-label="Оценка ${GW[g]} ${g}"><b>${g}</b><small>${GW[g]}</small></div></div>
      <div class="info"><span class="eyebrow">${s.kind === "mist" ? "Упражнение · не влиза в бележника" : `Записано в бележника · ${fmtDate(r.rec.d, true)}`}</span>
        <h1>${esc(s.title)}</h1>
        ${s.kind === "module" || s.kind === "mock" ? starRow(thisStars, "big pop") : ""}
        <p class="score">${p} от ${n} ${pl(n, "точка", "точки")} · ${pc(pct(p, n))}</p>
        <p class="muted small">${r.timeUp ? "Времето изтече и матурата се предаде сама. " : ""}Време: ${fmtDur(r.sec)}</p>
        ${delta}<p>${praise}</p></div>
      ${xpGot > 0 ? `<div class="res-xp"><span class="xp-plus">+${xpGot} XP</span>${up ? `<span class="lvup">Ново ниво ${lv.L}: <b>${esc(lv.name)}</b></span>` : `<span class="muted small">Ниво ${lv.L} · още ${lv.to - lv.x} XP до следващото</span>`}<div class="xp"><i style="width:${Math.max(3, Math.round(((lv.x - lv.from) / (lv.to - lv.from)) * 100))}%"></i></div></div>` : ""}
      ${s.kind === "module" && stars > (b.stars || 0) ? `<p class="res-new">Нов рекорд в модула: ${starRow(stars)}</p>` : ""}
      ${newB.length ? `<div class="res-badges"><b>${newB.length === 1 ? "Нова значка!" : "Нови значки!"}</b>${newB.map((x) => `<span class="nb"><i aria-hidden="true">${x.e}</i>${esc(x.t)}</span>`).join("")}</div>` : ""}
    </section>`;
  if (s.kind === "mock") {
    h += `<section class="fc"><h2>По части, като на НВО</h2><div class="areas">`;
    for (const k in AREAS) {
      const [ap, an] = r.rec.a[k];
      h += `<div class="area"><span class="nm">${AREAS[k].t}<small>${AREAS[k].nvo}</small></span><span class="v">${ap}/${an}</span><div class="bar"><i style="width:${an ? Math.round((ap / an) * 100) : 0}%;--c:${AREAS[k].c}"></i></div></div>`;
    }
    h += `</div></section>`;
  }
  const mc = s.kind === "module" && isMath(MOD[s.m]) && /^mk-\d+$/.test(s.m) ? +s.m.slice(3) : 0;
  h += `<div class="row">${mc ? `<button class="btn" data-act="mcard" data-n="${mc}">← Към картата</button><button class="btn line" data-act="start" data-m="${s.m}">Реши пак</button>` : s.kind === "module" ? `<button class="btn" data-act="start" data-m="${s.m}">Реши модула пак</button>` : s.kind === "mock" ? `<button class="btn" data-act="mock">Нова пробна матура</button>` : ""}
    ${wrongIdx.length ? `<button class="btn gold" data-act="mistThese">Упражни ${wrongIdx.length} ${pl(wrongIdx.length, "грешка", "грешки")}</button>` : ""}
    <button class="btn line" data-act="home">Към таблото</button></div>`;
  if (s.kind !== "mist") h += shareBlock("res", "Покажи на родител", "Изпрати резултата с едно докосване или копирай текста.", resultMsg(r));
  if (wrongIdx.length) {
    h += `<section class="review"><h2>Какво да запомниш</h2>`;
    for (const i of wrongIdx) {
      const q = s.qs[i];
      h += `<article class="rv"><span class="qnum">${esc(MOD[q.m].title)}</span>${q.text ? `<blockquote class="qtext ${q.h ? "mtext" : ""}">${R(q, q.text)}</blockquote>` : ""}<p class="q">${R(q, q.q)}</p>
        <dl><dt>Твоят отговор</dt><dd class="bad">${ansHtml(q, s.ans[i])}</dd><dt>Верният</dt><dd class="good">${rightHtml(q)}</dd></dl>
        ${q.sol ? `<details class="msol-d"><summary>Виж решението</summary><div class="msol">${mh(q.sol)}</div></details>` : ""}
        ${q.why ? `<p class="why">${R(q, q.why)}</p>` : ""}</article>`;
    }
    h += `</section>`;
  } else {
    h += `<p class="empty">Нито една грешка. ${s.kind === "module" ? "Опитай пробната матура или следващия модул." : ""}</p>`;
  }
  app.innerHTML = h;
  window.scrollTo(0, 0);
  lastWrong = wrongIdx.map((i) => s.qs[i].id);
  // The big celebration only at the end of a module, and only for a good result (calm otherwise).
  if (up || g >= 5) setTimeout(() => FX.win(up || g === 6), 250);
  Voice.say([`r${g}`, up ? "lvl" : newB.length ? "bdg" : null], up || g >= 5 ? 1300 : 500);
  if (newB.length) setTimeout(() => FX.badge(), up || g >= 5 ? 1500 : 300);
}
let lastWrong = [];

/* ---------- actions ---------- */
function confirmBox(zoneId, text, yesAct, yesLabel, extra) {
  const z = document.getElementById(zoneId);
  if (!z) return;
  z.hidden = false;
  z.innerHTML = `<div class="confirm" role="alertdialog" aria-label="${esc(text)}"><p>${esc(text)}</p><button class="btn solid-danger sm" data-act="${yesAct}" ${extra || ""}>${esc(yesLabel)}</button><button class="btn line sm" data-act="cancel" data-z="${zoneId}">Отказ</button></div>`;
  z.querySelector("[data-act='cancel']").focus();
}
const ACT = {
  home: () => home(),
  theme: () => { const y = scrollY; Theme.toggle(); home(); scrollTo(0, y); },
  hello: () => Hello.tap(),
  subj: (b) => { SUBJ = b.dataset.s === "math" ? "math" : "bel"; ls.set(K_SUBJ, SUBJ); FX.pop(); home(); },
  mcard: (b) => mathCard(+b.dataset.n),
  mflip: () => { if (mview) { FX.pop(); mathCard(mview.n, !mview.back, true); } },
  mmix: (b) => startModule(b.dataset.m),
  sound: () => { const y = scrollY; FX.toggle(); home(); scrollTo(0, y); },
  // With the sound off, the voice button turns the sound on (and Erčo with it); otherwise it switches only Erčo.
  voice: () => { const y = scrollY; if (!FX.on) { FX.toggle(); if (!Voice.on) Voice.toggle(); } else Voice.toggle(); home(); scrollTo(0, y); },
  read: (b) => { if (sess) Speak.read(sess.qs[sess.i], b.dataset.part, sess.view[sess.i], sess.ans[sess.i]); },
  "go-badges": () => document.getElementById("badges")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  avatar: (b) => { const y = scrollY; S.avatar = b.dataset.a; save(); if (ONLINE) Online.soon(); FX.pop(); home(); document.querySelector("#badges .avpick")?.setAttribute("open", ""); scrollTo(0, y); },
  start: (b) => startModule(b.dataset.m),
  mock: () => startMock(),
  mist: () => startMistakes(mistIds(mathOn())),
  mistThese: () => startMistakes(lastWrong),
  histToggle: () => { histAll = !histAll; home("book"); },
  pick: (b) => {
    if (!sess) return;
    sess.ans[sess.i] = +b.dataset.v;
    FX.pop();
    app.querySelectorAll(".opt").forEach((o) => { const on = o === b; o.classList.toggle("sel", on); o.setAttribute("aria-checked", on); });
    const c = document.getElementById("checkBtn");
    if (c) c.disabled = false;
    if (sess.kind === "mock") updateNav();
  },
  mv: (b) => {
    const a = sess.ans[sess.i], k = +b.dataset.k, d = +b.dataset.d, j = k + d;
    if (j < 0 || j >= a.length) return;
    [a[k], a[j]] = [a[j], a[k]];
    sess.touchedIdx = sess.touchedIdx || {};
    sess.touchedIdx[sess.i] = true;
    renderQ();
    app.querySelector(`.ord li:nth-child(${j + 1}) [data-d="${d}"]`)?.focus({ preventScroll: true }) || app.querySelector(`.ord li:nth-child(${j + 1}) button:not(:disabled)`)?.focus({ preventScroll: true });
  },
  check: () => check(),
  reveal: () => { if (!sess) return; sess.view[sess.i].rev = true; sess.touched = true; FX.pop(); renderQ(); },
  self: (b) => { if (!sess) return; sess.ans[sess.i] = b.dataset.v === "1"; check(); },
  next: () => { if (sess.i < sess.qs.length - 1) { sess.i++; renderQ(); } else finish(false); },
  prev: () => { if (sess.i > 0) { sess.i--; renderQ(); } },
  mnext: () => { if (sess.i < sess.qs.length - 1) { sess.i++; renderQ(); } },
  go: (b) => { sess.i = +b.dataset.i; renderQ(); },
  submitAsk: () => {
    const left = sess.qs.filter((q, i) => !answered(q, sess.ans[i]) || (q.t === "order" && !sess.touchedIdx?.[i])).length;
    confirmBox("submitZone", left ? `Има ${left} ${pl(left, "задача", "задачи")} без отговор. Да предам ли матурата?` : "Да предам ли матурата? След това отговорите не могат да се променят.", "submit", "Предай");
  },
  submit: () => finish(false),
  quitAsk: () => {
    if (!sess) return home();
    const started = sess.kind === "mock" ? sess.ans.some((x, i) => answered(sess.qs[i], x) && sess.qs[i].t !== "order") : sess.touched;
    if (!started) return home();
    confirmBox("quitZone", sess.kind === "mist" ? "Да прекъсна ли упражнението?" : "Да прекъсна ли? Този опит няма да се запише в бележника.", "home", "Прекъсни");
  },
  restartAsk: () => {
    if (!sess.touched) return restart();
    confirmBox("quitZone", "Да започна ли отначало? Този опит няма да се запише.", "restart", "Започни отначало");
  },
  restart: () => restart(),
  copy: async (b) => {
    const pre = document.getElementById(`pv-${b.dataset.id}`), out = document.getElementById(`cp-${b.dataset.id}`);
    let ok = false;
    try { await navigator.clipboard.writeText(pre.textContent); ok = true; } catch (e) {}
    if (!ok) {
      try { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); ok = document.execCommand("copy"); } catch (e) {}
    }
    out.textContent = ok ? "Копирано – постави го в съобщение до родителя." : "Текстът е маркиран – копирай го ръчно.";
  },
  cancel: (b) => { const z = document.getElementById(b.dataset.z); if (z) { z.innerHTML = z.id === "resetZone" ? `<button class="btn line danger sm" data-act="resetAllAsk">Нулирай целия прогрес</button>` : z.id === "submitZone" && sess && sess.i < sess.qs.length - 1 ? `<button class="link" data-act="submitAsk">Предай матурата сега</button>` : ""; if (z.classList.contains("zone")) z.hidden = true; } },
  resetModAsk: (b) => confirmBox(`zone-${b.dataset.m}`, `Да изтрия ли всички оценки по „${MOD[b.dataset.m].title}“ и грешките от този модул?`, "resetMod", "Изтрий", `data-m="${b.dataset.m}"`),
  resetMod: (b) => {
    const m = b.dataset.m;
    S.hist = S.hist.filter((h) => h.m !== m);
    S.resets = { ...(S.resets || {}), [m]: Date.now() };
    for (const id of Object.keys(S.mist)) if (!Q[id] || Q[id].m === m) delete S.mist[id];
    save();
    if (ONLINE) Online.soon();
    home(`mod-${m}`);
  },
  resetAllAsk: () => confirmBox("resetZone", "Всички оценки, дати и грешки ще бъдат изтрити. Това не може да се върне.", "resetAll", "Да, изтрий всичко"),
  resetAll: () => { const name = S.name; S = blank(); S.name = name; S.resetAt = Date.now(); save(); if (ONLINE) Online.soon(); histAll = false; home(); },
};
function restart() {
  if (!sess) return home();
  if (sess.kind === "module") startModule(sess.m);
  else if (sess.kind === "mock") startMock();
  else startMistakes(mistIds(mathOn()));
}
app.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled || !app.contains(b)) return;
  const f = ACT[b.dataset.act];
  if (f) f(b, e);
  else if (Game.act(b, e)) return;
  else if (ONLINE) Online.act(b, e);
});
app.addEventListener("input", (e) => {
  if (e.target.id === "pupil") { S.name = e.target.value.slice(0, 40); save(); if (ONLINE) Online.soon(); }
});
document.addEventListener("keydown", (e) => {
  if (!sess || e.target.closest("input,select,textarea")) return;
  if (e.key === "Enter") {
    const b = document.getElementById("checkBtn") || document.getElementById("nextBtn");
    if (b && !b.disabled && document.activeElement !== b) { e.preventDefault(); b.click(); }
  }
});

let rz = 0;
addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (!sess && document.getElementById("chart")) drawChart(); }, 150); });
/* ---------- on the site: personal code, up to N devices, grades synced with the code ---------- */
const Online = (() => {
  const K_CODE = "edubel-trener-code", K_DEV = "edubel-trener-device", K_BANK = "edubel-trener-bank";
  const K_STATE = "edubel-trener-state:", K_DIRTY = "edubel-trener-dirty:", K_RENEW = "edubel-trener-renew";
  // Browsers built into apps keep their own storage and may forget it: every visit could take a new device place.
  const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Viber|Line\/|MicroMessenger|TikTok|musical_ly|BytedanceWebview|Snapchat|LinkedInApp|Pinterest/i;
  let code = "", device = "", devices = [], maxDevices = 3, idleDays = 60, expiresAt = null, timer = 0, busy = false, stay = false;
  const o = { offline: false, flash: "" };
  let onExpired = false;

  const norm = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const fmt = (c) => { c = norm(c); return c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c; };
  const link = () => `${location.origin}/t/?k=${fmt(code)}`;

  async function call(path, data, keepalive) {
    let res;
    try {
      res = await fetch(`/api/trener/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data), keepalive: !!keepalive });
    } catch (e) {
      const err = new Error("Няма връзка с интернет.");
      err.status = 0;
      throw err;
    }
    let j = {};
    try { j = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error(j.message || "Нещо се обърка. Опитай пак след малко.");
      err.status = res.status; err.code = j.error; err.data = j;
      throw err;
    }
    return j;
  }

  // "iPhone · Safari": enough for the family to recognise its devices in the list.
  function label() {
    const ua = navigator.userAgent;
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iPad"
      : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android телефон" : "Android таблет") : /Windows/.test(ua) ? "Компютър с Windows"
      : /Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "Chromebook" : /Linux/.test(ua) ? "Компютър с Linux" : "Устройство";
    const br = /Viber/.test(ua) ? "Viber" : /FBAN|FBAV|FB_IAB|FBIOS/.test(ua) ? "Facebook" : /Instagram/.test(ua) ? "Instagram"
      : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera"
      : /Firefox|FxiOS/.test(ua) ? "Firefox" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "браузър";
    return `${os} · ${br}`;
  }
  function deviceKey() {
    let d = ls.get(K_DEV);
    if (d && /^[a-f0-9]{32,128}$/.test(d)) return d;
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    d = [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
    if (!ls.set(K_DEV, d) || ls.get(K_DEV) !== d) return "";
    return d;
  }
  function readJSON(k) { try { return JSON.parse(ls.get(k) || "null"); } catch (e) { return null; } }
  const readBank = () => { const b = readJSON(K_BANK); return b && b.id && b.data && Array.isArray(b.data.questions) ? b : null; };
  const readState = () => { const s = readJSON(K_STATE + code); return s ? normState(s) : null; };
  function saveLocal() { if (code) canSave = ls.set(K_STATE + code, JSON.stringify(S)); }

  /* screens before the trainer opens */
  function screen(html) {
    stopTimer();
    sess = null;
    app.innerHTML = `<header class="hd"><div class="brand"><img src="${LOGO}" alt="Еду БЕЛ" width="60" height="60"><span class="eyebrow">НВО по БЕЛ · 7. клас</span></div></header><section class="gate">${html}</section>`;
    window.scrollTo(0, 0);
  }
  const btns = (list) => `<div class="row">${list.map(([act, text], i) => `<button class="${i ? "link" : "btn"}" data-act="${act}">${esc(text)}</button>`).join("")}</div>`;
  const message = (title, text, list) => screen(`<h1>${esc(title)}</h1><p class="lead">${esc(text)}</p>${list ? btns(list) : ""}`);
  function codeScreen(err) {
    screen(`<h1>НВО тренажор <em>по БЕЛ</em></h1>
      <p class="lead">Сканирай QR кода с камерата на телефона или въведи кода от PDF-а или от стикера на кутията.</p>
      <form id="codeForm" class="codeform" novalidate><label for="codeIn">Код за достъп</label>
        <div class="row"><input id="codeIn" class="field code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX" maxlength="14">
        <button class="btn gold">Отвори</button></div></form>
      ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ""}
      <p class="small muted">Кодът е от 10 букви и цифри. Не е нужно да пишеш тирето и главните букви.</p>`);
    const f = document.getElementById("codeForm"), inp = document.getElementById("codeIn");
    inp.focus();
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const c = norm(inp.value);
      if (c.length < 8) return codeScreen("Провери кода – той е от 10 букви и цифри.");
      code = c;
      ls.set(K_CODE, c);
      start();
    });
  }
  function inAppScreen(url) {
    screen(`<h1>Отвори тренажора в Chrome или Safari</h1>
      <p class="lead">Линкът е отворен вътре в приложение (Viber, Facebook, Instagram…). Там оценките не се пазят сигурно, а всяко отваряне може да заеме ново място от устройствата на кода.</p>
      <ol class="steps"><li>Натисни <b>⋮</b> или <b>···</b> горе вдясно.</li><li>Избери „Отвори в браузър“ (Open in browser, Open in Safari или Open in Chrome).</li></ol>
      <p>Или копирай линка и го постави в Chrome или Safari:</p>
      <div class="linkbox"><pre class="preview" id="pv-link">${esc(url)}</pre><button class="btn sm" data-act="copyLink">Копирай линка</button></div>
      <p class="small muted" id="cp-link" role="status"></p>
      <div><button class="link" data-act="stayInApp">Продължи тук въпреки това</button></div>`);
  }
  function fullScreen(d) {
    maxDevices = d.maxDevices || maxDevices;
    idleDays = d.idleDays || idleDays;
    screen(`<h1>Този код вече е отворен на ${maxDevices} устройства</h1>
      <p class="lead">Кодът работи на до ${maxDevices} устройства – телефон, таблет или компютър. Записани са:</p>
      <ul class="devlist">${(d.devices || []).map((x) => `<li><span><b>${esc(x.label)}</b><small>отворено за последно на ${fmtDate(x.lastSeen)}</small></span></li>`).join("")}</ul>
      <h3>Как да освободиш място</h3>
      <ol class="steps"><li>Отвори тренажора на едно от тези устройства.</li><li>Най-долу, в „Твоят достъп“, натисни „Премахни“ до устройството, което вече не ползваш.</li><li>Върни се тук и натисни „Опитай пак“.</li></ol>
      <p class="small muted">Устройство, което не е ползвано ${idleDays} дни, освобождава мястото си само. Ако не можеш да освободиш място, свържи се с Еду БЕЛ и ще го направим ние.</p>
      ${btns([["retryOpen", "Опитай пак"], ["otherCode", "Въведи друг код"]])}`);
  }

  const renewForm = (err) => `<form id="renewForm" class="codeform" novalidate><label for="renewIn">Код за удължаване</label>
      <div class="row"><input id="renewIn" class="field code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX" maxlength="14">
      <button class="btn gold">Удължи</button></div><p class="${err ? "err" : "small muted"}" id="renewMsg" role="status">${esc(err || "")}</p></form>`;

  // The access ended: the grades stay, and a renewal code continues with the same gradebook.
  // No offer to the child here – the screen is meant to be shown to a parent.
  function expiredScreen(text, err) {
    onExpired = true;
    const local = readState();
    const n = local ? local.hist.length : 0;
    const sentence = /[.!?]$/.test(text) ? text : `${text}.`;
    screen(`<h1>Достъпът до тренажора изтече</h1><p class="lead">${esc(sentence)}</p>
      ${n ? `<p>В бележника на това устройство има ${n} ${n === 1 ? "оценка" : "оценки"} – те остават.</p>` : ""}
      <p><b>Покажи този екран на родител.</b> С код за удължаване тренажорът продължава със същия бележник и оценки.</p>
      ${renewForm(err)}
      <div><button class="link" data-act="otherCode">Въведи друг код</button></div>`);
  }

  async function doRenew(rc) {
    const msgEl = document.getElementById("renewMsg");
    if (msgEl) { msgEl.className = "small muted"; msgEl.textContent = "Удължавам…"; }
    try {
      const r = await call("renew", { code, device, renew: rc });
      ls.del(K_RENEW);
      expiresAt = r.expiresAt;
      o.flash = `Достъпът е удължен с ${r.months} ${r.months === 1 ? "месец" : "месеца"} – до ${fmtDate(r.expiresAt)}`;
      if (onExpired) { onExpired = false; return open(); }
      home();
    } catch (e) {
      ls.del(K_RENEW);
      const text = e.status === 0 ? "Няма връзка с интернет. Опитай пак." : e.code === "device_removed" ? "Въведи кода за удължаване на устройство, на което тренажорът вече е отварян." : e.message;
      if (onExpired) return expiredScreen(lastExpired, text);
      if (sess) return;
      home("access");
      const m = document.getElementById("renewMsg");
      if (m) { m.className = "err"; m.textContent = text; }
    }
  }
  let lastExpired = "";

  async function open() {
    screen(`<p class="lead">Отварям тренажора…</p>`);
    const cached = readBank(), local = readState();
    const dirty = !!ls.get(K_DIRTY + code);
    try {
      const r = await call("open", { code, device, label: label(), have: cached ? cached.id : 0, state: dirty && local ? local : undefined });
      o.offline = false;
      const bank = r.bank ? { id: r.bankId, data: r.bank } : cached;
      if (r.bank && !ls.set(K_BANK, JSON.stringify(bank))) ls.del(K_BANK);
      code = norm(r.code);
      devices = r.devices || [];
      maxDevices = r.maxDevices;
      idleDays = r.idleDays;
      expiresAt = r.expiresAt || null;
      setBank(bank.data);
      S = normState(r.state);
      saveLocal();
      ls.del(K_DIRTY + code);
      onExpired = false;
      const pending = ls.get(K_RENEW);
      if (pending && expiresAt) return doRenew(pending);
      if (pending) ls.del(K_RENEW);
      home();
    } catch (e) {
      if (e.status === 0) {
        if (cached && local) { o.offline = true; setBank(cached.data); S = local; home(); schedule(); return; }
        return message("Няма връзка с интернет", "Свържи се с интернет и опитай пак. Първото отваряне на тренажора става с връзка.", [["retryOpen", "Опитай пак"]]);
      }
      if (e.code === "devices_full") return fullScreen(e.data);
      if (e.status === 404 || e.code === "code") { ls.del(K_CODE); code = ""; return codeScreen(e.message); }
      if (e.code === "disabled") return message("Този код е спрян", "Свържи се с Еду БЕЛ, за да го пуснем отново.", [["otherCode", "Въведи друг код"]]);
      if (e.code === "too_many_devices") return message("Твърде много нови устройства", `${e.message} Покажи това съобщение на родител.`, [["otherCode", "Въведи друг код"]]);
      if (e.code === "expired") {
        lastExpired = e.message;
        const pending = ls.get(K_RENEW);
        if (pending) { onExpired = true; expiredScreen(e.message); return doRenew(pending); }
        return expiredScreen(e.message);
      }
      if (e.code === "renew_code") {
        ls.set(K_RENEW, code);
        ls.del(K_CODE);
        code = "";
        return codeScreen("Това е код за удължаване. Въведи първо своя код за достъп (от PDF-а или стикера) – удължаването ще се добави след това.");
      }
      return message("Нещо се обърка", e.message, [["retryOpen", "Опитай пак"]]);
    }
  }

  function start() {
    device = deviceKey();
    if (!device) {
      return message("Отвори тренажора в обикновен прозорец", "Този прозорец не пази данни (например режим „инкогнито“ или частен прозорец). Отвори линка в обикновен прозорец на Chrome или Safari.", [["retryOpen", "Опитай пак"]]);
    }
    open();
  }

  /* saving: a copy here at once, the server a few seconds later */
  function changed() {
    saveLocal();
    if (code) ls.set(K_DIRTY + code, "1");
    schedule();
  }
  // At most one save in 90 seconds while the child works (every save is a paid request on the server);
  // the end of a test, a solved dossier and leaving or hiding the page save at once.
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = 0; syncNow(); }, o.offline ? 30000 : 90000);
  }
  // A few seconds, for rare changes that should reach the other devices quickly (the name, the avatar, a reset).
  function soon() {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; syncNow(); }, 2500);
  }
  async function syncNow(keepalive) {
    clearTimeout(timer);
    timer = 0;
    if (!code || !device || busy || !ls.get(K_DIRTY + code)) return;
    busy = true;
    const sentAt = S.at;
    try {
      const r = await call("save", { code, device, state: S }, keepalive);
      const wasOffline = o.offline;
      o.offline = false;
      if (S.at === sentAt) {
        S = normState(r.state);
        saveLocal();
        ls.del(K_DIRTY + code);
      } else schedule();
      if (wasOffline && !sess) home();
    } catch (e) {
      if (e.status === 0) { o.offline = true; schedule(); }
      else if (e.code === "device_removed") message("Това устройство беше премахнато от кода", "Някой от семейството е освободил мястото му. Натисни „Отвори отново“ – ако има свободно място, устройството ще се запише пак и оценките ще се заредят.", [["retryOpen", "Отвори отново"]]);
      else if (e.code === "disabled") message("Този код е спрян", "Свържи се с Еду БЕЛ, за да го пуснем отново.", []);
      else if (e.code === "expired") { lastExpired = e.message; expiredScreen(e.message); }
      else schedule();
    } finally {
      busy = false;
    }
  }
  addEventListener("online", () => syncNow());
  app.addEventListener("submit", (e) => {
    if (e.target.id !== "renewForm") return;
    e.preventDefault();
    const v = norm(document.getElementById("renewIn").value);
    const m = document.getElementById("renewMsg");
    if (v.length < 8) { m.className = "err"; m.textContent = "Провери кода – той е от 10 букви и цифри."; return; }
    doRenew(v);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") syncNow(true); });

  function accessSection() {
    return `<section class="access" id="access"><h3>Твоят достъп</h3>
      <p class="small muted">Код <b class="num">${esc(fmt(code))}</b>.${expiresAt ? ` Достъпът е до <b>${fmtDate(expiresAt)}</b>` : ""} Работи на до ${maxDevices} устройства. Устройство, което не е ползвано ${idleDays} дни, освобождава мястото си само.</p>
      <ul class="devlist">${devices.map((d) => `<li><span><b>${esc(d.label)}</b>${d.me ? ` <i class="me">това устройство</i>` : ""}<small>отворено за последно на ${fmtDate(d.lastSeen)}</small></span>
        ${d.me ? "" : `<button class="link" data-act="devForgetAsk" data-id="${esc(d.id)}">Премахни</button>`}<div class="zone" id="dz-${esc(d.id)}" hidden></div></li>`).join("")}</ul>
      ${expiresAt ? `<div class="renewbox"><p class="small muted">Имаш код за удължаване? Въведи го тук – достъпът се удължава, а бележникът и оценките остават.</p>${renewForm("")}</div>` : ""}
      <div class="linkbox"><pre class="preview" id="pv-link">${esc(link())}</pre><button class="btn line sm" data-act="copyLink">Копирай линка</button></div>
      <p class="small muted" id="cp-link" role="status">С този линк отваряш тренажора на друго устройство с всички оценки.</p></section>`;
  }

  const ACTS = {
    copyLink: async () => {
      const pre = document.getElementById("pv-link"), out = document.getElementById("cp-link");
      let ok = false;
      try { await navigator.clipboard.writeText(pre.textContent); ok = true; } catch (e) {}
      if (!ok) { try { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ok = document.execCommand("copy"); } catch (e) {} }
      if (out) out.textContent = ok ? "Линкът е копиран." : "Линкът е маркиран – копирай го ръчно.";
    },
    stayInApp: () => { stay = true; try { sessionStorage.setItem("edubel-trener-stay", "1"); } catch (e) {} boot(); },
    retryOpen: () => { if (!code) return codeScreen(); start(); },
    otherCode: () => { ls.del(K_CODE); code = ""; codeScreen(); },
    devForgetAsk: (b) => confirmBox(`dz-${b.dataset.id}`, "Да премахна ли това устройство? На него тренажорът ще поиска кода отново.", "devForget", "Премахни", `data-id="${esc(b.dataset.id)}"`),
    devForget: async (b) => {
      try {
        const r = await call("forget", { code, device, target: b.dataset.id });
        devices = r.devices;
        home("access");
      } catch (e) {
        const z = document.getElementById(`dz-${b.dataset.id}`);
        if (z) z.innerHTML = `<p class="err" role="alert">${esc(e.message)}</p>`;
      }
    },
  };

  function boot() {
    const url = new URL(location.href);
    const fromUrl = norm(url.searchParams.get("k") || location.hash.slice(1));
    if (fromUrl.length >= 8) ls.set(K_CODE, fromUrl);
    const renew = norm(url.searchParams.get("r"));
    if (renew.length >= 8) ls.set(K_RENEW, renew);
    try { stay = stay || sessionStorage.getItem("edubel-trener-stay") === "1"; } catch (e) {}
    if (IN_APP.test(navigator.userAgent) && !stay) return inAppScreen(fromUrl ? `${location.origin}/t/?k=${fmt(fromUrl)}` : `${location.origin}/t/`);
    if (url.searchParams.has("k") || url.searchParams.has("r") || url.searchParams.has("m") || location.hash) history.replaceState(null, "", "/t/");
    code = norm(ls.get(K_CODE)) || fromUrl;
    if (code.length < 8) return codeScreen(ls.get(K_RENEW) ? "Въведи първо своя код за достъп (от PDF-а или стикера) – удължаването ще се добави след това." : "");
    start();
  }

  return Object.assign(o, {
    boot, changed, accessSection,
    syncNow: () => syncNow(),
    soon: () => soon(),
    act: (b, e) => { const f = ACTS[b.dataset.act]; if (f) f(b, e); },
  });
})();

/* ---------- the game „Литературни досиета“ (bank.dossiers) ---------- */
// Each dossier: 1 find the three ★ words in the grid (tap the first and the last letter), 2 answer the clues with them,
// 3 five questions whose letters give the dossier's code; one letter of the code goes to the secret message.
// 4 and 5 are bonuses. Progress is kept in S.dos, so it syncs like the grades.
const Game = (() => {
  const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1]];
  let view = null; // {kind: "home"|"dossier"|"review"|"final", id}
  let sel = null; // first tapped cell [r, c] in the grid
  const D = () => BANK.dossiers;
  const st = (id) => {
    S.dos = S.dos || {};
    S.dos[id] = S.dos[id] || {};
    return S.dos[id];
  };
  const dossier = (id) => D().dossiers.find((x) => x.id === id);
  // The hero each solved dossier adds to the collection. Frame: solved → violet, one bonus → silver, both bonuses → gold.
  const HEROES = { d01: "Чавдар", d02: "Влюбеният в гората", d03: "Поетът", d04: "Благолаж", d05: "Художникът", d06: "Бойчо Огнянов", d07: "Рада Госпожина", d08: "Братчетата", d09: "Серафим", d10: "Тръбачът", d11: "Юнакът балкански", d12: "Синът бунтовник", d13: "Хъшът", d14: "Странджата", d15: "Бръчков", d16: "Баба Илийца", d17: "Опълченецът", d18: "Българският език", d19: "Пътешественикът", d20: "Бай Ганьо", d21: "Неразделните", d22: "Заточеникът", d23: "Пенка", d24: "Гунчо и Нонка" };
  const heroName = (d) => HEROES[d.id] || d.work;
  const tier = (id) => { const s = (S.dos || {})[id] || {}; return !s.done ? "" : s.b4 && s.b5 ? "gold" : s.b4 || s.b5 ? "silver" : "base"; };
  const TIER = { base: "Карта", silver: "Сребърна карта", gold: "Златна карта" };
  const heroCard = (d, big) => {
    const t = tier(d.id);
    return `<figure class="hcard ${t || "locked"} ${big ? "big" : ""}">${pic("h-" + d.id, "", t ? heroName(d) : "Заключен герой")}<figcaption>${t ? `<b>${esc(heroName(d))}</b><small>${TIER[t]}</small>` : `<b>?</b><small>Досие ${String(d.no).padStart(2, "0")}</small>`}</figcaption></figure>`;
  };
  const solved = (id) => !!(S.dos && S.dos[id] && S.dos[id].done);
  const solvedCount = () => D().dossiers.filter((d) => solved(d.id)).length;
  function rank() {
    const n = solvedCount(), all = D().dossiers.length;
    if (n >= all && solved("final")) return { t: "Главен инспектор", next: "" };
    if (n >= 12) return { t: "Инспектор", next: `още ${all - n} ${all - n === 1 ? "досие" : "досиета"} и финалът до „Главен инспектор“` };
    if (n >= 5) return { t: "Детектив", next: `още ${12 - n} до „Инспектор“` };
    return { t: "Стажант", next: `още ${5 - n} до „Детектив“` };
  }
  // Letter for message field N, if the dossier that gives it is solved.
  function letters() {
    const out = {};
    for (const d of D().dossiers) if (solved(d.id)) out[d.field] = d.code[d.take - 1];
    const f = D().final;
    if (f && solved("final")) out[f.field] = f.code[f.take - 1];
    return out;
  }
  function board() {
    const L = letters(), m = D().message;
    return `<div class="dmsg" aria-label="Тайното послание">${m.groups.map((g) => `<span class="dword">${g.map((n) => `<span class="dbox ${L[n] ? "on" : ""}"><i>${n}</i><b>${L[n] || ""}</b></span>`).join("")}</span>`).join("")}</div>`;
  }

  function card() {
    if (!BANK.dossiers) return "";
    const n = solvedCount(), all = D().dossiers.length, r = rank();
    const got = D().dossiers.filter((d) => solved(d.id)).slice(-5);
    // A short silent loop behind the card (the still picture stays if the device asks for less motion or to save data).
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
    const vid = asset("g-banner.mp4") && !calm ? `<video class="game-v" src="${asset("g-banner.mp4")}" poster="${img("g-banner")}" autoplay muted loop playsinline preload="auto" aria-hidden="true" tabindex="-1"></video>` : "";
    return `<section class="game" aria-labelledby="gameT" style="--bg:url('${img("g-banner")}')">${vid}<div class="game-in">
      <span class="eyebrow">Игра · ${all} досиета · ${all} героя</span>
      <h2 id="gameT">Литературни досиета</h2>
      <p>Разследвай творбите като детектив: намери думите, събери уликите и разбий кода. Всяко разкрито досие отключва герой и буква от тайното послание.</p>
      <div class="game-row"><span class="rank">${esc(r.t)}</span><span class="small">Разкрити: <b>${n} от ${all}</b></span></div>
      ${got.length ? `<div class="game-heroes" aria-label="Последно отключени герои">${got.map((d) => pic("h-" + d.id, "", heroName(d))).join("")}</div>` : ""}
      <button class="btn gold" data-act="gameHome">${n ? "Продължи разследването" : "Започни разследването"}</button></div>
      ${pic(mascot("detective"), "game-m")}</section>`;
  }

  function top(back, title) {
    return `<div class="qbar"><button class="back" data-act="${back}">← ${back === "home" ? "Табло" : "Досиетата"}</button><span class="qtitle">${esc(title)}</span><span></span></div>`;
  }

  function home() {
    view = { kind: "home" };
    stopTimer();
    sess = null;
    const r = rank(), all = D().dossiers.length, n = solvedCount();
    let h = top("home", "Литературни досиета");
    h += `<section class="dhero"><h1>Литературни <em>досиета</em></h1>
      <p class="lead">${all} досиета. Един таен код. Разследването започва с теб.</p>
      <div class="game-row"><span class="rank">${esc(r.t)}</span><span class="small">Разкрити: <b>${n} от ${all}</b>${r.next ? ` · ${esc(r.next)}` : ""}</span></div></section>
      <section class="dpanel"><h3>Тайното послание</h3><p class="small muted">Всяко разкрито досие попълва едно поле. Последната буква е във финала.</p>${board()}</section>
      <details class="dpanel coll" ${n ? "open" : ""}><summary><h3>Колекция герои</h3><span class="small muted">${n} от ${all} · ${D().dossiers.filter((d) => tier(d.id) === "gold").length} златни</span></summary>
        <p class="small muted">Разкрий досието и героят е твой. Реши единия бонус – картата става сребърна, двата – златна. Без късмет и без покупки: само разследване.</p>
        <div class="hgrid">${D().dossiers.map((d) => `<button class="hbtn" data-act="gameHero" data-id="${d.id}" aria-label="Досие ${d.no}: ${solved(d.id) ? esc(heroName(d)) : "заключено"}">${heroCard(d)}</button>`).join("")}</div></details>
      <details class="dpanel how"><summary>Как се играе</summary><ol>
        <li><b>Следата.</b> Намери трите думи със звездичка: докосни първата им буква (тя е отбелязана), после последната. Думите вървят → ↓ ↘ ↗.</li>
        <li><b>Уликите.</b> Отговори на трите въпроса с тези думи.</li>
        <li><b>Разпитът.</b> Избери верните отговори – буквите им дават кода на досието и буква за тайното послание.</li>
        <li><b>Бонуси.</b> Задачи 4 и 5 са по желание. Можеш да гледаш в текста и да поправяш – няма таймер и наказания.</li></ol></details>
      <section class="dlist" aria-label="Досиетата">`;
    for (const d of D().dossiers) {
      const s = (S.dos || {})[d.id] || {};
      const stars = (s.b4 ? "★" : "") + (s.b5 ? "★" : "");
      h += `<button class="dcase ${solved(d.id) ? "done" : ""}" data-act="gameOpen" data-id="${d.id}"><span class="dno ${solved(d.id) ? "" : "locked"}">${pic("h-" + d.id)}<i>${String(d.no).padStart(2, "0")}</i></span>
        <span class="dt"><b>${esc(d.work)}</b><small>${esc(d.author)}</small></span>
        <span class="dst">${solved(d.id) ? `<i class="stamp-s">Разкрито</i>` : s.t1 || s.t3 ? "започнато" : ""}${stars ? `<em>${stars}</em>` : ""}</span></button>`;
    }
    h += `</section>`;
    for (const rv of D().reviews || []) {
      const s = (S.dos || {})[rv.id] || {};
      h += `<button class="dcase extra ${s.done ? "done" : ""}" data-act="gameOpen" data-id="${rv.id}"><span class="dno">★</span><span class="dt"><b>${esc(rv.title)}</b><small>по желание · не носи буква</small></span><span class="dst">${s.done ? `<i class="stamp-s">Готово</i>` : ""}</span></button>`;
    }
    if (D().final) h += `<button class="dcase final ${solved("final") ? "done" : ""}" data-act="gameOpen" data-id="final"><span class="dno">25</span><span class="dt"><b>${esc(D().final.title || "Финал")}</b><small>последната буква и посланието</small></span><span class="dst">${solved("final") ? `<i class="stamp-s">Разкрито</i>` : ""}</span></button>`;
    h += `<div class="row"><button class="link" data-act="gameResetAsk">Започни играта отначало</button></div><div id="gameZone"></div>`;
    app.innerHTML = h;
    window.scrollTo(0, 0);
  }

  /* ----- one dossier ----- */
  const found = (d) => new Set(st(d.id).t1 || []);
  function gridHtml(d) {
    const f = found(d), on = new Map();
    d.words.forEach((w, wi) => { if (f.has(w.w)) w.cells.forEach(([r, c]) => on.set(`${r},${c}`, (wi % 5) + 1)); });
    const marks = new Set(d.words.filter((w) => w.star).map((w) => `${w.cells[0][0]},${w.cells[0][1]}`));
    let h = `<div class="dgrid" role="grid" aria-label="Решетка 10 на 10">`;
    d.grid.forEach((row, r) => [...row].forEach((ch, c) => {
      const k = `${r},${c}`;
      h += `<button class="dcell ${on.has(k) ? `f f${on.get(k)}` : ""} ${marks.has(k) ? "mk" : ""} ${sel && sel[0] === r && sel[1] === c ? "sel" : ""}" data-act="gameCell" data-r="${r}" data-c="${c}" aria-label="ред ${r + 1}, колона ${c + 1}: ${ch}">${ch}</button>`;
    }));
    return h + `</div>`;
  }
  function trailHtml(d) {
    if (!d.trail) return "";
    const f = found(d);
    if (!d.words.every((w) => f.has(w.w))) return `<p class="small muted">Бонус: намери и останалите думи – неоградените букви, прочетени ред по ред, дават скрита следа.</p>`;
    return `<p class="okbox">Скритата следа: <b>${esc(d.trail)}</b></p>`;
  }
  function task1(d) {
    const f = found(d), stars = d.words.filter((w) => w.star), ok = stars.every((w) => f.has(w.w));
    return `<section class="dtask" id="t1"><h3><span class="tn">1</span> Открий трите думи със звездичка ${ok ? `<i class="tick">✓</i>` : ""}</h3>
      <p class="small muted">Докосни отбелязаната първа буква, после последната буква на думата. Думите вървят → ↓ ↘ ↗.</p>
      ${gridHtml(d)}<p class="dhint" id="gridMsg" role="status">${sel ? "Сега докосни последната буква на думата." : ""}</p>
      <ul class="dwords">${d.words.map((w) => `<li class="${w.star ? "star" : ""} ${f.has(w.w) ? "got" : ""}">${w.star ? "★ " : ""}${esc(w.w)}</li>`).join("")}</ul>
      ${ok ? "" : `<button class="link" data-act="gameHint">Подсказка</button>`}${trailHtml(d)}</section>`;
  }
  function task2(d) {
    const s = st(d.id), a = s.t2 || {}, starWords = d.words.filter((w) => w.star).map((w) => w.w);
    const ok = d.clues.every((c, i) => a[i] === c.a);
    return `<section class="dtask" id="t2"><h3><span class="tn">2</span> Събери уликите ${ok ? `<i class="tick">✓</i>` : ""}</h3>
      <p class="small muted">Отговори с трите думи със звездичка. Всяка се използва веднъж.</p>
      <ol class="dclues">${d.clues.map((c, i) => `<li><p>${esc(c.q)}</p><div class="chips">${starWords.map((w) => {
        const picked = a[i] === w, right = picked && w === c.a, wrong = picked && w !== c.a;
        return `<button class="chip ${right ? "right" : wrong ? "wrong" : ""}" data-act="gameClue" data-i="${i}" data-w="${esc(w)}" ${a[i] === c.a ? "disabled" : ""}>${esc(w)}</button>`;
      }).join("")}</div></li>`).join("")}</ol></section>`;
  }
  function codeBoxes(code, take, letters_, marked) {
    return `<div class="dcode">${[0, 1, 2, 3, 4].map((i) => `<span class="dbox ${i === take - 1 ? "take" : ""} ${letters_[i] ? "on" : ""}"><i>${i + 1}</i><b>${letters_[i] || ""}</b></span>`).join("")}</div>`;
  }
  function quizHtml(id, quiz, code, take, field) {
    const s = st(id), a = s.t3 || [], checked = !!s.t3c;
    const lettersNow = quiz.map((q, i) => (a[i] != null ? q.o[a[i]].k : ""));
    const done = solved(id);
    let h = `<ol class="dquiz">${quiz.map((q, i) => `<li><p>${esc(q.q)}</p><div class="opts">${q.o.map((o, k) => {
      const picked = a[i] === k;
      const cls = picked ? (checked || done ? (k === q.a ? "right" : "wrong") : "sel") : "";
      return `<button class="opt ${cls}" data-act="gameAns" data-id="${id}" data-i="${i}" data-k="${k}" ${done ? "disabled" : ""}><span class="key">${esc(o.k)}</span><span>${esc(o.t)}</span></button>`;
    }).join("")}</div></li>`).join("")}</ol>
      <p class="small muted">Кодът на досието (буквите на верните отговори от 1 до 5):</p>${codeBoxes(code, take, lettersNow)}`;
    if (done) h += `<p class="okbox">Кодът е <b>${esc(code)}</b>. Буквата „${esc(code[take - 1])}“ отиде в поле ${field} на тайното послание.</p>`;
    else if (checked) h += `<p class="warnbox">Не се получава дума. Провери отговорите в червено – можеш да гледаш в текста.</p>`;
    if (!done) h += `<button class="btn" data-act="gameCheck" data-id="${id}" ${a.filter((x) => x != null).length === 5 ? "" : "disabled"}>Провери кода</button>`;
    return h;
  }
  function task3(d) {
    return `<section class="dtask" id="t3"><h3><span class="tn">3</span> Избери верния отговор ${solved(d.id) ? `<i class="tick">✓</i>` : ""}</h3>
      ${quizHtml(d.id, d.quiz, d.code, d.take, d.field)}</section>`;
  }

  // Bonus 4: order the events, split into two groups, complete a quote, or who says it.
  function bonus4(d) {
    const b = d.bonus4;
    if (!b) return "";
    const s = st(d.id), a = s.b4a || {}, ok = !!s.b4, checked = !!s.b4c;
    let body = "";
    // The paper prompts say "write 1–5 in the boxes"; on a screen the moves are different.
    const prompt = b.type === "order" ? "Подреди събитията от първото до последното със стрелките ↑ ↓."
      : b.type === "groups" ? "Към коя група е всяка дума? Докосни групата до нея." : b.prompt || "";
    if (b.type === "order") {
      // Start from the mixed order printed on paper (the same for every child), or a random one.
      const printed = (b.printed || []).map((t) => b.items.indexOf(t));
      const ord = s.b4o || (printed.length === b.items.length && !printed.includes(-1) ? printed : shuffle(b.items.map((_, i) => i)));
      if (!s.b4o) s.b4o = ord;
      body = `<ol class="ord">${ord.map((k, pos) => `<li class="${checked || ok ? (k === pos ? "right" : "wrong") : ""}"><span>${esc(b.items[k])}</span><span class="mv">${ok ? "" : `<button data-act="gameMove" data-id="${d.id}" data-k="${pos}" data-d="-1" ${pos === 0 ? "disabled" : ""} aria-label="Нагоре">↑</button><button data-act="gameMove" data-id="${d.id}" data-k="${pos}" data-d="1" ${pos === ord.length - 1 ? "disabled" : ""} aria-label="Надолу">↓</button>`}</span></li>`).join("")}</ol>`;
    } else if (b.type === "groups") {
      const all = b.groups.flatMap((g, gi) => g.items.map((w) => ({ w, gi })));
      const order = s.b4w || shuffle(all.map((x) => x.w));
      if (!s.b4w) s.b4w = order;
      body = `<div class="dgroups">${order.map((w) => {
        const right = all.find((x) => x.w === w).gi, pick = a[w];
        return `<div class="dgw ${checked || ok ? (pick === right ? "right" : "wrong") : ""}"><span>${esc(w)}</span><span class="seg">${b.groups.map((g, gi) => `<button class="${pick === gi ? "on" : ""}" data-act="gamePick" data-id="${d.id}" data-key="${esc(w)}" data-v="${gi}" ${ok ? "disabled" : ""}>${esc(g.title)}</button>`).join("")}</span></div>`;
      }).join("")}</div>`;
    } else if (b.type === "fill" || b.type === "who") {
      const choices = b.type === "fill" ? b.bank : b.names;
      body = `<div class="dfill">${b.lines.map((l, i) => {
        const pick = a[i], st_ = checked || ok ? (pick === l.a ? "right" : "wrong") : "";
        const sel_ = `<select data-act-change="gameSel" data-id="${d.id}" data-key="${i}" ${ok ? "disabled" : ""} aria-label="Избери"><option value="">…</option>${choices.map((c) => `<option ${pick === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
        return b.type === "fill"
          ? `<p class="dline ${st_}">${esc(l.before || "")} ${sel_} ${esc(l.after || "")}</p>`
          : `<div class="dline who ${st_}"><q>${esc(l.q)}</q>${sel_}</div>`;
      }).join("")}</div>`;
    }
    return `<section class="dtask bonus" id="t4"><h3><span class="tn">4</span> Бонус: още следи ${ok ? `<i class="tick">★</i>` : ""}</h3>
      <p class="small muted">${esc(prompt)}</p>${body}
      ${ok ? `<p class="okbox">Браво – бонусът е решен!</p>` : `<button class="btn line" data-act="gameBonus" data-id="${d.id}">Провери бонуса</button>${checked ? `<p class="small muted">Поправи червените и провери пак.</p>` : ""}`}</section>`;
  }
  function bonus5(d) {
    const b = d.bonus5;
    if (!b) return "";
    const s = st(d.id);
    return `<section class="dtask bonus" id="t5"><h3><span class="tn">5</span> Бонус: една мисъл ${s.b5 ? `<i class="tick">★</i>` : ""}</h3>
      <p><b>${esc(b.q)}</b></p>
      <textarea class="field dthink" id="b5in" rows="3" aria-label="Твоят отговор">${esc(s.b5t || b.start || "")}</textarea>
      ${s.b5 && b.sample ? `<div class="fb ok"><b class="t">Един добър отговор</b><span>${esc(b.sample)}</span><span class="small muted">Сравни смисъла, не точните думи. Искаш ли още? Добави кратък цитат от творбата.</span></div>`
        : `<button class="btn line" data-act="gameThink" data-id="${d.id}">${b.sample ? "Готово – покажи примерен отговор" : "Готово"}</button>`}</section>`;
  }

  function dossierView(id) {
    const d = dossier(id);
    view = { kind: "dossier", id };
    stopTimer();
    sess = null;
    const idx = D().dossiers.indexOf(d), next = D().dossiers[idx + 1];
    let h = top("gameHome", `Досие ${String(d.no).padStart(2, "0")}`);
    h += `<section class="dhero with-hero"><div class="dh-hero">${heroCard(d, true)}</div><span class="eyebrow">Досие ${String(d.no).padStart(2, "0")} · ${esc(d.author)}</span><h1>${esc(d.work)}</h1>
      ${solved(id) ? "" : `<p class="small muted">Разкрий досието, за да отключиш героя в колекцията.</p>`}
      <div class="brief"><b>Накратко за творбата</b><p>${esc(d.brief)}</p>${(d.gloss || []).map((g) => `<p class="small">${esc(g)}</p>`).join("")}</div>
      ${solved(id) ? `<p class="okbox">Досието е разкрито! Буквата „${esc(d.code[d.take - 1])}“ е в поле ${d.field} на тайното послание.</p>` : ""}</section>`;
    h += task1(d) + task2(d) + task3(d) + bonus4(d) + bonus5(d);
    h += `<div class="row">${next ? `<button class="btn gold" data-act="gameOpen" data-id="${next.id}">Следващо досие →</button>` : ""}<button class="btn line" data-act="gameHome">Всички досиета</button></div>`;
    app.innerHTML = h;
  }

  // Review rows: a letter for each clue (some clues accept a second letter), or – for "who is the author" –
  // the author of each listed work (on paper the child writes letters next to the authors; one pick per work is easier on a phone).
  function reviewRows(rv, t, ti) {
    if (t.multi) {
      const author = {};
      for (const it of t.items) for (const k of it.a) author[k] = it.q;
      const choices = t.items.map((it) => ({ v: it.q, t: it.q }));
      return rv.list.filter((x) => author[x.k]).map((x) => ({ key: `${ti}.${x.k}`, q: x.t, ok: [author[x.k]], choices }));
    }
    const choices = rv.list.map((x) => ({ v: x.k, t: `${x.k} – ${x.t}` }));
    return t.items.map((it, i) => ({ key: `${ti}.${i}`, q: it.q, ok: [it.a, ...(it.alt || [])], choices }));
  }
  const sentence = (t) => (t ? t[0] + t.slice(1).toLowerCase() : "");
  function reviewView(id) {
    const rv = D().reviews.find((x) => x.id === id), s = st(id), a = s.a || {};
    view = { kind: "review", id };
    let h = top("gameHome", rv.title);
    h += `<section class="dhero"><h1>${esc(rv.title)}</h1><p class="lead">По желание. ${esc(rv.intro || "Използвай решените досиета – този преговор не носи буква.")}</p></section>`;
    h += `<section class="dtask"><h3>Досиетата в този преговор</h3><ul class="dlistk">${rv.list.map((x) => `<li><b>${esc(x.k)}</b> ${esc(x.t)}</li>`).join("")}</ul></section>`;
    rv.tasks.forEach((t, ti) => {
      h += `<section class="dtask"><h3><span class="tn">${ti + 1}</span> ${esc(sentence(t.title) || t.prompt)}</h3>
        <p class="small muted">${t.multi ? "Избери автора на всяка творба." : "Избери досието от списъка – можеш да надникнеш в решените досиета."}</p><div class="dfill">${reviewRows(rv, t, ti).map((r) => {
        const pick = a[r.key], st_ = s.c || s.done ? (r.ok.includes(pick) ? "right" : "wrong") : "";
        return `<div class="dline who ${st_}"><q>${esc(r.q)}</q><select data-act-change="gameSel" data-id="${id}" data-key="${esc(r.key)}" ${s.done ? "disabled" : ""} aria-label="${t.multi ? "Автор" : "Досие"}"><option value="">…</option>${r.choices.map((x) => `<option value="${esc(x.v)}" ${pick === x.v ? "selected" : ""}>${esc(x.t)}</option>`).join("")}</select></div>`;
      }).join("")}</div></section>`;
    });
    h += s.done ? `<p class="okbox">Всичко е вярно. Отличен преговор!</p>` : `<div class="row"><button class="btn" data-act="gameReview" data-id="${id}">Провери</button></div>${s.c ? `<p class="small muted">Поправи червените и провери пак.</p>` : ""}`;
    if (s.done && rv.more) {
      h += `<section class="dtask bonus"><p><b>${esc(rv.more.q)}</b></p><textarea class="field dthink" data-more="${id}" rows="3" aria-label="Твоят отговор">${esc(s.moreT || rv.more.start || "")}</textarea><p class="small muted">Тук няма грешен отговор – пиши със свои думи.</p></section>`;
    }
    app.innerHTML = h;
  }

  function finalView() {
    const f = D().final;
    view = { kind: "final", id: "final" };
    const all = D().dossiers.length, n = solvedCount(), L = letters();
    let h = top("gameHome", f.title || "Финал");
    h += `<section class="dhero"><div class="dh-hero">${pic("g-key", "fin-key", "", true)}</div><h1>${esc(f.title || "Финал")}</h1><p class="lead">Пет въпроса за последния ключ. Буквите на верните отговори дават последната буква на посланието – можеш да проверяваш в досиетата.</p></section>`;
    h += `<section class="dtask">${quizHtml("final", f.quiz, f.code, f.take, f.field)}</section>`;
    const full = Object.keys(L).length === D().message.fields;
    h += `<section class="dpanel"><h3>Тайното послание</h3>${board()}
      ${full ? `<p class="okbox">Посланието е разкрито: <b>${esc(D().message.text)}</b></p>` : `<p class="small muted">Разкрити досиета: ${n} от ${all}. Празните полета се попълват, когато разкриеш досието им.</p>`}</section>`;
    if (full) {
      for (const [i, q] of (f.after || []).entries()) {
        const s = st("final"), shown = (s.after || {})[i];
        h += `<section class="dtask bonus"><p><b>${esc(q.q)}</b>${q.optional ? ` <span class="small muted">(по желание)</span>` : ""}</p><textarea class="field dthink" data-after="${i}" rows="3" aria-label="Твоят отговор">${esc(((s.afterT || {})[i]) || q.start || "")}</textarea>
          ${shown && q.sample ? `<div class="fb ok"><b class="t">Един добър отговор</b><span>${esc(q.sample)}</span><span class="small muted">Сравни смисъла, не точните думи.</span></div>` : q.sample ? `<button class="btn line" data-act="gameAfter" data-i="${i}">Покажи примерен отговор</button>` : `<p class="small muted">Тук няма грешен отговор – пиши със свои думи.</p>`}</section>`;
      }
      if (solved("final") && n === all) {
        h += `<section class="diploma"><span class="eyebrow">Бюро за литературни разследвания</span><h2>Диплома</h2><p>присъжда се на</p><p class="dname">${esc(S.name.trim() || "детектива")}</p>
          <p>за разкриването на ${all}-те досиета и тайното послание</p><p class="drank">Главен инспектор по литература</p><p class="small muted">${fmtDate(Date.now())}</p></section>`;
      }
    }
    app.innerHTML = h;
  }

  function show(id) {
    if (id === "final") return finalView();
    if ((D().reviews || []).some((x) => x.id === id)) return reviewView(id);
    dossierView(id);
  }
  function open(id) {
    sel = null;
    show(id);
    window.scrollTo(0, 0);
  }
  // Redraw the same screen in place (keeps the first tapped grid cell and the scroll position).
  function rerender(anchor) {
    const y = window.scrollY;
    show(view.id);
    window.scrollTo(0, y);
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: "nearest" });
  }

  // Two taps: the first and the last letter of a word, in one of the allowed directions (either order).
  function tapCell(r, c) {
    const d = dossier(view.id);
    if (!sel) { sel = [r, c]; return rerender(); }
    const [r0, c0] = sel;
    sel = null;
    if (r0 === r && c0 === c) return rerender();
    const path = (a, b) => {
      const dr = Math.sign(b[0] - a[0]), dc = Math.sign(b[1] - a[1]);
      const len = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      if ((b[0] - a[0]) !== dr * len || (b[1] - a[1]) !== dc * len) return null;
      if (!DIRS.some(([x, y]) => x === dr && y === dc)) return null;
      return Array.from({ length: len + 1 }, (_, i) => [a[0] + dr * i, a[1] + dc * i]);
    };
    const p = path([r0, c0], [r, c]) || path([r, c], [r0, c0]);
    const s = st(d.id), f = new Set(s.t1 || []);
    const hit = p && d.words.find((w) => !f.has(w.w) && w.cells.length === p.length && w.cells.every(([x, y], i) => x === p[i][0] && y === p[i][1]));
    if (hit) {
      s.t1 = [...f, hit.w];
      save();
      FX.found();
      rerender("t1");
      const m = document.getElementById("gridMsg");
      if (m) m.textContent = `Намери „${hit.w}“!${hit.star ? "" : " (бонус дума)"}`;
    } else {
      rerender("t1");
      const m = document.getElementById("gridMsg");
      if (m) m.textContent = p ? "Тук няма дума от списъка. Опитай пак." : "Думите вървят по права линия: → ↓ ↘ ↗.";
    }
  }

  const ACT = {
    gameHome: () => home(),
    gameOpen: (b) => open(b.dataset.id),
    gameHero: (b) => open(b.dataset.id),
    gameCell: (b) => tapCell(+b.dataset.r, +b.dataset.c),
    gameHint: () => {
      const d = dossier(view.id), s = st(d.id), f = new Set(s.t1 || []);
      const w = d.words.find((x) => x.star && !f.has(x.w));
      if (!w) return;
      s.t1 = [...f, w.w];
      s.hints = (s.hints || 0) + 1;
      save();
      rerender("t1");
    },
    gameClue: (b) => {
      const d = dossier(view.id), s = st(d.id);
      s.t2 = { ...(s.t2 || {}), [b.dataset.i]: b.dataset.w };
      save();
      rerender("t2");
    },
    gameAns: (b) => {
      const s = st(b.dataset.id);
      s.t3 = s.t3 || [];
      s.t3[+b.dataset.i] = +b.dataset.k;
      s.t3c = false;
      save();
      rerender("t3");
    },
    gameCheck: (b) => {
      const id = b.dataset.id, s = st(id), quiz = id === "final" ? D().final.quiz : dossier(id).quiz;
      const ok = quiz.every((q, i) => s.t3 && s.t3[i] === q.a);
      if (ok) s.done = Date.now();
      else s.t3c = true;
      save();
      if (ok && ONLINE) Online.syncNow();
      if (ok && id === "final") FX.win(true);
      else if (ok) { FX.stamp(); setTimeout(() => FX.reveal(), 380); Voice.say("dos", 1500); }
      else FX.wrong();
      if (id === "final") return rerender();
      rerender("t3");
      if (ok) {
        const z = document.getElementById("t3"), d = dossier(id);
        if (z && d) z.insertAdjacentHTML("beforeend", `<div class="unlock" role="status"><span class="eyebrow">Нов герой в колекцията</span>${heroCard(d, true)}</div>`);
      }
    },
    gameMove: (b) => {
      const s = st(b.dataset.id), k = +b.dataset.k, j = k + +b.dataset.d;
      [s.b4o[k], s.b4o[j]] = [s.b4o[j], s.b4o[k]];
      s.b4c = false;
      save();
      rerender("t4");
    },
    gamePick: (b) => {
      const s = st(b.dataset.id);
      s.b4a = { ...(s.b4a || {}), [b.dataset.key]: +b.dataset.v };
      s.b4c = false;
      save();
      rerender("t4");
    },
    gameBonus: (b) => {
      const d = dossier(b.dataset.id), s = st(d.id), x = d.bonus4, a = s.b4a || {};
      let ok = false;
      if (x.type === "order") ok = (s.b4o || []).every((k, i) => k === i);
      else if (x.type === "groups") ok = x.groups.every((g, gi) => g.items.every((w) => a[w] === gi));
      else ok = x.lines.every((l, i) => a[i] === l.a);
      if (ok) s.b4 = Date.now();
      else s.b4c = true;
      save();
      if (ok) FX.right(); else FX.wrong();
      rerender("t4");
    },
    gameThink: (b) => {
      const s = st(b.dataset.id);
      s.b5t = (document.getElementById("b5in")?.value || "").slice(0, 1000);
      s.b5 = Date.now();
      save();
      FX.right();
      rerender("t5");
    },
    gameAfter: (b) => {
      const s = st("final");
      s.after = { ...(s.after || {}), [b.dataset.i]: true };
      save();
      rerender();
    },
    gameReview: (b) => {
      const id = b.dataset.id, rv = D().reviews.find((x) => x.id === id), s = st(id), a = s.a || {};
      const ok = rv.tasks.every((t, ti) => reviewRows(rv, t, ti).every((r) => r.ok.includes(a[r.key])));
      if (ok) s.done = Date.now();
      else s.c = true;
      save();
      if (ok) FX.win(false); else FX.wrong();
      rerender();
    },
    gameResetAsk: () => confirmBox("gameZone", "Да изтрия ли напредъка в играта? Оценките в бележника остават.", "gameReset", "Започни отначало"),
    gameReset: () => { S.dos = {}; save(); if (ONLINE) Online.soon(); home(); },
  };
  app.addEventListener("change", (e) => {
    const el = e.target.closest("[data-act-change='gameSel']");
    if (!el || !view) return;
    const s = st(el.dataset.id);
    if (view.kind === "review") { s.a = { ...(s.a || {}), [el.dataset.key]: el.value }; s.c = false; }
    else { s.b4a = { ...(s.b4a || {}), [el.dataset.key]: el.value }; s.b4c = false; }
    save();
  });
  app.addEventListener("input", (e) => {
    if (!view) return;
    const el = e.target, v = el.value.slice(0, 1000);
    if (el.id === "b5in") { st(view.id).b5t = v; save(); }
    else if (el.dataset.more) { st(el.dataset.more).moreT = v; save(); }
    else if (el.dataset.after != null) { const s = st("final"); s.afterT = { ...(s.afterT || {}), [el.dataset.after]: v }; save(); }
  });

  const has = () => !!BANK.dossiers;
  return {
    card, home, act: (b, e) => { const f = ACT[b.dataset.act]; if (f) { f(b, e); return true; } return false; }, leave: () => { view = null; },
    solvedN: () => (has() ? solvedCount() : 0),
    finished: () => has() && solved("final") && solvedCount() === D().dossiers.length,
    unlocked: (id) => has() && solved(id),
  };
})();

if (EMBED) {
  setBank(EMBED);
  S = loadLocal();
  home();
} else {
  Online.boot();
}
