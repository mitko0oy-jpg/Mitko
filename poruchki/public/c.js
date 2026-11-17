/* Поръчки – незавършени поръчки.
   Сложен на страниците на магазина, праща към платформата какво клиентът е написал във формата за поръчка
   (име, телефон, град, адрес и количката), за да можем да му се обадим, ако не я изпрати.
   Не чете имейл, пароли и данни за плащане. Нищо не променя на страницата. */
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

    var last = "";
    var timer = 0;
    var send = function () {
      var phone = val(FIELDS.phone);
      if (phone.replace(/\D/g, "").length < 9) return;
      var body = JSON.stringify({ sid: sid, name: val(FIELDS.name), phone: phone, city: val(FIELDS.city), address: val(FIELDS.address), cart: cart(), total: total(), page: location.pathname });
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
    document.addEventListener("input", later, true);
    document.addEventListener("change", later, true);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") send();
    });
    window.addEventListener("pagehide", send);
  } catch (e) {}
})();
