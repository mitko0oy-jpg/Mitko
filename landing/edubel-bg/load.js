/* Еду БЕЛ · зарежда един блок на edubel.bg в ConvertBuilder.
   В елемента „Код / HTML“ стоят само два реда:
     <div data-edubel="nachalo"></div>
     <script src="https://cdn.jsdelivr.net/gh/mitko0oy-jpg/Mitko@<commit>/landing/edubel-bg/load.js"></script>
   Блокът (landing/edubel-bg/<име>.html) се взима от jsDelivr за commit-а, записан в version.txt на клона
   в GitHub – така нова версия излиза без промяна в ConvertBuilder. Ако version.txt не се зареди,
   се ползва commit-а от адреса на този файл. */
(function () {
  "use strict";
  var me = document.currentScript;
  if (!me) return;
  var REPO = "mitko0oy-jpg/Mitko";
  var POINTER = "https://raw.githubusercontent.com/" + REPO + "/claude/nice-fermi-jth8hl/landing/edubel-bg/version.txt";
  var SHA = /^[0-9a-f]{40}$/;
  var own = /@([0-9a-f]{40})\//.exec(me.src || "");
  var fallback = own ? own[1] : null;

  var host = me.previousElementSibling;
  while (host && !host.hasAttribute("data-edubel")) host = host.previousElementSibling;
  if (!host) host = document.querySelector("[data-edubel]:not([data-eb-on])");
  if (!host || host.hasAttribute("data-eb-on")) return;
  host.setAttribute("data-eb-on", "");
  var page = host.getAttribute("data-edubel") || "";
  if (!/^[a-z0-9-]+$/.test(page)) return;
  if (page !== "menu" && page !== "dolu") host.style.minHeight = "100vh";

  function version() {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 2500);
    return fetch(POINTER, ctl ? { signal: ctl.signal } : {})
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) { t = t.trim(); return SHA.test(t) ? t : fallback; }, function () { return fallback; })
      .then(function (v) { clearTimeout(timer); return v; });
  }

  function block(v) {
    if (!v) return Promise.reject(new Error("no version"));
    return fetch("https://cdn.jsdelivr.net/gh/" + REPO + "@" + v + "/landing/edubel-bg/" + page + ".html")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
  }

  function mount(html) {
    var box = document.createElement("div");
    box.innerHTML = html;
    var scripts = Array.prototype.slice.call(box.querySelectorAll("script"));
    scripts.forEach(function (s) { s.parentNode.removeChild(s); });
    var parent = host.parentNode;
    while (box.firstChild) parent.insertBefore(box.firstChild, host);
    parent.removeChild(host);
    scripts.forEach(function (old) {
      var s = document.createElement("script");
      for (var i = 0; i < old.attributes.length; i++) s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      s.text = old.text;
      parent.insertBefore(s, me);
    });
  }

  function fail() {
    host.style.minHeight = "";
    host.innerHTML = '<p style="max-width:34em;margin:60px auto;padding:0 20px;font:18px/1.5 system-ui,sans-serif;text-align:center;color:#1D2340">' +
      'Страницата не се зареди докрай. <a href="" style="color:#E0561D;font-weight:700">Опитайте отново</a> или поръчайте по телефона: ' +
      '<a href="tel:+359893425292" style="color:#E0561D;font-weight:700;white-space:nowrap">0893 42 52 92</a>.</p>';
  }

  version()
    .then(function (v) { return block(v).catch(function (e) { if (v !== fallback) return block(fallback); throw e; }); })
    .then(mount)
    .catch(fail);
})();
