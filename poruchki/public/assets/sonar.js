// „Сега в сайтовете“: the circle drawn as a sonar screen – a dark round display with range rings,
// a sweeping beam and every person online as a blip that flares up when the beam passes over it.
// One slice per channel (its colour on the rim), rings from the edge in: browsing, the form, typing.
//
// The beam and the blips are SMIL animations inside the same <svg>: they all run on the svg's own clock,
// so a redraw every 10 s does not restart the sweep, and a blip's flash is timed by its angle (begin = when
// the beam reaches it). With prefers-reduced-motion nothing moves.
import { esc } from "./app.js";

export const CH_COLOR = { meta: "#e8457c", google_ads: "#2fb35a", tiktok: "#18c7c1", search: "#9aa3b2", email: "#5b7cfa", sms: "#22b8d6", viber: "#8b5cf6", calls: "#f2b233", other: "#c9824f", direct: "#6b7280", unknown: "#4b5563" };

const R = 200; // the screen
const T = 5; // one turn of the beam, seconds
const TAIL = 75; // the fading trail behind the beam, degrees
const RINGS = [
  [0.8, "разглеждат"],
  [0.56, "във формата"],
  [0.34, "попълват"],
];
const CORE = 0.25; // the centre disc with the number

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};
const f = (n) => n.toFixed(1);
const pt = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
const arc = (a0, a1, r) => {
  const [x0, y0] = pt(a0, r);
  const [x1, y1] = pt(a1, r);
  return `M ${f(x0)} ${f(y0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
};
const wedge = (a0, a1, r0, r1) => {
  const [x0, y0] = pt(a0, r1);
  const [x1, y1] = pt(a1, r1);
  const [x2, y2] = pt(a1, r0);
  const [x3, y3] = pt(a0, r0);
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return r0 > 0
    ? `M ${f(x0)} ${f(y0)} A ${r1} ${r1} 0 ${big} 1 ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)} A ${r0} ${r0} 0 ${big} 0 ${f(x3)} ${f(y3)} Z`
    : `M 0 0 L ${f(x0)} ${f(y0)} A ${r1} ${r1} 0 ${big} 1 ${f(x1)} ${f(y1)} Z`;
};

const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The parts that never change: the screen, the grid, the beam. */
function scene() {
  const rad = (d) => (d * Math.PI) / 180;
  let ticks = "";
  for (let d = 0; d < 360; d += 5) {
    const long = d % 30 === 0;
    const [x0, y0] = pt(rad(d), R - (long ? 11 : 5));
    const [x1, y1] = pt(rad(d), R - 1);
    ticks += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" class="${long ? "tk l" : "tk"}"/>`;
  }
  // The beam: SVG has no cone gradient, so faint wedges are stacked, all starting at the leading edge and each
  // reaching a little further back – they add up to a smooth fade with no seams.
  const N = 36;
  let beam = "";
  for (let i = 1; i <= N; i++) beam += `<path d="${wedge(rad(-90 - (TAIL * Math.pow(i / N, 1.35))), rad(-90), 0, R)}"/>`;
  const spin = still() ? "" : `<animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="${T}s" begin="0s" repeatCount="indefinite"/>`;
  return `<defs>
      <radialGradient id="snScreen" cx="0" cy="0" r="${R}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#0f3a35"/><stop offset=".55" stop-color="#0a2724"/><stop offset=".92" stop-color="#061714"/><stop offset="1" stop-color="#030c0a"/>
      </radialGradient>
      <radialGradient id="snCore" cx="0" cy="0" r="${R * CORE}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#0d3c34"/><stop offset="1" stop-color="#05140f"/>
      </radialGradient>
      <linearGradient id="snBezel" x1="0" y1="-1" x2="0" y2="1">
        <stop offset="0" class="bz0"/><stop offset="1" class="bz1"/>
      </linearGradient>
      <pattern id="snScan" width="6" height="3" patternUnits="userSpaceOnUse"><rect width="6" height="1" fill="#9fffe0" opacity=".035"/></pattern>
      <filter id="snBlur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3.2"/></filter>
      <filter id="snGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="snLine" filterUnits="userSpaceOnUse" x="${-R}" y="${-R - 10}" width="${2 * R}" height="${2 * R + 20}"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <clipPath id="snClip"><circle r="${R}"/></clipPath>
    </defs>
    <circle r="${R + 5}" class="bezel" fill="none" stroke="url(#snBezel)" stroke-width="10"/>
    <circle r="${R}" fill="url(#snScreen)"/>
    <g id="snSlices"></g>
    <g class="grid" clip-path="url(#snClip)">
      <rect x="${-R}" y="${-R}" width="${2 * R}" height="${2 * R}" fill="url(#snScan)"/>
      <g id="snSpokes"></g>
      ${RINGS.map(([r]) => `<circle r="${f(R * r)}" class="rr"/>`).join("")}
      <circle r="${f(R * 0.68)}" class="rr faint"/><circle r="${f(R * 0.45)}" class="rr faint"/>
      <circle r="${R - 0.5}" class="rr edge"/>
      ${ticks}
      ${RINGS.map(([r, t]) => `<text x="5" y="${f(R * r - 5)}" class="rtag">${t}</text>`).join("")}
    </g>
    <g class="beam" clip-path="url(#snClip)">${spin}
      <g fill="#3df5b0" fill-opacity=".016">${beam}</g>
      <line x1="0" y1="0" x2="0" y2="${-R}" class="lead" filter="url(#snLine)"/>
    </g>
    <g id="snBlips"></g>
    <g class="core">
      <circle r="${f(R * CORE)}" fill="url(#snCore)" class="corering"/>
      <circle r="${f(R * CORE - 6)}" fill="none" class="corering in"/>
      <text y="9" text-anchor="middle" class="rnum" id="snNum" filter="url(#snGlow)">0</text>
      <text y="28" text-anchor="middle" class="rsub">на сайтовете</text>
    </g>
`;
}

