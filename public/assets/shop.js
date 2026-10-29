// Card shop pages: scroll effects, the 3D card stage, flip cards, gallery, topic filter and the order form.
// The same code also runs inside a ConvertBuilder code block (see scripts/build-landing.mjs): then
// window.EB_LANDING holds the settings and ConvertBuilder's own checkout takes the orders.
import { PACKAGES, SHIPPING, UPSELL, euro, shipPrice } from "/assets/shop-catalog.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(pointer: fine)").matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CB = window.EB_LANDING || null;
const shell = document.getElementById("ebl");
let noSticky = false;
if (CB && shell) {
  for (const [k, v] of Object.entries(CB.prices || {})) if (PACKAGES[k] && v > 0) PACKAGES[k].price = Math.round(v * 100);
  PACKAGES["lit-2"].was = 2 * PACKAGES["lit-1"].price;
  PACKAGES["ezik-2"].was = 2 * PACKAGES["ezik-1"].price;
  PACKAGES.duo.was = PACKAGES["lit-1"].price + PACKAGES["ezik-1"].price;
  if (CB.prices?.upsell > 0) UPSELL.price = Math.round(CB.prices.upsell * 100);
  UPSELL.was = PACKAGES["lit-1"].price;
  for (const a of $$("[data-link]", shell)) if (CB.links?.[a.dataset.link]) a.href = CB.links[a.dataset.link];
  // Fixed bars and the lightbox go straight under <body>: a builder wrapper with a transform would pin them to itself.
  const fixed = document.createElement("div");
  fixed.id = "ebf";
  fixed.className = "js";
  fixed.dataset.deck = shell.dataset.deck;
  for (const el of $$(".progress, .nav, .buybar, #lightbox", shell)) fixed.appendChild(el);
  document.body.appendChild(fixed);
  // position: sticky needs every ancestor to let overflow through; otherwise the deck opens as it scrolls into view.
  for (let el = shell.parentElement; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (![cs.overflowX, cs.overflowY].every((o) => o === "visible" || o === "clip")) noSticky = true;
  }
  shell.classList.toggle("no-sticky", noSticky);
}

// Prices on the page always come from the catalog ("upsell" is the offer after an order).
const priceOf = (k) => (k === "upsell" ? UPSELL : PACKAGES[k]);
for (const el of $$("[data-price]")) {
  const p = priceOf(el.dataset.price);
  if (p) el.textContent = euro(p.price);
}
for (const el of $$("[data-was]")) {
  const p = priceOf(el.dataset.was);
  if (p?.was) el.textContent = euro(p.was);
}
for (const el of $$("[data-save]")) {
  const p = priceOf(el.dataset.save);
  if (p?.was) el.textContent = euro(p.was - p.price);
}

/* ---------- one scroll loop for nav, progress bar, hero parallax, the deck stage and the steps ---------- */
const nav = $(".nav");
const bar = $(".progress");
const hero = $(".hero");
const decks = $$(".deck-scroll");
const steps = $(".steps");
const buybar = $(".buybar");
const orderSec = $("#porachka");
const darks = $$("[data-dark]");
let lastY = scrollY;
let ticking = false;

function progressOf(el) {
  const r = el.getBoundingClientRect();
  if (noSticky) return clamp((innerHeight - r.top) / (innerHeight * 0.95));
  return clamp(-r.top / Math.max(1, r.height - innerHeight));
}

