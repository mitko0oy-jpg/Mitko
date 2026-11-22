/* Поръчки – незавършени поръчки и „Сега в сайтовете“.
   Сложен на страниците на магазина:
   1) праща към платформата какво клиентът е написал във формата за поръчка (име, телефон, имейл, град, адрес
      и количката), за да можем да му се обадим или пишем, ако не я изпрати;
   2) помни името, телефона, имейла, града и адреса в браузъра на клиента (на сайта на магазина, 90 дни): ако се върне
      до формата и я остави, без да пише, пак става незавършена поръчка с тези данни;
   3) докато страницата е отворена, на ~30 s праща анонимен знак: коя страница, разглежда ли или е във
      формата, телефон или компютър, откъде е дошъл (Facebook, Google…) и от коя реклама (utm_* параметрите).
      Без име и телефон. Помни последния клик от реклама 7 дни (без „без проследяване“).
   Не чете пароли и данни за плащане. Нищо не променя на страницата.
   Не помни нищо дълготрайно, ако браузърът иска „без проследяване“ (Global Privacy Control). */
(function () {
  try {
    var me = document.currentScript;
    if (!me || !window.fetch || !window.JSON) return;
    var api = new URL(me.src).origin + "/api/collect";
    var newId = function () {
      return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 30);
    };
    var noTrack = navigator.globalPrivacyControl === true;
    var store = function (kind, key, value) {
      try {
        var s = kind === "local" ? localStorage : sessionStorage;
        if (value === undefined) return s.getItem(key) || "";
        s.setItem(key, value);
      } catch (e) {}
      return "";
    };
    var ID = /^[a-z0-9]{8,40}$/;
    // One visit = one browser tab.
    var sid = store("session", "pr_sid");
    if (!ID.test(sid)) store("session", "pr_sid", (sid = newId()));
    // The browser (to count people, not visits); only for this tab with "no tracking".
    var vid = noTrack ? sid : store("local", "pr_vid");
    if (!ID.test(vid)) store("local", "pr_vid", (vid = newId()));

    var post = function (data) {
      var body = JSON.stringify(data);
      if (navigator.sendBeacon && navigator.sendBeacon(api, new Blob([body], { type: "text/plain" }))) return;
      fetch(api, { method: "POST", body: body, mode: "no-cors", keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain" } }).catch(function () {});
    };

    // ---------- the ad: utm_* and the click id of this visit, or the last ad click in 7 days ----------
    var utm = null;
    try {
      utm = JSON.parse(store("session", "pr_utm") || "null");
    } catch (e) {}
    if (!utm || typeof utm !== "object") {
      var uq = new URLSearchParams(location.search);
      var pick = { s: "utm_source", m: "utm_medium", c: "utm_campaign", t: "utm_term", n: "utm_content", id: "utm_id" };
      var u = {};
      var any = false;
      for (var pk in pick) {
        var pv = uq.get(pick[pk]);
        if (pv) {
          u[pk] = String(pv).slice(0, 120);
          any = true;
        }
      }
      if (!u.id && uq.get("ad_id")) {
        u.id = String(uq.get("ad_id")).slice(0, 40);
        any = true;
      }
      var ck = uq.get("fbclid") ? "fbclid" : uq.get("gclid") ? "gclid" : uq.get("ttclid") ? "ttclid" : "";
      if (ck) {
        u.ck = ck;
        any = true;
      }
      utm = {};
      if (any) {
        utm = u;
        if (!noTrack) store("local", "pr_utm7", JSON.stringify({ at: Date.now(), u: u }));
      } else if (!noTrack) {
        try {
          var last = JSON.parse(store("local", "pr_utm7") || "null");
          if (last && last.u && Date.now() - last.at < 7 * 86400000) {
            utm = last.u;
            utm.later = true;
          }
        } catch (e) {}
      }
      store("session", "pr_utm", JSON.stringify(utm));
    }
    var utmOut = utm && Object.keys(utm).length ? utm : undefined;

    // ---------- the order form ----------
    var FIELDS = {
      name: ["name", "fullName", "firstName"],
      phone: ["shippingPhone", "billingPhone", "phone"],
      email: ["email", "customerEmail", "shippingEmail", "billingEmail"],
      city: ["shippingCity", "billingCity", "city"],
      address: ["shippingAddress", "billingAddress", "address"],
    };
    var WATCH = {};
    for (var k in FIELDS) for (var i = 0; i < FIELDS[k].length; i++) WATCH[FIELDS[k][i]] = 1;
    var val = function (names) {
      for (var i = 0; i < names.length; i++) {
        var els = document.getElementsByName(names[i]);
        for (var j = 0; j < els.length; j++) {
          var v = String(els[j].value || "").trim();
          if (v) return v.slice(0, 200);
        }
      }
      return "";
    };
    var text = function (el) {
      return String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    };
    // The price without the crossed-out old one (ConvertBuilder: <span class="row-total">€27.90<span class="checkout-old-price">€39.90</span></span>).
    var price = function (el) {
      if (!el) return "";
      var c = el.cloneNode(true);
      var old = c.querySelectorAll(".checkout-old-price, s, del, strike");
      for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
      return String(c.textContent || "").replace(/\s+/g, " ").trim() || text(el);
    };
    // A ConvertBuilder cart row → "Име · бройки · цена на реда"; anything else – the row's text as it is.
    var cartRow = function (row) {
      try {
        var sum = row.querySelector(".row-total");
        var name = row.querySelector(".product-info h4, h4, .product-info .name");
        if (sum && name && text(name)) {
          var q = row.querySelector("input.cart-row-quantity, input[type=number]");
          var qty = Math.max(1, Math.min(99, parseInt((q && q.value) || "1", 10) || 1));
          return text(name).slice(0, 120) + " · " + qty + " · " + price(sum).slice(0, 30);
        }
      } catch (e) {}
      return text(row).slice(0, 160);
    };
    var cart = function () {
      var tables = document.querySelectorAll(".cart-table");
      for (var i = 0; i < tables.length; i++) {
        var rows = [];
        var kids = tables[i].children;
        for (var j = 0; j < kids.length && rows.length < 10; j++) {
          var t = cartRow(kids[j]);
          if (t) rows.push(t);
        }
        if (rows.length) return rows;
      }
      return [];
    };
    var total = function () {
      var el = document.querySelector(".grand-total-wrapper .grand-total") || document.querySelector(".grand-total-wrapper .subtotal-price");
      return el ? price(el).slice(0, 40) : "";
    };
    var phoneField = function () {
      for (var i = 0; i < FIELDS.phone.length; i++) {
        var els = document.getElementsByName(FIELDS.phone[i]);
        if (els.length) return els[0];
      }
      return null;
    };

    // What this browser typed before (kept on the shop's own site).
    var DAYS90 = 90 * 864e5;
    var remembered = function () {
      if (noTrack) return null;
      try {
        var m = JSON.parse(store("local", "pr_me") || "null");
        if (m && ((typeof m.p === "string" && m.p.replace(/\D/g, "").length >= 9) || EMAIL.test(m.e || "")) && Date.now() - m.t < DAYS90) return m;
      } catch (e) {}
      return null;
    };
    var EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i;
    var remember = function (d) {
      if (!noTrack) store("local", "pr_me", JSON.stringify({ n: d.name, p: d.phone, e: d.email, c: d.city, a: d.address, t: Date.now() }));
    };

    // How long the order form (its phone field) has been on screen.
    var onScreen = false;
    var seenMs = 0;
    var seenFrom = 0;
    var seen = function () {
      return seenMs + (seenFrom ? Date.now() - seenFrom : 0);
    };
    var setOnScreen = function (yes) {
      if (yes === onScreen) return;
      onScreen = yes;
      if (yes) seenFrom = Date.now();
      else if (seenFrom) {
        seenMs += Date.now() - seenFrom;
        seenFrom = 0;
      }
      changed();
    };
    var typed = false;

    var lastLead = "";
    var timer = 0;
    var sendLead = function () {
      var phone = val(FIELDS.phone);
      var email = val(FIELDS.email);
      var data;
      if (phone.replace(/\D/g, "").length >= 9 || EMAIL.test(email)) {
        data = { sid: sid, name: val(FIELDS.name), phone: phone, email: EMAIL.test(email) ? email : "", city: val(FIELDS.city), address: val(FIELDS.address), cart: cart(), total: total(), page: location.pathname, utm: utmOut };
        remember(data);
      } else {
        // Nothing typed this time: the visitor we know, if they stayed at the form a few seconds.
        var m = remembered();
        if (!m || seen() < 4000) return;
        data = { sid: sid, name: m.n || "", phone: m.p || "", email: m.e || "", city: m.c || "", address: m.a || "", cart: cart(), total: total(), page: location.pathname, known: true, utm: utmOut };
      }
      var body = JSON.stringify(data);
      if (body === lastLead) return;
      lastLead = body;
      post(data);
    };
    var later = function (e) {
      if (e.target && WATCH[e.target.name]) {
        if (!typed) {
          typed = true;
          changed();
        }
        clearTimeout(timer);
        timer = setTimeout(sendLead, 2000);
      }
    };

    // ---------- Сега в сайтовете: a sign of life while the page is open ----------
    var source = store("session", "pr_src");
    if (!source) {
      var qs = new URLSearchParams(location.search);
      var ref = "";
      try {
        ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
      } catch (e) {}
      if (ref === location.hostname.replace(/^www\./, "")) ref = "";
      source =
        qs.get("fbclid") || /facebook|instagram|fb\.com|fb\.me/.test(ref) || /^(fb|facebook|ig|instagram)/i.test(qs.get("utm_source") || "")
          ? "Facebook / Instagram"
          : qs.get("gclid") || qs.get("gbraid") || qs.get("wbraid")
            ? "Google реклама"
            : qs.get("ttclid") || /tiktok/.test(ref)
              ? "TikTok"
              : qs.get("utm_source")
                ? String(qs.get("utm_source")).slice(0, 40)
                : /google\./.test(ref)
                  ? "Google"
                  : ref
                    ? ref.slice(0, 40)
                    : "Директно";
      store("session", "pr_src", source);
    }
    var device = (function () {
      var w = Math.min(screen.width || 0, screen.height || 0);
      var touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
      return touch ? (w >= 600 ? "tablet" : "mobile") : "desktop";
    })();
    var stage = function () {
      if (/thank|blagodar|благодар|success|uspeshn|успешн/i.test(decodeURIComponent(location.pathname))) return "ordered";
      if (typed) return "filling";
      if (onScreen || /checkout|cart|kolichk|количк/i.test(location.pathname)) return "checkout";
      return "browsing";
    };
    var activeAt = Date.now();
    var lastPing = 0;
    var lastStage = "";
    var ping = function (gone) {
      var st = stage();
      lastStage = st;
      lastPing = Date.now();
      post({ t: "ping", sid: sid, vid: vid, page: location.pathname, stage: st, device: device, source: source, cart: cart().length, value: total(), gone: gone === true, utm: utmOut });
    };
    // Something changed (form on screen, started typing): tell at once, but not more than every 5 s.
    var changed = function () {
      if (document.visibilityState === "visible" && stage() !== lastStage && Date.now() - lastPing > 5000) ping();
    };
    setTimeout(ping, 1500);
    setInterval(function () {
      // Every 30 s while the tab is in front and someone moved in the last 30 minutes.
      if (document.visibilityState === "visible" && Date.now() - activeAt < 30 * 60000) ping();
    }, 30000);
    var moved = function () {
      activeAt = Date.now();
    };
    ["scroll", "click", "keydown", "touchstart", "mousemove"].forEach(function (ev) {
      window.addEventListener(ev, moved, { passive: true, capture: true });
    });

    // Watch the phone field once the page is ready (the form may be lower on the page).
    var watchForm = function () {
      var f = phoneField();
      if (!f) return;
      if (window.IntersectionObserver) {
        new IntersectionObserver(function (es) {
          setOnScreen(es[es.length - 1].isIntersecting && document.visibilityState === "visible");
        }, { threshold: 0.5 }).observe(f);
      } else setOnScreen(true);
      // A returning visitor who stays at the form 20 s counts even if the browser never says it was closed.
      if (remembered()) {
        var check = setInterval(function () {
          if (seen() >= 20000) {
            clearInterval(check);
            sendLead();
          }
        }, 2000);
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchForm);
    else watchForm();

    document.addEventListener("input", later, true);
    document.addEventListener("change", later, true);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        if (seenFrom) {
          seenMs += Date.now() - seenFrom;
          seenFrom = 0;
        }
        sendLead();
        ping(true);
      } else {
        // Back to the tab: the form may still be on screen.
        var f = phoneField();
        var r = f && f.getBoundingClientRect();
        if (onScreen && r && r.height && r.top < innerHeight && r.bottom > 0) seenFrom = Date.now();
        moved();
        ping();
      }
    });
    window.addEventListener("pagehide", function () {
      sendLead();
      ping(true);
    });
  } catch (e) {}
})();