/** Draw (or redraw) the sonar in `svg` for these channels and sessions. */
export function sonar(svg, channels, sessions, place, stageLabel) {
  if (!svg.querySelector("#snBlips")) svg.innerHTML = scene();
  const list = channels.filter((c) => c.id !== "unknown");
  const n = list.length || 1;
  const span = (Math.PI * 2) / n;
  const online = sessions.filter((x) => x.online);
  const moving = !still();

  // Slices (under the grid and the blips, so a blip keeps its own hint): a faint wash of the channel's colour,
  // stronger with more people on it, and the channel's arc and name outside the screen.
  let slices = "";
  let spokes = "";
  list.forEach((c, i) => {
    const a0 = -Math.PI / 2 + i * span;
    const a1 = a0 + span;
    const col = CH_COLOR[c.id] || "#888";
    const heat = c.now ? Math.min(0.24, 0.08 + c.now * 0.03) : 0.025;
    const live = c.now || c.orders;
    const [sx0, sy0] = pt(a0, R * CORE);
    const [sx1, sy1] = pt(a0, R);
    spokes += `<line x1="${f(sx0)}" y1="${f(sy0)}" x2="${f(sx1)}" y2="${f(sy1)}" class="sp"/>`;
    const am = a0 + span / 2;
    const [lx, ly] = pt(am, R + 40);
    const anchor = Math.abs(Math.cos(am)) < 0.25 ? "middle" : Math.cos(am) > 0 ? "start" : "end";
    slices += `<g class="slice ${live ? "live" : "idle"}" data-ch="${c.id}">
      <path class="sf" d="${wedge(a0, a1, R * CORE, R)}" fill="${col}" fill-opacity="${heat.toFixed(3)}"/>
      <path d="${wedge(a0, a1, R, R + 30)}" fill="transparent"/>
      <path d="${arc(a0 + 0.05, a1 - 0.05, R + 17)}" fill="none" stroke="${col}" stroke-width="${c.now ? 6 : 4}" stroke-linecap="round" stroke-opacity="${live ? 1 : 0.4}"${c.now ? ` filter="url(#snGlow)"` : ""}/>
      <text x="${f(lx)}" y="${f(ly + 5)}" text-anchor="${anchor}" class="rlab" fill="${col}">${esc(c.label)}${c.now ? ` · ${c.now}` : ""}</text></g>`;
  });
  svg.querySelector("#snSlices").innerHTML = slices;
  svg.querySelector("#snSpokes").innerHTML = spokes;

  // The blips: placed by channel (angle) and how far they got (ring), flashing when the beam hits them.
  let blips = "";
  for (const x of online) {
    const i = Math.max(0, list.findIndex((c) => c.id === x.channel));
    const a = -Math.PI / 2 + i * span + span * (0.14 + 0.72 * hash(x.sid));
    const deep = x.stage === "filling" || x.stage === "ordered";
    const base = deep ? 0.34 : x.stage === "checkout" ? 0.56 : 0.8;
    const r = R * (base + (hash(x.sid + "r") - 0.5) * 0.12);
    const [cx, cy] = pt(a, r);
    const col = CH_COLOR[x.channel] || "#9fffe0";
    const s = deep ? 6.5 : x.stage === "checkout" ? 5.5 : 4.5;
    // When the beam (pointing up at t = 0, turning clockwise) reaches this angle.
    const deg = ((((a * 180) / Math.PI + 90) % 360) + 360) % 360;
    const at = `begin="${((deg / 360) * T).toFixed(2)}s" dur="${T}s" repeatCount="indefinite"`;
    const fx = moving
      ? {
          glow: `<animate attributeName="opacity" values=".85;.45;.18;.18" keyTimes="0;.18;.7;1" ${at}/>`,
          core: `<animate attributeName="opacity" values="1;.85;.55;.55" keyTimes="0;.22;.75;1" ${at}/>`,
          ping: `<animate attributeName="opacity" values=".9;0;0" keyTimes="0;.4;1" ${at}/><animateTransform attributeName="transform" type="scale" values="1;3.6;3.6" keyTimes="0;.4;1" ${at}/>`,
          // Typing in the form: a second, faster heartbeat of its own.
          beat: deep ? `<circle r="${s}" fill="none" stroke="${col}" stroke-width="1.2" opacity="0"><animate attributeName="opacity" values=".7;0" dur="1.4s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" values="1;2.6" dur="1.4s" repeatCount="indefinite"/></circle>` : "",
        }
      : { glow: "", core: "", ping: "", beat: "" };
    blips += `<g class="blip ${esc(x.stage)}" transform="translate(${f(cx)} ${f(cy)})"><title>${esc(`${place(x)} · ${x.shop_label} · ${stageLabel(x.stage)}`)}</title>
      <circle r="${f(s * 2.6)}" fill="${col}" opacity="${moving ? 0.18 : 0.5}" filter="url(#snBlur)">${fx.glow}</circle>
      <circle r="${s}" fill="none" stroke="${col}" stroke-width="1.5" opacity="0">${fx.ping}</circle>${fx.beat}
      <circle r="${s}" fill="${col}" opacity="${moving ? 0.55 : 1}">${fx.core}</circle>
      <circle r="${f(s * 0.42)}" fill="#fff" opacity=".9"/></g>`;
  }
  svg.querySelector("#snBlips").innerHTML = blips;
  svg.querySelector("#snNum").textContent = String(online.length);
  return list;
}