function frame() {
  ticking = false;
  const y = scrollY;
  const max = document.documentElement.scrollHeight - innerHeight;
  if (bar) bar.style.setProperty("--p", (y / Math.max(1, max)).toFixed(4));
  if (nav) {
    nav.classList.toggle("scrolled", y > 24);
    nav.classList.toggle("hide", y > 500 && y > lastY + 4 && !document.activeElement?.closest?.(".nav"));
    if (y < lastY - 4) nav.classList.remove("hide");
    // light text while a dark block is under the bar
    const mid = nav.offsetHeight / 2;
    nav.classList.toggle("on-dark", darks.some((d) => { const r = d.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; }));
  }
  if (hero && !reduce) {
    const h = hero.offsetHeight;
    if (y < h) hero.style.setProperty("--hp", (y / h).toFixed(3));
  }
  for (const d of decks) {
    const p = reduce ? 1 : progressOf(d);
    // ease-out so the fan opens quickly and settles slowly
    const eased = 1 - Math.pow(1 - clamp(p / 0.8), 3);
    d.firstElementChild.style.setProperty("--p", eased.toFixed(4));
  }
  if (steps) {
    const r = steps.getBoundingClientRect();
    steps.style.setProperty("--sp", clamp((innerHeight * 0.8 - r.top) / (r.height + innerHeight * 0.3)).toFixed(3));
  }
  if (buybar) {
    const pastHero = hero ? hero.getBoundingClientRect().bottom < 0 : y > 600;
    const atOrder = orderSec ? orderSec.getBoundingClientRect().top < innerHeight && orderSec.getBoundingClientRect().bottom > 0 : false;
    buybar.classList.toggle("show", pastHero && !atOrder);
  }
  lastY = y;
}
const onScroll = () => {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(frame);
  }
};
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll);
frame();

/* ---------- headings come in word by word: wrap each word, keep the inner spans and their styles ---------- */
if (!reduce) {
  for (const h of $$(".h2[data-reveal]")) {
    let w = 0;
    const walk = (node) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const part of n.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) frag.append(part);
            else {
              const sp = document.createElement("span");
              sp.className = "wd";
              sp.style.setProperty("--w", w++);
              sp.textContent = part;
              frag.append(sp);
            }
          }
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(h);
    h.classList.add("words");
  }
}

/* ---------- reveal on scroll, counters, step dots ---------- */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      if (e.target.hasAttribute("data-count")) countUp(e.target);
      io.unobserve(e.target);
    }
  },
  { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
);
$$("[data-reveal], [data-count], .step, .plan").forEach((el) => io.observe(el));

function countUp(el) {
  const to = Number(el.dataset.count);
  if (reduce || !to) return void (el.textContent = to);
  const t0 = performance.now();
  const dur = 1400;
  const tick = (t) => {
    const k = clamp((t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 4)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- videos: load near the viewport, play only while visible ---------- */
const vio = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) {
        if (v.dataset.src && !v.src) {
          v.src = v.dataset.src;
          v.load();
        }
        if (!reduce) v.play().catch(() => {});
      } else v.pause();
    }
  },
  { rootMargin: "200px 0px" },
);
$$("video[data-src]").forEach((v) => {
  v.muted = true;
  if (reduce) v.removeAttribute("autoplay");
  vio.observe(v);
});

/* ---------- pointer effects: spotlight tiles, magnetic buttons, stage tilt, card shine ---------- */
if (fine && !reduce) {
  for (const el of $$(".tile, .reason, .deck-card")) {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  }
  for (const b of $$(".magnetic")) {
    b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
    });
    b.addEventListener("pointerleave", () => (b.style.transform = ""));
  }
  const prod = $(".hero-product");
  if (hero && prod) {
    hero.addEventListener("pointermove", (e) => {
      prod.style.setProperty("--px", `${(e.clientX / innerWidth - 0.5) * -24}px`);
      prod.style.setProperty("--py", `${(e.clientY / innerHeight - 0.5) * -16}px`);
    });
  }
  for (const s of $$(".stage")) {
    const inner = $(".stage-inner", s);
    s.addEventListener("pointermove", (e) => {
      const r = s.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      inner.style.setProperty("--ry", `${x * 14}deg`);
      inner.style.setProperty("--rx", `${-y * 10}deg`);
    });
    s.addEventListener("pointerleave", () => {
      inner.style.setProperty("--ry", "0deg");
      inner.style.setProperty("--rx", "0deg");
    });
  }
  document.addEventListener("pointermove", (e) => {
    const f = e.target.closest?.(".flip");
    if (!f) return;
    const r = f.getBoundingClientRect();
    const k = (e.clientX - r.left) / r.width;
    f.style.setProperty("--shine", `${(k * 2 - 1) * 110}%`);
  });
}

