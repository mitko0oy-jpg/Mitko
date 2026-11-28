/* Чат на сайта на магазина – балонче с автоматичен асистент (OrderDesk).
   На сайта: <script src="https://mitko-poruchki.netlify.app/chat.js" data-shop="<магазин>" defer></script>
   Нищо не зарежда, ако чатът за магазина е изключен. Пише в localStorage само номера на разговора (pr_chat_sid). */
(function () {
  var me = document.currentScript;
  if (!me || window.__odChat) return;
  window.__odChat = true;
  var shop = me.getAttribute("data-shop") || "";
  var base = new URL(me.src).origin;
  var api = base + "/api/chat/s/" + encodeURIComponent(shop);
  if (!/^[a-z0-9-]{1,40}$/i.test(shop)) return;

  var KEY = "pr_chat_sid";
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) {
      return null;
    }
  }
  function newSid() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(36)).slice(-2); }).join("").slice(0, 20);
  }
  var sid = store(KEY);
  if (!sid || !/^[a-z0-9]{8,40}$/i.test(sid)) sid = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rich(t) {
    return esc(t)
      .replace(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, '<a href="mailto:$1">$1</a>')
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, "<br>");
  }

  fetch(api)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) { if (cfg && cfg.enabled) start(cfg); })
    .catch(function () {});

  function start(cfg) {
    var ui = cfg.ui || {};
    var color = /^#[0-9a-f]{6}$/i.test(cfg.color || "") ? cfg.color : "#c8811a";
    var host = document.createElement("div");
    host.setAttribute("data-od-chat", "");
    host.style.cssText = "position:fixed;z-index:2147483000;right:0;bottom:0;width:0;height:0";
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}" +
      ".lnch{position:fixed;right:20px;bottom:20px;display:flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:0 18px 0 14px;height:54px;background:" + color + ";color:#fff;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25)}" +
      ".lnch svg{width:24px;height:24px;flex:none}" +
      ".lnch:focus-visible,.x:focus-visible,.snd:focus-visible{outline:3px solid #222;outline-offset:2px}" +
      ".pnl{position:fixed;right:20px;bottom:20px;width:370px;height:min(560px,calc(100vh - 40px));background:#fff;color:#222;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden}" +
      ".hd{background:" + color + ";color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}" +
      ".hd b{display:block;font-size:16px}.hd small{display:block;font-size:12px;opacity:.9}" +
      ".av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.22);display:grid;place-items:center;flex:none}.av svg{width:20px;height:20px}" +
      ".x{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;width:36px;height:36px;border-radius:8px}" +
      ".nt{font-size:12px;color:#555;background:#f6f4ef;padding:7px 14px;border-bottom:1px solid #eee}" +
      ".ms{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#fff}" +
      ".m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:15px;line-height:1.4;white-space:normal;word-wrap:break-word}" +
      ".m a{color:inherit;text-decoration:underline}" +
      ".m.u{align-self:flex-end;background:" + color + ";color:#fff;border-bottom-right-radius:4px}" +
      ".m.a,.m.h{align-self:flex-start;background:#f1f1f1;border-bottom-left-radius:4px}" +
      ".m.h{background:#e8f1ff}" +
      ".who{font-size:11px;color:#777;margin:0 4px -4px}" +
      ".m.err{background:#fde8e8;color:#8a1c1c}" +
      ".dots{align-self:flex-start;background:#f1f1f1;border-radius:14px;padding:10px 14px}" +
      ".dots i{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:#999;animation:b 1s infinite}" +
      ".dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}" +
      "@keyframes b{0%,80%,100%{opacity:.3}40%{opacity:1}}" +
      "@media (prefers-reduced-motion:reduce){.dots i{animation:none}}" +
      ".ft{display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#fff}" +
      ".in{flex:1;resize:none;border:1px solid #ccc;border-radius:12px;padding:10px 12px;font-size:16px;max-height:110px;min-height:44px;color:#222;background:#fff}" +
      ".in:focus{outline:2px solid " + color + ";border-color:transparent}" +
      ".snd{border:0;border-radius:12px;background:" + color + ";color:#fff;font-weight:600;font-size:15px;padding:0 16px;cursor:pointer;min-height:44px}" +
      ".snd:disabled{opacity:.5;cursor:default}" +
      "[hidden]{display:none!important}" +
      "@media (max-width:640px){.lnch{bottom:84px;right:14px;padding:0 15px}.lnch span{display:none}.pnl{right:0;bottom:0;width:100vw;height:100%;max-height:100dvh;border-radius:0}}" +
      "</style>" +
      '<button class="lnch" type="button" aria-label="' + esc(ui.open || "Chat") + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>' +
      "<span>" + esc(ui.open || "Chat") + "</span></button>" +
      '<section class="pnl" role="dialog" aria-modal="false" aria-label="' + esc(cfg.title || "Chat") + '" hidden>' +
      '<div class="hd"><div class="av"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/></svg></div>' +
      "<div><b>" + esc(cfg.title || "") + "</b><small>" + esc(ui.bot || "") + "</small></div>" +
      '<button class="x" type="button" aria-label="' + esc(ui.close || "×") + '">×</button></div>' +
      '<div class="nt">' + esc(ui.note || "") + "</div>" +
      '<div class="ms" aria-live="polite"></div>' +
      '<form class="ft"><textarea class="in" rows="1" maxlength="1000" aria-label="' + esc(ui.placeholder || "") + '" placeholder="' + esc(ui.placeholder || "") + '"></textarea>' +
      '<button class="snd" type="submit">' + esc(ui.send || "OK") + "</button></form></section>";

    var lnch = root.querySelector(".lnch");
    var pnl = root.querySelector(".pnl");
    var list = root.querySelector(".ms");
    var form = root.querySelector(".ft");
    var input = root.querySelector(".in");
    var btn = root.querySelector(".snd");
    var known = 0; // колко съобщения от сървъра вече са показани
    var busy = false;
    var loaded = false;
    var timer = null;

    function add(m) {
      if (m.r === "h") {
        var w = document.createElement("div");
        w.className = "who";
        w.textContent = ui.human || "";
        list.appendChild(w);
      }
      var d = document.createElement("div");
      d.className = "m " + (m.r === "u" ? "u" : m.r === "h" ? "h" : m.r === "err" ? "err" : "a");
      d.innerHTML = rich(m.t);
      list.appendChild(d);
      list.scrollTop = list.scrollHeight;
      return d;
    }
    add({ r: "a", t: cfg.greeting || "" });

    function poll() {
      if (!sid || busy) return;
      fetch(api + "/m?sid=" + encodeURIComponent(sid) + "&after=" + known)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || busy) return;
          (d.messages || []).forEach(add);
          known = d.total != null ? d.total : known + (d.messages || []).length;
        })
        .catch(function () {});
    }

    function open() {
      pnl.hidden = false;
      lnch.hidden = true;
      if (!loaded) {
        loaded = true;
        poll();
      }
      clearInterval(timer);
      timer = setInterval(function () {
        if (!document.hidden) poll();
      }, 12000);
      setTimeout(function () { input.focus(); }, 30);
    }
    function close() {
      pnl.hidden = true;
      lnch.hidden = false;
      clearInterval(timer);
      lnch.focus();
    }
    lnch.onclick = open;
    root.querySelector(".x").onclick = close;
    pnl.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    function grow() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 110) + "px";
    }
    input.addEventListener("input", grow);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      }
    });
    form.onsubmit = function (e) {
      e.preventDefault();
      send();
    };

    function send() {
      var text = input.value.trim();
      if (!text || busy) return;
      if (!sid) {
        sid = newSid();
        store(KEY, sid);
      }
      busy = true;
      btn.disabled = true;
      input.value = "";
      grow();
      var mine = add({ r: "u", t: text });
      var dots = document.createElement("div");
      dots.className = "dots";
      dots.innerHTML = "<i></i><i></i><i></i>";
      list.appendChild(dots);
      list.scrollTop = list.scrollHeight;
      fetch(api, {
        method: "POST",
        headers: { "content-type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ sid: sid, text: text, page: location.pathname }),
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (d) {
          dots.remove();
          var msgs = d.messages || [];
          if (d.total != null && d.total !== known + msgs.length) {
            // Междувременно е писал и човек от екипа – показваме целия разговор наново.
            list.innerHTML = "";
            add({ r: "a", t: cfg.greeting || "" });
            known = 0;
            busy = false;
            poll();
            return;
          }
          // Първото е нашето съобщение – вече е на екрана.
          msgs.slice(1).forEach(add);
          known += msgs.length;
        })
        .catch(function () {
          dots.remove();
          mine.style.opacity = "0.6";
          add({ r: "err", t: ui.error || "Error" });
          input.value = text;
        })
        .then(function () {
          busy = false;
          btn.disabled = false;
          input.focus();
        });
    }
  }
})();
