/* Поръчки – незавършени поръчки.
   Сложен на страниците на магазина, праща към платформата какво клиентът е написал във формата за поръчка
   (име, телефон, град, адрес и количката), за да можем да му се обадим, ако не я изпрати.
   Помни името, телефона, града и адреса в браузъра на клиента (на сайта на магазина, 90 дни): ако се върне
   до формата и я остави, без да пише, пак става незавършена поръчка с тези данни.
   Не чете имейл, пароли и данни за плащане. Нищо не променя на страницата.
   Не помни нищо, ако браузърът иска „без проследяване“ (Global Privacy Control). */
(function () {
  try {
    var me = document.currentScript;
    if (!me || !window.fetch || !window.JSON) return;
    var api = new URL(me.src).origin + "/api/collect";
    var sid = "";
    try {
      sid = sessionStorage.getItem("pr_sid") || "";
    } catch (e) {}
    if (!/^[a-z0-9]{8,40}$/.test(sid)) {
      sid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 30);
      try {
        sessionStorage.setItem("pr_sid", sid);
      } catch (e) {}
    }
    var FIELDS = {
      name: ["name", "fullName", "firstName"],
      phone: ["shippingPhone", "billingPhone", "phone"],
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
    var cart = function () {
      var tables = document.querySelectorAll(".cart-table");
      for (var i = 0; i < tables.length; i++) {
        var rows = [];
        var kids = tables[i].children;
        for (var j = 0; j < kids.length && rows.length < 10; j++) {
          var t = text(kids[j]);
          if (t) rows.push(t.slice(0, 160));
        }
        if (rows.length) return rows;
      }
      return [];
    };
    var total = function () {
      var el = document.querySelector(".grand-total-wrapper .subtotal-price");
      return el ? text(el).slice(0, 40) : "";
    };

    // What this browser typed before (kept on the shop's own site).
    var KEY = "pr_me";
    var DAYS90 = 90 * 864e5;
    var noTrack = navigator.globalPrivacyControl === true;
    var remembered = function () {
      if (noTrack) return null;
      try {
        var m = JSON.parse(localStorage.getItem(KEY) || "null");
        if (m && typeof m.p === "string" && m.p.replace(/\D/g, "").length >= 9 && Date.now() - m.t < DAYS90) return m;
      } catch (e) {}
      return null;
    };
    var remember = function (name, phone, city, address) {
      if (noTrack) return;
      try {
        localStorage.setItem(KEY, JSON.stringify({ n: name, p: phone, c: city, a: address, t: Date.now() }));
      } catch (e) {}
    };

    // How long the order form (its phone field) has been on screen: a returning visitor counts only if they reached it.
    var phoneField = function () {
      for (var i = 0; i < FIELDS.phone.length; i++) {
        var els = document.getElementsByName(FIELDS.phone[i]);
        if (els.length) return els[0];
      }
      return null;
    };
    var seenMs = 0;
    var seenFrom = 0;
    var seen = function () {
      return seenMs + (seenFrom ? Date.now() - seenFrom : 0);
    };

    var last = "";
    var timer = 0;
    var send = function () {
      var phone = val(FIELDS.phone);
      var data;
      if (phone.replace(/\D/g, "").length >= 9) {
        data = { sid: sid, name: val(FIELDS.name), phone: phone, city: val(FIELDS.city), address: val(FIELDS.address), cart: cart(), total: total(), page: location.pathname };
        remember(data.name, phone, data.city, data.address);
      } else {
        // Nothing typed this time: the visitor we know, if they stayed at the form a few seconds.
        var m = remembered();
        if (!m || seen() < 4000) return;
        data = { sid: sid, name: m.n || "", phone: m.p, city: m.c || "", address: m.a || "", cart: cart(), total: total(), page: location.pathname, known: true };
      }
      var body = JSON.stringify(data);
      if (body === last) return;
      last = body;
      if (navigator.sendBeacon && navigator.sendBeacon(api, new Blob([body], { type: "text/plain" }))) return;
      fetch(api, { method: "POST", body: body, mode: "no-cors", keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain" } }).catch(function () {});
    };
    var later = function (e) {
      if (e.target && WATCH[e.target.name]) {
        clearTimeout(timer);
        timer = setTimeout(send, 2000);
      }
    };
    // Watch the phone field once the page is ready (the form may be lower on the page).
    var watchForm = function () {
      var f = phoneField();
      if (!f || !remembered()) return;
      var onScreen = function (yes) {
        if (yes && !seenFrom) seenFrom = Date.now();
        if (!yes && seenFrom) {
          seenMs += Date.now() - seenFrom;
          seenFrom = 0;
        }
      };
      if (window.IntersectionObserver) {
        new IntersectionObserver(function (es) {
          onScreen(es[es.length - 1].isIntersecting && document.visibilityState === "visible");
        }, { threshold: 0.5 }).observe(f);
      } else onScreen(true);
      // A returning visitor who stays at the form 20 s counts even if the browser never says it was closed.
      var check = setInterval(function () {
        if (seen() >= 20000) {
          clearInterval(check);
          send();
        }
      }, 2000);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchForm);
    else watchForm();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && seenFrom) {
        seenMs += Date.now() - seenFrom;
        seenFrom = 0;
      } else if (document.visibilityState === "visible" && !seenFrom && remembered()) {
        // Back to the tab with the form still on screen.
        var f = phoneField();
        var r = f && f.getBoundingClientRect();
        if (r && r.height && r.top < innerHeight && r.bottom > 0) seenFrom = Date.now();
      }
    });

    document.addEventListener("input", later, true);
    document.addEventListener("change", later, true);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") send();
    });
    window.addEventListener("pagehide", send);
  } catch (e) {}
})();