/* ---------- home page: the two boxes on the 3D stage follow the pointer ---------- */
const duoStage = $(".duo-stage");
if (duoStage && fine && !reduce) {
  const host = duoStage.closest(".hero") || duoStage;
  host.addEventListener("pointermove", (e) => {
    duoStage.style.setProperty("--px", ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
    duoStage.style.setProperty("--py", ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
  });
  host.addEventListener("pointerleave", () => {
    duoStage.style.setProperty("--px", "0");
    duoStage.style.setProperty("--py", "0");
  });
}

/* ---------- home page: a living gradient with gold sparkles behind the dark blocks (WebGL) ---------- */
const AURORA_FS = `precision mediump float;
uniform vec2 r;uniform float t;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float b(vec2 p,vec2 c,float s){vec2 d=p-c;return exp(-dot(d,d)/s);}
void main(){
  vec2 uv=gl_FragCoord.xy/r;float a=r.x/r.y;vec2 p=vec2(uv.x*a,uv.y);
  float m=mix(.5,1.,smoothstep(.6,1.5,a));float z=min(a,1.);
  vec3 col=vec3(.024,.062,.045);
  col+=m*vec3(.12,.38,.27)*b(p,vec2(a*(.2+.1*sin(t*.11)),.66+.1*cos(t*.13)),.13*z);
  col+=m*vec3(.6,.22,.06)*b(p,vec2(a*(.82+.08*cos(t*.09)),.28+.12*sin(t*.12)),.1*z);
  col+=m*vec3(.36,.27,.09)*b(p,vec2(a*(.56+.16*sin(t*.07+1.)),.9+.05*sin(t*.15+2.)),.05*z);
  vec2 g=gl_FragCoord.xy/26.;vec2 id=floor(g);vec2 f=fract(g)-.5;float k=h(id);
  vec2 o=vec2(h(id+3.1),h(id+7.7))-.5;
  float s=smoothstep(.972,1.,k)*(.5+.5*sin(t*1.7+k*80.))*smoothstep(.2,0.,length(f-o*.6));
  col+=vec3(1.,.84,.5)*s*.9;
  col*=mix(.55,1.,smoothstep(1.35,.15,length((uv-.5)*vec2(a,1.))));
  gl_FragColor=vec4(col,1.);
}`;
function aurora(canvas) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" });
  if (!gl) return void canvas.remove();
  const shader = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, AURORA_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return void canvas.remove();
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(prog, "r");
  const uT = gl.getUniformLocation(prog, "t");
  // drawn at about half the screen resolution: the gradient is soft anyway, and phones stay cool
  const scale = Math.min(1, devicePixelRatio) * 0.6;
  let raf = 0, visible = false, last = 0;
  const t0 = performance.now() - 20000 * Math.random();
  const size = () => {
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  const draw = (now) => {
    raf = 0;
    if (!visible) return;
    if (now - last > 30) {
      last = now;
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    if (!reduce) raf = requestAnimationFrame(draw);
  };
  const wake = () => { if (visible && !raf) raf = requestAnimationFrame(draw); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(canvas);
  new ResizeObserver(() => { size(); last = 0; wake(); }).observe(canvas);
}
$$("canvas[data-aurora]").forEach(aurora);

/* ---------- home page: wall of real cards; a click opens the card in the lightbox ---------- */
for (const wall of $$("[data-wall]")) {
  const cards = $$(".wall-card", wall);
  // a second copy of each row makes the endless loop; the copies are only for the eye
  for (const track of $$(".marquee-track", wall)) {
    for (const c of [...track.children]) {
      const k = c.cloneNode(true);
      k.setAttribute("aria-hidden", "true");
      k.tabIndex = -1;
      track.append(k);
    }
  }
  wall.addEventListener("click", (e) => {
    const c = e.target.closest(".wall-card");
    if (!c) return;
    const i = cards.findIndex((x) => x.dataset.front === c.dataset.front);
    openLightbox(cards, Math.max(0, i));
  });
}

/* ---------- home page: which deck fits the child; the answer morphs with a view transition ---------- */
const PICKS = {
  lit: { title: "Карти по литература", desc: "22-те творби за НВО в 40 карти: резюме, герои, цитати, образи и въпроси за самопроверка.", pkg: "lit-1", c: "#1E5A42" },
  ezik: { title: "Карти по български език", desc: "20 карти с правила и 20 с упражнения: граматика, правопис и пунктуация – тема по тема.", pkg: "ezik-1", c: "#E0561D" },
  duo: { title: "Двете тестета заедно", desc: "80 карти за цялата подготовка по БЕЛ – литература и български език, с безплатна доставка.", pkg: "duo", c: "#D8B25C" },
};
for (const ch of $$("[data-chooser]")) {
  const btns = $$("button[data-pick]", ch);
  ["ch-boxes", "ch-title", "ch-desc", "ch-cta"].forEach((cls, i) => {
    const el = $(`.${cls}`, ch);
    if (el) el.style.viewTransitionName = `eb-pick-${i}`;
  });
  const pick = (k) => {
    const p = PICKS[k];
    ch.dataset.pick = k;
    ch.style.setProperty("--pick-c", p.c);
    for (const b of btns) b.setAttribute("aria-pressed", String(b.dataset.pick === k));
    $(".ch-title", ch).textContent = p.title;
    $(".ch-desc", ch).textContent = p.desc;
    const price = $(".ch-price", ch);
    price.dataset.price = p.pkg;
    price.textContent = euro(PACKAGES[p.pkg].price);
    $(".ch-go", ch).dataset.pkg = p.pkg;
  };
  for (const b of btns) {
    b.addEventListener("click", () => {
      if (document.startViewTransition && !reduce) document.startViewTransition(() => pick(b.dataset.pick));
      else pick(b.dataset.pick);
    });
  }
  pick("duo");
}

/* ---------- upsell page: our buttons press the builder's upsell button placed under the block ---------- */
let upsellPressed = false;
for (const b of $$("[data-upsell]")) {
  b.addEventListener("click", (e) => {
    const real = document.querySelector(b.dataset.upsell === "yes" ? ".upsell-positive-action" : ".upsell-negative-action");
    if (!real) return; // no builder button on the page: the link scrolls to its place under the block
    e.preventDefault();
    if (upsellPressed) return; // one tap adds the cards once
    upsellPressed = true;
    setTimeout(() => (upsellPressed = false), 4000);
    real.click();
  });
}

/* ---------- flip cards ---------- */
document.addEventListener("click", (e) => {
  const f = e.target.closest(".flip");
  if (!f || f.hasAttribute("data-single") || f.disabled || f.closest(".rail.dragging")) return;
  f.classList.toggle("flipped");
  f.setAttribute("aria-pressed", f.classList.contains("flipped"));
  const ana = f.closest(".anatomy");
  if (ana) setSide(ana, f.classList.contains("flipped") ? "back" : "front");
  const box = f.closest(".lightbox");
  if (box) for (const b of $$(".lb-side button", box)) b.setAttribute("aria-pressed", String((b.dataset.side === "back") === f.classList.contains("flipped")));
});

/* ---------- anatomy: front/back switch and numbered parts linked to the dots on the card ---------- */
function setSide(ana, side) {
  const back = side === "back";
  ana.classList.toggle("is-back", back);
  $(".anatomy-card", ana).classList.toggle("is-back", back);
  const f = $(".flip", ana);
  f.classList.toggle("flipped", back);
  f.setAttribute("aria-pressed", back);
  for (const b of $$(".side-switch button", ana)) b.setAttribute("aria-pressed", String(b.dataset.side === side));
}
for (const ana of $$(".anatomy")) {
  for (const b of $$(".side-switch button", ana)) b.addEventListener("click", () => setSide(ana, b.dataset.side));
  const light = (n, on) => {
    for (const el of $$(`[data-part="${n}"]`, ana)) el.classList.toggle("on", on);
  };
  for (const el of $$("[data-part]", ana)) {
    el.addEventListener("pointerenter", () => light(el.dataset.part, true));
    el.addEventListener("pointerleave", () => light(el.dataset.part, false));
    el.addEventListener("focus", () => light(el.dataset.part, true));
    el.addEventListener("blur", () => light(el.dataset.part, false));
  }
  for (const h of $$(".hotspot", ana)) {
    h.addEventListener("click", (e) => {
      e.stopPropagation();
      const li = $(`li[data-part="${h.dataset.part}"]`, ana);
      $$(".parts li.on", ana).forEach((x) => x.classList.remove("on"));
      $$(".hotspot.on", ana).forEach((x) => x.classList.remove("on"));
      li?.classList.add("on");
      h.classList.add("on");
      li?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    });
  }
}

/* ---------- two kinds of cards side by side: the switch shows one anatomy at a time ---------- */
for (const box of $$("[data-kinds]")) {
  const btns = $$(".kind-switch button", box);
  for (const b of btns) {
    b.addEventListener("click", () => {
      for (const x of btns) x.setAttribute("aria-pressed", String(x === b));
      for (const ana of $$(".anatomy[data-kind]", box)) {
        ana.hidden = ana.dataset.kind !== b.dataset.kind;
        if (!ana.hidden) $$("[data-reveal]", ana).forEach((el) => el.classList.add("in"));
      }
    });
  }
}

/* ---------- gallery rail: arrows, mouse drag, lightbox ---------- */
for (const wrap of $$("[data-gallery]")) {
  const rail = $(".rail", wrap);
  const step = () => ($(".rail-item", rail)?.getBoundingClientRect().width || 300) + 24;
  $(".rail-prev", wrap)?.addEventListener("click", () => rail.scrollBy({ left: -step(), behavior: "smooth" }));
  $(".rail-next", wrap)?.addEventListener("click", () => rail.scrollBy({ left: step(), behavior: "smooth" }));
  if (fine) {
    let x0 = 0, s0 = 0, down = false, moved = false;
    rail.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button.zoom-btn")) return;
      down = true; moved = false; x0 = e.clientX; s0 = rail.scrollLeft;
    });
    addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 6) { moved = true; rail.classList.add("dragging"); }
      if (moved) rail.scrollLeft = s0 - dx;
    });
    addEventListener("pointerup", () => {
      if (!down) return;
      down = false;
      // keep .dragging for this click so the card under the cursor does not flip
      setTimeout(() => rail.classList.remove("dragging"), 0);
    });
  }
  const items = $$(".rail-item", rail);
  for (const [i, it] of items.entries()) $(".zoom-btn", it)?.addEventListener("click", () => openLightbox(items, i));
}

const lb = $("#lightbox");
let lbItems = [], lbIndex = 0;
function renderLightbox() {
  const it = lbItems[lbIndex];
  const flip = $(".flip", lb);
  $(".lb-title", lb).innerHTML = `${esc(it.dataset.title)}<small>${esc(it.dataset.sub || "")}</small>`;
  $(".lb-count", lb).textContent = `${lbIndex + 1} / ${lbItems.length}`;
  $(".flip-face.front img", lb).src = it.dataset.front;
  $(".flip-face.front img", lb).alt = `${it.dataset.title} – лице`;
  const hasBack = Boolean(it.dataset.back);
  $(".flip-face.back img", lb).src = it.dataset.back || it.dataset.front;
  $(".flip-face.back img", lb).alt = `${it.dataset.title} – гръб`;
  flip.style.setProperty("--ar", it.dataset.ar || "10/14");
  flip.classList.remove("flipped");
  $(".lb-side", lb).hidden = !hasBack;
  flip.disabled = !hasBack;
  for (const b of $$(".lb-side button", lb)) b.setAttribute("aria-pressed", String(b.dataset.side === "front"));
}
function openLightbox(items, i) {
  if (!lb) return;
  lbItems = items;
  lbIndex = i;
  renderLightbox();
  lb.showModal();
}
if (lb) {
  const go = (d) => { lbIndex = (lbIndex + d + lbItems.length) % lbItems.length; renderLightbox(); };
  $(".lb-prev", lb).addEventListener("click", () => go(-1));
  $(".lb-next", lb).addEventListener("click", () => go(1));
  $(".lb-close", lb).addEventListener("click", () => lb.close());
  for (const b of $$(".lb-side button", lb)) {
    b.addEventListener("click", () => {
      $(".flip", lb).classList.toggle("flipped", b.dataset.side === "back");
      for (const x of $$(".lb-side button", lb)) x.setAttribute("aria-pressed", String(x === b));
    });
  }
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target.classList.contains("lb-stage")) lb.close(); });
  let sx = null;
  lb.addEventListener("pointerdown", (e) => (sx = e.clientX));
  lb.addEventListener("pointerup", (e) => {
    if (sx !== null && Math.abs(e.clientX - sx) > 60 && e.pointerType !== "mouse") go(e.clientX < sx ? 1 : -1);
    sx = null;
  });
}

/* ---------- topic filter ---------- */
for (const box of $$("[data-topics]")) {
  const chips = $$(".chip", box);
  const items = $$(".topic", box);
  items.forEach((t, i) => (t.style.viewTransitionName = `topic-${i}`));
  for (const c of chips) {
    c.addEventListener("click", () => {
      const apply = () => {
        for (const x of chips) x.setAttribute("aria-pressed", String(x === c));
        for (const t of items) t.classList.toggle("hide", c.dataset.area !== "all" && t.dataset.area !== c.dataset.area);
      };
      if (document.startViewTransition && !reduce) document.startViewTransition(apply);
      else apply();
    });
  }
}

/* ---------- order form ---------- */
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function orderMarkup(root) {
  const packs = root.dataset.packs.split(",");
  const flags = JSON.parse(root.dataset.flags || "{}");
  const def = root.dataset.default || packs[0];
  const packHtml = packs
    .map((k) => {
      const p = PACKAGES[k];
      const save = p.was ? `<span class="save">спестяваш ${euro(p.was - p.price)}</span>` : "";
      return `<label class="pack">
        ${flags[k] ? `<span class="flag">${esc(flags[k])}</span>` : ""}
        <input type="radio" name="package" value="${k}" ${k === def ? "checked" : ""}>
        <span class="radio" aria-hidden="true"></span>
        ${boxesHtml(root, p)}
        <span><b>${esc(p.title)}</b>${hasHtml(p)}${save}</span>
        <span class="price">${p.was ? `<s>${euro(p.was)}</s>` : ""}${euro(p.price)}</span>
      </label>`;
    })
    .join("");
  const shipHtml = Object.entries(SHIPPING)
    .map(([k, s], i) => `<label><input type="radio" name="shipping" value="${k}" ${i === 0 ? "checked" : ""}>${esc(s.title)}<small>${euro(s.price)}</small></label>`)
    .join("");
  root.innerHTML = `
  <div>
    <fieldset class="packs" style="border:0;margin:0;padding:0">
      <legend class="sr">Комплект</legend>
      ${packHtml}
    </fieldset>
    <div class="perks">
      <div class="perk">${ICON_PERK.cash}<span>Плащаш при получаване – наложен платеж</span></div>
      <div class="perk">${ICON_PERK.eye}<span>Преглед на пратката преди плащане</span></div>
      <div class="perk">${ICON_PERK.truck}<span>Изпращаме до 1–2 работни дни</span></div>
      <div class="perk">${ICON_PERK.size}<span>Карти 10 × 14 см в здрава кутия</span></div>
    </div>
  </div>
  <form class="form" novalidate>
    <div class="form-body">
      <h3>Данни за доставка</h3>
      <p class="hint">Без регистрация и без плащане онлайн. Отнема 30 секунди.</p>
      <p class="form-error" role="alert" hidden></p>
      <span class="legend">Доставка</span>
      <div class="ship" role="radiogroup" aria-label="Доставка">${shipHtml}</div>
      <div class="fields">
        <div class="field full"><label for="o-name">Име и фамилия</label><input id="o-name" name="name" autocomplete="name" required maxlength="80"><span class="err"></span></div>
        <div class="field"><label for="o-phone">Телефон</label><input id="o-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0888 123 456" required maxlength="30"><span class="err"></span></div>
        <div class="field"><label for="o-city">Населено място</label><input id="o-city" name="city" autocomplete="address-level2" required maxlength="60"><span class="err"></span></div>
        <div class="field full"><label for="o-place" data-office="Офис на куриера" data-address="Адрес (улица, номер, вход, етаж)">Офис на куриера</label><input id="o-place" name="place" required maxlength="160" placeholder="напр. офис „Център“"><span class="err"></span></div>
        <div class="field full"><label for="o-note">Бележка <span class="muted">(по желание)</span></label><textarea id="o-note" name="note" maxlength="500"></textarea></div>
      </div>
      <div class="hp" aria-hidden="true"><label>Фирма<input name="company" tabindex="-1" autocomplete="off"></label></div>
      <div class="summary" aria-live="polite">
        <div><span class="s-title"></span><b class="s-price"></b></div>
        <div><span>Доставка</span><b class="s-ship"></b></div>
        <div class="total"><span>Общо при получаване</span><span class="s-total"></span></div>
      </div>
      <button class="btn btn-primary magnetic" type="submit">Поръчай с наложен платеж <span class="arrow">→</span></button>
      <p class="small">С поръчката се съгласяваш данните ти да се използват само за доставката. <a href="/usloviya/">Условия и поверителност</a></p>
    </div>
    <div class="done" hidden>
      <div class="tick">${ICON_CHECK}</div>
      <h3>Поръчката е приета!</h3>
      <p class="done-no"></p>
      <p>Ще изпратим картите до 1–2 работни дни. Плащаш при получаване, след като прегледаш пратката.</p>
    </div>
  </form>`;
}

const ICON_PERK = {
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  size: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="11" height="15" rx="1.8"/><path d="M8 21h11V7"/></svg>',
};

// The boxes a package contains, overlapped like a product photo. The media folder comes from the
// order block (data-media), so the same code works on our site and inside the builder.
const BOX = { lit: ["kutiya-literatura.webp", "Кутия с карти по литература"], ezik: ["kutiya-ezik.webp", "Кутия с карти по български език"] };
function boxesHtml(root, p) {
  const base = root.dataset.media || "/karti-nvo/media/";
  const n = p.boxes.length;
  return `<span class="pack-boxes n${n}${new Set(p.boxes).size > 1 ? " mixed" : ""}" aria-hidden="true">${p.boxes
    .map((b, i) => `<img class="b${i}" src="${esc(base + BOX[b][0])}" alt="" loading="lazy">`)
    .join("")}${n > 1 && new Set(p.boxes).size === 1 ? `<span class="times">×${n}</span>` : ""}</span>`;
}
const hasHtml = (p) =>
  `<ul class="pack-has">${p.has.map((h) => `<li>${esc(h)}</li>`).join("")}${p.freeShip ? '<li class="free">Безплатна доставка</li>' : ""}</ul>`;

function packCards(root) {
  const flags = JSON.parse(root.dataset.flags || "{}");
  const href = esc(CB.order || "#porachka-forma");
  root.className = "packs-cb";
  root.innerHTML = root.dataset.packs
    .split(",")
    .map((k) => {
      const p = PACKAGES[k];
      const was = p.was ? Math.max(p.was, p.price) : 0;
      return `<a class="pack-card${k === "duo" ? " best" : ""}" href="${href}">
        ${flags[k] ? `<span class="flag">${esc(flags[k])}</span>` : ""}
        ${boxesHtml(root, p)}
        <b>${esc(p.title)}</b>${hasHtml(p)}
        <span class="price">${was > p.price ? `<s>${euro(was)}</s>` : ""}${euro(p.price)}</span>
        ${was > p.price ? `<span class="save">спестяваш ${euro(was - p.price)}</span>` : ""}
        <span class="go">Поръчай <span aria-hidden="true">→</span></span>
      </a>`;
    })
    .join("");
  root.insertAdjacentHTML(
    "afterend",
    `<div class="perks perks-cb">
      <div class="perk">${ICON_PERK.cash}<span>Плащаш при получаване – наложен платеж</span></div>
      <div class="perk">${ICON_PERK.eye}<span>Преглед на пратката преди плащане</span></div>
      <div class="perk">${ICON_PERK.truck}<span>Изпращаме до 1–2 работни дни</span></div>
      <div class="perk">${ICON_PERK.size}<span>Карти 10 × 14 см в здрава кутия</span></div>
    </div>`,
  );
}

for (const root of $$("[data-order]")) {
  if (CB) {
    packCards(root);
    continue;
  }
  orderMarkup(root);
  const form = $("form", root);
  const place = $("#o-place", form);
  const placeLabel = $('label[for="o-place"]', form);
  const err = $(".form-error", form);
  const pick = (name) => $(`input[name="${name}"]:checked`, root)?.value;

  function update() {
    const p = PACKAGES[pick("package")];
    const s = SHIPPING[pick("shipping")];
    $(".s-title", form).textContent = p.title;
    $(".s-price", form).textContent = euro(p.price);
    const free = (cost) => (cost ? euro(cost) : "безплатно");
    for (const r of $$('input[name="shipping"]', root)) $("small", r.parentElement).textContent = free(shipPrice(p, SHIPPING[r.value]));
    $(".s-ship", form).textContent = free(shipPrice(p, s));
    $(".s-total", form).textContent = euro(p.price + shipPrice(p, s));
    placeLabel.textContent = placeLabel.dataset[s.place];
    place.placeholder = s.place === "office" ? "напр. офис „Център“" : "ул. „Иван Вазов“ 12, вх. А, ет. 3";
    place.autocomplete = s.place === "office" ? "off" : "street-address";
  }
  root.addEventListener("change", update);
  update();

  // any "Поръчай" link with data-pkg selects that package before scrolling to the form
  for (const a of $$("[data-pkg]")) {
    a.addEventListener("click", () => {
      const r = $(`input[name="package"][value="${a.dataset.pkg}"]`, root);
      if (r) { r.checked = true; update(); }
    });
  }

  const fieldErr = (name, msg) => {
    const input = $(`[name="${name}"]`, form);
    if (!input) return;
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    const e = input.parentElement.querySelector(".err");
    if (e) e.textContent = msg || "";
  };
  for (const n of ["name", "phone", "city", "place"]) $(`[name="${n}"]`, form).addEventListener("input", () => fieldErr(n, ""));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    data.package = pick("package");
    data.shipping = pick("shipping");
    data.source = root.dataset.source || location.pathname;
    let bad = false;
    const need = { name: [3, "Напиши име и фамилия."], city: [2, "Напиши населеното място."], place: [3, SHIPPING[data.shipping].place === "office" ? "Напиши кой офис." : "Напиши адреса."] };
    for (const [k, [min, msg]] of Object.entries(need)) {
      const ok = (data[k] || "").trim().length >= min;
      fieldErr(k, ok ? "" : msg);
      bad ||= !ok;
    }
    const digits = (data.phone || "").replace(/\D/g, "");
    const phoneOk = digits.length >= 9 && digits.length <= 13;
    fieldErr("phone", phoneOk ? "" : "Провери телефона – например 0888 123 456.");
    bad ||= !phoneOk;
    if (bad) {
      $('[aria-invalid="true"]', form)?.focus();
      return;
    }
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    btn.textContent = "Изпращаме…";
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (out.error && ["name", "phone", "city", "place"].includes(out.error)) fieldErr(out.error, out.message);
        else {
          err.textContent = out.message || "Нещо се обърка. Опитай пак или се обади на 0893 42 52 92.";
          err.hidden = false;
        }
        return;
      }
      $(".form-body", form).hidden = true;
      $(".done-no", form).textContent = out.id ? `Номер на поръчката: №${out.id} · за плащане ${euro(out.total)}` : "";
      $(".done", form).hidden = false;
      $(".done", form).scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    } catch {
      err.textContent = "Няма връзка. Провери интернета и опитай пак.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Поръчай с наложен платеж <span class="arrow">→</span>';
    }
  });
}

for (const y of $$("[data-year]")) y.textContent = new Date().getFullYear();
